import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

import { copyPdfjsAssets } from "./scripts/pdfjs-assets"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    reactRouter(),
    {
      name: "pdfjs-assets",
      configResolved: ({ publicDir }) => void copyPdfjsAssets(publicDir),
    },
  ],
  server: { port: 3000 },
})
