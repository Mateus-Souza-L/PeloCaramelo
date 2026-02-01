// backend/src/controllers/caregiverController.js
const pool = require("../config/db");
const { listAllCaregivers, getCaregiverById } = require("../models/caregiverModel");

/**
 * ============================================================
 * Helpers (schema-tolerant)
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

async function hasCaregiverProfileForUserId(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return false;

  const idStr = String(id);
  const linkCol = await detectCaregiverProfilesLinkColumn();

  try {
    if (linkCol === "user_id") {
      const { rows } = await pool.query(
        `
        SELECT 1
        FROM caregiver_profiles
        WHERE (user_id::text = $1) OR (id::text = $1)
        LIMIT 1
        `,
        [idStr]
      );
      return rows?.length > 0;
    }

    if (linkCol === "caregiver_id") {
      const { rows } = await pool.query(
        `
        SELECT 1
        FROM caregiver_profiles
        WHERE (caregiver_id::text = $1) OR (id::text = $1)
        LIMIT 1
        `,
        [idStr]
      );
      return rows?.length > 0;
    }

    // fallback por tentativa/erro
    try {
      const { rows } = await pool.query(
        `
        SELECT 1
        FROM caregiver_profiles
        WHERE (user_id::text = $1) OR (id::text = $1)
        LIMIT 1
        `,
        [idStr]
      );
      cachedLinkCol = "user_id";
      cachedAt = Date.now();
      return rows?.length > 0;
    } catch {
      const { rows } = await pool.query(
        `
        SELECT 1
        FROM caregiver_profiles
        WHERE (caregiver_id::text = $1) OR (id::text = $1)
        LIMIT 1
        `,
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

async function createCaregiverProfileForUserId(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) {
    const e = new Error("INVALID_USER_ID");
    e.status = 400;
    throw e;
  }

  // idempotência: se já existe, retorna
  const already = await hasCaregiverProfileForUserId(id);
  if (already) return { created: false };

  const linkCol = await detectCaregiverProfilesLinkColumn();

  // 1) tenta com coluna detectada
  try {
    if (linkCol === "user_id") {
      await pool.query(
        `
        INSERT INTO caregiver_profiles (user_id)
        VALUES ($1)
        ON CONFLICT DO NOTHING
        `,
        [id]
      );
      return { created: true };
    }

    if (linkCol === "caregiver_id") {
      await pool.query(
        `
        INSERT INTO caregiver_profiles (caregiver_id)
        VALUES ($1)
        ON CONFLICT DO NOTHING
        `,
        [id]
      );
      return { created: true };
    }
  } catch {
    // cai pro fallback
  }

  // 2) fallback por tentativa/erro (user_id -> caregiver_id)
  try {
    await pool.query(
      `
      INSERT INTO caregiver_profiles (user_id)
      VALUES ($1)
      ON CONFLICT DO NOTHING
      `,
      [id]
    );
    cachedLinkCol = "user_id";
    cachedAt = Date.now();
    return { created: true };
  } catch {
    try {
      await pool.query(
        `
        INSERT INTO caregiver_profiles (caregiver_id)
        VALUES ($1)
        ON CONFLICT DO NOTHING
        `,
        [id]
      );
      cachedLinkCol = "caregiver_id";
      cachedAt = Date.now();
      return { created: true };
    } catch {
      // 3) último recurso: schema onde o vínculo é pelo id (id = users.id)
      await pool.query(
        `
        INSERT INTO caregiver_profiles (id)
        VALUES ($1)
        ON CONFLICT (id) DO NOTHING
        `,
        [id]
      );
      return { created: true };
    }
  }
}

/**
 * ============================================================
 * Controllers
 * ============================================================
 */

/**
 * GET /caregivers
 * Lista todos os cuidadores (definidos por caregiver_profiles) com dados seguros.
 * ✅ Agora inclui daily_capacity no retorno (vem do caregiverModel)
 */
async function listCaregiversController(req, res) {
  try {
    const caregivers = await listAllCaregivers();

    // segurança: remove qualquer campo sensível caso algum dia entre no SELECT
    const safe = (caregivers || []).map(
      ({ password, password_hash, token, reset_token, ...clean }) => clean
    );

    return res.json({ caregivers: safe });
  } catch (err) {
    console.error("Erro em GET /caregivers:", err);
    return res.status(500).json({ error: "Erro ao buscar cuidadores." });
  }
}

/**
 * GET /caregivers/:id
 * Detalhe de UM cuidador (definido por caregiver_profiles) com dados seguros.
 * ✅ Agora inclui daily_capacity no retorno (vem do caregiverModel)
 */
async function getCaregiverByIdController(req, res) {
  try {
    const { id } = req.params;

    const caregiverId = Number(id);
    if (!Number.isFinite(caregiverId)) {
      return res.status(400).json({ error: "ID inválido." });
    }

    const caregiver = await getCaregiverById(caregiverId);

    if (!caregiver) {
      return res.status(404).json({ error: "Cuidador não encontrado." });
    }

    const { password, password_hash, token, reset_token, ...safe } = caregiver;
    return res.json({ caregiver: safe });
  } catch (err) {
    console.error("Erro em GET /caregivers/:id:", err);
    return res.status(500).json({ error: "Erro ao buscar cuidador." });
  }
}

/**
 * POST /caregivers/me
 * ✅ Cria perfil de cuidador para o usuário logado (idempotente).
 * - Se já existir, retorna ok sem duplicar.
 * - Se criar, retorna created=true.
 *
 * ✅ Importante: aqui a gente só cria o vínculo no caregiver_profiles.
 * Os campos (services, daily_capacity etc.) ficam no users e serão preenchidos no front
 * (ou via endpoint de update depois).
 */
async function createMyCaregiverProfileController(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: "Não autenticado.",
        code: "UNAUTHENTICATED",
      });
    }

    const result = await createCaregiverProfileForUserId(userId);

    // revalida
    const has = await hasCaregiverProfileForUserId(userId);

    return res.status(200).json({
      ok: true,
      created: Boolean(result?.created),
      hasCaregiverProfile: Boolean(has),
    });
  } catch (err) {
    const status = err?.status || 500;
    console.error("Erro em POST /caregivers/me:", err?.message || err);
    return res.status(status).json({
      error: "Erro ao criar perfil de cuidador.",
      code: "CARE_GIVER_PROFILE_CREATE_FAILED",
    });
  }
}

module.exports = {
  listCaregiversController,
  getCaregiverByIdController,
  createMyCaregiverProfileController,
};
