// src/pages/CaregiverDetail.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ToastProvider";
import {
  toLocalKey,
  parseLocalKey,
  formatDateBR,
  maskDateBRInput,
  dateBRToLocalKey,
  isValidDateBR,
} from "../utils/date";
import { authRequest } from "../services/api";

// ✅ Analytics
import { trackEvent } from "../utils/analytics";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

/* ===========================
   NORMALIZE (LOCAL TEMP)
   - para não quebrar build/deploy
   - depois movemos para ../utils/normalize
   =========================== */
const DEFAULT_IMG = "/paw.png";
const toNum = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const cap = (s = "") => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const serviceLabel = (k) =>
  k === "petSitter" ? "Pet Sitter" : k === "passeios" ? "Passeios" : cap(k);

const getSvcPriceMap = (raw) => {
  const p = raw?.prices || {};
  return {
    hospedagem:
      toNum(p.hospedagemDia) ??
      toNum(p.hospedagemDiaria) ??
      toNum(p.hospedagem),
    creche: toNum(p.crecheDiaria) ?? toNum(p.crecheDia) ?? toNum(p.creche),
    petSitter:
      toNum(p.petSitterDiaria) ??
      toNum(p.petSitterVisita) ??
      toNum(p.petsitterDiaria) ??
      toNum(p.petsiterDiaria) ??
      toNum(p.petSitter),
    passeios:
      toNum(p.passeiosHora) ??
      toNum(p.passeioHora) ??
      toNum(p.passeios30) ??
      toNum(p.passeiosDiaria) ??
      toNum(p.passeios),
  };
};

const baseLocation = (raw) => {
  const neighborhood = (raw?.neighborhood || "").trim();
  const city = (raw?.city || "").trim();
  const displayLocation = [neighborhood, city].filter(Boolean).join(" — ");
  return { neighborhood, city, displayLocation };
};

function normalizeCaregiver(raw) {
  if (!raw) return null;

  const priceMap = getSvcPriceMap(raw);

  const services = {
    hospedagem:
      (raw?.services?.hospedagem ?? false) || (priceMap.hospedagem > 0),
    creche: (raw?.services?.creche ?? false) || (priceMap.creche > 0),
    petSitter:
      (raw?.services?.petSitter ?? false) || (priceMap.petSitter > 0),
    passeios: (raw?.services?.passeios ?? false) || (priceMap.passeios > 0),
  };

  const legacy = toNum(raw?.price);
  const candidates = [
    priceMap.hospedagem,
    priceMap.creche,
    priceMap.petSitter,
    priceMap.passeios,
    legacy,
  ].filter((v) => Number(v) > 0);

  const minPrice = candidates.length ? Math.min(...candidates) : null;

  const { neighborhood, city, displayLocation } = baseLocation(raw);

  return {
    ...raw,
    image: raw?.image || DEFAULT_IMG,
    prices: {
      // ✅ por serviço (fallback)
      hospedagem: priceMap.hospedagem,
      creche: priceMap.creche,
      petSitter: priceMap.petSitter,
      passeios: priceMap.passeios,

      // ✅ mantém seu formato atual (UI)
      hospedagemDia: priceMap.hospedagem,
      crecheDiaria: priceMap.creche,
      petSitterDiaria: priceMap.petSitter,
      passeiosHora: priceMap.passeios,
    },
    services,
    minPrice,
    neighborhood,
    city,
    displayLocation,
  };
}

export default function CaregiverDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { showToast } = useToast();

  const [caregiver, setCaregiver] = useState(null);

  // ✅ Galeria pública do cuidador (para tutor ver)
  const [galleryPhotos, setGalleryPhotos] = useState([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [galleryError, setGalleryError] = useState(null);

  // modal simples ao clicar na foto
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(-1);

  const activePhoto =
    activePhotoIndex >= 0 ? galleryPhotos[activePhotoIndex] : null;

  const openPhoto = (p, indexFromMap) => {
    // se veio index (recomendado), usa ele; senão tenta achar no array
    const idx =
      Number.isFinite(Number(indexFromMap))
        ? Number(indexFromMap)
        : galleryPhotos.findIndex((x) => String(x?.id) === String(p?.id));

    setActivePhotoIndex(idx >= 0 ? idx : 0);
    setGalleryOpen(true);
  };

  const closePhoto = () => {
    setGalleryOpen(false);
    setActivePhotoIndex(-1);
  };

  const goPrevPhoto = () => {
    if (!galleryPhotos.length) return;
    setActivePhotoIndex((prev) => (prev <= 0 ? galleryPhotos.length - 1 : prev - 1));
  };

  const goNextPhoto = () => {
    if (!galleryPhotos.length) return;
    setActivePhotoIndex((prev) => (prev >= galleryPhotos.length - 1 ? 0 : prev + 1));
  };

  // ✅ Navegação por teclado no modal (← → Esc)
  useEffect(() => {
    if (!galleryOpen) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") closePhoto();
      if (e.key === "ArrowLeft") goPrevPhoto();
      if (e.key === "ArrowRight") goNextPhoto();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [galleryOpen, galleryPhotos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ✅ evita piscar “não encontrado” antes de terminar o fetch
  const [caregiverLoading, setCaregiverLoading] = useState(true);
  const [caregiverLoaded, setCaregiverLoaded] = useState(false);

  // reservas (para avaliações / address access)
  const [reservations, setReservations] = useState([]);

  // ✅ reviews do cuidador (fonte de verdade: backend /reviews)
  const [reviews, setReviews] = useState([]);
  const [reviewSummary, setReviewSummary] = useState({ avg: 0, count: 0 });

  // ✅ UX states (Passo 6)
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsLoadingMore, setReviewsLoadingMore] = useState(false);
  const [reviewsError, setReviewsError] = useState(null);

  // paginação
  const PAGE_SIZE = 5;
  const [reviewsPage, setReviewsPage] = useState(1);
  const [reviewsHasMore, setReviewsHasMore] = useState(false);

  // ✅ filtro de avaliações por serviço
  const [reviewSvcFilter, setReviewSvcFilter] = useState("todos");

  // pré-reserva
  const [svc, setSvc] = useState("");
  const [startDate, setStartDate] = useState(""); // YYYY-MM-DD
  const [endDate, setEndDate] = useState(""); // YYYY-MM-DD
  const [saving, setSaving] = useState(false);

  // ✅ NOVO: inputs visuais em PT-BR (DD/MM/AAAA)
  const [startBR, setStartBR] = useState("");
  const [endBR, setEndBR] = useState("");

  // pets do tutor
  const [pets, setPets] = useState([]);
  const [selectedPetIds, setSelectedPetIds] = useState([]);
  const [allPetsSelected, setAllPetsSelected] = useState(false);

  // ✅ disponibilidade do cuidador (fonte de verdade: /availability/caregiver/:caregiverId)
  const [availableKeys, setAvailableKeys] = useState([]);

  // ✅ opcional: feedback de capacidade (quando 409 CAPACITY_FULL)
  const [capacityInfo, setCapacityInfo] = useState(null);

  // ✅ animação suave para itens recém inseridos
  const [revealedIds, setRevealedIds] = useState(() => new Set());
  const revealTimerRef = useRef(null);

  const todayKey = useMemo(() => toLocalKey(new Date()), []);

  // ✅ CHAVE NOVA (igual ReservationDetail)
  const reservationsStorageKey = useMemo(() => {
    if (!user?.id || !user?.role) return "reservations";
    return `reservations_${String(user.role)}_${String(user.id)}`;
  }, [user?.id, user?.role]);

  // ---------------- helpers ----------------
  const normalizeKey = (value) => {
    if (!value) return null;

    if (typeof value === "object") {
      const maybe =
        value.date ||
        value.day ||
        value.value ||
        value.key ||
        value.available_date ||
        value.availableDate ||
        value.date_key ||
        value.dateKey;
      if (maybe) return normalizeKey(maybe);
    }

    const s = String(value).trim();
    if (!s) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return toLocalKey(d);
  };

  const uniqSort = (arr) =>
    Array.from(new Set((arr || []).map(normalizeKey).filter(Boolean))).sort();

  const safeJsonParse = (raw, fallback) => {
    try {
      const v = JSON.parse(raw);
      return v ?? fallback;
    } catch {
      return fallback;
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

  const toStr = (v) => (v == null ? "" : String(v));
  const toNumLocal = (v) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const toNumSafe = (v) => {
    if (v == null || v === "") return null;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  // ✅ pega image OU photo (compat)
  const pickPetImage = (p) => p?.image || p?.photo || p?.img || null;

  // ✅ normaliza item de review vindo do backend
  const normalizeReviewItem = (rv) => {
    if (!rv) return null;

    // ignora hidden quando vier
    if (rv.is_hidden === true || rv.isHidden === true) return null;

    const authorRole =
      rv.author_role ||
      rv.reviewer_role ||
      rv.role ||
      (rv.reviewer_id &&
        rv.tutor_id &&
        String(rv.reviewer_id) === String(rv.tutor_id)
        ? "tutor"
        : rv.reviewer_id &&
          rv.caregiver_id &&
          String(rv.reviewer_id) === String(rv.caregiver_id)
          ? "caregiver"
          : null);

    const authorName =
      rv.author_name ||
      rv.reviewer_name ||
      rv.tutor_name ||
      rv.caregiver_name ||
      "Usuário";

    const createdAt = rv.created_at
      ? String(rv.created_at)
      : rv.createdAt
        ? String(rv.createdAt)
        : rv.date
          ? String(rv.date)
          : null;

    const rating = Number(rv.rating ?? rv.stars ?? rv.nota ?? 0);

    const service = rv.service ?? rv.service_key ?? rv.serviceKey ?? rv.svc ?? null;

    const reservationId =
      rv.reservation_id ??
      rv.reservationId ??
      rv.reservation?.id ??
      rv.reservation ??
      null;

    return {
      id: toStr(
        rv.id ||
        rv.review_id ||
        rv.reviewId ||
        `${Date.now()}_${Math.random().toString(16).slice(2)}`
      ),
      reservationId: reservationId != null ? String(reservationId) : null,
      authorRole: authorRole ? String(authorRole) : null,
      authorName: String(authorName),
      rating: Number.isFinite(rating) ? rating : 0,
      comment: rv.comment == null ? null : String(rv.comment),
      createdAt,
      service: service ? String(service) : null,
    };
  };

  // ✅ tenta extrair avg/count de qualquer formato que possa vir no cuidador
  const getCaregiverRatingSummary = (cg) => {
    if (!cg) return { avg: 0, count: 0 };

    const avg =
      toNumLocal(cg.avgRating) ??
      toNumLocal(cg.ratingAvg) ??
      toNumLocal(cg.avg_rating) ??
      toNumLocal(cg.rating_avg) ??
      toNumLocal(cg.average_rating) ??
      0;

    const count =
      toNumLocal(cg.ratingCount) ??
      toNumLocal(cg.reviewsCount) ??
      toNumLocal(cg.rating_count) ??
      toNumLocal(cg.reviews_count) ??
      toNumLocal(cg.count_reviews) ??
      0;

    return { avg: avg || 0, count: count || 0 };
  };

  /**
   * ✅ Encolhe base64 (dataURL) para thumbnail leve
   */
  const makeThumbnailDataUrl = (dataUrl, maxSize = 96, quality = 0.65) =>
    new Promise((resolve) => {
      try {
        if (!dataUrl || typeof dataUrl !== "string") return resolve(null);
        if (!dataUrl.startsWith("data:image/")) return resolve(dataUrl);

        const img = new Image();
        img.onload = () => {
          try {
            const w = img.width || 0;
            const h = img.height || 0;
            if (!w || !h) return resolve(null);

            const ratio = Math.min(maxSize / w, maxSize / h, 1);
            const tw = Math.max(1, Math.round(w * ratio));
            const th = Math.max(1, Math.round(h * ratio));

            const canvas = document.createElement("canvas");
            canvas.width = tw;
            canvas.height = th;
            const ctx = canvas.getContext("2d");
            if (!ctx) return resolve(null);

            ctx.drawImage(img, 0, 0, tw, th);
            const out = canvas.toDataURL("image/jpeg", quality);
            resolve(out);
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      } catch {
        resolve(null);
      }
    });

  const buildPetsSnapshot = async (selectedPets) => {
    const list = Array.isArray(selectedPets) ? selectedPets : [];

    const items = await Promise.all(
      list.map(async (p) => {
        const rawImg = pickPetImage(p);
        let imgOut = rawImg;

        if (typeof rawImg === "string" && rawImg.startsWith("data:image/")) {
          if (rawImg.length > 180_000) {
            const thumb = await makeThumbnailDataUrl(rawImg, 96, 0.65);
            imgOut = thumb || null;
          } else {
            imgOut = rawImg;
          }
        }

        return {
          id: String(p?.id),
          name: p?.name || "",
          image: imgOut || null,
          photo: imgOut || null,
          specie: p?.specie || p?.species || null,
          port: p?.port || p?.porte || p?.size || null,
          breed: p?.breed || null,
          approxAge: p?.approxAge || null,
          adjectives: Array.isArray(p?.adjectives) ? p.adjectives : [],
        };
      })
    );

    return items;
  };

  /**
   * ✅ backend availability -> keys ["YYYY-MM-DD"]
   */
  const availToKeys = (data) => {
    if (Array.isArray(data)) return uniqSort(data);

    const listA = Array.isArray(data?.availability) ? data.availability : [];
    const listB = Array.isArray(data?.availableDates) ? data.availableDates : [];
    const listC = Array.isArray(data?.dates) ? data.dates : [];

    if (listA.length && typeof listA[0] === "string") {
      return uniqSort(listA);
    }

    if (listA.length) {
      const keys = listA
        .filter((x) => {
          if (!x) return false;
          const flag = x.is_available ?? x.isAvailable ?? x.available ?? x.isAvailableDay;
          return flag === true;
        })
        .map((x) =>
          normalizeKey(x.date_key ?? x.dateKey ?? x.date ?? x.day ?? x.value ?? x.key)
        )
        .filter(Boolean);

      return uniqSort(keys);
    }

    const raw = listB.length ? listB : listC;
    if (raw.length) return uniqSort(raw);

    return [];
  };

  // ✅ Analytics: ver perfil (1x por cuidador carregado)
  const viewedProfileRef = useRef(new Set());
  useEffect(() => {
    if (!caregiverLoaded) return;
    if (!caregiver) return;

    const cid = String(caregiver?.id ?? id ?? "");
    if (!cid) return;

    if (viewedProfileRef.current.has(cid)) return;
    viewedProfileRef.current.add(cid);

    const servicesCount = Object.entries(caregiver?.services || {}).filter(([, v]) => !!v).length;

    trackEvent("view_profile", {
      caregiver_id: cid,
      caregiver_name: String(caregiver?.name || "").slice(0, 80),
      location: String(caregiver?.displayLocation || "").slice(0, 80),
      min_price: caregiver?.minPrice != null ? Number(caregiver.minPrice) : null,
      has_prices: servicesCount > 0 ? 1 : 0,
      services_count: servicesCount,
    });
  }, [caregiverLoaded, caregiver, id]);

  // ---------------- LOAD reservations + caregiver + availability ----------------
  useEffect(() => {
    let cancelled = false;

    const saveReservationsToStorage = (list) => {
      const payload = JSON.stringify(Array.isArray(list) ? list : []);
      // ✅ NOVO (fonte pro ReservationDetail)
      safeSetLocalStorage(reservationsStorageKey, payload);
      // ✅ LEGADO (mantém compat com telas antigas)
      safeSetLocalStorage("reservations", payload);
    };

    const loadReservations = async () => {
      try {
        if (token && user?.role) {
          const endpoint =
            user.role === "tutor"
              ? "/reservations/tutor"
              : user.role === "caregiver"
                ? "/reservations/caregiver"
                : null;

          if (endpoint) {
            const data = await authRequest(endpoint, token);
            const list = Array.isArray(data?.reservations) ? data.reservations : [];

            const normalized = list.map((r) => ({
              id: String(r.id),
              tutorId: String(r.tutor_id),
              tutorName: r.tutor_name,
              caregiverId: String(r.caregiver_id),
              caregiverName: r.caregiver_name,
              city: r.city || "",
              neighborhood: r.neighborhood || "",
              service: r.service,
              pricePerDay: toNumSafe(r.price_per_day ?? r.pricePerDay ?? r.price),
              startDate: r.start_date ? String(r.start_date).slice(0, 10) : "",
              endDate: r.end_date ? String(r.end_date).slice(0, 10) : "",
              total: toNumSafe(r.total),
              status: r.status || "Pendente",
              tutorRating: r.tutor_rating,
              tutorReview: r.tutor_review,
              caregiverRating: r.caregiver_rating,
              caregiverReview: r.caregiver_review,
              petsIds: r.pets_ids || [],
              petsNames: r.pets_names || "",
              // se vier do backend, mantém também:
              petsSnapshot:
                r.pets_snapshot || r.petsSnapshot || r.pets_details || r.petsDetails || null,
            }));

            if (!cancelled) {
              setReservations(normalized);
              saveReservationsToStorage(normalized);
            }
            return;
          }
        }
      } catch {
        // fallback local
      }

      // ✅ tenta primeiro a chave NOVA (porque é onde o ReservationDetail lê)
      const localNew =
        safeJsonParse(localStorage.getItem(reservationsStorageKey) || "[]", []) || [];
      if (Array.isArray(localNew) && localNew.length) {
        if (!cancelled) setReservations(localNew);
        return;
      }

      // fallback legado
      const localOld = safeJsonParse(localStorage.getItem("reservations") || "[]", []) || [];
      if (!cancelled) setReservations(Array.isArray(localOld) ? localOld : []);
    };

    const loadCaregiver = async () => {
      if (!cancelled) {
        setCaregiverLoading(true);
        setCaregiverLoaded(false);
      }

      let cg = null;

      try {
        const resp = await fetch(`${API_BASE_URL}/caregivers/${id}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
        });
        if (resp.ok) {
          const data = await resp.json();
          const raw = data?.caregiver || data?.user || data;
          if (raw) {
            const norm = normalizeCaregiver(raw);
            cg = { ...raw, ...norm };
          }
        }
      } catch {
        // ignore
      }

      if (!cg) {
        try {
          const resp = await fetch(`${API_BASE_URL}/caregivers`, {
            cache: "no-store",
            headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
          });
          if (resp.ok) {
            const data = await resp.json();
            const list = Array.isArray(data?.caregivers) ? data.caregivers : [];
            const found = list.find((c) => String(c.id) === String(id));
            if (found) {
              const norm = normalizeCaregiver(found);
              cg = { ...found, ...norm };
            }
          }
        } catch (err) {
          console.error("Erro ao carregar cuidador do servidor:", err);
        }
      }

      if (!cg) {
        try {
          const users = safeJsonParse(localStorage.getItem("users") || "[]", []) || [];
          const found = users.find(
            (u) => String(u.id) === String(id) && u.role === "caregiver" && !u.blocked
          );
          if (found) {
            const norm = normalizeCaregiver(found);
            cg = { ...found, ...norm };
          }
        } catch (err) {
          console.error("Erro ao carregar cuidador do localStorage:", err);
        }
      }

      if (cancelled) return;

      setCaregiver(cg || null);
      setCaregiverLoading(false);
      setCaregiverLoaded(true);

      if (cg) {
        try {
          const users = safeJsonParse(localStorage.getItem("users") || "[]", []) || [];
          const idx = users.findIndex((u) => String(u.id) === String(cg.id));
          const merged = { ...(idx >= 0 ? users[idx] : {}), ...cg };
          if (idx >= 0) users[idx] = merged;
          else users.push(merged);

          safeSetLocalStorage("users", JSON.stringify(users));
        } catch {
          // ignore
        }
      }
    };

    const loadAvailabilityForCaregiver = async () => {
      const fallbackLocal = () => {
        try {
          const users = safeJsonParse(localStorage.getItem("users") || "[]", []) || [];
          const found = users.find((u) => String(u.id) === String(id));
          const raw = found?.availableDates || found?.available_dates || [];
          if (!cancelled) setAvailableKeys(uniqSort(raw));
        } catch {
          if (!cancelled) setAvailableKeys([]);
        }
      };

      try {
        const resp = await fetch(`${API_BASE_URL}/availability/caregiver/${id}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
        });

        if (resp.ok) {
          const data = await resp.json();
          const keys = availToKeys(data);
          if (!cancelled) setAvailableKeys(keys);

          try {
            const users = safeJsonParse(localStorage.getItem("users") || "[]", []) || [];
            const idx = users.findIndex((u) => String(u.id) === String(id));
            if (idx >= 0) {
              users[idx] = { ...users[idx], availableDates: keys };
              safeSetLocalStorage("users", JSON.stringify(users));
            }
          } catch {
            // ignore
          }
          return;
        }
      } catch (err) {
        console.error("Erro no fetch público de availability:", err);
      }

      if (token) {
        try {
          const data = await authRequest(`/availability/caregiver/${id}`, token);
          const keys = availToKeys(data);
          if (!cancelled) setAvailableKeys(keys);
          return;
        } catch (err) {
          console.error("Erro ao carregar availability do cuidador (auth):", err);
        }
      }

      fallbackLocal();
    };

    (async () => {
      await loadReservations();
      await loadCaregiver();
      await loadAvailabilityForCaregiver();
    })();

    return () => {
      cancelled = true;
    };
  }, [id, token, user?.role, reservationsStorageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------- LOAD GALLERY (público) ----------------
  useEffect(() => {
    let cancelled = false;

    const loadGallery = async () => {
      setGalleryLoading(true);
      setGalleryError(null);

      try {
        // tenta /photos primeiro (rota oficial pro tutor ver)
        let resp = await fetch(`${API_BASE_URL}/caregivers/${id}/photos`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
        });

        // fallback: /gallery
        if (!resp.ok) {
          resp = await fetch(`${API_BASE_URL}/caregivers/${id}/gallery`, {
            cache: "no-store",
            headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
          });
        }

        if (!resp.ok) throw new Error("Não foi possível carregar as fotos do cuidador.");

        const data = await resp.json();
        const list = Array.isArray(data?.photos) ? data.photos : [];

        const normalized = list
          .map((p) => ({
            id: String(p?.id ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`),
            photo_url: p?.photo_url || p?.url || p?.image || null,
            caption: p?.caption != null ? String(p.caption) : "",
            created_at: p?.created_at || null,
          }))
          .filter((p) => !!p.photo_url);

        if (!cancelled) setGalleryPhotos(normalized);
      } catch (err) {
        if (!cancelled) setGalleryError(err?.message || "Erro ao carregar galeria.");
        if (!cancelled) setGalleryPhotos([]);
      } finally {
        if (!cancelled) setGalleryLoading(false);
      }
    };

    loadGallery();

    return () => {
      cancelled = true;
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------- LOAD REVIEWS (summary + lista paginada) ----------------
  useEffect(() => {
    let cancelled = false;

    // reset completo quando muda o cuidador
    setReviews([]);
    setReviewSummary({ avg: 0, count: 0 });
    setReviewsPage(1);
    setReviewsHasMore(false);
    setReviewsLoading(true);
    setReviewsLoadingMore(false);
    setReviewsError(null);
    setRevealedIds(new Set());

    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }

    const tryFetchJson = async (url) => {
      const resp = await fetch(url, {
        cache: "no-store",
        headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
      });
      if (!resp.ok) return { ok: false, status: resp.status, data: null };
      const data = await resp.json();
      return { ok: true, status: resp.status, data };
    };

    const pickSummary = (sData) => {
      const summary = sData?.summary ?? sData ?? {};
      const avgOut = Number(summary?.avgRating ?? summary?.avg ?? summary?.average ?? 0) || 0;
      const countOut = Number(summary?.count ?? summary?.total ?? summary?.qtd ?? 0) || 0;
      return { avg: avgOut, count: countOut };
    };

    const normalizeList = (data) => {
      const listRaw = Array.isArray(data?.reviews)
        ? data.reviews
        : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data)
            ? data
            : [];
      return listRaw.map(normalizeReviewItem).filter(Boolean);
    };

    const dedupeByIdOrResRole = (arr) => {
      const map = new Map();
      (arr || []).forEach((rv) => {
        if (!rv) return;
        const k =
          rv.reservationId && rv.authorRole
            ? `res:${rv.reservationId}:role:${rv.authorRole}`
            : `id:${rv.id}`;
        if (!map.has(k)) map.set(k, rv);
      });
      return Array.from(map.values());
    };

    const loadSummary = async () => {
      // público
      try {
        const r = await tryFetchJson(`${API_BASE_URL}/reviews/summary/${id}`);
        if (r.ok) {
          const payload = pickSummary(r.data);
          if (!cancelled) setReviewSummary(payload);
          safeSetLocalStorage(`reviews_summary_${String(id)}`, JSON.stringify(payload));
          return;
        }
      } catch {
        // ignore
      }

      // auth fallback
      if (token) {
        try {
          const data = await authRequest(`/reviews/summary/${id}`, token);
          const payload = pickSummary(data);
          if (!cancelled) setReviewSummary(payload);
          safeSetLocalStorage(`reviews_summary_${String(id)}`, JSON.stringify(payload));
        } catch {
          // ignore
        }
      }
    };

    const loadPage = async (page) => {
      const url = `${API_BASE_URL}/reviews/user/${id}?limit=${PAGE_SIZE}&page=${page}`;

      const r = await tryFetchJson(url);
      if (!r.ok) {
        if (token) {
          try {
            const data = await authRequest(`/reviews/user/${id}?limit=${PAGE_SIZE}&page=${page}`, token);
            return { ok: true, data };
          } catch {
            return { ok: false, status: r.status, data: null };
          }
        }
        return { ok: false, status: r.status, data: null };
      }
      return { ok: true, data: r.data };
    };

    const loadInitial = async () => {
      try {
        await loadSummary();

        const p1 = await loadPage(1);
        if (!p1.ok) throw new Error("Não foi possível carregar avaliações.");

        const list = normalizeList(p1.data);
        const merged = dedupeByIdOrResRole(list);

        if (!cancelled) {
          setReviews(merged);
          setReviewsHasMore(list.length === PAGE_SIZE);
          setReviewsPage(1);
        }

        if (!cancelled) {
          setReviewSummary((prev) => {
            const hasPrev = (prev?.count || 0) > 0;
            if (hasPrev) return prev;
            if (!merged.length) return prev;
            const sum = merged.reduce((acc, rv) => acc + (Number(rv.rating) || 0), 0);
            const avg = merged.length ? sum / merged.length : 0;
            return { avg, count: merged.length };
          });
        }

        safeSetLocalStorage(`reviews_user_${String(id)}`, JSON.stringify(merged));

        if (!cancelled) {
          const next = new Set();
          merged.forEach((rv) => next.add(rv.id));
          revealTimerRef.current = setTimeout(() => {
            if (!cancelled) setRevealedIds(next);
          }, 40);
        }
      } catch (err) {
        try {
          const cached = safeJsonParse(localStorage.getItem(`reviews_user_${String(id)}`) || "[]", []);
          const cachedSummary = safeJsonParse(localStorage.getItem(`reviews_summary_${String(id)}`) || "{}", {});

          if (!cancelled) {
            if (Array.isArray(cached) && cached.length) {
              setReviews(cached);
              setReviewsHasMore(false);
              setReviewsPage(1);

              const next = new Set();
              cached.forEach((rv) => next.add(rv.id));
              revealTimerRef.current = setTimeout(() => {
                if (!cancelled) setRevealedIds(next);
              }, 40);
            }

            if (cachedSummary && (cachedSummary.avg != null || cachedSummary.count != null)) {
              setReviewSummary({
                avg: Number(cachedSummary.avg || 0) || 0,
                count: Number(cachedSummary.count || 0) || 0,
              });
            }
          }
        } catch {
          // ignore
        }

        if (!cancelled) {
          setReviewsError(err?.message || "Erro ao carregar avaliações.");
        }
      } finally {
        if (!cancelled) setReviewsLoading(false);
      }
    };

    loadInitial();

    return () => {
      cancelled = false;
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
  }, [id, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoadMoreReviews = async () => {
    if (reviewsLoadingMore || reviewsLoading) return;
    if (!reviewsHasMore) return;

    try {
      setReviewsLoadingMore(true);
      setReviewsError(null);

      const nextPage = (reviewsPage || 1) + 1;
      const url = `${API_BASE_URL}/reviews/user/${id}?limit=${PAGE_SIZE}&page=${nextPage}`;

      let data = null;
      try {
        const resp = await fetch(url, {
          cache: "no-store",
          headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
        });
        if (!resp.ok) throw new Error("fetch fail");
        data = await resp.json();
      } catch {
        if (token) {
          data = await authRequest(`/reviews/user/${id}?limit=${PAGE_SIZE}&page=${nextPage}`, token);
        } else {
          throw new Error("Não foi possível carregar mais avaliações.");
        }
      }

      const listRaw = Array.isArray(data?.reviews)
        ? data.reviews
        : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data)
            ? data
            : [];

      const normalized = listRaw.map(normalizeReviewItem).filter(Boolean);

      setReviews((prev) => {
        const combined = [...(prev || []), ...normalized];
        const map = new Map();
        combined.forEach((rv) => {
          if (!rv) return;
          const k =
            rv.reservationId && rv.authorRole
              ? `res:${rv.reservationId}:role:${rv.authorRole}`
              : `id:${rv.id}`;
          if (!map.has(k)) map.set(k, rv);
        });
        const merged = Array.from(map.values());

        safeSetLocalStorage(`reviews_user_${String(id)}`, JSON.stringify(merged));

        const next = new Set(revealedIds);
        normalized.forEach((rv) => next.add(rv.id));
        if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
        revealTimerRef.current = setTimeout(() => {
          setRevealedIds(new Set(next));
        }, 40);

        return merged;
      });

      setReviewsPage(nextPage);
      setReviewsHasMore(normalized.length === PAGE_SIZE);
    } catch (err) {
      setReviewsError(err?.message || "Erro ao carregar mais avaliações.");
    } finally {
      setReviewsLoadingMore(false);
    }
  };

  // pets do tutor logado (fonte: backend /pets)
  useEffect(() => {
    let cancelled = false;

    const loadPets = async () => {
      if (!user || user.role !== "tutor") {
        if (!cancelled) {
          setPets([]);
          setSelectedPetIds([]);
          setAllPetsSelected(false);
        }
        return;
      }

      if (token) {
        try {
          const data = await authRequest("/pets", token);
          const list = Array.isArray(data?.pets) ? data.pets : Array.isArray(data) ? data : [];

          const normalized = list.map((p) => ({ ...p, id: p?.id })).filter((p) => p?.id != null);

          if (!cancelled) {
            setPets(normalized);
            setSelectedPetIds([]);
            setAllPetsSelected(false);
          }

          try {
            localStorage.setItem(`pets_${user.id}`, JSON.stringify(normalized));
          } catch {
            // ignore
          }
          return;
        } catch (e) {
          console.error("Erro ao carregar pets do backend:", e);
        }
      }

      try {
        const storageKey = `pets_${user.id}`;
        const saved = safeJsonParse(localStorage.getItem(storageKey) || "[]", []) || [];
        if (!cancelled) {
          setPets(Array.isArray(saved) ? saved : []);
          setSelectedPetIds([]);
          setAllPetsSelected(false);
        }
      } catch {
        if (!cancelled) {
          setPets([]);
          setSelectedPetIds([]);
          setAllPetsSelected(false);
        }
      }
    };

    loadPets();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, token]);

  // mapa de preços por serviço
  const svcPriceMap = useMemo(() => getSvcPriceMap(caregiver), [caregiver]);

  // serviço default
  useEffect(() => {
    if (!caregiver) return;
    if (svc) return;

    const valid = Object.entries(caregiver.services || {})
      .filter(([k, v]) => v && (svcPriceMap[k] ?? 0) > 0)
      .map(([k]) => k);

    setSvc(valid[0] || "");
  }, [caregiver, svcPriceMap, svc]);

  // ✅ sincroniza inputs BR quando estado ISO muda (por qualquer motivo)
  useEffect(() => {
    setStartBR(startDate ? formatDateBR(startDate) : "");
  }, [startDate]);
  useEffect(() => {
    setEndBR(endDate ? formatDateBR(endDate) : "");
  }, [endDate]);

  // ---------- MEMOS ----------
  const hasAddressAccess = useMemo(() => {
    if (!user || user.role !== "tutor") return false;
    return (reservations || []).some(
      (r) =>
        String(r.tutorId) === String(user.id) &&
        String(r.caregiverId) === String(id) &&
        r.status?.toLowerCase() === "aceita"
    );
  }, [reservations, user, id]);

  const listReviews = useMemo(() => {
    if (reviewsLoading) return [];
    return reviews;
  }, [reviews, reviewsLoading]);

  const ratingSummary = useMemo(() => {
    if (!reviewsLoading) return reviewSummary;

    const fromCg = getCaregiverRatingSummary(caregiver);
    if ((fromCg.count || 0) > 0) return fromCg;

    if (!listReviews.length) return { avg: 0, count: 0 };
    const avg =
      listReviews.reduce((acc, rv) => acc + (Number(rv.rating) || 0), 0) /
      listReviews.length;
    return { avg, count: listReviews.length };
  }, [reviewsLoading, reviewSummary, listReviews, caregiver]);

  const reviewServicesInData = useMemo(() => {
    const set = new Set();
    (listReviews || []).forEach((rv) => {
      const s = rv?.service ? String(rv.service) : "";
      if (s) set.add(s);
    });
    return Array.from(set);
  }, [listReviews]);

  const filteredReviews = useMemo(() => {
    if (reviewSvcFilter === "todos") return listReviews;
    return (listReviews || []).filter((rv) => String(rv?.service || "") === String(reviewSvcFilter));
  }, [listReviews, reviewSvcFilter]);

  // ✅ total REAL de avaliações (vem do summary), independente da paginação carregada
  const totalReviewsCount = useMemo(() => {
    const total = Number(reviewSummary?.count ?? 0) || 0;
    if (total <= 0) return (listReviews || []).length;
    return total;
  }, [reviewSummary?.count, listReviews]);

  const dayDiff = (a, b) => {
    const A = parseLocalKey(a);
    const B = parseLocalKey(b);
    return Math.max(1, Math.round((B - A) / 86400000) + 1);
  };

  const total = useMemo(() => {
    const price = svcPriceMap[svc] ?? 0;
    if (!price || !startDate || !endDate) return 0;
    return dayDiff(startDate, endDate) * price;
  }, [svc, startDate, endDate, svcPriceMap]);

  // ---------- REGRAS DE DISPONIBILIDADE ----------
  const isDateAvailable = (dateStr) => {
    const key = normalizeKey(dateStr);
    if (!key) return false;
    if (!availableKeys.length) return false;
    return availableKeys.includes(key);
  };

  const rangeAvailable = (startKey, endKey) => {
    if (!startKey || !endKey) return false;
    if (!availableKeys.length) return false;

    const start = parseLocalKey(startKey);
    const end = parseLocalKey(endKey);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
    if (end < start) return false;

    const set = new Set(availableKeys);
    const cursor = new Date(start);

    while (cursor <= end) {
      const k = toLocalKey(cursor);
      if (!set.has(k)) return false;
      cursor.setDate(cursor.getDate() + 1);
    }
    return true;
  };

  // ---------- SELEÇÃO DE PETS ----------
  const togglePet = (petId) => {
    const pid = String(petId);

    setSelectedPetIds((prev) => {
      const set = new Set(prev.map(String));
      if (set.has(pid)) set.delete(pid);
      else set.add(pid);

      const next = Array.from(set);
      setAllPetsSelected(pets.length > 0 && next.length === pets.length);
      return next;
    });
  };

  const toggleAllPets = () => {
    if (!pets.length) return;

    if (allPetsSelected) {
      setAllPetsSelected(false);
      setSelectedPetIds([]);
    } else {
      const allIds = pets.map((p) => String(p.id));
      setAllPetsSelected(true);
      setSelectedPetIds(allIds);
    }
  };

  // ---------- HANDLERS DE DATA (ISO) ----------
  const handleStartChangeISO = (value) => {
    setCapacityInfo(null);

    if (!value) {
      setStartDate("");
      return;
    }

    if (!isDateAvailable(value)) {
      showToast("Este dia não está disponível para este cuidador.", "error");
      setStartDate("");
      return;
    }

    setStartDate(value);

    if (endDate) {
      if (parseLocalKey(endDate) < parseLocalKey(value)) {
        showToast("A data de saída não pode ser antes da entrada.", "error");
        setEndDate("");
        return;
      }
      if (!rangeAvailable(value, endDate)) {
        showToast("Nem todas as datas desse intervalo estão disponíveis. Ajuste o período.", "error");
        setEndDate("");
      }
    }
  };

  const handleEndChangeISO = (value) => {
    setCapacityInfo(null);

    if (!value) {
      setEndDate("");
      return;
    }

    if (!startDate) {
      showToast("Escolha primeiro a data de entrada.", "error");
      setEndDate("");
      return;
    }
    if (parseLocalKey(value) < parseLocalKey(startDate)) {
      showToast("A data de saída não pode ser antes da entrada.", "error");
      setEndDate("");
      return;
    }
    if (!rangeAvailable(startDate, value)) {
      showToast("Há dias sem disponibilidade neste intervalo. Escolha outro período.", "error");
      setEndDate("");
      return;
    }
    setEndDate(value);
  };

  // ---------- HANDLERS DE DATA (BR - input) ----------
  const onStartBRChange = (raw) => {
    setCapacityInfo(null);
    const masked = maskDateBRInput(raw);
    setStartBR(masked);

    // só converte quando estiver completo
    if (masked.length < 10) {
      setStartDate("");
      if (endDate) setEndDate("");
      return;
    }

    if (!isValidDateBR(masked)) {
      showToast("Data de entrada inválida.", "error");
      setStartDate("");
      if (endDate) setEndDate("");
      return;
    }

    const iso = dateBRToLocalKey(masked);
    handleStartChangeISO(iso);
  };

  const onEndBRChange = (raw) => {
    setCapacityInfo(null);
    const masked = maskDateBRInput(raw);
    setEndBR(masked);

    if (masked.length < 10) {
      setEndDate("");
      return;
    }

    if (!isValidDateBR(masked)) {
      showToast("Data de saída inválida.", "error");
      setEndDate("");
      return;
    }

    const iso = dateBRToLocalKey(masked);
    handleEndChangeISO(iso);
  };

  const onBlurStartBR = () => {
    // se estiver incompleto, limpa tudo
    if (startBR && startBR.length < 10) {
      setStartBR("");
      setStartDate("");
      setEndBR("");
      setEndDate("");
      return;
    }

    // se estiver completo, força sincronizar formato (ex: "1/2/2026" não acontece pq máscara)
    if (startBR && startBR.length === 10 && isValidDateBR(startBR)) {
      const iso = dateBRToLocalKey(startBR);
      setStartDate(iso);
    }
  };

  const onBlurEndBR = () => {
    if (endBR && endBR.length < 10) {
      setEndBR("");
      setEndDate("");
      return;
    }

    if (endBR && endBR.length === 10 && isValidDateBR(endBR)) {
      const iso = dateBRToLocalKey(endBR);
      setEndDate(iso);
    }
  };

  // ---------- ACTIONS ----------
  const handlePreReserva = async () => {
    if (saving) return;

    setCapacityInfo(null);

    if (!user || user.role !== "tutor") {
      showToast("Faça login como tutor para reservar.", "error");
      navigate("/login");
      return;
    }

    if (!token) {
      showToast("Sessão expirada. Faça login novamente.", "error");
      navigate("/login");
      return;
    }

    if (!caregiver || !svc || !svcPriceMap[svc]) {
      showToast("Selecione um serviço com preço definido.", "error");
      return;
    }
    if (!startDate || !endDate) {
      showToast("Informe o período da estadia.", "error");
      return;
    }
    if (parseLocalKey(endDate) < parseLocalKey(startDate)) {
      showToast("A data final não pode ser menor que a inicial.", "error");
      return;
    }
    if (!rangeAvailable(startDate, endDate)) {
      showToast("Datas indisponíveis para este cuidador.", "error");
      return;
    }

    // ✅ se não tem pet cadastrado, avisa e leva pro painel de pets
    if (!Array.isArray(pets) || pets.length === 0) {
      showToast(
        "Para fazer a pré-reserva, você precisa cadastrar pelo menos 1 pet em “Meus Pets”. 🐾",
        "notify"
      );
      navigate("/dashboard", { state: { initialTab: "pets" } });
      return;
    }

    // ✅ se tem pets cadastrados, precisa selecionar pelo menos 1
    if (!Array.isArray(selectedPetIds) || selectedPetIds.length === 0) {
      showToast("Selecione pelo menos 1 pet para enviar a pré-reserva. 🐾", "error");
      return;
    }

    try {
      setSaving(true);

      const selectedIdSet = new Set((selectedPetIds || []).map(String));
      const selectedPets = (pets || []).filter((p) => selectedIdSet.has(String(p?.id)));

      const petsSummary = selectedPets
        .map((p) => p?.name)
        .filter(Boolean)
        .join(", ");

      const petsIdsClean = Array.from(selectedIdSet)
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n) && Number.isInteger(n));

      if (pets.length > 0 && petsIdsClean.length === 0) {
        showToast("Selecione pelo menos 1 pet válido para reservar.", "error");
        return;
      }

      const petsSnapshot = await buildPetsSnapshot(selectedPets);

      const payload = {
        caregiverId: String(caregiver.id),
        tutorId: String(user.id),
        caregiver_id: String(caregiver.id),
        tutor_id: String(user.id),

        tutorName: user.name || user.email || "Tutor",
        caregiverName: caregiver.name,
        tutor_name: user.name || user.email || "Tutor",
        caregiver_name: caregiver.name,

        city: caregiver.city || "",
        neighborhood: caregiver.neighborhood || "",

        service: svc,

        pricePerDay: Number(svcPriceMap[svc] || 0),
        price_per_day: Number(svcPriceMap[svc] || 0),

        startDate,
        endDate,
        start_date: startDate,
        end_date: endDate,

        total: Number(total || 0),

        petsIds: petsIdsClean,
        pets_ids: petsIdsClean,
        petsNames: petsSummary,
        pets_names: petsSummary,

        petsSnapshot,
        pets_snapshot: petsSnapshot,
      };

      const data = await authRequest("/reservations", token, {
        method: "POST",
        body: payload,
      });

      const created = data?.reservation || data;
      const newId = created?.id ? String(created.id) : String(Date.now());

      // ✅ monta reserva LOCAL “completa”, inclusive petsSnapshot
      const newRes = {
        id: newId,

        tutorId: String(user.id),
        tutor_id: String(user.id),
        tutorName: user.name || user.email || "Tutor",
        tutor_name: user.name || user.email || "Tutor",

        caregiverId: String(caregiver.id),
        caregiver_id: String(caregiver.id),
        caregiverName: caregiver.name,
        caregiver_name: caregiver.name,

        city: caregiver.city || "",
        neighborhood: caregiver.neighborhood || "",

        startDate,
        endDate,
        start_date: startDate,
        end_date: endDate,

        service: svc,

        pricePerDay: Number(svcPriceMap[svc] || 0),
        price_per_day: Number(svcPriceMap[svc] || 0),

        total: Number(total || 0),
        status: "Pendente",

        petsIds: petsIdsClean,
        pets_ids: petsIdsClean,
        petsNames: petsSummary,
        pets_names: petsSummary,

        petsSnapshot,
        pets_snapshot: petsSnapshot,
      };

      // ✅ salva na chave NOVA + mantém legado
      const allNew = safeJsonParse(localStorage.getItem(reservationsStorageKey) || "[]", []) || [];
      const nextNew = [newRes, ...allNew.filter((r) => String(r?.id) !== String(newId))];
      safeSetLocalStorage(reservationsStorageKey, JSON.stringify(nextNew));

      const allOld = safeJsonParse(localStorage.getItem("reservations") || "[]", []) || [];
      const nextOld = [newRes, ...allOld.filter((r) => String(r?.id) !== String(newId))];
      safeSetLocalStorage("reservations", JSON.stringify(nextOld));

      setReservations(nextNew);

      showToast("Pré-reserva enviada! 🎉", "success");
      navigate(`/reserva/${newId}`, { replace: true });
    } catch (err) {
      console.error("Erro ao enviar pré-reserva:", err);

      const msg = err?.message || "Erro ao enviar pré-reserva. Tente novamente.";

      const code = err?.code || err?.data?.code;
      const capacity = err?.capacity ?? err?.data?.capacity;
      const overlapping = err?.overlapping ?? err?.data?.overlapping;

      if (
        code === "CAPACITY_FULL" ||
        (typeof msg === "string" &&
          (msg.toLowerCase().includes("capacidade") ||
            msg.toLowerCase().includes("agenda cheia")))
      ) {
        const capNum = Number(capacity);
        const ovNum = Number(overlapping);

        if (Number.isFinite(capNum) && Number.isFinite(ovNum)) {
          setCapacityInfo({ capacity: capNum, overlapping: ovNum });
          showToast(`Agenda cheia nesse período (${ovNum}/${capNum}).`, "error");
        } else {
          showToast("Agenda cheia nesse período. Tente outras datas.", "error");
        }

        setEndDate("");
        setEndBR("");
        return;
      }

      showToast(msg, "error");

      if (
        typeof msg === "string" &&
        (msg.toLowerCase().includes("disponibilidade") || msg.toLowerCase().includes("conflit"))
      ) {
        setEndDate("");
        setEndBR("");
      }
    } finally {
      setSaving(false);
    }
  };

  const openMaps = () => {
    const q = encodeURIComponent([caregiver?.neighborhood, caregiver?.city].filter(Boolean).join(", "));
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, "_blank");
  };

  // ---------- RENDER ----------
  if (caregiverLoading && !caregiverLoaded) {
    return (
      <div className="bg-[#EBCBA9] min-h-[calc(100vh-120px)] flex items-center justify-center">
        <div className="pc-card pc-card-accent">Carregando cuidador...</div>
      </div>
    );
  }

  if (!caregiver && caregiverLoaded) {
    return (
      <div className="bg-[#EBCBA9] min-h-[calc(100vh-120px)] flex items-center justify-center">
        <div className="pc-card pc-card-accent">Cuidador não encontrado.</div>
      </div>
    );
  }

  const pricedServices = Object.keys(caregiver.services || {}).filter(
    (k) => caregiver.services[k] && (svcPriceMap[k] ?? 0) > 0
  );

  return (
    <div className="bg-[#EBCBA9] min-h-[calc(100vh-120px)] py-8 px-6">
      <div className="max-w-[1400px] mx-auto bg-white rounded-2xl shadow p-6 border-l-4 border-[#FFD700]/80">
        {/* Header (ajustado no mobile, web intacto) */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-6">
          <div className="flex items-start gap-4">
            <img
              src={caregiver.image || DEFAULT_IMG}
              alt={caregiver.name}
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-4 border-[#FFD700]"
            />

            {/* Nome + Local (mobile fica mais “clean”) */}
            <div className="flex-1 min-w-0 sm:hidden">
              <h1 className="text-xl font-bold text-[#5A3A22] leading-tight break-words">
                {caregiver.name}
              </h1>

              <p className="text-sm text-[#5A3A22]/80 leading-snug mt-1">
                {caregiver.displayLocation || "Local não informado"}
              </p>

              {hasAddressAccess && caregiver.address && (
                <p className="text-xs text-[#5A3A22] mt-2 leading-snug">
                  <b>Endereço completo: </b>
                  <span className="break-words">{caregiver.address}</span>
                </p>
              )}
            </div>
          </div>

          {/* Web (mantém exatamente o layout antigo: infos no meio e bloco na direita) */}
          <div className="hidden sm:block flex-1">
            <h1 className="text-2xl font-bold text-[#5A3A22]">{caregiver.name}</h1>
            <p className="text-[#5A3A22]/80">
              {caregiver.displayLocation || "Local não informado"}
            </p>

            {hasAddressAccess && caregiver.address && (
              <p className="text-sm text-[#5A3A22] mt-1">
                <b>Endereço completo: </b>
                {caregiver.address}
              </p>
            )}
          </div>

          {/* Nota + Preço */}
          <div
            className="
              w-full sm:w-auto
              flex items-center justify-between
              sm:block sm:text-right
              gap-4
              mt-1 sm:mt-0
              px-3 py-2 sm:px-0 sm:py-0
              rounded-xl sm:rounded-none
              bg-[#FFF8F0] sm:bg-transparent
              border border-[#5A3A22]/10 sm:border-0
            "
          >
            <p className="text-sm text-[#5A3A22] whitespace-nowrap">
              ⭐ <b>{(ratingSummary.avg || 0).toFixed(1)}</b> ({ratingSummary.count})
            </p>

            {caregiver.minPrice != null && (
              <p className="text-sm text-[#5A3A22] whitespace-nowrap">
                A partir de <b>R$ {Number(caregiver.minPrice).toFixed(2)}</b>
              </p>
            )}
          </div>
        </div>

        {/* Chips de serviços ativos */}
        <div className="flex flex-wrap gap-2 mb-6">
          {Object.entries(caregiver.services || {})
            .filter(([, v]) => v)
            .map(([k]) => (
              <span
                key={k}
                className="text-xs px-2 py-1 rounded-full bg-[#FFF6CC] text-[#5A3A22] border"
              >
                {serviceLabel(k)}
              </span>
            ))}
        </div>

        {/* Sobre + Cursos */}
        {(() => {
          const aboutText =
            (caregiver?.bio && String(caregiver.bio).trim()) ||
            (caregiver?.about && String(caregiver.about).trim()) ||
            "";

          let coursesList = [];
          const rawCourses =
            caregiver?.courses ??
            caregiver?.cursos ??
            caregiver?.course ??
            caregiver?.training ??
            caregiver?.trainings ??
            caregiver?.certificates ??
            caregiver?.certs ??
            null;

          try {
            if (typeof rawCourses === "string") {
              const txt = rawCourses.trim();

              if (txt.startsWith("[") || txt.startsWith("{")) {
                const parsed = JSON.parse(txt);
                if (Array.isArray(parsed)) coursesList = parsed;
                else if (parsed && typeof parsed === "object") coursesList = Object.values(parsed);
              } else {
                coursesList = txt
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
              }
            } else if (Array.isArray(rawCourses)) {
              coursesList = rawCourses;
            } else if (rawCourses && typeof rawCourses === "object") {
              coursesList = Object.values(rawCourses);
            }
          } catch {
            if (typeof rawCourses === "string" && rawCourses.trim()) coursesList = [rawCourses.trim()];
          }

          coursesList = coursesList
            .map((c) => (c == null ? "" : String(c).trim()))
            .filter(Boolean);

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              <div className="pc-card pc-card-accent">
                <h2 className="font-semibold text-[#5A3A22] mb-2">Sobre</h2>
                <p className="text-sm text-[#5A3A22]/90 whitespace-pre-line">
                  {aboutText || "Não informado"}
                </p>
              </div>

              <div className="pc-card pc-card-accent">
                <h2 className="font-semibold text-[#5A3A22] mb-2">Cursos</h2>

                {coursesList.length > 0 ? (
                  <ul className="list-disc pl-5 space-y-1 text-sm text-[#5A3A22]/90">
                    {coursesList.map((c, idx) => (
                      <li key={`${c}-${idx}`}>{c}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[#5A3A22]/70">Não informado</p>
                )}
              </div>
            </div>
          );
        })()}

        {/* Galeria de fotos do cuidador */}
        <section className="pc-card pc-card-accent mb-6">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="font-semibold text-[#5A3A22]">Fotos</h2>
            {!galleryLoading && !galleryError && (
              <span className="text-xs text-[#5A3A22] opacity-70">
                {galleryPhotos.length} foto(s)
              </span>
            )}
          </div>

          {galleryLoading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-xl bg-gray-200 animate-pulse" />
              ))}
            </div>
          ) : galleryError ? (
            <p className="text-sm text-[#95301F] font-semibold">{galleryError}</p>
          ) : galleryPhotos.length === 0 ? (
            <p className="text-sm text-[#5A3A22]/80">Este cuidador ainda não adicionou fotos.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3">
              {galleryPhotos.map((p, idx) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openPhoto(p, idx)}
                  className="
        group relative overflow-hidden
        rounded-2xl border border-[#5A3A22]/15 bg-white
        aspect-[4/3] sm:aspect-square
        active:scale-[0.99] transition
      "
                  title={p.caption ? p.caption : "Ver foto"}
                >
                  <img
                    src={p.photo_url}
                    alt={p.caption ? p.caption : "Foto do cuidador"}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
                    loading="lazy"
                  />

                  {/* overlay leve pra leitura da legenda */}
                  {p.caption ? (
                    <div className="absolute left-0 right-0 bottom-0 px-2 py-1 text-[11px] sm:text-xs text-white bg-gradient-to-t from-black/70 to-black/0 text-left line-clamp-2">
                      {p.caption}
                    </div>
                  ) : null}

                  {/* micro “dica” no mobile */}
                  <div className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full bg-black/45 text-white opacity-0 group-hover:opacity-100 transition">
                    {idx + 1}/{galleryPhotos.length}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Modal de foto + navegação */}
        {galleryOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3 sm:p-4"
            onClick={closePhoto}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="max-w-3xl w-full bg-white rounded-2xl overflow-hidden shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#5A3A22] truncate">
                    {activePhoto?.caption ? activePhoto.caption : "Foto do cuidador"}
                  </p>
                  {!!galleryPhotos.length && (
                    <p className="text-[11px] text-[#5A3A22]/70 mt-0.5">
                      {activePhotoIndex + 1} de {galleryPhotos.length}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={closePhoto}
                  className="text-[#5A3A22] font-bold px-2 py-1 rounded hover:bg-gray-100"
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>

              <div className="relative bg-black">
                {/* seta esquerda */}
                {galleryPhotos.length > 1 && (
                  <button
                    type="button"
                    onClick={goPrevPhoto}
                    className="
              absolute left-2 sm:left-3 top-1/2 -translate-y-1/2
              w-10 h-10 rounded-full
              bg-white/85 hover:bg-white
              text-[#5A3A22] font-bold
              flex items-center justify-center
              shadow
            "
                    aria-label="Foto anterior"
                    title="Anterior"
                  >
                    ‹
                  </button>
                )}

                <img
                  src={activePhoto?.photo_url}
                  alt={activePhoto?.caption ? activePhoto.caption : "Foto do cuidador"}
                  className="w-full max-h-[70vh] object-contain"
                />

                {/* seta direita */}
                {galleryPhotos.length > 1 && (
                  <button
                    type="button"
                    onClick={goNextPhoto}
                    className="
              absolute right-2 sm:right-3 top-1/2 -translate-y-1/2
              w-10 h-10 rounded-full
              bg-white/85 hover:bg-white
              text-[#5A3A22] font-bold
              flex items-center justify-center
              shadow
            "
                    aria-label="Próxima foto"
                    title="Próxima"
                  >
                    ›
                  </button>
                )}

                {/* bolinhas (mobile-first) */}
                {galleryPhotos.length > 1 && (
                  <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1.5 px-3">
                    {galleryPhotos.slice(0, 10).map((p, i) => {
                      const idx = i; // aqui é 0..9 (só preview)
                      const isActive = idx === activePhotoIndex;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setActivePhotoIndex(idx)}
                          className={`w-2 h-2 rounded-full transition ${isActive ? "bg-[#FFD700]" : "bg-white/70 hover:bg-white"
                            }`}
                          aria-label={`Ir para foto ${idx + 1}`}
                          title={`Foto ${idx + 1}`}
                        />
                      );
                    })}
                    {galleryPhotos.length > 10 && (
                      <span className="text-[11px] text-white/80 ml-1">
                        +{galleryPhotos.length - 10}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {activePhoto?.caption ? (
                <div className="px-4 py-3 text-sm text-[#5A3A22]">
                  {activePhoto.caption}
                </div>
              ) : null}

              {/* ações rápidas no mobile */}
              {galleryPhotos.length > 1 && (
                <div className="sm:hidden flex items-center justify-between gap-2 px-4 pb-4">
                  <button
                    type="button"
                    onClick={goPrevPhoto}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-[#5A3A22] px-4 py-2 rounded-lg font-semibold"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={goNextPhoto}
                    className="flex-1 bg-[#FFD700] hover:bg-[#FFEA70] text-[#5A3A22] px-4 py-2 rounded-lg font-semibold"
                  >
                    Próxima
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* dica disponibilidade */}
        <div className="mb-4">
          <p className="text-xs text-[#5A3A22] opacity-70">
            Datas disponíveis cadastradas: <b>{availableKeys.length}</b>
          </p>

          {(() => {
            const t = String(todayKey || "").slice(0, 10);
            const keys = Array.isArray(availableKeys) ? availableKeys : [];
            const next = [];
            const past = [];

            keys.forEach((k) => {
              const kk = String(k || "").slice(0, 10);
              if (!kk) return;
              if (kk >= t) next.push(kk);
              else past.push(kk);
            });

            next.sort();
            past.sort().reverse();

            const nextDates = next.slice(0, 3);
            const pastDates = past.slice(0, 3);

            return (
              <>
                {nextDates.length > 0 && (
                  <div className="mt-2 text-sm text-[#5A3A22]">
                    <div className="font-semibold">Próximas datas</div>
                    <div>{nextDates.map((d) => formatDateBR(d)).join(", ")}</div>
                  </div>
                )}

                {pastDates.length > 0 && (
                  <div className="mt-2 text-sm text-[#5A3A22] opacity-80">
                    <div className="font-semibold">Datas passadas</div>
                    <div>{pastDates.map((d) => formatDateBR(d)).join(", ")}</div>
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Pré-reserva */}
        <section className="pc-card pc-card-accent mb-6">
          <h2 className="font-semibold text-[#5A3A22] mb-3">Fazer pré-reserva</h2>

          {pricedServices.length === 0 ? (
            <p className="text-[#5A3A22]">Este cuidador ainda não definiu preços para os serviços.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <select value={svc} onChange={(e) => setSvc(e.target.value)} className="input">
                  {pricedServices.map((k) => (
                    <option key={k} value={k}>
                      {serviceLabel(k)} — R$ {Number(svcPriceMap[k]).toFixed(2)}/
                      {k === "passeios" ? "h" : "dia"}
                    </option>
                  ))}
                </select>

                {/* ✅ Input BR: Entrada */}
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="DD/MM/AAAA"
                  value={startBR}
                  onChange={(e) => onStartBRChange(e.target.value)}
                  onBlur={onBlurStartBR}
                  className="input"
                />

                {/* ✅ Input BR: Saída */}
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="DD/MM/AAAA"
                  value={endBR}
                  onChange={(e) => onEndBRChange(e.target.value)}
                  onBlur={onBlurEndBR}
                  className="input"
                />

                <div className="flex items-center px-3 py-2 rounded-lg border text-[#5A3A22]">
                  Total: <b className="ml-1">R$ {Number(total || 0).toFixed(2)}</b>
                </div>

                <button
                  onClick={handlePreReserva}
                  disabled={saving}
                  className="bg-[#5A3A22] hover:bg-[#95301F] disabled:opacity-60 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-semibold"
                >
                  {saving ? "Enviando..." : "Enviar pré-reserva"}
                </button>
              </div>

              {/* ✅ ajuda visual: mostra ISO convertido no padrão BR (opcional e leve) */}
              <div className="mt-2 text-xs text-[#5A3A22] opacity-70">
                {startDate ? (
                  <span>
                    Entrada: <b>{formatDateBR(startDate)}</b>
                  </span>
                ) : (
                  <span>Entrada: —</span>
                )}
                {"  "}•{"  "}
                {endDate ? (
                  <span>
                    Saída: <b>{formatDateBR(endDate)}</b>
                  </span>
                ) : (
                  <span>Saída: —</span>
                )}
              </div>

              {capacityInfo && (
                <p className="mt-3 text-xs text-[#95301F]">
                  Agenda cheia nesse período (
                  <b>
                    {capacityInfo.overlapping}/{capacityInfo.capacity}
                  </b>
                  ). Tente outras datas.
                </p>
              )}

              {pets.length > 0 ? (
                <div className="mt-4 border rounded-xl p-4 bg-[#FFF8F0]">
                  <h3 className="font-semibold text-[#5A3A22] mb-2">Qual pet vai nessa reserva?</h3>
                  <p className="text-xs text-[#5A3A22] opacity-80 mb-2">
                    Você pode escolher um ou mais pets cadastrados no seu perfil.
                  </p>

                  <button
                    type="button"
                    onClick={toggleAllPets}
                    className={`mb-3 px-3 py-1 rounded-full text-xs font-semibold border transition ${allPetsSelected
                      ? "bg-[#5A3A22] text-white border-[#5A3A22]"
                      : "bg-white text-[#5A3A22] border-[#D2A679] hover:bg-[#FFF3D0]"
                      }`}
                  >
                    {allPetsSelected ? "Desmarcar todos" : "Selecionar todos os pets"}
                  </button>

                  <div className="flex flex-wrap gap-2">
                    {pets.map((pet) => {
                      const active = selectedPetIds.map(String).includes(String(pet.id));

                      return (
                        <button
                          key={pet.id}
                          type="button"
                          onClick={() => togglePet(pet.id)}
                          className={`px-3 py-2 rounded-xl text-xs md:text-sm border flex items-center gap-2 transition ${active
                            ? "bg-[#5A3A22] text-white border-[#5A3A22]"
                            : "bg-white text-[#5A3A22] border-[#D2A679] hover:bg-[#FFF3D0]"
                            }`}
                        >
                          <img
                            src={pickPetImage(pet) || "/paw.png"}
                            alt={pet.name}
                            className="w-8 h-8 rounded-full object-cover border border-[#FFD700]"
                          />
                          <span className="font-semibold">{pet.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-[#5A3A22] opacity-80">
                  Cadastre seus pets no painel <b>Meus Pets</b> para selecioná-los aqui na pré-reserva.
                </p>
              )}
            </>
          )}

          <p className="text-xs text-[#5A3A22] mt-2">
            * O endereço completo só é exibido após a reserva ser <b>Aceita</b>. Antes disso, apenas{" "}
            <b>bairro</b> e <b>cidade</b> ficam visíveis.
          </p>
        </section>

        {/* Ações secundárias */}
        <div className="flex flex-wrap gap-2 mb-2">
          <button
            type="button"
            onClick={openMaps}
            className="bg-gray-200 hover:bg-gray-300 text-[#5A3A22] px-4 py-2 rounded-lg font-semibold shadow-md transition"
          >
            Ver no mapa
          </button>
        </div>

        <p className="text-xs text-[#5A3A22] opacity-80 mb-8">
          O chat interno fica disponível nos <b>detalhes da reserva</b> assim que ela for <b>Aceita</b> e
          permanece liberado por até <b>24 horas após o término</b>. Depois disso, para iniciar uma nova
          conversa, é preciso fazer uma nova reserva com este cuidador.
        </p>

        {/* Avaliações */}
        <section>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
            <h2 className="text-xl font-semibold text-[#5A3A22]">Avaliações</h2>

            {reviewServicesInData.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#5A3A22] opacity-80">Filtrar:</span>
                <select
                  value={reviewSvcFilter}
                  onChange={(e) => setReviewSvcFilter(e.target.value)}
                  className="border rounded-lg px-3 py-2 bg-white text-sm"
                >
                  <option value="todos">Todos</option>
                  {reviewServicesInData.map((s) => (
                    <option key={s} value={s}>
                      {serviceLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {reviewsLoading ? (
            <div className="grid gap-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="pc-card pc-card-accent animate-pulse">
                  <div className="h-4 w-52 bg-gray-200 rounded mb-2" />
                  <div className="h-3 w-72 bg-gray-200 rounded mb-2" />
                  <div className="h-3 w-56 bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          ) : reviewsError ? (
            <div className="pc-card pc-card-accent">
              <p className="text-sm text-[#95301F] font-semibold">{reviewsError}</p>
              <p className="text-xs text-[#5A3A22] opacity-80 mt-1">Recarregue a página ou tente novamente.</p>
            </div>
          ) : filteredReviews.length === 0 ? (
            <p className="text-[#5A3A22]">
              Ainda não há avaliações{reviewSvcFilter !== "todos" ? " para esse serviço" : ""}.
            </p>
          ) : (
            <>
              <p className="text-xs text-[#5A3A22] opacity-70 mb-3">
                Mostrando <b>{filteredReviews.length}</b> de <b>{totalReviewsCount}</b> avaliações
                {reviewSvcFilter !== "todos" ? (
                  <>
                    {" "}
                    para <b>{serviceLabel(reviewSvcFilter)}</b>
                  </>
                ) : null}
                .
              </p>

              <div className="grid gap-3">
                {filteredReviews
                  .slice()
                  .sort((a, b) => {
                    const da = a.createdAt ? parseLocalKey(String(a.createdAt).slice(0, 10)) : new Date(0);
                    const db = b.createdAt ? parseLocalKey(String(b.createdAt).slice(0, 10)) : new Date(0);
                    return db - da;
                  })
                  .map((rv) => {
                    const revealed = revealedIds.has(rv.id);
                    return (
                      <div
                        key={rv.id}
                        className={`pc-card pc-card-accent transition-all duration-300 ${revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
                          }`}
                      >
                        <p className="text-sm text-[#5A3A22]/80">
                          <b>{rv.authorName || "Usuário"}</b> — {rv.rating} ★ —{" "}
                          {rv.createdAt ? formatDateBR(String(rv.createdAt).slice(0, 10)) : ""}
                          {rv.service ? (
                            <span className="opacity-70"> • {serviceLabel(String(rv.service))}</span>
                          ) : null}
                        </p>
                        {rv.comment && <p className="mt-1">{rv.comment}</p>}
                      </div>
                    );
                  })}
              </div>

              <div className="mt-4 flex flex-col items-center gap-2">
                {reviewsLoadingMore && <p className="text-xs text-[#5A3A22] opacity-70">Carregando mais…</p>}

                {reviewsHasMore && reviewSvcFilter === "todos" && (
                  <button
                    type="button"
                    onClick={handleLoadMoreReviews}
                    disabled={reviewsLoadingMore}
                    className="bg-[#FFD700] hover:bg-[#FFEA70] disabled:opacity-60 disabled:cursor-not-allowed text-[#5A3A22] px-4 py-2 rounded-lg font-semibold shadow"
                  >
                    {reviewsLoadingMore ? "Carregando..." : "Ver mais avaliações"}
                  </button>
                )}

                {!reviewsHasMore && listReviews.length > 0 && reviewSvcFilter === "todos" && (
                  <p className="text-xs text-[#5A3A22] opacity-60">Você chegou ao fim das avaliações.</p>
                )}

                {reviewSvcFilter !== "todos" && (
                  <p className="text-xs text-[#5A3A22] opacity-60">
                    Para paginar, selecione <b>“Todos”</b>.
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
