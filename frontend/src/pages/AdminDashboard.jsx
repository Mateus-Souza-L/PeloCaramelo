// frontend/src/pages/AdminDashboard.jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  adminDeleteReservation,
  adminDeleteUser,
  adminListAuditLogs,
  adminListReservations,
  adminListUsers,
  adminSetUserBlocked,
  adminSetUserRole,
  adminListReviews,
  adminHideReview,
  adminUnhideReview,
} from "../services/adminApi";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ToastProvider";
import { formatDateBR } from "../utils/date";

function toStr(v) {
  return v == null ? "" : String(v);
}

function roleLabel(role) {
  const r = String(role || "").toLowerCase();
  if (r === "admin_master") return "Admin Master";
  if (r === "admin") return "Admin";
  if (r === "caregiver") return "Cuidador";
  return "Tutor";
}

function moneyBR(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return `R$ ${n.toFixed(2)}`;
}

/* ===================== Modal padrão ===================== */

function ModalBase({ open, title, subtitle, children, onClose }) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        style={{
          width: "min(760px, 100%)",
          background: "#fff",
          borderRadius: 18,
          overflow: "hidden",
          boxShadow: "0 12px 30px rgba(0,0,0,0.22)",
          border: "1px solid #eee",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ padding: 18, borderBottom: "1px solid #eee", background: "#fff" }}>
          <div style={{ fontSize: 18, fontWeight: 1000, color: "#5A3A22" }}>{title}</div>
          {subtitle ? (
            <div style={{ marginTop: 6, color: "#333", lineHeight: 1.35, fontSize: 13 }}>
              {subtitle}
            </div>
          ) : null}
        </div>

        <div style={{ padding: 18, background: "#EBCBA9" }}>{children}</div>
      </div>
    </div>
  );
}

function ConfirmModal({
  open,
  title,
  subtitle,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  loading = false,
  onClose,
  onConfirm,
}) {
  return (
    <ModalBase open={open} title={title} subtitle={subtitle} onClose={loading ? null : onClose}>
      <div className="bg-white rounded-2xl border border-black/10 p-4">
        <div className="flex justify-end gap-2 mt-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className={[
              "px-4 py-2 rounded-xl font-extrabold border",
              loading ? "opacity-70 cursor-not-allowed" : "hover:bg-black/5",
            ].join(" ")}
            style={{ borderColor: "#ddd", color: "#5A3A22", background: "#fff" }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={[
              "px-4 py-2 rounded-xl font-extrabold",
              loading ? "opacity-80 cursor-not-allowed" : "hover:opacity-90",
            ].join(" ")}
            style={{ background: "#95301F", color: "#fff" }}
          >
            {loading ? "Aguarde…" : confirmText}
          </button>
        </div>
      </div>
    </ModalBase>
  );
}

function HideReviewModal({ open, review, loading = false, onClose, onConfirm }) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setReason("");
  }, [open]);

  const rid = toStr(review?.id);

  return (
    <ModalBase
      open={open}
      title="Ocultar avaliação"
      subtitle={rid ? `Avaliação #${rid}` : "Informe o motivo (opcional) e confirme."}
      onClose={loading ? null : onClose}
    >
      <div className="bg-white rounded-2xl border border-black/10 p-4">
        <label className="block text-sm font-extrabold text-[#5A3A22]">Motivo (opcional)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={loading}
          rows={4}
          className="mt-2 w-full rounded-xl border border-black/10 p-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
          placeholder="Ex.: Linguagem ofensiva / dados pessoais / conteúdo inadequado…"
        />

        <div className="flex justify-end gap-2 mt-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className={[
              "px-4 py-2 rounded-xl font-extrabold border",
              loading ? "opacity-70 cursor-not-allowed" : "hover:bg-black/5",
            ].join(" ")}
            style={{ borderColor: "#ddd", color: "#5A3A22", background: "#fff" }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm?.(reason)}
            disabled={loading}
            className={[
              "px-4 py-2 rounded-xl font-extrabold",
              loading ? "opacity-80 cursor-not-allowed" : "hover:opacity-90",
            ].join(" ")}
            style={{ background: "#FFD700", color: "#5A3A22" }}
          >
            {loading ? "Ocultando…" : "Ocultar"}
          </button>
        </div>
      </div>
    </ModalBase>
  );
}

/* ===================== Dashboard ===================== */

export default function AdminDashboard() {
  const { token, user } = useAuth();
  const { showToast } = useToast();

  const myRole = String(user?.role || "").toLowerCase();
  const isMaster = myRole === "admin_master";
  const canManageRoles = isMaster;

  const [tab, setTab] = useState("users"); // users | reservations | reviews | logs
  const [loading, setLoading] = useState(false);

  // data
  const [users, setUsers] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [logs, setLogs] = useState([]);

  // -------- Pagination (per tab) --------
  const [usersOffset, setUsersOffset] = useState(0);
  const usersLimit = 50;

  const [resOffset, setResOffset] = useState(0);
  const resLimit = 50;

  const [reviewOffset, setReviewOffset] = useState(0);
  const reviewLimit = 200; // backend já está ok com 200

  const [logOffset, setLogOffset] = useState(0);
  const logLimit = 50;

  // -------- Filters (Users) --------
  const [userRoleFilter, setUserRoleFilter] = useState("all"); // all | tutor | caregiver | admin | admin_master
  const [userBlockedFilter, setUserBlockedFilter] = useState("all"); // all | blocked | unblocked
  const [userSearch, setUserSearch] = useState("");

  // -------- Filters (Reservations) --------
  const [resStatusFilter, setResStatusFilter] = useState("all"); // all | Pendente | Aceita | ...
  const [resServiceFilter, setResServiceFilter] = useState("all"); // all | Hospedagem | Passeio | etc
  const [resSearch, setResSearch] = useState("");

  // -------- Filters (Reviews) --------
  const [reviewHiddenFilter, setReviewHiddenFilter] = useState("all"); // all | hidden | visible
  const [reviewRatingFilter, setReviewRatingFilter] = useState("all"); // all | 1..5
  const [reviewSearch, setReviewSearch] = useState("");

  // -------- Modals reviews --------
  const [hideModalOpen, setHideModalOpen] = useState(false);
  const [hideModalLoading, setHideModalLoading] = useState(false);
  const [reviewToHide, setReviewToHide] = useState(null);

  const [unhideConfirmOpen, setUnhideConfirmOpen] = useState(false);
  const [unhideLoading, setUnhideLoading] = useState(false);
  const [reviewToUnhide, setReviewToUnhide] = useState(null);

  /* ===================== UI: botões padrão ===================== */

  function btnBase() {
    return "px-3 py-1.5 rounded-xl font-extrabold transition active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed";
  }
  function btnPrimary() {
    return `${btnBase()} bg-[#FFD700] text-[#5A3A22] hover:opacity-90`;
  }
  function btnDark() {
    return `${btnBase()} bg-[#5A3A22] text-white hover:opacity-90`;
  }
  function btnDanger() {
    return `${btnBase()} bg-[#95301F] text-white hover:opacity-90`;
  }
  function btnNeutral() {
    return `${btnBase()} bg-white/70 border border-black/10 text-[#5A3A22] hover:bg-white`;
  }

  /* ===================== LOADERS (sob demanda) ===================== */

  const loadUsers = useCallback(
    async (offset = usersOffset) => {
      if (!token) return;

      const role = userRoleFilter === "all" ? null : userRoleFilter;
      const blocked =
        userBlockedFilter === "blocked" ? true : userBlockedFilter === "unblocked" ? false : null;

      setLoading(true);
      try {
        const data = await adminListUsers(token, {
          limit: usersLimit,
          offset,
          role,
          blocked,
          q: userSearch,
        });

        const list = data?.users || data?.items || [];
        setUsers(Array.isArray(list) ? list : []);
        setUsersOffset(data?.offset ?? offset);
      } catch (err) {
        showToast(err?.message || "Erro ao carregar usuários.", "error");
      } finally {
        setLoading(false);
      }
    },
    [token, showToast, usersLimit, usersOffset, userRoleFilter, userBlockedFilter, userSearch]
  );

  const loadReservations = useCallback(
    async (offset = resOffset) => {
      if (!token) return;

      const status = resStatusFilter === "all" ? null : resStatusFilter;
      const service = resServiceFilter === "all" ? null : resServiceFilter;

      setLoading(true);
      try {
        const data = await adminListReservations(token, {
          limit: resLimit,
          offset,
          status,
          service,
          q: resSearch,
        });

        const list = data?.reservations || data?.items || [];
        setReservations(Array.isArray(list) ? list : []);
        setResOffset(data?.offset ?? offset);
      } catch (err) {
        showToast(err?.message || "Erro ao carregar reservas.", "error");
      } finally {
        setLoading(false);
      }
    },
    [token, showToast, resLimit, resOffset, resStatusFilter, resServiceFilter, resSearch]
  );

  const loadReviews = useCallback(
    async (offset = reviewOffset) => {
      if (!token) return;

      const hidden =
        reviewHiddenFilter === "hidden" ? true : reviewHiddenFilter === "visible" ? false : null;

      const rating = reviewRatingFilter === "all" ? null : Number(reviewRatingFilter);

      setLoading(true);
      try {
        const data = await adminListReviews(token, {
          limit: reviewLimit,
          offset,
          hidden,
          rating: Number.isFinite(rating) ? rating : null,
        });

        const list = data?.items || data?.reviews || [];
        setReviews(Array.isArray(list) ? list : []);
        setReviewOffset(data?.meta?.offset ?? data?.offset ?? offset);
      } catch (err) {
        showToast(err?.message || "Erro ao carregar avaliações.", "error");
      } finally {
        setLoading(false);
      }
    },
    [token, showToast, reviewLimit, reviewOffset, reviewHiddenFilter, reviewRatingFilter]
  );

  const loadLogs = useCallback(
    async (offset = 0) => {
      if (!token) return;
      setLoading(true);
      try {
        const data = await adminListAuditLogs(token, { limit: logLimit, offset });
        setLogs(data?.logs || []);
        setLogOffset(data?.offset || offset);
      } catch (err) {
        showToast(err?.message || "Erro ao carregar audit logs.", "error");
      } finally {
        setLoading(false);
      }
    },
    [token, showToast, logLimit]
  );

  // ✅ carrega apenas a aba atual
  useEffect(() => {
    if (tab === "users") loadUsers(0);
    if (tab === "reservations") loadReservations(0);
    if (tab === "reviews") loadReviews(0);
    if (tab === "logs") loadLogs(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  /* ===================== STATS (rápidos, baseado no que está carregado) ===================== */

  const stats = useMemo(() => {
    const totalUsers = users?.length || 0;
    const blockedUsers = (users || []).filter((u) => !!u?.blocked).length;
    const totalReservations = reservations?.length || 0;
    const totalReviews = reviews?.length || 0;
    const hiddenReviews = (reviews || []).filter((rv) => !!rv?.is_hidden).length;

    return { totalUsers, blockedUsers, totalReservations, totalReviews, hiddenReviews };
  }, [users, reservations, reviews]);

  /* ===================== FILTERS client (busca local complementar) ===================== */

  const usersFilteredClient = useMemo(() => {
    const q = toStr(userSearch).trim().toLowerCase();
    if (!q) return users || [];
    return (users || []).filter((u) => {
      const hay = [u?.id, u?.name, u?.email, u?.role]
        .map((x) => toStr(x).toLowerCase())
        .join(" | ");
      return hay.includes(q);
    });
  }, [users, userSearch]);

  const reservationsFilteredClient = useMemo(() => {
    const q = toStr(resSearch).trim().toLowerCase();
    if (!q) return reservations || [];
    return (reservations || []).filter((r) => {
      const hay = [r?.id, r?.tutor_name, r?.caregiver_name, r?.service, r?.status]
        .map((x) => toStr(x).toLowerCase())
        .join(" | ");
      return hay.includes(q);
    });
  }, [reservations, resSearch]);

  const reviewsFilteredClient = useMemo(() => {
    const q = toStr(reviewSearch).trim().toLowerCase();
    if (!q) return reviews || [];
    return (reviews || []).filter((rv) => {
      const hay = [
        rv?.comment,
        rv?.tutor_name,
        rv?.caregiver_name,
        rv?.reviewer_name,
        rv?.reviewed_name,
        rv?.service,
        rv?.reservation_id,
        rv?.id,
      ]
        .map((x) => toStr(x).toLowerCase())
        .join(" | ");
      return hay.includes(q);
    });
  }, [reviews, reviewSearch]);

  /* ===================== ACTIONS: USERS ===================== */

  async function handleToggleBlocked(u) {
    const id = toStr(u?.id);
    const next = !u?.blocked;

    let reason = null;
    if (next) {
      reason = window.prompt("Motivo do bloqueio (opcional):", "") || "";
      reason = reason.trim() || null;
    }

    try {
      const data = await adminSetUserBlocked(token, id, { blocked: next, reason });
      const updated = data?.user || { ...u, blocked: next };
      setUsers((prev) => prev.map((x) => (toStr(x.id) === id ? updated : x)));
      showToast(next ? "Usuário bloqueado." : "Usuário desbloqueado.", "success");
    } catch (err) {
      showToast(err?.message || "Erro ao atualizar bloqueio.", "error");
    }
  }

  async function handleDeleteUser(u) {
    const id = toStr(u?.id);
    const ok = confirm(
      `Excluir usuário ${toStr(u?.name)} (${toStr(
        u?.email
      )})?\n\nIsso remove também dependências (reservas, pets, etc).`
    );
    if (!ok) return;

    try {
      await adminDeleteUser(token, id);
      setUsers((prev) => prev.filter((x) => toStr(x.id) !== id));
      showToast("Usuário excluído.", "success");
    } catch (err) {
      showToast(err?.message || "Erro ao excluir usuário.", "error");
    }
  }

  async function handleChangeRole(u) {
    if (!canManageRoles) {
      showToast("Apenas admin_master pode alterar roles.", "error");
      return;
    }

    const id = toStr(u?.id);
    const current = String(u?.role || "").toLowerCase();
    const next = prompt("Nova role (tutor | caregiver | admin):", current);
    if (!next) return;

    const role = String(next).trim().toLowerCase();
    if (!["tutor", "caregiver", "admin"].includes(role)) {
      showToast("Role inválida.", "error");
      return;
    }

    try {
      const data = await adminSetUserRole(token, id, role);
      const updated = data?.user || { ...u, role };
      setUsers((prev) => prev.map((x) => (toStr(x.id) === id ? updated : x)));
      showToast("Role atualizada.", "success");
    } catch (err) {
      showToast(err?.message || "Erro ao alterar role.", "error");
    }
  }

  /* ===================== ACTIONS: RESERVATIONS ===================== */

  async function handleDeleteReservation(r) {
    const id = toStr(r?.id);
    const ok = confirm(`Excluir a reserva #${id}?`);
    if (!ok) return;

    try {
      await adminDeleteReservation(token, id);
      setReservations((prev) => prev.filter((x) => toStr(x.id) !== id));
      showToast("Reserva excluída.", "success");
    } catch (err) {
      showToast(err?.message || "Erro ao excluir reserva.", "error");
    }
  }

  /* ===================== ACTIONS: REVIEWS ===================== */

  function openHideReview(rv) {
    setReviewToHide(rv);
    setHideModalOpen(true);
  }
  function closeHideReview() {
    if (hideModalLoading) return;
    setHideModalOpen(false);
    setReviewToHide(null);
  }

  async function confirmHideReview(reason) {
    const id = toStr(reviewToHide?.id);
    if (!id) return;

    setHideModalLoading(true);
    try {
      await adminHideReview(token, id, { reason: toStr(reason).trim() || null });

      setReviews((prev) =>
        (prev || []).map((rv) =>
          toStr(rv?.id) === id
            ? {
                ...rv,
                is_hidden: true,
                hidden_reason: toStr(reason).trim() || rv?.hidden_reason,
              }
            : rv
        )
      );

      showToast("Avaliação ocultada.", "success");
      closeHideReview();
    } catch (err) {
      showToast(err?.message || "Erro ao ocultar avaliação.", "error");
    } finally {
      setHideModalLoading(false);
    }
  }

  function openUnhideReview(rv) {
    setReviewToUnhide(rv);
    setUnhideConfirmOpen(true);
  }
  function closeUnhideReview() {
    if (unhideLoading) return;
    setUnhideConfirmOpen(false);
    setReviewToUnhide(null);
  }

  async function confirmUnhideReview() {
    const id = toStr(reviewToUnhide?.id);
    if (!id) return;

    setUnhideLoading(true);
    try {
      await adminUnhideReview(token, id);

      setReviews((prev) =>
        (prev || []).map((rv) =>
          toStr(rv?.id) === id
            ? { ...rv, is_hidden: false, hidden_reason: null, hidden_at: null }
            : rv
        )
      );

      showToast("Avaliação reexibida.", "success");
      closeUnhideReview();
    } catch (err) {
      showToast(err?.message || "Erro ao reexibir avaliação.", "error");
    } finally {
      setUnhideLoading(false);
    }
  }

  /* ===================== UI ===================== */

  function TabButton({ value, children }) {
    const active = tab === value;
    return (
      <button
        onClick={() => setTab(value)}
        className={[
          "px-4 py-2 rounded-full text-sm font-semibold transition",
          active ? "bg-[#5A3A22] text-white" : "bg-white/60 hover:bg-white text-[#5A3A22]",
        ].join(" ")}
      >
        {children}
      </button>
    );
  }

  function StatCard({ label, value, hint }) {
    return (
      <div className="bg-white/80 rounded-2xl border border-black/10 p-4">
        <div className="text-xs font-bold text-[#5A3A22]/70">{label}</div>
        <div className="text-2xl font-extrabold text-[#5A3A22] mt-1">{value}</div>
        {hint ? <div className="text-xs text-[#5A3A22]/70 mt-1">{hint}</div> : null}
      </div>
    );
  }

  const reviewBadge = (rv) =>
    rv?.is_hidden ? (
      <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-red-100 text-red-800 font-extrabold text-xs">
        🔴 Oculta
      </span>
    ) : (
      <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-green-100 text-green-800 font-extrabold text-xs">
        🟢 Visível
      </span>
    );

  function Pager({ onPrev, onNext, offset, limit }) {
    return (
      <div className="flex items-center justify-between gap-2 mt-3">
        <div className="text-sm text-[#5A3A22]/80">
          Mostrando até {limit} itens (offset {offset})
        </div>
        <div className="flex gap-2">
          <button onClick={onPrev} className={btnNeutral()}>
            Anterior
          </button>
          <button onClick={onNext} className={btnNeutral()}>
            Próximo
          </button>
        </div>
      </div>
    );
  }

  // ✅ Card no tamanho padrão do restante do site (WEB + mobile)
  // - max-w-7xl (padrão de páginas mais “cheias”)
  // - px-3 no mobile pra não espremar
  return (
    <div className="min-h-[calc(100vh-120px)] px-3 sm:px-6 lg:px-10 py-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white/80 rounded-2xl shadow-sm border border-black/10 p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-[#5A3A22]">Painel Admin</h1>
              <p className="text-sm text-[#5A3A22]/80">
                {isMaster ? "Você está como Admin Master." : "Você está como Admin."}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <TabButton value="users">Usuários</TabButton>
              <TabButton value="reservations">Reservas</TabButton>
              <TabButton value="reviews">Avaliações</TabButton>
              <TabButton value="logs">Audit Logs</TabButton>
            </div>
          </div>

          {/* STATS */}
          <div className="mt-4 grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard label="Usuários" value={stats.totalUsers} />
            <StatCard label="Bloqueados" value={stats.blockedUsers} hint="nesta página" />
            <StatCard label="Reservas" value={stats.totalReservations} hint="nesta página" />
            <StatCard label="Avaliações" value={stats.totalReviews} />
            <StatCard label="Ocultas" value={stats.hiddenReviews} hint="nesta página" />
          </div>

          <div className="mt-4">
            {loading && <div className="text-sm text-[#5A3A22]/70">Carregando…</div>}

            {/* USERS */}
            {tab === "users" && (
              <div className="mt-3">
                {/* filtros */}
                <div className="flex flex-col lg:flex-row gap-3 lg:items-end lg:justify-between">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <div className="text-xs font-bold text-[#5A3A22]/70 mb-1">Role</div>
                      <select
                        value={userRoleFilter}
                        onChange={(e) => setUserRoleFilter(e.target.value)}
                        className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm bg-white"
                      >
                        <option value="all">Todas</option>
                        <option value="tutor">Tutor</option>
                        <option value="caregiver">Cuidador</option>
                        <option value="admin">Admin</option>
                        <option value="admin_master">Admin Master</option>
                      </select>
                    </div>

                    <div>
                      <div className="text-xs font-bold text-[#5A3A22]/70 mb-1">Bloqueado</div>
                      <select
                        value={userBlockedFilter}
                        onChange={(e) => setUserBlockedFilter(e.target.value)}
                        className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm bg-white"
                      >
                        <option value="all">Todos</option>
                        <option value="unblocked">Somente NÃO</option>
                        <option value="blocked">Somente SIM</option>
                      </select>
                    </div>

                    <div>
                      <div className="text-xs font-bold text-[#5A3A22]/70 mb-1">Buscar</div>
                      <input
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-black/10"
                        placeholder="Nome, email, id…"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => loadUsers(0)} className={btnPrimary()}>
                      Aplicar filtros
                    </button>
                  </div>
                </div>

                {/* DESKTOP tabela */}
                <div className="hidden md:block mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[#5A3A22]">
                        <th className="py-2">ID</th>
                        <th className="py-2">Nome</th>
                        <th className="py-2">Email</th>
                        <th className="py-2">Role</th>
                        <th className="py-2">Bloqueado</th>
                        <th className="py-2">Criado</th>
                        <th className="py-2">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(usersFilteredClient || []).map((u) => (
                        <tr key={toStr(u.id)} className="border-t border-black/10">
                          <td className="py-2 pr-2">{toStr(u.id)}</td>
                          <td className="py-2 pr-2">{toStr(u.name)}</td>
                          <td className="py-2 pr-2">{toStr(u.email)}</td>
                          <td className="py-2 pr-2">
                            <span className="px-2 py-1 rounded-full bg-[#EBCBA9]/60 text-[#5A3A22] font-semibold">
                              {roleLabel(u.role)}
                            </span>
                          </td>
                          <td className="py-2 pr-2">
                            {u.blocked ? (
                              <span className="text-red-700 font-semibold">Sim</span>
                            ) : (
                              <span className="text-green-700 font-semibold">Não</span>
                            )}
                          </td>
                          <td className="py-2 pr-2">{u.created_at ? formatDateBR(u.created_at) : "-"}</td>
                          <td className="py-2">
                            <div className="flex flex-wrap gap-2">
                              <button onClick={() => handleToggleBlocked(u)} className={btnPrimary()}>
                                {u.blocked ? "Desbloquear" : "Bloquear"}
                              </button>

                              <button
                                onClick={() => handleChangeRole(u)}
                                disabled={!canManageRoles}
                                className={canManageRoles ? btnDark() : btnNeutral()}
                                title={
                                  canManageRoles
                                    ? "Alterar role"
                                    : "Apenas admin_master pode alterar roles"
                                }
                              >
                                Role
                              </button>

                              <button onClick={() => handleDeleteUser(u)} className={btnDanger()}>
                                Excluir
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}

                      {!usersFilteredClient?.length && (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-[#5A3A22]/70">
                            Nenhum usuário encontrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* MOBILE lista */}
                <div className="md:hidden mt-3 space-y-3">
                  {(usersFilteredClient || []).map((u) => (
                    <div
                      key={toStr(u.id)}
                      className="bg-white rounded-2xl border border-black/10 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-extrabold text-[#5A3A22]">{toStr(u.name) || "-"}</div>
                          <div className="text-sm text-[#5A3A22]/80 break-all">
                            {toStr(u.email) || "-"}
                          </div>
                        </div>
                        <span className="px-2 py-1 rounded-full bg-[#EBCBA9]/60 text-[#5A3A22] font-semibold text-xs">
                          {roleLabel(u.role)}
                        </span>
                      </div>

                      <div className="mt-2 text-sm text-[#5A3A22]/80 flex flex-wrap gap-3">
                        <span>
                          <b>Bloqueado:</b> {u.blocked ? "Sim" : "Não"}
                        </span>
                        <span>
                          <b>Criado:</b> {u.created_at ? formatDateBR(u.created_at) : "-"}
                        </span>
                        <span>
                          <b>ID:</b> {toStr(u.id)}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={() => handleToggleBlocked(u)} className={btnPrimary()}>
                          {u.blocked ? "Desbloquear" : "Bloquear"}
                        </button>

                        <button
                          onClick={() => handleChangeRole(u)}
                          disabled={!canManageRoles}
                          className={canManageRoles ? btnDark() : btnNeutral()}
                          title={
                            canManageRoles ? "Alterar role" : "Apenas admin_master pode alterar roles"
                          }
                        >
                          Role
                        </button>

                        <button onClick={() => handleDeleteUser(u)} className={btnDanger()}>
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))}

                  {!usersFilteredClient?.length && (
                    <div className="py-6 text-center text-[#5A3A22]/70">
                      Nenhum usuário encontrado.
                    </div>
                  )}
                </div>

                {/* paginação */}
                <Pager
                  offset={usersOffset}
                  limit={usersLimit}
                  onPrev={() => loadUsers(Math.max(usersOffset - usersLimit, 0))}
                  onNext={() => loadUsers(usersOffset + usersLimit)}
                />
              </div>
            )}

            {/* RESERVATIONS */}
            {tab === "reservations" && (
              <div className="mt-3">
                {/* filtros */}
                <div className="flex flex-col lg:flex-row gap-3 lg:items-end lg:justify-between">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <div className="text-xs font-bold text-[#5A3A22]/70 mb-1">Status</div>
                      <select
                        value={resStatusFilter}
                        onChange={(e) => setResStatusFilter(e.target.value)}
                        className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm bg-white"
                      >
                        <option value="all">Todos</option>
                        <option value="Pendente">Pendente</option>
                        <option value="Aceita">Aceita</option>
                        <option value="Recusada">Recusada</option>
                        <option value="Cancelada">Cancelada</option>
                        <option value="Concluída">Concluída</option>
                      </select>
                    </div>

                    <div>
                      <div className="text-xs font-bold text-[#5A3A22]/70 mb-1">Serviço</div>
                      <select
                        value={resServiceFilter}
                        onChange={(e) => setResServiceFilter(e.target.value)}
                        className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm bg-white"
                      >
                        <option value="all">Todos</option>
                        <option value="Hospedagem">Hospedagem</option>
                        <option value="Passeio">Passeio</option>
                        <option value="Visita">Visita</option>
                        <option value="Creche">Creche</option>
                      </select>
                    </div>

                    <div>
                      <div className="text-xs font-bold text-[#5A3A22]/70 mb-1">Buscar</div>
                      <input
                        value={resSearch}
                        onChange={(e) => setResSearch(e.target.value)}
                        className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-black/10"
                        placeholder="Tutor, cuidador, id, serviço…"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => loadReservations(0)} className={btnPrimary()}>
                      Aplicar filtros
                    </button>
                  </div>
                </div>

                {/* DESKTOP tabela */}
                <div className="hidden md:block mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[#5A3A22]">
                        <th className="py-2">ID</th>
                        <th className="py-2">Tutor</th>
                        <th className="py-2">Cuidador</th>
                        <th className="py-2">Serviço</th>
                        <th className="py-2">Status</th>
                        <th className="py-2">Período</th>
                        <th className="py-2">Total</th>
                        <th className="py-2">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(reservationsFilteredClient || []).map((r) => (
                        <tr key={toStr(r.id)} className="border-t border-black/10">
                          <td className="py-2 pr-2">{toStr(r.id)}</td>
                          <td className="py-2 pr-2">{toStr(r.tutor_name)}</td>
                          <td className="py-2 pr-2">{toStr(r.caregiver_name)}</td>
                          <td className="py-2 pr-2">{toStr(r.service)}</td>
                          <td className="py-2 pr-2">{toStr(r.status)}</td>
                          <td className="py-2 pr-2">
                            {r.start_date ? formatDateBR(r.start_date) : "-"} {" → "}
                            {r.end_date ? formatDateBR(r.end_date) : "-"}
                          </td>
                          <td className="py-2 pr-2">{moneyBR(r.total)}</td>
                          <td className="py-2">
                            <button onClick={() => handleDeleteReservation(r)} className={btnDanger()}>
                              Excluir
                            </button>
                          </td>
                        </tr>
                      ))}

                      {!reservationsFilteredClient?.length && (
                        <tr>
                          <td colSpan={8} className="py-6 text-center text-[#5A3A22]/70">
                            Nenhuma reserva encontrada.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* MOBILE lista */}
                <div className="md:hidden mt-3 space-y-3">
                  {(reservationsFilteredClient || []).map((r) => (
                    <div
                      key={toStr(r.id)}
                      className="bg-white rounded-2xl border border-black/10 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-extrabold text-[#5A3A22]">
                          Reserva #{toStr(r.id)}
                        </div>
                        <span className="px-2 py-1 rounded-full bg-[#EBCBA9]/60 text-[#5A3A22] font-extrabold text-xs">
                          {toStr(r.status) || "-"}
                        </span>
                      </div>

                      <div className="mt-2 text-sm text-[#5A3A22]/80 space-y-1">
                        <div>
                          <b>Tutor:</b> {toStr(r.tutor_name) || "-"}
                        </div>
                        <div>
                          <b>Cuidador:</b> {toStr(r.caregiver_name) || "-"}
                        </div>
                        <div>
                          <b>Serviço:</b> {toStr(r.service) || "-"}
                        </div>
                        <div>
                          <b>Período:</b>{" "}
                          {r.start_date ? formatDateBR(r.start_date) : "-"} {" → "}
                          {r.end_date ? formatDateBR(r.end_date) : "-"}
                        </div>
                        <div>
                          <b>Total:</b> {moneyBR(r.total)}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={() => handleDeleteReservation(r)} className={btnDanger()}>
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))}

                  {!reservationsFilteredClient?.length && (
                    <div className="py-6 text-center text-[#5A3A22]/70">
                      Nenhuma reserva encontrada.
                    </div>
                  )}
                </div>

                {/* paginação */}
                <Pager
                  offset={resOffset}
                  limit={resLimit}
                  onPrev={() => loadReservations(Math.max(resOffset - resLimit, 0))}
                  onNext={() => loadReservations(resOffset + resLimit)}
                />
              </div>
            )}

            {/* REVIEWS */}
            {tab === "reviews" && (
              <div className="mt-3">
                {/* filtros */}
                <div className="flex flex-col lg:flex-row gap-3 lg:items-end lg:justify-between">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <div className="text-xs font-bold text-[#5A3A22]/70 mb-1">Ocultas</div>
                      <select
                        value={reviewHiddenFilter}
                        onChange={(e) => setReviewHiddenFilter(e.target.value)}
                        className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm bg-white"
                      >
                        <option value="all">Todas</option>
                        <option value="visible">Somente visíveis</option>
                        <option value="hidden">Somente ocultas</option>
                      </select>
                    </div>

                    <div>
                      <div className="text-xs font-bold text-[#5A3A22]/70 mb-1">Nota</div>
                      <select
                        value={reviewRatingFilter}
                        onChange={(e) => setReviewRatingFilter(e.target.value)}
                        className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm bg-white"
                      >
                        <option value="all">Todas</option>
                        <option value="5">5</option>
                        <option value="4">4</option>
                        <option value="3">3</option>
                        <option value="2">2</option>
                        <option value="1">1</option>
                      </select>
                    </div>

                    <div>
                      <div className="text-xs font-bold text-[#5A3A22]/70 mb-1">Buscar</div>
                      <input
                        value={reviewSearch}
                        onChange={(e) => setReviewSearch(e.target.value)}
                        className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-black/10"
                        placeholder="Nome, comentário, id, serviço…"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => loadReviews(0)} className={btnPrimary()}>
                      Aplicar filtros
                    </button>
                  </div>
                </div>

                {/* tabela (mantive como estava; reviews já está OK no mobile na sua demanda anterior) */}
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[#5A3A22]">
                        <th className="py-2">ID</th>
                        <th className="py-2">Nota</th>
                        <th className="py-2">Comentário</th>
                        <th className="py-2">Tutor</th>
                        <th className="py-2">Cuidador</th>
                        <th className="py-2">Status</th>
                        <th className="py-2">Criada</th>
                        <th className="py-2">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(reviewsFilteredClient || []).map((rv) => {
                        const id = toStr(rv?.id);
                        const hidden = !!rv?.is_hidden;

                        return (
                          <tr key={id} className="border-t border-black/10">
                            <td className="py-2 pr-2">{id}</td>
                            <td className="py-2 pr-2">
                              <span className="px-2 py-1 rounded-full bg-[#EBCBA9]/60 text-[#5A3A22] font-extrabold">
                                {toStr(rv?.rating)}
                              </span>
                            </td>
                            <td className="py-2 pr-2 max-w-[360px]">
                              <div className="line-clamp-2">{toStr(rv?.comment)}</div>
                              {hidden && rv?.hidden_reason ? (
                                <div className="mt-1 text-xs text-red-700 font-semibold">
                                  Motivo: {toStr(rv.hidden_reason)}
                                </div>
                              ) : null}
                            </td>
                            <td className="py-2 pr-2">
                              {toStr(rv?.tutor_name || rv?.reviewer_name)}
                            </td>
                            <td className="py-2 pr-2">
                              {toStr(rv?.caregiver_name || rv?.reviewed_name)}
                            </td>
                            <td className="py-2 pr-2">{reviewBadge(rv)}</td>
                            <td className="py-2 pr-2">
                              {rv?.created_at ? formatDateBR(rv.created_at) : "-"}
                            </td>
                            <td className="py-2">
                              {!hidden ? (
                                <button onClick={() => openHideReview(rv)} className={btnPrimary()}>
                                  Ocultar
                                </button>
                              ) : (
                                <button onClick={() => openUnhideReview(rv)} className={btnDark()}>
                                  Reexibir
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                      {!reviewsFilteredClient?.length && (
                        <tr>
                          <td colSpan={8} className="py-6 text-center text-[#5A3A22]/70">
                            Nenhuma avaliação encontrada com esses filtros.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <Pager
                  offset={reviewOffset}
                  limit={reviewLimit}
                  onPrev={() => loadReviews(Math.max(reviewOffset - reviewLimit, 0))}
                  onNext={() => loadReviews(reviewOffset + reviewLimit)}
                />
              </div>
            )}

            {/* LOGS */}
            {tab === "logs" && (
              <div className="mt-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[#5A3A22]">
                        <th className="py-2">Data</th>
                        <th className="py-2">Ação</th>
                        <th className="py-2">Alvo</th>
                        <th className="py-2">Admin</th>
                        <th className="py-2">Motivo</th>
                        <th className="py-2">Meta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(logs || []).map((l) => (
                        <tr key={toStr(l.id)} className="border-t border-black/10">
                          <td className="py-2 pr-2">
                            {l.created_at ? formatDateBR(l.created_at) : "-"}
                          </td>
                          <td className="py-2 pr-2">
                            <span className="px-2 py-1 rounded-full bg-[#EBCBA9]/60 text-[#5A3A22] font-semibold">
                              {toStr(l.action_type)}
                            </span>
                          </td>
                          <td className="py-2 pr-2">
                            {toStr(l.target_type)} #{toStr(l.target_id)}
                          </td>
                          <td className="py-2 pr-2">
                            {toStr(l.admin_email) || `id:${toStr(l.admin_id)}`}{" "}
                            <span className="text-xs text-[#5A3A22]/70">({toStr(l.admin_role)})</span>
                          </td>
                          <td className="py-2 pr-2">{toStr(l.reason)}</td>
                          <td className="py-2 pr-2">
                            <pre className="text-xs bg-black/5 p-2 rounded-lg max-w-[520px] overflow-auto">
                              {l.meta ? JSON.stringify(l.meta, null, 2) : ""}
                            </pre>
                          </td>
                        </tr>
                      ))}

                      {!logs?.length && (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-[#5A3A22]/70">
                            Nenhum log encontrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <Pager
                  offset={logOffset}
                  limit={logLimit}
                  onPrev={() => loadLogs(Math.max(logOffset - logLimit, 0))}
                  onNext={() => loadLogs(logOffset + logLimit)}
                />
              </div>
            )}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => {
                if (tab === "users") loadUsers(usersOffset);
                if (tab === "reservations") loadReservations(resOffset);
                if (tab === "reviews") loadReviews(reviewOffset);
                if (tab === "logs") loadLogs(logOffset);
              }}
              className={btnPrimary()}
            >
              Recarregar
            </button>
          </div>
        </div>
      </div>

      {/* MODAIS */}
      <HideReviewModal
        open={hideModalOpen}
        review={reviewToHide}
        loading={hideModalLoading}
        onClose={closeHideReview}
        onConfirm={confirmHideReview}
      />

      <ConfirmModal
        open={unhideConfirmOpen}
        title="Reexibir avaliação"
        subtitle={`Confirma reexibir a avaliação #${toStr(reviewToUnhide?.id)}?`}
        confirmText="Reexibir"
        loading={unhideLoading}
        onClose={closeUnhideReview}
        onConfirm={confirmUnhideReview}
      />
    </div>
  );
}
