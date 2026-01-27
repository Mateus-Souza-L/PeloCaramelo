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

function pickInitialMode(savedMode, hasCaregiverProfile) {
  const m = String(savedMode || "").toLowerCase();
  if (m === "caregiver" && hasCaregiverProfile) return "caregiver";
  return "tutor";
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
          <div style={{ fontSize: 18, fontWeight: 1000, color: colors.red }}>
            Acesso bloqueado
          </div>
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
              <div style={{ fontWeight: 1000, color: colors.brown, fontSize: 13 }}>
                Motivo
              </div>
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
              <div style={{ fontWeight: 1000, color: colors.brown, fontSize: 13 }}>
                Até quando
              </div>
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

  function handleLogout() {
    setUser(null);
    setToken(null);
    setHasCaregiverProfile(false);
    setActiveMode("tutor");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  // ✅ troca de modo (só permite caregiver se tiver perfil)
  function setMode(nextMode) {
    const m = String(nextMode || "").toLowerCase() === "caregiver" ? "caregiver" : "tutor";
    const finalMode = m === "caregiver" && !hasCaregiverProfile ? "tutor" : m;

    setActiveMode(finalMode);

    const saved = readSession();
    persistSession({
      user: saved?.user ?? user ?? null,
      token: saved?.token ?? token ?? null,
      hasCaregiverProfile: Boolean(saved?.hasCaregiverProfile ?? hasCaregiverProfile ?? false),
      activeMode: finalMode,
    });
  }

  // ✅ helper pra sincronizar user + hasCaregiverProfile com /auth/me
  async function refreshMe(nextToken) {
    const t = nextToken || token;
    if (!t) return null;

    const res = await meRequest(t);
    const has = coerceHasCaregiverProfile(res);

    if (res?.user) {
      const full = normalizeUser(res.user);
      setUser(full);
      setHasCaregiverProfile(has);

      // garante que não fique em caregiver sem perfil
      setActiveMode((prev) => pickInitialMode(prev, has));

      persistSession({
        user: full,
        token: t,
        hasCaregiverProfile: has,
        activeMode: pickInitialMode(readSession()?.activeMode, has),
      });

      return { user: full, hasCaregiverProfile: has };
    }

    return null;
  }

  // ✅ cria o outro perfil SEM logout (POST /caregivers/me)
  async function createCaregiverProfile() {
    if (!token) throw new Error("Não autenticado.");

    // endpoint já é idempotente/seguro; aqui tratamos a UX
    const res = await authRequest("/caregivers/me", token, { method: "POST" });

    // marca localmente como criado
    setHasCaregiverProfile(true);

    // troca pro modo cuidador automaticamente (faz sentido pra UX “Ser cuidador”)
    setActiveMode("caregiver");

    // persiste
    persistSession({
      user,
      token,
      hasCaregiverProfile: true,
      activeMode: "caregiver",
    });

    // atualiza fonte de verdade (se /auth/me já devolve hasCaregiverProfile)
    try {
      await refreshMe(token);
    } catch {
      // se falhar, mantém estado local mesmo
    }

    return res;
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
    setActiveMode(pickInitialMode(savedMode, savedHas));

    // sincroniza no backend
    meRequest(savedToken)
      .then((res) => {
        const has = coerceHasCaregiverProfile(res);

        if (res?.user) {
          const full = normalizeUser(res.user);
          setUser(full);
          setHasCaregiverProfile(has);

          const nextMode = pickInitialMode(savedMode, has);
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

        // bloqueio
        const bi = pickBlockedPayload(err);
        if (status === 403 && bi) {
          showBlockedModal(bi);
          handleLogout();
          return;
        }

        // token inválido
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
     ============================================================ */

  async function handleLogin(loginUser, newToken) {
    try {
      setToken(newToken);
      setLoading(true);

      const res = await meRequest(newToken);
      const has = coerceHasCaregiverProfile(res);
      const fullUser = normalizeUser(res?.user || loginUser);

      setUser(fullUser);
      setHasCaregiverProfile(has);

      // mantém modo salvo se válido
      const savedMode = readSession()?.activeMode || "tutor";
      const nextMode = pickInitialMode(savedMode, has);
      setActiveMode(nextMode);

      persistSession({
        user: fullUser,
        token: newToken,
        hasCaregiverProfile: has,
        activeMode: nextMode,
      });
    } catch (err) {
      console.error("Erro ao buscar /auth/me após login:", err);

      const status = err?.status ?? err?.response?.status ?? null;
      const bi = pickBlockedPayload(err);

      if (status === 403 && bi) {
        showBlockedModal(bi);
        handleLogout();
        return;
      }

      // fallback: mantém sessão com o loginUser
      const full = normalizeUser(loginUser);
      setUser(full);

      // sem /me não sabemos se tem perfil
      setHasCaregiverProfile(false);
      setActiveMode("tutor");

      persistSession({
        user: full,
        token: newToken,
        hasCaregiverProfile: false,
        activeMode: "tutor",
      });
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
      createCaregiverProfile,
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
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <BlockedModal open={blockedModalOpen} info={blockedInfo} onClose={hideBlockedModal} />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
