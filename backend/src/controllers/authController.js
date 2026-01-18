const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../config/db");

const {
  createUser,
  findUserByEmail,
  findUserById,
  updateUserPassword,
} = require("../models/userModel");

const {
  createPasswordReset,
  findValidByTokenHash,
  markUsed,
  invalidateAllByUserId,
  cleanupExpired,
} = require("../models/passwordResetModel");

const { sendEmail } = require("../services/emailService");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-trocar-em-producao";

/* ============================================================
   Helpers
   ============================================================ */

function generateToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return {};
}

function pickBlockInfo(user) {
  if (!user) return { blocked: false };

  return {
    blocked: Boolean(user.blocked),
    blockedReason: user.blocked_reason ?? null,
    blockedUntil: user.blocked_until ?? null,
  };
}

/* ============================================================
   REGISTER
   ============================================================ */
async function register(req, res) {
  try {
    const body = readBody(req);
    const { name, email, password, role = "tutor" } = body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ error: "Nome, e-mail e senha são obrigatórios." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await findUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: "E-mail já cadastrado." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

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
    const body = readBody(req);
    const { email, password } = body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "E-mail e senha são obrigatórios." });
    }

    const user = await findUserByEmail(String(email).toLowerCase());
    if (!user) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    const bi = pickBlockInfo(user);
    if (bi.blocked) {
      return res.status(403).json({ error: "Usuário bloqueado." });
    }

    const match = await bcrypt.compare(password, user.password_hash);
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
  try {
    const body = readBody(req);
    const email = String(body.email || "").trim().toLowerCase();

    const safeResponse = {
      ok: true,
      message: "Se o e-mail existir, enviaremos um link de recuperação.",
    };

    if (!email) return res.json(safeResponse);

    const user = await findUserByEmail(email);
    if (!user) return res.json(safeResponse);

    const bi = pickBlockInfo(user);
    if (bi.blocked) return res.json(safeResponse);

    // limpeza best-effort
    try {
      await cleanupExpired();
    } catch {}

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const minutes = Number(process.env.PASSWORD_RESET_EXPIRES_MINUTES || 60);
    const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

    await invalidateAllByUserId(user.id);
    await createPasswordReset({ userId: user.id, tokenHash, expiresAt });

    const base =
      String(process.env.FRONTEND_URL || "").replace(/\/$/, "") ||
      String(req.get("origin") || "").replace(/\/$/, "");

    const link = `${base}/resetar-senha?token=${token}`;

    await sendEmail({
      to: user.email,
      subject: "Recuperação de senha — PeloCaramelo",
      html: `
        <p>Você solicitou a recuperação de senha.</p>
        <p><a href="${link}">Clique aqui para redefinir sua senha</a></p>
        <p>Esse link expira em ${minutes} minutos.</p>
      `,
    });

    return res.json(safeResponse);
  } catch (err) {
    console.error("forgotPassword:", err);
    return res.json({
      ok: true,
      message: "Se o e-mail existir, enviaremos um link de recuperação.",
    });
  }
}

/* ============================================================
   RESET PASSWORD
   ============================================================ */
async function resetPassword(req, res) {
  try {
    const body = readBody(req);
    const token = String(body.token || "").trim();
    const newPassword = String(body.newPassword || "");

    if (!token || newPassword.length < 6) {
      return res.status(400).json({
        error: "Token inválido ou senha muito curta.",
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const reset = await findValidByTokenHash(tokenHash);
    if (!reset) {
      return res.status(400).json({ error: "Token inválido ou expirado." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await updateUserPassword(reset.user_id, passwordHash);
    await markUsed(reset.id);

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
