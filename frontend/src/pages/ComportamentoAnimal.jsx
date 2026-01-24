// src/pages/ComportamentoAnimal.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Instagram, Mail } from "lucide-react";
import { useToast } from "../components/ToastProvider";
import { trackEvent } from "../utils/analytics";

const BRAND_UTM = "utm_source=pelocaramelo&utm_medium=cta&utm_campaign=comportamento";
const WHATSAPP_NUMBER = "5531999999999"; // ✅ troque aqui depois

function buildWhatsAppLink({ text, content = "hero" }) {
  const base = `https://wa.me/${WHATSAPP_NUMBER}`;
  const utm = `${BRAND_UTM}&utm_content=${encodeURIComponent(content)}`;
  const msg = `${text}\n\n(${utm})`;
  return `${base}?text=${encodeURIComponent(msg)}`;
}

const FAQ = [
  {
    q: "Como funciona a consulta comportamental?",
    a: "Você conta a rotina do pet, o que está acontecendo e recebe um plano de manejo claro, pensado para a realidade da sua casa e sem punições.",
  },
  {
    q: "É online ou presencial?",
    a: "Depende do caso e da disponibilidade. A pré-consulta serve para entender sua necessidade e indicar o melhor formato.",
  },
  {
    q: "Quanto tempo dura?",
    a: "Varia conforme o caso. Na pré-consulta você recebe uma orientação de tempo e próximos passos.",
  },
  {
    q: "Para quais situações é indicado?",
    a: "Ansiedade, medo de fogos/barulho, agressividade, destruição, latidos excessivos, adaptação a mudanças, convivência entre pets e mais.",
  },
  {
    q: "O que eu preciso preparar antes?",
    a: "Se possível, anote horários, gatilhos e rotina. Vídeos curtos do comportamento (quando seguro) ajudam bastante.",
  },
];

export default function ComportamentoAnimal() {
  const { showToast } = useToast();
  const [openPalestra, setOpenPalestra] = useState(false);
  const [faqOpen, setFaqOpen] = useState(null); // index
  const dialogRef = useRef(null);
  const location = useLocation();

  // ✅ SEO (title já existia) + description + canonical
  useEffect(() => {
    document.title = "PeloCaramelo | Comportamento Animal";

    // meta description (SPA-safe)
    const ensureMetaByName = (name) => {
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      return el;
    };

    ensureMetaByName("description").setAttribute(
      "content",
      "Comportamento animal para cães e gatos: conteúdos e consultas com abordagem positiva para melhorar rotina, reduzir ansiedade e promover bem-estar."
    );

    // canonical
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", `${window.location.origin}/comportamento`);
  }, []);

  // ✅ Schema.org (Breadcrumb + FAQPage)
  const schemaJsonLd = useMemo(() => {
    const origin = window.location.origin;
    return {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Início",
              item: `${origin}/`,
            },
            {
              "@type": "ListItem",
              position: 2,
              name: "Comportamento Animal",
              item: `${origin}/comportamento`,
            },
          ],
        },
        {
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: {
              "@type": "Answer",
              text: f.a,
            },
          })),
        },
      ],
    };
  }, []);

  // ✅ Scroll suave ao abrir a página (mantido)
  useEffect(() => {
    if (location.pathname !== "/comportamento") return;

    const NAVBAR_OFFSET = 92;
    const EXTRA_SCROLL = 120;
    const DEFAULT_END = 0;

    const timeout = setTimeout(() => {
      const hash = (location.hash || "").replace("#", "").trim();

      if (hash) {
        const el = document.getElementById(hash);
        if (el) {
          const top =
            el.getBoundingClientRect().top +
            window.scrollY -
            NAVBAR_OFFSET +
            EXTRA_SCROLL;

          window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
          return;
        }
      }

      const start = window.scrollY;
      const end = DEFAULT_END + EXTRA_SCROLL;
      const duration = 800;
      let startTime = null;

      const animateScroll = (timestamp) => {
        if (!startTime) startTime = timestamp;
        const progress = timestamp - startTime;
        const percent = Math.min(progress / duration, 1);
        const ease = 1 - Math.pow(1 - percent, 3);

        window.scrollTo(0, start + (end - start) * ease);

        if (percent < 1) requestAnimationFrame(animateScroll);
      };

      requestAnimationFrame(animateScroll);
    }, 200);

    return () => clearTimeout(timeout);
  }, [location.pathname, location.hash]);

  // 🔧 FECHAR MODAL COM ESC
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setOpenPalestra(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ✅ Links WA (com texto ajustado para "Falar com a especialista" + Extra)
  const waHeroLink = useMemo(() => {
    const txt =
      "Olá, Dra. Laíse! Vim pela PeloCaramelo e gostaria de uma orientação sobre o comportamento do meu pet. Posso te contar o caso rapidinho?";
    return buildWhatsAppLink({ text: txt, content: "hero" });
  }, []);

  const waStickyLink = useMemo(() => {
    const txt =
      "Olá, Dra. Laíse! Vim pela PeloCaramelo e gostaria de uma orientação sobre o comportamento do meu pet. Posso te contar o caso rapidinho?";
    return buildWhatsAppLink({ text: txt, content: "final" });
  }, []);

  const handleSubmitLead = (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);

    const nome = data.get("nome")?.trim();
    const email = data.get("email")?.trim();
    const tema = data.get("tema")?.trim();

    if (!nome || !email || !tema) {
      showToast("Preencha nome, e-mail e tema.", "error");
      return;
    }

    const lead = {
      id: Date.now(),
      nome,
      email,
      empresa: data.get("empresa")?.trim(),
      cidade: data.get("cidade")?.trim(),
      publico: data.get("publico")?.trim(),
      tamanho: data.get("tamanho")?.trim(),
      formato: data.get("formato") || "Presencial",
      duracao: data.get("duracao")?.trim(),
      tema,
      mensagem: data.get("mensagem")?.trim(),
      createdAt: new Date().toISOString(),
    };

    const leads = JSON.parse(localStorage.getItem("leads_palestras") || "[]");
    localStorage.setItem("leads_palestras", JSON.stringify([...leads, lead]));

    setOpenPalestra(false);
    showToast("Pedido de orçamento enviado com sucesso!", "success");
    e.target.reset();
  };

  return (
    <div className="bg-[#EBCBA9] min-h-screen text-[#5A3A22]">
      {/* ✅ SEO Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaJsonLd) }}
      />

      {/* HERO */}
      <section className="relative text-white text-center overflow-hidden">
        <img
          src="/images/hero-comportamento.jpg"
          alt="Tutor acariciando um cachorro"
          className="w-full h-[82vh] object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/25 to-transparent" />

        <div className="absolute inset-0 flex flex-col justify-center items-center px-4">
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-3xl sm:text-4xl md:text-5xl font-bold mb-3 drop-shadow-lg"
          >
            Comportamento Animal e Bem-Estar
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="text-base sm:text-lg md:text-xl max-w-3xl mx-auto leading-relaxed drop-shadow-[0_0_6px_rgba(0,0,0,0.55)]"
          >
            Na{" "}
            <span className="font-bold bg-[#5A3A22] px-2 py-0.5 rounded-md">
              <span className="text-white">Pelo</span>
              <span className="text-yellow-400">Caramelo</span>
            </span>{" "}
            acreditamos que compreender o comportamento do seu pet é o primeiro
            passo para uma convivência saudável, feliz e sem traumas.
          </motion.p>

          {/* ✅ Frase discreta no rodapé da imagem (sem atrapalhar visual) */}
          <p className="absolute bottom-6 left-0 right-0 px-4 text-[12px] sm:text-sm text-white/90 drop-shadow-[0_0_6px_rgba(0,0,0,0.55)]">
            Atendimento com abordagem positiva e orientações práticas para o seu
            dia a dia.
          </p>
        </div>
      </section>

      {/* O QUE É COMPORTAMENTO ANIMAL */}
      <section className="pt-6 pb-10 px-6 max-w-5xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, x: -15 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35 }}
          className="text-2xl md:text-3xl font-bold mb-3"
        >
          O que é comportamento animal?
        </motion.h2>

        <p className="leading-relaxed text-[15px] md:text-base text-justify">
          Cada gesto, olhar ou movimento do seu pet tem um significado. Quando
          observamos com atenção, começamos a enxergar não apenas o que ele faz,
          mas o que sente, deseja e tenta comunicar. Compreender esses sinais é
          essencial para fortalecer o vínculo de confiança, prevenir conflitos
          do dia a dia e evitar punições desnecessárias. Ao aprender sobre
          comportamento animal, o tutor passa a oferecer uma rotina mais
          previsível, respeitosa e acolhedora, onde o pet se sente seguro para
          ser ele mesmo.
        </p>
      </section>

      {/* MÉTODOS POSITIVOS */}
      <section className="bg-[#FFF8F0] py-12 px-6">
        <motion.h2
          initial={{ opacity: 0, x: -15 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35 }}
          className="text-2xl md:text-3xl font-bold mb-8 text-center"
        >
          Métodos Positivos e Respeito ao Pet 🐾
        </motion.h2>

        <div className="flex flex-col md:flex-row items-center justify-between max-w-6xl mx-auto gap-10">
          {/* ✅ bullets -> cards escaneáveis */}
          <div className="flex-1 order-2 md:order-1 md:pr-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { t: "✅ Reforço do certo", d: "Reforce os comportamentos corretos com consistência." },
                { t: "❤️ Limites emocionais", d: "Respeite o tempo e o emocional do pet." },
                { t: "🧠 Sem medo", d: "Evite punições: o medo não ensina." },
                { t: "🕊️ Ambiente seguro", d: "Rotina previsível e acolhedora reduz estresse." },
                { t: "🎯 Prevenção", d: "Antecipe situações que geram frustração." },
                { t: "💬 Comunicação clara", d: "Sinais e combinações simples evitam “ruídos”." },
                { t: "🌿 Bem-estar completo", d: "Físico e mental caminham juntos." },
                { t: "🤝 Cooperação", d: "Priorize cooperação, não obediência forçada." },
              ].map((x) => (
                <div
                  key={x.t}
                  className="rounded-2xl bg-white border border-[#5A3A22]/10 p-4 shadow-sm"
                >
                  <p className="font-extrabold text-[#5A3A22]">{x.t}</p>
                  <p className="text-sm text-[#5A3A22]/75 mt-1 leading-relaxed">
                    {x.d}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* IMAGEM */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="flex-1 flex justify-center md:justify-end"
          >
            <img
              src="/images/gato-comportamento.jpg"
              className="rounded-2xl shadow-lg w-[90%] md:w-[72%] object-cover aspect-[4/5]"
              alt="Gato calmo representando bem-estar"
            />
          </motion.div>
        </div>

        {/* CITAÇÃO */}
        <div className="max-w-[1400px] mx-auto mt-10">
          <div className="bg-white rounded-2xl shadow p-6 md:p-8 border-l-4 border-[#5A3A22] text-center">
            <blockquote className="italic font-semibold text-[#5A3A22]">
              “Educar um animal é entender que o medo não ensina. A confiança, sim.”
            </blockquote>
          </div>
        </div>
      </section>

      {/* ✅ DRA. LAÍSE – CARD PRINCIPAL (com id para âncora) */}
      <section className="py-16 px-6" id="dra-laise-oliveira">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="max-w-[1400px] mx-auto bg-white rounded-2xl shadow p-8 md:p-10 border-l-4 border-[#5A3A22] flex flex-col items-center text-center"
        >
          <img
            src="/images/laise-profile.jpg"
            className="w-44 h-44 object-cover rounded-full mb-4 border-4 border-[#D2A679]"
            alt="Foto da Dra. Laíse Oliveira"
          />

          <h3 className="text-2xl font-bold mb-2">Dra. Laíse Oliveira</h3>
          <p className="font-medium mb-4">
            Médica veterinária especializada em comportamento animal.
          </p>

          <p className="leading-relaxed mb-6 max-w-3xl">
            A Dra. Laíse atua com foco em consultas comportamentais, orientação
            para tutores e palestras sobre manejo emocional dos pets.
          </p>

          {/* INSTAGRAM DESTACADO */}
          <div className="flex justify-center items-center mb-6">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFF8F0] border border-[#D2A679]">
              <Instagram size={18} className="text-[#5A3A22]" />
              <a
                href="https://www.instagram.com/vet.laiseoliveira/"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-sm md:text-base hover:text-[#95301F]"
              >
                @vet.laiseoliveira
              </a>
            </span>
          </div>

          {/* ✅ CTA padronizada: "Falar com a especialista" + Extra */}
          <div className="flex flex-col sm:flex-row justify-center gap-4 w-full">
            <a
              href={buildWhatsAppLink({
                text:
                  "Olá, Dra. Laíse! Vim pela PeloCaramelo e gostaria de uma orientação sobre o comportamento do meu pet. Posso te contar o caso rapidinho?",
                content: "perfil",
              })}
              target="_blank"
              rel="noreferrer"
              onClick={() =>
                trackEvent("click_specialist_whatsapp", {
                  page: "comportamento",
                  position: "perfil",
                })
              }
              className="
                inline-flex items-center justify-center gap-2
                bg-[#25D366] hover:brightness-105 text-[#0b2a14]
                px-6 py-3 rounded-xl font-extrabold shadow-md transition
                focus:outline-none focus:ring-2 focus:ring-[#5A3A22]/20
              "
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 32 32"
                className="w-5 h-5 fill-current"
              >
                <path d="M16 .395c-8.822 0-16 7.178-16 16 0 2.822.744 5.563 2.155 7.967L0 32l8.864-2.321A15.86 15.86 0 0 0 16 32c8.822 0 16-7.178 16-16s-7.178-15.605-16-15.605zm0 29.333a13.24 13.24 0 0 1-6.76-1.844l-.489-.289-5.26 1.375 1.406-5.146-.344-.533a13.213 13.213 0 1 1 11.447 6.437zm7.036-9.51c-.385-.193-2.273-1.12-2.626-1.247-.354-.128-.611-.192-.867.193-.257.386-.994 1.247-1.219 1.503-.225.257-.45.289-.835.096-.386-.193-1.628-.6-3.104-1.918-1.147-1.013-1.92-2.267-2.146-2.632-.225-.365-.024-.6.17-.793.175-.176.386-.45.579-.676.193-.225.257-.386.386-.643.128-.257.064-.48-.032-.676-.096-.193-.867-2.08-1.2-2.859-.32-.75-.644-.643-.867-.643h-.74c-.257 0-.675.096-1.025.482-.354.386-1.353 1.32-1.353 3.219s1.386 3.736 1.578 3.993c.193.257 2.736 4.176 6.632 5.85 3.896 1.643 3.896 1.098 4.596 1.031.7-.064 2.273-.932 2.603-1.834.321-.9 .321-1.672 .225-1.834-.096-.161-.354-.257-.74-.45z" />
              </svg>
              Falar com a especialista
            </a>

            {/* ✅ mantém tamanho / só adiciona ícone de e-mail no início */}
            <button
              onClick={() => setOpenPalestra(true)}
              className="
                inline-flex items-center justify-center gap-2
                bg-[#5A3A22] hover:bg-[#95301F] text-white
                px-6 py-3 rounded-xl font-semibold shadow-md transition
              "
            >
              <Mail size={18} className="text-white" />
              Solicitar Orçamento de Palestra
            </button>
          </div>

          {/* ✅ faixa de preço / expectativa */}
          <p className="mt-4 text-sm text-[#5A3A22]/80 max-w-3xl">
            💰 <span className="font-semibold">Expectativa de valor:</span>{" "}
            o valor é alinhado conforme o caso, a rotina da família e a complexidade do acompanhamento.
          </p>

          <p className="mt-6 text-base md:text-lg font-semibold text-[#5A3A22]">
            Cuidar é também compreender 💕
          </p>
        </motion.div>
      </section>

      {/* SEÇÃO COMPLEMENTAR */}
      <section className="pb-10 px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-[1400px] mx-auto bg-white rounded-2xl shadow p-6 md:p-8 border-l-4 border-[#D2A679] grid md:grid-cols-2 gap-6"
        >
          <div>
            <h4 className="text-lg font-semibold mb-2 flex items-center gap-2">
              Quando procurar uma consulta comportamental? 🐾
            </h4>
            <ul className="list-disc pl-5 space-y-1 text-sm md:text-base leading-relaxed">
              <li>Medo excessivo, insegurança ou dificuldade de adaptação.</li>
              <li>Latidos, destruição ou agitação fora do normal.</li>
              <li>Dificuldade em ficar sozinho ou mudanças recentes na rotina.</li>
              <li>Convivência difícil entre pets ou entre pet e família.</li>
            </ul>
          </div>

          <div>
            <h4 className="text-lg font-semibold mb-2 flex items-center gap-2">
              O que você pode esperar do atendimento 💬
            </h4>
            <ul className="list-disc pl-5 space-y-1 text-sm md:text-base leading-relaxed">
              <li>Escuta atenta da história do pet e da família.</li>
              <li>Explicações claras sobre o comportamento observado.</li>
              <li>Plano de manejo personalizado, respeitando a rotina da casa.</li>
              <li>Apoio para que o tutor se sinta mais seguro nas próximas etapas.</li>
            </ul>
          </div>
        </motion.div>
      </section>

      {/* ✅ MINI-FAQ (somente dúvidas fixas) */}
      <section className="pb-24 px-6">
        <div className="max-w-[1400px] mx-auto bg-white rounded-2xl shadow p-6 md:p-8 border-l-4 border-[#FFD700]/80">
          <div className="mb-5">
            <h4 className="text-xl font-extrabold">Dúvidas rápidas</h4>
          </div>

          <div className="space-y-3">
            {FAQ.map((item, idx) => {
              const open = faqOpen === idx;
              return (
                <div
                  key={item.q}
                  className="rounded-2xl border border-[#5A3A22]/10 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setFaqOpen(open ? null : idx)}
                    className="
                      w-full text-left
                      px-4 py-4
                      bg-[#FFF8F0] hover:brightness-105 transition
                      flex items-center justify-between gap-3
                    "
                    aria-expanded={open}
                  >
                    <span className="font-bold text-[#5A3A22]">{item.q}</span>
                    <span className="text-[#5A3A22]/70 font-bold">
                      {open ? "−" : "+"}
                    </span>
                  </button>

                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="px-4"
                      >
                        <p className="py-4 text-sm md:text-base text-[#5A3A22]/85 leading-relaxed">
                          {item.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ✅ CTA final (simples e forte) */}
      <div className="px-6 pb-8">
        <div className="max-w-[1400px] mx-auto rounded-2xl bg-[#5A3A22] text-white p-6 md:p-8 shadow-lg flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-lg md:text-xl font-extrabold">
              Quer ajuda com o comportamento do seu pet?
            </p>
            <p className="text-sm text-white/85 mt-1">
              Clique e fale com a especialista no WhatsApp. Mensagem pronta e rastreável.
            </p>
          </div>

          <a
            href={waStickyLink}
            target="_blank"
            rel="noreferrer"
            onClick={() =>
              trackEvent("click_specialist_whatsapp", {
                page: "comportamento",
                position: "final",
              })
            }
            className="
              inline-flex items-center justify-center gap-2
              bg-[#FFD700] text-[#5A3A22]
              px-5 py-3 rounded-xl font-extrabold
              shadow-md hover:brightness-105 transition
              focus:outline-none focus:ring-2 focus:ring-white/70
              w-full md:w-auto
            "
          >
            Falar com a especialista
          </a>
        </div>
      </div>

      {/* MODAL */}
      <AnimatePresence>
        {openPalestra && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            // ✅ MOBILE: overlay rola + alinha no topo (não "estoura" tela)
            // ✅ WEB: mantém centralizado como já estava
            className="
              fixed inset-0 bg-black/50 z-[999]
              flex items-start sm:items-center justify-center
              px-4 py-6 sm:py-0
              overflow-y-auto
            "
            onClick={(e) => e.target === e.currentTarget && setOpenPalestra(false)}
          >
            <motion.div
              ref={dialogRef}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              // ✅ MOBILE: altura máxima + scroll interno
              // ✅ WEB: volta ao normal (sem max-height / sem scroll)
              className="
                bg-white w-full max-w-2xl rounded-2xl shadow-xl
                p-4 sm:p-6
                my-0 sm:my-0
                max-h-[calc(100vh-3rem)] overflow-y-auto
                sm:max-h-none sm:overflow-visible
              "
            >
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xl font-bold">Solicitar Orçamento de Palestra</h4>
                <button
                  onClick={() => setOpenPalestra(false)}
                  className="text-[#5A3A22]/70 hover:text-[#5A3A22] text-xl font-bold"
                >
                  ×
                </button>
              </div>

              <form
                onSubmit={handleSubmitLead}
                className="grid grid-cols-1 sm:grid-cols-2 gap-4"
              >
                <input name="nome" placeholder="Nome completo *" className="input" />
                <input name="email" type="email" placeholder="E-mail *" className="input" />
                <input name="empresa" placeholder="Empresa / Instituição" className="input" />
                <input name="cidade" placeholder="Cidade / Estado" className="input" />
                <input
                  name="publico"
                  placeholder="Público-alvo"
                  className="input sm:col-span-2"
                />
                <input name="tamanho" placeholder="Tamanho do público" className="input" />
                <input name="duracao" placeholder="Duração desejada" className="input" />
                <select name="formato" className="input">
                  <option>Presencial</option>
                  <option>Online</option>
                  <option>Híbrido</option>
                </select>
                <input
                  name="tema"
                  placeholder="Tema principal *"
                  className="input sm:col-span-2"
                />
                <textarea
                  name="mensagem"
                  rows={4}
                  placeholder="Observações / mensagem"
                  className="textarea sm:col-span-2"
                />

                <div className="sm:col-span-2 flex justify-end gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => setOpenPalestra(false)}
                    className="px-5 py-2 bg-gray-300 rounded-lg font-semibold text-[#5A3A22] hover:bg-gray-400"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[#5A3A22] text-white rounded-lg font-semibold shadow-md hover:bg-[#95301F]"
                  >
                    Enviar pedido
                  </button>
                </div>
              </form>

              <p className="mt-4 text-[12px] text-[#5A3A22]/70">
                Dica: esses pedidos ficam salvos em{" "}
                <span className="font-semibold">localStorage</span> (leads_palestras).
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
