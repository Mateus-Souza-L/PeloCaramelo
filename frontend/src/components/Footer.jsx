// src/components/Footer.jsx
import ScrollLink from "../components/ScrollLink";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[#5A3A22] text-white border-t-4 border-[#FFD700] py-5 mt-10 shadow-inner">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center text-sm md:text-base font-semibold">
          © {year}{" "}
          <ScrollLink to="/" className="font-bold hover:opacity-90 transition">
            <span className="text-white">Pelo</span>
            <span className="text-[#FFD700] drop-shadow-md">Caramelo</span>
          </ScrollLink>
        </div>

        {/* Links LGPD / Confiança */}
        <nav className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs sm:text-sm">
          <ScrollLink to="/privacidade" className="hover:opacity-90 underline underline-offset-4">
            Política de Privacidade
          </ScrollLink>
          <span className="opacity-40">•</span>
          <ScrollLink to="/termos" className="hover:opacity-90 underline underline-offset-4">
            Termos de Uso
          </ScrollLink>
          <span className="opacity-40">•</span>
          <ScrollLink to="/seguranca" className="hover:opacity-90 underline underline-offset-4">
            Diretrizes de Segurança
          </ScrollLink>
        </nav>

        <p className="text-center text-xs opacity-70 mt-3">
          Todos os direitos reservados. A PeloCaramelo é uma plataforma de conexão entre tutores e cuidadores. 🐾
        </p>
      </div>
    </footer>
  );
}
