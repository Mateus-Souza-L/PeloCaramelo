// backend/src/controllers/petController.js
const Pet = require("../models/petModel");

function ensureTutor(req, res) {
  if (!req.user) {
    res.status(401).json({ error: "Não autenticado." });
    return false;
  }
  if (req.user.role !== "tutor") {
    res.status(403).json({ error: "Apenas tutores podem gerenciar pets." });
    return false;
  }
  return true;
}

// aceita: number, "7", "7 anos", "7 anos, 5 meses", "2 anos, 6 meses"
function normalizeAgeToInt(age) {
  if (age == null) return null;

  if (typeof age === "number" && Number.isFinite(age)) {
    return Math.max(0, Math.floor(age));
  }

  const s = String(age).trim();
  if (!s) return null;

  // pega o primeiro número encontrado
  const m = s.match(/(\d+)/);
  if (!m) return null;

  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

module.exports = {
  async listMyPets(req, res) {
    try {
      if (!ensureTutor(req, res)) return;

      const tutorId = req.user.id;
      const pets = await Pet.getAllByTutor(tutorId);

      res.json({ pets });
    } catch (err) {
      console.error("Erro em listMyPets:", err);
      res.status(500).json({ error: "Erro ao buscar pets." });
    }
  },

  async createPet(req, res) {
    try {
      if (!ensureTutor(req, res)) return;

      const tutorId = req.user.id;
      const { name, species, breed, size, age, temperament, notes, image } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Nome do pet é obrigatório." });
      }

      const ageInt = normalizeAgeToInt(age);

      const pet = await Pet.create(tutorId, {
        name: name.trim(),
        species,
        breed,
        size,
        age: ageInt, // ✅ sempre integer ou null
        temperament,
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
      if (!ensureTutor(req, res)) return;

      const tutorId = req.user.id;
      const petId = req.params.id;

      const { name, species, breed, size, age, temperament, notes, image } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Nome do pet é obrigatório." });
      }

      const existing = await Pet.getById(petId);
      if (!existing || String(existing.tutor_id) !== String(tutorId)) {
        return res.status(404).json({ error: "Pet não encontrado." });
      }

      const ageInt = normalizeAgeToInt(age);

      const pet = await Pet.update(petId, tutorId, {
        name: name.trim(),
        species,
        breed,
        size,
        age: ageInt, // ✅ sempre integer ou null
        temperament,
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
      if (!ensureTutor(req, res)) return;

      const tutorId = req.user.id;
      const petId = req.params.id;

      // ✅ se vier um "id local" (gigante), devolve 404 direto (pet nunca existiu no servidor)
      if (!/^\d+$/.test(String(petId)) || String(petId).length > 12) {
        return res.status(404).json({ error: "Pet não encontrado." });
      }

      const ok = await Pet.remove(petId, tutorId);
      if (!ok) {
        return res.status(404).json({ error: "Pet não encontrado." });
      }

      res.json({ success: true });
    } catch (err) {
      console.error("Erro em deletePet:", err);
      res.status(500).json({ error: "Erro ao remover pet." });
    }
  },
};
