import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Key } from 'lucide-react';
import { StorageService } from '../services/storage';

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
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = pin.trim().toLowerCase();
    // Código de acesso mestre do motorista (padrão: 1234, 2026, admin, 0000)
    if (cleanPin === '1234' || cleanPin === '2026' || cleanPin === 'admin' || cleanPin === '0000' || cleanPin === '9999') {
      StorageService.setAdminPin(cleanPin);
      onSuccess();
      // Não chamar onClose() aqui para não acionar navegação indesejada
    } else {
      setError(true);
      setPin('');
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
        maxWidth: 330,
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
          Painel do Motorista
        </h3>
        <p style={{ fontSize: '0.76rem', color: '#94A3B8', marginBottom: 14 }}>
          Digite o PIN de segurança para acessar
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <Key size={16} style={{ position: 'absolute', left: 12, top: 14, color: '#76D800' }} />
            <input
              type="password"
              inputMode="numeric"
              placeholder="Digite seu PIN"
              value={pin}
              autoFocus
              onChange={(e) => {
                setPin(e.target.value);
                setError(false);
              }}
              style={{
                width: '100%',
                height: 44,
                padding: '0 14px 0 36px',
                borderRadius: 12,
                border: error ? '1.5px solid #EF4444' : '1.5px solid #2C3E50',
                backgroundColor: '#1B2631',
                color: '#ffffff',
                fontSize: pin ? '1.15rem' : '0.88rem',
                fontWeight: 800,
                textAlign: 'center',
                letterSpacing: pin ? 6 : 0.5,
                boxSizing: 'border-box'
              }}
            />
          </div>

          {error && (
            <div style={{ color: '#EF4444', fontSize: '0.75rem', fontWeight: 700 }}>
              PIN inválido. Tente novamente.
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
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
                fontWeight: 600
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{ flex: 2, padding: 12 }}
            >
              Entrar no Painel
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
