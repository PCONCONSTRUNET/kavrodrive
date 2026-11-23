import React, { useEffect, useRef } from 'react';
import {
  GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { normalizeAngle360, shortestAngleDelta } from '../utils/geo';

export type NavCameraMode = 'heading_3d' | 'north_follow' | 'overview' | 'free';

export interface NavMarkerPoint {
  lat: number;
  lng: number;
}

export interface MapLibreNavCanvasProps {
  /** Posição animada do veículo principal */
  vehiclePos?: { lat: number; lng: number; heading: number } | null;
  /** Tipo visual do marcador do veículo */
  vehicleStyle?: 'uber_puck' | 'driver_arrow' | 'passenger_car';
  /** Velocidade atual em km/h (usada para ajustar o zoom dinâmico na rodovia/cidade) */
  speedKmH?: number;
  /** Modo da câmera (Heading-Up 3D, Norte Seguindo, Visão Geral ou Livre após arraste) */
  cameraMode: NavCameraMode;
  /** Disparo manual de recentralização/transição suave */
  recenterSignal?: number;
  /** Callback quando o usuário arrasta/gira o mapa com o dedo (pausa o modo automático) */
  onUserPanMap?: () => void;
  /** Camada do mapa ('streets' vetorial 3D gratuito ou 'hybrid' satélite gratuito) */
  mapLayer?: 'streets' | 'hybrid';
  /** Coordenadas da rota [lat, lng][] */
  routeCoordinates?: [number, number][];
  /** Índice do segmento já percorrido na rota (para esmaecer o trecho atrás do carro) */
  snappedSegmentIndex?: number;
  /** Se o veículo está encaixado na rota */
  isSnappedToRoute?: boolean;
  /** Cor da rota restante */
  routeColor?: string;
  /** Pontos de referência no mapa */
  pickupPoint?: NavMarkerPoint | null;
  pickupMode?: 'searching' | 'pickup' | 'uber_green_pin';
  destinationPoint?: NavMarkerPoint | null;
  clientLivePoint?: NavMarkerPoint | null;
  /** Padding de câmera em modo de navegação (desloca o carro para baixo para mostrar a frente) */
  navPadding?: { top: number; bottom: number; left: number; right: number };
  /** Padding ao enquadrar toda a rota em overview */
  overviewPadding?: { top: number; bottom: number; left: number; right: number };
  /** Oculta ou mostra o marcador do veículo */
  showVehicleMarker?: boolean;
  /** Centro inicial caso ainda não haja vehiclePos */
  fallbackCenter?: [number, number];
}

const DEFAULT_FALLBACK_CENTER: [number, number] = [-28.39123, -49.39354];

const OSM_RASTER_FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'carto-voyager': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      maxzoom: 20,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    },
  },
  layers: [
    {
      id: 'carto-voyager-tiles',
      type: 'raster',
      source: 'carto-voyager',
      minzoom: 0,
      maxzoom: 20,
    },
  ],
};

const HYBRID_SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'esri-satellite': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '&copy; Esri',
    },
    'carto-labels': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      maxzoom: 20,
    },
  },
  layers: [
    {
      id: 'esri-satellite-layer',
      type: 'raster',
      source: 'esri-satellite',
      minzoom: 0,
      maxzoom: 19,
    },
    {
      id: 'carto-labels-layer',
      type: 'raster',
      source: 'carto-labels',
      minzoom: 0,
      maxzoom: 20,
    },
  ],
};

let cachedOpenFreeMapStyle: StyleSpecification | null = null;
let inflightStylePromise: Promise<StyleSpecification> | null = null;

async function getFreeVectorStreetStyle(): Promise<StyleSpecification> {
  if (cachedOpenFreeMapStyle) return cachedOpenFreeMapStyle;
  if (inflightStylePromise) return inflightStylePromise;

  inflightStylePromise = (async () => {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 4500);
      const res = await fetch('https://tiles.openfreemap.org/styles/liberty', {
        signal: controller.signal,
      });
      clearTimeout(tid);
      if (res.ok) {
        const json = await res.json();
        if (json && json.version === 8 && json.sources && Array.isArray(json.layers)) {
          cachedOpenFreeMapStyle = json as StyleSpecification;
          return cachedOpenFreeMapStyle;
        }
      }
    } catch {
      // Fallback imediato para raster Carto/OSM sem travar o mapa
    } finally {
      inflightStylePromise = null;
    }
    return OSM_RASTER_FALLBACK_STYLE;
  })();

  return inflightStylePromise;
}

function createVehicleMarkerElement(style: 'uber_puck' | 'driver_arrow' | 'passenger_car'): HTMLElement {
  const el = document.createElement('div');
  el.style.pointerEvents = 'none';

  if (style === 'uber_puck') {
    el.style.width = '50px';
    el.style.height = '50px';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.innerHTML = `
      <div style="
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.96);
        border: 3px solid #111111;
        box-shadow: 0 5px 16px rgba(0,0,0,0.34);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#111111">
          <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" />
        </svg>
      </div>
    `;
    return el;
  }

  const iconSrc = style === 'driver_arrow' ? '/driver-arrow-marker.png' : '/car-marker-v2.png';
  const imgW = style === 'driver_arrow' ? 50 : 38;
  const imgH = style === 'driver_arrow' ? 56 : 62;
  el.style.width = '68px';
  el.style.height = '68px';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.innerHTML = `
    <div style="position: relative; width: 68px; height: 68px; display: flex; align-items: center; justify-content: center;">
      <div style="position: absolute; width: 54px; height: 54px; border-radius: 50%; background: rgba(118, 216, 0, 0.22); border: 1.5px solid rgba(118, 216, 0, 0.55);"></div>
      <img
        src="${iconSrc}"
        alt="Veículo"
        style="width: ${imgW}px; height: ${imgH}px; object-fit: contain; filter: drop-shadow(0 5px 10px rgba(0,0,0,0.45)); position: relative; z-index: 2;"
      />
    </div>
  `;
  return el;
}

function createPickupElement(mode: 'searching' | 'pickup' | 'uber_green_pin'): HTMLElement {
  const el = document.createElement('div');
  el.style.pointerEvents = 'none';

  if (mode === 'uber_green_pin') {
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;">
        <div style="
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: #15803D;
          border: 3px solid #FFFFFF;
          box-shadow: 0 4px 12px rgba(21,128,61,0.45);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="width: 10px; height: 10px; background: #DCFCE7; border-radius: 2px;"></div>
        </div>
        <div style="width: 3px; height: 11px; background: #15803D; border-radius: 2px; margin-top: -1px;"></div>
        <div style="width: 8px; height: 4px; border-radius: 50%; background: rgba(0,0,0,0.25);"></div>
      </div>
    `;
    return el;
  }

  if (mode === 'searching') {
    el.innerHTML = `
      <div style="position: relative; width: 72px; height: 72px; display: flex; align-items: center; justify-content: center;">
        <div class="kavro-map-sonar"></div>
        <div class="kavro-map-sonar-delay"></div>
        <div style="position: relative; z-index: 2; width: 22px; height: 22px; border-radius: 50%; background: #76D800; border: 3px solid #FFFFFF; box-shadow: 0 3px 10px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center;">
          <div style="width: 7px; height: 7px; border-radius: 50%; background: #121A21;"></div>
        </div>
      </div>
    `;
    return el;
  }

  el.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center;">
      <div style="background: #121A21; color: #76D800; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 10px; border: 1px solid #76D800; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.25); margin-bottom: 2px;">
        EMBARQUE
      </div>
      <div style="width: 22px; height: 22px; border-radius: 50%; background: #76D800; border: 3px solid #FFFFFF; box-shadow: 0 3px 10px rgba(118, 216, 0, 0.5); display: flex; align-items: center; justify-content: center;">
        <div style="width: 6px; height: 6px; border-radius: 50%; background: #121A21;"></div>
      </div>
    </div>
  `;
  return el;
}

function createDestinationElement(): HTMLElement {
  const el = document.createElement('div');
  el.style.pointerEvents = 'none';
  el.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center;">
      <div style="background: #121A21; color: #FFFFFF; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 10px; border: 1px solid #475569; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.25); margin-bottom: 2px;">
        DESTINO
      </div>
      <div style="width: 22px; height: 22px; border-radius: 50%; background: #121A21; border: 3px solid #FFFFFF; box-shadow: 0 3px 10px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;">
        <div style="width: 6px; height: 6px; border-radius: 50%; background: #76D800;"></div>
      </div>
    </div>
  `;
  return el;
}

function createClientLiveElement(): HTMLElement {
  const el = document.createElement('div');
  el.style.pointerEvents = 'none';
  el.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center;">
      <div style="background: #2563EB; color: #FFFFFF; font-size: 9px; font-weight: 800; padding: 2px 7px; border-radius: 10px; border: 1px solid #FFFFFF; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.25); margin-bottom: 2px;">
        PASSAGEIRO
      </div>
      <div style="width: 18px; height: 18px; border-radius: 50%; background: #2563EB; border: 3px solid #FFFFFF; box-shadow: 0 3px 10px rgba(37, 99, 235, 0.6);"></div>
    </div>
  `;
  return el;
}

const SOURCE_REMAINING = 'kavro-route-remaining-src';
const SOURCE_TRAVELED = 'kavro-route-traveled-src';
const LAYER_TRAVELED = 'kavro-route-traveled-line';
const LAYER_CASING = 'kavro-route-casing-line';
const LAYER_REMAINING = 'kavro-route-remaining-line';

function buildRouteGeoJson(coords: [number, number][]): GeoJSON.FeatureCollection {
  if (!coords || coords.length < 2) {
    return { type: 'FeatureCollection', features: [] };
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: coords.map(([lat, lng]) => [lng, lat]),
        },
      },
    ],
  };
}

function getDynamicNavZoom(speedKmH: number): number {
  if (speedKmH >= 75) return 15.8;
  if (speedKmH >= 50) return 16.4;
  if (speedKmH >= 25) return 17.0;
  return 17.4;
}

export const MapLibreNavCanvas: React.FC<MapLibreNavCanvasProps> = ({
  vehiclePos,
  vehicleStyle = 'driver_arrow',
  speedKmH = 0,
  cameraMode,
  recenterSignal = 0,
  onUserPanMap,
  mapLayer = 'streets',
  routeCoordinates = [],
  snappedSegmentIndex = 0,
  isSnappedToRoute = false,
  routeColor = '#276EF1',
  pickupPoint,
  pickupMode = 'pickup',
  destinationPoint,
  clientLivePoint,
  navPadding = { top: 130, bottom: 160, left: 20, right: 20 },
  overviewPadding = { top: 90, bottom: 130, left: 44, right: 44 },
  showVehicleMarker = true,
  fallbackCenter = DEFAULT_FALLBACK_CENTER,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const styleReadyRef = useRef<boolean>(false);
  const activeLayerRef = useRef<'streets' | 'hybrid'>(mapLayer);
  const initialLayerRef = useRef<'streets' | 'hybrid'>(mapLayer);
  const fallbackAppliedRef = useRef<boolean>(false);

  const vehicleMarkerRef = useRef<Marker | null>(null);
  const pickupMarkerRef = useRef<Marker | null>(null);
  const destMarkerRef = useRef<Marker | null>(null);
  const clientMarkerRef = useRef<Marker | null>(null);

  const cameraModeRef = useRef<NavCameraMode>(cameraMode);
  const speedRef = useRef<number>(speedKmH);
  const navPaddingRef = useRef(navPadding);
  const overviewPaddingRef = useRef(overviewPadding);
  const routeCoordsRef = useRef(routeCoordinates);
  const snappedIdxRef = useRef(snappedSegmentIndex);
  const isSnappedRef = useRef(isSnappedToRoute);
  const routeColorRef = useRef(routeColor);
  const onUserPanRef = useRef(onUserPanMap);

  const targetVehicleRef = useRef<{ lat: number; lng: number; heading: number } | null>(
    vehiclePos ? { lat: vehiclePos.lat, lng: vehiclePos.lng, heading: vehiclePos.heading || 0 } : null
  );
  const animStateRef = useRef<{
    lat: number;
    lng: number;
    heading: number;
    zoom: number;
    pitch: number;
    bearing: number;
  }>({
    lat: vehiclePos?.lat || fallbackCenter[0],
    lng: vehiclePos?.lng || fallbackCenter[1],
    heading: vehiclePos?.heading || 0,
    zoom: 16.5,
    pitch: cameraMode === 'heading_3d' ? 50 : 0,
    bearing: cameraMode === 'heading_3d' ? (vehiclePos?.heading || 0) : 0,
  });
  const isUserInteractingRef = useRef<boolean>(false);
  const transitionEaseUntilRef = useRef<number>(0);

  useEffect(() => {
    cameraModeRef.current = cameraMode;
    speedRef.current = speedKmH;
    navPaddingRef.current = navPadding;
    overviewPaddingRef.current = overviewPadding;
    routeCoordsRef.current = routeCoordinates;
    snappedIdxRef.current = snappedSegmentIndex;
    isSnappedRef.current = isSnappedToRoute;
    routeColorRef.current = routeColor;
    onUserPanRef.current = onUserPanMap;
  }, [
    cameraMode,
    speedKmH,
    navPadding,
    overviewPadding,
    routeCoordinates,
    snappedSegmentIndex,
    isSnappedToRoute,
    routeColor,
    onUserPanMap,
  ]);

  const syncRouteLayersOnMap = (map: MapLibreMap) => {
    if (!map || !styleReadyRef.current) return;
    try {
      const coords = routeCoordsRef.current;
      const veh = targetVehicleRef.current;
      let traveled: [number, number][] = [];
      let remaining: [number, number][] = coords;

      if (isSnappedRef.current && veh && coords.length >= 2 && snappedIdxRef.current > 0) {
        const idx = Math.max(0, Math.min(coords.length - 2, snappedIdxRef.current));
        traveled = [...coords.slice(0, idx + 1), [veh.lat, veh.lng]];
        remaining = [[veh.lat, veh.lng], ...coords.slice(idx + 1)];
      }

      const remainingJson = buildRouteGeoJson(remaining);
      const traveledJson = buildRouteGeoJson(traveled);

      const existingRem = map.getSource(SOURCE_REMAINING) as GeoJSONSource | undefined;
      const existingTrav = map.getSource(SOURCE_TRAVELED) as GeoJSONSource | undefined;

      if (!existingTrav) {
        map.addSource(SOURCE_TRAVELED, { type: 'geojson', data: traveledJson });
      } else {
        existingTrav.setData(traveledJson);
      }

      if (!existingRem) {
        map.addSource(SOURCE_REMAINING, { type: 'geojson', data: remainingJson });
      } else {
        existingRem.setData(remainingJson);
      }

      if (!map.getLayer(LAYER_TRAVELED)) {
        map.addLayer({
          id: LAYER_TRAVELED,
          type: 'line',
          source: SOURCE_TRAVELED,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#94A3B8',
            'line-width': 5,
            'line-opacity': 0.68,
          },
        });
      }

      if (!map.getLayer(LAYER_CASING)) {
        map.addLayer({
          id: LAYER_CASING,
          type: 'line',
          source: SOURCE_REMAINING,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#0F172A',
            'line-width': 10,
            'line-opacity': 0.85,
          },
        });
      }

      if (!map.getLayer(LAYER_REMAINING)) {
        map.addLayer({
          id: LAYER_REMAINING,
          type: 'line',
          source: SOURCE_REMAINING,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': routeColorRef.current,
            'line-width': 6,
            'line-opacity': 0.98,
          },
        });
      } else {
        map.setPaintProperty(LAYER_REMAINING, 'line-color', routeColorRef.current);
      }
    } catch {
      // Ignora atualização transitória enquanto o estilo ainda finaliza troca
    }
  };

  // Inicialização do mapa MapLibre GL JS
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let destroyed = false;
    const initLayer = initialLayerRef.current;
    const initCenter: [number, number] = [
      animStateRef.current.lng,
      animStateRef.current.lat,
    ];

    const map = new MapLibreMap({
      container,
      style: initLayer === 'hybrid' ? HYBRID_SATELLITE_STYLE : OSM_RASTER_FALLBACK_STYLE,
      center: initCenter,
      zoom: animStateRef.current.zoom,
      pitch: cameraModeRef.current === 'heading_3d' ? 50 : 0,
      bearing: cameraModeRef.current === 'heading_3d' ? animStateRef.current.heading : 0,
      attributionControl: false,
      pitchWithRotate: true,
      dragRotate: true,
    });

    mapRef.current = map;

    if (initLayer === 'streets') {
      getFreeVectorStreetStyle().then((styleSpec) => {
        if (destroyed || activeLayerRef.current !== 'streets') return;
        if (styleSpec !== OSM_RASTER_FALLBACK_STYLE) {
          styleReadyRef.current = false;
          map.setStyle(styleSpec);
        }
      });
    }

    let styleErrorCount = 0;
    const handleMapError = () => {
      styleErrorCount += 1;
      if (
        !destroyed &&
        !fallbackAppliedRef.current &&
        activeLayerRef.current === 'streets' &&
        styleErrorCount >= 4 &&
        !styleReadyRef.current
      ) {
        fallbackAppliedRef.current = true;
        map.setStyle(OSM_RASTER_FALLBACK_STYLE);
      }
    };

    const handleStyleLoad = () => {
      if (destroyed) return;
      styleReadyRef.current = true;
      syncRouteLayersOnMap(map);
    };

    const handleDragOrRotateStart = (e: { originalEvent?: unknown }) => {
      if (!e?.originalEvent) return;
      isUserInteractingRef.current = true;
      if (cameraModeRef.current !== 'free' && onUserPanRef.current) {
        onUserPanRef.current();
      }
    };

    const handleDragOrRotateEnd = () => {
      isUserInteractingRef.current = false;
    };

    map.on('error', handleMapError);
    map.on('style.load', handleStyleLoad);
    map.on('load', handleStyleLoad);
    map.on('dragstart', handleDragOrRotateStart);
    map.on('rotatestart', handleDragOrRotateStart);
    map.on('dragend', handleDragOrRotateEnd);
    map.on('rotateend', handleDragOrRotateEnd);

    // Loop de animação contínua a 60fps para o veículo e câmera 3D Heading-Up
    let rafId = 0;
    let lastFrameTime = performance.now();

    const tick = (now: number) => {
      if (destroyed) return;
      const dtSec = Math.min(0.1, Math.max(0.001, (now - lastFrameTime) / 1000));
      lastFrameTime = now;

      const target = targetVehicleRef.current;
      const anim = animStateRef.current;

      if (target && Number.isFinite(target.lat) && Number.isFinite(target.lng)) {
        const posBlend = 1 - Math.exp(-dtSec * 6.5);
        const rotBlend = 1 - Math.exp(-dtSec * 7.5);

        anim.lat += (target.lat - anim.lat) * posBlend;
        anim.lng += (target.lng - anim.lng) * posBlend;
        anim.heading = normalizeAngle360(
          anim.heading + shortestAngleDelta(anim.heading, target.heading) * rotBlend
        );

        if (vehicleMarkerRef.current) {
          vehicleMarkerRef.current.setLngLat([anim.lng, anim.lat]);
          vehicleMarkerRef.current.setRotation(anim.heading);
        }

        const mode = cameraModeRef.current;
        if (
          !isUserInteractingRef.current &&
          now > transitionEaseUntilRef.current &&
          (mode === 'heading_3d' || mode === 'north_follow')
        ) {
          const desiredBearing = mode === 'heading_3d' ? anim.heading : 0;
          const desiredPitch = mode === 'heading_3d' ? 50 : 0;
          const desiredZoom = mode === 'heading_3d' ? getDynamicNavZoom(speedRef.current) : 16.2;

          const camBlend = 1 - Math.exp(-dtSec * 4.5);
          anim.bearing = normalizeAngle360(
            anim.bearing + shortestAngleDelta(anim.bearing, desiredBearing) * camBlend
          );
          anim.pitch += (desiredPitch - anim.pitch) * camBlend;
          anim.zoom += (desiredZoom - anim.zoom) * (1 - Math.exp(-dtSec * 2.2));

          map.jumpTo({
            center: [anim.lng, anim.lat],
            bearing: anim.bearing,
            pitch: anim.pitch,
            zoom: anim.zoom,
            padding:
              mode === 'heading_3d'
                ? navPaddingRef.current
                : { top: 40, bottom: 40, left: 20, right: 20 },
          });
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    const resizeObserver = new ResizeObserver(() => {
      if (!destroyed) map.resize();
    });
    resizeObserver.observe(container);

    return () => {
      destroyed = true;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      vehicleMarkerRef.current?.remove();
      pickupMarkerRef.current?.remove();
      destMarkerRef.current?.remove();
      clientMarkerRef.current?.remove();
      vehicleMarkerRef.current = null;
      pickupMarkerRef.current = null;
      destMarkerRef.current = null;
      clientMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Troca de camada Ruas 3D <-> Satélite Híbrido
  useEffect(() => {
    const map = mapRef.current;
    if (!map || activeLayerRef.current === mapLayer) return;
    activeLayerRef.current = mapLayer;
    styleReadyRef.current = false;

    if (mapLayer === 'hybrid') {
      map.setStyle(HYBRID_SATELLITE_STYLE);
    } else {
      getFreeVectorStreetStyle().then((styleSpec) => {
        if (mapRef.current && activeLayerRef.current === 'streets') {
          mapRef.current.setStyle(styleSpec);
        }
      });
    }
  }, [mapLayer]);

  // Atualiza alvo do veículo
  const vehLat = vehiclePos?.lat;
  const vehLng = vehiclePos?.lng;
  const vehHeading = vehiclePos?.heading;

  useEffect(() => {
    if (
      typeof vehLat !== 'number' ||
      typeof vehLng !== 'number' ||
      !Number.isFinite(vehLat) ||
      !Number.isFinite(vehLng)
    ) {
      targetVehicleRef.current = null;
      return;
    }
    const prevTarget = targetVehicleRef.current;
    const normHeading = normalizeAngle360(vehHeading || 0);
    targetVehicleRef.current = {
      lat: vehLat,
      lng: vehLng,
      heading: normHeading,
    };
    if (!prevTarget) {
      animStateRef.current.lat = vehLat;
      animStateRef.current.lng = vehLng;
      animStateRef.current.heading = normHeading;
      animStateRef.current.bearing =
        cameraModeRef.current === 'heading_3d' ? normHeading : 0;
    }
  }, [vehLat, vehLng, vehHeading]);

  // Gerencia o marcador do veículo
  const hasVehiclePos =
    typeof vehLat === 'number' &&
    typeof vehLng === 'number' &&
    Number.isFinite(vehLat) &&
    Number.isFinite(vehLng);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!showVehicleMarker || !hasVehiclePos) {
      vehicleMarkerRef.current?.remove();
      vehicleMarkerRef.current = null;
      return;
    }

    if (!vehicleMarkerRef.current) {
      const el = createVehicleMarkerElement(vehicleStyle);
      vehicleMarkerRef.current = new Marker({
        element: el,
        anchor: 'center',
        rotationAlignment: 'map',
        pitchAlignment: 'map',
      })
        .setLngLat([animStateRef.current.lng, animStateRef.current.lat])
        .setRotation(animStateRef.current.heading)
        .addTo(map);
    }
  }, [showVehicleMarker, hasVehiclePos, vehicleStyle]);

  // Atualiza geometria da rota
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReadyRef.current) return;
    syncRouteLayersOnMap(map);
  }, [routeCoordinates, snappedSegmentIndex, isSnappedToRoute, routeColor, vehLat, vehLng]);

  // Marcador de Embarque
  const pickLat = pickupPoint?.lat;
  const pickLng = pickupPoint?.lng;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (
      typeof pickLat !== 'number' ||
      typeof pickLng !== 'number' ||
      !Number.isFinite(pickLat) ||
      !Number.isFinite(pickLng)
    ) {
      pickupMarkerRef.current?.remove();
      pickupMarkerRef.current = null;
      return;
    }
    pickupMarkerRef.current?.remove();
    pickupMarkerRef.current = new Marker({
      element: createPickupElement(pickupMode),
      anchor: pickupMode === 'searching' ? 'center' : 'bottom',
    })
      .setLngLat([pickLng, pickLat])
      .addTo(map);
  }, [pickLat, pickLng, pickupMode]);

  // Marcador de Destino
  const destLat = destinationPoint?.lat;
  const destLng = destinationPoint?.lng;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (
      typeof destLat !== 'number' ||
      typeof destLng !== 'number' ||
      !Number.isFinite(destLat) ||
      !Number.isFinite(destLng)
    ) {
      destMarkerRef.current?.remove();
      destMarkerRef.current = null;
      return;
    }
    if (!destMarkerRef.current) {
      destMarkerRef.current = new Marker({
        element: createDestinationElement(),
        anchor: 'bottom',
      })
        .setLngLat([destLng, destLat])
        .addTo(map);
    } else {
      destMarkerRef.current.setLngLat([destLng, destLat]);
    }
  }, [destLat, destLng]);

  // Marcador ao Vivo do Passageiro
  const cliLat = clientLivePoint?.lat;
  const cliLng = clientLivePoint?.lng;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (
      typeof cliLat !== 'number' ||
      typeof cliLng !== 'number' ||
      !Number.isFinite(cliLat) ||
      !Number.isFinite(cliLng)
    ) {
      clientMarkerRef.current?.remove();
      clientMarkerRef.current = null;
      return;
    }
    if (!clientMarkerRef.current) {
      clientMarkerRef.current = new Marker({
        element: createClientLiveElement(),
        anchor: 'bottom',
      })
        .setLngLat([cliLng, cliLat])
        .addTo(map);
    } else {
      clientMarkerRef.current.setLngLat([cliLng, cliLat]);
    }
  }, [cliLat, cliLng]);

  // Transições explícitas de câmera (Overview <-> Heading-Up 3D <-> North Follow <-> Recenter)
  const routeLength = routeCoordinates.length;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (cameraMode === 'overview') {
      const bounds = new LngLatBounds();
      let count = 0;
      for (const [lat, lng] of routeCoordsRef.current) {
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          bounds.extend([lng, lat]);
          count += 1;
        }
      }
      if (typeof pickLat === 'number' && typeof pickLng === 'number' && Number.isFinite(pickLat) && Number.isFinite(pickLng)) {
        bounds.extend([pickLng, pickLat]);
        count += 1;
      }
      if (typeof destLat === 'number' && typeof destLng === 'number' && Number.isFinite(destLat) && Number.isFinite(destLng)) {
        bounds.extend([destLng, destLat]);
        count += 1;
      }
      if (showVehicleMarker && targetVehicleRef.current) {
        bounds.extend([targetVehicleRef.current.lng, targetVehicleRef.current.lat]);
        count += 1;
      }

      if (count >= 2) {
        transitionEaseUntilRef.current = performance.now() + 750;
        map.fitBounds(bounds, {
          padding: overviewPaddingRef.current,
          maxZoom: 16.2,
          bearing: 0,
          pitch: 0,
          duration: 650,
        });
      }
      return;
    }

    if ((cameraMode === 'heading_3d' || cameraMode === 'north_follow') && targetVehicleRef.current) {
      const curTarget = targetVehicleRef.current;
      const targetBearing = cameraMode === 'heading_3d' ? normalizeAngle360(curTarget.heading || 0) : 0;
      const targetPitch = cameraMode === 'heading_3d' ? 50 : 0;
      const targetZoom = cameraMode === 'heading_3d' ? getDynamicNavZoom(speedRef.current) : 16.2;

      animStateRef.current.bearing = targetBearing;
      animStateRef.current.pitch = targetPitch;
      animStateRef.current.zoom = targetZoom;

      transitionEaseUntilRef.current = performance.now() + 650;
      map.easeTo({
        center: [curTarget.lng, curTarget.lat],
        bearing: targetBearing,
        pitch: targetPitch,
        zoom: targetZoom,
        padding:
          cameraMode === 'heading_3d'
            ? navPaddingRef.current
            : { top: 40, bottom: 40, left: 20, right: 20 },
        duration: 600,
      });
    }
  }, [cameraMode, recenterSignal, routeLength, pickLat, pickLng, destLat, destLng, showVehicleMarker]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        backgroundColor: '#E8EDF3',
      }}
    />
  );
};
