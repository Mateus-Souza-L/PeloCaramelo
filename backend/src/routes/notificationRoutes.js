// backend/src/routes/notificationRoutes.js
const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  getUnreadNotificationsController,
  markNotificationReadController,
  markAllNotificationsReadController,
  // ✅ opcional: marcar todas de UMA reserva como lidas (se você implementar no controller)
  // markReservationNotificationsReadController,
} = require("../controllers/notificationController");

const router = express.Router();

// 🔒 todas exigem login
router.use(authMiddleware);

/**
 * GET /notifications/unread
 * Retorna notificações NÃO lidas do usuário logado
 */
router.get("/unread", getUnreadNotificationsController);

/**
 * POST /notifications/read-all
 * Marca TODAS as notificações do usuário como lidas
 * (deixa ANTES do /:id/read pra evitar qualquer ambiguidade)
 */
router.post("/read-all", markAllNotificationsReadController);

/**
 * POST /notifications/:id/read
 * Marca UMA notificação como lida (por notificationId)
 */
router.post("/:id/read", markNotificationReadController);

/**
 * ✅ Opcional (recomendado): marcar todas as notificações de UMA reserva como lidas
 *
 * POST /notifications/reservation/:reservationId/read
 */
// router.post(
//   "/reservation/:reservationId/read",
//   markReservationNotificationsReadController
// );

module.exports = router;
