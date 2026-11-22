const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Força modo armazenamento local isolado antes de carregar db.cjs/env.cjs
process.env.DATABASE_URL = ' ';
process.env.NODE_ENV = 'test';

const LOCAL_DB_PATH = path.resolve(__dirname, '..', 'server', '.local-db.json');
const hadLocalDbFile = fs.existsSync(LOCAL_DB_PATH);
const originalLocalDbRaw = hadLocalDbFile ? fs.readFileSync(LOCAL_DB_PATH, 'utf8') : null;

const db = require('../server/db.cjs');
const finance = require('../server/financeEngine.cjs');
const audit = require('../server/auditEngine.cjs');
const realtimeHub = require('../server/realtimeHub.cjs');
const security = require('../server/securityUtils.cjs');
const kycStorage = require('../server/kycStorage.cjs');
const { handleApiRequest, normalizeConfigMediaToR2 } = require('../server/apiHandler.cjs');

// Garante que chaves de serviços externos carregadas do .env não disparem chamadas externas em testes
delete process.env.TURNSTILE_SECRET_KEY;
delete process.env.RESEND_API_KEY;
delete process.env.OTP_WEBHOOK_URL;
delete process.env.ONESIGNAL_REST_API_KEY;
delete process.env.VERCEL;
delete process.env.CLOUDFLARE_R2_ACCOUNT_ID;
delete process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
delete process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

const originalStoreSnapshot = JSON.parse(JSON.stringify(db.localStore));

let server;
let baseUrl;
let activeSseRequests = new Set();

function scryptHash(password) {
  const salt = 'upmob2026salt0000';
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

async function apiJson(route, options = {}) {
  const res = await fetch(`${baseUrl}${route}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, headers: res.headers, json };
}

test.before(async () => {
  server = http.createServer((req, res) => {
    handleApiRequest(req, res).catch((err) => {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

test.after(async () => {
  for (const req of activeSseRequests) {
    try {
      req.destroy();
    } catch {}
  }
  activeSseRequests.clear();

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  // Restaura db.localStore em memória sem perder a referência exportada
  for (const key of Object.keys(db.localStore)) {
    delete db.localStore[key];
  }
  Object.assign(db.localStore, JSON.parse(JSON.stringify(originalStoreSnapshot)));

  if (hadLocalDbFile) {
    fs.writeFileSync(LOCAL_DB_PATH, originalLocalDbRaw, 'utf8');
  } else if (fs.existsSync(LOCAL_DB_PATH)) {
    fs.unlinkSync(LOCAL_DB_PATH);
  }
});

test('financeEngine: calculateSplit e resolveCommissionPercentForRide calculam repasse corretamente', () => {
  const split = finance.calculateSplit(50, 20);
  assert.equal(split.grossAmount, 50);
  assert.equal(split.commissionPercent, 20);
  assert.equal(split.commissionAmount, 10);
  assert.equal(split.driverNetAmount, 40);

  const commCat = finance.resolveCommissionPercentForRide(
    { platformCommissionPercent: 20, paymentMethodCommissionPercents: { pix: 15, dinheiro: 25 } },
    { commissionPercent: 18 },
    'pix'
  );
  assert.equal(commCat, 15);
});

test('realtimeHub: publish respeita escopo por rideId e atualiza métricas', () => {
  const beforeCount = realtimeHub.getStats().totalEventsPublished;
  const received = [];
  const handler = (item) => {
    received.push(item);
  };
  realtimeHub.hubEmitter.on('*', handler);

  try {
    const evt = realtimeHub.publish('chat:message', { rideId: 'UP-900', text: 'Oi' }, { rideId: 'UP-900' });
    assert.equal(evt.type, 'chat:message');
    assert.equal(evt.text, 'Oi');
    assert.equal(received.length, 1);
    assert.equal(received[0].scope.rideId, 'UP-900');
    assert.equal(realtimeHub.getStats().totalEventsPublished, beforeCount + 1);
  } finally {
    realtimeHub.hubEmitter.off('*', handler);
  }
});

test('GET /api/health retorna diagnóstico de prontidão e status SSE', async () => {
  const { status, json } = await apiJson('/api/health');
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.storage, 'local_json');
  assert.equal(typeof json.uptimeSeconds, 'number');
  assert.equal(typeof json.realtime?.activeConnections, 'number');
  assert.equal(typeof json.services?.turnstileConfigured, 'boolean');
});

test('GET /api/realtime/stream isola anonimos e entrega eventos apenas com escopo autorizado', async () => {
  // 1) Visitante anônimo tentando forçar ?rideId=UP-901 NÃO pode receber chat:message
  await new Promise((resolve, reject) => {
    const req = http.get(`${baseUrl}/api/realtime/stream?rideId=UP-901`, (res) => {
      assert.equal(res.statusCode, 200);
      let buffer = '';
      let sentPublish = false;
      const doneTimer = setTimeout(() => {
        req.destroy();
        assert.ok(buffer.includes('"viewerRole":"anon"'));
        assert.ok(!buffer.includes('event: chat:message'), 'SSE anônimo não deve receber chat:message privado');
        resolve();
      }, 220);

      res.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        if (!sentPublish && buffer.includes('event: connected')) {
          sentPublish = true;
          realtimeHub.publish('chat:message', { rideId: 'UP-901', message: { id: 'm-anon', text: 'Segredo!' } }, { rideId: 'UP-901' });
        }
      });

      res.on('error', (err) => {
        if (err && err.code === 'ECONNRESET') return;
        clearTimeout(doneTimer);
        reject(err);
      });
    });

    activeSseRequests.add(req);
    req.on('close', () => activeSseRequests.delete(req));
  });

  // 2) Espectador com token de rastreamento assinado da corrida recebe chat:message ao vivo
  const trackToken = security.signTrackingToken('ride', 'UP-901');
  await new Promise((resolve, reject) => {
    const req = http.get(`${baseUrl}/api/realtime/stream?rideId=UP-901&t=${encodeURIComponent(trackToken)}`, (res) => {
      assert.equal(res.statusCode, 200);
      assert.ok(String(res.headers['content-type'] || '').includes('text/event-stream'));

      let buffer = '';
      let sentPublish = false;

      const timer = setTimeout(() => {
        req.destroy();
        reject(new Error(`Timeout aguardando eventos SSE. Buffer recebido: ${buffer}`));
      }, 4000);

      res.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        if (!sentPublish && buffer.includes('event: connected')) {
          sentPublish = true;
          realtimeHub.publish('chat:message', { rideId: 'UP-901', message: { id: 'm-1', text: 'Olá!' } }, { rideId: 'UP-901' });
        }
        if (buffer.includes('event: chat:message') && buffer.includes('Olá!')) {
          clearTimeout(timer);
          req.destroy();
          resolve();
        }
      });

      res.on('error', (err) => {
        if (err && err.code === 'ECONNRESET') return;
        clearTimeout(timer);
        reject(err);
      });
    });

    activeSseRequests.add(req);
    req.on('close', () => activeSseRequests.delete(req));
    req.on('error', (err) => {
      if (err && err.code === 'ECONNRESET') return;
      reject(err);
    });
  });
});

test('Fluxo Auth + Recuperação de Senha via OTP + Chat Persistido + Avaliação Real do Passageiro', async () => {
  // 1. Seed de motorista aprovado isolado para o teste
  const testDriverId = 'drv-test-999';
  db.localStore.drivers = db.localStore.drivers.filter(d => d.id !== testDriverId);
  db.localStore.drivers.push({
    id: testDriverId,
    name: 'Motorista Teste',
    phone: '(48) 99111-2233',
    email: 'motorista.teste@kavro.test',
    document: '12345678909',
    cnh: '99887766554',
    password_hash: scryptHash('1234'),
    photo: '',
    vehicle_brand: 'Hyundai',
    vehicle_model: 'HB20S 1.0',
    vehicle_color: 'Branco',
    vehicle_year: '2024',
    vehicle_plate: 'TST1A23',
    vehicle_category: 'standard',
    eligible_categories: ['kavro_go', 'standard'],
    approval_status: 'aprovado',
    financial_blocked: false,
    is_online: true,
    rating: 5.0,
    total_rides: 10,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  // 2. Registro do passageiro
  const regRes = await apiJson('/api/clients/register', {
    method: 'POST',
    body: {
      name: 'Lucas Passageiro',
      phone: '(48) 99222-3344',
      document: '111.444.777-35',
      email: 'lucas.teste@kavro.test',
      password: 'senhaAntiga123',
      termsAcceptance: { accepted: true, version: '2026.1' }
    }
  });
  assert.equal(regRes.status, 200);
  assert.equal(regRes.json.ok, true);
  assert.ok(regRes.json.clientToken);
  const clientId = regRes.json.client.id;

  // 3. Solicitação de recuperação via OTP -> código inválido falha -> código válido redefine senha -> login funciona
  const reqOtp = await apiJson('/api/auth/recovery/request', {
    method: 'POST',
    body: { role: 'client', identifier: 'lucas.teste@kavro.test' }
  });
  assert.equal(reqOtp.status, 200);
  assert.equal(reqOtp.json.ok, true);
  assert.match(String(reqOtp.json.devCode || ''), /^\d{6}$/);

  const wrongReset = await apiJson('/api/auth/recovery/reset', {
    method: 'POST',
    body: {
      role: 'client',
      identifier: 'lucas.teste@kavro.test',
      code: '000000',
      newPassword: 'novaSenha456'
    }
  });
  assert.equal(wrongReset.status, 401);

  const okReset = await apiJson('/api/auth/recovery/reset', {
    method: 'POST',
    body: {
      role: 'client',
      identifier: 'lucas.teste@kavro.test',
      code: reqOtp.json.devCode,
      newPassword: 'novaSenha456'
    }
  });
  assert.equal(okReset.status, 200);
  assert.equal(okReset.json.ok, true);

  const loginNew = await apiJson('/api/clients/login', {
    method: 'POST',
    body: { identifier: 'lucas.teste@kavro.test', password: 'novaSenha456' }
  });
  assert.equal(loginNew.status, 200);
  assert.equal(loginNew.json.ok, true);
  const clientToken = loginNew.json.clientToken;

  // 4. Passageiro cria corrida (sem nota falsa inicial)
  const createRide = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': clientToken },
    body: {
      clientId,
      clientName: 'Lucas Passageiro',
      clientPhone: '(48) 99222-3344',
      originAddress: 'Rua A, 100 - Centro',
      destinationAddress: 'Av B, 200 - Bairro',
      distanceKm: 5.2,
      durationMin: 12,
      totalPrice: 24.5,
      category: 'kavro_go',
      paymentMethod: 'dinheiro'
    }
  });
  assert.equal(createRide.status, 200);
  assert.equal(createRide.json.ok, true);
  const rideId = createRide.json.ride.id;
  assert.equal(createRide.json.ride.clientRating ?? null, null);

  // 5. Login do motorista e aceite da corrida
  const drvLogin = await apiJson('/api/drivers/login', {
    method: 'POST',
    body: { identifier: 'motorista.teste@kavro.test', password: '1234' }
  });
  assert.equal(drvLogin.status, 200);
  const driverToken = drvLogin.json.driverToken;

  const acceptRes = await apiJson(`/api/rides/${encodeURIComponent(rideId)}/accept`, {
    method: 'POST',
    headers: { 'x-driver-token': driverToken },
    body: { driverId: testDriverId }
  });
  assert.equal(acceptRes.status, 200);
  assert.equal(acceptRes.json.ride.driverId, testDriverId);

  // 6. Chat bidirecional real persistido em banco + histórico GET
  const msgFromClient = await apiJson(`/api/rides/${encodeURIComponent(rideId)}/messages`, {
    method: 'POST',
    headers: { 'x-client-token': clientToken },
    body: { text: 'Estou no portão azul', senderRole: 'client', senderName: 'Lucas Passageiro' }
  });
  assert.equal(msgFromClient.status, 200);
  assert.equal(msgFromClient.json.message.sender, 'client');

  const msgFromDriver = await apiJson(`/api/rides/${encodeURIComponent(rideId)}/messages`, {
    method: 'POST',
    headers: { 'x-driver-token': driverToken },
    body: { text: 'Chegando em 2 minutos!', senderRole: 'driver', senderName: 'Motorista Teste' }
  });
  assert.equal(msgFromDriver.status, 200);
  assert.equal(msgFromDriver.json.message.sender, 'driver');

  const chatHistory = await apiJson(`/api/rides/${encodeURIComponent(rideId)}/messages`, {
    headers: { 'x-client-token': clientToken }
  });
  assert.equal(chatHistory.status, 200);
  assert.equal(chatHistory.json.messages.length, 2);
  assert.equal(chatHistory.json.messages[0].text, 'Estou no portão azul');
  assert.equal(chatHistory.json.messages[1].text, 'Chegando em 2 minutos!');

  // 7. Motorista avalia o passageiro e a média real (clientRating) é persistida no passageiro
  const rateClient = await apiJson(`/api/rides/${encodeURIComponent(rideId)}/rate`, {
    method: 'POST',
    headers: { 'x-driver-token': driverToken },
    body: {
      stars: 4,
      raterRole: 'motorista',
      comment: 'Passageiro pontual',
      tags: ['Pontual']
    }
  });
  assert.equal(rateClient.status, 200);
  assert.equal(rateClient.json.ok, true);
  assert.equal(rateClient.json.updatedClientRating, 4);

  const ridesList = await apiJson('/api/rides', {
    headers: { 'x-driver-token': driverToken }
  });
  assert.equal(ridesList.status, 200);
  const updatedRide = ridesList.json.find(r => r.id === rideId);
  assert.ok(updatedRide);
  assert.equal(updatedRide.clientRating, 4);
});

test('Taxas financeiras por meio de pagamento e saque são aplicadas em corridas e repasses', async () => {
  const prevConfig = db.localStore.system_config?.default?.config || {};

  // Configura taxas específicas persistidas no system_config: PIX 12%, Crédito 18%, Débito 14%, Dinheiro 25%, Saque: R$ 2,00 + 1%
  const newConfig = {
    ...prevConfig,
    platformCommissionPercent: 20,
    paymentMethodCommissionPercents: {
      pix: 12,
      cartao_credito: 18,
      cartao_debito: 14,
      dinheiro: 25
    },
    withdrawalFeeFixed: 2,
    withdrawalFeePercent: 1,
    minWithdrawalAmount: 10,
    driverWithdrawalEnabled: true,
    driverWithdrawalWeekdays: [0, 1, 2, 3, 4, 5, 6],
    activePaymentMethods: ['pix', 'cartao_credito', 'cartao_debito', 'dinheiro']
  };
  await db.query(
    `INSERT INTO public.system_config (id, config, updated_at) VALUES ('default', $1, NOW())
     ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW();`,
    [JSON.stringify(newConfig)]
  );

  // Registra passageiro real e solicita corrida PIX tentando enviar 20% legado -> backend deve impor 12%
  const cliReg = await apiJson('/api/clients/register', {
    method: 'POST',
    body: {
      name: 'Passageiro Taxas',
      phone: '(48) 99333-4455',
      document: '222.555.888-46',
      email: 'taxas.passageiro@kavro.test',
      password: 'senhaSegura123',
      termsAcceptance: { accepted: true, version: '2026.1' }
    }
  });
  assert.equal(cliReg.status, 200);
  const clientToken = cliReg.json.clientToken;

  const pixRideRes = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': clientToken },
    body: {
      clientId: cliReg.json.client.id,
      clientName: 'Passageiro Taxas',
      clientPhone: '(48) 99333-4455',
      originAddress: 'Centro',
      destinationAddress: 'Aeroporto',
      distanceKm: 25,
      durationMin: 24,
      time: '14:00',
      totalPrice: 100,
      commissionPercent: 20,
      category: 'kavro_go',
      paymentMethod: 'pix',
      isManualBooking: false
    }
  });
  assert.equal(pixRideRes.status, 200);
  assert.equal(pixRideRes.json.ride.commissionPercent, 12);
  assert.equal(pixRideRes.json.ride.commissionAmount, 12);
  assert.equal(pixRideRes.json.ride.driverNetAmount, 88);

  const txPix = await finance.getPaymentTxByRide(pixRideRes.json.ride.id);
  assert.equal(txPix.commissionPercent, 12);
  assert.equal(txPix.commissionAmount, 12);
  assert.equal(txPix.driverNetAmount, 88);

  // Autentica motorista real (drv-test-999 criado no teste anterior) e solicita saque PIX de R$ 50,00
  const drvLogin = await apiJson('/api/drivers/login', {
    method: 'POST',
    body: { identifier: 'motorista.teste@kavro.test', password: '1234' }
  });
  assert.equal(drvLogin.status, 200);
  const drvToken = drvLogin.json.driverToken;
  const drvId = drvLogin.json.driver.id;

  const drvRecord = await finance.getDriverById(drvId);
  await finance.saveDriverRecord({
    ...drvRecord,
    pixKey: '12345678909',
    pixType: 'cpf',
    pixKeys: [{
      id: 'pk-test-1',
      pixType: 'cpf',
      pixKey: '12345678909',
      bankName: 'Nubank',
      holderName: drvRecord.name,
      holderDocument: drvRecord.document,
      sameOwnershipConfirmed: true,
      isDefault: true,
      createdAt: new Date().toISOString()
    }]
  });

  await finance.recordLedgerEntry({
    idempotencyKey: `seed_credit_${Date.now()}`,
    driverId: drvId,
    driverName: drvRecord.name,
    entryType: 'ride_earning_credit',
    paymentMethod: 'pix',
    grossAmount: 100,
    commissionPercent: 12,
    commissionAmount: 12,
    driverNetAmount: 88,
    balanceDelta: 88,
    balanceBucket: 'available',
    status: 'confirmado',
    description: 'Crédito teste taxas saque'
  });

  const wdRes = await apiJson(`/api/drivers/${encodeURIComponent(drvId)}/withdrawals`, {
    method: 'POST',
    headers: { 'x-driver-token': drvToken },
    body: {
      amount: 50,
      pixKey: '12345678909',
      pixType: 'cpf'
    }
  });
  assert.equal(wdRes.status, 200);
  assert.equal(wdRes.json.ok, true);
  // Taxa = 1% de 50 (0.50) + fixo 2.00 = 2.50 -> Líquido = 47.50
  assert.equal(wdRes.json.withdrawal.feeAmount, 2.5);
  assert.equal(wdRes.json.withdrawal.netPayoutAmount, 47.5);
});

test('Multa de cancelamento, cashDeductFromBalanceFirst=false e Auditoria em Português com IDs do banco', async () => {
  const prevConfig = db.localStore.system_config?.default?.config || {};
  const nextConfig = {
    ...prevConfig,
    platformCommissionPercent: 20,
    paymentMethodCommissionPercents: {
      pix: 20,
      cartao_credito: 20,
      cartao_debito: 20,
      dinheiro: 20
    },
    cancellationFeeAmount: 12,
    cashDeductFromBalanceFirst: false,
    maxDriverDebtLimit: 100
  };
  await db.query(
    `INSERT INTO public.system_config (id, config, updated_at) VALUES ('default', $1, NOW())
     ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW();`,
    [JSON.stringify(nextConfig)]
  );

  // 1. Testa diff automático 100% português e gravação de registro de auditoria com ID/UUID/Checksum
  const diffs = audit.buildConfigChangesDiff(prevConfig, nextConfig);
  assert.ok(diffs.some(d => d.field === 'cancellationFeeAmount' && d.after.includes('12,00')));
  assert.ok(diffs.some(d => d.field === 'cashDeductFromBalanceFirst'));

  const auditRec = await audit.recordAuditEvent({
    category: 'taxas_financeiras',
    actionKey: 'system_config_updated',
    title: 'Alteração de Taxas Financeiras & Regras de Cobrança',
    summary: 'Multa de cancelamento definida para R$ 12,00 e regra de dinheiro sem abater saldo livre.',
    severity: 'atencao',
    actorRole: 'admin_master',
    actorId: 'adm-1',
    actorName: 'Administrador Master',
    actorEmail: 'appuberadmin@gmail.com',
    entityType: 'configuracao_sistema',
    entityId: 'system_config:default',
    changes: diffs
  });
  assert.ok(auditRec);
  assert.match(auditRec.auditCode, /^AUD-\d{6}$/);
  assert.ok(auditRec.auditUuid);
  assert.ok(auditRec.checksum);

  const verifiedAudit = await audit.verifyAuditRecord(auditRec.auditCode);
  assert.ok(verifiedAudit);
  assert.equal(verifiedAudit.integrityOk, true);

  // 2. Testa cashDeductFromBalanceFirst = false (saldo livre não é abatido pela comissão do dinheiro)
  const drvLogin = await apiJson('/api/drivers/login', {
    method: 'POST',
    body: { identifier: 'motorista.teste@kavro.test', password: '1234' }
  });
  assert.equal(drvLogin.status, 200);
  const drvToken = drvLogin.json.driverToken;
  const drvId = drvLogin.json.driver.id;

  const walletBeforeCash = await finance.getDriverWallet(drvId);
  const availBeforeCash = walletBeforeCash.availableBalance;

  await finance.settleCashRideToLedger(
    {
      id: 'UP-CASH-SEP-1',
      rideCode: '#UP - 901',
      driverId: drvId,
      driverName: 'Motorista Teste',
      clientName: 'Cliente Dinheiro',
      totalPrice: 50,
      commissionPercent: 20
    },
    50,
    'confirmado'
  );

  const walletAfterCash = await finance.getDriverWallet(drvId);
  // Saldo livre deve permanecer intacto; comissão de R$ 10 vai para dívida separada
  assert.equal(walletAfterCash.availableBalance, availBeforeCash);
  assert.equal(walletAfterCash.separateDebtBalance, 10);
  assert.equal(walletAfterCash.debtBalance, 10);

  // Quitação PIX da dívida zera o saldo devedor separado mantendo o saldo livre intacto
  await finance.confirmDriverDebtSettlementWebhook({
    driverId: drvId,
    amount: 10,
    gatewayTxId: 'gw_cash_debt_sep_1'
  });
  const walletAfterSettle = await finance.getDriverWallet(drvId);
  assert.equal(walletAfterSettle.availableBalance, availBeforeCash);
  assert.equal(walletAfterSettle.debtBalance, 0);

  // 3. Testa cobrança da multa de cancelamento (R$ 12,00) quando passageiro cancela corrida aceita
  const cliLogin = await apiJson('/api/clients/login', {
    method: 'POST',
    body: { identifier: 'taxas.passageiro@kavro.test', password: 'senhaSegura123' }
  });
  assert.equal(cliLogin.status, 200);
  const cliToken = cliLogin.json.clientToken;
  const cliId = cliLogin.json.client.id;

  const cashRide = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: {
      clientId: cliId,
      clientName: 'Passageiro Taxas',
      clientPhone: '(48) 99333-4455',
      originAddress: 'Centro',
      destinationAddress: 'Rodoviária',
      distanceKm: 6,
      durationMin: 12,
      totalPrice: 40,
      category: 'kavro_go',
      paymentMethod: 'dinheiro'
    }
  });
  assert.equal(cashRide.status, 200);
  const cancelRideId = cashRide.json.ride.id;

  const acceptCancelRide = await apiJson(`/api/rides/${encodeURIComponent(cancelRideId)}/accept`, {
    method: 'POST',
    headers: { 'x-driver-token': drvToken },
    body: { driverId: drvId }
  });
  assert.equal(acceptCancelRide.status, 200);

  const availBeforeCancelFee = (await finance.getDriverWallet(drvId)).availableBalance;
  const cancelRes = await apiJson(`/api/rides/${encodeURIComponent(cancelRideId)}/status`, {
    method: 'PATCH',
    headers: { 'x-client-token': cliToken },
    body: { status: 'cancelada' }
  });
  assert.equal(cancelRes.status, 200);
  assert.equal(cancelRes.json.cancellationFeeApplied, 12);
  assert.equal(cancelRes.json.ride.cancellationFeeApplied, 12);
  // 80% de R$ 12,00 = R$ 9,60 creditados para o motorista
  const availAfterCancelFee = (await finance.getDriverWallet(drvId)).availableBalance;
  assert.equal(Number((availAfterCancelFee - availBeforeCancelFee).toFixed(2)), 9.6);

  // Confirma que o cancelamento também entrou automaticamente na Auditoria em Português
  const listedAudit = await audit.listAuditLogs({ category: 'financeiro_corridas', search: cancelRideId });
  assert.ok(listedAudit.total >= 1);
  assert.ok(listedAudit.logs[0].title.includes('Cancelamento com multa aplicada'));
});

test('Seguranca Critica: blindagem de preco, anti-takeover, RBAC, webhook fail-closed e KYC/mensagens', async () => {
  // 1) Bloqueia account takeover no cadastro de motorista duplicado (inclusive motorista existente)
  const dupDrvRes = await apiJson('/api/drivers/register', {
    method: 'POST',
    body: {
      name: 'Invasor',
      phone: '(48) 99888-7766',
      email: 'motorista.teste@kavro.test',
      document: '12345678909',
      password: 'hack',
      vehicleBrand: 'VW',
      vehicleModel: 'Polo',
      vehiclePlate: 'DUP1D11',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(dupDrvRes.status, 409);

  // 2) /api/drivers/check não expõe CPF (document) nem placa (vehiclePlate)
  const chkDrvRes = await apiJson('/api/drivers/check', {
    method: 'POST',
    body: { identifier: 'motorista.teste@kavro.test' }
  });
  assert.equal(chkDrvRes.status, 200);
  assert.equal(chkDrvRes.json.found, true);
  assert.ok(!chkDrvRes.json.driver?.document, 'Não deve vazar CPF em /api/drivers/check');
  assert.ok(!chkDrvRes.json.driver?.vehiclePlate, 'Não deve vazar placa em /api/drivers/check');

  // 3) Cliente com password_hash=NULL não pode sofrer hijack no login nem sobrescrita via /register
  const noPwdClientId = `cli-nopwd-${Date.now()}`;
  await db.query(
    `INSERT INTO public.clients (id, name, phone, email, created_at) VALUES ($1, $2, $3, $4, NOW())`,
    [noPwdClientId, 'Sem Senha Original', '(48) 99123-4567', 'sem.senha@kavro.test']
  );

  const hijackLoginRes = await apiJson('/api/clients/login', {
    method: 'POST',
    body: { identifier: 'sem.senha@kavro.test', password: 'minha-senha-arbitraria' }
  });
  assert.equal(hijackLoginRes.status, 403);
  assert.equal(hijackLoginRes.json.code, 'PASSWORD_SETUP_REQUIRED');

  const hijackRegRes = await apiJson('/api/clients/register', {
    method: 'POST',
    body: {
      name: 'Atacante',
      phone: '(48) 99123-4567',
      document: '99933366610',
      email: 'sem.senha@kavro.test',
      password: 'hack',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(hijackRegRes.status, 409);

  const anonPostClient = await apiJson('/api/clients', {
    method: 'POST',
    body: { id: noPwdClientId, name: 'Atacante Direto', phone: '48999999999' }
  });
  assert.equal(anonPostClient.status, 401);

  // 4) Endpoints sensíveis rejeitam anônimos e headers forjáveis
  const kycLeak = await apiJson('/api/kyc/driver/drv-1001');
  assert.equal(kycLeak.status, 401);

  const sosLeak = await apiJson('/api/sos/alerts');
  assert.equal(sosLeak.status, 401);

  const notifCreateAnon = await apiJson('/api/notifications', {
    method: 'POST',
    body: { title: 'Falsa', message: 'Spam' }
  });
  assert.equal(notifCreateAnon.status, 401);

  const syncAnon = await apiJson('/api/sync');
  assert.equal(syncAnon.status, 200);
  assert.deepEqual(syncAnon.json.rides, []);

  // 5) Webhook Mercado Pago em produção sem secret falha fechado (401)
  const prevEnv = process.env.NODE_ENV;
  delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
  process.env.NODE_ENV = 'production';
  try {
    const mpFailClosed = await apiJson('/api/webhooks/mercadopago', {
      method: 'POST',
      body: { type: 'payment', data: { id: 'fake-1' } }
    });
    assert.equal(mpFailClosed.status, 401);
  } finally {
    process.env.NODE_ENV = prevEnv;
  }

  // 6) Servidor recalcula tarifa oficial (rejeita totalPrice: 0.01 adulterado) e impede gorjeta falsa/pagamento falso
  const cliRegSec = await apiJson('/api/clients/register', {
    method: 'POST',
    body: {
      name: 'Passageiro Blindagem',
      phone: '(48) 99555-1212',
      document: '33366699957',
      email: 'blindagem@kavro.test',
      password: '1234',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(cliRegSec.status, 200);
  const secCliToken = cliRegSec.json.clientToken;

  const tamperedRide = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': secCliToken },
    body: {
      clientId: cliRegSec.json.client.id,
      clientName: 'Passageiro Blindagem',
      clientPhone: '(48) 99555-1212',
      originAddress: 'Origem Real',
      destinationAddress: 'Destino Real',
      distanceKm: 10,
      durationMin: 10,
      totalPrice: 0.01,
      commissionPercent: 0,
      category: 'kavro_go',
      paymentMethod: 'pix'
    }
  });
  assert.equal(tamperedRide.status, 200);
  assert.ok(tamperedRide.json.ride.totalPrice >= 15, 'Servidor deve ignorar preço adulterado R$ 0,01');
  assert.ok(tamperedRide.json.ride.commissionPercent > 0, 'Servidor deve aplicar comissão oficial');

  const secRideId = tamperedRide.json.ride.id;
  // Spoofing via header x-client-id (mesmo sabendo o clientId real) deve ser bloqueado (401)
  const spoofChatRes = await apiJson(`/api/rides/${encodeURIComponent(secRideId)}/messages`, {
    method: 'GET',
    headers: { 'x-client-id': cliRegSec.json.client.id }
  });
  assert.equal(spoofChatRes.status, 401);

  // Gorjeta em corrida não finalizada deve falhar (400) e passageiro não pode forjar pagamento via PATCH /payment (403)
  const earlyTipRes = await apiJson(`/api/rides/${encodeURIComponent(secRideId)}/rate`, {
    method: 'POST',
    headers: { 'x-client-token': secCliToken },
    body: { role: 'client', rating: 5, tipAmount: 500 }
  });
  assert.equal(earlyTipRes.status, 400);

  const spoofPayRes = await apiJson(`/api/rides/${encodeURIComponent(secRideId)}/payment`, {
    method: 'PATCH',
    headers: { 'x-client-token': secCliToken },
    body: { paymentStatus: 'pago', paidAmount: 50 }
  });
  assert.equal(spoofPayRes.status, 403);
});

test('Operacao Uber Real: trava atomica de aceite simultaneo, PIN de embarque 4 digitos, saque atomico e LGPD', async () => {
  // Cria dois motoristas aprovados distintos para disputar a mesma corrida simultaneamente
  const drvEmailA = `disputa.a.${Date.now()}@kavro.test`;
  const drvEmailB = `disputa.b.${Date.now()}@kavro.test`;
  const regA = await apiJson('/api/drivers/register', {
    method: 'POST',
    body: {
      name: 'Motorista A',
      phone: '(48) 98111-1111',
      email: drvEmailA,
      document: '11122233344',
      password: '1234',
      vehicleBrand: 'VW',
      vehicleModel: 'Polo',
      vehiclePlate: 'AAA1A11',
      termsAcceptance: { accepted: true }
    }
  });
  const regB = await apiJson('/api/drivers/register', {
    method: 'POST',
    body: {
      name: 'Motorista B',
      phone: '(48) 98222-2222',
      email: drvEmailB,
      document: '55566677788',
      password: '1234',
      vehicleBrand: 'GM',
      vehicleModel: 'Onix',
      vehiclePlate: 'BBB2B22',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(regA.status, 200);
  assert.equal(regB.status, 200);

  const drvA = await finance.getDriverById(regA.json.driver.id);
  const drvB = await finance.getDriverById(regB.json.driver.id);
  await finance.saveDriverRecord({ ...drvA, approvalStatus: 'aprovado', kyc: { status: 'aprovado' } });
  await finance.saveDriverRecord({ ...drvB, approvalStatus: 'aprovado', kyc: { status: 'aprovado' } });

  const tokA = regA.json.driverToken;
  const tokB = regB.json.driverToken;

  const cliRegPin = await apiJson('/api/clients/register', {
    method: 'POST',
    body: {
      name: 'Passageiro PIN',
      phone: '(48) 98333-3333',
      document: '44477711107',
      email: `pin.${Date.now()}@kavro.test`,
      password: '1234',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(cliRegPin.status, 200);
  const pinCliToken = cliRegPin.json.clientToken;

  const createPinRide = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': pinCliToken },
    body: {
      clientId: cliRegPin.json.client.id,
      clientName: 'Passageiro PIN',
      clientPhone: '(48) 98333-3333',
      originAddress: 'Ponto A',
      destinationAddress: 'Ponto B',
      distanceKm: 5,
      durationMin: 10,
      category: 'kavro_go',
      paymentMethod: 'dinheiro'
    }
  });
  assert.equal(createPinRide.status, 200);
  const rideId = createPinRide.json.ride.id;
  const officialPin = createPinRide.json.ride.boardingPin;
  assert.match(String(officialPin || ''), /^\d{4}$/);

  // 1) Corrida de aceite atômico entre 2 motoristas simultaneamente
  const [accA, accB] = await Promise.all([
    apiJson(`/api/rides/${encodeURIComponent(rideId)}/accept`, {
      method: 'POST',
      headers: { 'x-driver-token': tokA },
      body: { driverId: drvA.id }
    }),
    apiJson(`/api/rides/${encodeURIComponent(rideId)}/accept`, {
      method: 'POST',
      headers: { 'x-driver-token': tokB },
      body: { driverId: drvB.id }
    })
  ]);
  const statuses = [accA.status, accB.status].sort();
  assert.deepEqual(statuses, [200, 409]);

  const winnerToken = accA.status === 200 ? tokA : tokB;
  const winnerRes = accA.status === 200 ? accA : accB;

  // Motorista vencedor NÃO recebe o boardingPin e recebe telefone do passageiro mascarado
  assert.equal(winnerRes.json.ride.boardingPin, undefined);
  assert.equal(winnerRes.json.ride.requiresBoardingPin, true);
  assert.equal(winnerRes.json.ride.clientPhone, '');
  assert.equal(winnerRes.json.ride.clientPhoneMasked, '••••-3333');

  // 2) Embarque exige o PIN correto de 4 dígitos
  const wrongPinRes = await apiJson(`/api/rides/${encodeURIComponent(rideId)}/status`, {
    method: 'PATCH',
    headers: { 'x-driver-token': winnerToken },
    body: { status: 'em_andamento', boardingPin: '0000' === officialPin ? '9999' : '0000' }
  });
  assert.equal(wrongPinRes.status, 400);

  const rightPinRes = await apiJson(`/api/rides/${encodeURIComponent(rideId)}/status`, {
    method: 'PATCH',
    headers: { 'x-driver-token': winnerToken },
    body: { status: 'em_andamento', boardingPin: officialPin }
  });
  assert.equal(rightPinRes.status, 200);
  assert.equal(rightPinRes.json.ride.status, 'em_andamento');

  // 3) Trava concorrente de saque impede duplicidade de saldo disponível
  const winnerDrvId = accA.status === 200 ? drvA.id : drvB.id;
  const winnerCpf = accA.status === 200 ? '11122233344' : '55566677788';
  await finance.saveDriverRecord({
    ...(await finance.getDriverById(winnerDrvId)),
    pixKey: winnerCpf,
    pixType: 'cpf',
    pixKeys: [{
      id: 'pk-conc-1',
      pixType: 'cpf',
      pixKey: winnerCpf,
      bankName: 'Inter',
      holderName: 'Motorista',
      isDefault: true
    }]
  });
  await finance.recordLedgerEntry({
    idempotencyKey: `credit_conc_${Date.now()}`,
    driverId: winnerDrvId,
    driverName: 'Motorista Disputa',
    entryType: 'ride_earning_credit',
    paymentMethod: 'pix',
    grossAmount: 100,
    commissionPercent: 0,
    commissionAmount: 0,
    driverNetAmount: 100,
    balanceDelta: 100,
    balanceBucket: 'available',
    status: 'confirmado',
    description: 'Saldo teste concorrencia'
  });

  const prevCfgConc = db.localStore.system_config?.default?.config || {};
  await db.query(
    `INSERT INTO public.system_config (id, config, updated_at) VALUES ('default', $1, NOW())
     ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW();`,
    [JSON.stringify({ ...prevCfgConc, driverWithdrawalEnabled: true, driverWithdrawalWeekdays: [0, 1, 2, 3, 4, 5, 6] })]
  );

  const [w1, w2] = await Promise.all([
    apiJson(`/api/drivers/${encodeURIComponent(winnerDrvId)}/withdrawals`, {
      method: 'POST',
      headers: { 'x-driver-token': winnerToken },
      body: { amount: 100, pixKey: winnerCpf, pixType: 'cpf' }
    }),
    apiJson(`/api/drivers/${encodeURIComponent(winnerDrvId)}/withdrawals`, {
      method: 'POST',
      headers: { 'x-driver-token': winnerToken },
      body: { amount: 100, pixKey: winnerCpf, pixType: 'cpf' }
    })
  ]);
  const wSuccessCount = [w1, w2].filter(x => x && x.status === 200 && x.json?.ok).length;
  assert.equal(wSuccessCount, 1, 'Apenas 1 dos 2 saques simultâneos pode ser aprovado');
  const finalWallet = await finance.getDriverWallet(winnerDrvId);
  assert.equal(finalWallet.availableBalance, 0);

  // 4) Exclusão LGPD bloqueada durante viagem ativa e liberada após finalização
  const lgpdBlocked = await apiJson('/api/privacy/delete-account', {
    method: 'POST',
    headers: { 'x-client-token': pinCliToken },
    body: { role: 'client' }
  });
  assert.equal(lgpdBlocked.status, 409);

  const finishRes = await apiJson(`/api/rides/${encodeURIComponent(rideId)}/status`, {
    method: 'PATCH',
    headers: { 'x-driver-token': winnerToken },
    body: { status: 'finalizada' }
  });
  assert.equal(finishRes.status, 200);
  const lgpdAllowed = await apiJson('/api/privacy/delete-account', {
    method: 'POST',
    headers: { 'x-client-token': pinCliToken },
    body: { role: 'client' }
  });
  assert.equal(lgpdAllowed.status, 200);
  assert.equal(lgpdAllowed.json.anonymized, true);
});

test('Seguranca em Rota: Contatos de Confianca automaticos via API + link /track + RideCheck desvio/timeout SOS', async () => {
  // 1) Cria passageiro e motorista aprovado
  const cliReg = await apiJson('/api/clients/register', {
    method: 'POST',
    body: {
      name: 'Mariana Segura',
      phone: '(48) 99777-8899',
      document: '55588822200',
      email: `mariana.segura.${Date.now()}@kavro.test`,
      password: '1234',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(cliReg.status, 200);
  const cliToken = cliReg.json.clientToken;
  const cliId = cliReg.json.client.id;

  // 2) Cadastra contatos de confiança (1 para todas as corridas, 1 apenas para alertas RideCheck/SOS)
  const tcSave = await apiJson(`/api/clients/${encodeURIComponent(cliId)}/trusted-contacts`, {
    method: 'PUT',
    headers: { 'x-client-token': cliToken },
    body: {
      trustedContacts: [
        {
          id: 'tc-all-1',
          name: 'Dona Helena (Mãe)',
          relationship: 'Mãe',
          phone: '(48) 99600-1122',
          autoShareAllRides: true,
          autoShareNightOnly: true,
          notifyOnAnomalyOrSos: true
        },
        {
          id: 'tc-sos-2',
          name: 'Carlos (Cônjuge)',
          relationship: 'Cônjuge',
          phone: '(48) 99600-3344',
          autoShareAllRides: false,
          autoShareNightOnly: false,
          notifyOnAnomalyOrSos: true
        }
      ]
    }
  });
  assert.equal(tcSave.status, 200);
  assert.equal(tcSave.json.trustedContacts.length, 2);

  const drvReg = await apiJson('/api/drivers/register', {
    method: 'POST',
    body: {
      name: 'Roberto Condutor',
      phone: '(48) 99555-7788',
      email: `roberto.rc.${Date.now()}@kavro.test`,
      document: '99887766554',
      password: '1234',
      vehicleBrand: 'Toyota',
      vehicleModel: 'Corolla',
      vehicleColor: 'Prata',
      vehiclePlate: 'KVR9A26',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(drvReg.status, 200);
  const drvToken = drvReg.json.driverToken;
  const drvObj = await finance.getDriverById(drvReg.json.driver.id);
  await finance.saveDriverRecord({ ...drvObj, approvalStatus: 'aprovado', kyc: { status: 'aprovado' } });

  // 3) Cria corrida entre dois pontos com coordenadas válidas (~11 km em linha reta)
  const rideCreate = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: {
      clientId: cliId,
      clientName: 'Mariana Segura',
      clientPhone: '(48) 99777-8899',
      origin: { address: 'Origem Central', lat: -28.4000, lng: -49.4000 },
      destination: { address: 'Destino Sul', lat: -28.5000, lng: -49.4000 },
      distanceKm: 11.1,
      durationMin: 18,
      category: 'kavro_go',
      paymentMethod: 'dinheiro'
    }
  });
  assert.equal(rideCreate.status, 200);
  const rideId = rideCreate.json.ride.id;
  const boardingPin = rideCreate.json.ride.boardingPin;

  const acceptRes = await apiJson(`/api/rides/${encodeURIComponent(rideId)}/accept`, {
    method: 'POST',
    headers: { 'x-driver-token': drvToken },
    body: { driverId: drvObj.id }
  });
  assert.equal(acceptRes.status, 200);

  // 4) Ao iniciar viagem (em_andamento), API dispara automaticamente o link /track/:id?t=... para contatos elegíveis
  const startRes = await apiJson(`/api/rides/${encodeURIComponent(rideId)}/status`, {
    method: 'PATCH',
    headers: { 'x-driver-token': drvToken },
    body: { status: 'em_andamento', boardingPin }
  });
  assert.equal(startRes.status, 200);
  assert.ok(Array.isArray(startRes.json.trustedContactsDispatches));
  assert.ok(startRes.json.trustedContactsDispatches.length >= 1, 'Pelo menos contato de envio em todas as viagens deve ser notificado');
  const firstDispatch = startRes.json.trustedContactsDispatches[0];
  assert.ok(firstDispatch.apiDelivered);
  assert.ok(firstDispatch.trackingUrl.includes(`/track/${rideId}?t=`));
  assert.ok(firstDispatch.whatsappUrl.includes('KVR9A26'));

  // 5) Familiar abre o link assinado /api/rides/:id/track?t=... sem estar logado e vê placa, motorista e rota sem vazar PIN
  const trackUrlObj = new URL(`http://localhost${firstDispatch.trackingUrl}`);
  const trackToken = trackUrlObj.searchParams.get('t');
  const trackRes = await apiJson(`/api/rides/${encodeURIComponent(rideId)}/track?t=${encodeURIComponent(trackToken)}`);
  assert.equal(trackRes.status, 200);
  assert.equal(trackRes.json.ride.driverPlate, 'KVR9A26');
  assert.equal(trackRes.json.ride.driverName, 'Roberto Condutor');
  assert.equal(trackRes.json.ride.boardingPin, undefined);
  assert.equal(trackRes.json.ride.totalPrice, undefined);
  assert.equal(trackRes.json.ride.paymentMethod, undefined);
  assert.equal(trackRes.json.ride.paymentStatus, undefined);
  assert.equal(trackRes.json.ride.trustedContactsDispatches, undefined);
  assert.equal(trackRes.json.ride.trackingReadOnly, true);

  // 6) GPS fora do corredor da rota (> 3km lateral e mais distante do destino) dispara RideCheck automaticamente
  const locOffRoute = await apiJson(`/api/rides/${encodeURIComponent(rideId)}/location`, {
    method: 'PATCH',
    headers: { 'x-driver-token': drvToken },
    body: {
      role: 'driver',
      location: {
        lat: -28.3400,
        lng: -49.3000,
        speedKmH: 62,
        heading: 45
      }
    }
  });
  assert.equal(locOffRoute.status, 200);
  assert.ok(locOffRoute.json.rideCheck, 'RideCheck deve ser disparado no desvio severo de rota');
  assert.equal(locOffRoute.json.rideCheck.reason, 'desvio_rota');
  assert.equal(locOffRoute.json.rideCheck.status, 'aguardando_resposta');

  // 7) Timeout de 60s sem resposta escala automaticamente para Central SOS e notifica todos contatos de emergência
  const timeoutEscRes = await apiJson(`/api/rides/${encodeURIComponent(rideId)}/ridecheck/respond`, {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: { decision: 'timeout', role: 'passageiro' }
  });
  assert.equal(timeoutEscRes.status, 200);
  assert.equal(timeoutEscRes.json.rideCheck.status, 'escalado_sos');
  assert.ok(timeoutEscRes.json.sosAlert?.id);
  assert.equal(timeoutEscRes.json.dispatches.length, 2, 'Ambos os contatos configurados para SOS/anomalias devem ser alertados');

  const dbAlert = await finance.getSosAlertByIdDb(timeoutEscRes.json.sosAlert.id);
  assert.ok(dbAlert, 'Alerta preventivo do RideCheck deve estar persistido no banco SOS');
  assert.equal(dbAlert.status, 'ativo');
});

test('Escala (100 -> 2000+ usuarios): amostragem inteligente de trilha GPS, despacho por raio e replay SSE ?since=', async () => {
  // 1) Cria passageiro e motorista com GPS em (-28.39, -49.39)
  const cliReg = await apiJson('/api/clients/register', {
    method: 'POST',
    body: {
      name: 'Passageiro Escala',
      phone: '(48) 99111-2233',
      document: '66699933310',
      email: `escala.cli.${Date.now()}@kavro.test`,
      password: '1234',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(cliReg.status, 200);
  const cliToken = cliReg.json.clientToken;
  const cliId = cliReg.json.client.id;

  const drvReg = await apiJson('/api/drivers/register', {
    method: 'POST',
    body: {
      name: 'Motorista Escala',
      phone: '(48) 99222-3344',
      email: `escala.drv.${Date.now()}@kavro.test`,
      document: '32165498700',
      password: '1234',
      vehicleBrand: 'Hyundai',
      vehicleModel: 'HB20',
      vehicleColor: 'Branco',
      vehiclePlate: 'SCL2E26',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(drvReg.status, 200);
  const drvToken = drvReg.json.driverToken;
  const drvObj = await finance.getDriverById(drvReg.json.driver.id);
  await finance.saveDriverRecord({
    ...drvObj,
    approvalStatus: 'aprovado',
    isOnline: true,
    location: { lat: -28.3900, lng: -49.3900, updatedAt: new Date().toISOString() },
    kyc: { status: 'aprovado' }
  });

  // 2) Despacho por raio: corrida próxima (~1.5km) aparece no radar; corrida a ~68km é filtrada fora
  const nearRideRes = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: {
      clientId: cliId,
      clientName: 'Passageiro Escala',
      clientPhone: '(48) 99111-2233',
      origin: { address: 'Origem Perto', lat: -28.4000, lng: -49.4000 },
      destination: { address: 'Destino Perto', lat: -28.4300, lng: -49.4000 },
      distanceKm: 3.5,
      durationMin: 8,
      category: 'kavro_go',
      paymentMethod: 'dinheiro'
    }
  });
  const farRideRes = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: {
      clientId: cliId,
      clientName: 'Passageiro Escala',
      clientPhone: '(48) 99111-2233',
      origin: { address: 'Origem Muito Longe', lat: -29.0000, lng: -49.4000 },
      destination: { address: 'Destino Longe', lat: -29.0300, lng: -49.4000 },
      distanceKm: 4.0,
      durationMin: 10,
      category: 'kavro_go',
      paymentMethod: 'dinheiro'
    }
  });
  assert.equal(nearRideRes.status, 200);
  assert.equal(farRideRes.status, 200);

  const syncDrv = await apiJson(`/api/sync?driverId=${encodeURIComponent(drvObj.id)}`, {
    method: 'GET',
    headers: { 'x-driver-token': drvToken }
  });
  assert.equal(syncDrv.status, 200);
  const visibleIds = syncDrv.json.rides.map(r => r.id);
  assert.ok(visibleIds.includes(nearRideRes.json.ride.id), 'Corrida próxima (~1.5km) deve aparecer no radar');
  assert.ok(!visibleIds.includes(farRideRes.json.ride.id), 'Corrida distante (~68km) não deve poluir o radar do motorista');

  // 3) Amostragem inteligente de trilha GPS (evita gravações duplicadas no mesmo ponto em <10s)
  const nearId = nearRideRes.json.ride.id;
  const acc = await apiJson(`/api/rides/${encodeURIComponent(nearId)}/accept`, {
    method: 'POST',
    headers: { 'x-driver-token': drvToken },
    body: { driverId: drvObj.id }
  });
  assert.equal(acc.status, 200);

  const startNear = await apiJson(`/api/rides/${encodeURIComponent(nearId)}/status`, {
    method: 'PATCH',
    headers: { 'x-driver-token': drvToken },
    body: { status: 'em_andamento', boardingPin: nearRideRes.json.ride.boardingPin }
  });
  assert.equal(startNear.status, 200);

  // 3 batidas rápidas na mesma coordenada (-28.4000, -49.4000): apenas a 1ª deve gravar em ride_trail_points
  for (let i = 0; i < 3; i++) {
    const locRes = await apiJson(`/api/rides/${encodeURIComponent(nearId)}/location`, {
      method: 'PATCH',
      headers: { 'x-driver-token': drvToken },
      body: { role: 'driver', location: { lat: -28.4000, lng: -49.4000, speedKmH: 25, heading: 90 } }
    });
    assert.equal(locRes.status, 200);
  }
  // 4ª batida com deslocamento > 100m (-28.4020): deve gravar o 2º ponto na trilha
  const movedRes = await apiJson(`/api/rides/${encodeURIComponent(nearId)}/location`, {
    method: 'PATCH',
    headers: { 'x-driver-token': drvToken },
    body: { role: 'driver', location: { lat: -28.4020, lng: -49.4000, speedKmH: 35, heading: 90 } }
  });
  assert.equal(movedRes.status, 200);

  const trailRes = await apiJson(`/api/rides/${encodeURIComponent(nearId)}/trail`, {
    method: 'GET',
    headers: { 'x-driver-token': drvToken }
  });
  assert.equal(trailRes.status, 200);
  assert.equal(trailRes.json.points.length, 2, 'Apenas 2 pontos devem ser gravados na trilha (1º inicial + deslocamento > 25m)');

  // 4) SSE Replay (?since=): evento publicado antes da reconexão é reentregue imediatamente se tsMs > since
  const beforeReplayTs = Date.now() - 50;
  realtimeHub.publish(
    'chat:message',
    { rideId: nearId, message: { id: 'm-replay-1', text: 'Mensagem recuperada apos queda!' } },
    { rideId: nearId, clientId: cliId, driverId: drvObj.id }
  );
  const trackTok = security.signTrackingToken('ride', nearId);
  await new Promise((resolve, reject) => {
    const req = http.get(
      `${baseUrl}/api/realtime/stream?rideId=${encodeURIComponent(nearId)}&t=${encodeURIComponent(trackTok)}&since=${beforeReplayTs}`,
      (res) => {
        assert.equal(res.statusCode, 200);
        let buf = '';
        const timer = setTimeout(() => {
          req.destroy();
          reject(new Error(`Timeout aguardando replay SSE ?since=. Recebido: ${buf}`));
        }, 3000);
        res.on('data', (chunk) => {
          buf += chunk.toString('utf8');
          if (buf.includes('Mensagem recuperada apos queda!')) {
            clearTimeout(timer);
            req.destroy();
            resolve();
          }
        });
        res.on('error', (err) => {
          if (err && err.code === 'ECONNRESET') return;
          clearTimeout(timer);
          reject(err);
        });
      }
    );
    activeSseRequests.add(req);
    req.on('close', () => activeSseRequests.delete(req));
  });
});

test('Taxa geral da plataforma com Valor Fixo + Porcentagem aplicada em PIX, Dinheiro e Auditoria', async () => {
  // 1) Regras unitárias de calculateSplit com porcentagem + fixo e trava contra negativo
  const splitCombo = finance.calculateSplit(100, 15, 2.5);
  assert.equal(splitCombo.commissionPercent, 15);
  assert.equal(splitCombo.commissionFixed, 2.5);
  assert.equal(splitCombo.commissionAmount, 17.5);
  assert.equal(splitCombo.driverNetAmount, 82.5);

  const splitCap = finance.calculateSplit(5, 20, 10);
  assert.equal(splitCap.commissionAmount, 5);
  assert.equal(splitCap.driverNetAmount, 0);

  const splitZero = finance.calculateSplit(0, 20, 2.5);
  assert.equal(splitZero.commissionAmount, 0);
  assert.equal(splitZero.driverNetAmount, 0);

  // 2) Configura taxa geral única (15% + R$ 2,50 fixo por corrida) e valida diff de auditoria + overview
  const prevConfig = db.localStore.system_config?.default?.config || {};
  const generalConfig = {
    ...prevConfig,
    baseFare: 8,
    pricePerKm: 3.2,
    pricePerMinute: 0.5,
    minimumFare: 15,
    nightSurchargePercent: 0,
    platformCommissionPercent: 15,
    platformCommissionFixed: 2.5,
    paymentMethodCommissionPercents: {
      pix: 15,
      cartao_credito: 15,
      cartao_debito: 15,
      dinheiro: 15
    },
    activePaymentMethods: ['pix', 'cartao_credito', 'cartao_debito', 'dinheiro']
  };
  await db.query(
    `INSERT INTO public.system_config (id, config, updated_at) VALUES ('default', $1, NOW())
     ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW();`,
    [JSON.stringify(generalConfig)]
  );

  const diffs = audit.buildConfigChangesDiff(prevConfig, generalConfig);
  assert.ok(diffs.some(d => d.field === 'platformCommissionFixed' && d.after.includes('2,50')));

  const overview = await finance.getPlatformFinancialOverview();
  assert.equal(overview.commissionPercent, 15);
  assert.equal(overview.commissionFixed, 2.5);

  // 3) Solicita corrida PIX (R$ 100,00) e Dinheiro (R$ 100,00) -> ambos aplicam 15% + R$ 2,50 = R$ 17,50 / R$ 82,50
  const cliReg = await apiJson('/api/clients/register', {
    method: 'POST',
    body: {
      name: 'Passageiro Taxa Geral',
      phone: '(48) 99555-7788',
      document: '77711144407',
      email: `taxageral.cli.${Date.now()}@kavro.test`,
      password: '1234',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(cliReg.status, 200);
  const cliToken = cliReg.json.clientToken;
  const cliId = cliReg.json.client.id;

  const drvReg = await apiJson('/api/drivers/register', {
    method: 'POST',
    body: {
      name: 'Motorista Taxa Geral',
      phone: '(48) 99666-7788',
      email: `taxageral.drv.${Date.now()}@kavro.test`,
      document: '98765432100',
      password: '1234',
      vehicleBrand: 'VW',
      vehicleModel: 'Polo',
      vehicleColor: 'Prata',
      vehiclePlate: 'TXG1A26',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(drvReg.status, 200);
  const drvToken = drvReg.json.driverToken;
  const drvObj = await finance.getDriverById(drvReg.json.driver.id);
  await finance.saveDriverRecord({
    ...drvObj,
    approvalStatus: 'aprovado',
    isOnline: true,
    kyc: { status: 'aprovado' }
  });

  const pixRide = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: {
      clientId: cliId,
      clientName: 'Passageiro Taxa Geral',
      clientPhone: '(48) 99555-7788',
      originAddress: 'Ponto A',
      destinationAddress: 'Ponto B',
      distanceKm: 25,
      durationMin: 24,
      time: '14:00',
      category: 'kavro_go',
      paymentMethod: 'pix'
    }
  });
  assert.equal(pixRide.status, 200);
  assert.equal(pixRide.json.ride.totalPrice, 100);
  assert.equal(pixRide.json.ride.commissionPercent, 15);
  assert.equal(pixRide.json.ride.commissionFixed, 2.5);
  assert.equal(pixRide.json.ride.commissionAmount, 17.5);
  assert.equal(pixRide.json.ride.driverNetAmount, 82.5);

  const txPix = await finance.getPaymentTxByRide(pixRide.json.ride.id);
  assert.equal(txPix.commissionAmount, 17.5);
  assert.equal(txPix.driverNetAmount, 82.5);

  const cashRide = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: {
      clientId: cliId,
      clientName: 'Passageiro Taxa Geral',
      clientPhone: '(48) 99555-7788',
      originAddress: 'Ponto C',
      destinationAddress: 'Ponto D',
      distanceKm: 25,
      durationMin: 24,
      time: '14:00',
      category: 'kavro_go',
      paymentMethod: 'dinheiro'
    }
  });
  assert.equal(cashRide.status, 200);
  const cashId = cashRide.json.ride.id;
  assert.equal(cashRide.json.ride.commissionFixed, 2.5);
  assert.equal(cashRide.json.ride.commissionAmount, 17.5);
  assert.equal(cashRide.json.ride.driverNetAmount, 82.5);

  const accCash = await apiJson(`/api/rides/${encodeURIComponent(cashId)}/accept`, {
    method: 'POST',
    headers: { 'x-driver-token': drvToken },
    body: { driverId: drvObj.id }
  });
  assert.equal(accCash.status, 200);

  const startCash = await apiJson(`/api/rides/${encodeURIComponent(cashId)}/status`, {
    method: 'PATCH',
    headers: { 'x-driver-token': drvToken },
    body: { status: 'em_andamento', boardingPin: cashRide.json.ride.boardingPin }
  });
  assert.equal(startCash.status, 200);

  const completeCash = await apiJson(`/api/rides/${encodeURIComponent(cashId)}/complete`, {
    method: 'POST',
    headers: { 'x-driver-token': drvToken },
    body: { driverId: drvObj.id, receivedCashAmount: 100 }
  });
  assert.equal(completeCash.status, 200);
  assert.equal(completeCash.json.ride.commissionFixed, 2.5);
  assert.equal(completeCash.json.ride.commissionAmount, 17.5);
  assert.equal(completeCash.json.ride.driverNetAmount, 82.5);
});

test('Gateway de Pagamentos completo (sem Stripe): tokenizacao de cartao, pre-autorizacao, PIX BRL e quitacao de divida', async () => {
  const prevCfg = db.localStore.system_config?.default?.config || {};
  await db.query(
    `INSERT INTO public.system_config (id, config, updated_at) VALUES ('default', $1, NOW())
     ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW();`,
    [JSON.stringify({
      ...prevCfg,
      platformCommissionPercent: 20,
      platformCommissionFixed: 0,
      paymentMethodCommissionPercents: { pix: 20, cartao_credito: 20, dinheiro: 20 },
      activePaymentMethods: ['pix', 'cartao_credito', 'carteira', 'dinheiro']
    })]
  );

  // 1) /api/payments/config nao expoe mais chaves Stripe e exige cartao somente a vista (1x)
  const cfgRes = await apiJson('/api/payments/config');
  assert.equal(cfgRes.status, 200);
  assert.ok(['efibank', 'mercadopago', 'sandbox'].includes(cfgRes.json.gatewayProvider));
  assert.equal(cfgRes.json.cardMaxInstallments, 1);
  assert.equal(cfgRes.json.cardOnlyAtSight, true);
  assert.equal(cfgRes.json.stripeEnabled, undefined);
  assert.equal(cfgRes.json.stripePublishableKey, undefined);

  // 2) Registra passageiro e motorista
  const cliReg = await apiJson('/api/clients/register', {
    method: 'POST',
    body: {
      name: 'Passageiro Pagamentos',
      phone: '(48) 99444-5566',
      document: '88822255500',
      email: `pay.cli.${Date.now()}@kavro.test`,
      password: '1234',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(cliReg.status, 200);
  const cliToken = cliReg.json.clientToken;
  const cliId = cliReg.json.client.id;

  const drvReg = await apiJson('/api/drivers/register', {
    method: 'POST',
    body: {
      name: 'Motorista Pagamentos',
      phone: '(48) 99444-6677',
      email: `pay.drv.${Date.now()}@kavro.test`,
      document: '44556677889',
      password: '1234',
      vehicleBrand: 'Toyota',
      vehicleModel: 'Corolla',
      vehicleColor: 'Preto',
      vehiclePlate: 'KVR2B26',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(drvReg.status, 200);
  const drvToken = drvReg.json.driverToken;
  const drvObj = await finance.getDriverById(drvReg.json.driver.id);
  await finance.saveDriverRecord({
    ...drvObj,
    approvalStatus: 'aprovado',
    isOnline: true,
    kyc: { status: 'aprovado' }
  });

  // 3) Tokenizacao direta de cartao de credito
  const cardSaveRes = await apiJson('/api/payments/cards', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: {
      clientId: cliId,
      holderName: 'PASSAGEIRO PAGAMENTOS',
      cardNumber: '4111111111114242',
      expMonth: '12',
      expYear: '2030',
      cvv: '123',
      cardType: 'cartao_credito'
    }
  });
  assert.equal(cardSaveRes.status, 200);
  assert.equal(cardSaveRes.json.card.brand, 'Visa');
  assert.equal(cardSaveRes.json.card.last4, '4242');

  // 4) Corrida no Cartao: pre-autoriza -> motorista aceita, inicia e finaliza -> captura
  const blockedInstallmentRide = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: {
      clientId: cliId,
      clientName: 'Passageiro Pagamentos',
      clientPhone: '(48) 99444-5566',
      originAddress: 'Origem Card',
      destinationAddress: 'Destino Card',
      distanceKm: 25,
      durationMin: 24,
      time: '14:00',
      category: 'kavro_go',
      paymentMethod: 'cartao_credito',
      cardId: cardSaveRes.json.card.id,
      installments: 2
    }
  });
  assert.equal(blockedInstallmentRide.status, 400);

  const cardRide = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: {
      clientId: cliId,
      clientName: 'Passageiro Pagamentos',
      clientPhone: '(48) 99444-5566',
      originAddress: 'Origem Card',
      destinationAddress: 'Destino Card',
      distanceKm: 25,
      durationMin: 24,
      time: '14:00',
      category: 'kavro_go',
      paymentMethod: 'cartao_credito',
      cardId: cardSaveRes.json.card.id
    }
  });
  assert.equal(cardRide.status, 200);
  assert.equal(cardRide.json.ride.paymentStatus, 'autorizado');
  const cardRideId = cardRide.json.ride.id;

  const accCard = await apiJson(`/api/rides/${encodeURIComponent(cardRideId)}/accept`, {
    method: 'POST',
    headers: { 'x-driver-token': drvToken },
    body: { driverId: drvObj.id }
  });
  assert.equal(accCard.status, 200);

  const startCard = await apiJson(`/api/rides/${encodeURIComponent(cardRideId)}/status`, {
    method: 'PATCH',
    headers: { 'x-driver-token': drvToken },
    body: { status: 'em_andamento', boardingPin: cardRide.json.ride.boardingPin }
  });
  assert.equal(startCard.status, 200);

  const completeCard = await apiJson(`/api/rides/${encodeURIComponent(cardRideId)}/complete`, {
    method: 'POST',
    headers: { 'x-driver-token': drvToken },
    body: { driverId: drvObj.id }
  });
  assert.equal(completeCard.status, 200);
  assert.equal(completeCard.json.ride.paymentStatus, 'confirmado');

  // 5) Cancelamento de pre-autorizacao antes de capturar
  const cancelHoldRide = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: {
      clientId: cliId,
      clientName: 'Passageiro Pagamentos',
      clientPhone: '(48) 99444-5566',
      originAddress: 'Origem Hold',
      destinationAddress: 'Destino Hold',
      distanceKm: 25,
      durationMin: 24,
      time: '14:00',
      category: 'kavro_go',
      paymentMethod: 'cartao_credito',
      cardId: cardSaveRes.json.card.id
    }
  });
  assert.equal(cancelHoldRide.status, 200);
  const cancelHoldRes = await apiJson(`/api/rides/${encodeURIComponent(cancelHoldRide.json.ride.id)}/status`, {
    method: 'PATCH',
    headers: { 'x-client-token': cliToken },
    body: { status: 'cancelada', cancelledBy: 'passenger' }
  });
  assert.equal(cancelHoldRes.status, 200);

  // 6) Corrida PIX + webhook de confirmacao
  const pixRide = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: {
      clientId: cliId,
      clientName: 'Passageiro Pagamentos',
      clientPhone: '(48) 99444-5566',
      originAddress: 'Origem Pix',
      destinationAddress: 'Destino Pix',
      distanceKm: 25,
      durationMin: 24,
      time: '14:00',
      category: 'kavro_go',
      paymentMethod: 'pix'
    }
  });
  assert.equal(pixRide.status, 200);
  assert.equal(pixRide.json.ride.status, 'aguardando_pagamento');
  assert.ok(String(pixRide.json.ride.pixCopyPaste || '').length > 20);

  const whConfirmRes = await apiJson('/api/payments/webhook', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: {
      event: 'payment.confirmed',
      rideId: pixRide.json.ride.id,
      amount: pixRide.json.ride.totalPrice,
      gatewayTxId: pixRide.json.ride.pixCopyPaste ? `gw_pix_${pixRide.json.ride.id}` : undefined
    }
  });
  assert.equal(whConfirmRes.status, 200);
  assert.equal(whConfirmRes.json.ok, true);
  assert.equal(whConfirmRes.json.ride.paymentStatus, 'confirmado');
  assert.equal(whConfirmRes.json.ride.status, 'aguardando_confirmacao');

  // 7) Quitacao de divida de motorista via PIX + webhook
  await finance.recordLedgerEntry({
    idempotencyKey: `debt_seed_${Date.now()}`,
    driverId: drvObj.id,
    driverName: drvObj.name,
    entryType: 'cash_commission_debit',
    paymentMethod: 'dinheiro',
    grossAmount: 50,
    commissionPercent: 20,
    commissionAmount: 10,
    driverNetAmount: 40,
    balanceDelta: -10,
    balanceBucket: 'cash_debt',
    status: 'confirmado',
    description: 'Divida dinheiro teste'
  });
  const debtPixRes = await apiJson(`/api/drivers/${encodeURIComponent(drvObj.id)}/debt/pix`, {
    method: 'POST',
    headers: { 'x-driver-token': drvToken },
    body: { amount: 10 }
  });
  assert.equal(debtPixRes.status, 200);
  assert.ok(String(debtPixRes.json.pixCopyPaste || '').length > 20);

  const debtWhRes = await apiJson('/api/payments/webhook', {
    method: 'POST',
    headers: { 'x-driver-token': drvToken },
    body: {
      event: 'debt.confirmed',
      driverId: drvObj.id,
      amount: 10,
      gatewayTxId: debtPixRes.json.gatewayTxId
    }
  });
  assert.equal(debtWhRes.status, 200);
  assert.equal(debtWhRes.json.wallet.debtBalance, 0);
});

test('Cadastro de Passageiro: exige CPF valido, bloqueia CPF invalido/duplicado e preenche Termo Digital', async () => {
  const ipHeaders = { 'x-forwarded-for': '203.0.113.42' };

  // 1) Rejeita cadastro sem CPF ou com CPF inválido
  const missingCpfRes = await apiJson('/api/clients/register', {
    method: 'POST',
    headers: ipHeaders,
    body: {
      name: 'Passageiro Sem CPF',
      phone: '(48) 99101-1010',
      email: `semcpf.${Date.now()}@kavro.test`,
      password: '1234',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(missingCpfRes.status, 400);

  const invalidCpfRes = await apiJson('/api/clients/register', {
    method: 'POST',
    headers: ipHeaders,
    body: {
      name: 'Passageiro CPF Falso',
      phone: '(48) 99101-2020',
      document: '111.111.111-11',
      email: `falso.${Date.now()}@kavro.test`,
      password: '1234',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(invalidCpfRes.status, 400);

  // 2) Registra com CPF válido e verifica gravação no perfil + assinatura dos termos
  const validRes = await apiJson('/api/clients/register', {
    method: 'POST',
    headers: ipHeaders,
    body: {
      name: 'Lucas CPF Verificado',
      phone: '(48) 99101-3030',
      document: '123.456.789-09',
      email: `cpfok.${Date.now()}@kavro.test`,
      password: '1234',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(validRes.status, 200);
  assert.equal(validRes.json.client.document, '12345678909');
  assert.equal(validRes.json.client.termsSignature?.passengerSnapshot?.cpf, '123.456.789-09');
  assert.equal(validRes.json.client.termsSignature?.passengerSnapshot?.rawCpf, '12345678909');

  // 3) Rejeita duplicidade pelo mesmo CPF mesmo com novo telefone/e-mail
  const dupCpfRes = await apiJson('/api/clients/register', {
    method: 'POST',
    headers: ipHeaders,
    body: {
      name: 'Outro Usuario Mesmo CPF',
      phone: '(48) 99101-4040',
      document: '12345678909',
      email: `dup.${Date.now()}@kavro.test`,
      password: '1234',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(dupCpfRes.status, 409);

  // 4) Conta legada sem CPF completa via /api/clients/complete-contact e atualiza assinatura digital
  const legacyId = `cli-legacy-cpf-${Date.now()}`;
  const legacyPassHash = scryptHash('1234');
  const legacySig = {
    signed: true,
    validationCode: 'KAVRO-PSG-OLD1-0000-0000',
    affirmativeAction: 'Li e concordo integralmente.',
    passengerSnapshot: { clientId: legacyId, name: 'Lucas Legado', cpf: 'Não informado', rawCpf: '' },
    technicalEvidence: { language: 'pt-BR', timezone: 'America/Sao_Paulo' }
  };
  await db.query(
    `INSERT INTO public.clients (id, name, phone, email, document, password_hash, saved_addresses, terms_accepted_at, terms_signature, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
    [legacyId, 'Lucas Legado', '(48) 99101-5050', `legacy.${Date.now()}@kavro.test`, null, legacyPassHash, '[]', new Date().toISOString(), JSON.stringify(legacySig)]
  );

  // Tenta completar com outro CPF válido não duplicado (precisa de um distinto válido; calculado mod-11)
  const completeBad = await apiJson('/api/clients/complete-contact', {
    method: 'POST',
    body: {
      clientId: legacyId,
      password: '1234',
      name: 'Lucas Legado',
      phone: '(48) 99101-5050',
      email: `legacy.upd.${Date.now()}@kavro.test`,
      document: '000.000.000-00'
    }
  });
  assert.equal(completeBad.status, 400);

  const completeOk = await apiJson('/api/clients/complete-contact', {
    method: 'POST',
    body: {
      clientId: legacyId,
      password: '1234',
      name: 'Lucas Legado',
      phone: '(48) 99101-5050',
      email: `legacy.upd.${Date.now()}@kavro.test`,
      document: '529.982.247-25'
    }
  });
  assert.equal(completeOk.status, 200);
  assert.equal(completeOk.json.client.document, '52998224725');
  assert.equal(completeOk.json.client.termsSignature?.passengerSnapshot?.cpf, '529.982.247-25');
});

test('Cancelamento pelo passageiro: zera multa antes do aceite, garante idempotência e bloqueia acessos indevidos', async () => {
  const ipHeaders1 = { 'x-forwarded-for': '198.51.100.88' };
  const ipHeaders2 = { 'x-forwarded-for': '198.51.100.89' };

  // Registra passageiro dono e outro passageiro distinto (CPFs mod-11 válidos não utilizados antes)
  const cli1Res = await apiJson('/api/clients/register', {
    method: 'POST',
    headers: ipHeaders1,
    body: {
      name: 'Passageiro Cancel 1',
      phone: '(48) 99202-1010',
      document: '98765432100',
      email: `cancel1.${Date.now()}@kavro.test`,
      password: '1234',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(cli1Res.status, 200);
  const cli1Token = cli1Res.json.clientToken;
  const cli1Id = cli1Res.json.client.id;

  const cli2Res = await apiJson('/api/clients/register', {
    method: 'POST',
    headers: ipHeaders2,
    body: {
      name: 'Passageiro Intruso 2',
      phone: '(48) 99202-2020',
      document: '01234567890',
      email: `cancel2.${Date.now()}@kavro.test`,
      password: '1234',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(cli2Res.status, 200);
  const cli2Token = cli2Res.json.clientToken;

  // Configura taxa de cancelamento pós-aceite > 0 para comprovar que antes do aceite é R$ 0,00
  const cfgBefore = db.localStore.system_config?.default?.config || {};
  await db.query(
    `INSERT INTO public.system_config (id, config, updated_at) VALUES ('default', $1, NOW())
     ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW();`,
    [JSON.stringify({ ...cfgBefore, cancellationFeeAmount: 12.5 })]
  );

  // 1) Corrida em busca de motorista (aguardando_confirmacao) cancelada sem multa
  const searchRideRes = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': cli1Token },
    body: {
      clientId: cli1Id,
      clientName: 'Passageiro Cancel 1',
      clientPhone: '(48) 99202-1010',
      originAddress: 'Rua Origem Cancelamento, 10',
      destinationAddress: 'Rua Destino Cancelamento, 90',
      distanceKm: 12,
      durationMin: 18,
      time: '15:00',
      category: 'kavro_go',
      paymentMethod: 'dinheiro'
    }
  });
  assert.equal(searchRideRes.status, 200);
  const searchRideId = searchRideRes.json.ride.id;
  assert.equal(searchRideRes.json.ride.status, 'aguardando_confirmacao');

  const cancelSearchRes = await apiJson(`/api/rides/${encodeURIComponent(searchRideId)}/status`, {
    method: 'PATCH',
    headers: { 'x-client-token': cli1Token },
    body: {
      status: 'cancelada',
      cancelledBy: 'passenger',
      cancellationReason: 'Demorando para encontrar motorista'
    }
  });
  assert.equal(cancelSearchRes.status, 200);
  assert.equal(cancelSearchRes.json.ride.status, 'cancelada');
  assert.equal(cancelSearchRes.json.cancellationFeeApplied, 0);
  assert.equal(cancelSearchRes.json.ride.cancelledBy, 'passenger');
  assert.equal(cancelSearchRes.json.ride.appliedFareSnapshot?.cancellationReason, 'Demorando para encontrar motorista');

  // Reenvio repetido pelo mesmo passageiro é idempotente
  const cancelRepeatRes = await apiJson(`/api/rides/${encodeURIComponent(searchRideId)}/status`, {
    method: 'PATCH',
    headers: { 'x-client-token': cli1Token },
    body: { status: 'cancelada', cancelledBy: 'passenger' }
  });
  assert.equal(cancelRepeatRes.status, 200);
  assert.equal(cancelRepeatRes.json.idempotent, true);

  // 2) Solicitação PIX pendente (aguardando_pagamento) cancelada sem multa
  const pixWaitRes = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': cli1Token },
    body: {
      clientId: cli1Id,
      clientName: 'Passageiro Cancel 1',
      clientPhone: '(48) 99202-1010',
      originAddress: 'Rua PIX Origem, 15',
      destinationAddress: 'Rua PIX Destino, 85',
      distanceKm: 8,
      durationMin: 12,
      time: '16:00',
      category: 'kavro_go',
      paymentMethod: 'pix'
    }
  });
  assert.equal(pixWaitRes.status, 200);
  const pixWaitId = pixWaitRes.json.ride.id;
  assert.equal(pixWaitRes.json.ride.status, 'aguardando_pagamento');

  const cancelPixWaitRes = await apiJson(`/api/rides/${encodeURIComponent(pixWaitId)}/status`, {
    method: 'PATCH',
    headers: { 'x-client-token': cli1Token },
    body: { status: 'cancelada', cancelledBy: 'passenger' }
  });
  assert.equal(cancelPixWaitRes.status, 200);
  assert.equal(cancelPixWaitRes.json.ride.status, 'cancelada');
  assert.equal(cancelPixWaitRes.json.cancellationFeeApplied, 0);
  assert.equal(cancelPixWaitRes.json.ride.cancelledBy, 'passenger');

  // 3) Regras de autorização e transição do passageiro
  const guardRideRes = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': cli1Token },
    body: {
      clientId: cli1Id,
      clientName: 'Passageiro Cancel 1',
      clientPhone: '(48) 99202-1010',
      originAddress: 'Origem Protegida',
      destinationAddress: 'Destino Protegido',
      distanceKm: 10,
      durationMin: 14,
      time: '17:00',
      category: 'kavro_go',
      paymentMethod: 'dinheiro'
    }
  });
  assert.equal(guardRideRes.status, 200);
  const guardRideId = guardRideRes.json.ride.id;

  // Terceiro não pode cancelar corrida de outro passageiro
  const intruderRes = await apiJson(`/api/rides/${encodeURIComponent(guardRideId)}/status`, {
    method: 'PATCH',
    headers: { 'x-client-token': cli2Token },
    body: { status: 'cancelada', cancelledBy: 'passenger' }
  });
  assert.equal(intruderRes.status, 401);

  // Anônimo não pode cancelar
  const anonRes = await apiJson(`/api/rides/${encodeURIComponent(guardRideId)}/status`, {
    method: 'PATCH',
    body: { status: 'cancelada', cancelledBy: 'passenger' }
  });
  assert.equal(anonRes.status, 401);

  // Passageiro não pode forjar transição para finalizada
  const forgeStatusRes = await apiJson(`/api/rides/${encodeURIComponent(guardRideId)}/status`, {
    method: 'PATCH',
    headers: { 'x-client-token': cli1Token },
    body: { status: 'finalizada' }
  });
  assert.equal(forgeStatusRes.status, 403);

  // Passageiro não pode cancelar viagem que já está em_andamento
  await db.query(`UPDATE public.rides SET status = $1 WHERE id = $2`, ['em_andamento', guardRideId]);
  const inProgressCancelRes = await apiJson(`/api/rides/${encodeURIComponent(guardRideId)}/status`, {
    method: 'PATCH',
    headers: { 'x-client-token': cli1Token },
    body: { status: 'cancelada', cancelledBy: 'passenger' }
  });
  assert.equal(inProgressCancelRes.status, 400);

  // Restaura configuração anterior
  await db.query(
    `INSERT INTO public.system_config (id, config, updated_at) VALUES ('default', $1, NOW())
     ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW();`,
    [JSON.stringify(cfgBefore)]
  );
});

test('Alteração de rota (origem/destino) antes do início recalcula tarifa oficial, valida PIX/permissões e bloqueia pós-embarque', async () => {
  const ip1 = { 'x-forwarded-for': '198.51.100.91' };
  const ip2 = { 'x-forwarded-for': '198.51.100.92' };

  const ownerRes = await apiJson('/api/clients/register', {
    method: 'POST',
    headers: ip1,
    body: {
      name: 'Passageiro Rota 1',
      phone: '(48) 99303-1111',
      document: '24681357928',
      email: `rota1.${Date.now()}@kavro.test`,
      password: '1234',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(ownerRes.status, 200);
  const ownerToken = ownerRes.json.clientToken;
  const ownerId = ownerRes.json.client.id;

  const otherRes = await apiJson('/api/clients/register', {
    method: 'POST',
    headers: ip2,
    body: {
      name: 'Passageiro Terceiro',
      phone: '(48) 99303-2222',
      document: '71428593691',
      email: `rota2.${Date.now()}@kavro.test`,
      password: '1234',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(otherRes.status, 200);
  const otherToken = otherRes.json.clientToken;

  // 1) Corrida em dinheiro aguardando_confirmacao -> altera destino mais distante -> tarifa sobe autoritativamente no backend
  const cashCreate = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': ownerToken },
    body: {
      clientId: ownerId,
      clientName: 'Passageiro Rota 1',
      clientPhone: '(48) 99303-1111',
      origin: { address: 'Lauro Muller Centro', lat: -28.3912, lng: -49.3935 },
      destination: { address: 'Guatá', lat: -28.3740, lng: -49.3650 },
      distanceKm: 5,
      durationMin: 8,
      time: '14:00',
      category: 'kavro_go',
      paymentMethod: 'dinheiro'
    }
  });
  assert.equal(cashCreate.status, 200);
  const rideId = cashCreate.json.ride.id;
  const oldPrice = cashCreate.json.ride.totalPrice;

  const updateRouteRes = await apiJson(`/api/rides/${encodeURIComponent(rideId)}/route`, {
    method: 'PATCH',
    headers: { 'x-client-token': ownerToken },
    body: {
      destination: { address: 'Orleans Centro', lat: -28.3586, lng: -49.2914 },
      distanceKm: 18,
      durationMin: 24
    }
  });
  assert.equal(updateRouteRes.status, 200);
  assert.equal(updateRouteRes.json.ride.destination.address, 'Orleans Centro');
  assert.ok(updateRouteRes.json.ride.totalPrice > oldPrice);
  assert.equal(updateRouteRes.json.ride.estimatedPrice, oldPrice);
  assert.equal(updateRouteRes.json.ride.appliedFareSnapshot?.routeAdjusted, true);

  // Terceiro não pode alterar rota de outra pessoa
  const intruderRouteRes = await apiJson(`/api/rides/${encodeURIComponent(rideId)}/route`, {
    method: 'PATCH',
    headers: { 'x-client-token': otherToken },
    body: { destination: { address: 'Destino Invasor', lat: -28.41, lng: -49.31 } }
  });
  assert.equal(intruderRouteRes.status, 401);

  // Depois que viagem inicia (em_andamento), não permite alterar via pré-embarque
  await db.query(`UPDATE public.rides SET status = $1 WHERE id = $2`, ['em_andamento', rideId]);
  const startedRouteRes = await apiJson(`/api/rides/${encodeURIComponent(rideId)}/route`, {
    method: 'PATCH',
    headers: { 'x-client-token': ownerToken },
    body: { destination: { address: 'Criciuma Centro', lat: -28.6775, lng: -49.3697 } }
  });
  assert.equal(startedRouteRes.status, 400);

  // 2) Solicitação PIX aguardando_pagamento permite alterar destino e atualiza valor do PIX
  const pixCreate = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': ownerToken },
    body: {
      clientId: ownerId,
      clientName: 'Passageiro Rota 1',
      clientPhone: '(48) 99303-1111',
      origin: { address: 'Orleans Rodoviaria', lat: -28.3586, lng: -49.2914 },
      destination: { address: 'Braço do Norte', lat: -28.2738, lng: -49.1665 },
      distanceKm: 18,
      durationMin: 22,
      time: '15:00',
      category: 'kavro_go',
      paymentMethod: 'pix'
    }
  });
  assert.equal(pixCreate.status, 200);
  const pixRideId = pixCreate.json.ride.id;
  const oldPixPrice = pixCreate.json.ride.totalPrice;

  const pixUpdateRes = await apiJson(`/api/rides/${encodeURIComponent(pixRideId)}/route`, {
    method: 'PATCH',
    headers: { 'x-client-token': ownerToken },
    body: {
      destination: { address: 'Criciuma Shopping', lat: -28.6820, lng: -49.3730 },
      distanceKm: 42,
      durationMin: 48
    }
  });
  assert.equal(pixUpdateRes.status, 200);
  assert.ok(pixUpdateRes.json.ride.totalPrice > oldPixPrice);
  assert.equal(pixUpdateRes.json.ride.status, 'aguardando_pagamento');

  // 3) PIX já pago não permite aumentar trajeto sem novo pagamento, mas permite destino mais curto com estorno parcial
  const pixPayConfirm = await apiJson('/api/payments/webhook', {
    method: 'POST',
    headers: { 'x-client-token': ownerToken },
    body: {
      event: 'payment.confirmed',
      rideId: pixRideId,
      amount: pixUpdateRes.json.ride.totalPrice,
      gatewayTxId: `gw_pix_route_${Date.now()}`
    }
  });
  assert.equal(pixPayConfirm.status, 200);
  assert.equal(pixPayConfirm.json.ride.paymentStatus, 'confirmado');

  const paidPixHigher = await apiJson(`/api/rides/${encodeURIComponent(pixRideId)}/route`, {
    method: 'PATCH',
    headers: { 'x-client-token': ownerToken },
    body: {
      destination: { address: 'Florianópolis', lat: -27.5954, lng: -48.5480 },
      distanceKm: 190,
      durationMin: 160
    }
  });
  assert.equal(paidPixHigher.status, 400);

  const paidPixShorter = await apiJson(`/api/rides/${encodeURIComponent(pixRideId)}/route`, {
    method: 'PATCH',
    headers: { 'x-client-token': ownerToken },
    body: {
      destination: { address: 'Lauro Muller Praça', lat: -28.3912, lng: -49.3935 },
      distanceKm: 15,
      durationMin: 18
    }
  });
  assert.equal(paidPixShorter.status, 200);
  assert.ok(paidPixShorter.json.ride.totalPrice < pixUpdateRes.json.ride.totalPrice);
});

test('Central de Segurança completa: K-Código personalizado/toggle, K-Áudio, K-Ajuda toggle, Contatos de Emergência e Perfil Familiar', async () => {
  const ipSafetyCli = { 'x-forwarded-for': '198.51.100.120' };
  const ipSafetyDrv = { 'x-forwarded-for': '198.51.100.121' };
  const ipOtherCli = { 'x-forwarded-for': '198.51.100.122' };

  const makeTestCpf = (seedNum) => {
    const base = String(seedNum).replace(/\D/g, '').padStart(9, '5').slice(-9).split('').map(Number);
    if (new Set(base).size === 1) base[8] = (base[8] + 1) % 10;
    const calc = (arr) => {
      let s = 0;
      for (let i = 0; i < arr.length; i++) s += arr[i] * (arr.length + 1 - i);
      return ((s * 10) % 11) % 10;
    };
    const d1 = calc(base);
    const d2 = calc([...base, d1]);
    return [...base, d1, d2].join('');
  };
  const uniqueSeed = Math.floor((Date.now() % 800000000) + 100000000);

  const regCli = await apiJson('/api/clients/register', {
    method: 'POST',
    headers: ipSafetyCli,
    body: {
      name: 'Passageiro Central Seg',
      phone: '(48) 99444-1122',
      document: makeTestCpf(uniqueSeed),
      email: `safety.cli.${Date.now()}@kavro.test`,
      password: '1234',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(regCli.status, 200);
  const cliId = regCli.json.client.id;
  const cliToken = regCli.json.clientToken;

  const regOther = await apiJson('/api/clients/register', {
    method: 'POST',
    headers: ipOtherCli,
    body: {
      name: 'Invasor Seguranca',
      phone: '(48) 99444-3344',
      document: makeTestCpf(uniqueSeed + 17),
      email: `safety.other.${Date.now()}@kavro.test`,
      password: '1234',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(regOther.status, 200);
  const otherToken = regOther.json.clientToken;

  const drvReg = await apiJson('/api/drivers/register', {
    method: 'POST',
    headers: ipSafetyDrv,
    body: {
      name: 'Motorista Seguranca',
      phone: '(48) 99555-2211',
      email: `safety.drv.${Date.now()}@kavro.test`,
      document: makeTestCpf(uniqueSeed + 31),
      password: '1234',
      vehicleBrand: 'Hyundai',
      vehicleModel: 'HB20',
      vehicleColor: 'Branco',
      vehiclePlate: 'KVR4B88',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(drvReg.status, 200);
  const drvToken = drvReg.json.driverToken;
  const drvObj = await finance.getDriverById(drvReg.json.driver.id);
  await finance.saveDriverRecord({ ...drvObj, approvalStatus: 'aprovado', kyc: { status: 'aprovado' } });

  // 1) Outro usuário ou anônimo não acessa /api/clients/:id/safety
  const unauthSafety = await apiJson(`/api/clients/${encodeURIComponent(cliId)}/safety`);
  assert.equal(unauthSafety.status, 401);
  const wrongUserSafety = await apiJson(`/api/clients/${encodeURIComponent(cliId)}/safety`, {
    method: 'PUT',
    headers: { 'x-client-token': otherToken },
    body: { safetyPreferences: { boardingPinEnabled: false } }
  });
  assert.equal(wrongUserSafety.status, 401);

  // 2) Define K-Código personalizado ("9130"), K-Áudio ativo, K-Ajuda desligado temporariamente e Contato de Emergência
  const badPinSave = await apiJson(`/api/clients/${encodeURIComponent(cliId)}/safety`, {
    method: 'PUT',
    headers: { 'x-client-token': cliToken },
    body: { safetyPreferences: { customBoardingPin: '12' } }
  });
  assert.equal(badPinSave.status, 400);

  const saveSafetyRes = await apiJson(`/api/clients/${encodeURIComponent(cliId)}/safety`, {
    method: 'PUT',
    headers: { 'x-client-token': cliToken },
    body: {
      safetyPreferences: {
        boardingPinEnabled: true,
        customBoardingPin: '9130',
        audioRecordingEnabled: true,
        audioAutoRecord: true,
        rideCheckEnabled: false,
        familySafetyEnabled: false
      },
      emergencyContacts: [
        {
          id: 'ec-test-1',
          name: 'Maria Emergência',
          phone: '(48) 99888-7766',
          relationship: 'Mãe'
        }
      ]
    }
  });
  assert.equal(saveSafetyRes.status, 200);
  assert.equal(saveSafetyRes.json.safetyPreferences.customBoardingPin, '9130');
  assert.equal(saveSafetyRes.json.safetyPreferences.audioRecordingEnabled, true);
  assert.equal(saveSafetyRes.json.safetyPreferences.rideCheckEnabled, false);
  assert.equal(saveSafetyRes.json.emergencyContacts.length, 1);

  // 3) Corrida criada recebe o K-Código personalizado ("9130")
  const ride1Res = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: {
      clientId: cliId,
      clientName: 'Passageiro Central Seg',
      clientPhone: '(48) 99444-1122',
      origin: { address: 'Origem Seg', lat: -28.4000, lng: -49.4000 },
      destination: { address: 'Destino Seg', lat: -28.5000, lng: -49.4000 },
      distanceKm: 11.1,
      durationMin: 18,
      category: 'kavro_go',
      paymentMethod: 'dinheiro'
    }
  });
  assert.equal(ride1Res.status, 200);
  const ride1Id = ride1Res.json.ride.id;
  assert.equal(ride1Res.json.ride.boardingPin, '9130');
  assert.equal(ride1Res.json.ride.requiresBoardingPin, true);

  // 4) Desligar K-Código remove exigência de PIN inclusive na corrida pré-embarque e em novas corridas
  const disablePinRes = await apiJson(`/api/clients/${encodeURIComponent(cliId)}/safety`, {
    method: 'PUT',
    headers: { 'x-client-token': cliToken },
    body: { safetyPreferences: { boardingPinEnabled: false } }
  });
  assert.equal(disablePinRes.status, 200);
  assert.equal(disablePinRes.json.safetyPreferences.boardingPinEnabled, false);

  const acceptRide1 = await apiJson(`/api/rides/${encodeURIComponent(ride1Id)}/accept`, {
    method: 'POST',
    headers: { 'x-driver-token': drvToken },
    body: { driverId: drvObj.id }
  });
  assert.equal(acceptRide1.status, 200);
  assert.equal(acceptRide1.json.ride.requiresBoardingPin, false);

  // Motorista inicia viagem sem PIN porque o passageiro desativou K-Código
  const startNoPinRes = await apiJson(`/api/rides/${encodeURIComponent(ride1Id)}/status`, {
    method: 'PATCH',
    headers: { 'x-driver-token': drvToken },
    body: { status: 'em_andamento' }
  });
  assert.equal(startNoPinRes.status, 200);
  assert.equal(startNoPinRes.json.ride.status, 'em_andamento');

  // 5) K-Ajuda desligado não dispara RideCheck automático mesmo em coordenada fora de rota
  const offRouteNoRc = await apiJson(`/api/rides/${encodeURIComponent(ride1Id)}/location`, {
    method: 'PATCH',
    headers: { 'x-driver-token': drvToken },
    body: {
      role: 'driver',
      location: { lat: -28.3400, lng: -49.3000, speedKmH: 55, heading: 45 }
    }
  });
  assert.equal(offRouteNoRc.status, 200);
  assert.equal(offRouteNoRc.json.rideCheck, null);

  // 6) Passageiro registra K-Áudio vinculado à corrida e reativa Perfil Familiar (força K-Código obrigatório novamente)
  const audioPost = await apiJson(`/api/rides/${encodeURIComponent(ride1Id)}/safety-audio`, {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: {
      durationSec: 18,
      mimeType: 'audio/webm',
      sizeBytes: 32768,
      notes: 'Gravação de teste da Central',
      escalateToSos: true
    }
  });
  assert.equal(audioPost.status, 200);
  assert.equal(audioPost.json.record.durationSec, 18);
  assert.equal(audioPost.json.safetyAudioRecords.length, 1);

  const enableFamilyRes = await apiJson(`/api/clients/${encodeURIComponent(cliId)}/safety`, {
    method: 'PUT',
    headers: { 'x-client-token': cliToken },
    body: {
      safetyPreferences: {
        boardingPinEnabled: false,
        familySafetyEnabled: true,
        familyGuardianName: 'Pai Responsável',
        familyGuardianPhone: '(48) 99700-1122',
        rideCheckEnabled: true
      }
    }
  });
  assert.equal(enableFamilyRes.status, 200);
  assert.equal(enableFamilyRes.json.safetyPreferences.boardingPinEnabled, true);

  // Reatribuindo driver offline antes de nova corrida de teste e disparando SOS verifica notificação a contato de emergência
  const sosTrigger = await apiJson('/api/sos/location', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: {
      id: `sos-safety-${Date.now()}`,
      lat: -28.45,
      lng: -49.38,
      rideId: ride1Id,
      address: 'SC-390, Lauro Müller/SC'
    }
  });
  assert.equal(sosTrigger.status, 200);

  const listAfterSos = await apiJson('/api/rides', {
    headers: { 'x-client-token': cliToken }
  });
  assert.equal(listAfterSos.status, 200);
  const rideAfterSos = Array.isArray(listAfterSos.json)
    ? listAfterSos.json.find((r) => r.id === ride1Id)
    : null;
  assert.ok(rideAfterSos);
  assert.ok(
    (rideAfterSos.trustedContactsDispatches || []).some((d) =>
      String(d.contactName || '').includes('Maria Emergência')
    ),
    'Contato de emergência deve ser notificado automaticamente quando SOS é disparado na corrida'
  );
});

test('Perfil Familiar (Adolescentes 12-18 anos): trava idade/termos, gera link rastreavel API, vincula cadastro, rastreia viagem e revoga acesso', async () => {
  const makeTestCpf = (seedNum) => {
    const base = String(seedNum).replace(/\D/g, '').padStart(9, '5').slice(-9).split('').map(Number);
    if (new Set(base).size === 1) base[8] = (base[8] + 1) % 10;
    const calc = (arr) => {
      let s = 0;
      for (let i = 0; i < arr.length; i++) s += arr[i] * (arr.length + 1 - i);
      return ((s * 10) % 11) % 10;
    };
    const d1 = calc(base);
    const d2 = calc([...base, d1]);
    return [...base, d1, d2].join('');
  };
  const seedBase = Math.floor((Date.now() % 700000000) + 200000000);
  const currentYear = new Date().getFullYear();

  const guardReg = await apiJson('/api/clients/register', {
    method: 'POST',
    headers: { 'x-forwarded-for': '198.51.100.150' },
    body: {
      name: 'Lucas Responsável Legal',
      phone: '(48) 99199-8877',
      document: makeTestCpf(seedBase),
      email: `guard.${Date.now()}@kavro.test`,
      password: '1234',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(guardReg.status, 200);
  const guardId = guardReg.json.client.id;
  const guardToken = guardReg.json.clientToken;

  // 1) Bloqueia menor de 12 anos e maior de 18 anos
  const under12Res = await apiJson(`/api/clients/${encodeURIComponent(guardId)}/family/invite`, {
    method: 'POST',
    headers: { 'x-client-token': guardToken },
    body: {
      name: 'Joao Criança',
      phone: '(48) 99199-4455',
      birthDate: `01/01/${currentYear - 10}`,
      termsAccepted: true
    }
  });
  assert.equal(under12Res.status, 400);

  const over18Res = await apiJson(`/api/clients/${encodeURIComponent(guardId)}/family/invite`, {
    method: 'POST',
    headers: { 'x-client-token': guardToken },
    body: {
      name: 'Carlos Adulto',
      phone: '(48) 99199-4455',
      birthDate: `01/01/${currentYear - 21}`,
      termsAccepted: true
    }
  });
  assert.equal(over18Res.status, 400);

  // 2) Exige aceite dos Termos do Perfil Familiar
  const noTermsRes = await apiJson(`/api/clients/${encodeURIComponent(guardId)}/family/invite`, {
    method: 'POST',
    headers: { 'x-client-token': guardToken },
    body: {
      name: 'Gabriel Adolescente',
      phone: '(48) 99199-5566',
      birthDate: `01/01/${currentYear - 15}`,
      termsAccepted: false
    }
  });
  assert.equal(noTermsRes.status, 400);

  // 3) Convite válido para adolescente de 15 anos gera link rastreável e dispara mensagem WhatsApp pela API
  const inviteRes = await apiJson(`/api/clients/${encodeURIComponent(guardId)}/family/invite`, {
    method: 'POST',
    headers: { 'x-client-token': guardToken },
    body: {
      name: 'Gabriel Adolescente',
      phone: '(48) 99199-5566',
      birthDate: `01/01/${currentYear - 15}`,
      termsAccepted: true
    }
  });
  assert.equal(inviteRes.status, 200);
  const inviteToken = inviteRes.json.inviteToken;
  assert.ok(inviteToken.startsWith('FAM-'));
  assert.ok(inviteRes.json.inviteUrl.includes(`/familia/convite/${inviteToken}`));
  assert.ok(inviteRes.json.whatsappUrl.includes('wa.me/'));
  assert.equal(inviteRes.json.member.status, 'convite_enviado');
  assert.equal(inviteRes.json.member.teenAge >= 14 && inviteRes.json.member.teenAge <= 15, true);

  // 4) Link público do convite retorna dados seguros para o adolescente completar o cadastro
  const publicInviteRes = await apiJson(`/api/family/invite/${encodeURIComponent(inviteToken)}`);
  assert.equal(publicInviteRes.status, 200);
  assert.equal(publicInviteRes.json.invite.guardianName, 'Lucas Responsável Legal');
  assert.equal(publicInviteRes.json.invite.accountAlreadyExists, false);

  // 5) Adolescente abre o link e se cadastra -> conta fica automaticamente vinculada ('teen' + status 'ativo')
  const teenRegRes = await apiJson('/api/clients/register', {
    method: 'POST',
    headers: { 'x-forwarded-for': '198.51.100.151' },
    body: {
      name: 'Gabriel Adolescente',
      phone: '(48) 99199-5566',
      document: makeTestCpf(seedBase + 13),
      email: `teen.${Date.now()}@kavro.test`,
      password: '1234',
      birthDate: `01/01/${currentYear - 15}`,
      familyInviteToken: inviteToken,
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(teenRegRes.status, 200);
  assert.equal(teenRegRes.json.client.accountType, 'teen');
  assert.equal(teenRegRes.json.client.guardianClientId, guardId);
  assert.equal(teenRegRes.json.client.safetyPreferences.boardingPinEnabled, true);
  assert.equal(teenRegRes.json.client.safetyPreferences.rideCheckEnabled, true);
  const teenToken = teenRegRes.json.clientToken;

  // 6) Motorista bem avaliado aceita viagem do adolescente (motorista nota < 4.5 é bloqueado)
  const lowDrvReg = await apiJson('/api/drivers/register', {
    method: 'POST',
    headers: { 'x-forwarded-for': '198.51.100.152' },
    body: {
      name: 'Motorista Baixa Nota',
      phone: '(48) 99222-1111',
      email: `lowdrv.${Date.now()}@kavro.test`,
      document: makeTestCpf(seedBase + 29),
      password: '1234',
      vehicleBrand: 'Fiat',
      vehicleModel: 'Argo',
      vehicleColor: 'Preto',
      vehiclePlate: 'KVR1C11',
      termsAcceptance: { accepted: true }
    }
  });
  const lowDrvObj = await finance.getDriverById(lowDrvReg.json.driver.id);
  await finance.saveDriverRecord({ ...lowDrvObj, approvalStatus: 'aprovado', kyc: { status: 'aprovado' }, rating: 4.1 });

  const topDrvReg = await apiJson('/api/drivers/register', {
    method: 'POST',
    headers: { 'x-forwarded-for': '198.51.100.153' },
    body: {
      name: 'Motorista 5 Estrelas',
      phone: '(48) 99222-2222',
      email: `topdrv.${Date.now()}@kavro.test`,
      document: makeTestCpf(seedBase + 43),
      password: '1234',
      vehicleBrand: 'Toyota',
      vehicleModel: 'Yaris',
      vehicleColor: 'Branco',
      vehiclePlate: 'KVR5S99',
      termsAcceptance: { accepted: true }
    }
  });
  const topDrvObj = await finance.getDriverById(topDrvReg.json.driver.id);
  await finance.saveDriverRecord({ ...topDrvObj, approvalStatus: 'aprovado', kyc: { status: 'aprovado' }, rating: 4.9 });

  const teenRideRes = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': teenToken },
    body: {
      clientId: teenRegRes.json.client.id,
      clientName: 'Gabriel Adolescente',
      clientPhone: '(48) 99199-5566',
      origin: { address: 'Colégio Centro', lat: -28.3912, lng: -49.3935 },
      destination: { address: 'Casa Família', lat: -28.4100, lng: -49.4050 },
      distanceKm: 5,
      durationMin: 10,
      category: 'kavro_go',
      paymentMethod: 'dinheiro'
    }
  });
  assert.equal(teenRideRes.status, 200);
  const teenRideId = teenRideRes.json.ride.id;
  assert.equal(teenRideRes.json.ride.isTeenRide, true);
  assert.match(String(teenRideRes.json.ride.boardingPin || ''), /^\d{4}$/);

  const lowAcceptRes = await apiJson(`/api/rides/${encodeURIComponent(teenRideId)}/accept`, {
    method: 'POST',
    headers: { 'x-driver-token': lowDrvReg.json.driverToken },
    body: { driverId: lowDrvObj.id }
  });
  assert.equal(lowAcceptRes.status, 403);

  const topAcceptRes = await apiJson(`/api/rides/${encodeURIComponent(teenRideId)}/accept`, {
    method: 'POST',
    headers: { 'x-driver-token': topDrvReg.json.driverToken },
    body: { driverId: topDrvObj.id }
  });
  assert.equal(topAcceptRes.status, 200);

  // 7) Área do Perfil Familiar mostra conta ativa, corrida ativa e link assinado de rastreamento ao vivo para o responsável
  const famHubRes = await apiJson(`/api/clients/${encodeURIComponent(guardId)}/family`, {
    headers: { 'x-client-token': guardToken }
  });
  assert.equal(famHubRes.status, 200);
  assert.equal(famHubRes.json.members.length, 1);
  const mem = famHubRes.json.members[0];
  assert.equal(mem.status, 'ativo');
  assert.ok(mem.activeRide);
  assert.equal(mem.activeRide.id, teenRideId);
  assert.equal(mem.activeRide.driverPlate, 'KVR5S99');
  assert.ok(mem.activeRide.trackingUrl.includes(`/viagem/${teenRideId}?t=`));

  // Responsável abre /api/rides/:id/track?t=... usando token do link gerado
  const trkToken = new URL(`http://localhost${mem.activeRide.trackingUrl}`).searchParams.get('t');
  const trkRes = await apiJson(`/api/rides/${encodeURIComponent(teenRideId)}/track?t=${encodeURIComponent(trkToken)}`);
  assert.equal(trkRes.status, 200);
  assert.equal(trkRes.json.ride.driverName, 'Motorista 5 Estrelas');
  assert.equal(trkRes.json.ride.boardingPin, undefined);
  assert.equal(trkRes.json.ride.totalPrice, undefined);
  assert.equal(trkRes.json.ride.paymentMethod, undefined);
  assert.equal(trkRes.json.ride.paymentStatus, undefined);
  assert.equal(trkRes.json.ride.trustedContactsDispatches, undefined);
  assert.equal(trkRes.json.ride.trackingReadOnly, true);

  // 8) Responsável revoga membro -> remove do Perfil Familiar e volta adolescente para conta padrão
  const revokeRes = await apiJson(
    `/api/clients/${encodeURIComponent(guardId)}/family/${encodeURIComponent(mem.id)}`,
    {
      method: 'DELETE',
      headers: { 'x-client-token': guardToken }
    }
  );
  assert.equal(revokeRes.status, 200);
  const famAfterRevoke = await apiJson(`/api/clients/${encodeURIComponent(guardId)}/family`, {
    headers: { 'x-client-token': guardToken }
  });
  assert.equal(famAfterRevoke.status, 200);
  assert.equal(famAfterRevoke.json.members.length, 0);
});

test('2 Tipos de Categoria (Padrao vs Entregas): somente 2 opcoes, validacao de entrega, tarifa, preferencias do motorista e rastreio', async () => {
  // 1) Normalização consolida categorias legadas (KAVRO GO / PLUS / EXEC) para estritamente 2 opções: Padrão e Entregas
  const legacyOnlyPadrao = finance.normalizeCategoriesServer({
    rideCategories: [
      { id: 'kavro_go', name: 'KAVRO GO' },
      { id: 'kavro_plus', name: 'KAVRO PLUS' },
      { id: 'kavro_exec', name: 'KAVRO EXEC' }
    ]
  });
  assert.equal(legacyOnlyPadrao.length, 2);
  assert.equal(legacyOnlyPadrao[0].name, 'Padrão');
  assert.equal(legacyOnlyPadrao[1].name, 'Entregas');
  assert.equal(finance.resolveCategoryTypeServer(legacyOnlyPadrao.find(c => c.id === 'kavro_go')), 'padrao');
  assert.equal(finance.resolveCategoryTypeServer(legacyOnlyPadrao.find(c => c.id === 'kavro_entregas')), 'entregas');

  // 2) Cadastra cliente e motorista para fluxo de Entregas
  const makeTestCpf = (seedNum) => {
    const base = String(seedNum).replace(/\D/g, '').padStart(9, '5').slice(-9).split('').map(Number);
    if (new Set(base).size === 1) base[8] = (base[8] + 1) % 10;
    const calc = (arr) => {
      let s = 0;
      for (let i = 0; i < arr.length; i++) s += arr[i] * (arr.length + 1 - i);
      return ((s * 10) % 11) % 10;
    };
    const d1 = calc(base);
    const d2 = calc([...base, d1]);
    return [...base, d1, d2].join('');
  };
  const seed = Math.floor((Date.now() % 700000000) + 300000000);
  const cliReg = await apiJson('/api/clients/register', {
    method: 'POST',
    headers: { 'x-forwarded-for': '198.51.100.161' },
    body: {
      name: 'Mariana Lojista',
      phone: '(48) 99161-0001',
      email: `loja.${Date.now()}@kavro.test`,
      document: makeTestCpf(seed + 71),
      password: '1234',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(cliReg.status, 200);
  const cliToken = cliReg.json.clientToken;

  const drvReg = await apiJson('/api/drivers/register', {
    method: 'POST',
    headers: { 'x-forwarded-for': '198.51.100.162' },
    body: {
      name: 'Carlos Entregador',
      phone: '(48) 99161-0002',
      email: `drv.entregas.${Date.now()}@kavro.test`,
      document: makeTestCpf(seed + 72),
      password: '1234',
      vehicleBrand: 'Fiat',
      vehicleModel: 'Argo',
      vehicleColor: 'Prata',
      vehiclePlate: 'KVR9E91',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(drvReg.status, 200);
  const drvObj = await finance.getDriverById(drvReg.json.driver.id);
  await finance.saveDriverRecord({ ...drvObj, approvalStatus: 'aprovado', kyc: { status: 'aprovado' }, isOnline: true });

  // 3) Preferências do motorista: desmarcar KAVRO ENTREGAS via disabledCategoryIds persiste e pode ser reativado
  const prefOff = await apiJson(`/api/drivers/${encodeURIComponent(drvObj.id)}`, {
    method: 'PATCH',
    headers: { 'x-driver-token': drvReg.json.driverToken },
    body: {
      enabledCategories: ['kavro_go'],
      disabledCategoryIds: ['kavro_entregas']
    }
  });
  assert.equal(prefOff.status, 200);
  assert.equal(prefOff.json.driver.enabledCategories.includes('kavro_entregas'), false);

  const prefOn = await apiJson(`/api/drivers/${encodeURIComponent(drvObj.id)}`, {
    method: 'PATCH',
    headers: { 'x-driver-token': drvReg.json.driverToken },
    body: {
      enabledCategories: ['kavro_go', 'kavro_entregas'],
      disabledCategoryIds: []
    }
  });
  assert.equal(prefOn.status, 200);
  assert.equal(prefOn.json.driver.enabledCategories.includes('kavro_entregas'), true);
  assert.deepEqual(prefOn.json.driver.disabledCategoryIds, []);

  // Motorista também pode desmarcar Padrão mantendo somente Entregas ativa
  const onlyDeliveries = await apiJson(`/api/drivers/${encodeURIComponent(drvObj.id)}`, {
    method: 'PATCH',
    headers: { 'x-driver-token': drvReg.json.driverToken },
    body: {
      enabledCategories: ['kavro_entregas'],
      disabledCategoryIds: ['kavro_go']
    }
  });
  assert.equal(onlyDeliveries.status, 200);
  assert.deepEqual(onlyDeliveries.json.driver.enabledCategories, ['kavro_entregas']);

  // E reativar ambas novamente
  const bothAgain = await apiJson(`/api/drivers/${encodeURIComponent(drvObj.id)}`, {
    method: 'PATCH',
    headers: { 'x-driver-token': drvReg.json.driverToken },
    body: {
      enabledCategories: ['kavro_go', 'kavro_entregas'],
      disabledCategoryIds: []
    }
  });
  assert.equal(bothAgain.status, 200);
  assert.deepEqual(bothAgain.json.driver.enabledCategories, ['kavro_go', 'kavro_entregas']);

  // Regressão: /api/sync para passageiro deve retornar o motorista online com isOnline=true, approvalStatus='aprovado' e preferências atualizadas
  const cliSyncBoth = await apiJson('/api/sync', {
    headers: { 'x-client-token': cliToken }
  });
  assert.equal(cliSyncBoth.status, 200);
  const syncedDrvBoth = (cliSyncBoth.json.onlineDrivers || []).find(d => d.id === drvObj.id);
  assert.ok(syncedDrvBoth, 'Motorista online deve aparecer em onlineDrivers para o passageiro');
  assert.equal(syncedDrvBoth.isOnline, true);
  assert.equal(syncedDrvBoth.approvalStatus, 'aprovado');
  assert.equal(syncedDrvBoth.hasFourDoors, true);
  assert.equal(syncedDrvBoth.hasAirConditioning, true);
  assert.equal(syncedDrvBoth.crlvRegular, true);
  assert.equal(syncedDrvBoth.cnhHasEar, true);
  assert.ok(syncedDrvBoth.enabledCategories.includes('kavro_go'));
  assert.ok(syncedDrvBoth.enabledCategories.includes('kavro_entregas'));

  // Se motorista desmarcar Padrão em Preferências, /api/sync deve refletir na hora para o passageiro
  await apiJson(`/api/drivers/${encodeURIComponent(drvObj.id)}`, {
    method: 'PATCH',
    headers: { 'x-driver-token': drvReg.json.driverToken },
    body: { enabledCategories: ['kavro_entregas'], disabledCategoryIds: ['kavro_go'] }
  });
  const cliSyncOnlyDel = await apiJson('/api/sync', { headers: { 'x-client-token': cliToken } });
  const syncedDrvOnlyDel = (cliSyncOnlyDel.json.onlineDrivers || []).find(d => d.id === drvObj.id);
  assert.equal(syncedDrvOnlyDel.enabledCategories.includes('kavro_go'), false);
  assert.equal(syncedDrvOnlyDel.enabledCategories.includes('kavro_entregas'), true);
  assert.deepEqual(syncedDrvOnlyDel.disabledCategoryIds, ['kavro_go']);

  // Restaura Padrão + Entregas ativas antes dos fluxos seguintes
  await apiJson(`/api/drivers/${encodeURIComponent(drvObj.id)}`, {
    method: 'PATCH',
    headers: { 'x-driver-token': drvReg.json.driverToken },
    body: { enabledCategories: ['kavro_go', 'kavro_entregas'], disabledCategoryIds: [] }
  });

  // 4) Pedido na modalidade Entregas sem destinatario/produto deve ser bloqueado (HTTP 400)
  const invalidDelRes = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: {
      clientId: cliReg.json.client.id,
      clientName: 'Mariana Lojista',
      clientPhone: '(48) 99123-4567',
      origin: { address: 'Loja Centro, 100', lat: -28.3910, lng: -49.3930 },
      destination: { address: 'Rua das Palmeiras, 450', lat: -28.4050, lng: -49.4010 },
      distanceKm: 4,
      durationMin: 10,
      time: '14:00',
      category: 'kavro_entregas',
      paymentMethod: 'dinheiro'
    }
  });
  assert.equal(invalidDelRes.status, 400);

  // 5) Pedido completo de Entrega com destinatário, produto, porte e instruções cria corrida de entrega com PIN
  const validDelRes = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: {
      clientId: cliReg.json.client.id,
      clientName: 'Mariana Lojista',
      clientPhone: '(48) 99123-4567',
      origin: { address: 'Loja Centro, 100', lat: -28.3910, lng: -49.3930 },
      destination: { address: 'Rua das Palmeiras, 450', lat: -28.4050, lng: -49.4010 },
      distanceKm: 4,
      durationMin: 10,
      time: '14:00',
      category: 'kavro_entregas',
      paymentMethod: 'dinheiro',
      deliveryDetails: {
        role: 'sender',
        recipientName: 'Pedro Souza',
        recipientPhone: '(48) 99911-2233',
        itemDescription: 'Caixa com 2 tênis esportivos',
        packageSize: 'medio',
        dropoffMode: 'portaria',
        instructions: 'Deixar com o porteiro Marcos no bloco B'
      }
    }
  });
  assert.equal(validDelRes.status, 200);
  const delRide = validDelRes.json.ride;
  assert.equal(delRide.category, 'kavro_entregas');
  assert.equal(delRide.serviceType, 'entregas');
  assert.equal(delRide.passengers, 0);
  assert.equal(delRide.deliveryDetails?.recipientName, 'Pedro Souza');
  assert.equal(delRide.deliveryDetails?.itemDescription, 'Caixa com 2 tênis esportivos');
  assert.equal(delRide.deliveryDetails?.dropoffMode, 'portaria');
  assert.match(String(delRide.boardingPin || ''), /^\d{4}$/);

  // 6) Motorista aceita a entrega e recebe os dados completos do destinatário e produto
  const acceptDelRes = await apiJson(`/api/rides/${encodeURIComponent(delRide.id)}/accept`, {
    method: 'POST',
    headers: { 'x-driver-token': drvReg.json.driverToken },
    body: { driverId: drvObj.id }
  });
  assert.equal(acceptDelRes.status, 200);
  assert.equal(acceptDelRes.json.ride.serviceType, 'entregas');
  assert.equal(acceptDelRes.json.ride.deliveryDetails?.recipientPhone, '(48) 99911-2233');
  assert.equal(acceptDelRes.json.ride.boardingPin, undefined);

  // 7) Link de rastreamento público (/api/rides/:id/track) mascara telefone e sobrenome do destinatário
  const trkToken = new URL(`http://localhost${delRide.trackingUrl}`).searchParams.get('t');
  const trkRes = await apiJson(`/api/rides/${encodeURIComponent(delRide.id)}/track?t=${encodeURIComponent(trkToken)}`);
  assert.equal(trkRes.status, 200);
  assert.equal(trkRes.json.ride.serviceType, 'entregas');
  assert.equal(trkRes.json.ride.deliveryDetails?.itemDescription, 'Caixa com 2 tênis esportivos');
  assert.notEqual(trkRes.json.ride.deliveryDetails?.recipientPhone, '(48) 99911-2233');
});

test('Cancelar corrida ou enviar nova solicitação encerra PIX pendentes anteriores (cancelar tudo)', async () => {
  const ip = { 'x-forwarded-for': '198.51.100.145' };
  const makeTestCpf = (seedNum) => {
    const base = String(seedNum).replace(/\D/g, '').padStart(9, '5').slice(-9).split('').map(Number);
    if (new Set(base).size === 1) base[8] = (base[8] + 1) % 10;
    const calc = (arr) => {
      let s = 0;
      for (let i = 0; i < arr.length; i++) s += arr[i] * (arr.length + 1 - i);
      return ((s * 10) % 11) % 10;
    };
    const d1 = calc(base);
    const d2 = calc([...base, d1]);
    return [...base, d1, d2].join('');
  };
  const phone = `(48) 99448-${String(Date.now()).slice(-4)}`;
  const cliReg = await apiJson('/api/clients/register', {
    method: 'POST',
    headers: ip,
    body: {
      name: 'Lucas CancelAll',
      phone,
      email: `cancelall.${Date.now()}@kavro.test`,
      document: makeTestCpf(Math.floor((Date.now() % 700000000) + 300000083)),
      password: 'CancelAllPass123!',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(cliReg.status, 200);
  const cliId = cliReg.json.client.id;
  const cliToken = cliReg.json.clientToken;

  // 1) Cria solicitação PIX #1 em aguardando_pagamento
  const pix1Res = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: {
      clientId: cliId,
      clientName: 'Lucas CancelAll',
      clientPhone: phone,
      originAddress: 'Av. Centenário, 500',
      destinationAddress: 'Travessa Padre Pedro Baldoncini, 10',
      distanceKm: 7,
      durationMin: 14,
      time: '21:20',
      category: 'kavro_go',
      paymentMethod: 'pix'
    }
  });
  assert.equal(pix1Res.status, 200);
  const pix1Id = pix1Res.json.ride.id;
  assert.equal(pix1Res.json.ride.status, 'aguardando_pagamento');

  // 2) Ao criar nova corrida (#2 em dinheiro), solicitação PIX anterior (#1) é cancelada automaticamente
  const ride2Res = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: {
      clientId: cliId,
      clientName: 'Lucas CancelAll',
      clientPhone: phone,
      originAddress: 'Av. Centenário, 500',
      destinationAddress: 'Shopping Nações, 200',
      distanceKm: 6,
      durationMin: 12,
      time: '21:25',
      category: 'kavro_go',
      paymentMethod: 'dinheiro'
    }
  });
  assert.equal(ride2Res.status, 200);
  assert.ok(Array.isArray(ride2Res.json.alsoCancelledRideIds));
  assert.ok(ride2Res.json.alsoCancelledRideIds.includes(pix1Id));

  // 3) Mesmo se existir um PIX pendente legado em aguardando_pagamento no banco, cancelar a corrida ativa cancela tudo
  await db.query('UPDATE public.rides SET status = $1 WHERE id = $2', ['aguardando_pagamento', pix1Id]);
  await db.query('UPDATE public.rides SET payment_status = $1 WHERE id = $2', ['aguardando', pix1Id]);
  const cancelAllRes = await apiJson(`/api/rides/${encodeURIComponent(ride2Res.json.ride.id)}/status`, {
    method: 'PATCH',
    headers: { 'x-client-token': cliToken },
    body: { status: 'cancelada', cancelledBy: 'passenger', cancellationReason: 'Desisti da viagem' }
  });
  assert.equal(cancelAllRes.status, 200);
  assert.equal(cancelAllRes.json.ride.status, 'cancelada');
  assert.ok(Array.isArray(cancelAllRes.json.alsoCancelledRideIds));
  assert.ok(cancelAllRes.json.alsoCancelledRideIds.includes(pix1Id));

  const checkPix1 = await db.query('SELECT status, payment_status FROM public.rides WHERE id = $1', [pix1Id]);
  assert.equal(checkPix1.rows[0].status, 'cancelada');
  assert.equal(checkPix1.rows[0].payment_status, 'cancelado');
});

test('Carteira do Passageiro: depósito mínimo R$ 20, pagamento de corrida, estorno no cancelamento e repasse ao motorista', async () => {
  const ip = { 'x-forwarded-for': '198.51.100.188' };
  const makeTestCpf = (seedNum) => {
    const base = String(seedNum).replace(/\D/g, '').padStart(9, '7').slice(-9).split('').map(Number);
    if (new Set(base).size === 1) base[8] = (base[8] + 1) % 10;
    const calc = (arr) => {
      let s = 0;
      for (let i = 0; i < arr.length; i++) s += arr[i] * (arr.length + 1 - i);
      return ((s * 10) % 11) % 10;
    };
    const d1 = calc(base);
    const d2 = calc([...base, d1]);
    return [...base, d1, d2].join('');
  };

  const phone = `(48) 99511-${String(Date.now()).slice(-4)}`;
  const cliReg = await apiJson('/api/clients/register', {
    method: 'POST',
    headers: ip,
    body: {
      name: 'Lucas Carteira',
      phone,
      email: `carteira.${Date.now()}@kavro.test`,
      document: makeTestCpf(Math.floor((Date.now() % 700000000) + 200000077)),
      password: 'WalletPass123!',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(cliReg.status, 200);
  const cliId = cliReg.json.client.id;
  const cliToken = cliReg.json.clientToken;

  // 1) Consulta saldo inicial zero e mínimo de R$ 20
  const initWallet = await apiJson('/api/client/wallet', {
    headers: { 'x-client-token': cliToken }
  });
  assert.equal(initWallet.status, 200);
  assert.equal(initWallet.json.wallet.balance, 0);
  assert.equal(initWallet.json.wallet.minTopupAmount, 20);

  // 2) Depósito abaixo de R$ 20,00 é bloqueado pelo servidor
  const minFailRes = await apiJson('/api/client/wallet/topup', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: { amount: 19.99, method: 'pix' }
  });
  assert.equal(minFailRes.status, 400);

  // 3) Corrida na carteira sem saldo retorna HTTP 402 INSUFFICIENT_WALLET_BALANCE
  const noBalRide = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: {
      clientId: cliId,
      clientName: 'Lucas Carteira',
      clientPhone: phone,
      origin: { address: 'Rua Origem Wallet, 10', lat: -28.3910, lng: -49.3930 },
      destination: { address: 'Rua Destino Wallet, 90', lat: -28.4010, lng: -49.4030 },
      distanceKm: 5,
      durationMin: 10,
      time: '15:00',
      category: 'kavro_go',
      paymentMethod: 'carteira'
    }
  });
  assert.equal(noBalRide.status, 402);
  assert.equal(noBalRide.json.code, 'INSUFFICIENT_WALLET_BALANCE');

  // 4) Deposita R$ 50,00 via PIX e confirma depósito
  const pixTopup = await apiJson('/api/client/wallet/topup', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: { amount: 50, method: 'pix' }
  });
  assert.equal(pixTopup.status, 200);
  assert.equal(pixTopup.json.pending, true);
  assert.ok(pixTopup.json.entry.id);
  assert.ok(pixTopup.json.entry.pixCopyPaste);
  assert.equal(pixTopup.json.wallet.pendingBalance, 50);
  assert.equal(pixTopup.json.wallet.balance, 0);

  const confirmTopup = await apiJson('/api/client/wallet/topup/confirm', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: { entryId: pixTopup.json.entry.id }
  });
  assert.equal(confirmTopup.status, 200);
  assert.equal(confirmTopup.json.wallet.balance, 50);
  assert.equal(confirmTopup.json.wallet.pendingBalance, 0);

  // 5) Solicita corrida usando saldo da carteira -> confirma na hora e debita saldo
  const walletRide1 = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: {
      clientId: cliId,
      clientName: 'Lucas Carteira',
      clientPhone: phone,
      origin: { address: 'Rua Origem Wallet, 10', lat: -28.3910, lng: -49.3930 },
      destination: { address: 'Rua Destino Wallet, 90', lat: -28.4010, lng: -49.4030 },
      distanceKm: 5,
      durationMin: 10,
      time: '15:05',
      category: 'kavro_go',
      paymentMethod: 'carteira'
    }
  });
  assert.equal(walletRide1.status, 200);
  assert.equal(walletRide1.json.ride.paymentMethod, 'carteira');
  assert.equal(walletRide1.json.ride.paymentStatus, 'confirmado');
  assert.equal(walletRide1.json.ride.status, 'aguardando_confirmacao');

  const ridePrice1 = Number(walletRide1.json.ride.totalPrice);
  assert.ok(ridePrice1 > 0 && ridePrice1 < 50);

  const afterDebitWallet = await apiJson('/api/client/wallet', {
    headers: { 'x-client-token': cliToken }
  });
  assert.equal(afterDebitWallet.json.wallet.balance, finance.round2(50 - ridePrice1));

  // 6) Cancelamento antes do aceite estorna 100% de volta para a carteira do passageiro
  const cancelRes = await apiJson(`/api/rides/${encodeURIComponent(walletRide1.json.ride.id)}/status`, {
    method: 'PATCH',
    headers: { 'x-client-token': cliToken },
    body: { status: 'cancelada', cancelledBy: 'passenger', cancellationReason: 'Teste estorno carteira' }
  });
  assert.equal(cancelRes.status, 200);
  assert.equal(cancelRes.json.ride.paymentStatus, 'reembolsado');

  const refundedWallet = await apiJson('/api/client/wallet', {
    headers: { 'x-client-token': cliToken }
  });
  assert.equal(refundedWallet.json.wallet.balance, 50);

  // 7) Corrida completa com saldo da carteira repassa o líquido ao motorista no livro-razão
  const drvPhone = `(48) 99522-${String(Date.now()).slice(-4)}`;
  const drvReg = await apiJson('/api/drivers/register', {
    method: 'POST',
    body: {
      name: 'Motorista Carteira',
      phone: drvPhone,
      email: `drv.carteira.${Date.now()}@kavro.test`,
      document: makeTestCpf(Math.floor((Date.now() % 700000000) + 210000099)),
      password: '1234',
      vehicleBrand: 'VW',
      vehicleModel: 'Polo',
      vehicleColor: 'Prata',
      vehiclePlate: 'WLT2B26',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(drvReg.status, 200);
  const drvToken = drvReg.json.driverToken;
  const drvObj = await finance.getDriverById(drvReg.json.driver.id);
  await finance.saveDriverRecord({
    ...drvObj,
    approvalStatus: 'aprovado',
    isOnline: true,
    kyc: { status: 'aprovado' }
  });

  const walletRide2 = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: {
      clientId: cliId,
      clientName: 'Lucas Carteira',
      clientPhone: phone,
      origin: { address: 'Rua Origem Wallet, 10', lat: -28.3910, lng: -49.3930 },
      destination: { address: 'Rua Destino Wallet, 90', lat: -28.4010, lng: -49.4030 },
      distanceKm: 5,
      durationMin: 10,
      time: '15:10',
      category: 'kavro_go',
      paymentMethod: 'carteira'
    }
  });
  assert.equal(walletRide2.status, 200);
  const ride2 = walletRide2.json.ride;

  const accRes = await apiJson(`/api/rides/${encodeURIComponent(ride2.id)}/accept`, {
    method: 'POST',
    headers: { 'x-driver-token': drvToken },
    body: { driverId: drvObj.id }
  });
  assert.equal(accRes.status, 200);

  const startRes = await apiJson(`/api/rides/${encodeURIComponent(ride2.id)}/status`, {
    method: 'PATCH',
    headers: { 'x-driver-token': drvToken },
    body: { status: 'em_andamento', boardingPin: ride2.boardingPin }
  });
  assert.equal(startRes.status, 200);

  const compRes = await apiJson(`/api/rides/${encodeURIComponent(ride2.id)}/complete`, {
    method: 'POST',
    headers: { 'x-driver-token': drvToken },
    body: { driverId: drvObj.id }
  });
  assert.equal(compRes.status, 200);
  assert.equal(compRes.json.ride.status, 'finalizada');
  assert.equal(compRes.json.ride.paymentStatus, 'confirmado');
  assert.ok(Number(compRes.json.wallet.availableBalance) >= Number(ride2.driverNetAmount) - 0.01);

  const finalClientWallet = await apiJson('/api/client/wallet', {
    headers: { 'x-client-token': cliToken }
  });
  assert.equal(finalClientWallet.json.wallet.balance, finance.round2(50 - Number(ride2.totalPrice)));
});

test('Gateway Efí Bank completo: config/certificado, PIX cobranca + Split, carteira R$20+, webhook HMAC e repasse PIX motorista', async () => {
  const efiGateway = require('../server/efiBankGateway.cjs');
  const paidTxids = new Set();
  const capturedCalls = [];
  const makeTestCpf = (numSeed) => {
    const base = String(numSeed).replace(/\D/g, '').padStart(9, '0').slice(-9);
    const digits = base.split('').map(Number);
    if (digits.every((d) => d === digits[0])) digits[8] = (digits[8] + 1) % 10;
    const calc = (sliceLen) => {
      let sum = 0;
      for (let i = 0; i < sliceLen; i++) sum += digits[i] * (sliceLen + 1 - i);
      const rem = (sum * 10) % 11;
      return rem >= 10 ? 0 : rem;
    };
    digits.push(calc(9));
    digits.push(calc(10));
    return digits.join('');
  };

  efiGateway._setEfiRequestForTest(async ({ method, urlStr, headers, bodyObj }) => {
    const parsed = new URL(urlStr);
    const route = `${method} ${parsed.pathname}`;
    capturedCalls.push({ route, headers, bodyObj });

    if (route === 'POST /oauth/token') {
      assert.ok(String(headers.Authorization || '').startsWith('Basic '));
      assert.equal(bodyObj?.grant_type, 'client_credentials');
      return {
        status: 200,
        data: { access_token: 'efi_test_access_token_123', token_type: 'Bearer', expires_in: 3600 }
      };
    }

    if (route === 'GET /v2/gn/saldo') {
      return { status: 200, data: { saldo: '1850.45' } };
    }

    if (route.startsWith('PUT /v2/webhook/')) {
      assert.equal(headers['x-skip-mtls-checking'], 'true');
      return { status: 201, data: { webhookUrl: bodyObj.webhookUrl } };
    }

    if (route === 'POST /v2/gn/split/config') {
      return { status: 200, data: { id: 'split_cfg_kavro_99' } };
    }

    if (route.startsWith('PUT /v2/gn/split/cob/')) {
      return { status: 200, data: { vinculado: true } };
    }

    if (route.startsWith('PUT /v2/cob/')) {
      const txid = decodeURIComponent(parsed.pathname.split('/').pop());
      return {
        status: 201,
        data: {
          txid,
          status: 'ATIVA',
          loc: { id: 7788 },
          pixCopiaECola: `00020101021226800014BR.GOV.BCB.PIX2558pix.sejaefi.com.br/qr/${txid}53039865802BR6304ABCD`
        }
      };
    }

    if (route === 'GET /v2/loc/7788/qrcode') {
      return {
        status: 200,
        data: {
          qrcode: '00020101021226800014BR.GOV.BCB.PIX2558pix.sejaefi.com.br/qr/v2-loc-7788',
          imagemQrcode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          linkVisualizacao: 'https://pix.sejaefi.com.br/cob/7788'
        }
      };
    }

    if (route.startsWith('GET /v2/cob/')) {
      const txid = decodeURIComponent(parsed.pathname.split('/').pop());
      if (paidTxids.has(txid)) {
        return {
          status: 200,
          data: {
            txid,
            status: 'CONCLUIDA',
            valor: { original: '50.00' },
            pix: [{ endToEndId: `E18236120202611201600${txid.slice(0, 6)}`, valor: '50.00', txid }]
          }
        };
      }
      return { status: 200, data: { txid, status: 'ATIVA', valor: { original: '50.00' } } };
    }

    if (route.startsWith('PUT /v3/gn/pix/')) {
      const idEnvio = decodeURIComponent(parsed.pathname.split('/').pop());
      return {
        status: 201,
        data: {
          idEnvio,
          e2eId: `E18236120PAYOUT${idEnvio.slice(0, 8)}`,
          status: 'EM_PROCESSAMENTO'
        }
      };
    }

    return { status: 404, data: { error: `Unhandled route ${route}` } };
  });

  try {
    // 1) Endpoints Admin Efí rejeitam anônimo (401 fail-closed)
    const anonGet = await apiJson('/api/admin/gateways/efibank');
    assert.equal(anonGet.status, 401);
    const anonPost = await apiJson('/api/admin/gateways/efibank', {
      method: 'POST',
      body: { enabled: true }
    });
    assert.equal(anonPost.status, 401);

    // 2) Salva configuração Efí Bank com certificado .p12 base64 válido e verifica mascaramento
    const fakeP12Base64 = Buffer.from('FAKE-PKCS12-BINARY-CERT-PAYLOAD-FOR-TEST-'.repeat(4)).toString('base64');
    const savedCfg = await efiGateway.saveEfiConfig({
      enabled: true,
      sandbox: true,
      clientId: 'Client_Id_test_kavro_123',
      clientSecret: 'Client_Secret_super_secret_999',
      pixKey: 'efipay@sejaefi.com.br',
      certificateBase64: `data:application/x-pkcs12;base64,${fakeP12Base64}`,
      certificateFileName: 'kavro-homolog.p12',
      certificatePassphrase: '',
      useForPassengerPix: true,
      splitEnabled: true,
      driverPixSendEnabled: true,
      skipMtlsWebhook: true
    });
    assert.equal(savedCfg.enabled, true);

    const maskedForAdmin = efiGateway.sanitizeEfiConfigForAdmin(savedCfg);
    assert.equal(maskedForAdmin.hasClientSecret, true);
    assert.equal(maskedForAdmin.hasCertificate, true);
    assert.equal(maskedForAdmin.certificateFileName, 'kavro-homolog.p12');
    assert.equal(JSON.stringify(maskedForAdmin).includes('Client_Secret_super_secret_999'), false);
    assert.equal(JSON.stringify(maskedForAdmin).includes(fakeP12Base64), false);

    // /api/payments/config público expõe flags sem segredos
    const pubPayCfg = await apiJson('/api/payments/config');
    assert.equal(pubPayCfg.status, 200);
    assert.equal(pubPayCfg.json.gatewayProvider, 'efibank');
    assert.equal(pubPayCfg.json.efiEnabled, true);
    assert.equal(pubPayCfg.json.efiPixActive, true);
    assert.equal(pubPayCfg.json.efiSplitEnabled, true);
    assert.equal(pubPayCfg.json.efiDriverPixSendEnabled, true);
    assert.equal(pubPayCfg.json.autoPixPayoutEnabled, true);
    assert.equal(pubPayCfg.json.clientSecret, undefined);

    // 3) Testa conexão mTLS + leitura de saldo + registro de webhook
    const connTest = await efiGateway.testConnection();
    assert.equal(connTest.ok, true);
    assert.equal(connTest.balanceBrl, 1850.45);
    assert.equal(connTest.environment, 'homologacao');

    const regWh = await efiGateway.registerWebhook({
      fallbackOrigin: baseUrl,
      skipMtls: true
    });
    assert.equal(regWh.ok, true);
    assert.ok(regWh.webhookUrl.includes('/api/webhooks/efibank?hmac='));

    // 4) Cadastro passageiro e motorista com Conta Efí (para testar Split + Envio PIX)
    const cliPhone = `(48) 99611-${String(Date.now()).slice(-4)}`;
    const cliCpf = makeTestCpf(Math.floor((Date.now() % 650000000) + 120000044));
    const cliReg = await apiJson('/api/clients/register', {
      method: 'POST',
      body: {
        name: 'Passageiro Efi Bank',
        phone: cliPhone,
        document: cliCpf,
        email: `efi.cli.${Date.now()}@kavro.test`,
        password: '1234',
        termsAcceptance: { accepted: true }
      }
    });
    assert.equal(cliReg.status, 200);
    const cliToken = cliReg.json.clientToken;
    const cliId = cliReg.json.client.id;

    const drvPhone = `(48) 99622-${String(Date.now()).slice(-4)}`;
    const drvCpf = makeTestCpf(Math.floor((Date.now() % 650000000) + 230000055));
    const drvReg = await apiJson('/api/drivers/register', {
      method: 'POST',
      body: {
        name: 'Motorista Efi Split',
        phone: drvPhone,
        email: `efi.drv.${Date.now()}@kavro.test`,
        document: drvCpf,
        password: '1234',
        vehicleBrand: 'Hyundai',
        vehicleModel: 'HB20S',
        vehicleColor: 'Branco',
        vehiclePlate: 'EFI2A26',
        termsAcceptance: { accepted: true }
      }
    });
    assert.equal(drvReg.status, 200);
    const drvToken = drvReg.json.driverToken;
    const drvSaved = await finance.getDriverById(drvReg.json.driver.id);
    await finance.saveDriverRecord({
      ...drvSaved,
      approvalStatus: 'aprovado',
      isOnline: true,
      kyc: { status: 'aprovado' }
    });

    // Motorista salva própria conta digital Efí via SELF endpoint
    const saveEfiAccRes = await apiJson(`/api/drivers/${encodeURIComponent(drvSaved.id)}`, {
      method: 'PATCH',
      headers: { 'x-driver-token': drvToken },
      body: {
        efiAccountId: '9876543',
        pixKey: drvCpf,
        pixType: 'cpf'
      }
    });
    assert.equal(saveEfiAccRes.status, 200);
    assert.equal(saveEfiAccRes.json.driver.efiAccountId, '9876543');

    // 5) Recarga na Carteira via PIX gera cobrança Efí e confirma via webhook HMAC
    const walletTopup = await apiJson('/api/client/wallet/topup', {
      method: 'POST',
      headers: { 'x-client-token': cliToken },
      body: { amount: 50, method: 'pix' }
    });
    assert.equal(walletTopup.status, 200);
    assert.equal(walletTopup.json.pending, true);
    const walletTxid = walletTopup.json.entry.gatewayTxId;
    assert.ok(walletTxid.startsWith('KVWLT'));
    assert.ok(walletTxid.length >= 26 && walletTxid.length <= 35);

    // Webhook sem HMAC falha fechado (401)
    const whUnauthorized = await apiJson('/api/webhooks/efibank', {
      method: 'POST',
      body: { pix: [{ txid: walletTxid, endToEndId: 'E123', valor: '50.00' }] }
    });
    assert.equal(whUnauthorized.status, 401);

    // Marca como CONCLUIDA na resposta da API Efí e envia webhook autenticado por HMAC
    paidTxids.add(walletTxid);
    const whPathWithHmac = `/api/webhooks/efibank?hmac=${encodeURIComponent(savedCfg.webhookSecret)}`;
    const whWalletConfirm = await apiJson(whPathWithHmac, {
      method: 'POST',
      body: { pix: [{ txid: walletTxid, endToEndId: 'E18236120WALLET01', valor: '50.00' }] }
    });
    assert.equal(whWalletConfirm.status, 200);
    assert.equal(whWalletConfirm.json.processed[0].type, 'wallet_topup');
    assert.equal(whWalletConfirm.json.processed[0].newlyConfirmed, true);

    const wCheck = await apiJson('/api/client/wallet', { headers: { 'x-client-token': cliToken } });
    assert.equal(wCheck.json.wallet.balance, 50);

    // 6) Cria corrida PIX com motorista atribuído (testa Split + cobrança Efí + verificação ativa /pix/verify)
    const efiRideRes = await apiJson('/api/rides', {
      method: 'POST',
      headers: { 'x-client-token': cliToken },
      body: {
        clientId: cliId,
        clientName: 'Passageiro Efi Bank',
        clientPhone: cliPhone,
        driverId: drvSaved.id,
        origin: { address: 'Origem Efi, 10', lat: -28.391, lng: -49.393 },
        destination: { address: 'Destino Efi, 90', lat: -28.401, lng: -49.403 },
        distanceKm: 6,
        durationMin: 12,
        time: '16:10',
        category: 'kavro_go',
        paymentMethod: 'pix'
      }
    });
    assert.equal(efiRideRes.status, 200);
    const efiRide = efiRideRes.json.ride;
    assert.equal(efiRide.paymentStatus, 'aguardando');
    assert.ok(capturedCalls.some(c => c.route === 'POST /v2/gn/split/config'));
    assert.ok(capturedCalls.some(c => c.route.startsWith('PUT /v2/gn/split/cob/')));

    const rideTx = await finance.getPaymentTxByRide(efiRide.id);
    assert.ok(rideTx.gatewayTxId.startsWith('KVRIDE'));
    assert.ok(rideTx.gatewayTxId.length >= 26 && rideTx.gatewayTxId.length <= 35);

    // Passageiro clica "Já paguei — verificar agora" (/api/payments/pix/verify) antes e depois de CONCLUIDA
    const checkPending = await apiJson('/api/payments/pix/verify', {
      method: 'POST',
      headers: { 'x-client-token': cliToken },
      body: { rideId: efiRide.id }
    });
    assert.equal(checkPending.status, 200);
    assert.equal(checkPending.json.paid, false);

    paidTxids.add(rideTx.gatewayTxId);
    const checkPaid = await apiJson('/api/payments/pix/verify', {
      method: 'POST',
      headers: { 'x-client-token': cliToken },
      body: { rideId: efiRide.id }
    });
    assert.equal(checkPaid.status, 200);
    assert.equal(checkPaid.json.paid, true);
    assert.equal(checkPaid.json.ride.paymentStatus, 'confirmado');

    // 7) Saque do motorista aprovado dispara PIX automático via Efí (/v3/gn/pix/:idEnvio)
    await finance.recordLedgerEntry({
      idempotencyKey: `efi_seed_credit_${drvSaved.id}`,
      driverId: drvSaved.id,
      driverName: 'Motorista Efi Split',
      entryType: 'ride_earning_credit',
      paymentMethod: 'pix',
      grossAmount: 100,
      commissionPercent: 20,
      commissionAmount: 20,
      driverNetAmount: 80,
      balanceDelta: 80,
      balanceBucket: 'available',
      status: 'confirmado',
      description: 'Saldo disponível para saque Efí Bank'
    });

    const prevCfgEfi = db.localStore.system_config?.default?.config || {};
    await db.query(
      `INSERT INTO public.system_config (id, config, updated_at) VALUES ('default', $1, NOW())
       ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW();`,
      [JSON.stringify({ ...prevCfgEfi, driverWithdrawalEnabled: true, driverWithdrawalWeekdays: [0, 1, 2, 3, 4, 5, 6] })]
    );

    const wdReq = await apiJson(`/api/drivers/${encodeURIComponent(drvSaved.id)}/withdrawals`, {
      method: 'POST',
      headers: { 'x-driver-token': drvToken },
      body: {
        amount: 60,
        pixKey: drvCpf,
        pixType: 'cpf'
      }
    });
    assert.equal(wdReq.status, 200);
    const wdId = wdReq.json.withdrawal.id;

    const approvedPayout = await finance.processWithdrawalAdmin({
      withdrawalId: wdId,
      action: 'approve',
      notes: 'Repasse Efí automático'
    });
    assert.equal(approvedPayout.ok, true);
    assert.equal(approvedPayout.payoutProvider, 'efibank_pix');
    assert.equal(approvedPayout.payoutStatus, 'processado_automaticamente');
    assert.ok(String(approvedPayout.payoutProviderTxId || '').startsWith('E18236120PAYOUT'));

    const pixSendCall = capturedCalls.find(c => c.route.startsWith('PUT /v3/gn/pix/'));
    assert.ok(pixSendCall);
    assert.equal(pixSendCall.bodyObj.pagador.chave, 'efipay@sejaefi.com.br');
    assert.equal(pixSendCall.bodyObj.favorecido.chave, drvCpf);
    assert.equal(pixSendCall.bodyObj.favorecido.cpf, drvCpf);

    // 8) Desativar Efí Bank pelo Master desliga imediatamente no /api/payments/config
    await efiGateway.saveEfiConfig({ enabled: false });
    const afterOffCfg = await apiJson('/api/payments/config');
    assert.equal(afterOffCfg.json.efiEnabled, false);
    assert.equal(afterOffCfg.json.efiPixActive, false);
  } finally {
    await efiGateway.saveEfiConfig({ enabled: false, removeCertificate: true, clearClientSecret: true }).catch(() => {});
    efiGateway._setEfiRequestForTest(null);
    efiGateway.clearCaches();
  }
});

test('Regressao Postgres/Dinheiro: pixExpiresAt vazio nao quebra aceitar/status e finalize nao duplica gateway_tx_id', async () => {
  const cashRideId = `UP-REG-${Date.now()}`;
  const createdTx = await finance.savePaymentTransaction({
    rideId: cashRideId,
    rideCode: `#UP - ${cashRideId}`,
    method: 'dinheiro',
    status: 'aguardando',
    estimatedAmount: 26.2,
    finalAmount: 26.2,
    paidAmount: 0,
    pixExpiresAt: '',
    gatewayTxId: `cash_init_${cashRideId}`
  });
  assert.equal(createdTx.pixExpiresAt, null, 'pixExpiresAt vazio deve normalizar para null (nunca string vazia para TIMESTAMPTZ)');

  // Simula fluxo /accept que re-salva {...existingTx} sem gatewayTxId/pixExpiresAt
  const reloaded = await finance.getPaymentTxByRide(cashRideId);
  assert.equal(reloaded.pixExpiresAt, null);
  const afterAccept = await finance.savePaymentTransaction({
    ...reloaded,
    driverId: 'drv-1001',
    driverName: 'Alisson Santos'
  });
  assert.equal(afterAccept.id, createdTx.id);
  assert.equal(afterAccept.pixExpiresAt, null);

  // Simula settleCashRideToLedger duas vezes (sem duplicar row nem colidir em gateway_tx_id UNIQUE)
  const firstSettle = await finance.settleCashRideToLedger(
    {
      id: cashRideId,
      rideCode: `#UP - ${cashRideId}`,
      driverId: 'drv-1001',
      driverName: 'Alisson Santos',
      totalPrice: 26.2,
      commissionPercent: 20,
      paymentMethod: 'dinheiro'
    },
    26.2,
    'confirmado'
  );
  assert.equal(firstSettle.paymentStatus, 'confirmado');

  const secondSettle = await finance.settleCashRideToLedger(
    {
      id: cashRideId,
      rideCode: `#UP - ${cashRideId}`,
      driverId: 'drv-1001',
      driverName: 'Alisson Santos',
      totalPrice: 26.2,
      commissionPercent: 20,
      paymentMethod: 'dinheiro'
    },
    26.2,
    'confirmado'
  );
  assert.equal(secondSettle.paymentStatus, 'confirmado');

  const allTxForRide = (await finance.listPaymentTransactions()).filter(t => t.rideId === cashRideId);
  assert.equal(allTxForRide.length, 1, 'Nao deve duplicar transacao na finalizacao em dinheiro');
  assert.equal(allTxForRide[0].status, 'confirmado');

  // Regressao Auditoria por motorista: filtro driverId em auditEngine retorna somente eventos do motorista alvo
  await audit.recordAuditEvent({
    category: 'saques_repasses',
    actionKey: 'payout_approved_test',
    title: 'Saque aprovado motorista alvo',
    summary: 'Teste auditoria drv-1001',
    severity: 'info',
    actorRole: 'admin_master',
    actorName: 'Master',
    entityType: 'saque',
    entityId: 'wd-drv1001-test',
    relatedIds: { driverId: 'drv-1001', transactionId: createdTx.id }
  });
  await audit.recordAuditEvent({
    category: 'saques_repasses',
    actionKey: 'payout_approved_other',
    title: 'Saque outro motorista',
    summary: 'Teste auditoria drv-9999',
    severity: 'info',
    actorRole: 'admin_master',
    actorName: 'Master',
    entityType: 'saque',
    entityId: 'wd-drv9999-test',
    relatedIds: { driverId: 'drv-9999' }
  });
  const auditDrvRes = await audit.listAuditLogs({ driverId: 'drv-1001', limit: 50 });
  assert.ok(Array.isArray(auditDrvRes.logs) && auditDrvRes.logs.length >= 1);
  assert.ok(auditDrvRes.logs.some(l => l.entityId === 'wd-drv1001-test'));
  assert.equal(auditDrvRes.logs.some(l => l.entityId === 'wd-drv9999-test'), false);
  for (const logItem of auditDrvRes.logs) {
    assert.ok(
      logItem.actorId === 'drv-1001' ||
        logItem.entityId === 'drv-1001' ||
        logItem.relatedIds?.driverId === 'drv-1001',
      'Audit log retornado para driverId deve pertencer ao motorista filtrado'
    );
  }
});

test('Parceiros e Patrocinadores da Home: auditoria registra diff e GET /api/config expoe logos/banners para a Home', async () => {
  const sampleBanners = [
    {
      id: 'prt-logo-1',
      name: 'Auto Posto Central',
      kind: 'patrocinador',
      displayMode: 'logo',
      imageUrl: 'https://cdn.kavro.test/logo-posto.png',
      subtitle: '10% OFF para passageiros',
      linkUrl: 'https://autoposto.kavro.test',
      active: true,
      sortOrder: 1
    },
    {
      id: 'prt-banner-1',
      name: 'Supermercado Serra',
      kind: 'parceiro',
      displayMode: 'banner',
      imageUrl: 'https://cdn.kavro.test/banner-mercado.jpg',
      subtitle: 'Entregas no mesmo dia pela Kavro',
      active: true,
      sortOrder: 2
    },
    {
      id: 'prt-gif-1',
      kind: 'patrocinador',
      displayMode: 'banner',
      areas: ['site', 'client_home'],
      imageUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      active: true,
      sortOrder: 3
    }
  ];

  // Sem sessão Admin, POST /api/config segue bloqueado (fail-closed)
  const unauthSave = await apiJson('/api/config', {
    method: 'POST',
    body: { partnerBanners: sampleBanners }
  });
  assert.equal(unauthSave.status, 401);

  // Persistindo no system_config, GET /api/config expõe partnerBanners para Landing e ClientHome
  const prevCfg = db.localStore.system_config?.default?.config || {};
  await db.query(
    `INSERT INTO public.system_config (id, config, updated_at) VALUES ('default', $1, NOW())
     ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW();`,
    [JSON.stringify({ ...prevCfg, partnerBanners: sampleBanners })]
  );

  const pubCfg = await apiJson('/api/config');
  assert.equal(pubCfg.status, 200);
  assert.equal(Array.isArray(pubCfg.json.partnerBanners), true);
  assert.equal(pubCfg.json.partnerBanners.length, 3);
  assert.equal(pubCfg.json.partnerBanners[0].name, 'Auto Posto Central');
  assert.equal(pubCfg.json.partnerBanners[1].displayMode, 'banner');
  assert.ok(String(pubCfg.json.partnerBanners[2].imageUrl || '').startsWith('data:image/gif;base64,'));

  const diff = audit.buildConfigChangesDiff({ ...prevCfg, partnerBanners: [] }, { ...prevCfg, partnerBanners: sampleBanners });
  assert.ok(diff.some(d => d.field === 'partnerBanners' && d.after === '3 item(ns)'));
});

test('Auditoria publica desativada (410) e /api/public/fleet expoe somente frota aprovada sem localizacoes', async () => {
  const oldAudit = await apiJson('/api/public/audit');
  assert.equal(oldAudit.status, 410);
  assert.equal(oldAudit.json.ok, false);

  const fleet = await apiJson('/api/public/fleet');
  assert.equal(fleet.status, 200);
  assert.equal(fleet.json.ok, true);
  assert.equal(fleet.json.rides, undefined);
  assert.ok(fleet.json.summary && typeof fleet.json.summary.totalApprovedDrivers === 'number');
  assert.ok(Array.isArray(fleet.json.drivers));
  for (const drv of fleet.json.drivers) {
    assert.equal(drv.originAddress, undefined);
    assert.equal(drv.destinationAddress, undefined);
    assert.equal(drv.auditedRidesCount, undefined);
    assert.equal(drv.crlvNumber, undefined);
  }
});

test('GET /api/geocode valida query curta e responde esquema seguro para enderecos colados', async () => {
  const shortGeo = await apiJson('/api/geocode?q=x');
  assert.equal(shortGeo.status, 200);
  assert.equal(shortGeo.json.ok, true);
  assert.deepEqual(shortGeo.json.results, []);

  const addrGeo = await apiJson('/api/geocode?q=' + encodeURIComponent('Rua 15 de Novembro, Lauro Muller, SC'));
  assert.equal(addrGeo.status, 200);
  assert.equal(addrGeo.json.ok, true);
  assert.equal(Array.isArray(addrGeo.json.results), true);
  for (const item of addrGeo.json.results) {
    assert.equal(typeof item.display_name, 'string');
    assert.equal(typeof item.lat, 'number');
    assert.equal(typeof item.lng, 'number');
  }
});

test('GET /api/manifest aponta PWA de passageiro diretamente para /cliente (nao para /)', async () => {
  const defaultManifest = await apiJson('/api/manifest');
  assert.equal(defaultManifest.status, 200);
  assert.equal(defaultManifest.json.id, '/cliente');
  assert.equal(defaultManifest.json.start_url, '/cliente');
  assert.equal(defaultManifest.json.display, 'standalone');

  const clientManifest = await apiJson('/api/manifest?role=client');
  assert.equal(clientManifest.status, 200);
  assert.equal(clientManifest.json.id, '/cliente');
  assert.equal(clientManifest.json.start_url, '/cliente');

  const driverManifest = await apiJson('/api/manifest?role=driver');
  assert.equal(driverManifest.status, 200);
  assert.equal(driverManifest.json.id, '/kavro-drive');
  assert.equal(driverManifest.json.start_url, '/kavro-drive');

  const adminManifest = await apiJson('/api/manifest?role=admin');
  assert.equal(adminManifest.status, 200);
  assert.equal(adminManifest.json.id, '/motora');
  assert.equal(adminManifest.json.start_url, '/motora');
});

test('Notificacoes segmentadas: Admin envia direto para passageiro/motorista e passageiro ve somente corridas e seus comunicados', async () => {
  const push = require('../server/push.cjs');
  const makeTestCpf = (seedNum) => {
    const base = String(seedNum).replace(/\D/g, '').padStart(9, '0').slice(-9);
    const digits = base.split('').map(Number);
    if (digits.every((d) => d === digits[0])) digits[8] = (digits[8] + 1) % 10;
    const calc = (sliceLen) => {
      let sum = 0;
      for (let i = 0; i < sliceLen; i++) sum += digits[i] * (sliceLen + 1 - i);
      const rem = (sum * 10) % 11;
      return rem >= 10 ? 0 : rem;
    };
    digits.push(calc(9));
    digits.push(calc(10));
    return digits.join('');
  };
  const seed = Math.floor((Date.now() % 600000000) + 150000021);
  const ts = Date.now();

  const cliReg = await apiJson('/api/clients/register', {
    method: 'POST',
    headers: { 'x-forwarded-for': '198.51.100.241' },
    body: {
      name: 'Passageiro Notif Teste',
      phone: `(48) 99511-${String(ts).slice(-4)}`,
      document: makeTestCpf(seed),
      email: `notif.cli.${ts}@kavro.test`,
      password: '1234',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(cliReg.status, 200);
  const cliId = cliReg.json.client.id;
  const cliToken = cliReg.json.clientToken;

  const cli2Reg = await apiJson('/api/clients/register', {
    method: 'POST',
    headers: { 'x-forwarded-for': '198.51.100.242' },
    body: {
      name: 'Passageiro Notif Outro',
      phone: `(48) 99522-${String(ts + 1).slice(-4)}`,
      document: makeTestCpf(seed + 19),
      email: `notif.cli2.${ts}@kavro.test`,
      password: '1234',
      termsAcceptance: { accepted: true }
    }
  });
  assert.equal(cli2Reg.status, 200);
  const cli2Token = cli2Reg.json.clientToken;

  const drvId = `drv-notif-${ts}`;
  const drvEmail = `notif.drv.${ts}@kavro.test`;
  db.localStore.drivers = db.localStore.drivers.filter(d => d.id !== drvId);
  db.localStore.drivers.push({
    id: drvId,
    name: 'Motorista Notif Teste',
    phone: `(48) 99533-${String(ts).slice(-4)}`,
    email: drvEmail,
    document: makeTestCpf(seed + 37),
    cnh: '88776655443',
    password_hash: scryptHash('1234'),
    vehicle_brand: 'Chevrolet',
    vehicle_model: 'Onix',
    vehicle_color: 'Prata',
    vehicle_year: '2024',
    vehicle_plate: 'KVR9A12',
    vehicle_category: 'kavro_go',
    eligible_categories: ['kavro_go'],
    approval_status: 'aprovado',
    financial_blocked: false,
    is_online: true,
    created_at: new Date().toISOString()
  });

  const drvLogin = await apiJson('/api/drivers/login', {
    method: 'POST',
    headers: { 'x-forwarded-for': '198.51.100.243' },
    body: { identifier: drvEmail, password: '1234' }
  });
  assert.equal(drvLogin.status, 200);
  const drvToken = drvLogin.json.driverToken;

  // Sem sessao Admin Master, endpoint HTTP permanece fechado (401) e anônimo nao enxerga notificacoes
  const unauthBroadcast = await apiJson('/api/push/broadcast', {
    method: 'POST',
    body: { audience: 'cliente', title: 'Sem Auth', message: 'Bloqueado' }
  });
  assert.equal(unauthBroadcast.status, 401);

  const anonNotifs = await apiJson('/api/notifications');
  assert.equal(anonNotifs.status, 200);
  assert.deepEqual(anonNotifs.json, []);

  // Insere alerta administrativo interno que NAO deve aparecer para passageiro nem motorista
  await db.query(
    `INSERT INTO public.notifications (id, title, message, type, read, timestamp)
     VALUES ($1, $2, $3, 'driver_kyc', false, NOW())`,
    [`notif-adm-only-${ts}`, 'KYC Interno Motorista', 'Dados internos do motorista']
  );

  // Admin dispara comunicados diretos segmentados (todos passageiros, passageiro específico, motoristas, motorista específico, admin)
  const bCastCli = await push.broadcastManualPush({
    audience: 'cliente',
    title: '🎉 Cupom Especial',
    message: 'Comunicado exclusivo para passageiros!'
  });
  assert.equal(bCastCli.ok, true);
  assert.equal(bCastCli.inAppDelivered, true);

  const bCastCliOne = await push.broadcastManualPush({
    audience: 'cliente_especifico',
    targetClientId: cliId,
    title: '🎁 Beneficio Individual',
    message: 'Somente o passageiro alvo deve ver este aviso.'
  });
  assert.equal(bCastCliOne.ok, true);
  assert.equal(bCastCliOne.inAppDelivered, true);

  const bCastDrv = await push.broadcastManualPush({
    audience: 'motorista',
    title: '⚡ Bonus Motorista',
    message: 'Somente motoristas devem ver isto.'
  });
  assert.equal(bCastDrv.ok, true);

  const bCastDrvOne = await push.broadcastManualPush({
    audience: 'motorista_especifico',
    targetDriverId: drvId,
    title: '🛡️ Alerta Frota Individual',
    message: 'Comunicado exclusivo do motorista selecionado.'
  });
  assert.equal(bCastDrvOne.ok, true);

  const bCastAdm = await push.broadcastManualPush({
    audience: 'admin',
    title: '🔐 Interno Admin Broadcast',
    message: 'Registro interno da gestao.'
  });
  assert.equal(bCastAdm.ok, true);

  // Passageiro 1 consulta /api/notifications: recebe o comunicado geral + individual dele, sem KYC interno nem avisos de motorista/admin
  const cliNotifs = await apiJson('/api/notifications', {
    headers: { 'x-client-token': cliToken }
  });
  assert.equal(cliNotifs.status, 200);
  assert.ok(Array.isArray(cliNotifs.json));
  assert.ok(cliNotifs.json.some(n => n.title === '🎉 Cupom Especial'));
  assert.ok(cliNotifs.json.some(n => n.title === '🎁 Beneficio Individual'));
  assert.equal(cliNotifs.json.some(n => n.type === 'driver_kyc' || n.type === 'client_new'), false);
  assert.equal(cliNotifs.json.some(n => n.title === '⚡ Bonus Motorista'), false);
  assert.equal(cliNotifs.json.some(n => n.title === '🛡️ Alerta Frota Individual'), false);
  assert.equal(cliNotifs.json.some(n => n.title === '🔐 Interno Admin Broadcast'), false);

  // Passageiro 2 NAO recebe o comunicado individual do Passageiro 1
  const cli2Notifs = await apiJson('/api/notifications', {
    headers: { 'x-client-token': cli2Token }
  });
  assert.equal(cli2Notifs.status, 200);
  assert.ok(cli2Notifs.json.some(n => n.title === '🎉 Cupom Especial'));
  assert.equal(cli2Notifs.json.some(n => n.title === '🎁 Beneficio Individual'), false);

  // Motorista recebe comunicados de motorista/frota, sem KYC administrativo nem cupom de passageiro
  const drvNotifs = await apiJson('/api/notifications', {
    headers: { 'x-driver-token': drvToken }
  });
  assert.equal(drvNotifs.status, 200);
  assert.ok(drvNotifs.json.some(n => n.title === '⚡ Bonus Motorista'));
  assert.ok(drvNotifs.json.some(n => n.title === '🛡️ Alerta Frota Individual'));
  assert.equal(drvNotifs.json.some(n => n.title === '🎉 Cupom Especial'), false);
  assert.equal(drvNotifs.json.some(n => n.type === 'driver_kyc'), false);

  // Admin Master visualiza todo o historico (alertas internos + comunicados enviados)
  const admNotifs = await push.queryNotificationsForViewer({ isAdmin: true, limit: 60 });
  assert.ok(admNotifs.some(n => n.type === 'driver_kyc'));
  assert.ok(admNotifs.some(n => n.title === '🎉 Cupom Especial'));
  assert.ok(admNotifs.some(n => n.title === '🔐 Interno Admin Broadcast'));

  // Admin dispara Push para TODOS (incluindo titulo padrao 'Kavro Drive' e Painel Master Donos)
  const bCastTodos = await push.broadcastManualPush({
    audience: 'todos',
    title: 'Kavro Drive',
    message: 'Comunicado geral para Passageiros, Motoristas e Donos!'
  });
  assert.equal(bCastTodos.ok, true);
  assert.equal(bCastTodos.includesAdmin, true);
  assert.equal(bCastTodos.audience, 'ambos');

  // Regra desativada (enabled: false) nao dispara push em eventos
  const prevCfgPush = db.localStore.system_config?.default?.config || {};
  await db.query(
    `INSERT INTO public.system_config (id, config, updated_at) VALUES ('default', $1, NOW())
     ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW();`,
    [JSON.stringify({
      ...prevCfgPush,
      pushTemplates: {
        ...(prevCfgPush.pushTemplates || {}),
        client_ride_booked: {
          enabled: false,
          audience: 'cliente',
          event: 'new_ride',
          title: 'Kavro Drive',
          message: 'Desativado teste'
        }
      }
    })]
  );
  const disabledOut = await push.notify('client_ride_booked', { id: 'KVR-DISABLED', clientId: cliId, clientPhone: '48999990000' });
  assert.equal(disabledOut, null);

  // Restaura pushTemplates limpo para o passo final de criacao da corrida
  await db.query(
    `INSERT INTO public.system_config (id, config, updated_at) VALUES ('default', $1, NOW())
     ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW();`,
    [JSON.stringify(prevCfgPush)]
  );

  // Passageiro cria corrida e recebe notificacao da corrida no sininho
  const rideRes = await apiJson('/api/rides', {
    method: 'POST',
    headers: { 'x-client-token': cliToken },
    body: {
      clientId: cliId,
      clientName: 'Passageiro Notif Teste',
      clientPhone: `(48) 99511-${String(ts).slice(-4)}`,
      originAddress: 'Origem Notif',
      destinationAddress: 'Destino Notif',
      originLat: -28.392,
      originLng: -49.397,
      destinationLat: -28.385,
      destinationLng: -49.389,
      distanceKm: 5,
      durationMin: 10,
      totalPrice: 22.5,
      category: 'kavro_go',
      paymentMethod: 'dinheiro'
    }
  });
  assert.equal(rideRes.status, 200);

  const cliNotifsAfterRide = await apiJson('/api/notifications', {
    headers: { 'x-client-token': cliToken }
  });
  assert.equal(cliNotifsAfterRide.status, 200);
  assert.ok(cliNotifsAfterRide.json.some(n => n.rideId === rideRes.json.ride.id));
  assert.ok(cliNotifsAfterRide.json.some(n => n.title === 'Kavro Drive' && n.message.includes('Comunicado geral')));
});

test('Regra de Saque PIX do Motorista: padrao somente Sexta-feira, edicao de dias no Admin e habilitar/desabilitar botao', async () => {
  const prevCfg = db.localStore.system_config?.default?.config || {};
  const ts = Date.now();
  const makeTestCpf = (seedNum) => {
    const base = String(seedNum).replace(/\D/g, '').padStart(9, '0').slice(-9);
    const digits = base.split('').map(Number);
    if (digits.every((d) => d === digits[0])) digits[8] = (digits[8] + 1) % 10;
    const calc = (sliceLen) => {
      let sum = 0;
      for (let i = 0; i < sliceLen; i++) sum += digits[i] * (sliceLen + 1 - i);
      const rem = (sum * 10) % 11;
      return rem >= 10 ? 0 : rem;
    };
    digits.push(calc(9));
    digits.push(calc(10));
    return digits.join('');
  };
  const drvCpf = makeTestCpf(Math.floor((ts % 650000000) + 190000033));
  const drvId = `drv-wd-sched-${ts}`;
  const drvEmail = `wd.sched.${ts}@kavro.test`;

  try {
    // 1. Padrão do banco aponta somente Sexta-feira ([5]), botão habilitado e taxas Efí Bank pré-configuradas
    assert.equal(originalStoreSnapshot.system_config.default.config.driverWithdrawalEnabled, true);
    assert.deepEqual(originalStoreSnapshot.system_config.default.config.driverWithdrawalWeekdays, [5]);
    assert.equal(originalStoreSnapshot.system_config.default.config.gatewayFeePercents.pix, 1.19);
    assert.equal(originalStoreSnapshot.system_config.default.config.gatewayFeePercents.cartao_credito, 3.49);

    const fridayCheck = finance.evaluateWithdrawalAvailability(
      { driverWithdrawalEnabled: true, driverWithdrawalWeekdays: [5] },
      new Date('2026-11-20T15:00:00-03:00')
    );
    assert.equal(fridayCheck.canRequestNow, true);
    assert.equal(fridayCheck.currentWeekday, 5);

    const saturdayCheck = finance.evaluateWithdrawalAvailability(
      { driverWithdrawalEnabled: true, driverWithdrawalWeekdays: [5] },
      new Date('2026-11-21T15:00:00-03:00')
    );
    assert.equal(saturdayCheck.canRequestNow, false);
    assert.match(saturdayCheck.blockedReason, /Sexta-feira/i);

    const disabledOnFriday = finance.evaluateWithdrawalAvailability(
      { driverWithdrawalEnabled: false, driverWithdrawalWeekdays: [5] },
      new Date('2026-11-20T15:00:00-03:00')
    );
    assert.equal(disabledOnFriday.canRequestNow, false);
    assert.match(disabledOnFriday.blockedReason, /desabilitadas/i);

    // 2. Motorista real com saldo disponível testa bloqueio por dia/botão e liberação após editar no Admin
    db.localStore.drivers.push({
      id: drvId,
      name: 'Motorista Regra Saque',
      phone: `(48) 99444-${String(ts).slice(-4)}`,
      email: drvEmail,
      document: drvCpf,
      cnh: '77665544332',
      password_hash: scryptHash('1234'),
      pix_key: drvCpf,
      pix_type: 'cpf',
      approval_status: 'aprovado',
      financial_blocked: false,
      is_online: true,
      created_at: new Date().toISOString()
    });
    await finance.recordLedgerEntry({
      idempotencyKey: `wd_sched_credit_${ts}`,
      driverId: drvId,
      driverName: 'Motorista Regra Saque',
      entryType: 'ride_earning_credit',
      paymentMethod: 'pix',
      grossAmount: 100,
      commissionPercent: 20,
      commissionAmount: 20,
      driverNetAmount: 80,
      balanceDelta: 80,
      balanceBucket: 'available',
      status: 'confirmado',
      description: 'Saldo regra de dias de saque'
    });

    const loginDrv = await apiJson('/api/drivers/login', {
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.246' },
      body: { identifier: drvEmail, password: '1234' }
    });
    assert.equal(loginDrv.status, 200);
    const drvToken = loginDrv.json.driverToken;

    const todayBr = finance.getBrazilWeekdayIndex(new Date());
    const otherDay = (todayBr + 1) % 7;

    // 2a) Dia diferente do configurado bloqueia saque via API (400)
    await db.query(
      `INSERT INTO public.system_config (id, config, updated_at) VALUES ('default', $1, NOW())
       ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW();`,
      [JSON.stringify({ ...prevCfg, minWithdrawalAmount: 20, driverWithdrawalEnabled: true, driverWithdrawalWeekdays: [otherDay] })]
    );
    const wrongDayRes = await apiJson(`/api/drivers/${encodeURIComponent(drvId)}/withdrawals`, {
      method: 'POST',
      headers: { 'x-driver-token': drvToken },
      body: { amount: 40, pixKey: drvCpf, pixType: 'cpf' }
    });
    assert.equal(wrongDayRes.status, 400);
    assert.match(String(wrongDayRes.json.error || ''), /Saques liberados/i);

    // 2b) Botão desabilitado pelo Admin bloqueia mesmo estando no dia permitido
    await db.query(
      `INSERT INTO public.system_config (id, config, updated_at) VALUES ('default', $1, NOW())
       ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW();`,
      [JSON.stringify({ ...prevCfg, minWithdrawalAmount: 20, driverWithdrawalEnabled: false, driverWithdrawalWeekdays: [todayBr] })]
    );
    const disabledBtnRes = await apiJson(`/api/drivers/${encodeURIComponent(drvId)}/withdrawals`, {
      method: 'POST',
      headers: { 'x-driver-token': drvToken },
      body: { amount: 40, pixKey: drvCpf, pixType: 'cpf' }
    });
    assert.equal(disabledBtnRes.status, 400);
    assert.match(String(disabledBtnRes.json.error || ''), /desabilitadas/i);

    // 2c) Botão habilitado e dia atual incluído pelo Admin libera solicitação de saque (200)
    await db.query(
      `INSERT INTO public.system_config (id, config, updated_at) VALUES ('default', $1, NOW())
       ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW();`,
      [JSON.stringify({ ...prevCfg, minWithdrawalAmount: 20, driverWithdrawalEnabled: true, driverWithdrawalWeekdays: [todayBr, 5] })]
    );
    const okRes = await apiJson(`/api/drivers/${encodeURIComponent(drvId)}/withdrawals`, {
      method: 'POST',
      headers: { 'x-driver-token': drvToken },
      body: { amount: 40, pixKey: drvCpf, pixType: 'cpf' }
    });
    assert.equal(okRes.status, 200);
    assert.equal(okRes.json.ok, true);

    // 3) Auditoria registra alterações nos dias de saque e na habilitação do botão
    const diff = audit.buildConfigChangesDiff(
      { ...prevCfg, driverWithdrawalEnabled: true, driverWithdrawalWeekdays: [5] },
      { ...prevCfg, driverWithdrawalEnabled: false, driverWithdrawalWeekdays: [1, 5] }
    );
    assert.ok(diff.some(d => d.field === 'driverWithdrawalEnabled' && d.after.includes('Desativado')));
    assert.ok(diff.some(d => d.field === 'driverWithdrawalWeekdays' && d.after.includes('Segunda-feira') && d.after.includes('Sexta-feira')));
  } finally {
    await db.query(
      `INSERT INTO public.system_config (id, config, updated_at) VALUES ('default', $1, NOW())
       ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW();`,
      [JSON.stringify(prevCfg)]
    );
  }
});

test('Tarifa unica 24h: corrida diurna e madrugada tem o mesmo valor (sem adicional noturno fixo)', () => {
  const cfgWithLegacyNight = {
    baseFare: 8,
    pricePerKm: 3.2,
    pricePerMinute: 0.5,
    minimumFare: 15,
    nightSurchargePercent: 20,
    nightStartHour: 22,
    nightEndHour: 6
  };
  const dayRes = security.calculateOfficialRidePriceServer({
    cfg: cfgWithLegacyNight,
    distanceKm: 8,
    durationMin: 15,
    timeStr: '14:00'
  });
  const nightRes = security.calculateOfficialRidePriceServer({
    cfg: cfgWithLegacyNight,
    distanceKm: 8,
    durationMin: 15,
    timeStr: '23:30'
  });
  assert.equal(dayRes.isNight, false);
  assert.equal(nightRes.isNight, false);
  assert.equal(dayRes.nightSurcharge, 0);
  assert.equal(nightRes.nightSurcharge, 0);
  assert.equal(nightRes.totalPrice, dayRes.totalPrice);
});

test('Cloudflare R2 Public Media: banners de parceiros, config master, fotos de motorista e passageiro vao para R2', async () => {
  const prevR2PubUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL;
  const prevR2PubBucket = process.env.CLOUDFLARE_R2_PUBLIC_BUCKET;
  const prevCfgRow = JSON.parse(JSON.stringify(db.localStore.system_config?.default?.config || {}));

  const uploadedObjects = [];
  kycStorage.setCloudflareR2ClientOverride({
    send: async (cmd) => {
      uploadedObjects.push({
        bucket: cmd?.input?.Bucket,
        key: cmd?.input?.Key,
        contentType: cmd?.input?.ContentType,
        cacheControl: cmd?.input?.CacheControl,
        size: cmd?.input?.Body ? cmd.input.Body.length : 0
      });
      return {};
    }
  });
  process.env.CLOUDFLARE_R2_PUBLIC_URL = 'https://cdn-test.r2.dev';
  process.env.CLOUDFLARE_R2_PUBLIC_BUCKET = 'kavro-media';

  const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const tinyGif = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const tinyWebp = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
  const tinySvg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>').toString('base64');
  const makeValidCpf = (seed) => {
    const base = String(seed).padStart(9, '0').slice(0, 9).split('').map(Number);
    const calcDigit = (digits) => {
      let sum = 0;
      for (let i = 0; i < digits.length; i++) sum += digits[i] * (digits.length + 1 - i);
      const rem = (sum * 10) % 11;
      return rem >= 10 ? 0 : rem;
    };
    base.push(calcDigit(base));
    base.push(calcDigit(base));
    return base.join('');
  };
  const validCpfCli = makeValidCpf(481234567);
  const validCpfDrv = makeValidCpf(489876543);

  try {
    // 1) POST /api/media/upload e POST /api/config rejeitam anonimo (401)
    const unauthUpload = await apiJson('/api/media/upload', {
      method: 'POST',
      body: { kind: 'partner-banner', ownerId: 'prt-unauth', dataUrl: tinyGif }
    });
    assert.equal(unauthUpload.status, 401);

    // 2) normalizeConfigMediaToR2 converte partnerBanners (GIF, WebP, SVG) + driverPhoto + driverCarPhoto para R2
    const normalizedCfg = await normalizeConfigMediaToR2({
      ...prevCfgRow,
      driverPhoto: tinyPng,
      driverCarPhoto: tinyWebp,
      partnerBanners: [
        { id: 'prt-r2-webp', kind: 'parceiro', displayMode: 'banner', areas: ['site'], imageUrl: tinyWebp, active: true },
        { id: 'prt-r2-gif', kind: 'patrocinador', displayMode: 'banner', areas: ['client_home'], imageUrl: tinyGif, active: true },
        { id: 'prt-r2-svg', kind: 'parceiro', displayMode: 'logo', areas: ['site'], imageUrl: tinySvg, active: true }
      ]
    });
    assert.match(normalizedCfg.driverPhoto, /^https:\/\/cdn-test\.r2\.dev\/system\/driver-avatar_.*\.png$/);
    assert.match(normalizedCfg.driverCarPhoto, /^https:\/\/cdn-test\.r2\.dev\/system\/driver-vehicle_.*\.webp$/);
    assert.match(normalizedCfg.partnerBanners[0].imageUrl, /^https:\/\/cdn-test\.r2\.dev\/partners\/prt-r2-webp\/banner_.*\.webp$/);
    assert.match(normalizedCfg.partnerBanners[1].imageUrl, /^https:\/\/cdn-test\.r2\.dev\/partners\/prt-r2-gif\/banner_.*\.gif$/);
    assert.match(normalizedCfg.partnerBanners[2].imageUrl, /^https:\/\/cdn-test\.r2\.dev\/partners\/prt-r2-svg\/banner_.*\.svg$/);

    // 3) Cadastro e atualizacao de foto de PASSAGEIRO salvam no R2 (clients/<id>/avatar_...)
    const cliReg = await apiJson('/api/clients/register', {
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.251' },
      body: {
        name: 'Passageiro Foto R2',
        phone: '(48) 99981-2233',
        email: 'passageiro.r2@kavro.test',
        document: validCpfCli,
        password: '1234',
        photo: tinyPng,
        termsAcceptance: {
          accepted: true,
          contractId: 'KAVRO-TC-PASSAGEIRO',
          contractVersion: '2026.1',
          acceptedAtClient: new Date().toISOString(),
          affirmativeText: 'Li e concordo com os Termos.'
        }
      }
    });
    assert.equal(cliReg.status, 200);
    assert.match(cliReg.json.client.photo, /^https:\/\/cdn-test\.r2\.dev\/clients\/.*\/avatar_.*\.png$/);

    const cliPhotoUpdate = await apiJson(`/api/clients/${encodeURIComponent(cliReg.json.client.id)}/photo`, {
      method: 'POST',
      headers: { 'x-client-token': cliReg.json.clientToken },
      body: { photo: tinyWebp }
    });
    assert.equal(cliPhotoUpdate.status, 200);
    assert.match(cliPhotoUpdate.json.client.photo, /^https:\/\/cdn-test\.r2\.dev\/clients\/.*\/avatar_.*\.webp$/);

    // Passageiro pode subir avatar direto via POST /api/media/upload, mas nao pode subir partner-banner (401)
    const cliBannerAttempt = await apiJson('/api/media/upload', {
      method: 'POST',
      headers: { 'x-client-token': cliReg.json.clientToken },
      body: { kind: 'partner-banner', ownerId: 'prt-hack', dataUrl: tinyPng }
    });
    assert.equal(cliBannerAttempt.status, 401);

    const cliDirectUpload = await apiJson('/api/media/upload', {
      method: 'POST',
      headers: { 'x-client-token': cliReg.json.clientToken },
      body: { kind: 'client-avatar', ownerId: cliReg.json.client.id, dataUrl: tinyPng }
    });
    assert.equal(cliDirectUpload.status, 200);
    assert.match(cliDirectUpload.json.url, /^https:\/\/cdn-test\.r2\.dev\/clients\/.*\/avatar_.*\.png$/);

    // 4) Cadastro e edicao de foto de MOTORISTA e VEICULO salvam no R2 (drivers/<id>/...)
    const drvReg = await apiJson('/api/drivers/register', {
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.252' },
      body: {
        name: 'Motorista Foto R2',
        phone: '(48) 99982-3344',
        email: 'motorista.r2@kavro.test',
        document: validCpfDrv,
        cnh: '99887766554',
        password: '1234',
        photo: tinyPng,
        vehicleBrand: 'Toyota',
        vehicleModel: 'Corolla',
        vehicleColor: 'Prata',
        vehicleYear: '2024',
        vehiclePlate: 'R2D2K99',
        vehiclePhoto: tinyWebp,
        crlvDocumentPhoto: tinyPng,
        termsAcceptance: {
          accepted: true,
          contractId: 'KAVRO-TC-MOTORISTA',
          contractVersion: '2026.1',
          acceptedAtClient: new Date().toISOString(),
          affirmativeText: 'Li e concordo com o Contrato.'
        }
      }
    });
    assert.equal(drvReg.status, 200);
    assert.match(drvReg.json.driver.photo, /^https:\/\/cdn-test\.r2\.dev\/drivers\/.*\/avatar_.*\.png$/);
    assert.match(drvReg.json.driver.vehiclePhoto, /^https:\/\/cdn-test\.r2\.dev\/drivers\/.*\/vehicle_.*\.webp$/);
    assert.match(drvReg.json.driver.vehicles[0].crlvDocumentPhoto, /^https:\/\/cdn-test\.r2\.dev\/drivers\/.*\/crlv_.*\.png$/);

    const drvPatch = await apiJson(`/api/drivers/${encodeURIComponent(drvReg.json.driver.id)}`, {
      method: 'PATCH',
      headers: { 'x-driver-token': drvReg.json.driverToken },
      body: { photo: tinyWebp }
    });
    assert.equal(drvPatch.status, 200);
    assert.match(drvPatch.json.driver.photo, /^https:\/\/cdn-test\.r2\.dev\/drivers\/.*\/avatar_.*\.webp$/);

    const drvDirectUpload = await apiJson('/api/media/upload', {
      method: 'POST',
      headers: { 'x-driver-token': drvReg.json.driverToken },
      body: { kind: 'driver-avatar', ownerId: drvReg.json.driver.id, dataUrl: tinyPng }
    });
    assert.equal(drvDirectUpload.status, 200);
    assert.match(drvDirectUpload.json.url, /^https:\/\/cdn-test\.r2\.dev\/drivers\/.*\/avatar_.*\.png$/);

    // Confirma que todos uploads usaram bucket kavro-media e cache de 1 ano
    assert.ok(uploadedObjects.length >= 12);
    assert.ok(uploadedObjects.every(o => o.bucket === 'kavro-media' && o.cacheControl === 'public, max-age=31536000'));
  } finally {
    kycStorage.setCloudflareR2ClientOverride(null);
    if (prevR2PubUrl === undefined) delete process.env.CLOUDFLARE_R2_PUBLIC_URL;
    else process.env.CLOUDFLARE_R2_PUBLIC_URL = prevR2PubUrl;
    if (prevR2PubBucket === undefined) delete process.env.CLOUDFLARE_R2_PUBLIC_BUCKET;
    else process.env.CLOUDFLARE_R2_PUBLIC_BUCKET = prevR2PubBucket;
    await db.query(
      `INSERT INTO public.system_config (id, config, updated_at) VALUES ('default', $1, NOW())
       ON CONFLICT (id) DO UPDATE SET config = EXCLUDED.config, updated_at = NOW();`,
      [JSON.stringify(prevCfgRow)]
    );
  }
});

test('Cloudflare Turnstile no OTP e K-Audio real no Cloudflare R2 Privado com URL assinada 15 min', async () => {
  const prevTurnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  const prevPrivBucket = process.env.CLOUDFLARE_R2_BUCKET;
  const originalFetch = global.fetch;

  const { S3Client } = require('@aws-sdk/client-s3');
  const fakePrivClient = new S3Client({
    region: 'auto',
    endpoint: 'https://test-account.r2.cloudflarestorage.com',
    credentials: { accessKeyId: 'test-key-id', secretAccessKey: 'test-secret-key' }
  });
  const privUploads = [];
  fakePrivClient.send = async (cmd) => {
    privUploads.push({
      bucket: cmd?.input?.Bucket,
      key: cmd?.input?.Key,
      contentType: cmd?.input?.ContentType,
      size: cmd?.input?.Body ? cmd.input.Body.length : 0
    });
    return {};
  };
  kycStorage.setCloudflareR2ClientOverride(fakePrivClient);
  process.env.CLOUDFLARE_R2_BUCKET = 'kyc-documents';
  process.env.TURNSTILE_SECRET_KEY = 'test-turnstile-secret';

  global.fetch = async (url, opts) => {
    if (String(url).includes('challenges.cloudflare.com/turnstile/v0/siteverify')) {
      const bodyStr = String(opts?.body || '');
      const valid = bodyStr.includes('response=valid-turnstile-tok');
      return new Response(JSON.stringify({ success: valid }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return originalFetch(url, opts);
  };

  try {
    // 1) Cria passageiro autenticado com desafio Turnstile valido
    const makeValidCpf = (seed) => {
      const base = String(seed).padStart(9, '0').slice(0, 9).split('').map(Number);
      const calcDigit = (digits) => {
        let sum = 0;
        for (let i = 0; i < digits.length; i++) sum += digits[i] * (digits.length + 1 - i);
        const rem = (sum * 10) % 11;
        return rem >= 10 ? 0 : rem;
      };
      base.push(calcDigit(base));
      base.push(calcDigit(base));
      return base.join('');
    };

    const regCli = await apiJson('/api/clients/register', {
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.253' },
      body: {
        name: 'Passageiro Turnstile OTP',
        phone: '(48) 99811-7766',
        email: 'otp.turnstile@kavro.test',
        document: makeValidCpf(481112233),
        password: '1234',
        turnstileToken: 'valid-turnstile-tok',
        termsAcceptance: {
          accepted: true,
          contractId: 'KAVRO-TC-PASSAGEIRO',
          contractVersion: '2026.1',
          acceptedAtClient: new Date().toISOString(),
          affirmativeText: 'Li e concordo com os Termos.'
        }
      }
    });
    assert.equal(regCli.status, 200);
    const cliToken = regCli.json.clientToken;
    const cliId = regCli.json.client.id;

    // 2) Turnstile no OTP bloqueia solicitacao sem token (403) e aprova com token valido (200)
    const otpBlocked = await apiJson('/api/auth/recovery/request', {
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.253' },
      body: { role: 'client', identifier: 'otp.turnstile@kavro.test' }
    });
    assert.equal(otpBlocked.status, 403);

    const otpAllowed = await apiJson('/api/auth/recovery/request', {
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.253' },
      body: { role: 'client', identifier: 'otp.turnstile@kavro.test', turnstileToken: 'valid-turnstile-tok' }
    });
    assert.equal(otpAllowed.status, 200);
    assert.equal(otpAllowed.json.ok, true);

    // 3) K-Audio real salvo no R2 Privado (kyc-documents/safety-audio/...) com URL assinada 15 min
    const rideRes = await apiJson('/api/rides', {
      method: 'POST',
      headers: { 'x-client-token': cliToken },
      body: {
        clientId: cliId,
        clientName: 'Passageiro Turnstile OTP',
        clientPhone: '(48) 99811-7766',
        originAddress: 'Centro',
        destinationAddress: 'Rodoviária',
        distanceKm: 4.5,
        durationMin: 10,
        totalPrice: 20,
        category: 'kavro_go',
        paymentMethod: 'pix'
      }
    });
    assert.equal(rideRes.status, 200);
    const rideId = rideRes.json.ride.id;

    const sampleAudioDataUrl = 'data:audio/webm;codecs=opus;base64,' + Buffer.from('kavro-fake-webm-audio-bytes').toString('base64');
    const audioUp = await apiJson(`/api/rides/${encodeURIComponent(rideId)}/safety-audio`, {
      method: 'POST',
      headers: { 'x-client-token': cliToken },
      body: {
        id: 'kaudio-r2-clip-1',
        durationSec: 12,
        mimeType: 'audio/webm;codecs=opus',
        sizeBytes: 27,
        audioDataUrl: sampleAudioDataUrl,
        escalateToSos: true
      }
    });
    assert.equal(audioUp.status, 200);
    assert.equal(audioUp.json.record.hasAudioFile, true);
    assert.equal(audioUp.json.record.storage, 'cloudflare_r2');
    assert.equal(audioUp.json.record.audioDocInfo, undefined);
    assert.equal(privUploads.length, 1);
    assert.equal(privUploads[0].bucket, 'kyc-documents');
    assert.match(privUploads[0].key, new RegExp(`^safety-audio/${rideId}/kaudio-r2-clip-1\\.webm$`));
    assert.equal(privUploads[0].contentType, 'audio/webm');

    // Acesso anonimo rejeitado (401); dono da corrida recebe URL assinada de 15 min (900s)
    const anonPlay = await apiJson(`/api/rides/${encodeURIComponent(rideId)}/safety-audio/kaudio-r2-clip-1`);
    assert.equal(anonPlay.status, 401);

    const ownerPlay = await apiJson(`/api/rides/${encodeURIComponent(rideId)}/safety-audio/kaudio-r2-clip-1`, {
      headers: { 'x-client-token': cliToken }
    });
    assert.equal(ownerPlay.status, 200);
    assert.equal(ownerPlay.json.expiresInSec, 900);
    assert.match(ownerPlay.json.signedUrl, /^https:\/\/.*r2\.cloudflarestorage\.com\/.*safety-audio\/.*X-Amz-Expires=900/);
  } finally {
    global.fetch = originalFetch;
    kycStorage.setCloudflareR2ClientOverride(null);
    if (prevTurnstileSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = prevTurnstileSecret;
    if (prevPrivBucket === undefined) delete process.env.CLOUDFLARE_R2_BUCKET;
    else process.env.CLOUDFLARE_R2_BUCKET = prevPrivBucket;
  }
});

test('OneSignal Push usa novas credenciais dinamica e corretamente em /api/health e sendToExternalIds', async () => {
  const push = require('../server/push.cjs');
  const prevAppId = process.env.ONESIGNAL_APP_ID;
  const prevApiKey = process.env.ONESIGNAL_REST_API_KEY;
  const prevVercelProdUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const originalFetch = global.fetch;

  try {
    delete process.env.ONESIGNAL_APP_ID;
    delete process.env.ONESIGNAL_REST_API_KEY;
    assert.equal(push.getAppId(), 'ec6678e3-9723-4080-883f-d5bb0fe74a7b');
    assert.equal(push.isConfigured(), false);

    const healthOff = await apiJson('/api/health');
    assert.equal(healthOff.status, 200);
    assert.equal(healthOff.json.services.pushConfigured, false);

    process.env.ONESIGNAL_REST_API_KEY = 'os_v2_app_unit_test_dummy_key';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'kavrodrive.vercel.app';
    assert.equal(push.isConfigured(), true);

    const healthOn = await apiJson('/api/health');
    assert.equal(healthOn.status, 200);
    assert.equal(healthOn.json.services.pushConfigured, true);

    const captured = [];
    global.fetch = async (url, init = {}) => {
      const targetUrl = String(url || '');
      if (targetUrl.startsWith('https://api.onesignal.com/')) {
        captured.push({
          url: targetUrl,
          method: init.method,
          headers: init.headers,
          body: init.body ? JSON.parse(init.body) : null
        });
        return new Response(JSON.stringify({ id: 'notif-test-123', recipients: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return originalFetch(url, init);
    };

    const out = await push.sendToExternalIds(['up-admin'], 'Kavro Drive', 'Teste ativo!', { url: '/administracion' });
    assert.equal(out.id, 'notif-test-123');
    assert.equal(captured.length, 1);
    assert.equal(captured[0].headers.Authorization, 'Key os_v2_app_unit_test_dummy_key');
    assert.equal(captured[0].body.app_id, 'ec6678e3-9723-4080-883f-d5bb0fe74a7b');
    assert.equal(captured[0].body.chrome_web_icon, 'https://kavrodrive.vercel.app/pwa-icon-192.png');
    assert.equal(captured[0].body.web_url, 'https://kavrodrive.vercel.app/administracion');

    process.env.ONESIGNAL_APP_ID = 'custom-override-app-id';
    assert.equal(push.getAppId(), 'custom-override-app-id');
  } finally {
    global.fetch = originalFetch;
    if (prevAppId === undefined) delete process.env.ONESIGNAL_APP_ID;
    else process.env.ONESIGNAL_APP_ID = prevAppId;
    if (prevApiKey === undefined) delete process.env.ONESIGNAL_REST_API_KEY;
    else process.env.ONESIGNAL_REST_API_KEY = prevApiKey;
    if (prevVercelProdUrl === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL = prevVercelProdUrl;
  }
});

test('Otimizacao de escala: updateDriverLocationOnly preserva perfil/veiculos sem estourar cache e PATCH /rides/:id/location retorna estado completo', async () => {
  const finance = require('../server/financeEngine.cjs');
  const ts = Date.now();
  const drvId = `drv-scale-${ts}`;
  db.localStore.drivers = db.localStore.drivers.filter(d => d.id !== drvId);
  db.localStore.drivers.push({
    id: drvId,
    name: 'Motorista Escala Teste',
    phone: `(48) 99600-${String(ts).slice(-4)}`,
    email: `scale.drv.${ts}@kavro.test`,
    document: '12345678909',
    cnh: '11223344556',
    password_hash: scryptHash('1234'),
    vehicle_brand: 'Honda',
    vehicle_model: 'Civic',
    vehicle_color: 'Preto',
    vehicle_year: '2024',
    vehicle_plate: 'KVR1S23',
    vehicle_category: 'kavro_go',
    eligible_categories: ['kavro_go'],
    approval_status: 'aprovado',
    financial_blocked: false,
    is_online: true,
    pix_key: '12345678909',
    pix_type: 'cpf',
    location: { lat: -28.39, lng: -49.39, heading: 0, speedKmH: 0, updatedAt: new Date().toISOString() },
    created_at: new Date().toISOString()
  });

  const loginRes = await apiJson('/api/drivers/login', {
    method: 'POST',
    headers: { 'x-forwarded-for': '198.51.100.250' },
    body: { identifier: `scale.drv.${ts}@kavro.test`, password: '1234' }
  });
  assert.equal(loginRes.status, 200);
  const drvToken = loginRes.json.driverToken;

  const locRes = await apiJson(`/api/drivers/${encodeURIComponent(drvId)}/location`, {
    method: 'PATCH',
    headers: { 'x-driver-token': drvToken },
    body: { lat: -28.4123, lng: -49.4567, heading: 90, speedKmH: 42 }
  });
  assert.equal(locRes.status, 200);
  assert.equal(locRes.json.ok, true);
  assert.equal(locRes.json.driver.location.lat, -28.4123);
  assert.equal(locRes.json.driver.location.lng, -49.4567);
  assert.equal(locRes.json.driver.location.speedKmH, 42);

  // Confirma que dados completos do motorista nao foram sobrescritos/apagados
  const preserved = await finance.getDriverById(drvId);
  assert.equal(preserved.name, 'Motorista Escala Teste');
  assert.equal(preserved.vehiclePlate, 'KVR1S23');
  assert.equal(preserved.pixKey, '12345678909');
  assert.equal(preserved.location.lat, -28.4123);

  // Sync autenticado ja enxerga coordenada atualizada
  const syncRes = await apiJson(`/api/sync?driverId=${encodeURIComponent(drvId)}`, {
    headers: { 'x-driver-token': drvToken }
  });
  assert.equal(syncRes.status, 200);
  const meInSync = syncRes.json.drivers.find(d => d.id === drvId);
  assert.equal(meInSync.location.lat, -28.4123);
});
