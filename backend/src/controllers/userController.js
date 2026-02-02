// backend/src/controllers/userController.js
const pool = require("../config/db");

const {
  findUserById,
  updateUserProfile,
  listAllUsers,
  setUserBlockedStatus,
  getUserAvailability,
  updateUserAvailability,

  // capacidade do cuidador
  getDailyCapacityByUserId,
  updateDailyCapacityByUserId,
} = require("../models/userModel");

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function getAuthenticatedUserId(req, res) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Não autenticado." });
    return null;
  }
  return userId;
}

function ensureParsedJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

function toInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function clampInt(n, min, max) {
  if (!Number.isFinite(n)) return null;
  const x = Math.trunc(n);
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

// -----------------------------------------------------------------------------
// ✅ Multi-perfil: detectar se usuário TEM perfil cuidador (caregiver_profiles)
// - suporta schema antigo/novo: caregiver_profiles.user_id OU caregiver_profiles.caregiver_id
// -----------------------------------------------------------------------------

let _cpLinkCol = null; // "user_id" | "caregiver_id" | null
let _cpCheckedAt = 0;

async function detectCaregiverProfilesLinkColumn() {
  const now = Date.now();
  if (_cpCheckedAt && now - _cpCheckedAt < 5 * 60 * 1000) return _cpLinkCol;

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
    if (cols.has("user_id")) _cpLinkCol = "user_id";
    else if (cols.has("caregiver_id")) _cpLinkCol = "caregiver_id";
    else _cpLinkCol = null;

    _cpCheckedAt = now;
    return _cpLinkCol;
  } catch {
    _cpLinkCol = null;
    _cpCheckedAt = now;
    return null;
  }
}

async function hasCaregiverProfileByUserId(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return false;

  const linkCol = (await detectCaregiverProfilesLinkColumn()) || "user_id";

  try {
    if (linkCol === "caregiver_id") {
      const { rows } = await pool.query(
        `SELECT 1 FROM caregiver_profiles WHERE caregiver_id::text = $1 LIMIT 1`,
        [String(id)]
      );
      return rows?.length > 0;
    }

    // default user_id
    const { rows } = await pool.query(
      `SELECT 1 FROM caregiver_profiles WHERE user_id::text = $1 LIMIT 1`,
      [String(id)]
    );
    return rows?.length > 0;
  } catch (e) {
    // fallback tentativa/erro (não quebra)
    try {
      const { rows } = await pool.query(
        `SELECT 1 FROM caregiver_profiles WHERE user_id::text = $1 LIMIT 1`,
        [String(id)]
      );
      _cpLinkCol = "user_id";
      _cpCheckedAt = Date.now();
      return rows?.length > 0;
    } catch {
      try {
        const { rows } = await pool.query(
          `SELECT 1 FROM caregiver_profiles WHERE caregiver_id::text = $1 LIMIT 1`,
          [String(id)]
        );
        _cpLinkCol = "caregiver_id";
        _cpCheckedAt = Date.now();
        return rows?.length > 0;
      } catch {
        return false;
      }
    }
  }
}

async function isEffectiveCaregiver(req) {
  // role caregiver (legado) OU possui caregiver_profiles (multi-perfil real)
  const role = String(req.user?.role || "").toLowerCase().trim();
  if (role === "caregiver") return true;

  const userId = req.user?.id;
  if (!userId) return false;

  return await hasCaregiverProfileByUserId(userId);
}

// -----------------------------------------------------------------------------
// GET /users/me
// -----------------------------------------------------------------------------
async function getMeController(req, res) {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const user = await findUserById(userId);
    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    const { password_hash, password, services, prices, courses, ...rest } = user;

    return res.json({
      user: {
        ...rest,
        services: ensureParsedJson(services, {}),
        prices: ensureParsedJson(prices, {}),
        courses: ensureParsedJson(courses, []),
      },
    });
  } catch (err) {
    console.error("Erro em GET /users/me:", err);
    return res.status(500).json({ error: "Erro ao buscar usuário." });
  }
}

// -----------------------------------------------------------------------------
// PATCH /users/me
// -----------------------------------------------------------------------------
async function updateMeController(req, res) {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const body = req.body || {};

    // ✅ trava e-mail sempre
    if (body.email != null) delete body.email;

    // ✅ nome: só admin_master pode mudar
    const role = String(req.user?.role || "").toLowerCase().trim();
    if (body.name != null && role !== "admin_master") {
      return res.status(403).json({ error: "Apenas o admin master pode alterar o nome." });
    }

    const updates = {};

    // campos básicos
    const basicFields = ["city", "neighborhood", "phone", "address", "bio", "image", "cep"];

    basicFields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(body, field)) return;

      const value = body[field];
      if (typeof value === "string") {
        updates[field] = value.trim() === "" ? null : value.trim();
      } else {
        updates[field] = value ?? null;
      }
    });

    // ✅ multi-perfil: campos do cuidador devem salvar se for cuidador efetivo
    const effectiveCaregiver = await isEffectiveCaregiver(req);

    if (effectiveCaregiver) {
      if (Object.prototype.hasOwnProperty.call(body, "services")) {
        updates.services =
          body.services && typeof body.services === "object" && !Array.isArray(body.services)
            ? body.services
            : {};
      }

      if (Object.prototype.hasOwnProperty.call(body, "prices")) {
        updates.prices =
          body.prices && typeof body.prices === "object" && !Array.isArray(body.prices)
            ? body.prices
            : {};
      }

      if (Object.prototype.hasOwnProperty.call(body, "courses")) {
        updates.courses = Array.isArray(body.courses)
          ? body.courses.filter((c) => typeof c === "string" && c.trim() !== "")
          : [];
      }

      // ✅ opcional: permitir salvar daily_capacity aqui também (além de /me/capacity)
      if (
        Object.prototype.hasOwnProperty.call(body, "daily_capacity") ||
        Object.prototype.hasOwnProperty.call(body, "dailyCapacity")
      ) {
        const raw = body.daily_capacity ?? body.dailyCapacity ?? null;
        const parsed = toInt(raw);
        // não quebra se vier inválido: simplesmente ignora
        if (parsed != null) {
          // aqui mantenho coerente com 1..50 (igual ao endpoint capacity)
          const cap = clampInt(parsed, 1, 50);
          updates.daily_capacity = cap;
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: "Nenhum campo válido para atualização.",
      });
    }

    const updated = await updateUserProfile(userId, updates);
    if (!updated) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    const { password_hash, password, services, prices, courses, ...rest } = updated;

    return res.json({
      user: {
        ...rest,
        services: ensureParsedJson(services, {}),
        prices: ensureParsedJson(prices, {}),
        courses: ensureParsedJson(courses, []),
      },
    });
  } catch (err) {
    console.error("Erro em PATCH /users/me:", err);
    return res.status(500).json({ error: "Erro ao atualizar perfil." });
  }
}

// -----------------------------------------------------------------------------
// Disponibilidade
// -----------------------------------------------------------------------------
async function getMyAvailabilityController(req, res) {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const dates = await getUserAvailability(userId);
    return res.json({
      availableDates: Array.isArray(dates) ? dates : [],
    });
  } catch (err) {
    console.error("Erro em GET /users/me/availability:", err);
    return res.status(500).json({ error: "Erro ao buscar disponibilidade." });
  }
}

async function updateMyAvailabilityController(req, res) {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const { availableDates } = req.body;

    if (!Array.isArray(availableDates)) {
      return res.status(400).json({
        error: "availableDates deve ser um array.",
      });
    }

    const cleaned = availableDates
      .filter((d) => typeof d === "string")
      .map((d) => d.trim())
      .filter(Boolean);

    const updated = await updateUserAvailability(userId, cleaned);
    if (!updated) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    return res.json({ availableDates: cleaned });
  } catch (err) {
    console.error("Erro em PATCH /users/me/availability:", err);
    return res.status(500).json({ error: "Erro ao atualizar disponibilidade." });
  }
}

// -----------------------------------------------------------------------------
// Capacidade diária do cuidador
// -----------------------------------------------------------------------------
// ✅ Aceita payload tanto em daily_capacity quanto em dailyCapacity
// ✅ Agora clamp 1..50 (como você pediu)
const CAPACITY_MIN = 1;
const CAPACITY_MAX = 50;

async function ensureCaregiver(req, res) {
  const ok = await isEffectiveCaregiver(req);
  if (!ok) {
    res.status(403).json({ error: "Apenas cuidadores." });
    return false;
  }
  return true;
}

// GET /users/me/capacity
async function getMyDailyCapacityController(req, res) {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;
    if (!(await ensureCaregiver(req, res))) return;

    const daily_capacity = await getDailyCapacityByUserId(userId);

    return res.json({ daily_capacity, min: CAPACITY_MIN, max: CAPACITY_MAX });
  } catch (err) {
    console.error("Erro em GET /users/me/capacity:", err);
    return res.status(500).json({ error: "Erro ao buscar capacidade." });
  }
}

// PUT/PATCH /users/me/capacity
async function updateMyDailyCapacityController(req, res) {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;
    if (!(await ensureCaregiver(req, res))) return;

    const raw = req.body?.daily_capacity ?? req.body?.dailyCapacity ?? req.body?.capacity ?? null;

    const parsed = toInt(raw);
    if (parsed == null) {
      return res.status(400).json({
        error: `daily_capacity inválido (envie um número inteiro ${CAPACITY_MIN}–${CAPACITY_MAX}).`,
      });
    }

    const cap = clampInt(parsed, CAPACITY_MIN, CAPACITY_MAX);
    const updated = await updateDailyCapacityByUserId(userId, cap);

    return res.json({
      ok: true,
      daily_capacity: Number(updated?.daily_capacity ?? cap),
      min: CAPACITY_MIN,
      max: CAPACITY_MAX,
    });
  } catch (err) {
    console.error("Erro em PUT/PATCH /users/me/capacity:", err);
    return res.status(500).json({ error: "Erro ao salvar capacidade." });
  }
}

// -----------------------------------------------------------------------------
// Admin
// -----------------------------------------------------------------------------
function ensureAdmin(req, res) {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Acesso restrito ao admin." });
    return false;
  }
  return true;
}

async function adminListUsersController(req, res) {
  try {
    if (!ensureAdmin(req, res)) return;
    const users = await listAllUsers();
    return res.json({ users });
  } catch (err) {
    console.error("Erro em GET /users/admin/users:", err);
    return res.status(500).json({ error: "Erro ao listar usuários." });
  }
}

async function adminBlockUserController(req, res) {
  try {
    if (!ensureAdmin(req, res)) return;

    const { id } = req.params;
    const { blocked } = req.body;

    if (typeof blocked !== "boolean") {
      return res.status(400).json({ error: "blocked deve ser boolean." });
    }

    const updated = await setUserBlockedStatus(id, blocked);
    if (!updated) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    return res.json({ user: updated });
  } catch (err) {
    console.error("Erro em PATCH /users/admin/users/:id/block:", err);
    return res.status(500).json({ error: "Erro ao atualizar usuário." });
  }
}

module.exports = {
  getMeController,
  updateMeController,
  getMyAvailabilityController,
  updateMyAvailabilityController,
  getMyDailyCapacityController,
  updateMyDailyCapacityController,
  adminListUsersController,
  adminBlockUserController,
};
