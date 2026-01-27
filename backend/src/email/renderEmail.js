// backend/src/email/renderEmail.js

/**
 * Renderizador padrão de e-mails transacionais.
 *
 * Responsabilidade:
 * - usar o template base
 * - gerar subject/html/text (text simples como fallback)
 *
 * Uso esperado (nos templates específicos):
 *   const { renderEmail } = require("../renderEmail");
 *   return renderEmail({ subject, title, preheader, bodyHtml, cta, footerNote });
 */

const { baseTemplate } = require("./templates/baseTemplate");

function stripHtmlToText(html) {
  // fallback simples (não perfeito, mas suficiente para text/plain)
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<\/div\s*>/gi, "\n")
    .replace(/<\/li\s*>/gi, "\n")
    .replace(/<li\s*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderEmail({
  subject,
  title,
  preheader,
  bodyHtml,
  cta, // { label, url }
  footerNote,
  brandName,
  // opcional: se você quiser passar text manualmente em algum template
  text,
}) {
  if (!subject) throw new Error("renderEmail: subject ausente.");
  if (!title) throw new Error("renderEmail: title ausente.");
  if (!bodyHtml) throw new Error("renderEmail: bodyHtml ausente.");

  const html = baseTemplate({
    title,
    preheader,
    bodyHtml,
    cta,
    footerNote,
    brandName,
  });

  const computedText =
    text ||
    [
      title,
      "",
      stripHtmlToText(bodyHtml),
      "",
      cta?.label && cta?.url ? `${cta.label}: ${cta.url}` : "",
      footerNote ? `\n${footerNote}` : "",
    ]
      .filter(Boolean)
      .join("\n")
      .trim();

  return {
    subject: String(subject),
    html,
    text: computedText,
  };
}

module.exports = { renderEmail };
