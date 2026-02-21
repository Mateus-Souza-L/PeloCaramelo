// backend/src/routes/userRoutes.js
const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const {
  // 👤 Perfil
  getMeController,
  updateMeController,
  changeMyPasswordController, // ✅ troca de senha

  // 📅 Disponibilidade
  getMyAvailabilityController,
  updateMyAvailabilityController,

  // 🧮 Capacidade do cuidador
  getMyDailyCapacityController,
  updateMyDailyCapacityController,

  // 🛠️ Admin
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

// 🔐 Trocar senha (logado)
router.put("/me/password", changeMyPasswordController);

// ===========================================================
// 📅 Disponibilidade do cuidador
// ===========================================================
router.get("/me/availability", getMyAvailabilityController);
router.patch("/me/availability", updateMyAvailabilityController);

// ===========================================================
// 🧮 Capacidade diária do cuidador
// ===========================================================
router.get("/me/capacity", getMyDailyCapacityController);
router.put("/me/capacity", updateMyDailyCapacityController);
router.patch("/me/capacity", updateMyDailyCapacityController);

// ===========================================================
// 🛠️ Admin
// ===========================================================
router.get("/admin/users", adminListUsersController);
router.patch("/admin/users/:id/block", adminBlockUserController);

module.exports = router;