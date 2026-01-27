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
   ✅ Schema-tolerant: caregiver_profiles pode ter:
   - user_id
   - caregiver_id
   (e em alguns casos id == users.id, mas aqui usamos linkCol)
   ============================================================ */

let cachedLinkCol = null; // "user_id" | "caregiver_id" | null
let cachedAt = 0;

async function detectLinkColumn() {
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

async function hasCaregiverProfile(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return false;

  const idStr = String(id);
  const linkCol = await detectLinkColumn();

  try {
    if (linkCol === "user_id") {
      const { rows } = await pool.query(
        `SELECT 1 FROM caregiver_profiles WHERE user_id::text = $1 LIMIT 1`,
        [idStr]
      );
      return rows?.length > 0;
    }

    if (linkCol === "caregiver_id") {
      const { rows } = await pool.query(
        `SELECT 1 FROM caregiver_profiles WHERE caregiver_id::text = $1 LIMIT 1`,
        [idStr]
      );
      return rows?.length > 0;
    }

    // fallback por tentativa/erro (não quebra o server)
    try {
      const { rows } = await pool.query(
        `SELECT 1 FROM caregiver_profiles WHERE user_id::text = $1 LIMIT 1`,
        [idStr]
      );
      cachedLinkCol = "user_id";
      cachedAt = Date.now();
      return rows?.length > 0;
    } catch {
      const { rows } = await pool.query(
        `SELECT 1 FROM caregiver_profiles WHERE caregiver_id::text = $1 LIMIT 1`,
        [idStr]
      );
      cachedLinkCol = "caregiver_id";
      cachedAt = Date.now();
      return rows?.length > 0;
    }
  } catch {
    return false;
  }
}

function joinOnCaregiverProfiles(linkCol) {
  // join padrão: cp.<linkCol> = u.id
  if (linkCol === "caregiver_id") return "cp.caregiver_id = u.id";
  // default user_id (se existir)
  return "cp.user_id = u.id";
}

/* ============================================================
   ✅ POST /caregivers/me (idempotente)
   - cria perfil se não existe
   - se já existir: 200 com hasCaregiverProfile true
   ============================================================ */
router.post("/me", authMiddleware, async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: "Não autenticado." });
  }

  try {
    const linkCol = (await detectLinkColumn()) || "user_id";

    const already = await hasCaregiverProfile(userId);
    if (already) {
      return res.status(200).json({
        ok: true,
        created: false,
        hasCaregiverProfile: true,
      });
    }

    // tenta inserir usando a coluna existente
    if (linkCol === "caregiver_id") {
      await pool.query(`INSERT INTO caregiver_profiles (caregiver_id) VALUES ($1)`, [userId]);
    } else {
      // default user_id
      await pool.query(`INSERT INTO caregiver_profiles (user_id) VALUES ($1)`, [userId]);
    }

    return res.status(201).json({
      ok: true,
      created: true,
      hasCaregiverProfile: true,
    });
  } catch (err) {
    console.error("Erro em POST /caregivers/me:", err?.message || err);

    // se deu corrida/duplicidade, trata como idempotente
    const msg = String(err?.message || "").toLowerCase();
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return res.status(200).json({
        ok: true,
        created: false,
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
    const linkCol = (await detectLinkColumn()) || "user_id";
    const joinExpr = joinOnCaregiverProfiles(linkCol);

    const query = `
      SELECT
        ${BASE_FIELDS},
        cp.created_at AS caregiver_profile_created_at,
        COALESCE(rs.rating_avg, 0)   AS rating_avg,
        COALESCE(rs.rating_count, 0) AS rating_count,
        COALESCE(done.completed_reservations, 0) AS completed_reservations
      FROM users u
      INNER JOIN caregiver_profiles cp
        ON ${joinExpr}
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

    const linkCol = (await detectLinkColumn()) || "user_id";
    const joinExpr = joinOnCaregiverProfiles(linkCol);

    const query = `
      SELECT
        ${BASE_FIELDS},
        cp.created_at AS caregiver_profile_created_at,
        COALESCE(rs.rating_avg, 0)   AS rating_avg,
        COALESCE(rs.rating_count, 0) AS rating_count,
        COALESCE(done.completed_reservations, 0) AS completed_reservations
      FROM users u
      INNER JOIN caregiver_profiles cp
        ON ${joinExpr}
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
