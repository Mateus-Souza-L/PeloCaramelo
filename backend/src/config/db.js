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

// ✅ recomendado pra Supabase: rejectUnauthorized false (evita erro de chain no Node/Windows)
const sslConfig = useSSL ? { rejectUnauthorized: false } : false;

// ✅ LIMITES IMPORTANTES (evita "Max client connections reached")
const PG_POOL_MAX = Math.max(1, Math.min(20, Number(process.env.PG_POOL_MAX || 5)));
const PG_CONN_TIMEOUT_MS = Number(process.env.PG_CONN_TIMEOUT_MS || 10000);
const PG_IDLE_TIMEOUT_MS = Number(process.env.PG_IDLE_TIMEOUT_MS || 30000);

// ✅ KeepAlive ajuda a reduzir quedas "Connection terminated unexpectedly" em algumas redes/proxy
const PG_KEEPALIVE = String(process.env.PG_KEEPALIVE || "true").toLowerCase() === "true";
const PG_KEEPALIVE_INITIAL_DELAY_MS = Number(process.env.PG_KEEPALIVE_INITIAL_DELAY_MS || 0);

// ✅ Reconnect simples quando o pool entra em estado ruim:
// - recria o pool em erro "terminado" / "ECONNRESET" etc.
// - mantém uma referência estável via getPool()
let _pool = null;
let _recreating = false;

function createPool() {
  const p = new Pool({
    connectionString: DATABASE_URL,
    ssl: sslConfig,

    max: PG_POOL_MAX,
    connectionTimeoutMillis: PG_CONN_TIMEOUT_MS,
    idleTimeoutMillis: PG_IDLE_TIMEOUT_MS,

    keepAlive: PG_KEEPALIVE,
    keepAliveInitialDelayMillis: PG_KEEPALIVE_INITIAL_DELAY_MS,
  });

  p.on("error", async (err) => {
    const msg = String(err?.message || err || "");
    console.error("🔥 Erro inesperado no pool PostgreSQL:", msg);

    // tenta recriar o pool em erros comuns de queda de conexão
    const shouldRecreate =
      /Connection terminated unexpectedly/i.test(msg) ||
      /ECONNRESET/i.test(msg) ||
      /server closed the connection/i.test(msg) ||
      /terminating connection/i.test(msg);

    if (shouldRecreate) {
      await recreatePool("pool_error");
    }
  });

  return p;
}

async function recreatePool(reason = "unknown") {
  if (_recreating) return;
  _recreating = true;

  try {
    const old = _pool;
    _pool = createPool();

    console.log("🔁 Pool PostgreSQL recriado:", {
      reason,
      poolMax: PG_POOL_MAX,
      ssl: Boolean(useSSL),
      keepAlive: PG_KEEPALIVE,
    });

    // encerra o pool antigo sem derrubar a aplicação
    if (old) {
      try {
        await old.end();
      } catch {
        // ignore
      }
    }

    // opcional: testa a nova conexão
    await testConnection(_pool);
  } finally {
    _recreating = false;
  }
}

function getPool() {
  if (_pool) return _pool;
  _pool = createPool();
  return _pool;
}

// ✅ teste de conexão (roda ao iniciar)
async function testConnection(poolInstance = getPool()) {
  if (!DATABASE_URL) return;

  try {
    const client = await poolInstance.connect();
    const { rows } = await client.query("select now() as now, current_user as user");
    console.log("🐘 PostgreSQL conectado com sucesso!", rows[0], {
      poolMax: PG_POOL_MAX,
      ssl: Boolean(useSSL),
      keepAlive: PG_KEEPALIVE,
    });
    client.release();
  } catch (err) {
    console.error("❌ Falha ao conectar no PostgreSQL:", err?.message || err);
    console.error("ℹ️ SSL ligado?", useSSL);
    console.error("ℹ️ pool max:", PG_POOL_MAX);
    console.error("ℹ️ keepAlive:", PG_KEEPALIVE);

    // tenta recriar ao falhar logo no boot
    await recreatePool("boot_test_failed");
  }
}

testConnection();

// ✅ exporta o pool diretamente (mantém compatibilidade com `pool.query(...)`)
module.exports = getPool();
