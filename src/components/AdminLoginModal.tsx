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
        backgroundColor: '#121A21',
        border: '1px solid rgba(118, 216, 0, 0.3)',
        borderRadius: 22,
        padding: '22px 18px',
        maxWidth: 350,
        width: '100%',
        color: '#ffffff',
        textAlign: 'center',
        boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        animation: 'fadeIn 0.2s ease'
      }}>
        <div style={{
          width: 58,
          height: 58,
          borderRadius: 16,
          backgroundColor: '#0D1318',
          border: '1.5px solid rgba(118, 216, 0, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 12px auto',
          padding: 5
        }}>
          <img src="/pwa-icon-192.png" alt="Kavro Drive" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 10 }} />
        </div>

        <h3 style={{ fontSize: '1.12rem', fontWeight: 800, marginBottom: 4 }}>
          Painel Administrativo Master
        </h3>
        <p style={{ fontSize: '0.76rem', color: '#94A3B8', marginBottom: 14 }}>
          Acesso exclusivo por e-mail e senha autorizados
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <Mail size={16} style={{ position: 'absolute', left: 12, top: 14, color: '#76D800' }} />
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
                width: '100%',
                height: 44,
                padding: '0 14px 0 36px',
                borderRadius: 12,
                border: errorMsg ? '1.5px solid #EF4444' : '1.5px solid #2C3E50',
                backgroundColor: '#1B2631',
                color: '#ffffff',
                fontSize: '0.9rem',
                fontWeight: 600,
                boxSizing: 'border-box',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ position: 'relative' }}>
            <Lock size={16} style={{ position: 'absolute', left: 12, top: 14, color: '#76D800' }} />
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
                width: '100%',
                height: 44,
                padding: '0 38px 0 36px',
                borderRadius: 12,
                border: errorMsg ? '1.5px solid #EF4444' : '1.5px solid #2C3E50',
                backgroundColor: '#1B2631',
                color: '#ffffff',
                fontSize: '0.9rem',
                fontWeight: 600,
                boxSizing: 'border-box',
                outline: 'none'
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
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
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <TurnstileWidget theme="dark" onVerify={setTurnstileToken} resetKey={turnstileResetKey} />

          {errorMsg && (
            <div style={{ color: '#F87171', fontSize: '0.75rem', fontWeight: 700 }}>
              {errorMsg}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 12,
                backgroundColor: '#1E293B',
                color: '#CBD5E1',
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
              className="btn-primary"
              style={{ flex: 2, padding: 12 }}
            >
              {isLoading ? 'Verificando...' : 'Entrar no Painel'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
