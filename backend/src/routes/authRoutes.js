// src/routes/authRoutes.js
const express = require("express");
const { register, login, me } = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Registro e login
router.post("/register", register);
router.post("/login", login);

// Retorna usuário autenticado
router.get("/me", authMiddleware, me);

module.exports = router;
