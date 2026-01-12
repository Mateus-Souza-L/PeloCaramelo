// backend/src/controllers/userController.js
const {
  findUserById,
  updateUserProfile,
  listAllUsers,
  setUserBlockedStatus,
  getUserAvailability,
  updateUserAvailability,

  // ✅ NOVO (capacidade do cuidador)
  getDailyCapacityByUserId,
  updateDailyCapacityByUserId,
} = require("../models/userModel");

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

// pega id do usuário autenticado
function getAuthenticatedUserId(req, res) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Não autenticado." });
    return null;
  }
  return userId;
}

// garante que um jsonb venha como objeto/array mesmo se vier string
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

    const safeUser = {
      ...rest,
      services: ensureParsedJson(services, {}),
      prices: ensureParsedJson(prices, {}),
      courses: ensureParsedJson(courses, []),
    };

    return res.json({ user: safeUser });
  } catch (err) {
    console.error("Erro em GET /users/me:", err);
    return res.status(500).json({ error: "Erro ao buscar usuário." });
  }
}

// -----------------------------------------------------------------------------
// PATCH /users/me  (atualiza perfil, exceto nome/email/senha/role)
// -----------------------------------------------------------------------------
async function updateMeController(req, res) {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const body = req.body || {};
    const updates = {};

    // campos simples que podem ser alterados
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

    // se for cuidador, aceita services / prices / courses
    if (req.user?.role === "caregiver") {
      if (Object.prototype.hasOwnProperty.call(body, "services")) {
        const v = body.services;
        updates.services = v && typeof v === "object" && !Array.isArray(v) ? v : {};
      }

      if (Object.prototype.hasOwnProperty.call(body, "prices")) {
        const v = body.prices;
        updates.prices = v && typeof v === "object" && !Array.isArray(v) ? v : {};
      }

      if (Object.prototype.hasOwnProperty.call(body, "courses")) {
        const v = body.courses;
        updates.courses = Array.isArray(v)
          ? v.filter((c) => typeof c === "string" && c.trim() !== "")
          : [];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error:
          "Nenhum campo de perfil válido para atualizar. (nome/email não podem ser alterados aqui).",
      });
    }

    const updated = await updateUserProfile(userId, updates);
    if (!updated) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    const { password_hash, password, services, prices, courses, ...rest } = updated;

    const safeUser = {
      ...rest,
      services: ensureParsedJson(services, {}),
      prices: ensureParsedJson(prices, {}),
      courses: ensureParsedJson(courses, []),
    };

    return res.json({ user: safeUser });
  } catch (err) {
    console.error("Erro em PATCH /users/me:", err);
    return res.status(500).json({ error: "Erro ao atualizar perfil." });
  }
}

// -----------------------------------------------------------------------------
// Disponibilidade do próprio usuário
// -----------------------------------------------------------------------------

// GET /users/me/availability
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
    return res.status(500).json({
      error: "Erro ao buscar disponibilidade do usuário.",
    });
  }
}

// PATCH /users/me/availability
async function updateMyAvailabilityController(req, res) {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    const { availableDates } = req.body;

    if (!Array.isArray(availableDates)) {
      return res.status(400).json({
        error: "Campo 'availableDates' deve ser um array de strings (datas).",
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
    return res.status(500).json({
      error: "Erro ao atualizar disponibilidade do usuário.",
    });
  }
}

// -----------------------------------------------------------------------------
// ✅ Capacidade diária do cuidador (users.daily_capacity)
// -----------------------------------------------------------------------------

function ensureCaregiver(req, res) {
  if (req.user?.role !== "caregiver") {
    res.status(403).json({ error: "Apenas cuidadores podem acessar." });
    return false;
  }
  return true;
}

// GET /users/me/capacity
async function getMyDailyCapacityController(req, res) {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;
    if (!ensureCaregiver(req, res)) return;

    if (typeof getDailyCapacityByUserId !== "function") {
      return res.status(500).json({
        error:
          "Model não possui getDailyCapacityByUserId. Adicione essa função em userModel.js",
      });
    }

    const daily_capacity = await getDailyCapacityByUserId(String(userId));
    return res.json({ daily_capacity });
  } catch (err) {
    console.error("Erro em GET /users/me/capacity:", err);
    return res.status(500).json({ error: "Erro ao buscar capacidade." });
  }
}

// PUT /users/me/capacity  body: { daily_capacity: 15 }
async function updateMyDailyCapacityController(req, res) {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;
    if (!ensureCaregiver(req, res)) return;

    const cap = toNum(req.body?.daily_capacity);

    // ✅ limites de segurança (ajuste se quiser)
    if (cap == null || !Number.isInteger(cap) || cap < 1 || cap > 100) {
      return res.status(400).json({
        error: "daily_capacity inválido. Use um inteiro entre 1 e 100.",
      });
    }

    if (typeof updateDailyCapacityByUserId !== "function") {
      return res.status(500).json({
        error:
          "Model não possui updateDailyCapacityByUserId. Adicione essa função em userModel.js",
      });
    }

    const updated = await updateDailyCapacityByUserId(String(userId), cap);
    const daily_capacity = Number(updated?.daily_capacity ?? cap);

    return res.json({ ok: true, daily_capacity });
  } catch (err) {
    console.error("Erro em PUT /users/me/capacity:", err);
    return res.status(500).json({ error: "Erro ao salvar capacidade." });
  }
}

// -----------------------------------------------------------------------------
// Rotas de Admin baseadas em /users
// -----------------------------------------------------------------------------

function ensureAdmin(req, res) {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Acesso restrito ao admin." });
    return false;
  }
  return true;
}

// GET /users/admin/users
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

// PATCH /users/admin/users/:id/block
async function adminBlockUserController(req, res) {
  try {
    if (!ensureAdmin(req, res)) return;

    const { id } = req.params;
    const { blocked } = req.body;

    if (typeof blocked !== "boolean") {
      return res.status(400).json({
        error: "Campo 'blocked' deve ser booleano (true/false).",
      });
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

  // ✅ NOVO (capacidade)
  getMyDailyCapacityController,
  updateMyDailyCapacityController,

  adminListUsersController,
  adminBlockUserController,
};
