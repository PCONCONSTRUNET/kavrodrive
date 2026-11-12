const { Client } = require('pg');
require('../server/env.cjs');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Erro: Defina DATABASE_URL no arquivo .env ou .env.local antes de rodar o seed.');
  process.exit(1);
}

const DEFAULT_CONFIG = {
  companyName: 'UP Mobilidade',
  companyPhone: '(48) 99691-5303',
  companyWhatsapp: '5548996915303',
  companyEmail: 'contato@upmobilidade.com.br',
  baseFare: 8.0,
  pricePerKm: 3.2,
  pricePerMinute: 0.5,
  minimumFare: 15.0,
  nightSurchargePercent: 20,
  nightStartHour: 22,
  nightEndHour: 6,
  advanceNoticeHours: 1,
  bufferBetweenRidesMin: 30,
  activePaymentMethods: ['pix', 'cartao_credito', 'dinheiro'],
  serviceCategories: [
    { id: 'standard', name: 'Corrida Particular Padrão', multiplier: 1.0, description: 'Carro particular confortável com ar-condicionado' },
    { id: 'aeroporto', name: 'Traslado Executivo Aeroporto', multiplier: 1.0, description: 'Identificador para voo, bagagens e pontualidade (mesma tarifa)' }
  ],
  pixKey: 'contato@upmobilidade.com.br',
  pixType: 'email',
  pixBeneficiary: 'UP Mobilidade Transporte Particular',
  whatsappAutomations: {
    notifyNewBooking: true,
    notifyConfirmation: true,
    notifyOnTheWay: true,
    notifyCompleted: true,
  },
  operatingHours: {
    start: '06:00',
    end: '23:30',
    daysOpen: [0, 1, 2, 3, 4, 5, 6],
  },
};

const INITIAL_CLIENTS = [
  {
    id: 'cli-1',
    name: 'Dra. Mariana Fonseca',
    phone: '(11) 99123-4567',
    email: 'mariana.fonseca@clinica.med.br',
    notes: 'Cliente VIP semanal. Prefere ar condicionado ameno e silêncio.',
    createdAt: '2026-10-10T10:00:00Z',
    savedAddresses: [
      { id: 'addr-1', label: 'Consultório', address: 'Av. Paulista, 1578 - Bela Vista, São Paulo', lat: -23.5614, lng: -46.6565 },
      { id: 'addr-2', label: 'Residência', address: 'Rua Oscar Freire, 920 - Jardins, São Paulo', lat: -23.5632, lng: -46.6698 }
    ]
  },
  {
    id: 'cli-2',
    name: 'Carlos Eduardo Mendes',
    phone: '(11) 98456-7890',
    email: 'carlos.mendes@techcorp.com.br',
    notes: 'Viagens frequentes para aeroporto de Congonhas e Guarulhos.',
    createdAt: '2026-10-15T14:30:00Z',
  },
  {
    id: 'cli-3',
    name: 'Juliana Castro',
    phone: '(11) 97788-9900',
    email: 'ju.castro@advocacia.com',
    createdAt: '2026-10-20T09:15:00Z'
  }
];

const getTodayString = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
};

const INITIAL_RIDES = [
  {
    id: 'UP-7821',
    clientId: 'cli-1',
    clientName: 'Dra. Mariana Fonseca',
    clientPhone: '(11) 99123-4567',
    origin: {
      address: 'Rua Oscar Freire, 920 - Jardins, São Paulo - SP',
      lat: -23.5632,
      lng: -46.6698,
      reference: 'Prédio espelhado'
    },
    destination: {
      address: 'Av. Brigadeiro Faria Lima, 3477 - Itaim Bibi, São Paulo - SP',
      lat: -23.5857,
      lng: -46.6811,
      reference: 'Torre Sul'
    },
    date: getTodayString(0),
    time: '14:30',
    passengers: 1,
    hasLuggage: false,
    distanceKm: 4.8,
    durationMin: 18,
    totalPrice: 32.50,
    paymentMethod: 'pix',
    paymentStatus: 'pago',
    status: 'confirmada',
    notes: 'Agendamento corporativo',
    isManualBooking: true
  },
  {
    id: 'UP-8194',
    clientId: 'cli-2',
    clientName: 'Carlos Eduardo Mendes',
    clientPhone: '(11) 98456-7890',
    origin: {
      address: 'Av. das Nações Unidas, 12901 - Brooklin, São Paulo - SP',
      lat: -23.6095,
      lng: -46.6971,
    },
    destination: {
      address: 'Aeroporto de Congonhas (CGH) - Embarque, São Paulo - SP',
      lat: -23.6261,
      lng: -46.6564,
    },
    date: getTodayString(0),
    time: '18:00',
    passengers: 2,
    hasLuggage: true,
    category: 'aeroporto',
    distanceKm: 8.5,
    durationMin: 25,
    totalPrice: 58.00,
    paymentMethod: 'cartao_credito',
    paymentStatus: 'pendente',
    status: 'confirmada',
    notes: 'Voo às 20h, duas malas médias',
    isManualBooking: false
  },
  {
    id: 'UP-9302',
    clientId: 'cli-3',
    clientName: 'Juliana Castro',
    clientPhone: '(11) 97788-9900',
    origin: {
      address: 'Alameda Santos, 1800 - Cerqueira César, São Paulo - SP',
      lat: -23.5598,
      lng: -46.6602
    },
    destination: {
      address: 'Shopping Iguatemi - Av. Brg. Faria Lima, 2232',
      lat: -23.5786,
      lng: -46.6888
    },
    date: getTodayString(1),
    time: '11:00',
    passengers: 1,
    distanceKm: 5.2,
    durationMin: 20,
    totalPrice: 35.00,
    paymentMethod: 'pix',
    paymentStatus: 'pendente',
    status: 'aguardando_confirmacao',
    isManualBooking: false
  }
];

const INITIAL_EXPENSES = [
  {
    id: 'exp-1',
    category: 'combustivel',
    description: 'Abastecimento Gasolina Podium Shell',
    amount: 220.00,
    date: getTodayString(0),
  },
  {
    id: 'exp-2',
    category: 'lavagem',
    description: 'Higienização e lavagem completa detalhada',
    amount: 80.00,
    date: getTodayString(-2),
  },
  {
    id: 'exp-3',
    category: 'pedagio',
    description: 'Sem Parar Rodovias - Mensalidade e Passagens',
    amount: 32.40,
    date: getTodayString(-3),
  }
];

async function seed() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected to Supabase! Checking existing data...');

  // 1. Config
  const cfgCheck = await client.query('SELECT id FROM public.system_config WHERE id = $1', ['default']);
  if (cfgCheck.rows.length === 0) {
    await client.query('INSERT INTO public.system_config (id, config) VALUES ($1, $2)', ['default', JSON.stringify(DEFAULT_CONFIG)]);
    console.log('Default system_config seeded.');
  }

  // 2. Clients
  for (const c of INITIAL_CLIENTS) {
    await client.query(`
      INSERT INTO public.clients (id, name, phone, email, notes, saved_addresses, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        notes = EXCLUDED.notes,
        saved_addresses = EXCLUDED.saved_addresses;
    `, [c.id, c.name, c.phone, c.email || null, c.notes || null, JSON.stringify(c.savedAddresses || []), c.createdAt]);
  }
  console.log('Clients seeded.');

  // 3. Rides
  for (const r of INITIAL_RIDES) {
    await client.query(`
      INSERT INTO public.rides (
        id, client_name, client_phone, client_id, origin, destination,
        date, time, passengers, has_luggage, category, distance_km, duration_min,
        total_price, payment_method, payment_status, status, notes, is_manual_booking
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        payment_status = EXCLUDED.payment_status;
    `, [
      r.id, r.clientName, r.clientPhone, r.clientId || null,
      JSON.stringify(r.origin), JSON.stringify(r.destination),
      r.date, r.time, r.passengers, r.hasLuggage, r.category || 'standard',
      r.distanceKm, r.durationMin, r.totalPrice, r.paymentMethod,
      r.paymentStatus, r.status, r.notes || null, r.isManualBooking
    ]);
  }
  console.log('Rides seeded.');

  // 4. Expenses
  for (const e of INITIAL_EXPENSES) {
    await client.query(`
      INSERT INTO public.expenses (id, description, amount, category, date)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        description = EXCLUDED.description,
        amount = EXCLUDED.amount;
    `, [e.id, e.description, e.amount, e.category, e.date]);
  }
  console.log('Expenses seeded.');

  await client.end();
  console.log('All seed data inserted successfully into Supabase!');
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});

