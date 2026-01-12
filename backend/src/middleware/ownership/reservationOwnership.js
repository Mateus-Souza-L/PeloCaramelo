// backend/src/middleware/ownership/reservationOwnership.js
const pool = require("../../config/db");

// ---------- helpers ----------
function toStr(v) {
  return v == null ? "" : String(v);
}

function toInt(v) {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i <= 0) return null; // ids válidos começam em 1
  return i;
}

/**
 * Carrega participantes da reserva (tutor_id / caregiver_id).
 * Retorna null se não existir.
 */
async function getReservationParticipants(reservationId) {
  const id = toInt(reservationId);
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
 * ✅ Ownership middleware:
 * - admin sempre passa
 * - tutor/caregiver só se forem participantes da reserva
 * - 404 se não existe
 *
 * Anexa:
 * - req.reservation (dados básicos da reserva)
 * - req.reservationOwnership { isTutor, isCaregiver, isAdmin }
 */
async function mustBeReservationParticipant(req, res, next) {
  try {
    const userId = toStr(req.user?.id);
    const role = toStr(req.user?.role);

    if (!userId || !role) {
      return res.status(401).json({
        error: "Não autenticado. Faça login novamente.",
        code: "UNAUTHENTICATED",
      });
    }

    const reservationId = req.params?.id ?? req.params?.reservationId;

    // ✅ carrega a reserva sempre (inclusive para admin)
    // isso não muda regra, só padroniza req.reservation e permite 404 aqui mesmo
    const row = await getReservationParticipants(reservationId);

    if (!row) {
      return res.status(404).json({
        error: "Reserva não encontrada.",
        code: "RESERVATION_NOT_FOUND",
      });
    }

    // admin pode tudo aqui (as regras de negócio ficam no controller)
    if (role === "admin") {
      req.reservation = row;
      req.reservationOwnership = { isTutor: false, isCaregiver: false, isAdmin: true };
      return next();
    }

    const tutorId = toStr(row.tutor_id);
    const caregiverId = toStr(row.caregiver_id);

    const isTutor = tutorId && tutorId === userId;
    const isCaregiver = caregiverId && caregiverId === userId;

    if (!isTutor && !isCaregiver) {
      return res.status(403).json({
        error: "Você não tem permissão para acessar esta reserva.",
        code: "FORBIDDEN_OWNERSHIP",
      });
    }

    // ✅ ajuda controllers sem buscar de novo
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
  // exporto também pra uso futuro (se quiser)
  getReservationParticipants,
};
