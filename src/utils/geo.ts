// Utilitários de geolocalização, cálculo de distâncias, rotas e URLs do Google Maps
import { LocationPoint } from '../types';

/**
 * Calcula a distância geodésica em quilômetros usando a fórmula de Haversine
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Raio da Terra em km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightDistance = R * c;

  // Em rotas urbanas e rodoviárias, a distância real por ruas costuma ser entre 1.25 a 1.35x a linha reta
  return Math.round(straightDistance * 1.3 * 10) / 10;
}

/**
 * Estima a duração de trânsito em minutos com base na distância
 */
export function estimateDurationMinutes(distanceKm: number): number {
  // Média urbana de 28-35 km/h + tempo de semáforos/embarque (5 min)
  const speedKmH = 32;
  const transitTime = (distanceKm / speedKmH) * 60;
  return Math.max(5, Math.round(transitTime + 5));
}

/**
 * Gera URL oficial do Google Maps para abrir a rota de navegação
 */
export function getGoogleMapsRouteUrl(origin: LocationPoint, destination: LocationPoint): string {
  const orig = origin.lat && origin.lng ? `${origin.lat},${origin.lng}` : encodeURIComponent(origin.address);
  const dest = destination.lat && destination.lng ? `${destination.lat},${destination.lng}` : encodeURIComponent(destination.address);
  return `https://www.google.com/maps/dir/?api=1&origin=${orig}&destination=${dest}&travelmode=driving`;
}

/**
 * Gera URL oficial do Google Maps para abrir um local específico
 */
export function getGoogleMapsPlaceUrl(point: LocationPoint): string {
  if (point.lat && point.lng) {
    return `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(point.address)}`;
}

// Base de bairros, comunidades e locais de referência em Lauro Müller e região
const LOCAL_POINTS_DATABASE = [
  { name: 'Centro, Lauro Müller - SC', lat: -28.39123, lng: -49.39354, aliases: ['centro', 'lauro muller', 'laura muller', 'praça', 'matriz'] },
  { name: 'Hospital Henrique Lage - Centro, Lauro Müller - SC', lat: -28.39201, lng: -49.39402, aliases: ['hospital', 'henrique lage', 'saude', 'pronto socorro'] },
  { name: 'Prefeitura Municipal - Centro, Lauro Müller - SC', lat: -28.39260, lng: -49.39519, aliases: ['prefeitura', 'governo', 'municipal'] },
  { name: 'Terminal Rodoviário Rolando Perico - Bela Vista, Lauro Müller - SC', lat: -28.38480, lng: -49.39050, aliases: ['rodoviaria', 'onibus', 'terminal'] },
  { name: 'Coletora, Lauro Müller - SC', lat: -28.41697, lng: -49.40080, aliases: ['coletora', 'sc-440'] },
  { name: 'Guatá, Lauro Müller - SC', lat: -28.37580, lng: -49.43250, aliases: ['guata', 'guatá'] },
  { name: 'Barro Branco, Lauro Müller - SC', lat: -28.39650, lng: -49.41820, aliases: ['barro branco'] },
  { name: 'Itanema, Lauro Müller - SC', lat: -28.36140, lng: -49.38720, aliases: ['itanema'] },
  { name: 'Rua da Figueira - Itanema, Lauro Müller - SC', lat: -28.36200, lng: -49.38800, aliases: ['figueira', 'rua da figueira'] },
  { name: 'Mina Nova, Lauro Müller - SC', lat: -28.38420, lng: -49.42150, aliases: ['mina nova'] },
  { name: 'Bela Vista, Lauro Müller - SC', lat: -28.38520, lng: -49.39100, aliases: ['bela vista'] },
  { name: 'Arizona, Lauro Müller - SC', lat: -28.39250, lng: -49.40720, aliases: ['arizona'] },
  { name: 'Sumaré, Lauro Müller - SC', lat: -28.38050, lng: -49.40200, aliases: ['sumare', 'sumaré'] },
  { name: 'Cairú, Lauro Müller - SC', lat: -28.39700, lng: -49.39500, aliases: ['cairu', 'cairú'] },
  { name: 'Içarense, Lauro Müller - SC', lat: -28.38200, lng: -49.39950, aliases: ['içarense', 'icarense'] },
  { name: 'Km 1, Lauro Müller - SC', lat: -28.39320, lng: -49.39850, aliases: ['km 1', 'km1', 'bruno benedet'] },
  { name: 'Santa Bárbara, Lauro Müller - SC', lat: -28.37000, lng: -49.41000, aliases: ['santa barbara', 'santa bárbara'] },
  { name: 'Serra do Rio do Rastro - SC-390, Lauro Müller - SC', lat: -28.38850, lng: -49.54800, aliases: ['serra', 'rio do rastro', 'mirante', 'sc-390'] },
  { name: 'Centro, Orleans - SC', lat: -28.35890, lng: -49.29170, aliases: ['orleans', 'orleans centro'] },
  { name: 'Centro, Criciúma - SC', lat: -28.67750, lng: -49.36950, aliases: ['criciuma', 'criciúma'] },
  { name: 'Centro, Braço do Norte - SC', lat: -28.27360, lng: -49.16580, aliases: ['braço do norte', 'braco do norte'] },
  { name: 'Centro, Urussanga - SC', lat: -28.52440, lng: -49.32110, aliases: ['urussanga'] },
  { name: 'Centro, Tubarão - SC', lat: -28.47390, lng: -49.00690, aliases: ['tubarão', 'tubarao'] },
];

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Busca de endereço ultra-rápida e tolerante a erros de digitação (ex: "laura muller" -> Lauro Müller)
 * Prioriza base local + Photon Geocoder com viés na região + Fallback Nominatim
 */
export async function searchAddressGeocode(
  query: string,
  userLat = -28.3878,
  userLng = -49.3977
): Promise<Array<{
  display_name: string;
  lat: number;
  lng: number;
}>> {
  if (!query || query.trim().length < 2) return [];

  const rawClean = query.trim();
  const normQ = normalizeText(rawClean).replace(/\blaura\b/g, 'lauro');
  const tokens = normQ.split(/\s+/).filter(Boolean);

  // 1. Busca imediata na base local de bairros e pontos de Lauro Müller & região
  const localMatches = LOCAL_POINTS_DATABASE.filter(item => {
    const itemNorm = normalizeText(item.name);
    const aliasesNorm = item.aliases.map(normalizeText);
    return tokens.every(t => itemNorm.includes(t) || aliasesNorm.some(a => a.includes(t)));
  }).map(item => ({
    display_name: item.name,
    lat: item.lat,
    lng: item.lng
  }));

  // 2. Consulta Photon Geocoder com viés local nas coordenadas de Lauro Müller / mapa atual
  let photonMatches: Array<{ display_name: string; lat: number; lng: number }> = [];
  try {
    const photonQuery = normQ.includes('lauro muller') || normQ.includes('lauro') 
      ? normQ 
      : `${normQ} Lauro Müller`;
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(photonQuery)}&limit=8&lat=${userLat}&lon=${userLng}&lang=default`;
    const res = await fetch(photonUrl);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.features)) {
        photonMatches = data.features.map((f: any) => {
          const p = f.properties || {};
          const parts: string[] = [];
          if (p.name) parts.push(p.name);
          if (p.street && p.street !== p.name) {
            parts.push(p.housenumber ? `${p.street}, ${p.housenumber}` : p.street);
          } else if (p.housenumber && parts.length > 0) {
            parts[0] += `, ${p.housenumber}`;
          }
          if (p.district && p.district !== p.name) parts.push(p.district);
          const city = p.city || p.town || p.municipality;
          if (city && city !== p.name && city !== p.district) parts.push(city);
          if (p.state) parts.push(p.state);

          return {
            display_name: parts.join(', '),
            lat: Number(f.geometry.coordinates[1]),
            lng: Number(f.geometry.coordinates[0])
          };
        });
      }
    }
  } catch (err) {
    console.warn('Photon geocode error:', err);
  }

  // 3. Fallback Nominatim se Photon não trouxer resultados
  let nominatimMatches: Array<{ display_name: string; lat: number; lng: number }> = [];
  if (localMatches.length === 0 && photonMatches.length === 0) {
    try {
      const nomQuery = normQ.includes('sc') || normQ.includes('santa catarina') ? normQ : `${normQ}, Santa Catarina, Brasil`;
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(nomQuery)}&addressdetails=1&limit=6&countrycodes=br`;
      const response = await fetch(url, { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' } });
      if (response.ok) {
        const data = await response.json();
        nominatimMatches = data.map((item: any) => ({
          display_name: item.display_name,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
        }));
      }
    } catch {
      // ignore
    }
  }

  // 4. Une os resultados e elimina duplicatas de endereço
  const combined = [...localMatches, ...photonMatches, ...nominatimMatches];
  const unique: Array<{ display_name: string; lat: number; lng: number }> = [];
  const seen = new Set<string>();

  for (const item of combined) {
    const key = normalizeText(item.display_name);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  return unique.slice(0, 8);
}

/**
 * Geocodificação reversa (coordenadas para endereço textual real com fallback)
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const stateMap: Record<string, string> = {
    'Santa Catarina': 'SC',
    'Rio Grande do Sul': 'RS',
    'Paraná': 'PR',
    'São Paulo': 'SP',
    'Rio de Janeiro': 'RJ',
    'Minas Gerais': 'MG',
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const addr = data.address || {};
      const road = addr.road || addr.pedestrian || addr.footway || addr.path || addr.residential || '';
      const num = addr.house_number ? `, ${addr.house_number}` : '';
      const suburbRaw = addr.suburb || addr.neighbourhood || addr.quarter || addr.city_district || addr.hamlet || '';
      const cityRaw = addr.city || addr.town || addr.village || addr.municipality || '';
      const stateRaw = addr.state || '';
      const uf = stateMap[stateRaw] || (addr['ISO3166-2-lvl4'] ? String(addr['ISO3166-2-lvl4']).replace('BR-', '') : '');

      const suburbPart = suburbRaw && suburbRaw !== road && suburbRaw !== cityRaw ? ` - ${suburbRaw}` : '';
      const cityPart = cityRaw ? `, ${cityRaw}${uf ? `/${uf}` : ''}` : '';

      if (road) {
        return `${road}${num}${suburbPart}${cityPart}`;
      }
      if (suburbRaw && cityRaw) {
        return `${suburbRaw}, ${cityRaw}${uf ? `/${uf}` : ''}`;
      }
      if (cityRaw) {
        return `${cityRaw}${uf ? `/${uf}` : ''}`;
      }
      if (data.display_name) {
        return String(data.display_name).split(',').slice(0, 3).join(',').trim();
      }
    }
  } catch {
    // Continua para fallback secundário
  }

  try {
    const fallbackUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=pt`;
    const res = await fetch(fallbackUrl);
    if (res.ok) {
      const bdc = await res.json();
      const locality = bdc.locality || '';
      const city = bdc.city || bdc.principalSubdivision || '';
      const uf = bdc.principalSubdivisionCode ? String(bdc.principalSubdivisionCode).replace('BR-', '') : '';
      if (locality && city && locality !== city) {
        return `${locality}, ${city}${uf ? `/${uf}` : ''}`;
      }
      if (city) {
        return `${city}${uf ? `/${uf}` : ''}`;
      }
    }
  } catch {
    // ignore
  }

  return `GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/**
 * Projeta um ponto (lat, lng) para o ponto mais próximo sobre a rota viária (polyline OSRM).
 * Evita que o ícone do carro fique dentro de casas, calçadas ou pátios.
 * Retorna { lat, lng, heading } alinhado à direção da via.
 */
export function snapPointToRoute(
  point: { lat: number; lng: number; heading?: number },
  polyline: [number, number][],
  maxSnapDistanceMeters = 150
): { lat: number; lng: number; heading: number } {
  if (!point || !point.lat || !point.lng) {
    return { lat: 0, lng: 0, heading: 0 };
  }
  if (!polyline || polyline.length < 2) {
    return { lat: point.lat, lng: point.lng, heading: point.heading || 0 };
  }

  const pLat = point.lat;
  const pLng = point.lng;
  const latRad = (pLat * Math.PI) / 180;
  const cosLat = Math.cos(latRad);
  const mPerDegLat = 110540;
  const mPerDegLng = 111320 * cosLat;

  let minDistanceMeters = Infinity;
  let bestLat = pLat;
  let bestLng = pLng;
  let bestHeading = point.heading || 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const [aLat, aLng] = polyline[i];
    const [bLat, bLng] = polyline[i + 1];

    // Converte segmento e ponto para metros relativos a P
    const ax = (aLng - pLng) * mPerDegLng;
    const ay = (aLat - pLat) * mPerDegLat;
    const bx = (bLng - pLng) * mPerDegLng;
    const by = (bLat - pLat) * mPerDegLat;

    const dx = bx - ax;
    const dy = by - ay;
    const segLenSq = dx * dx + dy * dy;

    let t = 0;
    if (segLenSq > 0.0001) {
      // Projeção escalar de (P - A) sobre (B - A): com P=(0,0), P - A = -A
      t = -(ax * dx + ay * dy) / segLenSq;
      t = Math.max(0, Math.min(1, t));
    }

    const qx = ax + t * dx;
    const qy = ay + t * dy;
    const distMeters = Math.sqrt(qx * qx + qy * qy);

    if (distMeters < minDistanceMeters) {
      minDistanceMeters = distMeters;
      bestLat = pLat + qy / mPerDegLat;
      bestLng = pLng + qx / mPerDegLng;

      // Ângulo do segmento da rua em graus (0° = Norte, 90° = Leste, 180° = Sul, 270° = Oeste)
      const segAngle = (Math.atan2(dx, dy) * 180) / Math.PI;
      const normalizedAngle = (segAngle + 360) % 360;
      bestHeading = Math.round(normalizedAngle);
    }
  }

  // Se o ponto estiver razoavelmente perto da rota (< maxSnapDistanceMeters), encaixa perfeitamente na rota
  if (minDistanceMeters <= maxSnapDistanceMeters) {
    return {
      lat: bestLat,
      lng: bestLng,
      heading: bestHeading
    };
  }

  // Se estiver além do limite da rota (ex: o motorista ainda está em outro bairro distante),
  // mantém o ponto real do GPS com seu próprio heading
  return {
    lat: pLat,
    lng: pLng,
    heading: point.heading || 0
  };
}
