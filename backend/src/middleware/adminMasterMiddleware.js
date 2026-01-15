// backend/src/middleware/adminMasterMiddleware.js
module.exports = function adminMasterMiddleware(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({
      error: "Não autenticado.",
      code: "UNAUTHENTICATED",
    });
  }

  if (req.user.role !== "admin_master") {
    return res.status(403).json({
      error: "Ação permitida apenas para o administrador principal.",
      code: "FORBIDDEN_ADMIN_MASTER_ONLY",
    });
  }

  return next();
};
