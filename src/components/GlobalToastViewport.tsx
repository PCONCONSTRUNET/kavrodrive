import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { KAVRO_TOAST_EVENT, KavroToastPayload } from '../utils/uiFeedback';

export const GlobalToastViewport: React.FC = () => {
  const [toasts, setToasts] = useState<KavroToastPayload[]>([]);

  useEffect(() => {
    const handleToast = (ev: Event) => {
      const detail = (ev as CustomEvent<KavroToastPayload>).detail;
      if (!detail || !detail.message) return;
      setToasts((prev) => [...prev.slice(-3), detail]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== detail.id));
      }, detail.durationMs || 4500);
    };
    window.addEventListener(KAVRO_TOAST_EVENT, handleToast);
    return () => window.removeEventListener(KAVRO_TOAST_EVENT, handleToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(14px + env(safe-area-inset-top, 0px))',
        right: 14,
        left: 14,
        zIndex: 25000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
        pointerEvents: 'none'
      }}
    >
      {toasts.map((t) => {
        const palette =
          t.type === 'success'
            ? { bg: '#052E16', border: '#16A34A', color: '#DCFCE7', icon: <CheckCircle2 size={16} color="#4ADE80" /> }
            : t.type === 'error'
              ? { bg: '#450A0A', border: '#DC2626', color: '#FEE2E2', icon: <AlertCircle size={16} color="#F87171" /> }
              : t.type === 'warning'
                ? { bg: '#451A03', border: '#D97706', color: '#FEF3C7', icon: <AlertCircle size={16} color="#FBBF24" /> }
                : { bg: '#0F172A', border: '#334155', color: '#F8FAFC', icon: <Info size={16} color="#38BDF8" /> };

        return (
          <div
            key={t.id}
            role="status"
            style={{
              pointerEvents: 'auto',
              maxWidth: 420,
              width: 'fit-content',
              backgroundColor: palette.bg,
              border: `1px solid ${palette.border}`,
              color: palette.color,
              borderRadius: 12,
              padding: '10px 12px',
              boxShadow: '0 10px 28px rgba(15, 23, 42, 0.35)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 9,
              fontSize: '0.8rem',
              fontWeight: 600,
              lineHeight: 1.4,
              whiteSpace: 'pre-line'
            }}
          >
            <div style={{ flexShrink: 0, marginTop: 1 }}>{palette.icon}</div>
            <div style={{ flex: 1 }}>{t.message}</div>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
              aria-label="Fechar aviso"
              style={{
                background: 'none',
                border: 'none',
                color: palette.color,
                opacity: 0.75,
                cursor: 'pointer',
                padding: 2,
                flexShrink: 0
              }}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
