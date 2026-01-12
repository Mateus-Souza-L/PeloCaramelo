// backend/src/controllers/notificationController.js
const notificationModel = require("../models/notificationModel");

function getUserId(req, res) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Não autenticado." });
    return null;
  }
  return String(userId);
}

/**
 * GET /notifications/unread
 * Retorna contagem + lista de notificações não lidas
 */
async function getUnreadNotificationsController(req, res) {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const [count, notifications] = await Promise.all([
      notificationModel.countUnreadNotifications(userId),
      notificationModel.listUnreadNotifications(userId),
    ]);

    return res.json({
      count: Number(count) || 0,
      notifications: Array.isArray(notifications) ? notifications : [],
    });
  } catch (err) {
    console.error("Erro em GET /notifications/unread:", err);
    return res.status(500).json({ error: "Erro ao buscar notificações." });
  }
}

/**
 * POST /notifications/:id/read
 * Marca uma notificação como lida
 */
async function markNotificationReadController(req, res) {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const { id } = req.params;

    const updated = await notificationModel.markNotificationRead({
      userId,
      notificationId: id,
    });

    return res.json({ ok: true, updated: Number(updated) || 0 });
  } catch (err) {
    console.error("Erro em POST /notifications/:id/read:", err);
    return res
      .status(500)
      .json({ error: "Erro ao marcar notificação como lida." });
  }
}

/**
 * POST /notifications/read-all
 * Marca TODAS como lidas
 */
async function markAllNotificationsReadController(req, res) {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const updated = await notificationModel.markAllRead(userId);
    return res.json({ ok: true, updated: Number(updated) || 0 });
  } catch (err) {
    console.error("Erro em POST /notifications/read-all:", err);
    return res.status(500).json({ error: "Erro ao marcar notificações." });
  }
}

/**
 * ✅ POST /notifications/reservation/:reservationId/read
 * Marca todas as notificações NÃO lidas daquela reserva como lidas
 */
async function markReservationNotificationsReadController(req, res) {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const { reservationId } = req.params;

    // Se você ainda não implementou no model, não quebra:
    if (typeof notificationModel.markReservationNotificationsRead !== "function") {
      return res.status(501).json({
        ok: false,
        error:
          "markReservationNotificationsRead não está implementado no notificationModel.",
      });
    }

    const updated = await notificationModel.markReservationNotificationsRead(
      userId,
      reservationId
    );

    return res.json({ ok: true, updated: Number(updated) || 0 });
  } catch (err) {
    console.error(
      "Erro em POST /notifications/reservation/:reservationId/read:",
      err
    );
    return res.status(500).json({
      error: "Erro ao marcar notificações da reserva como lidas.",
    });
  }
}

module.exports = {
  getUnreadNotificationsController,
  markNotificationReadController,
  markAllNotificationsReadController,
  markReservationNotificationsReadController,
};
