// src/components/PrivateRoute.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function PrivateRoute({ roles, children }) {
  const { user, token, loading, hasCaregiverProfile, activeMode } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="bg-[#EBCBA9] min-h-[calc(100vh-120px)] py-8 px-6 flex items-center justify-center">
        <div className="max-w-[600px] w-full bg-white rounded-2xl shadow p-6 border-l-4 border-[#FFD700]/80">
          <p className="text-[#5A3A22] font-semibold">Carregando seu acesso...</p>
        </div>
      </div>
    );
  }

  if (!user || !token) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location.pathname + location.search,
          fromState: location.state || null,
        }}
      />
    );
  }

  // ✅ role efetivo:
  // - admin/admin_master: role real
  // - usuário comum: activeMode ("tutor" | "caregiver")
  const rawRole = String(user?.role || "").toLowerCase().trim();
  const isAdminLike = rawRole === "admin" || rawRole === "admin_master";

  let effectiveRole = rawRole;
  if (!isAdminLike) {
    const m = String(activeMode || "tutor").toLowerCase() === "caregiver" ? "caregiver" : "tutor";
    effectiveRole = m === "caregiver" && !hasCaregiverProfile ? "tutor" : m;
  }

  if (Array.isArray(roles) && roles.length > 0) {
    const ok = roles.includes(effectiveRole) || roles.includes(rawRole);
    if (!ok) return <Navigate to="/" replace />;
  }

  return children;
}
