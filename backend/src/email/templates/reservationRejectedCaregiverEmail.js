const { renderEmail } = require("../renderEmail");

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function reservationRejectedCaregiverEmail({
  caregiverName,
  tutorName,
  startDate,
  endDate,
  rejectReason,
  dashboardUrl,
}) {
  const subject = "Reserva recusada com sucesso – PeloCaramelo 🐾";
  const title = "Você recusou a reserva";
  const preheader = "Registramos sua recusa. Você pode acompanhar pelo painel.";

  const reasonBlock = rejectReason
    ? `<p><strong>Motivo informado:</strong> ${escapeHtml(rejectReason)}</p>`
    : "";

  const bodyHtml = `
    <p>Olá${caregiverName ? `, <strong>${escapeHtml(caregiverName)}</strong>` : ""}! 👋</p>

    <p>
      Você recusou a solicitação de reserva${tutorName ? ` de <strong>${escapeHtml(tutorName)}</strong>` : ""}.
    </p>

    <p><strong>Período:</strong> ${escapeHtml(startDate || "")} até ${escapeHtml(endDate || "")}</p>

    ${reasonBlock}

    <p>
      Se mudar de ideia, você pode acompanhar novas solicitações pelo painel.
    </p>
  `;

  return renderEmail({
    subject,
    title,
    preheader,
    bodyHtml,
    cta: { label: "Abrir painel", url: dashboardUrl },
    footerNote: "Obrigado por manter sua agenda atualizada.",
    brandName: "PeloCaramelo",
  });
}

module.exports = { reservationRejectedCaregiverEmail };
