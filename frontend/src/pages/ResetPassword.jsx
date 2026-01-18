// src/pages/ResetPassword.jsx
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "../components/ToastProvider";
import { authRequest } from "../services/api";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

function useQuery() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const q = useQuery();

  const token = String(q.get("token") || "").trim();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [sending, setSending] = useState(false);

  const canSubmit = useMemo(() => {
    if (!token) return false;
    if (password.length < 6) return false;
    if (password !== confirm) return false;
    return true;
  }, [token, password, confirm]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit || sending) return;

    try {
      setSending(true);

      await authRequest(`${API_BASE_URL}/auth/reset-password`, {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });

      showToast("Senha atualizada com sucesso. Faça login.", "success");
      setPassword("");
      setConfirm("");

      // redireciona para login
      navigate("/login");
    } catch (err) {
      console.error("reset-password error:", err);
      const msg = err?.message || "";

      // Mensagem amigável
      if (String(msg).toLowerCase().includes("token")) {
        showToast("Token inválido/expirado. Solicite um novo link.", "error");
      } else {
        showToast("Erro ao redefinir senha. Tente novamente.", "error");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "#EBCBA9",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "#fff",
          borderRadius: 16,
          padding: 20,
          boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
          border: "1px solid rgba(90,58,34,0.10)",
        }}
      >
        <h1 style={{ margin: 0, color: "#5A3A22", fontSize: 22 }}>
          Redefinir senha
        </h1>
        <p style={{ marginTop: 8, marginBottom: 16, color: "#5A3A22" }}>
          Digite sua nova senha abaixo.
        </p>

        {!token ? (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              background: "rgba(255, 215, 0, 0.25)",
              border: "1px solid rgba(90,58,34,0.20)",
              color: "#5A3A22",
              fontWeight: 600,
            }}
          >
            Token não encontrado na URL. Solicite um novo link em “Esqueci minha
            senha”.
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={() => navigate("/forgot-password")}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "none",
                  cursor: "pointer",
                  background: "#5A3A22",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                Ir para “Esqueci minha senha”
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label
              style={{
                display: "block",
                fontSize: 14,
                marginBottom: 6,
                color: "#5A3A22",
              }}
            >
              Nova senha
            </label>
            <input
              type="password"
              value={password}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              style={{
                width: "100%",
                padding: "12px 12px",
                borderRadius: 12,
                border: "1px solid rgba(90,58,34,0.25)",
                outline: "none",
                fontSize: 14,
                marginBottom: 10,
              }}
            />

            <label
              style={{
                display: "block",
                fontSize: 14,
                marginBottom: 6,
                color: "#5A3A22",
              }}
            >
              Confirmar senha
            </label>
            <input
              type="password"
              value={confirm}
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repita a senha"
              style={{
                width: "100%",
                padding: "12px 12px",
                borderRadius: 12,
                border: "1px solid rgba(90,58,34,0.25)",
                outline: "none",
                fontSize: 14,
                marginBottom: 12,
              }}
            />

            <div style={{ fontSize: 13, color: "#5A3A22", marginBottom: 12 }}>
              {password && password.length < 6 ? (
                <span>• A senha deve ter pelo menos 6 caracteres.</span>
              ) : null}
              {confirm && password !== confirm ? (
                <div>• As senhas não conferem.</div>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={!canSubmit || sending}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 12,
                border: "none",
                cursor: !canSubmit || sending ? "not-allowed" : "pointer",
                background: !canSubmit || sending ? "#c9b9aa" : "#5A3A22",
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {sending ? "Salvando..." : "Salvar nova senha"}
            </button>

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => navigate("/forgot-password")}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(90,58,34,0.25)",
                  background: "#fff",
                  color: "#5A3A22",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Solicitar novo link
              </button>

              <button
                type="button"
                onClick={() => navigate("/login")}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(90,58,34,0.25)",
                  background: "#fff",
                  color: "#5A3A22",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Login
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
