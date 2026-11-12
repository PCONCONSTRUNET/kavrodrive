// Carrega variáveis de .env.local (sem dependências). Variáveis já definidas no ambiente têm prioridade.
const fs = require('fs');
const path = require('path');

for (const file of ['.env.local', '.env']) {
  const p = path.resolve(__dirname, '..', file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

module.exports = process.env;

