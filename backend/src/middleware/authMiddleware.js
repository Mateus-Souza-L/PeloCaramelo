// backend/src/middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn("⚠️ JWT_SECRET não definido no ambiente! (misconfig)");
}

function pickBlockedPayload(row) {
  if (!row) return null;

  const blocked = row.blocked ?? row.is_blocked ?? row.isBlocked ?? false;

  const blockedReason =
    row.blocked_reason ?? row.block_reason ?? row.blockReason ?? null;

  const blockedUntil =
    row.blocked_until ?? row.block_until ?? row.blockedUntil ?? null;

  return {
    blocked: Boolean(blocked),
    blockedReason: blockedReason ? String(blockedReason) : null,
    blockedUntil: blockedUntil ? String(blockedUntil) : null,
  };
}

function isUntilActive(blockedUntil) {
  if (!blockedUntil) return true;
  const dt = new Date(blockedUntil);
  if (Number.isNaN(dt.getTime())) return true;
  return dt.getTime() > Date.now();
}

function normalizeRole(role) {
  return String(role || "").toLowerCase().trim();
}

// admin_master => 1 (master), admin => 0 (normal admin)
function computeAdminLevel(role) {
  const r = normalizeRole(role);
  if (r === "admin_master") return 1;
  return 0;
}

/**
 * ✅ Busca info de bloqueio + capacidade de cuidador (multi-perfil)
 * - blocked / blocked_reason / blocked_until (se existirem)
 * - hasCaregiverProfile (EXISTS caregiver_profiles)
 */
async function fetchUserSecurityAndProfiles(userId) {
  const id = String(userId);

  try {
    const { rows } = await pool.query(
      `
      SELECT
        u.blocked,
        u.blocked_reason,
        u.blocked_until,
        EXISTS (
          SELECT 1
          FROM caregiver_profiles cp
          WHERE cp.user_id = u.id
        ) AS has_caregiver_profile
      FROM users u
      WHERE u.id::text = $1::text
      LIMIT 1;
      `,
      [id]
    );

    const row = rows?.[0] || null;
    if (!row) return null;

    const blockInfo = pickBlockedPayload(row);
    return {
      ...blockInfo,
      hasCaregiverProfile: Boolean(row.has_caregiver_profile),
    };
  } catch (err) {
    // fallback: se algum ambiente não tiver blocked_reason/blocked_until (ou outras colunas)
    if (err?.code === "42703") {
      const { rows } = await pool.query(
        `
        SELECT
          u.blocked,
          EXISTS (
            SELECT 1
            FROM caregiver_profiles cp
            WHERE cp.user_id = u.id
          ) AS has_caregiver_profile
        FROM users u
        WHERE u.id::text = $1::text
        LIMIT 1;
        `,
        [id]
      );

      const row = rows?.[0] || null;
      if (!row) return null;

      const blockInfo = pickBlockedPayload(row);
      return {
        ...blockInfo,
        hasCaregiverProfile: Boolean(row.has_caregiver_profile),
      };
    }
    throw err;
  }
}

async function tryAutoUnblockIfExpired(userId) {
  try {
    await pool.query(
      `
      UPDATE users
      SET blocked = false,
          blocked_reason = NULL,
          blocked_until = NULL
      WHERE id::text = $1::text
        AND blocked = true
        AND blocked_until IS NOT NULL
        AND blocked_until <= NOW();
      `,
      [String(userId)]
    );
    return true;
  } catch (err) {
    if (err?.code === "42703") return false;
    return false;
  }
}

/**
 * Middleware de autenticação via JWT.
 * Espera: Authorization: Bearer <token>
 */
async function authMiddleware(req, res, next) {
  // ✅ se o servidor estiver mal configurado, não culpar o usuário
  if (!JWT_SECRET) {
    return res.status(500).json({
      error: "Configuração inválida do servidor (JWT_SECRET ausente).",
      code: "SERVER_MISCONFIG",
    });
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      error: "Token não fornecido. Faça login novamente.",
      code: "NO_TOKEN",
    });
  }

  const [scheme, token] = authHeader.split(" ");

  if (!/^Bearer$/i.test(scheme) || !token) {
    return res.status(401).json({
      error: "Formato do token inválido. Faça login novamente.",
      code: "INVALID_TOKEN_FORMAT",
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (!decoded?.id || !decoded?.role) {
      return res.status(401).json({
        error: "Token inválido. Faça login novamente.",
        code: "MALFORMED_TOKEN",
      });
    }

    const role = normalizeRole(decoded.role);
    const admin_level = computeAdminLevel(role);
    const isAdminLike = role === "admin" || role === "admin_master";

    // ✅ Usuário autenticado (do token)
    req.user = {
      id: String(decoded.id),
      role, // "admin", "admin_master", "tutor", ...
      admin_level,
      isAdminLike,
      hasCaregiverProfile: false, // ✅ preenchido via banco
    };

    // ✅ Checagem no banco (fonte da verdade)
    const info = await fetchUserSecurityAndProfiles(req.user.id);

    if (!info) {
      return res.status(401).json({
        error: "Usuário não encontrado. Faça login novamente.",
        code: "USER_NOT_FOUND",
      });
    }

    // ✅ injeta capacidade (multi-perfil)
    req.user.hasCaregiverProfile = Boolean(info.hasCaregiverProfile);

    // ✅ bloqueio
    if (info.blocked) {
      if (info.blockedUntil && !isUntilActive(info.blockedUntil)) {
        await tryAutoUnblockIfExpired(req.user.id);

        const refreshed = await fetchUserSecurityAndProfiles(req.user.id);
        if (refreshed && refreshed.blocked) {
          return res.status(403).json({
            error: "Seu acesso está bloqueado.",
            code: "USER_BLOCKED",
            reason: refreshed.blockedReason,
            blockedUntil: refreshed.blockedUntil,
          });
        }

        return next();
      }

      return res.status(403).json({
        error: "Seu acesso está bloqueado.",
        code: "USER_BLOCKED",
        reason: info.blockedReason,
        blockedUntil: info.blockedUntil,
      });
    }

    return next();
  } catch (err) {
    const isExpired = err?.name === "TokenExpiredError";

    console.error(
      "❌ Erro ao validar token JWT:",
      isExpired ? "TOKEN_EXPIRED" : err?.message || err
    );

    return res.status(401).json({
      error: "Token inválido ou expirado. Faça login novamente.",
      code: isExpired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
    });
  }
}

module.exports = authMiddleware;
