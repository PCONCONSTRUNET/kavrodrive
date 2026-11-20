import React, { useMemo, useState } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Elements, CardElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { Lock } from 'lucide-react';
import { SavedCard } from '../types';
import { StorageService } from '../services/storage';

const stripePromiseCache = new Map<string, Promise<Stripe | null>>();

function getCachedStripePromise(publishableKey: string): Promise<Stripe | null> {
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
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) {
      setErrorMsg('Aguardando carregamento seguro da Stripe...');
      return;
    }
    const cleanHolder = holderName.trim();
    if (!cleanHolder) {
      setErrorMsg('Informe o nome impresso no cartão.');
      return;
    }
    const cardEl = elements.getElement(CardElement);
    if (!cardEl) {
      setErrorMsg('Campo de cartão indisponível.');
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
          card: cardEl,
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
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <button
          type="button"
          onClick={() => onChangeCardType('cartao_credito')}
          style={{
            padding: '9px',
            borderRadius: 10,
            border: cardType === 'cartao_credito' ? '2px solid #121A21' : '1px solid #CBD5E1',
            backgroundColor: cardType === 'cartao_credito' ? '#121A21' : '#F8FAFC',
            color: cardType === 'cartao_credito' ? '#FFFFFF' : '#475569',
            fontWeight: 800,
            fontSize: '0.78rem',
            cursor: 'pointer'
          }}
        >
          Crédito
        </button>
        <button
          type="button"
          onClick={() => onChangeCardType('cartao_debito')}
          style={{
            padding: '9px',
            borderRadius: 10,
            border: cardType === 'cartao_debito' ? '2px solid #121A21' : '1px solid #CBD5E1',
            backgroundColor: cardType === 'cartao_debito' ? '#121A21' : '#F8FAFC',
            color: cardType === 'cartao_debito' ? '#FFFFFF' : '#475569',
            fontWeight: 800,
            fontSize: '0.78rem',
            cursor: 'pointer'
          }}
        >
          Débito
        </button>
      </div>

      <input
        type="text"
        placeholder="Nome impresso no cartão"
        value={holderName}
        onChange={(e) => setHolderName(e.target.value)}
        required
        style={{ padding: '12px', borderRadius: 12, border: '1.5px solid #CBD5E1', fontSize: '0.88rem', fontWeight: 600 }}
      />

      <div
        style={{
          padding: '13px 12px',
          borderRadius: 12,
          border: '1.5px solid #CBD5E1',
          backgroundColor: '#FFFFFF'
        }}
      >
        <CardElement
          options={{
            hidePostalCode: true,
            style: {
              base: {
                fontSize: '15px',
                color: '#0F172A',
                fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
                '::placeholder': { color: '#94A3B8' }
              },
              invalid: { color: '#DC2626' }
            }
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: '#15803D', fontWeight: 700 }}>
        <Lock size={12} />
        <span>Tokenização segura criptografada diretamente via Stripe</span>
      </div>

      {errorMsg && (
        <div style={{ color: '#DC2626', fontSize: '0.76rem', fontWeight: 700 }}>
          {errorMsg}
        </div>
      )}

      <button
        type="submit"
        disabled={saving || !stripe}
        className="btn-ios-primary"
        style={{ width: '100%', padding: '13px', fontSize: '0.9rem', fontWeight: 800, marginTop: 4 }}
      >
        {saving ? 'Validando na Stripe...' : 'Salvar e Usar Cartão'}
      </button>
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
