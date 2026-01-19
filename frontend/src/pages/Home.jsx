import { useEffect } from "react";
import { Link } from "react-router-dom";

export default function Home() {
  useEffect(() => {
    document.title = "PeloCaramelo | Início";
  }, []);

  return (
    <div className="bg-[#EBCBA9] min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="relative w-full aspect-video min-h-[560px] md:min-h-[680px]"
          style={{
            backgroundImage: "url('/images/Gato_e_cachorro_Home.png')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        >
          <div className="absolute inset-0 flex items-start justify-center">
            <div className="w-full max-w-6xl px-6 text-center text-white pt-20 sm:pt-24">
              {/* TEXTO PRINCIPAL (mantém onde está) */}
              <h1
                className="text-4xl sm:text-5xl font-bold mb-4"
                style={{ textShadow: "2px 2px 10px rgba(0,0,0,0.65)" }}
              >
                Na{" "}
                <span className="text-white">Pelo</span>
                <span className="text-yellow-400 drop-shadow-md">Caramelo</span>, seu
                pet recebe cuidado com carinho e confiança 🐾
              </h1>

              {/* Botão (mantém) */}
              <div className="mt-6 sm:mt-8 md:mt-10 flex justify-center">
                <Link
                  to="/buscar"
                  className="bg-secondary hover:bg-[#95301F] text-white px-7 py-3 rounded-lg font-semibold shadow-lg transition inline-block"
                >
                  Buscar Cuidadores
                </Link>
              </div>

              {/* Texto “Aqui, o foco…” (mantém onde está) */}
              <div className="mt-6 flex justify-center">
                <div className="max-w-3xl w-full">
                  <p
                    className="
                      mx-auto inline-block
                      text-sm sm:text-base
                      text-white
                      px-5 py-3
                      rounded-2xl
                      bg-[#5A3A22]/40
                      backdrop-blur-sm
                      border border-white/10
                    "
                    style={{ textShadow: "1px 1px 6px rgba(0,0,0,0.40)" }}
                  >
                    <span className="font-semibold">Aqui, o foco é simples:</span>{" "}
                    garantir que seu pet esteja bem cuidado, seguro e feliz, em qualquer situação.
                  </p>
                </div>
              </div>

              {/* ✅ BLOCO DE BASE: cards + “não cobramos” descem até o limite */}
              <div className="max-w-6xl mx-auto mt-6 relative">
                {/* espaço grande para empurrar cards pro fim do hero */}
                <div className="h-40 sm:h-48 md:h-56" />

                <div className="flex flex-col items-center gap-4 pb-6">
                  {/* Cards (mais transparentes + mais embaixo) */}
                  <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-4 items-stretch">
                    <div className="rounded-2xl px-6 py-4 bg-[#5A3A22]/38 backdrop-blur-sm border border-white/10 shadow-md">
                      <p className="font-semibold text-white text-center text-base">
                        Confiança
                      </p>
                      <p className="text-white/90 text-sm mt-2 text-center leading-snug">
                        Escolha com tranquilidade quem vai cuidar do seu pet.
                      </p>
                    </div>

                    <div className="rounded-2xl px-6 py-4 bg-[#5A3A22]/38 backdrop-blur-sm border border-white/10 shadow-md">
                      <p className="font-semibold text-white text-center text-base">
                        Bem-estar
                      </p>
                      <p className="text-white/90 text-sm mt-2 text-center leading-snug">
                        O cuidado do seu pet sempre vem antes de qualquer valor.
                      </p>
                    </div>

                    <div className="rounded-2xl px-6 py-4 bg-[#5A3A22]/38 backdrop-blur-sm border border-white/10 shadow-md">
                      <p className="font-semibold text-white text-center text-base">
                        Experiência
                      </p>
                      <p className="text-white/90 text-sm mt-2 text-center leading-snug">
                        Um processo simples para você se sentir seguro do início ao fim.
                      </p>
                    </div>
                  </div>

                  {/* “Não cobramos…” (mais transparente) */}
                  <p
                    className="
                      text-[#5A3A22]
                      text-sm sm:text-base
                      font-semibold
                      px-4 py-2
                      rounded-xl
                      bg-white/35
                      backdrop-blur-sm
                      border border-[#5A3A22]/10
                    "
                  >
                    Não cobramos taxas de tutores ou cuidadores — nosso foco é a experiência e o bem-estar dos pets.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Seção inferior (mantida) */}
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
