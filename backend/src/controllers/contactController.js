// backend/src/controllers/contactController.js
const { sendPalestraQuoteEmail } = require("../services/emailService");

function isEmailValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function pickStr(v) {
  return String(v == null ? "" : v).trim();
}

function clamp(s, max) {
  const str = String(s || "");
  return str.length > max ? str.slice(0, max) : str;
}

exports.sendPalestraLead = async (req, res) => {
  try {
    const body = req.body || {};

    // Campos do formulário (todos obrigatórios)
    const nome = pickStr(body.nome);
    const email = pickStr(body.email);
    const empresa = pickStr(body.empresa);
    const cidade = pickStr(body.cidade);
    const publico = pickStr(body.publico);
    const tamanho = pickStr(body.tamanho);
    const formato = pickStr(body.formato) || "Presencial";
    const duracao = pickStr(body.duracao);
    const tema = pickStr(body.tema);
    const mensagem = pickStr(body.mensagem);

    // Metadados opcionais
    const page = pickStr(body.page) || "comportamento";
    const utm = pickStr(body.utm);
    const createdAtRaw = pickStr(body.createdAt);

    // ✅ obrigatórios de verdade (todos)
    const requiredMap = {
      nome,
      email,
      empresa,
      cidade,
      publico,
      tamanho,
      formato,
      duracao,
      tema,
      mensagem,
    };

    const missing = Object.entries(requiredMap)
      .filter(([, v]) => !v)
      .map(([k]) => k);

    if (missing.length) {
      return res.status(400).json({
        ok: false,
        error: "Preencha todos os campos do formulário.",
        missing,
      });
    }

    if (!isEmailValid(email)) {
      return res.status(400).json({ ok: false, error: "Informe um e-mail válido." });
    }

    // ✅ limites anti-spam / payload absurdo
    const safe = {
      nome: clamp(nome, 120),
      email: clamp(email, 180),
      empresa: clamp(empresa, 180),
      cidade: clamp(cidade, 120),
      publico: clamp(publico, 180),
      tamanho: clamp(tamanho, 60),
      formato: clamp(formato, 40),
      duracao: clamp(duracao, 60),
      tema: clamp(tema, 160),
      mensagem: clamp(mensagem, 4000),
      page: clamp(page, 80),
      utm: clamp(utm, 400),
    };

    const createdAt = (() => {
      if (createdAtRaw) {
        const d = new Date(createdAtRaw);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
      }
      return new Date().toISOString();
    })();

    // ✅ Centraliza tudo no service (template/subject/reply-to)
    await sendPalestraQuoteEmail({
      ...safe,
      createdAt,
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("[contactController] sendPalestraLead error:", err);
    return res.status(500).json({
      ok: false,
      error: "Erro ao enviar pedido. Tente novamente.",
    });
  }
};
