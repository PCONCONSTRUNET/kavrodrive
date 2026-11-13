import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin, Users, Luggage, CreditCard,
  ArrowLeft, ShieldCheck, Check, Car, Navigation,
  Copy, QrCode, Plus, RefreshCw, AlertCircle, Lock, Sparkles, Banknote, Clock,
  Phone, MessageSquare, ChevronDown, Sliders
} from 'lucide-react';
import { LocationPoint, PaymentMethod, Ride, SystemConfig, SavedCard } from '../types';
import { calculateHaversineDistance, estimateDurationMinutes, reverseGeocode } from '../utils/geo';
import { calculateRidePrice, StorageService } from '../services/storage';
import { AddressPickerModal } from '../components/AddressPickerModal';
import { PassengerLiveMap, OnlineDriverMapDot } from '../components/PassengerLiveMap';
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
  const [showExtraOptions, setShowExtraOptions] = useState<boolean>(false);

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
  const nearbyMapDrivers: OnlineDriverMapDot[] = React.useMemo(
    () =>
      onlineDrivers
        .filter((d) => d.location && typeof d.location.lat === 'number' && typeof d.location.lng === 'number')
        .map((d) => ({ id: d.id, lat: d.location!.lat, lng: d.location!.lng })),
    [onlineDrivers]
  );

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
    const isAtPickup = activeRide.status === 'no_local';
    const isOnWay = activeRide.status === 'a_caminho' || isAtPickup;
    const isInProgress = activeRide.status === 'em_andamento';
    const cleanDriverPhone = getCleanWhatsappNumber(activeRide.driverPhone || '');

    return (
      <div className="animate-fade-in" style={{
        minHeight: 'calc(100dvh - 58px)',
        backgroundColor: '#E8EDF3',
        display: 'flex',
        flexDirection: 'column',
        maxWidth: 480,
        margin: '0 auto',
        position: 'relative'
      }}>
        {/* Mapa Ao Vivo Superior em Tela Cheia estilo Uber Passageiro */}
        <div style={{ position: 'relative', height: '46dvh', minHeight: 260, width: '100%' }}>
          <PassengerLiveMap
            origin={activeRide.origin}
            destination={activeRide.destination}
            driverPos={activeRide.driverLocation || null}
            nearbyDrivers={isSearching ? nearbyMapDrivers : []}
          />

          {/* Controles Flutuantes no Mapa */}
          <div style={{
            position: 'absolute',
            top: 'calc(12px + env(safe-area-inset-top, 0px))',
            left: 14,
            right: 14,
            zIndex: 400,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pointerEvents: 'none'
          }}>
            <button
              type="button"
              onClick={onBackToHome}
              aria-label="Voltar"
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E5E7EB',
                color: '#111111',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
                cursor: 'pointer',
                pointerEvents: 'auto'
              }}
            >
              <ArrowLeft size={20} />
            </button>

            <div style={{
              backgroundColor: '#111111',
              color: '#FFFFFF',
              padding: '7px 14px',
              borderRadius: 999,
              fontSize: '0.78rem',
              fontWeight: 800,
              boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              pointerEvents: 'auto'
            }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: isSearching ? '#F59E0B' : '#22C55E'
              }} />
              <span>
                {isSearching
                  ? 'Conectando motorista...'
                  : isInProgress
                    ? `~${activeRide.durationMin || 8} min ao destino`
                    : isAtPickup
                      ? 'Motorista chegou!'
                      : `Chegada em ~${activeRide.durationMin ? Math.min(8, activeRide.durationMin) : 4} min`}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Sheet Branca Estilo Uber Passageiro */}
        <div style={{
          flex: 1,
          backgroundColor: '#FFFFFF',
          borderRadius: '24px 24px 0 0',
          marginTop: -22,
          zIndex: 10,
          position: 'relative',
          padding: '12px 18px 96px 18px',
          boxShadow: '0 -8px 28px rgba(0,0,0,0.12)'
        }}>
          <div style={{
            width: 38,
            height: 4,
            borderRadius: 999,
            backgroundColor: '#D1D5DB',
            margin: '0 auto 14px auto'
          }} />

          {/* Status Principal */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: '1.22rem', fontWeight: 900, color: '#111111', letterSpacing: '-0.02em' }}>
                {isSearching
                  ? 'Procurando motorista...'
                  : isQueued
                    ? 'Motorista confirmado na fila'
                    : isAtPickup
                      ? 'Seu motorista chegou!'
                      : isInProgress
                        ? 'Em viagem rumo ao destino'
                        : 'Motorista a caminho'}
              </h2>
              {isSearching && <RefreshCw size={18} color="#276EF1" className="animate-spin" />}
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#6B7280', fontWeight: 500 }}>
              {isSearching
                ? `${onlineDriversCount} motorista(s) online na região recebendo seu chamado`
                : isQueued
                  ? `${activeRide.driverName || 'Seu motorista'} está concluindo um desembarque próximo.`
                  : isInProgress
                    ? 'Acompanhe o trajeto em tempo real pelo mapa acima.'
                    : 'Confira a placa e o veículo ao embarcar.'}
            </p>
          </div>

          {/* Card do Motorista estilo Uber Passageiro */}
          {activeRide.driverName && (
            <div style={{
              backgroundColor: '#F9FAFB',
              borderRadius: 16,
              padding: '14px',
              border: '1px solid #E5E7EB',
              marginBottom: 14
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <div style={{
                    width: 50,
                    height: 50,
                    borderRadius: '50%',
                    backgroundColor: '#111111',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    fontSize: '1.15rem',
                    overflow: 'hidden',
                    flexShrink: 0,
                    border: '2px solid #FFFFFF',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
                  }}>
                    {activeRide.driverPhoto ? (
                      <img src={activeRide.driverPhoto} alt={activeRide.driverName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      activeRide.driverName.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#111111' }}>
                      {activeRide.driverName} • ★ {Number(activeRide.driverRating || 4.98).toFixed(2)}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#4B5563', fontWeight: 600, marginTop: 2 }}>
                      {activeRide.driverVehicle || 'Veículo Parceiro'} {activeRide.driverCarColor ? `(${activeRide.driverCarColor})` : ''}
                    </div>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      marginTop: 4,
                      padding: '2px 8px',
                      borderRadius: 999,
                      backgroundColor: '#DCFCE7',
                      color: '#15803D',
                      fontSize: '0.67rem',
                      fontWeight: 800
                    }}>
                      <span>✓ Veículo &amp; CRLV Aprovado</span>
                    </div>
                  </div>
                </div>
                {activeRide.driverPlate && (
                  <MercosulPlateBadge plate={activeRide.driverPlate} size="sm" />
                )}
              </div>

              {/* Ações rápidas com o motorista (Enviar mensagem + Ligar) */}
              {activeRide.driverPhone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                  <a
                    href={`https://wa.me/${cleanDriverPhone}?text=${encodeURIComponent(`Olá ${activeRide.driverName || ''}, sou o passageiro da corrida ${formatRideCode(activeRide)}!`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      flex: 1,
                      height: 40,
                      borderRadius: 999,
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #D1D5DB',
                      color: '#111111',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '0 14px',
                      textDecoration: 'none'
                    }}
                  >
                    <MessageSquare size={15} color="#4B5563" />
                    <span>Enviar mensagem...</span>
                  </a>

                  <a
                    href={`tel:${cleanDriverPhone}`}
                    aria-label="Ligar para motorista"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #D1D5DB',
                      color: '#111111',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textDecoration: 'none',
                      flexShrink: 0
                    }}
                  >
                    <Phone size={16} />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Resumo Compacto Origem/Destino & Pagamento */}
          <div style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E5E7EB',
            borderRadius: 16,
            padding: '12px 14px',
            marginBottom: 14
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', border: '2.5px solid #111111', flexShrink: 0 }} />
              <span style={{ fontSize: '0.8rem', color: '#111111', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activeRide.origin.address}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: '1px solid #F3F4F6' }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: '#111111', flexShrink: 0 }} />
              <span style={{ fontSize: '0.8rem', color: '#111111', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activeRide.destination.address}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10 }}>
              <span style={{ fontSize: '0.78rem', color: '#6B7280', fontWeight: 700 }}>
                {activeRide.paymentMethod === 'pix'
                  ? 'PIX Confirmado'
                  : activeRide.paymentMethod === 'dinheiro'
                    ? 'Dinheiro ao motorista'
                    : `Cartão •••• ${activeRide.cardLast4 || 'App'}`}
              </span>
              <span style={{ fontSize: '1.08rem', fontWeight: 900, color: '#111111' }}>
                R$ {activeRide.totalPrice.toFixed(2).replace('.', ',')}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate(`/viagem/${encodeURIComponent(activeRide.id)}`)}
            style={{
              width: '100%',
              height: 50,
              borderRadius: 12,
              backgroundColor: '#111111',
              color: '#FFFFFF',
              border: 'none',
              fontSize: '0.94rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: 'pointer'
            }}
          >
            <Navigation size={17} />
            <span>Acompanhar GPS em Tela Cheia</span>
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // TELA PRINCIPAL: PEDIR CORRIDA AGORA (100% IMEDIATO ESTILO UBER)
  // ============================================================================
  return (
    <div className="animate-fade-in" style={{
      minHeight: 'calc(100dvh - 58px)',
      backgroundColor: '#E8EDF3',
      display: 'flex',
      flexDirection: 'column',
      maxWidth: 480,
      margin: '0 auto',
      position: 'relative',
      paddingBottom: 'calc(132px + env(safe-area-inset-bottom, 0px))'
    }}>
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

      {/* =====================================================================
          MAPA EM TELA CHEIA ESTILO UBER PASSAGEIRO + CONTROLES FLUTUANTES
         ===================================================================== */}
      <div style={{ position: 'relative', height: origin && destination ? '38dvh' : '42dvh', minHeight: 225, width: '100%' }}>
        <PassengerLiveMap
          origin={origin}
          destination={destination}
          nearbyDrivers={nearbyMapDrivers}
        />

        {/* Botão Voltar & Badge de Motoristas Flutuantes */}
        <div style={{
          position: 'absolute',
          top: 'calc(12px + env(safe-area-inset-top, 0px))',
          left: 14,
          right: 14,
          zIndex: 400,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pointerEvents: 'none'
        }}>
          <button
            type="button"
            onClick={onBackToHome}
            aria-label="Voltar"
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E5E7EB',
              color: '#111111',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
              cursor: 'pointer',
              pointerEvents: 'auto'
            }}
          >
            <ArrowLeft size={20} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}>
            {origin && destination && (
              <div style={{
                backgroundColor: '#111111',
                color: '#FFFFFF',
                padding: '7px 12px',
                borderRadius: 999,
                fontSize: '0.74rem',
                fontWeight: 800,
                boxShadow: '0 4px 14px rgba(0,0,0,0.22)'
              }}>
                {distanceKm.toFixed(1)} km • ~{durationMin} min
              </div>
            )}

            <div style={{
              backgroundColor: '#FFFFFF',
              color: '#111111',
              border: '1px solid #E5E7EB',
              padding: '7px 12px',
              borderRadius: 999,
              fontSize: '0.74rem',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 4px 14px rgba(0,0,0,0.14)'
            }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: onlineDriversCount > 0 ? '#16A34A' : '#9CA3AF'
              }} />
              <span>{onlineDriversCount} disp.</span>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          BOTTOM SHEET BRANCA ESTILO UBER PASSAGEIRO
         ===================================================================== */}
      <div style={{
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: '24px 24px 0 0',
        marginTop: -22,
        zIndex: 10,
        position: 'relative',
        padding: '10px 16px 18px 16px',
        boxShadow: '0 -8px 28px rgba(0,0,0,0.12)'
      }}>
        {/* Handle cinza */}
        <div style={{
          width: 38,
          height: 4,
          borderRadius: 999,
          backgroundColor: '#D1D5DB',
          margin: '0 auto 12px auto'
        }} />

        {/* Bloco Conectado Partida / Chegada estilo Uber Clean */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#111111', letterSpacing: '-0.02em' }}>
              {origin && destination ? 'Escolha uma viagem' : 'Para onde vamos?'}
            </h2>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              backgroundColor: '#F3F4F6',
              color: '#111111',
              borderRadius: 999,
              padding: '5px 11px',
              fontSize: '0.74rem',
              fontWeight: 700
            }}>
              <Clock size={13} strokeWidth={2.3} />
              <span>Agora</span>
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            {/* Linha conectora */}
            <div style={{
              position: 'absolute',
              left: 20,
              top: 28,
              bottom: 28,
              width: 1.5,
              backgroundColor: '#111111',
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
                backgroundColor: '#F3F4F6',
                borderRadius: 12,
                height: 46,
                display: 'flex',
                alignItems: 'center',
                paddingLeft: 38,
                paddingRight: 44,
                marginBottom: 8,
                cursor: 'pointer'
              }}
            >
              <span style={{
                position: 'absolute',
                left: 15,
                width: 10,
                height: 10,
                borderRadius: '50%',
                border: '3px solid #111111',
                backgroundColor: '#FFFFFF',
                zIndex: 4,
                boxSizing: 'border-box'
              }} />
              <span style={{
                flex: 1,
                minWidth: 0,
                fontSize: '0.88rem',
                fontWeight: origin ? 600 : 500,
                color: origin ? '#111111' : '#6B7280',
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
                  right: 8,
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: '#FFFFFF',
                  color: '#111111',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                  opacity: locatingOriginGps ? 0.45 : 1
                }}
              >
                <Navigation size={14} fill="#111111" color="#111111" />
              </button>
            </div>

            {/* Local de chegada */}
            <button
              type="button"
              onClick={() => setIsPickingDestination(true)}
              style={{
                width: '100%',
                position: 'relative',
                backgroundColor: '#F3F4F6',
                border: destination ? '1.5px solid #111111' : '1.5px solid transparent',
                borderRadius: 12,
                height: 46,
                display: 'flex',
                alignItems: 'center',
                paddingLeft: 38,
                paddingRight: 14,
                textAlign: 'left',
                cursor: 'pointer'
              }}
            >
              <span style={{
                position: 'absolute',
                left: 15,
                width: 10,
                height: 10,
                borderRadius: 2,
                border: '3px solid #111111',
                backgroundColor: '#FFFFFF',
                zIndex: 4,
                boxSizing: 'border-box'
              }} />
              <span style={{
                flex: 1,
                minWidth: 0,
                fontSize: '0.88rem',
                fontWeight: destination ? 700 : 500,
                color: destination ? '#111111' : '#6B7280',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {destination ? destination.address : 'Para onde você vai?'}
              </span>
            </button>
          </div>
        </div>

        {/* Categorias estilo Uber Passageiro */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
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
                  border: isSelected ? '2px solid #111111' : '1px solid #E5E7EB',
                  backgroundColor: isSelected ? '#F9FAFB' : '#FFFFFF',
                  opacity: hasNoDriverInCat && !isSelected ? 0.65 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <div style={{
                    width: 46,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: isSelected ? '#111111' : '#F3F4F6',
                    color: isSelected ? '#FFFFFF' : '#111111',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Car size={20} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: '0.96rem', fontWeight: 800, color: '#111111' }}>
                        {cat.name}
                      </span>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 2,
                        fontSize: '0.72rem',
                        color: '#4B5563',
                        fontWeight: 700
                      }}>
                        <Users size={11} />4
                      </span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: hasNoDriverInCat ? '#DC2626' : '#4B5563', fontWeight: 600, marginTop: 1 }}>
                      {hasNoDriverInCat
                        ? 'Sem motoristas nessa categoria agora'
                        : `Chega em ~${stats.etaMin} min • ${cat.description}`}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#111111' }}>
                    R$ {catPrice.totalPrice.toFixed(2).replace('.', ',')}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Alerta caso não haja motoristas disponíveis para a categoria escolhida */}
        {onlineDrivers.length > 0 && selectedCatStats.availableDriversCount === 0 && (
          <div style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 12,
            backgroundColor: '#FFFBEB',
            border: '1px solid #FDE68A',
            color: '#92400E',
            fontSize: '0.76rem'
          }}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>
              Sem motoristas disponíveis em {selectedCatObj.name} agora.
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
                        padding: '6px 10px',
                        borderRadius: 8,
                        border: 'none',
                        backgroundColor: '#111111',
                        color: '#FFFFFF',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      Mudar p/ {alt.name} (R$ {altPrice.totalPrice.toFixed(2).replace('.', ',')})
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Pagamento & Opções em Linha Limpa */}
        <div style={{
          borderTop: '1px solid #F3F4F6',
          paddingTop: 12,
          marginBottom: 8
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.max(1, (allowPix ? 1 : 0) + (allowAnyCard ? 1 : 0) + (allowCash ? 1 : 0))}, 1fr)`,
            gap: 8,
            marginBottom: 8
          }}>
            {allowPix && (
              <button
                type="button"
                onClick={() => setPaymentMethod('pix')}
                style={{
                  padding: '9px 8px',
                  borderRadius: 10,
                  border: paymentMethod === 'pix' ? '2px solid #111111' : '1px solid #E5E7EB',
                  backgroundColor: paymentMethod === 'pix' ? '#F3F4F6' : '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer'
                }}
              >
                <QrCode size={16} color={paymentMethod === 'pix' ? '#15803D' : '#6B7280'} />
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#111111' }}>PIX</span>
              </button>
            )}

            {allowAnyCard && (
              <button
                type="button"
                onClick={() => setPaymentMethod(allowCreditCard ? 'cartao_credito' : 'cartao_debito')}
                style={{
                  padding: '9px 8px',
                  borderRadius: 10,
                  border: (paymentMethod === 'cartao_credito' || paymentMethod === 'cartao_debito') ? '2px solid #111111' : '1px solid #E5E7EB',
                  backgroundColor: (paymentMethod === 'cartao_credito' || paymentMethod === 'cartao_debito') ? '#F3F4F6' : '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer'
                }}
              >
                <CreditCard size={16} color={(paymentMethod === 'cartao_credito' || paymentMethod === 'cartao_debito') ? '#276EF1' : '#6B7280'} />
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#111111' }}>Cartão</span>
              </button>
            )}

            {allowCash && (
              <button
                type="button"
                onClick={() => setPaymentMethod('dinheiro')}
                style={{
                  padding: '9px 8px',
                  borderRadius: 10,
                  border: paymentMethod === 'dinheiro' ? '2px solid #111111' : '1px solid #E5E7EB',
                  backgroundColor: paymentMethod === 'dinheiro' ? '#F3F4F6' : '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer'
                }}
              >
                <Banknote size={16} color={paymentMethod === 'dinheiro' ? '#B45309' : '#6B7280'} />
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#111111' }}>Dinheiro</span>
              </button>
            )}
          </div>

          {/* Cartões tokenizados quando selecionou Cartão */}
          {(paymentMethod === 'cartao_credito' || paymentMethod === 'cartao_debito') && (
            <div style={{
              backgroundColor: '#F9FAFB',
              borderRadius: 12,
              padding: 10,
              border: '1px solid #E5E7EB',
              marginBottom: 8
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
                    border: selectedCardId === c.id ? '1.5px solid #276EF1' : '1px solid #E5E7EB',
                    marginBottom: 6,
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CreditCard size={15} color="#276EF1" />
                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#111111' }}>
                        {c.brand} •••• {c.last4}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#6B7280' }}>
                        {c.cardType === 'cartao_debito' ? 'Débito' : 'Crédito'} • Val {c.expMonth}/{c.expYear}
                      </div>
                    </div>
                  </div>
                  {selectedCardId === c.id && <Check size={15} color="#276EF1" />}
                </div>
              ))}

              <button
                type="button"
                onClick={() => setIsAddingCardModal(true)}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: 10,
                  border: '1px dashed #9CA3AF',
                  backgroundColor: '#FFFFFF',
                  color: '#111111',
                  fontWeight: 700,
                  fontSize: '0.76rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer'
                }}
              >
                <Plus size={14} />
                <span>Adicionar cartão</span>
              </button>
            </div>
          )}

          {/* Toggle compacto para Passageiros, Malas e Observação */}
          <button
            type="button"
            onClick={() => setShowExtraOptions(v => !v)}
            style={{
              width: '100%',
              background: 'none',
              border: 'none',
              padding: '6px 2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              color: '#4B5563',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Sliders size={13} />
              <span>{passengers} passageiro(s){hasLuggage ? ' • Com malas' : ''}{notes ? ' • Obs. adicionada' : ''}</span>
            </span>
            <ChevronDown size={15} style={{ transform: showExtraOptions ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>

          {showExtraOptions && (
            <div style={{
              backgroundColor: '#F9FAFB',
              borderRadius: 12,
              padding: 10,
              border: '1px solid #E5E7EB',
              marginTop: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Users size={15} color="#4B5563" />
                  {[1, 2, 3, 4].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPassengers(n)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        border: passengers === n ? '2px solid #111111' : '1px solid #D1D5DB',
                        backgroundColor: passengers === n ? '#111111' : '#FFFFFF',
                        color: passengers === n ? '#FFFFFF' : '#4B5563',
                        fontWeight: 800,
                        fontSize: '0.78rem',
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
                    padding: '5px 10px',
                    borderRadius: 8,
                    border: hasLuggage ? '1.5px solid #111111' : '1px solid #D1D5DB',
                    backgroundColor: hasLuggage ? '#111111' : '#FFFFFF',
                    color: hasLuggage ? '#FFFFFF' : '#4B5563',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer'
                  }}
                >
                  <Luggage size={14} />
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
                  padding: '9px 11px',
                  borderRadius: 10,
                  border: '1px solid #D1D5DB',
                  backgroundColor: '#FFFFFF',
                  fontSize: '0.8rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          )}
        </div>

        {requestError && (
          <div style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 12,
            padding: '10px 12px',
            color: '#DC2626',
            fontSize: '0.78rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <AlertCircle size={16} />
            <span>{requestError}</span>
          </div>
        )}
      </div>

      {/* CTA Preto Sólido Estilo Uber Fixo acima da barra inferior */}
      <div style={{
        position: 'fixed',
        bottom: 58,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 480,
        backgroundColor: '#FFFFFF',
        borderTop: '1px solid #E5E7EB',
        padding: '10px 16px 12px 16px',
        zIndex: 45,
        boxShadow: '0 -6px 20px rgba(0, 0, 0, 0.08)',
        boxSizing: 'border-box'
      }}>
        <button
          type="button"
          onClick={handleRequestRideNow}
          disabled={isSubmitting}
          style={{
            width: '100%',
            height: 50,
            borderRadius: 12,
            backgroundColor: '#000000',
            color: '#FFFFFF',
            border: 'none',
            fontSize: '1rem',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 18px',
            cursor: 'pointer',
            letterSpacing: '-0.01em'
          }}
        >
          <span>
            {isSubmitting
              ? 'Solicitando...'
              : `Escolher ${selectedCatObj.name || 'KAVRO GO'}`}
          </span>
          <span style={{
            backgroundColor: 'rgba(255, 255, 255, 0.16)',
            padding: '4px 10px',
            borderRadius: 8,
            fontSize: '0.96rem',
            fontWeight: 900
          }}>
            R$ {pricing.totalPrice.toFixed(2).replace('.', ',')}
          </span>
        </button>
      </div>
    </div>
  );
};
