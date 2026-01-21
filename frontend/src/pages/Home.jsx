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
          // ✅ (1) MOBILE: altura do hero responsiva (evita aparecer a próxima seção)
          // - mobile: subtrai 56px (menu/hamburguer costuma ser menor)
          // - sm+: mantém exatamente o cálculo anterior com 72px
          className="relative w-full h-[calc(100svh-56px)] sm:h-[calc(100svh-72px)]"
          style={{
            minHeight: "640px",
            maxHeight: "760px",
            backgroundImage: "url('/images/Gato_e_cachorro_Home.png')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        >
          {/* Overlay p/ legibilidade */}
          <div className="absolute inset-0 bg-black/25" />

          <div className="absolute inset-0">
            <div className="relative w-full h-full max-w-6xl mx-auto px-6 text-center text-white">
              {/* ✅ (1) Só o TEXTO desceu ~1cm (sem mexer em botão/cards) */}
              <div className="pt-2 sm:pt-3">
                <h1
                  className="font-bold text-white text-3xl leading-tight sm:text-5xl relative top-6 sm:top-5"
                  style={{ textShadow: "2px 2px 10px rgba(0,0,0,0.55)" }}
                >
                  <span className="block max-w-[22rem] mx-auto sm:max-w-none">
                    Na <span className="text-white">Pelo</span>
                    <span className="text-yellow-400 drop-shadow-md">Caramelo</span>, seu
                    pet recebe cuidado com carinho e confiança 🐾
                  </span>
                </h1>
              </div>

              {/* Bloco inferior (inalterado) */}
              <div className="absolute left-6 right-6 bottom-3">
                <div className="flex justify-center mb-3">
                  <Link
                    to="/buscar"
                    className="
                      bg-secondary hover:bg-[#95301F] text-white
                      rounded-lg font-semibold shadow-lg transition inline-block
                      px-5 py-2.5 text-sm
                      sm:px-6 sm:py-3 sm:text-base
                      focus:outline-none focus:ring-2 focus:ring-white/70
                    "
                  >
                    Buscar Cuidadores
                  </Link>
                </div>

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
                        [-webkit-overflow-scrolling:touch]
                      "
                      aria-label="Destaques"
                    >
                      <div className="snap-center shrink-0 w-full">
                        <div className="rounded-2xl bg-[#5A3A22]/26 backdrop-blur-sm border border-white/10 shadow-md px-5 py-4">
                          <p className="font-semibold text-[#5A3A22] text-center text-base">
                            Confiança
                          </p>
                          <p className="text-[#5A3A22] text-sm mt-2 text-center leading-snug">
                            Aqui, o foco é simples: garantir que seu pet esteja sempre bem
                            cuidado, seguro e feliz.
                          </p>
                        </div>
                      </div>

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

                      <div className="snap-center shrink-0 w-full">
                        <div className="rounded-2xl bg-[#5A3A22]/26 backdrop-blur-sm border border-white/10 shadow-md px-5 py-4">
                          <p className="font-semibold text-[#5A3A22] text-center text-base">
                            Experiência
                          </p>
                          <p className="text-[#5A3A22] text-sm mt-2 text-center leading-snug">
                            Não cobramos taxas de tutores ou cuidadores — nossa prioridade é o
                            bem-estar dos pets.
                          </p>
                        </div>
                      </div>
                    </div>

                    <p className="mt-1 text-[11px] text-white/80">
                      Deslize para o lado para ver os cards →
                    </p>
                  </div>

                  {/* DESKTOP GRID */}
                  <div className="hidden sm:block rounded-2xl bg-[#5A3A22]/26 backdrop-blur-sm border border-white/10 shadow-md px-6 py-4">
                    <p className="font-semibold text-[#5A3A22] text-center text-base">
                      Confiança
                    </p>
                    <p className="text-[#5A3A22] text-sm mt-2 text-center leading-snug">
                      Aqui, o foco é simples: garantir que seu pet esteja sempre bem cuidado,
                      seguro e feliz.
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
                      Não cobramos taxas de tutores ou cuidadores — nossa prioridade é o
                      bem-estar dos pets.
                    </p>
                  </div>
                </div>
              </div>
              {/* fim bloco inferior */}
            </div>
          </div>
        </div>
      </section>

      {/* Seção Comportamento (mantida como no seu código anterior) */}
      <section className="px-6 py-14 md:py-4">
        <div className="max-w-[1400px] mx-auto md:aspect-[16/9]">
          <div className="w-full h-full flex items-center justify-center md:min-h-[calc(100vh-220px)]">
            <div
              className="
                w-full max-w-6xl
                rounded-[28px]
                bg-[#FFF8F0]
                shadow-lg
                overflow-hidden
                border border-[#5A3A22]/10
                border-l-4 border-l-[#5A3A22]
              "
            >
              <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-8 p-8 md:p-10">
                {/* Coluna esquerda */}
                <div className="flex flex-col gap-6 md:gap-0 md:justify-between">
                  <div>
                    <span className="inline-flex items-center gap-2 w-fit px-4 py-2 rounded-full bg-[#EBCBA9] text-[#5A3A22] text-sm font-semibold border border-[#5A3A22]/10">
                      🧠 Comportamento Animal
                    </span>

                    {/* (título como está no seu arquivo atual) */}
                    <h2 className="mt-4 text-3xl md:text-4xl font-extrabold text-[#5A3A22] leading-tight">
                      Entenda seu pet e comece a melhorar a rotina hoje
                    </h2>

                    <p className="mt-4 text-[#5A3A22]/80 leading-relaxed">
                      Veja conteúdos e consultas com especialista para te ajudar com rotina,
                      ansiedade, passeios e também com aquele momento difícil de fogos e muito
                      barulho.
                    </p>

                    <div className="mt-6 flex flex-row flex-wrap gap-3">
                      <Link
                        to="/comportamento"
                        className="
                          bg-[#95301F] hover:brightness-110 text-white
                          rounded-xl font-semibold shadow-md transition
                          px-4 py-2 text-sm
                          sm:px-6 sm:py-3 sm:text-base
                          focus:outline-none focus:ring-2 focus:ring-[#95301F]/40
                        "
                      >
                        Comportamento Animal
                      </Link>

                      <Link
                        to="/comportamento#dra-laise-oliveira"
                        className="
                          bg-transparent border-2 border-[#5A3A22] text-[#5A3A22]
                          hover:bg-[#5A3A22]/10 rounded-xl font-semibold transition
                          px-4 py-2 text-sm
                          sm:px-6 sm:py-3 sm:text-base
                          focus:outline-none focus:ring-2 focus:ring-[#5A3A22]/30
                        "
                      >
                        Consultar especialista
                      </Link>
                    </div>
                  </div>

                  {/* imagem gato */}
                  <div className="md:pt-6">
                    <div className="rounded-2xl overflow-hidden shadow-md border border-[#5A3A22]/10 mt-4 md:mt-0">
                      <img
                        src="/images/Gatil.png"
                        alt="Gato (Gatil)"
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  </div>
                </div>

                {/* Coluna direita */}
                <div className="flex flex-col gap-6 md:gap-0 md:justify-between">
                  {/* imagem cachorro */}
                  <div>
                    <div className="rounded-2xl overflow-hidden shadow-md border border-[#5A3A22]/10 mb-4 md:mb-0">
                      <img
                        src="/images/Guia_cachorro.png"
                        alt="Cachorro (Guia)"
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  </div>

                  {/* Card interno (borda amarela) */}
                  <div className="relative md:pt-6">
                    <div className="w-full bg-white rounded-2xl shadow-md p-6 border border-[#5A3A22]/10 border-r-4 border-r-[#FFD700]">
                      {/* DESKTOP/TABLET */}
                      <div className="hidden sm:grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="rounded-xl bg-[#FFF8F0] border border-[#5A3A22]/10 p-4">
                          <p className="font-bold text-[#5A3A22]">🎆 Fogos e barulho</p>
                          <p className="text-sm text-[#5A3A22]/80 mt-1">
                            Como acalmar e preparar seu pet com segurança.
                          </p>
                        </div>

                        <div className="rounded-xl bg-[#FFF8F0] border border-[#5A3A22]/10 p-4">
                          <p className="font-bold text-[#5A3A22]">🕒 Rotina</p>
                          <p className="text-sm text-[#5A3A22]/80 mt-1">
                            Ajustes simples que melhoram o comportamento.
                          </p>
                        </div>

                        <div className="rounded-xl bg-[#FFF8F0] border border-[#5A3A22]/10 p-4">
                          <p className="font-bold text-[#5A3A22]">🐾 Passeio</p>
                          <p className="text-sm text-[#5A3A22]/80 mt-1">
                            Dicas para passear melhor e com menos estresse.
                          </p>
                        </div>

                        <div className="rounded-xl bg-[#FFF8F0] border border-[#5A3A22]/10 p-4">
                          <p className="font-bold text-[#5A3A22]">💛 Ansiedade</p>
                          <p className="text-sm text-[#5A3A22]/80 mt-1">
                            Sinais comuns e o que fazer no dia a dia.
                          </p>
                        </div>
                      </div>

                      {/* MOBILE: CAROUSEL */}
                      <div className="sm:hidden">
                        <div
                          className="
                            flex gap-4
                            overflow-x-auto
                            snap-x snap-mandatory
                            pb-2
                            -mx-1
                            px-1
                            [-webkit-overflow-scrolling:touch]
                          "
                          aria-label="Conteúdos de comportamento"
                        >
                          {[
                            {
                              t: "🎆 Fogos e barulho",
                              d: "Como acalmar e preparar seu pet com segurança.",
                            },
                            { t: "🕒 Rotina", d: "Ajustes simples que melhoram o comportamento." },
                            { t: "🐾 Passeio", d: "Dicas para passear melhor e com menos estresse." },
                            { t: "💛 Ansiedade", d: "Sinais comuns e o que fazer no dia a dia." },
                          ].map((x) => (
                            // ✅ (2) MOBILE: 100% da largura -> não aparece “pedaço” de outro card
                            <div key={x.t} className="snap-center shrink-0 w-full">
                              <div className="rounded-xl bg-[#FFF8F0] border border-[#5A3A22]/10 p-4">
                                <p className="font-bold text-[#5A3A22]">{x.t}</p>
                                <p className="text-sm text-[#5A3A22]/80 mt-1">{x.d}</p>
                              </div>
                            </div>
                          ))}
                        </div>

                        <p className="mt-1 text-[11px] text-[#5A3A22]/70">
                          Deslize para o lado para ver os cards →
                        </p>
                      </div>
                    </div>

                    <div className="absolute -bottom-16 -right-16 w-72 h-72 rounded-full bg-[#FFD700]/20 blur-3xl pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
            {/* fim card externo */}
          </div>
        </div>
      </section>
    </div>
  );
}
