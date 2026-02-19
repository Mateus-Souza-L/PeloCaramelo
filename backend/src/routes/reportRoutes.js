// backend/src/routes/reportRoutes.js
const express = require("express");
const router = express.Router();
const pool = require("../config/db");

function toStr(v) {
  return v == null ? "" : String(v);
}

router.post("/", async (req, res) => {
  try {
    const reporterId = req.user?.id;

    const reportedUserId = toStr(
      req.body.reportedUserId || req.body.reported_user_id
    ).trim();

    const reason = toStr(req.body.reason).trim();
    const details = toStr(req.body.details).trim();
    const context = req.body.context ?? null;

    if (!reporterId) {
      return res.status(401).json({ ok: false, message: "Não autenticado." });
    }

    if (!reportedUserId) {
      return res.status(400).json({ ok: false, message: "reportedUserId é obrigatório." });
    }

    if (String(reporterId) === String(reportedUserId)) {
      return res.status(400).json({
        ok: false,
        message: "Você não pode denunciar seu próprio usuário.",
      });
    }

    if (!reason) {
      return res.status(400).json({ ok: false, message: "Motivo é obrigatório." });
    }

    if (!details || details.length < 10) {
      return res.status(400).json({
        ok: false,
        message: "Descreva melhor o ocorrido (mínimo 10 caracteres).",
      });
    }

    // ✅ valida se usuário denunciado existe
    const chk = await pool.query(
      `SELECT id FROM public.users WHERE id = $1 LIMIT 1`,
      [reportedUserId]
    );
    if (!chk.rows?.length) {
      return res.status(404).json({ ok: false, message: "Usuário denunciado não encontrado." });
    }

    // ✅ Anti-duplicação (mesmo reporter -> mesmo reported) em 12 horas
    const DUP_HOURS = 12;
    const dup = await pool.query(
      `
      SELECT id, created_at
      FROM public.reports
      WHERE reporter_user_id = $1
        AND reported_user_id = $2
        AND created_at > (NOW() - ($3 || ' hours')::interval)
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [reporterId, reportedUserId, DUP_HOURS]
    );

    if (dup.rows?.length) {
      return res.status(429).json({
        ok: false,
        code: "REPORT_DUPLICATE",
        message: `Você já denunciou este perfil recentemente. Aguarde ${DUP_HOURS}h para denunciar novamente.`,
      });
    }

    const ins = await pool.query(
      `
      INSERT INTO public.reports
        (reported_user_id, reporter_user_id, reason, details, context)
      VALUES
        ($1, $2, $3, $4, $5)
      RETURNING id, reported_user_id, reporter_user_id, reason, details, status, created_at
      `,
      [reportedUserId, reporterId, reason, details, context ? JSON.stringify(context) : null]
    );

    return res.status(201).json({ ok: true, report: ins.rows[0] });
  } catch (err) {
    console.error("POST /reports error:", err);
    return res.status(500).json({ ok: false, message: "Erro ao enviar denúncia." });
  }
});

module.exports = router;
