import { useState, forwardRef } from "react";
import { Eye, EyeOff } from "lucide-react";

const PasswordField = forwardRef(
  ({ value, onChange, placeholder = "Senha", className = "", inputClassName = "", ...props }, ref) => {
    const [show, setShow] = useState(false);

    return (
      <div className={`relative ${className}`}>
        <input
          ref={ref}
          type={show ? "text" : "password"}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete="new-password"
          className={`border border-[#5A3A22] rounded-lg px-3 py-2 w-full pr-10 focus:outline-none focus:ring-2 focus:ring-[#95301F] ${inputClassName}`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-[#EBCBA9]/40 text-[#5A3A22] focus:outline-none"
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    );
  }
);

export default PasswordField;
