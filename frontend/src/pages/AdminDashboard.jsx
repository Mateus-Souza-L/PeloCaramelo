// src/pages/AdminDashboard.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ToastProvider";
import { authRequest } from "../services/api";
// frontend/src/pages/AdminDashboard.jsx
import { useAuth } from "../context/AuthContext";

/* ---------- helpers ---------- */
const toStr = (v) => (v == null ? "" : String(v));

function pick(obj, keys, fallback = "") {
  for (const k of keys) {
    if (obj && obj[k] != null) return obj[k];
  }
  return fallback;
}

function fmtDate(v) {
  if (!v) return "";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return s;
}

function escapeCSV(val) {
  const s = toStr(val);
  const needsQuotes = /[",\n\r;]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function downloadTextFile(filename, text, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCSV(rows, columns) {
  const header = columns.map((c) => escapeCSV(c.label)).join(";");
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const v = c.value ? c.value(row) : row?.[c.key];
        return escapeCSV(v);
      })
      .join(";")
  );
  return [header, ...lines].join("\n");
}

function normUser(u) {
  if (!u) return null;
  const id = pick(u, ["id", "user_id", "uuid"]);
  const name = pick(u, ["name", "nome", "full_name", "fullName"], "");
  const email = pick(u, ["email"], "");
  const role = pick(u, ["role", "perfil", "user_role"], "");

  const isBlockedRaw = pick(u, ["isBlocked", "is_blocked", "blocked"], false);
  const isBlocked = Boolean(isBlockedRaw);

  const blockedReason = pick(u, ["blockedReason", "blocked_reason", "block_reason"], "");
  const blockedUntil = pick(u, ["blockedUntil", "blocked_until", "block_until"], "");
  const createdAt = pick(u, ["createdAt", "created_at", "created", "created_on"], "");

  return { ...u, id, name, email, role, isBlocked, blockedReason, blockedUntil, createdAt };
}

function normReservation(r) {
  if (!r) return null;
  const id = pick(r, ["id", "reservation_id"]);
  const status = pick(r, ["status"], "");
  const startDate = pick(r, ["startDate", "start_date", "start", "start_day"], "");
  const endDate = pick(r, ["endDate", "end_date", "end", "end_day"], "");
  const createdAt = pick(r, ["createdAt", "created_at"], "");

  const tutorName = pick(r, ["tutorName", "tutor_name", "tutor_nome", "tutor"], "");
  const caregiverName = pick(r, ["caregiverName", "caregiver_name", "caregiver_nome", "caregiver"], "");

  const tutorId = pick(r, ["tutorId", "tutor_id"], "");
  const caregiverId = pick(r, ["caregiverId", "caregiver_id"], "");

  return {
    ...r,
    id,
    status,
    startDate,
    endDate,
    createdAt,
    tutorName,
    caregiverName,
    tutorId,
    caregiverId,
  };
}

function normReview(rv) {
  if (!rv) return null;
  const id = pick(rv, ["id", "review_id"]);
  const reservationId = pick(rv, ["reservationId", "reservation_id"], "");
  const rating = pick(rv, ["rating", "nota", "score"], "");
  const comment = pick(rv, ["comment", "comentario", "text", "message"], "");
  const createdAt = pick(rv, ["createdAt", "created_at"], "");

  const isHidden = Boolean(pick(rv, ["isHidden", "is_hidden"], false));
  const hiddenReason = pick(rv, ["hiddenReason", "hidden_reason"], "");
  const hiddenAt = pick(rv, ["hiddenAt", "hidden_at"], "");

  const tutorId = pick(rv, ["tutorId", "tutor_id", "authorId", "author_id"], "");
  const tutorName = pick(rv, ["tutorName", "tutor_name", "authorName", "author_name"], "");
  const caregiverId = pick(rv, ["caregiverId", "caregiver_id"], "");
  const caregiverName = pick(rv, ["caregiverName", "caregiver_name"], "");

  return {
    ...rv,
    id,
    reservationId,
    rating,
    comment,
    createdAt,
    isHidden,
    hiddenReason,
    hiddenAt,
    tutorId,
    tutorName,
    caregiverId,
    caregiverName,
  };
}

/* ---------- modal ---------- */
function ConfirmModal({
  open,
  title,
  description,
  confirmText = "Confirmar",
  danger = false,
  onCancel,
  onConfirm,
  busy,
  children,
}) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel?.();
      }}
    >
      <div
        style={{
          width: "min(620px, 100%)",
          background: "#fff",
          borderRadius: 18,
          boxShadow: "0 12px 30px rgba(0,0,0,0.2)",
          overflow: "hidden",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ padding: 18, borderBottom: "1px solid #eee" }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#5A3A22" }}>{title}</div>
          {description ? (
            <div style={{ marginTop: 8, color: "#333", lineHeight: 1.35, whiteSpace: "pre-line" }}>
              {description}
            </div>
          ) : null}
        </div>

        {children ? <div style={{ padding: 18 }}>{children}</div> : null}

        <div
          style={{
            padding: 18,
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            background: "#fafafa",
            borderTop: children ? "1px solid #eee" : "none",
          }}
        >
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "#fff",
              cursor: busy ? "not-allowed" : "pointer",
              fontWeight: 800,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid transparent",
              background: danger ? "#95301F" : "#FFD700",
              color: danger ? "#fff" : "#5A3A22",
              cursor: busy ? "not-allowed" : "pointer",
              fontWeight: 1000,
            }}
          >
            {busy ? "Processando..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { user } = useAuth();

  return (
    <div style={{ padding: 40 }}>
      <h1>ADMIN DASHBOARD FUNCIONANDO</h1>
      <pre>{JSON.stringify(user, null, 2)}</pre>
    </div>
  );
}
