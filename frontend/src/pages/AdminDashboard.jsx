// src/pages/AdminDashboard.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ToastProvider";
import { authRequest } from "../services/api";

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
  const location = useLocation();
  const { user, token } = useAuth();
  const { showToast } = useToast();

  const [tab, setTab] = useState("users");

  useEffect(() => {
    const p = (location.pathname || "").toLowerCase();
    if (p.includes("/admin/reservations")) setTab("reservations");
    else if (p.includes("/admin/reviews")) setTab("reviews");
    else setTab("users");
  }, [location.pathname]);

  const [usersList, setUsersList] = useState([]);
  const [reservationsList, setReservationsList] = useState([]);
  const [reviewsList, setReviewsList] = useState([]);

  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingRes, setLoadingRes] = useState(false);
  const [loadingReviews, setLoadingReviews] = useState(false);

  const [qUsers, setQUsers] = useState("");
  const [qRes, setQRes] = useState("");
  const [qReviews, setQReviews] = useState("");
  const [showHidden, setShowHidden] = useState(true);

  const [selectedUsers, setSelectedUsers] = useState(() => new Set());
  const [selectedRes, setSelectedRes] = useState(() => new Set());
  const [selectedReviews, setSelectedReviews] = useState(() => new Set());

  const usersSelectAllRef = useRef(null);
  const resSelectAllRef = useRef(null);
  const reviewsSelectAllRef = useRef(null);

  const [confirmState, setConfirmState] = useState({
    open: false,
    title: "",
    description: "",
    confirmText: "Confirmar",
    danger: false,
    action: null,
    withReason: false,
    withUntil: false,
  });
  const [busyConfirm, setBusyConfirm] = useState(false);
  const [reasonText, setReasonText] = useState("");
  const [blockDays, setBlockDays] = useState(7);
  const [blockUntil, setBlockUntil] = useState("");

  // ✅ IMPORTANTÍSSIMO: seu role é "admin_master", então precisa aceitar "admin*"
  const roleLower = String(user?.role || "").toLowerCase();
  const isAdmin = roleLower.includes("admin");

  const ENDPOINTS = useMemo(
    () => ({
      listUsers: "/admin/users",
      listReservations: "/admin/reservations",
      listReviews: "/admin/reviews",

      setUserBlocked: (id) => `/admin/users/${id}/block`,
      deleteUser: (id) => `/admin/users/${id}`,

      updateReservationStatus: (id) => `/reservations/${id}/status`,
      deleteReservation: (id) => `/admin/reservations/${id}`,

      hideReview: (id) => `/admin/reviews/${id}/hide`,
      unhideReview: (id) => `/admin/reviews/${id}/unhide`,
    }),
    []
  );

  const loadUsers = useCallback(async () => {
    if (!token || !isAdmin) return;
    setLoadingUsers(true);
    try {
      const data = await authRequest(ENDPOINTS.listUsers, token);
      const arr = Array.isArray(data) ? data : data?.users || [];
      setUsersList(arr.map(normUser).filter(Boolean));
    } catch {
      setUsersList([]);
      showToast?.("Erro ao carregar usuários (admin).", "error");
    } finally {
      setLoadingUsers(false);
    }
  }, [token, isAdmin, ENDPOINTS, showToast]);

  const loadReservations = useCallback(async () => {
    if (!token || !isAdmin) return;
    setLoadingRes(true);
    try {
      const data = await authRequest(ENDPOINTS.listReservations, token);
      const arr = Array.isArray(data) ? data : data?.reservations || [];
      setReservationsList(arr.map(normReservation).filter(Boolean));
    } catch {
      setReservationsList([]);
      showToast?.("Erro ao carregar reservas (admin).", "error");
    } finally {
      setLoadingRes(false);
    }
  }, [token, isAdmin, ENDPOINTS, showToast]);

  const loadReviews = useCallback(async () => {
    if (!token || !isAdmin) return;
    setLoadingReviews(true);
    try {
      const data = await authRequest(ENDPOINTS.listReviews, token);
      const arr = Array.isArray(data) ? data : data?.items || data?.reviews || [];
      setReviewsList(arr.map(normReview).filter(Boolean));
    } catch {
      setReviewsList([]);
      showToast?.("Erro ao carregar avaliações (admin).", "error");
    } finally {
      setLoadingReviews(false);
    }
  }, [token, isAdmin, ENDPOINTS, showToast]);

  useEffect(() => {
    if (!token || !isAdmin) return;
    loadUsers();
    loadReservations();
    loadReviews();
  }, [token, isAdmin, loadUsers, loadReservations, loadReviews]);

  const users = useMemo(() => {
    const q = qUsers.trim().toLowerCase();
    if (!q) return usersList;
    return usersList.filter((u) => {
      const hay = `${toStr(u.id)} ${toStr(u.name)} ${toStr(u.email)} ${toStr(u.role)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [usersList, qUsers]);

  const reservations = useMemo(() => {
    const q = qRes.trim().toLowerCase();
    if (!q) return reservationsList;
    return reservationsList.filter((r) => {
      const hay = `${toStr(r.id)} ${toStr(r.status)} ${toStr(r.tutorName)} ${toStr(r.caregiverName)} ${fmtDate(
        r.startDate
      )} ${fmtDate(r.endDate)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [reservationsList, qRes]);

  const reviews = useMemo(() => {
    const q = qReviews.trim().toLowerCase();
    const base = showHidden ? reviewsList : reviewsList.filter((r) => !r.isHidden);
    if (!q) return base;
    return base.filter((r) => {
      const hay = `${toStr(r.id)} ${toStr(r.reservationId)} ${toStr(r.tutorName)} ${toStr(r.caregiverName)} ${toStr(
        r.comment
      )} ${toStr(r.rating)} ${fmtDate(r.createdAt)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [reviewsList, qReviews, showHidden]);

  const metrics = useMemo(() => {
    const totalUsers = usersList.length;
    const blockedUsers = usersList.filter((u) => Boolean(u?.isBlocked)).length;
    const admins = usersList.filter((u) => String(u?.role || "").toLowerCase().includes("admin")).length;
    const tutors = usersList.filter((u) => String(u?.role || "").toLowerCase() === "tutor").length;
    const caregivers = usersList.filter((u) => String(u?.role || "").toLowerCase() === "caregiver").length;

    const totalRes = reservationsList.length;
    const byStatus = reservationsList.reduce((acc, r) => {
      const s = String(r?.status || "unknown").toLowerCase().trim();
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    const totalReviews = reviewsList.length;
    const hiddenReviews = reviewsList.filter((r) => Boolean(r?.isHidden)).length;
    const visibleReviews = totalReviews - hiddenReviews;

    return {
      users: { totalUsers, blockedUsers, admins, tutors, caregivers },
      reservations: { totalRes, byStatus },
      reviews: { totalReviews, hiddenReviews, visibleReviews },
    };
  }, [usersList, reservationsList, reviewsList]);

  useEffect(() => {
    if (!usersSelectAllRef.current) return;
    const total = users.length;
    const selectedCount = users.filter((u) => selectedUsers.has(String(u.id))).length;
    usersSelectAllRef.current.indeterminate = selectedCount > 0 && selectedCount < total;
  }, [users, selectedUsers]);

  useEffect(() => {
    if (!resSelectAllRef.current) return;
    const total = reservations.length;
    const selectedCount = reservations.filter((r) => selectedRes.has(String(r.id))).length;
    resSelectAllRef.current.indeterminate = selectedCount > 0 && selectedCount < total;
  }, [reservations, selectedRes]);

  useEffect(() => {
    if (!reviewsSelectAllRef.current) return;
    const total = reviews.length;
    const selectedCount = reviews.filter((r) => selectedReviews.has(String(r.id))).length;
    reviewsSelectAllRef.current.indeterminate = selectedCount > 0 && selectedCount < total;
  }, [reviews, selectedReviews]);

  const toggleSet = (setter) => (id) => {
    const key = String(id);
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleUser = toggleSet(setSelectedUsers);
  const toggleRes = toggleSet(setSelectedRes);
  const toggleReview = toggleSet(setSelectedReviews);

  const selectAll = (items, setter) => (checked, idKey = "id") => {
    const ids = items.map((x) => String(x[idKey])).filter(Boolean);
    setter((prev) => {
      const next = new Set(prev);
      if (checked) ids.forEach((id) => next.add(id));
      else ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  const selectAllUsers = selectAll(users, setSelectedUsers);
  const selectAllRes = selectAll(reservations, setSelectedRes);
  const selectAllReviews = selectAll(reviews, setSelectedReviews);

  const clearSelection = () => {
    setSelectedUsers(new Set());
    setSelectedRes(new Set());
    setSelectedReviews(new Set());
  };

  const openConfirm = ({ title, description, confirmText, danger, action, withReason = false, withUntil = false }) => {
    setReasonText("");
    setBlockDays(7);
    setBlockUntil("");
    setConfirmState({
      open: true,
      title,
      description,
      confirmText: confirmText || "Confirmar",
      danger: !!danger,
      action: typeof action === "function" ? action : null,
      withReason,
      withUntil,
    });
  };

  const closeConfirm = () => {
    if (busyConfirm) return;
    setConfirmState((s) => ({ ...s, open: false }));
  };

  const runConfirm = async () => {
    if (!confirmState.action) return closeConfirm();
    setBusyConfirm(true);
    try {
      await confirmState.action({ reasonText, blockDays, blockUntil });
      closeConfirm();
    } catch {
      showToast?.("Falha ao executar ação.", "error");
    } finally {
      setBusyConfirm(false);
    }
  };

  const selectedUserIds = useMemo(() => Array.from(selectedUsers), [selectedUsers]);

  const bulkSetBlocked = (blocked) => {
    if (!selectedUserIds.length) return showToast?.("Selecione usuários.", "info");

    openConfirm({
      title: blocked ? "Bloquear usuários selecionados?" : "Desbloquear usuários selecionados?",
      description: `Isso ${blocked ? "bloqueará" : "desbloqueará"} ${selectedUserIds.length} usuário(s).`,
      confirmText: blocked ? "Bloquear" : "Desbloquear",
      danger: !!blocked,
      withReason: blocked,
      withUntil: blocked,
      action: async ({ reasonText, blockDays, blockUntil }) => {
        const reason = (reasonText || "").trim() || (blocked ? "Bloqueio administrativo" : "");
        const payload = { blocked, reason };

        if (blocked) {
          if (blockUntil) payload.blockedUntil = blockUntil;
          else payload.blockedDays = Number(blockDays || 7);
        }

        await Promise.all(
          selectedUserIds.map((id) =>
            authRequest(ENDPOINTS.setUserBlocked(id), token, { method: "PATCH", body: payload })
          )
        );

        showToast?.(blocked ? "Usuários bloqueados." : "Usuários desbloqueados.", "success");
        await loadUsers();
        clearSelection();
      },
    });
  };

  const bulkDeleteUsers = () => {
    if (!selectedUserIds.length) return showToast?.("Selecione usuários.", "info");
    openConfirm({
      title: "Excluir usuários selecionados?",
      description: `Você está prestes a excluir ${selectedUserIds.length} usuário(s).\n⚠️ Irreversível. Recomendo BLOQUEAR ao invés de excluir.`,
      confirmText: "Excluir",
      danger: true,
      action: async () => {
        await Promise.all(
          selectedUserIds.map((id) => authRequest(ENDPOINTS.deleteUser(id), token, { method: "DELETE" }))
        );
        showToast?.("Usuários excluídos.", "success");
        await loadUsers();
        clearSelection();
      },
    });
  };

  const selectedResIds = useMemo(() => Array.from(selectedRes), [selectedRes]);

  const bulkDeleteReservations = () => {
    if (!selectedResIds.length) return showToast?.("Selecione reservas.", "info");
    openConfirm({
      title: "Excluir reservas selecionadas?",
      description: `Você está prestes a excluir ${selectedResIds.length} reserva(s).\n⚠️ Irreversível.`,
      confirmText: "Excluir",
      danger: true,
      action: async () => {
        await Promise.all(
          selectedResIds.map((id) => authRequest(ENDPOINTS.deleteReservation(id), token, { method: "DELETE" }))
        );
        showToast?.("Reservas excluídas.", "success");
        await loadReservations();
        clearSelection();
      },
    });
  };

  const bulkSetReservationStatus = (status) => {
    if (!selectedResIds.length) return showToast?.("Selecione reservas.", "info");
    const label = status === "canceled" ? "Cancelar" : status === "completed" ? "Concluir" : `Alterar (${status})`;
    openConfirm({
      title: `${label} reservas selecionadas?`,
      description: `Isso afetará ${selectedResIds.length} reserva(s).`,
      confirmText: label,
      danger: status === "canceled",
      action: async () => {
        await Promise.all(
          selectedResIds.map((id) =>
            authRequest(ENDPOINTS.updateReservationStatus(id), token, { method: "PATCH", body: { status } })
          )
        );
        showToast?.("Reservas atualizadas.", "success");
        await loadReservations();
        clearSelection();
      },
    });
  };

  const selectedReviewIds = useMemo(() => Array.from(selectedReviews), [selectedReviews]);

  const bulkHideReviews = () => {
    if (!selectedReviewIds.length) return showToast?.("Selecione avaliações.", "info");
    openConfirm({
      title: "Ocultar avaliações selecionadas?",
      description: `Isso ocultará ${selectedReviewIds.length} avaliação(ões) do site.\nRecomendado para ofensas / spam / fora das diretrizes.`,
      confirmText: "Ocultar",
      danger: true,
      withReason: true,
      action: async ({ reasonText }) => {
        const reason = (reasonText || "").trim() || "Violação de diretrizes / conteúdo inadequado";
        await Promise.all(
          selectedReviewIds.map((id) =>
            authRequest(ENDPOINTS.hideReview(id), token, { method: "PATCH", body: { reason } })
          )
        );
        showToast?.("Avaliações ocultadas.", "success");
        await loadReviews();
        clearSelection();
      },
    });
  };

  const bulkUnhideReviews = () => {
    if (!selectedReviewIds.length) return showToast?.("Selecione avaliações.", "info");
    openConfirm({
      title: "Reexibir avaliações selecionadas?",
      description: `Isso reexibirá ${selectedReviewIds.length} avaliação(ões).`,
      confirmText: "Reexibir",
      action: async () => {
        await Promise.all(
          selectedReviewIds.map((id) => authRequest(ENDPOINTS.unhideReview(id), token, { method: "PATCH" }))
        );
        showToast?.("Avaliações reexibidas.", "success");
        await loadReviews();
        clearSelection();
      },
    });
  };

  const exportUsersCSV = () => {
    if (!users.length) return showToast?.("Nada para exportar.", "info");
    const cols = [
      { key: "id", label: "id" },
      { key: "name", label: "nome" },
      { key: "email", label: "email" },
      { key: "role", label: "role" },
      { key: "isBlocked", label: "bloqueado", value: (u) => (u.isBlocked ? "sim" : "nao") },
      { key: "blockedReason", label: "motivo_bloqueio", value: (u) => toStr(u.blockedReason || "") },
      { key: "blockedUntil", label: "bloqueado_ate", value: (u) => fmtDate(u.blockedUntil) },
      { key: "createdAt", label: "criado_em", value: (u) => fmtDate(u.createdAt) },
    ];
    downloadTextFile(`usuarios_${new Date().toISOString().slice(0, 10)}.csv`, toCSV(users, cols));
    showToast?.("CSV de usuários baixado.", "success");
  };

  const exportReservationsCSV = () => {
    if (!reservations.length) return showToast?.("Nada para exportar.", "info");
    const cols = [
      { key: "id", label: "id" },
      { key: "status", label: "status" },
      { key: "startDate", label: "inicio", value: (r) => fmtDate(r.startDate) },
      { key: "endDate", label: "fim", value: (r) => fmtDate(r.endDate) },
      { key: "tutorName", label: "tutor_nome" },
      { key: "caregiverName", label: "cuidador_nome" },
      { key: "tutorId", label: "tutor_id" },
      { key: "caregiverId", label: "cuidador_id" },
      { key: "createdAt", label: "criado_em", value: (r) => fmtDate(r.createdAt) },
    ];
    downloadTextFile(`reservas_${new Date().toISOString().slice(0, 10)}.csv`, toCSV(reservations, cols));
    showToast?.("CSV de reservas baixado.", "success");
  };

  const exportReviewsCSV = () => {
    if (!reviews.length) return showToast?.("Nada para exportar.", "info");
    const cols = [
      { key: "id", label: "id" },
      { key: "reservationId", label: "reserva_id" },
      { key: "rating", label: "nota" },
      { key: "comment", label: "comentario" },
      { key: "tutorName", label: "tutor_nome" },
      { key: "caregiverName", label: "cuidador_nome" },
      { key: "isHidden", label: "oculta", value: (r) => (r.isHidden ? "sim" : "nao") },
      { key: "hiddenReason", label: "motivo_ocultar" },
      { key: "createdAt", label: "criado_em", value: (r) => fmtDate(r.createdAt) },
    ];
    downloadTextFile(`avaliacoes_${new Date().toISOString().slice(0, 10)}.csv`, toCSV(reviews, cols));
    showToast?.("CSV de avaliações baixado.", "success");
  };

  const colors = {
    brown: "#5A3A22",
    yellow: "#FFD700",
    beige: "#EBCBA9",
    red: "#95301F",
    shadow: "0 10px 24px rgba(0,0,0,0.14)",
    border: "#f0e5d7",
    soft: "#faf7ef",
  };

  const containerStyle = { maxWidth: 1180, margin: "0 auto" };

  const cardStyle = {
    background: "#fff",
    borderRadius: 18,
    boxShadow: colors.shadow,
    border: `1px solid ${colors.border}`,
  };

  const pillBtn = (active = false) => ({
    padding: "10px 14px",
    borderRadius: 999,
    border: "1px solid #ddd",
    background: active ? colors.yellow : "#fff",
    color: colors.brown,
    fontWeight: 1000,
    cursor: "pointer",
  });

  const btn = (variant = "light") => {
    const base = {
      padding: "10px 14px",
      borderRadius: 12,
      cursor: "pointer",
      fontWeight: 900,
      border: "1px solid #ddd",
      background: "#fff",
      color: "#111",
    };
    if (variant === "danger") return { ...base, border: "1px solid transparent", background: colors.red, color: "#fff" };
    if (variant === "dark") return { ...base, border: "1px solid transparent", background: "#111", color: "#fff" };
    if (variant === "brand") return { ...base, border: "1px solid transparent", background: colors.yellow, color: colors.brown };
    return base;
  };

  const MetricCard = ({ title, value, subtitle }) => (
    <div
      style={{
        padding: 14,
        borderRadius: 16,
        border: `1px solid ${colors.border}`,
        background: "#fff",
        boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
        minHeight: 86,
      }}
    >
      <div style={{ fontWeight: 1000, color: colors.brown, fontSize: 13 }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 1100, color: "#111" }}>{value}</div>
      {subtitle ? <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>{subtitle}</div> : null}
    </div>
  );

  if (!token) {
    return (
      <div style={{ padding: 16, background: colors.beige, minHeight: "100vh" }}>
        <div style={{ ...containerStyle }}>
          <div style={{ ...cardStyle, padding: 18 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: colors.brown }}>Você não está logado</div>
            <div style={{ marginTop: 8, color: "#333" }}>Faça login novamente para acessar o painel admin.</div>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 16, background: colors.beige, minHeight: "100vh" }}>
        <div style={{ ...containerStyle }}>
          <div style={{ ...cardStyle, padding: 18 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: colors.brown }}>Acesso restrito</div>
            <div style={{ marginTop: 8, color: "#333" }}>
              Você precisa estar logado como <b>admin</b> para acessar este painel.
              <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
                Role atual: <b>{toStr(user?.role)}</b>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const selectedCount =
    tab === "users" ? selectedUsers.size : tab === "reservations" ? selectedRes.size : selectedReviews.size;

  return (
    <div style={{ padding: 16, background: colors.beige, minHeight: "100vh" }}>
      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        confirmText={confirmState.confirmText}
        danger={confirmState.danger}
        busy={busyConfirm}
        onCancel={closeConfirm}
        onConfirm={runConfirm}
      >
        {confirmState.withReason ? (
          <div>
            <div style={{ fontWeight: 900, color: colors.brown, marginBottom: 8 }}>
              {confirmState.withUntil ? "Motivo do bloqueio" : "Motivo (recomendado)"}
            </div>
            <textarea
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="Ex.: Violação de diretrizes, spam, ofensas..."
              rows={4}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 12,
                border: "1px solid #ddd",
                outline: "none",
                resize: "vertical",
              }}
            />

            {confirmState.withUntil ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 900, color: colors.brown, marginBottom: 8 }}>Tempo de bloqueio</div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    type="number"
                    min={1}
                    value={blockDays}
                    onChange={(e) => setBlockDays(Number(e.target.value || 1))}
                    style={{
                      width: 110,
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #ddd",
                      outline: "none",
                    }}
                  />
                  <div style={{ color: "#333", fontWeight: 800 }}>dias</div>

                  <div style={{ color: "#666" }}>ou até</div>

                  <input
                    type="date"
                    value={blockUntil}
                    onChange={(e) => setBlockUntil(e.target.value)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid #ddd",
                      outline: "none",
                    }}
                  />

                  <div style={{ color: "#666", fontSize: 12, width: "100%" }}>
                    Se você preencher a data, ela tem prioridade. Se deixar vazio, usa “dias”.
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </ConfirmModal>

      <div style={containerStyle}>
        <div style={{ ...cardStyle, padding: 18 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 1000, color: colors.brown }}>Admin — PeloCaramelo</div>

            <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => {
                  loadUsers();
                  loadReservations();
                  loadReviews();
                }}
                style={btn("light")}
              >
                Atualizar
              </button>

              <button type="button" onClick={clearSelection} style={btn("light")}>
                Limpar seleção
              </button>
            </div>
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setTab("users")} style={pillBtn(tab === "users")}>
              Usuários ({usersList.length})
            </button>
            <button type="button" onClick={() => setTab("reservations")} style={pillBtn(tab === "reservations")}>
              Reservas ({reservationsList.length})
            </button>
            <button type="button" onClick={() => setTab("reviews")} style={pillBtn(tab === "reviews")}>
              Avaliações ({reviewsList.length})
            </button>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 1100, color: colors.brown, marginBottom: 10 }}>Métricas</div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10 }}>
              <div style={{ gridColumn: "span 4" }}>
                <MetricCard
                  title="Usuários"
                  value={metrics.users.totalUsers}
                  subtitle={`Admins: ${metrics.users.admins} • Tutores: ${metrics.users.tutors} • Cuidadores: ${metrics.users.caregivers}`}
                />
              </div>
              <div style={{ gridColumn: "span 4" }}>
                <MetricCard title="Usuários bloqueados" value={metrics.users.blockedUsers} subtitle="Total marcados como bloqueados" />
              </div>
              <div style={{ gridColumn: "span 4" }}>
                <MetricCard title="Reservas" value={metrics.reservations.totalRes} subtitle="Total no sistema" />
              </div>

              <div style={{ gridColumn: "span 6" }}>
                <MetricCard
                  title="Reservas por status"
                  value={`${Object.keys(metrics.reservations.byStatus).length} status`}
                  subtitle={
                    Object.entries(metrics.reservations.byStatus)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 5)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" • ") || "Sem dados"
                  }
                />
              </div>
              <div style={{ gridColumn: "span 3" }}>
                <MetricCard title="Avaliações" value={metrics.reviews.totalReviews} subtitle="Total registradas" />
              </div>
              <div style={{ gridColumn: "span 3" }}>
                <MetricCard title="Avaliações ocultas" value={metrics.reviews.hiddenReviews} subtitle={`Visíveis: ${metrics.reviews.visibleReviews}`} />
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 14,
              background: colors.soft,
              border: `1px solid ${colors.border}`,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div style={{ fontWeight: 1000, color: colors.brown }}>Selecionados: {selectedCount}</div>

            {tab === "users" ? (
              <>
                <button type="button" onClick={() => bulkSetBlocked(false)} style={btn("light")}>
                  Desbloquear
                </button>
                <button type="button" onClick={() => bulkSetBlocked(true)} style={btn("danger")}>
                  Bloquear
                </button>
                <button type="button" onClick={bulkDeleteUsers} style={btn("dark")}>
                  Excluir
                </button>
                <span style={{ flex: 1 }} />
                <button type="button" onClick={exportUsersCSV} style={btn("light")}>
                  Exportar CSV
                </button>
              </>
            ) : tab === "reservations" ? (
              <>
                <button type="button" onClick={() => bulkSetReservationStatus("completed")} style={btn("light")}>
                  Concluir
                </button>
                <button type="button" onClick={() => bulkSetReservationStatus("canceled")} style={btn("danger")}>
                  Cancelar
                </button>
                <button type="button" onClick={bulkDeleteReservations} style={btn("dark")}>
                  Excluir
                </button>
                <span style={{ flex: 1 }} />
                <button type="button" onClick={exportReservationsCSV} style={btn("light")}>
                  Exportar CSV
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={bulkUnhideReviews} style={btn("light")}>
                  Reexibir
                </button>
                <button type="button" onClick={bulkHideReviews} style={btn("danger")}>
                  Ocultar
                </button>
                <span style={{ flex: 1 }} />
                <button type="button" onClick={exportReviewsCSV} style={btn("light")}>
                  Exportar CSV
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ marginTop: 14, ...cardStyle, padding: 14 }}>
          {tab === "users" ? (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  value={qUsers}
                  onChange={(e) => setQUsers(e.target.value)}
                  placeholder="Buscar usuário (id, nome, email, role)..."
                  style={{
                    flex: 1,
                    minWidth: 240,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    outline: "none",
                  }}
                />
                <div style={{ color: "#555", fontWeight: 900 }}>{loadingUsers ? "Carregando..." : `Exibindo ${users.length}`}</div>
              </div>

              <div style={{ marginTop: 12, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                      <th style={{ padding: 10, width: 46 }}>
                        <input
                          ref={usersSelectAllRef}
                          type="checkbox"
                          onChange={(e) => selectAllUsers(e.target.checked)}
                          checked={users.length > 0 && users.every((u) => selectedUsers.has(String(u.id)))}
                        />
                      </th>
                      <th style={{ padding: 10 }}>ID</th>
                      <th style={{ padding: 10 }}>Nome</th>
                      <th style={{ padding: 10 }}>Email</th>
                      <th style={{ padding: 10 }}>Role</th>
                      <th style={{ padding: 10 }}>Status</th>
                      <th style={{ padding: 10 }}>Criado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const id = String(u.id || "");
                      const checked = selectedUsers.has(id);
                      return (
                        <tr key={id} style={{ borderBottom: "1px solid #f2f2f2" }}>
                          <td style={{ padding: 10 }}>
                            <input type="checkbox" checked={checked} on onChange={() => toggleUser(id)} />
                          </td>
                          <td style={{ padding: 10, fontWeight: 1000, color: colors.brown }}>{id}</td>
                          <td style={{ padding: 10 }}>{u.name || "-"}</td>
                          <td style={{ padding: 10 }}>{u.email || "-"}</td>
                          <td style={{ padding: 10 }}>{u.role || "-"}</td>
                          <td style={{ padding: 10 }}>
                            <span
                              style={{
                                padding: "6px 10px",
                                borderRadius: 999,
                                fontWeight: 1000,
                                background: u.isBlocked ? "#ffe6e6" : "#eaffea",
                                color: u.isBlocked ? colors.red : "#156b15",
                                border: "1px solid #eee",
                              }}
                              title={
                                u.isBlocked
                                  ? `Motivo: ${toStr(u.blockedReason || "-")}\nAté: ${fmtDate(u.blockedUntil) || "-"}`
                                  : ""
                              }
                            >
                              {u.isBlocked ? "Bloqueado" : "Ativo"}
                            </span>
                          </td>
                          <td style={{ padding: 10 }}>{fmtDate(u.createdAt) || "-"}</td>
                        </tr>
                      );
                    })}
                    {!loadingUsers && users.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ padding: 14, color: "#555" }}>
                          Nenhum usuário encontrado.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </>
          ) : tab === "reservations" ? (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  value={qRes}
                  onChange={(e) => setQRes(e.target.value)}
                  placeholder="Buscar reserva (id, status, tutor, cuidador, datas)..."
                  style={{
                    flex: 1,
                    minWidth: 240,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    outline: "none",
                  }}
                />
                <div style={{ color: "#555", fontWeight: 900 }}>{loadingRes ? "Carregando..." : `Exibindo ${reservations.length}`}</div>
              </div>

              <div style={{ marginTop: 12, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1050 }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                      <th style={{ padding: 10, width: 46 }}>
                        <input
                          ref={resSelectAllRef}
                          type="checkbox"
                          onChange={(e) => selectAllRes(e.target.checked)}
                          checked={reservations.length > 0 && reservations.every((r) => selectedRes.has(String(r.id)))}
                        />
                      </th>
                      <th style={{ padding: 10 }}>ID</th>
                      <th style={{ padding: 10 }}>Status</th>
                      <th style={{ padding: 10 }}>Início</th>
                      <th style={{ padding: 10 }}>Fim</th>
                      <th style={{ padding: 10 }}>Tutor</th>
                      <th style={{ padding: 10 }}>Cuidador</th>
                      <th style={{ padding: 10 }}>Criado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations.map((r) => {
                      const id = String(r.id || "");
                      const checked = selectedRes.has(id);
                      return (
                        <tr key={id} style={{ borderBottom: "1px solid #f2f2f2" }}>
                          <td style={{ padding: 10 }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleRes(id)} />
                          </td>
                          <td style={{ padding: 10, fontWeight: 1000, color: colors.brown }}>{id}</td>
                          <td style={{ padding: 10 }}>{r.status || "-"}</td>
                          <td style={{ padding: 10 }}>{fmtDate(r.startDate) || "-"}</td>
                          <td style={{ padding: 10 }}>{fmtDate(r.endDate) || "-"}</td>
                          <td style={{ padding: 10 }}>{r.tutorName ? r.tutorName : r.tutorId ? `ID ${r.tutorId}` : "-"}</td>
                          <td style={{ padding: 10 }}>
                            {r.caregiverName ? r.caregiverName : r.caregiverId ? `ID ${r.caregiverId}` : "-"}
                          </td>
                          <td style={{ padding: 10 }}>{fmtDate(r.createdAt) || "-"}</td>
                        </tr>
                      );
                    })}
                    {!loadingRes && reservations.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ padding: 14, color: "#555" }}>
                          Nenhuma reserva encontrada.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  value={qReviews}
                  onChange={(e) => setQReviews(e.target.value)}
                  placeholder="Buscar avaliação (id, reserva, tutor, cuidador, nota, comentário)..."
                  style={{
                    flex: 1,
                    minWidth: 240,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    outline: "none",
                  }}
                />

                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 900, color: colors.brown }}>
                  <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
                  Mostrar ocultas
                </label>

                <div style={{ color: "#555", fontWeight: 900 }}>{loadingReviews ? "Carregando..." : `Exibindo ${reviews.length}`}</div>
              </div>

              <div style={{ marginTop: 12, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1150 }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                      <th style={{ padding: 10, width: 46 }}>
                        <input
                          ref={reviewsSelectAllRef}
                          type="checkbox"
                          onChange={(e) => selectAllReviews(e.target.checked)}
                          checked={reviews.length > 0 && reviews.every((r) => selectedReviews.has(String(r.id)))}
                        />
                      </th>
                      <th style={{ padding: 10 }}>ID</th>
                      <th style={{ padding: 10 }}>Reserva</th>
                      <th style={{ padding: 10 }}>Nota</th>
                      <th style={{ padding: 10, minWidth: 320 }}>Comentário</th>
                      <th style={{ padding: 10 }}>Tutor</th>
                      <th style={{ padding: 10 }}>Cuidador</th>
                      <th style={{ padding: 10 }}>Status</th>
                      <th style={{ padding: 10 }}>Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviews.map((r) => {
                      const id = String(r.id || "");
                      const checked = selectedReviews.has(id);
                      return (
                        <tr key={id} style={{ borderBottom: "1px solid #f2f2f2" }}>
                          <td style={{ padding: 10 }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleReview(id)} />
                          </td>
                          <td style={{ padding: 10, fontWeight: 1000, color: colors.brown }}>{id}</td>
                          <td style={{ padding: 10 }}>{r.reservationId || "-"}</td>
                          <td style={{ padding: 10 }}>{toStr(r.rating) || "-"}</td>
                          <td style={{ padding: 10, color: "#333" }}>{r.comment ? r.comment : "-"}</td>
                          <td style={{ padding: 10 }}>{r.tutorName ? r.tutorName : r.tutorId ? `ID ${r.tutorId}` : "-"}</td>
                          <td style={{ padding: 10 }}>
                            {r.caregiverName ? r.caregiverName : r.caregiverId ? `ID ${r.caregiverId}` : "-"}
                          </td>
                          <td style={{ padding: 10 }}>
                            <span
                              style={{
                                padding: "6px 10px",
                                borderRadius: 999,
                                fontWeight: 1000,
                                background: r.isHidden ? "#ffe6e6" : "#eaffea",
                                color: r.isHidden ? colors.red : "#156b15",
                                border: "1px solid #eee",
                              }}
                              title={r.isHidden ? `Motivo: ${r.hiddenReason || "-"}\nEm: ${fmtDate(r.hiddenAt) || "-"}` : ""}
                            >
                              {r.isHidden ? "Oculta" : "Visível"}
                            </span>
                          </td>
                          <td style={{ padding: 10 }}>{fmtDate(r.createdAt) || "-"}</td>
                        </tr>
                      );
                    })}

                    {!loadingReviews && reviews.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ padding: 14, color: "#555" }}>
                          Nenhuma avaliação encontrada.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 10, color: "#666", fontSize: 13 }}>
                Recomendação: use <b>Ocultar</b> (com motivo) para conteúdo ofensivo/spam. Você pode reexibir depois.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
