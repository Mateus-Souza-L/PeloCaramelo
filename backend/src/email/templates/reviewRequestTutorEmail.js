const { renderEmail } = require("../renderEmail");

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function reviewRequestTutorEmail({
  tutorName,
  caregiverName,
  startDate,
  endDate,
  reviewUrl,
}) {
  const subject = "Como foi a experiência? Avalie o cuidador – PeloCaramelo 🐾";
  const title = "Avalie sua experiência";
  const preheader = "Sua avaliação ajuda a comunidade a encontrar cuidadores de confiança.";

  const bodyHtml = `
    <p>Olá${tutorName ? `, <strong>${escapeHtml(tutorName)}</strong>` : ""}! 👋</p>

    <p>
      Sua reserva com ${caregiverName ? `<strong>${escapeHtml(caregiverName)}</strong>` : "o cuidador"}
      foi marcada como <strong>concluída</strong>.
    </p>

    <p><strong>Período:</strong> ${escapeHtml(startDate || "")} até ${escapeHtml(endDate || "")}</p>

    <p>
      Pode levar só 30 segundos: deixe sua avaliação e ajude outros tutores a escolher com confiança.
    </p>
  `;

  return renderEmail({
    subject,
    title,
    preheader,
    bodyHtml,
    cta: { label: "Avaliar agora", url: reviewUrl },
    footerNote: "Se você não reconhece essa reserva, ignore este e-mail.",
    brandName: "PeloCaramelo",
  });
}

module.exports = { reviewRequestTutorEmail };
