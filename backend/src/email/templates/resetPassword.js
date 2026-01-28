// backend/src/email/templates/resetPassword.js
const { renderEmail } = require("../renderEmail");

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Template transacional: Reset de senha
 * @param {Object} params
 * @param {string} params.link
 * @param {number} params.minutes
 * @param {string=} params.brandName
 */
function resetPasswordEmail({ link, minutes, brandName }) {
  const safeLink = String(link || "").trim();
  const safeMinutes = Number.isFinite(Number(minutes)) ? Number(minutes) : 60;

  const subject = "Recuperação de senha – PeloCaramelo";

  const bodyHtml = `
    <p style="margin:0 0 12px;">
      Recebemos uma solicitação para redefinir a senha da sua conta no <strong>PeloCaramelo</strong>.
    </p>

    <p style="margin:0 0 16px;">
      Para criar uma nova senha, clique no botão abaixo. Este link expira em aproximadamente
      <strong>${escapeHtml(String(safeMinutes))} minutos</strong>.
    </p>

    <p style="margin:0;">
      Se você não solicitou isso, pode ignorar este e-mail com segurança.
    </p>

    <p style="margin:16px 0 0; font-size:12px; color:#6b7280;">
      Se o botão não funcionar, copie e cole este link no navegador:
      <br />
      <a href="${escapeHtml(safeLink)}" style="text-decoration:underline;">
        ${escapeHtml(safeLink)}
      </a>
    </p>
  `;

  return renderEmail({
    subject,
    title: "Recuperação de senha",
    preheader: "Use o link para redefinir sua senha.",
    bodyHtml,
    cta: {
      label: "Criar nova senha",
      url: safeLink,
    },
    footerNote: "Se você não solicitou essa recuperação, ignore este e-mail.",
    brandName: brandName || "PeloCaramelo",
  });
}

module.exports = { resetPasswordEmail };
