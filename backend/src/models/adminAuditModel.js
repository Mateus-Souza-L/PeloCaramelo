// backend/src/models/adminAuditModel.js
const pool = require("../config/db");

function toStr(v) {
  return v == null ? "" : String(v);
}

function cleanText(v, max = 500) {
  const s = toStr(v).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

async function createAdminAuditLog({
  adminUserId,   // string/number -> salva em admin_user_id (text)
  adminEmail,    // text
  actionType,    // text (ex: USER_BLOCKED)
  targetType,    // text (ex: user, reservation, review)
  targetId,      // text
  reason,        // text
  meta,          // objeto -> jsonb
}) {
  try {
    const sql = `
      insert into public.admin_audit_logs
        (admin_user_id, admin_email, action_type, target_type, target_id, reason, meta)
      values
        ($1, $2, $3, $4, $5, $6, $7::jsonb)
      returning *;
    `;

    const values = [
      cleanText(adminUserId, 120),
      cleanText(adminEmail, 255),
      cleanText(actionType, 120),
      cleanText(targetType, 120),
      cleanText(targetId, 120),
      cleanText(reason, 800),
      JSON.stringify(meta || {}),
    ];

    const { rows } = await pool.query(sql, values);
    return rows?.[0] || null;
  } catch (err) {
    // nunca derruba o fluxo do admin
    console.error("[ADMIN_AUDIT] createAdminAuditLog error:", err?.message || err);
    return null;
  }
}

module.exports = { createAdminAuditLog };
