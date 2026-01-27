// backend/src/email/templates/reservationAccepted.js

/**
 * Template: Reserva aceita (email para o tutor)
 *
 * Disparo esperado:
 * - quando o cuidador aceita a reserva
 * - destinatário: tutor
 *
 * Uso:
 *   const { buildReservationAcceptedEmail } = require("../email/templates/reservationAccepted");
 *   const email = buildReservationAcceptedEmail({
 *     tutorName,
 *     caregiverName,
 *     startDate,
 *     endDate,
 *     reservationUrl,
 *   });
 *   await sendEmail({ to: tutor.email, ...email });
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
 * @param {string=} params.tutorName
 * @param {string=} params.caregiverName
 * @param {string} params.startDate - string já formatada (ex: 10/02/2026)
 * @param {string} params.endDate   - string já formatada
 * @param {string} params.reservationUrl - link para detalhes da reserva
 */
function buildReservationAcceptedEmail({
  tutorName,
  caregiverName,
  startDate,
  endDate,
  reservationUrl,
}) {
  if (!startDate || !endDate) {
    throw new Error("buildReservationAcceptedEmail: datas ausentes.");
  }
  if (!reservationUrl) {
    throw new Error("buildReservationAcceptedEmail: reservationUrl ausente.");
  }

  const safeTutor = tutorName ? escapeHtml(tutorName) : null;
  const safeCaregiver = caregiverName
    ? escapeHtml(caregiverName)
    : "o cuidador";

  const subject = "Sua reserva foi aceita 🎉";

  const title = "Reserva confirmada com sucesso";

  const preheader =
    "Boa notícia! Sua reserva foi aceita pelo cuidador. Veja os detalhes.";

  const bodyHtml = `
    <p>Olá${safeTutor ? `, <strong>${safeTutor}</strong>` : ""}! 👋</p>

    <p>
      Boas notícias! <strong>${safeCaregiver}</strong> aceitou sua reserva
      na <strong>PeloCaramelo</strong>.
    </p>

    <p>
      <strong>Período confirmado:</strong><br />
      ${escapeHtml(startDate)} até ${escapeHtml(endDate)}
    </p>

    <p>
      Agora você já pode acompanhar a reserva e combinar os próximos passos
      diretamente pela plataforma.
    </p>
  `;

  const cta = {
    label: "Ver detalhes da reserva",
    url: reservationUrl,
  };

  const footerNote =
    "Se você tiver qualquer dúvida, entre em contato pelo painel da plataforma.";

  return renderEmail({
    subject,
    title,
    preheader,
    bodyHtml,
    cta,
    footerNote,
  });
}

module.exports = { buildReservationAcceptedEmail };
