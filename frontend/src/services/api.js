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
    try {
      const path = window.location?.pathname || "";
      if (!path.startsWith("/login")) {
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

function isContentTypeJson(headers) {
  const key = Object.keys(headers || {}).find((k) => k.toLowerCase() === "content-type");
  const ct = key ? String(headers[key] || "") : "";
  return ct.toLowerCase().includes("application/json");
}

function mergeHeadersPreserveCase(base, extra) {
  // Mescla headers de forma case-insensitive sem duplicar chaves
  const out = { ...(base || {}) };
  const extraObj = extra || {};
  for (const [k, v] of Object.entries(extraObj)) {
    const existingKey = Object.keys(out).find((kk) => kk.toLowerCase() === k.toLowerCase());
    if (existingKey) out[existingKey] = v;
    else out[k] = v;
  }
  return out;
}

/* ===========================================================
   🔹 FUNÇÃO BASE
   =========================================================== */

/**
 * Função genérica para requisições
 * - Garante JSON (Content-Type + stringify) quando o body é objeto JS
 * - Se body já vier string JSON ("{...}" / "[...]"), seta Content-Type JSON também
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

  // Headers base
  let headers = mergeHeadersPreserveCase(
    {
      // ✅ evita 304 sem body em APIs
      "Cache-Control": "no-store",
      Pragma: "no-cache",

      // ✅ ajuda alguns proxies/servidores a retornarem JSON
      Accept: "application/json, text/plain, */*",
    },
    fetchOptions.headers || {}
  );

  // ✅ Caso 1: body é objeto JS -> stringify e Content-Type JSON
  if (hasBody && !isFormData && !isBlob && !isString) {
    if (!isContentTypeJson(headers)) {
      headers = mergeHeadersPreserveCase(headers, { "Content-Type": "application/json" });
    }
    body = JSON.stringify(body);
  }

  // ✅ Caso 2: body já é string, MAS parece JSON -> garantir Content-Type JSON
  if (hasBody && isString && !isFormData && !isBlob) {
    if (!isContentTypeJson(headers) && looksLikeJsonString(body)) {
      headers = mergeHeadersPreserveCase(headers, { "Content-Type": "application/json" });
    }
  }

  let response;
  try {
    response = await fetch(url, {
      cache: "no-store", // ✅ IMPORTANTÍSSIMO
      ...fetchOptions,
      body: hasBody ? body : undefined,
      headers,
    });
  } catch (networkErr) {
    const error = new Error("Falha de conexão. Verifique sua internet/servidor e tente novamente.");
    error.status = 0;
    error.data = null;
    error.details = networkErr?.message || null;
    throw error;
  }

  // ✅ 304 não tem body; em API isso atrapalha o fetch
  if (response.status === 304) return null;

  // ✅ 204 No Content
  if (response.status === 204) return null;

  let data = null;

  // ✅ lê o body 1x e tenta parsear
  const rawText = await response.text();

  // ✅ melhora robustez: se servidor diz que é JSON, tenta parsear mesmo se não “parece” JSON
  const respCT = String(response.headers.get("content-type") || "").toLowerCase();
  const shouldParseAsJson = respCT.includes("application/json");

  if (rawText) {
    if (shouldParseAsJson || looksLikeJsonString(rawText)) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = { message: rawText };
      }
    } else {
      data = { message: rawText };
    }
  } else {
    data = null;
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

    // ✅ pega melhor mensagem possível
    const message =
      data?.error ||
      data?.message ||
      data?.details ||
      (typeof data === "string" ? data : null) ||
      `Erro HTTP ${response.status}`;

    const error = new Error(String(message));

    // ✅ IMPORTANTES para você ver o motivo no front
    error.status = response.status;
    error.data = data;
    error.url = url;

    // campos úteis que você já usa em outros fluxos
    error.code = data?.code || null;
    error.capacity = data?.capacity ?? null;
    error.overlapping = data?.overlapping ?? null;
    error.details = data?.details ?? null;

    // ✅ ajuda debug (sem quebrar)
    error.method = String(fetchOptions.method || "GET").toUpperCase();

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

  const baseHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  const merged = mergeHeadersPreserveCase(baseHeaders, options.headers || {});

  return apiRequest(path, {
    ...options,
    headers: merged,
  });
}
