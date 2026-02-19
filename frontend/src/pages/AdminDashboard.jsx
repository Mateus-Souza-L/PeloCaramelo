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
  // ✅ NOVO: denúncias (reports)
  adminListReports,
  adminUpdateReportStatus,
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

function addDaysISO(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString(); // backend pode tratar
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
  confirmStyle = "danger", // danger | primary | dark
}) {
  const btnStyle =
    confirmStyle === "primary"
      ? { background: "#FFD700", color: "#5A3A22" }
      : confirmStyle === "dark"
      ? { background: "#5A3A22", color: "#fff" }
      : { background: "#95301F", color: "#fff" };

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
            style={btnStyle}
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

/* ===================== Novos Modais: Bloqueio / Role ===================== */

function BlockUserModal({
  open,
  user,
  mode = "block", // block | unblock
  loading = false,
  onClose,
  onConfirm,
}) {
  const [reason, setReason] = useState("");
  const [durationType, setDurationType] = useState("indeterminate"); // indeterminate | days
  const [daysPreset, setDaysPreset] = useState("7"); // 1,3,7,15,30,90,custom
  const [customDays, setCustomDays] = useState("");

  useEffect(() => {
    if (!open) return;
    setReason("");
    setDurationType("indeterminate");
    setDaysPreset("7");
    setCustomDays("");
  }, [open]);

  const uName = toStr(user?.name) || "-";
  const uEmail = toStr(user?.email) || "-";
  const uid = toStr(user?.id);

  const isBlock = mode === "block";

  const finalDays =
    durationType === "days"
      ? daysPreset === "custom"
        ? Number(customDays || 0)
        : Number(daysPreset || 0)
      : null;

  const blockedUntilISO =
    isBlock && durationType === "days" && Number.isFinite(finalDays) && finalDays > 0
      ? addDaysISO(finalDays)
      : null;

  const blockedUntilLabel = useMemo(() => {
    if (!blockedUntilISO) return null;
    try {
      return formatDateBR(blockedUntilISO);
    } catch {
      return null;
    }
  }, [blockedUntilISO]);

  const canSubmit =
    !loading &&
    (!isBlock ||
      durationType === "indeterminate" ||
      (Number.isFinite(finalDays) && finalDays > 0));

  return (
    <ModalBase
      open={open}
      title={isBlock ? "Bloquear usuário" : "Desbloquear usuário"}
      subtitle={uid ? `${uName} • ${uEmail} • ID #${uid}` : `${uName} • ${uEmail}`}
      onClose={loading ? null : onClose}
    >
      <div className="bg-white rounded-2xl border border-black/10 p-4">
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-sm font-extrabold text-[#5A3A22]">
              Motivo {isBlock ? "do bloqueio" : "do desbloqueio"} (opcional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={loading}
              rows={4}
              className="mt-2 w-full rounded-xl border border-black/10 p-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
              placeholder={
                isBlock ? "Ex.: Violação de termos / tentativa de golpe / spam…" : "Ex.: Revisado e liberado…"
              }
            />
          </div>

          {isBlock && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-extrabold text-[#5A3A22]">Tempo do bloqueio</label>
                <select
                  value={durationType}
                  onChange={(e) => setDurationType(e.target.value)}
                  disabled={loading}
                  className="mt-2 w-full rounded-xl border border-black/10 px-3 py-2 text-sm bg-white"
                >
                  <option value="indeterminate">Indeterminado</option>
                  <option value="days">Por X dias</option>
                </select>
              </div>

              {durationType === "days" && (
                <div>
                  <label className="block text-sm font-extrabold text-[#5A3A22]">Duração</label>
                  <div className="mt-2 flex gap-2">
                    <select
                      value={daysPreset}
                      onChange={(e) => setDaysPreset(e.target.value)}
                      disabled={loading}
                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm bg-white"
                    >
                      <option value="1">1 dia</option>
                      <option value="3">3 dias</option>
                      <option value="7">7 dias</option>
                      <option value="15">15 dias</option>
                      <option value="30">30 dias</option>
                      <option value="90">90 dias</option>
                      <option value="custom">Custom</option>
                    </select>

                    {daysPreset === "custom" && (
                      <input
                        value={customDays}
                        onChange={(e) => setCustomDays(e.target.value.replace(/[^\d]/g, ""))}
                        disabled={loading}
                        inputMode="numeric"
                        className="w-32 rounded-xl border border-black/10 px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-black/10"
                        placeholder="Dias"
                      />
                    )}
                  </div>

                  <div className="mt-2 text-xs text-[#5A3A22]/75">
                    {blockedUntilLabel ? (
                      <>
                        Vai ficar bloqueado até: <b className="text-[#5A3A22]">{blockedUntilLabel}</b>
                      </>
                    ) : durationType === "indeterminate" ? (
                      "Bloqueio sem data para expirar."
                    ) : (
                      "Selecione uma duração válida."
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
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
            onClick={() =>
              onConfirm?.({
                reason: toStr(reason).trim() || null,
                duration_type: isBlock ? durationType : null,
                duration_days: isBlock && durationType === "days" ? finalDays : null,
                blocked_until: blockedUntilISO,
              })
            }
            disabled={!canSubmit}
            className={[
              "px-4 py-2 rounded-xl font-extrabold",
              !canSubmit ? "opacity-60 cursor-not-allowed" : "hover:opacity-90",
            ].join(" ")}
            style={{ background: isBlock ? "#95301F" : "#5A3A22", color: "#fff" }}
          >
            {loading ? "Aguarde…" : isBlock ? "Bloquear" : "Desbloquear"}
          </button>
        </div>
      </div>
    </ModalBase>
  );
}

function RoleModal({ open, user, canManageRoles, loading = false, onClose, onConfirm }) {
  const [role, setRole] = useState("tutor");

  useEffect(() => {
    if (!open) return;
    const current = String(user?.role || "tutor").toLowerCase();
    setRole(["tutor", "caregiver", "admin"].includes(current) ? current : "tutor");
  }, [open, user]);

  const uName = toStr(user?.name) || "-";
  const uEmail = toStr(user?.email) || "-";
  const uid = toStr(user?.id);

  return (
    <ModalBase
      open={open}
      title="Alterar role"
      subtitle={uid ? `${uName} • ${uEmail} • ID #${uid}` : `${uName} • ${uEmail}`}
      onClose={loading ? null : onClose}
    >
      <div className="bg-white rounded-2xl border border-black/10 p-4">
        {!canManageRoles ? (
          <div className="text-sm text-[#5A3A22]/80">
            Apenas <b>admin_master</b> pode alterar roles.
          </div>
        ) : (
          <>
            <label className="block text-sm font-extrabold text-[#5A3A22]">Nova role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={loading}
              className="mt-2 w-full rounded-xl border border-black/10 px-3 py-2 text-sm bg-white"
            >
              <option value="tutor">Tutor</option>
              <option value="caregiver">Cuidador</option>
              <option value="admin">Admin</option>
            </select>
          </>
        )}

        <div className="flex justify-end gap-2 mt-4">
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
            onClick={() => onConfirm?.(role)}
            disabled={loading || !canManageRoles}
            className={[
              "px-4 py-2 rounded-xl font-extrabold",
              loading || !canManageRoles ? "opacity-60 cursor-not-allowed" : "hover:opacity-90",
            ].join(" ")}
            style={{ background: "#FFD700", color: "#5A3A22" }}
          >
            {loading ? "Aguarde…" : "Salvar"}
          </button>
        </div>
      </div>
    </ModalBase>
  );
}

/* ===================== NOVO: Modal de status da denúncia ===================== */

function ReportStatusModal({ open, report, loading = false, onClose, onConfirm }) {
  const [status, setStatus] = useState("reviewing");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    const current = String(report?.status || "open").toLowerCase();
    setStatus(["open", "reviewing", "resolved", "dismissed"].includes(current) ? current : "reviewing");
    setNote("");
  }, [open, report]);

  const rid = toStr(report?.id);

  return (
    <ModalBase
      open={open}
      title="Atualizar denúncia"
      subtitle={rid ? `Denúncia #${rid}` : "Atualize o status e salve."}
      onClose={loading ? null : onClose}
    >
      <div className="bg-white rounded-2xl border border-black/10 p-4">
        <label className="block text-sm font-extrabold text-[#5A3A22]">Novo status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          disabled={loading}
          className="mt-2 w-full rounded-xl border border-black/10 px-3 py-2 text-sm bg-white"
        >
          <option value="open">Aberta</option>
          <option value="reviewing">Em análise</option>
          <option value="resolved">Resolvida</option>
          <option value="dismissed">Descartada</option>
        </select>

        <label className="block text-sm font-extrabold text-[#5A3A22] mt-3">Nota interna (opcional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={loading}
          rows={3}
          className="mt-2 w-full rounded-xl border border-black/10 p-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
          placeholder="Ex.: Revisado, evidências insuficientes / usuário bloqueado / orientado…"
        />

        <div className="flex justify-end gap-2 mt-4">
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
            onClick={() => onConfirm?.({ status, note: toStr(note).trim() || null })}
            disabled={loading}
            className={[
              "px-4 py-2 rounded-xl font-extrabold",
              loading ? "opacity-80 cursor-not-allowed" : "hover:opacity-90",
            ].join(" ")}
            style={{ background: "#FFD700", color: "#5A3A22" }}
          >
            {loading ? "Salvando…" : "Salvar"}
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

  const myId = toStr(user?.id);

  function isSelf(u) {
    return myId && toStr(u?.id) === myId;
  }

  function isTargetAdminMaster(u) {
    return String(u?.role || "").toLowerCase() === "admin_master";
  }

  const [tab, setTab] = useState("users"); // users | reservations | reviews | reports | logs
  const [loading, setLoading] = useState(false);

  // data
  const [users, setUsers] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [reports, setReports] = useState([]);
  const [logs, setLogs] = useState([]);

  // -------- Pagination (per tab) --------
  const [usersOffset, setUsersOffset] = useState(0);
  const usersLimit = 50;

  const [resOffset, setResOffset] = useState(0);
  const resLimit = 50;

  const [reviewOffset, setReviewOffset] = useState(0);
  const reviewLimit = 200;

  const [reportsOffset, setReportsOffset] = useState(0);
  const reportsLimit = 50;

  const [logOffset, setLogOffset] = useState(0);
  const logLimit = 50;

  // -------- Filters (Users) --------
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [userBlockedFilter, setUserBlockedFilter] = useState("all");
  const [userSearch, setUserSearch] = useState("");

  // -------- Filters (Reservations) --------
  const [resStatusFilter, setResStatusFilter] = useState("all");
  const [resServiceFilter, setResServiceFilter] = useState("all");
  const [resSearch, setResSearch] = useState("");

  // -------- Filters (Reviews) --------
  const [reviewHiddenFilter, setReviewHiddenFilter] = useState("all");
  const [reviewRatingFilter, setReviewRatingFilter] = useState("all");
  const [reviewSearch, setReviewSearch] = useState("");

  // ✅ Filters (Reports)
  const [reportStatusFilter, setReportStatusFilter] = useState("all"); // all | open | reviewing | resolved | dismissed
  const [reportSearch, setReportSearch] = useState("");

  // -------- Modals reviews --------
  const [hideModalOpen, setHideModalOpen] = useState(false);
  const [hideModalLoading, setHideModalLoading] = useState(false);
  const [reviewToHide, setReviewToHide] = useState(null);

  const [unhideConfirmOpen, setUnhideConfirmOpen] = useState(false);
  const [unhideLoading, setUnhideLoading] = useState(false);
  const [reviewToUnhide, setReviewToUnhide] = useState(null);

  // ✅ Modais reports
  const [reportStatusOpen, setReportStatusOpen] = useState(false);
  const [reportStatusLoading, setReportStatusLoading] = useState(false);
  const [reportToUpdate, setReportToUpdate] = useState(null);

  // -------- Modals users/actions --------
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockModalLoading, setBlockModalLoading] = useState(false);
  const [blockUser, setBlockUser] = useState(null);
  const [blockMode, setBlockMode] = useState("block"); // block | unblock

  const [deleteUserOpen, setDeleteUserOpen] = useState(false);
  const [deleteUserLoading, setDeleteUserLoading] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleModalLoading, setRoleModalLoading] = useState(false);
  const [userToRole, setUserToRole] = useState(null);

  const [deleteResOpen, setDeleteResOpen] = useState(false);
  const [deleteResLoading, setDeleteResLoading] = useState(false);
  const [resToDelete, setResToDelete] = useState(null);

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

  // ✅ NOVO: load reports
  const loadReports = useCallback(
    async (offset = reportsOffset) => {
      if (!token) return;

      const status = reportStatusFilter === "all" ? null : reportStatusFilter;

      setLoading(true);
      try {
        const data = await adminListReports(token, {
          limit: reportsLimit,
          offset,
          status,
          q: reportSearch,
        });

        const list = data?.items || data?.reports || [];
        setReports(Array.isArray(list) ? list : []);
        setReportsOffset(data?.offset ?? data?.meta?.offset ?? offset);
      } catch (err) {
        showToast(err?.message || "Erro ao carregar denúncias.", "error");
      } finally {
        setLoading(false);
      }
    },
    [token, showToast, reportsLimit, reportsOffset, reportStatusFilter, reportSearch]
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
    if (tab === "reports") loadReports(0);
    if (tab === "logs") loadLogs(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  /* ===================== STATS ===================== */

  const stats = useMemo(() => {
    const totalUsers = users?.length || 0;
    const blockedUsers = (users || []).filter((u) => !!u?.blocked).length;
    const totalReservations = reservations?.length || 0;
    const totalReviews = reviews?.length || 0;
    const hiddenReviews = (reviews || []).filter((rv) => !!rv?.is_hidden).length;

    const totalReports = reports?.length || 0;
    const openReports = (reports || []).filter((rp) => String(rp?.status || "open").toLowerCase() === "open").length;

    return {
      totalUsers,
      blockedUsers,
      totalReservations,
      totalReviews,
      hiddenReviews,
      totalReports,
      openReports,
    };
  }, [users, reservations, reviews, reports]);

  /* ===================== FILTERS client ===================== */

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

  const reportsFilteredClient = useMemo(() => {
    const q = toStr(reportSearch).trim().toLowerCase();
    if (!q) return reports || [];
    return (reports || []).filter((rp) => {
      const hay = [
        rp?.id,
        rp?.status,
        rp?.reason,
        rp?.description,
        rp?.reported_name,
        rp?.reported_email,
        rp?.reporter_name,
        rp?.reporter_email,
        rp?.reported_id,
        rp?.reporter_id,
      ]
        .map((x) => toStr(x).toLowerCase())
        .join(" | ");
      return hay.includes(q);
    });
  }, [reports, reportSearch]);

  /* ===================== ACTIONS: USERS ===================== */

  function openBlockModal(u) {
    const next = !u?.blocked;
    setBlockUser(u);
    setBlockMode(next ? "block" : "unblock");
    setBlockModalOpen(true);
  }

  function closeBlockModal() {
    if (blockModalLoading) return;
    setBlockModalOpen(false);
    setBlockUser(null);
  }

  async function confirmBlockModal(payload) {
    const u = blockUser;
    const id = toStr(u?.id);
    if (!id) return;

    const next = blockMode === "block";

    setBlockModalLoading(true);
    try {
      const body = {
        blocked: next,
        reason: payload?.reason ?? null,
        duration_type: payload?.duration_type ?? null,
        duration_days: payload?.duration_days ?? null,
        blocked_until: payload?.blocked_until ?? null,
      };

      const data = await adminSetUserBlocked(token, id, body);

      const updated = data?.user || { ...u, blocked: next };
      setUsers((prev) => prev.map((x) => (toStr(x.id) === id ? updated : x)));

      showToast(next ? "Usuário bloqueado." : "Usuário desbloqueado.", "success");
      closeBlockModal();
    } catch (err) {
      showToast(err?.message || "Erro ao atualizar bloqueio.", "error");
    } finally {
      setBlockModalLoading(false);
    }
  }

  function openDeleteUser(u) {
    setUserToDelete(u);
    setDeleteUserOpen(true);
  }
  function closeDeleteUser() {
    if (deleteUserLoading) return;
    setDeleteUserOpen(false);
    setUserToDelete(null);
  }

  async function confirmDeleteUser() {
    const u = userToDelete;
    const id = toStr(u?.id);
    if (!id) return;

    setDeleteUserLoading(true);
    try {
      await adminDeleteUser(token, id);
      setUsers((prev) => prev.filter((x) => toStr(x.id) !== id));
      showToast("Usuário excluído.", "success");
      closeDeleteUser();
    } catch (err) {
      showToast(err?.message || "Erro ao excluir usuário.", "error");
    } finally {
      setDeleteUserLoading(false);
    }
  }

  function openRoleModal(u) {
    setUserToRole(u);
    setRoleModalOpen(true);
  }
  function closeRoleModal() {
    if (roleModalLoading) return;
    setRoleModalOpen(false);
    setUserToRole(null);
  }

  async function confirmRoleModal(role) {
    if (!canManageRoles) {
      showToast("Apenas admin_master pode alterar roles.", "error");
      return;
    }

    const u = userToRole;
    const id = toStr(u?.id);
    if (!id) return;

    const nextRole = String(role || "").trim().toLowerCase();
    if (!["tutor", "caregiver", "admin"].includes(nextRole)) {
      showToast("Role inválida.", "error");
      return;
    }

    setRoleModalLoading(true);
    try {
      const data = await adminSetUserRole(token, id, nextRole);
      const updated = data?.user || { ...u, role: nextRole };
      setUsers((prev) => prev.map((x) => (toStr(x.id) === id ? updated : x)));
      showToast("Role atualizada.", "success");
      closeRoleModal();
    } catch (err) {
      showToast(err?.message || "Erro ao alterar role.", "error");
    } finally {
      setRoleModalLoading(false);
    }
  }

  /* ===================== ACTIONS: RESERVATIONS ===================== */

  function openDeleteReservation(r) {
    setResToDelete(r);
    setDeleteResOpen(true);
  }
  function closeDeleteReservation() {
    if (deleteResLoading) return;
    setDeleteResOpen(false);
    setResToDelete(null);
  }

  async function confirmDeleteReservation() {
    const r = resToDelete;
    const id = toStr(r?.id);
    if (!id) return;

    setDeleteResLoading(true);
    try {
      await adminDeleteReservation(token, id);
      setReservations((prev) => prev.filter((x) => toStr(x.id) !== id));
      showToast("Reserva excluída.", "success");
      closeDeleteReservation();
    } catch (err) {
      showToast(err?.message || "Erro ao excluir reserva.", "error");
    } finally {
      setDeleteResLoading(false);
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
          toStr(rv?.id) === id ? { ...rv, is_hidden: false, hidden_reason: null, hidden_at: null } : rv
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

  /* ===================== ACTIONS: REPORTS ===================== */

  function openReportStatus(rp) {
    setReportToUpdate(rp);
    setReportStatusOpen(true);
  }
  function closeReportStatus() {
    if (reportStatusLoading) return;
    setReportStatusOpen(false);
    setReportToUpdate(null);
  }

  async function confirmReportStatus(payload) {
    const rp = reportToUpdate;
    const id = toStr(rp?.id);
    if (!id) return;

    const nextStatus = String(payload?.status || "").toLowerCase();
    if (!["open", "reviewing", "resolved", "dismissed"].includes(nextStatus)) {
      showToast("Status inválido.", "error");
      return;
    }

    setReportStatusLoading(true);
    try {
      const data = await adminUpdateReportStatus(token, id, {
        status: nextStatus,
        note: payload?.note ?? null,
      });

      const updated = data?.report || { ...rp, status: nextStatus, admin_note: payload?.note ?? rp?.admin_note };
      setReports((prev) => (prev || []).map((x) => (toStr(x?.id) === id ? updated : x)));

      showToast("Denúncia atualizada.", "success");
      closeReportStatus();
    } catch (err) {
      showToast(err?.message || "Erro ao atualizar denúncia.", "error");
    } finally {
      setReportStatusLoading(false);
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

  const reportBadge = (rp) => {
    const st = String(rp?.status || "open").toLowerCase();
    if (st === "resolved") {
      return (
        <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-green-100 text-green-800 font-extrabold text-xs">
          ✅ Resolvida
        </span>
      );
    }
    if (st === "dismissed") {
      return (
        <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-gray-200 text-gray-800 font-extrabold text-xs">
          ⚪ Descartada
        </span>
      );
    }
    if (st === "reviewing") {
      return (
        <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-yellow-100 text-yellow-900 font-extrabold text-xs">
          🟡 Em análise
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-red-100 text-red-800 font-extrabold text-xs">
        🔴 Aberta
      </span>
    );
  };

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

  return (
    <div className="min-h-[calc(100vh-120px)] px-3 sm:px-6 lg:px-10 py-6">
      <div className="max-w-7xl mx-auto">
        {/* ✅ card padrão do site */}
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
              <TabButton value="reports">Denúncias</TabButton>
              <TabButton value="logs">Audit Logs</TabButton>
            </div>
          </div>

          {/* STATS */}
          <div className="mt-4 grid grid-cols-2 lg:grid-cols-6 gap-3">
            <StatCard label="Usuários" value={stats.totalUsers} />
            <StatCard label="Bloqueados" value={stats.blockedUsers} hint="nesta página" />
            <StatCard label="Reservas" value={stats.totalReservations} hint="nesta página" />
            <StatCard label="Avaliações" value={stats.totalReviews} />
            <StatCard label="Ocultas" value={stats.hiddenReviews} hint="nesta página" />
            <StatCard label="Denúncias" value={stats.totalReports} hint={`${stats.openReports} abertas (nesta página)`} />
          </div>

          <div className="mt-4">
            {loading && <div className="text-sm text-[#5A3A22]/70">Carregando…</div>}

            {/* USERS */}
            {tab === "users" && (
              <div className="mt-3">
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
                              <button
                                onClick={() => openBlockModal(u)}
                                disabled={isSelf(u)}
                                className={isSelf(u) ? btnNeutral() : btnPrimary()}
                                title={isSelf(u) ? "Você não pode bloquear a si mesmo" : ""}
                              >
                                {u.blocked ? "Desbloquear" : "Bloquear"}
                              </button>

                              <button
                                onClick={() => openRoleModal(u)}
                                disabled={!canManageRoles || isSelf(u) || isTargetAdminMaster(u)}
                                className={
                                  !canManageRoles || isSelf(u) || isTargetAdminMaster(u) ? btnNeutral() : btnDark()
                                }
                                title={
                                  !canManageRoles
                                    ? "Apenas admin_master pode alterar roles"
                                    : isSelf(u)
                                    ? "Você não pode alterar sua própria role"
                                    : isTargetAdminMaster(u)
                                    ? "Não é permitido alterar o admin_master"
                                    : "Alterar role"
                                }
                              >
                                Role
                              </button>

                              <button
                                onClick={() => openDeleteUser(u)}
                                disabled={isSelf(u)}
                                className={isSelf(u) ? btnNeutral() : btnDanger()}
                                title={isSelf(u) ? "Você não pode excluir a si mesmo" : ""}
                              >
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

                <div className="md:hidden mt-3 space-y-3">
                  {(usersFilteredClient || []).map((u) => (
                    <div key={toStr(u.id)} className="bg-white rounded-2xl border border-black/10 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-extrabold text-[#5A3A22]">{toStr(u.name) || "-"}</div>
                          <div className="text-sm text-[#5A3A22]/80 break-all">{toStr(u.email) || "-"}</div>
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
                        <button
                          onClick={() => openBlockModal(u)}
                          disabled={isSelf(u)}
                          className={isSelf(u) ? btnNeutral() : btnPrimary()}
                          title={isSelf(u) ? "Você não pode bloquear a si mesmo" : ""}
                        >
                          {u.blocked ? "Desbloquear" : "Bloquear"}
                        </button>

                        <button
                          onClick={() => openRoleModal(u)}
                          disabled={!canManageRoles || isSelf(u) || isTargetAdminMaster(u)}
                          className={!canManageRoles || isSelf(u) || isTargetAdminMaster(u) ? btnNeutral() : btnDark()}
                          title={
                            !canManageRoles
                              ? "Apenas admin_master pode alterar roles"
                              : isSelf(u)
                              ? "Você não pode alterar sua própria role"
                              : isTargetAdminMaster(u)
                              ? "Não é permitido alterar o admin_master"
                              : "Alterar role"
                          }
                        >
                          Role
                        </button>

                        <button
                          onClick={() => openDeleteUser(u)}
                          disabled={isSelf(u)}
                          className={isSelf(u) ? btnNeutral() : btnDanger()}
                          title={isSelf(u) ? "Você não pode excluir a si mesmo" : ""}
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))}

                  {!usersFilteredClient?.length && (
                    <div className="py-6 text-center text-[#5A3A22]/70">Nenhum usuário encontrado.</div>
                  )}
                </div>

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
                            <button onClick={() => openDeleteReservation(r)} className={btnDanger()}>
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

                <div className="md:hidden mt-3 space-y-3">
                  {(reservationsFilteredClient || []).map((r) => (
                    <div key={toStr(r.id)} className="bg-white rounded-2xl border border-black/10 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-extrabold text-[#5A3A22]">Reserva #{toStr(r.id)}</div>
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
                          <b>Período:</b> {r.start_date ? formatDateBR(r.start_date) : "-"} {" → "}
                          {r.end_date ? formatDateBR(r.end_date) : "-"}
                        </div>
                        <div>
                          <b>Total:</b> {moneyBR(r.total)}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={() => openDeleteReservation(r)} className={btnDanger()}>
                          Excluir
                        </button>
                      </div>
                    </div>
                  ))}

                  {!reservationsFilteredClient?.length && (
                    <div className="py-6 text-center text-[#5A3A22]/70">Nenhuma reserva encontrada.</div>
                  )}
                </div>

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
                            <td className="py-2 pr-2">{toStr(rv?.tutor_name || rv?.reviewer_name)}</td>
                            <td className="py-2 pr-2">{toStr(rv?.caregiver_name || rv?.reviewed_name)}</td>
                            <td className="py-2 pr-2">{reviewBadge(rv)}</td>
                            <td className="py-2 pr-2">{rv?.created_at ? formatDateBR(rv.created_at) : "-"}</td>
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

            {/* REPORTS */}
            {tab === "reports" && (
              <div className="mt-3">
                <div className="flex flex-col lg:flex-row gap-3 lg:items-end lg:justify-between">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <div className="text-xs font-bold text-[#5A3A22]/70 mb-1">Status</div>
                      <select
                        value={reportStatusFilter}
                        onChange={(e) => setReportStatusFilter(e.target.value)}
                        className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm bg-white"
                      >
                        <option value="all">Todos</option>
                        <option value="open">Abertas</option>
                        <option value="reviewing">Em análise</option>
                        <option value="resolved">Resolvidas</option>
                        <option value="dismissed">Descartadas</option>
                      </select>
                    </div>

                    <div>
                      <div className="text-xs font-bold text-[#5A3A22]/70 mb-1">Buscar</div>
                      <input
                        value={reportSearch}
                        onChange={(e) => setReportSearch(e.target.value)}
                        className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-black/10"
                        placeholder="Usuário, email, motivo, id…"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => loadReports(0)} className={btnPrimary()}>
                      Aplicar filtros
                    </button>
                  </div>
                </div>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[#5A3A22]">
                        <th className="py-2">ID</th>
                        <th className="py-2">Denunciado</th>
                        <th className="py-2">Denunciante</th>
                        <th className="py-2">Motivo</th>
                        <th className="py-2">Descrição</th>
                        <th className="py-2">Status</th>
                        <th className="py-2">Criada</th>
                        <th className="py-2">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(reportsFilteredClient || []).map((rp) => (
                        <tr key={toStr(rp?.id)} className="border-t border-black/10">
                          <td className="py-2 pr-2">{toStr(rp?.id)}</td>
                          <td className="py-2 pr-2">
                            <div className="font-extrabold text-[#5A3A22]">{toStr(rp?.reported_name) || "-"}</div>
                            <div className="text-xs text-[#5A3A22]/70 break-all">{toStr(rp?.reported_email) || ""}</div>
                          </td>
                          <td className="py-2 pr-2">
                            <div className="font-extrabold text-[#5A3A22]">{toStr(rp?.reporter_name) || "-"}</div>
                            <div className="text-xs text-[#5A3A22]/70 break-all">{toStr(rp?.reporter_email) || ""}</div>
                          </td>
                          <td className="py-2 pr-2">{toStr(rp?.reason) || "-"}</td>
                          <td className="py-2 pr-2 max-w-[420px]">
                            <div className="line-clamp-2">{toStr(rp?.description) || "-"}</div>
                          </td>
                          <td className="py-2 pr-2">{reportBadge(rp)}</td>
                          <td className="py-2 pr-2">{rp?.created_at ? formatDateBR(rp.created_at) : "-"}</td>
                          <td className="py-2">
                            <button onClick={() => openReportStatus(rp)} className={btnPrimary()}>
                              Atualizar
                            </button>
                          </td>
                        </tr>
                      ))}

                      {!reportsFilteredClient?.length && (
                        <tr>
                          <td colSpan={8} className="py-6 text-center text-[#5A3A22]/70">
                            Nenhuma denúncia encontrada.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <Pager
                  offset={reportsOffset}
                  limit={reportsLimit}
                  onPrev={() => loadReports(Math.max(reportsOffset - reportsLimit, 0))}
                  onNext={() => loadReports(reportsOffset + reportsLimit)}
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
                          <td className="py-2 pr-2">{l.created_at ? formatDateBR(l.created_at) : "-"}</td>
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
                if (tab === "reports") loadReports(reportsOffset);
                if (tab === "logs") loadLogs(logOffset);
              }}
              className={btnPrimary()}
            >
              Recarregar
            </button>
          </div>
        </div>
      </div>

      {/* MODAIS: Reviews */}
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
        confirmStyle="dark"
        loading={unhideLoading}
        onClose={closeUnhideReview}
        onConfirm={confirmUnhideReview}
      />

      {/* MODAL: Bloquear/Desbloquear */}
      <BlockUserModal
        open={blockModalOpen}
        user={blockUser}
        mode={blockMode}
        loading={blockModalLoading}
        onClose={closeBlockModal}
        onConfirm={confirmBlockModal}
      />

      {/* MODAL: Excluir usuário */}
      <ConfirmModal
        open={deleteUserOpen}
        title="Excluir usuário"
        subtitle={`Confirma excluir ${toStr(userToDelete?.name)} (${toStr(userToDelete?.email)})?\n\nIsso remove também dependências (reservas, pets, etc).`}
        confirmText="Excluir"
        confirmStyle="danger"
        loading={deleteUserLoading}
        onClose={closeDeleteUser}
        onConfirm={confirmDeleteUser}
      />

      {/* MODAL: Alterar role */}
      <RoleModal
        open={roleModalOpen}
        user={userToRole}
        canManageRoles={canManageRoles}
        loading={roleModalLoading}
        onClose={closeRoleModal}
        onConfirm={confirmRoleModal}
      />

      {/* MODAL: Excluir reserva */}
      <ConfirmModal
        open={deleteResOpen}
        title="Excluir reserva"
        subtitle={`Confirma excluir a reserva #${toStr(resToDelete?.id)}?`}
        confirmText="Excluir"
        confirmStyle="danger"
        loading={deleteResLoading}
        onClose={closeDeleteReservation}
        onConfirm={confirmDeleteReservation}
      />

      {/* ✅ MODAL: Atualizar denúncia */}
      <ReportStatusModal
        open={reportStatusOpen}
        report={reportToUpdate}
        loading={reportStatusLoading}
        onClose={closeReportStatus}
        onConfirm={confirmReportStatus}
      />
    </div>
  );
}
