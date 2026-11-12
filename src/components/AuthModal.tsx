import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  User, Phone, Mail, FileText, Lock, ArrowRight, ArrowLeft,
  CheckCircle2, LogIn, Eye, EyeOff 
} from 'lucide-react';
import { ClientProfile } from '../types';
import { StorageService } from '../services/storage';
import { formatPhone, formatCPF } from '../utils/format';
import { TermsPrivacyModal } from './TermsPrivacyModal';
import { TurnstileWidget, isTurnstileEnabled } from './TurnstileWidget';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (client: ClientProfile) => void;
  initialMode?: 'register' | 'login';
  allowDismiss?: boolean;
  customTitle?: string;
  customSubtitle?: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialMode = 'register',
  allowDismiss = true,
  customTitle,
  customSubtitle,
}) => {
  const [mode, setMode] = useState<'register' | 'login'>(initialMode);
  
  // Etapa do cadastro multi-step (1 a 3)
  const [step, setStep] = useState<number>(1);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  // Campos de Cadastro
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cpfOrDoc, setCpfOrDoc] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);

  // Login por E-mail ou WhatsApp + Senha (validado no servidor)
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Resetar estado ao trocar modo
  useEffect(() => {
    setStep(1);
    setErrorMsg('');
    setIsSubmitting(false);
    setName('');
    setPhone('');
    setCpfOrDoc('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setLoginEmail('');
    setLoginPassword('');
    setShowLoginPassword(false);
  }, [mode]);

  // Sincronizar o modo com a prop initialMode sempre que o modal for aberto ou initialMode mudar
  useEffect(() => {
    setMode(initialMode);
    setStep(1);
    setErrorMsg('');
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  // Handlers de formatação automática
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value));
  };

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCpfOrDoc(formatCPF(e.target.value));
  };

  // Navegação entre etapas do cadastro (autenticação segura no servidor)
  const handleNextStep = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (step === 1) {
      if (!name.trim()) {
        setErrorMsg('Por favor, informe seu nome completo.');
        return;
      }
      if (!phone.trim() || phone.replace(/\D/g, '').length < 10) {
        setErrorMsg('Por favor, informe um WhatsApp válido com DDD.');
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      if (!cpfOrDoc.trim() || cpfOrDoc.replace(/\D/g, '').length < 11) {
        setErrorMsg('Por favor, informe um CPF válido com 11 dígitos.');
        return;
      }
      setStep(3);
      return;
    }

    if (step === 3) {
      if (!email.trim() || !email.includes('@')) {
        setErrorMsg('Por favor, informe um e-mail válido.');
        return;
      }
      if (!password || password.length < 4) {
        setErrorMsg('A senha deve ter no mínimo 4 caracteres.');
        return;
      }
      if (!acceptedTerms) {
        setErrorMsg('Você deve ler e concordar com os Termos de Uso e Política de Privacidade (LGPD) para concluir o cadastro.');
        return;
      }
      if (isTurnstileEnabled() && !turnstileToken) {
        setErrorMsg('Confirme a verificação de segurança anti-robô para concluir o cadastro.');
        return;
      }

      setIsSubmitting(true);
      const res = await StorageService.registerClient({
        name: name.trim(),
        phone: phone.trim(),
        document: cpfOrDoc.trim(),
        email: email.trim(),
        password,
        termsAcceptedAt: new Date().toISOString(),
        turnstileToken: turnstileToken || undefined
      });
      setIsSubmitting(false);

      if (!res.ok || !res.client) {
        setErrorMsg(res.error || 'Não foi possível criar a conta. Verifique os dados.');
        setTurnstileResetKey(k => k + 1);
        return;
      }

      StorageService.clearRecentDestinations();
      await StorageService.syncFromDatabase();
      onSuccess(res.client);
      onClose();
    }
  };

  const handlePrevStep = () => {
    setErrorMsg('');
    if (step > 1) {
      setStep(step - 1);
    }
  };

  // Login do cliente validado no servidor (suporta E-mail ou WhatsApp + Senha)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!loginEmail.trim()) {
      setErrorMsg('Informe seu E-mail ou WhatsApp cadastrado.');
      return;
    }

    if (!loginPassword) {
      setErrorMsg('Informe sua senha.');
      return;
    }
    if (isTurnstileEnabled() && !turnstileToken) {
      setErrorMsg('Confirme a verificação de segurança anti-robô para entrar.');
      return;
    }

    setIsSubmitting(true);
    const res = await StorageService.loginClient(loginEmail.trim(), loginPassword, turnstileToken || undefined);
    setIsSubmitting(false);

    if (!res.ok || !res.client) {
      setErrorMsg(res.error || 'E-mail/WhatsApp ou senha incorretos.');
      setTurnstileResetKey(k => k + 1);
      return;
    }

    await StorageService.syncFromDatabase();
    onSuccess(res.client);
    onClose();
  };

  return createPortal(
    <div 
      className="modal-backdrop"
      onClick={(e) => {
        if (allowDismiss && e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="modal-sheet" 
        style={{ 
          padding: 0, 
          overflowY: 'auto',
          backgroundColor: '#FFFFFF',
          borderRadius: '28px 28px 0 0',
          boxShadow: '0 -15px 45px rgba(18, 26, 33, 0.4)'
        }}
      >
        {/* Banner Superior */}
        <div style={{
          background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
          padding: '24px 22px 18px 22px',
          color: '#121A21',
          position: 'relative',
          overflow: 'hidden',
          borderBottom: '3px solid #76D800'
        }}>
          {/* Efeito de iluminação sutil verde-limão */}
          <div style={{
            position: 'absolute',
            top: -30,
            right: -30,
            width: 140,
            height: 140,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(118, 216, 0, 0.25) 0%, rgba(118, 216, 0, 0) 70%)',
            pointerEvents: 'none'
          }} />

          {/* Botão Fechar no canto superior se permitido */}
          {allowDismiss && (
            <button
              onClick={onClose}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: '#E2E8F0',
                border: 'none',
                borderRadius: '50%',
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#334155',
                cursor: 'pointer',
                zIndex: 2,
                fontWeight: 700
              }}
            >
              ✕
            </button>
          )}

          {/* Logo Oficial Kavro Drive Centralizada */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <img
              src="/logo-horizontal.png"
              alt="Kavro Drive"
              style={{ height: 48, objectFit: 'contain' }}
            />
          </div>

          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#121A21', letterSpacing: '-0.02em', marginBottom: 4 }}>
              {customTitle || (mode === 'register' ? 'Criar Conta de Passageiro' : 'Acessar Minha Conta')}
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#64748B', lineHeight: 1.35 }}>
              {customSubtitle || (mode === 'register' 
                ? 'Cadastro simples e rápido para você pedir suas corridas na hora.' 
                : 'Informe seu e-mail e senha para acessar sua conta.')}
            </p>
          </div>
        </div>

        {/* Corpo Interno do Modal */}
        <div style={{ padding: '20px 22px 28px 22px' }}>
          {/* Abas: Já Tenho Conta / Criar Cadastro */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
            backgroundColor: '#F1F5F9',
            padding: 4,
            borderRadius: 14,
            marginBottom: 18,
            border: '1px solid #E2E8F0'
          }}>
            <button
              type="button"
              onClick={() => { setMode('login'); setErrorMsg(''); }}
              style={{
                padding: '10px 14px',
                borderRadius: 11,
                fontSize: '0.85rem',
                fontWeight: 700,
                border: 'none',
                backgroundColor: mode === 'login' ? '#121A21' : 'transparent',
                color: mode === 'login' ? '#76D800' : '#64748B',
                boxShadow: mode === 'login' ? '0 2px 8px rgba(18,26,33,0.2)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Já Tenho Conta
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setErrorMsg(''); }}
              style={{
                padding: '10px 14px',
                borderRadius: 11,
                fontSize: '0.85rem',
                fontWeight: 700,
                border: 'none',
                backgroundColor: mode === 'register' ? '#121A21' : 'transparent',
                color: mode === 'register' ? '#76D800' : '#64748B',
                boxShadow: mode === 'register' ? '0 2px 8px rgba(18,26,33,0.2)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Criar Cadastro
            </button>
          </div>

          {errorMsg && (
            <div style={{
              backgroundColor: '#FEE2E2',
              color: '#991B1B',
              padding: '10px 14px',
              borderRadius: 10,
              fontSize: '0.8rem',
              fontWeight: 600,
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              ⚠️ {errorMsg}
            </div>
          )}

          {/* ================= MODO CADASTRO (POR ETAPAS) ================= */}
          {mode === 'register' ? (
            <div>
              {/* Barra de Progresso das Etapas */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    backgroundColor: '#121A21',
                    color: '#76D800',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {step}
                  </span>
                  <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#121A21' }}>
                    {step === 1 && 'Identificação & Contato'}
                    {step === 2 && 'Documento Oficial'}
                    {step === 3 && 'Acesso & Segurança'}
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B' }}>
                  Etapa {step} de 3
                </span>
              </div>

              {/* Linha visual de progresso */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
                <div style={{ height: 4, flex: 1, borderRadius: 2, backgroundColor: '#76D800' }} />
                <div style={{ height: 4, flex: 1, borderRadius: 2, backgroundColor: step >= 2 ? '#76D800' : '#E2E8F0', transition: 'all 0.25s' }} />
                <div style={{ height: 4, flex: 1, borderRadius: 2, backgroundColor: step >= 3 ? '#76D800' : '#E2E8F0', transition: 'all 0.25s' }} />
              </div>

              <form onSubmit={handleNextStep} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* ETAPA 1: Nome Completo + WhatsApp */}
                {step === 1 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                        Nome Completo *
                      </label>
                      <div style={{ position: 'relative' }}>
                        <User size={18} style={{ position: 'absolute', left: 14, top: 14, color: '#94A3B8' }} />
                        <input
                          type="text"
                          placeholder="Digite seu nome completo"
                          value={name}
                          autoFocus
                          onChange={(e) => setName(e.target.value)}
                          style={{ width: '100%', padding: '13px 14px 13px 42px', borderRadius: 12, border: '1.5px solid #CBD5E1', fontSize: '0.92rem', background: '#FAFBFC' }}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                        Celular / WhatsApp com DDD *
                      </label>
                      <div style={{ position: 'relative' }}>
                        <Phone size={18} style={{ position: 'absolute', left: 14, top: 14, color: '#94A3B8' }} />
                        <input
                          type="tel"
                          placeholder="(11) 99999-9999"
                          value={phone}
                          onChange={handlePhoneChange}
                          inputMode="numeric"
                          style={{ width: '100%', padding: '13px 14px 13px 42px', borderRadius: 12, border: '1.5px solid #CBD5E1', fontSize: '0.92rem', background: '#FAFBFC' }}
                          required
                        />
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 4, display: 'block' }}>
                        Você receberá as confirmações de corrida neste número.
                      </span>
                    </div>

                    <button
                      type="submit"
                      className="btn-ios-primary"
                      style={{ marginTop: 4 }}
                    >
                      <span>Avançar para Documento</span>
                      <ArrowRight size={19} />
                    </button>
                  </div>
                )}

                {/* ETAPA 2: CPF */}
                {step === 2 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                        CPF do Titular *
                      </label>
                      <div style={{ position: 'relative' }}>
                        <FileText size={18} style={{ position: 'absolute', left: 14, top: 14, color: '#94A3B8' }} />
                        <input
                          type="text"
                          placeholder="000.000.000-00"
                          value={cpfOrDoc}
                          autoFocus
                          onChange={handleCpfChange}
                          inputMode="numeric"
                          maxLength={14}
                          style={{ width: '100%', padding: '13px 14px 13px 42px', borderRadius: 12, border: '1.5px solid #CBD5E1', fontSize: '0.92rem', background: '#FAFBFC', letterSpacing: '0.05em' }}
                          required
                        />
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 4, display: 'block' }}>
                        Utilizado para segurança e emissão dos recibos de viagem.
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                      <button
                        type="button"
                        onClick={handlePrevStep}
                        className="btn-ios-secondary"
                        style={{ flex: 1 }}
                      >
                        <ArrowLeft size={16} />
                        <span>Voltar</span>
                      </button>
                      <button
                        type="submit"
                        className="btn-ios-primary"
                        style={{ flex: 2 }}
                      >
                        <span>Avançar</span>
                        <ArrowRight size={19} />
                      </button>
                    </div>
                  </div>
                )}

                {/* ETAPA 3: E-mail + Senha de Acesso */}
                {step === 3 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                        E-mail para recibos *
                      </label>
                      <div style={{ position: 'relative' }}>
                        <Mail size={18} style={{ position: 'absolute', left: 14, top: 14, color: '#94A3B8' }} />
                        <input
                          type="email"
                          placeholder="seuemail@exemplo.com"
                          value={email}
                          autoFocus
                          onChange={(e) => setEmail(e.target.value)}
                          style={{ width: '100%', padding: '13px 14px 13px 42px', borderRadius: 12, border: '1.5px solid #CBD5E1', fontSize: '0.92rem', background: '#FAFBFC' }}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                        Crie sua Senha de Acesso *
                      </label>
                      <div style={{ position: 'relative' }}>
                        <Lock size={18} style={{ position: 'absolute', left: 14, top: 14, color: '#94A3B8' }} />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Mínimo 4 caracteres"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          style={{ width: '100%', padding: '13px 44px 13px 42px', borderRadius: 12, border: '1.5px solid #CBD5E1', fontSize: '0.92rem', background: '#FAFBFC' }}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          style={{
                            position: 'absolute',
                            right: 12,
                            top: 14,
                            background: 'none',
                            border: 'none',
                            color: '#64748B',
                            cursor: 'pointer'
                          }}
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 4, display: 'block' }}>
                        Guarde esta senha para entrar rapidamente nos próximos acessos.
                      </span>
                    </div>

                    {/* Termos de Uso e Política de Privacidade (LGPD & Gravação de GPS) */}
                    <div
                      style={{
                        backgroundColor: '#F8FAFC',
                        borderRadius: 12,
                        padding: '10px 12px',
                        border: acceptedTerms ? '1.5px solid #86EFAC' : '1.5px solid #CBD5E1',
                        transition: 'border-color 0.2s ease',
                      }}
                    >
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={acceptedTerms}
                          onChange={(e) => setAcceptedTerms(e.target.checked)}
                          style={{
                            width: 18,
                            height: 18,
                            accentColor: '#16A34A',
                            cursor: 'pointer',
                            marginTop: 2,
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: '0.74rem', color: '#334155', lineHeight: 1.45 }}>
                          Li e concordo com os{' '}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setIsTermsOpen(true);
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              color: '#15803D',
                              fontWeight: 800,
                              textDecoration: 'underline',
                              cursor: 'pointer',
                              display: 'inline',
                            }}
                          >
                            Termos de Uso e Política de Privacidade (LGPD)
                          </button>
                          . Estou ciente de que as <strong>rotas e dados de GPS são gravados</strong> para segurança mútua do passageiro e motorista.
                        </span>
                      </label>
                    </div>

                    <TurnstileWidget theme="dark" onVerify={setTurnstileToken} resetKey={turnstileResetKey} />

                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                      <button
                        type="button"
                        onClick={handlePrevStep}
                        className="btn-ios-secondary"
                        style={{ flex: 1 }}
                      >
                        <ArrowLeft size={16} />
                        <span>Voltar</span>
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="btn-ios-primary"
                        style={{ flex: 2, opacity: isSubmitting ? 0.7 : 1 }}
                      >
                        <CheckCircle2 size={19} />
                        <span>{isSubmitting ? 'Cadastrando...' : 'Finalizar Cadastro'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </form>
            </div>
          ) : (
            /* ================= MODO LOGIN COM E-MAIL OU WHATSAPP + SENHA ================= */
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  E-mail ou WhatsApp Cadastrado *
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={18} style={{ position: 'absolute', left: 14, top: 14, color: '#94A3B8' }} />
                  <input
                    type="text"
                    placeholder="seuemail@exemplo.com ou (48) 99999-9999"
                    value={loginEmail}
                    autoFocus
                    onChange={(e) => setLoginEmail(e.target.value)}
                    style={{ width: '100%', padding: '13px 14px 13px 42px', borderRadius: 12, border: '1.5px solid #CBD5E1', fontSize: '0.95rem', background: '#FAFBFC' }}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Sua Senha de Acesso *
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={18} style={{ position: 'absolute', left: 14, top: 14, color: '#94A3B8' }} />
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    placeholder="Digite sua senha"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    style={{ width: '100%', padding: '13px 44px 13px 42px', borderRadius: 12, border: '1.5px solid #CBD5E1', fontSize: '0.95rem', background: '#FAFBFC' }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    style={{
                      position: 'absolute',
                      right: 12,
                      top: 14,
                      background: 'none',
                      border: 'none',
                      color: '#64748B',
                      cursor: 'pointer'
                    }}
                  >
                    {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <TurnstileWidget theme="dark" onVerify={setTurnstileToken} resetKey={turnstileResetKey} />

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-ios-primary"
                style={{ marginTop: 6, opacity: isSubmitting ? 0.7 : 1 }}
              >
                <LogIn size={18} />
                <span>{isSubmitting ? 'Autenticando...' : 'Entrar na Minha Conta'}</span>
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Modal de Termos de Uso e Política de Privacidade (LGPD) */}
      <TermsPrivacyModal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
      />
    </div>,
    document.body
  );
};
