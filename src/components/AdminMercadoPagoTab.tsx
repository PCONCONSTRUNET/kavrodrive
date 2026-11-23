import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Power,
  QrCode,
  ShieldCheck,
  Trash2,
  Webhook
} from 'lucide-react';
import { MercadoPagoAdminConfig, MercadoPagoConfigUpdatePayload } from '../types';
import { StorageService } from '../services/storage';

const cardStyle: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: 12,
  border: '1px solid #E2E8F0',
  padding: '18px 20px',
  boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)'
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 40,
  padding: '0 12px',
  borderRadius: 8,
  border: '1px solid #CBD5E1',
  fontSize: '0.84rem',
  fontWeight: 600,
  color: '#0F172A',
  backgroundColor: '#FFFFFF',
  boxSizing: 'border-box'
};

interface AdminMercadoPagoTabProps {
  onConfigUpdated?: (cfg: MercadoPagoAdminConfig) => void;
  refreshSignal?: number;
}

export const AdminMercadoPagoTab: React.FC<AdminMercadoPagoTabProps> = ({ onConfigUpdated, refreshSignal = 0 }) => {
  const [config, setConfig] = useState<MercadoPagoAdminConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [sandbox, setSandbox] = useState(true);
  const [publicKey, setPublicKey] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [webhookSecret, setWebhookSecret] = useState('');
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [useForCard, setUseForCard] = useState(true);
  const [useForPassengerPix, setUseForPassengerPix] = useState(true);
  const [statementDescriptor, setStatementDescriptor] = useState('KAVRO DRIVE');
  const [computedWebhookUrl, setComputedWebhookUrl] = useState('');

  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const applyConfigToForm = (cfg: MercadoPagoAdminConfig, whUrl?: string) => {
    setConfig(cfg);
    setEnabled(Boolean(cfg.enabled));
    setSandbox(Boolean(cfg.sandbox));
    setPublicKey(cfg.publicKey || '');
    setAccessToken('');
    setWebhookSecret('');
    setUseForCard(cfg.useForCard !== false);
    setUseForPassengerPix(cfg.useForPassengerPix !== false);
    setStatementDescriptor(cfg.statementDescriptor || 'KAVRO DRIVE');
    if (whUrl) {
      setComputedWebhookUrl(whUrl);
    } else if (cfg.webhookUrl) {
      setComputedWebhookUrl(cfg.webhookUrl);
    }
    onConfigUpdated?.(cfg);
  };

  const loadConfig = async () => {
    setIsLoading(true);
    const res = await StorageService.fetchAdminMercadoPagoConfig();
    setIsLoading(false);
    if (res.ok && res.config) {
      applyConfigToForm(res.config, res.computedWebhookUrl);
    } else {
      setFeedback({ type: 'err', text: res.error || 'Não foi possível carregar as configurações do Mercado Pago.' });
    }
  };

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  const buildPayload = (overrideEnabled?: boolean): MercadoPagoConfigUpdatePayload => {
    const payload: MercadoPagoConfigUpdatePayload = {
      enabled: overrideEnabled !== undefined ? overrideEnabled : enabled,
      sandbox,
      publicKey: publicKey.trim(),
      useForCard,
      useForPassengerPix,
      statementDescriptor: statementDescriptor.trim() || 'KAVRO DRIVE'
    };
    if (accessToken.trim()) {
      payload.accessToken = accessToken.trim();
    }
    if (webhookSecret.trim()) {
      payload.webhookSecret = webhookSecret.trim();
    }
    return payload;
  };

  const handleSave = async (overrideEnabled?: boolean) => {
    setFeedback(null);
    setIsSaving(true);
    const res = await StorageService.saveAdminMercadoPagoConfig(buildPayload(overrideEnabled));
    setIsSaving(false);
    if (!res.ok || !res.config) {
      setFeedback({ type: 'err', text: res.error || 'Falha ao salvar configurações do Mercado Pago.' });
      return;
    }
    applyConfigToForm(res.config, res.computedWebhookUrl);
    setFeedback({
      type: 'ok',
      text: res.config.enabled
        ? `Mercado Pago SALVO e ATIVADO em modo ${res.config.sandbox ? 'Sandbox / Teste' : 'Produção'}!`
        : 'Configurações do Mercado Pago salvas com sucesso (Gateway atualmente desativado).'
    });
  };

  const handleToggleMasterGateway = async () => {
    await handleSave(!enabled);
  };

  const handleClearSecretField = async (target: 'accessToken' | 'webhookSecret') => {
    setFeedback(null);
    setIsSaving(true);
    const payload: MercadoPagoConfigUpdatePayload =
      target === 'accessToken'
        ? { clearAccessToken: true, enabled: false }
        : { clearWebhookSecret: true };
    const res = await StorageService.saveAdminMercadoPagoConfig(payload);
    setIsSaving(false);
    if (!res.ok || !res.config) {
      setFeedback({ type: 'err', text: res.error || 'Falha ao limpar credencial.' });
      return;
    }
    applyConfigToForm(res.config, res.computedWebhookUrl);
    setFeedback({
      type: 'ok',
      text:
        target === 'accessToken'
          ? 'Access Token removido e gateway Mercado Pago desativado com segurança.'
          : 'Webhook Secret removido.'
    });
  };

  const handleTestConnection = async () => {
    setFeedback(null);
    setIsTesting(true);
    const res = await StorageService.testAdminMercadoPagoConnection(buildPayload());
    setIsTesting(false);
    setFeedback({
      type: res.ok ? 'ok' : 'err',
      text: res.message || res.error || (res.ok ? 'Conexão Mercado Pago OK!' : 'Falha na conexão com o Mercado Pago.')
    });
    await loadConfig();
  };

  if (isLoading && !config) {
    return (
      <div style={{ padding: 28, display: 'flex', alignItems: 'center', gap: 10, color: '#475569' }}>
        <Loader2 size={18} className="animate-spin" />
        <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>Carregando configuração do Mercado Pago...</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Hero Banner Master ON/OFF + Ambiente */}
      <div
        style={{
          background: enabled
            ? 'linear-gradient(135deg, #09192B 0%, #0C3559 100%)'
            : '#F8FAFC',
          color: enabled ? '#FFFFFF' : '#0F172A',
          borderRadius: 14,
          border: enabled ? '1px solid #0E4A7A' : '1px solid #E2E8F0',
          padding: '18px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 14
        }}
      >
        <div style={{ minWidth: 240, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                backgroundColor: enabled ? 'rgba(0, 158, 227, 0.22)' : '#E2E8F0',
                color: enabled ? '#38BDF8' : '#475569',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <CreditCard size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
                Mercado Pago — Cartão de Crédito/Débito &amp; PIX
              </div>
              <div style={{ fontSize: '0.76rem', color: enabled ? '#BAE6FD' : '#64748B', marginTop: 2 }}>
                Gerencie Public Key, Access Token, assinatura de webhook e ative ou desative o processamento em tempo real.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 800,
                padding: '4px 10px',
                borderRadius: 999,
                backgroundColor: enabled ? 'rgba(34, 197, 94, 0.22)' : '#E2E8F0',
                color: enabled ? '#86EFAC' : '#475569',
                border: enabled ? '1px solid rgba(34, 197, 94, 0.45)' : '1px solid #CBD5E1'
              }}
            >
              {enabled ? (sandbox ? 'ATIVO (SANDBOX)' : 'ATIVO (PRODUÇÃO)') : 'GATEWAY DESATIVADO'}
            </span>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 999,
                backgroundColor: config?.hasAccessToken ? 'rgba(56, 189, 248, 0.16)' : '#FEF3C7',
                color: enabled
                  ? (config?.hasAccessToken ? '#7DD3FC' : '#FDE68A')
                  : (config?.hasAccessToken ? '#0369A1' : '#92400E')
              }}
            >
              {config?.hasAccessToken ? 'Access Token configurado' : 'Falta Access Token'}
            </span>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 999,
                backgroundColor: publicKey.trim() ? 'rgba(56, 189, 248, 0.14)' : '#F1F5F9',
                color: enabled
                  ? (publicKey.trim() ? '#BAE6FD' : '#CBD5E1')
                  : (publicKey.trim() ? '#0F172A' : '#64748B')
              }}
            >
              {publicKey.trim() ? 'Public Key pronta' : 'Sem Public Key'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleToggleMasterGateway}
          disabled={isSaving}
          style={{
            height: 44,
            padding: '0 18px',
            borderRadius: 10,
            border: enabled ? '1px solid rgba(239, 68, 68, 0.5)' : 'none',
            backgroundColor: enabled ? 'rgba(239, 68, 68, 0.18)' : '#009EE3',
            color: enabled ? '#FCA5A5' : '#FFFFFF',
            fontSize: '0.84rem',
            fontWeight: 800,
            cursor: isSaving ? 'wait' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0
          }}
        >
          <Power size={16} />
          <span>{enabled ? 'Desativar Mercado Pago' : 'Ativar Mercado Pago'}</span>
        </button>
      </div>

      {feedback && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 10,
            backgroundColor: feedback.type === 'ok' ? '#F0FDF4' : '#FEF2F2',
            border: feedback.type === 'ok' ? '1px solid #86EFAC' : '1px solid #FECACA',
            color: feedback.type === 'ok' ? '#166534' : '#991B1B',
            fontSize: '0.82rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          {feedback.type === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* 1. Ambiente & Credenciais API Mercado Pago */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyRound size={17} color="#0F172A" />
            <div>
              <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A' }}>
                Credenciais da Aplicação Mercado Pago
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                Copie Public Key e Access Token em Suas Integrações no painel Mercado Pago Developers
              </div>
            </div>
          </div>

          <div style={{ display: 'inline-flex', backgroundColor: '#F1F5F9', padding: 3, borderRadius: 8, gap: 4 }}>
            <button
              type="button"
              onClick={() => setSandbox(false)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: 'none',
                backgroundColor: !sandbox ? '#0F172A' : 'transparent',
                color: !sandbox ? '#FFFFFF' : '#475569',
                fontSize: '0.75rem',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              Produção (Real)
            </button>
            <button
              type="button"
              onClick={() => setSandbox(true)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: 'none',
                backgroundColor: sandbox ? '#F59E0B' : 'transparent',
                color: sandbox ? '#0F172A' : '#475569',
                fontSize: '0.75rem',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              Sandbox (Teste)
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
              Public Key ({sandbox ? 'Teste' : 'Produção'})
            </label>
            <input
              type="text"
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              placeholder={sandbox ? 'TEST-xxxxxxxx-xxxx-...' : 'APP_USR-xxxxxxxx-xxxx-...'}
              style={inputStyle}
            />
            <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: 4 }}>
              Necessária para tokenizar cartões com segurança direto no app do passageiro.
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#334155' }}>
                Access Token {config?.hasAccessToken ? `(salvo: ${config.accessTokenMasked})` : ''}
              </label>
              {config?.hasAccessToken && (
                <button
                  type="button"
                  onClick={() => handleClearSecretField('accessToken')}
                  disabled={isSaving}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#DC2626',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3
                  }}
                >
                  <Trash2 size={11} />
                  <span>Limpar</span>
                </button>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type={showAccessToken ? 'text' : 'password'}
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder={config?.hasAccessToken ? 'Deixe em branco para manter o token salvo' : (sandbox ? 'TEST-...' : 'APP_USR-...')}
                style={{ ...inputStyle, paddingRight: 38 }}
              />
              <button
                type="button"
                onClick={() => setShowAccessToken((v) => !v)}
                aria-label="Mostrar/ocultar Access Token"
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#64748B',
                  cursor: 'pointer',
                  padding: 4
                }}
              >
                {showAccessToken ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#334155' }}>
                Assinatura Secreta Webhook {config?.hasWebhookSecret ? `(salva: ${config.webhookSecretMasked})` : '(Opcional em teste)'}
              </label>
              {config?.hasWebhookSecret && (
                <button
                  type="button"
                  onClick={() => handleClearSecretField('webhookSecret')}
                  disabled={isSaving}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#DC2626',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3
                  }}
                >
                  <Trash2 size={11} />
                  <span>Limpar</span>
                </button>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type={showWebhookSecret ? 'text' : 'password'}
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder={config?.hasWebhookSecret ? 'Deixe em branco para manter a assinatura salva' : 'Secret gerado na aba Webhooks do MP'}
                style={{ ...inputStyle, paddingRight: 38 }}
              />
              <button
                type="button"
                onClick={() => setShowWebhookSecret((v) => !v)}
                aria-label="Mostrar/ocultar Secret do Webhook"
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#64748B',
                  cursor: 'pointer',
                  padding: 4
                }}
              >
                {showWebhookSecret ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
              Nome na Fatura do Cartão (até 22 caracteres)
            </label>
            <input
              type="text"
              maxLength={22}
              value={statementDescriptor}
              onChange={(e) => setStatementDescriptor(e.target.value)}
              placeholder="KAVRO DRIVE"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* 2. Módulos / Regras de Roteamento */}
      <div style={cardStyle}>
        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>
          Módulos Ativos no Mercado Pago
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '11px 12px',
              borderRadius: 10,
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              cursor: 'pointer'
            }}
          >
            <input
              type="checkbox"
              checked={useForCard}
              onChange={(e) => setUseForCard(e.target.checked)}
              style={{ marginTop: 3, width: 16, height: 16, accentColor: '#009EE3' }}
            />
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CreditCard size={14} color="#009EE3" />
                <span>Processar Cartão de Crédito &amp; Débito via Mercado Pago</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 2 }}>
                Realiza pré-autorização na solicitação da corrida, captura do valor final ao concluir e estorno automático se cancelada.
              </div>
            </div>
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '11px 12px',
              borderRadius: 10,
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              cursor: 'pointer'
            }}
          >
            <input
              type="checkbox"
              checked={useForPassengerPix}
              onChange={(e) => setUseForPassengerPix(e.target.checked)}
              style={{ marginTop: 3, width: 16, height: 16, accentColor: '#009EE3' }}
            />
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                <QrCode size={14} color="#16A34A" />
                <span>Gerar PIX de Corridas, Carteira e Quitação via Mercado Pago</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 2 }}>
                Usado automaticamente para QR Code PIX sempre que a Efí Bank PIX estiver desativada (se ambas estiverem ativas, a Efí Bank mantém prioridade no PIX).
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* 3. Webhook URL & Ações */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Webhook size={17} color="#0F172A" />
          <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>
            URL Oficial do Webhook Mercado Pago
          </div>
        </div>

        <div style={{ fontSize: '0.73rem', color: '#64748B', marginBottom: 10 }}>
          Cole esta URL em <strong>Suas Integrações &rarr; Webhooks</strong> no painel do Mercado Pago e marque o evento <strong>Pagamentos (payment)</strong>.
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <input
            type="text"
            readOnly
            value={computedWebhookUrl}
            style={{ ...inputStyle, flex: 1, minWidth: 220, backgroundColor: '#F8FAFC', fontFamily: 'monospace', fontSize: '0.75rem' }}
          />
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(computedWebhookUrl);
              setCopiedWebhook(true);
              setTimeout(() => setCopiedWebhook(false), 2000);
            }}
            style={{
              height: 40,
              padding: '0 14px',
              borderRadius: 8,
              border: '1px solid #CBD5E1',
              backgroundColor: copiedWebhook ? '#F0FDF4' : '#FFFFFF',
              color: copiedWebhook ? '#15803D' : '#0F172A',
              fontSize: '0.76rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            {copiedWebhook ? <Check size={14} /> : <Copy size={14} />}
            <span>{copiedWebhook ? 'Copiado' : 'Copiar URL'}</span>
          </button>
        </div>

        {config?.lastTestedAt && (
          <div style={{ fontSize: '0.73rem', color: config.lastTestOk ? '#15803D' : '#B45309', marginBottom: 12, fontWeight: 600 }}>
            Último teste ({new Date(config.lastTestedAt).toLocaleString('pt-BR')}): {config.lastTestMessage}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={isSaving}
            style={{
              height: 42,
              padding: '0 18px',
              borderRadius: 9,
              border: 'none',
              backgroundColor: '#111111',
              color: '#FFFFFF',
              fontSize: '0.84rem',
              fontWeight: 800,
              cursor: isSaving ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7
            }}
          >
            {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} color="#38BDF8" />}
            <span>{isSaving ? 'Salvando...' : 'Salvar Mercado Pago'}</span>
          </button>

          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting}
            style={{
              height: 42,
              padding: '0 16px',
              borderRadius: 9,
              border: '1px solid #CBD5E1',
              backgroundColor: '#F8FAFC',
              color: '#0F172A',
              fontSize: '0.82rem',
              fontWeight: 800,
              cursor: isTesting ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7
            }}
          >
            {isTesting ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} color="#009EE3" />}
            <span>{isTesting ? 'Testando API...' : 'Testar Conexão Mercado Pago'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
