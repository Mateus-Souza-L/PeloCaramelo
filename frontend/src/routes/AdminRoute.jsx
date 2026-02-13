import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AdminRoute({ children }) {
  const { user, token, loading } = useAuth();

  if (loading) return null; // ou um spinner seu
  if (!token || !user) return <Navigate to="/login" replace />;

  const role = String(user.role || "").toLowerCase();
  const isAdmin = role === "admin" || role === "admin_master";

  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return children;
}
