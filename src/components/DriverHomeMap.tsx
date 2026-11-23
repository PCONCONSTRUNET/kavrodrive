import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Compass } from 'lucide-react';
import { Ride } from '../types';
import {
  computeRemainingRouteMeters,
  resolveActiveNavigationStepIndex,
  snapPointToRoute,
} from '../utils/geo';
import { GpsMotionFilter, useDeviceCompass } from '../utils/compassAndGps';
import { fetchDrivingRoute } from '../utils/routing';
import { RouteStep } from '../utils/soundAndVoice';
import { MapLibreNavCanvas, NavCameraMode } from './MapLibreNavCanvas';

export interface RouteStepSummary {
  streetName: string;
  nextStreetName: string;
  distanceMeters: number;
  maneuverType?: string;
  maneuverModifier?: string;
}

interface DriverHomeMapProps {
  driverLocation?: { lat: number; lng: number; heading?: number; speedKmH?: number } | null;
  isOnline: boolean;
  activeRide?: Ride | null;
  recenterSignal?: number;
  onRouteInfoUpdate?: (info: {
    distanceKm: number;
    durationMin: number;
    step: RouteStepSummary;
  }) => void;
}

const DEFAULT_CENTER: [number, number] = [-28.39123, -49.39354];

export const DriverHomeMap: React.FC<DriverHomeMapProps> = ({
  driverLocation,
  isOnline,
  activeRide,
  recenterSignal,
  onRouteInfoUpdate,
}) => {
  const compass = useDeviceCompass(true);
  const compassHeadingRef = useRef<number | null>(null);
  const compassFreshRef = useRef<boolean>(false);

  useEffect(() => {
    compassHeadingRef.current = compass.heading;
    compassFreshRef.current = compass.available;
  }, [compass.heading, compass.available]);

  const localFilterRef = useRef<GpsMotionFilter>(new GpsMotionFilter());
  const [localGps, setLocalGps] = useState<{
    lat: number;
    lng: number;
    heading: number;
    speedKmH: number;
  } | null>(
    driverLocation?.lat && driverLocation?.lng
      ? {
          lat: driverLocation.lat,
          lng: driverLocation.lng,
          heading: driverLocation.heading || 0,
          speedKmH: driverLocation.speedKmH || 0,
        }
      : null
  );

  const [cameraMode, setCameraMode] = useState<NavCameraMode>('heading_3d');
  const [localRecenterTick, setLocalRecenterTick] = useState(0);
  const prevSignalRef = useRef<number | undefined>(recenterSignal);

  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [routeSteps, setRouteSteps] = useState<RouteStep[]>([]);
  const [routeMeta, setRouteMeta] = useState<{ distanceMeters: number; durationSeconds: number }>({
    distanceMeters: 0,
    durationSeconds: 0,
  });
  const [rerouteTick, setRerouteTick] = useState(0);

  const snappedSegIdxRef = useRef<number>(0);
  const activeStepIdxRef = useRef<number>(0);
  const offRouteSinceRef = useRef<number>(0);
  const lastRerouteAtRef = useRef<number>(0);
  const lastRouteInfoPushRef = useRef<number>(0);

  // Sincroniza localização vinda do DriverPortalScreen (com complemento da bússola quando parado)
  useEffect(() => {
    if (driverLocation?.lat && driverLocation?.lng) {
      setLocalGps((prev) => {
        const spd = driverLocation.speedKmH ?? prev?.speedKmH ?? 0;
        const resolvedHeading =
          spd < 5 && compass.available && compass.heading !== null
            ? compass.heading
            : typeof driverLocation.heading === 'number' && driverLocation.heading > 0
              ? driverLocation.heading
              : prev?.heading || 0;
        return {
          lat: driverLocation.lat,
          lng: driverLocation.lng,
          heading: resolvedHeading,
          speedKmH: spd,
        };
      });
    }
  }, [driverLocation?.lat, driverLocation?.lng, driverLocation?.heading, driverLocation?.speedKmH, compass.heading, compass.available]);

  // Leitura local leve quando o motorista ainda não ficou online (offline preview na home)
  useEffect(() => {
    if (isOnline || activeRide) return;
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const fix = localFilterRef.current.process(
          pos,
          compassHeadingRef.current,
          compassFreshRef.current
        );
        if (fix) {
          setLocalGps({
            lat: fix.lat,
            lng: fix.lng,
            heading: fix.heading,
            speedKmH: fix.speedKmH,
          });
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 10000 }
    );
  }, [isOnline, Boolean(activeRide)]);

  // Quando parado/lento sem movimento, mantém a seta acompanhando a bússola em tempo real
  const rawVehiclePos = useMemo(() => {
    const baseLat = activeRide?.driverLocation?.lat || localGps?.lat || activeRide?.origin?.lat || DEFAULT_CENTER[0];
    const baseLng = activeRide?.driverLocation?.lng || localGps?.lng || activeRide?.origin?.lng || DEFAULT_CENTER[1];
    const baseSpeed = activeRide?.driverLocation?.speedKmH ?? localGps?.speedKmH ?? 0;
    const baseHeading =
      baseSpeed < 5 && compass.available && compass.heading !== null
        ? compass.heading
        : localGps?.heading ?? activeRide?.driverLocation?.heading ?? 0;

    return {
      lat: baseLat,
      lng: baseLng,
      heading: baseHeading,
      speedKmH: baseSpeed,
    };
  }, [
    activeRide?.driverLocation?.lat,
    activeRide?.driverLocation?.lng,
    activeRide?.driverLocation?.heading,
    activeRide?.driverLocation?.speedKmH,
    activeRide?.origin?.lat,
    activeRide?.origin?.lng,
    localGps?.lat,
    localGps?.lng,
    localGps?.heading,
    localGps?.speedKmH,
    compass.available,
    compass.heading,
  ]);

  const targetPoint = useMemo(() => {
    if (!activeRide) return null;
    const isTripInProgress = activeRide.status === 'em_andamento';
    return isTripInProgress ? activeRide.destination : activeRide.origin;
  }, [activeRide]);

  // Busca rota OSRM quando muda a corrida, o status ou dispara recálculo fora de rota
  useEffect(() => {
    if (!activeRide || !targetPoint?.lat || !targetPoint?.lng) {
      setRouteCoords([]);
      setRouteSteps([]);
      snappedSegIdxRef.current = 0;
      activeStepIdxRef.current = 0;
      return;
    }

    const startLat = rawVehiclePos.lat;
    const startLng = rawVehiclePos.lng;
    const endLat = targetPoint.lat;
    const endLng = targetPoint.lng;
    if (!startLat || !startLng) return;

    const abortController = new AbortController();
    snappedSegIdxRef.current = 0;
    activeStepIdxRef.current = 0;
    offRouteSinceRef.current = 0;

    fetchDrivingRoute(
      [
        { lat: startLat, lng: startLng },
        { lat: endLat, lng: endLng },
      ],
      { signal: abortController.signal }
    ).then((res) => {
      if (!res || abortController.signal.aborted) return;
      setRouteCoords(res.coordinates);
      setRouteSteps(res.steps);
      setRouteMeta({
        distanceMeters: res.distanceMeters,
        durationSeconds: res.durationSeconds,
      });
    });

    return () => {
      abortController.abort();
    };
  }, [activeRide?.id, activeRide?.status, targetPoint?.lat, targetPoint?.lng, rerouteTick]);

  // Map Matching direcional + detecção automática de desvio de rota
  const activeRideId = activeRide?.id;
  const activeRideOriginAddress = activeRide?.origin?.address || '';
  const activeRideDestAddress = activeRide?.destination?.address || '';

  const snappedVehicle = useMemo(() => {
    if (!activeRideId || routeCoords.length < 2) {
      return {
        lat: rawVehiclePos.lat,
        lng: rawVehiclePos.lng,
        heading: rawVehiclePos.heading,
        snapped: false,
        distanceMeters: 0,
        segmentIndex: 0,
      };
    }
    return snapPointToRoute(rawVehiclePos, routeCoords, 60, {
      preferredHeading: rawVehiclePos.heading,
      maxHeadingDiffDeg: 100,
    });
  }, [activeRideId, rawVehiclePos, routeCoords]);

  useEffect(() => {
    if (snappedVehicle.snapped) {
      snappedSegIdxRef.current = snappedVehicle.segmentIndex;
    }
  }, [snappedVehicle.snapped, snappedVehicle.segmentIndex]);

  // Recalcula rota se o motorista sair mais de 60m da linha por >= 2.5s (com cooldown de 10s)
  useEffect(() => {
    if (!activeRideId || routeCoords.length < 2) {
      offRouteSinceRef.current = 0;
      return;
    }
    const now = Date.now();
    if (!snappedVehicle.snapped && snappedVehicle.distanceMeters > 60) {
      if (offRouteSinceRef.current === 0) {
        offRouteSinceRef.current = now;
      } else if (
        now - offRouteSinceRef.current >= 2500 &&
        now - lastRerouteAtRef.current >= 10000
      ) {
        lastRerouteAtRef.current = now;
        offRouteSinceRef.current = 0;
        setRerouteTick((t) => t + 1);
      }
    } else {
      offRouteSinceRef.current = 0;
    }
  }, [activeRideId, snappedVehicle.snapped, snappedVehicle.distanceMeters, routeCoords.length]);

  // Atualiza painel turn-by-turn em tempo real com metros exatos e próximo passo
  useEffect(() => {
    if (!activeRideId || !onRouteInfoUpdate || routeCoords.length < 2) return;

    const now = Date.now();
    if (now - lastRouteInfoPushRef.current < 900 && routeSteps.length > 0) {
      return;
    }
    lastRouteInfoPushRef.current = now;

    const remainingMeters = snappedVehicle.snapped
      ? computeRemainingRouteMeters(
          routeCoords,
          snappedVehicle.segmentIndex,
          snappedVehicle.lat,
          snappedVehicle.lng
        )
      : routeMeta.distanceMeters;

    const distKm = Math.max(0.1, Number((remainingMeters / 1000).toFixed(1)));
    const avgSpeedMs =
      routeMeta.distanceMeters > 0 && routeMeta.durationSeconds > 0
        ? routeMeta.distanceMeters / routeMeta.durationSeconds
        : 9.5;
    const liveSpeedMs = rawVehiclePos.speedKmH >= 8 ? rawVehiclePos.speedKmH / 3.6 : avgSpeedMs;
    const durMin = Math.max(1, Math.round(remainingMeters / Math.max(4, liveSpeedMs) / 60));

    const { stepIndex, metersToStep } = resolveActiveNavigationStepIndex(
      routeSteps,
      activeStepIdxRef.current,
      snappedVehicle.lat,
      snappedVehicle.lng,
      38
    );
    activeStepIdxRef.current = stepIndex;

    const currentStep = routeSteps[stepIndex];
    const nextStep = routeSteps[stepIndex + 1] || currentStep;

    const fallbackStreet = activeRideOriginAddress.split(',')[0] || 'Via local';
    const fallbackDest = (targetPoint?.address || activeRideDestAddress).split(',')[0] || 'Destino';

    onRouteInfoUpdate({
      distanceKm: distKm,
      durationMin: durMin,
      step: {
        streetName: currentStep?.streetName || currentStep?.shortText || fallbackStreet,
        nextStreetName: nextStep?.streetName || nextStep?.instruction || fallbackDest,
        distanceMeters: Math.max(10, metersToStep || currentStep?.distanceMeters || 50),
        maneuverType: currentStep?.type,
        maneuverModifier: currentStep?.modifier,
      },
    });
  }, [
    activeRideId,
    activeRideOriginAddress,
    activeRideDestAddress,
    onRouteInfoUpdate,
    routeCoords,
    routeSteps,
    routeMeta.distanceMeters,
    routeMeta.durationSeconds,
    snappedVehicle.lat,
    snappedVehicle.lng,
    snappedVehicle.segmentIndex,
    snappedVehicle.snapped,
    rawVehiclePos.speedKmH,
    targetPoint?.address,
  ]);

  // Controle do botão de bússola/centralizar externo (DriverPortalScreen / DriverActiveRideCard)
  useEffect(() => {
    if (recenterSignal !== undefined && recenterSignal !== prevSignalRef.current) {
      prevSignalRef.current = recenterSignal;
      if (compass.needsPermission) {
        compass.requestPermission().catch(() => {});
      }
      setCameraMode((prev) => {
        if (prev === 'free') return 'heading_3d';
        if (activeRide) return prev === 'heading_3d' ? 'overview' : 'heading_3d';
        return 'heading_3d';
      });
      setLocalRecenterTick((t) => t + 1);
    }
  }, [recenterSignal, activeRide, compass]);

  const handleCompassPillTap = async () => {
    if (compass.needsPermission) {
      await compass.requestPermission();
    }
    setCameraMode((prev) => (prev === 'heading_3d' && activeRide ? 'overview' : 'heading_3d'));
    setLocalRecenterTick((t) => t + 1);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1, backgroundColor: '#E8EDF3' }}>
      <MapLibreNavCanvas
        vehiclePos={{
          lat: snappedVehicle.lat,
          lng: snappedVehicle.lng,
          heading: snappedVehicle.heading,
        }}
        vehicleStyle="uber_puck"
        speedKmH={rawVehiclePos.speedKmH}
        cameraMode={cameraMode}
        recenterSignal={localRecenterTick}
        onUserPanMap={() => setCameraMode('free')}
        mapLayer="streets"
        routeCoordinates={activeRide ? routeCoords : []}
        snappedSegmentIndex={snappedVehicle.segmentIndex}
        isSnappedToRoute={snappedVehicle.snapped}
        routeColor="#111111"
        pickupPoint={
          activeRide && targetPoint?.lat && targetPoint?.lng
            ? { lat: targetPoint.lat, lng: targetPoint.lng }
            : null
        }
        pickupMode="uber_green_pin"
        navPadding={{ top: 140, bottom: activeRide ? 185 : 220, left: 20, right: 20 }}
        overviewPadding={{ top: 135, bottom: 165, left: 42, right: 42 }}
        showVehicleMarker={true}
      />

      {/* Pílula discreta quando o usuário arrastou o mapa ou no iOS quando precisa liberar a bússola */}
      {(cameraMode !== 'heading_3d' || compass.needsPermission) && (
        <button
          type="button"
          onClick={handleCompassPillTap}
          style={{
            position: 'fixed',
            top: activeRide ? 'calc(104px + env(safe-area-inset-top, 0px))' : 'calc(72px + env(safe-area-inset-top, 0px))',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 65,
            backgroundColor: 'rgba(17, 17, 17, 0.9)',
            color: '#FFFFFF',
            border: '1px solid rgba(118, 216, 0, 0.65)',
            borderRadius: 999,
            padding: '7px 14px',
            fontSize: '0.74rem',
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 6px 18px rgba(0,0,0,0.28)',
            cursor: 'pointer',
          }}
        >
          <Compass size={15} color="#76D800" />
          <span>
            {compass.needsPermission
              ? 'Ativar Bússola 3D'
              : cameraMode === 'overview'
                ? 'Voltar p/ Bússola 3D'
                : 'Recentrar Bússola 3D'}
          </span>
        </button>
      )}
    </div>
  );
};
