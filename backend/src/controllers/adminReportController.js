// backend/src/controllers/adminReportController.js
const pool = require("../config/db");

function toStr(v) {
  return v == null ? "" : String(v);
}

function normStatus(s) {
  const v = toStr(s).trim().toLowerCase();
  const allowed = new Set(["open", "reviewing", "resolved", "dismissed"]);
  return allowed.has(v) ? v : null;
}

/**
 * GET /admin/reports
 * opcional: ?status=open|reviewing|resolved|dismissed
 */
async function listReportsController(req, res) {
  try {
    const status = normStatus(req.query.status);

    const params = [];
    let where = "";
    if (status) {
      params.push(status);
      where = `WHERE r.status = $${params.length}`;
    }

    const q = `
      SELECT
        r.id,
        r.reported_user_id,
        r.reporter_user_id,
        r.reason,
        r.details,
        r.context,
        r.status,
        r.created_at,

        u_reported.name  AS reported_name,
        u_reported.email AS reported_email,

        u_reporter.name  AS reporter_name,
        u_reporter.email AS reporter_email

      FROM public.reports r
      LEFT JOIN public.users u_reported ON u_reported.id = r.reported_user_id
      LEFT JOIN public.users u_reporter ON u_reporter.id = r.reporter_user_id
      ${where}
      ORDER BY r.created_at DESC
      LIMIT 200
    `;

    const { rows } = await pool.query(q, params);

    return res.json({ ok: true, reports: rows });
  } catch (err) {
    console.error("GET /admin/reports error:", err);
    return res.status(500).json({ ok: false, message: "Erro ao listar denúncias." });
  }
}

/**
 * PATCH /admin/reports/:id/status
 * body: { status: "reviewing" | "resolved" | "dismissed" | "open" }
 */
async function updateReportStatusController(req, res) {
  try {
    const id = toStr(req.params.id).trim();
    const nextStatus = normStatus(req.body?.status);

    if (!id) {
      return res.status(400).json({ ok: false, message: "ID da denúncia é obrigatório." });
    }
    if (!nextStatus) {
      return res.status(400).json({
        ok: false,
        message: 'Status inválido. Use: "open", "reviewing", "resolved", "dismissed".',
      });
    }

    const q = `
      UPDATE public.reports
      SET status = $1
      WHERE id = $2
      RETURNING id, status, reported_user_id, reporter_user_id, reason, created_at
    `;

    const { rows } = await pool.query(q, [nextStatus, id]);

    if (!rows?.length) {
      return res.status(404).json({ ok: false, message: "Denúncia não encontrada." });
    }

    return res.json({ ok: true, report: rows[0] });
  } catch (err) {
    console.error("PATCH /admin/reports/:id/status error:", err);
    return res.status(500).json({ ok: false, message: "Erro ao atualizar status da denúncia." });
  }
}

module.exports = {
  listReportsController,
  updateReportStatusController,
};
