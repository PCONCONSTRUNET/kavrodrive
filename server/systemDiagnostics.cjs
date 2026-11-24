const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db.cjs');
const env = require('./env.cjs');
const push = require('./push.cjs');
const realtimeHub = require('./realtimeHub.cjs');
const security = require('./securityUtils.cjs');
const kycStorage = require('./kycStorage.cjs');
const efiBankGateway = require('./efiBankGateway.cjs');
const mercadoPagoGateway = require('./mercadoPagoGateway.cjs');
const audit = require('./auditEngine.cjs');

const DEFAULT_STATUS_PIN = '20202020';
const STATUS_TOKEN_PREFIX = 'kavro_sts';
const STATUS_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

const ACTIVE_RIDE_STATUS_SET = new Set([
  'aguardando_pagamento',
  'aguardando_confirmacao',
  'na_fila',
  'confirmada',
  'a_caminho',
  'no_local',
  'em_andamento'
]);

const PENDING_DRIVER_STATUS_SET = new Set([
  'pendente',
  'pendente_aprovacao',
  'em_analise',
  'correcao_solicitada'
]);

const DIAGNOSTIC_TABLES = [
  { name: 'rides', localKey: 'rides', label: 'Corridas' },
  { name: 'drivers', localKey: 'drivers', label: 'Motoristas' },
  { name: 'clients', localKey: 'clients', label: 'Passageiros' },
  { name: 'payment_transactions', localKey: 'payment_transactions', label: 'Transações Pagamento' },
  { name: 'financial_ledger', localKey: 'financial_ledger', label: 'Livro-Razão' },
  { name: 'client_wallet_entries', localKey: 'client_wallet_entries', label: 'Carteira Passageiros' },
  { name: 'withdrawal_requests', localKey: 'withdrawal_requests', label: 'Saques PIX' },
  { name: 'saved_cards', localKey: 'saved_cards', label: 'Cartões Salvos' },
  { name: 'sos_alerts', localKey: 'sos_alerts', label: 'Alertas SOS' },
  { name: 'system_audit_logs', localKey: 'audit_logs', label: 'Logs de Auditoria' },
  { name: 'notifications', localKey: 'notifications', label: 'Notificações' },
  { name: 'expenses', localKey: 'expenses', label: 'Despesas / Aportes' },
  { name: 'family_members', localKey: 'family_members', label: 'Modo Família' },
  { name: 'ride_chat_messages', localKey: 'ride_chat_messages', label: 'Mensagens Chat' }
];

function getConfiguredStatusPin() {
  return String(env.STATUS_PAGE_PIN || DEFAULT_STATUS_PIN).trim() || DEFAULT_STATUS_PIN;
}

function timingSafePinMatch(providedPin) {
  const provided = String(providedPin || '').trim();
  const expected = getConfiguredStatusPin();
  if (!provided || !expected) return false;
  const hashA = crypto.createHash('sha256').update(provided).digest();
  const hashB = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function signStatusToken(secret) {
  const payload = {
    sub: 'status_monitor',
    role: 'status_monitor',
    iat: Date.now(),
    exp: Date.now() + STATUS_TOKEN_TTL_MS
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', String(secret))
    .update(`${STATUS_TOKEN_PREFIX}.${encoded}`)
    .digest('base64url');
  return {
    token: `${STATUS_TOKEN_PREFIX}.${encoded}.${sig}`,
    expiresAt: new Date(payload.exp).toISOString()
  };
}

function verifyStatusToken(rawToken, secret) {
  const token = String(rawToken || '').trim();
  if (!token.startsWith(`${STATUS_TOKEN_PREFIX}.`)) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', String(secret))
    .update(`${STATUS_TOKEN_PREFIX}.${encoded}`)
    .digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload || payload.role !== 'status_monitor' || Number(payload.exp || 0) <= Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function formatBytes(bytes) {
  const num = Number(bytes);
  if (!Number.isFinite(num) || num < 0) return '—';
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(2)} MB`;
  return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function countLocalCollection(store, localKey) {
  const value = store?.[localKey];
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

function collectLocalOperationalCounts(store) {
  const rides = Array.isArray(store?.rides) ? store.rides : [];
  const drivers = Array.isArray(store?.drivers) ? store.drivers : [];
  const clients = Array.isArray(store?.clients) ? store.clients : [];
  const withdrawals = Array.isArray(store?.withdrawal_requests) ? store.withdrawal_requests : [];
  const txs = Array.isArray(store?.payment_transactions) ? store.payment_transactions : [];
  const sosList = store?.sos_alerts && typeof store.sos_alerts === 'object'
    ? Object.values(store.sos_alerts)
    : [];
  const auditLogs = Array.isArray(store?.audit_logs) ? store.audit_logs : [];
  const notifications = Array.isArray(store?.notifications) ? store.notifications : [];

  return {
    totalRides: rides.length,
    activeRides: rides.filter(r => ACTIVE_RIDE_STATUS_SET.has(String(r?.status || ''))).length,
    completedRides: rides.filter(r => r?.status === 'finalizada').length,
    cancelledRides: rides.filter(r => r?.status === 'cancelada').length,
    totalDrivers: drivers.length,
    approvedDrivers: drivers.filter(d => (d?.approval_status || d?.approvalStatus) === 'aprovado').length,
    pendingDrivers: drivers.filter(d => PENDING_DRIVER_STATUS_SET.has(String(d?.approval_status || d?.approvalStatus || ''))).length,
    onlineDrivers: drivers.filter(d => Boolean(d?.is_online ?? d?.isOnline)).length,
    blockedDrivers: drivers.filter(d => Boolean(d?.financial_blocked ?? d?.financialBlocked)).length,
    totalClients: clients.length,
    pendingWithdrawals: withdrawals.filter(w => w?.status === 'solicitado' || w?.status === 'processando').length,
    paidWithdrawals: withdrawals.filter(w => w?.status === 'pago').length,
    totalTransactions: txs.length,
    failedTransactions: txs.filter(t => t?.status === 'falhou').length,
    refundedTransactions: txs.filter(t => t?.status === 'reembolsado').length,
    activeSosAlerts: sosList.filter(a => a && a.active !== false && a.status !== 'resolvido').length,
    auditLogsCount: auditLogs.length,
    notificationsCount: notifications.length
  };
}

async function collectDatabaseDiagnostics() {
  const isPostgres = Boolean(db.pool);
  const startNs = process.hrtime.bigint();

  if (!isPostgres) {
    try {
      await db.query('SELECT NOW() as now');
      const latencyMs = Number(process.hrtime.bigint() - startNs) / 1e6;
      const store = db.getLocalStore ? db.getLocalStore() : db.localStore;
      const localFilePath = path.join(__dirname, '.local-db.json');
      let sizeBytes = Buffer.byteLength(JSON.stringify(store || {}), 'utf8');
      try {
        if (fs.existsSync(localFilePath)) {
          sizeBytes = fs.statSync(localFilePath).size;
        }
      } catch {
        // fallback to in-memory serialized byte length
      }

      const tableStats = DIAGNOSTIC_TABLES.map(tbl => ({
        name: tbl.name,
        label: tbl.label,
        count: countLocalCollection(store, tbl.localKey),
        sizeBytes: null,
        sizeFormatted: '—',
        status: 'ok'
      }));

      return {
        connected: true,
        mode: 'local_json',
        latencyMs: Number(latencyMs.toFixed(2)),
        serverVersion: 'JSON LocalStore (Desenvolvimento)',
        databaseSizeBytes: sizeBytes,
        databaseSizeFormatted: formatBytes(sizeBytes),
        pool: {
          max: 1,
          totalCount: 1,
          idleCount: 1,
          waitingCount: 0
        },
        error: null,
        operationalCounts: collectLocalOperationalCounts(store),
        tableStats
      };
    } catch (err) {
      return {
        connected: false,
        mode: 'local_json',
        latencyMs: null,
        serverVersion: 'JSON LocalStore',
        databaseSizeBytes: null,
        databaseSizeFormatted: '—',
        pool: { max: 1, totalCount: 0, idleCount: 0, waitingCount: 0 },
        error: err.message,
        operationalCounts: collectLocalOperationalCounts({}),
        tableStats: []
      };
    }
  }

  // Modo PostgreSQL (Produção / Supabase)
  const poolInfo = {
    max: Number(db.pool.options?.max || 0),
    totalCount: Number(db.pool.totalCount || 0),
    idleCount: Number(db.pool.idleCount || 0),
    waitingCount: Number(db.pool.waitingCount || 0)
  };

  let latencyMs = null;
  let serverVersion = 'PostgreSQL';
  let databaseSizeBytes = null;

  try {
    const pingRes = await db.query(
      'SELECT NOW() AS now, version() AS version, pg_database_size(current_database())::bigint AS db_size'
    );
    latencyMs = Number((Number(process.hrtime.bigint() - startNs) / 1e6).toFixed(2));
    const row = pingRes.rows[0] || {};
    const rawVer = String(row.version || '').trim();
    const verMatch = rawVer.match(/^PostgreSQL\s+([^\s,]+)/i);
    serverVersion = verMatch ? `PostgreSQL ${verMatch[1]}` : (rawVer.slice(0, 48) || 'PostgreSQL');
    databaseSizeBytes = row.db_size !== undefined && row.db_size !== null ? Number(row.db_size) : null;
  } catch (err) {
    return {
      connected: false,
      mode: 'postgresql',
      latencyMs: null,
      serverVersion: 'PostgreSQL',
      databaseSizeBytes: null,
      databaseSizeFormatted: '—',
      pool: {
        max: Number(db.pool.options?.max || 0),
        totalCount: Number(db.pool.totalCount || 0),
        idleCount: Number(db.pool.idleCount || 0),
        waitingCount: Number(db.pool.waitingCount || 0)
      },
      error: err.message || 'Falha ao conectar ao PostgreSQL.',
      operationalCounts: collectLocalOperationalCounts({}),
      tableStats: []
    };
  }

  const safeQueryRow = async (sql) => {
    try {
      const r = await db.query(sql);
      return r.rows[0] || null;
    } catch {
      return null;
    }
  };

  const [
    ridesAgg,
    driversAgg,
    txAgg,
    wdAgg,
    sosAgg,
    tableResults
  ] = await Promise.all([
    safeQueryRow(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status IN ('aguardando_pagamento','aguardando_confirmacao','na_fila','confirmada','a_caminho','no_local','em_andamento'))::int AS active,
        COUNT(*) FILTER (WHERE status = 'finalizada')::int AS completed,
        COUNT(*) FILTER (WHERE status = 'cancelada')::int AS cancelled
      FROM public.rides
    `),
    safeQueryRow(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE approval_status = 'aprovado')::int AS approved,
        COUNT(*) FILTER (WHERE approval_status IN ('pendente','pendente_aprovacao','em_analise','correcao_solicitada'))::int AS pending,
        COUNT(*) FILTER (WHERE is_online = TRUE)::int AS online,
        COUNT(*) FILTER (WHERE financial_blocked = TRUE)::int AS blocked
      FROM public.drivers
    `),
    safeQueryRow(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'falhou')::int AS failed,
        COUNT(*) FILTER (WHERE status = 'reembolsado')::int AS refunded
      FROM public.payment_transactions
    `),
    safeQueryRow(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status IN ('solicitado','processando'))::int AS pending,
        COUNT(*) FILTER (WHERE status = 'pago')::int AS paid
      FROM public.withdrawal_requests
    `),
    safeQueryRow(`
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(active, TRUE) = TRUE AND COALESCE(status, 'ativo') <> 'resolvido')::int AS active
      FROM public.sos_alerts
    `),
    Promise.all(
      DIAGNOSTIC_TABLES.map(async (tbl) => {
        try {
          const r = await db.query(
            `SELECT COUNT(*)::int AS total, pg_total_relation_size('public.${tbl.name}')::bigint AS size_bytes FROM public.${tbl.name}`
          );
          const count = Number(r.rows[0]?.total || 0);
          const sizeBytes = r.rows[0]?.size_bytes !== undefined ? Number(r.rows[0].size_bytes) : null;
          return {
            name: tbl.name,
            label: tbl.label,
            count,
            sizeBytes,
            sizeFormatted: formatBytes(sizeBytes),
            status: 'ok'
          };
        } catch (err) {
          const isMissing = String(err?.code || '') === '42P01' || /does not exist/i.test(String(err?.message || ''));
          return {
            name: tbl.name,
            label: tbl.label,
            count: 0,
            sizeBytes: null,
            sizeFormatted: '—',
            status: isMissing ? 'missing' : 'error'
          };
        }
      })
    )
  ]);

  const countFromTableStats = (tblName) => tableResults.find(t => t.name === tblName)?.count || 0;

  return {
    connected: true,
    mode: 'postgresql',
    latencyMs,
    serverVersion,
    databaseSizeBytes,
    databaseSizeFormatted: formatBytes(databaseSizeBytes),
    pool: {
      max: poolInfo.max,
      totalCount: Number(db.pool.totalCount || poolInfo.totalCount),
      idleCount: Number(db.pool.idleCount || poolInfo.idleCount),
      waitingCount: Number(db.pool.waitingCount || poolInfo.waitingCount)
    },
    error: null,
    operationalCounts: {
      totalRides: ridesAgg?.total ?? countFromTableStats('rides'),
      activeRides: ridesAgg?.active ?? 0,
      completedRides: ridesAgg?.completed ?? 0,
      cancelledRides: ridesAgg?.cancelled ?? 0,
      totalDrivers: driversAgg?.total ?? countFromTableStats('drivers'),
      approvedDrivers: driversAgg?.approved ?? 0,
      pendingDrivers: driversAgg?.pending ?? 0,
      onlineDrivers: driversAgg?.online ?? 0,
      blockedDrivers: driversAgg?.blocked ?? 0,
      totalClients: countFromTableStats('clients'),
      pendingWithdrawals: wdAgg?.pending ?? 0,
      paidWithdrawals: wdAgg?.paid ?? 0,
      totalTransactions: txAgg?.total ?? countFromTableStats('payment_transactions'),
      failedTransactions: txAgg?.failed ?? 0,
      refundedTransactions: txAgg?.refunded ?? 0,
      activeSosAlerts: sosAgg?.active ?? 0,
      auditLogsCount: countFromTableStats('system_audit_logs'),
      notificationsCount: countFromTableStats('notifications')
    },
    tableStats: tableResults
  };
}

async function probeUpstashPing() {
  if (!security.isUpstashConfigured()) {
    return { configured: false, ok: false, latencyMs: null };
  }
  const startNs = process.hrtime.bigint();
  try {
    const res = await security.upstashPipeline([['PING']]);
    const latencyMs = Number((Number(process.hrtime.bigint() - startNs) / 1e6).toFixed(2));
    const ok = Boolean(Array.isArray(res) && String(res[0]?.result || '').toUpperCase() === 'PONG');
    return { configured: true, ok, latencyMs };
  } catch {
    return { configured: true, ok: false, latencyMs: null };
  }
}

async function collectSystemDiagnostics({ probe = false, getGoogleClientId } = {}) {
  const [dbDiag, mpCfg, efiCfg, upstashProbe, recentAuditRes] = await Promise.all([
    collectDatabaseDiagnostics(),
    mercadoPagoGateway.getMercadoPagoConfig().catch(() => null),
    efiBankGateway.getEfiConfig().catch(() => null),
    probeUpstashPing(),
    audit.listAuditLogs({ limit: 25 }).catch(() => ({ logs: [] }))
  ]);

  let mpLiveProbe = null;
  let efiLiveProbe = null;
  if (probe) {
    const [mpProbeRes, efiProbeRes] = await Promise.all([
      mpCfg?.enabled && mpCfg?.accessToken
        ? mercadoPagoGateway.testConnection().catch(err => ({ ok: false, message: err.message }))
        : Promise.resolve(null),
      efiCfg?.enabled
        ? efiBankGateway.testConnection().catch(err => ({ ok: false, message: err.message }))
        : Promise.resolve(null)
    ]);
    mpLiveProbe = mpProbeRes;
    efiLiveProbe = efiProbeRes;
  }

  const r2Status = kycStorage.getCloudflareR2Status();
  const rtStats = realtimeHub.getStats();
  const googleClientId = typeof getGoogleClientId === 'function' ? getGoogleClientId() : '';
  const mem = process.memoryUsage();
  const memRssMb = Number((mem.rss / (1024 * 1024)).toFixed(1));
  const memHeapUsedMb = Number((mem.heapUsed / (1024 * 1024)).toFixed(1));
  const memHeapTotalMb = Number((mem.heapTotal / (1024 * 1024)).toFixed(1));

  const mpActive = Boolean(mpCfg?.enabled && mpCfg?.accessToken);
  const efiActive = Boolean(efiCfg?.enabled);
  const anyPaymentGatewayActive = mpActive || efiActive;

  const mpStatus = !mpCfg?.enabled
    ? 'inactive'
    : !mpCfg?.accessToken
    ? 'error'
    : mpLiveProbe
    ? (mpLiveProbe.ok ? 'ok' : 'error')
    : mpCfg?.lastTestOk === false
    ? 'warn'
    : 'ok';

  const efiStatus = !efiCfg?.enabled
    ? 'inactive'
    : !(efiCfg?.clientId && efiCfg?.clientSecret)
    ? 'error'
    : efiLiveProbe
    ? (efiLiveProbe.ok ? 'ok' : 'warn')
    : efiCfg?.lastTestOk === false
    ? 'warn'
    : 'ok';

  const checks = [
    {
      id: 'database',
      title: dbDiag.mode === 'postgresql' ? 'Banco de Dados PostgreSQL' : 'Armazenamento Local JSON',
      category: 'infra',
      status: !dbDiag.connected
        ? 'error'
        : (dbDiag.latencyMs !== null && dbDiag.latencyMs > 800) || dbDiag.pool.waitingCount > 0
        ? 'warn'
        : 'ok',
      metric: dbDiag.connected
        ? `${dbDiag.latencyMs} ms • ${dbDiag.databaseSizeFormatted}`
        : 'OFFLINE',
      detail: dbDiag.connected
        ? `${dbDiag.serverVersion} • Pool ${dbDiag.pool.totalCount}/${dbDiag.pool.max || 1} (${dbDiag.pool.waitingCount} em fila)`
        : (dbDiag.error || 'Sem resposta do banco de dados')
    },
    {
      id: 'realtime_sse',
      title: 'Tempo Real (SSE & Upstash Redis)',
      category: 'infra',
      status: upstashProbe.configured
        ? (upstashProbe.ok ? 'ok' : 'warn')
        : 'ok',
      metric: `${rtStats.activeConnections} cliente(s) SSE${upstashProbe.configured && upstashProbe.latencyMs !== null ? ` • Redis ${upstashProbe.latencyMs} ms` : ''}`,
      detail: upstashProbe.configured
        ? (upstashProbe.ok ? `Redis ativo • ${rtStats.totalEventsPublished} evento(s) emitidos` : 'Redis configurado mas PING não respondeu PONG')
        : `Stream SSE em memória ativo (${rtStats.totalEventsPublished} eventos)`
    },
    {
      id: 'mercadopago',
      title: 'Gateway Mercado Pago (PIX & Cartão)',
      category: 'pagamentos',
      status: mpStatus,
      metric: !mpCfg?.enabled
        ? 'Desativado'
        : mpCfg?.sandbox
        ? 'Sandbox ativo'
        : 'Produção ativa',
      detail: mpLiveProbe?.message ||
        (mpActive
          ? `PIX: ${mpCfg.useForPassengerPix ? 'Sim' : 'Não'} • Cartão: ${mpCfg.useForCard ? 'Sim' : 'Não'}${mpCfg.webhookSecret ? ' • Webhook HMAC OK' : ' • Sem Webhook Secret'}`
          : 'Gateway desativado no painel')
    },
    {
      id: 'efibank',
      title: 'Gateway Efí Bank',
      category: 'pagamentos',
      status: efiStatus,
      metric: efiCfg?.enabled ? (efiCfg.sandbox ? 'Homologação' : 'Produção') : 'Desativado',
      detail: efiLiveProbe?.message ||
        (efiCfg?.enabled
          ? `PIX: ${efiCfg.useForPassengerPix ? 'Ativo' : 'Off'} • Repasse motorista: ${efiCfg.driverPixSendEnabled ? 'Ativo' : 'Off'}`
          : 'Desativado conforme configuração do Admin')
    },
    {
      id: 'storage_r2',
      title: 'Cloudflare R2 (Mídias & Documentos KYC)',
      category: 'armazenamento',
      status: r2Status.configured ? 'ok' : 'warn',
      metric: r2Status.configured
        ? (r2Status.publicConfigured ? 'Privado + Público OK' : 'Somente Bucket Privado')
        : 'Não configurado',
      detail: r2Status.configured
        ? `Bucket KYC: ${r2Status.privateBucket} • Público: ${r2Status.publicBucket}`
        : 'Usando fallback local/Supabase caso configurado'
    },
    {
      id: 'push_notifications',
      title: 'Notificações Push (OneSignal)',
      category: 'mensageria',
      status: push.isConfigured() ? 'ok' : 'warn',
      metric: push.isConfigured() ? 'REST API configurada' : 'REST API ausente',
      detail: push.isConfigured()
        ? 'Envio de push nativo e PWA habilitado'
        : 'Defina ONESIGNAL_REST_API_KEY para pushes em produção'
    },
    {
      id: 'auth_security',
      title: 'Segurança, OTP & Antifraude',
      category: 'seguranca',
      status: process.env.TURNSTILE_SECRET_KEY && process.env.RESEND_API_KEY ? 'ok' : 'warn',
      metric: `Turnstile: ${process.env.TURNSTILE_SECRET_KEY ? 'ON' : 'OFF'} • OTP E-mail: ${process.env.RESEND_API_KEY ? 'ON' : 'OFF'}`,
      detail: `Google OAuth: ${googleClientId ? 'ON' : 'OFF'} • Secret próprio: ${process.env.ADMIN_SESSION_SECRET ? 'Sim' : 'Derivado'}`
    },
    {
      id: 'ops_alerts',
      title: 'Monitoramento Operacional (SOS & Saques)',
      category: 'operacao',
      status: dbDiag.operationalCounts.activeSosAlerts > 0 ? 'warn' : 'ok',
      metric: `SOS ativos: ${dbDiag.operationalCounts.activeSosAlerts} • Saques pendentes: ${dbDiag.operationalCounts.pendingWithdrawals}`,
      detail: `Corridas em andamento: ${dbDiag.operationalCounts.activeRides} • Motoristas online: ${dbDiag.operationalCounts.onlineDrivers}/${dbDiag.operationalCounts.approvedDrivers}`
    }
  ];

  const hasErrorCheck = checks.some(c => c.status === 'error');
  const hasWarnCheck = checks.some(c => c.status === 'warn');
  const missingPayments = !anyPaymentGatewayActive;

  let overallStatus = 'operational';
  let overallLabel = 'Sistema 100% Operacional';
  let overallSummary = 'Banco de dados respondendo normalmente e serviços essenciais íntegros.';

  if (!dbDiag.connected) {
    overallStatus = 'critical';
    overallLabel = 'Falha Crítica no Banco de Dados';
    overallSummary = `O servidor não conseguiu consultar o banco (${dbDiag.error || 'erro de conexão'}).`;
  } else if (hasErrorCheck || missingPayments) {
    overallStatus = 'critical';
    overallLabel = 'Atenção Crítica Necessária';
    overallSummary = missingPayments
      ? 'Nenhum gateway de pagamento (Mercado Pago ou Efí Bank) está ativo com credenciais.'
      : 'Um ou mais serviços críticos apresentaram erro de configuração ou conexão.';
  } else if (hasWarnCheck) {
    overallStatus = 'degraded';
    overallLabel = 'Operacional com Pontos de Atenção';
    overallSummary = 'Banco e sistema funcionando; revise os itens em amarelo (chaves opcionais, alertas SOS ou avisos).';
  }

  const penalty = checks.reduce((acc, c) => (
    c.status === 'error' ? acc + 30 : c.status === 'warn' ? acc + 8 : acc
  ), 0);
  const score = Math.max(0, Math.min(100, 100 - penalty - (missingPayments ? 20 : 0)));

  const recentCriticalAudit = (recentAuditRes?.logs || [])
    .filter(item => item && (item.severity === 'critico' || item.severity === 'atencao'))
    .slice(0, 6)
    .map(item => ({
      id: item.id,
      auditCode: item.auditCode,
      category: item.category,
      categoryLabel: item.categoryLabel,
      title: item.title,
      severity: item.severity,
      createdAt: item.createdAt
    }));

  return {
    generatedAt: new Date().toISOString(),
    overall: {
      status: overallStatus,
      label: overallLabel,
      summary: overallSummary,
      score
    },
    runtime: {
      environment: process.env.VERCEL ? 'vercel_serverless' : (process.env.NODE_ENV || 'development'),
      vercelRegion: process.env.VERCEL_REGION || null,
      nodeVersion: process.version,
      platform: `${process.platform}/${process.arch}`,
      uptimeSeconds: Math.round(process.uptime()),
      memory: {
        rssMb: memRssMb,
        heapUsedMb: memHeapUsedMb,
        heapTotalMb: memHeapTotalMb
      },
      instanceNote: process.env.VERCEL
        ? 'Execução Serverless (Vercel): uptime mede apenas o ciclo atual desta função; os dados persistem no PostgreSQL.'
        : 'Processo Node.js contínuo.'
    },
    database: dbDiag,
    integrations: {
      realtime: {
        status: upstashProbe.configured ? (upstashProbe.ok ? 'ok' : 'warn') : 'ok',
        ...rtStats,
        upstashLatencyMs: upstashProbe.latencyMs,
        upstashOk: upstashProbe.ok
      },
      mercadopago: {
        status: mpStatus,
        enabled: Boolean(mpCfg?.enabled),
        sandbox: Boolean(mpCfg?.sandbox),
        useForCard: Boolean(mpCfg?.useForCard),
        useForPassengerPix: Boolean(mpCfg?.useForPassengerPix),
        hasAccessToken: Boolean(mpCfg?.accessToken),
        hasPublicKey: Boolean(mpCfg?.publicKey),
        hasWebhookSecret: Boolean(mpCfg?.webhookSecret),
        lastTestedAt: mpCfg?.lastTestedAt || null,
        lastTestOk: mpCfg?.lastTestOk ?? null,
        lastTestMessage: mpCfg?.lastTestMessage || '',
        liveProbe: mpLiveProbe
      },
      efibank: {
        status: efiStatus,
        enabled: Boolean(efiCfg?.enabled),
        sandbox: Boolean(efiCfg?.sandbox),
        useForPassengerPix: Boolean(efiCfg?.useForPassengerPix),
        driverPixSendEnabled: Boolean(efiCfg?.driverPixSendEnabled),
        splitEnabled: Boolean(efiCfg?.splitEnabled),
        hasCredentials: Boolean(efiCfg?.clientId && efiCfg?.clientSecret),
        lastTestedAt: efiCfg?.lastTestedAt || null,
        lastTestOk: efiCfg?.lastTestOk ?? null,
        lastTestMessage: efiCfg?.lastTestMessage || '',
        liveProbe: efiLiveProbe
      },
      storageR2: {
        status: r2Status.configured ? 'ok' : 'warn',
        ...r2Status
      },
      push: {
        status: push.isConfigured() ? 'ok' : 'warn',
        configured: push.isConfigured(),
        appIdConfigured: Boolean(env.ONESIGNAL_APP_ID || env.VITE_ONESIGNAL_APP_ID)
      },
      authAndSecurity: {
        turnstileConfigured: Boolean((process.env.TURNSTILE_SECRET_KEY || '').trim()),
        googleAuthConfigured: Boolean(googleClientId),
        otpEmailConfigured: Boolean(process.env.RESEND_API_KEY),
        otpWebhookConfigured: Boolean(process.env.OTP_WEBHOOK_URL),
        adminSessionSecretConfigured: Boolean((process.env.ADMIN_SESSION_SECRET || '').trim())
      }
    },
    checks,
    recentCriticalAudit
  };
}

module.exports = {
  timingSafePinMatch,
  signStatusToken,
  verifyStatusToken,
  collectSystemDiagnostics
};
