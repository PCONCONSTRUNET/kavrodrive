import { useCallback, useEffect, useRef, useState } from 'react';
import {
  calculateBearingDegrees,
  calculateExactMeters,
  normalizeAngle360,
  smoothAngle,
} from './geo';

export type CompassPermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported';

export interface CompassState {
  heading: number | null;
  available: boolean;
  needsPermission: boolean;
  permissionState: CompassPermissionState;
  lastUpdatedAt: number;
  requestPermission: () => Promise<boolean>;
}

function getScreenOrientationAngle(): number {
  if (typeof window === 'undefined') return 0;
  const screenAngle = window.screen?.orientation?.angle;
  if (typeof screenAngle === 'number' && Number.isFinite(screenAngle)) {
    return screenAngle;
  }
  const legacyOrientation = (window as unknown as { orientation?: number }).orientation;
  return typeof legacyOrientation === 'number' && Number.isFinite(legacyOrientation)
    ? legacyOrientation
    : 0;
}

function supportsDeviceOrientation(): boolean {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

function requiresCompassPermissionPrompt(): boolean {
  if (!supportsDeviceOrientation()) return false;
  const doe = window.DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  };
  return typeof doe?.requestPermission === 'function';
}

/**
 * Hook de bússola magnética nativa (DeviceOrientationEvent).
 * - Android/Chrome: usa `deviceorientationabsolute` (ou `deviceorientation` com `absolute === true`) automaticamente.
 * - iOS/Safari 13+: usa `webkitCompassHeading` e expõe `requestPermission()` para o gesto do usuário.
 */
export function useDeviceCompass(enabled: boolean): CompassState {
  const needsPermission = requiresCompassPermissionPrompt();
  const [permissionState, setPermissionState] = useState<CompassPermissionState>(() => {
    if (!supportsDeviceOrientation()) return 'unsupported';
    return needsPermission ? 'prompt' : 'granted';
  });
  const [heading, setHeading] = useState<number | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(0);

  const smoothedHeadingRef = useRef<number | null>(null);
  const lastUiPushRef = useRef<number>(0);

  const handleOrientation = useCallback((evt: DeviceOrientationEvent) => {
    const ext = evt as DeviceOrientationEvent & {
      webkitCompassHeading?: number;
      webkitCompassAccuracy?: number;
    };

    let rawHeading: number | null = null;

    // iOS Safari fornece o norte magnético direto em webkitCompassHeading (0 = Norte, sentido horário)
    if (typeof ext.webkitCompassHeading === 'number' && Number.isFinite(ext.webkitCompassHeading)) {
      if (typeof ext.webkitCompassAccuracy === 'number' && ext.webkitCompassAccuracy < 0) {
        return;
      }
      rawHeading = ext.webkitCompassHeading;
    } else if (evt.absolute === true && typeof evt.alpha === 'number' && Number.isFinite(evt.alpha)) {
      // W3C / Android Chrome: alpha cresce no sentido anti-horário
      rawHeading = 360 - evt.alpha;
    }

    if (rawHeading === null) return;

    const compensated = normalizeAngle360(rawHeading + getScreenOrientationAngle());
    const next =
      smoothedHeadingRef.current === null
        ? compensated
        : smoothAngle(smoothedHeadingRef.current, compensated, 0.28);
    smoothedHeadingRef.current = next;

    const now = Date.now();
    // Limita re-renders do React a ~12 Hz (~80ms) mantendo suavidade visual
    if (now - lastUiPushRef.current >= 80) {
      lastUiPushRef.current = now;
      setHeading(Math.round(next));
      setLastUpdatedAt(now);
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!supportsDeviceOrientation()) {
      setPermissionState('unsupported');
      return false;
    }
    const doe = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (typeof doe?.requestPermission !== 'function') {
      setPermissionState('granted');
      return true;
    }
    try {
      const result = await doe.requestPermission();
      const granted = result === 'granted';
      setPermissionState(granted ? 'granted' : 'denied');
      return granted;
    } catch {
      setPermissionState('denied');
      return false;
    }
  }, []);

  useEffect(() => {
    if (!enabled || !supportsDeviceOrientation()) return;
    if (permissionState !== 'granted') return;

    const onAbsolute = (e: Event) => handleOrientation(e as DeviceOrientationEvent);
    const onRelative = (e: DeviceOrientationEvent) => {
      const ext = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
      // Só aceita o evento padrão se for iOS (webkitCompassHeading) ou explicitamente absoluto
      if (typeof ext.webkitCompassHeading === 'number' || e.absolute === true) {
        handleOrientation(e);
      }
    };

    window.addEventListener('deviceorientationabsolute', onAbsolute, true);
    window.addEventListener('deviceorientation', onRelative, true);

    return () => {
      window.removeEventListener('deviceorientationabsolute', onAbsolute, true);
      window.removeEventListener('deviceorientation', onRelative, true);
    };
  }, [enabled, permissionState, handleOrientation]);

  return {
    heading,
    available: heading !== null && lastUpdatedAt > 0,
    needsPermission: needsPermission && permissionState === 'prompt',
    permissionState,
    lastUpdatedAt,
    requestPermission,
  };
}

export interface FilteredGpsFix {
  lat: number;
  lng: number;
  rawLat: number;
  rawLng: number;
  heading: number;
  headingSource: 'gps' | 'bearing' | 'compass' | 'retained';
  speedKmH: number;
  accuracyMeters: number;
  timestamp: number;
}

/**
 * Filtro de qualidade GPS + suavização adaptativa + fusão de direção (GPS + Bearing + Bússola).
 * Elimina saltos de antena/torre de celular e mantém a seta orientada mesmo no semáforo.
 */
export class GpsMotionFilter {
  private lastFix: FilteredGpsFix | null = null;
  private bearingAnchor: { lat: number; lng: number; ts: number } | null = null;

  public reset(initial?: { lat: number; lng: number; heading?: number }): void {
    if (initial && Number.isFinite(initial.lat) && Number.isFinite(initial.lng)) {
      const now = Date.now();
      this.lastFix = {
        lat: initial.lat,
        lng: initial.lng,
        rawLat: initial.lat,
        rawLng: initial.lng,
        heading: normalizeAngle360(initial.heading || 0),
        headingSource: 'retained',
        speedKmH: 0,
        accuracyMeters: 25,
        timestamp: now,
      };
      this.bearingAnchor = { lat: initial.lat, lng: initial.lng, ts: now };
    } else {
      this.lastFix = null;
      this.bearingAnchor = null;
    }
  }

  public process(
    pos: GeolocationPosition,
    compassHeading?: number | null,
    compassFresh = false
  ): FilteredGpsFix | null {
    const rawLat = pos.coords.latitude;
    const rawLng = pos.coords.longitude;
    if (!Number.isFinite(rawLat) || !Number.isFinite(rawLng)) return null;

    const now = typeof pos.timestamp === 'number' && pos.timestamp > 0 ? pos.timestamp : Date.now();
    const accuracy =
      typeof pos.coords.accuracy === 'number' && Number.isFinite(pos.coords.accuracy)
        ? Math.max(1, pos.coords.accuracy)
        : 999;

    const prev = this.lastFix;
    const dtSec = prev ? Math.max(0.05, (now - prev.timestamp) / 1000) : 0;
    const rawJumpMeters = prev ? calculateExactMeters(prev.rawLat, prev.rawLng, rawLat, rawLng) : 0;

    // 1. Rejeita leituras de baixa qualidade quando já temos posição recente (< 20s)
    if (prev && dtSec < 20) {
      if (accuracy > 65) {
        return null;
      }
      // Rejeita salto impossível (> 240 km/h) se a precisão não for excelente
      const impliedSpeedMs = rawJumpMeters / dtSec;
      if (dtSec > 0.25 && impliedSpeedMs > 66 && accuracy > 22) {
        return null;
      }
    }

    // 2. Suavização adaptativa baseada na precisão do sinal
    let alpha = 1;
    if (prev) {
      const smoothJump = calculateExactMeters(prev.lat, prev.lng, rawLat, rawLng);
      if (smoothJump > 50 && accuracy <= 25) {
        alpha = 1; // Retorno rápido após túnel / troca de aba
      } else if (accuracy <= 12) {
        alpha = 0.85;
      } else if (accuracy <= 25) {
        alpha = 0.65;
      } else if (accuracy <= 45) {
        alpha = 0.42;
      } else {
        alpha = 0.28;
      }
    }

    const lat = prev ? prev.lat + (rawLat - prev.lat) * alpha : rawLat;
    const lng = prev ? prev.lng + (rawLng - prev.lng) * alpha : rawLng;

    // 3. Velocidade real (prefere sensor do GPS; fallback por deslocamento quando válido)
    let speedMs =
      typeof pos.coords.speed === 'number' && Number.isFinite(pos.coords.speed) && pos.coords.speed >= 0
        ? pos.coords.speed
        : -1;

    if (speedMs < 0 && prev && dtSec >= 0.6 && dtSec <= 8 && accuracy <= 30) {
      const moved = calculateExactMeters(prev.lat, prev.lng, lat, lng);
      speedMs = moved >= 2 ? moved / dtSec : 0;
    }
    const effectiveSpeedMs = Math.max(0, speedMs);
    const speedKmH = effectiveSpeedMs > 0.6 ? Math.round(effectiveSpeedMs * 3.6) : 0;

    // 4. Fusão inteligente de direção:
    //    - Em movimento (>= 1.4 m/s ~ 5 km/h): coords.heading do GPS ou bearing entre pontos
    //    - Parado / lento: bússola magnética do aparelho quando disponível e recente
    let targetHeading = prev?.heading ?? 0;
    let headingSource: FilteredGpsFix['headingSource'] = 'retained';

    const hasValidGpsHeading =
      typeof pos.coords.heading === 'number' &&
      Number.isFinite(pos.coords.heading) &&
      pos.coords.heading >= 0 &&
      pos.coords.heading <= 360;

    if (effectiveSpeedMs >= 1.4) {
      if (hasValidGpsHeading) {
        targetHeading = pos.coords.heading as number;
        headingSource = 'gps';
      } else if (this.bearingAnchor) {
        const anchorDist = calculateExactMeters(
          this.bearingAnchor.lat,
          this.bearingAnchor.lng,
          lat,
          lng
        );
        if (anchorDist >= 4) {
          targetHeading = calculateBearingDegrees(
            this.bearingAnchor.lat,
            this.bearingAnchor.lng,
            lat,
            lng
          );
          headingSource = 'bearing';
          this.bearingAnchor = { lat, lng, ts: now };
        }
      }
    } else if (
      compassFresh &&
      typeof compassHeading === 'number' &&
      Number.isFinite(compassHeading)
    ) {
      targetHeading = compassHeading;
      headingSource = 'compass';
    }

    if (!this.bearingAnchor) {
      this.bearingAnchor = { lat, lng, ts: now };
    } else if (
      calculateExactMeters(this.bearingAnchor.lat, this.bearingAnchor.lng, lat, lng) >= 6
    ) {
      if (headingSource === 'retained' && accuracy <= 30) {
        targetHeading = calculateBearingDegrees(
          this.bearingAnchor.lat,
          this.bearingAnchor.lng,
          lat,
          lng
        );
        headingSource = 'bearing';
      }
      this.bearingAnchor = { lat, lng, ts: now };
    }

    const smoothedHeading = prev
      ? Math.round(
          smoothAngle(
            prev.heading,
            targetHeading,
            headingSource === 'compass' ? 0.3 : 0.48
          )
        ) % 360
      : Math.round(normalizeAngle360(targetHeading)) % 360;

    const result: FilteredGpsFix = {
      lat,
      lng,
      rawLat,
      rawLng,
      heading: smoothedHeading,
      headingSource,
      speedKmH,
      accuracyMeters: Math.round(accuracy),
      timestamp: now,
    };

    this.lastFix = result;
    return result;
  }

  public getLastFix(): FilteredGpsFix | null {
    return this.lastFix;
  }
}
