// backend/src/middleware/rateLimiters.js
const rateLimit = require("express-rate-limit");

function minutes(n) {
  return n * 60 * 1000;
}

// Handler padrão (não expõe detalhes)
function handler(message) {
  return (req, res) => {
    return res.status(429).json({
      error: message || "Muitas tentativas. Aguarde um pouco e tente novamente.",
      code: "RATE_LIMITED",
    });
  };
}

// Login: mais permissivo, mas protege brute force
const loginLimiter = rateLimit({
  windowMs: minutes(10),
  max: 20, // 20 tentativas por IP a cada 10 min
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler("Muitas tentativas de login. Aguarde alguns minutos e tente novamente."),
});

// Forgot-password: bem mais restrito (evita spam/enumeração)
const forgotPasswordLimiter = rateLimit({
  windowMs: minutes(15),
  max: 5, // 5 por IP a cada 15 min
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler("Muitas solicitações de recuperação. Aguarde e tente novamente."),
});

// Reset-password: restrito (protege tentativa de token)
const resetPasswordLimiter = rateLimit({
  windowMs: minutes(15),
  max: 10, // 10 por IP a cada 15 min
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler("Muitas tentativas. Aguarde e tente novamente."),
});

module.exports = {
  loginLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
};
