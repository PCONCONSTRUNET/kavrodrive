import React, { useMemo, useState } from 'react';
import { Elements, ExpressCheckoutElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { ShieldCheck, Smartphone } from 'lucide-react';
import { LocationPoint, RideDeliveryDetails } from '../types';
import { StorageService } from '../services/storage';
import { getCachedStripePromise } from './StripeCardForm';

interface StripeWalletCheckoutProps {
  publishableKey: string;
  amountBrl: number;
  category: string;
  distanceKm: number;
  durationMin: number;
  time: string;
  origin?: LocationPoint | null;
  destination?: LocationPoint | null;
  clientId?: string;
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  onBeforeConfirm: () => { ok: boolean; error?: string; deliveryDetails?: RideDeliveryDetails | null };
  onWalletAuthorized: (result: { paymentIntentId: string; brand: string }) => Promise<void>;
}

const StripeWalletInner: React.FC<Omit<StripeWalletCheckoutProps, 'publishableKey'>> = ({
  amountBrl,
  category,
  distanceKm,
  durationMin,
  time,
  origin,
  destination,
  clientId,
  clientName,
  clientPhone,
  clientEmail,
  onBeforeConfirm,
  onWalletAuthorized
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [hasExpressWallets, setHasExpressWallets] = useState<boolean>(false);
  const [availableNames, setAvailableNames] = useState<string[]>([]);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [walletError, setWalletError] = useState<string>('');
  const [isAuthorizing, setIsAuthorizing] = useState<boolean>(false);

  const handleConfirm = async (event: any) => {
    setWalletError('');
    if (!stripe || !elements) {
      event?.paymentFailed?.({ reason: 'fail', message: 'Stripe ainda está carregando.' });
      return;
    }

    const prep = onBeforeConfirm();
    if (!prep.ok) {
      if (prep.error) setWalletError(prep.error);
      event?.paymentFailed?.({
        reason: 'invalid_payment_data',
        message: prep.error || 'Complete o endereço e os dados da viagem antes de pagar.'
      });
      return;
    }

    setIsAuthorizing(true);
    try {
      const submitRes = await elements.submit();
      if (submitRes.error) {
        setWalletError(submitRes.error.message || 'Dados inválidos na carteira digital.');
        event?.paymentFailed?.({ reason: 'invalid_payment_data', message: submitRes.error.message });
        return;
      }

      const intentRes = await StorageService.createStripeWalletIntent({
        clientId,
        clientName,
        clientPhone,
        clientEmail,
        category,
        distanceKm,
        durationMin,
        time,
        origin: origin || undefined,
        destination: destination || undefined,
        amountBrl
      });

      if (!intentRes.ok || !intentRes.clientSecret || !intentRes.paymentIntentId) {
        const msg = intentRes.error || 'Não foi possível preparar a cobrança via Apple Pay / Carteira.';
        setWalletError(msg);
        event?.paymentFailed?.({ reason: 'fail', message: msg });
        return;
      }

      const confirmRes = await stripe.confirmPayment({
        elements,
        clientSecret: intentRes.clientSecret,
        confirmParams: {
          return_url: typeof window !== 'undefined' ? window.location.href : 'https://kavrodrive.vercel.app/'
        },
        redirect: 'if_required'
      });

      if (confirmRes.error) {
        const msg = confirmRes.error.message || 'Autorização cancelada ou recusada.';
        setWalletError(msg);
        event?.paymentFailed?.({ reason: 'fail', message: msg });
        return;
      }

      const rawType = String(event?.expressPaymentType || '');
      const brandLabel =
        rawType === 'apple_pay'
          ? 'Apple Pay'
          : rawType === 'google_pay'
            ? 'Google Pay'
            : 'Carteira Digital';

      await onWalletAuthorized({
        paymentIntentId: confirmRes.paymentIntent?.id || intentRes.paymentIntentId,
        brand: brandLabel
      });
    } catch (err: any) {
      const msg = err?.message || 'Erro ao finalizar com carteira digital.';
      setWalletError(msg);
      event?.paymentFailed?.({ reason: 'fail', message: msg });
    } finally {
      setIsAuthorizing(false);
    }
  };

  return (
    <div style={{
      marginTop: 8,
      padding: '10px 12px',
      borderRadius: 12,
      backgroundColor: '#FFFFFF',
      border: '1px solid #E2E8F0'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginBottom: hasExpressWallets ? 8 : 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Smartphone size={14} color="#0F172A" />
          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0F172A' }}>
            Apple Pay & Carteiras Expressas
          </span>
        </div>
        <span style={{
          fontSize: '0.64rem',
          fontWeight: 800,
          color: '#15803D',
          backgroundColor: '#F0FDF4',
          border: '1px solid #BBF7D0',
          padding: '2px 8px',
          borderRadius: 999
        }}>
          Stripe Ativo
        </span>
      </div>

      <div style={{ display: hasExpressWallets ? 'block' : 'none' }}>
        <ExpressCheckoutElement
          options={{
            buttonHeight: 42,
            buttonTheme: {
              applePay: 'black',
              googlePay: 'black'
            },
            buttonType: {
              applePay: 'book',
              googlePay: 'pay'
            },
            paymentMethodOrder: ['apple_pay', 'google_pay', 'link'],
            paymentMethods: {
              applePay: 'auto',
              googlePay: 'auto',
              link: 'auto'
            },
            layout: {
              maxColumns: 2,
              maxRows: 1
            }
          }}
          onReady={(e) => {
            setIsReady(true);
            const av = e?.availablePaymentMethods;
            const activeList: string[] = [];
            if (av?.applePay) activeList.push('Apple Pay');
            if (av?.googlePay) activeList.push('Google Pay');
            if (av?.link) activeList.push('Stripe Link');
            setAvailableNames(activeList);
            setHasExpressWallets(activeList.length > 0);
          }}
          onConfirm={handleConfirm}
        />
      </div>

      {isReady && !hasExpressWallets && (
        <div style={{
          marginTop: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: '0.7rem',
          color: '#64748B',
          lineHeight: 1.35
        }}>
          <ShieldCheck size={13} color="#16A34A" style={{ flexShrink: 0 }} />
          <span>
            Apple Pay pronto na Stripe — exibido automaticamente no Safari / iPhone com carteira configurada.
          </span>
        </div>
      )}

      {isReady && hasExpressWallets && availableNames.length > 0 && (
        <div style={{ marginTop: 6, fontSize: '0.67rem', color: '#64748B', textAlign: 'center' }}>
          {isAuthorizing ? 'Autorizando na carteira digital...' : `Disponível neste aparelho: ${availableNames.join(' • ')}`}
        </div>
      )}

      {walletError && (
        <div style={{ marginTop: 6, fontSize: '0.73rem', fontWeight: 700, color: '#DC2626' }}>
          {walletError}
        </div>
      )}
    </div>
  );
};

export const StripeWalletCheckout: React.FC<StripeWalletCheckoutProps> = ({
  publishableKey,
  amountBrl,
  ...rest
}) => {
  const stripePromise = useMemo(() => getCachedStripePromise(publishableKey), [publishableKey]);
  const amountCents = Math.max(50, Math.round((Number(amountBrl) || 0) * 100));

  if (!publishableKey) return null;

  return (
    <Elements
      key={`wallet-${amountCents}`}
      stripe={stripePromise}
      options={{
        mode: 'payment',
        amount: amountCents,
        currency: 'brl',
        captureMethod: 'manual',
        locale: 'pt-BR',
        appearance: {
          theme: 'stripe',
          variables: {
            borderRadius: '12px',
            colorPrimary: '#0F172A'
          }
        }
      }}
    >
      <StripeWalletInner amountBrl={amountBrl} {...rest} />
    </Elements>
  );
};
