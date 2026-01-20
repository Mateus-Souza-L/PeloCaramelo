// src/pages/Home.jsx
import { useEffect } from "react";
import { Link } from "react-router-dom";

export default function Home() {
  useEffect(() => {
    document.title = "PeloCaramelo | Início";
  }, []);

  const NAVBAR_H = 72;

  return (
    <div className="bg-[#EBCBA9] min-h-screen">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div
          className="relative w-full"
          style={{
            height: `calc(100vh - ${NAVBAR_H}px)`,
            minHeight: "540px",
            maxHeight: "720px",
            backgroundImage: "url('/images/Gato_e_cachorro_Home.png')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        >
          <div className="absolute inset-0">
            <div className="relative w-full h-full max-w-6xl mx-auto px-6 text-center text-white">
              {/* Título (mobile menor) */}
              <div className="pt-2 sm:pt-3">
                <h1
                  className="font-bold text-white text-3xl leading-tight sm:text-5xl"
                  style={{ textShadow: "2px 2px 10px rgba(0,0,0,0.55)" }}
                >
                  <span className="block max-w-[22rem] mx-auto sm:max-w-none">
                    Na <span className="text-white">Pelo</span>
                    <span className="text-yellow-400 drop-shadow-md">Caramelo</span>, seu
                    pet recebe cuidado com carinho e confiança 🐾
                  </span>
                </h1>
              </div>

              {/* Bloco inferior */}
              <div className="absolute left-6 right-6 bottom-3">
                {/* Botão (mobile menor) */}
                <div className="flex justify-center mb-3">
                  <Link
                    to="/buscar"
                    className="
                      bg-secondary hover:bg-[#95301F] text-white
                      rounded-lg font-semibold shadow-lg transition inline-block
                      px-5 py-2.5 text-sm
                      sm:px-6 sm:py-3 sm:text-base
                    "
                  >
                    Buscar Cuidadores
                  </Link>
                </div>

                {/* ✅ DESKTOP: grid normal | ✅ MOBILE: 1 card por vez (snap) */}
                <div className="sm:grid sm:grid-cols-3 sm:gap-4 sm:items-stretch">
                  {/* MOBILE CAROUSEL */}
                  <div className="sm:hidden">
                    <div
                      className="
                        flex gap-6
                        overflow-x-auto
                        snap-x snap-mandatory
                        px-5
                        -mx-5
                        pb-2
                      "
                    >
                      {/* Card 1 */}
                      <div className="snap-center shrink-0 w-full">
                        <div className="rounded-2xl bg-[#5A3A22]/26 backdrop-blur-sm border border-white/10 shadow-md px-5 py-4">
                          <p className="font-semibold text-[#5A3A22] text-center text-base">
                            Confiança
                          </p>
                          <p className="text-[#5A3A22] text-sm mt-2 text-center leading-snug">
                            Aqui, o foco é simples: garantir que seu pet esteja sempre
                            bem cuidado, seguro e feliz.
                          </p>
                        </div>
                      </div>

                      {/* Card 2 */}
                      <div className="snap-center shrink-0 w-full">
                        <div className="rounded-2xl bg-[#5A3A22]/26 backdrop-blur-sm border border-white/10 shadow-md px-5 py-4">
                          <p className="font-semibold text-[#5A3A22] text-center text-base">
                            Bem-estar
                          </p>
                          <p className="text-[#5A3A22] text-sm mt-2 text-center leading-snug">
                            O cuidado do seu pet sempre vem antes de qualquer valor.
                          </p>
                        </div>
                      </div>

                      {/* Card 3 */}
                      <div className="snap-center shrink-0 w-full">
                        <div className="rounded-2xl bg-[#5A3A22]/26 backdrop-blur-sm border border-white/10 shadow-md px-5 py-4">
                          <p className="font-semibold text-[#5A3A22] text-center text-base">
                            Experiência
                          </p>
                          <p className="text-[#5A3A22] text-sm mt-2 text-center leading-snug">
                            Não cobramos taxas de tutores ou cuidadores — nossa prioridade
                            é o bem-estar dos pets.
                          </p>
                        </div>
                      </div>
                    </div>

                    <p className="mt-1 text-[11px] text-white/70">
                      Deslize para o lado para ver os cards →
                    </p>
                  </div>

                  {/* DESKTOP GRID (mantido igual) */}
                  <div className="hidden sm:block rounded-2xl bg-[#5A3A22]/26 backdrop-blur-sm border border-white/10 shadow-md px-6 py-4">
                    <p className="font-semibold text-[#5A3A22] text-center text-base">
                      Confiança
                    </p>
                    <p className="text-[#5A3A22] text-sm mt-2 text-center leading-snug">
                      Aqui, o foco é simples: garantir que seu pet esteja sempre bem
                      cuidado, seguro e feliz.
                    </p>
                  </div>

                  <div className="hidden sm:block rounded-2xl bg-[#5A3A22]/26 backdrop-blur-sm border border-white/10 shadow-md px-6 py-4">
                    <p className="font-semibold text-[#5A3A22] text-center text-base">
                      Bem-estar
                    </p>
                    <p className="text-[#5A3A22] text-sm mt-2 text-center leading-snug">
                      O cuidado do seu pet sempre vem antes de qualquer valor.
                    </p>
                  </div>

                  <div className="hidden sm:block rounded-2xl bg-[#5A3A22]/26 backdrop-blur-sm border border-white/10 shadow-md px-6 py-4">
                    <p className="font-semibold text-[#5A3A22] text-center text-base">
                      Experiência
                    </p>
                    <p className="text-[#5A3A22] text-sm mt-2 text-center leading-snug">
                      Não cobramos taxas de tutores ou cuidadores — nossa prioridade é
                      o bem-estar dos pets.
                    </p>
                  </div>
                </div>
                {/* fim cards */}
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

      {/* ✅ NOVA SEÇÃO 16:9 — Comportamento Animal */}
      <section className="px-6 pb-16">
        <div className="max-w-6xl mx-auto">
          {/* wrapper 16:9 */}
          <div className="relative w-full rounded-3xl overflow-hidden shadow-lg border border-[#5A3A22]/10 bg-[#FFF8F0]">
            <div style={{ paddingTop: "56.25%" }} />

            {/* conteúdo */}
            <div className="absolute inset-0 p-6 sm:p-10">
              <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                {/* Coluna esquerda */}
                <div className="text-[#5A3A22]">
                  <p className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full bg-[#D2A679]/35 border border-[#5A3A22]/10">
                    🧠 Comportamento Animal
                  </p>

                  <h3 className="mt-4 text-2xl sm:text-3xl font-extrabold leading-tight">
                    Orientação prática para melhorar o dia a dia do seu pet
                  </h3>

                  <p className="mt-3 text-sm sm:text-base text-[#5A3A22]/85 max-w-xl">
                    Conteúdos e consultas com especialista para te ajudar com rotina,
                    ansiedade, passeios e também com aquele momento difícil de
                    <span className="font-semibold"> fogos e muito barulho</span>.
                  </p>

                  <div className="mt-5 flex flex-col sm:flex-row gap-3">
                    <Link
                      to="/comportamento"
                      className="bg-[#95301F] hover:opacity-95 text-white px-5 py-3 rounded-xl font-semibold shadow-md transition text-center"
                    >
                      Ver Comportamento Animal
                    </Link>

                    <Link
                      to="/comportamento"
                      className="border-2 border-[#5A3A22] text-[#5A3A22] hover:bg-[#5A3A22] hover:text-white px-5 py-3 rounded-xl font-semibold transition text-center"
                    >
                      Consultar especialista
                    </Link>
                  </div>
                </div>

                {/* Coluna direita (mini cards) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#5A3A22]/10">
                    <p className="text-sm font-bold text-[#5A3A22]">🎆 Fogos e barulho</p>
                    <p className="mt-2 text-sm text-[#5A3A22]/80">
                      Como acalmar e preparar seu pet com segurança.
                    </p>
                  </div>

                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#5A3A22]/10">
                    <p className="text-sm font-bold text-[#5A3A22]">🕒 Rotina</p>
                    <p className="mt-2 text-sm text-[#5A3A22]/80">
                      Ajustes simples que melhoram o comportamento.
                    </p>
                  </div>

                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#5A3A22]/10">
                    <p className="text-sm font-bold text-[#5A3A22]">🐾 Passeio</p>
                    <p className="mt-2 text-sm text-[#5A3A22]/80">
                      Dicas para passear melhor e com menos estresse.
                    </p>
                  </div>

                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#5A3A22]/10">
                    <p className="text-sm font-bold text-[#5A3A22]">💛 Ansiedade</p>
                    <p className="mt-2 text-sm text-[#5A3A22]/80">
                      Sinais comuns e o que fazer no dia a dia.
                    </p>
                  </div>
                </div>
              </div>

              {/* detalhe visual discreto */}
              <div className="pointer-events-none absolute -bottom-16 -right-16 w-64 h-64 rounded-full bg-[#FFD700]/20 blur-2xl" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
