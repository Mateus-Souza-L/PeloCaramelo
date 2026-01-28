// backend/src/models/chatModel.js
const pool = require("../config/db");

/**
 * IMPORTANTE (Supabase):
 * - chat_messages         -> VIEW
 * - messages              -> VIEW
 * - chat_messages_table   -> TABELA REAL (onde INSERT/UPDATE devem acontecer)
 *
 * Regra:
 * - INSERT/UPDATE -> chat_messages_table
 * - SELECT        -> messages (view atualizada com delivered_at/read_at)
 */

function toIntId(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function computeStatus(row) {
  if (!row) return undefined;
  if (row.read_at) return "read";
  if (row.delivered_at) return "delivered";
  if (row.is_read === true) return "read"; // compat legado
  return undefined;
}

/* ===========================================================
   EMAIL THROTTLE (anti-spam)
   =========================================================== */

// fallback in-memory (não é perfeito em múltiplas instâncias, mas não quebra prod)
const memThrottle = new Map(); // key -> lastSentMs

function throttleKey(reservationId, toUserId) {
  return `${String(reservationId)}:${String(toUserId)}`;
}

function getCooldownMs() {
  const raw = Number(process.env.CHAT_EMAIL_COOLDOWN_MINUTES || 15);
  const mins = Number.isFinite(raw) && raw > 0 ? raw : 15;
  return mins * 60 * 1000;
}

function isMissingRelationError(err) {
  const msg = String(err?.message || "");
  // postgres: "relation \"...\" does not exist"
  return msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

/**
 * Decide se pode enviar e-mail (cooldown).
 * Preferência: tabela chat_email_throttle.
 * Se a tabela não existir, usa fallback in-memory.
 */
async function shouldSendChatEmailThrottle({ reservationId, toUserId }) {
  const rid = toIntId(reservationId);
  const uid = toIntId(toUserId);
  if (rid == null || uid == null) return false;

  const cooldownMs = getCooldownMs();
  const now = Date.now();
  const key = throttleKey(rid, uid);

  // 1) tenta via DB
  try {
    const { rows } = await pool.query(
      `
      SELECT last_sent_at
      FROM public.chat_email_throttle
      WHERE reservation_id = $1 AND user_id = $2
      LIMIT 1
      `,
      [rid, uid]
    );

    const row = rows?.[0] || null;
    if (!row?.last_sent_at) return true;

    const last = new Date(row.last_sent_at).getTime();
    if (!Number.isFinite(last)) return true;

    return now - last >= cooldownMs;
  } catch (err) {
    // 2) fallback in-memory se a tabela não existe (ou em dev)
    if (!isMissingRelationError(err)) {
      console.error("[chat_email_throttle] erro ao consultar throttle:", err);
    }
    const last = memThrottle.get(key);
    if (!last) return true;
    return now - last >= cooldownMs;
  }
}

/**
 * Atualiza o throttle após enviar e-mail.
 */
async function touchChatEmailThrottle({ reservationId, toUserId }) {
  const rid = toIntId(reservationId);
  const uid = toIntId(toUserId);
  if (rid == null || uid == null) return;

  const now = Date.now();
  const key = throttleKey(rid, uid);

  // 1) tenta persistir no DB (recomendado)
  try {
    await pool.query(
      `
      INSERT INTO public.chat_email_throttle (reservation_id, user_id, last_sent_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (reservation_id, user_id)
      DO UPDATE SET last_sent_at = EXCLUDED.last_sent_at
      `,
      [rid, uid]
    );
    // também atualiza memória (ok)
    memThrottle.set(key, now);
  } catch (err) {
    if (!isMissingRelationError(err)) {
      console.error("[chat_email_throttle] erro ao gravar throttle:", err);
    }
    // 2) fallback in-memory
    memThrottle.set(key, now);
  }
}

/**
 * Cria uma nova mensagem no chat.
 */
async function createChatMessage({ reservationId, fromUserId, toUserId, message }) {
  const rid = toIntId(reservationId);
  const fromId = toIntId(fromUserId);
  const toId = toIntId(toUserId);

  if (rid == null) throw new Error("reservationId inválido.");
  if (fromId == null) throw new Error("fromUserId inválido.");
  if (toId == null) throw new Error("toUserId inválido.");

  const msg = String(message ?? "").trim();
  if (!msg) throw new Error("message inválida.");

  const query = `
    INSERT INTO public.chat_messages_table (
      reservation_id,
      sender_id,
      receiver_id,
      message,
      created_at,
      is_read,
      delivered_at,
      read_at
    )
    VALUES ($1, $2, $3, $4, NOW(), FALSE, NULL, NULL)
    RETURNING
      id,
      reservation_id,
      sender_id,
      receiver_id,
      message,
      created_at,
      is_read,
      delivered_at,
      read_at;
  `;

  const values = [rid, fromId, toId, msg];
  const result = await pool.query(query, values);

  const row = result.rows[0] || null;
  if (!row) return null;

  return { ...row, status: computeStatus(row) };
}

/**
 * Lista mensagens via VIEW "messages"
 */
async function listChatMessagesByReservation(reservationId) {
  const rid = toIntId(reservationId);
  if (rid == null) throw new Error("reservationId inválido.");

  const query = `
    SELECT
      id,
      reservation_id,
      sender_id,
      receiver_id,
      message,
      created_at,
      is_read,
      delivered_at,
      read_at
    FROM public.messages
    WHERE reservation_id = $1
    ORDER BY created_at ASC;
  `;

  const result = await pool.query(query, [rid]);
  const rows = result.rows || [];
  return rows.map((r) => ({ ...r, status: computeStatus(r) }));
}

/**
 * Marca como lidas (UPDATE na tabela real)
 */
async function markMessagesAsRead({ reservationId, userId }) {
  const rid = toIntId(reservationId);
  const uid = toIntId(userId);

  if (rid == null) throw new Error("reservationId inválido.");
  if (uid == null) throw new Error("userId inválido.");

  const result = await pool.query(
    `
    UPDATE public.chat_messages_table
    SET
      is_read = TRUE,
      read_at = COALESCE(read_at, NOW())
    WHERE reservation_id = $1
      AND receiver_id = $2
      AND (
        (read_at IS NULL)
        OR (is_read IS NULL OR is_read = FALSE)
      )
    `,
    [rid, uid]
  );

  return result.rowCount || 0;
}

/**
 * Marca como entregue
 */
async function markMessageAsDelivered({ reservationId, messageId, userId }) {
  const rid = toIntId(reservationId);
  const mid = toIntId(messageId);
  const uid = toIntId(userId);

  if (rid == null) throw new Error("reservationId inválido.");
  if (mid == null) throw new Error("messageId inválido.");
  if (uid == null) throw new Error("userId inválido.");

  const result = await pool.query(
    `
    UPDATE public.chat_messages_table
    SET delivered_at = COALESCE(delivered_at, NOW())
    WHERE id = $1
      AND reservation_id = $2
      AND receiver_id = $3
      AND delivered_at IS NULL
    `,
    [mid, rid, uid]
  );

  return result.rowCount || 0;
}

/**
 * Lista reservas com mensagens não lidas via VIEW
 */
async function listUnreadReservationsByUser(userId) {
  const uid = toIntId(userId);
  if (uid == null) throw new Error("userId inválido.");

  const result = await pool.query(
    `
    SELECT DISTINCT reservation_id
    FROM public.messages
    WHERE receiver_id = $1
      AND (read_at IS NULL)
      AND (is_read IS NULL OR is_read = FALSE)
    ORDER BY reservation_id DESC;
    `,
    [uid]
  );

  return (result.rows || []).map((row) => String(row.reservation_id));
}

module.exports = {
  createChatMessage,
  listChatMessagesByReservation,
  markMessagesAsRead,
  markMessageAsDelivered,
  listUnreadReservationsByUser,

  // ✅ novos exports
  shouldSendChatEmailThrottle,
  touchChatEmailThrottle,
};
