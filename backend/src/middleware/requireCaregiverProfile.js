// backend/src/middleware/requireCaregiverProfile.js
const pool = require("../config/db");

/**
 * Middleware: exige "perfil de cuidador" (caregiver_profiles).
 *
 * ✅ Regras:
 * - Admin / admin_master passam direto
 * - Se authMiddleware já injetou req.user.hasCaregiverProfile === true -> passa (fast path)
 * - Caso contrário, consulta caregiver_profiles no banco e injeta req.user.hasCaregiverProfile = true
 *
 * Observação:
 * - Não depende de req.user.role === "caregiver" (multi-perfil)
 * - Fail-safe: se não tiver perfil, retorna 403
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

    // ✅ Fast path: se o authMiddleware já injetou a flag, confia nela
    if (req.user?.hasCaregiverProfile === true) {
      return next();
    }

    // ✅ Fallback no banco (sem depender do role do token)
    // Nota: sua tabela parece usar user_id como int; aqui garantimos número quando possível.
    const uidNum = Number(userId);
    const uidParam = Number.isFinite(uidNum) ? uidNum : String(userId);

    const { rows } = await pool.query(
      "SELECT 1 FROM caregiver_profiles WHERE user_id = $1 LIMIT 1",
      [uidParam]
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
