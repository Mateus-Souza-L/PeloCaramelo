// src/utils/reservationNotifs.js

const KEY = "reservationNotifications";

function safeParse(raw, fallback) {
  try {
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function readAll() {
  const raw = localStorage.getItem(KEY);
  const list = safeParse(raw || "[]", []);
  return Array.isArray(list) ? list : [];
}

function writeAll(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
  // Mantém compat com listeners atuais
  window.dispatchEvent(new CustomEvent("reservation-notifications-changed"));
  // E também dispara "storage" para quem usa esse evento como gatilho
  window.dispatchEvent(new Event("storage"));
}

function makeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeUserId(n) {
  // Aceita userId (legado) ou targetUserId (novo)
  return n?.userId ?? n?.targetUserId ?? null;
}

function cleanReason(reason) {
  const r = typeof reason === "string" ? reason.trim() : "";
  return r ? r : null;
}

// Evita flood: não duplica notificação idêntica ainda não lida
function hasSameUnread(all, { userId, reservationId, type, reason, meta }) {
  const u = String(userId);
  const r = String(reservationId);
  const t = String(type || "reservation_update");
  const rs = reason == null ? null : String(reason);

  return all.some((n) => {
    if (n?.read === true) return false;
    if (String(n.userId) !== u) return false;
    if (String(n.reservationId) !== r) return false;
    if (String(n.type || "reservation_update") !== t) return false;

    const nReason = n.reason == null ? null : String(n.reason);
    if (nReason !== rs) return false;

    // Para rating_received, compara também o "meta" básico (nota/role) se existir
    if (t === "rating_received") {
      const a = n?.meta || null;
      const b = meta || null;
      const aRating = a?.rating != null ? Number(a.rating) : null;
      const bRating = b?.rating != null ? Number(b.rating) : null;
      const aFrom = a?.fromRole ? String(a.fromRole) : null;
      const bFrom = b?.fromRole ? String(b.fromRole) : null;
      return aRating === bRating && aFrom === bFrom;
    }

    return true;
  });
}

export function getUnreadReservationNotifs(userId) {
  if (!userId) return [];
  const all = readAll();
  return all.filter(
    (n) => String(n.userId) === String(userId) && n.read !== true
  );
}

// ✅ usado no Navbar/Dashboard
export function getUnreadReservationNotifsCount(userId) {
  return getUnreadReservationNotifs(userId).length;
}

export function markReservationNotifsRead(userId, reservationId) {
  if (!userId || !reservationId) return;

  const all = readAll();
  let changed = false;

  const next = all.map((n) => {
    const sameUser = String(n.userId) === String(userId);
    const sameRes = String(n.reservationId) === String(reservationId);
    if (sameUser && sameRes && n.read !== true) {
      changed = true;
      return { ...n, read: true };
    }
    return n;
  });

  if (changed) writeAll(next);
}

// ✅ compat (Navbar antigo): mantém
export function loadReservationNotifs(userId) {
  if (!userId) return [];
  const all = readAll();
  return all.filter((n) => String(n.userId) === String(userId));
}

export function addReservationNotif({ userId, reservationId, type, reason, meta }) {
  if (!userId || !reservationId) return;

  const notif = {
    id: makeId(),
    userId: String(userId),
    reservationId: String(reservationId),
    type: type || "reservation_update",
    reason: cleanReason(reason), // opcional (texto curto)
    meta: meta && typeof meta === "object" ? meta : null, // opcional (dados extras)
    read: false,
    createdAt: Date.now(),
  };

  const all = readAll();

  // ✅ evita duplicar a mesma notificação ainda não lida
  if (hasSameUnread(all, notif)) return;

  writeAll([notif, ...all]);
}

// ✅ Opção 1: recusa com motivo (para o tutor)
export function addReservationRejectedNotif({ userId, reservationId, reason }) {
  return addReservationNotif({
    userId,
    reservationId,
    type: "reservation_rejected",
    reason,
  });
}

/**
 * ✅ NOVO: notificação ao RECEBER avaliação
 * targetUserId = usuário que recebeu a avaliação
 * fromRole = "tutor" ou "caregiver" (quem avaliou)
 */
export function addRatingReceivedNotif({
  targetUserId,
  reservationId,
  fromRole,
  rating,
  review,
}) {
  if (!targetUserId || !reservationId) return;

  const r = Number(rating);
  const stars = Number.isFinite(r) ? `⭐ ${r}/5` : "⭐ Nova avaliação";

  const shortReview =
    typeof review === "string" && review.trim()
      ? review.trim().slice(0, 80)
      : null;

  const reason = shortReview ? `${stars} — "${shortReview}"` : stars;

  return addReservationNotif({
    userId: targetUserId,
    reservationId,
    type: "rating_received",
    reason,
    meta: {
      fromRole: fromRole ? String(fromRole) : null,
      rating: Number.isFinite(r) ? r : null,
      review: shortReview,
    },
  });
}

/**
 * ✅ compat + Navbar atual:
 * - appendReservationNotifs(arrayDeEventos)
 * - appendReservationNotifs(eventoObjeto)
 * - appendReservationNotifs(userId, reservationId)  (legado)
 */
export function appendReservationNotifs(a, b) {
  // Caso 1: array (Navbar novo)
  if (Array.isArray(a)) {
    for (const ev of a) {
      const userId = normalizeUserId(ev);
      const reservationId = ev?.reservationId ?? ev?.reservation_id ?? b;
      const type = ev?.type || "reservation_update";
      const reason = ev?.reason ?? ev?.rejectReason ?? null;
      const meta = ev?.meta ?? null;

      if (userId && reservationId) {
        addReservationNotif({ userId, reservationId, type, reason, meta });
      }
    }
    return;
  }

  // Caso 2: objeto único
  if (typeof a === "object" && a) {
    const userId = normalizeUserId(a);
    const reservationId = a?.reservationId ?? a?.reservation_id ?? b;
    const type = a?.type || "reservation_update";
    const reason = a?.reason ?? a?.rejectReason ?? null;
    const meta = a?.meta ?? null;

    if (userId && reservationId) {
      addReservationNotif({ userId, reservationId, type, reason, meta });
    }
    return;
  }

  // Caso 3: legado (userId, reservationId)
  return addReservationNotif({
    userId: a,
    reservationId: b,
    type: "reservation_update",
  });
}
