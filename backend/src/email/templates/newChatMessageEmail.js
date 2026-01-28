// backend/src/email/templates/newChatMessageEmail.js

/**
 * Template: Nova mensagem no chat
 *
 * Uso:
 *   const { newChatMessageEmail } = require("../email/templates/newChatMessageEmail");
 *   const payload = newChatMessageEmail({ toName, fromName, preview, chatUrl });
 *   await sendEmail({ to: email, ...payload });
 */

const { renderEmail } = require("../renderEmail");

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * @param {Object} params
 * @param {string=} params.toName
 * @param {string=} params.fromName
 * @param {string=} params.preview
 * @param {string} params.chatUrl
 */
function newChatMessageEmail({ toName, fromName, preview, chatUrl }) {
  if (!chatUrl) throw new Error("newChatMessageEmail: chatUrl ausente.");

  const safeTo = toName ? escapeHtml(toName) : "Usuário";
  const safeFrom = fromName ? escapeHtml(fromName) : "Alguém";
  const safePreview = preview ? escapeHtml(preview) : "";

  const subject = `Nova mensagem de ${safeFrom} na PeloCaramelo 🐾`;
  const title = "Você recebeu uma nova mensagem no chat";
  const preheader = safePreview
    ? `Mensagem: ${safePreview}`
    : "Abra o chat para ver a mensagem.";

  const bodyHtml = `
    <p>Olá, <strong>${safeTo}</strong>! 👋</p>

    <p>
      Você recebeu uma nova mensagem de <strong>${safeFrom}</strong> no chat da <strong>PeloCaramelo</strong>.
    </p>

    ${
      safePreview
        ? `<p style="margin: 14px 0; padding: 12px 14px; border-radius: 12px; background: #f7f3ee; border: 1px solid rgba(90,58,34,0.12); color: #5A3A22;">
            “${safePreview}”
          </p>`
        : ""
    }

    <p>Para responder, clique no botão abaixo e abra o chat.</p>
  `;

  const cta = {
    label: "Abrir chat",
    url: chatUrl,
  };

  const footerNote =
    "Se você não reconhece esta conversa, você pode ignorar este e-mail.";

  return renderEmail({
    subject,
    title,
    preheader,
    bodyHtml,
    cta,
    footerNote,
  });
}

module.exports = { newChatMessageEmail };
