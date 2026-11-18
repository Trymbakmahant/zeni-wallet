import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  // Vercel serves the built 404.html for unmatched URLs with a 404 status.
  build: {
    rollupOptions: {
      input: { main: "index.html", notFound: "404.html" },
    },
  },
  server: {
    port: 3000,
  },
});
