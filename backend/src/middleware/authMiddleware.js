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

  const blockedReason = row.blocked_reason ?? row.block_reason ?? row.blockReason ?? null;

  const blockedUntil = row.blocked_until ?? row.block_until ?? row.blockedUntil ?? null;

  return {
    blocked: Boolean(blocked),
    blockedReason: blockedReason ? String(blockedReason) : null,
    blockedUntil: blockedUntil ? String(blockedUntil) : null,
  };
}

function isUntilActive(blockedUntil) {
  // Se não tem "until", considera bloqueio ativo enquanto blocked=true.
  // (mantém comportamento conservador)
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

/* ============================================================
   ✅ Multi-perfil tolerante ao schema de caregiver_profiles
   - Alguns ambientes têm caregiver_profiles.user_id
   - Outros têm caregiver_profiles.caregiver_id
   - Outros usam caregiver_profiles.id == users.id
   Precisamos checar sem referenciar coluna inexistente.
   ============================================================ */

// cache simples (5 min)
let cachedCaregiverLinkCol = null; // "user_id" | "caregiver_id" | null
let cachedCaregiverColsAt = 0;

async function detectCaregiverProfilesLinkColumn() {
  const now = Date.now();
  if (cachedCaregiverColsAt && now - cachedCaregiverColsAt < 5 * 60 * 1000) {
    return cachedCaregiverLinkCol;
  }

  try {
    const sql = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'caregiver_profiles'
        AND column_name IN ('user_id', 'caregiver_id')
    `;
    const { rows } = await pool.query(sql);

    const cols = new Set((rows || []).map((r) => String(r.column_name)));

    if (cols.has("user_id")) cachedCaregiverLinkCol = "user_id";
    else if (cols.has("caregiver_id")) cachedCaregiverLinkCol = "caregiver_id";
    else cachedCaregiverLinkCol = null;

    cachedCaregiverColsAt = now;
    return cachedCaregiverLinkCol;
  } catch {
    cachedCaregiverLinkCol = null;
    cachedCaregiverColsAt = now;
    return null;
  }
}

async function existsCaregiverProfileForUserId(userId) {
  const idStr = String(userId ?? "").trim();
  if (!idStr) return false;

  // 1) tenta via detecção
  const linkCol = await detectCaregiverProfilesLinkColumn();

  try {
    if (linkCol === "user_id") {
      const { rows } = await pool.query(
        `
        SELECT 1
        FROM caregiver_profiles cp
        WHERE (cp.user_id::text = $1::text)
           OR (cp.id::text = $1::text)
        LIMIT 1
        `,
        [idStr]
      );
      return rows?.length > 0;
    }

    if (linkCol === "caregiver_id") {
      const { rows } = await pool.query(
        `
        SELECT 1
        FROM caregiver_profiles cp
        WHERE (cp.caregiver_id::text = $1::text)
           OR (cp.id::text = $1::text)
        LIMIT 1
        `,
        [idStr]
      );
      return rows?.length > 0;
    }

    // 2) se não detectou, fallback por tentativa/erro
    try {
      const { rows } = await pool.query(
        `
        SELECT 1
        FROM caregiver_profiles cp
        WHERE (cp.user_id::text = $1::text)
           OR (cp.id::text = $1::text)
        LIMIT 1
        `,
        [idStr]
      );
      cachedCaregiverLinkCol = "user_id";
      cachedCaregiverColsAt = Date.now();
      return rows?.length > 0;
    } catch (e1) {
      const { rows } = await pool.query(
        `
        SELECT 1
        FROM caregiver_profiles cp
        WHERE (cp.caregiver_id::text = $1::text)
           OR (cp.id::text = $1::text)
        LIMIT 1
        `,
        [idStr]
      );
      cachedCaregiverLinkCol = "caregiver_id";
      cachedCaregiverColsAt = Date.now();
      return rows?.length > 0;
    }
  } catch (err) {
    // Se a tabela nem existir em algum ambiente, evita quebrar login/me.
    const msg = String(err?.message || "").toLowerCase();
    if (msg.includes("does not exist") || err?.code === "42P01") {
      return false;
    }
    throw err;
  }
}

/* ============================================================
   ✅ Fallback adicional: tabela caregivers (se existir)
   - Muitos projetos ligam cuidador por caregivers.user_id
   ============================================================ */

// cache simples (5 min)
let cachedCaregiversInfo = null; // { exists: boolean, hasUserId: boolean }
let cachedCaregiversInfoAt = 0;

async function detectCaregiversTableInfo() {
  const now = Date.now();
  if (cachedCaregiversInfo && now - cachedCaregiversInfoAt < 5 * 60 * 1000) {
    return cachedCaregiversInfo;
  }

  const info = { exists: false, hasUserId: false };

  try {
    const { rows: tRows } = await pool.query(
      `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'caregivers'
      LIMIT 1
      `
    );

    if (!tRows?.length) {
      cachedCaregiversInfo = info;
      cachedCaregiversInfoAt = now;
      return info;
    }

    info.exists = true;

    const { rows: cRows } = await pool.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'caregivers'
        AND column_name IN ('user_id')
      `
    );

    const set = new Set((cRows || []).map((r) => String(r.column_name)));
    info.hasUserId = set.has("user_id");

    cachedCaregiversInfo = info;
    cachedCaregiversInfoAt = now;
    return info;
  } catch {
    cachedCaregiversInfo = info;
    cachedCaregiversInfoAt = now;
    return info;
  }
}

async function existsCaregiverRowForUserId(userId) {
  const idStr = String(userId ?? "").trim();
  if (!idStr) return false;

  const info = await detectCaregiversTableInfo();
  if (!info?.exists) return false;

  // melhor caminho: tem user_id
  if (info.hasUserId) {
    try {
      const { rows } = await pool.query(
        `SELECT 1 FROM caregivers c WHERE c.user_id::text = $1::text LIMIT 1`,
        [idStr]
      );
      return rows?.length > 0;
    } catch (err) {
      // se a coluna não existe (schema mudou), cai no fallback
      if (err?.code === "42703") return false;
      // se a tabela não existe, false
      if (err?.code === "42P01") return false;
      return false;
    }
  }

  // fallback tentativa/erro
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM caregivers c WHERE c.user_id::text = $1::text LIMIT 1`,
      [idStr]
    );
    return rows?.length > 0;
  } catch (err) {
    if (err?.code === "42703") return false;
    if (err?.code === "42P01") return false;
    return false;
  }
}

/**
 * ✅ Busca info de bloqueio + multi-perfil
 * - blocked / blocked_reason / blocked_until (se existirem)
 * - hasCaregiverProfile (EXISTS caregiver_profiles OU caregivers) - schema tolerante
 */
async function fetchUserSecurityAndProfiles(userId) {
  const id = String(userId);

  // 1) carrega bloqueio (tenta colunas completas; se falhar, fallback)
  try {
    const { rows } = await pool.query(
      `
      SELECT
        u.blocked,
        u.blocked_reason,
        u.blocked_until
      FROM users u
      WHERE u.id::text = $1::text
      LIMIT 1;
      `,
      [id]
    );

    const row = rows?.[0] || null;
    if (!row) return null;

    const blockInfo = pickBlockedPayload(row);

    // 2) checa perfil cuidador com schema tolerante (best-effort)
    let hasCaregiverProfile = false;

    // 2a) caregiver_profiles
    try {
      hasCaregiverProfile = await existsCaregiverProfileForUserId(id);
    } catch (e) {
      console.error("[authMiddleware] existsCaregiverProfileForUserId error:", e?.message || e);
      hasCaregiverProfile = false;
    }

    // 2b) fallback caregivers
    if (!hasCaregiverProfile) {
      try {
        hasCaregiverProfile = await existsCaregiverRowForUserId(id);
      } catch (e) {
        console.error("[authMiddleware] existsCaregiverRowForUserId error:", e?.message || e);
        hasCaregiverProfile = false;
      }
    }

    return {
      ...blockInfo,
      hasCaregiverProfile: Boolean(hasCaregiverProfile),
    };
  } catch (err) {
    // fallback: se algum ambiente não tiver blocked_reason/blocked_until
    if (err?.code === "42703") {
      const { rows } = await pool.query(
        `
        SELECT
          u.blocked
        FROM users u
        WHERE u.id::text = $1::text
        LIMIT 1;
        `,
        [id]
      );

      const row = rows?.[0] || null;
      if (!row) return null;

      const blockInfo = pickBlockedPayload(row);

      let hasCaregiverProfile = false;

      try {
        hasCaregiverProfile = await existsCaregiverProfileForUserId(id);
      } catch (e) {
        console.error("[authMiddleware] existsCaregiverProfileForUserId error:", e?.message || e);
        hasCaregiverProfile = false;
      }

      if (!hasCaregiverProfile) {
        try {
          hasCaregiverProfile = await existsCaregiverRowForUserId(id);
        } catch (e) {
          console.error("[authMiddleware] existsCaregiverRowForUserId error:", e?.message || e);
          hasCaregiverProfile = false;
        }
      }

      return {
        ...blockInfo,
        hasCaregiverProfile: Boolean(hasCaregiverProfile),
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
      role, // "admin", "admin_master", "tutor", "caregiver", ...
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
