import React, { useEffect, useState } from 'react';
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
  UserCheck,
  Briefcase,
  BarChart3,
  ClipboardCheck,
  Calendar,
  Package,
  Plane,
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
  shortDesc: string;
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

  const mobileHeroBanners = [
    {
      src: '/landing/banner-0001.png',
      alt: 'Kavro Drive — Taxas baixas. Mais vantagens para todos.',
    },
    {
      src: '/landing/banner-urbana.png',
      alt: 'Kavro Drive — Uma plataforma completa de mobilidade urbana.',
    },
    {
      src: '/landing/banner-motors.png',
      alt: 'Kavro Drive — Conectando motoristas e passageiros.',
    },
  ];

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
      id: 'padrao',
      category: 'mobilidade',
      badge: 'Uso diário',
      title: 'Kavro Padrão',
      shortLabel: 'Kavro Padrão',
      desc: 'Corridas particulares ponto a ponto com valor exibido antes da confirmação e acompanhamento ao vivo no mapa.',
      shortDesc: 'Corridas urbanas com tarifa informada antes de sair.',
      modalDetails:
        'Confira placa, modelo do veículo e nome do motorista antes do embarque, utilize código de segurança e pague via PIX, cartão à vista ou dinheiro.',
      actionLabel: 'Simular corrida',
      targetRoute: '/cliente',
      icon: <Car size={20} strokeWidth={1.9} color="#E2E8F0" />,
    },
    {
      id: 'traslado',
      category: 'mobilidade',
      badge: 'Trajetos longos',
      title: 'Viagens Regionais & Aeroporto',
      shortLabel: 'Traslados & Região',
      desc: 'Deslocamentos intermunicipais, terminais rodoviários e aeroportos com tarifa calculada antecipadamente.',
      shortDesc: 'Trajetos intermunicipais, rodoviárias e aeroportos.',
      modalDetails:
        'Solicite sua saída imediata ou programe com antecedência trajetos entre cidades vizinhas com previsibilidade de horário.',
      actionLabel: 'Calcular trajeto',
      targetRoute: '/cliente?flow=schedule',
      icon: <Plane size={20} strokeWidth={1.9} color="#E2E8F0" />,
    },
    {
      id: 'envios',
      category: 'especial',
      badge: 'Mesmo dia',
      title: 'Kavro Entregas',
      shortLabel: 'Kavro Entregas',
      desc: 'Transporte urbano de documentos, encomendas e pacotes fechados com coleta na origem e registro na entrega.',
      shortDesc: 'Envio local de pacotes e documentos no mesmo dia.',
      modalDetails:
        'Acompanhe o percurso do portador em tempo real do endereço de retirada até o destinatário na mesma cidade ou região.',
      actionLabel: 'Solicitar entrega',
      targetRoute: '/cliente',
      icon: <Package size={20} strokeWidth={1.9} color="#E2E8F0" />,
    },
    {
      id: 'reserve',
      category: 'especial',
      badge: 'Hora marcada',
      title: 'Agenda Programada',
      shortLabel: 'Agenda Programada',
      desc: 'Reserve seu horário com antecedência para embarques no início do dia, consultas clínicas e compromissos.',
      shortDesc: 'Reserve dia e hora pelo app com antecedência.',
      modalDetails:
        'Defina endereço, data e horário pelo aplicativo e acompanhe a designação do motorista parceiro na sua conta.',
      actionLabel: 'Agendar horário',
      targetRoute: '/cliente?flow=schedule',
      icon: <Calendar size={20} strokeWidth={1.9} color="#E2E8F0" />,
    },
  ];

  const filteredServices =
    serviceFilter === 'all' ? services : services.filter((item) => item.category === serviceFilter);

  const howItWorksSteps: HowItWorksStep[] = [
    {
      num: '01',
      title: 'Informe partida e destino',
      desc: 'Digite os endereços na Kavro Drive ou utilize a localização por GPS para obter a estimativa na hora.',
      image: '/landing/step-app-phone.jpg',
      fallbackGradient: 'linear-gradient(135deg, #172721 0%, #0A0F14 100%)',
      icon: <MapPin size={20} strokeWidth={2.2} color="#0A0F14" />,
    },
    {
      num: '02',
      title: 'Selecione a categoria e o pagamento',
      desc: 'Escolha entre Kavro Padrão ou Kavro Entregas e pague via PIX Efí, cartão à vista, saldo em conta ou dinheiro.',
      image: '/landing/passenger-ride.jpg',
      fallbackGradient: 'linear-gradient(135deg, #16232D 0%, #0A0F14 100%)',
      icon: <Wallet size={20} strokeWidth={2.1} color="#0A0F14" />,
    },
    {
      num: '03',
      title: 'Motorista cadastrado aceita o chamado',
      desc: 'Motoristas com CNH, documento do veículo e biometria conferidos aceitam sua solicitação com rota visível no mapa.',
      image: '/landing/driver-smile.jpg',
      fallbackGradient: 'linear-gradient(135deg, #172721 0%, #0A0F14 100%)',
      icon: <UserCheck size={20} strokeWidth={2.1} color="#0A0F14" />,
    },
    {
      num: '04',
      title: 'Embarque com conferência de placa e código',
      desc: 'Confirme modelo, placa do automóvel e código de embarque antes de iniciar o deslocamento.',
      image: '/landing/hero-traveler.jpg',
      fallbackGradient: 'linear-gradient(135deg, #16232D 0%, #0A0F14 100%)',
      icon: <ShieldCheck size={20} strokeWidth={2.1} color="#0A0F14" />,
    },
    {
      num: '05',
      title: 'Conclusão e histórico detalhado',
      desc: 'Finalize o trajeto pelo valor acordado e consulte recibos e corridas anteriores direto no painel da conta.',
      image: '/landing/corporate-ride.jpg',
      fallbackGradient: 'linear-gradient(135deg, #172721 0%, #0A0F14 100%)',
      icon: <CheckCircle2 size={20} strokeWidth={2.1} color="#0A0F14" />,
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
        backgroundColor: '#0A0F14',
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
          backgroundColor: 'rgba(10, 15, 20, 0.96)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
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
          {/* Esquerda: Marca + Seletor de Cidade */}
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 18, minWidth: 0, flex: isMobile ? 1 : undefined }}>
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
                  height: isMobile ? 25 : 32,
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
                borderRadius: 8,
                border: '1px solid rgba(255, 255, 255, 0.14)',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                color: '#E2E8F0',
                fontSize: isMobile ? '0.73rem' : '0.8rem',
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                minWidth: 0,
                maxWidth: isMobile ? 160 : 'none',
              }}
            >
              <MapPin size={13} color="#94A3B8" style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedCity.replace(', BR', '')}
              </span>
              <ChevronDown size={13} color="#94A3B8" style={{ flexShrink: 0 }} />
            </button>
          </div>

          {/* Centro (Desktop): Links institucionais */}
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
                      backgroundColor: '#121922',
                      border: '1px solid rgba(255, 255, 255, 0.14)',
                      color: '#FFFFFF',
                      borderRadius: 10,
                      boxShadow: '0 18px 40px rgba(0,0,0,0.45)',
                      padding: 6,
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
                        navigate('/instalar');
                      }}
                      style={darkDropdownItemStyle}
                    >
                      Instalar Web App (PWA)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAboutMenuOpen(false);
                        navigate('/cidades-atendidas');
                      }}
                      style={darkDropdownItemStyle}
                    >
                      Cidades Atendidas
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
                    color: '#E2E8F0',
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
                    borderRadius: 8,
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    backgroundColor: 'transparent',
                    color: '#FFFFFF',
                    fontSize: '0.85rem',
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
                    borderRadius: 8,
                    border: 'none',
                    backgroundColor: '#FFFFFF',
                    color: '#0A0F14',
                    fontSize: '0.85rem',
                    fontWeight: 700,
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
                  width: 38,
                  height: 36,
                  borderRadius: 8,
                  border: '1px solid rgba(255, 255, 255, 0.16)',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: '#FFFFFF',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                {mobileDrawerOpen ? <X size={18} /> : <Menu size={19} />}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Drawer Lateral Mobile */}
      {isMobile && (
        <div
          aria-hidden={!mobileDrawerOpen}
          onClick={() => setMobileDrawerOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(6, 10, 14, 0.76)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
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
              backgroundColor: '#0E141B',
              borderLeft: '1px solid rgba(255, 255, 255, 0.12)',
              borderTopLeftRadius: 16,
              borderBottomLeftRadius: 16,
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
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.14)',
                  backgroundColor: '#131B23',
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
                  height: 46,
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: '#FFFFFF',
                  color: '#0A0F14',
                  fontSize: '0.92rem',
                  fontWeight: 700,
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
                  height: 46,
                  borderRadius: 8,
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  backgroundColor: 'transparent',
                  color: '#FFFFFF',
                  fontSize: '0.92rem',
                  fontWeight: 600,
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
                  <Car size={18} color="#94A3B8" />
                  <span>Portal do Motorista</span>
                </span>
                <ChevronRight size={17} color="#94A3B8" />
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
                  <Calendar size={18} color="#94A3B8" />
                  <span>Agendar horário</span>
                </span>
                <ChevronRight size={17} color="#94A3B8" />
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Espaçamento para a navbar fixa */}
      <div style={{ height: 68 }} />

      {/* Banners promocionais exclusivos da versão mobile em loop contínuo */}
      {isMobile && (
        <div
          style={{
            backgroundColor: '#0A0F14',
            padding: '12px 0 0 0',
          }}
        >
          <div className="kavro-marquee">
            <div
              className="kavro-marquee-track"
              style={{ animationDuration: '24s' }}
            >
              {[0, 1].map((dupIdx) =>
                mobileHeroBanners.map((banner) => (
                  <div
                    key={`${dupIdx}-${banner.src}`}
                    style={{
                      flex: '0 0 auto',
                      width: 'min(86vw, 360px)',
                      marginRight: 10,
                      borderRadius: 10,
                      overflow: 'hidden',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      backgroundColor: '#0A0F14',
                    }}
                  >
                    <img
                      src={banner.src}
                      alt={banner.alt}
                      style={{
                        width: '100%',
                        height: 'auto',
                        display: 'block',
                        aspectRatio: '2064 / 762',
                      }}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ SEÇÃO 1: HERO INSTITUCIONAL KAVRO ═══ */}
      <section
        style={{
          backgroundColor: '#0A0F14',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          paddingTop: isMobile ? 20 : 52,
          paddingBottom: isMobile ? 36 : 68,
        }}
      >
        <div
          style={{
            ...containerStyle,
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.04fr) minmax(0, 0.96fr)',
            gap: isMobile ? 24 : 52,
            alignItems: 'center',
          }}
        >
          {/* Coluna Principal: Headline + Formulário de Cotação */}
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                color: '#94A3B8',
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 14,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 2,
                  backgroundColor: '#76D800',
                  display: 'inline-block',
                  flexShrink: 0,
                }}
              />
              <span>Operação ativa em {selectedCity.replace(', BR', '')}</span>
            </div>

            <h1
              style={{
                fontSize: isMobile ? '2rem' : '3.05rem',
                fontWeight: 800,
                lineHeight: 1.09,
                letterSpacing: '-0.03em',
                color: '#FFFFFF',
                marginBottom: 14,
              }}
            >
              Transporte urbano e entregas com tarifa clara antes de sair.
            </h1>

            <p
              style={{
                fontSize: isMobile ? '0.94rem' : '1.02rem',
                lineHeight: 1.6,
                color: '#94A3B8',
                marginBottom: 24,
                maxWidth: 510,
              }}
            >
              Calcule o percurso na hora, solicite corridas em Kavro Padrão ou envie encomendas em
              Kavro Entregas com motoristas cadastrados e pagamento via PIX, cartão à vista ou dinheiro.
            </p>

            {/* Painel de Cotação e Chamado */}
            <div
              style={{
                backgroundColor: '#121922',
                border: '1px solid rgba(255, 255, 255, 0.11)',
                borderRadius: 12,
                padding: isMobile ? 14 : 18,
                maxWidth: 500,
              }}
            >
              {/* Campos Partida / Destino */}
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <div
                  style={{
                    position: 'absolute',
                    left: 19,
                    top: 29,
                    bottom: 29,
                    width: 1.5,
                    backgroundColor: '#CBD5E1',
                    zIndex: 2,
                  }}
                />

                <div
                  style={{
                    position: 'relative',
                    backgroundColor: '#FFFFFF',
                    borderRadius: 8,
                    height: 48,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 38,
                    paddingRight: 44,
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: 15,
                      width: 9,
                      height: 9,
                      borderRadius: '50%',
                      border: '2.5px solid #0A0F14',
                      backgroundColor: '#FFFFFF',
                      zIndex: 3,
                    }}
                  />
                  <input
                    type="text"
                    value={pickup}
                    onChange={(e) => setPickup(e.target.value)}
                    placeholder="Endereço de partida"
                    style={heroInputStyle}
                  />
                  <button
                    type="button"
                    title="Usar minha localização"
                    onClick={handleUseCurrentLocation}
                    style={{
                      position: 'absolute',
                      right: 7,
                      width: 34,
                      height: 34,
                      borderRadius: 7,
                      border: 'none',
                      backgroundColor: '#F1F5F9',
                      color: '#0A0F14',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      opacity: locatingGps ? 0.5 : 1,
                    }}
                  >
                    <Navigation size={15} />
                  </button>
                </div>

                <div
                  style={{
                    position: 'relative',
                    backgroundColor: '#FFFFFF',
                    borderRadius: 8,
                    height: 48,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 38,
                    paddingRight: 14,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: 15,
                      width: 9,
                      height: 9,
                      borderRadius: 2,
                      backgroundColor: '#0A0F14',
                      zIndex: 3,
                    }}
                  />
                  <input
                    type="text"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="Para onde você vai?"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') openClientFlow();
                    }}
                    style={heroInputStyle}
                  />
                </div>
              </div>

              {/* Ações do Simulador */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => openClientFlow()}
                  style={{
                    width: '100%',
                    height: 46,
                    padding: '0 20px',
                    borderRadius: 8,
                    border: 'none',
                    backgroundColor: '#76D800',
                    color: '#0A0F14',
                    fontSize: '0.94rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <span>Consultar valor e solicitar</span>
                  <ArrowRight size={17} />
                </button>

                <button
                  type="button"
                  onClick={() => openClientFlow('schedule')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#CBD5E1',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: '2px 0',
                    textAlign: 'left',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Calendar size={14} color="#94A3B8" />
                  <span>Precisa agendar para outra data ou horário? Reservar horário</span>
                </button>
              </div>
            </div>

            {/* Especificações objetivas sem tags decorativas */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                gap: isMobile ? 12 : 16,
                marginTop: 22,
                paddingTop: 18,
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                maxWidth: 500,
              }}
            >
              {[
                { label: 'Preço informado', value: 'Valor fechado no pedido' },
                { label: 'Segurança', value: 'CNH, CRLV e selfie conferidos' },
                { label: 'Pagamento', value: 'PIX Efí, cartão à vista ou dinheiro' },
              ].map((spec) => (
                <div key={spec.label}>
                  <div
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: '#64748B',
                      marginBottom: 3,
                    }}
                  >
                    {spec.label}
                  </div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#E2E8F0', lineHeight: 1.35 }}>
                    {spec.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Coluna Visual Editorial (Desktop & Mobile — sem badges flutuantes sobrepostos) */}
          <div>
            <div
              style={{
                backgroundColor: '#121922',
                border: '1px solid rgba(255, 255, 255, 0.11)',
                borderRadius: 12,
                overflow: 'hidden',
                boxShadow: '0 22px 48px rgba(0, 0, 0, 0.36)',
              }}
            >
              <LandingPhoto
                src="/landing/hero-traveler.jpg"
                alt="Passageiro embarcando em viagem pela Kavro Drive"
                height={isMobile ? 210 : 410}
                borderRadius={0}
                fallback="linear-gradient(135deg, #172721, #0D161D)"
              />
              <div
                style={{
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  padding: isMobile ? '12px 14px' : '15px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#FFFFFF' }}>
                    Agendamento de embarque
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: 2 }}>
                    Garanta saída programada para reuniões, clínicas ou aeroportos.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openClientFlow('schedule')}
                  style={{
                    height: 36,
                    padding: '0 14px',
                    borderRadius: 8,
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    backgroundColor: 'transparent',
                    color: '#FFFFFF',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  Agendar
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PARCEIROS & PATROCINADORES DA HOME ═══ */}
      <PartnersSponsorsSection
        items={config.partnerBanners}
        variant="dark"
        area="site"
        sectionEnabled={config.partnerShowOnSite !== false}
        hideWhenEmpty={Boolean(config.partnerHideEmptyPlaceholder)}
        isMobile={isMobile}
        onBecomePartnerClick={() => {
          const url = `https://wa.me/5548996915303?text=${encodeURIComponent(
            'Olá! Tenho interesse em ser parceiro ou patrocinador da Kavro Drive.'
          )}`;
          const popup = window.open(url, '_blank', 'noopener,noreferrer');
          if (!popup) window.location.href = url;
        }}
      />

      {/* ═══ SEÇÃO 2 (NEUTRO CLARO #F6F7F8): MOTORISTAS PARCEIROS ═══ */}
      <section
        id="motoristas"
        style={{
          backgroundColor: '#F6F7F8',
          color: '#0A0F14',
          borderBottom: '1px solid #E2E8F0',
          paddingTop: isMobile ? 44 : 72,
          paddingBottom: isMobile ? 48 : 76,
          scrollMarginTop: 68,
        }}
      >
        <div style={containerStyle}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.05fr) minmax(0, 0.95fr)',
              gap: isMobile ? 28 : 52,
              alignItems: 'center',
            }}
          >
            {/* Lado Esquerdo: Proposta para Motoristas */}
            <div>
              <div
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#15803D',
                  marginBottom: 10,
                }}
              >
                Para motoristas parceiros
              </div>

              <h2
                style={{
                  fontSize: isMobile ? '1.65rem' : '2.28rem',
                  fontWeight: 800,
                  lineHeight: 1.14,
                  letterSpacing: '-0.025em',
                  color: '#0A0F14',
                  marginBottom: 12,
                }}
              >
                Dirija com autonomia e acompanhe o repasse líquido por corrida
              </h2>

              <p
                style={{
                  fontSize: '0.95rem',
                  lineHeight: 1.6,
                  color: '#475569',
                  marginBottom: 22,
                }}
              >
                Gerencie seu turno diretamente no Portal do Motorista, confira o valor líquido antes de
                aceitar o chamado e acompanhe seu calendário semanal de saques.
              </p>

              {/* 3 Pilares Operacionais */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                  gap: 10,
                  marginBottom: 24,
                }}
              >
                {[
                  { title: 'Valor líquido claro', sub: 'Extrato detalhado já no aceite' },
                  { title: 'Horário flexível', sub: 'Fique online quando preferir' },
                  { title: 'Cadastro digital', sub: 'CNH, CRLV e contrato pelo portal' },
                ].map((perk) => (
                  <div
                    key={perk.title}
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: 8,
                      padding: '13px 14px',
                    }}
                  >
                    <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0A0F14', marginBottom: 4 }}>
                      {perk.title}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#475569', lineHeight: 1.4 }}>
                      {perk.sub}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => navigate('/kavro-drive')}
                  style={{
                    height: 44,
                    padding: '0 22px',
                    borderRadius: 8,
                    border: 'none',
                    backgroundColor: '#0A0F14',
                    color: '#FFFFFF',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cadastrar como motorista
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/kavro-drive')}
                  style={{
                    height: 44,
                    padding: '0 20px',
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#0A0F14',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Acessar portal
                </button>
              </div>
            </div>

            {/* Lado Direito: Foto Parceiro */}
            <div>
              <div
                style={{
                  borderRadius: 12,
                  overflow: 'hidden',
                  border: '1px solid #D1D5DB',
                  boxShadow: '0 14px 36px rgba(10, 15, 20, 0.08)',
                }}
              >
                <LandingPhoto
                  src="/landing/driver-smile.jpg"
                  alt="Motorista parceiro Kavro Drive"
                  height={isMobile ? 225 : 335}
                  borderRadius={0}
                  fallback="linear-gradient(135deg, #1E293B, #0F172A)"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SEÇÃO 3 (MATTE OBSIDIAN #0A0F14): MODALIDADES & SERVIÇOS ═══ */}
      <section
        id="servicos"
        style={{
          backgroundColor: '#0A0F14',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
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
            <div style={{ maxWidth: isMobile ? '100%' : 560 }}>
              <div
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  color: '#94A3B8',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                Modalidades disponíveis
              </div>
              <h2
                style={{
                  fontSize: isMobile ? '1.65rem' : '2.2rem',
                  fontWeight: 800,
                  lineHeight: 1.15,
                  letterSpacing: '-0.025em',
                  color: '#FFFFFF',
                }}
              >
                Soluções para deslocamento urbano e envios locais
              </h2>
            </div>

            {/* Filtro por Categoria */}
            <div
              style={{
                display: isMobile ? 'grid' : 'inline-flex',
                gridTemplateColumns: isMobile
                  ? 'minmax(0, 0.72fr) minmax(0, 1fr) minmax(0, 1.38fr)'
                  : undefined,
                alignItems: 'center',
                gap: 4,
                backgroundColor: '#121922',
                padding: 4,
                borderRadius: 8,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                flexWrap: 'nowrap',
                flexShrink: 0,
                width: isMobile ? '100%' : 'auto',
              }}
            >
              {[
                { key: 'all', label: 'Todos' },
                { key: 'mobilidade', label: 'Passageiros' },
                { key: 'especial', label: 'Agenda & Entregas' },
              ].map((tab) => {
                const active = serviceFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setServiceFilter(tab.key as 'all' | 'mobilidade' | 'especial')}
                    style={{
                      height: 34,
                      padding: isMobile ? '0 6px' : '0 16px',
                      borderRadius: 6,
                      border: 'none',
                      backgroundColor: active ? '#FFFFFF' : 'transparent',
                      color: active ? '#0A0F14' : '#94A3B8',
                      fontSize: isMobile ? '0.73rem' : '0.82rem',
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
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: isMobile ? 10 : 18,
            }}
          >
            {filteredServices.map((item) => (
              <div
                key={item.id}
                onClick={() => setActiveServiceModal(item)}
                style={{
                  backgroundColor: '#121922',
                  border: '1px solid rgba(255, 255, 255, 0.09)',
                  borderRadius: 10,
                  padding: isMobile ? '13px' : '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: isMobile ? 10 : 14,
                  cursor: 'pointer',
                  minWidth: 0,
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: isMobile ? 6 : 10,
                      marginBottom: isMobile ? 10 : 14,
                    }}
                  >
                    <div
                      style={{
                        width: isMobile ? 34 : 40,
                        height: isMobile ? 34 : 40,
                        borderRadius: 8,
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {item.icon}
                    </div>
                    <span
                      style={{
                        fontSize: isMobile ? '0.58rem' : '0.68rem',
                        fontWeight: 700,
                        letterSpacing: isMobile ? '0.04em' : '0.07em',
                        textTransform: 'uppercase',
                        color: '#94A3B8',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.badge}
                    </span>
                  </div>

                  <h3
                    style={{
                      fontSize: isMobile ? '0.92rem' : '1.14rem',
                      lineHeight: 1.25,
                      fontWeight: 700,
                      color: '#FFFFFF',
                      marginBottom: isMobile ? 5 : 6,
                    }}
                  >
                    {isMobile ? item.shortLabel : item.title}
                  </h3>

                  <p
                    style={{
                      fontSize: isMobile ? '0.75rem' : '0.86rem',
                      lineHeight: isMobile ? 1.42 : 1.55,
                      color: '#94A3B8',
                    }}
                  >
                    {isMobile ? item.shortDesc : item.desc}
                  </p>
                </div>

                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: isMobile ? '0.76rem' : '0.82rem',
                    fontWeight: 600,
                    color: '#E2E8F0',
                    paddingTop: 4,
                  }}
                >
                  <span>{isMobile ? 'Detalhes' : item.actionLabel}</span>
                  <ArrowRight size={13} color="#76D800" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SEÇÃO 4 (FUNDO BRANCO): PASSO A PASSO DA PLATAFORMA (01-05) ═══ */}
      <section
        id="como-funciona"
        style={{
          backgroundColor: '#FFFFFF',
          color: '#0A0F14',
          paddingTop: isMobile ? 48 : 76,
          paddingBottom: isMobile ? 54 : 84,
          scrollMarginTop: 68,
        }}
      >
        <div style={containerStyle}>
          <div style={{ maxWidth: 660, marginBottom: isMobile ? 22 : 34 }}>
            <div
              style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                color: '#15803D',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              Funcionamento da plataforma
            </div>
            <h2
              style={{
                fontSize: isMobile ? '1.65rem' : '2.2rem',
                fontWeight: 800,
                lineHeight: 1.16,
                letterSpacing: '-0.025em',
                color: '#0A0F14',
              }}
            >
              Da cotação ao comprovante em cinco etapas
            </h2>
          </div>

          {isMobile ? (
            /* Mobile: Seleção 01..05 + Card Ativo */
            <div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                  gap: 6,
                  marginBottom: 14,
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
                        height: 36,
                        borderRadius: 8,
                        border: active ? 'none' : '1px solid #E2E8F0',
                        backgroundColor: active ? '#0A0F14' : '#F8FAFC',
                        color: active ? '#FFFFFF' : '#475569',
                        fontSize: '0.8rem',
                        fontWeight: 700,
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
                  borderRadius: 12,
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
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        backgroundColor: '#76D800',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {activeStep.icon}
                    </span>
                    <h3 style={{ fontSize: '1.02rem', fontWeight: 700, color: '#0A0F14' }}>
                      {activeStep.title}
                    </h3>
                  </div>
                  <p style={{ fontSize: '0.88rem', lineHeight: 1.55, color: '#475569', marginBottom: 16 }}>
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
                        borderRadius: 8,
                        border: 'none',
                        backgroundColor: '#0A0F14',
                        color: '#FFFFFF',
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Simular trajeto
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
            /* Desktop: Lista Stepper à Esquerda + Painel Fotográfico à Direita */
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
                        borderRadius: 10,
                        border: active ? '1px solid #0A0F14' : '1px solid #E2E8F0',
                        backgroundColor: active ? '#0A0F14' : '#F8FAFC',
                        color: active ? '#FFFFFF' : '#0A0F14',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 14,
                      }}
                    >
                      <span
                        style={{
                          minWidth: 32,
                          height: 32,
                          borderRadius: 6,
                          backgroundColor: active ? '#76D800' : '#E2E8F0',
                          color: '#0A0F14',
                          fontSize: '0.82rem',
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
                        <div style={{ fontSize: '0.96rem', fontWeight: 700, marginBottom: 4 }}>
                          {step.title}
                        </div>
                        <div
                          style={{
                            fontSize: '0.84rem',
                            lineHeight: 1.48,
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
                  backgroundColor: '#F6F7F8',
                  border: '1px solid #E2E8F0',
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div style={{ borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
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
                        width: 40,
                        height: 40,
                        borderRadius: 8,
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
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#15803D', letterSpacing: '0.06em' }}>
                        ETAPA {activeStep.num} DE 05
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0A0F14' }}>
                        {activeStep.title}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openClientFlow()}
                    style={{
                      height: 40,
                      padding: '0 18px',
                      borderRadius: 8,
                      border: 'none',
                      backgroundColor: '#0A0F14',
                      color: '#FFFFFF',
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Calcular viagem
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══ SEÇÃO 5 (CARVÃO #0E141B): EMPRESAS & OCASIÕES ESPECIAIS ═══ */}
      <section
        id="empresas"
        style={{
          backgroundColor: '#0E141B',
          color: '#FFFFFF',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
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
            }}
          >
            <div>
              <div
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  color: '#94A3B8',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                Kavro para empresas
              </div>
              <h2
                style={{
                  fontSize: isMobile ? '1.65rem' : '2.2rem',
                  fontWeight: 800,
                  lineHeight: 1.15,
                  letterSpacing: '-0.025em',
                  color: '#FFFFFF',
                  marginBottom: 14,
                }}
              >
                Deslocamentos corporativos e entregas locais centralizados
              </h2>
              <p
                style={{
                  fontSize: '0.95rem',
                  lineHeight: 1.6,
                  color: '#94A3B8',
                  marginBottom: 22,
                }}
              >
                Organize o transporte de colaboradores, recepção de visitantes e envio rápido de
                documentos comerciais com histórico completo e recibos digitais.
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
                  { icon: <Briefcase size={15} color="#CBD5E1" />, text: 'Viagens de equipe' },
                  { icon: <BarChart3 size={15} color="#CBD5E1" />, text: 'Histórico por período' },
                  { icon: <ClipboardCheck size={15} color="#CBD5E1" />, text: 'Recibos digitais' },
                ].map((chip) => (
                  <div
                    key={chip.text}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      backgroundColor: '#131B24',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      padding: '8px 12px',
                      borderRadius: 8,
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: '#E2E8F0',
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
                  height: 44,
                  padding: '0 22px',
                  borderRadius: 8,
                  border: 'none',
                  backgroundColor: '#FFFFFF',
                  color: '#0A0F14',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Conhecer solução empresarial
              </button>
            </div>

            {/* Cards Operacionais Corporativos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                {
                  title: 'Reservas programadas & Aeroporto',
                  desc: 'Programe o veículo no horário exato para reuniões externas, eventos e voos.',
                  cta: 'Agendar horário',
                  image: '/landing/corporate-ride.jpg',
                  onClick: () => openClientFlow('schedule'),
                },
                {
                  title: 'Entregas expressas no mesmo dia',
                  desc: 'Envie documentos, contratos e encomendas com acompanhamento da rota ao vivo.',
                  cta: 'Solicitar envio',
                  image: '/landing/package-delivery.jpg',
                  onClick: () => openClientFlow(),
                },
              ].map((card) => (
                <div
                  key={card.title}
                  onClick={card.onClick}
                  style={{
                    backgroundColor: '#131B24',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 10,
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
                      borderRadius={8}
                      fallback="linear-gradient(135deg, #172721, #0A0F14)"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '1.02rem', fontWeight: 700, color: '#FFFFFF', marginBottom: 6 }}>
                      {card.title}
                    </h3>
                    <p style={{ fontSize: '0.85rem', lineHeight: 1.48, color: '#94A3B8', marginBottom: 10 }}>
                      {card.desc}
                    </p>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        color: '#FFFFFF',
                      }}
                    >
                      <span>{card.cta}</span>
                      <ArrowRight size={14} color="#76D800" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SEÇÃO 6 (NEUTRO CLARO #F6F7F8): ACESSO DUAL NO CELULAR ═══ */}
      <section
        id="apps-qr"
        style={{
          backgroundColor: '#F6F7F8',
          color: '#0A0F14',
          paddingTop: isMobile ? 46 : 68,
          paddingBottom: isMobile ? 54 : 76,
          scrollMarginTop: 68,
        }}
      >
        <div style={containerStyle}>
          <div style={{ textAlign: isMobile ? 'left' : 'center', maxWidth: 640, margin: isMobile ? '0 0 24px' : '0 auto 32px' }}>
            <h2
              style={{
                fontSize: isMobile ? '1.6rem' : '2.05rem',
                fontWeight: 800,
                lineHeight: 1.18,
                letterSpacing: '-0.025em',
                color: '#0A0F14',
                marginBottom: 8,
              }}
            >
              Acesso Web App e instalação na tela inicial
            </h2>
            <p style={{ fontSize: '0.94rem', color: '#475569' }}>
              Operamos via navegador e PWA Web oficial. Toque abaixo para ver o guia de instalação no Android ou iPhone e acessar.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
              gap: 18,
            }}
          >
            {/* Card Passageiro */}
            <button
              type="button"
              onClick={() => navigate('/instalar?app=passageiro')}
              style={{
                backgroundColor: '#0A0F14',
                color: '#FFFFFF',
                border: '1px solid #1E293B',
                borderRadius: 12,
                padding: isMobile ? '18px' : '22px',
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                cursor: 'pointer',
                width: '100%',
                boxShadow: '0 10px 28px rgba(10, 15, 20, 0.1)',
              }}
            >
              {isMobile ? (
                <div style={mobileAppBadgeStyle}>
                  <img
                    src="/logo-icon.png"
                    alt="App Kavro Drive"
                    style={{ width: 46, height: 46, objectFit: 'contain', borderRadius: 8 }}
                  />
                </div>
              ) : (
                <QrCanvasBox url={`${baseUrl}/instalar?app=passageiro`} darkMode />
              )}
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.07em', marginBottom: 4 }}>
                  PARA PASSAGEIROS
                </div>
                <div style={{ fontSize: '1.08rem', fontWeight: 700, color: '#FFFFFF', marginBottom: 4 }}>
                  App Kavro Passageiro
                </div>
                <div style={{ fontSize: '0.84rem', color: '#94A3B8' }}>
                  {isMobile ? 'Tutorial Android/iOS + acesso rápido para pedir corrida' : 'Tutorial para Android ou iPhone e QR Code'}
                </div>
              </div>
              <ArrowRight size={20} color="#76D800" />
            </button>

            {/* Card Motorista */}
            <button
              type="button"
              onClick={() => navigate('/instalar?app=motorista')}
              style={{
                backgroundColor: '#FFFFFF',
                color: '#0A0F14',
                border: '1px solid #D1D5DB',
                borderRadius: 12,
                padding: isMobile ? '18px' : '22px',
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                cursor: 'pointer',
                width: '100%',
                boxShadow: '0 6px 20px rgba(10, 15, 20, 0.05)',
              }}
            >
              {isMobile ? (
                <div style={{ ...mobileAppBadgeStyle, backgroundColor: '#0A0F14', borderColor: '#1E293B' }}>
                  <img
                    src="/logo-icon.png"
                    alt="App Parceiro Kavro Drive"
                    style={{ width: 46, height: 46, objectFit: 'contain', borderRadius: 8 }}
                  />
                </div>
              ) : (
                <QrCanvasBox url={`${baseUrl}/instalar?app=motorista`} />
              )}
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#15803D', letterSpacing: '0.07em', marginBottom: 4 }}>
                  PARA MOTORISTAS
                </div>
                <div style={{ fontSize: '1.08rem', fontWeight: 700, color: '#0A0F14', marginBottom: 4 }}>
                  App Parceiro Kavro
                </div>
                <div style={{ fontSize: '0.84rem', color: '#475569' }}>
                  {isMobile ? 'Tutorial Android/iOS + acesso ao Portal do Motorista' : 'Tutorial para Android ou iPhone e QR Code'}
                </div>
              </div>
              <ArrowRight size={20} color="#0A0F14" />
            </button>
          </div>
        </div>
      </section>

      {/* ═══ SEÇÃO 7: RODAPÉ INSTITUCIONAL KAVRO DRIVE ═══ */}
      <footer
        style={{
          backgroundColor: '#070B0F',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          color: '#FFFFFF',
          paddingTop: isMobile ? 44 : 64,
          paddingBottom: isMobile ? 44 : 52,
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
                  height: 32,
                  width: 'auto',
                  display: 'block',
                  marginBottom: 14,
                  objectFit: 'contain',
                }}
              />
              <p style={{ fontSize: '0.85rem', lineHeight: 1.6, color: '#94A3B8', marginBottom: 16, maxWidth: 295 }}>
                {config.companyName || 'Kavro Drive'} — Plataforma regional de mobilidade urbana, reservas programadas e entregas locais com tarifa transparente.
              </p>
              <button
                type="button"
                onClick={() => navigate('/ajuda')}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
                  color: '#FFFFFF',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '0 0 2px 0',
                }}
              >
                Central de Ajuda e Suporte
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
                  Modalidades disponíveis
                </button>
                <button type="button" onClick={() => scrollToSection('como-funciona')} style={footerLinkStyle}>
                  Como funciona
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
                  Benefícios para dirigir
                </button>
                <button type="button" onClick={() => setBusinessModalOpen(true)} style={footerLinkStyle}>
                  Kavro para Empresas
                </button>
              </div>
            </div>

            <div>
              <h4 style={footerColTitleStyle}>Institucional</h4>
              <div style={footerColListStyle}>
                <button type="button" onClick={() => navigate('/instalar')} style={footerLinkStyle}>
                  Instalar Web App (PWA)
                </button>
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
              borderTop: '1px solid rgba(255,255,255,0.08)',
              paddingTop: 22,
              fontSize: '0.8rem',
              color: '#64748B',
            }}
          >
            © {new Date().getFullYear()} {config.companyName || 'Kavro Drive'}. Todos os direitos reservados.
          </div>
        </div>
      </footer>

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
                    padding: '7px 12px',
                    borderRadius: 8,
                    border: selectedCity === city ? '1px solid #0A0F14' : '1px solid #E2E8F0',
                    backgroundColor: selectedCity === city ? '#0A0F14' : '#F8FAFC',
                    color: selectedCity === city ? '#FFFFFF' : '#0A0F14',
                    fontSize: '0.82rem',
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
                height: 44,
                borderRadius: 8,
                border: 'none',
                backgroundColor: '#0A0F14',
                color: '#FFFFFF',
                fontSize: '0.92rem',
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
                height: 44,
                borderRadius: 8,
                border: 'none',
                backgroundColor: '#0A0F14',
                color: '#FFFFFF',
                fontSize: '0.92rem',
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
  color: '#CBD5E1',
  fontSize: '0.86rem',
  fontWeight: 500,
  padding: '8px 11px',
  borderRadius: 8,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const darkDropdownItemStyle: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  background: 'none',
  border: 'none',
  padding: '9px 12px',
  borderRadius: 6,
  fontSize: '0.85rem',
  fontWeight: 500,
  color: '#E2E8F0',
  cursor: 'pointer',
};

const drawerRowBtnStyle: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  padding: '13px 14px',
  backgroundColor: '#131B23',
  color: '#FFFFFF',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: 8,
  fontSize: '0.92rem',
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
  color: '#0A0F14',
  fontSize: '0.92rem',
  fontWeight: 500,
};

const lightCarouselBtnStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 8,
  border: '1px solid #CBD5E1',
  backgroundColor: '#FFFFFF',
  color: '#0A0F14',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

const mobileAppBadgeStyle: React.CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: 12,
  backgroundColor: '#FFFFFF',
  border: '1px solid #E2E8F0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const footerColTitleStyle: React.CSSProperties = {
  fontSize: '0.88rem',
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
  color: '#94A3B8',
  fontSize: '0.85rem',
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
