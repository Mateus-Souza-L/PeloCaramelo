// backend/src/routes/petRoutes.js
const express = require("express");
const router = express.Router();

const petController = require("../controllers/petController");
const { uploadPetPhoto } = require("../middleware/uploadPetPhoto");
const { uploadPetPhotoController } = require("../controllers/petPhotoController");

/**
 * GET /pets
 */
router.get("/", petController.listMyPets);

/**
 * POST /pets
 */
router.post("/", petController.createPet);

/**
 * PUT /pets/:id
 */
router.put("/:id", petController.updatePet);

/**
 * POST /pets/:id/photo
 */
router.post(
  "/:id/photo",
  uploadPetPhoto.single("photo"),
  uploadPetPhotoController
);

/**
 * DELETE /pets/:id
 */
router.delete("/:id", petController.deletePet);

module.exports = router;
