// backend/src/socket.js
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const pool = require("./config/db");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-trocar-em-producao";

function parseOrigins() {
  const raw = String(process.env.CORS_ORIGIN || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAllowedVercelPreview(origin) {
  if (typeof origin !== "string") return false;
  return /^https:\/\/pelo-caramelo-.*\.vercel\.app$/.test(origin);
}

async function canJoinReservationRoom(userId, reservationId) {
  try {
    const { rows } = await pool.query(
      `
      SELECT id, tutor_id, caregiver_id
      FROM reservations
      WHERE id::text = $1::text
      LIMIT 1
      `,
      [String(reservationId)]
    );

    const r = rows?.[0];
    if (!r) return false;

    const uid = String(userId);
    const isTutor = String(r.tutor_id) === uid;
    const isCaregiver = String(r.caregiver_id) === uid;

    return isTutor || isCaregiver;
  } catch (e) {
    console.error("[socket] canJoinReservationRoom error:", e);
    return false;
  }
}

function initSocket(httpServer) {
  const allowedOrigins = parseOrigins();

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // sem origin: permite (ex.: curl, alguns clientes, etc.)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin) || isAllowedVercelPreview(origin)) {
          return callback(null, true);
        }

        return callback(new Error(`CORS bloqueado para origem: ${origin}`));
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  // auth via JWT no handshake
  io.use((socket, next) => {
    try {
      const token =
        socket.handshake?.auth?.token ||
        socket.handshake?.headers?.authorization?.replace(/^Bearer\s+/i, "") ||
        "";

      if (!token) return next(new Error("UNAUTHORIZED"));

      const decoded = jwt.verify(token, JWT_SECRET);
      socket.user = { id: decoded.id, role: decoded.role };
      return next();
    } catch {
      return next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket) => {
    const role = String(socket.user?.role || "").toLowerCase();
    const isAdminLike = role === "admin" || role === "admin_master";

    socket.on("join:reservation", async ({ reservationId }) => {
      const rid = String(reservationId || "").trim();
      if (!rid) return;

      if (!isAdminLike) {
        const ok = await canJoinReservationRoom(socket.user.id, rid);
        if (!ok) {
          socket.emit("join:reservation:error", {
            reservationId: rid,
            error: "FORBIDDEN",
          });
          return;
        }
      }

      socket.join(`reservation:${rid}`);
      socket.emit("joined:reservation", { reservationId: rid });
    });

    socket.on("leave:reservation", ({ reservationId }) => {
      const rid = String(reservationId || "").trim();
      if (!rid) return;
      socket.leave(`reservation:${rid}`);
    });
  });

  return io;
}

module.exports = { initSocket };
