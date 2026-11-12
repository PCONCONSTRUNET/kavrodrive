// ============================================================
// Push Notifications (OneSignal Web SDK v16) — Admin x Cliente
// ============================================================
export type PushRole = 'admin' | 'cliente';

export const ADMIN_EXTERNAL_ID = 'up-admin';

// Mesma regra do servidor (server/push.cjs)
export function clientExternalId(phone?: string): string | null {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 8) return `cli-${digits}`;
  // Fallback por aparelho caso o cliente ative antes de digitar telefone
  if (typeof window !== 'undefined') {
    let devId = localStorage.getItem('up_push_device_id');
    if (!devId) {
      devId = `cli-dev-${Date.now()}`;
      localStorage.setItem('up_push_device_id', devId);
    }
    return devId;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OneSignalT = any;

declare global {
  interface Window {
    OneSignalDeferred?: Array<(os: OneSignalT) => void | Promise<void>>;
    OneSignal?: OneSignalT;
    __oneSignalReady?: boolean;
  }
}

function withOneSignal<T>(fn: (os: OneSignalT) => Promise<T> | T, timeoutMs = 8000): Promise<T | null> {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, timeoutMs);
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (os) => {
      try {
        const r = await fn(os);
        if (!done) { done = true; clearTimeout(timer); resolve(r); }
      } catch (err) {
        console.warn('[push]', err);
        if (!done) { done = true; clearTimeout(timer); resolve(null); }
      }
    });
  });
}

const PREF_KEY = (role: PushRole) => `up_push_prompt_${role}`;

function notifyStateChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('up_push_state_changed'));
  }
}

export const PushService = {
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
  },

  // iPhone só recebe push com o app instalado na tela de início (iOS 16.4+)
  needsIosInstall(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone;
    return isIos && !standalone;
  },

  permission(): NotificationPermission | 'unsupported' {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission;
  },

  async isSubscribed(role?: PushRole): Promise<boolean> {
    if (this.permission() !== 'granted') return false;
    if (role && localStorage.getItem(PREF_KEY(role)) === 'disabled') return false;
    const r = await withOneSignal((os) => Boolean(os.User?.PushSubscription?.optedIn), 3500);
    if (r !== null) return Boolean(r);
    return role ? localStorage.getItem(PREF_KEY(role)) === 'enabled' : true;
  },

  // Vincula o aparelho ao usuário (admin ou cliente) — chamado em todo carregamento
  async identify(role: PushRole, externalId: string | null): Promise<void> {
    const targetId = externalId || (role === 'admin' ? ADMIN_EXTERNAL_ID : clientExternalId());
    if (!targetId || !this.isSupported()) return;
    await withOneSignal(async (os) => {
      if (os.User?.externalId !== targetId) await os.login(targetId);
      os.User.addTag('role', role);
    });
  },

  // Pede permissão IMEDIATAMENTE no clique do botão e vincula o aparelho no OneSignal
  async enable(role: PushRole, externalId: string | null): Promise<{ ok: boolean; reason?: string }> {
    if (this.needsIosInstall()) {
      return { ok: false, reason: 'ios_install' };
    }
    if (!this.isSupported()) {
      return { ok: false, reason: 'unsupported' };
    }

    const targetId = externalId || (role === 'admin' ? ADMIN_EXTERNAL_ID : clientExternalId());

    // 1. Dispara o prompt nativo do navegador IMEDIATAMENTE dentro do gesto de clique!
    let perm: NotificationPermission = Notification.permission;
    if (perm !== 'granted') {
      try {
        if (window.OneSignal?.Notifications?.requestPermission) {
          await window.OneSignal.Notifications.requestPermission();
          perm = Notification.permission;
        } else {
          perm = await Notification.requestPermission();
        }
      } catch {
        perm = await Notification.requestPermission();
      }
    }

    if (perm !== 'granted') {
      notifyStateChange();
      return { ok: false, reason: perm === 'denied' ? 'denied' : 'dismissed' };
    }

    // 2. Com a permissão concedida, faz optIn e vincula o externalId no OneSignal
    await withOneSignal(async (os) => {
      if (os.Notifications?.requestPermission && Notification.permission !== 'granted') {
        await os.Notifications.requestPermission();
      }
      if (os.User?.PushSubscription?.optIn) {
        await os.User.PushSubscription.optIn();
      }
      if (targetId) {
        await os.login(targetId);
      }
      if (os.User?.addTag) {
        os.User.addTag('role', role);
      }
      return true;
    }, 10000);

    localStorage.setItem(PREF_KEY(role), 'enabled');
    notifyStateChange();
    return { ok: true };
  },

  async disable(role?: PushRole): Promise<void> {
    if (role) localStorage.setItem(PREF_KEY(role), 'disabled');
    await withOneSignal((os) => os.User?.PushSubscription?.optOut());
    notifyStateChange();
  },

  // Controle do pop-up: não incomodar por 3 dias se recusar
  shouldShowPrompt(role: PushRole): boolean {
    if (!this.isSupported() && !this.needsIosInstall()) return false;
    if (this.permission() === 'granted' || this.permission() === 'denied') return false;
    const v = localStorage.getItem(PREF_KEY(role));
    if (v === 'enabled') return false;
    if (v && v.startsWith('later:') && Date.now() < Number(v.slice(6))) return false;
    return true;
  },

  snoozePrompt(role: PushRole, days = 3): void {
    localStorage.setItem(PREF_KEY(role), `later:${Date.now() + days * 86400000}`);
  }
};
