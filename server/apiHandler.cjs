const crypto = require('crypto');
const db = require('./db.cjs');
const push = require('./push.cjs');
const env = require('./env.cjs');
const finance = require('./financeEngine.cjs');
const kycStorage = require('./kycStorage.cjs');
const driverTermsContract = require('./driverTermsContract.cjs');
const passengerTermsContract = require('./passengerTermsContract.cjs');

function getRequestClientIp(req) {
  return (
    String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    '127.0.0.1'
  );
}

const VALID_ADMIN_PINS = ['1234', '2026', 'admin', '0000', '9999'];

// Memória rápida para telemetria em tempo real de SOS
const sosMemoryStore = new Map();

// Helper para gravar/atualizar corrida tanto no Postgres quanto no LocalStore com todos os campos novos
async function upsertFullRide(rideObj) {
  await finance.ensureExtendedSchema();
  const now = new Date().toISOString();
  const row = {
    id: rideObj.id,
    ride_number: rideObj.rideNumber || 1,
    client_name: rideObj.clientName || 'Passageiro',
    client_phone: rideObj.clientPhone || '',
    client_id: rideObj.clientId || null,
    driver_id: rideObj.driverId ?? null,
    driver_name: rideObj.driverName ?? null,
    driver_phone: rideObj.driverPhone ?? null,
    driver_photo: rideObj.driverPhoto ?? null,
    driver_vehicle: rideObj.driverVehicle ?? null,
    driver_plate: rideObj.driverPlate ?? null,
    driver_car_color: rideObj.driverCarColor ?? null,
    driver_rating: rideObj.driverRating ?? 5.0,
    is_queued_ride: Boolean(rideObj.isQueuedRide),
    queued_for_driver_id: rideObj.queuedForDriverId ?? null,
    declined_driver_ids: Array.isArray(rideObj.declinedDriverIds) ? rideObj.declinedDriverIds : [],
    origin: rideObj.origin || {},
    destination: rideObj.destination || {},
    date: rideObj.date || now.split('T')[0],
    time: rideObj.time || new Date().toTimeString().slice(0, 5),
    passengers: Number(rideObj.passengers || 1),
    has_luggage: Boolean(rideObj.hasLuggage),
    category: rideObj.category || 'kavro_go',
    category_name: rideObj.categoryName || null,
    applied_fare_snapshot: rideObj.appliedFareSnapshot || null,
    distance_km: Number(rideObj.distanceKm || 0),
    duration_min: Number(rideObj.durationMin || 0),
    estimated_price: finance.round2(rideObj.estimatedPrice ?? rideObj.totalPrice ?? 0),
    total_price: finance.round2(rideObj.totalPrice || 0),
    paid_amount: finance.round2(rideObj.paidAmount || 0),
    commission_percent: finance.round2(rideObj.commissionPercent ?? 20),
    commission_amount: finance.round2(rideObj.commissionAmount || 0),
    driver_net_amount: finance.round2(rideObj.driverNetAmount || 0),
    payment_method: rideObj.paymentMethod || 'pix',
    payment_status: rideObj.paymentStatus || 'aguardando',
    payment_tx_id: rideObj.paymentTxId || null,
    pix_qr_code: rideObj.pixQrCode || '',
    pix_copy_paste: rideObj.pixCopyPaste || '',
    card_id: rideObj.cardId || '',
    card_last4: rideObj.cardLast4 || '',
    card_brand: rideObj.cardBrand || '',
    status: rideObj.status || 'aguardando_confirmacao',
    driver_notes: rideObj.driverNotes || null,
    notes: rideObj.notes || null,
    driver_location: rideObj.driverLocation || null,
    client_location: rideObj.clientLocation || null,
    is_manual_booking: Boolean(rideObj.isManualBooking),
    updated_at: now
  };

  if (!db.pool) {
    const idx = db.localStore.rides.findIndex(r => r.id === row.id);
    if (idx >= 0) {
      db.localStore.rides[idx] = { ...db.localStore.rides[idx], ...row };
    } else {
      row.created_at = now;
      db.localStore.rides.unshift(row);
    }
    db.saveLocalStore();
    return formatRideFromDb(db.localStore.rides.find(r => r.id === row.id));
  }

  const r = await db.query(
    `INSERT INTO public.rides (
      id, ride_number, client_name, client_phone, client_id,
      driver_id, driver_name, driver_phone, driver_photo, driver_vehicle, driver_plate, driver_car_color, driver_rating,
      is_queued_ride, queued_for_driver_id, declined_driver_ids,
      origin, destination, date, time, passengers, has_luggage, category, category_name, applied_fare_snapshot,
      distance_km, duration_min, estimated_price, total_price, paid_amount,
      commission_percent, commission_amount, driver_net_amount,
      payment_method, payment_status, payment_tx_id, pix_qr_code, pix_copy_paste,
      card_id, card_last4, card_brand, status, driver_notes, notes, is_manual_booking, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      driver_id = EXCLUDED.driver_id,
      driver_name = EXCLUDED.driver_name,
      driver_phone = EXCLUDED.driver_phone,
      driver_photo = EXCLUDED.driver_photo,
      driver_vehicle = EXCLUDED.driver_vehicle,
      driver_plate = EXCLUDED.driver_plate,
      driver_car_color = EXCLUDED.driver_car_color,
      driver_rating = EXCLUDED.driver_rating,
      is_queued_ride = EXCLUDED.is_queued_ride,
      queued_for_driver_id = EXCLUDED.queued_for_driver_id,
      declined_driver_ids = EXCLUDED.declined_driver_ids,
      origin = EXCLUDED.origin,
      destination = EXCLUDED.destination,
      date = EXCLUDED.date,
      time = EXCLUDED.time,
      passengers = EXCLUDED.passengers,
      has_luggage = EXCLUDED.has_luggage,
      category = EXCLUDED.category,
      category_name = COALESCE(EXCLUDED.category_name, public.rides.category_name),
      applied_fare_snapshot = COALESCE(EXCLUDED.applied_fare_snapshot, public.rides.applied_fare_snapshot),
      distance_km = EXCLUDED.distance_km,
      duration_min = EXCLUDED.duration_min,
      estimated_price = EXCLUDED.estimated_price,
      total_price = EXCLUDED.total_price,
      paid_amount = EXCLUDED.paid_amount,
      commission_percent = EXCLUDED.commission_percent,
      commission_amount = EXCLUDED.commission_amount,
      driver_net_amount = EXCLUDED.driver_net_amount,
      payment_method = EXCLUDED.payment_method,
      payment_status = EXCLUDED.payment_status,
      payment_tx_id = EXCLUDED.payment_tx_id,
      pix_qr_code = EXCLUDED.pix_qr_code,
      pix_copy_paste = EXCLUDED.pix_copy_paste,
      card_id = EXCLUDED.card_id,
      card_last4 = EXCLUDED.card_last4,
      card_brand = EXCLUDED.card_brand,
      status = EXCLUDED.status,
      driver_notes = EXCLUDED.driver_notes,
      notes = EXCLUDED.notes,
      is_manual_booking = EXCLUDED.is_manual_booking,
      updated_at = NOW()
    RETURNING *`,
    [
      row.id, row.ride_number, row.client_name, row.client_phone, row.client_id,
      row.driver_id, row.driver_name, row.driver_phone, row.driver_photo, row.driver_vehicle,
      row.driver_plate, row.driver_car_color, row.driver_rating,
      row.is_queued_ride, row.queued_for_driver_id, JSON.stringify(row.declined_driver_ids),
      JSON.stringify(row.origin), JSON.stringify(row.destination), row.date, row.time,
      row.passengers, row.has_luggage, row.category, row.category_name,
      row.applied_fare_snapshot ? JSON.stringify(row.applied_fare_snapshot) : null,
      row.distance_km, row.duration_min,
      row.estimated_price, row.total_price, row.paid_amount,
      row.commission_percent, row.commission_amount, row.driver_net_amount,
      row.payment_method, row.payment_status, row.payment_tx_id, row.pix_qr_code, row.pix_copy_paste,
      row.card_id, row.card_last4, row.card_brand, row.status, row.driver_notes, row.notes,
      row.is_manual_booking
    ]
  );
  return formatRideFromDb(r.rows[0]);
}

let clientsSchemaReady = false;
async function ensureClientsSchema() {
  if (clientsSchemaReady) return;
  try {
    await db.query(`
      ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS document VARCHAR(32);
      ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS password_hash TEXT;
      ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS blocked BOOLEAN DEFAULT FALSE;
      ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
      ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS terms_signature JSONB;
    `);
    await finance.ensureExtendedSchema();
    clientsSchemaReady = true;
  } catch (err) {
    console.error('[ensureClientsSchema]', err.message);
  }
}

function hashPassword(password) {
  const clean = String(password || '');
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(clean, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !password) return false;
  const clean = String(password);
  if (storedHash.startsWith('scrypt:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;
    const [, salt, keyHex] = parts;
    const derived = crypto.scryptSync(clean, salt, 64);
    const keyBuf = Buffer.from(keyHex, 'hex');
    if (derived.length !== keyBuf.length) return false;
    return crypto.timingSafeEqual(derived, keyBuf);
  }
  return storedHash === clean;
}

async function verifyTurnstileToken(token, remoteIp) {
  const secret = (process.env.TURNSTILE_SECRET_KEY || '').trim();
  if (!secret) return { ok: true, skipped: true };
  const cleanToken = String(token || '').trim();
  if (!cleanToken) {
    return { ok: false, error: 'Confirme a verificação de segurança anti-robô para continuar.' };
  }
  try {
    const form = new URLSearchParams();
    form.set('secret', secret);
    form.set('response', cleanToken);
    if (remoteIp) form.set('remoteip', String(remoteIp));
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    const data = await resp.json();
    if (data && data.success) return { ok: true };
    return { ok: false, error: 'Verificação anti-robô expirada ou inválida. Tente novamente.' };
  } catch (err) {
    console.warn('[Turnstile] Erro ao validar token:', err.message);
    return { ok: false, error: 'Não foi possível validar a verificação de segurança. Tente novamente.' };
  }
}

function sanitizePublicConfig(cfg, isAdmin = false) {
  if (!cfg) return null;
  const copy = { ...cfg };
  if (copy.driverPlate === 'BRA-2E19' && (copy.driverCarModel === 'Corolla XEi 2.0' || !copy.driverCarModel)) {
    copy.driverPlate = '';
    copy.driverCarBrand = '';
    copy.driverCarModel = '';
    copy.driverCarColor = '';
    copy.driverCarYear = '';
    copy.driverVehicle = '';
  }
  if (!isAdmin) {
    delete copy.adminPin;
    delete copy.driverVehicleApiToken;
  }
  return copy;
}

function sanitizeClientRow(row, isAdmin = false) {
  const base = {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email || undefined,
    document: row.document || undefined,
    blocked: Boolean(row.blocked),
    savedAddresses: row.saved_addresses || [],
    termsAcceptedAt: row.terms_accepted_at || undefined,
    termsSignature: row.terms_signature || undefined,
    createdAt: row.created_at
  };
  if (isAdmin) {
    base.notes = row.notes || undefined;
  }
  return base;
}

function maskClientNamePublic(fullName) {
  if (!fullName) return 'Passageiro Verificado';
  const parts = String(fullName).trim().split(/\s+/);
  if (parts.length === 1) return `${parts[0].slice(0, 3)}•••`;
  const first = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${first} ${lastInitial}. •••`;
}

function sanitizeRideForPublic(ride, reqClientId, reqClientPhoneDigits) {
  const ridePhoneDigits = String(ride.clientPhone || '').replace(/\D/g, '');
  const isOwnRide =
    (reqClientId && ride.clientId && String(reqClientId) === String(ride.clientId)) ||
    (reqClientPhoneDigits && reqClientPhoneDigits.length >= 8 && ridePhoneDigits === reqClientPhoneDigits);

  if (isOwnRide) {
    const ownCopy = { ...ride };
    delete ownCopy.driverNotes;
    return ownCopy;
  }

  return {
    ...ride,
    clientName: maskClientNamePublic(ride.clientName),
    clientPhone: '',
    clientId: '',
    notes: undefined,
    driverNotes: undefined,
    clientLocation: undefined
  };
}

async function isAuthorizedAdmin(req) {
  const pinHeader = req.headers['x-admin-pin'] || (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!pinHeader) return false;
  const cleanPin = String(pinHeader).trim().toLowerCase();
  if (VALID_ADMIN_PINS.includes(cleanPin)) return true;

  try {
    const cfgRes = await db.query('SELECT config FROM public.system_config WHERE id = $1', ['default']);
    const customPin = cfgRes.rows[0]?.config?.adminPin;
    if (customPin && String(customPin).trim().toLowerCase() === cleanPin) {
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}

function parseBody(req) {
  let preParsed;
  try { preParsed = req.body; } catch { return Promise.resolve({}); }
  if (preParsed !== undefined && preParsed !== null) {
    if (typeof preParsed === 'string') {
      try { return Promise.resolve(JSON.parse(preParsed)); } catch { return Promise.resolve({}); }
    }
    return Promise.resolve(preParsed);
  }
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-pin, x-client-id, x-client-phone, x-driver-id'
  });
  res.end(JSON.stringify(data));
}

function normalizeRideId(rawId) {
  if (!rawId) return '';
  const str = String(rawId).trim();
  const digits = str.replace(/\D/g, '');
  if (digits && (/^#?\s*UP/i.test(str) || /^\d+$/.test(str))) {
    return `UP-${String(parseInt(digits, 10)).padStart(3, '0')}`;
  }
  return str;
}

function formatRideFromDb(row) {
  if (!row) return null;
  const num = row.ride_number
    ? Number(row.ride_number)
    : parseInt(String(row.id || '').replace(/\D/g, ''), 10) || 1;
  const padded = String(num).padStart(3, '0');
  const totalPrice = Number(row.total_price ?? row.totalPrice ?? 0);
  const commPct = Number(row.commission_percent ?? row.commissionPercent ?? 20);
  const commAmt = row.commission_amount !== undefined
    ? Number(row.commission_amount)
    : finance.round2(totalPrice * (commPct / 100));
  const netAmt = row.driver_net_amount !== undefined
    ? Number(row.driver_net_amount)
    : finance.round2(totalPrice - commAmt);

  return {
    id: row.id || `UP-${padded}`,
    rideNumber: num,
    rideCode: `#UP - ${padded}`,
    clientName: row.client_name ?? row.clientName,
    clientPhone: row.client_phone ?? row.clientPhone,
    clientId: row.client_id ?? row.clientId,
    driverId: row.driver_id ?? row.driverId ?? null,
    driverName: row.driver_name ?? row.driverName ?? null,
    driverPhone: row.driver_phone ?? row.driverPhone ?? null,
    driverPhoto: row.driver_photo ?? row.driverPhoto ?? null,
    driverVehicle: row.driver_vehicle ?? row.driverVehicle ?? null,
    driverPlate: row.driver_plate ?? row.driverPlate ?? null,
    driverCarColor: row.driver_car_color ?? row.driverCarColor ?? null,
    driverRating: row.driver_rating ? Number(row.driver_rating) : 5.0,
    isQueuedRide: Boolean(row.is_queued_ride ?? row.isQueuedRide),
    queuedForDriverId: row.queued_for_driver_id ?? row.queuedForDriverId ?? null,
    declinedDriverIds: Array.isArray(row.declined_driver_ids)
      ? row.declined_driver_ids
      : Array.isArray(row.declinedDriverIds)
        ? row.declinedDriverIds
        : [],
    origin: row.origin,
    destination: row.destination,
    date: row.date,
    time: row.time,
    passengers: Number(row.passengers || 1),
    hasLuggage: Boolean(row.has_luggage ?? row.hasLuggage),
    category: row.category || 'kavro_go',
    categoryName: row.category_name ?? row.categoryName ?? undefined,
    appliedFareSnapshot: row.applied_fare_snapshot ?? row.appliedFareSnapshot ?? undefined,
    distanceKm: Number(row.distance_km ?? row.distanceKm ?? 0),
    durationMin: Number(row.duration_min ?? row.durationMin ?? 0),
    baseFare: Number(row.base_fare ?? row.baseFare ?? 8),
    estimatedPrice: Number(row.estimated_price ?? row.estimatedPrice ?? totalPrice),
    totalPrice,
    paidAmount: Number(row.paid_amount ?? row.paidAmount ?? 0),
    commissionPercent: commPct,
    commissionAmount: commAmt,
    driverNetAmount: netAmt,
    paymentMethod: row.payment_method ?? row.paymentMethod ?? 'pix',
    paymentStatus: row.payment_status ?? row.paymentStatus ?? 'aguardando',
    paymentTxId: row.payment_tx_id ?? row.paymentTxId ?? undefined,
    pixQrCode: row.pix_qr_code ?? row.pixQrCode ?? undefined,
    pixCopyPaste: row.pix_copy_paste ?? row.pixCopyPaste ?? undefined,
    cardId: row.card_id ?? row.cardId ?? undefined,
    cardLast4: row.card_last4 ?? row.cardLast4 ?? undefined,
    cardBrand: row.card_brand ?? row.cardBrand ?? undefined,
    status: row.status,
    driverNotes: row.driver_notes ?? row.driverNotes,
    notes: row.notes,
    driverLocation: row.driver_location || row.driverLocation || undefined,
    clientLocation: row.client_location || row.clientLocation || undefined,
    isManualBooking: Boolean(row.is_manual_booking ?? row.isManualBooking),
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt
  };
}

async function handleApiRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-pin, x-client-id, x-client-phone, x-driver-id'
    });
    return res.end();
  }

  try {
    // 0. HEALTH CHECK
    if (pathname === '/api/health') {
      const dbRes = await db.query('SELECT NOW() as now');
      return sendJson(res, 200, { ok: true, now: dbRes.rows[0].now });
    }

    // 0.1 DYNAMIC PWA MANIFEST
    if (pathname === '/api/manifest') {
      const roleParam = url.searchParams.get('role');
      const referer = String(req.headers.referer || '');
      const isAdmin =
        roleParam === 'admin' ||
        /\/(administracion|admin|motora|motorista|painel|dashboard)(\/|\?|$)/i.test(referer);

      const manifestData = {
        id: isAdmin ? '/motora' : '/cliente',
        name: isAdmin ? 'KAVRO DRIVE - Painel do Motorista' : 'KAVRO DRIVE - Transporte Particular',
        short_name: isAdmin ? 'Kavro Motorista' : 'Kavro Drive',
        description: isAdmin
          ? 'App do motorista parceiro e painel operacional Kavro Drive.'
          : 'Peça sua corrida agora com segurança, Pix, Cartão ou Dinheiro.',
        start_url: isAdmin ? '/motora' : '/',
        scope: '/',
        display: 'standalone',
        background_color: '#121A21',
        theme_color: '#121A21',
        orientation: 'portrait-primary',
        icons: [
          { src: '/pwa-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/pwa-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: '/logo-icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
        ]
      };

      res.writeHead(200, {
        'Content-Type': 'application/manifest+json; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Vary': 'Referer'
      });
      return res.end(JSON.stringify(manifestData));
    }

    // 0.2 PUBLIC TURNSTILE CONFIGURATION (apenas site key pública + flag enabled)
    if (pathname === '/api/turnstile-config' && method === 'GET') {
      const siteKey = (
        process.env.VITE_TURNSTILE_SITE_KEY ||
        process.env.TURNSTILE_SITE_KEY ||
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
        ''
      ).trim();
      return sendJson(res, 200, {
        ok: true,
        enabled: Boolean((process.env.TURNSTILE_SECRET_KEY || '').trim()),
        siteKey
      });
    }

    // 1. SYNC ALL DATA IN 1 FAST CALL
    if (pathname === '/api/sync' && method === 'GET') {
      await ensureClientsSchema();
      const isAdmin = await isAuthorizedAdmin(req);
      const reqDriverId = String(url.searchParams.get('driverId') || req.headers['x-driver-id'] || '').trim();
      const reqClientId = String(url.searchParams.get('clientId') || req.headers['x-client-id'] || '').trim();
      const reqClientPhoneDigits = String(url.searchParams.get('clientPhone') || req.headers['x-client-phone'] || '').replace(/\D/g, '');

      const allDrivers = await finance.listDrivers();
      const onlineDriversPublic = allDrivers
        .filter(d => d.approvalStatus === 'aprovado' && d.isOnline)
        .map(d => ({
          id: d.id,
          name: d.name,
          photo: d.photo,
          vehicleBrand: d.vehicleBrand,
          vehicleModel: d.vehicleModel,
          vehicleVersion: d.vehicleVersion,
          vehicleYear: d.vehicleYear,
          vehicleColor: d.vehicleColor,
          vehiclePlate: d.vehiclePlate,
          vehicleCategory: d.vehicleCategory,
          eligibleCategories: d.eligibleCategories,
          enabledCategories: d.enabledCategories,
          rating: d.rating,
          totalRides: d.totalRides,
          currentRideId: d.currentRideId,
          queuedRideId: d.queuedRideId,
          location: d.location
        }));

      if (isAdmin || reqDriverId) {
        const [cfgRes, ridesRes, expRes, cliRes, notifRes, slotsRes] = await Promise.all([
          db.query('SELECT config FROM public.system_config WHERE id = $1', ['default']),
          db.query('SELECT * FROM public.rides ORDER BY date DESC, time DESC'),
          db.query('SELECT * FROM public.expenses ORDER BY date DESC'),
          db.query('SELECT * FROM public.clients ORDER BY created_at DESC'),
          db.query('SELECT * FROM public.notifications ORDER BY timestamp DESC LIMIT 50'),
          db.query('SELECT date, slots FROM public.blocked_slots')
        ]);

        const blockedSlotsMap = {};
        slotsRes.rows.forEach(r => {
          blockedSlotsMap[r.date] = r.slots || [];
        });

        return sendJson(res, 200, {
          config: sanitizePublicConfig(cfgRes.rows[0]?.config || null, true),
          rides: ridesRes.rows.map(formatRideFromDb),
          drivers: isAdmin ? allDrivers : onlineDriversPublic,
          onlineDriversCount: onlineDriversPublic.length,
          expenses: expRes.rows.map(r => ({
            id: r.id,
            description: r.description,
            amount: Number(r.amount),
            category: r.category,
            date: r.date,
            notes: r.notes,
            type: r.type || 'saida',
            paymentMethod: r.payment_method || 'dinheiro',
            createdAt: r.created_at
          })),
          clients: isAdmin ? cliRes.rows.map(r => sanitizeClientRow(r, true)) : [],
          notifications: notifRes.rows.map(r => ({
            id: r.id,
            title: r.title,
            message: r.message,
            type: r.type,
            rideId: r.ride_id,
            read: r.read,
            timestamp: r.timestamp
          })),
          blockedSlots: blockedSlotsMap
        });
      }

      const selfClientPromise = (reqClientId || reqClientPhoneDigits.length >= 8)
        ? db.query(
            `SELECT * FROM public.clients
             WHERE ($1 <> '' AND id = $1)
                OR ($2 <> '' AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $2)
             LIMIT 1`,
            [reqClientId, reqClientPhoneDigits]
          )
        : Promise.resolve({ rows: [] });

      const [cfgRes, ridesRes, slotsRes, selfCliRes] = await Promise.all([
        db.query('SELECT config FROM public.system_config WHERE id = $1', ['default']),
        db.query('SELECT * FROM public.rides ORDER BY date DESC, time DESC'),
        db.query('SELECT date, slots FROM public.blocked_slots'),
        selfClientPromise
      ]);

      const blockedSlotsMap = {};
      slotsRes.rows.forEach(r => {
        blockedSlotsMap[r.date] = r.slots || [];
      });

      return sendJson(res, 200, {
        config: sanitizePublicConfig(cfgRes.rows[0]?.config || null, false),
        rides: ridesRes.rows.map(r => sanitizeRideForPublic(formatRideFromDb(r), reqClientId, reqClientPhoneDigits)),
        onlineDrivers: onlineDriversPublic,
        onlineDriversCount: onlineDriversPublic.length,
        expenses: [],
        clients: selfCliRes.rows.map(r => sanitizeClientRow(r, false)),
        notifications: [],
        blockedSlots: blockedSlotsMap
      });
    }

    // 2. CONFIG
    if (pathname === '/api/config') {
      if (method === 'GET') {
        const isAdmin = await isAuthorizedAdmin(req);
        const r = await db.query('SELECT config FROM public.system_config WHERE id = $1', ['default']);
        return sendJson(res, 200, sanitizePublicConfig(r.rows[0]?.config || {}, isAdmin) || {});
      }
      if (method === 'POST') {
        if (!await isAuthorizedAdmin(req)) {
          return sendJson(res, 401, { error: 'Acesso não autorizado: PIN de administrador inválido ou ausente.' });
        }
        const body = await parseBody(req);
        await db.query(`
          INSERT INTO public.system_config (id, config, updated_at)
          VALUES ('default', $1, NOW())
          ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW();
        `, [JSON.stringify(body)]);
        return sendJson(res, 200, { ok: true, config: body });
      }
    }

    // ============================================================
    // 2.5 MOTORISTAS (CADASTRO ESTILO UBER, LOGIN, ONLINE/OFFLINE, CARTEIRA)
    // ============================================================
    if (pathname === '/api/drivers/register' && method === 'POST') {
      const body = await parseBody(req);
      const turnstile = await verifyTurnstileToken(body.turnstileToken, req.socket?.remoteAddress);
      if (!turnstile.ok) {
        return sendJson(res, 403, { ok: false, error: turnstile.error });
      }
      const name = String(body.name || '').trim();
      const phone = String(body.phone || '').trim();
      const cleanPhone = phone.replace(/\D/g, '');
      const document = String(body.document || '').replace(/\D/g, '');
      const cnh = String(body.cnh || '').replace(/\D/g, '');
      const password = String(body.password || '');
      const vehicleBrand = String(body.vehicleBrand || '').trim();
      const vehicleModel = String(body.vehicleModel || '').trim();
      const vehicleColor = String(body.vehicleColor || '').trim();
      const vehicleYear = String(body.vehicleYear || '2024').trim();
      const vehiclePlate = String(body.vehiclePlate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

      if (!name || cleanPhone.length < 10) {
        return sendJson(res, 400, { ok: false, error: 'Informe nome completo e WhatsApp válido.' });
      }
      if (document.length < 11) {
        return sendJson(res, 400, { ok: false, error: 'Informe um CPF válido com 11 dígitos.' });
      }
      if (!body.partialOnboarding && (!vehicleBrand || !vehicleModel || !vehiclePlate)) {
        return sendJson(res, 400, { ok: false, error: 'Preencha os dados completos do veículo e a placa.' });
      }
      if (!password || password.length < 4) {
        return sendJson(res, 400, { ok: false, error: 'Crie uma senha de pelo menos 4 caracteres.' });
      }
      if (!body.partialOnboarding && (!body.termsAcceptance || body.termsAcceptance.accepted !== true)) {
        return sendJson(res, 400, { ok: false, error: 'É necessário concordar com os Termos e Condições de Uso para concluir o cadastro.' });
      }

      const existing = await finance.findDriverByIdentifier(cleanPhone) || await finance.findDriverByIdentifier(document);
      let targetId = `drv-${Date.now()}`;

      if (existing) {
        // Se for a conta demo mock 'drv-1001' OU se o usuário estiver recadastrando seus próprios dados
        const existingCleanPhone = String(existing.phone || '').replace(/\D/g, '');
        if (existing.id === 'drv-1001' || existing.document === document || existingCleanPhone === cleanPhone) {
          targetId = existing.id;
        } else {
          return sendJson(res, 409, {
            ok: false,
            error: 'Já existe um motorista cadastrado com este CPF ou WhatsApp. Faça login na aba Entrar.'
          });
        }
      }

      const photoUrl = body.photo ? await kycStorage.savePublicMedia(targetId, 'avatar', body.photo) : '';
      const vehiclePhotoUrl = body.vehiclePhoto ? await kycStorage.savePublicMedia(targetId, 'vehicle', body.vehiclePhoto) : '';

      const clientIp = getRequestClientIp(req);

      const termsSignature = body.termsAcceptance?.accepted
        ? driverTermsContract.buildDriverTermsSignature({
            driverId: targetId,
            name,
            document,
            cnh,
            phone,
            email: String(body.email || '').trim().toLowerCase(),
            city: body.city || 'Brasil',
            vehicleBrand,
            vehicleModel,
            vehicleYear,
            vehiclePlate,
            ip: clientIp,
            userAgent: req.headers['user-agent'],
            host: req.headers.host,
            clientAcceptance: body.termsAcceptance
          })
        : (existing?.termsSignature || existing?.metadata?.termsSignature || null);

      const saved = await finance.saveDriverRecord({
        id: targetId,
        name,
        phone,
        email: String(body.email || '').trim().toLowerCase(),
        document,
        cnh,
        cnhHasEar: body.cnhHasEar !== undefined ? Boolean(body.cnhHasEar) : true,
        password_hash: hashPassword(password),
        photo: photoUrl,
        vehicleBrand,
        vehicleModel,
        vehicleVersion: String(body.vehicleVersion || '').trim(),
        vehicleColor: vehicleColor || 'Prata',
        vehicleYear,
        vehiclePlate,
        vehicleCategory: body.vehicleCategory || 'kavro_go',
        vehiclePhoto: vehiclePhotoUrl,
        crlvNumber: String(body.crlvNumber || '').trim(),
        crlvRegular: body.crlvRegular !== undefined ? Boolean(body.crlvRegular) : true,
        hasFourDoors: body.hasFourDoors !== undefined ? Boolean(body.hasFourDoors) : true,
        hasAirConditioning: body.hasAirConditioning !== undefined ? Boolean(body.hasAirConditioning) : true,
        hasLargeTrunk: body.hasLargeTrunk !== undefined ? Boolean(body.hasLargeTrunk) : undefined,
        hasLeatherSeats: body.hasLeatherSeats !== undefined ? Boolean(body.hasLeatherSeats) : undefined,
        enabledCategories: Array.isArray(body.enabledCategories) ? body.enabledCategories : undefined,
        city: body.city || 'Brasil',
        pixKey: String(body.pixKey || '').trim(),
        pixType: body.pixType || 'cpf',
        bankName: body.bankName || '',
        bankAgency: body.bankAgency || '',
        bankAccount: body.bankAccount || '',
        autoPayoutWeekly: true,
        approvalStatus: 'pendente_aprovacao',
        isOnline: false,
        rating: 5.0,
        totalRides: 0,
        termsSignature
      });

      await db.query(
        `INSERT INTO public.notifications (id, title, message, type, read, timestamp)
         VALUES ($1, $2, $3, 'driver_new', false, NOW())`,
        [
          `notif-drv-${Date.now()}`,
          `🧑‍✈️ Novo Motorista para Aprovar: ${saved.name}`,
          `Veículo: ${saved.vehicleBrand} ${saved.vehicleModel} (${saved.vehiclePlate}) • CNH: ${saved.cnh}`
        ]
      ).catch(() => {});

      return sendJson(res, 200, { ok: true, driver: saved });
    }

    if (pathname === '/api/drivers/check' && method === 'POST') {
      const body = await parseBody(req);
      const identifier = String(body.identifier || body.cpf || body.document || body.phone || '').trim();
      if (!identifier) {
        return sendJson(res, 400, { ok: false, error: 'Informe seu CPF, celular ou e-mail.' });
      }

      const row = await finance.findDriverByIdentifier(identifier);
      if (!row) {
        return sendJson(res, 200, { ok: true, found: false });
      }

      const full = await finance.getDriverById(row.id);
      const src = full || row;
      const firstName = String(src.name || '').trim().split(/\s+/)[0] || 'Motorista';
      const kyc = src.kyc || {};
      const rawTermsSig = src.termsSignature || (src.metadata && src.metadata.termsSignature) || null;
      const isTermsSigned = Boolean(rawTermsSig && rawTermsSig.signed);
      const safeTermsSummary = isTermsSigned
        ? {
            signed: true,
            contractId: rawTermsSig.contractId,
            contractVersion: rawTermsSig.contractVersion,
            contractDate: rawTermsSig.contractDate,
            validationCode: rawTermsSig.validationCode,
            documentHash: rawTermsSig.documentHash,
            signedAt: rawTermsSig.signedAt,
            signedAtBrasilia: rawTermsSig.signedAtBrasilia,
            driverSnapshot: rawTermsSig.driverSnapshot
              ? {
                  name: rawTermsSig.driverSnapshot.name,
                  vehicle: rawTermsSig.driverSnapshot.vehicle,
                  vehiclePlate: rawTermsSig.driverSnapshot.vehiclePlate,
                  city: rawTermsSig.driverSnapshot.city
                }
              : undefined
          }
        : null;

      return sendJson(res, 200, {
        ok: true,
        found: true,
        driver: {
          id: src.id,
          name: src.name,
          firstName,
          document: src.document || '',
          phone: '',
          email: '',
          approvalStatus: src.approvalStatus || 'pendente_aprovacao',
          rejectionReason: src.rejectionReason || null,
          vehicleBrand: src.vehicleBrand || '',
          vehicleModel: src.vehicleModel || '',
          vehiclePlate: src.vehiclePlate || '',
          city: src.city || '',
          termsSigned: isTermsSigned,
          termsSignature: safeTermsSummary,
          kyc: {
            status: kyc.status || src.approvalStatus || 'pendente_aprovacao',
            submittedAt: kyc.submittedAt || null,
            reviewedAt: kyc.reviewedAt || null,
            rejectionReason: kyc.rejectionReason || null,
            correctionInstructions: kyc.correctionInstructions || null,
            adminNotes: kyc.adminNotes || null
          }
        }
      });
    }

    if (pathname === '/api/drivers/login' && method === 'POST') {
      const body = await parseBody(req);
      const turnstile = await verifyTurnstileToken(body.turnstileToken, req.socket?.remoteAddress);
      if (!turnstile.ok) {
        return sendJson(res, 403, { ok: false, error: turnstile.error });
      }
      const identifier = String(body.identifier || '').trim();
      const password = String(body.password || '');

      if (!identifier || !password) {
        return sendJson(res, 400, { ok: false, error: 'Informe seu CPF/WhatsApp/E-mail e sua senha.' });
      }

      const row = await finance.findDriverByIdentifier(identifier);
      if (!row) {
        return sendJson(res, 401, { ok: false, error: 'Motorista não encontrado. Cadastre-se como parceiro primeiro.' });
      }

      const valid = verifyPassword(password, row.password_hash);
      if (!valid) {
        return sendJson(res, 401, { ok: false, error: 'Senha incorreta. Tente novamente.' });
      }

      const formatted = await finance.getDriverById(row.id);
      const wallet = await finance.getDriverWallet(row.id);
      return sendJson(res, 200, { ok: true, driver: formatted, wallet });
    }

    if (pathname === '/api/drivers' && method === 'GET') {
      const list = await finance.listDrivers();
      return sendJson(res, 200, { ok: true, drivers: list });
    }

    const driverWalletMatch = pathname.match(/^\/api\/drivers\/([^/]+)\/wallet$/);
    if (driverWalletMatch && method === 'GET') {
      const driverId = decodeURIComponent(driverWalletMatch[1]);
      const wallet = await finance.getDriverWallet(driverId);
      return sendJson(res, 200, { ok: true, wallet });
    }

    const driverWithdrawMatch = pathname.match(/^\/api\/drivers\/([^/]+)\/withdrawals$/);
    if (driverWithdrawMatch && method === 'POST') {
      const driverId = decodeURIComponent(driverWithdrawMatch[1]);
      const body = await parseBody(req);
      try {
        const wd = await finance.requestWithdrawal({
          driverId,
          amount: body.amount,
          pixKey: body.pixKey,
          pixType: body.pixType
        });
        const wallet = await finance.getDriverWallet(driverId);
        return sendJson(res, 200, { ok: true, withdrawal: wd, wallet });
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message });
      }
    }

    const driverDebtPixMatch = pathname.match(/^\/api\/drivers\/([^/]+)\/debt\/pix$/);
    if (driverDebtPixMatch && method === 'POST') {
      const driverId = decodeURIComponent(driverDebtPixMatch[1]);
      const body = await parseBody(req);
      try {
        const pixData = await finance.createDriverDebtSettlementPix(driverId, body.amount);
        return sendJson(res, 200, { ok: true, ...pixData });
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message });
      }
    }

    const driverOnlineMatch = pathname.match(/^\/api\/drivers\/([^/]+)\/online$/);
    if (driverOnlineMatch && (method === 'PATCH' || method === 'POST')) {
      const driverId = decodeURIComponent(driverOnlineMatch[1]);
      const body = await parseBody(req);
      const driver = await finance.getDriverById(driverId);
      if (!driver) return sendJson(res, 404, { ok: false, error: 'Motorista não encontrado.' });

      if (driver.approvalStatus !== 'aprovado') {
        let errorMsg = 'Apenas motoristas com cadastro Aprovado podem aceitar corridas.';
        if (driver.approvalStatus === 'correcao_solicitada') {
          errorMsg = 'A administração solicitou correção dos seus documentos ou selfie. Verifique as instruções no portal.';
        } else if (driver.approvalStatus === 'rejeitado') {
          errorMsg = 'Seu cadastro como motorista parceiro foi recusado pela administração.';
        } else if (driver.approvalStatus === 'em_analise' || driver.approvalStatus === 'pendente' || driver.approvalStatus === 'pendente_aprovacao') {
          errorMsg = 'Seu cadastro está em análise pela Central de Segurança KAVRO DRIVE. Aguarde a validação para ficar Online.';
        }
        return sendJson(res, 403, {
          ok: false,
          error: errorMsg,
          approvalStatus: driver.approvalStatus
        });
      }

      const wantOnline = Boolean(body.isOnline);
      if (wantOnline) {
        if (!driver.vehicleBrand || !driver.vehicleModel || !driver.vehiclePlate) {
          return sendJson(res, 403, {
            ok: false,
            error: 'Complete o cadastro do seu veículo e CRLV (Etapa 5) no painel de acompanhamento antes de ficar Online.'
          });
        }
        const wallet = await finance.getDriverWallet(driverId);
        if (wallet.isDelinquent) {
          return sendJson(res, 403, {
            ok: false,
            error: `Limite de saldo devedor atingido (Dívida atual: R$ ${wallet.debtBalance.toFixed(2)}). Quite seu débito de comissões via PIX na aba Minha Carteira para voltar a ficar Online.`
          });
        }
      }

      const updated = await finance.saveDriverRecord({
        ...driver,
        isOnline: wantOnline,
        location: body.location || driver.location || {
          lat: -28.3919,
          lng: -49.3967,
          heading: 0,
          speedKmH: 0,
          updatedAt: new Date().toISOString()
        }
      });
      return sendJson(res, 200, { ok: true, driver: updated });
    }

    const driverLocMatch = pathname.match(/^\/api\/drivers\/([^/]+)\/location$/);
    if (driverLocMatch && (method === 'PATCH' || method === 'POST')) {
      const driverId = decodeURIComponent(driverLocMatch[1]);
      const body = await parseBody(req);
      const driver = await finance.getDriverById(driverId);
      if (!driver) return sendJson(res, 404, { ok: false, error: 'Motorista não encontrado.' });
      const loc = {
        lat: Number(body.lat ?? driver.location?.lat ?? -28.3919),
        lng: Number(body.lng ?? driver.location?.lng ?? -49.3967),
        heading: Number(body.heading || 0),
        speedKmH: Number(body.speedKmH || 0),
        updatedAt: new Date().toISOString()
      };
      const updated = await finance.saveDriverRecord({ ...driver, location: loc });
      return sendJson(res, 200, { ok: true, driver: updated });
    }

    const driverSingleMatch = pathname.match(/^\/api\/drivers\/([^/]+)$/);
    if (driverSingleMatch) {
      const driverId = decodeURIComponent(driverSingleMatch[1]);
      if (method === 'GET') {
        const driver = await finance.getDriverById(driverId);
        if (!driver) return sendJson(res, 404, { ok: false, error: 'Motorista não encontrado.' });
        const wallet = await finance.getDriverWallet(driverId);
        return sendJson(res, 200, { ok: true, driver, wallet });
      }
      if (method === 'PATCH' || method === 'PUT') {
        const body = await parseBody(req);
        const existing = await finance.getDriverById(driverId);
        if (!existing) return sendJson(res, 404, { ok: false, error: 'Motorista não encontrado.' });
        const nextUpdates = { ...body };
        if (typeof nextUpdates.photo === 'string' && nextUpdates.photo.startsWith('data:image/')) {
          nextUpdates.photo = await kycStorage.savePublicMedia(existing.id, 'avatar', nextUpdates.photo);
        }
        if (typeof nextUpdates.vehiclePhoto === 'string' && nextUpdates.vehiclePhoto.startsWith('data:image/')) {
          nextUpdates.vehiclePhoto = await kycStorage.savePublicMedia(existing.id, 'vehicle', nextUpdates.vehiclePhoto);
        }
        const updated = await finance.saveDriverRecord({
          ...existing,
          ...nextUpdates,
          id: existing.id,
          approvalStatus: existing.approvalStatus
        });
        return sendJson(res, 200, { ok: true, driver: updated });
      }
    }

    // ===== DEEPGUARD KYC — PROCESSAMENTO BIOMÉTRICO & GESTÃO DOCUMENTAL =====

    // 1. Resolução de URL Temporária Assinada para Visualização de Documentos (15 min)
    const kycDocMatch = pathname.match(/^\/api\/kyc\/document\/([a-zA-Z0-9_-]+)$/);
    if (kycDocMatch && method === 'GET') {
      const token = kycDocMatch[1];
      const doc = kycStorage.resolveTemporaryDocument(token);
      if (!doc) {
        return sendJson(res, 404, {
          ok: false,
          error: 'URL temporária expirada ou documento não localizado. Solicite nova visualização autenticada.'
        });
      }
      res.writeHead(200, {
        'Content-Type': doc.contentType || 'image/jpeg',
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        'Content-Disposition': 'inline'
      });
      return res.end(doc.buffer);
    }

    // 2. Submissão / Reenvio de Documento e Biometria pelo Motorista
    if (pathname === '/api/kyc/submit' && method === 'POST') {
      const body = await parseBody(req);
      const driverId = String(body.driverId || '').trim();
      let driver = driverId ? await finance.getDriverById(driverId) : null;
      if (!driver && body.driverDocument) {
        const cleanDoc = String(body.driverDocument).replace(/\D/g, '');
        if (cleanDoc.length >= 11) {
          const foundByDoc = await finance.findDriverByIdentifier(cleanDoc);
          if (foundByDoc) driver = await finance.getDriverById(foundByDoc.id);
        }
      }
      if (!driver && body.driverPhone) {
        const cleanPhone = String(body.driverPhone).replace(/\D/g, '');
        if (cleanPhone.length >= 10) {
          const foundByPhone = await finance.findDriverByIdentifier(cleanPhone);
          if (foundByPhone) driver = await finance.getDriverById(foundByPhone.id);
        }
      }
      if (!driver && body.driverEmail) {
        const cleanEmail = String(body.driverEmail).trim().toLowerCase();
        if (cleanEmail.includes('@')) {
          const foundByEmail = await finance.findDriverByIdentifier(cleanEmail);
          if (foundByEmail) driver = await finance.getDriverById(foundByEmail.id);
        }
      }
      if (!driver) {
        return sendJson(res, 404, {
          ok: false,
          error: !db.pool
            ? 'Cadastro não localizado no servidor (verifique a conexão DATABASE_URL do Pooler IPv4 na Vercel). Tente entrar com seu CPF novamente.'
            : 'Motorista parceiro não localizado. Faça login novamente com seu CPF para continuar.'
        });
      }

      const resolvedDriverId = driver.id;
      const cnhPhoto = body.cnhDocumentPhoto;
      const selfiePhoto = body.selfiePhoto;
      const rawBiometric = body.biometricResult;
      const normSim = Number(rawBiometric?.similarityScore ?? rawBiometric?.similarity ?? 0);
      const normMatch = Boolean(rawBiometric?.isMatch ?? rawBiometric?.match ?? (normSim >= 55));
      const biometric = rawBiometric
        ? {
            ...rawBiometric,
            similarity: normSim,
            similarityScore: normSim,
            match: normMatch,
            isMatch: normMatch
          }
        : null;

      if (!cnhPhoto || !selfiePhoto) {
        return sendJson(res, 400, { ok: false, error: 'A fotografia da CNH e a selfie da câmara são obrigatórias.' });
      }

      const reqHost = req.headers.host || 'localhost:5173';

      // 4. Salvar com segurança no Supabase Storage Privado ou Cofre Seguro
      const cnhSaved = await kycStorage.saveKycDocument(resolvedDriverId, 'cnh', cnhPhoto);
      const selfieSaved = await kycStorage.saveKycDocument(resolvedDriverId, 'selfie', selfiePhoto);

      // Gerar URLs temporárias assinadas de 15 minutos
      const cnhTempUrl = await kycStorage.generateTemporarySignedUrl(cnhSaved, resolvedDriverId, reqHost);
      const selfieTempUrl = await kycStorage.generateTemporarySignedUrl(selfieSaved, resolvedDriverId, reqHost);

      const now = new Date().toISOString();
      const prevKyc = driver.kyc || {};
      const prevAudit = Array.isArray(prevKyc.auditLogs) ? prevKyc.auditLogs : [];

      const newAuditLog = {
        id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: now,
        action: 'kyc_submitted',
        performedBy: driver.name || 'Motorista',
        notes: `Submissão KYC semiautomática via Human. Similaridade facial calculada: ${biometric?.similarity ?? 0}%. Divergências: ${(biometric?.divergences || []).length}`,
        ip: req.socket?.remoteAddress || '127.0.0.1',
        userAgent: String(req.headers['user-agent'] || 'App Mobile')
      };

      const kycData = {
        status: 'em_analise',
        cnhDocInfo: cnhSaved,
        selfieDocInfo: selfieSaved,
        cnhDocumentUrl: cnhTempUrl,
        selfieUrl: selfieTempUrl,
        biometricResult: biometric || null,
        rejectionReason: null,
        correctionInstructions: null,
        submittedAt: now,
        reviewedAt: null,
        reviewedBy: null,
        retentionExpiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
        auditLogs: [newAuditLog, ...prevAudit]
      };

      const updated = await finance.saveDriverRecord({
        ...driver,
        approvalStatus: 'em_analise',
        cnhDocumentPhoto: cnhTempUrl,
        selfiePhoto: selfieTempUrl,
        kyc: kycData
      });

      // Notificar o painel administrativo
      await db.query(
        `INSERT INTO public.notifications (id, title, message, type, read, timestamp)
         VALUES ($1, $2, $3, 'driver_kyc', false, NOW())`,
        [
          `notif-kyc-${Date.now()}`,
          `📸 Novo KYC para Análise: ${driver.name}`,
          `Similaridade facial preliminar: ${biometric?.similarity ?? 0}% • Status: Em Análise`
        ]
      ).catch(() => {});

      return sendJson(res, 200, { ok: true, driver: updated, kyc: kycData });
    }

    async function purgeKycMediaAndFields(driver, kycObj, { performedBy, reason, ip, userAgent }) {
      const baseKyc = kycObj || {};
      const docInfos = [baseKyc.cnhDocInfo, baseKyc.selfieDocInfo].filter(Boolean);
      if (docInfos.length > 0 || driver.cnhDocumentPhoto || driver.selfiePhoto) {
        await kycStorage.purgeDriverDocuments(driver.id, docInfos);
      }

      const prevAudit = Array.isArray(baseKyc.auditLogs) ? baseKyc.auditLogs : [];
      const purgeAudit = {
        id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-purge`,
        timestamp: new Date().toISOString(),
        action: 'data_purged',
        performedBy: performedBy || 'Sistema Automático (LGPD)',
        notes: reason || 'Eliminação automática de fotografias e dados biométricos após conclusão da análise',
        ip: ip || '127.0.0.1',
        userAgent: userAgent || 'Kavro KYC Auto-Purge'
      };

      return {
        cnhDocumentPhoto: null,
        selfiePhoto: null,
        kyc: {
          ...baseKyc,
          cnhDocInfo: null,
          selfieDocInfo: null,
          cnhDocumentUrl: null,
          selfieUrl: null,
          biometricResult: null,
          purgedAt: purgeAudit.timestamp,
          auditLogs: [purgeAudit, ...prevAudit]
        }
      };
    }

    // 3. Revisão Manual do Administrador (Aprovar, Rejeitar ou Solicitar Correção)
    if (pathname === '/api/kyc/review' && method === 'POST') {
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { ok: false, error: 'Acesso restrito ao Administrador Master.' });
      }

      const body = await parseBody(req);
      const driverId = String(body.driverId || '').trim();
      const action = String(body.action || '').trim(); // 'aprovado' | 'rejeitado' | 'correcao_solicitada'
      const notes = String(body.notes || '').trim();
      const adminName = String(body.adminName || 'Administrador Master').trim();

      if (!['aprovado', 'rejeitado', 'correcao_solicitada'].includes(action)) {
        return sendJson(res, 400, { ok: false, error: 'Ação inválida. Use aprovado, rejeitado ou correcao_solicitada.' });
      }

      const driver = await finance.getDriverById(driverId);
      if (!driver) {
        return sendJson(res, 404, { ok: false, error: 'Motorista não encontrado.' });
      }

      const now = new Date().toISOString();
      const prevKyc = driver.kyc || { status: driver.approvalStatus };
      const prevAudit = Array.isArray(prevKyc.auditLogs) ? prevKyc.auditLogs : [];

      let actionDesc = 'Aprovação final de cadastro e liberação para corridas';
      if (action === 'correcao_solicitada') actionDesc = `Correção solicitada: ${notes || 'Reenvio de documentos ou selfie'}`;
      if (action === 'rejeitado') actionDesc = `Cadastro recusado: ${notes || 'Critérios de segurança não atendidos'}`;

      const newAudit = {
        id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: now,
        action,
        performedBy: adminName,
        notes: actionDesc,
        ip: req.socket?.remoteAddress || '127.0.0.1',
        userAgent: String(req.headers['user-agent'] || 'Admin Console')
      };

      const updatedKyc = {
        ...prevKyc,
        status: action,
        reviewedAt: now,
        reviewedBy: adminName,
        rejectionReason: action === 'rejeitado' ? (notes || 'Não atende aos critérios de segurança da plataforma') : null,
        correctionInstructions: action === 'correcao_solicitada' ? (notes || 'Por favor, envie nova fotografia nítida dos documentos ou refaça a selfie.') : null,
        auditLogs: [newAudit, ...prevAudit]
      };

      // Exclusão 100% automática do Cloudflare R2 / Storage e limpeza biométrica após concluir a análise
      const purgedFields = await purgeKycMediaAndFields(driver, updatedKyc, {
        performedBy: `${adminName} (Auto-Purge LGPD)`,
        reason: `Exclusão automática da CNH e Selfie no Cloudflare R2 após conclusão da análise (${action})`,
        ip: req.socket?.remoteAddress,
        userAgent: String(req.headers['user-agent'] || 'Admin Console')
      });

      const updated = await finance.saveDriverRecord({
        ...driver,
        approvalStatus: action,
        isOnline: action === 'aprovado' ? driver.isOnline : false, // Desativa se recusado ou aguardando correção
        ...purgedFields
      });

      return sendJson(res, 200, { ok: true, driver: updated, autoPurged: true });
    }

    // 4. Obtenção de Documentos com URLs Temporárias Novas para Visualização Segura pelo Admin
    const kycDriverMatch = pathname.match(/^\/api\/kyc\/driver\/([^/]+)$/);
    if (kycDriverMatch && method === 'GET') {
      const driverId = decodeURIComponent(kycDriverMatch[1]);
      const driver = await finance.getDriverById(driverId);
      if (!driver) {
        return sendJson(res, 404, { ok: false, error: 'Motorista não localizado.' });
      }

      const reqHost = req.headers.host || 'localhost:5173';
      const kyc = driver.kyc || { status: driver.approvalStatus };

      // Se houver docInfos salvos, gera novas URLs temporárias frescas (15 min)
      let cnhFreshUrl = driver.cnhDocumentPhoto || '';
      let selfieFreshUrl = driver.selfiePhoto || '';

      if (kyc.cnhDocInfo) {
        cnhFreshUrl = await kycStorage.generateTemporarySignedUrl(kyc.cnhDocInfo, driverId, reqHost);
      }
      if (kyc.selfieDocInfo) {
        selfieFreshUrl = await kycStorage.generateTemporarySignedUrl(kyc.selfieDocInfo, driverId, reqHost);
      }

      // Registra no log de auditoria que os documentos foram inspecionados
      if (await isAuthorizedAdmin(req)) {
        const auditLog = {
          id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
          action: 'document_viewed',
          performedBy: req.headers['x-admin-name'] || 'Administrador Master',
          notes: 'Visualização manual de documentos e biometria KYC via URL temporária assinada',
          ip: req.socket?.remoteAddress,
          userAgent: req.headers['user-agent']
        };
        const prevAudit = Array.isArray(kyc.auditLogs) ? kyc.auditLogs : [];
        kyc.auditLogs = [auditLog, ...prevAudit];
        await finance.saveDriverRecord({ ...driver, kyc });
      }

      return sendJson(res, 200, {
        ok: true,
        kyc: {
          ...kyc,
          cnhDocumentUrl: cnhFreshUrl,
          selfieUrl: selfieFreshUrl
        }
      });
    }

    // 5. Exclusão e Purgamento Seguro de Documentos e Dados Biométricos (LGPD / Retenção)
    if (pathname === '/api/kyc/purge' && method === 'POST') {
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { ok: false, error: 'Acesso restrito ao Administrador.' });
      }
      const body = await parseBody(req);
      const driverId = String(body.driverId || '').trim();
      const driver = await finance.getDriverById(driverId);
      if (!driver) {
        return sendJson(res, 404, { ok: false, error: 'Motorista não encontrado.' });
      }

      const purgedFields = await purgeKycMediaAndFields(driver, driver.kyc || {}, {
        performedBy: body.performedBy || 'Administrador (LGPD)',
        reason: body.reason || 'Eliminação definitiva de fotografias e dados biométricos conforme política de retenção',
        ip: req.socket?.remoteAddress,
        userAgent: req.headers['user-agent']
      });

      const updated = await finance.saveDriverRecord({
        ...driver,
        ...purgedFields
      });

      return sendJson(res, 200, { ok: true, message: 'Documentos e biometria purgados com sucesso.', driver: updated });
    }
    if (pathname === '/api/rides') {
      if (method === 'GET') {
        const isAdmin = await isAuthorizedAdmin(req);
        const reqClientId = String(url.searchParams.get('clientId') || req.headers['x-client-id'] || '').trim();
        const reqClientPhoneDigits = String(url.searchParams.get('clientPhone') || req.headers['x-client-phone'] || '').replace(/\D/g, '');
        const r = await db.query('SELECT * FROM public.rides ORDER BY date DESC, time DESC');
        const formatted = r.rows.map(formatRideFromDb);
        return sendJson(res, 200, isAdmin ? formatted : formatted.map(ride => sanitizeRideForPublic(ride, reqClientId, reqClientPhoneDigits)));
      }
      if (method === 'POST') {
        const ride = await parseBody(req);
        const cfg = await finance.getPackageConfig?.() || (await db.query('SELECT config FROM public.system_config WHERE id = $1', ['default'])).rows[0]?.config || {};
        const commPct = Number(cfg.platformCommissionPercent ?? 20);

        if (ride.id) {
          ride.id = normalizeRideId(ride.id);
        }

        const prevRes = ride.id
          ? await db.query('SELECT * FROM public.rides WHERE id = $1', [ride.id])
          : { rows: [] };
        const before = prevRes.rows[0] ? formatRideFromDb(prevRes.rows[0]) : null;

        if (!before) {
          const seqRes = await db.query('SELECT COALESCE(MAX(ride_number), 0) + 1 AS next_num FROM public.rides');
          const nextNum = Number(seqRes.rows[0]?.next_num || 1);
          const padded = String(nextNum).padStart(3, '0');
          ride.rideNumber = nextNum;
          ride.id = `UP-${padded}`;
          ride.rideCode = `#UP - ${padded}`;
        } else {
          ride.rideNumber = before.rideNumber;
          ride.rideCode = before.rideCode;
        }

        const now = new Date();
        if (!ride.date) {
          ride.date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        }
        if (!ride.time) {
          ride.time = now.toTimeString().slice(0, 5);
        }

        // Cálculo oficial de comissão e valor líquido do motorista no backend respeitando a categoria da corrida
        const allCats = finance.normalizeCategoriesServer(cfg);
        const mappedCatId = finance.mapLegacyCategoryIdServer(ride.category || before?.category || 'kavro_go');
        const matchedCat = allCats.find(c => c.id === ride.category || c.id === mappedCatId) || allCats[0];
        const effectiveCommPct = Number(
          ride.commissionPercent ??
          before?.commissionPercent ??
          matchedCat?.commissionPercent ??
          commPct
        );

        ride.category = matchedCat ? matchedCat.id : mappedCatId;
        ride.categoryName = ride.categoryName || before?.categoryName || matchedCat?.name || 'KAVRO GO';
        if (!ride.appliedFareSnapshot && matchedCat) {
          ride.appliedFareSnapshot = before?.appliedFareSnapshot || {
            categoryId: matchedCat.id,
            categoryName: matchedCat.name,
            baseFare: Number(matchedCat.baseFare ?? cfg.baseFare ?? 8.0),
            pricePerKm: Number(matchedCat.pricePerKm ?? cfg.pricePerKm ?? 3.2),
            pricePerMinute: Number(matchedCat.pricePerMinute ?? cfg.pricePerMinute ?? 0.5),
            minimumFare: Number(matchedCat.minimumFare ?? cfg.minimumFare ?? 15.0),
            multiplier: Number(matchedCat.multiplier ?? 1.0),
            commissionPercent: effectiveCommPct
          };
        }

        const split = finance.calculateSplit(ride.totalPrice, effectiveCommPct);
        ride.estimatedPrice = before ? before.estimatedPrice : split.grossAmount;
        ride.totalPrice = split.grossAmount;
        ride.commissionPercent = split.commissionPercent;
        ride.commissionAmount = split.commissionAmount;
        ride.driverNetAmount = split.driverNetAmount;

        // Tratamento na criação de nova corrida conforme o método de pagamento
        if (!before && !ride.isManualBooking) {
          if (ride.paymentMethod === 'pix') {
            // Regra 1: Corrida PIX pré-paga aguarda confirmação do webhook do gateway antes de confirmar!
            const { tx } = await finance.createPixChargeForRide(ride);
            ride.paymentTxId = tx.id;
            ride.pixQrCode = tx.pixQrCode;
            ride.pixCopyPaste = tx.pixCopyPaste;
            ride.paymentStatus = 'aguardando';
            ride.status = 'aguardando_pagamento';
          } else if (ride.paymentMethod === 'cartao_credito' || ride.paymentMethod === 'cartao_debito') {
            // Regra 3: Pré-autoriza cartão no gateway ao solicitar a corrida
            const authResult = await finance.authorizeCardForRide(ride, {
              cardId: ride.cardId,
              cardLast4: ride.cardLast4,
              cardBrand: ride.cardBrand
            });
            if (!authResult.authorized) {
              return sendJson(res, 402, {
                ok: false,
                error: authResult.error || 'Pagamento recusado pelo emissor do cartão.',
                paymentStatus: 'falhou'
              });
            }
            ride.paymentTxId = authResult.tx.id;
            ride.cardLast4 = authResult.tx.cardLast4;
            ride.cardBrand = authResult.tx.cardBrand;
            ride.paymentStatus = 'autorizado';
            ride.status = 'aguardando_confirmacao';
          } else {
            // Regra 2: Dinheiro — vai direto para buscar motorista e é cobrado ao finalizar
            const tx = await finance.savePaymentTransaction({
              rideId: ride.id,
              rideCode: ride.rideCode,
              clientId: ride.clientId,
              clientName: ride.clientName,
              method: 'dinheiro',
              status: 'aguardando',
              estimatedAmount: split.grossAmount,
              finalAmount: split.grossAmount,
              paidAmount: 0,
              commissionPercent: split.commissionPercent,
              commissionAmount: split.commissionAmount,
              driverNetAmount: split.driverNetAmount,
              gatewayTxId: `cash_init_${ride.id}_${Date.now()}`
            });
            ride.paymentTxId = tx.id;
            ride.paymentStatus = 'aguardando';
            ride.status = 'aguardando_confirmacao';
          }
        }

        const savedRide = await upsertFullRide(ride);

        // Auto-cadastra cliente se necessário
        if (savedRide.clientPhone && savedRide.clientName) {
          const cleanPhone = String(savedRide.clientPhone).trim();
          const cleanName = String(savedRide.clientName).trim();
          if (cleanPhone && cleanName) {
            try {
              const existingCli = await db.query(
                'SELECT id FROM public.clients WHERE phone = $1 LIMIT 1',
                [cleanPhone]
              );
              if (existingCli.rows.length === 0) {
                const newCliId = savedRide.clientId || `cli-${Date.now()}`;
                await db.query(`
                  INSERT INTO public.clients (id, name, phone, created_at)
                  VALUES ($1, $2, $3, NOW())
                  ON CONFLICT (id) DO NOTHING
                `, [newCliId, cleanName, cleanPhone]);
              }
            } catch {
              // ignore
            }
          }
        }

        await push.handleRideChange(before, savedRide);
        return sendJson(res, 200, { ok: true, ride: savedRide });
      }
    }

    // ============================================================
    // ACEITAR / RECUSAR / FINALIZAR CORRIDA (COM FILA DE PRÓXIMA CORRIDA)
    // ============================================================
    const rideAcceptMatch = pathname.match(/^\/api\/rides\/([^/]+)\/accept$/);
    if (rideAcceptMatch && method === 'POST') {
      const id = normalizeRideId(decodeURIComponent(rideAcceptMatch[1]));
      const body = await parseBody(req);
      const driverId = body.driverId || 'drv-1001';

      const prevRes = await db.query('SELECT * FROM public.rides WHERE id = $1', [id]);
      if (!prevRes.rows[0]) return sendJson(res, 404, { ok: false, error: 'Corrida não encontrada.' });
      const ride = formatRideFromDb(prevRes.rows[0]);

      if (ride.status === 'aguardando_pagamento') {
        return sendJson(res, 400, { ok: false, error: 'Esta corrida PIX ainda aguarda confirmação do gateway.' });
      }
      if (ride.driverId && ride.driverId !== driverId && ride.status !== 'aguardando_confirmacao') {
        return sendJson(res, 409, { ok: false, error: 'Outro motorista já aceitou esta corrida.' });
      }

      const driver = await finance.getDriverById(driverId);
      if (!driver) return sendJson(res, 404, { ok: false, error: 'Motorista não encontrado.' });
      if (driver.approvalStatus !== 'aprovado') {
        return sendJson(res, 403, { ok: false, error: 'Sua conta de motorista ainda não está aprovada.' });
      }

      // Valida se o motorista está habilitado para a categoria da corrida
      const rideCatId = finance.mapLegacyCategoryIdServer(ride.category || 'kavro_go');
      const driverEligible = Array.isArray(driver.eligibleCategories) ? driver.eligibleCategories : ['kavro_go'];
      if (!driverEligible.includes(rideCatId)) {
        return sendJson(res, 403, {
          ok: false,
          error: `Seu veículo/perfil não está habilitado para aceitar corridas da categoria ${ride.categoryName || rideCatId.toUpperCase()}.`
        });
      }

      // Verifica se o motorista está inadimplente ao tentar aceitar corrida em dinheiro
      const wallet = await finance.getDriverWallet(driver.id);
      if (wallet.isDelinquent && ride.paymentMethod === 'dinheiro') {
        return sendJson(res, 403, {
          ok: false,
          error: `Você atingiu o limite de dívida de comissões (R$ ${wallet.debtBalance.toFixed(2)}). Corridas em dinheiro estão bloqueadas até quitar via PIX ou receber corridas digitais.`
        });
      }

      // Verifica se o motorista já está em uma corrida ativa (para encaixar na Fila em 2º plano!)
      const allRidesRes = await db.query('SELECT * FROM public.rides ORDER BY date DESC, time DESC');
      const allRides = allRidesRes.rows.map(formatRideFromDb);
      const currentActiveRide = allRides.find(
        r => r.id !== ride.id &&
          r.driverId === driver.id &&
          (r.status === 'a_caminho' || r.status === 'no_local' || r.status === 'em_andamento')
      );

      const isQueued = Boolean(currentActiveRide);
      const newStatus = isQueued ? 'na_fila' : 'a_caminho';

      const updatedRide = await upsertFullRide({
        ...ride,
        driverId: driver.id,
        driverName: driver.name,
        driverPhone: driver.phone,
        driverPhoto: driver.photo || '',
        driverVehicle: `${driver.vehicleBrand} ${driver.vehicleModel}`.trim(),
        driverPlate: driver.vehiclePlate,
        driverCarColor: driver.vehicleColor,
        driverRating: driver.rating || 5.0,
        driverLocation: driver.location || ride.driverLocation,
        isQueuedRide: isQueued,
        queuedForDriverId: isQueued ? driver.id : null,
        status: newStatus
      });

      await finance.saveDriverRecord({
        ...driver,
        isOnline: true,
        currentRideId: isQueued ? currentActiveRide.id : updatedRide.id,
        queuedRideId: isQueued ? updatedRide.id : driver.queuedRideId
      });

      // Atualiza transação com o motorista atribuído
      const existingTx = await finance.getPaymentTxByRide(updatedRide.id);
      if (existingTx) {
        await finance.savePaymentTransaction({
          ...existingTx,
          driverId: driver.id,
          driverName: driver.name
        });
      }

      await push.handleRideChange(ride, updatedRide);
      return sendJson(res, 200, {
        ok: true,
        ride: updatedRide,
        isQueued,
        activeRideId: currentActiveRide?.id || null
      });
    }

    const rideDeclineMatch = pathname.match(/^\/api\/rides\/([^/]+)\/decline$/);
    if (rideDeclineMatch && method === 'POST') {
      const id = normalizeRideId(decodeURIComponent(rideDeclineMatch[1]));
      const body = await parseBody(req);
      const driverId = body.driverId || 'drv-1001';

      const prevRes = await db.query('SELECT * FROM public.rides WHERE id = $1', [id]);
      if (!prevRes.rows[0]) return sendJson(res, 404, { ok: false, error: 'Corrida não encontrada.' });
      const ride = formatRideFromDb(prevRes.rows[0]);

      const declined = Array.from(new Set([...(ride.declinedDriverIds || []), driverId]));
      const updatedRide = await upsertFullRide({
        ...ride,
        declinedDriverIds: declined
      });

      return sendJson(res, 200, { ok: true, ride: updatedRide });
    }

    // FINALIZAÇÃO COMPLETA DA CORRIDA + LIQUIDAÇÃO FINANCEIRA NO BACKEND + PROMOÇÃO DA FILA
    const rideCompleteMatch = pathname.match(/^\/api\/rides\/([^/]+)\/complete$/);
    if (rideCompleteMatch && method === 'POST') {
      const id = normalizeRideId(decodeURIComponent(rideCompleteMatch[1]));
      const body = await parseBody(req);

      const prevRes = await db.query('SELECT * FROM public.rides WHERE id = $1', [id]);
      if (!prevRes.rows[0]) return sendJson(res, 404, { ok: false, error: 'Corrida não encontrada.' });
      const ride = formatRideFromDb(prevRes.rows[0]);

      const finalPrice = body.finalAmount !== undefined ? finance.round2(body.finalAmount) : ride.totalPrice;
      const split = finance.calculateSplit(finalPrice, ride.commissionPercent ?? 20);
      const driverId = body.driverId || ride.driverId || 'drv-1001';
      const driver = await finance.getDriverById(driverId);

      let newPaymentStatus = ride.paymentStatus;
      let paidAmount = finalPrice;

      if (ride.paymentMethod === 'dinheiro') {
        const cashRes = await finance.settleCashRideToLedger(
          { ...ride, driverId, driverName: driver?.name || ride.driverName, totalPrice: finalPrice },
          body.receivedCashAmount !== undefined ? body.receivedCashAmount : finalPrice,
          body.cashResolution || 'confirmado'
        );
        newPaymentStatus = cashRes.paymentStatus;
        paidAmount = cashRes.paidAmount;
      } else if (ride.paymentMethod === 'cartao_credito' || ride.paymentMethod === 'cartao_debito') {
        // Captura o pagamento autorizado no cartão e lança no Livro-Razão
        newPaymentStatus = 'confirmado';
        paidAmount = finalPrice;
        const tx = await finance.getPaymentTxByRide(ride.id);
        await finance.savePaymentTransaction({
          ...(tx || {}),
          rideId: ride.id,
          rideCode: ride.rideCode,
          driverId,
          driverName: driver?.name || ride.driverName,
          clientId: ride.clientId,
          clientName: ride.clientName,
          method: ride.paymentMethod,
          status: 'confirmado',
          estimatedAmount: ride.estimatedPrice || ride.totalPrice,
          finalAmount: finalPrice,
          paidAmount: finalPrice,
          commissionPercent: split.commissionPercent,
          commissionAmount: split.commissionAmount,
          driverNetAmount: split.driverNetAmount
        });
        await finance.settleDigitalRideToLedger(
          { ...ride, driverId, driverName: driver?.name || ride.driverName, totalPrice: finalPrice },
          finalPrice
        );
      } else if (ride.paymentMethod === 'pix') {
        // Pix confirmado pelo gateway: garante crédito líquido no Livro-Razão do motorista que executou
        if (ride.paymentStatus === 'confirmado' || ride.paymentStatus === 'pago') {
          newPaymentStatus = 'confirmado';
          paidAmount = finalPrice;
          await finance.settleDigitalRideToLedger(
            { ...ride, driverId, driverName: driver?.name || ride.driverName, totalPrice: finalPrice },
            finalPrice
          );
        }
      }

      const completedRide = await upsertFullRide({
        ...ride,
        driverId,
        driverName: driver?.name || ride.driverName,
        totalPrice: finalPrice,
        paidAmount,
        commissionPercent: split.commissionPercent,
        commissionAmount: split.commissionAmount,
        driverNetAmount: split.driverNetAmount,
        paymentStatus: newPaymentStatus,
        isQueuedRide: false,
        queuedForDriverId: null,
        status: 'finalizada'
      });

      // Verifica se o motorista tem uma PRÓXIMA CORRIDA NA FILA para promover automaticamente!
      let promotedNextRide = null;
      if (driver) {
        const allRidesRes = await db.query('SELECT * FROM public.rides ORDER BY date DESC, time DESC');
        const allRides = allRidesRes.rows.map(formatRideFromDb);
        const queued = allRides.find(
          r => r.id === driver.queuedRideId || (r.driverId === driver.id && r.status === 'na_fila')
        );

        if (queued) {
          promotedNextRide = await upsertFullRide({
            ...queued,
            isQueuedRide: false,
            queuedForDriverId: null,
            status: 'a_caminho'
          });
        }

        await finance.saveDriverRecord({
          ...driver,
          totalRides: (driver.totalRides || 0) + 1,
          currentRideId: promotedNextRide ? promotedNextRide.id : null,
          queuedRideId: null
        });
      }

      const wallet = await finance.getDriverWallet(driverId);
      await push.handleRideChange(ride, completedRide);

      return sendJson(res, 200, {
        ok: true,
        ride: completedRide,
        promotedNextRide,
        wallet
      });
    }

    // RIDE BY ID: DELETE or PATCH
    const rideMatch = pathname.match(/^\/api\/rides\/([^/]+)$/);
    if (rideMatch && method === 'DELETE') {
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { error: 'Acesso não autorizado: PIN de motorista inválido ou ausente.' });
      }
      const id = normalizeRideId(decodeURIComponent(rideMatch[1]));
      const prevDel = await db.query('SELECT * FROM public.rides WHERE id = $1', [id]);
      if (prevDel.rows[0] && prevDel.rows[0].reminder_notification_id) {
        await push.handleRideChange(formatRideFromDb(prevDel.rows[0]), { ...formatRideFromDb(prevDel.rows[0]), status: 'finalizada' });
      }
      await db.query('DELETE FROM public.rides WHERE id = $1', [id]);
      return sendJson(res, 200, { ok: true, deleted: id });
    }

    const rideStatusMatch = pathname.match(/^\/api\/rides\/([^/]+)\/status$/);
    if (rideStatusMatch && method === 'PATCH') {
      const id = normalizeRideId(decodeURIComponent(rideStatusMatch[1]));
      const body = await parseBody(req);
      const prev = await db.query('SELECT * FROM public.rides WHERE id = $1', [id]);
      if (!prev.rows[0]) return sendJson(res, 404, { error: 'Corrida não encontrada' });
      const before = formatRideFromDb(prev.rows[0]);

      // Se a corrida for cancelada e já tinha Pix confirmado, processa reembolso automático no gateway/livro-razão
      let nextPaymentStatus = before.paymentStatus;
      if (body.status === 'cancelada' && (before.paymentStatus === 'confirmado' || before.paymentStatus === 'pago')) {
        nextPaymentStatus = 'reembolsado';
        const tx = await finance.getPaymentTxByRide(id);
        if (tx) {
          await finance.savePaymentTransaction({
            ...tx,
            status: 'reembolsado',
            refundedAmount: tx.paidAmount || tx.finalAmount
          });
        }
        if (before.driverId) {
          await finance.recordLedgerEntry({
            idempotencyKey: `refund_cancel_${id}`,
            driverId: before.driverId,
            driverName: before.driverName || 'Motorista',
            rideId: id,
            rideCode: before.rideCode,
            clientId: before.clientId,
            clientName: before.clientName,
            entryType: 'refund_debit',
            paymentMethod: before.paymentMethod,
            grossAmount: before.totalPrice,
            commissionPercent: before.commissionPercent || 20,
            commissionAmount: before.commissionAmount || 0,
            driverNetAmount: before.driverNetAmount || 0,
            balanceDelta: -(before.driverNetAmount || 0),
            balanceBucket: 'available',
            status: 'confirmado',
            description: `Estorno por cancelamento da corrida ${before.rideCode || id}`
          });
        }
      }

      const updated = await upsertFullRide({
        ...before,
        status: body.status,
        paymentStatus: nextPaymentStatus,
        isQueuedRide: body.status === 'na_fila'
      });

      await push.handleRideChange(before, updated);
      return sendJson(res, 200, { ok: true, id, status: updated.status, ride: updated });
    }

    // LIVE GPS LOCATION SYNC
    const rideLocationMatch = pathname.match(/^\/api\/rides\/([^/]+)\/location$/);
    if (rideLocationMatch) {
      const id = normalizeRideId(decodeURIComponent(rideLocationMatch[1]));
      if (method === 'GET') {
        const r = await db.query(
          'SELECT id, status, payment_status, driver_location, client_location FROM public.rides WHERE id = $1',
          [id]
        );
        if (!r.rows[0]) return sendJson(res, 404, { ok: false, error: 'Ride not found' });
        const row = r.rows[0];
        return sendJson(res, 200, {
          ok: true,
          id: row.id,
          status: row.status,
          paymentStatus: row.payment_status,
          driverLocation: row.driver_location || null,
          clientLocation: row.client_location || null
        });
      }
      if (method === 'PATCH' || method === 'POST') {
        const body = await parseBody(req);
        const role = body.role === 'client' ? 'client' : 'driver';
        const loc = body.location;
        if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
          return sendJson(res, 400, { ok: false, error: 'Invalid location' });
        }
        const payload = {
          lat: Number(loc.lat),
          lng: Number(loc.lng),
          heading: Number(loc.heading || 0),
          speedKmH: Number(loc.speedKmH || 0),
          updatedAt: new Date().toISOString()
        };
        const col = role === 'client' ? 'client_location' : 'driver_location';
        const r = await db.query(
          `UPDATE public.rides SET ${col} = $1, updated_at = NOW() WHERE id = $2 RETURNING id, status, payment_status, driver_location, client_location`,
          [JSON.stringify(payload), id]
        );
        if (!r.rows[0]) return sendJson(res, 404, { ok: false, error: 'Ride not found' });
        const row = r.rows[0];

        if (role === 'driver' && (row.status === 'a_caminho' || row.status === 'em_andamento')) {
          try {
            await db.query(
              `INSERT INTO public.ride_trail_points (ride_id, status, lat, lng, speed_kmh, heading, recorded_at)
               SELECT $1::varchar, $2::varchar, $3::float8, $4::float8, $5::float8, $6::float8, NOW()
               WHERE NOT EXISTS (
                 SELECT 1 FROM public.ride_trail_points
                 WHERE ride_id = $1::varchar AND recorded_at > NOW() - INTERVAL '2 seconds'
               )`,
              [id, row.status, payload.lat, payload.lng, payload.speedKmH, payload.heading]
            );
          } catch (err) {
            console.error('[trail insert]', err.message);
          }
        }

        return sendJson(res, 200, {
          ok: true,
          id: row.id,
          status: row.status,
          paymentStatus: row.payment_status,
          driverLocation: row.driver_location || null,
          clientLocation: row.client_location || null
        });
      }
    }

    // TRILHA GPS GRAVADA DA CORRIDA
    const rideTrailMatch = pathname.match(/^\/api\/rides\/([^/]+)\/trail$/);
    if (rideTrailMatch && method === 'GET') {
      const id = normalizeRideId(decodeURIComponent(rideTrailMatch[1]));
      const num = parseInt(String(id).replace(/\D/g, ''), 10) || 1;
      const rideCode = `#UP - ${String(num).padStart(3, '0')}`;
      const r = await db.query(
        `SELECT status, lat, lng, speed_kmh, heading, recorded_at
         FROM public.ride_trail_points WHERE ride_id = $1 ORDER BY recorded_at ASC LIMIT 20000`,
        [id]
      );
      return sendJson(res, 200, {
        ok: true,
        rideId: id,
        rideNumber: num,
        rideCode,
        points: r.rows.map(p => ({
          status: p.status,
          lat: Number(p.lat),
          lng: Number(p.lng),
          speedKmH: Number(p.speed_kmh || 0),
          heading: Number(p.heading || 0),
          t: new Date(p.recorded_at).toISOString()
        }))
      });
    }

    // ===== SOS TELEMETRY & EMERGENCY TRACKING =====
    if (pathname === '/api/sos/alerts' && method === 'GET') {
      const store = !db.pool ? (typeof db.getLocalStore === 'function' ? db.getLocalStore() : db.localStore) : null;
      if (store && store.sos_alerts) {
        const savedList = Array.isArray(store.sos_alerts) ? store.sos_alerts : Object.values(store.sos_alerts);
        for (const saved of savedList) {
          if (saved && saved.id && !sosMemoryStore.has(saved.id)) {
            sosMemoryStore.set(saved.id, saved);
          }
        }
      }

      const ridesRes = await db.query('SELECT * FROM rides ORDER BY created_at DESC');
      const allRides = ridesRes.rows || [];
      const driversList = await finance.listDrivers();
      const nowMs = Date.now();

      const alerts = Array.from(sosMemoryStore.values()).map((item) => {
        const linkedRide = item.rideId
          ? allRides.find(r => r.id === item.rideId)
          : allRides.find(r =>
              (item.phone && r.client_phone && r.client_phone.replace(/\D/g, '') === item.phone.replace(/\D/g, '')) ||
              (item.phone && r.driver_phone && r.driver_phone.replace(/\D/g, '') === item.phone.replace(/\D/g, ''))
            );

        const linkedDriver = linkedRide?.driver_id
          ? driversList.find(d => d.id === linkedRide.driver_id)
          : driversList[0] || null;

        const secondsAgo = Math.max(0, Math.round((nowMs - (item.updatedAtMs || new Date(item.updatedAt || nowMs).getTime())) / 1000));
        return {
          ...item,
          role: item.role || 'passageiro',
          status: item.status || (item.active !== false ? 'ativo' : 'resolvido'),
          rideId: item.rideId || linkedRide?.id || null,
          rideCode: item.rideCode || (linkedRide ? `#UP - ${String(linkedRide.ride_number || 1).padStart(3, '0')}` : null),
          clientName: item.clientName || linkedRide?.client_name || item.name || 'Passageiro',
          clientPhone: item.clientPhone || linkedRide?.client_phone || item.phone || '',
          driverId: item.driverId || linkedRide?.driver_id || linkedDriver?.id || null,
          driverName: item.driverName || linkedRide?.driver_name || linkedDriver?.name || 'Alisson Santos',
          driverPhone: item.driverPhone || linkedRide?.driver_phone || linkedDriver?.phone || '(48) 99691-5303',
          driverVehicle: item.driverVehicle || linkedRide?.driver_vehicle || (linkedDriver ? `${linkedDriver.vehicleBrand} ${linkedDriver.vehicleModel}` : 'Toyota Corolla XEi'),
          driverPlate: item.driverPlate || linkedRide?.driver_plate || linkedDriver?.vehiclePlate || 'QXZ4G21',
          originAddress: linkedRide?.origin?.address || item.address || '',
          destinationAddress: linkedRide?.destination?.address || '',
          trackingUrl: `/sos/${encodeURIComponent(item.id)}`,
          googleMapsUrl: `https://www.google.com/maps?q=${item.lat},${item.lng}`,
          secondsAgo,
          isOnline: item.active !== false && secondsAgo < 120
        };
      }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      return sendJson(res, 200, { ok: true, alerts });
    }

    const sosStatusMatch = pathname.match(/^\/api\/sos\/([^/]+)\/status$/);
    if (sosStatusMatch && (method === 'PATCH' || method === 'POST')) {
      const id = decodeURIComponent(sosStatusMatch[1]);
      const body = await parseBody(req);
      const existing = sosMemoryStore.get(id);
      if (!existing) {
        return sendJson(res, 404, { ok: false, error: 'Chamado SOS não encontrado.' });
      }
      const nextStatus = body.status || 'resolvido';
      const updated = {
        ...existing,
        status: nextStatus,
        active: nextStatus !== 'resolvido',
        notes: body.notes !== undefined ? body.notes : existing.notes,
        updatedAt: new Date().toISOString(),
        updatedAtMs: Date.now()
      };
      sosMemoryStore.set(id, updated);

      if (!db.pool) {
        const store = db.getLocalStore();
        if (!Array.isArray(store.sos_alerts)) store.sos_alerts = [];
        const idx = store.sos_alerts.findIndex(s => s.id === id);
        if (idx >= 0) store.sos_alerts[idx] = updated;
        else store.sos_alerts.unshift(updated);
        db.saveLocalStore();
      }
      return sendJson(res, 200, { ok: true, alert: updated });
    }

    if (pathname === '/api/sos/location' && (method === 'POST' || method === 'PATCH')) {
      const body = await parseBody(req);
      const sosId = String(body.id || `sos-${Date.now()}`);
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      if (isNaN(lat) || isNaN(lng)) {
        return sendJson(res, 400, { ok: false, error: 'Coordenadas lat/lng inválidas' });
      }

      const now = new Date();
      const existing = sosMemoryStore.get(sosId);
      const isNewAlert = !existing;

      const alertData = {
        id: sosId,
        role: body.role || existing?.role || 'passageiro',
        name: body.name || existing?.name || 'Passageiro em Emergência',
        phone: body.phone || existing?.phone || '',
        clientName: body.clientName || existing?.clientName || body.name || 'Passageiro',
        clientPhone: body.clientPhone || existing?.clientPhone || body.phone || '',
        driverId: body.driverId || existing?.driverId || null,
        driverName: body.driverName || existing?.driverName || null,
        driverPhone: body.driverPhone || existing?.driverPhone || null,
        driverVehicle: body.driverVehicle || existing?.driverVehicle || null,
        driverPlate: body.driverPlate || existing?.driverPlate || null,
        lat,
        lng,
        accuracy: Number(body.accuracy || existing?.accuracy || 0),
        heading: Number(body.heading || 0),
        speedKmH: Number(body.speedKmH || 0),
        address: body.address || existing?.address || 'Localização GPS em tempo real',
        rideId: body.rideId || existing?.rideId || null,
        rideCode: body.rideCode || existing?.rideCode || null,
        status: existing?.status || 'ativo',
        active: true,
        updatedAt: now.toISOString(),
        updatedAtMs: now.getTime(),
        createdAt: existing?.createdAt || now.toISOString()
      };

      sosMemoryStore.set(sosId, alertData);

      if (!db.pool) {
        const store = db.getLocalStore();
        if (!Array.isArray(store.sos_alerts)) store.sos_alerts = [];
        const idx = store.sos_alerts.findIndex(s => s.id === sosId);
        if (idx >= 0) store.sos_alerts[idx] = alertData;
        else store.sos_alerts.unshift(alertData);
        db.saveLocalStore();
      }

      db.query(`
        INSERT INTO public.sos_alerts (id, name, phone, lat, lng, accuracy, heading, speed_kmh, address, ride_id, active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11, NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = COALESCE(EXCLUDED.name, public.sos_alerts.name),
          phone = COALESCE(EXCLUDED.phone, public.sos_alerts.phone),
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          accuracy = EXCLUDED.accuracy,
          heading = EXCLUDED.heading,
          speed_kmh = EXCLUDED.speed_kmh,
          address = COALESCE(EXCLUDED.address, public.sos_alerts.address),
          ride_id = COALESCE(EXCLUDED.ride_id, public.sos_alerts.ride_id),
          active = true,
          updated_at = NOW();
      `, [
        alertData.id, alertData.name, alertData.phone, alertData.lat, alertData.lng,
        alertData.accuracy, alertData.heading, alertData.speedKmH, alertData.address,
        alertData.rideId, alertData.createdAt
      ]).catch(() => {});

      if (isNewAlert) {
        db.query(
          `INSERT INTO public.notifications (id, title, message, type, ride_id, read, timestamp)
           VALUES ($1, $2, $3, 'sos_alert', $4, false, NOW())`,
          [
            `notif-sos-${Date.now()}`,
            `🚨 ALERTA SOS: ${alertData.name}`,
            `Auxílio urgente solicitado! Local: ${alertData.address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`}`,
            alertData.rideId
          ]
        ).catch(() => {});

        push.sendToExternalIds(
          [push.ADMIN_EXTERNAL_ID],
          `🚨 ALERTA SOS ACIONADO: ${alertData.name}`,
          `Passageiro solicitou socorro urgente! Toque para ver a localização no mapa.`,
          { url: `/sos/${encodeURIComponent(sosId)}` }
        ).catch(() => {});
      }

      return sendJson(res, 200, {
        ok: true,
        alert: {
          id: alertData.id,
          name: alertData.name,
          phone: alertData.phone,
          lat: alertData.lat,
          lng: alertData.lng,
          accuracy: alertData.accuracy,
          address: alertData.address,
          updatedAt: alertData.updatedAt,
          secondsAgo: 0,
          isOnline: true
        }
      });
    }

    const sosLocMatch = pathname.match(/^\/api\/sos\/([^/]+)\/location$/);
    if (sosLocMatch && method === 'GET') {
      const id = decodeURIComponent(sosLocMatch[1]);
      let item = sosMemoryStore.get(id);

      if (!item) {
        const r = await db.query('SELECT * FROM public.sos_alerts WHERE id = $1', [id]);
        if (r.rows[0]) {
          const row = r.rows[0];
          const updatedDate = new Date(row.updated_at || row.created_at || Date.now());
          item = {
            id: row.id,
            name: row.name || 'Passageiro em Emergência',
            phone: row.phone || '',
            lat: Number(row.lat),
            lng: Number(row.lng),
            accuracy: Number(row.accuracy || 0),
            heading: Number(row.heading || 0),
            speedKmH: Number(row.speed_kmh || 0),
            address: row.address || '',
            rideId: row.ride_id || null,
            active: row.active !== false,
            updatedAt: updatedDate.toISOString(),
            updatedAtMs: updatedDate.getTime(),
            createdAt: row.created_at
          };
          sosMemoryStore.set(id, item);
        }
      }

      if (!item) {
        return sendJson(res, 404, { ok: false, error: 'Alerta SOS não encontrado' });
      }

      const secondsAgo = Math.max(0, Math.floor((Date.now() - (item.updatedAtMs || new Date(item.updatedAt).getTime())) / 1000));
      const isOnline = secondsAgo <= 35 && item.active !== false;

      return sendJson(res, 200, {
        ok: true,
        id: item.id,
        name: item.name,
        phone: item.phone,
        lat: item.lat,
        lng: item.lng,
        accuracy: item.accuracy,
        heading: item.heading,
        speedKmH: item.speedKmH,
        address: item.address,
        rideId: item.rideId,
        active: item.active,
        updatedAt: item.updatedAt,
        secondsAgo,
        isOnline
      });
    }

    const sosResolveMatch = pathname.match(/^\/api\/sos\/([^/]+)\/resolve$/);
    if (sosResolveMatch && method === 'POST') {
      const id = decodeURIComponent(sosResolveMatch[1]);
      if (sosMemoryStore.has(id)) {
        const curr = sosMemoryStore.get(id);
        sosMemoryStore.set(id, { ...curr, active: false });
      }
      await db.query('UPDATE public.sos_alerts SET active = false, updated_at = NOW() WHERE id = $1', [id]).catch(() => {});
      return sendJson(res, 200, { ok: true, id, resolved: true });
    }

    // ============================================================
    // 3.5 GATEWAY DE PAGAMENTOS: PIX DINÂMICO, CARTÕES E WEBHOOK IDEMPOTENTE
    // ============================================================
    if (pathname === '/api/payments/pix/create' && method === 'POST') {
      const body = await parseBody(req);
      const rideId = normalizeRideId(body.rideId);
      const r = await db.query('SELECT * FROM public.rides WHERE id = $1', [rideId]);
      if (!r.rows[0]) return sendJson(res, 404, { ok: false, error: 'Corrida não encontrada.' });
      const ride = formatRideFromDb(r.rows[0]);
      const { tx, split } = await finance.createPixChargeForRide(ride);
      const updated = await upsertFullRide({
        ...ride,
        paymentTxId: tx.id,
        pixQrCode: tx.pixQrCode,
        pixCopyPaste: tx.pixCopyPaste,
        commissionPercent: split.commissionPercent,
        commissionAmount: split.commissionAmount,
        driverNetAmount: split.driverNetAmount
      });
      return sendJson(res, 200, { ok: true, tx, ride: updated });
    }

    if (pathname === '/api/payments/cards') {
      if (method === 'GET') {
        const clientId = url.searchParams.get('clientId') || req.headers['x-client-id'] || '';
        const clientPhone = url.searchParams.get('clientPhone') || req.headers['x-client-phone'] || '';
        const cards = await finance.listSavedCards(clientId, clientPhone);
        return sendJson(res, 200, { ok: true, cards });
      }
      if (method === 'POST') {
        const body = await parseBody(req);
        try {
          const card = await finance.tokenizeAndSaveCard(body);
          return sendJson(res, 200, { ok: true, card });
        } catch (err) {
          return sendJson(res, 400, { ok: false, error: err.message });
        }
      }
    }

    // WEBHOOK UNIFICADO DO GATEWAY (PIX, CARTÃO, QUITAÇÃO DE DÍVIDA) — COM IDEMPOTÊNCIA
    if ((pathname === '/api/payments/webhook' || pathname === '/api/webhooks/mercadopago') && (method === 'POST' || method === 'GET')) {
      const body = method === 'POST' ? await parseBody(req) : {};
      const eventType = body.event || 'payment.confirmed';

      // 1) Quitação de dívida de motorista via PIX
      if (eventType === 'debt.confirmed' && body.driverId) {
        const result = await finance.confirmDriverDebtSettlementWebhook({
          driverId: body.driverId,
          amount: body.amount,
          gatewayTxId: body.gatewayTxId || `gw_debt_${Date.now()}`
        });
        return sendJson(res, 200, { ok: true, ...result });
      }

      // 2) Webhook nativo do Mercado Pago (quando enviado pelo servidor do MP)
      let rideId = body.rideId ? normalizeRideId(body.rideId) : null;
      let paidAmount = body.amount;

      if (!rideId && pathname === '/api/webhooks/mercadopago') {
        const paymentId = body?.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id');
        const topic = body?.type || body?.topic || url.searchParams.get('type') || url.searchParams.get('topic');
        if (!paymentId || (topic && topic !== 'payment')) return sendJson(res, 200, { ok: true, ignored: true });
        const token = env.MERCADOPAGO_ACCESS_TOKEN;
        if (!token) return sendJson(res, 200, { ok: false, reason: 'token_missing' });
        const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!mpRes.ok) return sendJson(res, 200, { ok: false, reason: `mp_${mpRes.status}` });
        const payment = await mpRes.json();
        if (payment.status !== 'approved' || !payment.external_reference) {
          return sendJson(res, 200, { ok: true, status: payment.status });
        }
        rideId = normalizeRideId(payment.external_reference);
        paidAmount = payment.transaction_amount;
      }

      if (!rideId) {
        return sendJson(res, 400, { ok: false, error: 'rideId ausente no payload do webhook.' });
      }

      const prevRes = await db.query('SELECT * FROM public.rides WHERE id = $1', [rideId]);
      if (!prevRes.rows[0]) return sendJson(res, 404, { ok: false, error: 'Corrida não encontrada.' });
      const before = formatRideFromDb(prevRes.rows[0]);

      // Idempotência: se o PIX já foi confirmado anteriormente, não duplica lançamento
      if (eventType === 'payment.confirmed' && (before.paymentStatus === 'confirmado' || before.paymentStatus === 'pago')) {
        return sendJson(res, 200, { ok: true, idempotent: true, ride: before });
      }

      const finalVal = paidAmount ? finance.round2(paidAmount) : before.totalPrice;
      const split = finance.calculateSplit(finalVal, before.commissionPercent ?? 20);

      // Libera a corrida pré-paga para tocar no radar dos motoristas!
      const nextRideStatus = before.status === 'aguardando_pagamento' ? 'aguardando_confirmacao' : before.status;

      const updatedRide = await upsertFullRide({
        ...before,
        totalPrice: finalVal,
        paidAmount: finalVal,
        commissionPercent: split.commissionPercent,
        commissionAmount: split.commissionAmount,
        driverNetAmount: split.driverNetAmount,
        paymentStatus: 'confirmado',
        status: nextRideStatus
      });

      const tx = await finance.getPaymentTxByRide(rideId);
      await finance.savePaymentTransaction({
        ...(tx || {}),
        rideId,
        rideCode: updatedRide.rideCode,
        driverId: updatedRide.driverId || null,
        driverName: updatedRide.driverName || null,
        clientId: updatedRide.clientId || null,
        clientName: updatedRide.clientName,
        method: updatedRide.paymentMethod || 'pix',
        status: 'confirmado',
        estimatedAmount: updatedRide.estimatedPrice || updatedRide.totalPrice,
        finalAmount: finalVal,
        paidAmount: finalVal,
        commissionPercent: split.commissionPercent,
        commissionAmount: split.commissionAmount,
        driverNetAmount: split.driverNetAmount,
        gatewayTxId: body.gatewayTxId || tx?.gatewayTxId || `gw_pix_${rideId}`
      });

      // Se já houver motorista vinculado, credita imediatamente no Livro-Razão com split
      if (updatedRide.driverId) {
        await finance.settleDigitalRideToLedger(updatedRide, finalVal);
      }

      await db.query(
        `INSERT INTO public.notifications (id, title, message, type, ride_id, read, timestamp)
         VALUES ($1, $2, $3, 'payment', $4, false, NOW())`,
        [
          `notif-pix-${Date.now()}`,
          `💰 PIX Confirmado pelo Gateway: ${updatedRide.rideCode}`,
          `${updatedRide.clientName} pagou R$ ${finalVal.toFixed(2)} via PIX (Líquido Motorista: R$ ${split.driverNetAmount.toFixed(2)}). Corrida liberada!`,
          rideId
        ]
      ).catch(() => {});

      await push.handleRideChange(before, updatedRide, { source: 'webhook' });
      return sendJson(res, 200, { ok: true, ride: updatedRide, split });
    }

    const ridePaymentMatch = pathname.match(/^\/api\/rides\/([^/]+)\/payment$/);
    if (ridePaymentMatch && method === 'PATCH') {
      const id = normalizeRideId(decodeURIComponent(ridePaymentMatch[1]));
      const body = await parseBody(req);
      const prev = await db.query('SELECT * FROM public.rides WHERE id = $1', [id]);
      if (!prev.rows[0]) return sendJson(res, 404, { error: 'Corrida não encontrada.' });
      const before = formatRideFromDb(prev.rows[0]);

      // Regra obrigatória: PIX nunca é marcado como pago manualmente sem webhook do gateway!
      if ((body.paymentMethod || before.paymentMethod) === 'pix' && (body.paymentStatus === 'pago' || body.paymentStatus === 'confirmado')) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Pagamentos PIX só podem ser confirmados automaticamente pelo webhook do gateway.'
        });
      }

      const updated = await upsertFullRide({
        ...before,
        paymentMethod: body.paymentMethod || before.paymentMethod,
        paymentStatus: body.paymentStatus || before.paymentStatus,
        paidAmount: body.paidAmount !== undefined ? Number(body.paidAmount) : before.totalPrice
      });

      if (updated.paymentMethod === 'dinheiro' && (updated.paymentStatus === 'confirmado' || updated.paymentStatus === 'pago' || updated.paymentStatus === 'parcialmente_pago')) {
        await finance.settleCashRideToLedger(updated, updated.paidAmount || updated.totalPrice, updated.paymentStatus);
      }

      await push.handleRideChange(before, updated);
      return sendJson(res, 200, { ok: true, id, paymentStatus: updated.paymentStatus, ride: updated });
    }

    // ============================================================
    // 3.8 ROTAS ADMINISTRATIVAS MASTER (MOTORISTAS, COMISSÕES, REPASSES, AUDITORIA)
    // ============================================================
    if (pathname === '/api/admin/finance/overview' && method === 'GET') {
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { error: 'Acesso restrito ao Administrador Master.' });
      }
      const overview = await finance.getPlatformFinancialOverview();
      return sendJson(res, 200, { ok: true, ...overview });
    }

    const adminDriverStatusMatch = pathname.match(/^\/api\/admin\/drivers\/([^/]+)\/status$/);
    if (adminDriverStatusMatch && (method === 'PATCH' || method === 'POST')) {
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { error: 'Acesso restrito ao Administrador Master.' });
      }
      const driverId = decodeURIComponent(adminDriverStatusMatch[1]);
      const body = await parseBody(req);
      const driver = await finance.getDriverById(driverId);
      if (!driver) return sendJson(res, 404, { ok: false, error: 'Motorista não encontrado.' });

      const updated = await finance.saveDriverRecord({
        ...driver,
        ...body,
        id: driver.id,
        approvalStatus: body.approvalStatus || driver.approvalStatus,
        financialBlocked: body.financialBlocked !== undefined ? Boolean(body.financialBlocked) : driver.financialBlocked,
        financialBlockReason: body.financialBlockReason !== undefined ? body.financialBlockReason : driver.financialBlockReason,
        isOnline: body.approvalStatus && body.approvalStatus !== 'aprovado' ? false : driver.isOnline
      });
      return sendJson(res, 200, { ok: true, driver: updated });
    }

    const adminWithdrawProcessMatch = pathname.match(/^\/api\/admin\/withdrawals\/([^/]+)\/process$/);
    if (adminWithdrawProcessMatch && method === 'POST') {
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { error: 'Acesso restrito ao Administrador Master.' });
      }
      const withdrawalId = decodeURIComponent(adminWithdrawProcessMatch[1]);
      const body = await parseBody(req);
      try {
        const resProc = await finance.processWithdrawalAdmin({
          withdrawalId,
          action: body.action || 'approve',
          notes: body.notes
        });
        return sendJson(res, 200, resProc);
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message });
      }
    }

    const adminPaymentActionMatch = pathname.match(/^\/api\/admin\/payments\/([^/]+)\/action$/);
    if (adminPaymentActionMatch && method === 'POST') {
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { error: 'Acesso restrito ao Administrador Master.' });
      }
      const txOrRideId = decodeURIComponent(adminPaymentActionMatch[1]);
      const body = await parseBody(req);
      const tx = await finance.getPaymentTxByRide(txOrRideId);
      if (!tx) return sendJson(res, 404, { ok: false, error: 'Transação não encontrada.' });

      const action = body.action; // 'refund' | 'dispute' | 'adjust_Debt'
      let nextStatus = tx.status;
      if (action === 'refund') nextStatus = 'reembolsado';
      else if (action === 'dispute') nextStatus = 'contestado';

      const updatedTx = await finance.savePaymentTransaction({
        ...tx,
        status: nextStatus,
        refundedAmount: action === 'refund' ? (body.amount || tx.finalAmount) : tx.refundedAmount,
        disputeReason: action === 'dispute' ? (body.reason || 'Contestação registrada pelo gateway') : tx.disputeReason
      });

      if (tx.driverId && (action === 'refund' || action === 'dispute')) {
        await finance.recordLedgerEntry({
          idempotencyKey: `admin_${action}_${tx.id}_${Date.now()}`,
          driverId: tx.driverId,
          driverName: tx.driverName || 'Motorista',
          rideId: tx.rideId,
          rideCode: tx.rideCode,
          entryType: action === 'refund' ? 'refund_debit' : 'dispute_hold',
          paymentMethod: tx.method,
          grossAmount: tx.finalAmount,
          commissionPercent: tx.commissionPercent,
          commissionAmount: tx.commissionAmount,
          driverNetAmount: tx.driverNetAmount,
          balanceDelta: -tx.driverNetAmount,
          balanceBucket: 'available',
          status: 'confirmado',
          description: action === 'refund'
            ? `Reembolso administrativo da corrida ${tx.rideCode || tx.rideId}`
            : `Retenção por contestação (chargeback) na corrida ${tx.rideCode || tx.rideId}`
        });
      }

      const prevRide = await db.query('SELECT * FROM public.rides WHERE id = $1', [tx.rideId]);
      if (prevRide.rows[0]) {
        await upsertFullRide({
          ...formatRideFromDb(prevRide.rows[0]),
          paymentStatus: nextStatus
        });
      }

      return sendJson(res, 200, { ok: true, transaction: updatedTx });
    }

    // ===== PUSH: teste e modelos =====
    if (pathname === '/api/push/templates' && method === 'GET') {
      return sendJson(res, 200, push.DEFAULT_TEMPLATES);
    }
    if (pathname === '/api/push/test' && method === 'POST') {
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { error: 'Acesso não autorizado: PIN de motorista inválido ou ausente.' });
      }
      const body = await parseBody(req);
      const target = body.externalId || push.ADMIN_EXTERNAL_ID;
      const r = await push.sendToExternalIds([target], body.title || '🔔 Teste Kavro Drive', body.message || 'Notificações funcionando!', { url: '/motora' });
      return sendJson(res, 200, { ok: !!r?.id, result: r });
    }

    // 4. EXPENSES
    if (pathname === '/api/expenses') {
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { error: 'Acesso não autorizado: PIN de motorista inválido ou ausente.' });
      }
      if (method === 'GET') {
        const r = await db.query('SELECT * FROM public.expenses ORDER BY date DESC');
        return sendJson(res, 200, r.rows.map(row => ({
          id: row.id,
          description: row.description,
          amount: Number(row.amount),
          category: row.category,
          date: row.date,
          notes: row.notes,
          type: row.type || 'saida',
          paymentMethod: row.payment_method || 'dinheiro',
          createdAt: row.created_at
        })));
      }
      if (method === 'POST') {
        const exp = await parseBody(req);
        if (!exp.id) exp.id = `exp-${Date.now()}`;
        const expType = exp.type === 'entrada' ? 'entrada' : 'saida';
        const expPayMethod = exp.paymentMethod || 'dinheiro';
        await db.query(`
          INSERT INTO public.expenses (id, description, amount, category, date, notes, type, payment_method)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            description = EXCLUDED.description,
            amount = EXCLUDED.amount,
            category = EXCLUDED.category,
            date = EXCLUDED.date,
            notes = EXCLUDED.notes,
            type = EXCLUDED.type,
            payment_method = EXCLUDED.payment_method;
        `, [exp.id, exp.description, exp.amount, exp.category, exp.date, exp.notes || null, expType, expPayMethod]);
        return sendJson(res, 200, { ok: true, expense: exp });
      }
    }

    const expMatch = pathname.match(/^\/api\/expenses\/([^/]+)$/);
    if (expMatch && method === 'DELETE') {
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { error: 'Acesso não autorizado: PIN de motorista inválido ou ausente.' });
      }
      const id = decodeURIComponent(expMatch[1]);
      await db.query('DELETE FROM public.expenses WHERE id = $1', [id]);
      return sendJson(res, 200, { ok: true, deleted: id });
    }

    // 5. CLIENTS & AUTHENTICATION
    if (pathname === '/api/clients/register' && method === 'POST') {
      await ensureClientsSchema();
      const body = await parseBody(req);
      const turnstile = await verifyTurnstileToken(body.turnstileToken, req.socket?.remoteAddress);
      if (!turnstile.ok) {
        return sendJson(res, 403, { ok: false, error: turnstile.error });
      }
      const name = String(body.name || '').trim();
      const phone = String(body.phone || '').trim();
      const cleanPhone = phone.replace(/\D/g, '');
      const email = String(body.email || '').trim().toLowerCase();
      const document = String(body.document || '').replace(/\D/g, '');
      const password = String(body.password || '');

      if (!name || cleanPhone.length < 10) {
        return sendJson(res, 400, { ok: false, error: 'Informe nome completo e WhatsApp válido.' });
      }
      if (!password || password.length < 4) {
        return sendJson(res, 400, { ok: false, error: 'Crie uma senha com pelo menos 4 caracteres.' });
      }
      if (!body.termsAcceptance || body.termsAcceptance.accepted !== true) {
        return sendJson(res, 400, { ok: false, error: 'É necessário ler e concordar com os Termos e Condições Gerais de Uso para concluir o cadastro.' });
      }

      const existingRes = await db.query(
        `SELECT * FROM public.clients
         WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $1
            OR ($2 <> '' AND LOWER(COALESCE(email, '')) = $2)
         LIMIT 1`,
        [cleanPhone, email]
      );

      const passwordHash = hashPassword(password);
      const clientIp = getRequestClientIp(req);
      let savedClientRow = null;

      if (existingRes.rows[0]) {
        const existing = existingRes.rows[0];
        if (existing.password_hash) {
          return sendJson(res, 409, {
            ok: false,
            error: 'Já existe uma conta cadastrada com este WhatsApp ou E-mail. Faça login com sua senha.'
          });
        }
        const termsSignature = passengerTermsContract.buildPassengerTermsSignature({
          clientId: existing.id,
          name,
          document,
          phone,
          email,
          ip: clientIp,
          userAgent: req.headers['user-agent'],
          host: req.headers.host,
          clientAcceptance: body.termsAcceptance
        });
        const updatedRes = await db.query(
          `UPDATE public.clients
           SET name = $1, phone = $2, email = $3, document = $4, password_hash = $5, terms_accepted_at = $6, terms_signature = $7
           WHERE id = $8
           RETURNING *`,
          [name, phone, email || null, document || null, passwordHash, termsSignature.signedAt, JSON.stringify(termsSignature), existing.id]
        );
        savedClientRow = updatedRes.rows[0];
      } else {
        const newId = body.id || `cli-${Date.now()}`;
        const termsSignature = passengerTermsContract.buildPassengerTermsSignature({
          clientId: newId,
          name,
          document,
          phone,
          email,
          ip: clientIp,
          userAgent: req.headers['user-agent'],
          host: req.headers.host,
          clientAcceptance: body.termsAcceptance
        });
        const insertRes = await db.query(
          `INSERT INTO public.clients (id, name, phone, email, document, password_hash, saved_addresses, terms_accepted_at, terms_signature, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
           RETURNING *`,
          [
            newId,
            name,
            phone,
            email || null,
            document || null,
            passwordHash,
            JSON.stringify(body.savedAddresses || []),
            termsSignature.signedAt,
            JSON.stringify(termsSignature)
          ]
        );
        savedClientRow = insertRes.rows[0];
      }

      const sanitizedClient = sanitizeClientRow(savedClientRow, false);
      const docSummary = sanitizedClient.document ? ` • CPF: ${sanitizedClient.document}` : '';
      const termCode = sanitizedClient.termsSignature?.validationCode ? ` • Termo: ${sanitizedClient.termsSignature.validationCode}` : '';
      await db.query(
        `INSERT INTO public.notifications (id, title, message, type, read, timestamp)
         VALUES ($1, $2, $3, 'client_new', false, NOW())`,
        [
          `notif-cli-${Date.now()}`,
          `👤 Novo Passageiro Cadastrado: ${sanitizedClient.name}`,
          `WhatsApp: ${sanitizedClient.phone}${docSummary}${termCode}`
        ]
      ).catch(() => {});

      return sendJson(res, 200, { ok: true, client: sanitizedClient });
    }

    if (pathname === '/api/clients/check' && (method === 'POST' || method === 'GET')) {
      await ensureClientsSchema();
      let identifier = '';
      if (method === 'POST') {
        const body = await parseBody(req);
        identifier = String(body.identifier || '').trim();
      } else {
        identifier = String(url.searchParams.get('identifier') || url.searchParams.get('phone') || '').trim();
      }

      const isEmail = identifier.includes('@');
      const cleanEmail = isEmail ? identifier.toLowerCase() : '';
      const cleanPhone = !isEmail ? identifier.replace(/\D/g, '') : '';

      const foundRes = await db.query(
        `SELECT id, name, phone, email, blocked, password_hash, terms_signature FROM public.clients
         WHERE ($1 <> '' AND LOWER(COALESCE(email, '')) = $1)
            OR ($2 <> '' AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $2)
         LIMIT 1`,
        [cleanEmail, cleanPhone]
      );

      const clientRow = foundRes.rows[0];
      if (!clientRow) {
        return sendJson(res, 200, { ok: true, exists: false });
      }

      return sendJson(res, 200, {
        ok: true,
        exists: true,
        hasPassword: Boolean(clientRow.password_hash),
        name: clientRow.name,
        firstName: clientRow.name ? clientRow.name.split(' ')[0] : 'Passageiro',
        blocked: Boolean(clientRow.blocked),
        termsSigned: Boolean(clientRow.terms_signature && clientRow.terms_signature.signed),
        termsValidationCode: clientRow.terms_signature?.validationCode || null
      });
    }

    if (pathname === '/api/clients/login' && method === 'POST') {
      await ensureClientsSchema();
      const body = await parseBody(req);
      const turnstile = await verifyTurnstileToken(body.turnstileToken, req.socket?.remoteAddress);
      if (!turnstile.ok) {
        return sendJson(res, 403, { ok: false, error: turnstile.error });
      }
      const rawIdentifier = String(body.identifier || '').trim();
      const password = String(body.password || '');

      if (!rawIdentifier || !password) {
        return sendJson(res, 400, { ok: false, error: 'Informe seu E-mail/WhatsApp e sua senha.' });
      }

      const isEmail = rawIdentifier.includes('@');
      const cleanEmail = isEmail ? rawIdentifier.toLowerCase() : '';
      const cleanPhone = !isEmail ? rawIdentifier.replace(/\D/g, '') : '';

      const foundRes = await db.query(
        `SELECT * FROM public.clients
         WHERE ($1 <> '' AND LOWER(COALESCE(email, '')) = $1)
            OR ($2 <> '' AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $2)
         LIMIT 1`,
        [cleanEmail, cleanPhone]
      );

      const clientRow = foundRes.rows[0];
      if (!clientRow) {
        return sendJson(res, 401, {
          ok: false,
          error: 'Nenhuma conta encontrada com este E-mail ou WhatsApp. Crie sua conta primeiro.'
        });
      }

      if (clientRow.blocked) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Sua conta está temporariamente suspensa. Entre em contato com a central.'
        });
      }

      if (clientRow.password_hash) {
        const valid = verifyPassword(password, clientRow.password_hash);
        if (!valid) {
          return sendJson(res, 401, {
            ok: false,
            error: 'Senha incorreta. Verifique os dados e tente novamente.'
          });
        }
        if (!String(clientRow.password_hash).startsWith('scrypt:')) {
          const upgraded = hashPassword(password);
          await db.query('UPDATE public.clients SET password_hash = $1 WHERE id = $2', [upgraded, clientRow.id]).catch(() => {});
        }
      } else {
        if (password.length < 4) {
          return sendJson(res, 401, { ok: false, error: 'Senha inválida (mínimo de 4 dígitos).' });
        }
        const firstHash = hashPassword(password);
        await db.query('UPDATE public.clients SET password_hash = $1 WHERE id = $2', [firstHash, clientRow.id]).catch(() => {});
      }

      return sendJson(res, 200, { ok: true, client: sanitizeClientRow(clientRow, false) });
    }

    if (pathname === '/api/clients') {
      await ensureClientsSchema();
      if (method === 'GET') {
        if (!await isAuthorizedAdmin(req)) {
          return sendJson(res, 401, { error: 'Acesso restrito ao motorista autorizado.' });
        }
        const r = await db.query('SELECT * FROM public.clients ORDER BY created_at DESC');
        return sendJson(res, 200, r.rows.map(row => sanitizeClientRow(row, true)));
      }
      if (method === 'POST') {
        const isAdmin = await isAuthorizedAdmin(req);
        const cli = await parseBody(req);
        if (!cli.id) cli.id = `cli-${Date.now()}`;
        const pwdHash = cli.password ? hashPassword(cli.password) : null;

        const r = await db.query(`
          INSERT INTO public.clients (id, name, phone, email, document, password_hash, notes, blocked, saved_addresses, terms_accepted_at, terms_signature, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            phone = EXCLUDED.phone,
            email = COALESCE(EXCLUDED.email, public.clients.email),
            document = COALESCE(EXCLUDED.document, public.clients.document),
            password_hash = COALESCE(EXCLUDED.password_hash, public.clients.password_hash),
            notes = CASE WHEN $13::boolean THEN EXCLUDED.notes ELSE public.clients.notes END,
            blocked = CASE WHEN $13::boolean THEN EXCLUDED.blocked ELSE public.clients.blocked END,
            saved_addresses = EXCLUDED.saved_addresses,
            terms_accepted_at = COALESCE(EXCLUDED.terms_accepted_at, public.clients.terms_accepted_at),
            terms_signature = COALESCE(EXCLUDED.terms_signature, public.clients.terms_signature)
          RETURNING *;
        `, [
          cli.id,
          cli.name,
          cli.phone,
          cli.email || null,
          cli.document ? String(cli.document).replace(/\D/g, '') : null,
          pwdHash,
          cli.notes || null,
          Boolean(cli.blocked),
          JSON.stringify(cli.savedAddresses || []),
          cli.termsAcceptedAt || null,
          cli.termsSignature ? JSON.stringify(cli.termsSignature) : null,
          cli.createdAt || new Date().toISOString(),
          isAdmin
        ]);
        return sendJson(res, 200, { ok: true, client: sanitizeClientRow(r.rows[0] || cli, isAdmin) });
      }
    }

    const cliMatch = pathname.match(/^\/api\/clients\/([^/]+)$/);
    if (cliMatch && method === 'DELETE') {
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { error: 'Acesso não autorizado: PIN de motorista inválido ou ausente.' });
      }
      const id = decodeURIComponent(cliMatch[1]);
      await db.query('DELETE FROM public.clients WHERE id = $1', [id]);
      return sendJson(res, 200, { ok: true, deleted: id });
    }

    // 6. BLOCKED SLOTS
    if (pathname === '/api/blocked-slots') {
      if (method === 'GET') {
        const r = await db.query('SELECT date, slots FROM public.blocked_slots');
        const map = {};
        r.rows.forEach(row => { map[row.date] = row.slots || []; });
        return sendJson(res, 200, map);
      }
      if (method === 'POST') {
        if (!await isAuthorizedAdmin(req)) {
          return sendJson(res, 401, { error: 'Acesso não autorizado: PIN de motorista inválido ou ausente.' });
        }
        const body = await parseBody(req);
        await db.query(`
          INSERT INTO public.blocked_slots (date, slots, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (date) DO UPDATE SET slots = EXCLUDED.slots, updated_at = NOW();
        `, [body.date, JSON.stringify(body.slots || [])]);
        return sendJson(res, 200, { ok: true });
      }
    }

    // 7. NOTIFICATIONS
    if (pathname === '/api/notifications') {
      if (method === 'GET') {
        if (!await isAuthorizedAdmin(req)) {
          return sendJson(res, 200, []);
        }
        const r = await db.query('SELECT * FROM public.notifications ORDER BY timestamp DESC LIMIT 50');
        return sendJson(res, 200, r.rows.map(row => ({
          id: row.id,
          title: row.title,
          message: row.message,
          type: row.type,
          rideId: row.ride_id,
          read: row.read,
          timestamp: row.timestamp
        })));
      }
      if (method === 'POST') {
        const n = await parseBody(req);
        if (!n.id) n.id = `notif-${Date.now()}`;
        await db.query(`
          INSERT INTO public.notifications (id, title, message, type, ride_id, read, timestamp)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [n.id, n.title, n.message, n.type || 'ride_new', n.rideId || null, Boolean(n.read), n.timestamp || new Date().toISOString()]);
        return sendJson(res, 200, { ok: true, notification: n });
      }
      if (method === 'DELETE') {
        if (!await isAuthorizedAdmin(req)) {
          return sendJson(res, 401, { error: 'Acesso não autorizado.' });
        }
        await db.query('DELETE FROM public.notifications');
        return sendJson(res, 200, { ok: true, cleared: true });
      }
    }

    if (pathname === '/api/notifications/read' && method === 'PATCH') {
      await db.query('UPDATE public.notifications SET read = true WHERE read = false');
      return sendJson(res, 200, { ok: true });
    }

    const notifMatch = pathname.match(/^\/api\/notifications\/([^/]+)$/);
    if (notifMatch && method === 'DELETE') {
      const id = decodeURIComponent(notifMatch[1]);
      await db.query('DELETE FROM public.notifications WHERE id = $1', [id]);
      return sendJson(res, 200, { ok: true, deleted: id });
    }

    const notifReadMatch = pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
    if (notifReadMatch && method === 'PATCH') {
      const id = decodeURIComponent(notifReadMatch[1]);
      const body = await parseBody(req);
      const isRead = body.read !== undefined ? Boolean(body.read) : true;
      await db.query('UPDATE public.notifications SET read = $1 WHERE id = $2', [isRead, id]);
      return sendJson(res, 200, { ok: true, id, read: isRead });
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(`API Error on ${method} ${pathname}:`, err);
    return sendJson(res, 500, { error: err.message });
  }
}

module.exports = {
  handleApiRequest
};
