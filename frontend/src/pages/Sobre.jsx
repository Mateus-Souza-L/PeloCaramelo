// src/pages/Sobre.jsx
import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";

function prefersReducedMotion() {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  } catch {
    return false;
  }
}

// ✅ MOBILE detect (não afeta web)
function isMobile() {
  try {
    return window.matchMedia?.("(max-width: 639px)")?.matches === true; // < sm
  } catch {
    return false;
  }
}

function getNavbarOffsetPx() {
  // tenta achar algo do tipo navbar/header/nav e pega a altura real
  const nav =
    document.querySelector("header") ||
    document.querySelector("nav") ||
    document.getElementById("navbar");

  const h = nav?.getBoundingClientRect?.().height;
  const safe = Number.isFinite(h) && h > 40 ? h : 90;

  // folga extra pra não “colar” no topo
  return Math.round(safe + 115);
}

// ✅ MANTIDO como estava “na prática” no seu código atual:
// (o retorno efetivo era safe + 215)
// Isso garante que o WEB não muda.
function getNavbarOnlyOffsetPx() {
  const nav =
    document.querySelector("header") ||
    document.querySelector("nav") ||
    document.getElementById("navbar");

  const h = nav?.getBoundingClientRect?.().height;
  const safe = Number.isFinite(h) && h > 40 ? h : 90;

  // apenas navbar + uma folga mínima (no seu código anterior estava 215)
  return Math.round(safe + 215);
}

// ✅ Alterado: agora dá pra escolher o tipo de offset
function scrollToId(id, mode = "full") {
  const el = document.getElementById(id);
  if (!el) return false;

  const offset = mode === "navbarOnly" ? getNavbarOnlyOffsetPx() : getNavbarOffsetPx();
  const y = el.getBoundingClientRect().top + window.scrollY - offset;

  window.scrollTo({
    top: Math.max(0, y),
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });

  return true;
}

export default function Sobre() {
  const location = useLocation();

  // FAQ (visível) + Schema.org (SEO)
  const faqs = useMemo(
    () => [
      {
        q: "O PeloCaramelo cobra taxas para tutores e cuidadores?",
        a: "Não. No momento, não há taxas para tutores nem para cuidadores. Você pode buscar e entrar em contato pela plataforma sem cobranças.",
      },
      {
        q: "Como encontro cuidadores disponíveis?",
        a: "Na busca, informe bairro/cidade e, se quiser, selecione as datas e o serviço (hospedagem, creche, pet sitter ou passeios). Você verá os cuidadores disponíveis.",
      },
      {
        q: "Quais serviços posso encontrar no PeloCaramelo?",
        a: "Você encontra opções de hospedagem, creche, pet sitter e passeios. A disponibilidade e detalhes variam por cuidador.",
      },
      {
        q: "Como funciona a segurança e a confiança na plataforma?",
        a: "A plataforma organiza perfis e informações do cuidador para ajudar você a escolher com clareza. Além disso, o objetivo é manter a comunicação e o fluxo dentro do PeloCaramelo.",
      },
    ],
    []
  );

  const faqJsonLd = useMemo(() => {
    return {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((x) => ({
        "@type": "Question",
        name: x.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: x.a,
        },
      })),
    };
  }, [faqs]);

  // ✅ Scroll suave ao acessar /sobre
  // - com hash (#faq / #como-funciona): rola para a âncora
  //   ✅ MOBILE: #como-funciona -> vai pro TOPO (pra mostrar o título "Sobre a PeloCaramelo")
  //   ✅ WEB: mantém exatamente como já estava (navbarOnly com offset antigo)
  // - sem hash: mantém o comportamento atual
  useEffect(() => {
    if (location.pathname !== "/sobre") return;

    const hash = String(location.hash || "").trim();
    const targetId = hash ? hash.replace("#", "") : "";

    let raf = 0;
    let tries = 0;

    const run = () => {
      tries += 1;

      if (targetId) {
        // ✅ ALTERAÇÃO SOMENTE NO MOBILE:
        // quando vem da Home em /sobre#como-funciona, queremos ver o título no topo.
        if (isMobile() && targetId === "como-funciona") {
          window.scrollTo({
            top: 0,
            behavior: prefersReducedMotion() ? "auto" : "smooth",
          });
          if (tries >= 2) return;
        } else {
          // ✅ WEB permanece igual ao seu atual
          const mode = targetId === "como-funciona" ? "navbarOnly" : "full";
          const ok = scrollToId(targetId, mode);
          if (ok && tries >= 3) return;
        }
      } else {
        // comportamento original: “descer” um pouco
        const offset = getNavbarOffsetPx();
        window.scrollTo({
          top: Math.max(0, offset - 115),
          behavior: prefersReducedMotion() ? "auto" : "smooth",
        });
        if (tries >= 2) return;
      }

      if (tries < 8) raf = requestAnimationFrame(run);
    };

    const t = setTimeout(() => {
      raf = requestAnimationFrame(run);
    }, 80);

    return () => {
      clearTimeout(t);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [location.pathname, location.hash]);

  // Animação padrão para os cards
  const cardMotion = {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    transition: { duration: 0.5 },
    viewport: { once: true, amount: 0.2 },
  };

  return (
    <div className="bg-[#EBCBA9] min-h-[calc(100vh-120px)] py-8 px-6">
      {/* ✅ Schema.org FAQ (JSON-LD) */}
      <script
        type="application/ld+json"
        include=""
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* CARD BRANCO PRINCIPAL */}
      <div className="max-w-[1400px] mx-auto bg-white rounded-2xl shadow p-6 md:p-8 border-l-4 border-[#5A3A22]">
        {/* Título */}
        <h1 className="text-2xl md:text-3xl font-bold text-[#5A3A22] mb-4 text-center">
          Sobre a PeloCaramelo
        </h1>

        {/* Texto inicial */}
        <p className="text-[#5A3A22] mb-4 leading-relaxed text-[15px] md:text-base">
          A PeloCaramelo nasceu com uma ideia simples: ajudar tutores e cuidadores a se
          encontrarem de maneira leve, clara e sem complicações. Sabemos como pode ser
          difícil confiar o cuidado de um pet a alguém e também entendemos que muitos
          cuidadores têm dificuldade de alcançar famílias que realmente precisam deles.
        </p>

        <p className="text-[#5A3A22] mb-4 leading-relaxed text-[15px] md:text-base">
          Por isso escolhemos seguir um caminho diferente.{" "}
          <strong>
            A plataforma não cobra taxas, porcentagens ou comissões sobre os serviços
            prestados.
          </strong>{" "}
          O valor combinado acontece diretamente entre tutor e cuidador, com liberdade
          para conversarem e ajustarem o que for melhor para os dois.
        </p>

        <p className="text-[#5A3A22] mb-2 leading-relaxed text-[15px] md:text-base">
          Para manter o projeto vivo e em evolução, usamos outras formas de monetização,
          como publicidade e parcerias. Assim, conseguimos cuidar da sustentabilidade da
          plataforma sem transformar cada reserva em uma cobrança extra.
        </p>

        {/* ✅ Âncora: Como funciona (para /sobre#como-funciona) */}
        <div id="como-funciona" className="scroll-mt-28" />

        {/* CONJUNTO DE CARDS */}
        <div className="mt-8 space-y-8 md:space-y-10">
          {/* BLOCO 1 – Nossa missão */}
          <motion.section
            className="pc-card pc-card-accent border-l-4 border-[#5A3A22]"
            {...cardMotion}
          >
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="flex-1 order-2 md:order-1">
                <h2 className="text-lg font-semibold text-[#5A3A22] mb-2 flex items-center gap-2">
                  Nossa missão <span className="text-xl">💛</span>
                </h2>
                <p className="text-[#5A3A22] leading-relaxed text-sm md:text-base">
                  Aproximar pessoas que cuidam com carinho. Tornar a busca por cuidadores
                  mais humana, acessível e transparente, fortalecendo relações de
                  confiança entre famílias e quem se dedica a cuidar dos pets.
                </p>
              </div>

              <motion.div
                className="flex-1 order-1 md:order-2 flex justify-center"
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6 }}
                viewport={{ once: true, amount: 0.2 }}
              >
                <img
                  src="/images/sobre-1.jpg"
                  alt="Pessoa acariciando um cachorro feliz"
                  className="rounded-2xl shadow-md w-full max-w-md object-cover aspect-[4/3]"
                />
              </motion.div>
            </div>
          </motion.section>

          {/* BLOCO 2 – Como ajudamos */}
          <motion.section className="pc-card mb-8 border-r-4 border-[#5A3A22]" {...cardMotion}>
            <div className="flex flex-col md:flex-row items-center gap-6">
              <motion.div
                className="flex-1 order-1 md:order-1 flex justify-center"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6 }}
                viewport={{ once: true, amount: 0.2 }}
              >
                <img
                  src="/images/sobre-2.jpg"
                  alt="Cuidadora sorrindo enquanto brinca com um pet"
                  className="rounded-2xl shadow-md w-full max-w-md object-cover aspect-[4/3]"
                />
              </motion.div>

              <div className="flex-1 order-2 md:order-2">
                <h2 className="text-lg font-semibold text-[#5A3A22] mb-2 flex items-center gap-2">
                  Como ajudamos <span className="text-xl">🐾</span>
                </h2>
                <ul className="list-disc pl-5 space-y-1 text-[#5A3A22] text-sm md:text-base leading-relaxed">
                  <li>Busca facilitada por cidade, região ou tipo de serviço.</li>
                  <li>Informações claras sobre valores, rotina e perfil do cuidador.</li>
                  <li>Calendário atualizado diretamente pelo cuidador.</li>
                  <li>
                    Comunicação direta para alinhar expectativas e combinar os detalhes do
                    cuidado.
                  </li>
                </ul>
              </div>
            </div>
          </motion.section>

          {/* BLOCO 3 – Nosso compromisso */}
          <motion.section
            className="pc-card pc-card-accent border-l-4 border-[#D2A679]"
            {...cardMotion}
          >
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="flex-1 order-2 md:order-1">
                <h2 className="text-lg font-semibold text-[#5A3A22] mb-2 flex items-center gap-2">
                  Nosso compromisso com o bem-estar animal{" "}
                  <span className="text-xl">🌿</span>
                </h2>
                <p className="text-[#5A3A22] leading-relaxed text-sm md:text-base">
                  Acreditamos na educação baseada em respeito, confiança e métodos
                  positivos. O objetivo é que cada experiência seja segura, leve e
                  acolhedora para o pet, para o tutor e para quem cuida. Buscamos apoiar
                  escolhas mais conscientes e rotinas que respeitam o tempo e a
                  personalidade de cada animal.
                </p>
              </div>

              <motion.div
                className="flex-1 order-1 md:order-2 flex justify-center"
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6 }}
                viewport={{ once: true, amount: 0.2 }}
              >
                <img
                  src="/images/sobre-3.jpg"
                  alt="Pet tranquilo descansando ao lado de seu cuidador"
                  className="rounded-2xl shadow-md w-full max-w-md object-cover aspect-[4/3]"
                />
              </motion.div>
            </div>
          </motion.section>

          {/* BLOCO 4 – Relação tutor/cuidador */}
          <motion.section className="pc-card border-r-4 border-[#5A3A22]" {...cardMotion}>
            <h2 className="text-lg font-semibold text-[#5A3A22] mb-2 flex items-center gap-2 justify-center text-center">
              Relação entre tutor e cuidador <span className="text-xl">🤝</span>
            </h2>
            <p className="text-[#5A3A22] leading-relaxed text-sm md:text-base">
              A plataforma não participa das negociações ou pagamentos. Tudo é combinado
              diretamente entre tutor e cuidador, de acordo com a realidade de cada um.
              Mesmo assim, incentivamos combinados claros, diálogo aberto e respeito em
              todas as etapas, para que a experiência seja positiva para quem contrata,
              para quem cuida e, principalmente, para o pet.
            </p>
          </motion.section>

          {/* ✅ Âncora FAQ (para /sobre#faq) */}
          <div id="faq" className="scroll-mt-28" />

          {/* ✅ FAQ NO FINAL */}
          <motion.section
            className="pc-card pc-card-accent border-l-4 border-[#FFD700]"
            {...cardMotion}
          >
            <h2 className="text-lg font-semibold text-[#5A3A22] mb-2 flex items-center gap-2 justify-center text-center">
              Perguntas frequentes <span className="text-xl">❓</span>
            </h2>

            <p className="text-[#5A3A22]/80 text-sm md:text-base text-center mb-6">
              Respostas rápidas para você começar a usar o PeloCaramelo com confiança.
            </p>

            <div className="space-y-4">
              {faqs.map((x) => (
                <details
                  key={x.q}
                  className="group rounded-xl bg-white border border-[#5A3A22]/10 p-4"
                >
                  <summary className="cursor-pointer list-none flex items-start justify-between gap-3">
                    <span className="font-semibold text-[#5A3A22]">{x.q}</span>
                    <span className="text-[#5A3A22]/70 group-open:rotate-180 transition">
                      ▼
                    </span>
                  </summary>
                  <p className="mt-2 text-[#5A3A22]/80 leading-relaxed">{x.a}</p>
                </details>
              ))}
            </div>

            <div className="mt-6 flex justify-center">
              <a
                href="/buscar"
                className="
                  inline-flex items-center justify-center
                  px-6 py-3 rounded-xl font-semibold
                  bg-[#95301F] hover:brightness-110 text-white
                  shadow-md transition
                  focus:outline-none focus:ring-2 focus:ring-[#95301F]/40
                "
              >
                Ir para a busca
              </a>
            </div>
          </motion.section>
        </div>
      </div>

      {/* FAIXA FINAL COM CTA */}
      <section className="max-w-[1400px] mx-auto mt-8 bg-[#5A3A22] text-white py-10 px-6 rounded-2xl text-center shadow">
        <h2 className="text-2xl md:text-3xl font-bold mb-3">
          Pronto para encontrar um cuidador?
        </h2>
        <p className="max-w-2xl mx-auto mb-6 text-base md:text-lg leading-relaxed">
          Comece explorando perfis de cuidadores próximos a você e encontre alguém que
          combine com o jeito e as necessidades do seu pet.
        </p>
        <a
          href="/buscar"
          className="inline-block bg-[#C48B52] hover:bg-[#B37343] text-white px-6 py-3 rounded-lg font-semibold shadow-md transition"
        >
          Buscar cuidadores
        </a>
      </section>
    </div>
  );
}
