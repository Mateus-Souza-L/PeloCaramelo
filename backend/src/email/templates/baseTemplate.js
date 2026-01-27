// backend/src/email/templates/baseTemplate.js

/**
 * Template base HTML (reutilizável) para e-mails transacionais do PeloCaramelo.
 *
 * Objetivo:
 * - padronizar layout (tipografia, espaçamento, cores)
 * - suportar "preheader" (texto de prévia no Gmail)
 * - permitir corpo específico via bodyHtml
 * - CTA opcional (botão)
 *
 * Observação:
 * - Mantém HTML simples e compatível com clientes de e-mail (tabelas + inline styles)
 * - Evita CSS avançado e JS (clientes de e-mail bloqueiam)
 */

function escapeHtml(s) {
  // escape mínimo para strings inseridas em partes sensíveis (title, preheader)
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function baseTemplate({
  title,
  preheader,
  bodyHtml,
  cta, // { label, url }
  footerNote, // string opcional
  brandName = "PeloCaramelo",
}) {
  const safeTitle = escapeHtml(title || "");
  const safePreheader = escapeHtml(preheader || "");

  const ctaHtml =
    cta?.label && cta?.url
      ? `
        <tr>
          <td style="padding: 20px 24px 0 24px;">
            <a
              href="${String(cta.url)}"
              target="_blank"
              rel="noopener noreferrer"
              style="
                display: inline-block;
                background: #FFD700;
                color: #5A3A22;
                text-decoration: none;
                font-weight: 700;
                padding: 12px 16px;
                border-radius: 12px;
                font-size: 14px;
              "
            >
              ${escapeHtml(cta.label)}
            </a>
          </td>
        </tr>
      `
      : "";

  const footerNoteHtml = footerNote
    ? `
      <tr>
        <td style="padding: 16px 24px 0 24px; color: #6b7280; font-size: 12px; line-height: 18px;">
          ${escapeHtml(footerNote)}
        </td>
      </tr>
    `
    : "";

  // Preheader: aparece na prévia do cliente de e-mail, mas fica "escondido" no corpo
  const preheaderHtml = safePreheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safePreheader}</div>`
    : "";

  return `
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0; padding:0; background:#f6f7f9;">
    ${preheaderHtml}

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f6f7f9; padding: 24px 0;">
      <tr>
        <td align="center">
          <!-- container -->
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:600px; max-width:600px;">
            <!-- header / brand -->
            <tr>
              <td align="left" style="padding: 0 12px 12px 12px;">
                <div style="font-family: Arial, sans-serif; font-size: 14px; color: #5A3A22; font-weight: 800;">
                  ${escapeHtml(brandName)}
                </div>
              </td>
            </tr>

            <!-- card -->
            <tr>
              <td style="padding: 0 12px;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#ffffff; border-radius: 18px; overflow:hidden; box-shadow: 0 8px 22px rgba(0,0,0,0.06);">
                  <!-- title -->
                  <tr>
                    <td style="padding: 22px 24px 0 24px; font-family: Arial, sans-serif;">
                      <div style="font-size: 18px; line-height: 24px; font-weight: 800; color:#111827;">
                        ${safeTitle}
                      </div>
                    </td>
                  </tr>

                  <!-- body -->
                  <tr>
                    <td style="padding: 12px 24px 0 24px; font-family: Arial, sans-serif; color:#111827;">
                      <div style="font-size: 14px; line-height: 22px;">
                        ${bodyHtml || ""}
                      </div>
                    </td>
                  </tr>

                  ${ctaHtml}

                  ${footerNoteHtml}

                  <!-- divider -->
                  <tr>
                    <td style="padding: 20px 24px 0 24px;">
                      <div style="height:1px; background:#e5e7eb;"></div>
                    </td>
                  </tr>

                  <!-- footer -->
                  <tr>
                    <td style="padding: 14px 24px 20px 24px; font-family: Arial, sans-serif; color:#6b7280;">
                      <div style="font-size: 12px; line-height: 18px;">
                        Este e-mail é automático. Se você não solicitou isso, pode ignorar com segurança.
                      </div>
                      <div style="font-size: 12px; line-height: 18px; margin-top: 6px;">
                        © ${new Date().getFullYear()} ${escapeHtml(brandName)}
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- spacing bottom -->
            <tr>
              <td style="height: 16px;"></td>
            </tr>

            <!-- small print -->
            <tr>
              <td align="center" style="padding: 0 12px; font-family: Arial, sans-serif; color:#9ca3af; font-size: 12px; line-height: 18px;">
                Dica: adicione este remetente aos seus contatos para garantir a entrega.
              </td>
            </tr>
          </table>
          <!-- /container -->
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}

module.exports = { baseTemplate };
