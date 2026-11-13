const crypto = require('crypto');
const db = require('./db.cjs');
const realtimeHub = require('./realtimeHub.cjs');

let auditSchemaReady = false;

const CATEGORY_LABELS = {
  taxas_financeiras: 'Taxas Financeiras',
  tarifas_regras: 'Tarifas & Regras',
  categorias: 'Categorias de Corridas',
  financeiro_corridas: 'Financeiro & Corridas',
  saques_repasses: 'Saques & Repasses',
  motoristas_kyc: 'Motoristas, KYC & Veículos',
  acessos: 'Acessos Administrativos'
};

const PAYMENT_METHOD_LABELS = {
  pix: 'PIX',
  cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito',
  dinheiro: 'Dinheiro',
  online: 'Pagamento Online'
};

const CONFIG_FIELD_META = {
  platformCommissionPercent: { label: 'Comissão Global Padrão da Plataforma', type: 'pct' },
  'paymentMethodCommissionPercents.pix': { label: 'Comissão no PIX', type: 'pct' },
  'paymentMethodCommissionPercents.cartao_credito': { label: 'Comissão no Cartão de Crédito', type: 'pct' },
  'paymentMethodCommissionPercents.cartao_debito': { label: 'Comissão no Cartão de Débito', type: 'pct' },
  'paymentMethodCommissionPercents.dinheiro': { label: 'Comissão no Dinheiro', type: 'pct' },
  'gatewayFeePercents.pix': { label: 'Taxa de Gateway no PIX', type: 'pct' },
  'gatewayFeePercents.cartao_credito': { label: 'Taxa de Gateway no Cartão de Crédito', type: 'pct' },
  'gatewayFeePercents.cartao_debito': { label: 'Taxa de Gateway no Cartão de Débito', type: 'pct' },
  withdrawalFeePercent: { label: 'Taxa Percentual sobre Saque', type: 'pct' },
  withdrawalFeeFixed: { label: 'Taxa Fixa por Transferência de Saque', type: 'brl' },
  minWithdrawalAmount: { label: 'Valor Mínimo para Saque', type: 'brl' },
  cancellationFeeAmount: { label: 'Multa de Cancelamento Pós-Aceite', type: 'brl' },
  maxDriverDebtLimit: { label: 'Teto Máximo de Dívida do Motorista', type: 'brl' },
  cardSettlementDays: { label: 'Prazo de Compensação no Cartão (D+N)', type: 'days' },
  autoBlockDelinquentDrivers: { label: 'Bloqueio Automático ao Atingir Teto de Dívida', type: 'bool', defaultVal: true },
  cashDeductFromBalanceFirst: { label: 'Abater Comissão em Dinheiro do Saldo Livre Primeiro', type: 'bool', defaultVal: true },
  autoSplitPixEnabled: { label: 'Split Automático no PIX', type: 'bool', defaultVal: true },
  useCategoryCommissionOverride: { label: 'Priorizar Comissão Própria da Categoria', type: 'bool', defaultVal: false },
  activePaymentMethods: { label: 'Meios de Pagamento Ativos', type: 'methods' },
  baseFare: { label: 'Tarifa Base (Bandeirada)', type: 'brl' },
  pricePerKm: { label: 'Preço por KM Rodado', type: 'brl' },
  pricePerMinute: { label: 'Preço por Minuto', type: 'brl' },
  minimumFare: { label: 'Valor Mínimo da Corrida', type: 'brl' },
  nightSurchargePercent: { label: 'Adicional Noturno', type: 'pct' },
  nightStartHour: { label: 'Início do Horário Noturno', type: 'hour' },
  nightEndHour: { label: 'Fim do Horário Noturno', type: 'hour' },
  pixKey: { label: 'Chave PIX Recebedora da Plataforma', type: 'text' },
  pixType: { label: 'Tipo da Chave PIX da Plataforma', type: 'text' },
  pixBeneficiary: { label: 'Beneficiário PIX da Plataforma', type: 'text' },
  companyPhone: { label: 'Telefone Oficial da Central', type: 'text' },
  companyWhatsapp: { label: 'WhatsApp Oficial da Central', type: 'text' }
};

const FEE_FIELDS = new Set([
  'platformCommissionPercent',
  'paymentMethodCommissionPercents.pix',
  'paymentMethodCommissionPercents.cartao_credito',
  'paymentMethodCommissionPercents.cartao_debito',
  'paymentMethodCommissionPercents.dinheiro',
  'gatewayFeePercents.pix',
  'gatewayFeePercents.cartao_credito',
  'gatewayFeePercents.cartao_debito',
  'withdrawalFeePercent',
  'withdrawalFeeFixed',
  'minWithdrawalAmount',
  'cancellationFeeAmount',
  'maxDriverDebtLimit',
  'cardSettlementDays',
  'autoBlockDelinquentDrivers',
  'cashDeductFromBalanceFirst',
  'autoSplitPixEnabled',
  'useCategoryCommissionOverride',
  'activePaymentMethods'
]);

function formatMoneyPt(value) {
  const n = Number(value || 0);
  return `R$ ${n.toFixed(2).replace('.', ',')}`;
}

function formatAuditValue(val, type, defaultVal) {
  const effective = val === undefined || val === null ? defaultVal : val;
  if (effective === undefined || effective === null || effective === '') return 'Não definido';
  switch (type) {
    case 'pct':
      return `${Number(effective).toFixed(2).replace(/\.00$/, '').replace('.', ',')}%`;
    case 'brl':
      return formatMoneyPt(effective);
    case 'days':
      return Number(effective) === 0 ? 'Imediato (D+0)' : `D+${Number(effective)}`;
    case 'hour':
      return `${String(effective).padStart(2, '0')}:00`;
    case 'bool':
      return effective ? 'Ativado (Sim)' : 'Desativado (Não)';
    case 'methods':
      return Array.isArray(effective)
        ? effective.map(m => PAYMENT_METHOD_LABELS[m] || String(m)).join(', ') || 'Nenhum'
        : String(effective);
    default:
      return String(effective);
  }
}

function getNestedValue(obj, dottedPath) {
  if (!obj || typeof obj !== 'object') return undefined;
  return dottedPath.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
}

function normalizeComparable(val, type, defaultVal) {
  if (type === 'methods') {
    return Array.isArray(val) ? [...val].map(String).sort().join('|') : '';
  }
  if (type === 'bool') {
    if (val === undefined || val === null) return Boolean(defaultVal);
    return Boolean(val);
  }
  if (type === 'pct' || type === 'brl' || type === 'days' || type === 'hour') {
    if (val === undefined || val === null || val === '') return null;
    return Number(Number(val).toFixed(2));
  }
  return val === undefined || val === null ? '' : String(val).trim();
}

function buildConfigChangesDiff(beforeCfg = {}, afterCfg = {}) {
  const changes = [];

  for (const [fieldPath, meta] of Object.entries(CONFIG_FIELD_META)) {
    const rawBefore = getNestedValue(beforeCfg, fieldPath);
    const rawAfter = getNestedValue(afterCfg, fieldPath);
    const cmpBefore = normalizeComparable(rawBefore, meta.type, meta.defaultVal);
    const cmpAfter = normalizeComparable(rawAfter, meta.type, meta.defaultVal);

    if (cmpBefore === cmpAfter) continue;
    if (cmpBefore === null && cmpAfter === null) continue;

    const beforeStr = formatAuditValue(rawBefore, meta.type, meta.defaultVal);
    const afterStr = formatAuditValue(rawAfter, meta.type, meta.defaultVal);
    changes.push({
      field: fieldPath,
      label: meta.label,
      before: beforeStr,
      after: afterStr,
      summary: `${meta.label}: ${beforeStr} -> ${afterStr}`
    });
  }

  // Comparar alterações nas categorias de corrida
  const prevCats = Array.isArray(beforeCfg?.rideCategories) ? beforeCfg.rideCategories : [];
  const nextCats = Array.isArray(afterCfg?.rideCategories) ? afterCfg.rideCategories : [];
  if (JSON.stringify(prevCats) !== JSON.stringify(nextCats)) {
    const prevMap = new Map(prevCats.map(c => [c.id, c]));
    for (const nc of nextCats) {
      const pc = prevMap.get(nc.id);
      if (!pc) {
        changes.push({
          field: `rideCategories.${nc.id}`,
          label: `Nova categoria "${nc.name || nc.id}"`,
          before: 'Inexistente',
          after: `${formatMoneyPt(nc.baseFare)} base • ${nc.commissionPercent ?? 20}% comissão`,
          summary: `Categoria "${nc.name || nc.id}" criada`
        });
        continue;
      }
      const catDiffs = [];
      if (Number(pc.baseFare) !== Number(nc.baseFare)) {
        catDiffs.push(`Base: ${formatMoneyPt(pc.baseFare)} -> ${formatMoneyPt(nc.baseFare)}`);
      }
      if (Number(pc.pricePerKm) !== Number(nc.pricePerKm)) {
        catDiffs.push(`KM: ${formatMoneyPt(pc.pricePerKm)} -> ${formatMoneyPt(nc.pricePerKm)}`);
      }
      if (Number(pc.pricePerMinute) !== Number(nc.pricePerMinute)) {
        catDiffs.push(`Minuto: ${formatMoneyPt(pc.pricePerMinute)} -> ${formatMoneyPt(nc.pricePerMinute)}`);
      }
      if (Number(pc.minimumFare) !== Number(nc.minimumFare)) {
        catDiffs.push(`Mínimo: ${formatMoneyPt(pc.minimumFare)} -> ${formatMoneyPt(nc.minimumFare)}`);
      }
      if (Number(pc.commissionPercent) !== Number(nc.commissionPercent)) {
        catDiffs.push(`Comissão: ${pc.commissionPercent}% -> ${nc.commissionPercent}%`);
      }
      if (Boolean(pc.active) !== Boolean(nc.active)) {
        catDiffs.push(`Status: ${pc.active ? 'Ativa' : 'Inativa'} -> ${nc.active ? 'Ativa' : 'Inativa'}`);
      }
      if (catDiffs.length > 0) {
        changes.push({
          field: `rideCategories.${nc.id}`,
          label: `Categoria ${nc.name || nc.id}`,
          before: 'Configuração anterior',
          after: catDiffs.join(' | '),
          summary: `${nc.name || nc.id}: ${catDiffs.join(' | ')}`
        });
      }
    }
  }

  return changes;
}

function computeAuditChecksum({
  id,
  auditCode,
  auditUuid,
  category,
  actionKey,
  actorRole,
  actorId,
  entityType,
  entityId,
  changes,
  relatedIds,
  createdAt
}) {
  const secret = String(process.env.ADMIN_SESSION_SECRET || process.env.DATABASE_URL || 'kavro-audit-integrity-v1').trim();
  const canonical = JSON.stringify({
    id: Number(id),
    auditCode: String(auditCode || ''),
    auditUuid: String(auditUuid || ''),
    category: String(category || ''),
    actionKey: String(actionKey || ''),
    actorRole: String(actorRole || ''),
    actorId: actorId ? String(actorId) : null,
    entityType: entityType ? String(entityType) : null,
    entityId: entityId ? String(entityId) : null,
    changes: Array.isArray(changes) ? changes : [],
    relatedIds: relatedIds && typeof relatedIds === 'object' ? relatedIds : {},
    createdAt: createdAt ? new Date(createdAt).toISOString() : ''
  });
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}

async function ensureAuditSchema() {
  if (auditSchemaReady || !db.pool) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.system_audit_logs (
        id BIGSERIAL PRIMARY KEY,
        audit_uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
        audit_code VARCHAR(32) GENERATED ALWAYS AS ('AUD-' || LPAD(id::text, 6, '0')) STORED,
        category VARCHAR(40) NOT NULL,
        action_key VARCHAR(60) NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        severity VARCHAR(20) DEFAULT 'info',
        actor_role VARCHAR(30) NOT NULL,
        actor_id VARCHAR(100),
        actor_name TEXT,
        actor_email TEXT,
        entity_type VARCHAR(40),
        entity_id VARCHAR(120),
        entity_label TEXT,
        related_ids JSONB DEFAULT '{}'::jsonb,
        changes JSONB DEFAULT '[]'::jsonb,
        snapshot_before JSONB,
        snapshot_after JSONB,
        ip_address VARCHAR(80),
        user_agent TEXT,
        checksum VARCHAR(64),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_system_audit_logs_created_at ON public.system_audit_logs (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_system_audit_logs_category ON public.system_audit_logs (category);
      CREATE INDEX IF NOT EXISTS idx_system_audit_logs_entity ON public.system_audit_logs (entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_system_audit_logs_code ON public.system_audit_logs (audit_code);
    `);
    auditSchemaReady = true;
  } catch (err) {
    console.warn('[ensureAuditSchema]', err.message);
  }
}

function formatAuditRow(row) {
  if (!row) return null;
  const parseJson = (val, fallback) => {
    if (val === undefined || val === null) return fallback;
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return fallback;
      }
    }
    return val;
  };
  const changes = parseJson(row.changes, []);
  const relatedIds = parseJson(row.related_ids, {});
  const createdAt = row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString();
  const id = Number(row.id);
  const auditCode = row.audit_code || `AUD-${String(id).padStart(6, '0')}`;
  return {
    id,
    auditCode,
    auditUuid: String(row.audit_uuid || ''),
    category: row.category || 'taxas_financeiras',
    categoryLabel: CATEGORY_LABELS[row.category] || row.category || 'Sistema',
    actionKey: row.action_key || '',
    title: row.title || '',
    summary: row.summary || '',
    severity: row.severity || 'info',
    actorRole: row.actor_role || 'sistema',
    actorId: row.actor_id || null,
    actorName: row.actor_name || 'Sistema',
    actorEmail: row.actor_email || null,
    entityType: row.entity_type || null,
    entityId: row.entity_id || null,
    entityLabel: row.entity_label || null,
    relatedIds,
    changes: Array.isArray(changes) ? changes : [],
    ipAddress: row.ip_address || null,
    userAgent: row.user_agent || null,
    checksum: row.checksum || '',
    createdAt
  };
}

async function recordAuditEvent({
  category = 'taxas_financeiras',
  actionKey = 'config_updated',
  title = 'Alteração registrada',
  summary = '',
  severity = 'info',
  actorRole = 'admin_master',
  actorId = null,
  actorName = 'Administrador Master',
  actorEmail = null,
  entityType = null,
  entityId = null,
  entityLabel = null,
  relatedIds = {},
  changes = [],
  snapshotBefore = null,
  snapshotAfter = null,
  ipAddress = null,
  userAgent = null
}) {
  try {
    await ensureAuditSchema();
    const cleanChanges = Array.isArray(changes) ? changes : [];
    const cleanRelated = relatedIds && typeof relatedIds === 'object' ? relatedIds : {};

    if (!db.pool) {
      if (!Array.isArray(db.localStore.audit_logs)) db.localStore.audit_logs = [];
      const nextId = db.localStore.audit_logs.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
      const auditCode = `AUD-${String(nextId).padStart(6, '0')}`;
      const auditUuid = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const checksum = computeAuditChecksum({
        id: nextId,
        auditCode,
        auditUuid,
        category,
        actionKey,
        actorRole,
        actorId,
        entityType,
        entityId,
        changes: cleanChanges,
        relatedIds: cleanRelated,
        createdAt
      });

      const row = {
        id: nextId,
        audit_uuid: auditUuid,
        audit_code: auditCode,
        category,
        action_key: actionKey,
        title,
        summary,
        severity,
        actor_role: actorRole,
        actor_id: actorId ? String(actorId) : null,
        actor_name: actorName || 'Sistema',
        actor_email: actorEmail || null,
        entity_type: entityType || null,
        entity_id: entityId ? String(entityId) : null,
        entity_label: entityLabel || null,
        related_ids: cleanRelated,
        changes: cleanChanges,
        snapshot_before: snapshotBefore,
        snapshot_after: snapshotAfter,
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
        checksum,
        created_at: createdAt
      };
      db.localStore.audit_logs.unshift(row);
      if (db.localStore.audit_logs.length > 2000) {
        db.localStore.audit_logs = db.localStore.audit_logs.slice(0, 2000);
      }
      db.saveLocalStore();

      const formatted = formatAuditRow(row);
      realtimeHub.publish('audit:created', {
        id: formatted.id,
        auditCode: formatted.auditCode,
        category: formatted.category,
        title: formatted.title
      });
      return formatted;
    }

    const insertRes = await db.query(
      `INSERT INTO public.system_audit_logs (
        category, action_key, title, summary, severity,
        actor_role, actor_id, actor_name, actor_email,
        entity_type, entity_id, entity_label,
        related_ids, changes, snapshot_before, snapshot_after,
        ip_address, user_agent
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *`,
      [
        category,
        actionKey,
        title,
        summary,
        severity,
        actorRole,
        actorId ? String(actorId) : null,
        actorName || 'Sistema',
        actorEmail || null,
        entityType || null,
        entityId ? String(entityId) : null,
        entityLabel || null,
        JSON.stringify(cleanRelated),
        JSON.stringify(cleanChanges),
        snapshotBefore ? JSON.stringify(snapshotBefore) : null,
        snapshotAfter ? JSON.stringify(snapshotAfter) : null,
        ipAddress || null,
        userAgent || null
      ]
    );

    const inserted = insertRes.rows[0];
    const formattedBeforeChecksum = formatAuditRow(inserted);
    const checksum = computeAuditChecksum(formattedBeforeChecksum);
    const updatedRes = await db.query(
      'UPDATE public.system_audit_logs SET checksum = $1 WHERE id = $2 RETURNING *',
      [checksum, inserted.id]
    );
    const formatted = formatAuditRow(updatedRes.rows[0] || { ...inserted, checksum });

    realtimeHub.publish('audit:created', {
      id: formatted.id,
      auditCode: formatted.auditCode,
      category: formatted.category,
      title: formatted.title
    });
    return formatted;
  } catch (err) {
    console.warn('[recordAuditEvent]', err.message);
    return null;
  }
}

async function listAuditLogs({
  category = '',
  search = '',
  severity = '',
  limit = 100,
  offset = 0
} = {}) {
  await ensureAuditSchema();
  const safeLimit = Math.min(300, Math.max(1, Number(limit) || 100));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const cleanCategory = String(category || '').trim();
  const cleanSeverity = String(severity || '').trim();
  const cleanSearch = String(search || '').trim().toLowerCase();

  if (!db.pool) {
    const all = (db.localStore.audit_logs || []).map(formatAuditRow).filter(Boolean);
    const summaryByCategory = {};
    let latestDbId = 0;
    for (const item of all) {
      summaryByCategory[item.category] = (summaryByCategory[item.category] || 0) + 1;
      if (item.id > latestDbId) latestDbId = item.id;
    }

    const filtered = all.filter((item) => {
      if (cleanCategory && cleanCategory !== 'todas' && item.category !== cleanCategory) return false;
      if (cleanSeverity && cleanSeverity !== 'todas' && item.severity !== cleanSeverity) return false;
      if (cleanSearch) {
        const haystack = [
          item.auditCode,
          item.auditUuid,
          String(item.id),
          item.title,
          item.summary,
          item.actorName,
          item.actorEmail,
          item.entityId,
          item.entityLabel,
          JSON.stringify(item.relatedIds || {}),
          ...(item.changes || []).map(c => `${c.label} ${c.before} ${c.after}`)
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(cleanSearch)) return false;
      }
      return true;
    });

    return {
      logs: filtered.slice(safeOffset, safeOffset + safeLimit),
      total: filtered.length,
      latestDbId,
      summaryByCategory
    };
  }

  const whereParts = [];
  const params = [];
  if (cleanCategory && cleanCategory !== 'todas') {
    params.push(cleanCategory);
    whereParts.push(`category = $${params.length}`);
  }
  if (cleanSeverity && cleanSeverity !== 'todas') {
    params.push(cleanSeverity);
    whereParts.push(`severity = $${params.length}`);
  }
  if (cleanSearch) {
    params.push(`%${cleanSearch}%`);
    const p = `$${params.length}`;
    whereParts.push(`(
      LOWER(audit_code) LIKE ${p}
      OR LOWER(audit_uuid::text) LIKE ${p}
      OR CAST(id AS TEXT) LIKE ${p}
      OR LOWER(title) LIKE ${p}
      OR LOWER(summary) LIKE ${p}
      OR LOWER(COALESCE(actor_name, '')) LIKE ${p}
      OR LOWER(COALESCE(actor_email, '')) LIKE ${p}
      OR LOWER(COALESCE(entity_id, '')) LIKE ${p}
      OR LOWER(COALESCE(entity_label, '')) LIKE ${p}
      OR LOWER(COALESCE(related_ids::text, '')) LIKE ${p}
      OR LOWER(COALESCE(changes::text, '')) LIKE ${p}
    )`);
  }

  const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
  const dataParams = [...params, safeLimit, safeOffset];

  const [rowsRes, countRes, statsRes] = await Promise.all([
    db.query(
      `SELECT id, audit_uuid, audit_code, category, action_key, title, summary, severity,
              actor_role, actor_id, actor_name, actor_email, entity_type, entity_id,
              entity_label, related_ids, changes, ip_address, user_agent, checksum, created_at
       FROM public.system_audit_logs
       ${whereSql}
       ORDER BY id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams
    ),
    db.query(`SELECT COUNT(*)::int AS total FROM public.system_audit_logs ${whereSql}`, params),
    db.query(`
      SELECT category, COUNT(*)::int AS cnt, MAX(id)::bigint AS max_id
      FROM public.system_audit_logs
      GROUP BY category
    `)
  ]);

  const summaryByCategory = {};
  let latestDbId = 0;
  for (const row of statsRes.rows || []) {
    summaryByCategory[row.category] = Number(row.cnt) || 0;
    if (Number(row.max_id) > latestDbId) latestDbId = Number(row.max_id);
  }

  return {
    logs: (rowsRes.rows || []).map(formatAuditRow).filter(Boolean),
    total: Number(countRes.rows[0]?.total || 0),
    latestDbId,
    summaryByCategory
  };
}

async function verifyAuditRecord(identifier) {
  await ensureAuditSchema();
  const clean = String(identifier || '').trim();
  if (!clean) return null;

  let row = null;
  if (!db.pool) {
    row = (db.localStore.audit_logs || []).find(
      item =>
        String(item.id) === clean ||
        String(item.audit_code || '').toUpperCase() === clean.toUpperCase() ||
        String(item.audit_uuid || '').toLowerCase() === clean.toLowerCase()
    );
  } else {
    const isNumeric = /^\d+$/.test(clean);
    const res = await db.query(
      isNumeric
        ? 'SELECT * FROM public.system_audit_logs WHERE id = $1 LIMIT 1'
        : 'SELECT * FROM public.system_audit_logs WHERE UPPER(audit_code) = UPPER($1) OR LOWER(audit_uuid::text) = LOWER($1) LIMIT 1',
      [isNumeric ? Number(clean) : clean]
    );
    row = res.rows[0] || null;
  }

  if (!row) return null;
  const formatted = formatAuditRow(row);
  const expectedChecksum = computeAuditChecksum(formatted);
  return {
    record: formatted,
    integrityOk: Boolean(formatted.checksum && formatted.checksum === expectedChecksum),
    expectedChecksum
  };
}

module.exports = {
  CATEGORY_LABELS,
  FEE_FIELDS,
  ensureAuditSchema,
  buildConfigChangesDiff,
  recordAuditEvent,
  listAuditLogs,
  verifyAuditRecord,
  formatMoneyPt
};
