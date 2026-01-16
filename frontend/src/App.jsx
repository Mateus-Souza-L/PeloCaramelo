// src/App.jsx
import { lazy, Suspense, useEffect, useMemo } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";

import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import PrivateRoute from "./components/PrivateRoute";
import Title from "./components/Title";
import ErrorBoundary from "./components/ErrorBoundary";
import { useAuth } from "./context/AuthContext";

// Lazy pages (code-splitting)
const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const Search = lazy(() => import("./pages/Search"));
const CaregiverDetail = lazy(() => import("./pages/CaregiverDetail"));
const ReservationDetail = lazy(() => import("./pages/ReservationDetail"));
const ComportamentoAnimal = lazy(() => import("./pages/ComportamentoAnimal"));
const Sobre = lazy(() => import("./pages/Sobre"));
const Profile = lazy(() => import("./pages/Profile"));
const ReviewHistory = lazy(() => import("./pages/ReviewHistory"));

// Helper de título
const withTitle = (t, children) => <Title title={t}>{children}</Title>;

// Reseta scroll a cada navegação
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

// Fallback visual durante carregamento (Suspense)
function LoadingFallback() {
  return (
    <div className="bg-[#EBCBA9] min-h-[calc(100vh-120px)] py-8 px-6">
      <div className="max-w-[1400px] mx-auto bg-white rounded-2xl shadow p-6 border-l-4 border-[#FFD700]/80">
        <p className="text-[#5A3A22] font-semibold">Carregando…</p>
      </div>
    </div>
  );
}

export default function App() {
  const { user } = useAuth();

  const role = String(user?.role || "").toLowerCase().trim();
  const isAdminLike = role === "admin" || role === "admin_master";

  // fallback inteligente pra rotas inexistentes
  const fallbackPath = useMemo(() => {
    if (!role) return "/";
    if (isAdminLike) return "/admin/users";
    if (role === "tutor" || role === "caregiver") return "/dashboard";
    return "/";
  }, [role, isAdminLike]);

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-grow">
        <ScrollToTop />
        <ErrorBoundary>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              {/* Públicas */}
              <Route path="/" element={withTitle("PeloCaramelo | Início", <Home />)} />
              <Route path="/login" element={withTitle("PeloCaramelo | Login", <Login />)} />
              <Route
                path="/register"
                element={withTitle("PeloCaramelo | Cadastro", <Register />)}
              />
              <Route path="/buscar" element={withTitle("PeloCaramelo | Buscar", <Search />)} />
              <Route
                path="/caregiver/:id"
                element={withTitle("PeloCaramelo | Detalhes do Cuidador", <CaregiverDetail />)}
              />
              <Route
                path="/comportamento"
                element={withTitle("PeloCaramelo | Comportamento Animal", <ComportamentoAnimal />)}
              />
              <Route path="/sobre" element={withTitle("PeloCaramelo | Sobre", <Sobre />)} />

              {/* Protegidas */}

              {/* Dashboard tutor/cuidador (admin/admin_master não usa) */}
              <Route
                path="/dashboard"
                element={
                  isAdminLike ? (
                    <Navigate to="/admin/users" replace />
                  ) : (
                    <PrivateRoute roles={["tutor", "caregiver"]}>
                      {withTitle("PeloCaramelo | Painel", <Dashboard />)}
                    </PrivateRoute>
                  )
                }
              />

              {/* /admin vira atalho para a área que já está OK */}
              <Route
                path="/admin"
                element={
                  <PrivateRoute roles={["admin", "admin_master"]}>
                    <Navigate to="/admin/users" replace />
                  </PrivateRoute>
                }
              />

              <Route
                path="/admin/users"
                element={
                  <PrivateRoute roles={["admin", "admin_master"]}>
                    {withTitle("PeloCaramelo | Admin — Usuários", <AdminUsers />)}
                  </PrivateRoute>
                }
              />

              <Route
                path="/perfil"
                element={
                  <PrivateRoute roles={["tutor", "caregiver", "admin", "admin_master"]}>
                    {withTitle("PeloCaramelo | Meu Perfil", <Profile />)}
                  </PrivateRoute>
                }
              />

              <Route
                path="/reserva/:id"
                element={
                  <PrivateRoute roles={["tutor", "caregiver", "admin", "admin_master"]}>
                    {withTitle("PeloCaramelo | Reserva", <ReservationDetail />)}
                  </PrivateRoute>
                }
              />

              <Route
                path="/avaliacoes"
                element={
                  <PrivateRoute roles={["tutor", "caregiver"]}>
                    {withTitle("PeloCaramelo | Minhas Avaliações", <ReviewHistory />)}
                  </PrivateRoute>
                }
              />

              {/* Fallback */}
              <Route path="*" element={<Navigate to={fallbackPath} replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}
