import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

function dropKatexRedundantFonts(): Plugin {
  return {
    name: 'drop-katex-redundant-fonts',
    generateBundle(_, bundle) {
      for (const name in bundle) {
        if (name.match(/KaTeX.*\.(ttf|woff)$/)) {
          delete bundle[name]
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), dropKatexRedundantFonts()],
  clearScreen: false,
  resolve: {
    alias: {
      '@codemirror/language-data': path.resolve(__dirname, 'src/stubs/language-data.ts'),
    },
  },
  define: {
    __VUE_OPTIONS_API__: 'false',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
