const env = require('./env.cjs');
const security = require('./securityUtils.cjs');

const FORWARD_CACHE_TTL_MS = 30 * 60 * 1000;
const REVERSE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_LOCAL_CACHE_SIZE = 600;
const NOMINATIM_COOLDOWN_MS = 60 * 1000;

const FORWARD_CACHE = new Map();
const REVERSE_CACHE = new Map();
const INFLIGHT_REQUESTS = new Map();

let customFetchForTest = null;
let nominatimCooldownUntil = 0;

const metrics = {
  cacheHits: 0,
  cacheMisses: 0,
  upstreamRequests: 0,
  upstreamErrors: 0,
  lastProviderUsed: null,
  lastError: null
};

const STATE_UF_MAP = {
  'Santa Catarina': 'SC',
  'Rio Grande do Sul': 'RS',
  'Paraná': 'PR',
  'São Paulo': 'SP',
  'Rio de Janeiro': 'RJ',
  'Minas Gerais': 'MG',
  'Espírito Santo': 'ES',
  'Bahia': 'BA',
  'Goiás': 'GO',
  'Distrito Federal': 'DF',
  'Pernambuco': 'PE',
  'Ceará': 'CE'
};

function _setGeocodeFetchForTest(fnOrNull) {
  customFetchForTest = typeof fnOrNull === 'function' ? fnOrNull : null;
}

function clearGeocodeCaches() {
  FORWARD_CACHE.clear();
  REVERSE_CACHE.clear();
  INFLIGHT_REQUESTS.clear();
  nominatimCooldownUntil = 0;
  metrics.cacheHits = 0;
  metrics.cacheMisses = 0;
  metrics.upstreamRequests = 0;
  metrics.upstreamErrors = 0;
  metrics.lastProviderUsed = null;
  metrics.lastError = null;
}

function getAppOriginUrl() {
  const explicit = String(env.PUBLIC_APP_URL || process.env.PUBLIC_APP_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const vercelProd = String(env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim();
  if (vercelProd) return `https://${vercelProd.replace(/^https?:\/\//i, '').replace(/\/+$/, '')}`;
  const vercelUrl = String(env.VERCEL_URL || process.env.VERCEL_URL || '').trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '')}`;
  return 'https://kavrodrive.vercel.app';
}

function getConfiguredProviders() {
  const googleKey = String(
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY ||
    ''
  ).trim();
  const mapboxToken = String(
    process.env.MAPBOX_ACCESS_TOKEN ||
    process.env.MAPBOX_API_KEY ||
    ''
  ).trim();
  const locationIqKey = String(process.env.LOCATIONIQ_API_KEY || '').trim();

  let activeProvider = 'photon_nominatim_free';
  let providerLabel = 'Photon + Nominatim + BigDataCloud (Gratuito com Cache)';
  let isCommercial = false;

  if (googleKey) {
    activeProvider = 'google_maps';
    providerLabel = 'Google Maps / Places API';
    isCommercial = true;
  } else if (mapboxToken) {
    activeProvider = 'mapbox';
    providerLabel = 'Mapbox Geocoding API';
    isCommercial = true;
  } else if (locationIqKey) {
    activeProvider = 'locationiq';
    providerLabel = 'LocationIQ Geocoding API';
    isCommercial = true;
  }

  return {
    googleKey,
    mapboxToken,
    locationIqKey,
    activeProvider,
    providerLabel,
    isCommercial
  };
}

function getGeocodeStatus() {
  const cfg = getConfiguredProviders();
  return {
    activeProvider: cfg.activeProvider,
    providerLabel: cfg.providerLabel,
    isCommercial: cfg.isCommercial,
    cacheEntries: FORWARD_CACHE.size + REVERSE_CACHE.size,
    cacheHits: metrics.cacheHits,
    cacheMisses: metrics.cacheMisses,
    upstreamRequests: metrics.upstreamRequests,
    upstreamErrors: metrics.upstreamErrors,
    nominatimCooldownActive: Date.now() < nominatimCooldownUntil,
    lastProviderUsed: metrics.lastProviderUsed,
    lastError: metrics.lastError
  };
}

function setLruCache(map, key, value, ttlMs) {
  if (map.size >= MAX_LOCAL_CACHE_SIZE) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) map.delete(oldestKey);
  }
  map.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function getLruCache(map, key) {
  const entry = map.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    map.delete(key);
    return null;
  }
  // Refresh LRU recency
  map.delete(key);
  map.set(key, entry);
  return entry.value;
}

async function getDistributedCache(redisKey) {
  if (!security.isUpstashConfigured()) return null;
  const res = await security.upstashPipeline([['GET', redisKey]]).catch(() => null);
  const raw = res?.[0]?.result;
  if (typeof raw !== 'string' || !raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setDistributedCache(redisKey, payload, ttlSeconds) {
  if (!security.isUpstashConfigured()) return;
  security.upstashPipeline([
    ['SET', redisKey, JSON.stringify(payload), 'EX', String(Math.max(30, ttlSeconds))]
  ]).catch(() => {});
}

async function fetchJsonWithTimeout(targetUrl, opts = {}, timeoutMs = 3400) {
  const fetchImpl = customFetchForTest || fetch;
  metrics.upstreamRequests += 1;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const tid = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(targetUrl, {
      ...opts,
      ...(controller ? { signal: controller.signal } : {})
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    metrics.upstreamErrors += 1;
    metrics.lastError = err.message;
    return { ok: false, status: 0, data: null };
  } finally {
    if (tid) clearTimeout(tid);
  }
}

function formatOsmAddressParts(addressObj = {}, fallbackDisplayName = '') {
  const a = addressObj && typeof addressObj === 'object' ? addressObj : {};
  const road = a.road || a.pedestrian || a.footway || a.path || a.residential || '';
  const num = a.house_number ? `, ${a.house_number}` : '';
  const hood = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.hamlet || '';
  const city = a.city || a.town || a.village || a.municipality || '';
  const stateRaw = a.state || '';
  const uf = STATE_UF_MAP[stateRaw] ||
    (a['ISO3166-2-lvl4'] ? String(a['ISO3166-2-lvl4']).replace('BR-', '') : stateRaw);

  const suburbPart = hood && hood !== road && hood !== city ? ` - ${hood}` : '';
  const cityPart = city ? `, ${city}${uf ? `/${uf}` : ''}` : '';

  if (road) return `${road}${num}${suburbPart}${cityPart}`;
  if (hood && city) return `${hood}, ${city}${uf ? `/${uf}` : ''}`;
  if (city) return `${city}${uf ? `/${uf}` : ''}`;
  return String(fallbackDisplayName || '').split(',').slice(0, 4).join(',').trim();
}

function deduplicateResults(items) {
  const merged = [];
  const seen = new Set();
  for (const item of items) {
    const label = String(item?.display_name || '').trim();
    const lat = Number(item?.lat);
    const lng = Number(item?.lng);
    if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const key = label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push({ display_name: label, lat, lng });
    }
  }
  return merged.slice(0, 8);
}

async function searchWithGoogle({ q, lat, lng, apiKey }) {
  const placesUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&location=${lat},${lng}&radius=50000&region=br&language=pt-BR&key=${encodeURIComponent(apiKey)}`;
  const pRes = await fetchJsonWithTimeout(placesUrl, {}, 3800);
  if (pRes.ok && Array.isArray(pRes.data?.results) && pRes.data.results.length > 0) {
    const hits = pRes.data.results.slice(0, 8).map(item => ({
      display_name: item.name && item.formatted_address && !String(item.formatted_address).toLowerCase().includes(String(item.name).toLowerCase())
        ? `${item.name} - ${item.formatted_address}`
        : (item.formatted_address || item.name || ''),
      lat: Number(item.geometry?.location?.lat),
      lng: Number(item.geometry?.location?.lng)
    }));
    const clean = deduplicateResults(hits);
    if (clean.length > 0) return clean;
  }

  const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&components=country:BR&language=pt-BR&key=${encodeURIComponent(apiKey)}`;
  const gRes = await fetchJsonWithTimeout(geocodeUrl, {}, 3800);
  if (gRes.ok && Array.isArray(gRes.data?.results)) {
    return deduplicateResults(
      gRes.data.results.slice(0, 8).map(item => ({
        display_name: item.formatted_address || '',
        lat: Number(item.geometry?.location?.lat),
        lng: Number(item.geometry?.location?.lng)
      }))
    );
  }
  return [];
}

async function searchWithMapbox({ q, lat, lng, accessToken }) {
  const targetUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?country=br&language=pt&proximity=${lng},${lat}&limit=8&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetchJsonWithTimeout(targetUrl, {}, 3500);
  if (!res.ok || !Array.isArray(res.data?.features)) return [];
  return deduplicateResults(
    res.data.features.map(f => ({
      display_name: String(f.place_name || f.text || '').replace(/,\s*Brazil$/i, '').trim(),
      lat: Number(f.center?.[1]),
      lng: Number(f.center?.[0])
    }))
  );
}

async function searchWithLocationIq({ q, apiKey }) {
  const targetUrl = `https://us1.locationiq.com/v1/search?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(q)}&format=json&addressdetails=1&countrycodes=br&accept-language=pt-BR&limit=8`;
  const res = await fetchJsonWithTimeout(targetUrl, {}, 3500);
  if (!res.ok || !Array.isArray(res.data)) return [];
  return deduplicateResults(
    res.data.map(item => ({
      display_name: formatOsmAddressParts(item.address, item.display_name),
      lat: Number(item.lat),
      lng: Number(item.lon)
    }))
  );
}

async function searchWithPhoton({ q, lat, lng }) {
  const pUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lat=${lat}&lon=${lng}&location_bias_scale=0.35`;
  const res = await fetchJsonWithTimeout(pUrl, {}, 3200);
  if (!res.ok || !Array.isArray(res.data?.features)) return [];
  return deduplicateResults(
    res.data.features
      .filter((f) => {
        const cc = String(f?.properties?.countrycode || '').toUpperCase();
        return !cc || cc === 'BR';
      })
      .map((f) => {
        const p = f.properties || {};
        const parts = [];
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
          lng: Number(f.geometry?.coordinates?.[0])
        };
      })
  );
}

async function searchWithNominatim({ q }) {
  if (Date.now() < nominatimCooldownUntil) return [];
  const originUrl = getAppOriginUrl();
  const nUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&addressdetails=1&limit=6&countrycodes=br`;
  const res = await fetchJsonWithTimeout(nUrl, {
    headers: {
      'Accept-Language': 'pt-BR,pt;q=0.9',
      'User-Agent': `KavroDrive/1.0 (+${originUrl})`
    }
  }, 3200);
  if (res.status === 429 || res.status === 403) {
    nominatimCooldownUntil = Date.now() + NOMINATIM_COOLDOWN_MS;
    metrics.upstreamErrors += 1;
    metrics.lastError = `Nominatim HTTP ${res.status} (cooldown ${Math.round(NOMINATIM_COOLDOWN_MS / 1000)}s)`;
    return [];
  }
  if (!res.ok || !Array.isArray(res.data)) return [];
  return deduplicateResults(
    res.data.map(item => ({
      display_name: formatOsmAddressParts(item.address, item.display_name),
      lat: Number(item.lat),
      lng: Number(item.lon)
    }))
  );
}

async function runSingleflight(key, workerFn) {
  if (INFLIGHT_REQUESTS.has(key)) {
    return INFLIGHT_REQUESTS.get(key);
  }
  const promise = Promise.resolve()
    .then(workerFn)
    .finally(() => {
      INFLIGHT_REQUESTS.delete(key);
    });
  INFLIGHT_REQUESTS.set(key, promise);
  return promise;
}

async function searchAddress({ q, lat = -28.3878, lng = -49.3977 }) {
  const cleanQ = String(q || '').trim().slice(0, 220);
  if (cleanQ.length < 2) {
    return { ok: true, results: [], provider: 'none', cached: false };
  }

  const biasLat = Number.isFinite(Number(lat)) ? Number(lat) : -28.3878;
  const biasLng = Number.isFinite(Number(lng)) ? Number(lng) : -49.3977;
  const cfg = getConfiguredProviders();

  const normKey = cleanQ
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
  const cacheKey = `${cfg.activeProvider}:${normKey}:${Math.round(biasLat * 10)},${Math.round(biasLng * 10)}`;

  const localHit = getLruCache(FORWARD_CACHE, cacheKey);
  if (localHit) {
    metrics.cacheHits += 1;
    return { ...localHit, cached: true };
  }

  const redisHit = await getDistributedCache(`kavro:geo:fwd:${cacheKey}`);
  if (redisHit && Array.isArray(redisHit.results)) {
    metrics.cacheHits += 1;
    setLruCache(FORWARD_CACHE, cacheKey, redisHit, FORWARD_CACHE_TTL_MS);
    return { ...redisHit, cached: true };
  }

  metrics.cacheMisses += 1;

  return runSingleflight(`fwd:${cacheKey}`, async () => {
    let results = [];
    let providerUsed = cfg.activeProvider;

    if (cfg.googleKey) {
      results = await searchWithGoogle({ q: cleanQ, lat: biasLat, lng: biasLng, apiKey: cfg.googleKey });
      providerUsed = 'google_maps';
    } else if (cfg.mapboxToken) {
      results = await searchWithMapbox({ q: cleanQ, lat: biasLat, lng: biasLng, accessToken: cfg.mapboxToken });
      providerUsed = 'mapbox';
    } else if (cfg.locationIqKey) {
      results = await searchWithLocationIq({ q: cleanQ, apiKey: cfg.locationIqKey });
      providerUsed = 'locationiq';
    }

    // Fallback gratuito automático caso provedor comercial não configurado ou sem resultados
    if (results.length === 0) {
      const photonHits = await searchWithPhoton({ q: cleanQ, lat: biasLat, lng: biasLng });
      results = photonHits;
      providerUsed = 'photon';

      // Só consulta Nominatim quando Photon retorna menos de 3 sugestões (protege rate-limit)
      if (photonHits.length < 3) {
        const nomHits = await searchWithNominatim({ q: cleanQ });
        if (nomHits.length > 0) {
          results = deduplicateResults([...photonHits, ...nomHits]);
          providerUsed = photonHits.length > 0 ? 'photon+nominatim' : 'nominatim';
        }
      }
    }

    metrics.lastProviderUsed = providerUsed;
    const payload = { ok: true, results, provider: providerUsed };
    if (results.length > 0) {
      setLruCache(FORWARD_CACHE, cacheKey, payload, FORWARD_CACHE_TTL_MS);
      setDistributedCache(`kavro:geo:fwd:${cacheKey}`, payload, Math.round(FORWARD_CACHE_TTL_MS / 1000));
    }
    return { ...payload, cached: false };
  });
}

async function reverseGeocode({ lat, lng }) {
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLng) || Math.abs(numLat) > 90 || Math.abs(numLng) > 180) {
    throw new Error('Coordenadas inválidas para geocodificação reversa.');
  }

  const cfg = getConfiguredProviders();
  const cacheKey = `${cfg.activeProvider}:${numLat.toFixed(4)},${numLng.toFixed(4)}`;

  const localHit = getLruCache(REVERSE_CACHE, cacheKey);
  if (localHit) {
    metrics.cacheHits += 1;
    return { ...localHit, cached: true };
  }

  const redisHit = await getDistributedCache(`kavro:geo:rev:${cacheKey}`);
  if (redisHit && redisHit.address) {
    metrics.cacheHits += 1;
    setLruCache(REVERSE_CACHE, cacheKey, redisHit, REVERSE_CACHE_TTL_MS);
    return { ...redisHit, cached: true };
  }

  metrics.cacheMisses += 1;

  return runSingleflight(`rev:${cacheKey}`, async () => {
    let address = '';
    let providerUsed = cfg.activeProvider;

    if (cfg.googleKey) {
      const gUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${numLat},${numLng}&language=pt-BR&key=${encodeURIComponent(cfg.googleKey)}`;
      const gRes = await fetchJsonWithTimeout(gUrl, {}, 3600);
      if (gRes.ok && Array.isArray(gRes.data?.results) && gRes.data.results[0]?.formatted_address) {
        address = String(gRes.data.results[0].formatted_address).replace(/,\s*Brasil$/i, '').trim();
        providerUsed = 'google_maps';
      }
    } else if (cfg.mapboxToken) {
      const mUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${numLng},${numLat}.json?country=br&language=pt&limit=1&access_token=${encodeURIComponent(cfg.mapboxToken)}`;
      const mRes = await fetchJsonWithTimeout(mUrl, {}, 3500);
      if (mRes.ok && Array.isArray(mRes.data?.features) && mRes.data.features[0]?.place_name) {
        address = String(mRes.data.features[0].place_name).replace(/,\s*Brazil$/i, '').trim();
        providerUsed = 'mapbox';
      }
    } else if (cfg.locationIqKey) {
      const lUrl = `https://us1.locationiq.com/v1/reverse?key=${encodeURIComponent(cfg.locationIqKey)}&lat=${numLat}&lon=${numLng}&format=json&addressdetails=1&accept-language=pt-BR`;
      const lRes = await fetchJsonWithTimeout(lUrl, {}, 3500);
      if (lRes.ok && lRes.data) {
        address = formatOsmAddressParts(lRes.data.address, lRes.data.display_name);
        providerUsed = 'locationiq';
      }
    }

    if (!address && Date.now() >= nominatimCooldownUntil) {
      const originUrl = getAppOriginUrl();
      const nUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${numLat}&lon=${numLng}&zoom=18&addressdetails=1`;
      const nRes = await fetchJsonWithTimeout(nUrl, {
        headers: {
          'Accept-Language': 'pt-BR,pt;q=0.9',
          'User-Agent': `KavroDrive/1.0 (+${originUrl})`
        }
      }, 3400);
      if (nRes.status === 429 || nRes.status === 403) {
        nominatimCooldownUntil = Date.now() + NOMINATIM_COOLDOWN_MS;
      } else if (nRes.ok && nRes.data) {
        address = formatOsmAddressParts(nRes.data.address, nRes.data.display_name);
        providerUsed = 'nominatim';
      }
    }

    if (!address) {
      const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${numLat}&longitude=${numLng}&localityLanguage=pt`;
      const bRes = await fetchJsonWithTimeout(bdcUrl, {}, 3200);
      if (bRes.ok && bRes.data) {
        const locality = bRes.data.locality || '';
        const city = bRes.data.city || bRes.data.principalSubdivision || '';
        const uf = bRes.data.principalSubdivisionCode ? String(bRes.data.principalSubdivisionCode).replace('BR-', '') : '';
        if (locality && city && locality !== city) {
          address = `${locality}, ${city}${uf ? `/${uf}` : ''}`;
        } else if (city) {
          address = `${city}${uf ? `/${uf}` : ''}`;
        }
        if (address) providerUsed = 'bigdatacloud';
      }
    }

    const finalAddress = address || `GPS: ${numLat.toFixed(5)}, ${numLng.toFixed(5)}`;
    if (address) {
      metrics.lastProviderUsed = providerUsed;
      const payload = { ok: true, address: finalAddress, provider: providerUsed };
      setLruCache(REVERSE_CACHE, cacheKey, payload, REVERSE_CACHE_TTL_MS);
      setDistributedCache(`kavro:geo:rev:${cacheKey}`, payload, Math.round(REVERSE_CACHE_TTL_MS / 1000));
      return { ...payload, cached: false };
    }

    return { ok: true, address: finalAddress, provider: 'gps_fallback', cached: false };
  });
}

module.exports = {
  getConfiguredProviders,
  getGeocodeStatus,
  searchAddress,
  reverseGeocode,
  clearGeocodeCaches,
  _setGeocodeFetchForTest
};
