// frontend/src/api/chatApi.js
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function parseJsonSafe(res) {
  const data = await res.json().catch(() => ({}));
  return data;
}

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Obtém o histórico de mensagens de uma reserva específica.
 */
export async function getChatMessages(reservationId, token) {
  const response = await fetch(`${API_URL}/chat/${reservationId}`, {
    method: "GET",
    headers: authHeaders(token),
  });

  const data = await parseJsonSafe(response);

  if (!response.ok) {
    throw new Error(data.error || "Erro ao buscar mensagens do chat.");
  }

  // backend responde { messages: [...] }
  return data.messages || [];
}

/**
 * Envia uma nova mensagem no chat de uma reserva.
 */
export async function sendChatMessage(reservationId, message, token) {
  const response = await fetch(`${API_URL}/chat/${reservationId}`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ message }),
  });

  const data = await parseJsonSafe(response);

  if (!response.ok) {
    throw new Error(data.error || "Erro ao enviar mensagem.");
  }

  // backend responde { message: { ... } }
  return data.message;
}

/**
 * Lista os IDs de reservas que possuem mensagens NÃO lidas
 * para o usuário logado.
 */
export async function getUnreadChats(token) {
  const response = await fetch(`${API_URL}/chat/unread`, {
    method: "GET",
    headers: authHeaders(token),
  });

  const data = await parseJsonSafe(response);

  if (!response.ok) {
    throw new Error(data.error || "Erro ao buscar chats não lidos.");
  }

  const ids = Array.isArray(data.reservationIds) ? data.reservationIds : [];
  return ids.map(String);
}

/**
 * Marca como LIDAS as mensagens dessa reserva para o usuário logado.
 * (Ou seja: tudo que foi enviado para mim e ainda está unread)
 */
export async function markChatAsRead(reservationId, token) {
  const response = await fetch(`${API_URL}/chat/${reservationId}/read`, {
    method: "POST",
    headers: authHeaders(token),
  });

  const data = await parseJsonSafe(response);

  if (!response.ok) {
    throw new Error(data.error || "Erro ao marcar chat como lido.");
  }

  return data; // ex: { ok: true, updated: 5 }
}
