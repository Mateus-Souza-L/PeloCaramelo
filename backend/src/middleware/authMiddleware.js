// backend/src/middleware/authMiddleware.js
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn("⚠️ JWT_SECRET não definido no ambiente!");
}

/**
 * Middleware de autenticação via JWT.
 * Espera: Authorization: Bearer <token>
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  // Header obrigatório
  if (!authHeader) {
    return res.status(401).json({
      error: "Token não fornecido. Faça login novamente.",
      code: "NO_TOKEN",
    });
  }

  // Formato esperado: "Bearer token"
  const [scheme, token] = authHeader.split(" ");

  if (!/^Bearer$/i.test(scheme) || !token) {
    return res.status(401).json({
      error: "Formato do token inválido. Faça login novamente.",
      code: "INVALID_TOKEN_FORMAT",
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Segurança: token precisa conter id e role
    if (!decoded?.id || !decoded?.role) {
      return res.status(401).json({
        error: "Token inválido. Faça login novamente.",
        code: "MALFORMED_TOKEN",
      });
    }

    // 🔐 Usuário autenticado (normalizado)
    req.user = {
      id: String(decoded.id),
      role: String(decoded.role),
    };

    return next();
  } catch (err) {
    const isExpired = err?.name === "TokenExpiredError";

    console.error(
      "❌ Erro ao validar token JWT:",
      isExpired ? "TOKEN_EXPIRED" : err.message
    );

    return res.status(401).json({
      error: "Token inválido ou expirado. Faça login novamente.",
      code: isExpired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
    });
  }
}

module.exports = authMiddleware;
