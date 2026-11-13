/**
 * Cliente Server-Sent Events (SSE) em tempo real com reconexão exponencial e fallback seguro.
 * Elimina a necessidade de polling agressivo ou reload manual em chat, corridas, GPS e SOS.
 */

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'fallback';

class RealtimeClient {
  private source: EventSource | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private state: ConnectionState = 'disconnected';
  private refCount = 0;

  getConnectionState(): ConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }

  acquire(role = 'app'): () => void {
    this.refCount += 1;
    if (typeof window !== 'undefined' && typeof EventSource !== 'undefined' && !this.source) {
      this.connect(role);
    }
    return () => {
      this.refCount = Math.max(0, this.refCount - 1);
      if (this.refCount === 0) {
        this.disconnect();
      }
    };
  }

  private setState(next: ConnectionState) {
    if (this.state === next) return;
    this.state = next;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('up_realtime_status', { detail: { state: next } }));
    }
  }

  private connect(role = 'app') {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    if (this.source) return;

    this.setState('connecting');
    const url = `/api/realtime/stream?role=${encodeURIComponent(role)}`;

    try {
      const es = new EventSource(url);
      this.source = es;

      const parseDetail = (evt: MessageEvent) => {
        try {
          return JSON.parse(evt.data);
        } catch {
          return {};
        }
      };

      es.addEventListener('connected', () => {
        this.reconnectAttempt = 0;
        this.setState('connected');
      });

      const handleRideEvent = (evt: MessageEvent) => {
        const detail = parseDetail(evt);
        window.dispatchEvent(new CustomEvent('up_realtime_ride', { detail }));
      };

      es.addEventListener('ride:created', handleRideEvent);
      es.addEventListener('ride:updated', handleRideEvent);
      es.addEventListener('ride:deleted', handleRideEvent);

      es.addEventListener('chat:message', (evt: MessageEvent) => {
        const detail = parseDetail(evt);
        window.dispatchEvent(new CustomEvent('up_realtime_chat', { detail }));
      });

      es.addEventListener('gps:location', (evt: MessageEvent) => {
        const detail = parseDetail(evt);
        window.dispatchEvent(new CustomEvent('up_realtime_gps', { detail }));
      });

      es.addEventListener('sos:updated', (evt: MessageEvent) => {
        const detail = parseDetail(evt);
        window.dispatchEvent(new CustomEvent('up_realtime_sos', { detail }));
      });

      es.addEventListener('driver:updated', (evt: MessageEvent) => {
        const detail = parseDetail(evt);
        window.dispatchEvent(new CustomEvent('up_realtime_driver', { detail }));
      });

      es.addEventListener('config:updated', (evt: MessageEvent) => {
        const detail = parseDetail(evt);
        window.dispatchEvent(new CustomEvent('up_realtime_config', { detail }));
      });

      es.addEventListener('audit:created', (evt: MessageEvent) => {
        const detail = parseDetail(evt);
        window.dispatchEvent(new CustomEvent('up_realtime_audit', { detail }));
      });

      es.onerror = () => {
        this.cleanupSource();
        if (this.refCount > 0) {
          this.setState('fallback');
          this.scheduleReconnect(role);
        } else {
          this.setState('disconnected');
        }
      };
    } catch {
      this.setState('fallback');
      this.scheduleReconnect(role);
    }
  }

  private scheduleReconnect(role: string) {
    if (this.reconnectTimer !== null) return;
    const delayMs = Math.min(15000, 1000 * Math.pow(2, Math.min(4, this.reconnectAttempt)));
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.refCount > 0) {
        this.connect(role);
      }
    }, delayMs);
  }

  private cleanupSource() {
    if (this.source) {
      try {
        this.source.close();
      } catch {
        // ignore
      }
      this.source = null;
    }
  }

  disconnect() {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupSource();
    this.setState('disconnected');
  }
}

export const RealtimeService = new RealtimeClient();

