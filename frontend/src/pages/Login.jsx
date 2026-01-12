// frontend/src/pages/Login.jsx
import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ToastProvider";
import { loginRequest } from "../services/api";

// ✅ debug: garante que ESTE arquivo é o que está rodando
console.log(">>> LOGIN.jsx CARREGOU (arquivo certo) <<<");

export default function Login() {
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "PeloCaramelo | Login";
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    const eTrim = (email ?? "").trim();
    const pTrim = (password ?? "").trim();

    if (!eTrim || !pTrim) {
      showToast("Preencha e-mail e senha.", "error");
      return;
    }

    // sempre envia e-mail normalizado (minúsculo)
    const normalizedEmail = eTrim.toLowerCase();

    // ✅ debug: confirma o que vai ser enviado
    console.log("[LOGIN PAGE] enviando:", {
      email: normalizedEmail,
      passwordLen: pTrim.length,
    });

    try {
      setLoading(true);

      // chama o backend: POST /auth/login
      const { user, token } = await loginRequest({
        email: normalizedEmail,
        password: pTrim,
      });

      if (user.blocked) {
        showToast("Usuário bloqueado. Fale com o suporte.", "error");
        return;
      }

      // salva no AuthContext + localStorage
      login(user, token);

      showToast("Bem-vindo(a)! 🐾", "success");

      if (user.role === "admin") {
        navigate("/admin", { replace: true });
      } else if (user.role === "caregiver") {
        // cuidador usa o mesmo painel /dashboard
        navigate("/dashboard", { replace: true });
      } else {
        // tutor (ou qualquer outro)
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      console.error("Erro ao tentar logar:", err);
      // se o backend respondeu 401, tratamos como credenciais inválidas
      if (err?.status === 401 || err?.message === "Credenciais inválidas.") {
        showToast("E-mail ou senha inválidos.", "error");
      } else {
        showToast("Erro ao tentar logar.", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#EBCBA9] min-h-[calc(100vh-120px)] flex items-center justify-center py-10">
      {/* Card largo com barra amarela discreta */}
      <div className="max-w-[600px] w-full bg-white rounded-2xl shadow-lg p-8 border-l-4 border-[#FFD700]/80">
        <h1 className="text-3xl font-bold text-[#5A3A22] mb-6 text-center">
          Login
        </h1>

        <form onSubmit={handleSubmit} autoComplete="off" className="space-y-5">
          <div>
            <label className="block text-sm text-[#5A3A22] mb-1">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value ?? "")}
              placeholder="seu@email.com"
              autoComplete="username"
              autoFocus
              className="w-full border rounded-lg p-2"
            />
          </div>

          <div>
            <label className="block text-sm text-[#5A3A22] mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value ?? "")}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full border rounded-lg p-2"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2 rounded-lg font-semibold text-white transition ${
              loading
                ? "bg-[#95301F]/70 cursor-not-allowed"
                : "bg-[#95301F] hover:bg-[#B25B38]"
            }`}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="text-center text-sm mt-5 text-[#5A3A22]">
          Não tem conta?{" "}
          <Link
            to="/register"
            className="text-[#95301F] underline hover:opacity-80"
          >
            Cadastre-se
          </Link>
        </p>
      </div>
    </div>
  );
}
