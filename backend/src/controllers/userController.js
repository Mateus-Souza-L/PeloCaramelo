// backend/src/controllers/userController.js
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

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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
    const updates = {};

    // campos básicos
    const basicFields = [
      "city",
      "neighborhood",
      "phone",
      "address",
      "bio",
      "image",
      "cep",
    ];

    basicFields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(body, field)) return;

      const value = body[field];
      if (typeof value === "string") {
        updates[field] = value.trim() === "" ? null : value.trim();
      } else {
        updates[field] = value ?? null;
      }
    });

    // campos exclusivos do cuidador
    if (req.user?.role === "caregiver") {
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
          ? body.courses.filter(
              (c) => typeof c === "string" && c.trim() !== ""
            )
          : [];
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
function ensureCaregiver(req, res) {
  if (req.user?.role !== "caregiver") {
    res.status(403).json({ error: "Apenas cuidadores." });
    return false;
  }
  return true;
}

async function getMyDailyCapacityController(req, res) {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;
    if (!ensureCaregiver(req, res)) return;

    const daily_capacity = await getDailyCapacityByUserId(userId);
    return res.json({ daily_capacity });
  } catch (err) {
    console.error("Erro em GET /users/me/capacity:", err);
    return res.status(500).json({ error: "Erro ao buscar capacidade." });
  }
}

async function updateMyDailyCapacityController(req, res) {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;
    if (!ensureCaregiver(req, res)) return;

    const cap = toNum(req.body?.daily_capacity);

    if (cap == null || !Number.isInteger(cap) || cap < 1 || cap > 100) {
      return res.status(400).json({
        error: "daily_capacity inválido (1–100).",
      });
    }

    const updated = await updateDailyCapacityByUserId(userId, cap);
    return res.json({ ok: true, daily_capacity: updated.daily_capacity });
  } catch (err) {
    console.error("Erro em PUT /users/me/capacity:", err);
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
