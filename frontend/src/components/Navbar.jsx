// frontend/src/components/Navbar.jsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Bell, Menu, X, ChevronDown, Instagram } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { authRequest } from "../services/api";
import {
  appendReservationNotifs,
  getUnreadReservationNotifsCount,
  loadReservationNotifs,
} from "../utils/reservationNotifs";
import { useToast } from "./ToastProvider";

/* ============================================================
   Modal: Criar perfil de cuidador (com serviços + capacidade diária)
   - Mantém estilo do app (cores)
   - Valida obrigatórios
   ============================================================ */

const SERVICE_OPTIONS = [
  { key: "hospedagem", label: "Hospedagem" },
  { key: "creche", label: "Creche" },
  { key: "passeio", label: "Passeio" },
  { key: "visita", label: "Visita / Pet Sitter" },
  { key: "banho", label: "Banho & Tosa" },
];

function CreateCaregiverProfileModal({
  open,
  loading,
  onClose,
  onConfirm,
  initialServices = [],
  initialDailyCapacity = 3,
}) {
  const [services, setServices] = useState(initialServices);
  const [dailyCapacity, setDailyCapacity] = useState(initialDailyCapacity);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setServices(Array.isArray(initialServices) ? initialServices : []);
    setDailyCapacity(
      Number.isFinite(Number(initialDailyCapacity)) ? Number(initialDailyCapacity) : 3
    );
    setError(null);
  }, [open, initialServices, initialDailyCapacity]);

  if (!open) return null;

  const colors = {
    brown: "#5A3A22",
    yellow: "#FFD700",
    beige: "#EBCBA9",
    red: "#95301F",
  };

  const toggleService = (label) => {
    setServices((prev) => {
      const set = new Set(prev || []);
      if (set.has(label)) set.delete(label);
      else set.add(label);
      return Array.from(set);
    });
  };

  const handleConfirm = () => {
    const picked = (services || []).map((s) => String(s).trim()).filter(Boolean);
    const cap = Number(dailyCapacity);

    if (!picked.length) {
      setError("Selecione pelo menos 1 serviço.");
      return;
    }
    if (!Number.isFinite(cap) || cap < 1) {
      setError("Informe a quantidade de reservas por dia (mínimo 1).");
      return;
    }

    setError(null);
    onConfirm?.({ services: picked, daily_capacity: Math.floor(cap) });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999,
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) onClose?.();
      }}
    >
      <div
        style={{
          width: "min(720px, 100%)",
          background: "#fff",
          borderRadius: 18,
          overflow: "hidden",
          boxShadow: "0 12px 30px rgba(0,0,0,0.22)",
          border: "1px solid #eee",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ padding: 18, borderBottom: "1px solid #eee", background: "#fff" }}>
          <div style={{ fontSize: 18, fontWeight: 1000, color: colors.brown }}>
            Criar perfil de cuidador(a)
          </div>
          <div style={{ marginTop: 8, color: "#333", lineHeight: 1.4, fontSize: 13 }}>
            Antes de criar, escolha os <b>serviços</b> e a <b>capacidade diária</b>.
          </div>
        </div>

        <div style={{ padding: 18, background: "#fafafa" }}>
          <div style={{ display: "grid", gap: 14 }}>
            {/* Serviços */}
            <div
              style={{
                padding: 12,
                borderRadius: 14,
                border: "1px solid #f0e5d7",
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 1000, color: colors.brown, fontSize: 13 }}>
                Serviços prestados <span style={{ color: colors.red }}>*</span>
              </div>

              <div
                style={{
                  marginTop: 10,
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 10,
                }}
              >
                {SERVICE_OPTIONS.map((opt) => {
                  const checked = (services || []).includes(opt.label);
                  return (
                    <label
                      key={opt.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: 10,
                        borderRadius: 12,
                        border: `1px solid ${checked ? "#e7c95a" : "#eee"}`,
                        background: checked ? "#fff7cc" : "#fff",
                        cursor: loading ? "not-allowed" : "pointer",
                        opacity: loading ? 0.75 : 1,
                        userSelect: "none",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={loading}
                        onChange={() => toggleService(opt.label)}
                        style={{ transform: "scale(1.05)" }}
                      />
                      <span style={{ fontWeight: 800, color: "#222", fontSize: 13 }}>
                        {opt.label}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
                Você poderá editar isso depois no seu perfil de cuidador(a).
              </div>
            </div>

            {/* Capacidade diária */}
            <div
              style={{
                padding: 12,
                borderRadius: 14,
                border: "1px solid #f0e5d7",
                background: colors.beige,
              }}
            >
              <div style={{ fontWeight: 1000, color: colors.brown, fontSize: 13 }}>
                Quantidade de reservas por dia <span style={{ color: colors.red }}>*</span>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={dailyCapacity}
                  disabled={loading}
                  onChange={(e) => setDailyCapacity(e.target.value)}
                  style={{
                    width: 120,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #e6d5bf",
                    outline: "none",
                    fontWeight: 900,
                    color: "#222",
                    background: "#fff",
                  }}
                />
                <div style={{ fontSize: 12, color: "#333", lineHeight: 1.35 }}>
                  Defina quantas reservas você aceita por dia (capacidade diária).
                </div>
              </div>
            </div>

            {/* Erro */}
            {error && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid rgba(149,48,31,0.25)",
                  background: "rgba(149,48,31,0.08)",
                  color: colors.red,
                  fontWeight: 900,
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            padding: 18,
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            background: "#fff",
            borderTop: "1px solid #eee",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "#fff",
              color: "#333",
              fontWeight: 900,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid transparent",
              background: colors.yellow,
              color: colors.brown,
              fontWeight: 1000,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.85 : 1,
            }}
          >
            {loading ? "Criando..." : "Criar perfil"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Modal: Criar perfil de tutor (confirmação)
   ============================================================ */

function CreateTutorProfileModal({ open, loading, onClose, onConfirm }) {
  if (!open) return null;

  const colors = {
    brown: "#5A3A22",
    yellow: "#FFD700",
    beige: "#EBCBA9",
    red: "#95301F",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999,
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) onClose?.();
      }}
    >
      <div
        style={{
          width: "min(620px, 100%)",
          background: "#fff",
          borderRadius: 18,
          overflow: "hidden",
          boxShadow: "0 12px 30px rgba(0,0,0,0.22)",
          border: "1px solid #eee",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ padding: 18, borderBottom: "1px solid #eee", background: "#fff" }}>
          <div style={{ fontSize: 18, fontWeight: 1000, color: colors.brown }}>
            Criar perfil de tutor(a)
          </div>
          <div style={{ marginTop: 8, color: "#333", lineHeight: 1.4, fontSize: 13 }}>
            Ao confirmar, você poderá alternar para <b>Tutor</b> no Painel e fazer reservas
            normalmente.
          </div>
        </div>

        <div style={{ padding: 18, background: "#fafafa" }}>
          <div
            style={{
              padding: 12,
              borderRadius: 14,
              border: "1px solid #f0e5d7",
              background: colors.beige,
              color: "#222",
              fontSize: 13,
              lineHeight: 1.4,
              fontWeight: 900,
            }}
          >
            Confirma a criação do perfil de tutor(a)?
          </div>
        </div>

        <div
          style={{
            padding: 18,
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            background: "#fff",
            borderTop: "1px solid #eee",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "#fff",
              color: "#333",
              fontWeight: 900,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid transparent",
              background: colors.yellow,
              color: colors.brown,
              fontWeight: 1000,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.85 : 1,
            }}
          >
            {loading ? "Criando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Modal: Confirmar logout
   ============================================================ */

function ConfirmLogoutModal({ open, onClose, onConfirm, loading = false }) {
  if (!open) return null;

  const colors = {
    brown: "#5A3A22",
    yellow: "#FFD700",
    beige: "#EBCBA9",
    red: "#95301F",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999,
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) onClose?.();
      }}
    >
      <div
        style={{
          width: "min(560px, 100%)",
          background: "#fff",
          borderRadius: 18,
          overflow: "hidden",
          boxShadow: "0 12px 30px rgba(0,0,0,0.22)",
          border: "1px solid #eee",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ padding: 18, borderBottom: "1px solid #eee", background: "#fff" }}>
          <div style={{ fontSize: 18, fontWeight: 1000, color: colors.brown }}>Sair da conta</div>
          <div style={{ marginTop: 8, color: "#333", lineHeight: 1.4, fontSize: 13 }}>
            Tem certeza que deseja sair da sua conta?
          </div>
        </div>

        <div style={{ padding: 18, background: "#fafafa" }}>
          <div
            style={{
              padding: 12,
              borderRadius: 14,
              border: "1px solid #f0e5d7",
              background: colors.beige,
              color: "#222",
              fontSize: 13,
              lineHeight: 1.4,
              fontWeight: 900,
            }}
          >
            Você precisará fazer login novamente para acessar o painel e seus dados.
          </div>
        </div>

        <div
          style={{
            padding: 18,
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            background: "#fff",
            borderTop: "1px solid #eee",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "#fff",
              color: "#333",
              fontWeight: 900,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid transparent",
              background: colors.yellow,
              color: colors.brown,
              fontWeight: 1000,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.85 : 1,
            }}
          >
            {loading ? "Saindo..." : "Confirmar saída"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Navbar() {
  const {
    user,
    logout,
    token,
    hasCaregiverProfile,
    activeMode,
    setMode,

    requestCreateCaregiverProfile, // mantido por compatibilidade (não usamos mais aqui)
    creatingProfile,

    refreshMe,
  } = useAuth();

  const { addToast } = useToast();

  const navigate = useNavigate();
  const location = useLocation();

  // ✅ Somente link web
  const INSTAGRAM_USERNAME = "pelo_caramelo";
  const INSTAGRAM_WEB_URL = `https://www.instagram.com/${INSTAGRAM_USERNAME}/`;

  // aviso leve no mobile (Android/iOS) caso o sistema abra o app
  const maybeShowInstagramMobileHint = useCallback(() => {
    const ua = (navigator?.userAgent || "").toLowerCase();
    const isMobile =
      /android|iphone|ipad|ipod/.test(ua) ||
      (typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(max-width: 767px)").matches
        : false);

    if (!isMobile) return;

    addToast?.({
      type: "info",
      message:
        "Se o Instagram abrir no app automaticamente, isso é do seu celular. Para ver no navegador: ⋮ (menu) → “Abrir no navegador”.",
      duration: 5000,
    });
  }, [addToast]);

  // ============================================================
  // session helpers (usar o mesmo STORAGE_KEY do AuthContext)
  // ============================================================
  const readSession = () => {
    try {
      const raw = localStorage.getItem("pelocaramelo_auth");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const persistSession = (patch) => {
    try {
      const prev = readSession() || {};
      const next = { ...prev, ...patch };
      localStorage.setItem("pelocaramelo_auth", JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const role = String(user?.role || "").toLowerCase().trim();
  const isAdminLike = role === "admin" || role === "admin_master";

  const [chatUnreadIds, setChatUnreadIds] = useState([]);
  const [reservationUnreadCount, setReservationUnreadCount] = useState(0);

  // ✅ menu mobile
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  // ✅ dropdown Painel (desktop)
  const [panelOpen, setPanelOpen] = useState(false);
  const panelWrapRef = useRef(null);

  // ✅ modal (cuidador)
  const [createCareOpen, setCreateCareOpen] = useState(false);
  const [createCareLoading, setCreateCareLoading] = useState(false);

  // ✅ modal (tutor)
  const [createTutorOpen, setCreateTutorOpen] = useState(false);
  const [createTutorLoading, setCreateTutorLoading] = useState(false);

  // ✅ modal (logout confirm)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const chatUnreadCount = chatUnreadIds.length;
  const totalUnread = chatUnreadCount + reservationUnreadCount;

  const chatFetchGuardRef = useRef({ inFlight: false, lastAt: 0 });
  const resFetchGuardRef = useRef({ inFlight: false, lastAt: 0 });

  const emitRoleChanged = useCallback((nextRole) => {
    const next = nextRole === "caregiver" ? "caregiver" : "tutor";
    window.dispatchEvent(new CustomEvent("active-role-changed", { detail: { role: next } }));
  }, []);

  const inferredDefaultMode = useMemo(() => {
    if (isAdminLike) return "admin";
    if (activeMode === "caregiver" || activeMode === "tutor") return activeMode;
    if (role === "caregiver") return "caregiver";
    return "tutor";
  }, [isAdminLike, activeMode, role]);

  const effectiveMode = inferredDefaultMode;
  const isTutor = effectiveMode === "tutor";
  const isCaregiver = effectiveMode === "caregiver";

  const hasTutorProfile = useMemo(() => {
    const saved = readSession();
    const savedHasTutor = Boolean(saved?.hasTutorProfile ?? false);
    if (role === "tutor") return true;
    return savedHasTutor;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, role]);

  useEffect(() => {
    if (!user || isAdminLike) return;
    if (role === "caregiver" && activeMode !== "caregiver") {
      setMode?.("caregiver");
      emitRoleChanged("caregiver");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, role, isAdminLike]);

  const canUseBell = !isAdminLike && (isTutor || isCaregiver);

  useEffect(() => {
    closeMobile();
    setPanelOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!panelOpen) return;

    const onDoc = (e) => {
      const el = panelWrapRef.current;
      if (!el) return;
      if (el.contains(e.target)) return;
      setPanelOpen(false);
    };

    const onKey = (e) => {
      if (e.key === "Escape") setPanelOpen(false);
    };

    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [panelOpen]);

  useEffect(() => {
    if (!logoutConfirmOpen) return;

    const onKey = (e) => {
      if (e.key === "Escape") setLogoutConfirmOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [logoutConfirmOpen]);

  const handleLogout = () => {
    try {
      logout?.();
    } finally {
      setChatUnreadIds([]);
      setReservationUnreadCount(0);
      closeMobile();
      setPanelOpen(false);
      setLogoutConfirmOpen(false);
      navigate("/", { replace: true });
    }
  };

  const openLogoutConfirm = () => {
    setLogoutConfirmOpen(true);
    setPanelOpen(false);
  };

  const navigateDashboardAfterMode = useCallback(
    (nextMode) => {
      const m = nextMode === "caregiver" ? "caregiver" : "tutor";

      setMode?.(m);
      emitRoleChanged(m);

      setPanelOpen(false);
      closeMobile();

      try {
        requestAnimationFrame(() => {
          setTimeout(() => {
            navigate("/dashboard?tab=reservas", { replace: false });
          }, 0);
        });
      } catch {
        setTimeout(() => {
          navigate("/dashboard?tab=reservas", { replace: false });
        }, 0);
      }
    },
    [setMode, emitRoleChanged, navigate]
  );

  const loadUnreadChatFromServer = useCallback(async () => {
    if (!user || !token || isAdminLike) {
      setChatUnreadIds([]);
      return;
    }

    const now = Date.now();
    if (chatFetchGuardRef.current.inFlight) return;
    if (now - chatFetchGuardRef.current.lastAt < 1200) return;

    chatFetchGuardRef.current.inFlight = true;
    chatFetchGuardRef.current.lastAt = now;

    try {
      const data = await authRequest("/chat/unread", token);
      const ids = Array.isArray(data?.reservationIds) ? data.reservationIds.map(String) : [];

      setChatUnreadIds(ids);

      window.dispatchEvent(
        new CustomEvent("chat-unread-changed", {
          detail: { list: ids },
        })
      );
    } catch (err) {
      console.error("Erro ao carregar unread de chat (Navbar):", err);
    } finally {
      chatFetchGuardRef.current.inFlight = false;
    }
  }, [user, token, isAdminLike]);

  const loadReservationEventsFromServer = useCallback(async () => {
    if (!user || !token || isAdminLike) {
      setReservationUnreadCount(0);
      return;
    }

    if (!isTutor && !isCaregiver) {
      setReservationUnreadCount(0);
      return;
    }

    const now = Date.now();
    if (resFetchGuardRef.current.inFlight) return;
    if (now - resFetchGuardRef.current.lastAt < 1200) return;

    resFetchGuardRef.current.inFlight = true;
    resFetchGuardRef.current.lastAt = now;

    try {
      const endpoint = isCaregiver ? "/reservations/caregiver" : "/reservations/tutor";

      const data = await authRequest(endpoint, token);
      const apiRes = Array.isArray(data?.reservations) ? data.reservations : [];

      const currentMap = {};
      for (const r of apiRes) {
        if (r?.id == null) continue;
        const idStr = String(r.id);

        const tutorRating = r.tutor_rating == null ? null : Number(r.tutor_rating);
        const caregiverRating = r.caregiver_rating == null ? null : Number(r.caregiver_rating);

        currentMap[idStr] = {
          status: r.status ?? "Pendente",
          tutorRating: Number.isFinite(tutorRating) ? tutorRating : null,
          caregiverRating: Number.isFinite(caregiverRating) ? caregiverRating : null,
        };
      }

      const snapshotKey = `reservationsSnapshot_${effectiveMode}_${user.id}`;
      let prevMap = null;

      try {
        prevMap = JSON.parse(localStorage.getItem(snapshotKey) || "null");
      } catch {
        prevMap = null;
      }

      localStorage.setItem(snapshotKey, JSON.stringify(currentMap));

      if (!prevMap) {
        loadReservationNotifs(user.id);
        setReservationUnreadCount(getUnreadReservationNotifsCount(user.id));
        return;
      }

      const newEvents = [];

      const prevEntry = (id) => (prevMap && prevMap[id]) || null;
      const curEntry = (id) => currentMap[id] || null;

      const prevStatus = (id) => {
        const p = prevEntry(id);
        if (!p) return undefined;
        if (typeof p === "string") return p;
        return p.status;
      };

      const curStatus = (id) => {
        const c = curEntry(id);
        return c ? c.status : undefined;
      };

      const prevTutorRating = (id) => {
        const p = prevEntry(id);
        if (!p || typeof p === "string") return null;
        return p.tutorRating ?? null;
      };

      const prevCaregiverRating = (id) => {
        const p = prevEntry(id);
        if (!p || typeof p === "string") return null;
        return p.caregiverRating ?? null;
      };

      const curTutorRating = (id) => {
        const c = curEntry(id);
        return c ? c.tutorRating ?? null : null;
      };

      const curCaregiverRating = (id) => {
        const c = curEntry(id);
        return c ? c.caregiverRating ?? null : null;
      };

      if (isCaregiver) {
        for (const r of apiRes) {
          const idStr = String(r.id);

          if (prevStatus(idStr) === undefined && curStatus(idStr) != null) {
            newEvents.push({
              reservationId: idStr,
              type: "new_reservation",
              targetUserId: String(user.id),
              createdAt: Date.now(),
            });
          }

          if (prevStatus(idStr) === "Aceita" && curStatus(idStr) === "Cancelada") {
            newEvents.push({
              reservationId: idStr,
              type: "reservation_cancelled_by_tutor",
              targetUserId: String(user.id),
              createdAt: Date.now(),
            });
          }

          if (prevTutorRating(idStr) == null && curTutorRating(idStr) != null) {
            newEvents.push({
              reservationId: idStr,
              type: "rating",
              targetUserId: String(user.id),
              createdAt: Date.now(),
            });
          }
        }
      }

      if (isTutor) {
        for (const r of apiRes) {
          const idStr = String(r.id);

          if (prevStatus(idStr) !== "Aceita" && curStatus(idStr) === "Aceita") {
            newEvents.push({
              reservationId: idStr,
              type: "reservation_accepted",
              targetUserId: String(user.id),
              createdAt: Date.now(),
            });
          }

          if (prevStatus(idStr) !== "Recusada" && curStatus(idStr) === "Recusada") {
            newEvents.push({
              reservationId: idStr,
              type: "pre_reservation_denied",
              targetUserId: String(user.id),
              createdAt: Date.now(),
            });
          }

          if (prevCaregiverRating(idStr) == null && curCaregiverRating(idStr) != null) {
            newEvents.push({
              reservationId: idStr,
              type: "rating",
              targetUserId: String(user.id),
              createdAt: Date.now(),
            });
          }
        }
      }

      if (newEvents.length) appendReservationNotifs(newEvents);

      loadReservationNotifs(user.id);
      setReservationUnreadCount(getUnreadReservationNotifsCount(user.id));
    } catch (err) {
      console.error("Erro ao carregar notificações de reserva (Navbar):", err);

      if (user?.id) {
        loadReservationNotifs(user.id);
        setReservationUnreadCount(getUnreadReservationNotifsCount(user.id));
      } else {
        setReservationUnreadCount(0);
      }
    } finally {
      resFetchGuardRef.current.inFlight = false;
    }
  }, [user, token, isAdminLike, isTutor, isCaregiver, effectiveMode]);

  useEffect(() => {
    const handleChatUnreadChanged = (e) => {
      const list = e.detail?.list;
      if (Array.isArray(list)) setChatUnreadIds(list.map(String));
    };

    const handleReservationNotifChanged = () => {
      if (user?.id) {
        loadReservationNotifs(user.id);
        setReservationUnreadCount(getUnreadReservationNotifsCount(user.id));
      } else {
        setReservationUnreadCount(0);
      }
    };

    const handleAuthChanged = (e) => {
      const status = e?.detail?.status;
      if (status === "logged_out") {
        setChatUnreadIds([]);
        setReservationUnreadCount(0);
      }
    };

    window.addEventListener("chat-unread-changed", handleChatUnreadChanged);
    window.addEventListener("reservation-notifications-changed", handleReservationNotifChanged);
    window.addEventListener("auth-changed", handleAuthChanged);

    return () => {
      window.removeEventListener("chat-unread-changed", handleChatUnreadChanged);
      window.removeEventListener("reservation-notifications-changed", handleReservationNotifChanged);
      window.removeEventListener("auth-changed", handleAuthChanged);
    };
  }, [user?.id, loadReservationEventsFromServer]);

  useEffect(() => {
    if (!user || !token || isAdminLike) {
      setChatUnreadIds([]);
      setReservationUnreadCount(0);
      return;
    }

    loadUnreadChatFromServer();
    loadReservationEventsFromServer();
  }, [user?.id, token, isAdminLike, loadUnreadChatFromServer, loadReservationEventsFromServer]);

  useEffect(() => {
    if (!user || !token || isAdminLike) return;
    if (!isTutor && !isCaregiver) return;

    const tick = () => {
      loadUnreadChatFromServer();
      loadReservationEventsFromServer();
    };

    const intervalId = setInterval(tick, 15000);

    const onFocus = () => tick();
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [
    user?.id,
    token,
    isAdminLike,
    isTutor,
    isCaregiver,
    loadUnreadChatFromServer,
    loadReservationEventsFromServer,
  ]);

  const handleBellClick = () => {
    if (!user) return;
    if (isAdminLike) return navigate("/admin/users");
    navigate("/dashboard?tab=reservas");
    closeMobile();
    setPanelOpen(false);
  };

  const title = useMemo(() => {
    if (!canUseBell) return "Painel";
    if (totalUnread <= 0) return "Nenhuma nova notificação";
    const parts = [];
    if (chatUnreadCount) parts.push(`${chatUnreadCount} chat`);
    if (reservationUnreadCount) parts.push(`${reservationUnreadCount} reserva`);
    return `${totalUnread} pendente(s) • ${parts.join(" • ")}`;
  }, [canUseBell, totalUnread, chatUnreadCount, reservationUnreadCount]);

  const panelLabel = useMemo(() => {
    if (isAdminLike) return "Painel Admin";
    return isCaregiver ? "Painel Cuidador" : "Painel Tutor";
  }, [isAdminLike, isCaregiver]);

  const goDashboard = () => {
    navigate("/dashboard?tab=reservas");
    setPanelOpen(false);
    closeMobile();
  };

  const switchToTutor = () => {
    navigateDashboardAfterMode("tutor");
  };

  const openCreateCaregiverModal = () => {
    setCreateCareOpen(true);
  };

  const closeCreateCaregiverModal = () => {
    if (createCareLoading) return;
    setCreateCareOpen(false);
  };

  const confirmCreateCaregiverWithDetails = async ({ services, daily_capacity }) => {
    if (!token) return;

    setCreateCareLoading(true);
    try {
      await authRequest("/caregivers/me", token, {
        method: "POST",
        body: { services, daily_capacity },
      });

      setMode?.("caregiver");
      emitRoleChanged("caregiver");

      try {
        await refreshMe?.(token, { preferCaregiver: true });
      } catch { }

      setCreateCareOpen(false);

      navigateDashboardAfterMode("caregiver");
    } catch (err) {
      console.error("Erro ao criar perfil cuidador com detalhes:", err);

      try {
        await authRequest("/caregivers/me", token, { method: "POST" });
        setMode?.("caregiver");
        emitRoleChanged("caregiver");
        try {
          await refreshMe?.(token, { preferCaregiver: true });
        } catch { }
        setCreateCareOpen(false);
        navigateDashboardAfterMode("caregiver");
      } catch (e2) {
        console.error("Fallback também falhou:", e2);
      }
    } finally {
      setCreateCareLoading(false);
    }
  };

  const switchToCaregiver = () => {
    if (hasCaregiverProfile) {
      navigateDashboardAfterMode("caregiver");
      return;
    }

    openCreateCaregiverModal();
    setPanelOpen(false);
    closeMobile();
  };

  const openCreateTutorModal = () => setCreateTutorOpen(true);

  const closeCreateTutorModal = () => {
    if (createTutorLoading) return;
    setCreateTutorOpen(false);
  };

  const confirmCreateTutorProfile = async () => {
    setCreateTutorLoading(true);
    try {
      persistSession({ hasTutorProfile: true });
      navigateDashboardAfterMode("tutor");
      setCreateTutorOpen(false);
    } finally {
      setCreateTutorLoading(false);
    }
  };

  const otherActionLabel = useMemo(() => {
    if (isAdminLike) return null;
    if (isTutor) return hasCaregiverProfile ? "Cuidador" : "Ser cuidador";
    if (isCaregiver) return hasTutorProfile ? "Tutor" : "Ser tutor";
    return null;
  }, [isAdminLike, isTutor, isCaregiver, hasCaregiverProfile, hasTutorProfile]);

  const handleOtherAction = () => {
    if (isAdminLike) return;

    if (isTutor) return switchToCaregiver();

    if (isCaregiver) {
      if (!hasTutorProfile) {
        openCreateTutorModal();
        setPanelOpen(false);
        closeMobile();
        return;
      }
      return switchToTutor();
    }
  };

  const PanelDropdown = user && !isAdminLike ? (
    <div className="relative" ref={panelWrapRef}>
      <button
        type="button"
        onClick={() => setPanelOpen((v) => !v)}
        className="bg-[#95301F] px-3 py-1 rounded-lg font-semibold inline-flex items-center gap-2"
        aria-haspopup="menu"
        aria-expanded={panelOpen ? "true" : "false"}
        title="Abrir opções do painel"
      >
        {panelLabel}
        <ChevronDown className="w-4 h-4 opacity-90" />
      </button>

      {panelOpen && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-[300px] max-w-[90vw] bg-white text-[#5A3A22] rounded-2xl shadow-xl border border-black/10 overflow-hidden z-50"
        >
          <div className="py-2">
            <div className="w-full px-4 py-3 text-left font-semibold flex items-center justify-between">
              <span>{isCaregiver ? "Cuidador" : "Tutor"}</span>
              <span className="text-xs font-bold text-[#95301F]">(ativo)</span>
            </div>

            {otherActionLabel && (
              <button
                type="button"
                onClick={handleOtherAction}
                disabled={creatingProfile || createCareLoading || createTutorLoading}
                className={[
                  "w-full px-4 py-3 text-left hover:bg-black/5 transition font-semibold flex items-center justify-between",
                  creatingProfile || createCareLoading || createTutorLoading
                    ? "opacity-60 cursor-not-allowed"
                    : "",
                ].join(" ")}
                role="menuitem"
              >
                <span>{otherActionLabel}</span>

                {isTutor && !hasCaregiverProfile && (
                  <span className="text-xs font-semibold text-[#95301F]">
                    {createCareLoading ? "aguarde..." : "(criar perfil)"}
                  </span>
                )}

                {isCaregiver && !hasTutorProfile && (
                  <span className="text-xs font-semibold text-[#95301F]">
                    {createTutorLoading ? "aguarde..." : "(criar perfil)"}
                  </span>
                )}
              </button>
            )}

            <div className="h-px bg-black/10 my-2" />

            <button
              type="button"
              onClick={goDashboard}
              className="w-full px-4 py-3 text-left hover:bg-black/5 transition"
              role="menuitem"
            >
              Abrir painel
            </button>
          </div>
        </div>
      )}
    </div>
  ) : null;

  const desktopLinks = (
    <div className="hidden md:flex gap-6 items-center">
      <Link to="/" className="hover:text-yellow-400 transition">
        Home
      </Link>
      <Link to="/buscar" className="hover:text-yellow-400 transition">
        Buscar
      </Link>
      <Link to="/comportamento" className="hover:text-yellow-400 transition">
        Comportamento
      </Link>
      <Link to="/sobre" className="hover:text-yellow-400 transition">
        Sobre
      </Link>

      {PanelDropdown}

      {isAdminLike && (
        <Link
          to="/admin/users"
          className="bg-[#95301F] px-3 py-1 rounded-lg font-semibold hover:brightness-95 transition"
        >
          Painel Admin
        </Link>
      )}
    </div>
  );

  const InstagramButtonDesktop = (
    <a
      href={INSTAGRAM_WEB_URL}
      target="_blank"
      rel="noreferrer"
      className="relative w-9 h-9 rounded-full bg-[#D2A679] text-[#5A3A22] flex items-center justify-center hover:brightness-95 transition"
      title="Instagram da PeloCaramelo"
      aria-label="Abrir Instagram da PeloCaramelo"
    >
      <Instagram className="w-5 h-5" />
    </a>
  );

  const desktopAuth = (
    <div className="hidden md:flex gap-3 items-center">
      {InstagramButtonDesktop}

      {user && (
        <button
          onClick={handleBellClick}
          className="relative w-9 h-9 rounded-full bg-[#D2A679] text-[#5A3A22]"
          title={title}
          type="button"
        >
          <Bell className="w-5 h-5 mx-auto" />
          {canUseBell && totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 text-[10px] font-bold rounded-full bg-red-600 text-white">
              {totalUnread}
            </span>
          )}
        </button>
      )}

      {!user ? (
        <Link to="/register" className="bg-[#95301F] px-4 py-2 rounded-lg font-semibold">
          Entre / Cadastre-se
        </Link>
      ) : (
        <>
          <Link
            to="/perfil"
            className="bg-[#FFD700] text-[#5A3A22] px-4 py-2 rounded-lg font-semibold"
          >
            Meu Perfil
          </Link>
          <button
            onClick={openLogoutConfirm}
            className="bg-[#95301F] px-4 py-2 rounded-lg font-semibold"
            type="button"
          >
            Logout
          </button>
        </>
      )}
    </div>
  );

  // ✅ MOBILE MENU: Instagram ao lado do sininho (link web + aviso)
  const MobileMenu = (
    <div className="md:hidden flex items-center gap-2">
      <a
        href={INSTAGRAM_WEB_URL}
        onClick={(e) => {
          e.preventDefault(); // evita abrir nova aba / popup e reduz interceptação no Chrome
          closeMobile();
          setPanelOpen(false);
          maybeShowInstagramMobileHint();

          // abre na mesma aba (melhor chance de ficar no navegador)
          window.location.href = INSTAGRAM_WEB_URL;
        }}
        className="relative w-10 h-10 rounded-lg bg-[#D2A679] text-[#5A3A22] flex items-center justify-center hover:brightness-95 transition"
        title="Instagram da PeloCaramelo"
        aria-label="Abrir Instagram da PeloCaramelo"
      >
        <Instagram className="w-5 h-5" />
      </a>
      {user && canUseBell && (
        <button
          onClick={handleBellClick}
          className="relative w-10 h-10 rounded-lg bg-[#D2A679] text-[#5A3A22] flex items-center justify-center"
          title={title}
          type="button"
          aria-label="Abrir notificações"
        >
          <Bell className="w-5 h-5" />

          {totalUnread > 0 && (
            <span
              className="
                absolute -top-1 -right-1
                min-w-[1.25rem] h-5 px-1
                text-[10px] font-bold
                rounded-full bg-red-600 text-white
                flex items-center justify-center
              "
              aria-label={`${totalUnread} notificações`}
            >
              {totalUnread}
            </span>
          )}
        </button>
      )}

      <button
        type="button"
        onClick={() => setMobileOpen((v) => !v)}
        className="w-10 h-10 rounded-lg bg-[#95301F] text-white flex items-center justify-center"
        aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {mobileOpen && (
        <div className="absolute left-0 right-0 top-full bg-[#5A3A22] text-white shadow-lg border-t border-white/10 z-50">
          <div className="px-4 py-4 flex flex-col gap-3">
            <Link to="/" className="hover:text-yellow-400 transition" onClick={closeMobile}>
              Home
            </Link>
            <Link to="/buscar" className="hover:text-yellow-400 transition" onClick={closeMobile}>
              Buscar
            </Link>
            <Link
              to="/comportamento"
              className="hover:text-yellow-400 transition"
              onClick={closeMobile}
            >
              Comportamento
            </Link>
            <Link to="/sobre" className="hover:text-yellow-400 transition" onClick={closeMobile}>
              Sobre
            </Link>

            {user && !isAdminLike && (
              <div className="bg-white/10 rounded-xl p-2 flex flex-col gap-2">
                <div className="w-full px-3 py-2 rounded-lg bg-white/5 flex items-center justify-between">
                  <span className="font-semibold">{isCaregiver ? "Cuidador" : "Tutor"}</span>
                  <span className="text-xs font-bold text-yellow-300">(ativo)</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    closeMobile();

                    if (isTutor) return switchToCaregiver();

                    if (isCaregiver) {
                      if (!hasTutorProfile) {
                        setCreateTutorOpen(true);
                        return;
                      }
                      return switchToTutor();
                    }
                  }}
                  disabled={creatingProfile || createCareLoading || createTutorLoading}
                  className={[
                    "w-full bg-white/10 hover:bg-white/15 border border-white/15 px-3 py-2 rounded-lg font-semibold text-center transition",
                    creatingProfile || createCareLoading || createTutorLoading
                      ? "opacity-60 cursor-not-allowed"
                      : "",
                  ].join(" ")}
                >
                  {isTutor
                    ? hasCaregiverProfile
                      ? "Cuidador"
                      : "Ser cuidador"
                    : hasTutorProfile
                      ? "Tutor"
                      : "Ser tutor"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    navigate("/dashboard?tab=reservas");
                    closeMobile();
                  }}
                  className="bg-[#95301F] px-3 py-2 rounded-lg font-semibold text-center"
                >
                  {isCaregiver ? "Abrir painel do cuidador" : "Abrir painel do tutor"}
                </button>
              </div>
            )}

            {isAdminLike && (
              <Link
                to="/admin/users"
                className="bg-[#95301F] px-3 py-2 rounded-lg font-semibold text-center hover:brightness-95 transition"
                onClick={closeMobile}
              >
                Painel Admin
              </Link>
            )}

            {!user ? (
              <Link
                to="/register"
                className="bg-[#95301F] px-4 py-2 rounded-lg font-semibold text-center"
                onClick={closeMobile}
              >
                Entre / Cadastre-se
              </Link>
            ) : (
              <>
                <Link
                  to="/perfil"
                  className="bg-[#FFD700] text-[#5A3A22] px-4 py-2 rounded-lg font-semibold text-center"
                  onClick={closeMobile}
                >
                  Meu Perfil
                </Link>
                <button
                  onClick={openLogoutConfirm}
                  className="bg-[#95301F] px-4 py-2 rounded-lg font-semibold"
                  type="button"
                >
                  Logout
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <nav className="relative flex justify-between items-center px-4 md:px-6 py-4 bg-[#5A3A22] text-white shadow-md">
        <Link to="/" className="font-bold text-xl hover:opacity-90 transition">
          <span className="text-white">Pelo</span>
          <span className="text-yellow-400 drop-shadow-md">Caramelo</span>
        </Link>

        {desktopLinks}
        {desktopAuth}
        {MobileMenu}
      </nav>

      <CreateCaregiverProfileModal
        open={createCareOpen}
        loading={createCareLoading}
        onClose={closeCreateCaregiverModal}
        onConfirm={confirmCreateCaregiverWithDetails}
        initialServices={[]}
        initialDailyCapacity={3}
      />

      <CreateTutorProfileModal
        open={createTutorOpen}
        loading={createTutorLoading}
        onClose={closeCreateTutorModal}
        onConfirm={confirmCreateTutorProfile}
      />

      <ConfirmLogoutModal
        open={logoutConfirmOpen}
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={handleLogout}
        loading={false}
      />
    </>
  );
}