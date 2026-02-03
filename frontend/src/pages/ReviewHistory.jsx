// src/pages/ReviewHistory.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatDateBR } from "../utils/date";
import { authRequest } from "../services/api";

function toBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "sim";
  }
  return false;
}

// tenta pegar o "hidden" em diferentes formatos que podem vir do backend
function getIsHidden(ev) {
  return toBool(
    ev?.is_hidden ??
    ev?.isHidden ??
    ev?.review_is_hidden ??
    ev?.reviewIsHidden ??
    ev?.hidden ??
    ev?.oculta ??
    ev?.is_oculta ??
    // campos que podem vir do listCaregiver/listTutor
    ev?.tutor_review_is_hidden ??
    ev?.caregiver_review_is_hidden ??
    ev?.caregiver_review_hidden ??
    ev?.tutor_review_hidden
  );
}

function getHiddenReason(ev) {
  const v =
    ev?.hidden_reason ??
    ev?.hiddenReason ??
    ev?.review_hidden_reason ??
    ev?.reviewHiddenReason ??
    // campos que podem vir do listCaregiver/listTutor
    ev?.tutor_review_hidden_reason ??
    ev?.caregiver_review_hidden_reason ??
    ev?.caregiver_review_moderation_reason ??
    ev?.tutor_review_moderation_reason ??
    ev?.moderation_reason ??
    ev?.reason;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function getHiddenAt(ev) {
  const v =
    ev?.hidden_at ??
    ev?.hiddenAt ??
    ev?.review_hidden_at ??
    ev?.reviewHiddenAt ??
    // campos que podem vir do listCaregiver/listTutor
    ev?.tutor_review_hidden_at ??
    ev?.caregiver_review_hidden_at ??
    ev?.moderation_at;
  if (!v) return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function normRole(v) {
  const s = String(v || "").trim().toLowerCase();
  if (s === "caregiver" || s === "cuidador") return "caregiver";
  if (s === "tutor") return "tutor";
  if (s === "admin" || s === "admin_master") return "admin";
  return "";
}

export default function ReviewHistory() {
  const { user, token, activeMode } = useAuth();
  const location = useLocation();

  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);

  const roleRaw = String(user?.role || "");
  const isAdmin = normRole(roleRaw) === "admin";

  // ✅ 1) Prioridade máxima: query ?mode=tutor|caregiver (vem do Dashboard)
  const queryMode = useMemo(() => {
    try {
      const params = new URLSearchParams(location.search || "");
      return normRole(params.get("mode"));
    } catch {
      return "";
    }
  }, [location.search]);

  // ✅ PERFIL ATIVO (fonte de verdade)
  const effectiveMode = useMemo(() => {
    if (isAdmin) return "admin";

    if (queryMode === "tutor" || queryMode === "caregiver") return queryMode;

    const ctx = normRole(activeMode);
    if (ctx === "tutor" || ctx === "caregiver") return ctx;

    // fallback: localStorage (mesma chave que você usa no Dashboard)
    try {
      const uid = user?.id != null ? String(user.id) : null;
      if (uid) {
        const saved = localStorage.getItem(`activeRole_${uid}`);
        const s = normRole(saved);
        if (s === "tutor" || s === "caregiver") return s;
      }
    } catch {
      // ignore
    }

    // último fallback
    const r = normRole(roleRaw);
    return r === "caregiver" ? "caregiver" : "tutor";
  }, [isAdmin, queryMode, activeMode, user?.id, roleRaw]);

  const isTutor = effectiveMode === "tutor";
  const isCaregiver = effectiveMode === "caregiver";

  useEffect(() => {
    let cancelled = false;

    const loadEvaluations = async () => {
      setLoading(true);

      if (!token || (!isTutor && !isCaregiver && !isAdmin)) {
        if (!cancelled) {
          setEvaluations([]);
          setLoading(false);
        }
        return;
      }

      try {
        // ✅ Backend já filtra corretamente por modo (sem inferência no frontend)
        const data = await authRequest(
          `/reservations/my-evaluations?mode=${effectiveMode}`,
          token
        );

        const raw = Array.isArray(data?.evaluations)
          ? data.evaluations
          : Array.isArray(data?.reviews)
            ? data.reviews
            : [];

        // normalize: flags + motivo + data (sem side)
        const normalized = raw.map((ev) => {
          const __isHidden = getIsHidden(ev);
          return {
            ...ev,
            __isHidden,
            __hiddenReason: __isHidden ? getHiddenReason(ev) : null,
            __hiddenAt: __isHidden ? getHiddenAt(ev) : null,
          };
        });

        if (!cancelled) setEvaluations(normalized);
      } catch (err) {
        console.error("Erro ao carregar avaliações:", err);
        if (!cancelled) setEvaluations([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadEvaluations();

    return () => {
      cancelled = true;
    };
  }, [token, isTutor, isCaregiver, isAdmin, effectiveMode]);

  // ===========================================================
  // 📄 Paginação de avaliações — 6 por página (client-side)
  // ===========================================================
  const REVIEWS_PAGE_SIZE = 6;
  const [revPage, setRevPage] = useState(1);

  // lista para exibir: admin vê tudo; usuário comum não vê ocultas
  const displayList = useMemo(() => {
    return isAdmin ? evaluations : evaluations.filter((e) => !e.__isHidden);
  }, [evaluations, isAdmin]);

  const revTotal = displayList.length;

  const revTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(revTotal / REVIEWS_PAGE_SIZE));
  }, [revTotal]);

  // ao trocar perfil/lista, volta pra página 1 e garante página válida
  useEffect(() => {
    setRevPage(1);
  }, [effectiveMode]);

  useEffect(() => {
    setRevPage((p) => {
      const cur = Math.max(1, Number(p || 1));
      return Math.min(cur, revTotalPages);
    });
  }, [revTotalPages]);

  const paginated = useMemo(() => {
    const cur = Math.max(1, Number(revPage || 1));
    const start = (cur - 1) * REVIEWS_PAGE_SIZE;
    return displayList.slice(start, start + REVIEWS_PAGE_SIZE);
  }, [displayList, revPage]);

  function ReviewsPager() {
    const totalPages = Number(revTotalPages || 1);
    const curPage = Math.max(1, Number(revPage || 1));

    const canPrev = curPage > 1;
    const canNext = curPage < totalPages;

    if (!canPrev && !canNext) return null;

    return (
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <p className="text-xs text-[#5A3A22] opacity-80">
          Página <b>{curPage}</b> de <b>{totalPages}</b> — <b>{revTotal}</b>{" "}
          avaliação{revTotal === 1 ? "" : "s"}
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRevPage((p) => Math.max(1, Number(p || 1) - 1))}
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
            onClick={() => setRevPage((p) => Math.min(totalPages, Number(p || 1) + 1))}
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

  // média/contagem: só considera avaliações visíveis (não ocultas), exceto admin
  const summary = useMemo(() => {
    const list = isAdmin ? evaluations : evaluations.filter((e) => !e.__isHidden);
    if (!list.length) return { avg: 0, count: 0 };
    const sum = list.reduce((acc, ev) => acc + (Number(ev.rating) || 0), 0);
    return { avg: sum / list.length, count: list.length };
  }, [evaluations, isAdmin]);

  const profileTitle =
    effectiveMode === "caregiver"
      ? "Suas avaliações como Cuidador"
      : "Suas avaliações como Tutor";

  function getDateLabel(ev) {
    const d =
      ev?.end_date ||
      ev?.start_date ||
      ev?.endDate ||
      ev?.startDate ||
      ev?.created_at ||
      ev?.createdAt;
    if (!d) return "";
    const s = String(d);
    const key = /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
    return key ? formatDateBR(key) : "";
  }

  const emptyText = isAdmin
    ? "Ainda não há avaliações."
    : "Você ainda não recebeu avaliações neste perfil.";

  return (
    // ✅ MOBILE: menos "espremido" (p-3) | DESKTOP: mantém (px-6 / p-6)
    <div className="bg-[#EBCBA9] min-h-[calc(100vh-120px)] py-8 px-3 md:px-6">
      {/* ✅ MOBILE: padding menor no card (p-4) | DESKTOP: mantém (p-6) */}
      <div className="max-w-[1400px] mx-auto bg-white rounded-2xl shadow p-4 md:p-6 border-l-4 border-[#FFD700]/80">
        <h1 className="text-2xl font-bold text-[#5A3A22] mb-2">{profileTitle}</h1>

        <p className="text-[#5A3A22] text-lg mb-6">
          ⭐ <b>{summary.avg ? summary.avg.toFixed(1) : "0.0"}</b> ({summary.count} avaliação
          {summary.count === 1 ? "" : "es"})
        </p>

        {loading ? (
          <p className="text-[#5A3A22] opacity-80">Carregando avaliações…</p>
        ) : displayList.length === 0 ? (
          <p className="text-[#5A3A22] opacity-80">{emptyText}</p>
        ) : (
          <div className="mt-2">
            <ReviewsPager />

            {paginated.map((ev) => {
              const key =
                ev.reservation_id ??
                `${ev.from_user_id || "u"}_${ev.from_user_name || "name"}_${ev.start_date || ""}_${ev.end_date || ""
                }`;

              const dateLabel = getDateLabel(ev);

              // Card normal (visível) ou admin
              return (
                <div
                  key={key}
                  className={`border rounded-lg p-4 mb-3 text-[#5A3A22] shadow-sm ${isAdmin && ev.__isHidden ? "bg-[#FFF7D6]" : "bg-white"
                    }`}
                >
                  <p className="text-sm text-[#5A3A22]/80">
                    <b>{ev.from_user_name || "Usuário"}</b> — ⭐ {ev.rating}/5
                    {dateLabel ? ` — ${dateLabel}` : ""}
                  </p>

                  {ev.review ? <p className="mt-1">{ev.review}</p> : null}

                  {ev.service ? (
                    <p className="mt-1 text-xs opacity-70">Serviço: {ev.service}</p>
                  ) : null}

                  {isAdmin && ev.reservation_id ? (
                    <p className="mt-1 text-xs opacity-70">Reserva: #{ev.reservation_id}</p>
                  ) : null}

                  {isAdmin && ev.__isHidden ? (
                    <div className="mt-2 text-xs opacity-80">
                      <p className="text-[#95301F] font-semibold">Oculta pela moderação</p>
                      {ev.__hiddenReason ? <p>Motivo: {ev.__hiddenReason}</p> : null}
                      {ev.__hiddenAt ? (
                        <p>Ocultada em: {formatDateBR(ev.__hiddenAt)}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
