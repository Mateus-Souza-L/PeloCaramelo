// backend/src/controllers/adminReviewController.js
const pool = require("../config/db");
const reviewModel = require("../models/reviewModel");

// ✅ Admin audit (DB)
const { ACTIONS, auditLog } = require("../utils/adminAudit");

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

/* ==========================================================
   ✅ Schema-tolerant: reviews.hidden_by_admin_id pode ou não existir
   ========================================================== */

let _reviewsColsChecked = false;
let _hasHiddenByAdminId = false;

async function detectReviewsColumnsOnce() {
  if (_reviewsColsChecked) return;
  _reviewsColsChecked = true;

  try {
    const { rows } = await pool.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'reviews'
      `
    );

    const cols = new Set((rows || []).map((r) => String(r.column_name || "").toLowerCase()));
    _hasHiddenByAdminId = cols.has("hidden_by_admin_id");
  } catch (e) {
    console.error("[ADMIN][REVIEWS] detectReviewsColumnsOnce error:", e?.message || e);
    _hasHiddenByAdminId = false; // fail-safe
  }
}

async function getReviewContextById(id) {
  const rid = toStr(id).trim();
  if (!rid) return null;

  try {
    const sql = `
      SELECT
        rv.id,
        rv.reservation_id,
        rv.reviewer_id,
        rv.reviewed_id,
        rv.rating,
        rv.comment,
        rv.is_hidden,
        rv.hidden_reason,
        rv.hidden_at
        ${_hasHiddenByAdminId ? ", rv.hidden_by_admin_id" : ""},

        r.service,
        r.start_date,
        r.end_date,
        r.tutor_id,
        r.caregiver_id,

        ur.name  AS reviewer_name,
        ur.email AS reviewer_email,
        ud.name  AS reviewed_name,
        ud.email AS reviewed_email

      FROM reviews rv
      LEFT JOIN reservations r ON r.id = rv.reservation_id
      LEFT JOIN users ur ON ur.id::text = rv.reviewer_id::text
      LEFT JOIN users ud ON ud.id::text = rv.reviewed_id::text
      WHERE rv.id::text = $1::text
      LIMIT 1
    `;
    const { rows } = await pool.query(sql, [rid]);
    return rows?.[0] || null;
  } catch (e) {
    console.error("[ADMIN][REVIEWS] getReviewContextById error:", e?.message || e);
    return null;
  }
}

/**
 * GET /admin/reviews
 * Query (opcional): limit, offset, hidden=true/false, rating=1..5
 */
async function listAllReviews(req, res) {
  try {
    await detectReviewsColumnsOnce();

    const limit = clamp(toInt(req.query?.limit) ?? 200, 1, 500);
    const offset = Math.max(0, toInt(req.query?.offset) ?? 0);

    const hiddenRaw = toStr(req.query?.hidden).toLowerCase();
    const hidden = hiddenRaw === "true" ? true : hiddenRaw === "false" ? false : null;

    const rating = toInt(req.query?.rating);
    const hasRatingFilter = Number.isFinite(rating) && rating >= 1 && rating <= 5;

    // 1) Usa o model existente (compat)
    // OBS: se o model já limita 500, o offset/limit aqui é "em memória"
    if (reviewModel && typeof reviewModel.listAll === "function") {
      const rows = await reviewModel.listAll();

      let filtered = Array.isArray(rows) ? rows : [];
      if (hidden !== null) filtered = filtered.filter((r) => Boolean(r.is_hidden) === hidden);
      if (hasRatingFilter) filtered = filtered.filter((r) => Number(r.rating) === rating);

      const sliced = filtered.slice(offset, offset + limit);

      return res.json({
        items: sliced,
        meta: {
          source: "model.listAll",
          limit,
          offset,
          returned: sliced.length,
          totalMatched: filtered.length,
          note: "Paginação/filtragem aplicadas em memória (dependendo do limite interno do model).",
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
        rv.hidden_at
        ${_hasHiddenByAdminId ? ", rv.hidden_by_admin_id" : ""},

        r.service,
        r.start_date,
        r.end_date,

        ur.name AS reviewer_name,
        ud.name AS reviewed_name,

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
      items: rows || [],
      meta: { source: "sql", limit, offset, returned: rows?.length || 0 },
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
 * ✅ Grava: is_hidden, hidden_reason, hidden_at (+ hidden_by_admin_id se existir)
 * ✅ Audit log: admin_audit_logs
 */
async function hideReview(req, res) {
  try {
    await detectReviewsColumnsOnce();

    const id = toStr(req.params?.id).trim();
    const adminId = toStr(req.user?.id).trim();
    const adminEmail = toStr(req.user?.email).trim() || null;

    const reason = cleanReason(req.body?.reason) || "Conteúdo fora das diretrizes";

    if (!id) return res.status(400).json({ message: "ID inválido." });
    if (!adminId) return res.status(401).json({ message: "Admin não autenticado." });

    // pega contexto antes (para auditoria + futuro email)
    const before = await getReviewContextById(id);
    if (!before) return res.status(404).json({ message: "Avaliação não encontrada." });

    // Preferencial: model.hide (se ele lidar com hidden_by/hidden_at etc)
    // Mesmo usando model, ainda faremos audit log.
    let updatedReview = null;

    if (reviewModel && typeof reviewModel.hide === "function") {
      updatedReview = await reviewModel.hide(id, adminId, reason);
      if (!updatedReview) return res.status(404).json({ message: "Avaliação não encontrada." });
    } else {
      // Fallback SQL (compatível com id numérico ou string)
      const sql = _hasHiddenByAdminId
        ? `
          UPDATE reviews
          SET
            is_hidden = true,
            hidden_reason = $1,
            hidden_at = NOW(),
            hidden_by_admin_id = $3
          WHERE id::text = $2::text
          RETURNING id, reservation_id, reviewer_id, reviewed_id, is_hidden, hidden_reason, hidden_at, hidden_by_admin_id
        `
        : `
          UPDATE reviews
          SET
            is_hidden = true,
            hidden_reason = $1,
            hidden_at = NOW()
          WHERE id::text = $2::text
          RETURNING id, reservation_id, reviewer_id, reviewed_id, is_hidden, hidden_reason, hidden_at
        `;

      const params = _hasHiddenByAdminId ? [reason, id, adminId] : [reason, id];
      const { rows } = await pool.query(sql, params);

      if (!rows?.length) return res.status(404).json({ message: "Avaliação não encontrada." });
      updatedReview = rows[0];
    }

    // contexto depois (para auditoria mais completa)
    const after = await getReviewContextById(id);

    // ✅ AUDIT LOG (DB)
    await auditLog(pool, {
      adminId,
      adminEmail,
      actionType: ACTIONS.REVIEW_HIDE,
      targetType: "review",
      targetId: String(id),
      reason,
      meta: {
        reservationId: before?.reservation_id ?? null,
        reviewerId: before?.reviewer_id ?? null,
        reviewedId: before?.reviewed_id ?? null,
        before: {
          isHidden: !!before?.is_hidden,
          hiddenReason: before?.hidden_reason ?? null,
          hiddenAt: before?.hidden_at ?? null,
        },
        after: after
          ? {
              isHidden: !!after?.is_hidden,
              hiddenReason: after?.hidden_reason ?? null,
              hiddenAt: after?.hidden_at ?? null,
              hiddenByAdminId: _hasHiddenByAdminId ? (after?.hidden_by_admin_id ?? null) : null,
            }
          : null,
        // preparo para email futuro (sem enviar aqui ainda)
        emailTargets: {
          reviewerEmail: before?.reviewer_email ?? null,
          reviewerName: before?.reviewer_name ?? null,
        },
      },
    });

    return res.json({ message: "Avaliação ocultada.", review: after || updatedReview });
  } catch (err) {
    console.error("[ADMIN][REVIEWS] hideReview error:", err);
    return res.status(500).json({ message: "Erro ao ocultar avaliação." });
  }
}

/**
 * PATCH /admin/reviews/:id/unhide
 * ✅ Grava: is_hidden=false, limpa hidden_reason/hidden_at (+ hidden_by_admin_id se existir)
 * ✅ Audit log: admin_audit_logs
 */
async function unhideReview(req, res) {
  try {
    await detectReviewsColumnsOnce();

    const id = toStr(req.params?.id).trim();
    const adminId = toStr(req.user?.id).trim();
    const adminEmail = toStr(req.user?.email).trim() || null;

    if (!id) return res.status(400).json({ message: "ID inválido." });
    if (!adminId) return res.status(401).json({ message: "Admin não autenticado." });

    const before = await getReviewContextById(id);
    if (!before) return res.status(404).json({ message: "Avaliação não encontrada." });

    let updatedReview = null;

    if (reviewModel && typeof reviewModel.unhide === "function") {
      updatedReview = await reviewModel.unhide(id);
      if (!updatedReview) return res.status(404).json({ message: "Avaliação não encontrada." });
    } else {
      const sql = _hasHiddenByAdminId
        ? `
          UPDATE reviews
          SET
            is_hidden = false,
            hidden_reason = NULL,
            hidden_at = NULL,
            hidden_by_admin_id = NULL
          WHERE id::text = $1::text
          RETURNING id, reservation_id, reviewer_id, reviewed_id, is_hidden, hidden_reason, hidden_at, hidden_by_admin_id
        `
        : `
          UPDATE reviews
          SET
            is_hidden = false,
            hidden_reason = NULL,
            hidden_at = NULL
          WHERE id::text = $1::text
          RETURNING id, reservation_id, reviewer_id, reviewed_id, is_hidden, hidden_reason, hidden_at
        `;
      const { rows } = await pool.query(sql, [id]);

      if (!rows?.length) return res.status(404).json({ message: "Avaliação não encontrada." });
      updatedReview = rows[0];
    }

    const after = await getReviewContextById(id);

    // ✅ AUDIT LOG (DB)
    await auditLog(pool, {
      adminId,
      adminEmail,
      actionType: ACTIONS.REVIEW_UNHIDE,
      targetType: "review",
      targetId: String(id),
      reason: null,
      meta: {
        reservationId: before?.reservation_id ?? null,
        reviewerId: before?.reviewer_id ?? null,
        reviewedId: before?.reviewed_id ?? null,
        before: {
          isHidden: !!before?.is_hidden,
          hiddenReason: before?.hidden_reason ?? null,
          hiddenAt: before?.hidden_at ?? null,
          hiddenByAdminId: _hasHiddenByAdminId ? (before?.hidden_by_admin_id ?? null) : null,
        },
        after: after
          ? {
              isHidden: !!after?.is_hidden,
              hiddenReason: after?.hidden_reason ?? null,
              hiddenAt: after?.hidden_at ?? null,
              hiddenByAdminId: _hasHiddenByAdminId ? (after?.hidden_by_admin_id ?? null) : null,
            }
          : null,
      },
    });

    return res.json({ message: "Avaliação reexibida.", review: after || updatedReview });
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
