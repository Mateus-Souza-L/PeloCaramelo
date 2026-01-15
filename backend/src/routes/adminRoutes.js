// backend/src/routes/adminRoutes.js
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const adminMasterMiddleware = require("../middleware/adminMasterMiddleware");

// controllers gerais de admin
const {
  listUsersController,
  setUserBlockedController,
  deleteUserController,
  listReservationsController,
  deleteReservationController,
  createAdminController, // ✅ IMPORT CORRETO
} = require("../controllers/adminController");

// controller separado de avaliações
const {
  listAllReviews,
  hideReview,
  unhideReview,
} = require("../controllers/adminReviewController");

// 🔒 Todas as rotas de admin exigem autenticação + role=admin
router.use(authMiddleware, adminMiddleware);

/* ===================== ADMIN ===================== */

// 🔐 criar admin secundário (somente admin master)
router.post(
  "/create-admin",
  adminMasterMiddleware,
  createAdminController
);

/* ===================== Usuários ===================== */

router.get("/users", listUsersController);

router.patch("/users/:id/block", setUserBlockedController);

router.delete(
  "/users/:id",
  adminMasterMiddleware,
  deleteUserController
);

/* ===================== Reservas ===================== */

router.get("/reservations", listReservationsController);

router.delete(
  "/reservations/:id",
  adminMasterMiddleware,
  deleteReservationController
);

/* ===================== Avaliações ===================== */

router.get("/reviews", listAllReviews);

router.patch("/reviews/:id/hide", hideReview);

router.patch("/reviews/:id/unhide", unhideReview);

module.exports = router;
