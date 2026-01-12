// backend/src/routes/petRoutes.js
const express = require("express");
const router = express.Router();

const petController = require("../controllers/petController");

// IMPORTANTE:
// O authMiddleware já é aplicado em server.js:
// app.use("/pets", authMiddleware, petRoutes);
// Então aqui não precisamos chamar router.use(authMiddleware).

/**
 * GET /pets
 * Lista todos os pets do tutor logado (req.user.id)
 */
router.get("/", petController.listMyPets);

/**
 * POST /pets
 * Cria um novo pet para o tutor logado
 */
router.post("/", petController.createPet);

/**
 * PUT /pets/:id
 * Atualiza um pet do tutor logado
 */
router.put("/:id", petController.updatePet);

/**
 * DELETE /pets/:id
 * Remove um pet do tutor logado
 */
router.delete("/:id", petController.deletePet);

module.exports = router;
