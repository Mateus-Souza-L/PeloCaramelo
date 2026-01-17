// src/pages/Dashboard.jsx
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ToastProvider";
import { formatDateBR, toLocalKey, parseLocalKey } from "../utils/date";
import RatingModal from "../components/RatingModal";
import TutorPets from "../components/TutorPets";
import { authRequest } from "../services/api";

import {
  getUnreadReservationNotifs,
  markReservationNotifsRead,
} from "../utils/reservationNotifs";

/* ===========================================================
   ✅ Normalização de dados
   - Server: snake_case -> camelCase
   - Local cache: pode vir misturado (camel/snake), então normaliza também
   =========================================================== */

const normalizeReservationFromApi = (r) => {
  if (!r) return null;

  let petsIds = r.pets_ids ?? [];
  if (typeof petsIds === "string") {
    try {
      const parsed = JSON.parse(petsIds);
      petsIds = Array.isArray(parsed) ? parsed : [];
    } catch {
      petsIds = [];
    }
  }
  if (!Array.isArray(petsIds)) petsIds = [petsIds];
  petsIds = petsIds.map((x) => String(x)).filter(Boolean);

  return {
    id: String(r.id),
    tutorId: r.tutor_id != null ? String(r.tutor_id) : "",
    tutorName: r.tutor_name,
    caregiverId: r.caregiver_id != null ? String(r.caregiver_id) : "",
    caregiverName: r.caregiver_name,
    city: r.city || "",
    neighborhood: r.neighborhood || "",
    service: r.service,
    pricePerDay: Number(r.price_per_day || 0),
    startDate: r.start_date ? String(r.start_date).slice(0, 10) : "",
    endDate: r.end_date ? String(r.end_date).slice(0, 10) : "",
    total: Number(r.total || 0),
    status: r.status || "Pendente",

    tutorRating: r.tutor_rating ?? null,
    tutorReview: r.tutor_review ?? null,
    caregiverRating: r.caregiver_rating ?? null,
    caregiverReview: r.caregiver_review ?? null,

    __hasTutorReview: r.__hasTutorReview ?? r.has_tutor_review ?? false,
    __hasCaregiverReview: r.__hasCaregiverReview ?? r.has_caregiver_review ?? false,

    petsIds,
    petsNames: r.pets_names || "",
    rejectReason: r.reject_reason || null,
  };
};

// ✅ normaliza qualquer objeto vindo do localStorage (camel/snake misturado)
function normalizeReservationFromLocal(r) {
  if (!r) return null;

  const id = r.id ?? r.reservation_id ?? r.reservationId ?? null;
  if (id == null) return null;

  const startDate =
    r.startDate ??
    r.start_date ??
    (r.start ? String(r.start).slice(0, 10) : "") ??
    "";

  const endDate =
    r.endDate ??
    r.end_date ??
    (r.end ? String(r.end).slice(0, 10) : "") ??
    "";

  const petsIdsRaw = r.petsIds ?? r.pets_ids ?? [];
  let petsIds = petsIdsRaw;

  if (typeof petsIds === "string") {
    try {
      const parsed = JSON.parse(petsIds);
      petsIds = Array.isArray(parsed) ? parsed : [];
    } catch {
      petsIds = [];
    }
  }
  if (!Array.isArray(petsIds)) petsIds = [petsIds];
  petsIds = petsIds.map((x) => String(x)).filter(Boolean);

  const tutorRating = r.tutorRating ?? r.tutor_rating ?? null;
  const caregiverRating = r.caregiverRating ?? r.caregiver_rating ?? null;

  const tutorReview = r.tutorReview ?? r.tutor_review ?? null;
  const caregiverReview = r.caregiverReview ?? r.caregiver_review ?? null;

  return {
    ...r,
    id: String(id),
    tutorId:
      r.tutorId != null
        ? String(r.tutorId)
        : r.tutor_id != null
          ? String(r.tutor_id)
          : "",
    caregiverId:
      r.caregiverId != null
        ? String(r.caregiverId)
        : r.caregiver_id != null
          ? String(r.caregiver_id)
          : "",
    startDate: startDate ? String(startDate).slice(0, 10) : "",
    endDate: endDate ? String(endDate).slice(0, 10) : "",
    total: Number(r.total || 0),
    pricePerDay: Number(r.pricePerDay ?? r.price_per_day ?? 0),
    status: r.status || "Pendente",

    tutorRating,
    caregiverRating,
    tutorReview,
    caregiverReview,

    __hasTutorReview: r.__hasTutorReview ?? r.has_tutor_review ?? false,
    __hasCaregiverReview: r.__hasCaregiverReview ?? r.has_caregiver_review ?? false,

    petsIds,
  };
}

// --------- helpers visuais de status ---------
function isConcludedStatus(status) {
  return status === "Concluida" || status === "Concluída" || status === "Finalizada";
}

function getStatusColor(status) {
  switch (status) {
    case "Aceita":
      return "text-green-600";
    case "Recusada":
    case "Cancelada":
      return "text-red-600";
    case "Concluida":
    case "Concluída":
    case "Finalizada":
      return "text-blue-700";
    default:
      return "text-yellow-700";
  }
}

function getStatusHelperText(reservation, role) {
  const s = reservation.status;

  switch (s) {
    case "Pendente":
      if (role === "caregiver")
        return "Você recebeu uma nova pré-reserva. Aceite ou recuse logo abaixo.";
      if (role === "tutor")
        return "Sua pré-reserva está aguardando resposta do cuidador.";
      return "";
    case "Aceita":
      if (role === "caregiver")
        return "Esta reserva foi aceita por você. Depois de concluída, o tutor poderá avaliá-lo.";
      if (role === "tutor")
        return "Esta reserva foi aceita pelo cuidador. Depois de concluída você poderá avaliá-lo.";
      return "";
    case "Recusada":
      if (role === "caregiver") return "Esta reserva foi recusada por você.";
      if (role === "tutor") return "Esta reserva foi recusada pelo cuidador.";
      return "";
    case "Cancelada":
      if (role === "caregiver") return "O tutor cancelou esta reserva.";
      if (role === "tutor") return "Você cancelou esta reserva.";
      return "";
    case "Concluida":
    case "Concluída":
    case "Finalizada":
      if (role === "caregiver")
        return "Reserva concluída. Você já pode avaliar o tutor se ainda não avaliou.";
      if (role === "tutor")
        return "Reserva concluída. Você já pode avaliar o cuidador se ainda não avaliou.";
      return "";
    default:
      return "";
  }
}

function getStatusToastMessage(status, role) {
  if (status === "Aceita") {
    return role === "caregiver" ? "Reserva aceita! 🐾" : "Reserva atualizada para Aceita.";
  }
  if (status === "Recusada")
    return role === "caregiver" ? "Reserva recusada." : "Reserva foi recusada.";
  if (status === "Cancelada") return "Reserva cancelada.";
  if (isConcludedStatus(status)) return "Reserva marcada como concluída.";
  return "Status da reserva atualizado.";
}

function getStatusToastType(status) {
  if (status === "Aceita" || isConcludedStatus(status)) return "success";
  if (status === "Recusada" || status === "Cancelada") return "error";
  return "notify";
}

// -----------------------------------------------------
// ✅ merge: preserva rating/review do cache local quando servidor vier vazio
// -----------------------------------------------------
function mergePreservingLocalRatings(apiList, localList) {
  const localMap = new Map(
    (Array.isArray(localList) ? localList : []).map((r) => [String(r?.id), r])
  );

  return (Array.isArray(apiList) ? apiList : []).map((apiR) => {
    const rid = String(apiR?.id);
    const localR = localMap.get(rid);
    if (!localR) return apiR;

    const merged = { ...apiR };

    if (merged.tutorRating == null && localR.tutorRating != null) {
      merged.tutorRating = localR.tutorRating;
      merged.tutorReview = localR.tutorReview ?? merged.tutorReview ?? null;
      merged.__hasTutorReview = true;
    }
    if (merged.caregiverRating == null && localR.caregiverRating != null) {
      merged.caregiverRating = localR.caregiverRating;
      merged.caregiverReview = localR.caregiverReview ?? merged.caregiverReview ?? null;
      merged.__hasCaregiverReview = true;
    }

    if (
      !merged.__hasTutorReview &&
      typeof localR.tutorReview === "string" &&
      localR.tutorReview.trim()
    ) {
      merged.__hasTutorReview = true;
    }
    if (
      !merged.__hasCaregiverReview &&
      typeof localR.caregiverReview === "string" &&
      localR.caregiverReview.trim()
    ) {
      merged.__hasCaregiverReview = true;
    }

    return merged;
  });
}

export default function Dashboard() {
  const { user, token } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const isTutor = user?.role === "tutor";
  const isCaregiver = user?.role === "caregiver";

  const [tab, setTab] = useState("disponibilidade");
  const [reservations, setReservations] = useState([]);

  const [reservationsLoading, setReservationsLoading] = useState(false);
  const [reservationsLoaded, setReservationsLoaded] = useState(false);

  const [unreadChatIds, setUnreadChatIds] = useState([]);
  const [unreadResIds, setUnreadResIds] = useState([]);

  const [availableDates, setAvailableDates] = useState([]);
  const [pendingDates, setPendingDates] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [unsaved, setUnsaved] = useState(false);

  const [ratingReservation, setRatingReservation] = useState(null);
  const [ratingTitle, setRatingTitle] = useState("");

  const [cancelConfirmId, setCancelConfirmId] = useState(null);

  const [rejectModal, setRejectModal] = useState({
    open: false,
    reservationId: null,
    tutorId: null,
    text: "",
  });

  const [myReviewedReservationIds, setMyReviewedReservationIds] = useState(() => new Set());
  const [myReviewsLoaded, setMyReviewsLoaded] = useState(false);

  const reservationsStorageKey = useMemo(() => {
    if (!user?.id || !user?.role) return "reservations";
    return `reservations_${String(user.role)}_${String(user.id)}`;
  }, [user?.id, user?.role]);

  const availabilityStorageKey = useMemo(() => {
    if (!user?.id) return "availability";
    return `availability_${String(user.id)}`;
  }, [user?.id]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const refreshUnreadReservationNotifs = useCallback(() => {
    if (!user?.id) {
      setUnreadResIds([]);
      return;
    }
    const list = getUnreadReservationNotifs(user.id);
    const ids = Array.from(new Set(list.map((n) => String(n.reservationId))));
    setUnreadResIds(ids);
  }, [user?.id]);

  const refreshTimerRef = useRef(null);

  const chatFetchGuardRef = useRef({ inFlight: false, lastAt: 0 });
  const resFetchGuardRef = useRef({ inFlight: false, lastAt: 0, lastKey: "" });
  const availFetchGuardRef = useRef({ inFlight: false, lastAt: 0, lastKey: "" });
  const myReviewsGuardRef = useRef({ inFlight: false, lastAt: 0, lastKey: "" });

  const loadUnreadChatFromServer = useCallback(async () => {
    if (!user || !token) {
      setUnreadChatIds([]);
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

      setUnreadChatIds(ids);

      window.dispatchEvent(
        new CustomEvent("chat-unread-changed", { detail: { list: ids } })
      );
    } catch (err) {
      console.error("Erro ao carregar chats não lidos (Dashboard):", err);
    } finally {
      chatFetchGuardRef.current.inFlight = false;
    }
  }, [user, token]);

  const loadMyReviewsFromServer = useCallback(async () => {
    if (!user?.id || !token) {
      setMyReviewedReservationIds(new Set());
      setMyReviewsLoaded(false);
      return;
    }

    const now = Date.now();
    const guardKey = `${String(user.id)}:${String(user.role || "")}`;

    if (myReviewsGuardRef.current.inFlight) return;
    if (
      myReviewsGuardRef.current.lastKey === guardKey &&
      now - myReviewsGuardRef.current.lastAt < 1500
    ) {
      return;
    }

    myReviewsGuardRef.current.inFlight = true;
    myReviewsGuardRef.current.lastAt = now;
    myReviewsGuardRef.current.lastKey = guardKey;

    try {
      const data = await authRequest("/reviews/me", token);

      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.reviews)
          ? data.reviews
          : [];

      const ids = new Set();
      for (const rv of list) {
        const rid =
          rv?.reservation_id ??
          rv?.reservationId ??
          rv?.reservation?.id ??
          rv?.reservation?.reservation_id ??
          null;

        if (rid != null) ids.add(String(rid));
      }

      setMyReviewedReservationIds(ids);
      setMyReviewsLoaded(true);
    } catch (err) {
      console.error("Erro ao carregar /reviews/me (Dashboard):", err);
      setMyReviewedReservationIds(new Set());
      setMyReviewsLoaded(false);
    } finally {
      myReviewsGuardRef.current.inFlight = false;
    }
  }, [user?.id, user?.role, token]);

  const loadReservations = useCallback(async () => {
    if (!user) {
      setReservations([]);
      setReservationsLoading(false);
      setReservationsLoaded(true);
      return [];
    }

    const now = Date.now();
    const guardKey = `${user?.role || ""}:${user?.id || ""}:${reservationsStorageKey}`;

    if (resFetchGuardRef.current.inFlight) return [];
    if (
      resFetchGuardRef.current.lastKey === guardKey &&
      now - resFetchGuardRef.current.lastAt < 1500
    ) {
      return [];
    }

    resFetchGuardRef.current.inFlight = true;
    resFetchGuardRef.current.lastAt = now;
    resFetchGuardRef.current.lastKey = guardKey;

    if (!reservationsLoaded) setReservationsLoading(true);

    const applyReservations = (resList) => {
      const safe = Array.isArray(resList) ? resList : [];
      setReservations(safe);
      refreshUnreadReservationNotifs();
    };

    const readLocal = () => {
      try {
        const raw = localStorage.getItem(reservationsStorageKey) || "[]";
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : [];
        return list.map(normalizeReservationFromLocal).filter(Boolean);
      } catch {
        return [];
      }
    };

    try {
      const localCache = readLocal();
      const localMap = new Map(
        (Array.isArray(localCache) ? localCache : []).map((x) => [String(x?.id), x])
      );

      if (token && (isTutor || isCaregiver)) {
        try {
          const endpoint = isTutor ? "/reservations/tutor" : "/reservations/caregiver";

          const data = await authRequest(endpoint, token);
          const apiRes = data?.reservations || [];
          const normalized = apiRes
            .map(normalizeReservationFromApi)
            .filter(Boolean)
            .map((srv) => {
              const local = localMap.get(String(srv.id));
              if (!local) return srv;

              return {
                ...srv,
                tutorRating: srv.tutorRating ?? local.tutorRating ?? null,
                tutorReview: srv.tutorReview ?? local.tutorReview ?? null,

                caregiverRating: srv.caregiverRating ?? local.caregiverRating ?? null,
                caregiverReview: srv.caregiverReview ?? local.caregiverReview ?? null,

                __hasTutorReview:
                  srv.__hasTutorReview ||
                  local.__hasTutorReview ||
                  local.tutorRating != null ||
                  (typeof local.tutorReview === "string" && local.tutorReview.trim().length > 0),

                __hasCaregiverReview:
                  srv.__hasCaregiverReview ||
                  local.__hasCaregiverReview ||
                  local.caregiverRating != null ||
                  (typeof local.caregiverReview === "string" &&
                    local.caregiverReview.trim().length > 0),
              };
            });

          const merged = mergePreservingLocalRatings(normalized, localCache);

          try {
            localStorage.setItem(reservationsStorageKey, JSON.stringify(merged));
          } catch {
            // ignore
          }

          applyReservations(merged);
          return merged;
        } catch (err) {
          console.error("Erro ao carregar reservas do servidor:", err);
          showToast(
            "Não foi possível carregar as reservas do servidor. Usando dados locais.",
            "error"
          );
        }
      }

      applyReservations(localCache);
      return localCache;
    } finally {
      resFetchGuardRef.current.inFlight = false;
      setReservationsLoading(false);
      setReservationsLoaded(true);
    }
  }, [
    user,
    token,
    isTutor,
    isCaregiver,
    reservationsStorageKey,
    refreshUnreadReservationNotifs,
    reservationsLoaded,
    showToast,
  ]);

  // ---------- disponibilidade cuidador (/availability/me) ----------
  const normalizeAvailKeys = useCallback((arr) => {
    if (!Array.isArray(arr)) return [];
    return Array.from(
      new Set(
        arr
          .map((d) => {
            if (!d) return null;
            const s = String(d).trim();
            if (!s) return null;
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
            if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
            const dt = new Date(s);
            if (!Number.isNaN(dt.getTime())) return toLocalKey(dt);
            return null;
          })
          .filter(Boolean)
      )
    ).sort();
  }, []);

  const availabilityToKeys = useCallback(
    (data) => {
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.availability)
          ? data.availability
          : Array.isArray(data?.items)
            ? data.items
            : [];

      if (list.length && typeof list[0] === "string") {
        return normalizeAvailKeys(list);
      }

      const keys = list
        .filter((x) => {
          if (!x) return false;
          const flag =
            x.is_available ?? x.isAvailable ?? x.available ?? x.isAvailableDay ?? true;
          return flag === true;
        })
        .map((x) => {
          const raw = x.date_key ?? x.dateKey ?? x.date ?? x.day;
          return raw ? String(raw).slice(0, 10) : null;
        })
        .filter(Boolean);

      return normalizeAvailKeys(keys);
    },
    [normalizeAvailKeys]
  );

  const loadAvailabilityIfCaregiver = useCallback(async () => {
    if (!isCaregiver || !user?.id) return;

    const now = Date.now();
    const guardKey = `${user?.id}:${availabilityStorageKey}`;

    if (availFetchGuardRef.current.inFlight) return;
    if (
      availFetchGuardRef.current.lastKey === guardKey &&
      now - availFetchGuardRef.current.lastAt < 2000
    ) {
      return;
    }

    availFetchGuardRef.current.inFlight = true;
    availFetchGuardRef.current.lastAt = now;
    availFetchGuardRef.current.lastKey = guardKey;

    try {
      let cachedLocalDates = [];
      try {
        const cached = JSON.parse(localStorage.getItem(availabilityStorageKey) || "[]");
        cachedLocalDates = normalizeAvailKeys(cached);

        setAvailableDates(cachedLocalDates);
        setPendingDates(cachedLocalDates);
        setUnsaved(false);
      } catch {
        cachedLocalDates = [];
      }

      if (!token) return;

      try {
        const data = await authRequest("/availability/me", token);
        const serverDates = availabilityToKeys(data);

        const finalDates = serverDates.length > 0 ? serverDates : cachedLocalDates;

        setAvailableDates(finalDates);
        setPendingDates(finalDates);
        setUnsaved(false);

        try {
          localStorage.setItem(availabilityStorageKey, JSON.stringify(finalDates));
        } catch {
          // ignore
        }
      } catch (err) {
        console.error("Erro ao carregar disponibilidade do servidor:", err);
      }
    } finally {
      availFetchGuardRef.current.inFlight = false;
    }
  }, [
    isCaregiver,
    user?.id,
    token,
    availabilityStorageKey,
    availabilityToKeys,
    normalizeAvailKeys,
  ]);

  const saveAvailability = useCallback(async () => {
    if (!user?.id) return;

    const cleanDates = normalizeAvailKeys(pendingDates);

    const persistCache = (keys) => {
      try {
        localStorage.setItem(availabilityStorageKey, JSON.stringify(keys));
      } catch {
        // ignore
      }
    };

    if (!token || !isCaregiver) {
      persistCache(cleanDates);
      setAvailableDates(cleanDates);
      setPendingDates(cleanDates);
      setUnsaved(false);
      showToast("Disponibilidade salva localmente. 🗓️", "success");
      return;
    }

    try {
      const data = await authRequest("/availability/me", token, {
        method: "PUT",
        body: { availability: cleanDates },
      });

      const serverDates = availabilityToKeys(data);
      const finalDates = normalizeAvailKeys(serverDates.length ? serverDates : cleanDates);

      persistCache(finalDates);
      setAvailableDates(finalDates);
      setPendingDates(finalDates);
      setUnsaved(false);

      showToast("Disponibilidade salva com sucesso! 🗓️", "success");
    } catch (err) {
      console.error("Erro ao salvar disponibilidade:", err);

      persistCache(cleanDates);
      setAvailableDates(cleanDates);
      setPendingDates(cleanDates);
      setUnsaved(false);

      showToast("Erro ao salvar no servidor. Salvando apenas localmente.", "error");
    }
  }, [
    user?.id,
    token,
    isCaregiver,
    pendingDates,
    availabilityStorageKey,
    normalizeAvailKeys,
    availabilityToKeys,
    showToast,
  ]);

  const discardAvailability = useCallback(() => {
    setPendingDates([...availableDates]);
    setUnsaved(false);
    showToast("Alterações descartadas.", "notify");
  }, [availableDates, showToast]);

  // ---------- Chat unread: listeners ----------
  useEffect(() => {
    if (!user?.id) {
      setUnreadChatIds([]);
      return;
    }

    loadUnreadChatFromServer();

    const handleUnreadChanged = (event) => {
      const { list } = event.detail || {};
      if (Array.isArray(list)) setUnreadChatIds(list.map(String));
    };

    window.addEventListener("chat-unread-changed", handleUnreadChanged);
    return () => window.removeEventListener("chat-unread-changed", handleUnreadChanged);
  }, [user?.id, loadUnreadChatFromServer]);

  // Notifs de reserva unread (evento global)
  useEffect(() => {
    if (!user?.id) {
      setUnreadResIds([]);
      return;
    }

    refreshUnreadReservationNotifs();

    const onResNotifChanged = () => refreshUnreadReservationNotifs();

    const onStorage = (e) => {
      if (!(e instanceof StorageEvent)) return;
      if (e.key !== "reservationNotifications") return;
      refreshUnreadReservationNotifs();
    };

    window.addEventListener("reservation-notifications-changed", onResNotifChanged);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("reservation-notifications-changed", onResNotifChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, [user?.id, refreshUnreadReservationNotifs]);

  /* ===========================================================
     ✅ Dashboard escuta "reservation-updated"
     =========================================================== */
  const scheduleRefresh = useCallback(
    (opts = {}) => {
      if (!user?.id) return;

      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

      refreshTimerRef.current = setTimeout(() => {
        loadReservations();
        loadUnreadChatFromServer();
        loadMyReviewsFromServer();

        if (opts?.maybeAvailability && isCaregiver) {
          loadAvailabilityIfCaregiver();
        }
      }, 120);
    },
    [
      user?.id,
      loadReservations,
      loadUnreadChatFromServer,
      loadMyReviewsFromServer,
      isCaregiver,
      loadAvailabilityIfCaregiver,
    ]
  );

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const onReservationUpdated = (e) => {
      const detail = e?.detail || {};
      const rid = detail?.reservationId != null ? String(detail.reservationId) : null;

      if (detail?.reason === "dashboard-apply") return;

      if (rid && (detail?.reason === "rating-local" || detail?.reason === "rating-saved")) {
        const role = String(detail?.fromRole || detail?.role || user?.role || "");
        const rating = detail?.rating;
        const comment = detail?.comment ?? null;

        if (rating != null) {
          setReservations((prev) => {
            const list = Array.isArray(prev) ? prev : [];
            const next = list.map((r) => {
              if (String(r?.id) !== rid) return r;
              if (role === "tutor") {
                return {
                  ...r,
                  tutorRating: rating,
                  tutorReview: comment ?? r.tutorReview ?? null,
                  __hasTutorReview: true,
                };
              }
              if (role === "caregiver") {
                return {
                  ...r,
                  caregiverRating: rating,
                  caregiverReview: comment ?? r.caregiverReview ?? null,
                  __hasCaregiverReview: true,
                };
              }
              return r;
            });

            try {
              localStorage.setItem(reservationsStorageKey, JSON.stringify(next));
            } catch {
              // ignore
            }
            return next;
          });
        }

        if (rid) {
          setMyReviewedReservationIds((prev) => {
            const next = new Set(prev);
            next.add(String(rid));
            return next;
          });
          setMyReviewsLoaded(true);
        }
      }

      if (rid && detail?.status) {
        setReservations((prev) => {
          const list = Array.isArray(prev) ? prev : [];
          const next = list.map((r) => {
            if (String(r?.id) !== rid) return r;

            const nextReject =
              detail.status === "Recusada"
                ? detail.rejectReason ?? r.rejectReason ?? null
                : null;

            return {
              ...r,
              status: detail.status,
              rejectReason: nextReject,
            };
          });

          try {
            localStorage.setItem(reservationsStorageKey, JSON.stringify(next));
          } catch {
            // ignore
          }

          return next;
        });
      }

      if (rid && user?.id) {
        const src = detail?.source;
        const reason = detail?.reason;
        const isSelfAction =
          src === "local" ||
          src === "server" ||
          reason === "rating-local" ||
          reason === "rating-saved" ||
          reason === "status-local";

        if (isSelfAction) {
          markReservationNotifsRead(user.id, rid);
        }
      }

      const maybeAvailability =
        isCaregiver &&
        (detail?.status === "Aceita" ||
          detail?.status === "Cancelada" ||
          detail?.status === "Recusada" ||
          isConcludedStatus(detail?.status));

      scheduleRefresh({ maybeAvailability });
    };

    window.addEventListener("reservation-updated", onReservationUpdated);
    return () => window.removeEventListener("reservation-updated", onReservationUpdated);
  }, [user?.id, user?.role, isCaregiver, scheduleRefresh, reservationsStorageKey]);

  // ---------- init (tabs + dados) ----------
  useEffect(() => {
    document.title = "PeloCaramelo | Painel";

    const params = new URLSearchParams(location.search);
    const tabQuery = params.get("tab");
    const stateTab = location.state?.initialTab;

    if (isCaregiver) {
      const target =
        stateTab === "reservas" || tabQuery === "reservas" ? "reservas" : "disponibilidade";
      setTab(target);
      loadAvailabilityIfCaregiver();
    } else if (isTutor) {
      let target = "reservasTutor";
      if (stateTab === "pets" || tabQuery === "pets") target = "pets";
      else if (stateTab === "reservasTutor" || tabQuery === "reservas") target = "reservasTutor";
      setTab(target);
    }

    loadReservations();
    loadMyReviewsFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role, token, location.search]);

  // foco/storage -> recarrega reservas + unread chat (+ reviews/me)
  useEffect(() => {
    const onFocus = () => {
      loadReservations();
      loadUnreadChatFromServer();
      loadMyReviewsFromServer();
      if (isCaregiver) loadAvailabilityIfCaregiver();
    };

    const onStorage = (e) => {
      if (!(e instanceof StorageEvent)) return;

      const k = e.key;
      const relevant =
        k === reservationsStorageKey ||
        k === "reservationNotifications" ||
        k === "newMessages" ||
        k === availabilityStorageKey;

      if (!relevant) return;

      loadReservations();
      loadUnreadChatFromServer();
      loadMyReviewsFromServer();
      if (isCaregiver) loadAvailabilityIfCaregiver();
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [
    loadReservations,
    loadUnreadChatFromServer,
    loadMyReviewsFromServer,
    isCaregiver,
    loadAvailabilityIfCaregiver,
    reservationsStorageKey,
    availabilityStorageKey,
  ]);

  // polling leve (chat 15s, reservas 60s, reviews 60s)
  useEffect(() => {
    if (!user?.id || !token) return;

    const chatIntervalId = setInterval(() => {
      loadUnreadChatFromServer();
    }, 15000);

    const resIntervalId = setInterval(() => {
      loadReservations();
      loadMyReviewsFromServer();
      if (isCaregiver) loadAvailabilityIfCaregiver();
    }, 60000);

    return () => {
      clearInterval(chatIntervalId);
      clearInterval(resIntervalId);
    };
  }, [
    user?.id,
    token,
    loadUnreadChatFromServer,
    loadReservations,
    loadMyReviewsFromServer,
    isCaregiver,
    loadAvailabilityIfCaregiver,
  ]);

  // ---------- status da reserva ----------
  const applyAndPersistReservation = useCallback(
    (updatedReservation) => {
      if (!updatedReservation?.id) return;

      const id = String(updatedReservation.id);

      setReservations((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const nextList = list.map((r) =>
          String(r?.id) === id ? updatedReservation : r
        );

        try {
          localStorage.setItem(reservationsStorageKey, JSON.stringify(nextList));
        } catch {
          // ignore
        }

        window.dispatchEvent(
          new CustomEvent("reservation-updated", {
            detail: {
              reservationId: id,
              status: updatedReservation.status,
              source: "local",
              reason: "dashboard-apply",
            },
          })
        );

        return nextList;
      });
    },
    [reservationsStorageKey]
  );

  const setStatus = async (id, status, rejectReason = null) => {
    const current = (reservations || []).find((r) => String(r.id) === String(id));
    if (!current) return;

    const optimistic = {
      ...current,
      status,
      rejectReason: status === "Recusada" ? rejectReason || null : null,
    };

    const toastMsg = getStatusToastMessage(status, user?.role);
    const toastType = getStatusToastType(status);

    if (token && (isTutor || isCaregiver)) {
      try {
        const body =
          status === "Recusada"
            ? { status, rejectReason: rejectReason || null }
            : { status };

        const data = await authRequest(`/reservations/${id}/status`, token, {
          method: "PATCH",
          body,
        });

        const updatedFromApi = data?.reservation
          ? normalizeReservationFromApi(data.reservation)
          : optimistic;

        applyAndPersistReservation(updatedFromApi);
        showToast(toastMsg, toastType);

        await loadReservations();

        if (isCaregiver && (status === "Aceita" || current.status === "Aceita")) {
          loadAvailabilityIfCaregiver();
        }

        return;
      } catch (err) {
        console.error("Erro ao atualizar status da reserva:", err);
        showToast(err?.message || "Erro ao atualizar status no servidor.", "error");
        return;
      }
    }

    applyAndPersistReservation(optimistic);
    showToast(toastMsg, toastType);
  };

  // checa período disponível (caregiver) com base no que está SALVO
  const isPeriodAvailableForCaregiver = (reservation) => {
    if (!reservation?.startDate || !reservation?.endDate) return false;

    const availKeys = normalizeAvailKeys(availableDates);
    if (!availKeys.length) return false;

    const start = parseLocalKey(reservation.startDate);
    const end = parseLocalKey(reservation.endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
    if (end < start) return false;

    const set = new Set(availKeys);
    const cursor = new Date(start);

    while (cursor <= end) {
      const key = toLocalKey(cursor);
      if (!set.has(key)) return false;
      cursor.setDate(cursor.getDate() + 1);
    }

    return true;
  };

  const handleAcceptReservationFromList = (reservation) => {
    if (!isPeriodAvailableForCaregiver(reservation)) {
      showToast(
        "Você só pode aceitar reservas em dias que estejam marcados como disponíveis no seu calendário.",
        "notify"
      );
      return;
    }
    setStatus(reservation.id, "Aceita");
  };

  // recusa com justificativa (modal)
  const openRejectModal = (reservation) => {
    setRejectModal({
      open: true,
      reservationId: String(reservation.id),
      tutorId: String(reservation.tutorId),
      text: "",
    });
  };

  const closeRejectModal = () => {
    setRejectModal({
      open: false,
      reservationId: null,
      tutorId: null,
      text: "",
    });
  };

  const confirmRejectWithReason = () => {
    if (!rejectModal?.reservationId) return;
    const reason = (rejectModal.text || "").trim() || null;
    setStatus(rejectModal.reservationId, "Recusada", reason);
    closeRejectModal();
  };

  // cancelamento tutor
  const handleCancelReservationAsTutor = (reservationId) => {
    setCancelConfirmId(String(reservationId));
  };

  const confirmCancelReservation = () => {
    if (!cancelConfirmId) return;
    const id = cancelConfirmId;
    setCancelConfirmId(null);
    setStatus(id, "Cancelada");
  };

  const dismissCancelReservation = () => {
    setCancelConfirmId(null);
    showToast("Cancelamento abortado.", "notify");
  };

  function hasAlreadyReviewedFallback(r, role) {
    if (!r) return false;

    const caregiverRating = r.caregiverRating ?? r.caregiver_rating ?? null;
    const tutorRating = r.tutorRating ?? r.tutor_rating ?? null;

    const caregiverReview = r.caregiverReview ?? r.caregiver_review ?? null;
    const tutorReview = r.tutorReview ?? r.tutor_review ?? null;

    if (role === "caregiver") {
      return (
        caregiverRating != null ||
        (typeof caregiverReview === "string" && caregiverReview.trim().length > 0) ||
        r.__hasCaregiverReview === true
      );
    }

    if (role === "tutor") {
      return (
        tutorRating != null ||
        (typeof tutorReview === "string" && tutorReview.trim().length > 0) ||
        r.__hasTutorReview === true
      );
    }

    return false;
  }

  const hasMyReviewForReservation = useCallback(
    (reservationId) => {
      const rid = String(reservationId);
      return myReviewedReservationIds instanceof Set
        ? myReviewedReservationIds.has(rid)
        : false;
    },
    [myReviewedReservationIds]
  );

  const canRateReservation = (r) => {
    if (!r?.endDate) return false;
    if (!isConcludedStatus(r.status)) return false;

    const end = parseLocalKey(r.endDate);
    if (Number.isNaN(end.getTime())) return false;
    if (end > today) return false;

    const hasMine = hasMyReviewForReservation(r.id);
    if (hasMine) return false;

    if (!myReviewsLoaded) {
      if (isTutor) return !hasAlreadyReviewedFallback(r, "tutor");
      if (isCaregiver) return !hasAlreadyReviewedFallback(r, "caregiver");
    }

    return true;
  };

  const openRatingModal = (reservation, label) => {
    setRatingReservation(reservation);
    setRatingTitle(label);
  };

  const closeRatingModal = () => {
    setRatingReservation(null);
    setRatingTitle("");
  };

  const handleSubmitRating = async (value, comment) => {
    if (!ratingReservation) return;

    const cleanValue = Number(value);
    const cleanComment = (comment || "").trim() || null;

    const next = (reservations || []).map((r) => {
      if (String(r.id) !== String(ratingReservation.id)) return r;

      if (isTutor)
        return {
          ...r,
          tutorRating: cleanValue,
          tutorReview: cleanComment,
          __hasTutorReview: true,
        };

      if (isCaregiver)
        return {
          ...r,
          caregiverRating: cleanValue,
          caregiverReview: cleanComment,
          __hasCaregiverReview: true,
        };

      return r;
    });

    try {
      localStorage.setItem(reservationsStorageKey, JSON.stringify(next));
    } catch {
      // ignore
    }
    setReservations(next);

    setMyReviewedReservationIds((prev) => {
      const s = new Set(prev);
      s.add(String(ratingReservation.id));
      return s;
    });
    setMyReviewsLoaded(true);

    window.dispatchEvent(
      new CustomEvent("reservation-updated", {
        detail: {
          reservationId: String(ratingReservation.id),
          source: "local",
          reason: "rating-local",
          fromRole: user?.role,
          rating: cleanValue,
          comment: cleanComment,
        },
      })
    );

    closeRatingModal();
    showToast("Avaliação enviada! Obrigado 🐾", "success");

    if (token && (isTutor || isCaregiver)) {
      try {
        await authRequest(`/reviews`, token, {
          method: "POST",
          body: {
            reservationId: Number(ratingReservation.id),
            rating: cleanValue,
            comment: cleanComment,
          },
        });

        await loadReservations();
        await loadMyReviewsFromServer();

        window.dispatchEvent(
          new CustomEvent("reservation-updated", {
            detail: {
              reservationId: String(ratingReservation.id),
              source: "server",
              reason: "rating-saved",
              fromRole: user?.role,
              rating: cleanValue,
              comment: cleanComment,
            },
          })
        );

        try {
          const rid = String(ratingReservation.id);
          const targetUserId = isTutor
            ? ratingReservation.caregiverId
            : ratingReservation.tutorId;

          if (targetUserId) {
            const notif = {
              id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
              reservationId: rid,
              targetUserId: String(targetUserId),
              type: "rating",
              createdAt: Date.now(),
              read: false,
            };

            const KEY = "reservationNotifications";
            const raw = localStorage.getItem(KEY);
            const list = raw ? JSON.parse(raw) : [];

            list.push(notif);
            localStorage.setItem(KEY, JSON.stringify(list));

            window.dispatchEvent(new CustomEvent("reservation-notifications-changed"));
          }
        } catch {
          // ignore
        }
      } catch (err) {
        console.error("Erro ao salvar avaliação no servidor:", err);
        showToast(
          "Não foi possível registrar a avaliação no servidor. Ela ficou salva localmente.",
          "error"
        );
      }
    }
  };

  const openReservation = (reservationId, opts = {}) => {
    const rid = String(reservationId);

    if (user?.id) {
      markReservationNotifsRead(user.id, rid);
      window.dispatchEvent(new Event("reservation-notifications-changed"));
    }

    const hasUnreadChat = unreadChatIds.includes(rid);
    const scrollToChat = !!opts.scrollToChat || hasUnreadChat;

    if (scrollToChat) {
      navigate({ pathname: `/reserva/${rid}`, hash: "#chat" }, { state: { scrollToChat: true } });
      return;
    }

    navigate(`/reserva/${rid}`);
  };

  // ======= PARTE 2/2 começa no próximo bloco =======
  // ------------------ TUTOR ------------------
  if (isTutor) {
    const myRes = (reservations || [])
      .filter((r) => String(r.tutorId) === String(user.id))
      .sort((a, b) => {
        const idA = String(a.id);
        const idB = String(b.id);

        const attA = unreadChatIds.includes(idA) || unreadResIds.includes(idA) ? 1 : 0;
        const attB = unreadChatIds.includes(idB) || unreadResIds.includes(idB) ? 1 : 0;

        if (attA !== attB) return attB - attA;
        return parseLocalKey(b.startDate) - parseLocalKey(a.startDate);
      });

    return (
      <div className="bg-[#EBCBA9] min-h-[calc(100vh-120px)] p-6">
        <div className="max-w-[1400px] mx-auto mb-4 flex gap-3 justify-center">
          <button
            onClick={() => setTab("reservasTutor")}
            className={`px-5 py-2 rounded-2xl font-semibold shadow transition ${
              tab === "reservasTutor"
                ? "bg-[#5A3A22] text-white"
                : "bg-[#D2A679] text-[#5A3A22] hover:bg-[#B25B38]"
            }`}
            type="button"
          >
            Minhas Reservas
          </button>

          <button
            onClick={() => setTab("pets")}
            className={`px-5 py-2 rounded-2xl font-semibold shadow transition ${
              tab === "pets"
                ? "bg-[#5A3A22] text-white"
                : "bg-[#D2A679] text-[#5A3A22] hover:bg-[#B25B38]"
            }`}
            type="button"
          >
            Meus Pets
          </button>
        </div>

        <div className="max-w-[1400px] mx-auto mb-4 flex justify-end">
          <Link
            to="/avaliacoes"
            className="px-4 py-2 rounded-2xl bg-[#FFD700]/90 hover:bg-[#FFD700] text-[#5A3A22] font-semibold shadow text-sm"
          >
            Ver minhas avaliações
          </Link>
        </div>

        <div className="max-w-[1400px] mx-auto bg-white rounded-2xl shadow p-6 border-l-4 border-[#FFD700]/80">
          {/* TAB: RESERVAS */}
          {tab === "reservasTutor" && (
            <>
              {myRes.length ? (
                myRes.map((r) => {
                  const canRate = canRateReservation(r);

                  const idStr = String(r.id);
                  const hasUnreadChat = unreadChatIds.includes(idStr);
                  const hasUnreadResNotif = unreadResIds.includes(idStr);

                  const alreadyByMe = hasMyReviewForReservation(idStr);
                  const alreadyFallback = hasAlreadyReviewedFallback(r, "tutor");
                  const alreadyRated = alreadyByMe || alreadyFallback;

                  let cardClasses =
                    "relative border rounded-lg p-4 mb-3 text-[#5A3A22] shadow-sm transition ";
                  if (hasUnreadChat || hasUnreadResNotif) {
                    cardClasses += "border-[#FFD700] bg-[#FFF8E0] ring-1 ring-[#FFD700]/40";
                  } else {
                    cardClasses += "bg-white hover:bg-[#FFFDF8]";
                  }

                  const statusHelper = getStatusHelperText(r, "tutor");
                  const rejectReason =
                    r.status === "Recusada" ? r.rejectReason || null : null;

                  const showTutorRating =
                    r.tutorRating != null && Number.isFinite(Number(r.tutorRating));

                  return (
                    <div key={r.id} className={cardClasses}>
                      {(hasUnreadChat || hasUnreadResNotif) && (
                        <div className="absolute top-3 right-3 flex items-center gap-2">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              hasUnreadChat ? "bg-blue-600" : "bg-red-600"
                            }`}
                            title={hasUnreadChat ? "Nova mensagem" : "Atualização"}
                          />
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/70 border border-[#FFD700]/50 text-[#5A3A22]">
                            {hasUnreadChat ? "CHAT" : "UPDATE"}
                          </span>
                        </div>
                      )}

                      <button
                        onClick={() =>
                          openReservation(r.id, { scrollToChat: hasUnreadChat })
                        }
                        className="text-left w-full"
                        title="Abrir detalhes da reserva"
                        type="button"
                      >
                        <p>
                          <b>Cuidador:</b> {r.caregiverName}
                        </p>
                        <p>
                          <b>Cidade:</b> {r.city}
                        </p>
                        <p>
                          <b>Período:</b> {formatDateBR(r.startDate)} até{" "}
                          {formatDateBR(r.endDate)}
                        </p>
                        <p>
                          <b>Total:</b> R$ {Number(r.total || 0).toFixed(2)}
                        </p>
                        <p>
                          <b>Status:</b>{" "}
                          <span className={`font-semibold ${getStatusColor(r.status)}`}>
                            {r.status}
                          </span>
                        </p>

                        {(hasUnreadChat || hasUnreadResNotif) && (
                          <p className="mt-1 text-xs font-semibold text-[#B25B38]">
                            {hasUnreadChat
                              ? "Nova mensagem nesta reserva"
                              : "Atualização nesta reserva"}
                          </p>
                        )}

                        {statusHelper && (
                          <p
                            className={`mt-1 text-xs ${
                              r.status === "Recusada" || r.status === "Cancelada"
                                ? "text-red-600"
                                : "text-[#5A3A22]"
                            }`}
                          >
                            {statusHelper}
                          </p>
                        )}

                        {r.status === "Recusada" && rejectReason && (
                          <p className="mt-2 text-xs text-[#5A3A22] bg-[#FFF8F0] border rounded-lg p-2">
                            <b>Motivo da recusa:</b> {rejectReason}
                          </p>
                        )}
                      </button>

                      <div className="mt-2 flex items-center justify-between">
                        {alreadyRated ? (
                          <p className="text-xs text-[#5A3A22] opacity-80">
                            {showTutorRating ? (
                              <>
                                Sua avaliação para este cuidador:{" "}
                                <b>⭐ {Number(r.tutorRating)}/5</b>
                                {r.tutorReview ? ` — "${r.tutorReview}"` : ""}
                              </>
                            ) : (
                              <>Você já avaliou esta reserva.</>
                            )}
                          </p>
                        ) : (
                          <p className="text-xs text-[#5A3A22] opacity-70">
                            Após a reserva ser concluída, você poderá avaliar o cuidador.
                          </p>
                        )}

                        <div className="flex gap-2 items-center">
                          {canRate && (
                            <button
                              type="button"
                              onClick={() => openRatingModal(r, "Avaliar cuidador")}
                              className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#FFD700]/90 hover:bg-[#FFD700] text-[#5A3A22] shadow"
                            >
                              Avaliar cuidador
                            </button>
                          )}

                          {(r.status === "Pendente" || r.status === "Aceita") && (
                            <button
                              type="button"
                              onClick={() => handleCancelReservationAsTutor(r.id)}
                              className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white shadow"
                            >
                              Cancelar reserva
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : reservationsLoading ? (
                <p className="text-center text-[#5A3A22]">Carregando suas reservas...</p>
              ) : (
                <p className="text-center text-[#5A3A22]">Você ainda não fez reservas.</p>
              )}
            </>
          )}

          {/* TAB: PETS */}
          {tab === "pets" && <TutorPets />}

          {/* CONFIRMAR CANCELAMENTO */}
          {cancelConfirmId && (
            <div className="fixed bottom-6 right-6 z-[9999] w-[360px] max-w-[92vw]">
              <div className="bg-white shadow-xl rounded-2xl border-l-4 border-red-600 p-4">
                <p className="text-sm text-[#5A3A22] font-semibold">
                  Tem certeza que deseja cancelar esta reserva?
                </p>
                <p className="text-xs text-[#5A3A22] opacity-80 mt-1">
                  Essa ação não pode ser desfeita.
                </p>

                <div className="flex justify-end gap-2 mt-4">
                  <button
                    type="button"
                    onClick={dismissCancelReservation}
                    className="px-3 py-2 rounded-lg text-xs font-semibold bg-gray-200 hover:bg-gray-300 text-[#5A3A22]"
                  >
                    Manter reserva
                  </button>
                  <button
                    type="button"
                    onClick={confirmCancelReservation}
                    className="px-3 py-2 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white"
                  >
                    Cancelar reserva
                  </button>
                </div>
              </div>
            </div>
          )}

          <RatingModal
            isOpen={!!ratingReservation}
            title={ratingTitle || "Avaliar"}
            onClose={closeRatingModal}
            onSubmit={handleSubmitRating}
          />
        </div>
      </div>
    );
  }

  // ------------------ CUIDADOR ------------------
  if (isCaregiver) {
    const received = (reservations || [])
      .filter((r) => String(r.caregiverId) === String(user.id))
      .sort((a, b) => {
        const idA = String(a.id);
        const idB = String(b.id);

        const attA = unreadChatIds.includes(idA) || unreadResIds.includes(idA) ? 1 : 0;
        const attB = unreadChatIds.includes(idB) || unreadResIds.includes(idB) ? 1 : 0;

        if (attA !== attB) return attB - attA;
        return parseLocalKey(b.startDate) - parseLocalKey(a.startDate);
      });

    const todayKey = toLocalKey(today);

    return (
      <div className="bg-[#EBCBA9] min-h-[calc(100vh-120px)] p-6">
        <div className="max-w-[1400px] mx-auto mb-4 flex gap-3 justify-center">
          <button
            onClick={() => setTab("disponibilidade")}
            className={`px-5 py-2 rounded-2xl font-semibold shadow transition ${
              tab === "disponibilidade"
                ? "bg-[#5A3A22] text-white"
                : "bg-[#D2A679] text-[#5A3A22] hover:bg-[#B25B38]"
            }`}
            type="button"
          >
            Disponibilidade
          </button>
          <button
            onClick={() => setTab("reservas")}
            className={`px-5 py-2 rounded-2xl font-semibold shadow transition ${
              tab === "reservas"
                ? "bg-[#5A3A22] text-white"
                : "bg-[#D2A679] text-[#5A3A22] hover:bg-[#B25B38]"
            }`}
            type="button"
          >
            Reservas Recebidas
          </button>
        </div>

        <div className="max-w-[1400px] mx-auto mb-4 flex justify-end">
          <Link
            to="/avaliacoes"
            className="px-4 py-2 rounded-2xl bg-[#FFD700]/90 hover:bg-[#FFD700] text-[#5A3A22] font-semibold shadow text-sm"
          >
            Ver minhas avaliações
          </Link>
        </div>

        <div className="max-w-[1400px] mx-auto bg-white rounded-2xl shadow p-6 border-l-4 border-[#FFD700]/80">
          {tab === "disponibilidade" && (
            <section>
              <div className="flex flex-wrap items-center gap-4 text-sm text-[#5A3A22] mb-4">
                <span className="inline-flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#D2A679] inline-block" /> Hoje
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-green-700 inline-block" /> Salvo
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Novo
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-400 inline-block" /> Remover
                </span>
              </div>

              <div className="flex justify-center">
                <Calendar
                  className="mx-auto"
                  activeStartDate={currentMonth}
                  onActiveStartDateChange={({ activeStartDate }) => setCurrentMonth(activeStartDate)}
                  onClickDay={(date) => {
                    if (date < today) return;

                    const key = toLocalKey(date);
                    setPendingDates((prev) =>
                      prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key]
                    );
                    setUnsaved(true);
                  }}
                  tileDisabled={({ date }) => date < today}
                  tileClassName={({ date }) => {
                    const key = toLocalKey(date);

                    const isSaved = availableDates.includes(key);
                    const isPending = pendingDates.includes(key);
                    const isPast = date < today;

                    const cls = [];

                    if (key === todayKey) cls.push("pc-cal-today");

                    if (isSaved && isPending) cls.push("pc-cal-saved");
                    if (isSaved && !isPending) cls.push("pc-cal-remove");
                    if (isPending && !isSaved) cls.push("pc-cal-new");
                    if (isPast) cls.push("pc-cal-past");

                    return cls.join(" ");
                  }}
                />
              </div>

              <div className="flex justify-end gap-3 mt-5">
                <button
                  onClick={discardAvailability}
                  type="button"
                  className="bg-gray-400 hover:bg-gray-500 text-white font-semibold px-5 py-2 rounded-lg shadow-md"
                >
                  ↩️ Descartar
                </button>
                <button
                  onClick={saveAvailability}
                  type="button"
                  disabled={!unsaved}
                  className={`font-semibold px-5 py-2 rounded-lg shadow-md ${
                    unsaved
                      ? "bg-green-700 hover:bg-green-800 text-white"
                      : "bg-green-700/50 text-white/70 cursor-not-allowed"
                  }`}
                >
                  💾 Salvar Alterações
                </button>
              </div>

              <div className="bg-[#F9F5F2] p-4 rounded-lg shadow-md mt-6">
                <h3 className="text-lg font-semibold text-[#5A3A22] mb-3">
                  Datas disponíveis em{" "}
                  {currentMonth.toLocaleString("pt-BR", { month: "long", year: "numeric" })}
                </h3>

                {pendingDates.length ? (
                  <ul className="list-disc pl-5 text-sm text-[#5A3A22] space-y-1">
                    {normalizeAvailKeys(pendingDates)
                      .filter((key) => {
                        const dt = parseLocalKey(key);
                        return (
                          dt.getMonth() === currentMonth.getMonth() &&
                          dt.getFullYear() === currentMonth.getFullYear()
                        );
                      })
                      .sort()
                      .map((key) => {
                        const dt = parseLocalKey(key);
                        const isPast = dt < today;
                        const wasSaved = availableDates.includes(key);
                        const isNew = !wasSaved;

                        return (
                          <li
                            key={key}
                            className={isPast ? "line-through opacity-60" : ""}
                            title={isPast ? "Data já passou" : isNew ? "Novo (ainda não salvo)" : "Salvo"}
                          >
                            {formatDateBR(key)}
                            {isNew ? (
                              <span className="ml-2 text-xs font-semibold text-green-600">(novo)</span>
                            ) : null}
                          </li>
                        );
                      })}
                  </ul>
                ) : (
                  <p className="text-gray-600 text-sm">Nenhuma data disponível neste mês.</p>
                )}

                {unsaved && (
                  <p className="mt-3 text-xs text-[#B25B38] font-semibold">
                    Você tem alterações não salvas.
                  </p>
                )}
              </div>
            </section>
          )}

          {tab === "reservas" && (
            <section>
              {reservationsLoading ? (
                <p className="text-center text-[#5A3A22]">Carregando reservas...</p>
              ) : received.length === 0 ? (
                <p className="text-center text-[#5A3A22]">Nenhuma reserva recebida.</p>
              ) : (
                received.map((r) => {
                  const canRate = canRateReservation(r);

                  const idStr = String(r.id);
                  const hasUnreadChat = unreadChatIds.includes(idStr);
                  const hasUnreadResNotif = unreadResIds.includes(idStr);

                  const alreadyByMe = hasMyReviewForReservation(idStr);
                  const alreadyFallback = hasAlreadyReviewedFallback(r, "caregiver");
                  const alreadyRated = alreadyByMe || alreadyFallback;

                  let cardClasses =
                    "relative border rounded-lg p-4 mb-3 text-[#5A3A22] shadow-sm transition ";
                  if (hasUnreadChat || hasUnreadResNotif) {
                    cardClasses += "border-[#FFD700] bg-[#FFF8E0] ring-1 ring-[#FFD700]/40";
                  } else {
                    cardClasses += "bg-white hover:bg-[#FFFDF8]";
                  }

                  const statusHelper = getStatusHelperText(r, "caregiver");

                  const showCaregiverRating =
                    r.caregiverRating != null &&
                    Number.isFinite(Number(r.caregiverRating));

                  const showActions = r.status === "Pendente";

                  return (
                    <div key={r.id} className={cardClasses}>
                      <button
                        onClick={() => openReservation(r.id, { scrollToChat: hasUnreadChat })}
                        className="text-left w-full"
                        type="button"
                      >
                        <p>
                          <b>Tutor:</b> {r.tutorName}
                        </p>
                        <p>
                          <b>Período:</b> {formatDateBR(r.startDate)} até{" "}
                          {formatDateBR(r.endDate)}
                        </p>
                        <p>
                          <b>Total:</b> R$ {Number(r.total || 0).toFixed(2)}
                        </p>
                        <p>
                          <b>Status:</b>{" "}
                          <span className={`font-semibold ${getStatusColor(r.status)}`}>
                            {r.status}
                          </span>
                        </p>

                        {(hasUnreadChat || hasUnreadResNotif) && (
                          <p className="mt-1 text-xs font-semibold text-[#B25B38]">
                            {hasUnreadChat
                              ? "Nova mensagem nesta reserva"
                              : "Atualização nesta reserva"}
                          </p>
                        )}

                        {statusHelper && (
                          <p className="mt-1 text-xs text-[#5A3A22]">{statusHelper}</p>
                        )}
                      </button>

                      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                        {alreadyRated ? (
                          <p className="text-xs text-[#5A3A22] opacity-80">
                            {showCaregiverRating ? (
                              <>
                                Sua avaliação: <b>⭐ {Number(r.caregiverRating)}/5</b>
                              </>
                            ) : (
                              <>Você já avaliou esta reserva.</>
                            )}
                          </p>
                        ) : (
                          <p className="text-xs text-[#5A3A22] opacity-70">
                            Após a reserva ser concluída, você poderá avaliar o tutor.
                          </p>
                        )}

                        <div className="flex gap-2 items-center">
                          {showActions && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleAcceptReservationFromList(r)}
                                className="px-3 py-1 rounded-lg text-xs font-semibold bg-green-700 hover:bg-green-800 text-white shadow"
                              >
                                Aceitar
                              </button>
                              <button
                                type="button"
                                onClick={() => openRejectModal(r)}
                                className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white shadow"
                              >
                                Recusar
                              </button>
                            </>
                          )}

                          {canRate && (
                            <button
                              type="button"
                              onClick={() => openRatingModal(r, "Avaliar tutor")}
                              className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#FFD700]/90 hover:bg-[#FFD700] text-[#5A3A22] shadow"
                            >
                              Avaliar tutor
                            </button>
                          )}
                        </div>
                      </div>

                      {r.status === "Recusada" && r.rejectReason ? (
                        <p className="mt-2 text-xs text-[#5A3A22] bg-[#FFF8F0] border rounded-lg p-2">
                          <b>Motivo da recusa:</b> {r.rejectReason}
                        </p>
                      ) : null}
                    </div>
                  );
                })
              )}
            </section>
          )}

          {rejectModal.open && (
            <div className="fixed inset-0 z-[9999] flex items-end md:items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-[520px] bg-white rounded-2xl shadow-xl border-l-4 border-red-600 p-4">
                <p className="text-sm font-semibold text-[#5A3A22]">Recusar pré-reserva</p>
                <p className="text-xs text-[#5A3A22] opacity-80 mt-1">
                  (Opcional) Escreva um motivo para o tutor entender o porquê da recusa.
                </p>

                <textarea
                  value={rejectModal.text}
                  onChange={(e) => setRejectModal((s) => ({ ...s, text: e.target.value }))}
                  rows={4}
                  placeholder="Ex.: Não estarei disponível nesse dia / Já tenho outra reserva / Fora da minha área..."
                  className="mt-3 w-full border rounded-xl p-3 text-sm text-[#5A3A22] outline-none focus:ring-2 focus:ring-[#FFD700]/70"
                />

                <div className="flex justify-end gap-2 mt-4">
                  <button
                    type="button"
                    onClick={closeRejectModal}
                    className="px-3 py-2 rounded-lg text-xs font-semibold bg-gray-200 hover:bg-gray-300 text-[#5A3A22]"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    onClick={confirmRejectWithReason}
                    className="px-3 py-2 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white"
                  >
                    Recusar
                  </button>
                </div>
              </div>
            </div>
          )}

          <RatingModal
            isOpen={!!ratingReservation}
            title={ratingTitle || "Avaliar"}
            onClose={closeRatingModal}
            onSubmit={handleSubmitRating}
          />
        </div>
      </div>
    );
  }

  // ------------------ Sem login ------------------
  return (
    <div className="bg-[#EBCBA9] min-h-[calc(100vh-120px)] flex items-center justify-center">
      <p className="text-lg font-semibold text-[#5A3A22]">
        Faça login para acessar seu painel na{" "}
        <span className="text-[#5A3A22]">Pelo</span>
        <span className="text-yellow-400">Caramelo</span>.
      </p>
    </div>
  );
}
