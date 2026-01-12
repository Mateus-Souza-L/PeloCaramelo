// backend/src/controllers/adminController.js
const pool = require("../config/db");

function toStr(v) {
  return v == null ? "" : String(v);
}

function toBool(v) {
  return typeof v === "boolean" ? v : null;
}

async function tableExists(client, tableName) {
  const name = toStr(tableName).trim();
  if (!name) return false;

  // suporta "schema.table" e "table"
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

/**
 * Delete "best-effort" de dependências conhecidas:
 * - reservations (tutor_id/caregiver_id)
 * - pets (owner_id / tutor_id / user_id)
 * - chat/messages/notifications (se existirem)
 *
 * Não falha se a tabela não existir.
 */
async function deleteUserDependencies(client, userId) {
  const uid = toStr(userId);

  // 1) reservations
  if (await tableExists(client, "reservations")) {
    await client.query(
      `
      DELETE FROM reservations
      WHERE tutor_id::text = $1::text
         OR caregiver_id::text = $1::text;
      `,
      [uid]
    );
  }

  // 2) pets (tabelas comuns)
  if (await tableExists(client, "pets")) {
    // tenta colunas típicas: owner_id / tutor_id / user_id
    const attempts = [
      `DELETE FROM pets WHERE owner_id::text = $1::text;`,
      `DELETE FROM pets WHERE tutor_id::text = $1::text;`,
      `DELETE FROM pets WHERE user_id::text = $1::text;`,
    ];
    for (const sql of attempts) {
      try {
        await client.query(sql, [uid]);
      } catch (e) {
        // coluna não existe -> segue
        if (e?.code !== "42703") throw e; // undefined_column
      }
    }
  }

  // 3) availability (se existir)
  if (await tableExists(client, "availability")) {
    await client.query(`DELETE FROM availability WHERE caregiver_id::text = $1::text;`, [uid]);
  }

  // 4) messages (nomes comuns)
  if (await tableExists(client, "messages")) {
    const attempts = [
      `DELETE FROM messages WHERE sender_id::text = $1::text OR receiver_id::text = $1::text;`,
      `DELETE FROM messages WHERE user_id::text = $1::text;`,
    ];
    for (const sql of attempts) {
      try {
        await client.query(sql, [uid]);
      } catch (e) {
        if (e?.code !== "42703") throw e;
      }
    }
  }

  // chats
  if (await tableExists(client, "chats")) {
    const attempts = [
      `DELETE FROM chats WHERE tutor_id::text = $1::text OR caregiver_id::text = $1::text;`,
      `DELETE FROM chats WHERE user_id::text = $1::text;`,
    ];
    for (const sql of attempts) {
      try {
        await client.query(sql, [uid]);
      } catch (e) {
        if (e?.code !== "42703") throw e;
      }
    }
  }

  // notifications
  if (await tableExists(client, "notifications")) {
    const attempts = [
      `DELETE FROM notifications WHERE user_id::text = $1::text;`,
      `DELETE FROM notifications WHERE recipient_id::text = $1::text;`,
    ];
    for (const sql of attempts) {
      try {
        await client.query(sql, [uid]);
      } catch (e) {
        if (e?.code !== "42703") throw e;
      }
    }
  }
}

/* ===================== Usuários ===================== */

// LISTAR TODOS OS USUÁRIOS (para painel admin)
async function listUsersController(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT
        id,
        name,
        email,
        role,
        city,
        neighborhood,
        blocked AS is_blocked,         -- compat front
        blocked,                       -- original
        created_at
      FROM users
      ORDER BY created_at DESC;
    `);

    return res.json({ users: rows || [] });
  } catch (err) {
    console.error("Erro em GET /admin/users:", err);
    return res.status(500).json({ error: "Erro ao listar usuários." });
  }
}

// BLOQUEAR / DESBLOQUEAR USUÁRIO
// PATCH /admin/users/:id/block  { blocked: true/false }
async function setUserBlockedController(req, res) {
  try {
    const id = toStr(req.params?.id).trim();
    const blocked = toBool(req.body?.blocked);

    if (!id || blocked == null) {
      return res.status(400).json({
        error: "ID e flag 'blocked' (true/false) são obrigatórios.",
      });
    }

    // evitar que admin bloqueie a si mesmo
    if (toStr(req.user?.id) && toStr(req.user.id) === id) {
      return res.status(400).json({
        error: "Você não pode bloquear o próprio usuário admin.",
      });
    }

    const { rows } = await pool.query(
      `
      UPDATE users
      SET blocked = $2,
          updated_at = NOW()
      WHERE id::text = $1::text
      RETURNING id, name, email, role, blocked, blocked AS is_blocked;
      `,
      [id, blocked]
    );

    const user = rows?.[0] || null;
    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    return res.json({ user });
  } catch (err) {
    console.error("Erro em PATCH /admin/users/:id/block:", err);
    return res.status(500).json({ error: "Erro ao atualizar usuário." });
  }
}

// DELETAR USUÁRIO (ex: contas de teste)
async function deleteUserController(req, res) {
  const id = toStr(req.params?.id).trim();

  if (!id) {
    return res.status(400).json({ error: "ID é obrigatório." });
  }

  // evitar que admin delete a si mesmo
  if (toStr(req.user?.id) && toStr(req.user.id) === id) {
    return res.status(400).json({ error: "Você não pode excluir o próprio usuário admin." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) tenta limpar dependências (best-effort)
    await deleteUserDependencies(client, id);

    // 2) deleta o usuário
    const { rowCount } = await client.query(
      `
      DELETE FROM users
      WHERE id::text = $1::text;
      `,
      [id]
    );

    if (!rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    await client.query("COMMIT");
    return res.json({ success: true });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    // FK violation ainda pode acontecer se houver outra tabela não prevista
    if (err?.code === "23503") {
      return res.status(409).json({
        error:
          "Não foi possível excluir: existem dados relacionados a este usuário (FK). Exclua/ajuste os registros relacionados primeiro.",
      });
    }

    console.error("Erro em DELETE /admin/users/:id:", err);
    return res.status(500).json({ error: "Erro ao excluir usuário." });
  } finally {
    client.release();
  }
}

/* ===================== Reservas ===================== */

// LISTAR RESERVAS (para painel admin)
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
    console.error("Erro em GET /admin/reservations:", err);
    return res.status(500).json({ error: "Erro ao listar reservas." });
  }
}

// DELETAR RESERVA (de testes)
async function deleteReservationController(req, res) {
  try {
    const id = toStr(req.params?.id).trim();

    if (!id) {
      return res.status(400).json({ error: "ID é obrigatório." });
    }

    const { rowCount } = await pool.query(
      `
      DELETE FROM reservations
      WHERE id::text = $1::text;
      `,
      [id]
    );

    if (!rowCount) {
      return res.status(404).json({ error: "Reserva não encontrada." });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Erro em DELETE /admin/reservations/:id:", err);
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
