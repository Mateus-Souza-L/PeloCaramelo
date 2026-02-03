import { useMemo } from "react";
import { X, CheckCircle2, UserRound, PawPrint, CalendarDays } from "lucide-react";

function RoleBadge({ role }) {
  const label = role === "caregiver" ? "Cuidador" : "Tutor";
  return (
    <span className="inline-flex items-center rounded-full bg-[#FFF7E0] border border-[#FFD700]/60 px-3 py-1 text-xs font-semibold text-[#5A3A22] whitespace-nowrap">
      Perfil: {label}
    </span>
  );
}

function ChecklistItem({ icon: Icon, title, desc }) {
  return (
    <li className="flex gap-3">
      <CheckCircle2 className="w-5 h-5 text-[#95301F] mt-1 shrink-0" />
      <div>
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-[#5A3A22]/80" />}
          <p className="font-semibold text-[#5A3A22]">{title}</p>
        </div>
        <p className="text-sm text-[#5A3A22]/80 mt-1">{desc}</p>
      </div>
    </li>
  );
}

export default function WelcomeModal({ role = "tutor", userName = "", onClose }) {
  const isCaregiver = role === "caregiver";

  const content = useMemo(() => {
    return {
      title: isCaregiver
        ? "Bem-vindo(a) à PeloCaramelo"
        : "Seja muito bem-vindo(a) à PeloCaramelo",
      intro: `Oi, ${userName}! Que alegria te ver por aqui.`,
      emotional:
        "Aqui, confiança e carinho andam juntos: tutores e cuidadores se conectam com um único objetivo — o bem-estar dos pets.",
      gift:
        "🎁 Enviamos um presente para o seu e-mail: seu Guia de Boas-vindas. Dá uma olhadinha — ele ajuda a começar com segurança e tranquilidade.",
      fallback:
        "Se não receber, peça o guia em contato@pelocaramelo.com.br 🐾",
      checklistTitle: isCaregiver
        ? "Seu começo ideal como cuidador"
        : "Seu começo ideal como tutor",
      checklist: isCaregiver
        ? [
            {
              icon: UserRound,
              title: "Complete seu perfil",
              desc: "Foto, bio e detalhes do atendimento aumentam a confiança.",
            },
            {
              icon: CalendarDays,
              title: "Defina sua disponibilidade",
              desc: "Evite conflitos e receba reservas com tranquilidade.",
            },
            {
              icon: PawPrint,
              title: "Prepare o ambiente",
              desc: "Segurança sempre vem em primeiro lugar.",
            },
          ]
        : [
            {
              icon: UserRound,
              title: "Complete seu perfil",
              desc: "Ajuda o cuidador a entender sua rotina.",
            },
            {
              icon: PawPrint,
              title: "Cadastre pelo menos 1 pet",
              desc: "A reserva fica mais rápida e clara.",
            },
            {
              icon: CalendarDays,
              title: "Tenha datas em mente",
              desc: "Facilita a busca e a confirmação.",
            },
          ],
    };
  }, [isCaregiver, userName]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 p-3 overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border-l-8 border-[#FFD700] max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="relative p-4 sm:p-6">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-2 text-gray-400 hover:text-gray-700"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-start justify-between gap-3">
            <h2 className="text-3xl font-extrabold text-[#5A3A22] leading-tight">
              {content.title}
              <span className="inline-block ml-2 align-middle text-xl">🐾</span>
            </h2>
            <RoleBadge role={role} />
          </div>

          <p className="mt-3 font-semibold text-[#5A3A22]">{content.intro}</p>
          <p className="mt-2 text-[#5A3A22]/85 max-w-[85ch]">
            {content.emotional}
          </p>

          <div className="mt-5 rounded-xl bg-[#FFF7E0] border border-[#FFD700]/60 p-4">
            <p>{content.gift}</p>
            <p className="mt-2 text-sm opacity-80">{content.fallback}</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 pb-6 sm:px-6 overflow-y-auto max-h-[55vh]">
          <div className="bg-[#FAF6EF] rounded-2xl border p-4 sm:p-5">
            <h3 className="text-lg font-bold text-[#5A3A22]">
              {content.checklistTitle}
            </h3>
            <p className="text-sm text-[#5A3A22]/80 mb-4">
              Um passo de cada vez — comece com clareza e carinho.
            </p>

            <ul className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {content.checklist.map((item, i) => (
                <ChecklistItem key={i} {...item} />
              ))}
            </ul>
          </div>
        </div>

        {/* 🔧 MOBILE ONLY FIX */}
        <style>{`
          @media (max-width: 640px) {
            h2 {
              font-size: 20px !important;
              line-height: 1.2 !important;
            }

            h2 span {
              font-size: 16px !important;
              margin-left: 6px !important;
            }

            .max-h-\\[55vh\\] {
              max-height: 48vh !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
