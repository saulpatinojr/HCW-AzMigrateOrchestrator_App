import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    sourcemap: true,
    // The function form: Vite 8 (Rolldown) no longer accepts the object form of manualChunks.
    rollupOptions: { output: { manualChunks: (id) => (id.includes("/node_modules/@azure/msal-browser/") ? "msal" : /\/node_modules\/(react|react-dom|scheduler)\//.test(id) ? "react" : undefined) } },
  },
  // packages/ui is a workspace link; dedupe so one React instance is bundled.
  resolve: { dedupe: ["react", "react-dom"] },
  server: { port: 5174 },
});
