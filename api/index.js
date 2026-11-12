// Função serverless da Vercel: encaminha todas as rotas /api/* para o mesmo handler usado no dev
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { handleApiRequest } = require('../server/apiHandler.cjs');

export default async function handler(req, res) {
  // O rewrite do vercel.json envia o caminho original em ?__path=...
  const url = new URL(req.url, 'http://localhost');
  const p = url.searchParams.get('__path');
  if (p !== null) {
    url.searchParams.delete('__path');
    const qs = url.searchParams.toString();
    req.url = `/api/${p}${qs ? `?${qs}` : ''}`;
  }
  return handleApiRequest(req, res);
}

