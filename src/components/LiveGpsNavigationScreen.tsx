import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { 
  X, Navigation, Compass, Phone, ExternalLink, 
  CheckCircle2, Locate, Check, Volume2, VolumeX, CornerUpRight, CornerUpLeft, ArrowUp, RotateCw
} from 'lucide-react';
import { Ride, RideStatus, SystemConfig } from '../types';
import { StorageService } from '../services/storage';
import { WhatsAppIcon } from './WhatsAppIcon';
import { RidePaymentCheckoutModal } from './RidePaymentCheckoutModal';
import { SosEmergencyModal } from './SosEmergencyModal';
import { formatPhone, getCleanWhatsappNumber } from '../utils/format';
import { getGoogleMapsRouteUrl, calculateHaversineDistance, estimateDurationMinutes, snapPointToRoute } from '../utils/geo';
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

  // Posição inicial: usa a posição real já gravada do motorista ou o ponto de embarque (sem offset aleatório nem simulação)
  const initialDriverPos = useMemo(() => {
    if (ride.driverLocation?.lat && ride.driverLocation?.lng) {
      return {
        lat: ride.driverLocation.lat,
        lng: ride.driverLocation.lng,
        heading: ride.driverLocation.heading || 0
      };
    }
    return {
      lat: ride.origin.lat || -28.39,
      lng: ride.origin.lng || -49.39,
      heading: 0
    };
  }, [ride.id]);

  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number; heading: number }>(initialDriverPos);
  const [clientPos, setClientPos] = useState<{ lat: number; lng: number } | null>(
    ride.clientLocation?.lat && ride.clientLocation?.lng
      ? { lat: ride.clientLocation.lat, lng: ride.clientLocation.lng }
      : null
  );
  const [speed, setSpeed] = useState<number>(ride.driverLocation?.speedKmH || 0);
  const [followMode, setFollowMode] = useState<boolean>(true);
  const [mapLayer, setMapLayer] = useState<'streets' | 'hybrid'>('streets');
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);
  const [distanceRemaining, setDistanceRemaining] = useState<number>(ride.distanceKm);
  const [etaMinutes, setEtaMinutes] = useState<number>(ride.durationMin);
  const [metersToClient, setMetersToClient] = useState<number>(Math.round((ride.distanceKm || 0.5) * 1000));
  const [metersToDestination, setMetersToDestination] = useState<number>(Math.round((ride.distanceKm || 1) * 1000));
  const [etaSecondsLeft, setEtaSecondsLeft] = useState<number>((ride.durationMin || 5) * 60);
  const [rideStatus, setRideStatus] = useState<RideStatus>(ride.status);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);
  const [isSosModalOpen, setIsSosModalOpen] = useState<boolean>(false);
  const [gpsFixed, setGpsFixed] = useState<boolean>(Boolean(ride.driverLocation?.lat));
  const [closingNotice, setClosingNotice] = useState<string | null>(null);
  const hasAutoClosedRef = useRef(false);

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
          : '❌ Corrida cancelada pelo motorista.'
      );
      StorageService.syncFromDatabase().catch(() => {});
      const timer = setTimeout(() => {
        onClose();
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isDriver, rideStatus, onClose]);

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
  const whatsappUrl = `https://wa.me/55${cleanPhone}?text=Ol%C3%A1%20${encodeURIComponent(ride.clientName)},%20sou%20seu%20motorista%20da%20UP%20Mobilidade%20estou%20no%20GPS%20a%20caminho%20da%20sua%20corrida%20${ride.id}.`;

  // Atualiza cálculo em tempo real de metros até o cliente, metros até o destino e ETA em segundos
  useEffect(() => {
    const clientTargetLat = clientPos?.lat || ride.origin.lat;
    const clientTargetLng = clientPos?.lng || ride.origin.lng;

    let calcMetersClient = 0;
    if (clientTargetLat && clientTargetLng && currentPos.lat && currentPos.lng) {
      const dClientKm = calculateHaversineDistance(currentPos.lat, currentPos.lng, clientTargetLat, clientTargetLng);
      calcMetersClient = Math.max(0, Math.round(dClientKm * 1000));
      setMetersToClient(calcMetersClient);
    }

    let calcMetersDest = 0;
    if (ride.destination?.lat && ride.destination?.lng && currentPos.lat && currentPos.lng) {
      const dDestKm = calculateHaversineDistance(currentPos.lat, currentPos.lng, ride.destination.lat, ride.destination.lng);
      calcMetersDest = Math.max(0, Math.round(dDestKm * 1000));
      setMetersToDestination(calcMetersDest);
    }

    const isHeadingToPickup = (rideStatus === 'a_caminho' || rideStatus === 'confirmada') && calcMetersClient > 35;
    const activeMeters = isHeadingToPickup ? calcMetersClient : calcMetersDest;
    const activeKm = activeMeters / 1000;

    setDistanceRemaining(Number(Math.max(0.05, activeKm).toFixed(2)));
    const estMins = Math.max(1, estimateDurationMinutes(activeKm));
    setEtaMinutes(estMins);

    // Velocidade efetiva em m/s (usa velocidade real do GPS se > 6 km/h, senão média urbana 36 km/h = 10 m/s)
    const effectiveSpeedMs = speed >= 6 ? speed / 3.6 : 10;
    const rawSeconds = activeMeters <= 25 ? 0 : Math.max(15, Math.round(activeMeters / effectiveSpeedMs));
    setEtaSecondsLeft(rawSeconds);
  }, [
    currentPos.lat,
    currentPos.lng,
    clientPos?.lat,
    clientPos?.lng,
    speed,
    rideStatus,
    ride.origin.lat,
    ride.origin.lng,
    ride.destination.lat,
    ride.destination.lng
  ]);

  // Cronômetro regressivo em tempo real (ticking a cada 1 segundo)
  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => {
      setEtaSecondsLeft(prev => (prev > 1 ? prev - 1 : prev));
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  // Helpers de formatação de distância (metros e km) e cronômetro MM:SS
  const formatDistanceBadge = (meters: number) => {
    if (meters < 1000) return `${meters} m`;
    return `${(meters / 1000).toFixed(1).replace('.', ',')} km (${meters.toLocaleString('pt-BR')} m)`;
  };

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
      const origLat = ride.origin.lat;
      const origLng = ride.origin.lng;
      const destLat = ride.destination.lat;
      const destLng = ride.destination.lng;

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
  }, [ride.origin.lat, ride.origin.lng, ride.destination.lat, ride.destination.lng, rideStatus, gpsFixed]);

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

  // Função oficial para o cliente compartilhar o link público de rastreamento com a família via WhatsApp ou nativo
  const handleShareWithFamily = () => {
    const destAddr = ride.destination.address || 'Destino';
    const trackingUrl = `${window.location.origin}/viagem/${encodeURIComponent(ride.id)}`;
    const text = `🚗 *Kavro Drive - Acompanhamento de Viagem*\n\nEstou em viagem com o motorista Alisson Santos rumo a *${destAddr}*.\n\nAcompanhe minha localização e rota em tempo real por este link seguro:\n${trackingUrl}`;

    if (navigator.share) {
      navigator.share({
        title: `Viagem ${ride.id} - Kavro Drive`,
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
      window.addEventListener('up_client_location_update', handleClientLocEvent);

      return () => {
        if (watchId !== null && 'geolocation' in navigator) {
          navigator.geolocation.clearWatch(watchId);
        }
        clearInterval(syncInterval);
        window.removeEventListener('up_client_location_update', handleClientLocEvent);
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
      };

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
      };
    }
  }, [isOpen, isDriver, ride.id]);

  // Limites do mapa (origem, destino e carro) memoizados para não re-disparar fitBounds a cada segundo
  const mapBounds: [[number, number], [number, number]] = useMemo(
    () => [
      [Math.min(ride.origin.lat, ride.destination.lat, currentPos.lat) - 0.005, Math.min(ride.origin.lng, ride.destination.lng, currentPos.lng) - 0.005],
      [Math.max(ride.origin.lat, ride.destination.lat, currentPos.lat) + 0.005, Math.max(ride.origin.lng, ride.destination.lng, currentPos.lng) + 0.005]
    ],
    [ride.origin.lat, ride.origin.lng, ride.destination.lat, ride.destination.lng, currentPos.lat, currentPos.lng]
  );

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
        {/* Barra Superior HUD de Navegação Estilo Uber Turn-by-Turn */}
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
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  backgroundColor: rideStatus === 'em_andamento' ? '#EF4444' : '#16A34A',
                  flexShrink: 0
                }} />
                <span style={{ fontSize: '0.68rem', color: '#D1D5DB', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  {rideStatus === 'a_caminho' || rideStatus === 'confirmada' ? 'Perto do embarque' : 'Destino final'}
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
                  {formatTimerMmSs(etaSecondsLeft)}
                </span>
              </div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>
                {rideStatus === 'a_caminho' || rideStatus === 'confirmada' ? ride.origin.address : ride.destination.address}
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

          {/* Botão de Emergência SOS (Polícia 190, SAMU 192, Bombeiros 193) */}
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

          {/* Marcador do Ponto de Embarque */}
          {ride.origin.lat && ride.origin.lng && (
            <Marker
              position={[ride.origin.lat, ride.origin.lng]}
              icon={PICKUP_ICON}
            />
          )}

          {/* Marcador do Ponto de Destino */}
          {ride.destination.lat && ride.destination.lng && (
            <Marker
              position={[ride.destination.lat, ride.destination.lng]}
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

          {/* Marcador do Veículo do Motorista (Seta p/ Motorista | Carrinho p/ Cliente — sem recriar DOM) */}
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
        </MapContainer>

        {/* ── VELOCÍMETRO / LIMITE ESTILO UBER (Canto inferior esquerdo do mapa) ────── */}
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
      </div>

      {/* ── PAINEL DE CONTROLE INFERIOR ULTRA-COMPACTO (MOTORISTA & CLIENTE) ────── */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '18px 18px 0 0',
        padding: '10px 14px calc(10px + env(safe-area-inset-bottom, 0px)) 14px',
        boxShadow: '0 -6px 24px rgba(0,0,0,0.18)',
        zIndex: 10002,
        maxWidth: 540,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        {/* Linha 1: Motorista/Passageiro + Valor + WhatsApp/Ligar em linha única */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
            {!isDriver && config.driverPhoto ? (
              <img
                src={config.driverPhoto}
                alt={config.driverName || 'Motorista'}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid #76D800',
                  flexShrink: 0
                }}
              />
            ) : (
              <div style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                backgroundColor: '#121A21',
                color: '#76D800',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '0.82rem',
                flexShrink: 0
              }}>
                {isDriver ? (ride.clientName ? ride.clientName.charAt(0).toUpperCase() : 'C') : (config.driverName ? config.driverName.charAt(0).toUpperCase() : 'UP')}
              </div>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {isDriver ? ride.clientName : (config.driverName || 'Alisson Santos')}
                </span>
                <span style={{
                  backgroundColor: '#DCFCE7',
                  color: '#15803D',
                  padding: '1px 6px',
                  borderRadius: 999,
                  fontSize: '0.6rem',
                  fontWeight: 800,
                  flexShrink: 0
                }}>
                  {rideStatus === 'a_caminho' || rideStatus === 'confirmada' ? 'A Caminho' : 'Em Viagem'}
                </span>
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>
                {isDriver ? formatPhone(ride.clientPhone) : `Motorista • ${formatPhone(config.driverPhone || config.companyPhone || config.companyWhatsapp)}`}
              </div>
            </div>
          </div>

          {/* Valor + Botões WhatsApp / Telefone compactos */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
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
                R$ {ride.totalPrice.toFixed(2).replace('.', ',')}
              </div>
            </div>

            <a
              href={isDriver ? whatsappUrl : `https://wa.me/${getCleanWhatsappNumber(config.companyWhatsapp)}`}
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
              href={`tel:${isDriver ? cleanPhone : getCleanWhatsappNumber(config.companyWhatsapp)}`}
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

        {/* Linha 2: Barra de Telemetria Slim (Timer + Distância Cliente + Distância Destino) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 6,
          marginBottom: 8
        }}>
          {/* Card 1: Timer */}
          <div style={{
            backgroundColor: '#121A21',
            borderRadius: 9,
            padding: '5px 6px',
            color: '#FFFFFF',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.54rem', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase', lineHeight: 1 }}>
              ⏱ Tempo (~{arrivalClockStr})
            </div>
            <div style={{
              fontSize: '0.86rem',
              fontWeight: 900,
              color: '#76D800',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.2,
              marginTop: 2
            }}>
              {formatTimerMmSs(etaSecondsLeft)}
            </div>
          </div>

          {/* Card 2: Até o Cliente */}
          <div style={{
            backgroundColor: '#F8FAFC',
            borderRadius: 9,
            padding: '5px 6px',
            border: '1px solid #E2E8F0',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.54rem', color: '#64748B', fontWeight: 800, textTransform: 'uppercase', lineHeight: 1 }}>
              📍 {isDriver ? 'Cliente' : 'Até Você'}
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
                : metersToClient <= 35
                  ? 'No local'
                  : metersToClient < 1000
                    ? `${metersToClient} m`
                    : `${(metersToClient / 1000).toFixed(1).replace('.', ',')} km`}
            </div>
          </div>

          {/* Card 3: Até o Destino */}
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
              {metersToDestination < 1000
                ? `${metersToDestination} m`
                : `${(metersToDestination / 1000).toFixed(1).replace('.', ',')} km`}
            </div>
          </div>
        </div>

        {/* Linha 3: Botões de Ação Compactos */}
        {isDriver ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(rideStatus === 'confirmada' || rideStatus === 'a_caminho') && (
              <button
                type="button"
                onClick={() => handleAdvanceStatus('em_andamento')}
                className="btn-ios-primary"
                style={{
                  height: 38,
                  padding: '0 12px',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  width: '100%',
                  margin: 0
                }}
              >
                <Check size={15} />
                <span>Passageiro Embarcou (Iniciar Viagem)</span>
              </button>
            )}

            {rideStatus === 'em_andamento' && (
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(true)}
                style={{
                  height: 38,
                  backgroundColor: '#10B981',
                  color: '#ffffff',
                  borderRadius: 10,
                  fontSize: '0.84rem',
                  fontWeight: 800,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  width: '100%'
                }}
              >
                <CheckCircle2 size={15} />
                <span>Concluir e Receber (R$ {ride.totalPrice.toFixed(2).replace('.', ',')})</span>
              </button>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.8fr', gap: 6 }}>
              <a
                href={getGoogleMapsRouteUrl(ride.origin, ride.destination)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  height: 32,
                  borderRadius: 9,
                  backgroundColor: '#121A21',
                  color: '#FFFFFF',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
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
                  height: 32,
                  borderRadius: 9,
                  backgroundColor: '#F1F5F9',
                  color: '#334155',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  border: '1px solid #CBD5E1',
                  cursor: 'pointer'
                }}
              >
                Voltar
              </button>

              <button
                type="button"
                onClick={() => setIsSosModalOpen(true)}
                style={{
                  height: 32,
                  borderRadius: 9,
                  backgroundColor: '#DC2626',
                  color: '#FFFFFF',
                  fontSize: '0.74rem',
                  fontWeight: 900,
                  border: '1px solid #FCA5A5',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4
                }}
                title="Central de Emergência SOS"
              >
                🚨 SOS
              </button>
            </div>
          </div>
        ) : (
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

            {/* Linha com SOS de Emergência e Fechar */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 7 }}>
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
          </div>
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
        currentLocationText={`${rideStatus === 'a_caminho' || rideStatus === 'confirmada' ? ride.origin.address : ride.destination.address} (GPS: ${currentPos.lat.toFixed(5)}, ${currentPos.lng.toFixed(5)})`}
        rideId={ride.id}
        driverPhone={config?.driverPhone || config?.companyPhone || config?.companyWhatsapp}
      />
    </div>,
    document.body
  );
};
