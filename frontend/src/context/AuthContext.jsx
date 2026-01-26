// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { meRequest } from "../services/api";

const AuthContext = createContext();
const STORAGE_KEY = "pelocaramelo_auth";

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

// ---------- helpers ----------
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
  // Suporta variações caso algum ambiente retorne diferente
  const v =
    res?.hasCaregiverProfile ??
    res?.has_caregiver_profile ??
    res?.user?.hasCaregiverProfile ??
    res?.user?.has_caregiver_profile ??
    false;
  return Boolean(v);
}

// ---------- modal ----------
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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // ✅ Mantém apenas a “capacidade” (perfil cuidador existe), NÃO o modo ativo
  const [hasCaregiverProfile, setHasCaregiverProfile] = useState(false);

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

  const hideBlockedModal = () => {
    setBlockedModalOpen(false);
  };

  function persistSession(next) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function handleLogout() {
    setUser(null);
    setToken(null);
    setHasCaregiverProfile(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  // Carregar sessão salva no localStorage ao iniciar o app
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      setLoading(false);
      return;
    }

    try {
      const parsed = JSON.parse(saved);
      const savedToken = parsed?.token || null;
      const savedUser = parsed?.user || null;
      const savedHas = Boolean(parsed?.hasCaregiverProfile ?? false);

      if (!savedToken) {
        setLoading(false);
        return;
      }

      // hidrata imediatamente
      setToken(savedToken);
      if (savedUser) setUser(normalizeUser(savedUser));
      setHasCaregiverProfile(savedHas);

      // Sempre busca o usuário atual no backend (fonte de verdade)
      meRequest(savedToken)
        .then((res) => {
          const has = coerceHasCaregiverProfile(res);

          if (res?.user) {
            const full = normalizeUser(res.user);

            setUser(full);
            setHasCaregiverProfile(has);

            persistSession({
              user: full,
              token: savedToken,
              hasCaregiverProfile: has,
            });
            return;
          }

          // se não veio user, trata como sessão inválida
          handleLogout();
        })
        .catch((err) => {
          console.error("Erro ao carregar sessão /auth/me:", err);

          const status = err?.status ?? err?.response?.status ?? null;

          // ✅ se backend informou bloqueio, mostra modal + limpa sessão
          const bi = pickBlockedPayload(err);
          if (status === 403 && bi) {
            showBlockedModal(bi);
            handleLogout();
            return;
          }

          // ✅ só “desloga” se for token inválido/sem permissão (sem payload de bloqueio)
          if (status === 401 || status === 403) {
            handleLogout();
            return;
          }

          // erro temporário (500, rede): mantém sessão local
        })
        .finally(() => setLoading(false));
    } catch (err) {
      console.error("Erro ao ler sessão do localStorage:", err);
      handleLogout();
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Login: recebe user básico do /auth/login, mas já consulta /auth/me
  async function handleLogin(loginUser, newToken) {
    try {
      setToken(newToken);
      setLoading(true);

      const res = await meRequest(newToken);
      const has = coerceHasCaregiverProfile(res);
      const fullUser = normalizeUser(res?.user || loginUser);

      setUser(fullUser);
      setHasCaregiverProfile(has);

      persistSession({
        user: fullUser,
        token: newToken,
        hasCaregiverProfile: has,
      });
    } catch (err) {
      console.error("Erro ao buscar /auth/me após login:", err);

      const status = err?.status ?? err?.response?.status ?? null;
      const bi = pickBlockedPayload(err);

      // se o /auth/me responder bloqueado por algum motivo, mostra modal e limpa sessão
      if (status === 403 && bi) {
        showBlockedModal(bi);
        handleLogout();
        return;
      }

      // mantém sessão (útil em instabilidade momentânea)
      const full = normalizeUser(loginUser);
      setUser(full);

      // sem /me não sabemos o perfil -> assume "não cuidador" até provar o contrário
      setHasCaregiverProfile(false);

      persistSession({
        user: full,
        token: newToken,
        hasCaregiverProfile: false,
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

      // ✅ capacidade (Dashboard decide o perfil ativo)
      hasCaregiverProfile,

      // bloqueio
      showBlockedModal,
      hideBlockedModal,
      blockedModalOpen,
      blockedInfo,
    }),
    [user, token, loading, hasCaregiverProfile, blockedModalOpen, blockedInfo]
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
