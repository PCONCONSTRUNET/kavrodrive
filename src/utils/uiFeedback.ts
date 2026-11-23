import { useCallback, useEffect, useRef, useState } from 'react';

export type KavroToastType = 'info' | 'success' | 'warning' | 'error';

export interface KavroToastPayload {
  id: string;
  message: string;
  type: KavroToastType;
  durationMs: number;
}

export const KAVRO_TOAST_EVENT = 'kavro_toast';

export function showToast(
  message: string,
  type: KavroToastType = 'info',
  durationMs = 4500
): void {
  const cleanMsg = String(message || '').trim();
  if (!cleanMsg || typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<KavroToastPayload>(KAVRO_TOAST_EVENT, {
      detail: {
        id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        message: cleanMsg,
        type,
        durationMs
      }
    })
  );
}

/**
 * Confirmação inline em 2 cliques sem modais nem window.confirm().
 * Primeiro clique arma a chave por `timeoutMs` (padrão 4s); segundo clique confirma e retorna true.
 */
export function useInlineConfirm(timeoutMs = 4000) {
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const disarm = useCallback(() => {
    clearTimer();
    setConfirmingKey(null);
  }, [clearTimer]);

  const arm = useCallback(
    (key: string) => {
      clearTimer();
      setConfirmingKey(key);
      if (typeof window !== 'undefined') {
        timerRef.current = window.setTimeout(() => {
          setConfirmingKey((curr) => (curr === key ? null : curr));
          timerRef.current = null;
        }, timeoutMs);
      }
    },
    [clearTimer, timeoutMs]
  );

  const isConfirming = useCallback(
    (key: string) => confirmingKey === key,
    [confirmingKey]
  );

  const confirmOrArm = useCallback(
    (key: string): boolean => {
      if (confirmingKey === key) {
        disarm();
        return true;
      }
      arm(key);
      return false;
    },
    [arm, confirmingKey, disarm]
  );

  return {
    confirmingKey,
    isConfirming,
    arm,
    disarm,
    confirmOrArm
  };
}
