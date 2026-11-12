import React from 'react';
import { createPortal } from 'react-dom';
import { X, ShieldCheck, Lock, Trash2, Cpu, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { SystemConfig } from '../types';
import { formatPhone } from '../utils/format';

interface KycBiometricPrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
  config?: SystemConfig;
}

export const KycBiometricPrivacyModal: React.FC<KycBiometricPrivacyModalProps> = ({
  isOpen,
  onClose,
  config,
}) => {
  if (!isOpen) return null;

  const companyName = config?.companyName || 'KAVRO DRIVE';
  const companyEmail = config?.companyEmail || 'contato@upmobilidade.com.br';
  const companyPhone = formatPhone(config?.companyPhone || '(48) 99691-5303');

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(8px)',
        zIndex: 100005,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        boxSizing: 'border-box'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#0F172A',
          border: '1.5px solid #1E293B',
          borderRadius: 24,
          width: '100%',
          maxWidth: 540,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.9)',
          overflow: 'hidden',
          color: '#FFFFFF',
          boxSizing: 'border-box'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Topo com Título e Botão Fechar */}
        <div
          style={{
            padding: '18px 20px',
            backgroundColor: '#131D31',
            borderBottom: '1px solid #1E293B',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                backgroundColor: 'rgba(118, 216, 0, 0.15)',
                border: '1.5px solid #76D800',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#76D800'
              }}
            >
              <ShieldCheck size={22} />
            </div>
            <div>
              <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#FFFFFF', lineHeight: 1.2 }}>
                Privacidade & Dados Biométricos (KYC)
              </div>
              <div style={{ fontSize: '0.70rem', color: '#76D800', fontWeight: 700, letterSpacing: '0.04em' }}>
                MOTORISTA PARCEIRO • CONFORMIDADE LGPD
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: '#1E293B',
              border: 'none',
              color: '#94A3B8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Corpo com Rolagem e Seções Detalhadas */}
        <div
          style={{
            padding: '20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            fontSize: '0.84rem',
            lineHeight: 1.5,
            color: '#CBD5E1'
          }}
        >
          {/* Card Resumo do Fluxo */}
          <div
            style={{
              backgroundColor: 'rgba(118, 216, 0, 0.08)',
              border: '1px solid rgba(118, 216, 0, 0.25)',
              borderRadius: 16,
              padding: '14px 16px'
            }}
          >
            <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#76D800', marginBottom: 4 }}>
              Como funciona o ciclo dos seus documentos e biometria:
            </div>
            <div style={{ fontSize: '0.80rem', color: '#E2E8F0', lineHeight: 1.45 }}>
              Sua foto da CNH e selfie facial são utilizadas <strong>exclusivamente para conferência de identidade</strong> e prevenção a fraudes. Nenhum dado é vendido, repassado ou compartilhado com terceiros.
            </div>
          </div>

          {/* 1. Finalidade Específica */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{
              width: 30, height: 30, borderRadius: 10,
              backgroundColor: '#1E293B', border: '1px solid #334155',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#60A5FA', flexShrink: 0, marginTop: 2
            }}>
              <FileText size={16} />
            </div>
            <div>
              <div style={{ fontWeight: 800, color: '#FFFFFF', marginBottom: 2 }}>
                1. Finalidade Estrita da Coleta (Art. 7º e 11 da LGPD)
              </div>
              <div>
                A coleta do documento oficial (CNH com EAR) e da selfie em tempo real tem a finalidade única de atestar que a pessoa cadastrada é a legítima titular do documento e condutora do veículo, garantindo a integridade física de motoristas e passageiros.
              </div>
            </div>
          </div>

          {/* 2. Processamento Facial Local */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{
              width: 30, height: 30, borderRadius: 10,
              backgroundColor: '#1E293B', border: '1px solid #334155',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#34D399', flexShrink: 0, marginTop: 2
            }}>
              <Cpu size={16} />
            </div>
            <div>
              <div style={{ fontWeight: 800, color: '#FFFFFF', marginBottom: 2 }}>
                2. Análise Facial Local no Navegador
              </div>
              <div>
                O cálculo dos vetores biométricos é processado diretamente no seu próprio dispositivo através da tecnologia open source de visão computacional. O índice gerado serve exclusivamente como <strong>apoio preliminar à análise humana</strong> do operador, garantindo que nenhuma decisão de bloqueio ou recusa seja tomada de forma 100% automatizada.
              </div>
            </div>
          </div>

          {/* 3. Armazenamento Seguro e Criptografia */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{
              width: 30, height: 30, borderRadius: 10,
              backgroundColor: '#1E293B', border: '1px solid #334155',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#FBBF24', flexShrink: 0, marginTop: 2
            }}>
              <Lock size={16} />
            </div>
            <div>
              <div style={{ fontWeight: 800, color: '#FFFFFF', marginBottom: 2 }}>
                3. Armazenamento Isolado & Links Temporários
              </div>
              <div>
                Os arquivos de imagem são salvos em <strong>cofre digital isolado com criptografia</strong>. A visualização pela equipe administrativa autorizada ocorre unicamente por meio de links temporários com validade de 15 minutos, impedindo indexação pública ou exposição involuntária.
              </div>
            </div>
          </div>

          {/* 4. Política de Exclusão Automática & Retenção */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{
              width: 30, height: 30, borderRadius: 10,
              backgroundColor: '#1E293B', border: '1px solid #334155',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#F87171', flexShrink: 0, marginTop: 2
            }}>
              <Trash2 size={16} />
            </div>
            <div>
              <div style={{ fontWeight: 800, color: '#FFFFFF', marginBottom: 2 }}>
                4. Exclusão e Descarte Automático de Dados
              </div>
              <div>
                Concluída a verificação manual e ativada a conta do parceiro:
                <ul style={{ margin: '6px 0 6px 18px', padding: 0 }}>
                  <li>Os dados biométricos sensíveis e fotos brutas entram no fluxo de <strong>expurgo automático programado</strong>.</li>
                  <li>Em caso de recusa de cadastro ou solicitação de encerramento da parceria pelo motorista, todas as fotos e registros biométricos são <strong>imediatamente e definitivamente deletados</strong> dos servidores.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* 5. Direitos do Titular (Art. 18 da LGPD) */}
          <div style={{
            backgroundColor: '#131D31',
            borderRadius: 14,
            padding: '12px 14px',
            border: '1px solid #1E293B',
            fontSize: '0.78rem',
            color: '#94A3B8'
          }}>
            <div style={{ fontWeight: 800, color: '#E2E8F0', marginBottom: 4 }}>
              Direito de Eliminação & Suporte {companyName}:
            </div>
            <div>
              Você pode requerer a qualquer momento a confirmação de exclusão dos seus dados através do e-mail{' '}
              <span style={{ color: '#76D800', fontWeight: 700 }}>{companyEmail}</span> ou WhatsApp{' '}
              <span style={{ color: '#76D800', fontWeight: 700 }}>{companyPhone}</span>.
            </div>
          </div>
        </div>

        {/* Rodapé com Botão de Confirmação */}
        <div
          style={{
            padding: '14px 20px',
            backgroundColor: '#131D31',
            borderTop: '1px solid #1E293B',
            display: 'flex',
            justifyContent: 'flex-end',
            flexShrink: 0
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              height: 46,
              borderRadius: 12,
              backgroundColor: '#76D800',
              color: '#000000',
              border: 'none',
              fontWeight: 900,
              fontSize: '0.90rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 16px rgba(118, 216, 0, 0.3)'
            }}
          >
            <CheckCircle2 size={18} />
            <span>Entendi e Concordo</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

