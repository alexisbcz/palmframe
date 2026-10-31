import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

const icons = (file: string) =>
  fileURLToPath(new URL(`../../packages/ui/src/icons/${file}`, import.meta.url))

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // Explicit so the server renders the same icons as the client.
    alias: {
      "@hugeicons/core-free-icons": icons("core-free-icons.ts"),
      "@hugeicons/react": icons("react.tsx"),
    },
  },
  plugins: [tailwindcss(), reactRouter()],
  server: { port: 3000 },
})
