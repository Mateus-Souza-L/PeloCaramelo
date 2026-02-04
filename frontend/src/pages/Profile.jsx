// src/pages/Profile.jsx
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ToastProvider";
import { authRequest } from "../services/api";

const DEFAULT_IMG = "/paw.png";
const DEFAULT_DAILY_CAPACITY = 15;

const EMPTY_SERVICES = {
  hospedagem: false,
  creche: false,
  petSitter: false,
  passeios: false,
};

const EMPTY_PRICES = {
  hospedagem: "",
  creche: "",
  petSitter: "",
  passeios: "",
};

// rótulos bonitinhos para exibição
const SERVICE_LABELS = {
  hospedagem: "Hospedagem",
  creche: "Creche",
  petSitter: "PetSitter",
  passeios: "Passeios",
};

const maskCep = (raw) => {
  const d = String(raw || "").replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
};

// aceita "10,50" e "10.50" e retorna string normalizada "10.50"
function normalizeMoneyString(v) {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  // remove tudo exceto dígitos, vírgula, ponto
  const cleaned = s.replace(/[^\d.,]/g, "");
  if (!cleaned) return "";
  // se tiver vírgula e ponto, assume ponto como milhar e vírgula decimal: "1.234,56"
  if (cleaned.includes(",") && cleaned.includes(".")) {
    const noThousands = cleaned.replace(/\./g, "");
    return noThousands.replace(",", ".");
  }
  // se só vírgula: "10,5"
  if (cleaned.includes(",")) return cleaned.replace(",", ".");
  return cleaned;
}

const buildFormFromUser = (user) => {
  if (!user) {
    return {
      name: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      neighborhood: "",
      cep: "",
      bio: "",
      image: "",
      newPassword: "",
      services: { ...EMPTY_SERVICES },
      prices: { ...EMPTY_PRICES },
      daily_capacity: DEFAULT_DAILY_CAPACITY,
      courses: [],
      newCourse: "",
    };
  }

  // garante que services/prices sejam OBJETOS (não arrays, nem valores estranhos)
  const rawServices = user.services;
  const rawPrices = user.prices;

  const safeServices =
    rawServices && !Array.isArray(rawServices) && typeof rawServices === "object" ? rawServices : {};

  const safePrices =
    rawPrices && !Array.isArray(rawPrices) && typeof rawPrices === "object" ? rawPrices : {};

  const capNum = Number(user.daily_capacity ?? user.dailyCapacity ?? DEFAULT_DAILY_CAPACITY);

  return {
    name: user.name ?? "",
    email: user.email ?? "",
    phone: user.phone ?? "",
    address: user.address ?? "",
    city: user.city ?? "",
    neighborhood: user.neighborhood ?? "",
    cep: user.cep ?? "",
    bio: user.bio ?? "",
    image: user.image ?? "",
    newPassword: "",
    services: { ...EMPTY_SERVICES, ...safeServices },
    prices: { ...EMPTY_PRICES, ...safePrices },
    daily_capacity: Number.isFinite(capNum) && capNum > 0 ? capNum : DEFAULT_DAILY_CAPACITY,
    courses: Array.isArray(user.courses) ? user.courses : [],
    newCourse: "",
  };
};

// média de reputação para o usuário logado
const getAvgRating = (mode, user, reservations) => {
  if (!user || !reservations.length) return null;

  if (mode === "tutor") {
    const ratings = reservations
      .filter((r) => String(r.tutorId) === String(user.id) && typeof r.caregiverRating === "number")
      .map((r) => r.caregiverRating);
    if (!ratings.length) return null;
    return (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);
  }

  if (mode === "caregiver") {
    const ratings = reservations
      .filter((r) => String(r.caregiverId) === String(user.id) && typeof r.tutorRating === "number")
      .map((r) => r.tutorRating);
    if (!ratings.length) return null;
    return (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);
  }

  return null;
};

// Modal simples de confirmação de senha (modo antigo, sem backend)
function ConfirmPasswordModal({ open, value, onChange, onCancel, onConfirm }) {
  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.form
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm();
        }}
      >
        <div className="bg-white p-6 rounded-xl shadow-lg w-full max-w-sm">
          <h2 className="text-lg font-semibold text-[#5A3A22] mb-3 text-center">
            Confirme sua senha
          </h2>
          <input
            type="password"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Digite sua senha atual"
            autoComplete="new-password"
            className="w-full border p-2 rounded-lg mb-4"
            autoFocus
          />
          <div className="flex justify-between">
            <button
              type="button"
              onClick={onCancel}
              className="bg-gray-300 hover:bg-gray-400 text-[#5A3A22] font-semibold px-4 py-2 rounded-lg w-[48%]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-[#95301F] hover:bg-[#B25B38] text-white font-semibold px-4 py-2 rounded-lg w-[48%]"
            >
              Confirmar
            </button>
          </div>
        </div>
      </motion.form>
    </AnimatePresence>
  );
}

export default function Profile() {
  const { user, setUser, token, activeMode, hasCaregiverProfile } = useAuth();
  const { showToast } = useToast();

  const [editing, setEditing] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [form, setForm] = useState(buildFormFromUser(null));
  const [reservations, setReservations] = useState([]);

  // ✅ Mobile-only: loading para evitar “tela estática” no iOS/Safari
  const [savingMobile, setSavingMobile] = useState(false);

  const roleLower = String(user?.role || "").toLowerCase().trim();
  const isAdminMaster = roleLower === "admin_master";
  const canEditName = isAdminMaster;

  // ✅ multi-perfil: cuidador é pelo MODO, não pelo role
  const isCaregiver = activeMode === "caregiver" && Boolean(hasCaregiverProfile);
  const modeForAvg = isCaregiver ? "caregiver" : "tutor";

  // ✅ helper: apenas mobile
  const isMobileViewport = useMemo(() => {
    try {
      return typeof window !== "undefined" && window.matchMedia?.("(max-width: 767px)")?.matches;
    } catch {
      return false;
    }
  }, []);

  // ✅ helper: Safari iOS (para fallback de repaint/feedback)
  const isIOSSafari = useMemo(() => {
    try {
      const ua = navigator.userAgent || "";
      const isIOS = /iP(hone|od|ad)/.test(ua);
      const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
      return isIOS && isSafari;
    } catch {
      return false;
    }
  }, []);

  const safeMobileToast = useCallback(
    (msg, type) => {
      // normal
      try {
        showToast(msg, type);
      } catch {
        // ignore
      }
      // fallback p/ iOS Safari (às vezes engole render imediato quando teclado está aberto)
      if (isMobileViewport && isIOSSafari) {
        setTimeout(() => {
          try {
            showToast(msg, type);
          } catch {}
        }, 80);
      }
    },
    [showToast, isMobileViewport, isIOSSafari]
  );

  const exitEditModeMobileSafe = useCallback(() => {
    // Somente MOBILE: fecha teclado + força repaint + volta pra visualização
    if (!isMobileViewport) return;

    try {
      const el = document.activeElement;
      el?.blur?.();
    } catch {
      // ignore
    }

    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      // ignore
    }

    // força atualização visual em Safari iOS
    try {
      requestAnimationFrame(() => {
        setTimeout(() => {
          setEditing(false);
        }, isIOSSafari ? 60 : 0);
      });
    } catch {
      setEditing(false);
    }
  }, [isMobileViewport, isIOSSafari]);

  // ao ter token, sempre buscar /users/me para trazer o usuário COMPLETO do backend
  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    const fetchMe = async () => {
      try {
        const data = await authRequest("/users/me", token);
        if (!cancelled && data?.user) {
          typeof setUser === "function" && setUser(data.user);
        }
      } catch (err) {
        console.error("Erro ao carregar /users/me:", err);
      }
    };

    fetchMe();
    return () => {
      cancelled = true;
    };
  }, [token, setUser]);

  // sincroniza form com user (qualquer mudança em `user`)
  useEffect(() => {
    if (user) {
      setForm(buildFormFromUser(user));
    }
  }, [user]);

  // carrega reservas para média
  useEffect(() => {
    const load = () => {
      const res = JSON.parse(localStorage.getItem("reservations")) || [];
      setReservations(res);
    };
    load();
    const onStorage = () => load();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const avgRating = useMemo(
    () => getAvgRating(modeForAvg, user, reservations),
    [modeForAvg, user, reservations]
  );

  const handleChange = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, image: reader.result || "" }));
    reader.readAsDataURL(file);
  };

  const toggleService = (key) =>
    setForm((f) => ({
      ...f,
      services: { ...f.services, [key]: !f.services[key] },
      // se desmarcar, limpa o preço também (opcional, mas ajuda)
      prices: f.services?.[key] ? { ...f.prices, [key]: "" } : { ...f.prices },
    }));

  const addCourse = () => {
    const v = (form.newCourse || "").trim();
    if (!v) return;

    const exists = (form.courses || []).some((c) => c.toLowerCase() === v.toLowerCase());
    if (exists) {
      safeMobileToast("Esse curso já foi adicionado.", "notify");
      return;
    }

    setForm((f) => ({
      ...f,
      courses: [...(f.courses || []), v],
      newCourse: "",
    }));
  };

  const removeCourse = (i) =>
    setForm((f) => ({
      ...f,
      courses: f.courses.filter((_, idx) => idx !== i),
    }));

  // CEP -> ViaCEP
  const fetchByCep = async () => {
    const cepDigits = String(form.cep || "").replace(/\D/g, "");
    if (cepDigits.length !== 8) {
      safeMobileToast("CEP inválido. Use 8 dígitos.", "error");
      return;
    }
    try {
      setCepLoading(true);
      const resp = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
      const data = await resp.json();
      if (data?.erro) {
        safeMobileToast("CEP não encontrado.", "error");
        return;
      }
      setForm((f) => ({
        ...f,
        address: data.logradouro || f.address,
        neighborhood: data.bairro || f.neighborhood,
        city: data.localidade || f.city,
      }));
      safeMobileToast("Endereço preenchido pelo CEP ✨", "success");
    } catch (e) {
      console.error(e);
      safeMobileToast("Falha ao buscar CEP.", "error");
    } finally {
      setCepLoading(false);
    }
  };

  // Clique em "Salvar Alterações"
  const handleSaveClick = () => {
    if (savingMobile) return;

    // Usuário já é do backend (tem token e user não tem senha em memória)
    // → salva direto no backend, sem modal de senha
    if (token && !user?.password) {
      setPasswordConfirm("");
      confirmSave();
      return;
    }

    // Fluxo antigo (somente localStorage) → usa modal de confirmação
    setPasswordConfirm("");
    setShowConfirmModal(true);
  };

  // Salvar perfil (backend + fallback localStorage)
  const confirmSave = async () => {
    if (!user) return;

    // ✅ Mobile-only: mostra loading e evita múltiplos cliques
    if (isMobileViewport) setSavingMobile(true);

    try {
      // Modo antigo: valida senha local se não há backend
      if (!token && user?.password) {
        if (passwordConfirm !== user.password) {
          safeMobileToast("Senha incorreta. Alterações não salvas.", "error");
          setPasswordConfirm("");
          return;
        }
      }

      // sempre ignora email (nunca muda)
      const { newPassword, newCourse, email: _ignoredEmail, ...restForm } = form;

      // Se temos backend (token) → envia PATCH /users/me
      if (token) {
        const payload = {
          phone: restForm.phone || null,
          address: restForm.address || null,
          city: restForm.city || null,
          neighborhood: restForm.neighborhood || null,
          cep: restForm.cep || null,
          bio: restForm.bio || null,
          image: restForm.image || null,
        };

        // ✅ só admin_master pode enviar name
        if (canEditName) {
          payload.name = String(restForm.name || "").trim() || null;
        }

        // ✅ multi-perfil: se o modo ativo é cuidador, envia campos de cuidador
        if (isCaregiver) {
          // 🔹 Sanitiza services: só serviços TRUE
          const cleanServices = {};
          for (const key of Object.keys(restForm.services || {})) {
            if (restForm.services[key]) cleanServices[key] = true;
          }

          // 🔹 Sanitiza prices: só valores preenchidos e numéricos
          const cleanPrices = {};
          for (const key of Object.keys(restForm.prices || {})) {
            const raw = restForm.prices[key];
            const norm = normalizeMoneyString(raw);
            if (!norm) continue;

            const n = Number(norm);
            if (Number.isFinite(n) && n >= 0) cleanPrices[key] = String(norm);
          }

          const cap = Number(restForm.daily_capacity);
          payload.daily_capacity =
            Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : DEFAULT_DAILY_CAPACITY;

          payload.services = cleanServices;
          payload.prices = cleanPrices;
          payload.courses = Array.isArray(restForm.courses) ? restForm.courses : [];
        }

        const data = await authRequest("/users/me", token, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });

        const backendUser = data?.user
          ? data.user
          : {
              ...user,
              ...restForm,
              // ✅ garante email
              email: user.email,
              // ✅ garante nome se não for admin_master
              name: canEditName ? restForm.name : user.name,
            };

        // atualiza contexto e localStorage para compatibilidade
        typeof setUser === "function" && setUser(backendUser);

        const users = JSON.parse(localStorage.getItem("users")) || [];
        const updatedList = users.some((u) => u.id === backendUser.id)
          ? users.map((u) => (u.id === backendUser.id ? backendUser : u))
          : [...users, backendUser];

        localStorage.setItem("users", JSON.stringify(updatedList));
        localStorage.setItem("currentUser", JSON.stringify(backendUser));
        window.dispatchEvent(new Event("users-updated"));

        // ✅ garante que o form reflita o que foi salvo (evita “parece que não salvou” no iOS)
        setForm(buildFormFromUser(backendUser));

        safeMobileToast("Perfil atualizado com sucesso! 🐾", "success");

        setShowPasswordChange(false);
        setShowConfirmModal(false);
        setPasswordConfirm("");

        // ✅ Mobile-only: garante sair do modo edição (principal fix do Safari)
        if (isMobileViewport) {
          exitEditModeMobileSafe();
        } else {
          setEditing(false);
        }

        return;
      }

      // --------- Fluxo antigo: somente localStorage ---------
      const updatedUser = {
        ...user,
        ...restForm,
        email: user.email, // nunca muda
        name: canEditName ? restForm.name : user.name, // ✅ só admin_master muda nome
        password: newPassword || user.password,
      };

      const users = JSON.parse(localStorage.getItem("users")) || [];
      const updatedList = users.some((u) => u.id === user.id)
        ? users.map((u) => (u.id === user.id ? updatedUser : u))
        : [...users, updatedUser];

      localStorage.setItem("users", JSON.stringify(updatedList));
      localStorage.setItem("currentUser", JSON.stringify(updatedUser));
      typeof setUser === "function" && setUser(updatedUser);
      window.dispatchEvent(new Event("users-updated"));

      setForm(buildFormFromUser(updatedUser));

      safeMobileToast("Perfil atualizado com sucesso! 🐾", "success");
      setShowPasswordChange(false);
      setShowConfirmModal(false);
      setPasswordConfirm("");

      if (isMobileViewport) {
        exitEditModeMobileSafe();
      } else {
        setEditing(false);
      }
    } catch (e) {
      console.error("Erro ao salvar perfil:", e);
      safeMobileToast("Erro ao salvar perfil.", "error");
    } finally {
      if (isMobileViewport) {
        setTimeout(() => setSavingMobile(false), isIOSSafari ? 120 : 0);
      }
    }
  };

  const cancelEdit = () => {
    if (!user) return;
    if (savingMobile) return;

    setEditing(false);
    setShowPasswordChange(false);
    setForm(buildFormFromUser(user));
  };

  if (!user) {
    return (
      <div className="bg-[#EBCBA9] min-h-[calc(100vh-120px)] flex items-center justify-center">
        <p className="text-lg font-semibold text-[#5A3A22]">
          Faça login para acessar seu perfil na{" "}
          <span className="text-[#5A3A22]">Pelo</span>
          <span className="text-yellow-400">Caramelo</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#EBCBA9] min-h-[calc(100vh-120px)] py-6">
      <div className="max-w-[1400px] mx-auto bg-white rounded-2xl shadow p-6 border-l-4 border-[#FFD700]/80">
        {/* Modal de confirmação de senha (apenas para usuários antigos sem backend) */}
        <ConfirmPasswordModal
          open={showConfirmModal}
          value={passwordConfirm}
          onChange={setPasswordConfirm}
          onCancel={() => {
            if (savingMobile) return;
            setShowConfirmModal(false);
            setPasswordConfirm("");
          }}
          onConfirm={confirmSave}
        />

        {/* VISUALIZAÇÃO */}
        {!editing ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-[#5A3A22]">
            {/* Coluna esquerda */}
            <div className="md:col-span-1 flex flex-col items-center gap-2">
              <img
                src={form.image || DEFAULT_IMG}
                alt="foto"
                className="w-28 h-28 rounded-full object-cover border-4 border-[#FFD700]"
              />
              <p className="text-lg font-semibold flex items-center gap-2">
                <span>{form.name}</span>
                {avgRating && (
                  <span className="text-sm font-normal text-[#5A3A22]">⭐ {avgRating}</span>
                )}
              </p>
              <p className="text-sm opacity-90">{form.email}</p>
              {form.bio && (
                <p className="text-sm mt-2 text-center whitespace-pre-line">{form.bio}</p>
              )}
              <button
                onClick={() => setEditing(true)}
                className="mt-3 w-full bg-[#95301F] hover:bg-[#B25B38] text-white py-2 rounded-lg font-semibold"
              >
                Editar Perfil
              </button>
            </div>

            {/* Coluna meio */}
            <div className="md:col-span-1 space-y-2">
              <h3 className="font-semibold">Localização</h3>
              {form.neighborhood && <p>Bairro: {form.neighborhood}</p>}
              {form.city && <p>Cidade: {form.city}</p>}
              <p className="text-sm opacity-75">
                (Endereço completo só é exibido após reserva confirmada.)
              </p>

              {isCaregiver && (
                <>
                  <h3 className="font-semibold mt-4">Cursos</h3>
                  {form.courses.length ? (
                    <ul className="list-disc pl-5 text-sm">
                      {form.courses.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm">Nenhum curso cadastrado.</p>
                  )}

                  <h3 className="font-semibold mt-4">Capacidade diária</h3>
                  <p className="text-sm">
                    {Number(form.daily_capacity) || DEFAULT_DAILY_CAPACITY} reserva(s) por dia
                  </p>
                </>
              )}
            </div>

            {/* Coluna direita */}
            {isCaregiver && (
              <div className="md:col-span-1">
                <h3 className="font-semibold">Serviços</h3>
                <ul className="list-disc pl-5 text-sm">
                  {Object.keys(EMPTY_SERVICES).filter((k) => form.services[k]).length ? (
                    Object.keys(EMPTY_SERVICES)
                      .filter((k) => form.services[k])
                      .map((k) => (
                        <li key={k}>
                          {SERVICE_LABELS[k] || k} —{" "}
                          {form.prices[k] !== "" && form.prices[k] != null
                            ? `R$ ${Number(normalizeMoneyString(form.prices[k]) || 0).toFixed(2)}`
                            : "sem preço"}
                        </li>
                      ))
                  ) : (
                    <li className="opacity-70">Nenhum serviço ativo.</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        ) : (
          // EDIÇÃO
          <div className="space-y-6 text-[#5A3A22]">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* FOTO */}
              <div className="flex flex-col items-center gap-3 bg-[#FFF8F0] rounded-2xl p-4 shadow-sm">
                <label htmlFor="img" className="cursor-pointer">
                  <div className="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden border-4 border-[#FFD700] shadow">
                    <img
                      src={form.image || DEFAULT_IMG}
                      alt="foto"
                      className="w-full h-full object-cover hover:opacity-90 transition"
                    />
                  </div>
                </label>
                <input id="img" type="file" accept="image/*" className="hidden" onChange={handleImage} />
                <p className="text-xs text-center text-[#5A3A22]/80">
                  Essa é a foto que aparece no seu perfil para outros usuários.
                </p>
                <label
                  htmlFor="img"
                  className="inline-flex items-center px-4 py-2 rounded-lg bg-[#5A3A22] hover:bg-[#95301F] text-white text-sm font-semibold cursor-pointer shadow-md transition"
                >
                  Alterar foto
                </label>
              </div>

              {/* CAMPOS */}
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <input
                    value={form.name}
                    onChange={(e) => canEditName && handleChange("name", e.target.value)}
                    readOnly={!canEditName}
                    className={`w-full border p-2 rounded-lg ${
                      canEditName ? "bg-white" : "bg-gray-100 text-gray-700 cursor-not-allowed"
                    }`}
                    placeholder="Nome completo"
                    aria-readonly={!canEditName ? "true" : "false"}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {canEditName
                      ? "Você é admin master: pode alterar o nome."
                      : "Apenas o admin master pode alterar o nome."}
                  </p>
                </div>

                <div>
                  <input
                    value={form.email}
                    readOnly
                    className="w-full border p-2 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
                    placeholder="E-mail"
                    aria-readonly="true"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    O e-mail de acesso não pode ser alterado aqui.
                  </p>
                </div>

                <input
                  value={form.phone}
                  onChange={(e) => handleChange("phone", e.target.value)}
                  placeholder="Telefone"
                  className="w-full border p-2 rounded-lg"
                />

                <div className="flex gap-2">
                  <input
                    value={maskCep(form.cep)}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
                      handleChange("cep", digits);
                    }}
                    onBlur={fetchByCep}
                    placeholder="CEP (00000-000)"
                    className="w-full border p-2 rounded-lg"
                    inputMode="numeric"
                  />
                  <button
                    type="button"
                    onClick={fetchByCep}
                    disabled={cepLoading || savingMobile}
                    className={`whitespace-nowrap px-3 rounded-lg font-semibold ${
                      cepLoading ? "bg-yellow-300 cursor-wait" : "bg-[#FFD700] hover:bg-yellow-400"
                    } text-[#5A3A22] ${savingMobile ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    {cepLoading ? "Buscando..." : "Buscar CEP"}
                  </button>
                </div>

                <input
                  value={form.neighborhood}
                  onChange={(e) => handleChange("neighborhood", e.target.value)}
                  placeholder="Bairro"
                  className="w-full border p-2 rounded-lg"
                />
                <input
                  value={form.city}
                  onChange={(e) => handleChange("city", e.target.value)}
                  placeholder="Cidade"
                  className="w-full border p-2 rounded-lg"
                />
                <input
                  value={form.address}
                  onChange={(e) => handleChange("address", e.target.value)}
                  placeholder="Endereço (oculto até reserva)"
                  className="md:col-span-2 w-full border p-2 rounded-lg"
                />
                <textarea
                  value={form.bio}
                  onChange={(e) => handleChange("bio", e.target.value)}
                  placeholder="Sobre mim"
                  className="md:col-span-2 w-full border p-2 rounded-lg"
                />
              </div>
            </div>

            {/* Serviços + cursos (cuidador) */}
            {isCaregiver && (
              <>
                <div className="border rounded-lg p-4 bg-[#FFF6CC]/50">
                  <h3 className="font-semibold mb-2 text-[#5A3A22]">
                    Serviços, Preços e Capacidade
                  </h3>

                  <div className="mb-4">
                    <label className="block font-semibold mb-1">
                      Quantas reservas por dia você aceita?
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.daily_capacity}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        handleChange(
                          "daily_capacity",
                          Number.isFinite(v) && v > 0 ? Math.floor(v) : DEFAULT_DAILY_CAPACITY
                        );
                      }}
                      className="w-full max-w-[280px] border p-2 rounded-lg"
                    />
                    <p className="text-xs text-[#5A3A22]/70 mt-1">
                      Isso ajuda a limitar sua agenda automaticamente.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.keys(EMPTY_SERVICES).map((key) => (
                      <div key={key} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(form.services?.[key])}
                          onChange={() => toggleService(key)}
                        />
                        <span className="capitalize">{SERVICE_LABELS[key] || key}</span>

                        {form.services?.[key] && (
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="Preço (R$)"
                            value={form.prices?.[key] ?? ""}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                prices: { ...(f.prices || {}), [key]: e.target.value },
                              }))
                            }
                            className="ml-auto border rounded p-2 w-40"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex gap-2 mb-2">
                    <input
                      value={form.newCourse}
                      onChange={(e) => handleChange("newCourse", e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCourse();
                        }
                      }}
                      placeholder="Novo curso (clique + ou Enter para adicionar)"
                      className="flex-1 border p-2 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={addCourse}
                      className="bg-[#95301F] hover:bg-[#B25B38] text-white px-3 rounded-lg"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {form.courses.map((c, i) => (
                      <span
                        key={i}
                        className="bg-[#FFF6CC] px-3 py-1 rounded-full flex items-center gap-2"
                      >
                        {c}
                        <button type="button" onClick={() => removeCourse(i)} className="text-[#95301F]">
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Troca de senha (funciona só no modo antigo/local) */}
            <div>
              {!showPasswordChange ? (
                <button
                  type="button"
                  onClick={() => setShowPasswordChange(true)}
                  className="bg-[#FFD700] hover:bg-yellow-400 text-[#5A3A22] px-3 py-1 rounded-lg font-semibold"
                >
                  Trocar Senha
                </button>
              ) : (
                <input
                  type="password"
                  value={form.newPassword}
                  onChange={(e) => handleChange("newPassword", e.target.value)}
                  placeholder={token ? "Troca de senha será feita futuramente pelo backend" : "Nova senha"}
                  autoComplete="new-password"
                  className="w-full border p-2 rounded-lg"
                />
              )}
            </div>

            {/* Botões Salvar / Cancelar */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSaveClick}
                disabled={savingMobile}
                className={`bg-[#5A3A22] hover:bg-[#7b5233] text-white px-4 py-2 rounded-lg w-full ${
                  savingMobile ? "opacity-70 cursor-not-allowed" : ""
                }`}
              >
                {savingMobile ? "Salvando..." : "Salvar Alterações"}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={savingMobile}
                className={`bg-gray-300 hover:bg-gray-400 text-[#5A3A22] px-4 py-2 rounded-lg w-full ${
                  savingMobile ? "opacity-70 cursor-not-allowed" : ""
                }`}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
