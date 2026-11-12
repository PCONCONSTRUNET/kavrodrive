import React from 'react';
import { createPortal } from 'react-dom';
import { X, ShieldCheck, Lock, MapPin, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { SystemConfig } from '../types';
import { formatPhone } from '../utils/format';

interface TermsPrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
  config?: SystemConfig;
}

export const TermsPrivacyModal: React.FC<TermsPrivacyModalProps> = ({
  isOpen,
  onClose,
  config,
}) => {
  if (!isOpen) return null;

  const companyName = config?.companyName || 'Kavro Drive';
  const companyPhone = formatPhone(config?.companyPhone || '(48) 99691-5303');
  const companyEmail = config?.companyEmail || 'contato@upmobilidade.com.br';

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(5px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 20,
          width: '100%',
          maxWidth: 620,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
          overflow: 'hidden',
          animation: 'slideUp 0.25s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho do Modal */}
        <div
          style={{
            backgroundColor: '#121A21',
            color: '#FFFFFF',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1.5px solid #2C3E50',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: 'rgba(118, 216, 0, 0.16)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#76D800',
              }}
            >
              <ShieldCheck size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#FFFFFF', margin: 0, letterSpacing: '-0.01em' }}>
                Termos de Uso & Política de Privacidade
              </h3>
              <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>
                Conformidade com a LGPD (Lei Geral de Proteção de Dados - Lei 13.709/2018)
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: 'rgba(255,255,255,0.08)',
              border: 'none',
              color: '#CBD5E1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Conteúdo com Rolagem Suave */}
        <div
          style={{
            padding: '20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            fontSize: '0.82rem',
            color: '#334155',
            lineHeight: 1.55,
          }}
        >
          {/* Card Destaque: Gravação de GPS & Segurança */}
          <div
            style={{
              backgroundColor: '#F0FDF4',
              borderRadius: 14,
              padding: '12px 14px',
              border: '1.5px solid #86EFAC',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
            }}
          >
            <MapPin size={22} color="#15803D" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <strong style={{ color: '#14532D', fontSize: '0.86rem', display: 'block', marginBottom: 2 }}>
                Gravação de Rotas e Coordenadas GPS para Segurança Mútua
              </strong>
              <span style={{ color: '#166534', fontSize: '0.78rem' }}>
                Para a sua segurança e a do motorista, <strong>todos os trajetos, pontos de embarque, desembarque e coordenadas de satélite (GPS) são gravados em tempo real</strong> e vinculados ao código da viagem (ex: #UP - 001). Esses dados servem como garantia jurídica e suporte pericial em caso de necessidade.
              </span>
            </div>
          </div>

          {/* 1. Apresentação */}
          <div>
            <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>
              1. Identificação do Controlador
            </h4>
            <p>
              O serviço <strong>{companyName}</strong> é uma plataforma de transporte particular executivo e agendamento de viagens com base de operação em Santa Catarina. O tratamento de seus dados pessoais obedece rigorosamente às diretrizes da Lei nº 13.709/2018 (LGPD).
            </p>
          </div>

          {/* 2. Coleta de Dados Pessoais */}
          <div>
            <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>
              2. Dados Pessoais Coletados e Finalidade
            </h4>
            <p>Ao se cadastrar e utilizar o aplicativo, coletamos exclusivamente os dados necessários para a prestação do serviço:</p>
            <ul style={{ paddingLeft: 18, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li><strong>Nome Completo:</strong> Identificação junto ao motorista no momento do embarque.</li>
              <li><strong>Telefone / WhatsApp:</strong> Envio de confirmações de corrida, status do motorista a caminho e acionamento da Central SOS.</li>
              <li><strong>CPF:</strong> Identificação civil do titular, prevenção a fraudes e emissão de comprovantes/recibos de pagamento.</li>
              <li><strong>E-mail:</strong> Envio de comprovantes fiscais, recibos e recuperação de acesso à conta.</li>
            </ul>
          </div>

          {/* 3. Finalidade e Guarda dos Dados de GPS */}
          <div>
            <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>
              3. Telemetria e Registro de Rotas (Auditoria GPS)
            </h4>
            <p>
              Durante a realização da corrida, o aplicativo registra a telemetria (trajeto percorrido, velocidade aproximada e horários de início e término).
            </p>
            <p style={{ marginTop: 6 }}>
              <strong>Finalidades exclusivas da gravação de rota:</strong>
            </p>
            <ul style={{ paddingLeft: 18, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li>Garantir a integridade física de passageiros e motoristas.</li>
              <li>Localização imediata em situações de emergência via <strong>Botão SOS</strong>.</li>
              <li>Comprovação do trajeto realizado em eventuais cobranças ou esquecimento de pertences no veículo.</li>
              <li>Emissão de Laudo Pericial oficial caso requisitado judicialmente ou por autoridades de segurança pública.</li>
            </ul>
          </div>

          {/* 4. Compartilhamento e Sigilo */}
          <div>
            <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>
              4. Não Compartilhamento e Sigilo dos Dados
            </h4>
            <p>
              A <strong>{companyName}</strong> não vende, não aluga e não compartilha seus dados pessoais ou trajetos com terceiros para fins publicitários ou comerciais. O acesso às rotas gravadas é estritamente restrito à administração da plataforma.
            </p>
          </div>

          {/* 5. Direitos do Titular */}
          <div>
            <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>
              5. Seus Direitos como Titular (Art. 18 da LGPD)
            </h4>
            <p>
              Você tem direito a solicitar a qualquer momento a confirmação da existência de tratamento, acesso aos seus dados cadastrais, correção de dados incompletos ou a exclusão de sua conta, ressalvadas as obrigações legais de guarda de registros.
            </p>
          </div>

          {/* 6. Canal de Atendimento */}
          <div
            style={{
              backgroundColor: '#F8FAFC',
              borderRadius: 12,
              padding: '10px 14px',
              border: '1px solid #E2E8F0',
              fontSize: '0.76rem',
            }}
          >
            <strong>Canal de Privacidade & Contato:</strong>
            <div>E-mail: <span style={{ color: '#0F172A', fontWeight: 700 }}>{companyEmail}</span></div>
            <div>WhatsApp Oficial: <span style={{ color: '#0F172A', fontWeight: 700 }}>{companyPhone}</span></div>
          </div>
        </div>

        {/* Rodapé com Botão de Confirmação */}
        <div
          style={{
            padding: '12px 20px',
            backgroundColor: '#F8FAFC',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
            Última atualização: Novembro de 2026
          </span>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 20px',
              borderRadius: 12,
              backgroundColor: '#121A21',
              color: '#76D800',
              border: 'none',
              fontSize: '0.84rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <CheckCircle2 size={16} />
            <span>Entendido e Ciente</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

