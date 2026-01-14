// src/pages/CaregiverDetail.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ToastProvider";
import { toLocalKey, parseLocalKey, formatDateBR } from "../utils/date";
import {
  normalizeCaregiver,
  getSvcPriceMap,
  serviceLabel,
  DEFAULT_IMG,
} from "../utils/normalize";
import { authRequest } from "../services/api";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export default function CaregiverDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { showToast } = useToast();

  const [caregiver, setCaregiver] = useState(null);

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

  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);

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
  const toNum = (v) => {
    if (v == null || v === "") return null;
    const n = Number(v);
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

    const createdAt =
      rv.created_at
        ? String(rv.created_at)
        : rv.createdAt
          ? String(rv.createdAt)
          : rv.date
            ? String(rv.date)
            : null;

    const rating = Number(rv.rating ?? rv.stars ?? rv.nota ?? 0);

    const service =
      rv.service ?? rv.service_key ?? rv.serviceKey ?? rv.svc ?? null;

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
      toNum(cg.avgRating) ??
      toNum(cg.ratingAvg) ??
      toNum(cg.avg_rating) ??
      toNum(cg.rating_avg) ??
      toNum(cg.average_rating) ??
      0;

    const count =
      toNum(cg.ratingCount) ??
      toNum(cg.reviewsCount) ??
      toNum(cg.rating_count) ??
      toNum(cg.reviews_count) ??
      toNum(cg.count_reviews) ??
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
          const flag =
            x.is_available ?? x.isAvailable ?? x.available ?? x.isAvailableDay;
          return flag === true;
        })
        .map((x) =>
          normalizeKey(
            x.date_key ?? x.dateKey ?? x.date ?? x.day ?? x.value ?? x.key
          )
        )
        .filter(Boolean);

      return uniqSort(keys);
    }

    const raw = listB.length ? listB : listC;
    if (raw.length) return uniqSort(raw);

    return [];
  };

  // ---------------- LOAD reservations + caregiver + availability ----------------
  useEffect(() => {
    let cancelled = false;

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
              pricePerDay: Number(r.price_per_day || 0),
              startDate: r.start_date ? String(r.start_date).slice(0, 10) : "",
              endDate: r.end_date ? String(r.end_date).slice(0, 10) : "",
              total: Number(r.total || 0),
              status: r.status || "Pendente",
              tutorRating: r.tutor_rating,
              tutorReview: r.tutor_review,
              caregiverRating: r.caregiver_rating,
              caregiverReview: r.caregiver_review,
              petsIds: r.pets_ids || [],
              petsNames: r.pets_names || "",
            }));

            if (!cancelled) {
              setReservations(normalized);
              safeSetLocalStorage("reservations", JSON.stringify(normalized));
            }
            return;
          }
        }
      } catch {
        // fallback local
      }

      const local =
        safeJsonParse(localStorage.getItem("reservations") || "[]", []) || [];
      if (!cancelled) setReservations(Array.isArray(local) ? local : []);
    };

    const loadCaregiver = async () => {
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
          const users =
            safeJsonParse(localStorage.getItem("users") || "[]", []) || [];
          const found = users.find(
            (u) =>
              String(u.id) === String(id) &&
              u.role === "caregiver" &&
              !u.blocked
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

      if (cg) {
        try {
          const users =
            safeJsonParse(localStorage.getItem("users") || "[]", []) || [];
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
          const users =
            safeJsonParse(localStorage.getItem("users") || "[]", []) || [];
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
            const users =
              safeJsonParse(localStorage.getItem("users") || "[]", []) || [];
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
  }, [id, token, user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const avgOut =
        Number(summary?.avgRating ?? summary?.avg ?? summary?.average ?? 0) || 0;
      const countOut =
        Number(summary?.count ?? summary?.total ?? summary?.qtd ?? 0) || 0;
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
          safeSetLocalStorage(
            `reviews_summary_${String(id)}`,
            JSON.stringify(payload)
          );
          return;
        }
      } catch {
        // ignore
      }

      // auth fallback (se um dia você proteger)
      if (token) {
        try {
          const data = await authRequest(`/reviews/summary/${id}`, token);
          const payload = pickSummary(data);
          if (!cancelled) setReviewSummary(payload);
          safeSetLocalStorage(
            `reviews_summary_${String(id)}`,
            JSON.stringify(payload)
          );
        } catch {
          // ignore
        }
      }
    };

    const loadPage = async (page) => {
      // seu backend aceita /reviews/user/:id?limit=5&page=1 (como no print)
      const url = `${API_BASE_URL}/reviews/user/${id}?limit=${PAGE_SIZE}&page=${page}`;

      const r = await tryFetchJson(url);
      if (!r.ok) {
        // tenta auth se necessário
        if (token) {
          try {
            const data = await authRequest(
              `/reviews/user/${id}?limit=${PAGE_SIZE}&page=${page}`,
              token
            );
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

        // fallback: se summary veio zerado, calcula por lista
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

        // cache local (lista)
        safeSetLocalStorage(`reviews_user_${String(id)}`, JSON.stringify(merged));

        // animação de entrada
        if (!cancelled) {
          const next = new Set();
          merged.forEach((rv) => next.add(rv.id));
          // revela no próximo tick
          revealTimerRef.current = setTimeout(() => {
            if (!cancelled) setRevealedIds(next);
          }, 40);
        }
      } catch (err) {
        // fallback cache
        try {
          const cached = safeJsonParse(
            localStorage.getItem(`reviews_user_${String(id)}`) || "[]",
            []
          );
          const cachedSummary = safeJsonParse(
            localStorage.getItem(`reviews_summary_${String(id)}`) || "{}",
            {}
          );

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

            if (
              cachedSummary &&
              (cachedSummary.avg != null || cachedSummary.count != null)
            ) {
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
      cancelled = true;
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
          data = await authRequest(
            `/reviews/user/${id}?limit=${PAGE_SIZE}&page=${nextPage}`,
            token
          );
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
        // dedupe (res+role > id)
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

        // cache atualizado
        safeSetLocalStorage(
          `reviews_user_${String(id)}`,
          JSON.stringify(merged)
        );

        // animação: revela novos ids
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

  // pets do tutor logado (server-first: GET /pets + fallback local)
  useEffect(() => {
    let cancelled = false;

    const clearPets = () => {
      if (cancelled) return;
      setPets([]);
      setSelectedPetIds([]);
      setAllPetsSelected(false);
    };

    const normalizePet = (p) => {
      if (!p) return null;
      return {
        ...p,
        id: p.id != null ? String(p.id) : p.id,
        name: p.name ?? p.nome ?? "",
        image: p.image ?? p.photo ?? p.img ?? null,
        photo: p.photo ?? p.image ?? null,
      };
    };

    const loadPets = async () => {
      if (!user || user.role !== "tutor") {
        clearPets();
        return;
      }

      const storageKey = `pets_${user.id}`;

      // 1) fonte de verdade: backend
      if (token) {
        try {
          const data = await authRequest("/pets", token);
          const listRaw = Array.isArray(data?.pets)
            ? data.pets
            : Array.isArray(data)
              ? data
              : [];

          const normalized = listRaw.map(normalizePet).filter(Boolean);

          if (!cancelled) {
            setPets(normalized);
            setSelectedPetIds([]);
            setAllPetsSelected(false);
          }

          // cache local (compat / offline)
          try {
            localStorage.setItem(storageKey, JSON.stringify(normalized));
          } catch {
            // ignore
          }

          return;
        } catch {
          // cai no fallback local
        }
      }

      // 2) fallback localStorage
      try {
        const saved = safeJsonParse(localStorage.getItem(storageKey) || "[]", []) || [];
        const normalized = (Array.isArray(saved) ? saved : [])
          .map(normalizePet)
          .filter(Boolean);

        if (!cancelled) {
          setPets(normalized);
          setSelectedPetIds([]);
          setAllPetsSelected(false);
        }
      } catch {
        clearPets();
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

  // ✅ lista de reviews para render (backend first, fallback legado)
  const listReviews = useMemo(() => {
    if (reviewsLoading) return [];
    return reviews;
  }, [reviews, reviewsLoading]);


  // ✅ summary final
  const ratingSummary = useMemo(() => {
    // se backend já respondeu summary (ou mesmo se não), usa reviewSummary
    if (!reviewsLoading) return reviewSummary;

    const fromCg = getCaregiverRatingSummary(caregiver);
    if ((fromCg.count || 0) > 0) return fromCg;

    if (!listReviews.length) return { avg: 0, count: 0 };
    const avg =
      listReviews.reduce((acc, rv) => acc + (Number(rv.rating) || 0), 0) /
      listReviews.length;
    return { avg, count: listReviews.length };
  }, [reviewsLoading, reviewSummary, listReviews, caregiver]);

  // ✅ serviços existentes dentro das avaliações (para montar opções)
  const reviewServicesInData = useMemo(() => {
    const set = new Set();
    (listReviews || []).forEach((rv) => {
      const s = rv?.service ? String(rv.service) : "";
      if (s) set.add(s);
    });
    return Array.from(set);
  }, [listReviews]);

  // ✅ aplica filtro no array final (somente na listagem)
  const filteredReviews = useMemo(() => {
    if (reviewSvcFilter === "todos") return listReviews;
    return (listReviews || []).filter(
      (rv) => String(rv?.service || "") === String(reviewSvcFilter)
    );
  }, [listReviews, reviewSvcFilter]);

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
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
      return false;
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

  // ---------- HANDLERS DE DATA ----------
  const handleStartChange = (value) => {
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
        showToast(
          "Nem todas as datas desse intervalo estão disponíveis. Ajuste o período.",
          "error"
        );
        setEndDate("");
      }
    }
  };

  const handleEndChange = (value) => {
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
      showToast(
        "Há dias sem disponibilidade neste intervalo. Escolha outro período.",
        "error"
      );
      setEndDate("");
      return;
    }
    setEndDate(value);
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

    if (pets.length > 0 && selectedPetIds.length === 0) {
      showToast("Escolha pelo menos um pet para essa pré-reserva. 🐾", "error");
      return;
    }

    try {
      setSaving(true);

      const selectedIdSet = new Set((selectedPetIds || []).map(String));
      const selectedPets = (pets || []).filter((p) =>
        selectedIdSet.has(String(p?.id))
      );

      const petsSummary = selectedPets
        .map((p) => p?.name)
        .filter(Boolean)
        .join(", ");

      const petsIdsClean = Array.from(selectedIdSet);

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

      const all =
        safeJsonParse(localStorage.getItem("reservations") || "[]", []) || [];
      const newRes = {
        id: newId,
        tutorId: String(user.id),
        tutorName: user.name,
        caregiverId: String(caregiver.id),
        caregiverName: caregiver.name,
        city: caregiver.city || "",
        neighborhood: caregiver.neighborhood || "",
        startDate,
        endDate,
        service: svc,
        pricePerDay: svcPriceMap[svc],
        total,
        status: "Pendente",
        petsIds: petsIdsClean,
        petsNames: petsSummary,
      };

      const next = [newRes, ...all.filter((r) => String(r.id) !== newId)];
      safeSetLocalStorage("reservations", JSON.stringify(next));
      setReservations(next);

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
        return;
      }

      showToast(msg, "error");

      if (
        typeof msg === "string" &&
        (msg.toLowerCase().includes("disponibilidade") ||
          msg.toLowerCase().includes("conflit"))
      ) {
        setEndDate("");
      }
    } finally {
      setSaving(false);
    }
  };

  const openMaps = () => {
    const q = encodeURIComponent(
      [caregiver?.neighborhood, caregiver?.city].filter(Boolean).join(", ")
    );
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${q}`,
      "_blank"
    );
  };

  // ---------- RENDER ----------
  if (!caregiver) {
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
        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          <img
            src={caregiver.image || DEFAULT_IMG}
            alt={caregiver.name}
            className="w-24 h-24 rounded-full object-cover border-4 border-[#FFD700]"
          />
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-[#5A3A22]">
              {caregiver.name}
            </h1>
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

          <div className="text-right">
            <p className="text-sm text-[#5A3A22]">
              ⭐ <b>{(ratingSummary.avg || 0).toFixed(1)}</b> (
              {ratingSummary.count})
            </p>
            {caregiver.minPrice != null && (
              <p className="text-sm text-[#5A3A22]">
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

        {/* dica disponibilidade */}
        <div className="mb-4">
          <p className="text-xs text-[#5A3A22] opacity-70">
            Datas disponíveis cadastradas: <b>{availableKeys.length}</b>
          </p>

          {availableKeys.length > 0 && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {/* Próximas datas */}
              <div>
                <p className="font-semibold text-[#5A3A22] mb-1">
                  Próximas datas
                </p>
                <ul className="space-y-0.5">
                  {availableKeys
                    .filter((k) => k >= todayKey)
                    .slice(0, 6)
                    .map((k) => (
                      <li key={k} className="text-[#5A3A22]">
                        {formatDateBR(k)}
                      </li>
                    ))}

                  {availableKeys.filter((k) => k >= todayKey).length === 0 && (
                    <li className="opacity-60">Nenhuma data futura</li>
                  )}
                </ul>
              </div>

              {/* Datas passadas */}
              <div>
                <p className="font-semibold text-[#5A3A22] mb-1">
                  Datas passadas
                </p>
                <ul className="space-y-0.5">
                  {availableKeys
                    .filter((k) => k < todayKey)
                    .slice(-6)
                    .map((k) => (
                      <li
                        key={k}
                        className="text-[#5A3A22] opacity-50 line-through"
                        title="Data já passou"
                      >
                        {formatDateBR(k)}
                      </li>
                    ))}

                  {availableKeys.filter((k) => k < todayKey).length === 0 && (
                    <li className="opacity-60">Nenhuma</li>
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>


        {/* Pré-reserva */}
        <section className="pc-card pc-card-accent mb-6">
          <h2 className="font-semibold text-[#5A3A22] mb-3">Fazer pré-reserva</h2>

          {pricedServices.length === 0 ? (
            <p className="text-[#5A3A22]">
              Este cuidador ainda não definiu preços para os serviços.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <select
                  value={svc}
                  onChange={(e) => setSvc(e.target.value)}
                  className="input"
                >
                  {pricedServices.map((k) => (
                    <option key={k} value={k}>
                      {serviceLabel(k)} — R$ {Number(svcPriceMap[k]).toFixed(2)}/
                      {k === "passeios" ? "h" : "dia"}
                    </option>
                  ))}
                </select>

                <input
                  type="date"
                  value={startDate}
                  min={todayKey}
                  onChange={(e) => handleStartChange(e.target.value)}
                  className="input"
                />

                <input
                  type="date"
                  value={endDate}
                  min={startDate || todayKey}
                  onChange={(e) => handleEndChange(e.target.value)}
                  className="input"
                />

                <div className="flex items-center px-3 py-2 rounded-lg border text-[#5A3A22]">
                  Total:{" "}
                  <b className="ml-1">R$ {Number(total || 0).toFixed(2)}</b>
                </div>

                <button
                  onClick={handlePreReserva}
                  disabled={saving}
                  className="bg-[#5A3A22] hover:bg-[#95301F] disabled:opacity-60 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-semibold"
                >
                  {saving ? "Enviando..." : "Enviar pré-reserva"}
                </button>
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
                  <h3 className="font-semibold text-[#5A3A22] mb-2">
                    Qual pet vai nessa reserva?
                  </h3>
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
                      const active = selectedPetIds
                        .map(String)
                        .includes(String(pet.id));

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
                  Cadastre seus pets no painel <b>Meus Pets</b> para selecioná-los aqui
                  na pré-reserva.
                </p>
              )}
            </>
          )}

          <p className="text-xs text-[#5A3A22] mt-2">
            * O endereço completo só é exibido após a reserva ser <b>Aceita</b>.
            Antes disso, apenas <b>bairro</b> e <b>cidade</b> ficam visíveis.
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
          O chat interno fica disponível nos <b>detalhes da reserva</b> assim que ela
          for <b>Aceita</b> e permanece liberado por até{" "}
          <b>24 horas após o término</b>. Depois disso, para iniciar uma nova
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

          {/* ===== Passo 6: Skeleton / erro / carregando mais ===== */}
          {reviewsLoading ? (
            <div className="grid gap-3">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="pc-card pc-card-accent animate-pulse"
                >
                  <div className="h-4 w-52 bg-gray-200 rounded mb-2" />
                  <div className="h-3 w-72 bg-gray-200 rounded mb-2" />
                  <div className="h-3 w-56 bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          ) : reviewsError ? (
            <div className="pc-card pc-card-accent">
              <p className="text-sm text-[#95301F] font-semibold">
                {reviewsError}
              </p>
              <p className="text-xs text-[#5A3A22] opacity-80 mt-1">
                Recarregue a página ou tente novamente.
              </p>
            </div>
          ) : filteredReviews.length === 0 ? (
            <p className="text-[#5A3A22]">
              Ainda não há avaliações
              {reviewSvcFilter !== "todos" ? " para esse serviço" : ""}.
            </p>
          ) : (
            <>
              <p className="text-xs text-[#5A3A22] opacity-70 mb-3">
                Mostrando <b>{filteredReviews.length}</b> de{" "}
                <b>{listReviews.length}</b> avaliações
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
                    const da = a.createdAt
                      ? parseLocalKey(String(a.createdAt).slice(0, 10))
                      : new Date(0);
                    const db = b.createdAt
                      ? parseLocalKey(String(b.createdAt).slice(0, 10))
                      : new Date(0);
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
                          {rv.createdAt
                            ? formatDateBR(String(rv.createdAt).slice(0, 10))
                            : ""}
                          {rv.service ? (
                            <span className="opacity-70">
                              {" "}
                              • {serviceLabel(String(rv.service))}
                            </span>
                          ) : null}
                        </p>
                        {rv.comment && <p className="mt-1">{rv.comment}</p>}
                      </div>
                    );
                  })}
              </div>

              {/* Carregando mais + botão */}
              <div className="mt-4 flex flex-col items-center gap-2">
                {reviewsLoadingMore && (
                  <p className="text-xs text-[#5A3A22] opacity-70">
                    Carregando mais…
                  </p>
                )}

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
                  <p className="text-xs text-[#5A3A22] opacity-60">
                    Você chegou ao fim das avaliações.
                  </p>
                )}

                {/* dica: filtro */}
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
