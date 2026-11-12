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
      // Gera dist/admin.html com /manifest-admin.json nativo no HTML estático para /motora e /admin
      const distDir = path.resolve(process.cwd(), 'dist')
      const indexHtmlPath = path.join(distDir, 'index.html')
      if (fs.existsSync(indexHtmlPath)) {
        const html = fs.readFileSync(indexHtmlPath, 'utf8')
        const adminHtml = html
          .replace('href="/manifest.json"', 'href="/manifest-admin.json"')
          .replace('content="UP Mobilidade"', 'content="UP Motorista"')
          .replace('<title>UP Mobilidade — Transporte Particular & Viagens Agendadas</title>', '<title>UP Motorista — Painel Operacional</title>')
        fs.writeFileSync(path.join(distDir, 'admin.html'), adminHtml, 'utf8')
      }
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), supabaseApiPlugin()],
  server: {
    host: true,
    port: 5173
  }
})
