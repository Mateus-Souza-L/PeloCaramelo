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

/* ===========================================================
   ✅ Helpers gerais
   =========================================================== */

const fs = require("fs");
const path = require("path");

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

  return pick(replyTo) || pick(EMAIL_REPLY_TO_RAW) || pick(EMAIL_REPLY_TO_DEFAULT) || null;
}

/**
 * ✅ Normaliza anexos (Resend)
 * Esperado: [{ filename: string, content: base64String }]
 * - ignora anexos inválidos (não quebra envio)
 * - não envia attachments se vazio
 */
function normalizeAttachments(attachments) {
  if (!attachments) return [];
  if (!Array.isArray(attachments)) return [];

  return attachments
    .map((a) => {
      const filename = a?.filename ? String(a.filename).trim() : "";
      const content = a?.content ? String(a.content).trim() : "";
      if (!filename || !content) return null;
      return { filename, content };
    })
    .filter(Boolean);
}

/**
 * Envia e-mail via Resend
 * @param {Object} params
 * @param {string|string[]} params.to - destinatário(s)
 * @param {string} params.subject - assunto
 * @param {string=} params.html - corpo HTML
 * @param {string=} params.text - corpo texto
 * @param {string=} params.replyTo - reply-to opcional (sobrescreve o padrão)
 * @param {Array<{filename:string, content:string}>=} params.attachments - anexos (base64)
 */
async function sendEmail({ to, subject, html, text, replyTo, attachments }) {
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
    const safeAttachments = normalizeAttachments(attachments);

    const payload = {
      from: String(EMAIL_FROM),
      to: toList,
      subject: String(subject),
      ...(html ? { html: String(html) } : {}),
      ...(text ? { text: String(text) } : {}),
      // ✅ só envia reply_to se houver um valor válido
      ...(resolvedReplyTo ? { reply_to: resolvedReplyTo } : {}),
      // ✅ anexos (opcional)
      ...(safeAttachments.length ? { attachments: safeAttachments } : {}),
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
    const msg = isAbort ? "Timeout ao chamar Resend API" : err?.message || String(err);
    console.error("[emailService] Erro ao enviar e-mail:", msg);
    throw err;
  } finally {
    clearTimeout(t);
  }
}

/* ===========================================================
   ✅ Template base (opcional) + escape
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
  const mod = require("../email/templates/baseTemplate");
  baseTemplateFn =
    (typeof mod === "function" ? mod : null) ||
    (typeof mod?.baseTemplate === "function" ? mod.baseTemplate : null) ||
    (typeof mod?.default === "function" ? mod.default : null) ||
    null;
} catch {
  baseTemplateFn = null;
}

/* ===========================================================
   ✅ Boas-vindas (com PDF opcional em /assets)
   =========================================================== */

// Nome do PDF (você pode trocar depois sem mudar código)
const WELCOME_PDF_FILENAME = String(
  process.env.WELCOME_PDF_FILENAME || "pelo-caramelo-dicas.pdf"
).trim();

// Caminho do PDF: backend/assets/<arquivo>
function getWelcomePdfPath() {
  // __dirname = backend/src/services
  // sobe 2 níveis -> backend/src -> backend
  // entra em assets
  return path.resolve(__dirname, "..", "..", "assets", WELCOME_PDF_FILENAME);
}

function tryReadWelcomePdfAsAttachment() {
  try {
    const pdfPath = getWelcomePdfPath();
    if (!fs.existsSync(pdfPath)) return null;

    const buf = fs.readFileSync(pdfPath);
    const base64 = buf.toString("base64");

    // Resend espera base64 puro
    return {
      filename: WELCOME_PDF_FILENAME || "arquivo.pdf",
      content: base64,
    };
  } catch (err) {
    console.warn("[emailService] Falha ao preparar PDF de boas-vindas:", err?.message || err);
    return null;
  }
}

function renderWelcomeHtml({ name, role }) {
  const safeName = escapeHtml(name || ""); // opcional
  const roleLabel = role === "caregiver" ? "Cuidador" : "Tutor";

  const bodyHtml = `
    <h2 style="margin:0 0 12px;">Bem-vindo(a) à PeloCaramelo 🐾</h2>
    <p style="margin:0 0 14px;">
      Oi${safeName ? `, <b>${safeName}</b>` : ""}! Que bom ter você com a gente.
    </p>
    <p style="margin:0 0 14px;">
      Seu perfil foi criado como <b>${escapeHtml(roleLabel)}</b>. A partir de agora você já pode:
    </p>
    <ul style="margin:0 0 14px; padding-left:18px;">
      ${
        role === "caregiver"
          ? `
            <li>Configurar seus <b>serviços</b>, <b>preços</b> e <b>disponibilidade</b>.</li>
            <li>Receber e gerenciar <b>reservas</b>.</li>
            <li>Conversar com tutores pelo <b>chat</b> após a reserva aceita.</li>
          `
          : `
            <li>Buscar cuidadores e fazer <b>reservas</b>.</li>
            <li>Gerenciar seus pedidos no <b>painel</b>.</li>
            <li>Avaliar após a reserva concluída.</li>
          `
      }
    </ul>
    <p style="margin:0 0 14px;">
      Qualquer dúvida, é só responder este e-mail 🙂
    </p>
    <p style="margin:16px 0 0;color:#666;font-size:12px;">
      Se você receber um PDF anexado, ele contém dicas rápidas para começar com o pé direito.
    </p>
  `;

  if (typeof baseTemplateFn === "function") {
    return baseTemplateFn({
      title: "Boas-vindas",
      preheader: "Sua conta foi criada com sucesso na PeloCaramelo 🐾",
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

function renderWelcomeText({ name, role }) {
  const roleLabel = role === "caregiver" ? "Cuidador" : "Tutor";
  const lines = [
    "Bem-vindo(a) à PeloCaramelo 🐾",
    "",
    `Oi${name ? `, ${name}` : ""}! Que bom ter você com a gente.`,
    `Seu perfil foi criado como: ${roleLabel}.`,
    "",
    "A partir de agora você já pode:",
    role === "caregiver"
      ? "- Configurar serviços, preços e disponibilidade\n- Receber e gerenciar reservas\n- Conversar com tutores pelo chat após a reserva aceita"
      : "- Buscar cuidadores e fazer reservas\n- Gerenciar seus pedidos no painel\n- Avaliar após a reserva concluída",
    "",
    "Qualquer dúvida, é só responder este e-mail 🙂",
    "",
    "Obs.: Se você receber um PDF anexado, ele contém dicas rápidas para começar.",
  ];

  return lines.join("\n");
}

/**
 * Envia e-mail de boas-vindas para o usuário
 * - anexa PDF de /assets se existir
 * @param {Object} user
 * @param {string} user.email
 * @param {string=} user.name
 * @param {string=} user.role ("tutor" | "caregiver")
 */
async function sendWelcomeEmail(user) {
  const email = String(user?.email || "").trim();
  if (!email) throw new Error("sendWelcomeEmail: user.email ausente.");

  const name = String(user?.name || "").trim();
  const role = String(user?.role || "tutor").trim().toLowerCase();
  const safeRole = role === "caregiver" ? "caregiver" : "tutor";

  const attachment = tryReadWelcomePdfAsAttachment();
  const attachments = attachment ? [attachment] : [];

  const subject = "Bem-vindo(a) à PeloCaramelo 🐾";

  return sendEmail({
    to: email,
    subject,
    html: renderWelcomeHtml({ name, role: safeRole }),
    text: renderWelcomeText({ name, role: safeRole }),
    ...(attachments.length ? { attachments } : {}),
  });
}

/* ===========================================================
   ✅ Orçamento de palestra (Comportamento)
   =========================================================== */

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
    replyTo: lead?.email ? String(lead.email).trim() : undefined,
  });
}

/* ===========================================================
   ✅ Admin: conta bloqueada / desbloqueada
   =========================================================== */

function formatDateTimeBR(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return d.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    // fallback simples
    return d.toISOString();
  }
}

function renderAccountBlockedHtml({ name, reason, blockedUntil }) {
  const safeName = escapeHtml(name || "");
  const safeReason = escapeHtml(reason || "Motivo não informado");
  const untilBR = formatDateTimeBR(blockedUntil);

  const bodyHtml = `
    <p style="margin:0 0 12px;">
      Olá${safeName ? `, <b>${safeName}</b>` : ""}.
    </p>

    <p style="margin:0 0 12px;">
      Sua conta foi <b>temporariamente bloqueada</b> por violação das diretrizes da plataforma.
    </p>

    <p style="margin:0 0 12px;">
      <b>Motivo:</b> ${safeReason}
    </p>

    ${
      untilBR
        ? `<p style="margin:0 0 12px;"><b>Bloqueio até:</b> ${escapeHtml(untilBR)}</p>`
        : `<p style="margin:0 0 12px;"><b>Bloqueio:</b> por tempo indeterminado</p>`
    }

    <p style="margin:16px 0 0;">
      Se você acredita que foi um engano, responda este e-mail para solicitar uma revisão.
    </p>
  `;

  if (typeof baseTemplateFn === "function") {
    return baseTemplateFn({
      title: "Conta bloqueada",
      preheader: "Sua conta foi temporariamente bloqueada na PeloCaramelo.",
      bodyHtml,
      cta: null,
      footerNote: "Para pedir revisão, responda este e-mail com os detalhes do seu caso.",
    });
  }

  return `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#333">${bodyHtml}</div>`;
}

function renderAccountBlockedText({ name, reason, blockedUntil }) {
  const untilBR = formatDateTimeBR(blockedUntil);
  return [
    "Conta bloqueada — PeloCaramelo",
    "",
    `Olá${name ? `, ${name}` : ""}.`,
    "",
    "Sua conta foi temporariamente bloqueada por violação das diretrizes da plataforma.",
    `Motivo: ${reason || "Motivo não informado"}`,
    untilBR ? `Bloqueio até: ${untilBR}` : "Bloqueio: por tempo indeterminado",
    "",
    "Se você acredita que foi um engano, responda este e-mail para solicitar uma revisão.",
  ].join("\n");
}

async function sendAccountBlockedEmail(user, blockInfo = {}) {
  const email = String(user?.email || "").trim();
  if (!email) throw new Error("sendAccountBlockedEmail: user.email ausente.");

  const name = String(user?.name || "").trim();
  const reason = String(blockInfo?.reason || blockInfo?.blocked_reason || "").trim();
  const blockedUntil = blockInfo?.blockedUntil || blockInfo?.blocked_until || null;

  const subject = "Sua conta foi bloqueada — PeloCaramelo";

  return sendEmail({
    to: email,
    subject,
    html: renderAccountBlockedHtml({ name, reason, blockedUntil }),
    text: renderAccountBlockedText({ name, reason, blockedUntil }),
  });
}

function renderAccountUnblockedHtml({ name }) {
  const safeName = escapeHtml(name || "");

  const bodyHtml = `
    <p style="margin:0 0 12px;">
      Olá${safeName ? `, <b>${safeName}</b>` : ""}.
    </p>

    <p style="margin:0 0 12px;">
      Sua conta foi <b>desbloqueada</b> e você já pode voltar a usar a plataforma normalmente.
    </p>

    <p style="margin:16px 0 0;">
      Se você tiver qualquer dúvida, é só responder este e-mail 🙂
    </p>
  `;

  if (typeof baseTemplateFn === "function") {
    return baseTemplateFn({
      title: "Conta desbloqueada",
      preheader: "Sua conta foi desbloqueada na PeloCaramelo.",
      bodyHtml,
      cta: null,
    });
  }

  return `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#333">${bodyHtml}</div>`;
}

function renderAccountUnblockedText({ name }) {
  return [
    "Conta desbloqueada — PeloCaramelo",
    "",
    `Olá${name ? `, ${name}` : ""}.`,
    "",
    "Sua conta foi desbloqueada e você já pode voltar a usar a plataforma normalmente.",
    "",
    "Se você tiver qualquer dúvida, responda este e-mail 🙂",
  ].join("\n");
}

async function sendAccountUnblockedEmail(user) {
  const email = String(user?.email || "").trim();
  if (!email) throw new Error("sendAccountUnblockedEmail: user.email ausente.");

  const name = String(user?.name || "").trim();
  const subject = "Sua conta foi desbloqueada — PeloCaramelo";

  return sendEmail({
    to: email,
    subject,
    html: renderAccountUnblockedHtml({ name }),
    text: renderAccountUnblockedText({ name }),
  });
}

module.exports = {
  sendEmail,
  sendPalestraQuoteEmail,
  sendWelcomeEmail,
  // ✅ novos exports
  sendAccountBlockedEmail,
  sendAccountUnblockedEmail,
};
