import React, { useState, useEffect } from 'react';
import { User, Mail, Search, ChevronDown, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, X } from 'lucide-react';
import { ClientProfile, SystemConfig } from '../types';
import { StorageService } from '../services/storage';
import { formatPhone, getCleanWhatsappNumber } from '../utils/format';
import { WhatsAppIcon } from './WhatsAppIcon';
import { TurnstileWidget, isTurnstileEnabled } from './TurnstileWidget';
import { PassengerTermsContractModal } from './PassengerTermsContractModal';
import {
  PASSENGER_TERMS_AFFIRMATIVE_TEXT,
  PASSENGER_TERMS_CONTRACT_ID,
  PASSENGER_TERMS_CONTRACT_VERSION
} from '../utils/passengerTermsContract';
import { buildTermsAcceptancePayload } from '../utils/contractMarkdownParser';

interface ClientWelcomeScreenProps {
  config: SystemConfig;
  onAuthSuccess: (client: ClientProfile) => void;
  onOpenTerms?: () => void;
}

export const ClientWelcomeScreen: React.FC<ClientWelcomeScreenProps> = ({
  config,
  onAuthSuccess,
  onOpenTerms,
}) => {
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Estados dos fluxos secundários (Uber style bottom sheet / modal)
  const [activeModal, setActiveModal] = useState<
    'password_login' | 'register_new' | 'email_login' | 'find_account' | 'social_confirm' | null
  >(null);

  // Dados para login com senha
  const [existingClientName, setExistingClientName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Dados para novo cadastro
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regAcceptedTerms, setRegAcceptedTerms] = useState(false);

  // Dados para login por e-mail
  const [emailIdentifier, setEmailIdentifier] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [isEmailRegister, setIsEmailRegister] = useState(false);
  const [emailRegAcceptedTerms, setEmailRegAcceptedTerms] = useState(false);

  // Dados para social (Google / Apple)
  const [socialProvider, setSocialProvider] = useState<'Google' | 'Apple'>('Google');
  const [socialName, setSocialName] = useState('');
  const [socialAcceptedTerms, setSocialAcceptedTerms] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  useEffect(() => {
    setTurnstileToken(null);
    setTurnstileResetKey(k => k + 1);
  }, [activeModal, isEmailRegister]);

  // Formata telefone enquanto digita
  const handlePhoneInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg('');
    const formatted = formatPhone(e.target.value);
    setPhone(formatted);
  };

  // Clique em "Continuar" após digitar telefone
  const handlePhoneSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg('');

    const cleanDigits = phone.replace(/\D/g, '');
    if (cleanDigits.length < 10) {
      setErrorMsg('Informe um número de telefone com DDD válido (ex: 48 99691-5303).');
      return;
    }

    setIsLoading(true);
    try {
      const check = await StorageService.checkClientExists(cleanDigits);
      setIsLoading(false);

      if (check.exists) {
        setExistingClientName(check.firstName || check.name || 'Passageiro');
        setLoginPassword('');
        setActiveModal('password_login');
      } else {
        setRegName('');
        setRegEmail('');
        setRegPassword('');
        setActiveModal('register_new');
      }
    } catch {
      setIsLoading(false);
      // Fallback para novo cadastro
      setActiveModal('register_new');
    }
  };

  // Confirmação de login com senha
  const handlePasswordLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!loginPassword) {
      setErrorMsg('Digite sua senha.');
      return;
    }
    if (isTurnstileEnabled() && !turnstileToken) {
      setErrorMsg('Confirme a verificação de segurança anti-robô.');
      return;
    }

    setIsLoading(true);
    const res = await StorageService.loginClient(phone, loginPassword, turnstileToken || undefined);
    setIsLoading(false);

    if (res.ok && res.client) {
      setActiveModal(null);
      onAuthSuccess(res.client);
    } else {
      setErrorMsg(res.error || 'Senha incorreta. Tente novamente.');
      setTurnstileResetKey(k => k + 1);
    }
  };

  // Confirmação de novo cadastro
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!regName.trim()) {
      setErrorMsg('Informe seu nome completo.');
      return;
    }
    if (!regPassword || regPassword.length < 4) {
      setErrorMsg('Crie uma senha de acesso com no mínimo 4 caracteres.');
      return;
    }
    if (!regAcceptedTerms) {
      setErrorMsg('Marque que concorda com os Termos de Uso para concluir o cadastro.');
      return;
    }
    if (isTurnstileEnabled() && !turnstileToken) {
      setErrorMsg('Confirme a verificação de segurança anti-robô.');
      return;
    }

    setIsLoading(true);
    const termsAcceptance = buildTermsAcceptancePayload(
      PASSENGER_TERMS_CONTRACT_ID,
      PASSENGER_TERMS_CONTRACT_VERSION,
      PASSENGER_TERMS_AFFIRMATIVE_TEXT
    );
    const res = await StorageService.registerClient({
      name: regName.trim(),
      phone: phone,
      email: regEmail.trim().toLowerCase(),
      document: '',
      password: regPassword,
      termsAcceptedAt: termsAcceptance.acceptedAtClient,
      termsAcceptance,
      turnstileToken: turnstileToken || undefined,
    });
    setIsLoading(false);

    if (res.ok && res.client) {
      setActiveModal(null);
      onAuthSuccess(res.client);
    } else {
      setErrorMsg(res.error || 'Não foi possível concluir o cadastro.');
      setTurnstileResetKey(k => k + 1);
    }
  };

  // Login por E-mail
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!emailIdentifier.includes('@')) {
      setErrorMsg('Digite um endereço de e-mail válido.');
      return;
    }
    if (!emailPassword || emailPassword.length < 4) {
      setErrorMsg('A senha deve ter no mínimo 4 caracteres.');
      return;
    }
    if (isEmailRegister && !emailRegAcceptedTerms) {
      setErrorMsg('Marque que concorda com os Termos de Uso para cadastrar sua conta.');
      return;
    }
    if (isTurnstileEnabled() && !turnstileToken) {
      setErrorMsg('Confirme a verificação de segurança anti-robô.');
      return;
    }

    if (isEmailRegister) {
      setIsLoading(true);
      const termsAcceptance = buildTermsAcceptancePayload(
        PASSENGER_TERMS_CONTRACT_ID,
        PASSENGER_TERMS_CONTRACT_VERSION,
        PASSENGER_TERMS_AFFIRMATIVE_TEXT
      );
      const res = await StorageService.registerClient({
        name: regName.trim() || 'Passageiro Kavro',
        phone: phone || '(48) 99999-0000',
        email: emailIdentifier.trim().toLowerCase(),
        document: '',
        password: emailPassword,
        termsAcceptedAt: termsAcceptance.acceptedAtClient,
        termsAcceptance,
        turnstileToken: turnstileToken || undefined,
      });
      setIsLoading(false);
      if (res.ok && res.client) {
        setActiveModal(null);
        onAuthSuccess(res.client);
      } else {
        setErrorMsg(res.error || 'Erro ao criar conta por e-mail.');
        setTurnstileResetKey(k => k + 1);
      }
    } else {
      setIsLoading(true);
      const res = await StorageService.loginClient(emailIdentifier, emailPassword, turnstileToken || undefined);
      setIsLoading(false);
      if (res.ok && res.client) {
        setActiveModal(null);
        onAuthSuccess(res.client);
      } else {
        setErrorMsg(res.error || 'E-mail ou senha incorretos.');
        setTurnstileResetKey(k => k + 1);
      }
    }
  };

  // Login 1-Click Social (Google / Apple)
  const handleSocialClick = (provider: 'Google' | 'Apple') => {
    setSocialProvider(provider);
    setSocialName('Passageiro ' + provider);
    setSocialAcceptedTerms(false);
    setErrorMsg('');
    setActiveModal('social_confirm');
  };

  const handleConfirmSocialLogin = async () => {
    setErrorMsg('');
    if (isTurnstileEnabled() && !turnstileToken) {
      setErrorMsg('Confirme a verificação de segurança anti-robô.');
      return;
    }
    setIsLoading(true);
    const mockEmail = `cliente.${socialProvider.toLowerCase()}@kavrodrive.com.br`;
    const check = await StorageService.checkClientExists(mockEmail);

    if (check.exists) {
      const loginRes = await StorageService.loginClient(mockEmail, 'kavro1234', turnstileToken || undefined);
      setIsLoading(false);
      if (loginRes.ok && loginRes.client) {
        setActiveModal(null);
        onAuthSuccess(loginRes.client);
        return;
      }
    }

    if (!socialAcceptedTerms) {
      setIsLoading(false);
      setErrorMsg('Marque que concorda com os Termos de Uso para criar seu acesso.');
      return;
    }

    const termsAcceptance = buildTermsAcceptancePayload(
      PASSENGER_TERMS_CONTRACT_ID,
      PASSENGER_TERMS_CONTRACT_VERSION,
      PASSENGER_TERMS_AFFIRMATIVE_TEXT
    );
    const regRes = await StorageService.registerClient({
      name: socialName.trim() || `Usuário ${socialProvider}`,
      phone: phone || '(48) 99999-0000',
      email: mockEmail,
      document: '',
      password: 'kavro1234',
      termsAcceptedAt: termsAcceptance.acceptedAtClient,
      termsAcceptance,
      turnstileToken: turnstileToken || undefined,
    });
    setIsLoading(false);
    if (regRes.ok && regRes.client) {
      setActiveModal(null);
      onAuthSuccess(regRes.client);
    } else {
      setErrorMsg(regRes.error || 'Erro na autenticação social.');
      setTurnstileResetKey(k => k + 1);
    }
  };

  const renderCompactTermsConsent = (checked: boolean, onToggle: (next: boolean) => void) => (
    <div style={{
      backgroundColor: checked ? '#F0FDF4' : '#F8FAFC',
      border: checked ? '1.5px solid #16A34A' : '1px solid #E2E8F0',
      borderRadius: 10,
      padding: '8px 11px',
      marginTop: 2
    }}>
      <label style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: '0.78rem',
        color: '#1F2937',
        cursor: 'pointer',
        lineHeight: 1.35,
        margin: 0
      }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => { onToggle(e.target.checked); setErrorMsg(''); }}
          style={{ accentColor: '#16A34A', flexShrink: 0, width: 16, height: 16, margin: 0 }}
        />
        <span style={{ textAlign: 'left' }}>
          Li e concordo com os{' '}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsTermsModalOpen(true); }}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: '#15803D',
              fontWeight: 700,
              textDecoration: 'underline',
              cursor: 'pointer',
              fontSize: 'inherit',
              textAlign: 'left',
              display: 'inline'
            }}
          >
            Termos de Uso
          </button>
          <span style={{ color: '#64748B', fontSize: '0.72rem' }}> (v{PASSENGER_TERMS_CONTRACT_VERSION})</span>
        </span>
      </label>
    </div>
  );

  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: '#FFFFFF',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: '#000000',
      position: 'relative',
      overflowX: 'hidden'
    }}>
      {/* Container Mobile Centralizado (Estilo App Uber) */}
      <div style={{
        width: '100%',
        maxWidth: 480,
        backgroundColor: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100dvh',
        boxSizing: 'border-box'
      }}>

        {/* 1. Imagem de Cabeçalho Oficial (HOME 2 fornecida pelo usuário) */}
        <div style={{
          width: '100%',
          height: 230,
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: '#F3F4F6'
        }}>
          <img
            src="/home-2.png"
            alt="KAVRO DRIVE"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center center',
              display: 'block'
            }}
          />

          {/* Botão sutil de suporte / WhatsApp no topo superior direito */}
          <a
            href={`https://wa.me/${getCleanWhatsappNumber(config.companyWhatsapp)}?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20no%20app%20Kavro%20Drive`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              backgroundColor: 'rgba(255, 255, 255, 0.92)',
              backdropFilter: 'blur(8px)',
              padding: '6px 12px',
              borderRadius: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: '0.72rem',
              fontWeight: 700,
              color: '#15803D',
              textDecoration: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
            }}
          >
            <WhatsAppIcon size={14} />
            <span>Ajuda</span>
          </a>
        </div>

        {/* 2. Conteúdo Principal */}
        <div style={{
          padding: '24px 20px 32px 20px',
          display: 'flex',
          flexDirection: 'column',
          flex: 1
        }}>

          {/* Título Oficial Uber Style */}
          <h1 style={{
            fontSize: '1.5rem',
            fontWeight: 800,
            lineHeight: 1.22,
            letterSpacing: '-0.025em',
            color: '#000000',
            margin: '0 0 20px 0'
          }}>
            Vá a qualquer lugar com o app da KAVRO DRIVE.
          </h1>

          {/* Formulário com Telefone */}
          <form onSubmit={handlePhoneSubmit}>
            <div style={{
              display: 'flex',
              gap: 8,
              marginBottom: 12
            }}>
              {/* Seletor de País com Bandeira do Brasil */}
              <button
                type="button"
                style={{
                  width: 86,
                  height: 52,
                  backgroundColor: '#F3F3F3',
                  border: 'none',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                <span style={{ fontSize: '1.25rem' }}>🇧🇷</span>
                <ChevronDown size={14} color="#000000" strokeWidth={2.5} />
              </button>

              {/* Input de Telefone (+55 DDD NÚMERO) */}
              <div style={{
                flex: 1,
                height: 52,
                backgroundColor: '#F3F3F3',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                padding: '0 16px',
                boxSizing: 'border-box'
              }}>
                <input
                  type="tel"
                  placeholder="+55 (11) 96123-4567"
                  value={phone ? `+55 ${phone}` : ''}
                  onChange={(e) => {
                    const raw = e.target.value.replace('+55', '').trim();
                    handlePhoneInputChange({ target: { value: raw } } as any);
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    backgroundColor: 'transparent',
                    fontSize: '1rem',
                    fontWeight: 600,
                    color: '#000000',
                    outline: 'none',
                    fontFamily: 'inherit'
                  }}
                />
                <User size={19} color="#717171" style={{ flexShrink: 0, marginLeft: 8 }} />
              </div>
            </div>

            {errorMsg && (
              <div style={{
                color: '#DC2626',
                fontSize: '0.8rem',
                fontWeight: 600,
                marginBottom: 12,
                padding: '8px 12px',
                backgroundColor: '#FEE2E2',
                borderRadius: 8
              }}>
                {errorMsg}
              </div>
            )}

            {/* Botão Preto Sólido Continuar */}
            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                height: 50,
                backgroundColor: '#000000',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 10,
                fontSize: '0.98rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'opacity 0.2s',
                opacity: isLoading ? 0.7 : 1
              }}
            >
              {isLoading ? 'Verificando...' : 'Continuar'}
            </button>
          </form>

          {/* Divisor "ou" */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            margin: '20px 0',
            gap: 12
          }}>
            <div style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB' }} />
            <span style={{ fontSize: '0.85rem', color: '#6B7280', fontWeight: 500 }}>ou</span>
            <div style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB' }} />
          </div>

          {/* Botões Sociais / Alternativos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* 1. Continuar com a Apple */}
            <button
              type="button"
              onClick={() => handleSocialClick('Apple')}
              style={{
                width: '100%',
                height: 50,
                backgroundColor: '#F3F3F3',
                border: 'none',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                fontSize: '0.95rem',
                fontWeight: 600,
                color: '#000000',
                cursor: 'pointer'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.89c.66-.82 1.11-1.96.99-3.1-.96.04-2.11.64-2.79 1.44-.6.69-1.12 1.83-.98 2.94 1.07.08 2.14-.55 2.78-1.28z"/>
              </svg>
              <span>Continuar com a Apple</span>
            </button>

            {/* 2. Continuar com o Google */}
            <button
              type="button"
              onClick={() => handleSocialClick('Google')}
              style={{
                width: '100%',
                height: 50,
                backgroundColor: '#F3F3F3',
                border: 'none',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                fontSize: '0.95rem',
                fontWeight: 600,
                color: '#000000',
                cursor: 'pointer'
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Continuar com o Google</span>
            </button>

            {/* 3. Continuar por e-mail */}
            <button
              type="button"
              onClick={() => {
                setErrorMsg('');
                setEmailIdentifier('');
                setEmailPassword('');
                setIsEmailRegister(false);
                setActiveModal('email_login');
              }}
              style={{
                width: '100%',
                height: 50,
                backgroundColor: '#F3F3F3',
                border: 'none',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                fontSize: '0.95rem',
                fontWeight: 600,
                color: '#000000',
                cursor: 'pointer'
              }}
            >
              <Mail size={18} color="#000000" />
              <span>Continuar por e-mail</span>
            </button>
          </div>

          {/* Divisor "ou" */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            margin: '20px 0',
            gap: 12
          }}>
            <div style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB' }} />
            <span style={{ fontSize: '0.85rem', color: '#6B7280', fontWeight: 500 }}>ou</span>
            <div style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB' }} />
          </div>

          {/* Link Encontrar minha conta */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => setActiveModal('find_account')}
              style={{
                background: 'none',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: '0.95rem',
                fontWeight: 600,
                color: '#000000',
                cursor: 'pointer',
                padding: '8px 12px'
              }}
            >
              <Search size={18} color="#000000" strokeWidth={2.4} />
              <span>Encontrar minha conta</span>
            </button>
          </div>

          {/* Disclaimer Legal Inferior (Idêntico ao Uber) */}
          <p style={{
            fontSize: '0.74rem',
            color: '#6B7280',
            lineHeight: 1.45,
            marginTop: 24,
            marginBottom: 0
          }}>
            Você concorda em receber um código de verificação por mensagem de texto ou WhatsApp.
            Sujeito a cobranças de taxas por uso de dados e envio de mensagens.{' '}
            <button
              type="button"
              onClick={onOpenTerms}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: '#000000',
                textDecoration: 'underline',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 'inherit'
              }}
            >
              Termos e Privacidade.
            </button>
          </p>
        </div>
      </div>

      {/* ── MODAIS UBER STYLE BOTTOM-SHEET ─────────────────── */}

      {/* 1. Modal: Digite sua Senha (Quando o telefone já existe) */}
      {activeModal === 'password_login' && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center'
        }}>
          <div style={{
            width: '100%',
            maxWidth: 480,
            maxHeight: '92dvh',
            overflowY: 'auto',
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: '20px 20px 28px 20px',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 4px 0', color: '#000000' }}>
                  Olá, {existingClientName}!
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#6B7280', margin: 0 }}>
                  Digite sua senha para acessar sua conta ({phone})
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setActiveModal(null); setErrorMsg(''); }}
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  backgroundColor: '#F3F4F6', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#374151'
                }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handlePasswordLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{
                height: 52,
                backgroundColor: '#F3F3F3',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                padding: '0 16px'
              }}>
                <Lock size={18} color="#717171" style={{ marginRight: 10 }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Sua senha"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  autoFocus
                  required
                  style={{
                    flex: 1,
                    height: '100%',
                    border: 'none',
                    backgroundColor: 'transparent',
                    fontSize: '1rem',
                    color: '#000000',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#717171' }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <TurnstileWidget theme="light" onVerify={setTurnstileToken} resetKey={turnstileResetKey} />

              {errorMsg && (
                <div style={{ color: '#DC2626', fontSize: '0.8rem', fontWeight: 600 }}>
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  height: 50,
                  backgroundColor: '#000000',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: '1rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {isLoading ? 'Entrando...' : 'Entrar'}
              </button>

              <div style={{ textAlign: 'center', marginTop: 4 }}>
                <a
                  href={`https://wa.me/${getCleanWhatsappNumber(config.companyWhatsapp)}?text=Ol%C3%A1%2C%20esqueci%20minha%20senha%20de%20passageiro%20para%20o%20telefone%20${phone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '0.85rem', color: '#15803D', fontWeight: 600, textDecoration: 'none' }}
                >
                  Esqueci minha senha • Recuperar via WhatsApp
                </a>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Modal: Criar Nova Conta (Quando o telefone é novo) */}
      {activeModal === 'register_new' && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center'
        }}>
          <div style={{
            width: '100%',
            maxWidth: 480,
            maxHeight: '92dvh',
            overflowY: 'auto',
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: '20px 20px 28px 20px',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 4px 0', color: '#000000' }}>
                  Crie sua conta
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#6B7280', margin: 0 }}>
                  Informe seu nome para começar a viajar ({phone})
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setActiveModal(null); setErrorMsg(''); }}
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  backgroundColor: '#F3F4F6', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#374151'
                }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#6B7280', fontWeight: 600, marginBottom: 4 }}>
                  Nome completo
                </label>
                <input
                  type="text"
                  placeholder="Ex: Lucas Pereira"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  autoFocus
                  required
                  style={{
                    width: '100%', height: 48, padding: '0 14px',
                    borderRadius: 10, border: 'none', backgroundColor: '#F3F3F3',
                    fontSize: '0.95rem', color: '#000', boxSizing: 'border-box', outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#6B7280', fontWeight: 600, marginBottom: 4 }}>
                  E-mail (opcional para recibos)
                </label>
                <input
                  type="email"
                  placeholder="seuemail@gmail.com"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  style={{
                    width: '100%', height: 48, padding: '0 14px',
                    borderRadius: 10, border: 'none', backgroundColor: '#F3F3F3',
                    fontSize: '0.95rem', color: '#000', boxSizing: 'border-box', outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#6B7280', fontWeight: 600, marginBottom: 4 }}>
                  Crie sua senha
                </label>
                <input
                  type="password"
                  placeholder="Mínimo 4 caracteres"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  required
                  style={{
                    width: '100%', height: 48, padding: '0 14px',
                    borderRadius: 10, border: 'none', backgroundColor: '#F3F3F3',
                    fontSize: '0.95rem', color: '#000', boxSizing: 'border-box', outline: 'none'
                  }}
                />
              </div>

              {renderCompactTermsConsent(regAcceptedTerms, setRegAcceptedTerms)}

              <TurnstileWidget theme="light" onVerify={setTurnstileToken} resetKey={turnstileResetKey} />

              {errorMsg && (
                <div style={{ color: '#DC2626', fontSize: '0.8rem', fontWeight: 600 }}>
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  height: 50,
                  backgroundColor: '#000000',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: '1rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  marginTop: 4
                }}
              >
                {isLoading ? 'Cadastrando...' : 'Concluir e Começar a Viajar'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 3. Modal: Login ou Cadastro por E-mail */}
      {activeModal === 'email_login' && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center'
        }}>
          <div style={{
            width: '100%',
            maxWidth: 480,
            maxHeight: '92dvh',
            overflowY: 'auto',
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: '20px 20px 28px 20px',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 4px 0', color: '#000000' }}>
                  {isEmailRegister ? 'Cadastre-se por e-mail' : 'Entrar por e-mail'}
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#6B7280', margin: 0 }}>
                  Acesse sua conta na KAVRO DRIVE
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setActiveModal(null); setErrorMsg(''); }}
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  backgroundColor: '#F3F4F6', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#374151'
                }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {isEmailRegister && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#6B7280', fontWeight: 600, marginBottom: 4 }}>Nome completo</label>
                  <input
                    type="text"
                    placeholder="Seu nome"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    required
                    style={{
                      width: '100%', height: 48, padding: '0 14px',
                      borderRadius: 10, border: 'none', backgroundColor: '#F3F3F3',
                      fontSize: '0.95rem', color: '#000', boxSizing: 'border-box', outline: 'none'
                    }}
                  />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#6B7280', fontWeight: 600, marginBottom: 4 }}>Endereço de E-mail</label>
                <input
                  type="email"
                  placeholder="nome@exemplo.com"
                  value={emailIdentifier}
                  onChange={(e) => setEmailIdentifier(e.target.value)}
                  autoFocus
                  required
                  style={{
                    width: '100%', height: 48, padding: '0 14px',
                    borderRadius: 10, border: 'none', backgroundColor: '#F3F3F3',
                    fontSize: '0.95rem', color: '#000', boxSizing: 'border-box', outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#6B7280', fontWeight: 600, marginBottom: 4 }}>Sua Senha</label>
                <input
                  type="password"
                  placeholder="Sua senha"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  required
                  style={{
                    width: '100%', height: 48, padding: '0 14px',
                    borderRadius: 10, border: 'none', backgroundColor: '#F3F3F3',
                    fontSize: '0.95rem', color: '#000', boxSizing: 'border-box', outline: 'none'
                  }}
                />
              </div>

              {isEmailRegister && renderCompactTermsConsent(emailRegAcceptedTerms, setEmailRegAcceptedTerms)}

              <TurnstileWidget theme="light" onVerify={setTurnstileToken} resetKey={turnstileResetKey} />

              {errorMsg && (
                <div style={{ color: '#DC2626', fontSize: '0.8rem', fontWeight: 600 }}>
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  height: 50,
                  backgroundColor: '#000000',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: '1rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  marginTop: 6
                }}
              >
                {isLoading ? 'Carregando...' : isEmailRegister ? 'Cadastrar' : 'Entrar'}
              </button>

              <button
                type="button"
                onClick={() => { setIsEmailRegister(!isEmailRegister); setErrorMsg(''); }}
                style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', marginTop: 4 }}
              >
                {isEmailRegister ? 'Já tenho conta? Fazer login' : 'Ainda não tem conta? Crie uma agora'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 4. Modal: Confirmação de Acesso Social (Google / Apple) */}
      {activeModal === 'social_confirm' && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center'
        }}>
          <div style={{
            width: '100%',
            maxWidth: 480,
            maxHeight: '92dvh',
            overflowY: 'auto',
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: '20px 20px 28px 20px',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 4px 0', color: '#000000' }}>
                  Acessar com {socialProvider}
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#6B7280', margin: 0 }}>
                  Acesso rápido com 1 toque
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  backgroundColor: '#F3F4F6', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#374151'
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#6B7280', fontWeight: 600, marginBottom: 4 }}>
                  Como podemos te chamar?
                </label>
                <input
                  type="text"
                  placeholder="Seu nome"
                  value={socialName}
                  onChange={(e) => setSocialName(e.target.value)}
                  style={{
                    width: '100%', height: 48, padding: '0 14px',
                    borderRadius: 10, border: 'none', backgroundColor: '#F3F3F3',
                    fontSize: '0.95rem', color: '#000', boxSizing: 'border-box', outline: 'none'
                  }}
                />
              </div>

              {renderCompactTermsConsent(socialAcceptedTerms, setSocialAcceptedTerms)}

              <TurnstileWidget theme="light" onVerify={setTurnstileToken} resetKey={turnstileResetKey} />

              {errorMsg && (
                <div style={{ color: '#DC2626', fontSize: '0.8rem', fontWeight: 600 }}>
                  {errorMsg}
                </div>
              )}

              <button
                type="button"
                onClick={handleConfirmSocialLogin}
                disabled={isLoading}
                style={{
                  height: 50,
                  backgroundColor: '#000000',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 10,
                  fontSize: '1rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {isLoading ? 'Conectando...' : `Continuar como ${socialName || socialProvider}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Modal: Encontrar minha conta */}
      {activeModal === 'find_account' && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center'
        }}>
          <div style={{
            width: '100%',
            maxWidth: 480,
            maxHeight: '92dvh',
            overflowY: 'auto',
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: '20px 20px 28px 20px',
            boxSizing: 'border-box'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 4px 0', color: '#000000' }}>
                  Recuperar Conta
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#6B7280', margin: 0 }}>
                  Encontre seus dados pelo WhatsApp ou com a central
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  backgroundColor: '#F3F4F6', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#374151'
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: '0.9rem', color: '#4B5563', lineHeight: 1.45, margin: 0 }}>
                Se você já viajou conosco ou não lembra sua senha, chame nossa central no WhatsApp para redefinição imediata do seu acesso.
              </p>

              <a
                href={`https://wa.me/${getCleanWhatsappNumber(config.companyWhatsapp)}?text=Ol%C3%A1%2C%20gostaria%20de%20localizar%20ou%20recuperar%20minha%20conta%20no%20app%20Kavro%20Drive`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  height: 50,
                  backgroundColor: '#15803D',
                  color: '#FFFFFF',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                  marginTop: 6
                }}
              >
                <WhatsAppIcon size={20} />
                <span>Falar no WhatsApp da Central</span>
              </a>
            </div>
          </div>
        </div>
      )}

      <PassengerTermsContractModal
        isOpen={isTermsModalOpen}
        onClose={() => setIsTermsModalOpen(false)}
        mode="passenger"
        config={config}
        draftSigner={{
          name: regName || socialName,
          phone,
          email: regEmail || emailIdentifier
        }}
        onAccept={() => {
          if (activeModal === 'email_login') {
            setEmailRegAcceptedTerms(true);
          } else if (activeModal === 'social_confirm') {
            setSocialAcceptedTerms(true);
          } else {
            setRegAcceptedTerms(true);
          }
          setErrorMsg('');
        }}
      />
    </div>
  );
};

