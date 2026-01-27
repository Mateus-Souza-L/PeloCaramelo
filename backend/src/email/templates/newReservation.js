// backend/src/email/templates/newReservation.js

/**
 * Template: Nova reserva criada (email para o cuidador)
 *
 * Disparo esperado:
 * - quando um tutor cria uma nova reserva
 * - destinatário: cuidador
 *
 * Uso:
 *   const { buildNewReservationEmail } = require("../email/templates/newReservation");
 *   const email = buildNewReservationEmail({
 *     caregiverName,
 *     tutorName,
 *     startDate,
 *     endDate,
 *     dashboardUrl,
 *   });
 *   await sendEmail({ to: caregiver.email, ...email });
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
 * @param {string=} params.caregiverName
 * @param {string=} params.tutorName
 * @param {string} params.startDate - string já formatada (ex: 10/02/2026)
 * @param {string} params.endDate   - string já formatada
 * @param {string} params.dashboardUrl - link para painel do cuidador
 */
function buildNewReservationEmail({
  caregiverName,
  tutorName,
  startDate,
  endDate,
  dashboardUrl,
}) {
  if (!startDate || !endDate) {
    throw new Error("buildNewReservationEmail: datas ausentes.");
  }
  if (!dashboardUrl) {
    throw new Error("buildNewReservationEmail: dashboardUrl ausente.");
  }

  const safeCaregiver = caregiverName ? escapeHtml(caregiverName) : null;
  const safeTutor = tutorName ? escapeHtml(tutorName) : "um tutor";

  const subject = "Nova solicitação de reserva 🐾";

  const title = "Você recebeu uma nova reserva";

  const preheader =
    "Um tutor acabou de solicitar uma reserva. Confira os detalhes no seu painel.";

  const bodyHtml = `
    <p>Olá${safeCaregiver ? `, <strong>${safeCaregiver}</strong>` : ""}! 👋</p>

    <p>
      <strong>${safeTutor}</strong> acabou de solicitar uma nova reserva
      na <strong>PeloCaramelo</strong>.
    </p>

    <p>
      <strong>Período solicitado:</strong><br />
      ${escapeHtml(startDate)} até ${escapeHtml(endDate)}
    </p>

    <p>
      Acesse seu painel para analisar os detalhes e aceitar ou recusar a reserva.
    </p>
  `;

  const cta = {
    label: "Ver reserva no painel",
    url: dashboardUrl,
  };

  const footerNote =
    "Essa solicitação ficará pendente até você tomar uma decisão no painel.";

  return renderEmail({
    subject,
    title,
    preheader,
    bodyHtml,
    cta,
    footerNote,
  });
}

module.exports = { buildNewReservationEmail };
