import ScrollLink from "../components/ScrollLink";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[#5A3A22] text-white border-t-4 border-[#FFD700] py-5 mt-10 shadow-inner">
      <div className="text-center text-sm md:text-base font-semibold">
        © {year}{" "}
        <ScrollLink
          to="/"
          className="font-bold hover:opacity-90 transition"
        >
          <span className="text-white">Pelo</span>
          <span className="text-[#FFD700] drop-shadow-md">Caramelo</span>
        </ScrollLink>
      </div>
      <p className="text-center text-xs opacity-70 mt-1">
        Todos os direitos reservados 🐾
      </p>
    </footer>
  );
}
