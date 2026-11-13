import React, { useState } from 'react';
import { X, KeyRound, ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react';
import { StorageService } from '../services/storage';
import { getCleanWhatsappNumber } from '../utils/format';

interface PasswordRecoveryModalProps {
  isOpen: boolean;
  role: 'client' | 'driver';
  initialIdentifier?: string;
  companyWhatsapp?: string;
  onClose: () => void;
  onRecovered?: (identifier: string) => void;
}

export const PasswordRecoveryModal: React.FC<PasswordRecoveryModalProps> = ({
  isOpen,
  role,
  initialIdentifier = '',
  companyWhatsapp = '',
  onClose,
  onRecovered,
}) => {
  const [step, setStep] = useState<'request' | 'reset' | 'done'>('request');
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [maskedDest, setMaskedDest] = useState('');
  const [devCodePreview, setDevCodePreview] = useState('');
  const [channels, setChannels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (isOpen) {
      setStep('request');
      setIdentifier(initialIdentifier);
      setCode('');
      setNewPassword('');
      setMaskedDest('');
      setDevCodePreview('');
      setChannels([]);
      setError('');
    }
  }, [isOpen, initialIdentifier]);

  if (!isOpen) return null;

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError(role === 'driver' ? 'Informe seu CPF, WhatsApp ou E-mail.' : 'Informe seu WhatsApp ou E-mail.');
      return;
    }
    setLoading(true);
    setError('');
    const res = await StorageService.requestPasswordRecovery(role, identifier.trim());
    setLoading(false);

    if (!res.ok) {
      setError(res.error || 'Conta não encontrada.');
      return;
    }

    setMaskedDest(res.maskedDestination || identifier.trim());
    setChannels(Array.isArray(res.channels) ? res.channels : []);
    setDevCodePreview(res.devCode || '');
    setStep('reset');
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.replace(/\D/g, '').length !== 6) {
      setError('Digite o código de 6 dígitos enviado.');
      return;
    }
    if (newPassword.length < 4) {
      setError('A nova senha deve ter no mínimo 4 caracteres.');
      return;
    }
    setLoading(true);
    setError('');
    const res = await StorageService.resetPasswordWithOtp(role, identifier.trim(), code.trim(), newPassword);
    setLoading(false);

    if (!res.ok) {
      setError(res.error || 'Não foi possível redefinir a senha.');
      return;
    }

    setStep('done');
    if (onRecovered) {
      onRecovered(identifier.trim());
    }
  };

  const cleanWa = getCleanWhatsappNumber(companyWhatsapp || '');

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      zIndex: 100050,
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'center'
    }}>
      <div style={{
        width: '100%',
        maxWidth: 480,
        backgroundColor: '#FFFFFF',
        color: '#111111',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        padding: '20px 20px calc(24px + env(safe-area-inset-bottom, 0px)) 20px',
        boxSizing: 'border-box',
        boxShadow: '0 -10px 35px rgba(0,0,0,0.25)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              backgroundColor: '#F3F4F6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <KeyRound size={18} color="#111111" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: '#111111' }}>
                Recuperar Senha ({role === 'driver' ? 'Motorista' : 'Passageiro'})
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#6B7280' }}>
                Redefinição instantânea com código de 6 dígitos
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar recuperação"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: '#F3F4F6',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#374151'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div style={{
            padding: '10px 12px',
            borderRadius: 10,
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#B91C1C',
            fontSize: '0.84rem',
            fontWeight: 600,
            marginBottom: 12
          }}>
            {error}
          </div>
        )}

        {step === 'request' && (
          <form onSubmit={handleRequestCode} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                {role === 'driver' ? 'CPF, WhatsApp ou E-mail cadastrado' : 'WhatsApp ou E-mail cadastrado'}
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={role === 'driver' ? 'Ex: 000.000.000-00 ou (48) 99999-9999' : 'Ex: (48) 99999-9999 ou voce@email.com'}
                style={{
                  width: '100%',
                  height: 48,
                  borderRadius: 12,
                  border: '1.5px solid #D1D5DB',
                  padding: '0 14px',
                  fontSize: '0.94rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                height: 48,
                borderRadius: 12,
                backgroundColor: '#111111',
                color: '#FFFFFF',
                border: 'none',
                fontSize: '0.94rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer'
              }}
            >
              <span>{loading ? 'Gerando código...' : 'Enviar código de verificação'}</span>
              {!loading && <ArrowRight size={17} />}
            </button>

            {cleanWa && (
              <a
                href={`https://wa.me/${cleanWa}?text=${encodeURIComponent(`Olá! Preciso de ajuda para recuperar minha conta ${role === 'driver' ? 'de motorista' : 'de passageiro'} no Kavro Drive.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  textAlign: 'center',
                  fontSize: '0.8rem',
                  color: '#6B7280',
                  fontWeight: 600,
                  textDecoration: 'none',
                  marginTop: 2
                }}
              >
                Sem acesso ao dispositivo? Falar com suporte no WhatsApp
              </a>
            )}
          </form>
        )}

        {step === 'reset' && (
          <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              padding: '10px 12px',
              borderRadius: 12,
              backgroundColor: '#EFF6FF',
              border: '1px solid #BFDBFE',
              color: '#1E3A8A',
              fontSize: '0.82rem',
              lineHeight: 1.4
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800 }}>
                <ShieldCheck size={16} />
                <span>Código gerado para {maskedDest}</span>
              </div>
              {channels.length > 0 && (
                <div style={{ marginTop: 2 }}>
                  Enviado via: <strong>{channels.join(', ')}</strong> (expira em 10 min).
                </div>
              )}
              {devCodePreview && (
                <div style={{
                  marginTop: 6,
                  padding: '6px 10px',
                  borderRadius: 8,
                  backgroundColor: '#FFFFFF',
                  border: '1px dashed #2563EB',
                  fontWeight: 800,
                  color: '#1D4ED8'
                }}>
                  Código de verificação (modo local): <span style={{ letterSpacing: 3 }}>{devCodePreview}</span>
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                Código de 6 dígitos
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                style={{
                  width: '100%',
                  height: 48,
                  borderRadius: 12,
                  border: '1.5px solid #D1D5DB',
                  padding: '0 14px',
                  fontSize: '1.1rem',
                  fontWeight: 800,
                  letterSpacing: 6,
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>
                Nova senha
              </label>
              <input
                type="password"
                placeholder="Mínimo 4 caracteres"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{
                  width: '100%',
                  height: 48,
                  borderRadius: 12,
                  border: '1.5px solid #D1D5DB',
                  padding: '0 14px',
                  fontSize: '0.94rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setStep('request')}
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: 12,
                  backgroundColor: '#F3F4F6',
                  color: '#374151',
                  border: 'none',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Reenviar
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  flex: 2,
                  height: 46,
                  borderRadius: 12,
                  backgroundColor: '#111111',
                  color: '#FFFFFF',
                  border: 'none',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {loading ? 'Salvando...' : 'Redefinir senha'}
              </button>
            </div>
          </form>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '12px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <CheckCircle2 size={44} color="#16A34A" />
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#111111' }}>
              Senha atualizada com sucesso!
            </div>
            <p style={{ margin: 0, fontSize: '0.86rem', color: '#4B5563' }}>
              Você já pode fazer login usando sua nova senha.
            </p>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: '100%',
                height: 46,
                marginTop: 6,
                borderRadius: 12,
                backgroundColor: '#111111',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              Voltar para o login
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
