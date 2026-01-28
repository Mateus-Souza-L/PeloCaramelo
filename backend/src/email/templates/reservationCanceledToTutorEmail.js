const { renderEmail } = require("../renderEmail");

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function reservationCanceledToTutorEmail({
  tutorName,
  caregiverName,
  startDate,
  endDate,
  reservationUrl,
}) {
  const subject = "Reserva cancelada – PeloCaramelo 🐾";
  const title = "Seu cancelamento foi confirmado";
  const preheader = "A reserva foi cancelada com sucesso. Você pode criar outra quando quiser.";

  const bodyHtml = `
    <p>Olá${tutorName ? `, <strong>${escapeHtml(tutorName)}</strong>` : ""}! 👋</p>

    <p>
      Sua reserva com ${caregiverName ? `<strong>${escapeHtml(caregiverName)}</strong>` : "o cuidador"}
      foi <strong>cancelada</strong> com sucesso.
    </p>

    <p><strong>Período:</strong> ${escapeHtml(startDate || "")} até ${escapeHtml(endDate || "")}</p>

    <p>
      Se quiser, você pode fazer uma nova solicitação pela plataforma.
    </p>
  `;

  return renderEmail({
    subject,
    title,
    preheader,
    bodyHtml,
    cta: { label: "Ir para o painel", url: reservationUrl },
    footerNote: "Obrigado por usar a PeloCaramelo.",
    brandName: "PeloCaramelo",
  });
}

module.exports = { reservationCanceledToTutorEmail };
