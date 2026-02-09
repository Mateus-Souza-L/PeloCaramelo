// backend/src/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const http = require("http");
const compression = require("compression");

const app = express();

// ✅ Render/proxy: necessário para express-rate-limit e IP real
app.set("trust proxy", 1);

// não expõe "Express" no header
app.disable("x-powered-by");

/* ===========================================================
   ✅ CORS
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
    // requests server-to-server / curl / health check
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
   ✅ Headers básicos (seguros, sem quebrar o app)
   =========================================================== */
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

/* ===========================================================
   ✅ Compressão (ajuda principalmente JSON grande)
   =========================================================== */
app.use(
  compression({
    // só comprime respostas razoavelmente grandes
    threshold: 1024,
  })
);

/* ===========================================================
   ✅ Body parsers
   =========================================================== */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* ===========================================================
   ✅ DB
   =========================================================== */
const pool = require("./config/db");

/* ===========================================================
   ✅ HEALTHCHECKS
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
   ✅ Logs
   =========================================================== */
app.use(morgan("dev"));

/* ===========================================================
   ✅ Debug: Email (Resend) - remover depois
   =========================================================== */
const { sendEmail } = require("./services/emailService");

// só pra confirmar se o backend leu a variável do .env (sem vazar a chave inteira)
app.get("/debug/email-env", (req, res) => {
  const key = process.env.RESEND_API_KEY || "";
  return res.json({
    ok: true,
    hasResendKey: Boolean(key),
    resendKeyPrefix: key ? `${key.slice(0, 8)}...` : null,
    emailFrom: process.env.EMAIL_FROM || null,
    nodeEnv: process.env.NODE_ENV || null,
  });
});

// dispara um email real pelo Resend (GET simples só pra testar)
app.get("/debug/test-email", async (req, res) => {
  try {
    const to = String(req.query.to || "").trim();
    if (!to) {
      return res.status(400).json({ ok: false, error: "Passe ?to=seuemail@..." });
    }

    const result = await sendEmail({
      to,
      subject: "Teste Resend - PeloCaramelo",
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>Teste Resend ✅</h2>
          <p>Se você recebeu este e-mail, o envio via Resend está funcionando.</p>
          <p><b>Data:</b> ${new Date().toISOString()}</p>
        </div>
      `,
    });

    return res.json({ ok: true, result });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || String(err),
    });
  }
});

/* ===========================================================
   ✅ Rotas
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

// ✅ NOVO: Contato (orçamento de palestra)
const contactRoutes = require("./routes/contactRoutes");

/* ===========================================================
   ✅ Middlewares
   =========================================================== */
const authMiddleware = require("./middleware/authMiddleware");

/**
 * Guard de bloqueio (motivo + tempo)
 * - Compatível mesmo se o schema não tiver blocked_reason/blocked_until
 * - Admin não é bloqueado por este guard (pra não perder acesso ao painel)
 */
let _blockColsChecked = false;
let _hasBlockedReason = false;
let _hasBlockedUntil = false;

async function checkBlockColumnsOnce() {
  if (_blockColsChecked) return;
  _blockColsChecked = true;

  try {
    const q = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name IN ('blocked_reason', 'blocked_until')
    `;
    const { rows } = await pool.query(q);
    const set = new Set((rows || []).map((r) => String(r.column_name)));
    _hasBlockedReason = set.has("blocked_reason");
    _hasBlockedUntil = set.has("blocked_until");
  } catch {
    _hasBlockedReason = false;
    _hasBlockedUntil = false;
  }
}

function normalizeISO(v) {
  if (!v) return null;
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

async function blockedGuard(req, res, next) {
  try {
    const userId = req.user?.id ? String(req.user.id) : null;
    const role = req.user?.role ? String(req.user.role).toLowerCase() : null;

    if (!userId) return next();
    if (role === "admin" || role === "admin_master") return next();

    await checkBlockColumnsOnce();

    const cols = [
      "blocked",
      _hasBlockedReason ? "blocked_reason" : "NULL::text AS blocked_reason",
      _hasBlockedUntil ? "blocked_until" : "NULL::timestamptz AS blocked_until",
    ].join(", ");

    const { rows } = await pool.query(
      `
      SELECT ${cols}
      FROM users
      WHERE id::text = $1::text
      LIMIT 1
      `,
      [userId]
    );

    const u = rows?.[0];
    if (!u) return next();

    const isBlocked = Boolean(u.blocked);
    if (!isBlocked) return next();

    const reason = u.blocked_reason ? String(u.blocked_reason) : null;
    const blockedUntil = normalizeISO(u.blocked_until);

    if (blockedUntil) {
      const now = Date.now();
      const untilMs = new Date(blockedUntil).getTime();
      if (!Number.isNaN(untilMs) && untilMs <= now) return next();
    }

    return res.status(403).json({
      ok: false,
      code: "USER_BLOCKED",
      error: "Sua conta está bloqueada no momento.",
      reason: reason || "Bloqueio administrativo",
      blockedUntil,
    });
  } catch (err) {
    console.error("[BLOCKED GUARD ERROR]", err);
    return next();
  }
}

/* ===========================================================
   ✅ Rotas públicas
   =========================================================== */
app.use("/auth", authRoutes);
app.use("/caregivers", caregiverRoutes);
app.use("/contact", contactRoutes);

/* ===========================================================
   ✅ Rotas mistas
   =========================================================== */
app.use("/availability", availabilityRoutes);
app.use("/notifications", notificationRoutes);

/* ===========================================================
   ✅ Rotas protegidas (com guard de bloqueio)
   =========================================================== */
app.use("/users", authMiddleware, blockedGuard, userRoutes);
app.use("/reservations", authMiddleware, blockedGuard, reservationRoutes);
app.use("/chat", authMiddleware, blockedGuard, chatRoutes);
app.use("/pets", authMiddleware, blockedGuard, petRoutes);

/* ===========================================================
   ✅ Rotas admin
   =========================================================== */
app.use("/admin", adminRoutes);

/* ===========================================================
   ✅ Reviews
   =========================================================== */
app.use("/reviews", reviewRoutes);

/* ===========================================================
   ✅ Root (assinatura de build)
   =========================================================== */
app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "PeloCaramelo API rodando 🐾 (BUILD: health-v1 + compression + socket)",
    allowedOrigins,
    allowVercelPreview: true,
  });
});

/* ===========================================================
   ✅ Tratamento de erros
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
   ✅ Start (HTTP server + Socket.IO)
   =========================================================== */
const PORT = process.env.PORT || 4000;

const httpServer = http.createServer(app);

// Socket.IO
const { initSocket } = require("./socket");
const io = initSocket(httpServer);

// deixa o io acessível nos controllers: req.app.get("io")
app.set("io", io);

httpServer.listen(PORT, () => {
  console.log(`🚀 API ouvindo na porta ${PORT}`);
  console.log("🌐 CORS_ORIGIN =", process.env.CORS_ORIGIN || "(default localhost)");
  console.log("🌐 Vercel preview liberado: https://pelo-caramelo-*.vercel.app");
  console.log("🩺 Health endpoints ativos: /health e /health/db");
  console.log("🗜️ Compression ativo");
  console.log("🔌 Socket.IO ativo");
});

module.exports = app;
