// backend/src/controllers/reviewController.js
const reviewModel = require("../models/reviewModel");

/* ==========================================================
   Helpers
   ========================================================== */
function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toBool(v) {
  if (v === true) return true;
  if (v === false) return false;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "sim";
}

function toTextOrNull(v) {
  const s = v == null ? "" : String(v);
  const t = s.trim();
  return t ? t : null;
}

/* ==========================================================
   POST /reviews
   ========================================================== */
async function createReviewController(req, res) {
  try {
    const userId = toInt(req.user?.id);
    if (!userId) {
      return res.status(401).json({ error: "Não autenticado." });
    }

    const reservationId = toInt(
      req.body?.reservationId ?? req.body?.reservation_id
    );
    const rating = toInt(req.body?.rating);
    const comment = toTextOrNull(req.body?.comment);

    if (!reservationId) {
      return res.status(400).json({ error: "reservationId é obrigatório." });
    }
    if (!rating || rating < 1 || rating > 5) {
      return res
        .status(400)
        .json({ error: "rating deve ser um número de 1 a 5." });
    }

    const { review, reservation } =
      await reviewModel.createReviewAndSyncReservation({
        reservationId,
        reviewerId: userId,
        rating,
        comment,
      });

    return res.status(201).json({ review, reservation });
  } catch (err) {
    console.error("Erro em POST /reviews:", err);
    return res
      .status(err?.status || 500)
      .json({ error: err?.message || "Erro ao criar avaliação." });
  }
}

/* ==========================================================
   GET /reviews/summary/:userId
   → Público (NUNCA inclui ocultas)
   ========================================================== */
async function getReviewSummaryController(req, res) {
  try {
    const userId = toInt(req.params.userId);
    if (!userId) {
      return res.status(400).json({ error: "userId inválido." });
    }

    const summary = await reviewModel.getSummaryForReviewedUser(userId);

    return res.json({
      avg: Number(summary?.avgRating || 0),
      count: Number(summary?.count || 0),
    });
  } catch (err) {
    console.error("Erro em GET /reviews/summary/:userId", err);
    return res
      .status(err?.status || 500)
      .json({ error: err?.message || "Erro ao buscar resumo." });
  }
}

/* ==========================================================
   GET /reviews/user/:userId
   Regras:
   - Público: nunca vê ocultas
   - Usuário dono: pode ver ocultas
   - Admin: pode ver ocultas
   ========================================================== */
async function listReviewsForUserController(req, res) {
  try {
    const reviewedUserId = toInt(req.params.userId);
    if (!reviewedUserId) {
      return res.status(400).json({ error: "userId inválido." });
    }

    const authUser = req.user || null;
    const isAdmin = authUser?.role === "admin";
    const isOwner = authUser && toInt(authUser.id) === reviewedUserId;

    // 🔐 REGRA FINAL
    const includeHidden =
      (isAdmin || isOwner) && toBool(req.query?.includeHidden);

    const sort = String(req.query?.sort || "recent");
    const limit = Math.min(Math.max(toInt(req.query.limit) || 10, 1), 50);
    const page = Math.max(toInt(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;

    const total = await reviewModel.countForReviewedUser(
      reviewedUserId,
      includeHidden
    );

    const totalPages = Math.max(1, Math.ceil(total / limit));

    const reviews = await reviewModel.listForReviewedUser(
      reviewedUserId,
      limit,
      offset,
      sort,
      includeHidden
    );

    return res.json({
      reviews,
      page,
      limit,
      total,
      totalPages,
      sort,
      includeHidden,
    });
  } catch (err) {
    console.error("Erro em GET /reviews/user/:userId", err);
    return res
      .status(err?.status || 500)
      .json({ error: err?.message || "Erro ao listar avaliações." });
  }
}

/* ==========================================================
   GET /reviews/me
   → Autenticado
   Objetivo: o frontend saber “quais reservas eu já avaliei”
   (para o Dashboard não mostrar botão indevido)
   ========================================================== */
async function listMyReviewsController(req, res) {
  try {
    const userId = toInt(req.user?.id);
    if (!userId) {
      return res.status(401).json({ error: "Não autenticado." });
    }

    // paginação (opcional)
    const limit = Math.min(Math.max(toInt(req.query.limit) || 200, 1), 500);
    const page = Math.max(toInt(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;

    // OBS: esse método precisa existir no model
    const result = await reviewModel.listForReviewerUser(userId, limit, offset);

    // Aceita 2 formatos:
    // - { reviews, total }
    // - reviews (array)
    const reviews = Array.isArray(result?.reviews)
      ? result.reviews
      : Array.isArray(result)
      ? result
      : [];

    const total =
      typeof result?.total === "number"
        ? result.total
        : typeof result?.count === "number"
        ? result.count
        : reviews.length;

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return res.json({
      reviews,
      page,
      limit,
      total,
      totalPages,
    });
  } catch (err) {
    console.error("Erro em GET /reviews/me:", err);
    return res
      .status(err?.status || 500)
      .json({ error: err?.message || "Erro ao listar minhas avaliações." });
  }
}

module.exports = {
  createReviewController,
  getReviewSummaryController,
  listReviewsForUserController,
  listMyReviewsController, // ✅ exportado
};
