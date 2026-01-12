// backend/src/controllers/caregiverController.js
const {
  listAllCaregivers,
  getCaregiverById,
} = require("../models/caregiverModel");

/**
 * GET /caregivers
 */
async function listCaregiversController(req, res) {
  try {
    const caregivers = await listAllCaregivers();

    // remove qualquer campo sensível se um dia entrar no SELECT
    const safe = caregivers.map(({ password, password_hash, ...clean }) => clean);

    return res.json({ caregivers: safe });
  } catch (err) {
    console.error("Erro em GET /caregivers:", err);
    return res.status(500).json({ error: "Erro ao buscar cuidadores." });
  }
}

/**
 * GET /caregivers/:id
 */
async function getCaregiverByIdController(req, res) {
  try {
    const { id } = req.params;
    const caregiver = await getCaregiverById(id);

    if (!caregiver) {
      return res.status(404).json({ error: "Cuidador não encontrado." });
    }

    const { password, password_hash, ...safe } = caregiver;
    return res.json({ caregiver: safe });
  } catch (err) {
    console.error("Erro em GET /caregivers/:id:", err);
    return res.status(500).json({ error: "Erro ao buscar cuidador." });
  }
}

module.exports = {
  listCaregiversController,
  getCaregiverByIdController,
};
