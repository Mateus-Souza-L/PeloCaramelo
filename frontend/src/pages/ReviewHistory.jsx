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

// ---------- helpers: perfil ativo + filtro por “lado” da avaliação ----------

function normRole(v) {
  const s = String(v || "").trim().toLowerCase();
  if (s === "caregiver" || s === "cuidador") return "caregiver";
  if (s === "tutor") return "tutor";
  if (s === "admin" || s === "admin_master") return "admin";
  return "";
}

function hasAnyKey(ev, keys) {
  if (!ev || typeof ev !== "object") return false;
  return keys.some((k) => ev[k] != null);
}

/**
 * tenta descobrir para QUAL PERFIL a avaliação pertence (tutor/caregiver)
 * Regras mais fortes:
 * - Se vier campos do tipo tutor_review_* / tutor_rating -> isso é avaliação feita pelo TUTOR (sobre o CUIDADOR) => side = caregiver
 * - Se vier caregiver_review_* / caregiver_rating -> avaliação feita pelo CUIDADOR (sobre o TUTOR) => side = tutor
 * - Se vier ids (tutor_id/caregiver_id) e bater com meu id, resolve.
 * - Se vier role/target_role/to_role etc, resolve.
 */
function inferEvaluationSide(ev, myUserId) {
  const uid = myUserId != null ? String(myUserId) : null;

  // 0) pistas “fortes” por presença de campos (muito comum no seu backend)
  const looksLikeTutorReviewAboutCaregiver = hasAnyKey(ev, [
    "tutor_rating",
    "tutorReview",
    "tutor_review",
    "tutor_review_is_hidden",
    "tutor_review_hidden",
    "tutor_review_hidden_reason",
    "tutor_review_moderation_reason",
    "tutor_review_hidden_at",
    "has_tutor_review",
    "__hasTutorReview",
  ]);

  const looksLikeCaregiverReviewAboutTutor = hasAnyKey(ev, [
    "caregiver_rating",
    "caregiverReview",
    "caregiver_review",
    "caregiver_review_is_hidden",
    "caregiver_review_hidden",
    "caregiver_review_hidden_reason",
    "caregiver_review_moderation_reason",
    "caregiver_review_hidden_at",
    "has_caregiver_review",
    "__hasCaregiverReview",
  ]);

  // Se só um lado aparecer, decide imediatamente
  if (looksLikeTutorReviewAboutCaregiver && !looksLikeCaregiverReviewAboutTutor) return "caregiver";
  if (looksLikeCaregiverReviewAboutTutor && !looksLikeTutorReviewAboutCaregiver) return "tutor";

  // 1) campos explícitos de “lado”
  const explicit =
    ev?.side ??
    ev?.role ??
    ev?.target_role ??
    ev?.targetRole ??
    ev?.to_role ??
    ev?.toRole ??
    ev?.reviewed_role ??
    ev?.reviewedRole ??
    ev?.profile ??
    ev?.profile_role ??
    ev?.profileRole ??
    ev?.evaluation_role ??
    ev?.evaluationRole ??
    ev?.rated_role ??
    ev?.ratedRole;

  const exp = normRole(explicit);
  if (exp === "tutor" || exp === "caregiver") return exp;

  // 2) se vier ids do tutor/cuidador e bater com meu id
  const tutorId =
    ev?.tutor_id ??
    ev?.tutorId ??
    ev?.tutor_user_id ??
    ev?.tutorUserId ??
    ev?.to_tutor_id ??
    ev?.toTutorId ??
    ev?.rated_tutor_id ??
    ev?.ratedTutorId ??
    null;

  const caregiverId =
    ev?.caregiver_id ??
    ev?.caregiverId ??
    ev?.caregiver_user_id ??
    ev?.caregiverUserId ??
    ev?.to_caregiver_id ??
    ev?.toCaregiverId ??
    ev?.rated_caregiver_id ??
    ev?.ratedCaregiverId ??
    null;

  if (uid && caregiverId != null && String(caregiverId) === uid) return "caregiver";
  if (uid && tutorId != null && String(tutorId) === uid) return "tutor";

  // 3) se vier “subject”/“type”
  const t =
    String(ev?.type ?? ev?.kind ?? ev?.subject ?? ev?.subjectType ?? "")
      .trim()
      .toLowerCase();

  if (t.includes("caregiver") || t.includes("cuidador")) return "caregiver";
  if (t.includes("tutor")) return "tutor";

  // 4) se veio “misturado” (ambos presentes), tenta desempatar:
  // - se tiver “from_user_role”, o alvo é o oposto (tutor avalia caregiver; caregiver avalia tutor)
  const fromRole = normRole(ev?.from_user_role ?? ev?.fromUserRole ?? ev?.author_role ?? ev?.authorRole);
  if (fromRole === "tutor") return "caregiver";
  if (fromRole === "caregiver") return "tutor";

  return ""; // desconhecido
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
        const data = await authRequest(`/reservations/my-evaluations?mode=${effectiveMode}`, token);
        const raw = Array.isArray(data?.evaluations) ? data.evaluations : [];
        console.log("[my-evaluations] raw length =", raw.length, raw[0]);

        // normalize: flags + motivo + data + side inferido
        const normalized = raw.map((ev) => {
          const __isHidden = getIsHidden(ev);
          const side = inferEvaluationSide(ev, user?.id);
          return {
            ...ev,
            __isHidden,
            __hiddenReason: __isHidden ? getHiddenReason(ev) : null,
            __hiddenAt: __isHidden ? getHiddenAt(ev) : null,
            __side: side, // "tutor" | "caregiver" | ""
          };
        });

        // ✅ 2) FILTRO rígido por perfil ativo
        // - Admin: vê tudo
        // - Usuário comum: mostra APENAS o que bate com o perfil.
        //   (se __side vier vazio, NÃO mostra — evita “vazar” avaliação do outro perfil)
        const filtered = isAdmin
          ? normalized
          : (() => {
            const known = normalized.filter((ev) => ev.__side === "tutor" || ev.__side === "caregiver");
            const unknown = normalized.filter((ev) => !ev.__side);

            // se o backend NÃO manda lado (tudo unknown), não some com tudo
            if (known.length === 0 && unknown.length > 0) {
              return normalized; // volta a mostrar como antes
            }

            // se tem pelo menos alguns com lado, filtra certinho e descarta unknown
            return known.filter((ev) => ev.__side === effectiveMode);
          })();

        if (!cancelled) setEvaluations(filtered);
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
  }, [token, isTutor, isCaregiver, isAdmin, effectiveMode, user?.id]);

  // média/contagem: só considera avaliações visíveis (não ocultas), exceto admin
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

        <p className="text-[#5A3A22] text-lg mb-6">
          ⭐ <b>{summary.avg ? summary.avg.toFixed(1) : "0.0"}</b> ({summary.count} avaliação
          {summary.count === 1 ? "" : "es"})
        </p>

        {loading ? (
          <p className="text-[#5A3A22] opacity-80">Carregando avaliações…</p>
        ) : evaluations.length === 0 ? (
          <p className="text-[#5A3A22] opacity-80">
            Você ainda não recebeu avaliações neste perfil.
          </p>
        ) : (
          <div className="mt-2">
            {evaluations.map((ev) => {
              const key =
                ev.reservation_id ??
                `${ev.from_user_id || "u"}_${ev.from_user_name || "name"}_${ev.start_date || ""}_${ev.end_date || ""}`;

              const dateLabel = getDateLabel(ev);

              // Card "oculto" para usuário comum
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

              // Card normal (visível) ou admin
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
