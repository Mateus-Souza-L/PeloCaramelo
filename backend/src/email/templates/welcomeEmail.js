// backend/src/email/templates/welcomeEmail.js

/**
 * Template: Boas-vindas / Cadastro criado
 *
 * Uso:
 *   const { welcomeEmail } = require("../email/templates/welcomeEmail");
 *   const email = welcomeEmail({ userName, appUrl });
 *   await sendEmail({ to: user.email, ...email, attachments: [...] });
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
function welcomeEmail({ userName, appUrl }) {
  if (!appUrl) {
    throw new Error("welcomeEmail: appUrl ausente.");
  }

  const safeName = userName ? escapeHtml(userName) : null;

  const subject = "🎉 Bem-vindo(a) à PeloCaramelo — seu presente chegou! 🐾";

  const title = "Que bom ter você por aqui! 🐶🐱";

  const preheader =
    "Seu cadastro foi concluído. Complete seu perfil, confira seu e-mail e aproveite seu presente de boas-vindas.";

  const bodyHtml = `
    <p>Olá${safeName ? `, <strong>${safeName}</strong>` : ""}! 👋</p>

    <p>
      Seja muito bem-vindo(a) à <strong>PeloCaramelo</strong>! 🎉
      Seu cadastro foi criado com sucesso e a partir de agora você pode
      encontrar cuidadores de confiança (ou oferecer seus serviços) com tranquilidade.
    </p>

    <p>
      <strong>✅ Um passo importante:</strong> antes de realizar uma reserva,
      complete todos os dados do seu perfil. Isso deixa tudo mais rápido e seguro
      para você e para o seu pet.
    </p>

    <p>
      <strong>📩 Confere seu e-mail:</strong> deixamos um <strong>presente de boas-vindas</strong> pra você —
      e neste e-mail também vai um <strong>PDF com dicas</strong> para ajudar tutores e cuidadores
      a criarem um ambiente mais saudável e tranquilo para o pet. 🐾
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
    brandName: "PeloCaramelo",
  });
}

module.exports = { 
  sendEmail, 
  sendPalestraQuoteEmail, 
  sendWelcomeEmail 
};