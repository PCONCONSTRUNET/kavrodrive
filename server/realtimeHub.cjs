const { EventEmitter } = require('events');
const crypto = require('crypto');
const { buildCorsHeaders, isUpstashConfigured, upstashPipeline } = require('./securityUtils.cjs');

const hubEmitter = new EventEmitter();
hubEmitter.setMaxListeners(500);

const sseClients = new Set();
let totalEventsPublished = 0;
const INSTANCE_ID = `inst-${crypto.randomBytes(4).toString('hex')}`;
const MAX_BUFFERED_EVENTS = 150;
const recentEventsBuffer = [];
let remotePollerTimer = null;
let lastRemoteTsMs = Date.now();
const seenRemoteSeqs = new Set();

function writeSseFrame(res, eventName, data) {
  try {
    if (res.writableEnded || res.destroyed) return false;
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (typeof res.flush === 'function') {
      res.flush();
    }
    return true;
  } catch {
    return false;
  }
}

function shouldDeliverToClient(client, eventName, scope = {}) {
  // Admin Master autenticado enxerga tudo no painel operacional
  if (client.viewerRole === 'admin') return true;

  // Eventos restritos ao Painel Master
  if (eventName === 'audit:created') {
    return false;
  }

  // Notificações em tempo real (sininho no app + push in-app) filtradas por audiência/destinatário
  if (eventName === 'notification:new') {
    if (!client.viewerRole || client.viewerRole === 'anon' || client.viewerRole === 'tracking') {
      return false;
    }
    const aud = scope.audience || 'admin';
    if (client.viewerRole === 'client') {
      if (aud !== 'cliente' && aud !== 'ambos') return false;
      if (scope.clientId && client.userId && String(scope.clientId) !== String(client.userId)) return false;
      return !scope.clientId || Boolean(client.userId);
    }
    if (client.viewerRole === 'driver') {
      if (aud !== 'motorista' && aud !== 'ambos') return false;
      if (scope.driverId && client.userId && String(scope.driverId) !== String(client.userId)) return false;
      return !scope.driverId || Boolean(client.userId);
    }
    return false;
  }

  if (eventName === 'sos:updated') {
    if (client.trackingSosId && scope.sosId && client.trackingSosId === scope.sosId) {
      return true;
    }
    return false;
  }

  // Chat e GPS ao vivo de uma corrida: NUNCA vazar para assinantes anônimos ou genéricos sem escopo
  if (eventName === 'chat:message' || eventName === 'gps:location') {
    if (!client.viewerRole || client.viewerRole === 'anon') return false;
    const eventRideId = scope.rideId;
    if (!eventRideId) return false;
    if (client.rideId && client.rideId === eventRideId) return true;
    if (client.viewerRole === 'driver' && client.userId && (!scope.driverId || scope.driverId === client.userId)) {
      return true;
    }
    if (client.viewerRole === 'client' && client.userId && scope.clientId && scope.clientId === client.userId) {
      return true;
    }
    return false;
  }

  // Eventos de corrida (radar / status) não são entregues a visitantes anônimos sem token de corrida/sessão
  if (eventName.startsWith('ride:')) {
    if (client.viewerRole === 'driver') {
      // Motorista autenticado recebe novas corridas disponíveis e atualizações das suas corridas
      return true;
    }
    if (client.viewerRole === 'client') {
      if (client.rideId && scope.rideId && client.rideId === scope.rideId) return true;
      if (client.userId && scope.clientId && client.userId === scope.clientId) return true;
      return false;
    }
    if (client.viewerRole === 'tracking' && client.rideId && scope.rideId === client.rideId) {
      return true;
    }
    return false;
  }

  // config:updated e driver:updated (já sanitizado sem PII): liberado para apps conectados
  return true;
}

function pushToRingBuffer(entry) {
  recentEventsBuffer.push(entry);
  if (recentEventsBuffer.length > MAX_BUFFERED_EVENTS) {
    recentEventsBuffer.splice(0, recentEventsBuffer.length - MAX_BUFFERED_EVENTS);
  }
}

function deliverToMatchingClients(eventName, envelope, scope) {
  for (const client of Array.from(sseClients)) {
    if (!shouldDeliverToClient(client, eventName, scope)) {
      continue;
    }
    const ok = writeSseFrame(client.res, eventName, envelope);
    if (!ok) {
      sseClients.delete(client);
      if (client.keepaliveTimer) clearInterval(client.keepaliveTimer);
    }
  }
}

function ensureRemotePollerRunning() {
  if (!isUpstashConfigured() || remotePollerTimer || sseClients.size === 0) return;
  remotePollerTimer = setInterval(async () => {
    if (sseClients.size === 0 || !isUpstashConfigured()) {
      clearInterval(remotePollerTimer);
      remotePollerTimer = null;
      return;
    }
    try {
      const res = await upstashPipeline([['LRANGE', 'kavro:rt:events', '0', '25']]);
      const rawItems = Array.isArray(res?.[0]?.result) ? res[0].result : [];
      if (rawItems.length === 0) return;

      const parsed = [];
      for (let i = rawItems.length - 1; i >= 0; i--) {
        try {
          const item = JSON.parse(rawItems[i]);
          if (!item || item.instanceId === INSTANCE_ID) continue;
          const uid = `${item.instanceId}:${item.seq}`;
          if (item.tsMs >= lastRemoteTsMs && !seenRemoteSeqs.has(uid)) {
            seenRemoteSeqs.add(uid);
            if (seenRemoteSeqs.size > 500) seenRemoteSeqs.clear();
            parsed.push(item);
          }
        } catch {}
      }

      for (const item of parsed) {
        if (item.tsMs > lastRemoteTsMs) lastRemoteTsMs = item.tsMs;
        pushToRingBuffer(item);
        deliverToMatchingClients(item.eventName, item.envelope, item.scope || {});
      }
    } catch {}
  }, 1500);
  if (typeof remotePollerTimer.unref === 'function') {
    remotePollerTimer.unref();
  }
}

function stopRemotePollerIfIdle() {
  if (sseClients.size === 0 && remotePollerTimer) {
    clearInterval(remotePollerTimer);
    remotePollerTimer = null;
  }
}

/**
 * Publish a real-time event to matching authorized SSE clients and internal subscribers.
 */
function publish(eventName, payload = {}, scope = {}) {
  totalEventsPublished += 1;
  const seq = totalEventsPublished;
  const tsMs = Date.now();
  const envelope = {
    type: eventName,
    seq,
    tsMs,
    ts: new Date(tsMs).toISOString(),
    ...payload
  };

  pushToRingBuffer({ instanceId: INSTANCE_ID, seq, tsMs, eventName, envelope, scope });

  hubEmitter.emit(eventName, envelope, scope);
  hubEmitter.emit('*', { event: eventName, envelope, scope });

  deliverToMatchingClients(eventName, envelope, scope);

  if (isUpstashConfigured()) {
    upstashPipeline([
      ['LPUSH', 'kavro:rt:events', JSON.stringify({ instanceId: INSTANCE_ID, seq, tsMs, eventName, envelope, scope })],
      ['LTRIM', 'kavro:rt:events', '0', String(MAX_BUFFERED_EVENTS - 1)],
      ['EXPIRE', 'kavro:rt:events', '120']
    ]).catch(() => {});
  }

  return envelope;
}

/**
 * Handle GET /api/realtime/stream SSE connections with scoped viewer identity.
 */
function handleStreamRequest(req, res, url, authCtx = null) {
  const viewerRole = authCtx?.viewerRole || 'anon';
  const rideId = authCtx
    ? String(authCtx.rideId || '').trim()
    : (viewerRole !== 'anon' ? String(url?.searchParams?.get('rideId') || '').trim() : '');
  const role = String(url?.searchParams?.get('role') || 'public').trim();
  const userId = authCtx?.userId || null;
  const trackingSosId = authCtx?.trackingSosId || null;

  if (req.socket && typeof req.socket.setTimeout === 'function') {
    req.socket.setTimeout(0);
  }
  if (typeof res.setTimeout === 'function') {
    res.setTimeout(0);
  }

  res.writeHead(200, buildCorsHeaders(req, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  }));

  res.write(': connected\n\n');
  writeSseFrame(res, 'connected', {
    ok: true,
    role,
    viewerRole,
    rideId: rideId || null,
    serverTime: new Date().toISOString()
  });

  const keepaliveTimer = setInterval(() => {
    try {
      if (res.writableEnded || res.destroyed) {
        clearInterval(keepaliveTimer);
        sseClients.delete(clientEntry);
        return;
      }
      res.write(`: ping ${Date.now()}\n\n`);
    } catch {
      clearInterval(keepaliveTimer);
      sseClients.delete(clientEntry);
    }
  }, 20000);

  if (typeof keepaliveTimer.unref === 'function') {
    keepaliveTimer.unref();
  }

  const clientEntry = {
    res,
    role,
    viewerRole,
    userId,
    rideId,
    trackingSosId,
    connectedAt: new Date().toISOString(),
    keepaliveTimer
  };

  sseClients.add(clientEntry);
  ensureRemotePollerRunning();

  const sinceTs = Number(url?.searchParams?.get('since') || 0);
  if (sinceTs > 0 && Number.isFinite(sinceTs)) {
    for (const item of recentEventsBuffer) {
      if (item.tsMs > sinceTs && shouldDeliverToClient(clientEntry, item.eventName, item.scope || {})) {
        writeSseFrame(res, item.eventName, item.envelope);
      }
    }
  }

  const cleanup = () => {
    clearInterval(keepaliveTimer);
    sseClients.delete(clientEntry);
    stopRemotePollerIfIdle();
  };

  req.on('close', cleanup);
  req.on('aborted', cleanup);
  res.on('close', cleanup);
}

function getStats() {
  return {
    activeConnections: sseClients.size,
    totalEventsPublished,
    bufferedEvents: recentEventsBuffer.length,
    upstashConfigured: isUpstashConfigured()
  };
}

module.exports = {
  hubEmitter,
  publish,
  handleStreamRequest,
  getStats
};

