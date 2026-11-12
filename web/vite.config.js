import { defineConfig } from "vite";

// The page data lives in ../output/data.json (written by src/fit.py); it is imported with
// ?url, so the dev server has to be allowed to read the repo root.
const SITE_URL = (process.env.SITE_URL || "https://f1-equal-machinery.vercel.app").replace(/\/$/, "");

export default defineConfig({
  server: { port: 5173, strictPort: true, fs: { allow: [".."] } },
  preview: { port: 4173, strictPort: true },
  build: { target: "es2020", sourcemap: false, chunkSizeWarningLimit: 900 },
  plugins: [
    {
      name: "site-url",
      transformIndexHtml: (html) => html.replaceAll("__SITE_URL__", SITE_URL),
    },
  ],
});
