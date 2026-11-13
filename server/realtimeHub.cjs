const { EventEmitter } = require('events');

const hubEmitter = new EventEmitter();
hubEmitter.setMaxListeners(500);

const sseClients = new Set();
let totalEventsPublished = 0;

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

/**
 * Publish a real-time event to all matching SSE clients and internal subscribers.
 */
function publish(eventName, payload = {}, scope = {}) {
  totalEventsPublished += 1;
  const envelope = {
    type: eventName,
    ts: new Date().toISOString(),
    ...payload
  };

  hubEmitter.emit(eventName, envelope, scope);
  hubEmitter.emit('*', { event: eventName, envelope, scope });

  for (const client of Array.from(sseClients)) {
    // If client explicitly subscribed to a specific rideId, filter unrelated chat/gps noise
    if (client.rideId && scope.rideId && client.rideId !== scope.rideId) {
      continue;
    }
    const ok = writeSseFrame(client.res, eventName, envelope);
    if (!ok) {
      sseClients.delete(client);
      if (client.keepaliveTimer) clearInterval(client.keepaliveTimer);
    }
  }

  return envelope;
}

/**
 * Handle GET /api/realtime/stream SSE connections.
 */
function handleStreamRequest(req, res, url) {
  const rideId = String(url?.searchParams?.get('rideId') || '').trim();
  const role = String(url?.searchParams?.get('role') || 'public').trim();

  if (req.socket && typeof req.socket.setTimeout === 'function') {
    req.socket.setTimeout(0);
  }
  if (typeof res.setTimeout === 'function') {
    res.setTimeout(0);
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*'
  });

  res.write(': connected\n\n');
  writeSseFrame(res, 'connected', {
    ok: true,
    role,
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
    rideId,
    connectedAt: new Date().toISOString(),
    keepaliveTimer
  };

  sseClients.add(clientEntry);

  const cleanup = () => {
    clearInterval(keepaliveTimer);
    sseClients.delete(clientEntry);
  };

  req.on('close', cleanup);
  req.on('aborted', cleanup);
  res.on('close', cleanup);
}

function getStats() {
  return {
    activeConnections: sseClients.size,
    totalEventsPublished
  };
}

module.exports = {
  hubEmitter,
  publish,
  handleStreamRequest,
  getStats
};
