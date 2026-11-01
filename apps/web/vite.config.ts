import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy /api to the local backend so the browser sees one origin (no CORS).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
