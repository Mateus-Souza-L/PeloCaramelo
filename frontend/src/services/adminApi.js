// frontend/src/services/adminApi.js
import { authRequest } from "./api";

/* ===================== helpers ===================== */

function buildQS(base = {}) {
  const qs = new URLSearchParams();
  Object.entries(base).forEach(([k, v]) => qs.set(k, String(v)));

  return {
    qs,
    toString() {
      const s = qs.toString();
      return s ? `?${s}` : "";
    },
  };
}

/* ===================== USERS ===================== */

export async function adminListUsers(
  token,
  { limit = 50, offset = 0, role = null, blocked = null, q = "" } = {}
) {
  const { qs, toString } = buildQS({ limit, offset });

  if (role) qs.set("role", String(role));
  if (blocked === true) qs.set("blocked", "true");
  if (blocked === false) qs.set("blocked", "false");
  if (q && String(q).trim()) qs.set("q", String(q).trim());

  return authRequest(`/admin/users${toString()}`, token, { method: "GET" });
}

export async function adminSetUserBlocked(token, userId, { blocked, reason, duration_type = null, duration_days = null, blocked_until = null } = {}) {
  return authRequest(`/admin/users/${userId}/block`, token, {
    method: "PATCH",
    body: { blocked, reason, duration_type, duration_days, blocked_until },
  });
}

export async function adminDeleteUser(token, userId) {
  return authRequest(`/admin/users/${userId}`, token, { method: "DELETE" });
}

export async function adminSetUserRole(token, userId, role) {
  return authRequest(`/admin/users/${userId}/role`, token, {
    method: "PATCH",
    body: { role },
  });
}

/* ===================== RESERVATIONS ===================== */

export async function adminListReservations(
  token,
  { limit = 50, offset = 0, status = null, service = null, q = "" } = {}
) {
  const { qs, toString } = buildQS({ limit, offset });

  if (status) qs.set("status", String(status));
  if (service) qs.set("service", String(service));
  if (q && String(q).trim()) qs.set("q", String(q).trim());

  return authRequest(`/admin/reservations${toString()}`, token, { method: "GET" });
}

export async function adminDeleteReservation(token, reservationId) {
  return authRequest(`/admin/reservations/${reservationId}`, token, {
    method: "DELETE",
  });
}

/* ===================== AUDIT LOGS ===================== */

export async function adminListAuditLogs(token, { limit = 50, offset = 0 } = {}) {
  const { toString } = buildQS({ limit, offset });
  return authRequest(`/admin/audit-logs${toString()}`, token, { method: "GET" });
}

/* ===================== REVIEWS ===================== */

export async function adminListReviews(
  token,
  { limit = 200, offset = 0, hidden = null, rating = null } = {}
) {
  const { qs, toString } = buildQS({ limit, offset });

  if (hidden === true) qs.set("hidden", "true");
  if (hidden === false) qs.set("hidden", "false");
  if (rating != null) qs.set("rating", String(rating));

  return authRequest(`/admin/reviews${toString()}`, token, { method: "GET" });
}

export async function adminHideReview(token, reviewId, { reason } = {}) {
  return authRequest(`/admin/reviews/${reviewId}/hide`, token, {
    method: "PATCH",
    body: { reason },
  });
}

export async function adminUnhideReview(token, reviewId) {
  return authRequest(`/admin/reviews/${reviewId}/unhide`, token, {
    method: "PATCH",
  });
}

/* ===================== REPORTS (denúncias) ===================== */

export async function adminListReports(
  token,
  { limit = 50, offset = 0, status = null, reason = null, q = "" } = {}
) {
  const { qs, toString } = buildQS({ limit, offset });

  if (status) qs.set("status", String(status));
  if (reason) qs.set("reason", String(reason));
  if (q && String(q).trim()) qs.set("q", String(q).trim());

  return authRequest(`/admin/reports${toString()}`, token, { method: "GET" });
}

export async function adminUpdateReportStatus(
  token,
  reportId,
  { status, admin_note = null } = {}
) {
  return authRequest(`/admin/reports/${reportId}/status`, token, {
    method: "PATCH",
    body: { status, admin_note },
  });
}
