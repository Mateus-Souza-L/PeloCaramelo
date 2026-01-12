// backend/src/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const app = express();

// ===== Rotas =====
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

// ===== Middlewares =====
const authMiddleware = require("./middleware/authMiddleware");
const adminMiddleware = require("./middleware/adminMiddleware");

// ===== CORS =====
// Aceita múltiplas origens via env (separadas por vírgula)
// Ex: CORS_ORIGIN="http://localhost:5173,https://pelocaramelo.vercel.app,https://pelocaramelo.com.br"
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Se você for usar cookies no futuro, mantenha credentials:true
app.use(
  cors({
    origin: function (origin, callback) {
      // origin undefined acontece em curl/postman/healthcheck
      if (!origin) return callback(null, true);

      // libera se estiver na lista
      if (allowedOrigins.includes(origin)) return callback(null, true);

      // bloqueia o resto
      return callback(new Error(`CORS bloqueado para origem: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// garante preflight
app.options("*", cors());

// ===== Body parsers (SEM tapa-buraco) =====
// ✅ JSON + urlencoded devem vir ANTES das rotas
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// logs
app.use(morgan("dev"));

// ===== Rotas PÚBLICAS =====
app.use("/auth", authRoutes);
app.use("/caregivers", caregiverRoutes);

// ===== Rotas MISTAS =====
app.use("/availability", availabilityRoutes);

// 🔒 Notifications: auth já é aplicado dentro de notificationRoutes (router.use)
app.use("/notifications", notificationRoutes);

// ===== Rotas PROTEGIDAS =====
app.use("/users", authMiddleware, userRoutes);
app.use("/reservations", authMiddleware, reservationRoutes);
app.use("/chat", authMiddleware, chatRoutes);
app.use("/pets", authMiddleware, petRoutes);

// ===== Rotas ADMIN =====
app.use("/admin", authMiddleware, adminMiddleware, adminRoutes);

// Reviews públicas/privadas conforme seu reviewRoutes
app.use("/reviews", reviewRoutes);

// ===== Healthcheck simples =====
app.get("/", (req, res) => {
  res.json({ ok: true, message: "PeloCaramelo API rodando 🐾" });
});

// ===== Erros de parse / payload =====

// ✅ JSON inválido (ex.: body veio quebrado / não-JSON com Content-Type JSON)
app.use((err, req, res, next) => {
  // body-parser/express.json costuma setar:
  // err instanceof SyntaxError && err.status === 400 && "body" in err
  const isJsonSyntaxError =
    err instanceof SyntaxError && err.status === 400 && "body" in err;

  if (isJsonSyntaxError) {
    return res.status(400).json({
      ok: false,
      error: "JSON inválido no body da requisição.",
    });
  }

  // ✅ Payload muito grande
  if (err?.type === "entity.too.large") {
    return res.status(413).json({
      ok: false,
      error:
        "Payload muito grande. Envie imagens menores (thumbnail) ou reduza o tamanho do conteúdo enviado.",
    });
  }

  return next(err);
});

// ===== Start do servidor =====
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 API ouvindo na porta ${PORT}`);
});

module.exports = app;
