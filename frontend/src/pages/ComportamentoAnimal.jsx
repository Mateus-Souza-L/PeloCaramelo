// src/pages/ComportamentoAnimal.jsx
import { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Instagram } from "lucide-react";
import { useToast } from "../components/ToastProvider";

export default function ComportamentoAnimal() {
  const { showToast } = useToast();
  const [openPalestra, setOpenPalestra] = useState(false);
  const dialogRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    document.title = "PeloCaramelo | Comportamento Animal";
  }, []);

  // ✅ Scroll suave ao abrir a página
  // - Se vier com hash (ex.: /comportamento#dra-laise-oliveira), rola até o elemento com offset de navbar
  // - Se não tiver hash, aplica o seu scroll "padrão" (end = 110)
  useEffect(() => {
    if (location.pathname !== "/comportamento") return;

    const NAVBAR_OFFSET = 92; // ajuste fino caso sua navbar varie (72 + margem)
    const DEFAULT_END = 160; // seu valor original

    const timeout = setTimeout(() => {
      const hash = (location.hash || "").replace("#", "").trim();

      // ✅ Se tiver hash, rola pro elemento alvo
      if (hash) {
        const el = document.getElementById(hash);
        if (el) {
          const top =
            el.getBoundingClientRect().top + window.scrollY - NAVBAR_OFFSET;

          window.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
          return;
        }
        // se não achar o elemento, cai no scroll padrão
      }

      // ✅ Scroll padrão (se não tiver hash)
      const start = window.scrollY;
      const end = DEFAULT_END;
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
          {/* LISTA */}
          <ul className="flex-1 space-y-4 leading-relaxed order-2 md:order-1 md:pr-6 text-base md:text-lg">
            <li>✅ Reforce os comportamentos corretos.</li>
            <li>❤️ Respeite os limites emocionais do pet.</li>
            <li>🧠 Evite o medo: ele não ensina.</li>
            <li>🕊️ Promova um ambiente seguro e amoroso.</li>
            <li>🎯 Antecipe situações que possam gerar estresse ou frustração.</li>
            <li>💬 Ensine comunicação clara para evitar ruídos.</li>
            <li>🌿 Cuide do bem-estar físico e mental do pet.</li>
            <li>🧩 Adapte o ambiente para facilitar o aprendizado.</li>
            <li>🤝 Priorize a cooperação, nunca a obediência forçada.</li>
          </ul>

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

          <div className="flex flex-col sm:flex-row justify-center gap-4">
            {/* WHATSAPP */}
            <a
              href="https://wa.me/5531999999999"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 bg-[#5A3A22] hover:bg-[#95301F] text-white px-6 py-3 rounded-lg font-semibold shadow-md transition"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 32 32"
                className="w-5 h-5 fill-current"
              >
                <path d="M16 .395c-8.822 0-16 7.178-16 16 0 2.822.744 5.563 2.155 7.967L0 32l8.864-2.321A15.86 15.86 0 0 0 16 32c8.822 0 16-7.178 16-16s-7.178-15.605-16-15.605zm0 29.333a13.24 13.24 0 0 1-6.76-1.844l-.489-.289-5.26 1.375 1.406-5.146-.344-.533a13.213 13.213 0 1 1 11.447 6.437zm7.036-9.51c-.385-.193-2.273-1.12-2.626-1.247-.354-.128-.611-.192-.867.193-.257.386-.994 1.247-1.219 1.503-.225.257-.45.289-.835.096-.386-.193-1.628-.6-3.104-1.918-1.147-1.013-1.92-2.267-2.146-2.632-.225-.365-.024-.6.17-.793.175-.176.386-.45.579-.676.193-.225.257-.386.386-.643.128-.257.064-.48-.032-.676-.096-.193-.867-2.08-1.2-2.859-.32-.75-.644-.643-.867-.643h-.74c-.257 0-.675.096-1.025.482-.354.386-1.353 1.32-1.353 3.219s1.386 3.736 1.578 3.993c.193.257 2.736 4.176 6.632 5.85 3.896 1.643 3.896 1.098 4.596 1.031.7-.064 2.273-.932 2.603-1.834.321-.9 .321-1.672 .225-1.834-.096-.161-.354-.257-.74-.45z" />
              </svg>
              Solicitar Pré-Consulta
            </a>

            {/* PALESTRA */}
            <button
              onClick={() => setOpenPalestra(true)}
              className="inline-flex items-center gap-2 bg-[#5A3A22] hover:bg-[#95301F] text-white px-6 py-3 rounded-lg font-semibold shadow-md transition"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="w-5 h-5 fill-current"
              >
                <path d="M2 4h20a2 2 0 012 2v12a2 2 0 01-2 2H2a2 2 0 01-2-2V6a2 2 0 012-2zm20 4l-10 6L2 8v10h20V8zm-20-2l10 6 10-6H2z" />
              </svg>
              Solicitar Orçamento de Palestra
            </button>
          </div>

          {/* FRASE FINAL DENTRO DO CARD */}
          <p className="mt-6 text-base md:text-lg font-semibold text-[#5A3A22]">
            Cuidar é também compreender 💕
          </p>
        </motion.div>
      </section>

      {/* SEÇÃO COMPLEMENTAR SOBRE A DRA. – EMPURRA O FOOTER E AGREGA CONTEÚDO */}
      <section className="pb-20 px-6">
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

      {/* MODAL */}
      <AnimatePresence>
        {openPalestra && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[999] flex items-center justify-center px-4"
            onClick={(e) =>
              e.target === e.currentTarget && setOpenPalestra(false)
            }
          >
            <motion.div
              ref={dialogRef}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-white w-full max-w-2xl rounded-2xl shadow-xl p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xl font-bold">
                  Solicitar Orçamento de Palestra
                </h4>
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
                <input
                  name="email"
                  type="email"
                  placeholder="E-mail *"
                  className="input"
                />
                <input
                  name="empresa"
                  placeholder="Empresa / Instituição"
                  className="input"
                />
                <input
                  name="cidade"
                  placeholder="Cidade / Estado"
                  className="input"
                />
                <input
                  name="publico"
                  placeholder="Público-alvo"
                  className="input sm:col-span-2"
                />
                <input
                  name="tamanho"
                  placeholder="Tamanho do público"
                  className="input"
                />
                <input
                  name="duracao"
                  placeholder="Duração desejada"
                  className="input"
                />
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
