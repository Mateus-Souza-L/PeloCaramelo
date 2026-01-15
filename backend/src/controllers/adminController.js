// backend/src/controllers/adminController.js
const pool = require("../config/db");

function toStr(v) {
  return v == null ? "" : String(v);
}

function toBool(v) {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return null;
}

function pickPgErr(err) {
  if (!err) return null;
  return {
    message: err.message,
    code: err.code,
    detail: err.detail,
    hint: err.hint,
    table: err.table,
    column: err.column,
    constraint: err.constraint,
    where: err.where,
    schema: err.schema,
    routine: err.routine,
  };
}

async function tableExists(client, tableName) {
  const name = toStr(tableName).trim();
  if (!name) return false;

  const [schema, table] = name.includes(".") ? name.split(".") : ["public", name];

  const { rows } = await client.query(
    `
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = $1
      AND table_name = $2
    LIMIT 1;
    `,
    [schema, table]
  );

  return !!rows?.[0];
}

async function columnExists(client, tableName, columnName) {
  const table = toStr(tableName).trim();
  const col = toStr(columnName).trim();
  if (!table || !col) return false;

  const [schema, tbl] = table.includes(".") ? table.split(".") : ["public", table];

  const { rows } = await client.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = $1
      AND table_name = $2
      AND column_name = $3
    LIMIT 1;
    `,
    [schema, tbl, col]
  );

  return !!rows?.[0];
}

async function safeExec(client, label, sql, params = []) {
  const sp = `sp_${label.replace(/[^a-zA-Z0-9_]/g, "_")}_${Date.now()}`;
  await client.query(`SAVEPOINT ${sp};`);
  try {
    return await client.query(sql, params);
  } catch (err) {
    // tabela/coluna ausente (best-effort)
    if (err?.code === "42703" || err?.code === "42P01") {
      await client.query(`ROLLBACK TO SAVEPOINT ${sp};`);
      return null;
    }

    await client.query(`ROLLBACK TO SAVEPOINT ${sp};`);
    console.error(`[ADMIN delete deps] ${label} ERRO REAL:`, pickPgErr(err));
    throw err;
  } finally {
    try {
      await client.query(`RELEASE SAVEPOINT ${sp};`);
    } catch {}
  }
}

/**
 * body (bloqueio):
 * - reason: string
 * - blockedUntil: ISO/date (ex: "2026-02-01" ou "2026-02-01T12:00:00Z")
 * - blockedDays: número de dias (ex: 7)
 */
function parseBlockExtras(body) {
  const reason = toStr(body?.reason || "").trim();
  const blockedDaysRaw = body?.blockedDays;
  const blockedUntilRaw = body?.blockedUntil;

  let blockedUntil = null;

  if (blockedUntilRaw) {
    const dt = new Date(blockedUntilRaw);
    if (!Number.isNaN(dt.getTime())) blockedUntil = dt.toISOString();
  }

  if (!blockedUntil && blockedDaysRaw != null) {
    const n = Number(blockedDaysRaw);
    if (Number.isFinite(n) && n > 0) {
      const dt = new Date();
      dt.setDate(dt.getDate() + Math.floor(n));
      blockedUntil = dt.toISOString();
    }
  }

  return {
    reason: reason || null,
    blockedUntil,
  };
}

async function deleteUserDependencies(client, userId) {
  const uid = toStr(userId).trim();

  if (await tableExists(client, "reviews")) {
    const attempts = [
      `DELETE FROM reviews WHERE tutor_id::text = $1::text;`,
      `DELETE FROM reviews WHERE caregiver_id::text = $1::text;`,
      `DELETE FROM reviews WHERE reviewer_id::text = $1::text;`,
      `DELETE FROM reviews WHERE reviewed_id::text = $1::text;`,
      `DELETE FROM reviews WHERE user_id::text = $1::text;`,
    ];
    for (let i = 0; i < attempts.length; i++) {
      await safeExec(client, `reviews_${i}`, attempts[i], [uid]);
    }
  }

  if (await tableExists(client, "messages")) {
    const attempts = [
      `DELETE FROM messages WHERE sender_id::text = $1::text OR receiver_id::text = $1::text;`,
      `DELETE FROM messages WHERE user_id::text = $1::text;`,
      `DELETE FROM messages WHERE tutor_id::text = $1::text OR caregiver_id::text = $1::text;`,
      `DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE tutor_id::text = $1::text OR caregiver_id::text = $1::text);`,
    ];
    for (let i = 0; i < attempts.length; i++) {
      await safeExec(client, `messages_${i}`, attempts[i], [uid]);
    }
  }

  if (await tableExists(client, "notifications")) {
    const attempts = [
      `DELETE FROM notifications WHERE user_id::text = $1::text;`,
      `DELETE FROM notifications WHERE recipient_id::text = $1::text;`,
      `DELETE FROM notifications WHERE sender_id::text = $1::text;`,
    ];
    for (let i = 0; i < attempts.length; i++) {
      await safeExec(client, `notifications_${i}`, attempts[i], [uid]);
    }
  }

  if (await tableExists(client, "chats")) {
    const attempts = [
      `DELETE FROM chats WHERE tutor_id::text = $1::text OR caregiver_id::text = $1::text;`,
      `DELETE FROM chats WHERE user_id::text = $1::text;`,
    ];
    for (let i = 0; i < attempts.length; i++) {
      await safeExec(client, `chats_${i}`, attempts[i], [uid]);
    }
  }

  if (await tableExists(client, "availability")) {
    await safeExec(client, "availability", `DELETE FROM availability WHERE caregiver_id::text = $1::text;`, [uid]);
  }

  if (await tableExists(client, "reservations")) {
    if (await tableExists(client, "reviews")) {
      await safeExec(
        client,
        "reviews_by_res",
        `DELETE FROM reviews WHERE reservation_id IN (
          SELECT id FROM reservations WHERE tutor_id::text = $1::text OR caregiver_id::text = $1::text
        );`,
        [uid]
      );
    }

    await safeExec(
      client,
      "reservations",
      `
      DELETE FROM reservations
      WHERE tutor_id::text = $1::text
         OR caregiver_id::text = $1::text;
      `,
      [uid]
    );
  }

  if (await tableExists(client, "pets")) {
    const attempts = [
      `DELETE FROM pets WHERE owner_id::text = $1::text;`,
      `DELETE FROM pets WHERE tutor_id::text = $1::text;`,
      `DELETE FROM pets WHERE user_id::text = $1::text;`,
    ];
    for (let i = 0; i < attempts.length; i++) {
      await safeExec(client, `pets_${i}`, attempts[i], [uid]);
    }
  }
}

/* ===================== Usuários ===================== */

async function listUsersController(req, res) {
  const client = await pool.connect();
  try {
    const hasReason = await columnExists(client, "users", "blocked_reason");
    const hasUntil = await columnExists(client, "users", "blocked_until");

    const extraCols = [
      hasReason ? "blocked_reason" : "NULL::text AS blocked_reason",
      hasUntil ? "blocked_until" : "NULL::timestamptz AS blocked_until",
    ].join(",\n        ");

    const { rows } = await client.query(`
      SELECT
        id,
        name,
        email,
        role,
        city,
        neighborhood,
        blocked AS is_blocked,
        blocked,
        ${extraCols},
        created_at
      FROM users
      ORDER BY created_at DESC;
    `);

    return res.json({ users: rows || [] });
  } catch (err) {
    console.error("Erro em GET /admin/users:", pickPgErr(err));
    return res.status(500).json({ error: "Erro ao listar usuários." });
  } finally {
    client.release();
  }
}

// PATCH /admin/users/:id/block
// body: { blocked: true/false, reason?: string, blockedUntil?: string, blockedDays?: number }
async function setUserBlockedController(req, res) {
  const client = await pool.connect();
  try {
    const id = toStr(req.params?.id).trim();
    const blocked = toBool(req.body?.blocked);

    if (!id || blocked == null) {
      return res.status(400).json({
        error: "ID e flag 'blocked' (true/false) são obrigatórios.",
      });
    }

    if (toStr(req.user?.id) && toStr(req.user.id) === id) {
      return res.status(400).json({
        error: "Você não pode bloquear o próprio usuário admin.",
      });
    }

    const { reason, blockedUntil } = parseBlockExtras(req.body);

    const finalReason = blocked ? reason : null;
    const finalUntil = blocked ? blockedUntil : null;

    const hasReason = await columnExists(client, "users", "blocked_reason");
    const hasUntil = await columnExists(client, "users", "blocked_until");
    const hasUpdatedAt = await columnExists(client, "users", "updated_at");

    const sets = [];
    const params = [];
    let idx = 1;

    const idParam = idx++;
    params.push(id);

    const blockedParam = idx++;
    params.push(blocked);
    sets.push(`blocked = $${blockedParam}`);

    if (hasReason) {
      const p = idx++;
      params.push(finalReason);
      sets.push(`blocked_reason = $${p}`);
    }

    if (hasUntil) {
      const p = idx++;
      params.push(finalUntil);
      sets.push(`blocked_until = $${p}`);
    }

    if (hasUpdatedAt) {
      sets.push(`updated_at = NOW()`);
    }

    const { rows } = await client.query(
      `
      UPDATE users
      SET ${sets.join(",\n          ")}
      WHERE id::text = $${idParam}::text
      RETURNING
        id, name, email, role, blocked, blocked AS is_blocked
        ${hasReason ? ", blocked_reason" : ""}
        ${hasUntil ? ", blocked_until" : ""};
      `,
      params
    );

    const user = rows?.[0] || null;
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    // ✅ sempre devolve os campos, mesmo se coluna não existir (front fica estável)
    if (!hasReason) user.blocked_reason = null;
    if (!hasUntil) user.blocked_until = null;

    return res.json({ user });
  } catch (err) {
    console.error("Erro em PATCH /admin/users/:id/block:", pickPgErr(err));
    return res.status(500).json({ error: "Erro ao atualizar usuário." });
  } finally {
    client.release();
  }
}

async function deleteUserController(req, res) {
  const id = toStr(req.params?.id).trim();

  if (!id) return res.status(400).json({ error: "ID é obrigatório." });

  if (toStr(req.user?.id) && toStr(req.user.id) === id) {
    return res.status(400).json({ error: "Você não pode excluir o próprio usuário admin." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await deleteUserDependencies(client, id);

    const del = await client.query(
      `
      DELETE FROM users
      WHERE id::text = $1::text
      RETURNING id;
      `,
      [id]
    );

    if (!del.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    await client.query("COMMIT");
    return res.json({ success: true });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    if (err?.code === "23503") {
      console.error("Erro em DELETE /admin/users/:id (FK):", pickPgErr(err));
      return res.status(409).json({
        error:
          "Não foi possível excluir: existem dados relacionados a este usuário (FK). Exclua/ajuste os registros relacionados primeiro.",
        pg: pickPgErr(err),
      });
    }

    console.error("Erro em DELETE /admin/users/:id:", pickPgErr(err));
    return res.status(500).json({
      error: "Erro ao excluir usuário.",
      pg: pickPgErr(err),
    });
  } finally {
    client.release();
  }
}

/* ===================== Reservas ===================== */

async function listReservationsController(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT
        r.*,
        COALESCE(t.name, r.tutor_name)     AS tutor_name,
        COALESCE(c.name, r.caregiver_name) AS caregiver_name
      FROM reservations r
      LEFT JOIN users t ON t.id = r.tutor_id
      LEFT JOIN users c ON c.id = r.caregiver_id
      ORDER BY r.created_at DESC;
    `);

    return res.json({ reservations: rows || [] });
  } catch (err) {
    console.error("Erro em GET /admin/reservations:", pickPgErr(err));
    return res.status(500).json({ error: "Erro ao listar reservas." });
  }
}

async function deleteReservationController(req, res) {
  try {
    const id = toStr(req.params?.id).trim();
    if (!id) return res.status(400).json({ error: "ID é obrigatório." });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (await tableExists(client, "reviews")) {
        await safeExec(
          client,
          "reviews_by_reservation",
          `DELETE FROM reviews WHERE reservation_id::text = $1::text;`,
          [id]
        );
      }

      const { rowCount } = await client.query(
        `
        DELETE FROM reservations
        WHERE id::text = $1::text;
        `,
        [id]
      );

      if (!rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Reserva não encontrada." });
      }

      await client.query("COMMIT");
      return res.json({ success: true });
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {}

      if (err?.code === "23503") {
        console.error("Erro em DELETE /admin/reservations/:id (FK):", pickPgErr(err));
        return res.status(409).json({
          error:
            "Não foi possível excluir a reserva: existem dados relacionados (FK). Exclua/ajuste os registros relacionados primeiro.",
          pg: pickPgErr(err),
        });
      }

      console.error("Erro em DELETE /admin/reservations/:id:", pickPgErr(err));
      return res.status(500).json({ error: "Erro ao excluir reserva.", pg: pickPgErr(err) });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Erro em DELETE /admin/reservations/:id:", pickPgErr(err));
    return res.status(500).json({ error: "Erro ao excluir reserva." });
  }
}

module.exports = {
  listUsersController,
  setUserBlockedController,
  deleteUserController,
  listReservationsController,
  deleteReservationController,
};
