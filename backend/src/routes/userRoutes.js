// backend/src/routes/userRoutes.js
const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const {
  // perfil
  getMeController,
  updateMeController,

  // disponibilidade
  getMyAvailabilityController,
  updateMyAvailabilityController,

  // ✅ capacidade do cuidador
  getMyDailyCapacityController,
  updateMyDailyCapacityController,

  // admin
  adminListUsersController,
  adminBlockUserController,
} = require("../controllers/userController");

const router = express.Router();

// ===========================================================
// 🔐 Todas as rotas abaixo exigem autenticação
// ===========================================================
router.use(authMiddleware);

// ===========================================================
// 👤 Perfil do usuário logado
// ===========================================================
router.get("/me", getMeController);
router.patch("/me", updateMeController);

// ===========================================================
// 📅 Disponibilidade do cuidador
// ===========================================================
router.get("/me/availability", getMyAvailabilityController);
router.patch("/me/availability", updateMyAvailabilityController);

// ===========================================================
// 🧮 Capacidade diária do cuidador
// ===========================================================
// GET  -> retorna capacidade atual
// PUT  -> define capacidade (1–100)
// PATCH-> alias do PUT (frontend pode usar qualquer um)
router.get("/me/capacity", getMyDailyCapacityController);
router.put("/me/capacity", updateMyDailyCapacityController);
router.patch("/me/capacity", updateMyDailyCapacityController);

// ===========================================================
// 🛠️ Admin
// ===========================================================
router.get("/admin/users", adminListUsersController);
router.patch("/admin/users/:id/block", adminBlockUserController);

module.exports = router;
