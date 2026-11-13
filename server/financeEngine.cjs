const crypto = require('crypto');
const db = require('./db.cjs');
const env = require('./env.cjs');

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
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
  const cleanKey = String(key || 'contato@upmobilidade.com.br').trim();
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
  const cleanTxid = String(txid || 'UPMOB').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || 'UPMOB';

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
function calculateSplit(grossAmount, commissionPercent = 20) {
  const gross = Math.max(0, round2(grossAmount));
  const pct = Math.min(100, Math.max(0, Number(commissionPercent ?? 20)));
  const commissionAmount = round2(gross * (pct / 100));
  const driverNetAmount = round2(gross - commissionAmount);
  return {
    grossAmount: gross,
    commissionPercent: pct,
    commissionAmount,
    driverNetAmount
  };
}

// Resolve a taxa/comissão oficial considerando meio de pagamento (PIX, Cartão, Dinheiro) e regra global/categoria
function resolveCommissionPercentForRide(cfg = {}, categoryObj = null, paymentMethod = 'pix') {
  const methodKey = paymentMethod === 'online' ? 'cartao_credito' : String(paymentMethod || 'pix');
  const perMethodMap = cfg?.paymentMethodCommissionPercents || {};
  const rawMethodPct = perMethodMap[methodKey];
  if (rawMethodPct !== undefined && rawMethodPct !== null && rawMethodPct !== '') {
    const parsed = Number(rawMethodPct);
    if (!Number.isNaN(parsed)) {
      return Math.min(100, Math.max(0, round2(parsed)));
    }
  }
  if (cfg?.useCategoryCommissionOverride && categoryObj && categoryObj.commissionPercent !== undefined) {
    const catPct = Number(categoryObj.commissionPercent);
    if (!Number.isNaN(catPct)) {
      return Math.min(100, Math.max(0, round2(catPct)));
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
    code: 'GO',
    name: 'KAVRO GO',
    subtitle: 'Econômico • Dia a Dia',
    description: 'Viagens econômicas em veículos 4 portas com ar-condicionado e documentação regular.',
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
    id: 'kavro_plus',
    code: 'PLUS',
    name: 'KAVRO PLUS',
    subtitle: 'Conforto • Espaço Amplo',
    description: 'Veículos mais novos, espaçosos e confortáveis com motoristas bem avaliados.',
    active: true,
    sortOrder: 2,
    multiplier: 1.25,
    baseFare: 10.0,
    pricePerKm: 4.0,
    pricePerMinute: 0.62,
    minimumFare: 18.75,
    commissionPercent: 20,
    maxPassengers: 4,
    minVehicleYear: 2018,
    minDriverRating: 4.7,
    minCompletedRides: 0,
    requireFourDoors: true,
    requireAirConditioning: true,
    requireRegularDoc: true,
    requireEar: true,
    requireLargeTrunk: true,
    requireLeatherSeats: false,
    allowedModels: [
      'Onix Plus', 'Prisma', 'Cobalt', 'Cruze', 'Spin', 'Tracker',
      'HB20S', 'Creta', 'Virtus', 'Voyage', 'Jetta', 'Nivus', 'T-Cross', 'Taos',
      'Cronos', 'Fastback', 'Pulse', 'Toros',
      'City', 'Civic', 'HR-V', 'WR-V',
      'Etios Sedan', 'Yaris Sedan', 'Corolla', 'Corolla Cross',
      'Versa', 'Sentra', 'Kicks',
      'Logan', 'Duster', 'Oroch', 'Captur',
      'Renegade', 'Compass', 'Tiggo', 'Arrizo', 'BYD Dolphin', 'BYD Dolphin Plus', 'BYD King', 'BYD Song'
    ],
    allowedCities: [],
    cityOverrides: []
  },
  {
    id: 'kavro_exec',
    code: 'EXEC',
    name: 'KAVRO EXEC',
    subtitle: 'Executivo • Premium',
    description: 'Experiência executiva em sedans médios/grandes e SUVs selecionados com padrão superior.',
    active: true,
    sortOrder: 3,
    multiplier: 1.5,
    baseFare: 12.0,
    pricePerKm: 4.8,
    pricePerMinute: 0.75,
    minimumFare: 22.5,
    commissionPercent: 18,
    maxPassengers: 4,
    minVehicleYear: 2020,
    minDriverRating: 4.85,
    minCompletedRides: 0,
    requireFourDoors: true,
    requireAirConditioning: true,
    requireRegularDoc: true,
    requireEar: true,
    requireLargeTrunk: true,
    requireLeatherSeats: true,
    allowedModels: [
      'Corolla', 'Corolla XEi', 'Corolla Altis', 'Corolla GR-S', 'Corolla Cross',
      'Civic', 'Civic Touring', 'HR-V Touring', 'Accord',
      'Sentra', 'Jetta', 'Passat', 'Taos', 'Tiguan',
      'Cruze', 'Cruze Premier', 'Equinox',
      'Compass', 'Commander',
      'Tiggo 7', 'Tiggo 8', 'Arrizo 6',
      'Haval H6', 'BYD King', 'BYD Song Plus', 'BYD Seal', 'BYD Yuan Plus',
      'BMW 320i', 'Audi A3', 'Audi A4', 'Mercedes C180', 'Mercedes C200'
    ],
    allowedCities: [],
    cityOverrides: []
  }
];

function mapLegacyCategoryIdServer(catId) {
  const raw = String(catId || '').trim().toLowerCase();
  if (!raw || raw === 'standard' || raw === 'upx' || raw === 'go') return 'kavro_go';
  if (raw === 'comfort' || raw === 'plus') return 'kavro_plus';
  if (raw === 'aeroporto' || raw === 'exec' || raw === 'executivo' || raw === 'bagagem') return 'kavro_exec';
  return raw;
}

function normalizeCategoriesServer(cfg) {
  const rawList = Array.isArray(cfg?.rideCategories) && cfg.rideCategories.length > 0
    ? cfg.rideCategories
    : Array.isArray(cfg?.serviceCategories) && cfg.serviceCategories.length > 0
      ? cfg.serviceCategories
      : [];

  const hasKavro = rawList.some(c =>
    c.id === 'kavro_go' || c.id === 'kavro_plus' || c.id === 'kavro_exec' ||
    String(c.name || '').toUpperCase().includes('KAVRO GO')
  );

  if (rawList.length === 0 || !hasKavro) {
    return DEFAULT_RIDE_CATEGORIES_SERVER;
  }

  return rawList.map((item, idx) => {
    const mappedId = mapLegacyCategoryIdServer(item.id);
    const def = DEFAULT_RIDE_CATEGORIES_SERVER.find(d => d.id === mappedId) || DEFAULT_RIDE_CATEGORIES_SERVER[0];
    return {
      ...def,
      ...item,
      id: item.id || def.id,
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
    };
  });
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

  let enabled = rawEnabled ? eligible.filter(id => rawEnabled.includes(id)) : [...eligible];
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
    pixExpiresAt: row.pix_expires_at || row.pixExpiresAt || '',
    cardId: row.card_id || row.cardId || '',
    cardLast4: row.card_last4 || row.cardLast4 || '',
    cardBrand: row.card_brand || row.cardBrand || '',
    gatewayAuthCode: row.gateway_auth_code || row.gatewayAuthCode || '',
    gatewayTxId: row.gateway_tx_id || row.gatewayTxId || '',
    disputeReason: row.dispute_reason || row.disputeReason || '',
    failureReason: row.failure_reason || row.failureReason || '',
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString()
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
  const normalized = {
    id: tx.id || `pay-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
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
    pix_expires_at: tx.pixExpiresAt ?? tx.pix_expires_at ?? null,
    card_id: tx.cardId ?? tx.card_id ?? '',
    card_last4: tx.cardLast4 ?? tx.card_last4 ?? '',
    card_brand: tx.cardBrand ?? tx.card_brand ?? '',
    gateway_auth_code: tx.gatewayAuthCode ?? tx.gateway_auth_code ?? '',
    gateway_tx_id: tx.gatewayTxId || tx.gateway_tx_id || `gw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    dispute_reason: tx.disputeReason ?? tx.dispute_reason ?? '',
    failure_reason: tx.failureReason ?? tx.failure_reason ?? '',
    created_at: tx.createdAt || tx.created_at || now,
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
    } else if (item.balanceBucket === 'available' || item.balanceBucket === 'debt') {
      netDigitalAvailable += item.balanceDelta;
    }

    if (item.entryType === 'ride_earning_credit') {
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
  const debtBalance = netDigitalAvailable < 0 ? round2(Math.abs(netDigitalAvailable)) : 0;
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
    return filtered.map(w => ({
      id: w.id,
      driverId: w.driver_id || w.driverId,
      driverName: w.driver_name || w.driverName,
      amount: round2(w.amount),
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
    }));
  }
  const r = driverId
    ? await db.query('SELECT * FROM public.withdrawal_requests WHERE driver_id = $1 ORDER BY created_at DESC', [driverId])
    : await db.query('SELECT * FROM public.withdrawal_requests ORDER BY created_at DESC');
  return r.rows.map(w => ({
    id: w.id,
    driverId: w.driver_id,
    driverName: w.driver_name,
    amount: round2(w.amount),
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
  }));
}

async function requestWithdrawal({ driverId, amount, pixKey, pixType }) {
  const cfg = await getSystemConfig();
  const driver = await getDriverById(driverId);
  if (!driver) throw new Error('Motorista não encontrado.');
  if (driver.financialBlocked) {
    throw new Error('Funções financeiras temporariamente bloqueadas para esta conta.');
  }

  const wallet = await getDriverWallet(driverId);
  const reqAmount = round2(amount);
  const minAmount = round2(cfg.minWithdrawalAmount ?? 10);

  if (reqAmount <= 0) throw new Error('Informe um valor válido para saque.');
  if (reqAmount < minAmount) throw new Error(`O valor mínimo para saque é R$ ${minAmount.toFixed(2)}.`);
  if (reqAmount > wallet.availableBalance) {
    throw new Error(`Saldo disponível insuficiente (Disponível: R$ ${wallet.availableBalance.toFixed(2)}).`);
  }

  // Impede saques duplicados simultâneos (idempotência por janela de 30s ou saque pendente idêntico)
  const existingPending = wallet.withdrawals.find(
    w => (w.status === 'solicitado' || w.status === 'processando') &&
      Math.abs(w.amount - reqAmount) < 0.01 &&
      Date.now() - new Date(w.createdAt).getTime() < 60000
  );
  if (existingPending) {
    throw new Error('Já existe uma solicitação de saque idêntica em processamento. Aguarde a conclusão.');
  }

  const wdId = `wd-${Date.now()}`;
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

  const { entry } = await recordLedgerEntry({
    idempotencyKey: `withdrawal_${wdId}`,
    driverId: driver.id,
    driverName: driver.name,
    entryType: 'payout_withdrawal',
    paymentMethod: 'pix',
    grossAmount: reqAmount,
    commissionPercent: 0,
    commissionAmount: 0,
    driverNetAmount: reqAmount,
    balanceDelta: -reqAmount,
    balanceBucket: 'available',
    status: 'confirmado',
    description: `Solicitação de saque via PIX (${targetPixKey})`,
    metadata: { withdrawalId: wdId, pixKey: targetPixKey, pixType: targetPixType }
  });

  const now = new Date().toISOString();
  if (!db.pool) {
    const row = {
      id: wdId,
      driver_id: driver.id,
      driver_name: driver.name,
      amount: reqAmount,
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
    return row;
  }

  const r = await db.query(
    `INSERT INTO public.withdrawal_requests (
      id, driver_id, driver_name, amount, pix_key, pix_type, status, ledger_entry_id, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,'solicitado',$7,NOW()) RETURNING *`,
    [wdId, driver.id, driver.name, reqAmount, targetPixKey, targetPixType, entry.id]
  );
  return r.rows[0];
}

function mapAsaasPixType(pixType) {
  const t = String(pixType || '').toLowerCase().trim();
  if (t === 'cpf' || t === 'cnpj') return t.toUpperCase();
  if (t === 'email') return 'EMAIL';
  if (t === 'telefone' || t === 'phone' || t === 'celular') return 'PHONE';
  return 'EVP';
}

async function dispatchAutomatedPixPayout(wd) {
  const amount = round2(wd.amount);
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

async function listSavedCards(clientId, clientPhone) {
  await ensureExtendedSchema();
  const cleanPhone = String(clientPhone || '').replace(/\D/g, '');
  if (!db.pool) {
    return (db.localStore.saved_cards || []).filter(c => {
      const cPhone = String(c.client_phone || c.clientPhone || '').replace(/\D/g, '');
      return (clientId && (c.client_id === clientId || c.clientId === clientId)) ||
        (cleanPhone.length >= 8 && cPhone === cleanPhone);
    });
  }
  const r = await db.query(
    `SELECT * FROM public.saved_cards
     WHERE ($1 <> '' AND client_id = $1)
        OR ($2 <> '' AND regexp_replace(COALESCE(client_phone, ''), '\\D', '', 'g') = $2)
     ORDER BY created_at DESC`,
    [String(clientId || ''), cleanPhone]
  );
  return r.rows.map(c => ({
    id: c.id,
    clientId: c.client_id,
    clientPhone: c.client_phone,
    brand: c.brand,
    last4: c.last4,
    holderName: c.holder_name,
    expMonth: c.exp_month,
    expYear: c.exp_year,
    cardType: c.card_type || 'cartao_credito',
    gatewayToken: c.gateway_token,
    isDefault: Boolean(c.is_default),
    createdAt: c.created_at
  }));
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

async function tokenizeAndSaveCard({ clientId, clientPhone, cardNumber, holderName, expMonth, expYear, cvv, cardType, mpCardToken, holderDocument }) {
  await ensureExtendedSchema();
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
  const cardId = `card-${Date.now()}`;
  const now = new Date().toISOString();

  const cardObj = {
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
  const split = calculateSplit(ride.totalPrice, cfg.platformCommissionPercent ?? 20);
  const txid = `UP${String(ride.id || '').replace(/[^a-zA-Z0-9]/g, '')}${Date.now().toString().slice(-4)}`.slice(0, 25);

  let pixCopyPaste = generateDynamicPixPayload({
    key: cfg.pixKey || 'contato@upmobilidade.com.br',
    beneficiaryName: cfg.pixBeneficiary || cfg.companyName || 'KAVRO DRIVE',
    city: cfg.driverCarCity || 'BRASIL',
    amount: split.grossAmount,
    txid
  });
  let pixQrCode = getQrCodeUrl(pixCopyPaste, 260);
  let gatewayTxId = `pix_${ride.id}_${Date.now()}`;

  // Se houver MERCADOPAGO_ACCESS_TOKEN configurado, tenta gerar cobrança real no Mercado Pago com external_reference = ride.id
  if (env.MERCADOPAGO_ACCESS_TOKEN) {
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
            email: 'passageiro@upmobilidade.com.br',
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
    rideCode: ride.rideCode || `#UP - ${String(ride.rideNumber || 1).padStart(3, '0')}`,
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
    pixExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    gatewayTxId
  });

  return { tx, split };
}

async function authorizeCardForRide(ride, cardInfo = {}) {
  const cfg = await getSystemConfig();
  const effectiveCommPct = ride.commissionPercent ?? resolveCommissionPercentForRide(cfg, null, ride.paymentMethod || 'cartao_credito');
  const split = calculateSplit(ride.totalPrice, effectiveCommPct);
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

  // Busca token real salvo ou enviado no checkout para pré-autorização no Mercado Pago
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
            email: ride.clientEmail || 'passageiro@upmobilidade.com.br',
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
  const isRealMpId = Boolean(env.MERCADOPAGO_ACCESS_TOKEN && tx?.gatewayTxId && /^\d+$/.test(String(tx.gatewayTxId)));
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
  return { captured: true, gatewayTxId: tx?.gatewayTxId || `card_cap_${ride.id}`, provider: 'sandbox' };
}

async function refundGatewayPayment(tx, refundAmount = null) {
  const isRealMpId = Boolean(env.MERCADOPAGO_ACCESS_TOKEN && tx?.gatewayTxId && /^\d+$/.test(String(tx.gatewayTxId)));
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
  const split = calculateSplit(finalGross, ride.commissionPercent ?? resolveCommissionPercentForRide(cfg, null, ride.paymentMethod));

  // Verifica se o motorista possuía dívida anterior para registrar nota de compensação automática
  const walletBefore = await getDriverWallet(ride.driverId);

  const settlementBucket =
    (ride.paymentMethod === 'cartao_credito' || ride.paymentMethod === 'cartao_debito') &&
    Number(cfg.cardSettlementDays || 0) > 0
      ? 'pending'
      : 'available';
  const entryStatus = settlementBucket === 'pending' ? 'pendente_liberacao' : 'confirmado';

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
    description: `Ganho líquido corrida ${ride.rideCode || ride.id} (${ride.paymentMethod.toUpperCase()}) — Bruto R$ ${split.grossAmount.toFixed(2)} (-${split.commissionPercent}% comissão)`,
    metadata: {
      autoSplit: true,
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
    description: `Comissão Kavro Drive (${split.commissionPercent}%) retida via split na corrida ${ride.rideCode || ride.id}`
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
    ride.commissionPercent ?? resolveCommissionPercentForRide(cfg, null, 'dinheiro')
  );

  // Saldo livre antes do lançamento (sistema Uber: desconta primeiro do saldo livre; o excedente vira saldo devedor)
  const walletBefore = await getDriverWallet(driverId);
  const availableBefore = Math.max(0, round2(walletBefore.availableBalance || 0));
  const deductedFromBalance = round2(Math.min(availableBefore, split.commissionAmount));
  const addedToDebt = round2(Math.max(0, split.commissionAmount - deductedFromBalance));

  const debitDescription =
    deductedFromBalance >= split.commissionAmount
      ? `Comissão Kavro Drive (${split.commissionPercent}% = R$ ${split.commissionAmount.toFixed(2)}) descontada do Saldo Livre ref. corrida em dinheiro ${ride.rideCode || ride.id}`
      : deductedFromBalance > 0
        ? `Comissão Kavro Drive (${split.commissionPercent}% = R$ ${split.commissionAmount.toFixed(2)}): R$ ${deductedFromBalance.toFixed(2)} descontado do Saldo Livre + R$ ${addedToDebt.toFixed(2)} no Saldo Devedor ref. corrida ${ride.rideCode || ride.id}`
        : `Comissão Kavro Drive (${split.commissionPercent}% = R$ ${split.commissionAmount.toFixed(2)}) lançada no Saldo Devedor ref. corrida em dinheiro ${ride.rideCode || ride.id}`;

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

  // 2. Débito automático da comissão da Kavro Drive (desconta do saldo livre e, se faltar, acumula na dívida)
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
    balanceBucket: deductedFromBalance >= split.commissionAmount ? 'available' : 'debt',
    status: 'confirmado',
    description: debitDescription,
    metadata: {
      uberCashAccounting: true,
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

  await savePaymentTransaction({
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
    gatewayTxId: `cash_${ride.id}`
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
  const pixCopyPaste = generateDynamicPixPayload({
    key: cfg.pixKey || 'contato@upmobilidade.com.br',
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
    pixCopyPaste,
    pixQrCode
  };
}

async function confirmDriverDebtSettlementWebhook({ driverId, amount, gatewayTxId }) {
  const driver = await getDriverById(driverId);
  const cleanAmount = round2(amount);
  if (cleanAmount <= 0) throw new Error('Valor de quitação inválido.');

  const { entry, idempotent } = await recordLedgerEntry({
    idempotencyKey: `debt_settle_${driverId}_${gatewayTxId || Date.now()}`,
    driverId,
    driverName: driver?.name || 'Motorista',
    entryType: 'debt_pix_settlement',
    paymentMethod: 'pix',
    grossAmount: cleanAmount,
    commissionPercent: 0,
    commissionAmount: 0,
    driverNetAmount: cleanAmount,
    balanceDelta: +cleanAmount,
    balanceBucket: 'available',
    status: 'confirmado',
    description: `Quitação de saldo devedor via PIX confirmada pelo gateway (R$ ${cleanAmount.toFixed(2)})`
  });

  const wallet = await getDriverWallet(driverId);
  return { entry, idempotent, wallet };
}

// ============================================================
// Resumo Financeiro Geral para o Painel Administrativo Master
// ============================================================
async function getPlatformFinancialOverview() {
  const cfg = await getSystemConfig();
  const commPctDefault = Number(cfg.platformCommissionPercent ?? 20);
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
      const split = calculateSplit(gross, r.commission_percent ?? commPctDefault);
      const method = r.payment_method || r.paymentMethod || 'pix';
      const rawPayStatus = r.payment_status || r.paymentStatus || (r.status === 'finalizada' ? 'confirmado' : 'aguardando');
      const normalizedStatus = rawPayStatus === 'pago' ? 'confirmado' : rawPayStatus;
      const drvId = r.driver_id || r.driverId || (drivers[0] ? drivers[0].id : 'drv-1001');
      const drvName = r.driver_name || r.driverName || (drivers[0] ? drivers[0].name : 'Alisson Santos');

      await savePaymentTransaction({
        id: `tx-sync-${r.id}`,
        rideId: r.id,
        rideCode: r.ride_code || `#UP - ${String(r.ride_number || 1).padStart(3, '0')}`,
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
    maxDriverDebtLimit: Number(cfg.maxDriverDebtLimit ?? 100),
    autoBlockDelinquentDrivers: cfg.autoBlockDelinquentDrivers !== false,
    minWithdrawalAmount: Number(cfg.minWithdrawalAmount ?? 20),
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

module.exports = {
  round2,
  calculateSplit,
  resolveCommissionPercentForRide,
  generateDynamicPixPayload,
  getQrCodeUrl,
  ensureExtendedSchema,
  normalizeCategoriesServer,
  mapLegacyCategoryIdServer,
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
  listPaymentTransactions,
  getDriverWallet,
  listWithdrawals,
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
  getPlatformFinancialOverview
};

