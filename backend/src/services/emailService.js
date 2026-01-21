// backend/src/services/emailService.js
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "PeloCaramelo <onboarding@resend.dev>";
const REQUEST_TIMEOUT_MS = Number(process.env.EMAIL_HTTP_TIMEOUT_MS || 10000);

if (!RESEND_API_KEY) {
  console.warn("[emailService] RESEND_API_KEY ausente. Envio de e-mails vai falhar.");
}

async function sendEmail({ to, subject, html }) {
  if (!to || !subject || !html) {
    throw new Error("sendEmail: parâmetros obrigatórios ausentes.");
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [String(to)],
        subject: String(subject),
        html: String(html),
      }),
      signal: controller.signal,
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      const msg =
        data?.message ||
        data?.error ||
        `Falha Resend: HTTP ${resp.status} ${resp.statusText}`;
      console.error("[emailService] Resend error:", msg, data || "");
      throw new Error(msg);
    }

    return data; // { id: ... }
  } catch (err) {
    const isAbort = err?.name === "AbortError";
    const msg = isAbort ? "Timeout ao chamar Resend API" : (err?.message || String(err));
    console.error("[emailService] Erro ao enviar e-mail:", msg);
    throw err;
  } finally {
    clearTimeout(t);
  }
}

module.exports = {
  sendEmail,
};
