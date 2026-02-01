// frontend/src/components/Navbar.jsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Bell, Menu, X, ChevronDown } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { authRequest } from "../services/api";
import {
  appendReservationNotifs,
  getUnreadReservationNotifsCount,
  loadReservationNotifs,
} from "../utils/reservationNotifs";

export default function Navbar() {
  const {
    user,
    logout,
    token,
    hasCaregiverProfile,
    activeMode,
    setMode,

    // ✅ agora com confirmação no AuthContext
    requestCreateCaregiverProfile,
    creatingProfile,
  } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

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

  const chatUnreadCount = chatUnreadIds.length;
  const totalUnread = chatUnreadCount + reservationUnreadCount;

  // ✅ guardas de fetch (evita spam/duplicidade)
  const chatFetchGuardRef = useRef({ inFlight: false, lastAt: 0 });
  const resFetchGuardRef = useRef({ inFlight: false, lastAt: 0 });

  // ✅ helper: avisa a mesma aba (Dashboard já escuta)
  const emitRoleChanged = useCallback((nextRole) => {
    const next = nextRole === "caregiver" ? "caregiver" : "tutor";
    window.dispatchEvent(
      new CustomEvent("active-role-changed", { detail: { role: next } })
    );
  }, []);

  /* ============================================================
     ✅ FIX: modo inicial automático (evita cair em "tutor" por default)
     - Se o usuário é caregiver no token/banco e activeMode ainda não existe,
       define "caregiver" automaticamente.
     ============================================================ */
  useEffect(() => {
    if (!user?.id) return;
    if (isAdminLike) return;

    const cur = String(activeMode || "").toLowerCase().trim();
    const isValid = cur === "tutor" || cur === "caregiver";

    if (isValid) return;

    // prioridade 1: role do token (fonte de verdade do cadastro)
    let preferred = role === "caregiver" ? "caregiver" : role === "tutor" ? "tutor" : "";

    // fallback: se não vier role esperado, mas tem caregiver profile -> caregiver
    if (!preferred) preferred = hasCaregiverProfile ? "caregiver" : "tutor";

    setMode?.(preferred);
    emitRoleChanged(preferred);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAdminLike, activeMode, role, hasCaregiverProfile]);

  // ✅ “mode efetivo” pro usuário comum (pra UI)
  const effectiveMode = isAdminLike
    ? "admin"
    : role === "caregiver"
      ? "caregiver"
      : activeMode || "tutor";
  const isTutor = effectiveMode === "tutor";
  const isCaregiver = effectiveMode === "caregiver";

  const canUseBell = !isAdminLike && (isTutor || isCaregiver);

  // Fecha menu ao trocar rota
  useEffect(() => {
    closeMobile();
    setPanelOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  // Fecha dropdown ao clicar fora / ESC
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

  const handleLogout = () => {
    try {
      logout?.();
    } finally {
      setChatUnreadIds([]);
      setReservationUnreadCount(0);
      closeMobile();
      setPanelOpen(false);
      navigate("/", { replace: true });
    }
  };

  /* ================= CHAT (backend-driven) ================= */

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
      const ids = Array.isArray(data?.reservationIds)
        ? data.reservationIds.map(String)
        : [];

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

  /* ================= RESERVAS (snapshot + local notifs) ================= */

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
        const caregiverRating =
          r.caregiver_rating == null ? null : Number(r.caregiver_rating);

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

      // -------- eventos por MODE --------
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

  /* ================= LISTENERS ================= */

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
      window.removeEventListener(
        "reservation-notifications-changed",
        handleReservationNotifChanged
      );
      window.removeEventListener("auth-changed", handleAuthChanged);
    };
  }, [user?.id]);

  /* ================= FETCH INIT ================= */

  useEffect(() => {
    if (!user || !token || isAdminLike) {
      setChatUnreadIds([]);
      setReservationUnreadCount(0);
      return;
    }

    loadUnreadChatFromServer();
    loadReservationEventsFromServer();
  }, [
    user?.id,
    token,
    isAdminLike,
    loadUnreadChatFromServer,
    loadReservationEventsFromServer,
  ]);

  /* ============================================================
     ✅ FIX #1: Navbar atualiza unread SEM precisar entrar no painel
     - Polling leve (chat + reservas)
     - Atualiza ao focar a aba e ao voltar visibilidade (tab ativa)
     ============================================================ */

  useEffect(() => {
    if (!user || !token || isAdminLike) return;
    if (!isTutor && !isCaregiver) return;

    const tick = () => {
      loadUnreadChatFromServer();
      loadReservationEventsFromServer();
    };

    // 1) polling
    const intervalId = setInterval(tick, 15000);

    // 2) foco/visibilidade
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
    if (isAdminLike) return "Painel";
    return isCaregiver ? "Painel Cuidador" : "Painel Tutor";
  }, [isAdminLike, isCaregiver]);

  const goDashboard = () => {
    navigate("/dashboard?tab=reservas");
    setPanelOpen(false);
    closeMobile();
  };

  const switchToTutor = () => {
    setMode?.("tutor");
    emitRoleChanged("tutor");
    navigate("/dashboard?tab=reservas", { replace: false });
    setPanelOpen(false);
    closeMobile();
  };

  const switchToCaregiver = () => {
    setMode?.("caregiver");
    emitRoleChanged("caregiver");
    navigate("/dashboard?tab=reservas", { replace: false });
    setPanelOpen(false);
    closeMobile();
  };

  // ✅ “Ser cuidador” agora pede confirmação no AuthContext (não cria direto)
  const createAndSwitchToCaregiver = () => {
    if (creatingProfile) return;

    try {
      requestCreateCaregiverProfile?.();
    } catch (err) {
      console.error("Falha ao solicitar criação do perfil cuidador:", err);
    } finally {
      setPanelOpen(false);
      closeMobile();
    }
  };

  const otherActionLabel = useMemo(() => {
    if (isAdminLike) return null;
    if (isTutor) return hasCaregiverProfile ? "Cuidador" : "Ser cuidador";
    if (isCaregiver) return "Tutor";
    return null;
  }, [isAdminLike, isTutor, isCaregiver, hasCaregiverProfile]);

  const handleOtherAction = () => {
    if (isAdminLike) return;

    if (isTutor) {
      if (hasCaregiverProfile) return switchToCaregiver();
      return createAndSwitchToCaregiver();
    }

    if (isCaregiver) {
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
                disabled={creatingProfile}
                className={[
                  "w-full px-4 py-3 text-left hover:bg-black/5 transition font-semibold flex items-center justify-between",
                  creatingProfile ? "opacity-60 cursor-not-allowed" : "",
                ].join(" ")}
                role="menuitem"
              >
                <span>{otherActionLabel}</span>

                {isTutor && !hasCaregiverProfile && (
                  <span className="text-xs font-semibold text-[#95301F]">
                    {creatingProfile ? "criando..." : "(criar perfil)"}
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
        <Link to="/admin/users" className="bg-red-600 px-3 py-1 rounded-lg font-semibold">
          Painel Admin
        </Link>
      )}
    </div>
  );

  const desktopAuth = (
    <div className="hidden md:flex gap-3 items-center">
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
          Entre/Cadastre-se
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
            onClick={handleLogout}
            className="bg-[#95301F] px-4 py-2 rounded-lg font-semibold"
            type="button"
          >
            Logout
          </button>
        </>
      )}
    </div>
  );

  const MobileMenu = (
    <div className="md:hidden">
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

                    if (isTutor) {
                      if (hasCaregiverProfile) {
                        setMode("caregiver");
                        emitRoleChanged("caregiver");
                        navigate("/dashboard?tab=reservas");
                        return;
                      }
                      createAndSwitchToCaregiver();
                      return;
                    }

                    if (isCaregiver) {
                      setMode("tutor");
                      emitRoleChanged("tutor");
                      navigate("/dashboard?tab=reservas");
                    }
                  }}
                  disabled={creatingProfile}
                  className={[
                    "w-full bg-white/10 hover:bg-white/15 border border-white/15 px-3 py-2 rounded-lg font-semibold text-center transition",
                    creatingProfile ? "opacity-60 cursor-not-allowed" : "",
                  ].join(" ")}
                >
                  {isTutor ? (hasCaregiverProfile ? "Cuidador" : "Ser cuidador") : "Tutor"}
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
                className="bg-red-600 px-3 py-2 rounded-lg font-semibold text-center"
                onClick={closeMobile}
              >
                Painel Admin
              </Link>
            )}

            {user && (
              <button
                onClick={handleBellClick}
                className="relative w-full rounded-lg bg-[#D2A679] text-[#5A3A22] py-2 font-semibold flex items-center justify-center gap-2"
                title={title}
                type="button"
              >
                <Bell className="w-5 h-5" />
                Notificações
                {canUseBell && totalUnread > 0 && (
                  <span className="ml-2 min-w-[1.5rem] h-5 px-2 text-[11px] font-bold rounded-full bg-red-600 text-white flex items-center justify-center">
                    {totalUnread}
                  </span>
                )}
              </button>
            )}

            {!user ? (
              <Link
                to="/register"
                className="bg-[#95301F] px-4 py-2 rounded-lg font-semibold text-center"
                onClick={closeMobile}
              >
                Entre/Cadastre-se
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
                  onClick={handleLogout}
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
    <nav className="relative flex justify-between items-center px-4 md:px-6 py-4 bg-[#5A3A22] text-white shadow-md">
      <Link to="/" className="font-bold text-xl hover:opacity-90 transition">
        <span className="text-white">Pelo</span>
        <span className="text-yellow-400 drop-shadow-md">Caramelo</span>
      </Link>

      {desktopLinks}
      {desktopAuth}
      {MobileMenu}
    </nav>
  );
}
