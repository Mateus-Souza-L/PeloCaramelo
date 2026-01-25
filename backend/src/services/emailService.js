// backend/src/services/emailService.js

const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Remetente oficial (padrão seguro)
const EMAIL_FROM =
  process.env.EMAIL_FROM || "PeloCaramelo <no-reply@pelocaramelo.com.br>";

// Reply-To opcional (boa prática para no-reply)
const EMAIL_REPLY_TO =
  process.env.EMAIL_REPLY_TO || "contato@pelocaramelo.com.br";

const REQUEST_TIMEOUT_MS = Number(process.env.EMAIL_HTTP_TIMEOUT_MS || 15000);

// Node 18+ tem fetch. Se for <18, avisa claramente.
const hasFetch = typeof fetch === "function";

if (!RESEND_API_KEY) {
  console.warn("[emailService] RESEND_API_KEY ausente. Envio de e-mails vai falhar.");
}
if (!hasFetch) {
  console.warn(
    "[emailService] fetch() não disponível neste Node. Use Node 18+ ou instale/importe 'node-fetch'."
  );
}

function normalizeTo(to) {
  if (Array.isArray(to)) {
    return to.map((v) => String(v).trim()).filter(Boolean);
  }
  return [String(to).trim()].filter(Boolean);
}

async function sendEmail({ to, subject, html, text, replyTo }) {
  const toList = normalizeTo(to);

  if (!toList.length) throw new Error("sendEmail: destinatário (to) ausente.");
  if (!subject) throw new Error("sendEmail: subject ausente.");
  if (!html && !text) throw new Error("sendEmail: precisa de html ou text.");

  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY ausente no ambiente.");
  if (!hasFetch) throw new Error("fetch() não disponível. Rode com Node 18+.");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const payload = {
      from: String(EMAIL_FROM),
      to: toList,
      subject: String(subject),
      ...(html ? { html: String(html) } : {}),
      ...(text ? { text: String(text) } : {}),
      {
        reply_to: String(replyTo || EMAIL_REPLY_TO),
      },
    };

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      const msg =
        data?.message ||
        data?.error ||
        `Falha Resend: HTTP ${resp.status} ${resp.statusText}`;
      console.error("[emailService] Resend error:", msg);
      throw new Error(msg);
    }

    return data; // { id: ... }
  } catch (err) {
    const isAbort = err?.name === "AbortError";
    const msg = isAbort
      ? "Timeout ao chamar Resend API"
      : err?.message || String(err);
    console.error("[emailService] Erro ao enviar e-mail:", msg);
    throw err;
  } finally {
    clearTimeout(t);
  }
}

module.exports = { sendEmail };
