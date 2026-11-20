import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { 
  X, Navigation, Compass, Phone, ExternalLink, 
  CheckCircle2, Locate, Check, Volume2, VolumeX, CornerUpRight, CornerUpLeft, ArrowUp, RotateCw
} from 'lucide-react';
import { Ride, RideStatus, SystemConfig } from '../types';
import { StorageService, canPassengerCancelRide } from '../services/storage';
import { WhatsAppIcon } from './WhatsAppIcon';
import { RidePaymentCheckoutModal } from './RidePaymentCheckoutModal';
import { SosEmergencyModal } from './SosEmergencyModal';
import { RideSearchingStageCard } from './RideSearchingStageCard';
import { RideCancelModal } from './RideCancelModal';
import { MercosulPlateBadge } from './MercosulPlateBadge';
import { formatPhone, getCleanWhatsappNumber } from '../utils/format';
import { getGoogleMapsRouteUrl, calculateHaversineDistance, snapPointToRoute } from '../utils/geo';
import { 
  ScreenWakeLockManager, speakVoiceInstruction, stopVoiceSpeech, 
  translateOsrmStep, RouteStep 
} from '../utils/soundAndVoice';
import 'leaflet/dist/leaflet.css';

interface LiveGpsNavigationScreenProps {
  ride: Ride;
  isOpen: boolean;
  userRole: 'driver' | 'client';
  onClose: () => void;
  onUpdateStatus?: (rideId: string, newStatus: RideStatus) => void;
  config: SystemConfig;
}

// Pré-carrega os ícones na memória do navegador para evitar qualquer atraso ou piscada de pintura
if (typeof window !== 'undefined') {
  ['/driver-arrow-marker.png', '/car-marker-v2.png'].forEach((src) => {
    const img = new Image();
    img.src = src;
  });
}

// Marcador Customizado Oficial do Veículo Kavro Drive (instância estável — rotação aplicada via DOM sem recriar o ícone):
// - Motorista (isDriver = true): Seta 3D de navegação estilo Google Maps (/driver-arrow-marker.png)
// - Cliente (isDriver = false): Carrinho plotado Kavro Drive em movimento (/car-marker-v2.png)
const createCarIcon = (isDriver: boolean = false) => {
  const iconSrc = isDriver ? '/driver-arrow-marker.png' : '/car-marker-v2.png';
  const imgWidth = isDriver ? 52 : 40;
  const imgHeight = isDriver ? 58 : 66;
  return L.divIcon({
    className: 'custom-car-marker',
    html: `
      <div style="position: relative; width: 68px; height: 68px; display: flex; align-items: center; justify-content: center; pointer-events: none;">
        <div style="position: absolute; width: 54px; height: 54px; border-radius: 50%; background: rgba(118, 216, 0, 0.20); border: 1.5px solid rgba(118, 216, 0, 0.45);"></div>
        <img
          class="up-vehicle-icon-img"
          src="${iconSrc}"
          alt="Navegação Kavro Drive"
          style="width: ${imgWidth}px; height: ${imgHeight}px; object-fit: contain; transform: rotate(0deg); transition: transform 0.35s ease; filter: drop-shadow(0 5px 10px rgba(0, 0, 0, 0.45)); position: relative; z-index: 2; will-change: transform; backface-visibility: hidden; -webkit-backface-visibility: hidden;"
        />
      </div>
    `,
    iconSize: [68, 68],
    iconAnchor: [34, 34],
  });
};

// Instâncias estáticas únicas dos marcadores para nunca recriar o DOM a cada segundo do timer
const CLIENT_LIVE_ICON = L.divIcon({
  className: 'custom-client-live-marker',
  html: `
    <div style="display: flex; flex-direction: column; align-items: center;">
      <div style="background: #2563EB; color: #FFFFFF; font-size: 9px; font-weight: 800; padding: 2px 7px; border-radius: 10px; border: 1px solid #FFFFFF; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.25); margin-bottom: 2px;">
        PASSAGEIRO
      </div>
      <div style="width: 18px; height: 18px; border-radius: 50%; background: #2563EB; border: 3px solid #FFFFFF; box-shadow: 0 3px 10px rgba(37, 99, 235, 0.6);"></div>
    </div>
  `,
  iconSize: [70, 38],
  iconAnchor: [35, 34],
});

const PICKUP_ICON = L.divIcon({
  className: 'custom-pickup-marker',
  html: `
    <div style="display: flex; flex-direction: column; align-items: center;">
      <div style="background: #121A21; color: #76D800; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 10px; border: 1px solid #76D800; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.25); margin-bottom: 2px;">
        EMBARQUE
      </div>
      <div style="width: 22px; height: 22px; border-radius: 50%; background: #76D800; border: 3px solid #FFFFFF; box-shadow: 0 3px 10px rgba(118, 216, 0, 0.5); display: flex; align-items: center; justify-content: center;">
        <div style="width: 6px; height: 6px; border-radius: 50%; background: #121A21;"></div>
      </div>
    </div>
  `,
  iconSize: [70, 44],
  iconAnchor: [35, 40],
});

const PICKUP_SEARCH_ICON = L.divIcon({
  className: 'custom-pickup-search-marker',
  html: `
    <div style="position: relative; width: 72px; height: 72px; display: flex; align-items: center; justify-content: center;">
      <div class="kavro-map-sonar"></div>
      <div class="kavro-map-sonar-delay"></div>
      <div style="position: relative; z-index: 2; width: 22px; height: 22px; border-radius: 50%; background: #76D800; border: 3px solid #FFFFFF; box-shadow: 0 3px 10px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center;">
        <div style="width: 7px; height: 7px; border-radius: 50%; background: #121A21;"></div>
      </div>
    </div>
  `,
  iconSize: [72, 72],
  iconAnchor: [36, 36],
});

const DESTINATION_ICON = L.divIcon({
  className: 'custom-destination-marker',
  html: `
    <div style="display: flex; flex-direction: column; align-items: center;">
      <div style="background: #121A21; color: #FFFFFF; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 10px; border: 1px solid #475569; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.25); margin-bottom: 2px;">
        DESTINO
      </div>
      <div style="width: 22px; height: 22px; border-radius: 50%; background: #121A21; border: 3px solid #FFFFFF; box-shadow: 0 3px 10px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;">
        <div style="width: 6px; height: 6px; border-radius: 50%; background: #76D800;"></div>
      </div>
    </div>
  `,
  iconSize: [70, 44],
  iconAnchor: [35, 40],
});

// Componente para controlar visualização e recenteamento do mapa
const MapFollowController: React.FC<{ 
  center: [number, number]; 
  followMode: boolean;
  bounds?: [[number, number], [number, number]];
}> = ({ center, followMode, bounds }) => {
  const map = useMap();
  useEffect(() => {
    const t1 = setTimeout(() => map.invalidateSize(), 100);
    const t2 = setTimeout(() => map.invalidateSize(), 600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [map]);

  useEffect(() => {
    if (followMode) {
      map.setView(center, Math.max(map.getZoom(), 16), { animate: true, duration: 0.6 });
    }
  }, [center[0], center[1], followMode, map]);

  useEffect(() => {
    if (bounds && !followMode) {
      map.fitBounds(bounds, { padding: [60, 60] });
    }
  }, [bounds, followMode, map]);

  return null;
};

export const LiveGpsNavigationScreen: React.FC<LiveGpsNavigationScreenProps> = ({
  ride,
  isOpen,
  userRole,
  onClose,
  onUpdateStatus,
  config,
}) => {
  const isDriver = userRole === 'driver';
  const [liveRide, setLiveRide] = useState<Ride>(ride);

  useEffect(() => {
    setLiveRide(ride);
  }, [ride]);

  // Posição inicial: apenas motorista usa fallback imediato; passageiro aguarda GPS real do motorista aceito
  const initialDriverPos = useMemo(() => {
    if (liveRide.driverLocation?.lat && liveRide.driverLocation?.lng) {
      return {
        lat: liveRide.driverLocation.lat,
        lng: liveRide.driverLocation.lng,
        heading: liveRide.driverLocation.heading || 0
      };
    }
    return {
      lat: liveRide.origin.lat || -28.39,
      lng: liveRide.origin.lng || -49.39,
      heading: 0
    };
  }, [liveRide.id]);

  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number; heading: number }>(initialDriverPos);
  const [clientPos, setClientPos] = useState<{ lat: number; lng: number } | null>(
    liveRide.clientLocation?.lat && liveRide.clientLocation?.lng
      ? { lat: liveRide.clientLocation.lat, lng: liveRide.clientLocation.lng }
      : null
  );
  const [speed, setSpeed] = useState<number>(liveRide.driverLocation?.speedKmH || 0);
  const [rideStatus, setRideStatus] = useState<RideStatus>(liveRide.status);
  const hasAssignedDriver = Boolean(
    liveRide.driverId ||
    rideStatus === 'na_fila' ||
    rideStatus === 'confirmada' ||
    rideStatus === 'a_caminho' ||
    rideStatus === 'no_local' ||
    rideStatus === 'em_andamento'
  );
  const isWaitingDriver = !isDriver && (!hasAssignedDriver || rideStatus === 'aguardando_confirmacao' || rideStatus === 'aguardando_pagamento');
  const [followMode, setFollowMode] = useState<boolean>(isDriver || Boolean(liveRide.driverLocation?.lat));
  const [mapLayer, setMapLayer] = useState<'streets' | 'hybrid'>('streets');
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);
  const [metersToClient, setMetersToClient] = useState<number>(Math.round((liveRide.distanceKm || 0.5) * 1000));
  const [metersToDestination, setMetersToDestination] = useState<number>(Math.round((liveRide.distanceKm || 1) * 1000));
  const [etaSecondsLeft, setEtaSecondsLeft] = useState<number>((liveRide.durationMin || 5) * 60);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);
  const [isSosModalOpen, setIsSosModalOpen] = useState<boolean>(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState<boolean>(false);
  const [gpsFixed, setGpsFixed] = useState<boolean>(Boolean(liveRide.driverLocation?.lat));
  const [closingNotice, setClosingNotice] = useState<string | null>(null);
  const [isDriverHudExpanded, setIsDriverHudExpanded] = useState<boolean>(false);
  const hasAutoClosedRef = useRef(false);

  useEffect(() => {
    setIsDriverHudExpanded(false);
  }, [rideStatus]);

  const showCarMarker = isDriver || (!isWaitingDriver && gpsFixed);
  const hasRealTelemetry = isDriver || (!isWaitingDriver && gpsFixed);

  // Estados de Instruções por Voz (Turn-by-Turn estilo Google Maps / Waze)
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('up_gps_voice_enabled') !== 'false';
    } catch {
      return true;
    }
  });
  const [navigationSteps, setNavigationSteps] = useState<RouteStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const spokenStepsRef = useRef<Set<string>>(new Set());

  // Screen Wake Lock API — Impede que a tela do celular apague durante a navegação
  useEffect(() => {
    if (!isOpen) return;
    const wakeLockManager = new ScreenWakeLockManager();
    wakeLockManager.request();

    const handleVis = () => {
      wakeLockManager.handleVisibilityChange();
    };
    document.addEventListener('visibilitychange', handleVis);

    return () => {
      wakeLockManager.release();
      document.removeEventListener('visibilitychange', handleVis);
      stopVoiceSpeech();
    };
  }, [isOpen]);

  // Auto-fechamento imediato do GPS na tela do cliente quando a corrida for finalizada ou cancelada
  useEffect(() => {
    if (!isOpen || isDriver) return;
    if ((rideStatus === 'finalizada' || rideStatus === 'cancelada') && !hasAutoClosedRef.current) {
      hasAutoClosedRef.current = true;
      setClosingNotice(
        rideStatus === 'finalizada'
          ? '🏁 Corrida finalizada com sucesso! Seu destino foi alcançado.'
          : liveRide.cancelledBy === 'passenger'
            ? 'Solicitação cancelada com sucesso.'
            : liveRide.cancelledBy === 'admin'
              ? 'Corrida cancelada pela central.'
              : '❌ Corrida cancelada pelo motorista.'
      );
      StorageService.syncFromDatabase().catch(() => {});
      const timer = setTimeout(() => {
        onClose();
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isDriver, rideStatus, liveRide.cancelledBy, onClose]);

  const latestDriverPosRef = useRef(currentPos);
  const latestSpeedRef = useRef(speed);
  const carMarkerRef = useRef<L.Marker | null>(null);
  const carIcon = useMemo(() => createCarIcon(isDriver), [isDriver]);

  useEffect(() => {
    latestDriverPosRef.current = currentPos;
    latestSpeedRef.current = speed;
  }, [currentPos, speed]);

  // Encaixe geométrico inteligente na rota (Road Snapping / Map Matching)
  // Garante que o carro fique 100% sobre o asfalto da rota e nunca dentro de casas ou calçadas
  const displayVehiclePos = useMemo(() => {
    return snapPointToRoute(currentPos, routeCoordinates, 150);
  }, [currentPos.lat, currentPos.lng, currentPos.heading, routeCoordinates]);

  // Atualiza rotação do ícone diretamente no elemento DOM existente para nunca recriar nem piscar a imagem
  useEffect(() => {
    const el = carMarkerRef.current?.getElement();
    if (!el) return;
    const img = el.querySelector('.up-vehicle-icon-img') as HTMLElement | null;
    if (img) {
      img.style.transform = `rotate(${displayVehiclePos.heading || 0}deg)`;
    }
  }, [displayVehiclePos.heading, displayVehiclePos.lat, displayVehiclePos.lng, isOpen]);

  const cleanPhone = (ride.clientPhone || '').replace(/\D/g, '');
  const whatsappUrl = `https://wa.me/55${cleanPhone}?text=Ol%C3%A1%20${encodeURIComponent(ride.clientName)},%20sou%20seu%20motorista%20da%20Kavro%20Drive%20e%20estou%20no%20GPS%20a%20caminho%20da%20sua%20corrida%20${encodeURIComponent(String(ride.rideCode || ride.id).replace(/^#?\s*UP\b/i, '#KV'))}.`;

  // Atualiza cálculo em tempo real de metros até o cliente, metros até o destino e ETA em segundos
  useEffect(() => {
    if (!hasRealTelemetry) {
      setEtaSecondsLeft(0);
      return;
    }

    const clientTargetLat = clientPos?.lat || liveRide.origin.lat;
    const clientTargetLng = clientPos?.lng || liveRide.origin.lng;

    let calcMetersClient = 0;
    if (clientTargetLat && clientTargetLng && currentPos.lat && currentPos.lng) {
      const dClientKm = calculateHaversineDistance(currentPos.lat, currentPos.lng, clientTargetLat, clientTargetLng);
      calcMetersClient = Math.max(0, Math.round(dClientKm * 1000));
      setMetersToClient(calcMetersClient);
    }

    let calcMetersDest = 0;
    if (liveRide.destination?.lat && liveRide.destination?.lng && currentPos.lat && currentPos.lng) {
      const dDestKm = calculateHaversineDistance(currentPos.lat, currentPos.lng, liveRide.destination.lat, liveRide.destination.lng);
      calcMetersDest = Math.max(0, Math.round(dDestKm * 1000));
      setMetersToDestination(calcMetersDest);
    }

    const isHeadingToPickup = (rideStatus === 'a_caminho' || rideStatus === 'confirmada' || rideStatus === 'na_fila') && calcMetersClient > 35;
    const activeMeters = isHeadingToPickup ? calcMetersClient : calcMetersDest;

    // Velocidade efetiva em m/s (usa velocidade real do GPS se > 6 km/h, senão média urbana 36 km/h = 10 m/s)
    const effectiveSpeedMs = speed >= 6 ? speed / 3.6 : 10;
    const rawSeconds = activeMeters <= 25 ? 0 : Math.max(15, Math.round(activeMeters / effectiveSpeedMs));
    setEtaSecondsLeft(rawSeconds);
  }, [
    hasRealTelemetry,
    currentPos.lat,
    currentPos.lng,
    clientPos?.lat,
    clientPos?.lng,
    speed,
    rideStatus,
    liveRide.origin.lat,
    liveRide.origin.lng,
    liveRide.destination.lat,
    liveRide.destination.lng
  ]);

  // Cronômetro regressivo em tempo real (ticking a cada 1 segundo apenas quando há telemetria real)
  useEffect(() => {
    if (!isOpen || !hasRealTelemetry) return;
    const timer = setInterval(() => {
      setEtaSecondsLeft(prev => (prev > 1 ? prev - 1 : prev));
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, hasRealTelemetry]);

  const formatTimerMmSs = (totalSec: number) => {
    if (totalSec <= 0) return '00:00';
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const mm = String(mins).padStart(2, '0');
    const ss = String(secs).padStart(2, '0');
    return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  const arrivalClockStr = useMemo(() => {
    const arrival = new Date(Date.now() + etaSecondsLeft * 1000);
    return arrival.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }, [Math.floor(etaSecondsLeft / 15)]);

  // 1. Obter rota real da malha viária via OSRM público
  useEffect(() => {
    let isCancelled = false;

    async function loadRoute() {
      const origLat = liveRide.origin.lat;
      const origLng = liveRide.origin.lng;
      const destLat = liveRide.destination.lat;
      const destLng = liveRide.destination.lng;

      if (!origLat || !origLng || !destLat || !destLng) return;

      try {
        const waypoints =
          (rideStatus === 'a_caminho' || rideStatus === 'confirmada') &&
          currentPos.lat &&
          currentPos.lng &&
          calculateHaversineDistance(currentPos.lat, currentPos.lng, origLat, origLng) > 0.08
            ? `${currentPos.lng},${currentPos.lat};${origLng},${origLat};${destLng},${destLat}`
            : `${origLng},${origLat};${destLng},${destLat}`;

        const url = `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson&steps=true`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const coords = data.routes?.[0]?.geometry?.coordinates;
          if (coords && coords.length > 0 && !isCancelled) {
            const leafletCoords: [number, number][] = coords.map((c: [number, number]) => [c[1], c[0]]);
            setRouteCoordinates(leafletCoords);

            // Extrai as etapas com manobras para a navegação por voz
            const extractedSteps: RouteStep[] = [];
            if (data.routes?.[0]?.legs) {
              for (const leg of data.routes[0].legs) {
                if (Array.isArray(leg.steps)) {
                  for (const s of leg.steps) {
                    extractedSteps.push(translateOsrmStep(s));
                  }
                }
              }
            }
            if (extractedSteps.length > 0) {
              setNavigationSteps(extractedSteps);
              setCurrentStepIndex(0);
              if (isDriver && voiceEnabled && !spokenStepsRef.current.has('route-start')) {
                spokenStepsRef.current.add('route-start');
                const first = extractedSteps[0];
                speakVoiceInstruction(
                  first?.instruction || 'Iniciando rota rumo ao destino. Siga em frente.',
                  voiceEnabled
                );
              }
            }
            return;
          }
        }
      } catch (err) {
        console.warn('OSRM routing fallback used:', err);
      }

      if (!isCancelled) {
        setRouteCoordinates([
          [origLat, origLng],
          [destLat, destLng],
        ]);
      }
    }

    loadRoute();
    return () => { isCancelled = true; };
  }, [liveRide.origin.lat, liveRide.origin.lng, liveRide.destination.lat, liveRide.destination.lng, rideStatus, gpsFixed]);

  // Passo ativo da rota para HUD e áudio
  const activeStep = navigationSteps[currentStepIndex] || null;

  const metersToNextManeuver = useMemo(() => {
    if (!activeStep || !activeStep.location[0] || !currentPos.lat || !currentPos.lng) return 0;
    const dKm = calculateHaversineDistance(
      currentPos.lat,
      currentPos.lng,
      activeStep.location[0],
      activeStep.location[1]
    );
    return Math.max(0, Math.round(dKm * 1000));
  }, [activeStep, currentPos.lat, currentPos.lng]);

  // Disparo automático e inteligente das instruções por voz turn-by-turn do motorista
  useEffect(() => {
    if (!isOpen || !isDriver || !activeStep) return;

    // Se já passou da manobra (< 30m), avança para a próxima etapa da rota
    if (metersToNextManeuver <= 30 && currentStepIndex < navigationSteps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
      return;
    }

    // 1. Aviso antecipado (em ~200m)
    const earlyKey = `step-${currentStepIndex}-200m`;
    if (metersToNextManeuver >= 150 && metersToNextManeuver <= 250 && !spokenStepsRef.current.has(earlyKey)) {
      spokenStepsRef.current.add(earlyKey);
      const text = `Em duzentos metros, ${activeStep.shortText.toLowerCase()}${activeStep.streetName ? ' na ' + activeStep.streetName : ''}`;
      speakVoiceInstruction(text, voiceEnabled);
    }

    // 2. Aviso imediato no ponto de virar (< 45m)
    const turnKey = `step-${currentStepIndex}-now`;
    if (metersToNextManeuver <= 45 && metersToNextManeuver > 15 && !spokenStepsRef.current.has(turnKey)) {
      spokenStepsRef.current.add(turnKey);
      speakVoiceInstruction(activeStep.instruction, voiceEnabled);
    }

    // 3. Aviso ao chegar no destino final (< 60m)
    if (metersToDestination <= 60 && !spokenStepsRef.current.has('dest-arrive')) {
      spokenStepsRef.current.add('dest-arrive');
      speakVoiceInstruction('Você está chegando ao destino.', voiceEnabled);
    }
  }, [isOpen, isDriver, metersToNextManeuver, metersToDestination, currentStepIndex, activeStep, voiceEnabled, navigationSteps.length]);

  const driverDisplayName = liveRide.driverName || 'Motorista Parceiro';
  const driverPhoneRaw = liveRide.driverPhone || '';
  const driverPhoneClean = getCleanWhatsappNumber(driverPhoneRaw);
  const supportPhoneClean = getCleanWhatsappNumber(config.companyWhatsapp);

  // Função oficial para o cliente compartilhar o link público de rastreamento com a família via WhatsApp ou nativo
  const handleShareWithFamily = () => {
    const destAddr = liveRide.destination.address || 'Destino';
    const trackingUrl = `${window.location.origin}/viagem/${encodeURIComponent(liveRide.id)}`;
    const vehicleText = liveRide.driverVehicle ? ` (${liveRide.driverVehicle}${liveRide.driverPlate ? ` • Placa ${liveRide.driverPlate}` : ''})` : '';
    const driverText = hasAssignedDriver ? ` com o motorista ${driverDisplayName}${vehicleText}` : '';
    const text = `🚗 *Kavro Drive - Acompanhamento de Viagem*\n\nEstou em viagem${driverText} rumo a *${destAddr}*.\n\nAcompanhe minha localização e rota em tempo real por este link seguro:\n${trackingUrl}`;

    if (navigator.share) {
      navigator.share({
        title: `Viagem ${liveRide.id} - Kavro Drive`,
        text: text,
        url: trackingUrl
      }).catch(() => {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
      });
    } else {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  const renderManeuverIcon = (modifier?: string, type?: string) => {
    if (modifier?.includes('right')) return <CornerUpRight size={18} color="#121A21" strokeWidth={2.6} />;
    if (modifier?.includes('left')) return <CornerUpLeft size={18} color="#121A21" strokeWidth={2.6} />;
    if (type?.includes('roundabout') || type?.includes('rotary') || modifier?.includes('rotary')) {
      return <RotateCw size={18} color="#121A21" strokeWidth={2.6} />;
    }
    return <ArrowUp size={18} color="#121A21" strokeWidth={2.6} />;
  };

  // Helpers para atualizar posição apenas quando houver mudança real (evita re-renders desnecessários)
  const updateDriverPosIfChanged = (newLat: number, newLng: number, newHeading: number) => {
    setCurrentPos((prev) => {
      if (
        Math.abs(prev.lat - newLat) < 0.000003 &&
        Math.abs(prev.lng - newLng) < 0.000003 &&
        Math.abs((prev.heading || 0) - (newHeading || 0)) < 2
      ) {
        return prev;
      }
      return { lat: newLat, lng: newLng, heading: newHeading };
    });
  };

  const updateClientPosIfChanged = (newLat: number, newLng: number) => {
    setClientPos((prev) => {
      if (prev && Math.abs(prev.lat - newLat) < 0.000003 && Math.abs(prev.lng - newLng) < 0.000003) {
        return prev;
      }
      return { lat: newLat, lng: newLng };
    });
  };

  // 2. GPS REAL + SINCRONIZAÇÃO BIDIRECIONAL EM TEMPO REAL (Motorista <-> Passageiro via Supabase)
  useEffect(() => {
    if (!isOpen) return;

    let watchId: number | null = null;

    if (isDriver) {
      // MOTORISTA: Captura GPS físico real do aparelho (sem andar sozinho!)
      const publishDriverGps = (pos: GeolocationPosition) => {
        const newLat = pos.coords.latitude;
        const newLng = pos.coords.longitude;
        const newHeading =
          typeof pos.coords.heading === 'number' && !Number.isNaN(pos.coords.heading)
            ? Math.round(pos.coords.heading)
            : latestDriverPosRef.current.heading || 0;
        // Só mostra velocidade > 0 se realmente estiver em movimento (> 0.6 m/s ≈ 2 km/h)
        const rawSpeedMs = pos.coords.speed || 0;
        const newSpeed = rawSpeedMs > 0.6 ? Math.round(rawSpeedMs * 3.6) : 0;

        updateDriverPosIfChanged(newLat, newLng, newHeading);
        setSpeed(newSpeed);
        setGpsFixed(true);

        StorageService.updateRideDriverLocation(ride.id, {
          lat: newLat,
          lng: newLng,
          heading: newHeading,
          speedKmH: newSpeed
        });
      };

      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(publishDriverGps, () => {}, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });

        watchId = navigator.geolocation.watchPosition(
          publishDriverGps,
          (err) => console.warn('GPS Real Motorista warning:', err),
          { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
        );
      }

      // Heartbeat a cada 1.5s: envia posição atual do motorista e busca posição ao vivo do passageiro
      const syncInterval = setInterval(async () => {
        StorageService.updateRideDriverLocation(ride.id, {
          lat: latestDriverPosRef.current.lat,
          lng: latestDriverPosRef.current.lng,
          heading: latestDriverPosRef.current.heading,
          speedKmH: latestSpeedRef.current
        });
        const live = await StorageService.fetchRideLiveLocation(ride.id);
        if (live?.clientLocation?.lat && live?.clientLocation?.lng) {
          updateClientPosIfChanged(live.clientLocation.lat, live.clientLocation.lng);
        }
        if (live?.status && live.status !== rideStatus) {
          setRideStatus(live.status);
          if (onUpdateStatus) onUpdateStatus(ride.id, live.status);
          window.dispatchEvent(new CustomEvent('up_rides_updated', { detail: { rideId: ride.id, status: live.status } }));

          if (!isDriver && (live.status === 'finalizada' || live.status === 'cancelada') && !hasAutoClosedRef.current) {
            hasAutoClosedRef.current = true;
            setClosingNotice(
              live.status === 'finalizada'
                ? '🏁 Corrida finalizada com sucesso! Seu destino foi alcançado.'
                : '❌ Corrida cancelada pelo motorista.'
            );
            StorageService.syncFromDatabase().catch(() => {});
            setTimeout(() => {
              onClose();
            }, 1800);
          }
        }
      }, 1500);

      const handleClientLocEvent = (e: any) => {
        if (e.detail?.rideId === ride.id && e.detail?.location?.lat) {
          updateClientPosIfChanged(e.detail.location.lat, e.detail.location.lng);
        }
      };
      const syncDriverRideFromStore = () => {
        const refreshed = StorageService.getRides().find(r => r.id === ride.id);
        if (refreshed) {
          setLiveRide(refreshed);
        }
      };
      window.addEventListener('up_client_location_update', handleClientLocEvent);
      window.addEventListener('up_rides_updated', syncDriverRideFromStore);
      window.addEventListener('up_database_synced', syncDriverRideFromStore);

      return () => {
        if (watchId !== null && 'geolocation' in navigator) {
          navigator.geolocation.clearWatch(watchId);
        }
        clearInterval(syncInterval);
        window.removeEventListener('up_client_location_update', handleClientLocEvent);
        window.removeEventListener('up_rides_updated', syncDriverRideFromStore);
        window.removeEventListener('up_database_synced', syncDriverRideFromStore);
      };
    } else {
      // CLIENTE / PASSAGEIRO: Recebe em tempo real a posição do motorista do banco Supabase + envia sua posição
      const pullDriverLocation = async () => {
        const live = await StorageService.fetchRideLiveLocation(ride.id);
        if (live?.driverLocation?.lat && live?.driverLocation?.lng) {
          updateDriverPosIfChanged(
            live.driverLocation.lat,
            live.driverLocation.lng,
            live.driverLocation.heading || 0
          );
          setSpeed(live.driverLocation.speedKmH || 0);
          setGpsFixed(true);
        }
        if (live?.status && live.status !== rideStatus) {
          setRideStatus(live.status);
          StorageService.syncFromDatabase().then(() => {
            const refreshed = StorageService.getRides().find(r => r.id === ride.id);
            if (refreshed) setLiveRide(refreshed);
          }).catch(() => {});
          if (onUpdateStatus) onUpdateStatus(ride.id, live.status);
          window.dispatchEvent(new CustomEvent('up_rides_updated', { detail: { rideId: ride.id, status: live.status } }));

          if (!isDriver && (live.status === 'finalizada' || live.status === 'cancelada') && !hasAutoClosedRef.current) {
            hasAutoClosedRef.current = true;
            setClosingNotice(
              live.status === 'finalizada'
                ? '🏁 Corrida finalizada com sucesso! Seu destino foi alcançado.'
                : '❌ Corrida cancelada.'
            );
            StorageService.syncFromDatabase().catch(() => {});
            setTimeout(() => {
              onClose();
            }, 1800);
          }
        }
      };

      const syncFromLocalRides = () => {
        const refreshed = StorageService.getRides().find(r => r.id === ride.id);
        if (refreshed) {
          setLiveRide(refreshed);
          setRideStatus(refreshed.status);
        }
      };
      window.addEventListener('up_rides_updated', syncFromLocalRides);
      window.addEventListener('up_database_synced', syncFromLocalRides);

      pullDriverLocation();
      const pollInterval = setInterval(pullDriverLocation, 1500);

      // Também envia a geolocalização real do passageiro para o motorista visualizar no mapa
      if ('geolocation' in navigator) {
        const publishClientGps = (pos: GeolocationPosition) => {
          const cLat = pos.coords.latitude;
          const cLng = pos.coords.longitude;
          updateClientPosIfChanged(cLat, cLng);
          StorageService.updateRideClientLocation(ride.id, {
            lat: cLat,
            lng: cLng,
            heading: pos.coords.heading || 0,
            speedKmH: pos.coords.speed && pos.coords.speed > 0.6 ? Math.round(pos.coords.speed * 3.6) : 0
          });
        };

        navigator.geolocation.getCurrentPosition(publishClientGps, () => {}, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        });

        watchId = navigator.geolocation.watchPosition(
          publishClientGps,
          () => {},
          { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
        );
      }

      const handleDriverLocEvent = (e: any) => {
        if (e.detail?.rideId === ride.id && e.detail?.location?.lat) {
          updateDriverPosIfChanged(
            e.detail.location.lat,
            e.detail.location.lng,
            e.detail.location.heading || 0
          );
          setSpeed(e.detail.location.speedKmH || 0);
          setGpsFixed(true);
        }
      };
      const handleRealtimeGps = (e: Event) => {
        const detail = (e as CustomEvent)?.detail;
        if (!detail || detail.rideId !== ride.id) return;
        if (detail.driverLocation?.lat) {
          updateDriverPosIfChanged(
            detail.driverLocation.lat,
            detail.driverLocation.lng,
            detail.driverLocation.heading || 0
          );
          setSpeed(detail.driverLocation.speedKmH || 0);
          setGpsFixed(true);
        }
        if (detail.status && detail.status !== rideStatus) {
          setRideStatus(detail.status);
        }
      };

      window.addEventListener('up_driver_location_update', handleDriverLocEvent);
      window.addEventListener('up_realtime_gps', handleRealtimeGps);

      return () => {
        clearInterval(pollInterval);
        if (watchId !== null && 'geolocation' in navigator) {
          navigator.geolocation.clearWatch(watchId);
        }
        window.removeEventListener('up_driver_location_update', handleDriverLocEvent);
        window.removeEventListener('up_realtime_gps', handleRealtimeGps);
        window.removeEventListener('up_rides_updated', syncFromLocalRides);
        window.removeEventListener('up_database_synced', syncFromLocalRides);
      };
    }
  }, [isOpen, isDriver, ride.id]);

  // Limites do mapa (inclui carro apenas quando houver motorista/GPS real)
  const mapBounds: [[number, number], [number, number]] = useMemo(() => {
    const lats = [liveRide.origin.lat, liveRide.destination.lat];
    const lngs = [liveRide.origin.lng, liveRide.destination.lng];
    if (showCarMarker && currentPos.lat && currentPos.lng) {
      lats.push(currentPos.lat);
      lngs.push(currentPos.lng);
    }
    return [
      [Math.min(...lats) - 0.005, Math.min(...lngs) - 0.005],
      [Math.max(...lats) + 0.005, Math.max(...lngs) + 0.005]
    ];
  }, [liveRide.origin.lat, liveRide.origin.lng, liveRide.destination.lat, liveRide.destination.lng, showCarMarker, currentPos.lat, currentPos.lng]);

  if (!isOpen) return null;

  const handleAdvanceStatus = (newStatus: RideStatus) => {
    setRideStatus(newStatus);
    if (onUpdateStatus) {
      onUpdateStatus(ride.id, newStatus);
    }
  };

  return createPortal(
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 10000,
      backgroundColor: '#121A21',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Aviso de Encerramento Automático do GPS ao finalizar a corrida na tela do cliente */}
      {closingNotice && (
        <div style={{
          position: 'absolute',
          top: 'calc(18px + env(safe-area-inset-top, 0px))',
          left: 16,
          right: 16,
          zIndex: 10005,
          backgroundColor: 'rgba(18, 26, 33, 0.96)',
          border: '2px solid #76D800',
          borderRadius: 18,
          padding: '16px 20px',
          color: '#FFFFFF',
          textAlign: 'center',
          boxShadow: '0 10px 35px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>🎉</div>
          <div style={{ fontSize: '1.02rem', fontWeight: 800, color: '#76D800', marginBottom: 4 }}>
            {rideStatus === 'finalizada' ? 'Viagem Finalizada com Sucesso!' : 'Corrida Cancelada'}
          </div>
          <div style={{ fontSize: '0.84rem', color: '#E2E8F0', lineHeight: 1.35 }}>
            {closingNotice}
          </div>
          <div style={{ fontSize: '0.74rem', color: '#94A3B8', marginTop: 8, fontWeight: 600 }}>
            Fechando tela do GPS automaticamente...
          </div>
        </div>
      )}

      {/* ── OVERLAY SUPERIOR UNIFICADO: HUD DE NAVEGAÇÃO + BOTÕES LATERAIS ABAIXO (SEM SOBREPOSIÇÃO) ────── */}
      <div style={{
        position: 'absolute',
        top: 'calc(10px + env(safe-area-inset-top, 0px))',
        left: 12,
        right: 12,
        zIndex: 10002,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 10,
        pointerEvents: 'none'
      }}>
        {/* Barra Superior HUD de Navegação Estilo Uber Turn-by-Turn (exclusiva do motorista; passageiro vê controles limpos no mapa) */}
        {isDriver ? (
          <div style={{
            width: '100%',
            backgroundColor: '#141414',
            borderRadius: 16,
            padding: '10px 14px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.42)',
            border: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#FFFFFF',
            pointerEvents: 'auto',
            boxSizing: 'border-box'
          }}>
            {/* Próxima Instrução */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: '#276EF1',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                flexShrink: 0
              }}>
                <Navigation size={17} style={{ transform: 'rotate(25deg)' }} />
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    className={
                      isWaitingDriver
                        ? 'kavro-beacon-amber'
                        : hasRealTelemetry
                          ? 'kavro-beacon-green'
                          : undefined
                    }
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: isWaitingDriver ? '50%' : 2,
                      backgroundColor: isWaitingDriver
                        ? '#F59E0B'
                        : rideStatus === 'em_andamento'
                          ? '#EF4444'
                          : '#16A34A',
                      flexShrink: 0
                    }}
                  />
                  <span style={{ fontSize: '0.68rem', color: '#D1D5DB', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    {isWaitingDriver
                      ? (rideStatus === 'aguardando_pagamento' ? 'Aguardando pagamento PIX' : 'Procurando motorista')
                      : rideStatus === 'na_fila'
                        ? 'Motorista na fila'
                        : rideStatus === 'no_local'
                          ? 'Motorista no local'
                          : rideStatus === 'a_caminho' || rideStatus === 'confirmada'
                            ? 'Perto do embarque'
                            : 'Destino final'}
                  </span>
                  <span style={{
                    backgroundColor: 'rgba(255,255,255,0.12)',
                    color: '#FFFFFF',
                    fontSize: '0.66rem',
                    fontWeight: 800,
                    padding: '2px 7px',
                    borderRadius: 999,
                    fontVariantNumeric: 'tabular-nums'
                  }}>
                    {isWaitingDriver
                      ? 'Aguardando aceite'
                      : hasRealTelemetry
                        ? formatTimerMmSs(etaSecondsLeft)
                        : 'Calculando...'}
                  </span>
                </div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>
                  {isWaitingDriver
                    ? liveRide.destination.address
                    : rideStatus === 'a_caminho' || rideStatus === 'confirmada' || rideStatus === 'no_local'
                      ? liveRide.origin.address
                      : liveRide.destination.address}
                </div>
              </div>
            </div>

            {/* Botão Fechar HUD */}
            <button
              onClick={onClose}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: '50%',
                width: 30,
                height: 30,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                cursor: 'pointer',
                marginLeft: 8,
                flexShrink: 0
              }}
              title="Fechar tela do GPS"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pointerEvents: 'none'
          }}>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar tela do GPS"
              title="Fechar tela do GPS"
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
                boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
                cursor: 'pointer',
                pointerEvents: 'auto'
              }}
            >
              <X size={20} />
            </button>
          </div>
        )}

        {/* ── BANNER TURN-BY-TURN ESTILO UBER DRIVER (COM CONTROLE DE VOZ) ── */}
        {isDriver && activeStep && (
          <div style={{
            width: '100%',
            backgroundColor: '#141414',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 14,
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            color: '#FFFFFF',
            boxShadow: '0 8px 22px rgba(0,0,0,0.38)',
            pointerEvents: 'auto',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                backgroundColor: '#1F2937',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                {renderManeuverIcon(activeStep.modifier, activeStep.type)}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '1.02rem', fontWeight: 900, color: '#FFFFFF', lineHeight: 1.15 }}>
                  {metersToNextManeuver > 0 ? (metersToNextManeuver < 1000 ? `${metersToNextManeuver} m` : `${(metersToNextManeuver / 1000).toFixed(1)} km`) : 'Siga em frente'}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#E5E7EB', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>
                  {activeStep.instruction}
                </div>
              </div>
            </div>

            {/* Alternador de Voz (Ligar / Desligar Voz de Navegação) */}
            <button
              type="button"
              onClick={() => {
                setVoiceEnabled(v => {
                  const next = !v;
                  try { localStorage.setItem('up_gps_voice_enabled', String(next)); } catch { /* noop */ }
                  if (!next) stopVoiceSpeech();
                  return next;
                });
              }}
              style={{
                height: 32,
                padding: '0 9px',
                borderRadius: 9,
                backgroundColor: voiceEnabled ? 'rgba(118, 216, 0, 0.22)' : 'rgba(255, 255, 255, 0.08)',
                border: voiceEnabled ? '1.5px solid #76D800' : '1px solid #475569',
                color: voiceEnabled ? '#76D800' : '#94A3B8',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: '0.72rem',
                fontWeight: 800,
                cursor: 'pointer',
                flexShrink: 0
              }}
              title={voiceEnabled ? 'Instruções por voz ativadas (Toque para mutar)' : 'Voz desativada (Toque para ativar)'}
            >
              {voiceEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
              <span>{voiceEnabled ? 'Voz' : 'Mudo'}</span>
            </button>
          </div>
        )}

        {/* Botões Flutuantes Laterais (Sempre abaixo do card superior, nunca ocultos) */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
          pointerEvents: 'auto'
        }}>
          {/* Recentrar no Carro */}
          <button
            onClick={() => setFollowMode(true)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 11,
              backgroundColor: followMode ? '#76D800' : 'rgba(18, 26, 33, 0.92)',
              color: followMode ? '#121A21' : '#FFFFFF',
              border: '1px solid #2C3E50',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 3px 10px rgba(0,0,0,0.3)',
              cursor: 'pointer'
            }}
            title={followMode ? 'Seguindo veículo' : 'Recentrar no veículo'}
          >
            <Locate size={17} />
          </button>

          {/* Alternar Rota Inteira */}
          <button
            onClick={() => setFollowMode(false)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 11,
              backgroundColor: !followMode ? '#76D800' : 'rgba(18, 26, 33, 0.92)',
              color: !followMode ? '#121A21' : '#FFFFFF',
              border: '1px solid #2C3E50',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 3px 10px rgba(0,0,0,0.3)',
              cursor: 'pointer'
            }}
            title="Ver trajeto completo"
          >
            <Compass size={17} />
          </button>

          {/* Alternar Mapa de Ruas / Satélite Híbrido */}
          <button
            onClick={() => setMapLayer(prev => (prev === 'streets' ? 'hybrid' : 'streets'))}
            style={{
              width: 36,
              height: 36,
              borderRadius: 11,
              backgroundColor: mapLayer === 'hybrid' ? '#76D800' : 'rgba(18, 26, 33, 0.92)',
              color: mapLayer === 'hybrid' ? '#121A21' : '#FFFFFF',
              border: '1px solid #2C3E50',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 3px 10px rgba(0,0,0,0.3)',
              cursor: 'pointer',
              fontSize: '0.95rem'
            }}
            title="Alternar Ruas / Satélite"
          >
            🛰️
          </button>

          {/* Botão de Emergência SOS (somente após embarque: em_andamento) */}
          {rideStatus === 'em_andamento' && (
            <button
              type="button"
              onClick={() => setIsSosModalOpen(true)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 11,
                backgroundColor: '#DC2626',
                color: '#FFFFFF',
                border: '2px solid #FCA5A5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(220, 38, 38, 0.5)',
                cursor: 'pointer',
                fontWeight: 900,
                fontSize: '0.68rem',
                letterSpacing: '0.04em'
              }}
              title="Emergência SOS (Polícia 190, SAMU 192, Bombeiros 193)"
            >
              SOS
            </button>
          )}
        </div>
      </div>

      {/* ── MAPA LEAFLET EM TELA CHEIA ────── */}
      <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative' }}>
        <MapContainer
          center={[currentPos.lat, currentPos.lng]}
          zoom={16}
          style={{ width: '100%', height: '100%', zIndex: 1 }}
          zoomControl={false}
        >
          <TileLayer
            key={mapLayer}
            url={
              mapLayer === 'hybrid'
                ? 'https://{s}.google.com/vt/lyrs=y&hl=pt-BR&x={x}&y={y}&z={z}'
                : 'https://{s}.google.com/vt/lyrs=m&hl=pt-BR&x={x}&y={y}&z={z}'
            }
            subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
            maxZoom={20}
            attribution="&copy; Google Maps"
          />

          <MapFollowController
            center={[displayVehiclePos.lat, displayVehiclePos.lng]}
            followMode={followMode}
            bounds={mapBounds}
          />

          {/* Linha do Trajeto estilo Uber (Preto crisp p/ motorista | Azul vibrante p/ cliente) */}
          {routeCoordinates.length > 0 && (
            <>
              <Polyline
                positions={routeCoordinates}
                pathOptions={{ color: isDriver ? '#000000' : '#0F172A', weight: isDriver ? 7.5 : 8, opacity: isDriver ? 0.92 : 0.6 }}
              />
              {!isDriver && (
                <Polyline
                  positions={routeCoordinates}
                  pathOptions={{ color: '#276EF1', weight: 5, opacity: 0.96 }}
                />
              )}
            </>
          )}

          {/* Marcador do Ponto de Embarque (com ondas radar quando aguardando motorista) */}
          {liveRide.origin.lat && liveRide.origin.lng && (
            <Marker
              position={[liveRide.origin.lat, liveRide.origin.lng]}
              icon={isWaitingDriver ? PICKUP_SEARCH_ICON : PICKUP_ICON}
            />
          )}

          {/* Marcador do Ponto de Destino */}
          {liveRide.destination.lat && liveRide.destination.lng && (
            <Marker
              position={[liveRide.destination.lat, liveRide.destination.lng]}
              icon={DESTINATION_ICON}
            />
          )}

          {/* Marcador ao Vivo do Passageiro (quando disponível) */}
          {clientPos && (
            <Marker
              position={[clientPos.lat, clientPos.lng]}
              icon={CLIENT_LIVE_ICON}
            />
          )}

          {/* Marcador do Veículo do Motorista (apenas quando motorista aceito e com GPS ou na visão do próprio motorista) */}
          {showCarMarker && (
            <Marker
              ref={carMarkerRef}
              position={[displayVehiclePos.lat, displayVehiclePos.lng]}
              icon={carIcon}
              eventHandlers={{
                add: (e) => {
                  const el = e.target.getElement?.();
                  const img = el?.querySelector?.('.up-vehicle-icon-img') as HTMLElement | null;
                  if (img) {
                    img.style.transform = `rotate(${displayVehiclePos.heading || 0}deg)`;
                  }
                }
              }}
            />
          )}
        </MapContainer>

        {/* ── VELOCÍMETRO / LIMITE ESTILO UBER (EXCLUSIVO MOTORISTA) ────── */}
        {isDriver && (
          <div style={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            zIndex: 10001,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <div style={{
              width: 44,
              backgroundColor: '#FFFFFF',
              padding: '5px 4px',
              borderRadius: 8,
              border: '2px solid #D1D5DB',
              boxShadow: '0 4px 12px rgba(0,0,0,0.22)',
              textAlign: 'center',
              color: '#111111'
            }}>
              <div style={{ fontSize: '1.02rem', fontWeight: 900, lineHeight: 1 }}>{speed > 0 ? speed : 30}</div>
              <div style={{ fontSize: '0.52rem', fontWeight: 800, marginTop: 1 }}>{speed > 0 ? 'KM/H' : 'LIMITE'}</div>
            </div>
            <div style={{
              backgroundColor: 'rgba(20, 20, 20, 0.92)',
              padding: '5px 10px',
              borderRadius: 999,
              color: '#FFFFFF',
              fontSize: '0.66rem',
              fontWeight: 700,
              boxShadow: '0 4px 12px rgba(0,0,0,0.22)'
            }}>
              {gpsFixed ? '● GPS Ao Vivo' : 'Conectando...'}
            </div>
          </div>
        )}
      </div>

      {/* ── PAINEL DE CONTROLE INFERIOR ULTRA-COMPACTO (MOTORISTA & CLIENTE) ────── */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '18px 18px 0 0',
        padding: '12px 14px calc(12px + env(safe-area-inset-bottom, 0px)) 14px',
        boxShadow: '0 -6px 24px rgba(0,0,0,0.18)',
        zIndex: 10002,
        maxWidth: 540,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        {isWaitingDriver ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '1.08rem', fontWeight: 900, color: '#0F172A', lineHeight: 1.2 }}>
                  {rideStatus === 'aguardando_pagamento' ? 'Aguardando pagamento PIX' : 'Procurando motorista...'}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600, marginTop: 2 }}>
                  Nenhum motorista aceitou ainda — assim que aceitar você verá nome, placa e GPS em tempo real.
                </div>
              </div>
              <div style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: 10,
                padding: '5px 9px',
                textAlign: 'right',
                flexShrink: 0
              }}>
                <div style={{ fontSize: '0.56rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Valor</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 900, color: '#0F172A' }}>
                  R$ {liveRide.totalPrice.toFixed(2).replace('.', ',')}
                </div>
              </div>
            </div>

            <RideSearchingStageCard
              status={rideStatus}
              onlineDriversCount={StorageService.getOnlineDriversCount()}
              compact
            />

            <div style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: 12,
              padding: '8px 10px',
              marginBottom: 10,
              fontSize: '0.76rem',
              display: 'flex',
              flexDirection: 'column',
              gap: 5
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#16A34A', flexShrink: 0 }} />
                <span style={{ color: '#0F172A', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {liveRide.origin.address}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: '#0F172A', flexShrink: 0 }} />
                <span style={{ color: '#0F172A', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {liveRide.destination.address}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  width: '100%',
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: '#111111',
                  color: '#FFFFFF',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Fechar tela
              </button>
              {!isDriver && canPassengerCancelRide(liveRide) && (
                <button
                  type="button"
                  onClick={() => setIsCancelModalOpen(true)}
                  style={{
                    width: '100%',
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: '#FEF2F2',
                    color: '#DC2626',
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    border: '1px solid #FECACA',
                    cursor: 'pointer'
                  }}
                >
                  Cancelar solicitação
                </button>
              )}
            </div>
          </div>
        ) : isDriver ? (
          <div>
            <div
              onClick={() => setIsDriverHudExpanded(v => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  backgroundColor: '#121A21',
                  color: '#76D800',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '0.78rem',
                  flexShrink: 0
                }}>
                  {liveRide.clientName ? liveRide.clientName.charAt(0).toUpperCase() : 'C'}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {liveRide.clientName}
                    </span>
                    <span style={{
                      backgroundColor: rideStatus === 'em_andamento' ? '#DCFCE7' : '#DBEAFE',
                      color: rideStatus === 'em_andamento' ? '#15803D' : '#1D4ED8',
                      padding: '2px 6px',
                      borderRadius: 999,
                      fontSize: '0.58rem',
                      fontWeight: 800,
                      flexShrink: 0
                    }}>
                      {rideStatus === 'na_fila'
                        ? 'Na Fila'
                        : rideStatus === 'no_local'
                          ? 'No Local'
                          : rideStatus === 'a_caminho' || rideStatus === 'confirmada'
                            ? 'A Caminho'
                            : 'Em Viagem'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {hasRealTelemetry ? `${formatTimerMmSs(etaSecondsLeft)} (~${arrivalClockStr})` : `${liveRide.durationMin || 5} min`}
                    {' • '}
                    {hasRealTelemetry
                      ? (metersToDestination < 1000
                          ? `${metersToDestination} m`
                          : `${(metersToDestination / 1000).toFixed(1).replace('.', ',')} km`)
                      : `${liveRide.distanceKm.toFixed(1).replace('.', ',')} km`}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDriverHudExpanded(v => !v);
                }}
                style={{
                  height: 30,
                  padding: '0 10px',
                  borderRadius: 999,
                  backgroundColor: isDriverHudExpanded ? '#111111' : '#F1F5F9',
                  color: isDriverHudExpanded ? '#FFFFFF' : '#0F172A',
                  border: '1px solid #E2E8F0',
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                {isDriverHudExpanded ? 'Ocultar' : 'Opções'}
              </button>
            </div>

            {isDriverHudExpanded && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: '0.74rem', color: '#475569', fontWeight: 700 }}>
                    {formatPhone(liveRide.clientPhone)} • <span style={{ color: '#15803D', fontWeight: 900 }}>R$ {liveRide.totalPrice.toFixed(2).replace('.', ',')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="WhatsApp"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        backgroundColor: '#FFFFFF',
                        border: '1.5px solid #25D366',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textDecoration: 'none'
                      }}
                    >
                      <WhatsAppIcon size={15} />
                    </a>
                    <a
                      href={`tel:${cleanPhone}`}
                      title="Ligar"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        backgroundColor: '#121A21',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textDecoration: 'none'
                      }}
                    >
                      <Phone size={13} />
                    </a>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  <div style={{ backgroundColor: '#F8FAFC', borderRadius: 8, padding: '4px 6px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.54rem', color: '#64748B', fontWeight: 800 }}>CLIENTE</div>
                    <div style={{ fontSize: '0.76rem', fontWeight: 900, color: '#0F172A' }}>
                      {rideStatus === 'em_andamento' ? 'Embarcado' : rideStatus === 'no_local' ? 'No local' : metersToClient < 1000 ? `${metersToClient} m` : `${(metersToClient / 1000).toFixed(1).replace('.', ',')} km`}
                    </div>
                  </div>
                  <a
                    href={getGoogleMapsRouteUrl(ride.origin, ride.destination)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      borderRadius: 8,
                      backgroundColor: '#121A21',
                      color: '#FFFFFF',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      textDecoration: 'none'
                    }}
                  >
                    <ExternalLink size={12} color="#76D800" />
                    <span>Maps</span>
                  </a>
                  <button
                    type="button"
                    onClick={onClose}
                    style={{
                      borderRadius: 8,
                      backgroundColor: '#F1F5F9',
                      color: '#334155',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      border: '1px solid #CBD5E1',
                      cursor: 'pointer'
                    }}
                  >
                    Voltar
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {(rideStatus === 'confirmada' || rideStatus === 'a_caminho' || rideStatus === 'no_local') && (
                <button
                  type="button"
                  onClick={() => handleAdvanceStatus('em_andamento')}
                  className="btn-ios-primary"
                  style={{
                    flex: 1,
                    height: 38,
                    padding: '0 12px',
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    margin: 0
                  }}
                >
                  <Check size={15} />
                  <span>Passageiro Embarcou (Iniciar Viagem)</span>
                </button>
              )}

              {rideStatus === 'em_andamento' && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsCheckoutOpen(true)}
                    style={{
                      flex: 1,
                      height: 38,
                      backgroundColor: '#10B981',
                      color: '#ffffff',
                      borderRadius: 10,
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <CheckCircle2 size={15} />
                    <span>Finalizar (R$ {ride.totalPrice.toFixed(2).replace('.', ',')})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSosModalOpen(true)}
                    style={{
                      height: 38,
                      padding: '0 10px',
                      borderRadius: 10,
                      backgroundColor: '#DC2626',
                      color: '#FFFFFF',
                      fontSize: '0.74rem',
                      fontWeight: 900,
                      border: 'none',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                    title="Central de Emergência SOS"
                  >
                    SOS
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
        <>
        {/* Linha 1: Passageiro + Placa + WhatsApp/Ligar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
            {liveRide.driverPhoto ? (
              <img
                src={liveRide.driverPhoto}
                alt={driverDisplayName}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid #76D800',
                  flexShrink: 0
                }}
              />
            ) : (
              <div style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                backgroundColor: '#121A21',
                color: '#76D800',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '0.86rem',
                flexShrink: 0
              }}>
                {driverDisplayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {driverDisplayName}
                </span>
                <span style={{
                  backgroundColor: rideStatus === 'em_andamento' ? '#DCFCE7' : '#DBEAFE',
                  color: rideStatus === 'em_andamento' ? '#15803D' : '#1D4ED8',
                  padding: '2px 7px',
                  borderRadius: 999,
                  fontSize: '0.6rem',
                  fontWeight: 800,
                  flexShrink: 0
                }}>
                  {rideStatus === 'na_fila'
                    ? 'Na Fila'
                    : rideStatus === 'no_local'
                      ? 'No Local'
                      : rideStatus === 'a_caminho' || rideStatus === 'confirmada'
                        ? 'A Caminho'
                        : 'Em Viagem'}
                </span>
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {[
                  liveRide.driverVehicle || 'Veículo parceiro',
                  liveRide.driverCarColor,
                  liveRide.driverRating ? `★ ${Number(liveRide.driverRating).toFixed(2)}` : ''
                ].filter(Boolean).join(' • ')}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {liveRide.driverPlate ? (
              <MercosulPlateBadge plate={liveRide.driverPlate} size="sm" />
            ) : (
              <div style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: 8,
                padding: '3px 7px',
                textAlign: 'right'
              }}>
                <div style={{ fontSize: '0.54rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', lineHeight: 1 }}>
                  Valor
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 900, color: '#16A34A', lineHeight: 1.15 }}>
                  R$ {liveRide.totalPrice.toFixed(2).replace('.', ',')}
                </div>
              </div>
            )}

            <a
              href={`https://wa.me/55${driverPhoneClean || supportPhoneClean}`}
              target="_blank"
              rel="noopener noreferrer"
              title="WhatsApp"
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                backgroundColor: '#FFFFFF',
                border: '1.5px solid #25D366',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textDecoration: 'none'
              }}
            >
              <WhatsAppIcon size={17} />
            </a>

            <a
              href={`tel:${driverPhoneClean || supportPhoneClean}`}
              title="Ligar"
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                backgroundColor: '#121A21',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textDecoration: 'none'
              }}
            >
              <Phone size={14} />
            </a>
          </div>
        </div>

        {/* PIN de Embarque quando aguardando embarque */}
        {liveRide.boardingPin && (rideStatus === 'confirmada' || rideStatus === 'a_caminho' || rideStatus === 'no_local') && (
          <div style={{
            marginBottom: 8,
            padding: '7px 11px',
            borderRadius: 10,
            backgroundColor: '#EFF6FF',
            border: '1px solid #BFDBFE',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10
          }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1E40AF' }}>
              PIN de embarque para iniciar a viagem
            </span>
            <span style={{
              fontSize: '0.96rem',
              fontWeight: 900,
              letterSpacing: '0.18em',
              color: '#1E3A8A',
              backgroundColor: '#FFFFFF',
              padding: '3px 9px',
              borderRadius: 8,
              border: '1px solid #93C5FD',
              fontVariantNumeric: 'tabular-nums'
            }}>
              {liveRide.boardingPin}
            </span>
          </div>
        )}

        {/* Linha 2: Barra de Telemetria Slim */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 6,
          marginBottom: 8
        }}>
          <div style={{
            backgroundColor: '#121A21',
            borderRadius: 9,
            padding: '5px 6px',
            color: '#FFFFFF',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.54rem', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', lineHeight: 1 }}>
              {hasRealTelemetry ? `⏱ Tempo (~${arrivalClockStr})` : '⏱ Tempo estimado'}
            </div>
            <div style={{
              fontSize: '0.86rem',
              fontWeight: 900,
              color: '#76D800',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.2,
              marginTop: 2
            }}>
              {hasRealTelemetry ? formatTimerMmSs(etaSecondsLeft) : 'Calculando'}
            </div>
          </div>

          <div style={{
            backgroundColor: '#F8FAFC',
            borderRadius: 9,
            padding: '5px 6px',
            border: '1px solid #E2E8F0',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.54rem', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', lineHeight: 1 }}>
              📍 Até Você
            </div>
            <div style={{
              fontSize: '0.82rem',
              fontWeight: 900,
              color: '#0F172A',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.2,
              marginTop: 2
            }}>
              {rideStatus === 'em_andamento'
                ? 'Embarcado'
                : rideStatus === 'no_local'
                  ? 'No local'
                  : !hasRealTelemetry
                    ? 'A caminho'
                    : metersToClient <= 35
                      ? 'No local'
                      : metersToClient < 1000
                        ? `${metersToClient} m`
                        : `${(metersToClient / 1000).toFixed(1).replace('.', ',')} km`}
            </div>
          </div>

          <div style={{
            backgroundColor: '#F8FAFC',
            borderRadius: 9,
            padding: '5px 6px',
            border: '1px solid #E2E8F0',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.54rem', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', lineHeight: 1 }}>
              🏁 Destino
            </div>
            <div style={{
              fontSize: '0.82rem',
              fontWeight: 900,
              color: '#0F172A',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.2,
              marginTop: 2
            }}>
              {hasRealTelemetry
                ? (metersToDestination < 1000
                    ? `${metersToDestination} m`
                    : `${(metersToDestination / 1000).toFixed(1).replace('.', ',')} km`)
                : `${liveRide.distanceKm.toFixed(1).replace('.', ',')} km`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: '100%' }}>
            {/* Botão de Compartilhar Rota em Tempo Real com a Família / Amigos */}
            <button
              type="button"
              onClick={handleShareWithFamily}
              style={{
                height: 38,
                borderRadius: 11,
                backgroundColor: '#25D366',
                color: '#FFFFFF',
                fontSize: '0.82rem',
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                width: '100%',
                boxShadow: '0 3px 10px rgba(37, 211, 102, 0.35)',
                margin: 0
              }}
            >
              <WhatsAppIcon size={17} />
              <span>📲 Compartilhar Rota com a Família</span>
            </button>

            {/* Linha com SOS de Emergência (somente após embarque) e Fechar */}
            <div style={{ display: 'grid', gridTemplateColumns: rideStatus === 'em_andamento' ? '1.2fr 1fr' : '1fr', gap: 7 }}>
              {rideStatus === 'em_andamento' && (
                <button
                  type="button"
                  onClick={() => setIsSosModalOpen(true)}
                  style={{
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: '#DC2626',
                    color: '#FFFFFF',
                    fontSize: '0.80rem',
                    fontWeight: 900,
                    border: '1.5px solid #FCA5A5',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    boxShadow: '0 3px 10px rgba(220, 38, 38, 0.35)'
                  }}
                >
                  <span>🚨 Emergência SOS</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                style={{
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: '#121A21',
                  color: '#FFFFFF',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  border: '1px solid #2C3E50',
                  cursor: 'pointer'
                }}
              >
                Fechar GPS
              </button>
            </div>

            {canPassengerCancelRide(liveRide) && (
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(true)}
                style={{
                  width: '100%',
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: '#FEF2F2',
                  color: '#DC2626',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  border: '1px solid #FECACA',
                  cursor: 'pointer'
                }}
              >
                Cancelar viagem
              </button>
            )}
          </div>
        </>
        )}
      </div>

      {/* Modal Oficial de Checkout e Recebimento de Pagamento — EXCLUSIVO DO MOTORISTA / ADMIN */}
      {isDriver && (
        <RidePaymentCheckoutModal
          isOpen={isCheckoutOpen}
          ride={ride}
          config={config}
          isClientView={false}
          onClose={() => setIsCheckoutOpen(false)}
          onPaymentConfirmed={(rideId, method) => {
            const allRides = StorageService.getRides();
            const target = allRides.find(r => r.id === rideId);
            if (target) {
              target.status = 'finalizada';
              target.paymentStatus = 'pago';
              target.paymentMethod = method;
              target.updatedAt = new Date().toISOString();
              StorageService.saveRide(target);
            }
            if (onUpdateStatus) {
              onUpdateStatus(rideId, 'finalizada');
            }
            setIsCheckoutOpen(false);
            onClose();
          }}
        />
      )}

      {/* Central de Emergência SOS (Polícia 190, SAMU 192, Bombeiros 193) */}
      <SosEmergencyModal
        isOpen={isSosModalOpen}
        onClose={() => setIsSosModalOpen(false)}
        currentLocationText={`${rideStatus === 'a_caminho' || rideStatus === 'confirmada' ? liveRide.origin.address : liveRide.destination.address} (GPS: ${currentPos.lat.toFixed(5)}, ${currentPos.lng.toFixed(5)})`}
        rideId={liveRide.id}
        driverPhone={driverPhoneRaw || config?.companyWhatsapp || config?.companyPhone}
      />

      {!isDriver && (
        <RideCancelModal
          isOpen={isCancelModalOpen}
          ride={liveRide}
          config={config}
          onClose={() => setIsCancelModalOpen(false)}
          onCancelled={(result) => {
            setIsCancelModalOpen(false);
            if (result.ride) setLiveRide(result.ride);
            else setLiveRide((prev) => ({ ...prev, status: 'cancelada', cancelledBy: 'passenger' }));
            setRideStatus('cancelada');
            if (onUpdateStatus) onUpdateStatus(liveRide.id, 'cancelada');
          }}
        />
      )}
    </div>,
    document.body
  );
};
