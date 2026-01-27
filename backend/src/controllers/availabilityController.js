// backend/src/controllers/availabilityController.js
const availabilityModel = require("../models/availabilityModel");

function toStr(v) {
  return v == null ? null : String(v);
}

function normalizeKey(v) {
  if (!v) return null;
  const s = String(v).trim();

  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);

  return null;
}

function normalizeRangeFromQuery(req) {
  const start = normalizeKey(req.query?.start);
  const end = normalizeKey(req.query?.end);
  if (!start || !end) return null;

  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  if (s > e) return null;

  return { start, end };
}

function defaultRange(daysAhead = 120) {
  const now = new Date();
  const start = now.toISOString().slice(0, 10);
  const end = new Date(now.getTime() + daysAhead * 86400000).toISOString().slice(0, 10);
  return { start, end };
}

/**
 * ["YYYY-MM-DD", ...]
 */
function rowsToKeys(rows) {
  return Array.from(
    new Set(
      (Array.isArray(rows) ? rows : [])
        .map((r) => normalizeKey(r?.date_key ?? r?.date))
        .filter(Boolean)
    )
  ).sort();
}

async function fetchAvailabilitySafe(caregiverId, rangeOrNull) {
  if (rangeOrNull && typeof availabilityModel.getCaregiverAvailability === "function") {
    return availabilityModel.getCaregiverAvailability(caregiverId, rangeOrNull.start, rangeOrNull.end);
  }
  return availabilityModel.listAvailability(caregiverId);
}

function extractAvailableKeysFromBody(body) {
  const rawArray = Array.isArray(body)
    ? body
    : Array.isArray(body?.availability)
    ? body.availability
    : Array.isArray(body?.items)
    ? body.items
    : [];

  if (rawArray.length && typeof rawArray[0] === "string") {
    return Array.from(new Set(rawArray.map(normalizeKey).filter(Boolean))).sort();
  }

  const keys = rawArray
    .map((it) => normalizeKey(it?.dateKey ?? it?.date_key ?? it?.date))
    .filter(Boolean);

  return Array.from(new Set(keys)).sort();
}

// 🌍 PÚBLICO — tutor
async function getCaregiverAvailability(req, res) {
  try {
    const caregiverId = toStr(req.params.caregiverId);
    if (!caregiverId) {
      return res.status(400).json({ error: "caregiverId inválido." });
    }

    const range = normalizeRangeFromQuery(req) || defaultRange(120);
    const rows = await fetchAvailabilitySafe(caregiverId, range);

    return res.json({
      availability: rowsToKeys(rows),
    });
  } catch (e) {
    console.error("getCaregiverAvailability error:", e);
    return res.status(500).json({ error: "Erro ao buscar disponibilidade." });
  }
}

// 🔒 PRIVADO — cuidador (multi-perfil)
async function getMyAvailability(req, res) {
  try {
    const caregiverId = toStr(req.user?.id);
    if (!caregiverId) {
      return res.status(401).json({ error: "Não autenticado." });
    }

    // ✅ Multi-perfil: NÃO trava por role.
    // Quem garante acesso é o requireCaregiverProfile no router.
    // Mas deixamos um fallback defensivo:
    if (req.user?.hasCaregiverProfile !== true && String(req.user?.role || "").toLowerCase() !== "admin") {
      return res.status(403).json({ error: "Apenas cuidadores podem acessar." });
    }

    const range = normalizeRangeFromQuery(req) || null;
    const rows = await fetchAvailabilitySafe(caregiverId, range);

    return res.json({
      availability: rowsToKeys(rows),
    });
  } catch (e) {
    console.error("getMyAvailability error:", e);
    return res.status(500).json({ error: "Erro ao buscar disponibilidade." });
  }
}

// 🔒 PRIVADO — salvar (multi-perfil)
async function updateMyAvailability(req, res) {
  try {
    const caregiverId = toStr(req.user?.id);
    if (!caregiverId) {
      return res.status(401).json({ error: "Não autenticado." });
    }

    if (req.user?.hasCaregiverProfile !== true && String(req.user?.role || "").toLowerCase() !== "admin") {
      return res.status(403).json({ error: "Apenas cuidadores podem atualizar." });
    }

    const availableKeys = extractAvailableKeysFromBody(req.body);

    await availabilityModel.replaceAvailability(caregiverId, availableKeys);

    const rows = await fetchAvailabilitySafe(caregiverId, null);

    return res.json({
      ok: true,
      availability: rowsToKeys(rows),
    });
  } catch (e) {
    console.error("updateMyAvailability error:", e);
    return res.status(500).json({ error: "Erro ao salvar disponibilidade." });
  }
}

module.exports = {
  getCaregiverAvailability,
  getMyAvailability,
  updateMyAvailability,
};
