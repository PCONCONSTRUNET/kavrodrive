const https = require('https');
const crypto = require('crypto');
const env = require('./env.cjs');
const db = require('./db.cjs');

let gatewaySchemaReady = false;
let cachedCfg = null;
let cachedCfgExpiresAt = 0;
let tokenCache = null; // { cacheKey, accessToken, expiresAt }
let customRequestForTest = null;

function _setEfiRequestForTest(fnOrNull) {
  customRequestForTest = typeof fnOrNull === 'function' ? fnOrNull : null;
  cachedCfg = null;
  cachedCfgExpiresAt = 0;
  tokenCache = null;
}

function clearCaches() {
  cachedCfg = null;
  cachedCfgExpiresAt = 0;
  tokenCache = null;
}

async function ensureEfiSchema() {
  if (!db.pool || gatewaySchemaReady) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.gateway_configs (
        provider VARCHAR(40) PRIMARY KEY,
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    gatewaySchemaReady = true;
  } catch (err) {
    console.warn('[efiBank] ensureEfiSchema:', err.message);
  }
}

function defaultEfiConfig() {
  return {
    enabled: false,
    sandbox: String(process.env.EFI_SANDBOX || '').toLowerCase() === 'true',
    clientId: String(process.env.EFI_CLIENT_ID || '').trim(),
    clientSecret: String(process.env.EFI_CLIENT_SECRET || '').trim(),
    pixKey: String(process.env.EFI_PIX_KEY || '').trim(),
    certificateBase64: String(process.env.EFI_CERT_BASE64 || '').trim(),
    certificateFileName: process.env.EFI_CERT_BASE64 ? 'env-certificate.p12' : '',
    certificatePassphrase: String(process.env.EFI_CERT_PASSPHRASE || ''),
    pemCert: String(process.env.EFI_PEM_CERT || '').trim(),
    pemKey: String(process.env.EFI_PEM_KEY || '').trim(),
    useForPassengerPix: true,
    splitEnabled: false,
    driverPixSendEnabled: true,
    skipMtlsWebhook: true,
    webhookSecret: crypto.randomBytes(20).toString('hex'),
    webhookUrl: '',
    lastTestedAt: null,
    lastTestOk: null,
    lastTestMessage: '',
    updatedAt: null
  };
}

function normalizeEfiConfig(raw = {}) {
  const base = defaultEfiConfig();
  const merged = { ...base, ...(raw && typeof raw === 'object' ? raw : {}) };
  return {
    enabled: Boolean(merged.enabled),
    sandbox: Boolean(merged.sandbox),
    clientId: String(merged.clientId || base.clientId || '').trim(),
    clientSecret: String(merged.clientSecret || base.clientSecret || '').trim(),
    pixKey: String(merged.pixKey || base.pixKey || '').trim(),
    certificateBase64: String(merged.certificateBase64 || base.certificateBase64 || '').trim(),
    certificateFileName: String(merged.certificateFileName || '').trim(),
    certificatePassphrase: String(merged.certificatePassphrase || ''),
    pemCert: String(merged.pemCert || base.pemCert || '').trim(),
    pemKey: String(merged.pemKey || base.pemKey || '').trim(),
    useForPassengerPix: merged.useForPassengerPix !== false,
    splitEnabled: Boolean(merged.splitEnabled),
    driverPixSendEnabled: merged.driverPixSendEnabled !== false,
    skipMtlsWebhook: merged.skipMtlsWebhook !== false,
    webhookSecret: String(merged.webhookSecret || base.webhookSecret || crypto.randomBytes(20).toString('hex')).trim(),
    webhookUrl: String(merged.webhookUrl || '').trim(),
    lastTestedAt: merged.lastTestedAt || null,
    lastTestOk: merged.lastTestOk === true ? true : (merged.lastTestOk === false ? false : null),
    lastTestMessage: String(merged.lastTestMessage || ''),
    updatedAt: merged.updatedAt || null
  };
}

async function getEfiConfig({ forceFresh = false } = {}) {
  if (!forceFresh && cachedCfg && cachedCfgExpiresAt > Date.now()) {
    return cachedCfg;
  }
  await ensureEfiSchema();
  let stored = {};
  try {
    const r = await db.query(
      'SELECT config, updated_at FROM public.gateway_configs WHERE provider = $1 LIMIT 1',
      ['efibank']
    );
    if (r.rows[0]?.config) {
      stored = r.rows[0].config;
      if (!stored.updatedAt && r.rows[0].updated_at) {
        stored.updatedAt = r.rows[0].updated_at;
      }
    }
  } catch (err) {
    console.warn('[efiBank] erro ao ler configuracao:', err.message);
  }
  const normalized = normalizeEfiConfig(stored);
  cachedCfg = normalized;
  cachedCfgExpiresAt = Date.now() + 5000;
  return normalized;
}

function maskSecret(val) {
  const s = String(val || '').trim();
  if (!s) return '';
  if (s.length <= 8) return '••••••••';
  return `${s.slice(0, 4)}••••••••${s.slice(-4)}`;
}

function hasValidCertificateMaterial(cfg) {
  return Boolean(cfg?.certificateBase64 || (cfg?.pemCert && cfg?.pemKey));
}

function sanitizeEfiConfigForAdmin(cfg) {
  const c = normalizeEfiConfig(cfg);
  const certBytes = c.certificateBase64
    ? Buffer.from(c.certificateBase64, 'base64').length
    : 0;
  return {
    enabled: c.enabled,
    sandbox: c.sandbox,
    clientId: c.clientId,
    hasClientSecret: Boolean(c.clientSecret),
    clientSecretMasked: maskSecret(c.clientSecret),
    pixKey: c.pixKey,
    hasCertificate: hasValidCertificateMaterial(c),
    certificateFileName: c.certificateFileName || (c.pemCert ? 'certificado-pem.pem' : ''),
    certificateBytes: certBytes,
    hasCertificatePassphrase: Boolean(c.certificatePassphrase),
    hasPemCert: Boolean(c.pemCert),
    hasPemKey: Boolean(c.pemKey),
    useForPassengerPix: c.useForPassengerPix,
    splitEnabled: c.splitEnabled,
    driverPixSendEnabled: c.driverPixSendEnabled,
    skipMtlsWebhook: c.skipMtlsWebhook,
    webhookSecret: c.webhookSecret,
    webhookUrl: c.webhookUrl,
    lastTestedAt: c.lastTestedAt,
    lastTestOk: c.lastTestOk,
    lastTestMessage: c.lastTestMessage,
    updatedAt: c.updatedAt,
    credentialsReady: Boolean(c.clientId && c.clientSecret && hasValidCertificateMaterial(c))
  };
}

function stripBase64DataUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const commaIdx = s.indexOf('base64,');
  if (s.startsWith('data:') && commaIdx >= 0) {
    return s.slice(commaIdx + 'base64,'.length).replace(/\s+/g, '');
  }
  return s.replace(/\s+/g, '');
}

async function saveEfiConfig(updates = {}) {
  await ensureEfiSchema();
  const prev = await getEfiConfig({ forceFresh: true });
  const next = { ...prev };

  if (updates.enabled !== undefined) next.enabled = Boolean(updates.enabled);
  if (updates.sandbox !== undefined) next.sandbox = Boolean(updates.sandbox);
  if (updates.clientId !== undefined) next.clientId = String(updates.clientId || '').trim();
  if (updates.clientSecret !== undefined) {
    const newSecret = String(updates.clientSecret || '').trim();
    if (newSecret) next.clientSecret = newSecret;
  }
  if (updates.clearClientSecret === true) {
    next.clientSecret = '';
  }
  if (updates.pixKey !== undefined) next.pixKey = String(updates.pixKey || '').trim();

  if (updates.removeCertificate === true) {
    next.certificateBase64 = '';
    next.certificateFileName = '';
    next.certificatePassphrase = '';
    next.pemCert = '';
    next.pemKey = '';
  } else {
    if (updates.certificateBase64 !== undefined) {
      const cleanB64 = stripBase64DataUrl(updates.certificateBase64);
      if (cleanB64) {
        const rawBuf = Buffer.from(cleanB64, 'base64');
        if (rawBuf.length < 100) {
          throw new Error('O arquivo de certificado enviado parece inválido ou vazio.');
        }
        next.certificateBase64 = cleanB64;
        if (updates.certificateFileName) {
          next.certificateFileName = String(updates.certificateFileName).trim().slice(0, 120);
        } else if (!next.certificateFileName) {
          next.certificateFileName = 'certificado-efi.p12';
        }
      }
    }
    if (updates.certificatePassphrase !== undefined) {
      next.certificatePassphrase = String(updates.certificatePassphrase || '');
    }
    if (updates.pemCert !== undefined) next.pemCert = String(updates.pemCert || '').trim();
    if (updates.pemKey !== undefined) next.pemKey = String(updates.pemKey || '').trim();
  }

  if (updates.useForPassengerPix !== undefined) next.useForPassengerPix = Boolean(updates.useForPassengerPix);
  if (updates.splitEnabled !== undefined) next.splitEnabled = Boolean(updates.splitEnabled);
  if (updates.driverPixSendEnabled !== undefined) next.driverPixSendEnabled = Boolean(updates.driverPixSendEnabled);
  if (updates.skipMtlsWebhook !== undefined) next.skipMtlsWebhook = Boolean(updates.skipMtlsWebhook);
  if (updates.regenerateWebhookSecret === true) {
    next.webhookSecret = crypto.randomBytes(20).toString('hex');
  } else if (updates.webhookSecret !== undefined && String(updates.webhookSecret).trim()) {
    next.webhookSecret = String(updates.webhookSecret).trim();
  }
  if (updates.webhookUrl !== undefined) next.webhookUrl = String(updates.webhookUrl || '').trim();
  if (updates.lastTestedAt !== undefined) next.lastTestedAt = updates.lastTestedAt;
  if (updates.lastTestOk !== undefined) next.lastTestOk = updates.lastTestOk;
  if (updates.lastTestMessage !== undefined) next.lastTestMessage = String(updates.lastTestMessage || '');

  if (next.enabled && (!next.clientId || !next.clientSecret || !hasValidCertificateMaterial(next))) {
    throw new Error('Para ativar a Efí Bank, preencha Client ID, Client Secret e envie o certificado digital (.p12 / .pfx ou PEM).');
  }

  next.updatedAt = new Date().toISOString();

  await db.query(
    `INSERT INTO public.gateway_configs (provider, config, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (provider) DO UPDATE SET
       config = EXCLUDED.config,
       updated_at = NOW()`,
    ['efibank', JSON.stringify(next)]
  );

  clearCaches();
  cachedCfg = normalizeEfiConfig(next);
  cachedCfgExpiresAt = Date.now() + 5000;
  return cachedCfg;
}

async function isEfiEnabled() {
  const cfg = await getEfiConfig();
  return Boolean(cfg.enabled && cfg.clientId && cfg.clientSecret && hasValidCertificateMaterial(cfg));
}

async function isEfiPixActive() {
  const cfg = await getEfiConfig();
  return Boolean(
    cfg.enabled &&
    cfg.useForPassengerPix &&
    cfg.clientId &&
    cfg.clientSecret &&
    cfg.pixKey &&
    hasValidCertificateMaterial(cfg)
  );
}

async function isEfiDriverPayoutActive() {
  const cfg = await getEfiConfig();
  return Boolean(
    cfg.enabled &&
    cfg.driverPixSendEnabled &&
    cfg.clientId &&
    cfg.clientSecret &&
    cfg.pixKey &&
    hasValidCertificateMaterial(cfg)
  );
}

async function isEfiSplitActive() {
  const cfg = await getEfiConfig();
  return Boolean(
    cfg.enabled &&
    cfg.splitEnabled &&
    cfg.clientId &&
    cfg.clientSecret &&
    hasValidCertificateMaterial(cfg)
  );
}

function getBaseUrl(cfg) {
  return cfg?.sandbox ? 'https://pix-h.api.efipay.com.br' : 'https://pix.api.efipay.com.br';
}

function buildHttpsAgent(cfg) {
  if (cfg.pemCert && cfg.pemKey) {
    return new https.Agent({
      cert: cfg.pemCert,
      key: cfg.pemKey,
      ...(cfg.certificatePassphrase ? { passphrase: cfg.certificatePassphrase } : {}),
      keepAlive: false
    });
  }
  if (!cfg.certificateBase64) {
    throw new Error('Certificado digital (.p12 / .pfx) não configurado na Efí Bank.');
  }
  const pfxBuffer = Buffer.from(cfg.certificateBase64, 'base64');
  try {
    return new https.Agent({
      pfx: pfxBuffer,
      passphrase: cfg.certificatePassphrase || '',
      keepAlive: false
    });
  } catch (err) {
    const code = String(err?.code || '');
    const msg = String(err?.message || '');
    if (code === 'ERR_OSSL_EVP_UNSUPPORTED' || msg.toLowerCase().includes('unsupported')) {
      throw new Error(
        'O certificado .p12 usa algoritmo legado incompatível com esta versão do OpenSSL. Converta para PEM ou reexporte em PKCS#12 moderno e envie novamente.'
      );
    }
    if (msg.toLowerCase().includes('mac verify failure') || msg.toLowerCase().includes('bad decrypt')) {
      throw new Error('Senha do certificado .p12 incorreta.');
    }
    throw new Error(`Falha ao carregar certificado mTLS da Efí Bank: ${msg || code}`);
  }
}

function efiRawRequest({ method = 'GET', urlStr, headers = {}, bodyObj = null, cfg, timeoutMs = 15000 }) {
  if (customRequestForTest) {
    return customRequestForTest({ method, urlStr, headers, bodyObj, cfg });
  }

  return new Promise((resolve, reject) => {
    let agent;
    try {
      agent = buildHttpsAgent(cfg);
    } catch (err) {
      reject(err);
      return;
    }

    const parsedUrl = new URL(urlStr);
    const bodyStr = bodyObj !== null && bodyObj !== undefined ? JSON.stringify(bodyObj) : '';
    const finalHeaders = {
      Accept: 'application/json',
      ...headers,
      ...(bodyStr ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) } : {})
    };

    const req = https.request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method,
        headers: finalHeaders,
        agent
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const rawText = Buffer.concat(chunks).toString('utf8');
          let json = {};
          try {
            json = rawText ? JSON.parse(rawText) : {};
          } catch {
            json = { raw: rawText };
          }
          resolve({ status: res.statusCode || 0, data: json, rawText });
        });
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Tempo esgotado ao conectar com a API da Efí Bank.'));
    });

    req.on('error', (err) => {
      const code = String(err?.code || '');
      const msg = String(err?.message || '');
      if (code === 'ERR_OSSL_EVP_UNSUPPORTED') {
        reject(new Error('Certificado .p12 legado incompatível com OpenSSL moderno. Envie o certificado em PEM ou reexporte o .p12.'));
        return;
      }
      reject(err);
    });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function extractEfiError(resp, fallbackMsg) {
  const d = resp?.data || {};
  return (
    d.mensagem ||
    d.detail ||
    d.title ||
    d.error_description ||
    d.nome ||
    (Array.isArray(d.violacoes) && d.violacoes[0]?.razao) ||
    fallbackMsg
  );
}

async function getOAuthToken(cfgOverride = null) {
  const cfg = cfgOverride ? normalizeEfiConfig(cfgOverride) : await getEfiConfig();
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error('Client ID e Client Secret da Efí Bank são obrigatórios.');
  }
  if (!hasValidCertificateMaterial(cfg)) {
    throw new Error('Certificado digital (.p12 ou PEM) da Efí Bank não configurado.');
  }

  const cacheKey = `${cfg.sandbox ? 'sandbox' : 'prod'}:${cfg.clientId}:${crypto
    .createHash('sha1')
    .update(cfg.clientSecret + (cfg.certificateBase64 || cfg.pemCert || '').slice(0, 64))
    .digest('hex')}`;

  if (!cfgOverride && tokenCache && tokenCache.cacheKey === cacheKey && tokenCache.expiresAt > Date.now()) {
    return tokenCache.accessToken;
  }

  const credentials = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const resp = await efiRawRequest({
    method: 'POST',
    urlStr: `${getBaseUrl(cfg)}/oauth/token`,
    headers: { Authorization: `Basic ${credentials}` },
    bodyObj: { grant_type: 'client_credentials' },
    cfg
  });

  if (resp.status < 200 || resp.status >= 300 || !resp.data?.access_token) {
    const errTxt = extractEfiError(resp, `Falha na autenticação OAuth Efí Bank (HTTP ${resp.status}).`);
    throw new Error(errTxt);
  }

  const expiresInSec = Math.max(120, Number(resp.data.expires_in || 3600));
  tokenCache = {
    cacheKey,
    accessToken: String(resp.data.access_token),
    expiresAt: Date.now() + (expiresInSec - 90) * 1000
  };
  return tokenCache.accessToken;
}

async function efiAuthenticatedRequest({ method = 'GET', pathName, bodyObj = null, headers = {}, cfgOverride = null }) {
  const cfg = cfgOverride ? normalizeEfiConfig(cfgOverride) : await getEfiConfig();
  const accessToken = await getOAuthToken(cfgOverride);
  return efiRawRequest({
    method,
    urlStr: `${getBaseUrl(cfg)}${pathName}`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...headers
    },
    bodyObj,
    cfg
  });
}

// BACEN API Pix exige txid alfanumérico entre 26 e 35 caracteres: ^[a-zA-Z0-9]{26,35}$
function buildEfiTxid(prefix = 'KVEFI', entityId = '') {
  const cleanPrefix = String(prefix || 'KVEFI').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
  const cleanEntity = String(entityId || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 12);
  const tsPart = Date.now().toString(36).toUpperCase();
  const randPart = crypto.randomBytes(10).toString('hex').toUpperCase();
  return `${cleanPrefix}${cleanEntity}${tsPart}${randPart}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32).padEnd(32, '0');
}

// Efí /v3/gn/pix/:idEnvio exige 1 a 35 chars alfanuméricos: ^[a-zA-Z0-9]{1,35}$
function buildEfiEnvioId(rawId = '') {
  const clean = String(rawId || '').replace(/[^a-zA-Z0-9]/g, '');
  if (clean.length >= 4 && clean.length <= 35) return clean;
  return `KV${Date.now().toString(36)}${crypto.randomBytes(6).toString('hex')}`
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 35);
}

async function createAndAttachRideSplit({
  txid,
  commissionPercent,
  driverPercent,
  driverCpf,
  driverEfiAccountId,
  description = 'Repasse Corrida Kavro Drive',
  cfgOverride = null
}) {
  const cfg = cfgOverride ? normalizeEfiConfig(cfgOverride) : await getEfiConfig();
  const cleanCpf = String(driverCpf || '').replace(/\D/g, '');
  const cleanAccount = String(driverEfiAccountId || '').replace(/\D/g, '');
  const commPct = Math.max(0, Math.min(100, Number(commissionPercent || 0)));
  const drvPct = Math.max(0, Math.min(100, Number(driverPercent || 100 - commPct)));

  if (!cleanAccount || cleanCpf.length !== 11 || drvPct <= 0) {
    return { splitLinked: false, reason: 'driver_missing_efi_account_or_cpf' };
  }

  const payload = {
    descricao: String(description || 'Repasse Kavro Drive').slice(0, 140),
    lancamento: { imediato: true },
    split: {
      divisaoTarifa: 'assumir_total',
      minhaParte: {
        tipo: 'porcentagem',
        valor: commPct.toFixed(2)
      },
      repasses: [
        {
          tipo: 'porcentagem',
          valor: drvPct.toFixed(2),
          favorecido: {
            cpf: cleanCpf,
            conta: cleanAccount
          }
        }
      ]
    }
  };

  const cfgResp = await efiAuthenticatedRequest({
    method: 'POST',
    pathName: '/v2/gn/split/config',
    bodyObj: payload,
    cfgOverride: cfg
  });

  if (cfgResp.status < 200 || cfgResp.status >= 300 || !cfgResp.data?.id) {
    return {
      splitLinked: false,
      error: extractEfiError(cfgResp, `Falha ao configurar split Efí (HTTP ${cfgResp.status}).`)
    };
  }

  const splitConfigId = String(cfgResp.data.id);
  const linkResp = await efiAuthenticatedRequest({
    method: 'PUT',
    pathName: `/v2/gn/split/cob/${encodeURIComponent(txid)}/vinculo/${encodeURIComponent(splitConfigId)}`,
    cfgOverride: cfg
  });

  if (linkResp.status < 200 || linkResp.status >= 300) {
    return {
      splitConfigId,
      splitLinked: false,
      error: extractEfiError(linkResp, `Split criado (${splitConfigId}), mas falhou ao vincular ao txid ${txid}.`)
    };
  }

  return { splitConfigId, splitLinked: true };
}

async function createPixCharge({
  amountBrl,
  txidPrefix = 'KVEFI',
  entityId = '',
  payerName = '',
  payerCpf = '',
  description = 'Pagamento Kavro Drive',
  expirationSec = 900,
  split = null,
  qrFallbackGenerator = null
}) {
  const cfg = await getEfiConfig();
  if (!cfg.enabled || !cfg.pixKey) {
    throw new Error('Efí Bank ou Chave PIX recebedora não configurada no Painel Master.');
  }

  const txid = buildEfiTxid(txidPrefix, entityId);
  const cleanCpf = String(payerCpf || '').replace(/\D/g, '');
  const cleanName = String(payerName || '').trim().slice(0, 120);
  const originalStr = Number(amountBrl || 0).toFixed(2);

  const cobPayload = {
    calendario: {
      expiracao: Math.max(300, Math.min(86400, Number(expirationSec) || 900))
    },
    valor: {
      original: originalStr
    },
    chave: cfg.pixKey,
    solicitacaoPagador: String(description || 'Kavro Drive').slice(0, 140)
  };

  if (cleanCpf.length === 11 && cleanName) {
    cobPayload.devedor = {
      cpf: cleanCpf,
      nome: cleanName
    };
  }

  const cobResp = await efiAuthenticatedRequest({
    method: 'PUT',
    pathName: `/v2/cob/${encodeURIComponent(txid)}`,
    bodyObj: cobPayload
  });

  if (cobResp.status < 200 || cobResp.status >= 300) {
    throw new Error(extractEfiError(cobResp, `Efí Bank recusou criação da cobrança PIX (HTTP ${cobResp.status}).`));
  }

  const createdTxid = String(cobResp.data?.txid || txid);
  const locId = cobResp.data?.loc?.id;

  let pixCopyPaste = String(cobResp.data?.pixCopiaECola || '').trim();
  let pixQrCode = '';
  let linkVisualizacao = '';

  if (locId) {
    const qrResp = await efiAuthenticatedRequest({
      method: 'GET',
      pathName: `/v2/loc/${encodeURIComponent(String(locId))}/qrcode`
    });
    if (qrResp.status >= 200 && qrResp.status < 300 && qrResp.data) {
      pixCopyPaste = String(qrResp.data.qrcode || pixCopyPaste || '').trim();
      pixQrCode = String(qrResp.data.imagemQrcode || '').trim();
      linkVisualizacao = String(qrResp.data.linkVisualizacao || '').trim();
    }
  }

  if (!pixQrCode && pixCopyPaste && typeof qrFallbackGenerator === 'function') {
    pixQrCode = qrFallbackGenerator(pixCopyPaste, 260);
  }

  let splitResult = { splitLinked: false };
  if (cfg.splitEnabled && split && split.driverEfiAccountId) {
    try {
      splitResult = await createAndAttachRideSplit({
        txid: createdTxid,
        commissionPercent: split.commissionPercent,
        driverPercent: split.driverPercent,
        driverCpf: split.driverCpf,
        driverEfiAccountId: split.driverEfiAccountId,
        description
      });
    } catch (err) {
      splitResult = { splitLinked: false, error: err.message };
    }
  }

  return {
    provider: 'efibank',
    txid: createdTxid,
    gatewayTxId: createdTxid,
    pixCopyPaste,
    pixQrCode,
    linkVisualizacao,
    expiresAt: new Date(Date.now() + (cobPayload.calendario.expiracao * 1000)).toISOString(),
    ...splitResult
  };
}

async function getPixChargeStatus(txid) {
  const cleanTxid = String(txid || '').trim();
  if (!cleanTxid) return { found: false, paid: false, status: 'desconhecido' };
  const resp = await efiAuthenticatedRequest({
    method: 'GET',
    pathName: `/v2/cob/${encodeURIComponent(cleanTxid)}`
  });
  if (resp.status === 404) {
    return { found: false, paid: false, status: 'nao_encontrada' };
  }
  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(extractEfiError(resp, `Erro ao consultar cobrança PIX na Efí (HTTP ${resp.status}).`));
  }
  const cob = resp.data || {};
  const status = String(cob.status || '').toUpperCase();
  const pixList = Array.isArray(cob.pix) ? cob.pix : [];
  const firstPix = pixList[0] || {};
  const paidAmount = firstPix.valor
    ? Number(firstPix.valor)
    : Number(cob.valor?.original || 0);
  return {
    found: true,
    txid: cleanTxid,
    status,
    paid: status === 'CONCLUIDA',
    amountBrl: Number.isFinite(paidAmount) ? paidAmount : 0,
    endToEndId: firstPix.endToEndId || null,
    pixList,
    raw: cob
  };
}

async function sendPixPayout({
  idEnvio,
  amountBrl,
  pixKey,
  cpfFavorecido = '',
  description = 'Repasse Motorista Kavro Drive'
}) {
  const cfg = await getEfiConfig();
  if (!cfg.enabled || !cfg.driverPixSendEnabled) {
    throw new Error('Envio automático de PIX para motoristas está desativado na configuração Efí Bank.');
  }
  if (!cfg.pixKey) {
    throw new Error('Chave PIX pagadora da conta Efí não está configurada.');
  }
  const cleanReceiverKey = String(pixKey || '').trim();
  if (!cleanReceiverKey) {
    throw new Error('Motorista não possui chave PIX cadastrada para receber o saque.');
  }

  const safeEnvioId = buildEfiEnvioId(idEnvio);
  const cleanCpf = String(cpfFavorecido || '').replace(/\D/g, '');
  const payload = {
    valor: Number(amountBrl || 0).toFixed(2),
    pagador: {
      chave: cfg.pixKey,
      infoPagador: String(description || 'Repasse Kavro Drive').slice(0, 140)
    },
    favorecido: {
      chave: cleanReceiverKey,
      ...(cleanCpf.length === 11 ? { cpf: cleanCpf } : {})
    }
  };

  let resp = await efiAuthenticatedRequest({
    method: 'PUT',
    pathName: `/v3/gn/pix/${encodeURIComponent(safeEnvioId)}`,
    bodyObj: payload
  });

  // Fallback de compatibilidade v2 caso a aplicação Efí use rota v2
  if (resp.status === 404 || resp.status === 405) {
    resp = await efiAuthenticatedRequest({
      method: 'PUT',
      pathName: `/v2/gn/pix/${encodeURIComponent(safeEnvioId)}`,
      bodyObj: payload
    });
  }

  if (resp.status < 200 || resp.status >= 300) {
    return {
      ok: false,
      idEnvio: safeEnvioId,
      error: extractEfiError(resp, `Efí Bank recusou envio do PIX (HTTP ${resp.status}).`)
    };
  }

  return {
    ok: true,
    idEnvio: String(resp.data?.idEnvio || safeEnvioId),
    e2eId: String(resp.data?.e2eId || resp.data?.endToEndId || safeEnvioId),
    status: String(resp.data?.status || 'EM_PROCESSAMENTO'),
    raw: resp.data
  };
}

function buildComputedWebhookUrl(baseOrigin, webhookSecret) {
  const origin = String(baseOrigin || 'https://kavrodrive.vercel.app').replace(/\/+$/, '');
  const secret = encodeURIComponent(String(webhookSecret || '').trim());
  return `${origin}/api/webhooks/efibank?hmac=${secret}`;
}

async function registerWebhook({ webhookUrl = '', skipMtls = true, fallbackOrigin = '' } = {}) {
  const cfg = await getEfiConfig({ forceFresh: true });
  if (!cfg.pixKey) {
    throw new Error('Informe e salve a Chave PIX da Efí antes de registrar o webhook.');
  }

  let targetUrl = String(webhookUrl || '').trim() || buildComputedWebhookUrl(fallbackOrigin, cfg.webhookSecret);
  if (cfg.webhookSecret && !targetUrl.includes('hmac=')) {
    targetUrl += `${targetUrl.includes('?') ? '&' : '?'}hmac=${encodeURIComponent(cfg.webhookSecret)}`;
  }

  const resp = await efiAuthenticatedRequest({
    method: 'PUT',
    pathName: `/v2/webhook/${encodeURIComponent(cfg.pixKey)}`,
    headers: {
      'x-skip-mtls-checking': skipMtls ? 'true' : 'false'
    },
    bodyObj: { webhookUrl: targetUrl }
  });

  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(extractEfiError(resp, `Falha ao registrar webhook na Efí Bank (HTTP ${resp.status}).`));
  }

  await saveEfiConfig({ webhookUrl: targetUrl, skipMtlsWebhook: Boolean(skipMtls) });
  return { ok: true, webhookUrl: targetUrl, data: resp.data };
}

async function testConnection(overrideInput = null) {
  const saved = await getEfiConfig({ forceFresh: true });
  let candidate = { ...saved };

  if (overrideInput && typeof overrideInput === 'object') {
    if (overrideInput.sandbox !== undefined) candidate.sandbox = Boolean(overrideInput.sandbox);
    if (overrideInput.clientId !== undefined) candidate.clientId = String(overrideInput.clientId || '').trim();
    if (overrideInput.clientSecret && String(overrideInput.clientSecret).trim()) {
      candidate.clientSecret = String(overrideInput.clientSecret).trim();
    }
    if (overrideInput.pixKey !== undefined) candidate.pixKey = String(overrideInput.pixKey || '').trim();
    if (overrideInput.certificateBase64) {
      candidate.certificateBase64 = stripBase64DataUrl(overrideInput.certificateBase64);
    }
    if (overrideInput.certificatePassphrase !== undefined) {
      candidate.certificatePassphrase = String(overrideInput.certificatePassphrase || '');
    }
    if (overrideInput.pemCert !== undefined) candidate.pemCert = String(overrideInput.pemCert || '').trim();
    if (overrideInput.pemKey !== undefined) candidate.pemKey = String(overrideInput.pemKey || '').trim();
  }

  try {
    const token = await getOAuthToken(candidate);
    let balanceBrl = null;
    let balanceNote = '';

    try {
      const balResp = await efiAuthenticatedRequest({
        method: 'GET',
        pathName: '/v2/gn/saldo',
        cfgOverride: candidate
      });
      if (balResp.status >= 200 && balResp.status < 300 && balResp.data?.saldo !== undefined) {
        balanceBrl = Number(balResp.data.saldo);
      } else if (balResp.status === 403 || balResp.status === 401) {
        balanceNote = 'Autenticado com mTLS! (Escopo gn.balance.read não marcado na aplicação Efí para consultar saldo).';
      }
    } catch {
      // ignora erro secundário de consulta de saldo
    }

    const msg =
      balanceBrl !== null
        ? `Certificado mTLS e OAuth aprovados (${candidate.sandbox ? 'Homologação' : 'Produção'})! Saldo Efí: R$ ${balanceBrl.toFixed(2).replace('.', ',')}.`
        : balanceNote || `Certificado mTLS e OAuth aprovados em ${candidate.sandbox ? 'Homologação' : 'Produção'}!`;

    await saveEfiConfig({
      lastTestedAt: new Date().toISOString(),
      lastTestOk: true,
      lastTestMessage: msg
    }).catch(() => {});

    return {
      ok: true,
      tokenObtained: Boolean(token),
      environment: candidate.sandbox ? 'homologacao' : 'producao',
      balanceBrl,
      message: msg
    };
  } catch (err) {
    const errMsg = err?.message || 'Não foi possível validar o certificado ou credenciais na Efí Bank.';
    await saveEfiConfig({
      lastTestedAt: new Date().toISOString(),
      lastTestOk: false,
      lastTestMessage: errMsg
    }).catch(() => {});
    return {
      ok: false,
      environment: candidate.sandbox ? 'homologacao' : 'producao',
      message: errMsg
    };
  }
}

async function verifyWebhookRequestHmac(reqUrl) {
  const cfg = await getEfiConfig();
  const expected = String(cfg.webhookSecret || '').trim();
  if (!expected) return false;
  try {
    const parsed = new URL(reqUrl, 'http://localhost');
    const provided = String(
      parsed.searchParams.get('hmac') ||
      parsed.searchParams.get('secret') ||
      ''
    ).trim();
    if (!provided) return false;
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

module.exports = {
  ensureEfiSchema,
  getEfiConfig,
  saveEfiConfig,
  sanitizeEfiConfigForAdmin,
  clearCaches,
  isEfiEnabled,
  isEfiPixActive,
  isEfiDriverPayoutActive,
  isEfiSplitActive,
  buildEfiTxid,
  buildEfiEnvioId,
  buildComputedWebhookUrl,
  getOAuthToken,
  testConnection,
  createPixCharge,
  createAndAttachRideSplit,
  getPixChargeStatus,
  sendPixPayout,
  registerWebhook,
  verifyWebhookRequestHmac,
  _setEfiRequestForTest
};
