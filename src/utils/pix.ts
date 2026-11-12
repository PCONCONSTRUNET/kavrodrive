/**
 * Utilitário de Geração de Código PIX (Padrão Banco Central do Brasil - BR Code EMV)
 */

function formatField(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return id + len + value;
}

function crc16(str: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Gera o payload oficial do PIX Copia e Cola para QR Code
 */
export function generatePixPayload(
  key: string,
  beneficiaryName: string = 'KAVRO DRIVE',
  city: string = 'BRASIL',
  amount?: number,
  txid: string = 'UPMOB'
): string {
  if (!key) return '';
  const cleanKey = key.trim();
  const cleanName = (beneficiaryName || 'KAVRO DRIVE')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .slice(0, 25)
    .trim();
  const cleanCity = (city || 'BRASIL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .slice(0, 15)
    .trim();
  const formattedAmount = amount && amount > 0 ? amount.toFixed(2) : '';
  const cleanTxid = (txid || 'UPMOB').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || 'UPMOB';

  const merchantAccount = formatField('00', 'br.gov.bcb.pix') + formatField('01', cleanKey);
  const payloadWithoutCrc =
    formatField('00', '01') +
    formatField('26', merchantAccount) +
    formatField('52', '0000') +
    formatField('53', '986') +
    (formattedAmount ? formatField('54', formattedAmount) : '') +
    formatField('58', 'BR') +
    formatField('59', cleanName) +
    formatField('60', cleanCity) +
    formatField('62', formatField('05', cleanTxid)) +
    '6304';

  const checksum = crc16(payloadWithoutCrc);
  return payloadWithoutCrc + checksum;
}

/**
 * Retorna URL da imagem do QR Code
 */
export function getQrCodeImageUrl(data: string, size: number = 240): string {
  if (!data) return '';
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&margin=10`;
}

