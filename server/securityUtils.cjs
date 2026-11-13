const crypto = require('crypto');

// ============================================================
// Utilitários Centrais de Segurança, CORS, Rate Limit & Tarifa
// ============================================================

const RATE_BUCKETS = new Map();
const MAX_RATE_BUCKETS = 10000;

function getSecuritySecret() {
  const configured = String(process.env.ADMIN_SESSION_SECRET || '').trim();
  if (configured) return configured;
  return crypto
    .createHash('sha256')
    .update(`${process.env.DATABASE_URL || 'local'}:${process.env.ADMIN_MASTER_EMAIL || 'kavro'}:sec_v2`)
    .digest('hex');
}

function getAllowedCorsOrigin(req) {
  const origin = String(req?.headers?.origin || '').trim();
  if (!origin) return null;

  const configured = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (configured.length > 0) {
    if (configured.includes(origin)) return origin;
    return null;
  }

  try {
    const parsed = new URL(origin);
    const reqHost = String(req?.headers?.host || '').trim().toLowerCase();
    if (reqHost && parsed.host.toLowerCase() === reqHost) {
      return origin;
    }
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.endsWith('.vercel.app')
    ) {
      return origin;
    }
  } catch {
    return null;
  }
  return null;
}

function buildCorsHeaders(req, extraHeaders = {}) {
  const allowedOrigin = getAllowedCorsOrigin(req);
  const headers = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-pin, x-driver-token, x-client-token, x-webhook-secret',
    ...extraHeaders
  };
  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
  }
  return headers;
}

function checkRateLimit(bucket, identifier, maxHits = 20, windowMs = 60000) {
  const now = Date.now();
  const key = `${bucket}:${String(identifier || 'unknown').slice(0, 140)}`;

  if (RATE_BUCKETS.size > MAX_RATE_BUCKETS) {
    for (const [k, entry] of RATE_BUCKETS.entries()) {
      if (entry.resetAt <= now) RATE_BUCKETS.delete(k);
    }
    if (RATE_BUCKETS.size > MAX_RATE_BUCKETS) {
      RATE_BUCKETS.clear();
    }
  }

  const current = RATE_BUCKETS.get(key);
  if (!current || current.resetAt <= now) {
    RATE_BUCKETS.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(0, maxHits - 1), retryAfterSec: 0 };
  }

  current.count += 1;
  if (current.count > maxHits) {
    const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  return {
    allowed: true,
    remaining: Math.max(0, maxHits - current.count),
    retryAfterSec: 0
  };
}

function clearRateLimitForTests() {
  RATE_BUCKETS.clear();
}

function signTrackingToken(resourceType, resourceId, ttlMs = 24 * 60 * 60 * 1000) {
  const payload = {
    t: String(resourceType),
    id: String(resourceId),
    exp: Date.now() + ttlMs
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSecuritySecret())
    .update(`trk.${encoded}`)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyTrackingToken(rawToken, expectedType, expectedId) {
  const token = String(rawToken || '').trim();
  if (!token || !token.includes('.')) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return false;

  const expectedSig = crypto
    .createHmac('sha256', getSecuritySecret())
    .update(`trk.${encoded}`)
    .digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload || Number(payload.exp || 0) <= Date.now()) return false;
    if (expectedType && payload.t !== String(expectedType)) return false;
    if (expectedId && String(payload.id) !== String(expectedId)) return false;
    return true;
  } catch {
    return false;
  }
}

function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const aLat = Number(lat1);
  const aLng = Number(lng1);
  const bLat = Number(lat2);
  const bLng = Number(lng2);
  if (
    !Number.isFinite(aLat) ||
    !Number.isFinite(aLng) ||
    !Number.isFinite(bLat) ||
    !Number.isFinite(bLng) ||
    (aLat === 0 && aLng === 0) ||
    (bLat === 0 && bLng === 0)
  ) {
    return 0;
  }
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return Math.max(0, R * c);
}

function resolveCategoryPricingServer(categoryObj, cfg = {}, city = '') {
  const baseFareDefault = Number(cfg.baseFare ?? 8.0);
  const perKmDefault = Number(cfg.pricePerKm ?? 3.2);
  const perMinDefault = Number(cfg.pricePerMinute ?? 0.5);
  const minFareDefault = Number(cfg.minimumFare ?? 15.0);

  let baseFare = Number(categoryObj?.baseFare ?? baseFareDefault);
  let pricePerKm = Number(categoryObj?.pricePerKm ?? perKmDefault);
  let pricePerMinute = Number(categoryObj?.pricePerMinute ?? perMinDefault);
  let minimumFare = Number(categoryObj?.minimumFare ?? minFareDefault);
  const multiplier = Number(categoryObj?.multiplier ?? 1.0);
  const commissionPercent = Number(categoryObj?.commissionPercent ?? cfg.platformCommissionPercent ?? 20);

  if (city && Array.isArray(categoryObj?.cityOverrides) && categoryObj.cityOverrides.length > 0) {
    const normalizedCity = String(city).trim().toLowerCase();
    const override = categoryObj.cityOverrides.find(
      o => String(o?.city || '').trim().toLowerCase() === normalizedCity
    );
    if (override) {
      if (override.baseFare !== undefined) baseFare = Number(override.baseFare);
      if (override.pricePerKm !== undefined) pricePerKm = Number(override.pricePerKm);
      if (override.pricePerMinute !== undefined) pricePerMinute = Number(override.pricePerMinute);
      if (override.minimumFare !== undefined) minimumFare = Number(override.minimumFare);
    }
  }

  return { baseFare, pricePerKm, pricePerMinute, minimumFare, multiplier, commissionPercent };
}

/**
 * Calcula a tarifa oficial da corrida no servidor (espelhando o cálculo exibido ao passageiro),
 * impedindo adulteração de preço pelo cliente e aplicando distância mínima Haversine quando há coordenadas.
 */
function calculateOfficialRidePriceServer({
  cfg = {},
  categoryObj = null,
  distanceKm = 0,
  durationMin = 0,
  origin = null,
  destination = null,
  timeStr = '',
  city = ''
}) {
  const pricing = resolveCategoryPricingServer(categoryObj, cfg, city);
  const straightKm = origin && destination
    ? haversineDistanceKm(origin.lat, origin.lng, destination.lat, destination.lng)
    : 0;
  const submittedKm = Math.max(0, Number(distanceKm) || 0);
  const effectiveDistanceKm = straightKm > 0.2 ? Math.max(submittedKm, straightKm) : submittedKm;
  const submittedMin = Math.max(0, Number(durationMin) || 0);
  const effectiveDurationMin = straightKm > 0.5 && submittedMin === 0
    ? Math.max(1, Math.round(effectiveDistanceKm * 1.8))
    : submittedMin;

  let isNight = false;
  const nightStart = Number(cfg.nightStartHour ?? 22);
  const nightEnd = Number(cfg.nightEndHour ?? 6);
  const nightPct = Math.max(0, Number(cfg.nightSurchargePercent ?? 0));
  if (timeStr && String(timeStr).includes(':')) {
    const hour = parseInt(String(timeStr).split(':')[0], 10);
    if (!Number.isNaN(hour) && (hour >= nightStart || hour < nightEnd)) {
      isNight = true;
    }
  }

  let subtotal =
    pricing.baseFare +
    effectiveDistanceKm * pricing.pricePerKm +
    effectiveDurationMin * pricing.pricePerMinute;

  let nightSurcharge = 0;
  if (isNight && nightPct > 0) {
    nightSurcharge = subtotal * (nightPct / 100);
    subtotal += nightSurcharge;
  }

  const officialPrice = Math.max(pricing.minimumFare, Math.round(subtotal * 10) / 10);
  return {
    totalPrice: Number(officialPrice.toFixed(2)),
    effectiveDistanceKm: Number(effectiveDistanceKm.toFixed(2)),
    effectiveDurationMin: Math.round(effectiveDurationMin),
    pricing,
    isNight,
    nightSurcharge: Number(nightSurcharge.toFixed(2))
  };
}

function maskPhoneDisplay(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 4) return '';
  return `••••-${digits.slice(-4)}`;
}

function maskNamePublic(fullName) {
  if (!fullName) return 'Usuário Verificado';
  const parts = String(fullName).trim().split(/\s+/);
  if (parts.length === 1) return `${parts[0].slice(0, 3)}•••`;
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${parts[0]} ${lastInitial}.`;
}

/**
 * Remove PII sensível do motorista para payloads públicos/SSE.
 */
function sanitizeDriverForSse(driver) {
  if (!driver) return null;
  return {
    id: driver.id,
    name: driver.name,
    photo: driver.photo || '',
    approvalStatus: driver.approvalStatus || 'pendente_aprovacao',
    isOnline: Boolean(driver.isOnline),
    currentRideId: driver.currentRideId || null,
    queuedRideId: driver.queuedRideId || null,
    vehicleBrand: driver.vehicleBrand || '',
    vehicleModel: driver.vehicleModel || '',
    vehicleColor: driver.vehicleColor || '',
    vehicleYear: driver.vehicleYear || '',
    vehiclePlate: driver.vehiclePlate || '',
    vehicleCategory: driver.vehicleCategory || 'kavro_go',
    eligibleCategories: driver.eligibleCategories || ['kavro_go'],
    enabledCategories: driver.enabledCategories || ['kavro_go'],
    location: driver.location || null,
    rating: Number(driver.rating ?? 5.0),
    totalRides: Number(driver.totalRides ?? 0)
  };
}

/**
 * Sanitiza corrida conforme o papel de quem consulta:
 * - Admin vê tudo.
 * - Passageiro dono vê seu boardingPin e mascara telefone pessoal do motorista (usa Chat In-App).
 * - Motorista vê mascara do telefone pessoal do passageiro, NUNCA recebe o boardingPin, mas recebe requiresBoardingPin.
 */
function sanitizeRideForViewer(ride, { isAdmin = false, isDriver = false, isOwnerClient = false } = {}) {
  if (!ride) return null;
  const snapshot = ride.appliedFareSnapshot && typeof ride.appliedFareSnapshot === 'object'
    ? { ...ride.appliedFareSnapshot }
    : undefined;
  const rawPin = snapshot?.boardingPin || ride.boardingPin || undefined;
  const requiresBoardingPin = Boolean(rawPin);

  if (isAdmin) {
    return {
      ...ride,
      boardingPin: rawPin,
      requiresBoardingPin
    };
  }

  if (snapshot) {
    delete snapshot.boardingPin;
  }

  if (isOwnerClient) {
    const copy = {
      ...ride,
      appliedFareSnapshot: snapshot,
      boardingPin: rawPin,
      requiresBoardingPin,
      driverPhone: '',
      driverPhoneMasked: maskPhoneDisplay(ride.driverPhone)
    };
    delete copy.driverNotes;
    return copy;
  }

  if (isDriver) {
    const copy = {
      ...ride,
      appliedFareSnapshot: snapshot,
      requiresBoardingPin,
      clientPhone: '',
      clientPhoneMasked: maskPhoneDisplay(ride.clientPhone)
    };
    delete copy.boardingPin;
    delete copy.passengerNotes;
    return copy;
  }

  // Público/anônimo nunca deve receber dados identificáveis ou de terceiros
  return {
    id: ride.id,
    rideNumber: ride.rideNumber,
    rideCode: ride.rideCode,
    status: ride.status,
    category: ride.category,
    categoryName: ride.categoryName,
    date: ride.date,
    time: ride.time,
    totalPrice: ride.totalPrice,
    clientName: maskNamePublic(ride.clientName),
    clientPhone: '',
    clientId: '',
    driverPhone: '',
    requiresBoardingPin
  };
}

module.exports = {
  getAllowedCorsOrigin,
  buildCorsHeaders,
  checkRateLimit,
  clearRateLimitForTests,
  signTrackingToken,
  verifyTrackingToken,
  haversineDistanceKm,
  calculateOfficialRidePriceServer,
  maskPhoneDisplay,
  maskNamePublic,
  sanitizeDriverForSse,
  sanitizeRideForViewer
};
