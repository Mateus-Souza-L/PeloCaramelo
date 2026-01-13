// backend/src/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const app = express();

/* ===========================================================
   ✅ CORS
   - Produção (Vercel): https://pelo-caramelo.vercel.app
   - Preview/Deploy Vercel: https://pelo-caramelo-<hash>-<user>.vercel.app
   - Dev: http://localhost:5173
   - Configure no Render:
     CORS_ORIGIN="http://localhost:5173,https://pelo-caramelo.vercel.app"
   =========================================================== */
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ✅ libera qualquer preview do seu projeto na Vercel (pelo-caramelo-*.vercel.app)
function isAllowedVercelPreview(origin) {
  if (typeof origin !== "string") return false;
  return /^https:\/\/pelo-caramelo-.*\.vercel\.app$/.test(origin);
}

const corsOptions = {
  origin: function (origin, callback) {
    // origin undefined = curl, postman, healthcheck
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin) || isAllowedVercelPreview(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS bloqueado para origem: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Cache-Control", "Pragma"],
};

app.use(cors(corsOptions));
// Preflight
app.options("*", cors(corsOptions));

/* ===========================================================
   ✅ Body parsers (ANTES das rotas)
   =========================================================== */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// logs
app.use(morgan("dev"));

/* ===========================================================
   ===== Rotas =====
   =========================================================== */
const authRoutes = require("./routes/authRoutes"); // /auth/...
const userRoutes = require("./routes/userRoutes"); // /users/...
const caregiverRoutes = require("./routes/caregiverRoutes"); // /caregivers/...
const reservationRoutes = require("./routes/reservationRoutes"); // /reservations/...
const chatRoutes = require("./routes/chatRoutes"); // /chat/...
const petRoutes = require("./routes/petRoutes"); // /pets/...
const adminRoutes = require("./routes/adminRoutes"); // /admin/...
const reviewRoutes = require("./routes/reviewRoutes"); // /reviews/...

// ✅ availability
const availabilityRoutes = require("./routes/availabilityRoutes"); // /availability/...

// ✅ notifications
const notificationRoutes = require("./routes/notificationRoutes"); // /notifications/...

/* ===========================================================
   ===== Middlewares =====
   =========================================================== */
const authMiddleware = require("./middleware/authMiddleware");
const adminMiddleware = require("./middleware/adminMiddleware");

/* ===========================================================
   ===== Rotas PÚBLICAS =====
   =========================================================== */
app.use("/auth", authRoutes);
app.use("/caregivers", caregiverRoutes);

/* ===========================================================
   ===== Rotas MISTAS =====
   =========================================================== */
app.use("/availability", availabilityRoutes);

// 🔒 Notifications: auth já é aplicado dentro de notificationRoutes (router.use)
app.use("/notifications", notificationRoutes);

/* ===========================================================
   ===== Rotas PROTEGIDAS =====
   =========================================================== */
app.use("/users", authMiddleware, userRoutes);
app.use("/reservations", authMiddleware, reservationRoutes);
app.use("/chat", authMiddleware, chatRoutes);
app.use("/pets", authMiddleware, petRoutes);

/* ===========================================================
   ===== Rotas ADMIN =====
   =========================================================== */
app.use("/admin", authMiddleware, adminMiddleware, adminRoutes);

/* ===========================================================
   Reviews públicas/privadas conforme seu reviewRoutes
   =========================================================== */
app.use("/reviews", reviewRoutes);

/* ===========================================================
   ✅ Healthcheck simples
   =========================================================== */
app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "PeloCaramelo API rodando 🐾",
    allowedOrigins,
    allowVercelPreview: true,
  });
});

/* ===========================================================
   ✅ Erros de parse / payload
   =========================================================== */
app.use((err, req, res, next) => {
  const isJsonSyntaxError =
    err instanceof SyntaxError && err.status === 400 && "body" in err;

  if (isJsonSyntaxError) {
    return res.status(400).json({
      ok: false,
      error: "JSON inválido no body da requisição.",
    });
  }

  if (err?.type === "entity.too.large") {
    return res.status(413).json({
      ok: false,
      error:
        "Payload muito grande. Envie imagens menores (thumbnail) ou reduza o tamanho do conteúdo enviado.",
    });
  }

  // ✅ CORS bloqueado (melhor mensagem)
  if (String(err?.message || "").startsWith("CORS bloqueado para origem:")) {
    return res.status(403).json({
      ok: false,
      error: err.message,
      hint:
        "Adicione essa origem na env CORS_ORIGIN do backend (Render) e faça redeploy. " +
        "Se for preview da Vercel, confira se começa com https://pelo-caramelo- e termina com .vercel.app.",
    });
  }

  return next(err);
});

/* ===========================================================
   ✅ Fallback de erro (último middleware)
   =========================================================== */
app.use((err, req, res, next) => {
  console.error("[SERVER ERROR]", err);
  return res.status(500).json({
    ok: false,
    error: "Erro interno no servidor.",
  });
});

/* ===========================================================
   ✅ Start do servidor
   =========================================================== */
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 API ouvindo na porta ${PORT}`);
  console.log("🌐 CORS_ORIGIN =", process.env.CORS_ORIGIN || "(default localhost)");
  console.log("🌐 Vercel preview liberado: https://pelo-caramelo-*.vercel.app");
});

module.exports = app;
