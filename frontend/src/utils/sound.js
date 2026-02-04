// src/utils/sound.js

// 🔊 Caminhos dos sons (mantém compatibilidade com "success/error/notify")
const SOUND_PATHS = {
  // legacy
  success: "/sounds/success.wav",
  error: "/sounds/error.wav",
  notify: "/sounds/notify.wav",

  // ✅ eventos recomendados (mapeie para os mesmos arquivos se quiser)
  login: "/sounds/notify.wav",
  logout: "/sounds/notify.wav",
  reservation_accept: "/sounds/success.wav",
  reservation_cancel: "/sounds/error.wav",
  chat_new: "/sounds/notify.wav",
};

// Configuração padrão
const DEFAULT_SETTINGS = {
  enabled: true,
  volume: 0.4, // volume base
};

// ✅ Cooldowns (ms) por tipo/evento (evita som repetitivo)
const DEFAULT_COOLDOWNS_MS = {
  // legacy
  success: 2500,
  error: 3000,
  notify: 5000,

  // eventos recomendados
  login: 4000,
  logout: 4000,
  reservation_accept: 4000,
  reservation_cancel: 5000,
  chat_new: 12000,
};

let _lastPlayedAt = Object.create(null);

// 🔹 Lê as configurações do localStorage
export function getSoundSettings() {
  try {
    const saved = localStorage.getItem("soundSettings");
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// 🔹 Salva as configurações no localStorage
export function setSoundSettings(newSettings) {
  try {
    localStorage.setItem("soundSettings", JSON.stringify(newSettings));
  } catch {
    // ignore
  }
}

/**
 * ✅ API NOVA (RECOMENDADA): toca sons por EVENTO (login/logout/accept/cancel/chat)
 * - eventName: string
 * - opts:
 *    - volume: override do volume (0..1)
 *    - cooldownMs: override do cooldown
 *    - force: ignora cooldown (ainda respeita enabled)
 */
export function playSoundEvent(eventName, opts = {}) {
  return playSound(eventName, opts);
}

/**
 * 🔹 Função principal para tocar o som
 * Compatível com legacy: playSound("success" | "error" | "notify")
 *
 * opts:
 *  - volume?: number (0..1)
 *  - cooldownMs?: number
 *  - force?: boolean (ignora cooldown)
 */
export function playSound(type = "notify", opts = {}) {
  const settings = getSoundSettings();
  if (!settings?.enabled) return;

  const t = String(type || "notify");

  // ✅ cooldown para evitar repetição
  const now = Date.now();
  const cooldownMs =
    Number(opts.cooldownMs) > 0
      ? Number(opts.cooldownMs)
      : (DEFAULT_COOLDOWNS_MS[t] ?? 3500);

  const force = opts.force === true;

  const last = Number(_lastPlayedAt[t] || 0);
  if (!force && last && now - last < cooldownMs) return;

  _lastPlayedAt[t] = now;

  const src = SOUND_PATHS[t] || SOUND_PATHS.notify;
  if (!src) return;

  try {
    const sound = new Audio(src);

    // 🔊 Ajuste dinâmico de volume por tipo/evento
    let volume =
      typeof opts.volume === "number" && Number.isFinite(opts.volume)
        ? opts.volume
        : Number(settings.volume);

    if (!Number.isFinite(volume)) volume = DEFAULT_SETTINGS.volume;

    // legacy tweaks
    if (t === "success") volume *= 0.9;
    if (t === "error") volume *= 1.1;

    // event tweaks (mais suaves por padrão)
    if (t === "login" || t === "logout") volume *= 0.75;
    if (t === "chat_new") volume *= 0.8;

    sound.volume = Math.min(Math.max(volume, 0), 1);

    sound.currentTime = 0;

    sound.play().catch(() => {
      /* evita erro de autoplay */
    });
  } catch {
    // ignore
  }
}

/**
 * ✅ Ajuda prática:
 * chame antes de playSoundEvent("chat_new") para evitar som quando está na conversa.
 */
export function resetSoundCooldown(type) {
  const t = String(type || "");
  if (!t) return;
  delete _lastPlayedAt[t];
}
