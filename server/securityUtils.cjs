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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-pin, x-driver-token, x-client-token, x-status-token, x-webhook-secret',
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

function getUpstashConfig() {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || '').trim().replace(/\/+$/, '');
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  return { url, token, enabled: Boolean(url && token) };
}

function isUpstashConfigured() {
  return getUpstashConfig().enabled;
}

async function upstashPipeline(commands = []) {
  const { url, token, enabled } = getUpstashConfig();
  if (!enabled || !Array.isArray(commands) || commands.length === 0) return null;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 1500) : null;
  try {
    const resp = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(commands),
      ...(controller ? { signal: controller.signal } : {})
    });
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => null);
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function checkRateLimitAsync(namespace, identifier, maxHits = 20, windowMs = 60000) {
  const localRes = checkRateLimit(namespace, identifier, maxHits, windowMs);
  if (!localRes.allowed) return localRes;
  if (!isUpstashConfigured()) return localRes;

  const redisKey = `kavro:rl:${namespace}:${String(identifier || 'unknown').slice(0, 140)}`;
  const res = await upstashPipeline([
    ['INCR', redisKey],
    ['PTTL', redisKey]
  ]);
  if (!res || !res[0]) return localRes;

  const count = Number(res[0].result || 1);
  const pttl = Number(res[1]?.result ?? -1);
  if (pttl < 0) {
    upstashPipeline([['PEXPIRE', redisKey, String(windowMs)]]).catch(() => {});
  }
  if (count > maxHits) {
    const effectiveTtl = pttl > 0 ? pttl : windowMs;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil(effectiveTtl / 1000))
    };
  }
  return {
    allowed: true,
    remaining: Math.max(0, maxHits - count),
    retryAfterSec: 0
  };
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

/**
 * Distância perpendicular (em km) do ponto atual ao segmento Origem -> Destino
 * usando projeção equiretangular local (adequada para trajetos urbanos/regionais).
 */
function crossTrackDistanceKm(origin, destination, current) {
  const oLat = Number(origin?.lat);
  const oLng = Number(origin?.lng);
  const dLat = Number(destination?.lat);
  const dLng = Number(destination?.lng);
  const pLat = Number(current?.lat);
  const pLng = Number(current?.lng);
  if (
    !Number.isFinite(oLat) || !Number.isFinite(oLng) ||
    !Number.isFinite(dLat) || !Number.isFinite(dLng) ||
    !Number.isFinite(pLat) || !Number.isFinite(pLng) ||
    (oLat === 0 && oLng === 0) || (dLat === 0 && dLng === 0)
  ) {
    return 0;
  }

  const refLatRad = (((oLat + dLat) / 2) * Math.PI) / 180;
  const kx = 111.32 * Math.cos(refLatRad);
  const ky = 110.574;

  const ax = 0;
  const ay = 0;
  const bx = (dLng - oLng) * kx;
  const by = (dLat - oLat) * ky;
  const px = (pLng - oLng) * kx;
  const py = (pLat - oLat) * ky;

  const abLenSq = bx * bx + by * by;
  if (abLenSq <= 1e-9) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / abLenSq));
  const projX = ax + t * bx;
  const projY = ay + t * by;
  return Math.hypot(px - projX, py - projY);
}

/**
 * Avalia anomalias estilo Uber RideCheck durante corrida em_andamento:
 * - parada_longa: velocidade < 2 km/h por >= 3 min longe do destino (> 200 m)
 * - desvio_rota: afastamento lateral > 800 m do corredor previsto e distToDest > directDist + 500 m
 */
function evaluateRideCheckAnomaly(ride, newLoc, nowMs = Date.now(), simulateReason = null) {
  const snapshot = ride?.appliedFareSnapshot && typeof ride.appliedFareSnapshot === 'object'
    ? ride.appliedFareSnapshot
    : {};
  const prevCheck = snapshot.rideCheck || null;
  const telemetry = snapshot.rideCheckTelemetry && typeof snapshot.rideCheckTelemetry === 'object'
    ? snapshot.rideCheckTelemetry
    : {};

  if (!ride || ride.status !== 'em_andamento' || !newLoc || !Number.isFinite(Number(newLoc.lat)) || !Number.isFinite(Number(newLoc.lng))) {
    return { triggered: false, rideCheck: prevCheck, telemetry };
  }

  if (prevCheck && prevCheck.status === 'aguardando_resposta') {
    return { triggered: false, rideCheck: prevCheck, telemetry };
  }

  const normalizedSim = simulateReason === 'parada_longa' || simulateReason === 'desvio_rota'
    ? simulateReason
    : null;

  if (!normalizedSim && prevCheck?.respondedAt) {
    const respondedMs = new Date(prevCheck.respondedAt).getTime();
    if (Number.isFinite(respondedMs) && nowMs - respondedMs < 180 * 1000) {
      return { triggered: false, rideCheck: prevCheck, telemetry };
    }
  }

  const curLat = Number(newLoc.lat);
  const curLng = Number(newLoc.lng);
  const speedKmH = Number(newLoc.speedKmH ?? 0);
  const distToDestKm = haversineDistanceKm(curLat, curLng, ride.destination?.lat, ride.destination?.lng);

  const hasAnchor = Number.isFinite(Number(telemetry.anchorLat)) && Number.isFinite(Number(telemetry.anchorLng));
  const movedKm = hasAnchor ? haversineDistanceKm(telemetry.anchorLat, telemetry.anchorLng, curLat, curLng) : 999;

  let stationarySince = Number(telemetry.stationarySince || nowMs);
  let anchorLat = Number(telemetry.anchorLat || curLat);
  let anchorLng = Number(telemetry.anchorLng || curLng);

  if (speedKmH < 2 && movedKm < 0.03) {
    stationarySince = telemetry.stationarySince ? Number(telemetry.stationarySince) : nowMs;
    anchorLat = telemetry.anchorLat !== undefined ? Number(telemetry.anchorLat) : curLat;
    anchorLng = telemetry.anchorLng !== undefined ? Number(telemetry.anchorLng) : curLng;
  } else {
    stationarySince = nowMs;
    anchorLat = curLat;
    anchorLng = curLng;
  }

  const nextTelemetry = {
    stationarySince,
    anchorLat,
    anchorLng,
    lastEvaluatedAt: new Date(nowMs).toISOString(),
    lastSpeedKmH: speedKmH
  };

  const isLongStop = normalizedSim === 'parada_longa' || (
    Number.isFinite(distToDestKm) &&
    distToDestKm > 0.2 &&
    speedKmH < 2 &&
    (nowMs - stationarySince) >= 180 * 1000
  );

  const directDistKm = haversineDistanceKm(ride.origin?.lat, ride.origin?.lng, ride.destination?.lat, ride.destination?.lng);
  const xtkKm = crossTrackDistanceKm(ride.origin, ride.destination, newLoc);
  const isRouteDeviation = normalizedSim === 'desvio_rota' || (
    directDistKm > 0.3 &&
    xtkKm > 0.8 &&
    distToDestKm > directDistKm + 0.5
  );

  if (!isLongStop && !isRouteDeviation) {
    return { triggered: false, rideCheck: prevCheck, telemetry: nextTelemetry };
  }

  const reason = isRouteDeviation ? 'desvio_rota' : 'parada_longa';
  const rideCheck = {
    id: `rc-${nowMs}`,
    reason,
    reasonLabel: reason === 'parada_longa'
      ? 'Parada incomum por mais de 3 minutos longe do destino.'
      : 'Desvio severo da rota prevista detectado pelo GPS.',
    triggeredAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + 60 * 1000).toISOString(),
    status: 'aguardando_resposta',
    lat: curLat,
    lng: curLng
  };

  return {
    triggered: true,
    rideCheck,
    telemetry: nextTelemetry
  };
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

  const isNight = false;
  const nightSurcharge = 0;
  const subtotal =
    pricing.baseFare +
    effectiveDistanceKm * pricing.pricePerKm +
    effectiveDurationMin * pricing.pricePerMinute;

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
function sanitizeRideForViewer(ride, { isAdmin = false, isDriver = false, isOwnerClient = false, isTrackingViewer = false } = {}) {
  if (!ride) return null;
  const snapshot = ride.appliedFareSnapshot && typeof ride.appliedFareSnapshot === 'object'
    ? { ...ride.appliedFareSnapshot }
    : undefined;
  const rawPin = snapshot?.boardingPin || ride.boardingPin || undefined;
  const requiresBoardingPin = Boolean(rawPin);
  const rideCheck = snapshot?.rideCheck || ride.rideCheck || null;
  const trustedContactsDispatches = Array.isArray(snapshot?.trustedContactsDispatches)
    ? snapshot.trustedContactsDispatches
    : (Array.isArray(ride.trustedContactsDispatches) ? ride.trustedContactsDispatches : []);
  const trackingToken = (isAdmin || isOwnerClient || isTrackingViewer)
    ? signTrackingToken('ride', ride.id)
    : undefined;
  const trackingUrl = trackingToken
    ? `/track/${encodeURIComponent(ride.id)}?t=${encodeURIComponent(trackingToken)}`
    : undefined;

  if (isAdmin) {
    return {
      ...ride,
      boardingPin: rawPin,
      requiresBoardingPin,
      rideCheck,
      trustedContactsDispatches,
      trackingToken,
      trackingUrl
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
      rideCheck,
      trustedContactsDispatches,
      trackingToken,
      trackingUrl,
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
      rideCheck,
      trustedContactsDispatches,
      clientPhone: '',
      clientPhoneMasked: maskPhoneDisplay(ride.clientPhone)
    };
    delete copy.boardingPin;
    delete copy.passengerNotes;
    return copy;
  }

  if (isTrackingViewer) {
    const rawDel = ride.deliveryDetails || snapshot?.deliveryDetails || null;
    const maskedDelivery = rawDel
      ? {
          role: rawDel.role || 'sender',
          recipientName: maskNamePublic(rawDel.recipientName),
          recipientPhone: maskPhoneDisplay(rawDel.recipientPhone),
          itemDescription: rawDel.itemDescription || '',
          packageSize: rawDel.packageSize || 'pequeno',
          dropoffMode: rawDel.dropoffMode || 'porta_mao'
        }
      : null;
    return {
      id: ride.id,
      rideNumber: ride.rideNumber,
      rideCode: ride.rideCode,
      status: ride.status,
      category: ride.category,
      categoryName: ride.categoryName,
      serviceType: ride.serviceType || snapshot?.categoryType || 'padrao',
      deliveryDetails: maskedDelivery,
      date: ride.date,
      time: ride.time,
      origin: ride.origin,
      destination: ride.destination,
      distanceKm: ride.distanceKm,
      durationMin: ride.durationMin,
      clientName: maskNamePublic(ride.clientName),
      clientPhone: '',
      driverId: ride.driverId || null,
      driverName: ride.driverName || null,
      driverPhone: '',
      driverPhoto: ride.driverPhoto || null,
      driverVehicle: ride.driverVehicle || null,
      driverPlate: ride.driverPlate || null,
      driverCarColor: ride.driverCarColor || null,
      driverRating: ride.driverRating ?? 5.0,
      driverLocation: ride.driverLocation || null,
      clientLocation: ride.clientLocation || null,
      requiresBoardingPin,
      rideCheck,
      trackingToken,
      trackingUrl,
      trackingReadOnly: true,
      createdAt: ride.createdAt,
      updatedAt: ride.updatedAt
    };
  }

  // Público/anônimo nunca deve receber dados identificáveis ou de terceiros
  return {
    id: ride.id,
    rideNumber: ride.rideNumber,
    rideCode: ride.rideCode,
    status: ride.status,
    category: ride.category,
    categoryName: ride.categoryName,
    serviceType: ride.serviceType || snapshot?.categoryType || 'padrao',
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
  checkRateLimitAsync,
  clearRateLimitForTests,
  isUpstashConfigured,
  upstashPipeline,
  signTrackingToken,
  verifyTrackingToken,
  haversineDistanceKm,
  crossTrackDistanceKm,
  evaluateRideCheckAnomaly,
  calculateOfficialRidePriceServer,
  maskPhoneDisplay,
  maskNamePublic,
  sanitizeDriverForSse,
  sanitizeRideForViewer
};
