// backend/src/middleware/requireCaregiverProfile.js
const pool = require("../config/db");

/**
 * Garante que o usuário tenha "perfil de cuidador".
 *
 * ✅ Fix importante:
 * - NÃO tentar caregiver_id se a coluna não existir (evita: column "caregiver_id" does not exist)
 * - Fallback adicional: algumas bases antigas usam caregiver_profiles.id == users.id
 */

// cache em memória (reduz consultas no information_schema)
let cachedCols = null; // { hasUserId: boolean, hasCaregiverId: boolean, hasId: boolean }
let cachedAt = 0;

async function detectCaregiverProfilesColumns() {
  const now = Date.now();
  if (cachedCols && now - cachedAt < 5 * 60 * 1000) return cachedCols;

  const cols = { hasUserId: false, hasCaregiverId: false, hasId: false };

  try {
    const sql = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'caregiver_profiles'
        AND column_name IN ('user_id', 'caregiver_id', 'id')
    `;
    const { rows } = await pool.query(sql);

    const set = new Set((rows || []).map((r) => String(r.column_name)));
    cols.hasUserId = set.has("user_id");
    cols.hasCaregiverId = set.has("caregiver_id");
    cols.hasId = set.has("id");

    cachedCols = cols;
    cachedAt = now;
    return cols;
  } catch {
    cachedCols = null;
    cachedAt = now;
    return null;
  }
}

async function existsCaregiverProfileByUserId(userId) {
  const idStr = String(userId);

  // 1) se conseguimos detectar colunas, usamos SÓ as que existem
  const detected = await detectCaregiverProfilesColumns();
  if (detected) {
    if (detected.hasUserId) {
      const { rows } = await pool.query(
        `SELECT 1 FROM caregiver_profiles WHERE user_id::text = $1 LIMIT 1`,
        [idStr]
      );
      if (rows?.length) return true;
    }

    if (detected.hasCaregiverId) {
      const { rows } = await pool.query(
        `SELECT 1 FROM caregiver_profiles WHERE caregiver_id::text = $1 LIMIT 1`,
        [idStr]
      );
      if (rows?.length) return true;
    }

    if (detected.hasId) {
      const { rows } = await pool.query(
        `SELECT 1 FROM caregiver_profiles WHERE id::text = $1 LIMIT 1`,
        [idStr]
      );
      if (rows?.length) return true;
    }

    return false;
  }

  // 2) fallback por tentativa/erro (sem information_schema)
  // ✅ Primeiro tenta user_id
  try {
    const { rows } = await pool.query(
      "SELECT 1 FROM caregiver_profiles WHERE user_id::text = $1 LIMIT 1",
      [idStr]
    );
    if (rows?.length) return true;
  } catch (eUserId) {
    // ignore
  }

  // ✅ Depois tenta id (bases antigas)
  try {
    const { rows } = await pool.query(
      "SELECT 1 FROM caregiver_profiles WHERE id::text = $1 LIMIT 1",
      [idStr]
    );
    if (rows?.length) return true;
  } catch (eId) {
    // ignore
  }

  // ✅ Por último tenta caregiver_id, MAS sem quebrar se a coluna não existir
  try {
    const { rows } = await pool.query(
      "SELECT 1 FROM caregiver_profiles WHERE caregiver_id::text = $1 LIMIT 1",
      [idStr]
    );
    if (rows?.length) return true;
  } catch (eCaregiverId) {
    // se a coluna não existe, só ignora
    if (eCaregiverId?.code === "42703") return false;
    // se a tabela não existe, ignora
    if (eCaregiverId?.code === "42P01") return false;

    const msg = eCaregiverId?.message || "Falha ao validar caregiver_profiles";
    const err = new Error(msg);
    err._caregiverProfileCheckError = true;
    throw err;
  }

  return false;
}

async function requireCaregiverProfile(req, res, next) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        error: "Não autenticado.",
        code: "UNAUTHENTICATED",
      });
    }

    // ✅ Admin passa sempre
    const role = String(req.user?.role || "").toLowerCase().trim();
    if (role === "admin" || role === "admin_master") return next();

    // ✅ fast-path: se authMiddleware injetou a flag
    if (req.user?.hasCaregiverProfile === true) return next();

    const ok = await existsCaregiverProfileByUserId(userId);

    if (!ok) {
      return res.status(403).json({
        error: "Apenas cuidadores. Crie seu perfil de cuidador para acessar.",
        code: "CARE_GIVER_PROFILE_REQUIRED",
        hasCaregiverProfile: false,
      });
    }

    req.user.hasCaregiverProfile = true;
    return next();
  } catch (err) {
    console.error("[requireCaregiverProfile] erro:", err?.message || err);
    return res.status(500).json({
      error: "Erro interno.",
      code: "INTERNAL_ERROR",
    });
  }
}

module.exports = requireCaregiverProfile;
