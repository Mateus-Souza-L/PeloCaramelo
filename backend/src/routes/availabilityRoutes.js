// backend/src/routes/availabilityRoutes.js
const router = require("express").Router();
const availabilityController = require("../controllers/availabilityController");
const authMiddleware = require("../middleware/authMiddleware");

// 🔒 Privado (Cuidador gerencia a própria agenda)
router.get("/me", authMiddleware, availabilityController.getMyAvailability);
router.put("/me", authMiddleware, availabilityController.updateMyAvailability);

// ✅ Público (Tutor precisa ver dias disponíveis para reservar)
// Novo (recomendado)
router.get(
  "/caregiver/:caregiverId",
  availabilityController.getCaregiverAvailability
);

// ✅ Público (LEGADO) — compatibilidade com front antigo que chama /availability/:id
router.get("/:caregiverId", availabilityController.getCaregiverAvailability);

module.exports = router;
