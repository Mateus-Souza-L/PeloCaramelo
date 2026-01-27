// backend/src/models/caregiverModel.js
const pool = require("../config/db");

/**
 * Regra oficial:
 * - Um usuário é CUIDADOR se existir registro em caregiver_profiles
 * - Não dependemos mais de users.role para isso
 */

/**
 * Lista cuidadores ativos (não bloqueados) com agregados:
 * - rating_avg / rating_count
 * - completed_reservations
 */
async function listAllCaregivers() {
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
      ON cp.user_id = u.id

    LEFT JOIN reservations r
      ON r.caregiver_id = u.id

    WHERE u.blocked IS NOT TRUE

    GROUP BY
      u.id, u.name, u.email, u.role, u.image, u.bio, u.phone,
      u.address, u.neighborhood, u.city, u.cep, u.services,
      u.prices, u.courses, u.available_dates, u.blocked, u.created_at

    ORDER BY u.id DESC;
  `;

  const { rows } = await pool.query(query);
  return rows || [];
}

/**
 * Detalhe de 1 cuidador com os mesmos agregados
 */
async function getCaregiverById(caregiverId) {
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
      ON cp.user_id = u.id

    LEFT JOIN reservations r
      ON r.caregiver_id = u.id

    WHERE u.blocked IS NOT TRUE
      AND u.id = $1

    GROUP BY
      u.id, u.name, u.email, u.role, u.image, u.bio, u.phone,
      u.address, u.neighborhood, u.city, u.cep, u.services,
      u.prices, u.courses, u.available_dates, u.blocked, u.created_at

    LIMIT 1;
  `;

  const { rows } = await pool.query(query, [Number(caregiverId)]);
  return rows?.[0] || null;
}

module.exports = {
  listAllCaregivers,
  getCaregiverById,
};
