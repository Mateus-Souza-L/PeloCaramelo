// backend/src/models/userModel.js
const pool = require("../config/db");

// Helper para campos jsonb opcionais
const toJsonOrNull = (value) =>
  value === null || value === undefined ? null : JSON.stringify(value);

/* ============================================================
   Helpers DB
   ============================================================ */

async function columnExists(tableName, columnName) {
  const { rows } = await pool.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
      AND column_name = $2
    LIMIT 1;
    `,
    [String(tableName), String(columnName)]
  );
  return !!rows?.[0];
}

/* ============================================================
   Criar usuário
   ============================================================ */
async function createUser({
  name,
  email,
  passwordHash,
  role,
  image = null,
  bio = null,
  phone = null,
  address = null,
  neighborhood = null,
  city = null,
  cep = null,
  services = {}, // objeto
  prices = {}, // objeto
  courses = [], // array
}) {
  const query = `
    INSERT INTO users (
      name,
      email,
      password_hash,
      role,
      image,
      bio,
      phone,
      address,
      neighborhood,
      city,
      cep,
      services,
      prices,
      courses,
      blocked,
      created_at,
      updated_at
    )
    VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8, $9, $10, $11,
      $12::jsonb,
      $13::jsonb,
      $14::jsonb,
      false,
      NOW(),
      NOW()
    )
    RETURNING id, name, email, role, city, image, blocked;
  `;

  const values = [
    name,
    email,
    passwordHash,
    role,
    image,
    bio,
    phone,
    address,
    neighborhood,
    city,
    cep,
    toJsonOrNull(services),
    toJsonOrNull(prices),
    toJsonOrNull(courses),
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
}

/* ============================================================
   Buscar usuário por email
   ============================================================ */
async function findUserByEmail(email) {
  const result = await pool.query(
    "SELECT * FROM users WHERE email = $1 LIMIT 1",
    [email]
  );
  return result.rows[0] || null;
}

/* ============================================================
   Buscar usuário por ID (todas as colunas)
   ============================================================ */
async function findUserById(id) {
  const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  return result.rows[0] || null;
}

/* ============================================================
   Atualizar campos do perfil do usuário
   Recebe um objeto `updates` já filtrado no controller.
   ============================================================ */
async function updateUserProfile(userId, updates) {
  const entries = Object.entries(updates || {});
  if (!entries.length) return null;

  const setClauses = [];
  const values = [userId];
  let paramIdx = 2;

  for (const [field, rawValue] of entries) {
    let value = rawValue;

    if (field === "services" || field === "prices") {
      if (!value || typeof value !== "object" || Array.isArray(value)) value = {};
      setClauses.push(`${field} = $${paramIdx}::jsonb`);
      values.push(JSON.stringify(value));
    } else if (field === "courses") {
      if (!Array.isArray(value)) value = value == null ? [] : [value];
      setClauses.push(`${field} = $${paramIdx}::jsonb`);
      values.push(JSON.stringify(value));
    } else {
      setClauses.push(`${field} = $${paramIdx}`);
      values.push(value);
    }

    paramIdx++;
  }

  const query = `
    UPDATE users
    SET
      ${setClauses.join(", ")},
      updated_at = NOW()
    WHERE id = $1
    RETURNING
      id,
      name,
      email,
      role,
      image,
      bio,
      phone,
      address,
      neighborhood,
      city,
      cep,
      services,
      prices,
      courses,
      blocked,
      daily_capacity,
      created_at,
      updated_at;
  `;

  const result = await pool.query(query, values);
  return result.rows[0] || null;
}

/* ============================================================
   Lista básica de usuários para o admin
   ============================================================ */
async function listAllUsers() {
  const result = await pool.query(
    `
      SELECT
        id,
        name,
        email,
        role,
        image,
        city,
        blocked,
        created_at,
        updated_at
      FROM users
      ORDER BY created_at DESC;
    `
  );

  return result.rows;
}

/* ============================================================
   Atualiza status de bloqueio do usuário (admin)
   ============================================================ */
async function setUserBlockedStatus(id, blocked) {
  const result = await pool.query(
    `
      UPDATE users
      SET blocked = $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        name,
        email,
        role,
        image,
        city,
        blocked,
        created_at,
        updated_at;
    `,
    [id, blocked]
  );

  return result.rows[0] || null;
}

/* ============================================================
   Disponibilidade (LEGADO) — evita quebrar caso rota ainda exista
   ============================================================ */
async function getUserAvailability(userId) {
  const hasCol = await columnExists("users", "available_dates");
  if (!hasCol) return [];

  const result = await pool.query(
    "SELECT available_dates FROM users WHERE id = $1",
    [userId]
  );
  const row = result.rows[0];
  return row?.available_dates || [];
}

async function updateUserAvailability(userId, dates) {
  const hasCol = await columnExists("users", "available_dates");
  if (!hasCol) {
    return { id: userId, available_dates: Array.isArray(dates) ? dates : [] };
  }

  const json = JSON.stringify(dates || []);
  const result = await pool.query(
    `
      UPDATE users
      SET available_dates = $2::jsonb,
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, available_dates;
    `,
    [userId, json]
  );
  return result.rows[0] || null;
}

/* ============================================================
   Capacidade diária do cuidador (users.daily_capacity)
   ============================================================ */

function defaultCapacity() {
  const n = Number(process.env.DEFAULT_DAILY_CAPACITY ?? 15);
  return Number.isFinite(n) && Number.isInteger(n) && n >= 1 ? n : 15;
}

async function getDailyCapacityByUserId(userId) {
  const def = defaultCapacity();
  const result = await pool.query(
    `
      SELECT COALESCE(daily_capacity, $2::int)::int AS daily_capacity
      FROM users
      WHERE id::text = $1::text
      LIMIT 1
    `,
    [String(userId), def]
  );

  const cap = Number(result?.rows?.[0]?.daily_capacity ?? def);
  return Number.isFinite(cap) && Number.isInteger(cap) && cap >= 1 ? cap : def;
}

async function updateDailyCapacityByUserId(userId, dailyCapacity) {
  const cap = Number(dailyCapacity);
  if (!Number.isFinite(cap) || !Number.isInteger(cap) || cap < 1) {
    throw new Error("dailyCapacity inválido.");
  }

  const result = await pool.query(
    `
      UPDATE users
      SET daily_capacity = $2::int,
          updated_at = NOW()
      WHERE id::text = $1::text
      RETURNING id, daily_capacity;
    `,
    [String(userId), cap]
  );

  return result.rows[0] || null;
}

/* ============================================================
   EXPORTS
   ============================================================ */
module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  updateUserProfile,
  listAllUsers,
  setUserBlockedStatus,

  // legado (não quebra caso ainda use)
  getUserAvailability,
  updateUserAvailability,

  getDailyCapacityByUserId,
  updateDailyCapacityByUserId,
};
