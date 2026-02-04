import ReactDOM from "react-dom";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

const ToastContext = createContext(null);

const DURATION = 4000; // ms
const MAX_TOASTS = 3;

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const last = useRef({ msg: "", type: "", ts: 0 });
  const mounted = useRef(true);

  const dismiss = useCallback((id) => {
    const tm = timers.current.get(id);
    if (tm) clearTimeout(tm);
    timers.current.delete(id);

    if (!mounted.current) return;

    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const armTimer = useCallback(
    (id, ms = DURATION) => {
      const prev = timers.current.get(id);
      if (prev) clearTimeout(prev);

      const tm = setTimeout(() => dismiss(id), ms);
      timers.current.set(id, tm);
    },
    [dismiss]
  );

  const showToast = useCallback(
    (message, type = "notify", { duration } = {}) => {
      if (!mounted.current) return;

      const now = Date.now();

      // evita duplicata em < 500ms
      if (
        last.current.msg === message &&
        last.current.type === type &&
        now - last.current.ts < 500
      ) {
        return;
      }

      last.current = { msg: message, type, ts: now };

      const id = now + Math.random();

      setToasts((prev) => {
        let next = [...prev];

        // remove o mais antigo se estourar o limite
        if (next.length >= MAX_TOASTS) {
          const oldest = next[0];
          const tm = timers.current.get(oldest.id);
          if (tm) clearTimeout(tm);
          timers.current.delete(oldest.id);
          next.shift();
        }

        return [...next, { id, message, type }];
      });

      // ✅ SEM SOM (mantém visual do toast intacto)
      armTimer(id, duration ?? DURATION);
    },
    [armTimer]
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const tm of timers.current.values()) clearTimeout(tm);
      timers.current.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {ReactDOM.createPortal(
        <div className="fixed bottom-6 right-6 z-[9999] space-y-3 pointer-events-none">
          <AnimatePresence>
            {toasts.map(({ id, message, type }) => (
              <motion.div
                key={id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.2 }}
                className={`pointer-events-auto flex items-center justify-between px-4 py-3 rounded-xl shadow-lg font-semibold text-[#5A3A22] bg-white border-l-8 ${
                  type === "success"
                    ? "border-green-500"
                    : type === "error"
                    ? "border-red-500"
                    : "border-yellow-400"
                }`}
              >
                <div className="pr-4">
                  <p className="text-sm">{message}</p>
                </div>
                <button
                  onClick={() => dismiss(id)}
                  className="text-[#5A3A22]/70 hover:text-[#5A3A22] text-sm font-bold px-1"
                  aria-label="Fechar"
                  type="button"
                >
                  ✕
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast deve ser usado dentro de <ToastProvider />");
  }
  return ctx;
}
