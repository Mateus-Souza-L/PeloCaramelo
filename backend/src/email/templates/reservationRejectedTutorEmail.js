const { renderEmail } = require("../renderEmail");

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function reservationRejectedTutorEmail({
  tutorName,
  caregiverName,
  startDate,
  endDate,
  rejectReason,
  reservationUrl,
}) {
  const subject = "Reserva recusada – PeloCaramelo 🐾";
  const title = "Sua reserva foi recusada";
  const preheader = "O cuidador recusou a solicitação. Você pode tentar outro cuidador ou novas datas.";

  const reasonBlock = rejectReason
    ? `<p><strong>Motivo informado:</strong> ${escapeHtml(rejectReason)}</p>`
    : "";

  const bodyHtml = `
    <p>Olá${tutorName ? `, <strong>${escapeHtml(tutorName)}</strong>` : ""}! 👋</p>

    <p>
      Sua solicitação de reserva com ${caregiverName ? `<strong>${escapeHtml(caregiverName)}</strong>` : "o cuidador"}
      foi <strong>recusada</strong>.
    </p>

    <p><strong>Período:</strong> ${escapeHtml(startDate || "")} até ${escapeHtml(endDate || "")}</p>

    ${reasonBlock}

    <p>
      Você pode buscar outro cuidador ou tentar novas datas pela plataforma.
    </p>
  `;

  return renderEmail({
    subject,
    title,
    preheader,
    bodyHtml,
    cta: { label: "Ver no painel", url: reservationUrl },
    footerNote: "Se você não reconhece essa solicitação, ignore este e-mail.",
    brandName: "PeloCaramelo",
  });
}

module.exports = { reservationRejectedTutorEmail };
