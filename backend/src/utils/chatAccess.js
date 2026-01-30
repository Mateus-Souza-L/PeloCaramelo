// backend/src/utils/chatAccess.js
function normalizeStatus(s) {
  return String(s || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase();
}

function canChatForStatus(status) {
  const s = normalizeStatus(status);

  // chat liberado após aceitar (e pode continuar após concluir/finalizar)
  const allowed = new Set(["aceita", "concluida", "finalizada"]);
  return allowed.has(s);
}

function userCanAccessReservationChat({ reservation, user }) {
  if (!reservation || !user) return { ok: false, reason: "missing" };

  const uid = Number(user.id);
  const tutorId = Number(reservation.tutor_id ?? reservation.tutorId);
  const caregiverId = Number(reservation.caregiver_id ?? reservation.caregiverId);

  const isOwner = Number.isFinite(uid) && (uid === tutorId || uid === caregiverId);
  const isAdmin = user.role === "admin";

  if (!isOwner && !isAdmin) return { ok: false, reason: "not_owner" };

  const status = reservation.status;
  if (!canChatForStatus(status)) return { ok: false, reason: "status_blocked", status };

  return { ok: true };
}

module.exports = { normalizeStatus, canChatForStatus, userCanAccessReservationChat };
