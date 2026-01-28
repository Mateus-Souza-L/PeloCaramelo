const { renderEmail } = require("../renderEmail");

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function reviewRequestCaregiverEmail({
  caregiverName,
  tutorName,
  startDate,
  endDate,
  reviewUrl,
}) {
  const subject = "Avalie o tutor – PeloCaramelo 🐾";
  const title = "Conte como foi a experiência";
  const preheader = "Sua avaliação ajuda a melhorar as futuras reservas.";

  const bodyHtml = `
    <p>Olá${caregiverName ? `, <strong>${escapeHtml(caregiverName)}</strong>` : ""}! 👋</p>

    <p>
      A reserva${tutorName ? ` de <strong>${escapeHtml(tutorName)}</strong>` : ""} foi marcada como
      <strong>concluída</strong>.
    </p>

    <p><strong>Período:</strong> ${escapeHtml(startDate || "")} até ${escapeHtml(endDate || "")}</p>

    <p>
      Sua avaliação ajuda a comunidade e deixa o processo mais transparente para todo mundo.
    </p>
  `;

  return renderEmail({
    subject,
    title,
    preheader,
    bodyHtml,
    cta: { label: "Avaliar agora", url: reviewUrl },
    footerNote: "Obrigado por fazer parte da PeloCaramelo.",
    brandName: "PeloCaramelo",
  });
}

module.exports = { reviewRequestCaregiverEmail };
