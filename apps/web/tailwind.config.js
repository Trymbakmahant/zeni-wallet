/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        framer: {
          cream: "#fffaf5", dark1: "#121111", dark2: "#171717", dark3: "#0f0f0f",
          border: "#292929", orange: "#ff2f00", orangeHover: "#e02a00",
        },
      },
      fontFamily: {
        sans: ["Figtree", "Inter", "sans-serif"],
        mono: ['"Geist Mono"', "monospace"],
        inter: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
