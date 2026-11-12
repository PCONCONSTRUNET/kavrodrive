import React from 'react';
import { ArrowLeft, Banknote, Users, ShoppingBag, UserCheck, ShieldCheck, Check, ChevronRight, Lock } from 'lucide-react';
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
  if (!isOpen) return null;

  const acceptsCash = currentDriver.acceptsCash !== false; // padrão true
  const driverCatEval = evaluateAllDriverCategories(currentDriver, config.rideCategories || []);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: '#111822',
      color: '#FFFFFF',
      zIndex: 100000,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Header estilo Uber Driver */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        padding: 'calc(14px + env(safe-area-inset-top, 0px)) 16px 14px 16px',
        backgroundColor: '#161F28',
        borderBottom: '1px solid #232E3B',
        gap: 14,
        flexShrink: 0
      }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#FFFFFF',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 4
          }}
        >
          <ArrowLeft size={24} />
        </button>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
          Preferências
        </h1>
      </header>

      {/* Conteúdo com rolagem */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 16px calc(24px + env(safe-area-inset-bottom, 0px)) 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18
      }}>
        {/* Banner Marrom/Laranja idêntico ao Print 1 */}
        <div style={{
          backgroundColor: '#92400E',
          color: '#FEF3C7',
          padding: '14px 16px',
          borderRadius: 14,
          fontSize: '0.92rem',
          fontWeight: 700,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
        }}>
          Filtrar viagens com base nas preferências
        </div>

        {/* Seção Filtros da Viagem idêntico ao Print 1 */}
        <div>
          <div style={{
            fontSize: '1.15rem',
            fontWeight: 800,
            color: '#FFFFFF',
            marginBottom: 12,
            letterSpacing: '-0.01em'
          }}>
            Filtros da viagem
          </div>

          <div style={{
            backgroundColor: '#1A232F',
            borderRadius: 16,
            border: '1px solid #2C3A4A',
            overflow: 'hidden'
          }}>
            {/* 1. Aceitar dinheiro */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 14px',
              borderBottom: '1px solid #283544',
              gap: 14
            }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flex: 1 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: '#232E3D',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#94A3B8',
                  flexShrink: 0
                }}>
                  <Banknote size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#FFFFFF', marginBottom: 2 }}>
                    Aceitar dinheiro
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#94A3B8', lineHeight: 1.35 }}>
                    Pode levar até 15 minutos para que essa alteração seja atualizada.
                  </div>
                </div>
              </div>

              {/* iOS Style Switch */}
              <label style={{ position: 'relative', display: 'inline-block', width: 50, height: 28, flexShrink: 0 }}>
                <input
                  type="checkbox"
                  checked={acceptsCash}
                  onChange={(e) => onToggleAcceptCash(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: acceptsCash ? '#2563EB' : '#334155',
                  transition: '0.2s',
                  borderRadius: 28
                }}>
                  <span style={{
                    position: 'absolute',
                    height: 22,
                    width: 22,
                    left: acceptsCash ? 25 : 3,
                    bottom: 3,
                    backgroundColor: '#FFFFFF',
                    transition: '0.2s',
                    borderRadius: '50%'
                  }} />
                </span>
              </label>
            </div>

            {/* 2. Avaliação do usuário */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 14px',
              borderBottom: '1px solid #283544',
              gap: 14
            }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flex: 1 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: '#232E3D',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#94A3B8',
                  flexShrink: 0
                }}>
                  <Users size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#FFFFFF', marginBottom: 2 }}>
                    Avaliação do usuário
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#94A3B8', lineHeight: 1.35 }}>
                    Defina uma avaliação mínima de usuário para solicitações de viagem.
                  </div>
                </div>
              </div>

              <label style={{ position: 'relative', display: 'inline-block', width: 50, height: 28, flexShrink: 0 }}>
                <input
                  type="checkbox"
                  defaultChecked={true}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: '#2563EB',
                  transition: '0.2s',
                  borderRadius: 28
                }}>
                  <span style={{
                    position: 'absolute',
                    height: 22,
                    width: 22,
                    left: 25,
                    bottom: 3,
                    backgroundColor: '#FFFFFF',
                    transition: '0.2s',
                    borderRadius: '50%'
                  }} />
                </span>
              </label>
            </div>

            {/* 3. Pedidos Compre e Pague */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 14px',
              borderBottom: '1px solid #283544',
              gap: 14
            }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flex: 1 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: '#232E3D',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#94A3B8',
                  flexShrink: 0
                }}>
                  <ShoppingBag size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#FFFFFF', marginBottom: 2 }}>
                    Pedidos "Compre e pague"
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#94A3B8', lineHeight: 1.35 }}>
                    Faça compras em lojas, pague e entregue
                  </div>
                </div>
              </div>

              <label style={{ position: 'relative', display: 'inline-block', width: 50, height: 28, flexShrink: 0 }}>
                <input
                  type="checkbox"
                  defaultChecked={false}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: '#334155',
                  transition: '0.2s',
                  borderRadius: 28
                }}>
                  <span style={{
                    position: 'absolute',
                    height: 22,
                    width: 22,
                    left: 3,
                    bottom: 3,
                    backgroundColor: '#FFFFFF',
                    transition: '0.2s',
                    borderRadius: '50%'
                  }} />
                </span>
              </label>
            </div>

            {/* 4. Solicitações de adolescentes */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 14px',
              gap: 14,
              cursor: 'pointer'
            }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flex: 1 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: '#232E3D',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#94A3B8',
                  flexShrink: 0
                }}>
                  <UserCheck size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#FFFFFF', marginBottom: 2 }}>
                    Solicitações de adolescentes
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#94A3B8', lineHeight: 1.35 }}>
                    Ativado para viagens com monitoramento dos pais
                  </div>
                </div>
              </div>

              <ChevronRight size={20} color="#64748B" />
            </div>
          </div>
        </div>

        {/* Seção Categorias KAVRO DRIVE (Item #3 e #1 do prompt) */}
        <div>
          <div style={{
            fontSize: '1.15rem',
            fontWeight: 800,
            color: '#FFFFFF',
            marginBottom: 4,
            letterSpacing: '-0.01em'
          }}>
            Modalidades KAVRO DRIVE
          </div>
          <p style={{ fontSize: '0.8rem', color: '#94A3B8', margin: '0 0 12px 0' }}>
            Ative ou pause chamadas nas categorias em que seu veículo foi aprovado.
          </p>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            {driverCatEval.evaluations.map(ev => {
              const cat = getCategoryById(ev.categoryId, config);
              const isEligible = ev.isEligible;
              const isEnabled = ev.isEnabledByDriver;

              return (
                <div
                  key={ev.categoryId}
                  style={{
                    backgroundColor: '#1A232F',
                    borderRadius: 16,
                    border: isEligible ? (isEnabled ? '1.5px solid #22C55E' : '1px solid #3B4A5C') : '1px dashed #475569',
                    padding: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: '1rem', fontWeight: 900, color: '#FFFFFF' }}>
                        {cat.name}
                      </span>
                      <span style={{
                        fontSize: '0.66rem',
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: 999,
                        backgroundColor: isEligible ? (isEnabled ? '#15803D' : '#475569') : '#991B1B',
                        color: '#FFFFFF'
                      }}>
                        {isEligible ? (isEnabled ? 'ATIVA' : 'PAUSADA') : 'BLOQUEADA'}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginBottom: 4 }}>
                      {cat.description}
                    </div>

                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                      Tarifa Base: R$ {cat.baseFare.toFixed(2).replace('.', ',')} • R$ {cat.pricePerKm.toFixed(2).replace('.', ',')}/km
                    </div>

                    {!isEligible && ev.reasons.length > 0 && (
                      <div style={{ fontSize: '0.72rem', color: '#F87171', marginTop: 4 }}>
                        🔒 {ev.reasons[0]}
                      </div>
                    )}
                  </div>

                  {isEligible ? (
                    <label style={{ position: 'relative', display: 'inline-block', width: 50, height: 28, flexShrink: 0 }}>
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => onToggleCategory(ev.categoryId)}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span style={{
                        position: 'absolute',
                        cursor: 'pointer',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: isEnabled ? '#22C55E' : '#334155',
                        transition: '0.2s',
                        borderRadius: 28
                      }}>
                        <span style={{
                          position: 'absolute',
                          height: 22,
                          width: 22,
                          left: isEnabled ? 25 : 3,
                          bottom: 3,
                          backgroundColor: '#FFFFFF',
                          transition: '0.2s',
                          borderRadius: '50%'
                        }} />
                      </span>
                    </label>
                  ) : (
                    <div style={{ color: '#64748B', padding: 8 }}>
                      <Lock size={18} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

