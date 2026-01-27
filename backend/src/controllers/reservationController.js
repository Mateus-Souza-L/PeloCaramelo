// backend/src/controllers/reservationController.js
const reservationModel = require("../models/reservationModel");
const availabilityModel = require("../models/availabilityModel");
const pool = require("../config/db");
const { createReservationNotification } = require("../models/notificationModel");

// ✅ e-mails transacionais (Resend)
const { sendEmail } = require("../services/emailService");
const { buildNewReservationEmail } = require("../email/templates/newReservation");
const { buildReservationAcceptedEmail } = require("../email/templates/reservationAccepted");

/* ===========================================================
   HELPERS (ids, datas, body)
   =========================================================== */

function toNum(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toInt(v) {
  const n = toNum(v);
  if (n == null) return null;
  const i = Math.trunc(n);
  if (!Number.isFinite(i)) return null;
  return i;
}

function toPosInt(v) {
  const i = toInt(v);
  if (i == null || i <= 0) return null;
  return i;
}

function isValidISODate(d) {
  if (d == null) return false;
  if (d instanceof Date && Number.isFinite(d.getTime())) return true;
  if (typeof d === "string" && d.trim()) return Number.isFinite(Date.parse(d));
  return false;
}

function toDateKey(v) {
  if (v == null) return null;

  if (v instanceof Date) {
    if (!Number.isFinite(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }

  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;

    // já vem YYYY-MM-DD...
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

    const d = new Date(s);
    if (!Number.isFinite(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(v);
    if (!Number.isFinite(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  return null;
}

function normalizeDateRange(startDate, endDate) {
  if (!isValidISODate(startDate) || !isValidISODate(endDate)) return null;

  const sKey = toDateKey(startDate);
  const eKey = toDateKey(endDate);
  if (!sKey || !eKey) return null;

  const s = new Date(sKey);
  const e = new Date(eKey);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  if (s > e) return null;

  return { startDate: sKey, endDate: eKey };
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseBodySafe(raw) {
  if (!raw) return {};
  if (raw && typeof raw === "object") return raw;

  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s || s === "[object Object]") return {};
    const parsed = safeJsonParse(s);
    return parsed && typeof parsed === "object" ? parsed : {};
  }

  return {};
}

function cleanNonEmptyString(v) {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

/* ===========================================================
   EMAIL HELPERS (URLs + datas)
   =========================================================== */

function computeFrontendBase(req) {
  const envBase = String(process.env.FRONTEND_URL || "").trim().replace(/\/$/, "");
  if (envBase) return envBase;

  const origin = String(req.get("origin") || "").trim().replace(/\/$/, "");
  if (origin) return origin;

  const referer = String(req.get("referer") || "").trim();
  if (referer) {
    try {
      const u = new URL(referer);
      return `${u.protocol}//${u.host}`;
    } catch {
      // ignore
    }
  }

  return "";
}

function formatDateBRFromKey(dateKey) {
  const k = toDateKey(dateKey);
  if (!k) return "";
  // k = YYYY-MM-DD
  const [y, m, d] = k.split("-");
  if (!y || !m || !d) return k;
  return `${d}/${m}/${y}`;
}

async function getUserBasicById(id) {
  try {
    const idStr = id == null ? "" : String(id);
    if (!idStr) return null;

    const sql = `
      SELECT id, name, email
      FROM users
      WHERE id::text = $1
      LIMIT 1
    `;
    const { rows } = await pool.query(sql, [idStr]);
    const r = rows?.[0] || null;
    if (!r) return null;

    const name = typeof r?.name === "string" ? r.name.trim() : "";
    const email = typeof r?.email === "string" ? r.email.trim() : "";

    return {
      id: r.id,
      name: name || null,
      email: email || null,
    };
  } catch (err) {
    console.error("getUserBasicById error:", err);
    return null;
  }
}

/* ===========================================================
   STATUS NORMALIZATION + RULES
   =========================================================== */

function stripAccentsLower(s) {
  return String(s || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeStatusInput(raw) {
  const s = stripAccentsLower(raw);

  // canon: Pendente | Aceita | Recusada | Cancelada | Concluída
  if (!s) return "";

  if (s === "pendente" || s === "pending") return "Pendente";
  if (s === "aceita" || s === "aceito" || s === "accepted") return "Aceita";

  if (s === "recusada" || s === "recusado" || s === "rejeitada" || s === "rejeitado")
    return "Recusada";

  if (s === "cancelada" || s === "cancelado" || s === "canceled" || s === "cancelled")
    return "Cancelada";

  if (s === "concluida" || s === "finalizada" || s === "finalizado") return "Concluída";

  // se vier já certinho:
  if (String(raw || "").trim() === "Concluída") return "Concluída";

  return String(raw || "").trim();
}

function isConcludedStatus(status) {
  const s = stripAccentsLower(status);
  return s === "concluida" || s === "finalizada";
}

function getResStatus(reservation) {
  const s = reservation?.status;
  return typeof s === "string" ? s.trim() : "";
}

/* ===========================================================
   RESERVATION OWNERSHIP
   =========================================================== */

function getResIds(reservation) {
  return {
    tutorId: reservation?.tutorId ?? reservation?.tutor_id ?? null,
    caregiverId: reservation?.caregiverId ?? reservation?.caregiver_id ?? null,
  };
}

function canAccessReservation(user, reservation) {
  if (!user?.id || !user?.role) return false;
  if (user.role === "admin") return true;

  const uid = String(user.id);
  const { tutorId, caregiverId } = getResIds(reservation);

  return (
    (tutorId != null && String(tutorId) === uid) ||
    (caregiverId != null && String(caregiverId) === uid)
  );
}

function getStartEndSafe(obj, fallbackReservation) {
  const start = toDateKey(
    obj?.startDate ??
      obj?.start_date ??
      fallbackReservation?.startDate ??
      fallbackReservation?.start_date
  );
  const end = toDateKey(
    obj?.endDate ?? obj?.end_date ?? fallbackReservation?.endDate ?? fallbackReservation?.end_date
  );
  return { start, end };
}

/* ===========================================================
   NOTIFICATIONS
   =========================================================== */

async function notifyReservationEventSafe({ reservation, actorUser, type, payload }) {
  try {
    if (!reservation || !actorUser?.id) return;

    const { tutorId, caregiverId } = getResIds(reservation);
    const tId = tutorId != null ? String(tutorId) : "";
    const cId = caregiverId != null ? String(caregiverId) : "";
    const actorId = String(actorUser.id);

    if (!tId || !cId) return;

    const targetUserId = actorId === tId ? cId : tId;

    await createReservationNotification({
      userId: targetUserId,
      reservationId: reservation.id,
      type,
      payload: payload || {},
    });
  } catch (err) {
    console.error("notifyReservationEventSafe error:", err);
  }
}

/* ===========================================================
   REVIEWS HELPERS (para “minha avaliação” na reserva)
   =========================================================== */

async function attachMyReviewFields(reservations, reviewerId) {
  try {
    if (!Array.isArray(reservations) || reservations.length === 0) return reservations;

    const rid = reviewerId != null ? String(reviewerId) : "";
    if (!rid) return reservations;

    const ids = reservations
      .map((r) => toPosInt(r?.id ?? r?.reservation_id))
      .filter((x) => x != null);

    if (ids.length === 0) return reservations;

    const sql = `
      SELECT
        rv.reservation_id,
        rv.rating,
        rv.comment,
        rv.is_hidden,
        rv.hidden_reason,
        rv.hidden_at
      FROM reviews rv
      WHERE rv.reviewer_id::text = $1
        AND rv.reservation_id = ANY($2::int[])
    `;

    const { rows } = await pool.query(sql, [rid, ids]);

    const map = new Map();
    for (const row of rows || []) {
      const k = String(row.reservation_id);
      map.set(k, {
        my_rating: row.rating != null ? Number(row.rating) : null,
        my_review: row.comment ?? null,
        my_review_is_hidden: !!row.is_hidden,
        my_review_hidden_reason: row.hidden_reason ?? null,
        my_review_hidden_at: row.hidden_at ?? null,
      });
    }

    return reservations.map((r) => {
      const k = String(toPosInt(r?.id ?? r?.reservation_id) ?? "");
      const extra =
        map.get(k) || {
          my_rating: null,
          my_review: null,
          my_review_is_hidden: false,
          my_review_hidden_reason: null,
          my_review_hidden_at: null,
        };
      return { ...r, ...extra };
    });
  } catch (err) {
    console.error("attachMyReviewFields error:", err);
    return reservations;
  }
}

/* ===========================================================
   DISPONIBILIDADE / CAPACIDADE
   =========================================================== */

async function assertRangeIsFullyAvailableOrThrow(caregiverId, startKey, endKey) {
  const caregiverIdStr = caregiverId == null ? "" : String(caregiverId);
  const s = toDateKey(startKey);
  const e = toDateKey(endKey);

  if (!caregiverIdStr || !s || !e) {
    return {
      ok: false,
      code: "INVALID_RANGE",
      message: "Intervalo inválido para validar disponibilidade.",
    };
  }

  // Preferir model (se existir)
  if (availabilityModel && typeof availabilityModel.isRangeAvailable === "function") {
    const ok = await availabilityModel.isRangeAvailable(caregiverIdStr, s, e);
    if (!ok) return { ok: false, code: "NOT_AVAILABLE", message: "Período sem disponibilidade." };
    return { ok: true };
  }

  // Fallback SQL simples
  try {
    const sql = `
      WITH days AS (
        SELECT generate_series($2::date, $3::date, interval '1 day')::date AS day
      )
      SELECT
        COUNT(*)::int AS total_days,
        SUM(CASE WHEN a.is_available IS TRUE THEN 1 ELSE 0 END)::int AS available_days
      FROM days d
      LEFT JOIN availability a
        ON a.caregiver_id::text = $1
       AND a.date_key::date = d.day
    `;

    const result = await pool.query(sql, [caregiverIdStr, s, e]);
    const row = result?.rows?.[0] || null;

    const total = Number(row?.total_days ?? 0);
    const available = Number(row?.available_days ?? 0);

    if (!Number.isFinite(total) || total <= 0 || available !== total) {
      return { ok: false, code: "NOT_AVAILABLE", message: "Período sem disponibilidade." };
    }

    return { ok: true };
  } catch (err) {
    console.error("Falha ao validar disponibilidade (fallback SQL):", err);
    return {
      ok: false,
      code: "AVAIL_CHECK_FAILED",
      message: "Não foi possível validar a disponibilidade agora. Tente novamente.",
    };
  }
}

async function assertCapacityOrThrow(caregiverId, startKey, endKey, excludeReservationId = null) {
  if (typeof reservationModel.assertCaregiverCanBeBooked !== "function") {
    return { ok: true };
  }

  const s = toDateKey(startKey);
  const e = toDateKey(endKey);
  if (!s || !e) return { ok: false, code: "INVALID_RANGE", message: "Intervalo inválido." };

  const check = await reservationModel.assertCaregiverCanBeBooked(
    String(caregiverId),
    s,
    e,
    excludeReservationId
  );

  if (!check?.available) {
    return { ok: false, code: "NOT_AVAILABLE", message: "Período sem disponibilidade." };
  }

  if (check.maxOverlapping >= check.capacity) {
    return {
      ok: false,
      code: "CAPACITY_FULL",
      message: "Agenda cheia nesse período. Tente outras datas.",
      details: { capacity: check.capacity, maxOverlapping: check.maxOverlapping },
    };
  }

  return { ok: true };
}

/* ===========================================================
   PETS / TOTAL
   =========================================================== */

function normalizeIntIds(input) {
  if (input == null) return [];

  let arr = input;

  if (typeof arr === "string") {
    const s = arr.trim();
    if (!s) return [];
    try {
      arr = JSON.parse(s);
    } catch {
      arr = s.split(",").map((x) => x.trim());
    }
  }

  if (!Array.isArray(arr)) arr = [arr];

  const out = arr
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && Number.isInteger(n) && n > 0);

  return Array.from(new Set(out));
}

function daysInclusive(startKey, endKey) {
  const s = new Date(toDateKey(startKey));
  const e = new Date(toDateKey(endKey));
  if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) return null;
  const diffMs = e.getTime() - s.getTime();
  if (diffMs < 0) return null;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  return days >= 1 ? days : null;
}

async function getUserDisplayNameById(id) {
  try {
    const idStr = id == null ? "" : String(id);
    if (!idStr) return null;

    const sql = `
      SELECT name, email
      FROM users
      WHERE id::text = $1
      LIMIT 1
    `;
    const { rows } = await pool.query(sql, [idStr]);
    const r = rows?.[0] || null;

    const name = typeof r?.name === "string" ? r.name.trim() : "";
    if (name) return name;

    const email = typeof r?.email === "string" ? r.email.trim() : "";
    if (email) return email;

    return null;
  } catch (err) {
    console.error("getUserDisplayNameById error:", err);
    return null;
  }
}

/* ===========================================================
   DB FALLBACKS (se model não tiver)
   =========================================================== */

async function updateReservationStatusDb(id, status, rejectReason = null) {
  // prefer model
  if (typeof reservationModel.updateReservationStatus === "function") {
    return reservationModel.updateReservationStatus(id, status, rejectReason);
  }

  // fallback SQL
  const rid = toPosInt(id);
  if (!rid) return null;

  const sql = `
    UPDATE reservations
      SET status = $2,
          reject_reason = $3,
          updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;
  const { rows } = await pool.query(sql, [rid, status, rejectReason]);
  return rows?.[0] || null;
}

/* ===========================================================
   CREATE (tutor)
   =========================================================== */

async function createReservationController(req, res) {
  try {
    const user = req.user;

    if (!user?.id) {
      return res.status(401).json({ error: "Não autenticado.", code: "UNAUTHENTICATED" });
    }
    if (user.role !== "tutor") {
      return res.status(403).json({
        error: "Apenas tutor pode criar reserva.",
        code: "FORBIDDEN_ROLE",
      });
    }

    const body = parseBodySafe(req.body);

    const caregiverId = body.caregiverId ?? body.caregiver_id ?? null;
    const caregiverNameRaw = body.caregiverName ?? body.caregiver_name ?? null;
    const city = body.city ?? null;
    const neighborhood = body.neighborhood ?? null;
    const service = body.service ?? null;

    const pricePerDay = body.pricePerDay ?? body.price_per_day ?? body.price ?? null;
    const startDate = body.startDate ?? body.start_date ?? null;
    const endDate = body.endDate ?? body.end_date ?? null;
    const totalRaw = body.total ?? null;

    const petsIdsRaw = body.petsIds ?? body.pets_ids ?? null;
    const petsNames = body.petsNames ?? body.pets_names ?? null;
    const petsSnapshotRaw = body.petsSnapshot ?? body.pets_snapshot ?? null;

    const tutorId = String(user.id);

    const tutorName =
      cleanNonEmptyString(user?.name) || cleanNonEmptyString(user?.email) || "Tutor";

    const missing = [];
    if (!caregiverId) missing.push("caregiverId/caregiver_id");
    if (!service) missing.push("service");
    if (!startDate) missing.push("startDate/start_date");
    if (!endDate) missing.push("endDate/end_date");

    const ppd = toNum(pricePerDay);
    if (ppd == null || ppd <= 0) missing.push("pricePerDay/price_per_day (> 0)");

    const petsProvided =
      petsIdsRaw != null || (Array.isArray(petsSnapshotRaw) && petsSnapshotRaw.length > 0);
    if (!petsProvided) {
      missing.push("petsIds/pets_snapshot (selecione ao menos 1 pet)");
    }

    if (missing.length) {
      return res.status(400).json({
        error: "Dados obrigatórios ausentes.",
        code: "MISSING_FIELDS",
        missing,
        receivedKeys: Object.keys(body || {}),
      });
    }

    const range = normalizeDateRange(startDate, endDate);
    if (!range) {
      return res.status(400).json({ error: "Intervalo de datas inválido.", code: "INVALID_DATES" });
    }

    const caregiverIdStr = String(caregiverId);

    const availCheck = await assertRangeIsFullyAvailableOrThrow(
      caregiverIdStr,
      range.startDate,
      range.endDate
    );
    if (!availCheck.ok) {
      return res.status(409).json({
        code: availCheck.code || "NOT_AVAILABLE",
        message: availCheck.message || "Período sem disponibilidade.",
      });
    }

    const capacityCheck = await assertCapacityOrThrow(
      caregiverIdStr,
      range.startDate,
      range.endDate,
      null
    );
    if (!capacityCheck.ok) {
      return res.status(409).json({
        code: capacityCheck.code,
        message: capacityCheck.message,
        ...(capacityCheck.details || {}),
      });
    }

    const petsSnapshotClean = Array.isArray(petsSnapshotRaw) ? petsSnapshotRaw : [];
    const petsIdsClean = normalizeIntIds(petsIdsRaw);

    const petsNamesClean =
      cleanNonEmptyString(petsNames) ||
      (petsSnapshotClean.map((p) => p?.name).filter(Boolean).join(", ") || null);

    const caregiverName =
      cleanNonEmptyString(caregiverNameRaw) ||
      (await getUserDisplayNameById(caregiverIdStr)) ||
      "Cuidador";

    const computedDays = daysInclusive(range.startDate, range.endDate);
    const computedTotal =
      computedDays != null && ppd != null ? Number(ppd) * Number(computedDays) : null;

    const totalFinal = toNum(totalRaw);
    const totalToUse = totalFinal != null ? totalFinal : computedTotal;

    if (totalToUse == null || totalToUse <= 0) {
      return res.status(400).json({
        error: "Total inválido. Não foi possível calcular o total.",
        code: "INVALID_TOTAL",
        details: { pricePerDay: ppd, days: computedDays },
      });
    }

    const reservation = await reservationModel.createReservation({
      tutorId,
      caregiverId: caregiverIdStr,
      tutorName,
      caregiverName,
      city: city || null,
      neighborhood: neighborhood || null,
      service,
      pricePerDay: ppd,
      startDate: range.startDate,
      endDate: range.endDate,
      total: totalToUse,
      status: "Pendente",
      petsIds: petsIdsClean,
      petsNames: petsNamesClean,
      petsSnapshot: petsSnapshotClean,
    });

    await notifyReservationEventSafe({
      reservation,
      actorUser: user,
      type: "created",
      payload: { reservationId: reservation?.id, status: "Pendente" },
    });

    // ✅ e-mail: Nova reserva (para o cuidador) — best-effort
    // Não deve quebrar criação da reserva se o e-mail falhar.
    try {
      const base = computeFrontendBase(req);
      if (!base) {
        console.warn(
          "[createReservation] FRONTEND_URL/origin ausente. Configure FRONTEND_URL. " +
            "E-mail de nova reserva não será enviado para evitar link quebrado."
        );
      } else {
        const caregiverUser = await getUserBasicById(caregiverIdStr);
        const caregiverEmail = cleanNonEmptyString(caregiverUser?.email);

        if (!caregiverEmail) {
          console.warn("[createReservation] caregiver email ausente. Não foi possível enviar e-mail.");
        } else {
          const startBR = formatDateBRFromKey(range.startDate);
          const endBR = formatDateBRFromKey(range.endDate);

          // Link simples e seguro (leva ao app; o cuidador vê no painel)
          const dashboardUrl = `${base}/dashboard`;

          const emailPayload = buildNewReservationEmail({
            caregiverName: caregiverUser?.name || caregiverName || "Cuidador",
            tutorName: tutorName || "Tutor",
            startDate: startBR,
            endDate: endBR,
            dashboardUrl,
          });

          await sendEmail({
            to: caregiverEmail,
            ...emailPayload,
          });
        }
      }
    } catch (e) {
      console.error("[createReservation] Falha ao enviar e-mail de nova reserva:", e?.message || e);
      // segue o fluxo normalmente
    }

    return res.status(201).json({
      reservation: {
        ...reservation,
        price_per_day: reservation?.price_per_day != null ? Number(reservation.price_per_day) : null,
        total: reservation?.total != null ? Number(reservation.total) : null,
      },
    });
  } catch (err) {
    console.error("Erro em POST /reservations:", err);
    return res.status(500).json({
      error: "Erro ao criar reserva.",
      code: "CREATE_RESERVATION_FAILED",
    });
  }
}

/* ===========================================================
   LIST - tutor
   =========================================================== */

async function listTutorReservationsController(req, res) {
  try {
    const user = req.user;
    if (!user?.id) return res.status(401).json({ error: "Não autenticado.", code: "UNAUTHENTICATED" });

    if (String(user.role) === "admin") {
      const qTutorId = req.query?.tutorId != null ? String(req.query.tutorId) : null;

      let rows = [];
      if (qTutorId) {
        rows = await reservationModel.listTutorReservations(String(qTutorId));
      } else if (typeof reservationModel.listAllReservations === "function") {
        rows = await reservationModel.listAllReservations();
      } else {
        const { rows: dbRows } = await pool.query(
          `SELECT * FROM reservations ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 500`
        );
        rows = dbRows || [];
      }

      return res.json({ reservations: rows });
    }

    let reservations = await reservationModel.listTutorReservations(String(user.id));
    reservations = await attachMyReviewFields(reservations, user.id);

    return res.json({ reservations });
  } catch (err) {
    console.error("Erro em GET /reservations/tutor:", err);
    return res.status(500).json({
      error: "Erro ao buscar reservas.",
      code: "LIST_TUTOR_RES_FAILED",
    });
  }
}

/* ===========================================================
   LIST - caregiver
   =========================================================== */

async function listCaregiverReservationsController(req, res) {
  try {
    const user = req.user;
    if (!user?.id) return res.status(401).json({ error: "Não autenticado.", code: "UNAUTHENTICATED" });

    if (String(user.role) === "admin") {
      const qCaregiverId = req.query?.caregiverId != null ? String(req.query.caregiverId) : null;

      let rows = [];
      if (qCaregiverId) {
        rows = await reservationModel.listCaregiverReservations(String(qCaregiverId));
      } else if (typeof reservationModel.listAllReservations === "function") {
        rows = await reservationModel.listAllReservations();
      } else {
        const { rows: dbRows } = await pool.query(
          `SELECT * FROM reservations ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 500`
        );
        rows = dbRows || [];
      }

      return res.json({ reservations: rows });
    }

    let reservations = await reservationModel.listCaregiverReservations(String(user.id));
    reservations = await attachMyReviewFields(reservations, user.id);

    return res.json({ reservations });
  } catch (err) {
    console.error("Erro em GET /reservations/caregiver:", err);
    return res.status(500).json({
      error: "Erro ao buscar reservas.",
      code: "LIST_CAREGIVER_RES_FAILED",
    });
  }
}

/* ===========================================================
   DETAIL
   =========================================================== */

async function getReservationDetailController(req, res) {
  try {
    const user = req.user;
    if (!user?.id) return res.status(401).json({ error: "Não autenticado.", code: "UNAUTHENTICATED" });

    const { id } = req.params;

    let reservation = req.reservation || null;
    if (!reservation) reservation = await reservationModel.getReservationById(id);

    if (!reservation) {
      return res.status(404).json({
        error: "Reserva não encontrada.",
        code: "RESERVATION_NOT_FOUND",
      });
    }

    if (!canAccessReservation(user, reservation)) {
      return res.status(403).json({
        error: "Sem permissão para acessar esta reserva.",
        code: "FORBIDDEN_OWNERSHIP",
      });
    }

    const enrichedArr = await attachMyReviewFields([reservation], user.id);
    reservation = enrichedArr?.[0] || reservation;

    reservation = {
      ...reservation,
      service: reservation?.service ?? null,
      price_per_day: reservation?.price_per_day != null ? Number(reservation.price_per_day) : null,
      total: reservation?.total != null ? Number(reservation.total) : null,
    };

    return res.json({ reservation });
  } catch (err) {
    console.error("Erro em GET /reservations/:id:", err);
    return res
      .status(500)
      .json({ error: "Erro ao buscar reserva.", code: "GET_RESERVATION_FAILED" });
  }
}

/* ===========================================================
   UPDATE STATUS (+ NOTIF) — com normalização e transições
   =========================================================== */

async function updateReservationStatusController(req, res) {
  try {
    const user = req.user;
    if (!user?.id) return res.status(401).json({ error: "Não autenticado.", code: "UNAUTHENTICATED" });

    const { id } = req.params;

    const body = parseBodySafe(req.body);
    const nextStatus = normalizeStatusInput(body.status);
    const rejectReasonRaw = body.rejectReason ?? body.reject_reason ?? null;
    const rejectReason = cleanNonEmptyString(rejectReasonRaw);

    if (!nextStatus) {
      return res.status(400).json({ error: "Status é obrigatório.", code: "MISSING_STATUS" });
    }

    let reservation = req.reservation || null;
    if (!reservation) reservation = await reservationModel.getReservationById(id);

    if (!reservation) {
      return res.status(404).json({
        error: "Reserva não encontrada.",
        code: "RESERVATION_NOT_FOUND",
      });
    }

    const role = String(user.role || "").toLowerCase();
    const uid = String(user.id);
    const { tutorId, caregiverId } = getResIds(reservation);

    const isOwnerTutor = tutorId != null && String(tutorId) === uid;
    const isOwnerCaregiver = caregiverId != null && String(caregiverId) === uid;
    const isAdmin = role === "admin";

    if (!isAdmin && !isOwnerTutor && !isOwnerCaregiver) {
      return res.status(403).json({
        error: "Sem permissão para alterar esta reserva.",
        code: "FORBIDDEN_OWNERSHIP",
      });
    }

    const prevStatus = getResStatus(reservation);
    const currentStatus = normalizeStatusInput(prevStatus);

    const { start: startKey, end: endKey } = getStartEndSafe(reservation, reservation);
    if (!startKey || !endKey) {
      return res.status(400).json({
        error: "Reserva com datas inválidas. Verifique start/end.",
        code: "INVALID_RESERVATION_DATES",
      });
    }

    // =======================================================
    // REGRAS POR ROLE
    // =======================================================

    // Tutor: só pode Cancelar quando Pendente/Aceita
    if (!isAdmin && role === "tutor") {
      if (!isOwnerTutor) {
        return res.status(403).json({
          error: "Apenas o tutor responsável pode cancelar.",
          code: "FORBIDDEN_OWNERSHIP",
        });
      }
      if (nextStatus !== "Cancelada") {
        return res.status(403).json({
          error: "Tutor só pode alterar o status para Cancelada.",
          code: "FORBIDDEN_STATUS",
        });
      }
      if (!["Pendente", "Aceita"].includes(currentStatus)) {
        return res.status(400).json({
          error: "Não é possível cancelar neste status.",
          code: "INVALID_STATUS_TRANSITION",
        });
      }

      const updated = await updateReservationStatusDb(id, "Cancelada", null);

      await notifyReservationEventSafe({
        reservation: updated,
        actorUser: user,
        type: "status",
        payload: { reservationId: updated?.id, prevStatus: currentStatus, nextStatus: "Cancelada" },
      });

      return res.json({
        reservation: {
          ...updated,
          price_per_day: updated?.price_per_day != null ? Number(updated.price_per_day) : null,
          total: updated?.total != null ? Number(updated.total) : null,
        },
      });
    }

    // Caregiver: Aceita/Recusada (somente se Pendente), Concluída (somente se Aceita)
    if (!isAdmin && role === "caregiver") {
      if (!isOwnerCaregiver) {
        return res.status(403).json({
          error: "Apenas o cuidador responsável pode alterar o status.",
          code: "FORBIDDEN_OWNERSHIP",
        });
      }

      const allowed = new Set(["Aceita", "Recusada", "Concluída"]);
      if (!allowed.has(nextStatus)) {
        return res.status(400).json({
          error: "Status inválido para cuidador.",
          code: "INVALID_STATUS",
        });
      }

      if (nextStatus === "Aceita") {
        if (currentStatus !== "Pendente") {
          return res.status(409).json({
            code: "INVALID_STATUS",
            message: "Só é possível aceitar reservas no status Pendente.",
          });
        }

        const availCheck = await assertRangeIsFullyAvailableOrThrow(caregiverId, startKey, endKey);
        if (!availCheck.ok) {
          return res.status(409).json({
            code: availCheck.code || "NOT_AVAILABLE",
            message: availCheck.message || "Período sem disponibilidade.",
          });
        }

        const capCheck = await assertCapacityOrThrow(caregiverId, startKey, endKey, id);
        if (!capCheck.ok) {
          return res.status(409).json({
            code: capCheck.code,
            message: capCheck.message,
            ...(capCheck.details || {}),
          });
        }
      }

      if (nextStatus === "Recusada") {
        if (currentStatus !== "Pendente") {
          return res.status(409).json({
            code: "INVALID_STATUS",
            message: "Só é possível recusar reservas no status Pendente.",
          });
        }
        if (!rejectReason) {
          return res.status(400).json({
            error: "Motivo da recusa é obrigatório.",
            code: "MISSING_REJECT_REASON",
          });
        }
      }

      if (nextStatus === "Concluída") {
        if (currentStatus !== "Aceita") {
          return res.status(409).json({
            code: "INVALID_STATUS",
            message: "Só é possível concluir reservas no status Aceita.",
          });
        }
      }

      const updated = await updateReservationStatusDb(
        id,
        nextStatus,
        nextStatus === "Recusada" ? rejectReason : null
      );

      await notifyReservationEventSafe({
        reservation: updated,
        actorUser: user,
        type: "status",
        payload: { reservationId: updated?.id, prevStatus: currentStatus, nextStatus },
      });

      // ✅ e-mail: Reserva aceita (para o tutor) — best-effort
      // Só dispara quando o cuidador mudou para "Aceita".
      if (nextStatus === "Aceita") {
        try {
          const base = computeFrontendBase(req);
          if (!base) {
            console.warn(
              "[updateStatus] FRONTEND_URL/origin ausente. Configure FRONTEND_URL. " +
                "E-mail de reserva aceita não será enviado para evitar link quebrado."
            );
          } else {
            const tutorUser = await getUserBasicById(tutorId);
            const tutorEmail = cleanNonEmptyString(tutorUser?.email);

            if (!tutorEmail) {
              console.warn("[updateStatus] tutor email ausente. Não foi possível enviar e-mail.");
            } else {
              const startBR = formatDateBRFromKey(startKey);
              const endBR = formatDateBRFromKey(endKey);

              // Link simples e seguro (leva ao app; tutor vê a reserva no painel)
              const reservationUrl = `${base}/dashboard`;

              const emailPayload = buildReservationAcceptedEmail({
                tutorName: tutorUser?.name || updated?.tutor_name || updated?.tutorName || "Tutor",
                caregiverName:
                  cleanNonEmptyString(user?.name) ||
                  updated?.caregiver_name ||
                  updated?.caregiverName ||
                  "Cuidador",
                startDate: startBR,
                endDate: endBR,
                reservationUrl,
              });

              await sendEmail({
                to: tutorEmail,
                ...emailPayload,
              });
            }
          }
        } catch (e) {
          console.error("[updateStatus] Falha ao enviar e-mail de reserva aceita:", e?.message || e);
        }
      }

      return res.json({
        reservation: {
          ...updated,
          price_per_day: updated?.price_per_day != null ? Number(updated.price_per_day) : null,
          total: updated?.total != null ? Number(updated.total) : null,
        },
      });
    }

    // Admin: pode alterar (com validações quando Aceita / Concluída)
    if (isAdmin) {
      if (nextStatus === "Aceita") {
        const availCheck = await assertRangeIsFullyAvailableOrThrow(caregiverId, startKey, endKey);
        if (!availCheck.ok) {
          return res.status(409).json({
            code: availCheck.code || "NOT_AVAILABLE",
            message: availCheck.message || "Período sem disponibilidade.",
          });
        }

        const capCheck = await assertCapacityOrThrow(caregiverId, startKey, endKey, id);
        if (!capCheck.ok) {
          return res.status(409).json({
            code: capCheck.code,
            message: capCheck.message,
            ...(capCheck.details || {}),
          });
        }
      }

      if (nextStatus === "Recusada" && !rejectReason) {
        return res.status(400).json({
          error: "Motivo da recusa é obrigatório.",
          code: "MISSING_REJECT_REASON",
        });
      }

      // opcional: só concluir se Aceita (mantém consistência)
      if (nextStatus === "Concluída" && currentStatus !== "Aceita") {
        return res.status(409).json({
          code: "INVALID_STATUS",
          message: "Só é possível concluir reservas no status Aceita.",
        });
      }

      const updated = await updateReservationStatusDb(
        id,
        nextStatus,
        nextStatus === "Recusada" ? rejectReason : null
      );

      await notifyReservationEventSafe({
        reservation: updated,
        actorUser: user,
        type: "status",
        payload: { reservationId: updated?.id, prevStatus: currentStatus, nextStatus },
      });

      return res.json({
        reservation: {
          ...updated,
          price_per_day: updated?.price_per_day != null ? Number(updated.price_per_day) : null,
          total: updated?.total != null ? Number(updated.total) : null,
        },
      });
    }

    return res.status(403).json({ error: "Sem permissão para alterar o status.", code: "FORBIDDEN" });
  } catch (err) {
    console.error("Erro em PATCH /reservations/:id/status:", err);
    return res.status(500).json({
      error: "Erro ao atualizar status da reserva.",
      code: "UPDATE_STATUS_FAILED",
    });
  }
}

/* ===========================================================
   UPDATE RATING [LEGADO]
   =========================================================== */

async function updateReservationRatingController(req, res) {
  try {
    const user = req.user;
    if (!user?.id) return res.status(401).json({ error: "Não autenticado.", code: "UNAUTHENTICATED" });

    const { id } = req.params;

    const body = parseBodySafe(req.body);
    const rating = body.rating;
    const comment = body.comment;

    const r = toNum(rating);
    if (r == null || r < 1 || r > 5) {
      return res.status(400).json({ error: "Nota inválida. Use 1 a 5.", code: "INVALID_RATING" });
    }

    let reservation = req.reservation || null;
    if (!reservation) reservation = await reservationModel.getReservationById(id);

    if (!reservation) {
      return res.status(404).json({
        error: "Reserva não encontrada.",
        code: "RESERVATION_NOT_FOUND",
      });
    }

    if (!canAccessReservation(user, reservation)) {
      return res.status(403).json({
        error: "Sem permissão para avaliar esta reserva.",
        code: "FORBIDDEN_OWNERSHIP",
      });
    }

    const currentStatus = getResStatus(reservation);
    if (!isConcludedStatus(currentStatus)) {
      return res.status(409).json({
        error: "Só é possível avaliar após concluir.",
        code: "NOT_CONCLUDED",
      });
    }

    if (!["tutor", "caregiver"].includes(String(user.role || "").toLowerCase())) {
      return res.status(403).json({
        error: "Apenas tutor ou cuidador podem avaliar.",
        code: "FORBIDDEN_ROLE",
      });
    }

    const updated = await reservationModel.updateReservationRating(
      id,
      user.role,
      r,
      typeof comment === "string" ? comment.trim() : null
    );

    await notifyReservationEventSafe({
      reservation: updated,
      actorUser: user,
      type: "rating",
      payload: { reservationId: updated?.id, fromRole: user.role, rating: r },
    });

    return res.json({ reservation: updated });
  } catch (err) {
    console.error("Erro em PATCH /reservations/:id/rating:", err);
    return res.status(500).json({
      error: "Erro ao salvar avaliação.",
      code: "UPDATE_RATING_FAILED",
    });
  }
}

/* ===========================================================
   GET /reservations/my-evaluations?mode=tutor|caregiver
   =========================================================== */

async function listMyEvaluationsController(req, res) {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ error: "Não autenticado.", code: "UNAUTHENTICATED" });
    }

    const isAdmin = String(user.role || "").toLowerCase() === "admin";
    const idStr = String(user.id);

    // ✅ modo vindo do front: /avaliacoes?mode=tutor|caregiver
    const modeRaw = String(req.query?.mode || "").trim().toLowerCase();
    const mode = modeRaw === "caregiver" ? "caregiver" : modeRaw === "tutor" ? "tutor" : "";

    // ✅ filtro por papel na reserva
    // Se não vier mode, mantém compat (traz tudo do reviewed_id)
    const roleFilterSql =
      mode === "tutor"
        ? "AND r.tutor_id::text = $1"
        : mode === "caregiver"
        ? "AND r.caregiver_id::text = $1"
        : "";

    const sql = `
      SELECT
        r.id AS reservation_id,
        rv.reviewer_id AS from_user_id,
        COALESCE(u.name, u.email, 'Usuário') AS from_user_name,
        u.image AS from_user_image,
        u.city AS from_user_city,

        rv.rating AS rating,
        rv.comment AS review,

        rv.is_hidden AS is_hidden,
        rv.hidden_reason AS hidden_reason,
        rv.hidden_at AS hidden_at,

        r.service,
        r.start_date,
        r.end_date,
        r.neighborhood,
        r.city

      FROM reviews rv
      JOIN reservations r ON r.id = rv.reservation_id
      LEFT JOIN users u ON u.id::text = rv.reviewer_id::text

      WHERE rv.reviewed_id::text = $1
        AND rv.rating IS NOT NULL
        ${roleFilterSql}
        ${isAdmin ? "" : "AND (rv.is_hidden IS NOT TRUE)"}

      ORDER BY rv.created_at DESC NULLS LAST, r.updated_at DESC NULLS LAST, r.created_at DESC
      LIMIT 1000
    `;

    const { rows } = await pool.query(sql, [idStr]);

    // ✅ compat: alguns fronts esperam "reviews"
    return res.json({
      evaluations: rows || [],
      reviews: rows || [],
      mode: mode || "all",
    });
  } catch (err) {
    console.error("Erro em GET /reservations/my-evaluations:", err);
    return res.status(500).json({
      error: "Erro ao buscar avaliações.",
      code: "LIST_EVAL_FAILED",
    });
  }
}

module.exports = {
  createReservationController,
  listTutorReservationsController,
  listCaregiverReservationsController,
  getReservationDetailController,
  updateReservationStatusController,
  updateReservationRatingController,
  listMyEvaluationsController,
};
