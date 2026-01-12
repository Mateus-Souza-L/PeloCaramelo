// backend/src/models/availabilityModel.js
const pool = require("../config/db");

function normDateKey(d) {
  if (d == null) return null;
  const s = String(d).slice(0, 10);
  // valida simples YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function todayKeyUTC() {
  return new Date().toISOString().slice(0, 10);
}

async function upsertAvailabilityDay(caregiverId, dateKey, isAvailable) {
  const dk = normDateKey(dateKey);
  if (!dk) throw new Error("dateKey inválido.");
  if (caregiverId == null) throw new Error("caregiverId inválido.");

  const sql = `
    INSERT INTO availability (caregiver_id, date_key, is_available)
    VALUES ($1, $2, $3)
    ON CONFLICT (caregiver_id, date_key)
    DO UPDATE SET is_available = EXCLUDED.is_available
    RETURNING caregiver_id, date_key, is_available
  `;
  const result = await pool.query(sql, [String(caregiverId), dk, !!isAvailable]);
  return result.rows[0];
}

/**
 * ✅ Bulk eficiente (1 query) mantendo compat com seu formato atual:
 * items: [{ dateKey/date_key, isAvailable/is_available }]
 */
async function upsertAvailabilityBulk(caregiverId, items = []) {
  if (!Array.isArray(items) || items.length === 0) return [];
  if (caregiverId == null) throw new Error("caregiverId inválido.");

  const normalized = [];
  for (const it of items) {
    const dateKey = normDateKey(it?.dateKey || it?.date_key);
    const isAvailable =
      typeof it?.isAvailable === "boolean"
        ? it.isAvailable
        : typeof it?.is_available === "boolean"
        ? it.is_available
        : null;

    if (!dateKey || isAvailable == null) continue;
    normalized.push({ date_key: dateKey, is_available: !!isAvailable });
  }

  if (normalized.length === 0) return [];

  const sql = `
    WITH input AS (
      SELECT *
      FROM jsonb_to_recordset($2::jsonb) AS x(date_key text, is_available boolean)
    )
    INSERT INTO availability (caregiver_id, date_key, is_available)
    SELECT $1, i.date_key, i.is_available
    FROM input i
    ON CONFLICT (caregiver_id, date_key)
    DO UPDATE SET is_available = EXCLUDED.is_available
    RETURNING caregiver_id, date_key, is_available
  `;

  const { rows } = await pool.query(sql, [
    String(caregiverId),
    JSON.stringify(normalized),
  ]);

  return rows;
}

async function listAvailability(caregiverId) {
  if (caregiverId == null) throw new Error("caregiverId inválido.");

  const sql = `
    SELECT date_key, is_available
    FROM availability
    WHERE caregiver_id = $1
    ORDER BY date_key ASC
  `;
  const result = await pool.query(sql, [String(caregiverId)]);
  return result.rows;
}

/**
 * ✅ Sincroniza a disponibilidade do cuidador:
 * - apaga tudo do cuidador
 * - insere apenas os dias disponíveis (true)
 *
 * dateKeys: ["YYYY-MM-DD", ...]
 */
async function replaceAvailability(caregiverId, dateKeys = []) {
  if (caregiverId == null) throw new Error("caregiverId inválido.");

  const todayKey = todayKeyUTC();

  const keys = Array.isArray(dateKeys)
    ? Array.from(new Set(dateKeys.map(normDateKey).filter(Boolean)))
        .filter((k) => k >= todayKey) // ✅ só hoje em diante
        .sort()
    : [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`DELETE FROM availability WHERE caregiver_id = $1`, [
      String(caregiverId),
    ]);

    if (keys.length) {
      const sql = `
        WITH input AS (
          SELECT *
          FROM jsonb_to_recordset($2::jsonb) AS x(date_key text)
        )
        INSERT INTO availability (caregiver_id, date_key, is_available)
        SELECT $1, i.date_key, true
        FROM input i
        RETURNING caregiver_id, date_key, is_available
      `;

      const { rows } = await client.query(sql, [
        String(caregiverId),
        JSON.stringify(keys.map((k) => ({ date_key: k }))),
      ]);

      await client.query("COMMIT");
      return rows;
    }

    await client.query("COMMIT");
    return [];
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

/**
 * ✅ Valida se TODOS os dias do intervalo (inclusive)
 * estão marcados como disponíveis (is_available=true).
 */
async function isCaregiverAvailableForRange(caregiverId, startDate, endDate) {
  const s = normDateKey(startDate);
  const e = normDateKey(endDate);
  if (!s || !e) return false;
  if (caregiverId == null) return false;

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

  const { rows } = await pool.query(sql, [String(caregiverId), s, e]);

  const total = Number(rows?.[0]?.total_days || 0);
  const available = Number(rows?.[0]?.available_days || 0);

  return total > 0 && available === total;
}

/**
 * ✅ ALIAS p/ compat com o controller
 */
async function isRangeAvailable(caregiverId, startDate, endDate) {
  return isCaregiverAvailableForRange(caregiverId, startDate, endDate);
}

/**
 * ✅ Seta disponibilidade para TODO o range (inclusive)
 */
async function setAvailabilityForRange(caregiverId, startDate, endDate, isAvailable) {
  const s = normDateKey(startDate);
  const e = normDateKey(endDate);
  if (!s || !e) throw new Error("Intervalo inválido.");
  if (caregiverId == null) throw new Error("caregiverId inválido.");

  const sql = `
    WITH days AS (
      SELECT generate_series($2::date, $3::date, interval '1 day')::date AS day
    )
    INSERT INTO availability (caregiver_id, date_key, is_available)
    SELECT $1, to_char(days.day, 'YYYY-MM-DD'), $4::boolean
    FROM days
    ON CONFLICT (caregiver_id, date_key)
    DO UPDATE SET is_available = EXCLUDED.is_available
    RETURNING caregiver_id, date_key, is_available
  `;

  const { rows } = await pool.query(sql, [
    String(caregiverId),
    s,
    e,
    !!isAvailable,
  ]);
  return rows;
}

/**
 * ✅ Lista do cuidador com filtro opcional por período
 */
async function getCaregiverAvailability(caregiverId, startKey = null, endKey = null) {
  if (caregiverId == null) throw new Error("caregiverId inválido.");
  const idStr = String(caregiverId);

  const s = startKey ? normDateKey(startKey) : null;
  const e = endKey ? normDateKey(endKey) : null;

  // se um vier sem o outro, não filtra (evita bug de range parcial)
  if (!s || !e) {
    return listAvailability(idStr);
  }

  const sql = `
    SELECT date_key, is_available
    FROM availability
    WHERE caregiver_id::text = $1
      AND date_key::date BETWEEN $2::date AND $3::date
    ORDER BY date_key ASC
  `;
  const { rows } = await pool.query(sql, [idStr, s, e]);
  return rows || [];
}

module.exports = {
  upsertAvailabilityDay,
  upsertAvailabilityBulk,
  listAvailability,
  replaceAvailability,
  isCaregiverAvailableForRange,
  isRangeAvailable,
  setAvailabilityForRange,
  getCaregiverAvailability,
  normDateKey,
};
