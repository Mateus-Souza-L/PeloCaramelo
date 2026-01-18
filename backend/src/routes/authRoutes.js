// backend/src/routes/authRoutes.js
const express = require("express");
const {
  register,
  login,
  me,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

// ✅ Rate limiters
const {
  loginLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
} = require("../middleware/rateLimiters");

const router = express.Router();

/* ============================================================
   Registro e login
   ============================================================ */

// registro normalmente não precisa limiter (já é protegido por validações)
router.post("/register", register);

// 🔒 login protegido contra brute force
router.post("/login", loginLimiter, login);

/* ============================================================
   Recuperação de senha
   ============================================================ */

// 🔒 evita spam / enumeração de e-mails
router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);

// 🔒 protege tentativa de uso de token
router.post("/reset-password", resetPasswordLimiter, resetPassword);

/* ============================================================
   Usuário autenticado
   ============================================================ */

router.get("/me", authMiddleware, me);

module.exports = router;
