// src/config/db.js
const { Pool } = require("pg");
require("dotenv").config();

// Verificação básica
if (!process.env.DATABASE_URL) {
  console.warn(
    "⚠️ DATABASE_URL não está definida no .env. O PostgreSQL não poderá conectar."
  );
}

// Configuração do pool de conexões
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DB_SSL === "true"
      ? { rejectUnauthorized: false } // Para produção (como Render / Railway)
      : false, // Localhost
});

// Log de erros inesperados durante a execução
pool.on("error", (err) => {
  console.error("🔥 Erro inesperado no pool de conexão do PostgreSQL:", err);
});

// Função útil para testar a conexão no server.js (opcional)
async function testConnection() {
  try {
    const client = await pool.connect();
    console.log("🐘 PostgreSQL conectado com sucesso!");
    client.release();
  } catch (err) {
    console.error("❌ Falha ao conectar no PostgreSQL:", err.message);
  }
}

// Executa teste automaticamente ao iniciar
testConnection();

module.exports = pool;
