// backend/src/routes/userRoutes.js
const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  getMeController,
  updateMeController,
  adminListUsersController,
  adminBlockUserController,

  // ✅ capacidade do cuidador
  getMyDailyCapacityController,
  updateMyDailyCapacityController,
} = require("../controllers/userController");

const router = express.Router();

// Todas as rotas abaixo exigem autenticação
router.use(authMiddleware);

// Perfil do usuário logado
router.get("/me", getMeController);
router.patch("/me", updateMeController);

// ✅ Capacidade diária do cuidador
router.get("/me/capacity", getMyDailyCapacityController);
router.put("/me/capacity", updateMyDailyCapacityController);

// Rotas de Admin
router.get("/admin/users", adminListUsersController);
router.patch("/admin/users/:id/block", adminBlockUserController);

module.exports = router;
