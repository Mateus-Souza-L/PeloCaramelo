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

// ✅ senha forte: min 8, letras + números
function isStrongPassword(pw) {
  const s = String(pw || "");
  return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(s);
}

const onlyDigits = (s) => String(s || "").replace(/\D/g, "");
const formatCep = (cep) => {
  const d = onlyDigits(cep).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
};

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
    cep: "", // ✅ novo (front-only) — usado para auto preencher
    city: "", // ✅ obrigatório
    neighborhood: "", // ✅ obrigatório
    address: "",
    password: "",
    confirm: "",
  });

  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const cepRef = useRef(null);
  const cityRef = useRef(null);
  const neighborhoodRef = useRef(null);
  const hasFocusedOnce = useRef(false);

  // ✅ controla quais campos foram auto-preenchidos (para permitir sobrescrever ao trocar CEP)
  const autoFilledRef = useRef({
    city: false,
    neighborhood: false,
    address: false,
  });

  // ✅ CEP lookup state
  const [cepStatus, setCepStatus] = useState("idle"); // idle | loading | ok | error
  const lastCepLookupRef = useRef(""); // guarda o último CEP consultado (8 dígitos)

  const handleChange = (e) => {
    const { name, value } = e.target;

    // ✅ se o usuário editou manualmente, não sobrescreve mais pelo CEP
    if (name === "city") autoFilledRef.current.city = false;
    if (name === "neighborhood") autoFilledRef.current.neighborhood = false;
    if (name === "address") autoFilledRef.current.address = false;

    setForm((prev) => ({ ...prev, [name]: value }));
  };

  useEffect(() => {
    document.title = "PeloCaramelo | Cadastro";

    // ===========================================================
    // ✅ Convite: /register?mode=caregiver&ref=XXXX
    // - aceita também ?role=...
    // ===========================================================
    const qpRole = q.get("role");
    const qpMode = q.get("mode"); // "caregiver" | "tutor"
    const qpRef = q.get("ref") || q.get("referral") || q.get("r") || "";

    // salva referral para futuro "indique e ganhe"
    if (qpRef) {
      try {
        localStorage.setItem("pc_ref", String(qpRef));
      } catch {
        // ignore
      }
    }

    // prioridade: role (legado) > mode (novo)
    const picked =
      qpRole === "tutor" || qpRole === "caregiver"
        ? qpRole
        : qpMode === "tutor" || qpMode === "caregiver"
          ? qpMode
          : "";

    if (picked) {
      setRole(picked);
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

  // ✅ Auto preencher por CEP (ViaCEP) — quando tiver 8 dígitos
  useEffect(() => {
    if (step !== "form") return;

    const cepDigits = onlyDigits(form.cep);
    if (cepDigits.length !== 8) {
      if (cepStatus !== "idle") setCepStatus("idle");
      return;
    }

    // evita re-consultar o mesmo CEP
    if (lastCepLookupRef.current === cepDigits) return;

    const controller = new AbortController();

    const run = async () => {
      setCepStatus("loading");
      try {
        const resp = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`, {
          signal: controller.signal,
        });
        if (!resp.ok) throw new Error("Falha ao consultar CEP.");
        const data = await resp.json();

        if (data?.erro) {
          lastCepLookupRef.current = "";
          setCepStatus("error");
          showToast("CEP não encontrado. Verifique e tente novamente.", "error");
          return;
        }

        const city = String(data?.localidade || "").trim();
        const neighborhood = String(data?.bairro || "").trim();
        const street = String(data?.logradouro || "").trim();
        const complement = String(data?.complemento || "").trim();

        // marca como consultado
        lastCepLookupRef.current = cepDigits;

        // ✅ sobrescreve apenas o que foi auto-preenchido antes (ou está vazio)
        setForm((prev) => {
          const next = { ...prev };

          const prevCity = String(prev.city || "").trim();
          const prevNeigh = String(prev.neighborhood || "").trim();
          const prevAddr = String(prev.address || "").trim();

          if ((autoFilledRef.current.city || !prevCity) && city) {
            next.city = city;
            autoFilledRef.current.city = true;
          }

          if ((autoFilledRef.current.neighborhood || !prevNeigh) && neighborhood) {
            next.neighborhood = neighborhood;
            autoFilledRef.current.neighborhood = true;
          }

          const fullAddress = [street, complement].filter(Boolean).join(" - ").trim();
          if ((autoFilledRef.current.address || !prevAddr) && fullAddress) {
            next.address = fullAddress;
            autoFilledRef.current.address = true;
          }

          return next;
        });

        setCepStatus("ok");
      } catch (err) {
        if (err?.name === "AbortError") return;
        console.error("Erro ao buscar CEP:", err);
        lastCepLookupRef.current = "";
        setCepStatus("error");
        showToast("Não foi possível consultar o CEP agora. Tente novamente.", "error");
      }
    };

    // pequeno debounce
    const t = setTimeout(run, 350);

    return () => {
      clearTimeout(t);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.cep, step]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    const n = form.name.trim();
    const em = form.email.trim().toLowerCase();
    const pw = form.password.trim();
    const cf = form.confirm.trim();

    const city = form.city.trim();
    const neighborhood = form.neighborhood.trim();

    if (!role) return showToast("Escolha um perfil para continuar.", "error");

    // ✅ obrigatórios (agora inclui city + neighborhood)
    if (!n || !em || !pw || !cf || !city || !neighborhood) {
      // foca no primeiro faltante
      if (!n) nameRef.current?.focus?.();
      else if (!em) emailRef.current?.focus?.();
      else if (!city) cityRef.current?.focus?.();
      else if (!neighborhood) neighborhoodRef.current?.focus?.();

      return showToast("Preencha todos os campos obrigatórios.", "error");
    }

    if (!isValidEmail(em)) {
      emailRef.current?.focus?.();
      return showToast("E-mail inválido.", "error");
    }

    // ✅ senha forte no front
    if (!isStrongPassword(pw)) {
      return showToast("Senha fraca: mínimo 8 caracteres, com letras e números.", "error");
    }

    if (pw !== cf) {
      return showToast("As senhas não coincidem.", "error");
    }

    try {
      setLoading(true);

      const { user, token } = await registerRequest({
        name: n,
        email: em,
        password: pw,
        role,

        // ✅ obrigatórios
        city,
        neighborhood,

        // opcionais
        phone: form.phone?.trim() || null,
        address: form.address?.trim() || null,

        // ⚠️ não enviamos CEP por enquanto (backend pode não suportar esse campo)
      });

      login(user, token);

      // ✅ dispara o WelcomeModal no Dashboard (1x por sessão)
      try {
        sessionStorage.setItem("pc_welcome_toast", "1");

        // fallback (se você ainda tiver o effect antigo em algum lugar)
        localStorage.setItem("pc_showWelcomeToast", "1");
        localStorage.setItem("pc_showWelcomeToast_role", String(user?.role || role || ""));
      } catch {
        // ignore
      }

      // ✅ navega para o mesmo painel que você já usa hoje
      if (user.role === "caregiver") navigate("/painel-cuidador", { replace: true });
      else navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("Erro ao registrar:", err);

      // ✅ backend pode retornar códigos
      if (err?.code === "WEAK_PASSWORD") {
        showToast("Senha fraca: mínimo 8 caracteres, com letras e números.", "error");
        return;
      }
      if (err?.code === "CITY_REQUIRED") {
        cityRef.current?.focus?.();
        showToast("Cidade é obrigatória.", "error");
        return;
      }
      if (err?.code === "NEIGHBORHOOD_REQUIRED") {
        neighborhoodRef.current?.focus?.();
        showToast("Bairro é obrigatório.", "error");
        return;
      }

      if (err?.status === 409) {
        showToast("Este e-mail já está cadastrado.", "error");
        emailRef.current?.focus?.();
        return;
      }

      showToast(err?.message || "Erro ao criar conta.", "error");
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
              Escolha como deseja usar a PeloCaramelo:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Tutor */}
              <button
                onClick={() => proceedRole("tutor")}
                className="border rounded-2xl p-5 text-left hover:shadow-md transition bg-[#FFF7E0]"
                type="button"
              >
                <h2 className="text-xl font-semibold text-[#5A3A22] mb-2 md:text-center">
                  Ser Tutor
                </h2>
                <p className="text-[#5A3A22]/90 text-sm md:text-center">
                  Quero encontrar cuidadores, fazer reservas e gerenciar meus pedidos.
                </p>
              </button>

              {/* Cuidador */}
              <button
                onClick={() => proceedRole("caregiver")}
                className="border rounded-2xl p-5 text-left hover:shadow-md transition bg-[#F4F0FF]"
                type="button"
              >
                <h2 className="text-xl font-semibold text-[#5A3A22] mb-2 md:text-center">
                  Ser Cuidador
                </h2>
                <p className="text-[#5A3A22]/90 text-sm md:text-center">
                  Quero oferecer meus serviços, definir disponibilidade e receber reservas.
                </p>
              </button>

              {/* Já tenho conta — WEB ONLY */}
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="
      hidden md:flex
      border rounded-2xl p-5
      hover:shadow-md transition
      bg-[#FFD700]/30 hover:bg-[#FFD700]/50
      items-center justify-center text-center
    "
              >
                <div>
                  <h2 className="text-xl font-semibold text-[#5A3A22] mb-2">
                    Já tenho conta
                  </h2>
                  <p className="text-[#5A3A22]/90 text-sm md:text-center">
                    Entrar na minha conta existente
                  </p>
                </div>
              </button>
            </div>

            {/* MOBILE mantém exatamente como estava */}
            <div className="mt-6 flex justify-center md:hidden">
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

              {/* ✅ CEP (auto-preenche cidade/bairro/endereço quando encontrado) */}
              <div className="w-full">
                <input
                  ref={cepRef}
                  type="text"
                  name="cep"
                  value={form.cep}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, cep: formatCep(e.target.value) }))
                  }
                  placeholder="CEP — ex: 01001-000"
                  className="w-full border rounded-lg p-2"
                  inputMode="numeric"
                  autoComplete="postal-code"
                />
                {cepStatus === "loading" && (
                  <p className="text-xs text-[#5A3A22]/70 mt-1">Buscando endereço pelo CEP…</p>
                )}
                {cepStatus === "ok" && (
                  <p className="text-xs text-[#5A3A22]/70 mt-1">CEP encontrado ✅</p>
                )}
              </div>

              <input
                ref={cityRef}
                type="text"
                name="city"
                value={form.city}
                onChange={handleChange}
                placeholder="Cidade *"
                className="w-full border rounded-lg p-2"
                required
              />

              <input
                ref={neighborhoodRef}
                type="text"
                name="neighborhood"
                value={form.neighborhood}
                onChange={handleChange}
                placeholder="Bairro *"
                className="w-full border rounded-lg p-2"
                required
              />

              <input
                type="text"
                name="address"
                value={form.address}
                onChange={handleChange}
                placeholder="Endereço"
                className="md:col-span-2 w-full border rounded-lg p-2"
                autoComplete="street-address"
              />

              <PasswordField
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="Senha *"
                autoComplete="new-password"
                required
              />

              <PasswordField
                value={form.confirm}
                onChange={(e) => setForm((prev) => ({ ...prev, confirm: e.target.value }))}
                placeholder="Confirmar senha *"
                autoComplete="new-password"
                required
              />
            </div>

            {/* ✅ dica de senha (sem mexer no layout) */}
            <p className="text-xs text-[#5A3A22]/80 mt-2">
              Sua senha deve ter <b>no mínimo 8 caracteres</b> e conter <b>letras e números</b>.
            </p>

            {role === "caregiver" && (
              <p className="text-sm text-[#5A3A22] mt-3">
                <b>Dica:</b> você poderá configurar seus <b>serviços, preços e disponibilidade</b>{" "}
                no perfil após finalizar o cadastro.
              </p>
            )}

            <p className="text-sm text-[#5A3A22] mt-3 opacity-80">
              🔒 Por segurança, o <b>endereço completo</b> só será exibido após a{" "}
              <b>reserva confirmada</b>.
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
                className={`px-5 py-2 rounded-lg font-semibold text-white ${loading
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