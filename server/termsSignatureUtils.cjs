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

function isValidCpfDigits(document) {
  const digits = String(document || '').replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

  const calcDigit = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i += 1) {
      sum += Number(digits[i]) * (len + 1 - i);
    }
    const digit = (sum * 10) % 11;
    return digit === 10 ? 0 : digit;
  };

  return calcDigit(9) === Number(digits[9]) && calcDigit(10) === Number(digits[10]);
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
  isValidCpfDigits,
  buildTechnicalEvidence
};

