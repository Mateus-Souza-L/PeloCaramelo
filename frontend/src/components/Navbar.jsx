// frontend/src/components/Navbar.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { authRequest } from "../services/api";
import {
  appendReservationNotifs,
  getUnreadReservationNotifsCount,
  loadReservationNotifs,
} from "../utils/reservationNotifs";

export default function Navbar() {
  const { user, logout, token } = useAuth();
  const navigate = useNavigate();

  const isTutor = user?.role === "tutor";
  const isCaregiver = user?.role === "caregiver";
  const isAdmin = user?.role === "admin";
  const canUseBell = isTutor || isCaregiver; // admin tem acesso ao painel, mas não usa contadores

  const [chatUnreadIds, setChatUnreadIds] = useState([]);
  const [reservationUnreadCount, setReservationUnreadCount] = useState(0);

  const chatUnreadCount = chatUnreadIds.length;
  const totalUnread = chatUnreadCount + reservationUnreadCount;

  const handleLogout = () => {
    try {
      logout?.();
    } finally {
      // limpa UI local
      setChatUnreadIds([]);
      setReservationUnreadCount(0);
      navigate("/", { replace: true });
    }
  };

  /* ================= CHAT (backend-driven) ================= */

  const loadUnreadChatFromServer = useCallback(async () => {
    if (!user || !token || isAdmin) {
      setChatUnreadIds([]);
      return;
    }

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
    }
  }, [user, token, isAdmin]);

  /* ================= RESERVAS (snapshot + local notifs) ================= */

  const loadReservationEventsFromServer = useCallback(async () => {
    if (!user || !token || isAdmin) {
      setReservationUnreadCount(0);
      return;
    }

    if (!isTutor && !isCaregiver) {
      setReservationUnreadCount(0);
      return;
    }

    try {
      const endpoint = isCaregiver
        ? "/reservations/caregiver"
        : "/reservations/tutor";

      const data = await authRequest(endpoint, token);
      const apiRes = Array.isArray(data?.reservations) ? data.reservations : [];

      // snapshot guarda status + ratings
      // shape: { [id]: { status: string, tutorRating: number|null, caregiverRating: number|null } }
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
          caregiverRating: Number.isFinite(caregiverRating)
            ? caregiverRating
            : null,
        };
      }

      const snapshotKey = `reservationsSnapshot_${user.role}_${user.id}`;
      let prevMap = null;

      try {
        prevMap = JSON.parse(localStorage.getItem(snapshotKey) || "null");
      } catch {
        prevMap = null;
      }

      localStorage.setItem(snapshotKey, JSON.stringify(currentMap));

      // primeiro load: só carrega localStorage (não cria eventos)
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
        if (typeof p === "string") return p; // compat snapshot antigo
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

      // -------- eventos por ROLE --------
      if (isCaregiver) {
        for (const r of apiRes) {
          const idStr = String(r.id);

          // nova pré-reserva
          if (prevStatus(idStr) === undefined && curStatus(idStr) != null) {
            newEvents.push({
              reservationId: idStr,
              type: "new_reservation",
              targetUserId: String(user.id),
              createdAt: Date.now(),
            });
          }

          // tutor cancelou após aceita
          if (prevStatus(idStr) === "Aceita" && curStatus(idStr) === "Cancelada") {
            newEvents.push({
              reservationId: idStr,
              type: "reservation_cancelled_by_tutor",
              targetUserId: String(user.id),
              createdAt: Date.now(),
            });
          }

          // caregiver recebeu avaliação do tutor
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

          // cuidador aceitou
          if (prevStatus(idStr) !== "Aceita" && curStatus(idStr) === "Aceita") {
            newEvents.push({
              reservationId: idStr,
              type: "reservation_accepted",
              targetUserId: String(user.id),
              createdAt: Date.now(),
            });
          }

          // cuidador recusou
          if (prevStatus(idStr) !== "Recusada" && curStatus(idStr) === "Recusada") {
            newEvents.push({
              reservationId: idStr,
              type: "pre_reservation_denied",
              targetUserId: String(user.id),
              createdAt: Date.now(),
            });
          }

          // tutor recebeu avaliação do cuidador
          if (
            prevCaregiverRating(idStr) == null &&
            curCaregiverRating(idStr) != null
          ) {
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
      // fallback local
      if (user?.id) {
        loadReservationNotifs(user.id);
        setReservationUnreadCount(getUnreadReservationNotifsCount(user.id));
      } else {
        setReservationUnreadCount(0);
      }
    }
  }, [user, token, isAdmin, isTutor, isCaregiver]);

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

    window.addEventListener("chat-unread-changed", handleChatUnreadChanged);
    window.addEventListener(
      "reservation-notifications-changed",
      handleReservationNotifChanged
    );

    return () => {
      window.removeEventListener("chat-unread-changed", handleChatUnreadChanged);
      window.removeEventListener(
        "reservation-notifications-changed",
        handleReservationNotifChanged
      );
    };
  }, [user?.id]);

  /* ================= POLLING ================= */

  useEffect(() => {
    if (!user || !token) {
      setChatUnreadIds([]);
      setReservationUnreadCount(0);
      return;
    }

    if (isAdmin) {
      setChatUnreadIds([]);
      setReservationUnreadCount(0);
      return;
    }

    const fetchAll = async () => {
      await loadUnreadChatFromServer();
      await loadReservationEventsFromServer();
    };

    fetchAll();
    const intervalId = setInterval(fetchAll, 15000);
    return () => clearInterval(intervalId);
  }, [
    user?.id,
    user?.role,
    token,
    isAdmin,
    loadUnreadChatFromServer,
    loadReservationEventsFromServer,
  ]);

  // Sino: admin vai pro /admin; tutor/caregiver vai pro /dashboard?tab=reservas
  const handleBellClick = () => {
    if (!user) return;
    if (isAdmin) return navigate("/admin");
    navigate("/dashboard?tab=reservas");
  };

  const title = useMemo(() => {
    if (!canUseBell) return "Painel Admin";
    if (totalUnread <= 0) return "Nenhuma nova notificação";
    const parts = [];
    if (chatUnreadCount) parts.push(`${chatUnreadCount} chat`);
    if (reservationUnreadCount) parts.push(`${reservationUnreadCount} reserva`);
    return `${totalUnread} pendente(s) • ${parts.join(" • ")}`;
  }, [canUseBell, totalUnread, chatUnreadCount, reservationUnreadCount]);

  return (
    <nav className="flex justify-between items-center px-6 py-4 bg-[#5A3A22] text-white shadow-md">
      {/* Logo */}
      <Link to="/" className="font-bold text-xl hover:opacity-90 transition">
        <span className="text-white">Pelo</span>
        <span className="text-yellow-400 drop-shadow-md">Caramelo</span>
      </Link>

      {/* Links */}
      <div className="flex gap-6 items-center">
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

        {isTutor && (
          <Link
            to="/dashboard?tab=reservas"
            className="bg-[#95301F] px-3 py-1 rounded-lg font-semibold"
          >
            Painel Tutor
          </Link>
        )}

        {isCaregiver && (
          <Link
            to="/dashboard?tab=reservas"
            className="bg-[#95301F] px-3 py-1 rounded-lg font-semibold"
          >
            Painel Cuidador
          </Link>
        )}

        {isAdmin && (
          <Link
            to="/admin"
            className="bg-red-600 px-3 py-1 rounded-lg font-semibold"
          >
            Painel Admin
          </Link>
        )}
      </div>

      {/* Auth + sino */}
      <div className="flex gap-3 items-center">
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
          <Link
            to="/login"
            className="bg-[#95301F] px-4 py-2 rounded-lg font-semibold"
          >
            Login
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
    </nav>
  );
}
