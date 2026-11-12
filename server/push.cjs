// ============================================================
// Notificações PUSH via OneSignal (Admin separado do Cliente)
// ============================================================
const env = require('./env.cjs');
const db = require('./db.cjs');

const APP_ID = env.ONESIGNAL_APP_ID || '618823b7-cb26-49c8-b7c0-96385c228a98';
const ADMIN_EXTERNAL_ID = 'up-admin';
const TZ_OFFSET = '-03:00'; // Horário de Brasília

// Mesma regra usada no front: cliente = "cli-" + telefone só com dígitos
function clientExternalId(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 8 ? `cli-${digits}` : null;
}

// Modelos padrão (o admin pode editar/desativar no painel -> config.pushTemplates)
const DEFAULT_TEMPLATES = {
  admin_new_ride:        { enabled: true, audience: 'admin',   title: '🚗 Nova corrida agendada', message: '{cliente} agendou para {data} às {hora} • {valor}' },
  admin_ride_cancelled:  { enabled: true, audience: 'admin',   title: '❌ Corrida cancelada',      message: '{id} de {cliente} ({data} às {hora}) foi cancelada' },
  admin_pix_paid:        { enabled: true, audience: 'admin',   title: '💰 PIX recebido',          message: '{cliente} pagou {valor} via PIX • {id}' },
  admin_payment_pending: { enabled: true, audience: 'admin',   title: '🧾 Pagamento pendente',    message: '{cliente} vai pagar {valor} em {pagamento} • aprove após receber' },
  client_ride_booked:    { enabled: true, audience: 'cliente', title: '✅ Corrida agendada',       message: 'Sua corrida {id} está marcada para {data} às {hora}.' },
  client_ride_confirmed: { enabled: true, audience: 'cliente', title: '✅ Corrida confirmada!',     message: 'Sua corrida {id} para {data} às {hora} foi confirmada pelo motorista!' },
  client_ride_started:   { enabled: true, audience: 'cliente', title: '🚗 Motorista a caminho!',   message: 'Alisson Santos iniciou o deslocamento até você ({origem}). Acompanhe no GPS ao vivo!' },
  client_ride_in_progress:{ enabled: true, audience: 'cliente', title: '🚀 Viagem iniciada!',       message: 'Embarque realizado! Sua corrida {id} rumo a {destino} está em andamento.' },
  client_ride_finished:  { enabled: true, audience: 'cliente', title: '🏁 Viagem concluída!',      message: 'Sua corrida {id} foi finalizada com sucesso. Obrigado por viajar com a Kavro Drive!' },
  client_ride_cancelled: { enabled: true, audience: 'cliente', title: '❌ Corrida cancelada',      message: 'Sua corrida {id} de {data} às {hora} foi cancelada.' },
  client_payment_approved:{ enabled: true, audience: 'cliente', title: '✅ Pagamento aprovado',    message: 'Recebemos seu pagamento de {valor} ({pagamento}). Obrigado!' },
  client_pix_approved:   { enabled: true, audience: 'cliente', title: '✅ PIX confirmado',         message: 'Seu PIX de {valor} foi confirmado automaticamente. Corrida {id} garantida!' },
  client_reminder:       { enabled: true, audience: 'cliente', title: '⏰ Sua corrida é em {minutos} min', message: 'Embarque às {hora} em {origem}. Esteja pronto!', minutesBefore: 30 },
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
  return merged;
}

function formatDateBR(d) {
  const [y, m, day] = String(d || '').split('-');
  return y && m && day ? `${day}/${m}` : d || '';
}

function fill(text, ride, extra = {}) {
  const vars = {
    cliente: ride.clientName || 'Passageiro',
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
  const ids = externalIds.filter(Boolean);
  if (ids.length === 0) return null;
  const payload = {
    app_id: APP_ID,
    target_channel: 'push',
    include_aliases: { external_id: ids },
    headings: { en: title, pt: title },
    contents: { en: message, pt: message },
    chrome_web_icon: appUrl('/pwa-icon-192.png'),
    data: data || {}
  };
  const link = url ? appUrl(url) : undefined;
  if (link) payload.web_url = link;
  if (sendAfter) payload.send_after = sendAfter;
  return oneSignal('POST', '/notifications', payload);
}

// Dispara um evento usando o modelo configurado
async function notify(templateKey, ride, extra = {}) {
  const templates = await getTemplates();
  const t = templates[templateKey];
  if (!t || !t.enabled) return null;
  let target = [];
  if (t.audience === 'admin') {
    target = [ADMIN_EXTERNAL_ID];
  } else {
    const pId = clientExternalId(ride.clientPhone);
    if (pId) target.push(pId);
    if (ride.clientId && !target.includes(ride.clientId)) {
      target.push(ride.clientId);
    }
  }
  const url = t.audience === 'admin' ? '/motora' : `/viagem/${encodeURIComponent(ride.id)}`;
  return sendToExternalIds(target, fill(t.title, ride, extra), fill(t.message, ride, extra), {
    url, data: { rideId: ride.id, event: templateKey }, sendAfter: extra.__sendAfter
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

    if (isNew) {
      if (after.status !== 'cancelada') {
        // Agendamento feito pelo próprio motorista não precisa avisar o admin
        if (!after.isManualBooking) tasks.push(notify('admin_new_ride', after));
        tasks.push(notify('client_ride_booked', after));
        if (!after.isManualBooking && after.paymentStatus !== 'pago' && isCardOrCash(after.paymentMethod)) {
          tasks.push(notify('admin_payment_pending', after));
        }
        tasks.push(scheduleReminder(after));
      }
    } else {
      if (before.status !== 'cancelada' && after.status === 'cancelada') {
        tasks.push(notify('admin_ride_cancelled', after));
        tasks.push(notify('client_ride_cancelled', after));
        tasks.push(cancelReminder(after.id));
      } else if (before.status !== 'confirmada' && after.status === 'confirmada') {
        tasks.push(notify('client_ride_confirmed', after));
      } else if (before.status !== 'a_caminho' && after.status === 'a_caminho') {
        tasks.push(notify('client_ride_started', after));
      } else if (before.status !== 'em_andamento' && after.status === 'em_andamento') {
        tasks.push(notify('client_ride_in_progress', after));
      } else if (after.status === 'finalizada' && before.status !== 'finalizada') {
        tasks.push(notify('client_ride_finished', after));
        tasks.push(cancelReminder(after.id));
      } else if (after.status !== 'cancelada' && (before.date !== after.date || before.time !== after.time)) {
        tasks.push(scheduleReminder(after)); // remarcada
      }

      if (before.paymentStatus !== 'pago' && after.paymentStatus === 'pago') {
        if (after.paymentMethod === 'pix' && source === 'webhook') {
          tasks.push(notify('admin_pix_paid', after));
          tasks.push(notify('client_pix_approved', after));
        } else {
          tasks.push(notify('client_payment_approved', after));
        }
      }
    }
    await Promise.allSettled(tasks);
  } catch (err) {
    console.warn('[push] handleRideChange:', err.message);
  }
}

module.exports = {
  ADMIN_EXTERNAL_ID,
  DEFAULT_TEMPLATES,
  clientExternalId,
  handleRideChange,
  sendToExternalIds,
  notify,
  getTemplates,
  fill
};

