// backend/src/models/petModel.js
const pool = require("../config/db");

function normalizePet(row) {
  if (!row) return null;

  let temperamentArray = [];
  if (Array.isArray(row.temperament)) {
    temperamentArray = row.temperament;
  } else if (typeof row.temperament === "string") {
    temperamentArray = row.temperament
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return {
    id: row.id,
    tutor_id: row.tutor_id,
    name: row.name,
    species: row.species || "",
    breed: row.breed || "",
    size: row.size || "",
    age: row.age || "",
    temperament: temperamentArray,
    notes: row.notes || "",
    image: row.image || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

module.exports = {
  async getAllByTutor(tutorId) {
    const result = await pool.query(
      `
      SELECT
        id,
        tutor_id,
        name,
        species,
        breed,
        size,
        age,
        temperament,
        notes,
        image,
        created_at,
        updated_at
      FROM pets
      WHERE tutor_id = $1
      ORDER BY id DESC;
      `,
      [tutorId]
    );

    return result.rows.map(normalizePet);
  },

  async getById(id) {
    const result = await pool.query(
      `
      SELECT
        id,
        tutor_id,
        name,
        species,
        breed,
        size,
        age,
        temperament,
        notes,
        image,
        created_at,
        updated_at
      FROM pets
      WHERE id = $1;
      `,
      [id]
    );

    return normalizePet(result.rows[0]);
  },

  async create(tutorId, data) {
    const {
      name,
      species,
      breed,
      size,
      age,
      temperament = [],
      notes,
      image,
    } = data;

    const temperamentStr = Array.isArray(temperament)
      ? temperament.join(", ")
      : temperament || null;

    const result = await pool.query(
      `
      INSERT INTO pets (
        tutor_id,
        name,
        species,
        breed,
        size,
        age,
        temperament,
        notes,
        image,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING *;
      `,
      [
        tutorId,
        name,
        species || null,
        breed || null,
        size || null,
        age || null,
        temperamentStr,
        notes || null,
        image || null,
      ]
    );

    return normalizePet(result.rows[0]);
  },

  async update(id, tutorId, data) {
    const {
      name,
      species,
      breed,
      size,
      age,
      temperament = [],
      notes,
      image,
    } = data;

    const temperamentStr = Array.isArray(temperament)
      ? temperament.join(", ")
      : temperament || null;

    const result = await pool.query(
      `
      UPDATE pets
      SET
        name        = $1,
        species     = $2,
        breed       = $3,
        size        = $4,
        age         = $5,
        temperament = $6,
        notes       = $7,
        image       = $8,
        updated_at  = NOW()
      WHERE id = $9 AND tutor_id = $10
      RETURNING *;
      `,
      [
        name,
        species || null,
        breed || null,
        size || null,
        age || null,
        temperamentStr,
        notes || null,
        image || null,
        id,
        tutorId,
      ]
    );

    return normalizePet(result.rows[0]);
  },

  async remove(id, tutorId) {
    const result = await pool.query(
      `DELETE FROM pets WHERE id = $1 AND tutor_id = $2 RETURNING id;`,
      [id, tutorId]
    );

    return result.rowCount > 0;
  },
};
