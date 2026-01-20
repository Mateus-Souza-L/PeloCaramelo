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
                    <span className="text-yellow-400 drop-shadow-md">Caramelo</span>,
                    seu pet recebe cuidado com carinho e confiança 🐾
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

      {/* ✅ REMOVIDO: os 3 cards soltos (Para Tutores / Para Cuidadores / Segurança) */}

      {/* NOVA SEÇÃO 16:9 — COMPORTAMENTO ANIMAL */}
      <section className="px-6 py-12">
        <div
          className="
            max-w-[1400px] mx-auto
            rounded-[28px]
            bg-[#FFF8F0]
            shadow-lg
            overflow-hidden
            border border-[#5A3A22]/10
            border-l-4 border-l-[#5A3A22]
          "
          style={{
            aspectRatio: "16 / 9",
            minHeight: 520,
            maxHeight: 680,
          }}
        >
          <div className="w-full h-full grid grid-cols-1 md:grid-cols-2 gap-10 p-8 md:p-10">
            {/* Coluna esquerda */}
            <div className="flex flex-col justify-center">
              <span className="inline-flex items-center gap-2 w-fit px-4 py-2 rounded-full bg-[#EBCBA9] text-[#5A3A22] text-sm font-semibold border border-[#5A3A22]/10">
                🧠 Comportamento Animal
              </span>

              <h2 className="mt-4 text-3xl md:text-4xl font-extrabold text-[#5A3A22] leading-tight">
                Entenda seu pet e comece a melhorar a rotina hoje
              </h2>

              <p className="mt-4 text-[#5A3A22]/80 leading-relaxed">
                Veja conteúdos e consultas com especialista para te ajudar com rotina,
                ansiedade, passeios e também com aquele momento difícil de fogos e muito
                barulho.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/comportamento"
                  className="bg-[#95301F] hover:brightness-110 text-white px-6 py-3 rounded-xl font-semibold shadow-md transition"
                >
                  Comportamento Animal
                </Link>

                <Link
                  to="/comportamento#dra-laise-oliveira"
                  className="bg-transparent border-2 border-[#5A3A22] text-[#5A3A22] hover:bg-[#5A3A22]/10 px-6 py-3 rounded-xl font-semibold transition"
                >
                  Consultar especialista
                </Link>
              </div>
            </div>

            {/* Coluna direita */}
            <div className="relative flex items-center justify-center">
              {/* Card interno: mais largo */}
              <div className="w-full max-w-xl bg-white rounded-2xl shadow-md p-7 border border-[#5A3A22]/10 border-r-4 border-r-[#FFD700]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-xl bg-[#FFF8F0] border border-[#5A3A22]/10 p-4">
                    <p className="font-bold text-[#5A3A22]">🎆 Fogos e barulho</p>
                    <p className="text-[13px] leading-snug text-[#5A3A22]/80 mt-1">
                      Como acalmar e preparar seu pet com segurança.
                    </p>
                  </div>

                  <div className="rounded-xl bg-[#FFF8F0] border border-[#5A3A22]/10 p-4">
                    <p className="font-bold text-[#5A3A22]">🕒 Rotina</p>
                    <p className="text-[13px] leading-snug text-[#5A3A22]/80 mt-1">
                      Ajustes simples que melhoram o comportamento.
                    </p>
                  </div>

                  <div className="rounded-xl bg-[#FFF8F0] border border-[#5A3A22]/10 p-4">
                    <p className="font-bold text-[#5A3A22]">🐾 Passeio</p>
                    <p className="text-[13px] leading-snug text-[#5A3A22]/80 mt-1">
                      Dicas para passear melhor e com menos estresse.
                    </p>
                  </div>

                  <div className="rounded-xl bg-[#FFF8F0] border border-[#5A3A22]/10 p-4">
                    <p className="font-bold text-[#5A3A22]">💛 Ansiedade</p>
                    <p className="text-[13px] leading-snug text-[#5A3A22]/80 mt-1">
                      Sinais comuns e o que fazer no dia a dia.
                    </p>
                  </div>
                </div>
              </div>

              {/* brilho suave decorativo */}
              <div className="absolute -bottom-16 -right-16 w-72 h-72 rounded-full bg-[#FFD700]/20 blur-3xl pointer-events-none" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
