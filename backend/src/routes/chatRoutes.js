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
 * ===========================================================
 * CHAT - ROTAS
 * Obs:
 * - authMiddleware já está aplicado no server.js
 * - ordem das rotas é importante (unread antes de :reservationId)
 * ===========================================================
 */

/**
 * GET /chat/unread
 * Lista IDs de reservas com mensagens NÃO lidas
 */
router.get("/unread", listUnreadReservationsController);

/**
 * POST /chat/:reservationId/read
 * Marca mensagens como lidas para o usuário logado
 */
router.post("/:reservationId/read", markChatAsReadController);

/**
 * GET /chat/:reservationId
 * Lista mensagens do chat da reserva
 * (liberado após reserva aceita / em andamento / concluída)
 */
router.get("/:reservationId", getChatMessagesController);

/**
 * POST /chat/:reservationId
 * Envia uma mensagem no chat da reserva
 * (somente quando status permite escrita)
 */
router.post("/:reservationId", sendChatMessageController);

module.exports = router;
