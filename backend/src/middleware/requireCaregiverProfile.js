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
    // se falhar (permissão/ambiente), deixa sem cache e cai no fallback por tentativa/erro
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

    // ✅ só tenta caregiver_id se a coluna EXISTE mesmo
    if (detected.hasCaregiverId) {
      const { rows } = await pool.query(
        `SELECT 1 FROM caregiver_profiles WHERE caregiver_id::text = $1 LIMIT 1`,
        [idStr]
      );
      if (rows?.length) return true;
    }

    // ✅ fallback extra: id == users.id (bases antigas)
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
    return !!rows?.length;
  } catch (eUserId) {
    // ✅ Depois tenta id (bases antigas)
    try {
      const { rows } = await pool.query(
        "SELECT 1 FROM caregiver_profiles WHERE id::text = $1 LIMIT 1",
        [idStr]
      );
      return !!rows?.length;
    } catch (eId) {
      // ⚠️ NÃO tenta caregiver_id aqui (porque no seu ambiente isso está quebrando)
      const msg =
        eId?.message ||
        eUserId?.message ||
        "Falha ao validar caregiver_profiles (user_id/id)";

      const err = new Error(msg);
      err._caregiverProfileCheckError = true;
      throw err;
    }
  }
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
