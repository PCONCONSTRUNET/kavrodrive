import React, { useMemo, useRef, useState } from 'react';
import {
  Bell, BellRing, Send, ChevronDown, ChevronUp, Loader2, Check,
  Sparkles, Plus, Trash2, Users, Car, ShieldCheck, Globe, Smile
} from 'lucide-react';
import { PushAudience, PushTemplate, PushTriggerEvent } from '../types';
import { PushService } from '../services/push';
import { StorageService } from '../services/storage';

const QUICK_EMOJIS = [
  '🚗', '🚕', '🚙', '🛵', '💰', '💸', '🎉', '🔥',
  '⚡', '✅', '⏰', '🚨', '📍', '🛣️', '⭐', '❤️',
  '👏', '🙌', '💬', '📢', '🔔', '🎁', '👋', '🛡️'
];

const EVENT_OPTIONS: { value: PushTriggerEvent; label: string; hint: string }[] = [
  { value: 'new_ride', label: 'Nova corrida solicitada', hint: 'Disparado assim que o passageiro cria um pedido' },
  { value: 'ride_confirmed', label: 'Corrida aceita / confirmada', hint: 'Quando o motorista ou central confirma a viagem' },
  { value: 'driver_on_way', label: 'Motorista a caminho (GPS)', hint: 'Quando o motorista inicia o deslocamento até o embarque' },
  { value: 'ride_in_progress', label: 'Viagem iniciada (Embarque)', hint: 'Quando o passageiro entra no veículo e a corrida começa' },
  { value: 'ride_finished', label: 'Viagem finalizada', hint: 'Quando a corrida é encerrada no destino' },
  { value: 'ride_cancelled', label: 'Corrida cancelada', hint: 'Quando a viagem é cancelada por qualquer parte' },
  { value: 'pix_paid', label: 'PIX confirmado no gateway', hint: 'Quando o webhook confirma pagamento instantâneo PIX' },
  { value: 'payment_approved', label: 'Pagamento aprovado / liquidado', hint: 'Quando o recebimento da corrida é validado' },
  { value: 'reminder', label: 'Lembrete pré-viagem agendada', hint: 'Antes do horário de embarque de uma reserva' },
];

const AUDIENCE_META: Record<PushAudience, { label: string; short: string; bg: string; color: string; border: string }> = {
  cliente:   { label: 'Somente Passageiros',    short: 'Passageiro', bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  motorista: { label: 'Somente Motoristas',     short: 'Motorista',  bg: '#ECFDF5', color: '#047857', border: '#A7F3D0' },
  ambos:     { label: 'Passageiros + Motoristas', short: 'Ambos',    bg: '#F5F3FF', color: '#6D28D9', border: '#DDD6FE' },
  admin:     { label: 'Admin Master',           short: 'Admin',      bg: '#F1F5F9', color: '#0F172A', border: '#CBD5E1' },
};

export const DEFAULT_PUSH_TEMPLATES: Record<string, PushTemplate> = {
  admin_new_ride:        { enabled: true, audience: 'admin',     event: 'new_ride',         title: '🚗 Nova corrida agendada', message: '{cliente} agendou para {data} às {hora} • {valor}' },
  admin_ride_cancelled:  { enabled: true, audience: 'admin',     event: 'ride_cancelled',   title: '❌ Corrida cancelada',      message: '{id} de {cliente} ({data} às {hora}) foi cancelada' },
  admin_pix_paid:        { enabled: true, audience: 'admin',     event: 'pix_paid',         title: '💰 PIX recebido',          message: '{cliente} pagou {valor} via PIX • {id}' },
  admin_payment_pending: { enabled: true, audience: 'admin',     event: 'new_ride',         title: '🧾 Pagamento pendente',    message: '{cliente} vai pagar {valor} em {pagamento} • aprove após receber' },
  driver_new_ride:       { enabled: true, audience: 'motorista', event: 'new_ride',         title: '🚗 Nova corrida disponível!', message: '{cliente} solicitou viagem de {origem} para {destino} • {valor}' },
  client_ride_booked:    { enabled: true, audience: 'cliente',   event: 'new_ride',         title: '✅ Corrida agendada',       message: 'Sua corrida {id} está marcada para {data} às {hora}.' },
  client_ride_confirmed: { enabled: true, audience: 'cliente',   event: 'ride_confirmed',   title: '✅ Corrida confirmada!',     message: 'Sua corrida {id} para {data} às {hora} foi confirmada pelo motorista!' },
  client_ride_started:   { enabled: true, audience: 'cliente',   event: 'driver_on_way',    title: '🚗 Motorista a caminho!',   message: '{motorista} iniciou o deslocamento até você ({origem}). Acompanhe no GPS ao vivo!' },
  client_ride_in_progress:{ enabled: true, audience: 'cliente',  event: 'ride_in_progress', title: '🚀 Viagem iniciada!',       message: 'Embarque realizado! Sua corrida {id} rumo a {destino} está em andamento.' },
  client_ride_finished:  { enabled: true, audience: 'cliente',   event: 'ride_finished',    title: '🏁 Viagem concluída!',      message: 'Sua corrida {id} foi finalizada com sucesso. Obrigado por viajar com a Kavro Drive!' },
  client_ride_cancelled: { enabled: true, audience: 'cliente',   event: 'ride_cancelled',   title: '❌ Corrida cancelada',      message: 'Sua corrida {id} de {data} às {hora} foi cancelada.' },
  client_payment_approved:{ enabled: true, audience: 'cliente',  event: 'payment_approved', title: '✅ Pagamento aprovado',    message: 'Recebemos seu pagamento de {valor} ({pagamento}). Obrigado!' },
  client_pix_approved:   { enabled: true, audience: 'cliente',   event: 'pix_paid',         title: '✅ PIX confirmado',         message: 'Seu PIX de {valor} foi confirmado automaticamente. Corrida {id} garantida!' },
  client_reminder:       { enabled: true, audience: 'cliente',   event: 'reminder',         title: '⏰ Sua corrida é em {minutos} min', message: 'Embarque às {hora} em {origem}. Esteja pronto!', minutesBefore: 30 },
};

const BUILTIN_LABELS: Record<string, string> = {
  admin_new_ride: 'Nova corrida solicitada na plataforma',
  admin_ride_cancelled: 'Corrida cancelada',
  admin_pix_paid: 'Liquidação PIX confirmada (Webhook)',
  admin_payment_pending: 'Cobrança em dinheiro ou cartão',
  driver_new_ride: 'Chamado de nova corrida disponível',
  client_ride_booked: 'Confirmação de solicitação de viagem',
  client_ride_confirmed: 'Motorista confirmou a corrida',
  client_ride_started: 'Motorista parceiro a caminho (GPS)',
  client_ride_in_progress: 'Viagem iniciada (embarque realizado)',
  client_ride_finished: 'Viagem concluída com recibo',
  client_ride_cancelled: 'Aviso de cancelamento de viagem',
  client_payment_approved: 'Recibo de pagamento confirmado',
  client_pix_approved: 'Confirmação imediata de PIX',
  client_reminder: 'Lembrete pré-viagem agendada',
};

const VARIABLES = ['{cliente}', '{motorista}', '{valor}', '{origem}', '{destino}', '{pagamento}', '{data}', '{hora}', '{id}'];

interface Props {
  value?: Record<string, PushTemplate>;
  onChange: (next: Record<string, PushTemplate>) => void;
  onPersist?: (next: Record<string, PushTemplate>) => Promise<void> | void;
}

const ToggleSwitch: React.FC<{ checked: boolean; onClick: (e: React.MouseEvent) => void }> = ({ checked, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={checked}
    style={{
      width: 38,
      height: 22,
      borderRadius: 999,
      padding: 2,
      border: 'none',
      cursor: 'pointer',
      backgroundColor: checked ? '#0F172A' : '#CBD5E1',
      display: 'flex',
      alignItems: 'center',
      justifyContent: checked ? 'flex-end' : 'flex-start',
      transition: 'background-color 0.2s ease',
      flexShrink: 0,
    }}
  >
    <span style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: '#FFFFFF', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
  </button>
);

export const PushTemplatesEditor: React.FC<Props> = ({ value, onChange, onPersist }) => {
  const templates = useMemo(() => {
    const merged: Record<string, PushTemplate> = {};
    for (const [k, def] of Object.entries(DEFAULT_PUSH_TEMPLATES)) {
      merged[k] = { ...def, ...(value?.[k] || {}) };
    }
    for (const [k, tpl] of Object.entries(value || {})) {
      if (!DEFAULT_PUSH_TEMPLATES[k] && tpl) {
        merged[k] = {
          ...tpl,
          enabled: tpl.enabled ?? true,
          audience: tpl.audience || 'cliente',
          event: tpl.event || 'new_ride',
          isCustom: tpl.isCustom ?? true,
        };
      }
    }
    return merged;
  }, [value]);

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<string>(PushService.permission());
  const [enabling, setEnabling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // ===== Estado: Disparo Manual (Broadcast) =====
  const [broadcastAudience, setBroadcastAudience] = useState<PushAudience>('ambos');
  const [broadcastTitle, setBroadcastTitle] = useState('🚗 Novidade na Kavro Drive!');
  const [broadcastMessage, setBroadcastMessage] = useState('Aproveite corridas rápidas, seguras e com tarifa justa hoje mesmo.');
  const [broadcastUrl, setBroadcastUrl] = useState<string>('');
  const [broadcastFocus, setBroadcastFocus] = useState<'title' | 'message'>('message');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const broadcastTitleRef = useRef<HTMLInputElement | null>(null);
  const broadcastMsgRef = useRef<HTMLTextAreaElement | null>(null);

  // ===== Estado: Criador de Novo Gatilho Automático =====
  const [showCreator, setShowCreator] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newEvent, setNewEvent] = useState<PushTriggerEvent>('new_ride');
  const [newAudience, setNewAudience] = useState<PushAudience>('motorista');
  const [newTitle, setNewTitle] = useState('⚡ Nova oportunidade de viagem!');
  const [newMessage, setNewMessage] = useState('{cliente} solicitou corrida de {origem} para {destino} ({valor}).');
  const [newFocus, setNewFocus] = useState<'title' | 'message'>('message');
  const [savingCreator, setSavingCreator] = useState(false);

  const customEntries = Object.entries(templates).filter(([, t]) => Boolean(t.isCustom));
  const adminEntries = Object.entries(templates).filter(([, t]) => !t.isCustom && t.audience === 'admin');
  const driverEntries = Object.entries(templates).filter(([, t]) => !t.isCustom && t.audience === 'motorista');
  const clientEntries = Object.entries(templates).filter(([, t]) => !t.isCustom && (t.audience || 'cliente') === 'cliente');

  const updateTemplate = (key: string, patch: Partial<PushTemplate>) => {
    onChange({
      ...templates,
      [key]: { ...templates[key], ...patch },
    });
  };

  const deleteCustomTemplate = async (key: string) => {
    const next = { ...templates };
    delete next[key];
    onChange(next);
    if (openKey === key) setOpenKey(null);
    if (onPersist) {
      await onPersist(next);
    }
    setStatusFeedback({ type: 'ok', text: 'Gatilho personalizado removido.' });
  };

  const handleEnableDevice = async () => {
    setEnabling(true);
    setStatusFeedback(null);
    const res = await PushService.enable('admin', null);
    setNotifPermission(PushService.permission());
    setEnabling(false);
    setStatusFeedback(
      res.ok
        ? { type: 'ok', text: 'Navegador conectado à Torre de Notificações Admin Master.' }
        : { type: 'err', text: 'Permissão negada ou bloqueada pelo navegador.' }
    );
  };

  const handleTest = async () => {
    setTesting(true);
    setStatusFeedback(null);
    try {
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': StorageService.getAdminPin(),
        },
        body: JSON.stringify({
          title: '🔔 Teste Kavro Drive',
          message: 'Notificações Admin Master ativas em tempo real.',
        }),
      });
      const data = await res.json();
      setStatusFeedback(
        res.ok && data.ok
          ? { type: 'ok', text: 'Notificação de teste disparada! Verifique os alertas deste navegador.' }
          : { type: 'err', text: data.error || 'Nenhum navegador Admin inscrito ainda. Clique em "Receber Alertas neste Navegador".' }
      );
    } catch {
      setStatusFeedback({ type: 'err', text: 'Falha de comunicação ao disparar teste.' });
    }
    setTesting(false);
  };

  const insertEmojiIntoBroadcast = (emoji: string) => {
    if (broadcastFocus === 'title') {
      setBroadcastTitle(prev => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${emoji}`);
      broadcastTitleRef.current?.focus();
    } else {
      setBroadcastMessage(prev => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${emoji}`);
      broadcastMsgRef.current?.focus();
    }
  };

  const insertEmojiIntoCreator = (emoji: string) => {
    if (newFocus === 'title') {
      setNewTitle(prev => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${emoji}`);
    } else {
      setNewMessage(prev => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${emoji}`);
    }
  };

  const handleSendBroadcast = async () => {
    if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
      setStatusFeedback({ type: 'err', text: 'Preencha o título e a mensagem da notificação antes de enviar.' });
      return;
    }
    setSendingBroadcast(true);
    setStatusFeedback(null);
    try {
      const res = await fetch('/api/push/broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': StorageService.getAdminPin(),
        },
        body: JSON.stringify({
          audience: broadcastAudience,
          title: broadcastTitle.trim(),
          message: broadcastMessage.trim(),
          url: broadcastUrl || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setStatusFeedback({
          type: 'ok',
          text: `Notificação enviada via OneSignal para ${AUDIENCE_META[broadcastAudience].label} (${data.targetedIdsCount || 0} IDs segmentados).`,
        });
      } else {
        setStatusFeedback({
          type: 'err',
          text: data.error || 'O gateway OneSignal não encontrou dispositivos inscritos para este público ainda.',
        });
      }
    } catch {
      setStatusFeedback({ type: 'err', text: 'Erro de conexão ao disparar notificação.' });
    }
    setSendingBroadcast(false);
  };

  const handleCreateTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newMessage.trim()) {
      setStatusFeedback({ type: 'err', text: 'Informe o título e o texto do novo gatilho.' });
      return;
    }
    setSavingCreator(true);
    const id = `custom_${Date.now()}`;
    const eventInfo = EVENT_OPTIONS.find(o => o.value === newEvent);
    const created: PushTemplate = {
      enabled: true,
      isCustom: true,
      event: newEvent,
      audience: newAudience,
      label: newLabel.trim() || `${eventInfo?.label || 'Gatilho'} (${AUDIENCE_META[newAudience].short})`,
      title: newTitle.trim(),
      message: newMessage.trim(),
    };
    const next = { ...templates, [id]: created };
    onChange(next);
    if (onPersist) {
      await onPersist(next);
    }
    setSavingCreator(false);
    setShowCreator(false);
    setNewLabel('');
    setOpenKey(id);
    setStatusFeedback({ type: 'ok', text: `Novo gatilho "${created.label}" criado e salvo com sucesso!` });
  };

  const renderTemplateRow = (key: string, t: PushTemplate) => {
    const isOpen = openKey === key;
    const isReminder = key === 'client_reminder' || t.event === 'reminder';
    const aud = (t.audience || 'cliente') as PushAudience;
    const audBadge = AUDIENCE_META[aud] || AUDIENCE_META.cliente;
    const eventInfo = EVENT_OPTIONS.find(ev => ev.value === t.event);
    const displayLabel = t.label || BUILTIN_LABELS[key] || key;

    return (
      <div
        key={key}
        style={{
          backgroundColor: '#FFFFFF',
          border: `1px solid ${isOpen ? '#0F172A' : '#E2E8F0'}`,
          borderRadius: 10,
          overflow: 'hidden',
          opacity: t.enabled ? 1 : 0.68,
          transition: 'border-color 0.15s ease',
        }}
      >
        <div
          onClick={() => setOpenKey(isOpen ? null : key)}
          style={{
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            cursor: 'pointer',
            backgroundColor: isOpen ? '#F8FAFC' : '#FFFFFF',
          }}
        >
          <ToggleSwitch
            checked={t.enabled}
            onClick={(e) => {
              e.stopPropagation();
              updateTemplate(key, { enabled: !t.enabled });
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A' }}>
                {displayLabel}
              </span>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 999,
                  backgroundColor: audBadge.bg,
                  color: audBadge.color,
                  border: `1px solid ${audBadge.border}`,
                }}
              >
                {audBadge.short}
              </span>
              {t.isCustom && (
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 999,
                    backgroundColor: '#FEF3C7',
                    color: '#92400E',
                    border: '1px solid #FDE68A',
                  }}
                >
                  Personalizado • {eventInfo?.label || t.event}
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <strong style={{ color: '#334155', fontWeight: 600 }}>{t.title}</strong> — {t.message}
            </div>
          </div>
          {t.isCustom && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                deleteCustomTemplate(key);
              }}
              title="Excluir gatilho personalizado"
              style={{
                padding: '6px 8px',
                borderRadius: 8,
                border: '1px solid #FECACA',
                backgroundColor: '#FEF2F2',
                color: '#DC2626',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <Trash2 size={14} />
            </button>
          )}
          {isOpen ? <ChevronUp size={16} color="#64748B" /> : <ChevronDown size={16} color="#64748B" />}
        </div>

        {isOpen && (
          <div style={{ padding: '14px 16px', borderTop: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Público-alvo (Quem recebe)
                </label>
                <select
                  value={aud}
                  onChange={e => updateTemplate(key, { audience: e.target.value as PushAudience })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#0F172A', fontSize: '0.82rem', fontWeight: 600 }}
                >
                  <option value="cliente">Somente Passageiro</option>
                  <option value="motorista">Somente Motorista</option>
                  <option value="ambos">Passageiro + Motorista</option>
                  <option value="admin">Admin Master</option>
                </select>
              </div>
              {t.isCustom && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    Evento de Disparo
                  </label>
                  <select
                    value={t.event || 'new_ride'}
                    onChange={e => updateTemplate(key, { event: e.target.value as PushTriggerEvent })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#0F172A', fontSize: '0.82rem', fontWeight: 600 }}
                  >
                    {EVENT_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                Título da Notificação
              </label>
              <input
                type="text"
                value={t.title}
                onChange={e => updateTemplate(key, { title: e.target.value })}
                style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#0F172A', fontSize: '0.84rem', fontWeight: 500, boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                Corpo da Mensagem
              </label>
              <textarea
                rows={2}
                value={t.message}
                onChange={e => updateTemplate(key, { message: e.target.value })}
                style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#0F172A', fontSize: '0.83rem', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>

            {isReminder && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569' }}>
                  Antecedência do disparo:
                </label>
                <input
                  type="number"
                  min={5}
                  max={180}
                  value={t.minutesBefore ?? 30}
                  onChange={e => updateTemplate(key, { minutesBefore: Number(e.target.value) })}
                  style={{ width: 72, padding: '6px 8px', borderRadius: 8, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#0F172A', fontSize: '0.82rem', textAlign: 'center', fontWeight: 600 }}
                />
                <span style={{ fontSize: '0.74rem', color: '#64748B' }}>minutos antes do embarque</span>
              </div>
            )}

            {/* Barra de Emojis + Variáveis Dinâmicas */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Smile size={13} /> Emojis:
                </span>
                {QUICK_EMOJIS.slice(0, 14).map(em => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => updateTemplate(key, { message: `${t.message}${t.message && !t.message.endsWith(' ') ? ' ' : ''}${em}` })}
                    style={{
                      padding: '2px 6px',
                      borderRadius: 6,
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                    }}
                  >
                    {em}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700 }}>Variáveis:</span>
                {VARIABLES.map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => updateTemplate(key, { message: `${t.message}${t.message && !t.message.endsWith(' ') ? ' ' : ''}${v}` })}
                    style={{
                      fontSize: '0.71rem',
                      padding: '2px 8px',
                      borderRadius: 6,
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      color: '#334155',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Barra de Status do Dispositivo + Feedback */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 12,
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 14,
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
            <BellRing size={18} color="#0F172A" />
            Central de Notificações Web Push & Gatilhos (OneSignal)
          </h3>
          <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>
            Envie avisos manuais segmentados com emojis e crie regras automáticas para Passageiros, Motoristas ou Admin Master.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleEnableDevice}
            disabled={enabling}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #CBD5E1',
              backgroundColor: notifPermission === 'granted' ? '#F0FDF4' : '#FFFFFF',
              color: notifPermission === 'granted' ? '#166534' : '#0F172A',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: enabling ? 'not-allowed' : 'pointer',
            }}
          >
            {enabling ? <Loader2 size={15} className="animate-spin" /> : notifPermission === 'granted' ? <Check size={15} /> : <Bell size={15} />}
            {notifPermission === 'granted' ? 'Alertas Ativos neste Navegador' : 'Receber Alertas neste Navegador'}
          </button>

          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #E2E8F0',
              backgroundColor: '#F8FAFC',
              color: '#0F172A',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: testing ? 'not-allowed' : 'pointer',
            }}
          >
            {testing ? <Loader2 size={15} className="animate-spin" /> : <Send size={14} />}
            Disparar Teste Admin
          </button>
        </div>
      </div>

      {statusFeedback && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 10,
            fontSize: '0.83rem',
            fontWeight: 600,
            backgroundColor: statusFeedback.type === 'ok' ? '#ECFDF5' : '#FEF2F2',
            border: `1px solid ${statusFeedback.type === 'ok' ? '#A7F3D0' : '#FECACA'}`,
            color: statusFeedback.type === 'ok' ? '#065F46' : '#B91C1C',
          }}
        >
          {statusFeedback.text}
        </div>
      )}

      {/* BLOCO 1: DISPARO MANUAL COM EMOJIS & SEGMENTAÇÃO */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 12,
          padding: 20,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 20,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 7 }}>
                <Send size={16} color="#0F172A" />
                Enviar Notificação Manual (Broadcast)
              </h4>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                Escreva uma mensagem, escolha os emojis, defina o público e envie agora.
              </p>
            </div>
          </div>

          {/* Seletor de Público */}
          <div>
            <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
              Enviar para qual público?
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
              {([
                { id: 'cliente', label: 'Somente Passageiros', icon: Users },
                { id: 'motorista', label: 'Somente Motoristas', icon: Car },
                { id: 'ambos', label: 'Passageiros + Motoristas', icon: Globe },
                { id: 'admin', label: 'Admin Master', icon: ShieldCheck },
              ] as { id: PushAudience; label: string; icon: React.ComponentType<{ size?: number }> }[]).map(opt => {
                const Icon = opt.icon;
                const active = broadcastAudience === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setBroadcastAudience(opt.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 7,
                      padding: '9px 10px',
                      borderRadius: 8,
                      border: `1.5px solid ${active ? '#0F172A' : '#E2E8F0'}`,
                      backgroundColor: active ? '#0F172A' : '#F8FAFC',
                      color: active ? '#FFFFFF' : '#334155',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <Icon size={14} />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Título e Mensagem */}
          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
              Título da Notificação
            </label>
            <input
              ref={broadcastTitleRef}
              type="text"
              value={broadcastTitle}
              onFocus={() => setBroadcastFocus('title')}
              onChange={e => setBroadcastTitle(e.target.value)}
              placeholder="Ex: 🔥 Tarifa especial hoje na Kavro Drive!"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                fontSize: '0.86rem',
                fontWeight: 600,
                color: '#0F172A',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
              Mensagem
            </label>
            <textarea
              ref={broadcastMsgRef}
              rows={3}
              value={broadcastMessage}
              onFocus={() => setBroadcastFocus('message')}
              onChange={e => setBroadcastMessage(e.target.value)}
              placeholder="Digite o comunicado que aparecerá na tela do celular/PC..."
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                fontSize: '0.84rem',
                color: '#0F172A',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Seletor de Emojis Clicável */}
          <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Smile size={14} />
              Clique em um Emoji para inserir ({broadcastFocus === 'title' ? 'no Título' : 'na Mensagem'}):
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {QUICK_EMOJIS.map(em => (
                <button
                  key={em}
                  type="button"
                  onClick={() => insertEmojiIntoBroadcast(em)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 7,
                    border: '1px solid #E2E8F0',
                    backgroundColor: '#FFFFFF',
                    fontSize: '1.05rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Coluna Direita: Destino do clique + Preview ao vivo + Botão Enviar */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14, backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Pré-visualização em Tempo Real
            </div>

            <div
              style={{
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                borderRadius: 12,
                padding: '14px 16px',
                boxShadow: '0 8px 20px rgba(15,23,42,0.16)',
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
              }}
            >
              <div style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: '#1E293B', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 900, fontSize: '0.95rem', color: '#FFFFFF' }}>
                K
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 700 }}>
                    KAVRO DRIVE • {AUDIENCE_META[broadcastAudience].short.toUpperCase()}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: '#64748B' }}>agora</span>
                </div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#FFFFFF', marginTop: 3, wordBreak: 'break-word' }}>
                  {broadcastTitle || 'Título da notificação'}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#CBD5E1', marginTop: 2, lineHeight: 1.4, wordBreak: 'break-word' }}>
                  {broadcastMessage || 'Mensagem da notificação...'}
                </div>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                Abrir qual página ao clicar na notificação?
              </label>
              <select
                value={broadcastUrl}
                onChange={e => setBroadcastUrl(e.target.value)}
                style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#0F172A', fontSize: '0.82rem', fontWeight: 600 }}
              >
                <option value="">Automático conforme o público selecionado</option>
                <option value="/cliente">App do Passageiro (/cliente)</option>
                <option value="/kavro-drive">Portal do Motorista (/kavro-drive)</option>
                <option value="/">Página Inicial Kavro Drive (/)</option>
                <option value="/administracion">Painel Admin Master (/administracion)</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSendBroadcast}
            disabled={sendingBroadcast}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 10,
              border: 'none',
              backgroundColor: '#0F172A',
              color: '#FFFFFF',
              fontSize: '0.88rem',
              fontWeight: 700,
              cursor: sendingBroadcast ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {sendingBroadcast ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {sendingBroadcast ? 'Enviando notificação...' : `Enviar Notificação para ${AUDIENCE_META[broadcastAudience].label}`}
          </button>
        </div>
      </div>

      {/* BLOCO 2: CRIADOR DE NOVOS GATILHOS AUTOMÁTICOS */}
      <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 7 }}>
              <Sparkles size={16} color="#0F172A" />
              Gatilhos Automáticos por Evento ({Object.keys(templates).length} configurados)
            </h4>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
              Crie novos gatilhos escolhendo o evento da corrida e decidindo se dispara para Motorista, Passageiro ou Ambos.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreator(prev => !prev)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '9px 15px',
              borderRadius: 8,
              border: showCreator ? '1px solid #CBD5E1' : 'none',
              backgroundColor: showCreator ? '#F8FAFC' : '#0F172A',
              color: showCreator ? '#0F172A' : '#FFFFFF',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Plus size={15} />
            {showCreator ? 'Fechar Criador' : 'Novo Gatilho Automático'}
          </button>
        </div>

        {showCreator && (
          <form
            onSubmit={handleCreateTrigger}
            style={{
              marginTop: 16,
              padding: 16,
              borderRadius: 10,
              backgroundColor: '#F8FAFC',
              border: '1px solid #CBD5E1',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Nome identificador do gatilho
                </label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  placeholder="Ex: Alerta VIP para motorista ao concluir"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', fontSize: '0.83rem', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Quando disparar (Evento)
                </label>
                <select
                  value={newEvent}
                  onChange={e => setNewEvent(e.target.value as PushTriggerEvent)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', fontSize: '0.83rem', fontWeight: 600 }}
                >
                  {EVENT_OPTIONS.map(ev => (
                    <option key={ev.value} value={ev.value}>{ev.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Quem recebe este gatilho?
                </label>
                <select
                  value={newAudience}
                  onChange={e => setNewAudience(e.target.value as PushAudience)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', fontSize: '0.83rem', fontWeight: 600 }}
                >
                  <option value="motorista">Somente Motorista</option>
                  <option value="cliente">Somente Passageiro</option>
                  <option value="ambos">Passageiro + Motorista</option>
                  <option value="admin">Admin Master</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Título da Notificação
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onFocus={() => setNewFocus('title')}
                  onChange={e => setNewTitle(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', fontSize: '0.84rem', fontWeight: 600, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Texto da Mensagem
                </label>
                <input
                  type="text"
                  value={newMessage}
                  onFocus={() => setNewFocus('message')}
                  onChange={e => setNewMessage(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', fontSize: '0.84rem', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.71rem', color: '#475569', fontWeight: 700 }}>Emojis:</span>
              {QUICK_EMOJIS.slice(0, 14).map(em => (
                <button
                  key={em}
                  type="button"
                  onClick={() => insertEmojiIntoCreator(em)}
                  style={{ padding: '3px 6px', borderRadius: 6, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', cursor: 'pointer', fontSize: '0.9rem' }}
                >
                  {em}
                </button>
              ))}
              <span style={{ fontSize: '0.71rem', color: '#475569', fontWeight: 700, marginLeft: 8 }}>Variáveis:</span>
              {VARIABLES.slice(0, 6).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setNewMessage(prev => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${v}`)}
                  style={{ padding: '2px 7px', borderRadius: 6, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', cursor: 'pointer', fontSize: '0.71rem', fontWeight: 600, color: '#334155' }}
                >
                  {v}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowCreator(false)}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#334155', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingCreator}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', backgroundColor: '#0F172A', color: '#FFFFFF', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {savingCreator ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Criar & Ativar Gatilho
              </button>
            </div>
          </form>
        )}

        {/* Listagem Agrupada dos Gatilhos */}
        {customEntries.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Gatilhos Personalizados Criados por Você ({customEntries.length})
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 10 }}>
              {customEntries.map(([k, t]) => renderTemplateRow(k, t))}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18, marginTop: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Torre Admin Master & Motoristas Parceiros
            </div>
            {adminEntries.map(([k, t]) => renderTemplateRow(k, t))}
            {driverEntries.map(([k, t]) => renderTemplateRow(k, t))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Gatilhos Automáticos do Passageiro
            </div>
            {clientEntries.map(([k, t]) => renderTemplateRow(k, t))}
          </div>
        </div>
      </div>
    </div>
  );
};
