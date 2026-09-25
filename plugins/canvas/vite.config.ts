import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const port = Number.parseInt(process.env.BLABLA_CANVAS_PORT ?? "43218", 10);

export default defineConfig({
  build: {
    outDir: "dist",
    license: { fileName: "third-party-licenses.json" },
    sourcemap: false,
    target: "es2024"
  },
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port,
    strictPort: false
  }
});
