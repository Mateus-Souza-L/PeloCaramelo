// backend/src/controllers/authController.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../config/db");
const { sendEmail, sendWelcomeEmail } = require("../services/emailService");
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
   ✅ NORMALIZAÇÃO DE ROLE NO REGISTER
   - Aceita body.role ou body.mode (pra links /register?mode=caregiver)
   - Só permite "tutor" ou "caregiver"
   - Nunca permite admin via register
   ============================================================ */

function normalizeRegisterRole(input) {
  const raw = String(input || "").trim().toLowerCase();

  // variações que significam cuidador
  const caregiverAliases = new Set([
    "caregiver",
    "cuidador",
    "cuidadora",
    "cuidador(a)",
    "cuidador(a) ",
    "cuidador (a)",
    "cuidador - cuidadora",
    "cuidadores",
    // compat: mode do link
    "modo cuidador",
  ]);

  // variações que significam tutor
  const tutorAliases = new Set(["tutor", "tutora", "tutores", "modo tutor"]);

  if (caregiverAliases.has(raw)) return "caregiver";
  if (tutorAliases.has(raw)) return "tutor";

  // se vier vazio, cai no padrão tutor (comportamento seguro)
  if (!raw) return "tutor";

  // qualquer outra coisa: inválido
  return null;
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

    if (cols) {
      if (cols.hasUserId) {
        const { rows } = await pool.query(
          `SELECT 1 FROM caregiver_profiles WHERE user_id::text = $1 LIMIT 1`,
          [idStr]
        );
        if (rows?.length) return true;
      }

      if (cols.hasId) {
        const { rows } = await pool.query(
          `SELECT 1 FROM caregiver_profiles WHERE id::text = $1 LIMIT 1`,
          [idStr]
        );
        if (rows?.length) return true;
      }

      if (cols.hasCaregiverId) {
        const { rows } = await pool.query(
          `SELECT 1 FROM caregiver_profiles WHERE caregiver_id::text = $1 LIMIT 1`,
          [idStr]
        );
        if (rows?.length) return true;
      }

      return false;
    }

    // fallback sem information_schema:
    try {
      const { rows } = await pool.query(
        `SELECT 1 FROM caregiver_profiles WHERE user_id::text = $1 LIMIT 1`,
        [idStr]
      );
      if (rows?.length) return true;
    } catch {}

    try {
      const { rows } = await pool.query(
        `SELECT 1 FROM caregiver_profiles WHERE id::text = $1 LIMIT 1`,
        [idStr]
      );
      if (rows?.length) return true;
    } catch {}

    return false;
  } catch (err) {
    console.error("[authController] hasCaregiverProfileByUserId error:", err?.message || err);
    return false;
  }
}

/* ============================================================
   ✅ Referral (convite) — tolerante ao schema
   - Aceita body.ref / body.referrer / body.referredBy (string)
   - Só grava se existir coluna no banco
   ============================================================ */

let cachedUsersReferralCols = null; // { col: 'referred_by' | 'referrer_id' | ... } | null
let cachedUsersReferralColsAt = 0;

async function detectUsersReferralColumn() {
  const now = Date.now();
  if (cachedUsersReferralCols && now - cachedUsersReferralColsAt < 5 * 60 * 1000) {
    return cachedUsersReferralCols;
  }

  try {
    // tente alguns nomes comuns (você pode padronizar depois via migration)
    const candidates = [
      "referred_by",
      "referrer_id",
      "invited_by",
      "ref_by",
      "referrer",
      "ref_source",
    ];

    const sql = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = ANY($1::text[])
      LIMIT 10
    `;
    const { rows } = await pool.query(sql, [candidates]);

    const set = new Set((rows || []).map((r) => String(r.column_name)));
    const first = candidates.find((c) => set.has(c)) || null;

    cachedUsersReferralCols = { col: first };
    cachedUsersReferralColsAt = now;
    return cachedUsersReferralCols;
  } catch {
    cachedUsersReferralCols = { col: null };
    cachedUsersReferralColsAt = now;
    return cachedUsersReferralCols;
  }
}

function normalizeRefValue(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  if (s.toLowerCase() === "guest") return "guest";

  // se for id numérico (ex: user.id)
  const n = Number(s);
  if (Number.isFinite(n) && n > 0) return n;

  // fallback: string curta (ex: código)
  return s.slice(0, 120);
}

async function trySaveReferralForUser(newUserId, refValue) {
  if (!newUserId || refValue == null) return;

  const meta = await detectUsersReferralColumn();
  const col = meta?.col;
  if (!col) return;

  // atualiza sem quebrar se o tipo for diferente (número vs texto)
  try {
    await pool.query(`UPDATE users SET ${col} = $1 WHERE id = $2`, [refValue, newUserId]);
  } catch (err) {
    // se a coluna for integer e veio string, tenta converter; se falhar, ignora (fail-safe)
    try {
      const n = Number(refValue);
      if (Number.isFinite(n)) {
        await pool.query(`UPDATE users SET ${col} = $1 WHERE id = $2`, [n, newUserId]);
      }
    } catch {}
    console.warn("[referral] Não foi possível gravar referral:", err?.message || err);
  }
}

/**
 * ✅ Para links críticos (ex.: reset de senha), prefira SEMPRE FRONTEND_URL
 * - evita origin/referer errados em produção/proxies
 */
function getFrontendBaseStrict() {
  return String(process.env.FRONTEND_URL || "").trim().replace(/\/$/, "");
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

    // ✅ aceita role OU mode (pra não depender 100% do front)
    const roleInput = body?.role ?? body?.mode ?? "";
    const roleNorm = normalizeRegisterRole(roleInput);
    if (roleNorm == null) {
      return res.status(400).json({
        error: "Tipo de perfil inválido. Escolha Tutor ou Cuidador.",
        code: "INVALID_ROLE",
      });
    }
    const role = roleNorm;

    // ✅ agora são obrigatórios
    const city = String(body?.city || "").trim();
    const neighborhood = String(body?.neighborhood || "").trim();

    // opcionais
    const phone = body?.phone ?? null;
    const address = body?.address ?? null;

    // ✅ convite/ref (opcional)
    const refRaw = body?.ref ?? body?.referrer ?? body?.referredBy ?? body?.invitedBy ?? null;
    const refValue = normalizeRefValue(refRaw);

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Nome, e-mail e senha são obrigatórios." });
    }

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
      role, // ✅ sempre "tutor" ou "caregiver"
      city,
      neighborhood,
      phone: phone ? String(phone).trim() : null,
      address: address ? String(address).trim() : null,
    });

    // ✅ grava referral se houver coluna (fail-safe)
    try {
      await trySaveReferralForUser(newUser?.id, refValue);
    } catch {
      // ignore
    }

    // ✅ tenta mandar e-mail de boas-vindas sem travar o cadastro
    try {
      await sendWelcomeEmail({
        email: newUser.email,
        name: newUser?.name || name,
        role: newUser?.role || role,
      });
    } catch (e) {
      console.error("[welcomeEmail] Falha ao enviar e-mail de boas-vindas:", e?.message || e);
    }

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
    } catch {}

    const token = crypto.randomBytes(32).toString("hex");

    const minutes = Number(process.env.PASSWORD_RESET_EXPIRES_MINUTES || 60);
    const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
    const expiresAt = new Date(Date.now() + safeMinutes * 60 * 1000);

    await invalidateAllActiveByUserId(user.id);
    await createPasswordReset({ userId: user.id, token, expiresAt });

    // ✅ CRÍTICO: reset deve usar SEMPRE FRONTEND_URL
    const base = getFrontendBaseStrict();

    if (!base) {
      console.warn(
        "[forgotPassword] FRONTEND_URL ausente. Configure FRONTEND_URL no Render. " +
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

    // ✅ senha forte também no reset
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