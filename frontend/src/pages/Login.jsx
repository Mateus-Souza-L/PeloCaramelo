// frontend/src/pages/Login.jsx
import { useEffect, useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ToastProvider";
import { loginRequest } from "../services/api";

function pickBlockedPayload(err) {
  const data = err?.data || err?.response?.data || null;
  const code = data?.code || data?.errorCode || null;
  if (code !== "USER_BLOCKED") return null;

  return {
    reason: data?.reason ?? data?.blockedReason ?? null,
    blockedUntil: data?.blockedUntil ?? null,
  };
}

export default function Login() {
  const {
    login,
    showBlockedModal,
    isAuthenticated,
    loading: authLoading,
    user,
  } = useAuth();

  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "PeloCaramelo | Login";
  }, []);

  // Redireciona se já estiver autenticado
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) return;

    const from = location.state?.from;
    const to =
      (typeof from === "string" && from) ||
      from?.pathname ||
      (user?.role === "admin" ? "/admin" : "/dashboard");

    navigate(to, { replace: true });
  }, [authLoading, isAuthenticated, navigate, location.state, user?.role]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    const eTrim = (email ?? "").trim();
    const pTrim = (password ?? "").trim();

    if (!eTrim || !pTrim) {
      showToast("Preencha e-mail e senha.", "error");
      return;
    }

    const normalizedEmail = eTrim.toLowerCase();

    try {
      setLoading(true);

      const { user: loginUser, token } = await loginRequest({
        email: normalizedEmail,
        password: pTrim,
      });

      if (loginUser?.blocked) {
        showBlockedModal?.({
          reason: loginUser?.blockedReason ?? null,
          blockedUntil: loginUser?.blockedUntil ?? null,
        });
        return;
      }

      showToast("Bem-vindo(a)! 🐾", "success");

      const target =
        loginUser?.role === "admin" ? "/admin" : "/dashboard";

      navigate(target, { replace: true });

      Promise.resolve(login(loginUser, token)).catch((err) => {
        console.error("login() falhou após redirect:", err);
      });
    } catch (err) {
      console.error("Erro ao tentar logar:", err);

      const status = err?.status ?? err?.response?.status ?? null;
      const bi = pickBlockedPayload(err);

      if (status === 403 && bi) {
        showBlockedModal?.(bi);
        return;
      }

      if (status === 401 || err?.message === "Credenciais inválidas.") {
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
      <div className="max-w-[600px] w-full bg-white rounded-2xl shadow-lg p-8 border-l-4 border-[#FFD700]/80">
        <h1 className="text-3xl font-bold text-[#5A3A22] mb-6 text-center">
          Login
        </h1>

        <form
          onSubmit={handleSubmit}
          autoComplete="off"
          className="space-y-5"
        >
          {/* EMAIL */}
          <div>
            <label className="block text-sm text-[#5A3A22] mb-1">
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value ?? "")}
              placeholder="seu@email.com"
              autoComplete="username"
              autoFocus
              className="w-full border border-[#D2A679] rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-[#FFD700]/60 transition"
            />
          </div>

          {/* SENHA */}
          <div>
            <label className="block text-sm text-[#5A3A22] mb-1">
              Senha
            </label>

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value ?? "")}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full border border-[#D2A679] rounded-lg p-2 pr-12 focus:outline-none focus:ring-2 focus:ring-[#FFD700]/60 transition"
              />

              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={
                  showPassword ? "Ocultar senha" : "Mostrar senha"
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5A3A22] hover:text-[#95301F] transition"
              >
                {showPassword ? (
                  <EyeOff size={20} strokeWidth={2} />
                ) : (
                  <Eye size={20} strokeWidth={2} />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end">
            <Link
              to="/forgot-password"
              className="text-sm text-[#95301F] underline hover:opacity-80"
            >
              Esqueci minha senha
            </Link>
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