const { renderEmail } = require("../renderEmail");

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function newReservationEmail({
  caregiverName,
  tutorName,
  startDate,
  endDate,
  dashboardUrl,
}) {
  const subject = "Você recebeu uma nova reserva – PeloCaramelo 🐾";

  const title = "Nova reserva recebida";

  const preheader = "Um tutor solicitou uma nova reserva. Veja os detalhes e responda pelo painel.";

  const bodyHtml = `
    <p>Olá${caregiverName ? `, <strong>${escapeHtml(caregiverName)}</strong>` : ""}! 👋</p>

    <p>
      Você recebeu uma nova solicitação de reserva${tutorName ? ` de <strong>${escapeHtml(tutorName)}</strong>` : ""}.
    </p>

    <p>
      <strong>Período:</strong> ${escapeHtml(startDate || "")} até ${escapeHtml(endDate || "")}
    </p>

    <p>
      Acesse seu painel para aceitar ou recusar a reserva.
    </p>
  `;

  const cta = {
    label: "Ver no painel",
    url: dashboardUrl,
  };

  const footerNote =
    "Se você não reconhece essa solicitação, você pode ignorar este e-mail.";

  return renderEmail({ subject, title, preheader, bodyHtml, cta, footerNote, brandName: "PeloCaramelo" });
}

module.exports = { newReservationEmail };
