import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  X,
} from 'lucide-react';
import { SavedCard } from '../types';
import { StorageService } from '../services/storage';
import { formatCPF, isValidCPF } from '../utils/format';

interface AddCardModalSheetProps {
  isOpen: boolean;
  mode?: 'embedded' | 'fullscreen';
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  initialHolderName?: string;
  initialHolderCpf?: string;
  clientId?: string;
  clientPhone?: string;
  mercadopagoPublicKey?: string;
  onClose: () => void;
  onCardSaved: (card: SavedCard) => void;
}

function detectCardBrandClient(digits: string): 'Visa' | 'Mastercard' | 'Elo' | 'Amex' | 'Hipercard' | 'Cartão' {
  if (!digits) return 'Cartão';
  if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(digits)) {
    return 'Elo';
  }
  if (/^3[47]/.test(digits)) return 'Amex';
  if (/^(606282|3841)/.test(digits)) return 'Hipercard';
  if (/^4/.test(digits)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard';
  return 'Cartão';
}

function formatCardNumberDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 19);
  if (/^3[47]/.test(digits)) {
    const p1 = digits.slice(0, 4);
    const p2 = digits.slice(4, 10);
    const p3 = digits.slice(10, 15);
    return [p1, p2, p3].filter(Boolean).join(' ');
  }
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function formatExpiryMmAa(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

const BRAND_COLORS: Record<string, { bg: string; text: string }> = {
  Visa: { bg: '#1D4ED8', text: '#FFFFFF' },
  Mastercard: { bg: '#EA580C', text: '#FFFFFF' },
  Elo: { bg: '#0F172A', text: '#FACC15' },
  Amex: { bg: '#0284C7', text: '#FFFFFF' },
  Hipercard: { bg: '#B91C1C', text: '#FFFFFF' },
  Cartão: { bg: 'rgba(255,255,255,0.14)', text: '#E2E8F0' },
};

const FIELD_INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  maxWidth: '100%',
  boxSizing: 'border-box',
  height: 48,
  padding: '0 14px',
  borderRadius: 12,
  border: '1.5px solid #CBD5E1',
  backgroundColor: '#FFFFFF',
  color: '#0F172A',
  fontSize: '0.96rem',
  fontWeight: 600,
  outline: 'none',
  transition: 'border-color 0.15s ease',
};

const FIELD_LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 800,
  color: '#334155',
  marginBottom: 6,
  letterSpacing: '0.01em',
};

export const AddCardModalSheet: React.FC<AddCardModalSheetProps> = ({
  isOpen,
  mode = 'embedded',
  title = 'Adicionar cartão Kavro Pay',
  subtitle = 'Pagamento criptografado à vista (1x, sem parcelamento)',
  submitLabel = 'Salvar e usar cartão',
  initialHolderName = '',
  initialHolderCpf = '',
  clientId,
  clientPhone,
  mercadopagoPublicKey = '',
  onClose,
  onCardSaved,
}) => {
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState(initialHolderName);
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardCpf, setCardCpf] = useState(() => formatCPF(initialHolderCpf));
  const [showCvv, setShowCvv] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const cardDigits = useMemo(() => cardNumber.replace(/\D/g, ''), [cardNumber]);
  const detectedBrand = useMemo(() => detectCardBrandClient(cardDigits), [cardDigits]);
  const brandBadge = BRAND_COLORS[detectedBrand] || BRAND_COLORS.Cartão;
  const cpfDigits = useMemo(() => cardCpf.replace(/\D/g, ''), [cardCpf]);
  const isCpfCompleteValid = cpfDigits.length === 11 && isValidCPF(cpfDigits);

  if (!isOpen) return null;

  const previewMaskedNumber = (() => {
    if (!cardDigits) return '••••  ••••  ••••  ••••';
    const padded = cardDigits.padEnd(16, '•');
    return `${padded.slice(0, 4)}  ${padded.slice(4, 8)}  ${padded.slice(8, 12)}  ${padded.slice(12, 16)}`;
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (cardDigits.length < 13 || cardDigits.length > 19) {
      setErrorMsg('Digite o número completo do cartão (13 a 19 dígitos).');
      return;
    }

    const cleanHolder = cardHolder.trim();
    if (cleanHolder.length < 3) {
      setErrorMsg('Informe o nome completo exatamente como está impresso no cartão.');
      return;
    }

    const expDigits = cardExpiry.replace(/\D/g, '');
    if (expDigits.length !== 4) {
      setErrorMsg('Informe a validade do cartão no formato MM/AA (ex: 12/29).');
      return;
    }
    const expMonthNum = parseInt(expDigits.slice(0, 2), 10);
    const expYearShort = parseInt(expDigits.slice(2, 4), 10);
    const expYearNum = 2000 + expYearShort;
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;

    if (expMonthNum < 1 || expMonthNum > 12) {
      setErrorMsg('Mês de validade inválido (use entre 01 e 12).');
      return;
    }
    if (expYearNum < curYear || (expYearNum === curYear && expMonthNum < curMonth)) {
      setErrorMsg('Este cartão já está vencido. Verifique a validade.');
      return;
    }

    const cvvDigits = cardCvv.replace(/\D/g, '');
    if (cvvDigits.length < 3 || cvvDigits.length > 4) {
      setErrorMsg('Informe o código de segurança (CVV) de 3 ou 4 dígitos.');
      return;
    }

    if (!isValidCPF(cpfDigits)) {
      setErrorMsg('Informe um CPF válido (11 dígitos) do titular do cartão.');
      return;
    }

    const expMonthStr = String(expMonthNum).padStart(2, '0');
    const expYearStr = String(expYearNum);

    setIsSaving(true);
    let mpCardToken: string | undefined;
    try {
      let publicKey = String(mercadopagoPublicKey || '').trim();
      if (!publicKey) {
        const payCfg = await StorageService.fetchPaymentsConfig().catch(() => null);
        publicKey = String(payCfg?.mercadopagoPublicKey || '').trim();
      }
      if (publicKey) {
        const tokenBody: Record<string, unknown> = {
          card_number: cardDigits,
          expiration_month: expMonthNum,
          expiration_year: expYearNum,
          security_code: cvvDigits,
          cardholder: {
            name: cleanHolder.toUpperCase(),
            identification: {
              type: 'CPF',
              number: cpfDigits,
            },
          },
        };
        const mpResp = await fetch(
          `https://api.mercadopago.com/v1/card_tokens?public_key=${encodeURIComponent(publicKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tokenBody),
          }
        );
        const mpData = await mpResp.json().catch(() => ({}));
        if (mpResp.ok && mpData?.id) {
          mpCardToken = String(mpData.id);
        }
      }
    } catch {
      // Fallback seguro para tokenização via backend
    }

    const res = await StorageService.saveTokenizedCard({
      clientId,
      clientPhone,
      cardNumber: cardDigits,
      holderName: cleanHolder,
      expMonth: expMonthStr,
      expYear: expYearStr,
      cvv: cvvDigits,
      cardType: 'cartao_credito',
      mpCardToken,
      holderDocument: cpfDigits,
    });

    setIsSaving(false);
    if (!res.ok || !res.card) {
      setErrorMsg(res.error || 'Não foi possível validar o cartão. Confira os dados.');
      return;
    }

    onCardSaved(res.card);
  };

  const sheetBody = (
    <div
      style={{
        width: '100%',
        maxWidth: 480,
        minWidth: 0,
        height: '100%',
        margin: '0 auto',
        backgroundColor: '#F8FAFC',
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'hidden',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        boxSizing: 'border-box',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Cabeçalho Dark Kavro Pay */}
      <div
        style={{
          width: '100%',
          boxSizing: 'border-box',
          background: 'linear-gradient(155deg, #0B1117 0%, #15222C 100%)',
          padding: 'calc(14px + env(safe-area-inset-top, 0px)) 18px 18px 18px',
          borderBottomLeftRadius: 22,
          borderBottomRightRadius: 22,
          boxShadow: '0 8px 24px rgba(11, 17, 23, 0.14)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginBottom: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <img
              src="/logo-horizontal-white.png"
              alt="KAVRO DRIVE"
              style={{ height: 20, maxWidth: '100%', objectFit: 'contain', flexShrink: 0 }}
            />
            <span
              style={{
                fontSize: '0.66rem',
                fontWeight: 800,
                color: '#BEF264',
                backgroundColor: 'rgba(118, 216, 0, 0.14)',
                border: '1px solid rgba(118, 216, 0, 0.35)',
                padding: '3px 8px',
                borderRadius: 999,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                whiteSpace: 'nowrap',
              }}
            >
              <Lock size={10} /> Cartão Seguro
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Voltar"
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.14)',
              border: 'none',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#FFFFFF', lineHeight: 1.2 }}>
          {title}
        </div>
        <div style={{ fontSize: '0.74rem', color: '#94A3B8', marginTop: 3, lineHeight: 1.35 }}>
          {subtitle}
        </div>
      </div>

      {/* Conteúdo Centralizado com Preview do Cartão + Campos Limpos */}
      <div
        style={{
          width: '100%',
          minWidth: 0,
          boxSizing: 'border-box',
          padding: '16px 16px calc(24px + env(safe-area-inset-bottom, 0px)) 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          flex: 1,
        }}
      >
        {/* Prévia Visual do Cartão em Tempo Real */}
        <div
          style={{
            width: '100%',
            boxSizing: 'border-box',
            borderRadius: 18,
            padding: '15px 16px',
            background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 62%, #132A1E 100%)',
            border: '1px solid rgba(118, 216, 0, 0.24)',
            boxShadow: '0 10px 26px rgba(15, 23, 42, 0.18)',
            color: '#FFFFFF',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 32,
                  height: 22,
                  borderRadius: 5,
                  background: 'linear-gradient(135deg, #FDE68A 0%, #D97706 100%)',
                  opacity: 0.9,
                }}
              />
              <span style={{ fontSize: '0.64rem', fontWeight: 800, color: '#94A3B8', letterSpacing: '0.06em' }}>
                CRÉDITO À VISTA (1X)
              </span>
            </div>

            <span
              style={{
                padding: '3px 9px',
                borderRadius: 999,
                backgroundColor: brandBadge.bg,
                color: brandBadge.text,
                fontSize: '0.68rem',
                fontWeight: 900,
                letterSpacing: '0.03em',
              }}
            >
              {detectedBrand.toUpperCase()}
            </span>
          </div>

          <div
            style={{
              fontSize: '1.08rem',
              fontWeight: 800,
              letterSpacing: '0.1em',
              fontVariantNumeric: 'tabular-nums',
              color: '#F8FAFC',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {previewMaskedNumber}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '0.56rem', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase' }}>
                Titular
              </div>
              <div
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  color: '#FFFFFF',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {cardHolder.trim() || 'NOME NO CARTÃO'}
              </div>
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '0.56rem', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase' }}>
                Validade
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                {cardExpiry || 'MM/AA'}
              </div>
            </div>
          </div>
        </div>

        {/* Formulário com largura travada e zero overflow horizontal */}
        <form
          onSubmit={handleSubmit}
          style={{
            width: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
            backgroundColor: '#FFFFFF',
            borderRadius: 18,
            border: '1px solid #E2E8F0',
            padding: '16px 14px',
            boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
            display: 'flex',
            flexDirection: 'column',
            gap: 13,
          }}
        >
          {/* Número do Cartão */}
          <div style={{ width: '100%', minWidth: 0 }}>
            <label style={FIELD_LABEL_STYLE}>Número do cartão</label>
            <div style={{ position: 'relative', width: '100%', minWidth: 0 }}>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="0000 0000 0000 0000"
                value={cardNumber}
                onChange={(e) => setCardNumber(formatCardNumberDisplay(e.target.value))}
                required
                style={{
                  ...FIELD_INPUT_STYLE,
                  paddingRight: 72,
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '0.03em',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  pointerEvents: 'none',
                }}
              >
                <CreditCard size={16} color="#64748B" />
                {detectedBrand !== 'Cartão' && (
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#0F172A' }}>
                    {detectedBrand}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Nome Impresso */}
          <div style={{ width: '100%', minWidth: 0 }}>
            <label style={FIELD_LABEL_STYLE}>Nome impresso no cartão</label>
            <input
              type="text"
              autoComplete="cc-name"
              placeholder="Como aparece no cartão"
              value={cardHolder}
              onChange={(e) => setCardHolder(e.target.value)}
              required
              style={{
                ...FIELD_INPUT_STYLE,
                textTransform: 'uppercase',
              }}
            />
          </div>

          {/* Validade (MM/AA) + CVV em 2 colunas seguras (minmax(0, 1fr)) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              gap: 10,
              width: '100%',
              minWidth: 0,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <label style={FIELD_LABEL_STYLE}>Validade</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM/AA"
                maxLength={5}
                value={cardExpiry}
                onChange={(e) => setCardExpiry(formatExpiryMmAa(e.target.value))}
                required
                style={{
                  ...FIELD_INPUT_STYLE,
                  textAlign: 'center',
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
            </div>

            <div style={{ minWidth: 0 }}>
              <label style={FIELD_LABEL_STYLE}>CVV</label>
              <div style={{ position: 'relative', width: '100%', minWidth: 0 }}>
                <input
                  type={showCvv ? 'text' : 'password'}
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  placeholder="•••"
                  maxLength={4}
                  value={cardCvv}
                  onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  required
                  style={{
                    ...FIELD_INPUT_STYLE,
                    textAlign: 'center',
                    paddingRight: 36,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowCvv((v) => !v)}
                  aria-label={showCvv ? 'Ocultar CVV' : 'Mostrar CVV'}
                  style={{
                    position: 'absolute',
                    right: 6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: 'transparent',
                    border: 'none',
                    color: '#64748B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  {showCvv ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          </div>

          {/* CPF do Titular (obrigatório para antifraude/Mercado Pago) */}
          <div style={{ width: '100%', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ ...FIELD_LABEL_STYLE, marginBottom: 0 }}>CPF do titular do cartão</label>
              {isCpfCompleteValid && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    color: '#15803D',
                  }}
                >
                  <CheckCircle2 size={12} /> CPF válido
                </span>
              )}
            </div>
            <input
              type="text"
              inputMode="numeric"
              placeholder="000.000.000-00"
              maxLength={14}
              value={cardCpf}
              onChange={(e) => setCardCpf(formatCPF(e.target.value))}
              required
              style={{
                ...FIELD_INPUT_STYLE,
                fontVariantNumeric: 'tabular-nums',
                borderColor:
                  cpfDigits.length === 11 && !isCpfCompleteValid ? '#EF4444' : '#CBD5E1',
              }}
            />
            <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: 4, lineHeight: 1.3 }}>
              Exigido pelo Mercado Pago e banco emissor para validação antifraude.
            </div>
          </div>

          {errorMsg && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 11,
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#B91C1C',
                fontSize: '0.78rem',
                fontWeight: 700,
                lineHeight: 1.35,
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSaving}
            style={{
              width: '100%',
              height: 50,
              marginTop: 4,
              borderRadius: 14,
              border: 'none',
              backgroundColor: isSaving ? '#334155' : '#0F172A',
              color: '#FFFFFF',
              fontSize: '0.92rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              boxShadow: '0 8px 20px rgba(15, 23, 42, 0.18)',
            }}
          >
            <Lock size={15} color="#76D800" />
            <span>{isSaving ? 'Validando e tokenizando...' : submitLabel}</span>
          </button>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              fontSize: '0.69rem',
              color: '#64748B',
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            <ShieldCheck size={14} color="#16A34A" />
            <span>Seus dados são criptografados e nunca ficam expostos</span>
          </div>
        </form>
      </div>
    </div>
  );

  if (mode === 'fullscreen' && typeof document !== 'undefined') {
    return createPortal(
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10120,
          backgroundColor: '#F8FAFC',
          display: 'flex',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {sheetBody}
      </div>,
      document.body
    );
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {sheetBody}
    </div>
  );
};
