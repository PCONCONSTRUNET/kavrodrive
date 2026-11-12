/**
 * Utilitários de formatação automática de valores, telefones, CPF, etc.
 * Todos os formatadores retornam o valor já formatado com pontuação.
 */

/** Formata um número de telefone brasileiro: (99) 99999-9999 ou (99) 9999-9999 */
export function formatPhone(value: string | undefined | null): string {
  if (!value) return '';
  let digits = String(value).replace(/\D/g, '');
  // Se começar com 55 e tiver 12 ou 13 dígitos (DDI Brasil), remove o 55 para formatar DDD + celular
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  digits = digits.slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

/** Formata um CPF: 000.000.000-00 */
export function formatCPF(value: string | undefined | null): string {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/** Formata um CNPJ: 00.000.000/0000-00 */
export function formatCNPJ(value: string | undefined | null): string {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '').slice(0, 14);
  if (!digits) return '';
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

/** Formata CPF (11 dígitos) ou CNPJ (14 dígitos) com pontuação automática */
export function formatDocument(value: string | undefined | null): string {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 14) return formatCNPJ(digits);
  if (digits.length > 0 && digits.length <= 11) return formatCPF(digits);
  return String(value);
}

/** Formata CNH para exibição legível nas fichas: 000.000.000-00 */
export function formatCNHPunctuated(value: string | undefined | null): string {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 11) return formatCPF(digits);
  return String(value);
}

/** Formata placa para exibição nas fichas: ABC-1D23 / ABC-1234 */
export function formatPlateDisplay(value: string | undefined | null): string {
  if (!value) return '';
  const clean = String(value).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 7);
  if (clean.length === 7) return `${clean.slice(0, 3)}-${clean.slice(3)}`;
  return clean;
}

/** Formata Chave PIX conforme o tipo (CPF, CNPJ ou Telefone) mantendo e-mail/aleatória intactas */
export function formatPixKey(value: string | undefined | null, pixType?: string | null): string {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw || raw.includes('@') || (raw.includes('-') && raw.length >= 24)) return raw;
  const digits = raw.replace(/\D/g, '');
  const tipo = String(pixType || '').toLowerCase();
  if (tipo.includes('telefone') || tipo.includes('phone') || tipo.includes('cel')) {
    return digits.length >= 10 ? formatPhone(digits) : raw;
  }
  if (tipo.includes('cnpj') || digits.length === 14) {
    return formatCNPJ(digits);
  }
  if (tipo.includes('cpf') || digits.length === 11) {
    // Se começa com DDD provável sem tipo definido e tipo inclui telefone, já tratou acima; caso 11 dígitos padrão sem @
    if (!tipo && raw.startsWith('(')) return formatPhone(digits);
    return formatCPF(digits);
  }
  if (digits.length === 10) return formatPhone(digits);
  return raw;
}

/** Formata um valor monetário em BRL: R$ 1.250,90 */
export function formatCurrency(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return 'R$ 0,00';
  if (typeof value === 'number') {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return 'R$ 0,00';
  const number = parseInt(digits, 10) / 100;
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Formata um número float para formato numérico monetário BR: "8,00" ou "1.250,50" */
export function formatCurrencyValue(num: number | undefined | null): string {
  if (num === undefined || num === null || isNaN(num)) return '0,00';
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Formata digitação de moeda em tempo real (máscara de centavos): "1500" -> "15,00" */
export function parseCurrencyInput(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '0,00';
  if (typeof value === 'number') {
    return formatCurrencyValue(value);
  }
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '0,00';
  const number = parseInt(digits, 10) / 100;
  return number.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Extrai o valor numérico float de uma string monetária ("15,00" ou "R$ 15,00" -> 15.0) */
export function parseCurrencyToFloat(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value;
  const clean = String(value).replace(/[^\d,-]/g, '').replace(',', '.');
  return parseFloat(clean) || 0;
}

/** Retorna número de WhatsApp limpo para links wa.me/55... */
export function getCleanWhatsappNumber(phone: string | undefined | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

/** Valida CPF básico (verifica se tem 11 dígitos) */
export function isCPFValid(cpf: string): boolean {
  return cpf.replace(/\D/g, '').length === 11;
}

/** Valida telefone básico (mínimo 10 dígitos) */
export function isPhoneValid(phone: string): boolean {
  return phone.replace(/\D/g, '').length >= 10;
}

/** Formata placa Mercosul ou Padrão antigo: ABC1D23 ou ABC1234 em maiúsculas sem espaços */
export function formatMercosulPlate(value: string | undefined | null): string {
  if (!value) return '';
  return String(value).replace(/[^A-Za-z0-9]/g, '').slice(0, 7).toUpperCase();
}

/** Formata número de CNH (somente números, até 11 dígitos) */
export function formatCNH(value: string | undefined | null): string {
  if (!value) return '';
  return String(value).replace(/\D/g, '').slice(0, 11);
}

/** Formata o identificador da viagem no padrão oficial: #UP - 001 */
export function formatRideCode(
  rideOrId?: string | number | { id?: string; rideNumber?: number; rideCode?: string } | null
): string {
  if (rideOrId === undefined || rideOrId === null) return '#UP - 001';
  if (typeof rideOrId === 'number') {
    return `#UP - ${String(Math.max(1, rideOrId)).padStart(3, '0')}`;
  }
  if (typeof rideOrId === 'object') {
    if (rideOrId.rideCode && rideOrId.rideCode.startsWith('#UP - ')) {
      return rideOrId.rideCode;
    }
    if (typeof rideOrId.rideNumber === 'number' && rideOrId.rideNumber > 0) {
      return `#UP - ${String(rideOrId.rideNumber).padStart(3, '0')}`;
    }
    return formatRideCode(rideOrId.id || '1');
  }
  const str = String(rideOrId).trim();
  if (/^#UP\s*-\s*\d+$/i.test(str)) {
    const digits = str.replace(/\D/g, '');
    return `#UP - ${String(parseInt(digits, 10) || 1).padStart(3, '0')}`;
  }
  const digits = str.replace(/\D/g, '');
  if (digits) {
    return `#UP - ${String(parseInt(digits, 10) || 1).padStart(3, '0')}`;
  }
  return `#UP - 001`;
}

/** Calcula o próximo ID sequencial de viagem (UP-001, UP-002, ...) a partir da lista atual */
export function getNextSequentialRideId(
  rides: Array<{ id?: string; rideNumber?: number }> = []
): string {
  let maxNum = 0;
  for (const r of rides) {
    const num =
      typeof r.rideNumber === 'number' && r.rideNumber > 0
        ? r.rideNumber
        : parseInt(String(r.id || '').replace(/\D/g, ''), 10) || 0;
    // Ignora códigos aleatórios antigos de 4 dígitos (> 999) caso não tenham rideNumber
    if (num > 0 && (r.rideNumber || num < 1000)) {
      if (num > maxNum) maxNum = num;
    }
  }
  const next = maxNum + 1;
  return `UP-${String(next).padStart(3, '0')}`;
}

