// backend/src/models/chatModel.js
const pool = require("../config/db");

function toIntId(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Cria uma nova mensagem no chat.
 * Retorna a linha criada.
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
    INSERT INTO messages (
      reservation_id,
      from_user_id,
      to_user_id,
      message,
      created_at,
      read_at
    )
    VALUES ($1, $2, $3, $4, NOW(), NULL)
    RETURNING
      id,
      reservation_id,
      from_user_id,
      to_user_id,
      message,
      created_at,
      read_at;
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
      from_user_id,
      to_user_id,
      message,
      created_at,
      read_at
    FROM messages
    WHERE reservation_id = $1
    ORDER BY created_at ASC;
  `;

  const result = await pool.query(query, [rid]);
  return result.rows || [];
}

/**
 * Marca como LIDAS todas as mensagens dessa reserva
 * cujo destinatário é o usuário logado.
 * Retorna quantas linhas foram atualizadas.
 */
async function markMessagesAsRead({ reservationId, userId }) {
  const rid = toIntId(reservationId);
  const uid = toIntId(userId);

  if (rid == null) throw new Error("reservationId inválido.");
  if (uid == null) throw new Error("userId inválido.");

  const result = await pool.query(
    `
    UPDATE chat_messages
    SET read_at = NOW()
    WHERE reservation_id = $1
      AND to_user_id = $2
      AND read_at IS NULL
    `,
    [rid, uid]
  );

  return result.rowCount || 0;
}

/**
 * Lista IDs de reservas que têm mensagem NÃO lida para esse usuário.
 */
async function listUnreadReservationsByUser(userId) {
  const uid = toIntId(userId);
  if (uid == null) throw new Error("userId inválido.");

  const result = await pool.query(
    `
    SELECT DISTINCT reservation_id
    FROM messages
    WHERE to_user_id = $1
      AND read_at IS NULL
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
