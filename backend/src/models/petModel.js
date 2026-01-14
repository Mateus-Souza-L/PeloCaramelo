// backend/src/models/petModel.js
const pool = require("../config/db");

function normalizePet(row) {
  if (!row) return null;

  // Se não existir temperament no banco, isso vem null e tudo bem.
  const rawTemp = row.temperament ?? row.temperaments ?? null;

  let temperamentArray = [];
  if (Array.isArray(rawTemp)) {
    temperamentArray = rawTemp;
  } else if (typeof rawTemp === "string") {
    temperamentArray = rawTemp
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
    // não depende de created_at/updated_at
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  };
}

function isUndefinedColumnError(err) {
  return err && err.code === "42703";
}

module.exports = {
  // GET /pets
  async getAllByTutor(tutorId) {
    // ✅ não seleciona created_at/updated_at
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
        notes,
        image
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
        notes,
        image
      FROM pets
      WHERE id = $1;
      `,
      [id]
    );

    return normalizePet(result.rows[0]);
  },

  // POST /pets
  async create(tutorId, data) {
    const { name, species, breed, size, age, temperament = [], notes, image } = data;

    const temperamentStr = Array.isArray(temperament)
      ? temperament.join(", ")
      : temperament || null;

    // 1) tenta com temperament (se existir)
    try {
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
          image
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
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
    } catch (err) {
      // se temperament não existe, tenta sem
      if (!isUndefinedColumnError(err) || !String(err.message || "").includes(`"temperament"`)) {
        throw err;
      }

      const result2 = await pool.query(
        `
        INSERT INTO pets (
          tutor_id,
          name,
          species,
          breed,
          size,
          age,
          notes,
          image
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING *;
        `,
        [
          tutorId,
          name,
          species || null,
          breed || null,
          size || null,
          age || null,
          notes || null,
          image || null,
        ]
      );

      return normalizePet(result2.rows[0]);
    }
  },

  // PUT /pets/:id
  async update(id, tutorId, data) {
    const { name, species, breed, size, age, temperament = [], notes, image } = data;

    const temperamentStr = Array.isArray(temperament)
      ? temperament.join(", ")
      : temperament || null;

    // 1) tenta com temperament
    try {
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
          image       = $8
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
    } catch (err) {
      if (!isUndefinedColumnError(err) || !String(err.message || "").includes(`"temperament"`)) {
        throw err;
      }

      const result2 = await pool.query(
        `
        UPDATE pets
        SET
          name    = $1,
          species = $2,
          breed   = $3,
          size    = $4,
          age     = $5,
          notes   = $6,
          image   = $7
        WHERE id = $8 AND tutor_id = $9
        RETURNING *;
        `,
        [
          name,
          species || null,
          breed || null,
          size || null,
          age || null,
          notes || null,
          image || null,
          id,
          tutorId,
        ]
      );

      return normalizePet(result2.rows[0]);
    }
  },

  async remove(id, tutorId) {
    const result = await pool.query(
      `DELETE FROM pets WHERE id = $1 AND tutor_id = $2 RETURNING id;`,
      [id, tutorId]
    );
    return result.rowCount > 0;
  },
};
