// backend/src/routes/availabilityRoutes.js
const router = require("express").Router();
const availabilityController = require("../controllers/availabilityController");
const authMiddleware = require("../middleware/authMiddleware");
const requireCaregiverProfile = require("../middleware/requireCaregiverProfile");

/**
 * Evita dupla verificação de token se o server.js já aplicou authMiddleware.
 * (Mas garante auth se alguém montar esse router sem middleware por engano.)
 */
function requireAuth(req, res, next) {
  if (req.user?.id) return next();
  return authMiddleware(req, res, next);
}

// ---------------------------------------------------------
// ✅ Auth garantido aqui
// ---------------------------------------------------------

// 🔒 Privado (Cuidador gerencia a própria agenda)
// ✅ Multi-perfil: exige login + perfil cuidador (caregiver_profiles)
// Admin/admin_master também passa pelo requireCaregiverProfile
router.get("/me", requireAuth, requireCaregiverProfile, availabilityController.getMyAvailability);

router.put("/me", requireAuth, requireCaregiverProfile, availabilityController.updateMyAvailability);

// ✅ Público (Tutor precisa ver dias disponíveis para reservar)
router.get("/caregiver/:caregiverId", availabilityController.getCaregiverAvailability);

// ✅ Público (LEGADO) — compatibilidade com front antigo que chama /availability/:id
router.get("/:caregiverId", availabilityController.getCaregiverAvailability);

module.exports = router;
