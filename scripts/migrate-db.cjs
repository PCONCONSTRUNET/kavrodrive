const { Client } = require('pg');
require('../server/env.cjs');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Erro: Defina DATABASE_URL no arquivo .env ou .env.local antes de rodar a migração.');
  process.exit(1);
}

const schemaSql = `
-- 1. TABELA DE CONFIGURAÇÃO DO SISTEMA
CREATE TABLE IF NOT EXISTS public.system_config (
  id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
  config JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABELA DE MOTORISTAS (SUPORTE A 1.000+ MOTORISTAS)
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
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 3. TABELA DE CORRIDAS SOB DEMANDA (ESTILO UBER)
CREATE TABLE IF NOT EXISTS public.rides (
  id VARCHAR(50) PRIMARY KEY,
  ride_number INTEGER,
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  client_id TEXT,
  driver_id VARCHAR(64),
  driver_name TEXT,
  driver_phone TEXT,
  driver_photo TEXT,
  driver_vehicle TEXT,
  driver_plate VARCHAR(20),
  driver_car_color TEXT,
  driver_rating NUMERIC DEFAULT 5.0,
  is_queued_ride BOOLEAN DEFAULT FALSE,
  queued_for_driver_id VARCHAR(64),
  declined_driver_ids JSONB DEFAULT '[]'::jsonb,
  origin JSONB NOT NULL,
  destination JSONB NOT NULL,
  date VARCHAR(20) NOT NULL,
  time VARCHAR(10) NOT NULL,
  passengers INTEGER DEFAULT 1,
  has_luggage BOOLEAN DEFAULT FALSE,
  category VARCHAR(50) DEFAULT 'standard',
  category_name TEXT,
  applied_fare_snapshot JSONB,
  distance_km NUMERIC DEFAULT 0,
  duration_min NUMERIC DEFAULT 0,
  estimated_price NUMERIC DEFAULT 0,
  total_price NUMERIC NOT NULL,
  paid_amount NUMERIC DEFAULT 0,
  commission_percent NUMERIC DEFAULT 20,
  commission_amount NUMERIC DEFAULT 0,
  driver_net_amount NUMERIC DEFAULT 0,
  payment_method VARCHAR(50) DEFAULT 'pix',
  payment_status VARCHAR(50) DEFAULT 'aguardando',
  payment_tx_id VARCHAR(64),
  pix_qr_code TEXT,
  pix_copy_paste TEXT,
  card_id VARCHAR(64),
  card_last4 VARCHAR(10),
  card_brand VARCHAR(30),
  status VARCHAR(50) DEFAULT 'aguardando_confirmacao',
  driver_notes TEXT,
  notes TEXT,
  driver_location JSONB,
  client_location JSONB,
  is_manual_booking BOOLEAN DEFAULT FALSE,
  reminder_notification_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS category_name TEXT;
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS applied_fare_snapshot JSONB;
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS reminder_notification_id TEXT;

-- 4. LIVRO-RAZÃO FINANCEIRO IMUTÁVEL (FINANCIAL LEDGER)
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

-- 5. TRANSAÇÕES DE PAGAMENTO DO GATEWAY (PIX, CARTÃO, DINHEIRO)
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

-- 6. CARTÕES TOKENIZADOS DOS PASSAGEIROS (SEM DADOS SENSÍVEIS)
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

-- 7. SOLICITAÇÕES DE SAQUE / REPASSES DOS MOTORISTAS
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

-- 8. TABELA DE DESPESAS OPERACIONAIS
CREATE TABLE IF NOT EXISTS public.expenses (
  id VARCHAR(50) PRIMARY KEY,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  category VARCHAR(50) NOT NULL,
  date VARCHAR(20) NOT NULL,
  notes TEXT,
  type VARCHAR(20) DEFAULT 'saida',
  payment_method VARCHAR(30) DEFAULT 'dinheiro',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. TABELA DE CLIENTES
CREATE TABLE IF NOT EXISTS public.clients (
  id VARCHAR(50) PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  document VARCHAR(32),
  password_hash TEXT,
  blocked BOOLEAN DEFAULT FALSE,
  terms_accepted_at TIMESTAMPTZ,
  notes TEXT,
  saved_addresses JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. TABELA DE NOTIFICAÇÕES
CREATE TABLE IF NOT EXISTS public.notifications (
  id VARCHAR(50) PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'ride_new',
  ride_id VARCHAR(50),
  driver_id VARCHAR(64),
  read BOOLEAN DEFAULT FALSE,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 11. TABELA DE HORÁRIOS BLOQUEADOS (LEGADO)
CREATE TABLE IF NOT EXISTS public.blocked_slots (
  date VARCHAR(20) PRIMARY KEY,
  slots JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. TABELA DE PONTOS DE TRAJETO GPS (HISTÓRICO DE ROTA)
CREATE TABLE IF NOT EXISTS public.ride_trail_points (
  id BIGSERIAL PRIMARY KEY,
  ride_id VARCHAR(50) NOT NULL,
  status VARCHAR(50),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  speed_kmh DOUBLE PRECISION DEFAULT 0,
  heading DOUBLE PRECISION DEFAULT 0,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. TABELA DE ALERTAS DE EMERGÊNCIA (SOS)
CREATE TABLE IF NOT EXISTS public.sos_alerts (
  id VARCHAR(80) PRIMARY KEY,
  name TEXT,
  phone VARCHAR(40),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION DEFAULT 0,
  heading DOUBLE PRECISION DEFAULT 0,
  speed_kmh DOUBLE PRECISION DEFAULT 0,
  address TEXT,
  ride_id VARCHAR(50),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drivers_online ON public.drivers (is_online, approval_status);
CREATE INDEX IF NOT EXISTS idx_rides_status ON public.rides (status, driver_id);
CREATE INDEX IF NOT EXISTS idx_ledger_driver ON public.financial_ledger (driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_ride ON public.payment_transactions (ride_id);
CREATE INDEX IF NOT EXISTS idx_trail_ride ON public.ride_trail_points (ride_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_sos_active ON public.sos_alerts (active, updated_at DESC);
`;

async function runMigration() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Connecting to PostgreSQL...');
    await client.connect();
    console.log('Connected! Executing schema migration...');

    await client.query(schemaSql);
    console.log('Tables created successfully!');

    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    console.log('Tables in public schema:', res.rows.map(r => r.table_name));

    await client.end();
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

runMigration();
