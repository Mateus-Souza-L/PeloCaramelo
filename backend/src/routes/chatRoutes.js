// backend/src/routes/chatRoutes.js
const express = require("express");
const {
  sendChatMessageController,
  getChatMessagesController,
  listUnreadReservationsController,
  markChatAsReadController,
} = require("../controllers/chatController");

const router = express.Router();

/**
 * GET /chat/unread
 * Lista IDs de reservas com mensagens NÃO lidas
 * (auth já aplicado no server.js)
 */
router.get("/unread", listUnreadReservationsController);

/**
 * POST /chat/:reservationId/read
 * Marca como LIDAS as mensagens dessa reserva para o usuário logado
 */
router.post("/:reservationId/read", markChatAsReadController);

/**
 * POST /chat/:reservationId
 * Envia uma mensagem no chat da reserva
 */
router.post("/:reservationId", sendChatMessageController);

/**
 * GET /chat/:reservationId
 * Lista mensagens do chat da reserva
 */
router.get("/:reservationId", getChatMessagesController);

module.exports = router;
