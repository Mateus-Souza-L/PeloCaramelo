// src/components/TutorPets.jsx
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { useToast } from "./ToastProvider";
import { authRequest } from "../services/api";

const DEFAULT_PET_IMG = "/paw.png";

const ADJECTIVE_OPTIONS = [
  "Dengoso(a)",
  "Carente",
  "Brincalhão(ã)",
  "Calmo(a)",
  "Medroso(a)",
  "Grudinho(a)",
  "Independente",
  "Fofinho(a)",
  "Sociável",
  "Dorminhoco(a)",
  "Curioso(a)",
  "Protetor(a)",
];

// Normaliza PET vindo da API (backend) para o formato usado no front
function normalizePetFromApi(p) {
  if (!p) return null;

  let adjectives = [];
  if (Array.isArray(p.temperament)) {
    adjectives = p.temperament;
  } else if (typeof p.temperament === "string" && p.temperament.trim()) {
    adjectives = p.temperament
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return {
    id: p.id,
    name: p.name || "",
    approxAge: p.age || "",
    size: p.size || "",
    specie: p.species || "",
    breed: p.breed || "",
    adjectives,
    image: p.image || "",
  };
}

export default function TutorPets() {
  const { user, token } = useAuth();
  const { showToast } = useToast();

  const [pets, setPets] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    approxAge: "",
    size: "",
    specie: "",
    breed: "",
    adjectives: [],
    image: "",
  });

  // --- helpers de storage ---
  const getStorageKey = () => (user?.id ? `pets_${user.id}` : null);

  const persistPets = (nextPets) => {
    const key = getStorageKey();
    if (!key) return;

    try {
      localStorage.setItem(key, JSON.stringify(nextPets));
    } catch (err) {
      console.error("Erro ao salvar pets:", err);

      if (err.name === "QuotaExceededError") {
        try {
          const petsSemImagem = nextPets.map((p) => ({ ...p, image: "" }));
          localStorage.setItem(key, JSON.stringify(petsSemImagem));
          showToast(
            "Espaço de armazenamento do navegador cheio. Salvamos os pets, mas sem as fotos. Tente usar imagens menores ou limpar os dados do site.",
            "error"
          );
        } catch (err2) {
          console.error("Erro ao salvar pets sem imagens:", err2);
          showToast(
            "O armazenamento do navegador está cheio. Limpe os dados do site para continuar salvando.",
            "error"
          );
        }
      } else {
        showToast("Não foi possível salvar os pets no navegador.", "error");
      }
    }
  };

  const loadPetsFromLocal = () => {
    const key = getStorageKey();
    if (!key) {
      setPets([]);
      return;
    }

    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        setPets([]);
        return;
      }
      const parsed = JSON.parse(raw);
      setPets(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      console.error("Erro ao carregar pets do localStorage:", e);
      setPets([]);
    }
  };

  const loadPets = async () => {
    if (!user) {
      setPets([]);
      return;
    }

    if (!token) {
      loadPetsFromLocal();
      return;
    }

    try {
      const data = await authRequest("/pets", token); // GET /pets
      const apiPets = Array.isArray(data?.pets) ? data.pets : [];
      const normalized = apiPets.map(normalizePetFromApi).filter(Boolean);

      setPets(normalized);
      persistPets(normalized);
    } catch (err) {
      console.error("Erro ao carregar pets do servidor, usando local:", err);
      showToast(
        "Não foi possível carregar os pets do servidor. Usando os dados salvos no navegador.",
        "error"
      );
      loadPetsFromLocal();
    }
  };

  useEffect(() => {
    loadPets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, token]);

  const resetForm = () => {
    setEditingId(null);
    setForm({
      name: "",
      approxAge: "",
      size: "",
      specie: "",
      breed: "",
      adjectives: [],
      image: "",
    });
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleAdjective = (adj) => {
    setForm((prev) => {
      const exists = prev.adjectives.includes(adj);
      return {
        ...prev,
        adjectives: exists
          ? prev.adjectives.filter((a) => a !== adj)
          : [...prev.adjectives, adj],
      };
    });
  };

  const handleImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({ ...prev, image: reader.result || "" }));
    };
    reader.readAsDataURL(file);
  };

  const handleEdit = (pet) => {
    setEditingId(pet.id);
    setForm({
      name: pet.name || "",
      approxAge: pet.approxAge || "",
      size: pet.size || "",
      specie: pet.specie || "",
      breed: pet.breed || "",
      adjectives: pet.adjectives || [],
      image: pet.image || "",
    });
  };

  const handleDelete = async (id) => {
    const key = getStorageKey();
    if (!key) {
      showToast("Erro ao remover pet: usuário não identificado.", "error");
      return;
    }

    const next = pets.filter((p) => p.id !== id);
    setPets(next);
    persistPets(next);

    if (token) {
      try {
        await authRequest(`/pets/${id}`, token, {
          method: "DELETE",
        });
      } catch (err) {
        console.error("Erro ao deletar pet no servidor:", err);
        showToast(
          "Pet removido localmente, mas houve erro ao remover no servidor.",
          "error"
        );
      }
    }

    if (editingId === id) resetForm();
    showToast("Pet removido do perfil.", "notify");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const key = getStorageKey();
    if (!key) {
      showToast("Erro ao salvar pet: usuário não identificado.", "error");
      return;
    }

    const name = form.name.trim();
    if (!name) {
      showToast("Dê um nome para o seu pet 😊", "error");
      return;
    }

    // Objeto no FORMATO ESPERADO PELO BACKEND
    const basePet = {
      name,
      species: form.specie.trim() || null,
      breed: form.breed.trim() || null,
      size: form.size || null,
      age: form.approxAge.trim() || null,
      temperament: form.adjectives,
      notes: null,
      image: form.image || "",
    };

    let newPet;
    let next;

    if (token) {
      try {
        if (editingId) {
          const data = await authRequest(`/pets/${editingId}`, token, {
            method: "PUT",
            body: JSON.stringify(basePet),
          });

          const petFromApi = normalizePetFromApi(data?.pet || data);
          newPet = petFromApi || { id: editingId, ...form };
          next = pets.map((p) => (p.id === editingId ? newPet : p));
          showToast("Informações do pet atualizadas! 🐾", "success");
        } else {
          const data = await authRequest("/pets", token, {
            method: "POST",
            body: JSON.stringify(basePet),
          });

          const petFromApi = normalizePetFromApi(data?.pet || data);
          newPet =
            petFromApi ||
            {
              id: Date.now(),
              ...form,
              name,
            };
          next = [...pets, newPet];
          showToast("Pet adicionado ao seu perfil! 💛", "success");
        }
      } catch (err) {
        console.error("Erro ao salvar pet no servidor:", err);
        showToast(
          "Não foi possível salvar o pet no servidor. Salvando apenas no navegador.",
          "error"
        );

        if (editingId) {
          newPet = { id: editingId, ...form, name };
          next = pets.map((p) => (p.id === editingId ? newPet : p));
        } else {
          newPet = { id: Date.now(), ...form, name };
          next = [...pets, newPet];
        }
      }
    } else {
      if (editingId) {
        newPet = { id: editingId, ...form, name };
        next = pets.map((p) => (p.id === editingId ? newPet : p));
        showToast(
          "Informações do pet atualizadas (apenas local). 🐾",
          "success"
        );
      } else {
        newPet = { id: Date.now(), ...form, name };
        next = [...pets, newPet];
        showToast("Pet adicionado (apenas local). 💛", "success");
      }
    }

    setPets(next);
    persistPets(next);
    resetForm();
  };

  if (!user) return null;

  return (
    <div className="text-[#5A3A22]">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Formulário do pet - ESQUERDA no desktop */}
        <div className="md:w-1/2 md:order-1 order-1">
          <h2 className="text-lg font-semibold mb-3">
            {editingId ? "Editar pet" : "Adicionar novo pet"}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Foto do pet */}
            <div className="flex items-center gap-4 mb-2">
              <label
                htmlFor="petImage"
                className="cursor-pointer flex flex-col items-center"
              >
                <img
                  src={form.image || DEFAULT_PET_IMG}
                  alt="Foto do pet"
                  className="w-24 h-24 rounded-full object-cover border-4 border-[#FFD700] hover:opacity-80 transition"
                />
                <span className="mt-1 text-xs text-[#5A3A22]">
                  Clique para alterar a foto
                </span>
                <span className="mt-0.5 text-[11px] text-[#5A3A22] opacity-80 text-center">
                  Formatos aceitos: JPG, PNG ou WebP.
                </span>
              </label>
              <input
                id="petImage"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImage}
              />
            </div>

            <input
              value={form.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="Nome do pet"
              className="w-full border p-2 rounded-lg text-sm"
            />

            <input
              value={form.approxAge}
              onChange={(e) => handleChange("approxAge", e.target.value)}
              placeholder="Idade aproximada (ex: 2 anos, 6 meses)"
              className="w-full border p-2 rounded-lg text-sm"
            />

            <select
              value={form.size}
              onChange={(e) => handleChange("size", e.target.value)}
              className="w-full border p-2 rounded-lg text-sm"
            >
              <option value="">Porte do pet (aprox. pelo peso)</option>
              <option value="pequeno">Pequeno — até 10kg</option>
              <option value="medio">Médio — 10kg a 25kg</option>
              <option value="grande">Grande — 25kg a 40kg</option>
              <option value="gigante">Gigante — acima de 40kg</option>
            </select>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                value={form.specie}
                onChange={(e) => handleChange("specie", e.target.value)}
                placeholder="Espécie (cachorro, gato, coelho...)"
                className="w-full border p-2 rounded-lg text-sm"
              />
              <input
                value={form.breed}
                onChange={(e) => handleChange("breed", e.target.value)}
                placeholder="Raça (se souber)"
                className="w-full border p-2 rounded-lg text-sm"
              />
            </div>

            <p className="text-[12px] md:text-sm text-[#5A3A22] opacity-90 leading-relaxed mt-1">
              Na{" "}
              <span className="font-bold text-[#5A3A22]">Pelo</span>
              <span className="font-bold text-yellow-400">Caramelo</span> não
              nos importamos com raça, mas sim com amor e cuidado!
              <br />
              Mas temos uma quedinha especial pelos vira-latas 😅
            </p>

            {/* Adjetivos */}
            <div>
              <p className="text-sm font-semibold mb-1">
                Como você descreveria a personalidade dele(a)?
              </p>
              <div className="flex flex-wrap gap-2">
                {ADJECTIVE_OPTIONS.map((adj) => {
                  const active = form.adjectives.includes(adj);
                  return (
                    <button
                      key={adj}
                      type="button"
                      onClick={() => toggleAdjective(adj)}
                      className={`px-3 py-1 rounded-full text-xs border transition ${
                        active
                          ? "bg-[#5A3A22] text-white border-[#5A3A22]"
                          : "bg-white text-[#5A3A22] border-[#D2A679] hover:bg-[#FFF3D0]"
                      }`}
                    >
                      {adj}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                className="bg-[#5A3A22] hover:bg-[#7b5233] text-white px-4 py-2 rounded-lg w-full font-semibold text-sm shadow"
              >
                {editingId ? "Salvar alterações do pet" : "Adicionar pet"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="bg-gray-300 hover:bg-gray-400 text-[#5A3A22] px-4 py-2 rounded-lg w-full font-semibold text-sm"
                >
                  Cancelar edição
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Lista de pets - DIREITA no desktop */}
        <div className="md:w-1/2 md:order-2 order-2 space-y-3">
          <h2 className="text-lg font-semibold mb-1">Meus Pets</h2>
          <p className="text-xs mb-3 opacity-80">
            Clique em um pet para editar as informações.
          </p>

          {pets.length ? (
            pets.map((pet) => {
              const isEditing = editingId === pet.id;
              return (
                <motion.div
                  key={pet.id}
                  whileHover={{ scale: 1.01 }}
                  className={`flex gap-3 items-center border rounded-xl p-3 shadow-sm bg-[#FFF8F0] transition ${
                    isEditing
                      ? "border-[#5A3A22] bg-[#FFF3D0]"
                      : "border-transparent"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleEdit(pet)}
                    className="flex items-center gap-3 flex-1 text-left"
                  >
                    <img
                      src={pet.image || DEFAULT_PET_IMG}
                      alt={pet.name}
                      className="w-16 h-16 rounded-full object-cover border-2 border-[#FFD700]"
                    />
                    <div>
                      <p className="font-semibold text-sm md:text-base">
                        {pet.name}
                      </p>
                      <p className="text-xs md:text-sm opacity-80">
                        {pet.specie || "Espécie não informada"}{" "}
                        {pet.breed ? `• ${pet.breed}` : ""}
                      </p>
                      {pet.approxAge && (
                        <p className="text-xs opacity-70">
                          Idade aproximada: {pet.approxAge}
                        </p>
                      )}
                      {!!pet.adjectives?.length && (
                        <p className="text-[11px] mt-1 opacity-80">
                          {pet.adjectives.join(" • ")}
                        </p>
                      )}
                      {isEditing && (
                        <p className="text-[11px] mt-1 text-[#5A3A22] font-semibold">
                          Editando este pet
                        </p>
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(pet.id)}
                    className="text-xs px-2 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold"
                  >
                    Remover
                  </button>
                </motion.div>
              );
            })
          ) : (
            <p className="text-sm opacity-80">
              Você ainda não cadastrou nenhum pet. Comece adicionando um ao lado
              esquerdo 😉
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
