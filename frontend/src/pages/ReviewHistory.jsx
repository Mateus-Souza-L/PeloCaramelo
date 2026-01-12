// src/pages/ReviewHistory.jsx
import { useEffect, useMemo, useState } from "react";
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
  // aceita ISO e pega só a data
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export default function ReviewHistory() {
  const { user, token } = useAuth();
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);

  const role = String(user?.role || "");
  const isTutor = role === "tutor";
  const isCaregiver = role === "caregiver";
  const isAdmin = String(user?.role || "").toLowerCase() === "admin";

  useEffect(() => {
    let cancelled = false;

    const loadEvaluations = async () => {
      if (!token || (!isTutor && !isCaregiver && !isAdmin)) {
        setLoading(false);
        return;
      }

      try {
        const data = await authRequest("/reservations/my-evaluations", token);
        const raw = Array.isArray(data?.evaluations) ? data.evaluations : [];

        // ✅ normalize: flags + motivo + data (sem mudar os nomes originais)
        const normalized = raw.map((ev) => {
          const __isHidden = getIsHidden(ev);
          return {
            ...ev,
            __isHidden,
            __hiddenReason: __isHidden ? getHiddenReason(ev) : null,
            __hiddenAt: __isHidden ? getHiddenAt(ev) : null,
          };
        });

        // ✅ REGRA:
        // - Admin vê tudo normal (inclusive ocultas como vieram).
        // - Usuário comum: vê cards normais se não estiver oculto,
        //   e vê um aviso (card) se estiver oculto, com o motivo.
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
  }, [token, isTutor, isCaregiver, isAdmin]);

  // ✅ média/contagem: só considera avaliações visíveis (não ocultas), exceto admin
  const summary = useMemo(() => {
    const list = isAdmin ? evaluations : evaluations.filter((e) => !e.__isHidden);
    if (!list.length) return { avg: 0, count: 0 };
    const sum = list.reduce((acc, ev) => acc + (Number(ev.rating) || 0), 0);
    return { avg: sum / list.length, count: list.length };
  }, [evaluations, isAdmin]);

  const profileTitle = isTutor
    ? "Suas avaliações como Tutor"
    : "Suas avaliações como Cuidador";

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

  return (
    <div className="bg-[#EBCBA9] min-h-[calc(100vh-120px)] py-8 px-6">
      <div className="max-w-[1400px] mx-auto bg-white rounded-2xl shadow p-6 border-l-4 border-[#FFD700]/80">
        <h1 className="text-2xl font-bold text-[#5A3A22] mb-2">{profileTitle}</h1>

        {/* média */}
        <p className="text-[#5A3A22] text-lg mb-6">
          ⭐ <b>{summary.avg ? summary.avg.toFixed(1) : "0.0"}</b> ({summary.count} avaliação
          {summary.count === 1 ? "" : "es"})
        </p>

        {loading ? (
          <p className="text-[#5A3A22] opacity-80">Carregando avaliações…</p>
        ) : evaluations.length === 0 ? (
          <p className="text-[#5A3A22] opacity-80">Você ainda não recebeu avaliações.</p>
        ) : (
          <div className="mt-2">
            {evaluations.map((ev) => {
              const key =
                ev.reservation_id ??
                `${ev.from_user_id || "u"}_${ev.from_user_name || "name"}_${ev.start_date || ""}_${ev.end_date || ""}`;

              const dateLabel = getDateLabel(ev);

              // ✅ Card "oculto" para usuário comum
              if (!isAdmin && ev.__isHidden) {
                return (
                  <div
                    key={key}
                    className="border rounded-lg p-4 mb-3 text-[#5A3A22] shadow-sm bg-[#FFF7D6]"
                  >
                    <p className="text-sm text-[#5A3A22]/80">
                      <b>{ev.from_user_name || "Usuário"}</b>
                      {dateLabel ? ` — ${dateLabel}` : ""}
                    </p>

                    <p className="mt-2 font-semibold text-[#95301F]">
                      Esta avaliação foi ocultada pela moderação.
                    </p>

                    <p className="mt-1 text-sm text-[#5A3A22]/90">
                      {ev.__hiddenReason ? (
                        <>
                          <b>Motivo:</b> {ev.__hiddenReason}
                        </>
                      ) : (
                        <>Motivo não informado.</>
                      )}
                    </p>

                    {ev.__hiddenAt ? (
                      <p className="mt-1 text-xs opacity-70">
                        Ocultada em: {formatDateBR(ev.__hiddenAt)}
                      </p>
                    ) : null}

                    {ev.service ? (
                      <p className="mt-2 text-xs opacity-70">Serviço: {ev.service}</p>
                    ) : null}

                    {ev.reservation_id ? (
                      <p className="mt-1 text-xs opacity-70">Reserva: #{ev.reservation_id}</p>
                    ) : null}
                  </div>
                );
              }

              // ✅ Card normal (visível) ou admin vendo tudo
              return (
                <div
                  key={key}
                  className="border rounded-lg p-4 mb-3 text-[#5A3A22] shadow-sm bg-white"
                >
                  <p className="text-sm text-[#5A3A22]/80">
                    <b>{ev.from_user_name}</b> — ⭐ {ev.rating}/5 — {dateLabel}
                  </p>

                  {ev.review ? <p className="mt-1">{ev.review}</p> : null}

                  {ev.service ? (
                    <p className="mt-1 text-xs opacity-70">Serviço: {ev.service}</p>
                  ) : null}

                  {isAdmin && ev.__isHidden ? (
                    <div className="mt-2 text-xs opacity-80">
                      <p className="text-[#95301F] font-semibold">Oculta pela moderação</p>
                      {ev.__hiddenReason ? <p>Motivo: {ev.__hiddenReason}</p> : null}
                      {ev.__hiddenAt ? <p>Ocultada em: {formatDateBR(ev.__hiddenAt)}</p> : null}
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
