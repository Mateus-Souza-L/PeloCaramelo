// backend/src/controllers/authController.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../config/db");
const { sendEmail } = require("../services/emailService");

const {
  createUser,
  findUserByEmail,
  findUserById,
  updateUserPassword,
} = require("../models/userModel");

const {
  cleanupPasswordResets,
  createPasswordReset,
  findValidPasswordResetByToken,
  markPasswordResetUsed,
  invalidateAllActiveByUserId,
} = require("../models/passwordResetModel");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-trocar-em-producao";

/* ============================================================
   Helpers
   ============================================================ */

function generateToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Lê o body de forma robusta:
 * - se req.body já for objeto (express.json), retorna.
 * - se vier como string JSON (algum middleware/proxy), tenta parse.
 * - fallback: {}
 */
function readBody(req) {
  if (req?.body && typeof req.body === "object") return req.body;

  if (typeof req?.body === "string") {
    const s = req.body.trim();
    if (!s || s === "[object Object]") return {};
    const parsed = safeJsonParse(s);
    if (parsed && typeof parsed === "object") return parsed;
  }

  return {};
}

function pickBlockInfo(user) {
  return {
    blocked: Boolean(user?.blocked),
    blockedReason: user?.blocked_reason ?? null,
    blockedUntil: user?.blocked_until ?? null,
  };
}

function trimLower(v) {
  return String(v || "").trim().toLowerCase();
}

function computeFrontendBase(req) {
  const envBase = String(process.env.FRONTEND_URL || "").trim().replace(/\/$/, "");
  if (envBase) return envBase;

  const origin = String(req.get("origin") || "").trim().replace(/\/$/, "");
  if (origin) return origin;

  // fallback extra: alguns ambientes não mandam Origin; Referer costuma vir do navegador
  const referer = String(req.get("referer") || "").trim();
  if (referer) {
    try {
      const u = new URL(referer);
      return `${u.protocol}//${u.host}`;
    } catch {
      // ignore
    }
  }

  return "";
}

/* ============================================================
   REGISTER
   ============================================================ */
async function register(req, res) {
  try {
    const { name, email, password, role = "tutor" } = readBody(req);

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ error: "Nome, e-mail e senha são obrigatórios." });
    }

    const normalizedEmail = trimLower(email);
    const existing = await findUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: "E-mail já cadastrado." });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);

    const newUser = await createUser({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash,
      role,
    });

    const token = generateToken(newUser);
    return res.status(201).json({ user: newUser, token });
  } catch (err) {
    console.error("register:", err);
    return res.status(500).json({ error: "Erro ao registrar usuário." });
  }
}

/* ============================================================
   LOGIN
   ============================================================ */
async function login(req, res) {
  try {
    const { email, password } = readBody(req);

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "E-mail e senha são obrigatórios." });
    }

    const user = await findUserByEmail(trimLower(email));
    if (!user) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    const bi = pickBlockInfo(user);
    if (bi.blocked) {
      return res.status(403).json({ error: "Usuário bloqueado." });
    }

    const match = await bcrypt.compare(String(password), user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    const token = generateToken(user);
    return res.json({ user, token });
  } catch (err) {
    console.error("login:", err);
    return res.status(500).json({ error: "Erro ao fazer login." });
  }
}

/* ============================================================
   ME
   ============================================================ */
async function me(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Não autenticado." });

    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    return res.json({ user });
  } catch (err) {
    console.error("me:", err);
    return res.status(500).json({ error: "Erro ao buscar usuário." });
  }
}

/* ============================================================
   FORGOT PASSWORD
   ============================================================ */
async function forgotPassword(req, res) {
  const safeResponse = {
    ok: true,
    message: "Se o e-mail existir, enviaremos um link de recuperação.",
  };

  try {
    const { email } = readBody(req);
    const normalizedEmail = trimLower(email);
    if (!normalizedEmail) return res.json(safeResponse);

    const user = await findUserByEmail(normalizedEmail);
    if (!user) return res.json(safeResponse);

    if (pickBlockInfo(user).blocked) return res.json(safeResponse);

    try {
      await cleanupPasswordResets();
    } catch {
      // silencioso de propósito
    }

    const token = crypto.randomBytes(32).toString("hex");

    const minutes = Number(process.env.PASSWORD_RESET_EXPIRES_MINUTES || 60);
    const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

    // invalida tokens antigos e cria novo
    await invalidateAllActiveByUserId(user.id);
    await createPasswordReset({ userId: user.id, token, expiresAt });

    const base = computeFrontendBase(req);

    // ✅ ALTERAÇÃO NECESSÁRIA:
    // Em produção, não envie link relativo (quebra no e-mail).
    if (!base) {
      console.warn(
        "[forgotPassword] FRONTEND_URL/origin ausente. Configure FRONTEND_URL no Render. " +
        "E-mail não será enviado para evitar link quebrado."
      );
      return res.json(safeResponse);
    }

    const link = `${base}/reset-password?token=${encodeURIComponent(token)}`;

    try {
      await sendEmail({ to: user.email, subject: "Recuperação de senha – PeloCaramelo", html: `...` });
    } catch (e) {
      console.error("[forgotPassword] Falha ao enviar email:", e?.message || e);
      // retorna safeResponse mesmo assim (não vaza info)
    }

    return res.json(safeResponse);
  } catch (err) {
    console.error("forgotPassword:", err);
    return res.json(safeResponse);
  }
}

/* ============================================================
   RESET PASSWORD
   ============================================================ */
async function resetPassword(req, res) {
  try {
    const body = readBody(req);

    // aceita tanto "password" (seu frontend atual) quanto "newPassword"
    const token = String(body?.token || "").trim();
    const newPassword = String(body?.newPassword || body?.password || "").trim();

    if (!token || !newPassword || newPassword.length < 6) {
      return res.status(400).json({
        error: "Token inválido ou senha muito curta.",
      });
    }

    const reset = await findValidPasswordResetByToken(token);
    if (!reset) {
      return res.status(400).json({ error: "Token inválido ou expirado." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await updateUserPassword(reset.user_id, passwordHash);

    // marca este token como usado
    await markPasswordResetUsed(reset.id);

    // segurança extra: invalida qualquer outro token ativo do usuário
    await invalidateAllActiveByUserId(reset.user_id);

    return res.json({ ok: true, message: "Senha atualizada com sucesso." });
  } catch (err) {
    console.error("resetPassword:", err);
    return res.status(500).json({ error: "Erro ao redefinir senha." });
  }
}

/* ============================================================
   EXPORTS
   ============================================================ */
module.exports = {
  register,
  login,
  me,
  forgotPassword,
  resetPassword,
};
