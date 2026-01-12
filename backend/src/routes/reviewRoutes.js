// backend/src/routes/reviewRoutes.js
const express = require("express");
const jwt = require("jsonwebtoken");
const authMiddleware = require("../middleware/authMiddleware");
const reviewController = require("../controllers/reviewController");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

// ✅ Auth opcional: se tiver Bearer token válido, preenche req.user; se não tiver, segue público
function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return next();

    const [scheme, token] = authHeader.split(" ");
    if (!/^Bearer$/i.test(scheme) || !token) return next();

    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded?.id && decoded?.role) {
      req.user = { id: decoded.id, role: decoded.role };
    }
    return next();
  } catch {
    // token inválido? continua público sem user
    return next();
  }
}

function fallback(name) {
  return (req, res) => {
    console.error(`[REVIEWS] Handler ausente: ${name}`);
    return res.status(500).json({
      error: `Handler não encontrado no controller: ${name}`,
      code: "MISSING_HANDLER",
    });
  };
}

function pickHandler(...names) {
  for (const n of names) {
    if (typeof reviewController[n] === "function") return reviewController[n];
  }
  return fallback(names[0] || "unknownHandler");
}

/* ==========================================================
   🔓 ROTAS PÚBLICAS
   ========================================================== */

// Resumo de avaliações (média + total)
router.get("/summary/:userId", pickHandler("getReviewSummaryController"));

// Lista pública de avaliações visíveis
// ✅ Se vier token: permite admin/dono pedir includeHidden=true
router.get(
  "/user/:userId",
  optionalAuth,
  pickHandler("listReviewsForUserController")
);

/* ==========================================================
   🔒 ROTAS AUTENTICADAS
   ========================================================== */

router.use(authMiddleware);

// Avaliações feitas pelo usuário logado
router.get("/me", pickHandler("listMyReviewsController"));

// Criar avaliação
router.post("/", pickHandler("createReviewController"));

module.exports = router;
