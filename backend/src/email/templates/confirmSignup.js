// backend/src/email/templates/confirmSignup.js

/**
 * Template: Confirmação de cadastro / Boas-vindas
 *
 * Uso:
 *   const { buildConfirmSignupEmail } = require("../email/templates/confirmSignup");
 *   const email = buildConfirmSignupEmail({ userName, appUrl });
 *   await sendEmail({ to: user.email, ...email });
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
 * @param {string=} params.userName - nome do usuário (opcional)
 * @param {string} params.appUrl - URL do app/site
 */
function buildConfirmSignupEmail({ userName, appUrl }) {
  if (!appUrl) {
    throw new Error("buildConfirmSignupEmail: appUrl ausente.");
  }

  const safeName = userName ? escapeHtml(userName) : null;

  const subject = "Bem-vindo(a) à PeloCaramelo 🐾";

  const title = "Seu cadastro foi criado com sucesso!";

  const preheader =
    "Seu cadastro na PeloCaramelo foi concluído. Comece agora a cuidar do seu pet com tranquilidade.";

  const bodyHtml = `
    <p>Olá${safeName ? `, <strong>${safeName}</strong>` : ""}! 👋</p>

    <p>
      Que alegria ter você com a gente! Seu cadastro na
      <strong>PeloCaramelo</strong> foi concluído com sucesso.
    </p>

    <p>
      Aqui você pode encontrar cuidadores de confiança, acompanhar reservas
      e garantir mais tranquilidade para você e seu pet.
    </p>

    <p>
      Quando quiser, é só acessar a plataforma e começar.
    </p>
  `;

  const cta = {
    label: "Acessar a PeloCaramelo",
    url: appUrl,
  };

  const footerNote =
    "Se você não criou uma conta na PeloCaramelo, basta ignorar este e-mail.";

  return renderEmail({
    subject,
    title,
    preheader,
    bodyHtml,
    cta,
    footerNote,
  });
}

module.exports = { buildConfirmSignupEmail };
