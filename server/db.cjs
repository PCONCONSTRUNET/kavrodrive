const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('./env.cjs');

const connectionString = (process.env.DATABASE_URL || '').trim();

let pool = null;

if (connectionString) {
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: process.env.VERCEL ? 3 : 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
  });
} else {
  console.log('[db] Nenhum DATABASE_URL configurado. Usando armazenamento local em memória/arquivo (modo desenvolvimento).');
}

const LOCAL_DB_FILE = path.join(__dirname, '.local-db.json');

function hashDefaultPassword(password) {
  const salt = 'upmob2026salt0000';
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

function getInitialStore() {
  return {
    system_config: {
      default: {
        id: 'default',
        config: {
          companyName: 'Kavro Drive',
          companyPhone: '(48) 99691-5303',
          companyWhatsapp: '5548996915303',
          companyEmail: 'contato@upmobilidade.com.br',
          driverName: 'Alisson Santos',
          driverPhone: '(48) 99691-5303',
          baseFare: 8.0,
          pricePerKm: 3.2,
          pricePerMinute: 0.5,
          minimumFare: 15.0,
          nightSurchargePercent: 20,
          nightStartHour: 22,
          nightEndHour: 6,
          advanceNoticeHours: 0,
          bufferBetweenRidesMin: 0,
          platformCommissionPercent: 20,
          paymentMethodCommissionPercents: {
            pix: 20,
            cartao_credito: 20,
            cartao_debito: 20,
            dinheiro: 20
          },
          gatewayFeePercents: {
            pix: 0,
            cartao_credito: 0,
            cartao_debito: 0
          },
          withdrawalFeePercent: 0,
          withdrawalFeeFixed: 0,
          cancellationFeeAmount: 0,
          useCategoryCommissionOverride: false,
          cashDeductFromBalanceFirst: true,
          maxDriverDebtLimit: 100.0,
          autoBlockDelinquentDrivers: true,
          minWithdrawalAmount: 20.0,
          autoSplitPixEnabled: true,
          cardSettlementDays: 0,
          activePaymentMethods: ['pix', 'cartao_credito', 'cartao_debito', 'dinheiro'],
          serviceCategories: [
            { id: 'standard', name: 'UPX • Particular Padrão', multiplier: 1.0, description: 'Viagens rápidas do dia a dia com ar-condicionado' },
            { id: 'comfort', name: 'Kavro Comfort • Executivo', multiplier: 1.25, description: 'Sedans espaçosos e motoristas mais bem avaliados' },
            { id: 'aeroporto', name: 'Kavro Bagagem / Aeroporto', multiplier: 1.35, description: 'Porta-malas amplo para malas e viagens longas' }
          ],
          pixKey: 'contato@upmobilidade.com.br',
          pixType: 'email',
          pixBeneficiary: 'Kavro Drive Plataforma',
          whatsappAutomations: {
            notifyNewBooking: true,
            notifyConfirmation: true,
            notifyOnTheWay: true,
            notifyCompleted: true,
          },
          operatingHours: {
            start: '00:00',
            end: '23:59',
            daysOpen: [0, 1, 2, 3, 4, 5, 6],
          }
        },
        updated_at: new Date().toISOString()
      }
    },
    drivers: [
      {
        id: 'drv-1001',
        name: 'Alisson Santos',
        phone: '(48) 98888-0000',
        email: 'alisson@kavrodrive.com.br',
        document: '09876543210',
        cnh: '04589231940',
        password_hash: hashDefaultPassword('1234'),
        photo: '',
        vehicle_brand: 'Toyota',
        vehicle_model: 'Corolla XEi 2.0',
        vehicle_color: 'Prata',
        vehicle_year: '2024',
        vehicle_plate: 'QXZ4G21',
        vehicle_category: 'standard',
        vehicle_photo: '',
        city: 'Lauro Müller/SC',
        bio: 'Motorista parceiro verificado Kavro Drive.',
        pix_key: '48988880000',
        pix_type: 'telefone',
        bank_name: 'Nubank (260)',
        bank_agency: '0001',
        bank_account: '982341-5',
        auto_payout_weekly: true,
        approval_status: 'aprovado',
        financial_blocked: false,
        financial_block_reason: null,
        is_online: true,
        current_ride_id: null,
        queued_ride_id: null,
        location: {
          lat: -28.3919,
          lng: -49.3967,
          heading: 0,
          speedKmH: 0,
          updatedAt: new Date().toISOString()
        },
        rating: 4.98,
        total_rides: 142,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ],
    rides: [],
    financial_ledger: [],
    payment_transactions: [],
    saved_cards: [],
    withdrawal_requests: [],
    expenses: [],
    clients: [],
    notifications: [],
    blocked_slots: {},
    ride_trail_points: [],
    ride_chat_messages: [],
    password_reset_codes: [],
    audit_logs: [],
    sos_alerts: {}
  };
}

function loadLocalStore() {
  const initial = getInitialStore();
  try {
    if (fs.existsSync(LOCAL_DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_DB_FILE, 'utf8'));
      const merged = { ...initial, ...parsed };
      if (!Array.isArray(merged.drivers) || merged.drivers.length === 0) {
        merged.drivers = initial.drivers;
      }
      if (!Array.isArray(merged.financial_ledger)) merged.financial_ledger = [];
      if (!Array.isArray(merged.payment_transactions)) merged.payment_transactions = [];
      if (!Array.isArray(merged.saved_cards)) merged.saved_cards = [];
      if (!Array.isArray(merged.withdrawal_requests)) merged.withdrawal_requests = [];
      if (!Array.isArray(merged.ride_chat_messages)) merged.ride_chat_messages = [];
      if (!Array.isArray(merged.password_reset_codes)) merged.password_reset_codes = [];
      if (!Array.isArray(merged.audit_logs)) merged.audit_logs = [];
      return merged;
    }
  } catch {
    // ignore
  }
  return initial;
}

const localStore = loadLocalStore();

function saveLocalStore() {
  try {
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(localStore, null, 2), 'utf8');
  } catch {
    // ignore on read-only fs
  }
}

function parseJsonSafe(val, fallback = null) {
  if (val === undefined || val === null) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

async function localQuery(text, params = []) {
  const sql = String(text || '').replace(/\s+/g, ' ').trim();
  const upper = sql.toUpperCase();

  if (
    upper.startsWith('ALTER TABLE') ||
    upper.startsWith('CREATE TABLE') ||
    upper.startsWith('CREATE INDEX') ||
    upper.startsWith('GRANT ')
  ) {
    return { rows: [], rowCount: 0 };
  }

  if (upper.includes('SELECT NOW()')) {
    return { rows: [{ now: new Date().toISOString() }], rowCount: 1 };
  }

  // 1. system_config
  if (upper.includes('FROM PUBLIC.SYSTEM_CONFIG')) {
    const id = params[0] || 'default';
    const row = localStore.system_config[id];
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }
  if (upper.includes('INTO PUBLIC.SYSTEM_CONFIG')) {
    const cfg = parseJsonSafe(params[0], {});
    localStore.system_config['default'] = {
      id: 'default',
      config: cfg,
      updated_at: new Date().toISOString()
    };
    saveLocalStore();
    return { rows: [localStore.system_config['default']], rowCount: 1 };
  }

  // 2. rides
  if (upper.includes('MAX(RIDE_NUMBER)') && upper.includes('FROM PUBLIC.RIDES')) {
    const max = localStore.rides.reduce((acc, r) => Math.max(acc, Number(r.ride_number) || 0), 0);
    return { rows: [{ next_num: max + 1 }], rowCount: 1 };
  }
  if (upper.startsWith('SELECT') && upper.includes('FROM PUBLIC.RIDES')) {
    if (upper.includes('WHERE ID = $1')) {
      const found = localStore.rides.find(r => r.id === params[0]);
      return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
    }
    if (upper.includes('WHERE DRIVER_ID = $1') && upper.includes('PASSENGER_RATING')) {
      const rows = localStore.rides.filter(
        r => r.driver_id === params[0] && Number(r.passenger_rating) > 0
      );
      return { rows, rowCount: rows.length };
    }
    if (upper.includes('CLIENT_RATED_STARS') && (upper.includes('WHERE CLIENT_ID = $1') || upper.includes('WHERE CLIENT_PHONE'))) {
      const pId = String(params[0] || '');
      const pPhone = String(params[1] || '').replace(/\D/g, '');
      const rows = localStore.rides.filter(r => {
        if (!(Number(r.client_rated_stars) > 0)) return false;
        const matchId = pId && r.client_id === pId;
        const rPhone = String(r.client_phone || '').replace(/\D/g, '');
        const matchPhone = pPhone && pPhone.length >= 8 && rPhone === pPhone;
        return Boolean(matchId || matchPhone);
      });
      return { rows, rowCount: rows.length };
    }
    const sorted = [...localStore.rides].sort((a, b) => {
      const cmpCreated = String(b.created_at || '').localeCompare(String(a.created_at || ''));
      if (cmpCreated !== 0) return cmpCreated;
      const cmpDate = String(b.date || '').localeCompare(String(a.date || ''));
      return cmpDate !== 0 ? cmpDate : String(b.time || '').localeCompare(String(a.time || ''));
    });
    return { rows: sorted, rowCount: sorted.length };
  }
  if (upper.startsWith('INSERT INTO PUBLIC.RIDES')) {
    const now = new Date().toISOString();
    const row = {
      id: params[0],
      ride_number: params[1],
      client_name: params[2],
      client_phone: params[3],
      client_id: params[4],
      origin: parseJsonSafe(params[5], {}),
      destination: parseJsonSafe(params[6], {}),
      date: params[7],
      time: params[8],
      passengers: params[9],
      has_luggage: params[10],
      category: params[11],
      distance_km: params[12],
      duration_min: params[13],
      total_price: params[14],
      payment_method: params[15],
      payment_status: params[16],
      status: params[17],
      driver_notes: params[18],
      notes: params[19],
      is_manual_booking: params[20],
      updated_at: now
    };
    const idx = localStore.rides.findIndex(r => r.id === row.id);
    if (idx >= 0) {
      localStore.rides[idx] = { ...localStore.rides[idx], ...row };
    } else {
      row.created_at = now;
      localStore.rides.push(row);
    }
    saveLocalStore();
    return { rows: [localStore.rides[idx >= 0 ? idx : localStore.rides.length - 1]], rowCount: 1 };
  }
  if (upper.startsWith('DELETE FROM PUBLIC.RIDES')) {
    const id = params[0];
    localStore.rides = localStore.rides.filter(r => r.id !== id);
    saveLocalStore();
    return { rows: [], rowCount: 1 };
  }
  if (upper.startsWith('UPDATE PUBLIC.RIDES')) {
    const now = new Date().toISOString();
    if (upper.includes('SET STATUS = $1')) {
      const r = localStore.rides.find(item => item.id === params[1]);
      if (r) { r.status = params[0]; r.updated_at = now; saveLocalStore(); }
      return { rows: r ? [r] : [], rowCount: r ? 1 : 0 };
    }
    if (upper.includes('CLIENT_LOCATION = $1') || upper.includes('DRIVER_LOCATION = $1')) {
      const col = upper.includes('CLIENT_LOCATION = $1') ? 'client_location' : 'driver_location';
      const r = localStore.rides.find(item => item.id === params[1]);
      if (r) {
        r[col] = parseJsonSafe(params[0], null);
        r.updated_at = now;
        saveLocalStore();
      }
      return { rows: r ? [r] : [], rowCount: r ? 1 : 0 };
    }
    if (upper.includes('SET PAYMENT_STATUS = $1, PAYMENT_METHOD = $2')) {
      const r = localStore.rides.find(item => item.id === params[2]);
      if (r) { r.payment_status = params[0]; r.payment_method = params[1]; r.updated_at = now; saveLocalStore(); }
      return { rows: r ? [r] : [], rowCount: r ? 1 : 0 };
    }
    if (upper.includes('SET PAYMENT_STATUS = $1')) {
      const r = localStore.rides.find(item => item.id === params[1]);
      if (r) { r.payment_status = params[0]; r.updated_at = now; saveLocalStore(); }
      return { rows: r ? [r] : [], rowCount: r ? 1 : 0 };
    }
    if (upper.includes("SET PAYMENT_STATUS = 'PAGO'") || upper.includes("SET PAYMENT_STATUS = 'CONFIRMADO'")) {
      const r = localStore.rides.find(item => item.id === params[0]);
      if (r) { r.payment_status = 'confirmado'; r.payment_method = 'pix'; r.updated_at = now; saveLocalStore(); }
      return { rows: r ? [r] : [], rowCount: r ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 3. ride_trail_points
  if (upper.includes('INTO PUBLIC.RIDE_TRAIL_POINTS')) {
    localStore.ride_trail_points.push({
      ride_id: params[0],
      status: params[1],
      lat: params[2],
      lng: params[3],
      speed_kmh: params[4],
      heading: params[5],
      recorded_at: new Date().toISOString()
    });
    saveLocalStore();
    return { rows: [], rowCount: 1 };
  }
  if (upper.includes('FROM PUBLIC.RIDE_TRAIL_POINTS')) {
    const pts = localStore.ride_trail_points.filter(p => p.ride_id === params[0]);
    return { rows: pts, rowCount: pts.length };
  }

  // 4. sos_alerts
  if (upper.includes('INTO PUBLIC.SOS_ALERTS')) {
    const id = params[0];
    localStore.sos_alerts[id] = {
      id,
      name: params[1],
      phone: params[2],
      lat: params[3],
      lng: params[4],
      accuracy: params[5],
      heading: params[6],
      speed_kmh: params[7],
      address: params[8],
      ride_id: params[9],
      active: true,
      created_at: params[10] || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    saveLocalStore();
    return { rows: [localStore.sos_alerts[id]], rowCount: 1 };
  }
  if (upper.includes('FROM PUBLIC.SOS_ALERTS')) {
    const item = localStore.sos_alerts[params[0]];
    return { rows: item ? [item] : [], rowCount: item ? 1 : 0 };
  }
  if (upper.includes('UPDATE PUBLIC.SOS_ALERTS')) {
    const item = localStore.sos_alerts[params[0]];
    if (item) { item.active = false; item.updated_at = new Date().toISOString(); saveLocalStore(); }
    return { rows: [], rowCount: 1 };
  }

  // 5. expenses
  if (upper.startsWith('SELECT') && upper.includes('FROM PUBLIC.EXPENSES')) {
    const sorted = [...localStore.expenses].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return { rows: sorted, rowCount: sorted.length };
  }
  if (upper.startsWith('INSERT INTO PUBLIC.EXPENSES')) {
    const row = {
      id: params[0],
      description: params[1],
      amount: params[2],
      category: params[3],
      date: params[4],
      notes: params[5],
      type: params[6] || 'saida',
      payment_method: params[7] || 'dinheiro',
      created_at: new Date().toISOString()
    };
    const idx = localStore.expenses.findIndex(e => e.id === row.id);
    if (idx >= 0) localStore.expenses[idx] = { ...localStore.expenses[idx], ...row };
    else localStore.expenses.push(row);
    saveLocalStore();
    return { rows: [row], rowCount: 1 };
  }
  if (upper.startsWith('DELETE FROM PUBLIC.EXPENSES')) {
    localStore.expenses = localStore.expenses.filter(e => e.id !== params[0]);
    saveLocalStore();
    return { rows: [], rowCount: 1 };
  }

  // 6. clients
  if (upper.startsWith('SELECT') && upper.includes('FROM PUBLIC.CLIENTS')) {
    if (upper.includes('WHERE ID = $1')) {
      const found = localStore.clients.find(c => c.id === params[0]);
      return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
    }
    if (upper.includes('WHERE PHONE = $1')) {
      const found = localStore.clients.find(c => c.phone === params[0]);
      return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
    }
    if (upper.includes('REGEXP_REPLACE')) {
      const p1 = String(params[0] || '');
      const p2 = String(params[1] || '');
      const found = localStore.clients.find(c => {
        const digits = String(c.phone || '').replace(/\D/g, '');
        const email = String(c.email || '').toLowerCase();
        if (upper.includes('WHERE ($1 <> \'\' AND ID = $1)')) {
          return (p1 && c.id === p1) || (p2 && digits === p2);
        }
        if (upper.includes('LOWER(COALESCE(EMAIL')) {
          return (p1 && (digits === p1 || email === p1)) || (p2 && (digits === p2 || email === p2));
        }
        return false;
      });
      return { rows: found ? [found] : [], rowCount: found ? 1 : 0 };
    }
    const sorted = [...localStore.clients].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return { rows: sorted, rowCount: sorted.length };
  }
  if (upper.startsWith('INSERT INTO PUBLIC.CLIENTS')) {
    const now = new Date().toISOString();
    let row;
    if (params.length <= 3) {
      row = { id: params[0], name: params[1], phone: params[2], saved_addresses: [], created_at: now };
    } else if (params.length === 8) {
      row = {
        id: params[0],
        name: params[1],
        phone: params[2],
        email: params[3],
        document: params[4],
        password_hash: params[5],
        saved_addresses: parseJsonSafe(params[6], []),
        terms_accepted_at: params[7],
        created_at: now
      };
    } else if (params.length === 9) {
      row = {
        id: params[0],
        name: params[1],
        phone: params[2],
        email: params[3],
        document: params[4],
        password_hash: params[5],
        saved_addresses: parseJsonSafe(params[6], []),
        terms_accepted_at: params[7],
        terms_signature: parseJsonSafe(params[8], null),
        created_at: now
      };
    } else {
      row = {
        id: params[0],
        name: params[1],
        phone: params[2],
        email: params[3],
        document: params[4],
        password_hash: params[5],
        notes: params[6],
        blocked: params[7],
        saved_addresses: parseJsonSafe(params[8], []),
        terms_accepted_at: params[9],
        created_at: params[10] || now
      };
    }
    const idx = localStore.clients.findIndex(c => c.id === row.id);
    if (idx >= 0) {
      localStore.clients[idx] = {
        ...localStore.clients[idx],
        ...row,
        password_hash: row.password_hash || localStore.clients[idx].password_hash
      };
      row = localStore.clients[idx];
    } else {
      localStore.clients.push(row);
    }
    saveLocalStore();
    return { rows: [row], rowCount: 1 };
  }
  if (upper.startsWith('UPDATE PUBLIC.CLIENTS')) {
    if (upper.includes('SET PASSWORD_HASH = $1 WHERE ID = $2')) {
      const c = localStore.clients.find(item => item.id === params[1]);
      if (c) { c.password_hash = params[0]; saveLocalStore(); }
      return { rows: c ? [c] : [], rowCount: c ? 1 : 0 };
    }
    if (upper.includes('SET RATING = $1 WHERE ID = $2')) {
      const c = localStore.clients.find(item => item.id === params[1]);
      if (c) { c.rating = Number(params[0]); saveLocalStore(); }
      return { rows: c ? [c] : [], rowCount: c ? 1 : 0 };
    }
    if (upper.includes('SET NAME = $1, PHONE = $2, EMAIL = $3 WHERE ID = $4')) {
      const c = localStore.clients.find(item => item.id === params[3]);
      if (c) {
        c.name = params[0];
        c.phone = params[1];
        c.email = params[2];
        saveLocalStore();
      }
      return { rows: c ? [c] : [], rowCount: c ? 1 : 0 };
    }
    if (upper.includes('SET PHOTO = $1 WHERE ID = $2')) {
      const c = localStore.clients.find(item => item.id === params[1]);
      if (c) {
        c.photo = params[0];
        saveLocalStore();
      }
      return { rows: c ? [c] : [], rowCount: c ? 1 : 0 };
    }
    if (upper.includes('SET PROFILE_CHANGE_REQUEST = $1 WHERE ID = $2')) {
      const c = localStore.clients.find(item => item.id === params[1]);
      if (c) {
        c.profile_change_request = parseJsonSafe(params[0], params[0]);
        saveLocalStore();
      }
      return { rows: c ? [c] : [], rowCount: c ? 1 : 0 };
    }
    if (upper.includes('SET NAME = $1, PHONE = $2, EMAIL = $3, DOCUMENT = $4, PROFILE_CHANGE_REQUEST = $5 WHERE ID = $6')) {
      const c = localStore.clients.find(item => item.id === params[5]);
      if (c) {
        c.name = params[0];
        c.phone = params[1];
        c.email = params[2];
        c.document = params[3];
        c.profile_change_request = parseJsonSafe(params[4], params[4]);
        saveLocalStore();
      }
      return { rows: c ? [c] : [], rowCount: c ? 1 : 0 };
    }
    const idParam = params.length >= 8 ? params[7] : params[6];
    const c = localStore.clients.find(item => item.id === idParam);
    if (c) {
      c.name = params[0];
      c.phone = params[1];
      c.email = params[2];
      c.document = params[3];
      c.password_hash = params[4];
      c.terms_accepted_at = params[5];
      if (params.length >= 8) {
        c.terms_signature = parseJsonSafe(params[6], c.terms_signature || null);
      }
      saveLocalStore();
    }
    return { rows: c ? [c] : [], rowCount: c ? 1 : 0 };
  }
  if (upper.startsWith('DELETE FROM PUBLIC.CLIENTS')) {
    localStore.clients = localStore.clients.filter(c => c.id !== params[0]);
    saveLocalStore();
    return { rows: [], rowCount: 1 };
  }

  // 7. blocked_slots
  if (upper.includes('FROM PUBLIC.BLOCKED_SLOTS')) {
    const rows = Object.entries(localStore.blocked_slots).map(([date, slots]) => ({ date, slots }));
    return { rows, rowCount: rows.length };
  }
  if (upper.includes('INTO PUBLIC.BLOCKED_SLOTS')) {
    localStore.blocked_slots[params[0]] = parseJsonSafe(params[1], []);
    saveLocalStore();
    return { rows: [], rowCount: 1 };
  }

  // 8. notifications
  if (upper.startsWith('SELECT') && upper.includes('FROM PUBLIC.NOTIFICATIONS')) {
    const sorted = [...localStore.notifications]
      .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
      .slice(0, 50);
    return { rows: sorted, rowCount: sorted.length };
  }
  if (upper.startsWith('INSERT INTO PUBLIC.NOTIFICATIONS')) {
    const row = {
      id: params[0],
      title: params[1],
      message: params[2],
      type: params[3] || 'ride_new',
      ride_id: params[4] || null,
      read: Boolean(params[5]),
      timestamp: params[6] || new Date().toISOString()
    };
    localStore.notifications.unshift(row);
    saveLocalStore();
    return { rows: [row], rowCount: 1 };
  }
  if (upper.startsWith('DELETE FROM PUBLIC.NOTIFICATIONS')) {
    if (upper.includes('WHERE ID = $1')) {
      localStore.notifications = localStore.notifications.filter(n => n.id !== params[0]);
    } else {
      localStore.notifications = [];
    }
    saveLocalStore();
    return { rows: [], rowCount: 1 };
  }
  if (upper.startsWith('UPDATE PUBLIC.NOTIFICATIONS')) {
    if (upper.includes('WHERE ID = $2')) {
      const n = localStore.notifications.find(item => item.id === params[1]);
      if (n) n.read = Boolean(params[0]);
    } else {
      localStore.notifications.forEach(n => { n.read = true; });
    }
    saveLocalStore();
    return { rows: [], rowCount: 1 };
  }

  // 9. drivers password reset
  if (upper.startsWith('UPDATE PUBLIC.DRIVERS') && upper.includes('SET PASSWORD_HASH = $1 WHERE ID = $2')) {
    const d = localStore.drivers.find(item => item.id === params[1]);
    if (d) { d.password_hash = params[0]; d.updated_at = new Date().toISOString(); saveLocalStore(); }
    return { rows: d ? [d] : [], rowCount: d ? 1 : 0 };
  }

  // 10. ride_chat_messages
  if (upper.startsWith('SELECT') && upper.includes('FROM PUBLIC.RIDE_CHAT_MESSAGES')) {
    const rideId = params[0];
    const rows = (localStore.ride_chat_messages || [])
      .filter(m => m.ride_id === rideId)
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
    return { rows, rowCount: rows.length };
  }
  if (upper.startsWith('INSERT INTO PUBLIC.RIDE_CHAT_MESSAGES')) {
    const row = {
      id: params[0],
      ride_id: params[1],
      sender_role: params[2],
      sender_name: params[3],
      text: params[4],
      created_at: params[5] || new Date().toISOString()
    };
    if (!Array.isArray(localStore.ride_chat_messages)) localStore.ride_chat_messages = [];
    localStore.ride_chat_messages.push(row);
    saveLocalStore();
    return { rows: [row], rowCount: 1 };
  }

  // 11. password_reset_codes
  if (upper.startsWith('INSERT INTO PUBLIC.PASSWORD_RESET_CODES')) {
    if (!Array.isArray(localStore.password_reset_codes)) localStore.password_reset_codes = [];
    const row = {
      id: params[0],
      role: params[1],
      user_id: params[2],
      identifier: params[3],
      code_hash: params[4],
      attempts: 0,
      expires_at: params[5],
      used_at: null,
      created_at: new Date().toISOString()
    };
    localStore.password_reset_codes.unshift(row);
    localStore.password_reset_codes = localStore.password_reset_codes.slice(0, 200);
    saveLocalStore();
    return { rows: [row], rowCount: 1 };
  }
  if (upper.startsWith('SELECT') && upper.includes('FROM PUBLIC.PASSWORD_RESET_CODES')) {
    const role = params[0];
    const userId = params[1];
    const rows = (localStore.password_reset_codes || [])
      .filter(c => c.role === role && c.user_id === userId && !c.used_at)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return { rows: rows.slice(0, 1), rowCount: rows.length > 0 ? 1 : 0 };
  }
  if (upper.startsWith('UPDATE PUBLIC.PASSWORD_RESET_CODES')) {
    const entry = (localStore.password_reset_codes || []).find(c => c.id === params[0]);
    if (entry) {
      if (upper.includes('USED_AT')) entry.used_at = new Date().toISOString();
      if (upper.includes('ATTEMPTS')) entry.attempts = Number(entry.attempts || 0) + 1;
      saveLocalStore();
    }
    return { rows: entry ? [entry] : [], rowCount: entry ? 1 : 0 };
  }

  return { rows: [], rowCount: 0 };
}

module.exports = {
  query: (text, params) => (pool ? pool.query(text, params) : localQuery(text, params)),
  pool,
  localStore,
  saveLocalStore,
  getLocalStore: () => localStore
};
