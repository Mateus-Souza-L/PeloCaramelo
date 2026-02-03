import { useMemo } from "react";
import { X, CheckCircle2, Mail, Loader2, UserRound, PawPrint, CalendarDays } from "lucide-react";

function RoleBadge({ role }) {
  const label = role === "caregiver" ? "Cuidador" : "Tutor";
  return (
    <span className="inline-flex items-center rounded-full bg-[#FFF7E0] border border-[#FFD700]/60 px-3 py-1 text-xs font-semibold text-[#5A3A22]">
      Perfil: {label}
    </span>
  );
}

function ChecklistItem({ icon: Icon, title, desc }) {
  return (
    <li className="flex gap-3">
      <div className="mt-0.5 shrink-0">
        <CheckCircle2 className="w-5 h-5 text-[#95301F]" />
      </div>
      <div className="min-w-0">
        <div className="flex items-start gap-2">
          {Icon ? <Icon className="w-4 h-4 mt-0.5 text-[#5A3A22]/80" /> : null}
          <p className="font-semibold text-[#5A3A22] leading-snug">{title}</p>
        </div>
        {desc ? (
          <p className="text-sm text-[#5A3A22]/80 leading-relaxed mt-1">
            {desc}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export default function WelcomeModal({
  role = "tutor",
  userName = "",
  onClose, // fecha SOMENTE no X
  onResendGuide,
  resending = false,
  resendState = "idle", // "idle" | "ok" | "error"
}) {
  const isCaregiver = String(role).toLowerCase() === "caregiver";
  const safeName = String(userName || "").trim();

  const content = useMemo(() => {
    const title = isCaregiver
      ? "Bem-vindo(a) à PeloCaramelo 🐾"
      : "Seja muito bem-vindo(a) à PeloCaramelo 🐾";

    const intro = isCaregiver
      ? `Oi${safeName ? `, ${safeName}` : ""}! Obrigado por escolher cuidar com a gente.`
      : `Oi${safeName ? `, ${safeName}` : ""}! Que alegria te ver por aqui.`;

    const emotional = isCaregiver
      ? "Aqui, a confiança vem antes de tudo: tutores encontram cuidado de verdade — e cuidadores constroem vínculos com responsabilidade e carinho."
      : "Aqui, confiança e carinho andam juntos: tutores e cuidadores se conectam com um único objetivo — o bem-estar dos pets.";

    const gift = "🎁 Enviamos um presente para o seu e-mail: seu Guia de Boas-vindas. Dá uma olhadinha — ele ajuda a começar com segurança e tranquilidade.";

    const checklistTitle = isCaregiver
      ? "Seu começo ideal como cuidador"
      : "Seu começo ideal como tutor";

    const checklist = isCaregiver
      ? [
          {
            icon: UserRound,
            title: "Complete seu perfil",
            desc: "Foto, bio e detalhes do seu atendimento aumentam confiança e conversão.",
          },
          {
            icon: CalendarDays,
            title: "Defina sua disponibilidade",
            desc: "Marque dias/horários para receber reservas sem dor de cabeça.",
          },
          {
            icon: PawPrint,
            title: "Revise segurança do ambiente",
            desc: "Portões, telas, produtos tóxicos e áreas restritas — tudo pronto antes do primeiro pet.",
          },
        ]
      : [
          {
            icon: UserRound,
            title: "Complete seu perfil",
            desc: "Informações claras ajudam o cuidador a entender melhor sua rotina.",
          },
          {
            icon: PawPrint,
            title: "Cadastre pelo menos 1 pet",
            desc: "Assim a reserva fica mais rápida e o cuidador já recebe as informações essenciais.",
          },
          {
            icon: CalendarDays,
            title: "Tenha datas em mente",
            desc: "Planeje dias e horários para facilitar a busca e acelerar a confirmação.",
          },
        ];

    return { title, intro, emotional, gift, checklistTitle, checklist };
  }, [isCaregiver, safeName]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 px-3 py-4"
      aria-modal="true"
      role="dialog"
    >
      {/* Card */}
      <div
        className="
          w-full max-w-lg
          rounded-2xl bg-white shadow-2xl
          border-l-8 border-[#FFD700]
          overflow-hidden
        "
      >
        {/* Header */}
        <div className="relative p-4 sm:p-6">
          {/* close: SOMENTE ele fecha */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 rounded-full p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center justify-between gap-3 pr-10">
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#5A3A22] leading-tight">
              {content.title}
            </h2>
            <RoleBadge role={isCaregiver ? "caregiver" : "tutor"} />
          </div>

          <p className="mt-3 text-[#5A3A22] font-semibold">
            {content.intro}
          </p>

          <p className="mt-2 text-sm sm:text-base text-[#5A3A22]/85 leading-relaxed">
            {content.emotional}
          </p>

          {/* Gift box */}
          <div className="mt-4 rounded-xl bg-[#FFF7E0] border border-[#FFD700]/60 p-4">
            <p className="text-sm sm:text-base text-[#5A3A22] leading-relaxed">
              {content.gift}
            </p>

            <button
              type="button"
              onClick={onResendGuide}
              disabled={resending}
              className="
                mt-3 inline-flex w-full items-center justify-center gap-2
                rounded-xl px-4 py-2.5
                bg-[#95301F] text-white font-semibold
                hover:bg-[#B25B38] disabled:opacity-60 disabled:cursor-not-allowed
                transition
              "
            >
              {resending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Reenviando...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4" />
                  Reenviar guia por e-mail
                </>
              )}
            </button>

            {resendState === "ok" ? (
              <p className="mt-2 text-xs sm:text-sm text-green-700">
                ✅ Pronto! Reenviamos o guia. Se não aparecer, confira o spam/lixo eletrônico.
              </p>
            ) : null}

            {resendState === "error" ? (
              <p className="mt-2 text-xs sm:text-sm text-red-700">
                ⚠️ Não conseguimos reenviar agora. Tente novamente em instantes.
              </p>
            ) : null}
          </div>
        </div>

        {/* Body (scroll no mobile) */}
        <div className="px-4 pb-4 sm:px-6 sm:pb-6">
          <div className="rounded-2xl border border-[#EBCBA9]/60 bg-[#FAF6EF] p-4 sm:p-5">
            <h3 className="text-base sm:text-lg font-extrabold text-[#5A3A22]">
              {content.checklistTitle}
            </h3>

            <p className="mt-1 text-sm text-[#5A3A22]/80">
              Um passo de cada vez — o importante é começar com clareza e carinho.
            </p>

            <ul className="mt-4 space-y-4">
              {content.checklist.map((it, idx) => (
                <ChecklistItem
                  key={idx}
                  icon={it.icon}
                  title={it.title}
                  desc={it.desc}
                />
              ))}
            </ul>
          </div>

          {/* Nota final */}
          <p className="mt-4 text-xs sm:text-sm text-[#5A3A22]/75 leading-relaxed">
            *Dica rápida:* se você não encontrar o e-mail do guia agora, procure por “PeloCaramelo” e marque como confiável.
          </p>

          {/* Observação importante: só fecha no X */}
          <p className="mt-2 text-[11px] sm:text-xs text-[#5A3A22]/60">
            Para continuar, feche esta mensagem pelo <b>✕</b> no canto.
          </p>
        </div>

        {/* Responsividade extra: garante que no mobile não estoure */}
        <style>{`
          @media (max-height: 720px) {
            div[role="dialog"] > div {
              max-height: 92vh;
              overflow: auto;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
