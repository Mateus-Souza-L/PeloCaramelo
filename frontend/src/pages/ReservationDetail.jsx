// src/pages/ReservationDetail.jsx
import { useEffect, useMemo, useRef, useState, useCallback, Component } from "react";
import { useParams, useNavigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ToastProvider";
import { formatDateBR, parseLocalKey } from "../utils/date";
import RatingModal from "../components/RatingModal";
import { authRequest } from "../services/api";
import ChatBox from "../components/ChatBox";
import { markReservationNotifsRead } from "../utils/reservationNotifs";

const DEFAULT_PET_IMG = "/paw.png";

// ---------- helpers simples/seguros ----------
const toStr = (v) => (v == null ? "" : String(v));

const safeJsonParse = (val) => {
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
};

const safeSetLocalStorage = (key, value) => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const safeGetLocalStorage = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const isNonEmptyArray = (v) => Array.isArray(v) && v.length > 0;
const onlyDigits = (v) => String(v ?? "").replace(/\D+/g, "");

// ✅ NOVO: num safe (mantém null se inválido)
const toNumSafe = (v) => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// ✅ normaliza string pra comparar nomes de serviço
const normalizeKey = (s) =>
  String(s || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const formatMoneyBR = (v) => {
  const n = toNumSafe(v);
  if (n == null) return "—";
  return "R$ " + n.toFixed(2);
};

const maskPhone = (phone) => {
  const d = onlyDigits(phone);
  if (!d) return "—";

  const ddd = d.length >= 10 ? d.slice(0, 2) : "";
  const rest = ddd ? d.slice(2) : d;

  if (rest.length < 4) return ddd ? "(" + ddd + ") " + rest : rest;

  const first = rest[0];
  const last2 = rest.slice(-2);
  const maskedMid = "*".repeat(Math.max(0, rest.length - 3));
  const masked = "" + first + maskedMid + last2;

  const left = masked.slice(0, Math.min(5, masked.length));
  const right = masked.slice(Math.min(5, masked.length));

  return ddd ? "(" + ddd + ") " + left + (right ? "-" + right : "") : masked;
};

const pickPetImage = (p) =>
  p?.image ||
  p?.photo ||
  p?.img ||
  p?.imageUrl ||
  p?.image_url ||
  p?.avatar ||
  p?.avatar_url ||
  p?.photoUrl ||
  p?.photo_url ||
  null;

// ✅ normaliza campos comuns do pet
const normalizePetObject = (p) => {
  if (!p || typeof p !== "object") return null;

  const id = toStr(p.id) || toStr(p.pet_id) || toStr(p.petId) || toStr(p.petID) || "";

  const name = p.name ?? p.pet_name ?? p.petName ?? p.pet_nome ?? p.nome ?? "";

  const specie =
    p.specie ?? p.species ?? p.specie_name ?? p.species_name ?? p.especie ?? p.tipo ?? "";

  const breed = p.breed ?? p.race ?? p.raca ?? p.breed_name ?? p.race_name ?? "";

  const porte = p.porte ?? p.port ?? p.size ?? p.portePet ?? p.pet_size ?? p.tamanho ?? "";

  const approxAge = p.approxAge ?? p.approx_age ?? p.age ?? p.idade ?? "";

  const adjectivesRaw = p.adjectives ?? p.adjetivos ?? p.tags ?? null;
  const adjectives = Array.isArray(adjectivesRaw)
    ? adjectivesRaw.filter(Boolean).map(String)
    : typeof adjectivesRaw === "string"
      ? adjectivesRaw
        .split(/[,•|]/g)
        .map((s) => s.trim())
        .filter(Boolean)
      : [];

  const image = pickPetImage(p);

  return {
    ...p,
    id: id || undefined,
    name: name || p.name,
    specie: specie || p.specie || p.species,
    breed: breed || p.breed,
    porte: porte || p.porte || p.size,
    approxAge: approxAge || p.approxAge,
    adjectives: adjectives.length ? adjectives : p.adjectives,
    image,
    photo: image,
  };
};

const normalizeSnapshotArray = (maybeSnap, fallbackIds = []) => {
  let snap = maybeSnap;

  if (typeof snap === "string") snap = safeJsonParse(snap);
  if (!Array.isArray(snap)) return null;

  const normalized = snap.map((p) => normalizePetObject(p)).filter(Boolean);

  if (fallbackIds?.length) {
    const set = new Set(fallbackIds.map(String));
    const filtered = normalized.filter((p) => set.has(String(p.id)));
    return filtered.length ? filtered : normalized;
  }

  return normalized;
};

// ✅ extrai petsIds de vários formatos possíveis do backend
const extractPetsIds = (r) => {
  let petsIds =
    r?.pets_ids ??
    r?.petsIds ??
    r?.pet_ids ??
    r?.petIds ??
    r?.pets_id ??
    r?.petsId ??
    r?.pet_id ??
    r?.petId ??
    [];

  if (typeof petsIds === "string") {
    const parsed = safeJsonParse(petsIds);
    petsIds = Array.isArray(parsed) ? parsed : parsed != null ? [parsed] : [];
  }

  if (!Array.isArray(petsIds)) petsIds = [petsIds];

  if (Array.isArray(r?.pets) && r.pets.length) {
    const fromPets = r.pets
      .map((p) => toStr(p?.id ?? p?.pet_id ?? p?.petId ?? ""))
      .filter(Boolean);
    if (fromPets.length) petsIds = fromPets;
  }

  return petsIds.map((x) => toStr(x)).filter(Boolean);
};

const normalizeReservationFromApi = (r) => {
  if (!r) return null;

  const petsIds = extractPetsIds(r);

  const snapshot =
    r.pets_snapshot ||
    r.petsSnapshot ||
    r.pets_details ||
    r.petsDetails ||
    r.pets ||
    null;

  const petsSnapshot = normalizeSnapshotArray(snapshot, petsIds);

  // ✅ CORREÇÃO: serviço / preço / total (snake_case do backend)
  const service =
    r.service ??
    r.service_name ??
    r.serviceName ??
    r.tipo_servico ??
    r.tipoServico ??
    "";

  const pricePerDay = toNumSafe(
    r.price_per_day ?? // 👈 principal (backend)
    r.pricePerDay ??
    r.daily_price ??
    r.dailyPrice ??
    r.price_day ??
    r.priceDay ??
    r.price ??
    null
  );

  const total = toNumSafe(
    r.total ??
    r.total_price ??
    r.totalPrice ??
    r.total_value ??
    r.totalValue ??
    null
  );

  return {
    id: toStr(r.id),
    tutorId: toStr(r.tutor_id ?? r.tutorId),
    tutorName: r.tutor_name ?? r.tutorName,
    caregiverId: toStr(r.caregiver_id ?? r.caregiverId),
    caregiverName: r.caregiver_name ?? r.caregiverName,
    // ✅ NOVO: contatos vindos do backend (snake_case e/ou camelCase)
    tutorEmail: r.tutor_email ?? r.tutorEmail ?? r?.tutor?.email ?? null,
    tutorPhone: r.tutor_phone ?? r.tutorPhone ?? r?.tutor?.phone ?? null,
    caregiverEmail: r.caregiver_email ?? r.caregiverEmail ?? r?.caregiver?.email ?? null,
    caregiverPhone: r.caregiver_phone ?? r.caregiverPhone ?? r?.caregiver?.phone ?? null,

    // ✅ NOVO: objetos aninhados se vierem do backend
    tutorObj: r?.tutor ?? null,
    caregiverObj: r?.caregiver ?? null,
    city: r.city || "",
    neighborhood: r.neighborhood || "",
    service,

    pricePerDay,
    total,

    startDate: r.start_date
      ? String(r.start_date).slice(0, 10)
      : r.startDate
        ? String(r.startDate).slice(0, 10)
        : "",
    endDate: r.end_date
      ? String(r.end_date).slice(0, 10)
      : r.endDate
        ? String(r.endDate).slice(0, 10)
        : "",
    status: r.status || "Pendente",

    tutorRating: r.tutor_rating ?? r.tutorRating,
    tutorReview: r.tutor_review ?? r.tutorReview,
    caregiverRating: r.caregiver_rating ?? r.caregiverRating,
    caregiverReview: r.caregiver_review ?? r.caregiverReview,

    petsIds,
    petsNames: r.pets_names ?? r.petsNames ?? "",
    petsSnapshot: Array.isArray(petsSnapshot) ? petsSnapshot : null,
    rejectReason: r.reject_reason ?? r.rejectReason ?? null,

    // ✅ motivo do cancelamento
    cancelReason: r.cancel_reason ?? r.cancelReason ?? null,
  };
};

const toLightReservationForStorage = (r) => {
  if (!r) return r;
  const { petsSnapshot, ...rest } = r;
  return rest;
};

function isConcludedStatus(status) {
  return status === "Concluida" || status === "Concluída" || status === "Finalizada";
}

const CenterCard = ({ children }) => (
  <div className="bg-[#EBCBA9] min-h-[calc(100vh-120px)] flex items-center justify-center px-4">
    <div className="pc-card pc-card-accent text-center">{children}</div>
  </div>
);

// ✅ Modal simples (padrão visual do site)
function PcModal({ open, title, children, onClose, disableClose = false, maxWidth = "max-w-[520px]" }) {
  useEffect(() => {
    if (!open) return;

    const onKey = (e) => {
      if (e.key === "Escape" && !disableClose) onClose?.();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, disableClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (disableClose) return;
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="absolute inset-0 bg-black/40" />

      <div className={"relative w-full " + maxWidth}>
        <div className="bg-white rounded-2xl shadow-xl border-l-4 border-[#FFD700]/80 p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-bold text-[#5A3A22]">{title}</h3>

            {!disableClose && (
              <button
                type="button"
                onClick={onClose}
                className="text-[#5A3A22] hover:text-[#95301F] font-bold px-2"
                aria-label="Fechar"
              >
                ✕
              </button>
            )}
          </div>

          <div className="mt-3 text-[#5A3A22]">{children}</div>
        </div>
      </div>
    </div>
  );
}

class ChatErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err) {
    console.error("[ChatErrorBoundary] erro no ChatBox:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="pc-card pc-card-accent text-[#5A3A22]">
          O chat falhou ao carregar nesta reserva. Recarregue a página ou tente novamente mais tarde.
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ReservationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token } = useAuth();
  const { showToast } = useToast();

  const [reservation, setReservation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [caregiver, setCaregiver] = useState(null);
  const [tutor, setTutor] = useState(null);
  const [tutorPets, setTutorPets] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);

  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingTitle, setRatingTitle] = useState("");
  const [ratingBusy, setRatingBusy] = useState(false);

  // ✅ NOVO: fluxo padrão do cancelamento
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelReasonOpen, setCancelReasonOpen] = useState(false);
  const [cancelReasonText, setCancelReasonText] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const cancelReasonRef = useRef(null);

  // ✅ trava anti-duplo clique / enter
  const cancelFlowLockRef = useRef(false);

  const chatSectionRef = useRef(null);
  const didAutoScrollChatRef = useRef(false);
  const didClearChatUnreadRef = useRef(false);
  const lastChatScrollAtRef = useRef(0);

  const reservationIdRef = useRef(null);
  const tutorIdRef = useRef(null);

  const didWarnNoPetsRef = useRef(false);

  // ✅ cleanup de segurança: evita lock preso ao sair da tela
  useEffect(() => {
    return () => {
      cancelFlowLockRef.current = false;
    };
  }, []);

  useEffect(() => {
    reservationIdRef.current = reservation?.id ? String(reservation.id) : null;
    tutorIdRef.current = reservation?.tutorId ? String(reservation.tutorId) : null;
  }, [reservation?.id, reservation?.tutorId]);

  const fetchRef = useRef({ key: "", inFlight: false });

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const isTutor = user?.role === "tutor";
  const isCaregiver = user?.role === "caregiver";

  const reservationsStorageKey = useMemo(() => {
    if (!user?.id || !user?.role) return "reservations";
    return "reservations_" + String(user.role) + "_" + String(user.id);
  }, [user?.id, user?.role]);

  const emitReservationUpdated = useCallback(
    (payload = {}) => {
      const rid = String(payload.reservationId ?? reservationIdRef.current ?? id ?? "");
      if (!rid) return;

      window.dispatchEvent(
        new CustomEvent("reservation-updated", {
          detail: { reservationId: rid, ...payload },
        })
      );
    },
    [id]
  );

  const persistLocalReservation = useCallback(
    (next) => {
      if (!next?.id) return;

      const raw = safeGetLocalStorage(reservationsStorageKey) || "[]";
      const all = safeJsonParse(raw);
      const list = Array.isArray(all) ? all : [];

      const idx = list.findIndex((r) => String(r?.id) === String(next.id));
      const light = toLightReservationForStorage(next);

      const nextList = idx >= 0 ? list.map((x, i) => (i === idx ? light : x)) : [light, ...list];

      safeSetLocalStorage(reservationsStorageKey, JSON.stringify(nextList));
      setReservation(next);

      emitReservationUpdated({
        reservationId: next.id,
        status: next.status,
        source: "local",
      });
    },
    [reservationsStorageKey, emitReservationUpdated]
  );

  const applyServerReservation = useCallback(
    (serverReservation, fallbackLocal) => {
      const normalized = normalizeReservationFromApi(serverReservation);
      if (!normalized?.id) return null;

      const merged = { ...normalized };

      if (!isNonEmptyArray(merged.petsSnapshot) && isNonEmptyArray(fallbackLocal?.petsSnapshot)) {
        merged.petsSnapshot = normalizeSnapshotArray(fallbackLocal.petsSnapshot, merged.petsIds);
      }

      if ((!merged.petsIds || merged.petsIds.length === 0) && Array.isArray(fallbackLocal?.petsIds)) {
        merged.petsIds = fallbackLocal.petsIds.map((x) => toStr(x)).filter(Boolean);
      }

      if ((!merged.petsNames || !String(merged.petsNames).trim()) && fallbackLocal?.petsNames) {
        merged.petsNames = fallbackLocal.petsNames;
      }

      if (merged.tutorRating == null && fallbackLocal?.tutorRating != null) {
        merged.tutorRating = fallbackLocal.tutorRating;
        merged.tutorReview = fallbackLocal?.tutorReview ?? merged.tutorReview;
      }

      if (merged.caregiverRating == null && fallbackLocal?.caregiverRating != null) {
        merged.caregiverRating = fallbackLocal.caregiverRating;
        merged.caregiverReview = fallbackLocal?.caregiverReview ?? merged.caregiverReview;
      }

      if (merged.rejectReason == null && fallbackLocal?.rejectReason != null) {
        merged.rejectReason = fallbackLocal.rejectReason;
      }
      if (merged.cancelReason == null && fallbackLocal?.cancelReason != null) {
        merged.cancelReason = fallbackLocal.cancelReason;
      }

      if ((merged.pricePerDay == null || merged.pricePerDay <= 0) && fallbackLocal?.pricePerDay > 0) {
        merged.pricePerDay = fallbackLocal.pricePerDay;
      }
      if ((merged.total == null || merged.total <= 0) && fallbackLocal?.total > 0) {
        merged.total = fallbackLocal.total;
      }

      persistLocalReservation(merged);

      emitReservationUpdated({
        reservationId: merged.id,
        status: merged.status,
        source: "server",
      });

      return merged;
    },
    [persistLocalReservation, emitReservationUpdated]
  );

  useEffect(() => {
    let cancelled = false;

    const loadAll = async () => {
      setLoading(true);
      setNotFound(false);

      let current = null;

      try {
        const storedAllRaw = safeGetLocalStorage(reservationsStorageKey) || "[]";
        const storedAll = safeJsonParse(storedAllRaw);
        const list = Array.isArray(storedAll) ? storedAll : [];
        const storedLocal = list.find((r) => String(r?.id) === String(id)) || null;

        const numericId = Number(id);
        const shouldFetchFromServer =
          token && user && Number.isFinite(numericId) && numericId > 0 && numericId <= 2147483647;

        if (shouldFetchFromServer) {
          const fetchKey = String(id) + ":" + String(token) + ":" + String(reloadKey);

          if (!fetchRef.current.inFlight && fetchRef.current.key !== fetchKey) {
            fetchRef.current.inFlight = true;

            try {
              const data = await authRequest("/reservations/" + id, token);
              const dbRes = data?.reservation;

              if (dbRes) {
                current = applyServerReservation(dbRes, storedLocal) || null;
                fetchRef.current.key = fetchKey;
              } else {
                fetchRef.current.key = "";
              }
            } catch (err) {
              if (err?.response?.status === 404 || err?.status === 404) {
                setNotFound(true);
              }
              console.error("Erro ao carregar reserva do servidor:", err);
              fetchRef.current.key = "";
            } finally {
              fetchRef.current.inFlight = false;
            }
          }
        }

        if (!current) current = storedLocal;

        let normalizedCurrent = current ? normalizeReservationFromApi(current) : null;
        if (!normalizedCurrent && storedLocal) {
          normalizedCurrent = normalizeReservationFromApi(storedLocal);
        }

        const finalReservation = normalizedCurrent || current || storedLocal || null;

        if (!finalReservation && !shouldFetchFromServer) {
          setNotFound(true);
        }

        if (cancelled) return;

        setReservation(finalReservation);

        const users = safeJsonParse(safeGetLocalStorage("users") || "[]");
        const usersList = Array.isArray(users) ? users : [];

        const currentCaregiverFromUsers =
          finalReservation &&
          (usersList.find((u) => String(u?.id) === String(finalReservation.caregiverId)) || null);

        const currentTutorFromUsers =
          finalReservation &&
          (usersList.find((u) => String(u?.id) === String(finalReservation.tutorId)) || null);

        // ✅ fallback: se não achar no users, usa dados que vieram na reserva
        const fallbackCaregiver =
          finalReservation
            ? {
              id: finalReservation.caregiverId,
              name: finalReservation.caregiverName,
              email: finalReservation.caregiverEmail ?? finalReservation?.caregiverObj?.email ?? null,
              phone: finalReservation.caregiverPhone ?? finalReservation?.caregiverObj?.phone ?? null,
            }
            : null;

        const fallbackTutor =
          finalReservation
            ? {
              id: finalReservation.tutorId,
              name: finalReservation.tutorName,
              email: finalReservation.tutorEmail ?? finalReservation?.tutorObj?.email ?? null,
              phone: finalReservation.tutorPhone ?? finalReservation?.tutorObj?.phone ?? null,
            }
            : null;

        setCaregiver(currentCaregiverFromUsers || fallbackCaregiver);
        setTutor(currentTutorFromUsers || fallbackTutor);

        if (finalReservation?.tutorId) {
          const tid = String(finalReservation.tutorId);
          const candidateKeys = ["pets_" + tid, "pets_" + Number(tid), "tutorPets_" + tid, "petsByTutor_" + tid];

          let found = [];
          for (const k of candidateKeys) {
            const raw = safeGetLocalStorage(k);
            if (!raw) continue;
            const parsed = safeJsonParse(raw);
            if (Array.isArray(parsed) && parsed.length) {
              found = parsed;
              break;
            }
          }
          setTutorPets(Array.isArray(found) ? found : []);
        } else {
          setTutorPets([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadAll();

    const onStorage = (e) => {
      if (!(e instanceof StorageEvent)) return;

      const k = e.key;
      const tid = tutorIdRef.current;
      const relevant =
        k === reservationsStorageKey ||
        k === "users" ||
        (tid && (k === "pets_" + tid || k === "tutorPets_" + tid || k === "petsByTutor_" + tid));

      if (!relevant) return;
      loadAll();
    };

    window.addEventListener("storage", onStorage);

    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
  }, [id, token, user, reloadKey, reservationsStorageKey, applyServerReservation]);

  const markBackendNotificationsReadForReservation = useCallback(async () => {
    if (!token) return false;
    if (!reservation?.id) return false;

    try {
      await authRequest("/notifications/" + reservation.id + "/read", token, { method: "POST" });

      window.dispatchEvent(new Event("notifications-changed"));
      window.dispatchEvent(new Event("reservation-notifications-changed"));
      return true;
    } catch (err) {
      console.error("Falha ao marcar notificações como lidas no backend (ReservationDetail):", err);
      return false;
    }
  }, [token, reservation?.id]);

  useEffect(() => {
    if (!user?.id || !reservation?.id) return;

    try {
      markReservationNotifsRead(user.id, reservation.id);
    } catch {
      // ignore
    }

    markBackendNotificationsReadForReservation();
  }, [user?.id, reservation?.id, markBackendNotificationsReadForReservation]);

  const isOwner = useMemo(() => {
    if (!reservation || !user?.id) return false;
    const uid = String(user.id);
    return uid === String(reservation.tutorId) || uid === String(reservation.caregiverId) || user?.role === "admin";
  }, [reservation, user?.id, user?.role]);

  const myUserId = String(
    user?.id ?? (isTutor ? reservation?.tutorId : isCaregiver ? reservation?.caregiverId : "") ?? ""
  );

  // ✅ REGRA CORRIGIDA: chat só enquanto Aceita
  const canChatNow = useMemo(() => {
    return String(reservation?.status || "") === "Aceita";
  }, [reservation?.status]);

  const reservationDays = useMemo(() => {
    if (!reservation?.startDate || !reservation?.endDate) return null;
    const s = parseLocalKey(reservation.startDate);
    const e = parseLocalKey(reservation.endDate);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;

    s.setHours(0, 0, 0, 0);
    e.setHours(0, 0, 0, 0);

    const diff = Math.floor((e.getTime() - s.getTime()) / 86400000);
    return diff >= 0 ? diff + 1 : null;
  }, [reservation?.startDate, reservation?.endDate]);

  const caregiverPricesObj = useMemo(() => {
    const raw = caregiver?.prices ?? null;
    if (!raw) return null;
    if (typeof raw === "object") return raw;
    if (typeof raw === "string") {
      const parsed = safeJsonParse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    }
    return null;
  }, [caregiver?.prices]);

  const resolvedPricePerDay = useMemo(() => {
    const direct = toNumSafe(reservation?.pricePerDay);
    if (direct != null && direct > 0) return direct;

    const svc = reservation?.service ? String(reservation.service).trim() : "";
    if (!svc) return null;

    const prices = caregiverPricesObj;
    if (!prices || typeof prices !== "object") return null;

    const directKey = prices[svc];
    const dv = toNumSafe(directKey);
    if (dv != null && dv > 0) return dv;

    const target = normalizeKey(svc);
    for (const [k, v] of Object.entries(prices)) {
      if (normalizeKey(k) === target) {
        const n = toNumSafe(v);
        if (n != null && n > 0) return n;
      }
    }

    return null;
  }, [reservation?.pricePerDay, reservation?.service, caregiverPricesObj]);

  const resolvedTotal = useMemo(() => {
    const direct = toNumSafe(reservation?.total);
    if (direct != null && direct > 0) return direct;

    if (resolvedPricePerDay != null && resolvedPricePerDay > 0 && reservationDays != null) {
      const total = resolvedPricePerDay * reservationDays;
      return Math.round(total * 100) / 100;
    }

    return null;
  }, [reservation?.total, resolvedPricePerDay, reservationDays]);

  const clearChatUnreadForThisReservation = useCallback(async () => {
    if (!reservation?.id) return;
    if (!token) return;
    if (String(reservation.status) !== "Aceita") return;

    try {
      await authRequest("/chat/" + reservation.id + "/read", token, { method: "POST" });

      const data = await authRequest("/chat/unread", token);
      const ids = Array.isArray(data?.reservationIds) ? data.reservationIds.map(String) : [];

      try {
        localStorage.setItem("newMessages", JSON.stringify(ids));
      } catch {
        // ignore
      }

      window.dispatchEvent(new CustomEvent("chat-unread-changed", { detail: { list: ids } }));

      emitReservationUpdated({
        reservationId: reservation.id,
        reason: "chat-unread-sync",
        source: "server",
      });
    } catch (err) {
      console.error("Erro ao atualizar unread do chat (ReservationDetail):", err);
    }
  }, [reservation?.id, reservation?.status, token, emitReservationUpdated]);

  useEffect(() => {
    if (!user?.id || !reservation?.id) return;
    if (didAutoScrollChatRef.current) return;

    const cameFromState = !!location?.state?.scrollToChat;
    const cameFromHash = String(window.location.hash || "").toLowerCase() === "#chat";
    if (!cameFromState && !cameFromHash) return;

    didAutoScrollChatRef.current = true;

    setTimeout(() => {
      chatSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("chat-scroll-bottom", { detail: { reservationId: reservation.id } }));
      }, 240);
    }, 120);
  }, [user?.id, reservation?.id, location?.state]);

  useEffect(() => {
    if (!user?.id || !reservation?.id) return;
    if (didClearChatUnreadRef.current) return;

    const cameFromHash = String(window.location.hash || "").toLowerCase() === "#chat";
    const cameFromState = !!location?.state?.scrollToChat;
    if (!cameFromHash && !cameFromState) return;

    didClearChatUnreadRef.current = true;
    clearChatUnreadForThisReservation();
  }, [user?.id, reservation?.id, location?.state, clearChatUnreadForThisReservation]);

  useEffect(() => {
    const onNewMsg = (e) => {
      const rid = e?.detail?.reservationId;
      if (!rid || !reservation?.id) return;
      if (String(rid) !== String(reservation.id)) return;
      if (String(reservation.status) !== "Aceita") return;

      const now = Date.now();
      if (now - lastChatScrollAtRef.current < 2500) return;
      lastChatScrollAtRef.current = now;

      const el = chatSectionRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const viewportH = window.innerHeight || document.documentElement.clientHeight;

      const isChatVisible = rect.top < viewportH * 0.65 && rect.bottom > viewportH * 0.15;

      if (!isChatVisible) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("chat-scroll-bottom", { detail: { reservationId: reservation.id } }));
        }, 260);
      } else {
        window.dispatchEvent(new CustomEvent("chat-scroll-bottom", { detail: { reservationId: reservation.id } }));
      }

      clearChatUnreadForThisReservation();
    };

    window.addEventListener("chat-new-message", onNewMsg);
    return () => window.removeEventListener("chat-new-message", onNewMsg);
  }, [reservation?.id, reservation?.status, clearChatUnreadForThisReservation]);

  useEffect(() => {
    const onScrollToChat = (e) => {
      const rid = e?.detail?.reservationId;
      if (!rid || !reservation?.id) return;
      if (String(rid) !== String(reservation.id)) return;

      const el = chatSectionRef.current;
      if (!el) return;

      el.scrollIntoView({ behavior: "smooth", block: "start" });

      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("chat-scroll-bottom", { detail: { reservationId: reservation.id } }));
      }, 260);
    };

    window.addEventListener("chat-scroll-to-chat", onScrollToChat);
    return () => window.removeEventListener("chat-scroll-to-chat", onScrollToChat);
  }, [reservation?.id]);

  const canTutorSeeCaregiverAddress = useMemo(
    () => isTutor && reservation?.status === "Aceita" && !!caregiver?.address,
    [isTutor, reservation?.status, caregiver?.address]
  );

  const canCaregiverSeeTutorAddress = useMemo(
    () => isCaregiver && reservation?.status === "Aceita" && !!tutor?.address,
    [isCaregiver, reservation?.status, tutor?.address]
  );

  const canMarkCompleted = useMemo(() => {
    if (!reservation || !isCaregiver) return false;
    if (reservation.status !== "Aceita") return false;
    if (!reservation.endDate) return false;

    const end = parseLocalKey(reservation.endDate);
    if (Number.isNaN(end.getTime())) return false;

    return end <= today;
  }, [reservation, isCaregiver, today]);

  const alreadyRatedByUser = useMemo(() => {
    if (!reservation) return false;
    if (isTutor) return reservation.tutorRating != null;
    if (isCaregiver) return reservation.caregiverRating != null;
    return false;
  }, [reservation, isTutor, isCaregiver]);

  const canRate = useMemo(() => {
    if (!reservation || (!isTutor && !isCaregiver)) return false;
    if (!reservation.endDate) return false;
    if (!isConcludedStatus(reservation.status)) return false;

    const end = parseLocalKey(reservation.endDate);
    if (Number.isNaN(end.getTime())) return false;
    if (end > today) return false;

    if (alreadyRatedByUser) return false;
    return true;
  }, [reservation, isTutor, isCaregiver, today, alreadyRatedByUser]);

  const counterpartRating = useMemo(() => {
    if (!reservation) return null;

    if (isTutor) {
      return { roleLabel: "Cuidador", rating: reservation.caregiverRating, review: reservation.caregiverReview };
    }
    if (isCaregiver) {
      return { roleLabel: "Tutor", rating: reservation.tutorRating, review: reservation.tutorReview };
    }
    return null;
  }, [reservation, isTutor, isCaregiver]);

  const openRatingModal = () => {
    if (!canRate || ratingBusy) return;
    setRatingTitle(isTutor ? "Avaliar cuidador" : "Avaliar tutor");
    setRatingOpen(true);
  };

  const closeRatingModal = () => {
    if (ratingBusy) return;
    setRatingOpen(false);
    setRatingTitle("");
  };

  const syncStatusWithBackend = async (newStatus, extraBody = null) => {
    if (!token || !reservation?.id) return false;

    try {
      const body = extraBody ? { status: newStatus, ...extraBody } : { status: newStatus };

      const data = await authRequest("/reservations/" + reservation.id + "/status", token, {
        method: "PATCH",
        body,
      });

      if (data?.reservation) {
        applyServerReservation(data.reservation, reservation);
      } else {
        setReloadKey((k) => k + 1);
      }

      return true;
    } catch (err) {
      console.error("Erro ao sincronizar status no servidor:", err);
      showToast(
        err?.message ||
        "Não foi possível sincronizar o status com o servidor. Ele foi atualizado apenas localmente por enquanto.",
        "error"
      );
      return false;
    }
  };

  const refetchReservationFromServer = useCallback(async () => {
    if (!token || !reservation?.id) return false;
    setReloadKey((k) => k + 1);
    return true;
  }, [token, reservation?.id]);

  const createReviewOnBackend = async (value, comment) => {
    if (!token || !reservation?.id) return { ok: false, code: null, reservation: null };

    try {
      const body = {
        reservationId: Number(reservation.id),
        rating: Number(value),
        comment: (comment || "").trim() || null,
      };

      const data = await authRequest("/reviews", token, { method: "POST", body });

      return { ok: !!data?.review, code: null, reservation: data?.reservation || null };
    } catch (err) {
      const code = err?.status || null;
      return { ok: false, code, message: err?.message, reservation: null };
    }
  };

  const handleSubmitRating = async (value, comment) => {
    if (!reservation || (!isTutor && !isCaregiver)) return;
    if (ratingBusy) return;

    if (alreadyRatedByUser) {
      showToast("Você já avaliou esta reserva.", "notify");
      closeRatingModal();
      return;
    }

    setRatingBusy(true);

    try {
      const next = { ...reservation };

      const cleanComment = (comment || "").trim() || null;
      const cleanValue = Number(value);

      if (isTutor) {
        next.tutorRating = cleanValue;
        next.tutorReview = cleanComment;
      } else if (isCaregiver) {
        next.caregiverRating = cleanValue;
        next.caregiverReview = cleanComment;
      }

      persistLocalReservation(next);

      const result = await createReviewOnBackend(cleanValue, cleanComment);

      if (result.ok) {
        if (result.reservation) {
          applyServerReservation(result.reservation, next);
        } else {
          await refetchReservationFromServer();
        }

        closeRatingModal();
        showToast("Avaliação registrada com sucesso! 🐾", "success");
        return;
      }

      if (result.code === 409) {
        await refetchReservationFromServer();
        closeRatingModal();
        showToast("Você já avaliou esta reserva.", "notify");
        return;
      }

      showToast(
        result.message || "Avaliação salva localmente, mas falhou ao registrar no servidor. Tente novamente.",
        "error"
      );
    } finally {
      setRatingBusy(false);
    }
  };

  const caregiverAccept = async () => {
    if (!isCaregiver || !reservation) return;

    const next = { ...reservation, status: "Aceita" };
    persistLocalReservation(next);

    const ok = await syncStatusWithBackend("Aceita");
    if (ok) showToast("Reserva aceita! 🐾", "success");
  };

  const caregiverReject = async () => {
    if (!isCaregiver || !reservation) return;

    const reason = window.prompt("Motivo da recusa (opcional):") || null;

    const next = { ...reservation, status: "Recusada", rejectReason: reason };
    persistLocalReservation(next);

    const ok = await syncStatusWithBackend("Recusada", reason ? { rejectReason: reason } : null);
    if (ok) showToast("Reserva recusada.", "error");
  };

  const tutorCancel = async () => {
    if (!isTutor || !reservation) return;

    if (!["Pendente", "Aceita"].includes(reservation.status)) {
      showToast("Não é possível cancelar neste status.", "notify");
      return;
    }

    cancelFlowLockRef.current = false;
    setCancelConfirmOpen(true);
  };

  const confirmCancelFlow = () => {
    if (cancelBusy) return;
    if (cancelFlowLockRef.current) return;
    cancelFlowLockRef.current = true;

    setCancelConfirmOpen(false);
    setCancelReasonText("");
    setCancelReasonOpen(true);

    setTimeout(() => {
      cancelReasonRef.current?.focus?.();
    }, 50);
  };

  const closeCancelConfirm = () => {
    if (cancelBusy) return;
    setCancelConfirmOpen(false);
    cancelFlowLockRef.current = false;
  };

  const closeCancelReason = () => {
    if (cancelBusy) return;
    setCancelReasonOpen(false);
    setCancelReasonText("");
    cancelFlowLockRef.current = false;
  };

  const submitCancelReason = async () => {
    if (!isTutor || !reservation) return;
    if (cancelBusy) return;

    const reason = String(cancelReasonText || "").trim();

    if (!reason) {
      showToast("Informe o motivo do cancelamento.", "notify");
      cancelReasonRef.current?.focus?.();
      return;
    }

    setCancelBusy(true);

    const prev = reservation;

    try {
      const next = { ...reservation, status: "Cancelada", cancelReason: reason };
      persistLocalReservation(next);

      const ok = await syncStatusWithBackend("Cancelada", { cancelReason: reason });

      if (!ok) {
        persistLocalReservation(prev);
        showToast("Não foi possível cancelar agora. Tente novamente.", "error");
        return;
      }

      setCancelReasonOpen(false);
      setCancelReasonText("");
      cancelFlowLockRef.current = false;

      showToast("Reserva cancelada.", "success");
      navigate("/dashboard", { replace: true });
    } finally {
      setCancelBusy(false);
    }
  };

  const caregiverMarkCompleted = async () => {
    if (!reservation || !isCaregiver) return;

    if (!canMarkCompleted) {
      showToast("Só é possível marcar como concluída após o término da reserva.", "notify");
      return;
    }

    const next = { ...reservation, status: "Concluida" };
    persistLocalReservation(next);

    const ok = await syncStatusWithBackend("Concluida");
    if (ok) {
      showToast("Reserva marcada como concluída! Agora vocês podem se avaliar. 🐾", "success");
    }
  };

  const selectedPetIds = useMemo(() => {
    const ids = reservation?.petsIds;
    if (!ids) return [];
    if (Array.isArray(ids)) return ids.map((x) => toStr(x)).filter(Boolean);
    if (typeof ids === "string") {
      const parsed = safeJsonParse(ids);
      if (Array.isArray(parsed)) return parsed.map((x) => toStr(x)).filter(Boolean);
      return [ids].map((x) => toStr(x)).filter(Boolean);
    }
    return [ids].map((x) => toStr(x)).filter(Boolean);
  }, [reservation?.petsIds]);

  const selectedPetsFromLocal = useMemo(() => {
    if (!tutorPets?.length) return [];
    if (!selectedPetIds.length) return [];
    const set = new Set(selectedPetIds.map(String));
    return tutorPets
      .map((p) => normalizePetObject(p))
      .filter(Boolean)
      .filter((p) => set.has(String(p.id)));
  }, [tutorPets, selectedPetIds]);

  const selectedPetsFromSnapshot = useMemo(() => {
    const snap = reservation?.petsSnapshot;
    const normalized = normalizeSnapshotArray(snap, selectedPetIds);
    return Array.isArray(normalized) ? normalized : [];
  }, [reservation?.petsSnapshot, selectedPetIds]);

  const displayPets = useMemo(() => {
    if (selectedPetsFromSnapshot.length) return selectedPetsFromSnapshot;
    if (selectedPetsFromLocal.length) return selectedPetsFromLocal;
    return [];
  }, [selectedPetsFromLocal, selectedPetsFromSnapshot]);

  useEffect(() => {
    if (loading) return;
    if (!isTutor) return;
    if (!reservation) return;

    const hasAnySelected = selectedPetIds.length > 0;
    const hasAnyDisplay = displayPets.length > 0;
    const tutorHasAnyPet = Array.isArray(tutorPets) && tutorPets.length > 0;

    if (!hasAnySelected && !hasAnyDisplay && !tutorHasAnyPet && !didWarnNoPetsRef.current) {
      didWarnNoPetsRef.current = true;
      showToast("Para fazer uma reserva, você precisa cadastrar pelo menos 1 pet. Vá em Painel → Meus Pets. 🐾", "notify");
    }
  }, [loading, isTutor, reservation?.id, selectedPetIds.length, displayPets.length, tutorPets?.length, showToast]);

  if (loading) return <CenterCard>Carregando reserva...</CenterCard>;
  if (notFound || !reservation) return <CenterCard>Reserva não encontrada.</CenterCard>;
  if (!isOwner) return <CenterCard>Você não tem acesso a esta reserva.</CenterCard>;

  const headerTitle = isTutor ? "Detalhe da sua reserva" : isCaregiver ? "Reserva recebida" : "Detalhe da reserva";
  const effectiveToken = token || user?.token || null;

  const otherUserName = isTutor
    ? caregiver?.name || reservation?.caregiverName || ""
    : isCaregiver
      ? tutor?.name || reservation?.tutorName || ""
      : "";

  return (
    <div className="bg-[#EBCBA9] min-h-[calc(100vh-120px)] py-8 px-6">
      <PcModal open={cancelConfirmOpen} title="Cancelar reserva?" onClose={closeCancelConfirm} disableClose={cancelBusy}>
        <p className="text-sm opacity-90">Você tem certeza que deseja cancelar esta reserva?</p>

        <div className="mt-4 flex flex-wrap gap-3 justify-end">
          <button
            type="button"
            onClick={closeCancelConfirm}
            disabled={cancelBusy}
            className={
              "px-4 py-2 rounded-lg font-semibold " +
              (cancelBusy
                ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                : "bg-gray-200 hover:bg-gray-300 text-[#5A3A22]")
            }
          >
            Voltar
          </button>

          <button
            type="button"
            onClick={confirmCancelFlow}
            disabled={cancelBusy}
            className={
              "px-4 py-2 rounded-lg font-semibold text-white " +
              (cancelBusy ? "bg-gray-400 cursor-not-allowed" : "bg-[#95301F] hover:bg-[#7d2618]")
            }
          >
            Sim, cancelar
          </button>
        </div>
      </PcModal>

      <PcModal
        open={cancelReasonOpen}
        title="Motivo do cancelamento"
        onClose={closeCancelReason}
        disableClose={cancelBusy}
        maxWidth="max-w-[640px]"
      >
        <p className="text-sm opacity-90">Para cancelar, informe o motivo (obrigatório).</p>

        <div className="mt-3">
          <textarea
            ref={cancelReasonRef}
            value={cancelReasonText}
            onChange={(e) => setCancelReasonText(e.target.value)}
            rows={4}
            placeholder="Ex.: Imprevisto, mudança de planos, etc."
            className="w-full rounded-xl border p-3 text-sm outline-none focus:ring-2 focus:ring-[#FFD700]/60"
            disabled={cancelBusy}
          />
          <p className="mt-2 text-xs opacity-70">* Campo obrigatório</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 justify-end">
          <button
            type="button"
            onClick={closeCancelReason}
            disabled={cancelBusy}
            className={
              "px-4 py-2 rounded-lg font-semibold " +
              (cancelBusy
                ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                : "bg-gray-200 hover:bg-gray-300 text-[#5A3A22]")
            }
          >
            Voltar
          </button>

          <button
            type="button"
            onClick={submitCancelReason}
            disabled={cancelBusy}
            className={
              "px-4 py-2 rounded-lg font-semibold text-[#5A3A22] " +
              (cancelBusy ? "bg-[#FFD700]/50 cursor-not-allowed" : "bg-[#FFD700] hover:bg-[#f5c400]")
            }
          >
            {cancelBusy ? "Cancelando..." : "Confirmar cancelamento"}
          </button>
        </div>
      </PcModal>

      <div className="max-w-[1400px] mx-auto bg-white rounded-2xl shadow p-6 border-l-4 border-[#FFD700]/80">
        <h1 className="text-2xl md:text-3xl font-bold text-[#5A3A22] mb-4">{headerTitle}</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[#5A3A22]">
          <div className="pc-card pc-card-accent">
            <h2 className="font-semibold mb-2">Informações</h2>
            <p>
              <b>Status:</b> {reservation.status}
            </p>
            <p>
              <b>Período:</b> {formatDateBR(reservation.startDate)} até {formatDateBR(reservation.endDate)}
            </p>
            <p>
              <b>Serviço:</b> {reservation.service || "—"}
            </p>

            <p>
              <b>Preço/dia:</b> {formatMoneyBR(resolvedPricePerDay)}
            </p>

            <p>
              <b>Total:</b> {formatMoneyBR(resolvedTotal)}
            </p>

            {reservation.status === "Recusada" && reservation.rejectReason && (
              <div className="mt-3 p-3 rounded-xl border bg-[#FFF8F0]">
                <p className="text-sm">
                  <b>Motivo da recusa:</b> {reservation.rejectReason}
                </p>
              </div>
            )}

            {reservation.status === "Cancelada" && reservation.cancelReason && (
              <div className="mt-3 p-3 rounded-xl border bg-[#FFF8F0]">
                <p className="text-sm">
                  <b>Motivo do cancelamento:</b> {reservation.cancelReason}
                </p>
              </div>
            )}
          </div>

          <div className="pc-card pc-card-accent">
            <h2 className="font-semibold mb-2">Localização</h2>
            <p>
              <b>Bairro/Cidade:</b> {[reservation.neighborhood, reservation.city].filter(Boolean).join(" — ") || "—"}
            </p>

            {isTutor ? (
              canTutorSeeCaregiverAddress ? (
                <p className="mt-1">
                  <b>Endereço completo do cuidador:</b> {caregiver?.address}
                </p>
              ) : (
                <p className="mt-1 text-sm opacity-80">
                  Endereço completo do cuidador visível após <b>Aceita</b>.
                </p>
              )
            ) : isCaregiver ? (
              canCaregiverSeeTutorAddress ? (
                <p className="mt-1">
                  <b>Endereço completo do tutor:</b> {tutor?.address}
                </p>
              ) : (
                <p className="mt-1 text-sm opacity-80">
                  Endereço completo do tutor visível após <b>Aceita</b>.
                </p>
              )
            ) : null}

            <button
              type="button"
              onClick={() => {
                const q = encodeURIComponent([reservation.neighborhood, reservation.city].filter(Boolean).join(", "));
                if (!q) return;
                window.open("https://www.google.com/maps/search/?api=1&query=" + q, "_blank");
              }}
              className="mt-3 bg-gray-200 hover:bg-gray-300 text-[#5A3A22] px-4 py-2 rounded-lg font-semibold shadow-md transition"
            >
              Ver no mapa
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 text-[#5A3A22]">
          <div className="pc-card pc-card-accent">
            <h2 className="font-semibold mb-2">Tutor</h2>
            <p>
              <b>Nome:</b> {tutor?.name || reservation?.tutorName || "—"}
            </p>
            <p>
              <b>Email:</b> {tutor?.email || reservation?.tutorEmail || "—"}
            </p>
            <p>
              <b>Telefone:</b> {maskPhone(tutor?.phone || reservation?.tutorPhone)}
            </p>
            {canCaregiverSeeTutorAddress && (
              <>
                <p>
                  <b>Bairro:</b> {tutor?.neighborhood || "—"}
                </p>
                <p>
                  <b>Cidade:</b> {tutor?.city || "—"}
                </p>
                <p>
                  <b>Endereço completo:</b> {tutor?.address || "—"}
                </p>
              </>
            )}
          </div>

          <div className="pc-card pc-card-accent">
            <h2 className="font-semibold mb-2">Cuidador</h2>
            <p>
              <b>Nome:</b> {caregiver?.name || reservation?.caregiverName || "—"}
            </p>
            <p>
              <b>Email:</b> {caregiver?.email || reservation?.caregiverEmail || "—"}
            </p>
            <p>
              <b>Telefone:</b> {maskPhone(caregiver?.phone || reservation?.caregiverPhone)}
            </p>
            {canTutorSeeCaregiverAddress && (
              <>
                <p>
                  <b>Bairro:</b> {caregiver?.neighborhood || "—"}
                </p>
                <p>
                  <b>Cidade:</b> {caregiver?.city || "—"}
                </p>
                <p>
                  <b>Endereço completo:</b> {caregiver?.address || "—"}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="mt-8 text-[#5A3A22]">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="text-lg font-semibold flex items-center gap-2">Pets que serão cuidados 🐾</h2>

            {isTutor && (
              <Link
                to="/dashboard"
                state={{ initialTab: "pets" }}
                className="text-xs md:text-sm underline text-[#5A3A22] hover:text-[#95301F]"
              >
                Gerenciar Meus Pets
              </Link>
            )}
          </div>

          {displayPets.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {displayPets.map((rawPet) => {
                const pet = normalizePetObject(rawPet) || rawPet;

                const petName = pet?.name || "Pet";
                const specie = pet?.specie || pet?.species || "Espécie não informada";
                const breed = pet?.breed ? "• " + pet.breed : "";
                const porte = pet?.porte || pet?.port || pet?.size || pet?.portePet || null;

                const petImg = pickPetImage(pet) || DEFAULT_PET_IMG;

                return (
                  <div
                    key={pet?.id || petName}
                    className="flex gap-3 items-center border rounded-xl p-3 bg-[#FFF8F0] shadow-sm"
                  >
                    <img
                      src={petImg}
                      alt={petName}
                      className="w-16 h-16 rounded-full object-cover border-2 border-[#FFD700]"
                    />
                    <div className="text-xs md:text-sm">
                      <p className="font-semibold text-sm md:text-base">{petName}</p>
                      <p className="opacity-80">
                        {specie} {breed}
                      </p>
                      {porte && <p className="opacity-80">Porte: {String(porte)}</p>}
                      {pet?.approxAge && <p className="opacity-80">Idade aproximada: {pet.approxAge}</p>}
                      {!!pet?.adjectives?.length && (
                        <p className="mt-1 text-[11px] opacity-90">{pet.adjectives.join(" • ")}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm md:text-base opacity-80 bg-[#FFF8F0] rounded-xl p-3">
              Pets desta reserva não informados.
            </p>
          )}
        </div>

        {(isTutor || isCaregiver) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 text-[#5A3A22]">
            <div className="pc-card pc-card-accent">
              <h2 className="font-semibold mb-2">Sua avaliação</h2>

              {alreadyRatedByUser ? (
                <p className="text-sm opacity-80">
                  Você avaliou esta reserva com{" "}
                  <b>⭐ {isTutor ? reservation.tutorRating : reservation.caregiverRating}/5</b>
                  {isTutor && reservation.tutorReview ? ' — "' + reservation.tutorReview + '"' : ""}
                  {isCaregiver && reservation.caregiverReview ? ' — "' + reservation.caregiverReview + '"' : ""}
                </p>
              ) : (
                <p className="text-sm opacity-70 mb-2">
                  Após a reserva ser <b>concluída</b>, você poderá avaliar a experiência.
                </p>
              )}

              {canRate && (
                <button
                  type="button"
                  onClick={openRatingModal}
                  disabled={ratingBusy}
                  className={
                    "mt-3 px-4 py-2 rounded-lg font-semibold shadow-md text-sm " +
                    (ratingBusy
                      ? "bg-[#FFD700]/60 cursor-not-allowed text-[#5A3A22]"
                      : "bg-[#FFD700]/90 hover:bg-[#FFD700] text-[#5A3A22]")
                  }
                >
                  {ratingBusy ? "Enviando..." : isTutor ? "Avaliar cuidador" : "Avaliar tutor"}
                </button>
              )}
            </div>

            <div className="pc-card pc-card-accent">
              <h2 className="font-semibold mb-2">Avaliação da outra parte</h2>

              {counterpartRating && counterpartRating.rating != null ? (
                <p className="text-sm opacity-80">
                  {counterpartRating.roleLabel} avaliou esta reserva com <b>⭐ {counterpartRating.rating}/5</b>
                  {counterpartRating.review ? ' — "' + counterpartRating.review + '"' : ""}
                </p>
              ) : (
                <p className="text-sm opacity-70">Ainda não há avaliação registrada pela outra parte.</p>
              )}
            </div>
          </div>
        )}

        {(isTutor || isCaregiver) && (
          <div className="mt-8" ref={chatSectionRef} id="chat">
            {canChatNow ? (
              <ChatErrorBoundary>
                <ChatBox
                  reservationId={reservation.id}
                  token={effectiveToken}
                  currentUserId={myUserId}
                  otherUserName={otherUserName}
                  canChat={true}
                  reservationStatus={reservation.status}
                />
              </ChatErrorBoundary>
            ) : (
              <div className="pc-card pc-card-accent text-[#5A3A22]">
                O chat fica disponível apenas enquanto a reserva estiver <b>Aceita</b>.
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-3 mt-6">
          {isCaregiver && reservation.status === "Pendente" && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={caregiverAccept}
                  className="px-4 py-2 rounded-lg font-semibold text-white bg-green-600 hover:bg-green-700"
                >
                  Aceitar
                </button>
                <button
                  type="button"
                  onClick={caregiverReject}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-semibold"
                >
                  Recusar
                </button>
              </div>
            </div>
          )}

          {isTutor && ["Pendente", "Aceita"].includes(reservation.status) && (
            <button
              type="button"
              onClick={tutorCancel}
              className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-2 rounded-lg font-semibold"
            >
              Cancelar
            </button>
          )}

          {isCaregiver && canMarkCompleted && (
            <button
              type="button"
              onClick={caregiverMarkCompleted}
              className="bg-[#FFD700] hover:bg-[#f5c400] text-[#5A3A22] px-4 py-2 rounded-lg font-semibold"
            >
              Marcar reserva como concluída
            </button>
          )}

          <button
            type="button"
            onClick={() => navigate(-1)}
            className="bg-[#5A3A22] hover:bg-[#95301F] text-white px-4 py-2 rounded-lg font-semibold"
          >
            Voltar
          </button>
        </div>

        <RatingModal
          isOpen={ratingOpen}
          title={ratingTitle || "Avaliar"}
          onClose={closeRatingModal}
          onSubmit={handleSubmitRating}
          busy={ratingBusy}
        />
      </div>
    </div>
  );
}
