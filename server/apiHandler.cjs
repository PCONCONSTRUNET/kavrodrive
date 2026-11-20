const crypto = require('crypto');
const db = require('./db.cjs');
const push = require('./push.cjs');
const env = require('./env.cjs');
const finance = require('./financeEngine.cjs');
const stripeGateway = require('./stripeGateway.cjs');
const efiBankGateway = require('./efiBankGateway.cjs');
const kycStorage = require('./kycStorage.cjs');
const driverTermsContract = require('./driverTermsContract.cjs');
const passengerTermsContract = require('./passengerTermsContract.cjs');
const { isValidCpfDigits } = require('./termsSignatureUtils.cjs');
const realtimeHub = require('./realtimeHub.cjs');
const audit = require('./auditEngine.cjs');
const security = require('./securityUtils.cjs');

function getRequestClientIp(req) {
  return (
    String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    '127.0.0.1'
  );
}

const DEFAULT_MASTER_ADMIN_EMAIL = 'appuberadmin@gmail.com';
const ADMIN_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const EPHEMERAL_ADMIN_FALLBACK_KEY = crypto.randomBytes(32).toString('hex');
const adminAuthUserCache = new Map();

function getAllowedMasterAdminEmail() {
  return (process.env.ADMIN_MASTER_EMAIL || DEFAULT_MASTER_ADMIN_EMAIL).trim().toLowerCase();
}

function getAdminSessionSecret() {
  const explicit = String(process.env.ADMIN_SESSION_SECRET || '').trim();
  if (explicit) return explicit;
  const seed = String(process.env.DATABASE_URL || process.env.TURNSTILE_SECRET_KEY || '').trim();
  if (seed) {
    return crypto.createHmac('sha256', seed).update('kavro-master-admin-session-v1').digest('hex');
  }
  return EPHEMERAL_ADMIN_FALLBACK_KEY;
}

function signAdminSessionToken({ sub, id, email }) {
  const payload = {
    sub: String(sub || id || ''),
    email: String(email || '').trim().toLowerCase(),
    iat: Date.now(),
    exp: Date.now() + ADMIN_SESSION_TTL_MS
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getAdminSessionSecret()).update(encoded).digest('base64url');
  return {
    token: `kavro_adm.${encoded}.${sig}`,
    expiresAt: new Date(payload.exp).toISOString()
  };
}

const USER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function signUserRoleToken(role, { id, phone = '', email = '' } = {}) {
  const cleanRole = role === 'driver' ? 'driver' : 'client';
  const prefix = cleanRole === 'driver' ? 'kavro_drv' : 'kavro_cli';
  const payload = {
    sub: String(id || ''),
    role: cleanRole,
    phone: String(phone || '').replace(/\D/g, ''),
    email: String(email || '').trim().toLowerCase(),
    iat: Date.now(),
    exp: Date.now() + USER_SESSION_TTL_MS
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getAdminSessionSecret()).update(`${prefix}.${encoded}`).digest('base64url');
  return `${prefix}.${encoded}.${sig}`;
}

function verifyUserRoleToken(rawToken, expectedRole) {
  const token = String(rawToken || '').trim();
  const prefix = expectedRole === 'driver' ? 'kavro_drv' : 'kavro_cli';
  if (!token.startsWith(`${prefix}.`)) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto.createHmac('sha256', getAdminSessionSecret()).update(`${prefix}.${encoded}`).digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload || !payload.sub || payload.role !== expectedRole || Number(payload.exp || 0) <= Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function verifyDriverToken(req) {
  const authHeader = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  const raw = String(req.headers['x-driver-token'] || (authHeader.startsWith('kavro_drv.') ? authHeader : '')).trim();
  return verifyUserRoleToken(raw, 'driver');
}

function verifyClientToken(req) {
  const authHeader = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  const raw = String(req.headers['x-client-token'] || (authHeader.startsWith('kavro_cli.') ? authHeader : '')).trim();
  return verifyUserRoleToken(raw, 'client');
}

function verifyWebhookSecret(req) {
  const expected = String(process.env.PAYMENT_WEBHOOK_SECRET || '').trim();
  if (!expected) return false;
  const provided = String(req.headers['x-webhook-secret'] || '').trim();
  if (!provided) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyMercadoPagoWebhookSignature(req, dataId) {
  const secret = String(process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim();
  const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  if (!secret) {
    // Em produção/Vercel exige obrigatoriamente MERCADOPAGO_WEBHOOK_SECRET configurado (fail-closed)
    return !isProd;
  }
  const sigHeader = String(req.headers['x-signature'] || '').trim();
  const reqId = String(req.headers['x-request-id'] || '').trim();
  if (!sigHeader) return false;

  const kv = {};
  sigHeader.split(',').forEach(part => {
    const [k, v] = part.split('=').map(s => String(s || '').trim());
    if (k && v) kv[k] = v;
  });
  if (!kv.ts || !kv.v1) return false;

  const manifest = `id:${dataId || ''};request-id:${reqId};ts:${kv.ts};`;
  const expectedHex = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(String(kv.v1).toLowerCase(), 'utf8');
  const b = Buffer.from(expectedHex.toLowerCase(), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyAdminSessionToken(rawToken) {
  const token = String(rawToken || '').trim();
  if (!token.startsWith('kavro_adm.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto.createHmac('sha256', getAdminSessionSecret()).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload || !payload.sub || !payload.email || Number(payload.exp || 0) <= Date.now()) {
      return null;
    }
    const allowedEmail = getAllowedMasterAdminEmail();
    if (String(payload.email).trim().toLowerCase() !== allowedEmail) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

async function verifySupabaseMasterAccountActive(sub, email) {
  const allowedEmail = getAllowedMasterAdminEmail();
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || cleanEmail !== allowedEmail) return false;

  const cacheKey = `${sub}:${cleanEmail}`;
  const cached = adminAuthUserCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.ok;
  }

  try {
    const res = await db.query(
      `SELECT id, email, email_confirmed_at, banned_until, deleted_at
       FROM auth.users
       WHERE id = $1 AND LOWER(email) = $2
       LIMIT 1`,
      [sub, allowedEmail]
    );
    const row = res.rows[0];
    const ok = Boolean(
      row &&
      !row.deleted_at &&
      row.email_confirmed_at &&
      String(row.email || '').trim().toLowerCase() === allowedEmail &&
      (!row.banned_until || new Date(row.banned_until) <= new Date())
    );
    adminAuthUserCache.set(cacheKey, { ok, expiresAt: Date.now() + 30000 });
    return ok;
  } catch (err) {
    console.warn('[AdminAuth] Erro ao verificar conta no Supabase auth.users:', err.message);
    return false;
  }
}

async function verifySupabaseAdminCredentials(rawEmail, rawPassword) {
  const email = String(rawEmail || '').trim().toLowerCase();
  const password = String(rawPassword || '');
  const allowedEmail = getAllowedMasterAdminEmail();

  if (!email || !password) {
    return { ok: false, status: 400, error: 'Informe seu e-mail e senha do Painel Master.' };
  }

  // Regra rígida: nenhum outro e-mail além do administrador exclusivo pode entrar
  if (email !== allowedEmail) {
    return {
      ok: false,
      status: 403,
      error: 'Acesso negado: este e-mail não tem permissão para acessar o Painel Master.'
    };
  }

  // 1. Se SUPABASE_URL + SUPABASE_ANON_KEY estiverem configurados, valida pela REST API oficial do Supabase Auth
  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const supabaseAnonKey = String(process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '').trim();
  if (supabaseUrl && supabaseAnonKey) {
    try {
      const authResp = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey
        },
        body: JSON.stringify({ email, password })
      });
      const authData = await authResp.json().catch(() => ({}));
      const authUser = authData?.user;
      const verifiedEmail = String(authUser?.email || '').trim().toLowerCase();
      if (!authResp.ok || !authUser?.id || verifiedEmail !== allowedEmail) {
        return { ok: false, status: 401, error: 'E-mail ou senha inválidos no Supabase Auth.' };
      }
      return { ok: true, user: { id: authUser.id, email: verifiedEmail } };
    } catch (err) {
      console.warn('[AdminAuth] Fallback para Postgres auth.users:', err.message);
    }
  }

  // 2. Validação direta na tabela oficial auth.users do Supabase PostgreSQL (pgcrypto/bcrypt)
  try {
    const res = await db.query(
      `SELECT id, email, email_confirmed_at, banned_until, deleted_at,
              (encrypted_password IS NOT NULL AND encrypted_password = extensions.crypt($1, encrypted_password)) AS pwd_ok
       FROM auth.users
       WHERE LOWER(email) = $2
       LIMIT 1`,
      [password, allowedEmail]
    );
    const userRow = res.rows[0];
    if (!userRow || userRow.deleted_at || !userRow.pwd_ok) {
      return { ok: false, status: 401, error: 'E-mail ou senha inválidos no Supabase.' };
    }
    if (!userRow.email_confirmed_at) {
      return { ok: false, status: 403, error: 'Confirme este e-mail no Supabase antes de acessar o Painel Master.' };
    }
    if (userRow.banned_until && new Date(userRow.banned_until) > new Date()) {
      return { ok: false, status: 403, error: 'Conta administrativa suspensa no Supabase.' };
    }
    return {
      ok: true,
      user: {
        id: userRow.id,
        email: String(userRow.email).trim().toLowerCase()
      }
    };
  } catch (err) {
    console.error('[AdminAuth] Falha ao validar credenciais no Supabase PostgreSQL:', err.message);
    return { ok: false, status: 500, error: 'Erro ao validar credenciais no Supabase.' };
  }
}

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
    passenger_rating: rideObj.passengerRating ?? null,
    passenger_notes: rideObj.passengerNotes ?? null,
    client_rated_stars: rideObj.clientRatedStars ?? null,
    is_queued_ride: Boolean(rideObj.isQueuedRide),
    queued_for_driver_id: rideObj.queuedForDriverId ?? null,
    declined_driver_ids: Array.isArray(rideObj.declinedDriverIds) ? rideObj.declinedDriverIds : [],
    origin: rideObj.origin || {},
    destination: rideObj.destination || {},
    date: rideObj.date || now.split('T')[0],
    time: rideObj.time || new Date().toTimeString().slice(0, 5),
    passengers: rideObj.passengers !== undefined && rideObj.passengers !== null ? Number(rideObj.passengers) : 1,
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
    commission_fixed: finance.round2(Math.max(0, Number(rideObj.commissionFixed ?? rideObj.appliedFareSnapshot?.commissionFixed ?? 0))),
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
      passenger_rating, passenger_notes, client_rated_stars,
      is_queued_ride, queued_for_driver_id, declined_driver_ids,
      origin, destination, date, time, passengers, has_luggage, category, category_name, applied_fare_snapshot,
      distance_km, duration_min, estimated_price, total_price, paid_amount,
      commission_percent, commission_amount, driver_net_amount,
      payment_method, payment_status, payment_tx_id, pix_qr_code, pix_copy_paste,
      card_id, card_last4, card_brand, status, driver_notes, notes, is_manual_booking, commission_fixed, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,NOW()
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
      passenger_rating = COALESCE(EXCLUDED.passenger_rating, public.rides.passenger_rating),
      passenger_notes = COALESCE(EXCLUDED.passenger_notes, public.rides.passenger_notes),
      client_rated_stars = COALESCE(EXCLUDED.client_rated_stars, public.rides.client_rated_stars),
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
      commission_fixed = EXCLUDED.commission_fixed,
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
      row.passenger_rating, row.passenger_notes, row.client_rated_stars,
      row.is_queued_ride, row.queued_for_driver_id, JSON.stringify(row.declined_driver_ids),
      JSON.stringify(row.origin), JSON.stringify(row.destination), row.date, row.time,
      row.passengers, row.has_luggage, row.category, row.category_name,
      row.applied_fare_snapshot ? JSON.stringify(row.applied_fare_snapshot) : null,
      row.distance_km, row.duration_min,
      row.estimated_price, row.total_price, row.paid_amount,
      row.commission_percent, row.commission_amount, row.driver_net_amount,
      row.payment_method, row.payment_status, row.payment_tx_id, row.pix_qr_code, row.pix_copy_paste,
      row.card_id, row.card_last4, row.card_brand, row.status, row.driver_notes, row.notes,
      row.is_manual_booking, row.commission_fixed
    ]
  );
  return formatRideFromDb(r.rows[0]);
}

async function cancelAwaitingPaymentRidesForClient({
  clientId,
  clientPhone,
  excludeRideId = null,
  reason = 'Cancelada automaticamente pelo passageiro',
  cancelledBy = 'passenger'
}) {
  const cleanClientId = String(clientId || '').trim();
  const cleanPhoneDigits = normalizePhoneDigitsServer(clientPhone);
  if (!cleanClientId && cleanPhoneDigits.length < 8) return [];

  const r = await db.query(
    `SELECT * FROM public.rides
     WHERE ($1 <> '' AND client_id = $1)
        OR ($2 <> '' AND regexp_replace(COALESCE(client_phone, ''), '\\D', '', 'g') = $2)
     ORDER BY created_at DESC LIMIT 80`,
    [cleanClientId, cleanPhoneDigits.length >= 8 ? cleanPhoneDigits : '']
  );

  const staleRides = r.rows
    .map(formatRideFromDb)
    .filter((candidate) => {
      if (candidate.status !== 'aguardando_pagamento') return false;
      if (excludeRideId && candidate.id === excludeRideId) return false;
      const candidatePhoneDigits = normalizePhoneDigitsServer(candidate.clientPhone);
      return (
        (cleanClientId && candidate.clientId && String(candidate.clientId) === cleanClientId) ||
        (cleanPhoneDigits.length >= 8 && candidatePhoneDigits === cleanPhoneDigits)
      );
    });

  const cancelledIds = [];
  for (const staleRide of staleRides) {
    const cancelFinance = await finance.processRideCancellationFinance(staleRide, {
      cancelledBy,
      waiveCancellationFee: true
    });
    const nextSnapshot = {
      ...(staleRide.appliedFareSnapshot || {}),
      cancelledBy,
      cancellationReason: reason
    };
    const savedCancelled = await upsertFullRide({
      ...staleRide,
      status: 'cancelada',
      paymentStatus: cancelFinance.nextPaymentStatus,
      appliedFareSnapshot: nextSnapshot,
      isQueuedRide: false
    });
    await push.handleRideChange(staleRide, savedCancelled);
    realtimeHub.publish(
      'ride:updated',
      { rideId: savedCancelled.id, status: savedCancelled.status },
      { rideId: savedCancelled.id, clientId: savedCancelled.clientId || null, driverId: savedCancelled.driverId || null }
    );
    cancelledIds.push(savedCancelled.id);
  }
  return cancelledIds;
}

async function confirmDigitalRidePaymentAndPublish({ rideId, paidAmountBrl, gatewayTxId, gatewayLabel = 'Gateway' }) {
  const normId = normalizeRideId(rideId);
  const prevRes = await db.query('SELECT * FROM public.rides WHERE id = $1', [normId]);
  if (!prevRes.rows[0]) return { found: false };

  const before = formatRideFromDb(prevRes.rows[0]);
  if (before.paymentStatus === 'confirmado' || before.paymentStatus === 'pago') {
    return { found: true, ok: true, idempotent: true, ride: before };
  }

  const finalVal = paidAmountBrl ? finance.round2(paidAmountBrl) : before.totalPrice;
  const whFixed = finance.resolveCommissionFixedForRide
    ? finance.resolveCommissionFixedForRide(null, before)
    : (before.commissionFixed ?? 0);
  const split = finance.calculateSplit(finalVal, before.commissionPercent ?? 20, whFixed);
  const nextRideStatus = before.status === 'aguardando_pagamento' ? 'aguardando_confirmacao' : before.status;

  const updatedRide = await upsertFullRide({
    ...before,
    totalPrice: finalVal,
    paidAmount: finalVal,
    commissionPercent: split.commissionPercent,
    commissionFixed: split.commissionFixed,
    commissionAmount: split.commissionAmount,
    driverNetAmount: split.driverNetAmount,
    paymentStatus: 'confirmado',
    status: nextRideStatus
  });

  const tx = await finance.getPaymentTxByRide(normId);
  await finance.savePaymentTransaction({
    ...(tx || {}),
    rideId: normId,
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
    gatewayTxId: gatewayTxId || tx?.gatewayTxId || `gw_pix_${normId}`
  });

  if (updatedRide.driverId) {
    await finance.settleDigitalRideToLedger(updatedRide, finalVal);
  }

  await db.query(
    `INSERT INTO public.notifications (id, title, message, type, ride_id, read, timestamp)
     VALUES ($1, $2, $3, 'payment', $4, false, NOW())`,
    [
      `notif-pix-${Date.now()}`,
      `💰 Pagamento Confirmado (${gatewayLabel}): ${updatedRide.rideCode}`,
      `${updatedRide.clientName} pagou R$ ${finalVal.toFixed(2)} (Líquido Motorista: R$ ${split.driverNetAmount.toFixed(2)}). Corrida liberada!`,
      normId
    ]
  ).catch(() => {});

  await push.handleRideChange(before, updatedRide, { source: 'webhook' });
  realtimeHub.publish(
    'ride:updated',
    { rideId: updatedRide.id, status: updatedRide.status, paymentStatus: updatedRide.paymentStatus },
    { rideId: updatedRide.id }
  );

  return { found: true, ok: true, ride: updatedRide, split };
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
      ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS photo TEXT;
      ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS profile_change_request JSONB;
      ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS rating NUMERIC;
      ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS trusted_contacts JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS safety_preferences JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS emergency_contacts JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS account_type VARCHAR(24) DEFAULT 'standard';
      ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS guardian_client_id VARCHAR(120);
      ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS birth_date VARCHAR(20);
      ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(100);
      ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC DEFAULT 0;
      CREATE TABLE IF NOT EXISTS public.family_members (
        id VARCHAR(120) PRIMARY KEY,
        guardian_id VARCHAR(120) NOT NULL,
        guardian_name VARCHAR(160),
        guardian_phone VARCHAR(40),
        teen_client_id VARCHAR(120),
        teen_name VARCHAR(160) NOT NULL,
        teen_phone VARCHAR(40) NOT NULL,
        teen_birth_date VARCHAR(20) NOT NULL,
        teen_age INTEGER NOT NULL,
        status VARCHAR(32) DEFAULT 'convite_enviado',
        invite_token VARCHAR(120) NOT NULL UNIQUE,
        invite_url TEXT NOT NULL,
        terms_accepted BOOLEAN DEFAULT TRUE,
        terms_accepted_at TIMESTAMPTZ DEFAULT NOW(),
        terms_signature JSONB,
        api_dispatch JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
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

function getGoogleClientId() {
  return (
    process.env.GOOGLE_CLIENT_ID ||
    process.env.VITE_GOOGLE_CLIENT_ID ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    ''
  ).trim();
}

async function verifyGoogleCredential({ idToken, accessToken }) {
  const googleClientId = getGoogleClientId();
  if (!googleClientId) {
    return { ok: false, status: 503, error: 'Login com Google não configurado no servidor.' };
  }

  const cleanIdToken = String(idToken || '').trim();
  const cleanAccessToken = String(accessToken || '').trim();

  try {
    if (cleanIdToken) {
      const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(cleanIdToken)}`);
      if (!resp.ok) {
        return { ok: false, status: 401, error: 'Token do Google inválido ou expirado. Tente entrar novamente.' };
      }
      const data = await resp.json();
      const audOk = data && data.aud === googleClientId;
      const verified = data && (data.email_verified === true || data.email_verified === 'true');
      const email = String(data?.email || '').trim().toLowerCase();
      if (!audOk || !verified || !email) {
        return { ok: false, status: 401, error: 'Conta Google não verificada ou não autorizada para este aplicativo.' };
      }
      return {
        ok: true,
        sub: String(data.sub || ''),
        email,
        name: String(data.name || data.given_name || email.split('@')[0]).trim(),
        picture: String(data.picture || '').trim()
      };
    }

    if (cleanAccessToken) {
      const infoResp = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(cleanAccessToken)}`);
      if (!infoResp.ok) {
        return { ok: false, status: 401, error: 'Sessão do Google expirada. Clique em Continuar com o Google novamente.' };
      }
      const info = await infoResp.json();
      const clientMatch = info && (info.aud === googleClientId || info.azp === googleClientId);
      if (!clientMatch || Number(info.expires_in || 0) <= 0) {
        return { ok: false, status: 401, error: 'Token do Google não pertence a este aplicativo.' };
      }

      const profileResp = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${cleanAccessToken}` }
      });
      if (!profileResp.ok) {
        return { ok: false, status: 401, error: 'Não foi possível ler seu perfil do Google. Tente novamente.' };
      }
      const profile = await profileResp.json();
      const verified = profile && (profile.email_verified === true || profile.email_verified === 'true');
      const email = String(profile?.email || info?.email || '').trim().toLowerCase();
      if (!verified || !email) {
        return { ok: false, status: 401, error: 'Sua conta Google precisa estar com e-mail verificado.' };
      }
      return {
        ok: true,
        sub: String(profile.sub || info.sub || ''),
        email,
        name: String(profile.name || profile.given_name || email.split('@')[0]).trim(),
        picture: String(profile.picture || '').trim()
      };
    }

    return { ok: false, status: 400, error: 'Credencial do Google não recebida.' };
  } catch (err) {
    console.warn('[GoogleAuth] Erro ao validar credencial Google:', err.message);
    return { ok: false, status: 502, error: 'Falha ao validar sua conta com o Google. Tente novamente.' };
  }
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

function normalizeSafetyPreferencesServer(raw, existing = {}) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const prev = (existing && typeof existing === 'object') ? existing : {};
  const familySafetyEnabled = src.familySafetyEnabled !== undefined
    ? Boolean(src.familySafetyEnabled)
    : Boolean(prev.familySafetyEnabled);
  const rawPinEnabled = src.boardingPinEnabled !== undefined
    ? Boolean(src.boardingPinEnabled)
    : (prev.boardingPinEnabled !== undefined ? Boolean(prev.boardingPinEnabled) : true);
  const pinCandidate = src.customBoardingPin !== undefined ? src.customBoardingPin : prev.customBoardingPin;
  const cleanPin = String(pinCandidate || '').replace(/\D/g, '').slice(0, 4);
  const guardianName = String(src.familyGuardianName ?? prev.familyGuardianName ?? '').trim();
  const guardianPhone = String(src.familyGuardianPhone ?? prev.familyGuardianPhone ?? '').trim();

  return {
    boardingPinEnabled: familySafetyEnabled ? true : rawPinEnabled,
    ...(/^\d{4}$/.test(cleanPin) ? { customBoardingPin: cleanPin } : {}),
    audioRecordingEnabled: src.audioRecordingEnabled !== undefined
      ? Boolean(src.audioRecordingEnabled)
      : Boolean(prev.audioRecordingEnabled),
    audioAutoRecord: src.audioAutoRecord !== undefined
      ? Boolean(src.audioAutoRecord)
      : Boolean(prev.audioAutoRecord),
    rideCheckEnabled: src.rideCheckEnabled !== undefined
      ? Boolean(src.rideCheckEnabled)
      : (prev.rideCheckEnabled !== undefined ? Boolean(prev.rideCheckEnabled) : true),
    familySafetyEnabled,
    ...(guardianName ? { familyGuardianName: guardianName } : {}),
    ...(guardianPhone ? { familyGuardianPhone: guardianPhone } : {}),
    updatedAt: src.updatedAt || prev.updatedAt || new Date().toISOString()
  };
}

function sanitizeClientRow(row, isAdmin = false) {
  const base = {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email || undefined,
    document: row.document || undefined,
    photo: row.photo || undefined,
    profileChangeRequest: row.profile_change_request || row.profileChangeRequest || undefined,
    blocked: Boolean(row.blocked),
    rating: row.rating !== undefined && row.rating !== null ? Number(row.rating) : null,
    savedAddresses: row.saved_addresses || [],
    trustedContacts: Array.isArray(row.trusted_contacts)
      ? row.trusted_contacts
      : (Array.isArray(row.trustedContacts) ? row.trustedContacts : []),
    emergencyContacts: Array.isArray(row.emergency_contacts)
      ? row.emergency_contacts
      : (Array.isArray(row.emergencyContacts) ? row.emergencyContacts : []),
    safetyPreferences: normalizeSafetyPreferencesServer(row.safety_preferences || row.safetyPreferences),
    accountType: row.account_type || row.accountType || 'standard',
    guardianClientId: row.guardian_client_id || row.guardianClientId || null,
    birthDate: row.birth_date || row.birthDate || undefined,
    termsAcceptedAt: row.terms_accepted_at || undefined,
    termsSignature: row.terms_signature || undefined,
    walletBalance: Number(row.wallet_balance ?? row.walletBalance ?? 0),
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
  const authHeader = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  const tokenHeader = authHeader || String(req.headers['x-admin-pin'] || '').trim();
  if (!tokenHeader) return false;

  const payload = verifyAdminSessionToken(tokenHeader);
  if (!payload) return false;

  return verifySupabaseMasterAccountActive(payload.sub, payload.email);
}

function getAdminActorContext(req) {
  const authHeader = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  const tokenHeader = authHeader || String(req.headers['x-admin-pin'] || '').trim();
  const payload = tokenHeader ? verifyAdminSessionToken(tokenHeader) : null;
  return {
    actorRole: 'admin_master',
    actorId: payload?.sub || 'admin-master',
    actorName: 'Administrador Master',
    actorEmail: payload?.email || getAllowedMasterAdminEmail(),
    ipAddress: getRequestClientIp(req),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 220) || null
  };
}

function readRawBodyBuffer(req) {
  let preParsed;
  try { preParsed = req.body; } catch { preParsed = undefined; }
  if (preParsed !== undefined && preParsed !== null) {
    if (Buffer.isBuffer(preParsed)) return Promise.resolve(preParsed);
    if (typeof preParsed === 'string') return Promise.resolve(Buffer.from(preParsed, 'utf8'));
    return Promise.resolve(Buffer.from(JSON.stringify(preParsed), 'utf8'));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function parseBody(req) {
  let preParsed;
  try { preParsed = req.body; } catch { return {}; }
  if (preParsed !== undefined && preParsed !== null && typeof preParsed !== 'string' && !Buffer.isBuffer(preParsed)) {
    return preParsed;
  }
  const raw = await readRawBodyBuffer(req);
  if (!raw || raw.length === 0) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return {};
  }
}

function sendJson(res, statusCode, data, extraHeaders = {}) {
  const cors = security.buildCorsHeaders(res._req, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    ...extraHeaders
  });
  res.writeHead(statusCode, cors);
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
  const snap = row.applied_fare_snapshot ?? row.appliedFareSnapshot ?? null;
  const commPct = Number(row.commission_percent ?? row.commissionPercent ?? 20);
  const commFixed = Math.max(0, Number(row.commission_fixed ?? row.commissionFixed ?? snap?.commissionFixed ?? 0) || 0);
  const commAmt = row.commission_amount !== undefined
    ? Number(row.commission_amount)
    : finance.round2(Math.min(totalPrice, (totalPrice * (commPct / 100)) + (totalPrice > 0 ? commFixed : 0)));
  const netAmt = row.driver_net_amount !== undefined
    ? Number(row.driver_net_amount)
    : finance.round2(Math.max(0, totalPrice - commAmt));

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
    passengerRating: row.passenger_rating !== undefined && row.passenger_rating !== null ? Number(row.passenger_rating) : null,
    passengerNotes: row.passenger_notes ?? row.passengerNotes ?? null,
    clientRatedStars: row.client_rated_stars !== undefined && row.client_rated_stars !== null ? Number(row.client_rated_stars) : (row.clientRatedStars ?? null),
    clientRating: row.client_rating !== undefined && row.client_rating !== null ? Number(row.client_rating) : (row.clientRating ?? null),
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
    passengers: row.passengers !== undefined && row.passengers !== null ? Number(row.passengers) : 1,
    hasLuggage: Boolean(row.has_luggage ?? row.hasLuggage),
    category: row.category || 'kavro_go',
    categoryName: row.category_name ?? row.categoryName ?? undefined,
    serviceType:
      row.serviceType === 'entregas' ||
      snap?.categoryType === 'entregas' ||
      finance.resolveCategoryTypeServer(row.category || row.categoryName || '') === 'entregas'
        ? 'entregas'
        : 'padrao',
    deliveryDetails: row.deliveryDetails ?? snap?.deliveryDetails ?? null,
    appliedFareSnapshot: row.applied_fare_snapshot ?? row.appliedFareSnapshot ?? undefined,
    rideCheck: (row.applied_fare_snapshot ?? row.appliedFareSnapshot)?.rideCheck || null,
    trustedContactsDispatches: Array.isArray((row.applied_fare_snapshot ?? row.appliedFareSnapshot)?.trustedContactsDispatches)
      ? (row.applied_fare_snapshot ?? row.appliedFareSnapshot).trustedContactsDispatches
      : [],
    safetyAudioRecords: Array.isArray((row.applied_fare_snapshot ?? row.appliedFareSnapshot)?.safetyAudioRecords)
      ? (row.applied_fare_snapshot ?? row.appliedFareSnapshot).safetyAudioRecords
      : [],
    isTeenRide: Boolean((row.applied_fare_snapshot ?? row.appliedFareSnapshot)?.isTeenRide),
    cancellationFeeApplied: (row.applied_fare_snapshot ?? row.appliedFareSnapshot)?.cancellationFeeApplied ?? undefined,
    cancelledBy: (row.applied_fare_snapshot ?? row.appliedFareSnapshot)?.cancelledBy ?? undefined,
    distanceKm: Number(row.distance_km ?? row.distanceKm ?? 0),
    durationMin: Number(row.duration_min ?? row.durationMin ?? 0),
    baseFare: Number(row.base_fare ?? row.baseFare ?? 8),
    estimatedPrice: Number(row.estimated_price ?? row.estimatedPrice ?? totalPrice),
    totalPrice,
    paidAmount: Number(row.paid_amount ?? row.paidAmount ?? 0),
    commissionPercent: commPct,
    commissionFixed: commFixed,
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

function formatWhatsappE164Digits(rawPhone) {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function parseBirthDateAndCalculateAge(rawDate) {
  const clean = String(rawDate || '').trim();
  let day, month, year;
  const brMatch = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (brMatch) {
    day = parseInt(brMatch[1], 10);
    month = parseInt(brMatch[2], 10);
    year = parseInt(brMatch[3], 10);
  } else if (isoMatch) {
    year = parseInt(isoMatch[1], 10);
    month = parseInt(isoMatch[2], 10);
    day = parseInt(isoMatch[3], 10);
  } else {
    return null;
  }

  if (year < 1920 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;

  const now = new Date();
  let age = now.getFullYear() - year;
  const monthDiff = now.getMonth() - (month - 1);
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < day)) {
    age -= 1;
  }
  const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const brDate = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  return { age, isoDate, brDate };
}

async function sendFamilyInviteMessageServer({ guardianName, teenName, teenPhone, fullInviteUrl, inviteToken }) {
  const waDigits = formatWhatsappE164Digits(teenPhone);
  const messageText = `${guardianName} adicionou você à Família Kavro Drive. Agora, sua conta é para adolescentes (12 a 18 anos). Acesse o link rastreável para ativar com segurança: ${fullInviteUrl}`;
  const whatsappUrl = `https://wa.me/${waDigits}?text=${encodeURIComponent(messageText)}`;
  const webhookEndpoint = (process.env.WHATSAPP_API_URL || process.env.OTP_WEBHOOK_URL || '').trim();
  let channel = 'kavro_auto_api_dispatcher';

  if (webhookEndpoint && waDigits) {
    try {
      const resp = await fetch(webhookEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.OTP_WEBHOOK_SECRET ? { 'x-webhook-secret': process.env.OTP_WEBHOOK_SECRET } : {})
        },
        body: JSON.stringify({
          type: 'family_teen_invite',
          inviteToken,
          guardianName,
          teenName,
          teenPhone: waDigits,
          inviteUrl: fullInviteUrl,
          message: messageText
        })
      });
      if (resp.ok) channel = 'whatsapp_webhook_api';
    } catch {
      // fallback interno
    }
  } else {
    console.log(`[Family Invite API Dispatch] to=${teenName} (${waDigits}) token=${inviteToken} url=${fullInviteUrl}`);
  }

  return {
    channel,
    whatsappUrl,
    messageText,
    sentAt: new Date().toISOString()
  };
}

async function activateTeenAccountLink(memberRow, clientRow) {
  if (!memberRow || !clientRow) return null;
  const currentPrefs = normalizeSafetyPreferencesServer(
    clientRow.safety_preferences || clientRow.safetyPreferences
  );
  const lockedPrefs = normalizeSafetyPreferencesServer({
    ...currentPrefs,
    boardingPinEnabled: true,
    rideCheckEnabled: true,
    familySafetyEnabled: true,
    familyGuardianName: memberRow.guardian_name || currentPrefs.familyGuardianName,
    familyGuardianPhone: memberRow.guardian_phone || currentPrefs.familyGuardianPhone
  });

  const updClient = await db.query(
    `UPDATE public.clients
     SET account_type = $1,
         guardian_client_id = $2,
         birth_date = COALESCE($3, birth_date),
         safety_preferences = $4
     WHERE id = $5
     RETURNING *`,
    ['teen', memberRow.guardian_id, memberRow.teen_birth_date || null, JSON.stringify(lockedPrefs), clientRow.id]
  );

  await db.query(
    `UPDATE public.family_members
     SET status = $1, teen_client_id = COALESCE($2, teen_client_id), updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    ['ativo', clientRow.id, memberRow.id]
  );

  return updClient.rows[0] || {
    ...clientRow,
    account_type: 'teen',
    guardian_client_id: memberRow.guardian_id,
    birth_date: memberRow.teen_birth_date,
    safety_preferences: lockedPrefs
  };
}

async function dispatchTrustedContactsForRide(ride, eventType = 'ride_started', reqHost = 'localhost:5173') {
  if (!ride || !ride.id) return [];
  try {
    await ensureClientsSchema();
    let clientRow = null;
    if (ride.clientId) {
      const r = await db.query('SELECT * FROM public.clients WHERE id = $1 LIMIT 1', [ride.clientId]);
      clientRow = r.rows[0] || null;
    }
    if (!clientRow && ride.clientPhone) {
      const cleanPhone = normalizePhoneDigitsServer(ride.clientPhone);
      if (cleanPhone.length >= 10) {
        const r = await db.query(
          `SELECT * FROM public.clients
           WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $1
           LIMIT 1`,
          [cleanPhone]
        );
        clientRow = r.rows[0] || null;
      }
    }

    const trustedContacts = Array.isArray(clientRow?.trusted_contacts)
      ? clientRow.trusted_contacts
      : (Array.isArray(clientRow?.trustedContacts) ? clientRow.trustedContacts : []);
    const emergencyContacts = Array.isArray(clientRow?.emergency_contacts)
      ? clientRow.emergency_contacts
      : (Array.isArray(clientRow?.emergencyContacts) ? clientRow.emergencyContacts : []);
    const safetyPrefs = normalizeSafetyPreferencesServer(
      clientRow?.safety_preferences || clientRow?.safetyPreferences
    );

    const contacts = [...trustedContacts];
    const seenDigits = new Set(
      trustedContacts.map(c => normalizePhoneDigitsServer(c?.phone || '')).filter(Boolean)
    );

    if (safetyPrefs.familySafetyEnabled && safetyPrefs.familyGuardianPhone) {
      const guardianDigits = normalizePhoneDigitsServer(safetyPrefs.familyGuardianPhone);
      if (guardianDigits.length >= 10 && !seenDigits.has(guardianDigits)) {
        seenDigits.add(guardianDigits);
        contacts.push({
          id: 'guardian-family',
          name: safetyPrefs.familyGuardianName || 'Responsável Familiar',
          relationship: 'Responsável',
          phone: safetyPrefs.familyGuardianPhone,
          autoShareAllRides: true,
          autoShareNightOnly: false,
          notifyOnAnomalyOrSos: true
        });
      }
    }

    if (clientRow?.guardian_client_id) {
      try {
        const gRes = await db.query('SELECT * FROM public.clients WHERE id = $1 LIMIT 1', [clientRow.guardian_client_id]);
        const gRow = gRes.rows[0];
        if (gRow?.phone) {
          const gDigits = normalizePhoneDigitsServer(gRow.phone);
          if (gDigits.length >= 10 && !seenDigits.has(gDigits)) {
            seenDigits.add(gDigits);
            contacts.push({
              id: `guardian-${gRow.id}`,
              name: gRow.name || 'Responsável Familiar',
              relationship: 'Responsável Legal',
              phone: gRow.phone,
              autoShareAllRides: true,
              autoShareNightOnly: false,
              notifyOnAnomalyOrSos: true
            });
          }
        }
      } catch {
        // segue fluxo
      }
    }

    if (eventType === 'ridecheck_escalation' || eventType === 'sos_triggered') {
      for (const ec of emergencyContacts) {
        const ecDigits = normalizePhoneDigitsServer(ec?.phone || '');
        if (ecDigits.length >= 10 && !seenDigits.has(ecDigits)) {
          seenDigits.add(ecDigits);
          contacts.push({
            id: ec.id || `ec-${ecDigits}`,
            name: ec.name || 'Contato de Emergência',
            relationship: ec.relationship || 'Emergência',
            phone: ec.phone,
            autoShareAllRides: false,
            autoShareNightOnly: false,
            notifyOnAnomalyOrSos: true
          });
        }
      }
    }

    if (contacts.length === 0) return [];

    // Hora de Brasília (UTC-3) para regras de compartilhamento noturno automático (20h às 06h)
    const brasiliaHour = (new Date().getUTCHours() + 21) % 24;
    const isNight = brasiliaHour >= 20 || brasiliaHour < 6;

    const eligible = contacts.filter((c) => {
      const cleanDigits = String(c?.phone || '').replace(/\D/g, '');
      if (cleanDigits.length < 10) return false;
      if (eventType === 'manual_share') return true;
      if (eventType === 'ridecheck_escalation' || eventType === 'sos_triggered') {
        return c.notifyOnAnomalyOrSos !== false;
      }
      if (c.autoShareAllRides !== false) return true;
      if (c.autoShareNightOnly && isNight) return true;
      return false;
    });

    if (eligible.length === 0) return [];

    const cleanHost = String(reqHost || 'localhost:5173').trim();
    const isLocalHost = cleanHost.includes('localhost') || cleanHost.startsWith('127.0.0.1');
    const protocol = isLocalHost ? 'http' : 'https';
    const trackingToken = security.signTrackingToken('ride', ride.id);
    const trackingPath = `/track/${encodeURIComponent(ride.id)}?t=${encodeURIComponent(trackingToken)}`;
    const fullTrackingUrl = `${protocol}://${cleanHost}${trackingPath}`;

    const webhookEndpoint = (process.env.WHATSAPP_API_URL || process.env.OTP_WEBHOOK_URL || '').trim();
    const headerTitle =
      eventType === 'ridecheck_escalation' || eventType === 'sos_triggered'
        ? '🚨 ALERTA DE SEGURANÇA KAVRO DRIVE'
        : '🛡️ KAVRO SEGURANÇA — VIAGEM EM ANDAMENTO';

    const driverSummary = [
      ride.driverName ? `Motorista: ${ride.driverName}` : null,
      ride.driverVehicle ? `Veículo: ${ride.driverVehicle}${ride.driverCarColor ? ` (${ride.driverCarColor})` : ''}` : null,
      ride.driverPlate ? `Placa Mercosul: ${ride.driverPlate}` : null
    ].filter(Boolean).join('\n');

    const sentAt = new Date().toISOString();
    const newDispatches = [];

    for (const contact of eligible) {
      const waDigits = formatWhatsappE164Digits(contact.phone);
      const passengerDisplay = ride.clientName || clientRow?.name || 'Passageiro(a)';
      const message = [
        headerTitle,
        `${passengerDisplay} compartilhou o trajeto ao vivo com você (${contact.name}).`,
        driverSummary || 'Motorista confirmado pela plataforma.',
        ride.origin?.address ? `Origem: ${ride.origin.address}` : null,
        ride.destination?.address ? `Destino: ${ride.destination.address}` : null,
        `Previsão estimada: ~${ride.durationMin || 8} min`,
        `Acompanhe no mapa ao vivo: ${fullTrackingUrl}`
      ].filter(Boolean).join('\n');

      const whatsappUrl = `https://wa.me/${waDigits}?text=${encodeURIComponent(message)}`;
      let channel = 'kavro_auto_api_dispatcher';
      let apiDelivered = true;

      if (webhookEndpoint) {
        try {
          const resp = await fetch(webhookEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(process.env.OTP_WEBHOOK_SECRET ? { 'x-webhook-secret': process.env.OTP_WEBHOOK_SECRET } : {})
            },
            body: JSON.stringify({
              type: 'trusted_contact_alert',
              event: eventType,
              rideId: ride.id,
              rideCode: ride.rideCode || ride.id,
              contactName: contact.name,
              contactRelationship: contact.relationship || 'Familiar',
              contactPhone: waDigits,
              passengerName: passengerDisplay,
              driverName: ride.driverName || null,
              driverPlate: ride.driverPlate || null,
              driverVehicle: ride.driverVehicle || null,
              driverCarColor: ride.driverCarColor || null,
              etaMinutes: ride.durationMin || 8,
              trackingUrl: fullTrackingUrl,
              message
            })
          });
          channel = resp.ok ? 'whatsapp_webhook_api' : 'kavro_auto_api_dispatcher';
          apiDelivered = resp.ok || true;
        } catch (err) {
          console.warn('[TrustedContacts Webhook] Fallback interno ativado:', err.message);
        }
      } else {
        console.log(`[TrustedContacts API Dispatch] event=${eventType} ride=${ride.id} to=${contact.name} (${waDigits}) url=${trackingPath}`);
      }

      newDispatches.push({
        id: `tcd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone,
        event: eventType,
        trackingUrl: trackingPath,
        whatsappUrl,
        apiDelivered,
        channel,
        sentAt
      });
    }

    const latestRes = await db.query('SELECT applied_fare_snapshot FROM public.rides WHERE id = $1 LIMIT 1', [ride.id]);
    const currentSnapshot =
      (latestRes.rows[0]?.applied_fare_snapshot && typeof latestRes.rows[0].applied_fare_snapshot === 'object'
        ? latestRes.rows[0].applied_fare_snapshot
        : ride.appliedFareSnapshot) || {};
    const prevDispatches = Array.isArray(currentSnapshot.trustedContactsDispatches)
      ? currentSnapshot.trustedContactsDispatches
      : [];
    const mergedSnapshot = {
      ...currentSnapshot,
      trustedContactsDispatches: [...prevDispatches, ...newDispatches].slice(-30)
    };

    await db.query(
      'UPDATE public.rides SET applied_fare_snapshot = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(mergedSnapshot), ride.id]
    );

    await audit.recordAuditEvent({
      category: 'sistema',
      actionKey: `trusted_contacts_${eventType}`,
      title: `Link de segurança enviado automaticamente para ${newDispatches.length} contato(s) de confiança`,
      summary: `Corrida ${ride.rideCode || ride.id} (${eventType}): link ao vivo enviado pela API para ${newDispatches.map(d => d.contactName).join(', ')}.`,
      severity: eventType === 'ridecheck_escalation' || eventType === 'sos_triggered' ? 'critico' : 'info',
      actorRole: 'sistema',
      actorId: 'security-trusted-contacts',
      actorName: 'Guardião Kavro (API)',
      entityType: 'corrida',
      entityId: ride.id,
      entityLabel: ride.rideCode || ride.id,
      relatedIds: { rideId: ride.id, clientId: ride.clientId || null, dispatchCount: newDispatches.length }
    }).catch(() => {});

    realtimeHub.publish(
      'ride:trusted_contacts_notified',
      {
        rideId: ride.id,
        event: eventType,
        dispatches: newDispatches,
        trackingUrl: trackingPath
      },
      { rideId: ride.id, clientId: ride.clientId || null, driverId: ride.driverId || null }
    );

    return newDispatches;
  } catch (err) {
    console.warn('[dispatchTrustedContactsForRide]', err.message);
    return [];
  }
}

const VEHICLE_PHOTO_CACHE = new Map();
const VEHICLE_PHOTO_TTL_MS = 6 * 60 * 60 * 1000;

function extractCleanBaseModel(rawModel) {
  const cleaned = String(rawModel || '')
    .replace(/\b(xei|xli|gli|altis|premier|ltz|lt|ls|rs|highline|comfortline|trendline|sense|intense|zen|iconic|diamond|titanium|sel|se|le|lx|ex|exl|touring|flex|turbo|tfsi|tsi|tgdi|t-gdi|mpi|vvt-?i|cvt|at|mt|4x4|4x2|hev|hybrid|ev|1\.0t?|1\.2|1\.3|1\.4|1\.5|1\.6|1\.8|2\.0)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || String(rawModel || '').trim();
}

function mapPtColorToEnglishTerms(rawColor) {
  const q = String(rawColor || '').toLowerCase();
  if (/prata|silver/.test(q)) return ['silver', 'grey', 'gray'];
  if (/branc|white|perol/.test(q)) return ['white', 'pearl'];
  if (/pret|black|onix/.test(q)) return ['black'];
  if (/cinza|grafite|chumbo|gray|grey/.test(q)) return ['grey', 'gray', 'silver'];
  if (/vermelh|granada|red/.test(q)) return ['red'];
  if (/azul|blue|safira/.test(q)) return ['blue'];
  if (/vinho|bordo|burgundy/.test(q)) return ['red', 'burgundy', 'maroon'];
  if (/marrom|bronze|brown/.test(q)) return ['brown', 'bronze'];
  if (/verde|green/.test(q)) return ['green'];
  return [];
}

function scoreWikimediaVehicleCandidate(page, { baseModel, targetYear, colorTerms }) {
  const title = String(page?.title || '').replace(/^File:/i, '');
  const info = Array.isArray(page?.imageinfo) ? page.imageinfo[0] : null;
  if (!info || !info.thumburl) return null;

  const mime = String(info.mime || '').toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) return null;
  if (Number(info.width || 0) < 420 || Number(info.height || 0) > Number(info.width || 0) * 1.05) {
    return null;
  }

  const lower = title.toLowerCase();
  let score = 50;

  if (/\b(rear|back|tail|interior|cockpit|dashboard|steering|wheel|rim|engine|motor|badge|emblem|logo|emblema|crash|wreck|btcc|rally|racing|race|cup|nascar|toy|scale|model car|diecast|sketch|svg|drawing)\b/.test(lower)) {
    score -= 120;
  }
  if (!/cross/i.test(baseModel) && /\bcross\b/.test(lower)) score -= 85;
  if (!/touring|wagon|fielder|verso|sw\b/i.test(baseModel) && /\b(touring|wagon|fielder|verso)\b/.test(lower)) {
    score -= 85;
  }
  if (!/hatch/i.test(baseModel) && /sedan|plus/i.test(baseModel) && /\bhatch(back)?\b/.test(lower)) {
    score -= 45;
  }

  // Prioriza ano próximo no nome do modelo (ignorando data de upload mm-dd-yyyy)
  const strippedDateTitle = lower.replace(/\b\d{2}-\d{2}-\d{4}\b/g, ' ').replace(/\(\d{4}-\d{2}-\d{2}\)/g, ' ');
  const yearMatches = strippedDateTitle.match(/\b(19\d{2}|20[0-2]\d)\b/g) || [];
  if (targetYear && yearMatches.length > 0) {
    const modelYear = Number(yearMatches[0]);
    const diff = Math.abs(modelYear - targetYear);
    if (diff === 0) score += 45;
    else if (diff <= 2) score += 28;
    else if (diff <= 4) score += 10;
    else score -= 65;
  }

  if (colorTerms.some(term => new RegExp(`\\b${term}\\b`, 'i').test(lower))) {
    score += 38;
  }
  if (/\b(front|three[- ]quarter|3\/4)\b/.test(lower)) score += 16;
  if (/\b(brazil|brasil|mercosul)\b/.test(lower)) score += 14;
  if (/\bsedan\b/.test(lower) && /corolla|civic|virtus|cronos|city|hb20s|plus|versa|sentra/i.test(baseModel)) {
    score += 12;
  }

  return {
    title,
    url: info.thumburl,
    score,
  };
}

async function queryCommonsVehicles(searchQuery) {
  try {
    const u = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(searchQuery)}&gsrlimit=10&prop=imageinfo&iiprop=url|mime|dimensions&iiurlwidth=640&format=json`;
    const res = await fetch(u, {
      headers: { 'User-Agent': 'KavroDrive/1.0 (https://kavrodrive.vercel.app)' },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
    return pages;
  } catch {
    return [];
  }
}

async function resolveVehiclePhotoCached({ brand, model, year, color }) {
  const baseModel = extractCleanBaseModel(model);
  const targetYear = Number(String(year || '').replace(/\D/g, '').slice(0, 4)) || 0;
  const colorTerms = mapPtColorToEnglishTerms(color);
  const cacheKey = `${brand.toLowerCase()}|${baseModel.toLowerCase()}|${targetYear}|${colorTerms[0] || ''}`;

  const cached = VEHICLE_PHOTO_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const brandModel = [brand, baseModel].filter(Boolean).join(' ').trim();
  const queries = [];
  if (brandModel && targetYear && colorTerms[0]) {
    queries.push(`intitle:"${brandModel}" ${targetYear} ${colorTerms[0]}`);
  }
  if (brandModel && targetYear) {
    queries.push(`intitle:"${brandModel}" ${targetYear}`);
  }
  if (brandModel) {
    queries.push(`intitle:"${brandModel}"`);
  }

  const candidateMap = new Map();
  for (const q of queries) {
    const pages = await queryCommonsVehicles(q);
    for (const p of pages) {
      const scored = scoreWikimediaVehicleCandidate(p, { baseModel, targetYear, colorTerms });
      if (scored && scored.score > 15) {
        const existing = candidateMap.get(scored.url);
        if (!existing || scored.score > existing.score) {
          candidateMap.set(scored.url, scored);
        }
      }
    }
    const bestSoFar = Array.from(candidateMap.values()).sort((a, b) => b.score - a.score)[0];
    if (bestSoFar && bestSoFar.score >= 70) break;
  }

  const candidates = Array.from(candidateMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const payload = {
    ok: true,
    brand,
    model: baseModel,
    year: targetYear || year || '',
    color: color || '',
    primaryUrl: candidates[0]?.url || '',
    candidates,
    source: candidates.length > 0 ? 'exact_lookup' : 'studio_fallback',
  };

  VEHICLE_PHOTO_CACHE.set(cacheKey, {
    payload,
    expiresAt: Date.now() + VEHICLE_PHOTO_TTL_MS,
  });

  return payload;
}

function hashOtpCode(code) {
  return crypto.createHash('sha256').update(String(code || '').trim()).digest('hex');
}

function normalizePhoneDigitsServer(raw) {
  return String(raw || '').replace(/\D/g, '');
}

// Cache de curta duração com coalescência de requisições concorrentes (evita tempestade no PostgreSQL em picos de 1000-2000 usuários)
let sysConfigCache = { value: null, expiresAt: 0, inflight: null };
let driversListCache = { value: null, expiresAt: 0, inflight: null };

function invalidateSystemConfigCache() {
  sysConfigCache = { value: null, expiresAt: 0, inflight: null };
}

function invalidateDriversCache() {
  driversListCache = { value: null, expiresAt: 0, inflight: null };
}

async function getCachedSystemConfig() {
  if (!db.pool) {
    const r = await db.query('SELECT config FROM public.system_config WHERE id = $1', ['default']);
    return r.rows[0]?.config || {};
  }
  const now = Date.now();
  if (sysConfigCache.value && now < sysConfigCache.expiresAt) {
    return sysConfigCache.value;
  }
  if (sysConfigCache.inflight) {
    return sysConfigCache.inflight;
  }
  sysConfigCache.inflight = db
    .query('SELECT config FROM public.system_config WHERE id = $1', ['default'])
    .then((r) => {
      const val = r.rows[0]?.config || {};
      sysConfigCache = { value: val, expiresAt: Date.now() + 2000, inflight: null };
      return val;
    })
    .catch((err) => {
      sysConfigCache.inflight = null;
      throw err;
    });
  return sysConfigCache.inflight;
}

async function getCachedDriversList() {
  if (!db.pool) {
    return finance.listDrivers();
  }
  const now = Date.now();
  if (driversListCache.value && now < driversListCache.expiresAt) {
    return driversListCache.value;
  }
  if (driversListCache.inflight) {
    return driversListCache.inflight;
  }
  driversListCache.inflight = finance
    .listDrivers()
    .then((list) => {
      driversListCache = { value: list, expiresAt: Date.now() + 1500, inflight: null };
      return list;
    })
    .catch((err) => {
      driversListCache.inflight = null;
      throw err;
    });
  return driversListCache.inflight;
}

function filterAndSortDriverRidesByRadius(rides, selfDriver, cfg) {
  const maxRadiusKm = Math.max(1, Number(cfg?.maxDispatchRadiusKm || 15));
  const drvLat = Number(selfDriver?.location?.lat || 0);
  const drvLng = Number(selfDriver?.location?.lng || 0);
  const hasDrvGps = Number.isFinite(drvLat) && Number.isFinite(drvLng) && drvLat !== 0 && drvLng !== 0;

  const assigned = [];
  const radar = [];

  for (const ride of rides) {
    if (ride.driverId) {
      if (selfDriver?.id && ride.driverId === selfDriver.id) {
        assigned.push(ride);
      }
      continue;
    }
    if (ride.status === 'aguardando_confirmacao') {
      const oLat = Number(ride.origin?.lat || 0);
      const oLng = Number(ride.origin?.lng || 0);
      if (hasDrvGps && Number.isFinite(oLat) && Number.isFinite(oLng) && oLat !== 0 && oLng !== 0) {
        const distKm = security.haversineDistanceKm(drvLat, drvLng, oLat, oLng);
        if (distKm > maxRadiusKm) {
          continue;
        }
        radar.push({ ...ride, pickupDistanceKm: Number(distKm.toFixed(2)) });
      } else {
        radar.push(ride);
      }
    }
  }

  radar.sort((a, b) => (a.pickupDistanceKm ?? 9999) - (b.pickupDistanceKm ?? 9999));
  return [...assigned, ...radar];
}

async function attachClientRatingsToRides(ridesList) {
  if (!Array.isArray(ridesList) || ridesList.length === 0) return ridesList || [];
  try {
    const missingIds = new Set();
    const missingPhones = new Set();
    for (const r of ridesList) {
      if (r.clientRating !== undefined && r.clientRating !== null && Number(r.clientRating) > 0) {
        continue;
      }
      if (r.clientId) missingIds.add(String(r.clientId));
      const pDigits = normalizePhoneDigitsServer(r.clientPhone);
      if (pDigits.length >= 8) missingPhones.add(pDigits);
    }

    if (missingIds.size === 0 && missingPhones.size === 0) {
      return ridesList;
    }

    let clientRows = [];
    if (db.pool) {
      await ensureClientsSchema();
      const res = await db.query(
        `SELECT id, phone, rating FROM public.clients
         WHERE rating IS NOT NULL AND rating > 0
           AND (id = ANY($1::text[]) OR regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = ANY($2::text[]))`,
        [Array.from(missingIds), Array.from(missingPhones)]
      );
      clientRows = res.rows || [];
    } else {
      clientRows = (db.localStore?.clients || []).filter(c => {
        if (!(Number(c.rating) > 0)) return false;
        const pDigits = normalizePhoneDigitsServer(c.phone);
        return (c.id && missingIds.has(String(c.id))) || (pDigits.length >= 8 && missingPhones.has(pDigits));
      });
    }
    const ratingById = new Map();
    const ratingByPhone = new Map();
    for (const c of clientRows) {
      if (c.rating !== undefined && c.rating !== null && Number(c.rating) > 0) {
        const val = Number(Number(c.rating).toFixed(2));
        if (c.id) ratingById.set(String(c.id), val);
        const digits = normalizePhoneDigitsServer(c.phone);
        if (digits.length >= 8) ratingByPhone.set(digits, val);
      }
    }
    return ridesList.map(r => {
      if (r.clientRating !== undefined && r.clientRating !== null && Number(r.clientRating) > 0) {
        return r;
      }
      const fromId = r.clientId ? ratingById.get(String(r.clientId)) : undefined;
      const phoneDigits = normalizePhoneDigitsServer(r.clientPhone);
      const fromPhone = phoneDigits.length >= 8 ? ratingByPhone.get(phoneDigits) : undefined;
      return {
        ...r,
        clientRating: fromId ?? fromPhone ?? null
      };
    });
  } catch {
    return ridesList;
  }
}

async function dispatchOtpDelivery({ role, user, code }) {
  const channels = [];
  const firstName = String(user?.name || '').trim().split(/\s+/)[0] || 'Usuário';
  const extId = role === 'driver'
    ? push.driverExternalId(user.id, user.phone)
    : push.clientExternalId(user.phone);

  if (extId && process.env.ONESIGNAL_REST_API_KEY) {
    try {
      await push.sendToExternalIds(
        [extId],
        '🔐 Código de recuperação Kavro Drive',
        `Olá ${firstName}, seu código temporário é ${code} (válido por 10 minutos).`,
        { data: { type: 'password_recovery' } }
      );
      channels.push('push');
    } catch {
      // ignore
    }
  }

  const resendKey = String(process.env.RESEND_API_KEY || '').trim();
  if (resendKey && user?.email) {
    try {
      const fromAddr = String(process.env.OTP_EMAIL_FROM || 'Kavro Drive <onboarding@resend.dev>').trim();
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendKey}`
        },
        body: JSON.stringify({
          from: fromAddr,
          to: [user.email],
          subject: 'Código de recuperação de senha — Kavro Drive',
          html: `<p>Olá <strong>${firstName}</strong>,</p><p>Seu código de verificação para redefinir sua senha no Kavro Drive é:</p><h2 style="letter-spacing:4px;">${code}</h2><p>Válido por 10 minutos.</p>`
        })
      });
      if (emailRes.ok) channels.push('email');
    } catch {
      // ignore
    }
  }

  const otpWebhook = String(process.env.OTP_WEBHOOK_URL || '').trim();
  if (otpWebhook) {
    try {
      const wRes = await fetch(otpWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          userId: user.id,
          name: user.name,
          phone: user.phone,
          email: user.email || null,
          code
        })
      });
      if (wRes.ok) channels.push('webhook');
    } catch {
      // ignore
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    console.info(`[OTP Recovery] role=${role} user=${user.id} code=${code}`);
  }

  return channels;
}

async function handleApiRequest(req, res) {
  res._req = req;
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, security.buildCorsHeaders(req));
    return res.end();
  }

  try {
    // 0. HEALTH CHECK & REAL-TIME READINESS
    if (pathname === '/api/health') {
      const dbRes = await db.query('SELECT NOW() as now');
      return sendJson(res, 200, {
        ok: true,
        now: dbRes.rows[0].now,
        storage: db.pool ? 'postgresql' : 'local_json',
        uptimeSeconds: Math.round(process.uptime()),
        realtime: realtimeHub.getStats(),
        services: {
          databaseConfigured: Boolean(db.pool),
          pushConfigured: Boolean(process.env.ONESIGNAL_REST_API_KEY),
          googleAuthConfigured: Boolean(getGoogleClientId()),
          turnstileConfigured: Boolean((process.env.TURNSTILE_SECRET_KEY || '').trim()),
          stripeConfigured: stripeGateway.isStripeEnabled(),
          mercadopagoConfigured: Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MERCADOPAGO_PUBLIC_KEY),
          otpEmailConfigured: Boolean(process.env.RESEND_API_KEY),
          otpWebhookConfigured: Boolean(process.env.OTP_WEBHOOK_URL)
        }
      });
    }

    // 0.0.1 REAL-TIME STREAM (Server-Sent Events Autenticado & Escopado)
    if (pathname === '/api/realtime/stream' && method === 'GET') {
      const qToken = String(url.searchParams.get('token') || '').trim();
      const qRideId = url.searchParams.get('rideId') ? normalizeRideId(url.searchParams.get('rideId')) : '';
      const qSosId = String(url.searchParams.get('sosId') || '').trim();
      const qTrackingToken = String(url.searchParams.get('t') || '').trim();

      let viewerRole = 'anon';
      let userId = null;
      let scopedRideId = '';
      let trackingSosId = null;

      if (await isAuthorizedAdmin(req) || (qToken.startsWith('kavro_adm.') && verifyAdminSessionToken(qToken))) {
        viewerRole = 'admin';
        userId = 'admin-master';
        scopedRideId = qRideId;
      } else {
        const drvSess = verifyDriverToken(req) || (qToken.startsWith('kavro_drv.') ? verifyUserRoleToken(qToken, 'driver') : null);
        if (drvSess?.sub) {
          viewerRole = 'driver';
          userId = drvSess.sub;
          scopedRideId = qRideId;
        } else {
          const cliSess = verifyClientToken(req) || (qToken.startsWith('kavro_cli.') ? verifyUserRoleToken(qToken, 'client') : null);
          if (cliSess?.sub) {
            viewerRole = 'client';
            userId = cliSess.sub;
            if (qRideId) {
              const rChk = await db.query('SELECT client_id, client_phone FROM public.rides WHERE id = $1 LIMIT 1', [qRideId]);
              const rRow = rChk.rows[0];
              const phoneMatch = cliSess.phone && rRow?.client_phone &&
                normalizePhoneDigitsServer(cliSess.phone) === normalizePhoneDigitsServer(rRow.client_phone);
              if (rRow && (rRow.client_id === cliSess.sub || phoneMatch)) {
                scopedRideId = qRideId;
              }
            }
          } else if (qRideId && qTrackingToken && security.verifyTrackingToken(qTrackingToken, 'ride', qRideId)) {
            viewerRole = 'tracking';
            scopedRideId = qRideId;
          } else if (qSosId && qTrackingToken && security.verifyTrackingToken(qTrackingToken, 'sos', qSosId)) {
            viewerRole = 'tracking';
            trackingSosId = qSosId;
          }
        }
      }

      return realtimeHub.handleStreamRequest(req, res, url, {
        viewerRole,
        userId,
        rideId: scopedRideId,
        trackingSosId
      });
    }

    // 0.0.2 RECUPERAÇÃO DE SENHA VIA OTP IN-APP (Passageiro e Motorista)
    if (pathname === '/api/auth/recovery/request' && method === 'POST') {
      await ensureClientsSchema();
      const body = await parseBody(req);
      const role = body.role === 'driver' ? 'driver' : 'client';
      const rawIdentifier = String(body.identifier || '').trim();
      const ip = getRequestClientIp(req);
      const rl = await security.checkRateLimitAsync('otp_req', `${ip}:${rawIdentifier.toLowerCase()}`, 5, 5 * 60 * 1000);
      if (!rl.allowed) {
        return sendJson(res, 429, { ok: false, error: `Muitas solicitações de código. Aguarde ${rl.retryAfterSec}s para tentar novamente.` }, { 'Retry-After': String(rl.retryAfterSec) });
      }
      if (!rawIdentifier) {
        return sendJson(res, 400, { ok: false, error: 'Informe seu WhatsApp, E-mail ou CPF cadastrado.' });
      }

      let user = null;
      if (role === 'driver') {
        user = await finance.findDriverByIdentifier(rawIdentifier);
      } else {
        const isEmail = rawIdentifier.includes('@');
        const cleanEmail = isEmail ? rawIdentifier.toLowerCase() : '';
        const cleanPhone = !isEmail ? normalizePhoneDigitsServer(rawIdentifier) : '';
        const foundRes = await db.query(
          `SELECT * FROM public.clients
           WHERE ($1 <> '' AND LOWER(COALESCE(email, '')) = $1)
              OR ($2 <> '' AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $2)
           LIMIT 1`,
          [cleanEmail, cleanPhone]
        );
        user = foundRes.rows[0] || null;
      }

      if (!user) {
        return sendJson(res, 404, {
          ok: false,
          error: role === 'driver'
            ? 'Nenhuma conta de motorista encontrada para este identificador.'
            : 'Nenhuma conta de passageiro encontrada com este E-mail ou WhatsApp.'
        });
      }

      const code = String(crypto.randomInt(100000, 999999));
      const codeHash = hashOtpCode(code);
      const resetId = `otp-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      await db.query(
        `INSERT INTO public.password_reset_codes (id, role, user_id, identifier, code_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [resetId, role, user.id, rawIdentifier, codeHash, expiresAt]
      );

      const channels = await dispatchOtpDelivery({ role, user, code });
      const canExposeDevPreview =
        !process.env.VERCEL &&
        process.env.NODE_ENV !== 'production' &&
        channels.length === 0;

      const phoneStr = String(user.phone || '').replace(/\D/g, '');
      const maskedPhone = phoneStr.length >= 4 ? `••••-${phoneStr.slice(-4)}` : '';
      const maskedEmail = user.email
        ? String(user.email).replace(/(^.).*(@.*$)/, '$1•••$2')
        : '';

      return sendJson(res, 200, {
        ok: true,
        role,
        expiresInMinutes: 10,
        channels,
        maskedDestination: maskedEmail || maskedPhone || 'conta cadastrada',
        ...(canExposeDevPreview ? { devCode: code } : {})
      });
    }

    if (pathname === '/api/auth/recovery/reset' && method === 'POST') {
      await ensureClientsSchema();
      const body = await parseBody(req);
      const role = body.role === 'driver' ? 'driver' : 'client';
      const rawIdentifier = String(body.identifier || '').trim();
      const code = String(body.code || '').replace(/\D/g, '').trim();
      const newPassword = String(body.newPassword || '');

      if (!rawIdentifier || code.length !== 6) {
        return sendJson(res, 400, { ok: false, error: 'Informe o identificador e o código de 6 dígitos.' });
      }
      if (newPassword.length < 4) {
        return sendJson(res, 400, { ok: false, error: 'A nova senha deve ter pelo menos 4 caracteres.' });
      }

      let user = null;
      if (role === 'driver') {
        user = await finance.findDriverByIdentifier(rawIdentifier);
      } else {
        const isEmail = rawIdentifier.includes('@');
        const cleanEmail = isEmail ? rawIdentifier.toLowerCase() : '';
        const cleanPhone = !isEmail ? normalizePhoneDigitsServer(rawIdentifier) : '';
        const foundRes = await db.query(
          `SELECT * FROM public.clients
           WHERE ($1 <> '' AND LOWER(COALESCE(email, '')) = $1)
              OR ($2 <> '' AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $2)
           LIMIT 1`,
          [cleanEmail, cleanPhone]
        );
        user = foundRes.rows[0] || null;
      }

      if (!user) {
        return sendJson(res, 404, { ok: false, error: 'Conta não encontrada.' });
      }

      const otpRes = await db.query(
        `SELECT * FROM public.password_reset_codes
         WHERE role = $1 AND user_id = $2 AND used_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
        [role, user.id]
      );
      const otpRow = otpRes.rows[0];
      if (!otpRow) {
        return sendJson(res, 400, { ok: false, error: 'Nenhum código ativo encontrado. Solicite um novo código.' });
      }
      if (new Date(otpRow.expires_at).getTime() < Date.now()) {
        return sendJson(res, 400, { ok: false, error: 'Código expirado. Solicite um novo código.' });
      }
      if (Number(otpRow.attempts || 0) >= 5) {
        return sendJson(res, 429, { ok: false, error: 'Limite de tentativas excedido. Solicite um novo código.' });
      }

      const incomingHash = hashOtpCode(code);
      if (incomingHash !== otpRow.code_hash) {
        await db.query('UPDATE public.password_reset_codes SET attempts = attempts + 1 WHERE id = $1', [otpRow.id]);
        return sendJson(res, 401, { ok: false, error: 'Código inválido. Verifique os 6 dígitos informados.' });
      }

      const newPasswordHash = hashPassword(newPassword);
      if (role === 'driver') {
        await db.query('UPDATE public.drivers SET password_hash = $1 WHERE id = $2', [newPasswordHash, user.id]);
      } else {
        await db.query('UPDATE public.clients SET password_hash = $1 WHERE id = $2', [newPasswordHash, user.id]);
      }
      await db.query('UPDATE public.password_reset_codes SET used_at = NOW() WHERE id = $1', [otpRow.id]);

      return sendJson(res, 200, {
        ok: true,
        message: 'Senha redefinida com sucesso! Você já pode entrar com a nova senha.'
      });
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

    // 0.2 PUBLIC AUTH & TURNSTILE CONFIGURATION (apenas chaves públicas)
    if ((pathname === '/api/turnstile-config' || pathname === '/api/auth-config') && method === 'GET') {
      const siteKey = (
        process.env.VITE_TURNSTILE_SITE_KEY ||
        process.env.TURNSTILE_SITE_KEY ||
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
        ''
      ).trim();
      const googleClientId = getGoogleClientId();
      const turnstileEnabled = Boolean((process.env.TURNSTILE_SECRET_KEY || '').trim());
      return sendJson(res, 200, {
        ok: true,
        enabled: turnstileEnabled,
        siteKey,
        turnstileEnabled,
        turnstileSiteKey: siteKey,
        googleEnabled: Boolean(googleClientId),
        googleClientId
      });
    }

    // 0.3 LOGIN E SESSÃO DO PAINEL ADMIN MASTER (Exclusivo Supabase Auth + allowlist estrita)
    if (pathname === '/api/admin/login' && method === 'POST') {
      const rl = await security.checkRateLimitAsync('admin_login', getRequestClientIp(req), 10, 5 * 60 * 1000);
      if (!rl.allowed) {
        return sendJson(res, 429, { ok: false, error: `Muitas tentativas de login. Aguarde ${rl.retryAfterSec}s.` }, { 'Retry-After': String(rl.retryAfterSec) });
      }
      const body = await parseBody(req);
      const turnstile = await verifyTurnstileToken(body.turnstileToken, req.socket?.remoteAddress);
      if (!turnstile.ok) {
        return sendJson(res, 403, { ok: false, error: turnstile.error });
      }
      const check = await verifySupabaseAdminCredentials(body.email, body.password);
      if (!check.ok || !check.user) {
        return sendJson(res, check.status || 401, { ok: false, error: check.error || 'Acesso negado.' });
      }
      const session = signAdminSessionToken(check.user);
      await audit.recordAuditEvent({
        category: 'acessos',
        actionKey: 'admin_login',
        title: 'Acesso ao Painel Master autenticado',
        summary: `Sessão administrativa iniciada por ${check.user.email}.`,
        severity: 'info',
        actorRole: 'admin_master',
        actorId: check.user.id || check.user.sub || 'admin-master',
        actorName: 'Administrador Master',
        actorEmail: check.user.email,
        entityType: 'sessao_admin',
        entityId: String(check.user.id || check.user.email || 'admin-master'),
        entityLabel: check.user.email,
        relatedIds: { adminEmail: check.user.email },
        ipAddress: getRequestClientIp(req),
        userAgent: String(req.headers['user-agent'] || '').slice(0, 220) || null
      });
      return sendJson(res, 200, {
        ok: true,
        token: session.token,
        email: check.user.email,
        expiresAt: session.expiresAt
      });
    }

    if (pathname === '/api/admin/session' && method === 'GET') {
      const ok = await isAuthorizedAdmin(req);
      if (!ok) {
        return sendJson(res, 401, { ok: false, error: 'Sessão administrativa expirada ou não autorizada.' });
      }
      return sendJson(res, 200, {
        ok: true,
        email: getAllowedMasterAdminEmail()
      });
    }

    // 1. SYNC ALL DATA IN 1 FAST CALL
    if (pathname === '/api/sync' && method === 'GET') {
      await ensureClientsSchema();
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      const clientSession = verifyClientToken(req);

      const reqDriverId = String(url.searchParams.get('driverId') || req.headers['x-driver-id'] || '').trim();
      const isAuthedDriver = Boolean(
        driverSession &&
        driverSession.sub &&
        (!reqDriverId || reqDriverId === driverSession.sub)
      );
      const verifiedDriverId = isAuthedDriver ? driverSession.sub : '';

      const reqClientId = String(url.searchParams.get('clientId') || req.headers['x-client-id'] || '').trim();
      const verifiedClientId = isAdmin
        ? reqClientId
        : (clientSession?.sub || '');
      const verifiedClientPhoneDigits = clientSession
        ? String(clientSession.phone || '').replace(/\D/g, '')
        : '';

      const [allDrivers, cachedSysCfg] = await Promise.all([
        getCachedDriversList(),
        getCachedSystemConfig()
      ]);
      const onlineDriversPublic = allDrivers
        .filter(d => d.approvalStatus === 'aprovado' && d.isOnline)
        .map(d => ({
          id: d.id,
          name: (isAdmin || isAuthedDriver || Boolean(clientSession?.sub)) ? d.name : '',
          photo: (isAdmin || isAuthedDriver || Boolean(clientSession?.sub)) ? d.photo : '',
          approvalStatus: 'aprovado',
          isOnline: Boolean(d.isOnline),
          vehicleBrand: d.vehicleBrand,
          vehicleModel: d.vehicleModel,
          vehicleVersion: d.vehicleVersion,
          vehicleYear: d.vehicleYear || '2024',
          vehicleColor: d.vehicleColor,
          vehiclePlate: (isAdmin || isAuthedDriver) ? d.vehiclePlate : '',
          vehicleCategory: d.vehicleCategory,
          eligibleCategories: Array.isArray(d.eligibleCategories) ? d.eligibleCategories : [],
          enabledCategories: Array.isArray(d.enabledCategories) ? d.enabledCategories : [],
          disabledCategoryIds: Array.isArray(d.disabledCategoryIds) ? d.disabledCategoryIds : [],
          approvedCategoryExceptions: Array.isArray(d.approvedCategoryExceptions) ? d.approvedCategoryExceptions : [],
          blockedCategoryIds: Array.isArray(d.blockedCategoryIds) ? d.blockedCategoryIds : [],
          hasFourDoors: d.hasFourDoors !== false,
          hasAirConditioning: d.hasAirConditioning !== false,
          crlvRegular: d.crlvRegular !== false,
          cnhHasEar: d.cnhHasEar !== false,
          hasLargeTrunk: d.hasLargeTrunk,
          hasLeatherSeats: d.hasLeatherSeats,
          acceptsCash: d.acceptsCash !== false,
          city: d.city || '',
          rating: d.rating,
          totalRides: d.totalRides,
          currentRideId: d.currentRideId,
          queuedRideId: d.queuedRideId,
          location: d.location
        }));

      if (isAdmin) {
        const [ridesRes, expRes, cliRes, notifRes, slotsRes] = await Promise.all([
          db.query('SELECT * FROM public.rides ORDER BY date DESC, time DESC LIMIT 500'),
          db.query('SELECT * FROM public.expenses ORDER BY date DESC LIMIT 500'),
          db.query('SELECT * FROM public.clients ORDER BY created_at DESC LIMIT 1000'),
          db.query('SELECT * FROM public.notifications ORDER BY timestamp DESC LIMIT 50'),
          db.query('SELECT date, slots FROM public.blocked_slots')
        ]);

        const blockedSlotsMap = {};
        slotsRes.rows.forEach(r => {
          blockedSlotsMap[r.date] = r.slots || [];
        });

        const adminRidesWithRatings = await attachClientRatingsToRides(ridesRes.rows.map(formatRideFromDb));

        return sendJson(res, 200, {
          config: sanitizePublicConfig(cachedSysCfg, true),
          rides: adminRidesWithRatings,
          drivers: allDrivers,
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
          clients: cliRes.rows.map(r => sanitizeClientRow(r, true)),
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

      if (isAuthedDriver) {
        const [ridesRes, slotsRes] = await Promise.all([
          db.query(
            `SELECT * FROM public.rides
             WHERE driver_id = $1 OR (status = 'aguardando_confirmacao' AND driver_id IS NULL)
             ORDER BY created_at DESC LIMIT 100`,
            [verifiedDriverId]
          ),
          db.query('SELECT date, slots FROM public.blocked_slots')
        ]);

        const blockedSlotsMap = {};
        slotsRes.rows.forEach(r => {
          blockedSlotsMap[r.date] = r.slots || [];
        });

        const selfDriver = allDrivers.find(d => d.id === verifiedDriverId);
        const formattedRides = await attachClientRatingsToRides(ridesRes.rows.map(formatRideFromDb));
        const driverScopedRides = filterAndSortDriverRidesByRadius(formattedRides, selfDriver, cachedSysCfg)
          .map(r => security.sanitizeRideForViewer(r, { isDriver: true }));
        const driversPayload = selfDriver
          ? [selfDriver, ...onlineDriversPublic.filter(d => d.id !== verifiedDriverId)]
          : onlineDriversPublic;

        return sendJson(res, 200, {
          config: sanitizePublicConfig(cachedSysCfg, false),
          rides: driverScopedRides,
          drivers: driversPayload,
          onlineDriversCount: onlineDriversPublic.length,
          expenses: [],
          clients: [],
          notifications: [],
          blockedSlots: blockedSlotsMap
        });
      }

      const selfClientPromise = (verifiedClientId || verifiedClientPhoneDigits.length >= 8)
        ? db.query(
            `SELECT * FROM public.clients
             WHERE ($1 <> '' AND id = $1)
                OR ($2 <> '' AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $2)
             LIMIT 1`,
            [verifiedClientId, verifiedClientPhoneDigits]
          )
        : Promise.resolve({ rows: [] });

      const [ridesRes, slotsRes, selfCliRes] = await Promise.all([
        (verifiedClientId || verifiedClientPhoneDigits.length >= 8)
          ? db.query(
              `SELECT * FROM public.rides
               WHERE ($1 <> '' AND client_id = $1)
                  OR ($2 <> '' AND regexp_replace(COALESCE(client_phone, ''), '\\D', '', 'g') = $2)
               ORDER BY created_at DESC LIMIT 80`,
              [verifiedClientId, verifiedClientPhoneDigits]
            )
          : Promise.resolve({ rows: [] }),
        db.query('SELECT date, slots FROM public.blocked_slots'),
        selfClientPromise
      ]);

      const blockedSlotsMap = {};
      slotsRes.rows.forEach(r => {
        blockedSlotsMap[r.date] = r.slots || [];
      });

      const rawClientRides = ridesRes.rows.map(formatRideFromDb).filter(ride => {
        const ridePhoneDigits = normalizePhoneDigitsServer(ride.clientPhone);
        return (
          (verifiedClientId && ride.clientId && String(verifiedClientId) === String(ride.clientId)) ||
          (verifiedClientPhoneDigits.length >= 8 && ridePhoneDigits === verifiedClientPhoneDigits)
        );
      });
      const publicRidesWithRatings = await attachClientRatingsToRides(rawClientRides);

      return sendJson(res, 200, {
        config: sanitizePublicConfig(cachedSysCfg, false),
        rides: publicRidesWithRatings.map(r => security.sanitizeRideForViewer(r, { isOwnerClient: true })),
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
        const beforeRes = await db.query('SELECT config FROM public.system_config WHERE id = $1', ['default']);
        const beforeCfg = beforeRes.rows[0]?.config || {};
        await db.query(`
          INSERT INTO public.system_config (id, config, updated_at)
          VALUES ('default', $1, NOW())
          ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW();
        `, [JSON.stringify(body)]);

        const changes = audit.buildConfigChangesDiff(beforeCfg, body);
        if (changes.length > 0) {
          const hasFeeChange = changes.some(c => audit.FEE_FIELDS.has(c.field));
          const hasCatChange = changes.some(c => String(c.field).startsWith('rideCategories.'));
          const category = hasFeeChange ? 'taxas_financeiras' : (hasCatChange ? 'categorias' : 'tarifas_regras');
          const previewText = changes.slice(0, 3).map(c => c.summary).join(' • ');
          const actor = getAdminActorContext(req);
          await audit.recordAuditEvent({
            ...actor,
            category,
            actionKey: 'system_config_updated',
            title: hasFeeChange
              ? 'Alteração de Taxas Financeiras & Regras de Cobrança'
              : hasCatChange
                ? 'Alteração de Categorias e Comissões de Corrida'
                : 'Alteração de Tarifas & Configurações Operacionais',
            summary: `${changes.length} campo(s) alterado(s): ${previewText}${changes.length > 3 ? ` (+${changes.length - 3})` : ''}`,
            severity: hasFeeChange ? 'atencao' : 'info',
            entityType: 'configuracao_sistema',
            entityId: 'system_config:default',
            entityLabel: body.companyName || 'Kavro Drive',
            relatedIds: { configId: 'default' },
            changes,
            snapshotBefore: beforeCfg,
            snapshotAfter: body
          });
        }

        realtimeHub.publish('config:updated', { updatedAt: new Date().toISOString() });
        invalidateSystemConfigCache();
        return sendJson(res, 200, { ok: true, config: body });
      }
    }

    // 2.1 AUDITORIA PÚBLICA MULTI-MOTORISTA (DADOS SANITIZADOS LGPD)
    if (pathname === '/api/public/audit' && method === 'GET') {
      const [cfgRes, allDrivers, ridesRes] = await Promise.all([
        db.query('SELECT config FROM public.system_config WHERE id = $1', ['default']),
        finance.listDrivers(),
        db.query('SELECT * FROM public.rides ORDER BY date DESC, time DESC')
      ]);

      const cfg = sanitizePublicConfig(cfgRes.rows[0]?.config || {}, false) || {};
      const allFormattedRides = ridesRes.rows.map(formatRideFromDb);
      const completedRides = allFormattedRides.filter(r => r.status === 'finalizada');
      const registeredCount = allFormattedRides.filter(r => r.status !== 'cancelada').length;

      const driverStatsMap = new Map();
      completedRides.forEach((r) => {
        if (!r.driverId) return;
        const prev = driverStatsMap.get(r.driverId) || { rides: 0, km: 0, passengers: 0 };
        prev.rides += 1;
        prev.km += Number(r.distanceKm) || 0;
        prev.passengers += Number(r.passengers) || 1;
        driverStatsMap.set(r.driverId, prev);
      });

      const approvedDrivers = allDrivers
        .filter(d => d.approvalStatus === 'aprovado')
        .map(d => {
          const st = driverStatsMap.get(d.id) || { rides: 0, km: 0, passengers: 0 };
          const kycOk = Boolean(d.kyc && (d.kyc.status === 'aprovado' || d.kyc.verified));
          const termsOk = Boolean(d.termsSignature && d.termsSignature.acceptedAt);
          return {
            id: d.id,
            name: d.name || 'Motorista Parceiro',
            photo: d.photo || '',
            city: d.city || cfg.driverCarCity || '',
            bio: d.bio || '',
            vehicleBrand: d.vehicleBrand || '',
            vehicleModel: d.vehicleModel || '',
            vehicleVersion: d.vehicleVersion || '',
            vehicleYear: d.vehicleYear || '',
            vehicleColor: d.vehicleColor || '',
            vehiclePlate: d.vehiclePlate || '',
            vehicleCategory: d.vehicleCategory || 'kavro_go',
            vehiclePhoto: d.vehiclePhoto || '',
            eligibleCategories: Array.isArray(d.eligibleCategories) ? d.eligibleCategories : [],
            enabledCategories: Array.isArray(d.enabledCategories) ? d.enabledCategories : [],
            hasAirConditioning: d.hasAirConditioning !== false,
            hasFourDoors: d.hasFourDoors !== false,
            isOnline: Boolean(d.isOnline),
            rating: Number(d.rating || 5.0),
            kycVerified: kycOk,
            termsAccepted: termsOk,
            termsSignatureCode: d.termsSignature?.signatureCode || '',
            completedRidesCount: Math.max(st.rides, Number(d.totalRides || 0)),
            auditedRidesCount: st.rides,
            auditedKm: Number(st.km.toFixed(1)),
            passengersServed: st.passengers,
            createdAt: d.createdAt,
          };
        });

      const driverById = new Map(approvedDrivers.map(d => [d.id, d]));

      const maskClientName = (fullName) => {
        const s = String(fullName || '').trim();
        if (!s) return 'Passageiro Verificado';
        const parts = s.split(/\s+/);
        if (parts.length === 1) return `${parts[0].slice(0, 3)}•••`;
        return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}. •••`;
      };

      const publicRides = completedRides.slice(0, 200).map((r) => {
        const drv = r.driverId ? driverById.get(r.driverId) : null;
        return {
          id: r.id,
          rideCode: r.rideCode,
          date: r.date,
          time: r.time,
          originAddress: r.origin?.address || 'Origem registrada',
          destinationAddress: r.destination?.address || 'Destino registrado',
          distanceKm: Number(r.distanceKm || 0),
          passengers: Number(r.passengers || 1),
          category: r.category,
          categoryName: r.categoryName || r.category,
          paymentMethod: r.paymentMethod || 'pix',
          paymentStatus: r.paymentStatus || 'confirmado',
          driverId: r.driverId || '',
          driverName: r.driverName || drv?.name || 'Motorista Verificado',
          driverVehicle:
            r.driverVehicle ||
            [drv?.vehicleBrand, drv?.vehicleModel, drv?.vehicleYear].filter(Boolean).join(' ') ||
            'Veículo Verificado',
          driverPlate: r.driverPlate || drv?.vehiclePlate || '',
          passengerMasked: maskClientName(r.clientName),
        };
      });

      const totalKm = completedRides.reduce((acc, r) => acc + (Number(r.distanceKm) || 0), 0);
      const totalPassengers = completedRides.reduce((acc, r) => acc + (Number(r.passengers) || 1), 0);
      const avgRating = approvedDrivers.length > 0
        ? Number((approvedDrivers.reduce((acc, d) => acc + (d.rating || 5), 0) / approvedDrivers.length).toFixed(2))
        : 5.0;

      return sendJson(res, 200, {
        ok: true,
        summary: {
          city: cfg.driverCarCity || 'Operação Regional',
          totalApprovedDrivers: approvedDrivers.length,
          onlineDrivers: approvedDrivers.filter(d => d.isOnline).length,
          totalCompletedRides: completedRides.length,
          totalRegisteredRides: registeredCount,
          totalKm: Number(totalKm.toFixed(1)),
          totalPassengers,
          avgRating,
        },
        drivers: approvedDrivers,
        rides: publicRides,
      });
    }

    // 2.2 IDENTIFICAÇÃO & BUSCA DE FOTO EXATA DO VEÍCULO (MARCA + MODELO + ANO + COR)
    if (pathname === '/api/vehicles/photo' && method === 'GET') {
      const brand = String(url.searchParams.get('brand') || '').trim();
      const model = String(url.searchParams.get('model') || '').trim();
      const year = String(url.searchParams.get('year') || '').trim();
      const color = String(url.searchParams.get('color') || '').trim();

      if (!brand && !model) {
        return sendJson(res, 400, { ok: false, error: 'Informe marca ou modelo do veículo.' });
      }

      const result = await resolveVehiclePhotoCached({ brand, model, year, color });
      return sendJson(res, 200, result);
    }

    // ============================================================
    // 2.5 MOTORISTAS (CADASTRO ESTILO UBER, LOGIN, ONLINE/OFFLINE, CARTEIRA)
    // ============================================================
    if (pathname === '/api/drivers/register' && method === 'POST') {
      const rl = await security.checkRateLimitAsync('drv_reg', getRequestClientIp(req), 10, 10 * 60 * 1000);
      if (!rl.allowed) {
        return sendJson(res, 429, { ok: false, error: `Muitas tentativas de cadastro. Aguarde ${rl.retryAfterSec}s.` }, { 'Retry-After': String(rl.retryAfterSec) });
      }
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

      const cleanEmailReg = String(body.email || '').trim().toLowerCase();
      const existing =
        await finance.findDriverByIdentifier(cleanPhone) ||
        await finance.findDriverByIdentifier(document) ||
        (cleanEmailReg ? await finance.findDriverByIdentifier(cleanEmailReg) : null);
      const targetId = `drv-${Date.now()}`;

      if (existing) {
        return sendJson(res, 409, {
          ok: false,
          error: 'Já existe um motorista cadastrado com este CPF, WhatsApp ou E-mail. Faça login na aba Entrar ou recupere sua senha.'
        });
      }

      const photoUrl = body.photo ? await kycStorage.savePublicMedia(targetId, 'avatar', body.photo) : '';
      let vehiclePhotoUrl = body.vehiclePhoto ? await kycStorage.savePublicMedia(targetId, 'vehicle', body.vehiclePhoto) : '';
      if (!vehiclePhotoUrl && (vehicleBrand || vehicleModel)) {
        try {
          const resolvedVehicle = await resolveVehiclePhotoCached({
            brand: vehicleBrand,
            model: vehicleModel,
            year: vehicleYear,
            color: vehicleColor || 'Prata',
          });
          if (resolvedVehicle?.primaryUrl) {
            vehiclePhotoUrl = resolvedVehicle.primaryUrl;
          }
        } catch {
          // Non-fatal: fallback rendering handles missing photoUrl cleanly
        }
      }

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

      return sendJson(res, 200, {
        ok: true,
        driver: saved,
        driverToken: signUserRoleToken('driver', saved)
      });
    }

    if (pathname === '/api/drivers/check' && method === 'POST') {
      const rl = await security.checkRateLimitAsync('drv_chk', getRequestClientIp(req), 25, 5 * 60 * 1000);
      if (!rl.allowed) {
        return sendJson(res, 429, { ok: false, error: `Muitas consultas. Aguarde ${rl.retryAfterSec}s.` }, { 'Retry-After': String(rl.retryAfterSec) });
      }
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
            signedAtBrasilia: rawTermsSig.signedAtBrasilia
          }
        : null;

      return sendJson(res, 200, {
        ok: true,
        found: true,
        driver: {
          id: src.id,
          name: firstName,
          firstName,
          document: '',
          phone: '',
          email: '',
          approvalStatus: src.approvalStatus || 'pendente_aprovacao',
          rejectionReason: src.rejectionReason || null,
          vehicleBrand: src.vehicleBrand || '',
          vehicleModel: src.vehicleModel || '',
          vehiclePlate: '',
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
      const rl = await security.checkRateLimitAsync('drv_login', getRequestClientIp(req), 15, 5 * 60 * 1000);
      if (!rl.allowed) {
        return sendJson(res, 429, { ok: false, error: `Muitas tentativas de login. Aguarde ${rl.retryAfterSec}s.` }, { 'Retry-After': String(rl.retryAfterSec) });
      }
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
      return sendJson(res, 200, {
        ok: true,
        driver: formatted,
        wallet,
        driverToken: signUserRoleToken('driver', formatted || row)
      });
    }

    if (pathname === '/api/drivers' && method === 'GET') {
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { ok: false, error: 'Acesso restrito ao Administrador Master.' });
      }
      const list = await finance.listDrivers();
      return sendJson(res, 200, { ok: true, drivers: list });
    }

    const driverWalletMatch = pathname.match(/^\/api\/drivers\/([^/]+)\/wallet$/);
    if (driverWalletMatch && method === 'GET') {
      const driverId = decodeURIComponent(driverWalletMatch[1]);
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      if (!isAdmin && (!driverSession || driverSession.sub !== driverId)) {
        return sendJson(res, 401, { ok: false, error: 'Sessão de motorista inválida ou expirada.' });
      }
      const wallet = await finance.getDriverWallet(driverId);
      return sendJson(res, 200, { ok: true, wallet });
    }

    const driverWithdrawMatch = pathname.match(/^\/api\/drivers\/([^/]+)\/withdrawals$/);
    if (driverWithdrawMatch && method === 'POST') {
      const driverId = decodeURIComponent(driverWithdrawMatch[1]);
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      if (!isAdmin && (!driverSession || driverSession.sub !== driverId)) {
        return sendJson(res, 401, { ok: false, error: 'Sessão de motorista inválida ou expirada.' });
      }
      const body = await parseBody(req);
      try {
        const wd = await finance.requestWithdrawal({
          driverId,
          amount: body.amount,
          pixKey: body.pixKey,
          pixType: body.pixType
        });
        const wallet = await finance.getDriverWallet(driverId);
        await audit.recordAuditEvent({
          category: 'saques_repasses',
          actionKey: 'withdrawal_requested',
          title: 'Solicitação de saque PIX registrada',
          summary: `Motorista ${wallet?.driverName || driverId} solicitou saque de ${audit.formatMoneyPt(wd.amount)} (taxa ${audit.formatMoneyPt(wd.feeAmount || 0)}, líquido ${audit.formatMoneyPt(wd.netPayoutAmount ?? wd.amount)}).`,
          severity: 'info',
          actorRole: isAdmin ? 'admin_master' : 'motorista',
          actorId: isAdmin ? getAdminActorContext(req).actorId : driverId,
          actorName: isAdmin ? 'Administrador Master' : (wallet?.driverName || driverId),
          entityType: 'saque',
          entityId: wd.id,
          entityLabel: `${wallet?.driverName || driverId} • ${audit.formatMoneyPt(wd.netPayoutAmount ?? wd.amount)}`,
          relatedIds: { withdrawalId: wd.id, driverId, pixKey: wd.pixKey },
          changes: [
            { field: 'amount', label: 'Valor Bruto Solicitado', before: 'R$ 0,00', after: audit.formatMoneyPt(wd.amount), summary: `Bruto: ${audit.formatMoneyPt(wd.amount)}` },
            { field: 'feeAmount', label: 'Taxa de Transferência', before: 'R$ 0,00', after: audit.formatMoneyPt(wd.feeAmount || 0), summary: `Taxa: ${audit.formatMoneyPt(wd.feeAmount || 0)}` },
            { field: 'netPayoutAmount', label: 'Valor Líquido a Repassar', before: 'R$ 0,00', after: audit.formatMoneyPt(wd.netPayoutAmount ?? wd.amount), summary: `Líquido: ${audit.formatMoneyPt(wd.netPayoutAmount ?? wd.amount)}` }
          ],
          ipAddress: getRequestClientIp(req),
          userAgent: String(req.headers['user-agent'] || '').slice(0, 220) || null
        });
        return sendJson(res, 200, { ok: true, withdrawal: wd, wallet });
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message });
      }
    }

    const driverDebtPixMatch = pathname.match(/^\/api\/drivers\/([^/]+)\/debt\/pix$/);
    if (driverDebtPixMatch && method === 'POST') {
      const driverId = decodeURIComponent(driverDebtPixMatch[1]);
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      if (!isAdmin && (!driverSession || driverSession.sub !== driverId)) {
        return sendJson(res, 401, { ok: false, error: 'Sessão de motorista inválida ou expirada.' });
      }
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
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      if (!isAdmin && (!driverSession || driverSession.sub !== driverId)) {
        return sendJson(res, 401, { ok: false, error: 'Sessão de motorista inválida ou expirada.' });
      }
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
      invalidateDriversCache();
      realtimeHub.publish('driver:updated', {
        driverId: updated.id,
        isOnline: updated.isOnline,
        location: updated.location
      });
      return sendJson(res, 200, { ok: true, driver: updated });
    }

    const driverLocMatch = pathname.match(/^\/api\/drivers\/([^/]+)\/location$/);
    if (driverLocMatch && (method === 'PATCH' || method === 'POST')) {
      const driverId = decodeURIComponent(driverLocMatch[1]);
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      if (!isAdmin && (!driverSession || driverSession.sub !== driverId)) {
        return sendJson(res, 401, { ok: false, error: 'Sessão de motorista inválida ou expirada.' });
      }
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
      invalidateDriversCache();
      realtimeHub.publish('driver:updated', {
        driverId: updated.id,
        isOnline: updated.isOnline,
        location: updated.location
      });
      return sendJson(res, 200, { ok: true, driver: updated });
    }

    const driverSingleMatch = pathname.match(/^\/api\/drivers\/([^/]+)$/);
    if (driverSingleMatch) {
      const driverId = decodeURIComponent(driverSingleMatch[1]);
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      if (!isAdmin && (!driverSession || driverSession.sub !== driverId)) {
        return sendJson(res, 401, { ok: false, error: 'Sessão de motorista inválida ou expirada.' });
      }
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

        const ALLOWED_DRIVER_SELF_FIELDS = new Set([
          'photo', 'vehiclePhoto', 'bio', 'enabledCategories', 'disabledCategoryIds', 'pendingCategoryRequests',
          'pixKey', 'pixType', 'pixKeys', 'bankName', 'bankAgency', 'bankAccount', 'efiAccountId',
          'autoPayoutWeekly', 'acceptsCash'
        ]);
        const nextUpdates = {};
        for (const [k, v] of Object.entries(body || {})) {
          if (isAdmin || ALLOWED_DRIVER_SELF_FIELDS.has(k)) {
            nextUpdates[k] = v;
          }
        }
        try {
          if (Array.isArray(nextUpdates.pixKeys)) {
            const normalizedKeys = finance.validateAndNormalizeDriverPixKeys(
              nextUpdates.pixKeys,
              existing,
              { strict: true }
            );
            nextUpdates.pixKeys = normalizedKeys;
            const defaultKey = normalizedKeys.find(k => k.isDefault) || normalizedKeys[0];
            nextUpdates.pixKey = defaultKey ? defaultKey.pixKey : '';
            nextUpdates.pixType = defaultKey ? defaultKey.pixType : (existing.pixType || 'cpf');
            nextUpdates.bankName = defaultKey ? (defaultKey.bankName || '') : '';
          } else if (nextUpdates.pixKey !== undefined || nextUpdates.pixType !== undefined) {
            const singleType = String(nextUpdates.pixType ?? existing.pixType ?? 'cpf').toLowerCase();
            const singleKey = String(nextUpdates.pixKey ?? existing.pixKey ?? '').trim();
            if (singleKey && singleType === 'cpf' && existing.document) {
              if (singleKey.replace(/\D/g, '') !== String(existing.document).replace(/\D/g, '')) {
                return sendJson(res, 400, {
                  ok: false,
                  error: 'Chave PIX do tipo CPF deve ser idêntica ao CPF do motorista titular (mesma titularidade).'
                });
              }
            }
          }
        } catch (err) {
          return sendJson(res, 400, { ok: false, error: err.message });
        }
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
          approvalStatus: isAdmin ? (nextUpdates.approvalStatus || existing.approvalStatus) : existing.approvalStatus
        });
        invalidateDriversCache();
        realtimeHub.publish('driver:updated', {
          driverId: updated.id,
          isOnline: updated.isOnline,
          enabledCategories: updated.enabledCategories,
          disabledCategoryIds: updated.disabledCategoryIds
        });
        return sendJson(res, 200, { ok: true, driver: updated });
      }
    }

    const driverPcrMatch = pathname.match(/^\/api\/drivers\/([^/]+)\/profile-change-request$/);
    if (driverPcrMatch && method === 'POST') {
      const driverId = decodeURIComponent(driverPcrMatch[1]);
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      if (!isAdmin && (!driverSession || driverSession.sub !== driverId)) {
        return sendJson(res, 401, { ok: false, error: 'Sessão de motorista inválida ou expirada.' });
      }
      const driver = await finance.getDriverById(driverId);
      if (!driver) return sendJson(res, 404, { ok: false, error: 'Motorista não encontrado.' });

      const body = await parseBody(req);
      const requestedFields = {};
      const previousValues = {};

      if (body.name !== undefined && String(body.name).trim() && String(body.name).trim() !== String(driver.name || '').trim()) {
        requestedFields.name = String(body.name).trim();
        previousValues.name = driver.name || '';
      }
      if (body.phone !== undefined) {
        const cleanNew = String(body.phone).replace(/\D/g, '');
        const cleanOld = String(driver.phone || '').replace(/\D/g, '');
        if (cleanNew.length >= 10 && cleanNew !== cleanOld) {
          requestedFields.phone = String(body.phone).trim();
          previousValues.phone = driver.phone || '';
        }
      }
      if (body.email !== undefined) {
        const cleanNewEmail = String(body.email).trim().toLowerCase();
        const cleanOldEmail = String(driver.email || '').trim().toLowerCase();
        if (cleanNewEmail !== cleanOldEmail) {
          requestedFields.email = cleanNewEmail;
          previousValues.email = driver.email || '';
        }
      }
      if (body.city !== undefined && String(body.city).trim() !== String(driver.city || '').trim()) {
        requestedFields.city = String(body.city).trim();
        previousValues.city = driver.city || '';
      }

      if (Object.keys(requestedFields).length === 0) {
        return sendJson(res, 400, { ok: false, error: 'Nenhuma alteração de nome, telefone, e-mail ou cidade foi informada.' });
      }

      const now = new Date().toISOString();
      const profileChangeRequest = {
        id: `pcr-${Date.now()}`,
        requestedFields,
        previousValues,
        status: 'pendente',
        requestedAt: now
      };

      const updated = await finance.saveDriverRecord({
        ...driver,
        profileChangeRequest
      });

      const changedSummary = Object.keys(requestedFields).join(', ');
      await db.query(
        `INSERT INTO public.notifications (id, title, message, type, read, timestamp)
         VALUES ($1, $2, $3, 'profile_change_request', false, NOW())`,
        [
          `notif-pcr-drv-${Date.now()}`,
          `✏️ Alteração Cadastral (Motorista): ${driver.name}`,
          `Campos solicitados (${changedSummary}) aguardam aprovação na aba Motoristas.`
        ]
      ).catch(() => {});

      return sendJson(res, 200, { ok: true, driver: updated, profileChangeRequest });
    }

    // ===== MULTI-VEÍCULOS DO MOTORISTA + CRLV PARA ANÁLISE MASTER =====
    const driverVehiclesListMatch = pathname.match(/^\/api\/drivers\/([^/]+)\/vehicles$/);
    if (driverVehiclesListMatch && method === 'POST') {
      const driverId = decodeURIComponent(driverVehiclesListMatch[1]);
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      if (!isAdmin && (!driverSession || driverSession.sub !== driverId)) {
        return sendJson(res, 401, { ok: false, error: 'Sessão de motorista inválida ou expirada.' });
      }
      const driver = await finance.getDriverById(driverId);
      if (!driver) return sendJson(res, 404, { ok: false, error: 'Motorista não encontrado.' });

      const body = await parseBody(req);
      const brand = String(body.brand || '').trim();
      const model = String(body.model || '').trim();
      const version = String(body.version || '').trim();
      const color = String(body.color || 'Prata').trim();
      const year = String(body.year || '2024').replace(/\D/g, '').slice(0, 4) || '2024';
      const plate = String(body.plate || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
      const crlvNumber = String(body.crlvNumber || '').trim();
      const crlvDocumentPhotoRaw = String(body.crlvDocumentPhoto || '').trim();

      if (!brand || !model || plate.length < 7) {
        return sendJson(res, 400, { ok: false, error: 'Informe marca, modelo e placa Mercosul válida (7 caracteres).' });
      }
      if (!crlvNumber || !crlvDocumentPhotoRaw) {
        return sendJson(res, 400, { ok: false, error: 'Informe o número do CRLV e envie a foto/PDF do documento CRLV para análise.' });
      }

      const currentVehicles = Array.isArray(driver.vehicles) ? [...driver.vehicles] : [];
      if (currentVehicles.length >= 6) {
        return sendJson(res, 400, { ok: false, error: 'Limite máximo de 6 veículos por motorista.' });
      }
      const dupPlate = currentVehicles.some(v => String(v.plate || '').replace(/[^A-Z0-9]/g, '').toUpperCase() === plate);
      if (dupPlate) {
        return sendJson(res, 409, { ok: false, error: `A placa ${plate} já está cadastrada em sua frota.` });
      }

      let vehiclePhotoUrl = body.vehiclePhoto ? await kycStorage.savePublicMedia(driver.id, 'vehicle', body.vehiclePhoto) : '';
      if (!vehiclePhotoUrl) {
        try {
          const resolved = await resolveVehiclePhotoCached({ brand, model, year, color });
          if (resolved?.primaryUrl) vehiclePhotoUrl = resolved.primaryUrl;
        } catch {
          // Non-fatal fallback
        }
      }
      const crlvDocumentUrl = await kycStorage.savePublicMedia(driver.id, 'crlv', crlvDocumentPhotoRaw);

      const cfg = await finance.getSystemConfig();
      const cats = finance.normalizeCategoriesServer(cfg);
      const evalRes = finance.computeDriverCategoriesServer({
        cnhHasEar: driver.cnhHasEar ?? true,
        vehicleBrand: brand,
        vehicleModel: model,
        vehicleVersion: version,
        vehicleYear: year,
        crlvRegular: true,
        hasFourDoors: body.hasFourDoors !== false,
        hasAirConditioning: body.hasAirConditioning !== false,
        hasLargeTrunk: Boolean(body.hasLargeTrunk),
        hasLeatherSeats: Boolean(body.hasLeatherSeats),
        rating: driver.rating || 5.0,
        totalRides: driver.totalRides || 0
      }, cats);

      const newVehicle = {
        id: `veh-${Date.now()}`,
        brand,
        model,
        version,
        color,
        year,
        plate,
        vehiclePhoto: vehiclePhotoUrl,
        crlvNumber,
        crlvDocumentPhoto: crlvDocumentUrl,
        crlvRegular: true,
        hasFourDoors: body.hasFourDoors !== false,
        hasAirConditioning: body.hasAirConditioning !== false,
        hasLargeTrunk: Boolean(body.hasLargeTrunk),
        hasLeatherSeats: Boolean(body.hasLeatherSeats),
        eligibleCategories: evalRes.eligibleCategories,
        enabledCategories: evalRes.enabledCategories,
        approvalStatus: isAdmin ? 'aprovado' : 'pendente_aprovacao',
        isActive: currentVehicles.length === 0 && isAdmin,
        submittedAt: new Date().toISOString()
      };

      const updatedVehicles = [...currentVehicles, newVehicle];
      const updated = await finance.saveDriverRecord({
        ...driver,
        vehicles: updatedVehicles
      });

      await db.query(
        `INSERT INTO public.notifications (id, title, message, type, read, timestamp)
         VALUES ($1, $2, $3, 'vehicle_new', false, NOW())`,
        [
          `notif-veh-${Date.now()}`,
          `🚗 Novo Veículo & CRLV p/ Analisar: ${driver.name}`,
          `${brand} ${model} ${year} (${color}) • Placa ${plate} • CRLV ${crlvNumber}`
        ]
      ).catch(() => {});

      return sendJson(res, 200, { ok: true, driver: updated, vehicle: newVehicle });
    }

    const driverVehicleSelectMatch = pathname.match(/^\/api\/drivers\/([^/]+)\/vehicles\/([^/]+)\/select$/);
    if (driverVehicleSelectMatch && method === 'POST') {
      const driverId = decodeURIComponent(driverVehicleSelectMatch[1]);
      const vehicleId = decodeURIComponent(driverVehicleSelectMatch[2]);
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      if (!isAdmin && (!driverSession || driverSession.sub !== driverId)) {
        return sendJson(res, 401, { ok: false, error: 'Sessão de motorista inválida ou expirada.' });
      }
      const driver = await finance.getDriverById(driverId);
      if (!driver) return sendJson(res, 404, { ok: false, error: 'Motorista não encontrado.' });

      const currentVehicles = Array.isArray(driver.vehicles) ? [...driver.vehicles] : [];
      const target = currentVehicles.find(v => v.id === vehicleId);
      if (!target) return sendJson(res, 404, { ok: false, error: 'Veículo não encontrado no perfil.' });
      if (target.approvalStatus !== 'aprovado') {
        return sendJson(res, 400, {
          ok: false,
          error: target.approvalStatus === 'rejeitado'
            ? 'Este veículo foi recusado pelo Painel Master e não pode ser selecionado.'
            : 'Este veículo ainda aguarda análise e aprovação do CRLV no Painel Master.'
        });
      }

      const nextVehicles = currentVehicles.map(v => ({
        ...v,
        isActive: v.id === vehicleId
      }));
      const topCat = Array.isArray(target.eligibleCategories) && target.eligibleCategories.length > 0
        ? target.eligibleCategories[target.eligibleCategories.length - 1]
        : (driver.vehicleCategory || 'kavro_go');

      const updated = await finance.saveDriverRecord({
        ...driver,
        vehicles: nextVehicles,
        activeVehicleId: target.id,
        vehicleBrand: target.brand,
        vehicleModel: target.model,
        vehicleVersion: target.version || '',
        vehicleColor: target.color,
        vehicleYear: target.year,
        vehiclePlate: target.plate,
        vehiclePhoto: target.vehiclePhoto || '',
        crlvNumber: target.crlvNumber || '',
        crlvRegular: target.crlvRegular !== false,
        hasFourDoors: target.hasFourDoors !== false,
        hasAirConditioning: target.hasAirConditioning !== false,
        hasLargeTrunk: Boolean(target.hasLargeTrunk),
        hasLeatherSeats: Boolean(target.hasLeatherSeats),
        vehicleCategory: topCat,
        enabledCategories: target.enabledCategories || target.eligibleCategories
      });

      return sendJson(res, 200, { ok: true, driver: updated, activeVehicle: target });
    }

    const driverVehicleDeleteMatch = pathname.match(/^\/api\/drivers\/([^/]+)\/vehicles\/([^/]+)$/);
    if (driverVehicleDeleteMatch && method === 'DELETE') {
      const driverId = decodeURIComponent(driverVehicleDeleteMatch[1]);
      const vehicleId = decodeURIComponent(driverVehicleDeleteMatch[2]);
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      if (!isAdmin && (!driverSession || driverSession.sub !== driverId)) {
        return sendJson(res, 401, { ok: false, error: 'Sessão de motorista inválida ou expirada.' });
      }
      const driver = await finance.getDriverById(driverId);
      if (!driver) return sendJson(res, 404, { ok: false, error: 'Motorista não encontrado.' });

      const currentVehicles = Array.isArray(driver.vehicles) ? [...driver.vehicles] : [];
      const target = currentVehicles.find(v => v.id === vehicleId);
      if (!target) return sendJson(res, 404, { ok: false, error: 'Veículo não encontrado.' });
      if (target.isActive) {
        return sendJson(res, 400, { ok: false, error: 'Selecione outro veículo aprovado antes de remover o veículo em uso hoje.' });
      }
      if (currentVehicles.length <= 1) {
        return sendJson(res, 400, { ok: false, error: 'O motorista precisa manter pelo menos 1 veículo cadastrado.' });
      }

      const nextVehicles = currentVehicles.filter(v => v.id !== vehicleId);
      const updated = await finance.saveDriverRecord({
        ...driver,
        vehicles: nextVehicles
      });
      return sendJson(res, 200, { ok: true, driver: updated });
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
      const isAdminKyc = await isAuthorizedAdmin(req);
      const drvSessKyc = verifyDriverToken(req);
      if (!isAdminKyc && (!drvSessKyc || drvSessKyc.sub !== resolvedDriverId)) {
        return sendJson(res, 401, { ok: false, error: 'Sessão de motorista inválida ou expirada. Faça login antes de enviar documentos.' });
      }
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
      const checklist = body.checklist && typeof body.checklist === 'object' ? body.checklist : null;

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

      let actionDesc = notes
        ? `Aprovação final de cadastro: ${notes}`
        : 'Aprovação final de cadastro e liberação para corridas';
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
        ...(checklist ? { checklist } : {}),
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
      invalidateDriversCache();

      const actor = getAdminActorContext(req);
      const actionPt = action === 'aprovado' ? 'Aprovado' : action === 'rejeitado' ? 'Recusado' : 'Correção Solicitada';
      await audit.recordAuditEvent({
        ...actor,
        category: 'motoristas_kyc',
        actionKey: `kyc_${action}`,
        title: `Análise de KYC: ${actionPt}`,
        summary: `Cadastro de ${updated.name} (${updated.id}) marcado como "${actionPt}". ${notes || actionDesc}`,
        severity: action === 'rejeitado' ? 'critico' : action === 'correcao_solicitada' ? 'atencao' : 'info',
        entityType: 'motorista',
        entityId: updated.id,
        entityLabel: updated.name,
        relatedIds: { driverId: updated.id, kycAuditId: newAudit.id },
        changes: [
          {
            field: 'approvalStatus',
            label: 'Status do Cadastro (KYC)',
            before: String(driver.approvalStatus || 'pendente'),
            after: action,
            summary: `Status alterado de "${driver.approvalStatus || 'pendente'}" para "${action}"`
          }
        ]
      });

      realtimeHub.publish('driver:updated', { driverId: updated.id, driver: security.sanitizeDriverForSse(updated) });
      return sendJson(res, 200, { ok: true, driver: updated, autoPurged: true });
    }

    // 4. Obtenção de Documentos com URLs Temporárias Novas para Visualização Segura pelo Admin ou Próprio Motorista
    const kycDriverMatch = pathname.match(/^\/api\/kyc\/driver\/([^/]+)$/);
    if (kycDriverMatch && method === 'GET') {
      const driverId = decodeURIComponent(kycDriverMatch[1]);
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      if (!isAdmin && (!driverSession || driverSession.sub !== driverId)) {
        return sendJson(res, 401, { ok: false, error: 'Acesso não autorizado aos documentos KYC.' });
      }
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
      if (isAdmin) {
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

    const isCardLikeMethod = (m) => m === 'cartao_credito' || m === 'cartao_debito' || m === 'apple_pay';

    const executeRideSave = async ({ ride, isAdmin, driverSession, clientSession }) => {
      if (!isAdmin && !driverSession && !clientSession) {
        return { status: 401, body: { ok: false, error: 'Faça login para solicitar ou gerenciar corridas.' } };
      }
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
        if (!isAdmin && !clientSession?.sub) {
          return { status: 401, body: { ok: false, error: 'Faça login como passageiro para solicitar uma corrida.' } };
        }
        if (!isAdmin && clientSession?.sub) {
          ride.clientId = clientSession.sub;
          ride.isManualBooking = false;
        }
      } else {
        const isOwnerClient = Boolean(clientSession && clientSession.sub && clientSession.sub === before.clientId);
        const isAssignedDriver = Boolean(driverSession && driverSession.sub && driverSession.sub === before.driverId);
        if (!isAdmin && !isOwnerClient && !isAssignedDriver) {
          return { status: 401, body: { ok: false, error: 'Sem permissão para alterar esta corrida.' } };
        }
        if (!isAdmin) {
          // Impede alteração arbitrária de preço ou vínculo financeiro por não-admins em corridas existentes
          ride.totalPrice = before.totalPrice;
          ride.driverId = before.driverId;
          ride.clientId = before.clientId;
        }
      }

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

      // Cálculo oficial de comissão e valor líquido do motorista no backend respeitando meio de pagamento, plataforma e categoria
      const allCats = finance.normalizeCategoriesServer(cfg);
      const mappedCatId = finance.mapLegacyCategoryIdServer(ride.category || before?.category || 'kavro_go');
      const matchedCat = allCats.find(c => c.id === ride.category || c.id === mappedCatId) || allCats[0];
      const reqMethod = ride.paymentMethod || before?.paymentMethod || 'dinheiro';
      if (!before && !ride.isManualBooking && Array.isArray(cfg.activePaymentMethods) && cfg.activePaymentMethods.length > 0) {
        const normalizedMethod = reqMethod === 'online' ? 'cartao_credito' : reqMethod;
        const isMethodAllowed =
          normalizedMethod === 'apple_pay'
            ? (cfg.activePaymentMethods.includes('apple_pay') ||
               (cfg.activePaymentMethods.includes('cartao_credito') && !cfg.applePayDisabled))
            : normalizedMethod === 'carteira'
              ? (cfg.activePaymentMethods.includes('carteira') || !cfg.walletPaymentDisabled)
              : cfg.activePaymentMethods.includes(normalizedMethod);
        if (!isMethodAllowed) {
          return {
            status: 400,
            body: {
              ok: false,
              error: `A forma de pagamento "${normalizedMethod}" está desativada pela plataforma no momento.`
            }
          };
        }
      }
      const resolvedMethodCommPct = finance.resolveCommissionPercentForRide
        ? finance.resolveCommissionPercentForRide(cfg, matchedCat, reqMethod)
        : commPct;
      const effectiveCommPct = !before
        ? Number(
            (isAdmin && ride.commissionPercent !== undefined)
              ? ride.commissionPercent
              : (resolvedMethodCommPct ?? commPct)
          )
        : Number(
            (isAdmin && ride.commissionPercent !== undefined)
              ? ride.commissionPercent
              : (before?.paymentMethod && before.paymentMethod !== reqMethod
                  ? resolvedMethodCommPct
                  : (before?.commissionPercent ?? resolvedMethodCommPct ?? commPct))
          );
      const defaultCommFixed = finance.resolveCommissionFixedForRide
        ? finance.resolveCommissionFixedForRide(cfg, null)
        : Math.max(0, finance.round2(cfg.platformCommissionFixed ?? 0));
      const effectiveCommFixed = !before
        ? Math.max(0, finance.round2((isAdmin && ride.commissionFixed !== undefined) ? ride.commissionFixed : defaultCommFixed))
        : Math.max(0, finance.round2(
            (isAdmin && ride.commissionFixed !== undefined)
              ? ride.commissionFixed
              : (before?.commissionFixed ?? before?.appliedFareSnapshot?.commissionFixed ?? defaultCommFixed)
          ));

      ride.category = matchedCat ? matchedCat.id : mappedCatId;
      ride.categoryName = ride.categoryName || before?.categoryName || matchedCat?.name || 'KAVRO GO';
      const isDeliveryRide = Boolean(
        (matchedCat && finance.resolveCategoryTypeServer(matchedCat) === 'entregas') ||
        finance.resolveCategoryTypeServer(ride.category) === 'entregas' ||
        before?.serviceType === 'entregas'
      );
      const rawDelivery = (ride.deliveryDetails && typeof ride.deliveryDetails === 'object')
        ? ride.deliveryDetails
        : (before?.deliveryDetails && typeof before.deliveryDetails === 'object' ? before.deliveryDetails : null);

      let normalizedDelivery = before?.deliveryDetails || null;
      if (isDeliveryRide) {
        const delRole = rawDelivery?.role === 'receiver' ? 'receiver' : 'sender';
        const recipientName = String(rawDelivery?.recipientName || '').trim().slice(0, 120);
        const recipientPhone = String(rawDelivery?.recipientPhone || '').trim().slice(0, 32);
        const recipientPhoneDigits = recipientPhone.replace(/\D/g, '');
        const itemDescription = String(rawDelivery?.itemDescription || '').trim().slice(0, 200);
        const packageSize = ['pequeno', 'medio', 'grande'].includes(rawDelivery?.packageSize)
          ? rawDelivery.packageSize
          : 'pequeno';
        const dropoffMode = ['porta_mao', 'portaria', 'recepcao'].includes(rawDelivery?.dropoffMode)
          ? rawDelivery.dropoffMode
          : 'porta_mao';
        const instructions = String(rawDelivery?.instructions || '').trim().slice(0, 260);

        if (!before && !ride.isManualBooking) {
          if (recipientName.length < 2) {
            return {
              status: 400,
              body: {
                ok: false,
                error: `Informe o nome completo de quem vai ${delRole === 'sender' ? 'receber' : 'entregar'} o pacote.`
              }
            };
          }
          if (recipientPhoneDigits.length < 10) {
            return {
              status: 400,
              body: {
                ok: false,
                error: 'Informe um telefone/WhatsApp válido com DDD para a entrega.'
              }
            };
          }
          if (itemDescription.length < 2) {
            return {
              status: 400,
              body: {
                ok: false,
                error: 'Descreva o produto ou item que será entregue.'
              }
            };
          }
        }

        if (recipientName || itemDescription || recipientPhone) {
          normalizedDelivery = {
            role: delRole,
            recipientName,
            recipientPhone,
            itemDescription,
            packageSize,
            dropoffMode,
            ...(instructions ? { instructions } : {})
          };
        }
      }

      ride.serviceType = isDeliveryRide ? 'entregas' : 'padrao';
      ride.deliveryDetails = isDeliveryRide ? normalizedDelivery : null;
      if (isDeliveryRide) {
        ride.passengers = 0;
      }

      const officialFare = !before && !(isAdmin && ride.isManualBooking)
        ? security.calculateOfficialRidePriceServer({
            cfg,
            categoryObj: matchedCat,
            distanceKm: ride.distanceKm,
            durationMin: ride.durationMin,
            origin: ride.origin,
            destination: ride.destination,
            timeStr: ride.time,
            city: ride.city
          })
        : null;

      const existingPin = before?.appliedFareSnapshot?.boardingPin || null;
      let generatedPin = existingPin;
      let isTeenRideFlag = Boolean(before?.appliedFareSnapshot?.isTeenRide);
      let guardianClientIdFlag = before?.appliedFareSnapshot?.guardianClientId || null;

      if (!before && !ride.isManualBooking) {
        let clientSafetyPrefs = normalizeSafetyPreferencesServer({});
        let isTeenAccount = false;
        if (ride.clientId) {
          try {
            await ensureClientsSchema();
            const cliPrefRes = await db.query(
              'SELECT safety_preferences, account_type, guardian_client_id FROM public.clients WHERE id = $1 LIMIT 1',
              [ride.clientId]
            );
            if (cliPrefRes.rows[0]) {
              clientSafetyPrefs = normalizeSafetyPreferencesServer(
                cliPrefRes.rows[0].safety_preferences || cliPrefRes.rows[0].safetyPreferences
              );
              isTeenAccount =
                (cliPrefRes.rows[0].account_type || cliPrefRes.rows[0].accountType) === 'teen' ||
                Boolean(cliPrefRes.rows[0].guardian_client_id || cliPrefRes.rows[0].guardianClientId);
              guardianClientIdFlag =
                cliPrefRes.rows[0].guardian_client_id || cliPrefRes.rows[0].guardianClientId || null;
            }
          } catch {
            // mantém fallback seguro
          }
        }
        isTeenRideFlag = isTeenAccount;
        const shouldUsePin =
          isDeliveryRide || isTeenAccount || clientSafetyPrefs.familySafetyEnabled || clientSafetyPrefs.boardingPinEnabled !== false;
        if (shouldUsePin) {
          generatedPin = clientSafetyPrefs.customBoardingPin && /^\d{4}$/.test(clientSafetyPrefs.customBoardingPin)
            ? clientSafetyPrefs.customBoardingPin
            : String(crypto.randomInt(1000, 9999));
        } else {
          generatedPin = null;
        }
      }

      if (!ride.appliedFareSnapshot && matchedCat) {
        ride.appliedFareSnapshot = before?.appliedFareSnapshot || {
          categoryId: matchedCat.id,
          categoryName: matchedCat.name,
          categoryType: ride.serviceType,
          ...(normalizedDelivery ? { deliveryDetails: normalizedDelivery } : {}),
          baseFare: officialFare ? officialFare.pricing.baseFare : Number(matchedCat.baseFare ?? cfg.baseFare ?? 8.0),
          pricePerKm: officialFare ? officialFare.pricing.pricePerKm : Number(matchedCat.pricePerKm ?? cfg.pricePerKm ?? 3.2),
          pricePerMinute: officialFare ? officialFare.pricing.pricePerMinute : Number(matchedCat.pricePerMinute ?? cfg.pricePerMinute ?? 0.5),
          minimumFare: officialFare ? officialFare.pricing.minimumFare : Number(matchedCat.minimumFare ?? cfg.minimumFare ?? 15.0),
          multiplier: Number(matchedCat.multiplier ?? 1.0),
          commissionPercent: effectiveCommPct,
          commissionFixed: effectiveCommFixed,
          ...(generatedPin ? { boardingPin: generatedPin } : {}),
          ...(isTeenRideFlag ? { isTeenRide: true, guardianClientId: guardianClientIdFlag, requireTopRatedDrivers: true } : {})
        };
      } else if (ride.appliedFareSnapshot) {
        ride.appliedFareSnapshot = {
          ...ride.appliedFareSnapshot,
          categoryType: ride.serviceType,
          ...(normalizedDelivery ? { deliveryDetails: normalizedDelivery } : {}),
          ...(generatedPin && !ride.appliedFareSnapshot.boardingPin ? { boardingPin: generatedPin } : {}),
          ...(isTeenRideFlag ? { isTeenRide: true, guardianClientId: guardianClientIdFlag, requireTopRatedDrivers: true } : {})
        };
      }

      const authoritativeTotal = officialFare
        ? officialFare.totalPrice
        : Number(ride.totalPrice || before?.totalPrice || 0);
      const split = finance.calculateSplit(authoritativeTotal, effectiveCommPct, effectiveCommFixed);
      ride.estimatedPrice = before ? before.estimatedPrice : split.grossAmount;
      ride.totalPrice = split.grossAmount;
      ride.commissionPercent = split.commissionPercent;
      ride.commissionFixed = split.commissionFixed;
      ride.commissionAmount = split.commissionAmount;
      ride.driverNetAmount = split.driverNetAmount;
      if (ride.appliedFareSnapshot) {
        ride.appliedFareSnapshot = {
          ...ride.appliedFareSnapshot,
          categoryType: ride.serviceType,
          ...(normalizedDelivery ? { deliveryDetails: normalizedDelivery } : {}),
          commissionPercent: split.commissionPercent,
          commissionFixed: split.commissionFixed
        };
      }

      // Tratamento na criação de nova corrida conforme o método de pagamento
      if (!before && !ride.isManualBooking) {
        if (ride.paymentMethod === 'pix') {
          // Regra 1: Corrida PIX pré-paga aguarda confirmação do webhook do gateway antes de confirmar!
          try {
            const { tx } = await finance.createPixChargeForRide(ride);
            ride.paymentTxId = tx.id;
            ride.pixQrCode = tx.pixQrCode;
            ride.pixCopyPaste = tx.pixCopyPaste;
            ride.paymentStatus = 'aguardando';
            ride.status = 'aguardando_pagamento';
          } catch (pixErr) {
            return {
              status: 402,
              body: {
                ok: false,
                error: pixErr?.message || 'Não foi possível gerar o QR Code PIX no gateway.',
                paymentStatus: 'falhou'
              }
            };
          }
        } else if (isCardLikeMethod(ride.paymentMethod)) {
          // Regra 3: Pré-autoriza cartão ou Apple Pay no gateway ao solicitar a corrida
          const authResult = await finance.authorizeCardForRide(ride, {
            cardId: ride.cardId,
            cardLast4: ride.cardLast4,
            cardBrand: ride.cardBrand,
            mpCardToken: ride.mpCardToken,
            stripePaymentIntentId: ride.stripePaymentIntentId
          });
          if (authResult.requiresAction) {
            return {
              status: 402,
              body: {
                ok: false,
                requiresAction: true,
                clientSecret: authResult.clientSecret,
                paymentIntentId: authResult.paymentIntentId,
                error: authResult.error || 'Confirme a verificação de segurança (3DS) do cartão.',
                paymentStatus: 'acao_necessaria'
              }
            };
          }
          if (!authResult.authorized) {
            return {
              status: 402,
              body: {
                ok: false,
                error: authResult.error || 'Pagamento recusado pelo emissor do cartão.',
                paymentStatus: 'falhou'
              }
            };
          }
          ride.paymentTxId = authResult.tx.id;
          ride.cardLast4 = authResult.tx.cardLast4;
          ride.cardBrand = authResult.tx.cardBrand;
          ride.paymentStatus = 'autorizado';
          ride.status = 'aguardando_confirmacao';
        } else if (ride.paymentMethod === 'carteira') {
          // Regra 4: Pagamento integral usando saldo da Carteira Kavro do passageiro
          const debitRes = await finance.debitClientWalletForRide({
            clientId: ride.clientId,
            clientName: ride.clientName,
            clientPhone: ride.clientPhone,
            rideId: ride.id,
            rideCode: ride.rideCode,
            amount: split.grossAmount
          });
          if (!debitRes.ok) {
            return {
              status: 402,
              body: {
                ok: false,
                code: 'INSUFFICIENT_WALLET_BALANCE',
                availableBalance: debitRes.availableBalance ?? 0,
                error: debitRes.error || 'Saldo insuficiente na carteira Kavro para pagar esta corrida.',
                paymentStatus: 'falhou'
              }
            };
          }
          const walletTx = await finance.savePaymentTransaction({
            rideId: ride.id,
            rideCode: ride.rideCode,
            clientId: ride.clientId,
            clientName: ride.clientName,
            method: 'carteira',
            status: 'confirmado',
            estimatedAmount: split.grossAmount,
            finalAmount: split.grossAmount,
            paidAmount: split.grossAmount,
            commissionPercent: split.commissionPercent,
            commissionAmount: split.commissionAmount,
            driverNetAmount: split.driverNetAmount,
            gatewayTxId: debitRes.entry?.id || `wallet_${ride.id}_${Date.now()}`
          });
          ride.paymentTxId = walletTx.id;
          ride.paidAmount = split.grossAmount;
          ride.paymentStatus = 'confirmado';
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

      let alsoCancelledRideIds = [];
      if (!before && !ride.isManualBooking) {
        alsoCancelledRideIds = await cancelAwaitingPaymentRidesForClient({
          clientId: ride.clientId,
          clientPhone: ride.clientPhone,
          excludeRideId: ride.id,
          reason: 'Substituída por nova solicitação do passageiro',
          cancelledBy: 'passenger'
        });
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

      const [enrichedSavedRide] = await attachClientRatingsToRides([savedRide]);
      await push.handleRideChange(before, enrichedSavedRide);
      realtimeHub.publish(
        before ? 'ride:updated' : 'ride:created',
        { rideId: enrichedSavedRide.id, status: enrichedSavedRide.status },
        { rideId: enrichedSavedRide.id, clientId: enrichedSavedRide.clientId, driverId: enrichedSavedRide.driverId }
      );
      const viewerRide = security.sanitizeRideForViewer(enrichedSavedRide, {
        isAdmin,
        isOwnerClient: Boolean(clientSession && enrichedSavedRide.clientId === clientSession.sub),
        isDriver: Boolean(driverSession && enrichedSavedRide.driverId === driverSession.sub)
      });
      return { status: 200, body: { ok: true, ride: viewerRide, alsoCancelledRideIds } };
    };

    if (pathname === '/api/rides') {
      if (method === 'GET') {
        const isAdmin = await isAuthorizedAdmin(req);
        const driverSession = verifyDriverToken(req);
        const clientSession = verifyClientToken(req);
        if (!isAdmin && !driverSession?.sub && !clientSession?.sub) {
          return sendJson(res, 200, []);
        }
        const verifiedClientId = clientSession?.sub || '';
        const verifiedClientPhoneDigits = clientSession
          ? normalizePhoneDigitsServer(clientSession.phone)
          : '';
        if (isAdmin) {
          const r = await db.query('SELECT * FROM public.rides ORDER BY date DESC, time DESC LIMIT 500');
          const formatted = await attachClientRatingsToRides(r.rows.map(formatRideFromDb));
          return sendJson(res, 200, formatted.map(ride => security.sanitizeRideForViewer(ride, { isAdmin: true })));
        }
        if (driverSession?.sub) {
          const [r, allDrivers, cfg] = await Promise.all([
            db.query(
              `SELECT * FROM public.rides
               WHERE driver_id = $1 OR (status = 'aguardando_confirmacao' AND driver_id IS NULL)
               ORDER BY created_at DESC LIMIT 100`,
              [driverSession.sub]
            ),
            getCachedDriversList(),
            getCachedSystemConfig()
          ]);
          const selfDriver = allDrivers.find(d => d.id === driverSession.sub) || null;
          const formatted = await attachClientRatingsToRides(r.rows.map(formatRideFromDb));
          return sendJson(
            res,
            200,
            filterAndSortDriverRidesByRadius(formatted, selfDriver, cfg)
              .map(ride => security.sanitizeRideForViewer(ride, { isDriver: true }))
          );
        }
        const r = await db.query(
          `SELECT * FROM public.rides
           WHERE ($1 <> '' AND client_id = $1)
              OR ($2 <> '' AND regexp_replace(COALESCE(client_phone, ''), '\\D', '', 'g') = $2)
           ORDER BY created_at DESC LIMIT 80`,
          [verifiedClientId, verifiedClientPhoneDigits]
        );
        const formatted = await attachClientRatingsToRides(r.rows.map(formatRideFromDb));
        const ownClientRides = formatted.filter(ride => {
          const ridePhoneDigits = normalizePhoneDigitsServer(ride.clientPhone);
          return (
            (verifiedClientId && ride.clientId && String(verifiedClientId) === String(ride.clientId)) ||
            (verifiedClientPhoneDigits.length >= 8 && ridePhoneDigits === verifiedClientPhoneDigits)
          );
        });
        return sendJson(res, 200, ownClientRides.map(ride => security.sanitizeRideForViewer(ride, { isOwnerClient: true })));
      }
      if (method === 'POST') {
        const ride = await parseBody(req);
        const isAdmin = await isAuthorizedAdmin(req);
        const driverSession = verifyDriverToken(req);
        const clientSession = verifyClientToken(req);
        const result = await executeRideSave({ ride, isAdmin, driverSession, clientSession });
        return sendJson(res, result.status, result.body);
      }
    }

    // ============================================================
    // ACEITAR / RECUSAR / FINALIZAR CORRIDA (COM FILA DE PRÓXIMA CORRIDA)
    // ============================================================
    const rideAcceptMatch = pathname.match(/^\/api\/rides\/([^/]+)\/accept$/);
    if (rideAcceptMatch && method === 'POST') {
      const id = normalizeRideId(decodeURIComponent(rideAcceptMatch[1]));
      const body = await parseBody(req);
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      const driverId = String(body.driverId || driverSession?.sub || '').trim();
      if (!driverId || (!isAdmin && (!driverSession || driverSession.sub !== driverId))) {
        return sendJson(res, 401, { ok: false, error: 'Sessão de motorista inválida para aceitar corrida.' });
      }

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

      // Verifica se é uma viagem adolescente e exige motorista parceiro bem avaliado (>= 4.5)
      if (!isAdmin && ride.appliedFareSnapshot?.requireTopRatedDrivers) {
        const drvRating = driver.rating !== undefined && driver.rating !== null ? Number(driver.rating) : 5.0;
        if (drvRating < 4.5) {
          return sendJson(res, 403, {
            ok: false,
            error: 'Esta corrida faz parte do Perfil Familiar (Adolescentes) e requer motoristas com avaliação mínima 4.5.'
          });
        }
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

      const claimRes = await finance.claimRideAtomically({
        rideId: ride.id,
        driver,
        newStatus,
        isQueued
      });
      if (!claimRes.ok) {
        return sendJson(res, claimRes.status || 409, { ok: false, error: claimRes.error || 'Outro motorista já aceitou esta corrida.' });
      }
      const updatedRide = formatRideFromDb(claimRes.row);

      await finance.saveDriverRecord({
        ...driver,
        isOnline: true,
        currentRideId: isQueued ? currentActiveRide.id : updatedRide.id,
        queuedRideId: isQueued ? updatedRide.id : driver.queuedRideId
      });
      invalidateDriversCache();

      // Atualiza transação com o motorista atribuído
      const existingTx = await finance.getPaymentTxByRide(updatedRide.id);
      if (existingTx) {
        await finance.savePaymentTransaction({
          ...existingTx,
          driverId: driver.id,
          driverName: driver.name
        });
      }

      const [enrichedAcceptedRide] = await attachClientRatingsToRides([updatedRide]);
      await push.handleRideChange(ride, enrichedAcceptedRide);
      if (enrichedAcceptedRide.appliedFareSnapshot?.isTeenRide) {
        dispatchTrustedContactsForRide(
          enrichedAcceptedRide,
          'ride_started',
          req.headers.host || 'localhost:5173'
        ).catch(() => {});
      }
      realtimeHub.publish(
        'ride:updated',
        { rideId: enrichedAcceptedRide.id, status: enrichedAcceptedRide.status, driverId: driver.id },
        { rideId: enrichedAcceptedRide.id, driverId: driver.id, clientId: enrichedAcceptedRide.clientId }
      );
      return sendJson(res, 200, {
        ok: true,
        ride: security.sanitizeRideForViewer(enrichedAcceptedRide, { isAdmin, isDriver: !isAdmin }),
        isQueued,
        activeRideId: currentActiveRide?.id || null
      });
    }

    // AVALIAÇÃO DE CORRIDA + TAGS RÁPIDAS + GORJETA 100% MOTORISTA + RECÁLCULO DA NOTA MÉDIA
    const rideRateMatch = pathname.match(/^\/api\/rides\/([^/]+)\/rate$/);
    if (rideRateMatch && method === 'POST') {
      const id = normalizeRideId(decodeURIComponent(rideRateMatch[1]));
      const body = await parseBody(req);
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      const clientSession = verifyClientToken(req);
      const stars = Math.min(5, Math.max(1, Number(body.stars || 5)));
      const raterRole = body.raterRole === 'motorista' ? 'motorista' : 'cliente';
      const rawComment = body.comment ? String(body.comment).trim() : '';
      const rawTags = Array.isArray(body.tags)
        ? body.tags.map(t => String(t || '').trim()).filter(Boolean).slice(0, 6)
        : [];
      const tipVal = raterRole === 'cliente'
        ? finance.round2(Math.min(100, Math.max(0, Number(body.tipAmount || 0))))
        : 0;

      const prevRes = await db.query('SELECT * FROM public.rides WHERE id = $1', [id]);
      if (!prevRes.rows[0]) return sendJson(res, 404, { ok: false, error: 'Corrida não encontrada.' });
      const ride = formatRideFromDb(prevRes.rows[0]);

      if (raterRole === 'cliente') {
        const isOwnerClient = Boolean(
          clientSession?.sub &&
          (clientSession.sub === ride.clientId ||
            (clientSession.phone && ride.clientPhone &&
              normalizePhoneDigitsServer(clientSession.phone) === normalizePhoneDigitsServer(ride.clientPhone)))
        );
        if (!isAdmin && !isOwnerClient) {
          return sendJson(res, 401, { ok: false, error: 'Faça login como passageiro dono desta corrida para avaliar.' });
        }
        if (tipVal > 0 && ride.status !== 'finalizada') {
          return sendJson(res, 400, { ok: false, error: 'Gorjetas só podem ser enviadas após a finalização da corrida.' });
        }
        if (
          tipVal > 0 &&
          (ride.paymentMethod === 'pix' || isCardLikeMethod(ride.paymentMethod)) &&
          ride.paymentStatus !== 'confirmado' &&
          ride.paymentStatus !== 'pago' &&
          !isAdmin
        ) {
          return sendJson(res, 400, { ok: false, error: 'A gorjeta requer que o pagamento digital da corrida esteja confirmado.' });
        }
      } else {
        const isAssignedDriver = Boolean(driverSession?.sub && ride.driverId && driverSession.sub === ride.driverId);
        if (!isAdmin && !isAssignedDriver) {
          return sendJson(res, 401, { ok: false, error: 'Sessão de motorista não autorizada para avaliar esta corrida.' });
        }
      }

      const combinedNotes = [
        rawTags.length > 0 ? rawTags.join(' • ') : '',
        rawComment,
        tipVal > 0 ? `Gorjeta: R$ ${tipVal.toFixed(2).replace('.', ',')}` : ''
      ].filter(Boolean).join(' — ') || null;

      const patch = raterRole === 'cliente'
        ? { passengerRating: stars, passengerNotes: combinedNotes || ride.passengerNotes }
        : { driverRating: stars, clientRatedStars: stars, driverNotes: combinedNotes || ride.driverNotes };

      const updatedRide = await upsertFullRide({ ...ride, ...patch });

      let tipCredited = 0;
      if (raterRole === 'cliente' && tipVal > 0 && ride.driverId) {
        const ledgerRes = await finance.recordLedgerEntry({
          idempotencyKey: `ride_tip_${ride.id}`,
          driverId: ride.driverId,
          driverName: ride.driverName || '',
          rideId: ride.id,
          rideCode: ride.rideCode || ride.id,
          clientId: ride.clientId || null,
          clientName: ride.clientName || 'Passageiro',
          entryType: 'ride_earning_credit',
          paymentMethod: ride.paymentMethod || 'pix',
          grossAmount: tipVal,
          commissionPercent: 0,
          commissionAmount: 0,
          driverNetAmount: tipVal,
          balanceDelta: tipVal,
          balanceBucket: 'available',
          status: 'confirmado',
          description: `Gorjeta pós-corrida ${ride.rideCode || ride.id} (100% motorista)`,
          metadata: { type: 'passenger_tip', stars, tags: rawTags }
        });
        if (!ledgerRes?.idempotent) {
          tipCredited = tipVal;
        }
      }

      let updatedDriverRating = null;
      if (raterRole === 'cliente' && ride.driverId) {
        const drvRidesRes = await db.query(
          'SELECT passenger_rating FROM public.rides WHERE driver_id = $1 AND passenger_rating IS NOT NULL AND passenger_rating > 0',
          [ride.driverId]
        );
        const vals = (drvRidesRes.rows || []).map(x => Number(x.passenger_rating)).filter(n => n > 0);
        if (vals.length > 0) {
          updatedDriverRating = Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
          if (db.pool) {
            await db.query('UPDATE public.drivers SET rating = $1 WHERE id = $2', [updatedDriverRating, ride.driverId]);
          } else if (Array.isArray(db.localStore?.drivers)) {
            const dIdx = db.localStore.drivers.findIndex(d => d.id === ride.driverId);
            if (dIdx >= 0) {
              db.localStore.drivers[dIdx].rating = updatedDriverRating;
              db.saveLocalStore();
            }
          }
        }
      }

      let updatedClientRating = null;
      if (raterRole === 'motorista' && (ride.clientId || ride.clientPhone)) {
        const cleanClientPhone = normalizePhoneDigitsServer(ride.clientPhone);
        const cliRidesRes = await db.query(
          `SELECT client_rated_stars FROM public.rides
           WHERE client_rated_stars IS NOT NULL AND client_rated_stars > 0
             AND (($1 <> '' AND client_id = $1)
              OR ($2 <> '' AND regexp_replace(COALESCE(client_phone, ''), '\\D', '', 'g') = $2))`,
          [ride.clientId || '', cleanClientPhone]
        );
        const cliVals = (cliRidesRes.rows || []).map(x => Number(x.client_rated_stars)).filter(n => n > 0);
        if (cliVals.length > 0) {
          updatedClientRating = Number((cliVals.reduce((a, b) => a + b, 0) / cliVals.length).toFixed(2));
          if (ride.clientId) {
            await db.query('UPDATE public.clients SET rating = $1 WHERE id = $2', [updatedClientRating, ride.clientId]);
          }
          if (!db.pool && cleanClientPhone.length >= 8 && Array.isArray(db.localStore?.clients)) {
            const matchedCli = db.localStore.clients.find(
              c => (ride.clientId && c.id === ride.clientId) || normalizePhoneDigitsServer(c.phone) === cleanClientPhone
            );
            if (matchedCli) {
              matchedCli.rating = updatedClientRating;
              db.saveLocalStore();
            }
          }
        }
      }

      const [enrichedRatedRide] = await attachClientRatingsToRides([updatedRide]);
      realtimeHub.publish(
        'ride:updated',
        { rideId: enrichedRatedRide.id, status: enrichedRatedRide.status },
        { rideId: enrichedRatedRide.id }
      );
      return sendJson(res, 200, { ok: true, ride: enrichedRatedRide, updatedDriverRating, updatedClientRating, tipCredited });
    }

    const rideDeclineMatch = pathname.match(/^\/api\/rides\/([^/]+)\/decline$/);
    if (rideDeclineMatch && method === 'POST') {
      const id = normalizeRideId(decodeURIComponent(rideDeclineMatch[1]));
      const body = await parseBody(req);
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      const driverId = String(body.driverId || driverSession?.sub || '').trim();
      if (!driverId || (!isAdmin && (!driverSession || driverSession.sub !== driverId))) {
        return sendJson(res, 401, { ok: false, error: 'Sessão de motorista inválida para recusar corrida.' });
      }

      const prevRes = await db.query('SELECT * FROM public.rides WHERE id = $1', [id]);
      if (!prevRes.rows[0]) return sendJson(res, 404, { ok: false, error: 'Corrida não encontrada.' });
      const ride = formatRideFromDb(prevRes.rows[0]);

      const declined = Array.from(new Set([...(ride.declinedDriverIds || []), driverId]));
      const updatedRide = await upsertFullRide({
        ...ride,
        declinedDriverIds: declined
      });

      realtimeHub.publish('ride:updated', { rideId: updatedRide.id, status: updatedRide.status }, { rideId: updatedRide.id });
      return sendJson(res, 200, { ok: true, ride: updatedRide });
    }

    // FINALIZAÇÃO COMPLETA DA CORRIDA + LIQUIDAÇÃO FINANCEIRA NO BACKEND + PROMOÇÃO DA FILA
    const rideCompleteMatch = pathname.match(/^\/api\/rides\/([^/]+)\/complete$/);
    if (rideCompleteMatch && method === 'POST') {
      const id = normalizeRideId(decodeURIComponent(rideCompleteMatch[1]));
      const body = await parseBody(req);
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      if (!isAdmin && !driverSession) {
        return sendJson(res, 401, { ok: false, error: 'Sessão de motorista inválida para finalizar corrida.' });
      }

      const prevRes = await db.query('SELECT * FROM public.rides WHERE id = $1', [id]);
      if (!prevRes.rows[0]) return sendJson(res, 404, { ok: false, error: 'Corrida não encontrada.' });
      const ride = formatRideFromDb(prevRes.rows[0]);

      const driverId = String(body.driverId || ride.driverId || driverSession?.sub || '').trim();
      if (!driverId || (!isAdmin && (!driverSession || (driverSession.sub !== driverId && driverSession.sub !== ride.driverId)))) {
        return sendJson(res, 401, { ok: false, error: 'Sessão de motorista inválida para finalizar corrida.' });
      }

      const cfgForComplete = await finance.getPackageConfig?.() || (await db.query('SELECT config FROM public.system_config WHERE id = $1', ['default'])).rows[0]?.config || {};
      const finalPrice = body.finalAmount !== undefined ? finance.round2(body.finalAmount) : ride.totalPrice;
      const catsForComplete = finance.normalizeCategoriesServer ? finance.normalizeCategoriesServer(cfgForComplete) : [];
      const mappedCatCompleteId = finance.mapLegacyCategoryIdServer ? finance.mapLegacyCategoryIdServer(ride.category || 'kavro_go') : (ride.category || 'kavro_go');
      const matchedCatComplete = catsForComplete.find(c => c.id === ride.category || c.id === mappedCatCompleteId) || null;
      const effectiveCompletePct = ride.commissionPercent ?? (finance.resolveCommissionPercentForRide ? finance.resolveCommissionPercentForRide(cfgForComplete, matchedCatComplete, ride.paymentMethod) : 20);
      const effectiveCompleteFixed = finance.resolveCommissionFixedForRide
        ? finance.resolveCommissionFixedForRide(cfgForComplete, ride)
        : Math.max(0, finance.round2(ride.commissionFixed ?? cfgForComplete.platformCommissionFixed ?? 0));
      const split = finance.calculateSplit(finalPrice, effectiveCompletePct, effectiveCompleteFixed);
      const driver = await finance.getDriverById(driverId);

      let newPaymentStatus = ride.paymentStatus;
      let paidAmount = finalPrice;

      if (ride.paymentMethod === 'dinheiro') {
        const cashRes = await finance.settleCashRideToLedger(
          { ...ride, driverId, driverName: driver?.name || ride.driverName, totalPrice: finalPrice, commissionPercent: split.commissionPercent, commissionFixed: split.commissionFixed },
          body.receivedCashAmount !== undefined ? body.receivedCashAmount : finalPrice,
          body.cashResolution || 'confirmado'
        );
        newPaymentStatus = cashRes.paymentStatus;
        paidAmount = cashRes.paidAmount;
      } else if (isCardLikeMethod(ride.paymentMethod)) {
        // Captura o pagamento autorizado no cartão ou Apple Pay (Stripe / Mercado Pago / Sandbox) e lança no Livro-Razão
        const capRes = await finance.captureCardForRide(ride, finalPrice);
        if (!capRes.captured) {
          return sendJson(res, 402, {
            ok: false,
            error: capRes.error || 'Falha ao capturar cobrança no cartão.'
          });
        }
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
          gatewayTxId: capRes.gatewayTxId || tx?.gatewayTxId,
          commissionPercent: split.commissionPercent,
          commissionAmount: split.commissionAmount,
          driverNetAmount: split.driverNetAmount
        });
        await finance.settleDigitalRideToLedger(
          { ...ride, driverId, driverName: driver?.name || ride.driverName, totalPrice: finalPrice, commissionPercent: split.commissionPercent, commissionFixed: split.commissionFixed },
          finalPrice
        );
      } else if (ride.paymentMethod === 'pix' || ride.paymentMethod === 'carteira') {
        // Pix ou Saldo da Carteira já confirmado: garante crédito líquido no Livro-Razão do motorista que executou
        if (ride.paymentStatus === 'confirmado' || ride.paymentStatus === 'pago') {
          newPaymentStatus = 'confirmado';
          paidAmount = finalPrice;
          const existingTx = await finance.getPaymentTxByRide(ride.id);
          if (existingTx) {
            await finance.savePaymentTransaction({
              ...existingTx,
              driverId,
              driverName: driver?.name || ride.driverName,
              status: 'confirmado',
              finalAmount: finalPrice,
              paidAmount: finalPrice,
              commissionPercent: split.commissionPercent,
              commissionAmount: split.commissionAmount,
              driverNetAmount: split.driverNetAmount
            });
          }
          await finance.settleDigitalRideToLedger(
            { ...ride, driverId, driverName: driver?.name || ride.driverName, totalPrice: finalPrice, commissionPercent: split.commissionPercent, commissionFixed: split.commissionFixed },
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
        commissionFixed: split.commissionFixed,
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
      const [enrichedCompletedRide] = await attachClientRatingsToRides([completedRide]);
      await push.handleRideChange(ride, enrichedCompletedRide);
      await audit.recordAuditEvent({
        category: 'financeiro_corridas',
        actionKey: 'ride_completed_settled',
        title: `Corrida ${enrichedCompletedRide.rideCode || enrichedCompletedRide.id} finalizada e liquidada`,
        summary: `Pagamento (${String(ride.paymentMethod || 'pix').toUpperCase()}) de ${audit.formatMoneyPt(finalPrice)} • Comissão ${split.commissionPercent}% (${audit.formatMoneyPt(split.commissionAmount)}) • Motorista ${audit.formatMoneyPt(split.driverNetAmount)}.`,
        severity: 'info',
        actorRole: isAdmin ? 'admin_master' : 'motorista',
        actorId: isAdmin ? getAdminActorContext(req).actorId : driverId,
        actorName: isAdmin ? 'Administrador Master' : (driver?.name || ride.driverName || driverId),
        entityType: 'corrida',
        entityId: enrichedCompletedRide.id,
        entityLabel: enrichedCompletedRide.rideCode || enrichedCompletedRide.id,
        relatedIds: { rideId: enrichedCompletedRide.id, rideCode: enrichedCompletedRide.rideCode, driverId },
        changes: [
          {
            field: 'status',
            label: 'Situação da Corrida',
            before: String(ride.status),
            after: 'finalizada',
            summary: `Bruto ${audit.formatMoneyPt(finalPrice)} | Comissão ${split.commissionPercent}% (${audit.formatMoneyPt(split.commissionAmount)})`
          }
        ],
        ipAddress: getRequestClientIp(req),
        userAgent: String(req.headers['user-agent'] || '').slice(0, 220) || null
      });
      realtimeHub.publish(
        'ride:updated',
        { rideId: enrichedCompletedRide.id, status: enrichedCompletedRide.status, promotedNextRideId: promotedNextRide?.id || null },
        { rideId: enrichedCompletedRide.id }
      );

      return sendJson(res, 200, {
        ok: true,
        ride: enrichedCompletedRide,
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
      realtimeHub.publish('ride:deleted', { rideId: id }, { rideId: id });
      return sendJson(res, 200, { ok: true, deleted: id });
    }

    const rideStatusMatch = pathname.match(/^\/api\/rides\/([^/]+)\/status$/);
    if (rideStatusMatch && method === 'PATCH') {
      const id = normalizeRideId(decodeURIComponent(rideStatusMatch[1]));
      const body = await parseBody(req);
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      const clientSession = verifyClientToken(req);
      if (!isAdmin && !driverSession && !clientSession) {
        return sendJson(res, 401, { ok: false, error: 'Sessão não autorizada para alterar status da corrida.' });
      }

      const prev = await db.query('SELECT * FROM public.rides WHERE id = $1', [id]);
      if (!prev.rows[0]) return sendJson(res, 404, { error: 'Corrida não encontrada' });
      const before = formatRideFromDb(prev.rows[0]);

      const isDriver = Boolean(driverSession && before.driverId && driverSession.sub === before.driverId);
      const isOwnerClient = Boolean(clientSession && before.clientId && clientSession.sub === before.clientId);
      if (!isAdmin && !isDriver && !isOwnerClient) {
        return sendJson(res, 401, { ok: false, error: 'Sessão não autorizada para alterar status da corrida.' });
      }

      if (!isAdmin && !isDriver && isOwnerClient) {
        if (body.status !== 'cancelada') {
          return sendJson(res, 403, {
            ok: false,
            error: 'Passageiro só pode solicitar o cancelamento da própria corrida.'
          });
        }
        if (before.status === 'cancelada') {
          const alsoCancelledRideIds = isOwnerClient
            ? await cancelAwaitingPaymentRidesForClient({
                clientId: before.clientId,
                clientPhone: before.clientPhone,
                excludeRideId: id,
                reason: String(body.cancellationReason || '').trim().slice(0, 140) || 'Cancelada juntamente com outra solicitação do passageiro',
                cancelledBy: 'passenger'
              })
            : [];
          const [enrichedCancelled] = await attachClientRatingsToRides([before]);
          return sendJson(res, 200, {
            ok: true,
            id,
            status: 'cancelada',
            idempotent: true,
            ride: enrichedCancelled,
            alsoCancelledRideIds,
            cancellationFeeApplied: Number(before.cancellationFeeApplied || 0),
            refundAmount: 0
          });
        }
        if (before.status === 'finalizada') {
          return sendJson(res, 400, {
            ok: false,
            error: 'Não é possível cancelar uma viagem já finalizada.'
          });
        }
        if (before.status === 'em_andamento') {
          return sendJson(res, 400, {
            ok: false,
            error: 'Viagem já está em andamento. Em caso de urgência, utilize o botão SOS ou fale com o motorista.'
          });
        }
      }

      // Validação de Código PIN de Embarque (4 dígitos estilo Uber) ao iniciar viagem
      if (!isAdmin && isDriver && body.status === 'em_andamento' && before.status !== 'em_andamento') {
        const expectedPin = String(before.appliedFareSnapshot?.boardingPin || '').trim();
        if (expectedPin) {
          const suppliedPin = String(body.boardingPin || '').replace(/\D/g, '').trim();
          if (suppliedPin !== expectedPin) {
            return sendJson(res, 400, {
              ok: false,
              code: 'INVALID_BOARDING_PIN',
              error: 'Código PIN de embarque inválido. Peça os 4 dígitos ao passageiro para iniciar a viagem.'
            });
          }
        }
      }

      // Se a corrida for cancelada, aplica regra de estorno automático e multa de cancelamento (cancellationFeeAmount)
      let nextPaymentStatus = before.paymentStatus;
      let cancelFinance = null;
      let alsoCancelledRideIds = [];
      const cancelledByRole = isDriver
        ? 'driver'
        : isAdmin && body.cancelledBy !== 'passenger'
          ? 'admin'
          : 'passenger';

      if (body.status === 'cancelada' && before.status !== 'cancelada') {
        cancelFinance = await finance.processRideCancellationFinance(before, {
          cancelledBy: cancelledByRole,
          waiveCancellationFee: Boolean(isAdmin && body.waiveCancellationFee === true)
        });
        nextPaymentStatus = cancelFinance.nextPaymentStatus;

        if (cancelledByRole === 'passenger') {
          alsoCancelledRideIds = await cancelAwaitingPaymentRidesForClient({
            clientId: before.clientId,
            clientPhone: before.clientPhone,
            excludeRideId: id,
            reason: String(body.cancellationReason || '').trim().slice(0, 140) || 'Cancelada juntamente com outra solicitação do passageiro',
            cancelledBy: 'passenger'
          });
        }

        if (before.driverId) {
          const drv = await finance.getDriverById(before.driverId);
          if (drv && (drv.currentRideId === id || drv.queuedRideId === id)) {
            await finance.saveDriverRecord({
              ...drv,
              currentRideId: drv.currentRideId === id ? null : drv.currentRideId,
              queuedRideId: drv.queuedRideId === id ? null : drv.queuedRideId
            });
          }
        }
      }

      const cancellationReasonText = String(body.cancellationReason || '').trim().slice(0, 140);
      const nextSnapshot =
        body.status === 'cancelada' && before.status !== 'cancelada'
          ? {
              ...(before.appliedFareSnapshot || {}),
              cancelledBy: cancelledByRole,
              ...(cancellationReasonText ? { cancellationReason: cancellationReasonText } : {}),
              ...(cancelFinance && cancelFinance.appliedCancellationFee > 0
                ? { cancellationFeeApplied: cancelFinance.appliedCancellationFee }
                : {})
            }
          : before.appliedFareSnapshot;

      const updated = await upsertFullRide({
        ...before,
        status: body.status,
        paymentStatus: nextPaymentStatus,
        appliedFareSnapshot: nextSnapshot,
        isQueuedRide: body.status === 'na_fila'
      });

      if (body.status === 'cancelada' && before.status !== 'cancelada') {
        const feeVal = cancelFinance?.appliedCancellationFee || 0;
        const refundVal = cancelFinance?.refundAmount || 0;
        const actorRoleLabel = cancelledByRole === 'driver' ? 'motorista' : (cancelledByRole === 'admin' ? 'admin_master' : 'passageiro');
        await audit.recordAuditEvent({
          category: 'financeiro_corridas',
          actionKey: 'ride_cancelled',
          title: feeVal > 0
            ? `Cancelamento com multa aplicada (${before.rideCode || id})`
            : `Corrida cancelada (${before.rideCode || id})`,
          summary: [
            `Cancelada por ${cancelledByRole === 'driver' ? 'Motorista' : cancelledByRole === 'admin' ? 'Admin Master' : 'Passageiro'} (status anterior: ${before.status}).`,
            feeVal > 0 ? `Multa cobrada: ${audit.formatMoneyPt(feeVal)} (Líquido motorista: ${audit.formatMoneyPt(cancelFinance?.feeSplit?.driverNetAmount || 0)}).` : 'Sem multa de cancelamento.',
            refundVal > 0 ? `Estorno automático: ${audit.formatMoneyPt(refundVal)}.` : ''
          ].filter(Boolean).join(' '),
          severity: feeVal > 0 || refundVal > 0 ? 'atencao' : 'info',
          actorRole: actorRoleLabel,
          actorId: isAdmin ? getAdminActorContext(req).actorId : (isDriver ? driverSession.sub : (clientSession?.sub || before.clientId || null)),
          actorName: isAdmin ? 'Administrador Master' : (isDriver ? (before.driverName || 'Motorista') : (before.clientName || 'Passageiro')),
          entityType: 'corrida',
          entityId: id,
          entityLabel: before.rideCode || id,
          relatedIds: {
            rideId: id,
            rideCode: before.rideCode,
            driverId: before.driverId || null,
            transactionId: cancelFinance?.transactionId || null
          },
          changes: [
            { field: 'status', label: 'Status da Corrida', before: String(before.status), after: 'cancelada', summary: `${before.status} -> cancelada` },
            ...(feeVal > 0 ? [{ field: 'cancellationFeeApplied', label: 'Multa de Cancelamento', before: 'R$ 0,00', after: audit.formatMoneyPt(feeVal), summary: `Multa: ${audit.formatMoneyPt(feeVal)}` }] : []),
            ...(refundVal > 0 ? [{ field: 'refundAmount', label: 'Valor Estornado', before: 'R$ 0,00', after: audit.formatMoneyPt(refundVal), summary: `Estorno: ${audit.formatMoneyPt(refundVal)}` }] : [])
          ],
          ipAddress: getRequestClientIp(req),
          userAgent: String(req.headers['user-agent'] || '').slice(0, 220) || null
        });
      }

      const [enrichedUpdated] = await attachClientRatingsToRides([updated]);
      let autoDispatches = [];
      if (body.status === 'em_andamento' && before.status !== 'em_andamento') {
        autoDispatches = await dispatchTrustedContactsForRide(
          enrichedUpdated,
          'ride_started',
          req.headers.host || 'localhost:5173'
        );
      }
      const existingDispatches = Array.isArray(enrichedUpdated.trustedContactsDispatches)
        ? enrichedUpdated.trustedContactsDispatches
        : [];
      const finalDispatches = autoDispatches.length > 0
        ? [...existingDispatches, ...autoDispatches]
        : existingDispatches;
      const trackToken = security.signTrackingToken('ride', enrichedUpdated.id);
      const trackUrl = `/track/${encodeURIComponent(enrichedUpdated.id)}?t=${encodeURIComponent(trackToken)}`;
      const responseRide = {
        ...enrichedUpdated,
        trustedContactsDispatches: finalDispatches,
        trackingUrl: trackUrl
      };

      await push.handleRideChange(before, responseRide);
      realtimeHub.publish(
        'ride:updated',
        { rideId: responseRide.id, status: responseRide.status },
        { rideId: responseRide.id, clientId: responseRide.clientId || null, driverId: responseRide.driverId || null }
      );
      return sendJson(res, 200, {
        ok: true,
        id,
        status: responseRide.status,
        ride: responseRide,
        alsoCancelledRideIds,
        trustedContactsDispatches: autoDispatches,
        cancellationFeeApplied: cancelFinance?.appliedCancellationFee || 0,
        refundAmount: cancelFinance?.refundAmount || 0
      });
    }

    // ALTERAÇÃO DE ROTA (ORIGEM / DESTINO) ANTES DO INÍCIO DA VIAGEM (ESTILO UBER)
    const rideRouteMatch = pathname.match(/^\/api\/rides\/([^/]+)\/route$/);
    if (rideRouteMatch && method === 'PATCH') {
      const id = normalizeRideId(decodeURIComponent(rideRouteMatch[1]));
      const body = await parseBody(req);
      const isAdmin = await isAuthorizedAdmin(req);
      const clientSession = verifyClientToken(req);
      if (!isAdmin && !clientSession) {
        return sendJson(res, 401, { ok: false, error: 'Sessão de passageiro não autorizada para alterar a rota.' });
      }

      const prev = await db.query('SELECT * FROM public.rides WHERE id = $1', [id]);
      if (!prev.rows[0]) {
        return sendJson(res, 404, { ok: false, error: 'Corrida não encontrada.' });
      }
      const before = formatRideFromDb(prev.rows[0]);
      const clientPhoneDigits = clientSession ? normalizePhoneDigitsServer(clientSession.phone) : '';
      const ridePhoneDigits = normalizePhoneDigitsServer(before.clientPhone);
      const isOwnerClient = Boolean(
        clientSession && (
          (before.clientId && clientSession.sub === before.clientId) ||
          (!before.clientId && clientPhoneDigits.length >= 8 && ridePhoneDigits === clientPhoneDigits)
        )
      );
      if (!isAdmin && !isOwnerClient) {
        return sendJson(res, 401, { ok: false, error: 'Sem permissão para alterar a rota desta corrida.' });
      }

      const editableStatuses = [
        'aguardando_pagamento',
        'aguardando_confirmacao',
        'na_fila',
        'confirmada',
        'a_caminho',
        'no_local'
      ];
      if (!editableStatuses.includes(before.status)) {
        return sendJson(res, 400, {
          ok: false,
          error: before.status === 'em_andamento'
            ? 'A viagem já foi iniciada; só é possível alterar a rota ou o destino antes do embarque.'
            : 'Esta corrida já foi encerrada e não permite alteração de rota.'
        });
      }

      const sanitizePoint = (pt, fallback) => {
        if (!pt || typeof pt !== 'object') return fallback;
        const addr = String(pt.address || '').trim().slice(0, 260);
        const lat = Number(pt.lat);
        const lng = Number(pt.lng);
        if (!addr || !Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
          return fallback;
        }
        return {
          ...(fallback || {}),
          ...pt,
          address: addr,
          lat,
          lng
        };
      };

      const nextOrigin = body.origin ? sanitizePoint(body.origin, null) : before.origin;
      const nextDestination = body.destination ? sanitizePoint(body.destination, null) : before.destination;
      if (!nextOrigin?.address || !nextDestination?.address) {
        return sendJson(res, 400, { ok: false, error: 'Informe um endereço válido com coordenadas de origem e destino.' });
      }

      const originChanged =
        nextOrigin.address !== before.origin?.address ||
        Math.abs(Number(nextOrigin.lat) - Number(before.origin?.lat || 0)) > 0.0001 ||
        Math.abs(Number(nextOrigin.lng) - Number(before.origin?.lng || 0)) > 0.0001;
      const destChanged =
        nextDestination.address !== before.destination?.address ||
        Math.abs(Number(nextDestination.lat) - Number(before.destination?.lat || 0)) > 0.0001 ||
        Math.abs(Number(nextDestination.lng) - Number(before.destination?.lng || 0)) > 0.0001;

      if (!originChanged && !destChanged) {
        const [enrichedUnchanged] = await attachClientRatingsToRides([before]);
        return sendJson(res, 200, {
          ok: true,
          id,
          unchanged: true,
          ride: enrichedUnchanged,
          previousPrice: before.totalPrice,
          newPrice: before.totalPrice,
          priceChanged: false
        });
      }

      const cfg = await getCachedSystemConfig();
      const allCats = finance.normalizeCategoriesServer(cfg);
      const mappedCatId = finance.mapLegacyCategoryIdServer(before.category || 'kavro_go');
      const matchedCat = allCats.find(c => c.id === before.category || c.id === mappedCatId) || allCats[0];
      const submittedDist = Number(body.distanceKm);
      const submittedDur = Number(body.durationMin);

      const officialFare = !(isAdmin && before.isManualBooking)
        ? security.calculateOfficialRidePriceServer({
            cfg,
            categoryObj: matchedCat,
            distanceKm: Number.isFinite(submittedDist) && submittedDist > 0 ? submittedDist : 0,
            durationMin: Number.isFinite(submittedDur) && submittedDur > 0 ? submittedDur : 0,
            origin: nextOrigin,
            destination: nextDestination,
            timeStr: before.time,
            city: nextOrigin.city || before.city
          })
        : null;

      const commPct = Number(
        before.commissionPercent ??
        finance.resolveCommissionPercentForRide(cfg, matchedCat, before.paymentMethod) ??
        cfg.platformCommissionPercent ??
        20
      );
      const commFixed = finance.resolveCommissionFixedForRide
        ? finance.resolveCommissionFixedForRide(cfg, before)
        : Math.max(0, finance.round2(before.commissionFixed ?? cfg.platformCommissionFixed ?? 0));

      const nextDist = officialFare ? officialFare.effectiveDistanceKm : (submittedDist > 0 ? finance.round2(submittedDist) : before.distanceKm);
      const nextDur = officialFare ? officialFare.effectiveDurationMin : (submittedDur > 0 ? Math.round(submittedDur) : before.durationMin);
      const rawNextTotal = officialFare
        ? officialFare.totalPrice
        : (body.totalPrice !== undefined && isAdmin ? finance.round2(body.totalPrice) : before.totalPrice);
      const split = finance.calculateSplit(rawNextTotal, commPct, commFixed);

      const tx = await finance.getPaymentTxByRide(id);
      let nextPaymentTxId = before.paymentTxId;
      let nextPixQrCode = before.pixQrCode;
      let nextPixCopyPaste = before.pixCopyPaste;
      let nextPaidAmount = before.paidAmount;

      if (before.paymentMethod === 'pix') {
        if (before.status === 'aguardando_pagamento') {
          if (tx && String(tx.gatewayTxId || '').startsWith('pi_')) {
            await finance.refundGatewayPayment(tx, null).catch(() => {});
          }
          try {
            const { tx: newPixTx } = await finance.createPixChargeForRide({
              ...before,
              origin: nextOrigin,
              destination: nextDestination,
              distanceKm: nextDist,
              durationMin: nextDur,
              totalPrice: split.grossAmount,
              commissionPercent: split.commissionPercent,
              commissionAmount: split.commissionAmount,
              driverNetAmount: split.driverNetAmount
            });
            nextPaymentTxId = newPixTx.id;
            nextPixQrCode = newPixTx.pixQrCode;
            nextPixCopyPaste = newPixTx.pixCopyPaste;
          } catch (pixErr) {
            return sendJson(res, 402, {
              ok: false,
              error: pixErr?.message || 'Não foi possível atualizar a cobrança PIX para a nova rota.'
            });
          }
        } else if (before.paymentStatus === 'confirmado' || before.paymentStatus === 'pago') {
          const alreadyPaid = finance.round2(before.paidAmount || before.totalPrice || 0);
          if (split.grossAmount > alreadyPaid + 0.01) {
            return sendJson(res, 400, {
              ok: false,
              error: `Esta viagem já foi paga via PIX (${audit.formatMoneyPt(alreadyPaid)}). Para um trajeto de valor maior (${audit.formatMoneyPt(split.grossAmount)}), cancele com estorno automático e solicite novamente.`
            });
          }
          const refundDiff = finance.round2(Math.max(0, alreadyPaid - split.grossAmount));
          if (refundDiff >= 0.05 && tx) {
            const refRes = await finance.refundGatewayPayment(tx, refundDiff);
            if (!refRes.ok) {
              return sendJson(res, 402, {
                ok: false,
                error: refRes.error || 'Não foi possível estornar a diferença do PIX para a nova rota.'
              });
            }
            nextPaidAmount = split.grossAmount;
            await finance.savePaymentTransaction({
              ...tx,
              finalAmount: split.grossAmount,
              paidAmount: split.grossAmount,
              refundedAmount: finance.round2(Number(tx.refundedAmount || 0) + refundDiff),
              commissionPercent: split.commissionPercent,
              commissionAmount: split.commissionAmount,
              driverNetAmount: split.driverNetAmount
            });
          }
        }
      } else if (isCardLikeMethod(before.paymentMethod)) {
        const authorizedMax = finance.round2(tx?.estimatedAmount || before.estimatedPrice || before.totalPrice || 0);
        const isRealStripeHold = Boolean(tx && String(tx.gatewayTxId || '').startsWith('pi_'));
        if (split.grossAmount > authorizedMax + 0.01 && isRealStripeHold) {
          const reAuth = await finance.authorizeCardForRide(
            {
              ...before,
              totalPrice: split.grossAmount,
              commissionPercent: split.commissionPercent,
              commissionFixed: split.commissionFixed
            },
            {
              cardId: before.cardId,
              cardLast4: before.cardLast4,
              cardBrand: before.cardBrand
            }
          );
          if (!reAuth.authorized) {
            return sendJson(res, 402, {
              ok: false,
              error: reAuth.error || 'O novo destino excede a pré-autorização do cartão. Cancele e faça uma nova solicitação.'
            });
          }
          await finance.refundGatewayPayment(tx, null).catch(() => {});
          nextPaymentTxId = reAuth.tx.id;
        } else if (tx) {
          await finance.savePaymentTransaction({
            ...tx,
            finalAmount: split.grossAmount,
            commissionPercent: split.commissionPercent,
            commissionAmount: split.commissionAmount,
            driverNetAmount: split.driverNetAmount
          });
        }
      } else if (before.paymentMethod === 'carteira' && (before.paymentStatus === 'confirmado' || before.paymentStatus === 'pago')) {
        const alreadyPaid = finance.round2(before.paidAmount || before.totalPrice || 0);
        const diff = finance.round2(split.grossAmount - alreadyPaid);
        if (diff > 0.01 && before.clientId) {
          const extraDebit = await finance.debitClientWalletForRide({
            clientId: before.clientId,
            clientName: before.clientName,
            clientPhone: before.clientPhone,
            rideId: id,
            rideCode: before.rideCode || id,
            amount: diff,
            entryType: 'route_adjustment',
            idempotencyKey: `wallet_route_inc_${id}_${Date.now()}`,
            description: `Complemento por alteração de rota (${before.rideCode || id})`
          });
          if (!extraDebit.ok) {
            return sendJson(res, 402, {
              ok: false,
              error: extraDebit.error || 'Saldo insuficiente na carteira para cobrir a diferença da nova rota.'
            });
          }
          nextPaidAmount = split.grossAmount;
        } else if (diff < -0.01 && before.clientId) {
          await finance.creditClientWalletAdjustment({
            clientId: before.clientId,
            clientName: before.clientName,
            clientPhone: before.clientPhone,
            rideId: id,
            rideCode: before.rideCode || id,
            amount: Math.abs(diff),
            entryType: 'route_adjustment',
            idempotencyKey: `wallet_route_dec_${id}_${Date.now()}`,
            description: `Reembolso parcial por redução de rota (${before.rideCode || id})`
          });
          nextPaidAmount = split.grossAmount;
        }
        if (tx) {
          await finance.savePaymentTransaction({
            ...tx,
            finalAmount: split.grossAmount,
            paidAmount: split.grossAmount,
            commissionPercent: split.commissionPercent,
            commissionAmount: split.commissionAmount,
            driverNetAmount: split.driverNetAmount
          });
        }
      } else if (tx) {
        await finance.savePaymentTransaction({
          ...tx,
          estimatedAmount: split.grossAmount,
          finalAmount: split.grossAmount,
          commissionPercent: split.commissionPercent,
          commissionAmount: split.commissionAmount,
          driverNetAmount: split.driverNetAmount
        });
      }

      const nowIso = new Date().toISOString();
      const nextSnapshot = {
        ...(before.appliedFareSnapshot || {}),
        routeAdjusted: true,
        routeAdjustedAt: nowIso,
        previousOriginAddress: before.origin?.address || null,
        previousDestinationAddress: before.destination?.address || null,
        previousTotalPrice: before.totalPrice
      };

      const updated = await upsertFullRide({
        ...before,
        origin: nextOrigin,
        destination: nextDestination,
        distanceKm: nextDist,
        durationMin: nextDur,
        estimatedPrice: before.estimatedPrice ?? before.totalPrice,
        totalPrice: split.grossAmount,
        paidAmount: nextPaidAmount,
        commissionPercent: split.commissionPercent,
        commissionFixed: split.commissionFixed,
        commissionAmount: split.commissionAmount,
        driverNetAmount: split.driverNetAmount,
        paymentTxId: nextPaymentTxId,
        pixQrCode: nextPixQrCode,
        pixCopyPaste: nextPixCopyPaste,
        appliedFareSnapshot: nextSnapshot
      });

      await audit.recordAuditEvent({
        category: 'financeiro_corridas',
        actionKey: 'ride_route_updated',
        title: `Rota alterada antes do embarque (${before.rideCode || id})`,
        summary: `Passageiro atualizou ${originChanged && destChanged ? 'origem e destino' : originChanged ? 'local de embarque' : 'destino'}. Valor ajustado de ${audit.formatMoneyPt(before.totalPrice)} para ${audit.formatMoneyPt(split.grossAmount)}.`,
        severity: 'info',
        actorRole: isAdmin ? 'admin_master' : 'passageiro',
        actorId: isAdmin ? getAdminActorContext(req).actorId : (clientSession?.sub || before.clientId || null),
        actorName: isAdmin ? 'Administrador Master' : (before.clientName || 'Passageiro'),
        entityType: 'corrida',
        entityId: id,
        entityLabel: before.rideCode || id,
        relatedIds: { rideId: id, rideCode: before.rideCode, driverId: before.driverId || null },
        changes: [
          ...(originChanged ? [{ field: 'origin', label: 'Origem', before: String(before.origin?.address || ''), after: nextOrigin.address, summary: `${before.origin?.address} -> ${nextOrigin.address}` }] : []),
          ...(destChanged ? [{ field: 'destination', label: 'Destino', before: String(before.destination?.address || ''), after: nextDestination.address, summary: `${before.destination?.address} -> ${nextDestination.address}` }] : []),
          ...(Math.abs(split.grossAmount - before.totalPrice) >= 0.01 ? [{ field: 'totalPrice', label: 'Tarifa da Viagem', before: audit.formatMoneyPt(before.totalPrice), after: audit.formatMoneyPt(split.grossAmount), summary: `${audit.formatMoneyPt(before.totalPrice)} -> ${audit.formatMoneyPt(split.grossAmount)}` }] : [])
        ],
        ipAddress: getRequestClientIp(req),
        userAgent: String(req.headers['user-agent'] || '').slice(0, 220) || null
      });

      if (before.driverId) {
        await db.query(
          `INSERT INTO public.notifications (id, title, message, type, ride_id, read, timestamp)
           VALUES ($1, $2, $3, 'ride', $4, false, NOW())`,
          [
            `notif-route-${Date.now()}`,
            `🔄 Rota atualizada (${before.rideCode || id})`,
            `${before.clientName} alterou a rota antes do embarque: ${nextOrigin.address} ➔ ${nextDestination.address} (${audit.formatMoneyPt(split.grossAmount)}).`,
            id
          ]
        ).catch(() => {});
      }

      const [enrichedUpdated] = await attachClientRatingsToRides([updated]);
      const trackToken = security.signTrackingToken('ride', enrichedUpdated.id);
      const responseRide = {
        ...enrichedUpdated,
        trackingUrl: `/track/${encodeURIComponent(enrichedUpdated.id)}?t=${encodeURIComponent(trackToken)}`
      };

      realtimeHub.publish(
        'ride:updated',
        { rideId: responseRide.id, status: responseRide.status, routeUpdated: true },
        { rideId: responseRide.id, clientId: responseRide.clientId || null, driverId: responseRide.driverId || null }
      );
      return sendJson(res, 200, {
        ok: true,
        id,
        ride: responseRide,
        previousPrice: before.totalPrice,
        newPrice: split.grossAmount,
        priceChanged: Math.abs(split.grossAmount - before.totalPrice) >= 0.01
      });
    }

    // LIVE GPS LOCATION SYNC (Autenticado)
    const rideLocationMatch = pathname.match(/^\/api\/rides\/([^/]+)\/location$/);
    if (rideLocationMatch) {
      const id = normalizeRideId(decodeURIComponent(rideLocationMatch[1]));
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      const clientSession = verifyClientToken(req);
      const trackTok = String(url.searchParams.get('t') || '').trim();
      const hasValidTracking = method === 'GET' && trackTok && security.verifyTrackingToken(trackTok, 'ride', id);

      const metaRes = await db.query('SELECT * FROM public.rides WHERE id = $1', [id]);
      if (!metaRes.rows[0]) return sendJson(res, 404, { ok: false, error: 'Ride not found' });
      const row = metaRes.rows[0];
      const isAssignedDriver = Boolean(driverSession?.sub && row.driver_id && driverSession.sub === row.driver_id);
      const isOwnerClient = Boolean(
        clientSession?.sub &&
        ((row.client_id && clientSession.sub === row.client_id) ||
          (clientSession.phone && row.client_phone &&
            normalizePhoneDigitsServer(clientSession.phone) === normalizePhoneDigitsServer(row.client_phone)))
      );

      if (!isAdmin && !isAssignedDriver && !isOwnerClient && !hasValidTracking) {
        return sendJson(res, 401, { ok: false, error: 'Sessão não autorizada para acessar GPS desta corrida.' });
      }

      if (method === 'GET') {
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
        if (!isAdmin && ((role === 'driver' && !isAssignedDriver) || (role === 'client' && !isOwnerClient))) {
          return sendJson(res, 403, { ok: false, error: 'Sem permissão para atualizar esta coordenada.' });
        }
        const loc = body.location;
        if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
          return sendJson(res, 400, { ok: false, error: 'Invalid location' });
        }
        const nowMs = Date.now();
        const payload = {
          lat: Number(loc.lat),
          lng: Number(loc.lng),
          heading: Number(loc.heading || 0),
          speedKmH: Number(loc.speedKmH || 0),
          updatedAt: new Date(nowMs).toISOString()
        };

        const prevDriverLoc = row.driver_location || null;
        let evalRes = null;
        let updRow = null;
        let rideCheckResult = null;
        const fullRideBefore = formatRideFromDb(row);

        if (role === 'driver' && row.status === 'em_andamento') {
          let rideCheckAllowed = true;
          if (fullRideBefore.clientId && !body.simulateRideCheck) {
            try {
              await ensureClientsSchema();
              const cliPrefRes = await db.query('SELECT safety_preferences FROM public.clients WHERE id = $1 LIMIT 1', [fullRideBefore.clientId]);
              if (cliPrefRes.rows[0]) {
                const cliSafety = normalizeSafetyPreferencesServer(
                  cliPrefRes.rows[0].safety_preferences || cliPrefRes.rows[0].safetyPreferences
                );
                rideCheckAllowed = cliSafety.rideCheckEnabled !== false;
              }
            } catch {
              rideCheckAllowed = true;
            }
          }
          evalRes = rideCheckAllowed
            ? security.evaluateRideCheckAnomaly(
                fullRideBefore,
                payload,
                nowMs,
                body.simulateRideCheck || null
              )
            : { triggered: false, telemetry: fullRideBefore.appliedFareSnapshot?.rideCheckTelemetry || null, rideCheck: null };
          const curSnap = fullRideBefore.appliedFareSnapshot && typeof fullRideBefore.appliedFareSnapshot === 'object'
            ? fullRideBefore.appliedFareSnapshot
            : {};
          const nextSnap = {
            ...curSnap,
            rideCheckTelemetry: evalRes.telemetry,
            ...(evalRes.triggered && evalRes.rideCheck ? { rideCheck: evalRes.rideCheck } : {})
          };
          const r = await db.query(
            `UPDATE public.rides
             SET driver_location = $1, applied_fare_snapshot = $2, updated_at = NOW()
             WHERE id = $3
             RETURNING *`,
            [JSON.stringify(payload), JSON.stringify(nextSnap), id]
          );
          if (!r.rows[0]) return sendJson(res, 404, { ok: false, error: 'Ride not found' });
          updRow = r.rows[0];
          rideCheckResult = evalRes.rideCheck || curSnap.rideCheck || null;
        } else {
          const col = role === 'client' ? 'client_location' : 'driver_location';
          const r = await db.query(
            `UPDATE public.rides SET ${col} = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
            [JSON.stringify(payload), id]
          );
          if (!r.rows[0]) return sendJson(res, 404, { ok: false, error: 'Ride not found' });
          updRow = r.rows[0];
        }

        // Grava histórico em ride_trail_points apenas a cada >= 10s OU deslocamento >= 25m (reduz ~80% de escrita no banco mantendo SSE instantâneo)
        if (role === 'driver' && (updRow.status === 'a_caminho' || updRow.status === 'em_andamento')) {
          const prevTsMs = prevDriverLoc?.updatedAt ? new Date(prevDriverLoc.updatedAt).getTime() : 0;
          const elapsedSec = prevTsMs > 0 && Number.isFinite(prevTsMs) ? (nowMs - prevTsMs) / 1000 : 999;
          const movedMeters = (prevDriverLoc && Number.isFinite(Number(prevDriverLoc.lat)) && Number.isFinite(Number(prevDriverLoc.lng)))
            ? security.haversineDistanceKm(prevDriverLoc.lat, prevDriverLoc.lng, payload.lat, payload.lng) * 1000
            : 999;

          if (!prevDriverLoc || elapsedSec >= 10 || movedMeters >= 25) {
            try {
              await db.query(
                `INSERT INTO public.ride_trail_points (ride_id, status, lat, lng, speed_kmh, heading, recorded_at)
                 VALUES ($1::varchar, $2::varchar, $3::float8, $4::float8, $5::float8, $6::float8, NOW())`,
                [id, updRow.status, payload.lat, payload.lng, payload.speedKmH, payload.heading]
              );
            } catch (err) {
              console.error('[trail insert]', err.message);
            }
          }
        }

        realtimeHub.publish(
          'gps:location',
          {
            rideId: updRow.id,
            role,
            status: updRow.status,
            driverLocation: updRow.driver_location || null,
            clientLocation: updRow.client_location || null
          },
          { rideId: updRow.id, driverId: row.driver_id, clientId: row.client_id }
        );

        if (evalRes?.triggered && evalRes?.rideCheck) {
          realtimeHub.publish(
            'ride:ridecheck',
            { rideId: updRow.id, rideCheck: evalRes.rideCheck },
            { rideId: updRow.id, driverId: row.driver_id, clientId: row.client_id }
          );
          realtimeHub.publish(
            'ride:updated',
            { rideId: updRow.id, status: updRow.status, rideCheck: evalRes.rideCheck },
            { rideId: updRow.id, driverId: row.driver_id, clientId: row.client_id }
          );
          const targets = [];
          if (fullRideBefore.clientPhone) targets.push(push.clientExternalId(fullRideBefore.clientPhone));
          if (fullRideBefore.driverId || fullRideBefore.driverPhone) {
            targets.push(push.driverExternalId(fullRideBefore.driverId, fullRideBefore.driverPhone));
          }
          if (targets.length > 0) {
            push.sendToExternalIds(
              targets,
              '🛡️ Verificação de Segurança RideCheck',
              `${evalRes.rideCheck.reasonLabel} Confirme no app se está tudo bem.`,
              { url: `/viagem/${encodeURIComponent(id)}` }
            ).catch(() => {});
          }
        }

        return sendJson(res, 200, {
          ok: true,
          id: updRow.id,
          status: updRow.status,
          paymentStatus: updRow.payment_status,
          driverLocation: updRow.driver_location || null,
          clientLocation: updRow.client_location || null,
          rideCheck: rideCheckResult
        });
      }
    }

    // ROTA DE ACOMPANHAMENTO EXTERNO COM TOKEN ASSINADO (CONTATOS DE CONFIANÇA)
    const rideTrackMatch = pathname.match(/^\/api\/rides\/([^/]+)\/track$/);
    if (rideTrackMatch && method === 'GET') {
      const id = normalizeRideId(decodeURIComponent(rideTrackMatch[1]));
      const rideRes = await db.query('SELECT * FROM public.rides WHERE id = $1', [id]);
      if (!rideRes.rows[0]) {
        return sendJson(res, 404, { ok: false, error: 'Corrida não encontrada.' });
      }
      const rawRide = formatRideFromDb(rideRes.rows[0]);
      const [ride] = await attachClientRatingsToRides([rawRide]);
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      const clientSession = verifyClientToken(req);
      const qTrackTok = String(url.searchParams.get('t') || '').trim();
      const hasValidTracking = Boolean(qTrackTok && security.verifyTrackingToken(qTrackTok, 'ride', id));
      const isAssignedDriver = Boolean(driverSession?.sub && ride.driverId && driverSession.sub === ride.driverId);
      const ridePhoneDigits = normalizePhoneDigitsServer(ride.clientPhone);
      const isOwnerClient = Boolean(
        (clientSession?.sub && ride.clientId && clientSession.sub === ride.clientId) ||
        (clientSession?.phone && ridePhoneDigits && normalizePhoneDigitsServer(clientSession.phone) === ridePhoneDigits)
      );

      if (!isAdmin && !isAssignedDriver && !isOwnerClient && !hasValidTracking) {
        return sendJson(res, 401, { ok: false, error: 'Link de rastreamento inválido ou expirado.' });
      }

      return sendJson(res, 200, {
        ok: true,
        ride: security.sanitizeRideForViewer(ride, {
          isAdmin,
          isDriver: isAssignedDriver,
          isOwnerClient,
          isTrackingViewer: true
        })
      });
    }

    // COMPARTILHAMENTO MANUAL OU REENVIO VIA API PARA CONTATOS DE CONFIANÇA
    const rideShareTrustedMatch = pathname.match(/^\/api\/rides\/([^/]+)\/share-trusted-contacts$/);
    if (rideShareTrustedMatch && method === 'POST') {
      const id = normalizeRideId(decodeURIComponent(rideShareTrustedMatch[1]));
      const rideRes = await db.query('SELECT * FROM public.rides WHERE id = $1', [id]);
      if (!rideRes.rows[0]) {
        return sendJson(res, 404, { ok: false, error: 'Corrida não encontrada.' });
      }
      const ride = formatRideFromDb(rideRes.rows[0]);
      const isAdmin = await isAuthorizedAdmin(req);
      const clientSession = verifyClientToken(req);
      const ridePhoneDigits = normalizePhoneDigitsServer(ride.clientPhone);
      const isOwnerClient = Boolean(
        (clientSession?.sub && ride.clientId && clientSession.sub === ride.clientId) ||
        (clientSession?.phone && ridePhoneDigits && normalizePhoneDigitsServer(clientSession.phone) === ridePhoneDigits)
      );
      if (!isAdmin && !isOwnerClient) {
        return sendJson(res, 401, { ok: false, error: 'Faça login para compartilhar com seus contatos de confiança.' });
      }
      const dispatches = await dispatchTrustedContactsForRide(ride, 'manual_share', req.headers.host || 'localhost:5173');
      const trackToken = security.signTrackingToken('ride', ride.id);
      const trackingUrl = `/track/${encodeURIComponent(ride.id)}?t=${encodeURIComponent(trackToken)}`;
      return sendJson(res, 200, { ok: true, dispatches, trackingUrl });
    }

    // RESPOSTA DO PASSAGEIRO / MOTORISTA AO ALERTA RIDECHECK (OK | SOS | TIMEOUT 60s)
    const rideCheckRespondMatch = pathname.match(/^\/api\/rides\/([^/]+)\/ridecheck\/respond$/);
    if (rideCheckRespondMatch && (method === 'POST' || method === 'PATCH')) {
      const id = normalizeRideId(decodeURIComponent(rideCheckRespondMatch[1]));
      const rideRes = await db.query('SELECT * FROM public.rides WHERE id = $1', [id]);
      if (!rideRes.rows[0]) {
        return sendJson(res, 404, { ok: false, error: 'Corrida não encontrada.' });
      }
      const ride = formatRideFromDb(rideRes.rows[0]);
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      const clientSession = verifyClientToken(req);
      const isAssignedDriver = Boolean(driverSession?.sub && ride.driverId && driverSession.sub === ride.driverId);
      const ridePhoneDigits = normalizePhoneDigitsServer(ride.clientPhone);
      const isOwnerClient = Boolean(
        (clientSession?.sub && ride.clientId && clientSession.sub === ride.clientId) ||
        (clientSession?.phone && ridePhoneDigits && normalizePhoneDigitsServer(clientSession.phone) === ridePhoneDigits)
      );
      if (!isAdmin && !isAssignedDriver && !isOwnerClient) {
        return sendJson(res, 401, { ok: false, error: 'Sessão não autorizada para responder ao RideCheck.' });
      }

      const body = await parseBody(req);
      const decision = String(body.decision || '').trim().toLowerCase();
      if (!['ok', 'sos', 'timeout'].includes(decision)) {
        return sendJson(res, 400, { ok: false, error: 'Decisão inválida. Envie "ok", "sos" ou "timeout".' });
      }

      const snap = ride.appliedFareSnapshot && typeof ride.appliedFareSnapshot === 'object'
        ? { ...ride.appliedFareSnapshot }
        : {};
      const currentCheck = snap.rideCheck || null;
      if (!currentCheck) {
        return sendJson(res, 400, { ok: false, error: 'Nenhum alerta RideCheck ativo nesta corrida.' });
      }
      if (currentCheck.status === 'confirmado_ok' || currentCheck.status === 'escalado_sos') {
        return sendJson(res, 200, { ok: true, idempotent: true, rideCheck: currentCheck });
      }

      const now = new Date();
      const actorRole = isAdmin ? 'admin' : (isAssignedDriver ? 'motorista' : 'passageiro');
      const respondedBy = decision === 'timeout' ? 'sistema_timeout' : actorRole;

      if (decision === 'ok') {
        const nextCheck = {
          ...currentCheck,
          status: 'confirmado_ok',
          respondedBy,
          respondedAt: now.toISOString()
        };
        const nextSnap = { ...snap, rideCheck: nextCheck };
        await db.query(
          'UPDATE public.rides SET applied_fare_snapshot = $1, updated_at = NOW() WHERE id = $2',
          [JSON.stringify(nextSnap), id]
        );
        await audit.recordAuditEvent({
          category: 'sistema',
          actionKey: 'ridecheck_confirmed_ok',
          title: `RideCheck confirmado como seguro (${ride.rideCode || id})`,
          summary: `${actorRole === 'motorista' ? 'Motorista' : 'Passageiro'} confirmou que está tudo bem após alerta de ${currentCheck.reason}.`,
          severity: 'info',
          actorRole,
          actorId: isAdmin ? 'admin-master' : (isAssignedDriver ? driverSession.sub : clientSession.sub),
          actorName: isAssignedDriver ? (ride.driverName || 'Motorista') : (ride.clientName || 'Passageiro'),
          entityType: 'corrida',
          entityId: id,
          entityLabel: ride.rideCode || id
        }).catch(() => {});

        realtimeHub.publish(
          'ride:ridecheck',
          { rideId: id, rideCheck: nextCheck },
          { rideId: id, clientId: ride.clientId || null, driverId: ride.driverId || null }
        );
        realtimeHub.publish(
          'ride:updated',
          { rideId: id, status: ride.status, rideCheck: nextCheck },
          { rideId: id, clientId: ride.clientId || null, driverId: ride.driverId || null }
        );
        return sendJson(res, 200, { ok: true, rideCheck: nextCheck });
      }

      // Escalonamento para Central SOS (botão "Preciso de Ajuda" ou timeout de 60s sem resposta)
      const sosId = `sos-rc-${now.getTime()}`;
      const lat = Number(currentCheck.lat || ride.driverLocation?.lat || ride.origin?.lat || -28.39);
      const lng = Number(currentCheck.lng || ride.driverLocation?.lng || ride.origin?.lng || -49.39);
      const reasonNote = decision === 'timeout'
        ? `⚠️ RIDECHECK PREVENTIVO (Sem confirmação em 60s): ${currentCheck.reasonLabel}`
        : `🚨 SOS ACIONADO NO RIDECHECK: ${currentCheck.reasonLabel}`;

      const alertData = {
        id: sosId,
        role: isAssignedDriver ? 'motorista' : 'passageiro',
        name: isAssignedDriver ? (ride.driverName || 'Motorista em Rota') : (ride.clientName || 'Passageiro em Rota'),
        phone: isAssignedDriver ? (ride.driverPhone || '') : (ride.clientPhone || ''),
        clientName: ride.clientName || 'Passageiro',
        clientPhone: ride.clientPhone || '',
        driverId: ride.driverId || null,
        driverName: ride.driverName || null,
        driverPhone: ride.driverPhone || '',
        driverVehicle: ride.driverVehicle || null,
        driverPlate: ride.driverPlate || null,
        lat,
        lng,
        accuracy: 15,
        heading: Number(ride.driverLocation?.heading || 0),
        speedKmH: Number(ride.driverLocation?.speedKmH || 0),
        address: ride.origin?.address || 'Em deslocamento durante corrida ativa',
        rideId: ride.id,
        rideCode: ride.rideCode || ride.id,
        status: 'ativo',
        active: true,
        notes: reasonNote,
        updatedAt: now.toISOString(),
        updatedAtMs: now.getTime(),
        createdAt: now.toISOString()
      };

      const persistedSos = await finance.upsertSosAlertDb(alertData);
      sosMemoryStore.set(sosId, persistedSos || alertData);

      db.query(
        `INSERT INTO public.notifications (id, title, message, type, ride_id, read, timestamp)
         VALUES ($1, $2, $3, 'sos_alert', $4, false, NOW())`,
        [
          `notif-sos-rc-${now.getTime()}`,
          `🚨 RIDECHECK SOS (${ride.rideCode || ride.id})`,
          reasonNote,
          ride.id
        ]
      ).catch(() => {});

      push.sendToExternalIds(
        [push.ADMIN_EXTERNAL_ID],
        `🚨 ALERTA PREVENTIVO RIDECHECK (${ride.rideCode || ride.id})`,
        reasonNote,
        { url: `/sos/${encodeURIComponent(sosId)}` }
      ).catch(() => {});

      const nextCheck = {
        ...currentCheck,
        status: 'escalado_sos',
        respondedBy,
        respondedAt: now.toISOString(),
        sosAlertId: sosId
      };
      const nextSnap = { ...snap, rideCheck: nextCheck };
      await db.query(
        'UPDATE public.rides SET applied_fare_snapshot = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(nextSnap), id]
      );

      const dispatches = await dispatchTrustedContactsForRide(
        { ...ride, appliedFareSnapshot: nextSnap },
        'ridecheck_escalation',
        req.headers.host || 'localhost:5173'
      );

      await audit.recordAuditEvent({
        category: 'sistema',
        actionKey: 'ridecheck_escalated_sos',
        title: `RideCheck escalado para Central SOS (${ride.rideCode || ride.id})`,
        summary: `${reasonNote}. Chamado ${sosId} aberto na Central SOS e contatos de confiança notificados.`,
        severity: 'critico',
        actorRole: decision === 'timeout' ? 'sistema' : actorRole,
        actorId: sosId,
        actorName: decision === 'timeout' ? 'Monitor RideCheck (60s)' : (ride.clientName || 'Participante'),
        entityType: 'corrida',
        entityId: id,
        entityLabel: ride.rideCode || id,
        relatedIds: { rideId: id, sosAlertId: sosId }
      }).catch(() => {});

      realtimeHub.publish('sos:updated', { sosId, status: 'ativo', active: true, rideId: id }, { sosId });
      realtimeHub.publish(
        'ride:ridecheck',
        { rideId: id, rideCheck: nextCheck, sosAlertId: sosId },
        { rideId: id, clientId: ride.clientId || null, driverId: ride.driverId || null }
      );
      realtimeHub.publish(
        'ride:updated',
        { rideId: id, status: ride.status, rideCheck: nextCheck },
        { rideId: id, clientId: ride.clientId || null, driverId: ride.driverId || null }
      );

      return sendJson(res, 200, {
        ok: true,
        rideCheck: nextCheck,
        sosAlert: persistedSos || alertData,
        dispatches
      });
    }

    // CHAT EM TEMPO REAL DA CORRIDA (Motorista <-> Passageiro — Autenticação Estrita)
    const rideMessagesMatch = pathname.match(/^\/api\/rides\/([^/]+)\/messages$/);
    if (rideMessagesMatch) {
      await finance.ensureExtendedSchema();
      const id = normalizeRideId(decodeURIComponent(rideMessagesMatch[1]));
      const rideRes = await db.query('SELECT * FROM public.rides WHERE id = $1', [id]);
      if (!rideRes.rows[0]) {
        return sendJson(res, 404, { ok: false, error: 'Corrida não encontrada.' });
      }
      const ride = formatRideFromDb(rideRes.rows[0]);
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      const clientSession = verifyClientToken(req);

      const rideClientPhoneDigits = normalizePhoneDigitsServer(ride.clientPhone);
      const isAssignedDriver = Boolean(
        driverSession?.sub && ride.driverId && driverSession.sub === ride.driverId
      );
      const isOwnerClient = Boolean(
        (clientSession?.sub && ride.clientId && clientSession.sub === ride.clientId) ||
        (clientSession?.phone && rideClientPhoneDigits && normalizePhoneDigitsServer(clientSession.phone) === rideClientPhoneDigits)
      );

      if (!isAdmin && !isAssignedDriver && !isOwnerClient) {
        return sendJson(res, 401, { ok: false, error: 'Sem permissão para acessar o chat desta corrida.' });
      }

      if (method === 'GET') {
        const msgRes = await db.query(
          `SELECT id, ride_id, sender_role, sender_name, text, created_at
           FROM public.ride_chat_messages
           WHERE ride_id = $1
           ORDER BY created_at ASC`,
          [id]
        );
        const messages = (msgRes.rows || []).map(m => ({
          id: m.id,
          rideId: m.ride_id,
          sender: m.sender_role === 'driver' ? 'driver' : 'client',
          senderName: m.sender_name,
          text: m.text,
          createdAt: m.created_at
        }));
        return sendJson(res, 200, { ok: true, rideId: id, messages });
      }

      if (method === 'POST') {
        const body = await parseBody(req);
        const rawText = String(body.text || '').trim();
        if (!rawText) {
          return sendJson(res, 400, { ok: false, error: 'Mensagem vazia não pode ser enviada.' });
        }
        if (rawText.length > 1000) {
          return sendJson(res, 400, { ok: false, error: 'Mensagem muito longa (máximo 1000 caracteres).' });
        }

        const senderRole = body.senderRole === 'driver' && (isAssignedDriver || isAdmin)
          ? 'driver'
          : isAssignedDriver && body.senderRole !== 'client'
            ? 'driver'
            : 'client';

        const senderName = String(
          body.senderName ||
          (senderRole === 'driver' ? (ride.driverName || 'Motorista') : (ride.clientName || 'Passageiro'))
        ).trim();

        const msgId = `msg-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
        const createdAt = new Date().toISOString();

        await db.query(
          `INSERT INTO public.ride_chat_messages (id, ride_id, sender_role, sender_name, text, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [msgId, id, senderRole, senderName, rawText, createdAt]
        );

        const message = {
          id: msgId,
          rideId: id,
          sender: senderRole,
          senderName,
          text: rawText,
          createdAt
        };

        realtimeHub.publish(
          'chat:message',
          { rideId: id, message },
          { rideId: id, driverId: ride.driverId, clientId: ride.clientId }
        );

        if (process.env.ONESIGNAL_REST_API_KEY) {
          const targetExtId = senderRole === 'driver'
            ? push.clientExternalId(ride.clientPhone)
            : push.driverExternalId(ride.driverId, ride.driverPhone);
          if (targetExtId) {
            push.sendToExternalIds(
              [targetExtId],
              `💬 Mensagem de ${senderName.split(' ')[0]}`,
              rawText.slice(0, 140),
              { data: { type: 'ride_chat', rideId: id } }
            ).catch(() => {});
          }
        }

        return sendJson(res, 200, { ok: true, message });
      }
    }

    // TRILHA GPS GRAVADA DA CORRIDA (Protegida para Admin, Motorista ou Passageiro Dono)
    const rideTrailMatch = pathname.match(/^\/api\/rides\/([^/]+)\/trail$/);
    if (rideTrailMatch && method === 'GET') {
      const id = normalizeRideId(decodeURIComponent(rideTrailMatch[1]));
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      const clientSession = verifyClientToken(req);
      const rideMeta = await db.query('SELECT id, client_id, client_phone, driver_id FROM public.rides WHERE id = $1', [id]);
      const meta = rideMeta.rows[0];
      if (!meta) return sendJson(res, 404, { ok: false, error: 'Corrida não encontrada.' });
      const isAssignedDriver = Boolean(driverSession?.sub && meta.driver_id && driverSession.sub === meta.driver_id);
      const isOwnerClient = Boolean(
        clientSession?.sub &&
        ((meta.client_id && clientSession.sub === meta.client_id) ||
          (clientSession.phone && meta.client_phone &&
            normalizePhoneDigitsServer(clientSession.phone) === normalizePhoneDigitsServer(meta.client_phone)))
      );
      if (!isAdmin && !isAssignedDriver && !isOwnerClient) {
        return sendJson(res, 401, { ok: false, error: 'Sem permissão para acessar o trajeto desta corrida.' });
      }

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

    // ===== SOS TELEMETRY & EMERGENCY TRACKING (Persistido em Postgres + Autenticação) =====
    if (pathname === '/api/sos/alerts' && method === 'GET') {
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { ok: false, error: 'Acesso restrito ao Administrador Master.' });
      }
      const persistedAlerts = await finance.listSosAlertsDb();
      const ridesRes = await db.query('SELECT * FROM rides ORDER BY created_at DESC');
      const allRides = ridesRes.rows || [];
      const driversList = await finance.listDrivers();
      const nowMs = Date.now();

      const alerts = persistedAlerts.map((item) => {
        const linkedRide = item.rideId
          ? allRides.find(r => r.id === item.rideId)
          : allRides.find(r =>
              (item.phone && r.client_phone && r.client_phone.replace(/\D/g, '') === item.phone.replace(/\D/g, '')) ||
              (item.phone && r.driver_phone && r.driver_phone.replace(/\D/g, '') === item.phone.replace(/\D/g, ''))
            );

        const linkedDriver = linkedRide?.driver_id
          ? driversList.find(d => d.id === linkedRide.driver_id)
          : (item.driverId ? driversList.find(d => d.id === item.driverId) : null);

        const secondsAgo = Math.max(0, Math.round((nowMs - (item.updatedAtMs || new Date(item.updatedAt || nowMs).getTime())) / 1000));
        const sosToken = security.signTrackingToken('sos', item.id);
        return {
          ...item,
          role: item.role || 'passageiro',
          status: item.status || (item.active !== false ? 'ativo' : 'resolvido'),
          rideId: item.rideId || linkedRide?.id || null,
          rideCode: item.rideCode || (linkedRide ? `#UP - ${String(linkedRide.ride_number || 1).padStart(3, '0')}` : null),
          clientName: item.clientName || linkedRide?.client_name || item.name || 'Passageiro',
          clientPhone: item.clientPhone || linkedRide?.client_phone || item.phone || '',
          driverId: item.driverId || linkedRide?.driver_id || linkedDriver?.id || null,
          driverName: item.driverName || linkedRide?.driver_name || linkedDriver?.name || null,
          driverPhone: item.driverPhone || linkedRide?.driver_phone || linkedDriver?.phone || '',
          driverVehicle: item.driverVehicle || linkedRide?.driver_vehicle || (linkedDriver ? `${linkedDriver.vehicleBrand} ${linkedDriver.vehicleModel}` : null),
          driverPlate: item.driverPlate || linkedRide?.driver_plate || linkedDriver?.vehiclePlate || null,
          originAddress: linkedRide?.origin?.address || item.address || '',
          destinationAddress: linkedRide?.destination?.address || '',
          trackingUrl: `/sos/${encodeURIComponent(item.id)}?t=${encodeURIComponent(sosToken)}`,
          googleMapsUrl: `https://www.google.com/maps?q=${item.lat},${item.lng}`,
          secondsAgo,
          isOnline: item.active !== false && secondsAgo < 120
        };
      }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      return sendJson(res, 200, { ok: true, alerts });
    }

    const sosStatusMatch = pathname.match(/^\/api\/sos\/([^/]+)\/status$/);
    if (sosStatusMatch && (method === 'PATCH' || method === 'POST')) {
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { ok: false, error: 'Acesso restrito ao Administrador Master.' });
      }
      const id = decodeURIComponent(sosStatusMatch[1]);
      const body = await parseBody(req);
      const nextStatus = body.status || 'resolvido';
      const updated = await finance.updateSosStatusDb(id, {
        status: nextStatus,
        active: nextStatus !== 'resolvido',
        notes: body.notes
      });
      if (!updated) {
        return sendJson(res, 404, { ok: false, error: 'Chamado SOS não encontrado.' });
      }
      sosMemoryStore.set(id, updated);
      realtimeHub.publish('sos:updated', { sosId: id, status: nextStatus, active: updated.active }, { sosId: id });
      return sendJson(res, 200, { ok: true, alert: updated });
    }

    if (pathname === '/api/sos/location' && (method === 'POST' || method === 'PATCH')) {
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      const clientSession = verifyClientToken(req);
      if (!isAdmin && !driverSession && !clientSession) {
        return sendJson(res, 401, { ok: false, error: 'Faça login para acionar ou transmitir alerta SOS.' });
      }

      const body = await parseBody(req);
      const sosId = String(body.id || `sos-${Date.now()}`);
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      if (isNaN(lat) || isNaN(lng)) {
        return sendJson(res, 400, { ok: false, error: 'Coordenadas lat/lng inválidas' });
      }

      const now = new Date();
      const existing = await finance.getSosAlertByIdDb(sosId);
      const isNewAlert = !existing;
      const actorRole = driverSession ? 'motorista' : 'passageiro';

      const alertData = {
        id: sosId,
        role: isAdmin ? (body.role || existing?.role || 'passageiro') : actorRole,
        name: body.name || existing?.name || (driverSession ? 'Motorista em Emergência' : 'Passageiro em Emergência'),
        phone: body.phone || existing?.phone || clientSession?.phone || driverSession?.phone || '',
        driverId: body.driverId || existing?.driverId || (driverSession?.sub || null),
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
        rideId: body.rideId ? normalizeRideId(body.rideId) : (existing?.rideId || null),
        rideCode: body.rideCode || existing?.rideCode || null,
        status: existing?.status || 'ativo',
        active: true,
        updatedAt: now.toISOString(),
        updatedAtMs: now.getTime(),
        createdAt: existing?.createdAt || now.toISOString()
      };

      const persisted = await finance.upsertSosAlertDb(alertData);
      sosMemoryStore.set(sosId, persisted || alertData);

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
          `Auxílio urgente solicitado! Toque para ver a localização no mapa.`,
          { url: `/sos/${encodeURIComponent(sosId)}` }
        ).catch(() => {});

        if (alertData.rideId) {
          try {
            const sosRideRes = await db.query('SELECT * FROM public.rides WHERE id = $1 LIMIT 1', [alertData.rideId]);
            if (sosRideRes.rows[0]) {
              await dispatchTrustedContactsForRide(
                formatRideFromDb(sosRideRes.rows[0]),
                'sos_triggered',
                req.headers.host || 'localhost:5173'
              );
            }
          } catch {
            // mantém disparo SOS principal ativo
          }
        }
      }

      realtimeHub.publish('sos:updated', {
        sosId: alertData.id,
        lat: alertData.lat,
        lng: alertData.lng,
        active: true,
        address: alertData.address,
        updatedAt: alertData.updatedAt
      }, { sosId: alertData.id });

      const trackingToken = security.signTrackingToken('sos', alertData.id);
      return sendJson(res, 200, {
        ok: true,
        trackingToken,
        alert: {
          id: alertData.id,
          name: alertData.name,
          phone: alertData.phone,
          lat: alertData.lat,
          lng: alertData.lng,
          accuracy: alertData.accuracy,
          address: alertData.address,
          trackingUrl: `/sos/${encodeURIComponent(alertData.id)}?t=${encodeURIComponent(trackingToken)}`,
          updatedAt: alertData.updatedAt,
          secondsAgo: 0,
          isOnline: true
        }
      });
    }

    const sosLocMatch = pathname.match(/^\/api\/sos\/([^/]+)\/location$/);
    if (sosLocMatch && method === 'GET') {
      const id = decodeURIComponent(sosLocMatch[1]);
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      const clientSession = verifyClientToken(req);
      const trackTok = String(url.searchParams.get('t') || '').trim();
      const hasValidTracking = trackTok && security.verifyTrackingToken(trackTok, 'sos', id);

      if (!isAdmin && !hasValidTracking && !driverSession && !clientSession) {
        return sendJson(res, 401, { ok: false, error: 'Token de acompanhamento SOS ausente ou expirado.' });
      }

      const item = await finance.getSosAlertByIdDb(id) || sosMemoryStore.get(id);
      if (!item) {
        return sendJson(res, 404, { ok: false, error: 'Alerta SOS não encontrado' });
      }

      if (!isAdmin && !hasValidTracking) {
        const ownsDriver = driverSession?.sub && item.driverId && driverSession.sub === item.driverId;
        const ownsPhone = clientSession?.phone && item.phone &&
          normalizePhoneDigitsServer(clientSession.phone) === normalizePhoneDigitsServer(item.phone);
        if (!ownsDriver && !ownsPhone) {
          return sendJson(res, 403, { ok: false, error: 'Sem permissão para visualizar este chamado SOS.' });
        }
      }

      const secondsAgo = Math.max(0, Math.floor((Date.now() - (item.updatedAtMs || new Date(item.updatedAt).getTime())) / 1000));
      const isOnline = secondsAgo <= 35 && item.active !== false;

      return sendJson(res, 200, {
        ok: true,
        id: item.id,
        name: item.name,
        phone: isAdmin ? item.phone : security.maskPhoneDisplay(item.phone),
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
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      const clientSession = verifyClientToken(req);
      const item = await finance.getSosAlertByIdDb(id);
      const ownsDriver = driverSession?.sub && item?.driverId && driverSession.sub === item.driverId;
      const ownsPhone = clientSession?.phone && item?.phone &&
        normalizePhoneDigitsServer(clientSession.phone) === normalizePhoneDigitsServer(item.phone);
      if (!isAdmin && !ownsDriver && !ownsPhone) {
        return sendJson(res, 401, { ok: false, error: 'Sem permissão para encerrar chamado SOS.' });
      }

      await finance.updateSosStatusDb(id, { status: 'resolvido', active: false });
      if (sosMemoryStore.has(id)) {
        const curr = sosMemoryStore.get(id);
        sosMemoryStore.set(id, { ...curr, active: false, status: 'resolvido' });
      }
      realtimeHub.publish('sos:updated', { sosId: id, active: false, resolved: true }, { sosId: id });
      return sendJson(res, 200, { ok: true, id, resolved: true });
    }

    // ============================================================
    // 3.5 GATEWAY DE PAGAMENTOS: STRIPE, PIX DINÂMICO, CARTÕES E WEBHOOKS
    // ============================================================
    if (pathname === '/api/payments/config' && method === 'GET') {
      const mpPublicKey = String(process.env.MERCADOPAGO_PUBLIC_KEY || process.env.VITE_MERCADOPAGO_PUBLIC_KEY || '').trim();
      const stripePubKey = stripeGateway.getStripePublishableKey();
      const stripeOn = stripeGateway.isStripeEnabled();
      const mpOn = Boolean(env.MERCADOPAGO_ACCESS_TOKEN);
      const efiCfg = await efiBankGateway.getEfiConfig();
      const efiOn = await efiBankGateway.isEfiEnabled();
      const efiPixActive = await efiBankGateway.isEfiPixActive();
      const efiSplitEnabled = await efiBankGateway.isEfiSplitActive();
      const efiDriverPixSendEnabled = await efiBankGateway.isEfiDriverPayoutActive();
      const gatewayProvider = efiPixActive ? 'efibank' : (stripeOn ? 'stripe' : (mpOn ? 'mercadopago' : 'sandbox'));
      return sendJson(res, 200, {
        ok: true,
        gatewayProvider,
        efiEnabled: efiOn,
        efiPixActive,
        efiSplitEnabled,
        efiDriverPixSendEnabled,
        efiSandbox: Boolean(efiCfg.sandbox),
        stripeEnabled: stripeOn,
        stripePublishableKey: stripePubKey,
        mercadopagoEnabled: mpOn,
        mercadopagoPublicKey: mpPublicKey,
        autoPixPayoutEnabled: Boolean(efiDriverPixSendEnabled || process.env.PIX_PAYOUT_WEBHOOK_URL || process.env.ASAAS_API_KEY)
      });
    }

    // CONFIGURAÇÃO EXCLUSIVA PAINEL MASTER: EFÍ BANK (CREDENCIAIS, CERTIFICADO .P12, SPLIT & PAYOUTS)
    if (pathname === '/api/admin/gateways/efibank') {
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { ok: false, error: 'Acesso restrito ao Administrador Master.' });
      }
      const hostHeader = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
      const protoHeader = String(req.headers['x-forwarded-proto'] || (hostHeader.includes('localhost') || hostHeader.startsWith('127.') ? 'http' : 'https')).split(',')[0].trim();
      const requestOrigin = String(req.headers.origin || '').trim() || (hostHeader ? `${protoHeader}://${hostHeader}` : 'https://kavrodrive.vercel.app');

      if (method === 'GET') {
        const cfg = await efiBankGateway.getEfiConfig({ forceFresh: true });
        return sendJson(res, 200, {
          ok: true,
          config: efiBankGateway.sanitizeEfiConfigForAdmin(cfg),
          computedWebhookUrl: efiBankGateway.buildComputedWebhookUrl(requestOrigin, cfg.webhookSecret)
        });
      }
      if (method === 'POST') {
        const body = await parseBody(req);
        try {
          const prev = await efiBankGateway.getEfiConfig({ forceFresh: true });
          const saved = await efiBankGateway.saveEfiConfig(body || {});
          const actor = getAdminActorContext(req);
          await audit.recordAuditEvent({
            category: 'financeiro_config',
            actionKey: 'efibank_config_updated',
            title: `Efí Bank ${saved.enabled ? 'ativada' : 'desativada'} no Painel Master (${saved.sandbox ? 'Homologação' : 'Produção'})`,
            summary: `Efí Bank ${saved.enabled ? 'ATIVADA' : 'DESATIVADA'} • PIX Cobrança: ${saved.useForPassengerPix ? 'Sim' : 'Não'} • PIX Motorista API: ${saved.driverPixSendEnabled ? 'Sim' : 'Não'} • Split Efí: ${saved.splitEnabled ? 'Sim' : 'Não'}.`,
            severity: 'info',
            actorRole: actor.actorRole,
            actorId: actor.actorId,
            actorName: actor.actorName,
            entityType: 'gateway',
            entityId: 'efibank',
            entityLabel: 'Efí Bank PIX & Split',
            changes: [
              { field: 'enabled', label: 'Status Gateway Efí', before: String(prev.enabled), after: String(saved.enabled) },
              { field: 'sandbox', label: 'Ambiente', before: prev.sandbox ? 'Homologação' : 'Produção', after: saved.sandbox ? 'Homologação' : 'Produção' },
              { field: 'splitEnabled', label: 'Split Automático Efí', before: String(prev.splitEnabled), after: String(saved.splitEnabled) },
              { field: 'driverPixSendEnabled', label: 'Envio PIX Motorista API', before: String(prev.driverPixSendEnabled), after: String(saved.driverPixSendEnabled) }
            ],
            ipAddress: actor.ipAddress,
            userAgent: actor.userAgent
          });
          return sendJson(res, 200, {
            ok: true,
            config: efiBankGateway.sanitizeEfiConfigForAdmin(saved),
            computedWebhookUrl: efiBankGateway.buildComputedWebhookUrl(requestOrigin, saved.webhookSecret)
          });
        } catch (err) {
          return sendJson(res, 400, { ok: false, error: err?.message || 'Erro ao salvar configurações da Efí Bank.' });
        }
      }
    }

    if (pathname === '/api/admin/gateways/efibank/test' && method === 'POST') {
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { ok: false, error: 'Acesso restrito ao Administrador Master.' });
      }
      const body = await parseBody(req);
      const testRes = await efiBankGateway.testConnection(body || {});
      return sendJson(res, testRes.ok ? 200 : 400, testRes);
    }

    if (pathname === '/api/admin/gateways/efibank/register-webhook' && method === 'POST') {
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { ok: false, error: 'Acesso restrito ao Administrador Master.' });
      }
      const body = await parseBody(req);
      const hostHeader = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
      const protoHeader = String(req.headers['x-forwarded-proto'] || (hostHeader.includes('localhost') || hostHeader.startsWith('127.') ? 'http' : 'https')).split(',')[0].trim();
      const fallbackOrigin = String(req.headers.origin || '').trim() || (hostHeader ? `${protoHeader}://${hostHeader}` : 'https://kavrodrive.vercel.app');
      try {
        const regRes = await efiBankGateway.registerWebhook({
          webhookUrl: body.webhookUrl,
          skipMtls: body.skipMtls !== false,
          fallbackOrigin
        });
        const cfg = await efiBankGateway.getEfiConfig({ forceFresh: true });
        return sendJson(res, 200, {
          ok: true,
          webhookUrl: regRes.webhookUrl,
          config: efiBankGateway.sanitizeEfiConfigForAdmin(cfg)
        });
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err?.message || 'Falha ao registrar webhook na Efí Bank.' });
      }
    }

    if (pathname === '/api/payments/stripe/setup-intent' && method === 'POST') {
      const isAdmin = await isAuthorizedAdmin(req);
      const clientSession = verifyClientToken(req);
      if (!isAdmin && !clientSession) {
        return sendJson(res, 401, { ok: false, error: 'Faça login como passageiro para cadastrar um cartão.' });
      }
      if (!stripeGateway.isStripeEnabled()) {
        return sendJson(res, 400, { ok: false, error: 'Gateway de pagamento online não está configurado no servidor.' });
      }
      await ensureClientsSchema();
      const body = await parseBody(req);
      const targetClientId = isAdmin ? String(body.clientId || clientSession?.sub || '').trim() : clientSession.sub;
      let clientRow = null;
      if (targetClientId) {
        const cRes = await db.query('SELECT id, name, phone, email FROM public.clients WHERE id = $1 LIMIT 1', [targetClientId]);
        clientRow = cRes.rows[0] || null;
      }
      try {
        const setupData = await stripeGateway.createCardSetupIntent({
          clientId: targetClientId,
          clientPhone: clientRow?.phone || body.clientPhone || clientSession?.phone || '',
          clientEmail: clientRow?.email || body.clientEmail || clientSession?.email || '',
          clientName: clientRow?.name || body.clientName || 'Passageiro Kavro'
        });
        return sendJson(res, 200, { ok: true, ...setupData });
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err?.message || 'Erro ao iniciar tokenização segura do cartão.' });
      }
    }

    if (pathname === '/api/payments/stripe/wallet-intent' && method === 'POST') {
      const isAdmin = await isAuthorizedAdmin(req);
      const clientSession = verifyClientToken(req);
      if (!isAdmin && !clientSession) {
        return sendJson(res, 401, { ok: false, error: 'Faça login como passageiro para pagar com Apple Pay ou carteira.' });
      }
      if (!stripeGateway.isStripeEnabled()) {
        return sendJson(res, 400, { ok: false, error: 'Gateway de pagamento online não está configurado no servidor.' });
      }
      await ensureClientsSchema();
      const body = await parseBody(req);
      const cfg = (await getCachedSystemConfig()) || {};
      const allCats = finance.normalizeCategoriesServer(cfg);
      const mappedCatId = finance.mapLegacyCategoryIdServer(body.category || 'kavro_go');
      const matchedCat = allCats.find(c => c.id === body.category || c.id === mappedCatId) || allCats[0];
      const officialFare = security.calculateOfficialRidePriceServer({
        cfg,
        categoryObj: matchedCat,
        distanceKm: body.distanceKm,
        durationMin: body.durationMin,
        origin: body.origin,
        destination: body.destination,
        timeStr: body.time,
        city: body.city
      });

      const targetClientId = isAdmin ? String(body.clientId || clientSession?.sub || '').trim() : clientSession.sub;
      let clientRow = null;
      if (targetClientId) {
        const cRes = await db.query('SELECT id, name, phone, email FROM public.clients WHERE id = $1 LIMIT 1', [targetClientId]);
        clientRow = cRes.rows[0] || null;
      }

      try {
        const walletData = await stripeGateway.createWalletHoldIntent({
          amountBrl: officialFare.totalPrice,
          clientId: targetClientId,
          clientPhone: clientRow?.phone || body.clientPhone || clientSession?.phone || '',
          clientEmail: clientRow?.email || body.clientEmail || clientSession?.email || '',
          clientName: clientRow?.name || body.clientName || 'Passageiro Kavro',
          categoryId: matchedCat?.id || mappedCatId
        });
        return sendJson(res, 200, { ok: true, ...walletData });
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err?.message || 'Erro ao iniciar pagamento via Apple Pay / Carteira.' });
      }
    }

    if (pathname === '/api/payments/stripe/checkout-session' && method === 'POST') {
      const isAdmin = await isAuthorizedAdmin(req);
      const clientSession = verifyClientToken(req);
      if (!isAdmin && !clientSession) {
        return sendJson(res, 401, { ok: false, error: 'Faça login como passageiro para pagar com Apple Pay.' });
      }
      if (!stripeGateway.isStripeEnabled()) {
        return sendJson(res, 400, { ok: false, error: 'Gateway de pagamento online não está configurado no servidor.' });
      }
      await ensureClientsSchema();
      const body = await parseBody(req);
      const cfg = (await getCachedSystemConfig()) || {};
      const allCats = finance.normalizeCategoriesServer(cfg);
      const mappedCatId = finance.mapLegacyCategoryIdServer(body.category || 'kavro_go');
      const matchedCat = allCats.find(c => c.id === body.category || c.id === mappedCatId) || allCats[0];
      const officialFare = security.calculateOfficialRidePriceServer({
        cfg,
        categoryObj: matchedCat,
        distanceKm: body.distanceKm,
        durationMin: body.durationMin,
        origin: body.origin,
        destination: body.destination,
        timeStr: body.time,
        city: body.city
      });

      const targetClientId = isAdmin ? String(body.clientId || clientSession?.sub || '').trim() : clientSession.sub;
      let clientRow = null;
      if (targetClientId) {
        const cRes = await db.query('SELECT id, name, phone, email FROM public.clients WHERE id = $1 LIMIT 1', [targetClientId]);
        clientRow = cRes.rows[0] || null;
      }

      const originHeader = String(req.headers.origin || '').trim();
      const hostHeader = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
      const protoHeader = String(req.headers['x-forwarded-proto'] || (hostHeader.includes('localhost') || hostHeader.startsWith('127.') ? 'http' : 'https')).split(',')[0].trim();
      const fallbackOrigin = hostHeader ? `${protoHeader}://${hostHeader}` : 'https://kavrodrive.vercel.app';
      const returnBaseOrigin = originHeader || fallbackOrigin;

      const destLabel = body.destination?.address || 'Corrida Kavro Drive';
      try {
        const sessionData = await stripeGateway.createWalletCheckoutSession({
          amountBrl: officialFare.totalPrice,
          rideTitle: `Kavro Drive • ${matchedCat?.name || 'Padrão'}`,
          rideDescription: `Destino: ${destLabel}`,
          originUrl: returnBaseOrigin,
          clientId: targetClientId,
          clientPhone: clientRow?.phone || body.clientPhone || clientSession?.phone || '',
          clientEmail: clientRow?.email || body.clientEmail || clientSession?.email || '',
          clientName: clientRow?.name || body.clientName || 'Passageiro Kavro',
          categoryId: matchedCat?.id || mappedCatId
        });
        await finance.saveStripeCheckoutDraft(sessionData.sessionId, targetClientId, {
          ...body,
          clientId: targetClientId,
          clientName: clientRow?.name || body.clientName || 'Passageiro Kavro',
          clientPhone: clientRow?.phone || body.clientPhone || clientSession?.phone || '',
          paymentMethod: body.paymentMethod === 'cartao_credito' ? 'cartao_credito' : 'apple_pay'
        });
        return sendJson(res, 200, { ok: true, ...sessionData });
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err?.message || 'Erro ao abrir checkout seguro Apple Pay.' });
      }
    }

    if (pathname === '/api/payments/stripe/checkout-complete' && method === 'POST') {
      const isAdmin = await isAuthorizedAdmin(req);
      const clientSession = verifyClientToken(req);
      if (!isAdmin && !clientSession) {
        return sendJson(res, 401, { ok: false, error: 'Faça login como passageiro para concluir sua corrida.' });
      }
      if (!stripeGateway.isStripeEnabled()) {
        return sendJson(res, 400, { ok: false, error: 'Gateway de pagamento online não está configurado no servidor.' });
      }
      const body = await parseBody(req);
      const sessionId = String(body.sessionId || '').trim();
      if (!sessionId) {
        return sendJson(res, 400, { ok: false, error: 'Identificador da sessão de checkout ausente.' });
      }

      const draft = await finance.getStripeCheckoutDraft(sessionId);
      if (!draft) {
        return sendJson(res, 404, { ok: false, error: 'Sessão de checkout não encontrada.' });
      }
      if (!isAdmin && draft.clientId && clientSession?.sub && draft.clientId !== clientSession.sub) {
        return sendJson(res, 403, { ok: false, error: 'Esta sessão de pagamento pertence a outro passageiro.' });
      }

      if (draft.createdRideId) {
        const prevRideRes = await db.query('SELECT * FROM public.rides WHERE id = $1 LIMIT 1', [draft.createdRideId]);
        if (prevRideRes.rows[0]) {
          const [formatted] = await attachClientRatingsToRides([formatRideFromDb(prevRideRes.rows[0])]);
          return sendJson(res, 200, {
            ok: true,
            idempotent: true,
            ride: security.sanitizeRideForViewer(formatted, { isAdmin, isOwnerClient: true })
          });
        }
      }

      const sessionCheck = await stripeGateway.retrieveWalletCheckoutSession(sessionId);
      if (!sessionCheck.authorized || !sessionCheck.paymentIntentId) {
        return sendJson(res, 402, { ok: false, error: 'Pagamento no checkout Apple Pay ainda não foi autorizado.' });
      }

      const ridePayload = {
        ...(draft.payload || {}),
        paymentMethod: draft.payload?.paymentMethod || 'apple_pay',
        cardBrand: sessionCheck.cardBrand || 'Apple Pay',
        cardLast4: sessionCheck.cardLast4,
        stripePaymentIntentId: sessionCheck.paymentIntentId
      };
      const result = await executeRideSave({
        ride: ridePayload,
        isAdmin,
        driverSession: null,
        clientSession
      });
      if (result.status === 200 && result.body?.ride?.id) {
        await finance.markStripeCheckoutDraftRideId(sessionId, result.body.ride.id);
      }
      return sendJson(res, result.status, result.body);
    }

    if (pathname === '/api/payments/pix/create' && method === 'POST') {
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      const clientSession = verifyClientToken(req);
      const body = await parseBody(req);
      const rideId = normalizeRideId(body.rideId);
      const r = await db.query('SELECT * FROM public.rides WHERE id = $1', [rideId]);
      if (!r.rows[0]) return sendJson(res, 404, { ok: false, error: 'Corrida não encontrada.' });
      const ride = formatRideFromDb(r.rows[0]);
      const isOwnerClient = Boolean(clientSession?.sub && ride.clientId && clientSession.sub === ride.clientId);
      const isAssignedDriver = Boolean(driverSession?.sub && ride.driverId && driverSession.sub === ride.driverId);
      if (!isAdmin && !isOwnerClient && !isAssignedDriver) {
        return sendJson(res, 401, { ok: false, error: 'Sessão não autorizada para gerar cobrança PIX desta corrida.' });
      }
      try {
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
      } catch (err) {
        return sendJson(res, 402, { ok: false, error: err?.message || 'Erro ao gerar cobrança PIX no gateway.' });
      }
    }

    if (pathname === '/api/payments/cards') {
      const isAdmin = await isAuthorizedAdmin(req);
      const clientSession = verifyClientToken(req);
      if (method === 'GET') {
        if (!isAdmin && !clientSession) {
          return sendJson(res, 401, { ok: false, error: 'Sessão de passageiro necessária para listar cartões.' });
        }
        const clientId = isAdmin
          ? (url.searchParams.get('clientId') || req.headers['x-client-id'] || '')
          : clientSession.sub;
        const clientPhone = isAdmin
          ? (url.searchParams.get('clientPhone') || req.headers['x-client-phone'] || '')
          : (clientSession.phone || '');
        const cards = await finance.listSavedCards(clientId, clientPhone);
        return sendJson(res, 200, { ok: true, cards });
      }
      if (method === 'POST') {
        if (!isAdmin && !clientSession) {
          return sendJson(res, 401, { ok: false, error: 'Faça login antes de salvar um cartão.' });
        }
        const body = await parseBody(req);
        try {
          const card = await finance.tokenizeAndSaveCard({
            ...body,
            clientId: isAdmin ? body.clientId : clientSession.sub,
            clientPhone: isAdmin ? body.clientPhone : (body.clientPhone || clientSession.phone)
          });
          return sendJson(res, 200, { ok: true, card });
        } catch (err) {
          return sendJson(res, 400, { ok: false, error: err.message });
        }
      }
    }

    const cardDelMatch = pathname.match(/^\/api\/payments\/cards\/([^/]+)$/);
    if (cardDelMatch && method === 'DELETE') {
      const isAdmin = await isAuthorizedAdmin(req);
      const clientSession = verifyClientToken(req);
      if (!isAdmin && !clientSession) {
        return sendJson(res, 401, { ok: false, error: 'Faça login para remover cartões.' });
      }
      const cardId = decodeURIComponent(cardDelMatch[1]);
      if (!db.pool) {
        const cards = db.localStore.saved_cards || [];
        const target = cards.find(c => c.id === cardId);
        if (!target) return sendJson(res, 404, { ok: false, error: 'Cartão não encontrado.' });
        if (!isAdmin && target.client_id && target.client_id !== clientSession.sub) {
          return sendJson(res, 403, { ok: false, error: 'Sem permissão para remover este cartão.' });
        }
        db.localStore.saved_cards = cards.filter(c => c.id !== cardId);
        db.saveLocalStore();
        return sendJson(res, 200, { ok: true, deleted: cardId });
      }
      const findRes = await db.query('SELECT id, client_id FROM public.saved_cards WHERE id = $1 LIMIT 1', [cardId]);
      if (!findRes.rows[0]) return sendJson(res, 404, { ok: false, error: 'Cartão não encontrado.' });
      if (!isAdmin && findRes.rows[0].client_id && findRes.rows[0].client_id !== clientSession.sub) {
        return sendJson(res, 403, { ok: false, error: 'Sem permissão para remover este cartão.' });
      }
      await db.query('DELETE FROM public.saved_cards WHERE id = $1', [cardId]);
      return sendJson(res, 200, { ok: true, deleted: cardId });
    }

    // ── CARTEIRA DIGITAL DO PASSAGEIRO (SALDO, DEPÓSITO MÍN. R$ 20, EXTRATO) ───────────────────────
    if (pathname === '/api/client/wallet' && method === 'GET') {
      await ensureClientsSchema();
      const isAdmin = await isAuthorizedAdmin(req);
      const clientSession = verifyClientToken(req);
      if (!isAdmin && !clientSession) {
        return sendJson(res, 401, { ok: false, error: 'Faça login como passageiro para acessar sua carteira.' });
      }
      const targetClientId = isAdmin
        ? String(url.searchParams.get('clientId') || clientSession?.sub || '').trim()
        : clientSession.sub;
      if (!targetClientId) {
        return sendJson(res, 400, { ok: false, error: 'Identificador do passageiro ausente.' });
      }
      const prevWallet = await finance.getClientWallet(targetClientId, { skipGatewaySync: true });
      const wallet = await finance.getClientWallet(targetClientId);
      if (wallet.balance > prevWallet.balance + 0.001) {
        realtimeHub.publish('wallet:updated', { clientId: targetClientId, balance: wallet.balance }, { clientId: targetClientId });
      }
      return sendJson(res, 200, { ok: true, wallet });
    }

    if (pathname === '/api/client/wallet/topup' && method === 'POST') {
      await ensureClientsSchema();
      const isAdmin = await isAuthorizedAdmin(req);
      const clientSession = verifyClientToken(req);
      if (!isAdmin && !clientSession) {
        return sendJson(res, 401, { ok: false, error: 'Faça login como passageiro para depositar na carteira.' });
      }
      const body = await parseBody(req);
      const targetClientId = isAdmin
        ? String(body.clientId || clientSession?.sub || '').trim()
        : clientSession.sub;
      if (!targetClientId) {
        return sendJson(res, 400, { ok: false, error: 'Passageiro não identificado.' });
      }
      const amount = Number(String(body.amount ?? '').replace(',', '.'));
      if (!Number.isFinite(amount) || amount < finance.MIN_CLIENT_WALLET_TOPUP_BRL) {
        return sendJson(res, 400, {
          ok: false,
          error: `O valor mínimo de depósito na carteira é de R$ ${finance.MIN_CLIENT_WALLET_TOPUP_BRL.toFixed(2).replace('.', ',')}.`
        });
      }
      const cliRes = await db.query('SELECT id, name, phone, email FROM public.clients WHERE id = $1 LIMIT 1', [targetClientId]);
      const cliRow = cliRes.rows[0] || {};
      try {
        const result = await finance.createClientWalletTopup({
          clientId: targetClientId,
          clientName: cliRow.name || body.clientName || 'Passageiro Kavro',
          clientPhone: cliRow.phone || clientSession?.phone || '',
          clientEmail: cliRow.email || clientSession?.email || '',
          amount,
          method: body.method || 'pix',
          cardId: body.cardId || '',
          stripePaymentIntentId: body.stripePaymentIntentId || ''
        });
        if (!result.ok) {
          return sendJson(res, 402, result);
        }
        if (!result.pending && result.wallet) {
          await audit.recordAuditEvent({
            category: 'financeiro_corridas',
            actionKey: 'client_wallet_topup_confirmed',
            title: 'Depósito confirmado na carteira do passageiro',
            summary: `${cliRow.name || targetClientId} depositou ${audit.formatMoneyPt(amount)} via ${String(body.method || 'cartao').toUpperCase()}. Novo saldo: ${audit.formatMoneyPt(result.wallet.balance)}.`,
            severity: 'info',
            actorRole: isAdmin ? 'admin_master' : 'passageiro',
            actorId: targetClientId,
            actorName: cliRow.name || targetClientId,
            entityType: 'passageiro',
            entityId: targetClientId,
            entityLabel: cliRow.name || targetClientId,
            relatedIds: { clientId: targetClientId, walletEntryId: result.entry?.id || null },
            ipAddress: getRequestClientIp(req),
            userAgent: String(req.headers['user-agent'] || '').slice(0, 220) || null
          });
          realtimeHub.publish('wallet:updated', { clientId: targetClientId, balance: result.wallet.balance }, { clientId: targetClientId });
        }
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err?.message || 'Erro ao processar depósito na carteira.' });
      }
    }

    if (pathname === '/api/client/wallet/topup/confirm' && method === 'POST') {
      await ensureClientsSchema();
      const isAdmin = await isAuthorizedAdmin(req);
      const hasValidWebhookSecret = verifyWebhookSecret(req);
      const clientSession = verifyClientToken(req);
      const body = await parseBody(req);
      const entryId = String(body.entryId || '').trim();
      if (!entryId) {
        return sendJson(res, 400, { ok: false, error: 'entryId do depósito ausente.' });
      }

      const efiPixActive = await efiBankGateway.isEfiPixActive();
      const isSandboxMode = !efiPixActive && !env.MERCADOPAGO_ACCESS_TOKEN && !stripeGateway.isStripeEnabled();
      if ((efiPixActive || stripeGateway.isStripeEnabled()) && !isAdmin && !hasValidWebhookSecret) {
        if (!clientSession) {
          return sendJson(res, 401, { ok: false, error: 'Sessão inválida para confirmar depósito.' });
        }
        const entries = await finance.listClientWalletEntries(clientSession.sub);
        const ownedEntry = entries.find(e => e.id === entryId);
        if (!ownedEntry) {
          return sendJson(res, 404, { ok: false, error: 'Depósito não encontrado na sua carteira.' });
        }
        if (ownedEntry.status === 'confirmado') {
          const wallet = await finance.getClientWallet(clientSession.sub, { skipGatewaySync: true });
          return sendJson(res, 200, { ok: true, entry: ownedEntry, wallet });
        }
        if (efiPixActive && ownedEntry.gatewayTxId && (ownedEntry.metadata?.provider === 'efibank' || String(ownedEntry.gatewayTxId).startsWith('KVWLT'))) {
          try {
            const efiCheck = await efiBankGateway.getPixChargeStatus(ownedEntry.gatewayTxId);
            if (efiCheck && efiCheck.paid) {
              const conf = await finance.confirmClientWalletTopup({
                entryId: ownedEntry.id,
                gatewayTxId: ownedEntry.gatewayTxId,
                paidAmount: efiCheck.amountBrl || ownedEntry.amount
              });
              realtimeHub.publish('wallet:updated', { clientId: clientSession.sub, balance: conf.wallet.balance }, { clientId: clientSession.sub });
              return sendJson(res, 200, { ok: true, ...conf });
            }
          } catch {}
        }
        if (stripeGateway.isStripeEnabled() && String(ownedEntry.gatewayTxId || '').startsWith('pi_')) {
          const piCheck = await stripeGateway.retrievePaymentIntentStatus(ownedEntry.gatewayTxId);
          if (piCheck && piCheck.status === 'succeeded') {
            const conf = await finance.confirmClientWalletTopup({
              entryId: ownedEntry.id,
              gatewayTxId: piCheck.id,
              paidAmount: piCheck.amountBrl
            });
            realtimeHub.publish('wallet:updated', { clientId: clientSession.sub, balance: conf.wallet.balance }, { clientId: clientSession.sub });
            return sendJson(res, 200, { ok: true, ...conf });
          }
        }
        return sendJson(res, 402, { ok: false, error: 'Pagamento PIX ainda aguardando compensação bancária.' });
      }

      if (!isAdmin && !hasValidWebhookSecret && !(isSandboxMode && clientSession)) {
        return sendJson(res, 401, { ok: false, error: 'Não autorizado para confirmar depósito manualmente.' });
      }
      try {
        const result = await finance.confirmClientWalletTopup({
          entryId,
          gatewayTxId: body.gatewayTxId || null,
          paidAmount: body.amount || null
        });
        if (!isAdmin && !hasValidWebhookSecret && clientSession && result.entry?.clientId !== clientSession.sub) {
          return sendJson(res, 403, { ok: false, error: 'Este depósito pertence a outro passageiro.' });
        }
        if (result.newlyConfirmed) {
          await audit.recordAuditEvent({
            category: 'financeiro_corridas',
            actionKey: 'client_wallet_topup_confirmed',
            title: 'Recarga PIX confirmada na carteira do passageiro',
            summary: `Recarga ${entryId} de ${audit.formatMoneyPt(result.entry.amount)} confirmada. Novo saldo: ${audit.formatMoneyPt(result.wallet.balance)}.`,
            severity: 'info',
            actorRole: isAdmin ? 'admin_master' : (hasValidWebhookSecret ? 'gateway' : 'passageiro'),
            actorId: result.entry.clientId,
            actorName: result.entry.clientName || result.entry.clientId,
            entityType: 'passageiro',
            entityId: result.entry.clientId,
            relatedIds: { clientId: result.entry.clientId, walletEntryId: result.entry.id },
            ipAddress: getRequestClientIp(req),
            userAgent: String(req.headers['user-agent'] || '').slice(0, 220) || null
          });
          realtimeHub.publish('wallet:updated', { clientId: result.entry.clientId, balance: result.wallet.balance }, { clientId: result.entry.clientId });
        }
        return sendJson(res, 200, { ok: true, ...result });
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err?.message || 'Erro ao confirmar depósito.' });
      }
    }

    if (pathname === '/api/client/wallet/topup/wallet-intent' && method === 'POST') {
      await ensureClientsSchema();
      const isAdmin = await isAuthorizedAdmin(req);
      const clientSession = verifyClientToken(req);
      if (!isAdmin && !clientSession) {
        return sendJson(res, 401, { ok: false, error: 'Faça login para adicionar saldo com Apple Pay.' });
      }
      if (!stripeGateway.isStripeEnabled()) {
        return sendJson(res, 400, { ok: false, error: 'Gateway de pagamento online não está configurado no servidor.' });
      }
      const body = await parseBody(req);
      const targetClientId = isAdmin ? String(body.clientId || clientSession?.sub || '').trim() : clientSession.sub;
      const amount = Number(String(body.amount ?? '').replace(',', '.'));
      if (!Number.isFinite(amount) || amount < finance.MIN_CLIENT_WALLET_TOPUP_BRL) {
        return sendJson(res, 400, {
          ok: false,
          error: `O valor mínimo para depósito na carteira é de R$ ${finance.MIN_CLIENT_WALLET_TOPUP_BRL.toFixed(2).replace('.', ',')}.`
        });
      }
      const cRes = await db.query('SELECT id, name, phone, email FROM public.clients WHERE id = $1 LIMIT 1', [targetClientId]);
      const cRow = cRes.rows[0] || {};
      try {
        const intentData = await stripeGateway.createWalletHoldIntent({
          amountBrl: amount,
          clientId: targetClientId,
          clientPhone: cRow.phone || clientSession?.phone || '',
          clientEmail: cRow.email || clientSession?.email || '',
          clientName: cRow.name || 'Passageiro Kavro',
          captureMethod: 'automatic',
          purpose: 'client_wallet_topup',
          description: `Depósito Carteira Kavro Drive (${targetClientId})`
        });
        return sendJson(res, 200, { ok: true, ...intentData });
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err?.message || 'Erro ao preparar pagamento Apple Pay.' });
      }
    }

    if (pathname === '/api/client/wallet/topup/checkout-session' && method === 'POST') {
      await ensureClientsSchema();
      const isAdmin = await isAuthorizedAdmin(req);
      const clientSession = verifyClientToken(req);
      if (!isAdmin && !clientSession) {
        return sendJson(res, 401, { ok: false, error: 'Faça login para adicionar saldo na carteira.' });
      }
      if (!stripeGateway.isStripeEnabled()) {
        return sendJson(res, 400, { ok: false, error: 'Gateway de pagamento online não está configurado no servidor.' });
      }
      const body = await parseBody(req);
      const targetClientId = isAdmin ? String(body.clientId || clientSession?.sub || '').trim() : clientSession.sub;
      const amount = Number(String(body.amount ?? '').replace(',', '.'));
      if (!Number.isFinite(amount) || amount < finance.MIN_CLIENT_WALLET_TOPUP_BRL) {
        return sendJson(res, 400, {
          ok: false,
          error: `O valor mínimo para depósito na carteira é de R$ ${finance.MIN_CLIENT_WALLET_TOPUP_BRL.toFixed(2).replace('.', ',')}.`
        });
      }
      const cRes = await db.query('SELECT id, name, phone, email FROM public.clients WHERE id = $1 LIMIT 1', [targetClientId]);
      const cRow = cRes.rows[0] || {};
      const returnPath = typeof body.returnPath === 'string' && body.returnPath.startsWith('/') ? body.returnPath : '/';
      const sep = returnPath.includes('?') ? '&' : '?';
      const reqHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim();
      const reqProto = String(req.headers['x-forwarded-proto'] || (reqHost.includes('localhost') || reqHost.startsWith('127.') ? 'http' : 'https')).split(',')[0].trim();
      const originUrl = reqHost ? `${reqProto}://${reqHost}` : 'https://kavrodrive.vercel.app';
      try {
        const sessionData = await stripeGateway.createWalletCheckoutSession({
          amountBrl: amount,
          rideTitle: `Recarga Carteira Kavro Drive (R$ ${amount.toFixed(2).replace('.', ',')})`,
          rideDescription: 'Saldo para pagar corridas com confirmação instantânea',
          originUrl,
          clientId: targetClientId,
          clientPhone: cRow.phone || clientSession?.phone || '',
          clientEmail: cRow.email || clientSession?.email || '',
          clientName: cRow.name || 'Passageiro Kavro',
          captureMethod: 'automatic',
          purpose: 'client_wallet_topup',
          successPath: `${returnPath}${sep}wallet_checkout_session_id={CHECKOUT_SESSION_ID}`,
          cancelPath: `${returnPath}${sep}wallet_checkout_canceled=1`,
          extraMetadata: { returnPath }
        });
        return sendJson(res, 200, { ok: true, ...sessionData });
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err?.message || 'Erro ao abrir checkout de recarga.' });
      }
    }

    if (pathname === '/api/client/wallet/topup/checkout-complete' && method === 'POST') {
      await ensureClientsSchema();
      const isAdmin = await isAuthorizedAdmin(req);
      const clientSession = verifyClientToken(req);
      if (!isAdmin && !clientSession) {
        return sendJson(res, 401, { ok: false, error: 'Faça login para concluir seu depósito.' });
      }
      if (!stripeGateway.isStripeEnabled()) {
        return sendJson(res, 400, { ok: false, error: 'Gateway de pagamento online não está configurado no servidor.' });
      }
      const body = await parseBody(req);
      const sessionId = String(body.sessionId || '').trim();
      if (!sessionId) {
        return sendJson(res, 400, { ok: false, error: 'Identificador da sessão de recarga ausente.' });
      }
      const sessionCheck = await stripeGateway.retrieveWalletCheckoutSession(sessionId);
      if (!sessionCheck.authorized || !sessionCheck.paymentIntentId) {
        return sendJson(res, 402, { ok: false, error: 'Depósito ainda não foi autorizado.' });
      }
      const sessionClientId = String(sessionCheck.metadata?.clientId || clientSession?.sub || '').trim();
      if (!isAdmin && sessionClientId && clientSession?.sub && sessionClientId !== clientSession.sub) {
        return sendJson(res, 403, { ok: false, error: 'Esta sessão de depósito pertence a outro passageiro.' });
      }
      const result = await finance.createClientWalletTopup({
        clientId: sessionClientId || clientSession.sub,
        clientPhone: clientSession?.phone || '',
        clientEmail: clientSession?.email || '',
        amount: sessionCheck.amountBrl,
        method: sessionCheck.walletType === 'apple_pay' ? 'apple_pay' : 'cartao_credito',
        stripePaymentIntentId: sessionCheck.paymentIntentId,
        idempotencyKey: `wallet_topup_cs_${sessionId}`
      });
      if (result.ok && result.wallet) {
        realtimeHub.publish('wallet:updated', { clientId: result.wallet.clientId, balance: result.wallet.balance }, { clientId: result.wallet.clientId });
      }
      return sendJson(res, 200, result);
    }

    if (pathname === '/api/client/wallet/admin-adjust' && method === 'POST') {
      await ensureClientsSchema();
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { ok: false, error: 'Acesso restrito ao Administrador Master.' });
      }
      const body = await parseBody(req);
      const clientId = String(body.clientId || '').trim();
      const amount = Number(String(body.amount ?? '').replace(',', '.'));
      const type = body.type === 'debit' ? 'debit' : 'credit';
      const reason = String(body.reason || '').trim().slice(0, 180) || 'Ajuste financeiro administrativo';
      if (!clientId || !Number.isFinite(amount) || amount <= 0) {
        return sendJson(res, 400, { ok: false, error: 'Informe passageiro e valor positivo válido.' });
      }
      if (type === 'debit') {
        const resDebit = await finance.debitClientWalletForRide({
          clientId,
          rideId: `adj-${Date.now()}`,
          amount,
          entryType: 'admin_adjustment',
          idempotencyKey: `wallet_admin_debit_${clientId}_${Date.now()}`,
          description: reason
        });
        if (!resDebit.ok) return sendJson(res, 400, resDebit);
        const wallet = await finance.getClientWallet(clientId, { skipGatewaySync: true });
        return sendJson(res, 200, { ok: true, wallet });
      }
      const resCredit = await finance.creditClientWalletAdjustment({
        clientId,
        amount,
        entryType: 'admin_adjustment',
        idempotencyKey: `wallet_admin_credit_${clientId}_${Date.now()}`,
        paymentMethod: 'sistema',
        description: reason
      });
      return sendJson(res, 200, { ok: true, wallet: resCredit?.wallet });
    }

    // WEBHOOK OFICIAL STRIPE (ASSINATURA CRIPTOGRÁFICA Stripe-Signature + RAW BODY)
    if (pathname === '/api/webhooks/stripe' && method === 'POST') {
      const rawBody = await readRawBodyBuffer(req);
      const sigHeader = String(req.headers['stripe-signature'] || '').trim();
      let event;
      try {
        event = stripeGateway.constructWebhookEvent(rawBody, sigHeader);
      } catch (err) {
        return sendJson(res, 400, {
          ok: false,
          error: err?.message || 'Assinatura Stripe-Signature inválida.'
        });
      }

      const evtType = String(event?.type || '');
      const evtObj = event?.data?.object || {};

      if (evtType === 'payment_intent.succeeded') {
        const pi = evtObj;
        const meta = pi.metadata || {};
        const paidBrl = stripeGateway.toBrlFromCents(pi.amount_received || pi.amount || 0);

        if (meta.purpose === 'driver_debt_pix' && meta.driverId) {
          const result = await finance.confirmDriverDebtSettlementWebhook({
            driverId: String(meta.driverId),
            amount: paidBrl,
            gatewayTxId: String(pi.id)
          });
          await audit.recordAuditEvent({
            category: 'financeiro_corridas',
            actionKey: 'driver_debt_settled',
            title: 'Quitação de dívida de motorista via PIX',
            summary: `Dívida de ${result.wallet?.driverName || meta.driverId} quitada via PIX em ${audit.formatMoneyPt(paidBrl)}. Saldo devedor atual: ${audit.formatMoneyPt(result.wallet?.debtBalance || 0)}.`,
            severity: 'info',
            actorRole: 'gateway',
            actorId: String(meta.driverId),
            actorName: 'Webhook Pagamentos',
            entityType: 'motorista',
            entityId: String(meta.driverId),
            entityLabel: result.wallet?.driverName || String(meta.driverId),
            relatedIds: { driverId: String(meta.driverId), gatewayTxId: String(pi.id), ledgerId: result.entry?.id || null },
            ipAddress: getRequestClientIp(req),
            userAgent: String(req.headers['user-agent'] || '').slice(0, 220) || null
          });
          return sendJson(res, 200, { ok: true, received: true, type: 'driver_debt_pix', ...result });
        }

        if (meta.purpose === 'client_wallet_topup' && meta.clientId) {
          const result = await finance.confirmClientWalletTopup({
            entryId: meta.entryId || null,
            gatewayTxId: String(pi.id),
            paidAmount: paidBrl
          });
          await audit.recordAuditEvent({
            category: 'financeiro_corridas',
            actionKey: 'client_wallet_topup_confirmed',
            title: 'Depósito na carteira do passageiro confirmado via PIX',
            summary: `Recarga de ${audit.formatMoneyPt(paidBrl)} confirmada na carteira de ${result.entry?.clientName || meta.clientId}. Saldo atual: ${audit.formatMoneyPt(result.wallet?.balance || 0)}.`,
            severity: 'info',
            actorRole: 'gateway',
            actorId: String(meta.clientId),
            actorName: 'Webhook Pagamentos',
            entityType: 'passageiro',
            entityId: String(meta.clientId),
            entityLabel: result.entry?.clientName || String(meta.clientId),
            relatedIds: { clientId: String(meta.clientId), gatewayTxId: String(pi.id), walletEntryId: result.entry?.id || null },
            ipAddress: getRequestClientIp(req),
            userAgent: String(req.headers['user-agent'] || '').slice(0, 220) || null
          });
          realtimeHub.publish(
            'wallet:updated',
            { clientId: String(meta.clientId), balance: result.wallet?.balance || 0 },
            { clientId: String(meta.clientId) }
          );
          return sendJson(res, 200, { ok: true, received: true, type: 'client_wallet_topup', ...result });
        }

        let targetRideId = meta.rideId ? normalizeRideId(meta.rideId) : '';
        if (!targetRideId && pi.id) {
          const matchedTx = await finance.getPaymentTxByGatewayTxId(pi.id);
          if (matchedTx?.rideId) targetRideId = matchedTx.rideId;
        }
        if (targetRideId) {
          const settlement = await confirmDigitalRidePaymentAndPublish({
            rideId: targetRideId,
            paidAmountBrl: paidBrl,
            gatewayTxId: String(pi.id),
            gatewayLabel: 'Stripe'
          });
          return sendJson(res, 200, { ok: true, received: true, eventType: evtType, ...settlement });
        }
        return sendJson(res, 200, { ok: true, received: true, eventType: evtType, ignored: true });
      }

      if (evtType === 'payment_intent.payment_failed' || evtType === 'payment_intent.canceled') {
        const pi = evtObj;
        const tx = pi?.id ? await finance.getPaymentTxByGatewayTxId(pi.id) : null;
        if (tx && tx.status === 'aguardando') {
          await finance.savePaymentTransaction({
            ...tx,
            status: evtType === 'payment_intent.canceled' ? 'cancelado' : 'falhou',
            failureReason: pi.last_payment_error?.message || (evtType === 'payment_intent.canceled' ? 'PIX expirado ou cancelado' : 'Falha no pagamento online')
          });
        }
        return sendJson(res, 200, { ok: true, received: true, eventType: evtType });
      }

      if (evtType === 'charge.refunded') {
        const ch = evtObj;
        const piId = typeof ch.payment_intent === 'string' ? ch.payment_intent : ch.payment_intent?.id;
        const tx = piId ? await finance.getPaymentTxByGatewayTxId(piId) : null;
        if (tx) {
          await finance.savePaymentTransaction({
            ...tx,
            status: 'reembolsado',
            refundedAmount: stripeGateway.toBrlFromCents(ch.amount_refunded || ch.amount || 0)
          });
        }
        return sendJson(res, 200, { ok: true, received: true, eventType: evtType });
      }

      if (evtType === 'charge.dispute.created') {
        const disp = evtObj;
        const piId = typeof disp.payment_intent === 'string' ? disp.payment_intent : disp.payment_intent?.id;
        const tx = piId ? await finance.getPaymentTxByGatewayTxId(piId) : null;
        if (tx) {
          await finance.savePaymentTransaction({
            ...tx,
            status: 'contestado',
            disputeReason: disp.reason || 'Contestação aberta no gateway de pagamento'
          });
        }
        return sendJson(res, 200, { ok: true, received: true, eventType: evtType });
      }

      return sendJson(res, 200, { ok: true, received: true, eventType: evtType });
    }

    // WEBHOOK OFICIAL EFÍ BANK (PIX RECEBIDO COM VALIDAÇÃO HMAC + CONSULTA AO VIVO /v2/cob/:txid)
    if (pathname === '/api/webhooks/efibank' || pathname === '/api/webhooks/efibank/pix') {
      const isAdmin = await isAuthorizedAdmin(req);
      const validHmac = await efiBankGateway.verifyWebhookRequestHmac(req.url);
      if (!isAdmin && !validHmac) {
        return sendJson(res, 401, { ok: false, error: 'Assinatura HMAC de webhook Efí Bank inválida.' });
      }

      if (method === 'GET') {
        return sendJson(res, 200, { ok: true, webhookReady: true });
      }

      if (method === 'POST') {
        const body = await parseBody(req);
        const pixEvents = Array.isArray(body?.pix) ? body.pix : [];
        if (pixEvents.length === 0) {
          return sendJson(res, 200, { ok: true, received: true, ping: true });
        }

        const processed = [];
        for (const ev of pixEvents) {
          const txid = String(ev?.txid || '').trim();
          if (!txid) continue;

          // Regra de ouro Efí Bank: confirmar status CONCLUIDA diretamente na API antes de liberar
          let cobCheck;
          try {
            cobCheck = await efiBankGateway.getPixChargeStatus(txid);
          } catch (err) {
            processed.push({ txid, ok: false, error: err.message });
            continue;
          }
          if (!cobCheck || !cobCheck.paid) {
            processed.push({ txid, ok: true, status: cobCheck?.status || 'aguardando' });
            continue;
          }

          const paidBrl = cobCheck.amountBrl || Number(String(ev?.valor || '0').replace(',', '.')) || 0;
          const e2eId = String(ev?.endToEndId || cobCheck.endToEndId || txid);

          // 1) Verifica se é recarga na Carteira do Passageiro
          const walletEntry = await finance.findClientWalletEntryByGatewayTxId(txid);
          if (walletEntry) {
            const confW = await finance.confirmClientWalletTopup({
              entryId: walletEntry.id,
              gatewayTxId: txid,
              paidAmount: paidBrl || walletEntry.amount
            });
            if (confW.newlyConfirmed) {
              await audit.recordAuditEvent({
                category: 'financeiro_corridas',
                actionKey: 'client_wallet_topup_confirmed',
                title: 'Recarga PIX confirmada via Efí Bank',
                summary: `Recarga de ${audit.formatMoneyPt(paidBrl || walletEntry.amount)} confirmada via Efí Bank (txid ${txid}).`,
                severity: 'info',
                actorRole: 'gateway',
                actorId: walletEntry.clientId,
                actorName: 'Efí Bank PIX',
                entityType: 'passageiro',
                entityId: walletEntry.clientId,
                relatedIds: { clientId: walletEntry.clientId, walletEntryId: walletEntry.id, txid, e2eId },
                ipAddress: getRequestClientIp(req),
                userAgent: String(req.headers['user-agent'] || '').slice(0, 220) || null
              });
              realtimeHub.publish(
                'wallet:updated',
                { clientId: walletEntry.clientId, balance: confW.wallet?.balance || 0 },
                { clientId: walletEntry.clientId }
              );
            }
            processed.push({ txid, type: 'wallet_topup', ok: true, newlyConfirmed: confW.newlyConfirmed });
            continue;
          }

          // 2) Verifica se é pagamento de corrida ou quitação de dívida do motorista
          const matchedTx = await finance.getPaymentTxByGatewayTxId(txid);
          if (matchedTx && String(matchedTx.rideId || '').startsWith('DEBT_') && matchedTx.driverId) {
            if (matchedTx.status !== 'confirmado') {
              const debtRes = await finance.confirmDriverDebtSettlementWebhook({
                driverId: String(matchedTx.driverId),
                amount: paidBrl || matchedTx.finalAmount,
                gatewayTxId: e2eId
              });
              await finance.savePaymentTransaction({
                ...matchedTx,
                status: 'confirmado',
                paidAmount: paidBrl || matchedTx.finalAmount,
                gatewayAuthCode: e2eId
              });
              await audit.recordAuditEvent({
                category: 'financeiro_corridas',
                actionKey: 'driver_debt_settled',
                title: 'Quitação de dívida de motorista via Efí Bank PIX',
                summary: `Dívida de ${debtRes.wallet?.driverName || matchedTx.driverId} quitada via Efí Bank em ${audit.formatMoneyPt(paidBrl)}.`,
                severity: 'info',
                actorRole: 'gateway',
                actorId: String(matchedTx.driverId),
                actorName: 'Efí Bank PIX',
                entityType: 'motorista',
                entityId: String(matchedTx.driverId),
                relatedIds: { driverId: String(matchedTx.driverId), txid, e2eId },
                ipAddress: getRequestClientIp(req),
                userAgent: String(req.headers['user-agent'] || '').slice(0, 220) || null
              });
            }
            processed.push({ txid, type: 'driver_debt_pix', ok: true });
            continue;
          }

          if (matchedTx?.rideId) {
            const settlement = await confirmDigitalRidePaymentAndPublish({
              rideId: matchedTx.rideId,
              paidAmountBrl: paidBrl || matchedTx.finalAmount,
              gatewayTxId: e2eId,
              gatewayLabel: 'Efí Bank PIX'
            });
            processed.push({ txid, type: 'ride_pix', rideId: matchedTx.rideId, ...settlement });
            continue;
          }

          processed.push({ txid, ok: true, ignored: true });
        }

        return sendJson(res, 200, { ok: true, received: true, processed });
      }
    }

    // VERIFICAÇÃO ATIVA DE PIX EFÍ BANK PARA CORRIDA (BOTÃO "JÁ PAGUEI" / POLLING)
    if (pathname === '/api/payments/pix/verify' && method === 'POST') {
      const isAdmin = await isAuthorizedAdmin(req);
      const clientSession = verifyClientToken(req);
      const driverSession = verifyDriverToken(req);
      if (!isAdmin && !clientSession && !driverSession) {
        return sendJson(res, 401, { ok: false, error: 'Sessão não autorizada.' });
      }
      const body = await parseBody(req);
      const rideId = normalizeRideId(body.rideId || '');
      if (!rideId) return sendJson(res, 400, { ok: false, error: 'rideId ausente.' });
      const prevRes = await db.query('SELECT * FROM public.rides WHERE id = $1', [rideId]);
      if (!prevRes.rows[0]) return sendJson(res, 404, { ok: false, error: 'Corrida não encontrada.' });
      const ride = formatRideFromDb(prevRes.rows[0]);
      if (!isAdmin && ride.clientId && clientSession?.sub && ride.clientId !== clientSession.sub && ride.driverId !== driverSession?.sub) {
        return sendJson(res, 403, { ok: false, error: 'Acesso negado.' });
      }
      if (ride.paymentStatus === 'confirmado' || ride.paymentStatus === 'pago') {
        return sendJson(res, 200, { ok: true, paid: true, ride });
      }
      const tx = await finance.getPaymentTxByRide(rideId);
      if (tx?.gatewayTxId && (await efiBankGateway.isEfiPixActive())) {
        try {
          const check = await efiBankGateway.getPixChargeStatus(tx.gatewayTxId);
          if (check?.paid) {
            const settled = await confirmDigitalRidePaymentAndPublish({
              rideId,
              paidAmountBrl: check.amountBrl || ride.totalPrice,
              gatewayTxId: check.endToEndId || tx.gatewayTxId,
              gatewayLabel: 'Efí Bank PIX'
            });
            return sendJson(res, 200, { ok: true, paid: true, ...settled });
          }
          return sendJson(res, 200, { ok: true, paid: false, status: check?.status || 'ATIVA' });
        } catch (err) {
          return sendJson(res, 400, { ok: false, paid: false, error: err.message });
        }
      }
      return sendJson(res, 200, { ok: true, paid: false, status: ride.paymentStatus });
    }

    // WEBHOOK UNIFICADO DO GATEWAY (PIX, CARTÃO, QUITAÇÃO DE DÍVIDA) — COM IDEMPOTÊNCIA E AUTENTICAÇÃO
    if ((pathname === '/api/payments/webhook' || pathname === '/api/webhooks/mercadopago') && (method === 'POST' || method === 'GET')) {
      const body = method === 'POST' ? await parseBody(req) : {};
      const eventType = body.event || 'payment.confirmed';
      const isAdmin = await isAuthorizedAdmin(req);
      const hasValidWebhookSecret = verifyWebhookSecret(req);
      const driverSession = verifyDriverToken(req);
      const clientSession = verifyClientToken(req);

      if (pathname === '/api/webhooks/mercadopago') {
        const paymentId = body?.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id');
        const topic = body?.type || body?.topic || url.searchParams.get('type') || url.searchParams.get('topic');
        if (!paymentId || (topic && topic !== 'payment')) return sendJson(res, 200, { ok: true, ignored: true });
        if (!verifyMercadoPagoWebhookSignature(req, paymentId)) {
          return sendJson(res, 401, { ok: false, error: 'Assinatura de webhook Mercado Pago inválida.' });
        }
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
        const mpResult = await confirmDigitalRidePaymentAndPublish({
          rideId: payment.external_reference,
          paidAmountBrl: payment.transaction_amount,
          gatewayTxId: String(paymentId),
          gatewayLabel: 'Mercado Pago'
        });
        if (!mpResult.found) return sendJson(res, 404, { ok: false, error: 'Corrida não encontrada.' });
        return sendJson(res, 200, mpResult);
      }

      // Endpoint interno /api/payments/webhook: exige Admin, x-webhook-secret válido, ou modo sandbox (sem Efí/Stripe/MP Live) pelo dono autenticado
      const efiPixActive = await efiBankGateway.isEfiPixActive();
      const isSandboxMode = !efiPixActive && !env.MERCADOPAGO_ACCESS_TOKEN && !stripeGateway.isStripeEnabled();

      // 1) Quitação de dívida de motorista via PIX
      if (eventType === 'debt.confirmed' && body.driverId) {
        const isAllowedDriverDebt = isAdmin || hasValidWebhookSecret || (
          isSandboxMode && driverSession && driverSession.sub === String(body.driverId)
        );
        if (!isAllowedDriverDebt) {
          return sendJson(res, 401, { ok: false, error: 'Webhook não autorizado para quitação de dívida.' });
        }
        const result = await finance.confirmDriverDebtSettlementWebhook({
          driverId: body.driverId,
          amount: body.amount,
          gatewayTxId: body.gatewayTxId || `gw_debt_${Date.now()}`
        });
        await audit.recordAuditEvent({
          category: 'financeiro_corridas',
          actionKey: 'driver_debt_settled',
          title: 'Quitação de dívida de motorista via PIX',
          summary: `Dívida de ${result.wallet?.driverName || body.driverId} quitada em ${audit.formatMoneyPt(body.amount)}. Saldo devedor atual: ${audit.formatMoneyPt(result.wallet?.debtBalance || 0)}.`,
          severity: 'info',
          actorRole: isAdmin ? 'admin_master' : (hasValidWebhookSecret ? 'gateway' : 'motorista'),
          actorId: isAdmin ? getAdminActorContext(req).actorId : String(body.driverId),
          actorName: isAdmin ? 'Administrador Master' : (hasValidWebhookSecret ? 'Gateway Webhook' : (result.wallet?.driverName || String(body.driverId))),
          entityType: 'motorista',
          entityId: String(body.driverId),
          entityLabel: result.wallet?.driverName || String(body.driverId),
          relatedIds: { driverId: String(body.driverId), gatewayTxId: body.gatewayTxId || null, ledgerId: result.entry?.id || null },
          changes: [
            {
              field: 'debtBalance',
              label: 'Quitação de Saldo Devedor',
              before: 'Dívida Pendente',
              after: audit.formatMoneyPt(result.wallet?.debtBalance || 0),
              summary: `Pago via PIX: ${audit.formatMoneyPt(body.amount)}`
            }
          ],
          ipAddress: getRequestClientIp(req),
          userAgent: String(req.headers['user-agent'] || '').slice(0, 220) || null
        });
        return sendJson(res, 200, { ok: true, ...result });
      }

      // 2) Confirmação de pagamento de corrida
      if (!isAdmin && !hasValidWebhookSecret && !(isSandboxMode && (clientSession || driverSession))) {
        return sendJson(res, 401, { ok: false, error: 'Webhook não autorizado. Utilize o endpoint oficial com assinatura válida.' });
      }
      const rideId = body.rideId ? normalizeRideId(body.rideId) : null;
      const paidAmount = body.amount;

      if (!rideId) {
        return sendJson(res, 400, { ok: false, error: 'rideId ausente no payload do webhook.' });
      }

      const prevRes = await db.query('SELECT * FROM public.rides WHERE id = $1', [rideId]);
      if (!prevRes.rows[0]) return sendJson(res, 404, { ok: false, error: 'Corrida não encontrada.' });
      const before = formatRideFromDb(prevRes.rows[0]);

      const isAllowedRideWebhook = isAdmin || hasValidWebhookSecret || (
        isSandboxMode && (
          (clientSession && before.clientId && clientSession.sub === before.clientId) ||
          (driverSession && before.driverId && driverSession.sub === before.driverId)
        )
      );
      if (!isAllowedRideWebhook) {
        return sendJson(res, 401, { ok: false, error: 'Webhook não autorizado. Utilize o endpoint oficial com assinatura válida.' });
      }

      const settlement = await confirmDigitalRidePaymentAndPublish({
        rideId,
        paidAmountBrl: paidAmount,
        gatewayTxId: body.gatewayTxId,
        gatewayLabel: 'PIX'
      });
      return sendJson(res, 200, settlement);
    }

    const ridePaymentMatch = pathname.match(/^\/api\/rides\/([^/]+)\/payment$/);
    if (ridePaymentMatch && method === 'PATCH') {
      const id = normalizeRideId(decodeURIComponent(ridePaymentMatch[1]));
      const body = await parseBody(req);
      const isAdmin = await isAuthorizedAdmin(req);
      const driverSession = verifyDriverToken(req);
      const clientSession = verifyClientToken(req);
      if (!isAdmin && !driverSession && !clientSession) {
        return sendJson(res, 401, { ok: false, error: 'Sessão não autorizada para atualizar pagamento desta corrida.' });
      }
      const prev = await db.query('SELECT * FROM public.rides WHERE id = $1', [id]);
      if (!prev.rows[0]) return sendJson(res, 404, { error: 'Corrida não encontrada.' });
      const before = formatRideFromDb(prev.rows[0]);

      const isDriver = Boolean(driverSession && before.driverId && driverSession.sub === before.driverId);
      const isOwnerClient = Boolean(clientSession && before.clientId && clientSession.sub === before.clientId);
      if (!isAdmin && !isDriver && !isOwnerClient) {
        return sendJson(res, 401, { ok: false, error: 'Sessão não autorizada para atualizar pagamento desta corrida.' });
      }

      const targetMethod = body.paymentMethod || before.paymentMethod;
      const targetPayStatus = body.paymentStatus || before.paymentStatus;
      const isConfirmingPayment = ['pago', 'confirmado', 'parcialmente_pago'].includes(targetPayStatus);

      // Passageiro NUNCA pode autodeclarar pagamento como confirmado em nenhum meio de pagamento
      if (!isAdmin && isOwnerClient && isConfirmingPayment) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Apenas o motorista (em dinheiro) ou o gateway oficial pode confirmar o pagamento.'
        });
      }

      // Motorista só pode confirmar recebimento presencial em dinheiro (nunca PIX ou Cartão)
      if (!isAdmin && isDriver && isConfirmingPayment && targetMethod !== 'dinheiro') {
        return sendJson(res, 403, {
          ok: false,
          error: 'Pagamentos digitais (PIX/Cartão) só podem ser confirmados pelo gateway oficial.'
        });
      }

      // Regra obrigatória: PIX nunca é marcado como pago manualmente sem webhook do gateway!
      if (targetMethod === 'pix' && (targetPayStatus === 'pago' || targetPayStatus === 'confirmado')) {
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
    if (pathname === '/api/admin/audit-logs' && method === 'GET') {
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { ok: false, error: 'Acesso restrito ao Administrador Master.' });
      }
      const result = await audit.listAuditLogs({
        category: url.searchParams.get('category') || '',
        search: url.searchParams.get('search') || '',
        severity: url.searchParams.get('severity') || '',
        limit: Number(url.searchParams.get('limit') || 150),
        offset: Number(url.searchParams.get('offset') || 0)
      });
      return sendJson(res, 200, { ok: true, ...result });
    }

    const adminAuditVerifyMatch = pathname.match(/^\/api\/admin\/audit-logs\/([^/]+)\/verify$/);
    if (adminAuditVerifyMatch && method === 'GET') {
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { ok: false, error: 'Acesso restrito ao Administrador Master.' });
      }
      const identifier = decodeURIComponent(adminAuditVerifyMatch[1]);
      const verified = await audit.verifyAuditRecord(identifier);
      if (!verified) {
        return sendJson(res, 404, { ok: false, error: 'Registro de auditoria não encontrado no banco.' });
      }
      return sendJson(res, 200, { ok: true, ...verified });
    }

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
      invalidateDriversCache();

      const driverStatusChanges = [];
      if (body.approvalStatus && body.approvalStatus !== driver.approvalStatus) {
        driverStatusChanges.push({
          field: 'approvalStatus',
          label: 'Status de Aprovação',
          before: String(driver.approvalStatus),
          after: String(updated.approvalStatus),
          summary: `${driver.approvalStatus} -> ${updated.approvalStatus}`
        });
      }
      if (body.financialBlocked !== undefined && Boolean(body.financialBlocked) !== Boolean(driver.financialBlocked)) {
        driverStatusChanges.push({
          field: 'financialBlocked',
          label: 'Bloqueio Financeiro',
          before: driver.financialBlocked ? 'Bloqueado' : 'Liberado',
          after: updated.financialBlocked ? 'Bloqueado' : 'Liberado',
          summary: `${driver.financialBlocked ? 'Bloqueado' : 'Liberado'} -> ${updated.financialBlocked ? 'Bloqueado' : 'Liberado'}`
        });
      }
      if (driverStatusChanges.length > 0) {
        await audit.recordAuditEvent({
          ...getAdminActorContext(req),
          category: 'motoristas_kyc',
          actionKey: 'driver_status_updated',
          title: `Alteração de status do motorista ${updated.name}`,
          summary: driverStatusChanges.map(c => c.summary).join(' • ') + (updated.financialBlockReason ? ` (${updated.financialBlockReason})` : ''),
          severity: updated.financialBlocked ? 'critico' : 'atencao',
          entityType: 'motorista',
          entityId: updated.id,
          entityLabel: updated.name,
          relatedIds: { driverId: updated.id },
          changes: driverStatusChanges
        });
      }
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
        const act = String(body.action || 'approve').toLowerCase();
        const isApprove = act === 'approve' || act === 'aprovar' || act === 'pay' || act === 'pagar';
        const wdObj = resProc?.withdrawal || {};
        await audit.recordAuditEvent({
          ...getAdminActorContext(req),
          category: 'saques_repasses',
          actionKey: isApprove ? 'withdrawal_approved' : 'withdrawal_rejected',
          title: isApprove ? `Repasse de saque aprovado (${withdrawalId})` : `Solicitação de saque rejeitada (${withdrawalId})`,
          summary: `${isApprove ? 'Repasse autorizado' : 'Saque recusado'} para ${wdObj.driverName || wdObj.driverId || 'motorista'} no valor líquido de ${audit.formatMoneyPt(wdObj.netPayoutAmount ?? wdObj.amount ?? 0)}.${body.notes ? ` Obs.: ${body.notes}` : ''}`,
          severity: isApprove ? 'info' : 'atencao',
          entityType: 'saque',
          entityId: withdrawalId,
          entityLabel: `${wdObj.driverName || withdrawalId} • ${audit.formatMoneyPt(wdObj.netPayoutAmount ?? wdObj.amount ?? 0)}`,
          relatedIds: {
            withdrawalId,
            driverId: wdObj.driverId || null,
            payoutProviderTxId: wdObj.payoutProviderTxId || null
          },
          changes: [
            {
              field: 'status',
              label: 'Situação do Repasse',
              before: 'pendente',
              after: String(wdObj.status || (isApprove ? 'pago' : 'rejeitado')),
              summary: `Status alterado para ${wdObj.status || (isApprove ? 'pago' : 'rejeitado')}`
            }
          ]
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
      if (action === 'refund' && finance.refundGatewayPayment) {
        const refundGw = await finance.refundGatewayPayment(tx, body.amount);
        if (!refundGw.ok) {
          return sendJson(res, 400, { ok: false, error: refundGw.error || 'Falha ao estornar pagamento no gateway.' });
        }
      }
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

      await audit.recordAuditEvent({
        ...getAdminActorContext(req),
        category: 'financeiro_corridas',
        actionKey: action === 'refund' ? 'admin_payment_refund' : 'admin_payment_dispute',
        title: action === 'refund'
          ? `Estorno manual executado (${tx.rideCode || tx.rideId})`
          : `Contestação financeira registrada (${tx.rideCode || tx.rideId})`,
        summary: action === 'refund'
          ? `Reembolso administrativo de ${audit.formatMoneyPt(updatedTx.refundedAmount || tx.finalAmount)} na transação ${tx.id}.`
          : `Transação ${tx.id} marcada como contestada (${updatedTx.disputeReason || 'sem motivo'}).`,
        severity: 'critico',
        entityType: 'transacao',
        entityId: tx.id,
        entityLabel: `${tx.rideCode || tx.rideId} • ${audit.formatMoneyPt(tx.finalAmount)}`,
        relatedIds: {
          transactionId: tx.id,
          rideId: tx.rideId,
          rideCode: tx.rideCode,
          driverId: tx.driverId || null,
          gatewayTxId: tx.gatewayTxId || null
        },
        changes: [
          {
            field: 'status',
            label: 'Status da Transação',
            before: String(tx.status),
            after: nextStatus,
            summary: `${tx.status} -> ${nextStatus}`
          }
        ]
      });

      return sendJson(res, 200, { ok: true, transaction: updatedTx });
    }

    // ===== PUSH: teste, modelos e disparo manual =====
    if (pathname === '/api/push/templates' && method === 'GET') {
      const templates = await push.getTemplates();
      return sendJson(res, 200, templates);
    }
    if (pathname === '/api/push/test' && method === 'POST') {
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { error: 'Acesso não autorizado: PIN de motorista inválido ou ausente.' });
      }
      const body = await parseBody(req);
      const target = body.externalId || push.ADMIN_EXTERNAL_ID;
      const r = await push.sendToExternalIds([target], body.title || '🔔 Teste Kavro Drive', body.message || 'Notificações funcionando!', { url: '/administracion' });
      return sendJson(res, 200, { ok: !!r?.id, result: r });
    }
    if (pathname === '/api/push/broadcast' && method === 'POST') {
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { error: 'Acesso não autorizado para disparo de notificações.' });
      }
      const body = await parseBody(req);
      const audience = ['cliente', 'motorista', 'ambos', 'admin'].includes(body.audience)
        ? body.audience
        : 'ambos';
      const title = String(body.title || '').trim();
      const message = String(body.message || '').trim();
      if (!title || !message) {
        return sendJson(res, 400, { error: 'Título e mensagem da notificação são obrigatórios.' });
      }
      const out = await push.broadcastManualPush({
        audience,
        title,
        message,
        url: body.url ? String(body.url) : undefined
      });
      return sendJson(res, 200, out);
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
      const regLimit = await security.checkRateLimitAsync('cli_reg', getRequestClientIp(req), 10, 10 * 60 * 1000);
      if (!regLimit.allowed) {
        return sendJson(res, 429, { ok: false, error: 'Muitas tentativas de cadastro. Aguarde alguns minutos.' });
      }
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
        return sendJson(res, 400, { ok: false, error: 'Informe nome completo e WhatsApp válido com DDD.' });
      }
      if (!isValidCpfDigits(document)) {
        return sendJson(res, 400, { ok: false, error: 'Informe um CPF válido (11 dígitos).' });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return sendJson(res, 400, { ok: false, error: 'Informe um endereço de e-mail válido.' });
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
            OR ($3 <> '' AND regexp_replace(COALESCE(document, ''), '\\D', '', 'g') = $3)
         LIMIT 1`,
        [cleanPhone, email, document]
      );

      const passwordHash = hashPassword(password);
      const clientIp = getRequestClientIp(req);
      let savedClientRow = null;

      if (existingRes.rows[0]) {
        const existing = existingRes.rows[0];
        return sendJson(res, 409, {
          ok: false,
          code: existing.password_hash ? 'ACCOUNT_EXISTS' : 'PASSWORD_SETUP_REQUIRED',
          error: existing.password_hash
            ? 'Já existe uma conta cadastrada com este CPF, WhatsApp ou E-mail. Faça login com sua senha.'
            : 'Este CPF, WhatsApp ou E-mail já possui pré-cadastro no sistema. Use "Esqueci minha senha / Criar senha" para definir sua senha com código OTP.'
        });
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

      // Vinculação automática ao Perfil Familiar (se veio pelo link rastreável ?convite / familyInviteToken OU pelo telefone convidado)
      let linkedFamilyMember = null;
      try {
        let matchedInvite = null;
        const inviteTokenReq = String(body.familyInviteToken || '').trim();
        if (inviteTokenReq) {
          const invRes = await db.query(
            'SELECT * FROM public.family_members WHERE invite_token = $1 LIMIT 1',
            [inviteTokenReq]
          );
          if (invRes.rows[0] && invRes.rows[0].status !== 'revogado') {
            matchedInvite = invRes.rows[0];
          }
        }
        if (!matchedInvite) {
          const pendingRes = await db.query(
            "SELECT * FROM public.family_members WHERE status != 'revogado'"
          );
          matchedInvite = (pendingRes.rows || []).find(
            (m) => normalizePhoneDigitsServer(m.teen_phone || '') === cleanPhone && m.status === 'convite_enviado'
          ) || null;
        }
        if (matchedInvite) {
          savedClientRow = (await activateTeenAccountLink(matchedInvite, savedClientRow)) || savedClientRow;
          linkedFamilyMember = {
            id: matchedInvite.id,
            guardianId: matchedInvite.guardian_id,
            guardianName: matchedInvite.guardian_name
          };
          await audit.recordAuditEvent({
            category: 'seguranca',
            actionKey: 'family_teen_linked',
            title: `Conta Adolescente vinculada ao Perfil Familiar (${name})`,
            summary: `Adolescente ${name} concluiu cadastro e vinculou-se ao responsável ${matchedInvite.guardian_name || matchedInvite.guardian_id}.`,
            severity: 'info',
            actorRole: 'passageiro',
            actorId: savedClientRow.id,
            actorName: name,
            entityType: 'passageiro',
            entityId: savedClientRow.id,
            entityLabel: name,
            relatedIds: { guardianId: matchedInvite.guardian_id, familyMemberId: matchedInvite.id }
          }).catch(() => {});
        }
      } catch {
        // segue registro padrão
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

      return sendJson(res, 200, {
        ok: true,
        client: sanitizedClient,
        linkedFamilyMember,
        clientToken: signUserRoleToken('client', sanitizedClient)
      });
    }

    if (pathname === '/api/clients/check' && (method === 'POST' || method === 'GET')) {
      const checkLimit = await security.checkRateLimitAsync('cli_check', getRequestClientIp(req), 30, 5 * 60 * 1000);
      if (!checkLimit.allowed) {
        return sendJson(res, 429, { ok: false, error: 'Muitas consultas em sequência. Aguarde alguns instantes.' });
      }
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

      const firstName = clientRow.name ? clientRow.name.split(' ')[0] : 'Passageiro';
      return sendJson(res, 200, {
        ok: true,
        exists: true,
        hasPassword: Boolean(clientRow.password_hash),
        requiresPasswordSetup: !clientRow.password_hash,
        name: firstName,
        firstName,
        blocked: Boolean(clientRow.blocked),
        termsSigned: Boolean(clientRow.terms_signature && clientRow.terms_signature.signed),
        termsValidationCode: clientRow.terms_signature?.validationCode || null
      });
    }

    if (pathname === '/api/clients/login' && method === 'POST') {
      const loginLimit = await security.checkRateLimitAsync('cli_login', getRequestClientIp(req), 25, 10 * 60 * 1000);
      if (!loginLimit.allowed) {
        return sendJson(res, 429, { ok: false, error: 'Muitas tentativas de login. Aguarde alguns minutos.' });
      }
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
        return sendJson(res, 403, {
          ok: false,
          code: 'PASSWORD_SETUP_REQUIRED',
          error: 'Esta conta ainda não possui senha definida. Use "Esqueci minha senha / Criar senha" para validar seu código OTP antes de entrar.'
        });
      }

      const sanitizedLoginClient = sanitizeClientRow(clientRow, false);
      return sendJson(res, 200, {
        ok: true,
        client: sanitizedLoginClient,
        clientToken: signUserRoleToken('client', sanitizedLoginClient)
      });
    }

    if (pathname === '/api/clients/google-auth' && method === 'POST') {
      await ensureClientsSchema();
      const body = await parseBody(req);
      const googleCheck = await verifyGoogleCredential({
        idToken: body.idToken,
        accessToken: body.accessToken
      });
      if (!googleCheck.ok) {
        return sendJson(res, googleCheck.status || 401, { ok: false, error: googleCheck.error });
      }

      const googleEmail = googleCheck.email;
      const emailRes = await db.query(
        `SELECT * FROM public.clients
         WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $1
            OR ($2 <> '' AND LOWER(COALESCE(email, '')) = $2)
         LIMIT 1`,
        ['', googleEmail]
      );
      const existingByEmail = emailRes.rows[0] || null;

      if (existingByEmail) {
        if (existingByEmail.blocked) {
          return sendJson(res, 403, {
            ok: false,
            error: 'Sua conta está temporariamente suspensa. Entre em contato com a central.'
          });
        }
        const existingPhoneDigits = String(existingByEmail.phone || '').replace(/\D/g, '');
        const existingDocDigits = String(existingByEmail.document || '').replace(/\D/g, '');
        const hasTerms = Boolean(
          existingByEmail.terms_accepted_at ||
          (existingByEmail.terms_signature && existingByEmail.terms_signature.signed)
        );
        if (existingPhoneDigits.length >= 10 && isValidCpfDigits(existingDocDigits) && hasTerms) {
          const existingSanitized = sanitizeClientRow(existingByEmail, false);
          return sendJson(res, 200, {
            ok: true,
            needsRegistration: false,
            client: existingSanitized,
            clientToken: signUserRoleToken('client', existingSanitized)
          });
        }
      }

      const finalName = String(body.name || existingByEmail?.name || googleCheck.name || '').trim();
      const rawPhone = String(body.phone || existingByEmail?.phone || '').trim();
      const cleanPhone = rawPhone.replace(/\D/g, '');
      const rawDocument = String(body.document || existingByEmail?.document || '').replace(/\D/g, '');
      const acceptedTerms = Boolean(body.termsAcceptance && body.termsAcceptance.accepted === true);

      if (body.document !== undefined && !isValidCpfDigits(rawDocument)) {
        return sendJson(res, 400, { ok: false, error: 'Informe um CPF válido (11 dígitos).' });
      }

      if (!finalName || cleanPhone.length < 10 || !isValidCpfDigits(rawDocument) || !acceptedTerms) {
        return sendJson(res, 200, {
          ok: true,
          needsRegistration: true,
          googleProfile: {
            email: googleEmail,
            name: finalName || googleCheck.name,
            picture: googleCheck.picture || '',
            existingPhone: existingByEmail?.phone || '',
            existingDocument: existingByEmail?.document || ''
          }
        });
      }

      const turnstile = await verifyTurnstileToken(body.turnstileToken, req.socket?.remoteAddress);
      if (!turnstile.ok) {
        return sendJson(res, 403, { ok: false, error: turnstile.error });
      }

      let targetRow = existingByEmail;
      if (!targetRow) {
        const phoneRes = await db.query(
          `SELECT * FROM public.clients
           WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $1
              OR ($2 <> '' AND regexp_replace(COALESCE(document, ''), '\\D', '', 'g') = $2)
           LIMIT 1`,
          [cleanPhone, rawDocument]
        );
        const existingByPhone = phoneRes.rows[0] || null;
        if (existingByPhone) {
          if (existingByPhone.blocked) {
            return sendJson(res, 403, {
              ok: false,
              error: 'Sua conta está temporariamente suspensa. Entre em contato com a central.'
            });
          }
          const existingEmailNorm = String(existingByPhone.email || '').trim().toLowerCase();
          if (existingEmailNorm && existingEmailNorm !== googleEmail) {
            return sendJson(res, 409, {
              ok: false,
              error: 'Este WhatsApp ou CPF já está vinculado a outro e-mail cadastrado. Entre com sua senha ou use outro dado.'
            });
          }
          if (existingByPhone.password_hash) {
            return sendJson(res, 409, {
              ok: false,
              error: 'Já existe uma conta cadastrada com este WhatsApp ou CPF. Faça login com sua senha.'
            });
          }
          targetRow = existingByPhone;
        }
      }

      const clientIp = getRequestClientIp(req);
      let savedClientRow = null;

      if (targetRow) {
        const finalDoc = rawDocument || String(targetRow.document || '').replace(/\D/g, '');
        const termsSignature = passengerTermsContract.buildPassengerTermsSignature({
          clientId: targetRow.id,
          name: finalName,
          document: finalDoc,
          phone: rawPhone,
          email: googleEmail,
          ip: clientIp,
          userAgent: req.headers['user-agent'],
          host: req.headers.host,
          clientAcceptance: body.termsAcceptance
        });
        const nextHash = targetRow.password_hash || hashPassword(crypto.randomBytes(24).toString('hex'));
        const updatedRes = await db.query(
          `UPDATE public.clients
           SET name = $1, phone = $2, email = $3, document = $4, password_hash = $5, terms_accepted_at = $6, terms_signature = $7
           WHERE id = $8
           RETURNING *`,
          [
            finalName,
            rawPhone,
            googleEmail,
            finalDoc || null,
            nextHash,
            termsSignature.signedAt,
            JSON.stringify(termsSignature),
            targetRow.id
          ]
        );
        savedClientRow = updatedRes.rows[0];
      } else {
        const newId = `cli-${Date.now()}`;
        const termsSignature = passengerTermsContract.buildPassengerTermsSignature({
          clientId: newId,
          name: finalName,
          document: rawDocument,
          phone: rawPhone,
          email: googleEmail,
          ip: clientIp,
          userAgent: req.headers['user-agent'],
          host: req.headers.host,
          clientAcceptance: body.termsAcceptance
        });
        const randomHash = hashPassword(crypto.randomBytes(24).toString('hex'));
        const insertRes = await db.query(
          `INSERT INTO public.clients (id, name, phone, email, document, password_hash, saved_addresses, terms_accepted_at, terms_signature, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
           RETURNING *`,
          [
            newId,
            finalName,
            rawPhone,
            googleEmail,
            rawDocument || null,
            randomHash,
            JSON.stringify([]),
            termsSignature.signedAt,
            JSON.stringify(termsSignature)
          ]
        );
        savedClientRow = insertRes.rows[0];
      }

      const sanitizedClient = sanitizeClientRow(savedClientRow, false);
      const termCode = sanitizedClient.termsSignature?.validationCode ? ` • Termo: ${sanitizedClient.termsSignature.validationCode}` : '';
      await db.query(
        `INSERT INTO public.notifications (id, title, message, type, read, timestamp)
         VALUES ($1, $2, $3, 'client_new', false, NOW())`,
        [
          `notif-cli-${Date.now()}`,
          `👤 Novo Passageiro (Google): ${sanitizedClient.name}`,
          `WhatsApp: ${sanitizedClient.phone} • ${googleEmail}${termCode}`
        ]
      ).catch(() => {});

      return sendJson(res, 200, {
        ok: true,
        needsRegistration: false,
        client: sanitizedClient,
        clientToken: signUserRoleToken('client', sanitizedClient)
      });
    }

    if (pathname === '/api/clients/complete-contact' && method === 'POST') {
      await ensureClientsSchema();
      const body = await parseBody(req);
      const clientId = String(body.clientId || '').trim();
      const password = String(body.password || '');
      const name = String(body.name || '').trim();
      const rawPhone = String(body.phone || '').trim();
      const cleanPhone = rawPhone.replace(/\D/g, '');
      const email = String(body.email || '').trim().toLowerCase();

      if (!clientId || !password) {
        return sendJson(res, 400, { ok: false, error: 'Sessão inválida. Faça login novamente.' });
      }
      if (cleanPhone.length < 10 || cleanPhone === '48999990000') {
        return sendJson(res, 400, { ok: false, error: 'Informe um WhatsApp válido com DDD.' });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return sendJson(res, 400, { ok: false, error: 'Informe um endereço de e-mail válido.' });
      }

      const clientRes = await db.query(
        `SELECT * FROM public.clients
         WHERE ($1 <> '' AND id = $1)
            OR ($2 <> '' AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $2)
         LIMIT 1`,
        [clientId, '']
      );
      const currentRow = clientRes.rows[0];
      if (!currentRow) {
        return sendJson(res, 404, { ok: false, error: 'Conta não encontrada.' });
      }
      if (currentRow.blocked) {
        return sendJson(res, 403, { ok: false, error: 'Sua conta está temporariamente suspensa. Entre em contato com a central.' });
      }
      if (!currentRow.password_hash || !verifyPassword(password, currentRow.password_hash)) {
        return sendJson(res, 401, { ok: false, error: 'Confirmação de senha inválida. Faça login novamente.' });
      }

      const cleanDoc = body.document !== undefined
        ? String(body.document || '').replace(/\D/g, '')
        : String(currentRow.document || '').replace(/\D/g, '');
      if (!isValidCpfDigits(cleanDoc)) {
        return sendJson(res, 400, { ok: false, error: 'Informe um CPF válido (11 dígitos).' });
      }

      const conflictRes = await db.query(
        `SELECT id, phone, email, document FROM public.clients
         WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $1
            OR ($2 <> '' AND LOWER(COALESCE(email, '')) = $2)
            OR ($3 <> '' AND regexp_replace(COALESCE(document, ''), '\\D', '', 'g') = $3)
         LIMIT 1`,
        [cleanPhone, email, cleanDoc]
      );
      const conflict = conflictRes.rows[0];
      if (conflict && conflict.id !== currentRow.id) {
        return sendJson(res, 409, {
          ok: false,
          error: 'Este CPF, WhatsApp ou E-mail já está vinculado a outra conta.'
        });
      }

      const nextName = name || currentRow.name || 'Passageiro Kavro';
      let nextTermsSignature = currentRow.terms_signature || null;
      if (nextTermsSignature && nextTermsSignature.signed && !nextTermsSignature.passengerSnapshot?.rawCpf) {
        const rebuilt = passengerTermsContract.buildPassengerTermsSignature({
          clientId: currentRow.id,
          name: nextName,
          document: cleanDoc,
          phone: rawPhone,
          email,
          ip: getRequestClientIp(req),
          userAgent: req.headers['user-agent'],
          host: req.headers.host,
          clientAcceptance: {
            acceptedAtClient: nextTermsSignature.technicalEvidence?.clientAcceptedAt,
            affirmativeText: nextTermsSignature.affirmativeAction,
            language: nextTermsSignature.technicalEvidence?.language,
            timezone: nextTermsSignature.technicalEvidence?.timezone
          }
        });
        nextTermsSignature = rebuilt;
      }

      const updated = await db.query(
        `UPDATE public.clients
         SET name = $1, phone = $2, email = $3, document = $4, terms_signature = COALESCE($5, terms_signature)
         WHERE id = $6
         RETURNING *`,
        [nextName, rawPhone, email, cleanDoc, nextTermsSignature ? JSON.stringify(nextTermsSignature) : null, currentRow.id]
      );
      const savedRow = updated.rows[0] || { ...currentRow, name: nextName, phone: rawPhone, email, document: cleanDoc, terms_signature: nextTermsSignature };
      const sanitizedContactClient = sanitizeClientRow(savedRow, false);
      return sendJson(res, 200, {
        ok: true,
        client: sanitizedContactClient,
        clientToken: signUserRoleToken('client', sanitizedContactClient)
      });
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
        const clientSession = verifyClientToken(req);
        const cli = await parseBody(req);
        if (!isAdmin && (!clientSession || !cli.id || clientSession.sub !== cli.id)) {
          return sendJson(res, 401, { ok: false, error: 'Autenticação necessária para salvar dados do passageiro.' });
        }
        if (!isAdmin) {
          const updatedSelfRes = await db.query(
            `UPDATE public.clients
             SET saved_addresses = COALESCE($1, saved_addresses),
                 terms_accepted_at = COALESCE($2, terms_accepted_at),
                 terms_signature = COALESCE($3, terms_signature)
             WHERE id = $4
             RETURNING *`,
            [
              cli.savedAddresses !== undefined ? JSON.stringify(cli.savedAddresses || []) : null,
              cli.termsAcceptedAt || null,
              cli.termsSignature ? JSON.stringify(cli.termsSignature) : null,
              clientSession.sub
            ]
          );
          if (!updatedSelfRes.rows[0]) {
            return sendJson(res, 404, { ok: false, error: 'Passageiro não encontrado.' });
          }
          return sendJson(res, 200, { ok: true, client: sanitizeClientRow(updatedSelfRes.rows[0], false) });
        }
        if (!cli.id) cli.id = `cli-${Date.now()}`;
        const pwdHash = cli.password ? hashPassword(cli.password) : null;

        const r = await db.query(`
          INSERT INTO public.clients (id, name, phone, email, document, password_hash, notes, blocked, saved_addresses, terms_accepted_at, terms_signature, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (id) DO UPDATE SET
            name = CASE WHEN $13::boolean THEN EXCLUDED.name ELSE public.clients.name END,
            phone = CASE WHEN $13::boolean THEN EXCLUDED.phone ELSE public.clients.phone END,
            email = CASE WHEN $13::boolean THEN COALESCE(EXCLUDED.email, public.clients.email) ELSE public.clients.email END,
            document = CASE WHEN $13::boolean THEN COALESCE(EXCLUDED.document, public.clients.document) ELSE public.clients.document END,
            password_hash = CASE WHEN $13::boolean THEN COALESCE(EXCLUDED.password_hash, public.clients.password_hash) ELSE public.clients.password_hash END,
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

    const cliPhotoMatch = pathname.match(/^\/api\/clients\/([^/]+)\/photo$/);
    if (cliPhotoMatch && method === 'POST') {
      await ensureClientsSchema();
      const clientId = decodeURIComponent(cliPhotoMatch[1]);
      const isAdmin = await isAuthorizedAdmin(req);
      const clientSession = verifyClientToken(req);
      if (!isAdmin && (!clientSession || clientSession.sub !== clientId)) {
        return sendJson(res, 401, { ok: false, error: 'Faça login para atualizar sua foto de perfil.' });
      }
      const body = await parseBody(req);
      let nextPhoto = String(body.photo || '').trim();
      if (!nextPhoto) {
        return sendJson(res, 400, { ok: false, error: 'Nenhuma imagem enviada.' });
      }
      if (nextPhoto.startsWith('data:image/')) {
        nextPhoto = await kycStorage.savePublicMedia(clientId, 'client-avatar', nextPhoto);
      }
      const updated = await db.query(
        `UPDATE public.clients SET photo = $1 WHERE id = $2 RETURNING *`,
        [nextPhoto, clientId]
      );
      if (!updated.rows[0]) {
        return sendJson(res, 404, { ok: false, error: 'Passageiro não encontrado.' });
      }
      return sendJson(res, 200, { ok: true, client: sanitizeClientRow(updated.rows[0], isAdmin) });
    }

    const cliPcrMatch = pathname.match(/^\/api\/clients\/([^/]+)\/profile-change-request$/);
    if (cliPcrMatch && method === 'POST') {
      await ensureClientsSchema();
      const clientId = decodeURIComponent(cliPcrMatch[1]);
      const isAdmin = await isAuthorizedAdmin(req);
      const clientSession = verifyClientToken(req);
      if (!isAdmin && (!clientSession || clientSession.sub !== clientId)) {
        return sendJson(res, 401, { ok: false, error: 'Faça login para solicitar alteração cadastral.' });
      }
      const currentRes = await db.query('SELECT * FROM public.clients WHERE id = $1 LIMIT 1', [clientId]);
      const currentRow = currentRes.rows[0];
      if (!currentRow) {
        return sendJson(res, 404, { ok: false, error: 'Passageiro não encontrado.' });
      }
      const body = await parseBody(req);
      const requestedFields = {};
      const previousValues = {};

      if (body.name !== undefined && String(body.name).trim() && String(body.name).trim() !== String(currentRow.name || '').trim()) {
        requestedFields.name = String(body.name).trim();
        previousValues.name = currentRow.name || '';
      }
      if (body.phone !== undefined) {
        const cleanNew = String(body.phone).replace(/\D/g, '');
        const cleanOld = String(currentRow.phone || '').replace(/\D/g, '');
        if (cleanNew.length >= 10 && cleanNew !== cleanOld) {
          requestedFields.phone = String(body.phone).trim();
          previousValues.phone = currentRow.phone || '';
        }
      }
      if (body.email !== undefined) {
        const cleanNewEmail = String(body.email).trim().toLowerCase();
        const cleanOldEmail = String(currentRow.email || '').trim().toLowerCase();
        if (cleanNewEmail !== cleanOldEmail) {
          requestedFields.email = cleanNewEmail;
          previousValues.email = currentRow.email || '';
        }
      }
      if (body.document !== undefined) {
        const cleanNewDoc = String(body.document).replace(/\D/g, '');
        const cleanOldDoc = String(currentRow.document || '').replace(/\D/g, '');
        if (cleanNewDoc !== cleanOldDoc) {
          if (!isValidCpfDigits(cleanNewDoc)) {
            return sendJson(res, 400, { ok: false, error: 'Informe um CPF válido (11 dígitos).' });
          }
          requestedFields.document = cleanNewDoc;
          previousValues.document = currentRow.document || '';
        }
      }

      if (Object.keys(requestedFields).length === 0) {
        return sendJson(res, 400, { ok: false, error: 'Nenhuma alteração de nome, telefone, e-mail ou CPF foi informada.' });
      }

      const profileChangeRequest = {
        id: `pcr-${Date.now()}`,
        requestedFields,
        previousValues,
        status: 'pendente',
        requestedAt: new Date().toISOString()
      };

      const updated = await db.query(
        `UPDATE public.clients SET profile_change_request = $1 WHERE id = $2 RETURNING *`,
        [JSON.stringify(profileChangeRequest), clientId]
      );
      const savedRow = updated.rows[0] || { ...currentRow, profile_change_request: profileChangeRequest };

      const changedSummary = Object.keys(requestedFields).join(', ');
      await db.query(
        `INSERT INTO public.notifications (id, title, message, type, read, timestamp)
         VALUES ($1, $2, $3, 'profile_change_request', false, NOW())`,
        [
          `notif-pcr-cli-${Date.now()}`,
          `✏️ Alteração Cadastral (Passageiro): ${currentRow.name}`,
          `Campos solicitados (${changedSummary}) aguardam aprovação na aba Passageiros.`
        ]
      ).catch(() => {});

      return sendJson(res, 200, {
        ok: true,
        client: sanitizeClientRow(savedRow, isAdmin),
        profileChangeRequest
      });
    }

    // CONTATOS DE CONFIANÇA DO PASSAGEIRO (COMPARTILHAMENTO AUTOMÁTICO VIA API)
    const cliTrustedMatch = pathname.match(/^\/api\/clients\/([^/]+)\/trusted-contacts$/);
    if (cliTrustedMatch && (method === 'GET' || method === 'PUT' || method === 'POST')) {
      await ensureClientsSchema();
      const clientId = decodeURIComponent(cliTrustedMatch[1]);
      const isAdmin = await isAuthorizedAdmin(req);
      const clientSession = verifyClientToken(req);
      if (!isAdmin && (!clientSession || clientSession.sub !== clientId)) {
        return sendJson(res, 401, { ok: false, error: 'Faça login para gerenciar seus contatos de confiança.' });
      }

      const clientRes = await db.query('SELECT * FROM public.clients WHERE id = $1 LIMIT 1', [clientId]);
      const clientRow = clientRes.rows[0];
      if (!clientRow) {
        return sendJson(res, 404, { ok: false, error: 'Passageiro não encontrado.' });
      }

      if (method === 'GET') {
        const contacts = Array.isArray(clientRow.trusted_contacts)
          ? clientRow.trusted_contacts
          : (Array.isArray(clientRow.trustedContacts) ? clientRow.trustedContacts : []);
        return sendJson(res, 200, { ok: true, trustedContacts: contacts });
      }

      const body = await parseBody(req);
      const rawList = Array.isArray(body.trustedContacts) ? body.trustedContacts : [];
      if (rawList.length > 5) {
        return sendJson(res, 400, { ok: false, error: 'É permitido cadastrar no máximo 5 contatos de confiança.' });
      }

      const cleanList = [];
      for (let i = 0; i < rawList.length; i++) {
        const item = rawList[i] || {};
        const name = String(item.name || '').trim();
        const phone = String(item.phone || '').trim();
        const phoneDigits = phone.replace(/\D/g, '');
        if (name.length < 2) {
          return sendJson(res, 400, { ok: false, error: 'Informe um nome válido para cada contato de confiança.' });
        }
        if (phoneDigits.length < 10) {
          return sendJson(res, 400, { ok: false, error: `Informe um WhatsApp válido com DDD para ${name}.` });
        }
        cleanList.push({
          id: String(item.id || `tc-${Date.now()}-${i}`),
          name,
          relationship: String(item.relationship || 'Familiar').trim(),
          phone,
          autoShareAllRides: item.autoShareAllRides !== false,
          autoShareNightOnly: Boolean(item.autoShareNightOnly),
          notifyOnAnomalyOrSos: item.notifyOnAnomalyOrSos !== false,
          createdAt: item.createdAt || new Date().toISOString()
        });
      }

      const updRes = await db.query(
        'UPDATE public.clients SET trusted_contacts = $1 WHERE id = $2 RETURNING *',
        [JSON.stringify(cleanList), clientId]
      );
      const savedRow = updRes.rows[0] || { ...clientRow, trusted_contacts: cleanList };

      await audit.recordAuditEvent({
        category: 'sistema',
        actionKey: 'trusted_contacts_updated',
        title: `Contatos de confiança atualizados (${clientRow.name})`,
        summary: `${cleanList.length} contato(s) configurados para compartilhamento automático de rota pela API.`,
        severity: 'info',
        actorRole: isAdmin ? 'admin_master' : 'passageiro',
        actorId: isAdmin ? 'admin-master' : clientId,
        actorName: isAdmin ? 'Administrador Master' : clientRow.name,
        entityType: 'passageiro',
        entityId: clientId,
        entityLabel: clientRow.name
      }).catch(() => {});

      return sendJson(res, 200, {
        ok: true,
        trustedContacts: cleanList,
        client: sanitizeClientRow(savedRow, isAdmin)
      });
    }

    // Preferências de Segurança Completa do Passageiro (K-Código, K-Áudio, Contatos de Emergência, K-Ajuda, Perfil Familiar)
    const clientSafetyMatch = pathname.match(/^\/api\/clients\/([^/]+)\/safety$/);
    if (clientSafetyMatch && (method === 'GET' || method === 'PUT' || method === 'POST')) {
      await ensureClientsSchema();
      const clientId = decodeURIComponent(clientSafetyMatch[1]);
      const isAdmin = await isAuthorizedAdmin(req);
      const clientSession = verifyClientToken(req);
      if (!isAdmin && (!clientSession || clientSession.sub !== clientId)) {
        return sendJson(res, 401, { ok: false, error: 'Sessão inválida para gerenciar segurança do passageiro.' });
      }

      const clientRes = await db.query('SELECT * FROM public.clients WHERE id = $1 LIMIT 1', [clientId]);
      const clientRow = clientRes.rows[0];
      if (!clientRow) {
        return sendJson(res, 404, { ok: false, error: 'Passageiro não encontrado.' });
      }

      const existingSafety = normalizeSafetyPreferencesServer(
        clientRow.safety_preferences || clientRow.safetyPreferences
      );
      const existingEmergency = Array.isArray(clientRow.emergency_contacts)
        ? clientRow.emergency_contacts
        : (Array.isArray(clientRow.emergencyContacts) ? clientRow.emergencyContacts : []);

      if (method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          safetyPreferences: existingSafety,
          emergencyContacts: existingEmergency,
          trustedContacts: Array.isArray(clientRow.trusted_contacts) ? clientRow.trusted_contacts : [],
          client: sanitizeClientRow(clientRow, isAdmin)
        });
      }

      const body = await parseBody(req);
      let nextEmergencyList = existingEmergency;
      if (body.emergencyContacts !== undefined) {
        const rawEmerg = Array.isArray(body.emergencyContacts) ? body.emergencyContacts : [];
        if (rawEmerg.length > 5) {
          return sendJson(res, 400, { ok: false, error: 'É permitido cadastrar no máximo 5 contatos de emergência.' });
        }
        nextEmergencyList = [];
        for (let i = 0; i < rawEmerg.length; i++) {
          const item = rawEmerg[i] || {};
          const name = String(item.name || '').trim();
          const phone = String(item.phone || '').trim();
          const phoneDigits = phone.replace(/\D/g, '');
          if (name.length < 2) {
            return sendJson(res, 400, { ok: false, error: 'Informe um nome válido para cada contato de emergência.' });
          }
          if (phoneDigits.length < 10) {
            return sendJson(res, 400, { ok: false, error: `Informe um telefone/WhatsApp válido para ${name}.` });
          }
          nextEmergencyList.push({
            id: String(item.id || `ec-${Date.now()}-${i}`),
            name,
            phone,
            relationship: String(item.relationship || 'Emergência').trim(),
            createdAt: item.createdAt || new Date().toISOString()
          });
        }
      }

      if (body.safetyPreferences?.customBoardingPin !== undefined && body.safetyPreferences.customBoardingPin !== '') {
        const cleanPinTest = String(body.safetyPreferences.customBoardingPin).replace(/\D/g, '');
        if (!/^\d{4}$/.test(cleanPinTest)) {
          return sendJson(res, 400, { ok: false, error: 'O código K-Código precisa ter exatamente 4 números.' });
        }
      }

      const nextSafetyPrefs = normalizeSafetyPreferencesServer(body.safetyPreferences || {}, existingSafety);

      const updRes = await db.query(
        'UPDATE public.clients SET safety_preferences = $1, emergency_contacts = $2 WHERE id = $3 RETURNING *',
        [JSON.stringify(nextSafetyPrefs), JSON.stringify(nextEmergencyList), clientId]
      );
      const savedRow = updRes.rows[0] || {
        ...clientRow,
        safety_preferences: nextSafetyPrefs,
        emergency_contacts: nextEmergencyList
      };

      // Sincroniza corridas ainda não iniciadas (pré-embarque) para que K-Código ON/OFF/Alteração valha imediatamente
      try {
        const openRes = await db.query('SELECT * FROM public.rides');
        const preBoardingStatuses = new Set([
          'aguardando_pagamento',
          'aguardando_confirmacao',
          'aguardando',
          'confirmada',
          'a_caminho',
          'no_local'
        ]);
        for (const rRow of openRes.rows) {
          const rideObj = formatRideFromDb(rRow);
          if (!rideObj || rideObj.isManualBooking) continue;
          if (rideObj.clientId !== clientId) continue;
          if (!preBoardingStatuses.has(rideObj.status)) continue;

          const curSnap = rideObj.appliedFareSnapshot && typeof rideObj.appliedFareSnapshot === 'object'
            ? { ...rideObj.appliedFareSnapshot }
            : {};
          const wantsPin = nextSafetyPrefs.familySafetyEnabled || nextSafetyPrefs.boardingPinEnabled !== false;
          const targetPin = wantsPin
            ? (nextSafetyPrefs.customBoardingPin || curSnap.boardingPin || String(crypto.randomInt(1000, 9999)))
            : null;
          if ((curSnap.boardingPin || null) !== targetPin) {
            if (targetPin) {
              curSnap.boardingPin = targetPin;
            } else {
              delete curSnap.boardingPin;
            }
            const updRideRes = await db.query(
              'UPDATE public.rides SET applied_fare_snapshot = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
              [JSON.stringify(curSnap), rideObj.id]
            );
            const enrichedUpd = updRideRes.rows[0] ? formatRideFromDb(updRideRes.rows[0]) : { ...rideObj, appliedFareSnapshot: curSnap };
            realtimeHub.publish(
              'ride:updated',
              {
                ride: security.sanitizeRideForViewer(enrichedUpd, { isOwnerClient: true }),
                driverRide: security.sanitizeRideForViewer(enrichedUpd, { isAssignedDriver: true })
              },
              { rideId: rideObj.id, clientId: rideObj.clientId || undefined, driverId: rideObj.driverId || undefined }
            );
          }
        }
      } catch {
        // segue fluxo mesmo se não houver corridas abertas
      }

      await audit.recordAuditEvent({
        category: 'sistema',
        actionKey: 'safety_preferences_updated',
        title: `Central de Segurança atualizada (${clientRow.name})`,
        summary: `K-Código=${nextSafetyPrefs.boardingPinEnabled ? 'ON' : 'OFF'}, K-Áudio=${nextSafetyPrefs.audioRecordingEnabled ? 'ON' : 'OFF'}, K-Ajuda=${nextSafetyPrefs.rideCheckEnabled ? 'ON' : 'OFF'}, Emergência=${nextEmergencyList.length}.`,
        severity: 'info',
        actorRole: isAdmin ? 'admin_master' : 'passageiro',
        actorId: isAdmin ? 'admin-master' : clientId,
        actorName: isAdmin ? 'Administrador Master' : clientRow.name,
        entityType: 'passageiro',
        entityId: clientId,
        entityLabel: clientRow.name
      }).catch(() => {});

      return sendJson(res, 200, {
        ok: true,
        safetyPreferences: nextSafetyPrefs,
        emergencyContacts: nextEmergencyList,
        client: sanitizeClientRow(savedRow, isAdmin)
      });
    }

    // Registro de Gravação K-Áudio de Segurança vinculada à corrida
    const safetyAudioMatch = pathname.match(/^\/api\/rides\/([^/]+)\/safety-audio$/);
    if (safetyAudioMatch && method === 'POST') {
      const id = normalizeRideId(decodeURIComponent(safetyAudioMatch[1]));
      const isAdmin = await isAuthorizedAdmin(req);
      const clientSession = verifyClientToken(req);
      const driverSession = verifyDriverToken(req);

      const curRes = await db.query('SELECT * FROM public.rides WHERE id = $1 LIMIT 1', [id]);
      const row = curRes.rows[0];
      if (!row) {
        return sendJson(res, 404, { ok: false, error: 'Corrida não encontrada.' });
      }
      const ride = formatRideFromDb(row);
      const isOwnClient = Boolean(clientSession && ride.clientId && clientSession.sub === ride.clientId);
      const isAssignedDriver = Boolean(driverSession && ride.driverId && driverSession.sub === ride.driverId);
      if (!isAdmin && !isOwnClient && !isAssignedDriver) {
        return sendJson(res, 401, { ok: false, error: 'Sessão não autorizada para registrar áudio desta viagem.' });
      }

      const body = await parseBody(req);
      const record = {
        id: String(body.id || `aud-clip-${Date.now()}`),
        rideId: id,
        durationSec: Math.max(0, Number(body.durationSec || 0)),
        mimeType: String(body.mimeType || 'audio/webm').slice(0, 64),
        sizeBytes: Math.max(0, Number(body.sizeBytes || 0)),
        recordedAt: body.recordedAt || new Date().toISOString(),
        reportedBy: driverSession ? 'motorista' : 'passageiro',
        ...(body.notes ? { notes: String(body.notes).slice(0, 280) } : {})
      };

      const curSnap = ride.appliedFareSnapshot && typeof ride.appliedFareSnapshot === 'object'
        ? { ...ride.appliedFareSnapshot }
        : {};
      const prevClips = Array.isArray(curSnap.safetyAudioRecords) ? curSnap.safetyAudioRecords : [];
      const nextClips = [...prevClips, record].slice(-20);
      curSnap.safetyAudioRecords = nextClips;

      await db.query(
        'UPDATE public.rides SET applied_fare_snapshot = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(curSnap), id]
      );

      if (body.escalateToSos) {
        db.query(
          `INSERT INTO public.notifications (id, title, message, type, ride_id, read, timestamp)
           VALUES ($1, $2, $3, 'safety_audio', $4, false, NOW())`,
          [
            `notif-kaudio-${Date.now()}`,
            `🎙️ K-ÁUDIO ENVIADO (${ride.rideCode || id})`,
            `${ride.clientName || 'Passageiro'} anexou gravação de segurança (${record.durationSec}s).`,
            id
          ]
        ).catch(() => {});
      }

      await audit.recordAuditEvent({
        category: 'seguranca',
        actionKey: 'safety_audio_recorded',
        title: `Gravação K-Áudio registrada (${ride.rideCode || id})`,
        summary: `Áudio de segurança (${record.durationSec}s, ${Math.round(record.sizeBytes / 1024)} KB) registrado por ${record.reportedBy}.`,
        severity: body.escalateToSos ? 'critico' : 'info',
        actorRole: driverSession ? 'motorista' : (isAdmin ? 'admin_master' : 'passageiro'),
        actorId: driverSession?.sub || clientSession?.sub || 'admin-master',
        actorName: driverSession ? (ride.driverName || 'Motorista') : (ride.clientName || 'Passageiro'),
        entityType: 'corrida',
        entityId: id,
        entityLabel: ride.rideCode || id,
        relatedIds: { rideId: id }
      }).catch(() => {});

      return sendJson(res, 200, { ok: true, record, safetyAudioRecords: nextClips });
    }

    // ── PERFIL FAMILIAR / SEGURANÇA PARA ADOLESCENTES (12 A 18 ANOS) ───────────────────────────────────────────
    const clientFamilyInviteMatch = pathname.match(/^\/api\/clients\/([^/]+)\/family\/invite$/);
    if (clientFamilyInviteMatch && method === 'POST') {
      await ensureClientsSchema();
      const guardianId = decodeURIComponent(clientFamilyInviteMatch[1]);
      const isAdmin = await isAuthorizedAdmin(req);
      const clientSession = verifyClientToken(req);
      if (!isAdmin && (!clientSession || clientSession.sub !== guardianId)) {
        return sendJson(res, 401, { ok: false, error: 'Sessão inválida para convidar membro do Perfil Familiar.' });
      }

      const guardRes = await db.query('SELECT * FROM public.clients WHERE id = $1 LIMIT 1', [guardianId]);
      const guardianRow = guardRes.rows[0];
      if (!guardianRow) {
        return sendJson(res, 404, { ok: false, error: 'Conta do responsável não encontrada.' });
      }

      const body = await parseBody(req);
      const teenName = String(body.name || body.teenName || '').trim();
      const teenPhone = String(body.phone || body.teenPhone || '').trim();
      const cleanTeenDigits = normalizePhoneDigitsServer(teenPhone);
      const birthParsed = parseBirthDateAndCalculateAge(body.birthDate || body.teenBirthDate);

      if (teenName.length < 2) {
        return sendJson(res, 400, { ok: false, error: 'Informe o nome completo do adolescente.' });
      }
      if (cleanTeenDigits.length < 10) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Informe um número de telefone válido com DDD (ex.: (48) 99612-3456).'
        });
      }
      if (!birthParsed) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Informe uma data de nascimento válida no formato DD/MM/AAAA.'
        });
      }
      if (birthParsed.age < 12 || birthParsed.age > 18) {
        return sendJson(res, 400, {
          ok: false,
          error:
            birthParsed.age < 12
              ? 'Permitido apenas para adolescentes a partir de 12 anos (12 a 18 anos).'
              : 'O Perfil Familiar para adolescentes permite apenas idades entre 12 e 18 anos.'
        });
      }
      if (body.termsAccepted !== true) {
        return sendJson(res, 400, {
          ok: false,
          error: 'O responsável legal precisa aceitar os Termos do Perfil Familiar para enviar o convite.'
        });
      }
      if (normalizePhoneDigitsServer(guardianRow.phone || '') === cleanTeenDigits) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Use o número de celular do adolescente, diferente do número do responsável.'
        });
      }

      // Evita convite duplicado ativo para o mesmo adolescente
      const existingMembersRes = await db.query(
        'SELECT * FROM public.family_members WHERE guardian_id = $1 ORDER BY created_at DESC',
        [guardianId]
      );
      const activeDup = (existingMembersRes.rows || []).find(
        (m) => m.status !== 'revogado' && normalizePhoneDigitsServer(m.teen_phone || '') === cleanTeenDigits
      );
      if (activeDup) {
        return sendJson(res, 409, {
          ok: false,
          error: 'Este telefone já faz parte ou já possui um convite pendente no seu Perfil Familiar.',
          member: activeDup
        });
      }

      const allClientsRes = await db.query('SELECT * FROM public.clients');
      const existingTeenClient = (allClientsRes.rows || []).find(
        (c) => normalizePhoneDigitsServer(c.phone || '') === cleanTeenDigits && !c.blocked
      ) || null;

      const inviteToken = `FAM-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      const cleanHost = String(req.headers.host || 'localhost:5173').trim();
      const protocol = cleanHost.includes('localhost') || cleanHost.startsWith('127.0.0.1') ? 'http' : 'https';
      const invitePath = `/familia/convite/${encodeURIComponent(inviteToken)}`;
      const fullInviteUrl = `${protocol}://${cleanHost}${invitePath}`;
      const nowIso = new Date().toISOString();

      const memberId = `fam-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const apiDispatch = await sendFamilyInviteMessageServer({
        guardianName: guardianRow.name || 'Responsável',
        teenName,
        teenPhone,
        fullInviteUrl,
        inviteToken
      });

      const termsSignature = {
        accepted: true,
        acceptedAt: nowIso,
        guardianId,
        guardianName: guardianRow.name,
        guardianIp: getRequestClientIp(req),
        userAgent: String(req.headers['user-agent'] || '').slice(0, 220),
        version: 'KAVRO-FAMILIA-2026-V1'
      };

      const initialStatus = existingTeenClient ? 'ativo' : 'convite_enviado';
      const insertMemberRes = await db.query(
        `INSERT INTO public.family_members (
          id, guardian_id, guardian_name, guardian_phone, teen_client_id,
          teen_name, teen_phone, teen_birth_date, teen_age, status,
          invite_token, invite_url, terms_accepted, terms_accepted_at,
          terms_signature, api_dispatch, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        RETURNING *`,
        [
          memberId,
          guardianId,
          guardianRow.name,
          guardianRow.phone,
          existingTeenClient ? existingTeenClient.id : null,
          teenName,
          teenPhone,
          birthParsed.brDate,
          birthParsed.age,
          initialStatus,
          inviteToken,
          invitePath,
          true,
          nowIso,
          JSON.stringify(termsSignature),
          JSON.stringify(apiDispatch),
          nowIso,
          nowIso
        ]
      );
      const savedMemberRow = insertMemberRes.rows[0] || {
        id: memberId,
        guardian_id: guardianId,
        guardian_name: guardianRow.name,
        guardian_phone: guardianRow.phone,
        teen_client_id: existingTeenClient ? existingTeenClient.id : null,
        teen_name: teenName,
        teen_phone: teenPhone,
        teen_birth_date: birthParsed.brDate,
        teen_age: birthParsed.age,
        status: initialStatus,
        invite_token: inviteToken,
        invite_url: invitePath,
        terms_accepted: true,
        terms_accepted_at: nowIso,
        api_dispatch: apiDispatch,
        created_at: nowIso
      };

      if (existingTeenClient) {
        await activateTeenAccountLink(savedMemberRow, existingTeenClient);
      }

      // Garante que o responsável também apareça com familySafetyEnabled nos metadados
      const curGuardSafety = normalizeSafetyPreferencesServer(
        guardianRow.safety_preferences || guardianRow.safetyPreferences
      );
      await db.query(
        'UPDATE public.clients SET safety_preferences = $1, emergency_contacts = $2 WHERE id = $3',
        [
          JSON.stringify({ ...curGuardSafety, familySafetyEnabled: true }),
          JSON.stringify(guardianRow.emergency_contacts || []),
          guardianId
        ]
      ).catch(() => {});

      await audit.recordAuditEvent({
        category: 'seguranca',
        actionKey: 'family_invite_sent',
        title: `Convite Perfil Familiar enviado para ${teenName} (${birthParsed.age} anos)`,
        summary: `Responsável ${guardianRow.name} aceitou os termos e gerou link rastreável ${invitePath}. Status: ${initialStatus}.`,
        severity: 'info',
        actorRole: isAdmin ? 'admin_master' : 'passageiro',
        actorId: guardianId,
        actorName: guardianRow.name,
        entityType: 'passageiro',
        entityId: memberId,
        entityLabel: teenName,
        relatedIds: { guardianId, familyMemberId: memberId }
      }).catch(() => {});

      return sendJson(res, 200, {
        ok: true,
        alreadyRegistered: Boolean(existingTeenClient),
        inviteToken,
        inviteUrl: invitePath,
        fullInviteUrl,
        whatsappUrl: apiDispatch.whatsappUrl,
        member: {
          id: savedMemberRow.id,
          guardianId: savedMemberRow.guardian_id,
          guardianName: savedMemberRow.guardian_name,
          guardianPhone: savedMemberRow.guardian_phone,
          teenClientId: savedMemberRow.teen_client_id || null,
          teenName: savedMemberRow.teen_name,
          teenPhone: savedMemberRow.teen_phone,
          teenBirthDate: savedMemberRow.teen_birth_date,
          teenAge: Number(savedMemberRow.teen_age),
          status: savedMemberRow.status,
          inviteToken: savedMemberRow.invite_token,
          inviteUrl: savedMemberRow.invite_url,
          termsAccepted: true,
          termsAcceptedAt: savedMemberRow.terms_accepted_at,
          apiDispatch: savedMemberRow.api_dispatch || apiDispatch,
          activeRide: null,
          recentRides: [],
          totalRidesCount: 0,
          createdAt: savedMemberRow.created_at
        }
      });
    }

    const clientFamilyListMatch = pathname.match(/^\/api\/clients\/([^/]+)\/family$/);
    if (clientFamilyListMatch && method === 'GET') {
      await ensureClientsSchema();
      const guardianId = decodeURIComponent(clientFamilyListMatch[1]);
      const isAdmin = await isAuthorizedAdmin(req);
      const clientSession = verifyClientToken(req);
      if (!isAdmin && (!clientSession || clientSession.sub !== guardianId)) {
        return sendJson(res, 401, { ok: false, error: 'Sessão inválida para visualizar o Perfil Familiar.' });
      }

      const memRes = await db.query(
        'SELECT * FROM public.family_members WHERE guardian_id = $1 ORDER BY created_at DESC',
        [guardianId]
      );
      const rawMembers = (memRes.rows || []).filter((m) => m.status !== 'revogado');
      const allClientsRes = await db.query('SELECT * FROM public.clients');
      const allRidesRes = await db.query('SELECT * FROM public.rides ORDER BY created_at DESC');
      const allRides = (allRidesRes.rows || []).map(formatRideFromDb);
      const activeStatuses = new Set(['aguardando_confirmacao', 'aguardando_pagamento', 'aguardando', 'confirmada', 'a_caminho', 'no_local', 'na_fila', 'em_andamento']);

      const members = rawMembers.map((m) => {
        const teenDigits = normalizePhoneDigitsServer(m.teen_phone || '');
        const matchedClient =
          (m.teen_client_id && (allClientsRes.rows || []).find((c) => c.id === m.teen_client_id)) ||
          (teenDigits.length >= 10 && (allClientsRes.rows || []).find((c) => normalizePhoneDigitsServer(c.phone || '') === teenDigits)) ||
          null;

        const teenClientId = matchedClient?.id || m.teen_client_id || null;
        const effectiveStatus = matchedClient && m.status === 'convite_enviado' ? 'ativo' : m.status;
        const teenRides = allRides.filter((r) => {
          if (teenClientId && r.clientId === teenClientId) return true;
          if (teenDigits.length >= 10 && normalizePhoneDigitsServer(r.clientPhone || '') === teenDigits) return true;
          return false;
        });

        const toSummary = (r) => {
          const tToken = security.signTrackingToken('ride', r.id);
          return {
            id: r.id,
            rideCode: r.rideCode,
            status: r.status,
            originAddress: r.origin?.address || '',
            destinationAddress: r.destination?.address || '',
            totalPrice: Number(r.totalPrice || 0),
            driverName: r.driverName || null,
            driverPlate: r.driverPlate || null,
            driverVehicle: r.driverVehicle || null,
            trackingUrl: `/viagem/${encodeURIComponent(r.id)}?t=${encodeURIComponent(tToken)}`,
            createdAt: r.createdAt
          };
        };

        const activeRideObj = teenRides.find((r) => activeStatuses.has(r.status)) || null;
        return {
          id: m.id,
          guardianId: m.guardian_id,
          guardianName: m.guardian_name,
          guardianPhone: m.guardian_phone,
          teenClientId,
          teenName: matchedClient?.name || m.teen_name,
          teenPhone: m.teen_phone,
          teenBirthDate: m.teen_birth_date,
          teenAge: Number(m.teen_age),
          status: effectiveStatus,
          inviteToken: m.invite_token,
          inviteUrl: m.invite_url,
          termsAccepted: Boolean(m.terms_accepted),
          termsAcceptedAt: m.terms_accepted_at,
          apiDispatch: m.api_dispatch || null,
          activeRide: activeRideObj ? toSummary(activeRideObj) : null,
          recentRides: teenRides.slice(0, 10).map(toSummary),
          totalRidesCount: teenRides.length,
          createdAt: m.created_at,
          updatedAt: m.updated_at
        };
      });

      return sendJson(res, 200, { ok: true, members });
    }

    const clientFamilyMemberDeleteMatch = pathname.match(/^\/api\/clients\/([^/]+)\/family\/([^/]+)$/);
    if (clientFamilyMemberDeleteMatch && method === 'DELETE') {
      await ensureClientsSchema();
      const guardianId = decodeURIComponent(clientFamilyMemberDeleteMatch[1]);
      const memberId = decodeURIComponent(clientFamilyMemberDeleteMatch[2]);
      const isAdmin = await isAuthorizedAdmin(req);
      const clientSession = verifyClientToken(req);
      if (!isAdmin && (!clientSession || clientSession.sub !== guardianId)) {
        return sendJson(res, 401, { ok: false, error: 'Sessão inválida para remover membro familiar.' });
      }

      const memRes = await db.query(
        'SELECT * FROM public.family_members WHERE id = $1 AND guardian_id = $2 LIMIT 1',
        [memberId, guardianId]
      );
      const memRow = memRes.rows[0];
      if (!memRow) {
        return sendJson(res, 404, { ok: false, error: 'Membro do Perfil Familiar não encontrado.' });
      }

      await db.query("UPDATE public.family_members SET status = 'revogado', updated_at = NOW() WHERE id = $1 RETURNING *", [memberId]);
      if (memRow.teen_client_id) {
        await db.query("UPDATE public.clients SET account_type = 'standard', guardian_client_id = NULL WHERE id = $1 RETURNING *", [memRow.teen_client_id]).catch(() => {});
      }

      await audit.recordAuditEvent({
        category: 'seguranca',
        actionKey: 'family_member_revoked',
        title: `Acesso adolescente revogado (${memRow.teen_name})`,
        summary: `Responsável revogou vínculo do Perfil Familiar de ${memRow.teen_name}.`,
        severity: 'atencao',
        actorRole: isAdmin ? 'admin_master' : 'passageiro',
        actorId: guardianId,
        actorName: memRow.guardian_name || 'Responsável',
        entityType: 'passageiro',
        entityId: memberId,
        entityLabel: memRow.teen_name
      }).catch(() => {});

      return sendJson(res, 200, { ok: true, revokedId: memberId });
    }

    const publicFamilyInviteMatch = pathname.match(/^\/api\/family\/invite\/([^/]+)$/);
    if (publicFamilyInviteMatch && method === 'GET') {
      await ensureClientsSchema();
      const token = decodeURIComponent(publicFamilyInviteMatch[1]);
      const invRes = await db.query('SELECT * FROM public.family_members WHERE invite_token = $1 LIMIT 1', [token]);
      const inv = invRes.rows[0];
      if (!inv || inv.status === 'revogado') {
        return sendJson(res, 404, { ok: false, error: 'Convite familiar inválido, expirado ou revogado pelo responsável.' });
      }
      const cleanTeenDigits = normalizePhoneDigitsServer(inv.teen_phone || '');
      const allClientsRes = await db.query('SELECT * FROM public.clients');
      const existingAcc = (allClientsRes.rows || []).find(
        (c) => normalizePhoneDigitsServer(c.phone || '') === cleanTeenDigits && !c.blocked
      );
      return sendJson(res, 200, {
        ok: true,
        invite: {
          id: inv.id,
          guardianName: inv.guardian_name,
          teenName: inv.teen_name,
          teenPhone: inv.teen_phone,
          teenBirthDate: inv.teen_birth_date,
          teenAge: Number(inv.teen_age),
          status: inv.status,
          inviteToken: inv.invite_token,
          accountAlreadyExists: Boolean(existingAcc),
          createdAt: inv.created_at
        }
      });
    }

    const publicFamilyAcceptMatch = pathname.match(/^\/api\/family\/invite\/([^/]+)\/accept$/);
    if (publicFamilyAcceptMatch && method === 'POST') {
      await ensureClientsSchema();
      const token = decodeURIComponent(publicFamilyAcceptMatch[1]);
      const clientSession = verifyClientToken(req);
      if (!clientSession || !clientSession.sub) {
        return sendJson(res, 401, { ok: false, error: 'Faça login ou finalize seu cadastro para aceitar o convite.' });
      }
      const invRes = await db.query('SELECT * FROM public.family_members WHERE invite_token = $1 LIMIT 1', [token]);
      const inv = invRes.rows[0];
      if (!inv || inv.status === 'revogado') {
        return sendJson(res, 404, { ok: false, error: 'Convite familiar inválido ou revogado.' });
      }
      const cliRes = await db.query('SELECT * FROM public.clients WHERE id = $1 LIMIT 1', [clientSession.sub]);
      const cliRow = cliRes.rows[0];
      if (!cliRow) {
        return sendJson(res, 404, { ok: false, error: 'Conta não encontrada.' });
      }
      const updatedCli = await activateTeenAccountLink(inv, cliRow);
      return sendJson(res, 200, {
        ok: true,
        client: sanitizeClientRow(updatedCli, false),
        status: 'ativo'
      });
    }

    const adminVehicleReviewMatch = pathname.match(/^\/api\/admin\/drivers\/([^/]+)\/vehicles\/([^/]+)\/review$/);
    if (adminVehicleReviewMatch && (method === 'POST' || method === 'PATCH')) {
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { ok: false, error: 'Acesso restrito ao Administrador Master.' });
      }
      const driverId = decodeURIComponent(adminVehicleReviewMatch[1]);
      const vehicleId = decodeURIComponent(adminVehicleReviewMatch[2]);
      const driver = await finance.getDriverById(driverId);
      if (!driver) return sendJson(res, 404, { ok: false, error: 'Motorista não encontrado.' });

      const body = await parseBody(req);
      const decision = String(body.decision || '').trim().toLowerCase();
      if (decision !== 'aprovar' && decision !== 'recusar') {
        return sendJson(res, 400, { ok: false, error: 'Decisão inválida. Envie "aprovar" ou "recusar".' });
      }
      const rejectionReason = String(body.rejectionReason || '').trim();
      const reviewedBy = String(body.reviewedBy || body.adminName || 'Equipe Compliance Master').trim();
      const checklist = body.checklist && typeof body.checklist === 'object' ? body.checklist : null;
      const cf = body.correctedFields && typeof body.correctedFields === 'object' ? body.correctedFields : null;
      const now = new Date().toISOString();

      const currentVehicles = Array.isArray(driver.vehicles) ? [...driver.vehicles] : [];
      const targetIdx = currentVehicles.findIndex(v => v.id === vehicleId);
      if (targetIdx < 0) return sendJson(res, 404, { ok: false, error: 'Veículo não encontrado.' });

      const targetVeh = currentVehicles[targetIdx];
      const nextPlate = cf?.plate ? String(cf.plate).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7) : targetVeh.plate;
      const nextBrand = cf?.brand ? String(cf.brand).trim() : targetVeh.brand;
      const nextModel = cf?.model ? String(cf.model).trim() : targetVeh.model;
      const nextVersion = cf?.version !== undefined ? String(cf.version).trim() : (targetVeh.version || '');
      const nextColor = cf?.color ? String(cf.color).trim() : targetVeh.color;
      const nextYear = cf?.year ? String(cf.year).replace(/\D/g, '').slice(0, 4) : targetVeh.year;
      const nextCrlvNumber = cf?.crlvNumber !== undefined ? String(cf.crlvNumber).trim() : (targetVeh.crlvNumber || '');

      const prevVehAudit = Array.isArray(targetVeh.auditLogs) ? targetVeh.auditLogs : [];
      const vehAuditEntry = {
        id: `vaud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: now,
        action: decision === 'aprovar' ? 'approved' : 'rejected',
        performedBy: reviewedBy,
        notes: decision === 'aprovar'
          ? `CRLV e veículo aprovados (${nextBrand} ${nextModel} • ${nextPlate})`
          : `CRLV recusado: ${rejectionReason || 'CRLV ou dados do veículo não aprovados pela Central Master.'}`,
        ip: req.socket?.remoteAddress || '127.0.0.1',
        userAgent: String(req.headers['user-agent'] || 'Admin Console')
      };

      currentVehicles[targetIdx] = {
        ...targetVeh,
        brand: nextBrand,
        model: nextModel,
        version: nextVersion,
        color: nextColor,
        year: nextYear,
        plate: nextPlate,
        crlvNumber: nextCrlvNumber,
        crlvRegular: decision === 'aprovar',
        approvalStatus: decision === 'aprovar' ? 'aprovado' : 'rejeitado',
        rejectionReason: decision === 'recusar'
          ? (rejectionReason || 'CRLV ou dados do veículo não aprovados pela Central Master.')
          : undefined,
        reviewedAt: now,
        reviewedBy,
        ...(checklist ? { checklist } : {}),
        auditLogs: [vehAuditEntry, ...prevVehAudit]
      };

      const hasActiveApproved = currentVehicles.some(v => v.isActive && v.approvalStatus === 'aprovado');
      let nextActiveId = driver.activeVehicleId;
      let extraRootFields = {};
      if (decision === 'aprovar' && (!hasActiveApproved || currentVehicles[targetIdx].isActive)) {
        currentVehicles[targetIdx].isActive = true;
        nextActiveId = currentVehicles[targetIdx].id;
        const topCat = Array.isArray(currentVehicles[targetIdx].eligibleCategories) && currentVehicles[targetIdx].eligibleCategories.length > 0
          ? currentVehicles[targetIdx].eligibleCategories[currentVehicles[targetIdx].eligibleCategories.length - 1]
          : (driver.vehicleCategory || 'kavro_go');
        extraRootFields = {
          vehicleBrand: currentVehicles[targetIdx].brand,
          vehicleModel: currentVehicles[targetIdx].model,
          vehicleVersion: currentVehicles[targetIdx].version || '',
          vehicleColor: currentVehicles[targetIdx].color,
          vehicleYear: currentVehicles[targetIdx].year,
          vehiclePlate: currentVehicles[targetIdx].plate,
          vehiclePhoto: currentVehicles[targetIdx].vehiclePhoto || '',
          crlvNumber: currentVehicles[targetIdx].crlvNumber || '',
          crlvRegular: true,
          vehicleCategory: topCat
        };
      }

      const updated = await finance.saveDriverRecord({
        ...driver,
        ...extraRootFields,
        activeVehicleId: nextActiveId,
        vehicles: currentVehicles
      });
      invalidateDriversCache();

      await audit.recordAuditEvent({
        ...getAdminActorContext(req),
        category: 'motoristas_kyc',
        actionKey: decision === 'aprovar' ? 'vehicle_crlv_approved' : 'vehicle_crlv_rejected',
        title: decision === 'aprovar'
          ? `CRLV e veículo aprovados (${nextPlate})`
          : `CRLV e veículo recusados (${nextPlate})`,
        summary: vehAuditEntry.notes,
        severity: decision === 'recusar' ? 'atencao' : 'info',
        entityType: 'veiculo',
        entityId: vehicleId,
        entityLabel: `${nextBrand} ${nextModel} • ${nextPlate}`,
        relatedIds: { driverId: updated.id, vehicleId, plate: nextPlate, vehicleAuditId: vehAuditEntry.id },
        changes: [
          {
            field: 'approvalStatus',
            label: 'Situação do Veículo/CRLV',
            before: String(targetVeh.approvalStatus || 'pendente_aprovacao'),
            after: decision === 'aprovar' ? 'aprovado' : 'rejeitado',
            summary: `${targetVeh.approvalStatus || 'pendente_aprovacao'} -> ${decision === 'aprovar' ? 'aprovado' : 'rejeitado'}`
          }
        ]
      });

      realtimeHub.publish('driver:updated', { driverId: updated.id, driver: security.sanitizeDriverForSse(updated) });
      return sendJson(res, 200, { ok: true, driver: updated, vehicle: currentVehicles[targetIdx] });
    }

    const adminPcrMatch = pathname.match(/^\/api\/admin\/profile-change-requests\/(driver|client)\/([^/]+)$/);
    if (adminPcrMatch && (method === 'PATCH' || method === 'POST')) {
      await ensureClientsSchema();
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { ok: false, error: 'Acesso restrito ao Administrador Master.' });
      }
      const role = adminPcrMatch[1];
      const targetId = decodeURIComponent(adminPcrMatch[2]);
      const body = await parseBody(req);
      const decision = String(body.decision || '').trim().toLowerCase();
      if (decision !== 'aprovar' && decision !== 'recusar') {
        return sendJson(res, 400, { ok: false, error: 'Decisão inválida. Envie "aprovar" ou "recusar".' });
      }
      const rejectionReason = String(body.rejectionReason || '').trim();
      const now = new Date().toISOString();

      if (role === 'driver') {
        const driver = await finance.getDriverById(targetId);
        if (!driver) return sendJson(res, 404, { ok: false, error: 'Motorista não encontrado.' });
        const pendingReq = driver.profileChangeRequest;
        if (!pendingReq || pendingReq.status !== 'pendente') {
          return sendJson(res, 400, { ok: false, error: 'Não há solicitação pendente para este motorista.' });
        }
        if (decision === 'aprovar') {
          const rf = pendingReq.requestedFields || {};
          const updatedReq = {
            ...pendingReq,
            status: 'aprovado',
            reviewedAt: now,
            reviewedBy: 'Administrador Master',
            rejectionReason: undefined
          };
          const updated = await finance.saveDriverRecord({
            ...driver,
            name: rf.name || driver.name,
            phone: rf.phone || driver.phone,
            email: rf.email !== undefined ? rf.email : driver.email,
            city: rf.city !== undefined ? rf.city : driver.city,
            profileChangeRequest: updatedReq
          });
          return sendJson(res, 200, { ok: true, driver: updated });
        } else {
          const updatedReq = {
            ...pendingReq,
            status: 'recusado',
            reviewedAt: now,
            reviewedBy: 'Administrador Master',
            rejectionReason: rejectionReason || 'Alteração cadastral não autorizada pela Central Master.'
          };
          const updated = await finance.saveDriverRecord({
            ...driver,
            profileChangeRequest: updatedReq
          });
          return sendJson(res, 200, { ok: true, driver: updated });
        }
      } else {
        const currentRes = await db.query('SELECT * FROM public.clients WHERE id = $1 LIMIT 1', [targetId]);
        const currentRow = currentRes.rows[0];
        if (!currentRow) return sendJson(res, 404, { ok: false, error: 'Passageiro não encontrado.' });
        const pendingReq = currentRow.profile_change_request || currentRow.profileChangeRequest;
        if (!pendingReq || pendingReq.status !== 'pendente') {
          return sendJson(res, 400, { ok: false, error: 'Não há solicitação pendente para este passageiro.' });
        }
        if (decision === 'aprovar') {
          const rf = pendingReq.requestedFields || {};
          const nextName = rf.name || currentRow.name;
          const nextPhone = rf.phone || currentRow.phone;
          const nextEmail = rf.email !== undefined ? (rf.email || null) : currentRow.email;
          const nextDoc = rf.document !== undefined ? (rf.document || null) : currentRow.document;

          const cleanNextPhone = String(nextPhone || '').replace(/\D/g, '');
          const cleanNextEmail = String(nextEmail || '').trim().toLowerCase();
          if (cleanNextPhone.length >= 10 || cleanNextEmail) {
            const dupRes = await db.query(
              `SELECT id FROM public.clients
               WHERE regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $1
                  OR ($2 <> '' AND LOWER(COALESCE(email, '')) = $2)
               LIMIT 1`,
              [cleanNextPhone || '__none__', cleanNextEmail]
            );
            const dup = dupRes.rows[0];
            if (dup && dup.id !== currentRow.id) {
              return sendJson(res, 409, { ok: false, error: 'O telefone ou e-mail solicitado já pertence a outra conta.' });
            }
          }

          const updatedReq = {
            ...pendingReq,
            status: 'aprovado',
            reviewedAt: now,
            reviewedBy: 'Administrador Master',
            rejectionReason: undefined
          };
          const updated = await db.query(
            `UPDATE public.clients SET name = $1, phone = $2, email = $3, document = $4, profile_change_request = $5 WHERE id = $6 RETURNING *`,
            [nextName, nextPhone, nextEmail, nextDoc, JSON.stringify(updatedReq), targetId]
          );
          return sendJson(res, 200, { ok: true, client: sanitizeClientRow(updated.rows[0], true) });
        } else {
          const updatedReq = {
            ...pendingReq,
            status: 'recusado',
            reviewedAt: now,
            reviewedBy: 'Administrador Master',
            rejectionReason: rejectionReason || 'Alteração cadastral não autorizada pela Central Master.'
          };
          const updated = await db.query(
            `UPDATE public.clients SET profile_change_request = $1 WHERE id = $2 RETURNING *`,
            [JSON.stringify(updatedReq), targetId]
          );
          return sendJson(res, 200, { ok: true, client: sanitizeClientRow(updated.rows[0], true) });
        }
      }
    }

    const cliMatch = pathname.match(/^\/api\/clients\/([^/]+)$/);
    if (cliMatch && method === 'GET') {
      await ensureClientsSchema();
      const id = decodeURIComponent(cliMatch[1]);
      const isAdmin = await isAuthorizedAdmin(req);
      const clientSession = verifyClientToken(req);
      if (!isAdmin && (!clientSession || clientSession.sub !== id)) {
        return sendJson(res, 401, { ok: false, error: 'Sessão de passageiro inválida.' });
      }
      const r = await db.query('SELECT * FROM public.clients WHERE id = $1 LIMIT 1', [id]);
      if (!r.rows[0]) {
        return sendJson(res, 404, { ok: false, error: 'Passageiro não encontrado.' });
      }
      return sendJson(res, 200, { ok: true, client: sanitizeClientRow(r.rows[0], isAdmin) });
    }
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
        if (!await isAuthorizedAdmin(req)) {
          return sendJson(res, 401, { error: 'Acesso não autorizado.' });
        }
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
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { error: 'Acesso não autorizado.' });
      }
      await db.query('UPDATE public.notifications SET read = true WHERE read = false');
      return sendJson(res, 200, { ok: true });
    }

    const notifMatch = pathname.match(/^\/api\/notifications\/([^/]+)$/);
    if (notifMatch && method === 'DELETE') {
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { error: 'Acesso não autorizado.' });
      }
      const id = decodeURIComponent(notifMatch[1]);
      await db.query('DELETE FROM public.notifications WHERE id = $1', [id]);
      return sendJson(res, 200, { ok: true, deleted: id });
    }

    const notifReadMatch = pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
    if (notifReadMatch && method === 'PATCH') {
      if (!await isAuthorizedAdmin(req)) {
        return sendJson(res, 401, { error: 'Acesso não autorizado.' });
      }
      const id = decodeURIComponent(notifReadMatch[1]);
      const body = await parseBody(req);
      const isRead = body.read !== undefined ? Boolean(body.read) : true;
      await db.query('UPDATE public.notifications SET read = $1 WHERE id = $2', [isRead, id]);
      return sendJson(res, 200, { ok: true, id, read: isRead });
    }

    // 8. LGPD / PRIVACIDADE — EXCLUSÃO E ANONIMIZAÇÃO DE CONTA PELO TITULAR
    if (pathname === '/api/privacy/delete-account' && method === 'POST') {
      await ensureClientsSchema();
      const body = await parseBody(req);
      const clientSession = verifyClientToken(req);
      const driverSession = verifyDriverToken(req);
      const requestedRole = String(body.role || '').trim().toLowerCase();

      const useDriver = driverSession && (requestedRole === 'driver' || !clientSession);
      const useClient = !useDriver && clientSession;

      if (!useDriver && !useClient) {
        return sendJson(res, 401, { ok: false, error: 'Faça login na sua conta para solicitar a exclusão de dados (LGPD).' });
      }

      if (useDriver) {
        const driverId = driverSession.sub;
        const activeRideRes = await db.query(
          `SELECT id FROM public.rides WHERE driver_id = $1 AND status NOT IN ('finalizada', 'cancelada') LIMIT 1`,
          [driverId]
        );
        if (activeRideRes.rows[0]) {
          return sendJson(res, 409, { ok: false, error: 'Finalize ou cancele sua corrida em andamento antes de excluir a conta.' });
        }
        const anonTag = `anon_${Date.now()}`;
        await db.query(
          `UPDATE public.drivers
           SET name = 'Motorista Removido (LGPD)',
               phone = $1,
               email = NULL,
               document = NULL,
               password_hash = NULL,
               photo = NULL,
               status = 'offline',
               approval_status = 'bloqueado',
               bank_data = '{}'::jsonb,
               kyc_data = NULL,
               vehicles = '[]'::jsonb
           WHERE id = $2`,
          [anonTag, driverId]
        );
        await audit.recordAuditEvent({
          category: 'motoristas_kyc',
          actionKey: 'lgpd_driver_anonymized',
          title: 'Exclusão / anonimização de conta solicitada pelo motorista (LGPD)',
          description: `O motorista titular (${driverId}) solicitou anonimização e bloqueio permanente da conta via Art. 18 LGPD.`,
          actorType: 'motorista',
          actorId: driverId,
          actorName: 'Titular (LGPD)',
          entityType: 'motorista',
          entityId: driverId,
          entityLabel: driverId
        });
        return sendJson(res, 200, { ok: true, anonymized: true, role: 'driver', id: driverId });
      }

      const clientId = clientSession.sub;
      const activeClientRideRes = await db.query(
        `SELECT id FROM public.rides WHERE client_id = $1 AND status NOT IN ('finalizada', 'cancelada') LIMIT 1`,
        [clientId]
      );
      if (activeClientRideRes.rows[0]) {
        return sendJson(res, 409, { ok: false, error: 'Conclua ou cancele sua viagem ativa antes de solicitar a exclusão da conta.' });
      }
      const anonClientPhone = `anon_${Date.now()}`;
      await db.query(
        `UPDATE public.clients
         SET name = 'Passageiro Removido (LGPD)',
             phone = $1,
             email = NULL,
             document = NULL,
             password_hash = NULL,
             photo = NULL,
             blocked = true,
             saved_addresses = '[]'::jsonb,
             saved_cards = '[]'::jsonb,
             notes = 'Conta anonimizada pelo titular (LGPD Art. 18)'
         WHERE id = $2`,
        [anonClientPhone, clientId]
      );
      await audit.recordAuditEvent({
        category: 'sistema',
        actionKey: 'lgpd_client_anonymized',
        title: 'Exclusão / anonimização de conta solicitada pelo passageiro (LGPD)',
        description: `O passageiro titular (${clientId}) solicitou anonimização e exclusão dos dados pessoais via Art. 18 LGPD.`,
        actorType: 'passageiro',
        actorId: clientId,
        actorName: 'Titular (LGPD)',
        entityType: 'passageiro',
        entityId: clientId,
        entityLabel: clientId
      });
      return sendJson(res, 200, { ok: true, anonymized: true, role: 'client', id: clientId });
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
