// src/pages/Home.jsx
import { useEffect } from "react";
import { Link } from "react-router-dom";

export default function Home() {
  useEffect(() => {
    document.title = "PeloCaramelo | Início";
  }, []);

  return (
    <div className="bg-[#EBCBA9] min-h-screen">
      {/* HERO (imagem full, sem película geral) */}
      <section
        className="relative w-full"
        style={{
          // ✅ imagem no public → use /images/...
          backgroundImage: "url('/images/Gato_e_cachorro_Home.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          // ✅ tenta manter sensação de 16:9 descontando navbar (sem quebrar desktop)
          minHeight: "calc(100vh - 72px)",
        }}
      >
        {/* Conteúdo por cima da imagem */}
        <div className="relative z-10 w-full h-full">
          <div className="max-w-6xl mx-auto px-6">
            {/* Área principal: título + botão */}
            <div className="pt-16 sm:pt-10 md:pt-8 text-center">
              {/* ✅ título principal: subir no limite máximo */}
              <h1
                className="text-4xl sm:text-5xl md:text-6xl font-bold text-white"
                style={{ textShadow: "2px 2px 10px rgba(0,0,0,0.45)" }}
              >
                Na{" "}
                <span className="text-white">Pelo</span>
                <span className="text-yellow-400 drop-shadow-md">Caramelo</span>
                , seu pet recebe cuidado com carinho e confiança 🐾
              </h1>

              {/* ✅ botão mantém exatamente onde está (não mexer) */}
              <div className="mt-8">
                <Link
                  to="/buscar"
                  className="bg-secondary hover:bg-[#95301F] text-white px-6 py-3 rounded-lg font-semibold shadow-lg transition inline-block"
                >
                  Buscar Cuidadores
                </Link>
              </div>
            </div>

            {/* Cards (agora SEM as frases soltas; textos dentro dos cards; texto marrom) */}
            <div className="mt-10 pb-10 sm:pb-14">
              <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-4 items-stretch">
                {/* Confiança */}
                <div className="rounded-2xl px-6 py-4 bg-[#5A3A22]/26 backdrop-blur-sm border border-white/10 shadow-md">
                  <p className="font-semibold text-[#5A3A22] text-center text-base">
                    Confiança
                  </p>
                  <p className="text-[#5A3A22] text-sm mt-2 text-center leading-snug">
                    Aqui, o foco é simples: garantir que seu pet esteja sempre bem
                    cuidado, seguro e feliz.
                  </p>
                </div>

                {/* Bem-estar */}
                <div className="rounded-2xl px-6 py-4 bg-[#5A3A22]/26 backdrop-blur-sm border border-white/10 shadow-md">
                  <p className="font-semibold text-[#5A3A22] text-center text-base">
                    Bem-estar
                  </p>
                  <p className="text-[#5A3A22] text-sm mt-2 text-center leading-snug">
                    O cuidado do seu pet sempre vem antes de qualquer valor.
                  </p>
                </div>

                {/* Experiência */}
                <div className="rounded-2xl px-6 py-4 bg-[#5A3A22]/26 backdrop-blur-sm border border-white/10 shadow-md">
                  <p className="font-semibold text-[#5A3A22] text-center text-base">
                    Experiência
                  </p>
                  <p className="text-[#5A3A22] text-sm mt-2 text-center leading-snug">
                    Não cobramos taxas de tutores ou cuidadores — nossa prioridade é
                    o bem-estar dos pets.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Seção inferior (mantive como estava no seu original) */}
      <section className="py-16 px-6 max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
        <div className="bg-white shadow-md rounded-2xl p-6 hover:shadow-lg transition">
          <div className="text-5xl mb-4">👩‍👧‍👦</div>
          <h2 className="text-xl font-bold mb-2 text-primary-dark">
            Para Tutores
          </h2>
          <p className="text-textsub">
            Encontre cuidadores confiáveis na{" "}
            <span className="text-[#5A3A22]">Pelo</span>
            <span className="text-yellow-400 drop-shadow-md">Caramelo</span> e
            reserve em poucos cliques.
          </p>
        </div>

        <div className="bg-white shadow-md rounded-2xl p-6 hover:shadow-lg transition">
          <div className="text-5xl mb-4">🐶</div>
          <h2 className="text-xl font-bold mb-2 text-primary-dark">
            Para Cuidadores
          </h2>
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
