// src/pages/Seguranca.jsx
import ScrollLink from "../components/ScrollLink";

export default function Seguranca() {
  return (
    <main className="min-h-[70vh] bg-[#fffaf2]">
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <header className="mb-6">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#5A3A22]">
            Diretrizes de Segurança
          </h1>
          <p className="mt-2 text-sm text-[#5A3A22]/80">
            Regras simples para manter a comunidade segura 🐾
          </p>
        </header>

        <div className="bg-white rounded-2xl shadow-sm border border-[#EBCBA9] p-5 sm:p-7 space-y-6 text-[#5A3A22]">
          <p className="leading-relaxed">
            Essas diretrizes ajudam a reduzir riscos e manter uma experiência
            positiva para todos. Elas não substituem bom senso, cuidado e atenção.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="bg-[#fffaf2] border border-[#EBCBA9] rounded-2xl p-5">
              <h2 className="text-lg font-extrabold mb-3">
                Para Tutores
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  Leia o perfil do cuidador, serviços, valores e avaliações antes de reservar.
                </li>
                <li>
                  Informe rotina, restrições, alergias, medicações e comportamentos do pet.
                </li>
                <li>
                  Evite compartilhar informações sensíveis (documentos, dados bancários).
                </li>
                <li>
                  Mantenha a comunicação dentro da plataforma sempre que possível.
                </li>
                <li>
                  Se notar conduta suspeita, reporte e interrompa o contato.
                </li>
              </ul>
            </div>

            <div className="bg-[#fffaf2] border border-[#EBCBA9] rounded-2xl p-5">
              <h2 className="text-lg font-extrabold mb-3">
                Para Cuidadores
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  Mantenha disponibilidade e informações do perfil sempre atualizadas.
                </li>
                <li>
                  Explique claramente como funciona seu serviço (rotina, limites, horários).
                </li>
                <li>
                  Trate pets com respeito e prioridade ao bem-estar animal.
                </li>
                <li>
                  Comunique imprevistos com antecedência e registre tudo no chat.
                </li>
                <li>
                  Não solicite dados sensíveis desnecessários ao Tutor.
                </li>
              </ul>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold">Condutas proibidas</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Assédio, discriminação, ameaças ou linguagem ofensiva.</li>
              <li>Fraudes, golpes ou tentativa de burlar mecanismos de segurança.</li>
              <li>Solicitar informações sensíveis sem necessidade.</li>
              <li>Conteúdo falso para enganar outros usuários.</li>
            </ul>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold">Como reportar um problema</h2>
            <p className="leading-relaxed">
              Se você se sentir inseguro(a) ou identificar comportamento suspeito,
              interrompa o contato e nos avise o quanto antes:
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
