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
  // prioridade: lida > entregue > enviada
  if (row.read_at) return "read";
  if (row.delivered_at) return "delivered";
  if (row.is_read === true) return "read"; // compat legado
  return undefined;
}

/**
 * Cria uma nova mensagem no chat.
 * Schema atual + novos campos:
 * chat_messages_table(reservation_id, sender_id, receiver_id, message, created_at, is_read, delivered_at, read_at)
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
 * Lista todas as mensagens associadas a uma reserva.
 * (SELECT via VIEW "messages" que espelha a tabela real e expõe delivered_at/read_at)
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
 * Marca como LIDAS todas as mensagens dessa reserva
 * cujo destinatário é o usuário logado.
 *
 * Compat:
 * - seta is_read = TRUE
 * - seta read_at = NOW() (se ainda não setado)
 *
 * UPDATE na TABELA REAL
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
 * Marca uma mensagem como "ENTREGUE" (ACK do destinatário).
 * Regras:
 * - só o destinatário pode marcar entregue
 * - só marca uma vez (delivered_at IS NULL)
 *
 * UPDATE na TABELA REAL
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
 * Lista IDs de reservas que têm mensagem NÃO lida para esse usuário.
 *
 * Compat:
 * - considera read_at (novo) e is_read (legado)
 *
 * SELECT via VIEW "messages"
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
};
