// src/pages/ForgotPassword.jsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/ToastProvider";
import { authRequest } from "../services/api";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const isValid = useMemo(() => {
    const v = String(email || "").trim().toLowerCase();
    return v.includes("@") && v.includes(".");
  }, [email]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isValid || sending) return;

    try {
      setSending(true);

      await authRequest(`${API_BASE_URL}/auth/forgot-password`, {
        method: "POST",
        body: JSON.stringify({ email: String(email).trim().toLowerCase() }),
      });

      showToast("Se o e-mail existir, enviaremos um link de recuperação.", "success");
      setEmail("");
    } catch (err) {
      console.error("forgot-password error:", err);
      showToast("Erro ao solicitar recuperação. Tente novamente.", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#EBCBA9] px-4 py-10 flex items-center justify-center">
      <div
        className="
          w-full max-w-[520px]
          rounded-[28px]
          bg-[#FFF8F0]
          shadow-lg
          overflow-hidden
          border border-[#5A3A22]/10
          border-l-4 border-l-[#5A3A22]
        "
      >
        <div className="p-6 sm:p-8">
          <h1 className="m-0 text-[#5A3A22] text-xl sm:text-2xl font-extrabold">
            Esqueci minha senha
          </h1>

          <p className="mt-2 mb-6 text-[#5A3A22]/80 leading-relaxed">
            Informe seu e-mail e enviaremos um link para redefinir sua senha.
          </p>

          <form onSubmit={handleSubmit}>
            <label className="block text-sm font-semibold text-[#5A3A22] mb-2">
              E-mail
            </label>

            <input
              type="email"
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seuemail@exemplo.com"
              className="
                w-full
                rounded-xl
                border border-[#5A3A22]/25
                bg-white
                px-4 py-3
                text-sm
                outline-none
                focus:border-[#5A3A22]/60
                focus:ring-2 focus:ring-[#5A3A22]/20
                transition
              "
            />

            <button
              type="submit"
              disabled={!isValid || sending}
              className="
                mt-4
                w-full
                rounded-xl
                px-4 py-3
                text-sm font-bold
                shadow-md
                transition
                bg-[#95301F] text-white
                hover:brightness-110
                focus:outline-none focus:ring-2 focus:ring-[#95301F]/30
                disabled:cursor-not-allowed
                disabled:bg-[#c9b9aa]
                disabled:shadow-none
              "
            >
              {sending ? "Enviando..." : "Enviar link"}
            </button>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="
                  w-full
                  rounded-xl
                  border-2 border-[#5A3A22]
                  bg-transparent
                  px-4 py-3
                  text-sm font-bold text-[#5A3A22]
                  transition
                  hover:bg-[#5A3A22]/10
                  focus:outline-none focus:ring-2 focus:ring-[#5A3A22]/25
                "
              >
                Voltar ao login
              </button>

              <button
                type="button"
                onClick={() => navigate("/")}
                className="
                  w-full
                  rounded-xl
                  border-2 border-[#5A3A22]
                  bg-transparent
                  px-4 py-3
                  text-sm font-bold text-[#5A3A22]
                  transition
                  hover:bg-[#5A3A22]/10
                  focus:outline-none focus:ring-2 focus:ring-[#5A3A22]/25
                "
              >
                Início
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
