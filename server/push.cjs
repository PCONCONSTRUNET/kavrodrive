// ============================================================
// Notificações PUSH via OneSignal (Admin separado do Cliente)
// ============================================================
const env = require('./env.cjs');
const db = require('./db.cjs');
const realtimeHub = require('./realtimeHub.cjs');

const DEFAULT_ONESIGNAL_APP_ID = 'ec6678e3-9723-4080-883f-d5bb0fe74a7b';
const ADMIN_EXTERNAL_ID = 'up-admin';
const TZ_OFFSET = '-03:00'; // Horário de Brasília

function getAppId() {
  return String(env.ONESIGNAL_APP_ID || env.VITE_ONESIGNAL_APP_ID || DEFAULT_ONESIGNAL_APP_ID).trim() || DEFAULT_ONESIGNAL_APP_ID;
}

function getRestApiKey() {
  return String(env.ONESIGNAL_REST_API_KEY || '').trim();
}

function isConfigured() {
  return Boolean(getRestApiKey());
}

// Mesma regra usada no front: cliente = "cli-" + telefone só com dígitos, motorista = "drv-" + driverId
function clientExternalId(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 8 ? `cli-${digits}` : null;
}

function driverExternalId(driverId, phone) {
  if (driverId && String(driverId).trim()) return `drv-${String(driverId).trim()}`;
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 8 ? `drv-${digits}` : null;
}

// Modelos padrão (o admin pode editar/desativar/criar novos no painel -> config.pushTemplates)
const DEFAULT_TEMPLATES = {
  admin_new_ride:         { enabled: true, audience: 'admin',     event: 'new_ride',         title: 'Kavro Drive', message: '🚗 Nova corrida: {cliente} solicitou para {data} às {hora} • {valor}' },
  admin_ride_cancelled:   { enabled: true, audience: 'admin',     event: 'ride_cancelled',   title: 'Kavro Drive', message: '❌ Corrida {id} de {cliente} ({data} às {hora}) foi cancelada.' },
  admin_pix_paid:         { enabled: true, audience: 'admin',     event: 'pix_paid',         title: 'Kavro Drive', message: '💰 PIX recebido: {cliente} pagou {valor} • Corrida {id}.' },
  admin_payment_pending:  { enabled: true, audience: 'admin',     event: 'new_ride',         title: 'Kavro Drive', message: '🧾 Pagamento pendente: {cliente} vai pagar {valor} em {pagamento}.' },
  driver_new_ride:        { enabled: true, audience: 'motorista', event: 'new_ride',         title: 'Kavro Drive', message: '🚗 Nova corrida disponível! {cliente} • {origem} ➔ {destino} ({valor})' },
  client_ride_booked:     { enabled: true, audience: 'cliente',   event: 'new_ride',         title: 'Kavro Drive', message: '✅ Corrida {id} solicitada para {data} às {hora}. Aguardando confirmação!' },
  client_ride_confirmed:  { enabled: true, audience: 'cliente',   event: 'ride_confirmed',   title: 'Kavro Drive', message: '✅ Corrida {id} confirmada pelo motorista para {data} às {hora}!' },
  client_ride_started:    { enabled: true, audience: 'cliente',   event: 'driver_on_way',    title: 'Kavro Drive', message: '🚗 {motorista} iniciou o deslocamento até você ({origem}). Acompanhe no GPS!' },
  client_ride_in_progress:{ enabled: true, audience: 'cliente',   event: 'ride_in_progress', title: 'Kavro Drive', message: '🚀 Embarque realizado! Sua viagem {id} rumo a {destino} está em andamento.' },
  client_ride_finished:   { enabled: true, audience: 'cliente',   event: 'ride_finished',    title: 'Kavro Drive', message: '🏁 Viagem {id} concluída! Obrigado por viajar com a Kavro Drive.' },
  client_ride_cancelled:  { enabled: true, audience: 'cliente',   event: 'ride_cancelled',   title: 'Kavro Drive', message: '❌ Sua corrida {id} de {data} às {hora} foi cancelada.' },
  client_payment_approved:{ enabled: true, audience: 'cliente',   event: 'payment_approved', title: 'Kavro Drive', message: '✅ Pagamento aprovado de {valor} ({pagamento}). Obrigado!' },
  client_pix_approved:    { enabled: true, audience: 'cliente',   event: 'pix_paid',         title: 'Kavro Drive', message: '✅ PIX de {valor} confirmado automaticamente! Corrida {id} garantida.' },
  client_reminder:        { enabled: true, audience: 'cliente',   event: 'reminder',         title: 'Kavro Drive', message: '⏰ Sua corrida começa em {minutos} min ({hora} em {origem}). Esteja pronto!', minutesBefore: 30 },
};

const PAYMENT_LABEL = {
  pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito', online: 'Pagamento Online'
};

// Cache curto em memória para reduzir pressão no Postgres em picos de /api/sync e novos pedidos
let templatesCache = { value: null, expiresAt: 0, inflight: null };
let notificationsTopCache = { value: null, expiresAt: 0, inflight: null };
let approvedDriverTargetsCache = { value: null, expiresAt: 0, inflight: null };

function invalidateNotificationsCache() {
  notificationsTopCache = { value: null, expiresAt: 0, inflight: null };
}

function invalidateTemplatesCache() {
  templatesCache = { value: null, expiresAt: 0, inflight: null };
}

async function getTemplates() {
  if (db.pool && templatesCache.value && Date.now() < templatesCache.expiresAt) {
    return templatesCache.value;
  }
  const load = async () => {
    let custom = {};
    try {
      const r = await db.query('SELECT config FROM public.system_config WHERE id = $1', ['default']);
      custom = r.rows[0]?.config?.pushTemplates || {};
    } catch { /* usa padrão */ }
    const merged = {};
    for (const [k, def] of Object.entries(DEFAULT_TEMPLATES)) merged[k] = { ...def, ...(custom[k] || {}) };
    for (const [k, tpl] of Object.entries(custom || {})) {
      if (!DEFAULT_TEMPLATES[k] && tpl && typeof tpl === 'object') {
        merged[k] = { enabled: true, audience: 'cliente', event: 'new_ride', isCustom: true, ...tpl };
      }
    }
    if (db.pool) {
      templatesCache = { value: merged, expiresAt: Date.now() + 3000, inflight: null };
    }
    return merged;
  };
  if (!db.pool) return load();
  if (templatesCache.inflight) return templatesCache.inflight;
  templatesCache.inflight = load().catch((err) => {
    templatesCache.inflight = null;
    throw err;
  });
  return templatesCache.inflight;
}

function formatDateBR(d) {
  const [y, m, day] = String(d || '').split('-');
  return y && m && day ? `${day}/${m}` : d || '';
}

function fill(text, ride = {}, extra = {}) {
  const vars = {
    cliente: ride.clientName || 'Passageiro',
    motorista: ride.driverName || 'Motorista Parceiro',
    id: ride.id || '',
    data: formatDateBR(ride.date),
    hora: ride.time || '',
    origem: ride.origin?.address || '',
    destino: ride.destination?.address || '',
    valor: `R$ ${Number(ride.totalPrice || 0).toFixed(2).replace('.', ',')}`,
    pagamento: PAYMENT_LABEL[ride.paymentMethod] || ride.paymentMethod || '',
    ...extra
  };
  return String(text || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

function appUrl(path) {
  let base = String(env.PUBLIC_APP_URL || '').trim();
  if (!base && env.VERCEL_PROJECT_PRODUCTION_URL) {
    base = `https://${String(env.VERCEL_PROJECT_PRODUCTION_URL).trim()}`;
  } else if (!base && env.VERCEL_URL) {
    base = `https://${String(env.VERCEL_URL).trim()}`;
  }
  base = base.replace(/\/$/, '');
  return base ? `${base}${path}` : undefined;
}

// Chamada crua à API REST do OneSignal
async function oneSignal(method, path, body) {
  const key = getRestApiKey();
  if (!key) { console.warn('[push] ONESIGNAL_REST_API_KEY ausente'); return null; }
  try {
    const res = await fetch(`https://api.onesignal.com${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Key ${key}` },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.errors) console.warn('[push] OneSignal erro', res.status, JSON.stringify(data));
    return data;
  } catch (err) {
    console.warn('[push] falha de rede OneSignal:', err.message);
    return null;
  }
}

async function sendToExternalIds(externalIds, title, message, { url, sendAfter, data } = {}) {
  const ids = Array.from(new Set((externalIds || []).filter(Boolean).map(String)));
  if (ids.length === 0) return null;
  let lastRes = null;
  for (let i = 0; i < ids.length; i += 1500) {
    const chunk = ids.slice(i, i + 1500);
    const payload = {
      app_id: getAppId(),
      target_channel: 'push',
      include_aliases: { external_id: chunk },
      headings: { en: title, pt: title },
      contents: { en: message, pt: message },
      chrome_web_icon: appUrl('/pwa-icon-192.png'),
      data: data || {}
    };
    const link = url ? appUrl(url) : undefined;
    if (link) payload.web_url = link;
    if (sendAfter) payload.send_after = sendAfter;
    lastRes = await oneSignal('POST', '/notifications', payload);
  }
  return lastRes;
}

async function resolveRideTargets(audience, eventName, ride = {}) {
  const targets = new Set();
  if (audience === 'admin' || audience === 'todos') {
    targets.add(ADMIN_EXTERNAL_ID);
    if (audience === 'admin') {
      return Array.from(targets);
    }
  }
  if (audience === 'cliente' || audience === 'ambos' || audience === 'todos') {
    const pId = clientExternalId(ride.clientPhone);
    if (pId) targets.add(pId);
    if (ride.clientId) targets.add(String(ride.clientId));
  }
  if (audience === 'motorista' || audience === 'ambos' || audience === 'todos') {
    if (ride.driverId) {
      const dExt = driverExternalId(ride.driverId);
      if (dExt) targets.add(dExt);
      targets.add(String(ride.driverId));
    } else if (eventName === 'new_ride') {
      try {
        let rows = null;
        if (db.pool && approvedDriverTargetsCache.value && Date.now() < approvedDriverTargetsCache.expiresAt) {
          rows = approvedDriverTargetsCache.value;
        } else {
          const res = await db.query(
            "SELECT id, phone FROM public.drivers WHERE approval_status = 'aprovado' OR approval_status IS NULL"
          );
          rows = res.rows || [];
          if (db.pool) {
            approvedDriverTargetsCache = { value: rows, expiresAt: Date.now() + 15000, inflight: null };
          }
        }
        for (const row of rows || []) {
          const dExt = driverExternalId(row.id, row.phone);
          if (dExt) targets.add(dExt);
          if (row.id) targets.add(String(row.id));
        }
      } catch { /* fallback sem motoristas */ }
    }
  }
  return Array.from(targets);
}

const ADMIN_ONLY_NOTIFICATION_TYPES = new Set([
  'driver_new',
  'driver_kyc',
  'vehicle_new',
  'client_new',
  'profile_change_request',
  'safety_audio',
  'sos_alert'
]);

let notificationsSchemaReady = false;
async function ensureNotificationsSchema() {
  if (notificationsSchemaReady) return;
  try {
    await db.query('ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS audience VARCHAR(30) DEFAULT \'admin\'');
    await db.query('ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS target_client_id VARCHAR(64)');
    await db.query('ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS target_driver_id VARCHAR(64)');
    await db.query('ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS url TEXT');
  } catch {
    // fallback seguro em memória
  }
  notificationsSchemaReady = true;
}

function formatNotificationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    type: row.type || 'general',
    rideId: row.ride_id ?? row.rideId ?? null,
    read: Boolean(row.read),
    timestamp: row.timestamp || new Date().toISOString(),
    audience: row.audience || 'admin',
    targetClientId: row.target_client_id ?? row.targetClientId ?? null,
    targetDriverId: row.target_driver_id ?? row.targetDriverId ?? null,
    url: row.url || null
  };
}

function mapTemplateToNotificationType(templateKey, eventName) {
  if (eventName === 'ride_confirmed') return 'ride_confirmed';
  if (eventName === 'ride_cancelled') return 'ride_cancelled';
  if (eventName === 'pix_paid' || eventName === 'payment_approved') return 'payment';
  if (eventName === 'reminder') return 'reminder';
  if (eventName === 'new_ride' || String(templateKey || '').includes('new_ride')) return 'ride_new';
  return 'ride';
}

async function saveAndPublishInAppNotification({
  id = null,
  title,
  message,
  type = 'general',
  rideId = null,
  audience = 'admin',
  targetClientId = null,
  targetDriverId = null,
  url = null,
  timestamp = null
} = {}) {
  const cleanTitle = String(title || '').trim();
  const cleanMessage = String(message || '').trim();
  if (!cleanTitle || !cleanMessage) return null;
  await ensureNotificationsSchema();

  const notifId = String(id || `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  const isoTs = timestamp || new Date().toISOString();
  const normalizedAud = ['admin', 'cliente', 'motorista', 'ambos'].includes(audience) ? audience : 'admin';

  try {
    await db.query(
      `INSERT INTO public.notifications (id, title, message, type, ride_id, read, timestamp, audience, target_client_id, target_driver_id, url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        notifId,
        cleanTitle,
        cleanMessage,
        type || 'general',
        rideId || null,
        false,
        isoTs,
        normalizedAud,
        targetClientId ? String(targetClientId) : null,
        targetDriverId ? String(targetDriverId) : null,
        url ? String(url) : null
      ]
    );
    invalidateNotificationsCache();
  } catch (err) {
    console.warn('[notifications] erro ao persistir notificação:', err.message);
  }

  const item = {
    id: notifId,
    title: cleanTitle,
    message: cleanMessage,
    type: type || 'general',
    rideId: rideId || null,
    read: false,
    timestamp: isoTs,
    audience: normalizedAud,
    targetClientId: targetClientId ? String(targetClientId) : null,
    targetDriverId: targetDriverId ? String(targetDriverId) : null,
    url: url ? String(url) : null
  };

  try {
    realtimeHub.publish(
      'notification:new',
      { notification: item },
      {
        audience: normalizedAud,
        clientId: targetClientId ? String(targetClientId) : null,
        driverId: targetDriverId ? String(targetDriverId) : null,
        rideId: rideId || null
      }
    );
  } catch {
    // ignore realtime error
  }

  return item;
}

async function fetchTopNotificationsCached() {
  if (!db.pool) {
    const r = await db.query('SELECT * FROM public.notifications ORDER BY timestamp DESC LIMIT 100');
    return (r.rows || []).map(formatNotificationRow).filter(Boolean);
  }
  const now = Date.now();
  if (notificationsTopCache.value && now < notificationsTopCache.expiresAt) {
    return notificationsTopCache.value;
  }
  if (notificationsTopCache.inflight) {
    return notificationsTopCache.inflight;
  }
  notificationsTopCache.inflight = db
    .query('SELECT * FROM public.notifications ORDER BY timestamp DESC LIMIT 100')
    .then((r) => {
      const list = (r.rows || []).map(formatNotificationRow).filter(Boolean);
      notificationsTopCache = { value: list, expiresAt: Date.now() + 2000, inflight: null };
      return list;
    })
    .catch((err) => {
      notificationsTopCache.inflight = null;
      throw err;
    });
  return notificationsTopCache.inflight;
}

async function queryNotificationsForViewer({
  isAdmin = false,
  clientId = '',
  driverId = '',
  rideIds = [],
  limit = 60
} = {}) {
  await ensureNotificationsSchema();
  const rows = await fetchTopNotificationsCached();

  if (isAdmin) {
    return rows.slice(0, limit);
  }

  const rideIdSet = new Set((rideIds || []).filter(Boolean).map(String));

  if (clientId) {
    const cid = String(clientId);
    return rows
      .filter((n) => {
        if (ADMIN_ONLY_NOTIFICATION_TYPES.has(n.type)) return false;
        const aud = n.audience || 'admin';
        if (n.targetClientId && String(n.targetClientId) === cid) {
          return aud === 'cliente' || aud === 'ambos';
        }
        if (n.targetClientId && String(n.targetClientId) !== cid) return false;
        if (n.rideId && rideIdSet.has(String(n.rideId))) {
          return !n.audience || aud === 'cliente' || aud === 'ambos';
        }
        return (aud === 'cliente' || aud === 'ambos') && !n.rideId && !n.targetDriverId;
      })
      .slice(0, limit);
  }

  if (driverId) {
    const did = String(driverId);
    return rows
      .filter((n) => {
        if (new Set(['driver_new', 'driver_kyc', 'vehicle_new', 'client_new', 'profile_change_request', 'safety_audio']).has(n.type)) {
          return false;
        }
        const aud = n.audience || 'admin';
        if (n.targetDriverId && String(n.targetDriverId) === did) {
          return aud === 'motorista' || aud === 'ambos';
        }
        if (n.targetDriverId && String(n.targetDriverId) !== did) return false;
        if (n.rideId && rideIdSet.has(String(n.rideId))) {
          return !n.audience || aud === 'motorista' || aud === 'ambos';
        }
        return (aud === 'motorista' || aud === 'ambos') && !n.targetClientId;
      })
      .slice(0, limit);
  }

  return [];
}

// Dispara um evento usando o modelo configurado
async function notify(templateKey, ride, extra = {}) {
  const templates = await getTemplates();
  const t = templates[templateKey];
  if (!t || !t.enabled) return null;
  const audience = t.audience || 'cliente';
  const storedAudience = audience === 'todos' ? 'ambos' : audience;
  const renderedTitle = fill(t.title || 'Kavro Drive', ride, extra) || 'Kavro Drive';
  const renderedMessage = fill(t.message, ride, extra);
  const url =
    t.url ||
    (audience === 'admin'
      ? '/administracion'
      : audience === 'motorista'
        ? '/kavro-drive'
        : `/viagem/${encodeURIComponent(ride.id)}`);

  if (
    !extra.__sendAfter &&
    (storedAudience === 'cliente' || storedAudience === 'motorista' || storedAudience === 'ambos' || (t.isCustom && storedAudience === 'admin'))
  ) {
    await saveAndPublishInAppNotification({
      id: `notif-${templateKey}-${ride.id}-${Date.now()}`,
      title: renderedTitle,
      message: renderedMessage,
      type: t.isCustom ? 'admin_broadcast' : mapTemplateToNotificationType(templateKey, t.event || templateKey),
      rideId: ride.id,
      audience: storedAudience,
      targetClientId: storedAudience === 'cliente' ? (ride.clientId || null) : null,
      targetDriverId: storedAudience === 'motorista' ? (ride.driverId || null) : null,
      url
    });
  }

  const target = await resolveRideTargets(audience, t.event || templateKey, ride);
  if (target.length === 0) return null;
  return sendToExternalIds(target, renderedTitle, renderedMessage, {
    url, data: { rideId: ride.id, event: templateKey, audience: storedAudience }, sendAfter: extra.__sendAfter
  });
}

// ---------- Lembrete agendado (send_after no OneSignal) ----------
let schemaReady = false;
async function ensureSchema() {
  if (schemaReady) return;
  await db.query('ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS reminder_notification_id TEXT');
  schemaReady = true;
}

async function cancelReminder(rideId) {
  try {
    await ensureSchema();
    const r = await db.query('SELECT reminder_notification_id FROM public.rides WHERE id = $1', [rideId]);
    const nid = r.rows[0]?.reminder_notification_id;
    if (nid) {
      await oneSignal('DELETE', `/notifications/${nid}?app_id=${getAppId()}`);
      await db.query('UPDATE public.rides SET reminder_notification_id = NULL WHERE id = $1', [rideId]);
    }
  } catch (err) { console.warn('[push] cancelReminder:', err.message); }
}

async function scheduleReminder(ride) {
  try {
    await ensureSchema();
    await cancelReminder(ride.id);
    if (!ride.date || !ride.time || ride.status === 'cancelada' || ride.status === 'finalizada') return;
    const templates = await getTemplates();
    const t = templates.client_reminder;
    if (!t.enabled || !clientExternalId(ride.clientPhone)) return;
    const minutes = Math.max(5, Number(t.minutesBefore) || 30);
    const rideAt = new Date(`${ride.date}T${ride.time.length === 5 ? ride.time : ride.time.slice(0, 5)}:00${TZ_OFFSET}`);
    const sendAt = new Date(rideAt.getTime() - minutes * 60000);
    if (isNaN(sendAt.getTime()) || sendAt.getTime() < Date.now() + 60000) return; // já passou
    const result = await notify('client_reminder', ride, { minutos: String(minutes), __sendAfter: sendAt.toISOString() });
    if (result?.id) {
      await db.query('UPDATE public.rides SET reminder_notification_id = $1 WHERE id = $2', [result.id, ride.id]);
    }
  } catch (err) { console.warn('[push] scheduleReminder:', err.message); }
}

// ---------- Orquestrador: compara antes x depois da corrida ----------
const isCardOrCash = (m) => ['dinheiro', 'cartao_credito', 'cartao_debito'].includes(m);

async function handleRideChange(before, after, { source = 'app' } = {}) {
  try {
    const isNew = !before;
    const tasks = [];
    const eventsFired = new Set();

    if (isNew) {
      if (after.status !== 'cancelada') {
        eventsFired.add('new_ride');
        // Agendamento feito pelo próprio motorista não precisa avisar o admin
        if (!after.isManualBooking) tasks.push(notify('admin_new_ride', after));
        tasks.push(notify('driver_new_ride', after));
        tasks.push(notify('client_ride_booked', after));
        if (!after.isManualBooking && after.paymentStatus !== 'pago' && isCardOrCash(after.paymentMethod)) {
          tasks.push(notify('admin_payment_pending', after));
        }
        tasks.push(scheduleReminder(after));
      }
    } else {
      if (before.status !== 'cancelada' && after.status === 'cancelada') {
        eventsFired.add('ride_cancelled');
        tasks.push(notify('admin_ride_cancelled', after));
        tasks.push(notify('client_ride_cancelled', after));
        tasks.push(cancelReminder(after.id));
      } else if (before.status !== 'confirmada' && after.status === 'confirmada') {
        eventsFired.add('ride_confirmed');
        tasks.push(notify('client_ride_confirmed', after));
      } else if (before.status !== 'a_caminho' && after.status === 'a_caminho') {
        eventsFired.add('driver_on_way');
        tasks.push(notify('client_ride_started', after));
      } else if (before.status !== 'em_andamento' && after.status === 'em_andamento') {
        eventsFired.add('ride_in_progress');
        tasks.push(notify('client_ride_in_progress', after));
      } else if (after.status === 'finalizada' && before.status !== 'finalizada') {
        eventsFired.add('ride_finished');
        tasks.push(notify('client_ride_finished', after));
        tasks.push(cancelReminder(after.id));
      } else if (after.status !== 'cancelada' && (before.date !== after.date || before.time !== after.time)) {
        tasks.push(scheduleReminder(after)); // remarcada
      }

      if (before.paymentStatus !== 'pago' && after.paymentStatus === 'pago') {
        if (after.paymentMethod === 'pix' && source === 'webhook') {
          eventsFired.add('pix_paid');
          tasks.push(notify('admin_pix_paid', after));
          tasks.push(notify('client_pix_approved', after));
        } else {
          eventsFired.add('payment_approved');
          tasks.push(notify('client_payment_approved', after));
        }
      }
    }

    // Executa também os gatilhos personalizados criados pelo Admin Master
    if (eventsFired.size > 0) {
      const allTemplates = await getTemplates();
      for (const [k, tpl] of Object.entries(allTemplates)) {
        if (tpl?.isCustom && tpl.enabled && tpl.event && eventsFired.has(tpl.event)) {
          tasks.push(notify(k, after));
        }
      }
    }

    await Promise.allSettled(tasks);
  } catch (err) {
    console.warn('[push] handleRideChange:', err.message);
  }
}

async function broadcastManualPush({
  audience = 'ambos',
  includeAdmin = false,
  targetClientId = null,
  targetDriverId = null,
  title = 'Kavro Drive',
  message,
  url
} = {}) {
  const cleanTitle = String(title || 'Kavro Drive').trim() || 'Kavro Drive';
  const cleanMessage = String(message || '').trim();
  if (!cleanMessage) {
    throw new Error('Mensagem da notificação Push é obrigatória.');
  }

  const normalizedAud =
    audience === 'cliente_especifico'
      ? 'cliente'
      : audience === 'motorista_especifico'
        ? 'motorista'
        : audience === 'todos'
          ? 'ambos'
          : (['admin', 'cliente', 'motorista', 'ambos'].includes(audience) ? audience : 'ambos');
  const alsoAdmin = normalizedAud === 'admin' || audience === 'todos' || Boolean(includeAdmin);
  const cleanTargetClient = audience === 'cliente_especifico' ? String(targetClientId || '').trim() : null;
  const cleanTargetDriver = audience === 'motorista_especifico' ? String(targetDriverId || '').trim() : null;

  if (audience === 'cliente_especifico' && !cleanTargetClient) {
    throw new Error('Selecione o passageiro/cliente que receberá a notificação.');
  }
  if (audience === 'motorista_especifico' && !cleanTargetDriver) {
    throw new Error('Selecione o motorista que receberá a notificação.');
  }

  const targetIds = new Set();
  if (alsoAdmin) {
    targetIds.add(ADMIN_EXTERNAL_ID);
  }
  if (normalizedAud === 'cliente' || normalizedAud === 'ambos') {
    try {
      const r = cleanTargetClient
        ? await db.query('SELECT id, phone FROM public.clients WHERE id = $1 LIMIT 1', [cleanTargetClient])
        : await db.query('SELECT id, phone FROM public.clients LIMIT 5000');
      for (const row of r.rows || []) {
        if (cleanTargetClient && String(row.id) !== cleanTargetClient) continue;
        const ext = clientExternalId(row.phone);
        if (ext) targetIds.add(ext);
        if (row.id) targetIds.add(String(row.id));
      }
      if (cleanTargetClient) targetIds.add(cleanTargetClient);
    } catch { /* segue */ }
  }
  if (normalizedAud === 'motorista' || normalizedAud === 'ambos') {
    try {
      const r = cleanTargetDriver
        ? await db.query('SELECT id, phone FROM public.drivers WHERE id = $1 LIMIT 1', [cleanTargetDriver])
        : await db.query('SELECT id, phone FROM public.drivers LIMIT 5000');
      for (const row of r.rows || []) {
        if (cleanTargetDriver && String(row.id) !== cleanTargetDriver) continue;
        const ext = driverExternalId(row.id, row.phone);
        if (ext) targetIds.add(ext);
        if (row.id) targetIds.add(String(row.id));
      }
      if (cleanTargetDriver) targetIds.add(cleanTargetDriver);
    } catch { /* segue */ }
  }

  const resolvedUrl =
    url ||
    (normalizedAud === 'admin'
      ? '/administracion'
      : normalizedAud === 'motorista'
        ? '/kavro-drive'
        : '/cliente');

  const notification = await saveAndPublishInAppNotification({
    id: `notif-manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: cleanTitle,
    message: cleanMessage,
    type: 'admin_broadcast',
    rideId: null,
    audience: normalizedAud,
    targetClientId: cleanTargetClient,
    targetDriverId: cleanTargetDriver,
    url: resolvedUrl
  });

  const ids = Array.from(targetIds);
  let result = null;
  if (ids.length > 0) {
    result = await sendToExternalIds(ids, cleanTitle, cleanMessage, {
      url: resolvedUrl,
      data: {
        type: 'admin_broadcast',
        audience: normalizedAud,
        includesAdmin: alsoAdmin,
        notificationId: notification?.id || null
      }
    });
  } else if (!cleanTargetClient && !cleanTargetDriver) {
    const roles =
      normalizedAud === 'ambos'
        ? (alsoAdmin ? ['cliente', 'motorista', 'admin'] : ['cliente', 'motorista'])
        : [normalizedAud];
    const filters = [];
    roles.forEach((roleVal, idx) => {
      if (idx > 0) filters.push({ operator: 'OR' });
      filters.push({ field: 'tag', key: 'role', relation: '=', value: roleVal });
    });
    result = await oneSignal('POST', '/notifications', {
      app_id: getAppId(),
      target_channel: 'push',
      filters,
      headings: { en: cleanTitle, pt: cleanTitle },
      contents: { en: cleanMessage, pt: cleanMessage },
      chrome_web_icon: appUrl('/pwa-icon-192.png'),
      web_url: appUrl(resolvedUrl),
      data: {
        type: 'admin_broadcast',
        audience: normalizedAud,
        includesAdmin: alsoAdmin,
        notificationId: notification?.id || null
      }
    });
  }

  return {
    ok: Boolean(notification || result?.id || result?.recipients),
    inAppDelivered: Boolean(notification),
    pushSent: Boolean(result?.id || result?.recipients),
    pushRecipients: Number(result?.recipients || 0),
    audience: normalizedAud,
    includesAdmin: alsoAdmin,
    targetClientId: cleanTargetClient,
    targetDriverId: cleanTargetDriver,
    targetedIdsCount: ids.length,
    oneSignalId: result?.id || null,
    notification,
    result
  };
}

module.exports = {
  ADMIN_EXTERNAL_ID,
  DEFAULT_TEMPLATES,
  getAppId,
  isConfigured,
  invalidateNotificationsCache,
  invalidateTemplatesCache,
  clientExternalId,
  driverExternalId,
  ensureNotificationsSchema,
  saveAndPublishInAppNotification,
  queryNotificationsForViewer,
  handleRideChange,
  sendToExternalIds,
  broadcastManualPush,
  notify,
  getTemplates,
  fill
};

