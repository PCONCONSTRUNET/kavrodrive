import React from 'react';
import { 
  X, User, Star, Wallet, DollarSign, Settings, 
  HelpCircle, Shield, Award, Car, Inbox, LogOut, ChevronRight 
} from 'lucide-react';
import { DriverProfile } from '../types';

interface DriverDrawerMenuProps {
  isOpen: boolean;
  driver: DriverProfile;
  onClose: () => void;
  onSelectTab: (tab: 'radar' | 'ganhos' | 'carteira' | 'perfil') => void;
  onOpenPreferences: () => void;
  onLogout: () => void;
}

export const DriverDrawerMenu: React.FC<DriverDrawerMenuProps> = ({
  isOpen,
  driver,
  onClose,
  onSelectTab,
  onOpenPreferences,
  onLogout,
}) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100000,
      display: 'flex',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(3px)'
        }}
      />

      {/* Drawer Panel */}
      <div style={{
        position: 'relative',
        width: '82%',
        maxWidth: 340,
        height: '100%',
        backgroundColor: '#12171E',
        color: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '4px 0 24px rgba(0,0,0,0.5)',
        animation: 'slideRight 0.25s ease-out',
        padding: 'calc(16px + env(safe-area-inset-top, 0px)) 16px calc(16px + env(safe-area-inset-bottom, 0px)) 16px',
        boxSizing: 'border-box'
      }}>
        {/* Topo: Foto e Perfil do Motorista */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 16,
          borderBottom: '1px solid #1E293B',
          marginBottom: 16
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              backgroundColor: '#1E293B',
              border: '2px solid #76D800',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '1.2rem',
              color: '#76D800'
            }}>
              {driver.photo ? (
                <img src={driver.photo} alt={driver.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                driver.name.charAt(0).toUpperCase()
              )}
            </div>

            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
                {driver.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.78rem', color: '#E2E8F0', fontWeight: 700 }}>
                  <Star size={13} fill="#EAB308" color="#EAB308" />
                  <span>{(driver.rating || 4.96).toFixed(2)}</span>
                </div>
                <span style={{ color: '#475569' }}>•</span>
                <span style={{ fontSize: '0.72rem', color: '#76D800', fontWeight: 800, textTransform: 'uppercase' }}>
                  KAVRO Pro Ouro
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94A3B8',
              cursor: 'pointer',
              padding: 6
            }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Lista de Itens do Menu estilo Uber Driver */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 4
        }}>
          {/* 1. Radar / Mapa */}
          <button
            type="button"
            onClick={() => { onSelectTab('radar'); onClose(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 10px',
              borderRadius: 12,
              backgroundColor: 'transparent',
              border: 'none',
              color: '#FFFFFF',
              fontSize: '0.94rem',
              fontWeight: 700,
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Car size={20} color="#76D800" />
              <span>Mapa & Radar de Viagens</span>
            </div>
            <ChevronRight size={18} color="#475569" />
          </button>

          {/* 2. Ganhos */}
          <button
            type="button"
            onClick={() => { onSelectTab('ganhos'); onClose(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 10px',
              borderRadius: 12,
              backgroundColor: 'transparent',
              border: 'none',
              color: '#FFFFFF',
              fontSize: '0.94rem',
              fontWeight: 700,
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <DollarSign size={20} color="#60A5FA" />
              <span>Ganhos da Semana</span>
            </div>
            <ChevronRight size={18} color="#475569" />
          </button>

          {/* 3. Carteira */}
          <button
            type="button"
            onClick={() => { onSelectTab('carteira'); onClose(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 10px',
              borderRadius: 12,
              backgroundColor: 'transparent',
              border: 'none',
              color: '#FFFFFF',
              fontSize: '0.94rem',
              fontWeight: 700,
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Wallet size={20} color="#34D399" />
              <span>Carteira & Repasses PIX</span>
            </div>
            <ChevronRight size={18} color="#475569" />
          </button>

          {/* 4. Preferências (Print 1 do usuário) */}
          <button
            type="button"
            onClick={() => { onOpenPreferences(); onClose(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 10px',
              borderRadius: 12,
              backgroundColor: 'transparent',
              border: 'none',
              color: '#FFFFFF',
              fontSize: '0.94rem',
              fontWeight: 700,
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Settings size={20} color="#F59E0B" />
              <span>Preferências da Viagem</span>
            </div>
            <ChevronRight size={18} color="#475569" />
          </button>

          {/* 5. Perfil e Avaliações */}
          <button
            type="button"
            onClick={() => { onSelectTab('perfil'); onClose(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 10px',
              borderRadius: 12,
              backgroundColor: 'transparent',
              border: 'none',
              color: '#FFFFFF',
              fontSize: '0.94rem',
              fontWeight: 700,
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <User size={20} color="#C084FC" />
              <span>Meu Perfil & Veículo</span>
            </div>
            <ChevronRight size={18} color="#475569" />
          </button>
        </div>

        {/* Rodapé com Logout */}
        <div style={{
          paddingTop: 14,
          borderTop: '1px solid #1E293B',
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
          <button
            type="button"
            onClick={() => { onLogout(); onClose(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px',
              backgroundColor: 'transparent',
              border: 'none',
              color: '#F87171',
              fontSize: '0.86rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <LogOut size={18} />
            <span>Sair da conta de motorista</span>
          </button>
          <div style={{ fontSize: '0.68rem', color: '#64748B', textAlign: 'center' }}>
            KAVRO DRIVE v2.8 • Todos os direitos reservados
          </div>
        </div>
      </div>
    </div>
  );
};

