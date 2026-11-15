/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        zeni: {
          bg: "#0B0E14",
          card: "#141824",
          border: "#20283E",
          purple: "#9939FF",
          cyan: "#00F0FF",
        },
      },
    },
  },
  plugins: [],
};
