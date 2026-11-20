import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  UserCheck,
  Users
} from 'lucide-react';
import { SystemConfig } from '../types';
import { StorageService } from '../services/storage';
import { formatCPF, formatPhone, isValidCPF } from '../utils/format';
import { TurnstileWidget, isTurnstileEnabled } from '../components/TurnstileWidget';

interface FamilyInviteScreenProps {
  config: SystemConfig;
}

export const FamilyInviteScreen: React.FC<FamilyInviteScreenProps> = ({ config }) => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [inviteData, setInviteData] = useState<{
    id: string;
    guardianName: string;
    teenName: string;
    teenPhone: string;
    teenBirthDate: string;
    teenAge: number;
    status: string;
    inviteToken: string;
    accountAlreadyExists: boolean;
  } | null>(null);

  const [document, setDocument] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(true);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Caso já tenha conta e precise entrar rápido
  const [loginPassword, setLoginPassword] = useState('');
  const currentUser = StorageService.getCurrentUser();

  useEffect(() => {
    if (!token) {
      setErrorMsg('Link de convite familiar ausente.');
      setLoading(false);
      return;
    }
    StorageService.getFamilyInviteByToken(token).then((res) => {
      setLoading(false);
      if (!res.ok || !res.invite) {
        setErrorMsg(res.error || 'Convite inválido, expirado ou revogado.');
        return;
      }
      setInviteData(res.invite);
    });
  }, [token]);

  const handleAcceptLoggedIn = async () => {
    if (!token) return;
    setSubmitting(true);
    setErrorMsg('');
    const res = await StorageService.acceptFamilyInvite(token);
    setSubmitting(false);
    if (!res.ok) {
      setErrorMsg(res.error || 'Não foi possível vincular sua conta.');
      return;
    }
    navigate('/cliente');
  };

  const handleLoginAndAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteData || !token) return;
    setSubmitting(true);
    setErrorMsg('');
    const loginRes = await StorageService.loginClient(
      inviteData.teenPhone,
      loginPassword,
      turnstileToken || undefined
    );
    if (!loginRes.ok) {
      setSubmitting(false);
      setErrorMsg(loginRes.error || 'Senha incorreta.');
      return;
    }
    const acceptRes = await StorageService.acceptFamilyInvite(token);
    setSubmitting(false);
    if (!acceptRes.ok) {
      setErrorMsg(acceptRes.error || 'Erro ao vincular conta ao Perfil Familiar.');
      return;
    }
    navigate('/cliente');
  };

  const handleCreateTeenAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteData || !token) return;
    setErrorMsg('');

    const cleanCpf = document.replace(/\D/g, '');
    if (!isValidCPF(cleanCpf)) {
      setErrorMsg('Informe um CPF válido de 11 dígitos.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMsg('Informe um e-mail válido.');
      return;
    }
    if (password.length < 4) {
      setErrorMsg('Crie uma senha com pelo menos 4 caracteres.');
      return;
    }
    if (!acceptedTerms) {
      setErrorMsg('Concorde com os Termos de Uso e Perfil Familiar para continuar.');
      return;
    }

    setSubmitting(true);
    const regRes = await StorageService.registerClient({
      name: inviteData.teenName,
      phone: inviteData.teenPhone,
      document: cleanCpf,
      email: email.trim().toLowerCase(),
      password,
      birthDate: inviteData.teenBirthDate,
      familyInviteToken: token,
      turnstileToken: turnstileToken || undefined,
      termsAcceptance: {
        accepted: true,
        contractId: 'kavro-teen-family-v1',
        contractVersion: '2026-V1',
        acceptedAtClient: new Date().toISOString(),
        affirmativeText: 'Aceite de cadastro vinculado ao Perfil Familiar de adolescente.'
      }
    });
    setSubmitting(false);

    if (!regRes.ok) {
      setErrorMsg(regRes.error || 'Erro ao criar sua conta adolescente.');
      return;
    }
    navigate('/cliente');
  };

  const brandName = config?.companyName || 'Kavro Drive';

  return (
    <div
      style={{
        minHeight: '100dvh',
        backgroundColor: '#0F172A',
        color: '#FFFFFF',
        display: 'flex',
        justifyContent: 'center',
        padding: '20px 16px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
    >
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <img
            src="/logo-02-sf.png"
            alt={brandName}
            style={{ width: 120, height: 52, objectFit: 'contain', margin: '0 auto 8px auto' }}
          />
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              backgroundColor: 'rgba(59, 130, 246, 0.18)',
              border: '1px solid rgba(96, 165, 250, 0.35)',
              color: '#93C5FD',
              padding: '4px 12px',
              borderRadius: 999,
              fontSize: '0.75rem',
              fontWeight: 800
            }}
          >
            <Users size={13} />
            <span>Perfil Familiar • Conta Adolescente (12–18 anos)</span>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: '#94A3B8' }}>
            <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto 10px auto' }} />
            <div>Validando link do convite familiar...</div>
          </div>
        ) : !inviteData ? (
          <div
            style={{
              backgroundColor: '#1E293B',
              border: '1px solid #334155',
              borderRadius: 18,
              padding: 24,
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#FCA5A5', marginBottom: 8 }}>
              Convite indisponível
            </div>
            <p style={{ fontSize: '0.88rem', color: '#CBD5E1', marginBottom: 18 }}>{errorMsg}</p>
            <button
              type="button"
              onClick={() => navigate('/cliente')}
              style={{
                width: '100%',
                height: 46,
                borderRadius: 12,
                border: 'none',
                backgroundColor: '#FFFFFF',
                color: '#111111',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              Ir para o app Kavro Drive
            </button>
          </div>
        ) : (
          <div
            style={{
              backgroundColor: '#1E293B',
              border: '1px solid #334155',
              borderRadius: 20,
              padding: 20,
              boxShadow: '0 18px 40px rgba(0,0,0,0.45)'
            }}
          >
            <h1 style={{ margin: '0 0 8px 0', fontSize: '1.42rem', fontWeight: 900, lineHeight: 1.2 }}>
              {inviteData.guardianName} convidou você para o Perfil Familiar
            </h1>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.86rem', color: '#CBD5E1', lineHeight: 1.45 }}>
              Sua conta adolescente contará com K-Código obrigatório no embarque, K-Ajuda e
              acompanhamento ao vivo pelo responsável durante todas as corridas.
            </p>

            <div
              style={{
                backgroundColor: '#0F172A',
                border: '1px solid #334155',
                borderRadius: 12,
                padding: '12px 14px',
                marginBottom: 18,
                fontSize: '0.82rem',
                color: '#E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}
            >
              <div>
                <strong>Adolescente:</strong> {inviteData.teenName} ({inviteData.teenAge} anos)
              </div>
              <div>
                <strong>WhatsApp:</strong> {formatPhone(inviteData.teenPhone)}
              </div>
              <div>
                <strong>Nascimento:</strong> {inviteData.teenBirthDate}
              </div>
            </div>

            {errorMsg && (
              <div
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.16)',
                  border: '1px solid rgba(239, 68, 68, 0.45)',
                  color: '#FCA5A5',
                  borderRadius: 10,
                  padding: '9px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  marginBottom: 14
                }}
              >
                {errorMsg}
              </div>
            )}

            {currentUser?.id && inviteData.status === 'convite_enviado' ? (
              <div>
                <div
                  style={{
                    backgroundColor: 'rgba(34,197,94,0.14)',
                    border: '1px solid rgba(34,197,94,0.4)',
                    borderRadius: 12,
                    padding: 12,
                    fontSize: '0.82rem',
                    color: '#BBF7D0',
                    marginBottom: 14
                  }}
                >
                  Você está conectado como <strong>{currentUser.name}</strong>. Confirme abaixo
                  para vincular sua conta ao Perfil Familiar de {inviteData.guardianName}.
                </div>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleAcceptLoggedIn}
                  style={{
                    width: '100%',
                    height: 48,
                    borderRadius: 12,
                    border: 'none',
                    backgroundColor: '#76D800',
                    color: '#0F172A',
                    fontSize: '0.95rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8
                  }}
                >
                  <CheckCircle2 size={18} />
                  <span>{submitting ? 'Vinculando...' : 'Aceitar convite e entrar'}</span>
                </button>
              </div>
            ) : inviteData.accountAlreadyExists ? (
              <form onSubmit={handleLoginAndAccept} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: '0.84rem', color: '#93C5FD', fontWeight: 600 }}>
                  Este WhatsApp já possui conta na {brandName}. Digite sua senha para aceitar o
                  vínculo com o Perfil Familiar:
                </div>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 15 }} />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Sua senha"
                    required
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      height: 46,
                      borderRadius: 12,
                      border: '1px solid #334155',
                      backgroundColor: '#0F172A',
                      color: '#FFFFFF',
                      padding: '0 40px 0 38px',
                      fontSize: '0.92rem'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((p) => !p)}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: 12,
                      background: 'none',
                      border: 'none',
                      color: '#94A3B8',
                      cursor: 'pointer'
                    }}
                  >
                    {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>

                {isTurnstileEnabled() && <TurnstileWidget onVerify={(tok) => setTurnstileToken(tok || '')} />}

                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    width: '100%',
                    height: 48,
                    borderRadius: 12,
                    border: 'none',
                    backgroundColor: '#76D800',
                    color: '#0F172A',
                    fontSize: '0.95rem',
                    fontWeight: 900,
                    cursor: 'pointer'
                  }}
                >
                  {submitting ? 'Confirmando...' : 'Entrar e aceitar Perfil Familiar'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleCreateTeenAccount} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#CBD5E1', marginBottom: 5 }}>
                    CPF do adolescente
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={document}
                    onChange={(e) => setDocument(formatCPF(e.target.value))}
                    placeholder="000.000.000-00"
                    required
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      height: 44,
                      borderRadius: 10,
                      border: '1px solid #334155',
                      backgroundColor: '#0F172A',
                      color: '#FFFFFF',
                      padding: '0 12px',
                      fontSize: '0.92rem'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#CBD5E1', marginBottom: 5 }}>
                    E-mail
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 14 }} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seuemail@exemplo.com"
                      required
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        height: 44,
                        borderRadius: 10,
                        border: '1px solid #334155',
                        backgroundColor: '#0F172A',
                        color: '#FFFFFF',
                        padding: '0 12px 0 36px',
                        fontSize: '0.92rem'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#CBD5E1', marginBottom: 5 }}>
                    Crie sua senha
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: 14 }} />
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 4 caracteres"
                      required
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        height: 44,
                        borderRadius: 10,
                        border: '1px solid #334155',
                        backgroundColor: '#0F172A',
                        color: '#FFFFFF',
                        padding: '0 38px 0 36px',
                        fontSize: '0.92rem'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((p) => !p)}
                      style={{
                        position: 'absolute',
                        right: 10,
                        top: 12,
                        background: 'none',
                        border: 'none',
                        color: '#94A3B8',
                        cursor: 'pointer'
                      }}
                    >
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '0.78rem', color: '#CBD5E1', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    style={{ marginTop: 2, accentColor: '#76D800' }}
                  />
                  <span>
                    Concordo com os Termos de Uso da {brandName} e confirmo meu vínculo supervisionado
                    no Perfil Familiar de <strong>{inviteData.guardianName}</strong>.
                  </span>
                </label>

                {isTurnstileEnabled() && <TurnstileWidget onVerify={(tok) => setTurnstileToken(tok || '')} />}

                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    width: '100%',
                    height: 48,
                    borderRadius: 12,
                    border: 'none',
                    backgroundColor: '#76D800',
                    color: '#0F172A',
                    fontSize: '0.95rem',
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8
                  }}
                >
                  <UserCheck size={18} />
                  <span>{submitting ? 'Ativando conta...' : 'Ativar conta adolescente'}</span>
                  <ArrowRight size={16} />
                </button>
              </form>
            )}

            <div
              style={{
                marginTop: 16,
                paddingTop: 12,
                borderTop: '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: '0.74rem',
                color: '#94A3B8'
              }}
            >
              <ShieldCheck size={15} color="#60A5FA" style={{ flexShrink: 0 }} />
              <span>Todas as viagens terão K-Código e compartilhamento automático ativo.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
