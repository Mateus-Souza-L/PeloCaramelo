// backend/src/controllers/petHistoryController.js
const pool = require("../config/db");

function toInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i > 0 ? i : null;
}

const PETS_TABLE = process.env.PETS_TABLE || "pets";

async function getPetOwnerId(petId) {
  // tenta tutor_id (padrão)
  try {
    const sql = `SELECT id, tutor_id FROM ${PETS_TABLE} WHERE id = $1 LIMIT 1`;
    const { rows } = await pool.query(sql, [petId]);
    if (!rows[0]) return null;
    return rows[0].tutor_id;
  } catch {
    // fallback: user_id
    const sql2 = `SELECT id, user_id FROM ${PETS_TABLE} WHERE id = $1 LIMIT 1`;
    const { rows } = await pool.query(sql2, [petId]);
    if (!rows[0]) return null;
    return rows[0].user_id;
  }
}

/**
 * GET /pets/:id/history
 * Histórico de reservas do pet (por pets_ids ARRAY)
 */
async function getPetHistory(req, res) {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const petId = toInt(req.params.id);
    if (!petId) return res.status(400).json({ error: "Invalid pet id" });

    // ownership: tutor só vê histórico do próprio pet (admin pode tudo)
    const ownerId = await getPetOwnerId(petId);
    if (!ownerId) return res.status(404).json({ error: "Pet not found" });

    if (req.user.role !== "admin" && Number(ownerId) !== Number(req.user.id)) {
      return res.status(403).json({ error: "You do not own this pet" });
    }

    // histórico: reservas onde petId está dentro do array pets_ids
    const sql = `
      SELECT
        id,
        tutor_id,
        caregiver_id,
        caregiver_name,
        tutor_name,
        city,
        neighborhood,
        service,
        price_per_day,
        start_date,
        end_date,
        total,
        status,
        pets_ids,
        pets_names,
        pets_snapshot,
        created_at,
        updated_at
      FROM reservations
      WHERE $1 = ANY(pets_ids)
      ORDER BY start_date DESC, id DESC
      LIMIT 200
    `;

    const { rows } = await pool.query(sql, [petId]);

    return res.json({ ok: true, petId, history: rows });
  } catch (err) {
    console.error("getPetHistory error:", err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}

module.exports = { getPetHistory };
