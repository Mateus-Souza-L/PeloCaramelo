// backend/src/middleware/requireCaregiverProfile.js
const pool = require("../config/db");

async function requireCaregiverProfile(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: "Não autenticado.",
        code: "UNAUTHENTICATED",
      });
    }

    // ✅ Fast path: se o authMiddleware já injetou a flag, confia nela
    if (req.user?.hasCaregiverProfile === true) {
      return next();
    }

    // ✅ Se a flag veio explicitamente false, ainda fazemos fallback no banco
    // (evita inconsistência caso authMiddleware não esteja atualizado em algum ambiente)
    const { rows } = await pool.query(
      "SELECT 1 FROM caregiver_profiles WHERE user_id = $1 LIMIT 1",
      [String(userId)]
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
