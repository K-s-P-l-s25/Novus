import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// TAURI_DEV_HOST is set by `tauri android dev` so the phone can reach the dev server.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
  },
});
