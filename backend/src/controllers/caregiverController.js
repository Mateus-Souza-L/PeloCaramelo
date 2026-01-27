// backend/src/controllers/caregiverController.js
const {
  listAllCaregivers,
  getCaregiverById,
} = require("../models/caregiverModel");

/**
 * GET /caregivers
 * Lista todos os cuidadores (definidos por caregiver_profiles) com dados seguros.
 */
async function listCaregiversController(req, res) {
  try {
    const caregivers = await listAllCaregivers();

    // segurança: remove qualquer campo sensível caso algum dia entre no SELECT
    const safe = (caregivers || []).map(
      ({ password, password_hash, token, reset_token, ...clean }) => clean
    );

    return res.json({ caregivers: safe });
  } catch (err) {
    console.error("Erro em GET /caregivers:", err);
    return res.status(500).json({ error: "Erro ao buscar cuidadores." });
  }
}

/**
 * GET /caregivers/:id
 * Detalhe de UM cuidador (definido por caregiver_profiles) com dados seguros.
 */
async function getCaregiverByIdController(req, res) {
  try {
    const { id } = req.params;

    const caregiverId = Number(id);
    if (!Number.isFinite(caregiverId)) {
      return res.status(400).json({ error: "ID inválido." });
    }

    const caregiver = await getCaregiverById(caregiverId);

    if (!caregiver) {
      return res.status(404).json({ error: "Cuidador não encontrado." });
    }

    const { password, password_hash, token, reset_token, ...safe } = caregiver;
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
