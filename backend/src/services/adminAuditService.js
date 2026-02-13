// backend/src/services/adminAuditService.js
const pool = require("../config/db");

function toStr(v) {
  return v == null ? "" : String(v);
}

function safeJson(v) {
  try {
    if (v == null) return null;
    // já é objeto
    if (typeof v === "object") return v;
    // tenta parse se for string JSON
    const s = String(v).trim();
    if (!s) return null;
    return JSON.parse(s);
  } catch {
    // fallback: guarda como string
    return { raw: toStr(v) };
  }
}

/**
 * Deriva target_type / target_id / reason a partir do payload
 * Você pode ajustar isso conforme seus actions.
 */
function deriveFields(actionType, payload) {
  const action = toStr(actionType).trim() || "UNKNOWN";
  const p = payload && typeof payload === "object" ? payload : {};

  // defaults
  let targetType = null;
  let targetId = null;
  let reason = null;

  // casos comuns do seu controller
  if (p.targetUserId != null) {
    targetType = "user";
    targetId = toStr(p.targetUserId).trim() || null;
  } else if (p.reservationId != null) {
    targetType = "reservation";
    targetId = toStr(p.reservationId).trim() || null;
  } else if (p.promotedUserId != null) {
    targetType = "user";
    targetId = toStr(p.promotedUserId).trim() || null;
  }

  if (p.reason != null) reason = toStr(p.reason).trim() || null;

  return { action, targetType, targetId, reason, meta: p };
}

/**
 * ✅ Loga ação do admin na tabela public.admin_audit_logs
 * - Aceita: (req, actionType, payload)
 * - Best-effort: nunca quebra a request principal
 */
async function logAdminAction(req, actionType, payload = {}) {
  try {
    const admin_id = toStr(req?.user?.id).trim() || null;
    const admin_email = toStr(req?.user?.email).trim() || null;
    const admin_role = toStr(req?.user?.role).trim() || null;

    const { action, targetType, targetId, reason, meta } = deriveFields(
      actionType,
      payload
    );

    // Monta insert incluindo tudo que existe na sua tabela
    const sql = `
      INSERT INTO public.admin_audit_logs
        (admin_id, admin_email, admin_role, action_type, target_type, target_id, reason, meta)
      VALUES
        ($1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text, $8::jsonb)
    `;

    await pool.query(sql, [
      admin_id,
      admin_email,
      admin_role,
      action,
      targetType,
      targetId,
      reason,
      JSON.stringify(safeJson(meta) ?? {}),
    ]);
  } catch (err) {
    // deixa bem visível o motivo
    console.warn("[adminAuditService] audit log falhou:", {
      message: err?.message,
      code: err?.code,
      detail: err?.detail,
      constraint: err?.constraint,
    });
  }
}

module.exports = { logAdminAction };
