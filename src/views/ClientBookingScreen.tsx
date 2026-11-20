import React, { useState, useEffect } from 'react';
import {
  MapPin, Users, Luggage, CreditCard,
  ArrowLeft, ShieldCheck, Check, Car, Navigation,
  Copy, QrCode, Plus, RefreshCw, AlertCircle, Lock, Sparkles, Banknote, Clock,
  Phone, MessageSquare, ChevronDown, Sliders, Maximize2, Minimize2, Share2, Pencil, Package
} from 'lucide-react';
import { LocationPoint, PaymentMethod, Ride, RideDeliveryDetails, SavedCard, ServiceCategoryType, SystemConfig } from '../types';
import { calculateHaversineDistance, estimateDurationMinutes, reverseGeocode } from '../utils/geo';
import {
  calculateRidePrice,
  StorageService,
  findActivePassengerRide,
  canPassengerCancelRide,
  canPassengerEditRoute
} from '../services/storage';
import { RealtimeService } from '../services/realtime';
import { AddressPickerModal } from '../components/AddressPickerModal';
import { PassengerLiveMap, OnlineDriverMapDot } from '../components/PassengerLiveMap';
import { MercosulPlateBadge } from '../components/MercosulPlateBadge';
import { RideChatModal } from '../components/DriverChatModal';
import { formatRideCode, getCleanWhatsappNumber } from '../utils/format';
import {
  normalizeCategoriesFromConfig,
  isDriverAvailableForCategory,
  getCategoryById,
  resolveCategoryType,
  mapLegacyCategoryId
} from '../utils/categoryEngine';
import { WhatsAppIcon } from '../components/WhatsAppIcon';
import { RideRatingBottomSheet } from '../components/RideRatingBottomSheet';
import { TrustedContactsModal } from '../components/TrustedContactsModal';
import { SafetyCenterModal } from '../components/SafetyCenterModal';
import { RideCheckAlertModal } from '../components/RideCheckAlertModal';
import { SosEmergencyModal } from '../components/SosEmergencyModal';
import { StripeCardForm, confirmStripe3dsPaymentIntent } from '../components/StripeCardForm';
import { StripeWalletCheckout } from '../components/StripeWalletCheckout';
import { RideSearchingStageCard } from '../components/RideSearchingStageCard';
import { PixQrCode } from '../components/PixQrCode';
import { RideCancelModal } from '../components/RideCancelModal';
import { RideEditRouteModal } from '../components/RideEditRouteModal';
import { PaymentMethodIcon, getPaymentMethodLabel } from '../components/PaymentMethodIcon';
import { PassengerWalletModal } from '../components/PassengerWalletModal';
import confetti from 'canvas-confetti';

interface ClientBookingScreenProps {
  config: SystemConfig;
  currentUser?: import('../types').ClientProfile | null;
  onRideBooked: (ride: Ride) => void;
  onBackToHome: () => void;
  initialOrigin?: LocationPoint | null;
  initialDestination?: LocationPoint | null;
  initialCategoryId?: string | null;
  initialRide?: Ride | null;
}

export const ClientBookingScreen: React.FC<ClientBookingScreenProps> = ({
  config,
  currentUser: propUser,
  onRideBooked,
  onBackToHome,
  initialOrigin,
  initialDestination,
  initialCategoryId,
  initialRide,
}) => {
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
  const allowApplePayConfig =
    allowedMethods.includes('apple_pay') || (allowCreditCard && !config.applePayDisabled);
  const allowWallet =
    allowedMethods.includes('carteira') || !config.walletPaymentDisabled;

  const [passengers, setPassengers] = useState<number>(1);
  const [hasLuggage, setHasLuggage] = useState<boolean>(false);
  const [serviceMode, setServiceMode] = useState<ServiceCategoryType>(() =>
    resolveCategoryType(initialCategoryId || 'kavro_go')
  );
  const [selectedCategory, setSelectedCategory] = useState<string>(() =>
    mapLegacyCategoryId(initialCategoryId || 'kavro_go')
  );
  const [deliveryRole, setDeliveryRole] = useState<'sender' | 'receiver'>('sender');
  const [deliveryRecipientName, setDeliveryRecipientName] = useState<string>('');
  const [deliveryRecipientPhone, setDeliveryRecipientPhone] = useState<string>('');
  const [deliveryItemDesc, setDeliveryItemDesc] = useState<string>('');
  const [deliveryPackageSize, setDeliveryPackageSize] = useState<'pequeno' | 'medio' | 'grande'>('pequeno');
  const [deliveryDropoffMode, setDeliveryDropoffMode] = useState<'porta_mao' | 'portaria' | 'recepcao'>('porta_mao');
  const [deliveryInstructions, setDeliveryInstructions] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() =>
    allowPix ? 'pix' : allowCreditCard ? 'cartao_credito' : allowDebitCard ? 'cartao_debito' : 'dinheiro'
  );
  const [notes, setNotes] = useState<string>('');
  const [showExtraOptions, setShowExtraOptions] = useState<boolean>(false);

  const [paymentsConfig, setPaymentsConfig] = useState<{
    gatewayProvider: 'stripe' | 'mercadopago' | 'sandbox';
    stripeEnabled: boolean;
    stripePublishableKey: string;
    mercadopagoEnabled: boolean;
    mercadopagoPublicKey: string;
    autoPixPayoutEnabled: boolean;
  }>({
    gatewayProvider: 'sandbox',
    stripeEnabled: false,
    stripePublishableKey: String(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '').trim(),
    mercadopagoEnabled: false,
    mercadopagoPublicKey: String(import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY || '').trim(),
    autoPixPayoutEnabled: false
  });
  const allowApplePay =
    paymentsConfig.stripeEnabled && Boolean(paymentsConfig.stripePublishableKey) && allowApplePayConfig;

  useEffect(() => {
    const isCurrentlyAllowed =
      paymentMethod === 'apple_pay'
        ? allowApplePay
        : paymentMethod === 'carteira'
          ? allowWallet
          : allowedMethods.includes(paymentMethod);
    if (!isCurrentlyAllowed) {
      const nextMethod: PaymentMethod = allowPix
        ? 'pix'
        : allowCreditCard
          ? 'cartao_credito'
          : allowDebitCard
            ? 'cartao_debito'
            : allowApplePay
              ? 'apple_pay'
              : allowWallet
                ? 'carteira'
                : 'dinheiro';
      setPaymentMethod(nextMethod);
    }
  }, [allowedMethods.join(','), paymentMethod, allowApplePay, allowWallet]);

  const [walletBalance, setWalletBalance] = useState<number>(Number(currentUser?.walletBalance || 0));
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  useEffect(() => {
    if (!currentUser?.id) {
      setWalletBalance(0);
      return;
    }
    let alive = true;
    const syncW = () => {
      StorageService.fetchClientWallet(currentUser.id).then((res) => {
        if (alive && res.ok && res.wallet) {
          setWalletBalance(res.wallet.balance);
        }
      }).catch(() => {});
    };
    const onWalletUpdated = (evt: Event) => {
      const detail = (evt as CustomEvent)?.detail;
      if (detail && typeof detail.balance === 'number') {
        setWalletBalance(detail.balance);
      }
    };
    setWalletBalance(Number(currentUser.walletBalance || 0));
    syncW();
    window.addEventListener('up_client_wallet_updated', onWalletUpdated);
    return () => {
      alive = false;
      window.removeEventListener('up_client_wallet_updated', onWalletUpdated);
    };
  }, [currentUser?.id]);

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

  // Estado da solicitação em tempo real (restaura corrida ativa do passageiro automaticamente igual à Uber)
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [activeRide, setActiveRide] = useState<Ride | null>(() => {
    if (initialRide) return initialRide;
    if (initialDestination) return null;
    return findActivePassengerRide(StorageService.getRides(), currentUser);
  });
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [isRatingSheetOpen, setIsRatingSheetOpen] = useState(false);
  const [ratedRideSheetShownId, setRatedRideSheetShownId] = useState<string>('');
  const [copiedPix, setCopiedPix] = useState(false);
  const [pixRemainingLabel, setPixRemainingLabel] = useState('');
  const [isSimulatingWebhook, setIsSimulatingWebhook] = useState(false);
  const [locatingOriginGps, setLocatingOriginGps] = useState(false);
  const [isTrustedContactsOpen, setIsTrustedContactsOpen] = useState(false);
  const [isSafetyCenterOpen, setIsSafetyCenterOpen] = useState(false);
  const [isSosOpen, setIsSosOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isEditRouteModalOpen, setIsEditRouteModalOpen] = useState(false);
  const [trustedCount, setTrustedCount] = useState<number>(currentUser?.trustedContacts?.length || 0);

  useEffect(() => {
    setTrustedCount(currentUser?.trustedContacts?.length || 0);
  }, [currentUser?.trustedContacts?.length]);

  const pixExpiresAtRaw =
    activeRide?.status === 'aguardando_pagamento'
      ? (activeRide as unknown as { pixExpiresAt?: string; expiresAt?: string }).pixExpiresAt ||
        (activeRide as unknown as { pixExpiresAt?: string; expiresAt?: string }).expiresAt ||
        ''
      : '';

  useEffect(() => {
    if (!pixExpiresAtRaw) {
      setPixRemainingLabel('');
      return;
    }
    const updateCountdown = () => {
      const expiresMs = new Date(pixExpiresAtRaw).getTime();
      if (!Number.isFinite(expiresMs)) {
        setPixRemainingLabel('');
        return;
      }
      const diffSec = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));
      if (diffSec <= 0) {
        setPixRemainingLabel('Expirado');
        return;
      }
      const mins = Math.floor(diffSec / 60);
      const secs = diffSec % 60;
      setPixRemainingLabel(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
    };
    updateCountdown();
    const timerId = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timerId);
  }, [pixExpiresAtRaw]);

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

  // Carrega configuração ativa do gateway de pagamento (Stripe / Mercado Pago / Sandbox)
  useEffect(() => {
    StorageService.fetchPaymentsConfig().then(setPaymentsConfig).catch(() => {});
  }, []);

  // Finaliza corrida automaticamente após retorno do Apple Pay / Stripe Checkout
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const sessionId = String(params.get('stripe_checkout_session_id') || '').trim();
    const canceled = params.get('stripe_checkout_canceled');
    if (!sessionId && !canceled) return;

    const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
    window.history.replaceState({}, '', cleanUrl);

    if (canceled && !sessionId) {
      setRequestError('Pagamento no Apple Pay cancelado antes da confirmação.');
      return;
    }

    let cancelledFlag = false;
    setIsSubmitting(true);
    StorageService.completeStripeCheckoutSession(sessionId)
      .then((res) => {
        if (cancelledFlag) return;
        setIsSubmitting(false);
        if (res.ok && res.ride) {
          setActiveRide(res.ride);
          onRideBooked(res.ride);
          try {
            confetti({ particleCount: 60, spread: 55, origin: { y: 0.6 } });
          } catch {
            // ignore
          }
        } else {
          setRequestError(res.error || 'Não foi possível concluir a autorização via Apple Pay.');
        }
      })
      .catch(() => {
        if (!cancelledFlag) {
          setIsSubmitting(false);
          setRequestError('Erro ao verificar autorização do pagamento Apple Pay.');
        }
      });
    return () => {
      cancelledFlag = true;
    };
  }, []);

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

  // Sincroniza quando um initialRide é selecionado externamente
  useEffect(() => {
    if (initialRide) {
      setActiveRide(initialRide);
    }
  }, [initialRide]);

  // Restaura automaticamente a corrida ativa do passageiro caso exista em curso no banco
  useEffect(() => {
    if (initialRide || initialDestination || activeRide) return;
    let alive = true;
    StorageService.syncFromDatabase().then(() => {
      if (!alive) return;
      const resumed = findActivePassengerRide(StorageService.getRides(), currentUser);
      if (resumed) setActiveRide(resumed);
    }).catch(() => {});
    return () => { alive = false; };
  }, [initialRide, initialDestination, activeRide, currentUser]);

  // Atualiza em tempo real o status e posição GPS do motorista na Tela Ao Vivo Unificada
  useEffect(() => {
    if (!activeRide) return;
    setUnreadChatCount(0);
    const syncActive = () => {
      const latest = StorageService.getRides().find(r => r.id === activeRide.id);
      if (latest) {
        setActiveRide(prev => prev && latest.driverLocation ? latest : latest || prev);
      }
    };
    const handleRealtimeChat = (evt: Event) => {
      const detail = (evt as CustomEvent)?.detail;
      if (!detail || detail.rideId !== activeRide.id || !detail.message) return;
      if (detail.message.sender === 'driver' && !isChatOpen) {
        setUnreadChatCount(c => c + 1);
      }
    };
    window.addEventListener('up_rides_updated', syncActive);
    window.addEventListener('up_database_synced', syncActive);
    window.addEventListener('up_realtime_ride', syncActive);
    window.addEventListener('up_realtime_chat', handleRealtimeChat);
    const intervalMs = RealtimeService.isConnected() ? 8000 : 2500;
    const interval = setInterval(() => {
      StorageService.syncFromDatabase().then(syncActive);
    }, intervalMs);

    const gpsInterval =
      activeRide.driverId &&
      activeRide.status !== 'aguardando_pagamento' &&
      activeRide.status !== 'aguardando_confirmacao' &&
      activeRide.status !== 'finalizada' &&
      activeRide.status !== 'cancelada'
        ? setInterval(async () => {
            const live = await StorageService.fetchRideLiveLocation(activeRide.id);
            if (live?.driverLocation?.lat && live?.driverLocation?.lng) {
              setActiveRide((prev) =>
                prev ? { ...prev, driverLocation: live.driverLocation, status: live.status || prev.status } : prev
              );
            }
          }, 2500)
        : null;

    return () => {
      clearInterval(interval);
      if (gpsInterval) clearInterval(gpsInterval);
      window.removeEventListener('up_rides_updated', syncActive);
      window.removeEventListener('up_database_synced', syncActive);
      window.removeEventListener('up_realtime_ride', syncActive);
      window.removeEventListener('up_realtime_chat', handleRealtimeChat);
    };
  }, [activeRide?.id, activeRide?.driverId, activeRide?.status, isChatOpen]);

  // Abre automaticamente o bottom sheet estilo Uber assim que a corrida finaliza
  useEffect(() => {
    if (
      activeRide &&
      activeRide.status === 'finalizada' &&
      !activeRide.passengerRating &&
      ratedRideSheetShownId !== activeRide.id
    ) {
      setIsRatingSheetOpen(true);
      setRatedRideSheetShownId(activeRide.id);
    }
  }, [activeRide?.id, activeRide?.status, activeRide?.passengerRating, ratedRideSheetShownId]);

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
  const padraoCategories = React.useMemo(
    () => activeCategories.filter(c => resolveCategoryType(c) !== 'entregas'),
    [activeCategories]
  );
  const entregasCategories = React.useMemo(
    () => activeCategories.filter(c => resolveCategoryType(c) === 'entregas'),
    [activeCategories]
  );
  const visibleModeCategories = React.useMemo(() => {
    const bucket = serviceMode === 'entregas' ? entregasCategories : padraoCategories;
    return bucket.length > 0 ? bucket : activeCategories;
  }, [serviceMode, entregasCategories, padraoCategories, activeCategories]);

  useEffect(() => {
    if (visibleModeCategories.length > 0 && !visibleModeCategories.some(c => c.id === selectedCategory)) {
      setSelectedCategory(visibleModeCategories[0].id);
    }
  }, [visibleModeCategories, selectedCategory]);

  useEffect(() => {
    if (initialCategoryId) {
      const mapped = mapLegacyCategoryId(initialCategoryId);
      setServiceMode(resolveCategoryType(mapped));
      setSelectedCategory(mapped);
    }
  }, [initialCategoryId]);

  const handleSwitchServiceMode = (mode: ServiceCategoryType) => {
    setServiceMode(mode);
    setRequestError('');
    const list = mode === 'entregas' ? entregasCategories : padraoCategories;
    if (list.length > 0) {
      setSelectedCategory(list[0].id);
    }
  };

  const pricing = calculateRidePrice(distanceKm, durationMin, nowTimeStr, config, selectedCategory, undefined, paymentMethod);
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
      let etaMin = resolveCategoryType(cat) === 'entregas' ? 5 : 3;
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

  const validateBookingBeforePayment = (): {
    ok: boolean;
    error?: string;
    isDeliveryOrder: boolean;
    deliveryDetails?: RideDeliveryDetails;
  } => {
    setRequestError('');
    if (!origin) {
      setIsPickingOrigin(true);
      return { ok: false, error: 'Selecione o local de partida.', isDeliveryOrder: false };
    }
    if (!destination) {
      setIsPickingDestination(true);
      return { ok: false, error: 'Selecione o destino da viagem.', isDeliveryOrder: false };
    }

    const isDeliveryOrder =
      serviceMode === 'entregas' || resolveCategoryType(selectedCatObj) === 'entregas';

    let normalizedDeliveryPayload: RideDeliveryDetails | undefined;
    if (isDeliveryOrder) {
      const cleanName = deliveryRecipientName.trim();
      const cleanPhone = deliveryRecipientPhone.trim();
      const phoneDigits = cleanPhone.replace(/\D/g, '');
      const cleanItem = deliveryItemDesc.trim();
      if (cleanName.length < 2) {
        const msg = `Informe o nome completo de quem vai ${deliveryRole === 'sender' ? 'receber' : 'entregar'} o pacote.`;
        setRequestError(msg);
        return { ok: false, error: msg, isDeliveryOrder };
      }
      if (phoneDigits.length < 10) {
        const msg = 'Informe um WhatsApp ou telefone válido com DDD para a entrega.';
        setRequestError(msg);
        return { ok: false, error: msg, isDeliveryOrder };
      }
      if (cleanItem.length < 2) {
        const msg = 'Descreva o produto ou item que será enviado na entrega.';
        setRequestError(msg);
        return { ok: false, error: msg, isDeliveryOrder };
      }
      normalizedDeliveryPayload = {
        role: deliveryRole,
        recipientName: cleanName,
        recipientPhone: cleanPhone,
        itemDescription: cleanItem,
        packageSize: deliveryPackageSize,
        dropoffMode: deliveryDropoffMode,
        ...(deliveryInstructions.trim() ? { instructions: deliveryInstructions.trim() } : {})
      };
    }

    if (onlineDrivers.length > 0 && selectedCatStats.availableDriversCount === 0) {
      const msg = `Não há motoristas disponíveis para ${selectedCatObj.name} neste momento.`;
      setRequestError(msg);
      return { ok: false, error: msg, isDeliveryOrder };
    }

    return { ok: true, isDeliveryOrder, deliveryDetails: normalizedDeliveryPayload };
  };

  const buildValidatedRideDraft = (effectiveMethod: PaymentMethod, cardMeta?: {
    cardId?: string;
    cardLast4?: string;
    cardBrand?: string;
    stripePaymentIntentId?: string;
    validation: { isDeliveryOrder: boolean; deliveryDetails: RideDeliveryDetails | null };
  }) => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const v = cardMeta?.validation || { isDeliveryOrder: false, deliveryDetails: null };
    return {
      clientId: currentUser?.id,
      clientName: currentUser?.name || 'Passageiro',
      clientPhone: currentUser?.phone || '',
      origin: origin!,
      destination: destination!,
      date: todayStr,
      time: nowTimeStr,
      passengers: v.isDeliveryOrder ? 0 : passengers,
      hasLuggage: v.isDeliveryOrder ? deliveryPackageSize === 'grande' : hasLuggage,
      distanceKm,
      durationMin,
      category: selectedCategory,
      categoryName: pricing.categoryName,
      serviceType: (v.isDeliveryOrder ? 'entregas' : 'padrao') as ServiceCategoryType,
      deliveryDetails: v.deliveryDetails || null,
      appliedFareSnapshot: {
        ...pricing.appliedFareSnapshot,
        categoryType: (v.isDeliveryOrder ? 'entregas' : 'padrao') as ServiceCategoryType,
        ...(v.deliveryDetails ? { deliveryDetails: v.deliveryDetails } : {})
      },
      baseFare: pricing.appliedFareSnapshot.baseFare,
      commissionPercent: pricing.commissionPercent,
      totalPrice: pricing.totalPrice,
      paymentMethod: effectiveMethod,
      cardId: cardMeta?.cardId,
      cardLast4: cardMeta?.cardLast4,
      cardBrand: cardMeta?.cardBrand,
      stripePaymentIntentId: cardMeta?.stripePaymentIntentId,
      notes: v.isDeliveryOrder
        ? (deliveryInstructions.trim() || `Entrega: ${v.deliveryDetails?.itemDescription || ''}`)
        : notes,
      isManualBooking: false
    };
  };

  const handleStartApplePayCheckout = async () => {
    const validation = validateBookingBeforePayment();
    if (!validation.ok) return;

    setIsSubmitting(true);
    setRequestError('');
    const draftPayload = buildValidatedRideDraft('apple_pay', {
      cardBrand: 'Apple Pay',
      validation: {
        isDeliveryOrder: validation.isDeliveryOrder,
        deliveryDetails: validation.deliveryDetails || null
      }
    });
    const sessionRes = await StorageService.createStripeCheckoutSession(draftPayload);
    if (!sessionRes.ok || !sessionRes.checkoutUrl) {
      setIsSubmitting(false);
      setRequestError(sessionRes.error || 'Não foi possível iniciar o pagamento via Apple Pay.');
      return;
    }
    window.location.assign(sessionRes.checkoutUrl);
  };

  const submitBookingRequest = async (overrides?: {
    stripePaymentIntentId?: string;
    paymentMethodOverride?: PaymentMethod;
    cardBrandOverride?: string;
  }) => {
    const validation = validateBookingBeforePayment();
    if (!validation.ok) return;

    const effectiveMethod = overrides?.paymentMethodOverride || paymentMethod;
    if (effectiveMethod === 'apple_pay' && !overrides?.stripePaymentIntentId) {
      await handleStartApplePayCheckout();
      return;
    }

    const isCard = effectiveMethod === 'cartao_credito' || effectiveMethod === 'cartao_debito' || effectiveMethod === 'apple_pay';
    const chosenCard = savedCards.find(c => c.id === selectedCardId);
    if ((effectiveMethod === 'cartao_credito' || effectiveMethod === 'cartao_debito') && !overrides?.stripePaymentIntentId && !chosenCard) {
      setIsAddingCardModal(true);
      return;
    }

    setIsSubmitting(true);
    const baseRequestPayload = buildValidatedRideDraft(effectiveMethod, {
      cardId: isCard && !overrides?.stripePaymentIntentId ? chosenCard?.id : undefined,
      cardLast4: isCard && !overrides?.stripePaymentIntentId ? chosenCard?.last4 : undefined,
      cardBrand: overrides?.cardBrandOverride || (effectiveMethod === 'apple_pay' ? 'Apple Pay' : isCard ? chosenCard?.brand : undefined),
      stripePaymentIntentId: overrides?.stripePaymentIntentId,
      validation: {
        isDeliveryOrder: validation.isDeliveryOrder,
        deliveryDetails: validation.deliveryDetails || null
      }
    });

    let res = await StorageService.requestRideOnDemand(baseRequestPayload);

    if (
      !res.ok &&
      res.requiresAction &&
      res.clientSecret &&
      res.paymentIntentId &&
      paymentsConfig.stripePublishableKey
    ) {
      const actionRes = await confirmStripe3dsPaymentIntent(
        paymentsConfig.stripePublishableKey,
        res.clientSecret
      );
      if (!actionRes.ok) {
        setIsSubmitting(false);
        setRequestError(actionRes.error || 'Autenticação 3DS do cartão não concluída.');
        return;
      }
      res = await StorageService.requestRideOnDemand({
        ...baseRequestPayload,
        stripePaymentIntentId: actionRes.paymentIntentId || res.paymentIntentId
      });
    }

    setIsSubmitting(false);

    if (!res.ok || !res.ride) {
      setRequestError(res.error || 'Não foi possível processar sua solicitação.');
      return;
    }

    setActiveRide(res.ride);
    onRideBooked(res.ride);

    if (res.ride.paymentMethod === 'carteira' && currentUser?.id) {
      StorageService.fetchClientWallet(currentUser.id).then((w) => {
        if (w.ok && w.wallet) setWalletBalance(w.wallet.balance);
      }).catch(() => {});
    }

    if (res.ride.paymentMethod !== 'pix') {
      try {
        confetti({ particleCount: 60, spread: 55, origin: { y: 0.6 } });
      } catch {
        // ignore
      }
    }
  };

  const handleRequestRideNow = () => {
    if (paymentMethod === 'carteira') {
      if (!currentUser?.id) {
        setRequestError('Entre na sua conta para pagar utilizando o saldo da sua Carteira.');
        return;
      }
      if (walletBalance + 0.001 < pricing.totalPrice) {
        setRequestError(
          `Saldo insuficiente na carteira (${walletBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}). Deposite a partir de R$ 20,00 para pagar esta corrida.`
        );
        setIsWalletModalOpen(true);
        return;
      }
    }
    submitBookingRequest();
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
    const destinationLabel = activeRide.destination?.address || 'Destino selecionado';

    return (
      <div
        className="animate-fade-in"
        style={{
          width: '100%',
          maxWidth: 480,
          margin: '0 auto',
          minHeight: 'calc(100dvh - 60px - env(safe-area-inset-bottom, 0px))',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box'
        }}
      >
        {/* Cabeçalho full-bleed Kavro Drive */}
        <div style={{
          background: 'linear-gradient(155deg, #0B1117 0%, #15222C 60%, #101A22 100%)',
          padding: 'calc(16px + env(safe-area-inset-top, 0px)) 20px 20px 20px',
          color: '#FFFFFF',
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
          boxShadow: '0 8px 24px rgba(11, 17, 23, 0.14)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginBottom: 16
          }}>
            <img
              src="/logo-horizontal-white.png"
              alt="Kavro Drive"
              style={{ height: 22, width: 'auto', objectFit: 'contain' }}
            />
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              backgroundColor: 'rgba(118, 216, 0, 0.14)',
              border: '1px solid rgba(118, 216, 0, 0.35)',
              color: '#BEF264',
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: '0.68rem',
              fontWeight: 800
            }}>
              <PaymentMethodIcon method="pix" size={14} />
              <span>{paymentsConfig.stripeEnabled ? 'PIX Instantâneo' : 'PIX Gateway'}</span>
              {pixRemainingLabel && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  marginLeft: 2,
                  paddingLeft: 6,
                  borderLeft: '1px solid rgba(255,255,255,0.18)',
                  color: pixRemainingLabel === 'Expirado' ? '#FCA5A5' : '#FFFFFF',
                  fontVariantNumeric: 'tabular-nums'
                }}>
                  <Clock size={11} />
                  {pixRemainingLabel}
                </span>
              )}
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 12
          }}>
            <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
              <div style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                color: '#94A3B8',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Corrida {formatRideCode(activeRide)}
              </div>
              <div style={{
                fontSize: '0.86rem',
                fontWeight: 700,
                color: '#E2E8F0',
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {destinationLabel}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{
                fontSize: '0.66rem',
                fontWeight: 700,
                color: '#94A3B8',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}>
                Total PIX
              </div>
              <div style={{
                fontSize: '1.6rem',
                fontWeight: 900,
                color: '#76D800',
                letterSpacing: '-0.02em',
                lineHeight: 1.05
              }}>
                R$ {activeRide.totalPrice.toFixed(2).replace('.', ',')}
              </div>
            </div>
          </div>
        </div>

        {/* Corpo em Tela Cheia Proporcional */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '18px 20px 18px 20px',
          textAlign: 'center'
        }}>
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12
          }}>
            <div>
              <h2 style={{ fontSize: '1.12rem', fontWeight: 900, color: '#0F172A', margin: '0 0 4px 0', lineHeight: 1.25 }}>
                Pague com PIX para chamar seu motorista
              </h2>
              <p style={{ fontSize: '0.77rem', color: '#64748B', margin: 0, lineHeight: 1.35 }}>
                Liberação automática assim que o banco confirmar.
              </p>
            </div>

            {(copyPaste || qrUrl) && (
              <div style={{
                width: 214,
                height: 214,
                padding: 12,
                backgroundColor: '#FFFFFF',
                borderRadius: 24,
                border: '1.5px solid #BEF264',
                boxShadow: '0 10px 28px rgba(118, 216, 0, 0.14), 0 3px 10px rgba(15, 23, 42, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box'
              }}>
                <PixQrCode payload={copyPaste} fallbackUrl={qrUrl} size={190} />
              </div>
            )}

            {copyPaste && (
              <>
                <div style={{
                  width: '100%',
                  maxWidth: 320,
                  padding: '6px 12px',
                  borderRadius: 999,
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  fontSize: '0.7rem',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  color: '#64748B',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  boxSizing: 'border-box'
                }}>
                  {copyPaste}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(copyPaste);
                    setCopiedPix(true);
                    setTimeout(() => setCopiedPix(false), 2500);
                  }}
                  style={{
                    padding: '10px 26px',
                    borderRadius: 999,
                    backgroundColor: copiedPix ? '#16A34A' : '#121A21',
                    color: '#FFFFFF',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.84rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                    cursor: 'pointer',
                    boxShadow: '0 6px 16px rgba(18, 26, 33, 0.18)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {copiedPix ? <Check size={15} /> : <Copy size={15} />}
                  <span>{copiedPix ? 'Código Copiado!' : 'Copiar Código PIX'}</span>
                </button>
              </>
            )}

            <div style={{
              width: '100%',
              backgroundColor: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: 14,
              padding: '10px 14px',
              fontSize: '0.74rem',
              color: '#166534',
              lineHeight: 1.38,
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              textAlign: 'left',
              boxSizing: 'border-box'
            }}>
              <Lock size={15} color="#15803D" style={{ flexShrink: 0 }} />
              <span>
                <strong>Segurança automática:</strong> não precisa enviar comprovante. A corrida inicia na hora que o pagamento compensar.
              </span>
            </div>

            {/* Botão de Simulação do Webhook apenas em desenvolvimento sem Stripe ativa */}
            {import.meta.env.DEV && !paymentsConfig.stripeEnabled && (
              <button
                type="button"
                onClick={handleSimulatePixWebhook}
                disabled={isSimulatingWebhook}
                style={{
                  padding: '9px 18px',
                  borderRadius: 999,
                  backgroundColor: '#76D800',
                  color: '#121A21',
                  border: 'none',
                  fontWeight: 900,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <Sparkles size={14} />
                <span>
                  {isSimulatingWebhook ? 'Confirmando no Gateway...' : 'Simular Confirmação PIX (Dev)'}
                </span>
              </button>
            )}
          </div>

          <div style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingTop: 12
          }}>
            {canPassengerEditRoute(activeRide) && (
              <button
                type="button"
                onClick={() => setIsEditRouteModalOpen(true)}
                style={{
                  backgroundColor: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: 999,
                  color: '#1D4ED8',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  padding: '8px 14px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  whiteSpace: 'nowrap'
                }}
              >
                <Pencil size={13} />
                <span>Alterar trajeto</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsCancelModalOpen(true)}
              style={{
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: 999,
                color: '#DC2626',
                fontSize: '0.75rem',
                fontWeight: 800,
                cursor: 'pointer',
                padding: '8px 14px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                whiteSpace: 'nowrap'
              }}
            >
              <span>Trocar / Cancelar</span>
            </button>
          </div>
        </div>

        <RideEditRouteModal
          isOpen={isEditRouteModalOpen}
          ride={activeRide}
          config={config}
          onClose={() => setIsEditRouteModalOpen(false)}
          onUpdated={(updated) => {
            setIsEditRouteModalOpen(false);
            setActiveRide(updated);
          }}
        />

        <RideCancelModal
          isOpen={isCancelModalOpen}
          ride={activeRide}
          config={config}
          onClose={() => setIsCancelModalOpen(false)}
          onCancelled={() => {
            setIsCancelModalOpen(false);
            setActiveRide(null);
          }}
        />
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
    const isCompleted = activeRide.status === 'finalizada';
    const isCancelled = activeRide.status === 'cancelada';
    const cleanDriverPhone = getCleanWhatsappNumber(activeRide.driverPhone || '');
    const isDeliveryActiveRide =
      activeRide.serviceType === 'entregas' ||
      Boolean(activeRide.deliveryDetails) ||
      resolveCategoryType(activeRide.category || '') === 'entregas';
    const del = activeRide.deliveryDetails;
    const dropoffText = del?.dropoffMode === 'portaria'
      ? 'Deixar na portaria'
      : del?.dropoffMode === 'recepcao'
        ? 'Recepção / Loja'
        : 'Entregar em mãos';

    return (
      <div className="animate-fade-in" style={{
        height: 'calc(100dvh - 60px)',
        backgroundColor: '#E8EDF3',
        display: 'flex',
        flexDirection: 'column',
        maxWidth: 480,
        margin: '0 auto',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Mapa Ao Vivo Superior ocupando a maior parte da tela igual à Uber */}
        <div style={{
          position: 'relative',
          flex: 1,
          minHeight: isMapExpanded ? '66%' : '42%',
          width: '100%'
        }}>
          <PassengerLiveMap
            origin={activeRide.origin}
            destination={activeRide.destination}
            driverPos={activeRide.driverLocation || null}
            nearbyDrivers={isSearching ? nearbyMapDrivers : []}
            searchingPulse={isSearching}
            height="100%"
          />

          {/* Controles Flutuantes no Mapa (Topo) */}
          <div style={{
            position: 'absolute',
            top: 'calc(12px + env(safe-area-inset-top, 0px))',
            left: 14,
            right: 14,
            zIndex: 400,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            pointerEvents: 'none'
          }}>
            <button
              type="button"
              onClick={onBackToHome}
              aria-label="Voltar ao Início"
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E5E7EB',
                color: '#111111',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
                cursor: 'pointer',
                pointerEvents: 'auto',
                flexShrink: 0
              }}
            >
              <ArrowLeft size={19} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'auto' }}>
              <button
                type="button"
                onClick={() => setIsMapExpanded((v) => !v)}
                aria-label={isMapExpanded ? 'Recolher mapa' : 'Expandir mapa'}
                title={isMapExpanded ? 'Recolher mapa' : 'Expandir mapa'}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  color: '#111111',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                {isMapExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            </div>
          </div>

          {/* Botões Flutuantes de Segurança sobre o canto inferior do Mapa (Estilo Escudo Uber) */}
          {!isCompleted && !isCancelled && (
            <div style={{
              position: 'absolute',
              bottom: 24,
              right: 12,
              zIndex: 400,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
              <button
                type="button"
                onClick={() => setIsSafetyCenterOpen(true)}
                style={{
                  height: 32,
                  padding: '0 10px',
                  borderRadius: 999,
                  backgroundColor: '#FFFFFF',
                  color: '#111111',
                  border: '1px solid #E5E7EB',
                  boxShadow: '0 3px 10px rgba(0,0,0,0.16)',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  cursor: 'pointer'
                }}
              >
                <ShieldCheck size={14} color="#2563EB" />
                <span>Segurança</span>
              </button>
              {isInProgress && (
                <button
                  type="button"
                  onClick={() => setIsSosOpen(true)}
                  style={{
                    height: 32,
                    padding: '0 10px',
                    borderRadius: 999,
                    backgroundColor: '#DC2626',
                    color: '#FFFFFF',
                    border: 'none',
                    boxShadow: '0 3px 10px rgba(220,38,38,0.35)',
                    fontSize: '0.72rem',
                    fontWeight: 900,
                    cursor: 'pointer'
                  }}
                >
                  SOS
                </button>
              )}
            </div>
          )}
        </div>

        {/* Bottom Sheet Enxuta Estilo Uber Passageiro */}
        <div style={{
          flexShrink: 0,
          maxHeight: isMapExpanded ? '28dvh' : isSearching ? '42dvh' : '54dvh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          backgroundColor: '#FFFFFF',
          borderRadius: '20px 20px 0 0',
          marginTop: -16,
          zIndex: 10,
          position: 'relative',
          padding: '8px 16px 12px 16px',
          boxShadow: '0 -8px 28px rgba(0,0,0,0.14)'
        }}>
          <div style={{
            width: 34,
            height: 4,
            borderRadius: 999,
            backgroundColor: '#D1D5DB',
            margin: '0 auto 8px auto'
          }} />

          {/* Status Principal Compacto */}
          <div style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <h2 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 900, color: '#111111', letterSpacing: '-0.02em' }}>
                      {isDeliveryActiveRide
                        ? isCompleted
                          ? 'Entrega finalizada!'
                          : isCancelled
                            ? 'Entrega cancelada'
                            : isSearching
                              ? 'Procurando entregador...'
                              : isQueued
                                ? 'Motorista confirmado na fila'
                                : isAtPickup
                                  ? 'Motorista chegou na coleta!'
                                  : isInProgress
                                    ? 'Entrega em rota até o destino'
                                    : 'Motorista a caminho da coleta'
                        : isCompleted
                          ? 'Você chegou ao seu destino!'
                          : isCancelled
                            ? 'Corrida cancelada'
                            : isSearching
                              ? 'Procurando motorista...'
                              : isQueued
                                ? 'Motorista confirmado na fila'
                                : isAtPickup
                                  ? 'Seu motorista chegou!'
                                  : isInProgress
                                    ? 'Em viagem até o destino'
                                    : 'Motorista a caminho'}
                    </h2>
                    {isSearching && <RefreshCw size={16} color="#276EF1" className="animate-spin" />}
                  </div>

                  {!isSearching && (
                    <p style={{ margin: '2px 0 0 0', fontSize: '0.76rem', color: '#6B7280', fontWeight: 500 }}>
                      {isCompleted
                        ? `${isDeliveryActiveRide ? 'Entrega finalizada' : 'Viagem finalizada'} • Total R$ ${(activeRide.totalPrice || 0).toFixed(2).replace('.', ',')}`
                        : isCancelled
                          ? 'Você pode solicitar uma nova solicitação quando quiser.'
                          : isQueued
                            ? `${activeRide.driverName || 'Seu motorista'} está concluindo um atendimento próximo.`
                            : isInProgress
                              ? 'Acompanhe o trajeto em tempo real pelo mapa.'
                              : isDeliveryActiveRide
                                ? 'Confira o veículo e o PIN para liberar a coleta do pacote.'
                                : 'Confira o veículo e o PIN antes de embarcar.'}
                    </p>
                  )}

                  {isDeliveryActiveRide && del && !isMapExpanded && (
                    <div style={{
                      marginTop: 7,
                      padding: '8px 10px',
                      borderRadius: 11,
                      backgroundColor: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <Package size={16} color="#15803D" style={{ flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '0.77rem', fontWeight: 800, color: '#14532D', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {del.itemDescription} ({del.packageSize || 'pequeno'})
                          </div>
                          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#166534', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {del.role === 'sender' ? 'Para:' : 'Retirar com:'} {del.recipientName} • {dropoffText}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {!isCompleted && !isCancelled && !isMapExpanded && (
                    <RideSearchingStageCard
                      status={activeRide.status}
                      onlineDriversCount={onlineDriversCount}
                      driverName={activeRide.driverName}
                      isQueued={isQueued}
                      compact
                    />
                  )}
                </div>

                {/* Card do Motorista compacto estilo Uber Passageiro */}
                {!isMapExpanded && activeRide.driverName && (
                  <div style={{
                    backgroundColor: '#F8FAFC',
                    borderRadius: 14,
                    padding: '10px 12px',
                    border: '1px solid #E5E7EB',
                    marginBottom: 8
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <div style={{
                          width: 42,
                          height: 42,
                          borderRadius: '50%',
                          backgroundColor: '#111111',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 900,
                          fontSize: '1rem',
                          overflow: 'hidden',
                          flexShrink: 0,
                          border: '1.5px solid #FFFFFF',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
                        }}>
                          {activeRide.driverPhoto ? (
                            <img src={activeRide.driverPhoto} alt={activeRide.driverName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            activeRide.driverName.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#111111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {activeRide.driverName} • ★ {Number(activeRide.driverRating || 4.98).toFixed(2)}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#4B5563', fontWeight: 600, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {activeRide.driverVehicle || 'Veículo Parceiro'} {activeRide.driverCarColor ? `(${activeRide.driverCarColor})` : ''}
                          </div>
                        </div>
                      </div>
                      {activeRide.driverPlate && (
                        <MercosulPlateBadge plate={activeRide.driverPlate} size="sm" />
                      )}
                    </div>

                    {activeRide.boardingPin && (activeRide.status === 'confirmada' || activeRide.status === 'a_caminho' || activeRide.status === 'no_local') && (
                      <div style={{
                        marginTop: 8,
                        padding: '6px 10px',
                        borderRadius: 10,
                        backgroundColor: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10
                      }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1E40AF' }}>
                          {isDeliveryActiveRide ? 'PIN de coleta / entrega' : 'PIN de embarque'}
                        </span>
                        <span style={{
                          fontSize: '1rem',
                          fontWeight: 900,
                          letterSpacing: '0.18em',
                          color: '#1E3A8A',
                          backgroundColor: '#FFFFFF',
                          padding: '2px 9px',
                          borderRadius: 8,
                          border: '1px solid #93C5FD',
                          fontVariantNumeric: 'tabular-nums'
                        }}>
                          {activeRide.boardingPin}
                        </span>
                      </div>
                    )}

              {/* Ações rápidas com o motorista (Chat ao vivo no app + Ligar) */}
              {activeRide.driverId && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setUnreadChatCount(0);
                      setIsChatOpen(true);
                    }}
                    style={{
                      flex: 1,
                      height: 36,
                      borderRadius: 999,
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #D1D5DB',
                      color: '#111111',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0 12px',
                      cursor: 'pointer'
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                      <MessageSquare size={14} color="#2563EB" />
                      <span>Enviar mensagem...</span>
                    </span>
                    {unreadChatCount > 0 && (
                      <span style={{
                        minWidth: 18,
                        height: 18,
                        padding: '0 5px',
                        borderRadius: 999,
                        backgroundColor: '#2563EB',
                        color: '#FFFFFF',
                        fontSize: '0.68rem',
                        fontWeight: 900,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {unreadChatCount}
                      </span>
                    )}
                  </button>

                  {activeRide.driverPhone && (
                    <a
                      href={`tel:${cleanDriverPhone}`}
                      aria-label="Ligar para motorista"
                      style={{
                        width: 36,
                        height: 36,
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
                      <Phone size={15} />
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Resumo Compacto Origem/Destino & Pagamento em linha enxuta (tocável para alterar antes do embarque) */}
          {!isMapExpanded && (() => {
            const routeEditable = canPassengerEditRoute(activeRide);
            return (
              <div
                role={routeEditable ? 'button' : undefined}
                tabIndex={routeEditable ? 0 : undefined}
                onClick={routeEditable ? () => setIsEditRouteModalOpen(true) : undefined}
                onKeyDown={routeEditable ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setIsEditRouteModalOpen(true);
                  }
                } : undefined}
                style={{
                  padding: '8px 0',
                  borderTop: '1px solid #F1F5F9',
                  borderBottom: '1px solid #F1F5F9',
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  cursor: routeEditable ? 'pointer' : 'default'
                }}
              >
                <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', border: '2px solid #111111', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.75rem', color: '#4B5563', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {activeRide.origin.address}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: '#111111', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.78rem', color: '#111111', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {activeRide.destination.address}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                  <div style={{ fontSize: '0.96rem', fontWeight: 900, color: '#111111' }}>
                    R$ {activeRide.totalPrice.toFixed(2).replace('.', ',')}
                  </div>
                  {routeEditable ? (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      fontSize: '0.67rem',
                      fontWeight: 800,
                      color: '#276EF1',
                      backgroundColor: '#EFF6FF',
                      padding: '2px 7px',
                      borderRadius: 999
                    }}>
                      <Pencil size={10} />
                      <span>Alterar rota</span>
                    </span>
                  ) : (
                    <div style={{ fontSize: '0.67rem', color: '#6B7280', fontWeight: 700 }}>
                      {activeRide.paymentMethod === 'cartao_credito' || activeRide.paymentMethod === 'cartao_debito' || activeRide.paymentMethod === 'apple_pay'
                        ? `${getPaymentMethodLabel(activeRide.paymentMethod, true)} •••• ${activeRide.cardLast4 || 'App'}`
                        : getPaymentMethodLabel(activeRide.paymentMethod, true)}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {isCompleted ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!activeRide.passengerRating && (
                <button
                  type="button"
                  onClick={() => setIsRatingSheetOpen(true)}
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
                  <span>Avaliar Motorista &amp; Gorjeta ★</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveRide(null)}
                style={{
                  width: '100%',
                  height: 44,
                  borderRadius: 12,
                  backgroundColor: '#F3F4F6',
                  color: '#111111',
                  border: '1px solid #E5E7EB',
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                Pedir outra corrida
              </button>
            </div>
          ) : isCancelled ? (
            <button
              type="button"
              onClick={() => setActiveRide(null)}
              style={{
                width: '100%',
                height: 50,
                borderRadius: 12,
                backgroundColor: '#111111',
                color: '#FFFFFF',
                border: 'none',
                fontSize: '0.94rem',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              Voltar e pedir nova corrida
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: canPassengerCancelRide(activeRide) ? '1fr 1fr' : '1fr', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    const sharePath = activeRide.trackingUrl
                      ? activeRide.trackingUrl.replace(/^\/track\//, '/viagem/')
                      : `/viagem/${encodeURIComponent(activeRide.id)}`;
                    const shareUrl = `${window.location.origin}${sharePath}`;
                    const msg = `Acompanhe minha viagem Kavro Drive (${activeRide.origin.address} -> ${activeRide.destination.address}): ${shareUrl}`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
                  }}
                  style={{
                    height: 40,
                    borderRadius: 11,
                    backgroundColor: '#F3F4F6',
                    color: '#111111',
                    border: 'none',
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    cursor: 'pointer'
                  }}
                >
                  <Share2 size={14} />
                  <span>Compartilhar</span>
                </button>

                {canPassengerCancelRide(activeRide) && (
                  <button
                    type="button"
                    onClick={() => setIsCancelModalOpen(true)}
                    style={{
                      height: 40,
                      borderRadius: 11,
                      backgroundColor: '#FEF2F2',
                      color: '#DC2626',
                      border: '1px solid #FECACA',
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    {isSearching ? 'Cancelar solicitação' : 'Cancelar viagem'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <RideRatingBottomSheet
          isOpen={isRatingSheetOpen}
          ride={activeRide}
          raterRole="cliente"
          onClose={() => setIsRatingSheetOpen(false)}
          onSubmitted={() => {
            setIsRatingSheetOpen(false);
            setActiveRide(null);
          }}
        />

        <RideChatModal
          isOpen={isChatOpen}
          ride={activeRide}
          viewerRole="client"
          onClose={() => setIsChatOpen(false)}
        />

        <TrustedContactsModal
          isOpen={isTrustedContactsOpen}
          onClose={() => setIsTrustedContactsOpen(false)}
          currentUser={currentUser || null}
          activeRide={activeRide}
          onUpdated={(list) => setTrustedCount(list.length)}
        />

        <SafetyCenterModal
          isOpen={isSafetyCenterOpen}
          onClose={() => setIsSafetyCenterOpen(false)}
          config={config}
          currentUser={currentUser || null}
          activeRide={activeRide}
          onUserChange={(updatedClient) => {
            setTrustedCount(updatedClient.trustedContacts?.length || 0);
            StorageService.setCurrentUser(updatedClient);
          }}
          onOpenSos={() => setIsSosOpen(true)}
        />

        <RideEditRouteModal
          isOpen={isEditRouteModalOpen}
          ride={activeRide}
          config={config}
          onClose={() => setIsEditRouteModalOpen(false)}
          onUpdated={(updated) => {
            setIsEditRouteModalOpen(false);
            setActiveRide(updated);
          }}
        />

        <RideCheckAlertModal
          ride={activeRide}
          viewerRole="passageiro"
          onOpenSos={() => setIsSosOpen(true)}
          onResponded={() => {
            StorageService.syncFromDatabase();
          }}
        />

        <SosEmergencyModal
          isOpen={isSosOpen}
          onClose={() => setIsSosOpen(false)}
          currentLocationText={`${activeRide.origin.address} -> ${activeRide.destination.address}`}
          rideId={activeRide.id}
          driverPhone={activeRide.driverPhone || config?.driverPhone || config?.companyWhatsapp}
        />

        <RideCancelModal
          isOpen={isCancelModalOpen}
          ride={activeRide}
          config={config}
          onClose={() => setIsCancelModalOpen(false)}
          onCancelled={(result) => {
            setIsCancelModalOpen(false);
            setActiveRide(result.ride || { ...activeRide, status: 'cancelada', cancelledBy: 'passenger' });
          }}
        />
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

      {/* Tela Cheia de Cadastro Seguro de Cartão (100% Personalizado Kavro Drive + Stripe) */}
      {isAddingCardModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: '#FFFFFF',
          zIndex: 9999,
          display: 'flex',
          justifyContent: 'center'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            width: '100%',
            maxWidth: 480,
            height: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto'
          }}>
            {/* Cabeçalho full-bleed dark com logo KAVRO DRIVE */}
            <div style={{
              background: 'linear-gradient(155deg, #0B1117 0%, #15222C 100%)',
              padding: 'calc(16px + env(safe-area-inset-top, 0px)) 20px 18px 20px',
              borderBottomLeftRadius: 24,
              borderBottomRightRadius: 24,
              boxShadow: '0 8px 24px rgba(11, 17, 23, 0.14)'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                marginBottom: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <img
                    src="/logo-horizontal-white.png"
                    alt="KAVRO DRIVE"
                    style={{ height: 22, objectFit: 'contain' }}
                  />
                  <span style={{
                    fontSize: '0.66rem',
                    fontWeight: 800,
                    color: '#BEF264',
                    backgroundColor: 'rgba(118, 216, 0, 0.14)',
                    border: '1px solid rgba(118, 216, 0, 0.35)',
                    padding: '3px 9px',
                    borderRadius: 999
                  }}>
                    Cartão Seguro
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingCardModal(false)}
                  aria-label="Fechar"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255, 255, 255, 0.14)',
                    border: 'none',
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{ fontSize: '0.98rem', fontWeight: 900, color: '#FFFFFF' }}>
                Adicionar cartão Kavro Pay
              </div>
              <div style={{ fontSize: '0.73rem', color: '#94A3B8', marginTop: 2 }}>
                Pagamento criptografado — pré-autorizado somente na corrida
              </div>
            </div>

            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              padding: '20px 20px calc(24px + env(safe-area-inset-bottom, 0px)) 20px'
            }}>
              {paymentsConfig.stripePublishableKey ? (
                <StripeCardForm
                  publishableKey={paymentsConfig.stripePublishableKey}
                  clientId={currentUser?.id}
                  clientPhone={currentUser?.phone}
                  clientEmail={currentUser?.email}
                  defaultHolderName={currentUser?.name || cardHolder}
                  cardType={cardType}
                  onChangeCardType={setCardType}
                  onCardSaved={(savedCard) => {
                    const nextCards = [savedCard, ...savedCards];
                    setSavedCards(nextCards);
                    setSelectedCardId(savedCard.id);
                    setPaymentMethod(savedCard.cardType);
                    setIsAddingCardModal(false);
                  }}
                />
              ) : (
                <form onSubmit={handleSaveNewCard} style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setCardType('cartao_credito')}
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
                      onClick={() => setCardType('cartao_debito')}
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

                  <input
                    type="text"
                    placeholder="Número do Cartão (16 dígitos)"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    required
                    style={{ padding: '11px 12px', borderRadius: 11, border: '1.5px solid #CBD5E1', fontSize: '0.86rem', fontWeight: 700 }}
                  />
                  <input
                    type="text"
                    placeholder="Nome impresso no cartão"
                    value={cardHolder}
                    onChange={(e) => setCardHolder(e.target.value)}
                    required
                    style={{ padding: '11px 12px', borderRadius: 11, border: '1.5px solid #CBD5E1', fontSize: '0.85rem', fontWeight: 600 }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <input
                      type="text"
                      placeholder="Mês (MM)"
                      maxLength={2}
                      value={cardExpMonth}
                      onChange={(e) => setCardExpMonth(e.target.value)}
                      required
                      style={{ padding: '10px', borderRadius: 11, border: '1.5px solid #CBD5E1', fontSize: '0.84rem', textAlign: 'center' }}
                    />
                    <input
                      type="text"
                      placeholder="Ano (AAAA)"
                      maxLength={4}
                      value={cardExpYear}
                      onChange={(e) => setCardExpYear(e.target.value)}
                      required
                      style={{ padding: '10px', borderRadius: 11, border: '1.5px solid #CBD5E1', fontSize: '0.84rem', textAlign: 'center' }}
                    />
                    <input
                      type="password"
                      placeholder="CVV"
                      maxLength={4}
                      value={cardCvv}
                      onChange={(e) => setCardCvv(e.target.value)}
                      required
                      style={{ padding: '10px', borderRadius: 11, border: '1.5px solid #CBD5E1', fontSize: '0.84rem', textAlign: 'center' }}
                    />
                  </div>

                  {cardError && (
                    <div style={{ color: '#DC2626', fontSize: '0.75rem', fontWeight: 700, textAlign: 'center' }}>
                      {cardError}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'auto', paddingTop: 10 }}>
                    <button
                      type="submit"
                      disabled={isSavingCard}
                      style={{
                        padding: '11px 28px',
                        borderRadius: 999,
                        border: 'none',
                        backgroundColor: '#0F172A',
                        color: '#FFFFFF',
                        fontSize: '0.84rem',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      {isSavingCard ? 'Tokenizando...' : 'Salvar e usar cartão'}
                    </button>
                  </div>
                </form>
              )}
            </div>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                onClick={() => setIsTrustedContactsOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: '#DCFCE7',
                  color: '#15803D',
                  border: '1px solid #BBF7D0',
                  borderRadius: 999,
                  padding: '5px 10px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                <ShieldCheck size={13} />
                <span>Contatos ({trustedCount})</span>
              </button>
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
                {destination
                  ? destination.address
                  : serviceMode === 'entregas'
                    ? 'Endereço de entrega (destino)?'
                    : 'Para onde você vai?'}
              </span>
            </button>
          </div>
        </div>

        {/* 2 Modalidades do Sistema: Viagem Padrão vs Entregas */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 6,
          backgroundColor: '#F3F4F6',
          padding: 4,
          borderRadius: 14,
          marginBottom: 12
        }}>
          <button
            type="button"
            onClick={() => handleSwitchServiceMode('padrao')}
            style={{
              height: 40,
              borderRadius: 10,
              border: 'none',
              backgroundColor: serviceMode === 'padrao' ? '#111111' : 'transparent',
              color: serviceMode === 'padrao' ? '#FFFFFF' : '#4B5563',
              fontSize: '0.82rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: serviceMode === 'padrao' ? '0 2px 8px rgba(0,0,0,0.14)' : 'none'
            }}
          >
            <Car size={15} />
            <span>Padrão</span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchServiceMode('entregas')}
            style={{
              height: 40,
              borderRadius: 10,
              border: 'none',
              backgroundColor: serviceMode === 'entregas' ? '#15803D' : 'transparent',
              color: serviceMode === 'entregas' ? '#FFFFFF' : '#4B5563',
              fontSize: '0.82rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: serviceMode === 'entregas' ? '0 2px 8px rgba(21,128,61,0.22)' : 'none'
            }}
          >
            <Package size={15} />
            <span>Entregas</span>
          </button>
        </div>

        {/* Categorias estilo Uber Passageiro */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {visibleModeCategories.map((cat) => {
            const catPrice = calculateRidePrice(distanceKm, durationMin, nowTimeStr, config, cat.id);
            const isSelected = selectedCategory === cat.id;
            const stats = categoryStats[cat.id] || { availableDriversCount: 0, etaMin: 4 };
            const hasNoDriverInCat = onlineDrivers.length > 0 && stats.availableDriversCount === 0;
            const isCatDelivery = resolveCategoryType(cat) === 'entregas';

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat.id);
                  setServiceMode(isCatDelivery ? 'entregas' : 'padrao');
                  setRequestError('');
                }}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 14,
                  border: isSelected
                    ? `2px solid ${isCatDelivery ? '#15803D' : '#111111'}`
                    : '1px solid #E5E7EB',
                  backgroundColor: isSelected ? (isCatDelivery ? '#F0FDF4' : '#F9FAFB') : '#FFFFFF',
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
                    backgroundColor: isSelected
                      ? (isCatDelivery ? '#15803D' : '#111111')
                      : (isCatDelivery ? '#DCFCE7' : '#F3F4F6'),
                    color: isSelected ? '#FFFFFF' : (isCatDelivery ? '#15803D' : '#111111'),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {isCatDelivery ? <Package size={20} /> : <Car size={20} />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: '0.96rem', fontWeight: 800, color: '#111111' }}>
                        {cat.name}
                      </span>
                      {isCatDelivery ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          fontSize: '0.68rem',
                          color: '#166534',
                          backgroundColor: '#DCFCE7',
                          padding: '1px 7px',
                          borderRadius: 999,
                          fontWeight: 800
                        }}>
                          Encomenda
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 2,
                          fontSize: '0.72rem',
                          color: '#4B5563',
                          fontWeight: 700
                        }}>
                          <Users size={11} />{cat.maxPassengers || 4}
                        </span>
                      )}
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
                        setServiceMode(resolveCategoryType(alt));
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
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            marginBottom: 10
          }}>
            {allowPix && (
              <button
                type="button"
                onClick={() => setPaymentMethod('pix')}
                style={{
                  flex: '1 1 auto',
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: paymentMethod === 'pix' ? '1.5px solid #0F172A' : '1px solid #E5E7EB',
                  backgroundColor: paymentMethod === 'pix' ? '#0F172A' : '#FFFFFF',
                  color: paymentMethod === 'pix' ? '#FFFFFF' : '#111111',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer'
                }}
              >
                <PaymentMethodIcon method="pix" size={16} />
                <span style={{ fontSize: '0.76rem', fontWeight: 800 }}>PIX</span>
              </button>
            )}

            {allowAnyCard && (
              <button
                type="button"
                onClick={() => setPaymentMethod(allowCreditCard ? 'cartao_credito' : 'cartao_debito')}
                style={{
                  flex: '1 1 auto',
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: (paymentMethod === 'cartao_credito' || paymentMethod === 'cartao_debito') ? '1.5px solid #0F172A' : '1px solid #E5E7EB',
                  backgroundColor: (paymentMethod === 'cartao_credito' || paymentMethod === 'cartao_debito') ? '#0F172A' : '#FFFFFF',
                  color: (paymentMethod === 'cartao_credito' || paymentMethod === 'cartao_debito') ? '#FFFFFF' : '#111111',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer'
                }}
              >
                <PaymentMethodIcon method="cartao_credito" size={18} />
                <span style={{ fontSize: '0.76rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                  Cartão
                </span>
              </button>
            )}

            {allowApplePay && (
              <button
                type="button"
                onClick={() => setPaymentMethod('apple_pay')}
                style={{
                  flex: '1 1 auto',
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: paymentMethod === 'apple_pay' ? '1.5px solid #76D800' : '1px solid #1E293B',
                  backgroundColor: paymentMethod === 'apple_pay' ? '#000000' : '#FFFFFF',
                  color: paymentMethod === 'apple_pay' ? '#FFFFFF' : '#0F172A',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer'
                }}
              >
                <PaymentMethodIcon method="apple_pay" size={16} />
                <span style={{ fontSize: '0.76rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                  Apple Pay
                </span>
              </button>
            )}

            {allowCash && (
              <button
                type="button"
                onClick={() => setPaymentMethod('dinheiro')}
                style={{
                  flex: '1 1 auto',
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: paymentMethod === 'dinheiro' ? '1.5px solid #0F172A' : '1px solid #E5E7EB',
                  backgroundColor: paymentMethod === 'dinheiro' ? '#0F172A' : '#FFFFFF',
                  color: paymentMethod === 'dinheiro' ? '#FFFFFF' : '#111111',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer'
                }}
              >
                <PaymentMethodIcon method="dinheiro" size={17} />
                <span style={{ fontSize: '0.76rem', fontWeight: 800 }}>Dinheiro</span>
              </button>
            )}

            {allowWallet && (
              <button
                type="button"
                onClick={() => setPaymentMethod('carteira')}
                style={{
                  flex: '1 1 auto',
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: paymentMethod === 'carteira' ? '1.5px solid #76D800' : '1px solid #E5E7EB',
                  backgroundColor: paymentMethod === 'carteira' ? '#0F172A' : '#FFFFFF',
                  color: paymentMethod === 'carteira' ? '#FFFFFF' : '#111111',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer'
                }}
              >
                <PaymentMethodIcon method="carteira" size={16} />
                <span style={{ fontSize: '0.76rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                  Carteira{walletBalance > 0 ? ` • R$ ${walletBalance.toFixed(0)}` : ''}
                </span>
              </button>
            )}
          </div>

          {/* Painel Carteira Kavro Drive */}
          {paymentMethod === 'carteira' && allowWallet && (
            <div style={{
              backgroundColor: '#F8FAFC',
              borderRadius: 14,
              padding: 12,
              border: '1px solid #E2E8F0',
              marginBottom: 8
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                marginBottom: 8
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <PaymentMethodIcon method="carteira" size={18} />
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A' }}>
                      Saldo na Carteira Kavro
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>
                      Disponível: <strong style={{ color: '#0F172A' }}>{walletBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsWalletModalOpen(true)}
                  style={{
                    padding: '6px 11px',
                    borderRadius: 999,
                    border: 'none',
                    backgroundColor: '#0F172A',
                    color: '#76D800',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <Plus size={12} />
                  <span>Depositar</span>
                </button>
              </div>

              {!currentUser?.id ? (
                <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#B45309' }}>
                  Entre na sua conta para pagar corridas com o saldo da carteira.
                </div>
              ) : walletBalance + 0.001 >= pricing.totalPrice ? (
                <div style={{
                  padding: '8px 10px',
                  borderRadius: 10,
                  backgroundColor: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  color: '#15803D',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <span>Pagamento instantâneo na confirmação</span>
                  <span>Restará {Math.max(0, walletBalance - pricing.totalPrice).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
              ) : (
                <div style={{
                  padding: '9px 10px',
                  borderRadius: 10,
                  backgroundColor: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  color: '#92400E',
                  fontSize: '0.73rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  flexWrap: 'wrap'
                }}>
                  <span>
                    Saldo insuficiente (faltam {(pricing.totalPrice - walletBalance).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsWalletModalOpen(true)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 8,
                      border: 'none',
                      backgroundColor: '#76D800',
                      color: '#0B1117',
                      fontSize: '0.72rem',
                      fontWeight: 900,
                      cursor: 'pointer'
                    }}
                  >
                    + Adicionar saldo (mín. R$ 20)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Painel Dedicado: Apple Pay Stripe */}
          {paymentMethod === 'apple_pay' && allowApplePay && (
            <div style={{
              backgroundColor: '#F8FAFC',
              borderRadius: 14,
              padding: 12,
              border: '1px solid #E2E8F0',
              marginBottom: 8
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                marginBottom: 6
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <PaymentMethodIcon method="apple_pay" size={18} />
                  <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#0F172A' }}>
                    Kavro Pay • Apple Pay
                  </span>
                </div>
                <span style={{
                  fontSize: '0.64rem',
                  fontWeight: 800,
                  color: '#15803D',
                  backgroundColor: '#DCFCE7',
                  padding: '2px 8px',
                  borderRadius: 999
                }}>
                  Ativo
                </span>
              </div>

              <StripeWalletCheckout
                publishableKey={paymentsConfig.stripePublishableKey}
                amountBrl={pricing.totalPrice}
                category={selectedCategory}
                distanceKm={distanceKm}
                durationMin={durationMin}
                time={nowTimeStr}
                origin={origin}
                destination={destination}
                clientId={currentUser?.id}
                clientName={currentUser?.name}
                clientPhone={currentUser?.phone}
                clientEmail={currentUser?.email}
                onBeforeConfirm={validateBookingBeforePayment}
                onHostedCheckoutClick={handleStartApplePayCheckout}
                onWalletAuthorized={async ({ paymentIntentId, brand }) => {
                  await submitBookingRequest({
                    stripePaymentIntentId: paymentIntentId,
                    paymentMethodOverride: 'apple_pay',
                    cardBrandOverride: brand || 'Apple Pay'
                  });
                }}
              />
            </div>
          )}

          {/* Cartões tokenizados e Apple Pay / Carteiras Stripe */}
          {(paymentMethod === 'cartao_credito' || paymentMethod === 'cartao_debito') && (
            <div style={{
              backgroundColor: '#F8FAFC',
              borderRadius: 14,
              padding: 10,
              border: '1px solid #E2E8F0',
              marginBottom: 8
            }}>
              {/* Mini cabeçalho personalizado Kavro Pay */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                marginBottom: 8,
                paddingBottom: 6,
                borderBottom: '1px solid #E2E8F0'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <img src="/logo-icon.png" alt="Kavro" style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'contain' }} />
                  <span style={{ fontSize: '0.73rem', fontWeight: 800, color: '#0F172A' }}>
                    Kavro Pay • Cartão Salvo
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddingCardModal(true)}
                  style={{
                    padding: '5px 11px',
                    borderRadius: 999,
                    border: '1px solid #0F172A',
                    backgroundColor: '#0F172A',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: '0.71rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer'
                  }}
                >
                  <Plus size={12} />
                  <span>Novo cartão</span>
                </button>
              </div>

              {savedCards.length > 0 ? (
                savedCards.map(c => (
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
                      border: selectedCardId === c.id ? '1.5px solid #2563EB' : '1px solid #E2E8F0',
                      marginBottom: 6,
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        padding: '3px 7px',
                        borderRadius: 6,
                        backgroundColor: '#0F172A',
                        color: '#FFFFFF',
                        fontSize: '0.62rem',
                        fontWeight: 800
                      }}>
                        {String(c.brand || 'CARD').toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A' }}>
                          •••• {c.last4}
                        </div>
                        <div style={{ fontSize: '0.67rem', color: '#64748B' }}>
                          {c.cardType === 'cartao_debito' ? 'Débito' : 'Crédito'} • Val {c.expMonth}/{c.expYear}
                        </div>
                      </div>
                    </div>
                    {selectedCardId === c.id && <Check size={15} color="#2563EB" />}
                  </div>
                ))
              ) : (
                <div style={{ fontSize: '0.73rem', color: '#64748B', textAlign: 'center', padding: '4px 0 6px 0' }}>
                  Nenhum cartão salvo — toque em <strong>Novo cartão</strong> ou pague com <strong>Apple Pay</strong>.
                </div>
              )}

              {allowApplePay && (
                <StripeWalletCheckout
                  publishableKey={paymentsConfig.stripePublishableKey}
                  amountBrl={pricing.totalPrice}
                  category={selectedCategory}
                  distanceKm={distanceKm}
                  durationMin={durationMin}
                  time={nowTimeStr}
                  origin={origin}
                  destination={destination}
                  clientId={currentUser?.id}
                  clientName={currentUser?.name}
                  clientPhone={currentUser?.phone}
                  clientEmail={currentUser?.email}
                  onBeforeConfirm={validateBookingBeforePayment}
                  onHostedCheckoutClick={handleStartApplePayCheckout}
                  onWalletAuthorized={async ({ paymentIntentId, brand }) => {
                    await submitBookingRequest({
                      stripePaymentIntentId: paymentIntentId,
                      paymentMethodOverride: 'apple_pay',
                      cardBrandOverride: brand
                    });
                  }}
                />
              )}
            </div>
          )}

          {serviceMode === 'entregas' ? (
            /* Formulário Completo de Entrega (Destinatário, Produto/Pacote e Instruções) */
            <div style={{
              backgroundColor: '#F0FDF4',
              borderRadius: 14,
              padding: 12,
              border: '1px solid #BBF7D0',
              marginTop: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Package size={16} color="#15803D" />
                  <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#14532D' }}>
                    Detalhes da Entrega
                  </span>
                </div>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#15803D' }}>
                  Obrigatório
                </span>
              </div>

              {/* Enviar vs Receber */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setDeliveryRole('sender')}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: deliveryRole === 'sender' ? '2px solid #15803D' : '1px solid #D1FAE5',
                    backgroundColor: deliveryRole === 'sender' ? '#15803D' : '#FFFFFF',
                    color: deliveryRole === 'sender' ? '#FFFFFF' : '#166534',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  Estou enviando
                </button>
                <button
                  type="button"
                  onClick={() => setDeliveryRole('receiver')}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: deliveryRole === 'receiver' ? '2px solid #15803D' : '1px solid #D1FAE5',
                    backgroundColor: deliveryRole === 'receiver' ? '#15803D' : '#FFFFFF',
                    color: deliveryRole === 'receiver' ? '#FFFFFF' : '#166534',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  Vou receber
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input
                  type="text"
                  placeholder={deliveryRole === 'sender' ? 'Nome de quem recebe *' : 'Nome de quem envia *'}
                  value={deliveryRecipientName}
                  onChange={(e) => setDeliveryRecipientName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 10px',
                    borderRadius: 10,
                    border: '1px solid #A7F3D0',
                    backgroundColor: '#FFFFFF',
                    fontSize: '0.79rem',
                    fontWeight: 600,
                    color: '#0F172A',
                    boxSizing: 'border-box'
                  }}
                />
                <input
                  type="tel"
                  placeholder="WhatsApp c/ DDD *"
                  value={deliveryRecipientPhone}
                  onChange={(e) => setDeliveryRecipientPhone(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 10px',
                    borderRadius: 10,
                    border: '1px solid #A7F3D0',
                    backgroundColor: '#FFFFFF',
                    fontSize: '0.79rem',
                    fontWeight: 600,
                    color: '#0F172A',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <input
                type="text"
                placeholder="O que está sendo enviado? (ex: Caixa de produtos, chave, compra...) *"
                value={deliveryItemDesc}
                onChange={(e) => setDeliveryItemDesc(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 11px',
                  borderRadius: 10,
                  border: '1px solid #A7F3D0',
                  backgroundColor: '#FFFFFF',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#0F172A',
                  boxSizing: 'border-box'
                }}
              />

              {/* Porte + Modo de Entrega */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#166534' }}>
                  Porte do pacote
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {([
                    { id: 'pequeno', label: 'Pequeno' },
                    { id: 'medio', label: 'Médio (Caixa)' },
                    { id: 'grande', label: 'Grande' }
                  ] as const).map((sz) => (
                    <button
                      key={sz.id}
                      type="button"
                      onClick={() => setDeliveryPackageSize(sz.id)}
                      style={{
                        padding: '6px 6px',
                        borderRadius: 8,
                        border: deliveryPackageSize === sz.id ? '1.5px solid #15803D' : '1px solid #D1FAE5',
                        backgroundColor: deliveryPackageSize === sz.id ? '#DCFCE7' : '#FFFFFF',
                        color: '#14532D',
                        fontSize: '0.71rem',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      {sz.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#166534' }}>
                  Como entregar no endereço
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {([
                    { id: 'porta_mao', label: 'Em mãos' },
                    { id: 'portaria', label: 'Na portaria' },
                    { id: 'recepcao', label: 'Recepção/Loja' }
                  ] as const).map((dm) => (
                    <button
                      key={dm.id}
                      type="button"
                      onClick={() => setDeliveryDropoffMode(dm.id)}
                      style={{
                        padding: '6px 6px',
                        borderRadius: 8,
                        border: deliveryDropoffMode === dm.id ? '1.5px solid #15803D' : '1px solid #D1FAE5',
                        backgroundColor: deliveryDropoffMode === dm.id ? '#DCFCE7' : '#FFFFFF',
                        color: '#14532D',
                        fontSize: '0.71rem',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      {dm.label}
                    </button>
                  ))}
                </div>
              </div>

              <input
                type="text"
                placeholder="Instruções de retirada ou entrega (bloco, apto, contato na loja...)"
                value={deliveryInstructions}
                onChange={(e) => setDeliveryInstructions(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 11px',
                  borderRadius: 10,
                  border: '1px solid #A7F3D0',
                  backgroundColor: '#FFFFFF',
                  fontSize: '0.78rem',
                  color: '#0F172A',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          ) : (
            <>
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
            </>
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

      {/* CTA Compacto e Elegante Fixo acima da barra inferior */}
      <div style={{
        position: 'fixed',
        bottom: 58,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 480,
        backgroundColor: 'rgba(255, 255, 255, 0.96)',
        backdropFilter: 'blur(8px)',
        borderTop: '1px solid #E5E7EB',
        padding: '8px 16px 10px 16px',
        zIndex: 45,
        boxShadow: '0 -6px 18px rgba(15, 23, 42, 0.06)',
        boxSizing: 'border-box',
        display: 'flex',
        justifyContent: 'center'
      }}>
        <button
          type="button"
          onClick={handleRequestRideNow}
          disabled={isSubmitting}
          style={{
            width: '100%',
            maxWidth: 360,
            height: 44,
            borderRadius: 999,
            backgroundColor:
              paymentMethod === 'apple_pay'
                ? '#000000'
                : serviceMode === 'entregas'
                  ? '#15803D'
                  : '#0F172A',
            color: '#FFFFFF',
            border: paymentMethod === 'apple_pay' ? '1.5px solid #76D800' : 'none',
            fontSize: '0.88rem',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 8px 0 18px',
            cursor: 'pointer',
            letterSpacing: '-0.01em',
            boxShadow: '0 6px 16px rgba(15, 23, 42, 0.16)'
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            {isSubmitting ? (
              <RefreshCw size={15} className="animate-spin" />
            ) : (
              <PaymentMethodIcon method={paymentMethod} size={16} />
            )}
            <span>
              {isSubmitting
                ? 'Conectando motorista...'
                : paymentMethod === 'apple_pay'
                  ? 'Pagar com Apple Pay'
                  : serviceMode === 'entregas'
                    ? `Solicitar ${selectedCatObj.name || 'Entregas'}`
                    : `Confirmar ${selectedCatObj.name || 'Padrão'}`}
            </span>
          </span>
          <span style={{
            backgroundColor: 'rgba(255, 255, 255, 0.16)',
            padding: '5px 12px',
            borderRadius: 999,
            fontSize: '0.86rem',
            fontWeight: 900
          }}>
            R$ {pricing.totalPrice.toFixed(2).replace('.', ',')}
          </span>
        </button>
      </div>

      <TrustedContactsModal
        isOpen={isTrustedContactsOpen}
        onClose={() => setIsTrustedContactsOpen(false)}
        currentUser={currentUser || null}
        onUpdated={(list) => setTrustedCount(list.length)}
      />

      <PassengerWalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
        currentUser={currentUser || null}
        config={config}
        initialMode="deposit"
        suggestedDepositAmount={Math.max(20, Math.ceil(Math.max(0, pricing.totalPrice - walletBalance)))}
        onWalletUpdated={(w) => {
          setWalletBalance(w.balance);
          if (w.balance + 0.001 >= pricing.totalPrice) {
            setRequestError('');
          }
        }}
      />
    </div>
  );
};
