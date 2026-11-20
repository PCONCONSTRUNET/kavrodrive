import React from 'react';
import { Wallet } from 'lucide-react';

export function normalizePaymentMethodKey(method?: string): 'pix' | 'dinheiro' | 'cartao_credito' | 'cartao_debito' | 'apple_pay' | 'carteira' | 'online' {
  const m = String(method || '').toLowerCase().trim();
  if (m === 'pix') return 'pix';
  if (m === 'dinheiro' || m === 'cash') return 'dinheiro';
  if (m === 'apple_pay' || m === 'applepay') return 'apple_pay';
  if (m === 'carteira' || m === 'wallet' || m === 'saldo_carteira') return 'carteira';
  if (m === 'cartao_debito' || m === 'debito') return 'cartao_debito';
  if (m === 'online') return 'online';
  return 'cartao_credito';
}

export function getPaymentMethodIconSrc(method?: string): string {
  const key = normalizePaymentMethodKey(method);
  if (key === 'pix') return '/icons/icone-pix.png';
  if (key === 'dinheiro') return '/icons/icone-dinheiro.png';
  if (key === 'apple_pay') return '/icons/icone-apple-pay.svg';
  return '/icons/icone-cartao.png';
}

export function getPaymentMethodLabel(method?: string, compact = false): string {
  const key = normalizePaymentMethodKey(method);
  if (key === 'pix') return compact ? 'PIX' : 'PIX Instantâneo';
  if (key === 'dinheiro') return compact ? 'Dinheiro' : 'Dinheiro em Espécie';
  if (key === 'apple_pay') return 'Apple Pay';
  if (key === 'carteira') return compact ? 'Carteira' : 'Saldo da Carteira';
  if (key === 'cartao_debito') return compact ? 'Débito' : 'Cartão de Débito';
  if (key === 'online') return compact ? 'Online' : 'Pagamento Online';
  return compact ? 'Cartão' : 'Cartão de Crédito';
}

interface PaymentMethodIconProps {
  method?: string;
  size?: number;
  style?: React.CSSProperties;
}

export const PaymentMethodIcon: React.FC<PaymentMethodIconProps> = ({ method, size = 16, style }) => {
  const key = normalizePaymentMethodKey(method);
  if (key === 'carteira') {
    const badgeSize = Math.max(16, Math.round(size * 1.12));
    return (
      <span
        aria-label="Carteira"
        style={{
          width: badgeSize,
          height: badgeSize,
          borderRadius: Math.max(5, Math.round(badgeSize * 0.28)),
          backgroundColor: '#0F172A',
          border: '1px solid rgba(118, 216, 0, 0.45)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          ...style
        }}
      >
        <Wallet size={Math.max(10, Math.round(badgeSize * 0.62))} color="#76D800" strokeWidth={2.4} />
      </span>
    );
  }
  const src = getPaymentMethodIconSrc(key);
  const label = getPaymentMethodLabel(key);
  const width = key === 'apple_pay' ? Math.round(size * 1.48) : size;
  return (
    <img
      src={src}
      alt={label}
      style={{
        width,
        height: size,
        objectFit: 'contain',
        display: 'block',
        flexShrink: 0,
        ...style
      }}
    />
  );
};

interface PaymentMethodBadgeProps {
  method?: string;
  compact?: boolean;
  dark?: boolean;
  iconSize?: number;
  style?: React.CSSProperties;
}

export const PaymentMethodBadge: React.FC<PaymentMethodBadgeProps> = ({
  method,
  compact = true,
  dark = false,
  iconSize = 14,
  style
}) => {
  const key = normalizePaymentMethodKey(method);
  const label = getPaymentMethodLabel(key, compact);

  const palette = dark
    ? key === 'pix'
      ? { bg: 'rgba(20, 184, 166, 0.16)', border: 'rgba(45, 212, 191, 0.35)', text: '#5EEAD4' }
      : key === 'dinheiro'
        ? { bg: 'rgba(132, 204, 22, 0.16)', border: 'rgba(163, 230, 53, 0.35)', text: '#BEF264' }
        : key === 'carteira'
          ? { bg: 'rgba(118, 216, 0, 0.16)', border: 'rgba(163, 230, 53, 0.38)', text: '#BEF264' }
        : key === 'apple_pay'
          ? { bg: 'rgba(255, 255, 255, 0.12)', border: 'rgba(255, 255, 255, 0.28)', text: '#FFFFFF' }
          : { bg: 'rgba(59, 130, 246, 0.16)', border: 'rgba(96, 165, 250, 0.35)', text: '#93C5FD' }
    : key === 'pix'
      ? { bg: '#F0FDFA', border: '#99F6E4', text: '#0F766E' }
      : key === 'dinheiro'
        ? { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D' }
        : key === 'carteira'
          ? { bg: '#ECFCCB', border: '#BEF264', text: '#3F6212' }
        : key === 'apple_pay'
          ? { bg: '#0F172A', border: '#0F172A', text: '#FFFFFF' }
          : { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: compact ? '2px 8px' : '4px 10px',
        borderRadius: 999,
        backgroundColor: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.text,
        fontSize: compact ? '0.68rem' : '0.74rem',
        fontWeight: 700,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        ...style
      }}
    >
      <PaymentMethodIcon method={key} size={iconSize} />
      <span>{label}</span>
    </span>
  );
};
