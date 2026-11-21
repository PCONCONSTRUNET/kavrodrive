import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'

const require = createRequire(import.meta.url)
const { handleApiRequest } = require('./server/apiHandler.cjs')

const DEFAULT_ONESIGNAL_APP_ID = 'ec6678e3-9723-4080-883f-d5bb0fe74a7b'
const DEFAULT_ONESIGNAL_SAFARI_WEB_ID = 'web.onesignal.auto.2e1b0bc4-2845-4ea5-bb2f-59e722cf7b3c'

function supabaseApiPlugin(envVars: Record<string, string>) {
  const oneSignalAppId = String(envVars.VITE_ONESIGNAL_APP_ID || envVars.ONESIGNAL_APP_ID || '').trim()
  const oneSignalSafariWebId = String(envVars.VITE_ONESIGNAL_SAFARI_WEB_ID || '').trim()

  return {
    name: 'supabase-api-server',
    transformIndexHtml(html: string) {
      let next = html
      if (oneSignalAppId) {
        next = next.replaceAll(DEFAULT_ONESIGNAL_APP_ID, oneSignalAppId)
      }
      if (oneSignalSafariWebId) {
        next = next.replaceAll(DEFAULT_ONESIGNAL_SAFARI_WEB_ID, oneSignalSafariWebId)
      }
      return next
    },
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.url === '/manifest.json') {
          req.url = '/api/manifest'
          return handleApiRequest(req, res)
        }
        if (req.url === '/manifest-client.json') {
          req.url = '/api/manifest?role=client'
          return handleApiRequest(req, res)
        }
        if (req.url === '/manifest-driver.json') {
          req.url = '/api/manifest?role=driver'
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
export default defineConfig(({ mode }) => {
  const envVars = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), supabaseApiPlugin(envVars)],
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
  }
})
