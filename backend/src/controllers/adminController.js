// backend/src/controllers/adminController.js
const pool = require("../config/db");
const { logAdminAction } = require("../services/adminAuditService");

/* Helpers */
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

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
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
    console.error(`[ADMIN safeExec] ${label}:`, pickPgErr(err));
    throw err;
  } finally {
    try {
      await client.query(`RELEASE SAVEPOINT ${sp};`);
    } catch {}
  }
}

function normalizeISO(v) {
  if (!v) return null;
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function parseBlockExtras(body) {
  const reason = toStr(body?.reason || "").trim();

  const blockedDaysRaw = body?.blockedDays ?? body?.blocked_days ?? body?.days ?? null;
  const blockedUntilRaw = body?.blockedUntil ?? body?.blocked_until ?? body?.until ?? null;

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
    await safeExec(
      client,
      "availability",
      `DELETE FROM availability WHERE caregiver_id::text = $1::text;`,
      [uid]
    );
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

/* ==========================================================
   GET /admin/users  ✅ agora com filtros + paginação
   Query: limit, offset, role, blocked=true/false, q
   ========================================================== */
async function listUsersController(req, res) {
  const client = await pool.connect();
  try {
    const hasAdminLevel = await columnExists(client, "users", "admin_level");
    const hasReason = await columnExists(client, "users", "blocked_reason");
    const hasUntil = await columnExists(client, "users", "blocked_until");

    const extraCols = [
      hasAdminLevel ? "admin_level" : "NULL::int AS admin_level",
      hasReason ? "blocked_reason" : "NULL::text AS blocked_reason",
      hasUntil ? "blocked_until" : "NULL::timestamptz AS blocked_until",
    ].join(",\n        ");

    const limit = clamp(toInt(req.query?.limit) ?? 50, 1, 200);
    const offset = Math.max(0, toInt(req.query?.offset) ?? 0);

    const roleRaw = toStr(req.query?.role).trim().toLowerCase();
    const role =
      roleRaw && roleRaw !== "all"
        ? roleRaw
        : null;

    const blockedRaw = toStr(req.query?.blocked).trim();
    const blocked = blockedRaw ? toBool(blockedRaw) : null;

    const q = toStr(req.query?.q).trim();
    const hasQ = !!q;

    const where = [];
    const params = [];
    let p = 1;

    if (role) {
      where.push(`LOWER(role) = $${p++}`);
      params.push(role);
    }

    if (blocked !== null) {
      where.push(`blocked = $${p++}`);
      params.push(blocked);
    }

    if (hasQ) {
      where.push(`(
        id::text ILIKE $${p} OR
        name ILIKE $${p} OR
        email ILIKE $${p} OR
        role ILIKE $${p}
      )`);
      params.push(`%${q}%`);
      p++;
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const sql = `
      SELECT
        id,
        name,
        email,
        role,
        ${extraCols},
        blocked,
        created_at
      FROM users
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${p++} OFFSET $${p++};
    `;

    params.push(limit, offset);

    const { rows } = await client.query(sql, params);

    return res.json({
      users: rows || [],
      limit,
      offset,
      meta: { returned: rows?.length || 0 },
    });
  } catch (err) {
    console.error("Erro em GET /admin/users:", pickPgErr(err));
    return res.status(500).json({ error: "Erro ao listar usuários." });
  } finally {
    client.release();
  }
}

/* PATCH /admin/users/:id/block */
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
        error: "Você não pode bloquear o próprio usuário.",
      });
    }

    const { reason, blockedUntil } = parseBlockExtras(req.body);

    const hasReason = await columnExists(client, "users", "blocked_reason");
    const hasUntil = await columnExists(client, "users", "blocked_until");
    const hasUpdatedAt = await columnExists(client, "users", "updated_at");
    const hasAdminLevel = await columnExists(client, "users", "admin_level");

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
      params.push(blocked ? reason : null);
      sets.push(`blocked_reason = $${p}`);
    }

    if (hasUntil) {
      const p = idx++;
      params.push(blocked ? normalizeISO(blockedUntil) : null);
      sets.push(`blocked_until = $${p}`);
    }

    if (hasUpdatedAt) sets.push(`updated_at = NOW()`);

    const returningCols = [
      "id",
      "name",
      "email",
      "role",
      "blocked",
      hasAdminLevel ? "admin_level" : "NULL::int AS admin_level",
      hasReason ? "blocked_reason" : "NULL::text AS blocked_reason",
      hasUntil ? "blocked_until" : "NULL::timestamptz AS blocked_until",
    ].join(", ");

    const { rows } = await client.query(
      `
      UPDATE users
      SET ${sets.join(",\n          ")}
      WHERE id::text = $${idParam}::text
      RETURNING ${returningCols};
      `,
      params
    );

    const user = rows?.[0] || null;
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    // ✅ AUDIT LOG (best-effort)
    await logAdminAction(req, blocked ? "USER_BLOCKED" : "USER_UNBLOCKED", {
      targetUserId: id,
      blocked,
      reason: blocked ? reason : null,
      blockedUntil: blocked ? normalizeISO(blockedUntil) : null,
    });

    return res.json({ user });
  } catch (err) {
    console.error("Erro em PATCH /admin/users/:id/block:", pickPgErr(err));
    return res.status(500).json({ error: "Erro ao atualizar usuário." });
  } finally {
    client.release();
  }
}

/* DELETE /admin/users/:id */
async function deleteUserController(req, res) {
  const id = toStr(req.params?.id).trim();
  if (!id) return res.status(400).json({ error: "ID é obrigatório." });

  if (toStr(req.user?.id) && toStr(req.user.id) === id) {
    return res.status(400).json({
      error: "Você não pode excluir o próprio usuário.",
    });
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

    // ✅ AUDIT LOG (best-effort)
    await logAdminAction(req, "USER_DELETED", { targetUserId: id });

    return res.json({ success: true });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    if (err?.code === "23503") {
      console.error("Erro em DELETE /admin/users/:id (FK):", pickPgErr(err));
      return res.status(409).json({
        error: "Não foi possível excluir: existem dados relacionados a este usuário (FK).",
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

/* ==========================================================
   GET /admin/reservations ✅ agora com filtros + paginação
   Query: limit, offset, status, service, q
   ========================================================== */
async function listReservationsController(req, res) {
  try {
    const limit = clamp(toInt(req.query?.limit) ?? 50, 1, 200);
    const offset = Math.max(0, toInt(req.query?.offset) ?? 0);

    const status = toStr(req.query?.status).trim();
    const statusFilter = status && status !== "all" ? status : null;

    const service = toStr(req.query?.service).trim();
    const serviceFilter = service && service !== "all" ? service : null;

    const q = toStr(req.query?.q).trim();
    const hasQ = !!q;

    const where = [];
    const params = [];
    let p = 1;

    if (statusFilter) {
      where.push(`r.status = $${p++}`);
      params.push(statusFilter);
    }

    if (serviceFilter) {
      where.push(`r.service = $${p++}`);
      params.push(serviceFilter);
    }

    if (hasQ) {
      where.push(`(
        r.id::text ILIKE $${p} OR
        COALESCE(t.name, r.tutor_name) ILIKE $${p} OR
        COALESCE(c.name, r.caregiver_name) ILIKE $${p} OR
        r.service ILIKE $${p} OR
        r.status ILIKE $${p}
      )`);
      params.push(`%${q}%`);
      p++;
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const sql = `
      SELECT
        r.*,
        COALESCE(t.name, r.tutor_name)      AS tutor_name,
        COALESCE(c.name, r.caregiver_name)  AS caregiver_name
      FROM reservations r
      LEFT JOIN users t ON t.id = r.tutor_id
      LEFT JOIN users c ON c.id = r.caregiver_id
      ${whereSql}
      ORDER BY r.created_at DESC NULLS LAST, r.id DESC
      LIMIT $${p++} OFFSET $${p++};
    `;

    params.push(limit, offset);

    const { rows } = await pool.query(sql, params);

    return res.json({
      reservations: rows || [],
      limit,
      offset,
      meta: { returned: rows?.length || 0 },
    });
  } catch (err) {
    console.error("Erro em GET /admin/reservations:", pickPgErr(err));
    return res.status(500).json({ error: "Erro ao listar reservas." });
  }
}

/* DELETE /admin/reservations/:id */
async function deleteReservationController(req, res) {
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

    // ✅ AUDIT LOG (best-effort)
    await logAdminAction(req, "RESERVATION_DELETED", { reservationId: id });

    return res.json({ success: true });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    if (err?.code === "23503") {
      console.error("Erro em DELETE /admin/reservations/:id (FK):", pickPgErr(err));
      return res.status(409).json({
        error: "Não foi possível excluir a reserva: existem dados relacionados (FK).",
        pg: pickPgErr(err),
      });
    }

    console.error("Erro em DELETE /admin/reservations/:id:", pickPgErr(err));
    return res.status(500).json({
      error: "Erro ao excluir reserva.",
      pg: pickPgErr(err),
    });
  } finally {
    client.release();
  }
}

/* POST /admin/create-admin
   - promove um usuário existente (por email) para role=admin
   - ideal: proteger a rota com adminMasterMiddleware no routes
*/
async function createAdminController(req, res) {
  const client = await pool.connect();
  try {
    const requesterRole = String(req.user?.role || "").toLowerCase().trim();
    if (requesterRole !== "admin_master") {
      return res.status(403).json({
        error: "Apenas o admin principal pode criar novos admins.",
        code: "FORBIDDEN_ADMIN_MASTER_ONLY",
      });
    }

    const email = toStr(req.body?.email).toLowerCase().trim();
    if (!email) {
      return res.status(400).json({ error: "Email é obrigatório." });
    }

    const hasAdminLevel = await columnExists(client, "users", "admin_level");
    const sets = [`role = 'admin'`];

    if (hasAdminLevel) sets.push(`admin_level = COALESCE(admin_level, 2)`);

    const { rows } = await client.query(
      `
      UPDATE users
      SET ${sets.join(", ")}
      WHERE email = $1
      RETURNING id, name, email, role
        ${hasAdminLevel ? ", admin_level" : ""};
      `,
      [email]
    );

    if (!rows?.length) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    // ✅ AUDIT LOG (best-effort)
    await logAdminAction(req, "ADMIN_CREATED", {
      promotedEmail: email,
      promotedUserId: rows?.[0]?.id || null,
    });

    return res.json({ admin: rows[0] });
  } catch (err) {
    console.error("Erro em POST /admin/create-admin:", pickPgErr(err));
    return res.status(500).json({ error: "Erro ao criar admin." });
  } finally {
    client.release();
  }
}

/* PATCH /admin/users/:id/role
   - Somente admin_master (rota já está protegida por adminMasterMiddleware)
   - Permite voltar admin -> tutor (o que você quer)
   - Não permite criar admin_master
*/
async function setUserRoleController(req, res) {
  const client = await pool.connect();
  try {
    const requesterRole = String(req.user?.role || "").toLowerCase().trim();
    if (requesterRole !== "admin_master") {
      return res.status(403).json({
        error: "Apenas o admin master pode alterar roles.",
        code: "FORBIDDEN_ADMIN_MASTER_ONLY",
      });
    }

    const id = toStr(req.params?.id).trim();
    if (!id) return res.status(400).json({ error: "ID é obrigatório." });

    // não mexe em si mesmo (evita se trancar)
    if (toStr(req.user?.id) && toStr(req.user.id) === id) {
      return res.status(400).json({ error: "Você não pode alterar sua própria role." });
    }

    const roleRaw = toStr(req.body?.role).toLowerCase().trim();
    const allowed = new Set(["tutor", "caregiver", "admin"]);
    if (!allowed.has(roleRaw)) {
      return res.status(400).json({
        error: "Role inválida. Use: tutor, caregiver ou admin.",
      });
    }

    // bloqueia qualquer tentativa de elevar alguém acima do master
    if (roleRaw === "admin_master") {
      return res.status(400).json({ error: "Não é permitido definir role como admin_master." });
    }

    // não permite alterar o admin_master alvo (se existir alguém assim no banco)
    const { rows: targetRows } = await client.query(
      `SELECT id, role FROM users WHERE id::text = $1::text LIMIT 1;`,
      [id]
    );
    const target = targetRows?.[0] || null;
    if (!target) return res.status(404).json({ error: "Usuário não encontrado." });

    const targetRole = String(target.role || "").toLowerCase().trim();
    if (targetRole === "admin_master") {
      return res.status(403).json({ error: "Não é permitido alterar o admin_master." });
    }

    const hasAdminLevel = await columnExists(client, "users", "admin_level");
    const hasUpdatedAt = await columnExists(client, "users", "updated_at");

    const sets = [];
    const params = [];
    let idx = 1;

    params.push(roleRaw);
    sets.push(`role = $${idx++}`);

    // Se virar admin: admin_level = 2 (se tiver coluna)
    // Se voltar pra tutor/caregiver: zera admin_level (se tiver coluna)
    if (hasAdminLevel) {
      if (roleRaw === "admin") sets.push(`admin_level = COALESCE(admin_level, 2)`);
      else sets.push(`admin_level = NULL`);
    }

    if (hasUpdatedAt) sets.push(`updated_at = NOW()`);

    params.push(id);
    const idParam = idx++;

    const returningCols = [
      "id",
      "name",
      "email",
      "role",
      "blocked",
      hasAdminLevel ? "admin_level" : "NULL::int AS admin_level",
      (await columnExists(client, "users", "blocked_reason"))
        ? "blocked_reason"
        : "NULL::text AS blocked_reason",
      (await columnExists(client, "users", "blocked_until"))
        ? "blocked_until"
        : "NULL::timestamptz AS blocked_until",
      "created_at",
    ].join(", ");

    const { rows } = await client.query(
      `
      UPDATE users
      SET ${sets.join(", ")}
      WHERE id::text = $${idParam}::text
      RETURNING ${returningCols};
      `,
      params
    );

    const user = rows?.[0] || null;
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

    // ✅ AUDIT LOG (best-effort)
    await logAdminAction(req, "USER_ROLE_CHANGED", {
      targetUserId: id,
      newRole: roleRaw,
    });

    return res.json({ user });
  } catch (err) {
    console.error("Erro em PATCH /admin/users/:id/role:", pickPgErr(err));
    return res.status(500).json({ error: "Erro ao alterar role do usuário." });
  } finally {
    client.release();
  }
}

/* GET /admin/audit-logs */
async function listAuditLogsController(req, res) {
  const limit = Math.min(Math.max(Number(req.query?.limit || 50), 1), 200);
  const offset = Math.max(Number(req.query?.offset || 0), 0);

  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        created_at,
        admin_id,
        admin_email,
        admin_role,
        action_type,
        target_type,
        target_id,
        reason,
        meta
      FROM public.admin_audit_logs
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2;
      `,
      [limit, offset]
    );

    return res.json({ logs: rows || [], limit, offset });
  } catch (err) {
    console.error("Erro em GET /admin/audit-logs:", pickPgErr(err));
    return res.status(500).json({ error: "Erro ao listar audit logs." });
  }
}

module.exports = {
  listUsersController,
  setUserBlockedController,
  deleteUserController,
  listReservationsController,
  deleteReservationController,
  createAdminController,
  setUserRoleController,
  listAuditLogsController,
};
