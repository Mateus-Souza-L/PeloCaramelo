// backend/src/models/petModel.js
const pool = require("../config/db");

function normalizePet(row) {
  if (!row) return null;

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
    tutor_id: row.tutor_id ?? row.user_id ?? row.owner_id,
    name: row.name,
    species: row.species || "",
    breed: row.breed || "",
    size: row.size || "",
    age: row.age || "",
    temperament: temperamentArray,
    notes: row.notes || "",
    image: row.image || row.image_url || row.photo || "",
    created_at: row.created_at ?? row.createdAt ?? null,
    updated_at: row.updated_at ?? row.updatedAt ?? null,
  };
}

function isUndefinedColumnError(err) {
  // 42703 = undefined_column
  return err && (err.code === "42703" || /column .* does not exist/i.test(err.message || ""));
}

function isUndefinedTableError(err) {
  // 42P01 = undefined_table
  return err && (err.code === "42P01" || /relation .* does not exist/i.test(err.message || ""));
}

async function runWithFallback(steps) {
  let lastErr = null;
  for (const step of steps) {
    try {
      return await step.fn();
    } catch (err) {
      lastErr = err;

      // se a tabela não existe, não adianta fallback
      if (isUndefinedTableError(err)) throw err;

      // só faz fallback quando é "coluna não existe"
      if (!isUndefinedColumnError(err)) throw err;
    }
  }
  throw lastErr;
}

module.exports = {
  async getAllByTutor(tutorId) {
    const tutorParam = [tutorId];

    const steps = [
      {
        name: "full",
        fn: async () =>
          pool.query(
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
            tutorParam
          ),
      },
      {
        name: "no_timestamps",
        fn: async () =>
          pool.query(
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
              image
            FROM pets
            WHERE tutor_id = $1
            ORDER BY id DESC;
            `,
            tutorParam
          ),
      },
      {
        name: "basic",
        fn: async () =>
          pool.query(
            `
            SELECT
              id,
              tutor_id,
              name,
              species,
              breed,
              size,
              age
            FROM pets
            WHERE tutor_id = $1
            ORDER BY id DESC;
            `,
            tutorParam
          ),
      },
    ];

    try {
      const result = await runWithFallback(steps);
      return result.rows.map(normalizePet);
    } catch (err) {
      console.error("[pets.getAllByTutor] DB error:", err.code, err.message);
      throw err;
    }
  },

  async getById(id) {
    const steps = [
      {
        name: "full",
        fn: async () =>
          pool.query(
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
          ),
      },
      {
        name: "no_timestamps",
        fn: async () =>
          pool.query(
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
              image
            FROM pets
            WHERE id = $1;
            `,
            [id]
          ),
      },
      {
        name: "basic",
        fn: async () =>
          pool.query(
            `
            SELECT
              id,
              tutor_id,
              name,
              species,
              breed,
              size,
              age
            FROM pets
            WHERE id = $1;
            `,
            [id]
          ),
      },
    ];

    try {
      const result = await runWithFallback(steps);
      return normalizePet(result.rows[0]);
    } catch (err) {
      console.error("[pets.getById] DB error:", err.code, err.message);
      throw err;
    }
  },

  async create(tutorId, data) {
    const { name, species, breed, size, age, temperament = [], notes, image } = data;

    const temperamentStr = Array.isArray(temperament)
      ? temperament.join(", ")
      : temperament || null;

    const baseParams = [
      tutorId,
      name,
      species || null,
      breed || null,
      size || null,
      age || null,
      temperamentStr,
      notes || null,
      image || null,
    ];

    const steps = [
      {
        name: "with_timestamps",
        fn: async () =>
          pool.query(
            `
            INSERT INTO pets (
              tutor_id, name, species, breed, size, age, temperament, notes, image, created_at, updated_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW(), NOW())
            RETURNING *;
            `,
            baseParams
          ),
      },
      {
        name: "no_timestamps",
        fn: async () =>
          pool.query(
            `
            INSERT INTO pets (
              tutor_id, name, species, breed, size, age, temperament, notes, image
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING *;
            `,
            baseParams
          ),
      },
      {
        name: "basic",
        fn: async () =>
          pool.query(
            `
            INSERT INTO pets (
              tutor_id, name, species, breed, size, age
            )
            VALUES ($1,$2,$3,$4,$5,$6)
            RETURNING *;
            `,
            [tutorId, name, species || null, breed || null, size || null, age || null]
          ),
      },
    ];

    try {
      const result = await runWithFallback(steps);
      return normalizePet(result.rows[0]);
    } catch (err) {
      console.error("[pets.create] DB error:", err.code, err.message);
      throw err;
    }
  },

  async update(id, tutorId, data) {
    const { name, species, breed, size, age, temperament = [], notes, image } = data;

    const temperamentStr = Array.isArray(temperament)
      ? temperament.join(", ")
      : temperament || null;

    const paramsFull = [
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
    ];

    const steps = [
      {
        name: "with_updated_at",
        fn: async () =>
          pool.query(
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
            paramsFull
          ),
      },
      {
        name: "no_updated_at",
        fn: async () =>
          pool.query(
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
            paramsFull
          ),
      },
      {
        name: "basic",
        fn: async () =>
          pool.query(
            `
            UPDATE pets
            SET
              name    = $1,
              species = $2,
              breed   = $3,
              size    = $4,
              age     = $5
            WHERE id = $6 AND tutor_id = $7
            RETURNING *;
            `,
            [name, species || null, breed || null, size || null, age || null, id, tutorId]
          ),
      },
    ];

    try {
      const result = await runWithFallback(steps);
      return normalizePet(result.rows[0]);
    } catch (err) {
      console.error("[pets.update] DB error:", err.code, err.message);
      throw err;
    }
  },

  async remove(id, tutorId) {
    try {
      const result = await pool.query(
        `DELETE FROM pets WHERE id = $1 AND tutor_id = $2 RETURNING id;`,
        [id, tutorId]
      );
      return result.rowCount > 0;
    } catch (err) {
      console.error("[pets.remove] DB error:", err.code, err.message);
      throw err;
    }
  },
};
