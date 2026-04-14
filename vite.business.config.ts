import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client-business", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@client-shared": path.resolve(import.meta.dirname, "client-shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client-business"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/business"),
    emptyOutDir: true,
  },
  server: {
    port: 5001,
    host: true,
    proxy: {
      "/api": {
        target: process.env.VITE_API_BASE_URL || "http://localhost:5000",
        changeOrigin: true,
      },
    },
    fs: {
      strict: false,
      allow: [
        path.resolve(import.meta.dirname, "client-business"),
        path.resolve(import.meta.dirname, "client-shared"),
        path.resolve(import.meta.dirname, "shared"),
        path.resolve(import.meta.dirname, "attached_assets"),
        path.resolve(import.meta.dirname, "node_modules"),
      ],
    },
  },
});
