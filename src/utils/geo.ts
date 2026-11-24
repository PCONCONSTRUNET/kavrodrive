// Utilitários de geolocalização, cálculo de distâncias, rotas e URLs do Google Maps
import { LocationPoint } from '../types';

/**
 * Calcula a distância geodésica EXATA em metros usando a fórmula de Haversine,
 * sem multiplicador urbano e sem arredondamento grosseiro.
 * Essencial para gatilhos de manobra (45m / 30m), desvio de rota e proximidade real.
 */
export function calculateExactMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    return 0;
  }
  const R = 6371000; // Raio da Terra em metros
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Normaliza qualquer ângulo para o intervalo [0, 360).
 */
export function normalizeAngle360(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
}

/**
 * Menor diferença angular com sinal entre dois azimutes, no intervalo (-180, 180].
 */
export function shortestAngleDelta(fromDeg: number, toDeg: number): number {
  const from = normalizeAngle360(fromDeg);
  const to = normalizeAngle360(toDeg);
  let delta = to - from;
  if (delta > 180) delta -= 360;
  if (delta <= -180) delta += 360;
  return delta;
}

/**
 * Suavização circular de ângulos sem salto na transição 359° <-> 0°.
 */
export function smoothAngle(currentDeg: number, targetDeg: number, alpha = 0.35): number {
  if (!Number.isFinite(currentDeg)) return normalizeAngle360(targetDeg);
  if (!Number.isFinite(targetDeg)) return normalizeAngle360(currentDeg);
  return normalizeAngle360(currentDeg + shortestAngleDelta(currentDeg, targetDeg) * alpha);
}

/**
 * Calcula o azimute geográfico (bearing) entre dois pontos em graus [0, 360),
 * onde 0° = Norte, 90° = Leste, 180° = Sul, 270° = Oeste.
 */
export function calculateBearingDegrees(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return normalizeAngle360(brng);
}

/**
 * Calcula a distância estimada de trajeto em quilômetros usando Haversine + fator viário (1.3x)
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const straightKm = calculateExactMeters(lat1, lon1, lat2, lon2) / 1000;

  // Em rotas urbanas e rodoviárias, a distância real por ruas costuma ser entre 1.25 a 1.35x a linha reta
  return Math.round(straightKm * 1.3 * 10) / 10;
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
export const POPULAR_LOCAL_POINTS: Array<{ name: string; subtitle: string; lat: number; lng: number; aliases: string[] }> = [
  { name: 'Centro, Lauro Müller - SC', subtitle: 'Centro • Lauro Müller/SC', lat: -28.39123, lng: -49.39354, aliases: ['centro', 'lauro muller', 'laura muller', 'praça', 'matriz'] },
  { name: 'Hospital Henrique Lage', subtitle: 'Centro • Lauro Müller/SC', lat: -28.39201, lng: -49.39402, aliases: ['hospital', 'henrique lage', 'saude', 'pronto socorro'] },
  { name: 'Prefeitura Municipal', subtitle: 'Centro • Lauro Müller/SC', lat: -28.39260, lng: -49.39519, aliases: ['prefeitura', 'governo', 'municipal'] },
  { name: 'Terminal Rodoviário Rolando Perico', subtitle: 'Bela Vista • Lauro Müller/SC', lat: -28.38480, lng: -49.39050, aliases: ['rodoviaria', 'onibus', 'terminal'] },
  { name: 'Coletora, Lauro Müller - SC', subtitle: 'Coletora • SC-440', lat: -28.41697, lng: -49.40080, aliases: ['coletora', 'sc-440'] },
  { name: 'Guatá, Lauro Müller - SC', subtitle: 'Distrito de Guatá • Lauro Müller/SC', lat: -28.37580, lng: -49.43250, aliases: ['guata', 'guatá'] },
  { name: 'Barro Branco, Lauro Müller - SC', subtitle: 'Distrito de Barro Branco • Lauro Müller/SC', lat: -28.39650, lng: -49.41820, aliases: ['barro branco'] },
  { name: 'Itanema, Lauro Müller - SC', subtitle: 'Itanema • Lauro Müller/SC', lat: -28.36140, lng: -49.38720, aliases: ['itanema'] },
  { name: 'Rua da Figueira - Itanema', subtitle: 'Itanema • Lauro Müller/SC', lat: -28.36200, lng: -49.38800, aliases: ['figueira', 'rua da figueira'] },
  { name: 'Mina Nova, Lauro Müller - SC', subtitle: 'Mina Nova • Lauro Müller/SC', lat: -28.38420, lng: -49.42150, aliases: ['mina nova'] },
  { name: 'Bela Vista, Lauro Müller - SC', subtitle: 'Bela Vista • Lauro Müller/SC', lat: -28.38520, lng: -49.39100, aliases: ['bela vista'] },
  { name: 'Arizona, Lauro Müller - SC', subtitle: 'Arizona • Lauro Müller/SC', lat: -28.39250, lng: -49.40720, aliases: ['arizona'] },
  { name: 'Sumaré, Lauro Müller - SC', subtitle: 'Sumaré • Lauro Müller/SC', lat: -28.38050, lng: -49.40200, aliases: ['sumare', 'sumaré'] },
  { name: 'Cairú, Lauro Müller - SC', subtitle: 'Cairú • Lauro Müller/SC', lat: -28.39700, lng: -49.39500, aliases: ['cairu', 'cairú'] },
  { name: 'Içarense, Lauro Müller - SC', subtitle: 'Içarense • Lauro Müller/SC', lat: -28.38200, lng: -49.39950, aliases: ['içarense', 'icarense'] },
  { name: 'Km 1, Lauro Müller - SC', subtitle: 'Km 1 • Lauro Müller/SC', lat: -28.39320, lng: -49.39850, aliases: ['km 1', 'km1', 'bruno benedet'] },
  { name: 'Santa Bárbara, Lauro Müller - SC', subtitle: 'Santa Bárbara • Lauro Müller/SC', lat: -28.37000, lng: -49.41000, aliases: ['santa barbara', 'santa bárbara'] },
  { name: 'Serra do Rio do Rastro', subtitle: 'Mirante • SC-390, Lauro Müller/SC', lat: -28.38850, lng: -49.54800, aliases: ['serra', 'rio do rastro', 'mirante', 'sc-390'] },
  { name: 'Centro, Orleans - SC', subtitle: 'Centro • Orleans/SC', lat: -28.35890, lng: -49.29170, aliases: ['orleans', 'orleans centro'] },
  { name: 'Centro, Criciúma - SC', subtitle: 'Centro • Criciúma/SC', lat: -28.67750, lng: -49.36950, aliases: ['criciuma', 'criciúma'] },
  { name: 'Centro, Braço do Norte - SC', subtitle: 'Centro • Braço do Norte/SC', lat: -28.27360, lng: -49.16580, aliases: ['braço do norte', 'braco do norte'] },
  { name: 'Centro, Urussanga - SC', subtitle: 'Centro • Urussanga/SC', lat: -28.52440, lng: -49.32110, aliases: ['urussanga'] },
  { name: 'Centro, Tubarão - SC', subtitle: 'Centro • Tubarão/SC', lat: -28.47390, lng: -49.00690, aliases: ['tubarão', 'tubarao'] },
];
const LOCAL_POINTS_DATABASE = POPULAR_LOCAL_POINTS;

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export interface ViaCepResult {
  cep: string;
  logradouro: string;
  complemento?: string;
  bairro: string;
  localidade: string;
  uf: string;
  ibge?: string;
  ddd?: string;
  formattedCity: string;
  formattedAddress: string;
}

export interface CityOrCepSuggestion {
  id: string;
  cityLabel: string;
  subtitle: string;
  uf: string;
  cep?: string;
  streetAddress?: string;
  source: 'viacep' | 'ibge' | 'local';
}

const REGIONAL_CITIES_FALLBACK: Array<{ nome: string; uf: string; regiao: string }> = [
  { nome: 'Lauro Müller', uf: 'SC', regiao: 'Sul Catarinense' },
  { nome: 'Criciúma', uf: 'SC', regiao: 'Sul Catarinense' },
  { nome: 'Orleans', uf: 'SC', regiao: 'Sul Catarinense' },
  { nome: 'Tubarão', uf: 'SC', regiao: 'Sul Catarinense' },
  { nome: 'Urussanga', uf: 'SC', regiao: 'Sul Catarinense' },
  { nome: 'Braço do Norte', uf: 'SC', regiao: 'Sul Catarinense' },
  { nome: 'Içara', uf: 'SC', regiao: 'Sul Catarinense' },
  { nome: 'Araranguá', uf: 'SC', regiao: 'Sul Catarinense' },
  { nome: 'Florianópolis', uf: 'SC', regiao: 'Grande Florianópolis' },
  { nome: 'São José', uf: 'SC', regiao: 'Grande Florianópolis' },
  { nome: 'Joinville', uf: 'SC', regiao: 'Norte Catarinense' },
  { nome: 'Blumenau', uf: 'SC', regiao: 'Vale do Itajaí' },
  { nome: 'Balneário Camboriú', uf: 'SC', regiao: 'Litoral Norte SC' },
  { nome: 'Itajaí', uf: 'SC', regiao: 'Litoral Norte SC' },
  { nome: 'Chapecó', uf: 'SC', regiao: 'Oeste Catarinense' },
  { nome: 'Lages', uf: 'SC', regiao: 'Serra Catarinense' },
  { nome: 'Porto Alegre', uf: 'RS', regiao: 'Rio Grande do Sul' },
  { nome: 'Curitiba', uf: 'PR', regiao: 'Paraná' },
  { nome: 'São Paulo', uf: 'SP', regiao: 'São Paulo' },
  { nome: 'Rio de Janeiro', uf: 'RJ', regiao: 'Rio de Janeiro' },
];

let ibgeCitiesCache: Array<{ id: number; nome: string; uf: string }> | null = null;
let ibgeCitiesInflight: Promise<Array<{ id: number; nome: string; uf: string }>> | null = null;

async function getIbgeMunicipalities(): Promise<Array<{ id: number; nome: string; uf: string }>> {
  if (ibgeCitiesCache) return ibgeCitiesCache;
  if (ibgeCitiesInflight) return ibgeCitiesInflight;

  ibgeCitiesInflight = (async () => {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(
        'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome',
        { signal: controller.signal }
      );
      clearTimeout(tid);
      if (!res.ok) return [];
      const raw = await res.json();
      if (!Array.isArray(raw)) return [];
      const mapped = raw
        .map((m: any) => {
          const uf =
            m?.microrregiao?.mesorregiao?.UF?.sigla ||
            m?.['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla ||
            '';
          return {
            id: Number(m?.id || 0),
            nome: String(m?.nome || '').trim(),
            uf: String(uf).trim()
          };
        })
        .filter((m) => m.nome && m.uf);
      ibgeCitiesCache = mapped;
      return mapped;
    } catch {
      return [];
    } finally {
      ibgeCitiesInflight = null;
    }
  })();

  return ibgeCitiesInflight;
}

/**
 * Consulta oficial de CEP brasileiro via ViaCEP com fallback automático para BrasilAPI v2.
 */
export async function lookupViaCep(rawCep: string): Promise<ViaCepResult | null> {
  const digits = String(rawCep || '').replace(/\D/g, '');
  if (digits.length !== 8) return null;

  const formattedCep = `${digits.slice(0, 5)}-${digits.slice(5)}`;

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
      signal: controller.signal
    });
    clearTimeout(tid);
    if (res.ok) {
      const data = await res.json();
      if (data && !data.erro && data.localidade && data.uf) {
        const logradouro = String(data.logradouro || '').trim();
        const bairro = String(data.bairro || '').trim();
        const localidade = String(data.localidade || '').trim();
        const uf = String(data.uf || '').trim().toUpperCase();
        return {
          cep: String(data.cep || formattedCep),
          logradouro,
          complemento: String(data.complemento || '').trim() || undefined,
          bairro,
          localidade,
          uf,
          ibge: data.ibge ? String(data.ibge) : undefined,
          ddd: data.ddd ? String(data.ddd) : undefined,
          formattedCity: `${localidade} - ${uf}, BR`,
          formattedAddress: [logradouro, bairro, `${localidade} - ${uf}`].filter(Boolean).join(', ')
        };
      }
    }
  } catch {
    // Fallback secundário abaixo
  }

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${digits}`, {
      signal: controller.signal
    });
    clearTimeout(tid);
    if (res.ok) {
      const data = await res.json();
      if (data && data.city && data.state) {
        const logradouro = String(data.street || '').trim();
        const bairro = String(data.neighborhood || '').trim();
        const localidade = String(data.city || '').trim();
        const uf = String(data.state || '').trim().toUpperCase();
        return {
          cep: formattedCep,
          logradouro,
          bairro,
          localidade,
          uf,
          formattedCity: `${localidade} - ${uf}, BR`,
          formattedAddress: [logradouro, bairro, `${localidade} - ${uf}`].filter(Boolean).join(', ')
        };
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Busca inteligente para "Alterar cidade de embarque":
 * - CEP completo (8 dígitos): consulta ViaCEP / BrasilAPI e devolve cidade, bairro e rua
 * - Texto (nome de município): consulta cache regional + API oficial de Municípios do IBGE
 */
export async function searchCitiesAndViaCep(query: string): Promise<CityOrCepSuggestion[]> {
  const raw = String(query || '').trim();
  if (raw.length < 2) return [];

  const digits = raw.replace(/\D/g, '');
  const looksLikeCep = /^[\d.\-\s]+$/.test(raw) && digits.length >= 5;

  if (looksLikeCep) {
    if (digits.length === 8) {
      const cepData = await lookupViaCep(digits);
      if (!cepData) return [];
      return [
        {
          id: `cep-${cepData.cep}`,
          cityLabel: cepData.formattedCity,
          subtitle: [
            `CEP ${cepData.cep}`,
            cepData.logradouro || null,
            cepData.bairro || null
          ].filter(Boolean).join(' • '),
          uf: cepData.uf,
          cep: cepData.cep,
          streetAddress: cepData.formattedAddress,
          source: 'viacep'
        }
      ];
    }
    return [];
  }

  const normQuery = normalizeText(raw);
  const regionalMatches: CityOrCepSuggestion[] = REGIONAL_CITIES_FALLBACK
    .filter((c) => normalizeText(c.nome).includes(normQuery))
    .map((c) => ({
      id: `local-${normalizeText(c.nome)}-${c.uf}`,
      cityLabel: `${c.nome} - ${c.uf}, BR`,
      subtitle: `${c.regiao} • Estado ${c.uf}`,
      uf: c.uf,
      source: 'local'
    }));

  const ibgeList = await getIbgeMunicipalities();
  const ibgeMatches: CityOrCepSuggestion[] = ibgeList
    .filter((m) => normalizeText(m.nome).includes(normQuery))
    .sort((a, b) => {
      const aStarts = normalizeText(a.nome).startsWith(normQuery) ? 0 : 1;
      const bStarts = normalizeText(b.nome).startsWith(normQuery) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    })
    .slice(0, 10)
    .map((m) => ({
      id: `ibge-${m.id}-${m.uf}`,
      cityLabel: `${m.nome} - ${m.uf}, BR`,
      subtitle: `Município IBGE • ${m.uf}`,
      uf: m.uf,
      source: 'ibge'
    }));

  const merged: CityOrCepSuggestion[] = [];
  const seen = new Set<string>();
  for (const item of [...regionalMatches, ...ibgeMatches]) {
    const key = normalizeText(item.cityLabel);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
    if (merged.length >= 8) break;
  }
  return merged;
}

export interface ParsedBrazilianAddressQuery {
  cleanedFull: string;
  houseNumber: string;
  embeddedCep: string;
  candidates: string[];
}

const ROMAN_TO_ARABIC_MAP: Array<[RegExp, string]> = [
  [/\bxxv\b/gi, '25'],
  [/\bxix\b/gi, '19'],
  [/\bxviii\b/gi, '18'],
  [/\bxvii\b/gi, '17'],
  [/\bxvi\b/gi, '16'],
  [/\bxv\b/gi, '15'],
  [/\bxiv\b/gi, '14'],
  [/\bxiii\b/gi, '13'],
  [/\bxii\b/gi, '12'],
  [/\bxi\b/gi, '11'],
  [/\bviii\b/gi, '8'],
  [/\bvii\b/gi, '7'],
  [/\bvi\b/gi, '6'],
];

function applyStreetRomanSwaps(text: string): string {
  let out = text;
  for (const [rx, arab] of ROMAN_TO_ARABIC_MAP) {
    out = out.replace(rx, arab);
  }
  return out;
}

function expandPtStreetAbbreviations(text: string): string {
  return text
    .replace(/(^|[,\s])r\.\s*/gi, '$1Rua ')
    .replace(/(^|[,\s])av\.\s*/gi, '$1Avenida ')
    .replace(/(^|[,\s])rod\.\s*/gi, '$1Rodovia ')
    .replace(/(^|[,\s])estr\.\s*/gi, '$1Estrada ')
    .replace(/(^|[,\s])tv\.\s*/gi, '$1Travessa ')
    .replace(/(^|[,\s])p[cç]\.\s*/gi, '$1Praça ')
    .replace(/(^|[,\s])al\.\s*/gi, '$1Alameda ')
    .replace(/(^|[,\s])dr\.\s*/gi, '$1Doutor ')
    .replace(/(^|[,\s])prof\.\s*/gi, '$1Professor ')
    .replace(/(^|[,\s])cel\.\s*/gi, '$1Coronel ')
    .replace(/(^|[,\s])gov\.\s*/gi, '$1Governador ')
    .replace(/(^|[,\s])pres\.\s*/gi, '$1Presidente ')
    .replace(/(^|[,\s])sta\.\s*/gi, '$1Santa ')
    .replace(/(^|[,\s])sto\.\s*/gi, '$1Santo ')
    .replace(/(^|[,\s])pe\.\s*/gi, '$1Padre ');
}

/**
 * Limpa endereços colados no padrão brasileiro (ex: "RUA XV DE NOVEMBRO, Nº 132 - CENTRO, LAURO MÜLLER - SC, CEP 88835-000")
 * preservando número e CEP em separado e gerando variações progressivas compatíveis com Photon e Nominatim.
 */
export function buildBrazilianGeocodeCandidates(rawInput: string): ParsedBrazilianAddressQuery {
  const normalizedSpaces = String(rawInput || '')
    .replace(/[\r\n\t]+/g, ', ')
    .replace(/\blaura\b/gi, 'Lauro')
    .replace(/\s+/g, ' ')
    .trim();

  const cepMatch = normalizedSpaces.match(/\b(?:cep[:\s-]*)?(\d{5})-?(\d{3})\b/i);
  const embeddedCep = cepMatch ? `${cepMatch[1]}${cepMatch[2]}` : '';

  const numMatch =
    normalizedSpaces.match(/\b(?:n[º°o\.]*|numero|número)\s*[:.]?\s*(\d{1,5}[a-z]?)\b/i) ||
    normalizedSpaces.match(/,\s*(\d{1,5})(?=\s*(?:,|-|\/|$|\s))/);
  const houseNumber = numMatch ? numMatch[1].trim() : '';

  let cleaned = expandPtStreetAbbreviations(normalizedSpaces)
    .replace(/\bcep[:\s-]*\d{5}-?\d{3}\b/gi, '')
    .replace(/\b\d{5}-\d{3}\b/g, '')
    .replace(/\b(?:n[º°o\.]*|numero|número)\s*[:.]?\s*/gi, ' ')
    .replace(/#\s*(\d{1,5})/g, '$1')
    .replace(/\b(?:apto?|apartamento|bloco|bl\.?|sala|sl\.?|casa|loja|andar|fundos|lote|quadra|qd\.?|lt\.?)\s*[a-z0-9/-]*/gi, '')
    .replace(/\s*\/\s*([A-Z]{2})\b/gi, ', $1')
    .replace(/\s+-\s+/g, ', ')
    .replace(/,\s*,+/g, ',')
    .replace(/^[,.\s-]+|[,.\s-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) cleaned = normalizedSpaces;

  const segments = cleaned.split(',').map((s) => s.trim()).filter(Boolean);
  const segmentsWithoutNumber = segments
    .map((seg) =>
      houseNumber
        ? seg.replace(new RegExp(`^${houseNumber}$|\\b${houseNumber}\\b`, 'i'), '').trim()
        : seg
    )
    .filter((seg) => seg && !/^\d{1,5}$/.test(seg));

  const streetPart = segmentsWithoutNumber[0] || segments[0] || cleaned;
  const lastCityCandidate =
    segmentsWithoutNumber.length >= 2
      ? segmentsWithoutNumber
          .slice(1)
          .filter((s) => !/^(centro|brasil|brazil|[a-z]{2})$/i.test(s))
          .slice(-1)[0] || ''
      : '';
  const stateToken =
    segments.find((s) => /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/i.test(s)) || '';

  const rawCandidates = [
    cleaned,
    segmentsWithoutNumber.join(', '),
    lastCityCandidate
      ? [streetPart, lastCityCandidate, stateToken].filter(Boolean).join(', ')
      : '',
    applyStreetRomanSwaps(
      lastCityCandidate
        ? [streetPart, lastCityCandidate, stateToken].filter(Boolean).join(', ')
        : streetPart
    ),
    streetPart,
    applyStreetRomanSwaps(streetPart),
  ];

  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const c of rawCandidates) {
    const cleanCand = String(c || '').replace(/,\s*,+/g, ',').replace(/^[,.\s]+|[,.\s]+$/g, '').trim();
    if (cleanCand.length >= 2) {
      const key = normalizeText(cleanCand);
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(cleanCand);
      }
    }
  }

  return {
    cleanedFull: cleaned,
    houseNumber,
    embeddedCep,
    candidates: candidates.slice(0, 5),
  };
}

function attachPastedHouseNumber(displayName: string, houseNumber: string): string {
  if (!houseNumber || !displayName) return displayName;
  const numRx = new RegExp(`\\b${houseNumber}\\b`, 'i');
  if (numRx.test(displayName)) return displayName;
  const commaIdx = displayName.indexOf(',');
  if (commaIdx <= 0) return `${displayName}, ${houseNumber}`;
  return `${displayName.slice(0, commaIdx).trim()}, ${houseNumber}${displayName.slice(commaIdx)}`;
}

async function queryPhotonDirect(
  queryStr: string,
  userLat: number,
  userLng: number
): Promise<Array<{ display_name: string; lat: number; lng: number }>> {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 3200);
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(queryStr)}&limit=8&lat=${userLat}&lon=${userLng}&location_bias_scale=0.35`;
    const res = await fetch(photonUrl, { signal: controller.signal });
    clearTimeout(tid);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data?.features)) return [];
    return data.features
      .filter((f: any) => {
        const cc = String(f?.properties?.countrycode || '').toUpperCase();
        return !cc || cc === 'BR';
      })
      .map((f: any) => {
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
          display_name: parts.filter(Boolean).join(', '),
          lat: Number(f.geometry?.coordinates?.[1]),
          lng: Number(f.geometry?.coordinates?.[0]),
        };
      })
      .filter((item: { display_name: string; lat: number; lng: number }) =>
        Boolean(item.display_name) && Number.isFinite(item.lat) && Number.isFinite(item.lng)
      );
  } catch {
    return [];
  }
}

const CLIENT_GEO_SEARCH_CACHE = new Map<string, { results: Array<{ display_name: string; lat: number; lng: number }>; expiresAt: number }>();
const CLIENT_GEO_REVERSE_CACHE = new Map<string, { address: string; expiresAt: number }>();
const CLIENT_GEO_SEARCH_TTL_MS = 10 * 60 * 1000;
const CLIENT_GEO_REVERSE_TTL_MS = 30 * 60 * 1000;

async function queryServerGeocodeApi(
  queryStr: string,
  userLat: number,
  userLng: number
): Promise<Array<{ display_name: string; lat: number; lng: number }>> {
  if (typeof window === 'undefined') return [];
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(
      `/api/geocode?q=${encodeURIComponent(queryStr)}&lat=${encodeURIComponent(String(userLat))}&lng=${encodeURIComponent(String(userLng))}`,
      { signal: controller.signal }
    );
    clearTimeout(tid);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.results) ? json.results : [];
  } catch {
    return [];
  }
}

async function queryServerReverseGeocodeApi(
  lat: number,
  lng: number
): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(
      `/api/geocode/reverse?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
      { signal: controller.signal }
    );
    clearTimeout(tid);
    if (!res.ok) return null;
    const json = await res.json();
    const addr = String(json?.address || '').trim();
    return addr && !addr.startsWith('GPS:') ? addr : null;
  } catch {
    return null;
  }
}

/**
 * Busca de endereço tolerante a endereços colados no formato brasileiro (com "Nº", CEP, abreviações,
 * numeração romana "XV" <-> "15", links/coordenadas do Google Maps) usando base local + ViaCEP + Photon + /api/geocode.
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

  let rawClean = query.trim();

  // Suporta links colados do Google Maps (com @lat,lng ou ?q=...)
  if (/^https?:\/\/(www\.)?(google\.|maps\.app|goo\.gl)/i.test(rawClean)) {
    const atCoords = rawClean.match(/@(-?\d{1,2}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);
    const qCoords = rawClean.match(/[?&](?:q|query)=(-?\d{1,2}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);
    const coordHit = atCoords || qCoords;
    if (coordHit) {
      const lat = parseFloat(coordHit[1]);
      const lng = parseFloat(coordHit[2]);
      const rev = await reverseGeocode(lat, lng).catch(() => `Local no mapa (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
      return [{ display_name: rev, lat, lng }];
    }
    const qText = rawClean.match(/[?&](?:q|query)=([^&]+)/);
    if (qText && qText[1]) {
      try {
        rawClean = decodeURIComponent(qText[1].replace(/\+/g, ' ')).trim();
      } catch {
        // segue com rawClean
      }
    }
  }

  // Suporta coordenadas coladas diretamente (ex: "-28.39123, -49.39354")
  const directCoords = rawClean.match(/^(-?\d{1,2}\.\d{4,})\s*[,\s;]\s*(-?\d{1,3}\.\d{4,})$/);
  if (directCoords) {
    const lat = parseFloat(directCoords[1]);
    const lng = parseFloat(directCoords[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      const rev = await reverseGeocode(lat, lng).catch(() => `GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      return [{ display_name: rev, lat, lng }];
    }
  }

  // CEP puro (8 dígitos)
  const cepDigitsOnly = rawClean.replace(/\D/g, '');
  if (/^[\d.\-\s]+$/.test(rawClean) && cepDigitsOnly.length === 8) {
    const viaCep = await lookupViaCep(cepDigitsOnly);
    if (viaCep) {
      const hits = await queryPhotonDirect(viaCep.formattedAddress, userLat, userLng);
      const serverHits = hits.length > 0 ? hits : await queryServerGeocodeApi(viaCep.formattedAddress, userLat, userLng);
      const top = serverHits[0];
      return [
        {
          display_name: `${viaCep.formattedAddress} (CEP ${viaCep.cep})`,
          lat: top ? top.lat : userLat,
          lng: top ? top.lng : userLng,
        },
      ];
    }
  }

  const parsed = buildBrazilianGeocodeCandidates(rawClean);
  const normQ = normalizeText(parsed.cleanedFull);
  const tokens = normQ.split(/[\s,]+/).filter((t) => t.length >= 2);
  const clientCacheKey = `${normQ}:${Math.round(userLat * 10)},${Math.round(userLng * 10)}`;
  const cachedHit = CLIENT_GEO_SEARCH_CACHE.get(clientCacheKey);
  if (cachedHit && cachedHit.expiresAt > Date.now()) {
    return cachedHit.results;
  }

  // 1. Base local rápida (apenas quando bate na rua/bairro exato ou sem tokens numéricos desconhecidos)
  const localMatches = LOCAL_POINTS_DATABASE.filter((item) => {
    const itemNorm = normalizeText(item.name);
    const aliasesNorm = item.aliases.map(normalizeText);
    return tokens.length > 0 && tokens.every((t) => itemNorm.includes(t) || aliasesNorm.some((a) => a.includes(t)));
  }).map((item) => ({
    display_name: item.name,
    lat: item.lat,
    lng: item.lng,
  }));

  // 2. Se o endereço colado contém CEP embutido (ex: "... CEP 88835-000"), resolve ViaCEP em paralelo
  const viaCepPromise = parsed.embeddedCep ? lookupViaCep(parsed.embeddedCep) : Promise.resolve(null);

  // 3. Tenta candidato principal pelo proxy com cache (/api/geocode -> Google/Mapbox/LocationIQ/Photon/Nominatim)
  const primaryQuery = parsed.candidates[0] || rawClean;
  let externalMatches = await queryServerGeocodeApi(primaryQuery, userLat, userLng);
  if (externalMatches.length === 0) {
    externalMatches = await queryPhotonDirect(primaryQuery, userLat, userLng);
  }

  // 4. Se veio vazio ou com poucos resultados, roda relaxamento progressivo (ViaCEP, sem "Nº", sem número, XV <-> 15)
  if (externalMatches.length < 2) {
    const relaxQueue = parsed.candidates.slice(1);
    const viaCepData = await viaCepPromise;
    if (viaCepData && viaCepData.formattedAddress) {
      relaxQueue.unshift(viaCepData.formattedAddress);
    }

    const uniqueRelax = Array.from(new Set(relaxQueue.filter(q => q && q !== primaryQuery))).slice(0, 3);
    const relaxedTasks = uniqueRelax.map((candidate) =>
      queryServerGeocodeApi(candidate, userLat, userLng).then((hits) =>
        hits.length > 0 ? hits : queryPhotonDirect(candidate, userLat, userLng)
      )
    );

    const batch = await Promise.all(relaxedTasks);
    for (const chunk of batch) {
      if (chunk.length > 0) externalMatches = [...externalMatches, ...chunk];
    }
  } else {
    await viaCepPromise;
  }

  // Preserva o número da casa digitado/colado quando o geocoder retorna apenas o logradouro
  const enrichedExternal = externalMatches.map((item) => ({
    ...item,
    display_name: attachPastedHouseNumber(item.display_name, parsed.houseNumber),
  }));

  const combined = [...localMatches, ...enrichedExternal];
  const unique: Array<{ display_name: string; lat: number; lng: number }> = [];
  const seen = new Set<string>();

  for (const item of combined) {
    const key = normalizeText(item.display_name);
    if (key && !seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  // Ordena priorizando resultados que contêm tokens da cidade/bairro colados pelo usuário
  const scoreItem = (displayName: string) => {
    const n = normalizeText(displayName);
    let score = 0;
    for (const t of tokens) {
      if (t.length >= 3 && n.includes(t)) score += 1;
    }
    return score;
  };
  unique.sort((a, b) => scoreItem(b.display_name) - scoreItem(a.display_name));

  const finalResults = unique.slice(0, 8);
  if (finalResults.length > 0) {
    if (CLIENT_GEO_SEARCH_CACHE.size >= 150) {
      const oldest = CLIENT_GEO_SEARCH_CACHE.keys().next().value;
      if (oldest !== undefined) CLIENT_GEO_SEARCH_CACHE.delete(oldest);
    }
    CLIENT_GEO_SEARCH_CACHE.set(clientCacheKey, {
      results: finalResults,
      expiresAt: Date.now() + CLIENT_GEO_SEARCH_TTL_MS,
    });
  }
  return finalResults;
}

/**
 * Geocodificação reversa (coordenadas para endereço textual real via proxy em cache com fallback)
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const revKey = `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
  const cachedRev = CLIENT_GEO_REVERSE_CACHE.get(revKey);
  if (cachedRev && cachedRev.expiresAt > Date.now()) {
    return cachedRev.address;
  }

  const serverAddress = await queryServerReverseGeocodeApi(lat, lng);
  if (serverAddress) {
    if (CLIENT_GEO_REVERSE_CACHE.size >= 150) {
      const oldest = CLIENT_GEO_REVERSE_CACHE.keys().next().value;
      if (oldest !== undefined) CLIENT_GEO_REVERSE_CACHE.delete(oldest);
    }
    CLIENT_GEO_REVERSE_CACHE.set(revKey, {
      address: serverAddress,
      expiresAt: Date.now() + CLIENT_GEO_REVERSE_TTL_MS,
    });
    return serverAddress;
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

export interface SnapPointOptions {
  /** Índice do segmento atual na rota para favorecer continuidade progressiva */
  hintStartIndex?: number;
  /** Direção atual do veículo/bússola em graus [0, 360) para desambiguar cruzamentos e pistas paralelas */
  preferredHeading?: number | null;
  /** Diferença máxima de ângulo antes de aplicar penalidade direcional (padrão 100°) */
  maxHeadingDiffDeg?: number;
}

export interface SnappedRoutePoint {
  lat: number;
  lng: number;
  heading: number;
  snapped: boolean;
  distanceMeters: number;
  segmentIndex: number;
}

/**
 * Projeta um ponto (lat, lng) para o ponto mais próximo sobre a rota viária (polyline OSRM),
 * considerando opcionalmente a direção do veículo (preferredHeading) e o progresso na rota (hintStartIndex).
 * Evita que o ícone do carro fique dentro de casas, calçadas ou pule para vias paralelas.
 */
export function snapPointToRoute(
  point: { lat: number; lng: number; heading?: number },
  polyline: [number, number][],
  maxSnapDistanceMeters = 150,
  options?: SnapPointOptions
): SnappedRoutePoint {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
    return { lat: 0, lng: 0, heading: 0, snapped: false, distanceMeters: Infinity, segmentIndex: 0 };
  }
  if (!polyline || polyline.length < 2) {
    return {
      lat: point.lat,
      lng: point.lng,
      heading: normalizeAngle360(point.heading || 0),
      snapped: false,
      distanceMeters: Infinity,
      segmentIndex: 0,
    };
  }

  const pLat = point.lat;
  const pLng = point.lng;
  const latRad = (pLat * Math.PI) / 180;
  const cosLat = Math.cos(latRad);
  const mPerDegLat = 110540;
  const mPerDegLng = 111320 * cosLat;

  const preferredHeading =
    typeof options?.preferredHeading === 'number' && Number.isFinite(options.preferredHeading)
      ? normalizeAngle360(options.preferredHeading)
      : null;
  const maxHeadingDiffDeg = options?.maxHeadingDiffDeg ?? 100;
  const hintIdx = typeof options?.hintStartIndex === 'number' ? options.hintStartIndex : null;

  let bestScore = Infinity;
  let bestRawDistMeters = Infinity;
  let bestLat = pLat;
  let bestLng = pLng;
  let bestHeading = normalizeAngle360(point.heading || 0);
  let bestSegmentIndex = 0;

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

    // Ângulo do segmento da rua em graus (0° = Norte, 90° = Leste, 180° = Sul, 270° = Oeste)
    const segAngle = segLenSq > 0.0001
      ? normalizeAngle360((Math.atan2(dx, dy) * 180) / Math.PI)
      : bestHeading;

    let score = distMeters;

    if (preferredHeading !== null && segLenSq > 0.0001) {
      const angleDiff = Math.abs(shortestAngleDelta(preferredHeading, segAngle));
      if (angleDiff > maxHeadingDiffDeg) {
        score += 35 + (angleDiff - maxHeadingDiffDeg) * 0.45;
      }
    }

    if (hintIdx !== null) {
      if (i < hintIdx - 2) {
        score += 18;
      } else if (i > hintIdx + 35) {
        score += 10;
      }
    }

    if (score < bestScore) {
      bestScore = score;
      bestRawDistMeters = distMeters;
      bestLat = pLat + qy / mPerDegLat;
      bestLng = pLng + qx / mPerDegLng;
      bestHeading = Math.round(segAngle) % 360;
      bestSegmentIndex = i;
    }
  }

  // Se o ponto estiver razoavelmente perto da rota (< maxSnapDistanceMeters), encaixa na rota
  if (bestRawDistMeters <= maxSnapDistanceMeters) {
    return {
      lat: bestLat,
      lng: bestLng,
      heading: bestHeading,
      snapped: true,
      distanceMeters: bestRawDistMeters,
      segmentIndex: bestSegmentIndex,
    };
  }

  // Se estiver além do limite da rota (fora de rota ou longe), mantém o ponto real do GPS
  return {
    lat: pLat,
    lng: pLng,
    heading: Math.round(normalizeAngle360(point.heading || 0)) % 360,
    snapped: false,
    distanceMeters: bestRawDistMeters,
    segmentIndex: bestSegmentIndex,
  };
}

/**
 * Calcula a distância restante exata em metros ao longo da polilinha da rota
 * a partir do ponto encaixado (segmentIndex, snappedLat, snappedLng) até o destino.
 */
export function computeRemainingRouteMeters(
  polyline: [number, number][],
  segmentIndex: number,
  snappedLat: number,
  snappedLng: number
): number {
  if (!polyline || polyline.length < 2) return 0;
  const safeIdx = Math.max(0, Math.min(polyline.length - 2, segmentIndex));
  const nextVertex = polyline[safeIdx + 1];
  let total = calculateExactMeters(snappedLat, snappedLng, nextVertex[0], nextVertex[1]);
  for (let i = safeIdx + 1; i < polyline.length - 1; i++) {
    total += calculateExactMeters(
      polyline[i][0],
      polyline[i][1],
      polyline[i + 1][0],
      polyline[i + 1][1]
    );
  }
  return Math.max(0, Math.round(total));
}

/**
 * Determina o melhor índice de etapa turn-by-turn com base na posição atual,
 * permitindo avançar quando o veículo passa da manobra atual ou já se aproximou da próxima.
 */
export function resolveActiveNavigationStepIndex<T extends { location: [number, number] }>(
  steps: T[],
  currentIndex: number,
  lat: number,
  lng: number,
  advanceRadiusMeters = 38
): { stepIndex: number; metersToStep: number } {
  if (!steps || steps.length === 0) return { stepIndex: 0, metersToStep: 0 };
  let idx = Math.max(0, Math.min(steps.length - 1, currentIndex));
  const loc = steps[idx]?.location;
  let dist = loc && loc[0] && loc[1] ? calculateExactMeters(lat, lng, loc[0], loc[1]) : 0;

  while (idx < steps.length - 1) {
    const nextLoc = steps[idx + 1]?.location;
    const nextDist = nextLoc && nextLoc[0] && nextLoc[1]
      ? calculateExactMeters(lat, lng, nextLoc[0], nextLoc[1])
      : Infinity;

    if (dist <= advanceRadiusMeters || (nextDist < dist * 0.72 && nextDist <= 90)) {
      idx += 1;
      dist = nextDist;
    } else {
      break;
    }
  }

  return {
    stepIndex: idx,
    metersToStep: Math.max(0, Math.round(dist)),
  };
}

export const BRAZILIAN_STATES: ReadonlyArray<{ uf: string; name: string }> = [
  { uf: 'AC', name: 'Acre' },
  { uf: 'AL', name: 'Alagoas' },
  { uf: 'AP', name: 'Amapá' },
  { uf: 'AM', name: 'Amazonas' },
  { uf: 'BA', name: 'Bahia' },
  { uf: 'CE', name: 'Ceará' },
  { uf: 'DF', name: 'Distrito Federal' },
  { uf: 'ES', name: 'Espírito Santo' },
  { uf: 'GO', name: 'Goiás' },
  { uf: 'MA', name: 'Maranhão' },
  { uf: 'MT', name: 'Mato Grosso' },
  { uf: 'MS', name: 'Mato Grosso do Sul' },
  { uf: 'MG', name: 'Minas Gerais' },
  { uf: 'PA', name: 'Pará' },
  { uf: 'PB', name: 'Paraíba' },
  { uf: 'PR', name: 'Paraná' },
  { uf: 'PE', name: 'Pernambuco' },
  { uf: 'PI', name: 'Piauí' },
  { uf: 'RJ', name: 'Rio de Janeiro' },
  { uf: 'RN', name: 'Rio Grande do Norte' },
  { uf: 'RS', name: 'Rio Grande do Sul' },
  { uf: 'RO', name: 'Rondônia' },
  { uf: 'RR', name: 'Roraima' },
  { uf: 'SC', name: 'Santa Catarina' },
  { uf: 'SP', name: 'São Paulo' },
  { uf: 'SE', name: 'Sergipe' },
  { uf: 'TO', name: 'Tocantins' }
];

const BRAZILIAN_UF_SET = new Set(BRAZILIAN_STATES.map((s) => s.uf));

/**
 * Extrai { city, uf } de valores legados como "Lauro Müller/SC", "Lauro Müller - SC, BR" ou "Criciúma".
 */
export function parseCityStateValue(raw?: string): { city: string; uf: string } {
  const cleaned = String(raw || '')
    .replace(/,\s*BR$/i, '')
    .trim();
  if (!cleaned) return { city: '', uf: '' };

  const slashOrDashMatch = cleaned.match(/^(.*?)\s*(?:\/|-|,)\s*([A-Za-z]{2})$/);
  if (slashOrDashMatch) {
    const candidateCity = slashOrDashMatch[1].trim();
    const candidateUf = slashOrDashMatch[2].toUpperCase();
    if (BRAZILIAN_UF_SET.has(candidateUf)) {
      return { city: candidateCity, uf: candidateUf };
    }
  }

  const upperOnly = cleaned.toUpperCase();
  if (BRAZILIAN_UF_SET.has(upperOnly)) {
    return { city: '', uf: upperOnly };
  }

  return { city: cleaned, uf: '' };
}

/**
 * Formata cidade e UF no padrão oficial usado pelo motor de categorias ("Cidade/UF").
 */
export function formatCityStateValue(city?: string, uf?: string): string {
  const cleanCity = String(city || '').trim();
  const cleanUf = String(uf || '').trim().toUpperCase();
  if (cleanCity && cleanUf) return `${cleanCity}/${cleanUf}`;
  return cleanCity;
}

export function getFallbackCitiesByState(uf: string): string[] {
  const targetUf = String(uf || '').trim().toUpperCase();
  if (!targetUf) return [];
  return REGIONAL_CITIES_FALLBACK
    .filter((c) => c.uf === targetUf)
    .map((c) => c.nome)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * Retorna todos os municípios oficiais do estado selecionado via API IBGE (com fallback regional).
 */
export async function getCitiesByState(uf: string): Promise<string[]> {
  const targetUf = String(uf || '').trim().toUpperCase();
  if (!BRAZILIAN_UF_SET.has(targetUf)) return [];

  const ibgeList = await getIbgeMunicipalities();
  const ibgeCities = ibgeList
    .filter((m) => m.uf.toUpperCase() === targetUf)
    .map((m) => m.nome);

  const combined = ibgeCities.length > 0 ? ibgeCities : getFallbackCitiesByState(targetUf);
  const deduped = new Map<string, string>();
  for (const name of combined) {
    const key = normalizeText(name);
    if (key && !deduped.has(key)) {
      deduped.set(key, name.trim());
    }
  }
  return Array.from(deduped.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
