// backend/src/controllers/authController.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../config/db");
const { sendEmail } = require("../services/emailService");
const { resetPasswordEmail } = require("../email/templates/resetPassword");

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
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

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

function trimLower(v) {
  return String(v || "").trim().toLowerCase();
}

function pickBlockInfo(user) {
  return {
    blocked: Boolean(user?.blocked),
    blockedReason: user?.blocked_reason ?? user?.blockedReason ?? null,
    blockedUntil: user?.blocked_until ?? user?.blockedUntil ?? null,
  };
}

// ✅ senha forte: min 8, pelo menos 1 letra e 1 número
function isStrongPassword(pw) {
  const s = String(pw || "");
  return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(s);
}

/* ============================================================
   ✅ Multi-perfil (tolerante ao schema) — FAIL-SAFE
   - NÃO referencia caregiver_id se a coluna não existir
   - checa também "id == users.id" (bases antigas)
   ============================================================ */

let cachedCaregiverCols = null; // { hasUserId, hasCaregiverId, hasId } | null
let cachedCaregiverColsAt = 0;

async function detectCaregiverProfilesColumns() {
  const now = Date.now();
  if (cachedCaregiverCols && now - cachedCaregiverColsAt < 5 * 60 * 1000) {
    return cachedCaregiverCols;
  }

  try {
    const sql = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'caregiver_profiles'
        AND column_name IN ('user_id', 'caregiver_id', 'id')
    `;
    const { rows } = await pool.query(sql);
    const set = new Set((rows || []).map((r) => String(r.column_name)));

    cachedCaregiverCols = {
      hasUserId: set.has("user_id"),
      hasCaregiverId: set.has("caregiver_id"),
      hasId: set.has("id"),
    };
    cachedCaregiverColsAt = now;
    return cachedCaregiverCols;
  } catch {
    cachedCaregiverCols = null;
    cachedCaregiverColsAt = now;
    return null;
  }
}

async function hasCaregiverProfileByUserId(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return false;
  const idStr = String(id);

  try {
    const cols = await detectCaregiverProfilesColumns();

    // 1) caminho ideal: usamos SOMENTE colunas existentes
    if (cols) {
      // prioridade: user_id (se existir)
      if (cols.hasUserId) {
        const { rows } = await pool.query(
          `SELECT 1 FROM caregiver_profiles WHERE user_id::text = $1 LIMIT 1`,
          [idStr]
        );
        if (rows?.length) return true;
      }

      // fallback: id == users.id (se existir)
      if (cols.hasId) {
        const { rows } = await pool.query(
          `SELECT 1 FROM caregiver_profiles WHERE id::text = $1 LIMIT 1`,
          [idStr]
        );
        if (rows?.length) return true;
      }

      // só tenta caregiver_id se EXISTE mesmo
      if (cols.hasCaregiverId) {
        const { rows } = await pool.query(
          `SELECT 1 FROM caregiver_profiles WHERE caregiver_id::text = $1 LIMIT 1`,
          [idStr]
        );
        if (rows?.length) return true;
      }

      return false;
    }

    // 2) fallback sem information_schema:
    // ✅ tenta user_id, depois id. NÃO tenta caregiver_id aqui (pra não quebrar seu schema).
    try {
      const { rows } = await pool.query(
        `SELECT 1 FROM caregiver_profiles WHERE user_id::text = $1 LIMIT 1`,
        [idStr]
      );
      if (rows?.length) return true;
    } catch {
      // ignore
    }

    try {
      const { rows } = await pool.query(
        `SELECT 1 FROM caregiver_profiles WHERE id::text = $1 LIMIT 1`,
        [idStr]
      );
      if (rows?.length) return true;
    } catch {
      // ignore
    }

    return false;
  } catch (err) {
    console.error("[authController] hasCaregiverProfileByUserId error:", err?.message || err);
    return false;
  }
}

function computeFrontendBase(req) {
  const envBase = String(process.env.FRONTEND_URL || "").trim().replace(/\/$/, "");
  if (envBase) return envBase;

  const origin = String(req.get("origin") || "").trim().replace(/\/$/, "");
  if (origin) return origin;

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

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildResetEmail({ link, minutes }) {
  const safeLink = String(link || "");
  const safeMinutes = Number.isFinite(Number(minutes)) ? Number(minutes) : 60;

  const subject = "Recuperação de senha – PeloCaramelo";

  const text =
    `Você solicitou a redefinição de senha no PeloCaramelo.\n\n` +
    `Para criar uma nova senha, acesse o link:\n${safeLink}\n\n` +
    `Este link expira em aproximadamente ${safeMinutes} minutos.\n\n` +
    `Se você não solicitou isso, ignore este e-mail.`;

  const html = `
  <div style="font-family: Arial, sans-serif; background:#fff; color:#1f2937; line-height:1.4; padding: 8px 0;">
    <div style="max-width: 560px; margin: 0 auto; padding: 20px; border:1px solid #e5e7eb; border-radius: 10px;">
      <h2 style="margin:0 0 12px; font-size:20px;">Recuperação de senha</h2>

      <p style="margin:0 0 12px; font-size:14px;">
        Recebemos uma solicitação para redefinir a senha da sua conta no <strong>PeloCaramelo</strong>.
      </p>

      <p style="margin:0 0 16px; font-size:14px;">
        Clique no botão abaixo para criar uma nova senha (o link expira em aproximadamente <strong>${escapeHtml(
          String(safeMinutes)
        )} minutos</strong>).
      </p>

      <p style="margin:0 0 18px;">
        <a href="${escapeHtml(safeLink)}"
           style="display:inline-block; padding:12px 18px; background:#FFD700; color:#5A3A22; text-decoration:none; border-radius:8px; font-weight:700;">
          Criar nova senha
        </a>
      </p>

      <p style="margin:0 0 10px; font-size:12px; color:#6b7280;">
        Se o botão não funcionar, copie e cole este link no navegador:
      </p>

      <p style="margin:0 0 18px; font-size:12px; word-break:break-all;">
        <a href="${escapeHtml(safeLink)}" style="color:#2563eb; text-decoration:underline;">
          ${escapeHtml(safeLink)}
        </a>
      </p>

      <hr style="border:none; border-top:1px solid #e5e7eb; margin: 16px 0;" />

      <p style="margin:0; font-size:12px; color:#6b7280;">
        Se você não solicitou essa recuperação, pode ignorar este e-mail com segurança.
      </p>
    </div>
  </div>
  `;

  return { subject, text, html };
}

/* ============================================================
   REGISTER
   ============================================================ */
async function register(req, res) {
  try {
    const body = readBody(req);

    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim();
    const password = String(body?.password || "");
    const role = body?.role || "tutor";

    // ✅ agora são obrigatórios
    const city = String(body?.city || "").trim();
    const neighborhood = String(body?.neighborhood || "").trim();

    // opcionais
    const phone = body?.phone ?? null;
    const address = body?.address ?? null;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Nome, e-mail e senha são obrigatórios." });
    }

    // ✅ city + neighborhood obrigatórios (e não aceitam vazio)
    if (!city) {
      return res.status(400).json({
        error: "Cidade é obrigatória.",
        code: "CITY_REQUIRED",
      });
    }

    if (!neighborhood) {
      return res.status(400).json({
        error: "Bairro é obrigatório.",
        code: "NEIGHBORHOOD_REQUIRED",
      });
    }

    // ✅ senha forte no backend
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        error: "Senha fraca. Use no mínimo 8 caracteres, com letras e números.",
        code: "WEAK_PASSWORD",
      });
    }

    const normalizedEmail = trimLower(email);
    const existing = await findUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: "E-mail já cadastrado." });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);

    const newUser = await createUser({
      name,
      email: normalizedEmail,
      passwordHash,
      role,
      city,
      neighborhood,
      phone: phone ? String(phone).trim() : null,
      address: address ? String(address).trim() : null,
    });

    const token = generateToken(newUser);

    return res.status(201).json({
      user: newUser,
      token,
      hasCaregiverProfile: false,
    });
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
      return res.status(400).json({ error: "E-mail e senha são obrigatórios." });
    }

    const user = await findUserByEmail(trimLower(email));
    if (!user) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    const bi = pickBlockInfo(user);
    if (bi.blocked) {
      return res.status(403).json({
        code: "USER_BLOCKED",
        error: "Usuário bloqueado.",
        reason: bi.blockedReason,
        blockedUntil: bi.blockedUntil,
      });
    }

    const match = await bcrypt.compare(String(password), user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    const token = generateToken(user);

    const hasCaregiverProfile = await hasCaregiverProfileByUserId(user.id);

    return res.json({ user, token, hasCaregiverProfile });
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

    const bi = pickBlockInfo(user);
    if (bi.blocked) {
      return res.status(403).json({
        code: "USER_BLOCKED",
        error: "Usuário bloqueado.",
        reason: bi.blockedReason,
        blockedUntil: bi.blockedUntil,
      });
    }

    const hasCaregiverProfile = await hasCaregiverProfileByUserId(userId);

    return res.json({ user, hasCaregiverProfile });
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
      // ignore
    }

    const token = crypto.randomBytes(32).toString("hex");

    const minutes = Number(process.env.PASSWORD_RESET_EXPIRES_MINUTES || 60);
    const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
    const expiresAt = new Date(Date.now() + safeMinutes * 60 * 1000);

    await invalidateAllActiveByUserId(user.id);
    await createPasswordReset({ userId: user.id, token, expiresAt });

    const base = computeFrontendBase(req);

    if (!base) {
      console.warn(
        "[forgotPassword] FRONTEND_URL/origin ausente. Configure FRONTEND_URL no Render. " +
          "E-mail não será enviado para evitar link quebrado."
      );
      return res.json(safeResponse);
    }

    const link = `${base}/reset-password?token=${encodeURIComponent(token)}`;

    const { subject, text, html } = resetPasswordEmail({
      link,
      minutes: safeMinutes,
      brandName: "PeloCaramelo",
    });

    try {
      await sendEmail({
        to: user.email,
        subject,
        html,
        text,
      });
    } catch (e) {
      console.error("[forgotPassword] Falha ao enviar email:", e?.message || e);
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

    const token = String(body?.token || "").trim();
    const newPassword = String(body?.newPassword || body?.password || "");

    if (!token || !newPassword) {
      return res.status(400).json({ error: "Token inválido ou senha ausente." });
    }

    // ✅ senha forte também no reset (não deixa “furar”)
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        error: "Senha fraca. Use no mínimo 8 caracteres, com letras e números.",
        code: "WEAK_PASSWORD",
      });
    }

    const reset = await findValidPasswordResetByToken(token);
    if (!reset) {
      return res.status(400).json({ error: "Token inválido ou expirado." });
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 10);
    await updateUserPassword(reset.user_id, passwordHash);

    await markPasswordResetUsed(reset.id);
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
