// backend/src/models/notificationModel.js
const pool = require("../config/db");

function toStr(v) {
  return v == null ? null : String(v);
}

function toIntId(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Cria uma notificação
 */
async function createReservationNotification({
  userId,
  reservationId,
  type,
  payload = {},
}) {
  const uid = toStr(userId);
  const rid = toIntId(reservationId);
  const t = toStr(type);

  if (!uid) throw new Error("userId inválido");
  if (rid == null) throw new Error("reservationId inválido");
  if (!t) throw new Error("type inválido");

  const { rows } = await pool.query(
    `
    INSERT INTO reservation_notifications
      (user_id, reservation_id, type, payload)
    VALUES ($1, $2, $3, $4)
    RETURNING *
    `,
    [uid, rid, t, payload]
  );

  return rows[0] || null;
}

async function listUnreadNotifications(userId, limit = 50) {
  const uid = toStr(userId);
  if (!uid) throw new Error("userId inválido");

  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);

  const { rows } = await pool.query(
    `
    SELECT *
    FROM reservation_notifications
    WHERE user_id = $1
      AND read_at IS NULL
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [uid, lim]
  );

  return rows || [];
}

async function countUnreadNotifications(userId) {
  const uid = toStr(userId);
  if (!uid) throw new Error("userId inválido");

  const { rows } = await pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM reservation_notifications
    WHERE user_id = $1
      AND read_at IS NULL
    `,
    [uid]
  );

  return rows[0]?.count || 0;
}

async function markNotificationRead({ userId, notificationId }) {
  const uid = toStr(userId);
  const nid = toIntId(notificationId);

  if (!uid || nid == null) throw new Error("dados inválidos");

  const { rowCount } = await pool.query(
    `
    UPDATE reservation_notifications
    SET read_at = NOW()
    WHERE id = $1
      AND user_id = $2
      AND read_at IS NULL
    `,
    [nid, uid]
  );

  return rowCount;
}

async function markAllRead(userId) {
  const uid = toStr(userId);
  if (!uid) throw new Error("userId inválido");

  const { rowCount } = await pool.query(
    `
    UPDATE reservation_notifications
    SET read_at = NOW()
    WHERE user_id = $1
      AND read_at IS NULL
    `,
    [uid]
  );

  return rowCount;
}

module.exports = {
  createReservationNotification,
  listUnreadNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllRead,
};
