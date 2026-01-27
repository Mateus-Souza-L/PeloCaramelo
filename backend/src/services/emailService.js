// backend/src/services/emailService.js

const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Remetente oficial (padrão seguro)
const EMAIL_FROM =
  process.env.EMAIL_FROM || "PeloCaramelo <no-reply@pelocaramelo.com.br>";

// Reply-To padrão (boa prática para no-reply).
// ✅ Ajuste: tratar como opcional de verdade e evitar mandar "null"/"" por acidente.
const EMAIL_REPLY_TO_RAW = process.env.EMAIL_REPLY_TO; // pode ser undefined
const EMAIL_REPLY_TO_DEFAULT = "contato@pelocaramelo.com.br";

// Timeout padrão para requisições HTTP
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

/**
 * Normaliza destinatários:
 * - aceita string ou array
 * - remove espaços
 * - filtra vazios
 */
function normalizeTo(to) {
  if (Array.isArray(to)) {
    return to.map((v) => String(v).trim()).filter(Boolean);
  }
  return [String(to).trim()].filter(Boolean);
}

/**
 * ✅ Ajuste: resolve reply_to com segurança
 * - prioridade: replyTo explícito do sendEmail()
 * - senão: EMAIL_REPLY_TO do ambiente (se for válido)
 * - senão: fallback padrão (contato@...)
 * - evita strings "null"/"undefined" e vazios
 */
function resolveReplyTo(replyTo) {
  const pick = (v) => {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s) return null;
    if (s.toLowerCase() === "null") return null;
    if (s.toLowerCase() === "undefined") return null;
    return s;
  };

  return (
    pick(replyTo) ||
    pick(EMAIL_REPLY_TO_RAW) ||
    pick(EMAIL_REPLY_TO_DEFAULT) ||
    null
  );
}

/**
 * Envia e-mail via Resend
 * @param {Object} params
 * @param {string|string[]} params.to - destinatário(s)
 * @param {string} params.subject - assunto
 * @param {string=} params.html - corpo HTML
 * @param {string=} params.text - corpo texto
 * @param {string=} params.replyTo - reply-to opcional (sobrescreve o padrão)
 */
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
    const resolvedReplyTo = resolveReplyTo(replyTo);

    const payload = {
      from: String(EMAIL_FROM),
      to: toList,
      subject: String(subject),
      ...(html ? { html: String(html) } : {}),
      ...(text ? { text: String(text) } : {}),
      // ✅ Ajuste: só envia reply_to se houver um valor válido
      ...(resolvedReplyTo ? { reply_to: resolvedReplyTo } : {}),
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

    // ✅ Ajuste: tenta JSON; se falhar, tenta texto; se falhar, null.
    const data = await resp
      .json()
      .catch(async () => {
        try {
          const txt = await resp.text();
          return txt ? { raw: txt } : null;
        } catch {
          return null;
        }
      });

    if (!resp.ok) {
      const msg =
        data?.message ||
        data?.error ||
        data?.raw ||
        `Falha Resend: HTTP ${resp.status} ${resp.statusText}`;
      console.error("[emailService] Resend error:", msg);
      throw new Error(msg);
    }

    return data; // normalmente { id: ... }
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
