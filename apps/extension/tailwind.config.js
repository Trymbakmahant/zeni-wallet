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
          purpleHover: "#8324E6",
          cyan: "#00F0FF",
          muted: "#8892B0",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
