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
const { handleApiRequest } = require('../server/apiHandler.cjs');

// Garante que chaves de serviços externos carregadas do .env não disparem chamadas externas em testes
delete process.env.TURNSTILE_SECRET_KEY;
delete process.env.RESEND_API_KEY;
delete process.env.OTP_WEBHOOK_URL;
delete process.env.ONESIGNAL_REST_API_KEY;
delete process.env.VERCEL;

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

test('GET /api/realtime/stream abre stream SSE e transmite evento ao vivo', async () => {
  await new Promise((resolve, reject) => {
    const req = http.get(`${baseUrl}/api/realtime/stream?rideId=UP-SSE-1`, (res) => {
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
          realtimeHub.publish('chat:message', { rideId: 'UP-SSE-1', message: { id: 'm-1', text: 'Olá!' } }, { rideId: 'UP-SSE-1' });
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
      distanceKm: 10,
      durationMin: 20,
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
