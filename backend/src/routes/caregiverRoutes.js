// backend/src/routes/caregiverRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");

/**
 * ✅ Regras de rating (fonte única + fallback legado)
 * - Fonte principal: tabela reviews (reviews.reviewed_id = caregiver_id)
 * - Fallback legado: reservations.tutor_rating (somente se ainda NÃO existe review na tabela reviews
 *   para a mesma reserva + mesmo autor)
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

/* ============================================================
   ✅ POST /caregivers/me
   Cria o "perfil cuidador" para o usuário logado, sem duplicar.
   - NÃO cria novo user
   - NÃO permite duplicar caregiver_profiles
   ============================================================ */
router.post("/me", authMiddleware, async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: "Não autenticado." });
  }

  try {
    // já tem perfil?
    const exists = await pool.query(
      "SELECT 1 FROM caregiver_profiles WHERE user_id = $1 LIMIT 1",
      [userId]
    );

    if (exists.rowCount > 0) {
      return res.status(409).json({
        code: "CAREGIVER_PROFILE_EXISTS",
        error: "Este usuário já possui perfil de cuidador.",
        hasCaregiverProfile: true,
      });
    }

    /**
     * Recomendado: ter UNIQUE(user_id) na tabela caregiver_profiles.
     * Se tiver, ON CONFLICT garante idempotência em corrida (duplo clique).
     */
    const created = await pool.query(
      `
      INSERT INTO caregiver_profiles (user_id, created_at)
      VALUES ($1, NOW())
      ON CONFLICT (user_id) DO NOTHING
      RETURNING id, user_id, created_at
      `,
      [userId]
    );

    // Se não retornou nada (conflito), trata como já existente
    if (!created.rowCount) {
      return res.status(409).json({
        code: "CAREGIVER_PROFILE_EXISTS",
        error: "Este usuário já possui perfil de cuidador.",
        hasCaregiverProfile: true,
      });
    }

    return res.status(201).json({
      ok: true,
      hasCaregiverProfile: true,
      caregiverProfile: created.rows?.[0] || null,
    });
  } catch (err) {
    console.error("Erro em POST /caregivers/me:", err);

    // fallback extra (mensagens variam conforme driver)
    const msg = String(err?.message || "").toLowerCase();
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return res.status(409).json({
        code: "CAREGIVER_PROFILE_EXISTS",
        error: "Este usuário já possui perfil de cuidador.",
        hasCaregiverProfile: true,
      });
    }

    return res.status(500).json({ error: "Erro ao criar perfil de cuidador." });
  }
});

/* ============================================================
   ✅ GET /caregivers
   Lista cuidadores via caregiver_profiles (multi-perfil)
   ============================================================ */
router.get("/", async (req, res) => {
  try {
    const query = `
      SELECT
        ${BASE_FIELDS},
        cp.created_at AS caregiver_profile_created_at,
        COALESCE(rs.rating_avg, 0)   AS rating_avg,
        COALESCE(rs.rating_count, 0) AS rating_count,
        COALESCE(done.completed_reservations, 0) AS completed_reservations
      FROM users u
      INNER JOIN caregiver_profiles cp
        ON cp.user_id = u.id
      ${RATING_LATERAL}
      ${COMPLETED_LATERAL}
      WHERE (u.blocked IS NOT TRUE)
      ORDER BY u.id DESC;
    `;

    const { rows } = await pool.query(query);
    return res.json({ caregivers: rows || [] });
  } catch (err) {
    console.error("Erro ao buscar cuidadores:", err);
    return res.status(500).json({ error: "Erro ao buscar cuidadores." });
  }
});

/* ============================================================
   ✅ GET /caregivers/:id
   Detalhe do cuidador via caregiver_profiles (multi-perfil)
   ============================================================ */
router.get("/:id", async (req, res) => {
  try {
    const caregiverId = Number(req.params.id);
    if (!Number.isFinite(caregiverId)) {
      return res.status(400).json({ error: "ID inválido." });
    }

    const query = `
      SELECT
        ${BASE_FIELDS},
        cp.created_at AS caregiver_profile_created_at,
        COALESCE(rs.rating_avg, 0)   AS rating_avg,
        COALESCE(rs.rating_count, 0) AS rating_count,
        COALESCE(done.completed_reservations, 0) AS completed_reservations
      FROM users u
      INNER JOIN caregiver_profiles cp
        ON cp.user_id = u.id
      ${RATING_LATERAL}
      ${COMPLETED_LATERAL}
      WHERE (u.blocked IS NOT TRUE)
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
