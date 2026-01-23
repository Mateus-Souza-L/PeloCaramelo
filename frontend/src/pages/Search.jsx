// src/pages/Search.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { normalizeCaregiver, serviceLabel } from "../utils/normalize";
import { useAuth } from "../context/AuthContext";
import { toLocalKey, parseLocalKey } from "../utils/date";

const DEFAULT_IMG = "/paw.png";
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

const Stars = ({ value = 0 }) => {
  const rounded = Math.round(Number(value || 0) * 2) / 2;
  const stars = [1, 2, 3, 4, 5].map((i) => (rounded >= i ? "★" : "☆"));
  return (
    <span aria-label={`Nota ${Number(value || 0).toFixed(1)} de 5`}>
      {stars.join(" ")}
    </span>
  );
};

// -------- helpers --------
function isValidKey(key) {
  return typeof key === "string" && /^\d{4}-\d{2}-\d{2}$/.test(key);
}

function toKey10(v) {
  if (v == null) return "";
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function toNum(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeServiceParam(raw) {
  const v = String(raw || "").trim();
  if (!v) return "";
  const x = v.toLowerCase();

  const map = {
    // hospedagem
    hospedagem: "hospedagem",
    hotel: "hospedagem",

    // creche
    creche: "creche",
    daycare: "creche",

    // pet sitter
    petsitter: "petSitter",
    "pet-sitter": "petSitter",
    pet_sitter: "petSitter",
    pet: "petSitter",
    pets: "petSitter",
    petsit: "petSitter",
    petsitting: "petSitter",
    "pet sitter": "petSitter",
    petSitter: "petSitter",

    // passeios
    passeio: "passeios",
    passeios: "passeios",
    walk: "passeios",
    walking: "passeios",
  };

  return map[x] || v;
}

/**
 * Tenta pegar média/contagem de qualquer formato que possa vir do backend/normalize.
 */
function getRatingSummary(c) {
  if (!c) return { avg: null, count: 0 };

  const avg =
    toNum(c.avgRating) ??
    toNum(c.ratingAvg) ??
    toNum(c.avg_rating) ??
    toNum(c.rating_avg) ??
    toNum(c.average_rating) ??
    toNum(c.media_avaliacoes) ??
    null;

  const count =
    toNum(c.ratingCount) ??
    toNum(c.reviewsCount) ??
    toNum(c.rating_count) ??
    toNum(c.reviews_count) ??
    toNum(c.count_reviews) ??
    toNum(c.count_ratings) ??
    0;

  const list = Array.isArray(c.reviews)
    ? c.reviews
    : Array.isArray(c.ratings)
    ? c.ratings
    : Array.isArray(c.avaliacoes)
    ? c.avaliacoes
    : null;

  if ((avg == null || !Number.isFinite(avg)) && list && list.length) {
    const nums = list
      .map((r) => toNum(r?.rating ?? r?.nota ?? r?.value))
      .filter((n) => n != null);

    if (nums.length) {
      const s = nums.reduce((a, b) => a + b, 0);
      return { avg: s / nums.length, count: nums.length };
    }
  }

  return { avg, count: Number.isFinite(count) ? count : 0 };
}

/**
 * Normaliza payload de availability -> Set("YYYY-MM-DD")
 */
function normalizeAvailabilityToSet(payload) {
  if (Array.isArray(payload)) {
    return new Set(payload.map(toKey10).filter(isValidKey));
  }

  const rawAvail = Array.isArray(payload?.availability) ? payload.availability : [];
  const rawB = Array.isArray(payload?.availableDates) ? payload.availableDates : [];
  const rawC = Array.isArray(payload?.dates) ? payload.dates : [];

  if (rawAvail.length && typeof rawAvail[0] === "string") {
    return new Set(rawAvail.map(toKey10).filter(isValidKey));
  }
  if (rawB.length && typeof rawB[0] === "string") {
    return new Set(rawB.map(toKey10).filter(isValidKey));
  }
  if (rawC.length && typeof rawC[0] === "string") {
    return new Set(rawC.map(toKey10).filter(isValidKey));
  }

  const keys = new Set(
    rawAvail
      .filter(
        (r) =>
          r &&
          (r.is_available === true || r.isAvailable === true || r.available === true)
      )
      .map((r) => toKey10(r.date_key || r.dateKey || r.date || r.day))
      .filter(isValidKey)
  );

  return keys;
}

function rangeIsAvailable(availableKeysSet, startKey, endKey) {
  if (!availableKeysSet || !(availableKeysSet instanceof Set)) return false;
  if (!isValidKey(startKey)) return false;

  if (!endKey) return availableKeysSet.has(startKey);
  if (!isValidKey(endKey)) return false;

  const start = parseLocalKey(startKey);
  const end = parseLocalKey(endKey);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  if (end < start) return false;

  const cursor = new Date(start);
  while (cursor <= end) {
    const k = toLocalKey(cursor);
    if (!availableKeysSet.has(k)) return false;
    cursor.setDate(cursor.getDate() + 1);
  }
  return true;
}

/**
 * ✅ Executa tarefas assíncronas com limite de concorrência.
 * - tasks: array de funções () => Promise<any>
 */
async function runWithConcurrency(tasks, limit = 6) {
  const results = new Array(tasks.length);
  let idx = 0;

  const worker = async () => {
    while (idx < tasks.length) {
      const my = idx++;
      try {
        results[my] = await tasks[my]();
      } catch (e) {
        results[my] = { __error: true, error: e };
      }
    }
  };

  const workers = Array.from({ length: Math.max(1, limit) }, worker);
  await Promise.all(workers);
  return results;
}

export default function Search() {
  const { token } = useAuth();
  const location = useLocation();

  // filtros
  const [query, setQuery] = useState("");
  const [startDateKey, setStartDateKey] = useState("");
  const [endDateKey, setEndDateKey] = useState("");
  const [svc, setSvc] = useState("todos");
  const [sort, setSort] = useState("preco");

  // ✅ mostra “Resultados para…” quando vier por URL
  const [showResultsHint, setShowResultsHint] = useState(false);

  // dados
  const [caregivers, setCaregivers] = useState([]);

  // UX
  const [loading, setLoading] = useState(true);

  // resultado final
  const [filteredAsync, setFilteredAsync] = useState([]);
  const [filteringDates, setFilteringDates] = useState(false);

  const abortRef = useRef(null);
  const reqIdRef = useRef(0);

  // cache de availability
  const availabilityCacheRef = useRef(new Map());
  const availabilityReqAbortRef = useRef(null);
  const availabilityReqIdRef = useRef(0);

  // ✅ lê filtros vindos via URL (para Home -> /buscar com parâmetros)
  useEffect(() => {
    const sp = new URLSearchParams(location.search || "");

    const q =
      sp.get("q") ||
      sp.get("query") ||
      sp.get("cidade") ||
      sp.get("bairro") ||
      "";

    const s1 = sp.get("start") || sp.get("startDate") || sp.get("inicio") || "";
    const s2 = sp.get("end") || sp.get("endDate") || sp.get("fim") || "";

    const svcRaw = normalizeServiceParam(sp.get("svc") || sp.get("service") || "");
    const sortRaw = (sp.get("sort") || "").trim();

    const allowedSvc = new Set(["todos", "hospedagem", "creche", "petSitter", "passeios"]);
    const allowedSort = new Set(["preco", "nome"]);

    const nextQuery = String(q).trim();
    const nextStart = isValidKey(s1) ? s1 : "";
    const nextEnd = isValidKey(s2) ? s2 : "";

    const nextSvc = allowedSvc.has(svcRaw) ? svcRaw : "todos";
    const nextSort = allowedSort.has(sortRaw) ? sortRaw : "preco";

    const hasAny =
      nextQuery ||
      nextStart ||
      nextEnd ||
      (svcRaw && allowedSvc.has(svcRaw)) ||
      (sortRaw && allowedSort.has(sortRaw));

    if (!hasAny) {
      setShowResultsHint(false);
      return;
    }

    setShowResultsHint(true);

    setQuery(nextQuery);
    setStartDateKey(nextStart);

    // se end < start, limpa end
    if (nextStart && nextEnd) {
      const ds = parseLocalKey(nextStart);
      const de = parseLocalKey(nextEnd);
      if (!Number.isNaN(ds.getTime()) && !Number.isNaN(de.getTime()) && de < ds) {
        setEndDateKey("");
      } else {
        setEndDateKey(nextEnd);
      }
    } else {
      setEndDateKey(nextEnd);
    }

    setSvc(nextSvc);
    setSort(nextSort);
  }, [location.search]);

  const refresh = useCallback(async () => {
    const myReqId = ++reqIdRef.current;

    try {
      abortRef.current?.abort?.();
    } catch {}

    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/caregivers`, {
        signal: controller.signal,
        cache: "no-store",
      });

      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      const list = Array.isArray(data?.caregivers) ? data.caregivers : [];

      if (reqIdRef.current === myReqId) {
        setCaregivers(
          list.map((raw) => {
            const norm = normalizeCaregiver(raw);
            return { ...raw, ...norm };
          })
        );
      }
    } catch (e) {
      if (e?.name !== "AbortError" && reqIdRef.current === myReqId) {
        setCaregivers([]);
      }
    } finally {
      if (reqIdRef.current === myReqId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  // ---------- filtro base ----------
  const baseFiltered = useMemo(() => {
    let list = [...caregivers];
    const q = query.trim().toLowerCase();

    if (q) {
      list = list.filter((c) =>
        String(c.displayLocation || "").toLowerCase().includes(q)
      );
    }

    if (svc !== "todos") {
      list = list.filter((c) => !!c?.services?.[svc]);
    }

    if (sort === "preco") {
      list.sort((a, b) => (a.minPrice ?? 9e9) - (b.minPrice ?? 9e9));
    } else if (sort === "nome") {
      list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }

    return list;
  }, [caregivers, query, svc, sort]);

  // ---------- availability ----------
  const fetchAvailabilityKeys = useCallback(
    async (caregiverId, signal) => {
      const id = String(caregiverId);
      const cached = availabilityCacheRef.current.get(id);
      const now = Date.now();

      // cache 60s
      if (cached && now - cached.ts < 60_000) return cached.keys;

      // ✅ rota é pública; NÃO depende de token
      const doFetch = async (useAuthHeader) => {
        const headers =
          useAuthHeader && token ? { Authorization: `Bearer ${token}` } : undefined;

        const res = await fetch(`${API_BASE_URL}/availability/caregiver/${id}`, {
          signal,
          cache: "no-store",
          headers,
        });

        if (res.status === 404) {
          const empty = new Set();
          availabilityCacheRef.current.set(id, { keys: empty, ts: now });
          return empty;
        }

        if (!res.ok) return null;

        const data = await res.json();
        const keys = normalizeAvailabilityToSet(data);
        availabilityCacheRef.current.set(id, { keys, ts: now });
        return keys;
      };

      const keysPublic = await doFetch(false);
      if (keysPublic) return keysPublic;

      if (token) {
        const keysAuth = await doFetch(true);
        if (keysAuth) return keysAuth;
      }

      return null;
    },
    [token]
  );

  useEffect(() => {
    const hasDate = !!startDateKey || !!endDateKey;

    if (!hasDate) {
      setFilteredAsync(baseFiltered);
      setFilteringDates(false);
      return;
    }

    const startKey = startDateKey || endDateKey;
    const endKey = startDateKey && endDateKey ? endDateKey : "";

    if (!isValidKey(startKey) || (endKey && !isValidKey(endKey))) {
      setFilteredAsync(baseFiltered);
      setFilteringDates(false);
      return;
    }

    try {
      availabilityReqAbortRef.current?.abort?.();
    } catch {}

    const controller = new AbortController();
    availabilityReqAbortRef.current = controller;
    const myReq = ++availabilityReqIdRef.current;

    setFilteringDates(true);

    (async () => {
      const tasks = baseFiltered
        .filter((c) => c?.id)
        .map((c) => async () => {
          const keys = await fetchAvailabilityKeys(c.id, controller.signal);
          if (!keys || keys.size === 0) return { id: String(c.id), ok: false };

          const ok = rangeIsAvailable(keys, startKey, endKey);
          return { id: String(c.id), ok };
        });

      const results = await runWithConcurrency(tasks, 6);

      if (availabilityReqIdRef.current !== myReq) return;

      const okIds = new Set(
        results
          .filter((r) => r && r.ok === true && r.id != null)
          .map((r) => String(r.id))
      );

      setFilteredAsync(baseFiltered.filter((c) => okIds.has(String(c.id))));
      setFilteringDates(false);
    })();

    return () => controller.abort();
  }, [baseFiltered, startDateKey, endDateKey, fetchAvailabilityKeys]);

  const filtered = filteredAsync;

  const hasActiveFilters = useMemo(() => {
    const q = String(query || "").trim();
    const hasQ = q.length > 0;
    const hasDates = !!startDateKey || !!endDateKey;
    const hasSvc = svc && svc !== "todos";
    return hasQ || hasDates || hasSvc;
  }, [query, startDateKey, endDateKey, svc]);

  const resultsHintText = useMemo(() => {
    const q = String(query || "").trim();
    if (!q && !startDateKey && !endDateKey && (!svc || svc === "todos")) return "";

    const parts = [];

    if (q) parts.push(q);

    if (startDateKey || endDateKey) {
      const s = startDateKey || endDateKey;
      const e = startDateKey && endDateKey ? endDateKey : "";
      parts.push(e ? `${s} → ${e}` : `${s}`);
    }

    if (svc && svc !== "todos") {
      parts.push(serviceLabel(svc));
    }

    return parts.join(" • ");
  }, [query, startDateKey, endDateKey, svc]);

  return (
    <div className="bg-[#EBCBA9] min-h-[calc(100vh-120px)] py-8 px-6">
      <div className="max-w-[1400px] mx-auto bg-white rounded-2xl shadow p-6 border-l-4 border-[#FFD700]/80">
        {/* ✅ Destaque "como funciona rápido" (antes do título) */}
        <div className="mb-5 rounded-2xl border border-[#5A3A22]/10 bg-[#FFF8F0] p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm sm:text-base font-semibold text-[#5A3A22]">
                Como funciona na prática
              </p>
              <p className="text-[12px] sm:text-sm text-[#5A3A22]/75 mt-1">
                Você combina tudo pela plataforma — com contato protegido e sem taxas.
              </p>
            </div>

            <Link
              to="/sobre#como-funciona"
              className="
                inline-flex items-center justify-center
                px-4 py-2 rounded-xl font-semibold
                bg-[#FFD700] text-[#5A3A22]
                shadow-md hover:brightness-105 transition
                focus:outline-none focus:ring-2 focus:ring-[#5A3A22]/20
                w-full sm:w-auto
              "
            >
              Conheça a PeloCaramelo
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl bg-white border border-[#5A3A22]/10 p-3">
              <p className="font-bold text-[#5A3A22]">✅ Sem taxas</p>
              <p className="text-sm text-[#5A3A22]/75 mt-1">
                Sem taxas para tutores e cuidadores.
              </p>
            </div>

            <div className="rounded-xl bg-white border border-[#5A3A22]/10 p-3">
              <p className="font-bold text-[#5A3A22]">🔒 Contato protegido</p>
              <p className="text-sm text-[#5A3A22]/75 mt-1">
                Telefone mascarado e o chat é o canal principal.
              </p>
            </div>

            <div className="rounded-xl bg-white border border-[#5A3A22]/10 p-3">
              <p className="font-bold text-[#5A3A22]">⭐ Avaliações</p>
              <p className="text-sm text-[#5A3A22]/75 mt-1">
                Em breve com mais destaque quando houver volume.
              </p>
            </div>
          </div>

          {/* ✅ “Resultados para…” quando vier da Home/URL */}
          {showResultsHint && hasActiveFilters && (
            <div className="mt-4 rounded-xl bg-white border border-[#5A3A22]/10 p-3">
              <p className="text-sm text-[#5A3A22]">
                <span className="font-semibold">Resultados para:</span>{" "}
                <span className="text-[#5A3A22]/80">{resultsHintText}</span>
              </p>
            </div>
          )}
        </div>

        <h1 className="text-2xl font-bold text-[#5A3A22] mb-4">Buscar Cuidadores</h1>

        {/* filtros */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 mb-5">
          <input
            type="text"
            placeholder="Bairro/Cidade…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="md:col-span-4 border rounded-lg px-3 py-2"
          />

          <input
            type="date"
            value={startDateKey}
            onChange={(e) => setStartDateKey(e.target.value)}
            className="md:col-span-2 border rounded-lg px-3 py-2"
          />

          <input
            type="date"
            value={endDateKey}
            onChange={(e) => setEndDateKey(e.target.value)}
            className="md:col-span-2 border rounded-lg px-3 py-2"
          />

          <select
            value={svc}
            onChange={(e) => setSvc(e.target.value)}
            className="md:col-span-2 border rounded-lg px-3 py-2 bg-white"
          >
            <option value="todos">Todos</option>
            <option value="hospedagem">Hospedagem</option>
            <option value="creche">Creche</option>
            <option value="petSitter">Pet Sitter</option>
            <option value="passeios">Passeios</option>
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="md:col-span-2 border rounded-lg px-3 py-2 bg-white"
          >
            <option value="preco">Preço</option>
            <option value="nome">Nome</option>
          </select>
        </div>

        {loading ? (
          <p>Carregando cuidadores...</p>
        ) : filteringDates ? (
          <p>Checando disponibilidade...</p>
        ) : filtered.length === 0 ? (
          <p>Nenhum cuidador encontrado.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filtered.map((c) => {
              const { avg, count } = getRatingSummary(c);

              return (
                <div key={c.id} className="pc-card pc-card-accent">
                  <div className="flex items-center gap-3 mb-3">
                    <img
                      src={c.image || DEFAULT_IMG}
                      alt={c.name}
                      className="w-14 h-14 rounded-full object-cover"
                    />
                    <div className="min-w-0">
                      <h2 className="text-lg font-bold truncate">{c.name}</h2>
                      <p className="text-sm opacity-80 truncate">
                        {c.displayLocation || "Local não informado"}
                      </p>

                      {(count > 0 || avg != null) && (
                        <p className="text-xs mt-1 text-[#5A3A22] flex items-center gap-2">
                          <span className="leading-none">
                            <Stars value={avg ?? 0} />
                          </span>
                          <span className="opacity-80">
                            {avg != null ? Number(avg).toFixed(1) : "0.0"} ({count})
                          </span>
                        </p>
                      )}
                    </div>
                  </div>

                  <p className="mb-3 text-[#5A3A22]">
                    {c.minPrice != null
                      ? `A partir de R$ ${Number(c.minPrice).toFixed(2)}`
                      : "Preço não definido"}
                  </p>

                  <div className="flex flex-wrap gap-2 mb-4">
                    {Object.entries(c.services || {})
                      .filter(([, v]) => v)
                      .map(([k]) => (
                        <span
                          key={k}
                          className="text-xs px-2 py-1 rounded-full bg-[#FFF6CC]"
                        >
                          {serviceLabel(k)}
                        </span>
                      ))}
                  </div>

                  <Link
                    to={`/caregiver/${c.id}`}
                    className="inline-block bg-[#5A3A22] text-white px-4 py-2 rounded-lg"
                  >
                    Ver Detalhes
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
