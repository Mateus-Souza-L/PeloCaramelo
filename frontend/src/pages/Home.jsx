import { useEffect } from "react";
import { Link } from "react-router-dom";

export default function Home() {
  useEffect(() => {
    document.title = "PeloCaramelo | Início";
  }, []);

  return (
    <div className="bg-[#EBCBA9] min-h-screen">
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-r from-[#D2A679] via-[#B25B38] to-[#95301F] text-white">
        {/* brilho suave */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-white blur-3xl" />
          <div className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full bg-yellow-300 blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-6 py-16 sm:py-20">
          <div className="text-center">
            <p className="inline-flex items-center gap-2 text-sm sm:text-base bg-white/15 px-4 py-2 rounded-full border border-white/20 shadow-sm">
              🛡️ Segurança e bem-estar acima de qualquer preço
            </p>

            <h1
              className="mt-6 text-4xl sm:text-5xl font-bold leading-tight"
              style={{ textShadow: "2px 2px 6px rgba(178,91,56,0.6)" }}
            >
              Na{" "}
              <span className="text-white">Pelo</span>
              <span className="text-yellow-400 drop-shadow-md">Caramelo</span>, seu pet
              encontra cuidado com confiança 🐾
            </h1>

            <p
              className="mt-5 text-lg sm:text-xl max-w-3xl mx-auto"
              style={{ textShadow: "1px 1px 5px rgba(59,47,47,0.5)" }}
            >
              Conectamos tutores e cuidadores com foco em uma experiência segura e
              transparente — para que seu pet receba carinho, atenção e rotina bem
              cuidada, seja em casa, passeio ou rede de hotel.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/buscar"
                className="bg-secondary hover:bg-[#95301F] text-white px-7 py-3 rounded-lg font-semibold shadow-lg transition"
              >
                Buscar Cuidadores
              </Link>

              <Link
                to="/comportamento"
                className="bg-white/15 hover:bg-white/20 text-white px-7 py-3 rounded-lg font-semibold border border-white/25 shadow-lg transition"
              >
                Ver Comportamento Animal
              </Link>
            </div>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-4xl mx-auto text-left">
              <div className="bg-white/10 border border-white/15 rounded-2xl p-4">
                <p className="font-semibold">✅ Confiança</p>
                <p className="text-white/90 text-sm mt-1">
                  Seleção e transparência para você decidir com segurança.
                </p>
              </div>
              <div className="bg-white/10 border border-white/15 rounded-2xl p-4">
                <p className="font-semibold">✅ Bem-estar</p>
                <p className="text-white/90 text-sm mt-1">
                  Rotina, conforto e cuidado acima de qualquer valor.
                </p>
              </div>
              <div className="bg-white/10 border border-white/15 rounded-2xl p-4">
                <p className="font-semibold">✅ Experiência</p>
                <p className="text-white/90 text-sm mt-1">
                  Um processo simples para o tutor se sentir seguro do início ao fim.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BLOCO: PARA QUEM É + SEGURANÇA */}
      <section className="py-14 px-6 max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
        <div className="bg-white shadow-md rounded-2xl p-6 hover:shadow-lg transition">
          <div className="text-5xl mb-4">👩‍👧‍👦</div>
          <h2 className="text-xl font-bold mb-2 text-primary-dark">Para Tutores</h2>
          <p className="text-textsub">
            Encontre cuidadores confiáveis na{" "}
            <span className="text-[#5A3A22]">Pelo</span>
            <span className="text-yellow-400 drop-shadow-md">Caramelo</span> e
            reserve em poucos cliques, com tranquilidade.
          </p>
        </div>

        <div className="bg-white shadow-md rounded-2xl p-6 hover:shadow-lg transition">
          <div className="text-5xl mb-4">🐶</div>
          <h2 className="text-xl font-bold mb-2 text-primary-dark">Para Cuidadores</h2>
          <p className="text-textsub">
            Cadastre-se na{" "}
            <span className="text-[#5A3A22]">Pelo</span>
            <span className="text-yellow-400 drop-shadow-md">Caramelo</span>, receba
            pedidos e aumente sua renda cuidando de pets com responsabilidade.
          </p>
        </div>

        <div className="bg-white shadow-md rounded-2xl p-6 hover:shadow-lg transition">
          <div className="text-5xl mb-4">🛡️</div>
          <h2 className="text-xl font-bold mb-2 text-primary-dark">Segurança & Bem-estar</h2>
          <p className="text-textsub">
            Aqui, o mais importante é o pet: conforto, rotina e cuidado acima de
            qualquer valor. Transparência, confiança e suporte em todas as reservas.
          </p>
        </div>
      </section>

      {/* DESTAQUE: VALORES DA MARCA */}
      <section className="px-6 pb-6 max-w-6xl mx-auto">
        <div className="bg-[#FFF8F0] border border-[#D2A679]/60 rounded-3xl shadow-md p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            <div className="flex-1">
              <h3 className="text-2xl sm:text-3xl font-extrabold text-[#5A3A22]">
                Segurança e bem-estar vêm primeiro.
              </h3>
              <p className="mt-3 text-[#5A3A22]/80 text-base sm:text-lg">
                Independentemente do serviço (passeio, hospedagem, rede de hotel ou
                visitas), nosso compromisso é garantir que o tutor tenha uma excelente
                experiência — com clareza, cuidado e responsabilidade.
              </p>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl p-4 shadow-sm border-l-4 border-[#FFD700]/80">
                  <p className="font-bold text-[#5A3A22]">Transparência</p>
                  <p className="text-[#5A3A22]/75 text-sm mt-1">
                    Você entende o que está contratando e com quem está deixando seu pet.
                  </p>
                </div>
                <div className="bg-white rounded-2xl p-4 shadow-sm border-l-4 border-[#FFD700]/80">
                  <p className="font-bold text-[#5A3A22]">Confiança</p>
                  <p className="text-[#5A3A22]/75 text-sm mt-1">
                    Informações claras para decidir com segurança.
                  </p>
                </div>
                <div className="bg-white rounded-2xl p-4 shadow-sm border-l-4 border-[#FFD700]/80">
                  <p className="font-bold text-[#5A3A22]">Bem-estar</p>
                  <p className="text-[#5A3A22]/75 text-sm mt-1">
                    Rotina, atenção e conforto acima de qualquer valor.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Link
                  to="/buscar"
                  className="bg-secondary hover:bg-[#95301F] text-white px-6 py-3 rounded-lg font-semibold shadow-lg transition text-center"
                >
                  Buscar Cuidadores
                </Link>
                <Link
                  to="/sobre"
                  className="bg-white hover:bg-[#FFF8F0] text-[#5A3A22] px-6 py-3 rounded-lg font-semibold shadow border border-[#D2A679]/60 transition text-center"
                >
                  Conhecer a PeloCaramelo
                </Link>
              </div>
            </div>

            <div className="w-full lg:w-[380px]">
              <div className="bg-gradient-to-b from-[#5A3A22] to-[#95301F] text-white rounded-3xl p-6 shadow-lg">
                <p className="text-sm text-white/85">Destaque</p>
                <h4 className="text-xl font-extrabold mt-1">
                  Comportamento Animal
                </h4>
                <p className="text-white/90 text-sm mt-2">
                  Educação, respeito e métodos positivos. Uma base essencial para uma
                  convivência saudável — e para escolher o serviço ideal para o seu pet.
                </p>
                <Link
                  to="/comportamento"
                  className="mt-4 inline-block bg-[#FFD700] text-[#5A3A22] px-5 py-2 rounded-lg font-semibold shadow hover:opacity-95 transition"
                >
                  Ver conteúdos
                </Link>

                <div className="mt-5 bg-white/10 border border-white/15 rounded-2xl p-4">
                  <p className="font-semibold">📌 Nosso valor</p>
                  <p className="text-white/85 text-sm mt-1">
                    Bem-estar e segurança vêm antes de preço. Sempre.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA (experiência do tutor) */}
      <section className="px-6 py-14 max-w-6xl mx-auto">
        <div className="text-center">
          <h3 className="text-2xl sm:text-3xl font-extrabold text-[#5A3A22]">
            Uma experiência simples, com foco no que importa.
          </h3>
          <p className="mt-3 text-[#5A3A22]/80 max-w-3xl mx-auto">
            O tutor precisa se sentir seguro. O pet precisa estar bem. E o serviço precisa ser claro.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-3xl shadow-md p-6 border border-[#D2A679]/40">
            <p className="text-sm font-bold text-[#95301F]">PASSO 1</p>
            <h4 className="mt-2 text-lg font-extrabold text-[#5A3A22]">Buscar cuidadores</h4>
            <p className="mt-2 text-[#5A3A22]/75">
              Encontre opções e escolha com calma, com transparência.
            </p>
          </div>

          <div className="bg-white rounded-3xl shadow-md p-6 border border-[#D2A679]/40">
            <p className="text-sm font-bold text-[#95301F]">PASSO 2</p>
            <h4 className="mt-2 text-lg font-extrabold text-[#5A3A22]">Reservar com segurança</h4>
            <p className="mt-2 text-[#5A3A22]/75">
              Um fluxo simples para você agendar e acompanhar.
            </p>
          </div>

          <div className="bg-white rounded-3xl shadow-md p-6 border border-[#D2A679]/40">
            <p className="text-sm font-bold text-[#95301F]">PASSO 3</p>
            <h4 className="mt-2 text-lg font-extrabold text-[#5A3A22]">Bem-estar em primeiro lugar</h4>
            <p className="mt-2 text-[#5A3A22]/75">
              O objetivo é o pet ficar bem — e o tutor se sentir tranquilo.
            </p>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="px-6 pb-16 max-w-6xl mx-auto">
        <div className="bg-gradient-to-r from-[#5A3A22] to-[#95301F] text-white rounded-3xl shadow-lg p-8 sm:p-10 text-center">
          <h3 className="text-2xl sm:text-3xl font-extrabold">
            Pronto para encontrar o cuidador ideal?
          </h3>
          <p className="mt-3 text-white/90 max-w-2xl mx-auto">
            Segurança, bem-estar e confiança — para você e para o seu pet, em qualquer serviço.
          </p>
          <div className="mt-6">
            <Link
              to="/buscar"
              className="bg-secondary hover:bg-[#95301F] text-white px-7 py-3 rounded-lg font-semibold shadow-lg transition inline-block"
            >
              Buscar Cuidadores
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
