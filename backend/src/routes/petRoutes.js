const express = require("express");
const router = express.Router();

const petController = require("../controllers/petController");
const { uploadPetPhoto } = require("../middleware/uploadPetPhoto");
const { uploadPetPhotoController } = require("../controllers/petPhotoController");
const { getPetHistory } = require("../controllers/petHistoryController");

/**
 * GET /pets
 * Lista todos os pets do tutor logado
 */
router.get("/", petController.listMyPets);

/**
 * POST /pets
 * Cria um novo pet
 */
router.post("/", petController.createPet);

/**
 * PUT /pets/:id
 * Atualiza um pet
 */
router.put("/:id", petController.updatePet);

/**
 * POST /pets/:id/photo
 * Upload da foto do pet
 */
router.post(
  "/:id/photo",
  uploadPetPhoto.single("photo"),
  uploadPetPhotoController
);

/**
 * GET /pets/:id/history
 * Histórico de reservas do pet
 */
router.get("/:id/history", getPetHistory);

/**
 * DELETE /pets/:id
 * Remove um pet
 */
router.delete("/:id", petController.deletePet);

module.exports = router;
