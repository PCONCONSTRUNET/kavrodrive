const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleApiRequest } = require('./server/apiHandler.cjs');

const PORT = process.env.PORT || 5173;
const DIST_DIR = path.join(__dirname, 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  // 1. API routes & dynamic manifest go directly to handler
  if (req.url === '/manifest.json') {
    req.url = '/api/manifest';
    return handleApiRequest(req, res);
  }
  if (req.url && req.url.startsWith('/api')) {
    return handleApiRequest(req, res);
  }

  // 2. Static files
  let safePath = path.normalize(new URL(req.url, 'http://localhost').pathname);
  let filePath = path.join(DIST_DIR, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    return fs.createReadStream(filePath).pipe(res);
  }

  // 3. Fallback to index.html for SPA client-side routing
  const indexPath = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(indexPath).pipe(res);
  }

  res.writeHead(404);
  res.end('Not Found. Please run `npm run build` first.');
});

server.listen(PORT, () => {
  console.log(`UP Mobilidade Server running on http://localhost:${PORT}`);
});

