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

export default function ChatBox({
  reservationId,
  token,
  currentUserId,
  otherUserName,
  canChat = true,
  onNewMessage,
}) {
  const { showToast } = useToast();

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

  /** --------- NOTIFICAÇÃO GLOBAL (Navbar/Dashboard) VIA BACKEND --------- **/
  const refreshUnread = useCallback(
    async ({ force = false } = {}) => {
      if (!token) return;

      const now = Date.now();
      if (!force && now - lastUnreadRefreshAtRef.current < UNREAD_REFRESH_COOLDOWN_MS) {
        return;
      }
      lastUnreadRefreshAtRef.current = now;

      try {
        const ids = await getUnreadChats(token); // string[]
        window.dispatchEvent(
          new CustomEvent("chat-unread-changed", { detail: { list: ids } })
        );
      } catch {
        // silencioso
      }
    },
    [token]
  );

  // ✅ liga/desliga polling de forma determinística
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

      // se for habilitar: só liga se já tiver tick
      if (pollingTickRef.current) {
        stopPolling();
        pollingTimerRef.current = setInterval(() => {
          pollingTickRef.current?.();
        }, 8000);
      }
    },
    [stopPolling]
  );

  // ✅ marca como lido com throttle e só chama /chat/unread quando mudou algo
  const markReadServer = useCallback(
    async ({ force = false } = {}) => {
      if (!reservationId || !token) return;

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

        // ✅ emite "read" via socket (tempo real)
        const s = socketRef.current;
        if (s && joinedRef.current) {
          try {
            s.emit("chat:read", { reservationId });
          } catch { }
        }
      } catch (err) {
        // ✅ 401/403 podem acontecer no "timing" da aceitação — não é erro real pro usuário
        const status = err?.status ?? err?.response?.status ?? err?.statusCode ?? null;
        if (status === 401 || status === 403) return;

        // demais erros ficam silenciosos também (como já estava)
      } finally {
        markReadInFlightRef.current = false;
      }
    },
    [reservationId, token, refreshUnread]
  );
  /** -------------------------------------------------------------- **/

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;

    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distanceToBottom < 40;

    if (isAtBottomRef.current) {
      setHasNewWhileAway(false);
      markReadServer(); // throttle interno
    }
  };

  // ✅ detecta se o chat está visível na viewport (tela)
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

  // ✅ evento para "ir pro fim" a partir do ReservationDetail
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

  // Rolagem automática: primeiro load ou se o usuário está no fim
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (initialLoadRef.current || isAtBottomRef.current) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  // Se a aba voltar a ficar visível e o usuário está no bottom, marca como lido
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && isAtBottomRef.current) {
        markReadServer();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [markReadServer]);

  // Normaliza lista (backend pode retornar {messages: []})
  const normalizeList = useCallback((data) => {
    const list = Array.isArray(data)
      ? data
      : Array.isArray(data?.messages)
        ? data.messages
        : [];

    list.sort(
      (a, b) =>
        new Date(a.created_at || a.createdAt || 0).getTime() -
        new Date(b.created_at || b.createdAt || 0).getTime()
    );

    return list;
  }, []);

  // --------------------------------------------
  // Socket.IO: conecta e entra na sala da reserva
  // --------------------------------------------
  const canUseSocket = useMemo(() => {
    return !!(token && reservationId && canChat);
  }, [token, reservationId, canChat]);

  useEffect(() => {
    if (!canUseSocket) return;

    // cooldown local: evita reconectar em loop se backend rate limitou
    const now = Date.now();
    if (socketCooldownUntilRef.current > now) {
      // durante cooldown, mantém polling ligado
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
        // conectado não significa joined ainda, então não desliga polling aqui
      });

      socketRef.current.on("disconnect", (reason) => {
        connectedRef.current = false;
        joinedRef.current = false;
        setPollingEnabled(true);

        // se cair por transporte, deixa tentar; se cair por "io server disconnect", ainda tenta
        // (controle real fica no connect_error)
        // console.log("[socket] disconnect:", reason);
      });

      socketRef.current.on("connect_error", (err) => {
        const msg = String(err?.message || "");
        console.warn("[socket] connect_error:", msg || err);

        connectedRef.current = false;
        joinedRef.current = false;
        setPollingEnabled(true);

        // ✅ se foi rate-limited: entra em cooldown local
        if (msg.includes("RATE_LIMITED")) {
          socketCooldownUntilRef.current = Date.now() + SOCKET_COOLDOWN_MS;
          try {
            socketRef.current?.disconnect();
          } catch { }
        }
      });
    }

    const s = socketRef.current;

    // entra na sala desta reserva
    joinedRef.current = false;
    s.emit("join:reservation", { reservationId });

    const onJoined = (payload) => {
      if (String(payload?.reservationId) === String(reservationId)) {
        joinedRef.current = true;
        setPollingEnabled(false); // ✅ desliga polling de forma definitiva enquanto joined
      }
    };

    const onJoinError = (payload) => {
      if (String(payload?.reservationId) === String(reservationId)) {
        console.warn("[socket] join error:", payload);
        joinedRef.current = false;
        setPollingEnabled(true);

        // se o backend limitou join, entra em cooldown local (menos agressivo)
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

      const msgId = msg?.id;

      setMessages((prev) => {
        if (msgId && prev.some((m) => String(m?.id) === String(msgId))) {
          return prev;
        }
        const next = [...prev, msg];
        if (msgId != null) lastMessageIdRef.current = msgId;
        return next;
      });

      // ✅ ACK delivered
      const fromOther = !isMineMsg(msg);
      if (fromOther && joinedRef.current && msgId != null) {
        try {
          s.emit("chat:delivered", { reservationId, messageId: msgId });
        } catch { }
      }

      if (!fromOther) return;

      if (msgId != null && String(lastNewEventIdRef.current) === String(msgId)) return;
      if (msgId != null) lastNewEventIdRef.current = msgId;

      try {
        onNewMessage?.({ reservationId });
      } catch { }

      window.dispatchEvent(
        new CustomEvent("chat-new-message", { detail: { reservationId } })
      );

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
        refreshUnread(); // com cooldown
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
      } catch { }

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
    onNewMessage,
    scrollToBottom,
    markReadServer,
    refreshUnread,
    setPollingEnabled,
  ]);

  // --------------------------------------------
  // Carregar mensagens + polling (fallback)
  // --------------------------------------------
  useEffect(() => {
    if (!canChat || !reservationId || !token || !currentUserId) return;

    let cancelled = false;
    initialLoadRef.current = true;
    lastMessageIdRef.current = null;
    isAtBottomRef.current = true;
    setHasNewWhileAway(false);
    lastNewEventIdRef.current = null;

    // ✅ 1 chamada inicial (controlada)
    // Se o backend ainda não liberou, 401/403 serão ignorados pelo markReadServer.
    markReadServer({ force: true });

    async function loadMessages({ isPolling = false } = {}) {
      try {
        if (!isPolling && initialLoadRef.current) setLoading(true);

        const data = await getChatMessages(reservationId, token);
        if (cancelled) return;

        const list = normalizeList(data);

        setMessages((prev) => {
          if (!prev.length) return list;

          const prevLast = prev[prev.length - 1];
          const listLast = list[list.length - 1];
          const prevLastId = prevLast?.id;
          const listLastId = listLast?.id;

          // se mudou o último id, troca pela fonte da verdade
          if (listLastId != null && String(listLastId) !== String(prevLastId)) {
            return list;
          }

          // se polling trouxe mais msgs, troca
          if (list.length > prev.length) return list;

          return prev;
        });

        if (!list.length) {
          initialLoadRef.current = false;
          return;
        }

        const lastMsg = list[list.length - 1];

        if (initialLoadRef.current) {
          lastMessageIdRef.current = lastMsg.id ?? null;
          initialLoadRef.current = false;
          return;
        }
      } catch (err) {
        const status = err?.status ?? err?.response?.status ?? err?.statusCode ?? null;

        // ✅ Durante a transição de "Aceitar reserva", o backend pode responder 401/403 por instantes.
        // Não mostra toast (evita o "erro de chat" visual), só espera próxima tentativa.
        if (status === 401 || status === 403) {
          return;
        }

        console.error("Erro ao carregar mensagens:", err);
        if (!cancelled && !isPolling) {
          showToast(err?.message || "Erro ao carregar mensagens.", "error");
        }
      } finally {
        if (!cancelled && !isPolling) setLoading(false);
      }
    }

    // tick do polling fica “registrado” num ref (pra setPollingEnabled saber o que rodar)
    pollingTickRef.current = () => {
      if (!allowPollingRef.current) return;
      loadMessages({ isPolling: true });
    };

    loadMessages({ isPolling: false });

    // ✅ regra: se ainda NÃO joined, polling pode ficar ligado; se joined, fica off
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
    canChat,
    currentUserId,
    markReadServer,
    showToast,
    normalizeList,
    setPollingEnabled,
    stopPolling,
  ]);

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !canChat || !reservationId || !token || !currentUserId) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage = {
      id: tempId,
      reservation_id: reservationId,
      sender_id: currentUserId,
      receiver_id: null,
      message: text,
      status: "sending",
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => {
      const next = [...prev, optimisticMessage];
      lastMessageIdRef.current = tempId;
      return next;
    });

    setInput("");
    isAtBottomRef.current = true;
    scrollToBottom();

    try {
      setSending(true);
      const saved = await sendChatMessage(reservationId, text, token);

      setMessages((prev) => {
        const replaced = prev.map((m) => (m.id === tempId ? { ...saved } : m));

        const sid = saved?.id;
        if (sid != null) {
          const seen = new Set();
          return replaced.filter((m) => {
            const id = m?.id;
            if (id == null) return true;
            const key = String(id);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
        return replaced;
      });

      lastMessageIdRef.current = saved?.id ?? lastMessageIdRef.current;
      scrollToBottom();

      // ✅ não marca read no envio
    } catch (err) {
      console.error("Erro ao enviar mensagem:", err);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      showToast(err.message || "Erro ao enviar mensagem.", "error");
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

  if (!canChat) {
    return (
      <div className="mt-6 p-4 rounded-2xl bg-[#FFF7E0] border border-[#EBCBA9] text-sm text-[#5A3A22]">
        O chat desta reserva está desativado no momento.
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

          return (
            <div
              key={msg.id ?? `msg-${index}`}
              className={`flex ${isMine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${isMine
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
        className="px-4 py-3 border-t border-[#EBCBA9] bg-white rounded-b-2xl flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Digite uma mensagem..."
          className="flex-1 rounded-full border border-[#D2A679] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FFD700]/70"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="px-4 py-2 rounded-full text-sm font-semibold bg-[#5A3A22] text-white hover:bg-[#4A2F1A] disabled:opacity-60 disabled:cursor-not-allowed transition"
        >
          {sending ? "Enviando..." : "Enviar"}
        </button>
      </form>
    </div>
  );
}
