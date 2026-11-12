import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Check, Copy, CreditCard, QrCode, 
  CheckCircle2, ChevronLeft, ShieldCheck
} from 'lucide-react';
import { Ride, SystemConfig, PaymentMethod } from '../types';
import { generatePixPayload, getQrCodeImageUrl } from '../utils/pix';
import { formatRideCode } from '../utils/format';
import confetti from 'canvas-confetti';

interface RidePaymentCheckoutModalProps {
  ride: Ride | null;
  isOpen: boolean;
  onClose: () => void;
  config: SystemConfig;
  onPaymentConfirmed?: (rideId: string, paymentMethod: PaymentMethod) => void;
  isClientView?: boolean;
}

export const RidePaymentCheckoutModal: React.FC<RidePaymentCheckoutModalProps> = ({
  ride,
  isOpen,
  onClose,
  config,
  onPaymentConfirmed,
  isClientView = false,
}) => {
  if (!isOpen || !ride) return null;

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(
    ride.paymentMethod === 'dinheiro' || ride.paymentMethod === 'cartao_credito' || ride.paymentMethod === 'pix'
      ? ride.paymentMethod
      : 'pix'
  );

  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [receivedCashStr, setReceivedCashStr] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Geração do Payload PIX Padrão Banco Central do Brasil
  const pixKey = config.pixKey || 'contato@upmobilidade.com.br';
  const beneficiary = config.pixBeneficiary || config.companyName || 'Kavro Drive';
  
  const pixPayload = useMemo(() => {
    return generatePixPayload(
      pixKey,
      beneficiary,
      'BRASIL',
      ride.totalPrice,
      ride.id.replace(/\D/g, '') || 'UPMOB'
    );
  }, [pixKey, beneficiary, ride.totalPrice, ride.id]);

  const qrCodeUrl = useMemo(() => {
    return getQrCodeImageUrl(pixPayload, 240);
  }, [pixPayload]);

  const handleCopyKey = () => {
    navigator.clipboard.writeText(pixKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(pixPayload);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  // Cálculo de troco para pagamento em dinheiro
  const receivedCash = parseFloat(receivedCashStr.replace(',', '.')) || 0;
  const changeAmount = receivedCash > ride.totalPrice ? receivedCash - ride.totalPrice : 0;

  const handleConfirm = () => {
    setIsProcessing(true);

    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.5 }
      });
    } catch {
      // Ignora erro se confetti falhar
    }

    setTimeout(() => {
      if (onPaymentConfirmed) {
        onPaymentConfirmed(ride.id, selectedMethod);
      }
      setIsProcessing(false);
      onClose();
    }, 500);
  };

  const priceFormatted = `R$ ${ride.totalPrice.toFixed(2).replace('.', ',')}`;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        maxHeight: '100dvh',
        backgroundColor: '#F8FAFC',
        zIndex: 999999,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'fadeIn 0.18s ease-out'
      }}
    >
      {/* ── CABEÇALHO CLEAN E PROFISSIONAL ────── */}
      <div style={{
        backgroundColor: '#FFFFFF',
        color: '#121A21',
        padding: 'calc(10px + env(safe-area-inset-top, 0px)) 16px 10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #E2E8F0',
        flexShrink: 0
      }}>
        <button
          type="button"
          onClick={onClose}
          disabled={isProcessing}
          style={{
            backgroundColor: '#F1F5F9',
            border: '1px solid #E2E8F0',
            borderRadius: 10,
            padding: '6px 11px',
            color: '#1E293B',
            fontSize: '0.8rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer'
          }}
        >
          <ChevronLeft size={17} />
          <span>Voltar</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/logo-icon.png" alt="UP" style={{ width: 26, height: 26, borderRadius: 7, objectFit: 'contain' }} />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#121A21', lineHeight: 1.1 }}>
              {isClientView ? 'Pagamento da Viagem' : 'Recebimento da Corrida'}
            </div>
            <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>
              Código {formatRideCode(ride)}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={isProcessing}
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            backgroundColor: '#F1F5F9',
            border: '1px solid #E2E8F0',
            color: '#475569',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
          title="Fechar"
        >
          <X size={17} />
        </button>
      </div>

      {/* ── CORPO COM ROLAGEM LIVRE E LAYOUT COMPACTO ────── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        padding: '12px 14px 24px 14px'
      }}>
        <div style={{ maxWidth: 480, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* ── CARD CLEAN DE RESUMO DO VALOR & PASSAGEIRO (FUNDO CLARO) ────── */}
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            padding: '12px 16px',
            border: '1.5px solid #E2E8F0',
            boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                backgroundColor: '#F0FDF4',
                border: '1.5px solid #86EFAC',
                color: '#15803D',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.9rem',
                flexShrink: 0
              }}>
                {ride.clientName?.charAt(0).toUpperCase() || 'P'}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {ride.clientName || 'Passageiro'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                  {ride.date ? ride.date.split('-').reverse().join('/') : 'Hoje'} às {ride.time} • {ride.distanceKm ? `${ride.distanceKm} km` : 'Particular'}
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '0.64rem', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Valor Total
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#15803D', letterSpacing: '-0.02em', whiteSpace: 'nowrap', lineHeight: 1.15 }}>
                {priceFormatted}
              </div>
            </div>
          </div>

          {/* ── SELETOR DE FORMA DE PAGAMENTO ────── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 6,
            backgroundColor: '#E2E8F0',
            padding: 4,
            borderRadius: 13
          }}>
            <button
              type="button"
              onClick={() => setSelectedMethod('pix')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '9px 6px',
                borderRadius: 10,
                border: 'none',
                backgroundColor: selectedMethod === 'pix' ? '#FFFFFF' : 'transparent',
                boxShadow: selectedMethod === 'pix' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer',
                fontWeight: selectedMethod === 'pix' ? 800 : 600,
                fontSize: '0.8rem',
                color: selectedMethod === 'pix' ? '#0F172A' : '#64748B'
              }}
            >
              <img width="15" height="15" src="https://img.icons8.com/fluency/48/pix.png" alt="pix" />
              <span>PIX</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedMethod('cartao_credito')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '9px 6px',
                borderRadius: 10,
                border: 'none',
                backgroundColor: selectedMethod === 'cartao_credito' ? '#FFFFFF' : 'transparent',
                boxShadow: selectedMethod === 'cartao_credito' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer',
                fontWeight: selectedMethod === 'cartao_credito' ? 800 : 600,
                fontSize: '0.8rem',
                color: selectedMethod === 'cartao_credito' ? '#0F172A' : '#64748B'
              }}
            >
              <CreditCard size={15} color={selectedMethod === 'cartao_credito' ? '#2563EB' : '#64748B'} />
              <span>Cartão</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedMethod('dinheiro')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '9px 6px',
                borderRadius: 10,
                border: 'none',
                backgroundColor: selectedMethod === 'dinheiro' ? '#FFFFFF' : 'transparent',
                boxShadow: selectedMethod === 'dinheiro' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer',
                fontWeight: selectedMethod === 'dinheiro' ? 800 : 600,
                fontSize: '0.8rem',
                color: selectedMethod === 'dinheiro' ? '#0F172A' : '#64748B'
              }}
            >
              <img width="15" height="15" src="https://img.icons8.com/fluency/48/money.png" alt="dinheiro" />
              <span>Dinheiro</span>
            </button>
          </div>

          {/* ══════════ CONTEÚDO 1: PIX INSTANTÂNEO (COMPACTO E COMPLETO NA TELA) ══════════ */}
          {selectedMethod === 'pix' && (
            <div style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 18,
              padding: '14px 16px',
              border: '1.5px solid #E2E8F0',
              boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600, marginBottom: 10 }}>
                Escaneie o QR Code no aplicativo do banco:
              </div>

              {/* Moldura Clean do QR Code */}
              <div style={{
                backgroundColor: '#FFFFFF',
                padding: 10,
                borderRadius: 16,
                border: '2px solid #86EFAC',
                boxShadow: '0 4px 16px rgba(22, 163, 74, 0.1)',
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginBottom: 12
              }}>
                <img
                  src={qrCodeUrl}
                  alt="QR Code PIX"
                  style={{ width: 175, height: 175, display: 'block', borderRadius: 8 }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                  <img width="15" height="15" src="https://img.icons8.com/fluency/48/pix.png" alt="pix" />
                  <span style={{ fontSize: '0.86rem', fontWeight: 900, color: '#0F172A' }}>
                    {priceFormatted}
                  </span>
                </div>
              </div>

              {/* Card Chave PIX */}
              <div style={{
                width: '100%',
                backgroundColor: '#F8FAFC',
                borderRadius: 12,
                border: '1px solid #E2E8F0',
                padding: '9px 12px',
                textAlign: 'left',
                marginBottom: 8
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.64rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                      Chave PIX • {beneficiary}
                    </div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {pixKey}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyKey}
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      borderRadius: 8,
                      padding: '6px 10px',
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      color: copiedKey ? '#15803D' : '#0F172A',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      flexShrink: 0
                    }}
                  >
                    {copiedKey ? <Check size={13} color="#15803D" /> : <Copy size={13} />}
                    <span>{copiedKey ? 'Copiada!' : 'Copiar Chave'}</span>
                  </button>
                </div>
              </div>

              {/* Botão Copiar Código PIX Copia e Cola */}
              <button
                type="button"
                onClick={handleCopyPayload}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #CBD5E1',
                  borderRadius: 10,
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  color: '#334155',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                {copiedPayload ? <Check size={15} color="#15803D" /> : <QrCode size={15} />}
                <span>{copiedPayload ? 'Código Copia e Cola Copiado!' : 'Copiar Código PIX Copia e Cola'}</span>
              </button>
            </div>
          )}

          {/* ══════════ CONTEÚDO 2: CARTÃO DE CRÉDITO / DÉBITO ══════════ */}
          {selectedMethod === 'cartao_credito' && (
            <div style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 18,
              padding: '20px 18px',
              border: '1.5px solid #E2E8F0',
              boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
              textAlign: 'center'
            }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                backgroundColor: '#EFF6FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px auto'
              }}>
                <CreditCard size={28} color="#2563EB" />
              </div>

              <h3 style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0F172A', margin: '0 0 4px 0' }}>
                Pagamento na Maquininha
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#64748B', maxWidth: 300, margin: '0 auto 14px auto', lineHeight: 1.4 }}>
                Aproxime ou insira o cartão do passageiro na maquininha (Crédito ou Débito).
              </p>

              <div style={{
                backgroundColor: '#F8FAFC',
                borderRadius: 14,
                padding: '12px 16px',
                border: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12
              }}>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                    Valor a Cobrar
                  </div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#0F172A' }}>
                    {priceFormatted}
                  </div>
                </div>
                <div style={{ backgroundColor: '#DBEAFE', color: '#1E40AF', padding: '5px 12px', borderRadius: 999, fontSize: '0.74rem', fontWeight: 800 }}>
                  Crédito / Débito
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: '0.72rem', color: '#15803D', fontWeight: 700 }}>
                <ShieldCheck size={15} />
                <span>Confirme abaixo após a aprovação na maquininha</span>
              </div>
            </div>
          )}

          {/* ══════════ CONTEÚDO 3: DINHEIRO EM MÃOS ══════════ */}
          {selectedMethod === 'dinheiro' && (
            <div style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 18,
              padding: '18px 16px',
              border: '1.5px solid #E2E8F0',
              boxShadow: '0 2px 12px rgba(0,0,0,0.03)'
            }}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#334155', marginBottom: 8 }}>
                  Calculadora Rápida de Troco (opcional):
                </label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  {[20, 50, 100].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setReceivedCashStr(val.toString())}
                      style={{
                        flex: 1,
                        padding: '8px 0',
                        borderRadius: 10,
                        border: '1.5px solid',
                        borderColor: receivedCash === val ? '#16A34A' : '#CBD5E1',
                        backgroundColor: receivedCash === val ? '#F0FDF4' : '#FFFFFF',
                        color: receivedCash === val ? '#15803D' : '#0F172A',
                        fontSize: '0.8rem',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      R$ {val}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setReceivedCashStr(ride.totalPrice.toFixed(2))}
                    style={{
                      flex: 1,
                      padding: '8px 0',
                      borderRadius: 10,
                      border: '1.5px solid',
                      borderColor: receivedCash === ride.totalPrice ? '#16A34A' : '#CBD5E1',
                      backgroundColor: receivedCash === ride.totalPrice ? '#F0FDF4' : '#FFFFFF',
                      color: receivedCash === ride.totalPrice ? '#15803D' : '#0F172A',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    Exato
                  </button>
                </div>

                <input
                  type="text"
                  placeholder="Ou digite o valor recebido (ex: 50,00)"
                  value={receivedCashStr}
                  onChange={(e) => setReceivedCashStr(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1.5px solid #CBD5E1',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {receivedCash > 0 && (
                <div style={{
                  backgroundColor: changeAmount > 0 ? '#FEF3C7' : '#F0FDF4',
                  border: changeAmount > 0 ? '1px solid #FDE68A' : '1px solid #BBF7D0',
                  borderRadius: 12,
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: changeAmount > 0 ? '#B45309' : '#166534' }}>
                    {changeAmount > 0 ? 'Troco para devolver:' : 'Valor exato, sem troco:'}
                  </span>
                  <span style={{ fontSize: '1.15rem', fontWeight: 900, color: changeAmount > 0 ? '#B45309' : '#15803D' }}>
                    R$ {changeAmount.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── RODAPÉ CLEAN DE CONFIRMAÇÃO ────── */}
      <div style={{
        backgroundColor: '#FFFFFF',
        padding: '10px 16px calc(12px + env(safe-area-inset-bottom, 0px)) 16px',
        borderTop: '1px solid #E2E8F0',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.04)',
        flexShrink: 0
      }}>
        <div style={{ maxWidth: 480, margin: '0 auto', width: '100%' }}>
          {isClientView ? (
            <button
              type="button"
              onClick={onClose}
              style={{
                height: 46,
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontSize: '0.9rem',
                fontWeight: 800,
                borderRadius: 12,
                backgroundColor: '#121A21',
                color: '#FFFFFF',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <CheckCircle2 size={18} color="#76D800" />
              <span>Fechar Tela de Pagamento</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isProcessing}
              style={{
                height: 48,
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontSize: '0.92rem',
                fontWeight: 800,
                borderRadius: 13,
                backgroundColor: '#76D800',
                color: '#121A21',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(118, 216, 0, 0.35)'
              }}
            >
              <CheckCircle2 size={19} />
              <span>
                {isProcessing
                  ? 'Confirmando recebimento...'
                  : selectedMethod === 'pix'
                  ? `Confirmar PIX Recebido (${priceFormatted})`
                  : selectedMethod === 'cartao_credito'
                  ? `Confirmar Cartão Pago (${priceFormatted})`
                  : `Confirmar Dinheiro Recebido (${priceFormatted})`}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
