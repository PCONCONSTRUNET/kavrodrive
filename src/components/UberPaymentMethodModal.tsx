import React from 'react';
import { Check, Plus, X } from 'lucide-react';
import { PaymentMethod, SavedCard } from '../types';
import { PaymentMethodIcon } from './PaymentMethodIcon';

interface UberPaymentMethodModalProps {
  isOpen: boolean;
  embedded?: boolean;
  paymentMethod: PaymentMethod;
  totalPrice: number;
  baseTotalPrice?: number;
  cardFeePercent?: number;
  cardFeeAmount?: number;
  walletBalance: number;
  isLoggedIn: boolean;
  allowCash: boolean;
  allowPix: boolean;
  allowWallet: boolean;
  allowCreditCard: boolean;
  gatewayProvider?: 'efibank' | 'mercadopago' | 'sandbox';
  savedCards: SavedCard[];
  selectedCardId: string;
  onClose: () => void;
  onSelectMethod: (method: PaymentMethod, cardId?: string) => void;
  onOpenWalletDeposit: () => void;
  onOpenAddCard: () => void;
}

export const UberPaymentMethodModal: React.FC<UberPaymentMethodModalProps> = ({
  isOpen,
  embedded = false,
  paymentMethod,
  totalPrice,
  baseTotalPrice,
  cardFeePercent = 0,
  cardFeeAmount = 0,
  walletBalance,
  isLoggedIn,
  allowCash,
  allowPix,
  allowWallet,
  allowCreditCard,
  gatewayProvider,
  savedCards,
  selectedCardId,
  onClose,
  onSelectMethod,
  onOpenWalletDeposit,
  onOpenAddCard,
}) => {
  if (!isOpen) return null;

  const pixGatewaySuffix =
    gatewayProvider === 'efibank'
      ? ' (Efí Bank)'
      : gatewayProvider === 'mercadopago'
        ? ' (Mercado Pago)'
        : '';

  const isWalletSelected = paymentMethod === 'carteira';
  const walletRequiredTotal = baseTotalPrice !== undefined ? baseTotalPrice : totalPrice;
  const hasEnoughWalletBalance = isLoggedIn && walletBalance + 0.001 >= walletRequiredTotal;
  const resolvedCardFeeAmt =
    cardFeeAmount > 0
      ? cardFeeAmount
      : cardFeePercent > 0 && walletRequiredTotal > 0
        ? Math.round(walletRequiredTotal * (cardFeePercent / 100) * 100) / 100
        : 0;
  const totalCardCharge = Math.round((walletRequiredTotal + resolvedCardFeeAmt) * 100) / 100;
  const basePriceLabel = walletRequiredTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const cardPriceLabel = totalCardCharge.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const handleToggleWallet = () => {
    if (isWalletSelected) {
      if (allowCash) {
        onSelectMethod('dinheiro');
      } else if (allowPix) {
        onSelectMethod('pix');
      }
      return;
    }
    if (!isLoggedIn || !hasEnoughWalletBalance) {
      onOpenWalletDeposit();
      return;
    }
    onSelectMethod('carteira');
    onClose();
  };

  return (
    <div
      className="animate-fade-in"
      style={
        embedded
          ? {
              flex: 1,
              minHeight: 0,
              minWidth: 0,
              width: '100%',
              overflowX: 'hidden',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#FFFFFF',
              color: '#0F172A',
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            }
          : {
              position: 'fixed',
              inset: 0,
              width: '100%',
              maxWidth: 480,
              margin: '0 auto',
              overflowX: 'hidden',
              boxSizing: 'border-box',
              backgroundColor: '#FFFFFF',
              zIndex: 10050,
              display: 'flex',
              flexDirection: 'column',
              color: '#0F172A',
              fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            }
      }
    >
      {/* Topo com X + Título "Pague com" (igual Print 4 da Uber) */}
      <div
        style={{
          padding: 'calc(14px + env(safe-area-inset-top, 0px)) 18px 16px 18px',
          borderBottom: '1px solid #F1F5F9',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar formas de pagamento"
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            border: 'none',
            backgroundColor: '#F1F5F9',
            color: '#0F172A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            marginBottom: 14,
          }}
        >
          <X size={20} />
        </button>

        <h1
          style={{
            margin: 0,
            fontSize: '1.72rem',
            fontWeight: 900,
            color: '#0F172A',
            letterSpacing: '-0.03em',
          }}
        >
          Pague com
        </h1>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '18px 18px calc(24px + env(safe-area-inset-bottom, 0px)) 18px',
        }}
      >
        {/* Seção Saldo Kavro (Carteira Digital com Toggle) */}
        {allowWallet && (
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 14,
              }}
            >
              <div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
                  Saldo Kavro
                </div>
                <div style={{ fontSize: '0.76rem', color: '#64748B', fontWeight: 600 }}>
                  {hasEnoughWalletBalance
                    ? 'Usar créditos da sua carteira nessa viagem'
                    : isLoggedIn
                      ? `Adicione saldo (mín. R$ 20) para pagar com a carteira`
                      : 'Entre na sua conta para usar seu saldo'}
                </div>
              </div>

              {/* Switch estilo iOS / Uber */}
              <button
                type="button"
                role="switch"
                aria-checked={isWalletSelected}
                onClick={handleToggleWallet}
                style={{
                  width: 52,
                  height: 30,
                  borderRadius: 999,
                  border: 'none',
                  padding: 3,
                  backgroundColor: isWalletSelected ? '#16A34A' : '#E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: isWalletSelected ? 'flex-end' : 'flex-start',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    backgroundColor: '#FFFFFF',
                    boxShadow: '0 2px 6px rgba(15, 23, 42, 0.22)',
                    display: 'block',
                  }}
                />
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '12px 14px',
                borderRadius: 14,
                backgroundColor: '#F8FAFC',
                border: isWalletSelected ? '1.5px solid #16A34A' : '1px solid #E2E8F0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <PaymentMethodIcon method="carteira" size={24} />
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>
                    Créditos Kavro: {walletBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                    Recarga instantânea via PIX{pixGatewaySuffix}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onOpenWalletDeposit}
                style={{
                  padding: '6px 11px',
                  borderRadius: 999,
                  border: 'none',
                  backgroundColor: '#0F172A',
                  color: '#76D800',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <Plus size={12} />
                <span>Recarregar</span>
              </button>
            </div>
          </div>
        )}

        {/* Seção Formas de pagamento */}
        <div>
          <h2
            style={{
              margin: '0 0 10px 0',
              fontSize: '1.15rem',
              fontWeight: 900,
              color: '#0F172A',
            }}
          >
            Formas de pagamento
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {allowCash && (
              <button
                type="button"
                onClick={() => {
                  onSelectMethod('dinheiro');
                  onClose();
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '13px 12px',
                  backgroundColor: paymentMethod === 'dinheiro' ? '#F8FAFC' : '#FFFFFF',
                  border: paymentMethod === 'dinheiro' ? '1.5px solid #0F172A' : '1px solid #F1F5F9',
                  borderRadius: 14,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                  <PaymentMethodIcon method="dinheiro" size={26} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0F172A' }}>
                      Dinheiro
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 500 }}>
                      Pague diretamente ao motorista na entrega ou embarque
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  {walletRequiredTotal > 0 && (
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
                      {basePriceLabel}
                    </span>
                  )}
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      border: paymentMethod === 'dinheiro' ? '2px solid #0F172A' : '1.5px solid #CBD5E1',
                      backgroundColor: paymentMethod === 'dinheiro' ? '#0F172A' : 'transparent',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {paymentMethod === 'dinheiro' && <Check size={14} strokeWidth={3} />}
                  </div>
                </div>
              </button>
            )}

            {allowPix && (
              <button
                type="button"
                onClick={() => {
                  onSelectMethod('pix');
                  onClose();
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '13px 12px',
                  backgroundColor: paymentMethod === 'pix' ? '#F8FAFC' : '#FFFFFF',
                  border: paymentMethod === 'pix' ? '1.5px solid #0F172A' : '1px solid #F1F5F9',
                  borderRadius: 14,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                  <PaymentMethodIcon method="pix" size={26} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0F172A' }}>
                      PIX
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 500 }}>
                      QR Code ou Copia e Cola instantâneo{pixGatewaySuffix}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  {walletRequiredTotal > 0 && (
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
                      {basePriceLabel}
                    </span>
                  )}
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      border: paymentMethod === 'pix' ? '2px solid #0F172A' : '1.5px solid #CBD5E1',
                      backgroundColor: paymentMethod === 'pix' ? '#0F172A' : 'transparent',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {paymentMethod === 'pix' && <Check size={14} strokeWidth={3} />}
                  </div>
                </div>
              </button>
            )}

            {allowCreditCard && savedCards.map((c) => {
              const isCardSelected =
                (paymentMethod === 'cartao_credito' || paymentMethod === 'cartao_debito') &&
                selectedCardId === c.id;
              const rowCardPriceLabel = c.cardType === 'cartao_debito' ? basePriceLabel : cardPriceLabel;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onSelectMethod(c.cardType, c.id);
                    onClose();
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '13px 12px',
                    backgroundColor: isCardSelected ? '#F8FAFC' : '#FFFFFF',
                    border: isCardSelected ? '1.5px solid #0F172A' : '1px solid #F1F5F9',
                    borderRadius: 14,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                    <PaymentMethodIcon method="cartao_credito" size={26} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0F172A' }}>
                        {String(c.brand || 'Cartão').toUpperCase()} •••• {c.last4}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                        {c.cardType === 'cartao_debito' ? 'Débito (à vista)' : 'Crédito à vista (1x)'} • Val {c.expMonth}/{c.expYear}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {walletRequiredTotal > 0 && (
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
                        {rowCardPriceLabel}
                      </span>
                    )}
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        border: isCardSelected ? '2px solid #0F172A' : '1.5px solid #CBD5E1',
                        backgroundColor: isCardSelected ? '#0F172A' : 'transparent',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {isCardSelected && <Check size={14} strokeWidth={3} />}
                    </div>
                  </div>
                </button>
              );
            })}

            {allowCreditCard && (
              <button
                type="button"
                onClick={onOpenAddCard}
                style={{
                  width: '100%',
                  marginTop: savedCards.length > 0 ? 4 : 0,
                  padding: '13px 12px',
                  borderRadius: 14,
                  border: '1.5px dashed #CBD5E1',
                  backgroundColor: '#F8FAFC',
                  color: '#0F172A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                  <PaymentMethodIcon method="cartao_credito" size={26} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>
                      {savedCards.length > 0 ? 'Adicionar novo cartão' : 'Cartão de Crédito ou Débito'}
                    </div>
                    <div style={{ fontSize: '0.73rem', color: '#64748B', fontWeight: 500 }}>
                      Cobrança à vista (1x) • Visa, Mastercard, Elo
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <span
                    style={{
                      padding: '5px 10px',
                      borderRadius: 999,
                      backgroundColor: '#0F172A',
                      color: '#FFFFFF',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      flexShrink: 0,
                    }}
                  >
                    <Plus size={12} />
                    <span>Adicionar</span>
                  </span>
                  {walletRequiredTotal > 0 && (
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
                      {cardPriceLabel}
                    </span>
                  )}
                </div>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
