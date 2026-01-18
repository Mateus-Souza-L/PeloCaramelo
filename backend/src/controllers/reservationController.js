// backend/src/controllers/reservationController.js
const reservationModel = require("../models/reservationModel");
const availabilityModel = require("../models/availabilityModel");
const pool = require("../config/db");
const { createReservationNotification } = require("../models/notificationModel");

// Helpers

function toNum(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toInt(v) {
  const n = toNum(v);
  if (n == null) return null;
  const i = Math.trunc(n);
  return Number.isFinite(i) ? i : null;
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

function parseBodySafe(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;

  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return {};
    try {
      const parsed = JSON.parse(s);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function getResIds(reservation) {
  return {
    tutorId: reservation?.tutorId ?? reservation?.tutor_id ?? null,
    caregiverId: reservation?.caregiverId ?? reservation?.caregiver_id ?? null,
  };
}

function getResStatus(reservation) {
  const s = reservation?.status;
  return typeof s === "string" ? s.trim() : "";
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

function isConcludedStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  return s === "concluida" || s === "concluída" || s === "finalizada";
}

function getStartEndSafe(obj, fallbackReservation) {
  const start = toDateKey(
    obj?.startDate ??
      obj?.start_date ??
      fallbackReservation?.startDate ??
      fallbackReservation?.start_date
  );
  const end = toDateKey(
    obj?.endDate ??
      obj?.end_date ??
      fallbackReservation?.endDate ??
      fallbackReservation?.end_date
  );
  return { start, end };
}

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

async function attachMyReviewFields(reservations, reviewerId) {
  try {
    if (!Array.isArray(reservations) || reservations.length === 0) return reservations;

    const rid = reviewerId != null ? String(reviewerId) : "";
    if (!rid) return reservations;

    const ids = reservations
      .map((r) => toInt(r?.id ?? r?.reservation_id))
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
      const k = String(toInt(r?.id ?? r?.reservation_id) ?? "");
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

  if (availabilityModel && typeof availabilityModel.isRangeAvailable === "function") {
    const ok = await availabilityModel.isRangeAvailable(caregiverIdStr, s, e);
    if (!ok) {
      return { ok: false, code: "NOT_AVAILABLE", message: "Período sem disponibilidade." };
    }
    return { ok: true };
  }

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
  if (!s || !e) {
    return { ok: false, code: "INVALID_RANGE", message: "Intervalo inválido." };
  }

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
    .filter((n) => Number.isFinite(n) && Number.isInteger(n));

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

function cleanNonEmptyString(v) {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

// CREATE (tutor)

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
      cleanNonEmptyString(user?.name) ||
      cleanNonEmptyString(user?.email) ||
      "Tutor";

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

// LIST - tutor

async function listTutorReservationsController(req, res) {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ error: "Não autenticado.", code: "UNAUTHENTICATED" });
    }

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

// LIST - caregiver

async function listCaregiverReservationsController(req, res) {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ error: "Não autenticado.", code: "UNAUTHENTICATED" });
    }

    if (String(user.role) === "admin") {
      const qCaregiverId =
        req.query?.caregiverId != null ? String(req.query.caregiverId) : null;

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

// DETAIL

async function getReservationDetailController(req, res) {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ error: "Não autenticado.", code: "UNAUTHENTICATED" });
    }

    const { id } = req.params;

    let reservation = await reservationModel.getReservationById(id);

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

// UPDATE STATUS (+ NOTIF)

async function updateReservationStatusController(req, res) {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ error: "Não autenticado.", code: "UNAUTHENTICATED" });
    }

    const { id } = req.params;

    const body = parseBodySafe(req.body);
    const rawStatus = body.status;
    const rejectReason = body.rejectReason ?? body.reject_reason ?? null;

    const nextStatus = typeof rawStatus === "string" ? rawStatus.trim() : "";
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

    const prevStatus = getResStatus(reservation);

    const role = user.role;
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

    const currentStatus = getResStatus(reservation);
    const { start: startKey, end: endKey } = getStartEndSafe(reservation, reservation);

    if (!startKey || !endKey) {
      return res.status(400).json({
        error: "Reserva com datas inválidas. Verifique start/end.",
        code: "INVALID_RESERVATION_DATES",
      });
    }

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

      const updated = await reservationModel.updateReservationStatus(id, "Cancelada", null);

      await notifyReservationEventSafe({
        reservation: updated,
        actorUser: user,
        type: "status",
        payload: { reservationId: updated?.id, prevStatus, nextStatus: "Cancelada" },
      });

      return res.json({
        reservation: {
          ...updated,
          price_per_day: updated?.price_per_day != null ? Number(updated.price_per_day) : null,
          total: updated?.total != null ? Number(updated.total) : null,
        },
      });
    }

    if (!isAdmin && role === "caregiver") {
      if (!isOwnerCaregiver) {
        return res.status(403).json({
          error: "Apenas o cuidador responsável pode alterar o status.",
          code: "FORBIDDEN_OWNERSHIP",
        });
      }

      const allowed = new Set(["Aceita", "Recusada", "Concluida", "Concluída", "Finalizada"]);
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

      const updated = await reservationModel.updateReservationStatus(
        id,
        nextStatus,
        nextStatus === "Recusada" ? (rejectReason || null) : null
      );

      await notifyReservationEventSafe({
        reservation: updated,
        actorUser: user,
        type: "status",
        payload: { reservationId: updated?.id, prevStatus, nextStatus },
      });

      return res.json({
        reservation: {
          ...updated,
          price_per_day: updated?.price_per_day != null ? Number(updated.price_per_day) : null,
          total: updated?.total != null ? Number(updated.total) : null,
        },
      });
    }

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

      const updated = await reservationModel.updateReservationStatus(
        id,
        nextStatus,
        nextStatus === "Recusada" ? (rejectReason || null) : null
      );

      await notifyReservationEventSafe({
        reservation: updated,
        actorUser: user,
        type: "status",
        payload: { reservationId: updated?.id, prevStatus, nextStatus },
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

// UPDATE RATING [LEGADO]

async function updateReservationRatingController(req, res) {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ error: "Não autenticado.", code: "UNAUTHENTICATED" });
    }

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

    if (!["tutor", "caregiver"].includes(user.role)) {
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

// GET /reservations/my-evaluations

async function listMyEvaluationsController(req, res) {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ error: "Não autenticado.", code: "UNAUTHENTICATED" });
    }

    const isAdmin = String(user.role || "").toLowerCase() === "admin";
    const idStr = String(user.id);

    const sql = `
      SELECT
        r.id AS reservation_id,
        rv.reviewer_id AS from_user_id,
        COALESCE(u.name, r.tutor_name, r.caregiver_name) AS from_user_name,
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
        ${isAdmin ? "" : "AND (rv.is_hidden IS NOT TRUE)"}

      ORDER BY rv.created_at DESC NULLS LAST, r.updated_at DESC NULLS LAST, r.created_at DESC
      LIMIT 1000
    `;

    const result = await pool.query(sql, [idStr]);
    return res.json({ evaluations: result.rows || [] });
  } catch (err) {
    console.error("Erro em GET /reservations/my-evaluations:", err);
    return res.status(500).json({ error: "Erro ao buscar avaliações.", code: "LIST_EVAL_FAILED" });
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
