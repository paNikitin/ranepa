import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

// `base` controls the public path the SPA is served from.
// Each event-slot is mounted at /<APP_SLUG>/ on the shared host,
// so the build for slot "app1" must be compiled with base "/app1/".
// The build script (scripts/deploy.sh) sets APP_BASE; locally it
// defaults to "/" so `npm run dev` opens at the root.
const APP_BASE = process.env.APP_BASE ?? "/";

export default defineConfig({
  base: APP_BASE,
  plugins: [react(), tailwind()],
  build: {
    target: "es2022",
    minify: "esbuild",
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
});
