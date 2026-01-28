const { renderEmail } = require("../renderEmail");

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function reservationCanceledToCaregiverEmail({
  caregiverName,
  tutorName,
  startDate,
  endDate,
  reservationUrl,
}) {
  const subject = "Reserva cancelada pelo tutor – PeloCaramelo 🐾";
  const title = "Uma reserva foi cancelada";
  const preheader = "O tutor cancelou a reserva. Veja os detalhes no painel.";

  const bodyHtml = `
    <p>Olá${caregiverName ? `, <strong>${escapeHtml(caregiverName)}</strong>` : ""}! 👋</p>

    <p>
      A reserva${tutorName ? ` de <strong>${escapeHtml(tutorName)}</strong>` : ""} foi <strong>cancelada</strong>.
    </p>

    <p><strong>Período:</strong> ${escapeHtml(startDate || "")} até ${escapeHtml(endDate || "")}</p>

    <p>
      Você pode acompanhar seus próximos agendamentos no painel.
    </p>
  `;

  return renderEmail({
    subject,
    title,
    preheader,
    bodyHtml,
    cta: { label: "Ver no painel", url: reservationUrl },
    footerNote: "Se você não reconhece essa reserva, ignore este e-mail.",
    brandName: "PeloCaramelo",
  });
}

module.exports = { reservationCanceledToCaregiverEmail };
