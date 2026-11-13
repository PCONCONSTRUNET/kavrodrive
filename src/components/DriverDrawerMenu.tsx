import React from 'react';
import {
  X, User, Star, Wallet, DollarSign, Settings,
  Shield, Car, LogOut, ChevronRight
} from 'lucide-react';
import { DriverProfile } from '../types';

interface DriverDrawerMenuProps {
  isOpen: boolean;
  driver: DriverProfile;
  onClose: () => void;
  onSelectTab: (tab: 'radar' | 'ganhos' | 'carteira' | 'perfil') => void;
  onOpenPreferences: () => void;
  onOpenSos?: () => void;
  onLogout: () => void;
}

export const DriverDrawerMenu: React.FC<DriverDrawerMenuProps> = ({
  isOpen,
  driver,
  onClose,
  onSelectTab,
  onOpenPreferences,
  onOpenSos,
  onLogout,
}) => {
  if (!isOpen) return null;

  const menuItems: Array<{
    label: string;
    subtitle?: string;
    icon: React.ReactNode;
    onClick: () => void;
  }> = [
    {
      label: 'Mapa e Radar',
      subtitle: 'Receber chamadas em tempo real',
      icon: <Car size={20} color="#111111" />,
      onClick: () => {
        onSelectTab('radar');
        onClose();
      },
    },
    {
      label: 'Ganhos',
      subtitle: 'Resumo do dia, semana e corridas',
      icon: <DollarSign size={20} color="#111111" />,
      onClick: () => {
        onSelectTab('ganhos');
        onClose();
      },
    },
    {
      label: 'Carteira',
      subtitle: 'Repasses PIX e saldo disponível',
      icon: <Wallet size={20} color="#111111" />,
      onClick: () => {
        onSelectTab('carteira');
        onClose();
      },
    },
    {
      label: 'Preferências',
      subtitle: 'Categorias e filtros de viagem',
      icon: <Settings size={20} color="#111111" />,
      onClick: () => {
        onOpenPreferences();
        onClose();
      },
    },
    {
      label: 'Conta e Veículo',
      subtitle: 'Documentos, KYC e avaliação',
      icon: <User size={20} color="#111111" />,
      onClick: () => {
        onSelectTab('perfil');
        onClose();
      },
    },
  ];

  if (onOpenSos) {
    menuItems.push({
      label: 'Central de Segurança',
      subtitle: 'Emergência SOS e suporte 24h',
      icon: <Shield size={20} color="#276EF1" />,
      onClick: () => {
        onOpenSos();
        onClose();
      },
    });
  }

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
          backgroundColor: 'rgba(15, 23, 42, 0.48)',
          backdropFilter: 'blur(3px)'
        }}
      />

      {/* Drawer Panel Claro Estilo Uber Driver */}
      <div style={{
        position: 'relative',
        width: '84%',
        maxWidth: 336,
        height: '100%',
        backgroundColor: '#FFFFFF',
        color: '#111111',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '6px 0 32px rgba(0,0,0,0.22)',
        padding: 'calc(18px + env(safe-area-inset-top, 0px)) 16px calc(18px + env(safe-area-inset-bottom, 0px)) 16px',
        boxSizing: 'border-box'
      }}>
        {/* Topo: Foto, Nome e Estrela do Motorista */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: 16,
          borderBottom: '1px solid #E5E7EB',
          marginBottom: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              backgroundColor: '#111111',
              color: '#FFFFFF',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '1.15rem',
              flexShrink: 0,
              border: '2px solid #E5E7EB'
            }}>
              {driver.photo ? (
                <img src={driver.photo} alt={driver.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                driver.name.charAt(0).toUpperCase()
              )}
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: '1.06rem',
                fontWeight: 800,
                color: '#111111',
                letterSpacing: '-0.02em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {driver.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  backgroundColor: '#F3F4F6',
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontSize: '0.76rem',
                  color: '#111111',
                  fontWeight: 700
                }}>
                  <Star size={12} fill="#111111" color="#111111" />
                  {(driver.rating || 4.98).toFixed(2)}
                </span>
                <span style={{ fontSize: '0.72rem', color: '#15803D', fontWeight: 700 }}>
                  {driver.vehiclePlate || 'Parceiro Kavro'}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            style={{
              background: '#F3F4F6',
              border: 'none',
              borderRadius: '50%',
              width: 34,
              height: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#111111',
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Lista de Opções */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 4
        }}>
          {menuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 10px',
                borderRadius: 12,
                backgroundColor: 'transparent',
                border: 'none',
                color: '#111111',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: '#F3F4F6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {item.icon}
                </div>
                <div>
                  <div style={{ fontSize: '0.96rem', fontWeight: 700, color: '#111111' }}>
                    {item.label}
                  </div>
                  {item.subtitle && (
                    <div style={{ fontSize: '0.74rem', color: '#6B7280', marginTop: 1 }}>
                      {item.subtitle}
                    </div>
                  )}
                </div>
              </div>
              <ChevronRight size={18} color="#9CA3AF" />
            </button>
          ))}
        </div>

        {/* Rodapé */}
        <div style={{
          paddingTop: 14,
          borderTop: '1px solid #E5E7EB',
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}>
          <button
            type="button"
            onClick={() => { onLogout(); onClose(); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 12,
              color: '#DC2626',
              fontSize: '0.86rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <LogOut size={17} />
            <span>Sair da conta</span>
          </button>
          <div style={{ fontSize: '0.68rem', color: '#9CA3AF', textAlign: 'center', fontWeight: 600 }}>
            KAVRO DRIVE Parceiro
          </div>
        </div>
      </div>
    </div>
  );
};
