import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // In production the Worker serves this app and the API from one origin. In
    // dev, forward /api to the local Worker so the code path is identical.
    proxy: {
      "/api": "http://localhost:53248",
    },
  },
})
