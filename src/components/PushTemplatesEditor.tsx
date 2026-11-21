import React, { useMemo, useRef, useState } from 'react';
import {
  Bell, BellRing, Send, Loader2, Check,
  Plus, Trash2, Users, Car, ShieldCheck, Globe, Smile,
  Edit3, Power, RotateCcw, BookmarkPlus, Smartphone
} from 'lucide-react';
import { ClientProfile, DriverProfile, NotificationItem, PushAudience, PushTemplate, PushTriggerEvent } from '../types';
import { PushService } from '../services/push';
import { StorageService } from '../services/storage';

const QUICK_EMOJIS = [
  '🚗', '🚕', '🚙', '🛵', '💰', '💸', '🎉', '🔥',
  '⚡', '✅', '⏰', '🚨', '📍', '🛣️', '⭐', '❤️',
  '👏', '🙌', '💬', '📢', '🔔', '🎁', '👋', '🛡️'
];

type PushWorkspaceArea = 'todos' | 'admin' | 'motorista' | 'cliente';
type ManualAudience =
  | 'todos'
  | 'cliente'
  | 'cliente_especifico'
  | 'motorista'
  | 'motorista_especifico'
  | 'ambos'
  | 'admin';

const EVENT_OPTIONS: { value: PushTriggerEvent; label: string; hint: string }[] = [
  { value: 'manual', label: 'Campanha / Envio Manual (Disparo quando quiser)', hint: 'Fica salvo na área para editar, ativar/desativar ou disparar manualmente' },
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

const AREA_CONFIG: Record<PushWorkspaceArea, {
  id: PushWorkspaceArea;
  title: string;
  shortTitle: string;
  subtitle: string;
  badgeText: string;
  accent: string;
  softBg: string;
  softBorder: string;
  defaultUrl: string;
  sampleMessage: string;
  defaultEventForNew: PushTriggerEvent;
  presets: { label: string; message: string }[];
  icon: React.ComponentType<{ size?: number; color?: string }>;
}> = {
  todos: {
    id: 'todos',
    title: 'Push para Todos',
    shortTitle: 'Para Todos',
    subtitle: 'Envie avisos gerais de uma só vez para Passageiros, Motoristas e Painel Master Donos.',
    badgeText: 'PARA TODOS',
    accent: '#6D28D9',
    softBg: '#F5F3FF',
    softBorder: '#DDD6FE',
    defaultUrl: '/',
    sampleMessage: 'Novidade na Kavro Drive! Aproveite viagens rápidas, seguras e atendimento verificado na sua região.',
    defaultEventForNew: 'manual',
    presets: [
      { label: '📢 Comunicado Geral', message: 'Aviso importante da Kavro Drive: operação funcionando 100% em toda a região!' },
      { label: '🎉 Novidade no App', message: 'Confira as novidades e melhorias do app Kavro Drive já disponíveis para você.' },
      { label: '⚡ Feriado / Plantão', message: 'Atendimento ativo 24h durante todo o feriado. Conte com a Kavro Drive!' },
    ],
    icon: Globe,
  },
  admin: {
    id: 'admin',
    title: 'Push para Painel Master Donos',
    shortTitle: 'Painel Donos',
    subtitle: 'Alertas operacionais, financeiros, novas corridas e comunicados exclusivos dos proprietários.',
    badgeText: 'PAINEL MASTER DONOS',
    accent: '#0F172A',
    softBg: '#F1F5F9',
    softBorder: '#CBD5E1',
    defaultUrl: '/administracion',
    sampleMessage: 'Alerta do Painel Master Donos: acompanhe o movimento de corridas, PIX e frota online em tempo real.',
    defaultEventForNew: 'new_ride',
    presets: [
      { label: '📊 Resumo Operacional', message: 'Confira os novos repasses PIX, cadastros e corridas em andamento no Painel Master.' },
      { label: '🚨 Atenção Donos', message: 'Existem pendências de aprovação documental ou alertas críticos aguardando revisão no Painel.' },
      { label: '💰 Caixa & Repasses', message: 'Movimentação financeira atualizada com sucesso no painel administrativo Kavro Drive.' },
    ],
    icon: ShieldCheck,
  },
  motorista: {
    id: 'motorista',
    title: 'Push para Motorista',
    shortTitle: 'Motorista',
    subtitle: 'Chamados de corridas, avisos de alta demanda, campanhas e notificações para toda a frota.',
    badgeText: 'MOTORISTA',
    accent: '#047857',
    softBg: '#ECFDF5',
    softBorder: '#A7F3D0',
    defaultUrl: '/kavro-drive',
    sampleMessage: 'Motorista parceiro, alta demanda de viagens agora na sua cidade! Fique online para receber chamadas.',
    defaultEventForNew: 'new_ride',
    presets: [
      { label: '⚡ Alta Demanda', message: 'Pico de solicitações na região agora! Fique online no Portal do Motorista.' },
      { label: '💸 Repasse Liberado', message: 'Seu repasse de corridas foi processado. Confira os detalhes no seu histórico financeiro.' },
      { label: '🛡️ Lembrete Frota', message: 'Mantenha seus documentos CRLV/CNH e foto do veículo sempre em dia no portal.' },
    ],
    icon: Car,
  },
  cliente: {
    id: 'cliente',
    title: 'Push para Passageiros',
    shortTitle: 'Passageiros',
    subtitle: 'Atualizações de viagem, confirmações de PIX, lembretes e promoções para clientes/passageiros.',
    badgeText: 'PASSAGEIROS',
    accent: '#1D4ED8',
    softBg: '#EFF6FF',
    softBorder: '#BFDBFE',
    defaultUrl: '/cliente',
    sampleMessage: 'Motoristas disponíveis perto de você! Abra o app Kavro Drive e peça sua viagem ou entrega com segurança.',
    defaultEventForNew: 'manual',
    presets: [
      { label: '🎁 Promoção', message: 'Condição especial hoje na Kavro Drive! Solicite sua corrida pelo app agora mesmo.' },
      { label: '🚗 Carros Perto', message: 'Temos motoristas disponíveis na sua região prontos para te atender em minutos!' },
      { label: '📦 Entregas', message: 'Precisa enviar uma encomenda rápida? Use a categoria Entregas direto no app!' },
    ],
    icon: Users,
  },
};

export const DEFAULT_PUSH_TEMPLATES: Record<string, PushTemplate> = {
  admin_new_ride:         { enabled: true, audience: 'admin',     event: 'new_ride',         title: 'Kavro Drive', message: '🚗 Nova corrida: {cliente} solicitou para {data} às {hora} • {valor}' },
  admin_ride_cancelled:   { enabled: true, audience: 'admin',     event: 'ride_cancelled',   title: 'Kavro Drive', message: '❌ Corrida {id} de {cliente} ({data} às {hora}) foi cancelada.' },
  admin_pix_paid:         { enabled: true, audience: 'admin',     event: 'pix_paid',         title: 'Kavro Drive', message: '💰 PIX recebido: {cliente} pagou {valor} • Corrida {id}.' },
  admin_payment_pending:  { enabled: true, audience: 'admin',     event: 'new_ride',         title: 'Kavro Drive', message: '🧾 Pagamento pendente: {cliente} vai pagar {valor} em {pagamento}.' },
  driver_new_ride:        { enabled: true, audience: 'motorista', event: 'new_ride',         title: 'Kavro Drive', message: '🚗 Nova corrida disponível! {cliente} • {origem} ➔ {destino} ({valor})' },
  client_ride_booked:     { enabled: true, audience: 'cliente',   event: 'new_ride',         title: 'Kavro Drive', message: '✅ Corrida {id} solicitada para {data} às {hora}. Aguardando confirmação!' },
  client_ride_confirmed:  { enabled: true, audience: 'cliente',   event: 'ride_confirmed',   title: 'Kavro Drive', message: '✅ Corrida {id} confirmada pelo motorista para {data} às {hora}!' },
  client_ride_started:    { enabled: true, audience: 'cliente',   event: 'driver_on_way',    title: 'Kavro Drive', message: '🚗 {motorista} iniciou o deslocamento até você ({origem}). Acompanhe no GPS!' },
  client_ride_in_progress:{ enabled: true, audience: 'cliente',   event: 'ride_in_progress', title: 'Kavro Drive', message: '🚀 Embarque realizado! Sua viagem {id} rumo a {destino} está em andamento.' },
  client_ride_finished:   { enabled: true, audience: 'cliente',   event: 'ride_finished',    title: 'Kavro Drive', message: '🏁 Viagem {id} concluída! Obrigado por viajar com a Kavro Drive.' },
  client_ride_cancelled:  { enabled: true, audience: 'cliente',   event: 'ride_cancelled',   title: 'Kavro Drive', message: '❌ Sua corrida {id} de {data} às {hora} foi cancelada.' },
  client_payment_approved:{ enabled: true, audience: 'cliente',   event: 'payment_approved', title: 'Kavro Drive', message: '✅ Pagamento aprovado de {valor} ({pagamento}). Obrigado!' },
  client_pix_approved:    { enabled: true, audience: 'cliente',   event: 'pix_paid',         title: 'Kavro Drive', message: '✅ PIX de {valor} confirmado automaticamente! Corrida {id} garantida.' },
  client_reminder:        { enabled: true, audience: 'cliente',   event: 'reminder',         title: 'Kavro Drive', message: '⏰ Sua corrida começa em {minutos} min ({hora} em {origem}). Esteja pronto!', minutesBefore: 30 },
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

function templateBelongsToArea(t: PushTemplate, area: PushWorkspaceArea): boolean {
  const aud = t.audience || 'cliente';
  if (area === 'todos') return aud === 'todos' || aud === 'ambos';
  return aud === area;
}

function areaToAudience(area: PushWorkspaceArea): PushAudience {
  if (area === 'todos') return 'todos';
  return area;
}

interface Props {
  value?: Record<string, PushTemplate>;
  clients?: ClientProfile[];
  drivers?: DriverProfile[];
  onChange: (next: Record<string, PushTemplate>) => void;
  onPersist?: (next: Record<string, PushTemplate>) => Promise<void> | void;
}

const ToggleSwitch: React.FC<{ checked: boolean; onClick: (e: React.MouseEvent) => void }> = ({ checked, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={checked}
    title={checked ? 'Clique para desativar' : 'Clique para ativar'}
    style={{
      width: 40,
      height: 22,
      borderRadius: 999,
      padding: 2,
      border: 'none',
      cursor: 'pointer',
      backgroundColor: checked ? '#10B981' : '#CBD5E1',
      display: 'flex',
      alignItems: 'center',
      justifyContent: checked ? 'flex-end' : 'flex-start',
      transition: 'background-color 0.2s ease',
      flexShrink: 0,
    }}
  >
    <span style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: '#FFFFFF', boxShadow: '0 1px 2px rgba(0,0,0,0.22)' }} />
  </button>
);

const PushPreviewCard: React.FC<{
  title: string;
  message: string;
  areaBadge: string;
}> = ({ title, message, areaBadge }) => {
  const [imgErr, setImgErr] = useState(false);
  return (
    <div
      style={{
        background: 'linear-gradient(145deg, #0F172A 0%, #1E293B 100%)',
        color: '#FFFFFF',
        borderRadius: 16,
        padding: '14px 16px',
        boxShadow: '0 10px 26px rgba(15, 23, 42, 0.22)',
        border: '1px solid rgba(255,255,255,0.12)',
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 11,
          backgroundColor: '#020617',
          border: '1px solid rgba(16, 185, 129, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          overflow: 'hidden',
          fontWeight: 900,
          fontSize: '1rem',
          color: '#10B981',
        }}
      >
        {!imgErr ? (
          <img
            src="/pwa-icon-192.png"
            alt="Kavro Drive"
            onError={() => setImgErr(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          'K'
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: '0.86rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title.trim() || 'Kavro Drive'}
            </span>
            <span
              style={{
                fontSize: '0.62rem',
                fontWeight: 800,
                padding: '1px 7px',
                borderRadius: 999,
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                color: '#6EE7B7',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                flexShrink: 0,
              }}
            >
              {areaBadge}
            </span>
          </div>
          <span style={{ fontSize: '0.68rem', color: '#94A3B8', flexShrink: 0 }}>agora</span>
        </div>
        <div style={{ fontSize: '0.82rem', color: '#E2E8F0', marginTop: 4, lineHeight: 1.45, wordBreak: 'break-word' }}>
          {message.trim() || 'Digite a mensagem que aparecerá aqui em formato de Push...'}
        </div>
      </div>
    </div>
  );
};

export const PushTemplatesEditor: React.FC<Props> = ({ value, clients = [], drivers = [], onChange, onPersist }) => {
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
          event: tpl.event || 'manual',
          isCustom: tpl.isCustom ?? true,
        };
      }
    }
    return merged;
  }, [value]);

  const [activeArea, setActiveArea] = useState<PushWorkspaceArea>('todos');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<string>(PushService.permission());
  const [enabling, setEnabling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // ===== Estado: Compositor da Área Selecionada =====
  const [targetSpecificMode, setTargetSpecificMode] = useState<'all' | 'specific'>('all');
  const [includeAdminInAll, setIncludeAdminInAll] = useState<boolean>(true);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [broadcastTitle, setBroadcastTitle] = useState('Kavro Drive');
  const [broadcastMessage, setBroadcastMessage] = useState(AREA_CONFIG.todos.sampleMessage);
  const [messageCustomized, setMessageCustomized] = useState(false);
  const [broadcastUrl, setBroadcastUrl] = useState<string>('');
  const [broadcastFocus, setBroadcastFocus] = useState<'title' | 'message'>('message');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [sentHistory, setSentHistory] = useState<NotificationItem[]>(() =>
    StorageService.getNotifications().filter(n => n.type === 'admin_broadcast').slice(0, 20)
  );
  const broadcastTitleRef = useRef<HTMLInputElement | null>(null);
  const broadcastMsgRef = useRef<HTMLTextAreaElement | null>(null);

  // ===== Estado: Criador de Novo Push dentro da Área =====
  const [showCreator, setShowCreator] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newEvent, setNewEvent] = useState<PushTriggerEvent>('manual');
  const [newAudience, setNewAudience] = useState<PushAudience>('todos');
  const [newTitle, setNewTitle] = useState('Kavro Drive');
  const [newMessage, setNewMessage] = useState(AREA_CONFIG.todos.sampleMessage);
  const [newFocus, setNewFocus] = useState<'title' | 'message'>('message');
  const [savingCreator, setSavingCreator] = useState(false);

  const areaMeta = AREA_CONFIG[activeArea];

  const handleSelectArea = (nextArea: PushWorkspaceArea) => {
    setActiveArea(nextArea);
    setTargetSpecificMode('all');
    setSelectedClientId('');
    setSelectedDriverId('');
    setBroadcastUrl('');
    setEditingKey(null);
    if (!messageCustomized) {
      setBroadcastMessage(AREA_CONFIG[nextArea].sampleMessage);
    }
    if (showCreator) {
      setNewAudience(areaToAudience(nextArea));
      setNewEvent(AREA_CONFIG[nextArea].defaultEventForNew);
      setNewMessage(AREA_CONFIG[nextArea].sampleMessage);
    }
  };

  const persistNextTemplates = async (next: Record<string, PushTemplate>, feedbackText?: string) => {
    onChange(next);
    if (onPersist) {
      await onPersist(next);
    }
    if (feedbackText) {
      setStatusFeedback({ type: 'ok', text: feedbackText });
    }
  };

  const updateTemplate = (key: string, patch: Partial<PushTemplate>) => {
    onChange({
      ...templates,
      [key]: { ...templates[key], ...patch },
    });
  };

  const toggleTemplateEnabled = async (key: string) => {
    const current = templates[key];
    if (!current) return;
    const nextEnabled = !current.enabled;
    const next = {
      ...templates,
      [key]: { ...current, enabled: nextEnabled },
    };
    setSavingId(key);
    await persistNextTemplates(
      next,
      nextEnabled ? 'Push ativado e salvo com sucesso.' : 'Push desativado — não será mais disparado até ser reativado.'
    );
    setSavingId(null);
  };

  const saveEditedTemplate = async (key: string) => {
    setSavingId(key);
    await persistNextTemplates(templates, 'Alterações do Push salvas com sucesso!');
    setSavingId(null);
    setEditingKey(null);
  };

  const restoreDefaultTemplate = async (key: string) => {
    const def = DEFAULT_PUSH_TEMPLATES[key];
    if (!def) return;
    const next = { ...templates, [key]: { ...def } };
    setSavingId(key);
    await persistNextTemplates(next, 'Modelo original Kavro Drive restaurado e salvo.');
    setSavingId(null);
  };

  const deleteCustomTemplate = async (key: string) => {
    const next = { ...templates };
    delete next[key];
    if (editingKey === key) setEditingKey(null);
    setSavingId(key);
    await persistNextTemplates(next, 'Push removido da área com sucesso.');
    setSavingId(null);
  };

  const openCreatorForActiveArea = () => {
    setNewAudience(areaToAudience(activeArea));
    setNewEvent(areaMeta.defaultEventForNew);
    setNewTitle('Kavro Drive');
    setNewMessage(areaMeta.sampleMessage);
    setNewLabel('');
    setShowCreator(true);
  };

  const handleEnableDevice = async () => {
    setEnabling(true);
    setStatusFeedback(null);
    const res = await PushService.enable('admin', null);
    setNotifPermission(PushService.permission());
    setEnabling(false);
    setStatusFeedback(
      res.ok
        ? { type: 'ok', text: 'Este dispositivo dos Donos (Painel Master) está conectado para receber Push!' }
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
          title: 'Kavro Drive',
          message: '🔔 Teste de Push do Painel Master Donos ativo em tempo real!',
        }),
      });
      const data = await res.json();
      setStatusFeedback(
        res.ok && data.ok
          ? { type: 'ok', text: 'Push de teste disparado para o Painel Master Donos!' }
          : { type: 'err', text: data.error || 'Nenhum navegador Admin inscrito ainda. Clique em "Ativar Push neste Aparelho".' }
      );
    } catch {
      setStatusFeedback({ type: 'err', text: 'Falha de comunicação ao disparar teste.' });
    }
    setTesting(false);
  };

  const resolveEffectiveBroadcastAudience = (): {
    audience: ManualAudience;
    includeAdmin: boolean;
    label: string;
  } => {
    if (activeArea === 'admin') {
      return { audience: 'admin', includeAdmin: true, label: 'Painel Master Donos' };
    }
    if (activeArea === 'motorista') {
      if (targetSpecificMode === 'specific') {
        const drv = drivers.find(d => d.id === selectedDriverId);
        return {
          audience: 'motorista_especifico',
          includeAdmin: false,
          label: drv ? `Motorista ${drv.name}` : 'Motorista Específico',
        };
      }
      return { audience: 'motorista', includeAdmin: false, label: 'Todos os Motoristas' };
    }
    if (activeArea === 'cliente') {
      if (targetSpecificMode === 'specific') {
        const cli = clients.find(c => c.id === selectedClientId);
        return {
          audience: 'cliente_especifico',
          includeAdmin: false,
          label: cli ? `Passageiro ${cli.name}` : 'Passageiro Específico',
        };
      }
      return { audience: 'cliente', includeAdmin: false, label: 'Todos os Passageiros' };
    }
    return {
      audience: includeAdminInAll ? 'todos' : 'ambos',
      includeAdmin: includeAdminInAll,
      label: includeAdminInAll
        ? 'Todos (Passageiros + Motoristas + Painel Master Donos)'
        : 'Todos os Passageiros e Motoristas',
    };
  };

  const sendManualPushNow = async (overrideTitle?: string, overrideMessage?: string, overrideUrl?: string) => {
    const titleToSend = (overrideTitle ?? broadcastTitle).trim() || 'Kavro Drive';
    const messageToSend = (overrideMessage ?? broadcastMessage).trim();
    if (!messageToSend) {
      setStatusFeedback({ type: 'err', text: 'Escreva a mensagem do Push antes de enviar.' });
      return;
    }
    const resolved = resolveEffectiveBroadcastAudience();
    if (resolved.audience === 'cliente_especifico' && !selectedClientId) {
      setStatusFeedback({ type: 'err', text: 'Selecione qual passageiro receberá o Push.' });
      return;
    }
    if (resolved.audience === 'motorista_especifico' && !selectedDriverId) {
      setStatusFeedback({ type: 'err', text: 'Selecione qual motorista receberá o Push.' });
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
          audience: resolved.audience,
          includeAdmin: resolved.includeAdmin,
          targetClientId: resolved.audience === 'cliente_especifico' ? selectedClientId : undefined,
          targetDriverId: resolved.audience === 'motorista_especifico' ? selectedDriverId : undefined,
          title: titleToSend,
          message: messageToSend,
          url: (overrideUrl ?? broadcastUrl) || areaMeta.defaultUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        if (data.notification) {
          setSentHistory(prev => [data.notification, ...prev].slice(0, 20));
        }
        const pushNote = data.pushSent
          ? ` • Web Push disparado (${data.targetedIdsCount || 0} destino(s))`
          : ' • Entregue no app (sininho + fila Push)';
        setStatusFeedback({
          type: 'ok',
          text: `Push "${titleToSend}" enviado para ${resolved.label}${pushNote}.`,
        });
      } else {
        setStatusFeedback({
          type: 'err',
          text: data.error || 'Não foi possível enviar o Push.',
        });
      }
    } catch {
      setStatusFeedback({ type: 'err', text: 'Erro de comunicação ao disparar Push.' });
    }
    setSendingBroadcast(false);
  };

  const saveComposerAsTemplate = async () => {
    const cleanMsg = broadcastMessage.trim();
    if (!cleanMsg) {
      setStatusFeedback({ type: 'err', text: 'Escreva uma mensagem primeiro para salvar como modelo nesta área.' });
      return;
    }
    const id = `custom_${Date.now()}`;
    const created: PushTemplate = {
      enabled: true,
      isCustom: true,
      event: 'manual',
      audience: areaToAudience(activeArea),
      label: `Push salvo (${areaMeta.shortTitle})`,
      title: broadcastTitle.trim() || 'Kavro Drive',
      message: cleanMsg,
      url: broadcastUrl || areaMeta.defaultUrl,
    };
    const next = { ...templates, [id]: created };
    await persistNextTemplates(next, `Push salvo na área "${areaMeta.title}"! Você pode editar, desativar ou enviar quando quiser.`);
    setEditingKey(id);
  };

  const handleCreateTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) {
      setStatusFeedback({ type: 'err', text: 'Escreva a mensagem do novo Push.' });
      return;
    }
    setSavingCreator(true);
    const id = `custom_${Date.now()}`;
    const eventInfo = EVENT_OPTIONS.find(o => o.value === newEvent);
    const targetAreaCfg = AREA_CONFIG[newAudience === 'ambos' || newAudience === 'todos' ? 'todos' : newAudience];
    const created: PushTemplate = {
      enabled: true,
      isCustom: true,
      event: newEvent,
      audience: newAudience,
      label: newLabel.trim() || `${newEvent === 'manual' ? 'Campanha Push' : eventInfo?.label || 'Push'} (${targetAreaCfg.shortTitle})`,
      title: newTitle.trim() || 'Kavro Drive',
      message: newMessage.trim(),
    };
    const next = { ...templates, [id]: created };
    await persistNextTemplates(next, `Novo Push "${created.label}" criado na área ${targetAreaCfg.title}!`);
    setSavingCreator(false);
    setShowCreator(false);
    setNewLabel('');
    setEditingKey(id);
  };

  const insertEmojiIntoBroadcast = (emoji: string) => {
    if (broadcastFocus === 'title') {
      setBroadcastTitle(prev => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${emoji}`);
      broadcastTitleRef.current?.focus();
    } else {
      setMessageCustomized(true);
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

  const areaCounts = useMemo(() => {
    const counts: Record<PushWorkspaceArea, { total: number; active: number }> = {
      todos: { total: 0, active: 0 },
      admin: { total: 0, active: 0 },
      motorista: { total: 0, active: 0 },
      cliente: { total: 0, active: 0 },
    };
    for (const t of Object.values(templates)) {
      (['todos', 'admin', 'motorista', 'cliente'] as PushWorkspaceArea[]).forEach((area) => {
        if (templateBelongsToArea(t, area)) {
          counts[area].total += 1;
          if (t.enabled) counts[area].active += 1;
        }
      });
    }
    return counts;
  }, [templates]);

  const activeAreaTemplates = useMemo(
    () => Object.entries(templates).filter(([, t]) => templateBelongsToArea(t, activeArea)),
    [templates, activeArea]
  );

  const areaSentHistory = useMemo(() => {
    return sentHistory.filter((item) => {
      const aud = item.audience || 'ambos';
      if (activeArea === 'todos') return aud === 'ambos' || aud === 'todos';
      return aud === activeArea;
    });
  }, [sentHistory, activeArea]);

  const effectiveTarget = resolveEffectiveBroadcastAudience();

  const renderTemplateCard = (key: string, t: PushTemplate) => {
    const isEditing = editingKey === key;
    const isBuiltIn = Boolean(DEFAULT_PUSH_TEMPLATES[key]);
    const isReminder = key === 'client_reminder' || t.event === 'reminder';
    const isManual = (t.event || 'manual') === 'manual';
    const hasVars = /\{[a-z_]+\}/i.test(t.message || '') || /\{[a-z_]+\}/i.test(t.title || '');
    const eventInfo = EVENT_OPTIONS.find(ev => ev.value === (t.event || 'manual'));
    const displayLabel = t.label || BUILTIN_LABELS[key] || 'Push Configurado';
    const aud = (t.audience || 'cliente') as PushAudience;
    const itemAreaKey: PushWorkspaceArea = aud === 'ambos' || aud === 'todos' ? 'todos' : aud;
    const itemArea = AREA_CONFIG[itemAreaKey] || AREA_CONFIG.cliente;

    return (
      <div
        key={key}
        style={{
          backgroundColor: '#FFFFFF',
          border: `1.5px solid ${isEditing ? '#0F172A' : t.enabled ? '#CBD5E1' : '#E2E8F0'}`,
          borderRadius: 12,
          overflow: 'hidden',
          opacity: t.enabled ? 1 : 0.72,
          transition: 'all 0.15s ease',
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            backgroundColor: isEditing ? '#F8FAFC' : '#FFFFFF',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: '1 1 300px', minWidth: 0 }}>
            <div style={{ paddingTop: 2 }}>
              <ToggleSwitch
                checked={t.enabled}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTemplateEnabled(key);
                }}
              />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>
                  {displayLabel}
                </span>
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 999,
                    backgroundColor: t.enabled ? '#DCFCE7' : '#F1F5F9',
                    color: t.enabled ? '#166534' : '#64748B',
                    border: `1px solid ${t.enabled ? '#86EFAC' : '#CBD5E1'}`,
                  }}
                >
                  {t.enabled ? 'Ativo' : 'Desativado'}
                </span>
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 999,
                    backgroundColor: isManual ? '#FEF3C7' : itemArea.softBg,
                    color: isManual ? '#92400E' : itemArea.accent,
                    border: `1px solid ${isManual ? '#FDE68A' : itemArea.softBorder}`,
                  }}
                >
                  {isManual ? 'Campanha / Manual' : `Auto • ${eventInfo?.label || t.event}`}
                </span>
              </div>

              <div
                style={{
                  marginTop: 7,
                  padding: '8px 11px',
                  borderRadius: 9,
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  fontSize: '0.78rem',
                  color: '#334155',
                  lineHeight: 1.4,
                }}
              >
                <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.77rem' }}>
                  {t.title || 'Kavro Drive'}
                </div>
                <div style={{ marginTop: 2, color: '#475569' }}>{t.message}</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => toggleTemplateEnabled(key)}
              disabled={savingId === key}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '7px 11px',
                borderRadius: 8,
                border: `1px solid ${t.enabled ? '#FCA5A5' : '#86EFAC'}`,
                backgroundColor: t.enabled ? '#FEF2F2' : '#F0FDF4',
                color: t.enabled ? '#B91C1C' : '#15803D',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Power size={13} />
              {t.enabled ? 'Desativar' : 'Ativar'}
            </button>

            <button
              type="button"
              onClick={() => setEditingKey(isEditing ? null : key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '7px 11px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                backgroundColor: isEditing ? '#0F172A' : '#FFFFFF',
                color: isEditing ? '#FFFFFF' : '#0F172A',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Edit3 size={13} />
              {isEditing ? 'Fechar Editor' : 'Editar'}
            </button>

            {(!hasVars || isManual) && (
              <button
                type="button"
                disabled={sendingBroadcast}
                onClick={() => {
                  setBroadcastTitle(t.title || 'Kavro Drive');
                  setMessageCustomized(true);
                  setBroadcastMessage(t.message);
                  sendManualPushNow(t.title || 'Kavro Drive', t.message, t.url);
                }}
                title="Enviar este Push agora para esta área"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '7px 11px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: '#0F172A',
                  color: '#FFFFFF',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: sendingBroadcast ? 'not-allowed' : 'pointer',
                }}
              >
                <Send size={13} />
                Enviar Agora
              </button>
            )}

            {t.isCustom && (
              <button
                type="button"
                onClick={() => deleteCustomTemplate(key)}
                title="Excluir Push"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '7px 10px',
                  borderRadius: 8,
                  border: '1px solid #FECACA',
                  backgroundColor: '#FFF1F2',
                  color: '#DC2626',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={13} />
                Excluir
              </button>
            )}
          </div>
        </div>

        {isEditing && (
          <div style={{ padding: '16px', borderTop: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Nome identificador do Push
                </label>
                <input
                  type="text"
                  value={t.label ?? BUILTIN_LABELS[key] ?? ''}
                  onChange={e => updateTemplate(key, { label: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#0F172A', fontSize: '0.82rem', fontWeight: 600, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Área de Destino
                </label>
                <select
                  value={aud === 'ambos' ? 'todos' : aud}
                  onChange={e => updateTemplate(key, { audience: e.target.value as PushAudience })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#0F172A', fontSize: '0.82rem', fontWeight: 600 }}
                >
                  <option value="todos">Push para Todos</option>
                  <option value="admin">Painel Master Donos</option>
                  <option value="motorista">Motorista</option>
                  <option value="cliente">Passageiros</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Modo / Evento de Disparo
                </label>
                <select
                  value={t.event || 'manual'}
                  onChange={e => updateTemplate(key, { event: e.target.value as PushTriggerEvent })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#0F172A', fontSize: '0.82rem', fontWeight: 600 }}
                >
                  {EVENT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>
                      Título do Push
                    </label>
                    <button
                      type="button"
                      onClick={() => updateTemplate(key, { title: 'Kavro Drive' })}
                      style={{ border: 'none', background: 'none', color: '#2563EB', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                    >
                      Usar "Kavro Drive"
                    </button>
                  </div>
                  <input
                    type="text"
                    value={t.title}
                    onChange={e => updateTemplate(key, { title: e.target.value })}
                    placeholder="Kavro Drive"
                    style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#0F172A', fontSize: '0.84rem', fontWeight: 600, boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    Mensagem em forma de Push
                  </label>
                  <textarea
                    rows={3}
                    value={t.message}
                    onChange={e => updateTemplate(key, { message: e.target.value })}
                    style={{ width: '100%', padding: '8px 11px', borderRadius: 8, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#0F172A', fontSize: '0.83rem', resize: 'vertical', boxSizing: 'border-box' }}
                  />
                </div>

                {isReminder && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569' }}>
                      Antecedência:
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
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                  Pré-visualização em Formato Push
                </span>
                <PushPreviewCard
                  title={t.title || 'Kavro Drive'}
                  message={t.message}
                  areaBadge={itemArea.badgeText}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Smile size={13} /> Emojis:
                </span>
                {QUICK_EMOJIS.slice(0, 14).map(em => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => updateTemplate(key, { message: `${t.message}${t.message && !t.message.endsWith(' ') ? ' ' : ''}${em}` })}
                    style={{ padding: '2px 6px', borderRadius: 6, backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', fontSize: '0.9rem', cursor: 'pointer' }}
                  >
                    {em}
                  </button>
                ))}
              </div>
              {!isManual && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700 }}>Variáveis automáticas:</span>
                  {VARIABLES.map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => updateTemplate(key, { message: `${t.message}${t.message && !t.message.endsWith(' ') ? ' ' : ''}${v}` })}
                      style={{ fontSize: '0.71rem', padding: '2px 8px', borderRadius: 6, backgroundColor: '#FFFFFF', border: '1px solid #CBD5E1', color: '#334155', fontWeight: 600, cursor: 'pointer' }}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {isBuiltIn && (
                  <button
                    type="button"
                    onClick={() => restoreDefaultTemplate(key)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #CBD5E1',
                      backgroundColor: '#FFFFFF',
                      color: '#475569',
                      fontSize: '0.77rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <RotateCcw size={13} />
                    Restaurar Padrão
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setEditingKey(null)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#334155',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={savingId === key}
                  onClick={() => saveEditedTemplate(key)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    backgroundColor: '#0F172A',
                    color: '#FFFFFF',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {savingId === key ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Salvar Alterações
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Barra superior: Status do Dispositivo Donos + Teste rápido */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 12,
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BellRing size={18} color="#0F172A" />
          </div>
          <div>
            <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#0F172A' }}>
              Torre de Notificações Push (OneSignal • Web &amp; PWA)
            </div>
            <div style={{ fontSize: '0.76rem', color: '#64748B' }}>
              Selecione uma área abaixo para escrever, enviar, editar, desativar ou criar novos Pushs.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleEnableDevice}
            disabled={enabling}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '8px 13px',
              borderRadius: 8,
              border: '1px solid #CBD5E1',
              backgroundColor: notifPermission === 'granted' ? '#F0FDF4' : '#FFFFFF',
              color: notifPermission === 'granted' ? '#166534' : '#0F172A',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: enabling ? 'not-allowed' : 'pointer',
            }}
          >
            {enabling ? <Loader2 size={14} className="animate-spin" /> : notifPermission === 'granted' ? <Check size={14} /> : <Bell size={14} />}
            {notifPermission === 'granted' ? 'Push Ativo neste Aparelho' : 'Ativar Push neste Aparelho'}
          </button>

          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 13px',
              borderRadius: 8,
              border: '1px solid #E2E8F0',
              backgroundColor: '#F8FAFC',
              color: '#0F172A',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: testing ? 'not-allowed' : 'pointer',
            }}
          >
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Smartphone size={14} />}
            Testar no Painel Donos
          </button>
        </div>
      </div>

      {/* 4 ÁREAS DE NOTIFICAÇÃO PUSH */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
        {(['todos', 'admin', 'motorista', 'cliente'] as PushWorkspaceArea[]).map((areaKey) => {
          const cfg = AREA_CONFIG[areaKey];
          const Icon = cfg.icon;
          const isActive = activeArea === areaKey;
          const stats = areaCounts[areaKey];
          return (
            <button
              key={areaKey}
              type="button"
              onClick={() => handleSelectArea(areaKey)}
              style={{
                textAlign: 'left',
                padding: '14px 16px',
                borderRadius: 12,
                border: isActive ? `2px solid ${cfg.accent}` : '1.5px solid #E2E8F0',
                backgroundColor: isActive ? cfg.softBg : '#FFFFFF',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                boxShadow: isActive ? '0 4px 14px rgba(15,23,42,0.08)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    backgroundColor: isActive ? cfg.accent : '#F1F5F9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={17} color={isActive ? '#FFFFFF' : cfg.accent} />
                </div>
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 999,
                    backgroundColor: isActive ? '#FFFFFF' : '#F8FAFC',
                    color: isActive ? cfg.accent : '#64748B',
                    border: `1px solid ${isActive ? cfg.softBorder : '#E2E8F0'}`,
                  }}
                >
                  {stats.active}/{stats.total} ativo(s)
                </span>
              </div>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                  {cfg.title}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 2, lineHeight: 1.35 }}>
                  {cfg.shortTitle === 'Para Todos'
                    ? 'Passageiros, Motoristas e Donos'
                    : cfg.shortTitle === 'Painel Donos'
                      ? 'Somente administradores donos'
                      : cfg.shortTitle === 'Motorista'
                        ? 'Todos ou motorista único'
                        : 'Todos ou passageiro único'}
                </div>
              </div>
            </button>
          );
        })}
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

      {/* BLOCO PRINCIPAL DA ÁREA ATIVA: ESCREVER PUSH + VISUALIZAÇÃO REAL EM FORMATO PUSH */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: `1.5px solid ${areaMeta.softBorder}`,
          borderRadius: 14,
          padding: 20,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 22,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.68rem',
                fontWeight: 800,
                padding: '3px 10px',
                borderRadius: 999,
                backgroundColor: areaMeta.softBg,
                color: areaMeta.accent,
                border: `1px solid ${areaMeta.softBorder}`,
              }}
            >
              ÁREA ATIVA: {areaMeta.title.toUpperCase()}
            </span>
            <h4 style={{ margin: '8px 0 0 0', fontSize: '1.02rem', fontWeight: 800, color: '#0F172A' }}>
              Escrever &amp; Disparar Push ({areaMeta.shortTitle})
            </h4>
            <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
              {areaMeta.subtitle}
            </p>
          </div>

          {/* Controles específicos de destinatário dentro da área */}
          {activeArea === 'todos' && (
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '9px 12px',
                borderRadius: 9,
                backgroundColor: '#F5F3FF',
                border: '1px solid #DDD6FE',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: '#4C1D95',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={includeAdminInAll}
                onChange={e => setIncludeAdminInAll(e.target.checked)}
              />
              Incluir também o Painel Master Donos neste Push para Todos
            </label>
          )}

          {(activeArea === 'motorista' || activeArea === 'cliente') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setTargetSpecificMode('all')}
                  style={{
                    padding: '9px 10px',
                    borderRadius: 8,
                    border: `1.5px solid ${targetSpecificMode === 'all' ? areaMeta.accent : '#E2E8F0'}`,
                    backgroundColor: targetSpecificMode === 'all' ? areaMeta.softBg : '#F8FAFC',
                    color: targetSpecificMode === 'all' ? areaMeta.accent : '#475569',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {activeArea === 'motorista' ? `Todos Motoristas (${drivers.length})` : `Todos Passageiros (${clients.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => setTargetSpecificMode('specific')}
                  style={{
                    padding: '9px 10px',
                    borderRadius: 8,
                    border: `1.5px solid ${targetSpecificMode === 'specific' ? areaMeta.accent : '#E2E8F0'}`,
                    backgroundColor: targetSpecificMode === 'specific' ? areaMeta.softBg : '#F8FAFC',
                    color: targetSpecificMode === 'specific' ? areaMeta.accent : '#475569',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {activeArea === 'motorista' ? 'Motorista Específico' : 'Passageiro Específico'}
                </button>
              </div>

              {activeArea === 'motorista' && targetSpecificMode === 'specific' && (
                <select
                  value={selectedDriverId}
                  onChange={e => setSelectedDriverId(e.target.value)}
                  style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '1.5px solid #6EE7B7', backgroundColor: '#ECFDF5', color: '#0F172A', fontSize: '0.84rem', fontWeight: 600 }}
                >
                  <option value="">-- Escolha o motorista ({drivers.length}) --</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} • {d.vehiclePlate || d.phone || d.id}
                    </option>
                  ))}
                </select>
              )}

              {activeArea === 'cliente' && targetSpecificMode === 'specific' && (
                <select
                  value={selectedClientId}
                  onChange={e => setSelectedClientId(e.target.value)}
                  style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '1.5px solid #93C5FD', backgroundColor: '#EFF6FF', color: '#0F172A', fontSize: '0.84rem', fontWeight: 600 }}
                >
                  <option value="">-- Escolha o passageiro ({clients.length}) --</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} • {c.phone || c.email || c.id}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Atalhos rápidos de texto desta área */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: '0.71rem', fontWeight: 700, color: '#64748B' }}>Sugestões rápidas:</span>
            {areaMeta.presets.map(p => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setBroadcastTitle('Kavro Drive');
                  setMessageCustomized(true);
                  setBroadcastMessage(p.message);
                }}
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#F8FAFC',
                  color: '#0F172A',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Título do Push (padrão Kavro Drive) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569' }}>
                Título do Push (aparece em destaque no celular)
              </label>
              {broadcastTitle !== 'Kavro Drive' && (
                <button
                  type="button"
                  onClick={() => setBroadcastTitle('Kavro Drive')}
                  style={{ border: 'none', background: 'none', color: '#2563EB', fontSize: '0.71rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                >
                  Voltar para "Kavro Drive"
                </button>
              )}
            </div>
            <input
              ref={broadcastTitleRef}
              type="text"
              value={broadcastTitle}
              onFocus={() => setBroadcastFocus('title')}
              onChange={e => setBroadcastTitle(e.target.value)}
              placeholder="Kavro Drive"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                fontSize: '0.86rem',
                fontWeight: 700,
                color: '#0F172A',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Mensagem em formato Push */}
          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
              Mensagem escrita em forma de Push
            </label>
            <textarea
              ref={broadcastMsgRef}
              rows={3}
              value={broadcastMessage}
              onFocus={() => setBroadcastFocus('message')}
              onChange={e => {
                setMessageCustomized(true);
                setBroadcastMessage(e.target.value);
              }}
              placeholder="Escreva a mensagem curta e direta que aparecerá na tela de bloqueio..."
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

          {/* Emojis */}
          <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: '0.71rem', fontWeight: 700, color: '#475569', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Smile size={13} /> Inserir Emoji ({broadcastFocus === 'title' ? 'no Título' : 'na Mensagem'}):
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {QUICK_EMOJIS.map(em => (
                <button
                  key={em}
                  type="button"
                  onClick={() => insertEmojiIntoBroadcast(em)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 7,
                    border: '1px solid #E2E8F0',
                    backgroundColor: '#FFFFFF',
                    fontSize: '1rem',
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

        {/* Coluna Direita: Pré-visualização em forma de Push + Botões */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14, backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Visualização em Forma de Push
              </span>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#0F172A' }}>
                Destino: {effectiveTarget.label}
              </span>
            </div>

            <PushPreviewCard
              title={broadcastTitle || 'Kavro Drive'}
              message={broadcastMessage}
              areaBadge={areaMeta.badgeText}
            />

            <div>
              <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                Ao clicar no Push, abrir qual página?
              </label>
              <select
                value={broadcastUrl}
                onChange={e => setBroadcastUrl(e.target.value)}
                style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#0F172A', fontSize: '0.82rem', fontWeight: 600 }}
              >
                <option value="">Padrão desta área ({areaMeta.defaultUrl})</option>
                <option value="/cliente">Área do Passageiro (/cliente)</option>
                <option value="/kavro-drive">Portal do Motorista (/kavro-drive)</option>
                <option value="/administracion">Painel Master Donos (/administracion)</option>
                <option value="/">Página Oficial Kavro Drive (/)</option>
              </select>
            </div>

            {areaSentHistory.length > 0 && (
              <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: 6 }}>
                  Últimos envios em {areaMeta.shortTitle} ({areaSentHistory.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 120, overflowY: 'auto' }}>
                  {areaSentHistory.slice(0, 6).map(item => (
                    <div
                      key={item.id}
                      style={{
                        fontSize: '0.73rem',
                        padding: '6px 8px',
                        borderRadius: 7,
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 800, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.title}
                        </div>
                        <div style={{ color: '#64748B', fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.message}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setBroadcastTitle(item.title || 'Kavro Drive');
                          setMessageCustomized(true);
                          setBroadcastMessage(item.message);
                        }}
                        style={{ border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', borderRadius: 6, padding: '3px 8px', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', color: '#0F172A', flexShrink: 0 }}
                      >
                        Reusar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              onClick={() => sendManualPushNow()}
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
              {sendingBroadcast ? 'Enviando Push...' : `Enviar Push Agora (${areaMeta.shortTitle})`}
            </button>

            <button
              type="button"
              onClick={saveComposerAsTemplate}
              style={{
                width: '100%',
                padding: '9px 14px',
                borderRadius: 9,
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#0F172A',
                fontSize: '0.79rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
              }}
            >
              <BookmarkPlus size={15} />
              Salvar Texto como Novo Push em "{areaMeta.shortTitle}"
            </button>
          </div>
        </div>
      </div>

      {/* BLOCO DA ÁREA ATIVA: LISTAGEM DE PUSHS COM DESATIVAR, EDITAR E CRIAR NOVO PUSH */}
      <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 14, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0F172A' }}>
              Pushs Salvos &amp; Regras — {areaMeta.title} ({activeAreaTemplates.length})
            </h4>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
              Ative ou desative com 1 clique, edite título ("Kavro Drive") e mensagem ou crie novos Pushs nesta área.
            </p>
          </div>

          <button
            type="button"
            onClick={() => (showCreator ? setShowCreator(false) : openCreatorForActiveArea())}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '9px 15px',
              borderRadius: 9,
              border: showCreator ? '1px solid #CBD5E1' : 'none',
              backgroundColor: showCreator ? '#F8FAFC' : areaMeta.accent,
              color: showCreator ? '#0F172A' : '#FFFFFF',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Plus size={15} />
            {showCreator ? 'Fechar Criador' : `Criar Novo Push (${areaMeta.shortTitle})`}
          </button>
        </div>

        {/* Formulário de Criação de Novo Push */}
        {showCreator && (
          <form
            onSubmit={handleCreateTrigger}
            style={{
              marginBottom: 16,
              padding: 16,
              borderRadius: 12,
              backgroundColor: '#F8FAFC',
              border: `1.5px solid ${areaMeta.softBorder}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>
              Criar Novo Push — Título padrão Kavro Drive
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Nome do Push
                </label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  placeholder="Ex: Aviso Promocional / Alerta Operacional"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', fontSize: '0.82rem', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Área Destinatária
                </label>
                <select
                  value={newAudience}
                  onChange={e => setNewAudience(e.target.value as PushAudience)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', fontSize: '0.82rem', fontWeight: 600 }}
                >
                  <option value="todos">Push para Todos</option>
                  <option value="admin">Painel Master Donos</option>
                  <option value="motorista">Motorista</option>
                  <option value="cliente">Passageiros</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Tipo de Disparo
                </label>
                <select
                  value={newEvent}
                  onChange={e => setNewEvent(e.target.value as PushTriggerEvent)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', fontSize: '0.82rem', fontWeight: 600 }}
                >
                  {EVENT_OPTIONS.map(ev => (
                    <option key={ev.value} value={ev.value}>{ev.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Título do Push
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onFocus={() => setNewFocus('title')}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="Kavro Drive"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', fontSize: '0.84rem', fontWeight: 700, boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Mensagem do Push
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

            <PushPreviewCard
              title={newTitle || 'Kavro Drive'}
              message={newMessage}
              areaBadge={(AREA_CONFIG[newAudience === 'ambos' || newAudience === 'todos' ? 'todos' : newAudience] || areaMeta).badgeText}
            />

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
              {newEvent !== 'manual' && (
                <>
                  <span style={{ fontSize: '0.71rem', color: '#475569', fontWeight: 700, marginLeft: 6 }}>Variáveis:</span>
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
                </>
              )}
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
                Criar &amp; Salvar Push
              </button>
            </div>
          </form>
        )}

        {/* Lista dos Pushs da Área Selecionada */}
        {activeAreaTemplates.length === 0 ? (
          <div
            style={{
              padding: '28px 16px',
              borderRadius: 12,
              border: '1.5px dashed #CBD5E1',
              backgroundColor: '#F8FAFC',
              textAlign: 'center',
              color: '#64748B',
              fontSize: '0.84rem',
            }}
          >
            Nenhum Push salvo ainda em <strong>{areaMeta.title}</strong>. Use o botão <strong>"Criar Novo Push"</strong> ou <strong>"Salvar Texto como Novo Push"</strong> acima.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeAreaTemplates.map(([k, t]) => renderTemplateCard(k, t))}
          </div>
        )}
      </div>
    </div>
  );
};
