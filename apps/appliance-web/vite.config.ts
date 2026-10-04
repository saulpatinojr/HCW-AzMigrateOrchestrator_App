import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist", sourcemap: true, rollupOptions: { output: { manualChunks: { msal: ["@azure/msal-browser"], react: ["react", "react-dom"] } } } },
  // @amo/ui is a symlink into the sibling _Addon checkout (ADR-0027); dedupe so one React instance is bundled.
  resolve: { dedupe: ["react", "react-dom"] },
  server: { port: 5174 },
});
