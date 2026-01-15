// backend/src/middleware/adminMiddleware.js
module.exports = function adminMiddleware(req, res, next) {
  const role = String(req.user?.role || "").toLowerCase().trim();

  if (!role) {
    return res.status(401).json({
      error: "Não autenticado. Faça login novamente.",
      code: "UNAUTHENTICATED",
    });
  }

  if (role !== "admin") {
    return res.status(403).json({
      error: "Acesso restrito ao administrador.",
      code: "FORBIDDEN_ADMIN_ONLY",
    });
  }

  return next();
};
