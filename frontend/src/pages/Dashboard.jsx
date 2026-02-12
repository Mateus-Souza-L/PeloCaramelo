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
import WelcomeModal from "../components/WelcomeModal";
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

  // aceita payloads onde a reserva vem "aninhada"
  const obj = r.reservation ?? r.item ?? r;

  // petsIds pode vir como pets_ids (string JSON), petsIds (array), etc.
  let petsIds =
    obj.pets_ids ??
    obj.petsIds ??
    obj.petIds ??
    obj.pets ??
    [];

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

  const startRaw = obj.start_date ?? obj.startDate ?? obj.start ?? "";
  const endRaw = obj.end_date ?? obj.endDate ?? obj.end ?? "";

  const petsSnapshotRaw = obj.pets_snapshot ?? obj.petsSnapshot ?? [];

  return {
    id: String(obj.id ?? obj.reservation_id ?? obj.reservationId ?? ""),

    tutorId:
      obj.tutor_id != null
        ? String(obj.tutor_id)
        : obj.tutorId != null
          ? String(obj.tutorId)
          : "",

    tutorName: obj.tutor_name ?? obj.tutorName ?? "",

    caregiverId:
      obj.caregiver_id != null
        ? String(obj.caregiver_id)
        : obj.caregiverId != null
          ? String(obj.caregiverId)
          : "",

    caregiverName: obj.caregiver_name ?? obj.caregiverName ?? "",

    city: obj.city ?? "",
    neighborhood: obj.neighborhood ?? "",
    service: obj.service ?? "",

    pricePerDay: Number(obj.price_per_day ?? obj.pricePerDay ?? 0),

    startDate: startRaw ? String(startRaw).slice(0, 10) : "",
    endDate: endRaw ? String(endRaw).slice(0, 10) : "",

    total: Number(obj.total ?? 0),
    status: obj.status || "Pendente",

    tutorRating: obj.tutor_rating ?? obj.tutorRating ?? null,
    tutorReview: obj.tutor_review ?? obj.tutorReview ?? null,

    caregiverRating: obj.caregiver_rating ?? obj.caregiverRating ?? null,
    caregiverReview: obj.caregiver_review ?? obj.caregiverReview ?? null,

    __hasTutorReview:
      obj.__hasTutorReview ??
      obj.has_tutor_review ??
      obj.hasTutorReview ??
      false,

    __hasCaregiverReview:
      obj.__hasCaregiverReview ??
      obj.has_caregiver_review ??
      obj.hasCaregiverReview ??
      false,

    petsIds,
    petsNames: obj.pets_names ?? obj.petsNames ?? "",
    petsSnapshot: Array.isArray(petsSnapshotRaw) ? petsSnapshotRaw : [],

    rejectReason: obj.reject_reason ?? obj.rejectReason ?? null,
    cancelReason: obj.cancel_reason ?? obj.cancelReason ?? null,
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

  const petsSnapshotRaw = r.petsSnapshot ?? r.pets_snapshot ?? [];

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
    petsSnapshot: Array.isArray(petsSnapshotRaw) ? petsSnapshotRaw : [],

    cancelReason: r.cancelReason ?? r.cancel_reason ?? null,
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

// ===========================================================
// ✅ PRIORIDADE GLOBAL: traz reservas "unread" de outras páginas
// para o topo da página 1, usando cache local por página.
// ===========================================================
function boostUnreadToFirstPage({
  pageList,
  userId,
  role,
  pageSize,
  totalPages,
  unreadIds,
}) {
  const safePage = Array.isArray(pageList) ? pageList : [];
  const uid = userId != null ? String(userId) : null;
  if (!uid) return safePage;

  const roleKey = role === "caregiver" ? "caregiver" : "tutor";
  const unreadSet = new Set((Array.isArray(unreadIds) ? unreadIds : []).map(String));
  if (!unreadSet.size) return safePage;

  // lê caches locais de páginas 1..totalPages
  const cachedAll = [];
  const maxPages = Math.max(1, Number(totalPages || 1));

  for (let p = 1; p <= maxPages; p++) {
    const key = `reservations_${roleKey}_${uid}_p${String(p)}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [];
      for (const item of list) {
        const n = normalizeReservationFromLocal(item);
        if (n) cachedAll.push(n);
      }
    } catch {
      // ignore
    }
  }

  // pega somente as reservas unread (de qualquer página que esteja no cache)
  const unreadFromCache = [];
  const seen = new Set();

  for (const r of cachedAll) {
    const id = String(r?.id || "");
    if (!id) continue;
    if (!unreadSet.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    unreadFromCache.push(r);
  }

  if (!unreadFromCache.length) return safePage;

  // remove do page atual quem já vai ser promovido
  const rest = safePage.filter((r) => !seen.has(String(r?.id)));

  // unread no topo, completa com o resto, respeitando pageSize
  const boosted = [...unreadFromCache, ...rest].slice(0, Math.max(1, Number(pageSize || 6)));

  return boosted;
}

export default function Dashboard() {
  const { user, token, hasCaregiverProfile, activeMode } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  /* ===========================================================
   ✅ Welcome Modal (pós-cadastro) — aparece 1x por sessão
   - flag vem do Register (sessionStorage ou localStorage)
   =========================================================== */
  const [showWelcome, setShowWelcome] = useState(false);
  const [resendingGuide, setResendingGuide] = useState(false);
  const [resendState, setResendState] = useState("idle"); // "idle" | "ok" | "error"

  useEffect(() => {
    try {
      // ✅ prioridade: session (recomendado)
      const flagSession = sessionStorage.getItem("pc_welcome_toast");
      if (flagSession === "1") {
        sessionStorage.removeItem("pc_welcome_toast");
        setShowWelcome(true);
        return;
      }

      // ✅ fallback: se você ainda estiver usando localStorage
      const flagLocal = localStorage.getItem("pc_showWelcomeToast");
      if (flagLocal === "1") {
        localStorage.removeItem("pc_showWelcomeToast");
        localStorage.removeItem("pc_showWelcomeToast_role");
        setShowWelcome(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleResendGuide = useCallback(async () => {
    if (!token) return;

    try {
      setResendState("idle");
      setResendingGuide(true);

      // ✅ endpoint sugerido (backend)
      await authRequest("/auth/resend-welcome-guide", token, {
        method: "POST",
      });

      setResendState("ok");
    } catch (e) {
      console.error("Erro ao reenviar guia:", e);
      setResendState("error");
    } finally {
      setResendingGuide(false);
    }
  }, [token]);

  // ===========================================================
  // ✅ Troca de perfil (tutor/caregiver) sem trocar usuário
  // - Detecta se o usuário tem ambos perfis
  // - Persiste o perfil ativo no localStorage por user.id
  // ===========================================================

  const rolesAvailable = useMemo(() => {
    const set = new Set();

    // role principal (se existir)
    if (user?.role) set.add(String(user.role));

    // ✅ fonte de verdade vinda do AuthContext
    if (hasCaregiverProfile) {
      set.add("tutor");     // quem vira cuidador continua sendo tutor
      set.add("caregiver");
    }

    // formatos comuns que podem existir no seu user
    if (Array.isArray(user?.roles)) user.roles.forEach((r) => r && set.add(String(r)));
    if (user?.isTutor === true) set.add("tutor");
    if (user?.isCaregiver === true) set.add("caregiver");

    // (opcional) se você usa "tutor+caregiver" em algum lugar
    if (user?.role === "tutor+caregiver") {
      set.add("tutor");
      set.add("caregiver");
    }

    const arr = Array.from(set).filter((r) => r === "tutor" || r === "caregiver");
    // garante ordem consistente (tutor primeiro)
    arr.sort((a, b) => (a === b ? 0 : a === "tutor" ? -1 : 1));
    return arr;
  }, [user, hasCaregiverProfile]);

  const hasBothRoles = rolesAvailable.length >= 2;

  const activeRoleStorageKey = useMemo(() => {
    const uid = user?.id != null ? String(user.id) : "anon";
    return `activeRole_${uid}`;
  }, [user?.id]);

  const [activeRole, setActiveRole] = useState(() => {
    // 1) prioridade: activeMode do AuthContext (Navbar já define isso)
    const m = String(activeMode || "").toLowerCase().trim();
    if (m === "caregiver" && hasCaregiverProfile) return "caregiver";
    if (m === "tutor") return "tutor";

    // 2) fallback: localStorage
    try {
      const saved = localStorage.getItem(activeRoleStorageKey);
      if (saved === "caregiver" && hasCaregiverProfile) return "caregiver";
      if (saved === "tutor") return "tutor";
    } catch {
      // ignore
    }

    // 3) default
    return hasCaregiverProfile ? "caregiver" : "tutor";
  });

  // garante que activeRole sempre seja um role válido pro usuário
  useEffect(() => {
    if (!user?.id) return;
    if (!rolesAvailable.length) return;

    if (!rolesAvailable.includes(activeRole)) {
      const next = rolesAvailable[0];
      setActiveRole(next);
      try {
        localStorage.setItem(activeRoleStorageKey, next);
      } catch {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, rolesAvailable.join("|")]);

  const setRoleSafe = useCallback(
    (nextRole) => {
      const next = nextRole === "caregiver" ? "caregiver" : "tutor";
      if (!rolesAvailable.includes(next)) return;

      setActiveRole(next);
      try {
        localStorage.setItem(activeRoleStorageKey, next);
      } catch {
        // ignore
      }

      // opcional: limpa hash/tab da URL ao trocar perfil, pra não ficar preso em aba errada
      // navigate({ pathname: "/dashboard" }, { replace: true });
    },
    [rolesAvailable, activeRoleStorageKey]
  );

  // ✅ FIX: sincroniza o Dashboard SEM depender de "storage" (que não dispara na mesma aba)
  // e também cobre o caso do evento "active-role-changed" ter disparado antes do Dashboard montar.
  useEffect(() => {
    const m = String(activeMode || "").toLowerCase().trim();

    // se a Navbar pediu caregiver mas o usuário não tem perfil caregiver, ignora
    if (m === "caregiver" && !hasCaregiverProfile) return;

    if (m === "tutor" || m === "caregiver") {
      // só aplica se realmente mudou (evita re-render à toa)
      if (m !== activeRole) {
        setRoleSafe(m);
      }
      return;
    }

    // fallback: se por algum motivo o activeMode não veio, tenta ler do localStorage
    try {
      const saved = localStorage.getItem(activeRoleStorageKey);
      if (saved === "tutor" || (saved === "caregiver" && hasCaregiverProfile)) {
        if (saved !== activeRole) setRoleSafe(saved);
      }
    } catch {
      // ignore
    }
  }, [
    activeMode,
    hasCaregiverProfile,
    activeRole,
    setRoleSafe,
    activeRoleStorageKey,
  ]);

  useEffect(() => {
    const onRoleChanged = (e) => {
      const next = e?.detail?.role;
      if (next !== "tutor" && next !== "caregiver") return;

      if (next === "caregiver" && !hasCaregiverProfile) return;

      setActiveRole(next);

      // ✅ IMPORTANTÍSSIMO: persistir, senão outro effect “puxa de volta”
      try {
        localStorage.setItem(activeRoleStorageKey, next);
      } catch {
        // ignore
      }
    };

    window.addEventListener("active-role-changed", onRoleChanged);
    return () => window.removeEventListener("active-role-changed", onRoleChanged);
  }, [hasCaregiverProfile, activeRoleStorageKey]);

  useEffect(() => {
    if (!user?.id) return;

    try {
      const saved = localStorage.getItem(activeRoleStorageKey);
      if (saved !== "tutor" && saved !== "caregiver") return;

      if (saved === "caregiver" && !hasCaregiverProfile) return;

      // ✅ só atualiza se for diferente (evita “voltar” desnecessariamente)
      setActiveRole((prev) => (prev === saved ? prev : saved));
    } catch {
      // ignore
    }
  }, [user?.id, activeRoleStorageKey, hasCaregiverProfile]);

  const isTutor = activeRole === "tutor";
  const isCaregiver = activeRole === "caregiver";


  const [tab, setTab] = useState("disponibilidade");
  const [reservations, setReservations] = useState([]);

  // ===========================================================
  // 📄 Paginação de reservas (backend) — 6 por página
  // ===========================================================
  const RESERVATIONS_PAGE_SIZE = 6;
  const [resPage, setResPage] = useState(1);
  const [resTotal, setResTotal] = useState(0);
  const [resTotalPages, setResTotalPages] = useState(1);
  const [resHasNext, setResHasNext] = useState(false);
  const computedTotalPages = useMemo(() => {
    // 1) se o backend mandou totalPages válido, prioriza
    const tp = Number(resTotalPages || 0);
    if (Number.isFinite(tp) && tp > 0) return tp;

    // 2) senão, calcula por total (se vier)
    const total = Number(resTotal || 0);
    if (Number.isFinite(total) && total > 0) {
      return Math.max(1, Math.ceil(total / RESERVATIONS_PAGE_SIZE));
    }

    // 3) sem total e sem totalPages → assume pelo menos a página atual
    return Math.max(1, Number(resPage || 1));
  }, [resTotalPages, resTotal, resPage]);

  // ===========================================================
  // 🧮 Capacidade diária do cuidador (1..50 no backend)
  // ===========================================================
  const [dailyCapacity, setDailyCapacity] = useState(50);
  const [capacityMin, setCapacityMin] = useState(1);
  const [capacityMax, setCapacityMax] = useState(50);
  const [capacityLoading, setCapacityLoading] = useState(false);
  const [capacitySaving, setCapacitySaving] = useState(false);

  // ===========================================================
  // 🖼️ Galeria do cuidador (fotos de referência)
  // - backend esperado:
  //   GET    /caregivers/me/photos
  //   POST   /caregivers/me/photos   { dataUrl, caption }
  //   DELETE /caregivers/me/photos/:photoId
  // ===========================================================

  const MAX_GALLERY_PHOTO_BYTES = 6 * 1024 * 1024; // 6MB (igual ao backend)
  const [gallery, setGallery] = useState([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryCaption, setGalleryCaption] = useState("");
  const galleryFileRef = useRef(null);

  const normalizeGalleryItem = (x) => {
    if (!x) return null;
    return {
      id: String(x.id ?? x.photo_id ?? ""),
      photoUrl: x.photo_url ?? x.photoUrl ?? x.url ?? "",
      caption: x.caption ?? "",
      createdAt: x.created_at ?? x.createdAt ?? null,
    };
  };

  const loadMyGallery = useCallback(async () => {
    if (!isCaregiver || !token) {
      setGallery([]);
      return;
    }

    setGalleryLoading(true);
    try {
      const data = await authRequest("/caregivers/me/photos", token);

      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.photos)
          ? data.photos
          : Array.isArray(data?.items)
            ? data.items
            : [];

      const normalized = list.map(normalizeGalleryItem).filter(Boolean).filter((p) => p.photoUrl);
      setGallery(normalized);
    } catch (err) {
      console.error("Erro ao carregar galeria (/caregivers/me/photos):", err);
      // não mostra toast agressivo aqui pra não “poluir” o painel
    } finally {
      setGalleryLoading(false);
    }
  }, [isCaregiver, token]);

  useEffect(() => {
    loadMyGallery();
  }, [loadMyGallery]);

  const handlePickGalleryPhoto = () => {
    if (!isCaregiver) return;
    if (!token) {
      showToast("Faça login novamente para enviar fotos.", "error");
      return;
    }
    galleryFileRef.current?.click?.();
  };

  const uploadGalleryPhoto = async (file) => {
    if (!file) return;
    if (file.size > MAX_GALLERY_PHOTO_BYTES) {
      showToast("Foto muito grande. Máximo 6MB.", "notify");
      return;
    }

    setGalleryUploading(true);

    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Falha ao ler arquivo."));
        reader.readAsDataURL(file);
      });

      if (!String(dataUrl).startsWith("data:")) {
        showToast("Arquivo inválido.", "error");
        return;
      }

      const caption = (galleryCaption || "").trim() || null;

      const data = await authRequest("/caregivers/me/photos", token, {
        method: "POST",
        body: { dataUrl, caption },
      });

      const created =
        data?.photo ? normalizeGalleryItem(data.photo) : normalizeGalleryItem(data);

      if (created?.id && created?.photoUrl) {
        setGallery((prev) => [created, ...(Array.isArray(prev) ? prev : [])]);
      } else {
        // fallback: recarrega se o backend respondeu em outro formato
        await loadMyGallery();
      }

      setGalleryCaption("");
      showToast("Foto adicionada na sua galeria ✅", "success");
    } catch (err) {
      console.error("Erro ao enviar foto da galeria:", err);
      showToast("Não foi possível enviar a foto. Tente novamente.", "error");
    } finally {
      setGalleryUploading(false);
      try {
        if (galleryFileRef.current) galleryFileRef.current.value = "";
      } catch {
        // ignore
      }
    }
  };

  const deleteGalleryPhoto = async (photoId) => {
    const pid = String(photoId || "");
    if (!pid) return;

    if (!token) {
      showToast("Faça login novamente para remover fotos.", "error");
      return;
    }

    const ok = window.confirm("Remover esta foto da sua galeria?");
    if (!ok) return;

    try {
      await authRequest(`/caregivers/me/photos/${encodeURIComponent(pid)}`, token, {
        method: "DELETE",
      });

      setGallery((prev) => (Array.isArray(prev) ? prev.filter((p) => String(p.id) !== pid) : []));
      showToast("Foto removida ✅", "success");
    } catch (err) {
      console.error("Erro ao remover foto da galeria:", err);
      showToast("Não foi possível remover a foto.", "error");
    }
  };

  const loadMyCapacityIfCaregiver = useCallback(async () => {
    if (!isCaregiver || !token) return;

    setCapacityLoading(true);
    try {
      const data = await authRequest("/users/me/capacity", token);

      const cap = Number(data?.daily_capacity);
      const min = Number(data?.min);
      const max = Number(data?.max);

      if (Number.isFinite(min)) setCapacityMin(min);
      if (Number.isFinite(max)) setCapacityMax(max);

      if (Number.isFinite(cap)) {
        setDailyCapacity(cap);
      } else {
        // fallback seguro
        setDailyCapacity(50);
      }
    } catch (err) {
      console.error("Erro ao carregar capacidade (/users/me/capacity):", err);
    } finally {
      setCapacityLoading(false);
    }
  }, [isCaregiver, token]);

  const saveMyCapacityIfCaregiver = useCallback(
    async (nextValue) => {
      if (!isCaregiver || !token) return;

      const parsed = Number(nextValue);
      if (!Number.isFinite(parsed)) return;

      // clamp no front só pra UX, o backend também garante
      const clamped = Math.max(capacityMin, Math.min(capacityMax, Math.trunc(parsed)));

      setDailyCapacity(clamped);
      setCapacitySaving(true);

      try {
        await authRequest("/users/me/capacity", token, {
          method: "PUT",
          body: { daily_capacity: clamped },
        });

        showToast("Capacidade diária atualizada ✅", "success");
      } catch (err) {
        console.error("Erro ao salvar capacidade (/users/me/capacity):", err);
        showToast("Não foi possível salvar a capacidade. Tente novamente.", "error");
      } finally {
        setCapacitySaving(false);
      }
    },
    [isCaregiver, token, capacityMin, capacityMax, showToast]
  );

  const [reservationsLoading, setReservationsLoading] = useState(false);
  const [reservationsLoaded, setReservationsLoaded] = useState(false);

  const [unreadChatIds, setUnreadChatIds] = useState([]);
  const [unreadResIds, setUnreadResIds] = useState([]);

  /* ===========================================================
   ✅ PRIORIDADE GLOBAL (Página 1)
   - Faz reservas não lidas aparecerem no topo da página 1
     mesmo se estiverem em outras páginas do backend.
   - Usa cache local + fetch por ID quando precisar.
   =========================================================== */

  const priorityCacheKey = useMemo(() => {
    const uid = user?.id != null ? String(user.id) : "anon";
    return `priorityReservations_${String(activeRole)}_${uid}`;
  }, [user?.id, activeRole]);

  const readPriorityCache = useCallback(() => {
    try {
      const raw = localStorage.getItem(priorityCacheKey) || "[]";
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [];
      return list.map(normalizeReservationFromLocal).filter(Boolean);
    } catch {
      return [];
    }
  }, [priorityCacheKey]);

  const writePriorityCache = useCallback(
    (list) => {
      try {
        const safe = Array.isArray(list) ? list : [];
        localStorage.setItem(priorityCacheKey, JSON.stringify(safe));
      } catch {
        // ignore
      }
    },
    [priorityCacheKey]
  );

  const getPriorityIds = useCallback(() => {
    return Array.from(
      new Set(
        [...(unreadChatIds || []), ...(unreadResIds || [])].map((x) => String(x))
      )
    );
  }, [unreadChatIds, unreadResIds]);

  const ensurePriorityReservations = useCallback(
    async (currentPageList) => {
      // Só faz sentido garantir isso para a Página 1 (onde queremos “puxar” pro topo)
      if (Number(resPage || 1) !== 1) return;

      if (!token) return;

      const priorityIds = getPriorityIds();
      if (!priorityIds.length) return;

      const base = Array.isArray(currentPageList) ? currentPageList : [];
      const baseIds = new Set(base.map((r) => String(r?.id)));

      const cached = readPriorityCache();
      const cachedIds = new Set(cached.map((r) => String(r?.id)));

      // Busca só o que está faltando (e limita pra não fazer rajada de requests)
      const missing = priorityIds
        .filter((id) => !baseIds.has(id) && !cachedIds.has(id))
        .slice(0, 6);

      if (!missing.length) return;

      const fetched = [];

      for (const rid of missing) {
        try {
          // ✅ esse endpoint geralmente existe porque o detalhe da reserva precisa dele
          const data = await authRequest(`/reservations/${encodeURIComponent(rid)}`, token);

          const item =
            data?.reservation != null
              ? normalizeReservationFromApi(data.reservation)
              : data != null
                ? normalizeReservationFromApi(data)
                : null;

          if (item?.id) fetched.push(item);
        } catch (err) {
          // se não conseguir buscar um ID, só ignora
          console.warn("[priority] não conseguiu buscar reserva", rid, err);
        }
      }

      if (!fetched.length) return;

      // Atualiza cache com merge por id
      const map = new Map();
      for (const r of cached) map.set(String(r.id), r);
      for (const r of fetched) map.set(String(r.id), r);

      writePriorityCache(Array.from(map.values()));
    },
    [resPage, token, getPriorityIds, readPriorityCache, writePriorityCache]
  );

  // ✅ lista usada pelos cards: na Página 1 injeta as reservas não-lidas no topo
  const reservationsForDisplay = useMemo(() => {
    const base = Array.isArray(reservations) ? reservations : [];

    if (Number(resPage || 1) !== 1) return base;

    const priorityIds = getPriorityIds();
    if (!priorityIds.length) return base;

    const cached = readPriorityCache();

    // junta “cache + página 1 atual” e cria índice
    const pool = [...cached, ...base].filter(Boolean);
    const byId = new Map(pool.map((r) => [String(r.id), r]));

    // monta lista: primeiro os prioritários (na ordem do array de IDs),
    // depois completa com os da página atual, sem duplicar.
    const priorityItems = priorityIds.map((id) => byId.get(String(id))).filter(Boolean);

    const prioritySet = new Set(priorityIds.map(String));
    const rest = base.filter((r) => !prioritySet.has(String(r.id)));

    // mantém 6 cards como o backend (não estoura o layout/pager)
    return [...priorityItems, ...rest].slice(0, RESERVATIONS_PAGE_SIZE);
  }, [reservations, resPage, getPriorityIds, readPriorityCache, RESERVATIONS_PAGE_SIZE]);

  // sempre que mudar lista/página/unreads, garante cache e melhora o topo da página 1
  useEffect(() => {
    ensurePriorityReservations(reservations);
  }, [ensurePriorityReservations, reservations]);

  const [availableDates, setAvailableDates] = useState([]);
  const [pendingDates, setPendingDates] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [unsaved, setUnsaved] = useState(false);

  const [ratingReservation, setRatingReservation] = useState(null);
  const [ratingTitle, setRatingTitle] = useState("");

  const [cancelConfirmId, setCancelConfirmId] = useState(null);

  const [cancelModal, setCancelModal] = useState({
    open: false,
    reservationId: null,
    text: "",
  });

  const [rejectModal, setRejectModal] = useState({
    open: false,
    reservationId: null,
    tutorId: null,
    text: "",
  });

  const [myReviewedReservationIds, setMyReviewedReservationIds] = useState(() => new Set());
  const [myReviewsLoaded, setMyReviewsLoaded] = useState(false);

  const reservationsStorageKey = useMemo(() => {
    if (!user?.id) return "reservations";
    return `reservations_${String(activeRole)}_${String(user.id)}_p${String(resPage)}`;
  }, [user?.id, activeRole, resPage]);

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
  // ✅ Evita o load da disponibilidade sobrescrever alterações ainda NÃO salvas
  const unsavedRef = useRef(false);

  useEffect(() => {
    unsavedRef.current = !!unsaved;
  }, [unsaved]);

  const resFetchGuardRef = useRef({ inFlight: false, lastAt: 0, lastKey: "" });
  const availFetchGuardRef = useRef({ inFlight: false, lastAt: 0, lastKey: "" });
  const myReviewsGuardRef = useRef({ inFlight: false, lastAt: 0, lastKey: "" });
  const activeRoleRef = useRef(activeRole);

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
    const guardKey = `${String(user.id)}:${String(activeRole || "")}`;

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
  }, [user?.id, activeRole, token]);

  const loadReservations = useCallback(async () => {
    // ✅ captura o role no momento em que a busca começou
    const roleAtStart = activeRole;

    if (!user) {
      setResHasNext(false);
      setReservations([]);
      setReservationsLoading(false);
      setReservationsLoaded(true);
      return [];
    }

    const now = Date.now();
    const guardKey = `${activeRole || ""}:${user?.id || ""}:${reservationsStorageKey}:p${String(resPage)}`;

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
      // ✅ se o role mudou enquanto buscava, IGNORA resultado velho
      if (activeRoleRef?.current && activeRoleRef.current !== roleAtStart) return;

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
          const endpointBase = isTutor ? "/reservations/tutor" : "/reservations/caregiver";
          const endpoint = `${endpointBase}?page=${encodeURIComponent(resPage)}&limit=${encodeURIComponent(
            RESERVATIONS_PAGE_SIZE
          )}`;

          const data = await authRequest(endpoint, token);

          // ✅ fallback: se o authRequest retornou string (ou algo inesperado), tenta parsear
          let parsed = data;
          if (typeof parsed === "string") {
            try {
              parsed = JSON.parse(parsed);
            } catch {
              parsed = null;
            }
          }

          const apiRes = Array.isArray(parsed?.reservations)
            ? parsed.reservations
            : Array.isArray(parsed?.items)
              ? parsed.items
              : Array.isArray(parsed)
                ? parsed
                : [];

          // ✅ meta da paginação (tolerante)
          const nextLimit = Number(parsed?.limit ?? RESERVATIONS_PAGE_SIZE);
          const nextTotal = Number(parsed?.total ?? 0);
          const nextTotalPages = Number(parsed?.totalPages ?? parsed?.total_pages ?? 1);

          // ✅ NÃO deixar o backend sobrescrever o resPage do frontend
          // (se o backend devolver page=1 sempre, ele “quebra” a paginação do front)
          void nextLimit;

          setResTotal(Number.isFinite(nextTotal) && nextTotal >= 0 ? nextTotal : 0);
          setResTotalPages(
            Number.isFinite(nextTotalPages) && nextTotalPages > 0 ? nextTotalPages : 1
          );

          // ✅ fallback: se o backend não manda total/totalPages,
          // a gente infere próxima página quando veio cheio (== limit)
          const gotCount = Array.isArray(apiRes) ? apiRes.length : 0;
          setResHasNext(gotCount >= RESERVATIONS_PAGE_SIZE);

          // (opcional) se backend mudar limit no futuro:
          void nextLimit; // mantém lint quieto

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

                cancelReason: srv.cancelReason ?? local.cancelReason ?? null,

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

          let merged = mergePreservingLocalRatings(normalized, localCache);

          // ✅ prioridade global: se estou na página 1, trago unread de outras páginas (do cache)
          // para o topo, até o usuário abrir a reserva (e marcar como lida)
          if (Number(resPage) === 1 && user?.id) {
            const unreadUnion = Array.from(
              new Set([...(unreadChatIds || []).map(String), ...(unreadResIds || []).map(String)])
            );

            merged = boostUnreadToFirstPage({
              pageList: merged,
              userId: user.id,
              role: activeRole,
              pageSize: RESERVATIONS_PAGE_SIZE,
              totalPages: computedTotalPages,
              unreadIds: unreadUnion,
            });
          }

          try {
            localStorage.setItem(reservationsStorageKey, JSON.stringify(merged));
          } catch {
            // ignore
          }

          applyReservations(merged);
          console.log("[RES] sample:", merged?.[0]);
          console.log("[RES] tutorId/user:", merged?.[0]?.tutorId, String(user?.id));
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
      setResHasNext(false);
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
    activeRole,
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

    // ✅ Se o usuário está com mudanças não salvas, NÃO recarrega
    // (senão sobrescreve pendingDates e “some” o que foi marcado)
    if (unsavedRef.current) return;

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

    // ✅ cache local pode falhar no iPhone (QuotaExceeded)
    const persistCache = (keys) => {
      try {
        localStorage.setItem(availabilityStorageKey, JSON.stringify(keys));
        return true;
      } catch (err) {
        const msg = String(err?.message || err || "").toLowerCase();
        const quota =
          err?.name === "QuotaExceededError" ||
          msg.includes("quota") ||
          msg.includes("exceeded");

        if (quota) {
          // não deixa quebrar o fluxo no iOS
          showToast(
            "Disponibilidade salva ✅ (mas o navegador está sem espaço para cache local).",
            "notify"
          );
          return false;
        }

        // erro genérico de storage
        console.warn("[availability] falha ao salvar cache local:", err);
        return false;
      }
    };

    // ✅ Sem token ou sem perfil cuidador: salva apenas local
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

      // ✅ tenta cache local, mas não depende disso pra concluir
      persistCache(finalDates);

      setAvailableDates(finalDates);
      setPendingDates(finalDates);
      setUnsaved(false);

      showToast("Disponibilidade salva com sucesso! 🗓️", "success");
    } catch (err) {
      console.error("Erro ao salvar disponibilidade:", err);

      // ✅ Mesmo com erro no servidor, tenta manter local para não perder seleção
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
        const role = String(detail?.fromRole || detail?.role || activeRole || "");
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
  }, [user?.id, activeRole, isCaregiver, scheduleRefresh, reservationsStorageKey]);

  // ---------- init (tabs + dados) ----------
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
      loadMyCapacityIfCaregiver();
    } else if (isTutor) {
      let target = "reservasTutor";
      if (stateTab === "pets" || tabQuery === "pets") target = "pets";
      else if (stateTab === "reservasTutor" || tabQuery === "reservas") target = "reservasTutor";
      setTab(target);
    }

    loadReservations();
    loadMyReviewsFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, token, location.search, activeRole]);

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
        k === availabilityStorageKey ||
        k === activeRoleStorageKey;


      if (!relevant) return;

      // ✅ se a Navbar trocou o perfil, o dashboard sincroniza
      if (k === activeRoleStorageKey) {
        const next = (e.newValue || "").trim();
        if (next === "tutor" || next === "caregiver") {
          setActiveRole(next);
        }
        return; // não precisa fazer o resto aqui; o useEffect do activeRole já cuida do resto
      }

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
    activeRoleStorageKey,
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

  useEffect(() => {
    if (!user?.id) return;

    // ao trocar perfil, força uma tab padrão coerente
    if (activeRole === "caregiver") {
      setTab((prev) => (prev === "reservas" ? "reservas" : "disponibilidade"));
      loadAvailabilityIfCaregiver(); // ok aqui
    } else {
      setTab((prev) => (prev === "pets" ? "pets" : "reservasTutor"));
    }
    // ✅ troca de perfil = volta para página 1
    setResPage(1);
    setResTotal(0);
    setResTotalPages(1);
  }, [activeRole, user?.id, loadAvailabilityIfCaregiver]);

  useEffect(() => {
    activeRoleRef.current = activeRole;
  }, [activeRole]);

  useEffect(() => {
    if (!user?.id) return;
    loadReservations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resPage]);

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

  const setStatus = async (id, status, rejectReason = null, cancelReason = null) => {
    const current = (reservations || []).find((r) => String(r.id) === String(id));
    if (!current) return;

    const optimistic = {
      ...current,
      status,
      rejectReason: status === "Recusada" ? rejectReason || null : null,
      cancelReason: status === "Cancelada" ? cancelReason || null : null,
    };

    const toastMsg = getStatusToastMessage(status, activeRole);
    const toastType = getStatusToastType(status);

    if (token && (isTutor || isCaregiver)) {
      try {
        const body =
          status === "Recusada"
            ? { status, rejectReason: rejectReason || null }
            : status === "Cancelada"
              ? { status, cancelReason: cancelReason || null }
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

  // ✅ confirmar no "toast/card" → abre modal de motivo obrigatório
  const confirmCancelReservation = () => {
    if (!cancelConfirmId) return;

    setCancelModal({
      open: true,
      reservationId: String(cancelConfirmId),
      text: "",
    });

    // fecha o confirm toast/card (mantém comportamento, mas não cancela nada aqui)
    setCancelConfirmId(null);
  };

  // cancelar na etapa do confirm toast/card → não cancela nada
  const dismissCancelReservation = () => {
    setCancelConfirmId(null);
    showToast("Cancelamento abortado.", "notify");
  };

  const closeCancelModal = () => {
    setCancelModal({ open: false, reservationId: null, text: "" });
  };

  const confirmCancelWithReason = () => {
    if (!cancelModal?.reservationId) return;

    const reason = (cancelModal.text || "").trim();
    if (!reason) {
      showToast("Informe um motivo para cancelar a reserva.", "notify");
      return;
    }

    setStatus(cancelModal.reservationId, "Cancelada", null, reason);
    closeCancelModal();
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
          fromRole: activeRole,
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
              fromRole: activeRole,
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

  function ReservationsPager() {
    const totalPages = Number(computedTotalPages || 1);
    const curPage = Number(resPage || 1);

    const canPrev = curPage > 1;

    // ✅ se totalPages é desconhecido/1, ainda assim permite "Próxima"
    // quando o backend retornou uma página cheia (resHasNext = true)
    const canNext = resHasNext || curPage < totalPages;

    // ✅ só esconde pager se realmente não tem navegação nenhuma
    if (!canPrev && !canNext) return null;

    const showTotal = Number.isFinite(Number(resTotal)) && Number(resTotal) > 0;

    // ✅ texto de páginas:
    // - se totalPages > 1: "Página X de Y"
    // - se totalPages == 1 mas tem próxima: "Página X" (sem “de 1”)
    const pageText =
      totalPages > 1
        ? (
          <>
            Página <b>{curPage}</b> de <b>{totalPages}</b>
          </>
        )
        : (
          <>
            Página <b>{curPage}</b>
          </>
        );

    return (
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <p className="text-xs text-[#5A3A22] opacity-80">
          {pageText}
          {showTotal ? (
            <>
              {" "}
              — <b>{Number(resTotal)}</b> reserva(s) no total
            </>
          ) : null}
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setResPage((p) => {
                const cur = Number(p || 1);
                return Math.max(1, cur - 1);
              })
            }
            disabled={!canPrev}
            className={`px-3 py-2 rounded-lg text-xs font-semibold shadow ${canPrev
              ? "bg-[#D2A679] hover:bg-[#B25B38] text-[#5A3A22]"
              : "bg-gray-200 text-[#5A3A22]/50 cursor-not-allowed"
              }`}
          >
            ← Anterior
          </button>

          <button
            type="button"
            onClick={() =>
              setResPage((p) => {
                const cur = Number(p || 1);

                // ✅ quando não sabemos totalPages, mas existe próxima, avança normalmente
                if (resHasNext && cur >= totalPages) return cur + 1;

                return Math.min(totalPages, cur + 1);
              })
            }
            disabled={!canNext}
            className={`px-3 py-2 rounded-lg text-xs font-semibold shadow ${canNext
              ? "bg-[#D2A679] hover:bg-[#B25B38] text-[#5A3A22]"
              : "bg-gray-200 text-[#5A3A22]/50 cursor-not-allowed"
              }`}
          >
            Próxima →
          </button>
        </div>
      </div>
    );
  }

  const openReservation = (reservationId, opts = {}) => {
    const rid = String(reservationId);

    if (user?.id) {
      markReservationNotifsRead(user.id, rid);
      window.dispatchEvent(new Event("reservation-notifications-changed"));
    }

    const hasUnreadChat = unreadChatIds.includes(rid);
    const scrollToChat = !!opts.scrollToChat || hasUnreadChat;

    if (scrollToChat) {
      navigate(
        { pathname: `/reserva/${rid}`, hash: "#chat" },
        { state: { scrollToChat: true } }
      );
      return;
    }

    navigate(`/reserva/${rid}`);
  };

  // ------------------ TUTOR ------------------
  if (isTutor) {
    const myRes = (reservationsForDisplay || [])
      .filter((r) => {
        const tid = String(r?.tutorId || "");
        // ✅ se veio tutorId, valida
        if (tid) return tid === String(user.id);
        // ✅ se o backend NÃO manda tutorId (comum no /reservations/tutor), não filtra fora
        return true;
      })
      .sort((a, b) => {
        const idA = String(a.id);
        const idB = String(b.id);

        const attA = unreadChatIds.includes(idA) || unreadResIds.includes(idA) ? 1 : 0;
        const attB = unreadChatIds.includes(idB) || unreadResIds.includes(idB) ? 1 : 0;

        if (attA !== attB) return attB - attA;
        return parseLocalKey(b.startDate) - parseLocalKey(a.startDate);
      });

    return (
      <div className="bg-[#EBCBA9] min-h-[calc(100vh-120px)] p-3 md:p-6">
        {showWelcome && (
          <WelcomeModal
            role={activeRole}              // "tutor" ou "caregiver"
            userName={user?.name || ""}    // se seu user usar outro campo, ajuste aqui
            onClose={() => setShowWelcome(false)}
            onResendGuide={handleResendGuide}
            resending={resendingGuide}
            resendState={resendState}
          />
        )}

        {/* Header (MOBILE: 3 ações na mesma linha | DESKTOP: mantém como antes) */}
        <div className="max-w-[1400px] mx-auto mb-4">
          {/* ✅ Mobile: 3 colunas */}
          <div className="grid grid-cols-3 gap-2 md:hidden">
            <button
              onClick={() => setTab("reservasTutor")}
              className={`px-2 py-2 rounded-2xl font-semibold shadow transition text-[11px] leading-tight ${tab === "reservasTutor"
                ? "bg-[#5A3A22] text-white"
                : "bg-[#D2A679] text-[#5A3A22] hover:bg-[#B25B38]"
                }`}
              type="button"
            >
              Minhas Reservas
            </button>

            <button
              onClick={() => setTab("pets")}
              className={`px-2 py-2 rounded-2xl font-semibold shadow transition text-[11px] leading-tight ${tab === "pets"
                ? "bg-[#5A3A22] text-white"
                : "bg-[#D2A679] text-[#5A3A22] hover:bg-[#B25B38]"
                }`}
              type="button"
            >
              Meus Pets
            </button>

            <Link
              to={`/avaliacoes?mode=${activeRole}`}
              className="px-2 py-2 rounded-2xl bg-[#FFD700]/90 hover:bg-[#FFD700] text-[#5A3A22] font-semibold shadow text-[11px] leading-tight flex items-center justify-center"
              title="Ver minhas avaliações"
            >
              Avaliações
            </Link>
          </div>

          {/* ✅ Desktop (md+): mantém layout original */}
          <div className="hidden md:flex gap-3 justify-center">
            <button
              onClick={() => setTab("reservasTutor")}
              className={`px-5 py-2 rounded-2xl font-semibold shadow transition ${tab === "reservasTutor"
                ? "bg-[#5A3A22] text-white"
                : "bg-[#D2A679] text-[#5A3A22] hover:bg-[#B25B38]"
                }`}
              type="button"
            >
              Minhas Reservas
            </button>

            <button
              onClick={() => setTab("pets")}
              className={`px-5 py-2 rounded-2xl font-semibold shadow transition ${tab === "pets"
                ? "bg-[#5A3A22] text-white"
                : "bg-[#D2A679] text-[#5A3A22] hover:bg-[#B25B38]"
                }`}
              type="button"
            >
              Meus Pets
            </button>

            <Link
              to={`/avaliacoes?mode=${activeRole}`}
              className="px-4 py-2 rounded-2xl bg-[#FFD700]/90 hover:bg-[#FFD700] text-[#5A3A22] font-semibold shadow text-sm flex items-center justify-center"
              title="Ver minhas avaliações"
            >
              Ver minhas avaliações
            </Link>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="max-w-[1400px] mx-auto bg-white rounded-2xl shadow p-4 md:p-6 border-l-4 border-[#FFD700]/80">
          {/* ✅ TAB: RESERVAS */}
          {tab === "reservasTutor" && (
            <>
              {myRes.length ? (
                <>
                  <ReservationsPager />

                  {myRes.map((r) => {
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
                    const rejectReason = r.status === "Recusada" ? r.rejectReason || null : null;
                    const cancelReason = r.status === "Cancelada" ? r.cancelReason || null : null;

                    const showTutorRating =
                      r.tutorRating != null && Number.isFinite(Number(r.tutorRating));

                    return (
                      <div key={r.id} className={cardClasses}>
                        {(hasUnreadChat || hasUnreadResNotif) && (
                          <div className="absolute top-3 right-3 flex items-center gap-2">
                            <span
                              className={`w-2.5 h-2.5 rounded-full ${hasUnreadChat ? "bg-blue-600" : "bg-red-600"
                                }`}
                              title={hasUnreadChat ? "Nova mensagem" : "Atualização"}
                            />
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/70 border border-[#FFD700]/50 text-[#5A3A22]">
                              {hasUnreadChat ? "CHAT" : "UPDATE"}
                            </span>
                          </div>
                        )}

                        {/* ✅ card no padrão do cuidador */}
                        <button
                          onClick={() => openReservation(r.id, { scrollToChat: hasUnreadChat })}
                          className="text-left w-full"
                          type="button"
                          title="Abrir detalhes da reserva"
                        >
                          <p>
                            <b>Cuidador:</b> {r.caregiverName || "—"}
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

                          {r.status === "Cancelada" && cancelReason && (
                            <p className="mt-2 text-xs text-[#5A3A22] bg-[#FFF8F0] border rounded-lg p-2">
                              <b>Motivo do cancelamento:</b> {cancelReason}
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
                                  Sua avaliação: <b>⭐ {Number(r.tutorRating)}/5</b>
                                  {r.tutorReview ? ` — "${String(r.tutorReview)}"` : ""}
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
                            {String(r.status) === "Aceita" && (
                              <Link
                                to={`/reserva/${r.id}#chat`}
                                state={{ scrollToChat: true }}
                                onClick={(e) => e.stopPropagation()}
                                className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#FFD700] hover:bg-[#f5c400] text-[#5A3A22] shadow"
                              >
                                Abrir chat
                              </Link>
                            )}

                            {canRate && !alreadyRated && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openRatingModal(r, "Avaliar cuidador");
                                }}
                                className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#FFD700]/90 hover:bg-[#FFD700] text-[#5A3A22] shadow"
                              >
                                Avaliar
                              </button>
                            )}

                            {["Pendente", "Aceita"].includes(String(r.status)) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setCancelConfirmId(String(r.id));
                                }}
                                className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white shadow"
                              >
                                Cancelar
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : reservationsLoading ? (
                <p className="text-center text-[#5A3A22]">Carregando suas reservas...</p>
              ) : (
                <p className="text-center text-[#5A3A22]">Você ainda não fez reservas.</p>
              )}
            </>
          )}

          {/* ✅ TAB: PETS */}
          {tab === "pets" && <TutorPets />}
        </div>

        {/* ✅ CONFIRMAR CANCELAMENTO */}
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

        {/* ✅ MODAL: MOTIVO DO CANCELAMENTO */}
        {cancelModal.open && (
          <div className="fixed inset-0 z-[9999] flex items-end md:items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-[520px] bg-white rounded-2xl shadow-xl border-l-4 border-red-600 p-4">
              <p className="text-sm font-semibold text-[#5A3A22]">Cancelar reserva</p>
              <p className="text-xs text-[#5A3A22] opacity-80 mt-1">
                Escreva um motivo para o cuidador entender o cancelamento.{" "}
                <b>(Obrigatório)</b>
              </p>

              <textarea
                value={cancelModal.text}
                onChange={(e) => setCancelModal((s) => ({ ...s, text: e.target.value }))}
                rows={4}
                placeholder="Ex.: Mudança de planos / Imprevisto / Encontrei outro cuidador..."
                className="mt-3 w-full border rounded-xl p-3 text-sm text-[#5A3A22] outline-none focus:ring-2 focus:ring-[#FFD700]/70"
              />

              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={closeCancelModal}
                  className="px-3 py-2 rounded-lg text-xs font-semibold bg-gray-200 hover:bg-gray-300 text-[#5A3A22]"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={confirmCancelWithReason}
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
    );
  }

  // ------------------ CUIDADOR ------------------
  if (isCaregiver) {
    const received = (reservationsForDisplay || [])
      .filter((r) => {
        const cid = String(r?.caregiverId || "");
        if (cid) return cid === String(user.id);
        // ✅ se o backend NÃO manda caregiverId (comum no /reservations/caregiver), não filtra fora
        return true;
      })
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
      <div className="bg-[#EBCBA9] min-h-[calc(100vh-120px)] p-3 md:p-6">
        {showWelcome && (
          <WelcomeModal
            role={activeRole}
            userName={user?.name || ""}
            onClose={() => setShowWelcome(false)}
            onResendGuide={handleResendGuide}
            resending={resendingGuide}
            resendState={resendState}
          />
        )}

        {/* Header (MOBILE: 3 ações na mesma linha | DESKTOP: mantém como antes) */}
        <div className="max-w-[1400px] mx-auto mb-4">
          {/* ✅ Mobile: 3 colunas */}
          <div className="grid grid-cols-3 gap-2 md:hidden">
            <button
              onClick={() => setTab("disponibilidade")}
              className={`px-2 py-2 rounded-2xl font-semibold shadow transition text-[11px] leading-tight ${tab === "disponibilidade"
                ? "bg-[#5A3A22] text-white"
                : "bg-[#D2A679] text-[#5A3A22] hover:bg-[#B25B38]"
                }`}
              type="button"
            >
              Disponibilidade
            </button>

            <button
              onClick={() => setTab("reservas")}
              className={`px-2 py-2 rounded-2xl font-semibold shadow transition text-[11px] leading-tight ${tab === "reservas"
                ? "bg-[#5A3A22] text-white"
                : "bg-[#D2A679] text-[#5A3A22] hover:bg-[#B25B38]"
                }`}
              type="button"
            >
              Reservas Recebidas
            </button>

            <Link
              to={`/avaliacoes?mode=${activeRole}`}
              className="px-2 py-2 rounded-2xl bg-[#FFD700]/90 hover:bg-[#FFD700] text-[#5A3A22] font-semibold shadow text-[11px] leading-tight flex items-center justify-center"
              title="Ver minhas avaliações"
            >
              Avaliações
            </Link>
          </div>

          {/* ✅ Desktop (md+): mantém layout original */}
          <div className="hidden md:flex gap-3 justify-center">
            <button
              onClick={() => setTab("disponibilidade")}
              className={`px-5 py-2 rounded-2xl font-semibold shadow transition ${tab === "disponibilidade"
                ? "bg-[#5A3A22] text-white"
                : "bg-[#D2A679] text-[#5A3A22] hover:bg-[#B25B38]"
                }`}
              type="button"
            >
              Disponibilidade
            </button>

            <button
              onClick={() => setTab("reservas")}
              className={`px-5 py-2 rounded-2xl font-semibold shadow transition ${tab === "reservas"
                ? "bg-[#5A3A22] text-white"
                : "bg-[#D2A679] text-[#5A3A22] hover:bg-[#B25B38]"
                }`}
              type="button"
            >
              Reservas Recebidas
            </button>

            <Link
              to={`/avaliacoes?mode=${activeRole}`}
              className="px-4 py-2 rounded-2xl bg-[#FFD700]/90 hover:bg-[#FFD700] text-[#5A3A22] font-semibold shadow text-sm flex items-center justify-center"
              title="Ver minhas avaliações"
            >
              Ver minhas avaliações
            </Link>
          </div>
        </div>

        <div className="max-w-[1400px] mx-auto bg-white rounded-2xl shadow p-4 md:p-6 border-l-4 border-[#FFD700]/80">
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

              {/* ✅ Capacidade diária */}
              <div className="bg-[#F9F5F2] p-4 rounded-lg shadow-md mb-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-[#5A3A22]">
                      Capacidade diária
                    </h3>
                    <p className="text-xs text-[#5A3A22] opacity-80 mt-1">
                      Quantas reservas simultâneas você aceita por dia (máx. {capacityMax}).
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <select
                      value={dailyCapacity}
                      disabled={capacityLoading || capacitySaving}
                      onChange={(e) => saveMyCapacityIfCaregiver(e.target.value)}
                      className="border rounded-xl px-3 py-2 text-sm text-[#5A3A22] bg-white shadow-sm outline-none focus:ring-2 focus:ring-[#FFD700]/70"
                    >
                      {Array.from(
                        { length: capacityMax - capacityMin + 1 },
                        (_, i) => capacityMin + i
                      ).map((n) => (
                        <option key={n} value={n}>
                          {n} / dia
                        </option>
                      ))}
                    </select>

                    {(capacityLoading || capacitySaving) && (
                      <span className="text-xs text-[#5A3A22] opacity-70">
                        {capacityLoading ? "Carregando..." : "Salvando..."}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-center">
                <Calendar
                  className="mx-auto"
                  activeStartDate={currentMonth}
                  onActiveStartDateChange={({ activeStartDate }) =>
                    setCurrentMonth(activeStartDate)
                  }
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
                  className={`font-semibold px-5 py-2 rounded-lg shadow-md ${unsaved
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
                <>
                  <ReservationsPager />

                  {received.map((r) => {
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
                      r.caregiverRating != null && Number.isFinite(Number(r.caregiverRating));

                    const showActions = r.status === "Pendente";

                    return (
                      <div key={r.id} className={cardClasses}>
                        {(hasUnreadChat || hasUnreadResNotif) && (
                          <div className="absolute top-3 right-3 flex items-center gap-2">
                            <span
                              className={`w-2.5 h-2.5 rounded-full ${hasUnreadChat ? "bg-blue-600" : "bg-red-600"
                                }`}
                              title={hasUnreadChat ? "Nova mensagem" : "Atualização"}
                            />
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/70 border border-[#FFD700]/50 text-[#5A3A22]">
                              {hasUnreadChat ? "CHAT" : "UPDATE"}
                            </span>
                          </div>
                        )}

                        <button
                          onClick={() => openReservation(r.id, { scrollToChat: hasUnreadChat })}
                          className="text-left w-full"
                          type="button"
                          title="Abrir detalhes da reserva"
                        >
                          <p>
                            <b>Tutor:</b> {r.tutorName}
                          </p>
                          <p>
                            <b>Período:</b> {formatDateBR(r.startDate)} até {formatDateBR(r.endDate)}
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

                          {r.status === "Cancelada" && r.cancelReason && (
                            <p className="mt-2 text-xs text-[#5A3A22] bg-[#FFF8F0] border rounded-lg p-2">
                              <b>Motivo do cancelamento:</b> {r.cancelReason}
                            </p>
                          )}
                        </button>

                        <div className="mt-2 flex items-center justify-between">
                          {alreadyRated ? (
                            <p className="text-xs text-[#5A3A22] opacity-80">
                              {showCaregiverRating ? (
                                <>
                                  Sua avaliação: <b>⭐ {Number(r.caregiverRating)}/5</b>
                                  {r.caregiverReview ? ` — "${r.caregiverReview}"` : ""}
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
                            {String(r.status) === "Aceita" && (
                              <Link
                                to={`/reserva/${r.id}#chat`}
                                state={{ scrollToChat: true }}
                                onClick={(e) => e.stopPropagation()}
                                className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#FFD700] hover:bg-[#f5c400] text-[#5A3A22] shadow"
                                title="Abrir chat desta reserva"
                              >
                                Abrir chat
                              </Link>
                            )}

                            {showActions && (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleAcceptReservationFromList(r);
                                  }}
                                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-green-700 hover:bg-green-800 text-white shadow"
                                >
                                  Aceitar
                                </button>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    openRejectModal(r);
                                  }}
                                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white shadow"
                                >
                                  Recusar
                                </button>
                              </>
                            )}

                            {canRate && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openRatingModal(r, "Avaliar tutor");
                                }}
                                className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#FFD700]/90 hover:bg-[#FFD700] text-[#5A3A22] shadow"
                              >
                                Avaliar tutor
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
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
