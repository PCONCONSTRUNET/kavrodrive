import React, { useState, useEffect, useRef } from 'react';
import {
  Users, CreditCard,
  ArrowLeft, ShieldCheck, Check, Car,
  Copy, Plus, RefreshCw, AlertCircle, Lock, Sparkles, Clock,
  Phone, MessageSquare, ChevronRight, Maximize2, Minimize2, Share2, Pencil, Package, Calendar, X
} from 'lucide-react';
import { LocationPoint, PaymentMethod, Ride, RideDeliveryDetails, SavedCard, ServiceCategoryType, SystemConfig } from '../types';
import { calculateHaversineDistance, estimateDurationMinutes } from '../utils/geo';
import {
  calculateRidePrice,
  StorageService,
  findActivePassengerRide,
  canPassengerCancelRide,
  canPassengerEditRoute
} from '../services/storage';
import { RealtimeService } from '../services/realtime';
import { UberPlanTripModal } from '../components/UberPlanTripModal';
import { UberPaymentMethodModal } from '../components/UberPaymentMethodModal';
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
  initialFocusField?: 'origin' | 'destination';
  initialOpenSchedule?: boolean;
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
  initialFocusField,
  initialOpenSchedule = false,
  initialRide,
}) => {
  const currentUser = propUser !== undefined ? propUser : StorageService.getCurrentUser();

  const [origin, setOrigin] = useState<LocationPoint | null>(initialOrigin || null);
  const originTouchedManuallyRef = useRef<boolean>(Boolean(initialOrigin));
  const [destination, setDestination] = useState<LocationPoint | null>(initialDestination || null);

  const [sheetView, setSheetView] = useState<'plan' | 'choose' | 'payment' | 'schedule' | 'delivery' | 'add_card'>(() =>
    initialOrigin && initialDestination ? 'choose' : 'plan'
  );
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now');
  const [scheduledDate, setScheduledDate] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [scheduledTime, setScheduledTime] = useState<string>(() => {
    const d = new Date(Date.now() + 20 * 60 * 1000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });

  const rawAllowedMethods: PaymentMethod[] =
    Array.isArray(config.activePaymentMethods) && config.activePaymentMethods.length > 0
      ? config.activePaymentMethods.filter(
          (m): m is PaymentMethod =>
            m === 'pix' || m === 'cartao_credito' || m === 'carteira' || m === 'dinheiro'
        )
      : ['pix', 'carteira', 'dinheiro'];
  const allowedMethods: PaymentMethod[] =
    rawAllowedMethods.length > 0 ? rawAllowedMethods : ['pix', 'carteira', 'dinheiro'];
  const allowPix = allowedMethods.includes('pix');
  const allowCreditCard = allowedMethods.includes('cartao_credito');
  const allowCash = allowedMethods.includes('dinheiro');
  const allowWallet =
    config.walletPaymentDisabled ? false : (allowedMethods.includes('carteira') || config.walletPaymentDisabled === undefined);

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
    allowCash ? 'dinheiro' : allowPix ? 'pix' : allowWallet ? 'carteira' : 'dinheiro'
  );
  const [notes, setNotes] = useState<string>('');

  const [paymentsConfig, setPaymentsConfig] = useState<{
    gatewayProvider: 'efibank' | 'mercadopago' | 'sandbox';
    efiEnabled?: boolean;
    efiPixActive?: boolean;
    mercadopagoEnabled: boolean;
    mercadopagoPublicKey: string;
    autoPixPayoutEnabled: boolean;
  }>({
    gatewayProvider: 'sandbox',
    efiEnabled: false,
    efiPixActive: false,
    mercadopagoEnabled: false,
    mercadopagoPublicKey: String(import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY || '').trim(),
    autoPixPayoutEnabled: false
  });

  useEffect(() => {
    const isCurrentlyAllowed =
      paymentMethod === 'carteira'
        ? allowWallet
        : allowedMethods.includes(paymentMethod);
    if (!isCurrentlyAllowed) {
      const nextMethod: PaymentMethod = allowPix
        ? 'pix'
        : allowCreditCard
          ? 'cartao_credito'
          : allowWallet
            ? 'carteira'
            : 'dinheiro';
      setPaymentMethod(nextMethod);
    }
  }, [allowedMethods.join(','), paymentMethod, allowWallet]);

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
  const [isCheckingEfiPix, setIsCheckingEfiPix] = useState(false);
  const [efiCheckNotice, setEfiCheckNotice] = useState('');
  const [isCheckReady, setIsCheckReady] = useState(false);
  const [isTrustedContactsOpen, setIsTrustedContactsOpen] = useState(false);
  const [isSafetyCenterOpen, setIsSafetyCenterOpen] = useState(false);
  const [isSosOpen, setIsSosOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isEditRouteModalOpen, setIsEditRouteModalOpen] = useState(false);
  const [trustedCount, setTrustedCount] = useState<number>(currentUser?.trustedContacts?.length || 0);
  const [driversSyncTick, setDriversSyncTick] = useState(0);

  useEffect(() => {
    setTrustedCount(currentUser?.trustedContacts?.length || 0);
  }, [currentUser?.trustedContacts?.length]);

  useEffect(() => {
    const refreshDriversSnapshot = () => setDriversSyncTick(t => t + 1);
    const pullAndRefreshDrivers = () => {
      StorageService.syncFromDatabase().then(refreshDriversSnapshot).catch(() => {});
    };
    pullAndRefreshDrivers();
    window.addEventListener('up_database_synced', refreshDriversSnapshot);
    window.addEventListener('up_realtime_driver', pullAndRefreshDrivers);
    window.addEventListener('up_realtime_config', pullAndRefreshDrivers);
    return () => {
      window.removeEventListener('up_database_synced', refreshDriversSnapshot);
      window.removeEventListener('up_realtime_driver', pullAndRefreshDrivers);
      window.removeEventListener('up_realtime_config', pullAndRefreshDrivers);
    };
  }, []);

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

  useEffect(() => {
    void isCheckReady;
    setIsCheckReady(true);
  }, []);

  // Detecta GPS atual somente na abertura inicial (sem repopular após usuário limpar no X)
  useEffect(() => {
    if (initialOrigin || originTouchedManuallyRef.current || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (originTouchedManuallyRef.current) return;
        setOrigin((prev) =>
          prev || {
            address: 'Minha localização atual (GPS)',
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          }
        );
      },
      () => {
        // Mantém manual se usuário negar GPS
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  }, []);

  // Carrega configuração ativa do gateway de pagamento (Efí Bank / Mercado Pago / Sandbox)
  useEffect(() => {
    StorageService.fetchPaymentsConfig().then(setPaymentsConfig).catch(() => {});
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
  const effectiveTimeStr = scheduleMode === 'later' && scheduledTime ? scheduledTime : nowTimeStr;

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
  const orderedCategories = React.useMemo(() => {
    return [...activeCategories].sort((a, b) => {
      const aDel = resolveCategoryType(a) === 'entregas' ? 1 : 0;
      const bDel = resolveCategoryType(b) === 'entregas' ? 1 : 0;
      return aDel - bDel;
    });
  }, [activeCategories]);

  useEffect(() => {
    if (orderedCategories.length > 0 && !orderedCategories.some(c => c.id === selectedCategory)) {
      setSelectedCategory(orderedCategories[0].id);
    }
  }, [orderedCategories, selectedCategory]);

  useEffect(() => {
    if (initialCategoryId) {
      const mapped = mapLegacyCategoryId(initialCategoryId);
      setServiceMode(resolveCategoryType(mapped));
      setSelectedCategory(mapped);
    }
  }, [initialCategoryId]);

  const pricing = calculateRidePrice(distanceKm, durationMin, effectiveTimeStr, config, selectedCategory, undefined, paymentMethod);
  const onlineDrivers = React.useMemo(() => {
    void driversSyncTick;
    return StorageService.getOnlineDrivers();
  }, [driversSyncTick]);
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
    setSheetView('choose');
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
    if (!origin || !destination) {
      setSheetView('plan');
      return { ok: false, error: 'Selecione partida e destino para continuar.', isDeliveryOrder: false };
    }

    const isDeliveryOrder =
      serviceMode === 'entregas' || resolveCategoryType(selectedCatObj) === 'entregas';

    let normalizedDeliveryPayload: RideDeliveryDetails | undefined;
    if (isDeliveryOrder) {
      const cleanName = deliveryRecipientName.trim();
      const cleanPhone = deliveryRecipientPhone.trim();
      const phoneDigits = cleanPhone.replace(/\D/g, '');
      const cleanItem = deliveryItemDesc.trim();
      if (cleanName.length < 2 || phoneDigits.length < 10 || cleanItem.length < 2) {
        const msg = cleanName.length < 2
          ? `Informe o nome completo de quem vai ${deliveryRole === 'sender' ? 'receber' : 'entregar'} o pacote.`
          : phoneDigits.length < 10
            ? 'Informe um WhatsApp ou telefone válido com DDD para a entrega.'
            : 'Descreva o produto ou item que será enviado na entrega.';
        setRequestError(msg);
        setSheetView('delivery');
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
    validation: { isDeliveryOrder: boolean; deliveryDetails: RideDeliveryDetails | null };
  }) => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const effDate = scheduleMode === 'later' && scheduledDate ? scheduledDate : todayStr;
    const v = cardMeta?.validation || { isDeliveryOrder: false, deliveryDetails: null };
    return {
      clientId: currentUser?.id,
      clientName: currentUser?.name || 'Passageiro',
      clientPhone: currentUser?.phone || '',
      origin: origin!,
      destination: destination!,
      date: effDate,
      time: effectiveTimeStr,
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
      notes: v.isDeliveryOrder
        ? (deliveryInstructions.trim() || `Entrega: ${v.deliveryDetails?.itemDescription || ''}`)
        : notes,
      isManualBooking: false
    };
  };

  const submitBookingRequest = async (overrides?: {
    paymentMethodOverride?: PaymentMethod;
    cardBrandOverride?: string;
  }) => {
    const validation = validateBookingBeforePayment();
    if (!validation.ok) return;

    const effectiveMethod = overrides?.paymentMethodOverride || paymentMethod;
    const isCard = effectiveMethod === 'cartao_credito' || effectiveMethod === 'cartao_debito';
    const chosenCard = savedCards.find(c => c.id === selectedCardId);
    if (isCard && !chosenCard) {
      setSheetView('add_card');
      return;
    }

    setIsSubmitting(true);
    const baseRequestPayload = buildValidatedRideDraft(effectiveMethod, {
      cardId: isCard ? chosenCard?.id : undefined,
      cardLast4: isCard ? chosenCard?.last4 : undefined,
      cardBrand: overrides?.cardBrandOverride || (isCard ? chosenCard?.brand : undefined),
      validation: {
        isDeliveryOrder: validation.isDeliveryOrder,
        deliveryDetails: validation.deliveryDetails || null
      }
    });

    const res = await StorageService.requestRideOnDemand(baseRequestPayload);

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

  const handleCheckEfiPixNow = async () => {
    if (!activeRide) return;
    setIsCheckingEfiPix(true);
    setEfiCheckNotice('');
    const res = await StorageService.verifyPixPaymentStatus(activeRide.id);
    setIsCheckingEfiPix(false);
    if (res.ok && res.paid && res.ride) {
      setActiveRide(res.ride);
      try {
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
      } catch {
        // ignore
      }
      return;
    }
    if (!res.ok) {
      setEfiCheckNotice(res.error || 'Não foi possível verificar o PIX agora.');
      return;
    }
    setEfiCheckNotice('Pagamento ainda aguardando compensação bancária. Assim que compensar, a corrida libera automaticamente.');
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
          minHeight: '100dvh',
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
              <span>{paymentsConfig.efiPixActive ? 'PIX Instantâneo' : 'PIX Gateway'}</span>
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

            {/* Verificação ativa Efí Bank quando gateway Efí PIX está ativo */}
            {paymentsConfig.efiPixActive && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={handleCheckEfiPixNow}
                  disabled={isCheckingEfiPix}
                  style={{
                    padding: '9px 18px',
                    borderRadius: 999,
                    backgroundColor: '#F8FAFC',
                    color: '#0F172A',
                    border: '1px solid #CBD5E1',
                    fontWeight: 800,
                    fontSize: '0.78rem',
                    cursor: isCheckingEfiPix ? 'wait' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <RefreshCw size={13} className={isCheckingEfiPix ? 'animate-spin' : ''} />
                  <span>{isCheckingEfiPix ? 'Consultando banco...' : 'Já paguei — verificar agora'}</span>
                </button>
                {efiCheckNotice && (
                  <div style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 600 }}>
                    {efiCheckNotice}
                  </div>
                )}
              </div>
            )}

            {/* Botão de Simulação do Webhook apenas em desenvolvimento sem gateway real ativo */}
            {import.meta.env.DEV && !paymentsConfig.efiPixActive && (
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
        height: '100dvh',
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
  const shortOriginLabel = origin?.reference || (origin?.address ? origin.address.split(',')[0].trim() : 'Partida');
  const shortDestLabel = destination?.reference || (destination?.address ? destination.address.split(',')[0].trim() : 'Destino');
  const effectivePaymentLabel =
    paymentMethod === 'carteira'
      ? `Saldo Kavro (${walletBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`
      : getPaymentMethodLabel(paymentMethod, true);
  const selectedIsDelivery =
    serviceMode === 'entregas' || resolveCategoryType(selectedCatObj) === 'entregas';
  const isDeliveryReady =
    deliveryRecipientName.trim().length >= 2 &&
    deliveryRecipientPhone.replace(/\D/g, '').length >= 10 &&
    deliveryItemDesc.trim().length >= 2;
  const allowCardModal = allowCreditCard && (paymentsConfig.mercadopagoEnabled || savedCards.length > 0);

  return (
    <div
      className="animate-fade-in"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10040,
        width: '100%',
        maxWidth: 480,
        margin: '0 auto',
        height: '100dvh',
        backgroundColor: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* ═══ ETAPA 1 EM TELA CHEIA: "PLANEJE SUA PRÓXIMA VIAGEM" ═══ */}
        {sheetView === 'plan' && (
          <UberPlanTripModal
            isOpen
            embedded
            initialFocusField={initialFocusField}
            initialOpenSchedule={initialOpenSchedule}
            origin={origin}
            destination={destination}
            serviceMode={serviceMode}
            currentUser={currentUser}
            scheduleMode={scheduleMode}
            scheduledDate={scheduledDate}
            scheduledTime={scheduledTime}
            passengers={passengers}
            hasLuggage={hasLuggage}
            notes={notes}
            onBack={() => {
              if (origin && destination) {
                setSheetView('choose');
              } else {
                onBackToHome();
              }
            }}
            onChangeSchedule={(mode, date, time) => {
              setScheduleMode(mode);
              setScheduledDate(date);
              setScheduledTime(time);
            }}
            onChangePassengers={(count, lug, obs) => {
              setPassengers(count);
              setHasLuggage(lug);
              setNotes(obs);
            }}
            onSelectOrigin={(pt) => {
              originTouchedManuallyRef.current = true;
              setOrigin(pt);
            }}
            onSelectDestination={(pt) => setDestination(pt)}
            onSwapOriginDest={() => {
              originTouchedManuallyRef.current = true;
              const prevOrigin = origin;
              setOrigin(destination);
              setDestination(prevOrigin);
            }}
            onCompleteRoute={(orig, dest) => {
              originTouchedManuallyRef.current = true;
              setOrigin(orig);
              setDestination(dest);
              setRequestError('');
              setSheetView('choose');
            }}
          />
        )}

        {/* ═══ ETAPA 3 DENTRO DO MESMO MODAL: "PAGUE COM" ═══ */}
        {sheetView === 'payment' && (
          <UberPaymentMethodModal
            isOpen
            embedded
            paymentMethod={paymentMethod}
            totalPrice={pricing.totalPrice}
            walletBalance={walletBalance}
            isLoggedIn={Boolean(currentUser?.id)}
            allowCash={allowCash}
            allowPix={allowPix}
            allowWallet={allowWallet}
            allowCreditCard={allowCardModal}
            savedCards={savedCards}
            selectedCardId={selectedCardId}
            onClose={() => setSheetView('choose')}
            onSelectMethod={(method, cardId) => {
              setPaymentMethod(method);
              if (cardId) setSelectedCardId(cardId);
              setRequestError('');
            }}
            onOpenWalletDeposit={() => {
              setIsWalletModalOpen(true);
            }}
            onOpenAddCard={() => {
              setSheetView('add_card');
            }}
          />
        )}

        {/* Cadastro de Cartão Kavro Pay dentro do mesmo modal */}
        {sheetView === 'add_card' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{
              background: 'linear-gradient(155deg, #0B1117 0%, #15222C 100%)',
              padding: 'calc(16px + env(safe-area-inset-top, 0px)) 20px 18px 20px',
              borderBottomLeftRadius: 20,
              borderBottomRightRadius: 20,
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
                  onClick={() => setSheetView('payment')}
                  aria-label="Voltar para formas de pagamento"
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
              <form onSubmit={handleSaveNewCard} style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setCardType('cartao_credito')}
                      style={{
                        padding: '7px 18px',
                        borderRadius: 999,
                        border: '1.5px solid #0F172A',
                        backgroundColor: '#0F172A',
                        color: '#FFFFFF',
                        fontWeight: 800,
                        fontSize: '0.76rem',
                        cursor: 'pointer'
                      }}
                    >
                      Cartão de Crédito
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
            </div>
          </div>
        )}

      {/* =====================================================================
          ETAPA 2 DENTRO DO MESMO MODAL: MAPA + BOTTOM SHEET "ESCOLHER UMA VIAGEM"
         ===================================================================== */}
      {sheetView === 'choose' && (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', flex: '0 0 41dvh', minHeight: 205, width: '100%', isolation: 'isolate', zIndex: 1 }}>
        <PassengerLiveMap
          origin={origin}
          destination={destination}
          nearbyDrivers={nearbyMapDrivers}
        />

        {/* Topo Flutuante: Voltar + Pílula da Rota (Partida → Destino) + Motoristas */}
        <div style={{
          position: 'absolute',
          top: 'calc(12px + env(safe-area-inset-top, 0px))',
          left: 12,
          right: 12,
          zIndex: 400,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          pointerEvents: 'none'
        }}>
          <button
            type="button"
            onClick={() => setSheetView('plan')}
            aria-label="Voltar para editar endereços"
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.56) 0%, rgba(255, 255, 255, 0.28) 100%)',
              backdropFilter: 'blur(24px) saturate(210%)',
              WebkitBackdropFilter: 'blur(24px) saturate(210%)',
              border: '1px solid rgba(255, 255, 255, 0.75)',
              color: '#0F172A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 18px rgba(15, 23, 42, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
              cursor: 'pointer',
              pointerEvents: 'auto',
              flexShrink: 0
            }}
          >
            <ArrowLeft size={19} />
          </button>

          {/* Pílula Central Clicável com Rota (igual Print 3) */}
          <button
            type="button"
            onClick={() => setSheetView('plan')}
            style={{
              flex: 1,
              minWidth: 0,
              maxWidth: 250,
              padding: '6px 14px',
              borderRadius: 18,
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              color: '#FFFFFF',
              textAlign: 'center',
              cursor: 'pointer',
              pointerEvents: 'auto',
              boxShadow: '0 6px 20px rgba(15, 23, 42, 0.28)'
            }}
          >
            <div style={{
              fontSize: '0.72rem',
              color: '#CBD5E1',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              • {shortOriginLabel}
            </div>
            <div style={{
              fontSize: '0.82rem',
              color: '#FFFFFF',
              fontWeight: 800,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {shortDestLabel}
            </div>
          </button>

          <div style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.56) 0%, rgba(255, 255, 255, 0.28) 100%)',
            backdropFilter: 'blur(24px) saturate(210%)',
            WebkitBackdropFilter: 'blur(24px) saturate(210%)',
            color: '#0F172A',
            border: '1px solid rgba(255, 255, 255, 0.75)',
            padding: '7px 10px',
            borderRadius: 999,
            fontSize: '0.72rem',
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            boxShadow: '0 6px 18px rgba(15, 23, 42, 0.14)',
            pointerEvents: 'auto',
            flexShrink: 0
          }}>
            <span style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              backgroundColor: onlineDriversCount > 0 ? '#16A34A' : '#9CA3AF'
            }} />
            <span>{onlineDriversCount}</span>
          </div>
        </div>

        {/* Badge discreta de distância e duração */}
        {origin && destination && (
          <div style={{
            position: 'absolute',
            bottom: 28,
            right: 12,
            zIndex: 400,
            backgroundColor: 'rgba(15, 23, 42, 0.86)',
            color: '#FFFFFF',
            padding: '5px 10px',
            borderRadius: 999,
            fontSize: '0.7rem',
            fontWeight: 800,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            pointerEvents: 'none'
          }}>
            {distanceKm.toFixed(1)} km • ~{durationMin} min
          </div>
        )}
      </div>

      {/* =====================================================================
          PAINEL "ESCOLHER UMA VIAGEM" (2 MODALIDADES + PAGAMENTO + CTA)
         ===================================================================== */}
      <div style={{
        flex: 1,
        minHeight: 0,
        backgroundColor: '#FFFFFF',
        borderRadius: '24px 24px 0 0',
        marginTop: -20,
        zIndex: 20,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 -10px 30px rgba(15, 23, 42, 0.14)'
      }}>
        {/* Handle + Título Central */}
        <div style={{ padding: '10px 16px 8px 16px', flexShrink: 0 }}>
          <div style={{
            width: 38,
            height: 4,
            borderRadius: 999,
            backgroundColor: '#CBD5E1',
            margin: '0 auto 10px auto'
          }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: '1.14rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>
              Escolher uma viagem
            </h2>
            <button
              type="button"
              onClick={() => setIsTrustedContactsOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                backgroundColor: '#F0FDF4',
                color: '#15803D',
                border: '1px solid #BBF7D0',
                borderRadius: 999,
                padding: '4px 9px',
                fontSize: '0.7rem',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              <ShieldCheck size={12} />
              <span>Contatos ({trustedCount})</span>
            </button>
          </div>

          {scheduleMode === 'later' && (
            <div style={{
              marginTop: 8,
              padding: '6px 10px',
              borderRadius: 10,
              backgroundColor: '#F0FDF4',
              border: '1px solid #BBF7D0',
              color: '#15803D',
              fontSize: '0.74rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}>
              <Calendar size={13} />
              <span>Agendado para {scheduledDate.split('-').reverse().join('/')} às {scheduledTime}</span>
            </div>
          )}
        </div>

        {/* Lista Rolável com as 2 Opções do Sistema (Padrão & Entregas) */}
        <div style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: '4px 16px 10px 16px'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {orderedCategories.map((cat) => {
              const catPrice = calculateRidePrice(distanceKm, durationMin, effectiveTimeStr, config, cat.id, undefined, paymentMethod);
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
                    padding: '13px 14px',
                    borderRadius: 16,
                    border: isSelected
                      ? `2px solid ${isCatDelivery ? '#15803D' : '#0F172A'}`
                      : '1px solid #E2E8F0',
                    backgroundColor: isSelected ? (isCatDelivery ? '#F0FDF4' : '#F8FAFC') : '#FFFFFF',
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
                      width: 52,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: isSelected
                        ? (isCatDelivery ? '#15803D' : '#0F172A')
                        : (isCatDelivery ? '#DCFCE7' : '#F1F5F9'),
                      color: isSelected ? '#FFFFFF' : (isCatDelivery ? '#15803D' : '#0F172A'),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {isCatDelivery ? <Package size={22} /> : <Car size={22} />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '1rem', fontWeight: 900, color: '#0F172A' }}>
                          {cat.name}
                        </span>
                        {isCatDelivery ? (
                          <span style={{
                            fontSize: '0.66rem',
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
                            fontSize: '0.74rem',
                            color: '#475569',
                            fontWeight: 700
                          }}>
                            <Users size={12} />{cat.maxPassengers || 4}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: hasNoDriverInCat ? '#DC2626' : '#64748B', fontWeight: 600, marginTop: 2 }}>
                        {hasNoDriverInCat
                          ? 'Sem motoristas nessa categoria agora'
                          : `Chega em ~${stats.etaMin} min • ${cat.description}`}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '1.12rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>
                      R$ {catPrice.totalPrice.toFixed(2).replace('.', ',')}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Card compacto de Destinatário somente quando Entregas está selecionada */}
          {selectedIsDelivery && (
            <button
              type="button"
              onClick={() => setSheetView('delivery')}
              style={{
                width: '100%',
                marginTop: 10,
                padding: '11px 14px',
                borderRadius: 14,
                border: isDeliveryReady ? '1px solid #BBF7D0' : '1.5px dashed #16A34A',
                backgroundColor: '#F0FDF4',
                color: '#14532D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                textAlign: 'left',
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Package size={18} color="#15803D" style={{ flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800 }}>
                    {isDeliveryReady ? `Entrega para ${deliveryRecipientName}` : 'Informar dados da entrega *'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#166534', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {isDeliveryReady
                      ? `${deliveryItemDesc} • ${deliveryRecipientPhone}`
                      : 'Toque para preencher destinatário, WhatsApp e pacote'}
                  </div>
                </div>
              </div>
              <ChevronRight size={17} color="#15803D" style={{ flexShrink: 0 }} />
            </button>
          )}

          {/* Alerta se não houver motoristas na categoria escolhida */}
          {onlineDrivers.length > 0 && selectedCatStats.availableDriversCount === 0 && (
            <div style={{
              marginTop: 10,
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
                    const altPrice = calculateRidePrice(distanceKm, durationMin, effectiveTimeStr, config, alt.id, undefined, paymentMethod);
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
                          backgroundColor: '#0F172A',
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
        </div>

        {/* Rodapé Fixo do Checkout: Linha de Pagamento (Print 3) + Botão Principal + Agendar */}
        <div style={{
          flexShrink: 0,
          borderTop: '1px solid #F1F5F9',
          backgroundColor: '#FFFFFF',
          padding: '10px 16px calc(16px + env(safe-area-inset-bottom, 0px)) 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
          {/* Linha de Pagamento Clicável -> abre "Pague com" dentro do mesmo modal */}
          <button
            type="button"
            onClick={() => setSheetView('payment')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 14,
              border: '1px solid #E2E8F0',
              backgroundColor: '#F8FAFC',
              color: '#0F172A',
              cursor: 'pointer'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <PaymentMethodIcon method={paymentMethod} size={22} />
              <span style={{ fontSize: '0.9rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {effectivePaymentLabel}
              </span>
            </div>
            <ChevronRight size={18} color="#475569" style={{ flexShrink: 0 }} />
          </button>

          {requestError && (
            <div style={{
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 12,
              padding: '9px 12px',
              color: '#DC2626',
              fontSize: '0.76rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{requestError}</span>
            </div>
          )}

          {/* Botão CTA + Botão Calendário ao lado (igual Print 3) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={handleRequestRideNow}
              disabled={isSubmitting}
              style={{
                flex: 1,
                height: 50,
                borderRadius: 999,
                backgroundColor: selectedIsDelivery ? '#15803D' : '#0F172A',
                color: '#FFFFFF',
                border: 'none',
                fontSize: '0.95rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
                boxShadow: '0 8px 22px rgba(15, 23, 42, 0.2)'
              }}
            >
              {isSubmitting && <RefreshCw size={16} className="animate-spin" />}
              <span>
                {isSubmitting
                  ? 'Conectando motorista...'
                  : `Escolha ${selectedCatObj.name} • R$ ${pricing.totalPrice.toFixed(2).replace('.', ',')}`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSheetView('schedule')}
              title="Agendar horário"
              aria-label="Agendar horário"
              style={{
                width: 50,
                height: 50,
                borderRadius: 16,
                border: scheduleMode === 'later' ? '1.5px solid #16A34A' : '1px solid #E2E8F0',
                backgroundColor: scheduleMode === 'later' ? '#F0FDF4' : '#F1F5F9',
                color: scheduleMode === 'later' ? '#15803D' : '#0F172A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <Calendar size={20} />
            </button>
          </div>
        </div>
      </div>
      </div>
      )}

      {/* Agendamento dentro do mesmo modal */}
      {sheetView === 'schedule' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 'calc(14px + env(safe-area-inset-top, 0px)) 18px calc(22px + env(safe-area-inset-bottom, 0px)) 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <button
              type="button"
              onClick={() => setSheetView('choose')}
              aria-label="Voltar"
              style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', backgroundColor: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <ArrowLeft size={18} />
            </button>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#0F172A' }}>
              Quando você quer ir?
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => {
                setScheduleMode('now');
                setSheetView('choose');
              }}
              style={{
                height: 46,
                borderRadius: 14,
                border: scheduleMode === 'now' ? '2px solid #0F172A' : '1px solid #CBD5E1',
                backgroundColor: scheduleMode === 'now' ? '#0F172A' : '#FFFFFF',
                color: scheduleMode === 'now' ? '#FFFFFF' : '#0F172A',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              Ir agora
            </button>
            <button
              type="button"
              onClick={() => setScheduleMode('later')}
              style={{
                height: 46,
                borderRadius: 14,
                border: scheduleMode === 'later' ? '2px solid #16A34A' : '1px solid #CBD5E1',
                backgroundColor: scheduleMode === 'later' ? '#16A34A' : '#FFFFFF',
                color: scheduleMode === 'later' ? '#FFFFFF' : '#0F172A',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              Agendar horário
            </button>
          </div>

          {scheduleMode === 'later' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  style={{ height: 46, padding: '0 12px', borderRadius: 12, border: '1px solid #CBD5E1', fontWeight: 700 }}
                />
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  style={{ height: 46, padding: '0 12px', borderRadius: 12, border: '1px solid #CBD5E1', fontWeight: 700 }}
                />
              </div>
              <button
                type="button"
                onClick={() => setSheetView('choose')}
                style={{
                  height: 48,
                  borderRadius: 999,
                  border: 'none',
                  backgroundColor: '#0F172A',
                  color: '#FFFFFF',
                  fontSize: '0.92rem',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                Confirmar agendamento
              </button>
            </div>
          )}
        </div>
      )}

      {/* Detalhes da Entrega dentro do mesmo modal */}
      {sheetView === 'delivery' && (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: 'calc(14px + env(safe-area-inset-top, 0px)) 18px calc(22px + env(safe-area-inset-bottom, 0px)) 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <button
              type="button"
              onClick={() => setSheetView('choose')}
              aria-label="Voltar"
              style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', backgroundColor: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <ArrowLeft size={18} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Package size={18} color="#15803D" />
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: '#0F172A' }}>
                Detalhes da Entrega
              </h2>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button
              type="button"
              onClick={() => setDeliveryRole('sender')}
              style={{
                padding: '10px',
                borderRadius: 10,
                border: deliveryRole === 'sender' ? '2px solid #15803D' : '1px solid #D1FAE5',
                backgroundColor: deliveryRole === 'sender' ? '#15803D' : '#FFFFFF',
                color: deliveryRole === 'sender' ? '#FFFFFF' : '#166534',
                fontSize: '0.8rem',
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
                padding: '10px',
                borderRadius: 10,
                border: deliveryRole === 'receiver' ? '2px solid #15803D' : '1px solid #D1FAE5',
                backgroundColor: deliveryRole === 'receiver' ? '#15803D' : '#FFFFFF',
                color: deliveryRole === 'receiver' ? '#FFFFFF' : '#166534',
                fontSize: '0.8rem',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              Vou receber
            </button>
          </div>

          <input
            type="text"
            placeholder={deliveryRole === 'sender' ? 'Nome completo de quem recebe *' : 'Nome completo de quem envia *'}
            value={deliveryRecipientName}
            onChange={(e) => setDeliveryRecipientName(e.target.value)}
            style={{ width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid #CBD5E1', fontSize: '0.86rem', boxSizing: 'border-box' }}
          />
          <input
            type="tel"
            placeholder="WhatsApp com DDD *"
            value={deliveryRecipientPhone}
            onChange={(e) => setDeliveryRecipientPhone(e.target.value)}
            style={{ width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid #CBD5E1', fontSize: '0.86rem', boxSizing: 'border-box' }}
          />
          <input
            type="text"
            placeholder="O que está sendo enviado? (ex: Caixa, chave, documentos...) *"
            value={deliveryItemDesc}
            onChange={(e) => setDeliveryItemDesc(e.target.value)}
            style={{ width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid #CBD5E1', fontSize: '0.86rem', boxSizing: 'border-box' }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {([
              { id: 'pequeno', label: 'Pequeno' },
              { id: 'medio', label: 'Médio' },
              { id: 'grande', label: 'Grande' }
            ] as const).map((sz) => (
              <button
                key={sz.id}
                type="button"
                onClick={() => setDeliveryPackageSize(sz.id)}
                style={{
                  padding: '9px 6px',
                  borderRadius: 9,
                  border: deliveryPackageSize === sz.id ? '1.5px solid #15803D' : '1px solid #E2E8F0',
                  backgroundColor: deliveryPackageSize === sz.id ? '#DCFCE7' : '#FFFFFF',
                  color: '#14532D',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {sz.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {([
              { id: 'porta_mao', label: 'Em mãos' },
              { id: 'portaria', label: 'Portaria' },
              { id: 'recepcao', label: 'Recepção' }
            ] as const).map((dm) => (
              <button
                key={dm.id}
                type="button"
                onClick={() => setDeliveryDropoffMode(dm.id)}
                style={{
                  padding: '9px 6px',
                  borderRadius: 9,
                  border: deliveryDropoffMode === dm.id ? '1.5px solid #15803D' : '1px solid #E2E8F0',
                  backgroundColor: deliveryDropoffMode === dm.id ? '#DCFCE7' : '#FFFFFF',
                  color: '#14532D',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {dm.label}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Instruções extras (bloco, apto, contato...)"
            value={deliveryInstructions}
            onChange={(e) => setDeliveryInstructions(e.target.value)}
            style={{ width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid #CBD5E1', fontSize: '0.84rem', boxSizing: 'border-box' }}
          />

          <button
            type="button"
            onClick={() => {
              setRequestError('');
              setSheetView('choose');
            }}
            style={{
              height: 48,
              borderRadius: 999,
              border: 'none',
              backgroundColor: '#15803D',
              color: '#FFFFFF',
              fontSize: '0.92rem',
              fontWeight: 800,
              cursor: 'pointer',
              marginTop: 4
            }}
          >
            Salvar detalhes da entrega
          </button>
        </div>
      )}

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
