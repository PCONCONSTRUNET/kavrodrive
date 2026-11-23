const crypto = require('crypto');
const db = require('./db.cjs');
const env = require('./env.cjs');

let cachedCfg = null;
let cachedRowExists = null;
let cachedCfgExpiresAt = 0;
let schemaEnsured = false;
let customFetchForTest = null;

function _setMercadoPagoFetchForTest(fn) {
  customFetchForTest = typeof fn === 'function' ? fn : null;
}

function clearCaches() {
  cachedCfg = null;
  cachedRowExists = null;
  cachedCfgExpiresAt = 0;
}

function getEnvDefaults() {
  const accessToken = String(env.MERCADOPAGO_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  const publicKey = String(
    env.MERCADOPAGO_PUBLIC_KEY ||
      process.env.MERCADOPAGO_PUBLIC_KEY ||
      env.VITE_MERCADOPAGO_PUBLIC_KEY ||
      process.env.VITE_MERCADOPAGO_PUBLIC_KEY ||
      ''
  ).trim();
  const webhookSecret = String(env.MERCADOPAGO_WEBHOOK_SECRET || process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim();
  const looksSandbox = accessToken.startsWith('TEST-') || publicKey.startsWith('TEST-') || (!accessToken && !publicKey);
  return {
    accessToken,
    publicKey,
    webhookSecret,
    looksSandbox
  };
}

function defaultMercadoPagoConfig({ useEnvFallback = true } = {}) {
  const d = useEnvFallback
    ? getEnvDefaults()
    : { accessToken: '', publicKey: '', webhookSecret: '', looksSandbox: true };

  return {
    enabled: useEnvFallback ? Boolean(d.accessToken) : false,
    sandbox: Boolean(d.looksSandbox),
    publicKey: d.publicKey,
    accessToken: d.accessToken,
    webhookSecret: d.webhookSecret,
    useForCard: true,
    useForPassengerPix: true,
    statementDescriptor: 'KAVRO DRIVE',
    webhookUrl: '',
    lastTestedAt: null,
    lastTestOk: null,
    lastTestMessage: '',
    updatedAt: null,
    source: useEnvFallback && (d.accessToken || d.publicKey || d.webhookSecret) ? 'env' : 'default'
  };
}

function normalizeMercadoPagoConfig(raw = {}, { hasStoredRow = true } = {}) {
  const base = defaultMercadoPagoConfig({ useEnvFallback: !hasStoredRow });
  if (!hasStoredRow) {
    return base;
  }

  return {
    enabled: Boolean(raw.enabled),
    sandbox: raw.sandbox !== undefined ? Boolean(raw.sandbox) : base.sandbox,
    publicKey: raw.publicKey !== undefined ? String(raw.publicKey || '').trim() : '',
    accessToken: raw.accessToken !== undefined ? String(raw.accessToken || '').trim() : '',
    webhookSecret: raw.webhookSecret !== undefined ? String(raw.webhookSecret || '').trim() : '',
    useForCard: raw.useForCard !== undefined ? Boolean(raw.useForCard) : true,
    useForPassengerPix: raw.useForPassengerPix !== undefined ? Boolean(raw.useForPassengerPix) : true,
    statementDescriptor: String(raw.statementDescriptor || 'KAVRO DRIVE').trim().slice(0, 22) || 'KAVRO DRIVE',
    webhookUrl: String(raw.webhookUrl || '').trim(),
    lastTestedAt: raw.lastTestedAt || null,
    lastTestOk: raw.lastTestOk === true ? true : raw.lastTestOk === false ? false : null,
    lastTestMessage: String(raw.lastTestMessage || ''),
    updatedAt: raw.updatedAt || null,
    source: 'database'
  };
}

async function ensureSchema() {
  if (schemaEnsured) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.gateway_configs (
        provider VARCHAR(40) PRIMARY KEY,
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    schemaEnsured = true;
  } catch (err) {
    console.warn('[mercadoPago] ensureSchema:', err.message);
  }
}

async function getMercadoPagoConfig({ forceFresh = false } = {}) {
  if (!forceFresh && cachedCfgExpiresAt > Date.now()) {
    if (cachedRowExists === false) {
      return defaultMercadoPagoConfig({ useEnvFallback: true });
    }
    if (cachedCfg) {
      return cachedCfg;
    }
  }

  await ensureSchema();
  try {
    const res = await db.query(
      'SELECT config, updated_at FROM public.gateway_configs WHERE provider = $1 LIMIT 1',
      ['mercadopago']
    );
    const row = res.rows[0];
    if (!row || !row.config) {
      cachedRowExists = false;
      cachedCfg = null;
      cachedCfgExpiresAt = Date.now() + 5000;
      return defaultMercadoPagoConfig({ useEnvFallback: true });
    }
    const merged = normalizeMercadoPagoConfig(
      { ...row.config, updatedAt: row.updated_at || row.config?.updatedAt || null },
      { hasStoredRow: true }
    );
    cachedRowExists = true;
    cachedCfg = merged;
    cachedCfgExpiresAt = Date.now() + 5000;
    return merged;
  } catch (err) {
    console.warn('[mercadoPago] erro ao ler configuracao:', err.message);
    return defaultMercadoPagoConfig({ useEnvFallback: true });
  }
}

function maskSecret(val) {
  const s = String(val || '').trim();
  if (!s) return '';
  if (s.length <= 8) return '••••••••';
  return `${s.slice(0, 7)}••••${s.slice(-4)}`;
}

function buildComputedWebhookUrl(baseOrigin) {
  const origin = String(baseOrigin || 'https://kavrodrive.vercel.app').replace(/\/+$/, '');
  return `${origin}/api/webhooks/mercadopago`;
}

function sanitizeMercadoPagoConfigForAdmin(cfg) {
  return {
    enabled: Boolean(cfg.enabled),
    sandbox: Boolean(cfg.sandbox),
    publicKey: cfg.publicKey || '',
    hasAccessToken: Boolean(cfg.accessToken),
    accessTokenMasked: maskSecret(cfg.accessToken),
    hasWebhookSecret: Boolean(cfg.webhookSecret),
    webhookSecretMasked: maskSecret(cfg.webhookSecret),
    useForCard: cfg.useForCard !== false,
    useForPassengerPix: cfg.useForPassengerPix !== false,
    statementDescriptor: cfg.statementDescriptor || 'KAVRO DRIVE',
    webhookUrl: cfg.webhookUrl || '',
    lastTestedAt: cfg.lastTestedAt || null,
    lastTestOk: cfg.lastTestOk ?? null,
    lastTestMessage: cfg.lastTestMessage || '',
    updatedAt: cfg.updatedAt || null,
    credentialsReady: Boolean(cfg.accessToken),
    source: cfg.source || 'default'
  };
}

async function saveMercadoPagoConfig(updates = {}) {
  await ensureSchema();
  const current = await getMercadoPagoConfig({ forceFresh: true });
  const next = { ...current };

  if (updates.enabled !== undefined) next.enabled = Boolean(updates.enabled);
  if (updates.sandbox !== undefined) next.sandbox = Boolean(updates.sandbox);
  if (updates.publicKey !== undefined) next.publicKey = String(updates.publicKey || '').trim();
  if (updates.clearPublicKey === true) next.publicKey = '';

  if (updates.accessToken !== undefined) {
    const newToken = String(updates.accessToken || '').trim();
    if (newToken) next.accessToken = newToken;
  }
  if (updates.clearAccessToken === true) {
    next.accessToken = '';
    if (updates.enabled === undefined) {
      next.enabled = false;
    }
  }

  if (updates.webhookSecret !== undefined) {
    const newWh = String(updates.webhookSecret || '').trim();
    if (newWh) next.webhookSecret = newWh;
  }
  if (updates.clearWebhookSecret === true) {
    next.webhookSecret = '';
  }

  if (updates.useForCard !== undefined) next.useForCard = Boolean(updates.useForCard);
  if (updates.useForPassengerPix !== undefined) next.useForPassengerPix = Boolean(updates.useForPassengerPix);
  if (updates.statementDescriptor !== undefined) {
    next.statementDescriptor = String(updates.statementDescriptor || 'KAVRO DRIVE').trim().slice(0, 22) || 'KAVRO DRIVE';
  }
  if (updates.webhookUrl !== undefined) next.webhookUrl = String(updates.webhookUrl || '').trim();
  if (updates.lastTestedAt !== undefined) next.lastTestedAt = updates.lastTestedAt;
  if (updates.lastTestOk !== undefined) next.lastTestOk = updates.lastTestOk;
  if (updates.lastTestMessage !== undefined) next.lastTestMessage = String(updates.lastTestMessage || '');

  if (next.enabled && !next.accessToken) {
    throw new Error('Para ativar o Mercado Pago, informe o Access Token nas credenciais.');
  }

  next.updatedAt = new Date().toISOString();
  next.source = 'database';

  await db.query(
    `INSERT INTO public.gateway_configs (provider, config, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (provider) DO UPDATE SET
       config = EXCLUDED.config,
       updated_at = NOW()`,
    ['mercadopago', JSON.stringify(next)]
  );

  clearCaches();
  cachedRowExists = true;
  cachedCfg = normalizeMercadoPagoConfig(next, { hasStoredRow: true });
  cachedCfgExpiresAt = Date.now() + 5000;
  return cachedCfg;
}

async function isMercadoPagoEnabled() {
  const cfg = await getMercadoPagoConfig();
  return Boolean(cfg.enabled && cfg.accessToken);
}

async function isMercadoPagoCardActive() {
  const cfg = await getMercadoPagoConfig();
  return Boolean(cfg.enabled && cfg.useForCard && cfg.accessToken);
}

async function isMercadoPagoPixActive() {
  const cfg = await getMercadoPagoConfig();
  return Boolean(cfg.enabled && cfg.useForPassengerPix && cfg.accessToken);
}

async function getActiveCredentials({ allowWhenDisabled = false } = {}) {
  const cfg = await getMercadoPagoConfig();
  if (!allowWhenDisabled && !cfg.enabled) {
    return {
      enabled: false,
      sandbox: Boolean(cfg.sandbox),
      publicKey: '',
      accessToken: '',
      webhookSecret: cfg.webhookSecret || '',
      useForCard: false,
      useForPassengerPix: false,
      statementDescriptor: cfg.statementDescriptor || 'KAVRO DRIVE'
    };
  }
  return {
    enabled: Boolean(cfg.enabled && cfg.accessToken),
    sandbox: Boolean(cfg.sandbox),
    publicKey: cfg.publicKey || '',
    accessToken: cfg.accessToken || '',
    webhookSecret: cfg.webhookSecret || '',
    useForCard: cfg.useForCard !== false,
    useForPassengerPix: cfg.useForPassengerPix !== false,
    statementDescriptor: cfg.statementDescriptor || 'KAVRO DRIVE'
  };
}

async function mpFetch(urlStr, options = {}) {
  if (customFetchForTest) {
    return customFetchForTest(urlStr, options);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs || 12000));
  try {
    const { timeoutMs: _ignored, ...fetchOpts } = options;
    return await fetch(urlStr, { ...fetchOpts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function testConnection(overrideInput = null) {
  const saved = await getMercadoPagoConfig({ forceFresh: true });
  const candidate = { ...saved };

  if (overrideInput && typeof overrideInput === 'object') {
    if (overrideInput.sandbox !== undefined) candidate.sandbox = Boolean(overrideInput.sandbox);
    if (overrideInput.publicKey !== undefined) candidate.publicKey = String(overrideInput.publicKey || '').trim();
    if (overrideInput.accessToken && String(overrideInput.accessToken).trim()) {
      candidate.accessToken = String(overrideInput.accessToken).trim();
    }
  }

  if (!candidate.accessToken) {
    const errMsg = 'Informe o Access Token do Mercado Pago para testar a conexão.';
    await saveMercadoPagoConfig({
      lastTestedAt: new Date().toISOString(),
      lastTestOk: false,
      lastTestMessage: errMsg
    }).catch(() => {});
    return {
      ok: false,
      environment: candidate.sandbox ? 'homologacao' : 'producao',
      error: errMsg,
      message: errMsg
    };
  }

  try {
    const resp = await mpFetch('https://api.mercadopago.com/users/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${candidate.accessToken}`,
        Accept: 'application/json'
      }
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data?.id) {
      const errMsg =
        data?.message ||
        (resp.status === 401 || resp.status === 403
          ? 'Access Token inválido ou sem permissão na API do Mercado Pago.'
          : `Falha na autenticação Mercado Pago (HTTP ${resp.status}).`);
      await saveMercadoPagoConfig({
        lastTestedAt: new Date().toISOString(),
        lastTestOk: false,
        lastTestMessage: errMsg
      }).catch(() => {});
      return {
        ok: false,
        environment: candidate.sandbox ? 'homologacao' : 'producao',
        error: errMsg,
        message: errMsg
      };
    }

    const accountLabel = [data.nickname || data.email || `ID ${data.id}`, data.site_id].filter(Boolean).join(' • ');
    const okMsg = `Conexão Mercado Pago aprovada (${candidate.sandbox ? 'Sandbox/Teste' : 'Produção'})! Conta: ${accountLabel}.`;

    await saveMercadoPagoConfig({
      lastTestedAt: new Date().toISOString(),
      lastTestOk: true,
      lastTestMessage: okMsg
    }).catch(() => {});

    return {
      ok: true,
      environment: candidate.sandbox ? 'homologacao' : 'producao',
      accountId: data.id,
      nickname: data.nickname || null,
      email: data.email || null,
      siteId: data.site_id || null,
      message: okMsg
    };
  } catch (err) {
    const errMsg = err?.name === 'AbortError'
      ? 'Tempo limite excedido ao conectar com a API do Mercado Pago.'
      : (err?.message || 'Erro de rede ao conectar com o Mercado Pago.');
    await saveMercadoPagoConfig({
      lastTestedAt: new Date().toISOString(),
      lastTestOk: false,
      lastTestMessage: errMsg
    }).catch(() => {});
    return {
      ok: false,
      environment: candidate.sandbox ? 'homologacao' : 'producao',
      error: errMsg,
      message: errMsg
    };
  }
}

async function verifyWebhookSignature(req, dataId, { secretOverride } = {}) {
  const cfg = await getMercadoPagoConfig();
  const secret = String(secretOverride !== undefined ? secretOverride : (cfg.webhookSecret || '')).trim();
  const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  if (!secret) {
    // Em produção/Vercel exige obrigatoriamente webhookSecret configurado (fail-closed)
    return !isProd;
  }
  const sigHeader = String(req.headers['x-signature'] || '').trim();
  const reqId = String(req.headers['x-request-id'] || '').trim();
  if (!sigHeader) return false;

  const kv = {};
  sigHeader.split(',').forEach((part) => {
    const [k, v] = part.split('=').map((s) => String(s || '').trim());
    if (k && v) kv[k] = v;
  });
  if (!kv.ts || !kv.v1) return false;

  const cleanDataId = String(dataId || '').toLowerCase();
  const manifest = `id:${cleanDataId};request-id:${reqId};ts:${kv.ts};`;
  const expectedHex = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const a = Buffer.from(String(kv.v1).toLowerCase(), 'utf8');
  const b = Buffer.from(expectedHex.toLowerCase(), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function testWebhookSetup(overrideInput = null, requestOrigin = '') {
  const saved = await getMercadoPagoConfig({ forceFresh: true });
  const webhookUrl = buildComputedWebhookUrl(requestOrigin || saved.webhookUrl || 'https://kavrodrive.vercel.app');
  const candidateSecret = String(
    overrideInput?.webhookSecret && String(overrideInput.webhookSecret).trim()
      ? overrideInput.webhookSecret
      : (saved.webhookSecret || '')
  ).trim();
  const candidateToken = String(
    overrideInput?.accessToken && String(overrideInput.accessToken).trim()
      ? overrideInput.accessToken
      : (saved.accessToken || '')
  ).trim();

  if (!candidateSecret) {
    return {
      ok: false,
      webhookUrl,
      hasSecret: false,
      hasAccessToken: Boolean(candidateToken),
      signatureSelfTestOk: false,
      error: 'Endpoint do Webhook ativo, mas falta colar a Assinatura Secreta gerada no painel Webhooks do Mercado Pago.'
    };
  }

  const ts = String(Math.floor(Date.now() / 1000));
  const reqId = `kavro-wh-test-${Date.now()}`;
  const samplePaymentId = '123456';
  const manifest = `id:${samplePaymentId};request-id:${reqId};ts:${ts};`;
  const sig = crypto.createHmac('sha256', candidateSecret).update(manifest).digest('hex');
  const fakeReq = {
    headers: {
      'x-signature': `ts=${ts},v1=${sig}`,
      'x-request-id': reqId
    }
  };
  const signatureSelfTestOk = await verifyWebhookSignature(fakeReq, samplePaymentId, {
    secretOverride: candidateSecret
  });

  return {
    ok: signatureSelfTestOk,
    webhookUrl,
    hasSecret: true,
    hasAccessToken: Boolean(candidateToken),
    signatureSelfTestOk,
    message: signatureSelfTestOk
      ? candidateToken
        ? `Webhook Mercado Pago validado! Assinatura HMAC x-signature OK para ${webhookUrl}.`
        : 'Assinatura HMAC validada, mas falta preencher o Access Token.'
      : 'Falha na validação HMAC local do webhook.'
  };
}

async function getPaymentStatus(paymentId) {
  const creds = await getActiveCredentials({ allowWhenDisabled: true });
  if (!creds.accessToken || !paymentId) {
    return { ok: false, reason: 'token_or_id_missing' };
  }
  const resp = await mpFetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      Accept: 'application/json'
    }
  });
  if (!resp.ok) {
    return { ok: false, statusCode: resp.status, reason: `mp_${resp.status}` };
  }
  const data = await resp.json().catch(() => ({}));
  return {
    ok: true,
    id: data.id ? String(data.id) : String(paymentId),
    status: String(data.status || '').toLowerCase(),
    statusDetail: String(data.status_detail || ''),
    paid: String(data.status || '').toLowerCase() === 'approved',
    amountBrl: Number(data.transaction_amount || 0),
    externalReference: data.external_reference ? String(data.external_reference) : '',
    raw: data
  };
}

async function createPixPayment({
  amountBrl,
  externalReference,
  idempotencyKey,
  description,
  payerName = 'Passageiro',
  payerEmail = 'passageiro@kavrodrive.com.br',
  payerCpf = '',
  qrFallbackGenerator = null
}) {
  const creds = await getActiveCredentials();
  if (!creds.enabled || !creds.useForPassengerPix || !creds.accessToken) {
    return null;
  }

  const cleanDoc = String(payerCpf || '').replace(/\D/g, '');
  const cleanName = String(payerName || 'Passageiro').trim();
  const firstName = cleanName.split(/\s+/)[0] || 'Passageiro';
  const lastName = cleanName.split(/\s+/).slice(1).join(' ') || 'Kavro';

  const body = {
    transaction_amount: Number(Number(amountBrl || 0).toFixed(2)),
    description: String(description || `Kavro Drive ${externalReference || ''}`).slice(0, 180),
    payment_method_id: 'pix',
    external_reference: String(externalReference || ''),
    payer: {
      email: String(payerEmail || 'passageiro@kavrodrive.com.br').trim() || 'passageiro@kavrodrive.com.br',
      first_name: firstName,
      last_name: lastName,
      ...(cleanDoc.length === 11 || cleanDoc.length === 14
        ? { identification: { type: cleanDoc.length === 14 ? 'CNPJ' : 'CPF', number: cleanDoc } }
        : {})
    }
  };

  const resp = await mpFetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${creds.accessToken}`,
      'X-Idempotency-Key': String(idempotencyKey || `mp_pix_${externalReference}_${amountBrl}`)
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    console.warn('[MP Pix Create fallback]:', errData?.message || `HTTP ${resp.status}`);
    return null;
  }

  const mpData = await resp.json().catch(() => ({}));
  const qrData = mpData?.point_of_interaction?.transaction_data;
  if (!qrData?.qr_code) return null;

  const pixCopyPaste = String(qrData.qr_code);
  const pixQrCode = qrData.qr_code_base64
    ? `data:image/png;base64,${qrData.qr_code_base64}`
    : (typeof qrFallbackGenerator === 'function' ? qrFallbackGenerator(pixCopyPaste, 260) : '');

  return {
    paymentId: String(mpData.id),
    pixCopyPaste,
    pixQrCode,
    expiresAt: mpData.date_of_expiration || null
  };
}

module.exports = {
  ensureSchema,
  getMercadoPagoConfig,
  saveMercadoPagoConfig,
  sanitizeMercadoPagoConfigForAdmin,
  clearCaches,
  buildComputedWebhookUrl,
  isMercadoPagoEnabled,
  isMercadoPagoCardActive,
  isMercadoPagoPixActive,
  getActiveCredentials,
  mpFetch,
  testConnection,
  testWebhookSetup,
  verifyWebhookSignature,
  getPaymentStatus,
  createPixPayment,
  _setMercadoPagoFetchForTest
};
