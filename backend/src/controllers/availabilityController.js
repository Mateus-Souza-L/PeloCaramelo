// backend/src/controllers/availabilityController.js
const availabilityModel = require("../models/availabilityModel");

function toStr(v) {
  return v == null ? null : String(v);
}

/**
 * ✅ Converte várias entradas possíveis em uma chave ISO "YYYY-MM-DD"
 * Aceita:
 * - "2026-08-21" (ISO)
 * - "2026-08-21T00:00:00.000Z" (ISO datetime)
 * - "21/08/2026" (BR)
 * - strings parseáveis via Date()
 */
function normalizeKey(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;

  // ISO: 2026-08-21
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // ISO datetime: 2026-08-21T...
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // BR: 21/08/2026  ✅ FIX DO BUG
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  // fallback: tenta parsear (cuidado com dd/mm em Date() -> por isso vem depois do BR)
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);

  return null;
}

/**
 * Normaliza intervalo vindo pela query.
 * ✅ Compatível com chaves usadas pelo front:
 * - start/end (legado)
 * - startDate/endDate (comum)
 * - from/to (alternativa)
 */
function normalizeRangeFromQuery(req) {
  const q = req.query || {};

  const start =
    normalizeKey(q.start) ||
    normalizeKey(q.startDate) ||
    normalizeKey(q.from);

  const end =
    normalizeKey(q.end) ||
    normalizeKey(q.endDate) ||
    normalizeKey(q.to);

  if (!start || !end) return null;

  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  if (s > e) return null;

  return { start, end };
}

/**
 * ✅ Range padrão para público (tutor)
 * Importante: aqui era 120 dias, o que pode ocultar datas "meses à frente".
 * ✅ Ajuste: agora é 365 dias por padrão (configurável).
 */
function defaultRange(daysAhead = Number(process.env.AVAILABILITY_PUBLIC_DAYS_AHEAD || 365)) {
  const now = new Date();
  const start = now.toISOString().slice(0, 10);
  const end = new Date(now.getTime() + daysAhead * 86400000).toISOString().slice(0, 10);
  return { start, end };
}

/**
 * 🔑 NORMALIZA PARA ARRAY DE STRINGS
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
  // ✅ se o model suporta range, usa range (melhor para o filtro por data da busca)
  if (rangeOrNull && typeof availabilityModel.getCaregiverAvailability === "function") {
    return availabilityModel.getCaregiverAvailability(
      caregiverId,
      rangeOrNull.start,
      rangeOrNull.end
    );
  }

  // fallback legado
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
    if (!caregiverId) return res.status(400).json({ error: "caregiverId inválido." });

    // ✅ FIX:
    // - agora aceita start/end, startDate/endDate, from/to
    // - e aceita datas BR "DD/MM/AAAA"
    // - range padrão ampliado para não esconder disponibilidade meses à frente
    const range = normalizeRangeFromQuery(req) || defaultRange();

    const rows = await fetchAvailabilitySafe(caregiverId, range);

    return res.json({ availability: rowsToKeys(rows) });
  } catch (e) {
    console.error("getCaregiverAvailability error:", e);
    return res.status(500).json({ error: "Erro ao buscar disponibilidade." });
  }
}

// 🔒 PRIVADO — cuidador (multi-perfil)
// ✅ NÃO checa role aqui: a proteção é via requireCaregiverProfile na rota.
async function getMyAvailability(req, res) {
  try {
    const caregiverId = toStr(req.user?.id);
    if (!caregiverId) return res.status(401).json({ error: "Não autenticado." });

    // para o cuidador, range é opcional (pode querer ver tudo)
    const range = normalizeRangeFromQuery(req) || null;

    const rows = await fetchAvailabilitySafe(caregiverId, range);

    return res.json({ availability: rowsToKeys(rows) });
  } catch (e) {
    console.error("getMyAvailability error:", e);
    return res.status(500).json({ error: "Erro ao buscar disponibilidade." });
  }
}

// 🔒 PRIVADO — salvar (multi-perfil)
// ✅ NÃO checa role aqui: a proteção é via requireCaregiverProfile na rota.
async function updateMyAvailability(req, res) {
  try {
    const caregiverId = toStr(req.user?.id);
    if (!caregiverId) return res.status(401).json({ error: "Não autenticado." });

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
