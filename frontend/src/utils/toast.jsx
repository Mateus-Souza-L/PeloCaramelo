// src/utils/toast.jsx
import { motion } from "framer-motion";
import { createPortal } from "react-dom";
import { playSound } from "./sound";

// 🔔 Componente visual do Toast
export const Toast = ({ message, type }) =>
  createPortal(
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.3 }}
      className={`fixed bottom-6 right-6 z-[9999] px-5 py-3 rounded-xl font-semibold shadow-lg border-l-4 ${
        type === "success"
          ? "bg-green-600 border-[#FFD700] text-white"
          : type === "error"
          ? "bg-red-600 border-[#FFD700] text-white"
          : "bg-[#5A3A22] border-[#FFD700] text-white"
      }`}
      style={{ boxShadow: "0 4px 10px rgba(0,0,0,0.3)" }}
    >
      {message}
    </motion.div>,
    document.body
  );

// 💬 Função global para exibir Toast + som
export const showToast = (setToast, message, type = "success", duration = 2500) => {
  try {
    setToast({ show: true, message, type });
    playSound(type);
    clearTimeout(window._toastTimeout);
    window._toastTimeout = setTimeout(() => setToast({ show: false }), duration);
  } catch (err) {
    console.error("Erro ao exibir toast:", err);
  }
};
