/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          light: "#EBCBA9", // Caramelo Suave
          DEFAULT: "#D2A679", // Caramelo médio
          dark: "#A06D3B", // Marrom queimado
        },
        accent: "#95301F",   // Marrom avermelhado
        secondary: "#F4C542", // Amarelo ouro
        textmain: "#3B2F2F",  // Marrom café
        textsub: "#6B5B4D",   // Marrom médio
      },
    },
  },
  plugins: [],
}
