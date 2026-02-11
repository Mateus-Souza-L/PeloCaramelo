// backend/src/routes/caregiverRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");

// ✅ Supabase Storage (para migrar base64 -> URL)
let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;

  const { createClient } = require("@supabase/supabase-js");

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // ⚠️ backend only
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados.");
  }

  _supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return _supabase;
}

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "pet-photos";
const DEFAULT_DAILY_CAPACITY = Number(process.env.DEFAULT_DAILY_CAPACITY || 15);

// ✅ limite de upload (evita estourar memória/requests)
const MAX_PROFILE_PHOTO_BYTES = Number(process.env.MAX_PROFILE_PHOTO_BYTES || 6 * 1024 * 1024); // 6MB

/**
 * ✅ Regras de rating (fonte única + fallback legado)
 * - Fonte principal: tabela reviews (reviews.reviewed_id = caregiver_id)
 * - Fallback legado: reservations.tutor_rating (somente se ainda NÃO existe review na tabela reviews
 *   para a mesma reserva + mesmo autor)
 */

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
  { key: "passeios", label: "Passeios" }, // ✅ IMPORTANTE: alinhar com o front
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

  // aceita número, "55", "55.00", "55,00", "R$ 55,00"
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
   ✅ SQL fields: LIST vs DETAIL
   - LIST: leve (NÃO retorna base64)
   - DETAIL: pode manter fallback legado (1 registro apenas)
   ============================================================ */

function listFieldsSql() {
  return `
    u.id,
    u.name,
    u.role,

    -- ✅ LISTA ULTRA LEVE: SOMENTE URL (sem base64)
    NULLIF(cg.photo_url, '') AS image,

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

    -- ✅ DETALHE: URL primeiro, depois base64 legado (ok, é 1 cuidador)
    COALESCE(NULLIF(cg.photo_url, ''), NULLIF(u.image, '')) AS image,

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
   ✅ Admin check robusto (não depende do JWT ter role/admin_level)
   - aceita role: admin / admin_master
   - OU admin_level >= 1
   ============================================================ */
async function ensureAdminFromDb(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return false;

  try {
    const { rows } = await pool.query(`SELECT role, admin_level FROM users WHERE id = $1 LIMIT 1`, [
      id,
    ]);
    const r = rows?.[0];
    const role = String(r?.role || "").toLowerCase();
    const lvl = Number(r?.admin_level || 0);
    return role === "admin" || role === "admin_master" || lvl >= 1;
  } catch {
    return false;
  }
}

/* ============================================================
   ✅ Helpers Supabase: base64(dataURL) -> upload -> public URL
   ============================================================ */

function parseDataUrl(dataUrl) {
  const s = String(dataUrl || "");
  if (!s.startsWith("data:")) return null;

  const comma = s.indexOf(",");
  if (comma < 0) return null;

  const meta = s.slice(5, comma); // "image/jpeg;base64"
  const b64 = s.slice(comma + 1);

  const [mimeRaw, ...rest] = meta.split(";");
  const mime = String(mimeRaw || "").trim().toLowerCase();
  const isBase64 = rest.some((x) => String(x).trim().toLowerCase() === "base64");
  if (!mime || !isBase64) return null;

  return { mime, base64: b64 };
}

function extFromMime(mime) {
  if (!mime) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

async function uploadProfilePhotoFromDataUrl({ userId, dataUrl }) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return { ok: false, reason: "NOT_DATA_URL" };

  const { mime, base64 } = parsed;

  let buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    return { ok: false, reason: "INVALID_BASE64" };
  }

  if (!buffer || buffer.length < 10) return { ok: false, reason: "EMPTY" };
  if (buffer.length > MAX_PROFILE_PHOTO_BYTES) {
    return { ok: false, reason: "TOO_LARGE", details: `max=${MAX_PROFILE_PHOTO_BYTES}` };
  }

  const supabase = getSupabase();
  const ext = extFromMime(mime);
  const path = `profiles/${userId}/avatar.${ext}`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    upsert: true,
    contentType: mime,
    cacheControl: "31536000",
  });

  if (upErr) {
    return { ok: false, reason: "UPLOAD_FAILED", details: upErr.message };
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = data?.publicUrl || null;
  if (!publicUrl) return { ok: false, reason: "NO_PUBLIC_URL" };

  return { ok: true, publicUrl, path, mime, bytes: buffer.length };
}

async function upsertCaregiversPhotoUrl(userId, photoUrl) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) {
    const e = new Error("INVALID_USER_ID");
    e.status = 400;
    throw e;
  }

  await pool.query(
    `
    INSERT INTO caregivers (user_id)
    VALUES ($1)
    ON CONFLICT (user_id) DO NOTHING
    `,
    [uid]
  );

  await pool.query(
    `
    UPDATE caregivers
    SET photo_url = $1
    WHERE user_id = $2
    `,
    [String(photoUrl || ""), uid]
  );
}

/* ============================================================
   ✅ PATCH /caregivers/me/photo (AUTOMÁTICO no fluxo)
   ============================================================ */
router.patch("/me/photo", authMiddleware, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Não autenticado." });

  try {
    const dataUrl = req.body?.dataUrl ?? req.body?.image ?? req.body?.photo ?? null;
    if (!dataUrl || typeof dataUrl !== "string") {
      return res.status(400).json({
        error: "Envie a foto em base64 no campo 'image' (dataURL).",
        code: "MISSING_IMAGE_DATAURL",
      });
    }

    const up = await uploadProfilePhotoFromDataUrl({ userId: Number(userId), dataUrl });
    if (!up.ok) {
      return res.status(400).json({
        error: "Foto inválida ou não suportada.",
        code: up.reason,
        details: up.details,
      });
    }

    await upsertCaregiversPhotoUrl(userId, up.publicUrl);

    return res.json({
      ok: true,
      photo_url: up.publicUrl,
      bytes: up.bytes,
    });
  } catch (err) {
    console.error("Erro em PATCH /caregivers/me/photo:", err?.message || err);
    return res.status(500).json({ error: "Erro ao salvar foto." });
  }
});

/* ============================================================
   ✅ POST /caregivers/me (idempotente)
   ============================================================ */
router.post("/me", authMiddleware, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Não autenticado." });

  try {
    await detectUsersColumnsOnce();

    const linkCol = (await detectLinkColumn()) || "user_id";

    const body = req.body || {};
    const serviceKeys = normalizeServicesToKeys(body.services);
    const dailyCapNorm = normalizeDailyCapacity(body.daily_capacity);

    if (body.services !== undefined) {
      if (!serviceKeys || serviceKeys.length === 0) {
        return res
          .status(400)
          .json({ error: "Selecione pelo menos 1 serviço.", code: "INVALID_SERVICES" });
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

    // ✅ se veio foto base64, já sobe e salva URL (não quebra se falhar)
    let photo_url = null;
    const maybeDataUrl = body?.dataUrl ?? body?.image ?? null;
    if (typeof maybeDataUrl === "string" && maybeDataUrl.startsWith("data:")) {
      const up = await uploadProfilePhotoFromDataUrl({ userId: Number(userId), dataUrl: maybeDataUrl });
      if (up.ok) {
        await upsertCaregiversPhotoUrl(userId, up.publicUrl);
        photo_url = up.publicUrl;
      }
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
      photo_url,
    });
  } catch (err) {
    console.error("Erro em POST /caregivers/me:", err?.message || err);

    const msg = String(err?.message || "").toLowerCase();
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return res.status(200).json({ ok: true, created: false, hasCaregiverProfile: true });
    }

    return res.status(500).json({ error: "Erro ao criar perfil de cuidador." });
  }
});

/* ============================================================
   ✅ POST /caregivers/migrate-photos (ADMIN)
   - Migra base64 que estiver em:
   - caregivers.photo_url (prioridade)
   - OU users.image (fallback)
   ============================================================ */
router.post("/migrate-photos", authMiddleware, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Não autenticado." });

  const isAdmin = await ensureAdminFromDb(userId);
  if (!isAdmin) return res.status(403).json({ error: "Apenas admin." });

  const limit = Math.max(1, Math.min(500, Number(req.query.limit || 50)));
  const dryRun = String(req.query.dry || "") === "1";

  try {
    // ✅ pega candidatos onde existe base64 em c.photo_url OU u.image
    const { rows } = await pool.query(
      `
      SELECT
        u.id AS user_id,
        u.image AS users_image,
        c.photo_url AS caregivers_photo_url
      FROM users u
      LEFT JOIN caregivers c ON c.user_id = u.id
      WHERE
        (
          (c.photo_url IS NOT NULL AND c.photo_url LIKE 'data:%;base64,%')
          OR
          (u.image IS NOT NULL AND u.image LIKE 'data:%;base64,%')
        )
      ORDER BY u.id ASC
      LIMIT $1
      `,
      [limit]
    );

    if (!rows?.length) {
      return res.json({
        ok: true,
        dryRun,
        checked: 0,
        migrated: 0,
        skipped: 0,
        message: "Nada para migrar (sem base64 pendente).",
      });
    }

    const report = { ok: true, dryRun, checked: rows.length, migrated: 0, skipped: 0, items: [] };

    for (const r of rows) {
      const uid = Number(r.user_id);

      // ✅ prioridade: caregivers.photo_url (se for base64), senão users.image
      const cBase64 =
        typeof r.caregivers_photo_url === "string" && r.caregivers_photo_url.startsWith("data:")
          ? r.caregivers_photo_url
          : null;

      const uBase64 =
        typeof r.users_image === "string" && r.users_image.startsWith("data:")
          ? r.users_image
          : null;

      const dataUrl = cBase64 || uBase64;

      if (!dataUrl) {
        report.skipped += 1;
        report.items.push({ user_id: uid, ok: false, reason: "NO_BASE64_SOURCE" });
        continue;
      }

      const up = await uploadProfilePhotoFromDataUrl({ userId: uid, dataUrl });

      if (!up.ok) {
        report.skipped += 1;
        report.items.push({ user_id: uid, ok: false, reason: up.reason, details: up.details });
        continue;
      }

      if (!dryRun) {
        // grava URL em caregivers.photo_url (fonte oficial p/ listagem)
        await upsertCaregiversPhotoUrl(uid, up.publicUrl);

        // opcional e útil: também troca users.image para URL (pra não sobrar base64 em users)
        await pool.query(`UPDATE users SET image = $1 WHERE id = $2`, [up.publicUrl, uid]);
      }

      report.migrated += 1;
      report.items.push({ user_id: uid, ok: true, photo_url: up.publicUrl, bytes: up.bytes });
    }

    return res.json(report);
  } catch (err) {
    console.error("Erro em POST /caregivers/migrate-photos:", err?.message || err);
    return res.status(500).json({ error: "Erro ao migrar fotos." });
  }
});

/* ============================================================
   ✅ GET /caregivers  (LISTAGEM ULTRA LEVE)
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

    return res.json({ caregivers: filtered });
  } catch (err) {
    console.error("Erro ao buscar cuidadores:", err);
    return res.status(500).json({ error: "Erro ao buscar cuidadores." });
  }
});

/* ============================================================
   ✅ GET /caregivers/:id  (DETALHE COMPLETO)
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

    return res.json({ caregiver });
  } catch (err) {
    console.error("Erro ao buscar cuidador:", err);
    return res.status(500).json({ error: "Erro ao buscar cuidador." });
  }
});

module.exports = router;
