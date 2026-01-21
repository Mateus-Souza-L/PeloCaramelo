// backend/src/models/passwordResetModel.js
const crypto = require("crypto");
const pool = require("../config/db");

function getDb(db) {
  return db && typeof db.query === "function" ? db : pool;
}

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

/* ============================================================
   FUNÇÕES "BASE" (mantidas)
   ============================================================ */

/**
 * Cria um reset de senha (salva SOMENTE o hash do token)
 */
async function createPasswordResetBase({ userId, tokenHash, expiresAt }, db) {
  const conn = getDb(db);
  const uid = toInt(userId);
  if (!uid) return null;

  const result = await conn.query(
    `
      INSERT INTO password_resets (
        user_id,
        token_hash,
        expires_at,
        created_at
      )
      VALUES ($1, $2, $3, NOW())
      RETURNING id, user_id, expires_at
    `,
    [uid, String(tokenHash), expiresAt]
  );

  return result.rows[0] || null;
}

/**
 * Busca reset válido (não usado e não expirado)
 */
async function findValidByTokenHash(tokenHash, db) {
  const conn = getDb(db);

  const result = await conn.query(
    `
      SELECT *
      FROM password_resets
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > NOW()
      ORDER BY id DESC
      LIMIT 1
    `,
    [String(tokenHash)]
  );

  return result.rows[0] || null;
}

/**
 * Marca token como usado
 */
async function markUsed(id, db) {
  const conn = getDb(db);
  const rid = toInt(id);
  if (!rid) return;

  await conn.query(
    `
      UPDATE password_resets
      SET used_at = NOW()
      WHERE id = $1
    `,
    [rid]
  );
}

/**
 * Invalida todos os tokens ativos de um usuário
 */
async function invalidateAllByUserId(userId, db) {
  const conn = getDb(db);
  const uid = toInt(userId);
  if (!uid) return 0;

  const result = await conn.query(
    `
      UPDATE password_resets
      SET used_at = NOW()
      WHERE user_id = $1
        AND used_at IS NULL
    `,
    [uid]
  );

  return Number(result?.rowCount ?? 0);
}

/**
 * Limpeza de segurança (opcional)
 */
async function cleanupExpired(db) {
  const conn = getDb(db);

  const result = await conn.query(
    `
      DELETE FROM password_resets
      WHERE
        expires_at <= NOW()
        OR (created_at <= NOW() - INTERVAL '7 days')
    `
  );

  return Number(result?.rowCount ?? 0);
}

/* ============================================================
   FUNÇÕES "COMPAT" (nomes esperados pelo controller)
   ============================================================ */

/**
 * cleanupPasswordResets -> alias de cleanupExpired
 */
async function cleanupPasswordResets(db) {
  return cleanupExpired(db);
}

/**
 * createPasswordReset({ userId, token, expiresAt })
 * - recebe token PURO
 * - salva token_hash (sha256)
 */
async function createPasswordReset({ userId, token, expiresAt }, db) {
  const tokenHash = hashToken(token);
  return createPasswordResetBase({ userId, tokenHash, expiresAt }, db);
}

/**
 * findValidPasswordResetByToken(token)
 * - recebe token PURO
 * - hasheia e busca por token_hash
 */
async function findValidPasswordResetByToken(token, db) {
  const tokenHash = hashToken(token);
  return findValidByTokenHash(tokenHash, db);
}

/**
 * markPasswordResetUsed -> alias de markUsed
 */
async function markPasswordResetUsed(id, db) {
  return markUsed(id, db);
}

/**
 * invalidateAllActiveByUserId -> alias de invalidateAllByUserId
 */
async function invalidateAllActiveByUserId(userId, db) {
  return invalidateAllByUserId(userId, db);
}

module.exports = {
  // Base (mantidas)
  createPasswordResetBase,
  findValidByTokenHash,
  markUsed,
  invalidateAllByUserId,
  cleanupExpired,

  // Compat (controller)
  cleanupPasswordResets,
  createPasswordReset,
  findValidPasswordResetByToken,
  markPasswordResetUsed,
  invalidateAllActiveByUserId,
};
