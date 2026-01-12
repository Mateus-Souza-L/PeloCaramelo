// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { meRequest } from "../services/api";

const AuthContext = createContext();
const STORAGE_KEY = "pelocaramelo_auth";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Carregar sessão salva no localStorage ao iniciar o app
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      setLoading(false);
      return;
    }

    try {
      const parsed = JSON.parse(saved);
      const savedToken = parsed?.token || null;
      const savedUser = parsed?.user || null;

      if (!savedToken) {
        setLoading(false);
        return;
      }

      // ✅ hidrata imediatamente (evita “piscar” e redirecionar indevidamente)
      setToken(savedToken);
      if (savedUser) setUser(savedUser);

      // Sempre busca o usuário atual no backend (fonte de verdade)
      meRequest(savedToken)
        .then((res) => {
          if (res?.user) {
            setUser(res.user);
            localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({ user: res.user, token: savedToken })
            );
            return;
          }

          // se não veio user, trata como sessão inválida
          setUser(null);
          setToken(null);
          localStorage.removeItem(STORAGE_KEY);
        })
        .catch((err) => {
          console.error("Erro ao carregar sessão /auth/me:", err);

          // ✅ só “desloga” se for token inválido/sem permissão
          const status = err?.status;
          if (status === 401 || status === 403) {
            setUser(null);
            setToken(null);
            localStorage.removeItem(STORAGE_KEY);
            return;
          }

          // ✅ erro temporário (500, rede, backend reiniciando):
          // mantém sessão local e NÃO redireciona o usuário à força
          // (o app continua usando savedUser/savedToken)
        })
        .finally(() => setLoading(false));
    } catch (err) {
      console.error("Erro ao ler sessão do localStorage:", err);
      setUser(null);
      setToken(null);
      localStorage.removeItem(STORAGE_KEY);
      setLoading(false);
    }
  }, []);

  // Login: recebe user básico do /auth/login, mas já consulta /auth/me
  async function handleLogin(loginUser, newToken) {
    try {
      setToken(newToken);
      setLoading(true);

      const res = await meRequest(newToken);
      const fullUser = res?.user || loginUser;

      setUser(fullUser);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ user: fullUser, token: newToken })
      );
    } catch (err) {
      console.error("Erro ao buscar /auth/me após login:", err);

      // ✅ mantém sessão (útil em instabilidade momentânea)
      setUser(loginUser);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ user: loginUser, token: newToken })
      );
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    setUser(null);
    setToken(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  const value = {
    user,
    setUser,
    token,
    loading,
    login: handleLogin,
    logout: handleLogout,
    isAuthenticated: !!user && !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
