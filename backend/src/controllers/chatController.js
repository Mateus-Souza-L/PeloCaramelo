// backend/src/controllers/chatController.js
const reservationModel = require("../models/reservationModel");
const pool = require("../config/db");

const {
  createChatMessage,
  listChatMessagesByReservation,
  markMessagesAsRead,
  listUnreadReservationsByUser,
  shouldSendChatEmailThrottle, // ✅ novo
  touchChatEmailThrottle,      // ✅ novo
} = require("../models/chatModel");

// ✅ e-mails transacionais (Resend)
const { sendEmail } = require("../services/emailService");
const { newChatMessageEmail } = require("../email/templates/newChatMessageEmail");

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
 */
const CHAT_READABLE_STATUSES = new Set(["aceita", "em andamento", "concluida", "concluída", "finalizada"]);
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

// ✅ nome da sala por reserva
function reservationRoom(reservationId) {
  return `reservation:${String(reservationId)}`;
}

/* ===========================================================
   EMAIL HELPERS (base URL + users)
   =========================================================== */

function computeFrontendBase(req) {
  const envBase = String(process.env.FRONTEND_URL || "").trim().replace(/\/$/, "");
  if (envBase) return envBase;

  const origin = String(req.get("origin") || "").trim().replace(/\/$/, "");
  if (origin) return origin;

  const referer = String(req.get("referer") || "").trim();
  if (referer) {
    try {
      const u = new URL(referer);
      return `${u.protocol}//${u.host}`;
    } catch {
      // ignore
    }
  }

  return "";
}

function cleanNonEmptyString(v) {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

async function getUserBasicById(id) {
  try {
    const idStr = id == null ? "" : String(id);
    if (!idStr) return null;

    const sql = `
      SELECT id, name, email
      FROM users
      WHERE id::text = $1
      LIMIT 1
    `;
    const { rows } = await pool.query(sql, [idStr]);
    const r = rows?.[0] || null;
    if (!r) return null;

    const name = typeof r?.name === "string" ? r.name.trim() : "";
    const email = typeof r?.email === "string" ? r.email.trim() : "";

    return { id: r.id, name: name || null, email: email || null };
  } catch (err) {
    console.error("getUserBasicById(chat) error:", err);
    return null;
  }
}

function buildPreview(text, max = 120) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
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

    // ✅ Socket.IO: emite mensagem em tempo real
    const io = req.app?.get("io");
    if (io) {
      io.to(reservationRoom(reservation.id)).emit("chat:message", {
        reservationId: reservation.id,
        message: savedMessage,
      });
    }

    // ✅ EMAIL: nova mensagem no chat (best-effort + anti-spam)
    try {
      const base = computeFrontendBase(req);
      if (!base) {
        console.warn("[chatEmail] FRONTEND_URL/origin ausente. Não envia e-mail (evitar link quebrado).");
      } else {
        const fromUser = await getUserBasicById(userId);
        const toUser = await getUserBasicById(String(toUserId));

        const toEmail = cleanNonEmptyString(toUser?.email);
        if (!toEmail) {
          console.warn("[chatEmail] destinatário sem email. Não envia.");
        } else {
          // ✅ cooldown por conversa + destinatário (default 15min)
          const canSend = await shouldSendChatEmailThrottle({
            reservationId: reservation.id,
            toUserId: String(toUserId),
          });

          if (canSend) {
            // se você tiver rota melhor, ajuste aqui:
            // ex: `${base}/dashboard?tab=chat&reservationId=${reservation.id}`
            const chatUrl = `${base}/dashboard`;

            const payload = newChatMessageEmail({
              toName: toUser?.name || "Usuário",
              fromName: fromUser?.name || "Alguém",
              preview: buildPreview(message, 140),
              chatUrl,
            });

            await sendEmail({ to: toEmail, ...payload });

            // ✅ grava throttle (se tabela existir; senão cai no fallback in-memory do model)
            await touchChatEmailThrottle({
              reservationId: reservation.id,
              toUserId: String(toUserId),
            });
          } else {
            // silencioso: anti-spam ativo
            // console.log("[chatEmail] throttle ativo, não enviou.");
          }
        }
      }
    } catch (e) {
      console.error("[chatEmail] Falha ao enviar e-mail de nova mensagem:", e?.message || e);
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
 * POST /chat/:reservationId/read -> marca como lidas
 * ✅ Emite `chat:read` em tempo real para a sala.
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

    const io = req.app?.get("io");
    if (io) {
      io.to(reservationRoom(reservation.id)).emit("chat:read", {
        reservationId: reservation.id,
        byUserId: userId,
        at: new Date().toISOString(),
        updated: Number(updated) || 0,
      });
    }

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
