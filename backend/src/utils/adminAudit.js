// backend/src/utils/adminAudit.js
// =======================================================
// Admin Audit Log (DB) — PeloCaramelo
// - Registra ações administrativas em public.admin_audit_logs
// - Para usar: await auditLog(pool, { ... })
// =======================================================

const ACTIONS = Object.freeze({
  USER_BLOCK: "USER_BLOCK",
  USER_UNBLOCK: "USER_UNBLOCK",
  USER_ROLE_CHANGE: "ROLE_CHANGE",

  RES_STATUS_CHANGE: "RES_STATUS_CHANGE",
  RES_CANCEL: "RES_CANCEL",
  RES_COMPLETE: "RES_COMPLETE",

  REVIEW_HIDE: "REVIEW_HIDE",
  REVIEW_UNHIDE: "REVIEW_UNHIDE",

  ADMIN_NOTE: "ADMIN_NOTE",
});

function toStr(v) {
  return v == null ? "" : String(v);
}

function safeJson(v) {
  try {
    if (!v) return {};
    if (typeof v === "object") return v;
    return { value: v };
  } catch {
    return {};
  }
}

/**
 * Registra uma ação no log.
 *
 * @param {import("pg").Pool} pool
 * @param {Object} payload
 * @param {string} payload.adminId            UUID do admin (obrigatório)
 * @param {string} [payload.adminEmail]       email do admin (snapshot opcional)
 * @param {string} payload.actionType         use ACTIONS.*
 * @param {string} payload.targetType         'user' | 'reservation' | 'review' | etc
 * @param {string|number} payload.targetId    id do alvo (uuid/int) -> salvamos como text
 * @param {string} [payload.reason]           motivo (quando houver)
 * @param {Object} [payload.meta]             JSON livre (ex.: { before, after, ip, ... })
 * @param {boolean} [payload.strict=false]    se true, falha a request se log falhar
 */
async function auditLog(
  pool,
  { adminId, adminEmail, actionType, targetType, targetId, reason, meta, strict = false }
) {
  const admin_id = toStr(adminId).trim();
  const action_type = toStr(actionType).trim();
  const target_type = toStr(targetType).trim();
  const target_id = toStr(targetId).trim();

  if (!admin_id || !action_type || !target_type || !target_id) {
    const err = new Error(
      "auditLog: adminId/actionType/targetType/targetId são obrigatórios."
    );
    if (strict) throw err;
    return { ok: false, ignored: true, error: err.message };
  }

  const admin_email = toStr(adminEmail).trim() || null;
  const reason_text = toStr(reason).trim() || null;
  const meta_json = safeJson(meta);

  const q = `
    INSERT INTO public.admin_audit_logs
      (admin_id, admin_email, action_type, target_type, target_id, reason, meta)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7::jsonb)
    RETURNING id, created_at
  `;

  try {
    const { rows } = await pool.query(q, [
      admin_id,
      admin_email,
      action_type,
      target_type,
      target_id,
      reason_text,
      JSON.stringify(meta_json),
    ]);

    return { ok: true, id: rows?.[0]?.id, createdAt: rows?.[0]?.created_at };
  } catch (e) {
    if (strict) throw e;
    // Não derruba a ação do admin se o log falhar (mas você pode colocar strict=true em ações críticas)
    return { ok: false, error: e?.message || "Falha ao registrar audit log." };
  }
}

module.exports = {
  ACTIONS,
  auditLog,
};
