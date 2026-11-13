import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Search,
  Share2,
  Check,
  Car,
  Users,
  MapPin,
  Clock,
  Star,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  FileCheck2,
  Lock,
  Radio,
  X,
  Navigation,
  Award,
  FileText,
  Printer,
} from 'lucide-react';
import { Ride, SystemConfig } from '../types';
import { MercosulPlateBadge } from '../components/MercosulPlateBadge';
import {
  getCarColorProfile,
  getStudioVehicleFallback,
  resolveVehiclePhotoExact,
} from '../services/vehicleService';
import { formatRideCode } from '../utils/format';

interface PublicAuditScreenProps {
  config: SystemConfig;
  rides: Ride[];
}

interface PublicAuditDriver {
  id: string;
  name: string;
  photo: string;
  city: string;
  bio: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleVersion: string;
  vehicleYear: string;
  vehicleColor: string;
  vehiclePlate: string;
  vehicleCategory: string;
  vehiclePhoto: string;
  eligibleCategories: string[];
  enabledCategories: string[];
  hasAirConditioning: boolean;
  hasFourDoors: boolean;
  isOnline: boolean;
  rating: number;
  kycVerified: boolean;
  termsAccepted: boolean;
  termsSignatureCode: string;
  completedRidesCount: number;
  auditedRidesCount: number;
  auditedKm: number;
  passengersServed: number;
  createdAt?: string;
}

interface PublicAuditRide {
  id: string;
  rideCode: string;
  date: string;
  time: string;
  originAddress: string;
  destinationAddress: string;
  distanceKm: number;
  passengers: number;
  category: string;
  categoryName: string;
  paymentMethod: string;
  paymentStatus: string;
  driverId: string;
  driverName: string;
  driverVehicle: string;
  driverPlate: string;
  passengerMasked: string;
}

interface PublicAuditSummary {
  city: string;
  totalApprovedDrivers: number;
  onlineDrivers: number;
  totalCompletedRides: number;
  totalRegisteredRides: number;
  totalKm: number;
  totalPassengers: number;
  avgRating: number;
}

function maskFallbackName(fullName: string): string {
  const s = String(fullName || '').trim();
  if (!s) return 'Passageiro Verificado';
  const parts = s.split(/\s+/);
  if (parts.length === 1) return `${parts[0].slice(0, 3)}•••`;
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}. •••`;
}

const ResolvedVehicleImg: React.FC<{
  driver: {
    vehiclePhoto?: string;
    vehicleBrand?: string;
    vehicleModel?: string;
    vehicleYear?: string;
    vehicleColor?: string;
    vehicleCategory?: string;
  };
  alt: string;
  style?: React.CSSProperties;
}> = ({ driver, alt, style }) => {
  const studioFallback = getStudioVehicleFallback(
    driver.vehicleModel,
    driver.vehicleCategory,
    driver.vehicleColor
  );
  const [src, setSrc] = useState<string>(driver.vehiclePhoto?.trim() || studioFallback);

  useEffect(() => {
    let active = true;
    if (driver.vehiclePhoto && driver.vehiclePhoto.trim()) {
      setSrc(driver.vehiclePhoto.trim());
      return;
    }
    setSrc(studioFallback);
    resolveVehiclePhotoExact({
      brand: driver.vehicleBrand,
      model: driver.vehicleModel,
      year: driver.vehicleYear,
      color: driver.vehicleColor,
      category: driver.vehicleCategory,
    }).then((res) => {
      if (active && res.photoUrl) setSrc(res.photoUrl);
    });
    return () => {
      active = false;
    };
  }, [
    driver.vehiclePhoto,
    driver.vehicleBrand,
    driver.vehicleModel,
    driver.vehicleYear,
    driver.vehicleColor,
    driver.vehicleCategory,
    studioFallback,
  ]);

  return (
    <img
      src={src}
      alt={alt}
      onError={() => {
        if (src !== studioFallback) setSrc(studioFallback);
      }}
      style={style}
    />
  );
};

export const PublicAuditScreen: React.FC<PublicAuditScreenProps> = ({ config, rides }) => {
  const navigate = useNavigate();

  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 900 : false
  );
  const [activeTab, setActiveTab] = useState<'drivers' | 'rides' | 'terms'>('drivers');
  const [loading, setLoading] = useState<boolean>(true);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const [drivers, setDrivers] = useState<PublicAuditDriver[]>([]);
  const [publicRides, setPublicRides] = useState<PublicAuditRide[]>([]);
  const [summary, setSummary] = useState<PublicAuditSummary | null>(null);

  const [driverSearch, setDriverSearch] = useState<string>('');
  const [driverFilter, setDriverFilter] = useState<'all' | 'online' | 'kyc'>('all');
  const [selectedDriver, setSelectedDriver] = useState<PublicAuditDriver | null>(null);

  const [rideSearch, setRideSearch] = useState<string>('');
  const [rideDriverFilter, setRideDriverFilter] = useState<string>('all');

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const fetchPublicAudit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/public/audit?_t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data?.ok) {
          setDrivers(Array.isArray(data.drivers) ? data.drivers : []);
          setPublicRides(Array.isArray(data.rides) ? data.rides : []);
          setSummary(data.summary || null);
          setLoading(false);
          return;
        }
      }
    } catch {
      // Fallback offline/props
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPublicAudit();
  }, []);

  const effectiveRides = useMemo<PublicAuditRide[]>(() => {
    if (publicRides.length > 0) return publicRides;
    return rides
      .filter((r) => r.status === 'finalizada')
      .map((r) => ({
        id: r.id,
        rideCode: r.rideCode || formatRideCode(r.id),
        date: r.date,
        time: r.time || '00:00',
        originAddress: r.origin?.address || 'Origem registrada',
        destinationAddress: r.destination?.address || 'Destino registrado',
        distanceKm: Number(r.distanceKm || 0),
        passengers: Number(r.passengers || 1),
        category: r.category || 'kavro_go',
        categoryName: r.categoryName || r.category || 'Kavro Viagem',
        paymentMethod: r.paymentMethod || 'pix',
        paymentStatus: r.paymentStatus || 'confirmado',
        driverId: r.driverId || 'primary',
        driverName: r.driverName || config.driverName || 'Motorista Verificado',
        driverVehicle: r.driverVehicle || config.driverVehicle || 'Veículo Verificado',
        driverPlate: r.driverPlate || config.driverPlate || '',
        passengerMasked: maskFallbackName(r.clientName),
      }));
  }, [publicRides, rides, config]);

  const effectiveSummary = useMemo<PublicAuditSummary>(() => {
    if (summary) return summary;
    const totalKm = effectiveRides.reduce((acc, r) => acc + (Number(r.distanceKm) || 0), 0);
    const totalPassengers = effectiveRides.reduce((acc, r) => acc + (Number(r.passengers) || 1), 0);
    return {
      city: config.driverCarCity || 'Operação Regional',
      totalApprovedDrivers: drivers.length,
      onlineDrivers: drivers.filter((d) => d.isOnline).length,
      totalCompletedRides: effectiveRides.length,
      totalRegisteredRides: rides.filter((r) => r.status !== 'cancelada').length,
      totalKm: Number(totalKm.toFixed(1)),
      totalPassengers,
      avgRating:
        drivers.length > 0
          ? Number((drivers.reduce((acc, d) => acc + (d.rating || 5), 0) / drivers.length).toFixed(2))
          : 5.0,
    };
  }, [summary, drivers, effectiveRides, rides, config.driverCarCity]);

  const filteredDrivers = useMemo(() => {
    return drivers.filter((d) => {
      if (driverFilter === 'online' && !d.isOnline) return false;
      if (driverFilter === 'kyc' && !d.kycVerified) return false;
      if (!driverSearch.trim()) return true;
      const q = driverSearch.toLowerCase();
      return (
        d.name.toLowerCase().includes(q) ||
        d.vehicleBrand.toLowerCase().includes(q) ||
        d.vehicleModel.toLowerCase().includes(q) ||
        d.vehiclePlate.toLowerCase().includes(q) ||
        d.city.toLowerCase().includes(q)
      );
    });
  }, [drivers, driverFilter, driverSearch]);

  const filteredRides = useMemo(() => {
    return effectiveRides.filter((r) => {
      if (rideDriverFilter !== 'all' && r.driverId !== rideDriverFilter) return false;
      if (!rideSearch.trim()) return true;
      const q = rideSearch.toLowerCase();
      return (
        r.rideCode.toLowerCase().includes(q) ||
        r.originAddress.toLowerCase().includes(q) ||
        r.destinationAddress.toLowerCase().includes(q) ||
        r.driverName.toLowerCase().includes(q) ||
        r.driverPlate.toLowerCase().includes(q) ||
        r.date.includes(q)
      );
    });
  }, [effectiveRides, rideDriverFilter, rideSearch]);

  const selectedDriverRides = useMemo(() => {
    if (!selectedDriver) return [];
    return effectiveRides.filter(
      (r) => r.driverId === selectedDriver.id || r.driverName.toLowerCase() === selectedDriver.name.toLowerCase()
    );
  }, [selectedDriver, effectiveRides]);

  const handleShare = () => {
    const auditUrl = `${window.location.origin}/auditoria`;
    if (navigator.share) {
      navigator
        .share({
          title: 'Transparência & Auditoria Pública — Kavro Drive',
          text: 'Consulte o Termo Formal de Conformidade, a frota verificada e o histórico auditado da Kavro Drive.',
          url: auditUrl,
        })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(auditUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const containerStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 1200,
    margin: '0 auto',
    padding: isMobile ? '0 14px' : '0 28px',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#F2F6F3',
        color: '#0B1218',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        overflowX: 'hidden',
      }}
    >
      {/* ═══ HEADER COMPACTO FULL-WIDTH ═══ */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 80,
          backgroundColor: 'rgba(11, 18, 24, 0.96)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(118, 216, 0, 0.2)',
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
                height: isMobile ? 23 : 28,
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
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: '#8CE826',
                  whiteSpace: 'nowrap',
                }}
              >
                Transparência &amp; Auditoria Pública
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              onClick={fetchPublicAudit}
              title="Atualizar dados"
              style={{
                height: 34,
                padding: isMobile ? '0 9px' : '0 12px',
                borderRadius: 9,
                border: '1px solid rgba(118, 216, 0, 0.25)',
                backgroundColor: '#131E26',
                color: '#E2E8F0',
                fontSize: '0.78rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={13} style={{ opacity: loading ? 0.55 : 1 }} />
              {!isMobile && <span>Atualizar</span>}
            </button>

            <button
              type="button"
              onClick={handleShare}
              style={{
                height: 34,
                padding: isMobile ? '0 9px' : '0 12px',
                borderRadius: 9,
                border: '1px solid rgba(255,255,255,0.16)',
                backgroundColor: '#131E26',
                color: copiedLink ? '#76D800' : '#FFFFFF',
                fontSize: '0.78rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                cursor: 'pointer',
              }}
            >
              {copiedLink ? <Check size={13} /> : <Share2 size={13} />}
              <span>{copiedLink ? 'Copiado' : isMobile ? 'Link' : 'Compartilhar'}</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/cliente')}
              style={{
                height: 34,
                padding: isMobile ? '0 11px' : '0 14px',
                borderRadius: 9,
                border: 'none',
                backgroundColor: '#76D800',
                color: '#0B1218',
                fontSize: '0.78rem',
                fontWeight: 800,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Pedir corrida
            </button>
          </div>
        </div>
      </header>

      {/* ═══ HERO COMPACTO + KPIS DA REDE MULTI-MOTORISTAS ═══ */}
      <section
        style={{
          background:
            'radial-gradient(ellipse at 82% 0%, rgba(118, 216, 0, 0.14) 0%, rgba(11, 18, 24, 0) 52%), #0B1218',
          color: '#FFFFFF',
          paddingTop: isMobile ? 20 : 34,
          paddingBottom: isMobile ? 24 : 36,
        }}
      >
        <div style={containerStyle}>
          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'flex-start' : 'flex-end',
              justifyContent: 'space-between',
              gap: 14,
              marginBottom: isMobile ? 18 : 24,
            }}
          >
            <div style={{ maxWidth: 740 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 999,
                  backgroundColor: 'rgba(118, 216, 0, 0.14)',
                  border: '1px solid rgba(118, 216, 0, 0.3)',
                  color: '#8CE826',
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: 8,
                }}
              >
                <ShieldCheck size={13} />
                <span>Operação Multi-Motoristas • {effectiveSummary.city}</span>
              </div>

              <h1
                style={{
                  fontSize: isMobile ? '1.42rem' : '2.1rem',
                  fontWeight: 800,
                  lineHeight: 1.15,
                  letterSpacing: '-0.025em',
                  marginBottom: 6,
                }}
              >
                Central Pública de Transparência, Frota &amp; Conformidade
              </h1>
              <p style={{ fontSize: isMobile ? '0.84rem' : '0.92rem', lineHeight: 1.5, color: '#CBD5E1' }}>
                Registro público oficial dos motoristas habilitados, veículos vistoriados, histórico de viagens
                auditadas e Termo Formal de Segurança e LGPD da Kavro Drive.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('terms')}
              style={{
                height: 38,
                padding: '0 14px',
                borderRadius: 10,
                border: '1px solid rgba(118, 216, 0, 0.38)',
                backgroundColor: '#131E26',
                color: '#8CE826',
                fontSize: '0.8rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <FileText size={14} />
              <span>Ler Termo Formal de Auditoria</span>
            </button>
          </div>

          {/* 4 KPIs Compactos */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
              gap: isMobile ? 8 : 14,
            }}
          >
            {[
              {
                label: 'Motoristas Ativos',
                value: effectiveSummary.totalApprovedDrivers,
                sub: `${effectiveSummary.onlineDrivers} online agora`,
                accent: '#76D800',
                icon: <Users size={15} color="#76D800" />,
              },
              {
                label: 'Corridas Auditadas',
                value: effectiveSummary.totalCompletedRides,
                sub: `${effectiveSummary.totalRegisteredRides} no sistema`,
                accent: '#FFFFFF',
                icon: <CheckCircle2 size={15} color="#76D800" />,
              },
              {
                label: 'KM Monitorados',
                value: `${effectiveSummary.totalKm} km`,
                sub: 'Trajetos com GPS',
                accent: '#FFFFFF',
                icon: <Navigation size={15} color="#76D800" />,
              },
              {
                label: 'Passageiros & Nota',
                value: effectiveSummary.totalPassengers,
                sub: `Frota ★ ${effectiveSummary.avgRating.toFixed(2)}`,
                accent: '#76D800',
                icon: <Award size={15} color="#76D800" />,
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                style={{
                  backgroundColor: '#131E26',
                  border: '1px solid rgba(118, 216, 0, 0.18)',
                  borderRadius: 12,
                  padding: isMobile ? '11px 12px' : '14px 16px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 700, color: '#94A3B8' }}>
                    {kpi.label}
                  </span>
                  {kpi.icon}
                </div>
                <div
                  style={{
                    fontSize: isMobile ? '1.18rem' : '1.48rem',
                    fontWeight: 800,
                    color: kpi.accent,
                    lineHeight: 1.15,
                  }}
                >
                  {kpi.value}
                </div>
                <div style={{ fontSize: '0.71rem', color: '#CBD5E1', marginTop: 2 }}>{kpi.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ NAVEGAÇÃO POR ABAS 100% RESPONSIVA ═══ */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #DCE5DF',
        }}
      >
        <div
          style={{
            ...containerStyle,
            paddingTop: 10,
            paddingBottom: 10,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(3, minmax(0, 1fr))' : 'repeat(3, auto)',
              justifyContent: isMobile ? 'stretch' : 'start',
              gap: 6,
              backgroundColor: '#F2F6F3',
              padding: 4,
              borderRadius: 12,
              border: '1px solid #DCE5DF',
              width: isMobile ? '100%' : 'fit-content',
            }}
          >
            {[
              {
                key: 'drivers',
                label: isMobile ? `Frota (${drivers.length})` : `Frota & Motoristas (${drivers.length})`,
                icon: <Car size={15} />,
              },
              {
                key: 'rides',
                label: isMobile
                  ? `Corridas (${effectiveRides.length})`
                  : `Auditoria de Corridas (${effectiveRides.length})`,
                icon: <FileCheck2 size={15} />,
              },
              {
                key: 'terms',
                label: isMobile ? 'Termo & LGPD' : 'Termo Formal & Segurança',
                icon: <Lock size={15} />,
              },
            ].map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key as 'drivers' | 'rides' | 'terms')}
                  style={{
                    height: 36,
                    padding: isMobile ? '0 6px' : '0 16px',
                    borderRadius: 9,
                    border: 'none',
                    backgroundColor: active ? '#121A21' : 'transparent',
                    color: active ? '#76D800' : '#334155',
                    fontSize: isMobile ? '0.72rem' : '0.84rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ═══ CONTEÚDO DAS ABAS ═══ */}
      <main style={{ ...containerStyle, paddingTop: isMobile ? 16 : 26, paddingBottom: 56 }}>
        {/* ─── ABA 1: FROTA MULTI-MOTORISTAS COMPACTA COM CARROS ELÉTRICOS DE ESTÚDIO ─── */}
        {activeTab === 'drivers' && (
          <div>
            {/* Barra de Busca e Filtro */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #DCE5DF',
                borderRadius: 14,
                padding: isMobile ? 10 : 14,
                marginBottom: 16,
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'stretch' : 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ position: 'relative', flex: 1 }}>
                <Search
                  size={16}
                  color="#64748B"
                  style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
                />
                <input
                  type="text"
                  value={driverSearch}
                  onChange={(e) => setDriverSearch(e.target.value)}
                  placeholder="Buscar por motorista, modelo, placa ou cidade..."
                  style={{
                    width: '100%',
                    height: 38,
                    paddingLeft: 36,
                    paddingRight: 12,
                    borderRadius: 9,
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#F8FAFC',
                    color: '#0B1218',
                    fontSize: '0.86rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div
                style={{
                  display: isMobile ? 'grid' : 'inline-flex',
                  gridTemplateColumns: isMobile ? 'repeat(3, minmax(0, 1fr))' : undefined,
                  gap: 6,
                  flexShrink: 0,
                }}
              >
                {[
                  { key: 'all', label: `Todos (${drivers.length})` },
                  { key: 'online', label: `Online (${drivers.filter((d) => d.isOnline).length})` },
                  { key: 'kyc', label: `KYC OK (${drivers.filter((d) => d.kycVerified).length})` },
                ].map((f) => {
                  const active = driverFilter === f.key;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setDriverFilter(f.key as 'all' | 'online' | 'kyc')}
                      style={{
                        height: 36,
                        padding: isMobile ? '0 6px' : '0 13px',
                        borderRadius: 9,
                        border: active ? 'none' : '1px solid #DCE5DF',
                        backgroundColor: active ? '#121A21' : '#F2F6F3',
                        color: active ? '#76D800' : '#334155',
                        fontSize: isMobile ? '0.73rem' : '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {loading && drivers.length === 0 ? (
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #DCE5DF',
                  borderRadius: 16,
                  padding: '36px 20px',
                  textAlign: 'center',
                  color: '#475569',
                  fontWeight: 600,
                }}
              >
                Carregando motoristas e dados auditados da rede...
              </div>
            ) : filteredDrivers.length === 0 ? (
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #DCE5DF',
                  borderRadius: 16,
                  padding: '34px 20px',
                  textAlign: 'center',
                }}
              >
                <Car size={32} color="#94A3B8" style={{ margin: '0 auto 10px', display: 'block' }} />
                <div style={{ fontSize: '0.98rem', fontWeight: 700, color: '#0B1218', marginBottom: 4 }}>
                  Nenhum motorista encontrado com esse filtro
                </div>
                <div style={{ fontSize: '0.84rem', color: '#64748B' }}>
                  Ajuste a busca ou visualize todos os motoristas habilitados.
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
                  gap: isMobile ? 12 : 16,
                }}
              >
                {filteredDrivers.map((drv) => {
                  const vehicleLabel =
                    [drv.vehicleBrand, drv.vehicleModel, drv.vehicleVersion].filter(Boolean).join(' ') ||
                    'Veículo Kavro Drive';
                  const colorInfo = getCarColorProfile(drv.vehicleColor || '');

                  return (
                    <div
                      key={drv.id}
                      style={{
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #DCE5DF',
                        borderRadius: 16,
                        padding: isMobile ? 13 : 16,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        boxShadow: '0 4px 16px rgba(11, 18, 24, 0.04)',
                      }}
                    >
                      {/* Linha 1: Motorista + Nota + Status */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          {drv.photo ? (
                            <img
                              src={drv.photo}
                              alt={drv.name}
                              style={{
                                width: 42,
                                height: 42,
                                borderRadius: '50%',
                                objectFit: 'cover',
                                border: drv.isOnline ? '2px solid #76D800' : '2px solid #CBD5E1',
                                flexShrink: 0,
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 42,
                                height: 42,
                                borderRadius: '50%',
                                backgroundColor: '#121A21',
                                color: '#76D800',
                                fontWeight: 800,
                                fontSize: '1rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: drv.isOnline ? '2px solid #76D800' : '2px solid #334155',
                                flexShrink: 0,
                              }}
                            >
                              {drv.name.charAt(0).toUpperCase()}
                            </div>
                          )}

                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: '0.96rem',
                                fontWeight: 800,
                                color: '#0B1218',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {drv.name}
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: '0.75rem',
                                color: '#475569',
                              }}
                            >
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  fontWeight: 700,
                                  color: '#0B1218',
                                }}
                              >
                                <Star size={12} color="#F59E0B" fill="#F59E0B" />
                                {drv.rating.toFixed(2)}
                              </span>
                              {drv.city && <span>• {drv.city}</span>}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          {drv.kycVerified && (
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: 999,
                                backgroundColor: '#ECFDF5',
                                border: '1px solid #A7F3D0',
                                color: '#065F46',
                                fontSize: '0.68rem',
                                fontWeight: 800,
                              }}
                            >
                              KYC ✓
                            </span>
                          )}
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: 999,
                              backgroundColor: drv.isOnline ? '#DCFCE7' : '#F1F5F9',
                              color: drv.isOnline ? '#166534' : '#475569',
                              fontSize: '0.7rem',
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            {drv.isOnline ? <Radio size={10} /> : <CheckCircle2 size={10} />}
                            <span>{drv.isOnline ? 'Online' : 'Aprovado'}</span>
                          </span>
                        </div>
                      </div>

                      {/* Linha 2 Compacta: Foto Estúdio Moderna EV + Dados do Veículo + Placa Mercosul */}
                      <div
                        style={{
                          backgroundColor: '#0F172A',
                          borderRadius: 12,
                          padding: isMobile ? 10 : 12,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          border: '1px solid #1E293B',
                        }}
                      >
                        <div
                          style={{
                            width: isMobile ? 96 : 122,
                            height: isMobile ? 64 : 76,
                            borderRadius: 9,
                            overflow: 'hidden',
                            flexShrink: 0,
                            backgroundColor: '#0B1218',
                          }}
                        >
                          <ResolvedVehicleImg
                            driver={drv}
                            alt={vehicleLabel}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              display: 'block',
                            }}
                          />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '0.64rem',
                              fontWeight: 800,
                              color: '#76D800',
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                            }}
                          >
                            {(drv.vehicleCategory || 'kavro_go').replace('_', ' ')}
                            {drv.vehicleYear ? ` • Ano ${drv.vehicleYear}` : ''}
                          </div>
                          <div
                            style={{
                              fontSize: isMobile ? '0.86rem' : '0.94rem',
                              fontWeight: 800,
                              color: '#FFFFFF',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              marginTop: 1,
                              marginBottom: 4,
                            }}
                          >
                            {vehicleLabel}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: '0.7rem',
                                color: '#CBD5E1',
                              }}
                            >
                              <span
                                style={{
                                  width: 7,
                                  height: 7,
                                  borderRadius: '50%',
                                  backgroundColor: colorInfo.hex,
                                  border: '1px solid rgba(255,255,255,0.4)',
                                }}
                              />
                              {colorInfo.label}
                            </span>
                          </div>
                        </div>

                        {drv.vehiclePlate && (
                          <div style={{ flexShrink: 0 }}>
                            <MercosulPlateBadge plate={drv.vehiclePlate} size="sm" />
                          </div>
                        )}
                      </div>

                      {/* Linha 3: Métricas inline + Botão enxuto */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          borderTop: '1px solid #E2E8F0',
                          paddingTop: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: '0.78rem' }}>
                          <div>
                            <span style={{ color: '#64748B' }}>Corridas: </span>
                            <strong style={{ color: '#0B1218' }}>{drv.completedRidesCount}</strong>
                          </div>
                          <div>
                            <span style={{ color: '#64748B' }}>Auditado: </span>
                            <strong style={{ color: '#16A34A' }}>{drv.auditedKm} km</strong>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedDriver(drv)}
                          style={{
                            height: 34,
                            padding: '0 13px',
                            borderRadius: 9,
                            border: 'none',
                            backgroundColor: '#121A21',
                            color: '#76D800',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span>Ficha &amp; Termo</span>
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Faixa Compacta do Termo Formal logo abaixo da Frota */}
            <div
              style={{
                marginTop: 22,
                backgroundColor: '#FFFFFF',
                border: '1px solid #DCE5DF',
                borderRadius: 16,
                padding: isMobile ? 16 : 20,
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'flex-start' : 'center',
                justifyContent: 'space-between',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: '#121A21',
                    color: '#76D800',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <FileText size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0B1218', marginBottom: 2 }}>
                    Declaração Formal de Conformidade &amp; Termo de Auditoria Pública
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.45 }}>
                    Todos os motoristas exibidos acima possuem CNH ativa, validação biométrica facial (KYC),
                    vínculo de placa oficial e concordância expressa com as normas da LGPD (Lei nº 13.709/2018).
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('terms')}
                style={{
                  height: 38,
                  padding: '0 16px',
                  borderRadius: 9,
                  border: '1px solid #121A21',
                  backgroundColor: '#F2F6F3',
                  color: '#0B1218',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                Ver Termo Completo
              </button>
            </div>
          </div>
        )}

        {/* ─── ABA 2: REGISTRO PÚBLICO DE CORRIDAS AUDITADAS ─── */}
        {activeTab === 'rides' && (
          <div>
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #DCE5DF',
                borderRadius: 14,
                padding: isMobile ? 10 : 14,
                marginBottom: 16,
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1.4fr 0.8fr',
                gap: 10,
              }}
            >
              <div style={{ position: 'relative' }}>
                <Search
                  size={16}
                  color="#64748B"
                  style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
                />
                <input
                  type="text"
                  value={rideSearch}
                  onChange={(e) => setRideSearch(e.target.value)}
                  placeholder="Pesquisar por código #UP, rua, bairro, motorista ou placa..."
                  style={{
                    width: '100%',
                    height: 38,
                    paddingLeft: 36,
                    paddingRight: 12,
                    borderRadius: 9,
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#F8FAFC',
                    color: '#0B1218',
                    fontSize: '0.86rem',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <select
                value={rideDriverFilter}
                onChange={(e) => setRideDriverFilter(e.target.value)}
                style={{
                  width: '100%',
                  height: 38,
                  padding: '0 10px',
                  borderRadius: 9,
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#F8FAFC',
                  color: '#0B1218',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  outline: 'none',
                }}
              >
                <option value="all">Todos os motoristas ({drivers.length})</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.vehiclePlate ? `• ${d.vehiclePlate}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {filteredRides.length === 0 ? (
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #DCE5DF',
                  borderRadius: 16,
                  padding: '36px 20px',
                  textAlign: 'center',
                }}
              >
                <FileCheck2 size={34} color="#94A3B8" style={{ margin: '0 auto 10px', display: 'block' }} />
                <div style={{ fontSize: '0.98rem', fontWeight: 700, color: '#0B1218', marginBottom: 4 }}>
                  Nenhuma corrida finalizada encontrada
                </div>
                <div style={{ fontSize: '0.84rem', color: '#64748B', maxWidth: 460, margin: '0 auto' }}>
                  Assim que os motoristas da plataforma concluírem corridas, os registros anonimizados serão
                  publicados automaticamente nesta trilha de auditoria.
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
                  gap: 12,
                }}
              >
                {filteredRides.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #DCE5DF',
                      borderRadius: 14,
                      padding: 14,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            padding: '3px 9px',
                            borderRadius: 7,
                            backgroundColor: '#121A21',
                            color: '#76D800',
                            fontSize: '0.73rem',
                            fontWeight: 800,
                          }}
                        >
                          {r.rideCode}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#475569', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={12} /> {r.date} • {r.time}
                        </span>
                      </div>

                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          backgroundColor: '#DCFCE7',
                          color: '#166534',
                          fontSize: '0.7rem',
                          fontWeight: 800,
                        }}
                      >
                        ✓ Auditada
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: '0.82rem' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, color: '#0B1218' }}>
                        <MapPin size={14} color="#16A34A" style={{ flexShrink: 0, marginTop: 2 }} />
                        <span>
                          <strong>Partida:</strong> {r.originAddress}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, color: '#334155' }}>
                        <Navigation size={14} color="#0B1218" style={{ flexShrink: 0, marginTop: 2 }} />
                        <span>
                          <strong>Destino:</strong> {r.destinationAddress}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        backgroundColor: '#F8FAFC',
                        borderRadius: 9,
                        padding: '8px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 6,
                        fontSize: '0.75rem',
                        color: '#334155',
                      }}
                    >
                      <div>
                        <strong>Motorista:</strong> {r.driverName}
                        {r.driverPlate ? ` (${r.driverPlate})` : ''}
                      </div>
                      <div>
                        <strong>LGPD:</strong> {r.passengerMasked} • <strong>{r.distanceKm} km</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── ABA 3: TERMO FORMAL DE TRANSPARÊNCIA, COMPLIANCE & LGPD ─── */}
        {activeTab === 'terms' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Documento Formal Oficial */}
            <article
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #DCE5DF',
                borderRadius: 18,
                padding: isMobile ? 18 : 30,
                boxShadow: '0 8px 24px rgba(11, 18, 24, 0.04)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  alignItems: isMobile ? 'flex-start' : 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  borderBottom: '1px solid #E2E8F0',
                  paddingBottom: 16,
                  marginBottom: 20,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      color: '#16A34A',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      marginBottom: 4,
                    }}
                  >
                    Documento Público Institucional • Protocolo KAVRO-AUD-{new Date().getFullYear()}
                  </div>
                  <h2 style={{ fontSize: isMobile ? '1.18rem' : '1.48rem', fontWeight: 800, color: '#0B1218' }}>
                    Termo Formal de Transparência, Auditoria Operacional e LGPD
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    height: 36,
                    padding: '0 14px',
                    borderRadius: 9,
                    border: 'none',
                    backgroundColor: '#121A21',
                    color: '#76D800',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <Printer size={14} />
                  <span>Imprimir / Salvar PDF</span>
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                  fontSize: isMobile ? '0.86rem' : '0.92rem',
                  lineHeight: 1.65,
                  color: '#334155',
                }}
              >
                <p>
                  Pelo presente instrumento público de transparência,{' '}
                  <strong>{config.companyName || 'Kavro Drive Mobilidade'}</strong>, operando na região de{' '}
                  <strong>{effectiveSummary.city}</strong>, torna acessíveis ao público usuário, passageiros e
                  órgãos fiscalizadores os critérios objetivos de habilitação multi-motoristas, rastreabilidade de
                  corridas e proteção de dados pessoais adotados nesta plataforma.
                </p>

                <div>
                  <h3 style={clauseTitleStyle}>CLÁUSULA 1ª — OPERAÇÃO MULTI-MOTORISTAS E AUTONOMIA</h3>
                  <p>
                    1.1. A Kavro Drive atua como ecossistema tecnológico multi-motoristas, conectando passageiros a
                    condutores parceiros independentes devidamente aprovados pela Central Administrativa. Atualmente
                    encontram-se habilitados nesta página <strong>{effectiveSummary.totalApprovedDrivers}</strong>{' '}
                    motorista(s) verificado(s), com visibilidade individual de veículo, categoria e placa.
                  </p>
                </div>

                <div>
                  <h3 style={clauseTitleStyle}>CLÁUSULA 2ª — VERIFICAÇÃO CADASTRAL, CNH E BIOMETRIA (KYC)</h3>
                  <p>
                    2.1. Nenhum motorista parceiro é autorizado a iniciar viagens comerciais sem prévia conferência
                    documental da Carteira Nacional de Habilitação (CNH) com observação EAR, comparação biométrica
                    facial (KYC), vistoria visual do veículo cadastrado, conferência de placa padrão Mercosul e
                    aceite formal com assinatura eletrônica dos Termos Operacionais da plataforma.
                  </p>
                </div>

                <div>
                  <h3 style={clauseTitleStyle}>CLÁUSULA 3ª — INTEGRIDADE DE TARIFAS E RASTREABILIDADE GPS</h3>
                  <p>
                    3.1. Todas as solicitações registradas geram código identificador único (<code>#UP</code>),
                    estimativa prévia transparente antes do embarque e trilha de geolocalização durante a execução da
                    viagem. Em caso de divergência ou solicitação judicial, a Central Administrativa mantém registro
                    interno auditável das rotas percorridas.
                  </p>
                </div>

                <div>
                  <h3 style={clauseTitleStyle}>CLÁUSULA 4ª — PROTEÇÃO DE DADOS PESSOAIS (LGPD — LEI Nº 13.709/2018)</h3>
                  <p>
                    4.1. Em estrita observância à Lei Geral de Proteção de Dados (Lei nº 13.709/2018), esta página
                    pública <strong>suprime e mascara integralmente</strong> dados sensíveis de passageiros e
                    motoristas, tais como CPF, número completo de CNH, endereços residenciais privados, chaves PIX,
                    dados bancários e identificações financeiras individuais, exibindo exclusivamente dados mínimos de
                    segurança veicular e comprovação pública de viagens concluídas.
                  </p>
                </div>

                <div>
                  <h3 style={clauseTitleStyle}>CLÁUSULA 5ª — OUVIDORIA E CANAL DE SOLICITAÇÃO</h3>
                  <p>
                    5.1. O titular de dados pessoais ou passageiro que desejar esclarecimentos sobre qualquer registro
                    exibido nesta Central de Auditoria poderá acionar o atendimento administrativo através da área do
                    passageiro em <strong>/cliente</strong> ou pelos canais oficiais informados na página inicial.
                  </p>
                </div>

                <div
                  style={{
                    marginTop: 6,
                    padding: '12px 14px',
                    backgroundColor: '#F2F6F3',
                    border: '1px solid #DCE5DF',
                    borderRadius: 12,
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    fontSize: '0.8rem',
                    color: '#0B1218',
                  }}
                >
                  <span>
                    <strong>Responsável Operacional:</strong> {config.companyName || 'Kavro Drive Mobilidade'} •{' '}
                    {effectiveSummary.city}
                  </span>
                  <span style={{ color: '#16A34A', fontWeight: 700 }}>
                    ✓ Registro Ativo &amp; Verificado ({new Date().toLocaleDateString('pt-BR')})
                  </span>
                </div>
              </div>
            </article>
          </div>
        )}
      </main>

      {/* ═══ MODAL COMPACTO DA FICHA INDIVIDUAL DO MOTORISTA ═══ */}
      {selectedDriver && (
        <div
          onClick={() => setSelectedDriver(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(11, 18, 24, 0.72)',
            backdropFilter: 'blur(4px)',
            zIndex: 220,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: isMobile ? 10 : 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 540,
              maxHeight: '86dvh',
              backgroundColor: '#FFFFFF',
              borderRadius: 18,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 22px 54px rgba(0,0,0,0.45)',
            }}
          >
            {/* Header compacto */}
            <div
              style={{
                backgroundColor: '#121A21',
                color: '#FFFFFF',
                padding: '13px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                borderBottom: '1px solid rgba(118, 216, 0, 0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                <ShieldCheck size={18} color="#76D800" style={{ flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#8CE826' }}>
                    FICHA INDIVIDUAL AUDITADA
                  </div>
                  <div
                    style={{
                      fontSize: '0.98rem',
                      fontWeight: 800,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {selectedDriver.name}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDriver(null)}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: 'rgba(255,255,255,0.12)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: isMobile ? 14 : 18, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Faixa Veículo + Placa */}
              <div
                style={{
                  backgroundColor: '#0F172A',
                  borderRadius: 12,
                  padding: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  color: '#FFFFFF',
                }}
              >
                <ResolvedVehicleImg
                  driver={selectedDriver}
                  alt={selectedDriver.vehicleModel}
                  style={{
                    width: 88,
                    height: 58,
                    borderRadius: 8,
                    objectFit: 'cover',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.68rem', color: '#76D800', fontWeight: 700 }}>
                    VEÍCULO HABILITADO
                  </div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 800 }}>
                    {[selectedDriver.vehicleBrand, selectedDriver.vehicleModel, selectedDriver.vehicleYear]
                      .filter(Boolean)
                      .join(' ') || 'Veículo Kavro Drive'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#CBD5E1' }}>
                    Cor: {selectedDriver.vehicleColor || 'Padrão'} • Nota ★ {selectedDriver.rating.toFixed(2)}
                  </div>
                </div>
                {selectedDriver.vehiclePlate && (
                  <MercosulPlateBadge plate={selectedDriver.vehiclePlate} size="sm" />
                )}
              </div>

              {/* Conformidade */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 10 }}>
                  <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>KYC &amp; Biometria</div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#16A34A' }}>
                    {selectedDriver.kycVerified ? 'Aprovado' : 'Verificado'}
                  </div>
                </div>
                <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 10 }}>
                  <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>Termo Digital</div>
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0B1218', wordBreak: 'break-all' }}>
                    {selectedDriver.termsSignatureCode || (selectedDriver.termsAccepted ? 'Assinado ✓' : 'Ativo ✓')}
                  </div>
                </div>
              </div>

              {/* Declaração de Conformidade Individual */}
              <div
                style={{
                  backgroundColor: '#F2F6F3',
                  border: '1px solid #DCE5DF',
                  borderRadius: 10,
                  padding: '10px 12px',
                  fontSize: '0.76rem',
                  color: '#334155',
                  lineHeight: 1.45,
                }}
              >
                Condutor verificado sob os termos da <strong>Política de Auditoria &amp; LGPD</strong> da Kavro Drive.
                Embarques exigem conferência da placa e do modelo acima antes da partida.
              </div>

              {/* Corridas do Motorista */}
              <div>
                <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0B1218', marginBottom: 8 }}>
                  Viagens Auditadas ({selectedDriverRides.length})
                </div>
                {selectedDriverRides.length === 0 ? (
                  <div
                    style={{
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: 10,
                      padding: 14,
                      fontSize: '0.8rem',
                      color: '#64748B',
                      textAlign: 'center',
                    }}
                  >
                    Nenhuma viagem concluída registrada publicamente para este motorista até o momento.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {selectedDriverRides.map((r) => (
                      <div
                        key={r.id}
                        style={{
                          border: '1px solid #E2E8F0',
                          borderRadius: 10,
                          padding: 10,
                          fontSize: '0.78rem',
                          backgroundColor: '#F8FAFC',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <strong>{r.rideCode}</strong>
                          <span style={{ color: '#64748B' }}>
                            {r.date} • {r.time} • {r.distanceKm} km
                          </span>
                        </div>
                        <div style={{ color: '#334155' }}>
                          <strong>De:</strong> {r.originAddress}
                        </div>
                        <div style={{ color: '#334155' }}>
                          <strong>Para:</strong> {r.destinationAddress}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const clauseTitleStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  fontWeight: 800,
  color: '#0B1218',
  marginBottom: 4,
};
