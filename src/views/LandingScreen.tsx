import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  MapPin,
  Navigation,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  ArrowRight,
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
  CheckCircle2,
  Wallet,
} from 'lucide-react';
import { SystemConfig } from '../types';
import { PartnersSponsorsSection } from '../components/PartnersSponsorsSection';
import {
  CityOrCepSuggestion,
  lookupViaCep,
  reverseGeocode,
  searchCitiesAndViaCep
} from '../utils/geo';

interface LandingScreenProps {
  config: SystemConfig;
}

interface ServiceItem {
  id: string;
  category: 'mobilidade' | 'especial';
  badge: string;
  title: string;
  shortLabel: string;
  desc: string;
  modalDetails: string;
  actionLabel: string;
  targetRoute: string;
  icon: React.ReactNode;
}

interface HowItWorksStep {
  num: string;
  title: string;
  desc: string;
  image: string;
  fallbackGradient: string;
  icon: React.ReactNode;
}

const POPULAR_CITIES = [
  'Lauro Müller - SC, BR',
  'Criciúma - SC, BR',
  'Orleans - SC, BR',
  'Tubarão - SC, BR',
  'Florianópolis - SC, BR',
  'São Paulo - SP, BR',
  'Curitiba - PR, BR',
  'Porto Alegre - RS, BR',
];

const QrCanvasBox: React.FC<{ url: string; darkMode?: boolean }> = ({ url, darkMode }) => {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(url, {
      width: 220,
      margin: 1,
      color: { dark: '#0B1218', light: '#FFFFFF' },
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
        width: 110,
        height: 110,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        border: darkMode ? '2px solid rgba(118, 216, 0, 0.5)' : '1px solid #DCE5DF',
        overflow: 'hidden',
      }}
    >
      {dataUrl ? (
        <img
          src={dataUrl}
          alt="QR Code Kavro Drive"
          style={{ width: 100, height: 100, objectFit: 'contain', display: 'block' }}
        />
      ) : (
        <div
          style={{
            width: 88,
            height: 88,
            backgroundColor: '#F3F4F6',
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
  const [citySuggestions, setCitySuggestions] = useState<CityOrCepSuggestion[]>([]);
  const [isSearchingCity, setIsSearchingCity] = useState<boolean>(false);
  const [cepFeedback, setCepFeedback] = useState<string>('');
  const [locatingCityGps, setLocatingCityGps] = useState<boolean>(false);

  const [pickup, setPickup] = useState<string>('');
  const [destination, setDestination] = useState<string>('');
  const [locatingGps, setLocatingGps] = useState<boolean>(false);

  const [serviceFilter, setServiceFilter] = useState<'all' | 'mobilidade' | 'especial'>('all');
  const [aboutMenuOpen, setAboutMenuOpen] = useState<boolean>(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState<boolean>(false);
  const [activeServiceModal, setActiveServiceModal] = useState<ServiceItem | null>(null);
  const [businessModalOpen, setBusinessModalOpen] = useState<boolean>(false);

  // Etapa ativa do "Como funciona" (0 a 4)
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
    if (!cityModalOpen) {
      setCitySuggestions([]);
      setCepFeedback('');
      return;
    }
    const trimmed = customCityInput.trim();
    if (trimmed.length < 2) {
      setCitySuggestions([]);
      setCepFeedback('');
      setIsSearchingCity(false);
      return;
    }

    let active = true;
    setIsSearchingCity(true);
    const tid = setTimeout(() => {
      searchCitiesAndViaCep(trimmed)
        .then((results) => {
          if (!active) return;
          setCitySuggestions(results);
          const digits = trimmed.replace(/\D/g, '');
          if (/^[\d.\-\s]+$/.test(trimmed) && digits.length === 8) {
            if (results[0]?.source === 'viacep') {
              setCepFeedback(`ViaCEP localizado: ${results[0].subtitle}`);
            } else {
              setCepFeedback('CEP não encontrado no ViaCEP. Confira os 8 dígitos.');
            }
          } else {
            setCepFeedback('');
          }
        })
        .catch(() => {
          if (active) setCitySuggestions([]);
        })
        .finally(() => {
          if (active) setIsSearchingCity(false);
        });
    }, 220);

    return () => {
      active = false;
      clearTimeout(tid);
    };
  }, [customCityInput, cityModalOpen]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 960);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      if (!heroCtaRef.current) {
        setShowStickyMobileCta(window.scrollY > 380);
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
    if (pickup.trim() || destination.trim() || mode === 'schedule') {
      try {
        sessionStorage.setItem(
          'kavro_landing_prefill',
          JSON.stringify({
            pickup: pickup.trim(),
            destination: destination.trim(),
            whenMode: mode === 'schedule' ? 'schedule' : 'now',
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
      async (pos) => {
        try {
          const resolved = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          setPickup(resolved && !resolved.startsWith('GPS:') ? resolved : `Minha localização atual (${selectedCity})`);
        } catch {
          setPickup(`Minha localização atual (${selectedCity})`);
        } finally {
          setLocatingGps(false);
        }
      },
      () => {
        setPickup(`Centro, ${selectedCity}`);
        setLocatingGps(false);
      },
      { timeout: 6000 }
    );
  };

  const handleSelectCitySuggestion = (item: CityOrCepSuggestion) => {
    setSelectedCity(item.cityLabel);
    if (item.streetAddress && !pickup.trim()) {
      setPickup(item.streetAddress);
    }
    setCustomCityInput('');
    setCitySuggestions([]);
    setCepFeedback('');
    setCityModalOpen(false);
  };

  const handleApplyCityOrCep = async () => {
    const raw = customCityInput.trim();
    if (!raw) return;

    if (citySuggestions.length > 0) {
      handleSelectCitySuggestion(citySuggestions[0]);
      return;
    }

    const digits = raw.replace(/\D/g, '');
    if (/^[\d.\-\s]+$/.test(raw) && digits.length === 8) {
      setIsSearchingCity(true);
      const via = await lookupViaCep(digits);
      setIsSearchingCity(false);
      if (via) {
        setSelectedCity(via.formattedCity);
        if (via.formattedAddress && !pickup.trim()) {
          setPickup(via.formattedAddress);
        }
        setCustomCityInput('');
        setCitySuggestions([]);
        setCepFeedback('');
        setCityModalOpen(false);
        return;
      }
      setCepFeedback('CEP não encontrado no ViaCEP. Tente outro CEP ou digite o nome da cidade.');
      return;
    }

    setSelectedCity(raw.includes(', BR') ? raw : `${raw}, BR`);
    setCustomCityInput('');
    setCitySuggestions([]);
    setCepFeedback('');
    setCityModalOpen(false);
  };

  const handleDetectCityViaGps = () => {
    if (!navigator.geolocation) return;
    setLocatingCityGps(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const addr = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          if (addr && !addr.startsWith('GPS:')) {
            const parts = addr.split(',');
            const cityChunk = (parts[parts.length - 1] || addr).trim().replace('/', ' - ');
            setSelectedCity(cityChunk.includes(', BR') ? cityChunk : `${cityChunk}, BR`);
            if (!pickup.trim()) setPickup(addr);
            setCityModalOpen(false);
          }
        } catch {
          // ignore
        } finally {
          setLocatingCityGps(false);
        }
      },
      () => {
        setLocatingCityGps(false);
      },
      { enableHighAccuracy: true, timeout: 6000 }
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
      category: 'mobilidade',
      badge: 'Mais usado',
      title: 'Kavro Viagem',
      shortLabel: 'Viagem',
      desc: 'Corridas urbanas com preço definido antes de chamar e acompanhamento em tempo real.',
      modalDetails:
        'Acompanhe o motorista em tempo real no mapa, confira placa e modelo antes de embarcar e pague com PIX, cartão ou dinheiro.',
      actionLabel: 'Solicitar viagem',
      targetRoute: '/cliente',
      icon: <Car size={24} strokeWidth={2} color="#76D800" />,
    },
    {
      id: 'moto',
      category: 'mobilidade',
      badge: 'Rápido',
      title: 'Kavro Moto',
      shortLabel: 'Moto',
      desc: 'Deslocamentos ágeis e econômicos para vencer o trânsito na hora do pico.',
      modalDetails:
        'Ideal para trajetos curtos e médios com tarifa acessível e chegada rápida até a porta de casa.',
      actionLabel: 'Ver tarifas Moto',
      targetRoute: '/cliente',
      icon: <Bike size={24} strokeWidth={2} color="#76D800" />,
    },
    {
      id: 'executivo',
      category: 'mobilidade',
      badge: 'Premium',
      title: 'Kavro Executivo',
      shortLabel: 'Executivo',
      desc: 'Veículos espaçosos, ar-condicionado e motoristas parceiros mais bem avaliados.',
      modalDetails:
        'Condução silenciosa e atendimento diferenciado para reuniões, eventos ou deslocamentos especiais.',
      actionLabel: 'Explorar Executivo',
      targetRoute: '/cliente',
      icon: <Star size={24} strokeWidth={2} color="#76D800" />,
    },
    {
      id: 'reserve',
      category: 'especial',
      badge: 'Hora marcada',
      title: 'Agenda & Reserve',
      shortLabel: 'Reserve',
      desc: 'Programe seu embarque com antecedência para compromissos, clínicas e reuniões.',
      modalDetails:
        'Escolha data e horário exatos diretamente no app Kavro Drive e garanta pontualidade sem correria.',
      actionLabel: 'Agendar horário',
      targetRoute: '/cliente?flow=schedule',
      icon: <Calendar size={24} strokeWidth={2} color="#76D800" />,
    },
    {
      id: 'envios',
      category: 'especial',
      badge: 'No mesmo dia',
      title: 'Kavro Envios',
      shortLabel: 'Envios',
      desc: 'Envio seguro de documentos, chaves esquecidas e encomendas pela sua cidade.',
      modalDetails:
        'Envie ou receba pacotes pela cidade com rastreio ao vivo do percurso do início até a entrega final.',
      actionLabel: 'Enviar um item',
      targetRoute: '/cliente',
      icon: <Package size={24} strokeWidth={2} color="#76D800" />,
    },
    {
      id: 'aeroporto',
      category: 'especial',
      badge: 'Porta-malas amplo',
      title: 'Conexão Aeroporto',
      shortLabel: 'Aeroporto',
      desc: 'Traslados para aeroportos e rodoviárias com espaço extra para suas bagagens.',
      modalDetails:
        'Viaje com tranquilidade levando malas grandes com motoristas selecionados na região.',
      actionLabel: 'Calcular trajeto',
      targetRoute: '/cliente?flow=schedule',
      icon: <Plane size={24} strokeWidth={2} color="#76D800" />,
    },
  ];

  const filteredServices =
    serviceFilter === 'all' ? services : services.filter((item) => item.category === serviceFilter);

  const howItWorksSteps: HowItWorksStep[] = [
    {
      num: '01',
      title: 'Informe origem e destino',
      desc: 'Digite seu endereço de saída e chegada na Kavro Drive ou use o GPS automático para calcular na hora.',
      image: '/landing/step-app-phone.jpg',
      fallbackGradient: 'linear-gradient(135deg, #172721 0%, #0B1218 100%)',
      icon: <MapPin size={22} strokeWidth={2.4} color="#0B1218" />,
    },
    {
      num: '02',
      title: 'Escolha categoria e forma de pagamento',
      desc: 'Compare valores entre Viagem, Moto ou Executivo e pague via PIX, cartão de crédito ou dinheiro.',
      image: '/landing/passenger-ride.jpg',
      fallbackGradient: 'linear-gradient(135deg, #16232D 0%, #0B1218 100%)',
      icon: <Wallet size={22} strokeWidth={2.3} color="#0B1218" />,
    },
    {
      num: '03',
      title: 'Motorista verificado aceita seu chamado',
      desc: 'Parceiros com KYC conferido aceitam seu pedido rapidamente e você acompanha a aproximação no mapa.',
      image: '/landing/driver-smile.jpg',
      fallbackGradient: 'linear-gradient(135deg, #172721 0%, #0B1218 100%)',
      icon: <UserCheck size={22} strokeWidth={2.3} color="#0B1218" />,
    },
    {
      num: '04',
      title: 'Embarque conferindo placa e modelo',
      desc: 'Veja nome, foto e dados do carro antes de entrar e viaje com rota monitorada do início ao fim.',
      image: '/landing/hero-traveler.jpg',
      fallbackGradient: 'linear-gradient(135deg, #16232D 0%, #0B1218 100%)',
      icon: <ShieldCheck size={22} strokeWidth={2.3} color="#0B1218" />,
    },
    {
      num: '05',
      title: 'Chegue ao destino e receba seu comprovante',
      desc: 'Finalize sem cobranças inesperadas, avalie a experiência e consulte todo histórico na sua conta.',
      image: '/landing/corporate-ride.jpg',
      fallbackGradient: 'linear-gradient(135deg, #172721 0%, #0B1218 100%)',
      icon: <Sparkles size={22} strokeWidth={2.3} color="#0B1218" />,
    },
  ];

  const activeStep = howItWorksSteps[stepIndex] || howItWorksSteps[0];

  const containerStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 1200,
    margin: '0 auto',
    padding: isMobile ? '0 18px' : '0 32px',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0B1218',
        color: '#FFFFFF',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        userSelect: 'text',
        overflowX: 'hidden',
      }}
    >
      {/* ═══ NAVBAR SUPERIOR KAVRO ═══ */}
      <header
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 68,
          backgroundColor: 'rgba(11, 18, 24, 0.94)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: '1px solid rgba(118, 216, 0, 0.18)',
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
            gap: 14,
          }}
        >
          {/* Esquerda: Marca + Seletor de Cidade Visível */}
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 18, minWidth: 0, flex: isMobile ? 1 : undefined }}>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: 0,
                flexShrink: 0,
              }}
            >
              <img
                src="/logo-horizontal-white.png"
                alt="Kavro Drive"
                style={{
                  height: isMobile ? 25 : 33,
                  width: 'auto',
                  display: 'block',
                  objectFit: 'contain',
                }}
              />
            </button>

            <button
              type="button"
              onClick={() => setCityModalOpen(true)}
              title="Alterar cidade"
              style={{
                height: 32,
                padding: isMobile ? '0 9px' : '0 12px',
                borderRadius: 999,
                border: '1px solid rgba(118, 216, 0, 0.28)',
                backgroundColor: '#131E26',
                color: '#E2E8F0',
                fontSize: isMobile ? '0.73rem' : '0.8rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                minWidth: 0,
                maxWidth: isMobile ? 156 : 'none',
              }}
            >
              <MapPin size={13} color="#76D800" style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedCity.replace(', BR', '')}
              </span>
              <ChevronDown size={13} color="#94A3B8" style={{ flexShrink: 0 }} />
            </button>
          </div>

          {/* Centro (Desktop): Links com nova ordem */}
          {!isMobile && (
            <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button type="button" onClick={() => scrollToSection('motoristas')} style={navBtnStyle}>
                Para Motoristas
              </button>
              <button type="button" onClick={() => scrollToSection('servicos')} style={navBtnStyle}>
                Serviços
              </button>
              <button type="button" onClick={() => scrollToSection('como-funciona')} style={navBtnStyle}>
                Como funciona
              </button>
              <button type="button" onClick={() => scrollToSection('empresas')} style={navBtnStyle}>
                Empresas
              </button>
              <button type="button" onClick={() => navigate('/ajuda')} style={navBtnStyle}>
                Ajuda
              </button>

              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setAboutMenuOpen((o) => !o)}
                  style={{
                    ...navBtnStyle,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span>Mais</span>
                  <ChevronDown size={14} />
                </button>
                {aboutMenuOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '120%',
                      left: 0,
                      minWidth: 220,
                      backgroundColor: '#131E26',
                      border: '1px solid rgba(118, 216, 0, 0.25)',
                      color: '#FFFFFF',
                      borderRadius: 12,
                      boxShadow: '0 18px 40px rgba(0,0,0,0.45)',
                      padding: 8,
                      zIndex: 140,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setAboutMenuOpen(false);
                        navigate('/frotas');
                      }}
                      style={darkDropdownItemStyle}
                    >
                      Frota Verificada
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAboutMenuOpen(false);
                        scrollToSection('apps-qr');
                      }}
                      style={darkDropdownItemStyle}
                    >
                      Acessar no Celular
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAboutMenuOpen(false);
                        navigate('/ajuda');
                      }}
                      style={darkDropdownItemStyle}
                    >
                      Central de Ajuda
                    </button>
                  </div>
                )}
              </div>
            </nav>
          )}

          {/* Direita: Ações */}
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 10, flexShrink: 0 }}>
            {!isMobile ? (
              <>
                <button
                  type="button"
                  onClick={() => navigate('/kavro-drive')}
                  style={{
                    ...navBtnStyle,
                    color: '#8CE826',
                    fontSize: '0.86rem',
                  }}
                >
                  Portal Motorista
                </button>

                <button
                  type="button"
                  onClick={() => openClientFlow('register')}
                  style={{
                    height: 36,
                    padding: '0 14px',
                    borderRadius: 10,
                    border: '1px solid rgba(118, 216, 0, 0.35)',
                    backgroundColor: '#131E26',
                    color: '#FFFFFF',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Criar conta
                </button>

                <button
                  type="button"
                  onClick={() => openClientFlow('login')}
                  style={{
                    height: 36,
                    padding: '0 16px',
                    borderRadius: 10,
                    border: 'none',
                    backgroundColor: '#76D800',
                    color: '#0B1218',
                    fontSize: '0.86rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Entrar
                </button>
              </>
            ) : (
              <button
                type="button"
                aria-label="Abrir menu e atalhos"
                onClick={() => setMobileDrawerOpen((v) => !v)}
                style={{
                  width: 40,
                  height: 38,
                  borderRadius: 11,
                  border: '1px solid rgba(118, 216, 0, 0.4)',
                  backgroundColor: '#131E26',
                  color: '#FFFFFF',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.28)',
                }}
              >
                {mobileDrawerOpen ? <X size={19} /> : <Menu size={20} />}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Drawer Lateral Mobile (somente rotas principais com abertura suave em câmera lenta) */}
      {isMobile && (
        <div
          aria-hidden={!mobileDrawerOpen}
          onClick={() => setMobileDrawerOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(6, 11, 15, 0.74)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 190,
            display: 'flex',
            justifyContent: 'flex-end',
            opacity: mobileDrawerOpen ? 1 : 0,
            visibility: mobileDrawerOpen ? 'visible' : 'hidden',
            pointerEvents: mobileDrawerOpen ? 'auto' : 'none',
            transition: 'opacity 520ms cubic-bezier(0.16, 1, 0.3, 1), visibility 620ms',
          }}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(82vw, 320px)',
              height: '100dvh',
              backgroundColor: '#0E171E',
              borderLeft: '1px solid rgba(118, 216, 0, 0.28)',
              borderTopLeftRadius: 24,
              borderBottomLeftRadius: 24,
              padding: 'calc(20px + env(safe-area-inset-top, 0px)) 18px calc(24px + env(safe-area-inset-bottom, 0px)) 18px',
              boxShadow: '-24px 0 64px rgba(0, 0, 0, 0.65)',
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              overflowY: 'auto',
              transform: mobileDrawerOpen ? 'translate3d(0, 0, 0)' : 'translate3d(104%, 0, 0)',
              opacity: mobileDrawerOpen ? 1 : 0.65,
              transition: 'transform 620ms cubic-bezier(0.16, 1, 0.3, 1), opacity 520ms cubic-bezier(0.16, 1, 0.3, 1)',
              willChange: 'transform, opacity',
            }}
          >
            {/* Cabeçalho do Drawer Lateral */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                paddingBottom: 14,
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <img
                src="/logo-horizontal-white.png"
                alt="Kavro Drive"
                style={{ height: 24, width: 'auto', objectFit: 'contain' }}
              />
              <button
                type="button"
                aria-label="Fechar menu"
                onClick={() => setMobileDrawerOpen(false)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.14)',
                  backgroundColor: '#131E26',
                  color: '#CBD5E1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Entrar e Criar conta */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                transform: mobileDrawerOpen ? 'translate3d(0, 0, 0)' : 'translate3d(24px, 0, 0)',
                opacity: mobileDrawerOpen ? 1 : 0,
                transition: 'transform 560ms cubic-bezier(0.16, 1, 0.3, 1) 80ms, opacity 480ms ease 80ms',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  openClientFlow('login');
                }}
                style={{
                  height: 48,
                  borderRadius: 12,
                  border: 'none',
                  backgroundColor: '#76D800',
                  color: '#0B1218',
                  fontSize: '0.94rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  openClientFlow('register');
                }}
                style={{
                  height: 48,
                  borderRadius: 12,
                  border: '1px solid rgba(118, 216, 0, 0.45)',
                  backgroundColor: '#131E26',
                  color: '#FFFFFF',
                  fontSize: '0.94rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                Criar conta
              </button>
            </div>

            <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />

            {/* Portal do Motorista e Agendar Horário */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  navigate('/kavro-drive');
                }}
                style={{
                  ...drawerRowBtnStyle,
                  transform: mobileDrawerOpen ? 'translate3d(0, 0, 0)' : 'translate3d(28px, 0, 0)',
                  opacity: mobileDrawerOpen ? 1 : 0,
                  transition: 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1) 140ms, opacity 500ms ease 140ms',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <Car size={18} color="#76D800" />
                  <span>Portal do Motorista</span>
                </span>
                <ChevronRight size={17} color="#76D800" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  openClientFlow('schedule');
                }}
                style={{
                  ...drawerRowBtnStyle,
                  transform: mobileDrawerOpen ? 'translate3d(0, 0, 0)' : 'translate3d(32px, 0, 0)',
                  opacity: mobileDrawerOpen ? 1 : 0,
                  transition: 'transform 640ms cubic-bezier(0.16, 1, 0.3, 1) 200ms, opacity 520ms ease 200ms',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <Calendar size={18} color="#76D800" />
                  <span>Agendar horário</span>
                </span>
                <ChevronRight size={17} color="#76D800" />
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Espaçamento para a navbar fixa */}
      <div style={{ height: 68 }} />

      {/* ═══ SEÇÃO 1: HERO AUTORAL KAVRO (CARD SIMULADOR + VISUAL DESTAQUE ÚNICO) ═══ */}
      <section
        style={{
          background:
            'radial-gradient(circle at 82% 20%, rgba(118, 216, 0, 0.14) 0%, rgba(11, 18, 24, 0) 52%), linear-gradient(180deg, #0B1218 0%, #0E171F 100%)',
          paddingTop: isMobile ? 22 : 44,
          paddingBottom: isMobile ? 38 : 68,
        }}
      >
        <div
          style={{
            ...containerStyle,
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.05fr) minmax(0, 0.95fr)',
            gap: isMobile ? 28 : 48,
            alignItems: 'center',
          }}
        >
          {/* Coluna Principal: Headline + Dock Card Simulador */}
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                borderRadius: 999,
                backgroundColor: 'rgba(118, 216, 0, 0.12)',
                border: '1px solid rgba(118, 216, 0, 0.3)',
                color: '#8CE826',
                fontSize: '0.8rem',
                fontWeight: 700,
                marginBottom: 16,
              }}
            >
              <Sparkles size={14} />
              <span>Mobilidade direta em {selectedCity}</span>
            </div>

            <h1
              style={{
                fontSize: isMobile ? '2.1rem' : '3.15rem',
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: '-0.03em',
                color: '#FFFFFF',
                marginBottom: 14,
              }}
            >
              Seu trajeto sob medida, sem surpresas no valor
            </h1>

            <p
              style={{
                fontSize: isMobile ? '0.96rem' : '1.04rem',
                lineHeight: 1.55,
                color: '#CBD5E1',
                marginBottom: 24,
                maxWidth: 510,
              }}
            >
              Compare Carro, Moto, Executivo ou Envios na hora, pague com PIX ou cartão e acompanhe
              motoristas verificados em tempo real.
            </p>

            {/* Painel Flutuante Simulador Kavro (substitui inputs soltos no fundo) */}
            <div
              style={{
                backgroundColor: '#131E26',
                border: '1px solid rgba(118, 216, 0, 0.24)',
                borderRadius: 18,
                padding: isMobile ? 16 : 20,
                boxShadow: '0 22px 50px rgba(0, 0, 0, 0.38)',
                maxWidth: 500,
              }}
            >
              {/* Campos Partida / Destino */}
              <div style={{ position: 'relative', marginBottom: 14 }}>
                <div
                  style={{
                    position: 'absolute',
                    left: 20,
                    top: 30,
                    bottom: 30,
                    width: 2,
                    backgroundColor: 'rgba(118, 216, 0, 0.35)',
                    zIndex: 2,
                  }}
                />

                <div
                  style={{
                    position: 'relative',
                    backgroundColor: '#FFFFFF',
                    borderRadius: 11,
                    height: 50,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 40,
                    paddingRight: 44,
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: 15,
                      width: 11,
                      height: 11,
                      borderRadius: '50%',
                      border: '3px solid #76D800',
                      backgroundColor: '#0B1218',
                      zIndex: 3,
                    }}
                  />
                  <input
                    type="text"
                    value={pickup}
                    onChange={(e) => setPickup(e.target.value)}
                    placeholder="Onde você está?"
                    style={heroInputStyle}
                  />
                  <button
                    type="button"
                    title="Usar minha localização"
                    onClick={handleUseCurrentLocation}
                    style={{
                      position: 'absolute',
                      right: 8,
                      width: 34,
                      height: 34,
                      borderRadius: 9,
                      border: 'none',
                      backgroundColor: '#F1F5F9',
                      color: '#0B1218',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      opacity: locatingGps ? 0.5 : 1,
                    }}
                  >
                    <Navigation size={16} />
                  </button>
                </div>

                <div
                  style={{
                    position: 'relative',
                    backgroundColor: '#FFFFFF',
                    borderRadius: 11,
                    height: 50,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 40,
                    paddingRight: 14,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: 15,
                      width: 11,
                      height: 11,
                      borderRadius: 3,
                      border: '3px solid #0B1218',
                      backgroundColor: '#76D800',
                      zIndex: 3,
                    }}
                  />
                  <input
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="Para onde deseja ir?"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') openClientFlow();
                    }}
                    style={heroInputStyle}
                  />
                </div>
              </div>

              {/* Botão Principal do Simulador */}
              <div
                ref={heroCtaRef}
                style={{
                  display: 'flex',
                }}
              >
                <button
                  type="button"
                  onClick={() => openClientFlow()}
                  style={{
                    width: '100%',
                    height: 48,
                    padding: '0 20px',
                    borderRadius: 11,
                    border: 'none',
                    backgroundColor: '#76D800',
                    color: '#0B1218',
                    fontSize: '0.96rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <span>Calcular corrida</span>
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>

            {/* Selos rápidos de confiança alinhados simetricamente ao card */}
            <div
              style={{
                display: isMobile ? 'grid' : 'flex',
                gridTemplateColumns: isMobile ? 'repeat(3, minmax(0, 1fr))' : undefined,
                flexWrap: isMobile ? undefined : 'wrap',
                gap: isMobile ? 6 : 10,
                marginTop: 14,
                maxWidth: 500,
              }}
            >
              {[
                { mobile: 'PIX na hora', desktop: 'PIX instantâneo' },
                { mobile: 'KYC verificado', desktop: 'Motoristas com KYC' },
                { mobile: 'Valor antes', desktop: 'Tarifa antes de embarcar' },
              ].map((tag) => (
                <div
                  key={tag.desktop}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: isMobile ? 'center' : 'flex-start',
                    gap: isMobile ? 4 : 6,
                    fontSize: isMobile ? '0.69rem' : '0.8rem',
                    fontWeight: 600,
                    color: '#CBD5E1',
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 999,
                    padding: isMobile ? '6px 6px' : '5px 11px',
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                  }}
                >
                  <CheckCircle2 size={isMobile ? 12 : 13} color="#76D800" style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {isMobile ? tag.mobile : tag.desktop}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Coluna Direita (Desktop): Foto Destaque Única + Cartões Flutuantes Autênticos */}
          {!isMobile && (
            <div style={{ position: 'relative', paddingBottom: 24, paddingRight: 12 }}>
              <div
                style={{
                  borderRadius: 24,
                  overflow: 'hidden',
                  border: '1px solid rgba(118, 216, 0, 0.26)',
                  boxShadow: '0 28px 60px rgba(0, 0, 0, 0.45)',
                }}
              >
                <LandingPhoto
                  src="/landing/hero-traveler.jpg"
                  alt="Passageiro embarcando com a Kavro Drive"
                  height={440}
                  borderRadius={0}
                  fallback="linear-gradient(135deg, #172721, #0D161D)"
                />
              </div>

              {/* Mini-card flutuante superior esquerdo */}
              <div
                style={{
                  position: 'absolute',
                  top: 20,
                  left: -18,
                  backgroundColor: 'rgba(11, 18, 24, 0.92)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid rgba(118, 216, 0, 0.35)',
                  borderRadius: 14,
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  boxShadow: '0 14px 30px rgba(0,0,0,0.4)',
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    backgroundColor: '#76D800',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ShieldCheck size={18} color="#0B1218" />
                </div>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#FFFFFF' }}>
                    Identidade conferida
                  </div>
                  <div style={{ fontSize: '0.73rem', color: '#8CE826' }}>
                    CNH &amp; selfie validados
                  </div>
                </div>
              </div>

              {/* Card flutuante inferior direito com ação de agendamento */}
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  bottom: 0,
                  left: 42,
                  backgroundColor: 'rgba(19, 30, 38, 0.94)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid rgba(118, 216, 0, 0.34)',
                  borderRadius: 16,
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                  boxShadow: '0 20px 44px rgba(0,0,0,0.45)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <img
                    src="/landing/step-app-phone.jpg"
                    alt="App Kavro Drive"
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 10,
                      objectFit: 'cover',
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#FFFFFF' }}>
                      Vai viajar amanhã cedo?
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#CBD5E1' }}>
                      Deixe sua saída reservada no app
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openClientFlow('schedule')}
                  style={{
                    height: 38,
                    padding: '0 16px',
                    borderRadius: 10,
                    border: 'none',
                    backgroundColor: '#76D800',
                    color: '#0B1218',
                    fontSize: '0.84rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Reservar horário
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══ PARCEIROS & PATROCINADORES DA HOME ═══ */}
      <PartnersSponsorsSection
        items={config.partnerBanners}
        variant="dark"
        isMobile={isMobile}
        onBecomePartnerClick={() => setBusinessModalOpen(true)}
      />

      {/* ═══ SEÇÃO 2 (NOVA ORDEM — VERDE SUAVE #F2F6F3): MOTORISTAS PARCEIROS EM DESTAQUE ═══ */}
      <section
        id="motoristas"
        style={{
          backgroundColor: '#F2F6F3',
          color: '#0B1218',
          paddingTop: isMobile ? 42 : 68,
          paddingBottom: isMobile ? 46 : 72,
          scrollMarginTop: 68,
        }}
      >
        <div style={containerStyle}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.05fr) minmax(0, 0.95fr)',
              gap: isMobile ? 24 : 48,
              alignItems: 'center',
            }}
          >
            {/* Lado Esquerdo (inverso do padrão Uber!): Conteúdo + 3 Cards de Benefício */}
            <div>
              <div
                style={{
                  display: 'inline-block',
                  padding: '5px 12px',
                  borderRadius: 999,
                  backgroundColor: '#121A21',
                  color: '#76D800',
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  letterSpacing: '0.03em',
                  textTransform: 'uppercase',
                  marginBottom: 14,
                }}
              >
                Portal do Parceiro Kavro
              </div>

              <h2
                style={{
                  fontSize: isMobile ? '1.7rem' : '2.35rem',
                  fontWeight: 800,
                  lineHeight: 1.14,
                  letterSpacing: '-0.025em',
                  color: '#0B1218',
                  marginBottom: 12,
                }}
              >
                Dirija com autonomia e acompanhe cada centavo em tempo real
              </h2>

              <p
                style={{
                  fontSize: '0.96rem',
                  lineHeight: 1.58,
                  color: '#334155',
                  marginBottom: 22,
                }}
              >
                Na Kavro Drive, você decide quando ficar online, visualiza seus ganhos líquidos na hora
                e conta com validação digital rápida para começar a rodar na sua cidade.
              </p>

              {/* 3 Cards de Métricas / Benefícios */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                  gap: 10,
                  marginBottom: 24,
                }}
              >
                {[
                  { title: 'Saldo transparente', sub: 'Extrato claro por corrida' },
                  { title: '100% flexível', sub: 'Ligue e desligue quando quiser' },
                  { title: 'Cadastro digital', sub: 'Envio de CNH e contrato online' },
                ].map((perk) => (
                  <div
                    key={perk.title}
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #DCE5DF',
                      borderRadius: 12,
                      padding: '12px 14px',
                    }}
                  >
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0B1218', marginBottom: 3 }}>
                      {perk.title}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#475569', lineHeight: 1.35 }}>
                      {perk.sub}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => navigate('/kavro-drive')}
                  style={{
                    height: 46,
                    padding: '0 22px',
                    borderRadius: 11,
                    border: 'none',
                    backgroundColor: '#121A21',
                    color: '#76D800',
                    fontSize: '0.94rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Quero dirigir na Kavro
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/kavro-drive')}
                  style={{
                    height: 46,
                    padding: '0 20px',
                    borderRadius: 11,
                    border: '1px solid #B8C7BE',
                    backgroundColor: '#FFFFFF',
                    color: '#0B1218',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Já sou motorista
                </button>
              </div>
            </div>

            {/* Lado Direito: Foto Parceiro com Borda Kavro */}
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  borderRadius: 22,
                  overflow: 'hidden',
                  border: '2px solid #DCE5DF',
                  boxShadow: '0 20px 45px rgba(11, 18, 24, 0.14)',
                }}
              >
                <LandingPhoto
                  src="/landing/driver-smile.jpg"
                  alt="Motorista parceiro Kavro Drive"
                  height={isMobile ? 225 : 330}
                  borderRadius={0}
                  fallback="linear-gradient(135deg, #1E293B, #0F172A)"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SEÇÃO 3 (ESCURA #0B1218): CATEGORIAS E SERVIÇOS COM FILTRO INTERATIVO ═══ */}
      <section
        id="servicos"
        style={{
          backgroundColor: '#0B1218',
          paddingTop: isMobile ? 48 : 76,
          paddingBottom: isMobile ? 52 : 80,
          scrollMarginTop: 68,
        }}
      >
        <div style={containerStyle}>
          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'stretch' : 'flex-end',
              justifyContent: 'space-between',
              gap: 20,
              marginBottom: 28,
            }}
          >
            <div style={{ maxWidth: isMobile ? '100%' : 540 }}>
              <div
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  color: '#76D800',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                Ecossistema Kavro Drive
              </div>
              <h2
                style={{
                  fontSize: isMobile ? '1.65rem' : '2.25rem',
                  fontWeight: 800,
                  lineHeight: 1.15,
                  letterSpacing: '-0.025em',
                  color: '#FFFFFF',
                }}
              >
                Escolha a modalidade ideal para cada momento
              </h2>
            </div>

            {/* Filtro por Categoria em linha única alinhada */}
            <div
              style={{
                display: isMobile ? 'grid' : 'inline-flex',
                gridTemplateColumns: isMobile ? 'repeat(3, minmax(0, 1fr))' : undefined,
                alignItems: 'center',
                gap: 6,
                backgroundColor: '#131E26',
                padding: 5,
                borderRadius: 12,
                border: '1px solid rgba(118, 216, 0, 0.22)',
                flexWrap: 'nowrap',
                flexShrink: 0,
                width: isMobile ? '100%' : 'auto',
              }}
            >
              {[
                { key: 'all', label: 'Todos' },
                { key: 'mobilidade', label: 'Dia a dia' },
                { key: 'especial', label: 'Agenda & Envios' },
              ].map((tab) => {
                const active = serviceFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setServiceFilter(tab.key as 'all' | 'mobilidade' | 'especial')}
                    style={{
                      height: 36,
                      padding: isMobile ? '0 8px' : '0 16px',
                      borderRadius: 9,
                      border: 'none',
                      backgroundColor: active ? '#76D800' : 'transparent',
                      color: active ? '#0B1218' : '#CBD5E1',
                      fontSize: isMobile ? '0.76rem' : '0.84rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      textAlign: 'center',
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))',
              gap: isMobile ? 12 : 18,
            }}
          >
            {filteredServices.map((item) => (
              <div
                key={item.id}
                onClick={() => setActiveServiceModal(item)}
                style={{
                  backgroundColor: '#131E26',
                  border: '1px solid rgba(118, 216, 0, 0.16)',
                  borderRadius: 16,
                  padding: isMobile ? '14px' : '22px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: isMobile ? 10 : 14,
                  cursor: 'pointer',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      marginBottom: isMobile ? 10 : 14,
                    }}
                  >
                    <div
                      style={{
                        width: isMobile ? 40 : 46,
                        height: isMobile ? 40 : 46,
                        borderRadius: 12,
                        backgroundColor: 'rgba(118, 216, 0, 0.12)',
                        border: '1px solid rgba(118, 216, 0, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {item.icon}
                    </div>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: '#8CE826',
                        backgroundColor: '#0B1218',
                        border: '1px solid rgba(118, 216, 0, 0.22)',
                        padding: '3px 8px',
                        borderRadius: 999,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.badge}
                    </span>
                  </div>

                  <h3
                    style={{
                      fontSize: isMobile ? '0.96rem' : '1.12rem',
                      fontWeight: 700,
                      color: '#FFFFFF',
                      marginBottom: 6,
                    }}
                  >
                    {isMobile ? item.shortLabel : item.title}
                  </h3>

                  {!isMobile && (
                    <p style={{ fontSize: '0.86rem', lineHeight: 1.5, color: '#CBD5E1' }}>
                      {item.desc}
                    </p>
                  )}
                </div>

                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: isMobile ? '0.78rem' : '0.84rem',
                    fontWeight: 700,
                    color: '#76D800',
                  }}
                >
                  <span>{isMobile ? 'Ver detalhes' : item.actionLabel}</span>
                  <ArrowRight size={14} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SEÇÃO 4 (FUNDO BRANCO): PASSO A PASSO INTERATIVO KAVRO (TIMELINE 01-05) ═══ */}
      <section
        id="como-funciona"
        style={{
          backgroundColor: '#FFFFFF',
          color: '#0B1218',
          paddingTop: isMobile ? 48 : 76,
          paddingBottom: isMobile ? 54 : 84,
          scrollMarginTop: 68,
        }}
      >
        <div style={containerStyle}>
          <div style={{ maxWidth: 660, marginBottom: isMobile ? 22 : 34 }}>
            <div
              style={{
                fontSize: '0.78rem',
                fontWeight: 800,
                color: '#16A34A',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              Simples do pedido à chegada
            </div>
            <h2
              style={{
                fontSize: isMobile ? '1.65rem' : '2.25rem',
                fontWeight: 800,
                lineHeight: 1.16,
                letterSpacing: '-0.025em',
                color: '#0B1218',
              }}
            >
              Como viajar com a Kavro Drive em 5 etapas
            </h2>
          </div>

          {isMobile ? (
            /* Mobile: Chips numerados 01..05 + Card Ativo + Botões */
            <div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                  gap: 6,
                  marginBottom: 16,
                }}
              >
                {howItWorksSteps.map((step, idx) => {
                  const active = idx === stepIndex;
                  return (
                    <button
                      key={step.num}
                      type="button"
                      onClick={() => setStepIndex(idx)}
                      style={{
                        height: 38,
                        borderRadius: 10,
                        border: active ? 'none' : '1px solid #DCE5DF',
                        backgroundColor: active ? '#121A21' : '#F2F6F3',
                        color: active ? '#76D800' : '#334155',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {step.num}
                    </button>
                  );
                })}
              </div>

              <div
                style={{
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 18,
                  overflow: 'hidden',
                }}
              >
                <LandingPhoto
                  src={activeStep.image}
                  alt={activeStep.title}
                  height={200}
                  borderRadius={0}
                  fallback={activeStep.fallbackGradient}
                />
                <div style={{ padding: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        backgroundColor: '#76D800',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {activeStep.icon}
                    </span>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0B1218' }}>
                      {activeStep.title}
                    </h3>
                  </div>
                  <p style={{ fontSize: '0.9rem', lineHeight: 1.5, color: '#475569', marginBottom: 16 }}>
                    {activeStep.desc}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() =>
                        setStepIndex((p) => (p <= 0 ? howItWorksSteps.length - 1 : p - 1))
                      }
                      style={{ ...lightCarouselBtnStyle }}
                      aria-label="Etapa anterior"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => openClientFlow()}
                      style={{
                        height: 38,
                        padding: '0 16px',
                        borderRadius: 10,
                        border: 'none',
                        backgroundColor: '#121A21',
                        color: '#76D800',
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Testar agora
                    </button>
                    <button
                      type="button"
                      onClick={() => setStepIndex((p) => (p + 1) % howItWorksSteps.length)}
                      style={{ ...lightCarouselBtnStyle }}
                      aria-label="Próxima etapa"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Desktop: Lista Stepper à Esquerda + Preview Rico à Direita */
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.05fr)',
                gap: 36,
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {howItWorksSteps.map((step, idx) => {
                  const active = idx === stepIndex;
                  return (
                    <button
                      key={step.num}
                      type="button"
                      onClick={() => setStepIndex(idx)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '15px 18px',
                        borderRadius: 14,
                        border: active ? '1.5px solid #121A21' : '1px solid #E2E8F0',
                        backgroundColor: active ? '#121A21' : '#F8FAFC',
                        color: active ? '#FFFFFF' : '#0B1218',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 14,
                      }}
                    >
                      <span
                        style={{
                          minWidth: 34,
                          height: 34,
                          borderRadius: 10,
                          backgroundColor: active ? '#76D800' : '#E2E8F0',
                          color: '#0B1218',
                          fontSize: '0.84rem',
                          fontWeight: 800,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {step.num}
                      </span>
                      <div>
                        <div style={{ fontSize: '0.98rem', fontWeight: 700, marginBottom: 4 }}>
                          {step.title}
                        </div>
                        <div
                          style={{
                            fontSize: '0.84rem',
                            lineHeight: 1.45,
                            color: active ? '#CBD5E1' : '#475569',
                          }}
                        >
                          {step.desc}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Painel Fotográfico da Etapa Selecionada */}
              <div
                style={{
                  backgroundColor: '#F2F6F3',
                  border: '1px solid #DCE5DF',
                  borderRadius: 22,
                  padding: 18,
                }}
              >
                <div style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 18 }}>
                  <LandingPhoto
                    src={activeStep.image}
                    alt={activeStep.title}
                    height={320}
                    borderRadius={0}
                    fallback={activeStep.fallbackGradient}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        backgroundColor: '#76D800',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {activeStep.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#16A34A' }}>
                        ETAPA {activeStep.num} DE 05
                      </div>
                      <div style={{ fontSize: '1.04rem', fontWeight: 700, color: '#0B1218' }}>
                        {activeStep.title}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openClientFlow()}
                    style={{
                      height: 42,
                      padding: '0 18px',
                      borderRadius: 10,
                      border: 'none',
                      backgroundColor: '#121A21',
                      color: '#76D800',
                      fontSize: '0.86rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Começar viagem
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══ SEÇÃO 5 (ASFALTO #121A21): EMPRESAS & OCASIÕES ESPECIAIS UNIFICADAS ═══ */}
      <section
        id="empresas"
        style={{
          backgroundColor: '#121A21',
          color: '#FFFFFF',
          paddingTop: isMobile ? 50 : 80,
          paddingBottom: isMobile ? 54 : 84,
          scrollMarginTop: 68,
        }}
      >
        <div style={containerStyle}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 0.95fr) minmax(0, 1.05fr)',
              gap: isMobile ? 28 : 48,
              alignItems: 'center',
              marginBottom: isMobile ? 34 : 52,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  color: '#76D800',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                Kavro para Empresas
              </div>
              <h2
                style={{
                  fontSize: isMobile ? '1.7rem' : '2.25rem',
                  fontWeight: 800,
                  lineHeight: 1.15,
                  letterSpacing: '-0.025em',
                  color: '#FFFFFF',
                  marginBottom: 14,
                }}
              >
                Mobilidade corporativa e entregas em uma única conta
              </h2>
              <p
                style={{
                  fontSize: '0.95rem',
                  lineHeight: 1.6,
                  color: '#CBD5E1',
                  marginBottom: 22,
                }}
              >
                Simplifique o transporte de colaboradores, recepção de clientes e remessas urgentes
                com histórico centralizado e recibos digitais prontos para conferência.
              </p>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                  marginBottom: 24,
                }}
              >
                {[
                  { icon: <Briefcase size={15} color="#76D800" />, text: 'Viagens de equipe' },
                  { icon: <BarChart3 size={15} color="#76D800" />, text: 'Relatórios claros' },
                  { icon: <ClipboardCheck size={15} color="#76D800" />, text: 'Recibos digitais' },
                ].map((chip) => (
                  <div
                    key={chip.text}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      backgroundColor: '#0B1218',
                      border: '1px solid rgba(118, 216, 0, 0.25)',
                      padding: '8px 12px',
                      borderRadius: 10,
                      fontSize: '0.82rem',
                      fontWeight: 600,
                    }}
                  >
                    {chip.icon}
                    <span>{chip.text}</span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setBusinessModalOpen(true)}
                style={{
                  height: 46,
                  padding: '0 22px',
                  borderRadius: 11,
                  border: 'none',
                  backgroundColor: '#76D800',
                  color: '#0B1218',
                  fontSize: '0.94rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Conhecer solução empresarial
              </button>
            </div>

            {/* Bento de 2 Cards Horizontais (substitui bloco separado de "Mais formas") */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                {
                  title: 'Reservas programadas & Aeroporto',
                  desc: 'Garanta motorista na porta no horário exato de reuniões, feiras e voos.',
                  cta: 'Agendar horário',
                  image: '/landing/corporate-ride.jpg',
                  onClick: () => openClientFlow('schedule'),
                },
                {
                  title: 'Entregas expressas no mesmo dia',
                  desc: 'Envie documentos, contratos e encomendas com acompanhamento ao vivo.',
                  cta: 'Solicitar envio',
                  image: '/landing/package-delivery.jpg',
                  onClick: () => openClientFlow(),
                },
              ].map((card) => (
                <div
                  key={card.title}
                  onClick={card.onClick}
                  style={{
                    backgroundColor: '#0B1218',
                    border: '1px solid rgba(118, 216, 0, 0.18)',
                    borderRadius: 16,
                    padding: 14,
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    alignItems: isMobile ? 'stretch' : 'center',
                    gap: 16,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ width: isMobile ? '100%' : 170, flexShrink: 0 }}>
                    <LandingPhoto
                      src={card.image}
                      alt={card.title}
                      height={isMobile ? 150 : 118}
                      borderRadius={12}
                      fallback="linear-gradient(135deg, #172721, #0B1218)"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#FFFFFF', marginBottom: 6 }}>
                      {card.title}
                    </h3>
                    <p style={{ fontSize: '0.86rem', lineHeight: 1.48, color: '#CBD5E1', marginBottom: 10 }}>
                      {card.desc}
                    </p>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        color: '#8CE826',
                      }}
                    >
                      <span>{card.cta}</span>
                      <ArrowRight size={14} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SEÇÃO 6 (VERDE SUAVE #F2F6F3): ACESSO DUAL NO CELULAR (PASSAGEIRO & MOTORISTA) ═══ */}
      <section
        id="apps-qr"
        style={{
          backgroundColor: '#F2F6F3',
          color: '#0B1218',
          paddingTop: isMobile ? 46 : 68,
          paddingBottom: isMobile ? 54 : 76,
          scrollMarginTop: 68,
        }}
      >
        <div style={containerStyle}>
          <div style={{ textAlign: isMobile ? 'left' : 'center', maxWidth: 640, margin: isMobile ? '0 0 24px' : '0 auto 32px' }}>
            <h2
              style={{
                fontSize: isMobile ? '1.65rem' : '2.1rem',
                fontWeight: 800,
                lineHeight: 1.18,
                letterSpacing: '-0.025em',
                color: '#0B1218',
                marginBottom: 8,
              }}
            >
              Acesse pelo celular em segundos
            </h2>
            <p style={{ fontSize: '0.94rem', color: '#475569' }}>
              Aponte a câmera para o QR Code ou toque abaixo para entrar direto no app web Kavro Drive.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
              gap: 18,
            }}
          >
            {/* Card Passageiro (contraste escuro Kavro) */}
            <button
              type="button"
              onClick={() => openClientFlow('login')}
              style={{
                backgroundColor: '#121A21',
                color: '#FFFFFF',
                border: '1px solid rgba(118, 216, 0, 0.35)',
                borderRadius: 18,
                padding: isMobile ? '18px' : '22px',
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                cursor: 'pointer',
                width: '100%',
                boxShadow: '0 14px 32px rgba(11, 18, 24, 0.12)',
              }}
            >
              {isMobile ? (
                <div style={mobileAppBadgeStyle}>
                  <img
                    src="/logo-icon.png"
                    alt="App Kavro Drive"
                    style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 10 }}
                  />
                </div>
              ) : (
                <QrCanvasBox url={`${baseUrl}/cliente`} darkMode />
              )}
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#76D800', marginBottom: 4 }}>
                  PARA PASSAGEIROS
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#FFFFFF', marginBottom: 4 }}>
                  App Kavro Passageiro
                </div>
                <div style={{ fontSize: '0.85rem', color: '#CBD5E1' }}>
                  {isMobile ? 'Toque para abrir e pedir sua corrida' : 'Escaneie para simular e viajar'}
                </div>
              </div>
              <ArrowRight size={22} color="#76D800" />
            </button>

            {/* Card Motorista (contraste branco limpo com acento verde) */}
            <button
              type="button"
              onClick={() => navigate('/kavro-drive')}
              style={{
                backgroundColor: '#FFFFFF',
                color: '#0B1218',
                border: '1px solid #DCE5DF',
                borderRadius: 18,
                padding: isMobile ? '18px' : '22px',
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                cursor: 'pointer',
                width: '100%',
                boxShadow: '0 8px 24px rgba(11, 18, 24, 0.05)',
              }}
            >
              {isMobile ? (
                <div style={{ ...mobileAppBadgeStyle, backgroundColor: '#121A21' }}>
                  <img
                    src="/logo-icon.png"
                    alt="App Parceiro Kavro Drive"
                    style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 10 }}
                  />
                </div>
              ) : (
                <QrCanvasBox url={`${baseUrl}/kavro-drive`} />
              )}
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#16A34A', marginBottom: 4 }}>
                  PARA MOTORISTAS
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0B1218', marginBottom: 4 }}>
                  App Parceiro Kavro
                </div>
                <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                  {isMobile ? 'Toque para acessar o Portal do Motorista' : 'Escaneie para ficar online e dirigir'}
                </div>
              </div>
              <ArrowRight size={22} color="#16A34A" />
            </button>
          </div>
        </div>
      </section>

      {/* ═══ SEÇÃO 7: RODAPÉ KAVRO DRIVE ═══ */}
      <footer
        style={{
          backgroundColor: '#0B1218',
          borderTop: '1px solid rgba(118, 216, 0, 0.18)',
          color: '#FFFFFF',
          paddingTop: isMobile ? 44 : 64,
          paddingBottom: isMobile ? 104 : 52,
        }}
      >
        <div style={containerStyle}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.3fr) repeat(3, minmax(0, 1fr))',
              gap: isMobile ? 28 : 36,
              marginBottom: 42,
            }}
          >
            <div>
              <img
                src="/logo-horizontal-white.png"
                alt="Kavro Drive"
                style={{
                  height: 34,
                  width: 'auto',
                  display: 'block',
                  marginBottom: 14,
                  objectFit: 'contain',
                }}
              />
              <p style={{ fontSize: '0.86rem', lineHeight: 1.55, color: '#94A3B8', marginBottom: 14, maxWidth: 290 }}>
                {config.companyName || 'Kavro Drive Mobilidade'} — Mobilidade urbana, viagens agendadas e entregas locais com transparência.
              </p>
              <button
                type="button"
                onClick={() => navigate('/ajuda')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8CE826',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Falar com a Central de Ajuda →
              </button>
            </div>

            <div>
              <h4 style={footerColTitleStyle}>Passageiros</h4>
              <div style={footerColListStyle}>
                <button type="button" onClick={() => openClientFlow()} style={footerLinkStyle}>
                  Calcular corrida
                </button>
                <button type="button" onClick={() => openClientFlow('schedule')} style={footerLinkStyle}>
                  Agendar horário
                </button>
                <button type="button" onClick={() => scrollToSection('servicos')} style={footerLinkStyle}>
                  Categorias disponíveis
                </button>
                <button type="button" onClick={() => scrollToSection('como-funciona')} style={footerLinkStyle}>
                  Passo a passo
                </button>
              </div>
            </div>

            <div>
              <h4 style={footerColTitleStyle}>Parceiros &amp; Empresas</h4>
              <div style={footerColListStyle}>
                <button type="button" onClick={() => navigate('/kavro-drive')} style={footerLinkStyle}>
                  Portal do Motorista
                </button>
                <button type="button" onClick={() => scrollToSection('motoristas')} style={footerLinkStyle}>
                  Vantagens para dirigir
                </button>
                <button type="button" onClick={() => setBusinessModalOpen(true)} style={footerLinkStyle}>
                  Kavro para Empresas
                </button>
              </div>
            </div>

            <div>
              <h4 style={footerColTitleStyle}>Transparência</h4>
              <div style={footerColListStyle}>
                <button type="button" onClick={() => navigate('/frotas')} style={footerLinkStyle}>
                  Frota verificada
                </button>
                <button type="button" onClick={() => navigate('/cidades-atendidas')} style={footerLinkStyle}>
                  Cidades atendidas
                </button>
                <button type="button" onClick={() => navigate('/ajuda')} style={footerLinkStyle}>
                  Suporte ao usuário
                </button>
              </div>
            </div>
          </div>

          <div
            style={{
              borderTop: '1px solid rgba(255,255,255,0.1)',
              paddingTop: 22,
              fontSize: '0.82rem',
              color: '#94A3B8',
            }}
          >
            © {new Date().getFullYear()} Kavro Drive. Todos os direitos reservados.
          </div>
        </div>
      </footer>

      {/* ═══ BARRA INFERIOR FIXA MOBILE DUAL ("Simular viagem" + "Dirigir") ═══ */}
      {isMobile && showStickyMobileCta && !mobileDrawerOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: 'rgba(11, 18, 24, 0.96)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            padding: '10px 14px',
            borderTop: '1px solid rgba(118, 216, 0, 0.24)',
            boxShadow: '0 -10px 26px rgba(0,0,0,0.35)',
            zIndex: 115,
            display: 'grid',
            gridTemplateColumns: '1.35fr 0.85fr',
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={() => openClientFlow()}
            style={{
              height: 46,
              borderRadius: 11,
              border: 'none',
              backgroundColor: '#76D800',
              color: '#0B1218',
              fontSize: '0.92rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Simular viagem
          </button>
          <button
            type="button"
            onClick={() => navigate('/kavro-drive')}
            style={{
              height: 46,
              borderRadius: 11,
              border: '1px solid rgba(118, 216, 0, 0.35)',
              backgroundColor: '#131E26',
              color: '#FFFFFF',
              fontSize: '0.88rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Dirigir
          </button>
        </div>
      )}

      {/* ═══ MODAL DE CIDADE ═══ */}
      {cityModalOpen && (
        <div style={modalBackdropStyle} onClick={() => setCityModalOpen(false)}>
          <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0B1218' }}>
                Alterar cidade de embarque
              </h3>
              <button type="button" onClick={() => setCityModalOpen(false)} style={modalCloseBtnStyle}>
                <X size={20} />
              </button>
            </div>
            <p style={{ fontSize: '0.84rem', color: '#475569', margin: '0 0 12px 0', lineHeight: 1.4 }}>
              Escolha uma cidade abaixo ou busque por <strong>CEP (ViaCEP)</strong> ou nome do município (IBGE):
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
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
                    border: selectedCity === city ? '1px solid #76D800' : '1px solid #E2E8F0',
                    backgroundColor: selectedCity === city ? '#121A21' : '#F3F6F4',
                    color: selectedCity === city ? '#76D800' : '#121A21',
                    fontSize: '0.84rem',
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
                placeholder="Digite seu CEP (ex: 88880-000) ou cidade..."
                value={customCityInput}
                onChange={(e) => {
                  const val = e.target.value;
                  const digitsOnly = val.replace(/\D/g, '');
                  if (/^[\d-]+$/.test(val) && digitsOnly.length <= 8) {
                    const formatted = digitsOnly.length > 5
                      ? `${digitsOnly.slice(0, 5)}-${digitsOnly.slice(5)}`
                      : digitsOnly;
                    setCustomCityInput(formatted);
                  } else {
                    setCustomCityInput(val);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleApplyCityOrCep();
                  }
                }}
              style={{
                  flex: 1,
                  minWidth: 0,
                  height: 44,
                  borderRadius: 8,
                  border: '1px solid #D1D5DB',
                  padding: '0 12px',
                  fontSize: '0.92rem',
                  color: '#0B1218',
                }}
              />
              <button
                type="button"
                disabled={isSearchingCity}
                onClick={() => void handleApplyCityOrCep()}
                style={{
                  height: 44,
                  padding: '0 18px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: '#121A21',
                  color: '#76D800',
                  fontWeight: 700,
                  cursor: isSearchingCity ? 'wait' : 'pointer',
                }}
              >
                {isSearchingCity ? 'Buscando...' : 'Aplicar'}
              </button>
            </div>

            {cepFeedback && (
              <div style={{
                marginTop: 8,
                padding: '7px 10px',
                borderRadius: 8,
                fontSize: '0.78rem',
                fontWeight: 600,
                backgroundColor: cepFeedback.startsWith('ViaCEP localizado') ? '#F0FDF4' : '#FEF2F2',
                border: cepFeedback.startsWith('ViaCEP localizado') ? '1px solid #BBF7D0' : '1px solid #FECACA',
                color: cepFeedback.startsWith('ViaCEP localizado') ? '#166534' : '#B91C1C'
              }}>
                {cepFeedback}
              </div>
            )}

            {citySuggestions.length > 0 && (
              <div style={{
                marginTop: 10,
                maxHeight: 210,
                overflowY: 'auto',
                border: '1px solid #E2E8F0',
                borderRadius: 10,
                backgroundColor: '#F8FAFC',
                display: 'flex',
                flexDirection: 'column',
              }}>
                {citySuggestions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectCitySuggestion(item)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      width: '100%',
                      padding: '10px 12px',
                      border: 'none',
                      borderBottom: '1px solid #E2E8F0',
                      backgroundColor: 'transparent',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0B1218' }}>
                        {item.cityLabel}
                      </div>
                      <div style={{
                        fontSize: '0.74rem',
                        color: '#475569',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {item.subtitle}
                      </div>
                    </div>
                    <span style={{
                      fontSize: '0.66rem',
                      fontWeight: 800,
                      padding: '3px 8px',
                      borderRadius: 999,
                      flexShrink: 0,
                      backgroundColor: item.source === 'viacep' ? '#DCFCE7' : '#E2E8F0',
                      color: item.source === 'viacep' ? '#15803D' : '#334155',
                      textTransform: 'uppercase'
                    }}>
                      {item.source === 'viacep' ? 'ViaCEP' : item.source === 'ibge' ? 'IBGE' : 'Regional'}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              disabled={locatingCityGps}
              onClick={handleDetectCityViaGps}
              style={{
                marginTop: 12,
                width: '100%',
                height: 40,
                borderRadius: 8,
                border: '1px dashed #CBD5E1',
                backgroundColor: '#F8FAFC',
                color: '#0B1218',
                fontSize: '0.82rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                cursor: locatingCityGps ? 'wait' : 'pointer',
              }}
            >
              <Navigation size={14} color="#15803D" />
              <span>{locatingCityGps ? 'Detectando sua cidade pelo GPS...' : 'Usar minha localização atual (GPS)'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCityModalOpen(false);
                navigate('/cidades-atendidas');
              }}
              style={{
                marginTop: 10,
                width: '100%',
                background: 'none',
                border: 'none',
                color: '#15803D',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                padding: '4px 6px',
              }}
            >
              Ver página de cidades atendidas (100% SC e regiões) →
            </button>
          </div>
        </div>
      )}

      {/* ═══ MODAL DE DETALHES DO SERVIÇO ═══ */}
      {activeServiceModal && (
        <div style={modalBackdropStyle} onClick={() => setActiveServiceModal(null)}>
          <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h3 style={{ fontSize: '1.22rem', fontWeight: 700, color: '#0B1218' }}>
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
                backgroundColor: '#121A21',
                color: '#76D800',
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
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0B1218' }}>
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
                  <CheckCircle2 size={18} color="#16A34A" style={{ flexShrink: 0, marginTop: 2 }} />
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
                backgroundColor: '#121A21',
                color: '#76D800',
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

      </div>
  );
};

/* ── SUBCOMPONENTE DE FOTO ── */

const LandingPhoto: React.FC<{
  src: string;
  alt: string;
  height: number;
  borderRadius?: number;
  fallback: string;
}> = ({ src, alt, height, borderRadius = 12, fallback }) => {
  const [failed, setFailed] = useState(false);

  return (
    <div
      style={{
        width: '100%',
        height,
        borderRadius,
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

/* ── ESTILOS REUTILIZÁVEIS ── */

const navBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#E2E8F0',
  fontSize: '0.88rem',
  fontWeight: 600,
  padding: '8px 11px',
  borderRadius: 9,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const darkDropdownItemStyle: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  background: 'none',
  border: 'none',
  padding: '10px 12px',
  borderRadius: 8,
  fontSize: '0.88rem',
  fontWeight: 600,
  color: '#FFFFFF',
  cursor: 'pointer',
};

const drawerRowBtnStyle: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  padding: '14px 14px',
  backgroundColor: '#131E26',
  color: '#FFFFFF',
  border: '1px solid rgba(118, 216, 0, 0.16)',
  borderRadius: 12,
  fontSize: '0.96rem',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const heroInputStyle: React.CSSProperties = {
  width: '100%',
  border: 'none',
  outline: 'none',
  backgroundColor: 'transparent',
  color: '#0B1218',
  fontSize: '0.94rem',
  fontWeight: 500,
};

const lightCarouselBtnStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 10,
  border: '1px solid #CBD5E1',
  backgroundColor: '#FFFFFF',
  color: '#0B1218',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

const mobileAppBadgeStyle: React.CSSProperties = {
  width: 68,
  height: 68,
  borderRadius: 16,
  backgroundColor: '#FFFFFF',
  border: '1px solid #DCE5DF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const footerColTitleStyle: React.CSSProperties = {
  fontSize: '0.96rem',
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
  color: '#CBD5E1',
  fontSize: '0.88rem',
  cursor: 'pointer',
  padding: 0,
};

const modalBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(11, 18, 24, 0.72)',
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
  color: '#0B1218',
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
  color: '#0B1218',
};
