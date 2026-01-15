// backend/src/middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn("⚠️ JWT_SECRET não definido no ambiente!");
}

function pickBlockedPayload(row) {
  if (!row) return null;

  // compatível com variações de nomes
  const blocked =
    row.blocked ??
    row.is_blocked ??
    row.isBlocked ??
    false;

  const blockedReason =
    row.blocked_reason ??
    row.block_reason ??
    row.blockReason ??
    null;

  const blockedUntil =
    row.blocked_until ??
    row.block_until ??
    row.blockedUntil ??
    null;

  return {
    blocked: Boolean(blocked),
    blockedReason: blockedReason ? String(blockedReason) : null,
    blockedUntil: blockedUntil ? String(blockedUntil) : null,
  };
}

function isUntilActive(blockedUntil) {
  if (!blockedUntil) return true; // sem data => bloqueio indefinido
  const dt = new Date(blockedUntil);
  if (Number.isNaN(dt.getTime())) return true; // data inválida => trata como indefinido
  return dt.getTime() > Date.now(); // ativo se ainda não passou
}

// tenta ler colunas novas; se não existirem, cai no fallback
async function fetchBlockInfo(userId) {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        blocked,
        blocked_reason,
        blocked_until
      FROM users
      WHERE id::text = $1::text
      LIMIT 1;
      `,
      [String(userId)]
    );
    return pickBlockedPayload(rows?.[0] || null);
  } catch (err) {
    // coluna não existe
    if (err?.code === "42703") {
      const { rows } = await pool.query(
        `
        SELECT blocked
        FROM users
        WHERE id::text = $1::text
        LIMIT 1;
        `,
        [String(userId)]
      );
      return pickBlockedPayload(rows?.[0] || null);
    }
    throw err;
  }
}

// se existir blocked_until e ele já passou, desbloqueia automaticamente (best-effort)
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
    // se colunas não existirem, só ignora
    if (err?.code === "42703") return false;
    return false;
  }
}

/**
 * Middleware de autenticação via JWT.
 * Espera: Authorization: Bearer <token>
 */
async function authMiddleware(req, res, next) {
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

    // ✅ Usuário autenticado (do token)
    req.user = {
      id: String(decoded.id),
      role: String(decoded.role),
    };

    // ✅ Checagem de bloqueio no banco (para token antigo também)
    const info = await fetchBlockInfo(req.user.id);

    // usuário não existe mais
    if (!info) {
      return res.status(401).json({
        error: "Usuário não encontrado. Faça login novamente.",
        code: "USER_NOT_FOUND",
      });
    }

    if (info.blocked) {
      // se tiver blocked_until e já expirou, tenta desbloquear e seguir
      if (info.blockedUntil && !isUntilActive(info.blockedUntil)) {
        await tryAutoUnblockIfExpired(req.user.id);

        // reconsulta (best-effort)
        const refreshed = await fetchBlockInfo(req.user.id);
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

      // bloqueio ativo (indefinido ou ainda dentro do prazo)
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
      isExpired ? "TOKEN_EXPIRED" : err.message
    );

    return res.status(401).json({
      error: "Token inválido ou expirado. Faça login novamente.",
      code: isExpired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
    });
  }
}

module.exports = authMiddleware;
