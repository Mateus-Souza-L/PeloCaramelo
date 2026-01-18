// backend/src/models/passwordResetModel.js
const pool = require("../config/db");

function getDb(db) {
  return db && typeof db.query === "function" ? db : pool;
}

/**
 * Limpa tokens:
 * - expirados (expires_at <= NOW())
 * - usados (used = true)
 * - muito antigos (created_at <= NOW() - 7 dias)  [higiene extra]
 *
 * Retorna a quantidade removida (best-effort).
 */
async function cleanupPasswordResets(db) {
  const conn = getDb(db);

  const result = await conn.query(`
    DELETE FROM password_resets
    WHERE
      COALESCE(used, false) = true
      OR (expires_at IS NOT NULL AND expires_at <= NOW())
      OR (created_at IS NOT NULL AND created_at <= NOW() - INTERVAL '7 days')
  `);

  return Number(result?.rowCount ?? 0);
}

/**
 * Cria um token de reset
 * Obs: mantém compatível com sua tabela (token em texto).
 */
async function createPasswordReset({ userId, token, expiresAt }, db) {
  const conn = getDb(db);

  const result = await conn.query(
    `
    INSERT INTO password_resets (user_id, token, expires_at, used, created_at)
    VALUES ($1, $2, $3, false, NOW())
    RETURNING id, user_id, token, expires_at, used, created_at
    `,
    [userId, token, expiresAt]
  );

  return result.rows?.[0] || null;
}

/**
 * Busca token (ainda não usado e não expirado)
 */
async function findValidPasswordResetByToken(token, db) {
  const conn = getDb(db);

  const result = await conn.query(
    `
    SELECT *
    FROM password_resets
    WHERE token = $1
      AND COALESCE(used, false) = false
      AND (expires_at IS NULL OR expires_at > NOW())
    LIMIT 1
    `,
    [String(token)]
  );

  return result.rows?.[0] || null;
}

/**
 * Marca token como usado
 */
async function markPasswordResetUsed(id, db) {
  const conn = getDb(db);

  const result = await conn.query(
    `
    UPDATE password_resets
    SET used = true
    WHERE id = $1
    RETURNING id, used
    `,
    [Number(id)]
  );

  return result.rows?.[0] || null;
}

/**
 * Invalida todos tokens ativos do usuário (exceto opcionalmente um id)
 */
async function invalidateAllActiveByUserId(userId, exceptId = null, db) {
  const conn = getDb(db);

  if (exceptId) {
    const result = await conn.query(
      `
      UPDATE password_resets
      SET used = true
      WHERE user_id = $1
        AND COALESCE(used, false) = false
        AND id <> $2
      `,
      [Number(userId), Number(exceptId)]
    );
    return Number(result?.rowCount ?? 0);
  }

  const result = await conn.query(
    `
    UPDATE password_resets
    SET used = true
    WHERE user_id = $1
      AND COALESCE(used, false) = false
    `,
    [Number(userId)]
  );

  return Number(result?.rowCount ?? 0);
}

module.exports = {
  cleanupPasswordResets,
  createPasswordReset,
  findValidPasswordResetByToken,
  markPasswordResetUsed,
  invalidateAllActiveByUserId,
};
