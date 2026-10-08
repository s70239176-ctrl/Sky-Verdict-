import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Dev equivalent of api/rpc.js: hosted Studio blocks direct cross-origin
    // browser calls (docs/genvm-gotchas.md #7), so with
    // VITE_GENLAYER_RPC_URL=same-origin the dev server forwards /api/rpc too.
    proxy: {
      "/api/rpc": {
        target: "https://studio.genlayer.com",
        changeOrigin: true,
        rewrite: () => "/api",
      },
    },
  },
});
