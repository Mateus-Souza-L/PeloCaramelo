// backend/src/routes/reservationRoutes.js
const express = require("express");
const reservationController = require("../controllers/reservationController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

/**
 * Evita dupla verificação de token se o server.js já aplicou authMiddleware.
 * (Mas garante auth se alguém montar esse router sem middleware por engano.)
 */
function requireAuth(req, res, next) {
  if (req.user?.id) return next();
  return authMiddleware(req, res, next);
}

/**
 * Guard simples por papel.
 * Observação: ownership (tutor/caregiver daquela reserva) é diferente de role.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role) {
      return res.status(401).json({
        error: "Não autenticado. Faça login novamente.",
        code: "UNAUTHENTICATED",
      });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        error: "Você não tem permissão para acessar este recurso.",
        code: "FORBIDDEN_ROLE",
      });
    }

    return next();
  };
}

/**
 * Fail-closed: se o middleware de ownership ainda não existir,
 * bloqueia rotas sensíveis ao invés de deixar inseguro.
 */
function safeRequireReservationOwnership() {
  try {
    // Vamos criar este arquivo na próxima etapa (ownership real por reserva).
    // Sugestão de caminho:
    // backend/src/middleware/ownership/reservationOwnership.js
    // e exportar funções: mustBeReservationParticipant, etc.
    // eslint-disable-next-line global-require
    const ownership = require("../middleware/ownership/reservationOwnership");
    return ownership;
  } catch (err) {
    console.error(
      "[RESERVATIONS] Middleware de ownership ausente. Crie ../middleware/ownership/reservationOwnership.js"
    );

    return {
      mustBeReservationParticipant: (req, res) => {
        return res.status(500).json({
          error:
            "Configuração incompleta: middleware de ownership de reservas não está instalado.",
          code: "OWNERSHIP_MIDDLEWARE_MISSING",
        });
      },
    };
  }
}

const { mustBeReservationParticipant } = safeRequireReservationOwnership();

function fallback(name) {
  return (req, res) => {
    console.error(
      `[RESERVATIONS] Handler ausente: ${name} | ${req.method} ${req.originalUrl}`
    );
    return res.status(500).json({
      error: `Handler não encontrado no controller: ${name}`,
      code: "MISSING_HANDLER",
    });
  };
}

// garante que o handler existe (não crasha o server)
function pickHandler(name) {
  return typeof reservationController?.[name] === "function"
    ? reservationController[name]
    : fallback(name);
}

// ---------------------------------------------------------
// ✅ Auth garantido aqui (e não apenas no server.js)
// ---------------------------------------------------------
router.use(requireAuth);

// POST /reservations
// Tutor cria pré-reserva (admin pode testar/operar se você quiser)
router.post("/", requireRole("tutor", "admin"), pickHandler("createReservationController"));

// GET /reservations/tutor
// Lista apenas reservas do tutor autenticado (ownership dentro do controller)
router.get(
  "/tutor",
  requireRole("tutor", "admin"),
  pickHandler("listTutorReservationsController")
);

// GET /reservations/caregiver
// Lista apenas reservas do cuidador autenticado (ownership dentro do controller)
router.get(
  "/caregiver",
  requireRole("caregiver", "admin"),
  pickHandler("listCaregiverReservationsController")
);

// GET /reservations/my-evaluations
// Mantido por compatibilidade (mas ideal é reviews em /reviews/me)
router.get(
  "/my-evaluations",
  requireRole("tutor", "caregiver", "admin"),
  pickHandler("listMyEvaluationsController")
);

// GET /reservations/:id
// ✅ ownership obrigatório: só envolvidos (tutor/caregiver) ou admin
router.get(
  "/:id",
  mustBeReservationParticipant,
  pickHandler("getReservationDetailController")
);

// PATCH /reservations/:id/status
// ✅ ownership obrigatório: só envolvidos (com regras de transição no controller) ou admin
router.patch(
  "/:id/status",
  mustBeReservationParticipant,
  pickHandler("updateReservationStatusController")
);

// PATCH /reservations/:id/rating
// ⚠️ Endpoint legado (rating dentro de reserva). Você já tem reviews como entidade.
// Mantido enquanto você não remove do front.
// ✅ ownership obrigatório também.
router.patch(
  "/:id/rating",
  mustBeReservationParticipant,
  pickHandler("updateReservationRatingController")
);

module.exports = router;