import React, { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();

let runtimeConfigCache: { enabled: boolean; siteKey: string } | null = TURNSTILE_SITE_KEY
  ? { enabled: true, siteKey: TURNSTILE_SITE_KEY }
  : null;
let runtimeConfigPromise: Promise<{ enabled: boolean; siteKey: string }> | null = null;

export function isTurnstileEnabled(): boolean {
  if (TURNSTILE_SITE_KEY) return true;
  if (!runtimeConfigCache) return false;
  return Boolean(runtimeConfigCache.siteKey || runtimeConfigCache.enabled);
}

async function fetchTurnstileConfig(): Promise<{ enabled: boolean; siteKey: string }> {
  if (TURNSTILE_SITE_KEY) {
    return { enabled: true, siteKey: TURNSTILE_SITE_KEY };
  }
  if (runtimeConfigCache) return runtimeConfigCache;
  if (!runtimeConfigPromise) {
    runtimeConfigPromise = fetch('/api/turnstile-config')
      .then(async (res) => {
        if (!res.ok) return { enabled: false, siteKey: '' };
        const data = await res.json();
        const cfg = {
          enabled: Boolean(data?.enabled),
          siteKey: String(data?.siteKey || '').trim(),
        };
        runtimeConfigCache = cfg;
        return cfg;
      })
      .catch(() => ({ enabled: false, siteKey: '' }));
  }
  return runtimeConfigPromise;
}

let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-kavro-turnstile="1"]') as HTMLScriptElement | null;
    if (existing) {
      if (existing.getAttribute('data-loaded') === '1' && window.turnstile) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => {
          turnstileScriptPromise = null;
          existing.remove();
          reject(new Error('Falha ao carregar Turnstile'));
        },
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.setAttribute('data-kavro-turnstile', '1');
    script.onload = () => {
      script.setAttribute('data-loaded', '1');
      resolve();
    };
    script.onerror = () => {
      turnstileScriptPromise = null;
      script.remove();
      reject(new Error('Falha ao carregar Turnstile'));
    };
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

interface TurnstileWidgetProps {
  onVerify: (token: string | null) => void;
  theme?: 'light' | 'dark' | 'auto';
  resetKey?: number;
}

export const TurnstileWidget: React.FC<TurnstileWidgetProps> = ({
  onVerify,
  theme = 'light',
  resetKey = 0,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;

  const [siteKey, setSiteKey] = useState<string>(TURNSTILE_SITE_KEY || runtimeConfigCache?.siteKey || '');
  const [serverEnabled, setServerEnabled] = useState<boolean>(Boolean(TURNSTILE_SITE_KEY));
  const [widgetError, setWidgetError] = useState<string>('');
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let active = true;
    if (!TURNSTILE_SITE_KEY) {
      fetchTurnstileConfig().then((cfg) => {
        if (!active) return;
        setServerEnabled(cfg.enabled);
        if (cfg.siteKey) {
          setSiteKey(cfg.siteKey);
        } else if (cfg.enabled) {
          setWidgetError('Chave pública do CAPTCHA (VITE_TURNSTILE_SITE_KEY) não configurada.');
        }
      });
    }
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!siteKey) return;
    let active = true;
    setWidgetError('');

    loadTurnstileScript()
      .then(() => {
        if (!active || !containerRef.current || !window.turnstile) return;
        if (widgetIdRef.current) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {}
          widgetIdRef.current = null;
        }
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          callback: (token: string) => {
            setWidgetError('');
            onVerifyRef.current(token);
          },
          'expired-callback': () => onVerifyRef.current(null),
          'error-callback': (errCode?: string) => {
            onVerifyRef.current(null);
            setWidgetError(
              `Não foi possível carregar a verificação anti-robô${errCode ? ` (${errCode})` : ''}. Verifique o domínio autorizado no Cloudflare.`
            );
          },
        });
      })
      .catch(() => {
        if (!active) return;
        onVerifyRef.current(null);
        setWidgetError('Falha ao carregar o widget de segurança. Verifique sua conexão e tente novamente.');
      });

    return () => {
      active = false;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, theme, retryTick]);

  useEffect(() => {
    if (!siteKey || resetKey === 0) return;
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {}
      onVerifyRef.current(null);
    }
  }, [resetKey, siteKey]);

  if (!siteKey && !serverEnabled) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '4px 0', gap: 6 }}>
      {siteKey && <div ref={containerRef} />}
      {widgetError && (
        <div style={{
          width: '100%',
          padding: '8px 10px',
          borderRadius: 8,
          backgroundColor: theme === 'dark' ? 'rgba(220, 38, 38, 0.14)' : '#FEF2F2',
          border: '1px solid #FECACA',
          color: theme === 'dark' ? '#FCA5A5' : '#B91C1C',
          fontSize: '0.73rem',
          fontWeight: 600,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6
        }}>
          <span>{widgetError}</span>
          {siteKey && (
            <button
              type="button"
              onClick={() => {
                setWidgetError('');
                setRetryTick((t) => t + 1);
              }}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid currentColor',
                background: 'transparent',
                color: 'inherit',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Recarregar verificação
            </button>
          )}
        </div>
      )}
    </div>
  );
};
