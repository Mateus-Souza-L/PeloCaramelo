// backend/src/routes/caregiverRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");

const { createClient } = require("@supabase/supabase-js");

/**
 * ✅ Objetivo (performance + segurança)
 * - LIST (/caregivers): devolver imagem LEVE e rápida -> signed url (curta) baseada em caregivers.photo_url (path)
 * - DETAIL (/caregivers/:id): também devolve signed url (curta) se houver path; senão cai no users.image (legado)
 *
 * IMPORTANTÍSSIMO:
 * - caregivers.photo_url deve ser um PATH do storage (ex: "profiles/52.jpg"), NÃO base64.
 */

const DEFAULT_DAILY_CAPACITY = Number(process.env.DEFAULT_DAILY_CAPACITY || 15);

// Supabase Storage (signed url)
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "pet-photos";
const SIGNED_URL_TTL_SECONDS = Number(process.env.SIGNED_URL_TTL_SECONDS || 600); // 10 min

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

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

const SERVICE_OPTIONS = [
  { key: "hospedagem", label: "Hospedagem" },
  { key: "creche", label: "Creche" },
  { key: "passeios", label: "Passeios" },
  { key: "petSitter", label: "Visita / Pet Sitter" },
  { key: "banho", label: "Banho & Tosa" },
];

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
   - precisa ter pelo menos 1 serviço true E preço válido (>0)
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
  const s = String(raw).trim();
  if (!s) return null;

  const cleaned = s.replace(/[^\d,.\-]/g, "").replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  return n;
}

function hasAtLeastOneEnabledServiceWithValidPrice(servicesRaw, pricesRaw) {
  const services = safeParseJson(servicesRaw, {});
  const prices = safeParseJson(pricesRaw, {});

  if (!services || typeof services !== "object") return false;

  for (const [serviceKey, enabled] of Object.entries(services)) {
    if (!enabled) continue;
    const price = normalizePriceValue(prices?.[serviceKey]);
    if (price != null) return true;
  }
  return false;
}

/* ============================================================
   ✅ Storage: signed URL (rápido e seguro)
   - Espera path tipo "profiles/52.jpg" em cg.photo_url
   - Se for base64/data:... -> IGNORA (pra não pesar)
   ============================================================ */

function looksLikeDataUrl(v) {
  const s = String(v || "");
  return s.startsWith("data:image/") || s.includes(";base64,");
}

function sanitizeStoragePath(v) {
  const s = String(v || "").trim();
  if (!s) return null;
  if (looksLikeDataUrl(s)) return null; // NÃO usar base64
  // evita path estranho
  if (s.startsWith("http://") || s.startsWith("https://")) return null;
  return s;
}

const signedUrlCache = new Map(); // key -> { url, expiresAt }

async function getSignedUrl(path) {
  if (!supabase) return null;
  const clean = sanitizeStoragePath(path);
  if (!clean) return null;

  const key = `${SUPABASE_STORAGE_BUCKET}:${clean}:${SIGNED_URL_TTL_SECONDS}`;
  const now = Date.now();

  const cached = signedUrlCache.get(key);
  if (cached && cached.expiresAt > now + 15_000) {
    return cached.url;
  }

  const { data, error } = await supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .createSignedUrl(clean, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) return null;

  signedUrlCache.set(key, {
    url: data.signedUrl,
    expiresAt: now + SIGNED_URL_TTL_SECONDS * 1000,
  });

  return data.signedUrl;
}

async function attachSignedImageToCaregivers(rows) {
  // altera "image" in-place (retorna string ou null)
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  // performance: gera no máximo N signed urls por request
  const MAX_SIGN = 80;
  const slice = rows.slice(0, MAX_SIGN);

  await Promise.all(
    slice.map(async (c) => {
      // prioridade: cg.photo_url (path)
      const signed = await getSignedUrl(c?.photo_path || c?.photo_url || c?.image);
      if (signed) c.image = signed;
      else {
        // fallback: se vier base64 no users.image, NÃO manda na listagem (pesado)
        // detalhe pode mandar base64 se quiser, mas aqui (LIST) deixa null
        if (c && c._listMode) c.image = null;
      }
      return c;
    })
  );

  // pra quem ficou fora do slice, força null pra não atrasar
  for (let i = MAX_SIGN; i < rows.length; i++) {
    if (rows[i]?._listMode) rows[i].image = null;
  }

  return rows;
}

/* ============================================================
   ✅ SQL fields: LIST vs DETAIL (agora leve!)
   ============================================================ */

function listFieldsSql() {
  return `
    u.id,
    u.name,
    u.role,

    -- LIST: pegamos o PATH da foto (caregivers.photo_url) e geramos signed URL no Node
    NULLIF(cg.photo_url, '') AS photo_path,

    u.neighborhood,
    u.city,
    u.services,
    u.prices,
    ${usersDailyCapacitySelectExpr()}
  `;
}

function detailFieldsSql() {
  return `
    u.id,
    u.name,
    u.email,
    u.role,

    NULLIF(cg.photo_url, '') AS photo_path,
    u.image AS legacy_image, -- pode ser base64 legado

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

/* ============================================================
   ✅ Rating + Completed (mantido)
   ============================================================ */

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
   ✅ Schema-tolerant: caregiver_profiles pode ter user_id
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
   ✅ GET /caregivers  (LISTAGEM LEVE + signed urls)
   ============================================================ */
router.get("/", async (req, res) => {
  try {
    await detectUsersColumnsOnce();

    const linkCol = (await detectLinkColumn()) || "user_id";
    const joinExpr = linkCol === "caregiver_id" ? "cp.caregiver_id = u.id" : "cp.user_id = u.id";

    const query = `
      SELECT
        ${listFieldsSql()},
        cp.created_at AS caregiver_profile_created_at,
        COALESCE(rs.rating_avg, 0)   AS rating_avg,
        COALESCE(rs.rating_count, 0) AS rating_count,
        COALESCE(done.completed_reservations, 0) AS completed_reservations
      FROM users u
      LEFT JOIN caregivers cg
        ON cg.user_id = u.id
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

    const filtered = (rows || []).filter((c) =>
      hasAtLeastOneEnabledServiceWithValidPrice(c.services, c.prices)
    );

    // marca listMode e monta campo image (signed url) a partir do photo_path
    for (const c of filtered) {
      c._listMode = true;
      c.image = null;
      c.photo_url = undefined;
    }

    await attachSignedImageToCaregivers(filtered);

    // remove campos internos
    const out = filtered.map((c) => {
      const { _listMode, photo_path, legacy_image, ...rest } = c;
      // para compat com front: devolve "image"
      return { ...rest, image: c.image ?? null };
    });

    return res.json({ caregivers: out });
  } catch (err) {
    console.error("Erro ao buscar cuidadores:", err);
    return res.status(500).json({ error: "Erro ao buscar cuidadores." });
  }
});

/* ============================================================
   ✅ GET /caregivers/:id  (DETALHE + signed url + fallback legado)
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
        ${detailFieldsSql()},
        cp.created_at AS caregiver_profile_created_at,
        COALESCE(rs.rating_avg, 0)   AS rating_avg,
        COALESCE(rs.rating_count, 0) AS rating_count,
        COALESCE(done.completed_reservations, 0) AS completed_reservations
      FROM users u
      LEFT JOIN caregivers cg
        ON cg.user_id = u.id
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

    if (!hasAtLeastOneEnabledServiceWithValidPrice(caregiver.services, caregiver.prices)) {
      return res.status(404).json({ error: "Cuidador não encontrado." });
    }

    // Monta image:
    // 1) signed url do photo_path (caregivers.photo_url)
    // 2) fallback: legacy_image (pode ser base64)
    let image = null;
    if (caregiver.photo_path) image = await getSignedUrl(caregiver.photo_path);
    if (!image && caregiver.legacy_image && !looksLikeDataUrl(caregiver.legacy_image)) {
      // se for alguma URL antiga armazenada no users.image
      image = caregiver.legacy_image;
    }
    if (!image && caregiver.legacy_image && looksLikeDataUrl(caregiver.legacy_image)) {
      // detalhe pode aceitar base64 legado (se você quiser)
      image = caregiver.legacy_image;
    }

    const { photo_path, legacy_image, ...rest } = caregiver;
    return res.json({ caregiver: { ...rest, image } });
  } catch (err) {
    console.error("Erro ao buscar cuidador:", err);
    return res.status(500).json({ error: "Erro ao buscar cuidador." });
  }
});

module.exports = router;
