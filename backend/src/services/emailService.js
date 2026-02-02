// backend/src/services/emailService.js

const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Remetente oficial (padrão seguro)
const EMAIL_FROM =
  process.env.EMAIL_FROM || "PeloCaramelo <no-reply@pelocaramelo.com.br>";

// Reply-To padrão (boa prática para no-reply).
// ✅ tratar como opcional de verdade e evitar mandar "null"/"" por acidente.
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
 * - ✅ tolera null/undefined
 */
function normalizeTo(to) {
  if (to == null) return [];
  if (Array.isArray(to)) {
    return to.map((v) => String(v).trim()).filter(Boolean);
  }
  return [String(to).trim()].filter(Boolean);
}

/**
 * ✅ Resolve reply_to com segurança
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
    const low = s.toLowerCase();
    if (low === "null") return null;
    if (low === "undefined") return null;
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
      // ✅ só envia reply_to se houver um valor válido
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

    // ✅ tenta JSON; se falhar, tenta texto; se falhar, null.
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

/* ===========================================================
   ✅ Orçamento de palestra (Comportamento)
   - Envia para contato@pelocaramelo.com.br
   - Reply-To = email do lead (pra responder direto)
   =========================================================== */

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// tenta usar o template base se existir
let baseTemplateFn = null;
try {
  // ajuste se seu caminho for diferente
  const mod = require("../email/templates/baseTemplate");
  // tolerante: pode ser function direto, ou { baseTemplate }, ou { default }
  baseTemplateFn =
    (typeof mod === "function" ? mod : null) ||
    (typeof mod?.baseTemplate === "function" ? mod.baseTemplate : null) ||
    (typeof mod?.default === "function" ? mod.default : null) ||
    null;
} catch {
  baseTemplateFn = null;
}

function renderPalestraHtml(lead) {
  const rows = [
    ["Nome", lead?.nome],
    ["E-mail", lead?.email],
    ["Empresa / Instituição", lead?.empresa],
    ["Cidade / Estado", lead?.cidade],
    ["Público-alvo", lead?.publico],
    ["Tamanho do público", lead?.tamanho],
    ["Formato", lead?.formato],
    ["Duração desejada", lead?.duracao],
    ["Tema principal", lead?.tema],
    ["Mensagem", lead?.mensagem],
    ["Criado em", lead?.createdAt],
  ]
    .map(([k, v]) => [k, v == null ? "" : String(v).trim()])
    .filter(([, v]) => v.length > 0);

  const table = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
      ${rows
        .map(
          ([k, v]) => `
        <tr>
          <td style="padding:10px 12px;border:1px solid #eee;background:#fafafa;font-weight:700;width:220px;">
            ${escapeHtml(k)}
          </td>
          <td style="padding:10px 12px;border:1px solid #eee;">
            ${escapeHtml(v)}
          </td>
        </tr>
      `
        )
        .join("")}
    </table>
  `;

  const bodyHtml = `
    <h2 style="margin:0 0 12px;">Novo pedido de orçamento de palestra</h2>
    <p style="margin:0 0 16px;">
      Um lead preencheu o formulário de <b>Orçamento de Palestra</b> na página de Comportamento.
    </p>
    ${table}
    <p style="margin:16px 0 0;color:#666;font-size:12px;">
      Dica: responda este e-mail — o <b>Reply-To</b> será o e-mail do lead.
    </p>
  `;

  if (typeof baseTemplateFn === "function") {
    return baseTemplateFn({
      title: "Orçamento de Palestra",
      preheader: "Novo pedido de orçamento de palestra recebido.",
      bodyHtml,
      cta: null,
    });
  }

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#333">
      ${bodyHtml}
    </div>
  `;
}

function renderPalestraText(lead) {
  const lines = [
    "Novo pedido de orçamento de palestra",
    "",
    `Nome: ${lead?.nome || ""}`,
    `Email: ${lead?.email || ""}`,
    `Empresa/Instituição: ${lead?.empresa || ""}`,
    `Cidade/Estado: ${lead?.cidade || ""}`,
    `Público-alvo: ${lead?.publico || ""}`,
    `Tamanho do público: ${lead?.tamanho || ""}`,
    `Formato: ${lead?.formato || ""}`,
    `Duração: ${lead?.duracao || ""}`,
    `Tema: ${lead?.tema || ""}`,
    `Mensagem: ${lead?.mensagem || ""}`,
    `Criado em: ${lead?.createdAt || ""}`,
    "",
    "Responda este e-mail para falar com o lead (Reply-To configurado).",
  ];
  return lines.join("\n");
}

/**
 * Envia e-mail interno de orçamento de palestra
 * @param {Object} lead - payload do formulário
 */
async function sendPalestraQuoteEmail(lead) {
  const to = "contato@pelocaramelo.com.br";

  const nome = String(lead?.nome || "").trim();
  const tema = String(lead?.tema || "").trim();

  const subjectBase = "Orçamento de Palestra";
  const subject = nome && tema ? `${subjectBase} • ${nome} • ${tema}` : subjectBase;

  return sendEmail({
    to,
    subject,
    html: renderPalestraHtml(lead),
    text: renderPalestraText(lead),
    // ✅ replyTo vira o e-mail do lead (se existir)
    replyTo: lead?.email ? String(lead.email).trim() : undefined,
  });
}

module.exports = { sendEmail, sendPalestraQuoteEmail };
