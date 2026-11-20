import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'

const require = createRequire(import.meta.url)
const { handleApiRequest } = require('./server/apiHandler.cjs')

function supabaseApiPlugin() {
  return {
    name: 'supabase-api-server',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.url === '/manifest.json') {
          req.url = '/api/manifest'
          return handleApiRequest(req, res)
        }
        if (req.url === '/manifest-admin.json') {
          req.url = '/api/manifest?role=admin'
          return handleApiRequest(req, res)
        }
        if (req.url && req.url.startsWith('/api')) {
          return handleApiRequest(req, res)
        }
        next()
      })
    },
    closeBundle() {
      // Gera dist/admin.html com /manifest-admin.json nativo no HTML estático para /motora e /administracion
      const distDir = path.resolve(process.cwd(), 'dist')
      const indexHtmlPath = path.join(distDir, 'index.html')
      if (fs.existsSync(indexHtmlPath)) {
        const html = fs.readFileSync(indexHtmlPath, 'utf8')
        const adminHtml = html
          .replace('href="/manifest.json"', 'href="/manifest-admin.json"')
          .replace('content="KAVRO DRIVE"', 'content="Kavro Motorista"')
          .replace('<title>KAVRO DRIVE — Mobilidade Urbana &amp; Corridas na Hora</title>', '<title>Kavro Motorista — Painel Operacional</title>')
        fs.writeFileSync(path.join(distDir, 'admin.html'), adminHtml, 'utf8')
      }
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), supabaseApiPlugin()],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@vladmandic/human') || id.includes('@tensorflow')) return 'vendor-biometrics'
          if (id.includes('pdfjs-dist')) return 'vendor-pdfjs'
          if (id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-pdf-export'
          if (id.includes('leaflet')) return 'vendor-maps'
          if (id.includes('react') || id.includes('lucide-react')) return 'vendor-react'
          return 'vendor-misc'
        }
      }
    }
  },
  server: {
    host: true,
    port: 5173
  }
})
