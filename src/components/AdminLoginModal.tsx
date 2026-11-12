import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { StorageService } from '../services/storage';
import { TurnstileWidget, isTurnstileEnabled } from './TurnstileWidget';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Informe o e-mail de administrador.');
      return;
    }
    if (!password) {
      setErrorMsg('Digite sua senha.');
      return;
    }
    if (isTurnstileEnabled() && !turnstileToken) {
      setErrorMsg('Confirme a verificação anti-robô.');
      return;
    }

    setIsLoading(true);
    const res = await StorageService.loginMasterAdmin(cleanEmail, password, turnstileToken || undefined);
    setIsLoading(false);

    if (res.ok) {
      onSuccess();
    } else {
      setErrorMsg(res.error || 'Acesso negado.');
      setTurnstileResetKey(k => k + 1);
    }
  };

  return createPortal(
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        alignItems: 'center',
        padding: 16
      }}
    >
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderRadius: 18,
        padding: '24px 20px',
        maxWidth: 360,
        width: '100%',
        color: '#000000',
        textAlign: 'left',
        boxShadow: '0 20px 50px rgba(0,0,0,0.22)',
        animation: 'fadeIn 0.2s ease'
      }}>
        <div style={{
          display: 'inline-block',
          fontSize: '0.68rem',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: '#52525B',
          backgroundColor: '#F3F4F6',
          padding: '3px 9px',
          borderRadius: 999,
          marginBottom: 8
        }}>
          Painel Master
        </div>

        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 4px 0', color: '#000000' }}>
          Entrar no Painel Master
        </h3>
        <p style={{ fontSize: '0.84rem', color: '#6B7280', margin: '0 0 16px 0' }}>
          Acesso exclusivo com e-mail e senha autorizados
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{
            height: 48,
            backgroundColor: '#F3F3F3',
            borderRadius: 10,
            border: errorMsg ? '1.5px solid #DC2626' : '1.5px solid transparent',
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            boxSizing: 'border-box'
          }}>
            <Mail size={16} color="#52525B" style={{ marginRight: 10, flexShrink: 0 }} />
            <input
              type="email"
              placeholder="E-mail administrador"
              value={email}
              autoFocus
              required
              onChange={(e) => {
                setEmail(e.target.value);
                setErrorMsg('');
              }}
              style={{
                flex: 1,
                height: '100%',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#000000',
                fontSize: '0.94rem',
                fontWeight: 500,
                outline: 'none'
              }}
            />
          </div>

          <div style={{
            height: 48,
            backgroundColor: '#F3F3F3',
            borderRadius: 10,
            border: errorMsg ? '1.5px solid #DC2626' : '1.5px solid transparent',
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            boxSizing: 'border-box'
          }}>
            <Lock size={16} color="#52525B" style={{ marginRight: 10, flexShrink: 0 }} />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Sua senha"
              value={password}
              required
              onChange={(e) => {
                setPassword(e.target.value);
                setErrorMsg('');
              }}
              style={{
                flex: 1,
                height: '100%',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#000000',
                fontSize: '0.94rem',
                fontWeight: 500,
                outline: 'none'
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                background: 'none',
                border: 'none',
                color: '#52525B',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <TurnstileWidget theme="light" onVerify={setTurnstileToken} resetKey={turnstileResetKey} />

          {errorMsg && (
            <div style={{ color: '#DC2626', fontSize: '0.78rem', fontWeight: 600 }}>
              {errorMsg}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                height: 46,
                borderRadius: 10,
                backgroundColor: '#F3F3F3',
                color: '#111827',
                fontSize: '0.9rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              style={{
                flex: 2,
                height: 46,
                borderRadius: 10,
                backgroundColor: '#000000',
                color: '#FFFFFF',
                fontSize: '0.92rem',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer'
              }}
            >
              {isLoading ? 'Verificando...' : 'Entrar'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
