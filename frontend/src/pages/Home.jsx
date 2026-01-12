import { useEffect } from "react";
import { Link } from "react-router-dom";

export default function Home() {
  useEffect(() => {
    document.title = "PeloCaramelo | Início";
  }, []);

  return (
    <div className="bg-[#EBCBA9] min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-[#D2A679] via-[#B25B38] to-[#95301F] text-white py-20 text-center">
        <h1
          className="text-4xl sm:text-5xl font-bold mb-6"
          style={{ textShadow: "2px 2px 6px rgba(178,91,56,0.6)" }}
        >
          Na{" "}
          <span className="text-white">Pelo</span>
          <span className="text-yellow-400 drop-shadow-md">Caramelo</span>, seu
          pet encontra cuidado e amor 🐾
        </h1>
        <p
          className="text-lg sm:text-xl mb-8 max-w-2xl mx-auto"
          style={{ textShadow: "1px 1px 5px rgba(59,47,47,0.5)" }}
        >
          Conectamos tutores e cuidadores de confiança para garantir que seu pet
          receba todo carinho e atenção com a{" "}
          <span className="text-white">Pelo</span>
          <span className="text-yellow-400 drop-shadow-md">Caramelo</span>.
        </p>
        <Link
          to="/buscar"
          className="bg-secondary hover:bg-[#95301F] text-white px-6 py-3 rounded-lg font-semibold shadow-lg transition"
        >
          Buscar Cuidadores
        </Link>
      </section>

      {/* Cards */}
      <section className="py-16 px-6 max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
        <div className="bg-white shadow-md rounded-2xl p-6 hover:shadow-lg transition">
          <div className="text-5xl mb-4">👩‍👧‍👦</div>
          <h2 className="text-xl font-bold mb-2 text-primary-dark">Para Tutores</h2>
          <p className="text-textsub">
            Encontre cuidadores confiáveis na{" "}
            <span className="text-[#5A3A22]">Pelo</span>
            <span className="text-yellow-400 drop-shadow-md">Caramelo</span> e
            reserve em poucos cliques.
          </p>
        </div>

        <div className="bg-white shadow-md rounded-2xl p-6 hover:shadow-lg transition">
          <div className="text-5xl mb-4">🐶</div>
          <h2 className="text-xl font-bold mb-2 text-primary-dark">Para Cuidadores</h2>
          <p className="text-textsub">
            Cadastre-se na{" "}
            <span className="text-[#5A3A22]">Pelo</span>
            <span className="text-yellow-400 drop-shadow-md">Caramelo</span>,
            receba pedidos e aumente sua renda cuidando de pets.
          </p>
        </div>

        <div className="bg-white shadow-md rounded-2xl p-6 hover:shadow-lg transition">
          <div className="text-5xl mb-4">🛡️</div>
          <h2 className="text-xl font-bold mb-2 text-primary-dark">Segurança</h2>
          <p className="text-textsub">
            A{" "}
            <span className="text-[#5A3A22]">Pelo</span>
            <span className="text-yellow-400 drop-shadow-md">Caramelo</span>{" "}
            garante transparência, confiança e suporte em todas as reservas.
          </p>
        </div>
      </section>
    </div>
  );
}
