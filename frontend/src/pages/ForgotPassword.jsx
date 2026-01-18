// src/pages/ForgotPassword.jsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/ToastProvider";
import { authRequest } from "../services/api";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const isValid = useMemo(() => {
    const v = String(email || "").trim().toLowerCase();
    return v.includes("@") && v.includes(".");
  }, [email]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isValid || sending) return;

    try {
      setSending(true);

      await authRequest(`${API_BASE_URL}/auth/forgot-password`, {
        method: "POST",
        body: JSON.stringify({ email: String(email).trim().toLowerCase() }),
      });

      showToast(
        "Se o e-mail existir, enviaremos um link de recuperação.",
        "success"
      );

      setEmail("");
    } catch (err) {
      console.error("forgot-password error:", err);
      showToast("Erro ao solicitar recuperação. Tente novamente.", "error");
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
          maxWidth: 420,
          background: "#fff",
          borderRadius: 16,
          padding: 20,
          boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
          border: "1px solid rgba(90,58,34,0.10)",
        }}
      >
        <h1 style={{ margin: 0, color: "#5A3A22", fontSize: 22 }}>
          Esqueci minha senha
        </h1>
        <p style={{ marginTop: 8, marginBottom: 16, color: "#5A3A22" }}>
          Informe seu e-mail e enviaremos um link para redefinir sua senha.
        </p>

        <form onSubmit={handleSubmit}>
          <label
            style={{
              display: "block",
              fontSize: 14,
              marginBottom: 6,
              color: "#5A3A22",
            }}
          >
            E-mail
          </label>
          <input
            type="email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seuemail@exemplo.com"
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

          <button
            type="submit"
            disabled={!isValid || sending}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              border: "none",
              cursor: !isValid || sending ? "not-allowed" : "pointer",
              background: !isValid || sending ? "#c9b9aa" : "#5A3A22",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {sending ? "Enviando..." : "Enviar link"}
          </button>

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
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
              Voltar ao login
            </button>

            <button
              type="button"
              onClick={() => navigate("/")}
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
              Início
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
