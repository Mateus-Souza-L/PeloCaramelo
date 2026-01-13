// backend/src/models/chatModel.js
const pool = require("../config/db");

function toIntId(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Cria uma nova mensagem no chat.
 * Usa o schema REAL do banco:
 * chat_messages(reservation_id, sender_id, receiver_id, message, created_at, is_read)
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
    INSERT INTO chat_messages (
      reservation_id,
      sender_id,
      receiver_id,
      message,
      created_at,
      is_read
    )
    VALUES ($1, $2, $3, $4, NOW(), FALSE)
    RETURNING
      id,
      reservation_id,
      sender_id,
      receiver_id,
      message,
      created_at,
      is_read;
  `;

  const values = [rid, fromId, toId, msg];
  const result = await pool.query(query, values);
  return result.rows[0] || null;
}

/**
 * Lista todas as mensagens associadas a uma reserva.
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
      is_read
    FROM chat_messages
    WHERE reservation_id = $1
    ORDER BY created_at ASC;
  `;

  const result = await pool.query(query, [rid]);
  return result.rows || [];
}

/**
 * Marca como LIDAS todas as mensagens dessa reserva
 * cujo destinatário é o usuário logado.
 *
 * No seu schema é: receiver_id + is_read
 */
async function markMessagesAsRead({ reservationId, userId }) {
  const rid = toIntId(reservationId);
  const uid = toIntId(userId);

  if (rid == null) throw new Error("reservationId inválido.");
  if (uid == null) throw new Error("userId inválido.");

  const result = await pool.query(
    `
    UPDATE chat_messages
    SET is_read = TRUE
    WHERE reservation_id = $1
      AND receiver_id = $2
      AND (is_read IS NULL OR is_read = FALSE)
    `,
    [rid, uid]
  );

  return result.rowCount || 0;
}

/**
 * Lista IDs de reservas que têm mensagem NÃO lida para esse usuário.
 *
 * No seu schema é: receiver_id + is_read
 */
async function listUnreadReservationsByUser(userId) {
  const uid = toIntId(userId);
  if (uid == null) throw new Error("userId inválido.");

  const result = await pool.query(
    `
    SELECT DISTINCT reservation_id
    FROM chat_messages
    WHERE receiver_id = $1
      AND (is_read IS NULL OR is_read = FALSE)
    ORDER BY reservation_id DESC;
    `,
    [uid]
  );

  // devolve string porque o front já trabalha com ids como string
  return (result.rows || []).map((row) => String(row.reservation_id));
}

module.exports = {
  createChatMessage,
  listChatMessagesByReservation,
  markMessagesAsRead,
  listUnreadReservationsByUser,
};
