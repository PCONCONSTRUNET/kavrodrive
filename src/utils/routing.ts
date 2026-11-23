import { calculateExactMeters } from './geo';
import { RouteStep, translateOsrmStep } from './soundAndVoice';

export interface DrivingRouteResult {
  coordinates: [number, number][]; // [lat, lng][]
  steps: RouteStep[];
  distanceMeters: number;
  durationSeconds: number;
  isFallback: boolean;
}

/**
 * Busca rota viária real via OSRM com suporte a múltiplos waypoints,
 * tratamento de timeout e extração padronizada de etapas turn-by-turn.
 */
export async function fetchDrivingRoute(
  waypoints: Array<{ lat: number; lng: number }>,
  options?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<DrivingRouteResult | null> {
  const valid = waypoints.filter(
    (w) => w && Number.isFinite(w.lat) && Number.isFinite(w.lng) && (w.lat !== 0 || w.lng !== 0)
  );
  if (valid.length < 2) return null;

  const coordStr = valid.map((w) => `${w.lng},${w.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson&steps=true`;

  const timeoutMs = options?.timeoutMs ?? 6500;
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);

  const forwardAbort = () => controller.abort();
  if (options?.signal) {
    if (options.signal.aborted) {
      clearTimeout(tid);
      return null;
    }
    options.signal.addEventListener('abort', forwardAbort, { once: true });
  }

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.ok) {
      const data = await res.json();
      const route = data?.routes?.[0];
      const rawCoords = route?.geometry?.coordinates;
      if (Array.isArray(rawCoords) && rawCoords.length >= 2) {
        const coordinates: [number, number][] = rawCoords.map(
          (c: [number, number]) => [c[1], c[0]]
        );
        const steps: RouteStep[] = [];
        if (Array.isArray(route.legs)) {
          for (const leg of route.legs) {
            if (Array.isArray(leg.steps)) {
              for (const s of leg.steps) {
                steps.push(translateOsrmStep(s));
              }
            }
          }
        }
        return {
          coordinates,
          steps,
          distanceMeters: Math.round(Number(route.distance) || 0),
          durationSeconds: Math.round(Number(route.duration) || 0),
          isFallback: false,
        };
      }
    }
  } catch {
    // Cai no fallback linear caso o OSRM falhe ou aborte por timeout
  } finally {
    clearTimeout(tid);
    if (options?.signal) {
      options.signal.removeEventListener('abort', forwardAbort);
    }
  }

  if (options?.signal?.aborted) return null;

  const fallbackCoords: [number, number][] = valid.map((w) => [w.lat, w.lng]);
  let straightMeters = 0;
  for (let i = 0; i < fallbackCoords.length - 1; i++) {
    straightMeters += calculateExactMeters(
      fallbackCoords[i][0],
      fallbackCoords[i][1],
      fallbackCoords[i + 1][0],
      fallbackCoords[i + 1][1]
    );
  }
  const estimatedRoadMeters = Math.round(straightMeters * 1.3);

  return {
    coordinates: fallbackCoords,
    steps: [],
    distanceMeters: estimatedRoadMeters,
    durationSeconds: Math.max(60, Math.round(estimatedRoadMeters / 9.5)),
    isFallback: true,
  };
}
