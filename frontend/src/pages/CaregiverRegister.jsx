// src/pages/CaregiverRegister.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/ToastProvider";
import PasswordField from "../components/PasswordField";

const INITIAL_SERVICES = {
  hospedagem: false,
  creche: false,
  petSitter: false,
  passeios: false,
};

const num = (v) =>
  v === "" || v === null || v === undefined ? null : Number(v);

// URL base da API (pode centralizar depois em um arquivo utils/services/api)
const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:4000";

export default function CaregiverRegister() {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [services, setServices] = useState(INITIAL_SERVICES);
  const [prices, setPrices] = useState({
    hospedagemDia: "",
    crecheDiaria: "",
    petSitterDiaria: "",
    passeiosHora: "",
  });

  const [city, setCity] = useState("");
  const [raioKm, setRaioKm] = useState("");

  useEffect(() => {
    document.title = "PeloCaramelo | Cadastro Cuidador";
  }, []);

  const toggleService = (k) =>
    setServices((s) => ({ ...s, [k]: !s[k] }));

  const handleSubmit = async (e) => {
    e.preventDefault();

    // validações básicas
    if (!name.trim() || !email.trim() || !password.trim()) {
      showToast("Preencha nome, e-mail e senha.", "error");
      return;
    }

    if (!city.trim()) {
      showToast("Informe a cidade (obrigatório).", "error");
      return;
    }

    const selectedServices = Object.entries(services)
      .filter(([, v]) => v)
      .map(([k]) => k);

    if (selectedServices.length === 0) {
      showToast(
        "Selecione pelo menos um serviço oferecido.",
        "error"
      );
      return;
    }

    // preços obrigatórios (>0) conforme serviços marcados
    const must = [];
    if (
      services.hospedagem &&
      !(num(prices.hospedagemDia) > 0)
    )
      must.push("Hospedagem (diária)");
    if (services.creche && !(num(prices.crecheDiaria) > 0))
      must.push("Creche (diária)");
    if (
      services.petSitter &&
      !(num(prices.petSitterDiaria) > 0)
    )
      must.push("Pet Sitter (diária/visita)");
    if (
      services.passeios &&
      !(num(prices.passeiosHora) > 0)
    )
      must.push("Passeios (por hora)");

    if (must.length) {
      showToast(
        `Defina o preço para: ${must.join(", ")}.`,
        "error"
      );
      return;
    }

    // Monta objeto de preços normalizado
    const normalizedPrices = {
      hospedagemDia: services.hospedagem
        ? num(prices.hospedagemDia)
        : null,
      crecheDiaria: services.creche
        ? num(prices.crecheDiaria)
        : null,
      petSitterDiaria: services.petSitter
        ? num(prices.petSitterDiaria)
        : null,
      passeiosHora: services.passeios
        ? num(prices.passeiosHora)
        : null,
    };

    // Payload para o backend
    const payload = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role: "caregiver",
      city: city.trim(),

      // esses campos o backend já suporta na tabela users (jsonb)
      services: { ...services },
      prices: normalizedPrices,

      // raioKm pode entrar depois via PATCH /users/me, mas já deixo preparado
      // prefs: { raioKm: raioKm ? num(raioKm) : null },
    };

    try {
      const response = await fetch(
        `${API_BASE_URL}/auth/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        // Backend já devolve mensagens amigáveis (ex.: "E-mail já cadastrado.")
        const msg =
          data?.error ||
          "Erro ao cadastrar cuidador. Tente novamente.";
        showToast(msg, "error");
        return;
      }

      // Aqui poderíamos usar data.user / data.token para logar direto,
      // mas por enquanto vamos manter o fluxo de ir para o login.
      showToast("Cadastro realizado com sucesso! 🐾", "success");
      navigate("/login", { replace: true });
    } catch (err) {
      console.error("Erro ao chamar /auth/register:", err);
      showToast(
        "Erro de conexão com o servidor. Tente novamente.",
        "error"
      );
    }
  };

  return (
    <div className="bg-[#EBCBA9] min-h-screen flex items-center justify-center">
      <div className="bg-white shadow-lg rounded-lg p-8 w-full max-w-2xl">
        <h1 className="text-2xl font-bold mb-6 text-center text-[#5A3A22]">
          Cadastro de Cuidador
        </h1>

        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {/* Identificação */}
          <input
            type="text"
            required
            placeholder="Nome completo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input md:col-span-2"
          />

          <input
            type="email"
            required
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />

          <PasswordField
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha"
            className="md:col-span-1"
          />

          {/* Localização / Raio */}
          <input
            type="text"
            required
            placeholder="Cidade (obrigatório)"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="input"
          />

          <input
            type="number"
            min="0"
            placeholder="Raio de atendimento (km, opcional)"
            value={raioKm}
            onChange={(e) => setRaioKm(e.target.value)}
            className="input"
          />

          {/* Serviços oferecidos */}
          <div className="md:col-span-2 bg-[#FFF8F0] rounded-xl p-4 border-l-4 border-[#D2A679]">
            <p className="font-semibold text-[#5A3A22] mb-2">
              Serviços oferecidos
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={services.hospedagem}
                  onChange={() => toggleService("hospedagem")}
                />
                Hospedagem
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={services.creche}
                  onChange={() => toggleService("creche")}
                />
                Creche
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={services.petSitter}
                  onChange={() => toggleService("petSitter")}
                />
                Pet Sitter
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={services.passeios}
                  onChange={() => toggleService("passeios")}
                />
                Passeios
              </label>
            </div>
          </div>

          {/* Preços por serviço (apenas quando selecionado) */}
          {services.hospedagem && (
            <input
              type="number"
              min="1"
              required
              placeholder="Preço hospedagem (diária) – R$"
              value={prices.hospedagemDia}
              onChange={(e) =>
                setPrices((p) => ({
                  ...p,
                  hospedagemDia: e.target.value,
                }))
              }
              className="input"
            />
          )}

          {services.creche && (
            <input
              type="number"
              min="1"
              required
              placeholder="Preço creche (diária) – R$"
              value={prices.crecheDiaria}
              onChange={(e) =>
                setPrices((p) => ({
                  ...p,
                  crecheDiaria: e.target.value,
                }))
              }
              className="input"
            />
          )}

          {services.petSitter && (
            <input
              type="number"
              min="1"
              required
              placeholder="Preço pet sitter (diária/visita) – R$"
              value={prices.petSitterDiaria}
              onChange={(e) =>
                setPrices((p) => ({
                  ...p,
                  petSitterDiaria: e.target.value,
                }))
              }
              className="input"
            />
          )}

          {services.passeios && (
            <input
              type="number"
              min="1"
              required
              placeholder="Preço passeios (por hora) – R$"
              value={prices.passeiosHora}
              onChange={(e) =>
                setPrices((p) => ({
                  ...p,
                  passeiosHora: e.target.value,
                }))
              }
              className="input"
            />
          )}

          <button
            type="submit"
            className="md:col-span-2 bg-[#5A3A22] hover:bg-[#95301F] text-white px-4 py-2 rounded-lg font-semibold shadow-md transition"
          >
            Cadastrar
          </button>
        </form>
      </div>
    </div>
  );
}
