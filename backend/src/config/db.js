// backend/src/config/db.js
const { Pool } = require("pg");
require("dotenv").config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn("⚠️ DATABASE_URL não está definida no .env");
}

/**
 * Supabase (pooler) precisa de SSL.
 * Em dev local (localhost), geralmente NÃO.
 *
 * Regras:
 * - Se DB_SSL=true -> liga SSL
 * - Se a DATABASE_URL tiver sslmode=require -> liga SSL
 * - Se parecer Supabase/pooler -> liga SSL
 */
const dbSslFlag = String(process.env.DB_SSL || "").toLowerCase() === "true";

const looksLikeSupabase =
  /supabase\.com/i.test(DATABASE_URL || "") ||
  /pooler\.supabase\.com/i.test(DATABASE_URL || "");

const urlRequiresSSL = /sslmode=require/i.test(DATABASE_URL || "");

const useSSL = dbSslFlag || looksLikeSupabase || urlRequiresSSL;

// ✅ config recomendada pra Supabase: rejectUnauthorized false (evita erro de chain no Node/Windows)
const sslConfig = useSSL ? { rejectUnauthorized: false } : false;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: sslConfig,
  // opcional: evita travar em conexões ruins
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
});

pool.on("error", (err) => {
  console.error("🔥 Erro inesperado no pool PostgreSQL:", err);
});

// ✅ teste de conexão (roda ao iniciar)
async function testConnection() {
  if (!DATABASE_URL) return;

  try {
    const client = await pool.connect();
    const { rows } = await client.query("select now() as now, current_user as user");
    console.log("🐘 PostgreSQL conectado com sucesso!", rows[0]);
    client.release();
  } catch (err) {
    console.error("❌ Falha ao conectar no PostgreSQL:", err.message);
    console.error("ℹ️ SSL ligado?", useSSL);
  }
}

testConnection();

module.exports = pool;
