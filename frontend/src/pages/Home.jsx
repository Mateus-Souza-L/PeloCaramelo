// src/pages/Home.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "PeloCaramelo | Início";
  }, []);

  // filtros (Home -> /buscar)
  const [query, setQuery] = useState("");
  const [startDateKey, setStartDateKey] = useState("");
  const [endDateKey, setEndDateKey] = useState("");
  const [svc, setSvc] = useState("todos");

  const isValidKey = (key) =>
    typeof key === "string" && /^\d{4}-\d{2}-\d{2}$/.test(key);

  function parseLocalKeySafe(key) {
    try {
      // YYYY-MM-DD -> Date local
      const [y, m, d] = String(key)
        .split("-")
        .map((x) => Number(x));
      if (!y || !m || !d) return null;
      const dt = new Date(y, m - 1, d);
      if (Number.isNaN(dt.getTime())) return null;
      return dt;
    } catch {
      return null;
    }
  }

  // limpa end se ficar antes do start
  useEffect(() => {
    if (!isValidKey(startDateKey) || !isValidKey(endDateKey)) return;
    const ds = parseLocalKeySafe(startDateKey);
    const de = parseLocalKeySafe(endDateKey);
    if (ds && de && de < ds) setEndDateKey("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDateKey]);

  const canSubmit = useMemo(() => {
    const qOk = String(query || "").trim().length > 0;
    const sOk = !startDateKey || isValidKey(startDateKey);
    const eOk = !endDateKey || isValidKey(endDateKey);
    return qOk && sOk && eOk;
  }, [query, startDateKey, endDateKey]);

  function handleSearchSubmit(e) {
    e.preventDefault();

    const q = String(query || "").trim();
    if (!q) return;

    const sp = new URLSearchParams();
    sp.set("q", q);

    if (isValidKey(startDateKey)) sp.set("start", startDateKey);
    if (isValidKey(endDateKey)) sp.set("end", endDateKey);

    if (svc && svc !== "todos") sp.set("svc", svc);

    navigate(`/buscar?${sp.toString()}`);
  }

  return (
    <div className="bg-[#EBCBA9] min-h-screen">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div
          className="relative w-full h-[calc(100svh-48px)] sm:h-[calc(100svh-72px)]"
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
          <div className="absolute inset-0 bg-black/30" />

          <div className="absolute inset-0">
            <div className="relative w-full h-full max-w-6xl mx-auto px-6 text-center text-white">
              {/* TEXTO (mais limpo: só headline no centro) */}
              <div className="pt-2 sm:pt-3">
                <h1
                  className="font-bold text-white text-3xl leading-tight sm:text-5xl relative top-6 sm:top-5"
                  style={{ textShadow: "2px 2px 10px rgba(0,0,0,0.55)" }}
                >
                  <span className="block max-w-[26rem] mx-auto sm:max-w-none">
                    Encontre cuidadores com{" "}
                    <span className="text-white">carinho</span>,{" "}
                    <span className="text-white">segurança</span> e{" "}
                    <span className="text-yellow-400 drop-shadow-md">confiança</span>{" "}
                    para o seu pet 🐾
                  </span>
                </h1>
              </div>

              {/* BLOCO INFERIOR (onde antes ficavam os cards) */}
              <div className="absolute left-6 right-6 bottom-3">
                {/* Texto de apoio + "sem taxas" */}
                <p
                  className="mb-3 text-white/90 text-sm sm:text-base text-center"
                  style={{ textShadow: "2px 2px 10px rgba(0,0,0,0.45)" }}
                >
                  Busque por bairro/cidade, selecione as datas e o serviço — e já veja os
                  cuidadores disponíveis.{" "}
                  <span className="font-semibold text-white">
                    Sem taxas para tutores e cuidadores.
                  </span>
                </p>

                <form
                  onSubmit={handleSearchSubmit}
                  className="
                    w-full
                    rounded-2xl
                    bg-white/18
                    backdrop-blur-md
                    border border-white/20
                    shadow-lg
                    p-4 sm:p-5
                    text-left
                  "
                >
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="text-white font-semibold">Comece a buscar agora</p>

                    {/* botão "Como funciona?" maior e com destaque (vai para /sobre#como-funciona) */}
                    <Link
                      to="/sobre#como-funciona"
                      className="
                        hidden sm:inline-flex items-center justify-center
                        px-4 py-2 rounded-xl font-semibold
                        bg-[#FFD700] text-[#5A3A22]
                        shadow-md hover:brightness-105 transition
                        focus:outline-none focus:ring-2 focus:ring-white/70
                      "
                      aria-label="Ver como funciona"
                      title="Como funciona"
                    >
                      Como funciona?
                    </Link>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-5">
                      <label className="block text-[11px] text-white/85 mb-1">
                        Bairro/Cidade
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Savassi, Belo Horizonte…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="
                          w-full border border-white/25 bg-white/90
                          rounded-lg px-3 py-2 text-[#5A3A22]
                          focus:outline-none focus:ring-2 focus:ring-white/70
                        "
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] text-white/85 mb-1">Início</label>
                      <input
                        type="date"
                        value={startDateKey}
                        onChange={(e) => setStartDateKey(e.target.value)}
                        className="
                          w-full border border-white/25 bg-white/90
                          rounded-lg px-3 py-2 text-[#5A3A22]
                          focus:outline-none focus:ring-2 focus:ring-white/70
                        "
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] text-white/85 mb-1">Fim</label>
                      <input
                        type="date"
                        value={endDateKey}
                        onChange={(e) => setEndDateKey(e.target.value)}
                        className="
                          w-full border border-white/25 bg-white/90
                          rounded-lg px-3 py-2 text-[#5A3A22]
                          focus:outline-none focus:ring-2 focus:ring-white/70
                        "
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] text-white/85 mb-1">Serviço</label>
                      <select
                        value={svc}
                        onChange={(e) => setSvc(e.target.value)}
                        className="
                          w-full border border-white/25 bg-white/90
                          rounded-lg px-3 py-2 text-[#5A3A22]
                          focus:outline-none focus:ring-2 focus:ring-white/70
                        "
                      >
                        <option value="todos">Todos</option>
                        <option value="hospedagem">Hospedagem</option>
                        <option value="creche">Creche</option>
                        <option value="petSitter">Pet Sitter</option>
                        <option value="passeios">Passeios</option>
                      </select>
                    </div>

                    <div className="sm:col-span-1 flex items-end">
                      <button
                        type="submit"
                        disabled={!canSubmit}
                        className="
                          w-full
                          rounded-lg font-semibold shadow-lg transition
                          px-4 py-2
                          bg-[#95301F] hover:brightness-110 text-white
                          disabled:opacity-60 disabled:cursor-not-allowed
                          focus:outline-none focus:ring-2 focus:ring-white/70
                        "
                      >
                        Buscar
                      </button>
                    </div>
                  </div>

                  <p className="mt-2 text-[11px] text-white/80">
                    Dica: você pode preencher só “Bairro/Cidade” e buscar mesmo sem datas.
                  </p>

                  {/* ✅ Agora vira um botão discreto (transparente, estilo do card) */}
                  <div className="mt-3 flex justify-center">
                    <Link
                      to="/register"
                      className="
                        inline-flex items-center justify-center
                        px-4 py-2 rounded-xl font-semibold text-sm
                        bg-white/10 hover:bg-white/15
                        border border-white/25 text-white
                        shadow-sm transition
                        focus:outline-none focus:ring-2 focus:ring-white/70
                        backdrop-blur-sm
                      "
                    >
                      Quero me cadastrar como cuidador(a)
                    </Link>
                  </div>

                  {/* "Como funciona?" no mobile também, com destaque */}
                  <div className="mt-3 flex justify-center sm:hidden">
                    <Link
                      to="/sobre#como-funciona"
                      className="
                        inline-flex items-center justify-center
                        px-4 py-2 rounded-xl font-semibold
                        bg-[#FFD700] text-[#5A3A22]
                        shadow-md hover:brightness-105 transition
                        focus:outline-none focus:ring-2 focus:ring-white/70
                      "
                    >
                      Como funciona?
                    </Link>
                  </div>
                </form>
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
