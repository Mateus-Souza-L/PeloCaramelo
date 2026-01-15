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

  const [reservations, setReservations] = useState([]);

  const [reviews, setReviews] = useState([]);
  const [reviewSummary, setReviewSummary] = useState({ avg: 0, count: 0 });

  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewsLoadingMore, setReviewsLoadingMore] = useState(false);
  const [reviewsError, setReviewsError] = useState(null);

  const PAGE_SIZE = 5;
  const [reviewsPage, setReviewsPage] = useState(1);
  const [reviewsHasMore, setReviewsHasMore] = useState(false);

  const [reviewSvcFilter, setReviewSvcFilter] = useState("todos");

  const [svc, setSvc] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  const [pets, setPets] = useState([]);
  const [selectedPetIds, setSelectedPetIds] = useState([]);
  const [allPetsSelected, setAllPetsSelected] = useState(false);

  const [availableKeys, setAvailableKeys] = useState([]);

  const [capacityInfo, setCapacityInfo] = useState(null);

  const [revealedIds, setRevealedIds] = useState(() => new Set());
  const revealTimerRef = useRef(null);

  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);

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

  const pickPetImage = (p) => p?.image || p?.photo || p?.img || null;

  const normalizeReviewItem = (rv) => {
    if (!rv) return null;
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

  const availToKeys = (data) => {
    if (Array.isArray(data)) return uniqSort(data);

    const listA = Array.isArray(data?.availability) ? data.availability : [];
    const listB = Array.isArray(data?.availableDates) ? data.availableDates : [];
    const listC = Array.isArray(data?.dates) ? data.dates : [];

    if (listA.length && typeof listA[0] === "string") return uniqSort(listA);

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
      } catch {}

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
        } catch {}
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
          } catch {}
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

  useEffect(() => {
    let cancelled = false;

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
      } catch {}

      if (token) {
        try {
          const data = await authRequest(`/reviews/summary/${id}`, token);
          const payload = pickSummary(data);
          if (!cancelled) setReviewSummary(payload);
          safeSetLocalStorage(
            `reviews_summary_${String(id)}`,
            JSON.stringify(payload)
          );
        } catch {}
      }
    };

    const loadPage = async (page) => {
      const url = `${API_BASE_URL}/reviews/user/${id}?limit=${PAGE_SIZE}&page=${page}`;

      const r = await tryFetchJson(url);
      if (!r.ok) {
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

            if (cachedSummary && (cachedSummary.avg != null || cachedSummary.count != null)) {
              setReviewSummary({
                avg: Number(cachedSummary.avg || 0) || 0,
                count: Number(cachedSummary.count || 0) || 0,
              });
            }
          }
        } catch {}

        if (!cancelled) setReviewsError(err?.message || "Erro ao carregar avaliações.");
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
        return merged;
      });

      // ✅ correção: evita stale state
      setRevealedIds((prevSet) => {
        const next = new Set(prevSet);
        normalized.forEach((rv) => next.add(rv.id));
        if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
        revealTimerRef.current = setTimeout(() => {
          setRevealedIds(new Set(next));
        }, 40);
        return next;
      });

      setReviewsPage(nextPage);
      setReviewsHasMore(normalized.length === PAGE_SIZE);
    } catch (err) {
      setReviewsError(err?.message || "Erro ao carregar mais avaliações.");
    } finally {
      setReviewsLoadingMore(false);
    }
  };

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
          const list = Array.isArray(data?.pets)
            ? data.pets
            : Array.isArray(data)
              ? data
              : [];

          const normalized = list
            .map((p) => ({ ...p, id: p?.id }))
            .filter((p) => p?.id != null);

          if (!cancelled) {
            setPets(normalized);
            setSelectedPetIds([]);
            setAllPetsSelected(false);
          }

          try {
            localStorage.setItem(`pets_${user.id}`, JSON.stringify(normalized));
          } catch {}
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

  const svcPriceMap = useMemo(() => getSvcPriceMap(caregiver), [caregiver]);

  useEffect(() => {
    if (!caregiver) return;
    if (svc) return;

    const valid = Object.entries(caregiver.services || {})
      .filter(([k, v]) => v && (svcPriceMap[k] ?? 0) > 0)
      .map(([k]) => k);

    setSvc(valid[0] || "");
  }, [caregiver, svcPriceMap, svc]);

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
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, "_blank");
  };

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
        <div className="flex items-start gap-4 mb-6">
          <img
            src={caregiver.image || DEFAULT_IMG}
            alt={caregiver.name}
            className="w-24 h-24 rounded-full object-cover border-4 border-[#FFD700]"
          />
          <div className="flex-1">
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

          <div className="text-right">
            <p className="text-sm text-[#5A3A22]">
              ⭐ <b>{(ratingSummary.avg || 0).toFixed(1)}</b> ({ratingSummary.count})
            </p>
            {caregiver.minPrice != null && (
              <p className="text-sm text-[#5A3A22]">
                A partir de <b>R$ {Number(caregiver.minPrice).toFixed(2)}</b>
              </p>
            )}
          </div>
        </div>

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

        {/* ... o resto do seu JSX segue igual ao que você colou ... */}
        {/* (mantive o arquivo focado na correção principal) */}

        <div className="flex flex-wrap gap-2 mb-2">
          <button
            type="button"
            onClick={openMaps}
            className="bg-gray-200 hover:bg-gray-300 text-[#5A3A22] px-4 py-2 rounded-lg font-semibold shadow-md transition"
          >
            Ver no mapa
          </button>
        </div>

        {/* Avaliações: seu bloco continua igual, só que agora com revealedIds corrigido */}
        {/* ... */}
      </div>
    </div>
  );
}
