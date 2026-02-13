// frontend/src/services/adminApi.js
import { authRequest } from "./api";

/* ===================== USERS ===================== */

export async function adminListUsers(
  token,
  { limit = 50, offset = 0, role = null, blocked = null, q = "" } = {}
) {
  const qs = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  if (role) qs.set("role", String(role));
  if (blocked === true) qs.set("blocked", "true");
  if (blocked === false) qs.set("blocked", "false");
  if (q && String(q).trim()) qs.set("q", String(q).trim());

  return authRequest(`/admin/users?${qs.toString()}`, token, { method: "GET" });
}

export async function adminSetUserBlocked(token, userId, { blocked, reason }) {
  return authRequest(`/admin/users/${userId}/block`, token, {
    method: "PATCH",
    body: { blocked, reason },
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
  const qs = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  if (status) qs.set("status", String(status));
  if (service) qs.set("service", String(service));
  if (q && String(q).trim()) qs.set("q", String(q).trim());

  return authRequest(`/admin/reservations?${qs.toString()}`, token, { method: "GET" });
}

export async function adminDeleteReservation(token, reservationId) {
  return authRequest(`/admin/reservations/${reservationId}`, token, {
    method: "DELETE",
  });
}

/* ===================== AUDIT LOGS ===================== */

export async function adminListAuditLogs(token, { limit = 50, offset = 0 } = {}) {
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return authRequest(`/admin/audit-logs?${qs.toString()}`, token, { method: "GET" });
}

/* ===================== REVIEWS ===================== */

export async function adminListReviews(
  token,
  { limit = 200, offset = 0, hidden = null, rating = null } = {}
) {
  const qs = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  if (hidden === true) qs.set("hidden", "true");
  if (hidden === false) qs.set("hidden", "false");
  if (rating != null) qs.set("rating", String(rating));

  return authRequest(`/admin/reviews?${qs.toString()}`, token, { method: "GET" });
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
