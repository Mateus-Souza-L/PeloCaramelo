// backend/src/middleware/adminMiddleware.js
module.exports = function adminMiddleware(req, res, next) {
  const role = String(req.user?.role || "").toLowerCase().trim();

  if (!role) {
    return res.status(401).json({
      error: "Não autenticado. Faça login novamente.",
      code: "UNAUTHENTICATED",
    });
  }

  // aceita admin e admin_master
  if (role !== "admin" && role !== "admin_master") {
    return res.status(403).json({
      error: "Acesso restrito ao administrador.",
      code: "FORBIDDEN_ADMIN_ONLY",
    });
  }

  return next();
};
