// src/components/RatingModal.jsx
import { useState, useEffect } from "react";

export default function RatingModal({
  isOpen,
  title,
  onClose,
  onSubmit,
  busy = false, // ✅ novo (opcional, compatível)
}) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (isOpen) {
      // sempre resetar ao abrir
      setRating(5);
      setComment("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (busy) return; // ✅ trava submit duplo
    onSubmit(Number(rating), comment.trim());
  };

  const handleOverlayClick = (e) => {
    if (busy) return; // ✅ não fecha enquanto envia
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={handleOverlayClick}
    >
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-lg">
        <h2 className="text-xl font-semibold mb-3 text-[#5A3A22]">
          {title}
        </h2>

        <label className="block text-sm mb-1 font-medium text-[#5A3A22]">
          Nota (1 a 5)
        </label>
        <select
          value={rating}
          onChange={(e) => setRating(e.target.value)}
          disabled={busy}
          className="w-full border border-[#5A3A22]/40 rounded-lg px-3 py-2 mb-3 disabled:opacity-60"
        >
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        <label className="block text-sm mb-1 font-medium text-[#5A3A22]">
          Comentário (opcional)
        </label>
        <textarea
          className="w-full border border-[#5A3A22]/40 rounded-lg px-3 py-2 mb-4 h-24 text-sm disabled:opacity-60"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Como foi a experiência?"
          disabled={busy}
        />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-60"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy}
            className={`px-4 py-1.5 text-sm rounded-lg font-semibold shadow ${
              busy
                ? "bg-[#FFD700]/60 cursor-not-allowed text-[#5A3A22]"
                : "bg-[#FFD700] hover:bg-[#FFCA00] text-[#5A3A22]"
            }`}
          >
            {busy ? "Enviando..." : "Enviar avaliação"}
          </button>
        </div>
      </div>
    </div>
  );
}
