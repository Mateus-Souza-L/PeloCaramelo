// backend/src/controllers/chatController.js
const reservationModel = require("../models/reservationModel");
const {
  createChatMessage,
  listChatMessagesByReservation,
  markMessagesAsRead,
  listUnreadReservationsByUser,
} = require("../models/chatModel");

function getUserId(req, res) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Não autenticado." });
    return null;
  }
  return String(userId);
}

async function getReservationOr404(reservationId, res) {
  const idNum = Number(reservationId);
  if (!Number.isFinite(idNum)) {
    res.status(400).json({ error: "reservationId inválido." });
    return null;
  }

  const reservation = await reservationModel.getReservationById(idNum);
  if (!reservation) {
    res.status(404).json({ error: "Reserva não encontrada." });
    return null;
  }

  return reservation;
}

// ✅ snake/camel safe
function getResIds(reservation) {
  return {
    tutorId: reservation?.tutorId ?? reservation?.tutor_id ?? null,
    caregiverId: reservation?.caregiverId ?? reservation?.caregiver_id ?? null,
  };
}

function canAccessChat(reservation, userId) {
  const { tutorId, caregiverId } = getResIds(reservation);

  const isTutor = tutorId != null && String(tutorId) === String(userId);
  const isCaregiver = caregiverId != null && String(caregiverId) === String(userId);

  return { ok: isTutor || isCaregiver, isTutor, isCaregiver };
}

/**
 * Normaliza status (trim + lower) para evitar 403 por variação de texto
 */
function normalizeStatus(status) {
  return String(status || "").trim().toLowerCase();
}

/**
 * Regra do chat:
 * - leitura (GET mensagens / marcar como lido) pode ser mais permissiva
 * - envio deve ser mais restrito
 *
 * Ajuste a lista conforme seu fluxo de status.
 */
const CHAT_READABLE_STATUSES = new Set([
  "aceita",
  "em andamento",
  "concluida",
  "concluída",
  "finalizada",
]);

const CHAT_WRITABLE_STATUSES = new Set(["aceita", "em andamento"]);

function ensureChatReadable(reservation, res) {
  const st = normalizeStatus(reservation?.status);

  if (!CHAT_READABLE_STATUSES.has(st)) {
    res.status(403).json({
      error: "O chat só é liberado após a reserva ser aceita.",
      status: reservation?.status,
    });
    return false;
  }
  return true;
}

function ensureChatWritable(reservation, res) {
  const st = normalizeStatus(reservation?.status);

  if (!CHAT_WRITABLE_STATUSES.has(st)) {
    res.status(403).json({
      error: "O chat só permite envio de mensagens quando a reserva está aceita.",
      status: reservation?.status,
    });
    return false;
  }
  return true;
}

// ✅ nome da sala por reserva (padronizado com socket.js e ChatBox.jsx)
function reservationRoom(reservationId) {
  return `reservation:${String(reservationId)}`;
}

/**
 * POST /chat/:reservationId -> enviar mensagem
 */
async function sendChatMessageController(req, res) {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const { reservationId } = req.params;

    const rawMessage = req.body?.message;
    const message = typeof rawMessage === "string" ? rawMessage.trim() : "";
    if (!message) {
      return res.status(400).json({ error: "Mensagem obrigatória." });
    }

    const reservation = await getReservationOr404(reservationId, res);
    if (!reservation) return;

    const access = canAccessChat(reservation, userId);
    if (!access.ok) {
      return res.status(403).json({
        error: "Apenas tutor ou cuidador podem enviar mensagens neste chat.",
      });
    }

    // ✅ envio: regra mais restrita
    if (!ensureChatWritable(reservation, res)) return;

    const { tutorId, caregiverId } = getResIds(reservation);
    const toUserId = access.isTutor ? caregiverId : tutorId;

    if (toUserId == null) {
      return res.status(500).json({
        error: "Reserva inválida (destinatário ausente).",
      });
    }

    const savedMessage = await createChatMessage({
      reservationId: reservation.id,
      fromUserId: userId,
      toUserId: String(toUserId),
      message,
    });

    // ✅ Socket.IO: emite para a sala da reserva (tempo real)
    const io = req.app?.get("io");
    if (io) {
      io.to(reservationRoom(reservation.id)).emit("chat:message", {
        reservationId: reservation.id,
        message: savedMessage,
      });
    }

    return res.status(201).json({ message: savedMessage });
  } catch (err) {
    console.error("Erro em POST /chat/:reservationId:", err);
    return res.status(500).json({ error: "Erro ao enviar mensagem." });
  }
}

/**
 * GET /chat/:reservationId -> listar mensagens da reserva
 * (não marca como lido automaticamente)
 */
async function getChatMessagesController(req, res) {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const { reservationId } = req.params;

    const reservation = await getReservationOr404(reservationId, res);
    if (!reservation) return;

    const access = canAccessChat(reservation, userId);
    if (!access.ok) {
      return res.status(403).json({
        error: "Apenas tutor ou cuidador podem visualizar este chat.",
      });
    }

    // ✅ leitura: permite em Aceita/Em andamento/Concluída/Finalizada
    if (!ensureChatReadable(reservation, res)) return;

    const messages = await listChatMessagesByReservation(reservation.id);
    return res.json({ messages: Array.isArray(messages) ? messages : [] });
  } catch (err) {
    console.error("Erro em GET /chat/:reservationId:", err);
    return res.status(500).json({ error: "Erro ao buscar mensagens." });
  }
}

/**
 * POST /chat/:reservationId/read -> marca como lidas as mensagens dessa reserva
 * destinadas ao usuário autenticado.
 */
async function markChatAsReadController(req, res) {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const { reservationId } = req.params;

    const reservation = await getReservationOr404(reservationId, res);
    if (!reservation) return;

    const access = canAccessChat(reservation, userId);
    if (!access.ok) {
      return res.status(403).json({
        error: "Apenas tutor ou cuidador podem atualizar leitura deste chat.",
      });
    }

    // ✅ NÃO bloquear por status aqui (permite limpar unread mesmo após finalizar)
    const updated = await markMessagesAsRead({
      reservationId: reservation.id,
      userId,
    });

    return res.json({ ok: true, updated: Number(updated) || 0 });
  } catch (err) {
    console.error("Erro em POST /chat/:reservationId/read:", err);
    return res.status(500).json({ error: "Erro ao marcar chat como lido." });
  }
}

/**
 * GET /chat/unread -> lista IDs de reservas com mensagem NÃO lida para o usuário
 */
async function listUnreadReservationsController(req, res) {
  try {
    const userId = getUserId(req, res);
    if (!userId) return;

    const reservationIds = await listUnreadReservationsByUser(userId);
    return res.json({
      reservationIds: Array.isArray(reservationIds) ? reservationIds : [],
    });
  } catch (err) {
    console.error("Erro em GET /chat/unread:", err);
    return res.status(500).json({ error: "Erro ao listar notificações de chat." });
  }
}

module.exports = {
  sendChatMessageController,
  getChatMessagesController,
  markChatAsReadController,
  listUnreadReservationsController,
};
