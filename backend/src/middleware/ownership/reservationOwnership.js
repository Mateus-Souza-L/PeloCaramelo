// backend/src/middleware/ownership/reservationOwnership.js
const pool = require("../../config/db");

// ---------- helpers ----------
function toStr(v) {
  return v == null ? "" : String(v);
}

function toPosInt(v) {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i <= 0) return null;
  return i;
}

/**
 * Carrega participantes da reserva (tutor_id / caregiver_id).
 * Retorna null se não existir.
 */
async function getReservationParticipants(reservationId) {
  const id = toPosInt(reservationId);
  if (!id) return null;

  const sql = `
    SELECT
      id,
      tutor_id,
      caregiver_id,
      status,
      start_date,
      end_date
    FROM reservations
    WHERE id = $1
    LIMIT 1
  `;

  const { rows } = await pool.query(sql, [id]);
  return rows?.[0] || null;
}

/**
 * Ownership middleware:
 * - admin/admin_master sempre passa
 * - tutor/caregiver só se forem participantes da reserva
 * - 404 se a reserva não existir
 *
 * Anexa:
 * - req.reservation (dados básicos da reserva)
 * - req.reservationId (id normalizado)
 * - req.reservationOwnership { isTutor, isCaregiver, isAdmin }
 */
async function mustBeReservationParticipant(req, res, next) {
  try {
    const userId = toStr(req.user?.id).trim();
    const roleRaw = toStr(req.user?.role).trim();
    const role = roleRaw.toLowerCase();

    if (!userId || !role) {
      return res.status(401).json({
        error: "Não autenticado. Faça login novamente.",
        code: "UNAUTHENTICATED",
      });
    }

    const reservationIdRaw =
      req.params?.id ?? req.params?.reservationId ?? req.params?.resId ?? null;

    const reservationId = toPosInt(reservationIdRaw);
    if (!reservationId) {
      return res.status(400).json({
        error: "ID da reserva inválido.",
        code: "INVALID_RESERVATION_ID",
      });
    }

    const row = await getReservationParticipants(reservationId);

    if (!row) {
      return res.status(404).json({
        error: "Reserva não encontrada.",
        code: "RESERVATION_NOT_FOUND",
      });
    }

    const isAdmin = role === "admin" || role === "admin_master";
    if (isAdmin) {
      req.reservationId = reservationId;
      req.reservation = row;
      req.reservationOwnership = { isTutor: false, isCaregiver: false, isAdmin: true };
      return next();
    }

    const tutorId = toStr(row.tutor_id).trim();
    const caregiverId = toStr(row.caregiver_id).trim();

    const isTutor = !!tutorId && tutorId === userId;
    const isCaregiver = !!caregiverId && caregiverId === userId;

    if (!isTutor && !isCaregiver) {
      return res.status(403).json({
        error: "Você não tem permissão para acessar esta reserva.",
        code: "FORBIDDEN_OWNERSHIP",
      });
    }

    req.reservationId = reservationId;
    req.reservation = row;
    req.reservationOwnership = { isTutor, isCaregiver, isAdmin: false };

    return next();
  } catch (err) {
    console.error("[OWNERSHIP] Erro ao validar reserva:", err);
    return res.status(500).json({
      error: "Erro interno ao validar permissão da reserva.",
      code: "OWNERSHIP_CHECK_FAILED",
    });
  }
}

module.exports = {
  mustBeReservationParticipant,
  getReservationParticipants,
};
