// backend/src/socket.js
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const pool = require("./config/db");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-trocar-em-producao";

/* ===========================================================
   CORS helpers
   =========================================================== */
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

function corsOriginChecker(allowedOrigins) {
  return (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || isAllowedVercelPreview(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS bloqueado para origem: ${origin}`));
  };
}

/* ===========================================================
   Room helper
   =========================================================== */
function reservationRoom(reservationId) {
  return `reservation:${String(reservationId)}`;
}

/* ===========================================================
   AuthZ: pode entrar na sala da reserva?
   =========================================================== */
async function canJoinReservationRoom(userId, reservationId) {
  try {
    const rid = String(reservationId || "").trim();
    const uid = String(userId || "").trim();
    if (!rid || !uid) return false;

    const { rows } = await pool.query(
      `
      SELECT id, tutor_id, caregiver_id
      FROM reservations
      WHERE id::text = $1::text
      LIMIT 1
      `,
      [rid]
    );

    const r = rows?.[0];
    if (!r) return false;

    const isTutor = r.tutor_id != null && String(r.tutor_id) === uid;
    const isCaregiver = r.caregiver_id != null && String(r.caregiver_id) === uid;

    return isTutor || isCaregiver;
  } catch (e) {
    console.error("[socket] canJoinReservationRoom error:", e);
    return false;
  }
}

/* ===========================================================
   Anti-abuse
   =========================================================== */
function nowMs() {
  return Date.now();
}

function getClientIp(socket) {
  const xff = socket.handshake?.headers?.["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    return xff.split(",")[0].trim();
  }
  const addr = socket.handshake?.address;
  return typeof addr === "string" && addr.trim() ? addr.trim() : "unknown";
}

function makeWindowLimiter({ maxHits, windowMs, blockMs }) {
  const store = new Map();

  function pruneOld(hits, cutoff) {
    let i = 0;
    while (i < hits.length && hits[i] < cutoff) i++;
    if (i > 0) hits.splice(0, i);
    return hits;
  }

  function hit(key) {
    const t = nowMs();
    const st = store.get(key) || { hits: [], blockedUntil: 0 };

    if (st.blockedUntil && st.blockedUntil > t) {
      return { ok: false, blockedUntil: st.blockedUntil };
    }

    const cutoff = t - windowMs;
    pruneOld(st.hits, cutoff);
    st.hits.push(t);

    if (st.hits.length > maxHits) {
      st.blockedUntil = t + blockMs;
      store.set(key, st);
      return { ok: false, blockedUntil: st.blockedUntil };
    }

    store.set(key, st);
    return { ok: true };
  }

  function gc() {
    const t = nowMs();
    for (const [key, st] of store.entries()) {
      const cutoff = t - windowMs;
      pruneOld(st.hits, cutoff);
      const idle =
        st.hits.length === 0 && (!st.blockedUntil || st.blockedUntil <= t);
      if (idle) store.delete(key);
    }
  }

  return { hit, gc };
}

const connectLimiter = makeWindowLimiter({
  maxHits: 12,
  windowMs: 60 * 1000,
  blockMs: 2 * 60 * 1000,
});

const joinLimiter = makeWindowLimiter({
  maxHits: 30,
  windowMs: 60 * 1000,
  blockMs: 60 * 1000,
});

const ackLimiter = makeWindowLimiter({
  maxHits: 120,
  windowMs: 60 * 1000,
  blockMs: 60 * 1000,
});

setInterval(() => {
  try {
    connectLimiter.gc();
    joinLimiter.gc();
    ackLimiter.gc();
  } catch {}
}, 60 * 1000).unref?.();

/* ===========================================================
   DB helpers (persistência de status)
   IMPORTANTE: UPDATE sempre na TABELA REAL: chat_messages_table
   =========================================================== */
async function persistDelivered({ reservationId, messageId, userId }) {
  try {
    const rid = Number(reservationId);
    const mid = Number(messageId);
    const uid = Number(userId);
    if (!Number.isFinite(rid) || !Number.isFinite(mid) || !Number.isFinite(uid)) return 0;

    const r = await pool.query(
      `
      UPDATE public.chat_messages_table
      SET delivered_at = COALESCE(delivered_at, NOW())
      WHERE id = $1
        AND reservation_id = $2
        AND receiver_id = $3
        AND delivered_at IS NULL
      `,
      [mid, rid, uid]
    );

    return r.rowCount || 0;
  } catch (e) {
    console.error("[socket] persistDelivered error:", e);
    return 0;
  }
}

async function persistReadAll({ reservationId, userId }) {
  try {
    const rid = Number(reservationId);
    const uid = Number(userId);
    if (!Number.isFinite(rid) || !Number.isFinite(uid)) return 0;

    const r = await pool.query(
      `
      UPDATE public.chat_messages_table
      SET
        is_read = TRUE,
        read_at = COALESCE(read_at, NOW())
      WHERE reservation_id = $1
        AND receiver_id = $2
        AND (
          (read_at IS NULL)
          OR (is_read IS NULL OR is_read = FALSE)
        )
      `,
      [rid, uid]
    );

    return r.rowCount || 0;
  } catch (e) {
    console.error("[socket] persistReadAll error:", e);
    return 0;
  }
}

/* ===========================================================
   Init
   =========================================================== */
function initSocket(httpServer) {
  const allowedOrigins = parseOrigins();

  const io = new Server(httpServer, {
    cors: {
      origin: corsOriginChecker(allowedOrigins),
      credentials: true,
      methods: ["GET", "POST"],
    },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  io.use((socket, next) => {
    try {
      const token =
        socket.handshake?.auth?.token ||
        socket.handshake?.headers?.authorization?.replace(/^Bearer\s+/i, "") ||
        "";

      if (!token) return next(new Error("UNAUTHORIZED"));

      const decoded = jwt.verify(token, JWT_SECRET);

      const userId = String(decoded.id);
      const role = String(decoded.role || "");
      socket.user = { id: userId, role };

      socket.data.allowedReservationIds = new Set();

      const ip = getClientIp(socket);
      const key = `${ip}:${userId}`;

      const r = connectLimiter.hit(key);
      if (!r.ok) return next(new Error("RATE_LIMITED"));

      return next();
    } catch {
      return next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket) => {
    const role = String(socket.user?.role || "").toLowerCase();
    const isAdminLike = role === "admin" || role === "admin_master";
    const userId = String(socket.user?.id || "");
    const ip = getClientIp(socket);
    const baseKey = `${ip}:${userId}`;

    const allowedSet =
      socket.data.allowedReservationIds instanceof Set
        ? socket.data.allowedReservationIds
        : new Set();

    socket.on("join:reservation", async ({ reservationId } = {}) => {
      const rid = String(reservationId || "").trim();
      if (!rid) return;

      const jr = joinLimiter.hit(`${baseKey}:join`);
      if (!jr.ok) {
        socket.emit("join:reservation:error", { reservationId: rid, error: "RATE_LIMITED" });
        return;
      }

      if (!isAdminLike) {
        const ok = await canJoinReservationRoom(userId, rid);
        if (!ok) {
          socket.emit("join:reservation:error", { reservationId: rid, error: "FORBIDDEN" });
          return;
        }
      }

      allowedSet.add(String(rid));
      socket.data.allowedReservationIds = allowedSet;

      socket.join(reservationRoom(rid));
      socket.emit("joined:reservation", { reservationId: rid });
    });

    socket.on("leave:reservation", ({ reservationId } = {}) => {
      const rid = String(reservationId || "").trim();
      if (!rid) return;

      allowedSet.delete(String(rid));
      socket.data.allowedReservationIds = allowedSet;

      socket.leave(reservationRoom(rid));
    });

    socket.on("disconnect", () => {
      try {
        allowedSet.clear();
      } catch {}
    });

    // =========================
    // ✅ delivered (persist + emit)
    // =========================
    socket.on("chat:delivered", async ({ reservationId, messageId } = {}) => {
      const rid = String(reservationId || "").trim();
      const mid = messageId != null ? String(messageId).trim() : "";
      if (!rid || !mid) return;

      const ar = ackLimiter.hit(`${baseKey}:ack`);
      if (!ar.ok) return;

      if (!isAdminLike && !allowedSet.has(String(rid))) return;

      const room = reservationRoom(rid);
      const isInRoom = socket.rooms?.has?.(room);
      if (!isInRoom) return;

      // ✅ persiste no banco (tabela real)
      await persistDelivered({ reservationId: rid, messageId: mid, userId });

      io.to(room).emit("chat:delivered", {
        reservationId: rid,
        messageId: mid,
        byUserId: userId,
        at: new Date().toISOString(),
      });
    });

    // =========================
    // ✅ read (persist + emit)
    // =========================
    socket.on("chat:read", async ({ reservationId } = {}) => {
      const rid = String(reservationId || "").trim();
      if (!rid) return;

      const ar = ackLimiter.hit(`${baseKey}:ack`);
      if (!ar.ok) return;

      if (!isAdminLike && !allowedSet.has(String(rid))) return;

      const room = reservationRoom(rid);
      const isInRoom = socket.rooms?.has?.(room);
      if (!isInRoom) return;

      const updated = await persistReadAll({ reservationId: rid, userId });

      io.to(room).emit("chat:read", {
        reservationId: rid,
        byUserId: userId,
        at: new Date().toISOString(),
        updated: Number(updated) || 0,
      });
    });
  });

  return io;
}

module.exports = { initSocket };
