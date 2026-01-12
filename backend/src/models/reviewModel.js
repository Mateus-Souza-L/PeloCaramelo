// backend/src/models/reviewModel.js
const pool = require("../config/db");

/* =========================
   Helpers
========================= */
function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clampInt(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

function normStatus(s) {
  return String(s || "").trim();
}

function isConcludedStatus(status) {
  const s = normStatus(status).toLowerCase();
  return (
    s === "concluida" ||
    s === "concluída" ||
    s === "finalizada" ||
    s === "completed"
  );
}

function cleanComment(comment) {
  if (comment == null) return null;
  const t = String(comment).trim();
  if (!t) return null;
  return t.slice(0, 2000);
}

function cleanReason(reason) {
  const t = reason == null ? "" : String(reason).trim();
  if (!t) return "";
  return t.slice(0, 300);
}

/* ==========================================================
   CREATE REVIEW + SYNC RESERVATION
========================================================== */
async function createReviewAndSyncReservation({
  reservationId,
  reviewerId,
  rating,
  comment,
}) {
  const rid = toInt(reservationId);
  const revid = toInt(reviewerId);
  const rate = Number(rating);
  const cmt = cleanComment(comment);

  if (!rid)
    throw Object.assign(new Error("reservationId inválido."), { status: 400 });
  if (!revid)
    throw Object.assign(new Error("reviewerId inválido."), { status: 400 });
  if (!Number.isFinite(rate) || rate < 1 || rate > 5) {
    throw Object.assign(new Error("rating inválido (1..5)."), { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const r0 = await client.query(
      `
      SELECT id, tutor_id, caregiver_id, status,
             tutor_rating, tutor_review,
             caregiver_rating, caregiver_review
      FROM reservations
      WHERE id = $1
      LIMIT 1;
      `,
      [rid]
    );

    const r = r0.rows?.[0];
    if (!r)
      throw Object.assign(new Error("Reserva não encontrada."), { status: 404 });

    const tutorId = toInt(r.tutor_id);
    const caregiverId = toInt(r.caregiver_id);

    const isTutor = tutorId === revid;
    const isCaregiver = caregiverId === revid;

    if (!isTutor && !isCaregiver) {
      throw Object.assign(
        new Error("Você não pode avaliar uma reserva que não é sua."),
        { status: 403 }
      );
    }

    if (!isConcludedStatus(r.status)) {
      throw Object.assign(
        new Error("Só é possível avaliar após a reserva ser concluída."),
        { status: 409 }
      );
    }

    const reviewedId = isTutor ? caregiverId : tutorId;
    if (!reviewedId) {
      throw Object.assign(new Error("Reserva sem tutor/cuidador definido."), {
        status: 409,
      });
    }

    const dup = await client.query(
      `
      SELECT 1
      FROM reviews
      WHERE reservation_id = $1
        AND reviewer_id = $2
      LIMIT 1;
      `,
      [rid, revid]
    );
    if (dup.rows.length) {
      throw Object.assign(new Error("Você já avaliou esta reserva."), {
        status: 409,
      });
    }

    let ins;
    try {
      ins = await client.query(
        `
        INSERT INTO reviews
          (reservation_id, tutor_id, caregiver_id, reviewer_id, reviewed_id, rating, comment)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7)
        RETURNING
          id, reservation_id, tutor_id, caregiver_id,
          reviewer_id, reviewed_id, rating, comment,
          created_at, is_hidden, hidden_reason, hidden_at;
        `,
        [rid, tutorId, caregiverId, revid, reviewedId, rate, cmt]
      );
    } catch (e) {
      if (e?.code === "23505") {
        throw Object.assign(new Error("Você já avaliou esta reserva."), {
          status: 409,
        });
      }
      throw e;
    }

    await client.query(
      `
      UPDATE reservations
      SET
        tutor_rating = CASE WHEN $2 THEN $3 ELSE tutor_rating END,
        tutor_review  = CASE WHEN $2 THEN $4 ELSE tutor_review  END,
        caregiver_rating = CASE WHEN $5 THEN $3 ELSE caregiver_rating END,
        caregiver_review  = CASE WHEN $5 THEN $4 ELSE caregiver_review  END
      WHERE id = $1;
      `,
      [rid, isTutor, rate, cmt, isCaregiver]
    );

    const r1 = await client.query(
      `
      SELECT
        id,
        tutor_id,
        caregiver_id,
        status,
        service,
        city,
        neighborhood,
        price_per_day,
        start_date,
        end_date,
        total,
        pets_ids,
        pets_names,
        reject_reason,
        tutor_rating,
        tutor_review,
        caregiver_rating,
        caregiver_review
      FROM reservations
      WHERE id = $1
      LIMIT 1;
      `,
      [rid]
    );

    await client.query("COMMIT");
    return { review: ins.rows[0], reservation: r1.rows?.[0] || null };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/* ==========================================================
   SUMMARY (PÚBLICO — nunca inclui ocultas)
========================================================== */
async function getSummaryForReviewedUser(reviewedId) {
  const uid = toInt(reviewedId);
  if (!uid)
    throw Object.assign(new Error("reviewedId inválido."), { status: 400 });

  const { rows } = await pool.query(
    `
    SELECT
      COALESCE(AVG(rating),0) AS avg_rating,
      COUNT(*)::int AS count
    FROM reviews
    WHERE reviewed_id = $1
      AND is_hidden IS NOT TRUE;
    `,
    [uid]
  );

  return {
    avgRating: Number(rows[0]?.avg_rating || 0),
    count: Number(rows[0]?.count || 0),
  };
}

const SORT_MAP = {
  recent: "created_at DESC",
  oldest: "created_at ASC",
  best: "rating DESC, created_at DESC",
  worst: "rating ASC, created_at DESC",
};

/* ==========================================================
   COUNT (com ou sem ocultas)
========================================================== */
async function countForReviewedUser(reviewedId, includeHidden = false) {
  const uid = toInt(reviewedId);
  if (!uid)
    throw Object.assign(new Error("reviewedId inválido."), { status: 400 });

  const { rows } = await pool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM reviews
    WHERE reviewed_id = $1
      AND ($2::boolean = TRUE OR is_hidden IS NOT TRUE);
    `,
    [uid, !!includeHidden]
  );

  return Number(rows[0]?.total || 0);
}

/* ==========================================================
   LIST (por usuário AVALIADO)
========================================================== */
async function listForReviewedUser(
  reviewedId,
  limit = 50,
  offset = 0,
  sort = "recent",
  includeHidden = false
) {
  const uid = toInt(reviewedId);
  if (!uid)
    throw Object.assign(new Error("reviewedId inválido."), { status: 400 });

  const orderBy = SORT_MAP[sort] || SORT_MAP.recent;

  const cleanLimit = clampInt(limit, 10, 1, 50);
  const cleanOffset = clampInt(offset, 0, 0, 100000);

  const { rows } = await pool.query(
    `
    SELECT
      rv.id::text,
      rv.reservation_id,
      r.service,
      rv.rating,
      rv.comment,
      rv.created_at,
      rv.reviewer_id,
      u.name AS reviewer_name,
      u.role AS reviewer_role,
      rv.is_hidden,
      rv.hidden_reason,
      rv.hidden_at
    FROM reviews rv
    LEFT JOIN reservations r ON r.id = rv.reservation_id
    LEFT JOIN users u ON u.id::text = rv.reviewer_id::text
    WHERE rv.reviewed_id = $1
      AND ($4::boolean = TRUE OR rv.is_hidden IS NOT TRUE)
    ORDER BY ${orderBy}
    LIMIT $2 OFFSET $3;
    `,
    [uid, cleanLimit, cleanOffset, !!includeHidden]
  );

  return rows;
}

/* ==========================================================
   ✅ LIST (por usuário AVALIADOR) — /reviews/me
========================================================== */
async function listForReviewerUser(reviewerId, limit = 200, offset = 0) {
  const uid = toInt(reviewerId);
  if (!uid)
    throw Object.assign(new Error("reviewerId inválido."), { status: 400 });

  const cleanLimit = clampInt(limit, 200, 1, 500);
  const cleanOffset = clampInt(offset, 0, 0, 100000);

  const countRes = await pool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM reviews
    WHERE reviewer_id = $1;
    `,
    [uid]
  );

  const { rows } = await pool.query(
    `
    SELECT
      rv.id::text,
      rv.reservation_id,
      rv.reviewed_id,
      rv.rating,
      rv.comment,
      rv.created_at,
      rv.is_hidden,
      rv.hidden_reason,
      rv.hidden_at
    FROM reviews rv
    WHERE rv.reviewer_id = $1
    ORDER BY rv.created_at DESC
    LIMIT $2 OFFSET $3;
    `,
    [uid, cleanLimit, cleanOffset]
  );

  return {
    reviews: rows,
    total: Number(countRes.rows?.[0]?.total || 0),
  };
}

/* ==========================================================
   ✅ ADMIN: LIST ALL (para /admin/reviews)
   - Retorna até 500 mais recentes
   - Com nomes de tutor e caregiver (para o AdminDashboard)
========================================================== */
async function listAll(limit = 500) {
  const cleanLimit = clampInt(limit, 500, 1, 500);

  const sql = `
    SELECT
      rv.id,
      rv.rating,
      rv.comment,
      rv.created_at,
      rv.is_hidden,
      rv.hidden_reason,
      rv.hidden_at,

      r.id AS reservation_id,

      tu.id AS tutor_id,
      tu.name AS tutor_name,

      cu.id AS caregiver_id,
      cu.name AS caregiver_name

    FROM reviews rv
    JOIN reservations r ON r.id = rv.reservation_id
    LEFT JOIN users tu ON tu.id = r.tutor_id
    LEFT JOIN users cu ON cu.id = r.caregiver_id
    ORDER BY rv.created_at DESC
    LIMIT $1
  `;

  const { rows } = await pool.query(sql, [cleanLimit]);
  return rows || [];
}

/* ==========================================================
   ✅ ADMIN: HIDE
   - Tenta gravar hidden_by se a coluna existir
   - Se não existir, faz fallback sem hidden_by
========================================================== */
async function hide(id, adminId, reason) {
  const rid = toInt(id);
  const aid = toInt(adminId);
  const rsn = cleanReason(reason) || "Conteúdo fora das diretrizes";

  if (!rid) throw Object.assign(new Error("ID inválido."), { status: 400 });
  if (!aid) throw Object.assign(new Error("Admin inválido."), { status: 401 });

  // tenta com hidden_by (se existir)
  try {
    const sql = `
      UPDATE reviews
      SET
        is_hidden = TRUE,
        hidden_reason = $1,
        hidden_at = NOW(),
        hidden_by = $2
      WHERE id = $3
      RETURNING id, is_hidden, hidden_reason, hidden_at
    `;
    const { rows } = await pool.query(sql, [rsn, aid, rid]);
    return rows?.[0] || null;
  } catch (e) {
    // coluna hidden_by não existe → 42703
    if (e?.code !== "42703") throw e;

    const sql2 = `
      UPDATE reviews
      SET
        is_hidden = TRUE,
        hidden_reason = $1,
        hidden_at = NOW()
      WHERE id = $2
      RETURNING id, is_hidden, hidden_reason, hidden_at
    `;
    const { rows } = await pool.query(sql2, [rsn, rid]);
    return rows?.[0] || null;
  }
}

/* ==========================================================
   ✅ ADMIN: UNHIDE
   - Limpa is_hidden + campos de motivo/data (+ hidden_by se existir)
========================================================== */
async function unhide(id) {
  const rid = toInt(id);
  if (!rid) throw Object.assign(new Error("ID inválido."), { status: 400 });

  // tenta limpar hidden_by também
  try {
    const sql = `
      UPDATE reviews
      SET
        is_hidden = FALSE,
        hidden_reason = NULL,
        hidden_at = NULL,
        hidden_by = NULL
      WHERE id = $1
      RETURNING id, is_hidden, hidden_reason, hidden_at
    `;
    const { rows } = await pool.query(sql, [rid]);
    return rows?.[0] || null;
  } catch (e) {
    if (e?.code !== "42703") throw e;

    const sql2 = `
      UPDATE reviews
      SET
        is_hidden = FALSE,
        hidden_reason = NULL,
        hidden_at = NULL
      WHERE id = $1
      RETURNING id, is_hidden, hidden_reason, hidden_at
    `;
    const { rows } = await pool.query(sql2, [rid]);
    return rows?.[0] || null;
  }
}

/* ==========================================================
   PUBLIC (aliases seguros)
========================================================== */
async function countVisibleForReviewedUser(id) {
  return countForReviewedUser(id, false);
}

async function listVisibleForReviewedUser(id, limit, offset, sort) {
  return listForReviewedUser(id, limit, offset, sort, false);
}

module.exports = {
  toInt,
  clampInt,

  createReviewAndSyncReservation,

  getSummaryForReviewedUser,

  listForReviewedUser,
  countForReviewedUser,

  listForReviewerUser,

  // ✅ admin
  listAll,
  hide,
  unhide,

  listVisibleForReviewedUser,
  countVisibleForReviewedUser,
};
