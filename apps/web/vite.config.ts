import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

import { copyPdfjsAssets } from "./scripts/pdfjs-assets"
import { copyTongueAssets } from "./scripts/tongue-assets"

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    reactRouter(),
    {
      name: "pdfjs-assets",
      configResolved: ({ publicDir }) => void copyPdfjsAssets(publicDir),
    },
    {
      name: "tongue-assets",
      configResolved: ({ publicDir }) => void copyTongueAssets(publicDir),
    },
  ],
  // Their cores sit next to the code and load by `import.meta.url`, which
  // prebundling would break.
  optimizeDeps: {
    exclude: [
      "@desert-ant-labs/clear",
      "@desert-ant-labs/ear",
      "@desert-ant-labs/emo",
      "@desert-ant-labs/eye",
      "@desert-ant-labs/gist",
      "@desert-ant-labs/moderator",
      "@desert-ant-labs/redact",
      "@desert-ant-labs/shapes",
      "@desert-ant-labs/voz",
    ],
  },
  server: { port: 3000 },
})
