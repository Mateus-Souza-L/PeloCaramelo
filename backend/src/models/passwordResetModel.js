const pool = require("../config/db");

function getDb(db) {
  return db && typeof db.query === "function" ? db : pool;
}

/**
 * Cria um reset de senha (salva SOMENTE o hash do token)
 */
async function createPasswordReset({ userId, tokenHash, expiresAt }, db) {
  const conn = getDb(db);

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
    [Number(userId), tokenHash, expiresAt]
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
    [tokenHash]
  );

  return result.rows[0] || null;
}

/**
 * Marca token como usado
 */
async function markUsed(id, db) {
  const conn = getDb(db);

  await conn.query(
    `
      UPDATE password_resets
      SET used_at = NOW()
      WHERE id = $1
    `,
    [Number(id)]
  );
}

/**
 * Invalida todos os tokens ativos de um usuário
 */
async function invalidateAllByUserId(userId, db) {
  const conn = getDb(db);

  const result = await conn.query(
    `
      UPDATE password_resets
      SET used_at = NOW()
      WHERE user_id = $1
        AND used_at IS NULL
    `,
    [Number(userId)]
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

module.exports = {
  createPasswordReset,
  findValidByTokenHash,
  markUsed,
  invalidateAllByUserId,
  cleanupExpired,
};
