import { useEffect } from "react";
import { Link } from "react-router-dom";

export default function Home() {
  useEffect(() => {
    document.title = "PeloCaramelo | Início";
  }, []);

  return (
    <div className="bg-[#EBCBA9] min-h-screen">
      {/* Hero Section */}
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
              {/* ✅ TEXTO PRINCIPAL (mantido onde está) */}
              <h1
                className="text-4xl sm:text-5xl font-bold mb-4"
                style={{ textShadow: "2px 2px 10px rgba(0,0,0,0.65)" }}
              >
                Na{" "}
                <span className="text-white">Pelo</span>
                <span className="text-yellow-400 drop-shadow-md">Caramelo</span>, seu
                pet recebe cuidado com carinho e confiança 🐾
              </h1>

              {/* espaçador para “limpar” o centro da imagem (desktop) */}
              <div className="mt-6 sm:mt-8 md:mt-10" />

              {/* CTA */}
              <div className="flex justify-center">
                <Link
                  to="/buscar"
                  className="bg-secondary hover:bg-[#95301F] text-white px-7 py-3 rounded-lg font-semibold shadow-lg transition inline-block"
                >
                  Buscar Cuidadores
                </Link>
              </div>

              {/* Mini-manifesto (menos “balão”, mais elegante) */}
              <div className="mt-6 flex justify-center">
                <div className="max-w-3xl w-full">
                  <p
                    className="
                      mx-auto inline-block
                      text-sm sm:text-base
                      text-white
                      px-5 py-3
                      rounded-2xl
                      bg-[#5A3A22]/45
                      backdrop-blur-md
                      border border-white/15
                    "
                    style={{ textShadow: "1px 1px 6px rgba(0,0,0,0.40)" }}
                  >
                    <span className="font-semibold">Aqui, o foco é simples:</span>{" "}
                    garantir que seu pet esteja bem cuidado, seguro e feliz, em qualquer situação.
                  </p>
                </div>
              </div>

              {/* Cards (mais premium + texto legível sem truncar) */}
              <div className="mt-10 sm:mt-12 md:mt-14 max-w-6xl mx-auto">
                <div
                  className="
                    grid grid-cols-1 sm:grid-cols-3 gap-4
                    items-stretch
                    translate-y-10 sm:translate-y-12 md:translate-y-16
                  "
                >
                  <div className="rounded-2xl px-6 py-4 bg-[#5A3A22]/55 backdrop-blur-lg border border-white/15 shadow-md">
                    <p className="font-semibold text-white text-center text-base">
                      Confiança
                    </p>
                    <p className="text-white/90 text-sm mt-2 text-center leading-snug">
                      Escolha com tranquilidade quem vai cuidar do seu pet.
                    </p>
                  </div>

                  <div className="rounded-2xl px-6 py-4 bg-[#5A3A22]/55 backdrop-blur-lg border border-white/15 shadow-md">
                    <p className="font-semibold text-white text-center text-base">
                      Bem-estar
                    </p>
                    <p className="text-white/90 text-sm mt-2 text-center leading-snug">
                      O cuidado do seu pet sempre vem antes de qualquer valor.
                    </p>
                  </div>

                  <div className="rounded-2xl px-6 py-4 bg-[#5A3A22]/55 backdrop-blur-lg border border-white/15 shadow-md">
                    <p className="font-semibold text-white text-center text-base">
                      Experiência
                    </p>
                    <p className="text-white/90 text-sm mt-2 text-center leading-snug">
                      Um processo simples para você se sentir seguro do início ao fim.
                    </p>
                  </div>
                </div>

                {/* Selo “sem taxas” (discreto, premium, alinhado) */}
                <div className="mt-10 sm:mt-12 md:mt-14 flex justify-center">
                  <p
                    className="
                      text-[#5A3A22]
                      text-sm sm:text-base
                      font-semibold
                      px-4 py-2
                      rounded-xl
                      bg-white/55
                      backdrop-blur-md
                      border border-[#5A3A22]/15
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
