// frontend/src/components/ChatBox.jsx
import { useEffect, useState, useRef, useCallback } from "react";
import {
  getChatMessages,
  sendChatMessage,
  getUnreadChats,
  markChatAsRead,
} from "../api/chatApi";
import { useToast } from "./ToastProvider";

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

  // botão "ver novas"
  const [hasNewWhileAway, setHasNewWhileAway] = useState(false);

  const containerRef = useRef(null);
  const rootRef = useRef(null);

  // controle de rolagem / polling
  const lastMessageIdRef = useRef(null);
  const initialLoadRef = useRef(true);
  const isAtBottomRef = useRef(true);

  // evita spam de evento no polling
  const lastNewEventIdRef = useRef(null);

  // chat visível na tela?
  const isInViewportRef = useRef(true);

  const getSenderId = (m) =>
    m?.sender_id ??
    m?.senderId ??
    m?.from_user_id ??
    m?.fromUserId ??
    m?.from_user ??
    m?.fromUser ??
    m?.user_id ??
    m?.userId ??
    null;

  const isMineMsg = (m) => String(getSenderId(m)) === String(currentUserId);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    // mais confiável após render
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    });
  }, []);

  /** --------- NOTIFICAÇÃO GLOBAL (Navbar/Dashboard) VIA BACKEND --------- **/
  const refreshUnread = useCallback(async () => {
    if (!token) return;
    try {
      const ids = await getUnreadChats(token); // string[]
      window.dispatchEvent(
        new CustomEvent("chat-unread-changed", { detail: { list: ids } })
      );
    } catch {
      // silencioso
    }
  }, [token]);

  const markReadServer = useCallback(async () => {
    if (!reservationId || !token) return;
    try {
      await markChatAsRead(reservationId, token);
    } catch {
      // silencioso
    } finally {
      refreshUnread();
      setHasNewWhileAway(false);
    }
  }, [reservationId, token, refreshUnread]);
  /** -------------------------------------------------------------- **/

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distanceToBottom < 40;

    if (isAtBottomRef.current && document.visibilityState === "visible") {
      markReadServer();
    }

    if (isAtBottomRef.current) {
      setHasNewWhileAway(false);
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
      { threshold: 0.25 } // 25% visível já considera "na tela"
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

      if (document.visibilityState === "visible") {
        markReadServer();
      }
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

  // Carregar mensagens + polling
  useEffect(() => {
    if (!canChat || !reservationId || !token || !currentUserId) return;

    let cancelled = false;
    initialLoadRef.current = true;
    lastMessageIdRef.current = null;
    isAtBottomRef.current = true;
    setHasNewWhileAway(false);
    lastNewEventIdRef.current = null;

    // abriu o chat → marca como lido no servidor
    markReadServer();

    const normalizeList = (data) => {
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.messages)
          ? data.messages
          : [];

      list.sort(
        (a, b) =>
          new Date(a.created_at || 0).getTime() -
          new Date(b.created_at || 0).getTime()
      );
      return list;
    };

    const notifyNewMessage = (msgId) => {
      // evita disparar repetido no polling
      if (msgId != null && String(lastNewEventIdRef.current) === String(msgId)) return;
      lastNewEventIdRef.current = msgId ?? lastNewEventIdRef.current;

      try {
        onNewMessage?.({ reservationId });
      } catch {
        // ignore
      }

      // evento global (Navbar/Dashboard/ReservationDetail)
      window.dispatchEvent(
        new CustomEvent("chat-new-message", {
          detail: { reservationId },
        })
      );
    };

    async function loadMessages({ isPolling = false } = {}) {
      try {
        if (!isPolling && initialLoadRef.current) setLoading(true);

        const data = await getChatMessages(reservationId, token);
        if (cancelled) return;

        const list = normalizeList(data);
        setMessages(list);

        if (!list.length) {
          initialLoadRef.current = false;
          return;
        }

        const lastMsg = list[list.length - 1];

        // primeiro carregamento
        if (initialLoadRef.current) {
          lastMessageIdRef.current = lastMsg.id;
          initialLoadRef.current = false;

          if (document.visibilityState === "visible" && isAtBottomRef.current) {
            markReadServer();
          }
          return;
        }

        const prevId = lastMessageIdRef.current;
        const isNew = lastMsg && String(lastMsg.id) !== String(prevId);
        if (!isNew) return;

        lastMessageIdRef.current = lastMsg.id;

        // Só trata como "nova" se veio do OUTRO usuário
        const fromOther = !isMineMsg(lastMsg);
        if (!fromOther) return;

        // ✅ sempre notifica
        notifyNewMessage(lastMsg.id);

        const isVisibleTab = document.visibilityState === "visible";
        const chatOnScreen = isInViewportRef.current;
        const shouldAutoRead = isVisibleTab && isAtBottomRef.current;

        // ✅ se o chat NÃO está na tela, pede pro ReservationDetail rolar até o chat
        if (isVisibleTab && !chatOnScreen) {
          window.dispatchEvent(
            new CustomEvent("chat-scroll-to-chat", {
              detail: { reservationId },
            })
          );
        }

        if (shouldAutoRead) {
          // se já está no fim, mantém suave e marca como lido
          scrollToBottom();
          markReadServer();
        } else {
          refreshUnread();
          setHasNewWhileAway(true);
        }
      } catch (err) {
        console.error("Erro ao carregar mensagens:", err);
        if (!cancelled && !isPolling) {
          showToast(err.message || "Erro ao carregar mensagens.", "error");
        }
      } finally {
        if (!cancelled && !isPolling) setLoading(false);
      }
    }

    loadMessages({ isPolling: false });

    const intervalId = setInterval(() => {
      loadMessages({ isPolling: true });
    }, 8000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [
    reservationId,
    token,
    canChat,
    currentUserId,
    markReadServer,
    refreshUnread,
    showToast,
    onNewMessage,
    scrollToBottom,
  ]);

  async function handleSend(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !canChat || !reservationId || !token || !currentUserId) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage = {
      id: tempId,
      reservation_id: reservationId,
      from_user_id: currentUserId,
      sender_id: currentUserId,
      to_user_id: null,
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

      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...saved } : m))
      );

      lastMessageIdRef.current = saved.id;
      scrollToBottom();
      markReadServer();
    } catch (err) {
      console.error("Erro ao enviar mensagem:", err);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      showToast(err.message || "Erro ao enviar mensagem.", "error");
    } finally {
      setSending(false);
    }
  }

  if (!canChat) {
    return (
      <div className="mt-6 p-4 rounded-2xl bg-[#FFF7E0] border border-[#EBCBA9] text-sm text-[#5A3A22]">
        O chat desta reserva está desativado no momento.
      </div>
    );
  }

  const renderStatus = (msg) => {
    const fromMe = isMineMsg(msg);

    if (!fromMe) return null;

    const status = msg.status || (msg.read_at ? "read" : undefined);

    if (status === "sending") {
      return <span className="text-[10px] opacity-70">Enviando…</span>;
    }
    if (status === "read") {
      return (
        <span className="text-[10px] text-blue-500 font-semibold">✓✓ lida</span>
      );
    }
    if (status === "delivered") {
      return <span className="text-[10px] opacity-70">✓✓ entregue</span>;
    }
    return <span className="text-[10px] opacity-70">✓ enviada</span>;
  };

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
        {loading && (
          <p className="text-xs text-gray-500">Carregando mensagens...</p>
        )}

        {!loading && messages.length === 0 && (
          <p className="text-xs text-gray-500">
            Nenhuma mensagem ainda. Comece a conversa! 🐶
          </p>
        )}

        {messages.map((msg, index) => {
          const senderId = getSenderId(msg);
          const isMine = isMineMsg(msg);

          const previous = messages[index - 1];
          const previousSender = previous && getSenderId(previous);
          previous && (previous.from_user_id ?? previous.from_user);
          const isGrouped =
            previous && String(previousSender) === String(senderId);

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
                    {msg.created_at
                      ? new Date(msg.created_at).toLocaleString("pt-BR", {
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
            markReadServer();
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
