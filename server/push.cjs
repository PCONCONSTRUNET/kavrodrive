// ============================================================
// Notificações PUSH via OneSignal (Admin separado do Cliente)
// ============================================================
const env = require('./env.cjs');
const db = require('./db.cjs');

const APP_ID = env.ONESIGNAL_APP_ID || '618823b7-cb26-49c8-b7c0-96385c228a98';
const ADMIN_EXTERNAL_ID = 'up-admin';
const TZ_OFFSET = '-03:00'; // Horário de Brasília

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
  admin_new_ride:        { enabled: true, audience: 'admin',     event: 'new_ride',         title: '🚗 Nova corrida agendada', message: '{cliente} agendou para {data} às {hora} • {valor}' },
  admin_ride_cancelled:  { enabled: true, audience: 'admin',     event: 'ride_cancelled',   title: '❌ Corrida cancelada',      message: '{id} de {cliente} ({data} às {hora}) foi cancelada' },
  admin_pix_paid:        { enabled: true, audience: 'admin',     event: 'pix_paid',         title: '💰 PIX recebido',          message: '{cliente} pagou {valor} via PIX • {id}' },
  admin_payment_pending: { enabled: true, audience: 'admin',     event: 'new_ride',         title: '🧾 Pagamento pendente',    message: '{cliente} vai pagar {valor} em {pagamento} • aprove após receber' },
  driver_new_ride:       { enabled: true, audience: 'motorista', event: 'new_ride',         title: '🚗 Nova corrida disponível!', message: '{cliente} solicitou viagem de {origem} para {destino} • {valor}' },
  client_ride_booked:    { enabled: true, audience: 'cliente',   event: 'new_ride',         title: '✅ Corrida agendada',       message: 'Sua corrida {id} está marcada para {data} às {hora}.' },
  client_ride_confirmed: { enabled: true, audience: 'cliente',   event: 'ride_confirmed',   title: '✅ Corrida confirmada!',     message: 'Sua corrida {id} para {data} às {hora} foi confirmada pelo motorista!' },
  client_ride_started:   { enabled: true, audience: 'cliente',   event: 'driver_on_way',    title: '🚗 Motorista a caminho!',   message: '{motorista} iniciou o deslocamento até você ({origem}). Acompanhe no GPS ao vivo!' },
  client_ride_in_progress:{ enabled: true, audience: 'cliente',  event: 'ride_in_progress', title: '🚀 Viagem iniciada!',       message: 'Embarque realizado! Sua corrida {id} rumo a {destino} está em andamento.' },
  client_ride_finished:  { enabled: true, audience: 'cliente',   event: 'ride_finished',    title: '🏁 Viagem concluída!',      message: 'Sua corrida {id} foi finalizada com sucesso. Obrigado por viajar com a Kavro Drive!' },
  client_ride_cancelled: { enabled: true, audience: 'cliente',   event: 'ride_cancelled',   title: '❌ Corrida cancelada',      message: 'Sua corrida {id} de {data} às {hora} foi cancelada.' },
  client_payment_approved:{ enabled: true, audience: 'cliente',  event: 'payment_approved', title: '✅ Pagamento aprovado',    message: 'Recebemos seu pagamento de {valor} ({pagamento}). Obrigado!' },
  client_pix_approved:   { enabled: true, audience: 'cliente',   event: 'pix_paid',         title: '✅ PIX confirmado',         message: 'Seu PIX de {valor} foi confirmado automaticamente. Corrida {id} garantida!' },
  client_reminder:       { enabled: true, audience: 'cliente',   event: 'reminder',         title: '⏰ Sua corrida é em {minutos} min', message: 'Embarque às {hora} em {origem}. Esteja pronto!', minutesBefore: 30 },
};

const PAYMENT_LABEL = {
  pix: 'PIX', dinheiro: 'Dinheiro', cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito', online: 'Pagamento Online'
};

async function getTemplates() {
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
  return merged;
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
  const base = (env.PUBLIC_APP_URL || '').replace(/\/$/, '');
  return base ? `${base}${path}` : undefined;
}

// Chamada crua à API REST do OneSignal
async function oneSignal(method, path, body) {
  const key = env.ONESIGNAL_REST_API_KEY;
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
      app_id: APP_ID,
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
  if (audience === 'admin') {
    targets.add(ADMIN_EXTERNAL_ID);
    return Array.from(targets);
  }
  if (audience === 'cliente' || audience === 'ambos') {
    const pId = clientExternalId(ride.clientPhone);
    if (pId) targets.add(pId);
    if (ride.clientId) targets.add(String(ride.clientId));
  }
  if (audience === 'motorista' || audience === 'ambos') {
    if (ride.driverId) {
      const dExt = driverExternalId(ride.driverId);
      if (dExt) targets.add(dExt);
      targets.add(String(ride.driverId));
    } else if (eventName === 'new_ride') {
      try {
        const res = await db.query(
          "SELECT id, phone FROM public.drivers WHERE approval_status = 'aprovado' OR approval_status IS NULL"
        );
        for (const row of res.rows || []) {
          const dExt = driverExternalId(row.id, row.phone);
          if (dExt) targets.add(dExt);
          if (row.id) targets.add(String(row.id));
        }
      } catch { /* fallback sem motoristas */ }
    }
  }
  return Array.from(targets);
}

// Dispara um evento usando o modelo configurado
async function notify(templateKey, ride, extra = {}) {
  const templates = await getTemplates();
  const t = templates[templateKey];
  if (!t || !t.enabled) return null;
  const audience = t.audience || 'cliente';
  const target = await resolveRideTargets(audience, t.event || templateKey, ride);
  if (target.length === 0) return null;
  const url =
    audience === 'admin'
      ? '/administracion'
      : audience === 'motorista'
        ? '/kavro-drive'
        : `/viagem/${encodeURIComponent(ride.id)}`;
  return sendToExternalIds(target, fill(t.title, ride, extra), fill(t.message, ride, extra), {
    url, data: { rideId: ride.id, event: templateKey, audience }, sendAfter: extra.__sendAfter
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
      await oneSignal('DELETE', `/notifications/${nid}?app_id=${APP_ID}`);
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

async function broadcastManualPush({ audience = 'ambos', title, message, url } = {}) {
  const cleanTitle = String(title || '').trim();
  const cleanMessage = String(message || '').trim();
  if (!cleanTitle || !cleanMessage) {
    throw new Error('Título e mensagem são obrigatórios para disparo manual.');
  }

  const targetIds = new Set();
  if (audience === 'admin') {
    targetIds.add(ADMIN_EXTERNAL_ID);
  }
  if (audience === 'cliente' || audience === 'ambos') {
    try {
      const r = await db.query('SELECT id, phone FROM public.clients');
      for (const row of r.rows || []) {
        const ext = clientExternalId(row.phone);
        if (ext) targetIds.add(ext);
        if (row.id) targetIds.add(String(row.id));
      }
    } catch { /* segue */ }
  }
  if (audience === 'motorista' || audience === 'ambos') {
    try {
      const r = await db.query('SELECT id, phone FROM public.drivers');
      for (const row of r.rows || []) {
        const ext = driverExternalId(row.id, row.phone);
        if (ext) targetIds.add(ext);
        if (row.id) targetIds.add(String(row.id));
      }
    } catch { /* segue */ }
  }

  const resolvedUrl =
    url ||
    (audience === 'admin'
      ? '/administracion'
      : audience === 'motorista'
        ? '/kavro-drive'
        : '/cliente');

  const ids = Array.from(targetIds);
  let result = null;
  if (ids.length > 0) {
    result = await sendToExternalIds(ids, cleanTitle, cleanMessage, {
      url: resolvedUrl,
      data: { type: 'manual_broadcast', audience }
    });
  } else {
    // Fallback por tag role no OneSignal quando ainda não há registros SQL correspondentes
    const roles =
      audience === 'ambos'
        ? ['cliente', 'motorista']
        : [audience];
    const filters = [];
    roles.forEach((roleVal, idx) => {
      if (idx > 0) filters.push({ operator: 'OR' });
      filters.push({ field: 'tag', key: 'role', relation: '=', value: roleVal });
    });
    result = await oneSignal('POST', '/notifications', {
      app_id: APP_ID,
      target_channel: 'push',
      filters,
      headings: { en: cleanTitle, pt: cleanTitle },
      contents: { en: cleanMessage, pt: cleanMessage },
      chrome_web_icon: appUrl('/pwa-icon-192.png'),
      web_url: appUrl(resolvedUrl),
      data: { type: 'manual_broadcast', audience }
    });
  }

  return {
    ok: Boolean(result?.id || result?.recipients),
    audience,
    targetedIdsCount: ids.length,
    oneSignalId: result?.id || null,
    result
  };
}

module.exports = {
  ADMIN_EXTERNAL_ID,
  DEFAULT_TEMPLATES,
  clientExternalId,
  driverExternalId,
  handleRideChange,
  sendToExternalIds,
  broadcastManualPush,
  notify,
  getTemplates,
  fill
};

