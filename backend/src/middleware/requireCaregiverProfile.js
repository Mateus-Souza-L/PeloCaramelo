// backend/src/middleware/requireCaregiverProfile.js
const pool = require("../config/db");

/**
 * Garante que o usuário tenha "perfil de cuidador".
 *
 * ✅ Multi-schema tolerante:
 * - caregiver_profiles pode ter user_id, caregiver_id ou id
 * - alguns ambientes usam tabela caregivers (user_id)
 *
 * ✅ Fix importante:
 * - NÃO tentar coluna inexistente (evita: column does not exist)
 * - fallback seguro: aceita "caregivers" caso exista e tenha vínculo com user_id
 *
 * ✅ Opção A (definitiva p/ seu caso):
 * - se o usuário já está com role "caregiver", libera acesso (não depende de caregiver_profiles)
 */

// ------------------------------
// cache em memória (reduz consultas no information_schema)
// ------------------------------
let cachedCpCols = null; // { hasUserId: boolean, hasCaregiverId: boolean, hasId: boolean }
let cachedCpAt = 0;

let cachedCaregiversTable = null; // { exists: boolean, hasUserId: boolean }
let cachedCaregiversAt = 0;

// ------------------------------
// caregiver_profiles detection
// ------------------------------
async function detectCaregiverProfilesColumns() {
  const now = Date.now();
  if (cachedCpCols && now - cachedCpAt < 5 * 60 * 1000) return cachedCpCols;

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

    cachedCpCols = cols;
    cachedCpAt = now;
    return cols;
  } catch {
    cachedCpCols = null;
    cachedCpAt = now;
    return null;
  }
}

async function existsCaregiverProfileByUserId(userId) {
  const idStr = String(userId);

  // 1) se detectou colunas, usa SÓ as que existem
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

// ------------------------------
// caregivers table fallback detection
// ------------------------------
async function detectCaregiversTable() {
  const now = Date.now();
  if (cachedCaregiversTable && now - cachedCaregiversAt < 5 * 60 * 1000) {
    return cachedCaregiversTable;
  }

  // default: não existe
  const info = { exists: false, hasUserId: false };

  try {
    // 1) checa se tabela existe
    const { rows: tRows } = await pool.query(
      `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'caregivers'
      LIMIT 1
      `
    );

    if (!tRows?.length) {
      cachedCaregiversTable = info;
      cachedCaregiversAt = now;
      return info;
    }

    info.exists = true;

    // 2) checa se tem user_id
    const { rows: cRows } = await pool.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'caregivers'
        AND column_name IN ('user_id')
      `
    );

    const set = new Set((cRows || []).map((r) => String(r.column_name)));
    info.hasUserId = set.has("user_id");

    cachedCaregiversTable = info;
    cachedCaregiversAt = now;
    return info;
  } catch {
    cachedCaregiversTable = info;
    cachedCaregiversAt = now;
    return info;
  }
}

async function existsCaregiverInCaregiversByUserId(userId) {
  const idStr = String(userId ?? "").trim();
  if (!idStr) return false;

  const detected = await detectCaregiversTable();

  // se não existe, não bloqueia — só retorna false
  if (!detected?.exists) return false;

  // se existe mas não tem user_id, tenta fallback por tentativa/erro
  if (detected.hasUserId) {
    try {
      const { rows } = await pool.query(
        `SELECT 1 FROM caregivers WHERE user_id::text = $1 LIMIT 1`,
        [idStr]
      );
      return rows?.length > 0;
    } catch (e) {
      // se a coluna sumiu, só falha como false
      if (e?.code === "42703") return false;
      // se a tabela sumiu, false
      if (e?.code === "42P01") return false;
      throw e;
    }
  }

  // fallback tentativa/erro
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM caregivers WHERE user_id::text = $1 LIMIT 1`,
      [idStr]
    );
    return rows?.length > 0;
  } catch (e) {
    if (e?.code === "42703") return false;
    if (e?.code === "42P01") return false;
    return false;
  }
}

// ------------------------------
// middleware principal
// ------------------------------
async function requireCaregiverProfile(req, res, next) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        error: "Não autenticado.",
        code: "UNAUTHENTICATED",
      });
    }

    const role = String(req.user?.role || "").toLowerCase().trim();

    // ✅ Admin passa sempre
    if (role === "admin" || role === "admin_master") return next();

    // ✅ Opção A: se o usuário já está com role caregiver, permite acessar
    if (role === "caregiver") return next();

    // ✅ fast-path: se authMiddleware injetou a flag
    if (req.user?.hasCaregiverProfile === true) return next();

    // ✅ 1) tenta caregiver_profiles (multi-schema)
    let ok = false;
    try {
      ok = await existsCaregiverProfileByUserId(userId);
    } catch (e) {
      console.error(
        "[requireCaregiverProfile] caregiver_profiles check error:",
        e?.message || e
      );
      ok = false;
    }

    // ✅ 2) fallback: tabela caregivers (se existir)
    if (!ok) {
      try {
        ok = await existsCaregiverInCaregiversByUserId(userId);
      } catch (e) {
        console.error("[requireCaregiverProfile] caregivers check error:", e?.message || e);
        ok = false;
      }
    }

    if (!ok) {
      return res.status(403).json({
        error: "Apenas cuidadores. Crie seu perfil de cuidador para acessar.",
        code: "CARE_GIVER_PROFILE_REQUIRED",
        hasCaregiverProfile: false,
      });
    }

    // ✅ cache no req.user (ajuda nas próximas rotas no mesmo request-chain)
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
