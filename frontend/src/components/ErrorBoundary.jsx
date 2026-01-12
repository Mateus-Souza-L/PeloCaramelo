import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("🔴 Erro capturado pelo ErrorBoundary:", error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#EBCBA9] text-[#5A3A22] text-center px-6">
          <h2 className="text-2xl font-bold mb-3">Algo deu errado 😔</h2>
          <p className="text-sm opacity-80 mb-4 max-w-md">
            Ocorreu um erro inesperado. Você pode recarregar a página ou voltar para a tela inicial.
          </p>
          <div className="flex gap-3">
            <button
              onClick={this.handleReload}
              className="bg-[#5A3A22] hover:bg-[#95301F] text-white px-4 py-2 rounded-lg font-semibold"
            >
              Recarregar página
            </button>
            <button
              onClick={() => (window.location.href = "/")}
              className="bg-[#95301F] hover:bg-[#5A3A22] text-white px-4 py-2 rounded-lg font-semibold"
            >
              Ir para Início
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
