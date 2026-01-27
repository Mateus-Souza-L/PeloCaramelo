// backend/src/middleware/requireCaregiverProfile.js
const pool = require("../config/db");

/**
 * requireCaregiverProfile
 *
 * Permite acesso quando:
 * - usuário é admin/admin_master (sempre passa)
 * - usuário possui um perfil de cuidador no banco
 *
 * Observação importante:
 * Em alguns esquemas, o vínculo pode estar em colunas diferentes:
 * - caregiver_profiles.user_id
 * - caregiver_profiles.caregiver_id
 * - caregiver_profiles.id (quando id == users.id)
 *
 * Então aqui fazemos uma checagem "tolerante" para evitar 403 indevido.
 */
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
    const isAdminLike = role === "admin" || role === "admin_master";
    if (isAdminLike) return next();

    // ✅ Fast path: se algum middleware anterior já setou a flag, confia
    if (req.user?.hasCaregiverProfile === true) return next();

    const idStr = String(userId);

    // ✅ Checagem tolerante (user_id OR caregiver_id OR id)
    const { rows } = await pool.query(
      `
      SELECT 1
      FROM caregiver_profiles
      WHERE
        (user_id::text = $1)
        OR (caregiver_id::text = $1)
        OR (id::text = $1)
      LIMIT 1
      `,
      [idStr]
    );

    if (!rows?.length) {
      return res.status(403).json({
        error: "Apenas cuidadores. Crie seu perfil de cuidador para acessar.",
        code: "CARE_GIVER_PROFILE_REQUIRED",
        hasCaregiverProfile: false,
      });
    }

    // ✅ mantém coerência pro resto do request
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
