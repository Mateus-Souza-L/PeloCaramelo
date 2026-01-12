// src/components/PrivateRoute.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function PrivateRoute({ roles, children }) {
  const { user, token, loading } = useAuth();
  const location = useLocation();

  // Enquanto valida sessão, NÃO redireciona
  if (loading) {
    return (
      <div className="bg-[#EBCBA9] min-h-[calc(100vh-120px)] py-8 px-6 flex items-center justify-center">
        <div className="max-w-[600px] w-full bg-white rounded-2xl shadow p-6 border-l-4 border-[#FFD700]/80">
          <p className="text-[#5A3A22] font-semibold">Carregando seu acesso...</p>
        </div>
      </div>
    );
  }

  // Sem sessão -> login, mas preserva destino completo
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

  // Role inválida -> home
  if (Array.isArray(roles) && roles.length > 0) {
    const hasRole = roles.includes(user.role);
    if (!hasRole) return <Navigate to="/" replace />;
  }

  return children;
}
