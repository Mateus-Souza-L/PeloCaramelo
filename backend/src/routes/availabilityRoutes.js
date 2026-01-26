// backend/src/routes/availabilityRoutes.js
const router = require("express").Router();
const availabilityController = require("../controllers/availabilityController");
const authMiddleware = require("../middleware/authMiddleware");
const requireCaregiverProfile = require("../middleware/requireCaregiverProfile");

// 🔒 Privado (Cuidador gerencia a própria agenda)
// Agora exige: login + perfil cuidador
router.get(
  "/me",
  authMiddleware,
  requireCaregiverProfile,
  availabilityController.getMyAvailability
);

router.put(
  "/me",
  authMiddleware,
  requireCaregiverProfile,
  availabilityController.updateMyAvailability
);

// ✅ Público (Tutor precisa ver dias disponíveis para reservar)
router.get("/caregiver/:caregiverId", availabilityController.getCaregiverAvailability);

// ✅ Público (LEGADO) — compatibilidade com front antigo que chama /availability/:id
router.get("/:caregiverId", availabilityController.getCaregiverAvailability);

module.exports = router;
