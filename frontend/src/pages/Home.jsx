import { useEffect } from "react";
import { Link } from "react-router-dom";

export default function Home() {
  useEffect(() => {
    document.title = "PeloCaramelo | Início";
  }, []);

  return (
    <div className="bg-[#EBCBA9] min-h-screen">
      {/* Hero Section (com imagem) */}
      <section
        className="relative text-white py-20 text-center overflow-hidden"
        style={{
          backgroundImage: "url('/images/Cachorro_Home.png')", // ⬅️ troque a extensão se necessário
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        {/* Overlay para legibilidade (não muda a identidade, só garante contraste) */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#5A3A22]/85 via-[#95301F]/75 to-[#5A3A22]/85" />
        <div className="absolute inset-0 bg-black/10" />

        <div className="relative px-6">
          <h1
            className="text-4xl sm:text-5xl font-bold mb-6"
            style={{ textShadow: "2px 2px 10px rgba(0,0,0,0.55)" }}
          >
            Na{" "}
            <span className="text-white">Pelo</span>
            <span className="text-yellow-400 drop-shadow-md">Caramelo</span>, seu
            pet recebe cuidado com carinho e confiança 🐾
          </h1>

          <p
            className="text-lg sm:text-xl mb-8 max-w-3xl mx-auto"
            style={{ textShadow: "1px 1px 8px rgba(0,0,0,0.5)" }}
          >
            Aqui, o foco é simples: garantir que seu pet esteja bem cuidado, seguro e
            feliz, em qualquer situação.
          </p>

          <Link
            to="/buscar"
            className="bg-secondary hover:bg-[#95301F] text-white px-7 py-3 rounded-lg font-semibold shadow-lg transition inline-block"
          >
            Buscar Cuidadores
          </Link>

          {/* 3 cards transparentes */}
          <div className="mt-10 max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
            <div className="bg-white/10 border border-white/15 rounded-2xl p-4 backdrop-blur-sm">
              <p className="font-semibold flex items-center gap-2">
                ✅ Confiança
              </p>
              <p className="text-white/90 text-sm mt-1">
                Escolha com tranquilidade quem vai cuidar do seu pet.
              </p>
            </div>

            <div className="bg-white/10 border border-white/15 rounded-2xl p-4 backdrop-blur-sm">
              <p className="font-semibold flex items-center gap-2">
                ✅ Bem-estar
              </p>
              <p className="text-white/90 text-sm mt-1">
                O cuidado do seu pet sempre vem antes de qualquer valor.
              </p>
            </div>

            <div className="bg-white/10 border border-white/15 rounded-2xl p-4 backdrop-blur-sm">
              <p className="font-semibold flex items-center gap-2">
                ✅ Experiência
              </p>
              <p className="text-white/90 text-sm mt-1">
                Um processo simples para você se sentir seguro do início ao fim.
              </p>
            </div>
          </div>

          {/* Mensagem discreta: sem taxas */}
          <p className="mt-6 text-sm sm:text-base text-white/90">
            Não cobramos taxas de tutores ou cuidadores — nosso foco é a experiência e o bem-estar dos pets.
          </p>
        </div>
      </section>

      {/* Cards (mantive sua seção original) */}
      <section className="py-16 px-6 max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
        <div className="bg-white shadow-md rounded-2xl p-6 hover:shadow-lg transition">
          <div className="text-5xl mb-4">👩‍👧‍👦</div>
          <h2 className="text-xl font-bold mb-2 text-primary-dark">Para Tutores</h2>
          <p className="text-textsub">
            Encontre cuidadores confiáveis na{" "}
            <span className="text-[#5A3A22]">Pelo</span>
            <span className="text-yellow-400 drop-shadow-md">Caramelo</span> e
            reserve em poucos cliques.
          </p>
        </div>

        <div className="bg-white shadow-md rounded-2xl p-6 hover:shadow-lg transition">
          <div className="text-5xl mb-4">🐶</div>
          <h2 className="text-xl font-bold mb-2 text-primary-dark">Para Cuidadores</h2>
          <p className="text-textsub">
            Cadastre-se na{" "}
            <span className="text-[#5A3A22]">Pelo</span>
            <span className="text-yellow-400 drop-shadow-md">Caramelo</span>,
            receba pedidos e aumente sua renda cuidando de pets.
          </p>
        </div>

        <div className="bg-white shadow-md rounded-2xl p-6 hover:shadow-lg transition">
          <div className="text-5xl mb-4">🛡️</div>
          <h2 className="text-xl font-bold mb-2 text-primary-dark">Segurança</h2>
          <p className="text-textsub">
            A{" "}
            <span className="text-[#5A3A22]">Pelo</span>
            <span className="text-yellow-400 drop-shadow-md">Caramelo</span>{" "}
            garante transparência, confiança e suporte em todas as reservas.
          </p>
        </div>
      </section>
    </div>
  );
}
