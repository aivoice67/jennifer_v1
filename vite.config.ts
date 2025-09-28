import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import * as dotenv from "dotenv";

// Load environment variables from .env file (AUTH_PIN expected)
dotenv.config();

// Prefer AUTH_PIN but support legacy VITE_AUTH_PIN if present
const AUTH_PIN = process.env.AUTH_PIN || process.env.VITE_AUTH_PIN || ""; // Will be inlined at build time

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    // Expose compile-time constant for comparison in client code
    __AUTH_PIN__: JSON.stringify(AUTH_PIN),
  },
}));
