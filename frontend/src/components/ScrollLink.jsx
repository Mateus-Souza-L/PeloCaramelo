// src/components/ScrollLink.jsx
import { useNavigate } from "react-router-dom";

function isExternalUrl(to) {
  const v = String(to || "");
  return (
    v.startsWith("http://") ||
    v.startsWith("https://") ||
    v.startsWith("mailto:") ||
    v.startsWith("tel:")
  );
}

export default function ScrollLink({
  to,
  children,
  className,
  onClick,
  ...rest
}) {
  const navigate = useNavigate();

  const handleClick = (e) => {
    // Se for externo, deixa o browser cuidar
    if (isExternalUrl(to)) {
      onClick?.(e);
      return;
    }

    e.preventDefault();
    onClick?.(e);

    navigate(to);

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <a href={to} onClick={handleClick} className={className} {...rest}>
      {children}
    </a>
  );
}
