import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  // Use "/" so that hashed asset paths (/assets/index-abc123.js) are absolute
  // and resolve correctly regardless of which hash-route is active.
  base: "/",
  plugins: [
    tailwindcss(),
    react(),
  ],
  server: {
    port: 5175,
  },
  preview: {
    port: 5175,
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
