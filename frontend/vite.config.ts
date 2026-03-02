import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],

    // Only apply proxy in DEV mode
    server: mode === "development" ? {
      port: 4173,
      host: "0.0.0.0",
      proxy: {
        "/api": {
          target: env.VITE_BACKEND_URL || "http://localhost:3000",
          changeOrigin: true,
        }
      }
    } : undefined,

    // Build time environment replacement
    define: {
      "import.meta.env.VITE_BACKEND_URL": JSON.stringify(env.VITE_BACKEND_URL)
    }
  };
});
