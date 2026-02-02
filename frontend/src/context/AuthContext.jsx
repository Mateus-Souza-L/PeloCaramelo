// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { meRequest, authRequest } from "../services/api";

const AuthContext = createContext();
const STORAGE_KEY = "pelocaramelo_auth";

/* ============================================================
   Normalizers / helpers
   ============================================================ */

function normalizeUser(u) {
  if (!u) return u;

  const blocked = Boolean(u.blocked ?? u.is_blocked ?? u.isBlocked ?? false);

  const blockedReason =
    u.blockedReason ?? u.blocked_reason ?? u.block_reason ?? u.blockReason ?? null;

  const blockedUntil =
    u.blockedUntil ?? u.blocked_until ?? u.block_until ?? u.blockedUntil ?? null;

  return {
    ...u,
    blocked,
    blockedReason: blockedReason ? String(blockedReason) : null,
    blockedUntil: blockedUntil ? String(blockedUntil) : null,
  };
}

function pickBlockedPayload(err) {
  const data = err?.data || err?.response?.data || err?.body || err?.payload || null;

  const code = data?.code || data?.errorCode || null;
  if (code !== "USER_BLOCKED") return null;

  return {
    reason: data?.reason ?? data?.blockedReason ?? null,
    blockedUntil: data?.blockedUntil ?? null,
  };
}

function formatBlockedUntil(blockedUntil) {
  if (!blockedUntil) return "Indefinido";
  const dt = new Date(blockedUntil);
  if (Number.isNaN(dt.getTime())) return String(blockedUntil);

  try {
    return dt.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dt.toISOString();
  }
}

function coerceHasCaregiverProfile(res) {
  const v =
    res?.hasCaregiverProfile ??
    res?.has_caregiver_profile ??
    res?.user?.hasCaregiverProfile ??
    res?.user?.has_caregiver_profile ??
    false;
  return Boolean(v);
}

function normalizeMode(m) {
  return String(m || "").toLowerCase().trim() === "caregiver" ? "caregiver" : "tutor";
}

function normalizeRole(role) {
  return String(role || "").toLowerCase().trim();
}

/**
 * ✅ Regra final do modo (multi-perfil de verdade):
 * 1) Se preferCaregiver=true e existe caregiver_profile => caregiver
 * 2) Se savedMode=caregiver e existe caregiver_profile => caregiver
 * 3) Senão => tutor
 *
 * OBS: role NÃO força modo.
 */
function decideMode({ role, savedMode, hasCaregiverProfile, preferCaregiver = false }) {
  normalizeRole(role); // lido (sem forçar modo)
  const s = normalizeMode(savedMode);

  if (preferCaregiver && hasCaregiverProfile) return "caregiver";
  if (s === "caregiver" && hasCaregiverProfile) return "caregiver";
  return "tutor";
}

/* ============================================================
   UI constants (create caregiver profile)
   ============================================================ */

const CAREGIVER_SERVICE_OPTIONS = [
  "Hospedagem",
  "Passeio",
  "Creche",
  "Visita em domicílio",
  "Banho e tosa",
  "Adestramento",
];

function uniqStrings(arr) {
  return Array.from(new Set((arr || []).map((s) => String(s).trim()).filter(Boolean)));
}

/* ============================================================
   Modal (blocked)
   ============================================================ */

function BlockedModal({ open, info, onClose }) {
  if (!open) return null;

  const colors = {
    brown: "#5A3A22",
    yellow: "#FFD700",
    beige: "#EBCBA9",
    red: "#95301F",
  };

  const untilTxt = formatBlockedUntil(info?.blockedUntil);

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
        if (e.target === e.currentTarget) onClose?.();
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
          <div style={{ fontSize: 18, fontWeight: 1000, color: colors.red }}>Acesso bloqueado</div>
          <div style={{ marginTop: 8, color: "#333", lineHeight: 1.4 }}>
            Seu acesso à plataforma foi bloqueado pelo administrador.
          </div>
        </div>

        <div style={{ padding: 18, background: "#fafafa" }}>
          <div style={{ display: "grid", gap: 10 }}>
            <div
              style={{
                padding: 12,
                borderRadius: 14,
                border: "1px solid #f0e5d7",
                background: colors.beige,
              }}
            >
              <div style={{ fontWeight: 1000, color: colors.brown, fontSize: 13 }}>Motivo</div>
              <div style={{ marginTop: 6, color: "#222" }}>
                {info?.reason ? String(info.reason) : "Não informado"}
              </div>
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 14,
                border: "1px solid #f0e5d7",
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 1000, color: colors.brown, fontSize: 13 }}>Até quando</div>
              <div style={{ marginTop: 6, color: "#222" }}>{untilTxt}</div>
            </div>

            <div style={{ fontSize: 13, color: "#555", lineHeight: 1.4 }}>
              Se você acredita que isso foi um engano, entre em contato com o suporte/administrador.
            </div>
          </div>
        </div>

        <div
          style={{
            padding: 18,
            display: "flex",
            justifyContent: "flex-end",
            background: "#fff",
            borderTop: "1px solid #eee",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid transparent",
              background: colors.yellow,
              color: colors.brown,
              fontWeight: 1000,
              cursor: "pointer",
            }}
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Modal (confirm create profile)
   ============================================================ */

function ConfirmCreateProfileModal({ open, mode = "caregiver", loading, onCancel, onConfirm }) {
  if (!open) return null;

  const colors = {
    brown: "#5A3A22",
    yellow: "#FFD700",
    beige: "#EBCBA9",
    red: "#95301F",
  };

  const title = mode === "caregiver" ? "Criar perfil de cuidador(a)" : "Criar perfil de tutor(a)";

  const desc =
    mode === "caregiver"
      ? "Ao confirmar, vamos criar seu perfil de cuidador(a). Em seguida você escolhe os serviços e quantas reservas por dia vai aceitar."
      : "Ao confirmar, vamos criar seu perfil de tutor(a). Você poderá alternar entre Tutor e Cuidador no Painel.";

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
        if (e.target === e.currentTarget) onCancel?.();
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
          <div style={{ fontSize: 18, fontWeight: 1000, color: colors.brown }}>{title}</div>
          <div style={{ marginTop: 8, color: "#333", lineHeight: 1.4 }}>{desc}</div>
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
            }}
          >
            Confirma a criação do novo perfil?
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
            onClick={onCancel}
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
              opacity: loading ? 0.8 : 1,
            }}
          >
            {loading ? "Continuando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Modal (caregiver setup: services + daily capacity)
   ============================================================ */

function CaregiverSetupModal({
  open,
  loading,
  services,
  dailyCapacity,
  error,
  onToggleService,
  onCapacityChange,
  onCancel,
  onConfirm,
}) {
  if (!open) return null;

  const colors = {
    brown: "#5A3A22",
    yellow: "#FFD700",
    beige: "#EBCBA9",
    red: "#95301F",
  };

  const selectedCount = Array.isArray(services) ? services.length : 0;

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
        if (e.target === e.currentTarget) onCancel?.();
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
            Configure seu perfil de cuidador(a)
          </div>
          <div style={{ marginTop: 8, color: "#333", lineHeight: 1.4 }}>
            Selecione os serviços e defina quantas reservas por dia você aceita.
          </div>
        </div>

        <div style={{ padding: 18, background: "#fafafa" }}>
          <div style={{ display: "grid", gap: 14 }}>
            <div
              style={{
                padding: 12,
                borderRadius: 14,
                border: "1px solid #f0e5d7",
                background: colors.beige,
              }}
            >
              <div style={{ fontWeight: 1000, color: colors.brown, fontSize: 13 }}>
                Serviços (obrigatório) — {selectedCount} selecionado(s)
              </div>

              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {CAREGIVER_SERVICE_OPTIONS.map((opt) => {
                  const checked = services?.includes(opt);
                  return (
                    <label
                      key={opt}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        cursor: loading ? "not-allowed" : "pointer",
                        opacity: loading ? 0.75 : 1,
                        userSelect: "none",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleService?.(opt)}
                        disabled={loading}
                        style={{ width: 18, height: 18 }}
                      />
                      <span style={{ fontWeight: 900, color: "#222" }}>{opt}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 14,
                border: "1px solid #f0e5d7",
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 1000, color: colors.brown, fontSize: 13 }}>
                Reservas por dia (obrigatório)
              </div>

              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={dailyCapacity}
                  onChange={(e) => onCapacityChange?.(e.target.value)}
                  disabled={loading}
                  style={{
                    width: 120,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    outline: "none",
                    fontWeight: 900,
                    color: "#222",
                  }}
                />
                <span style={{ fontSize: 13, color: "#555" }}>
                  Dica: você pode ajustar depois no painel.
                </span>
              </div>
            </div>

            {error ? (
              <div
                style={{
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid rgba(149,48,31,0.25)",
                  background: "rgba(149,48,31,0.08)",
                  color: colors.red,
                  fontWeight: 900,
                  fontSize: 13,
                  lineHeight: 1.4,
                }}
              >
                {error}
              </div>
            ) : null}
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
            onClick={onCancel}
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
            Voltar
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
            {loading ? "Criando..." : "Criar perfil"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Provider
   ============================================================ */

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // ✅ capacidade (existe perfil cuidador)
  const [hasCaregiverProfile, setHasCaregiverProfile] = useState(false);

  // ✅ modo ativo (pra Navbar/UI). Não é “role”, é só modo de uso.
  const [activeMode, setActiveMode] = useState("tutor"); // "tutor" | "caregiver"

  // modal de bloqueio
  const [blockedModalOpen, setBlockedModalOpen] = useState(false);
  const [blockedInfo, setBlockedInfo] = useState({ reason: null, blockedUntil: null });

  // ✅ modal confirmação criação perfil
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false);
  const [confirmCreateTarget, setConfirmCreateTarget] = useState("caregiver"); // futuro: "tutor"
  const [creatingProfile, setCreatingProfile] = useState(false);

  // ✅ modal setup do cuidador (serviços + capacidade)
  const [caregiverSetupOpen, setCaregiverSetupOpen] = useState(false);
  const [caregiverServices, setCaregiverServices] = useState(["Hospedagem", "Passeio"]);
  const [caregiverDailyCapacity, setCaregiverDailyCapacity] = useState(6);
  const [caregiverSetupError, setCaregiverSetupError] = useState("");

  const showBlockedModal = (info) => {
    setBlockedInfo({
      reason: info?.reason ?? null,
      blockedUntil: info?.blockedUntil ?? null,
    });
    setBlockedModalOpen(true);
  };

  const hideBlockedModal = () => setBlockedModalOpen(false);

  function persistSession(next) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function readSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function emitAuthChanged(status) {
    try {
      window.dispatchEvent(new CustomEvent("auth-changed", { detail: { status } }));
    } catch {
      // ignore
    }
  }

  function handleLogout() {
    setUser(null);
    setToken(null);
    setHasCaregiverProfile(false);
    setActiveMode("tutor");

    setConfirmCreateOpen(false);
    setCreatingProfile(false);

    setCaregiverSetupOpen(false);
    setCaregiverSetupError("");

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }

    emitAuthChanged("logged_out");
  }

  /**
   * ✅ troca de modo:
   * - caregiver só é permitido se tiver caregiver_profile
   * - tutor sempre é permitido
   * - FIX PROBLEMA 1: usa também o valor salvo no localStorage (evita "modo invertido")
   */
  function setMode(nextMode) {
    const saved = readSession();
    const desired = normalizeMode(nextMode);

    // ✅ fonte mais confiável no clique: saved.hasCaregiverProfile (se existir),
    // senão cai no state atual.
    const canCaregiver = Boolean(
      saved?.hasCaregiverProfile ?? hasCaregiverProfile ?? false
    );

    const finalMode = desired === "caregiver" && !canCaregiver ? "tutor" : desired;

    setActiveMode(finalMode);

    persistSession({
      user: saved?.user ?? user ?? null,
      token: saved?.token ?? token ?? null,
      hasCaregiverProfile: Boolean(saved?.hasCaregiverProfile ?? hasCaregiverProfile ?? false),
      activeMode: finalMode,
    });
  }

  /**
   * ✅ helper pra sincronizar user + hasCaregiverProfile com /auth/me
   * opts:
   * - preferCaregiver: tenta manter caregiver se existir caregiver_profile (multi-perfil)
   */
  async function refreshMe(nextToken, opts = {}) {
    const t = nextToken || token;
    if (!t) return null;

    const saved = readSession();
    const savedMode = saved?.activeMode || activeMode || "tutor";
    const preferCaregiver = Boolean(opts.preferCaregiver);

    const res = await meRequest(t);
    const has = coerceHasCaregiverProfile(res);

    if (!res?.user) return null;

    const full = normalizeUser(res.user);

    setUser(full);
    setHasCaregiverProfile(has);

    const nextMode = decideMode({
      role: full.role,
      savedMode,
      hasCaregiverProfile: has,
      preferCaregiver,
    });

    setActiveMode(nextMode);

    persistSession({
      user: full,
      token: t,
      hasCaregiverProfile: has,
      activeMode: nextMode,
    });

    return { user: full, hasCaregiverProfile: has, activeMode: nextMode };
  }

  /**
   * ✅ cria o outro perfil (POST /caregivers/me) — FUNÇÃO INTERNA
   * Agora envia { services, dailyCapacity } no body.
   */
  async function createCaregiverProfile(payload) {
    if (!token) throw new Error("Não autenticado.");

    const services = uniqStrings(payload?.services);
    const dailyCapacityNum = Number(payload?.dailyCapacity);

    const body = {
      services,
      dailyCapacity: Number.isFinite(dailyCapacityNum) ? dailyCapacityNum : null,
    };

    const res = await authRequest("/caregivers/me", token, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });

    setHasCaregiverProfile(true);
    setActiveMode("caregiver");

    persistSession({
      user,
      token,
      hasCaregiverProfile: true,
      activeMode: "caregiver",
    });

    try {
      await refreshMe(token, { preferCaregiver: true });
    } catch {
      // mantém estado local
    }

    return res;
  }

  /**
   * ✅ API pública: pedir confirmação para criar perfil
   * - se já tem, só alterna
   */
  function requestCreateCaregiverProfile() {
    if (!token) throw new Error("Não autenticado.");

    if (hasCaregiverProfile) {
      setMode("caregiver");
      return;
    }

    setConfirmCreateTarget("caregiver");
    setConfirmCreateOpen(true);
  }

  function cancelCreateCaregiverProfile() {
    if (creatingProfile) return;
    setConfirmCreateOpen(false);
  }

  async function confirmCreateCaregiverProfile() {
    if (creatingProfile) return;

    setConfirmCreateOpen(false);
    setCaregiverSetupError("");
    setCaregiverSetupOpen(true);
  }

  function cancelCaregiverSetup() {
    if (creatingProfile) return;
    setCaregiverSetupOpen(false);
    setCaregiverSetupError("");
  }

  function toggleCaregiverService(label) {
    if (creatingProfile) return;

    const opt = String(label || "").trim();
    if (!opt) return;

    setCaregiverServices((prev) => {
      const cur = Array.isArray(prev) ? prev : [];
      if (cur.includes(opt)) return cur.filter((x) => x !== opt);
      return [...cur, opt];
    });
  }

  function changeCaregiverCapacity(v) {
    if (creatingProfile) return;
    const n = Number(v);
    if (!Number.isFinite(n)) {
      setCaregiverDailyCapacity(v);
      return;
    }
    setCaregiverDailyCapacity(n);
  }

  async function confirmCaregiverSetupAndCreate() {
    if (creatingProfile) return;

    const services = uniqStrings(caregiverServices);
    const cap = Number(caregiverDailyCapacity);

    if (!services.length) {
      setCaregiverSetupError("Selecione pelo menos 1 serviço para continuar.");
      return;
    }

    if (!Number.isFinite(cap) || cap < 1 || cap > 50) {
      setCaregiverSetupError("Informe uma capacidade válida (entre 1 e 50 reservas por dia).");
      return;
    }

    setCaregiverSetupError("");
    setCreatingProfile(true);

    try {
      await createCaregiverProfile({ services, dailyCapacity: cap });
      setCaregiverSetupOpen(false);
    } catch (err) {
      console.error("Falha ao criar perfil cuidador:", err);
      setCaregiverSetupError(
        err?.message
          ? `Não foi possível criar seu perfil agora: ${String(err.message)}`
          : "Não foi possível criar seu perfil agora. Tente novamente."
      );
    } finally {
      setCreatingProfile(false);
    }
  }

  /* ============================================================
     Bootstrap (localStorage -> /auth/me)
     ============================================================ */

  useEffect(() => {
    const saved = readSession();

    if (!saved?.token) {
      setLoading(false);
      return;
    }

    const savedToken = saved.token;
    const savedUser = saved.user || null;
    const savedHas = Boolean(saved.hasCaregiverProfile ?? false);
    const savedMode = saved.activeMode || "tutor";

    // hidrata imediatamente
    setToken(savedToken);
    if (savedUser) setUser(normalizeUser(savedUser));
    setHasCaregiverProfile(savedHas);

    const initialMode = decideMode({
      role: savedUser?.role,
      savedMode,
      hasCaregiverProfile: savedHas,
      preferCaregiver: false,
    });

    setActiveMode(initialMode);

    meRequest(savedToken)
      .then((res) => {
        const has = coerceHasCaregiverProfile(res);

        if (res?.user) {
          const full = normalizeUser(res.user);
          setUser(full);
          setHasCaregiverProfile(has);

          const nextMode = decideMode({
            role: full.role,
            savedMode,
            hasCaregiverProfile: has,
            preferCaregiver: false,
          });

          setActiveMode(nextMode);

          persistSession({
            user: full,
            token: savedToken,
            hasCaregiverProfile: has,
            activeMode: nextMode,
          });
          return;
        }

        handleLogout();
      })
      .catch((err) => {
        console.error("Erro ao carregar sessão /auth/me:", err);

        const status = err?.status ?? err?.response?.status ?? null;

        const bi = pickBlockedPayload(err);
        if (status === 403 && bi) {
          showBlockedModal(bi);
          handleLogout();
          return;
        }

        if (status === 401 || status === 403) {
          handleLogout();
          return;
        }
        // erro temporário: mantém sessão local
      })
      .finally(() => setLoading(false));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ============================================================
     Login ( /auth/login -> /auth/me )
     FIX PROBLEMA 2: hidrata sessão IMEDIATA antes do /me
     ============================================================ */

  async function handleLogin(loginUser, newToken) {
    const immediateUser = normalizeUser(loginUser);

    try {
      setLoading(true);

      // ✅ hidrata imediatamente (evita precisar clicar "Entrar" 2x)
      setToken(newToken);
      setUser(immediateUser);

      const savedMode = readSession()?.activeMode || "tutor";

      // enquanto o /me não vem, assumimos "não sei ainda"
      // mas preservamos preferência salva (tutor/caregiver).
      persistSession({
        user: immediateUser,
        token: newToken,
        hasCaregiverProfile: Boolean(readSession()?.hasCaregiverProfile ?? false),
        activeMode: normalizeMode(savedMode),
      });

      emitAuthChanged("logged_in");

      // ✅ agora sim confirma no backend
      const res = await meRequest(newToken);
      const has = coerceHasCaregiverProfile(res);
      const fullUser = normalizeUser(res?.user || immediateUser);

      setUser(fullUser);
      setHasCaregiverProfile(has);

      const nextMode = decideMode({
        role: fullUser?.role,
        savedMode,
        hasCaregiverProfile: has,
        preferCaregiver: false,
      });

      setActiveMode(nextMode);

      persistSession({
        user: fullUser,
        token: newToken,
        hasCaregiverProfile: has,
        activeMode: nextMode,
      });

      return { user: fullUser, token: newToken, activeMode: nextMode, hasCaregiverProfile: has };
    } catch (err) {
      console.error("Erro ao buscar /auth/me após login:", err);

      const status = err?.status ?? err?.response?.status ?? null;
      const bi = pickBlockedPayload(err);

      if (status === 403 && bi) {
        showBlockedModal(bi);
        handleLogout();
        return null;
      }

      // fallback: mantém sessão com o usuário do login (já hidratado)
      setHasCaregiverProfile(false);

      const nextMode = decideMode({
        role: immediateUser?.role,
        savedMode: "tutor",
        hasCaregiverProfile: false,
        preferCaregiver: false,
      });

      setActiveMode(nextMode);

      persistSession({
        user: immediateUser,
        token: newToken,
        hasCaregiverProfile: false,
        activeMode: nextMode,
      });

      return { user: immediateUser, token: newToken, activeMode: nextMode, hasCaregiverProfile: false };
    } finally {
      setLoading(false);
    }
  }

  const value = useMemo(
    () => ({
      user,
      setUser,
      token,
      loading,
      login: handleLogin,
      logout: handleLogout,
      isAuthenticated: !!user && !!token,

      // ✅ multi-perfil
      hasCaregiverProfile,
      activeMode,
      setMode,

      // ✅ criação cuidador com 2 passos
      requestCreateCaregiverProfile,
      confirmCreateCaregiverProfile,
      cancelCreateCaregiverProfile,
      creatingProfile,

      refreshMe,

      // bloqueio
      showBlockedModal,
      hideBlockedModal,
      blockedModalOpen,
      blockedInfo,
    }),
    [
      user,
      token,
      loading,
      hasCaregiverProfile,
      activeMode,
      blockedModalOpen,
      blockedInfo,
      creatingProfile,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}

      <BlockedModal open={blockedModalOpen} info={blockedInfo} onClose={hideBlockedModal} />

      <ConfirmCreateProfileModal
        open={confirmCreateOpen}
        mode={confirmCreateTarget}
        loading={creatingProfile}
        onCancel={cancelCreateCaregiverProfile}
        onConfirm={confirmCreateCaregiverProfile}
      />

      <CaregiverSetupModal
        open={caregiverSetupOpen}
        loading={creatingProfile}
        services={caregiverServices}
        dailyCapacity={caregiverDailyCapacity}
        error={caregiverSetupError}
        onToggleService={toggleCaregiverService}
        onCapacityChange={changeCaregiverCapacity}
        onCancel={cancelCaregiverSetup}
        onConfirm={confirmCaregiverSetupAndCreate}
      />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
