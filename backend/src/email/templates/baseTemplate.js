// backend/src/email/templates/baseTemplate.js

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(u) {
  const s = String(u || "").trim();
  if (!s) return "";
  try {
    const parsed = new URL(s);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
    return "";
  } catch {
    return "";
  }
}

function baseTemplate({
  title,
  preheader,
  bodyHtml,
  cta,
  footerNote,
  brandName = "PeloCaramelo",
}) {
  const safeTitle = escapeHtml(title || "");
  const safePreheader = escapeHtml(preheader || "");

  const LOGO_URL = safeUrl(process.env.EMAIL_LOGO_URL);
  const WATERMARK_URL = safeUrl(process.env.EMAIL_WATERMARK_URL);

  const logoAlt = escapeHtml(brandName);

  // ✅ Marca d'água opcional
  const cardBgStyle = WATERMARK_URL
    ? `
      background-color:#ffffff;
      background-image:url('${WATERMARK_URL}');
      background-repeat:no-repeat;
      background-position:center;
      background-size:520px auto;
    `
    : `background:#ffffff;`;

  const preheaderHtml = safePreheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safePreheader}</div>`
    : "";

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
                display:inline-block;
                background:#FFD700;
                color:#5A3A22;
                text-decoration:none;
                font-weight:700;
                padding:12px 16px;
                border-radius:12px;
                font-size:14px;
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
        <td style="padding: 16px 24px 0 24px; color:#6b7280; font-size:12px; line-height:18px;">
          ${escapeHtml(footerNote)}
        </td>
      </tr>
    `
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

  <body style="margin:0;padding:0;background:#EBCBA9;">
    ${preheaderHtml}

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#EBCBA9;padding:32px 0;">
      <tr>
        <td align="center">

          <!-- CONTAINER -->
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:600px;max-width:600px;">

            <!-- LOGO -->
            ${
              LOGO_URL
                ? `
              <tr>
                <td align="center" style="padding:0 12px 18px 12px;">
                  <img
                    src="${LOGO_URL}"
                    alt="${logoAlt}"
                    width="180"
                    style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:180px;"
                  />
                </td>
              </tr>
            `
                : ""
            }

            <!-- CARD -->
            <tr>
              <td style="padding:0 12px;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="${cardBgStyle}border-radius:18px;overflow:hidden;box-shadow:0 12px 28px rgba(0,0,0,0.08);">

                  <!-- TITLE -->
                  <tr>
                    <td style="padding:24px 24px 0 24px;font-family:Arial,sans-serif;">
                      <div style="font-size:20px;line-height:26px;font-weight:800;color:#5A3A22;">
                        ${safeTitle}
                      </div>
                    </td>
                  </tr>

                  <!-- BODY -->
                  <tr>
                    <td style="padding:14px 24px 0 24px;font-family:Arial,sans-serif;color:#111827;">
                      <div style="font-size:14px;line-height:22px;">
                        ${bodyHtml || ""}
                      </div>
                    </td>
                  </tr>

                  ${ctaHtml}
                  ${footerNoteHtml}

                  <!-- DIVIDER -->
                  <tr>
                    <td style="padding:20px 24px 0 24px;">
                      <div style="height:1px;background:#e5e7eb;"></div>
                    </td>
                  </tr>

                  <!-- FOOTER -->
                  <tr>
                    <td style="padding:14px 24px 20px 24px;font-family:Arial,sans-serif;color:#6b7280;">
                      <div style="font-size:12px;line-height:18px;">
                        Este e-mail é automático. Se você não solicitou isso, pode ignorar com segurança.
                      </div>
                      <div style="font-size:12px;line-height:18px;margin-top:6px;">
                        © ${new Date().getFullYear()} ${escapeHtml(brandName)}
                      </div>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>

            <!-- SPACING -->
            <tr>
              <td style="height:20px;"></td>
            </tr>

            <!-- SMALL PRINT -->
            <tr>
              <td align="center" style="padding:0 12px;font-family:Arial,sans-serif;color:#9ca3af;font-size:12px;line-height:18px;">
                Dica: adicione este remetente aos seus contatos para garantir a entrega.
              </td>
            </tr>

          </table>
          <!-- /CONTAINER -->

        </td>
      </tr>
    </table>

  </body>
</html>
  `.trim();
}

module.exports = { baseTemplate };
