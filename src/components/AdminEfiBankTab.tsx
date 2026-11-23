import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  FileKey2,
  Globe,
  KeyRound,
  Landmark,
  Loader2,
  Power,
  RefreshCw,
  Send,
  ShieldCheck,
  Split,
  Trash2,
  Upload,
  Webhook
} from 'lucide-react';
import { EfiBankAdminConfig, EfiBankConfigUpdatePayload } from '../types';
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

interface AdminEfiBankTabProps {
  onConfigUpdated?: (cfg: EfiBankAdminConfig) => void;
  refreshSignal?: number;
}

export const AdminEfiBankTab: React.FC<AdminEfiBankTabProps> = ({ onConfigUpdated, refreshSignal = 0 }) => {
  const [config, setConfig] = useState<EfiBankAdminConfig | null>(null);
  const [computedWebhookUrl, setComputedWebhookUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isRegisteringWebhook, setIsRegisteringWebhook] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Form states
  const [enabled, setEnabled] = useState(false);
  const [sandbox, setSandbox] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [pixKey, setPixKey] = useState('');

  const [pendingCertBase64, setPendingCertBase64] = useState('');
  const [pendingCertName, setPendingCertName] = useState('');
  const [certPassphrase, setCertPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [removeCertificateFlag, setRemoveCertificateFlag] = useState(false);
  const [showPemAdvanced, setShowPemAdvanced] = useState(false);
  const [pemCert, setPemCert] = useState('');
  const [pemKey, setPemKey] = useState('');

  const [useForPassengerPix, setUseForPassengerPix] = useState(true);
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [driverPixSendEnabled, setDriverPixSendEnabled] = useState(true);
  const [skipMtlsWebhook, setSkipMtlsWebhook] = useState(true);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const applyConfigToForm = (cfg: EfiBankAdminConfig, whUrl?: string) => {
    setConfig(cfg);
    setEnabled(Boolean(cfg.enabled));
    setSandbox(Boolean(cfg.sandbox));
    setClientId(cfg.clientId || '');
    setClientSecret('');
    setPixKey(cfg.pixKey || '');
    setPendingCertBase64('');
    setPendingCertName('');
    setRemoveCertificateFlag(false);
    setCertPassphrase('');
    setUseForPassengerPix(cfg.useForPassengerPix !== false);
    setSplitEnabled(Boolean(cfg.splitEnabled));
    setDriverPixSendEnabled(cfg.driverPixSendEnabled !== false);
    setSkipMtlsWebhook(cfg.skipMtlsWebhook !== false);
    if (whUrl) setComputedWebhookUrl(whUrl);
    onConfigUpdated?.(cfg);
  };

  const loadConfig = async () => {
    setIsLoading(true);
    const res = await StorageService.fetchAdminEfiBankConfig();
    setIsLoading(false);
    if (res.ok && res.config) {
      applyConfigToForm(res.config, res.computedWebhookUrl);
    } else {
      setFeedback({ type: 'err', text: res.error || 'Não foi possível carregar configurações da Efí Bank.' });
    }
  };

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 1024 * 1024) {
      setFeedback({ type: 'err', text: 'Certificado muito grande (máx 1 MB). Verifique se é o arquivo .p12/.pfx da Efí.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf('base64,');
      const b64 = comma >= 0 ? result.slice(comma + 7) : result;
      setPendingCertBase64(b64);
      setPendingCertName(file.name);
      setRemoveCertificateFlag(false);
      setFeedback({ type: 'ok', text: `Certificado "${file.name}" selecionado. Clique em Salvar para aplicar.` });
    };
    reader.onerror = () => {
      setFeedback({ type: 'err', text: 'Erro ao ler o arquivo do certificado.' });
    };
    reader.readAsDataURL(file);
  };

  const buildPayload = (overrideEnabled?: boolean): EfiBankConfigUpdatePayload => {
    const payload: EfiBankConfigUpdatePayload = {
      enabled: overrideEnabled !== undefined ? overrideEnabled : enabled,
      sandbox,
      clientId: clientId.trim(),
      pixKey: pixKey.trim(),
      useForPassengerPix,
      splitEnabled,
      driverPixSendEnabled,
      skipMtlsWebhook
    };
    if (clientSecret.trim()) {
      payload.clientSecret = clientSecret.trim();
    }
    if (removeCertificateFlag) {
      payload.removeCertificate = true;
    } else if (pendingCertBase64) {
      payload.certificateBase64 = pendingCertBase64;
      payload.certificateFileName = pendingCertName || 'certificado-efi.p12';
    }
    if (certPassphrase !== '') {
      payload.certificatePassphrase = certPassphrase;
    }
    if (showPemAdvanced && (pemCert.trim() || pemKey.trim())) {
      payload.pemCert = pemCert.trim();
      payload.pemKey = pemKey.trim();
    }
    return payload;
  };

  const handleSave = async (overrideEnabled?: boolean) => {
    setFeedback(null);
    setIsSaving(true);
    const res = await StorageService.saveAdminEfiBankConfig(buildPayload(overrideEnabled));
    setIsSaving(false);
    if (!res.ok || !res.config) {
      setFeedback({ type: 'err', text: res.error || 'Falha ao salvar configurações da Efí Bank.' });
      return;
    }
    applyConfigToForm(res.config, res.computedWebhookUrl);
    setFeedback({
      type: 'ok',
      text: res.config.enabled
        ? `Efí Bank SALVA e ATIVADA em modo ${res.config.sandbox ? 'Homologação' : 'Produção'}!`
        : 'Configurações da Efí Bank salvas com sucesso (Gateway atualmente desativado).'
    });
  };

  const handleToggleMasterGateway = async () => {
    const nextEnabled = !enabled;
    await handleSave(nextEnabled);
  };

  const handleTestConnection = async () => {
    setFeedback(null);
    setIsTesting(true);
    const res = await StorageService.testAdminEfiBankConnection(buildPayload());
    setIsTesting(false);
    setFeedback({
      type: res.ok ? 'ok' : 'err',
      text: res.message || res.error || (res.ok ? 'Conexão Efí Bank OK!' : 'Falha na conexão com a Efí Bank.')
    });
    await loadConfig();
  };

  const handleRegisterWebhook = async () => {
    setFeedback(null);
    setIsRegisteringWebhook(true);
    const res = await StorageService.registerAdminEfiBankWebhook({
      webhookUrl: computedWebhookUrl,
      skipMtls: skipMtlsWebhook
    });
    setIsRegisteringWebhook(false);
    if (!res.ok) {
      setFeedback({ type: 'err', text: res.error || 'Não foi possível registrar o webhook na Efí Bank.' });
      return;
    }
    if (res.config) applyConfigToForm(res.config, res.webhookUrl || computedWebhookUrl);
    setFeedback({ type: 'ok', text: `Webhook PIX registrado com sucesso na Efí Bank: ${res.webhookUrl}` });
  };

  const handleRegenerateHmac = async () => {
    setFeedback(null);
    setIsSaving(true);
    const res = await StorageService.saveAdminEfiBankConfig({ regenerateWebhookSecret: true });
    setIsSaving(false);
    if (res.ok && res.config) {
      applyConfigToForm(res.config, res.computedWebhookUrl);
      setFeedback({ type: 'ok', text: 'Novo token HMAC de webhook gerado! Registre o webhook novamente na Efí para aplicar.' });
    }
  };

  if (isLoading && !config) {
    return (
      <div style={{ padding: 28, display: 'flex', alignItems: 'center', gap: 10, color: '#475569' }}>
        <Loader2 size={18} className="animate-spin" />
        <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>Carregando configuração da Efí Bank...</span>
      </div>
    );
  }

  const hasSavedCert = Boolean(config?.hasCertificate && !removeCertificateFlag);
  const certLabel = pendingCertName
    ? `${pendingCertName} (pronto para salvar)`
    : hasSavedCert
      ? `${config?.certificateFileName || 'certificado.p12'}${config?.certificateBytes ? ` (${Math.max(1, Math.round(config.certificateBytes / 1024))} KB)` : ''}`
      : 'Nenhum certificado enviado';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Hero Banner Master ON/OFF + Ambiente */}
      <div
        style={{
          background: enabled
            ? 'linear-gradient(135deg, #0B1117 0%, #15222C 100%)'
            : '#F8FAFC',
          color: enabled ? '#FFFFFF' : '#0F172A',
          borderRadius: 14,
          border: enabled ? '1px solid #1E293B' : '1px solid #E2E8F0',
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
                backgroundColor: enabled ? 'rgba(118, 216, 0, 0.16)' : '#E2E8F0',
                color: enabled ? '#76D800' : '#475569',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Landmark size={20} />
            </div>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 900, letterSpacing: '-0.02em' }}>
                Efí Bank — PIX, Split &amp; Repasses via API
              </div>
              <div style={{ fontSize: '0.76rem', color: enabled ? '#94A3B8' : '#64748B', marginTop: 2 }}>
                Gerencie credenciais OAuth, certificado digital mTLS (.p12), Split e envio direto de PIX para motoristas.
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
                backgroundColor: enabled ? 'rgba(34, 197, 94, 0.18)' : '#E2E8F0',
                color: enabled ? '#86EFAC' : '#475569',
                border: enabled ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid #CBD5E1'
              }}
            >
              {enabled ? (sandbox ? 'ATIVA (HOMOLOGAÇÃO)' : 'ATIVA (PRODUÇÃO)') : 'GATEWAY DESATIVADO'}
            </span>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 999,
                backgroundColor: config?.hasCertificate ? 'rgba(59, 130, 246, 0.15)' : '#FEF3C7',
                color: enabled
                  ? (config?.hasCertificate ? '#93C5FD' : '#FDE68A')
                  : (config?.hasCertificate ? '#1D4ED8' : '#92400E')
              }}
            >
              {config?.hasCertificate ? 'Certificado mTLS instalado' : 'Falta Certificado .p12'}
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
            backgroundColor: enabled ? 'rgba(239, 68, 68, 0.16)' : '#16A34A',
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
          <span>{enabled ? 'Desativar Efí Bank' : 'Ativar Efí Bank'}</span>
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

      {/* 1. Ambiente & Credenciais OAuth + Chave PIX */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <KeyRound size={17} color="#0F172A" />
            <div>
              <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A' }}>
                Credenciais da Aplicação &amp; Chave PIX
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                Copie o Client ID e Client Secret no painel da Efí Bank (API Pix)
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
              Homologação (Sandbox)
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
              Client ID ({sandbox ? 'Homologação' : 'Produção'})
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Client_Id_..."
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
              Client Secret {config?.hasClientSecret ? `(salvo: ${config.clientSecretMasked})` : ''}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showSecret ? 'text' : 'password'}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={config?.hasClientSecret ? 'Deixe em branco para manter o salvo' : 'Client_Secret_...'}
                style={{ ...inputStyle, paddingRight: 38 }}
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                aria-label="Mostrar/ocultar Client Secret"
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
                {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
              Chave PIX da Conta Efí (Recebedora &amp; Pagadora)
            </label>
            <input
              type="text"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              placeholder="CNPJ, EVP aleatória, e-mail ou +55..."
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* 2. Certificado Digital mTLS (.p12 / .pfx / .pem) */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileKey2 size={17} color="#0F172A" />
            <div>
              <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A' }}>
                Certificado Digital mTLS (.p12 / .pfx)
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                Obrigatório na API Pix da Efí Bank. Armazenado com segurança no banco de dados (funciona na Vercel e local).
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowPemAdvanced((v) => !v)}
            style={{
              background: '#F1F5F9',
              border: '1px solid #CBD5E1',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#334155',
              cursor: 'pointer'
            }}
          >
            {showPemAdvanced ? 'Ocultar PEM Avançado' : 'Modo Avançado (.PEM)'}
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".p12,.pfx,.pem"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            padding: '12px 14px',
            borderRadius: 10,
            backgroundColor: hasSavedCert || pendingCertBase64 ? '#F0FDF4' : '#F8FAFC',
            border: hasSavedCert || pendingCertBase64 ? '1px solid #BBF7D0' : '1px dashed #CBD5E1'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldCheck size={20} color={hasSavedCert || pendingCertBase64 ? '#15803D' : '#64748B'} />
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>
                {certLabel}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                Baixe o arquivo .p12 de {sandbox ? 'Homologação' : 'Produção'} em API → Meus Certificados no painel Efí.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '8px 13px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                fontSize: '0.76rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Upload size={14} />
              <span>{hasSavedCert ? 'Substituir .p12' : 'Enviar .p12'}</span>
            </button>

            {(hasSavedCert || pendingCertBase64) && (
              <button
                type="button"
                onClick={() => {
                  setPendingCertBase64('');
                  setPendingCertName('');
                  setRemoveCertificateFlag(true);
                }}
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid #FECACA',
                  backgroundColor: '#FEF2F2',
                  color: '#DC2626',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <Trash2 size={14} />
                <span>Remover</span>
              </button>
            )}
          </div>
        </div>

        <div style={{ marginTop: 12, maxWidth: 340 }}>
          <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
            Senha do Certificado (.p12) — opcional
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassphrase ? 'text' : 'password'}
              value={certPassphrase}
              onChange={(e) => setCertPassphrase(e.target.value)}
              placeholder={config?.hasCertificatePassphrase ? 'Senha salva (preencha para alterar)' : 'Em branco (padrão Efí)'}
              style={{ ...inputStyle, paddingRight: 36 }}
            />
            <button
              type="button"
              onClick={() => setShowPassphrase((v) => !v)}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#64748B',
                cursor: 'pointer'
              }}
            >
              {showPassphrase ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {showPemAdvanced && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, marginTop: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                Certificado PEM (-----BEGIN CERTIFICATE-----)
              </label>
              <textarea
                rows={4}
                value={pemCert}
                onChange={(e) => setPemCert(e.target.value)}
                placeholder="Cole o bloco CERTIFICATE caso não use .p12..."
                style={{ ...inputStyle, height: 'auto', padding: 10, fontFamily: 'monospace', fontSize: '0.74rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                Chave Privada PEM (-----BEGIN PRIVATE KEY-----)
              </label>
              <textarea
                rows={4}
                value={pemKey}
                onChange={(e) => setPemKey(e.target.value)}
                placeholder="Cole o bloco PRIVATE KEY..."
                style={{ ...inputStyle, height: 'auto', padding: 10, fontFamily: 'monospace', fontSize: '0.74rem' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. Módulos Funcionais Efí (PIX, Split & Repasses API para Motoristas) */}
      <div style={cardStyle}>
        <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>
          Módulos da Integração Efí Bank
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
              checked={useForPassengerPix}
              onChange={(e) => setUseForPassengerPix(e.target.checked)}
              style={{ marginTop: 3, width: 16, height: 16, accentColor: '#0F172A' }}
            />
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>
                Gerar PIX de Corridas, Carteira e Quitação via Efí Bank
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 2 }}>
                Substitui o gerador PIX atual pelo QR Code oficial da Efí Bank (`PUT /v2/cob/:txid`) com confirmação instantânea via webhook.
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
              checked={driverPixSendEnabled}
              onChange={(e) => setDriverPixSendEnabled(e.target.checked)}
              style={{ marginTop: 3, width: 16, height: 16, accentColor: '#0F172A' }}
            />
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Send size={14} color="#16A34A" />
                <span>Repasse Automático de Saque para Chave PIX do Motorista (`pix.send`)</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 2 }}>
                Ao aprovar um saque no Financeiro Master, envia o PIX direto da conta Efí para a chave PIX do motorista via `PUT /v3/gn/pix/:idEnvio`.
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
              checked={splitEnabled}
              onChange={(e) => setSplitEnabled(e.target.checked)}
              style={{ marginTop: 3, width: 16, height: 16, accentColor: '#0F172A' }}
            />
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Split size={14} color="#2563EB" />
                <span>Split Automático de Pagamentos Efí (`gn.split`)</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 2 }}>
                Quando o motorista possuir Conta Digital Efí (`efiAccountId`) vinculada na criação da corrida, divide automaticamente comissão e repasse na cobrança.
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
              checked={skipMtlsWebhook}
              onChange={(e) => setSkipMtlsWebhook(e.target.checked)}
              style={{ marginTop: 3, width: 16, height: 16, accentColor: '#0F172A' }}
            />
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Globe size={14} color="#475569" />
                <span>Compatibilidade Vercel Serverless (`x-skip-mtls-checking + HMAC`)</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 2 }}>
                Mantém o endpoint `/api/webhooks/efibank` protegido pelo token `?hmac=` e valida cada PIX diretamente na API da Efí (`/v2/cob/:txid`).
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* 4. Webhook URL & Ações (Salvar, Testar Certificado/Saldo, Registrar Webhook) */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Webhook size={17} color="#0F172A" />
            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>
              URL Oficial do Webhook Efí Bank
            </div>
          </div>
          <button
            type="button"
            onClick={handleRegenerateHmac}
            disabled={isSaving}
            style={{
              background: 'none',
              border: '1px solid #CBD5E1',
              borderRadius: 8,
              padding: '5px 10px',
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#475569',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5
            }}
          >
            <RefreshCw size={12} />
            <span>Gerar novo HMAC</span>
          </button>
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
            {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} color="#76D800" />}
            <span>{isSaving ? 'Salvando...' : 'Salvar Efí Bank'}</span>
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
            {isTesting ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} color="#2563EB" />}
            <span>{isTesting ? 'Testando mTLS...' : 'Testar Certificado & Saldo'}</span>
          </button>

          <button
            type="button"
            onClick={handleRegisterWebhook}
            disabled={isRegisteringWebhook}
            style={{
              height: 42,
              padding: '0 16px',
              borderRadius: 9,
              border: '1px solid #BBF7D0',
              backgroundColor: '#F0FDF4',
              color: '#15803D',
              fontSize: '0.82rem',
              fontWeight: 800,
              cursor: isRegisteringWebhook ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7
            }}
          >
            {isRegisteringWebhook ? <Loader2 size={15} className="animate-spin" /> : <Webhook size={15} />}
            <span>{isRegisteringWebhook ? 'Registrando...' : 'Registrar Webhook na Efí'}</span>
          </button>
        </div>

        <div
          style={{
            marginTop: 14,
            padding: '10px 12px',
            borderRadius: 8,
            backgroundColor: '#F8FAFC',
            border: '1px solid #E2E8F0',
            fontSize: '0.73rem',
            color: '#475569',
            lineHeight: 1.45
          }}
        >
          <strong>Escopos recomendados na sua aplicação Efí Bank:</strong>{' '}
          <code>cob.write</code>, <code>cob.read</code>, <code>pix.read</code>, <code>pix.write</code>,{' '}
          <code>pix.send</code> (para repasses aos motoristas), <code>webhook.write</code>,{' '}
          <code>gn.split.write</code> (se usar Split) e <code>gn.balance.read</code>.
        </div>
      </div>
    </div>
  );
};
