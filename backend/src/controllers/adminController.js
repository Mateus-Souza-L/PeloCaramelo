// backend/src/controllers/adminController.js
const pool = require("../config/db");

function toStr(v) {
  return v == null ? "" : String(v);
}

function toBool(v) {
  return typeof v === "boolean" ? v : null;
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

async function safeExec(client, label, sql, params = []) {
  // ✅ protege a transação: se UMA query falhar, não deixa a transação “morrer” com 25P02
  const sp = `sp_${label.replace(/[^a-zA-Z0-9_]/g, "_")}_${Date.now()}`;
  await client.query(`SAVEPOINT ${sp};`);
  try {
    return await client.query(sql, params);
  } catch (err) {
    // tabelas/colunas ausentes (best-effort)
    if (err?.code === "42703" || err?.code === "42P01") {
      await client.query(`ROLLBACK TO SAVEPOINT ${sp};`);
      return null;
    }

    // FK pode acontecer dependendo do seu schema.
    // Não vamos engolir FK aqui, porque pode indicar ordem errada / dependência não tratada.
    // Mas antes de estourar, fazemos rollback até o savepoint pra evitar 25P02.
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
 * Delete "best-effort" de dependências conhecidas.
 * A ordem aqui importa (filhos -> pais) pra evitar FK.
 */
async function deleteUserDependencies(client, userId) {
  const uid = toStr(userId).trim();

  // ---------------------------------------------------------
  // 0) Reviews (normalmente referenciam users e/ou reservations)
  // ---------------------------------------------------------
  if (await tableExists(client, "reviews")) {
    // tenta colunas típicas do seu projeto
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

  // ---------------------------------------------------------
  // 1) Messages / Chats / Notifications (filhos antes de pais)
  // ---------------------------------------------------------
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

  // ---------------------------------------------------------
  // 2) Availability
  // ---------------------------------------------------------
  if (await tableExists(client, "availability")) {
    await safeExec(
      client,
      "availability",
      `DELETE FROM availability WHERE caregiver_id::text = $1::text;`,
      [uid]
    );
  }

  // ---------------------------------------------------------
  // 3) Reservations (depois de reviews)
  // ---------------------------------------------------------
  if (await tableExists(client, "reservations")) {
    // Se reviews tiver reservation_id FK, isso ajuda:
    if (await tableExists(client, "reviews")) {
      const attempts = [
        `DELETE FROM reviews WHERE reservation_id IN (
          SELECT id FROM reservations WHERE tutor_id::text = $1::text OR caregiver_id::text = $1::text
        );`,
      ];
      for (let i = 0; i < attempts.length; i++) {
        await safeExec(client, `reviews_by_res_${i}`, attempts[i], [uid]);
      }
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

  // ---------------------------------------------------------
  // 4) Pets
  // ---------------------------------------------------------
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
        blocked AS is_blocked,
        blocked,
        created_at
      FROM users
      ORDER BY created_at DESC;
    `);

    return res.json({ users: rows || [] });
  } catch (err) {
    console.error("Erro em GET /admin/users:", pickPgErr(err));
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

    if (toStr(req.user?.id) && toStr(req.user.id) === id) {
      return res.status(400).json({
        error: "Você não pode bloquear o próprio usuário admin.",
      });
    }

    // tenta com updated_at; se a coluna não existir, cai no fallback
    try {
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
      if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

      return res.json({ user });
    } catch (err) {
      if (err?.code !== "42703") throw err;

      const { rows } = await pool.query(
        `
        UPDATE users
        SET blocked = $2
        WHERE id::text = $1::text
        RETURNING id, name, email, role, blocked, blocked AS is_blocked;
        `,
        [id, blocked]
      );

      const user = rows?.[0] || null;
      if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

      return res.json({ user });
    }
  } catch (err) {
    console.error("Erro em PATCH /admin/users/:id/block:", pickPgErr(err));
    return res.status(500).json({ error: "Erro ao atualizar usuário." });
  }
}

// DELETAR USUÁRIO (ex: contas de teste)
async function deleteUserController(req, res) {
  const id = toStr(req.params?.id).trim();

  if (!id) return res.status(400).json({ error: "ID é obrigatório." });

  if (toStr(req.user?.id) && toStr(req.user.id) === id) {
    return res.status(400).json({ error: "Você não pode excluir o próprio usuário admin." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) limpa dependências (best-effort, mas com SAVEPOINT por etapa pra não dar 25P02)
    await deleteUserDependencies(client, id);

    // 2) deleta o usuário
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
    // ✅ sempre rollback pra não ficar “transação abortada”
    try {
      await client.query("ROLLBACK");
    } catch {}

    // FK violation
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
    console.error("Erro em GET /admin/reservations:", pickPgErr(err));
    return res.status(500).json({ error: "Erro ao listar reservas." });
  }
}

// DELETAR RESERVA (de testes)
async function deleteReservationController(req, res) {
  try {
    const id = toStr(req.params?.id).trim();
    if (!id) return res.status(400).json({ error: "ID é obrigatório." });

    // se existir reviews com FK pra reservations, tenta apagar primeiro
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
