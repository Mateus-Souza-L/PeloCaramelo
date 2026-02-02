// frontend/src/components/ChatBox.jsx
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { io } from "socket.io-client";
import {
  getChatMessages,
  sendChatMessage,
  getUnreadChats,
  markChatAsRead,
} from "../api/chatApi";
import { useToast } from "./ToastProvider";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

// janela para “colar” msg otimista + msg real (ms)
const DEDUPE_WINDOW_MS = 10_000;

// ✅ Status em que o chat DEVE ficar habilitado
const CHAT_ALLOWED_STATUS = "Aceita";

// normaliza texto (remove acentos + lowercase) p/ comparar status de forma tolerante
function normalizeStr(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isAcceptedStatus(status) {
  if (!status) return null; // não informado
  return normalizeStr(status) === normalizeStr(CHAT_ALLOWED_STATUS);
}

export default function ChatBox({
  reservationId,
  token,
  currentUserId,
  otherUserName,

  // compat: continua existindo
  canChat = true,

  // ✅ novo: se você passar o status, a regra “só enquanto Aceita” vira automática
  reservationStatus = null,

  onNewMessage,
}) {
  const { showToast } = useToast();

  // ✅ regra final do chat
  const accepted = useMemo(() => isAcceptedStatus(reservationStatus), [reservationStatus]);

  // - Se status foi informado: só permite chat se for "Aceita"
  // - Se status NÃO foi informado: mantém comportamento antigo (canChat)
  const effectiveCanChat = useMemo(() => {
    if (accepted === null) return !!canChat; // compat com fluxo atual
    return !!canChat && accepted;
  }, [canChat, accepted]);

  const disabledReason = useMemo(() => {
    if (!canChat) return "O chat desta reserva está desativado no momento.";
    if (accepted === null) return "O chat desta reserva está desativado no momento."; // status não informado → fallback
    if (accepted) return null;
    // status informado e não é Aceita
    return "O chat fica disponível apenas enquanto a reserva estiver Aceita. Esta reserva já foi finalizada/encerrada.";
  }, [canChat, accepted]);

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");

  const [hasNewWhileAway, setHasNewWhileAway] = useState(false);

  const containerRef = useRef(null);
  const rootRef = useRef(null);

  const lastMessageIdRef = useRef(null);
  const initialLoadRef = useRef(true);
  const isAtBottomRef = useRef(true);

  const lastNewEventIdRef = useRef(null);
  const isInViewportRef = useRef(true);

  // Socket refs
  const socketRef = useRef(null);
  const joinedRef = useRef(false);
  const connectedRef = useRef(false);

  // Fallback polling control
  const pollingTimerRef = useRef(null);
  const allowPollingRef = useRef(true);
  const pollingTickRef = useRef(null);

  // ✅ cooldown local se o backend rate-limitou conexão
  const socketCooldownUntilRef = useRef(0);
  const SOCKET_COOLDOWN_MS = 60_000;

  // ✅ anti-spam de refresh unread
  const lastUnreadRefreshAtRef = useRef(0);
  const UNREAD_REFRESH_COOLDOWN_MS = 4000;

  // ✅ anti-spam de "mark read"
  const lastMarkReadAtRef = useRef(0);
  const markReadInFlightRef = useRef(false);
  const MARK_READ_COOLDOWN_MS = 2000;

  // ---------------------------
  // Helpers de autor da mensagem
  // ---------------------------
  const getSenderId = useCallback(
    (m) =>
      m?.sender_id ??
      m?.senderId ??
      m?.from_user_id ??
      m?.fromUserId ??
      m?.from_user ??
      m?.fromUser ??
      m?.user_id ??
      m?.userId ??
      null,
    []
  );

  const getMsgText = useCallback((m) => {
    return String(m?.message ?? m?.text ?? m?.content ?? "").trim();
  }, []);

  const getMsgTimeMs = useCallback((m) => {
    const raw = m?.created_at ?? m?.createdAt ?? m?.created ?? m?.timestamp ?? null;
    if (!raw) return 0;
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : 0;
  }, []);

  const isOptimistic = useCallback((m) => {
    return m?.__optimistic === true || String(m?.id || "").startsWith("temp-");
  }, []);

  const isMineMsg = useCallback(
    (m) => String(getSenderId(m)) === String(currentUserId),
    [getSenderId, currentUserId]
  );

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    });
  }, []);

  // ---------------------------
  // ✅ DEDUPE / SQUASH
  // ---------------------------
  const pickBetter = useCallback(
    (a, b) => {
      const aOpt = isOptimistic(a);
      const bOpt = isOptimistic(b);

      if (aOpt && !bOpt) return { ...a, ...b, __optimistic: false };
      if (!aOpt && bOpt) return { ...b, ...a, __optimistic: false };

      const aStatus = a?.status || (a?.read_at ? "read" : undefined);
      const bStatus = b?.status || (b?.read_at ? "read" : undefined);

      const rank = (s) => {
        if (s === "read") return 3;
        if (s === "delivered") return 2;
        if (s === "sent" || s === "enviada") return 1;
        if (s === "sending") return 0;
        return 0;
      };

      if (rank(bStatus) > rank(aStatus)) return { ...a, ...b };
      if (rank(aStatus) > rank(bStatus)) return { ...b, ...a };

      return { ...a, ...b };
    },
    [isOptimistic]
  );

  // “igualdade” por conteúdo + janela de tempo
  const sameContentNear = useCallback(
    (a, b) => {
      if (!a || !b) return false;
      if (String(getSenderId(a)) !== String(getSenderId(b))) return false;
      const ta = getMsgText(a);
      const tb = getMsgText(b);
      if (!ta || !tb) return false;
      if (ta !== tb) return false;

      const da = getMsgTimeMs(a);
      const db = getMsgTimeMs(b);

      // se um deles não tem tempo confiável, ainda cola se for otimista
      if ((!da || !db) && (isOptimistic(a) || isOptimistic(b))) return true;

      return Math.abs((da || 0) - (db || 0)) <= DEDUPE_WINDOW_MS;
    },
    [getSenderId, getMsgText, getMsgTimeMs, isOptimistic]
  );

  // Remove duplicatas “coladas” (mesmo autor+texto em tempo próximo)
  const squashNearDuplicates = useCallback(
    (list) => {
      const arr = Array.isArray(list) ? [...list] : [];
      arr.sort((a, b) => getMsgTimeMs(a) - getMsgTimeMs(b));

      const out = [];
      for (const m of arr) {
        const prev = out[out.length - 1];
        if (prev && sameContentNear(prev, m)) {
          out[out.length - 1] = pickBetter(prev, m);
        } else {
          out.push(m);
        }
      }
      return out;
    },
    [getMsgTimeMs, sameContentNear, pickBetter]
  );

  // merge “safe”
  const mergeSafe = useCallback(
    (prevList, incomingList) => {
      const prev = Array.isArray(prevList) ? prevList : [];
      const inc = Array.isArray(incomingList) ? incomingList : [];
      const map = new Map();

      const key = (m) => {
        const cid = m?.clientId ?? m?.client_id ?? null;
        if (cid) return `c:${String(cid)}`;
        const id = m?.id ?? m?.message_id ?? null;
        if (id != null) return `i:${String(id)}`;
        return `u:${Math.random().toString(16).slice(2)}`;
      };

      const push = (m) => {
        if (!m) return;
        const k = key(m);
        if (!map.has(k)) map.set(k, m);
        else map.set(k, pickBetter(map.get(k), m));
      };

      prev.forEach(push);
      inc.forEach(push);

      return squashNearDuplicates(Array.from(map.values()));
    },
    [pickBetter, squashNearDuplicates]
  );

  // ---------------------------
  // NOTIFICAÇÕES (unread)
  // ---------------------------
  const refreshUnread = useCallback(
    async ({ force = false } = {}) => {
      if (!token) return;

      const now = Date.now();
      if (!force && now - lastUnreadRefreshAtRef.current < UNREAD_REFRESH_COOLDOWN_MS) {
        return;
      }
      lastUnreadRefreshAtRef.current = now;

      try {
        const ids = await getUnreadChats(token);
        window.dispatchEvent(new CustomEvent("chat-unread-changed", { detail: { list: ids } }));
      } catch {
        // silencioso
      }
    },
    [token]
  );

  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  const setPollingEnabled = useCallback(
    (enabled) => {
      allowPollingRef.current = !!enabled;

      if (!enabled) {
        stopPolling();
        return;
      }

      if (pollingTickRef.current) {
        stopPolling();
        pollingTimerRef.current = setInterval(() => {
          pollingTickRef.current?.();
        }, 8000);
      }
    },
    [stopPolling]
  );

  const markReadServer = useCallback(
    async ({ force = false } = {}) => {
      if (!reservationId || !token) return;
      if (!effectiveCanChat) return;

      if (!force && document.visibilityState !== "visible") return;
      if (!force && !isAtBottomRef.current) return;

      const now = Date.now();
      if (!force && now - lastMarkReadAtRef.current < MARK_READ_COOLDOWN_MS) return;
      if (markReadInFlightRef.current) return;

      markReadInFlightRef.current = true;
      lastMarkReadAtRef.current = now;

      try {
        const resp = await markChatAsRead(reservationId, token);
        const updated = Number(resp?.updated || 0);

        if (updated > 0) {
          await refreshUnread({ force: true });
        }

        setHasNewWhileAway(false);

        const s = socketRef.current;
        if (s && joinedRef.current) {
          try {
            s.emit("chat:read", { reservationId });
          } catch {}
        }
      } catch (err) {
        const status = err?.status ?? err?.response?.status ?? err?.statusCode ?? null;
        if (status === 401 || status === 403) return;
      } finally {
        markReadInFlightRef.current = false;
      }
    },
    [reservationId, token, refreshUnread, effectiveCanChat]
  );

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;

    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distanceToBottom < 40;

    if (isAtBottomRef.current) {
      setHasNewWhileAway(false);
      markReadServer();
    }
  };

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries?.[0];
        if (!entry) return;
        isInViewportRef.current = !!entry.isIntersecting;
      },
      { threshold: 0.25 }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const onScrollBottom = (e) => {
      const rid = e?.detail?.reservationId;
      if (!rid || !reservationId) return;
      if (String(rid) !== String(reservationId)) return;

      scrollToBottom();
      isAtBottomRef.current = true;
      markReadServer({ force: true });
    };

    window.addEventListener("chat-scroll-bottom", onScrollBottom);
    return () => window.removeEventListener("chat-scroll-bottom", onScrollBottom);
  }, [reservationId, scrollToBottom, markReadServer]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (initialLoadRef.current || isAtBottomRef.current) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && isAtBottomRef.current) {
        markReadServer();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [markReadServer]);

  const normalizeList = useCallback(
    (data) => {
      const list = Array.isArray(data) ? data : Array.isArray(data?.messages) ? data.messages : [];
      list.sort((a, b) => getMsgTimeMs(a) - getMsgTimeMs(b));
      return list;
    },
    [getMsgTimeMs]
  );

  const canUseSocket = useMemo(() => {
    return !!(token && reservationId && effectiveCanChat);
  }, [token, reservationId, effectiveCanChat]);

  useEffect(() => {
    if (!canUseSocket) return;

    const now = Date.now();
    if (socketCooldownUntilRef.current > now) {
      setPollingEnabled(true);
      return;
    }

    if (!socketRef.current) {
      socketRef.current = io(API_BASE_URL, {
        transports: ["websocket", "polling"],
        auth: { token },
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 6,
        reconnectionDelay: 800,
        reconnectionDelayMax: 5000,
      });

      socketRef.current.on("connect", () => {
        connectedRef.current = true;
      });

      socketRef.current.on("disconnect", () => {
        connectedRef.current = false;
        joinedRef.current = false;
        setPollingEnabled(true);
      });

      socketRef.current.on("connect_error", (err) => {
        const msg = String(err?.message || "");
        console.warn("[socket] connect_error:", msg || err);

        connectedRef.current = false;
        joinedRef.current = false;
        setPollingEnabled(true);

        if (msg.includes("RATE_LIMITED")) {
          socketCooldownUntilRef.current = Date.now() + SOCKET_COOLDOWN_MS;
          try {
            socketRef.current?.disconnect();
          } catch {}
        }
      });
    }

    const s = socketRef.current;

    joinedRef.current = false;
    s.emit("join:reservation", { reservationId });

    const onJoined = (payload) => {
      if (String(payload?.reservationId) === String(reservationId)) {
        joinedRef.current = true;
        setPollingEnabled(false);
      }
    };

    const onJoinError = (payload) => {
      if (String(payload?.reservationId) === String(reservationId)) {
        console.warn("[socket] join error:", payload);
        joinedRef.current = false;
        setPollingEnabled(true);

        if (String(payload?.error || "") === "RATE_LIMITED") {
          socketCooldownUntilRef.current = Date.now() + 30_000;
        }
      }
    };

    const onSocketMessage = (payload) => {
      const rid = payload?.reservationId;
      const msg = payload?.message;

      if (!rid || String(rid) !== String(reservationId)) return;
      if (!msg) return;

      const fromMe = isMineMsg(msg);

      setMessages((prev) => {
        if (fromMe) {
          const incomingText = getMsgText(msg);
          const incomingTime = getMsgTimeMs(msg) || Date.now();

          let replaced = false;

          const next = prev.map((m) => {
            if (replaced) return m;
            if (!isMineMsg(m)) return m;
            if (!isOptimistic(m)) return m;

            const t = getMsgText(m);
            if (!t || t !== incomingText) return m;

            const tm = getMsgTimeMs(m) || incomingTime;
            if (Math.abs(incomingTime - tm) > DEDUPE_WINDOW_MS) return m;

            replaced = true;
            return {
              ...m,
              ...msg,
              __optimistic: false,
              status: msg?.status || "sent",
            };
          });

          if (replaced) return mergeSafe(next, []);
          return mergeSafe(prev, [msg]);
        }

        return mergeSafe(prev, [msg]);
      });

      if (!fromMe && joinedRef.current) {
        const msgId = msg?.id;
        if (msgId != null) {
          try {
            s.emit("chat:delivered", { reservationId, messageId: msgId });
          } catch {}
        }
      }

      if (fromMe) return;

      const msgId = msg?.id;
      if (msgId != null && String(lastNewEventIdRef.current) === String(msgId)) return;
      if (msgId != null) lastNewEventIdRef.current = msgId;

      try {
        onNewMessage?.({ reservationId });
      } catch {}

      window.dispatchEvent(new CustomEvent("chat-new-message", { detail: { reservationId } }));

      const isVisibleTab = document.visibilityState === "visible";
      const chatOnScreen = isInViewportRef.current;
      const shouldAutoRead = isVisibleTab && isAtBottomRef.current;

      if (isVisibleTab && !chatOnScreen) {
        window.dispatchEvent(
          new CustomEvent("chat-scroll-to-chat", { detail: { reservationId } })
        );
      }

      if (shouldAutoRead) {
        scrollToBottom();
        markReadServer();
      } else {
        setHasNewWhileAway(true);
        refreshUnread();
      }
    };

    const onDelivered = (payload) => {
      const rid = payload?.reservationId;
      const mid = payload?.messageId;
      const by = payload?.byUserId;

      if (!rid || String(rid) !== String(reservationId)) return;
      if (!mid) return;
      if (String(by) === String(currentUserId)) return;

      setMessages((prev) =>
        prev.map((m) => {
          if (String(m?.id) === String(mid) && isMineMsg(m)) {
            return { ...m, status: "delivered" };
          }
          return m;
        })
      );
    };

    const onRead = (payload) => {
      const rid = payload?.reservationId;
      const by = payload?.byUserId;

      if (!rid || String(rid) !== String(reservationId)) return;
      if (String(by) === String(currentUserId)) return;

      setMessages((prev) =>
        prev.map((m) => {
          if (isMineMsg(m)) {
            return { ...m, status: "read", read_at: payload?.at || m.read_at };
          }
          return m;
        })
      );
    };

    s.on("joined:reservation", onJoined);
    s.on("join:reservation:error", onJoinError);
    s.on("chat:message", onSocketMessage);
    s.on("chat:delivered", onDelivered);
    s.on("chat:read", onRead);

    return () => {
      try {
        s.emit("leave:reservation", { reservationId });
      } catch {}

      joinedRef.current = false;
      setPollingEnabled(true);

      s.off("joined:reservation", onJoined);
      s.off("join:reservation:error", onJoinError);
      s.off("chat:message", onSocketMessage);
      s.off("chat:delivered", onDelivered);
      s.off("chat:read", onRead);
    };
  }, [
    canUseSocket,
    reservationId,
    token,
    currentUserId,
    isMineMsg,
    getMsgText,
    getMsgTimeMs,
    isOptimistic,
    onNewMessage,
    scrollToBottom,
    markReadServer,
    refreshUnread,
    setPollingEnabled,
    mergeSafe,
  ]);

  useEffect(() => {
    if (!effectiveCanChat || !reservationId || !token || !currentUserId) return;

    let cancelled = false;
    initialLoadRef.current = true;
    lastMessageIdRef.current = null;
    isAtBottomRef.current = true;
    setHasNewWhileAway(false);
    lastNewEventIdRef.current = null;

    markReadServer({ force: true });

    async function loadMessages({ isPolling = false } = {}) {
      try {
        if (!isPolling && initialLoadRef.current) setLoading(true);

        const data = await getChatMessages(reservationId, token);
        if (cancelled) return;

        const list = normalizeList(data);

        setMessages((prev) => {
          return mergeSafe(prev, list);
        });

        initialLoadRef.current = false;
      } catch (err) {
        const status = err?.status ?? err?.response?.status ?? err?.statusCode ?? null;
        if (status === 401 || status === 403) return;

        console.error("Erro ao carregar mensagens:", err);
        if (!cancelled && !isPolling) {
          showToast(err?.message || "Erro ao carregar mensagens.", "error");
        }
      } finally {
        if (!cancelled && !isPolling) setLoading(false);
      }
    }

    pollingTickRef.current = () => {
      if (!allowPollingRef.current) return;
      loadMessages({ isPolling: true });
    };

    loadMessages({ isPolling: false });

    if (joinedRef.current) {
      setPollingEnabled(false);
    } else {
      setPollingEnabled(true);
    }

    return () => {
      cancelled = true;
      pollingTickRef.current = null;
      stopPolling();
    };
  }, [
    reservationId,
    token,
    effectiveCanChat,
    currentUserId,
    markReadServer,
    showToast,
    normalizeList,
    setPollingEnabled,
    stopPolling,
    mergeSafe,
  ]);

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !effectiveCanChat || !reservationId || !token || !currentUserId) return;

    const clientId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const tempId = `temp-${clientId}`;

    const optimisticMessage = {
      id: tempId,
      clientId,
      reservation_id: reservationId,
      sender_id: currentUserId,
      receiver_id: null,
      message: text,
      status: "sending",
      created_at: new Date().toISOString(),
      __optimistic: true,
    };

    setMessages((prev) => mergeSafe(prev, [optimisticMessage]));

    setInput("");
    isAtBottomRef.current = true;
    scrollToBottom();

    try {
      setSending(true);
      const saved = await sendChatMessage(reservationId, text, token);

      setMessages((prev) => {
        const incomingTime = getMsgTimeMs(saved) || Date.now();
        const incomingText = getMsgText(saved);

        let updated = false;

        const next = prev.map((m) => {
          if (updated) return m;
          if (!isMineMsg(m)) return m;
          if (!isOptimistic(m)) return m;

          if (getMsgText(m) !== incomingText) return m;

          const tm = getMsgTimeMs(m) || incomingTime;
          if (Math.abs(incomingTime - tm) > DEDUPE_WINDOW_MS) return m;

          updated = true;
          return {
            ...m,
            ...saved,
            clientId: m?.clientId || clientId,
            __optimistic: false,
            status: saved?.status || "sent",
          };
        });

        return updated ? mergeSafe(next, []) : mergeSafe(prev, [saved]);
      });

      lastMessageIdRef.current = saved?.id ?? lastMessageIdRef.current;
      scrollToBottom();
    } catch (err) {
      console.error("Erro ao enviar mensagem:", err);
      setMessages((prev) => prev.filter((m) => String(m?.id) !== String(tempId)));
      showToast(err?.message || "Erro ao enviar mensagem.", "error");
    } finally {
      setSending(false);
    }
  }

  const renderStatus = (msg) => {
    const fromMe = isMineMsg(msg);
    if (!fromMe) return null;

    const status = msg.status || (msg.read_at ? "read" : undefined);

    if (status === "sending") {
      return <span className="text-[10px] opacity-70">Enviando…</span>;
    }
    if (status === "read") {
      return <span className="text-[10px] text-blue-500 font-semibold">✓✓ lida</span>;
    }
    if (status === "delivered") {
      return <span className="text-[10px] opacity-70">✓✓ entregue</span>;
    }
    return <span className="text-[10px] opacity-70">✓ enviada</span>;
  };

  if (!effectiveCanChat) {
    return (
      <div className="mt-6 p-4 rounded-2xl bg-[#FFF7E0] border border-[#EBCBA9] text-sm text-[#5A3A22]">
        {disabledReason}
        {reservationStatus ? (
          <div className="mt-2 text-xs opacity-80">
            Status atual: <span className="font-semibold">{String(reservationStatus)}</span>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="mt-6 flex flex-col h-80 rounded-2xl border border-[#EBCBA9] bg-white shadow-sm relative"
    >
      {/* Cabeçalho */}
      <div className="px-4 py-3 border-b border-[#EBCBA9] bg-[#FFF8EC] rounded-t-2xl flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[#FFD700]/70 flex items-center justify-center text-xs font-bold text-[#5A3A22]">
          {otherUserName?.[0]?.toUpperCase() || "🐾"}
        </div>
        <div className="flex flex-col">
          <p className="text-xs text-[#5A3A22]/80">Chat da reserva</p>
          {otherUserName && (
            <p className="text-sm font-semibold text-[#5A3A22]">
              Conversando com: {otherUserName}
            </p>
          )}
        </div>
      </div>

      {/* Mensagens */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-sm bg-gradient-to-b from-white to-[#FFF8EC]"
      >
        {loading && <p className="text-xs text-gray-500">Carregando mensagens...</p>}

        {!loading && messages.length === 0 && (
          <p className="text-xs text-gray-500">
            Nenhuma mensagem ainda. Comece a conversa! 🐶
          </p>
        )}

        {messages.map((msg, index) => {
          const senderId = getSenderId(msg);
          const isMine = isMineMsg(msg);

          const previous = messages[index - 1];
          const previousSender = previous ? getSenderId(previous) : null;
          const isGrouped = previous && String(previousSender) === String(senderId);

          const stableKey = msg?.clientId || msg?.client_id || msg?.id || `msg-${index}`;

          return (
            <div
              key={String(stableKey)}
              className={`flex ${isMine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  isMine
                    ? "bg-[#5A3A22] text-white rounded-br-sm"
                    : "bg-[#FFE7B8] text-[#5A3A22] rounded-bl-sm"
                } ${isGrouped ? "mt-1" : "mt-2"}`}
              >
                <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                <div className="mt-1 flex items-center justify-end gap-2">
                  <span className="text-[10px] opacity-80">
                    {msg.created_at || msg.createdAt
                      ? new Date(msg.created_at || msg.createdAt).toLocaleString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </span>
                  {renderStatus(msg)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Botão "ver novas mensagens" */}
      {hasNewWhileAway && (
        <button
          type="button"
          onClick={() => {
            scrollToBottom();
            isAtBottomRef.current = true;
            markReadServer({ force: true });
          }}
          className="absolute bottom-[72px] left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-xs font-semibold bg-[#FFD700] text-[#5A3A22] shadow-md hover:opacity-90 transition"
        >
          Ver novas mensagens ↓
        </button>
      )}

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="
          px-4 py-3 border-t border-[#EBCBA9] bg-white rounded-b-2xl
          flex items-center gap-2
          flex-wrap sm:flex-nowrap
        "
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Digite uma mensagem..."
          className="
            flex-1 min-w-0
            rounded-full border border-[#D2A679]
            px-3 py-2 text-sm
            focus:outline-none focus:ring-2 focus:ring-[#FFD700]/70
          "
        />

        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="
            shrink-0
            px-3 py-2 sm:px-4
            rounded-full text-sm font-semibold
            bg-[#5A3A22] text-white hover:bg-[#4A2F1A]
            disabled:opacity-60 disabled:cursor-not-allowed transition
          "
        >
          {sending ? "Enviando..." : "Enviar"}
        </button>
      </form>
    </div>
  );
}
