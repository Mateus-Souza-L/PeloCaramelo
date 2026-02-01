// backend/src/models/caregiverModel.js
const pool = require("../config/db");

/**
 * Regra oficial:
 * - Um usuário é CUIDADOR se existir registro em caregiver_profiles
 * - Não dependemos mais de users.role para isso
 *
 * ✅ Agora também traz:
 * - daily_capacity (capacidade/dia) do próprio users
 */

/**
 * ============================================================
 * Helpers (schema-tolerant: caregiver_profiles pode ter user_id ou caregiver_id)
 * ============================================================
 */

let cachedLinkCol = null; // "user_id" | "caregiver_id" | null
let cachedAt = 0;

async function detectCaregiverProfilesLinkColumn() {
  const now = Date.now();
  if (cachedAt && now - cachedAt < 5 * 60 * 1000) return cachedLinkCol;

  try {
    const { rows } = await pool.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'caregiver_profiles'
        AND column_name IN ('user_id', 'caregiver_id')
      `
    );

    const cols = new Set((rows || []).map((r) => String(r.column_name)));

    if (cols.has("user_id")) cachedLinkCol = "user_id";
    else if (cols.has("caregiver_id")) cachedLinkCol = "caregiver_id";
    else cachedLinkCol = null;

    cachedAt = now;
    return cachedLinkCol;
  } catch {
    cachedLinkCol = null;
    cachedAt = now;
    return null;
  }
}

function joinOnCaregiverProfiles(linkCol) {
  if (linkCol === "caregiver_id") return "cp.caregiver_id = u.id";
  return "cp.user_id = u.id"; // default
}

/**
 * ============================================================
 * Queries
 * ============================================================
 */

/**
 * Lista cuidadores ativos (não bloqueados) com agregados:
 * - rating_avg / rating_count
 * - completed_reservations
 * - daily_capacity
 */
async function listAllCaregivers() {
  const linkCol = (await detectCaregiverProfilesLinkColumn()) || "user_id";
  const joinExpr = joinOnCaregiverProfiles(linkCol);

  const query = `
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.image,
      u.bio,
      u.phone,
      u.address,
      u.neighborhood,
      u.city,
      u.cep,
      u.services,
      u.prices,
      u.courses,
      u.available_dates,
      u.daily_capacity,
      u.blocked,
      u.created_at,

      -- rating médio (reviews + fallback legado)
      COALESCE(AVG(r.tutor_rating), 0) AS rating_avg,
      COUNT(r.tutor_rating)           AS rating_count,

      -- reservas concluídas
      COUNT(*) FILTER (
        WHERE r.id IS NOT NULL
          AND lower(coalesce(r.status, '')) IN ('aceita','concluida','concluída','finalizada','completed')
          AND r.end_date < CURRENT_DATE
      ) AS completed_reservations

    FROM users u

    -- 👇 define quem é cuidador
    INNER JOIN caregiver_profiles cp
      ON ${joinExpr}

    LEFT JOIN reservations r
      ON r.caregiver_id = u.id

    WHERE u.blocked IS NOT TRUE

    GROUP BY
      u.id, u.name, u.email, u.role, u.image, u.bio, u.phone,
      u.address, u.neighborhood, u.city, u.cep, u.services,
      u.prices, u.courses, u.available_dates, u.daily_capacity, u.blocked, u.created_at

    ORDER BY u.id DESC;
  `;

  const { rows } = await pool.query(query);
  return rows || [];
}

/**
 * Detalhe de 1 cuidador com os mesmos agregados
 */
async function getCaregiverById(caregiverId) {
  const linkCol = (await detectCaregiverProfilesLinkColumn()) || "user_id";
  const joinExpr = joinOnCaregiverProfiles(linkCol);

  const query = `
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.image,
      u.bio,
      u.phone,
      u.address,
      u.neighborhood,
      u.city,
      u.cep,
      u.services,
      u.prices,
      u.courses,
      u.available_dates,
      u.daily_capacity,
      u.blocked,
      u.created_at,

      COALESCE(AVG(r.tutor_rating), 0) AS rating_avg,
      COUNT(r.tutor_rating)           AS rating_count,

      COUNT(*) FILTER (
        WHERE r.id IS NOT NULL
          AND lower(coalesce(r.status, '')) IN ('aceita','concluida','concluída','finalizada','completed')
          AND r.end_date < CURRENT_DATE
      ) AS completed_reservations

    FROM users u

    INNER JOIN caregiver_profiles cp
      ON ${joinExpr}

    LEFT JOIN reservations r
      ON r.caregiver_id = u.id

    WHERE u.blocked IS NOT TRUE
      AND u.id = $1

    GROUP BY
      u.id, u.name, u.email, u.role, u.image, u.bio, u.phone,
      u.address, u.neighborhood, u.city, u.cep, u.services,
      u.prices, u.courses, u.available_dates, u.daily_capacity, u.blocked, u.created_at

    LIMIT 1;
  `;

  const { rows } = await pool.query(query, [Number(caregiverId)]);
  return rows?.[0] || null;
}

module.exports = {
  listAllCaregivers,
  getCaregiverById,
};
