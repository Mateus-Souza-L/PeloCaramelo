// backend/src/controllers/adminReviewController.js
const pool = require("../config/db");
const reviewModel = require("../models/reviewModel");

function toStr(v) {
  return v == null ? "" : String(v);
}

function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function cleanReason(reason) {
  const r = toStr(reason).trim();
  if (!r) return "";
  return r.slice(0, 300);
}

/**
 * GET /admin/reviews
 * Query (opcional): limit, offset, hidden=true/false, rating=1..5
 */
async function listAllReviews(req, res) {
  try {
    const limit = clamp(toInt(req.query?.limit) ?? 200, 1, 500);
    const offset = Math.max(0, toInt(req.query?.offset) ?? 0);

    const hiddenRaw = toStr(req.query?.hidden).toLowerCase();
    const hidden =
      hiddenRaw === "true" ? true : hiddenRaw === "false" ? false : null;

    const rating = toInt(req.query?.rating);
    const hasRatingFilter =
      Number.isFinite(rating) && rating >= 1 && rating <= 5;

    // 1) Usa o model existente (compat)
    // OBS: se o model já limita 500, o offset/limit aqui é "em memória"
    if (reviewModel && typeof reviewModel.listAll === "function") {
      const rows = await reviewModel.listAll();

      let filtered = Array.isArray(rows) ? rows : [];
      if (hidden !== null) {
        filtered = filtered.filter((r) => Boolean(r.is_hidden) === hidden);
      }
      if (hasRatingFilter) {
        filtered = filtered.filter((r) => Number(r.rating) === rating);
      }

      const sliced = filtered.slice(offset, offset + limit);

      return res.json({
        items: sliced,
        meta: {
          source: "model.listAll",
          limit,
          offset,
          returned: sliced.length,
          totalMatched: filtered.length,
          note:
            "Paginação/filtragem aplicadas em memória (dependendo do limite interno do model).",
        },
      });
    }

    // 2) Fallback SQL direto (paginação real no banco)
    const where = [];
    const params = [];
    let p = 1;

    if (hidden !== null) {
      where.push(`rv.is_hidden = $${p++}`);
      params.push(hidden);
    }
    if (hasRatingFilter) {
      where.push(`rv.rating = $${p++}`);
      params.push(rating);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const sql = `
      SELECT
        rv.id,
        rv.reservation_id,
        rv.reviewer_id,
        rv.reviewed_id,

        rv.rating,
        rv.comment,
        rv.created_at,

        rv.is_hidden,
        rv.hidden_reason,
        rv.hidden_at,

        r.service,
        r.start_date,
        r.end_date,

        -- nomes úteis pro Admin
        ur.name AS reviewer_name,
        ud.name AS reviewed_name,

        -- compat com telas antigas (tutor/caregiver)
        tu.id AS tutor_id,
        tu.name AS tutor_name,
        cu.id AS caregiver_id,
        cu.name AS caregiver_name

      FROM reviews rv
      JOIN reservations r ON r.id = rv.reservation_id
      LEFT JOIN users ur ON ur.id::text = rv.reviewer_id::text
      LEFT JOIN users ud ON ud.id::text = rv.reviewed_id::text
      LEFT JOIN users tu ON tu.id = r.tutor_id
      LEFT JOIN users cu ON cu.id = r.caregiver_id

      ${whereSql}

      ORDER BY rv.created_at DESC
      LIMIT $${p++} OFFSET $${p++}
    `;

    params.push(limit, offset);

    const { rows } = await pool.query(sql, params);

    return res.json({
      items: rows,
      meta: { source: "sql", limit, offset, returned: rows.length },
    });
  } catch (err) {
    console.error("[ADMIN][REVIEWS] listAllReviews error:", err);
    return res.status(500).json({ message: "Erro ao listar avaliações." });
  }
}

/**
 * PATCH /admin/reviews/:id/hide
 * Body: { reason?: string }
 *
 * ✅ Usa reviewModel.hide(id, adminId, reason) quando existir.
 */
async function hideReview(req, res) {
  try {
    const id = toInt(req.params?.id);
    const adminId = toInt(req.user?.id);
    const reason =
      cleanReason(req.body?.reason) || "Conteúdo fora das diretrizes";

    if (!id) return res.status(400).json({ message: "ID inválido." });
    if (!adminId)
      return res.status(401).json({ message: "Admin não autenticado." });

    // Preferencial: model.hide (grava hidden_by se existir no seu schema)
    if (reviewModel && typeof reviewModel.hide === "function") {
      const review = await reviewModel.hide(id, adminId, reason);
      if (!review)
        return res.status(404).json({ message: "Avaliação não encontrada." });

      return res.json({ message: "Avaliação ocultada.", review });
    }

    // Fallback SQL
    const sql = `
      UPDATE reviews
      SET
        is_hidden = true,
        hidden_reason = $1,
        hidden_at = NOW()
      WHERE id = $2
      RETURNING id, is_hidden, hidden_reason, hidden_at
    `;
    const { rows } = await pool.query(sql, [reason, id]);

    if (!rows?.length)
      return res.status(404).json({ message: "Avaliação não encontrada." });

    return res.json({ message: "Avaliação ocultada.", review: rows[0] });
  } catch (err) {
    console.error("[ADMIN][REVIEWS] hideReview error:", err);
    return res.status(500).json({ message: "Erro ao ocultar avaliação." });
  }
}

/**
 * PATCH /admin/reviews/:id/unhide
 * ✅ Usa reviewModel.unhide(id) quando existir.
 */
async function unhideReview(req, res) {
  try {
    const id = toInt(req.params?.id);
    if (!id) return res.status(400).json({ message: "ID inválido." });

    if (reviewModel && typeof reviewModel.unhide === "function") {
      const review = await reviewModel.unhide(id);
      if (!review)
        return res.status(404).json({ message: "Avaliação não encontrada." });

      return res.json({ message: "Avaliação reexibida.", review });
    }

    const sql = `
      UPDATE reviews
      SET
        is_hidden = false,
        hidden_reason = NULL,
        hidden_at = NULL
      WHERE id = $1
      RETURNING id, is_hidden, hidden_reason, hidden_at
    `;
    const { rows } = await pool.query(sql, [id]);

    if (!rows?.length)
      return res.status(404).json({ message: "Avaliação não encontrada." });

    return res.json({ message: "Avaliação reexibida.", review: rows[0] });
  } catch (err) {
    console.error("[ADMIN][REVIEWS] unhideReview error:", err);
    return res.status(500).json({ message: "Erro ao reexibir avaliação." });
  }
}

module.exports = {
  listAllReviews,
  hideReview,
  unhideReview,
};
