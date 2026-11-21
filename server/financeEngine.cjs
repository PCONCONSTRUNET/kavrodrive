const crypto = require('crypto');
const db = require('./db.cjs');
const env = require('./env.cjs');
const efiBankGateway = require('./efiBankGateway.cjs');

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

const DEFAULT_WITHDRAWAL_WEEKDAYS = [5]; // Toda Sexta-feira
const WITHDRAWAL_WEEKDAY_LABELS_PT = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado'
];
const WITHDRAWAL_TZ_TO_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

function getBrazilWeekdayIndex(date = new Date()) {
  try {
    const short = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'short'
    }).format(date);
    if (Object.prototype.hasOwnProperty.call(WITHDRAWAL_TZ_TO_INDEX, short)) {
      return WITHDRAWAL_TZ_TO_INDEX[short];
    }
  } catch {
    // fallback local
  }
  return date.getDay();
}

function normalizeWithdrawalWeekdays(raw) {
  if (!Array.isArray(raw)) return [...DEFAULT_WITHDRAWAL_WEEKDAYS];
  const valid = raw
    .map(n => Number(n))
    .filter(n => Number.isInteger(n) && n >= 0 && n <= 6);
  return Array.from(new Set(valid)).sort((a, b) => a - b);
}

function formatWithdrawalWeekdaysPt(weekdays = DEFAULT_WITHDRAWAL_WEEKDAYS) {
  const clean = normalizeWithdrawalWeekdays(weekdays);
  if (clean.length === 0) return 'Nenhum dia configurado';
  if (clean.length === 7) return 'Todos os dias';
  if (clean.length === 1 && clean[0] === 5) return 'Somente Sexta-feira';
  const names = clean.map(d => WITHDRAWAL_WEEKDAY_LABELS_PT[d] || String(d));
  return names.length === 1 ? `Somente ${names[0]}` : names.join(', ');
}

function evaluateWithdrawalAvailability(cfg = {}, now = new Date()) {
  const enabled = cfg?.driverWithdrawalEnabled !== false;
  const allowedWeekdays = normalizeWithdrawalWeekdays(cfg?.driverWithdrawalWeekdays);
  const currentWeekday = getBrazilWeekdayIndex(now);
  const isFridayOnly = allowedWeekdays.length === 1 && allowedWeekdays[0] === 5;
  const isAllowedToday = allowedWeekdays.includes(currentWeekday);
  const canRequestNow = enabled && isAllowedToday;
  const daysText = formatWithdrawalWeekdaysPt(allowedWeekdays);

  let blockedReason = '';
  if (!enabled) {
    blockedReason = 'As solicitações de saque PIX estão temporariamente desabilitadas pela administração.';
  } else if (allowedWeekdays.length === 0) {
    blockedReason = 'Nenhum dia da semana está liberado para solicitação de saque no momento.';
  } else if (!isAllowedToday) {
    blockedReason = isFridayOnly
      ? 'Saques liberados somente às Sextas-feiras (toda Sexta-feira é dia de fazer saque).'
      : `Saques liberados apenas nos dias configurados: ${daysText}.`;
  }

  return {
    enabled,
    allowedWeekdays,
    currentWeekday,
    isAllowedToday,
    canRequestNow,
    daysText,
    blockedReason
  };
}

const MIN_CLIENT_WALLET_TOPUP_BRL = 20;
const CARD_MAX_INSTALLMENTS = 1;

/**
 * Garante que pagamentos por cartão sejam processados apenas à vista (1x, sem parcelamento).
 */
function validateCardOnlySingleInstallment(payload = {}) {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.installments ?? payload.parcelas;
  if (raw === undefined || raw === null || raw === '') return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed !== CARD_MAX_INSTALLMENTS) {
    return 'Pagamento no cartão é aceito somente à vista (1x, sem parcelamento).';
  }
  return null;
}

// ============================================================
// Gerador EMV BR Code PIX (Backend Oficial)
// ============================================================
function formatEmvField(id, value) {
  const str = String(value || '');
  const len = str.length.toString().padStart(2, '0');
  return id + len + str;
}

function crc16Ccitt(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function generateDynamicPixPayload({ key, beneficiaryName, city, amount, txid }) {
  const cleanKey = String(key || 'contato@kavrodrive.com.br').trim();
  const cleanName = String(beneficiaryName || 'KAVRO DRIVE')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .slice(0, 25)
    .trim();
  const cleanCity = String(city || 'BRASIL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .slice(0, 15)
    .trim();
  const formattedAmount = amount && Number(amount) > 0 ? Number(amount).toFixed(2) : '';
  const cleanTxid = String(txid || 'KAVRO').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || 'KAVRO';

  const merchantAccount =
    formatEmvField('00', 'br.gov.bcb.pix') +
    formatEmvField('01', cleanKey);

  const payloadWithoutCrc =
    formatEmvField('00', '01') +
    formatEmvField('26', merchantAccount) +
    formatEmvField('52', '0000') +
    formatEmvField('53', '986') +
    (formattedAmount ? formatEmvField('54', formattedAmount) : '') +
    formatEmvField('58', 'BR') +
    formatEmvField('59', cleanName) +
    formatEmvField('60', cleanCity) +
    formatEmvField('62', formatEmvField('05', cleanTxid)) +
    '6304';

  return payloadWithoutCrc + crc16Ccitt(payloadWithoutCrc);
}

function getQrCodeUrl(payload, size = 260) {
  if (!payload) return '';
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(payload)}&margin=10`;
}

// ============================================================
// Cálculos de Split & Comissão (Exclusivo no Backend)
// ============================================================
function calculateSplit(grossAmount, commissionPercent = 20, commissionFixed = 0) {
  const gross = Math.max(0, round2(grossAmount));
  const pct = Math.min(100, Math.max(0, Number(commissionPercent ?? 20)));
  const fixed = Math.max(0, round2(Number(commissionFixed ?? 0) || 0));
  const rawCommission = round2((gross * (pct / 100)) + (gross > 0 ? fixed : 0));
  const commissionAmount = round2(Math.min(gross, rawCommission));
  const driverNetAmount = round2(Math.max(0, gross - commissionAmount));
  return {
    grossAmount: gross,
    commissionPercent: pct,
    commissionFixed: fixed,
    commissionAmount,
    driverNetAmount
  };
}

function resolveCommissionFixedForRide(cfg = {}, ride = null) {
  const raw =
    ride?.commissionFixed ??
    ride?.commission_fixed ??
    ride?.appliedFareSnapshot?.commissionFixed ??
    ride?.applied_fare_snapshot?.commissionFixed ??
    cfg?.platformCommissionFixed ??
    0;
  return Math.max(0, round2(Number(raw) || 0));
}

// Resolve a taxa/comissão oficial considerando hierarquia: Categoria (se override ativo) > Meio de Pagamento (PIX, Cartão, Dinheiro) > Global
function resolveCommissionPercentForRide(cfg = {}, categoryObj = null, paymentMethod = 'pix') {
  if (cfg?.useCategoryCommissionOverride && categoryObj && categoryObj.commissionPercent !== undefined && categoryObj.commissionPercent !== null && categoryObj.commissionPercent !== '') {
    const catPct = Number(categoryObj.commissionPercent);
    if (!Number.isNaN(catPct)) {
      return Math.min(100, Math.max(0, round2(catPct)));
    }
  }
  const perMethodMap = cfg?.paymentMethodCommissionPercents || {};
  const methodKey =
    paymentMethod === 'online'
      ? 'cartao_credito'
      : paymentMethod === 'apple_pay' && (perMethodMap.apple_pay === undefined || perMethodMap.apple_pay === null || perMethodMap.apple_pay === '')
        ? 'cartao_credito'
        : String(paymentMethod || 'pix');
  const rawMethodPct = perMethodMap[methodKey];
  if (rawMethodPct !== undefined && rawMethodPct !== null && rawMethodPct !== '') {
    const parsed = Number(rawMethodPct);
    if (!Number.isNaN(parsed)) {
      return Math.min(100, Math.max(0, round2(parsed)));
    }
  }
  const basePct = Number(cfg?.platformCommissionPercent ?? 20);
  return Math.min(100, Math.max(0, Number.isNaN(basePct) ? 20 : round2(basePct)));
}

// ============================================================
// Helpers de Acesso Unificado (PostgreSQL ou LocalStore)
// ============================================================
let extendedSchemaReady = false;
async function ensureExtendedSchema() {
  if (!db.pool || extendedSchemaReady) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.drivers (
        id VARCHAR(64) PRIMARY KEY,
        name TEXT NOT NULL,
        phone VARCHAR(32) NOT NULL,
        email TEXT,
        document VARCHAR(32) NOT NULL,
        cnh VARCHAR(32) NOT NULL,
        password_hash TEXT NOT NULL,
        photo TEXT,
        vehicle_brand TEXT NOT NULL,
        vehicle_model TEXT NOT NULL,
        vehicle_color TEXT NOT NULL,
        vehicle_year VARCHAR(10) NOT NULL,
        vehicle_plate VARCHAR(20) NOT NULL,
        vehicle_category VARCHAR(50) DEFAULT 'standard',
        vehicle_photo TEXT,
        city TEXT,
        bio TEXT,
        pix_key TEXT,
        pix_type VARCHAR(30) DEFAULT 'cpf',
        bank_name TEXT,
        bank_agency VARCHAR(30),
        bank_account VARCHAR(40),
        auto_payout_weekly BOOLEAN DEFAULT TRUE,
        approval_status VARCHAR(40) DEFAULT 'pendente_aprovacao',
        financial_blocked BOOLEAN DEFAULT FALSE,
        financial_block_reason TEXT,
        is_online BOOLEAN DEFAULT FALSE,
        current_ride_id VARCHAR(50),
        queued_ride_id VARCHAR(50),
        location JSONB,
        rating NUMERIC DEFAULT 5.0,
        total_rides INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS public.financial_ledger (
        id VARCHAR(64) PRIMARY KEY,
        idempotency_key VARCHAR(140) UNIQUE NOT NULL,
        driver_id VARCHAR(64) NOT NULL,
        driver_name TEXT,
        ride_id VARCHAR(50),
        ride_code VARCHAR(30),
        client_id VARCHAR(64),
        client_name TEXT,
        entry_type VARCHAR(50) NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        gross_amount NUMERIC NOT NULL DEFAULT 0,
        commission_percent NUMERIC NOT NULL DEFAULT 0,
        commission_amount NUMERIC NOT NULL DEFAULT 0,
        driver_net_amount NUMERIC NOT NULL DEFAULT 0,
        balance_delta NUMERIC NOT NULL DEFAULT 0,
        balance_bucket VARCHAR(30) DEFAULT 'available',
        status VARCHAR(40) DEFAULT 'confirmado',
        description TEXT NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS public.payment_transactions (
        id VARCHAR(64) PRIMARY KEY,
        ride_id VARCHAR(50) NOT NULL,
        ride_code VARCHAR(30),
        driver_id VARCHAR(64),
        driver_name TEXT,
        client_id VARCHAR(64),
        client_name TEXT,
        method VARCHAR(40) NOT NULL,
        status VARCHAR(40) NOT NULL DEFAULT 'aguardando',
        estimated_amount NUMERIC NOT NULL DEFAULT 0,
        final_amount NUMERIC NOT NULL DEFAULT 0,
        paid_amount NUMERIC NOT NULL DEFAULT 0,
        refunded_amount NUMERIC NOT NULL DEFAULT 0,
        commission_percent NUMERIC NOT NULL DEFAULT 20,
        commission_amount NUMERIC NOT NULL DEFAULT 0,
        driver_net_amount NUMERIC NOT NULL DEFAULT 0,
        pix_qr_code TEXT,
        pix_copy_paste TEXT,
        pix_expires_at TIMESTAMPTZ,
        card_id VARCHAR(64),
        card_last4 VARCHAR(10),
        card_brand VARCHAR(30),
        gateway_auth_code VARCHAR(64),
        gateway_tx_id VARCHAR(100) UNIQUE NOT NULL,
        dispute_reason TEXT,
        failure_reason TEXT,
        webhook_events JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS public.saved_cards (
        id VARCHAR(64) PRIMARY KEY,
        client_id VARCHAR(64),
        client_phone VARCHAR(32),
        brand VARCHAR(30) NOT NULL,
        last4 VARCHAR(4) NOT NULL,
        holder_name TEXT NOT NULL,
        exp_month VARCHAR(2) NOT NULL,
        exp_year VARCHAR(4) NOT NULL,
        card_type VARCHAR(30) DEFAULT 'cartao_credito',
        gateway_token TEXT NOT NULL,
        is_default BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
        id VARCHAR(64) PRIMARY KEY,
        driver_id VARCHAR(64) NOT NULL,
        driver_name TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        pix_key TEXT NOT NULL,
        pix_type VARCHAR(30) DEFAULT 'cpf',
        status VARCHAR(30) DEFAULT 'solicitado',
        ledger_entry_id VARCHAR(64),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        processed_at TIMESTAMPTZ
      );
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS driver_id VARCHAR(64);
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS driver_name TEXT;
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS driver_phone TEXT;
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS driver_photo TEXT;
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS driver_vehicle TEXT;
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS driver_plate VARCHAR(20);
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS driver_car_color TEXT;
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS driver_rating NUMERIC DEFAULT 5.0;
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS passenger_rating NUMERIC;
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS passenger_notes TEXT;
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS is_queued_ride BOOLEAN DEFAULT FALSE;
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS queued_for_driver_id VARCHAR(64);
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS declined_driver_ids JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS estimated_price NUMERIC DEFAULT 0;
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS commission_percent NUMERIC DEFAULT 20;
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS commission_fixed NUMERIC DEFAULT 0;
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS commission_amount NUMERIC DEFAULT 0;
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS driver_net_amount NUMERIC DEFAULT 0;
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS payment_tx_id VARCHAR(64);
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS pix_qr_code TEXT;
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS pix_copy_paste TEXT;
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS card_id VARCHAR(64);
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS card_last4 VARCHAR(10);
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS card_brand VARCHAR(30);
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS category_name TEXT;
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS applied_fare_snapshot JSONB;
      ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE public.withdrawal_requests ADD COLUMN IF NOT EXISTS payout_provider_tx_id TEXT;
      ALTER TABLE public.withdrawal_requests ADD COLUMN IF NOT EXISTS payout_status TEXT;
      ALTER TABLE public.withdrawal_requests ADD COLUMN IF NOT EXISTS payout_provider TEXT;
      ALTER TABLE public.withdrawal_requests ADD COLUMN IF NOT EXISTS fee_amount NUMERIC DEFAULT 0;
      ALTER TABLE public.withdrawal_requests ADD COLUMN IF NOT EXISTS net_payout_amount NUMERIC DEFAULT 0;
      ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS rating NUMERIC;
      ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC DEFAULT 0;
      ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS client_rated_stars NUMERIC;
      CREATE TABLE IF NOT EXISTS public.client_wallet_entries (
        id VARCHAR(64) PRIMARY KEY,
        idempotency_key VARCHAR(160) UNIQUE NOT NULL,
        client_id VARCHAR(64) NOT NULL,
        client_phone VARCHAR(32),
        client_name TEXT,
        entry_type VARCHAR(40) NOT NULL,
        payment_method VARCHAR(40) DEFAULT 'pix',
        amount NUMERIC NOT NULL DEFAULT 0,
        balance_delta NUMERIC NOT NULL DEFAULT 0,
        status VARCHAR(32) NOT NULL DEFAULT 'confirmado',
        ride_id VARCHAR(50),
        ride_code VARCHAR(30),
        gateway_tx_id VARCHAR(120),
        pix_qr_code TEXT,
        pix_copy_paste TEXT,
        pix_expires_at TIMESTAMPTZ,
        description TEXT NOT NULL,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_client_wallet_entries_client ON public.client_wallet_entries (client_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS public.ride_chat_messages (
        id VARCHAR(64) PRIMARY KEY,
        ride_id VARCHAR(50) NOT NULL,
        sender_role VARCHAR(20) NOT NULL,
        sender_name TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_ride_chat_messages_ride_id ON public.ride_chat_messages (ride_id, created_at);
      CREATE TABLE IF NOT EXISTS public.password_reset_codes (
        id VARCHAR(64) PRIMARY KEY,
        role VARCHAR(20) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        identifier TEXT NOT NULL,
        code_hash VARCHAR(128) NOT NULL,
        attempts INTEGER DEFAULT 0,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS public.sos_alerts (
        id VARCHAR(64) PRIMARY KEY,
        name TEXT,
        phone VARCHAR(40),
        lat NUMERIC,
        lng NUMERIC,
        accuracy NUMERIC DEFAULT 0,
        heading NUMERIC DEFAULT 0,
        speed_kmh NUMERIC DEFAULT 0,
        address TEXT,
        ride_id VARCHAR(50),
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE public.sos_alerts ADD COLUMN IF NOT EXISTS role VARCHAR(30) DEFAULT 'passageiro';
      ALTER TABLE public.sos_alerts ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'ativo';
      ALTER TABLE public.sos_alerts ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE public.sos_alerts ADD COLUMN IF NOT EXISTS driver_id VARCHAR(64);
      ALTER TABLE public.sos_alerts ADD COLUMN IF NOT EXISTS driver_name TEXT;
      ALTER TABLE public.sos_alerts ADD COLUMN IF NOT EXISTS driver_phone TEXT;
      ALTER TABLE public.sos_alerts ADD COLUMN IF NOT EXISTS driver_vehicle TEXT;
      ALTER TABLE public.sos_alerts ADD COLUMN IF NOT EXISTS driver_plate VARCHAR(20);
      ALTER TABLE public.sos_alerts ADD COLUMN IF NOT EXISTS ride_code VARCHAR(30);
      CREATE INDEX IF NOT EXISTS idx_rides_status_driver ON public.rides (status, driver_id);
      CREATE INDEX IF NOT EXISTS idx_rides_client_id ON public.rides (client_id);
      CREATE INDEX IF NOT EXISTS idx_financial_ledger_driver_created ON public.financial_ledger (driver_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sos_alerts_active_updated ON public.sos_alerts (active, updated_at DESC);
    `);
    extendedSchemaReady = true;
  } catch (err) {
    console.warn('[ensureExtendedSchema]', err.message);
  }
}

async function getSystemConfig() {
  await ensureExtendedSchema();
  if (!db.pool) {
    return db.localStore.system_config?.default?.config || {};
  }
  const r = await db.query('SELECT config FROM public.system_config WHERE id = $1', ['default']);
  return r.rows[0]?.config || {};
}

const DEFAULT_RIDE_CATEGORIES_SERVER = [
  {
    id: 'kavro_go',
    code: 'PADRAO',
    name: 'Padrão',
    subtitle: 'Viagem de passageiros',
    description: 'Transporte padrão de passageiros em veículos 4 portas com ar-condicionado e documentação regular.',
    categoryType: 'padrao',
    active: true,
    sortOrder: 1,
    multiplier: 1.0,
    baseFare: 8.0,
    pricePerKm: 3.2,
    pricePerMinute: 0.5,
    minimumFare: 15.0,
    commissionPercent: 20,
    maxPassengers: 4,
    minVehicleYear: 2015,
    minDriverRating: 4.5,
    minCompletedRides: 0,
    requireFourDoors: true,
    requireAirConditioning: true,
    requireRegularDoc: true,
    requireEar: true,
    requireLargeTrunk: false,
    requireLeatherSeats: false,
    allowedModels: [],
    allowedCities: [],
    cityOverrides: []
  },
  {
    id: 'kavro_entregas',
    code: 'ENTREGAS',
    name: 'Entregas',
    subtitle: 'Produtos e encomendas',
    description: 'Envie ou receba produtos, pacotes, compras e documentos direto até o endereço informado.',
    categoryType: 'entregas',
    active: true,
    sortOrder: 2,
    multiplier: 0.95,
    baseFare: 7.5,
    pricePerKm: 3.0,
    pricePerMinute: 0.45,
    minimumFare: 14.0,
    commissionPercent: 20,
    maxPassengers: 0,
    minVehicleYear: 2012,
    minDriverRating: 4.5,
    minCompletedRides: 0,
    requireFourDoors: false,
    requireAirConditioning: false,
    requireRegularDoc: true,
    requireEar: true,
    requireLargeTrunk: false,
    requireLeatherSeats: false,
    allowedModels: [],
    allowedCities: [],
    cityOverrides: []
  }
];

const DEPRECATED_LEGACY_TIER_IDS_SERVER = new Set([
  'kavro_plus', 'kavro_exec', 'comfort', 'plus', 'aeroporto', 'exec', 'executivo', 'bagagem'
]);

function mapLegacyCategoryIdServer(catId) {
  const raw = String(catId || '').trim().toLowerCase();
  if (
    !raw ||
    raw === 'standard' ||
    raw === 'upx' ||
    raw === 'go' ||
    raw === 'padrao' ||
    raw === 'padrão' ||
    raw === 'comfort' ||
    raw === 'plus' ||
    raw === 'kavro_plus' ||
    raw === 'aeroporto' ||
    raw === 'exec' ||
    raw === 'executivo' ||
    raw === 'bagagem' ||
    raw === 'kavro_exec'
  ) {
    return 'kavro_go';
  }
  if (
    raw === 'entregas' ||
    raw === 'entrega' ||
    raw === 'envios' ||
    raw === 'envio' ||
    raw === 'flash' ||
    raw === 'delivery' ||
    raw === 'kavro_flash' ||
    raw === 'kavro_entregas'
  ) {
    return 'kavro_entregas';
  }
  return raw;
}

function resolveCategoryTypeServer(categoryOrId) {
  if (typeof categoryOrId === 'string') {
    const mapped = mapLegacyCategoryIdServer(categoryOrId);
    if (
      mapped === 'kavro_entregas' ||
      /entrega|envio|flash|delivery|pacote|encomenda/.test(String(categoryOrId).toLowerCase())
    ) {
      return 'entregas';
    }
    return 'padrao';
  }
  if (!categoryOrId || typeof categoryOrId !== 'object') return 'padrao';
  if (categoryOrId.categoryType === 'entregas' || categoryOrId.categoryType === 'padrao') {
    return categoryOrId.categoryType;
  }
  const text = `${categoryOrId.id || ''} ${categoryOrId.code || ''} ${categoryOrId.name || ''}`.toLowerCase();
  if (
    mapLegacyCategoryIdServer(categoryOrId.id) === 'kavro_entregas' ||
    /entrega|envio|flash|delivery|pacote|encomenda/.test(text)
  ) {
    return 'entregas';
  }
  return 'padrao';
}

function normalizeCategoriesServer(cfg) {
  const rawList = Array.isArray(cfg?.rideCategories) && cfg.rideCategories.length > 0
    ? cfg.rideCategories
    : Array.isArray(cfg?.serviceCategories) && cfg.serviceCategories.length > 0
      ? cfg.serviceCategories
      : [];

  const hasKavro = rawList.some(c =>
    c.id === 'kavro_go' || c.id === 'kavro_plus' || c.id === 'kavro_exec' || c.id === 'kavro_entregas' ||
    String(c.name || '').toUpperCase().includes('KAVRO GO') ||
    String(c.name || '').toUpperCase() === 'PADRÃO'
  );

  if (rawList.length === 0 || !hasKavro) {
    return DEFAULT_RIDE_CATEGORIES_SERVER;
  }

  const filteredList = rawList.filter(item => !DEPRECATED_LEGACY_TIER_IDS_SERVER.has(String(item?.id || '').trim().toLowerCase()));
  const seenIds = new Set();
  const mappedList = [];

  for (let idx = 0; idx < filteredList.length; idx++) {
    const item = filteredList[idx];
    const mappedId = mapLegacyCategoryIdServer(item.id);
    if (seenIds.has(mappedId)) continue;
    seenIds.add(mappedId);

    const def = DEFAULT_RIDE_CATEGORIES_SERVER.find(d => d.id === mappedId) || DEFAULT_RIDE_CATEGORIES_SERVER[0];
    const rawName = String(item.name || '').trim();
    const isLegacyDefaultName =
      (mappedId === 'kavro_go' && (!rawName || rawName.toUpperCase() === 'KAVRO GO')) ||
      (mappedId === 'kavro_entregas' && (!rawName || rawName.toUpperCase() === 'KAVRO ENTREGAS'));

    mappedList.push({
      ...def,
      ...item,
      id: mappedId === 'kavro_go' || mappedId === 'kavro_entregas' ? mappedId : (item.id || def.id),
      code: isLegacyDefaultName ? def.code : (item.code || def.code),
      name: isLegacyDefaultName ? def.name : rawName,
      subtitle: isLegacyDefaultName ? def.subtitle : (item.subtitle ?? def.subtitle),
      categoryType: item.categoryType === 'entregas' || item.categoryType === 'padrao'
        ? item.categoryType
        : resolveCategoryTypeServer(item),
      active: item.active !== false,
      sortOrder: Number(item.sortOrder ?? idx + 1),
      multiplier: Number(item.multiplier ?? def.multiplier ?? 1),
      baseFare: Number(item.baseFare ?? def.baseFare),
      pricePerKm: Number(item.pricePerKm ?? def.pricePerKm),
      pricePerMinute: Number(item.pricePerMinute ?? def.pricePerMinute),
      minimumFare: Number(item.minimumFare ?? def.minimumFare),
      commissionPercent: Number(item.commissionPercent ?? cfg?.platformCommissionPercent ?? def.commissionPercent ?? 20),
      minVehicleYear: Number(item.minVehicleYear ?? def.minVehicleYear ?? 2015),
      minDriverRating: Number(item.minDriverRating ?? def.minDriverRating ?? 4.5),
      minCompletedRides: Number(item.minCompletedRides ?? def.minCompletedRides ?? 0),
      allowedModels: Array.isArray(item.allowedModels) ? item.allowedModels : def.allowedModels,
      allowedCities: Array.isArray(item.allowedCities) ? item.allowedCities : def.allowedCities
    });
  }

  if (!mappedList.some(c => c.id === 'kavro_go' || resolveCategoryTypeServer(c) === 'padrao')) {
    const padraoDef = DEFAULT_RIDE_CATEGORIES_SERVER[0];
    mappedList.unshift({
      ...padraoDef,
      commissionPercent: Number(cfg?.platformCommissionPercent ?? padraoDef.commissionPercent ?? 20)
    });
  }

  if (!mappedList.some(c => c.id === 'kavro_entregas' || resolveCategoryTypeServer(c) === 'entregas')) {
    const entregasDef = DEFAULT_RIDE_CATEGORIES_SERVER.find(d => d.id === 'kavro_entregas');
    if (entregasDef) {
      mappedList.push({
        ...entregasDef,
        sortOrder: mappedList.length + 1,
        commissionPercent: Number(cfg?.platformCommissionPercent ?? entregasDef.commissionPercent ?? 20)
      });
    }
  }

  return mappedList;
}

function matchesAllowedModelServer(brand, model, version, allowedModels) {
  if (!Array.isArray(allowedModels) || allowedModels.length === 0) return true;
  const full = `${brand || ''} ${model || ''} ${version || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  if (!full) return false;
  return allowedModels.some(m => {
    const clean = String(m || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    return clean.length > 0 && full.includes(clean);
  });
}

function computeDriverCategoriesServer(driver, categories) {
  const cats = Array.isArray(categories) && categories.length > 0 ? categories : DEFAULT_RIDE_CATEGORIES_SERVER;
  const approvedExceptions = Array.isArray(driver.approvedCategoryExceptions) ? driver.approvedCategoryExceptions : [];
  const blockedIds = Array.isArray(driver.blockedCategoryIds) ? driver.blockedCategoryIds : [];
  const yearNum = parseInt(String(driver.vehicleYear || '2024').replace(/\D/g, ''), 10) || 2024;
  const rating = Number(driver.rating ?? 5.0);
  const totalRides = Number(driver.totalRides ?? 0);

  const eligible = [];
  for (const cat of cats) {
    if (!cat.active) continue;
    if (blockedIds.includes(cat.id)) continue;
    if (approvedExceptions.includes(cat.id)) {
      eligible.push(cat.id);
      continue;
    }

    if (yearNum < Number(cat.minVehicleYear || 2014)) continue;
    if (rating < Number(cat.minDriverRating || 0)) continue;
    if (Number(cat.minCompletedRides || 0) > 0 && totalRides < Number(cat.minCompletedRides || 0)) continue;
    if (cat.requireFourDoors && driver.hasFourDoors === false) continue;
    if (cat.requireAirConditioning && driver.hasAirConditioning === false) continue;
    if (cat.requireRegularDoc && driver.crlvRegular === false) continue;
    if (cat.requireEar && driver.cnhHasEar === false) continue;

    const modelOk = matchesAllowedModelServer(
      driver.vehicleBrand,
      driver.vehicleModel,
      driver.vehicleVersion,
      cat.allowedModels
    );
    if (!modelOk) continue;

    if (cat.requireLargeTrunk && driver.hasLargeTrunk === false) continue;
    if (cat.requireLeatherSeats && driver.hasLeatherSeats === false) continue;

    eligible.push(cat.id);
  }

  // Garante que pelo menos kavro_go esteja elegível caso cumpram requisitos básicos ou fallback
  if (eligible.length === 0 && !blockedIds.includes('kavro_go')) {
    eligible.push('kavro_go');
  }

  const rawEnabled = Array.isArray(driver.enabledCategories) && driver.enabledCategories.length > 0
    ? driver.enabledCategories.map(mapLegacyCategoryIdServer)
    : null;
  const rawDisabled = Array.isArray(driver.disabledCategoryIds)
    ? driver.disabledCategoryIds.map(mapLegacyCategoryIdServer)
    : null;

  let enabled;
  if (rawDisabled) {
    enabled = eligible.filter(id => !rawDisabled.includes(id));
  } else if (rawEnabled) {
    enabled = eligible.filter(id =>
      rawEnabled.includes(id) ||
      (resolveCategoryTypeServer(id) === 'entregas' && rawEnabled.includes('kavro_go'))
    );
  } else {
    enabled = [...eligible];
  }
  if (enabled.length === 0) enabled = [...eligible];

  return { eligibleCategories: eligible, enabledCategories: enabled };
}

function validateAndNormalizeDriverPixKeys(rawKeys, driverCtx = {}, options = {}) {
  const strict = Boolean(options.strict);
  const ownerDocDigits = String(driverCtx.document || '').replace(/\D/g, '');
  const ownerName = String(driverCtx.name || '').trim();
  const validTypes = new Set(['cpf', 'cnpj', 'telefone', 'email', 'aleatoria']);

  if (!Array.isArray(rawKeys)) {
    const legacyKey = String(driverCtx.pixKey || '').trim();
    if (!legacyKey) return [];
    const legacyType = validTypes.has(String(driverCtx.pixType || '').toLowerCase())
      ? String(driverCtx.pixType).toLowerCase()
      : 'cpf';
    return [{
      id: 'pix-primary',
      pixType: legacyType,
      pixKey: legacyKey,
      bankName: String(driverCtx.bankName || '').trim(),
      holderName: ownerName,
      holderDocument: ownerDocDigits,
      sameOwnershipConfirmed: true,
      isDefault: true,
      createdAt: driverCtx.createdAt || new Date().toISOString()
    }];
  }

  if (strict && rawKeys.length > 5) {
    throw new Error('Limite máximo de 5 chaves PIX por motorista.');
  }

  const seen = new Set();
  const normalizedList = [];
  for (let i = 0; i < rawKeys.length && i < 5; i += 1) {
    const item = rawKeys[i] || {};
    const pixTypeRaw = String(item.pixType || 'cpf').toLowerCase().trim();
    const pixType = validTypes.has(pixTypeRaw) ? pixTypeRaw : 'cpf';
    const pixKey = String(item.pixKey || '').trim();
    const bankName = String(item.bankName || '').trim();

    if (!pixKey) {
      if (strict) throw new Error('Informe a chave PIX antes de salvar.');
      continue;
    }
    if (strict && pixType === 'cpf') {
      const keyDigits = pixKey.replace(/\D/g, '');
      if (ownerDocDigits && keyDigits !== ownerDocDigits) {
        throw new Error('Chave PIX do tipo CPF deve ser idêntica ao CPF do motorista titular (mesma titularidade).');
      }
    }
    const itemHolderDoc = String(item.holderDocument || '').replace(/\D/g, '');
    if (strict && itemHolderDoc && ownerDocDigits && itemHolderDoc !== ownerDocDigits) {
      throw new Error('Todas as chaves PIX precisam pertencer à mesma titularidade (mesmo CPF cadastrado).');
    }
    if (strict && item.sameOwnershipConfirmed !== true) {
      throw new Error('Confirme a declaração de mesma titularidade para todas as chaves PIX.');
    }

    const dedupeKey = `${pixType}:${pixKey.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      if (strict) throw new Error('Esta chave PIX já está cadastrada na sua carteira.');
      continue;
    }
    seen.add(dedupeKey);

    normalizedList.push({
      id: String(item.id || `pix-${Date.now()}-${i}`),
      pixType,
      pixKey,
      bankName,
      holderName: ownerName || String(item.holderName || '').trim(),
      holderDocument: ownerDocDigits || itemHolderDoc,
      sameOwnershipConfirmed: true,
      isDefault: Boolean(item.isDefault),
      createdAt: item.createdAt || new Date().toISOString()
    });
  }

  if (normalizedList.length > 0 && !normalizedList.some(k => k.isDefault)) {
    normalizedList[0].isDefault = true;
  } else if (normalizedList.length > 0) {
    let defaultAssigned = false;
    for (const k of normalizedList) {
      if (k.isDefault && !defaultAssigned) {
        defaultAssigned = true;
      } else {
        k.isDefault = false;
      }
    }
  }

  return normalizedList;
}

function normalizeDriverVehicles(rawVehicles, driverCtx = {}, categoriesConfig = null) {
  const cats = categoriesConfig || normalizeCategoriesServer();
  const driverApproved = String(driverCtx.approvalStatus || driverCtx.approval_status || '').toLowerCase() === 'aprovado';

  if (!Array.isArray(rawVehicles) || rawVehicles.length === 0) {
    const legacyPlate = String(driverCtx.vehiclePlate ?? driverCtx.vehicle_plate ?? '').toUpperCase().trim();
    const legacyBrand = String(driverCtx.vehicleBrand ?? driverCtx.vehicle_brand ?? '').trim();
    const legacyModel = String(driverCtx.vehicleModel ?? driverCtx.vehicle_model ?? '').trim();
    if (!legacyPlate && !legacyBrand && !legacyModel) return [];

    const evalRes = computeDriverCategoriesServer({
      cnhHasEar: driverCtx.cnhHasEar ?? true,
      vehicleBrand: legacyBrand,
      vehicleModel: legacyModel,
      vehicleVersion: driverCtx.vehicleVersion || '',
      vehicleYear: String(driverCtx.vehicleYear ?? driverCtx.vehicle_year ?? '2024'),
      crlvRegular: driverCtx.crlvRegular !== false,
      hasFourDoors: driverCtx.hasFourDoors !== false,
      hasAirConditioning: driverCtx.hasAirConditioning !== false,
      hasLargeTrunk: Boolean(driverCtx.hasLargeTrunk),
      hasLeatherSeats: Boolean(driverCtx.hasLeatherSeats),
      rating: Number(driverCtx.rating || 5.0),
      totalRides: Number(driverCtx.totalRides ?? driverCtx.total_rides ?? 0)
    }, cats);

    return [{
      id: driverCtx.activeVehicleId || 'veh-primary',
      brand: legacyBrand,
      model: legacyModel,
      version: String(driverCtx.vehicleVersion || '').trim(),
      color: String(driverCtx.vehicleColor ?? driverCtx.vehicle_color ?? 'Prata').trim(),
      year: String(driverCtx.vehicleYear ?? driverCtx.vehicle_year ?? '2024').trim(),
      plate: legacyPlate,
      vehiclePhoto: String(driverCtx.vehiclePhoto ?? driverCtx.vehicle_photo ?? '').trim(),
      crlvNumber: String(driverCtx.crlvNumber || '').trim(),
      crlvDocumentPhoto: String(driverCtx.crlvDocumentPhoto || '').trim(),
      crlvRegular: driverCtx.crlvRegular !== false,
      hasFourDoors: driverCtx.hasFourDoors !== false,
      hasAirConditioning: driverCtx.hasAirConditioning !== false,
      hasLargeTrunk: Boolean(driverCtx.hasLargeTrunk),
      hasLeatherSeats: Boolean(driverCtx.hasLeatherSeats),
      eligibleCategories: evalRes.eligibleCategories,
      enabledCategories: evalRes.enabledCategories,
      approvalStatus: driverApproved ? 'aprovado' : 'pendente_aprovacao',
      isActive: true,
      submittedAt: driverCtx.createdAt || driverCtx.created_at || new Date().toISOString()
    }];
  }

  const list = rawVehicles.map((v, idx) => {
    const evalRes = computeDriverCategoriesServer({
      cnhHasEar: driverCtx.cnhHasEar ?? true,
      vehicleBrand: v.brand || '',
      vehicleModel: v.model || '',
      vehicleVersion: v.version || '',
      vehicleYear: String(v.year || '2024'),
      crlvRegular: v.crlvRegular !== false,
      hasFourDoors: v.hasFourDoors !== false,
      hasAirConditioning: v.hasAirConditioning !== false,
      hasLargeTrunk: Boolean(v.hasLargeTrunk),
      hasLeatherSeats: Boolean(v.hasLeatherSeats),
      rating: Number(driverCtx.rating || 5.0),
      totalRides: Number(driverCtx.totalRides ?? driverCtx.total_rides ?? 0)
    }, cats);

    return {
      id: String(v.id || `veh-${Date.now()}-${idx}`),
      brand: String(v.brand || '').trim(),
      model: String(v.model || '').trim(),
      version: String(v.version || '').trim(),
      color: String(v.color || 'Prata').trim(),
      year: String(v.year || '2024').trim(),
      plate: String(v.plate || '').toUpperCase().trim(),
      vehiclePhoto: String(v.vehiclePhoto || '').trim(),
      crlvNumber: String(v.crlvNumber || '').trim(),
      crlvDocumentPhoto: String(v.crlvDocumentPhoto || '').trim(),
      crlvRegular: v.crlvRegular !== false,
      hasFourDoors: v.hasFourDoors !== false,
      hasAirConditioning: v.hasAirConditioning !== false,
      hasLargeTrunk: Boolean(v.hasLargeTrunk),
      hasLeatherSeats: Boolean(v.hasLeatherSeats),
      eligibleCategories: evalRes.eligibleCategories,
      enabledCategories: Array.isArray(v.enabledCategories) && v.enabledCategories.length > 0
        ? v.enabledCategories
        : evalRes.enabledCategories,
      approvalStatus: ['aprovado', 'rejeitado', 'pendente_aprovacao'].includes(v.approvalStatus)
        ? v.approvalStatus
        : 'pendente_aprovacao',
      rejectionReason: v.rejectionReason || undefined,
      isActive: Boolean(v.isActive),
      submittedAt: v.submittedAt || new Date().toISOString(),
      reviewedAt: v.reviewedAt || undefined,
      reviewedBy: v.reviewedBy || undefined
    };
  });

  if (list.length > 0) {
    const activeId = driverCtx.activeVehicleId;
    let activeAssigned = false;
    for (const v of list) {
      const shouldBeActive = activeId ? v.id === activeId : v.isActive;
      if (shouldBeActive && v.approvalStatus === 'aprovado' && !activeAssigned) {
        v.isActive = true;
        activeAssigned = true;
      } else {
        v.isActive = false;
      }
    }
    if (!activeAssigned) {
      const firstApproved = list.find(v => v.approvalStatus === 'aprovado') || list[0];
      firstApproved.isActive = true;
    }
  }

  return list;
}

function formatDriverRow(row, categoriesConfig) {
  if (!row) return null;
  const meta = (row.metadata && typeof row.metadata === 'object') ? row.metadata : {};
  const base = {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email || '',
    document: row.document || '',
    cnh: row.cnh || '',
    cnhHasEar: row.cnhHasEar ?? meta.cnhHasEar ?? true,
    photo: row.photo || '',
    vehicleBrand: row.vehicle_brand || row.vehicleBrand || '',
    vehicleModel: row.vehicle_model || row.vehicleModel || '',
    vehicleVersion: row.vehicleVersion ?? meta.vehicleVersion ?? '',
    vehicleColor: row.vehicle_color || row.vehicleColor || '',
    vehicleYear: row.vehicle_year || row.vehicleYear || '',
    vehiclePlate: row.vehicle_plate || row.vehiclePlate || '',
    vehicleCategory: mapLegacyCategoryIdServer(row.vehicle_category || row.vehicleCategory || 'kavro_go'),
    vehiclePhoto: row.vehicle_photo || row.vehiclePhoto || '',
    crlvNumber: row.crlvNumber ?? meta.crlvNumber ?? '',
    crlvRegular: row.crlvRegular ?? meta.crlvRegular ?? true,
    hasFourDoors: row.hasFourDoors ?? meta.hasFourDoors ?? true,
    hasAirConditioning: row.hasAirConditioning ?? meta.hasAirConditioning ?? true,
    hasLargeTrunk: row.hasLargeTrunk ?? meta.hasLargeTrunk,
    hasLeatherSeats: row.hasLeatherSeats ?? meta.hasLeatherSeats,
    approvedCategoryExceptions: Array.isArray(row.approvedCategoryExceptions)
      ? row.approvedCategoryExceptions
      : Array.isArray(meta.approvedCategoryExceptions)
        ? meta.approvedCategoryExceptions
        : [],
    blockedCategoryIds: Array.isArray(row.blockedCategoryIds)
      ? row.blockedCategoryIds
      : Array.isArray(meta.blockedCategoryIds)
        ? meta.blockedCategoryIds
        : [],
    pendingCategoryRequests: Array.isArray(row.pendingCategoryRequests)
      ? row.pendingCategoryRequests
      : Array.isArray(meta.pendingCategoryRequests)
        ? meta.pendingCategoryRequests
        : [],
    enabledCategories: Array.isArray(row.enabledCategories)
      ? row.enabledCategories
      : Array.isArray(meta.enabledCategories)
        ? meta.enabledCategories
        : undefined,
    disabledCategoryIds: Array.isArray(row.disabledCategoryIds)
      ? row.disabledCategoryIds
      : Array.isArray(meta.disabledCategoryIds)
        ? meta.disabledCategoryIds
        : undefined,
    city: row.city || '',
    bio: row.bio || '',
    pixKey: row.pix_key || row.pixKey || '',
    pixType: row.pix_type || row.pixType || 'cpf',
    pixKeys: validateAndNormalizeDriverPixKeys(
      Array.isArray(row.pixKeys) ? row.pixKeys : (Array.isArray(meta.pixKeys) ? meta.pixKeys : undefined),
      {
        name: row.name,
        document: row.document,
        pixKey: row.pix_key || row.pixKey || '',
        pixType: row.pix_type || row.pixType || 'cpf',
        bankName: row.bank_name || row.bankName || '',
        createdAt: row.created_at || row.createdAt
      },
      { strict: false }
    ),
    bankName: row.bank_name || row.bankName || '',
    bankAgency: row.bank_agency || row.bankAgency || '',
    bankAccount: row.bank_account || row.bankAccount || '',
    efiAccountId: String(row.efi_account_id || row.efiAccountId || meta.efiAccountId || '').trim(),
    autoPayoutWeekly: row.auto_payout_weekly !== false,
    cnhDocumentPhoto: row.cnhDocumentPhoto || meta.cnhDocumentPhoto || '',
    selfiePhoto: row.selfiePhoto || meta.selfiePhoto || '',
    kyc: row.kyc || meta.kyc || null,
    termsSignature: row.termsSignature || meta.termsSignature || null,
    approvalStatus: row.approval_status || row.approvalStatus || 'pendente_aprovacao',
    financialBlocked: Boolean(row.financial_blocked || row.financialBlocked),
    financialBlockReason: row.financial_block_reason || row.financialBlockReason || '',
    isOnline: Boolean(row.is_online ?? row.isOnline),
    currentRideId: row.current_ride_id ?? row.currentRideId ?? null,
    queuedRideId: row.queued_ride_id ?? row.queuedRideId ?? null,
    location: row.location || null,
    rating: Number(row.rating || 5.0),
    totalRides: Number(row.total_rides ?? row.totalRides ?? 0),
    vehicles: normalizeDriverVehicles(
      Array.isArray(row.vehicles) ? row.vehicles : (Array.isArray(meta.vehicles) ? meta.vehicles : undefined),
      {
        approval_status: row.approval_status || row.approvalStatus,
        cnhHasEar: row.cnhHasEar ?? meta.cnhHasEar ?? true,
        vehicleBrand: row.vehicle_brand || row.vehicleBrand || '',
        vehicleModel: row.vehicle_model || row.vehicleModel || '',
        vehicleVersion: row.vehicleVersion ?? meta.vehicleVersion ?? '',
        vehicleColor: row.vehicle_color || row.vehicleColor || '',
        vehicleYear: row.vehicle_year || row.vehicleYear || '',
        vehiclePlate: row.vehicle_plate || row.vehiclePlate || '',
        vehiclePhoto: row.vehicle_photo || row.vehiclePhoto || '',
        crlvNumber: row.crlvNumber ?? meta.crlvNumber ?? '',
        crlvDocumentPhoto: row.crlvDocumentPhoto ?? meta.crlvDocumentPhoto ?? '',
        crlvRegular: row.crlvRegular ?? meta.crlvRegular ?? true,
        hasFourDoors: row.hasFourDoors ?? meta.hasFourDoors ?? true,
        hasAirConditioning: row.hasAirConditioning ?? meta.hasAirConditioning ?? true,
        hasLargeTrunk: row.hasLargeTrunk ?? meta.hasLargeTrunk,
        hasLeatherSeats: row.hasLeatherSeats ?? meta.hasLeatherSeats,
        activeVehicleId: row.activeVehicleId || meta.activeVehicleId || '',
        rating: Number(row.rating || 5.0),
        totalRides: Number(row.total_rides ?? row.totalRides ?? 0),
        createdAt: row.created_at || row.createdAt
      },
      categoriesConfig
    ),
    activeVehicleId: row.activeVehicleId || meta.activeVehicleId || undefined,
    profileChangeRequest: row.profileChangeRequest || meta.profileChangeRequest || null,
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString()
  };

  const { eligibleCategories, enabledCategories } = computeDriverCategoriesServer(base, categoriesConfig);
  base.eligibleCategories = eligibleCategories;
  base.enabledCategories = enabledCategories;
  return base;
}

function formatLedgerRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    idempotencyKey: row.idempotency_key || row.idempotencyKey,
    driverId: row.driver_id || row.driverId,
    driverName: row.driver_name || row.driverName || '',
    rideId: row.ride_id || row.rideId || null,
    rideCode: row.ride_code || row.rideCode || null,
    clientId: row.client_id || row.clientId || null,
    clientName: row.client_name || row.clientName || null,
    entryType: row.entry_type || row.entryType,
    paymentMethod: row.payment_method || row.paymentMethod,
    grossAmount: round2(row.gross_amount ?? row.grossAmount ?? 0),
    commissionPercent: round2(row.commission_percent ?? row.commissionPercent ?? 0),
    commissionAmount: round2(row.commission_amount ?? row.commissionAmount ?? 0),
    driverNetAmount: round2(row.driver_net_amount ?? row.driverNetAmount ?? 0),
    balanceDelta: round2(row.balance_delta ?? row.balanceDelta ?? 0),
    balanceBucket: row.balance_bucket || row.balanceBucket || 'available',
    status: row.status || 'confirmado',
    description: row.description || '',
    metadata: row.metadata || {},
    createdAt: row.created_at || row.createdAt || new Date().toISOString()
  };
}

function normalizeOptionalTimestamp(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallback : value.toISOString();
  }
  const raw = String(value).trim();
  if (!raw) return fallback;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function formatPaymentTxRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    rideId: row.ride_id || row.rideId,
    rideCode: row.ride_code || row.rideCode || '',
    driverId: row.driver_id || row.driverId || null,
    driverName: row.driver_name || row.driverName || null,
    clientId: row.client_id || row.clientId || null,
    clientName: row.client_name || row.clientName || null,
    method: row.method,
    status: row.status,
    estimatedAmount: round2(row.estimated_amount ?? row.estimatedAmount ?? 0),
    finalAmount: round2(row.final_amount ?? row.finalAmount ?? 0),
    paidAmount: round2(row.paid_amount ?? row.paidAmount ?? 0),
    refundedAmount: round2(row.refunded_amount ?? row.refundedAmount ?? 0),
    commissionPercent: round2(row.commission_percent ?? row.commissionPercent ?? 20),
    commissionAmount: round2(row.commission_amount ?? row.commissionAmount ?? 0),
    driverNetAmount: round2(row.driver_net_amount ?? row.driverNetAmount ?? 0),
    pixQrCode: row.pix_qr_code || row.pixQrCode || '',
    pixCopyPaste: row.pix_copy_paste || row.pixCopyPaste || '',
    pixExpiresAt: normalizeOptionalTimestamp(row.pix_expires_at ?? row.pixExpiresAt, null),
    cardId: row.card_id || row.cardId || '',
    cardLast4: row.card_last4 || row.cardLast4 || '',
    cardBrand: row.card_brand || row.cardBrand || '',
    gatewayAuthCode: row.gateway_auth_code || row.gatewayAuthCode || '',
    gatewayTxId: row.gateway_tx_id || row.gatewayTxId || '',
    disputeReason: row.dispute_reason || row.disputeReason || '',
    failureReason: row.failure_reason || row.failureReason || '',
    createdAt: normalizeOptionalTimestamp(row.created_at ?? row.createdAt, new Date().toISOString()),
    updatedAt: normalizeOptionalTimestamp(row.updated_at ?? row.updatedAt, new Date().toISOString())
  };
}

// ============================================================
// Operações de Motoristas (1.000+ Motoristas)
// ============================================================
async function listDrivers() {
  await ensureExtendedSchema();
  const cfg = await getSystemConfig();
  const cats = normalizeCategoriesServer(cfg);
  if (!db.pool) {
    return (db.localStore.drivers || []).map(row => formatDriverRow(row, cats));
  }
  const r = await db.query('SELECT * FROM public.drivers ORDER BY created_at DESC');
  return r.rows.map(row => formatDriverRow(row, cats));
}

async function getDriverById(driverId) {
  if (!driverId) return null;
  await ensureExtendedSchema();
  const cfg = await getSystemConfig();
  const cats = normalizeCategoriesServer(cfg);
  if (!db.pool) {
    const found = (db.localStore.drivers || []).find(d => d.id === driverId);
    return found ? formatDriverRow(found, cats) : null;
  }
  const r = await db.query('SELECT * FROM public.drivers WHERE id = $1 LIMIT 1', [driverId]);
  return r.rows[0] ? formatDriverRow(r.rows[0], cats) : null;
}

async function findDriverByIdentifier(identifier) {
  await ensureExtendedSchema();
  const raw = String(identifier || '').trim();
  const digits = raw.replace(/\D/g, '');
  const email = raw.toLowerCase();

  if (!db.pool) {
    const found = (db.localStore.drivers || []).find(d => {
      const dPhone = String(d.phone || '').replace(/\D/g, '');
      const dDoc = String(d.document || '').replace(/\D/g, '');
      const dEmail = String(d.email || '').toLowerCase();
      return (
        d.id === raw ||
        (email && dEmail === email) ||
        (digits.length >= 8 && (dPhone === digits || dDoc === digits))
      );
    });
    return found || null;
  }

  const r = await db.query(
    `SELECT * FROM public.drivers
     WHERE id = $1
        OR ($2 <> '' AND LOWER(COALESCE(email, '')) = $2)
        OR ($3 <> '' AND (regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $3 OR regexp_replace(COALESCE(document, ''), '\\D', '', 'g') = $3))
     LIMIT 1`,
    [raw, email, digits]
  );
  return r.rows[0] || null;
}

async function saveDriverRecord(driverRow) {
  await ensureExtendedSchema();
  const now = new Date().toISOString();
  const cfg = await getSystemConfig();
  const cats = normalizeCategoriesServer(cfg);

  const prevMeta = (driverRow.metadata && typeof driverRow.metadata === 'object') ? driverRow.metadata : {};
  const metadata = {
    ...prevMeta,
    cnhHasEar: driverRow.cnhHasEar !== undefined ? Boolean(driverRow.cnhHasEar) : (prevMeta.cnhHasEar ?? true),
    vehicleVersion: driverRow.vehicleVersion ?? prevMeta.vehicleVersion ?? '',
    crlvNumber: driverRow.crlvNumber ?? prevMeta.crlvNumber ?? '',
    crlvRegular: driverRow.crlvRegular !== undefined ? Boolean(driverRow.crlvRegular) : (prevMeta.crlvRegular ?? true),
    cnhDocumentPhoto: driverRow.cnhDocumentPhoto !== undefined ? driverRow.cnhDocumentPhoto : prevMeta.cnhDocumentPhoto,
    selfiePhoto: driverRow.selfiePhoto !== undefined ? driverRow.selfiePhoto : prevMeta.selfiePhoto,
    kyc: driverRow.kyc !== undefined ? driverRow.kyc : prevMeta.kyc,
    termsSignature: driverRow.termsSignature !== undefined ? driverRow.termsSignature : prevMeta.termsSignature,
    hasFourDoors: driverRow.hasFourDoors !== undefined ? Boolean(driverRow.hasFourDoors) : (prevMeta.hasFourDoors ?? true),
    hasAirConditioning: driverRow.hasAirConditioning !== undefined ? Boolean(driverRow.hasAirConditioning) : (prevMeta.hasAirConditioning ?? true),
    hasLargeTrunk: driverRow.hasLargeTrunk !== undefined ? Boolean(driverRow.hasLargeTrunk) : prevMeta.hasLargeTrunk,
    hasLeatherSeats: driverRow.hasLeatherSeats !== undefined ? Boolean(driverRow.hasLeatherSeats) : prevMeta.hasLeatherSeats,
    approvedCategoryExceptions: Array.isArray(driverRow.approvedCategoryExceptions)
      ? driverRow.approvedCategoryExceptions
      : (Array.isArray(prevMeta.approvedCategoryExceptions) ? prevMeta.approvedCategoryExceptions : []),
    blockedCategoryIds: Array.isArray(driverRow.blockedCategoryIds)
      ? driverRow.blockedCategoryIds
      : (Array.isArray(prevMeta.blockedCategoryIds) ? prevMeta.blockedCategoryIds : []),
    pendingCategoryRequests: Array.isArray(driverRow.pendingCategoryRequests)
      ? driverRow.pendingCategoryRequests
      : (Array.isArray(prevMeta.pendingCategoryRequests) ? prevMeta.pendingCategoryRequests : []),
    enabledCategories: Array.isArray(driverRow.enabledCategories)
      ? driverRow.enabledCategories
      : (Array.isArray(prevMeta.enabledCategories) ? prevMeta.enabledCategories : undefined),
    disabledCategoryIds: Array.isArray(driverRow.disabledCategoryIds)
      ? driverRow.disabledCategoryIds
      : (Array.isArray(prevMeta.disabledCategoryIds) ? prevMeta.disabledCategoryIds : undefined),
    pixKeys: validateAndNormalizeDriverPixKeys(
      Array.isArray(driverRow.pixKeys) ? driverRow.pixKeys : (Array.isArray(prevMeta.pixKeys) ? prevMeta.pixKeys : undefined),
      {
        name: driverRow.name,
        document: driverRow.document,
        pixKey: driverRow.pix_key ?? driverRow.pixKey ?? '',
        pixType: driverRow.pix_type ?? driverRow.pixType ?? 'cpf',
        bankName: driverRow.bank_name ?? driverRow.bankName ?? '',
        createdAt: driverRow.created_at || driverRow.createdAt
      },
      { strict: false }
    ),
    vehicles: normalizeDriverVehicles(
      Array.isArray(driverRow.vehicles) ? driverRow.vehicles : (Array.isArray(prevMeta.vehicles) ? prevMeta.vehicles : undefined),
      {
        approval_status: driverRow.approval_status ?? driverRow.approvalStatus,
        cnhHasEar: driverRow.cnhHasEar !== undefined ? Boolean(driverRow.cnhHasEar) : (prevMeta.cnhHasEar ?? true),
        vehicleBrand: driverRow.vehicle_brand ?? driverRow.vehicleBrand ?? '',
        vehicleModel: driverRow.vehicle_model ?? driverRow.vehicleModel ?? '',
        vehicleVersion: driverRow.vehicleVersion ?? prevMeta.vehicleVersion ?? '',
        vehicleColor: driverRow.vehicle_color ?? driverRow.vehicleColor ?? '',
        vehicleYear: driverRow.vehicle_year ?? driverRow.vehicleYear ?? '',
        vehiclePlate: driverRow.vehicle_plate ?? driverRow.vehiclePlate ?? '',
        vehiclePhoto: driverRow.vehicle_photo ?? driverRow.vehiclePhoto ?? '',
        crlvNumber: driverRow.crlvNumber ?? prevMeta.crlvNumber ?? '',
        crlvDocumentPhoto: driverRow.crlvDocumentPhoto ?? prevMeta.crlvDocumentPhoto ?? '',
        crlvRegular: driverRow.crlvRegular !== undefined ? Boolean(driverRow.crlvRegular) : (prevMeta.crlvRegular ?? true),
        hasFourDoors: driverRow.hasFourDoors !== undefined ? Boolean(driverRow.hasFourDoors) : (prevMeta.hasFourDoors ?? true),
        hasAirConditioning: driverRow.hasAirConditioning !== undefined ? Boolean(driverRow.hasAirConditioning) : (prevMeta.hasAirConditioning ?? true),
        hasLargeTrunk: driverRow.hasLargeTrunk !== undefined ? Boolean(driverRow.hasLargeTrunk) : prevMeta.hasLargeTrunk,
        hasLeatherSeats: driverRow.hasLeatherSeats !== undefined ? Boolean(driverRow.hasLeatherSeats) : prevMeta.hasLeatherSeats,
        activeVehicleId: driverRow.activeVehicleId || prevMeta.activeVehicleId || '',
        rating: Number(driverRow.rating || 5.0),
        totalRides: Number(driverRow.total_rides ?? driverRow.totalRides ?? 0),
        createdAt: driverRow.created_at || driverRow.createdAt
      },
      cats
    ),
    activeVehicleId: driverRow.activeVehicleId !== undefined ? driverRow.activeVehicleId : (prevMeta.activeVehicleId || undefined),
    efiAccountId: driverRow.efiAccountId !== undefined
      ? String(driverRow.efiAccountId || '').replace(/\D/g, '')
      : (prevMeta.efiAccountId || ''),
    profileChangeRequest: driverRow.profileChangeRequest !== undefined ? driverRow.profileChangeRequest : (prevMeta.profileChangeRequest || null)
  };

  const normalized = {
    id: driverRow.id || `drv-${Date.now()}`,
    name: driverRow.name || '',
    phone: driverRow.phone || '',
    email: driverRow.email || '',
    document: String(driverRow.document || '').replace(/\D/g, ''),
    cnh: String(driverRow.cnh || '').replace(/\D/g, ''),
    password_hash: driverRow.password_hash || driverRow.passwordHash || '',
    photo: driverRow.photo || '',
    vehicle_brand: driverRow.vehicle_brand ?? driverRow.vehicleBrand ?? '',
    vehicle_model: driverRow.vehicle_model ?? driverRow.vehicleModel ?? '',
    vehicle_color: driverRow.vehicle_color ?? driverRow.vehicleColor ?? '',
    vehicle_year: driverRow.vehicle_year ?? driverRow.vehicleYear ?? '2024',
    vehicle_plate: String(driverRow.vehicle_plate ?? driverRow.vehiclePlate ?? '').toUpperCase(),
    vehicle_category: mapLegacyCategoryIdServer(driverRow.vehicle_category ?? driverRow.vehicleCategory ?? 'kavro_go'),
    vehicle_photo: driverRow.vehicle_photo ?? driverRow.vehiclePhoto ?? '',
    city: driverRow.city || '',
    bio: driverRow.bio || '',
    pix_key: driverRow.pix_key ?? driverRow.pixKey ?? '',
    pix_type: driverRow.pix_type ?? driverRow.pixType ?? 'cpf',
    bank_name: driverRow.bank_name ?? driverRow.bankName ?? '',
    bank_agency: driverRow.bank_agency ?? driverRow.bankAgency ?? '',
    bank_account: driverRow.bank_account ?? driverRow.bankAccount ?? '',
    auto_payout_weekly: driverRow.auto_payout_weekly ?? driverRow.autoPayoutWeekly ?? true,
    approval_status: driverRow.approval_status ?? driverRow.approvalStatus ?? 'pendente_aprovacao',
    financial_blocked: Boolean(driverRow.financial_blocked ?? driverRow.financialBlocked ?? false),
    financial_block_reason: driverRow.financial_block_reason ?? driverRow.financialBlockReason ?? null,
    is_online: Boolean(driverRow.is_online ?? driverRow.isOnline ?? false),
    current_ride_id: driverRow.current_ride_id !== undefined ? driverRow.current_ride_id : (driverRow.currentRideId ?? null),
    queued_ride_id: driverRow.queued_ride_id !== undefined ? driverRow.queued_ride_id : (driverRow.queuedRideId ?? null),
    location: driverRow.location || null,
    rating: Number(driverRow.rating || 5.0),
    total_rides: Number(driverRow.total_rides ?? driverRow.totalRides ?? 0),
    metadata,
    created_at: driverRow.created_at || driverRow.createdAt || now,
    updated_at: now
  };

  if (!db.pool) {
    const idx = db.localStore.drivers.findIndex(d => d.id === normalized.id);
    if (idx >= 0) {
      db.localStore.drivers[idx] = {
        ...db.localStore.drivers[idx],
        ...normalized,
        password_hash: normalized.password_hash || db.localStore.drivers[idx].password_hash
      };
      db.saveLocalStore();
      return formatDriverRow(db.localStore.drivers[idx], cats);
    }
    db.localStore.drivers.unshift(normalized);
    db.saveLocalStore();
    return formatDriverRow(normalized, cats);
  }

  const r = await db.query(
    `INSERT INTO public.drivers (
      id, name, phone, email, document, cnh, password_hash, photo,
      vehicle_brand, vehicle_model, vehicle_color, vehicle_year, vehicle_plate, vehicle_category, vehicle_photo,
      city, bio, pix_key, pix_type, bank_name, bank_agency, bank_account, auto_payout_weekly,
      approval_status, financial_blocked, financial_block_reason, is_online, current_ride_id, queued_ride_id,
      location, rating, total_rides, metadata, created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      email = EXCLUDED.email,
      document = EXCLUDED.document,
      cnh = EXCLUDED.cnh,
      password_hash = CASE WHEN EXCLUDED.password_hash <> '' THEN EXCLUDED.password_hash ELSE public.drivers.password_hash END,
      photo = EXCLUDED.photo,
      vehicle_brand = EXCLUDED.vehicle_brand,
      vehicle_model = EXCLUDED.vehicle_model,
      vehicle_color = EXCLUDED.vehicle_color,
      vehicle_year = EXCLUDED.vehicle_year,
      vehicle_plate = EXCLUDED.vehicle_plate,
      vehicle_category = EXCLUDED.vehicle_category,
      vehicle_photo = EXCLUDED.vehicle_photo,
      city = EXCLUDED.city,
      bio = EXCLUDED.bio,
      pix_key = EXCLUDED.pix_key,
      pix_type = EXCLUDED.pix_type,
      bank_name = EXCLUDED.bank_name,
      bank_agency = EXCLUDED.bank_agency,
      bank_account = EXCLUDED.bank_account,
      auto_payout_weekly = EXCLUDED.auto_payout_weekly,
      approval_status = EXCLUDED.approval_status,
      financial_blocked = EXCLUDED.financial_blocked,
      financial_block_reason = EXCLUDED.financial_block_reason,
      is_online = EXCLUDED.is_online,
      current_ride_id = EXCLUDED.current_ride_id,
      queued_ride_id = EXCLUDED.queued_ride_id,
      location = EXCLUDED.location,
      rating = EXCLUDED.rating,
      total_rides = EXCLUDED.total_rides,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING *`,
    [
      normalized.id, normalized.name, normalized.phone, normalized.email, normalized.document, normalized.cnh,
      normalized.password_hash, normalized.photo, normalized.vehicle_brand, normalized.vehicle_model,
      normalized.vehicle_color, normalized.vehicle_year, normalized.vehicle_plate, normalized.vehicle_category,
      normalized.vehicle_photo, normalized.city, normalized.bio, normalized.pix_key, normalized.pix_type,
      normalized.bank_name, normalized.bank_agency, normalized.bank_account, normalized.auto_payout_weekly,
      normalized.approval_status, normalized.financial_blocked, normalized.financial_block_reason,
      normalized.is_online, normalized.current_ride_id, normalized.queued_ride_id,
      normalized.location ? JSON.stringify(normalized.location) : null,
      normalized.rating, normalized.total_rides, JSON.stringify(normalized.metadata), normalized.created_at
    ]
  );
  return formatDriverRow(r.rows[0], cats);
}

// ============================================================
// Livro-Razão Financeiro (Imutável + Idempotente)
// ============================================================
async function recordLedgerEntry(entry) {
  await ensureExtendedSchema();
  const idempotencyKey = String(entry.idempotencyKey || `${entry.entryType}_${entry.rideId || Date.now()}`);

  if (!db.pool) {
    const existing = db.localStore.financial_ledger.find(e => e.idempotency_key === idempotencyKey);
    if (existing) {
      return { entry: formatLedgerRow(existing), idempotent: true };
    }
    const row = {
      id: entry.id || `led-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      idempotency_key: idempotencyKey,
      driver_id: entry.driverId || 'platform',
      driver_name: entry.driverName || '',
      ride_id: entry.rideId || null,
      ride_code: entry.rideCode || null,
      client_id: entry.clientId || null,
      client_name: entry.clientName || null,
      entry_type: entry.entryType,
      payment_method: entry.paymentMethod || 'pix',
      gross_amount: round2(entry.grossAmount),
      commission_percent: round2(entry.commissionPercent),
      commission_amount: round2(entry.commissionAmount),
      driver_net_amount: round2(entry.driverNetAmount),
      balance_delta: round2(entry.balanceDelta),
      balance_bucket: entry.balanceBucket || 'available',
      status: entry.status || 'confirmado',
      description: entry.description || '',
      metadata: entry.metadata || {},
      created_at: new Date().toISOString()
    };
    db.localStore.financial_ledger.unshift(row);
    db.saveLocalStore();
    return { entry: formatLedgerRow(row), idempotent: false };
  }

  const check = await db.query(
    'SELECT * FROM public.financial_ledger WHERE idempotency_key = $1 LIMIT 1',
    [idempotencyKey]
  );
  if (check.rows[0]) {
    return { entry: formatLedgerRow(check.rows[0]), idempotent: true };
  }

  const id = entry.id || `led-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const r = await db.query(
    `INSERT INTO public.financial_ledger (
      id, idempotency_key, driver_id, driver_name, ride_id, ride_code, client_id, client_name,
      entry_type, payment_method, gross_amount, commission_percent, commission_amount,
      driver_net_amount, balance_delta, balance_bucket, status, description, metadata, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW())
    RETURNING *`,
    [
      id,
      idempotencyKey,
      entry.driverId || 'platform',
      entry.driverName || '',
      entry.rideId || null,
      entry.rideCode || null,
      entry.clientId || null,
      entry.clientName || null,
      entry.entryType,
      entry.paymentMethod || 'pix',
      round2(entry.grossAmount),
      round2(entry.commissionPercent),
      round2(entry.commissionAmount),
      round2(entry.driverNetAmount),
      round2(entry.balanceDelta),
      entry.balanceBucket || 'available',
      entry.status || 'confirmado',
      entry.description || '',
      JSON.stringify(entry.metadata || {})
    ]
  );
  return { entry: formatLedgerRow(r.rows[0]), idempotent: false };
}

async function listLedgerEntries(driverId = null) {
  await ensureExtendedSchema();
  if (!db.pool) {
    const list = db.localStore.financial_ledger || [];
    const filtered = driverId ? list.filter(e => e.driver_id === driverId) : list;
    return filtered.map(formatLedgerRow);
  }
  if (driverId) {
    const r = await db.query(
      'SELECT * FROM public.financial_ledger WHERE driver_id = $1 ORDER BY created_at DESC LIMIT 500',
      [driverId]
    );
    return r.rows.map(formatLedgerRow);
  }
  const r = await db.query('SELECT * FROM public.financial_ledger ORDER BY created_at DESC LIMIT 1000');
  return r.rows.map(formatLedgerRow);
}

// ============================================================
// Transações de Pagamento & Conciliação Gateway
// ============================================================
async function savePaymentTransaction(tx) {
  await ensureExtendedSchema();
  const now = new Date().toISOString();
  const explicitId = String(tx.id || '').trim();
  const normalized = {
    id: explicitId || `pay-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    ride_id: tx.rideId || tx.ride_id,
    ride_code: tx.rideCode || tx.ride_code || '',
    driver_id: tx.driverId ?? tx.driver_id ?? null,
    driver_name: tx.driverName ?? tx.driver_name ?? null,
    client_id: tx.clientId ?? tx.client_id ?? null,
    client_name: tx.clientName ?? tx.client_name ?? null,
    method: tx.method || 'pix',
    status: tx.status || 'aguardando',
    estimated_amount: round2(tx.estimatedAmount ?? tx.estimated_amount ?? 0),
    final_amount: round2(tx.finalAmount ?? tx.final_amount ?? 0),
    paid_amount: round2(tx.paidAmount ?? tx.paid_amount ?? 0),
    refunded_amount: round2(tx.refundedAmount ?? tx.refunded_amount ?? 0),
    commission_percent: round2(tx.commissionPercent ?? tx.commission_percent ?? 20),
    commission_amount: round2(tx.commissionAmount ?? tx.commission_amount ?? 0),
    driver_net_amount: round2(tx.driverNetAmount ?? tx.driver_net_amount ?? 0),
    pix_qr_code: tx.pixQrCode ?? tx.pix_qr_code ?? '',
    pix_copy_paste: tx.pixCopyPaste ?? tx.pix_copy_paste ?? '',
    pix_expires_at: normalizeOptionalTimestamp(
      tx.pixExpiresAt !== undefined ? tx.pixExpiresAt : tx.pix_expires_at,
      null
    ),
    card_id: tx.cardId ?? tx.card_id ?? '',
    card_last4: tx.cardLast4 ?? tx.card_last4 ?? '',
    card_brand: tx.cardBrand ?? tx.card_brand ?? '',
    gateway_auth_code: tx.gatewayAuthCode ?? tx.gateway_auth_code ?? '',
    gateway_tx_id:
      String(tx.gatewayTxId || tx.gateway_tx_id || '').trim() ||
      `gw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    dispute_reason: tx.disputeReason ?? tx.dispute_reason ?? '',
    failure_reason: tx.failureReason ?? tx.failure_reason ?? '',
    created_at: normalizeOptionalTimestamp(
      tx.createdAt !== undefined ? tx.createdAt : tx.created_at,
      now
    ),
    updated_at: now
  };

  if (!db.pool) {
    const idx = db.localStore.payment_transactions.findIndex(
      p => p.id === normalized.id || (normalized.ride_id && p.ride_id === normalized.ride_id)
    );
    if (idx >= 0) {
      db.localStore.payment_transactions[idx] = {
        ...db.localStore.payment_transactions[idx],
        ...normalized
      };
      db.saveLocalStore();
      return formatPaymentTxRow(db.localStore.payment_transactions[idx]);
    }
    db.localStore.payment_transactions.unshift(normalized);
    db.saveLocalStore();
    return formatPaymentTxRow(normalized);
  }

  // Evita duplicidade por ride_id ou colisão na constraint UNIQUE(gateway_tx_id)
  if (!explicitId && normalized.ride_id) {
    const byRideRes = await db.query(
      'SELECT id, gateway_tx_id FROM public.payment_transactions WHERE ride_id = $1 ORDER BY created_at DESC LIMIT 1',
      [normalized.ride_id]
    );
    if (byRideRes.rows[0]) {
      normalized.id = byRideRes.rows[0].id;
    }
  }

  if (normalized.gateway_tx_id) {
    const byGwRes = await db.query(
      'SELECT id, ride_id FROM public.payment_transactions WHERE gateway_tx_id = $1 LIMIT 1',
      [normalized.gateway_tx_id]
    );
    const conflictRow = byGwRes.rows[0];
    if (conflictRow && conflictRow.id !== normalized.id) {
      if (normalized.ride_id && conflictRow.ride_id === normalized.ride_id) {
        normalized.id = conflictRow.id;
      } else {
        normalized.gateway_tx_id = `${normalized.gateway_tx_id}_${crypto.randomBytes(3).toString('hex')}`;
      }
    }
  }

  const r = await db.query(
    `INSERT INTO public.payment_transactions (
      id, ride_id, ride_code, driver_id, driver_name, client_id, client_name,
      method, status, estimated_amount, final_amount, paid_amount, refunded_amount,
      commission_percent, commission_amount, driver_net_amount,
      pix_qr_code, pix_copy_paste, pix_expires_at, card_id, card_last4, card_brand,
      gateway_auth_code, gateway_tx_id, dispute_reason, failure_reason, created_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      driver_id = COALESCE(EXCLUDED.driver_id, public.payment_transactions.driver_id),
      driver_name = COALESCE(EXCLUDED.driver_name, public.payment_transactions.driver_name),
      status = EXCLUDED.status,
      final_amount = EXCLUDED.final_amount,
      paid_amount = EXCLUDED.paid_amount,
      refunded_amount = EXCLUDED.refunded_amount,
      commission_percent = EXCLUDED.commission_percent,
      commission_amount = EXCLUDED.commission_amount,
      driver_net_amount = EXCLUDED.driver_net_amount,
      pix_qr_code = COALESCE(NULLIF(EXCLUDED.pix_qr_code, ''), public.payment_transactions.pix_qr_code),
      pix_copy_paste = COALESCE(NULLIF(EXCLUDED.pix_copy_paste, ''), public.payment_transactions.pix_copy_paste),
      pix_expires_at = COALESCE(EXCLUDED.pix_expires_at, public.payment_transactions.pix_expires_at),
      gateway_tx_id = COALESCE(NULLIF(EXCLUDED.gateway_tx_id, ''), public.payment_transactions.gateway_tx_id),
      dispute_reason = EXCLUDED.dispute_reason,
      failure_reason = EXCLUDED.failure_reason,
      updated_at = NOW()
    RETURNING *`,
    [
      normalized.id, normalized.ride_id, normalized.ride_code, normalized.driver_id, normalized.driver_name,
      normalized.client_id, normalized.client_name, normalized.method, normalized.status,
      normalized.estimated_amount, normalized.final_amount, normalized.paid_amount, normalized.refunded_amount,
      normalized.commission_percent, normalized.commission_amount, normalized.driver_net_amount,
      normalized.pix_qr_code, normalized.pix_copy_paste, normalized.pix_expires_at,
      normalized.card_id, normalized.card_last4, normalized.card_brand,
      normalized.gateway_auth_code, normalized.gateway_tx_id, normalized.dispute_reason,
      normalized.failure_reason, normalized.created_at
    ]
  );
  return formatPaymentTxRow(r.rows[0]);
}

async function getPaymentTxByRide(rideId) {
  await ensureExtendedSchema();
  if (!db.pool) {
    const found = (db.localStore.payment_transactions || []).find(p => p.ride_id === rideId || p.id === rideId);
    return found ? formatPaymentTxRow(found) : null;
  }
  const r = await db.query(
    'SELECT * FROM public.payment_transactions WHERE ride_id = $1 OR id = $1 ORDER BY created_at DESC LIMIT 1',
    [rideId]
  );
  return r.rows[0] ? formatPaymentTxRow(r.rows[0]) : null;
}

async function getPaymentTxByGatewayTxId(gatewayTxId) {
  const gwId = String(gatewayTxId || '').trim();
  if (!gwId) return null;
  await ensureExtendedSchema();
  if (!db.pool) {
    const found = (db.localStore.payment_transactions || []).find(
      p => (p.gateway_tx_id || p.gatewayTxId) === gwId
    );
    return found ? formatPaymentTxRow(found) : null;
  }
  const r = await db.query(
    'SELECT * FROM public.payment_transactions WHERE gateway_tx_id = $1 ORDER BY created_at DESC LIMIT 1',
    [gwId]
  );
  return r.rows[0] ? formatPaymentTxRow(r.rows[0]) : null;
}

async function listPaymentTransactions() {
  await ensureExtendedSchema();
  if (!db.pool) {
    return (db.localStore.payment_transactions || []).map(formatPaymentTxRow);
  }
  const r = await db.query('SELECT * FROM public.payment_transactions ORDER BY created_at DESC LIMIT 500');
  return r.rows.map(formatPaymentTxRow);
}

// ============================================================
// Cálculo da Carteira do Motorista (100% Baseado no Livro-Razão)
// ============================================================
async function getDriverWallet(driverId) {
  const cfg = await getSystemConfig();
  const driver = await getDriverById(driverId);
  const ledger = await listLedgerEntries(driverId);
  const withdrawals = await listWithdrawals(driverId);

  let netDigitalAvailable = 0;
  let separateCashDebtDelta = 0;
  let pendingBalance = 0;
  let totalGrossEarnings = 0;
  let totalNetEarnings = 0;
  let totalCashReceived = 0;
  let totalCommissionPaid = 0;
  let totalCashCommissionDebited = 0;
  let totalDebtSettledViaPix = 0;
  let totalWithdrawn = 0;

  for (const item of ledger) {
    if (item.status === 'revertido') continue;

    if (item.balanceBucket === 'pending' && item.status === 'pendente_liberacao') {
      pendingBalance += item.balanceDelta;
    } else if (item.balanceBucket === 'cash_debt') {
      separateCashDebtDelta += item.balanceDelta;
    } else if (item.balanceBucket === 'available' || item.balanceBucket === 'debt') {
      netDigitalAvailable += item.balanceDelta;
    }

    if (item.entryType === 'ride_earning_credit' || item.entryType === 'cancellation_fee_credit') {
      totalGrossEarnings += item.grossAmount;
      totalNetEarnings += item.driverNetAmount;
      totalCommissionPaid += item.commissionAmount;
    } else if (item.entryType === 'cash_ride_received') {
      totalGrossEarnings += item.grossAmount;
      totalCashReceived += item.grossAmount;
    } else if (item.entryType === 'cash_commission_debit') {
      totalCashCommissionDebited += item.commissionAmount;
      totalNetEarnings += (item.grossAmount - item.commissionAmount);
    } else if (item.entryType === 'debt_pix_settlement') {
      totalDebtSettledViaPix += item.balanceDelta;
      totalCommissionPaid += item.balanceDelta;
    } else if (item.entryType === 'payout_withdrawal') {
      totalWithdrawn += Math.abs(item.balanceDelta);
    }
  }

  const availableBalance = netDigitalAvailable > 0 ? round2(netDigitalAvailable) : 0;
  const separateDebtBalance = separateCashDebtDelta < 0 ? round2(Math.abs(separateCashDebtDelta)) : 0;
  const debtBalance = round2((netDigitalAvailable < 0 ? Math.abs(netDigitalAvailable) : 0) + separateDebtBalance);
  const maxDebtLimit = Number(cfg.maxDriverDebtLimit ?? 100);
  const isDelinquent = Boolean(
    driver?.financialBlocked ||
    (cfg.autoBlockDelinquentDrivers !== false && debtBalance >= maxDebtLimit && maxDebtLimit > 0)
  );

  // Atualiza flag de bloqueio financeiro automático no cadastro do motorista se necessário
  if (driver) {
    const shouldBlock = cfg.autoBlockDelinquentDrivers !== false && debtBalance >= maxDebtLimit && maxDebtLimit > 0;
    if (shouldBlock && !driver.financialBlocked) {
      await saveDriverRecord({
        ...driver,
        financialBlocked: true,
        financialBlockReason: `Limite de dívida atingido (R$ ${debtBalance.toFixed(2)} / máx R$ ${maxDebtLimit.toFixed(2)})`
      });
    } else if (!shouldBlock && driver.financialBlocked && String(driver.financialBlockReason || '').startsWith('Limite de dívida')) {
      await saveDriverRecord({
        ...driver,
        financialBlocked: false,
        financialBlockReason: null
      });
    }
  }

  return {
    driverId,
    driverName: driver?.name || 'Motorista',
    availableBalance: round2(availableBalance),
    pendingBalance: round2(Math.max(0, pendingBalance)),
    totalGrossEarnings: round2(totalGrossEarnings),
    totalNetEarnings: round2(Math.max(0, totalNetEarnings)),
    totalCashReceived: round2(totalCashReceived),
    totalCommissionPaid: round2(totalCommissionPaid + Math.max(0, totalCashCommissionDebited - debtBalance)),
    totalCommissionPending: round2(debtBalance),
    debtBalance: round2(debtBalance),
    separateDebtBalance: round2(separateDebtBalance),
    maxDebtLimit: round2(maxDebtLimit),
    isDelinquent,
    financialBlocked: Boolean(driver?.financialBlocked || isDelinquent),
    totalWithdrawn: round2(totalWithdrawn),
    pixKey: driver?.pixKey || '',
    pixType: driver?.pixType || 'cpf',
    pixKeys: Array.isArray(driver?.pixKeys) ? driver.pixKeys : [],
    autoPayoutWeekly: driver?.autoPayoutWeekly !== false,
    ledger,
    withdrawals
  };
}

// ============================================================
// Saques / Repasses de Motoristas (Com Prevenção de Duplicidade)
// ============================================================
async function listWithdrawals(driverId = null) {
  await ensureExtendedSchema();
  if (!db.pool) {
    const list = db.localStore.withdrawal_requests || [];
    const filtered = driverId ? list.filter(w => w.driver_id === driverId || w.driverId === driverId) : list;
    return filtered.map(w => {
      const amount = round2(w.amount);
      const feeAmount = round2(w.fee_amount ?? w.feeAmount ?? 0);
      const netPayoutAmount = round2(w.net_payout_amount ?? w.netPayoutAmount ?? Math.max(0, amount - feeAmount));
      return {
        id: w.id,
        driverId: w.driver_id || w.driverId,
        driverName: w.driver_name || w.driverName,
        amount,
        feeAmount,
        netPayoutAmount,
        pixKey: w.pix_key || w.pixKey,
        pixType: w.pix_type || w.pixType || 'cpf',
        status: w.status || 'solicitado',
        ledgerEntryId: w.ledger_entry_id || w.ledgerEntryId,
        notes: w.notes || '',
        payoutProviderTxId: w.payout_provider_tx_id || w.payoutProviderTxId || null,
        payoutStatus: w.payout_status || w.payoutStatus || null,
        payoutProvider: w.payout_provider || w.payoutProvider || null,
        createdAt: w.created_at || w.createdAt,
        processedAt: w.processed_at || w.processedAt
      };
    });
  }
  const r = driverId
    ? await db.query('SELECT * FROM public.withdrawal_requests WHERE driver_id = $1 ORDER BY created_at DESC', [driverId])
    : await db.query('SELECT * FROM public.withdrawal_requests ORDER BY created_at DESC');
  return r.rows.map(w => {
    const amount = round2(w.amount);
    const feeAmount = round2(w.fee_amount ?? 0);
    const netPayoutAmount = round2(w.net_payout_amount ?? Math.max(0, amount - feeAmount));
    return {
      id: w.id,
      driverId: w.driver_id,
      driverName: w.driver_name,
      amount,
      feeAmount,
      netPayoutAmount,
      pixKey: w.pix_key,
      pixType: w.pix_type || 'cpf',
      status: w.status || 'solicitado',
      ledgerEntryId: w.ledger_entry_id,
      notes: w.notes || '',
      payoutProviderTxId: w.payout_provider_tx_id || null,
      payoutStatus: w.payout_status || null,
      payoutProvider: w.payout_provider || null,
      createdAt: w.created_at,
      processedAt: w.processed_at
    };
  });
}

const WITHDRAWAL_LOCKS = new Map();

async function withDriverWithdrawalLock(driverId, fn) {
  const prev = WITHDRAWAL_LOCKS.get(driverId) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  WITHDRAWAL_LOCKS.set(driverId, prev.then(() => gate, () => gate));
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (WITHDRAWAL_LOCKS.get(driverId) === gate) {
      WITHDRAWAL_LOCKS.delete(driverId);
    }
  }
}

async function requestWithdrawal({ driverId, amount, pixKey, pixType }) {
  return withDriverWithdrawalLock(driverId, async () => {
    const cfg = await getSystemConfig();
    const driver = await getDriverById(driverId);
    if (!driver) throw new Error('Motorista não encontrado.');
    if (driver.financialBlocked) {
      throw new Error('Funções financeiras temporariamente bloqueadas para esta conta.');
    }

    const wdAvailability = evaluateWithdrawalAvailability(cfg);
    if (!wdAvailability.canRequestNow) {
      throw new Error(wdAvailability.blockedReason || 'Solicitação de saque indisponível no momento.');
    }

    const reqAmount = round2(amount);
    const minAmount = round2(cfg.minWithdrawalAmount ?? 10);
    const feePct = Math.max(0, Math.min(100, Number(cfg.withdrawalFeePercent ?? 0) || 0));
    const feeFixed = Math.max(0, round2(cfg.withdrawalFeeFixed ?? 0));
    const feeAmount = round2(Math.min(reqAmount, (reqAmount * (feePct / 100)) + feeFixed));
    const netPayoutAmount = round2(Math.max(0, reqAmount - feeAmount));

    if (reqAmount <= 0) throw new Error('Informe um valor válido para saque.');
    if (reqAmount < minAmount) throw new Error(`O valor mínimo para saque é R$ ${minAmount.toFixed(2)}.`);
    if (netPayoutAmount <= 0) {
      throw new Error(`O valor do saque precisa ser maior que a taxa de transferência (R$ ${feeAmount.toFixed(2)}).`);
    }

    const driverPixKeys = Array.isArray(driver.pixKeys) ? driver.pixKeys : [];
    const defaultSavedKey = driverPixKeys.find(k => k.isDefault) || driverPixKeys[0];
    const requestedKeyStr = String(pixKey || '').trim();
    const matchedRegisteredKey = requestedKeyStr
      ? driverPixKeys.find(k => String(k.pixKey || '').trim().toLowerCase() === requestedKeyStr.toLowerCase())
      : null;
    const targetPixKey = requestedKeyStr || defaultSavedKey?.pixKey || String(driver.pixKey || '').trim();
    const targetPixType = String(matchedRegisteredKey?.pixType || pixType || defaultSavedKey?.pixType || driver.pixType || 'cpf');
    if (!targetPixKey) {
      throw new Error('Cadastre uma chave PIX válida de mesma titularidade na sua carteira antes de solicitar o saque.');
    }
    if (targetPixType === 'cpf' && driver.document) {
      const ownerDigits = String(driver.document).replace(/\D/g, '');
      const keyDigits = targetPixKey.replace(/\D/g, '');
      if (ownerDigits && keyDigits !== ownerDigits) {
        throw new Error('Saque bloqueado: a chave PIX em CPF precisa pertencer ao mesmo titular (CPF) do motorista.');
      }
    }

    const wdId = `wd-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
    const ledgerId = `led-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const desc = feeAmount > 0
      ? `Solicitação de saque via PIX (${targetPixKey}) — Líquido R$ ${netPayoutAmount.toFixed(2)} | Taxa saque R$ ${feeAmount.toFixed(2)}`
      : `Solicitação de saque via PIX (${targetPixKey})`;

    if (!db.pool) {
      const wallet = await getDriverWallet(driverId);
      if (reqAmount > wallet.availableBalance) {
        throw new Error(`Saldo disponível insuficiente (Disponível: R$ ${wallet.availableBalance.toFixed(2)}).`);
      }

      const existingPending = wallet.withdrawals.find(
        w => (w.status === 'solicitado' || w.status === 'processando') &&
          Math.abs(w.amount - reqAmount) < 0.01 &&
          Date.now() - new Date(w.createdAt).getTime() < 60000
      );
      if (existingPending) {
        throw new Error('Já existe uma solicitação de saque idêntica em processamento. Aguarde a conclusão.');
      }

      const { entry } = await recordLedgerEntry({
        id: ledgerId,
        idempotencyKey: `withdrawal_${wdId}`,
        driverId: driver.id,
        driverName: driver.name,
        entryType: 'payout_withdrawal',
        paymentMethod: 'pix',
        grossAmount: reqAmount,
        commissionPercent: feePct,
        commissionAmount: feeAmount,
        driverNetAmount: netPayoutAmount,
        balanceDelta: -reqAmount,
        balanceBucket: 'available',
        status: 'confirmado',
        description: desc,
        metadata: { withdrawalId: wdId, pixKey: targetPixKey, pixType: targetPixType, feeAmount, netPayoutAmount }
      });

      const now = new Date().toISOString();
      const row = {
        id: wdId,
        driver_id: driver.id,
        driver_name: driver.name,
        amount: reqAmount,
        fee_amount: feeAmount,
        net_payout_amount: netPayoutAmount,
        pix_key: targetPixKey,
        pix_type: targetPixType,
        status: 'solicitado',
        ledger_entry_id: entry.id,
        notes: '',
        created_at: now,
        processed_at: null
      };
      db.localStore.withdrawal_requests.unshift(row);
      db.saveLocalStore();
      return { ...row, feeAmount, netPayoutAmount };
    }

    // PostgreSQL com bloqueio pessimista FOR UPDATE na linha do motorista (evita corrida de saques simultâneos)
    await ensureExtendedSchema();
    const pgClient = await db.pool.connect();
    try {
      await pgClient.query('BEGIN');
      await pgClient.query('SELECT id FROM public.drivers WHERE id = $1 FOR UPDATE', [driverId]);

      const balRes = await pgClient.query(
        `SELECT COALESCE(SUM(CASE WHEN balance_bucket = 'available' AND status = 'confirmado' THEN balance_delta ELSE 0 END), 0) AS avail
         FROM public.financial_ledger WHERE driver_id = $1`,
        [driverId]
      );
      const availBal = round2(balRes.rows[0]?.avail || 0);
      if (reqAmount > availBal) {
        throw new Error(`Saldo disponível insuficiente (Disponível: R$ ${availBal.toFixed(2)}).`);
      }

      const dupRes = await pgClient.query(
        `SELECT id FROM public.withdrawal_requests
         WHERE driver_id = $1
           AND status IN ('solicitado', 'processando')
           AND ABS(amount - $2) < 0.01
           AND created_at > NOW() - INTERVAL '60 seconds'
         LIMIT 1`,
        [driverId, reqAmount]
      );
      if (dupRes.rows[0]) {
        throw new Error('Já existe uma solicitação de saque idêntica em processamento. Aguarde a conclusão.');
      }

      await pgClient.query(
        `INSERT INTO public.financial_ledger (
          id, idempotency_key, driver_id, driver_name, entry_type, payment_method,
          gross_amount, commission_percent, commission_amount, driver_net_amount,
          balance_delta, balance_bucket, status, description, metadata, created_at
        ) VALUES ($1,$2,$3,$4,'payout_withdrawal','pix',$5,$6,$7,$8,$9,'available','confirmado',$10,$11,NOW())`,
        [
          ledgerId,
          `withdrawal_${wdId}`,
          driver.id,
          driver.name,
          reqAmount,
          feePct,
          feeAmount,
          netPayoutAmount,
          -reqAmount,
          desc,
          JSON.stringify({ withdrawalId: wdId, pixKey: targetPixKey, pixType: targetPixType, feeAmount, netPayoutAmount })
        ]
      );

      const r = await pgClient.query(
        `INSERT INTO public.withdrawal_requests (
          id, driver_id, driver_name, amount, fee_amount, net_payout_amount, pix_key, pix_type, status, ledger_entry_id, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'solicitado',$9,NOW()) RETURNING *`,
        [wdId, driver.id, driver.name, reqAmount, feeAmount, netPayoutAmount, targetPixKey, targetPixType, ledgerId]
      );
      await pgClient.query('COMMIT');
      return { ...r.rows[0], feeAmount, netPayoutAmount };
    } catch (err) {
      await pgClient.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      pgClient.release();
    }
  });
}

function mapAsaasPixType(pixType) {
  const t = String(pixType || '').toLowerCase().trim();
  if (t === 'cpf' || t === 'cnpj') return t.toUpperCase();
  if (t === 'email') return 'EMAIL';
  if (t === 'telefone' || t === 'phone' || t === 'celular') return 'PHONE';
  return 'EVP';
}

async function dispatchAutomatedPixPayout(wd) {
  const amount = round2(wd.netPayoutAmount !== undefined && wd.netPayoutAmount > 0 ? wd.netPayoutAmount : wd.amount);

  if (await efiBankGateway.isEfiDriverPayoutActive()) {
    try {
      const drv = wd.driverId ? await getDriverById(wd.driverId).catch(() => null) : null;
      const efiRes = await efiBankGateway.sendPixPayout({
        idEnvio: wd.id,
        amountBrl: amount,
        pixKey: wd.pixKey,
        cpfFavorecido: drv?.document || '',
        description: `Repasse Motorista Kavro Drive (${wd.driverName || wd.driverId}) - ${wd.id}`
      });
      if (!efiRes.ok) {
        return {
          ok: false,
          payoutProvider: 'efibank_pix',
          payoutStatus: 'falha_psp',
          error: efiRes.error || 'Falha ao disparar PIX pela Efí Bank.'
        };
      }
      return {
        ok: true,
        payoutProvider: 'efibank_pix',
        payoutStatus: 'processado_automaticamente',
        payoutProviderTxId: String(efiRes.e2eId || efiRes.idEnvio)
      };
    } catch (err) {
      return {
        ok: false,
        payoutProvider: 'efibank_pix',
        payoutStatus: 'falha_conexao',
        error: err.message
      };
    }
  }

  const webhookUrl = String(process.env.PIX_PAYOUT_WEBHOOK_URL || '').trim();
  const payoutApiKey = String(process.env.PIX_PAYOUT_API_KEY || '').trim();
  const asaasApiKey = String(process.env.ASAAS_API_KEY || '').trim();

  if (webhookUrl) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (payoutApiKey) headers['Authorization'] = `Bearer ${payoutApiKey}`;
      const resp = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          withdrawalId: wd.id,
          driverId: wd.driverId,
          driverName: wd.driverName,
          amount,
          pixKey: wd.pixKey,
          pixType: wd.pixType || 'cpf',
          description: `Repasse Kavro Drive ${wd.id}`
        })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return {
          ok: false,
          payoutProvider: 'webhook_psp',
          payoutStatus: 'falha_psp',
          error: data.error || data.message || `Falha HTTP ${resp.status} ao enviar repasse PIX.`
        };
      }
      return {
        ok: true,
        payoutProvider: 'webhook_psp',
        payoutStatus: 'processado_automaticamente',
        payoutProviderTxId: String(data.txId || data.transferId || data.id || `PSP-${Date.now()}`)
      };
    } catch (err) {
      return { ok: false, payoutProvider: 'webhook_psp', payoutStatus: 'falha_conexao', error: err.message };
    }
  }

  if (asaasApiKey) {
    try {
      const baseUrl = String(process.env.ASAAS_BASE_URL || 'https://api.asaas.com/v3').replace(/\/+$/, '');
      const resp = await fetch(`${baseUrl}/transfers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': asaasApiKey
        },
        body: JSON.stringify({
          value: amount,
          operationType: 'PIX',
          pixAddressKey: String(wd.pixKey || '').trim(),
          pixAddressKeyType: mapAsaasPixType(wd.pixType),
          description: `Repasse Motorista Kavro Drive (${wd.driverName || wd.driverId}) - ${wd.id}`
        })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.id) {
        const msg = data?.errors?.[0]?.description || data?.message || `Asaas HTTP ${resp.status}`;
        return { ok: false, payoutProvider: 'asaas_pix', payoutStatus: 'falha_psp', error: msg };
      }
      return {
        ok: true,
        payoutProvider: 'asaas_pix',
        payoutStatus: 'processado_automaticamente',
        payoutProviderTxId: String(data.id)
      };
    } catch (err) {
      return { ok: false, payoutProvider: 'asaas_pix', payoutStatus: 'falha_conexao', error: err.message };
    }
  }

  return {
    ok: true,
    payoutProvider: 'manual_admin',
    payoutStatus: 'repasse_manual_confirmado',
    payoutProviderTxId: `MANUAL-${wd.id}`
  };
}

async function processWithdrawalAdmin({ withdrawalId, action, notes }) {
  await ensureExtendedSchema();
  const list = await listWithdrawals();
  const wd = list.find(w => w.id === withdrawalId);
  if (!wd) throw new Error('Solicitação de saque não encontrada.');
  if (wd.status === 'pago' || wd.status === 'rejeitado') {
    throw new Error(`Esta solicitação já foi processada (${wd.status}).`);
  }

  const newStatus = action === 'reject' ? 'rejeitado' : 'pago';
  const now = new Date().toISOString();
  let payoutMeta = {
    payoutProvider: newStatus === 'rejeitado' ? null : 'manual_admin',
    payoutStatus: newStatus === 'rejeitado' ? 'estornado' : 'repasse_manual_confirmado',
    payoutProviderTxId: null
  };

  if (newStatus === 'pago') {
    const payoutRes = await dispatchAutomatedPixPayout(wd);
    if (!payoutRes.ok) {
      throw new Error(`Falha no payout PIX automático (${payoutRes.payoutProvider}): ${payoutRes.error}`);
    }
    payoutMeta = {
      payoutProvider: payoutRes.payoutProvider,
      payoutStatus: payoutRes.payoutStatus,
      payoutProviderTxId: payoutRes.payoutProviderTxId || null
    };
  }

  if (newStatus === 'rejeitado') {
    // Devolve o saldo para a carteira do motorista no livro-razão
    await recordLedgerEntry({
      idempotencyKey: `withdrawal_revert_${wd.id}`,
      driverId: wd.driverId,
      driverName: wd.driverName,
      entryType: 'admin_adjustment',
      paymentMethod: 'pix',
      grossAmount: wd.amount,
      commissionPercent: 0,
      commissionAmount: 0,
      driverNetAmount: wd.amount,
      balanceDelta: +wd.amount,
      balanceBucket: 'available',
      status: 'confirmado',
      description: `Estorno de saque rejeitado (${wd.id}): ${notes || 'Sem observações'}`
    });
  }

  const finalNotes = [
    String(notes || '').trim(),
    payoutMeta.payoutProviderTxId && payoutMeta.payoutStatus === 'processado_automaticamente'
      ? `PIX automático (${payoutMeta.payoutProvider}): ${payoutMeta.payoutProviderTxId}`
      : ''
  ].filter(Boolean).join(' • ');

  if (!db.pool) {
    const idx = db.localStore.withdrawal_requests.findIndex(w => w.id === withdrawalId);
    if (idx >= 0) {
      db.localStore.withdrawal_requests[idx].status = newStatus;
      db.localStore.withdrawal_requests[idx].notes = finalNotes;
      db.localStore.withdrawal_requests[idx].payout_provider = payoutMeta.payoutProvider;
      db.localStore.withdrawal_requests[idx].payout_status = payoutMeta.payoutStatus;
      db.localStore.withdrawal_requests[idx].payout_provider_tx_id = payoutMeta.payoutProviderTxId;
      db.localStore.withdrawal_requests[idx].processed_at = now;
      db.saveLocalStore();
    }
    return { ok: true, id: withdrawalId, status: newStatus, ...payoutMeta };
  }

  await db.query(
    `UPDATE public.withdrawal_requests
     SET status = $1, notes = $2, payout_provider = $3, payout_status = $4, payout_provider_tx_id = $5, processed_at = NOW()
     WHERE id = $6`,
    [newStatus, finalNotes, payoutMeta.payoutProvider, payoutMeta.payoutStatus, payoutMeta.payoutProviderTxId, withdrawalId]
  );
  return { ok: true, id: withdrawalId, status: newStatus, ...payoutMeta };
}

// ============================================================
// Cartões Tokenizados dos Passageiros
// ============================================================
function detectCardBrand(numStr) {
  const clean = String(numStr || '').replace(/\D/g, '');
  if (/^4/.test(clean)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(clean)) return 'Mastercard';
  if (/^(4011|4312|4389|4514|4576|5041|5066|5090|6277|6362|6363|650|6516|6550)/.test(clean)) return 'Elo';
  if (/^3[47]/.test(clean)) return 'Amex';
  if (/^(606282|3841)/.test(clean)) return 'Hipercard';
  return 'Mastercard';
}

function formatSavedCardRow(c) {
  return {
    id: c.id,
    clientId: c.client_id ?? c.clientId ?? '',
    clientPhone: c.client_phone ?? c.clientPhone ?? '',
    brand: c.brand || 'Cartão',
    last4: c.last4 || '',
    holderName: c.holder_name ?? c.holderName ?? '',
    expMonth: c.exp_month ?? c.expMonth ?? '',
    expYear: c.exp_year ?? c.expYear ?? '',
    cardType: c.card_type ?? c.cardType ?? 'cartao_credito',
    gatewayToken: c.gateway_token ?? c.gatewayToken ?? '',
    isDefault: Boolean(c.is_default ?? c.isDefault),
    createdAt: c.created_at ?? c.createdAt ?? ''
  };
}

async function listSavedCards(clientId, clientPhone) {
  await ensureExtendedSchema();
  const cleanPhone = String(clientPhone || '').replace(/\D/g, '');
  if (!db.pool) {
    return (db.localStore.saved_cards || [])
      .filter(c => {
        const cPhone = String(c.client_phone || c.clientPhone || '').replace(/\D/g, '');
        return (clientId && (c.client_id === clientId || c.clientId === clientId)) ||
          (cleanPhone.length >= 8 && cPhone === cleanPhone);
      })
      .map(formatSavedCardRow);
  }
  const r = await db.query(
    `SELECT * FROM public.saved_cards
     WHERE ($1 <> '' AND client_id = $1)
        OR ($2 <> '' AND regexp_replace(COALESCE(client_phone, ''), '\\D', '', 'g') = $2)
     ORDER BY created_at DESC`,
    [String(clientId || ''), cleanPhone]
  );
  return r.rows.map(formatSavedCardRow);
}

function mapMpPaymentMethodId(brand, cardType) {
  const b = String(brand || '').toLowerCase();
  const isDebit = cardType === 'cartao_debito';
  if (b.includes('visa')) return isDebit ? 'debvisa' : 'visa';
  if (b.includes('elo')) return isDebit ? 'debelo' : 'elo';
  if (b.includes('amex')) return 'amex';
  if (b.includes('hiper')) return 'hipercard';
  return isDebit ? 'debmaster' : 'master';
}

async function createMpCardTokenServer({ cardNumber, holderName, expMonth, expYear, cvv, holderDoc }) {
  const publicKey = String(process.env.MERCADOPAGO_PUBLIC_KEY || process.env.VITE_MERCADOPAGO_PUBLIC_KEY || '').trim();
  if (!publicKey) return null;
  try {
    const cleanDoc = String(holderDoc || '').replace(/\D/g, '');
    const body = {
      card_number: String(cardNumber || '').replace(/\D/g, ''),
      expiration_month: parseInt(String(expMonth || '12'), 10),
      expiration_year: parseInt(String(expYear || '2030').length === 2 ? `20${expYear}` : String(expYear || '2030'), 10),
      security_code: String(cvv || '').replace(/\D/g, ''),
      cardholder: {
        name: String(holderName || 'TITULAR DO CARTAO').toUpperCase().trim()
      }
    };
    if (cleanDoc.length === 11 || cleanDoc.length === 14) {
      body.cardholder.identification = {
        type: cleanDoc.length === 14 ? 'CNPJ' : 'CPF',
        number: cleanDoc
      };
    }
    const resp = await fetch(`https://api.mercadopago.com/v1/card_tokens?public_key=${encodeURIComponent(publicKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok && data?.id) {
      return String(data.id);
    }
  } catch (err) {
    console.warn('[MP Card Token fallback]:', err.message);
  }
  return null;
}

async function tokenizeAndSaveCard({
  clientId,
  clientPhone,
  cardNumber,
  holderName,
  expMonth,
  expYear,
  cvv,
  cardType,
  mpCardToken,
  holderDocument
}) {
  await ensureExtendedSchema();
  const cardId = `card-${Date.now()}`;
  const now = new Date().toISOString();

  let cardObj;
  const digits = String(cardNumber || '').replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) {
    throw new Error('Número de cartão inválido.');
  }
  if (!cvv || String(cvv).replace(/\D/g, '').length < 3) {
    throw new Error('Código de segurança (CVV) inválido.');
  }
  const last4 = digits.slice(-4);
  const brand = detectCardBrand(digits);

  // Quando MERCADOPAGO_PUBLIC_KEY estiver configurada (ou token do SDK enviado pelo browser), registra token real no MP
  const realMpToken = String(mpCardToken || '').trim() || await createMpCardTokenServer({
    cardNumber: digits,
    holderName,
    expMonth,
    expYear,
    cvv,
    holderDoc: holderDocument
  });

  // Token opaco do gateway — nunca armazena número completo nem CVV
  const gatewayToken = realMpToken
    ? `mp_tok_${realMpToken}`
    : `tok_${brand.toLowerCase()}_${last4}_${crypto.randomBytes(8).toString('hex')}`;

  cardObj = {
    id: cardId,
    clientId: clientId || '',
    clientPhone: clientPhone || '',
    brand,
    last4,
    holderName: String(holderName || 'TITULAR DO CARTAO').toUpperCase().trim(),
    expMonth: String(expMonth || '12').padStart(2, '0'),
    expYear: String(expYear || '2030').slice(-4),
    cardType: cardType === 'cartao_debito' ? 'cartao_debito' : 'cartao_credito',
    gatewayToken,
    isDefault: true,
    createdAt: now
  };

  if (!db.pool) {
    db.localStore.saved_cards.unshift({
      id: cardObj.id,
      client_id: cardObj.clientId,
      client_phone: cardObj.clientPhone,
      brand: cardObj.brand,
      last4: cardObj.last4,
      holder_name: cardObj.holderName,
      exp_month: cardObj.expMonth,
      exp_year: cardObj.expYear,
      card_type: cardObj.cardType,
      gateway_token: cardObj.gatewayToken,
      is_default: true,
      created_at: now
    });
    db.saveLocalStore();
    return cardObj;
  }

  await db.query(
    `INSERT INTO public.saved_cards (
      id, client_id, client_phone, brand, last4, holder_name, exp_month, exp_year, card_type, gateway_token, is_default, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,NOW())`,
    [
      cardObj.id, cardObj.clientId, cardObj.clientPhone, cardObj.brand, cardObj.last4,
      cardObj.holderName, cardObj.expMonth, cardObj.expYear, cardObj.cardType, cardObj.gatewayToken
    ]
  );
  return cardObj;
}

// ============================================================
// Processamento Financeiro das Corridas (Pix, Cartão, Dinheiro)
// ============================================================
async function createPixChargeForRide(ride) {
  const cfg = await getSystemConfig();
  const effectivePixPct = ride.commissionPercent ?? resolveCommissionPercentForRide(cfg, null, 'pix');
  const split = calculateSplit(ride.totalPrice, effectivePixPct, resolveCommissionFixedForRide(cfg, ride));
  const txid = `KV${String(ride.id || '').replace(/[^a-zA-Z0-9]/g, '')}${Date.now().toString().slice(-4)}`.slice(0, 25);

  let pixCopyPaste = generateDynamicPixPayload({
    key: cfg.pixKey || 'contato@kavrodrive.com.br',
    beneficiaryName: cfg.pixBeneficiary || cfg.companyName || 'KAVRO DRIVE',
    city: cfg.driverCarCity || 'BRASIL',
    amount: split.grossAmount,
    txid
  });
  let pixQrCode = getQrCodeUrl(pixCopyPaste, 260);
  let gatewayTxId = `pix_${ride.id}_${Date.now()}`;
  let pixExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  if (await efiBankGateway.isEfiPixActive()) {
    let payerCpf = '';
    if (ride.clientId) {
      try {
        const cliR = await db.query('SELECT document FROM public.clients WHERE id = $1 LIMIT 1', [ride.clientId]);
        payerCpf = String(cliR.rows[0]?.document || '');
      } catch {}
    }
    const drv = ride.driverId ? await getDriverById(ride.driverId).catch(() => null) : null;
    const efiPix = await efiBankGateway.createPixCharge({
      amountBrl: split.grossAmount,
      txidPrefix: 'KVRIDE',
      entityId: ride.id,
      payerName: ride.clientName || 'Passageiro Kavro',
      payerCpf,
      description: `Corrida Kavro Drive ${ride.rideCode || ride.id}`,
      split:
        drv && drv.efiAccountId
          ? {
              commissionPercent: split.commissionPercent,
              driverPercent: round2(100 - split.commissionPercent),
              driverCpf: drv.document,
              driverEfiAccountId: drv.efiAccountId,
              description: `Split Corrida ${ride.rideCode || ride.id} - ${drv.name}`
            }
          : null,
      qrFallbackGenerator: getQrCodeUrl
    });
    if (!efiPix.pixCopyPaste && !efiPix.pixQrCode) {
      throw new Error('Efí Bank não retornou QR Code PIX válido. Verifique sua chave PIX e certificado mTLS.');
    }
    pixCopyPaste = efiPix.pixCopyPaste || pixCopyPaste;
    pixQrCode = efiPix.pixQrCode || getQrCodeUrl(pixCopyPaste, 260);
    gatewayTxId = efiPix.txid;
    pixExpiresAt = efiPix.expiresAt || pixExpiresAt;
  } else if (env.MERCADOPAGO_ACCESS_TOKEN) {
    try {
      const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
          'X-Idempotency-Key': `mp_pix_${ride.id}_${split.grossAmount}`
        },
        body: JSON.stringify({
          transaction_amount: split.grossAmount,
          description: `Corrida Kavro Drive ${ride.rideCode || ride.id}`,
          payment_method_id: 'pix',
          external_reference: ride.id,
          payer: {
            email: 'passageiro@kavrodrive.com.br',
            first_name: ride.clientName || 'Passageiro'
          }
        })
      });
      if (mpRes.ok) {
        const mpData = await mpRes.json();
        const qrData = mpData?.point_of_interaction?.transaction_data;
        if (qrData?.qr_code) {
          pixCopyPaste = qrData.qr_code;
          pixQrCode = qrData.qr_code_base64
            ? `data:image/png;base64,${qrData.qr_code_base64}`
            : getQrCodeUrl(pixCopyPaste, 260);
          gatewayTxId = String(mpData.id);
        }
      }
    } catch (err) {
      console.warn('[MP Pix Create fallback]:', err.message);
    }
  }

  const tx = await savePaymentTransaction({
    rideId: ride.id,
    rideCode: ride.rideCode ? String(ride.rideCode).replace(/^#?\s*UP\b/i, '#KV') : `#KV - ${String(ride.rideNumber || 1).padStart(3, '0')}`,
    driverId: ride.driverId || null,
    driverName: ride.driverName || null,
    clientId: ride.clientId || null,
    clientName: ride.clientName,
    method: 'pix',
    status: 'aguardando',
    estimatedAmount: split.grossAmount,
    finalAmount: split.grossAmount,
    paidAmount: 0,
    commissionPercent: split.commissionPercent,
    commissionAmount: split.commissionAmount,
    driverNetAmount: split.driverNetAmount,
    pixQrCode,
    pixCopyPaste,
    pixExpiresAt,
    gatewayTxId
  });

  return { tx, split };
}

async function authorizeCardForRide(ride, cardInfo = {}) {
  const cfg = await getSystemConfig();
  const effectiveCommPct = ride.commissionPercent ?? resolveCommissionPercentForRide(cfg, null, ride.paymentMethod || 'cartao_credito');
  const split = calculateSplit(ride.totalPrice, effectiveCommPct, resolveCommissionFixedForRide(cfg, ride));
  const last4 = String(cardInfo.cardLast4 || ride.cardLast4 || '4242');
  const brand = String(cardInfo.cardBrand || ride.cardBrand || 'Mastercard');

  // Simula recusa de gateway se o cartão terminar em 0000
  if (last4 === '0000') {
    const failedTx = await savePaymentTransaction({
      rideId: ride.id,
      rideCode: ride.rideCode,
      clientId: ride.clientId,
      clientName: ride.clientName,
      method: ride.paymentMethod || 'cartao_credito',
      status: 'falhou',
      estimatedAmount: split.grossAmount,
      finalAmount: split.grossAmount,
      paidAmount: 0,
      commissionPercent: split.commissionPercent,
      commissionAmount: split.commissionAmount,
      driverNetAmount: split.driverNetAmount,
      cardId: cardInfo.cardId || ride.cardId || '',
      cardLast4: last4,
      cardBrand: brand,
      failureReason: 'Transação não autorizada pelo emissor do cartão.',
      gatewayTxId: `card_fail_${ride.id}_${Date.now()}`
    });
    return { authorized: false, tx: failedTx, split, error: 'Cartão recusado pelo banco emissor. Escolha outro cartão ou PIX.' };
  }

  // Busca token real salvo ou enviado no checkout para pré-autorização
  let savedCard = null;
  if (cardInfo.cardId || ride.cardId) {
    const cards = await listSavedCards(ride.clientId, ride.clientPhone);
    savedCard = cards.find(c => c.id === (cardInfo.cardId || ride.cardId)) || null;
  }

  const rawTokenCandidate = String(cardInfo.mpCardToken || savedCard?.gatewayToken || '').trim();
  const realMpToken = rawTokenCandidate.startsWith('mp_tok_')
    ? rawTokenCandidate.slice('mp_tok_'.length)
    : (!rawTokenCandidate.startsWith('tok_') && rawTokenCandidate.length >= 16 ? rawTokenCandidate : '');

  if (env.MERCADOPAGO_ACCESS_TOKEN && realMpToken) {
    try {
      const mpResp = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
          'X-Idempotency-Key': `mp_card_auth_${ride.id}_${split.grossAmount}`
        },
        body: JSON.stringify({
          transaction_amount: split.grossAmount,
          token: realMpToken,
          description: `Corrida Kavro Drive ${ride.rideCode || ride.id}`,
          installments: 1,
          capture: false,
          payment_method_id: mapMpPaymentMethodId(savedCard?.brand || brand, ride.paymentMethod),
          external_reference: ride.id,
          payer: {
            email: ride.clientEmail || 'passageiro@kavrodrive.com.br',
            first_name: String(ride.clientName || 'Passageiro').split(' ')[0]
          }
        })
      });
      const mpData = await mpResp.json().catch(() => ({}));
      const mpStatus = String(mpData?.status || '').toLowerCase();
      if (!mpResp.ok || mpStatus === 'rejected' || mpStatus === 'cancelled') {
        const reason = mpData?.status_detail || mpData?.message || 'Transação recusada pelo emissor no Mercado Pago.';
        const failedTx = await savePaymentTransaction({
          rideId: ride.id,
          rideCode: ride.rideCode,
          clientId: ride.clientId,
          clientName: ride.clientName,
          method: ride.paymentMethod || 'cartao_credito',
          status: 'falhou',
          estimatedAmount: split.grossAmount,
          finalAmount: split.grossAmount,
          paidAmount: 0,
          commissionPercent: split.commissionPercent,
          commissionAmount: split.commissionAmount,
          driverNetAmount: split.driverNetAmount,
          cardId: cardInfo.cardId || ride.cardId || '',
          cardLast4: savedCard?.last4 || last4,
          cardBrand: savedCard?.brand || brand,
          failureReason: String(reason),
          gatewayTxId: mpData?.id ? String(mpData.id) : `card_mp_fail_${ride.id}_${Date.now()}`
        });
        return { authorized: false, tx: failedTx, split, error: `Cartão recusado (${reason}). Tente outro cartão ou PIX.` };
      }

      const authCode = String(mpData?.authorization_code || `MP-${mpData.id || Date.now()}`);
      const tx = await savePaymentTransaction({
        rideId: ride.id,
        rideCode: ride.rideCode,
        driverId: ride.driverId || null,
        driverName: ride.driverName || null,
        clientId: ride.clientId || null,
        clientName: ride.clientName,
        method: ride.paymentMethod || 'cartao_credito',
        status: 'autorizado',
        estimatedAmount: split.grossAmount,
        finalAmount: split.grossAmount,
        paidAmount: 0,
        commissionPercent: split.commissionPercent,
        commissionAmount: split.commissionAmount,
        driverNetAmount: split.driverNetAmount,
        cardId: cardInfo.cardId || ride.cardId || '',
        cardLast4: savedCard?.last4 || last4,
        cardBrand: savedCard?.brand || brand,
        gatewayAuthCode: authCode,
        gatewayTxId: String(mpData.id)
      });
      return { authorized: true, tx, split, provider: 'mercadopago' };
    } catch (err) {
      console.warn('[MP Card PreAuth error]:', err.message);
    }
  }

  const authCode = `AUTH-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const tx = await savePaymentTransaction({
    rideId: ride.id,
    rideCode: ride.rideCode,
    driverId: ride.driverId || null,
    driverName: ride.driverName || null,
    clientId: ride.clientId || null,
    clientName: ride.clientName,
    method: ride.paymentMethod || 'cartao_credito',
    status: 'autorizado',
    estimatedAmount: split.grossAmount,
    finalAmount: split.grossAmount,
    paidAmount: 0,
    commissionPercent: split.commissionPercent,
    commissionAmount: split.commissionAmount,
    driverNetAmount: split.driverNetAmount,
    cardId: cardInfo.cardId || ride.cardId || '',
    cardLast4: savedCard?.last4 || last4,
    cardBrand: savedCard?.brand || brand,
    gatewayAuthCode: authCode,
    gatewayTxId: `card_auth_${ride.id}_${Date.now()}`
  });

  return { authorized: true, tx, split, provider: 'sandbox' };
}

async function captureCardForRide(ride, finalAmount) {
  const tx = await getPaymentTxByRide(ride.id);
  const amount = round2(finalAmount ?? ride.totalPrice);
  const gwId = String(tx?.gatewayTxId || '');
  const isRealMpId = Boolean(env.MERCADOPAGO_ACCESS_TOKEN && gwId && /^\d+$/.test(gwId));
  if (isRealMpId) {
    try {
      const capResp = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(tx.gatewayTxId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`
        },
        body: JSON.stringify({
          capture: true,
          transaction_amount: amount
        })
      });
      const capData = await capResp.json().catch(() => ({}));
      if (!capResp.ok || (capData.status && capData.status !== 'approved')) {
        return {
          captured: false,
          error: capData?.message || capData?.status_detail || 'Falha ao capturar pré-autorização do cartão no Mercado Pago.'
        };
      }
      return { captured: true, gatewayTxId: String(capData.id || tx.gatewayTxId), provider: 'mercadopago' };
    } catch (err) {
      console.warn('[MP Card Capture fallback/error]:', err.message);
    }
  }
  return { captured: true, gatewayTxId: tx?.gatewayTxId || `card_cap_${ride.id}_${Date.now()}`, provider: 'sandbox' };
}

async function refundGatewayPayment(tx, refundAmount = null) {
  const gwId = String(tx?.gatewayTxId || '');
  const isRealMpId = Boolean(env.MERCADOPAGO_ACCESS_TOKEN && gwId && /^\d+$/.test(gwId));
  if (!isRealMpId) return { ok: true, provider: 'sandbox' };
  try {
    const body = refundAmount ? { amount: round2(refundAmount) } : {};
    const resp = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(tx.gatewayTxId)}/refunds`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
        'X-Idempotency-Key': `mp_refund_${tx.id}_${refundAmount || 'full'}`
      },
      body: JSON.stringify(body)
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false, error: data?.message || `Falha no estorno Mercado Pago (HTTP ${resp.status})` };
    }
    return { ok: true, provider: 'mercadopago', refundId: data.id };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Registra no Livro-Razão o crédito digital (Pix ou Cartão capturado) para o motorista + comissão da plataforma
async function settleDigitalRideToLedger(ride, finalAmountOverride = null) {
  if (!ride || !ride.driverId) return null;
  const cfg = await getSystemConfig();
  const finalGross = finalAmountOverride !== null ? round2(finalAmountOverride) : round2(ride.totalPrice);
  const split = calculateSplit(
    finalGross,
    ride.commissionPercent ?? resolveCommissionPercentForRide(cfg, null, ride.paymentMethod),
    resolveCommissionFixedForRide(cfg, ride)
  );

  // Verifica se o motorista possuía dívida anterior para registrar nota de compensação automática
  const walletBefore = await getDriverWallet(ride.driverId);

  const settlementBucket =
    ['cartao_credito', 'cartao_debito', 'apple_pay'].includes(ride.paymentMethod) &&
    Number(cfg.cardSettlementDays || 0) > 0
      ? 'pending'
      : 'available';
  const entryStatus = settlementBucket === 'pending' ? 'pendente_liberacao' : 'confirmado';

  const commFormulaLabel = split.commissionFixed > 0
    ? `${split.commissionPercent}% + R$ ${split.commissionFixed.toFixed(2)}`
    : `${split.commissionPercent}%`;

  // 1. Crédito líquido do motorista
  const { entry: driverEntry, idempotent } = await recordLedgerEntry({
    idempotencyKey: `ride_credit_${ride.id}_${ride.driverId}`,
    driverId: ride.driverId,
    driverName: ride.driverName || 'Motorista',
    rideId: ride.id,
    rideCode: ride.rideCode || ride.id,
    clientId: ride.clientId || null,
    clientName: ride.clientName,
    entryType: 'ride_earning_credit',
    paymentMethod: ride.paymentMethod,
    grossAmount: split.grossAmount,
    commissionPercent: split.commissionPercent,
    commissionAmount: split.commissionAmount,
    driverNetAmount: split.driverNetAmount,
    balanceDelta: +split.driverNetAmount,
    balanceBucket: settlementBucket,
    status: entryStatus,
    description: `Ganho líquido corrida ${ride.rideCode || ride.id} (${ride.paymentMethod.toUpperCase()}) — Bruto R$ ${split.grossAmount.toFixed(2)} (-${commFormulaLabel} comissão)`,
    metadata: {
      autoSplit: true,
      commissionFixed: split.commissionFixed,
      debtOffsetApplied: walletBefore.debtBalance > 0 ? Math.min(walletBefore.debtBalance, split.driverNetAmount) : 0
    }
  });

  // 2. Registro da comissão da plataforma no livro-razão
  await recordLedgerEntry({
    idempotencyKey: `platform_comm_${ride.id}`,
    driverId: ride.driverId,
    driverName: ride.driverName || 'Motorista',
    rideId: ride.id,
    rideCode: ride.rideCode || ride.id,
    clientId: ride.clientId || null,
    clientName: ride.clientName,
    entryType: 'platform_commission',
    paymentMethod: ride.paymentMethod,
    grossAmount: split.grossAmount,
    commissionPercent: split.commissionPercent,
    commissionAmount: split.commissionAmount,
    driverNetAmount: split.driverNetAmount,
    balanceDelta: 0, // Já descontado no valor líquido creditado via split
    balanceBucket: 'platform',
    status: 'confirmado',
    description: `Comissão Kavro Drive (${commFormulaLabel}) retida via split na corrida ${ride.rideCode || ride.id}`
  });

  return { driverEntry, split, idempotent };
}

// Registra confirmação de corrida em DINHEIRO e lança débito da comissão no saldo do motorista (Modelo Uber)
async function settleCashRideToLedger(ride, receivedAmount, resolutionType = 'confirmado') {
  const cfg = await getSystemConfig();
  const driverId = ride.driverId || 'drv-1001';
  const driverName = ride.driverName || cfg.driverName || 'Motorista';
  const grossFare = round2(ride.totalPrice);
  const actualPaid = resolutionType === 'pendente' ? 0 : round2(receivedAmount ?? grossFare);
  const split = calculateSplit(
    grossFare,
    ride.commissionPercent ?? resolveCommissionPercentForRide(cfg, null, 'dinheiro'),
    resolveCommissionFixedForRide(cfg, ride)
  );

  const deductFromBalanceFirst = cfg.cashDeductFromBalanceFirst !== false;
  const walletBefore = await getDriverWallet(driverId);
  const availableBefore = Math.max(0, round2(walletBefore.availableBalance || 0));
  const deductedFromBalance = deductFromBalanceFirst
    ? round2(Math.min(availableBefore, split.commissionAmount))
    : 0;
  const addedToDebt = round2(Math.max(0, split.commissionAmount - deductedFromBalance));
  const commissionBucket = !deductFromBalanceFirst
    ? 'cash_debt'
    : (deductedFromBalance >= split.commissionAmount ? 'available' : 'debt');

  const cashFormulaLabel = split.commissionFixed > 0
    ? `${split.commissionPercent}% + R$ ${split.commissionFixed.toFixed(2)}`
    : `${split.commissionPercent}%`;

  const debitDescription = !deductFromBalanceFirst
    ? `Comissão Kavro Drive (${cashFormulaLabel} = R$ ${split.commissionAmount.toFixed(2)}) lançada no Saldo Devedor separado (sem abater Saldo Livre) ref. corrida em dinheiro ${ride.rideCode || ride.id}`
    : deductedFromBalance >= split.commissionAmount
      ? `Comissão Kavro Drive (${cashFormulaLabel} = R$ ${split.commissionAmount.toFixed(2)}) descontada do Saldo Livre ref. corrida em dinheiro ${ride.rideCode || ride.id}`
      : deductedFromBalance > 0
        ? `Comissão Kavro Drive (${cashFormulaLabel} = R$ ${split.commissionAmount.toFixed(2)}): R$ ${deductedFromBalance.toFixed(2)} descontado do Saldo Livre + R$ ${addedToDebt.toFixed(2)} no Saldo Devedor ref. corrida ${ride.rideCode || ride.id}`
        : `Comissão Kavro Drive (${cashFormulaLabel} = R$ ${split.commissionAmount.toFixed(2)}) lançada no Saldo Devedor ref. corrida em dinheiro ${ride.rideCode || ride.id}`;

  // 1. Registro informativo do valor recebido em espécie pelo motorista
  await recordLedgerEntry({
    idempotencyKey: `cash_received_${ride.id}`,
    driverId,
    driverName,
    rideId: ride.id,
    rideCode: ride.rideCode || ride.id,
    clientId: ride.clientId || null,
    clientName: ride.clientName,
    entryType: 'cash_ride_received',
    paymentMethod: 'dinheiro',
    grossAmount: actualPaid,
    commissionPercent: split.commissionPercent,
    commissionAmount: split.commissionAmount,
    driverNetAmount: round2(actualPaid - split.commissionAmount),
    balanceDelta: 0, // Dinheiro físico ficou diretamente na mão do motorista
    balanceBucket: 'available',
    status: 'confirmado',
    description: `Recebimento em Dinheiro na corrida ${ride.rideCode || ride.id} (Valor cobrado: R$ ${grossFare.toFixed(2)} | Recebido: R$ ${actualPaid.toFixed(2)})`
  });

  // 2. Débito automático da comissão da Kavro Drive
  const { entry: debitEntry } = await recordLedgerEntry({
    idempotencyKey: `cash_comm_debit_${ride.id}`,
    driverId,
    driverName,
    rideId: ride.id,
    rideCode: ride.rideCode || ride.id,
    clientId: ride.clientId || null,
    clientName: ride.clientName,
    entryType: 'cash_commission_debit',
    paymentMethod: 'dinheiro',
    grossAmount: grossFare,
    commissionPercent: split.commissionPercent,
    commissionAmount: split.commissionAmount,
    driverNetAmount: split.driverNetAmount,
    balanceDelta: -split.commissionAmount,
    balanceBucket: commissionBucket,
    status: 'confirmado',
    description: debitDescription,
    metadata: {
      uberCashAccounting: deductFromBalanceFirst,
      cashDeductFromBalanceFirst: deductFromBalanceFirst,
      availableBalanceBefore: availableBefore,
      deductedFromBalance,
      addedToDebt
    }
  });

  const paymentStatus =
    actualPaid <= 0
      ? 'pendente'
      : actualPaid < grossFare
        ? 'parcialmente_pago'
        : 'confirmado';

  const existingCashTx = await getPaymentTxByRide(ride.id);
  await savePaymentTransaction({
    ...(existingCashTx || {}),
    id: existingCashTx?.id,
    rideId: ride.id,
    rideCode: ride.rideCode || ride.id,
    driverId,
    driverName,
    clientId: ride.clientId || null,
    clientName: ride.clientName,
    method: 'dinheiro',
    status: paymentStatus,
    estimatedAmount: grossFare,
    finalAmount: grossFare,
    paidAmount: actualPaid,
    commissionPercent: split.commissionPercent,
    commissionAmount: split.commissionAmount,
    driverNetAmount: round2(actualPaid - split.commissionAmount),
    gatewayTxId: existingCashTx?.gatewayTxId || `cash_${ride.id}_${Date.now()}`
  });

  const updatedWallet = await getDriverWallet(driverId);
  return {
    paymentStatus,
    paidAmount: actualPaid,
    split,
    debitEntry,
    wallet: updatedWallet
  };
}

// Gera QR Code PIX para o motorista quitar saldo devedor com a plataforma
async function createDriverDebtSettlementPix(driverId, customAmount = null) {
  const cfg = await getSystemConfig();
  const wallet = await getDriverWallet(driverId);
  const amountToPay = customAmount ? round2(customAmount) : round2(wallet.debtBalance);
  if (amountToPay <= 0) {
    throw new Error('Você não possui dívidas pendentes com a plataforma.');
  }

  const txid = `DEBT${String(driverId).replace(/[^a-zA-Z0-9]/g, '')}${Date.now().toString().slice(-5)}`.slice(0, 25);
  if (await efiBankGateway.isEfiPixActive()) {
    const drv = await getDriverById(driverId).catch(() => null);
    const efiDebtPix = await efiBankGateway.createPixCharge({
      amountBrl: amountToPay,
      txidPrefix: 'KVDEBT',
      entityId: driverId,
      payerName: drv?.name || 'Motorista Parceiro Kavro',
      payerCpf: drv?.document || '',
      description: `Quitação saldo devedor Kavro (${driverId})`,
      qrFallbackGenerator: getQrCodeUrl
    });
    const finalQr = efiDebtPix.pixQrCode || getQrCodeUrl(efiDebtPix.pixCopyPaste, 240);
    await savePaymentTransaction({
      id: `tx_debt_${driverId}`,
      rideId: `DEBT_${driverId}`,
      rideCode: `QUIT-${String(driverId).slice(-6)}`,
      driverId,
      driverName: drv?.name || null,
      method: 'pix',
      status: 'aguardando',
      estimatedAmount: amountToPay,
      finalAmount: amountToPay,
      paidAmount: 0,
      commissionPercent: 0,
      commissionAmount: 0,
      driverNetAmount: 0,
      pixQrCode: finalQr,
      pixCopyPaste: efiDebtPix.pixCopyPaste,
      pixExpiresAt: efiDebtPix.expiresAt,
      gatewayTxId: efiDebtPix.txid
    });
    return {
      driverId,
      amount: amountToPay,
      txid: efiDebtPix.txid,
      gatewayTxId: efiDebtPix.txid,
      pixCopyPaste: efiDebtPix.pixCopyPaste,
      pixQrCode: finalQr,
      provider: 'efibank'
    };
  }

  const pixCopyPaste = generateDynamicPixPayload({
    key: cfg.pixKey || 'contato@kavrodrive.com.br',
    beneficiaryName: cfg.pixBeneficiary || 'KAVRO DRIVE',
    city: 'BRASIL',
    amount: amountToPay,
    txid
  });
  const pixQrCode = getQrCodeUrl(pixCopyPaste, 240);

  return {
    driverId,
    amount: amountToPay,
    txid,
    gatewayTxId: `debt_${txid}`,
    pixCopyPaste,
    pixQrCode,
    provider: 'sandbox'
  };
}

async function confirmDriverDebtSettlementWebhook({ driverId, amount, gatewayTxId }) {
  const driver = await getDriverById(driverId);
  const cleanAmount = round2(amount);
  if (cleanAmount <= 0) throw new Error('Valor de quitação inválido.');

  const walletBefore = await getDriverWallet(driverId);
  const separateDebt = Math.max(0, round2(walletBefore.separateDebtBalance || 0));
  const cashDebtPortion = separateDebt > 0 ? round2(Math.min(separateDebt, cleanAmount)) : 0;
  const remainingPortion = round2(cleanAmount - cashDebtPortion);
  const baseKey = `debt_settle_${driverId}_${gatewayTxId || Date.now()}`;

  let primaryResult = null;
  if (cashDebtPortion > 0) {
    primaryResult = await recordLedgerEntry({
      idempotencyKey: `${baseKey}_cash`,
      driverId,
      driverName: driver?.name || 'Motorista',
      entryType: 'debt_pix_settlement',
      paymentMethod: 'pix',
      grossAmount: cashDebtPortion,
      commissionPercent: 0,
      commissionAmount: 0,
      driverNetAmount: cashDebtPortion,
      balanceDelta: +cashDebtPortion,
      balanceBucket: 'cash_debt',
      status: 'confirmado',
      description: `Quitação de dívida em dinheiro via PIX confirmada pelo gateway (R$ ${cashDebtPortion.toFixed(2)})`
    });
  }

  if (remainingPortion > 0 || !primaryResult) {
    const resAvail = await recordLedgerEntry({
      idempotencyKey: baseKey,
      driverId,
      driverName: driver?.name || 'Motorista',
      entryType: 'debt_pix_settlement',
      paymentMethod: 'pix',
      grossAmount: remainingPortion > 0 ? remainingPortion : cleanAmount,
      commissionPercent: 0,
      commissionAmount: 0,
      driverNetAmount: remainingPortion > 0 ? remainingPortion : cleanAmount,
      balanceDelta: +(remainingPortion > 0 ? remainingPortion : cleanAmount),
      balanceBucket: 'available',
      status: 'confirmado',
      description: `Quitação de saldo devedor via PIX confirmada pelo gateway (R$ ${(remainingPortion > 0 ? remainingPortion : cleanAmount).toFixed(2)})`
    });
    if (!primaryResult) primaryResult = resAvail;
  }

  const wallet = await getDriverWallet(driverId);
  return { entry: primaryResult.entry, idempotent: primaryResult.idempotent, wallet };
}

// Aplica regra de estorno e multa de cancelamento (cancellationFeeAmount) no cancelamento da corrida
async function processRideCancellationFinance(before, { cancelledBy = 'passenger', waiveCancellationFee = false } = {}) {
  const cfg = await getSystemConfig();
  const id = before.id;
  const tx = await getPaymentTxByRide(id);
  const postAcceptStatuses = ['confirmada', 'na_fila', 'a_caminho', 'no_local', 'em_andamento'];
  const wasAccepted = Boolean(before.driverId && postAcceptStatuses.includes(before.status));
  const configuredCancelFee = round2(cfg.cancellationFeeAmount || 0);
  const isPassengerCancel = cancelledBy === 'passenger';

  const shouldChargeFee = Boolean(
    before.status !== 'cancelada' &&
    before.status !== 'finalizada' &&
    wasAccepted &&
    configuredCancelFee > 0 &&
    isPassengerCancel &&
    !waiveCancellationFee
  );

  const maxBillable = before.totalPrice > 0 ? round2(Math.min(before.totalPrice, configuredCancelFee)) : configuredCancelFee;
  const appliedCancellationFee = shouldChargeFee ? maxBillable : 0;

  let nextPaymentStatus = before.paymentStatus;
  let refundAmount = 0;
  let feeSplit = null;
  let savedTx = tx || null;

  const wasDigitalPaid = before.paymentStatus === 'confirmado' || before.paymentStatus === 'pago';
  const isUncapturedAuth = !wasDigitalPaid && (before.paymentStatus === 'autorizado' || tx?.status === 'autorizado');
  const isPendingGatewayTx =
    !wasDigitalPaid &&
    (isUncapturedAuth ||
      before.status === 'aguardando_pagamento' ||
      before.paymentStatus === 'aguardando' ||
      before.paymentStatus === 'pendente' ||
      tx?.status === 'aguardando' ||
      tx?.status === 'pendente');

  if (isPendingGatewayTx && appliedCancellationFee === 0) {
    if (tx && String(tx.gatewayTxId || '').startsWith('pi_')) {
      await refundGatewayPayment(tx, null).catch(() => {});
    }
    nextPaymentStatus = isUncapturedAuth ? 'reembolsado' : 'cancelado';
    if (tx) {
      savedTx = await savePaymentTransaction({
        ...tx,
        status: nextPaymentStatus,
        refundedAmount: isUncapturedAuth ? (tx.estimatedAmount || before.totalPrice || 0) : 0
      });
    }
  }

  if (wasDigitalPaid) {
    const totalPaid = round2(tx?.paidAmount || tx?.finalAmount || before.totalPrice || 0);
    const feeFromPaid = appliedCancellationFee > 0 ? round2(Math.min(totalPaid, appliedCancellationFee)) : 0;
    refundAmount = round2(Math.max(0, totalPaid - feeFromPaid));
    nextPaymentStatus = refundAmount > 0 ? 'reembolsado' : 'taxa_cancelamento';

    if ((before.paymentMethod === 'carteira' || tx?.method === 'carteira') && refundAmount > 0 && before.clientId) {
      await creditClientWalletAdjustment({
        clientId: before.clientId,
        clientName: before.clientName,
        clientPhone: before.clientPhone,
        rideId: before.id,
        rideCode: before.rideCode || before.id,
        amount: refundAmount,
        entryType: 'ride_refund',
        idempotencyKey: `wallet_ride_refund_${before.id}`,
        paymentMethod: 'carteira',
        description: `Estorno na carteira por cancelamento da corrida ${before.rideCode || before.id}`
      });
    }

    if (tx) {
      if (refundAmount > 0 && before.paymentMethod !== 'carteira' && tx.method !== 'carteira') {
        await refundGatewayPayment(tx, refundAmount);
      }
      savedTx = await savePaymentTransaction({
        ...tx,
        status: nextPaymentStatus,
        finalAmount: feeFromPaid > 0 ? feeFromPaid : tx.finalAmount,
        paidAmount: feeFromPaid > 0 ? feeFromPaid : tx.paidAmount,
        refundedAmount: refundAmount
      });
    }

    if (before.driverId) {
      const driverLedger = await listLedgerEntries(before.driverId);
      const existingCredit = driverLedger.find(
        e => e.rideId === id && e.entryType === 'ride_earning_credit' && e.status !== 'revertido'
      );
      if (existingCredit) {
        await recordLedgerEntry({
          idempotencyKey: `refund_cancel_${id}`,
          driverId: before.driverId,
          driverName: before.driverName || 'Motorista',
          rideId: id,
          rideCode: before.rideCode,
          clientId: before.clientId,
          clientName: before.clientName,
          entryType: 'refund_debit',
          paymentMethod: before.paymentMethod,
          grossAmount: totalPaid,
          commissionPercent: existingCredit.commissionPercent || before.commissionPercent || 20,
          commissionAmount: existingCredit.commissionAmount || before.commissionAmount || 0,
          driverNetAmount: existingCredit.driverNetAmount || before.driverNetAmount || 0,
          balanceDelta: -(existingCredit.driverNetAmount || before.driverNetAmount || 0),
          balanceBucket: 'available',
          status: 'confirmado',
          description: `Estorno por cancelamento da corrida ${before.rideCode || id}`
        });
      }
    }
  }

  if (appliedCancellationFee > 0 && before.driverId) {
    const commPct = before.commissionPercent ?? resolveCommissionPercentForRide(cfg, null, before.paymentMethod);
    feeSplit = calculateSplit(appliedCancellationFee, commPct);

    if (!wasDigitalPaid) {
      const isCardMethod = ['cartao_credito', 'cartao_debito', 'apple_pay'].includes(before.paymentMethod);
      let capturedGatewayId = tx?.gatewayTxId || `cancel_fee_${id}`;
      if (isCardMethod && before.paymentStatus === 'autorizado') {
        const cap = await captureCardForRide(before, appliedCancellationFee);
        if (cap.captured && cap.gatewayTxId) capturedGatewayId = cap.gatewayTxId;
      }

      nextPaymentStatus = before.paymentMethod === 'dinheiro' ? 'pendente' : 'taxa_cancelamento';
      savedTx = await savePaymentTransaction({
        ...(tx || {}),
        rideId: id,
        rideCode: before.rideCode || id,
        driverId: before.driverId,
        driverName: before.driverName || 'Motorista',
        clientId: before.clientId || null,
        clientName: before.clientName,
        method: before.paymentMethod || 'dinheiro',
        status: nextPaymentStatus,
        estimatedAmount: before.estimatedPrice || before.totalPrice || appliedCancellationFee,
        finalAmount: appliedCancellationFee,
        paidAmount: before.paymentMethod === 'dinheiro' ? 0 : appliedCancellationFee,
        commissionPercent: feeSplit.commissionPercent,
        commissionAmount: feeSplit.commissionAmount,
        driverNetAmount: feeSplit.driverNetAmount,
        gatewayTxId: capturedGatewayId
      });
    }

    await recordLedgerEntry({
      idempotencyKey: `cancel_fee_credit_${id}`,
      driverId: before.driverId,
      driverName: before.driverName || 'Motorista',
      rideId: id,
      rideCode: before.rideCode || id,
      clientId: before.clientId || null,
      clientName: before.clientName,
      entryType: 'cancellation_fee_credit',
      paymentMethod: before.paymentMethod || 'dinheiro',
      grossAmount: appliedCancellationFee,
      commissionPercent: feeSplit.commissionPercent,
      commissionAmount: feeSplit.commissionAmount,
      driverNetAmount: feeSplit.driverNetAmount,
      balanceDelta: +feeSplit.driverNetAmount,
      balanceBucket: 'available',
      status: 'confirmado',
      description: `Compensação por multa de cancelamento pós-aceite na corrida ${before.rideCode || id} (Multa R$ ${appliedCancellationFee.toFixed(2)} • Líquido motorista R$ ${feeSplit.driverNetAmount.toFixed(2)})`,
      metadata: {
        cancellationFeeApplied: appliedCancellationFee,
        cancelledBy
      }
    });
  }

  return {
    appliedCancellationFee,
    refundAmount,
    feeSplit,
    nextPaymentStatus,
    transactionId: savedTx?.id || null
  };
}

// ============================================================
// Resumo Financeiro Geral para o Painel Administrativo Master
// ============================================================
async function getPlatformFinancialOverview() {
  const cfg = await getSystemConfig();
  const commPctDefault = Number(cfg.platformCommissionPercent ?? 20);
  const commFixedDefault = round2(Math.max(0, Number(cfg.platformCommissionFixed ?? 0)));
  const drivers = await listDrivers();
  let transactions = await listPaymentTransactions();

  // Garante conciliação automática de todas as corridas registradas no sistema
  try {
    const ridesRes = await db.query('SELECT * FROM rides ORDER BY created_at DESC');
    const existingRideIds = new Set(transactions.map(t => t.rideId));
    for (const r of (ridesRes.rows || [])) {
      if (!r || !r.id || existingRideIds.has(r.id)) continue;
      const gross = round2(r.total_price ?? r.totalPrice ?? 0);
      if (gross <= 0) continue;
      const split = calculateSplit(gross, r.commission_percent ?? commPctDefault, resolveCommissionFixedForRide(cfg, r));
      const method = r.payment_method || r.paymentMethod || 'pix';
      const rawPayStatus = r.payment_status || r.paymentStatus || (r.status === 'finalizada' ? 'confirmado' : 'aguardando');
      const normalizedStatus = rawPayStatus === 'pago' ? 'confirmado' : rawPayStatus;
      const drvId = r.driver_id || r.driverId || (drivers[0] ? drivers[0].id : 'drv-1001');
      const drvName = r.driver_name || r.driverName || (drivers[0] ? drivers[0].name : 'Alisson Santos');

      await savePaymentTransaction({
        id: `tx-sync-${r.id}`,
        rideId: r.id,
        rideCode: r.ride_code ? String(r.ride_code).replace(/^#?\s*UP\b/i, '#KV') : `#KV - ${String(r.ride_number || 1).padStart(3, '0')}`,
        driverId: drvId,
        driverName: drvName,
        clientId: r.client_id || null,
        clientName: r.client_name || 'Passageiro',
        method,
        status: normalizedStatus,
        estimatedAmount: gross,
        finalAmount: gross,
        paidAmount: (normalizedStatus === 'confirmado' || normalizedStatus === 'parcialmente_pago') ? gross : 0,
        commissionPercent: split.commissionPercent,
        commissionAmount: split.commissionAmount,
        driverNetAmount: split.driverNetAmount,
        gatewayTxId: `gw_sync_${r.id}`,
        createdAt: r.created_at || new Date().toISOString()
      });
    }
    transactions = await listPaymentTransactions();
  } catch (e) {
    // continua normalmente
  }

  const ledger = await listLedgerEntries();
  const withdrawals = await listWithdrawals();
  const driverWallets = await Promise.all(drivers.map(d => getDriverWallet(d.id)));

  let totalGrossVolume = 0;
  let totalPlatformCommission = 0;
  let totalPixVolume = 0;
  let totalCardVolume = 0;
  let totalCashVolume = 0;
  let totalRefunded = 0;

  for (const tx of transactions) {
    if (tx.status === 'confirmado' || tx.status === 'pago' || tx.status === 'parcialmente_pago') {
      const val = tx.paidAmount || tx.finalAmount;
      totalGrossVolume += val;
      totalPlatformCommission += tx.commissionAmount;
      if (tx.method === 'pix') totalPixVolume += val;
      else if (tx.method === 'dinheiro') totalCashVolume += val;
      else totalCardVolume += val;
    }
    if (tx.status === 'reembolsado') {
      totalRefunded += (tx.refundedAmount || tx.finalAmount);
    }
  }

  const totalPendingDriverDebt = driverWallets.reduce((acc, w) => acc + w.debtBalance, 0);
  const totalAvailableForDrivers = driverWallets.reduce((acc, w) => acc + w.availableBalance, 0);
  const delinquentDriversCount = driverWallets.filter(w => w.isDelinquent).length;

  return {
    commissionPercent: commPctDefault,
    commissionFixed: commFixedDefault,
    paymentMethodCommissionPercents: cfg.paymentMethodCommissionPercents || {
      pix: commPctDefault,
      cartao_credito: commPctDefault,
      cartao_debito: commPctDefault,
      apple_pay: commPctDefault,
      dinheiro: commPctDefault
    },
    gatewayFeePercents: cfg.gatewayFeePercents || {
      pix: 0,
      cartao_credito: 0,
      cartao_debito: 0,
      apple_pay: 0
    },
    withdrawalFeePercent: Number(cfg.withdrawalFeePercent ?? 0),
    withdrawalFeeFixed: Number(cfg.withdrawalFeeFixed ?? 0),
    cancellationFeeAmount: Number(cfg.cancellationFeeAmount ?? 0),
    cardSettlementDays: Number(cfg.cardSettlementDays ?? 0),
    autoSplitPixEnabled: cfg.autoSplitPixEnabled !== false,
    useCategoryCommissionOverride: Boolean(cfg.useCategoryCommissionOverride),
    cashDeductFromBalanceFirst: cfg.cashDeductFromBalanceFirst !== false,
    maxDriverDebtLimit: Number(cfg.maxDriverDebtLimit ?? 100),
    autoBlockDelinquentDrivers: cfg.autoBlockDelinquentDrivers !== false,
    minWithdrawalAmount: Number(cfg.minWithdrawalAmount ?? 20),
    driverWithdrawalEnabled: cfg.driverWithdrawalEnabled !== false,
    driverWithdrawalWeekdays: normalizeWithdrawalWeekdays(cfg.driverWithdrawalWeekdays),
    totalGrossVolume: round2(totalGrossVolume),
    totalPlatformCommission: round2(totalPlatformCommission),
    totalPixVolume: round2(totalPixVolume),
    totalCardVolume: round2(totalCardVolume),
    totalCashVolume: round2(totalCashVolume),
    totalRefunded: round2(totalRefunded),
    totalPendingDriverDebt: round2(totalPendingDriverDebt),
    totalAvailableForDrivers: round2(totalAvailableForDrivers),
    delinquentDriversCount,
    driverWallets,
    transactions,
    withdrawals,
    ledger: ledger.slice(0, 300)
  };
}

// ============================================================
// Aceite Atômico de Corrida (Evita Race Condition entre 2 Motoristas)
// ============================================================
async function claimRideAtomically({ rideId, driver, newStatus, isQueued }) {
  await ensureExtendedSchema();
  const driverVehicle = `${driver.vehicleBrand || ''} ${driver.vehicleModel || ''}`.trim();

  if (!db.pool) {
    const idx = db.localStore.rides.findIndex(r => r.id === rideId);
    if (idx < 0) return { ok: false, status: 404, error: 'Corrida não encontrada.' };
    const existing = db.localStore.rides[idx];
    if (existing.status === 'aguardando_pagamento') {
      return { ok: false, status: 400, error: 'Esta corrida PIX ainda aguarda confirmação do gateway.' };
    }
    if (existing.driver_id && existing.driver_id !== driver.id && existing.status !== 'aguardando_confirmacao') {
      return { ok: false, status: 409, error: 'Outro motorista já aceitou esta corrida.' };
    }
    db.localStore.rides[idx] = {
      ...existing,
      driver_id: driver.id,
      driver_name: driver.name,
      driver_phone: driver.phone,
      driver_photo: driver.photo || '',
      driver_vehicle: driverVehicle,
      driver_plate: driver.vehiclePlate,
      driver_car_color: driver.vehicleColor,
      driver_rating: driver.rating || 5.0,
      driver_location: driver.location || existing.driver_location || null,
      is_queued_ride: Boolean(isQueued),
      queued_for_driver_id: isQueued ? driver.id : null,
      status: newStatus,
      updated_at: new Date().toISOString()
    };
    db.saveLocalStore();
    return { ok: true, row: db.localStore.rides[idx] };
  }

  const pgClient = await db.pool.connect();
  try {
    await pgClient.query('BEGIN');
    const lockRes = await pgClient.query('SELECT * FROM public.rides WHERE id = $1 FOR UPDATE', [rideId]);
    const existing = lockRes.rows[0];
    if (!existing) {
      await pgClient.query('ROLLBACK');
      return { ok: false, status: 404, error: 'Corrida não encontrada.' };
    }
    if (existing.status === 'aguardando_pagamento') {
      await pgClient.query('ROLLBACK');
      return { ok: false, status: 400, error: 'Esta corrida PIX ainda aguarda confirmação do gateway.' };
    }
    if (existing.driver_id && existing.driver_id !== driver.id && existing.status !== 'aguardando_confirmacao') {
      await pgClient.query('ROLLBACK');
      return { ok: false, status: 409, error: 'Outro motorista já aceitou esta corrida.' };
    }

    const upd = await pgClient.query(
      `UPDATE public.rides
       SET driver_id = $2,
           driver_name = $3,
           driver_phone = $4,
           driver_photo = $5,
           driver_vehicle = $6,
           driver_plate = $7,
           driver_car_color = $8,
           driver_rating = $9,
           driver_location = $10,
           is_queued_ride = $11,
           queued_for_driver_id = $12,
           status = $13,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        rideId,
        driver.id,
        driver.name,
        driver.phone,
        driver.photo || '',
        driverVehicle,
        driver.vehiclePlate,
        driver.vehicleColor,
        driver.rating || 5.0,
        driver.location ? JSON.stringify(driver.location) : (existing.driver_location ? JSON.stringify(existing.driver_location) : null),
        Boolean(isQueued),
        isQueued ? driver.id : null,
        newStatus
      ]
    );
    await pgClient.query('COMMIT');
    return { ok: true, row: upd.rows[0] };
  } catch (err) {
    await pgClient.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    pgClient.release();
  }
}

// ============================================================
// Persistência Unificada do SOS (PostgreSQL + LocalStore)
// ============================================================
function formatSosRow(row) {
  if (!row) return null;
  const updatedAt = row.updated_at || row.updatedAt || row.created_at || row.createdAt || new Date().toISOString();
  const createdAt = row.created_at || row.createdAt || updatedAt;
  const active = row.active !== undefined ? Boolean(row.active) : row.status !== 'resolvido';
  return {
    id: row.id,
    role: row.role || 'passageiro',
    status: row.status || (active ? 'ativo' : 'resolvido'),
    name: row.name || 'Passageiro em Emergência',
    phone: row.phone || '',
    lat: Number(row.lat || 0),
    lng: Number(row.lng || 0),
    accuracy: Number(row.accuracy || 0),
    heading: Number(row.heading || 0),
    speedKmH: Number(row.speed_kmh ?? row.speedKmH ?? 0),
    address: row.address || '',
    rideId: row.ride_id ?? row.rideId ?? null,
    rideCode: row.ride_code ?? row.rideCode ?? null,
    driverId: row.driver_id ?? row.driverId ?? null,
    driverName: row.driver_name ?? row.driverName ?? null,
    driverPhone: row.driver_phone ?? row.driverPhone ?? null,
    driverVehicle: row.driver_vehicle ?? row.driverVehicle ?? null,
    driverPlate: row.driver_plate ?? row.driverPlate ?? null,
    notes: row.notes || undefined,
    active,
    createdAt: new Date(createdAt).toISOString(),
    updatedAt: new Date(updatedAt).toISOString(),
    updatedAtMs: new Date(updatedAt).getTime()
  };
}

async function listSosAlertsDb() {
  await ensureExtendedSchema();
  if (!db.pool) {
    const raw = db.localStore?.sos_alerts;
    const list = Array.isArray(raw) ? raw : Object.values(raw || {});
    return list.map(formatSosRow).filter(Boolean);
  }
  const r = await db.query('SELECT * FROM public.sos_alerts ORDER BY updated_at DESC LIMIT 200');
  return (r.rows || []).map(formatSosRow).filter(Boolean);
}

async function getSosAlertByIdDb(id) {
  await ensureExtendedSchema();
  if (!db.pool) {
    const raw = db.localStore?.sos_alerts;
    const list = Array.isArray(raw) ? raw : Object.values(raw || {});
    const found = list.find(s => s && s.id === id);
    return formatSosRow(found);
  }
  const r = await db.query('SELECT * FROM public.sos_alerts WHERE id = $1 LIMIT 1', [id]);
  return formatSosRow(r.rows[0]);
}

async function upsertSosAlertDb(alertData) {
  await ensureExtendedSchema();
  if (!db.pool) {
    if (!Array.isArray(db.localStore.sos_alerts)) {
      db.localStore.sos_alerts = Object.values(db.localStore.sos_alerts || {});
    }
    const idx = db.localStore.sos_alerts.findIndex(s => s && s.id === alertData.id);
    if (idx >= 0) db.localStore.sos_alerts[idx] = alertData;
    else db.localStore.sos_alerts.unshift(alertData);
    db.saveLocalStore();
    return formatSosRow(alertData);
  }

  const r = await db.query(
    `INSERT INTO public.sos_alerts (
      id, name, phone, lat, lng, accuracy, heading, speed_kmh, address, ride_id,
      role, status, notes, driver_id, driver_name, driver_phone, driver_vehicle, driver_plate, ride_code,
      active, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW())
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
      role = COALESCE(EXCLUDED.role, public.sos_alerts.role),
      status = COALESCE(EXCLUDED.status, public.sos_alerts.status),
      driver_id = COALESCE(EXCLUDED.driver_id, public.sos_alerts.driver_id),
      driver_name = COALESCE(EXCLUDED.driver_name, public.sos_alerts.driver_name),
      driver_phone = COALESCE(EXCLUDED.driver_phone, public.sos_alerts.driver_phone),
      driver_vehicle = COALESCE(EXCLUDED.driver_vehicle, public.sos_alerts.driver_vehicle),
      driver_plate = COALESCE(EXCLUDED.driver_plate, public.sos_alerts.driver_plate),
      ride_code = COALESCE(EXCLUDED.ride_code, public.sos_alerts.ride_code),
      active = EXCLUDED.active,
      updated_at = NOW()
    RETURNING *`,
    [
      alertData.id, alertData.name, alertData.phone, alertData.lat, alertData.lng,
      alertData.accuracy, alertData.heading, alertData.speedKmH, alertData.address, alertData.rideId,
      alertData.role || 'passageiro', alertData.status || 'ativo', alertData.notes || null,
      alertData.driverId || null, alertData.driverName || null, alertData.driverPhone || null,
      alertData.driverVehicle || null, alertData.driverPlate || null, alertData.rideCode || null,
      alertData.active !== false, alertData.createdAt || new Date().toISOString()
    ]
  );
  return formatSosRow(r.rows[0]);
}

async function updateSosStatusDb(id, { status = 'resolvido', active = false, notes }) {
  await ensureExtendedSchema();
  if (!db.pool) {
    if (!Array.isArray(db.localStore.sos_alerts)) {
      db.localStore.sos_alerts = Object.values(db.localStore.sos_alerts || {});
    }
    const idx = db.localStore.sos_alerts.findIndex(s => s && s.id === id);
    if (idx < 0) return null;
    const prev = db.localStore.sos_alerts[idx];
    const next = {
      ...prev,
      status,
      active,
      notes: notes !== undefined ? notes : prev.notes,
      updatedAt: new Date().toISOString(),
      updatedAtMs: Date.now()
    };
    db.localStore.sos_alerts[idx] = next;
    db.saveLocalStore();
    return formatSosRow(next);
  }

  const r = await db.query(
    `UPDATE public.sos_alerts
     SET status = $2,
         active = $3,
         notes = COALESCE($4, notes),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, status, active, notes !== undefined ? notes : null]
  );
  return formatSosRow(r.rows[0]);
}

// ============================================================
// Carteira Digital do Passageiro (Saldo, Depósito Mínimo R$ 20, Débito em Corridas e Estorno)
// ============================================================
function formatClientWalletEntryRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    idempotencyKey: r.idempotency_key || r.idempotencyKey,
    clientId: r.client_id || r.clientId,
    clientPhone: r.client_phone || r.clientPhone || undefined,
    clientName: r.client_name || r.clientName || undefined,
    entryType: r.entry_type || r.entryType,
    paymentMethod: r.payment_method || r.paymentMethod || 'pix',
    amount: round2(r.amount),
    balanceDelta: round2(r.balance_delta ?? r.balanceDelta ?? 0),
    status: r.status || 'confirmado',
    rideId: r.ride_id || r.rideId || null,
    rideCode: r.ride_code || r.rideCode || null,
    gatewayTxId: r.gateway_tx_id || r.gatewayTxId || null,
    pixQrCode: r.pix_qr_code || r.pixQrCode || undefined,
    pixCopyPaste: r.pix_copy_paste || r.pixCopyPaste || undefined,
    pixExpiresAt: r.pix_expires_at || r.pixExpiresAt || undefined,
    description: r.description || '',
    metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : (r.metadata || {}),
    createdAt: r.created_at || r.createdAt || new Date().toISOString(),
    updatedAt: r.updated_at || r.updatedAt || r.created_at || new Date().toISOString()
  };
}

async function recomputeClientWalletBalance(clientId, pgClient = null) {
  const cid = String(clientId || '').trim();
  if (!cid) return 0;
  if (!db.pool) {
    const entries = Array.isArray(db.localStore.client_wallet_entries) ? db.localStore.client_wallet_entries : [];
    const balance = round2(
      entries
        .filter(e => e.client_id === cid && e.status === 'confirmado')
        .reduce((acc, e) => acc + Number(e.balance_delta || 0), 0)
    );
    const cli = (db.localStore.clients || []).find(c => c.id === cid);
    if (cli) {
      cli.wallet_balance = balance;
      db.saveLocalStore();
    }
    return balance;
  }

  const executor = pgClient || db;
  const sumRes = await executor.query(
    `SELECT COALESCE(SUM(balance_delta), 0) AS bal
     FROM public.client_wallet_entries
     WHERE client_id = $1 AND status = 'confirmado'`,
    [cid]
  );
  const balance = round2(sumRes.rows[0]?.bal || 0);
  await executor.query(
    `UPDATE public.clients SET wallet_balance = $1 WHERE id = $2`,
    [balance, cid]
  ).catch(() => {});
  return balance;
}

async function listClientWalletEntries(clientId) {
  await ensureExtendedSchema();
  const cid = String(clientId || '').trim();
  if (!cid) return [];
  if (!db.pool) {
    const list = Array.isArray(db.localStore.client_wallet_entries) ? db.localStore.client_wallet_entries : [];
    return list
      .filter(e => e.client_id === cid)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      .map(formatClientWalletEntryRow);
  }
  const r = await db.query(
    'SELECT * FROM public.client_wallet_entries WHERE client_id = $1 ORDER BY created_at DESC LIMIT 200',
    [cid]
  );
  return (r.rows || []).map(formatClientWalletEntryRow);
}

async function findClientWalletEntryByGatewayTxId(gatewayTxId) {
  const gwId = String(gatewayTxId || '').trim();
  if (!gwId) return null;
  await ensureExtendedSchema();
  if (!db.pool) {
    const entries = Array.isArray(db.localStore.client_wallet_entries) ? db.localStore.client_wallet_entries : [];
    const found = entries.find(e => e.gateway_tx_id === gwId);
    return found ? formatClientWalletEntryRow(found) : null;
  }
  const res = await db.query(
    'SELECT * FROM public.client_wallet_entries WHERE gateway_tx_id = $1 LIMIT 1',
    [gwId]
  );
  return res.rows[0] ? formatClientWalletEntryRow(res.rows[0]) : null;
}

async function confirmClientWalletTopup({ entryId, gatewayTxId = null, paidAmount = null }) {
  await ensureExtendedSchema();
  const eid = String(entryId || '').trim();
  const gwId = String(gatewayTxId || '').trim();
  if (!eid && !gwId) {
    throw new Error('Identificador do depósito não informado.');
  }

  let existing = null;
  if (!db.pool) {
    const entries = Array.isArray(db.localStore.client_wallet_entries) ? db.localStore.client_wallet_entries : [];
    existing = entries.find(e => (eid && e.id === eid) || (gwId && e.gateway_tx_id === gwId)) || null;
    if (!existing) throw new Error('Depósito não encontrado na carteira.');
    if (existing.status === 'confirmado') {
      const wallet = await getClientWallet(existing.client_id, { skipGatewaySync: true });
      return { entry: formatClientWalletEntryRow(existing), wallet, newlyConfirmed: false };
    }
    const finalAmount = paidAmount !== null && paidAmount !== undefined && Number(paidAmount) > 0
      ? round2(paidAmount)
      : round2(existing.amount);
    existing.status = 'confirmado';
    existing.amount = finalAmount;
    existing.balance_delta = finalAmount;
    if (gwId) existing.gateway_tx_id = gwId;
    existing.updated_at = new Date().toISOString();
    await recomputeClientWalletBalance(existing.client_id);
    const wallet = await getClientWallet(existing.client_id, { skipGatewaySync: true });
    return { entry: formatClientWalletEntryRow(existing), wallet, newlyConfirmed: true };
  }

  const findRes = eid
    ? await db.query('SELECT * FROM public.client_wallet_entries WHERE id = $1 LIMIT 1', [eid])
    : await db.query('SELECT * FROM public.client_wallet_entries WHERE gateway_tx_id = $1 LIMIT 1', [gwId]);
  existing = findRes.rows[0] || null;
  if (!existing) throw new Error('Depósito não encontrado na carteira.');
  if (existing.status === 'confirmado') {
    const wallet = await getClientWallet(existing.client_id, { skipGatewaySync: true });
    return { entry: formatClientWalletEntryRow(existing), wallet, newlyConfirmed: false };
  }

  const finalAmount = paidAmount !== null && paidAmount !== undefined && Number(paidAmount) > 0
    ? round2(paidAmount)
    : round2(existing.amount);
  const updRes = await db.query(
    `UPDATE public.client_wallet_entries
     SET status = 'confirmado',
         amount = $2,
         balance_delta = $2,
         gateway_tx_id = COALESCE(NULLIF($3, ''), gateway_tx_id),
         updated_at = NOW()
     WHERE id = $1 AND status <> 'confirmado'
     RETURNING *`,
    [existing.id, finalAmount, gwId]
  );
  await recomputeClientWalletBalance(existing.client_id);
  const updatedRow = updRes.rows[0] || { ...existing, status: 'confirmado', amount: finalAmount, balance_delta: finalAmount };
  const wallet = await getClientWallet(existing.client_id, { skipGatewaySync: true });
  return {
    entry: formatClientWalletEntryRow(updatedRow),
    wallet,
    newlyConfirmed: Boolean(updRes.rows[0])
  };
}

async function getClientWallet(clientId, options = {}) {
  await ensureExtendedSchema();
  const cid = String(clientId || '').trim();
  if (!cid) {
    return {
      clientId: '',
      balance: 0,
      pendingBalance: 0,
      minTopupAmount: MIN_CLIENT_WALLET_TOPUP_BRL,
      totalDeposited: 0,
      totalSpent: 0,
      totalRefunded: 0,
      entries: []
    };
  }

  let entries = await listClientWalletEntries(cid);

  if (!options.skipGatewaySync) {
    let syncedAny = false;
    if (await efiBankGateway.isEfiPixActive()) {
      const pendingEfiEntries = entries.filter(
        e =>
          e.status === 'aguardando' &&
          (e.metadata?.provider === 'efibank' || String(e.gatewayTxId || '').startsWith('KVWLT'))
      );
      for (const pe of pendingEfiEntries.slice(0, 5)) {
        try {
          const efiCheck = await efiBankGateway.getPixChargeStatus(pe.gatewayTxId);
          if (efiCheck && efiCheck.paid) {
            await confirmClientWalletTopup({
              entryId: pe.id,
              gatewayTxId: pe.gatewayTxId,
              paidAmount: efiCheck.amountBrl || pe.amount
            });
            syncedAny = true;
          }
        } catch {
          // ignore transient Efí lookup failures
        }
      }
    }
    if (syncedAny) {
      entries = await listClientWalletEntries(cid);
    }
  }

  let balance = 0;
  let pendingBalance = 0;
  let totalDeposited = 0;
  let totalSpent = 0;
  let totalRefunded = 0;

  for (const e of entries) {
    if (e.status === 'confirmado') {
      balance += Number(e.balanceDelta || 0);
      if (e.entryType === 'topup') totalDeposited += Number(e.amount || 0);
      if (e.entryType === 'ride_debit') totalSpent += Number(e.amount || 0);
      if (e.entryType === 'ride_refund') totalRefunded += Number(e.amount || 0);
    } else if (e.status === 'aguardando' && e.entryType === 'topup') {
      pendingBalance += Number(e.amount || 0);
    }
  }

  const finalBalance = round2(balance);
  await recomputeClientWalletBalance(cid).catch(() => {});

  return {
    clientId: cid,
    balance: finalBalance,
    pendingBalance: round2(pendingBalance),
    minTopupAmount: MIN_CLIENT_WALLET_TOPUP_BRL,
    totalDeposited: round2(totalDeposited),
    totalSpent: round2(totalSpent),
    totalRefunded: round2(totalRefunded),
    entries
  };
}

async function insertClientWalletEntry({
  id = '',
  idempotencyKey,
  clientId,
  clientPhone = '',
  clientName = '',
  entryType,
  paymentMethod = 'pix',
  amount,
  balanceDelta,
  status = 'confirmado',
  rideId = null,
  rideCode = null,
  gatewayTxId = null,
  pixQrCode = '',
  pixCopyPaste = '',
  pixExpiresAt = null,
  description,
  metadata = {}
}, pgClient = null) {
  await ensureExtendedSchema();
  const cleanKey = String(idempotencyKey || `${entryType}_${clientId}_${Date.now()}`);
  const rowId = id || `cw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const nowIso = new Date().toISOString();

  const normalizedPixExpiresAt = normalizeOptionalTimestamp(pixExpiresAt, null);

  if (!db.pool) {
    if (!Array.isArray(db.localStore.client_wallet_entries)) db.localStore.client_wallet_entries = [];
    const dup = db.localStore.client_wallet_entries.find(e => e.idempotency_key === cleanKey);
    if (dup) return { entry: formatClientWalletEntryRow(dup), idempotent: true };
    const row = {
      id: rowId,
      idempotency_key: cleanKey,
      client_id: String(clientId),
      client_phone: String(clientPhone || ''),
      client_name: String(clientName || ''),
      entry_type: entryType,
      payment_method: paymentMethod || 'pix',
      amount: round2(amount),
      balance_delta: round2(balanceDelta),
      status,
      ride_id: rideId || null,
      ride_code: rideCode || null,
      gateway_tx_id: gatewayTxId || null,
      pix_qr_code: pixQrCode || '',
      pix_copy_paste: pixCopyPaste || '',
      pix_expires_at: normalizedPixExpiresAt,
      description: String(description || ''),
      metadata: metadata || {},
      created_at: nowIso,
      updated_at: nowIso
    };
    db.localStore.client_wallet_entries.unshift(row);
    db.saveLocalStore();
    await recomputeClientWalletBalance(clientId);
    return { entry: formatClientWalletEntryRow(row), idempotent: false };
  }

  const executor = pgClient || db;
  const dupRes = await executor.query(
    'SELECT * FROM public.client_wallet_entries WHERE idempotency_key = $1 LIMIT 1',
    [cleanKey]
  );
  if (dupRes.rows[0]) {
    return { entry: formatClientWalletEntryRow(dupRes.rows[0]), idempotent: true };
  }

  const insRes = await executor.query(
    `INSERT INTO public.client_wallet_entries (
      id, idempotency_key, client_id, client_phone, client_name, entry_type, payment_method,
      amount, balance_delta, status, ride_id, ride_code, gateway_tx_id, pix_qr_code,
      pix_copy_paste, pix_expires_at, description, metadata, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,NOW(),NOW())
    RETURNING *`,
    [
      rowId,
      cleanKey,
      String(clientId),
      String(clientPhone || ''),
      String(clientName || ''),
      entryType,
      paymentMethod || 'pix',
      round2(amount),
      round2(balanceDelta),
      status,
      rideId || null,
      rideCode || null,
      gatewayTxId || null,
      pixQrCode || '',
      pixCopyPaste || '',
      normalizedPixExpiresAt,
      String(description || ''),
      JSON.stringify(metadata || {})
    ]
  );
  await recomputeClientWalletBalance(clientId, pgClient);
  return { entry: formatClientWalletEntryRow(insRes.rows[0]), idempotent: false };
}

async function createClientWalletTopup({
  clientId,
  clientName = '',
  clientPhone = '',
  clientEmail = '',
  amount,
  method = 'pix',
  cardId = '',
  idempotencyKey = ''
}) {
  await ensureExtendedSchema();
  const cid = String(clientId || '').trim();
  if (!cid) throw new Error('Faça login como passageiro para depositar na carteira.');
  const cleanAmount = round2(amount);
  if (!Number.isFinite(cleanAmount) || cleanAmount < MIN_CLIENT_WALLET_TOPUP_BRL) {
    throw new Error(`O valor mínimo para depósito na carteira é de R$ ${MIN_CLIENT_WALLET_TOPUP_BRL.toFixed(2).replace('.', ',')}.`);
  }

  const normalizedMethod = String(method || 'pix').toLowerCase().trim();
  const entryId = `cw-topup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const cfg = await getSystemConfig();

  if (normalizedMethod === 'pix') {
    const txid = `CW${cid.replace(/[^a-zA-Z0-9]/g, '').slice(-8)}${Date.now().toString().slice(-6)}`.slice(0, 25);
    let pixCopyPaste = generateDynamicPixPayload({
      key: cfg.pixKey || 'contato@kavrodrive.com.br',
      beneficiaryName: cfg.pixBeneficiary || cfg.companyName || 'KAVRO DRIVE',
      city: cfg.driverCarCity || 'BRASIL',
      amount: cleanAmount,
      txid
    });
    let pixQrCode = getQrCodeUrl(pixCopyPaste, 260);
    let gatewayTxId = `wallet_pix_${txid}`;
    let pixExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    let pixProvider = 'sandbox';

    if (await efiBankGateway.isEfiPixActive()) {
      let payerCpf = '';
      try {
        const cliR = await db.query('SELECT document FROM public.clients WHERE id = $1 LIMIT 1', [cid]);
        payerCpf = String(cliR.rows[0]?.document || '');
      } catch {}
      const efiPix = await efiBankGateway.createPixCharge({
        amountBrl: cleanAmount,
        txidPrefix: 'KVWLT',
        entityId: cid,
        payerName: clientName || 'Passageiro Kavro',
        payerCpf,
        description: `Recarga Carteira Kavro (${cid})`,
        qrFallbackGenerator: getQrCodeUrl
      });
      if (!efiPix.pixCopyPaste && !efiPix.pixQrCode) {
        throw new Error('Não foi possível gerar o QR Code PIX pela Efí Bank no momento.');
      }
      pixCopyPaste = efiPix.pixCopyPaste || pixCopyPaste;
      pixQrCode = efiPix.pixQrCode || getQrCodeUrl(pixCopyPaste, 260);
      gatewayTxId = efiPix.txid;
      pixExpiresAt = efiPix.expiresAt || pixExpiresAt;
      pixProvider = 'efibank';
    }

    const { entry } = await insertClientWalletEntry({
      id: entryId,
      idempotencyKey: idempotencyKey || `wallet_topup_pix_${entryId}`,
      clientId: cid,
      clientPhone,
      clientName,
      entryType: 'topup',
      paymentMethod: 'pix',
      amount: cleanAmount,
      balanceDelta: cleanAmount,
      status: 'aguardando',
      gatewayTxId,
      pixQrCode,
      pixCopyPaste,
      pixExpiresAt,
      metadata: { provider: pixProvider, txid: gatewayTxId },
      description: `Recarga na carteira via PIX (R$ ${cleanAmount.toFixed(2).replace('.', ',')})`
    });

    const wallet = await getClientWallet(cid, { skipGatewaySync: true });
    return { ok: true, pending: true, entry, wallet };
  }

  // Depósito imediato via Cartão salvo
  const cards = await listSavedCards(cid, clientPhone);
  const chosenCard = cards.find(c => c.id === cardId) || null;
  if (!chosenCard) {
    throw new Error('Selecione ou cadastre um cartão válido para depositar na carteira.');
  }

  let gatewayTxId = `wallet_card_${Date.now()}`;

  const { entry } = await insertClientWalletEntry({
    id: entryId,
    idempotencyKey: idempotencyKey || `wallet_topup_card_${gatewayTxId}`,
    clientId: cid,
    clientPhone,
    clientName,
    entryType: 'topup',
    paymentMethod: normalizedMethod,
    amount: cleanAmount,
    balanceDelta: cleanAmount,
    status: 'confirmado',
    gatewayTxId,
    description: `Depósito na carteira via ${chosenCard.brand} •••• ${chosenCard.last4}`
  });
  const wallet = await getClientWallet(cid, { skipGatewaySync: true });
  return { ok: true, pending: false, entry, wallet };
}

async function debitClientWalletForRide({
  clientId,
  clientName = '',
  clientPhone = '',
  rideId,
  rideCode = '',
  amount,
  entryType = 'ride_debit',
  idempotencyKey = '',
  description = ''
}) {
  await ensureExtendedSchema();
  const cid = String(clientId || '').trim();
  const cleanAmount = round2(amount);
  const cleanKey = String(idempotencyKey || `wallet_ride_debit_${rideId}`);
  const descText = description || `Pagamento da corrida ${rideCode || rideId} com saldo da carteira`;

  if (!cid) {
    return { ok: false, error: 'Faça login como passageiro para pagar com o saldo da carteira.' };
  }
  if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
    return { ok: false, error: 'Valor inválido para débito na carteira.' };
  }

  if (!db.pool) {
    const entries = Array.isArray(db.localStore.client_wallet_entries) ? db.localStore.client_wallet_entries : [];
    const existing = entries.find(e => e.idempotency_key === cleanKey);
    if (existing) {
      const bal = await recomputeClientWalletBalance(cid);
      return { ok: true, idempotent: true, entry: formatClientWalletEntryRow(existing), balanceAfter: bal };
    }
    const available = round2(
      entries
        .filter(e => e.client_id === cid && e.status === 'confirmado')
        .reduce((acc, e) => acc + Number(e.balance_delta || 0), 0)
    );
    if (available + 0.001 < cleanAmount) {
      return {
        ok: false,
        availableBalance: available,
        error: `Saldo insuficiente na carteira (Disponível: R$ ${available.toFixed(2).replace('.', ',')}). Deposite a partir de R$ 20,00 para pagar com a carteira.`
      };
    }
    const { entry } = await insertClientWalletEntry({
      idempotencyKey: cleanKey,
      clientId: cid,
      clientPhone,
      clientName,
      entryType,
      paymentMethod: 'carteira',
      amount: cleanAmount,
      balanceDelta: -cleanAmount,
      status: 'confirmado',
      rideId,
      rideCode,
      gatewayTxId: `wallet_${rideId}`,
      description: descText
    });
    const balanceAfter = await recomputeClientWalletBalance(cid);
    return { ok: true, idempotent: false, entry, balanceAfter };
  }

  const pgClient = await db.pool.connect();
  try {
    await pgClient.query('BEGIN');
    await pgClient.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`client_wallet:${cid}`]);

    const dupRes = await pgClient.query(
      'SELECT * FROM public.client_wallet_entries WHERE idempotency_key = $1 LIMIT 1',
      [cleanKey]
    );
    if (dupRes.rows[0]) {
      const bal = await recomputeClientWalletBalance(cid, pgClient);
      await pgClient.query('COMMIT');
      return { ok: true, idempotent: true, entry: formatClientWalletEntryRow(dupRes.rows[0]), balanceAfter: bal };
    }

    const balRes = await pgClient.query(
      `SELECT COALESCE(SUM(balance_delta), 0) AS bal
       FROM public.client_wallet_entries
       WHERE client_id = $1 AND status = 'confirmado'`,
      [cid]
    );
    const available = round2(balRes.rows[0]?.bal || 0);
    if (available + 0.001 < cleanAmount) {
      await pgClient.query('ROLLBACK');
      return {
        ok: false,
        availableBalance: available,
        error: `Saldo insuficiente na carteira (Disponível: R$ ${available.toFixed(2).replace('.', ',')}). Deposite a partir de R$ 20,00 para pagar com a carteira.`
      };
    }

    const { entry } = await insertClientWalletEntry(
      {
        idempotencyKey: cleanKey,
        clientId: cid,
        clientPhone,
        clientName,
        entryType,
        paymentMethod: 'carteira',
        amount: cleanAmount,
        balanceDelta: -cleanAmount,
        status: 'confirmado',
        rideId,
        rideCode,
        gatewayTxId: `wallet_${rideId}`,
        description: descText
      },
      pgClient
    );
    const balanceAfter = await recomputeClientWalletBalance(cid, pgClient);
    await pgClient.query('COMMIT');
    return { ok: true, idempotent: false, entry, balanceAfter };
  } catch (err) {
    await pgClient.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    pgClient.release();
  }
}

async function creditClientWalletAdjustment({
  clientId,
  clientName = '',
  clientPhone = '',
  rideId = null,
  rideCode = null,
  amount,
  entryType = 'ride_refund',
  idempotencyKey,
  paymentMethod = 'carteira',
  description = ''
}) {
  const cid = String(clientId || '').trim();
  const cleanAmount = round2(amount);
  if (!cid || !Number.isFinite(cleanAmount) || cleanAmount <= 0) {
    return null;
  }
  const res = await insertClientWalletEntry({
    idempotencyKey: idempotencyKey || `wallet_adj_${cid}_${Date.now()}`,
    clientId: cid,
    clientPhone,
    clientName,
    entryType,
    paymentMethod,
    amount: cleanAmount,
    balanceDelta: +cleanAmount,
    status: 'confirmado',
    rideId,
    rideCode,
    gatewayTxId: rideId ? `wallet_refund_${rideId}` : `wallet_adj_${Date.now()}`,
    description: description || `Crédito na carteira (R$ ${cleanAmount.toFixed(2).replace('.', ',')})`
  });
  const wallet = await getClientWallet(cid, { skipGatewaySync: true });
  return { ...res, wallet };
}

module.exports = {
  MIN_CLIENT_WALLET_TOPUP_BRL,
  CARD_MAX_INSTALLMENTS,
  validateCardOnlySingleInstallment,
  round2,
  calculateSplit,
  resolveCommissionPercentForRide,
  resolveCommissionFixedForRide,
  generateDynamicPixPayload,
  getQrCodeUrl,
  ensureExtendedSchema,
  normalizeCategoriesServer,
  mapLegacyCategoryIdServer,
  resolveCategoryTypeServer,
  validateAndNormalizeDriverPixKeys,
  normalizeDriverVehicles,
  computeDriverCategoriesServer,
  listDrivers,
  getDriverById,
  findDriverByIdentifier,
  saveDriverRecord,
  recordLedgerEntry,
  listLedgerEntries,
  savePaymentTransaction,
  getPaymentTxByRide,
  getPaymentTxByGatewayTxId,
  listPaymentTransactions,
  getDriverWallet,
  listWithdrawals,
  getBrazilWeekdayIndex,
  normalizeWithdrawalWeekdays,
  evaluateWithdrawalAvailability,
  requestWithdrawal,
  processWithdrawalAdmin,
  listSavedCards,
  tokenizeAndSaveCard,
  createPixChargeForRide,
  authorizeCardForRide,
  captureCardForRide,
  refundGatewayPayment,
  settleDigitalRideToLedger,
  settleCashRideToLedger,
  createDriverDebtSettlementPix,
  confirmDriverDebtSettlementWebhook,
  processRideCancellationFinance,
  getPlatformFinancialOverview,
  claimRideAtomically,
  listSosAlertsDb,
  getSosAlertByIdDb,
  upsertSosAlertDb,
  updateSosStatusDb,
  formatClientWalletEntryRow,
  recomputeClientWalletBalance,
  listClientWalletEntries,
  findClientWalletEntryByGatewayTxId,
  getClientWallet,
  createClientWalletTopup,
  confirmClientWalletTopup,
  debitClientWalletForRide,
  creditClientWalletAdjustment
};

