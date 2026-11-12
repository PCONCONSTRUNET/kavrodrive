import React, { useEffect, useState, useCallback } from 'react';
import { Bell, BellOff, BellRing, Check, X, Share } from 'lucide-react';
import { PushService, type PushRole } from '../services/push';

interface CommonProps {
  role: PushRole;
  externalId: string | null;
}

const COPY: Record<PushRole, { title: string; text: string; bullets: string[] }> = {
  admin: {
    title: 'Ative os alertas do motorista',
    text: 'Saiba na hora quando chegar corrida nova, cancelamento ou pagamento.',
    bullets: ['Nova corrida agendada', 'Corrida cancelada', 'PIX recebido e pagamentos pendentes']
  },
  cliente: {
    title: 'Receba avisos da sua viagem',
    text: 'Avisamos você sobre a sua corrida, mesmo com o app fechado.',
    bullets: ['Confirmação do agendamento', 'Pagamento aprovado', 'Lembrete antes da corrida']
  }
};

/** Pop-up com a logo para ativar notificações (aparece 1x; "Agora não" adia 3 dias) */
export const PushPermissionPrompt: React.FC<CommonProps & { delayMs?: number }> = ({ role, externalId, delayMs = 2500 }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const iosInstall = PushService.needsIosInstall();

  // Vincula o aparelho ao usuário em todo carregamento (se já tiver permissão)
  useEffect(() => {
    if (PushService.permission() === 'granted') PushService.identify(role, externalId);
  }, [role, externalId]);

  useEffect(() => {
    if (!PushService.shouldShowPrompt(role)) return;
    const t = setTimeout(() => setOpen(true), delayMs);
    return () => clearTimeout(t);
  }, [role, externalId, delayMs]);

  if (!open) return null;
  const c = COPY[role];

  const handleEnable = async () => {
    setBusy(true);
    await PushService.enable(role, externalId);
    setBusy(false);
    setOpen(false);
  };

  const handleLater = () => {
    PushService.snoozePrompt(role);
    setOpen(false);
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) handleLater(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(10,15,20,0.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 12,
        backdropFilter: 'blur(3px)'
      }}
    >
      <div style={{
        width: '100%', maxWidth: 380, background: '#FFFFFF', borderRadius: 20,
        padding: '18px 18px 14px', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', position: 'relative',
        marginBottom: 'env(safe-area-inset-bottom)'
      }}>
        <button type="button" onClick={handleLater} aria-label="Fechar"
          style={{ position: 'absolute', top: 10, right: 10, border: 'none', background: '#F1F5F9', borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748B' }}>
          <X size={15} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <img src="/pwa-icon-192.png" alt="Kavro Drive" style={{ width: 52, height: 52, borderRadius: 14, background: '#121A21', objectFit: 'cover' }} />
            <span style={{ position: 'absolute', bottom: -4, right: -4, background: '#76D800', color: '#121A21', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #FFF' }}>
              <BellRing size={12} />
            </span>
          </div>
          <div style={{ paddingRight: 24 }}>
            <div style={{ fontWeight: 800, fontSize: '0.98rem', color: '#121A21', lineHeight: 1.2 }}>{c.title}</div>
            <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: 3 }}>{c.text}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, margin: '6px 0 12px' }}>
          {c.bullets.map((b) => (
            <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.78rem', color: '#334155', fontWeight: 600 }}>
              <Check size={14} color="#16A34A" /> {b}
            </div>
          ))}
        </div>

        {iosInstall ? (
          <div style={{ fontSize: '0.75rem', color: '#334155', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '8px 10px', marginBottom: 10 }}>
            No iPhone, primeiro instale o app: toque em <Share size={12} style={{ verticalAlign: 'middle' }} /> <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>. Depois abra pelo ícone e ative aqui.
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={handleLater}
            style={{ flex: 1, padding: '10px', borderRadius: 12, border: '1px solid #E2E8F0', background: '#FFF', color: '#475569', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
            Agora não
          </button>
          {!iosInstall && (
            <button type="button" onClick={handleEnable} disabled={busy}
              style={{ flex: 1.6, padding: '10px', borderRadius: 12, border: 'none', background: '#76D800', color: '#121A21', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: busy ? 0.7 : 1 }}>
              <Bell size={15} /> {busy ? 'Ativando...' : 'Ativar notificações'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/** Card / Botão de Ativação de Push para o Painel Admin e Perfil/Início do Cliente */
export const PushToggleButton: React.FC<CommonProps & { dark?: boolean }> = ({ role, externalId, dark }) => {
  const [state, setState] = useState<'loading' | 'on' | 'off' | 'denied' | 'unsupported' | 'ios'>('loading');
  const [statusMessage, setStatusMessage] = useState<string>('');

  const refresh = useCallback(async () => {
    if (PushService.needsIosInstall()) {
      setState('ios');
      return;
    }
    const p = PushService.permission();
    if (p === 'unsupported') {
      setState('unsupported');
      return;
    }
    if (p === 'denied') {
      setState('denied');
      return;
    }
    const subscribed = await PushService.isSubscribed(role);
    setState(subscribed ? 'on' : 'off');
  }, [role]);

  useEffect(() => {
    refresh();
    window.addEventListener('up_push_state_changed', refresh);
    window.addEventListener('up_onesignal_ready', refresh);
    return () => {
      window.removeEventListener('up_push_state_changed', refresh);
      window.removeEventListener('up_onesignal_ready', refresh);
    };
  }, [refresh]);

  const handleAction = async () => {
    setStatusMessage('');
    if (state === 'on') {
      setState('loading');
      await PushService.disable(role);
      setStatusMessage('Notificações desativadas neste aparelho.');
      await refresh();
      return;
    }

    setState('loading');
    const res = await PushService.enable(role, externalId);
    if (res.ok) {
      setStatusMessage('✅ Notificações Push ativadas com sucesso neste aparelho!');
    } else if (res.reason === 'denied') {
      setStatusMessage('⚠️ Permissão bloqueada no navegador. Clique no cadeado ao lado da URL e libere Notificações.');
    } else if (res.reason === 'ios_install') {
      setStatusMessage('📲 No iPhone, adicione o app à Tela de Início primeiro (Compartilhar → Adicionar à Tela de Início).');
    } else if (res.reason === 'dismissed') {
      setStatusMessage('Clique em "Permitir" quando o navegador perguntar para ativar os alertas.');
    }
    await refresh();
  };

  const on = state === 'on';

  const title = {
    loading: 'Conectando ao Push...',
    on: 'Notificações Push Ativas',
    off: 'Notificações Push neste Aparelho',
    denied: 'Notificações Bloqueadas no Navegador',
    unsupported: 'Navegador sem suporte a Push',
    ios: 'Ativar Notificações no iPhone'
  }[state];

  const subtitle = {
    loading: 'Aguarde a confirmação do navegador...',
    on: role === 'admin' ? 'Este aparelho recebe alertas de novas corridas e pagamentos' : 'Você receberá alertas de confirmação, pagamento e lembrete',
    off: role === 'admin' ? 'Ative para receber alertas de novas corridas e PIX neste aparelho' : 'Receba avisos da sua corrida, pagamento e lembrete de 30 min',
    denied: 'Clique no ícone ao lado do endereço do site e mude Notificações para "Permitir"',
    unsupported: 'Use Google Chrome, Edge ou Safari (iOS 16.4+ na Tela de Início)',
    ios: 'Toque em Compartilhar → Adicionar à Tela de Início para habilitar Push'
  }[state];

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '12px 14px',
        borderRadius: 14,
        border: `1.5px solid ${on ? '#86EFAC' : dark ? 'rgba(255,255,255,0.14)' : '#CBD5E1'}`,
        background: on
          ? (dark ? 'rgba(118,216,0,0.12)' : '#F0FDF4')
          : dark
          ? 'rgba(255,255,255,0.05)'
          : '#F8FAFC',
        boxSizing: 'border-box'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 180 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: on ? '#76D800' : dark ? '#1E293B' : '#121A21',
              color: on ? '#121A21' : '#76D800'
            }}
          >
            {on ? <BellRing size={19} /> : state === 'denied' ? <BellOff size={19} /> : <Bell size={19} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: '0.86rem', color: dark ? '#F8FAFC' : '#121A21', lineHeight: 1.2 }}>
              {title}
            </div>
            <div style={{ fontSize: '0.72rem', color: dark ? '#94A3B8' : '#64748B', marginTop: 2, lineHeight: 1.3 }}>
              {subtitle}
            </div>
          </div>
        </div>

        {/* Botão de Ação Direta que dispara a API de Push */}
        {state !== 'unsupported' && state !== 'ios' && (
          <button
            type="button"
            onClick={handleAction}
            disabled={state === 'loading'}
            style={{
              backgroundColor: on ? (dark ? 'rgba(255,255,255,0.1)' : '#FFFFFF') : '#76D800',
              color: on ? (dark ? '#E2E8F0' : '#334155') : '#121A21',
              border: on ? '1.5px solid #CBD5E1' : 'none',
              padding: '9px 14px',
              borderRadius: 10,
              fontSize: '0.78rem',
              fontWeight: 800,
              cursor: state === 'loading' ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              flexShrink: 0,
              boxShadow: on ? 'none' : '0 3px 10px rgba(118, 216, 0, 0.3)'
            }}
          >
            {on ? (
              <>
                <Check size={14} color="#16A34A" />
                <span>Ativadas (Desativar)</span>
              </>
            ) : (
              <>
                <BellRing size={14} />
                <span>{state === 'loading' ? 'Ativando...' : 'Ativar Notificações'}</span>
              </>
            )}
          </button>
        )}
      </div>

      {statusMessage && (
        <div
          style={{
            fontSize: '0.73rem',
            fontWeight: 700,
            color: statusMessage.startsWith('✅') ? '#15803D' : '#B45309',
            backgroundColor: statusMessage.startsWith('✅') ? '#DCFCE7' : '#FEF3C7',
            padding: '6px 10px',
            borderRadius: 8
          }}
        >
          {statusMessage}
        </div>
      )}
    </div>
  );
};
