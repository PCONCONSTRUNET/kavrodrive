import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Download, Check, Car, Star, Zap,
  AlertTriangle, RotateCcw,
  ChevronRight, Copy, Image as ImageIcon
} from 'lucide-react';
import { Ride, SystemConfig } from '../types';
import { WhatsAppIcon } from './WhatsAppIcon';
import { PassengerLiveMap } from './PassengerLiveMap';
import { formatCurrency, formatPhone, formatRideCode, getCleanWhatsappNumber } from '../utils/format';
import { downloadElementAsPdf, downloadElementAsImage } from '../utils/pdfGenerator';
import { PaymentMethodIcon } from './PaymentMethodIcon';

interface RideReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  ride: Ride;
  config: SystemConfig;
}

const SHORT_MONTHS_PT = [
  'jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.',
  'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'
];

function formatReceiptHeroDateTime(dateStr?: string, timeStr?: string): string {
  const safeTime = (timeStr || '').trim();
  if (!dateStr || !dateStr.includes('-')) {
    return safeTime || 'Hoje';
  }
  const [yearPart, monthPart, dayPart] = dateStr.split('-');
  const dayNum = parseInt(dayPart, 10);
  const monthIdx = parseInt(monthPart, 10) - 1;
  const monthLabel = SHORT_MONTHS_PT[monthIdx] || monthPart;
  const dateLabel = Number.isFinite(dayNum) ? `${dayNum} de ${monthLabel} de ${yearPart}` : dateStr;
  return safeTime ? `${dateLabel}, ${safeTime}` : dateLabel;
}

function formatReceiptDateSlash(dateStr?: string, timeStr?: string): string {
  if (!dateStr || !dateStr.includes('-')) return timeStr || '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}${timeStr ? ` ${timeStr}` : ''}`;
}

function getPeriodGreeting(timeStr?: string): string {
  const hour = parseInt(String(timeStr || '12').split(':')[0], 10);
  if (Number.isNaN(hour)) return '';
  if (hour >= 5 && hour < 12) return ' hoje de manhã';
  if (hour >= 12 && hour < 18) return ' hoje à tarde';
  return ' hoje à noite';
}

function formatHourFromIso(iso?: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

export const RideReceiptModal: React.FC<RideReceiptModalProps> = ({
  isOpen,
  onClose,
  ride,
  config,
}) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadFeedback, setDownloadFeedback] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen || !ride) return null;

  const companyName = config.companyName || 'Kavro Drive';
  const rideCode = formatRideCode(ride);
  const publicTrackingUrl = `${window.location.origin}/viagem/${ride.id}`;

  const isCancelled = ride.status === 'cancelada';
  const hasCancellationFee = Boolean(ride.cancellationFeeApplied && ride.cancellationFeeApplied > 0);
  const displayTotal = isCancelled
    ? (hasCancellationFee ? Number(ride.cancellationFeeApplied) : 0)
    : Number(ride.totalPrice || 0);

  const estimatedTotal = Number(ride.estimatedPrice || 0);
  const hasPriceAdjustment =
    !isCancelled &&
    estimatedTotal > 0 &&
    Math.abs(estimatedTotal - displayTotal) > 0.05;

  const isPaid =
    ride.paymentStatus === 'pago' ||
    ride.paymentStatus === 'confirmado' ||
    ride.paymentStatus === 'parcialmente_pago' ||
    ride.paymentStatus === 'parcial';
  const isRefunded = ride.paymentStatus === 'reembolsado';

  const paymentMethodLabelMap: Record<string, string> = {
    pix: 'PIX',
    dinheiro: 'Dinheiro',
    cartao_credito: ride.cardLast4 ? `Cartão •••• ${ride.cardLast4}` : 'Cartão de Crédito',
    cartao_debito: ride.cardLast4 ? `Débito •••• ${ride.cardLast4}` : 'Cartão de Débito',
    apple_pay: ride.cardLast4 ? `Apple Pay •••• ${ride.cardLast4}` : 'Apple Pay',
    carteira: 'Saldo da Carteira',
    online: 'Pagamento Online',
  };
  const paymentMethodLabel = paymentMethodLabelMap[ride.paymentMethod] || 'PIX';

  const tipMatch = String(ride.passengerNotes || '').match(/Gorjeta:\s*R\$\s*([\d.,]+)/i);
  const recordedTipAmount = tipMatch ? parseFloat(tipMatch[1].replace('.', '').replace(',', '.')) || 0 : 0;

  const commPercent = Number(ride.commissionPercent ?? ride.appliedFareSnapshot?.commissionPercent ?? 20);
  const commFixed = displayTotal > 0 ? Number(ride.commissionFixed ?? ride.appliedFareSnapshot?.commissionFixed ?? 0) : 0;
  const platformTotal = displayTotal <= 0
    ? 0
    : ride.commissionAmount !== undefined
      ? Number(ride.commissionAmount)
      : Math.min(displayTotal, Math.round(((displayTotal * commPercent) / 100 + commFixed) * 100) / 100);
  const driverTotal = displayTotal <= 0
    ? 0
    : ride.driverNetAmount !== undefined
      ? Number(ride.driverNetAmount)
      : Math.max(0, Math.round((displayTotal - platformTotal) * 100) / 100);

  const clientFirstName = (ride.clientName || 'Passageiro').trim().split(/\s+/)[0];
  const driverDisplayName = (ride.driverName || config.driverName || 'Motorista Parceiro').trim();
  const driverFirstName = driverDisplayName.split(/\s+/)[0];
  const categoryLabel = ride.categoryName || ride.appliedFareSnapshot?.categoryName || 'KAVRO GO';
  const isElectricCat = String(ride.category || '').toLowerCase().includes('exec') ||
    String(ride.category || '').toLowerCase().includes('plus');
  const dropoffHour = ride.status === 'finalizada' ? formatHourFromIso(ride.updatedAt) : '';

  const handleShareWhatsapp = () => {
    const text = `🧾 *RECIBO OFICIAL - ${companyName.toUpperCase()}*
━━━━━━━━━━━━━━━━━━━━
*Viagem:* ${rideCode} (${categoryLabel})
*Data:* ${ride.date} às ${ride.time}
*Passageiro:* ${ride.clientName}
*Motorista:* ${driverDisplayName}

📍 *Embarque:* ${ride.origin.address}
🏁 *Destino:* ${ride.destination.address}
🛣️ *Percurso:* ${ride.distanceKm.toFixed(2).replace('.', ',')} km • ${ride.durationMin} min

💰 *TOTAL:* ${formatCurrency(displayTotal)}
💳 *Pagamento:* ${paymentMethodLabel} (${isPaid ? 'Confirmado' : isRefunded ? 'Reembolsado' : 'Aguardando'})

🔗 *Página da viagem:*
${publicTrackingUrl}`;

    const passengerPhoneClean = (ride.clientPhone || '').replace(/\D/g, '');
    const cleanNumber = passengerPhoneClean || getCleanWhatsappNumber(config.companyWhatsapp);
    window.open(`https://wa.me/55${cleanNumber}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleCopyReceiptLink = async () => {
    try {
      await navigator.clipboard.writeText(publicTrackingUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleDownloadPdf = async () => {
    if (!receiptRef.current) return;
    setIsDownloading(true);
    try {
      const result = await downloadElementAsPdf(receiptRef.current, {
        filename: `Recibo_${ride.id}.pdf`,
        title: `Recibo ${companyName} - ${rideCode}`,
      });
      if (result.success) {
        setDownloadFeedback('PDF baixado com sucesso!');
        setTimeout(() => setDownloadFeedback(''), 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadPng = async () => {
    if (!receiptRef.current) return;
    setIsDownloading(true);
    try {
      await downloadElementAsImage(receiptRef.current, `Recibo_${ride.id}.png`);
      setDownloadFeedback('Imagem salva!');
      setTimeout(() => setDownloadFeedback(''), 3000);
    } finally {
      setIsDownloading(false);
    }
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: 'rgba(15, 23, 42, 0.68)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        justifyContent: 'center',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          height: '100dvh',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        {/* ── BARRA SUPERIOR FIXA ESTILO UBER ("Recibo") ── */}
        <div
          style={{
            padding: '14px 16px 12px 16px',
            backgroundColor: '#0F172A',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar recibo"
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>
            <h1 style={{ margin: 0, fontSize: '1.28rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
              Recibo
            </h1>
          </div>

          <span style={{
            fontSize: '0.72rem',
            fontWeight: 800,
            color: '#76D800',
            backgroundColor: 'rgba(118, 216, 0, 0.14)',
            border: '1px solid rgba(118, 216, 0, 0.35)',
            padding: '4px 10px',
            borderRadius: 999
          }}>
            {rideCode}
          </span>
        </div>

        {/* ── CORPO ROLÁVEL DO RECIBO ESTILO UBER ── */}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', backgroundColor: '#FFFFFF' }}>
          <div ref={receiptRef} style={{ backgroundColor: '#FFFFFF', color: '#0F172A', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

            {/* 1. HERO ESCURO DE BOAS-VINDAS ("Obrigado por viajar, Lucas") */}
            <div style={{
              backgroundColor: '#111827',
              color: '#FFFFFF',
              padding: '20px 18px 24px 18px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <span style={{
                  fontSize: '1.15rem',
                  fontWeight: 900,
                  letterSpacing: '-0.02em',
                  color: '#FFFFFF',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                  <span>{companyName}</span>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#76D800' }} />
                </span>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94A3B8' }}>
                  {isCancelled ? 'Cancelada' : isPaid ? 'Quitado' : 'Comprovante'}
                </span>
              </div>

              <div style={{ fontSize: '0.78rem', color: '#CBD5E1', marginBottom: 8 }}>
                {formatReceiptHeroDateTime(ride.date, ride.time)}
              </div>

              <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#FFFFFF', lineHeight: 1.12, letterSpacing: '-0.025em' }}>
                Obrigado por viajar, {clientFirstName}
              </div>

              <p style={{ margin: '10px 0 0 0', fontSize: '0.88rem', color: '#CBD5E1', lineHeight: 1.4 }}>
                {isCancelled
                  ? 'Esta solicitação foi cancelada e o resumo financeiro encontra-se abaixo.'
                  : `Esperamos que você tenha gostado da viagem${getPeriodGreeting(ride.time)}.`}
              </p>
            </div>

            {/* 2. TOTAL + AVISO DE AJUSTE / PREÇO DA VIAGEM */}
            <div style={{ padding: '20px 18px 16px 18px', borderBottom: '1px solid #E5E7EB' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0F172A' }}>
                  Total
                </span>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#0F172A', lineHeight: 1.1 }}>
                    {formatCurrency(displayTotal)}
                  </div>
                  {hasPriceAdjustment && (
                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 3 }}>
                      Valor estimado: {formatCurrency(estimatedTotal)}
                    </div>
                  )}
                </div>
              </div>

              {(hasPriceAdjustment || hasCancellationFee) && (
                <div style={{
                  marginTop: 14,
                  backgroundColor: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  borderRadius: 12,
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12
                }}>
                  <AlertTriangle size={20} color="#D97706" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '0.8rem', color: '#92400E', lineHeight: 1.4, fontWeight: 600 }}>
                    {hasCancellationFee
                      ? 'Taxa de cancelamento aplicada conforme a política de deslocamento da plataforma.'
                      : 'O valor da sua viagem foi ajustado de acordo com o trajeto final registrado.'}
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, fontSize: '0.9rem' }}>
                <span style={{ color: '#334155', fontWeight: 500 }}>
                  {hasCancellationFee ? 'Taxa de cancelamento' : 'Preço da viagem'}
                </span>
                <span style={{ color: '#0F172A', fontWeight: 700 }}>
                  {formatCurrency(displayTotal)}
                </span>
              </div>

              {recordedTipAmount > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, fontSize: '0.86rem' }}>
                  <span style={{ color: '#475569', fontWeight: 500 }}>Valor extra adicionado (gorjeta)</span>
                  <span style={{ color: '#15803D', fontWeight: 700 }}>{formatCurrency(recordedTipAmount)}</span>
                </div>
              )}
            </div>

            {/* 3. PAGAMENTOS */}
            <div style={{ padding: '18px 18px', borderBottom: '1px solid #E5E7EB' }}>
              <h2 style={{ margin: '0 0 14px 0', fontSize: '1.15rem', fontWeight: 900, color: '#0F172A' }}>
                Pagamentos
              </h2>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 38,
                    height: 28,
                    borderRadius: 8,
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <PaymentMethodIcon method={ride.paymentMethod} size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A' }}>
                      {paymentMethodLabel}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 1 }}>
                      {formatReceiptDateSlash(ride.date, ride.time)}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0F172A' }}>
                    {formatCurrency(displayTotal)}
                  </div>
                  <div style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: isRefunded ? '#16A34A' : isPaid ? '#15803D' : '#B45309',
                    marginTop: 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3
                  }}>
                    {isRefunded && <RotateCcw size={11} />}
                    <span>
                      {isRefunded ? 'Reembolso' : isPaid ? 'Confirmado' : isCancelled && displayTotal === 0 ? 'Sem cobrança' : 'Pendente'}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #F1F5F9', fontSize: '0.8rem', color: '#475569', lineHeight: 1.45 }}>
                Para mais informações,{' '}
                <a
                  href={publicTrackingUrl}
                  style={{ color: '#2563EB', fontWeight: 700, textDecoration: 'underline' }}
                >
                  acesse a página da sua viagem
                </a>
                .
              </div>

              <div style={{ marginTop: 10, fontSize: '0.74rem', color: '#64748B', lineHeight: 1.45 }}>
                O preço de serviço não inclui eventuais taxas ou encargos aplicados diretamente pelo seu banco ou emissor do cartão.
              </div>
            </div>

            {/* 4. INFORMAÇÕES DA VIAGEM (CATEGORIA + TIMELINE + MAPA) */}
            <div style={{ padding: '18px 18px', borderBottom: '1px solid #E5E7EB' }}>
              <h2 style={{ margin: '0 0 14px 0', fontSize: '1.15rem', fontWeight: 900, color: '#0F172A' }}>
                Informações da viagem
              </h2>

              {/* Categoria + Km / Min */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 14, borderBottom: '1px solid #F1F5F9' }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: '#F3F4F6',
                  border: '1px solid #E5E7EB',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  flexShrink: 0
                }}>
                  <Car size={22} color="#0F172A" />
                  {isElectricCat && (
                    <Zap size={10} color="#58B200" fill="#58B200" style={{ position: 'absolute', top: 6, right: 6 }} />
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A' }}>
                    {categoryLabel}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: 2 }}>
                    {ride.distanceKm.toFixed(2).replace('.', ',')} Quilômetros, {ride.durationMin} minutos
                  </div>
                </div>
              </div>

              {/* Timeline vertical Embarque -> Destino */}
              <div style={{ position: 'relative', padding: '16px 0 4px 26px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{
                  position: 'absolute',
                  left: 7,
                  top: 24,
                  bottom: 24,
                  width: 2,
                  backgroundColor: '#CBD5E1'
                }} />

                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute',
                    left: -24,
                    top: 3,
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: '#FFFFFF',
                    border: '3px solid #0F172A'
                  }} />
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A' }}>
                    {ride.time}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.4, marginTop: 2 }}>
                    {ride.origin.address}
                  </div>
                </div>

                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute',
                    left: -24,
                    top: 3,
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    backgroundColor: '#FFFFFF',
                    border: '3px solid #0F172A'
                  }} />
                  {dropoffHour && (
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A' }}>
                      {dropoffHour}
                    </div>
                  )}
                  <div style={{ fontSize: '0.82rem', color: '#334155', lineHeight: 1.4, marginTop: dropoffHour ? 2 : 0 }}>
                    {ride.destination.address}
                  </div>
                </div>
              </div>

              {/* Mapa do trajeto */}
              <div
                data-html2canvas-ignore="true"
                style={{
                  marginTop: 14,
                  height: 152,
                  borderRadius: 14,
                  overflow: 'hidden',
                  border: '1px solid #E5E7EB',
                  pointerEvents: 'none'
                }}
              >
                <PassengerLiveMap origin={ride.origin} destination={ride.destination} />
              </div>

              {/* Card Motorista Avaliado ("Você viajou com ...") */}
              <div style={{
                marginTop: 16,
                borderRadius: 12,
                border: '1.5px solid #0F172A',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>
                    Você viajou com {driverFirstName}
                  </div>
                  {(ride.driverVehicle || ride.driverPlate) && (
                    <div style={{ fontSize: '0.73rem', color: '#64748B', marginTop: 2 }}>
                      {[ride.driverVehicle, ride.driverCarColor, ride.driverPlate].filter(Boolean).join(' • ')}
                    </div>
                  )}
                </div>

                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                    {Number(ride.driverRating || 5).toFixed(2)}
                  </span>
                  <Star size={14} color="#0F172A" fill="#0F172A" />
                </div>
              </div>

              {/* Bloco Proteção Kavro */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 0',
                borderBottom: '1px solid #F1F5F9'
              }}>
                <div style={{
                  width: 48,
                  height: 36,
                  borderRadius: 8,
                  backgroundColor: '#0F172A',
                  color: '#76D800',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.62rem',
                  fontWeight: 900,
                  letterSpacing: '0.04em',
                  flexShrink: 0
                }}>
                  KAVRO
                </div>
                <div style={{ flex: 1, fontSize: '0.78rem', color: '#334155', lineHeight: 1.35 }}>
                  Todas as suas viagens têm monitoramento GPS e proteção RideCheck.
                </div>
                <a
                  href="/ajuda"
                  style={{ fontSize: '0.76rem', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap' }}
                >
                  Saiba mais
                </a>
              </div>

              {/* Link histórico */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                paddingTop: 12,
                fontSize: '0.82rem'
              }}>
                <span style={{ color: '#475569' }}>Quer conferir seu histórico de viagens?</span>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: '#0F172A',
                    fontWeight: 800,
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Minhas viagens
                </button>
              </div>
            </div>

            {/* 5. TRANSPARÊNCIA FINANCEIRA (MOTORISTA VS PLATAFORMA + TRIBUTOS) */}
            <div style={{ padding: '18px 18px', borderBottom: '1px solid #E5E7EB' }}>
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '0.96rem', fontWeight: 900, color: '#0F172A' }}>
                  Ganhos do motorista parceiro
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                  <span style={{ color: '#334155' }}>Total do motorista parceiro</span>
                  <span style={{ fontWeight: 800, color: '#0F172A' }}>{formatCurrency(driverTotal)}</span>
                </div>
              </div>

              <div style={{ paddingTop: 14, borderTop: '1px solid #F1F5F9', marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '0.96rem', fontWeight: 900, color: '#0F172A' }}>
                  Ganhos da {companyName}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.84rem', marginBottom: 6 }}>
                  <span style={{ color: '#475569' }}>
                    Taxa de serviço ({commPercent}%{commFixed > 0 ? ` + ${formatCurrency(commFixed)}` : ''})
                  </span>
                  <span style={{ fontWeight: 700, color: '#0F172A' }}>{formatCurrency(platformTotal)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                  <span style={{ color: '#334155', fontWeight: 700 }}>Total da {companyName}</span>
                  <span style={{ fontWeight: 800, color: '#0F172A' }}>{formatCurrency(platformTotal)}</span>
                </div>
              </div>

              <div style={{ paddingTop: 14, borderTop: '1px solid #F1F5F9' }}>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '0.94rem', fontWeight: 900, color: '#0F172A' }}>
                  Taxas e impostos
                </h3>
                <p style={{ margin: 0, fontSize: '0.73rem', color: '#64748B', lineHeight: 1.45 }}>
                  Os valores referentes à intermediação digital contemplam os tributos aplicáveis conforme a Lei Federal nº 12.741/2012. Atendimento oficial: {formatPhone(config.companyWhatsapp || '48996915303')}.
                </p>
              </div>
            </div>
          </div>

          {/* 6. LISTA DE AÇÕES DO RECIBO ESTILO UBER */}
          <div style={{ padding: '4px 18px 28px 18px', backgroundColor: '#F8FAFC' }}>
            {downloadFeedback && (
              <div style={{
                marginTop: 10,
                padding: '8px 12px',
                borderRadius: 10,
                backgroundColor: '#DCFCE7',
                color: '#15803D',
                fontSize: '0.78rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}>
                <Check size={15} />
                <span>{downloadFeedback}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isDownloading}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid #E2E8F0',
                padding: '15px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: '#0F172A',
                fontSize: '0.9rem',
                fontWeight: 700,
                cursor: isDownloading ? 'wait' : 'pointer'
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                <Download size={18} />
                <span>{isDownloading ? 'Gerando PDF...' : 'Baixar o PDF'}</span>
              </span>
              <ChevronRight size={17} color="#94A3B8" />
            </button>

            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={isDownloading}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid #E2E8F0',
                padding: '15px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: '#0F172A',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: isDownloading ? 'wait' : 'pointer'
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                <ImageIcon size={18} />
                <span>Salvar comprovante como imagem</span>
              </span>
              <ChevronRight size={17} color="#94A3B8" />
            </button>

            <button
              type="button"
              onClick={handleShareWhatsapp}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid #E2E8F0',
                padding: '15px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: '#0F172A',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                <WhatsAppIcon size={18} />
                <span>Enviar comprovante no WhatsApp</span>
              </span>
              <ChevronRight size={17} color="#94A3B8" />
            </button>

            <button
              type="button"
              onClick={handleCopyReceiptLink}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                padding: '15px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: '#0F172A',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                {copiedLink ? <Check size={18} color="#16A34A" /> : <Copy size={18} />}
                <span>{copiedLink ? 'Link copiado!' : 'Copiar link do recibo'}</span>
              </span>
              <ChevronRight size={17} color="#94A3B8" />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
