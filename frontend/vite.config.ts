import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: {
    alias: {
      // El studio venía de un proyecto Next donde `@/` era la raíz. Aquí
      // tiene alias propio para no reservar `@/` en toda la app.
      "@studio": fileURLToPath(new URL("./src/studio", import.meta.url)),
    },
  },
  server: { port: 5173 },
});
