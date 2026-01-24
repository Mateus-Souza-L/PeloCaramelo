// src/App.jsx
import { lazy, Suspense, useEffect, useMemo } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";

import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import PrivateRoute from "./components/PrivateRoute";
import Title from "./components/Title";
import ErrorBoundary from "./components/ErrorBoundary";
import { useAuth } from "./context/AuthContext";
import { useSEO } from "./hooks/useSEO";

// ✅ Analytics (GA4)
import { loadGA, trackPageView } from "./utils/analytics";

// Lazy pages (code-splitting)
const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Search = lazy(() => import("./pages/Search"));
const CaregiverDetail = lazy(() => import("./pages/CaregiverDetail"));
const ReservationDetail = lazy(() => import("./pages/ReservationDetail"));
const ComportamentoAnimal = lazy(() => import("./pages/ComportamentoAnimal"));
const Sobre = lazy(() => import("./pages/Sobre"));
const Profile = lazy(() => import("./pages/Profile"));
const ReviewHistory = lazy(() => import("./pages/ReviewHistory"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));

// ✅ Password reset pages
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

// ✅ Institucionais (Confiança & LGPD)
const PoliticaPrivacidade = lazy(() => import("./pages/PoliticaPrivacidade"));
const TermosDeUso = lazy(() => import("./pages/TermosDeUso"));
const Seguranca = lazy(() => import("./pages/Seguranca"));

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
  const location = useLocation();
  const { pathname } = location;

  const role = String(user?.role || "").toLowerCase().trim();
  const isAdminLike = role === "admin" || role === "admin_master";

  // ✅ GA4: carrega (1x) + page_view por rota
  useEffect(() => {
    loadGA();
    trackPageView(pathname);
  }, [pathname]);

  // fallback inteligente pra rotas inexistentes
  const fallbackPath = useMemo(() => {
    if (!role) return "/";
    if (isAdminLike) return "/admin/users";
    if (role === "tutor" || role === "caregiver") return "/dashboard";
    return "/";
  }, [role, isAdminLike]);

  // ✅ SEO base (meta description + robots), sem quebrar regras de hooks
  const seoData = useMemo(() => {
    const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
    const isPrivate =
      pathname === "/dashboard" ||
      pathname === "/perfil" ||
      pathname.startsWith("/reserva/") ||
      pathname === "/avaliacoes" ||
      isAdmin;

    const isAuth =
      pathname === "/login" ||
      pathname === "/register" ||
      pathname === "/forgot-password" ||
      pathname === "/reset-password";

    // default (fallback)
    let description =
      "PeloCaramelo: encontre cuidadores para cães e gatos com segurança, transparência e praticidade.";

    // páginas principais
    if (pathname === "/") {
      description =
        "Encontre cuidadores confiáveis para cães e gatos. Hospedagem, visitas e carinho para seu pet com segurança e transparência.";
    } else if (pathname === "/buscar") {
      description =
        "Busque cuidadores de pets na sua região. Compare perfis e serviços e escolha o cuidado ideal para seu animal.";
    } else if (pathname === "/comportamento") {
      description =
        "Conteúdos sobre comportamento de cães e gatos para ajudar você a entender seu pet e escolher o cuidado ideal.";
    } else if (pathname === "/sobre") {
      description =
        "Conheça o PeloCaramelo: uma plataforma para conectar tutores e cuidadores com foco em confiança e bem-estar animal.";
    } else if (pathname.startsWith("/caregiver/")) {
      description =
        "Veja detalhes do cuidador: serviços, disponibilidade e informações para escolher a melhor opção para seu pet.";
    }

    // ✅ institucionais (indexáveis)
    else if (pathname === "/privacidade") {
      description =
        "Política de Privacidade do PeloCaramelo (LGPD): dados coletados, finalidades, segurança e seus direitos.";
    } else if (pathname === "/termos") {
      description =
        "Termos de Uso do PeloCaramelo: regras da plataforma, responsabilidades e condições de utilização.";
    } else if (pathname === "/seguranca") {
      description =
        "Diretrizes de Segurança do PeloCaramelo: boas práticas para Tutores e Cuidadores terem uma experiência segura.";
    }

    // ✅ noindex para auth + áreas privadas
    const noindex = isAuth || isPrivate;

    return { description, noindex };
  }, [pathname]);

  // ✅ Hook chamado sempre no topo (correto)
  useSEO({
    description: seoData.description,
    noindex: seoData.noindex,
  });

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />

      <main className="flex-grow">
        <ScrollToTop />

        <ErrorBoundary>
          <Suspense fallback={<LoadingFallback />}>
            {/* ✅ Transição suave global (sem page por page) */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                {/* IMPORTANTE: passar location para controlar o key do AnimatePresence */}
                <Routes location={location}>
                  {/* Públicas */}
                  <Route
                    path="/"
                    element={withTitle("PeloCaramelo | Início", <Home />)}
                  />
                  <Route
                    path="/login"
                    element={withTitle("PeloCaramelo | Login", <Login />)}
                  />
                  <Route
                    path="/register"
                    element={withTitle("PeloCaramelo | Cadastro", <Register />)}
                  />

                  {/* ✅ Recuperação de senha (públicas, mas SEM indexação) */}
                  <Route
                    path="/forgot-password"
                    element={withTitle(
                      "PeloCaramelo | Recuperar Senha",
                      <ForgotPassword />
                    )}
                  />
                  <Route
                    path="/reset-password"
                    element={withTitle(
                      "PeloCaramelo | Redefinir Senha",
                      <ResetPassword />
                    )}
                  />

                  <Route
                    path="/buscar"
                    element={withTitle("PeloCaramelo | Buscar", <Search />)}
                  />
                  <Route
                    path="/caregiver/:id"
                    element={withTitle(
                      "PeloCaramelo | Detalhes do Cuidador",
                      <CaregiverDetail />
                    )}
                  />
                  <Route
                    path="/comportamento"
                    element={withTitle(
                      "PeloCaramelo | Comportamento Animal",
                      <ComportamentoAnimal />
                    )}
                  />
                  <Route
                    path="/sobre"
                    element={withTitle("PeloCaramelo | Sobre", <Sobre />)}
                  />

                  {/* ✅ Institucionais (Confiança & LGPD) */}
                  <Route
                    path="/privacidade"
                    element={withTitle(
                      "PeloCaramelo | Política de Privacidade",
                      <PoliticaPrivacidade />
                    )}
                  />
                  <Route
                    path="/termos"
                    element={withTitle(
                      "PeloCaramelo | Termos de Uso",
                      <TermosDeUso />
                    )}
                  />
                  <Route
                    path="/seguranca"
                    element={withTitle(
                      "PeloCaramelo | Diretrizes de Segurança",
                      <Seguranca />
                    )}
                  />

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

                  {/* Admin (uma única rota base + rotas das abas) */}
                  <Route
                    path="/admin"
                    element={
                      <PrivateRoute roles={["admin", "admin_master"]}>
                        {withTitle("PeloCaramelo | Admin", <AdminDashboard />)}
                      </PrivateRoute>
                    }
                  />

                  <Route
                    path="/admin/users"
                    element={
                      <PrivateRoute roles={["admin", "admin_master"]}>
                        {withTitle("PeloCaramelo | Admin", <AdminDashboard />)}
                      </PrivateRoute>
                    }
                  />

                  <Route
                    path="/admin/reservations"
                    element={
                      <PrivateRoute roles={["admin", "admin_master"]}>
                        {withTitle("PeloCaramelo | Admin", <AdminDashboard />)}
                      </PrivateRoute>
                    }
                  />

                  <Route
                    path="/admin/reviews"
                    element={
                      <PrivateRoute roles={["admin", "admin_master"]}>
                        {withTitle("PeloCaramelo | Admin", <AdminDashboard />)}
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
                        {withTitle(
                          "PeloCaramelo | Minhas Avaliações",
                          <ReviewHistory />
                        )}
                      </PrivateRoute>
                    }
                  />

                  {/* Fallback */}
                  <Route path="*" element={<Navigate to={fallbackPath} replace />} />
                </Routes>
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </ErrorBoundary>
      </main>

      <Footer />
    </div>
  );
}
