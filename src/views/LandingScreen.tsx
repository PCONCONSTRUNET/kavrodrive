import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  MapPin,
  Navigation,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Globe,
  Menu,
  X,
  ArrowRight,
  Clock,
  ShieldCheck,
  Car,
  Sparkles,
  UserCheck,
  Briefcase,
  BarChart3,
  ClipboardCheck,
  Calendar,
  Package,
  Plane,
  Bike,
  Star,
  HelpCircle,
  CheckCircle2,
} from 'lucide-react';
import { SystemConfig } from '../types';

interface LandingScreenProps {
  config: SystemConfig;
}

interface ServiceItem {
  id: string;
  title: string;
  shortLabel: string;
  desc: string;
  modalDetails: string;
  actionLabel: string;
  targetRoute: string;
  accentBg: string;
  icon: React.ReactNode;
}

interface HowItWorksStep {
  title: string;
  desc: string;
  image: string;
  fallbackGradient: string;
  icon: React.ReactNode;
}

const POPULAR_CITIES = [
  'Criciúma, BR',
  'Florianópolis, BR',
  'São Paulo, BR',
  'Curitiba, BR',
  'Porto Alegre, BR',
  'Balneário Camboriú, BR',
];

const QrCanvasBox: React.FC<{ url: string; label?: string }> = ({ url }) => {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(url, {
      width: 240,
      margin: 1,
      color: { dark: '#000000', light: '#FFFFFF' },
    })
      .then((res) => {
        if (active) setDataUrl(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [url]);

  return (
    <div
      style={{
        width: 120,
        height: 120,
        borderRadius: 8,
        backgroundColor: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        border: '1px solid #EAEAEA',
        overflow: 'hidden',
      }}
    >
      {dataUrl ? (
        <img
          src={dataUrl}
          alt="QR Code Kavro Drive"
          style={{ width: 112, height: 112, objectFit: 'contain', display: 'block' }}
        />
      ) : (
        <div
          style={{
            width: 96,
            height: 96,
            backgroundColor: '#F3F3F3',
            borderRadius: 6,
          }}
        />
      )}
    </div>
  );
};

export const LandingScreen: React.FC<LandingScreenProps> = ({ config }) => {
  const navigate = useNavigate();

  const defaultCity = config.driverCarCity?.trim()
    ? `${config.driverCarCity.trim()}, BR`
    : 'Criciúma, BR';

  const [selectedCity, setSelectedCity] = useState<string>(defaultCity);
  const [customCityInput, setCustomCityInput] = useState<string>('');
  const [cityModalOpen, setCityModalOpen] = useState<boolean>(false);

  const [pickup, setPickup] = useState<string>('');
  const [destination, setDestination] = useState<string>('');
  const [whenMode, setWhenMode] = useState<'now' | 'schedule'>('now');
  const [whenDropdownOpen, setWhenDropdownOpen] = useState<boolean>(false);
  const [locatingGps, setLocatingGps] = useState<boolean>(false);

  const [aboutMenuOpen, setAboutMenuOpen] = useState<boolean>(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState<boolean>(false);
  const [activeServiceModal, setActiveServiceModal] = useState<ServiceItem | null>(null);
  const [helpModalOpen, setHelpModalOpen] = useState<boolean>(false);
  const [businessModalOpen, setBusinessModalOpen] = useState<boolean>(false);

  // Carrossel "Como solicitar uma viagem"
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 960 : false
  );
  const [showStickyMobileCta, setShowStickyMobileCta] = useState<boolean>(false);

  const heroCtaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (config.driverCarCity?.trim()) {
      setSelectedCity(`${config.driverCarCity.trim()}, BR`);
    }
  }, [config.driverCarCity]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 960);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      if (!heroCtaRef.current) {
        setShowStickyMobileCta(window.scrollY > 340);
        return;
      }
      const rect = heroCtaRef.current.getBoundingClientRect();
      setShowStickyMobileCta(rect.bottom < 70);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const baseUrl =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://kavrodrive.vercel.app';

  const openClientFlow = (mode?: 'login' | 'register' | 'schedule') => {
    if (pickup.trim() || destination.trim() || whenMode === 'schedule' || mode === 'schedule') {
      try {
        sessionStorage.setItem(
          'kavro_landing_prefill',
          JSON.stringify({
            pickup: pickup.trim(),
            destination: destination.trim(),
            whenMode: mode === 'schedule' ? 'schedule' : whenMode,
            city: selectedCity,
          })
        );
      } catch {
        // ignore storage errors
      }
    }
    const query = mode ? `?flow=${mode}` : '';
    navigate(`/cliente${query}`);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setPickup(`Centro, ${selectedCity}`);
      return;
    }
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      () => {
        setPickup(`Minha localização atual (${selectedCity})`);
        setLocatingGps(false);
      },
      () => {
        setPickup(`Centro, ${selectedCity}`);
        setLocatingGps(false);
      },
      { timeout: 6000 }
    );
  };

  const scrollToSection = (sectionId: string) => {
    setMobileDrawerOpen(false);
    setAboutMenuOpen(false);
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const services: ServiceItem[] = [
    {
      id: 'viagem',
      title: 'Viagem',
      shortLabel: 'Viagem',
      desc: 'Vá a qualquer lugar com a Kavro Drive. Solicite uma corrida em segundos e viaje com transparência.',
      modalDetails:
        'Acompanhe o motorista em tempo real no mapa, confira placa e modelo antes de embarcar e pague com PIX, cartão ou dinheiro.',
      actionLabel: 'Solicitar viagem',
      targetRoute: '/cliente',
      accentBg: 'linear-gradient(135deg, #2A2A2A 0%, #171717 100%)',
      icon: <Car size={44} strokeWidth={1.75} color="#FFFFFF" />,
    },
    {
      id: 'reserve',
      title: 'Reserve',
      shortLabel: 'Reserve',
      desc: 'Agende sua corrida com antecedência para voos, reuniões e compromissos importantes sem atraso.',
      modalDetails:
        'Escolha data e horário exatos diretamente no app Kavro Drive e garanta pontualidade para seus deslocamentos planejados.',
      actionLabel: 'Agendar horário',
      targetRoute: '/cliente?flow=schedule',
      accentBg: 'linear-gradient(135deg, #2D2622 0%, #171717 100%)',
      icon: <Calendar size={42} strokeWidth={1.75} color="#FFFFFF" />,
    },
    {
      id: 'moto',
      title: 'Kavro Moto',
      shortLabel: 'Moto',
      desc: 'Faça trajetos rápidos e econômicos pela cidade evitando o trânsito intenso na hora do pico.',
      modalDetails:
        'Ideal para trajetos curtos e médios com tarifa acessível e chegada rápida até a porta de casa.',
      actionLabel: 'Ver tarifas Moto',
      targetRoute: '/cliente',
      accentBg: 'linear-gradient(135deg, #25282C 0%, #171717 100%)',
      icon: <Bike size={44} strokeWidth={1.75} color="#FFFFFF" />,
    },
    {
      id: 'envios',
      title: 'Envios',
      shortLabel: 'Envios',
      desc: 'A Kavro Drive facilita a entrega segura de documentos, chaves e encomendas no mesmo dia.',
      modalDetails:
        'Envie ou receba pacotes pela cidade com rastreio ao vivo do percurso do início até a entrega final.',
      actionLabel: 'Enviar um item',
      targetRoute: '/cliente',
      accentBg: 'linear-gradient(135deg, #2B2820 0%, #171717 100%)',
      icon: <Package size={42} strokeWidth={1.75} color="#FFFFFF" />,
    },
    {
      id: 'aeroporto',
      title: 'Aeroporto',
      shortLabel: 'Aeroporto',
      desc: 'Solicite idas e voltas de aeroportos e rodoviárias com porta-malas amplo para sua bagagem.',
      modalDetails:
        'Viaje com conforto e tranquilidade levando malas grandes com motoristas selecionados na região.',
      actionLabel: 'Calcular trajeto',
      targetRoute: '/cliente?flow=schedule',
      accentBg: 'linear-gradient(135deg, #22262B 0%, #171717 100%)',
      icon: <Plane size={42} strokeWidth={1.75} color="#FFFFFF" />,
    },
    {
      id: 'executivo',
      title: 'Executivo',
      shortLabel: 'Executivo',
      desc: 'Categoria superior com carros confortáveis e motoristas parceiros mais bem avaliados.',
      modalDetails:
        'Ar-condicionado, condução silenciosa e atendimento diferenciado para eventos, reuniões ou ocasiões especiais.',
      actionLabel: 'Explorar Executivo',
      targetRoute: '/cliente',
      accentBg: 'linear-gradient(135deg, #292929 0%, #161616 100%)',
      icon: <Star size={42} strokeWidth={1.75} color="#FFFFFF" />,
    },
  ];

  const howItWorksSteps: HowItWorksStep[] = [
    {
      title: 'Começar',
      desc: 'Digite seu destino no Kavro Drive ou abra o app de passageiros. Confira o valor estimado e confirme.',
      image: '/landing/step-app-phone.jpg',
      fallbackGradient: 'linear-gradient(135deg, #2A241E 0%, #111111 100%)',
      icon: <MapPin size={22} strokeWidth={2.4} color="#000000" />,
    },
    {
      title: 'Encontre um motorista parceiro',
      desc: 'Um motorista parceiro próximo aceita sua solicitação na hora. Você acompanha a chegada ao vivo.',
      image: '/landing/driver-smile.jpg',
      fallbackGradient: 'linear-gradient(135deg, #1E252B 0%, #111111 100%)',
      icon: <UserCheck size={22} strokeWidth={2.3} color="#000000" />,
    },
    {
      title: 'Confirme seus dados de embarque',
      desc: 'Verifique nome e foto do motorista, modelo e placa do veículo antes de entrar no carro.',
      image: '/landing/hero-traveler.jpg',
      fallbackGradient: 'linear-gradient(135deg, #27221E 0%, #111111 100%)',
      icon: <ShieldCheck size={22} strokeWidth={2.3} color="#000000" />,
    },
    {
      title: 'Aproveite o trajeto',
      desc: 'Seu motorista segue o melhor caminho pelo GPS e você pode compartilhar sua rota em tempo real.',
      image: '/landing/passenger-ride.jpg',
      fallbackGradient: 'linear-gradient(135deg, #1F2624 0%, #111111 100%)',
      icon: <Car size={22} strokeWidth={2.3} color="#000000" />,
    },
    {
      title: 'Avaliação e pagamento fácil',
      desc: 'Finalize a viagem sem surpresas, deixe sua avaliação ao motorista e baixe o recibo digital.',
      image: '/landing/corporate-ride.jpg',
      fallbackGradient: 'linear-gradient(135deg, #252229 0%, #111111 100%)',
      icon: <Sparkles size={22} strokeWidth={2.3} color="#000000" />,
    },
  ];

  // Paginação responsiva do carrossel: desktop (2 páginas mostrando 3 cards), mobile (5 páginas de 1 card)
  const totalDesktopPages = 2;
  const visibleDesktopSteps =
    stepIndex === 0 ? howItWorksSteps.slice(0, 3) : howItWorksSteps.slice(2, 5);
  const currentMobileStep = howItWorksSteps[stepIndex % howItWorksSteps.length];

  const handlePrevStep = () => {
    if (isMobile) {
      setStepIndex((prev) => (prev <= 0 ? howItWorksSteps.length - 1 : prev - 1));
    } else {
      setStepIndex((prev) => (prev <= 0 ? 0 : prev - 1));
    }
  };

  const handleNextStep = () => {
    if (isMobile) {
      setStepIndex((prev) => (prev + 1) % howItWorksSteps.length);
    } else {
      setStepIndex((prev) => (prev >= totalDesktopPages - 1 ? totalDesktopPages - 1 : prev + 1));
    }
  };

  const containerStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 1180,
    margin: '0 auto',
    padding: isMobile ? '0 20px' : '0 32px',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#000000',
        color: '#FFFFFF',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        userSelect: 'text',
      }}
    >
      {/* ═══ NAVBAR SUPERIOR FIXA AO ROLAR (FIXED) ═══ */}
      <header
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 64,
          backgroundColor: '#000000',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          zIndex: 120,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            ...containerStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          {/* Esquerda: Marca + links de navegação */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              style={{
                background: 'none',
                border: 'none',
                color: '#FFFFFF',
                fontSize: isMobile ? '1.15rem' : '1.35rem',
                fontWeight: 700,
                letterSpacing: '-0.03em',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: 0,
                whiteSpace: 'nowrap',
              }}
            >
              <span>Kavro Drive</span>
            </button>

            {!isMobile && (
              <nav style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => scrollToSection('servicos')}
                  className="kv-nav-pill"
                  style={navBtnStyle}
                >
                  Viajar
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection('motoristas')}
                  style={navBtnStyle}
                >
                  Motoristas
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection('como-funciona')}
                  style={navBtnStyle}
                >
                  Como funciona
                </button>
                <button
                  type="button"
                  onClick={() => scrollToSection('empresas')}
                  style={navBtnStyle}
                >
                  Empresas
                </button>

                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setAboutMenuOpen((o) => !o)}
                    style={{
                      ...navBtnStyle,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <span>Sobre</span>
                    <ChevronDown size={14} />
                  </button>
                  {aboutMenuOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '115%',
                        left: 0,
                        minWidth: 215,
                        backgroundColor: '#FFFFFF',
                        color: '#000000',
                        borderRadius: 12,
                        boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
                        padding: '8px',
                        zIndex: 140,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setAboutMenuOpen(false);
                          openClientFlow('login');
                        }}
                        style={dropdownItemStyle}
                      >
                        Portal do Passageiro
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAboutMenuOpen(false);
                          navigate('/kavro-drive');
                        }}
                        style={dropdownItemStyle}
                      >
                        Portal do Motorista
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAboutMenuOpen(false);
                          scrollToSection('apps-qr');
                        }}
                        style={dropdownItemStyle}
                      >
                        Baixar aplicativos
                      </button>
                    </div>
                  )}
                </div>
              </nav>
            )}
          </div>

          {/* Direita: Idioma / Ajuda / Ações de conta */}
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 10 }}>
            {!isMobile && (
              <>
                <button
                  type="button"
                  onClick={() => setCityModalOpen(true)}
                  style={{
                    ...navBtnStyle,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.85rem',
                  }}
                >
                  <Globe size={15} />
                  <span>PT-BR</span>
                </button>
                <button
                  type="button"
                  onClick={() => setHelpModalOpen(true)}
                  style={{ ...navBtnStyle, fontSize: '0.88rem' }}
                >
                  Ajuda
                </button>
              </>
            )}

            {/* Mudança estratégica de posição & clareza: Cadastre-se ao lado de Fazer login */}
            <button
              type="button"
              onClick={() => openClientFlow('register')}
              style={{
                height: 36,
                padding: isMobile ? '0 13px' : '0 15px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.18)',
                backgroundColor: '#141414',
                color: '#FFFFFF',
                fontSize: isMobile ? '0.82rem' : '0.88rem',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Cadastre-se
            </button>

            <button
              type="button"
              onClick={() => openClientFlow('login')}
              style={{
                height: 36,
                padding: isMobile ? '0 14px' : '0 16px',
                borderRadius: 999,
                border: 'none',
                backgroundColor: '#FFFFFF',
                color: '#000000',
                fontSize: isMobile ? '0.82rem' : '0.88rem',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Fazer login
            </button>

            {isMobile && (
              <button
                type="button"
                aria-label="Abrir menu"
                onClick={() => setMobileDrawerOpen((v) => !v)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  border: '1px solid rgba(255,255,255,0.18)',
                  backgroundColor: '#141414',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                {mobileDrawerOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Drawer Mobile */}
      {isMobile && mobileDrawerOpen && (
        <div
          style={{
            position: 'fixed',
            top: 64,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: '#000000',
            zIndex: 118,
            padding: '24px 20px 100px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {[
            { label: 'Solicitar viagem', action: () => openClientFlow('login') },
            { label: 'Nossos serviços', action: () => scrollToSection('servicos') },
            { label: 'Como solicitar uma viagem', action: () => scrollToSection('como-funciona') },
            { label: 'Dirigir com a Kavro Drive', action: () => navigate('/kavro-drive') },
            { label: 'Kavro para Empresas', action: () => scrollToSection('empresas') },
            { label: 'Baixar aplicativo', action: () => scrollToSection('apps-qr') },
            { label: `Cidade: ${selectedCity}`, action: () => { setMobileDrawerOpen(false); setCityModalOpen(true); } },
            { label: 'Central de Ajuda', action: () => { setMobileDrawerOpen(false); setHelpModalOpen(true); } },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.action}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '15px 12px',
                backgroundColor: '#111111',
                color: '#FFFFFF',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                fontSize: '1.02rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>{item.label}</span>
              <ChevronRight size={18} color="#9CA3AF" />
            </button>
          ))}
        </div>
      )}

      {/* Espaçamento para a navbar fixa */}
      <div style={{ height: 64 }} />

      {/* ═══ SEÇÃO 1: HERO PRINCIPAL PRETO ═══ */}
      <section
        style={{
          backgroundColor: '#000000',
          paddingTop: isMobile ? 22 : 48,
          paddingBottom: isMobile ? 42 : 76,
        }}
      >
        <div
          style={{
            ...containerStyle,
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.02fr) minmax(0, 1fr)',
            gap: isMobile ? 32 : 52,
            alignItems: 'center',
          }}
        >
          {/* Coluna Esquerda: Título + Inputs Partida/Destino + Ver Preços */}
          <div>
            {/* Localidade + Alterar cidade */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: '0.9rem',
                color: '#FFFFFF',
                marginBottom: 14,
              }}
            >
              <MapPin size={15} />
              <span style={{ fontWeight: 500 }}>{selectedCity}</span>
              <button
                type="button"
                onClick={() => setCityModalOpen(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#E5E7EB',
                  textDecoration: 'underline',
                  textUnderlineOffset: 4,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Alterar cidade
              </button>
            </div>

            <h1
              style={{
                fontSize: isMobile ? '2.25rem' : '3.35rem',
                fontWeight: 700,
                lineHeight: 1.08,
                letterSpacing: '-0.03em',
                color: '#FFFFFF',
                marginBottom: 22,
                maxWidth: 480,
              }}
            >
              Vá a qualquer lugar com a Kavro Drive
            </h1>

            {/* Seletor Agora / Agendar */}
            <div style={{ position: 'relative', display: 'inline-block', marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => setWhenDropdownOpen((v) => !v)}
                style={{
                  height: 38,
                  padding: '0 16px',
                  borderRadius: 999,
                  border: 'none',
                  backgroundColor: '#FFFFFF',
                  color: '#000000',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                }}
              >
                <Clock size={15} />
                <span>{whenMode === 'now' ? 'Agora' : 'Agendar'}</span>
                <ChevronDown size={15} />
              </button>

              {whenDropdownOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '115%',
                    left: 0,
                    width: 210,
                    backgroundColor: '#FFFFFF',
                    color: '#000000',
                    borderRadius: 12,
                    padding: 6,
                    boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
                    zIndex: 40,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setWhenMode('now');
                      setWhenDropdownOpen(false);
                    }}
                    style={dropdownItemStyle}
                  >
                    Partir agora
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWhenMode('schedule');
                      setWhenDropdownOpen(false);
                    }}
                    style={dropdownItemStyle}
                  >
                    Agendar com antecedência
                  </button>
                </div>
              )}
            </div>

            {/* Bloco conectado de Partida + Destino */}
            <div style={{ position: 'relative', maxWidth: 430, marginBottom: 22 }}>
              {/* Linha conectora */}
              <div
                style={{
                  position: 'absolute',
                  left: 22,
                  top: 32,
                  bottom: 32,
                  width: 1.5,
                  backgroundColor: '#000000',
                  zIndex: 3,
                }}
              />

              {/* Local de partida */}
              <div
                style={{
                  position: 'relative',
                  backgroundColor: '#FFFFFF',
                  borderRadius: 10,
                  height: 52,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 42,
                  paddingRight: 46,
                  marginBottom: 12,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    left: 17,
                    width: 11,
                    height: 11,
                    borderRadius: '50%',
                    border: '3px solid #000000',
                    backgroundColor: '#FFFFFF',
                    zIndex: 4,
                  }}
                />
                <input
                  type="text"
                  value={pickup}
                  onChange={(e) => setPickup(e.target.value)}
                  placeholder="Local de partida"
                  style={heroInputStyle}
                />
                <button
                  type="button"
                  title="Usar minha localização"
                  onClick={handleUseCurrentLocation}
                  style={{
                    position: 'absolute',
                    right: 10,
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: '#000000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    opacity: locatingGps ? 0.5 : 1,
                  }}
                >
                  <Navigation size={17} fill="#000000" />
                </button>
              </div>

              {/* Local de chegada */}
              <div
                style={{
                  position: 'relative',
                  backgroundColor: '#FFFFFF',
                  borderRadius: 10,
                  height: 52,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 42,
                  paddingRight: 16,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    left: 17,
                    width: 11,
                    height: 11,
                    borderRadius: 2,
                    border: '3px solid #000000',
                    backgroundColor: '#FFFFFF',
                    zIndex: 4,
                  }}
                />
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="Local de chegada"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') openClientFlow();
                  }}
                  style={heroInputStyle}
                />
              </div>
            </div>

            {/* CTAs Hero */}
            <div
              ref={heroCtaRef}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 18,
              }}
            >
              <button
                type="button"
                onClick={() => openClientFlow()}
                style={{
                  height: 48,
                  padding: '0 26px',
                  borderRadius: 10,
                  border: 'none',
                  backgroundColor: '#FFFFFF',
                  color: '#000000',
                  fontSize: '0.98rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Ver preços
              </button>

              <button
                type="button"
                onClick={() => openClientFlow('login')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#FFFFFF',
                  fontSize: '0.94rem',
                  textDecoration: 'underline',
                  textUnderlineOffset: 5,
                  cursor: 'pointer',
                  padding: '4px 0',
                }}
              >
                Faça login para verificar sua atividade
              </button>
            </div>
          </div>

          {/* Coluna Direita (Desktop): Mosaico visual + Agende com antecedência */}
          {!isMobile && (
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <LandingPhoto
                    src="/landing/step-app-phone.jpg"
                    alt="Solicitando corrida Kavro Drive"
                    height={145}
                    fallback="linear-gradient(135deg, #2C251D, #141414)"
                  />
                  <LandingPhoto
                    src="/landing/passenger-ride.jpg"
                    alt="Passageiro viajando com conforto"
                    height={165}
                    fallback="linear-gradient(135deg, #1E252A, #121212)"
                  />
                  <div
                    style={{
                      height: 82,
                      borderRadius: 12,
                      background: 'linear-gradient(135deg, #272727 0%, #151515 100%)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <LandingPhoto
                    src="/landing/hero-traveler.jpg"
                    alt="Viajante embarcando com bagagem"
                    height={115}
                    fallback="linear-gradient(135deg, #2A211B, #131313)"
                  />
                  <LandingPhoto
                    src="/landing/driver-smile.jpg"
                    alt="Motorista parceiro Kavro Drive"
                    height={195}
                    fallback="linear-gradient(135deg, #1D2824, #121212)"
                  />
                  <div
                    style={{
                      height: 82,
                      borderRadius: 12,
                      background: 'linear-gradient(135deg, #22262A 0%, #141414 100%)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  />
                </div>
              </div>

              {/* Faixa translúcida inferior idêntica à referência */}
              <div
                style={{
                  position: 'absolute',
                  left: 16,
                  right: 16,
                  bottom: 16,
                  backgroundColor: 'rgba(130, 118, 108, 0.78)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  borderRadius: 14,
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <span style={{ color: '#FFFFFF', fontWeight: 600, fontSize: '0.98rem' }}>
                  Pronto para viajar?
                </span>
                <button
                  type="button"
                  onClick={() => openClientFlow('schedule')}
                  style={{
                    height: 40,
                    padding: '0 18px',
                    borderRadius: 999,
                    border: 'none',
                    backgroundColor: '#FFFFFF',
                    color: '#000000',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Agende com antecedência
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══ SEÇÃO 2: DESCUBRA O QUE VOCÊ PODE FAZER COM O APP ═══ */}
      <section
        id="servicos"
        style={{
          backgroundColor: '#000000',
          paddingTop: isMobile ? 20 : 48,
          paddingBottom: isMobile ? 48 : 80,
          scrollMarginTop: 72,
        }}
      >
        <div style={containerStyle}>
          <h2
            style={{
              fontSize: isMobile ? '1.65rem' : '2.25rem',
              fontWeight: 700,
              lineHeight: 1.18,
              letterSpacing: '-0.025em',
              color: '#FFFFFF',
              marginBottom: isMobile ? 24 : 32,
              maxWidth: 680,
            }}
          >
            Descubra o que você pode fazer com o app da Kavro Drive
          </h2>

          {isMobile ? (
            /* Grade compacta 3x2 Mobile conforme print do cliente */
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 12,
              }}
            >
              {services.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveServiceModal(item)}
                  style={{
                    backgroundColor: '#1F1F1F',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 14,
                    padding: '18px 8px 14px',
                    color: '#FFFFFF',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {item.icon}
                  </div>
                  <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>{item.shortLabel}</span>
                </button>
              ))}
            </div>
          ) : (
            /* Grade 3x2 Desktop */
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 18,
              }}
            >
              {services.map((item) => (
                <div
                  key={item.id}
                  style={{
                    backgroundColor: '#1C1C1C',
                    borderRadius: 14,
                    padding: '22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    border: '1px solid rgba(255,255,255,0.06)',
                    minHeight: 168,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 10,
                      flex: 1,
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          fontSize: '1.08rem',
                          fontWeight: 700,
                          color: '#FFFFFF',
                          marginBottom: 6,
                        }}
                      >
                        {item.title}
                      </h3>
                      <p
                        style={{
                          fontSize: '0.84rem',
                          lineHeight: 1.45,
                          color: '#D1D5DB',
                          marginBottom: 14,
                        }}
                      >
                        {item.desc}
                      </p>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => setActiveServiceModal(item)}
                        style={{
                          height: 36,
                          padding: '0 16px',
                          borderRadius: 999,
                          border: 'none',
                          backgroundColor: '#FFFFFF',
                          color: '#000000',
                          fontSize: '0.84rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Informações
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      width: 84,
                      height: 84,
                      borderRadius: 16,
                      background: item.accentBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      border: '1px solid rgba(255,255,255,0.07)',
                    }}
                  >
                    {item.icon}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ═══ SEÇÃO 3: CARROSSEL INTERATIVO "COMO SOLICITAR UMA VIAGEM" ═══ */}
      <section
        id="como-funciona"
        style={{
          backgroundColor: '#000000',
          paddingTop: isMobile ? 28 : 44,
          paddingBottom: isMobile ? 52 : 84,
          scrollMarginTop: 72,
        }}
      >
        <div style={containerStyle}>
          <h2
            style={{
              fontSize: isMobile ? '1.75rem' : '2.25rem',
              fontWeight: 700,
              lineHeight: 1.18,
              letterSpacing: '-0.025em',
              color: '#FFFFFF',
              marginBottom: isMobile ? 26 : 36,
            }}
          >
            Como solicitar uma viagem
          </h2>

          {isMobile ? (
            /* Mobile: 1 card por vez + contador 1/5 .. 5/5 */
            <div>
              <StepCard step={currentMobileStep} isMobile />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 14,
                  marginTop: 28,
                }}
              >
                <span style={{ fontSize: '0.88rem', color: '#E5E7EB', fontWeight: 500 }}>
                  {(stepIndex % howItWorksSteps.length) + 1}/{howItWorksSteps.length}
                </span>
                <button
                  type="button"
                  aria-label="Passo anterior"
                  onClick={handlePrevStep}
                  style={{
                    ...circleCarouselBtnStyle,
                    backgroundColor: stepIndex === 0 ? '#6B7280' : '#FFFFFF',
                    color: '#000000',
                  }}
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  type="button"
                  aria-label="Próximo passo"
                  onClick={handleNextStep}
                  style={{
                    ...circleCarouselBtnStyle,
                    backgroundColor: '#FFFFFF',
                    color: '#000000',
                  }}
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          ) : (
            /* Desktop: 3 cards visíveis + paginação 1/2 -> 2/2 */
            <div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 28,
                }}
              >
                {visibleDesktopSteps.map((step) => (
                  <StepCard key={step.title} step={step} isMobile={false} />
                ))}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: 14,
                  marginTop: 30,
                }}
              >
                <span style={{ fontSize: '0.88rem', color: '#E5E7EB', fontWeight: 500 }}>
                  {Math.min(stepIndex, 1) + 1}/{totalDesktopPages}
                </span>
                <button
                  type="button"
                  aria-label="Página anterior"
                  onClick={handlePrevStep}
                  style={{
                    ...circleCarouselBtnStyle,
                    backgroundColor: stepIndex === 0 ? '#6B7280' : '#FFFFFF',
                    color: '#000000',
                  }}
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  type="button"
                  aria-label="Próxima página"
                  onClick={handleNextStep}
                  style={{
                    ...circleCarouselBtnStyle,
                    backgroundColor: stepIndex >= 1 ? '#6B7280' : '#FFFFFF',
                    color: '#000000',
                  }}
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══ SEÇÃO 4: MAIS FORMAS DE USAR A PLATAFORMA ═══ */}
      <section
        style={{
          backgroundColor: '#000000',
          paddingTop: isMobile ? 24 : 36,
          paddingBottom: isMobile ? 64 : 96,
        }}
      >
        <div style={containerStyle}>
          <h2
            style={{
              fontSize: isMobile ? '1.65rem' : '2.2rem',
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: '-0.025em',
              color: '#FFFFFF',
              marginBottom: 32,
            }}
          >
            Mais formas de usar a plataforma da Kavro Drive
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
              gap: isMobile ? 36 : 28,
            }}
          >
            {[
              {
                title: 'Planeje sua viagem com antecedência',
                desc: 'Agende sua corrida com antecedência escolhendo o horário ideal diretamente na Kavro Drive.',
                cta: 'Reserve já',
                image: '/landing/hero-traveler.jpg',
                badgeIcon: <Calendar size={24} color="#000000" />,
                onClick: () => openClientFlow('schedule'),
              },
              {
                title: 'Passeie com estilo e segurança',
                desc: 'Viaje em carros verificados com motoristas parceiros mais bem avaliados na sua região.',
                cta: 'Ver preços',
                image: '/landing/corporate-ride.jpg',
                badgeIcon: <Car size={24} color="#000000" />,
                onClick: () => openClientFlow(),
              },
              {
                title: 'Envie itens no mesmo dia',
                desc: 'Conte com entregas rápidas locais para chaves esquecidas, documentos e encomendas urgentes.',
                cta: 'Enviar um item',
                image: '/landing/package-delivery.jpg',
                badgeIcon: <Package size={24} color="#000000" />,
                onClick: () => openClientFlow(),
              },
            ].map((card) => (
              <div key={card.title}>
                <div
                  style={{
                    position: 'relative',
                    marginBottom: 22,
                    paddingLeft: 18,
                    paddingBottom: 14,
                  }}
                >
                  <LandingPhoto
                    src={card.image}
                    alt={card.title}
                    height={isMobile ? 210 : 220}
                    fallback="linear-gradient(135deg, #272727, #151515)"
                  />
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      bottom: 0,
                      width: 68,
                      height: 68,
                      borderRadius: 14,
                      backgroundColor: '#F3F4F6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                    }}
                  >
                    {card.badgeIcon}
                  </div>
                </div>

                <h3
                  style={{
                    fontSize: '1.15rem',
                    fontWeight: 700,
                    color: '#FFFFFF',
                    marginBottom: 8,
                  }}
                >
                  {card.title}
                </h3>
                <p
                  style={{
                    fontSize: '0.9rem',
                    lineHeight: 1.5,
                    color: '#D1D5DB',
                    marginBottom: 14,
                  }}
                >
                  {card.desc}
                </p>
                <button
                  type="button"
                  onClick={card.onClick}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#FFFFFF',
                    fontSize: '0.92rem',
                    fontWeight: 600,
                    textDecoration: 'underline',
                    textUnderlineOffset: 5,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {card.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SEÇÃO 5 (FUNDO BRANCO): MOTORISTAS PARCEIROS ═══ */}
      <section
        id="motoristas"
        style={{
          backgroundColor: '#FFFFFF',
          color: '#000000',
          paddingTop: isMobile ? 56 : 84,
          paddingBottom: isMobile ? 48 : 76,
          scrollMarginTop: 64,
        }}
      >
        <div style={containerStyle}>
          <h2
            style={{
              fontSize: isMobile ? '1.75rem' : '2.25rem',
              fontWeight: 700,
              lineHeight: 1.18,
              letterSpacing: '-0.025em',
              color: '#000000',
              marginBottom: isMobile ? 24 : 36,
            }}
          >
            Ganhe dinheiro pela plataforma da Kavro Drive
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)',
              gap: isMobile ? 22 : 48,
              alignItems: 'center',
            }}
          >
            <div style={{ maxWidth: 460 }}>
              <LandingPhoto
                src="/landing/driver-smile.jpg"
                alt="Motorista parceiro Kavro Drive"
                height={isMobile ? 220 : 255}
                fallback="linear-gradient(135deg, #1E293B, #0F172A)"
              />
            </div>

            <div style={{ maxWidth: 460 }}>
              <h3
                style={{
                  fontSize: isMobile ? '1.2rem' : '1.45rem',
                  fontWeight: 700,
                  lineHeight: 1.28,
                  color: '#000000',
                  marginBottom: 12,
                }}
              >
                Dirija e ganhe dinheiro com o app da Kavro Drive no seu próprio horário
              </h3>
              <p
                style={{
                  fontSize: '0.96rem',
                  lineHeight: 1.55,
                  color: '#4B5563',
                  marginBottom: 20,
                }}
              >
                Faça corridas na sua cidade, acompanhe seus ganhos em tempo real e tenha total
                autonomia para ficar online quando preferir.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 18 }}>
                <button
                  type="button"
                  onClick={() => navigate('/kavro-drive')}
                  style={{
                    height: 46,
                    padding: '0 22px',
                    borderRadius: 10,
                    border: 'none',
                    backgroundColor: '#000000',
                    color: '#FFFFFF',
                    fontSize: '0.94rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cadastre-se para dirigir
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/kavro-drive')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#000000',
                    fontSize: '0.92rem',
                    fontWeight: 600,
                    textDecoration: 'underline',
                    textUnderlineOffset: 5,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Já é parceiro? Acessar portal
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SEÇÃO 6 (FUNDO BRANCO): SOLUÇÕES PARA EMPRESAS ═══ */}
      <section
        id="empresas"
        style={{
          backgroundColor: '#FFFFFF',
          color: '#000000',
          paddingTop: isMobile ? 28 : 44,
          paddingBottom: isMobile ? 60 : 88,
          scrollMarginTop: 64,
        }}
      >
        <div
          style={{
            ...containerStyle,
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1.05fr)',
            gap: isMobile ? 42 : 56,
            alignItems: 'center',
          }}
        >
          {/* Visual com 3 cards escuros sobrepostos */}
          <div style={{ position: 'relative', maxWidth: 440, margin: isMobile ? '0 auto' : 0, width: '100%' }}>
            <div
              style={{
                borderRadius: '999px',
                overflow: 'hidden',
                width: isMobile ? 260 : 320,
                height: isMobile ? 210 : 250,
                margin: '0 auto',
              }}
            >
              <LandingPhoto
                src="/landing/corporate-ride.jpg"
                alt="Viagens corporativas Kavro Drive"
                height={isMobile ? 210 : 250}
                fallback="linear-gradient(135deg, #334155, #0F172A)"
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 10,
                marginTop: -46,
                position: 'relative',
                zIndex: 5,
              }}
            >
              {[
                { icon: <Briefcase size={30} color="#38BDF8" />, title: 'Corporativo' },
                { icon: <BarChart3 size={30} color="#84CC16" />, title: 'Relatórios' },
                { icon: <ClipboardCheck size={30} color="#F8FAFC" />, title: 'Faturamento' },
              ].map((tile) => (
                <div
                  key={tile.title}
                  style={{
                    height: isMobile ? 90 : 104,
                    borderRadius: 16,
                    background: 'linear-gradient(160deg, #1E1E1E 0%, #0A0A0A 100%)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    boxShadow: '0 14px 28px rgba(0,0,0,0.22)',
                  }}
                >
                  {tile.icon}
                  <span style={{ fontSize: '0.72rem', color: '#E5E7EB', fontWeight: 600 }}>
                    {tile.title}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Conteúdo texto Empresas */}
          <div>
            <h2
              style={{
                fontSize: isMobile ? '1.75rem' : '2.2rem',
                fontWeight: 700,
                lineHeight: 1.18,
                letterSpacing: '-0.025em',
                color: '#000000',
                marginBottom: 16,
              }}
            >
              Todas as vantagens do app da Kavro Drive, reinventadas para empresas
            </h2>
            <p
              style={{
                fontSize: '0.96rem',
                lineHeight: 1.6,
                color: '#374151',
                marginBottom: 24,
              }}
            >
              A Kavro para Empresas oferece à sua equipe maior controle, histórico centralizado e
              agilidade nos deslocamentos corporativos, visitas a clientes e entregas empresariais.
            </p>
            <button
              type="button"
              onClick={() => setBusinessModalOpen(true)}
              style={{
                height: 46,
                padding: '0 24px',
                borderRadius: 10,
                border: 'none',
                backgroundColor: '#000000',
                color: '#FFFFFF',
                fontSize: '0.94rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Saiba mais
            </button>
          </div>
        </div>
      </section>

      {/* ═══ SEÇÃO 7 (CINZA CLARO #F6F6F6): É MAIS FÁCIL PELO APP ═══ */}
      <section
        id="apps-qr"
        style={{
          backgroundColor: '#F6F6F6',
          color: '#000000',
          paddingTop: isMobile ? 48 : 68,
          paddingBottom: isMobile ? 56 : 78,
          scrollMarginTop: 64,
        }}
      >
        <div style={containerStyle}>
          <h2
            style={{
              fontSize: isMobile ? '1.65rem' : '2.1rem',
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: '-0.025em',
              color: '#000000',
              marginBottom: 28,
            }}
          >
            É mais fácil pelo app
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
              gap: 20,
            }}
          >
            {/* Card Passageiro */}
            <button
              type="button"
              onClick={() => openClientFlow('login')}
              style={appCardBtnStyle}
            >
              {isMobile ? (
                <div style={mobileAppBadgeStyle}>
                  <span style={{ fontWeight: 800, fontSize: '0.92rem', letterSpacing: '-0.02em' }}>
                    Kavro
                  </span>
                </div>
              ) : (
                <QrCanvasBox url={`${baseUrl}/cliente`} />
              )}
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: '1.12rem', fontWeight: 700, color: '#000000', marginBottom: 4 }}>
                  Baixe o app da Kavro Drive
                </div>
                <div style={{ fontSize: '0.88rem', color: '#4B5563' }}>
                  {isMobile ? 'Toque para entrar e solicitar corridas' : 'Escaneie para abrir no celular'}
                </div>
              </div>
              <ArrowRight size={22} color="#000000" />
            </button>

            {/* Card Motorista Parceiro */}
            <button
              type="button"
              onClick={() => navigate('/kavro-drive')}
              style={appCardBtnStyle}
            >
              {isMobile ? (
                <div
                  style={{
                    ...mobileAppBadgeStyle,
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  <span style={{ fontWeight: 800, fontSize: '0.84rem', letterSpacing: '-0.02em' }}>
                    Kavro
                  </span>
                  <ArrowRight size={16} color="#FFFFFF" />
                </div>
              ) : (
                <QrCanvasBox url={`${baseUrl}/kavro-drive`} />
              )}
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: '1.12rem', fontWeight: 700, color: '#000000', marginBottom: 4 }}>
                  Baixe o app de parceiro
                </div>
                <div style={{ fontSize: '0.88rem', color: '#4B5563' }}>
                  {isMobile ? 'Toque para abrir o Portal do Motorista' : 'Escaneie para dirigir com a gente'}
                </div>
              </div>
              <ArrowRight size={22} color="#000000" />
            </button>
          </div>
        </div>
      </section>

      {/* ═══ SEÇÃO 8: RODAPÉ PRETO ═══ */}
      <footer
        style={{
          backgroundColor: '#000000',
          color: '#FFFFFF',
          paddingTop: isMobile ? 48 : 68,
          paddingBottom: isMobile ? 96 : 56,
        }}
      >
        <div style={containerStyle}>
          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 20,
              marginBottom: 42,
            }}
          >
            <div>
              <div style={{ fontSize: '1.45rem', fontWeight: 700, marginBottom: 18 }}>
                Kavro Drive
              </div>
              <button
                type="button"
                onClick={() => setHelpModalOpen(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#FFFFFF',
                  fontSize: '0.92rem',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Acesse a Central de Ajuda
              </button>
            </div>

            <div
              style={{
                fontSize: '0.78rem',
                lineHeight: 1.55,
                color: '#9CA3AF',
                textAlign: isMobile ? 'left' : 'right',
                maxWidth: 380,
              }}
            >
              {config.companyName || 'Kavro Drive Mobilidade'} | Atendimento Digital e Viagens
              Particulares | {selectedCity}
            </div>
          </div>

          {/* 4 Colunas de Links */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))',
              gap: 32,
              marginBottom: 48,
            }}
          >
            <div>
              <h4 style={footerColTitleStyle}>Empresa</h4>
              <div style={footerColListStyle}>
                <button type="button" onClick={() => scrollToSection('servicos')} style={footerLinkStyle}>
                  Quem somos
                </button>
                <button type="button" onClick={() => scrollToSection('como-funciona')} style={footerLinkStyle}>
                  O que oferecemos
                </button>
                <button type="button" onClick={() => scrollToSection('empresas')} style={footerLinkStyle}>
                  Soluções Corporativas
                </button>
                <button type="button" onClick={() => navigate('/kavro-drive')} style={footerLinkStyle}>
                  Parceiros Motoristas
                </button>
              </div>
            </div>

            <div>
              <h4 style={footerColTitleStyle}>Produtos</h4>
              <div style={footerColListStyle}>
                <button type="button" onClick={() => openClientFlow()} style={footerLinkStyle}>
                  Viajar
                </button>
                <button type="button" onClick={() => navigate('/kavro-drive')} style={footerLinkStyle}>
                  Dirigir
                </button>
                <button type="button" onClick={() => openClientFlow('schedule')} style={footerLinkStyle}>
                  Agendar corrida
                </button>
                <button type="button" onClick={() => setBusinessModalOpen(true)} style={footerLinkStyle}>
                  Kavro para Empresas
                </button>
              </div>
            </div>

            <div>
              <h4 style={footerColTitleStyle}>Segurança</h4>
              <div style={footerColListStyle}>
                <button type="button" onClick={() => navigate('/auditoria')} style={footerLinkStyle}>
                  Transparência &amp; Auditoria
                </button>
                <button type="button" onClick={() => setHelpModalOpen(true)} style={footerLinkStyle}>
                  Central de Suporte
                </button>
              </div>
            </div>

            <div>
              <h4 style={footerColTitleStyle}>Viaje</h4>
              <div style={footerColListStyle}>
                <button type="button" onClick={() => openClientFlow('schedule')} style={footerLinkStyle}>
                  Reservar
                </button>
                <button type="button" onClick={() => openClientFlow()} style={footerLinkStyle}>
                  Aeroportos
                </button>
                <button type="button" onClick={() => setCityModalOpen(true)} style={footerLinkStyle}>
                  Cidades atendidas
                </button>
              </div>
            </div>
          </div>

          {/* Barra inferior Idioma / Cidade / Copyright */}
          <div
            style={{
              borderTop: '1px solid rgba(255,255,255,0.12)',
              paddingTop: 24,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <div style={{ fontSize: '0.82rem', color: '#9CA3AF' }}>
              © {new Date().getFullYear()} Kavro Drive. Todos os direitos reservados.
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setCityModalOpen(true)}
                style={footerPillStyle}
              >
                <Globe size={14} />
                <span>Português (Brasil)</span>
              </button>
              <button
                type="button"
                onClick={() => setCityModalOpen(true)}
                style={footerPillStyle}
              >
                <MapPin size={14} />
                <span>{selectedCity}</span>
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* ═══ BARRA INFERIOR FIXA MOBILE ("Ver preços") AO ROLAR ═══ */}
      {isMobile && showStickyMobileCta && !mobileDrawerOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: '#FFFFFF',
            padding: '12px 16px',
            borderTop: '1px solid #E5E7EB',
            boxShadow: '0 -8px 24px rgba(0,0,0,0.18)',
            zIndex: 115,
          }}
        >
          <button
            type="button"
            onClick={() => openClientFlow()}
            style={{
              width: '100%',
              height: 48,
              borderRadius: 10,
              border: 'none',
              backgroundColor: '#000000',
              color: '#FFFFFF',
              fontSize: '0.96rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Ver preços
          </button>
        </div>
      )}

      {/* ═══ MODAL DE CIDADE ═══ */}
      {cityModalOpen && (
        <div style={modalBackdropStyle} onClick={() => setCityModalOpen(false)}>
          <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#000000' }}>
                Alterar cidade de embarque
              </h3>
              <button type="button" onClick={() => setCityModalOpen(false)} style={modalCloseBtnStyle}>
                <X size={20} />
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {POPULAR_CITIES.map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => {
                    setSelectedCity(city);
                    setCityModalOpen(false);
                  }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 999,
                    border: selectedCity === city ? '1px solid #000' : '1px solid #E5E7EB',
                    backgroundColor: selectedCity === city ? '#000000' : '#F3F4F6',
                    color: selectedCity === city ? '#FFFFFF' : '#111827',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {city}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Ou digite sua cidade..."
                value={customCityInput}
                onChange={(e) => setCustomCityInput(e.target.value)}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 8,
                  border: '1px solid #D1D5DB',
                  padding: '0 12px',
                  fontSize: '0.92rem',
                  color: '#000000',
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (customCityInput.trim()) {
                    setSelectedCity(customCityInput.trim());
                    setCustomCityInput('');
                    setCityModalOpen(false);
                  }
                }}
                style={{
                  height: 44,
                  padding: '0 18px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: '#000000',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL DE DETALHES DO SERVIÇO ═══ */}
      {activeServiceModal && (
        <div style={modalBackdropStyle} onClick={() => setActiveServiceModal(null)}>
          <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h3 style={{ fontSize: '1.22rem', fontWeight: 700, color: '#000000' }}>
                {activeServiceModal.title}
              </h3>
              <button
                type="button"
                onClick={() => setActiveServiceModal(null)}
                style={modalCloseBtnStyle}
              >
                <X size={20} />
              </button>
            </div>
            <p style={{ color: '#111827', fontSize: '0.95rem', lineHeight: 1.55, marginBottom: 10 }}>
              {activeServiceModal.desc}
            </p>
            <p style={{ color: '#4B5563', fontSize: '0.9rem', lineHeight: 1.55, marginBottom: 22 }}>
              {activeServiceModal.modalDetails}
            </p>
            <button
              type="button"
              onClick={() => {
                const route = activeServiceModal.targetRoute;
                setActiveServiceModal(null);
                navigate(route);
              }}
              style={{
                width: '100%',
                height: 46,
                borderRadius: 10,
                border: 'none',
                backgroundColor: '#000000',
                color: '#FFFFFF',
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {activeServiceModal.actionLabel}
            </button>
          </div>
        </div>
      )}

      {/* ═══ MODAL EMPRESAS ═══ */}
      {businessModalOpen && (
        <div style={modalBackdropStyle} onClick={() => setBusinessModalOpen(false)}>
          <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#000000' }}>
                Kavro para Empresas
              </h3>
              <button
                type="button"
                onClick={() => setBusinessModalOpen(false)}
                style={modalCloseBtnStyle}
              >
                <X size={20} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {[
                'Centralize corridas de colaboradores e diretores em uma única conta.',
                'Recibos digitais detalhados com histórico de partida, destino e horário.',
                'Agendamento antecipado para viagens de negócios, feiras e aeroportos.',
              ].map((line) => (
                <div key={line} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <CheckCircle2 size={18} color="#000000" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: '0.92rem', color: '#374151', lineHeight: 1.45 }}>
                    {line}
                  </span>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setBusinessModalOpen(false);
                openClientFlow('register');
              }}
              style={{
                width: '100%',
                height: 46,
                borderRadius: 10,
                border: 'none',
                backgroundColor: '#000000',
                color: '#FFFFFF',
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Criar conta empresarial
            </button>
          </div>
        </div>
      )}

      {/* ═══ MODAL CENTRAL DE AJUDA ═══ */}
      {helpModalOpen && (
        <div style={modalBackdropStyle} onClick={() => setHelpModalOpen(false)}>
          <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <HelpCircle size={20} color="#000000" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#000000' }}>
                  Central de Ajuda Kavro Drive
                </h3>
              </div>
              <button type="button" onClick={() => setHelpModalOpen(false)} style={modalCloseBtnStyle}>
                <X size={20} />
              </button>
            </div>
            <p style={{ fontSize: '0.92rem', color: '#374151', lineHeight: 1.55, marginBottom: 16 }}>
              Precisa de ajuda com uma viagem, cadastro de passageiro ou parceria como motorista?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  setHelpModalOpen(false);
                  openClientFlow('login');
                }}
                style={{
                  width: '100%',
                  height: 44,
                  borderRadius: 10,
                  border: 'none',
                  backgroundColor: '#000000',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Acessar Área do Passageiro
              </button>
              <button
                type="button"
                onClick={() => {
                  setHelpModalOpen(false);
                  navigate('/kavro-drive');
                }}
                style={{
                  width: '100%',
                  height: 44,
                  borderRadius: 10,
                  border: '1px solid #D1D5DB',
                  backgroundColor: '#F9FAFB',
                  color: '#000000',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Acessar Portal do Motorista
              </button>
              {config.driverPhone && (
                <a
                  href={`https://wa.me/${config.driverPhone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    width: '100%',
                    height: 44,
                    borderRadius: 10,
                    border: '1px solid #D1D5DB',
                    backgroundColor: '#FFFFFF',
                    color: '#000000',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textDecoration: 'none',
                  }}
                >
                  Falar com suporte via WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── SUBCOMPONENTES VISUAIS ── */

const LandingPhoto: React.FC<{
  src: string;
  alt: string;
  height: number;
  fallback: string;
}> = ({ src, alt, height, fallback }) => {
  const [failed, setFailed] = useState(false);

  return (
    <div
      style={{
        width: '100%',
        height,
        borderRadius: 12,
        overflow: 'hidden',
        background: fallback,
        position: 'relative',
      }}
    >
      {!failed && (
        <img
          src={src}
          alt={alt}
          onError={() => setFailed(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      )}
    </div>
  );
};

const StepCard: React.FC<{ step: HowItWorksStep; isMobile: boolean }> = ({ step, isMobile }) => (
  <div>
    <div
      style={{
        position: 'relative',
        paddingLeft: isMobile ? 22 : 18,
        paddingBottom: isMobile ? 22 : 16,
        marginBottom: 14,
      }}
    >
      <LandingPhoto
        src={step.image}
        alt={step.title}
        height={isMobile ? 200 : 185}
        fallback={step.fallbackGradient}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: isMobile ? 74 : 66,
          height: isMobile ? 74 : 66,
          borderRadius: 14,
          backgroundColor: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 10px 26px rgba(0,0,0,0.45)',
        }}
      >
        {step.icon}
      </div>
    </div>

    <h3
      style={{
        fontSize: '1.12rem',
        fontWeight: 700,
        color: '#FFFFFF',
        marginBottom: 8,
      }}
    >
      {step.title}
    </h3>
    <p
      style={{
        fontSize: '0.9rem',
        lineHeight: 1.5,
        color: '#D1D5DB',
      }}
    >
      {step.desc}
    </p>
  </div>
);

/* ── ESTILOS REUTILIZÁVEIS ── */

const navBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#FFFFFF',
  fontSize: '0.9rem',
  fontWeight: 600,
  padding: '8px 12px',
  borderRadius: 999,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const dropdownItemStyle: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  background: 'none',
  border: 'none',
  padding: '10px 12px',
  borderRadius: 8,
  fontSize: '0.9rem',
  fontWeight: 600,
  color: '#111827',
  cursor: 'pointer',
};

const heroInputStyle: React.CSSProperties = {
  width: '100%',
  border: 'none',
  outline: 'none',
  backgroundColor: 'transparent',
  color: '#000000',
  fontSize: '0.95rem',
  fontWeight: 500,
};

const circleCarouselBtnStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: '50%',
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

const appCardBtnStyle: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #EAEAEA',
  borderRadius: 12,
  padding: '20px 22px',
  display: 'flex',
  alignItems: 'center',
  gap: 18,
  cursor: 'pointer',
  width: '100%',
  boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
};

const mobileAppBadgeStyle: React.CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: 16,
  backgroundColor: '#000000',
  color: '#FFFFFF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const footerColTitleStyle: React.CSSProperties = {
  fontSize: '1.02rem',
  fontWeight: 700,
  color: '#FFFFFF',
  marginBottom: 14,
};

const footerColListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 10,
};

const footerLinkStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#D1D5DB',
  fontSize: '0.9rem',
  cursor: 'pointer',
  padding: 0,
};

const footerPillStyle: React.CSSProperties = {
  backgroundColor: '#141414',
  border: '1px solid rgba(255,255,255,0.16)',
  color: '#FFFFFF',
  borderRadius: 8,
  height: 36,
  padding: '0 12px',
  fontSize: '0.82rem',
  fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  cursor: 'pointer',
};

const modalBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.68)',
  backdropFilter: 'blur(4px)',
  zIndex: 200,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
};

const modalCardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 440,
  backgroundColor: '#FFFFFF',
  color: '#000000',
  borderRadius: 16,
  padding: '22px',
  boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
};

const modalHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 14,
};

const modalCloseBtnStyle: React.CSSProperties = {
  background: '#F3F4F6',
  border: 'none',
  width: 34,
  height: 34,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: '#000000',
};
