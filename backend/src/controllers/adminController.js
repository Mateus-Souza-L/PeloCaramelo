// backend/src/controllers/adminController.js
const pool = require("../config/db");

/* =====================================================
   Helpers básicos
===================================================== */

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
  };
}

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
      AND column_name = $2
    LIMIT 1;
    `,
    [table, column]
  );
  return !!rows?.[0];
}

/* =====================================================
   USUÁRIOS
===================================================== */

async function listUsersController(req, res) {
  const client = await pool.connect();
  try {
    const hasAdminLevel = await columnExists(client, "users", "admin_level");

    const { rows } = await client.query(`
      SELECT
        id,
        name,
        email,
        role,
        ${hasAdminLevel ? "admin_level" : "NULL AS admin_level"},
        blocked,
        blocked_reason,
        blocked_until,
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

/* =====================================================
   BLOQUEIO / DESBLOQUEIO
===================================================== */

async function setUserBlockedController(req, res) {
  const client = await pool.connect();
  try {
    const id = toStr(req.params?.id).trim();
    const blocked = toBool(req.body?.blocked);

    if (!id || blocked == null) {
      return res.status(400).json({ error: "ID e blocked são obrigatórios." });
    }

    if (req.user.id === id) {
      return res.status(400).json({ error: "Você não pode se bloquear." });
    }

    const { rows } = await client.query(
      `
      UPDATE users
      SET
        blocked = $1,
        blocked_reason = $2,
        blocked_until = $3
      WHERE id::text = $4::text
      RETURNING id, name, email, blocked, blocked_reason, blocked_until;
      `,
      [
        blocked,
        blocked ? toStr(req.body?.reason || null) : null,
        blocked ? req.body?.blockedUntil || null : null,
        id,
      ]
    );

    if (!rows?.length) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    return res.json({ user: rows[0] });
  } catch (err) {
    console.error("Erro em PATCH /admin/users/:id/block:", pickPgErr(err));
    return res.status(500).json({ error: "Erro ao atualizar usuário." });
  } finally {
    client.release();
  }
}

/* =====================================================
   EXCLUSÃO DE USUÁRIO
===================================================== */

async function deleteUserController(req, res) {
  const id = toStr(req.params?.id).trim();
  if (!id) return res.status(400).json({ error: "ID obrigatório." });

  if (req.user.id === id) {
    return res.status(400).json({ error: "Você não pode se excluir." });
  }

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM users WHERE id::text = $1::text;`,
      [id]
    );

    if (!rowCount) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Erro em DELETE /admin/users/:id:", pickPgErr(err));
    return res.status(500).json({ error: "Erro ao excluir usuário." });
  }
}

/* =====================================================
   RESERVAS
===================================================== */

async function listReservationsController(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT
        r.*,
        t.name AS tutor_name,
        c.name AS caregiver_name
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
  const id = toStr(req.params?.id).trim();
  if (!id) return res.status(400).json({ error: "ID obrigatório." });

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM reservations WHERE id::text = $1::text;`,
      [id]
    );

    if (!rowCount) {
      return res.status(404).json({ error: "Reserva não encontrada." });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Erro em DELETE /admin/reservations/:id:", pickPgErr(err));
    return res.status(500).json({ error: "Erro ao excluir reserva." });
  }
}

/* =====================================================
   🔐 PASSO 5 — CRIAR ADMIN SECUNDÁRIO
===================================================== */

async function createAdminController(req, res) {
  const client = await pool.connect();
  try {
    const requesterId = req.user.id;

    // 🔒 só admin_level 1 pode criar admin
    const { rows: me } = await client.query(
      `SELECT admin_level FROM users WHERE id::text = $1::text;`,
      [requesterId]
    );

    if (!me?.[0] || me[0].admin_level !== 1) {
      return res.status(403).json({
        error: "Apenas o admin principal pode criar novos admins.",
      });
    }

    const email = toStr(req.body?.email).toLowerCase().trim();
    if (!email) {
      return res.status(400).json({ error: "Email é obrigatório." });
    }

    const { rows } = await client.query(
      `
      UPDATE users
      SET role = 'admin',
          admin_level = 2
      WHERE email = $1
      RETURNING id, name, email, role, admin_level;
      `,
      [email]
    );

    if (!rows?.length) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    return res.json({ admin: rows[0] });
  } catch (err) {
    console.error("Erro em POST /admin/create-admin:", pickPgErr(err));
    return res.status(500).json({ error: "Erro ao criar admin." });
  } finally {
    client.release();
  }
}

/* =====================================================
   EXPORTS
===================================================== */

module.exports = {
  listUsersController,
  setUserBlockedController,
  deleteUserController,
  listReservationsController,
  deleteReservationController,
  createAdminController,
};
