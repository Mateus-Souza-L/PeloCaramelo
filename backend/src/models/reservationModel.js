// backend/src/models/reservationModel.js
const pool = require("../config/db");

const AVAIL_TABLE = process.env.AVAIL_TABLE || "availability";
const AVAIL_COL_CAREGIVER = process.env.AVAIL_COL_CAREGIVER || "caregiver_id";
const AVAIL_COL_DATEKEY = process.env.AVAIL_COL_DATEKEY || "date_key";
const AVAIL_COL_AVAILABLE = process.env.AVAIL_COL_AVAILABLE || "is_available";

const BLOCKING_STATUSES = [
  "Aceita",
  "Finalizada",
  "Concluida",
  "Concluída",
  "Em andamento",
];

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
const SAFE_AVAIL_COL_CAREGIVER = assertSafeIdentifier(
  AVAIL_COL_CAREGIVER,
  "column"
);
const SAFE_AVAIL_COL_DATEKEY = assertSafeIdentifier(AVAIL_COL_DATEKEY, "column");
const SAFE_AVAIL_COL_AVAILABLE = assertSafeIdentifier(
  AVAIL_COL_AVAILABLE,
  "column"
);

function mapReservationRow(row) {
  if (!row) return null;

  const obj = {
    id: row.id,

    tutor_id: row.tutor_id,
    caregiver_id: row.caregiver_id,

    tutor_name: row.tutor_name,
    caregiver_name: row.caregiver_name,
    city: row.city,
    neighborhood: row.neighborhood,
    service: row.service,
    price_per_day: row.price_per_day,
    start_date: row.start_date,
    end_date: row.end_date,
    total: row.total,
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
    reject_reason: row.reject_reason,
  };

  obj.tutorId = row.tutor_id != null ? String(row.tutor_id) : null;
  obj.caregiverId = row.caregiver_id != null ? String(row.caregiver_id) : null;
  obj.startDate = row.start_date;
  obj.endDate = row.end_date;

  return obj;
}

function toJsonbArray(value) {
  if (value == null) return JSON.stringify([]);
  if (Array.isArray(value)) return JSON.stringify(value);
  return JSON.stringify([value]);
}

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

// Aceita: [1,2], ["1","2"], "1,2", "[1,2]" (string JSON), null
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

  const ids = arr
    .map((x) => toInt(x))
    .filter((n) => n != null);

  return Array.from(new Set(ids));
}

function getDefaultCap() {
  const raw = Number(process.env.DEFAULT_DAILY_CAPACITY ?? 15);
  const cap = Number.isFinite(raw) ? Math.trunc(raw) : 15;
  if (cap < 1) return 1;
  if (cap > 100) return 100;
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
  const petsIdsIntArray = normalizePetsIds(petsIds); // ✅ int[]
  const petsSnapshotJson = toJsonbArray(petsSnapshot);

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
    tutorId,
    caregiverId,
    tutorName,
    caregiverName,
    city || null,
    neighborhood || null,
    service,
    pricePerDay,
    startDate,
    endDate,
    total,
    status || "Pendente",
    petsIdsIntArray, // ✅ agora é array de int
    petsNames || null,
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
      r.reject_reason

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

async function updateReservationStatus(id, status, rejectReason = null) {
  const cleanedReason =
    typeof rejectReason === "string" && rejectReason.trim()
      ? rejectReason.trim()
      : null;

  const sql = `
    UPDATE reservations
    SET
      status = $2,
      reject_reason = CASE
        WHEN $2 = 'Recusada' THEN $3
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
  const cleanedComment =
    typeof comment === "string" && comment.trim() ? comment.trim() : null;

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

async function getMaxOverlappingByDay(
  caregiverId,
  startDate,
  endDate,
  excludeReservationId = null
) {
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

async function assertCaregiverCanBeBooked(
  caregiverId,
  startDate,
  endDate,
  excludeReservationId = null
) {
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
