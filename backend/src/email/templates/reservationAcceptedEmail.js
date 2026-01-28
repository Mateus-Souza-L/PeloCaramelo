const { renderEmail } = require("../renderEmail");

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function reservationAcceptedEmail({
  tutorName,
  caregiverName,
  startDate,
  endDate,
  reservationUrl,
}) {
  const subject = "Reserva aceita – PeloCaramelo 🐾";

  const title = "Sua reserva foi aceita!";

  const preheader = "O cuidador confirmou sua reserva. Veja os detalhes no painel.";

  const bodyHtml = `
    <p>Olá${tutorName ? `, <strong>${escapeHtml(tutorName)}</strong>` : ""}! 👋</p>

    <p>
      Boa notícia! Sua reserva com ${caregiverName ? `<strong>${escapeHtml(caregiverName)}</strong>` : "o cuidador"}
      foi <strong>aceita</strong>.
    </p>

    <p>
      <strong>Período:</strong> ${escapeHtml(startDate || "")} até ${escapeHtml(endDate || "")}
    </p>

    <p>
      Acesse seu painel para acompanhar a reserva.
    </p>
  `;

  const cta = {
    label: "Ver minha reserva",
    url: reservationUrl,
  };

  const footerNote =
    "Se você não reconhece essa reserva, fale com a gente respondendo este e-mail.";

  return renderEmail({ subject, title, preheader, bodyHtml, cta, footerNote, brandName: "PeloCaramelo" });
}

module.exports = { reservationAcceptedEmail };
