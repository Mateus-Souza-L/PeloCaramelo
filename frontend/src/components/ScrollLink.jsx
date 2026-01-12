import { useNavigate } from "react-router-dom";

export default function ScrollLink({ to, children, className }) {
  const navigate = useNavigate();

  const handleClick = (e) => {
    e.preventDefault();
    navigate(to);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <a href={to} onClick={handleClick} className={className}>
      {children}
    </a>
  );
}
