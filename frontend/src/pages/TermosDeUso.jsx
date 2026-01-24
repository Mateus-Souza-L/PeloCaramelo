// src/pages/TermosDeUso.jsx
import ScrollLink from "../components/ScrollLink";

export default function TermosDeUso() {
  return (
    <main className="min-h-[70vh] bg-[#fffaf2]">
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <header className="mb-6">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#5A3A22]">
            Termos de Uso
          </h1>
          <p className="mt-2 text-sm text-[#5A3A22]/80">
            Última atualização: {new Date().toLocaleDateString("pt-BR")}
          </p>
        </header>

        <div className="bg-white rounded-2xl shadow-sm border border-[#EBCBA9] p-5 sm:p-7 space-y-6 text-[#5A3A22]">
          <p className="leading-relaxed">
            Ao acessar ou usar a <strong>PeloCaramelo</strong>, você concorda com
            estes Termos. Se não concordar, não utilize a plataforma.
          </p>

          <div className="space-y-3">
            <h2 className="text-xl font-bold">1. O que é a PeloCaramelo</h2>
            <p className="leading-relaxed">
              Somos uma plataforma de conexão entre <strong>Tutores</strong> e{" "}
              <strong>Cuidadores</strong>. A PeloCaramelo oferece ferramentas para
              busca, comunicação, reservas e avaliações, mas{" "}
              <strong>não garante</strong> a execução do serviço por terceiros e{" "}
              <strong>não se responsabiliza</strong> por acordos externos que fujam do
              escopo da plataforma.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold">2. Cadastro e conta</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Você deve fornecer informações verdadeiras e atualizadas.</li>
              <li>Você é responsável por manter a confidencialidade da sua senha.</li>
              <li>
                Podemos suspender/encerrar contas em caso de fraude, abuso, violação
                destes Termos ou risco à comunidade.
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold">3. Regras de uso</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                É proibido usar a plataforma para fins ilegais, ofensivos ou
                discriminatórios.
              </li>
              <li>
                É proibido tentar burlar mecanismos de segurança (ex.: mascaramento de
                telefone, limitações de contato, etc.).
              </li>
              <li>
                Conteúdos enviados (mensagens, descrições, avaliações) devem respeitar
                a boa-fé e não conter dados sensíveis desnecessários.
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold">4. Responsabilidades do Tutor</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Informar corretamente necessidades, rotina e cuidados do pet.</li>
              <li>
                Ler perfil, disponibilidade e avaliações do Cuidador antes de reservar.
              </li>
              <li>Agir com respeito, clareza e responsabilidade.</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold">5. Responsabilidades do Cuidador</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Manter dados, disponibilidade e valores atualizados.</li>
              <li>Realizar o cuidado do pet com atenção, ética e bem-estar animal.</li>
              <li>
                Cumprir o combinado na reserva e comunicar imprevistos o quanto antes.
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold">6. Reservas, comunicação e avaliações</h2>
            <p className="leading-relaxed">
              A plataforma pode disponibilizar reservas, chat e avaliações. As partes
              são responsáveis por se comunicar com clareza e manter um histórico
              respeitoso. Podemos remover conteúdos abusivos e, em casos graves,
              suspender contas.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold">7. Pagamentos</h2>
            <p className="leading-relaxed">
              No momento, a PeloCaramelo pode não intermediar pagamentos. Quando não
              houver intermediação, quaisquer tratativas financeiras entre Tutor e
              Cuidador são de responsabilidade exclusiva das partes.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold">8. Limitação de responsabilidade</h2>
            <p className="leading-relaxed">
              A PeloCaramelo não se responsabiliza por perdas, danos, acidentes,
              doenças, extravios ou qualquer evento decorrente da relação entre Tutor
              e Cuidador. Atuamos como plataforma tecnológica de conexão e organização.
              Ainda assim, tomamos medidas para reduzir abusos e melhorar a segurança.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold">9. Privacidade</h2>
            <p className="leading-relaxed">
              O uso de dados pessoais segue a nossa{" "}
              <ScrollLink
                to="/privacidade"
                className="text-[#95301F] font-bold hover:opacity-90 transition"
              >
                Política de Privacidade
              </ScrollLink>
              .
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold">10. Alterações destes Termos</h2>
            <p className="leading-relaxed">
              Podemos atualizar estes Termos para refletir melhorias e mudanças na
              plataforma. A data de atualização será ajustada nesta página.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold">11. Contato</h2>
            <p className="leading-relaxed">
              Dúvidas? Fale com a gente em <strong>contato@pelocaramelo.com.br</strong>.
            </p>
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
