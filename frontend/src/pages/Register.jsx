// frontend/src/pages/Register.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "../components/ToastProvider";
import { useAuth } from "../context/AuthContext";
import { registerRequest } from "../services/api";
import PasswordField from "../components/PasswordField";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function Register() {
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const q = useQuery();

  // UI
  const [step, setStep] = useState("choose");
  const [loading, setLoading] = useState(false);

  // Dados
  const [role, setRole] = useState(""); // "tutor" | "caregiver"
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    city: "",
    address: "",
    password: "",
    confirm: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const hasFocusedOnce = useRef(false);

  useEffect(() => {
    document.title = "PeloCaramelo | Cadastro";
    const qpRole = q.get("role");
    if (qpRole === "tutor" || qpRole === "caregiver") {
      setRole(qpRole);
      setStep("form");
    }
  }, [q]);

  useEffect(() => {
    if (step === "form" && !hasFocusedOnce.current) {
      hasFocusedOnce.current = true;
      (nameRef.current ?? emailRef.current)?.focus?.();
    }
  }, [step]);

  const proceedRole = (r) => {
    setRole(r);
    setStep("form");
  };

  const isValidEmail = (em) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    const n = form.name.trim();
    const em = form.email.trim().toLowerCase();
    const pw = form.password.trim();
    const cf = form.confirm.trim();

    if (!role) return showToast("Escolha um perfil para continuar.", "error");
    if (!n || !em || !pw || !cf)
      return showToast("Preencha todos os campos obrigatórios.", "error");
    if (!isValidEmail(em)) {
      emailRef.current?.focus();
      return showToast("E-mail inválido.", "error");
    }
    if (pw !== cf) return showToast("As senhas não coincidem.", "error");

    try {
      setLoading(true);

      // 🔥 Chamada REAL para o backend
      const { user, token } = await registerRequest({
        name: n,
        email: em,
        password: pw,
        role,
        city: form.city || null,
        phone: form.phone || null,
        address: form.address || null,
      });

      login(user, token);

      showToast("Cadastro concluído! 🎉 Bem-vindo(a).", "success");

      if (user.role === "caregiver") navigate("/painel-cuidador", { replace: true });
      else navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("Erro ao registrar:", err);

      if (err.status === 409) {
        showToast("Este e-mail já está cadastrado.", "error");
        emailRef.current?.focus();
        return;
      }

      showToast("Erro ao criar conta.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#EBCBA9] min-h-[calc(100vh-120px)] py-8">
      <div className="max-w-[1400px] mx-auto bg-white rounded-2xl shadow p-6 border-l-4 border-[#FFD700]/80">
        {step === "choose" ? (
          // PASSO 1 — Escolher perfil
          <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-[#5A3A22] text-center mb-6">
              Crie sua conta
            </h1>
            <p className="text-center text-[#5A3A22] mb-8 opacity-90">
              Escolha como deseja usar o PeloCaramelo:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <button
                onClick={() => proceedRole("tutor")}
                className="border rounded-2xl p-5 text-left hover:shadow-md transition bg-[#FFF7E0]"
              >
                <h2 className="text-xl font-semibold text-[#5A3A22] mb-2">Sou Tutor</h2>
                <p className="text-[#5A3A22]/90 text-sm">
                  Quero encontrar cuidadores, fazer reservas e gerenciar meus pedidos.
                </p>
              </button>

              <button
                onClick={() => proceedRole("caregiver")}
                className="border rounded-2xl p-5 text-left hover:shadow-md transition bg-[#F4F0FF]"
              >
                <h2 className="text-xl font-semibold text-[#5A3A22] mb-2">Sou Cuidador</h2>
                <p className="text-[#5A3A22]/90 text-sm">
                  Quero oferecer meus serviços, definir disponibilidade e receber reservas.
                </p>
              </button>
            </div>

            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="px-4 py-2 rounded-lg font-semibold text-[#5A3A22] bg-[#FFD700]/40 hover:bg-[#FFD700]/60 transition"
              >
                Já tenho conta
              </button>
            </div>
          </div>
        ) : (
          // PASSO 2 — Formulário
          <form onSubmit={handleSubmit} autoComplete="off" className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold text-[#5A3A22]">
                Cadastro {role === "tutor" ? "de Tutor" : "de Cuidador"}
              </h1>
              <button
                type="button"
                onClick={() => setStep("choose")}
                className="px-3 py-2 rounded-lg font-semibold text-[#5A3A22] bg-[#FFD700]/40 hover:bg-[#FFD700]/60 transition"
              >
                Trocar perfil
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                ref={nameRef}
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Nome completo *"
                className="w-full border rounded-lg p-2"
                required
              />

              <input
                ref={emailRef}
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="E-mail *"
                className="w-full border rounded-lg p-2"
                autoComplete="username"
                required
              />

              <input
                type="text"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="Telefone"
                className="w-full border rounded-lg p-2"
              />

              <input
                type="text"
                name="city"
                value={form.city}
                onChange={handleChange}
                placeholder="Cidade"
                className="w-full border rounded-lg p-2"
              />

              <input
                type="text"
                name="address"
                value={form.address}
                onChange={handleChange}
                placeholder="Endereço"
                className="md:col-span-2 w-full border rounded-lg p-2"
              />

              <PasswordField
                value={form.password}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, password: e.target.value }))
                }
                placeholder="Senha *"
                autoComplete="new-password"
                required
              />

              <PasswordField
                value={form.confirm}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, confirm: e.target.value }))
                }
                placeholder="Confirmar senha *"
                autoComplete="new-password"
                required
              />
            </div>

            {role === "caregiver" && (
              <p className="text-sm text-[#5A3A22] mt-3">
                <b>Dica:</b> você poderá configurar seus <b>serviços, preços e disponibilidade</b> no
                perfil após finalizar o cadastro.
              </p>
            )}

            <p className="text-sm text-[#5A3A22] mt-3 opacity-80">
              🔒 Por segurança, o <b>endereço completo</b> só será exibido após a <b>reserva confirmada</b>.
            </p>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="bg-gray-300 hover:bg-gray-400 text-[#5A3A22] px-4 py-2 rounded-lg"
                disabled={loading}
              >
                Cancelar
              </button>

              <button
                type="submit"
                className={`px-5 py-2 rounded-lg font-semibold text-white ${
                  loading
                    ? "bg-[#95301F]/60 cursor-not-allowed"
                    : "bg-[#95301F] hover:bg-[#B25B38]"
                }`}
                disabled={loading}
              >
                {loading ? "Criando..." : "Criar conta"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
