import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin, Users, Luggage, CreditCard,
  ArrowLeft, ShieldCheck, Check, Car, Navigation,
  Copy, QrCode, Plus, RefreshCw, AlertCircle, Lock, Sparkles, Banknote, Clock
} from 'lucide-react';
import { LocationPoint, PaymentMethod, Ride, SystemConfig, SavedCard } from '../types';
import { calculateHaversineDistance, estimateDurationMinutes, reverseGeocode } from '../utils/geo';
import { calculateRidePrice, StorageService } from '../services/storage';
import { AddressPickerModal } from '../components/AddressPickerModal';
import { RouteMapPreview } from '../components/RouteMapPreview';
import { MercosulPlateBadge } from '../components/MercosulPlateBadge';
import { formatRideCode, getCleanWhatsappNumber } from '../utils/format';
import {
  normalizeCategoriesFromConfig,
  isDriverAvailableForCategory,
  getCategoryById
} from '../utils/categoryEngine';
import { WhatsAppIcon } from '../components/WhatsAppIcon';
import confetti from 'canvas-confetti';

interface ClientBookingScreenProps {
  config: SystemConfig;
  currentUser?: import('../types').ClientProfile | null;
  onRideBooked: (ride: Ride) => void;
  onBackToHome: () => void;
  initialOrigin?: LocationPoint | null;
  initialDestination?: LocationPoint | null;
}

export const ClientBookingScreen: React.FC<ClientBookingScreenProps> = ({
  config,
  currentUser: propUser,
  onRideBooked,
  onBackToHome,
  initialOrigin,
  initialDestination,
}) => {
  const navigate = useNavigate();
  const currentUser = propUser !== undefined ? propUser : StorageService.getCurrentUser();

  const [origin, setOrigin] = useState<LocationPoint | null>(initialOrigin || null);
  const [destination, setDestination] = useState<LocationPoint | null>(initialDestination || null);

  const [isPickingOrigin, setIsPickingOrigin] = useState(false);
  const [isPickingDestination, setIsPickingDestination] = useState(false);

  const allowedMethods: PaymentMethod[] =
    Array.isArray(config.activePaymentMethods) && config.activePaymentMethods.length > 0
      ? config.activePaymentMethods
      : ['pix', 'cartao_credito', 'cartao_debito', 'dinheiro'];
  const allowPix = allowedMethods.includes('pix');
  const allowCreditCard = allowedMethods.includes('cartao_credito');
  const allowDebitCard = allowedMethods.includes('cartao_debito');
  const allowAnyCard = allowCreditCard || allowDebitCard;
  const allowCash = allowedMethods.includes('dinheiro');

  const [passengers, setPassengers] = useState<number>(1);
  const [hasLuggage, setHasLuggage] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('kavro_go');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() =>
    allowPix ? 'pix' : allowCreditCard ? 'cartao_credito' : allowDebitCard ? 'cartao_debito' : 'dinheiro'
  );
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (!allowedMethods.includes(paymentMethod)) {
      const nextMethod: PaymentMethod = allowPix
        ? 'pix'
        : allowCreditCard
          ? 'cartao_credito'
          : allowDebitCard
            ? 'cartao_debito'
            : 'dinheiro';
      setPaymentMethod(nextMethod);
    }
  }, [allowedMethods.join(','), paymentMethod]);

  // Cartões tokenizados do passageiro
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const [isAddingCardModal, setIsAddingCardModal] = useState<boolean>(false);
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState(currentUser?.name || '');
  const [cardExpMonth, setCardExpMonth] = useState('12');
  const [cardExpYear, setCardExpYear] = useState('2029');
  const [cardCvv, setCardCvv] = useState('');
  const [cardType, setCardType] = useState<'cartao_credito' | 'cartao_debito'>('cartao_credito');
  const [cardError, setCardError] = useState('');
  const [isSavingCard, setIsSavingCard] = useState(false);

  // Estado da solicitação em tempo real
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);
  const [isSimulatingWebhook, setIsSimulatingWebhook] = useState(false);
  const [locatingOriginGps, setLocatingOriginGps] = useState(false);

  const handleUseCurrentGpsForOrigin = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!navigator.geolocation) {
      setIsPickingOrigin(true);
      return;
    }
    setLocatingOriginGps(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let resolvedAddr = 'Minha localização atual (GPS)';
        try {
          const rev = await reverseGeocode(lat, lng);
          if (rev) resolvedAddr = rev;
        } catch {}
        setOrigin({ address: resolvedAddr, lat, lng });
        setLocatingOriginGps(false);
      },
      () => {
        setLocatingOriginGps(false);
        setIsPickingOrigin(true);
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  };

  // Detecta GPS atual para preencher embarque automaticamente se vazio
  useEffect(() => {
    if (!origin && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setOrigin({
            address: 'Minha localização atual (GPS)',
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          });
        },
        () => {
          // Mantém manual se usuário negar GPS
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    }
  }, [origin]);

  // Carrega cartões tokenizados salvos
  useEffect(() => {
    if (currentUser?.id || currentUser?.phone) {
      StorageService.getSavedCards(currentUser.id, currentUser.phone).then(cards => {
        setSavedCards(cards);
        if (cards.length > 0 && !selectedCardId) {
          setSelectedCardId(cards[0].id);
        }
      });
    }
  }, [currentUser?.id, currentUser?.phone]);

  // Atualiza em tempo real o status da corrida solicitada (Pix confirmado -> motorista aceitou -> fila -> a caminho)
  useEffect(() => {
    if (!activeRide) return;
    const syncActive = () => {
      const latest = StorageService.getRides().find(r => r.id === activeRide.id);
      if (latest) {
        setActiveRide(latest);
      }
    };
    window.addEventListener('up_rides_updated', syncActive);
    window.addEventListener('up_database_synced', syncActive);
    const interval = setInterval(() => {
      StorageService.syncFromDatabase().then(syncActive);
    }, 1800);
    return () => {
      clearInterval(interval);
      window.removeEventListener('up_rides_updated', syncActive);
      window.removeEventListener('up_database_synced', syncActive);
    };
  }, [activeRide?.id]);

  const nowTimeStr = React.useMemo(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }, []);

  const distanceKm = origin && destination
    ? calculateHaversineDistance(origin.lat, origin.lng, destination.lat, destination.lng)
    : 4.5;
  const durationMin = origin && destination
    ? estimateDurationMinutes(distanceKm)
    : 12;

  const activeCategories = React.useMemo(
    () => normalizeCategoriesFromConfig(config).filter(c => c.active),
    [config]
  );

  useEffect(() => {
    if (activeCategories.length > 0 && !activeCategories.some(c => c.id === selectedCategory)) {
      setSelectedCategory(activeCategories[0].id);
    }
  }, [activeCategories, selectedCategory]);

  const pricing = calculateRidePrice(distanceKm, durationMin, nowTimeStr, config, selectedCategory);
  const onlineDrivers = StorageService.getOnlineDrivers();
  const onlineDriversCount = StorageService.getOnlineDriversCount();

  // Calcula disponibilidade de motoristas habilitados e tempo estimado de chegada (ETA) por categoria
  const categoryStats = React.useMemo(() => {
    const map: Record<string, { availableDriversCount: number; etaMin: number }> = {};
    for (const cat of activeCategories) {
      const eligibleOnline = onlineDrivers.filter(drv =>
        isDriverAvailableForCategory(drv, cat.id, activeCategories)
      );
      let etaMin = cat.id === 'kavro_go' ? 3 : cat.id === 'kavro_plus' ? 4 : 5;
      if (origin && eligibleOnline.length > 0) {
        const distances = eligibleOnline
          .filter(d => d.location && typeof d.location.lat === 'number' && typeof d.location.lng === 'number')
          .map(d => calculateHaversineDistance(origin.lat, origin.lng, d.location!.lat, d.location!.lng));
        if (distances.length > 0) {
          const minDist = Math.min(...distances);
          etaMin = Math.max(2, Math.min(18, Math.round(minDist * 2.2 + 2)));
        }
      }
      map[cat.id] = {
        availableDriversCount: eligibleOnline.length,
        etaMin
      };
    }
    return map;
  }, [activeCategories, onlineDrivers, origin]);

  const selectedCatStats = categoryStats[selectedCategory] || { availableDriversCount: 0, etaMin: 4 };
  const selectedCatObj = getCategoryById(selectedCategory, config);
  const alternativeAvailableCategories = activeCategories.filter(
    c => c.id !== selectedCategory && (categoryStats[c.id]?.availableDriversCount || 0) > 0
  );

  const handleSaveNewCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setCardError('');
    setIsSavingCard(true);
    let mpCardToken: string | undefined;
    try {
      const payCfg = await StorageService.fetchPaymentsConfig();
      if (payCfg.mercadopagoPublicKey) {
        const cleanDoc = String(currentUser?.document || '').replace(/\D/g, '');
        const tokenBody: Record<string, unknown> = {
          card_number: cardNumber.replace(/\D/g, ''),
          expiration_month: parseInt(cardExpMonth, 10),
          expiration_year: parseInt(cardExpYear.length === 2 ? `20${cardExpYear}` : cardExpYear, 10),
          security_code: cardCvv.replace(/\D/g, ''),
          cardholder: {
            name: cardHolder.toUpperCase().trim(),
            ...(cleanDoc.length === 11 || cleanDoc.length === 14
              ? { identification: { type: cleanDoc.length === 14 ? 'CNPJ' : 'CPF', number: cleanDoc } }
              : {})
          }
        };
        const mpResp = await fetch(
          `https://api.mercadopago.com/v1/card_tokens?public_key=${encodeURIComponent(payCfg.mercadopagoPublicKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tokenBody)
          }
        );
        const mpData = await mpResp.json().catch(() => ({}));
        if (mpResp.ok && mpData?.id) {
          mpCardToken = String(mpData.id);
        }
      }
    } catch {
      // Fallback para tokenização no backend
    }

    const res = await StorageService.saveTokenizedCard({
      clientId: currentUser?.id,
      clientPhone: currentUser?.phone,
      cardNumber,
      holderName: cardHolder,
      expMonth: cardExpMonth,
      expYear: cardExpYear,
      cvv: cardCvv,
      cardType,
      mpCardToken,
      holderDocument: currentUser?.document
    });
    setIsSavingCard(false);
    if (!res.ok || !res.card) {
      setCardError(res.error || 'Verifique os dados do cartão.');
      return;
    }
    const nextCards = [res.card, ...savedCards];
    setSavedCards(nextCards);
    setSelectedCardId(res.card.id);
    setPaymentMethod(res.card.cardType);
    setIsAddingCardModal(false);
    setCardNumber('');
    setCardCvv('');
  };

  const handleRequestRideNow = async () => {
    setRequestError('');
    if (!origin) {
      setIsPickingOrigin(true);
      return;
    }
    if (!destination) {
      setIsPickingDestination(true);
      return;
    }

    const isCard = paymentMethod === 'cartao_credito' || paymentMethod === 'cartao_debito';
    const chosenCard = savedCards.find(c => c.id === selectedCardId);
    if (isCard && !chosenCard) {
      setIsAddingCardModal(true);
      return;
    }

    // Verifica se há motoristas disponíveis e habilitados para a categoria escolhida
    if (onlineDrivers.length > 0 && selectedCatStats.availableDriversCount === 0) {
      setRequestError(
        `Não há motoristas disponíveis e habilitados para a categoria ${selectedCatObj.name} neste momento. Selecione outra modalidade disponível abaixo.`
      );
      return;
    }

    setIsSubmitting(true);
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const res = await StorageService.requestRideOnDemand({
      clientId: currentUser?.id,
      clientName: currentUser?.name || 'Passageiro',
      clientPhone: currentUser?.phone || '',
      origin,
      destination,
      date: todayStr,
      time: nowTimeStr,
      passengers,
      hasLuggage,
      distanceKm,
      durationMin,
      category: selectedCategory,
      categoryName: pricing.categoryName,
      appliedFareSnapshot: pricing.appliedFareSnapshot,
      baseFare: pricing.appliedFareSnapshot.baseFare,
      commissionPercent: pricing.commissionPercent,
      totalPrice: pricing.totalPrice,
      paymentMethod,
      cardId: isCard ? chosenCard?.id : undefined,
      cardLast4: isCard ? chosenCard?.last4 : undefined,
      cardBrand: isCard ? chosenCard?.brand : undefined,
      notes,
      isManualBooking: false
    });

    setIsSubmitting(false);

    if (!res.ok || !res.ride) {
      setRequestError(res.error || 'Não foi possível processar sua solicitação.');
      return;
    }

    setActiveRide(res.ride);
    onRideBooked(res.ride);

    if (res.ride.paymentMethod !== 'pix') {
      try {
        confetti({ particleCount: 60, spread: 55, origin: { y: 0.6 } });
      } catch {
        // ignore
      }
    }
  };

  const handleSimulatePixWebhook = async () => {
    if (!activeRide) return;
    setIsSimulatingWebhook(true);
    const res = await StorageService.triggerGatewayWebhook({
      event: 'payment.confirmed',
      rideId: activeRide.id,
      amount: activeRide.totalPrice,
      gatewayTxId: `gw_sim_${activeRide.id}_${Date.now()}`
    });
    setIsSimulatingWebhook(false);
    if (res.ok && res.ride) {
      setActiveRide(res.ride);
      try {
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
      } catch {
        // ignore
      }
    }
  };

  // ============================================================================
  // TELA 1: AGUARDANDO CONFIRMAÇÃO DO PIX PRÉ-PAGO PELO GATEWAY (WEBHOOK)
  // ============================================================================
  if (activeRide && activeRide.status === 'aguardando_pagamento' && activeRide.paymentMethod === 'pix') {
    const qrUrl = activeRide.pixQrCode || '';
    const copyPaste = activeRide.pixCopyPaste || '';

    return (
      <div className="animate-fade-in" style={{ padding: '16px 16px 100px 16px', maxWidth: 480, margin: '0 auto' }}>
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 22,
          padding: '20px 18px',
          border: '1.5px solid #E2E8F0',
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)',
          textAlign: 'center'
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            backgroundColor: '#FEF3C7',
            color: '#B45309',
            padding: '5px 12px',
            borderRadius: 999,
            fontSize: '0.74rem',
            fontWeight: 800,
            marginBottom: 10
          }}>
            <Clock size={14} />
            <span>AGUARDANDO CONFIRMAÇÃO DO GATEWAY PIX</span>
          </div>

          <h2 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0' }}>
            Pague com PIX para chamar seu motorista
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '0 0 14px 0', lineHeight: 1.4 }}>
            Assim que o banco confirmar o pagamento via webhook, seu motorista é acionado automaticamente na hora.
          </p>

          <div style={{
            backgroundColor: '#F8FAFC',
            borderRadius: 16,
            padding: '12px',
            border: '1px solid #E2E8F0',
            marginBottom: 14
          }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
              Valor da Corrida ({formatRideCode(activeRide)})
            </div>
            <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#15803D' }}>
              R$ {activeRide.totalPrice.toFixed(2).replace('.', ',')}
            </div>
          </div>

          {qrUrl && (
            <div style={{
              width: 200,
              height: 200,
              margin: '0 auto 14px auto',
              padding: 10,
              backgroundColor: '#FFFFFF',
              borderRadius: 18,
              border: '2px solid #76D800',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <img src={qrUrl} alt="QR Code PIX Dinâmico" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
          )}

          {copyPaste && (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(copyPaste);
                setCopiedPix(true);
                setTimeout(() => setCopiedPix(false), 2500);
              }}
              style={{
                width: '100%',
                padding: '13px 16px',
                borderRadius: 14,
                backgroundColor: copiedPix ? '#16A34A' : '#121A21',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 800,
                fontSize: '0.88rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
                marginBottom: 10
              }}
            >
              {copiedPix ? <Check size={18} /> : <Copy size={18} />}
              <span>{copiedPix ? 'Código PIX Copiado!' : 'Copiar Código PIX (Copia e Cola)'}</span>
            </button>
          )}

          <div style={{
            backgroundColor: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: 12,
            padding: '10px 12px',
            fontSize: '0.75rem',
            color: '#166534',
            lineHeight: 1.35,
            marginBottom: 14,
            textAlign: 'left'
          }}>
            🔒 <strong>Segurança Automática:</strong> Não é necessário enviar comprovante. O sistema libera a corrida automaticamente assim que o gateway confirma a liquidação.
          </div>

          {/* Botão de Simulação do Webhook para testes imediatos em Localhost */}
          <button
            type="button"
            onClick={handleSimulatePixWebhook}
            disabled={isSimulatingWebhook}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 12,
              backgroundColor: '#76D800',
              color: '#121A21',
              border: 'none',
              fontWeight: 900,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              marginBottom: 10
            }}
          >
            <Sparkles size={16} />
            <span>
              {isSimulatingWebhook ? 'Confirmando no Gateway...' : '⚡ Simular Confirmação Webhook Gateway (Teste)'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveRide(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748B',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              padding: '6px'
            }}
          >
            Alterar forma de pagamento ou cancelar
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // TELA 2: RADAR AO VIVO / MOTORISTA NA FILA / MOTORISTA A CAMINHO (ESTILO UBER)
  // ============================================================================
  if (activeRide) {
    const isSearching = activeRide.status === 'aguardando_confirmacao';
    const isQueued = activeRide.status === 'na_fila' || Boolean(activeRide.isQueuedRide);
    const isOnWay = activeRide.status === 'a_caminho' || activeRide.status === 'no_local';
    const isInProgress = activeRide.status === 'em_andamento';

    return (
      <div className="animate-fade-in" style={{ padding: '14px 16px 100px 16px', maxWidth: 480, margin: '0 auto' }}>
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 22,
          overflow: 'hidden',
          border: '1.5px solid #E2E8F0',
          boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)'
        }}>
          {/* Mapa da Rota no Topo */}
          <RouteMapPreview
            origin={activeRide.origin}
            destination={activeRide.destination}
            distanceKm={activeRide.distanceKm}
            durationMin={activeRide.durationMin}
          />

          <div style={{ padding: '18px' }}>
            {/* Status Badge Dinâmico */}
            {isSearching && (
              <div style={{
                backgroundColor: '#EFF6FF',
                border: '1.5px solid #BFDBFE',
                borderRadius: 16,
                padding: '14px',
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 12
              }}>
                <div style={{
                  width: 42,
                  height: 42,
                  borderRadius: '50%',
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <RefreshCw size={20} className="animate-spin" />
                </div>
                <div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#1E3A8A' }}>
                    Procurando motorista próximo...
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#3B82F6', fontWeight: 600 }}>
                    {onlineDriversCount} motorista(s) online na região recebendo seu chamado
                  </div>
                </div>
              </div>
            )}

            {/* AVISO DE CORRIDA NA FILA (MOTORISTA FINALIZANDO CORRIDA PRÓXIMA) */}
            {isQueued && (
              <div style={{
                backgroundColor: '#FEF3C7',
                border: '1.5px solid #F59E0B',
                borderRadius: 16,
                padding: '14px',
                marginBottom: 14
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{
                    backgroundColor: '#D97706',
                    color: '#FFFFFF',
                    fontSize: '0.66rem',
                    fontWeight: 900,
                    padding: '2px 8px',
                    borderRadius: 999,
                    textTransform: 'uppercase'
                  }}>
                    Próxima da Fila
                  </span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 900, color: '#92400E' }}>
                    Motorista Confirmado!
                  </span>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#78350F', margin: 0, lineHeight: 1.4, fontWeight: 600 }}>
                  🚗 <strong>{activeRide.driverName || 'Seu motorista'}</strong> aceitou sua corrida! Ele está finalizando um desembarque próximo e já seguirá direto para o seu local.
                </p>
              </div>
            )}

            {(isOnWay || isInProgress) && (
              <div style={{
                backgroundColor: '#F0FDF4',
                border: '1.5px solid #86EFAC',
                borderRadius: 16,
                padding: '14px',
                marginBottom: 14
              }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 900, color: '#14532D' }}>
                  {isInProgress ? '🚀 Viagem em andamento rumo ao destino!' : '✅ Motorista a caminho do seu embarque!'}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#15803D', fontWeight: 600, marginTop: 2 }}>
                  Acompanhe o deslocamento do veículo no mapa em tempo real.
                </div>
              </div>
            )}

            {/* Card do Motorista que Aceitou */}
            {activeRide.driverName && (
              <div style={{
                backgroundColor: '#F8FAFC',
                borderRadius: 16,
                padding: '12px 14px',
                border: '1px solid #E2E8F0',
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 46,
                    height: 46,
                    borderRadius: '50%',
                    backgroundColor: '#121A21',
                    color: '#76D800',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    fontSize: '1.1rem',
                    overflow: 'hidden',
                    flexShrink: 0
                  }}>
                    {activeRide.driverPhoto ? (
                      <img src={activeRide.driverPhoto} alt={activeRide.driverName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      activeRide.driverName.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 900, color: '#0F172A' }}>
                      {activeRide.driverName} ⭐ {Number(activeRide.driverRating || 4.98).toFixed(2)}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#475569', fontWeight: 700 }}>
                      {activeRide.driverVehicle || 'Veículo Parceiro'} {activeRide.driverCarColor ? `• ${activeRide.driverCarColor}` : ''}
                    </div>
                  </div>
                </div>
                {activeRide.driverPlate && (
                  <MercosulPlateBadge plate={activeRide.driverPlate} size="sm" />
                )}
              </div>
            )}

            {/* Resumo de Valor e Pagamento */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              backgroundColor: '#F8FAFC',
              borderRadius: 12,
              marginBottom: 14,
              border: '1px solid #E2E8F0'
            }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700 }}>
                  FORMA DE PAGAMENTO
                </div>
                <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0F172A' }}>
                  {activeRide.paymentMethod === 'pix'
                    ? 'PIX (Confirmado via Gateway)'
                    : activeRide.paymentMethod === 'dinheiro'
                      ? 'Dinheiro (Pagar ao motorista)'
                      : `Cartão •••• ${activeRide.cardLast4 || 'Autorizado'}`}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700 }}>VALOR</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#15803D' }}>
                  R$ {activeRide.totalPrice.toFixed(2).replace('.', ',')}
                </div>
              </div>
            </div>

            {/* Botões de Ação */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                onClick={() => navigate(`/viagem/${encodeURIComponent(activeRide.id)}`)}
                className="btn-ios-primary"
                style={{ width: '100%', padding: '14px', fontSize: '0.92rem', fontWeight: 800 }}
              >
                <Navigation size={18} />
                <span>Abrir Mapa e GPS em Tempo Real</span>
              </button>

              {activeRide.driverPhone && (
                <a
                  href={`https://wa.me/${getCleanWhatsappNumber(activeRide.driverPhone)}?text=${encodeURIComponent(`Olá ${activeRide.driverName || ''}, sou o passageiro da corrida ${formatRideCode(activeRide)}!`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 14,
                    backgroundColor: '#F0FDF4',
                    border: '1.5px solid #86EFAC',
                    color: '#15803D',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    textDecoration: 'none',
                    boxSizing: 'border-box'
                  }}
                >
                  <WhatsAppIcon size={17} />
                  <span>Falar com o Motorista</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // TELA PRINCIPAL: PEDIR CORRIDA AGORA (100% IMEDIATO ESTILO UBER)
  // ============================================================================
  return (
    <div className="animate-fade-in" style={{ padding: '12px 16px calc(150px + env(safe-area-inset-bottom, 0px)) 16px' }}>
      <AddressPickerModal
        isOpen={isPickingOrigin}
        onClose={() => setIsPickingOrigin(false)}
        title="Onde o motorista busca você?"
        initialPoint={origin || undefined}
        onSelect={(p) => setOrigin(p)}
      />

      <AddressPickerModal
        isOpen={isPickingDestination}
        onClose={() => setIsPickingDestination(false)}
        title="Para onde vamos agora?"
        initialPoint={destination || undefined}
        onSelect={(p) => setDestination(p)}
      />

      {/* Modal de Cadastro Seguro de Cartão (Tokenização no Gateway) */}
      {isAddingCardModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 22,
            padding: 20,
            width: '100%',
            maxWidth: 400,
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Lock size={18} color="#16A34A" />
                <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 900, color: '#0F172A' }}>
                  Cadastrar Cartão Seguro
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingCardModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: '#64748B' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.75rem', color: '#64748B', margin: '0 0 12px 0', lineHeight: 1.35 }}>
              Seus dados são criptografados e tokenizados diretamente pelo gateway. A Kavro Drive não armazena o número completo nem o CVV do cartão.
            </p>

            <form onSubmit={handleSaveNewCard} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setCardType('cartao_credito')}
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
                  onClick={() => setCardType('cartao_debito')}
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
                placeholder="Número do Cartão (16 dígitos)"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                required
                style={{ padding: '12px', borderRadius: 12, border: '1.5px solid #CBD5E1', fontSize: '0.9rem', fontWeight: 700 }}
              />
              <input
                type="text"
                placeholder="Nome impresso no cartão"
                value={cardHolder}
                onChange={(e) => setCardHolder(e.target.value)}
                required
                style={{ padding: '12px', borderRadius: 12, border: '1.5px solid #CBD5E1', fontSize: '0.88rem', fontWeight: 600 }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Mês (MM)"
                  maxLength={2}
                  value={cardExpMonth}
                  onChange={(e) => setCardExpMonth(e.target.value)}
                  required
                  style={{ padding: '11px', borderRadius: 12, border: '1.5px solid #CBD5E1', fontSize: '0.85rem', textAlign: 'center' }}
                />
                <input
                  type="text"
                  placeholder="Ano (AAAA)"
                  maxLength={4}
                  value={cardExpYear}
                  onChange={(e) => setCardExpYear(e.target.value)}
                  required
                  style={{ padding: '11px', borderRadius: 12, border: '1.5px solid #CBD5E1', fontSize: '0.85rem', textAlign: 'center' }}
                />
                <input
                  type="password"
                  placeholder="CVV"
                  maxLength={4}
                  value={cardCvv}
                  onChange={(e) => setCardCvv(e.target.value)}
                  required
                  style={{ padding: '11px', borderRadius: 12, border: '1.5px solid #CBD5E1', fontSize: '0.85rem', textAlign: 'center' }}
                />
              </div>

              {cardError && (
                <div style={{ color: '#DC2626', fontSize: '0.76rem', fontWeight: 700 }}>
                  {cardError}
                </div>
              )}

              <button
                type="submit"
                disabled={isSavingCard}
                className="btn-ios-primary"
                style={{ width: '100%', padding: '13px', fontSize: '0.9rem', fontWeight: 800, marginTop: 4 }}
              >
                {isSavingCard ? 'Tokenizando no Gateway...' : 'Salvar e Usar Cartão'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button
          onClick={onBackToHome}
          style={{
            background: '#ffffff',
            border: '1px solid #E2E8F0',
            borderRadius: 12,
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.84rem',
            fontWeight: 700,
            color: '#1E293B',
            cursor: 'pointer'
          }}
        >
          <ArrowLeft size={16} />
          <span>Voltar</span>
        </button>

        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          backgroundColor: '#F0FDF4',
          border: '1px solid #86EFAC',
          padding: '5px 11px',
          borderRadius: 999,
          fontSize: '0.73rem',
          fontWeight: 800,
          color: '#15803D'
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#16A34A' }} />
          <span>{onlineDriversCount} motorista(s) online agora</span>
        </div>
      </div>

      {/* Mapa ao Vivo + Seleção de Origem e Destino (Estilo Clean Uber/Kavro) */}
      <div style={{
        backgroundColor: '#000000',
        borderRadius: 20,
        overflow: 'hidden',
        border: '1px solid #1E293B',
        marginBottom: 12,
        boxShadow: '0 8px 26px rgba(0, 0, 0, 0.16)'
      }}>
        {origin && destination && (
          <RouteMapPreview
            origin={origin}
            destination={destination}
            distanceKm={distanceKm}
            durationMin={durationMin}
          />
        )}

        <div style={{ padding: '16px 16px 18px 16px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            backgroundColor: '#FFFFFF',
            color: '#000000',
            borderRadius: 999,
            padding: '6px 12px',
            fontSize: '0.78rem',
            fontWeight: 700,
            marginBottom: 14
          }}>
            <Clock size={14} strokeWidth={2.3} />
            <span>Agora</span>
          </div>

          <div style={{ position: 'relative' }}>
            {/* Linha conectora preta entre o círculo (partida) e o quadrado (chegada) */}
            <div style={{
              position: 'absolute',
              left: 22,
              top: 32,
              bottom: 32,
              width: 1.5,
              backgroundColor: '#000000',
              zIndex: 3,
              pointerEvents: 'none'
            }} />

            {/* Local de partida */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setIsPickingOrigin(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsPickingOrigin(true);
                }
              }}
              style={{
                position: 'relative',
                backgroundColor: '#FFFFFF',
                borderRadius: 10,
                height: 52,
                display: 'flex',
                alignItems: 'center',
                paddingLeft: 42,
                paddingRight: 48,
                marginBottom: 12,
                cursor: 'pointer'
              }}
            >
              <span style={{
                position: 'absolute',
                left: 17,
                width: 11,
                height: 11,
                borderRadius: '50%',
                border: '3px solid #000000',
                backgroundColor: '#FFFFFF',
                zIndex: 4,
                boxSizing: 'border-box'
              }} />
              <span style={{
                flex: 1,
                minWidth: 0,
                fontSize: '0.94rem',
                fontWeight: origin ? 500 : 400,
                color: origin ? '#000000' : '#545454',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {origin ? origin.address : 'Local de partida'}
              </span>
              <button
                type="button"
                title="Usar minha localização atual"
                onClick={handleUseCurrentGpsForOrigin}
                style={{
                  position: 'absolute',
                  right: 10,
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#000000',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  opacity: locatingOriginGps ? 0.45 : 1
                }}
              >
                <Navigation size={17} fill="#000000" color="#000000" />
              </button>
            </div>

            {/* Local de chegada */}
            <button
              type="button"
              onClick={() => setIsPickingDestination(true)}
              style={{
                width: '100%',
                position: 'relative',
                backgroundColor: '#FFFFFF',
                border: 'none',
                borderRadius: 10,
                height: 52,
                display: 'flex',
                alignItems: 'center',
                paddingLeft: 42,
                paddingRight: 16,
                textAlign: 'left',
                cursor: 'pointer'
              }}
            >
              <span style={{
                position: 'absolute',
                left: 17,
                width: 11,
                height: 11,
                borderRadius: 2,
                border: '3px solid #000000',
                backgroundColor: '#FFFFFF',
                zIndex: 4,
                boxSizing: 'border-box'
              }} />
              <span style={{
                flex: 1,
                minWidth: 0,
                fontSize: '0.94rem',
                fontWeight: destination ? 500 : 400,
                color: destination ? '#000000' : '#545454',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {destination ? destination.address : 'Local de chegada'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Seleção de Modalidade KAVRO DRIVE (KAVRO GO, KAVRO PLUS, KAVRO EXEC) */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        padding: '14px',
        border: '1.5px solid #E2E8F0',
        marginBottom: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 900, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Escolha sua categoria KAVRO DRIVE
          </span>
          <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748B' }}>
            {distanceKm.toFixed(1)} km • ~{durationMin} min de viagem
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activeCategories.map((cat) => {
            const catPrice = calculateRidePrice(distanceKm, durationMin, nowTimeStr, config, cat.id);
            const isSelected = selectedCategory === cat.id;
            const stats = categoryStats[cat.id] || { availableDriversCount: 0, etaMin: 4 };
            const hasNoDriverInCat = onlineDrivers.length > 0 && stats.availableDriversCount === 0;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat.id);
                  setRequestError('');
                }}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 14,
                  border: isSelected ? '2px solid #121A21' : '1.5px solid #E2E8F0',
                  backgroundColor: isSelected ? '#F8FAFC' : '#FFFFFF',
                  opacity: hasNoDriverInCat && !isSelected ? 0.78 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: isSelected ? '#121A21' : '#F1F5F9',
                    color: isSelected ? '#76D800' : '#475569',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    fontWeight: 900,
                    fontSize: '0.62rem'
                  }}>
                    <Car size={19} />
                    <span style={{ marginTop: 1 }}>{cat.code || cat.name.replace('KAVRO ', '')}</span>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.92rem', fontWeight: 900, color: '#0F172A' }}>
                        {cat.name}
                      </span>
                      {cat.subtitle && (
                        <span style={{
                          fontSize: '0.66rem',
                          fontWeight: 800,
                          padding: '2px 7px',
                          borderRadius: 999,
                          backgroundColor: isSelected ? '#DCFCE7' : '#F1F5F9',
                          color: isSelected ? '#15803D' : '#475569'
                        }}>
                          {cat.subtitle}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.73rem', color: hasNoDriverInCat ? '#DC2626' : '#15803D', fontWeight: 800, marginTop: 2 }}>
                      {hasNoDriverInCat
                        ? 'Sem motoristas disponíveis nesta categoria agora'
                        : `Chegada estimada: ~${stats.etaMin} min • ${stats.availableDriversCount > 0 ? `${stats.availableDriversCount} disp.` : 'Disponível'}`}
                    </div>
                    <div style={{ fontSize: '0.71rem', color: '#64748B', fontWeight: 600, marginTop: 1 }}>
                      {cat.description}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0F172A' }}>
                    R$ {catPrice.totalPrice.toFixed(2).replace('.', ',')}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 700 }}>
                    Valor estimado
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Alerta caso não haja motoristas disponíveis para a categoria escolhida, permitindo trocar com 1 toque */}
        {onlineDrivers.length > 0 && selectedCatStats.availableDriversCount === 0 && (
          <div style={{
            marginTop: 10,
            padding: '11px 12px',
            borderRadius: 12,
            backgroundColor: '#FFFBEB',
            border: '1.5px solid #FDE68A',
            color: '#92400E',
            fontSize: '0.77rem'
          }}>
            <div style={{ fontWeight: 900, marginBottom: 4 }}>
              ⚠️ Nenhum motorista habilitado disponível em {selectedCatObj.name} neste momento.
            </div>
            <div style={{ marginBottom: alternativeAvailableCategories.length > 0 ? 8 : 0 }}>
              Selecione outra categoria com motoristas online para ser atendido imediatamente:
            </div>
            {alternativeAvailableCategories.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {alternativeAvailableCategories.map(alt => {
                  const altPrice = calculateRidePrice(distanceKm, durationMin, nowTimeStr, config, alt.id);
                  return (
                    <button
                      key={alt.id}
                      type="button"
                      onClick={() => {
                        setSelectedCategory(alt.id);
                        setRequestError('');
                      }}
                      style={{
                        padding: '6px 11px',
                        borderRadius: 8,
                        border: 'none',
                        backgroundColor: '#121A21',
                        color: '#76D800',
                        fontSize: '0.73rem',
                        fontWeight: 900,
                        cursor: 'pointer'
                      }}
                    >
                      Mudar para {alt.name} (R$ {altPrice.totalPrice.toFixed(2).replace('.', ',')})
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Seleção de Método de Pagamento (Pix, Cartão de Crédito/Débito, Dinheiro) */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        padding: '14px',
        border: '1.5px solid #E2E8F0',
        marginBottom: 12
      }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 900, color: '#0F172A', textTransform: 'uppercase', marginBottom: 10 }}>
          Forma de Pagamento
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, (allowPix ? 1 : 0) + (allowAnyCard ? 1 : 0) + (allowCash ? 1 : 0))}, 1fr)`, gap: 8, marginBottom: 10 }}>
          {allowPix && (
            <button
              type="button"
              onClick={() => setPaymentMethod('pix')}
              style={{
                padding: '11px 8px',
                borderRadius: 12,
                border: paymentMethod === 'pix' ? '2px solid #16A34A' : '1.5px solid #E2E8F0',
                backgroundColor: paymentMethod === 'pix' ? '#F0FDF4' : '#FFFFFF',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer'
              }}
            >
              <QrCode size={18} color={paymentMethod === 'pix' ? '#16A34A' : '#64748B'} />
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A' }}>PIX</span>
              <span style={{ fontSize: '0.64rem', color: '#16A34A', fontWeight: 700 }}>QR Dinâmico</span>
            </button>
          )}

          {allowAnyCard && (
            <button
              type="button"
              onClick={() => setPaymentMethod(allowCreditCard ? 'cartao_credito' : 'cartao_debito')}
              style={{
                padding: '11px 8px',
                borderRadius: 12,
                border: (paymentMethod === 'cartao_credito' || paymentMethod === 'cartao_debito') ? '2px solid #2563EB' : '1.5px solid #E2E8F0',
                backgroundColor: (paymentMethod === 'cartao_credito' || paymentMethod === 'cartao_debito') ? '#EFF6FF' : '#FFFFFF',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer'
              }}
            >
              <CreditCard size={18} color={(paymentMethod === 'cartao_credito' || paymentMethod === 'cartao_debito') ? '#2563EB' : '#64748B'} />
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A' }}>Cartão</span>
              <span style={{ fontSize: '0.64rem', color: '#2563EB', fontWeight: 700 }}>No App</span>
            </button>
          )}

          {allowCash && (
            <button
              type="button"
              onClick={() => setPaymentMethod('dinheiro')}
              style={{
                padding: '11px 8px',
                borderRadius: 12,
                border: paymentMethod === 'dinheiro' ? '2px solid #D97706' : '1.5px solid #E2E8F0',
                backgroundColor: paymentMethod === 'dinheiro' ? '#FFFBEB' : '#FFFFFF',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer'
              }}
            >
              <Banknote size={18} color={paymentMethod === 'dinheiro' ? '#D97706' : '#64748B'} />
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A' }}>Dinheiro</span>
              <span style={{ fontSize: '0.64rem', color: '#B45309', fontWeight: 700 }}>Ao motorista</span>
            </button>
          )}
        </div>

        {/* Lista de Cartões Tokenizados se escolheu Cartão */}
        {(paymentMethod === 'cartao_credito' || paymentMethod === 'cartao_debito') && (
          <div style={{
            backgroundColor: '#F8FAFC',
            borderRadius: 12,
            padding: 10,
            border: '1px solid #E2E8F0'
          }}>
            {savedCards.map(c => (
              <div
                key={c.id}
                onClick={() => {
                  setSelectedCardId(c.id);
                  setPaymentMethod(c.cardType);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: 10,
                  backgroundColor: selectedCardId === c.id ? '#EFF6FF' : '#FFFFFF',
                  border: selectedCardId === c.id ? '1.5px solid #3B82F6' : '1px solid #E2E8F0',
                  marginBottom: 6,
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CreditCard size={16} color="#2563EB" />
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0F172A' }}>
                      {c.brand} •••• {c.last4}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                      {c.cardType === 'cartao_debito' ? 'Débito' : 'Crédito'} • Val {c.expMonth}/{c.expYear}
                    </div>
                  </div>
                </div>
                {selectedCardId === c.id && <Check size={16} color="#2563EB" />}
              </div>
            ))}

            <button
              type="button"
              onClick={() => setIsAddingCardModal(true)}
              style={{
                width: '100%',
                padding: '9px',
                borderRadius: 10,
                border: '1.5px dashed #94A3B8',
                backgroundColor: '#FFFFFF',
                color: '#1E293B',
                fontWeight: 800,
                fontSize: '0.78rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                cursor: 'pointer'
              }}
            >
              <Plus size={15} />
              <span>Adicionar Cartão de Crédito ou Débito</span>
            </button>
          </div>
        )}
      </div>

      {/* Opções rápidas (Passageiros, Mala, Observação) */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        padding: '12px 14px',
        border: '1.5px solid #E2E8F0',
        marginBottom: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={16} color="#475569" />
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1E293B' }}>Passageiros:</span>
            {[1, 2, 3, 4].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setPassengers(n)}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border: passengers === n ? '2px solid #121A21' : '1px solid #CBD5E1',
                  backgroundColor: passengers === n ? '#121A21' : '#FFFFFF',
                  color: passengers === n ? '#76D800' : '#475569',
                  fontWeight: 800,
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                {n}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setHasLuggage(!hasLuggage)}
            style={{
              padding: '6px 10px',
              borderRadius: 10,
              border: hasLuggage ? '1.5px solid #16A34A' : '1px solid #CBD5E1',
              backgroundColor: hasLuggage ? '#F0FDF4' : '#FFFFFF',
              color: hasLuggage ? '#15803D' : '#64748B',
              fontSize: '0.76rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              cursor: 'pointer'
            }}
          >
            <Luggage size={15} />
            <span>Malas</span>
          </button>
        </div>

        <input
          type="text"
          placeholder="Observação para o motorista (ex: portão branco, com pet...)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid #E2E8F0',
            backgroundColor: '#F8FAFC',
            fontSize: '0.82rem',
            boxSizing: 'border-box'
          }}
        />
      </div>

      {requestError && (
        <div style={{
          backgroundColor: '#FEF2F2',
          border: '1.5px solid #FECACA',
          borderRadius: 14,
          padding: '12px',
          marginBottom: 12,
          color: '#DC2626',
          fontSize: '0.8rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <AlertCircle size={18} />
          <span>{requestError}</span>
        </div>
      )}

      {/* Barra Fixa de Solicitação Imediata Estilo Uber */}
      <div style={{
        position: 'fixed',
        bottom: 58,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 480,
        backgroundColor: '#FFFFFF',
        borderTop: '1.5px solid #E2E8F0',
        padding: '12px 16px',
        zIndex: 45,
        boxShadow: '0 -8px 25px rgba(15, 23, 42, 0.08)',
        boxSizing: 'border-box'
      }}>
        <button
          type="button"
          onClick={handleRequestRideNow}
          disabled={isSubmitting}
          style={{
            width: '100%',
            height: 52,
            borderRadius: 14,
            backgroundColor: '#000000', // Preto sólido estilo Uber
            color: '#FFFFFF',
            border: 'none',
            fontSize: '1.05rem',
            fontWeight: 900,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            cursor: 'pointer',
            boxShadow: '0 4px 18px rgba(0,0,0,0.3)',
            letterSpacing: '-0.01em'
          }}
        >
          <span>
            {isSubmitting
              ? 'Solicitando Motorista...'
              : `Pedir ${selectedCatObj.name || 'KAVRO GO'}`}
          </span>
          <span style={{
            backgroundColor: 'rgba(255, 255, 255, 0.18)',
            padding: '5px 12px',
            borderRadius: 10,
            fontSize: '1.02rem',
            fontWeight: 900
          }}>
            R$ {pricing.totalPrice.toFixed(2).replace('.', ',')}
          </span>
        </button>
      </div>
    </div>
  );
};
