const crypto = require('crypto');

function sha256(content) {
  return crypto
    .createHash('sha256')
    .update(String(content || ''), 'utf8')
    .digest('hex');
}

function formatDateTimeBrasilia(isoDate) {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'short',
      timeStyle: 'medium'
    }).format(new Date(isoDate));
  } catch {
    return new Date(isoDate).toLocaleString('pt-BR');
  }
}

function cleanAndFormatCpf(document) {
  const cleanCpf = String(document || '').replace(/\D/g, '');
  const formattedCpf =
    cleanCpf.length === 11
      ? `${cleanCpf.slice(0, 3)}.${cleanCpf.slice(3, 6)}.${cleanCpf.slice(6, 9)}-${cleanCpf.slice(9)}`
      : String(document || '').trim();
  return { cleanCpf, formattedCpf };
}

function buildTechnicalEvidence({ ip, userAgent, host, clientAcceptance, signedAt }) {
  return {
    ip: String(ip || '127.0.0.1'),
    userAgent: String(userAgent || 'Navegador / App Mobile'),
    host: String(host || ''),
    clientAcceptedAt: (clientAcceptance && clientAcceptance.acceptedAtClient) || signedAt,
    language: (clientAcceptance && clientAcceptance.language) || 'pt-BR',
    timezone: (clientAcceptance && clientAcceptance.timezone) || 'America/Sao_Paulo'
  };
}

module.exports = {
  sha256,
  formatDateTimeBrasilia,
  cleanAndFormatCpf,
  buildTechnicalEvidence
};

