// backend/src/routes/caregiverRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");

/**
 * ✅ Regras de rating (fonte única + fallback legado)
 * - Fonte principal: tabela reviews (reviews.reviewed_id = caregiver_id)
 * - Fallback legado: reservations.tutor_rating (somente se ainda NÃO existe review na tabela reviews
 *   para a mesma reserva + mesmo autor)
 */

const DEFAULT_DAILY_CAPACITY = Number(process.env.DEFAULT_DAILY_CAPACITY || 15);

/* ============================================================
   ✅ Schema-tolerant: users.daily_capacity pode ou não existir
   ============================================================ */

let _usersColsChecked = false;
let _hasDailyCapacityCol = false;

async function detectUsersColumnsOnce() {
  if (_usersColsChecked) return;
  _usersColsChecked = true;

  try {
    const { rows } = await pool.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name IN ('daily_capacity')
      `
    );

    const set = new Set((rows || []).map((r) => String(r.column_name)));
    _hasDailyCapacityCol = set.has("daily_capacity");
  } catch {
    _hasDailyCapacityCol = false;
  }
}

function usersDailyCapacitySelectExpr() {
  if (_hasDailyCapacityCol) return "COALESCE(u.daily_capacity, 15) AS daily_capacity";
  return `${DEFAULT_DAILY_CAPACITY}::int AS daily_capacity`;
}

/* ============================================================
   ✅ Helpers: normalização/validação do body
   ============================================================ */

// ✅ opções canônicas (keys) + aceitação de label
const SERVICE_OPTIONS = [
  { key: "hospedagem", label: "Hospedagem" },
  { key: "creche", label: "Creche" },
  { key: "passeios", label: "Passeios" }, // ✅ IMPORTANTE: alinhar com o front (Search usa "passeios")
  { key: "petSitter", label: "Visita / Pet Sitter" },
  { key: "banho", label: "Banho & Tosa" },
];

// mapa label->key e key->key (aceita ambos)
const SERVICE_TOKEN_TO_KEY = (() => {
  const m = new Map();
  for (const opt of SERVICE_OPTIONS) {
    m.set(String(opt.key).toLowerCase(), opt.key);
    m.set(String(opt.label).toLowerCase(), opt.key);
  }
  return m;
})();

function normalizeServicesToKeys(input) {
  if (input == null) return null;

  const arr = Array.isArray(input) ? input : [input];
  const cleaned = arr
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .slice(0, 30);

  const seen = new Set();
  const keys = [];
  for (const s of cleaned) {
    const token = s.toLowerCase();
    const key = SERVICE_TOKEN_TO_KEY.get(token);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

function buildServicesObjectFromKeys(keys) {
  const obj = {};
  for (const opt of SERVICE_OPTIONS) obj[opt.key] = false;
  for (const k of keys || []) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) obj[k] = true;
  }
  return obj;
}

function normalizeDailyCapacity(input) {
  if (input == null || input === "") return null;
  const n = Number(input);
  if (!Number.isFinite(n)) return null;
  const v = Math.floor(n);
  if (v < 1) return null;
  if (v > 1000) return 1000;
  return v;
}

/* ============================================================
   ✅ Helpers: filtro de cuidador
   - Regra NOVA (fix do bug):
     precisa ter pelo menos 1 serviço true E preço válido (>0)
   ============================================================ */

function safeParseJson(v, fallback) {
  if (v == null) return fallback;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function normalizePriceValue(raw) {
  if (raw == null) return null;

  // aceita número, "55", "55.00", "55,00", "R$ 55,00"
  const s = String(raw).trim();
  if (!s) return null;

  const cleaned = s
    .replace(/[^\d,.\-]/g, "") // remove "R$" e outros
    .replace(",", "."); // pt-br -> en

  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  return n;
}

function hasAtLeastOneEnabledServiceWithValidPrice(servicesRaw, pricesRaw) {
  const services = safeParseJson(servicesRaw, {});
  const prices = safeParseJson(pricesRaw, {});

  if (!services || typeof services !== "object") return false;

  // precisa haver pelo menos 1 serviço habilitado com preço > 0
  for (const [serviceKey, enabled] of Object.entries(services)) {
    if (!enabled) continue;

    // preço pode estar em prices[serviceKey]
    const price = normalizePriceValue(prices?.[serviceKey]);
    if (price != null) return true;
  }

  return false;
}

/* ============================================================
   ✅ BASE FIELDS
   ============================================================ */

function baseFieldsSql() {
  return `
    u.id,
    u.name,
    u.email,
    u.role,
    u.image,
    u.bio,
    u.phone,
    u.address,
    u.neighborhood,
    u.city,
    u.cep,
    u.services,
    u.prices,
    u.courses,
    ${usersDailyCapacitySelectExpr()}
  `;
}

const RATING_LATERAL = `
LEFT JOIN LATERAL (
  WITH union_ratings AS (
    SELECT rv.rating::numeric AS rating
    FROM reviews rv
    WHERE rv.reviewed_id = u.id
      AND (rv.is_hidden IS NOT TRUE)

    UNION ALL

    SELECT r.tutor_rating::numeric AS rating
    FROM reservations r
    LEFT JOIN reviews rv2
      ON rv2.reservation_id = r.id
     AND rv2.reviewer_id = r.tutor_id
    WHERE r.caregiver_id = u.id
      AND r.tutor_rating IS NOT NULL
      AND r.tutor_rating > 0
      AND (rv2.id IS NULL)
  )
  SELECT
    COALESCE(AVG(rating), 0)     AS rating_avg,
    COUNT(*)::int               AS rating_count
  FROM union_ratings
) rs ON true
`;

const COMPLETED_LATERAL = `
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS completed_reservations
  FROM reservations r
  WHERE r.caregiver_id = u.id
    AND lower(coalesce(r.status, '')) IN ('concluida','concluída','finalizada','completed')
) done ON true
`;

/* ============================================================
   ✅ Schema-tolerant: caregiver_profiles pode ter:
   - user_id
   - caregiver_id
   ============================================================ */

let cachedLinkCol = null; // "user_id" | "caregiver_id" | null
let cachedAt = 0;

async function detectLinkColumn() {
  const now = Date.now();
  if (cachedAt && now - cachedAt < 5 * 60 * 1000) return cachedLinkCol;

  try {
    const { rows } = await pool.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'caregiver_profiles'
        AND column_name IN ('user_id', 'caregiver_id')
      `
    );

    const cols = new Set((rows || []).map((r) => String(r.column_name)));

    if (cols.has("user_id")) cachedLinkCol = "user_id";
    else if (cols.has("caregiver_id")) cachedLinkCol = "caregiver_id";
    else cachedLinkCol = null;

    cachedAt = now;
    return cachedLinkCol;
  } catch {
    cachedLinkCol = null;
    cachedAt = now;
    return null;
  }
}

async function hasCaregiverProfile(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return false;

  const idStr = String(id);
  const linkCol = await detectLinkColumn();

  try {
    if (linkCol === "user_id") {
      const { rows } = await pool.query(
        `SELECT 1 FROM caregiver_profiles WHERE user_id::text = $1 LIMIT 1`,
        [idStr]
      );
      return rows?.length > 0;
    }

    if (linkCol === "caregiver_id") {
      const { rows } = await pool.query(
        `SELECT 1 FROM caregiver_profiles WHERE caregiver_id::text = $1 LIMIT 1`,
        [idStr]
      );
      return rows?.length > 0;
    }

    // fallback por tentativa/erro
    try {
      const { rows } = await pool.query(
        `SELECT 1 FROM caregiver_profiles WHERE user_id::text = $1 LIMIT 1`,
        [idStr]
      );
      cachedLinkCol = "user_id";
      cachedAt = Date.now();
      return rows?.length > 0;
    } catch {
      const { rows } = await pool.query(
        `SELECT 1 FROM caregiver_profiles WHERE caregiver_id::text = $1 LIMIT 1`,
        [idStr]
      );
      cachedLinkCol = "caregiver_id";
      cachedAt = Date.now();
      return rows?.length > 0;
    }
  } catch {
    return false;
  }
}

/* ============================================================
   ✅ POST /caregivers/me (idempotente)
   - cria caregiver_profile se não existe
   - salva services (OBJETO) + daily_capacity
   ============================================================ */
router.post("/me", authMiddleware, async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: "Não autenticado." });
  }

  try {
    await detectUsersColumnsOnce();

    const linkCol = (await detectLinkColumn()) || "user_id";

    const body = req.body || {};
    const serviceKeys = normalizeServicesToKeys(body.services);
    const dailyCapNorm = normalizeDailyCapacity(body.daily_capacity);

    if (body.services !== undefined) {
      if (!serviceKeys || serviceKeys.length === 0) {
        return res.status(400).json({
          error: "Selecione pelo menos 1 serviço.",
          code: "INVALID_SERVICES",
        });
      }
    }

    if (body.daily_capacity !== undefined) {
      if (dailyCapNorm == null) {
        return res.status(400).json({
          error: "Quantidade de reservas por dia inválida (mínimo 1).",
          code: "INVALID_DAILY_CAPACITY",
        });
      }
    }

    const already = await hasCaregiverProfile(userId);
    if (!already) {
      if (linkCol === "caregiver_id") {
        await pool.query(`INSERT INTO caregiver_profiles (caregiver_id) VALUES ($1)`, [userId]);
      } else {
        await pool.query(`INSERT INTO caregiver_profiles (user_id) VALUES ($1)`, [userId]);
      }
    }

    const updates = [];
    const values = [];
    let idx = 1;

    if (serviceKeys != null) {
      const servicesObj = buildServicesObjectFromKeys(serviceKeys);
      updates.push(`services = $${idx++}::jsonb`);
      values.push(JSON.stringify(servicesObj));
    }

    if (_hasDailyCapacityCol && dailyCapNorm != null) {
      updates.push(`daily_capacity = $${idx++}::int`);
      values.push(dailyCapNorm);
    }

    if (updates.length) {
      values.push(Number(userId));
      await pool.query(
        `
        UPDATE users
        SET ${updates.join(", ")}
        WHERE id = $${idx}::int
        `,
        values
      );
    }

    const { rows } = await pool.query(
      `
      SELECT
        u.services,
        ${usersDailyCapacitySelectExpr()}
      FROM users u
      WHERE u.id::text = $1::text
      LIMIT 1
      `,
      [String(userId)]
    );

    const extra = rows?.[0] || {};
    const services = extra.services ?? null;
    const daily_capacity =
      extra.daily_capacity != null ? Number(extra.daily_capacity) : DEFAULT_DAILY_CAPACITY;

    return res.status(already ? 200 : 201).json({
      ok: true,
      created: !already,
      hasCaregiverProfile: true,
      services,
      daily_capacity,
    });
  } catch (err) {
    console.error("Erro em POST /caregivers/me:", err?.message || err);

    const msg = String(err?.message || "").toLowerCase();
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return res.status(200).json({
        ok: true,
        created: false,
        hasCaregiverProfile: true,
      });
    }

    return res.status(500).json({ error: "Erro ao criar perfil de cuidador." });
  }
});

/* ============================================================
   ✅ GET /caregivers
   ✅ FIX PRINCIPAL:
   - NÃO depende mais de caregiver_profiles para quem já é role='caregiver'
   - ainda suporta multi-perfil (cp existe mesmo se role != caregiver)
   - filtro (FIX): só retorna cuidadores com pelo menos 1 serviço ativo E preço válido
   ============================================================ */
router.get("/", async (req, res) => {
  try {
    await detectUsersColumnsOnce();

    const linkCol = (await detectLinkColumn()) || "user_id";
    const joinExpr = linkCol === "caregiver_id" ? "cp.caregiver_id = u.id" : "cp.user_id = u.id";

    const query = `
      SELECT
        ${baseFieldsSql()},
        cp.created_at AS caregiver_profile_created_at,
        COALESCE(rs.rating_avg, 0)   AS rating_avg,
        COALESCE(rs.rating_count, 0) AS rating_count,
        COALESCE(done.completed_reservations, 0) AS completed_reservations
      FROM users u
      LEFT JOIN caregiver_profiles cp
        ON ${joinExpr}
      ${RATING_LATERAL}
      ${COMPLETED_LATERAL}
      WHERE (u.blocked IS NOT TRUE)
        AND (
          lower(coalesce(u.role,'')) = 'caregiver'
          OR cp.created_at IS NOT NULL
        )
      ORDER BY u.id DESC;
    `;

    const { rows } = await pool.query(query);

    // ✅ FIX: precisa ter serviço ativo + preço válido
    const filtered = (rows || []).filter((c) =>
      hasAtLeastOneEnabledServiceWithValidPrice(c.services, c.prices)
    );

    return res.json({ caregivers: filtered });
  } catch (err) {
    console.error("Erro ao buscar cuidadores:", err);
    return res.status(500).json({ error: "Erro ao buscar cuidadores." });
  }
});

/* ============================================================
   ✅ GET /caregivers/:id
   ✅ mesma regra do list:
   - aceita role caregiver OU cp existe
   - se não tiver serviço ativo + preço válido, responde 404
   ============================================================ */
router.get("/:id", async (req, res) => {
  try {
    await detectUsersColumnsOnce();

    const caregiverId = Number(req.params.id);
    if (!Number.isFinite(caregiverId)) {
      return res.status(400).json({ error: "ID inválido." });
    }

    const linkCol = (await detectLinkColumn()) || "user_id";
    const joinExpr = linkCol === "caregiver_id" ? "cp.caregiver_id = u.id" : "cp.user_id = u.id";

    const query = `
      SELECT
        ${baseFieldsSql()},
        cp.created_at AS caregiver_profile_created_at,
        COALESCE(rs.rating_avg, 0)   AS rating_avg,
        COALESCE(rs.rating_count, 0) AS rating_count,
        COALESCE(done.completed_reservations, 0) AS completed_reservations
      FROM users u
      LEFT JOIN caregiver_profiles cp
        ON ${joinExpr}
      ${RATING_LATERAL}
      ${COMPLETED_LATERAL}
      WHERE (u.blocked IS NOT TRUE)
        AND u.id = $1
        AND (
          lower(coalesce(u.role,'')) = 'caregiver'
          OR cp.created_at IS NOT NULL
        )
      LIMIT 1;
    `;

    const { rows } = await pool.query(query, [caregiverId]);

    if (!rows.length) {
      return res.status(404).json({ error: "Cuidador não encontrado." });
    }

    const caregiver = rows[0];

    // ✅ FIX: precisa ter serviço ativo + preço válido
    if (!hasAtLeastOneEnabledServiceWithValidPrice(caregiver.services, caregiver.prices)) {
      return res.status(404).json({ error: "Cuidador não encontrado." });
    }

    return res.json({ caregiver });
  } catch (err) {
    console.error("Erro ao buscar cuidador:", err);
    return res.status(500).json({ error: "Erro ao buscar cuidador." });
  }
});

module.exports = router;
