import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const projectDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(projectDir, "client", "src"),
      "@shared": path.resolve(projectDir, "shared"),
      "@assets": path.resolve(projectDir, "attached_assets"),
    },
  },
  root: path.resolve(projectDir, "client"),
  build: {
    outDir: path.resolve(projectDir, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
