import { useEffect } from "react";

/**
 * Uso:
 * <Title title="Início"><Home /></Title>
 * ou
 * <Title title="PeloCaramelo | Início"><Home /></Title>
 */
export default function Title({ title, children }) {
  useEffect(() => {
    const base = "PeloCaramelo";

    if (typeof title === "string" && title.trim()) {
      // Se já tiver a marca no título, mantém
      if (title.includes(base)) {
        document.title = title;
      } else {
        document.title = `${title} | ${base}`;
      }
    } else {
      document.title = base;
    }
  }, [title]);

  return children;
}
