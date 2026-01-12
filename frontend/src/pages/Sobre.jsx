// src/pages/Sobre.jsx
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";

export default function Sobre() {
  const location = useLocation();

  // Scroll suave ao acessar a página /sobre
  useEffect(() => {
    if (location.pathname === "/sobre") {
      const timeout = setTimeout(() => {
        const start = window.scrollY;
        const end = 90;
        const duration = 800;
        let startTime = null;

        const animate = (timestamp) => {
          if (!startTime) startTime = timestamp;
          const progress = timestamp - startTime;
          const percent = Math.min(progress / duration, 1);
          const ease = 1 - Math.pow(1 - percent, 3);

          window.scrollTo(0, start + (end - start) * ease);

          if (percent < 1) requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
      }, 200);

      return () => clearTimeout(timeout);
    }
  }, [location.pathname]);

  // Animação padrão para os cards
  const cardMotion = {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    transition: { duration: 0.5 },
    viewport: { once: true, amount: 0.2 },
  };

  return (
    <div className="bg-[#EBCBA9] min-h-[calc(100vh-120px)] py-8 px-6">
      {/* CARD BRANCO PRINCIPAL */}
      <div className="max-w-[1400px] mx-auto bg-white rounded-2xl shadow p-6 md:p-8 border-l-4 border-[#5A3A22]">
        {/* Título */}
        <h1 className="text-2xl md:text-3xl font-bold text-[#5A3A22] mb-4 text-center">
          Sobre a PeloCaramelo
        </h1>

        {/* Texto inicial */}
        <p className="text-[#5A3A22] mb-4 leading-relaxed text-[15px] md:text-base">
          A PeloCaramelo nasceu com uma ideia simples: ajudar tutores e
          cuidadores a se encontrarem de maneira leve, clara e sem
          complicações. Sabemos como pode ser difícil confiar o cuidado de um
          pet a alguém e também entendemos que muitos cuidadores têm dificuldade
          de alcançar famílias que realmente precisam deles.
        </p>

        <p className="text-[#5A3A22] mb-4 leading-relaxed text-[15px] md:text-base">
          Por isso escolhemos seguir um caminho diferente.{" "}
          <strong>
            A plataforma não cobra taxas, porcentagens ou comissões sobre os
            serviços prestados.
          </strong>{" "}
          O valor combinado acontece diretamente entre tutor e cuidador, com
          liberdade para conversarem e ajustarem o que for melhor para os dois.
        </p>

        <p className="text-[#5A3A22] mb-2 leading-relaxed text-[15px] md:text-base">
          Para manter o projeto vivo e em evolução, usamos outras formas de
          monetização, como publicidade e parcerias. Assim, conseguimos cuidar
          da sustentabilidade da plataforma sem transformar cada reserva em uma
          cobrança extra.
        </p>

        {/* CONJUNTO DE CARDS */}
        <div className="mt-8 space-y-8 md:space-y-10">
          {/* BLOCO 1 – Nossa missão */}
          <motion.section
            className="pc-card pc-card-accent border-l-4 border-[#5A3A22]"
            {...cardMotion}
          >
            <div className="flex flex-col md:flex-row items-center gap-6">
              {/* Texto */}
              <div className="flex-1 order-2 md:order-1">
                <h2 className="text-lg font-semibold text-[#5A3A22] mb-2 flex items-center gap-2">
                  Nossa missão <span className="text-xl">💛</span>
                </h2>
                <p className="text-[#5A3A22] leading-relaxed text-sm md:text-base">
                  Aproximar pessoas que cuidam com carinho. Tornar a busca por
                  cuidadores mais humana, acessível e transparente, fortalecendo
                  relações de confiança entre famílias e quem se dedica a cuidar
                  dos pets.
                </p>
              </div>

              {/* Imagem */}
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
          <motion.section
            className="pc-card mb-8 border-r-4 border-[#5A3A22]"
            {...cardMotion}
          >
            <div className="flex flex-col md:flex-row items-center gap-6">
              {/* Imagem */}
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

              {/* Texto */}
              <div className="flex-1 order-2 md:order-2">
                <h2 className="text-lg font-semibold text-[#5A3A22] mb-2 flex items-center gap-2">
                  Como ajudamos <span className="text-xl">🐾</span>
                </h2>
                <ul className="list-disc pl-5 space-y-1 text-[#5A3A22] text-sm md:text-base leading-relaxed">
                  <li>Busca facilitada por cidade, região ou tipo de serviço.</li>
                  <li>
                    Informações claras sobre valores, rotina e perfil do cuidador.
                  </li>
                  <li>Calendário atualizado diretamente pelo cuidador.</li>
                  <li>
                    Comunicação direta para alinhar expectativas e combinar os
                    detalhes do cuidado.
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
              {/* Texto */}
              <div className="flex-1 order-2 md:order-1">
                <h2 className="text-lg font-semibold text-[#5A3A22] mb-2 flex items-center gap-2">
                  Nosso compromisso com o bem-estar animal{" "}
                  <span className="text-xl">🌿</span>
                </h2>
                <p className="text-[#5A3A22] leading-relaxed text-sm md:text-base">
                  Acreditamos na educação baseada em respeito, confiança e
                  métodos positivos. O objetivo é que cada experiência seja
                  segura, leve e acolhedora para o pet, para o tutor e para quem
                  cuida. Buscamos apoiar escolhas mais conscientes e rotinas que
                  respeitam o tempo e a personalidade de cada animal.
                </p>
              </div>

              {/* Imagem */}
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
          <motion.section
            className="pc-card border-r-4 border-[#5A3A22]"
            {...cardMotion}
          >
            <h2 className="text-lg font-semibold text-[#5A3A22] mb-2 flex items-center gap-2 justify-center text-center">
              Relação entre tutor e cuidador <span className="text-xl">🤝</span>
            </h2>
            <p className="text-[#5A3A22] leading-relaxed text-sm md:text-base">
              A plataforma não participa das negociações ou pagamentos. Tudo é
              combinado diretamente entre tutor e cuidador, de acordo com a
              realidade de cada um. Mesmo assim, incentivamos combinados claros,
              diálogo aberto e respeito em todas as etapas, para que a experiência
              seja positiva para quem contrata, para quem cuida e, principalmente,
              para o pet.
            </p>
          </motion.section>
        </div>
      </div>

      {/* FAIXA FINAL COM CTA */}
      <section className="max-w-[1400px] mx-auto mt-8 bg-[#5A3A22] text-white py-10 px-6 rounded-2xl text-center shadow">
        <h2 className="text-2xl md:text-3xl font-bold mb-3">
          Pronto para encontrar um cuidador?
        </h2>
        <p className="max-w-2xl mx-auto mb-6 text-base md:text-lg leading-relaxed">
          Comece explorando perfis de cuidadores próximos a você e encontre
          alguém que combine com o jeito e as necessidades do seu pet.
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
