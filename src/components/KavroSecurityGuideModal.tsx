import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  Compass,
  FileCheck2,
  Headphones,
  Heart,
  LifeBuoy,
  Lock,
  MapPin,
  Menu,
  MessageSquareWarning,
  Mic,
  Navigation,
  PhoneCall,
  ScanFace,
  Shield,
  ShieldCheck,
  Smartphone,
  Siren,
  Star,
  UserCheck,
  Users,
  X,
  Bike
} from 'lucide-react';
import { ClientProfile, SystemConfig } from '../types';
import { SafetyCenterInitialView } from './SafetyCenterModal';

interface KavroSecurityGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  config?: SystemConfig;
  currentUser: ClientProfile | null;
  asPage?: boolean;
  onSelectFeature?: (targetView: SafetyCenterInitialView) => void;
  onOpenSos?: () => void;
  onOpenTerms?: () => void;
  onNavigateToDriverPortal?: () => void;
}

function getShortFirstName(user: ClientProfile | null): string {
  const full = String(user?.name || '').trim();
  if (!full) return 'Visitante';
  return full.split(/\s+/)[0];
}

function getInitials(name?: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'KD';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const KavroSecurityGuideModal: React.FC<KavroSecurityGuideModalProps> = ({
  isOpen,
  onClose,
  config,
  currentUser,
  asPage = false,
  onSelectFeature,
  onOpenSos,
  onOpenTerms,
  onNavigateToDriverPortal
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [travelMenuOpen, setTravelMenuOpen] = useState(false);
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});

  const heroRef = useRef<HTMLDivElement | null>(null);
  const techRef = useRef<HTMLDivElement | null>(null);
  const womenRef = useRef<HTMLDivElement | null>(null);
  const tipsRef = useRef<HTMLDivElement | null>(null);
  const communityRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLDivElement | null>(null);

  if (!isOpen && !asPage) return null;

  const brandName = config?.companyName || 'Kavro Drive';
  const toggleTopic = (key: string) => {
    setExpandedTopics((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>) => {
    setMenuOpen(false);
    setTravelMenuOpen(false);
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const featureItems: Array<{
    key: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    actionLabel?: string;
    onAction?: () => void;
  }> = [
    {
      key: 'kcheck',
      title: 'K-Check: verificação de parceiros',
      description:
        'Todos os motoristas parceiros passam por processo rigoroso de cadastro, conferência documental da CNH e CRLV do veículo e auditoria de elegibilidade antes de aceitar a primeira viagem, com revisões periódicas na plataforma.',
      icon: <FileCheck2 size={24} color="#2563EB" />
    },
    {
      key: 'kselfie',
      title: 'K-Selfie: Foto do motorista',
      description:
        'Periodicamente, o aplicativo solicita que os motoristas parceiros tirem uma selfie com verificação biométrica facial antes de aceitar corridas, confirmando quem realmente está ao volante.',
      icon: <ScanFace size={24} color="#2563EB" />
    },
    {
      key: 'kacompanha',
      title: 'K-Acompanha: Compartilhamento de viagem',
      description:
        'Passageiros podem compartilhar automaticamente o trajeto em tempo real com familiares e amigos pelo WhatsApp ou link exclusivo ao vivo. A ferramenta fica sempre acessível na Central de Segurança sobre o mapa da viagem.',
      icon: <MapPin size={24} color="#2563EB" />,
      actionLabel: onSelectFeature ? 'Configurar K-Acompanha' : undefined,
      onAction: onSelectFeature ? () => onSelectFeature('share') : undefined
    },
    {
      key: 'khelp',
      title: 'K-Help: Botão SOS e autoridades',
      description:
        'Permite acionar imediatamente a Polícia (190), SAMU (192) ou Bombeiros (193) diretamente do aplicativo em situações de urgência, exibindo seu endereço GPS atual, placa Mercosul e veículo da viagem.',
      icon: <Siren size={24} color="#2563EB" />,
      actionLabel: onOpenSos ? 'Abrir Emergência SOS' : undefined,
      onAction: onOpenSos
    },
    {
      key: 'kaudio',
      title: 'K-Áudio: Gravação de áudio',
      description:
        'Usuários podem gravar o áudio da viagem caso não se sintam confortáveis. O conteúdo fica protegido localmente no aparelho e pode ser anexado à corrida em um relato para a equipe de segurança quando necessário.',
      icon: <Mic size={24} color="#2563EB" />,
      actionLabel: onSelectFeature ? 'Aprenda a gravar a viagem' : undefined,
      onAction: onSelectFeature ? () => onSelectFeature('audio') : undefined
    },
    {
      key: 'kajuda',
      title: 'K-Ajuda: Checagem de rota',
      description:
        'Este recurso identifica paradas longas inesperadas, mudanças severas de rota e encerramentos antes do previsto, enviando verificação instantânea na tela para confirmar se está tudo bem e acionando o SOS caso não haja resposta.',
      icon: <Navigation size={24} color="#2563EB" />,
      actionLabel: onSelectFeature ? 'Saiba mais' : undefined,
      onAction: onSelectFeature ? () => onSelectFeature('ridecheck') : undefined
    },
    {
      key: 'ksigilo',
      title: 'K-Sigilo: Endereço e telefone protegidos',
      description:
        'Os números de telefone pessoais ficam mascarados na comunicação entre usuário e motorista, priorizando o chat seguro integrado ao app. Após o término da viagem, dados sensíveis permanecem protegidos conforme a LGPD.',
      icon: <Lock size={24} color="#2563EB" />
    },
    {
      key: 'kfiltro',
      title: 'K-Filtro: Moderação e conduta no chat',
      description:
        'Mensagens trocadas no aplicativo ficam registradas de forma segura; relatos de comportamento ofensivo, assédio ou ameaça entram em auditoria imediata que pode levar ao banimento definitivo da conta.',
      icon: <MessageSquareWarning size={24} color="#2563EB" />
    },
    {
      key: 'kcodigo',
      title: 'K-Código: Verificação de viagens',
      description:
        'Senha de 4 dígitos exibida no aplicativo do usuário que deve ser digitada pelo motorista parceiro antes de iniciar a corrida no app, confirmando que passageiro e motorista estão no carro correto.',
      icon: <Smartphone size={24} color="#2563EB" />,
      actionLabel: onSelectFeature ? 'Saiba mais' : undefined,
      onAction: onSelectFeature ? () => onSelectFeature('pin') : undefined
    },
    {
      key: 'ksuporte',
      title: 'K-Suporte: atendimento e auditoria',
      description:
        'Equipe de suporte e auditoria preparada para analisar individualmente incidentes de segurança relatados na plataforma e atuar com suspensões preventivas ou bloqueios imediatos.',
      icon: <Headphones size={24} color="#2563EB" />
    },
    {
      key: 'kavalia',
      title: 'K-Avalia: sistema de avaliações',
      description:
        'Ao final de cada corrida, passageiros e motoristas avaliam mutuamente a experiência de 1 a 5 estrelas. O monitoramento contínuo garante excelência e responsabilidade em toda a comunidade.',
      icon: <Star size={24} color="#2563EB" />
    },
    {
      key: 'kconvidado',
      title: 'K-Convidado',
      description:
        'Permite solicitar viagens informando detalhes do passageiro convidado nas observações e enviar o link ao vivo `/track` com motorista, modelo, cor e placa Mercosul para embarque tranquilo.',
      icon: <UserCheck size={24} color="#2563EB" />
    },
    {
      key: 'gps',
      title: 'Registro por GPS',
      description:
        'Todas as viagens possuem registro contínuo de GPS em tempo real do início ao fim do trajeto, garantindo histórico auditável em caso de necessidade.',
      icon: <Compass size={24} color="#2563EB" />
    },
    {
      key: 'ciclofaixa',
      title: 'Alerta de ciclofaixa',
      description:
        'Orienta passageiros e motoristas parceiros a conferirem ciclistas e movimentação lateral antes de abrir as portas no embarque e ao desembarcar próximo a ciclovias e vias urbanas.',
      icon: <Bike size={24} color="#2563EB" />
    }
  ];

  const shellContent = (
    <div
      style={{
        width: '100%',
        maxWidth: 480,
        height: asPage ? '100dvh' : '94dvh',
        backgroundColor: '#FFFFFF',
        color: '#111111',
        borderRadius: asPage ? 0 : '22px 22px 0 0',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: asPage ? 'none' : '0 -12px 40px rgba(0,0,0,0.65)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* BARRA SUPERIOR TIPO BROWSER PWA INTERNO */}
      <div
        style={{
          backgroundColor: '#1B1B1D',
          color: '#FFFFFF',
          height: 46,
          padding: '0 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
          borderBottom: '1px solid #2A2A2D'
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar página de segurança"
          style={{
            background: 'none',
            border: 'none',
            color: '#FFFFFF',
            padding: 4,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <X size={21} />
        </button>
        <span
          style={{
            fontSize: '0.88rem',
            fontWeight: 600,
            color: '#F5F5F5',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          A {brandName} é segura para os usuários?
        </span>
      </div>

      {/* NAVBAR PRETA COM MARCA E PILL DO USUÁRIO */}
      <div
        style={{
          backgroundColor: '#000000',
          color: '#FFFFFF',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          position: 'relative'
        }}
      >
        <span style={{ fontSize: '1.15rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
          {brandName}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => setMenuOpen((p) => !p)}
            style={{
              backgroundColor: '#FFFFFF',
              color: '#111111',
              border: 'none',
              borderRadius: 999,
              padding: '3px 10px 3px 4px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              cursor: 'pointer'
            }}
          >
            {currentUser?.photo ? (
              <img
                src={currentUser.photo}
                alt={getShortFirstName(currentUser)}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  objectFit: 'cover'
                }}
              />
            ) : (
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  backgroundColor: '#111827',
                  color: '#FFFFFF',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {getInitials(currentUser?.name)}
              </span>
            )}
            <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>
              {getShortFirstName(currentUser)}
            </span>
            <ChevronDown size={14} color="#111111" />
          </button>

          <button
            type="button"
            onClick={() => setMenuOpen((p) => !p)}
            aria-label="Índice da página de segurança"
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              backgroundColor: '#1F1F23',
              border: 'none',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <Menu size={17} />
          </button>
        </div>

        {/* DROPDOWN ÍNDICE RÁPIDO DENTRO DO PWA */}
        {menuOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 14,
              width: 240,
              backgroundColor: '#141414',
              border: '1px solid #2D2D30',
              borderRadius: 14,
              padding: '6px',
              zIndex: 20,
              boxShadow: '0 14px 30px rgba(0,0,0,0.45)'
            }}
          >
            {[
              { label: 'Viaje com confiança', ref: heroRef },
              { label: 'Tecnologia e recursos K-', ref: techRef },
              { label: 'Segurança das mulheres', ref: womenRef },
              { label: 'Dicas para sua segurança', ref: tipsRef },
              { label: 'Fortalecendo nossa comunidade', ref: communityRef },
              { label: 'Mais sobre segurança', ref: moreRef }
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => scrollToSection(item.ref)}
                style={{
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  color: '#F3F4F6',
                  padding: '9px 12px',
                  borderRadius: 9,
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  textAlign: 'left',
                  cursor: 'pointer'
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* CORPO ROLÁVEL CLARO ESTILO EDITORIAL UBER */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', backgroundColor: '#FFFFFF' }}>
        {/* SUB-HEADER VIAJAR */}
        <div style={{ padding: '14px 20px 6px 20px', position: 'relative' }}>
          <button
            type="button"
            onClick={() => setTravelMenuOpen((p) => !p)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '1.08rem',
              fontWeight: 800,
              color: '#111111',
              cursor: 'pointer'
            }}
          >
            <span>Viajar</span>
            <ChevronDown size={17} />
          </button>

          {travelMenuOpen && (
            <div
              style={{
                marginTop: 8,
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: 12,
                padding: 6,
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}
            >
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '8px 10px',
                  textAlign: 'left',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  color: '#0F172A',
                  cursor: 'pointer'
                }}
              >
                Voltar à Central de Segurança
              </button>
              {onOpenSos && (
                <button
                  type="button"
                  onClick={onOpenSos}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '8px 10px',
                    textAlign: 'left',
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    color: '#DC2626',
                    cursor: 'pointer'
                  }}
                >
                  Abrir Emergência SOS (190 / 192)
                </button>
              )}
            </div>
          )}
        </div>

        {/* HERO: VIAJE COM CONFIANÇA */}
        <div ref={heroRef} style={{ padding: '14px 20px 26px 20px' }}>
          <h1
            style={{
              margin: '0 0 14px 0',
              fontSize: '2.1rem',
              fontWeight: 800,
              lineHeight: 1.12,
              letterSpacing: '-0.03em',
              color: '#111111'
            }}
          >
            Viaje com confiança
          </h1>
          <p
            style={{
              margin: '0 0 22px 0',
              fontSize: '0.96rem',
              color: '#333333',
              lineHeight: 1.55
            }}
          >
            Na {brandName}, segurança é fundamental. Nossa plataforma conta com recursos de
            tecnologia para contribuir com a sua segurança e permitir que você viaje com mais
            tranquilidade.
          </p>

          <img
            src="/landing/passenger-ride.jpg"
            alt={`Passageiros viajando com segurança na ${brandName}`}
            style={{
              width: '100%',
              height: 250,
              objectFit: 'cover',
              borderRadius: 6,
              display: 'block'
            }}
          />
        </div>

        {/* BLOCO TECNOLOGIA & RECURSOS K- */}
        <div
          ref={techRef}
          style={{
            backgroundColor: '#F6F6F6',
            padding: '28px 20px 10px 20px',
            borderTop: '1px solid #EDEDED'
          }}
        >
          <h2
            style={{
              margin: '0 0 12px 0',
              fontSize: '1.65rem',
              fontWeight: 800,
              lineHeight: 1.18,
              letterSpacing: '-0.02em',
              color: '#111111'
            }}
          >
            Tranquilidade onde quer que você vá
          </h2>
          <p
            style={{
              margin: '0 0 26px 0',
              fontSize: '0.95rem',
              color: '#333333',
              lineHeight: 1.52
            }}
          >
            A segurança faz parte da tecnologia do nosso app. Para você chegar em casa com mais
            tranquilidade. Para seus familiares e amigos poderem acompanhar as suas viagens. E para
            que você possa pedir ajuda às autoridades, se algo acontecer.*
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 28, paddingBottom: 24 }}>
            {featureItems.map((feat) => (
              <div key={feat.key}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: '#E0ECFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12
                  }}
                >
                  {feat.icon}
                </div>
                <h3
                  style={{
                    margin: '0 0 8px 0',
                    fontSize: '1.12rem',
                    fontWeight: 800,
                    color: '#111111',
                    lineHeight: 1.28
                  }}
                >
                  {feat.title}
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.92rem',
                    color: '#374151',
                    lineHeight: 1.55
                  }}
                >
                  {feat.description}
                </p>
                {feat.actionLabel && feat.onAction && (
                  <button
                    type="button"
                    onClick={feat.onAction}
                    style={{
                      marginTop: 12,
                      background: 'none',
                      border: 'none',
                      borderBottom: '1px solid #9CA3AF',
                      padding: '2px 0 4px 0',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      color: '#111111',
                      cursor: 'pointer'
                    }}
                  >
                    {feat.actionLabel}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* SEGURANÇA DAS MULHERES */}
        <div
          ref={womenRef}
          style={{
            backgroundColor: '#FFFFFF',
            padding: '28px 20px'
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: '#DBEAFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16
            }}
          >
            <Heart size={24} color="#2563EB" fill="#2563EB" />
          </div>

          <h2
            style={{
              margin: '0 0 14px 0',
              fontSize: '1.85rem',
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: '-0.025em',
              color: '#111111'
            }}
          >
            Segurança das mulheres
          </h2>
          <p style={{ margin: '0 0 18px 0', fontSize: '0.95rem', color: '#333333', lineHeight: 1.55 }}>
            Na {brandName}, segurança é prioridade e nenhum tipo de assédio ou violência é tolerado.
            Trabalhamos continuamente para aprimorar nossas ferramentas de tecnologia, suporte
            dedicado e prevenção de incidentes com conteúdos educativos e atendimento imediato.
          </p>

          <button
            type="button"
            onClick={() => toggleTopic('women')}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: '1px solid #9CA3AF',
              padding: '2px 0 4px 0',
              fontSize: '0.92rem',
              fontWeight: 600,
              color: '#111111',
              cursor: 'pointer',
              marginBottom: 20
            }}
          >
            {expandedTopics.women ? 'Ocultar detalhes' : 'Saiba mais'}
          </button>

          {expandedTopics.women && (
            <div
              style={{
                backgroundColor: '#EFF6FF',
                border: '1px solid #BFDBFE',
                borderRadius: 12,
                padding: '14px',
                marginBottom: 20
              }}
            >
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#1E3A8A', marginBottom: 6 }}>
                Canais de proteção e apoio imediato
              </div>
              <p style={{ margin: '0 0 12px 0', fontSize: '0.84rem', color: '#1E40AF', lineHeight: 1.45 }}>
                Ative o K-Código, compartilhe o K-Acompanha em todas as corridas e grave o trajeto
                com K-Áudio caso sinta qualquer desconforto. Em situações urgentes:
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a
                  href="tel:180"
                  style={{
                    backgroundColor: '#1D4ED8',
                    color: '#FFFFFF',
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5
                  }}
                >
                  <PhoneCall size={13} />
                  Central da Mulher (180)
                </a>
                <a
                  href="tel:190"
                  style={{
                    backgroundColor: '#DC2626',
                    color: '#FFFFFF',
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5
                  }}
                >
                  <PhoneCall size={13} />
                  Polícia Militar (190)
                </a>
              </div>
            </div>
          )}

          <img
            src="/landing/hero-traveler.jpg"
            alt="Embarque tranquilo e protegido"
            style={{
              width: '100%',
              height: 220,
              objectFit: 'cover',
              borderRadius: 6,
              display: 'block'
            }}
          />
        </div>

        {/* DICAS PARA A SUA SEGURANÇA */}
        <div ref={tipsRef} style={{ backgroundColor: '#FFFFFF', padding: '16px 20px 28px 20px' }}>
          <h2
            style={{
              margin: '0 0 10px 0',
              fontSize: '1.8rem',
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: '-0.025em',
              color: '#111111'
            }}
          >
            Dicas para a sua segurança
          </h2>
          <p style={{ margin: '0 0 22px 0', fontSize: '0.94rem', color: '#4B5563' }}>
            Siga as dicas abaixo para ter mais segurança em suas viagens:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginBottom: 24 }}>
            {[
              {
                step: '1º passo',
                text: 'Antes de embarcar, veja os dados do motorista no aplicativo.',
                icon: <Smartphone size={18} color="#FFFFFF" />
              },
              {
                step: '2º passo',
                text: 'Confira se o motorista, o modelo e a placa do carro conferem com as informações que você vê no aplicativo.',
                icon: <ShieldCheck size={18} color="#FFFFFF" />
              },
              {
                step: '3º passo',
                text: 'Confirme com o motorista seu K-Código e as informações antes de partir.',
                icon: <UserCheck size={18} color="#FFFFFF" />
              }
            ].map((s) => (
              <div key={s.step}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    backgroundColor: '#2563EB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 10
                  }}
                >
                  {s.icon}
                </div>
                <div style={{ fontSize: '1.08rem', fontWeight: 700, color: '#111111', marginBottom: 4 }}>
                  {s.step}
                </div>
                <div style={{ fontSize: '0.92rem', color: '#374151', lineHeight: 1.5 }}>{s.text}</div>
              </div>
            ))}
          </div>

          <img
            src="/landing/driver-smile.jpg"
            alt="Motorista e passageiros com verificação confirmada"
            style={{
              width: '100%',
              height: 220,
              objectFit: 'cover',
              borderRadius: 6,
              display: 'block'
            }}
          />
        </div>

        {/* FORTALECENDO NOSSA COMUNIDADE */}
        <div ref={communityRef} style={{ backgroundColor: '#FFFFFF', padding: '10px 20px 28px 20px' }}>
          <h2
            style={{
              margin: '0 0 12px 0',
              fontSize: '1.8rem',
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: '-0.025em',
              color: '#111111'
            }}
          >
            Fortalecendo nossa comunidade
          </h2>
          <p style={{ margin: '0 0 24px 0', fontSize: '0.93rem', color: '#374151', lineHeight: 1.55 }}>
            Nosso Código da Comunidade orienta o respeito mútuo entre usuários e motoristas parceiros.
            Nosso compromisso vai além do aplicativo com processos rígidos de revisão, auditoria e
            suporte para ocorrências nos termos da lei.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
              <Users size={24} color="#111111" style={{ marginBottom: 8 }} />
              <div style={{ fontSize: '1.08rem', fontWeight: 700, color: '#111111', marginBottom: 6 }}>
                Conselho de Segurança
              </div>
              <p style={{ margin: 0, fontSize: '0.92rem', color: '#374151', lineHeight: 1.52 }}>
                Ao desenvolver novos processos e funcionalidades, a {brandName} aplica diretrizes de
                prevenção, proteção à mulher, privacidade de dados e segurança no trânsito.
              </p>
            </div>

            <div>
              <Shield size={24} color="#111111" style={{ marginBottom: 8 }} />
              <div style={{ fontSize: '1.08rem', fontWeight: 700, color: '#111111', marginBottom: 6 }}>
                Parceria com as autoridades policiais
              </div>
              <p style={{ margin: 0, fontSize: '0.92rem', color: '#374151', lineHeight: 1.52 }}>
                Mantemos registros completos e trilhas auditadas de cada corrida para prestar suporte
                rápido e formal às autoridades competentes em investigações oficiais, nos termos da
                legislação vigente.
              </p>
            </div>

            <div>
              <LifeBuoy size={24} color="#111111" style={{ marginBottom: 8 }} />
              <div style={{ fontSize: '1.08rem', fontWeight: 700, color: '#111111', marginBottom: 6 }}>
                Resposta a desastres naturais e emergências
              </div>
              <p style={{ margin: 0, fontSize: '0.92rem', color: '#374151', lineHeight: 1.52 }}>
                Operação coordenada com suporte ágil e comunicação prioritária para auxiliar
                usuários e motoristas em alertas meteorológicos ou interrupções viárias severas.
              </p>
            </div>
          </div>
        </div>

        {/* MAIS SOBRE SEGURANÇA */}
        <div
          ref={moreRef}
          style={{
            backgroundColor: '#FFFFFF',
            padding: '12px 20px 30px 20px',
            borderTop: '1px solid #F3F4F6'
          }}
        >
          <h2
            style={{
              margin: '0 0 20px 0',
              fontSize: '1.8rem',
              fontWeight: 800,
              letterSpacing: '-0.025em',
              color: '#111111'
            }}
          >
            Mais sobre segurança
          </h2>

          <div style={{ marginBottom: 26 }}>
            <Compass size={32} color="#111111" style={{ marginBottom: 10 }} />
            <div style={{ fontSize: '1.12rem', fontWeight: 700, color: '#111111', marginBottom: 4 }}>
              Segurança para os motoristas parceiros
            </div>
            <div style={{ fontSize: '0.92rem', color: '#4B5563', marginBottom: 10 }}>
              Confiança para dirigir quando e onde quiser.
            </div>
            <button
              type="button"
              onClick={() => toggleTopic('drivers')}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: '1px solid #9CA3AF',
                padding: '2px 0 4px 0',
                fontSize: '0.9rem',
                fontWeight: 600,
                color: '#111111',
                cursor: 'pointer'
              }}
            >
              {expandedTopics.drivers ? 'Ocultar' : 'Saiba mais'}
            </button>

            {expandedTopics.drivers && (
              <div
                style={{
                  marginTop: 12,
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 10,
                  padding: '12px',
                  fontSize: '0.84rem',
                  color: '#334155',
                  lineHeight: 1.5
                }}
              >
                Motoristas parceiros também contam com confirmação de passageiro por K-Código, botão
                SOS conectado à Central e monitoramento inteligente de paradas e desvios.
                {onNavigateToDriverPortal && (
                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      onClick={onNavigateToDriverPortal}
                      style={{
                        backgroundColor: '#111111',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: 8,
                        padding: '7px 12px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Acessar Portal do Motorista
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 26 }}>
            <Shield size={32} color="#111111" fill="#111111" style={{ marginBottom: 10 }} />
            <div style={{ fontSize: '1.12rem', fontWeight: 700, color: '#111111', marginBottom: 4 }}>
              Segurança é a nossa prioridade
            </div>
            <div style={{ fontSize: '0.92rem', color: '#4B5563', marginBottom: 10 }}>
              A mobilidade e as oportunidades que você merece.
            </div>
            <button
              type="button"
              onClick={() => {
                if (onOpenTerms) {
                  onOpenTerms();
                } else {
                  toggleTopic('priority');
                }
              }}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: '1px solid #9CA3AF',
                padding: '2px 0 4px 0',
                fontSize: '0.9rem',
                fontWeight: 600,
                color: '#111111',
                cursor: 'pointer'
              }}
            >
              Saiba mais
            </button>

            {expandedTopics.priority && (
              <div
                style={{
                  marginTop: 12,
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 10,
                  padding: '12px',
                  fontSize: '0.84rem',
                  color: '#334155',
                  lineHeight: 1.5
                }}
              >
                Todos os dados pessoais são tratados sob criptografia de transporte e controles de
                privacidade conforme a LGPD.
              </div>
            )}
          </div>

          <p style={{ margin: 0, fontSize: '0.8rem', color: '#6B7280', lineHeight: 1.45 }}>
            *Alguns requisitos e funcionalidades variam de acordo com a região e podem depender das
            permissões ativadas no seu aparelho.
          </p>
        </div>

        {/* RODAPÉ PRETO DA MARCA */}
        <div
          style={{
            backgroundColor: '#000000',
            color: '#FFFFFF',
            padding: '26px 20px calc(26px + env(safe-area-inset-bottom, 0px)) 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12
          }}
        >
          <span style={{ fontSize: '1.22rem', fontWeight: 700 }}>{brandName}</span>
          <button
            type="button"
            onClick={onClose}
            style={{
              backgroundColor: '#262626',
              color: '#FFFFFF',
              border: '1px solid #404040',
              borderRadius: 999,
              padding: '8px 16px',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Voltar ao app
          </button>
        </div>
      </div>
    </div>
  );

  if (asPage) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          backgroundColor: '#000000',
          display: 'flex',
          justifyContent: 'center'
        }}
      >
        {shellContent}
      </div>
    );
  }

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10075,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-end'
      }}
      onClick={onClose}
    >
      {shellContent}
    </div>,
    document.body
  );
};
