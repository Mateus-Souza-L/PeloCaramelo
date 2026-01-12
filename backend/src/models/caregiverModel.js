// backend/src/models/caregiverModel.js
const pool = require("../config/db");

/**
 * Lista cuidadores ativos (não bloqueados) com agregados:
 * - rating_avg / rating_count (baseado em reservations.tutor_rating)
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

      COALESCE(AVG(r.tutor_rating), 0) AS rating_avg,
      COUNT(r.tutor_rating)           AS rating_count,

      COUNT(*) FILTER (
        WHERE r.id IS NOT NULL
          AND (r.status = 'Aceita' OR r.status = 'Concluida' OR r.status = 'Concluída')
          AND r.end_date < CURRENT_DATE
      ) AS completed_reservations
    FROM users u
    LEFT JOIN reservations r
      ON r.caregiver_id = u.id
    WHERE u.role = 'caregiver'
      AND u.blocked = false
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
          AND (r.status = 'Aceita' OR r.status = 'Concluida' OR r.status = 'Concluída')
          AND r.end_date < CURRENT_DATE
      ) AS completed_reservations
    FROM users u
    LEFT JOIN reservations r
      ON r.caregiver_id = u.id
    WHERE u.role = 'caregiver'
      AND u.blocked = false
      AND u.id = $1
    GROUP BY
      u.id, u.name, u.email, u.role, u.image, u.bio, u.phone,
      u.address, u.neighborhood, u.city, u.cep, u.services,
      u.prices, u.courses, u.available_dates, u.blocked, u.created_at
    LIMIT 1;
  `;

  const { rows } = await pool.query(query, [String(caregiverId)]);
  return rows?.[0] || null;
}

module.exports = {
  listAllCaregivers,
  getCaregiverById,
};
