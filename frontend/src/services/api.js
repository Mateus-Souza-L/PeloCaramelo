// frontend/src/services/api.js
const RAW_API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
// remove barra final (evita // nas URLs)
const API_BASE_URL = String(RAW_API_BASE_URL).replace(/\/+$/, "");

/* ===========================================================
   🔹 CONSTANTS
   =========================================================== */

const AUTH_STORAGE_KEY = "pelocaramelo_auth";

/* ===========================================================
   🔹 HELPERS
   =========================================================== */

// Lê o token do localStorage (padrão do projeto)
function getStoredToken() {
  try {
    const auth = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
    return auth?.token || null;
  } catch {
    return null;
  }
}

function looksLikeJsonString(str) {
  if (typeof str !== "string") return false;
  const s = str.trim();
  if (!s) return false;
  // aceita objetos/arrays JSON
  return (s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"));
}

// ✅ logout automático em 401 (sem depender do AuthContext)
function autoLogout(reason = "unauthorized") {
  try {
    // evita spam/loop
    if (window.__PC_AUTO_LOGOUT_LOCK__) return;
    window.__PC_AUTO_LOGOUT_LOCK__ = true;

    // remove credenciais
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // ignore
    }

    // dispara eventos para Navbar/AuthContext/qualquer listener
    try {
      window.dispatchEvent(
        new CustomEvent("auth-changed", {
          detail: { status: "logged_out", reason },
        })
      );
      window.dispatchEvent(new CustomEvent("auth-expired", { detail: { reason } }));
    } catch {
      // ignore
    }

    // fallback: redireciona para /login se não estiver lá
    // (se o app já lida com o evento, ele pode navegar sem reload)
    try {
      const path = window.location?.pathname || "";
      if (!path.startsWith("/login")) {
        // pequeno delay para permitir que listeners de evento reajam primeiro
        setTimeout(() => {
          try {
            const p = window.location?.pathname || "";
            if (!p.startsWith("/login")) window.location.assign("/login");
          } catch {
            // ignore
          }
        }, 50);
      }
    } catch {
      // ignore
    }
  } finally {
    // libera lock depois de um curto intervalo
    setTimeout(() => {
      try {
        window.__PC_AUTO_LOGOUT_LOCK__ = false;
      } catch {
        // ignore
      }
    }, 1200);
  }
}

/* ===========================================================
   🔹 FUNÇÃO BASE
   =========================================================== */

/**
 * Função genérica para requisições
 * - Garante JSON (Content-Type + stringify) quando o body é objeto JS
 * - ✅ NOVO: se body já vier string JSON ("{...}" / "[...]"), seta Content-Type JSON também
 * - NÃO seta Content-Type quando for FormData/Blob (deixa o browser cuidar)
 * - Evita cache (304 sem body em APIs)
 * - ✅ auto logout APENAS em 401 (padrão), com opção de desativar
 *
 * Opções extras (não vão pro fetch):
 *  - __noAutoLogout: boolean (default false)
 */
async function apiRequest(path, options = {}) {
  const isAbsolute = typeof path === "string" && /^https?:\/\//i.test(path);
  const normalizedPath =
    typeof path === "string"
      ? path.startsWith("/")
        ? path
        : `/${path}`
      : "";

  const url = isAbsolute ? String(path) : `${API_BASE_URL}${normalizedPath}`;

  // opções internas (não devem ir pro fetch)
  const { __noAutoLogout, ...fetchOptions } = options || {};

  let body = fetchOptions.body;
  const hasBody = body !== undefined && body !== null;

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const isBlob = typeof Blob !== "undefined" && body instanceof Blob;
  const isString = typeof body === "string";

  const headers = {
    // ✅ evita 304 sem body em APIs
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    ...(fetchOptions.headers || {}),
  };

  // Normaliza chave para checar content-type já setado (case-insensitive)
  const headerKeys = Object.keys(headers);
  const hasContentTypeHeader = headerKeys.some((k) => k.toLowerCase() === "content-type");
  const contentTypeKey = headerKeys.find((k) => k.toLowerCase() === "content-type");

  // ✅ Caso 1: body é objeto JS -> stringify e Content-Type JSON
  if (hasBody && !isFormData && !isBlob && !isString) {
    if (!hasContentTypeHeader) headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }

  // ✅ Caso 2: body já é string, MAS parece JSON -> garantir Content-Type JSON
  if (hasBody && isString && !isFormData && !isBlob) {
    const ct = contentTypeKey ? String(headers[contentTypeKey] || "") : "";
    const alreadyJson = ct.toLowerCase().includes("application/json");
    if (!alreadyJson && looksLikeJsonString(body)) {
      headers["Content-Type"] = "application/json";
    }
  }

  const response = await fetch(url, {
    cache: "no-store", // ✅ IMPORTANTÍSSIMO
    ...fetchOptions,
    body: hasBody ? body : undefined,
    headers,
  });

  // ✅ 304 não tem body; em API isso atrapalha o fetch
  if (response.status === 304) return null;

  // ✅ 204 No Content
  if (response.status === 204) return null;

  let data = null;

  // Tenta JSON; se falhar, tenta texto
  try {
    data = await response.json();
  } catch {
    try {
      const text = await response.text();
      data = text ? { message: text } : null;
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    // ✅ auto-logout APENAS em 401 (exceto se desativado)
    if (!__noAutoLogout && response.status === 401) {
      // se for login/register, não faz sentido deslogar (apenas erro de credencial)
      const isAuthEndpoint =
        typeof path === "string" &&
        (path.startsWith("/auth/login") || path.startsWith("/auth/register"));

      if (!isAuthEndpoint) {
        autoLogout("http_401");
      }
    }

    const message = data?.error || data?.message || "Erro na requisição.";
    const error = new Error(message);

    error.status = response.status;
    error.data = data;

    // campos úteis que você já usa em outros fluxos
    error.code = data?.code || null;
    error.capacity = data?.capacity ?? null;
    error.overlapping = data?.overlapping ?? null;
    error.details = data?.details ?? null;

    throw error;
  }

  return data;
}

/* ===========================================================
   🔹 AUTH REQUESTS
   =========================================================== */

export async function loginRequest({ email, password }) {
  return apiRequest("/auth/login", {
    method: "POST",
    body: { email, password },
    // login falha (401) não deve forçar logout/redirect
    __noAutoLogout: true,
  });
}

export async function registerRequest(body) {
  return apiRequest("/auth/register", {
    method: "POST",
    body,
    __noAutoLogout: true,
  });
}

export async function meRequest(token) {
  return apiRequest("/auth/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    // aqui NÃO desativa: se der 401, queremos deslogar
  });
}

/**
 * 🔐 Requisições autenticadas
 * - Se token for passado → usa ele
 * - Senão → busca automaticamente em pelocaramelo_auth
 *
 * Extras:
 * - options.__noAutoLogout: true para desativar o logout automático naquela chamada
 */
export async function authRequest(path, tokenOrOptions, maybeOptions = {}) {
  let token = null;
  let options = {};

  // compatibilidade:
  // authRequest(path, token, options)
  // authRequest(path, options)
  if (typeof tokenOrOptions === "string") {
    token = tokenOrOptions;
    options = maybeOptions;
  } else {
    token = getStoredToken();
    options = tokenOrOptions || {};
  }

  return apiRequest(path, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}
