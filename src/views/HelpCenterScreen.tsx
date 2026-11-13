import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Car,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  FileText,
  HelpCircle,
  Mail,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { SystemConfig } from '../types';
import { WhatsAppIcon } from '../components/WhatsAppIcon';
import { formatPhone, getCleanWhatsappNumber } from '../utils/format';

interface HelpCenterScreenProps {
  config: SystemConfig;
}

type HelpTopicCategory = 'all' | 'passenger' | 'driver' | 'payments' | 'security';

interface HelpFaqItem {
  id: string;
  category: Exclude<HelpTopicCategory, 'all'>;
  categoryLabel: string;
  question: string;
  answer: string;
  highlights?: string[];
  actionLabel?: string;
  actionRoute?: string;
}

const FAQ_CATEGORIES: { id: HelpTopicCategory; label: string }[] = [
  { id: 'all', label: 'Todos os temas' },
  { id: 'passenger', label: 'Passageiros' },
  { id: 'driver', label: 'Motoristas' },
  { id: 'payments', label: 'Pagamentos & Pix' },
  { id: 'security', label: 'Segurança & LGPD' },
];

const HELP_FAQS: HelpFaqItem[] = [
  {
    id: 'faq-ride-request',
    category: 'passenger',
    categoryLabel: 'Passageiros',
    question: 'Como solicito ou agendo uma corrida na Kavro Drive?',
    answer:
      'Na página inicial ou na Área do Passageiro, informe o endereço de embarque e o destino para visualizar a estimativa antes de confirmar. Você pode chamar para embarque imediato ou escolher data e hora no modo Agendar.',
    highlights: [
      'Cálculo transparente antes de confirmar o chamado',
      'Acompanhamento do motorista no mapa em tempo real',
      'Comprovante automático com código único de corrida',
    ],
    actionLabel: 'Ir para Área do Passageiro',
    actionRoute: '/cliente',
  },
  {
    id: 'faq-cancel',
    category: 'passenger',
    categoryLabel: 'Passageiros',
    question: 'Posso cancelar ou alterar meu ponto de embarque?',
    answer:
      'Sim. Enquanto a corrida estiver buscando motorista ou antes da chegada ao ponto de embarque, você pode cancelar diretamente no painel da viagem. Caso o motorista já tenha se deslocado, podem ser aplicadas regras de taxa operacional exibidas previamente.',
  },
  {
    id: 'faq-profile-approval',
    category: 'passenger',
    categoryLabel: 'Passageiros',
    question: 'Por que alterações de Nome, Telefone ou E-mail passam por análise?',
    answer:
      'Para evitar fraudes ou invasões de conta, pedidos de troca de dados sensíveis (nome completo, celular WhatsApp ou e-mail) geram uma solicitação auditável enviada para a Central Master. Enquanto estiver pendente, os dados anteriores permanecem protegidos até aprovação ou recusa motivada.',
    actionLabel: 'Gerenciar meu Perfil',
    actionRoute: '/cliente/perfil',
  },
  {
    id: 'faq-lost-item',
    category: 'passenger',
    categoryLabel: 'Passageiros',
    question: 'Esqueci um objeto dentro do veículo. Como recupero?',
    answer:
      'Acesse a lista de "Minhas Corridas" para identificar a placa e o código da viagem, ou consulte o motorista na Auditoria Pública para acionar o contato oficial ou o suporte Kavro via WhatsApp imediatamente.',
    actionLabel: 'Consultar Auditoria Pública',
    actionRoute: '/auditoria',
  },
  {
    id: 'faq-driver-docs',
    category: 'driver',
    categoryLabel: 'Motoristas',
    question: 'Quais documentos são exigidos para dirigir na Kavro Drive?',
    answer:
      'O parceiro precisa possuir CNH válida com observação EAR (Exerce Atividade Remunerada), CPF regular, documentação do veículo (CRLV atualizado), foto nítida do rosto para biometria facial (KYC) e termo contratual assinado eletronicamente.',
    highlights: [
      'Validação automática de CNH + selfie por biometria',
      'Veículo com 4 portas e ar-condicionado ativo',
      'Aprovação pela Central Master antes de ficar online',
    ],
    actionLabel: 'Acessar Portal do Motorista',
    actionRoute: '/kavro-drive',
  },
  {
    id: 'faq-vehicle-id',
    category: 'driver',
    categoryLabel: 'Motoristas',
    question: 'Como o sistema identifica meu carro pela cor, modelo e ano?',
    answer:
      'Durante o cadastro no Portal do Motorista, você pode digitar o veículo por extenso (ex: "Corolla 2024 Prata") ou selecionar marca, modelo, ano e cor. A plataforma identifica automaticamente a categoria elegível (Kavro Go, Kavro Plus ou Kavro Exec) e exibe a foto exata correspondente ao veículo.',
  },
  {
    id: 'faq-driver-categories',
    category: 'driver',
    categoryLabel: 'Motoristas',
    question: 'Qual a diferença entre Kavro Go, Kavro Plus e Kavro Exec?',
    answer:
      'As categorias são liberadas automaticamente conforme ano de fabricação, porte, porta-malas e acabamento interno do veículo. Veículos habilitados em níveis superiores também podem optar por receber chamados das categorias abaixo nas Preferências do motorista.',
  },
  {
    id: 'faq-payment-methods',
    category: 'payments',
    categoryLabel: 'Pagamentos & Pix',
    question: 'Quais formas de pagamento a plataforma aceita?',
    answer:
      'A Kavro Drive aceita pagamento via Pix (com validação automática ou chave configurada), Cartão de Crédito/Débito salvo no aplicativo e Dinheiro diretamente ao motorista parceiro ao término da corrida.',
    highlights: [
      'Valor estimado exibido antes de chamar o motorista',
      'Sem cobranças ocultas ou taxas surpresa no destino',
    ],
  },
  {
    id: 'faq-driver-payout',
    category: 'payments',
    categoryLabel: 'Pagamentos & Pix',
    question: 'Como funciona o repasse e a carteira do motorista parceiro?',
    answer:
      'Todos os ganhos líquidos, corridas em Pix/Cartão e eventuais taxas de corridas em dinheiro ficam detalhados na aba Carteira do Portal do Motorista, com saque ou compensação direta pela chave Pix cadastrada.',
  },
  {
    id: 'faq-kyc-lgpd',
    category: 'security',
    categoryLabel: 'Segurança & LGPD',
    question: 'Como funcionam a biometria KYC, a Auditoria Pública e o botão SOS?',
    answer:
      'Todos os motoristas passam por comparação facial biométrica contra a CNH e assinatura digital com hash de integridade. Durante viagens ativas, tanto o passageiro quanto o motorista têm acesso ao botão SOS de emergência com link ao vivo e à página de Auditoria Pública.',
    actionLabel: 'Abrir Transparência & Auditoria',
    actionRoute: '/auditoria',
  },
  {
    id: 'faq-data-privacy',
    category: 'security',
    categoryLabel: 'Segurança & LGPD',
    question: 'Meus dados pessoais estão protegidos conforme a LGPD?',
    answer:
      'Sim. Dados sensíveis como CPF completo, CNH, imagens de documentos e informações bancárias permanecem mascarados nas interfaces públicas, respeitando a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).',
  },
];

const WHATSAPP_TOPICS = [
  { id: 'passageiro', label: 'Sou Passageiro', msg: 'Olá! Preciso de ajuda na Central de Ajuda Kavro Drive (Área do Passageiro).' },
  { id: 'motorista', label: 'Sou Motorista', msg: 'Olá! Preciso de suporte para motorista parceiro na Kavro Drive.' },
  { id: 'empresa', label: 'Empresa / Frota', msg: 'Olá! Gostaria de falar sobre mobilidade corporativa e parcerias com a Kavro Drive.' },
];

export const HelpCenterScreen: React.FC<HelpCenterScreenProps> = ({ config }) => {
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<HelpTopicCategory>('all');
  const [openFaqId, setOpenFaqId] = useState<string>('faq-ride-request');
  const [whatsappTopicId, setWhatsappTopicId] = useState<string>('passageiro');

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const filteredFaqs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return HELP_FAQS.filter((item) => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q) ||
        item.categoryLabel.toLowerCase().includes(q) ||
        (item.highlights || []).some((h) => h.toLowerCase().includes(q))
      );
    });
  }, [searchQuery, selectedCategory]);

  const rawWhatsapp = config.companyWhatsapp || config.driverPhone || config.companyPhone || '';
  const cleanWhatsapp = getCleanWhatsappNumber(rawWhatsapp);
  const activeTopic = WHATSAPP_TOPICS.find((t) => t.id === whatsappTopicId) || WHATSAPP_TOPICS[0];
  const whatsappUrl = cleanWhatsapp
    ? `https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent(activeTopic.msg)}`
    : '';

  const phoneDisplay = config.companyPhone || config.driverPhone || '';
  const companyEmail = config.companyEmail || 'suporte@kavrodrive.com.br';
  const operationCity = config.driverCarCity || 'Brasil';

  const containerStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 1120,
    margin: '0 auto',
    padding: isMobile ? '0 14px' : '0 28px',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#F3F6F4',
        color: '#0B1218',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        overflowX: 'hidden',
      }}
    >
      {/* ═══ HEADER COMPACTO CLEAN ═══ */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 80,
          backgroundColor: 'rgba(11, 18, 24, 0.96)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(132, 204, 22, 0.22)',
        }}
      >
        <div
          style={{
            ...containerStyle,
            height: isMobile ? 58 : 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <button
              type="button"
              onClick={() => navigate('/')}
              title="Voltar para a Home"
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                border: '1px solid rgba(255,255,255,0.16)',
                backgroundColor: '#131E26',
                color: '#FFFFFF',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <ArrowLeft size={16} />
            </button>

            <img
              src="/logo-horizontal-white.png"
              alt="Kavro Drive"
              onClick={() => navigate('/')}
              style={{
                height: isMobile ? 22 : 27,
                width: 'auto',
                objectFit: 'contain',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            />

            {!isMobile && (
              <span
                style={{
                  borderLeft: '1px solid rgba(255,255,255,0.16)',
                  paddingLeft: 12,
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  color: '#8CE826',
                  whiteSpace: 'nowrap',
                }}
              >
                Central de Ajuda
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => navigate('/auditoria')}
              style={{
                height: 34,
                padding: isMobile ? '0 10px' : '0 13px',
                borderRadius: 9,
                border: '1px solid rgba(255,255,255,0.16)',
                backgroundColor: 'rgba(255,255,255,0.06)',
                color: '#E2E8F0',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <ShieldCheck size={14} color="#8CE826" />
              <span>{isMobile ? 'Auditoria' : 'Auditoria Pública'}</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/cliente')}
              style={{
                height: 34,
                padding: isMobile ? '0 11px' : '0 14px',
                borderRadius: 9,
                border: 'none',
                backgroundColor: '#84CC16',
                color: '#0A120E',
                fontSize: '0.78rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span>Entrar</span>
            </button>
          </div>
        </div>
      </header>

      {/* ═══ HERO COM BUSCA CLEAN ═══ */}
      <section
        style={{
          background: 'linear-gradient(155deg, #091015 0%, #0F1D19 60%, #13281A 100%)',
          color: '#FFFFFF',
          padding: isMobile ? '28px 0 32px' : '44px 0 48px',
          borderBottom: '1px solid rgba(132, 204, 22, 0.16)',
        }}
      >
        <div style={containerStyle}>
          <div style={{ maxWidth: 740, margin: '0 auto', textAlign: isMobile ? 'left' : 'center' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 11px',
                borderRadius: 999,
                backgroundColor: 'rgba(132, 204, 22, 0.14)',
                border: '1px solid rgba(132, 204, 22, 0.3)',
                color: '#A3E635',
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.03em',
                marginBottom: 14,
              }}
            >
              <HelpCircle size={13} />
              <span>SUPORTE &amp; ORIENTAÇÕES KAVRO DRIVE</span>
            </div>

            <h1
              style={{
                fontSize: isMobile ? '1.65rem' : '2.35rem',
                fontWeight: 800,
                lineHeight: 1.15,
                letterSpacing: '-0.025em',
                margin: '0 0 10px',
              }}
            >
              Como podemos ajudar você hoje?
            </h1>

            <p
              style={{
                fontSize: isMobile ? '0.9rem' : '1rem',
                lineHeight: 1.55,
                color: '#B8C4CE',
                margin: isMobile ? '0 0 20px' : '0 auto 24px',
                maxWidth: 600,
              }}
            >
              Consulte respostas rápidas sobre viagens, cadastro de motorista, pagamentos via Pix e protocolos de segurança — ou fale direto com nosso suporte.
            </p>

            {/* Barra de Pesquisa Interativa */}
            <div
              style={{
                position: 'relative',
                maxWidth: 620,
                margin: isMobile ? '0' : '0 auto',
              }}
            >
              <Search
                size={18}
                color="#64748B"
                style={{
                  position: 'absolute',
                  left: 16,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar dúvida (ex: Pix, CNH, cancelamento, objeto esquecido...)"
                style={{
                  width: '100%',
                  height: isMobile ? 48 : 52,
                  padding: '0 44px 0 44px',
                  borderRadius: 14,
                  border: '1.5px solid rgba(255,255,255,0.16)',
                  backgroundColor: '#FFFFFF',
                  color: '#0B1218',
                  fontSize: isMobile ? '0.9rem' : '0.95rem',
                  fontWeight: 500,
                  outline: 'none',
                  boxShadow: '0 14px 32px rgba(0, 0, 0, 0.28)',
                  boxSizing: 'border-box',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  title="Limpar pesquisa"
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    border: 'none',
                    backgroundColor: '#E2E8F0',
                    color: '#334155',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CONTEÚDO PRINCIPAL ═══ */}
      <main style={{ ...containerStyle, paddingTop: isMobile ? 20 : 28, paddingBottom: 56 }}>
        {/* 1. Atalhos Rápidos de Acesso (3 cards limpos) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
            gap: 12,
            marginBottom: isMobile ? 22 : 28,
          }}
        >
          {[
            {
              icon: <User size={19} color="#16A34A" />,
              bg: '#ECFDF5',
              title: 'Área do Passageiro',
              desc: 'Solicitar viagem, acompanhar rota, comprovantes e editar perfil.',
              btnText: 'Acessar Passageiro',
              route: '/cliente',
            },
            {
              icon: <Car size={19} color="#0F172A" />,
              bg: '#F1F5F9',
              title: 'Portal do Motorista',
              desc: 'Cadastro com foto do carro, verificação KYC, radar e carteira.',
              btnText: 'Acessar Motorista',
              route: '/kavro-drive',
            },
            {
              icon: <ShieldCheck size={19} color="#15803D" />,
              bg: '#F0FDF4',
              title: 'Auditoria & Segurança',
              desc: 'Frota verificada, veículos inspecionados e termos formais LGPD.',
              btnText: 'Abrir Auditoria',
              route: '/auditoria',
            },
          ].map((card) => (
            <button
              key={card.title}
              type="button"
              onClick={() => navigate(card.route)}
              style={{
                textAlign: 'left',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 16,
                padding: isMobile ? '15px 16px' : '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 12,
                cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
                transition: 'transform 0.15s ease, border-color 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 11,
                    backgroundColor: card.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {card.icon}
                </div>
                <div>
                  <div style={{ fontSize: '0.96rem', fontWeight: 700, color: '#0B1218', marginBottom: 4 }}>
                    {card.title}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#64748B', lineHeight: 1.45 }}>
                    {card.desc}
                  </div>
                </div>
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: '#15803D',
                }}
              >
                <span>{card.btnText}</span>
                <ArrowRight size={14} />
              </div>
            </button>
          ))}
        </div>

        {/* 2. Tópicos & Perguntas Frequentes (FAQ) */}
        <section
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: 18,
            padding: isMobile ? '16px 14px' : '24px 26px',
            marginBottom: isMobile ? 22 : 28,
            boxShadow: '0 4px 18px rgba(15, 23, 42, 0.03)',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'flex-start' : 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <h2 style={{ fontSize: isMobile ? '1.1rem' : '1.25rem', fontWeight: 800, color: '#0B1218', margin: 0 }}>
                Perguntas Frequentes
              </h2>
              <p style={{ fontSize: '0.83rem', color: '#64748B', margin: '3px 0 0' }}>
                Selecione uma categoria para filtrar ou clique na pergunta para ver o guia completo.
              </p>
            </div>
            <span
              style={{
                fontSize: '0.76rem',
                fontWeight: 700,
                color: '#475569',
                backgroundColor: '#F1F5F9',
                padding: '5px 10px',
                borderRadius: 999,
              }}
            >
              {filteredFaqs.length} {filteredFaqs.length === 1 ? 'tópico encontrado' : 'tópicos encontrados'}
            </span>
          </div>

          {/* Filtros de Categoria (Pills Responsivas) */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: 18,
              paddingBottom: 14,
              borderBottom: '1px solid #F1F5F9',
            }}
          >
            {FAQ_CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  style={{
                    height: 35,
                    padding: '0 14px',
                    borderRadius: 999,
                    border: active ? '1px solid #0B1218' : '1px solid #E2E8F0',
                    backgroundColor: active ? '#0B1218' : '#F8FAFC',
                    color: active ? '#A3E635' : '#334155',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Lista Accordion Clean */}
          {filteredFaqs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '28px 14px' }}>
              <p style={{ fontSize: '0.92rem', color: '#475569', marginBottom: 12 }}>
                Nenhum tópico encontrado para "{searchQuery}".
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
                style={{
                  height: 36,
                  padding: '0 16px',
                  borderRadius: 10,
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: '#0B1218',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                Limpar filtros
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredFaqs.map((faq) => {
                const isOpen = openFaqId === faq.id;
                return (
                  <div
                    key={faq.id}
                    style={{
                      borderRadius: 13,
                      border: isOpen ? '1px solid #84CC16' : '1px solid #E2E8F0',
                      backgroundColor: isOpen ? '#FAFCF8' : '#FFFFFF',
                      overflow: 'hidden',
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaqId(isOpen ? '' : faq.id)}
                      style={{
                        width: '100%',
                        padding: isMobile ? '14px 14px' : '16px 18px',
                        border: 'none',
                        background: 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <span
                          style={{
                            display: 'inline-block',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            color: '#15803D',
                            backgroundColor: '#DCFCE7',
                            padding: '2px 8px',
                            borderRadius: 999,
                            marginBottom: 6,
                          }}
                        >
                          {faq.categoryLabel}
                        </span>
                        <div
                          style={{
                            fontSize: isMobile ? '0.9rem' : '0.96rem',
                            fontWeight: 700,
                            color: '#0B1218',
                            lineHeight: 1.35,
                          }}
                        >
                          {faq.question}
                        </div>
                      </div>
                      <ChevronDown
                        size={18}
                        color="#64748B"
                        style={{
                          flexShrink: 0,
                          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s ease',
                        }}
                      />
                    </button>

                    {isOpen && (
                      <div
                        style={{
                          padding: isMobile ? '0 14px 15px' : '0 18px 18px',
                          borderTop: '1px solid #ECFCCB',
                          paddingTop: 12,
                        }}
                      >
                        <p style={{ fontSize: '0.88rem', color: '#334155', lineHeight: 1.6, margin: 0 }}>
                          {faq.answer}
                        </p>

                        {faq.highlights && faq.highlights.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                            {faq.highlights.map((h) => (
                              <div
                                key={h}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  fontSize: '0.82rem',
                                  color: '#1E293B',
                                  fontWeight: 500,
                                }}
                              >
                                <CheckCircle2 size={14} color="#16A34A" style={{ flexShrink: 0 }} />
                                <span>{h}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {faq.actionLabel && faq.actionRoute && (
                          <div style={{ marginTop: 14 }}>
                            <button
                              type="button"
                              onClick={() => navigate(faq.actionRoute!)}
                              style={{
                                height: 36,
                                padding: '0 14px',
                                borderRadius: 9,
                                border: '1px solid #0B1218',
                                backgroundColor: '#0B1218',
                                color: '#A3E635',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              <span>{faq.actionLabel}</span>
                              <ArrowRight size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 3. Canais de Atendimento Humano & Informações Oficiais */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.8fr',
            gap: 14,
          }}
        >
          {/* Card WhatsApp Direto com Seleção de Assunto */}
          <div
            style={{
              backgroundColor: '#0B1218',
              color: '#FFFFFF',
              borderRadius: 18,
              padding: isMobile ? '18px 16px' : '24px 26px',
              border: '1px solid rgba(132, 204, 22, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <MessageCircle size={18} color="#8CE826" />
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#8CE826', letterSpacing: '0.03em' }}>
                  ATENDIMENTO DIRETO KAVRO
                </span>
              </div>
              <h3 style={{ fontSize: isMobile ? '1.1rem' : '1.25rem', fontWeight: 800, margin: '0 0 6px' }}>
                Ainda precisa falar com nossa equipe?
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#CBD5E1', lineHeight: 1.55, margin: 0 }}>
                Selecione seu perfil abaixo para iniciar um atendimento direto com a mensagem já organizada no WhatsApp oficial.
              </p>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                {WHATSAPP_TOPICS.map((topic) => {
                  const selected = topic.id === whatsappTopicId;
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => setWhatsappTopicId(topic.id)}
                      style={{
                        height: 34,
                        padding: '0 12px',
                        borderRadius: 999,
                        border: selected ? '1px solid #84CC16' : '1px solid rgba(255,255,255,0.18)',
                        backgroundColor: selected ? 'rgba(132, 204, 22, 0.18)' : 'rgba(255,255,255,0.05)',
                        color: selected ? '#BEF264' : '#E2E8F0',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {topic.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              {whatsappUrl ? (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    height: 44,
                    padding: '0 18px',
                    borderRadius: 11,
                    backgroundColor: '#84CC16',
                    color: '#091015',
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    textDecoration: 'none',
                  }}
                >
                  <WhatsAppIcon size={18} />
                  <span>Iniciar conversa no WhatsApp</span>
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate('/cliente')}
                  style={{
                    height: 44,
                    padding: '0 18px',
                    borderRadius: 11,
                    border: 'none',
                    backgroundColor: '#84CC16',
                    color: '#091015',
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                  }}
                >
                  Acessar Painel do Passageiro
                </button>
              )}

              {phoneDisplay && (
                <a
                  href={`tel:${phoneDisplay.replace(/\D/g, '')}`}
                  style={{
                    height: 44,
                    padding: '0 15px',
                    borderRadius: 11,
                    border: '1px solid rgba(255,255,255,0.2)',
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: '0.84rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    textDecoration: 'none',
                  }}
                >
                  <Phone size={15} />
                  <span>{formatPhone(phoneDisplay)}</span>
                </a>
              )}
            </div>
          </div>

          {/* Card Informações da Central & Conformidade */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 18,
              padding: isMobile ? '18px 16px' : '24px 22px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 14,
            }}
          >
            <div>
              <h3 style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0B1218', margin: '0 0 12px' }}>
                Canais &amp; Prazos Operacionais
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <Clock size={16} color="#16A34A" style={{ marginTop: 2, flexShrink: 0 }} />
                  <div style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.45 }}>
                    <strong style={{ color: '#0B1218', display: 'block' }}>Atendimento prioritário</strong>
                    Suporte em tempo real para corridas ativas e acionamentos de emergência SOS 24h.
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <CreditCard size={16} color="#16A34A" style={{ marginTop: 2, flexShrink: 0 }} />
                  <div style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.45 }}>
                    <strong style={{ color: '#0B1218', display: 'block' }}>Revisão cadastral &amp; Pix</strong>
                    Solicitações de troca de dados e aprovação documental são analisadas pela Central Master.
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <Mail size={16} color="#16A34A" style={{ marginTop: 2, flexShrink: 0 }} />
                  <div style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.45 }}>
                    <strong style={{ color: '#0B1218', display: 'block' }}>E-mail &amp; Base Operacional</strong>
                    {companyEmail} • Operação {operationCity}
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate('/auditoria')}
              style={{
                width: '100%',
                height: 40,
                borderRadius: 10,
                border: '1px solid #CBD5E1',
                backgroundColor: '#F8FAFC',
                color: '#0B1218',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
              }}
            >
              <FileText size={15} color="#15803D" />
              <span>Ver Termos Formais &amp; Auditoria Pública</span>
            </button>
          </div>
        </section>

        {/* Rodapé Discreto */}
        <footer
          style={{
            marginTop: 28,
            paddingTop: 18,
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            fontSize: '0.78rem',
            color: '#64748B',
          }}
        >
          <span>
            © {new Date().getFullYear()} {config.companyName || 'Kavro Drive Mobilidade'} — Central de Ajuda Oficial
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              type="button"
              onClick={() => navigate('/')}
              style={{ background: 'none', border: 'none', color: '#334155', fontWeight: 600, cursor: 'pointer', padding: 0 }}
            >
              Início
            </button>
            <button
              type="button"
              onClick={() => navigate('/cliente')}
              style={{ background: 'none', border: 'none', color: '#334155', fontWeight: 600, cursor: 'pointer', padding: 0 }}
            >
              Passageiro
            </button>
            <button
              type="button"
              onClick={() => navigate('/kavro-drive')}
              style={{ background: 'none', border: 'none', color: '#334155', fontWeight: 600, cursor: 'pointer', padding: 0 }}
            >
              Motorista
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
};
