import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Printer, Download, Share2, CheckCircle2, 
  MapPin, Calendar, Clock, CreditCard, User, 
  ExternalLink, Car, ShieldCheck, Check
} from 'lucide-react';
import { Ride, SystemConfig } from '../types';
import { WhatsAppIcon } from './WhatsAppIcon';
import { formatCurrency, formatPhone, formatRideCode, getCleanWhatsappNumber } from '../utils/format';
import { downloadElementAsPdf, downloadElementAsImage } from '../utils/pdfGenerator';

interface RideReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  ride: Ride;
  config: SystemConfig;
}

export const RideReceiptModal: React.FC<RideReceiptModalProps> = ({
  isOpen,
  onClose,
  ride,
  config,
}) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  if (!isOpen || !ride) return null;

  const emissionDate = new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const isPaid = ride.paymentStatus === 'pago';
  const paymentMethodLabel = {
    pix: 'PIX Instantâneo',
    dinheiro: 'Dinheiro em Espécie',
    cartao_credito: 'Cartão de Crédito',
    cartao_debito: 'Cartão de Débito',
    online: 'Pagamento Online',
  }[ride.paymentMethod] || 'PIX';

  const passengerPhoneClean = (ride.clientPhone || '').replace(/\D/g, '');
  const publicTrackingUrl = `${window.location.origin}/viagem/${ride.id}`;
  const rideCode = formatRideCode(ride);

  const handleShareWhatsapp = () => {
    const text = `🧾 *COMPROVANTE DE PAGAMENTO - KAVRO DRIVE*
━━━━━━━━━━━━━━━━━━━━
*Corrida Nº:* ${rideCode}
*Data da Corrida:* ${ride.date} às ${ride.time}
*Passageiro:* ${ride.clientName}

📍 *Embarque:* ${ride.origin.address}
🏁 *Destino:* ${ride.destination.address}
🛣️ *Distância:* ${ride.distanceKm.toFixed(1)} km

💰 *VALOR TOTAL:* ${formatCurrency(ride.totalPrice)}
💳 *Forma de Pagamento:* ${paymentMethodLabel}
✅ *Status:* ${isPaid ? 'PAGO INTEGRALMENTE' : 'AGUARDANDO PAGAMENTO'}

🔗 *Visualizar Recibo Completo Online:*
${publicTrackingUrl}
━━━━━━━━━━━━━━━━━━━━
_Kavro Drive Transporte Particular Executivo_`;

    const cleanNumber = passengerPhoneClean || getCleanWhatsappNumber(config.companyWhatsapp);
    window.open(`https://wa.me/55${cleanNumber}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleDownloadPdf = async () => {
    if (!receiptRef.current) return;
    setIsDownloading(true);
    try {
      const result = await downloadElementAsPdf(receiptRef.current, {
        filename: `Comprovante_UP_${ride.id}.pdf`,
        title: `Comprovante de Pagamento Kavro Drive - ${ride.id}`,
      });
      if (result.success) {
        setDownloadSuccess(true);
        setTimeout(() => setDownloadSuccess(false), 3000);
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
      await downloadElementAsImage(receiptRef.current, `Comprovante_UP_${ride.id}.png`);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3000);
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
        backgroundColor: 'rgba(10, 15, 20, 0.78)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
        overflowY: 'auto',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          backgroundColor: '#FFFFFF',
          borderRadius: 20,
          boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '94dvh',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        {/* Cabeçalho do Modal com Ações */}
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#121A21',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1.5px solid rgba(118, 216, 0, 0.4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.2rem' }}>🧾</span>
            <div>
              <div style={{ fontSize: '0.90rem', fontWeight: 800, color: '#FFFFFF' }}>
                Comprovante de Pagamento
              </div>
              <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>
                Código {rideCode} • Oficial Kavro Drive
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.12)',
              border: 'none',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={17} />
          </button>
        </div>

        {/* Barra de Ações Rápidas (Download PDF e WhatsApp) */}
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isDownloading}
            style={{
              height: 40,
              borderRadius: 10,
              backgroundColor: '#76D800',
              color: '#121A21',
              border: 'none',
              fontWeight: 800,
              fontSize: '0.82rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              cursor: isDownloading ? 'wait' : 'pointer',
              boxShadow: '0 2px 10px rgba(118, 216, 0, 0.35)',
            }}
          >
            {downloadSuccess ? (
              <>
                <Check size={16} color="#15803D" />
                <span>Arquivo Gerado!</span>
              </>
            ) : isDownloading ? (
              <span>Gerando PDF...</span>
            ) : (
              <>
                <Download size={16} />
                <span>Baixar PDF</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleShareWhatsapp}
            style={{
              height: 40,
              borderRadius: 10,
              backgroundColor: '#25D366',
              color: '#FFFFFF',
              border: 'none',
              fontWeight: 800,
              fontSize: '0.80rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(37, 211, 102, 0.35)',
            }}
          >
            <WhatsAppIcon size={16} />
            <span>Enviar no Whats</span>
          </button>
        </div>

        {/* Área do Documento para Impressão / Captura */}
        <div style={{ overflowY: 'auto', padding: '16px', backgroundColor: '#F1F5F9' }}>
          <div
            ref={receiptRef}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              padding: '20px 18px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 4px 14px rgba(0,0,0,0.04)',
              color: '#121A21',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {/* Topo do Recibo */}
            <div style={{ textAlign: 'center', borderBottom: '2px dashed #E2E8F0', paddingBottom: 14, marginBottom: 14 }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                backgroundColor: '#121A21',
                color: '#76D800',
                padding: '6px 14px',
                borderRadius: 12,
                fontSize: '0.90rem',
                fontWeight: 900,
                letterSpacing: '0.04em',
                marginBottom: 6,
              }}>
                <Car size={16} color="#76D800" />
                <span>KAVRO DRIVE</span>
              </div>
              <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600 }}>
                Transporte Executivo Particular • Lauro Müller & Região - SC
              </div>
              <div style={{
                fontSize: '0.68rem',
                color: '#15803D',
                backgroundColor: '#DCFCE7',
                padding: '3px 10px',
                borderRadius: 20,
                display: 'inline-block',
                fontWeight: 800,
                marginTop: 6,
                border: '1px solid #BBF7D0',
              }}>
                {isPaid ? '✓ COMPROVANTE DE PAGAMENTO QUITADO' : '⚠️ RECIBO PENDENTE DE PAGAMENTO'}
              </div>
            </div>

            {/* Número e Data de Emissão */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.74rem',
              backgroundColor: '#F8FAFC',
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid #E2E8F0',
              marginBottom: 12,
            }}>
              <div>
                <span style={{ color: '#64748B' }}>Identificador: </span>
                <strong style={{ color: '#121A21' }}>{rideCode}</strong>
              </div>
              <div>
                <span style={{ color: '#64748B' }}>Emissão: </span>
                <strong style={{ color: '#121A21' }}>{emissionDate}</strong>
              </div>
            </div>

            {/* Dados do Passageiro */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '0.70rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>
                Dados do Passageiro
              </div>
              <div style={{
                padding: '8px 10px',
                backgroundColor: '#F8FAFC',
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                fontSize: '0.78rem',
              }}>
                <div style={{ fontWeight: 800, color: '#121A21' }}>{ride.clientName}</div>
                <div style={{ color: '#475569', fontSize: '0.74rem', marginTop: 1 }}>
                  WhatsApp / Celular: {formatPhone(ride.clientPhone)}
                </div>
                <div style={{ color: '#64748B', fontSize: '0.70rem', marginTop: 2 }}>
                  Data da Corrida: {ride.date} às {ride.time} ({ride.passengers} passageiro{ride.passengers > 1 ? 's' : ''})
                </div>
              </div>
            </div>

            {/* Veículo & Motorista Responsável */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '0.70rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>
                Motorista & Veículo Oficial
              </div>
              <div style={{
                padding: '8px 10px',
                backgroundColor: '#F8FAFC',
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                fontSize: '0.76rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 6,
              }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#121A21' }}>
                    {config.driverName || 'Motorista Executivo UP'}
                  </div>
                  <div style={{ color: '#475569', fontSize: '0.72rem' }}>
                    {config.driverCarModel
                      ? `${config.driverCarBrand ? `${config.driverCarBrand} ` : ''}${config.driverCarModel}${config.driverCarColor ? ` • ${config.driverCarColor}` : ''}`
                      : config.driverVehicle || 'Veículo Particular Executivo'}
                  </div>
                </div>
                {config.driverPlate && (
                  <div style={{
                    backgroundColor: '#121A21',
                    color: '#FFFFFF',
                    padding: '3px 8px',
                    borderRadius: 6,
                    fontWeight: 900,
                    fontSize: '0.72rem',
                    letterSpacing: '0.06em',
                  }}>
                    {config.driverPlate}
                  </div>
                )}
              </div>
            </div>

            {/* Trajeto da Viagem */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '0.70rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 800, marginBottom: 4 }}>
                Itinerário da Viagem
              </div>
              <div style={{
                padding: '10px 12px',
                backgroundColor: '#F8FAFC',
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                fontSize: '0.76rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#10B981', marginTop: 4, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>EMBARQUE</div>
                    <div style={{ color: '#121A21', fontWeight: 600 }}>{ride.origin.address}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#EF4444', marginTop: 4, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>DESTINO</div>
                    <div style={{ color: '#121A21', fontWeight: 600 }}>{ride.destination.address}</div>
                  </div>
                </div>

                <div style={{
                  borderTop: '1px solid #E2E8F0',
                  paddingTop: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.70rem',
                  color: '#64748B',
                }}>
                  <span>Distância: <strong>{ride.distanceKm.toFixed(1)} km</strong></span>
                  <span>Tempo Estimado: <strong>~{ride.durationMin} min</strong></span>
                </div>
              </div>
            </div>

            {/* Bloco Financeiro / Total */}
            <div style={{
              backgroundColor: '#121A21',
              color: '#FFFFFF',
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}>
              <div>
                <div style={{ fontSize: '0.68rem', color: '#94A3B8', textTransform: 'uppercase' }}>
                  Forma de Pagamento
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#FFFFFF' }}>
                  {paymentMethodLabel}
                </div>
                <div style={{
                  fontSize: '0.68rem',
                  color: isPaid ? '#76D800' : '#FDE047',
                  fontWeight: 700,
                  marginTop: 2,
                }}>
                  {isPaid ? '✓ Pago Integralmente' : 'Aguardando Pagamento'}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.68rem', color: '#94A3B8', textTransform: 'uppercase' }}>
                  Valor Total
                </div>
                <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#76D800', lineHeight: 1.1 }}>
                  {formatCurrency(ride.totalPrice)}
                </div>
              </div>
            </div>

            {/* Rodapé e Autenticação Digital */}
            <div style={{
              textAlign: 'center',
              fontSize: '0.66rem',
              color: '#64748B',
              lineHeight: 1.4,
              borderTop: '1px solid #F1F5F9',
              paddingTop: 10,
            }}>
              <div>Kavro Drive • Atendimento: {formatPhone(config.companyWhatsapp || '48996915303')}</div>
              <div>Veículo Sedan Executivo • Lauro Müller - SC</div>
              <div style={{ marginTop: 4, color: '#94A3B8', wordBreak: 'break-all' }}>
                Autenticação Digital: {publicTrackingUrl}
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé com Fechar e Imprimir */}
        <div style={{
          padding: '10px 14px',
          backgroundColor: '#FFFFFF',
          borderTop: '1px solid #E2E8F0',
          display: 'flex',
          gap: 8,
          justifyContent: 'space-between',
        }}>
          <button
            type="button"
            onClick={handleDownloadPng}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#475569',
              fontSize: '0.74rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Salvar Imagem (.png)
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: '#F1F5F9',
              color: '#121A21',
              fontSize: '0.78rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

