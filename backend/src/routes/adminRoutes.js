// backend/src/routes/adminRoutes.js
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const adminMasterMiddleware = require("../middleware/adminMasterMiddleware");

const {
  listUsersController,
  setUserBlockedController,
  deleteUserController,
  listReservationsController,
  deleteReservationController,
  createAdminController,
  setUserRoleController,
  listAuditLogsController,
} = require("../controllers/adminController");

const { listAllReviews, hideReview, unhideReview } = require("../controllers/adminReviewController");

// ✅ NOVO: Denúncias (Reports)
const {
  listReportsController,
  updateReportStatusController,
} = require("../controllers/adminReportController");

// 🔒 Todas as rotas de admin exigem autenticação + role=admin*
router.use(authMiddleware, adminMiddleware);

/* ===================== ADMIN ===================== */

router.post("/create-admin", adminMasterMiddleware, createAdminController);

/* ===================== Usuários ===================== */

router.get("/users", listUsersController);

router.patch("/users/:id/block", setUserBlockedController);

// ✅ alterar role (somente admin master)
router.patch("/users/:id/role", adminMasterMiddleware, setUserRoleController);

router.delete("/users/:id", adminMasterMiddleware, deleteUserController);

/* ===================== Reservas ===================== */

router.get("/reservations", listReservationsController);

router.delete("/reservations/:id", adminMasterMiddleware, deleteReservationController);

/* ===================== Avaliações ===================== */

router.get("/reviews", listAllReviews);

router.patch("/reviews/:id/hide", hideReview);

router.patch("/reviews/:id/unhide", unhideReview);

/* ===================== Denúncias (Reports) ===================== */

// lista denúncias (admin)
// filtros opcionais: ?status=open | reviewing | resolved | dismissed
router.get("/reports", listReportsController);

// atualiza status (admin)
router.patch("/reports/:id/status", updateReportStatusController);

/* ===================== Audit Logs ===================== */

router.get("/audit-logs", listAuditLogsController);

module.exports = router;
