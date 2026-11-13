import { SystemConfig } from '../types';

/**
 * KAVRO DRIVE - Serviço de Identificação e Validação Veicular Manual
 * Garante transparência real sem dados fictícios para o passageiro
 */

// Limpa placa retirando caracteres especiais
export function cleanPlate(rawPlate: string): string {
  return (rawPlate || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().trim();
}

// Valida formato de placa brasileira (Mercosul ABC1D23 ou Padrão Cinza ABC1234)
export function isValidBrazilianPlate(rawPlate: string): boolean {
  const p = cleanPlate(rawPlate);
  if (p.length !== 7) return false;
  // Padrão antigo: 3 letras + 4 números
  const oldPattern = /^[A-Z]{3}[0-9]{4}$/;
  // Padrão Mercosul: 3 letras + 1 número + 1 letra + 2 números
  const mercosulPattern = /^[A-Z]{3}[0-9]{1}[A-Z]{1}[0-9]{2}$/;
  return oldPattern.test(p) || mercosulPattern.test(p);
}

// Formata para exibição padrão com hífen: ABC-1D23 ou ABC-1234
export function formatPlate(rawPlate: string): string {
  const p = cleanPlate(rawPlate);
  if (!p) return '';
  if (p.length < 4) return p;
  return `${p.slice(0, 3)}-${p.slice(3, 7)}`;
}

// Verifica quais campos obrigatórios de identificação do veículo estão pendentes
export function getMissingVehicleFields(config?: Partial<SystemConfig> | null): string[] {
  if (!config) return ['Nome do Motorista', 'Placa', 'Marca', 'Modelo', 'Cor'];
  const missing: string[] = [];
  if (!config.driverName?.trim()) missing.push('Nome do Motorista');
  const cleanedPlate = cleanPlate(config.driverPlate || '');
  if (cleanedPlate.length < 7) missing.push('Placa do Veículo (7 dígitos)');
  if (!config.driverCarBrand?.trim()) missing.push('Marca do Veículo');
  if (!config.driverCarModel?.trim()) missing.push('Modelo do Veículo');
  if (!config.driverCarColor?.trim()) missing.push('Cor do Veículo');
  return missing;
}

// Retorna true somente quando todos os dados reais do veículo foram preenchidos pelo motorista
export function isDriverVehicleConfigured(config?: Partial<SystemConfig> | null): boolean {
  return getMissingVehicleFields(config).length === 0;
}

// Paleta de cores automotivas para renderização e badges
export interface CarColorProfile {
  name: string;
  label: string;
  hex: string;
  accent: string;
  isLight: boolean;
}

export const POPULAR_CAR_COLORS: CarColorProfile[] = [
  { name: 'Branco', label: 'Branco Perolizado', hex: '#F8FAFC', accent: '#E2E8F0', isLight: true },
  { name: 'Preto', label: 'Preto Ônix / Ninja', hex: '#111827', accent: '#374151', isLight: false },
  { name: 'Prata', label: 'Prata Metálico', hex: '#CBD5E1', accent: '#94A3B8', isLight: true },
  { name: 'Cinza', label: 'Cinza Grafite / Chumbo', hex: '#4B5563', accent: '#6B7280', isLight: false },
  { name: 'Vermelho', label: 'Vermelho Granada', hex: '#DC2626', accent: '#991B1B', isLight: false },
  { name: 'Azul', label: 'Azul Meia-Noite / Safira', hex: '#1D4ED8', accent: '#1E3A8A', isLight: false },
  { name: 'Vinho', label: 'Vinho Bordô', hex: '#831843', accent: '#500724', isLight: false },
  { name: 'Marrom', label: 'Marrom / Bronze', hex: '#78350F', accent: '#451A03', isLight: false },
];

export function getCarColorProfile(colorName?: string): CarColorProfile {
  if (!colorName || !colorName.trim()) {
    return {
      name: 'Não informada',
      label: 'Cor em cadastramento',
      hex: '#64748B',
      accent: '#475569',
      isLight: false
    };
  }
  const query = colorName.toLowerCase();
  const found = POPULAR_CAR_COLORS.find(c =>
    query.includes(c.name.toLowerCase()) || c.label.toLowerCase().includes(query)
  );
  if (found) return found;

  return {
    name: colorName,
    label: colorName,
    hex: '#E2E8F0',
    accent: '#94A3B8',
    isLight: true
  };
}

/** Catálogo de Veículos Populares no Brasil com Pré-Preenchimento Automático */
export interface VehicleCatalogItem {
  brand: string;
  model: string;
  category: 'kavro_go' | 'kavro_plus' | 'kavro_exec';
  hasLargeTrunk: boolean;
  hasLeatherSeats: boolean;
}

export const POPULAR_VEHICLES_CATALOG: VehicleCatalogItem[] = [
  // Toyota
  { brand: 'Toyota', model: 'Corolla', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: true },
  { brand: 'Toyota', model: 'Corolla Cross', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: true },
  { brand: 'Toyota', model: 'Yaris Sedan', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Toyota', model: 'Yaris Hatch', category: 'kavro_go', hasLargeTrunk: false, hasLeatherSeats: false },
  { brand: 'Toyota', model: 'Etios Sedan', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Toyota', model: 'Etios Hatch', category: 'kavro_go', hasLargeTrunk: false, hasLeatherSeats: false },
  { brand: 'Toyota', model: 'Hilux / SW4', category: 'kavro_exec', hasLargeTrunk: true, hasLeatherSeats: true },
  { brand: 'Toyota', model: 'RAV4', category: 'kavro_exec', hasLargeTrunk: true, hasLeatherSeats: true },

  // Chevrolet
  { brand: 'Chevrolet', model: 'Onix Plus', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Chevrolet', model: 'Onix Hatch', category: 'kavro_go', hasLargeTrunk: false, hasLeatherSeats: false },
  { brand: 'Chevrolet', model: 'Prisma', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Chevrolet', model: 'Cobalt', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Chevrolet', model: 'Spin', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Chevrolet', model: 'Tracker', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Chevrolet', model: 'Cruze Sedan', category: 'kavro_exec', hasLargeTrunk: true, hasLeatherSeats: true },
  { brand: 'Chevrolet', model: 'Cruze Sport6', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: true },
  { brand: 'Chevrolet', model: 'Equinox', category: 'kavro_exec', hasLargeTrunk: true, hasLeatherSeats: true },

  // Volkswagen
  { brand: 'Volkswagen', model: 'Polo', category: 'kavro_go', hasLargeTrunk: false, hasLeatherSeats: false },
  { brand: 'Volkswagen', model: 'Virtus', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Volkswagen', model: 'Gol', category: 'kavro_go', hasLargeTrunk: false, hasLeatherSeats: false },
  { brand: 'Volkswagen', model: 'Voyage', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Volkswagen', model: 'T-Cross', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Volkswagen', model: 'Nivus', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Volkswagen', model: 'Taos', category: 'kavro_exec', hasLargeTrunk: true, hasLeatherSeats: true },
  { brand: 'Volkswagen', model: 'Jetta', category: 'kavro_exec', hasLargeTrunk: true, hasLeatherSeats: true },
  { brand: 'Volkswagen', model: 'Tiguan', category: 'kavro_exec', hasLargeTrunk: true, hasLeatherSeats: true },

  // Fiat
  { brand: 'Fiat', model: 'Argo', category: 'kavro_go', hasLargeTrunk: false, hasLeatherSeats: false },
  { brand: 'Fiat', model: 'Cronos', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Fiat', model: 'Mobi', category: 'kavro_go', hasLargeTrunk: false, hasLeatherSeats: false },
  { brand: 'Fiat', model: 'Uno', category: 'kavro_go', hasLargeTrunk: false, hasLeatherSeats: false },
  { brand: 'Fiat', model: 'Grand Siena', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Fiat', model: 'Pulse', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Fiat', model: 'Fastback', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: true },
  { brand: 'Fiat', model: 'Toro', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: true },

  // Hyundai
  { brand: 'Hyundai', model: 'HB20 Hatch', category: 'kavro_go', hasLargeTrunk: false, hasLeatherSeats: false },
  { brand: 'Hyundai', model: 'HB20S Sedan', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Hyundai', model: 'Creta', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Hyundai', model: 'Tucson', category: 'kavro_exec', hasLargeTrunk: true, hasLeatherSeats: true },

  // Honda
  { brand: 'Honda', model: 'City Sedan', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Honda', model: 'City Hatch', category: 'kavro_go', hasLargeTrunk: false, hasLeatherSeats: false },
  { brand: 'Honda', model: 'Civic', category: 'kavro_exec', hasLargeTrunk: true, hasLeatherSeats: true },
  { brand: 'Honda', model: 'HR-V', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: true },
  { brand: 'Honda', model: 'Fit', category: 'kavro_go', hasLargeTrunk: false, hasLeatherSeats: false },
  { brand: 'Honda', model: 'CR-V', category: 'kavro_exec', hasLargeTrunk: true, hasLeatherSeats: true },

  // Renault
  { brand: 'Renault', model: 'Kwid', category: 'kavro_go', hasLargeTrunk: false, hasLeatherSeats: false },
  { brand: 'Renault', model: 'Sandero', category: 'kavro_go', hasLargeTrunk: false, hasLeatherSeats: false },
  { brand: 'Renault', model: 'Logan', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Renault', model: 'Duster', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Renault', model: 'Captur', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Renault', model: 'Kardian', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },

  // Nissan
  { brand: 'Nissan', model: 'Versa', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Nissan', model: 'Kicks', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Nissan', model: 'Sentra', category: 'kavro_exec', hasLargeTrunk: true, hasLeatherSeats: true },
  { brand: 'Nissan', model: 'March', category: 'kavro_go', hasLargeTrunk: false, hasLeatherSeats: false },

  // BYD
  { brand: 'BYD', model: 'Dolphin', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'BYD', model: 'Dolphin Mini', category: 'kavro_go', hasLargeTrunk: false, hasLeatherSeats: false },
  { brand: 'BYD', model: 'Song Plus', category: 'kavro_exec', hasLargeTrunk: true, hasLeatherSeats: true },
  { brand: 'BYD', model: 'Seal', category: 'kavro_exec', hasLargeTrunk: true, hasLeatherSeats: true },
  { brand: 'BYD', model: 'Yuan Plus', category: 'kavro_exec', hasLargeTrunk: true, hasLeatherSeats: true },

  // Jeep
  { brand: 'Jeep', model: 'Renegade', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Jeep', model: 'Compass', category: 'kavro_exec', hasLargeTrunk: true, hasLeatherSeats: true },
  { brand: 'Jeep', model: 'Commander', category: 'kavro_exec', hasLargeTrunk: true, hasLeatherSeats: true },

  // Ford
  { brand: 'Ford', model: 'Ka Hatch', category: 'kavro_go', hasLargeTrunk: false, hasLeatherSeats: false },
  { brand: 'Ford', model: 'Ka Sedan', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Ford', model: 'EcoSport', category: 'kavro_plus', hasLargeTrunk: true, hasLeatherSeats: false },
  { brand: 'Ford', model: 'Fusion', category: 'kavro_exec', hasLargeTrunk: true, hasLeatherSeats: true },
];

/** Lista de marcas distintas do catálogo */
export const POPULAR_VEHICLE_BRANDS = Array.from(
  new Set(POPULAR_VEHICLES_CATALOG.map(v => v.brand))
).sort();

/** Busca sugestões de veículos a partir de texto digitado (marca ou modelo) */
export function searchVehicleCatalog(query: string): VehicleCatalogItem[] {
  if (!query || !query.trim()) return [];
  const q = query.toLowerCase().trim();
  return POPULAR_VEHICLES_CATALOG.filter(v =>
    v.brand.toLowerCase().includes(q) ||
    v.model.toLowerCase().includes(q) ||
    `${v.brand} ${v.model}`.toLowerCase().includes(q)
  ).slice(0, 8);
}

/** Encontra correspondência exata ou aproximada para auto-preenchimento das características */
export function findVehicleTemplate(brand: string, model: string): VehicleCatalogItem | null {
  if (!brand || !model) return null;
  const b = brand.toLowerCase().trim();
  const m = model.toLowerCase().trim();
  return POPULAR_VEHICLES_CATALOG.find(v =>
    v.brand.toLowerCase() === b && (v.model.toLowerCase() === m || m.includes(v.model.toLowerCase()))
  ) || null;
}

export interface DetectedVehicleResult {
  brand: string;
  model: string;
  year: string;
  color: string;
  category: 'kavro_go' | 'kavro_plus' | 'kavro_exec';
  hasLargeTrunk: boolean;
  hasLeatherSeats: boolean;
}

/** Identifica automaticamente Marca, Modelo, Ano, Cor e Categoria a partir de uma descrição livre */
export function detectVehicleFromDescription(rawText: string): DetectedVehicleResult | null {
  const text = (rawText || '').trim();
  if (!text) return null;
  const lower = text.toLowerCase();

  // 1. Ano (ex: 2018..2027)
  const yearMatch = text.match(/\b(20[0-2]\d|199\d)\b/);
  const year = yearMatch ? yearMatch[1] : '';

  // 2. Cor
  const matchedColor = POPULAR_CAR_COLORS.find((c) => {
    const baseName = c.name.toLowerCase();
    return lower.includes(baseName) || lower.includes(baseName.slice(0, 5));
  });
  const color = matchedColor ? matchedColor.label : '';

  // 3. Modelo e Marca do catálogo (prioriza nome de modelo mais longo primeiro para diferenciar Onix vs Onix Plus)
  const sortedCatalog = [...POPULAR_VEHICLES_CATALOG].sort((a, b) => b.model.length - a.model.length);
  const matchedVehicle = sortedCatalog.find((v) => {
    const mLower = v.model.toLowerCase();
    const firstWord = mLower.split(' ')[0];
    return lower.includes(mLower) || (firstWord.length >= 3 && lower.includes(firstWord) && (!v.model.includes('Plus') || lower.includes('plus')));
  });

  if (matchedVehicle) {
    return {
      brand: matchedVehicle.brand,
      model: matchedVehicle.model,
      year,
      color,
      category: matchedVehicle.category,
      hasLargeTrunk: matchedVehicle.hasLargeTrunk,
      hasLeatherSeats: matchedVehicle.hasLeatherSeats,
    };
  }

  // Fallback identificando apenas a marca se o modelo for incomum
  const matchedBrand = POPULAR_VEHICLE_BRANDS.find((b) => lower.includes(b.toLowerCase()));
  const cleanedModel = text
    .replace(/\b(20[0-2]\d|199\d)\b/g, ' ')
    .replace(new RegExp(matchedBrand || '^$', 'i'), ' ')
    .replace(new RegExp(matchedColor?.name || '^$', 'i'), ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!matchedBrand && !cleanedModel && !year && !color) return null;

  return {
    brand: matchedBrand || '',
    model: cleanedModel,
    year,
    color,
    category: 'kavro_go',
    hasLargeTrunk: false,
    hasLeatherSeats: false,
  };
}

export function getStudioVehicleFallback(model?: string, category?: string, color?: string): string {
  const ref = `${model || ''} ${category || ''} ${color || ''}`.toLowerCase();
  if (/suv|lux|black|select|exec|bag|van|compass|creta|tracker|t-cross|tcross|corolla cross/i.test(ref)) {
    return '/vehicles/kavro-suv-ev.jpg';
  }
  if (/onix|polo|hb20|argo|kwid|mobi|hatch|plus|vermelh|granada|red/i.test(ref)) {
    return '/vehicles/kavro-compact-ev.jpg';
  }
  return '/vehicles/kavro-sedan-ev.jpg';
}

export interface VehiclePhotoResolution {
  photoUrl: string;
  candidates: { title: string; url: string; score: number }[];
  source: 'driver' | 'exact_lookup' | 'studio';
}

const CLIENT_VEHICLE_PHOTO_MEM = new Map<string, VehiclePhotoResolution>();

/** Busca a foto real exata do carro pela combinação Marca + Modelo + Ano + Cor */
export async function resolveVehiclePhotoExact(params: {
  brand?: string;
  model?: string;
  year?: string;
  color?: string;
  category?: string;
  existingPhoto?: string;
}): Promise<VehiclePhotoResolution> {
  if (params.existingPhoto && params.existingPhoto.trim()) {
    return {
      photoUrl: params.existingPhoto.trim(),
      candidates: [],
      source: 'driver',
    };
  }

  const brand = (params.brand || '').trim();
  const model = (params.model || '').trim();
  const year = (params.year || '').trim();
  const color = (params.color || '').trim();
  const studioFallback = getStudioVehicleFallback(model, params.category, color);

  if (!brand && !model) {
    return { photoUrl: studioFallback, candidates: [], source: 'studio' };
  }

  const key = `kavro_vphoto_${brand.toLowerCase()}|${model.toLowerCase()}|${year}|${color.toLowerCase()}`;
  const mem = CLIENT_VEHICLE_PHOTO_MEM.get(key);
  if (mem) return mem;

  try {
    const cachedRaw = sessionStorage.getItem(key);
    if (cachedRaw) {
      const parsed = JSON.parse(cachedRaw) as VehiclePhotoResolution;
      if (parsed?.photoUrl) {
        CLIENT_VEHICLE_PHOTO_MEM.set(key, parsed);
        return parsed;
      }
    }
  } catch {
    // ignore storage failures
  }

  try {
    const qs = new URLSearchParams({ brand, model, year, color });
    const res = await fetch(`/api/vehicles/photo?${qs.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.primaryUrl) {
        const result: VehiclePhotoResolution = {
          photoUrl: data.primaryUrl,
          candidates: Array.isArray(data.candidates) ? data.candidates : [],
          source: 'exact_lookup',
        };
        CLIENT_VEHICLE_PHOTO_MEM.set(key, result);
        try {
          sessionStorage.setItem(key, JSON.stringify(result));
        } catch {
          // ignore
        }
        return result;
      }
    }
  } catch {
    // fallback silencioso
  }

  const fallbackRes: VehiclePhotoResolution = {
    photoUrl: studioFallback,
    candidates: [],
    source: 'studio',
  };
  CLIENT_VEHICLE_PHOTO_MEM.set(key, fallbackRes);
  return fallbackRes;
}
