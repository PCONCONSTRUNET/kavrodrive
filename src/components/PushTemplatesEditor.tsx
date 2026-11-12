import React, { useState } from 'react';
import { Bell, ChevronDown, ChevronUp, Send, RotateCcw } from 'lucide-react';
import type { PushTemplate } from '../types';
import { StorageService } from '../services/storage';
import { ADMIN_EXTERNAL_ID, PushService } from '../services/push';

// Espelho dos padrões do servidor (server/push.cjs -> DEFAULT_TEMPLATES)
export const DEFAULT_PUSH_TEMPLATES: Record<string, PushTemplate & { audience: 'admin' | 'cliente'; label: string }> = {
  admin_new_ride:         { audience: 'admin',   label: 'Nova corrida solicitada na plataforma', enabled: true, title: 'Nova corrida solicitada', message: '{cliente} solicitou corrida para {data} às {hora} • {valor}' },
  admin_ride_cancelled:   { audience: 'admin',   label: 'Corrida cancelada',                     enabled: true, title: 'Corrida cancelada', message: '{id} de {cliente} ({data} às {hora}) foi cancelada' },
  admin_pix_paid:         { audience: 'admin',   label: 'Liquidação PIX confirmada (Webhook)',   enabled: true, title: 'PIX confirmado no Gateway', message: '{cliente} pagou {valor} via PIX • {id}' },
  admin_payment_pending:  { audience: 'admin',   label: 'Cobrança em dinheiro ou cartão',        enabled: true, title: 'Cobrança registrada', message: '{cliente} selecionou {valor} em {pagamento} • {id}' },
  client_ride_booked:     { audience: 'cliente', label: 'Confirmação de solicitação de viagem',  enabled: true, title: 'Viagem confirmada', message: 'Sua corrida {id} foi confirmada para {data} às {hora}.' },
  client_ride_started:    { audience: 'cliente', label: 'Motorista parceiro a caminho (GPS)',    enabled: true, title: 'Motorista a caminho', message: 'Seu motorista parceiro iniciou o deslocamento da corrida {id} rumo a {origem}.' },
  client_ride_cancelled:  { audience: 'cliente', label: 'Aviso de cancelamento de viagem',       enabled: true, title: 'Viagem cancelada', message: 'Sua corrida {id} de {data} às {hora} foi cancelada.' },
  client_payment_approved:{ audience: 'cliente', label: 'Recibo de pagamento confirmado',        enabled: true, title: 'Pagamento confirmado', message: 'Recebemos seu pagamento de {valor} ({pagamento}). Obrigado por viajar com a Kavro Drive!' },
  client_pix_approved:    { audience: 'cliente', label: 'Confirmação imediata de PIX',           enabled: true, title: 'PIX confirmado', message: 'Seu pagamento PIX de {valor} foi confirmado. Corrida {id} liberada!' },
  client_reminder:        { audience: 'cliente', label: 'Lembrete pré-viagem agendada',          enabled: true, title: 'Sua viagem inicia em {minutos} min', message: 'Embarque às {hora} em {origem}.', minutesBefore: 30 },
};

const VARS = '{cliente} {id} {data} {hora} {origem} {destino} {valor} {pagamento} {minutos}';

interface Props {
  value?: Record<string, PushTemplate>;
  onChange: (next: Record<string, PushTemplate>) => void;
}

export const PushTemplatesEditor: React.FC<Props> = ({ value, onChange }) => {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState('');
  const [pushSubscribed, setPushSubscribed] = useState<boolean>(false);

  React.useEffect(() => {
    PushService.isSubscribed('admin').then(setPushSubscribed).catch(() => {});
  }, []);

  const get = (k: string): PushTemplate => {
    const d = DEFAULT_PUSH_TEMPLATES[k];
    return { enabled: d.enabled, title: d.title, message: d.message, minutesBefore: d.minutesBefore, ...(value?.[k] || {}) };
  };
  const set = (k: string, patch: Partial<PushTemplate>) => onChange({ ...(value || {}), [k]: { ...get(k), ...patch } });

  const handleToggleDevicePush = async () => {
    setTestMsg('Sincronizando inscrição Push neste navegador...');
    try {
      if (pushSubscribed) {
        await PushService.disable('admin');
        setPushSubscribed(false);
        setTestMsg('Notificações Push desativadas neste navegador.');
      } else {
        const res = await PushService.enable('admin', ADMIN_EXTERNAL_ID);
        setPushSubscribed(Boolean(res.ok));
        setTestMsg(res.ok ? 'Notificações Push ativadas neste navegador.' : 'Permissão pendente ou bloqueada no navegador.');
      }
    } catch {
      setTestMsg('Não foi possível alterar o status Push neste navegador.');
    }
    setTimeout(() => setTestMsg(''), 5000);
  };

  const sendTest = async () => {
    setTestMsg('Enviando disparo de teste...');
    try {
      const subscribed = await PushService.isSubscribed('admin');
      if (!subscribed) {
        await PushService.enable('admin', ADMIN_EXTERNAL_ID);
      } else {
        await PushService.identify('admin', ADMIN_EXTERNAL_ID);
      }
      const r = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': StorageService.getAdminPin() },
        body: '{}'
      });
      const d = await r.json();
      setTestMsg(d.ok ? 'Disparo de teste enviado com sucesso.' : 'Ative as notificações neste navegador antes de testar.');
    } catch {
      setTestMsg('Falha ao enviar disparo de teste.');
    }
    setTimeout(() => setTestMsg(''), 5000);
  };

  const group = (aud: 'admin' | 'cliente') => Object.entries(DEFAULT_PUSH_TEMPLATES).filter(([, d]) => d.audience === aud);

  const row = (k: string, label: string) => {
    const t = get(k);
    const open = openKey === k;
    return (
      <div
        key={k}
        style={{
          border: '1px solid #E2E8F0',
          borderRadius: 8,
          backgroundColor: t.enabled ? '#FFFFFF' : '#F8FAFC'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
          <button
            type="button"
            onClick={() => set(k, { enabled: !t.enabled })}
            aria-label="Ativar ou desativar regra"
            style={{
              width: 34,
              height: 18,
              borderRadius: 999,
              border: 'none',
              backgroundColor: t.enabled ? '#0F172A' : '#CBD5E1',
              position: 'relative',
              flexShrink: 0,
              cursor: 'pointer',
              transition: 'background-color 0.15s ease'
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: t.enabled ? 18 : 2,
                width: 14,
                height: 14,
                borderRadius: '50%',
                backgroundColor: '#FFFFFF',
                transition: 'left 0.15s ease'
              }}
            />
          </button>

          <button
            type="button"
            onClick={() => setOpenKey(open ? null : k)}
            style={{
              flex: 1,
              minWidth: 0,
              background: 'none',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              padding: 0
            }}
          >
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: t.enabled ? '#0F172A' : '#94A3B8' }}>
              {label}{k === 'client_reminder' && t.enabled ? ` (${t.minutesBefore || 30} min antes)` : ''}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>
              {t.title} — {t.message}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setOpenKey(open ? null : k)}
            style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: 4 }}
          >
            {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>

        {open && (
          <div style={{ padding: '10px 12px 12px', borderTop: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', gap: 8, backgroundColor: '#F8FAFC' }}>
            {k === 'client_reminder' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155' }}>Antecedência:</span>
                {[15, 30, 60, 120].map((m) => {
                  const active = (t.minutesBefore || 30) === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => set(k, { minutesBefore: m })}
                      style={{
                        padding: '3px 9px',
                        borderRadius: 6,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: active ? '1px solid #0F172A' : '1px solid #CBD5E1',
                        backgroundColor: active ? '#0F172A' : '#FFFFFF',
                        color: active ? '#FFFFFF' : '#334155'
                      }}
                    >
                      {m >= 60 ? `${m / 60}h` : `${m} min`}
                    </button>
                  );
                })}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 600, color: '#475569', marginBottom: 3 }}>
                Título da Notificação
              </label>
              <input
                value={t.title}
                onChange={(e) => set(k, { title: e.target.value })}
                placeholder="Título"
                style={{
                  height: 34,
                  padding: '0 10px',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: '#0F172A',
                  backgroundColor: '#FFFFFF',
                  boxSizing: 'border-box',
                  width: '100%'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 600, color: '#475569', marginBottom: 3 }}>
                Corpo da Mensagem
              </label>
              <textarea
                value={t.message}
                onChange={(e) => set(k, { message: e.target.value })}
                placeholder="Mensagem"
                rows={2}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  fontSize: '0.76rem',
                  color: '#0F172A',
                  backgroundColor: '#FFFFFF',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  width: '100%',
                  fontFamily: 'inherit'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.66rem', color: '#64748B' }}>
                Variáveis disponíveis: <code style={{ color: '#0F172A' }}>{VARS}</code>
              </span>
              <button
                type="button"
                onClick={() => {
                  const d = DEFAULT_PUSH_TEMPLATES[k];
                  set(k, { title: d.title, message: d.message, minutesBefore: d.minutesBefore });
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#475569',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  flexShrink: 0
                }}
              >
                <RotateCcw size={11} /> Restaurar padrão
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ backgroundColor: '#FFFFFF', padding: 20, borderRadius: 10, border: '1px solid #E2E8F0' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        paddingBottom: 14,
        marginBottom: 16,
        borderBottom: '1px solid #F1F5F9'
      }}>
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A' }}>
            Mensageria & Regras de Notificações Push (Web Push / OneSignal)
          </div>
          <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: 2 }}>
            Configure os gatilhos automáticos enviados para a Central Administrativa e para os Passageiros
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={handleToggleDevicePush}
            style={{
              height: 32,
              padding: '0 12px',
              borderRadius: 6,
              border: '1px solid #CBD5E1',
              backgroundColor: pushSubscribed ? '#F0FDF4' : '#FFFFFF',
              color: pushSubscribed ? '#15803D' : '#334155',
              fontSize: '0.74rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer'
            }}
          >
            <Bell size={13} />
            <span>{pushSubscribed ? 'Push Ativo neste Navegador' : 'Receber Alertas neste Navegador'}</span>
          </button>

          <button
            type="button"
            onClick={sendTest}
            style={{
              height: 32,
              padding: '0 12px',
              borderRadius: 6,
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#0F172A',
              fontSize: '0.74rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer'
            }}
          >
            <Send size={12} />
            <span>Disparar Teste</span>
          </button>
        </div>
      </div>

      {testMsg && (
        <div style={{
          padding: '8px 12px',
          marginBottom: 14,
          borderRadius: 6,
          backgroundColor: '#F8FAFC',
          border: '1px solid #E2E8F0',
          fontSize: '0.75rem',
          fontWeight: 500,
          color: '#334155'
        }}>
          {testMsg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 18 }}>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
            Gatilhos da Torre de Controle (Admin Master)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {group('admin').map(([k, d]) => row(k, d.label))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
            Gatilhos Automáticos do Passageiro
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {group('cliente').map(([k, d]) => row(k, d.label))}
          </div>
        </div>
      </div>
    </div>
  );
};
