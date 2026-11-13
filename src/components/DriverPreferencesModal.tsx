import React, { useState } from 'react';
import {
  ArrowLeft, Banknote, Users, ShoppingBag, UserCheck,
  Check, ChevronRight, Lock, User, Car, Briefcase, Package
} from 'lucide-react';
import { DriverProfile, SystemConfig } from '../types';
import { evaluateAllDriverCategories, getCategoryById } from '../utils/categoryEngine';

interface DriverPreferencesModalProps {
  isOpen: boolean;
  currentDriver: DriverProfile;
  config: SystemConfig;
  onClose: () => void;
  onToggleAcceptCash: (enabled: boolean) => void;
  onToggleCategory: (categoryId: string) => void;
}

export const DriverPreferencesModal: React.FC<DriverPreferencesModalProps> = ({
  isOpen,
  currentDriver,
  config,
  onClose,
  onToggleAcceptCash,
  onToggleCategory,
}) => {
  const [minRatingEnabled, setMinRatingEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('kavro_driver_min_rating') === 'true';
    } catch {
      return false;
    }
  });
  const [shopPayEnabled, setShopPayEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('kavro_driver_shop_pay') === 'true';
    } catch {
      return false;
    }
  });

  if (!isOpen) return null;

  const acceptsCash = currentDriver.acceptsCash !== false;
  const driverCatEval = evaluateAllDriverCategories(currentDriver, config.rideCategories || []);

  const handleToggleMinRating = (next: boolean) => {
    setMinRatingEnabled(next);
    try {
      localStorage.setItem('kavro_driver_min_rating', String(next));
    } catch { /* noop */ }
  };

  const handleToggleShopPay = (next: boolean) => {
    setShopPayEnabled(next);
    try {
      localStorage.setItem('kavro_driver_shop_pay', String(next));
    } catch { /* noop */ }
  };

  const renderCategoryIcon = (catId: string, isEnabled: boolean) => {
    const color = isEnabled ? '#111111' : '#525252';
    if (catId.includes('exec')) return <Briefcase size={24} color={color} strokeWidth={2.1} />;
    if (catId.includes('plus')) return <Car size={24} color={color} strokeWidth={2.1} />;
    if (catId.includes('flash') || catId.includes('entrega')) return <Package size={24} color={color} strokeWidth={2.1} />;
    return <User size={24} color={color} fill={isEnabled ? color : 'none'} strokeWidth={2.1} />;
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: '#F3F4F6',
      color: '#111111',
      zIndex: 100000,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Header Clean Estilo Uber Preferências */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        padding: 'calc(14px + env(safe-area-inset-top, 0px)) 16px 14px 16px',
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid #E5E7EB',
        gap: 16,
        flexShrink: 0
      }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Voltar"
          style={{
            background: 'none',
            border: 'none',
            color: '#111111',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 4
          }}
        >
          <ArrowLeft size={23} />
        </button>
        <h1 style={{ fontSize: '1.22rem', fontWeight: 700, margin: 0, color: '#111111', letterSpacing: '-0.02em' }}>
          Preferências
        </h1>
      </header>

      {/* Conteúdo Rolável */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 16px calc(28px + env(safe-area-inset-bottom, 0px)) 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        maxWidth: 480,
        width: '100%',
        margin: '0 auto',
        boxSizing: 'border-box'
      }}>
        {/* Banner Creme/Bege suave idêntico ao Print */}
        <div style={{
          backgroundColor: '#EDE4DA',
          color: '#1F2937',
          padding: '14px 16px',
          borderRadius: 12,
          fontSize: '0.92rem',
          fontWeight: 500,
          lineHeight: 1.35
        }}>
          Filtrar viagens com base nas preferências
        </div>

        {/* Grade 2x2 de Categorias estilo Print Uber Preferências */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10
        }}>
          {driverCatEval.evaluations.map((ev) => {
            const cat = getCategoryById(ev.categoryId, config);
            const isEligible = ev.isEligible;
            const isEnabled = isEligible && ev.isEnabledByDriver;

            return (
              <button
                key={ev.categoryId}
                type="button"
                disabled={!isEligible}
                onClick={() => {
                  if (isEligible) onToggleCategory(ev.categoryId);
                }}
                style={{
                  position: 'relative',
                  minHeight: 118,
                  padding: '14px 14px 12px 14px',
                  borderRadius: 12,
                  backgroundColor: '#FFFFFF',
                  border: isEnabled ? '2px solid #111111' : '1px solid #D1D5DB',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  textAlign: 'left',
                  cursor: isEligible ? 'pointer' : 'not-allowed',
                  opacity: isEligible ? 1 : 0.68,
                  boxShadow: isEnabled ? '0 2px 10px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                {/* Checkbox Quadrado Superior Direito */}
                <div style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginBottom: 4
                }}>
                  {isEligible ? (
                    <div style={{
                      width: 20,
                      height: 20,
                      borderRadius: 3,
                      backgroundColor: isEnabled ? '#111111' : '#FFFFFF',
                      border: isEnabled ? '2px solid #111111' : '2px solid #737373',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#FFFFFF'
                    }}>
                      {isEnabled && <Check size={14} strokeWidth={3.2} />}
                    </div>
                  ) : (
                    <div style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      backgroundColor: '#FEE2E2',
                      color: '#B91C1C',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Lock size={13} />
                    </div>
                  )}
                </div>

                {/* Ícone + Nome da Categoria */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                  {renderCategoryIcon(ev.categoryId, isEnabled)}
                  <div>
                    <div style={{
                      fontSize: '0.96rem',
                      fontWeight: 700,
                      color: '#111111',
                      lineHeight: 1.2
                    }}>
                      {cat.name}
                    </div>
                    <div style={{
                      fontSize: '0.7rem',
                      color: isEligible ? '#6B7280' : '#B91C1C',
                      fontWeight: 600,
                      marginTop: 2
                    }}>
                      {isEligible
                        ? `R$ ${cat.pricePerKm.toFixed(2).replace('.', ',')}/km`
                        : (ev.reasons[0] || 'Bloqueada p/ veículo')}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Seção Filtros da Viagem (Idêntica ao Print Uber Driver) */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 16,
          padding: '16px 16px 6px 16px',
          border: '1px solid #E5E7EB'
        }}>
          <div style={{
            fontSize: '1.18rem',
            fontWeight: 800,
            color: '#111111',
            marginBottom: 12,
            letterSpacing: '-0.02em'
          }}>
            Filtros da viagem
          </div>

          {/* 1. Aceitar dinheiro */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 0',
            borderBottom: '1px solid #F1F5F9',
            gap: 14
          }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flex: 1 }}>
              <Banknote size={21} color="#111111" style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.98rem', fontWeight: 700, color: '#111111', marginBottom: 2 }}>
                  Aceitar dinheiro
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6B7280', lineHeight: 1.35 }}>
                  Pode levar até 15 minutos para que essa alteração seja atualizada.
                </div>
              </div>
            </div>

            <label style={{ position: 'relative', display: 'inline-block', width: 46, height: 26, flexShrink: 0, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={acceptsCash}
                onChange={(e) => onToggleAcceptCash(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: acceptsCash ? '#111111' : '#D1D5DB',
                transition: '0.2s',
                borderRadius: 26
              }}>
                <span style={{
                  position: 'absolute',
                  height: 20,
                  width: 20,
                  left: acceptsCash ? 23 : 3,
                  bottom: 3,
                  backgroundColor: '#FFFFFF',
                  transition: '0.2s',
                  borderRadius: '50%',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.2)'
                }} />
              </span>
            </label>
          </div>

          {/* 2. Avaliação do usuário */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 0',
            borderBottom: '1px solid #F1F5F9',
            gap: 14
          }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flex: 1 }}>
              <Users size={21} color="#111111" style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.98rem', fontWeight: 700, color: '#111111', marginBottom: 2 }}>
                  Avaliação do usuário
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6B7280', lineHeight: 1.35 }}>
                  Defina uma avaliação mínima de usuário para solicitações de viagem
                </div>
              </div>
            </div>

            <label style={{ position: 'relative', display: 'inline-block', width: 46, height: 26, flexShrink: 0, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={minRatingEnabled}
                onChange={(e) => handleToggleMinRating(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: minRatingEnabled ? '#111111' : '#D1D5DB',
                transition: '0.2s',
                borderRadius: 26
              }}>
                <span style={{
                  position: 'absolute',
                  height: 20,
                  width: 20,
                  left: minRatingEnabled ? 23 : 3,
                  bottom: 3,
                  backgroundColor: '#FFFFFF',
                  transition: '0.2s',
                  borderRadius: '50%',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.2)'
                }} />
              </span>
            </label>
          </div>

          {/* 3. Pedidos Compre e Pague */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 0',
            borderBottom: '1px solid #F1F5F9',
            gap: 14
          }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flex: 1 }}>
              <ShoppingBag size={21} color="#111111" style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.98rem', fontWeight: 700, color: '#111111', marginBottom: 2 }}>
                  Pedidos &ldquo;Compre e pague&rdquo;
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6B7280', lineHeight: 1.35 }}>
                  Receba solicitações de entregas rápidas na região
                </div>
              </div>
            </div>

            <label style={{ position: 'relative', display: 'inline-block', width: 46, height: 26, flexShrink: 0, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={shopPayEnabled}
                onChange={(e) => handleToggleShopPay(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: shopPayEnabled ? '#111111' : '#D1D5DB',
                transition: '0.2s',
                borderRadius: 26
              }}>
                <span style={{
                  position: 'absolute',
                  height: 20,
                  width: 20,
                  left: shopPayEnabled ? 23 : 3,
                  bottom: 3,
                  backgroundColor: '#FFFFFF',
                  transition: '0.2s',
                  borderRadius: '50%',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.2)'
                }} />
              </span>
            </label>
          </div>

          {/* 4. Solicitações de passageiros verificados */}
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              background: 'none',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 0',
              gap: 14,
              textAlign: 'left',
              cursor: 'pointer'
            }}
          >
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flex: 1 }}>
              <UserCheck size={21} color="#111111" style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.98rem', fontWeight: 700, color: '#111111', marginBottom: 2 }}>
                  Viagens com monitoramento
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6B7280', lineHeight: 1.35 }}>
                  Ativado com rastreamento SOS em tempo real
                </div>
              </div>
            </div>
            <ChevronRight size={20} color="#6B7280" />
          </button>
        </div>
      </div>
    </div>
  );
};
