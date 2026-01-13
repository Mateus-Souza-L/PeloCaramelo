// backend/src/routes/caregiverRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");

/**
 * ✅ Regras de rating (fonte única + fallback legado)
 * - Fonte principal: tabela reviews (reviews.reviewed_id = caregiver_id)
 * - Fallback legado: reservations.tutor_rating (somente se ainda NÃO existe review na tabela reviews
 *   para a mesma reserva + mesmo autor)
 *
 * Assim você não duplica nota e não depende mais do legado.
 */

const BASE_FIELDS = `
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
  u.courses
`;

const RATING_LATERAL = `
LEFT JOIN LATERAL (
  WITH union_ratings AS (
    -- 1) reviews reais (fonte de verdade)
    SELECT rv.rating::numeric AS rating
    FROM reviews rv
    WHERE rv.reviewed_id = u.id
      AND (rv.is_hidden IS NOT TRUE)

    UNION ALL

    -- 2) fallback legado: tutor_rating na reservations (se ainda NÃO existe review equivalente)
    SELECT r.tutor_rating::numeric AS rating
    FROM reservations r
    LEFT JOIN reviews rv2
      ON rv2.reservation_id = r.id
     AND rv2.reviewer_id = r.tutor_id
    WHERE r.caregiver_id = u.id
      AND r.tutor_rating IS NOT NULL
      AND r.tutor_rating > 0
      AND (rv2.id IS NULL)
  )
  SELECT
    COALESCE(AVG(rating), 0)     AS rating_avg,
    COUNT(*)::int               AS rating_count
  FROM union_ratings
) rs ON true
`;

const COMPLETED_LATERAL = `
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS completed_reservations
  FROM reservations r
  WHERE r.caregiver_id = u.id
    AND lower(coalesce(r.status, '')) IN ('concluida','concluída','finalizada','completed')
) done ON true
`;

/**
 * GET /caregivers
 * Lista todos os cuidadores com agregados
 */
router.get("/", async (req, res) => {
  try {
    const query = `
      SELECT
        ${BASE_FIELDS},
        COALESCE(rs.rating_avg, 0)   AS rating_avg,
        COALESCE(rs.rating_count, 0) AS rating_count,
        COALESCE(done.completed_reservations, 0) AS completed_reservations
      FROM users u
      ${RATING_LATERAL}
      ${COMPLETED_LATERAL}
      WHERE u.role = 'caregiver'
        AND (u.blocked IS NOT TRUE)
      ORDER BY u.id DESC;
    `;

    const { rows } = await pool.query(query);
    return res.json({ caregivers: rows || [] });
  } catch (err) {
    console.error("Erro ao buscar cuidadores:", err);
    return res.status(500).json({ error: "Erro ao buscar cuidadores." });
  }
});

/**
 * GET /caregivers/:id
 * Detalhe de UM cuidador (usado no CaregiverDetail.jsx)
 */
router.get("/:id", async (req, res) => {
  try {
    const caregiverId = Number(req.params.id);
    if (!Number.isFinite(caregiverId)) {
      return res.status(400).json({ error: "ID inválido." });
    }

    const query = `
      SELECT
        ${BASE_FIELDS},
        COALESCE(rs.rating_avg, 0)   AS rating_avg,
        COALESCE(rs.rating_count, 0) AS rating_count,
        COALESCE(done.completed_reservations, 0) AS completed_reservations
      FROM users u
      ${RATING_LATERAL}
      ${COMPLETED_LATERAL}
      WHERE u.role = 'caregiver'
        AND (u.blocked IS NOT TRUE)
        AND u.id = $1
      LIMIT 1;
    `;

    const { rows } = await pool.query(query, [caregiverId]);

    if (!rows.length) {
      return res.status(404).json({ error: "Cuidador não encontrado." });
    }

    return res.json({ caregiver: rows[0] });
  } catch (err) {
    console.error("Erro ao buscar cuidador:", err);
    return res.status(500).json({ error: "Erro ao buscar cuidador." });
  }
});

module.exports = router;
