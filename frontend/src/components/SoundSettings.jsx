// src/components/SoundSettings.jsx
import { useState, useEffect } from "react";
import { getSoundSettings, setSoundSettings } from "../utils/sound";

export default function SoundSettings() {
  const [settings, setSettings] = useState(getSoundSettings());

  // Atualiza o localStorage sempre que o usuário muda algo
  useEffect(() => {
    setSoundSettings(settings);
  }, [settings]);

  return (
    <div className="bg-[#EBCBA9] p-4 rounded-xl shadow-md mt-6 w-full max-w-md mx-auto">
      <h3 className="text-[#5A3A22] font-bold mb-4 text-lg text-center">
        🎚️ Configurações de Som
      </h3>

      <div className="flex items-center justify-between mb-4">
        <label className="text-[#5A3A22] font-medium">Ativar Sons:</label>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
          className="w-5 h-5 accent-[#95301F] cursor-pointer"
        />
      </div>

      <div className="flex items-center justify-between mb-2">
        <label htmlFor="volume" className="text-[#5A3A22] font-medium">
          Volume:
        </label>
        <div className="flex items-center space-x-2">
          <input
            id="volume"
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={settings.volume}
            onChange={(e) =>
              setSettings({ ...settings, volume: parseFloat(e.target.value) })
            }
            className="accent-[#95301F] cursor-pointer"
          />
          <span className="text-[#5A3A22] w-10 text-right">
            {(settings.volume * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      <p className="text-sm text-[#5A3A22] text-center mt-3 italic">
        As configurações são salvas automaticamente 🐾
      </p>
    </div>
  );
}
