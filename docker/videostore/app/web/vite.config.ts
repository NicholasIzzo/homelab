import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // In dev il server Fastify gira a parte sulla 8091.
      "/api": "http://localhost:8091",
    },
  },
});
