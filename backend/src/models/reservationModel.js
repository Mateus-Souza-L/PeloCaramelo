// backend/src/models/reservationModel.js
const pool = require("../config/db");

const AVAIL_TABLE = process.env.AVAIL_TABLE || "availability";
const AVAIL_COL_CAREGIVER = process.env.AVAIL_COL_CAREGIVER || "caregiver_id";
const AVAIL_COL_DATEKEY = process.env.AVAIL_COL_DATEKEY || "date_key";
const AVAIL_COL_AVAILABLE = process.env.AVAIL_COL_AVAILABLE || "is_available";

// Status que bloqueiam capacidade (alinhado ao controller)
const BLOCKING_STATUSES = ["Aceita", "Concluída", "Concluida"];

function assertSafeIdentifier(name, label = "identifier") {
  if (typeof name !== "string" || !name.trim()) {
    throw new Error(`Invalid SQL ${label}: empty`);
  }
  const v = name.trim();
  const parts = v.split(".");
  const identRe = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  for (const p of parts) {
    if (!identRe.test(p)) {
      throw new Error(`Unsafe SQL ${label}: "${name}"`);
    }
  }
  return v;
}

const SAFE_AVAIL_TABLE = assertSafeIdentifier(AVAIL_TABLE, "table");
const SAFE_AVAIL_COL_CAREGIVER = assertSafeIdentifier(AVAIL_COL_CAREGIVER, "column");
const SAFE_AVAIL_COL_DATEKEY = assertSafeIdentifier(AVAIL_COL_DATEKEY, "column");
const SAFE_AVAIL_COL_AVAILABLE = assertSafeIdentifier(AVAIL_COL_AVAILABLE, "column");

function toNum(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

function mapReservationRow(row) {
  if (!row) return null;

  const pricePerDay = toNum(row.price_per_day);
  const total = toNum(row.total);

  const obj = {
    id: row.id,

    tutor_id: row.tutor_id,
    caregiver_id: row.caregiver_id,

    tutor_name: row.tutor_name,
    caregiver_name: row.caregiver_name,
    city: row.city,
    neighborhood: row.neighborhood,
    service: row.service,
    price_per_day: pricePerDay,
    start_date: row.start_date,
    end_date: row.end_date,
    total: total,
    status: row.status,

    tutor_rating: row.tutor_rating,
    tutor_review: row.tutor_review,
    tutor_review_is_hidden: row.tutor_review_is_hidden,
    tutor_review_hidden_reason: row.tutor_review_hidden_reason,
    tutor_review_hidden_at: row.tutor_review_hidden_at,

    caregiver_rating: row.caregiver_rating,
    caregiver_review: row.caregiver_review,
    caregiver_review_is_hidden: row.caregiver_review_is_hidden,
    caregiver_review_hidden_reason: row.caregiver_review_hidden_reason,
    caregiver_review_hidden_at: row.caregiver_review_hidden_at,

    pets_ids: row.pets_ids,
    pets_names: row.pets_names,
    pets_snapshot: row.pets_snapshot,

    created_at: row.created_at,
    updated_at: row.updated_at,

    // ✅ motivos
    reject_reason: row.reject_reason,
    cancel_reason: row.cancel_reason,
  };

  // compat camel
  obj.tutorId = row.tutor_id != null ? String(row.tutor_id) : null;
  obj.caregiverId = row.caregiver_id != null ? String(row.caregiver_id) : null;
  obj.startDate = row.start_date;
  obj.endDate = row.end_date;

  // ✅ compat camel p/ motivo de cancelamento
  obj.cancelReason = row.cancel_reason ?? row.cancelReason ?? null;

  return obj;
}

function toJsonbArray(value) {
  if (value == null) return JSON.stringify([]);
  if (Array.isArray(value)) return JSON.stringify(value);
  return JSON.stringify([value]);
}

function normalizePetsIds(input) {
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

  if (!Array.isArray(arr)) return [];

  const ids = arr.map((x) => toInt(x)).filter((n) => n != null);
  return Array.from(new Set(ids));
}

function daysInclusive(startDate, endDate) {
  const a = new Date(`${String(startDate).slice(0, 10)}T00:00:00.000Z`);
  const b = new Date(`${String(endDate).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const diff = Math.floor((b.getTime() - a.getTime()) / 86400000);
  return diff >= 0 ? diff + 1 : null;
}

function cleanText(v) {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

async function getUserNameById(id) {
  const sql = `SELECT name FROM users WHERE id::text = $1::text LIMIT 1`;
  const { rows } = await pool.query(sql, [String(id)]);
  const name = rows?.[0]?.name;
  return cleanText(name);
}

async function getPetsSnapshotByIds(tutorId, petsIds) {
  if (!petsIds?.length) return [];
  const sql = `
    SELECT id, name, species, breed, size, age, temperament, notes, image
    FROM pets
    WHERE tutor_id::text = $1::text
      AND id = ANY($2::int[])
    ORDER BY id ASC
  `;
  const { rows } = await pool.query(sql, [String(tutorId), petsIds]);
  return (rows || []).map((p) => ({
    id: p.id,
    name: p.name || "",
    species: p.species || "",
    breed: p.breed || "",
    size: p.size || "",
    age: p.age || "",
    temperament: Array.isArray(p.temperament) ? p.temperament : [],
    notes: p.notes || "",
    image: p.image || "",
  }));
}

/**
 * DEFAULT_DAILY_CAPACITY:
 * - default do sistema (quando users.daily_capacity é NULL)
 * - você pediu para deixar em 50
 * - cuidadores poderão escolher no front 1..50
 */
function getDefaultCap() {
  const raw = Number(process.env.DEFAULT_DAILY_CAPACITY ?? 50);
  const cap = Number.isFinite(raw) ? Math.trunc(raw) : 50;

  if (cap < 1) return 1;
  if (cap > 50) return 50; // ✅ máximo fixo 50
  return cap;
}

async function getCaregiverCapacity(caregiverId) {
  const DEFAULT_CAP = getDefaultCap();

  const sql = `
    SELECT COALESCE(daily_capacity, $2)::int AS daily_capacity
    FROM users
    WHERE id::text = $1::text
    LIMIT 1
  `;

  const { rows } = await pool.query(sql, [String(caregiverId), DEFAULT_CAP]);

  const cap = Number(rows?.[0]?.daily_capacity ?? DEFAULT_CAP);
  const finalCap = Number.isFinite(cap) ? Math.trunc(cap) : DEFAULT_CAP;

  // clamp
  if (finalCap < 1) return 1;
  if (finalCap > 100) return 100;
  return finalCap;
}

async function createReservation({
  tutorId,
  caregiverId,
  tutorName,
  caregiverName,
  city,
  neighborhood,
  service,
  pricePerDay,
  startDate,
  endDate,
  total,
  status,
  petsIds,
  petsNames,
  petsSnapshot,
}) {
  const tutorIdStr = String(tutorId ?? "").trim();
  const caregiverIdStr = String(caregiverId ?? "").trim();
  if (!tutorIdStr) {
    const err = new Error("Tutor inválido.");
    err.code = "INVALID_TUTOR";
    throw err;
  }
  if (!caregiverIdStr) {
    const err = new Error("Cuidador inválido.");
    err.code = "INVALID_CAREGIVER";
    throw err;
  }

  const svc = cleanText(service);
  if (!svc) {
    const err = new Error("Serviço inválido.");
    err.code = "INVALID_SERVICE";
    throw err;
  }

  const ppd = toNum(pricePerDay);
  if (ppd == null || !(ppd > 0)) {
    const err = new Error("Preço por dia inválido.");
    err.code = "INVALID_PRICE_PER_DAY";
    throw err;
  }

  const di = daysInclusive(startDate, endDate);
  if (!di) {
    const err = new Error("Datas inválidas.");
    err.code = "INVALID_DATES";
    throw err;
  }

  const computedTotal = Math.round(ppd * di * 100) / 100;
  const finalTotal = toNum(total);
  const totalToUse = finalTotal != null && finalTotal >= 0 ? finalTotal : computedTotal;

  let petsIdsIntArray = normalizePetsIds(petsIds);

  if (!petsIdsIntArray.length && Array.isArray(petsSnapshot)) {
    const fromSnap = petsSnapshot.map((p) => toInt(p?.id)).filter((n) => n != null);
    petsIdsIntArray = Array.from(new Set(fromSnap));
  }

  if (!petsIdsIntArray.length) {
    const err = new Error("Selecione ao menos 1 pet válido.");
    err.code = "INVALID_PETS";
    throw err;
  }

  let tutorNameDb = cleanText(tutorName);
  let caregiverNameDb = cleanText(caregiverName);

  if (!tutorNameDb) tutorNameDb = (await getUserNameById(tutorIdStr)) || "Tutor";
  if (!caregiverNameDb) caregiverNameDb = (await getUserNameById(caregiverIdStr)) || "Cuidador";

  let snapshotArr = Array.isArray(petsSnapshot) ? petsSnapshot : null;
  if (!snapshotArr) {
    snapshotArr = await getPetsSnapshotByIds(tutorIdStr, petsIdsIntArray);
  }
  const petsSnapshotJson = toJsonbArray(snapshotArr);

  const sql = `
    INSERT INTO reservations (
      tutor_id, caregiver_id,
      tutor_name, caregiver_name,
      city, neighborhood,
      service, price_per_day,
      start_date, end_date,
      total, status,
      pets_ids, pets_names,
      pets_snapshot,
      reject_reason
    )
    VALUES (
      $1, $2,
      $3, $4,
      $5, $6,
      $7, $8,
      $9, $10,
      $11, $12,
      $13::int[], $14,
      $15::jsonb,
      $16
    )
    RETURNING *
  `;

  const values = [
    tutorIdStr,
    caregiverIdStr,
    tutorNameDb,
    caregiverNameDb,
    cleanText(city),
    cleanText(neighborhood),
    svc,
    ppd,
    String(startDate).slice(0, 10),
    String(endDate).slice(0, 10),
    totalToUse,
    cleanText(status) || "Pendente",
    petsIdsIntArray,
    cleanText(petsNames),
    petsSnapshotJson,
    null,
  ];

  const result = await pool.query(sql, values);
  return mapReservationRow(result.rows[0]);
}

function selectReservationWithReviewJoins(whereSql) {
  return `
    SELECT
      r.id,
      r.tutor_id,
      r.caregiver_id,

      r.tutor_name,
      r.caregiver_name,
      r.city,
      r.neighborhood,
      r.service,
      r.price_per_day,
      r.start_date,
      r.end_date,
      r.total,
      r.status,

      rv_tc.rating        AS tutor_rating,
      rv_tc.comment       AS tutor_review,
      rv_tc.is_hidden     AS tutor_review_is_hidden,
      rv_tc.hidden_reason AS tutor_review_hidden_reason,
      rv_tc.hidden_at     AS tutor_review_hidden_at,

      rv_ct.rating        AS caregiver_rating,
      rv_ct.comment       AS caregiver_review,
      rv_ct.is_hidden     AS caregiver_review_is_hidden,
      rv_ct.hidden_reason AS caregiver_review_hidden_reason,
      rv_ct.hidden_at     AS caregiver_review_hidden_at,

      r.pets_ids,
      r.pets_names,
      r.pets_snapshot,

      r.created_at,
      r.updated_at,

      -- ✅ motivos
      r.reject_reason,
      r.cancel_reason

    FROM reservations r

    LEFT JOIN reviews rv_tc
      ON rv_tc.reservation_id = r.id
     AND rv_tc.reviewer_id::text = r.tutor_id::text
     AND rv_tc.reviewed_id::text = r.caregiver_id::text

    LEFT JOIN reviews rv_ct
      ON rv_ct.reservation_id = r.id
     AND rv_ct.reviewer_id::text = r.caregiver_id::text
     AND rv_ct.reviewed_id::text = r.tutor_id::text

    ${whereSql}
  `;
}

async function listTutorReservations(tutorId) {
  const sql = selectReservationWithReviewJoins(`
    WHERE r.tutor_id::text = $1
    ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC
  `);

  const result = await pool.query(sql, [String(tutorId)]);
  return result.rows.map(mapReservationRow);
}

async function listCaregiverReservations(caregiverId) {
  const sql = selectReservationWithReviewJoins(`
    WHERE r.caregiver_id::text = $1
    ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC
  `);

  const result = await pool.query(sql, [String(caregiverId)]);
  return result.rows.map(mapReservationRow);
}

async function listAllReservations(limit = 500) {
  const lim = Number.isFinite(Number(limit)) ? Math.trunc(Number(limit)) : 500;
  const safeLimit = Math.max(1, Math.min(lim, 2000));

  const sql = selectReservationWithReviewJoins(`
    ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC, r.id DESC
    LIMIT ${safeLimit}
  `);

  const result = await pool.query(sql);
  return result.rows.map(mapReservationRow);
}

async function getReservationById(id) {
  const sql = selectReservationWithReviewJoins(`
    WHERE r.id = $1
    LIMIT 1
  `);
  const result = await pool.query(sql, [id]);
  return mapReservationRow(result.rows[0]);
}

/**
 * ✅ Atualiza status + motivo conforme status:
 * - Recusada  -> reject_reason
 * - Cancelada -> cancel_reason
 */
async function updateReservationStatus(id, status, reason = null) {
  const cleanedReason = typeof reason === "string" && reason.trim() ? reason.trim() : null;

  const sql = `
    UPDATE reservations
    SET
      status = $2::varchar,
      reject_reason = CASE
        WHEN $2::varchar = 'Recusada' THEN $3
        ELSE NULL
      END,
      cancel_reason = CASE
        WHEN $2::varchar = 'Cancelada' THEN $3
        ELSE NULL
      END,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const result = await pool.query(sql, [id, status, cleanedReason]);
  return mapReservationRow(result.rows[0]);
}

async function updateReservationRating(id, role, rating, comment) {
  const cleanedComment = typeof comment === "string" && comment.trim() ? comment.trim() : null;

  if (role === "tutor") {
    const sql = `
      UPDATE reservations
      SET tutor_rating = $2, tutor_review = $3, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await pool.query(sql, [id, rating, cleanedComment]);
    return mapReservationRow(result.rows[0]);
  }

  if (role === "caregiver") {
    const sql = `
      UPDATE reservations
      SET caregiver_rating = $2, caregiver_review = $3, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await pool.query(sql, [id, rating, cleanedComment]);
    return mapReservationRow(result.rows[0]);
  }

  throw new Error("Role inválida para avaliação.");
}

async function isCaregiverAvailableForRange(caregiverId, startDate, endDate) {
  const sql = `
    WITH days AS (
      SELECT generate_series($2::date, $3::date, interval '1 day')::date AS day
    )
    SELECT
      COUNT(*)::int AS total_days,
      SUM(CASE WHEN a.${SAFE_AVAIL_COL_AVAILABLE} IS TRUE THEN 1 ELSE 0 END)::int AS available_days
    FROM days d
    LEFT JOIN ${SAFE_AVAIL_TABLE} a
      ON a.${SAFE_AVAIL_COL_CAREGIVER}::text = $1::text
     AND a.${SAFE_AVAIL_COL_DATEKEY}::date = d.day
  `;

  const result = await pool.query(sql, [String(caregiverId), startDate, endDate]);
  const row = result?.rows?.[0] || {};

  const totalDays = Number(row.total_days || 0);
  const availableDays = Number(row.available_days || 0);

  return totalDays > 0 && availableDays === totalDays;
}

async function getMaxOverlappingByDay(caregiverId, startDate, endDate, excludeReservationId = null) {
  const sql = `
    WITH days AS (
      SELECT generate_series($2::date, $3::date, interval '1 day')::date AS day
    ),
    counts AS (
      SELECT
        days.day,
        COUNT(r.*)::int AS cnt
      FROM days
      LEFT JOIN reservations r
        ON r.caregiver_id::text = $1::text
       AND r.status = ANY($4::text[])
       AND r.start_date <= days.day
       AND r.end_date >= days.day
       AND ($5::text IS NULL OR r.id::text <> $5::text)
      GROUP BY days.day
    )
    SELECT COALESCE(MAX(cnt), 0)::int AS max_overlapping
    FROM counts
  `;

  const values = [
    String(caregiverId),
    startDate,
    endDate,
    BLOCKING_STATUSES,
    excludeReservationId != null ? String(excludeReservationId) : null,
  ];

  const { rows } = await pool.query(sql, values);
  return Number(rows?.[0]?.max_overlapping || 0);
}

async function assertCaregiverCanBeBooked(caregiverId, startDate, endDate, excludeReservationId = null) {
  const [available, capacity, maxOverlapping] = await Promise.all([
    isCaregiverAvailableForRange(caregiverId, startDate, endDate),
    getCaregiverCapacity(caregiverId),
    getMaxOverlappingByDay(caregiverId, startDate, endDate, excludeReservationId),
  ]);

  return {
    available,
    capacity,
    maxOverlapping,
    max_overlapping: maxOverlapping,
    maxOverlappingByDay: maxOverlapping,
  };
}

module.exports = {
  createReservation,
  listTutorReservations,
  listCaregiverReservations,
  listAllReservations,
  getReservationById,
  updateReservationStatus,
  updateReservationRating,

  isCaregiverAvailableForRange,
  getCaregiverCapacity,
  getMaxOverlappingByDay,
  assertCaregiverCanBeBooked,
};
