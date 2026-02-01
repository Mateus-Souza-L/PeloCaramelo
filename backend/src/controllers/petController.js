// backend/src/controllers/petController.js
const Pet = require("../models/petModel");

function ensureAuth(req, res) {
  if (!req.user) {
    res.status(401).json({ error: "Não autenticado." });
    return false;
  }
  return true;
}

// aceita: number, "7", "7 anos", "7 anos, 5 meses", "2 anos, 6 meses"
// ✅ preserva o texto (ou converte number para string)
function normalizeAgeToText(age) {
  if (age == null) return null;

  if (typeof age === "number" && Number.isFinite(age)) {
    const n = Math.max(0, Math.floor(age));
    return String(n);
  }

  const s = String(age).trim();
  if (!s) return null;

  const MAX_LEN = 60;
  return s.length > MAX_LEN ? s.slice(0, MAX_LEN) : s;
}

module.exports = {
  async listMyPets(req, res) {
    try {
      if (!ensureAuth(req, res)) return;

      const tutorId = req.user.id; // ✅ sempre pelo usuário logado
      const pets = await Pet.getAllByTutor(tutorId);

      res.json({ pets });
    } catch (err) {
      console.error("Erro em listMyPets:", err);
      res.status(500).json({ error: "Erro ao buscar pets." });
    }
  },

  async createPet(req, res) {
    try {
      if (!ensureAuth(req, res)) return;

      const tutorId = req.user.id; // ✅ sempre pelo usuário logado
      const { name, species, breed, size, age, temperament, notes, image } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Nome do pet é obrigatório." });
      }

      const ageText = normalizeAgeToText(age);

      const pet = await Pet.create(tutorId, {
        name: name.trim(),
        species,
        breed,
        size,
        age: ageText, // ✅ texto completo
        temperament: temperament || [], // ✅ vem do front
        notes,
        image,
      });

      res.status(201).json({ pet });
    } catch (err) {
      console.error("Erro em createPet:", err);
      res.status(500).json({ error: "Erro ao criar pet." });
    }
  },

  async updatePet(req, res) {
    try {
      if (!ensureAuth(req, res)) return;

      const tutorId = req.user.id;
      const petId = req.params.id;

      const { name, species, breed, size, age, temperament, notes, image } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Nome do pet é obrigatório." });
      }

      const existing = await Pet.getById(petId);
      if (!existing || String(existing.tutor_id) !== String(tutorId)) {
        // ✅ ownership check (segurança real)
        return res.status(404).json({ error: "Pet não encontrado." });
      }

      const ageText = normalizeAgeToText(age);

      const pet = await Pet.update(petId, tutorId, {
        name: name.trim(),
        species,
        breed,
        size,
        age: ageText, // ✅ texto completo
        temperament: temperament || [], // ✅ salva no DB (se a coluna existir!)
        notes,
        image,
      });

      res.json({ pet });
    } catch (err) {
      console.error("Erro em updatePet:", err);
      res.status(500).json({ error: "Erro ao atualizar pet." });
    }
  },

  async deletePet(req, res) {
    try {
      if (!ensureAuth(req, res)) return;

      const tutorId = req.user.id;
      const petId = req.params.id;

      if (!/^\d+$/.test(String(petId)) || String(petId).length > 12) {
        return res.status(404).json({ error: "Pet não encontrado." });
      }

      const ok = await Pet.remove(petId, tutorId); // ✅ ownership no model
      if (!ok) return res.status(404).json({ error: "Pet não encontrado." });

      res.json({ success: true });
    } catch (err) {
      console.error("Erro em deletePet:", err);
      res.status(500).json({ error: "Erro ao remover pet." });
    }
  },
};
