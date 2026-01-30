// backend/src/routes/reservationRoutes.js
const express = require("express");
const reservationController = require("../controllers/reservationController");
const authMiddleware = require("../middleware/authMiddleware");
const requireCaregiverProfile = require("../middleware/requireCaregiverProfile");

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
 * Guard simples por papel (role do token).
 * ✅ Ajuste: aceita role em lowercase e inclui admin/admin_master.
 */
function requireRole(...allowedRoles) {
  const allowed = new Set(allowedRoles.map((r) => String(r || "").toLowerCase().trim()));

  return (req, res, next) => {
    const role = String(req.user?.role || "").toLowerCase().trim();

    if (!role) {
      return res.status(401).json({
        error: "Não autenticado. Faça login novamente.",
        code: "UNAUTHENTICATED",
      });
    }

    if (!allowed.has(role)) {
      return res.status(403).json({
        error: "Você não tem permissão para acessar este recurso.",
        code: "FORBIDDEN_ROLE",
        role,
      });
    }

    return next();
  };
}

/**
 * ✅ Admin-like
 */
function requireAdminLike() {
  return requireRole("admin", "admin_master");
}

/**
 * ✅ Admin OU Perfil Cuidador
 * - Admin/admin_master passa
 * - Usuário comum passa se tiver caregiver_profiles (perfil cuidador)
 */
function requireAdminOrCaregiverProfile() {
  return (req, res, next) => {
    const role = String(req.user?.role || "").toLowerCase().trim();
    const isAdminLike = role === "admin" || role === "admin_master";
    if (isAdminLike) return next();

    return requireCaregiverProfile(req, res, next);
  };
}

/**
 * ✅ Admin-like OU usuário logado (qualquer role)
 * Útil quando o token pode vir "tutor" mesmo para cuidador (multi-perfil),
 * mas a rota não deveria depender do role e sim do "ownership" ou query interna.
 */
function requireAnyLoggedUserOrAdmin() {
  return (req, res, next) => {
    if (req.user?.id) return next();
    return res.status(401).json({
      error: "Não autenticado.",
      code: "UNAUTHENTICATED",
    });
  };
}

/**
 * ✅ Paginação (page/limit) — default e clamp
 * - page >= 1
 * - limit entre 1..50
 * - defaultLimit = 6 (igual ao front)
 * Observação: mantém compatibilidade; o controller pode seguir lendo req.query.
 */
function applyPaginationDefaults({ defaultLimit = 6, maxLimit = 50 } = {}) {
  return (req, _res, next) => {
    const rawPage = req.query?.page;
    const rawLimit = req.query?.limit;

    const pageNum = Math.max(1, Math.trunc(Number(rawPage || 1) || 1));

    let limitNum = Math.trunc(Number(rawLimit || defaultLimit) || defaultLimit);
    if (!Number.isFinite(limitNum) || limitNum <= 0) limitNum = defaultLimit;
    limitNum = Math.max(1, Math.min(maxLimit, limitNum));

    // escreve de volta como string (padrão do querystring)
    req.query.page = String(pageNum);
    req.query.limit = String(limitNum);

    next();
  };
}

/**
 * Fail-closed: se o middleware de ownership ainda não existir,
 * bloqueia rotas sensíveis ao invés de deixar inseguro.
 */
function safeRequireReservationOwnership() {
  try {
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
// ✅ Multi-perfil: criar reserva é fluxo de tutor.
// Mantemos "tutor" e admin-like, mas aceitando lowercase.
router.post(
  "/",
  requireRole("tutor", "admin", "admin_master"),
  pickHandler("createReservationController")
);

// GET /reservations/tutor
// ✅ Aqui NÃO deve depender do role do token em multi-perfil.
// O controller já lista por user.id. Então basta estar logado.
// (Admin continua funcionando, pois também está logado.)
// ✅ Suporta paginação: ?page=1&limit=6
router.get(
  "/tutor",
  requireAnyLoggedUserOrAdmin(),
  applyPaginationDefaults({ defaultLimit: 6, maxLimit: 50 }),
  pickHandler("listTutorReservationsController")
);

// GET /reservations/caregiver
// ✅ Admin OU tem caregiver_profiles (perfil cuidador)
// ✅ Suporta paginação: ?page=1&limit=6
router.get(
  "/caregiver",
  requireAdminOrCaregiverProfile(),
  applyPaginationDefaults({ defaultLimit: 6, maxLimit: 50 }),
  pickHandler("listCaregiverReservationsController")
);

// GET /reservations/my-evaluations
// ✅ Também não deve depender do role do token (multi-perfil).
// O endpoint já usa req.user.id, e aplica filtro de isAdmin internamente.
router.get(
  "/my-evaluations",
  requireAnyLoggedUserOrAdmin(),
  pickHandler("listMyEvaluationsController")
);

// GET /reservations/:id
// ✅ ownership obrigatório: só envolvidos (tutor/caregiver) ou admin
router.get(
  "/:id",
  mustBeReservationParticipant,
  pickHandler("getReservationDetailController")
);

// PATCH/PUT /reservations/:id/status
router.patch(
  "/:id/status",
  mustBeReservationParticipant,
  pickHandler("updateReservationStatusController")
);

router.put(
  "/:id/status",
  mustBeReservationParticipant,
  pickHandler("updateReservationStatusController")
);

// PATCH /reservations/:id/rating (legado)
router.patch(
  "/:id/rating",
  mustBeReservationParticipant,
  pickHandler("updateReservationRatingController")
);

module.exports = router;
