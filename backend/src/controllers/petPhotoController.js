// backend/src/controllers/petPhotoController.js
const pool = require("../config/db");
const { uploadPetPhoto } = require("../services/petPhotoService");

// Se no seu banco a tabela de pets for "animais_de_estimacao", defina no Render/.env:
// PETS_TABLE=animais_de_estimacao
const PETS_TABLE = process.env.PETS_TABLE || "pets";

// helpers
function toInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i > 0 ? i : null;
}

function isTutorOrAdmin(req) {
  const role = req?.user?.role;
  return role === "tutor" || role === "admin";
}

async function getPetOwnerId(petId) {
  // Primeiro tenta "tutor_id" (padrão do teu projeto)
  try {
    const sql = `SELECT id, tutor_id FROM ${PETS_TABLE} WHERE id = $1 LIMIT 1`;
    const { rows } = await pool.query(sql, [petId]);
    if (!rows[0]) return null;
    return { pet: rows[0], ownerId: rows[0].tutor_id };
  } catch (e) {
    // Se sua tabela usar outro nome (ex: user_id), tenta fallback
    const sql2 = `SELECT id, user_id FROM ${PETS_TABLE} WHERE id = $1 LIMIT 1`;
    const { rows } = await pool.query(sql2, [petId]);
    if (!rows[0]) return null;
    return { pet: rows[0], ownerId: rows[0].user_id };
  }
}

async function updatePetPhoto(petId, photo_url, photo_path) {
  // Atualiza sempre os campos novos
  const sql = `
    UPDATE ${PETS_TABLE}
    SET photo_url = $2,
        photo_path = $3
    WHERE id = $1
    RETURNING *
  `;
  const { rows } = await pool.query(sql, [petId, photo_url, photo_path]);
  return rows[0] || null;
}

/**
 * POST /pets/:id/photo
 * Requer auth (req.user)
 * Requer multer (req.file)
 */
async function uploadPetPhotoController(req, res) {
  try {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!isTutorOrAdmin(req)) return res.status(403).json({ error: "Forbidden" });

    const petId = toInt(req.params.id);
    if (!petId) return res.status(400).json({ error: "Invalid pet id" });

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "Missing image file (field: photo)" });
    }

    // ownership: tutor só pode alterar o próprio pet
    const ownerInfo = await getPetOwnerId(petId);
    if (!ownerInfo) return res.status(404).json({ error: "Pet not found" });

    const ownerId = ownerInfo.ownerId;
    if (req.user.role !== "admin" && Number(ownerId) !== Number(req.user.id)) {
      return res.status(403).json({ error: "You do not own this pet" });
    }

    // upload no Supabase
    const uploaded = await uploadPetPhoto({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      petId,
    });

    // salva no banco
    const updatedPet = await updatePetPhoto(petId, uploaded.photo_url, uploaded.photo_path);
    if (!updatedPet) return res.status(500).json({ error: "Failed to update pet photo" });

    return res.json({
      ok: true,
      pet: updatedPet,
    });
  } catch (err) {
    console.error("uploadPetPhotoController error:", err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}

module.exports = { uploadPetPhotoController };
