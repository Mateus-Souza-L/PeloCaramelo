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
  const logoAlt = escapeHtml(brandName);

  const preheaderHtml = safePreheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${safePreheader}</div>`
    : "";

  const ctaHtml =
    cta?.label && cta?.url
      ? `
        <tr>
          <td style="padding: 30px 36px 0 36px;">
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
                padding:14px 22px;
                border-radius:14px;
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
        <td style="padding: 20px 36px 0 36px; color:#6b7280; font-size:12px; line-height:18px;">
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

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EBCBA9;padding:60px 0;">
    <tr>
      <td align="center">

        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:640px;">

          <!-- CARD -->
          <tr>
            <td style="padding:0 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,0.12);">

                <!-- HEADER PREMIUM -->
                <tr>
                  <td style="
                    background:linear-gradient(90deg,#5A3A22 0%,#4A2E1C 100%);
                    padding:40px 36px;
                  ">
                    <div style="
                      font-family: Arial, Helvetica, sans-serif;
                      font-size:26px;
                      font-weight:800;
                      letter-spacing:0.5px;
                    ">
                      <span style="color:#FFFFFF;">Pelo</span><span style="color:#FFD700;">Caramelo</span>
                    </div>
                  </td>
                </tr>

                <!-- GOLD DIVIDER -->
                <tr>
                  <td style="height:4px;background:#FFD700;"></td>
                </tr>

                <!-- TITLE -->
                <tr>
                  <td style="padding:40px 36px 0 36px;font-family:Arial,sans-serif;">
                    <div style="font-size:24px;line-height:30px;font-weight:800;color:#5A3A22;">
                      ${safeTitle}
                    </div>
                  </td>
                </tr>

                <!-- BODY -->
                <tr>
                  <td style="padding:22px 36px 0 36px;font-family:Arial,sans-serif;color:#2c2c2c;">
                    <div style="font-size:16px;line-height:26px;">
                      ${bodyHtml || ""}
                    </div>
                  </td>
                </tr>

                ${ctaHtml}
                ${footerNoteHtml}

                <!-- DIVIDER -->
                <tr>
                  <td style="padding:40px 36px 0 36px;">
                    <div style="height:1px;background:#e5e7eb;"></div>
                  </td>
                </tr>

                <!-- FOOTER -->
                <tr>
                  <td style="padding:22px 36px 36px 36px;font-family:Arial,sans-serif;color:#6b7280;">
                    <div style="font-size:12px;line-height:18px;">
                      Este e-mail é automático. Se você não solicitou isso, pode ignorar com segurança.
                    </div>
                    <div style="font-size:12px;line-height:18px;margin-top:8px;">
                      © ${new Date().getFullYear()} ${escapeHtml(brandName)}
                    </div>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- SMALL PRINT -->
          <tr>
            <td align="center" style="padding:24px 16px 0 16px;font-family:Arial,sans-serif;color:#9ca3af;font-size:12px;">
              Dica: adicione este remetente aos seus contatos para garantir a entrega.
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
  `.trim();
}

module.exports = { baseTemplate };
