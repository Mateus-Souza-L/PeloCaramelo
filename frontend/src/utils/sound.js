// src/utils/sound.js

// Caminhos dos sons
const SOUND_PATHS = {
  success: "/sounds/success.wav",
  error: "/sounds/error.wav",
  notify: "/sounds/notify.wav",
};

// Configuração padrão
const DEFAULT_SETTINGS = {
  enabled: true,
  volume: 0.4, // volume base
};

// 🔹 Lê as configurações do localStorage
export function getSoundSettings() {
  const saved = localStorage.getItem("soundSettings");
  return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
}

// 🔹 Salva as configurações no localStorage
export function setSoundSettings(newSettings) {
  localStorage.setItem("soundSettings", JSON.stringify(newSettings));
}

// 🔹 Função principal para tocar o som
export function playSound(type = "notify") {
  const settings = getSoundSettings();
  if (!settings.enabled) return; // 🔇 som desativado globalmente

  const src = SOUND_PATHS[type] || SOUND_PATHS.notify;
  const sound = new Audio(src);

  // 🔊 Ajuste dinâmico de volume por tipo de som
  let volume = settings.volume;
  if (type === "success") volume *= 0.9; // mais suave
  if (type === "error") volume *= 1.1; // um pouco mais forte
  sound.volume = Math.min(volume, 1);

  // 🔁 reinicia e toca de forma silenciosa (sem travar)
  sound.currentTime = 0;
  sound
    .play()
    .catch(() => {
      /* evita erro de autoplay */
    });
}
