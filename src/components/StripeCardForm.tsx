import React, { useMemo, useState } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useElements,
  useStripe
} from '@stripe/react-stripe-js';
import { CreditCard, Lock, ShieldCheck } from 'lucide-react';
import { SavedCard } from '../types';
import { StorageService } from '../services/storage';

const stripePromiseCache = new Map<string, Promise<Stripe | null>>();

export function getCachedStripePromise(publishableKey: string): Promise<Stripe | null> {
  const key = String(publishableKey || '').trim();
  if (!stripePromiseCache.has(key)) {
    stripePromiseCache.set(key, loadStripe(key));
  }
  return stripePromiseCache.get(key)!;
}

export async function confirmStripe3dsPaymentIntent(
  publishableKey: string,
  clientSecret: string
): Promise<{ ok: boolean; paymentIntentId?: string; error?: string }> {
  try {
    const stripe = await getCachedStripePromise(publishableKey);
    if (!stripe) {
      return { ok: false, error: 'Não foi possível inicializar a biblioteca segura da Stripe.' };
    }
    const result = await stripe.confirmCardPayment(clientSecret);
    if (result.error) {
      return { ok: false, error: result.error.message || 'Autenticação 3DS não aprovada.' };
    }
    if (
      result.paymentIntent?.status === 'requires_capture' ||
      result.paymentIntent?.status === 'succeeded'
    ) {
      return { ok: true, paymentIntentId: result.paymentIntent.id };
    }
    return {
      ok: false,
      error: `Status do pagamento após autenticação: ${result.paymentIntent?.status || 'desconhecido'}`
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Erro durante verificação 3DS na Stripe.' };
  }
}

function formatBrandLabel(rawBrand: string): string {
  const b = String(rawBrand || '').toLowerCase();
  if (!b || b === 'unknown') return 'KAVRO PAY';
  if (b === 'visa') return 'VISA';
  if (b === 'mastercard') return 'MASTERCARD';
  if (b === 'amex') return 'AMEX';
  if (b === 'elo') return 'ELO';
  if (b === 'hipercard') return 'HIPERCARD';
  return b.toUpperCase();
}

const STRIPE_INPUT_STYLE = {
  base: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#0F172A',
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    '::placeholder': { color: '#94A3B8' }
  },
  invalid: { color: '#DC2626' }
};

interface StripeCardInnerProps {
  clientId?: string;
  clientPhone?: string;
  clientEmail?: string;
  defaultHolderName?: string;
  cardType: 'cartao_credito' | 'cartao_debito';
  onChangeCardType: (t: 'cartao_credito' | 'cartao_debito') => void;
  onCardSaved: (card: SavedCard) => void;
}

const StripeCardInnerForm: React.FC<StripeCardInnerProps> = ({
  clientId,
  clientPhone,
  clientEmail,
  defaultHolderName = '',
  cardType,
  onChangeCardType,
  onCardSaved
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [holderName, setHolderName] = useState(defaultHolderName);
  const [detectedBrand, setDetectedBrand] = useState('unknown');
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) {
      setErrorMsg('Aguardando inicialização segura da Stripe...');
      return;
    }
    const cleanHolder = holderName.trim();
    if (!cleanHolder) {
      setErrorMsg('Informe o nome impresso no cartão.');
      return;
    }
    const cardNumberEl = elements.getElement(CardNumberElement);
    if (!cardNumberEl) {
      setErrorMsg('Campo de número do cartão indisponível.');
      return;
    }

    setErrorMsg('');
    setSaving(true);
    try {
      const setupRes = await StorageService.createStripeSetupIntent({
        clientId,
        clientPhone,
        clientEmail,
        clientName: cleanHolder
      });
      if (!setupRes.ok || !setupRes.clientSecret) {
        setSaving(false);
        setErrorMsg(setupRes.error || 'Erro ao iniciar tokenização segura na Stripe.');
        return;
      }

      const confirmRes = await stripe.confirmCardSetup(setupRes.clientSecret, {
        payment_method: {
          card: cardNumberEl,
          billing_details: {
            name: cleanHolder,
            email: clientEmail || undefined,
            phone: clientPhone || undefined
          }
        }
      });

      if (confirmRes.error) {
        setSaving(false);
        setErrorMsg(confirmRes.error.message || 'Dados do cartão não aceitos pela Stripe.');
        return;
      }

      const pmId =
        typeof confirmRes.setupIntent?.payment_method === 'string'
          ? confirmRes.setupIntent.payment_method
          : confirmRes.setupIntent?.payment_method?.id;

      const saveRes = await StorageService.saveTokenizedCard({
        clientId,
        clientPhone,
        holderName: cleanHolder,
        cardType,
        stripeSetupIntentId: confirmRes.setupIntent?.id || setupRes.setupIntentId,
        stripePaymentMethodId: pmId
      });

      setSaving(false);
      if (!saveRes.ok || !saveRes.card) {
        setErrorMsg(saveRes.error || 'Falha ao salvar cartão tokenizado.');
        return;
      }
      onCardSaved(saveRes.card);
    } catch (err: any) {
      setSaving(false);
      setErrorMsg(err?.message || 'Erro inesperado ao salvar cartão.');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
      {/* Pré-visualização Personalizada do Cartão Kavro Drive */}
      <div style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 18,
        padding: '18px 18px',
        background: 'linear-gradient(135deg, #0B1117 0%, #1E293B 68%, #14532D 145%)',
        color: '#FFFFFF',
        boxShadow: '0 12px 28px rgba(15, 23, 42, 0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <img
            src="/logo-horizontal-white.png"
            alt="KAVRO DRIVE"
            style={{ height: 20, objectFit: 'contain' }}
          />
          <span style={{
            fontSize: '0.64rem',
            fontWeight: 800,
            letterSpacing: '0.06em',
            padding: '3px 10px',
            borderRadius: 999,
            backgroundColor: 'rgba(255, 255, 255, 0.14)',
            color: '#E2E8F0',
            textTransform: 'uppercase'
          }}>
            {cardType === 'cartao_debito' ? 'Débito' : 'Crédito'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{
            width: 36,
            height: 26,
            borderRadius: 6,
            background: 'linear-gradient(135deg, #FDE68A 0%, #D97706 100%)',
            opacity: 0.92
          }} />
          <span style={{
            fontSize: '0.82rem',
            fontWeight: 900,
            letterSpacing: '0.08em',
            color: '#86EFAC'
          }}>
            {formatBrandLabel(detectedBrand)}
          </span>
        </div>

        <div style={{
          fontSize: '1rem',
          fontWeight: 700,
          letterSpacing: '0.16em',
          color: '#F8FAFC',
          fontFamily: 'monospace',
          marginBottom: 10
        }}>
          ••••  ••••  ••••  ••••
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            color: '#CBD5E1',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {holderName.trim() || 'SEU NOME NO CARTÃO'}
          </span>
          <span style={{ fontSize: '0.66rem', color: '#94A3B8', fontWeight: 700 }}>
            STRIPE SECURE
          </span>
        </div>
      </div>

      {/* Pills compactas Crédito / Débito */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => onChangeCardType('cartao_credito')}
          style={{
            padding: '7px 18px',
            borderRadius: 999,
            border: cardType === 'cartao_credito' ? '1.5px solid #0F172A' : '1px solid #CBD5E1',
            backgroundColor: cardType === 'cartao_credito' ? '#0F172A' : '#F8FAFC',
            color: cardType === 'cartao_credito' ? '#FFFFFF' : '#475569',
            fontWeight: 800,
            fontSize: '0.76rem',
            cursor: 'pointer'
          }}
        >
          Crédito
        </button>
        <button
          type="button"
          onClick={() => onChangeCardType('cartao_debito')}
          style={{
            padding: '7px 18px',
            borderRadius: 999,
            border: cardType === 'cartao_debito' ? '1.5px solid #0F172A' : '1px solid #CBD5E1',
            backgroundColor: cardType === 'cartao_debito' ? '#0F172A' : '#F8FAFC',
            color: cardType === 'cartao_debito' ? '#FFFFFF' : '#475569',
            fontWeight: 800,
            fontSize: '0.76rem',
            cursor: 'pointer'
          }}
        >
          Débito
        </button>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
          Nome impresso no cartão
        </label>
        <input
          type="text"
          placeholder="Ex: LUCAS P SOUZA"
          value={holderName}
          onChange={(e) => setHolderName(e.target.value)}
          required
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px 12px',
            borderRadius: 11,
            border: '1.5px solid #CBD5E1',
            fontSize: '0.84rem',
            fontWeight: 600,
            color: '#0F172A'
          }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
          Número do cartão
        </label>
        <div style={{
          padding: '11px 12px',
          borderRadius: 11,
          border: '1.5px solid #CBD5E1',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <CreditCard size={15} color="#64748B" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <CardNumberElement
              onChange={(ev) => {
                if (ev.brand) setDetectedBrand(ev.brand);
              }}
              options={{
                showIcon: false,
                placeholder: '0000 0000 0000 0000',
                style: STRIPE_INPUT_STYLE
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
            Validade
          </label>
          <div style={{
            padding: '11px 12px',
            borderRadius: 11,
            border: '1.5px solid #CBD5E1',
            backgroundColor: '#FFFFFF'
          }}>
            <CardExpiryElement options={{ placeholder: 'MM / AA', style: STRIPE_INPUT_STYLE }} />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
            Código (CVV)
          </label>
          <div style={{
            padding: '11px 12px',
            borderRadius: 11,
            border: '1.5px solid #CBD5E1',
            backgroundColor: '#FFFFFF'
          }}>
            <CardCvcElement options={{ placeholder: '123', style: STRIPE_INPUT_STYLE }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: '0.69rem', color: '#15803D', fontWeight: 700 }}>
        <ShieldCheck size={13} />
        <span>Criptografia ponta a ponta Stripe — sem armazenar número ou CVV</span>
      </div>

      {errorMsg && (
        <div style={{
          backgroundColor: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: 10,
          padding: '8px 10px',
          color: '#DC2626',
          fontSize: '0.75rem',
          fontWeight: 700,
          textAlign: 'center'
        }}>
          {errorMsg}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'auto', paddingTop: 10 }}>
        <button
          type="submit"
          disabled={saving || !stripe}
          style={{
            padding: '11px 28px',
            borderRadius: 999,
            border: 'none',
            backgroundColor: '#0F172A',
            color: '#FFFFFF',
            fontSize: '0.84rem',
            fontWeight: 800,
            cursor: saving || !stripe ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            opacity: saving || !stripe ? 0.65 : 1,
            boxShadow: '0 6px 16px rgba(15, 23, 42, 0.2)'
          }}
        >
          <Lock size={14} color="#76D800" />
          <span>{saving ? 'Validando cartão...' : 'Salvar e usar cartão'}</span>
        </button>
      </div>
    </form>
  );
};

interface StripeCardFormProps extends StripeCardInnerProps {
  publishableKey: string;
}

export const StripeCardForm: React.FC<StripeCardFormProps> = ({ publishableKey, ...innerProps }) => {
  const stripePromise = useMemo(() => getCachedStripePromise(publishableKey), [publishableKey]);
  return (
    <Elements stripe={stripePromise} options={{ locale: 'pt-BR' }}>
      <StripeCardInnerForm {...innerProps} />
    </Elements>
  );
};
