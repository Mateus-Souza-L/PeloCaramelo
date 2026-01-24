// src/pages/PoliticaPrivacidade.jsx
import ScrollLink from "../components/ScrollLink";

export default function PoliticaPrivacidade() {
  return (
    <main className="min-h-[70vh] bg-[#fffaf2]">
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <header className="mb-6">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#5A3A22]">
            Política de Privacidade
          </h1>
          <p className="mt-2 text-sm text-[#5A3A22]/80">
            Última atualização: {new Date().toLocaleDateString("pt-BR")}
          </p>
        </header>

        <div className="bg-white rounded-2xl shadow-sm border border-[#EBCBA9] p-5 sm:p-7 space-y-6 text-[#5A3A22]">
          <p className="leading-relaxed">
            A <strong>PeloCaramelo</strong> valoriza sua privacidade. Esta Política
            explica, de forma simples, quais dados coletamos, por que coletamos e
            como você pode exercer seus direitos conforme a <strong>LGPD</strong>{" "}
            (Lei Geral de Proteção de Dados – Lei 13.709/2018).
          </p>

          <div className="space-y-3">
            <h2 className="text-xl font-bold">1. Quem somos</h2>
            <p className="leading-relaxed">
              A PeloCaramelo é uma plataforma que conecta <strong>Tutores</strong>{" "}
              (responsáveis pelos pets) e <strong>Cuidadores</strong> (prestadores de
              serviço). Nosso objetivo é facilitar a comunicação e organização de
              reservas, com mais segurança e transparência.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold">2. Quais dados coletamos</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Dados de cadastro:</strong> nome, e-mail, senha (armazenada
                de forma criptografada/segura).
              </li>
              <li>
                <strong>Dados de contato:</strong> telefone (podendo ser exibido de
                forma mascarada em certas telas).
              </li>
              <li>
                <strong>Dados do pet:</strong> nome, espécie, idade e informações que
                você optar por inserir (ex.: observações de comportamento).
              </li>
              <li>
                <strong>Dados de uso:</strong> informações necessárias para o
                funcionamento do app (ex.: reservas, mensagens, avaliações).
              </li>
              <li>
                <strong>Dados técnicos:</strong> logs básicos para segurança e
                estabilidade (ex.: data/hora de acesso, falhas e eventos de sistema).
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold">3. Para que usamos seus dados</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Criar e gerenciar sua conta.</li>
              <li>Permitir buscas, reservas e comunicação entre Tutor e Cuidador.</li>
              <li>Prevenir fraudes, abusos e aumentar a segurança da plataforma.</li>
              <li>Atender solicitações e suporte.</li>
              <li>Melhorar a experiência e o desempenho do sistema.</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold">4. Base legal (LGPD)</h2>
            <p className="leading-relaxed">
              Tratamos dados principalmente para <strong>execução de contrato</strong>{" "}
              (para entregar o serviço), <strong>legítimo interesse</strong>{" "}
              (segurança e melhorias) e <strong>cumprimento de obrigação legal</strong>{" "}
              quando aplicável.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold">5. Compartilhamento de dados</h2>
            <p className="leading-relaxed">
              Compartilhamos apenas o necessário para a prestação do serviço:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                Entre <strong>Tutor</strong> e <strong>Cuidador</strong>, em contexto
                de reserva e comunicação.
              </li>
              <li>
                Com provedores de infraestrutura/serviços (ex.: hospedagem, banco de
                dados), apenas para operar a plataforma.
              </li>
            </ul>
            <p className="leading-relaxed">
              Não vendemos seus dados.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold">6. Armazenamento e segurança</h2>
            <p className="leading-relaxed">
              Aplicamos medidas técnicas e organizacionais para proteger seus dados
              (ex.: controle de acesso, autenticação e boas práticas de segurança).
              Ainda assim, nenhum sistema é 100% infalível. Se identificarmos um
              incidente relevante, tomaremos medidas para mitigar impactos.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold">7. Retenção</h2>
            <p className="leading-relaxed">
              Mantemos os dados pelo tempo necessário para cumprir as finalidades
              desta Política, atender exigências legais e garantir segurança da
              plataforma. Você pode solicitar exclusão quando aplicável.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold">8. Seus direitos (LGPD)</h2>
            <p className="leading-relaxed">
              Você pode solicitar: confirmação de tratamento, acesso, correção,
              anonimização, portabilidade (quando aplicável), revogação de
              consentimento (quando usado) e exclusão de dados, respeitadas obrigações
              legais e limites técnicos.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold">9. Cookies e rastreamento</h2>
            <p className="leading-relaxed">
              A PeloCaramelo pode usar cookies <strong>essenciais</strong> para
              funcionamento (ex.: sessão e preferências). Caso sejam ativadas
              ferramentas de rastreamento/marketing (ex.: Analytics), você será
              informado(a) e poderá gerenciar suas preferências conforme disponibilizado.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold">10. Como falar com a gente</h2>
            <p className="leading-relaxed">
              Para dúvidas ou solicitações sobre privacidade, fale conosco:
            </p>
            <div className="bg-[#fffaf2] border border-[#EBCBA9] rounded-xl p-4">
              <p className="font-semibold">E-mail:</p>
              <p className="opacity-90">contato@pelocaramelo.com.br</p>
            </div>
          </div>

          <div className="pt-2">
            <ScrollLink
              to="/"
              className="inline-flex items-center gap-2 text-[#95301F] font-bold hover:opacity-90 transition"
            >
              ← Voltar para a Home
            </ScrollLink>
          </div>
        </div>
      </section>
    </main>
  );
}
