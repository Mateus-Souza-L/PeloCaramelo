// backend/src/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const app = express();

/* ===========================================================
   CORS
   =========================================================== */
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// libera qualquer preview do seu projeto na Vercel
function isAllowedVercelPreview(origin) {
  if (typeof origin !== "string") return false;
  return /^https:\/\/pelo-caramelo-.*\.vercel\.app$/.test(origin);
}

const corsOptions = {
  origin: function (origin, callback) {
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
app.options("*", cors(corsOptions));

/* ===========================================================
   Body parsers
   =========================================================== */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* ===========================================================
   DB
   =========================================================== */
const pool = require("./config/db");

/* ===========================================================
   HEALTHCHECKS
   =========================================================== */
app.get("/health", (req, res) => {
  res.status(200).json({ ok: true, status: "up" });
});

app.get("/health/db", async (req, res) => {
  try {
    const r = await pool.query("select 1 as ok");
    res.status(200).json({ ok: true, db: true, result: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, db: false, error: e.message });
  }
});

/* ===========================================================
   Logs
   =========================================================== */
app.use(morgan("dev"));

/* ===========================================================
   Rotas
   =========================================================== */
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const caregiverRoutes = require("./routes/caregiverRoutes");
const reservationRoutes = require("./routes/reservationRoutes");
const chatRoutes = require("./routes/chatRoutes");
const petRoutes = require("./routes/petRoutes");
const adminRoutes = require("./routes/adminRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const availabilityRoutes = require("./routes/availabilityRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

/* ===========================================================
   Middlewares
   =========================================================== */
const authMiddleware = require("./middleware/authMiddleware");
const adminMiddleware = require("./middleware/adminMiddleware");

/* ===========================================================
   Rotas públicas
   =========================================================== */
app.use("/auth", authRoutes);
app.use("/caregivers", caregiverRoutes);

/* ===========================================================
   Rotas mistas
   =========================================================== */
app.use("/availability", availabilityRoutes);
app.use("/notifications", notificationRoutes);

/* ===========================================================
   Rotas protegidas
   =========================================================== */
app.use("/users", authMiddleware, userRoutes);
app.use("/reservations", authMiddleware, reservationRoutes);
app.use("/chat", authMiddleware, chatRoutes);
app.use("/pets", authMiddleware, petRoutes);

/* ===========================================================
   Rotas admin
   =========================================================== */
app.use("/admin", authMiddleware, adminMiddleware, adminRoutes);

/* ===========================================================
   Reviews
   =========================================================== */
app.use("/reviews", reviewRoutes);

/* ===========================================================
   Root (assinatura de build)
   =========================================================== */
app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "PeloCaramelo API rodando 🐾 (BUILD: health-v1)",
    allowedOrigins,
    allowVercelPreview: true,
  });
});

/* ===========================================================
   Tratamento de erros
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
      error: "Payload muito grande.",
    });
  }

  if (String(err?.message || "").startsWith("CORS bloqueado para origem:")) {
    return res.status(403).json({
      ok: false,
      error: err.message,
    });
  }

  return next(err);
});

app.use((err, req, res, next) => {
  console.error("[SERVER ERROR]", err);
  res.status(500).json({
    ok: false,
    error: "Erro interno no servidor.",
  });
});

/* ===========================================================
   Start
   =========================================================== */
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 API ouvindo na porta ${PORT}`);
  console.log("🌐 CORS_ORIGIN =", process.env.CORS_ORIGIN || "(default localhost)");
  console.log("🌐 Vercel preview liberado: https://pelo-caramelo-*.vercel.app");
  console.log("🩺 Health endpoints ativos: /health e /health/db");
});

module.exports = app;
