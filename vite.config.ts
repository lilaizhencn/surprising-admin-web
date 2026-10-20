import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
  plugins: [react()],
  server: {
    port: 5174,
    proxy: { "/api": { target: env.VITE_GATEWAY_PROXY_TARGET || "http://127.0.0.1:9094", changeOrigin: true } }
  },
  preview: {
    port: 4174
  }
  };
});
