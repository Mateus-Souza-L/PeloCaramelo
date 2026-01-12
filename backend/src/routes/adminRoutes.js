// backend/src/routes/adminRoutes.js
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

// controllers gerais de admin
const {
  listUsersController,
  setUserBlockedController,
  deleteUserController,
  listReservationsController,
  deleteReservationController,
} = require("../controllers/adminController");

// ✅ controller separado de avaliações (Opção A)
const {
  listAllReviews,
  hideReview,
  unhideReview,
} = require("../controllers/adminReviewController");

// 🔒 Todas as rotas de admin exigem autenticação + role=admin
router.use(authMiddleware, adminMiddleware);

/* ===================== Usuários ===================== */

// GET /admin/users
router.get("/users", listUsersController);

// PATCH /admin/users/:id/block  { blocked: true/false }
router.patch("/users/:id/block", setUserBlockedController);

// DELETE /admin/users/:id
router.delete("/users/:id", deleteUserController);

/* ===================== Reservas ===================== */

// GET /admin/reservations
router.get("/reservations", listReservationsController);

// DELETE /admin/reservations/:id
router.delete("/reservations/:id", deleteReservationController);

/* ===================== Avaliações ===================== */

// GET /admin/reviews
router.get("/reviews", listAllReviews);

// PATCH /admin/reviews/:id/hide  { reason?: string }
router.patch("/reviews/:id/hide", hideReview);

// PATCH /admin/reviews/:id/unhide
router.patch("/reviews/:id/unhide", unhideReview);

module.exports = router;
