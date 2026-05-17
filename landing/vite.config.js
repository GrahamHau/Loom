import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Landing page sits on its own port (5174) so it can run alongside the main
// LOOM dev server (5173) without colliding. Build output lives in dist/.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/" : "/",
  plugins: [react()],
  server: {
    port: 5174,
    host: "0.0.0.0",
  },
  preview: {
    port: 5174,
  },
}));
