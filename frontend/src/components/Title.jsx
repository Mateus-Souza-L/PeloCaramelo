import { useEffect } from "react";

/**
 * Usa: <Title title="PeloCaramelo | Início"><Home /></Title>
 */
export default function Title({ title, children }) {
  useEffect(() => {
    document.title = title;
  }, [title]);

  return children;
}
