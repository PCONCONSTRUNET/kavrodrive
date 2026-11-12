import React from 'react';
import { Check, CheckCircle2, ArrowDown } from 'lucide-react';
import { DriverProfile } from '../types';

export interface DriverOnboardingDataInput {
  name?: string;
  phone?: string;
  email?: string;
  city?: string;
  document?: string;
  cnh?: string;
  cnhHasEar?: boolean;
  photo?: string;
  approvalStatus?: DriverProfile['approvalStatus'];
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleVersion?: string;
  vehicleYear?: string | number;
  vehiclePlate?: string;
  crlvNumber?: string;
  crlvRegular?: boolean;
  eligibleCategories?: string[];
  enabledCategories?: string[];
  pixKey?: string;
  pixType?: string;
  bankName?: string;
}

interface DriverOnboardingStatusCardProps {
  driverData: DriverOnboardingDataInput;
  activeStep?: number;
  onSelectStep?: (stepNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7) => void;
  showFlowRoadmap?: boolean;
  compact?: boolean;
}

const DashedCircleIcon: React.FC<{ color?: string }> = ({ color = '#94A3B8' }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
    <circle
      cx="8"
      cy="8"
      r="6.2"
      stroke={color}
      strokeWidth="1.5"
      strokeDasharray="2.6 2.4"
    />
  </svg>
);

export const DriverOnboardingStatusCard: React.FC<DriverOnboardingStatusCardProps> = ({
  driverData,
  activeStep,
  onSelectStep,
  showFlowRoadmap = true,
  compact = false,
}) => {
  const hasAccountAndPersonal =
    Boolean(driverData.name && driverData.name.trim().length >= 3) &&
    Boolean(driverData.phone && driverData.phone.replace(/\D/g, '').length >= 10) &&
    Boolean(driverData.document && driverData.document.replace(/\D/g, '').length >= 11);

  const hasCnhAndEar =
    Boolean(driverData.cnh && driverData.cnh.replace(/\D/g, '').length >= 9) &&
    driverData.cnhHasEar !== false;

  const hasProfilePhoto = Boolean(driverData.photo && driverData.photo.trim().length > 10);

  const isSecurityApproved = driverData.approvalStatus === 'aprovado';

  const hasVehicleAndCrlv =
    Boolean(driverData.vehicleBrand && driverData.vehicleBrand.trim().length >= 2) &&
    Boolean(driverData.vehicleModel && driverData.vehicleModel.trim().length >= 2) &&
    Boolean(driverData.vehiclePlate && driverData.vehiclePlate.replace(/[^A-Za-z0-9]/g, '').length >= 7);

  const hasCategoriesConfigured =
    hasVehicleAndCrlv &&
    Array.isArray(driverData.eligibleCategories) &&
    driverData.eligibleCategories.length > 0;

  const hasPayoutData = Boolean(driverData.pixKey && driverData.pixKey.trim().length >= 5);

  const isFullyReleased =
    hasAccountAndPersonal &&
    hasCnhAndEar &&
    isSecurityApproved &&
    hasVehicleAndCrlv &&
    hasPayoutData;

  // As 5 etapas principais do Painel "Meu cadastro — KAVRO DRIVE" (conforme imagem 2) + Categorias e Recebimento
  const checklistItems: Array<{
    id: string;
    label: string;
    stepNum: 1 | 2 | 3 | 4 | 5 | 6 | 7;
    status: 'aprovado' | 'em_analise' | 'pendente';
    statusText: string;
  }> = [
    {
      id: 'dados_pessoais',
      label: 'Dados pessoais',
      stepNum: 1,
      status: hasAccountAndPersonal ? 'aprovado' : 'pendente',
      statusText: hasAccountAndPersonal ? 'Aprovado' : 'Pendente',
    },
    {
      id: 'cnh_ear',
      label: 'CNH e EAR',
      stepNum: 2,
      status: hasCnhAndEar ? 'aprovado' : 'pendente',
      statusText: hasCnhAndEar ? 'Aprovado' : 'Pendente',
    },
    {
      id: 'foto_perfil',
      label: 'Foto de perfil',
      stepNum: 3,
      status: hasProfilePhoto ? 'aprovado' : 'pendente',
      statusText: hasProfilePhoto ? 'Aprovado' : 'Pendente',
    },
    {
      id: 'verificacao_seguranca',
      label: 'Verificação de segurança',
      stepNum: 4,
      status: isSecurityApproved
        ? 'aprovado'
        : hasAccountAndPersonal && hasCnhAndEar
          ? 'em_analise'
          : 'pendente',
      statusText: isSecurityApproved
        ? 'Aprovado'
        : hasAccountAndPersonal && hasCnhAndEar
          ? 'Em análise'
          : 'Pendente',
    },
    {
      id: 'veiculo_crlv',
      label: 'Veículo e CRLV',
      stepNum: 5,
      status: hasVehicleAndCrlv ? 'aprovado' : 'pendente',
      statusText: hasVehicleAndCrlv ? 'Aprovado' : 'Pendente',
    },
    {
      id: 'categorias',
      label: 'Categorias GO / PLUS / EXEC',
      stepNum: 6,
      status: hasCategoriesConfigured ? 'aprovado' : hasVehicleAndCrlv ? 'em_analise' : 'pendente',
      statusText: hasCategoriesConfigured
        ? `Ativo (${(driverData.eligibleCategories || []).map(c => c.replace('kavro_', '').toUpperCase()).join(' / ')})`
        : 'Pendente',
    },
    {
      id: 'recebimento',
      label: 'Dados para recebimento (PIX)',
      stepNum: 7,
      status: hasPayoutData ? 'aprovado' : 'pendente',
      statusText: hasPayoutData ? 'Aprovado' : 'Pendente',
    },
  ];

  // Exibe as 5 etapas centrais na versão compacta ou todas as 7 etapas completas
  const visibleChecklist = compact ? checklistItems.slice(0, 5) : checklistItems;
  const completedCount = visibleChecklist.filter(i => i.status === 'aprovado').length;
  const totalCount = visibleChecklist.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);

  // As 7 etapas do Fluxo Recomendado do Aplicativo (conforme imagem 1)
  const flowSteps: Array<{
    step: 1 | 2 | 3 | 4 | 5 | 6 | 7;
    title: string;
    done: boolean;
    inAnalysis?: boolean;
  }> = [
    { step: 1, title: 'Criar conta', done: hasAccountAndPersonal },
    { step: 2, title: 'Dados pessoais + CNH', done: hasAccountAndPersonal && hasCnhAndEar },
    { step: 3, title: 'Foto de perfil', done: hasProfilePhoto },
    {
      step: 4,
      title: 'Análise e aprovação',
      done: isSecurityApproved,
      inAnalysis: !isSecurityApproved && hasAccountAndPersonal && hasCnhAndEar,
    },
    { step: 5, title: 'Cadastro do veículo + CRLV', done: hasVehicleAndCrlv },
    { step: 6, title: 'Categorias GO / PLUS / EXEC', done: hasCategoriesConfigured },
    { step: 7, title: 'Dados para recebimento', done: hasPayoutData },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      {/* ===================================================================== */}
      {/* CARD 1: PAINEL DE ACOMPANHAMENTO DO CADASTRO (IMAGEM 2)               */}
      {/* ===================================================================== */}
      <div style={{
        backgroundColor: '#0A0D12',
        border: '1px solid #1E293B',
        borderRadius: 16,
        padding: '18px 20px',
        color: '#F8FAFC',
        textAlign: 'left',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)'
      }}>
        {/* Cabeçalho: Meu cadastro — KAVRO DRIVE + Badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 14
        }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#F8FAFC', letterSpacing: '-0.01em' }}>
            Meu cadastro — KAVRO DRIVE
          </div>

          <span style={{
            padding: '4px 11px',
            borderRadius: 999,
            fontSize: '0.72rem',
            fontWeight: 700,
            backgroundColor: isFullyReleased
              ? 'rgba(16, 185, 129, 0.18)'
              : 'rgba(180, 83, 9, 0.25)',
            border: isFullyReleased
              ? '1px solid rgba(16, 185, 129, 0.4)'
              : '1px solid rgba(245, 158, 11, 0.35)',
            color: isFullyReleased ? '#34D399' : '#F59E0B'
          }}>
            {isFullyReleased ? 'Liberado' : 'Em análise'}
          </span>
        </div>

        {/* Linha de Progresso */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8
        }}>
          <span style={{ fontSize: '0.78rem', color: '#94A3B8', fontWeight: 500 }}>
            Progresso do cadastro
          </span>
          <span style={{ fontSize: '0.86rem', color: '#F8FAFC', fontWeight: 700 }}>
            {completedCount} de {totalCount} etapas
          </span>
        </div>

        {/* Barra de Progresso */}
        <div style={{
          width: '100%',
          height: 6,
          backgroundColor: '#1E293B',
          borderRadius: 999,
          overflow: 'hidden',
          marginBottom: 16
        }}>
          <div style={{
            width: `${progressPercent}%`,
            height: '100%',
            backgroundColor: '#10B981',
            borderRadius: 999,
            transition: 'width 0.3s ease'
          }} />
        </div>

        {/* Checklist de Etapas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {visibleChecklist.map(item => {
            const isApproved = item.status === 'aprovado';
            const isAnalysis = item.status === 'em_analise';
            const isClickable = Boolean(onSelectStep);

            return (
              <div
                key={item.id}
                onClick={() => onSelectStep && onSelectStep(item.stepNum)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  cursor: isClickable ? 'pointer' : 'default',
                  padding: isClickable ? '4px 6px' : '2px 0',
                  borderRadius: 8,
                  backgroundColor: activeStep === item.stepNum ? 'rgba(255,255,255,0.05)' : 'transparent',
                  transition: 'background 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {isApproved ? (
                    <CheckCircle2 size={16} color="#10B981" style={{ flexShrink: 0 }} />
                  ) : (
                    <DashedCircleIcon color={isAnalysis ? '#CBD5E1' : '#64748B'} />
                  )}
                  <span style={{
                    fontSize: '0.83rem',
                    color: isApproved ? '#E2E8F0' : '#CBD5E1',
                    fontWeight: activeStep === item.stepNum ? 700 : 500
                  }}>
                    {item.label}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: '0.78rem',
                    fontWeight: isApproved ? 600 : 500,
                    color: isApproved ? '#10B981' : isAnalysis ? '#CBD5E1' : '#94A3B8'
                  }}>
                    {item.statusText}
                  </span>
                  {!isApproved && onSelectStep && item.id !== 'verificacao_seguranca' && (
                    <span style={{
                      fontSize: '0.66rem',
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 6,
                      backgroundColor: 'rgba(118, 216, 0, 0.14)',
                      border: '1px solid rgba(118, 216, 0, 0.35)',
                      color: '#76D800'
                    }}>
                      Preencher
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* CARD 2: FLUXO RECOMENDADO DO APLICATIVO — 7 ETAPAS (IMAGEM 1)         */}
      {/* ===================================================================== */}
      {showFlowRoadmap && (
        <div style={{
          backgroundColor: '#0A0D12',
          border: '1px solid #1E293B',
          borderRadius: 16,
          padding: '18px 20px',
          color: '#F8FAFC',
          textAlign: 'left'
        }}>
          <div style={{
            fontSize: '0.92rem',
            fontWeight: 700,
            color: '#F8FAFC',
            marginBottom: 14
          }}>
            Fluxo de habilitação do motorista KAVRO DRIVE
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {flowSteps.map((f, idx) => {
              const isCurrent = activeStep === f.step;
              return (
                <React.Fragment key={f.step}>
                  <div
                    onClick={() => onSelectStep && onSelectStep(f.step)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      borderRadius: 10,
                      backgroundColor: isCurrent ? 'rgba(118, 216, 0, 0.1)' : 'transparent',
                      border: isCurrent ? '1px solid rgba(118, 216, 0, 0.35)' : '1px solid transparent',
                      cursor: onSelectStep ? 'pointer' : 'default',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        backgroundColor: f.done
                          ? 'rgba(16, 185, 129, 0.2)'
                          : isCurrent
                            ? '#76D800'
                            : '#1E293B',
                        border: f.done
                          ? '1px solid rgba(16, 185, 129, 0.5)'
                          : isCurrent
                            ? 'none'
                            : '1px solid #334155',
                        color: f.done
                          ? '#34D399'
                          : isCurrent
                            ? '#0A0D12'
                            : '#94A3B8',
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {f.done ? <Check size={13} strokeWidth={3} /> : f.step}
                      </div>

                      <span style={{
                        fontSize: '0.84rem',
                        fontWeight: isCurrent ? 700 : 600,
                        color: f.done || isCurrent ? '#F8FAFC' : '#CBD5E1'
                      }}>
                        {f.title}
                      </span>
                    </div>

                    <span style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      color: f.done ? '#10B981' : f.inAnalysis ? '#F59E0B' : isCurrent ? '#76D800' : '#64748B'
                    }}>
                      {f.done ? 'Concluído' : f.inAnalysis ? 'Em análise' : isCurrent ? 'Etapa atual' : ''}
                    </span>
                  </div>

                  {idx < flowSteps.length && (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'center',
                      padding: '1px 0',
                      color: '#64748B'
                    }}>
                      <ArrowDown size={13} />
                    </div>
                  )}
                </React.Fragment>
              );
            })}

            {/* Caixa Final: Motorista liberado para corridas */}
            <div style={{
              marginTop: 2,
              padding: '11px 14px',
              borderRadius: 10,
              backgroundColor: isFullyReleased ? 'rgba(16, 185, 129, 0.14)' : 'rgba(6, 78, 59, 0.22)',
              border: isFullyReleased ? '1px solid #10B981' : '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(16, 185, 129, 0.2)',
                  color: '#10B981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Check size={14} strokeWidth={2.5} />
                </div>
                <span style={{
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: '#F8FAFC'
                }}>
                  Motorista liberado para corridas
                </span>
              </div>

              <span style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                color: isFullyReleased ? '#34D399' : '#94A3B8'
              }}>
                {isFullyReleased ? 'Ativo no Radar' : 'Aguardando conclusão'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

