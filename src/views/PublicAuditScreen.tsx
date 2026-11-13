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
} from 'lucide-react';
import { Ride, SystemConfig } from '../types';
import { VehiclePhotoPreview } from '../components/VehiclePhotoPreview';
import { MercosulPlateBadge } from '../components/MercosulPlateBadge';
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

export const PublicAuditScreen: React.FC<PublicAuditScreenProps> = ({ config, rides }) => {
  const navigate = useNavigate();

  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 920 : false
  );
  const [activeTab, setActiveTab] = useState<'drivers' | 'rides' | 'protocols'>('drivers');
  const [loading, setLoading] = useState<boolean>(true);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const [drivers, setDrivers] = useState<PublicAuditDriver[]>([]);
  const [publicRides, setPublicRides] = useState<PublicAuditRide[]>([]);
  const [summary, setSummary] = useState<PublicAuditSummary | null>(null);

  // Filtros Frota / Motoristas
  const [driverSearch, setDriverSearch] = useState<string>('');
  const [driverFilter, setDriverFilter] = useState<'all' | 'online' | 'kyc'>('all');
  const [selectedDriver, setSelectedDriver] = useState<PublicAuditDriver | null>(null);

  // Filtros Corridas Auditadas
  const [rideSearch, setRideSearch] = useState<string>('');
  const [rideDriverFilter, setRideDriverFilter] = useState<string>('all');

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 920);
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
      // Fallback para props locais caso ocorra falha de rede
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPublicAudit();
  }, []);

  // Fallback caso API pública ainda não retorne dados (ex: modo offline)
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
          text: 'Consulte os motoristas verificados e o histórico público auditado de corridas na Kavro Drive.',
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
    maxWidth: 1220,
    margin: '0 auto',
    padding: isMobile ? '0 16px' : '0 32px',
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
      {/* ═══ BARRA SUPERIOR FULL-WIDTH KAVRO ═══ */}
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
            height: 66,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <button
              type="button"
              onClick={() => navigate('/')}
              title="Voltar para a página inicial"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
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
              <ArrowLeft size={17} />
            </button>

            <img
              src="/logo-horizontal-white.png"
              alt="Kavro Drive"
              onClick={() => navigate('/')}
              style={{
                height: isMobile ? 25 : 30,
                width: 'auto',
                objectFit: 'contain',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            />

            {!isMobile && (
              <div
                style={{
                  borderLeft: '1px solid rgba(255,255,255,0.16)',
                  paddingLeft: 14,
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  color: '#8CE826',
                  whiteSpace: 'nowrap',
                }}
              >
                Transparência &amp; Auditoria Pública
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              onClick={fetchPublicAudit}
              title="Atualizar dados da auditoria"
              style={{
                height: 36,
                padding: isMobile ? '0 10px' : '0 12px',
                borderRadius: 10,
                border: '1px solid rgba(118, 216, 0, 0.25)',
                backgroundColor: '#131E26',
                color: '#E2E8F0',
                fontSize: '0.8rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={14} style={{ opacity: loading ? 0.6 : 1 }} />
              {!isMobile && <span>Atualizar</span>}
            </button>

            <button
              type="button"
              onClick={handleShare}
              style={{
                height: 36,
                padding: isMobile ? '0 10px' : '0 14px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.16)',
                backgroundColor: '#131E26',
                color: copiedLink ? '#76D800' : '#FFFFFF',
                fontSize: '0.8rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              {copiedLink ? <Check size={14} /> : <Share2 size={14} />}
              <span>{copiedLink ? 'Copiado!' : isMobile ? 'Link' : 'Compartilhar'}</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/cliente')}
              style={{
                height: 36,
                padding: isMobile ? '0 12px' : '0 16px',
                borderRadius: 10,
                border: 'none',
                backgroundColor: '#76D800',
                color: '#0B1218',
                fontSize: '0.82rem',
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

      {/* ═══ PAINEL HERO & KPIS DA OPERAÇÃO MULTI-MOTORISTAS ═══ */}
      <section
        style={{
          background:
            'radial-gradient(ellipse at 80% 10%, rgba(118, 216, 0, 0.14) 0%, rgba(11, 18, 24, 0) 55%), #0B1218',
          color: '#FFFFFF',
          paddingTop: isMobile ? 28 : 44,
          paddingBottom: isMobile ? 34 : 48,
        }}
      >
        <div style={containerStyle}>
          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'flex-start' : 'flex-end',
              justifyContent: 'space-between',
              gap: 18,
              marginBottom: 28,
            }}
          >
            <div style={{ maxWidth: 720 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 12px',
                  borderRadius: 999,
                  backgroundColor: 'rgba(118, 216, 0, 0.14)',
                  border: '1px solid rgba(118, 216, 0, 0.3)',
                  color: '#8CE826',
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: 12,
                }}
              >
                <ShieldCheck size={14} />
                <span>Operação Multi-Motoristas Verificada • {effectiveSummary.city}</span>
              </div>

              <h1
                style={{
                  fontSize: isMobile ? '1.75rem' : '2.45rem',
                  fontWeight: 800,
                  lineHeight: 1.14,
                  letterSpacing: '-0.025em',
                  marginBottom: 10,
                }}
              >
                Central de Transparência &amp; Frota Auditada
              </h1>
              <p style={{ fontSize: '0.95rem', lineHeight: 1.55, color: '#CBD5E1' }}>
                Consulte todos os motoristas aprovados em atividade, veículos cadastrados com placa Mercosul,
                status de verificação biométrica (KYC) e o histórico público de corridas finalizadas com
                anonimização LGPD.
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate('/kavro-drive')}
              style={{
                height: 44,
                padding: '0 18px',
                borderRadius: 11,
                border: '1px solid rgba(118, 216, 0, 0.4)',
                backgroundColor: '#131E26',
                color: '#8CE826',
                fontSize: '0.86rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <span>Portal do Motorista</span>
              <ArrowRight size={15} />
            </button>
          </div>

          {/* Grid 4 KPIs da Rede */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
              gap: isMobile ? 10 : 16,
            }}
          >
            {[
              {
                label: 'Motoristas Verificados',
                value: effectiveSummary.totalApprovedDrivers,
                sub: `${effectiveSummary.onlineDrivers} online agora`,
                accent: '#76D800',
                icon: <Users size={18} color="#76D800" />,
              },
              {
                label: 'Corridas Auditadas',
                value: effectiveSummary.totalCompletedRides,
                sub: `${effectiveSummary.totalRegisteredRides} registradas no total`,
                accent: '#FFFFFF',
                icon: <CheckCircle2 size={18} color="#76D800" />,
              },
              {
                label: 'KM Monitorados',
                value: `${effectiveSummary.totalKm} km`,
                sub: 'Trajetos com GPS validado',
                accent: '#FFFFFF',
                icon: <Navigation size={18} color="#76D800" />,
              },
              {
                label: 'Passageiros & Nota',
                value: effectiveSummary.totalPassengers,
                sub: `Média da frota ★ ${effectiveSummary.avgRating.toFixed(2)}`,
                accent: '#76D800',
                icon: <Award size={18} color="#76D800" />,
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                style={{
                  backgroundColor: '#131E26',
                  border: '1px solid rgba(118, 216, 0, 0.2)',
                  borderRadius: 16,
                  padding: isMobile ? '14px' : '18px 20px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#94A3B8' }}>
                    {kpi.label}
                  </span>
                  {kpi.icon}
                </div>
                <div
                  style={{
                    fontSize: isMobile ? '1.35rem' : '1.75rem',
                    fontWeight: 800,
                    color: kpi.accent,
                    lineHeight: 1.15,
                    marginBottom: 4,
                  }}
                >
                  {kpi.value}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#CBD5E1' }}>{kpi.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ BARRA DE ABAS 100% ESTRUTURADA ═══ */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #DCE5DF',
        }}
      >
        <div
          style={{
            ...containerStyle,
            paddingTop: 14,
            paddingBottom: 14,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(3, minmax(0, 1fr))' : 'repeat(3, auto)',
              justifyContent: isMobile ? 'stretch' : 'start',
              gap: 8,
              backgroundColor: '#F2F6F3',
              padding: 6,
              borderRadius: 14,
              border: '1px solid #DCE5DF',
              width: isMobile ? '100%' : 'fit-content',
            }}
          >
            {[
              {
                key: 'drivers',
                label: isMobile ? `Frota (${drivers.length})` : `Frota & Motoristas (${drivers.length})`,
                icon: <Car size={16} />,
              },
              {
                key: 'rides',
                label: isMobile
                  ? `Corridas (${effectiveRides.length})`
                  : `Auditoria de Corridas (${effectiveRides.length})`,
                icon: <FileCheck2 size={16} />,
              },
              {
                key: 'protocols',
                label: isMobile ? 'Segurança' : 'Protocolos KYC & LGPD',
                icon: <Lock size={16} />,
              },
            ].map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key as 'drivers' | 'rides' | 'protocols')}
                  style={{
                    height: 40,
                    padding: isMobile ? '0 8px' : '0 18px',
                    borderRadius: 10,
                    border: 'none',
                    backgroundColor: active ? '#121A21' : 'transparent',
                    color: active ? '#76D800' : '#334155',
                    fontSize: isMobile ? '0.78rem' : '0.88rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
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

      {/* ═══ CONTEÚDO PRINCIPAL ═══ */}
      <main style={{ ...containerStyle, paddingTop: isMobile ? 22 : 34, paddingBottom: 68 }}>
        {/* ─── ABA 1: FROTA MULTI-MOTORISTAS ─── */}
        {activeTab === 'drivers' && (
          <div>
            {/* Barra de Busca e Filtro da Frota */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #DCE5DF',
                borderRadius: 16,
                padding: isMobile ? 14 : 18,
                marginBottom: 22,
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'stretch' : 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ position: 'relative', flex: 1 }}>
                <Search
                  size={17}
                  color="#64748B"
                  style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)' }}
                />
                <input
                  type="text"
                  value={driverSearch}
                  onChange={(e) => setDriverSearch(e.target.value)}
                  placeholder="Buscar por nome do motorista, modelo, placa ou cidade..."
                  style={{
                    width: '100%',
                    height: 42,
                    paddingLeft: 40,
                    paddingRight: 14,
                    borderRadius: 10,
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#F8FAFC',
                    color: '#0B1218',
                    fontSize: '0.9rem',
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
                        height: 40,
                        padding: isMobile ? '0 8px' : '0 14px',
                        borderRadius: 10,
                        border: active ? 'none' : '1px solid #DCE5DF',
                        backgroundColor: active ? '#121A21' : '#F2F6F3',
                        color: active ? '#76D800' : '#334155',
                        fontSize: isMobile ? '0.76rem' : '0.84rem',
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
                  borderRadius: 18,
                  padding: '48px 20px',
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
                  borderRadius: 18,
                  padding: '42px 24px',
                  textAlign: 'center',
                }}
              >
                <Car size={36} color="#94A3B8" style={{ margin: '0 auto 12px', display: 'block' }} />
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0B1218', marginBottom: 6 }}>
                  Nenhum motorista encontrado com esse filtro
                </div>
                <div style={{ fontSize: '0.88rem', color: '#64748B' }}>
                  Ajuste os termos de busca ou visualize todos os parceiros cadastrados na operação.
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                  gap: 18,
                }}
              >
                {filteredDrivers.map((drv) => {
                  const vehicleLabel =
                    [drv.vehicleBrand, drv.vehicleModel, drv.vehicleVersion].filter(Boolean).join(' ') ||
                    'Veículo Kavro Verificado';
                  return (
                    <div
                      key={drv.id}
                      style={{
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #DCE5DF',
                        borderRadius: 18,
                        padding: 18,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 14,
                        boxShadow: '0 6px 20px rgba(11, 18, 24, 0.04)',
                      }}
                    >
                      <div>
                        {/* Cabeçalho do Motorista */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            marginBottom: 14,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                            {drv.photo ? (
                              <img
                                src={drv.photo}
                                alt={drv.name}
                                style={{
                                  width: 50,
                                  height: 50,
                                  borderRadius: '50%',
                                  objectFit: 'cover',
                                  border: drv.isOnline ? '2.5px solid #76D800' : '2px solid #CBD5E1',
                                  flexShrink: 0,
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: 50,
                                  height: 50,
                                  borderRadius: '50%',
                                  backgroundColor: '#121A21',
                                  color: '#76D800',
                                  fontWeight: 800,
                                  fontSize: '1.15rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  border: drv.isOnline ? '2.5px solid #76D800' : '2px solid #334155',
                                  flexShrink: 0,
                                }}
                              >
                                {drv.name.charAt(0).toUpperCase()}
                              </div>
                            )}

                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: '1.02rem',
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
                                  gap: 8,
                                  fontSize: '0.78rem',
                                  color: '#475569',
                                  marginTop: 2,
                                }}
                              >
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 700, color: '#0B1218' }}>
                                  <Star size={13} color="#F59E0B" fill="#F59E0B" />
                                  {drv.rating.toFixed(2)}
                                </span>
                                {drv.city && <span>• {drv.city}</span>}
                              </div>
                            </div>
                          </div>

                          <span
                            style={{
                              padding: '4px 9px',
                              borderRadius: 999,
                              backgroundColor: drv.isOnline ? '#DCFCE7' : '#F1F5F9',
                              color: drv.isOnline ? '#166534' : '#475569',
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              flexShrink: 0,
                            }}
                          >
                            {drv.isOnline ? <Radio size={11} /> : <CheckCircle2 size={11} />}
                            <span>{drv.isOnline ? 'Online' : 'Aprovado'}</span>
                          </span>
                        </div>

                        {/* Preview Visual do Veículo + Placa */}
                        <div style={{ marginBottom: 12 }}>
                          <VehiclePhotoPreview
                            photoUrl={drv.vehiclePhoto}
                            brand={drv.vehicleBrand}
                            model={[drv.vehicleModel, drv.vehicleVersion].filter(Boolean).join(' ')}
                            colorName={drv.vehicleColor}
                            plate={drv.vehiclePlate}
                            category={drv.vehicleCategory}
                            year={drv.vehicleYear}
                            size="compact"
                            showPlate={Boolean(drv.vehiclePlate)}
                          />
                        </div>

                        {/* Badges de Conformidade */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '4px 9px',
                              borderRadius: 8,
                              backgroundColor: drv.kycVerified ? '#ECFDF5' : '#F8FAFC',
                              border: `1px solid ${drv.kycVerified ? '#A7F3D0' : '#E2E8F0'}`,
                              color: drv.kycVerified ? '#065F46' : '#475569',
                            }}
                          >
                            {drv.kycVerified ? '✓ KYC & Biometria OK' : 'Cadastro Verificado'}
                          </span>
                          {drv.termsAccepted && (
                            <span
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                padding: '4px 9px',
                                borderRadius: 8,
                                backgroundColor: '#F2F6F3',
                                border: '1px solid #DCE5DF',
                                color: '#1E293B',
                              }}
                            >
                              ✓ Termo Assinado
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.45 }}>
                          {drv.bio?.trim() || `${vehicleLabel} inspecionado para viagens Kavro Drive.`}
                        </div>
                      </div>

                      {/* Rodapé de Métricas + Ação */}
                      <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 12 }}>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: 8,
                            marginBottom: 12,
                          }}
                        >
                          <div style={{ backgroundColor: '#F8FAFC', borderRadius: 10, padding: '8px 10px' }}>
                            <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>
                              Corridas Concluídas
                            </div>
                            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0B1218' }}>
                              {drv.completedRidesCount}
                            </div>
                          </div>
                          <div style={{ backgroundColor: '#F8FAFC', borderRadius: 10, padding: '8px 10px' }}>
                            <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>
                              KM Auditados
                            </div>
                            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#16A34A' }}>
                              {drv.auditedKm} km
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedDriver(drv)}
                          style={{
                            width: '100%',
                            height: 40,
                            borderRadius: 10,
                            border: 'none',
                            backgroundColor: '#121A21',
                            color: '#76D800',
                            fontSize: '0.84rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                          }}
                        >
                          <span>Ver ficha &amp; corridas</span>
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── ABA 2: REGISTRO PÚBLICO DE CORRIDAS AUDITADAS ─── */}
        {activeTab === 'rides' && (
          <div>
            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #DCE5DF',
                borderRadius: 16,
                padding: isMobile ? 14 : 18,
                marginBottom: 20,
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1.4fr 0.8fr',
                gap: 12,
              }}
            >
              <div style={{ position: 'relative' }}>
                <Search
                  size={17}
                  color="#64748B"
                  style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)' }}
                />
                <input
                  type="text"
                  value={rideSearch}
                  onChange={(e) => setRideSearch(e.target.value)}
                  placeholder="Pesquisar por código #UP, rua, bairro, motorista ou placa..."
                  style={{
                    width: '100%',
                    height: 42,
                    paddingLeft: 40,
                    paddingRight: 14,
                    borderRadius: 10,
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#F8FAFC',
                    color: '#0B1218',
                    fontSize: '0.9rem',
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
                  height: 42,
                  padding: '0 12px',
                  borderRadius: 10,
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#F8FAFC',
                  color: '#0B1218',
                  fontSize: '0.88rem',
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
                  borderRadius: 18,
                  padding: '44px 20px',
                  textAlign: 'center',
                }}
              >
                <FileCheck2 size={36} color="#94A3B8" style={{ margin: '0 auto 12px', display: 'block' }} />
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0B1218', marginBottom: 6 }}>
                  Nenhuma corrida finalizada encontrada
                </div>
                <div style={{ fontSize: '0.88rem', color: '#64748B', maxWidth: 460, margin: '0 auto' }}>
                  Assim que os motoristas da plataforma concluírem viagens, os registros anonimizados
                  serão publicados automaticamente nesta auditoria.
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
                  gap: 14,
                }}
              >
                {filteredRides.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #DCE5DF',
                      borderRadius: 16,
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
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
                            padding: '4px 10px',
                            borderRadius: 8,
                            backgroundColor: '#121A21',
                            color: '#76D800',
                            fontSize: '0.76rem',
                            fontWeight: 800,
                          }}
                        >
                          {r.rideCode}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: '#475569', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={12} /> {r.date} • {r.time}
                        </span>
                      </div>

                      <span
                        style={{
                          padding: '3px 9px',
                          borderRadius: 999,
                          backgroundColor: '#DCFCE7',
                          color: '#166534',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                        }}
                      >
                        ✓ Auditada
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: '#0B1218' }}>
                        <MapPin size={15} color="#16A34A" style={{ flexShrink: 0, marginTop: 2 }} />
                        <span>
                          <strong>Partida:</strong> {r.originAddress}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: '#334155' }}>
                        <Navigation size={15} color="#0B1218" style={{ flexShrink: 0, marginTop: 2 }} />
                        <span>
                          <strong>Destino:</strong> {r.destinationAddress}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        backgroundColor: '#F8FAFC',
                        borderRadius: 10,
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 8,
                        fontSize: '0.78rem',
                        color: '#334155',
                      }}
                    >
                      <div>
                        <strong>Motorista:</strong> {r.driverName}
                        {r.driverPlate ? ` (${r.driverPlate})` : ''}
                      </div>
                      <div>
                        <strong>Passageiro (LGPD):</strong> {r.passengerMasked} •{' '}
                        <strong>{r.distanceKm} km</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── ABA 3: PROTOCOLOS KYC & LGPD ─── */}
        {activeTab === 'protocols' && (
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
                gap: 18,
                marginBottom: 24,
              }}
            >
              {[
                {
                  icon: <ShieldCheck size={24} color="#76D800" />,
                  title: '1. Verificação Biométrica Facial & CNH (KYC)',
                  desc: 'Todo motorista parceiro passa por conferência entre a CNH enviada e a selfie biométrica antes da liberação para corridas.',
                },
                {
                  icon: <Car size={24} color="#76D800" />,
                  title: '2. Registro Veicular & Placa Mercosul',
                  desc: 'Marca, modelo, ano, cor, ar-condicionado e placa oficial são vinculados à conta do motorista e exibidos ao passageiro antes do embarque.',
                },
                {
                  icon: <FileCheck2 size={24} color="#76D800" />,
                  title: '3. Assinatura Eletrônica de Termos',
                  desc: 'Cada parceiro e passageiro assina digitalmente os termos operacionais da Kavro Drive com código de autenticidade exclusivo.',
                },
                {
                  icon: <Lock size={24} color="#76D800" />,
                  title: '4. Anonimização Pública LGPD',
                  desc: 'Na auditoria pública, nomes completos de passageiros, documentos CPF/CNH e dados bancários são protegidos — preservando apenas prova de transparência.',
                },
              ].map((card) => (
                <div
                  key={card.title}
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #DCE5DF',
                    borderRadius: 18,
                    padding: 22,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 12,
                      backgroundColor: '#121A21',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {card.icon}
                  </div>
                  <h3 style={{ fontSize: '1.08rem', fontWeight: 800, color: '#0B1218' }}>{card.title}</h3>
                  <p style={{ fontSize: '0.9rem', lineHeight: 1.55, color: '#475569' }}>{card.desc}</p>
                </div>
              ))}
            </div>

            <div
              style={{
                backgroundColor: '#121A21',
                color: '#FFFFFF',
                borderRadius: 20,
                padding: isMobile ? 22 : 30,
                border: '1px solid rgba(118, 216, 0, 0.25)',
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'flex-start' : 'center',
                justifyContent: 'space-between',
                gap: 18,
              }}
            >
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 6 }}>
                  Quer fazer parte da frota verificada Kavro Drive?
                </h3>
                <p style={{ fontSize: '0.9rem', color: '#CBD5E1' }}>
                  Cadastre seu veículo no Portal do Motorista ou solicite sua próxima viagem como passageiro.
                </p>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => navigate('/kavro-drive')}
                  style={{
                    height: 44,
                    padding: '0 18px',
                    borderRadius: 10,
                    border: 'none',
                    backgroundColor: '#76D800',
                    color: '#0B1218',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Portal do Motorista
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/cliente')}
                  style={{
                    height: 44,
                    padding: '0 18px',
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.2)',
                    backgroundColor: '#0B1218',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Pedir viagem
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ═══ MODAL INDIVIDUAL DO MOTORISTA SELECIONADO ═══ */}
      {selectedDriver && (
        <div
          onClick={() => setSelectedDriver(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(11, 18, 24, 0.72)',
            backdropFilter: 'blur(5px)',
            zIndex: 220,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: isMobile ? 12 : 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 680,
              maxHeight: '88vh',
              backgroundColor: '#FFFFFF',
              borderRadius: 20,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
            }}
          >
            {/* Header Modal Ficha Motorista */}
            <div
              style={{
                backgroundColor: '#121A21',
                color: '#FFFFFF',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                borderBottom: '1px solid rgba(118, 216, 0, 0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <ShieldCheck size={20} color="#76D800" />
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8CE826' }}>
                    FICHA INDIVIDUAL AUDITADA
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800 }}>{selectedDriver.name}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDriver(null)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  border: 'none',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Veículo + Placa + Status */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  backgroundColor: '#F2F6F3',
                  border: '1px solid #DCE5DF',
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16A34A', marginBottom: 2 }}>
                    VEÍCULO VINCULADO À OPERAÇÃO
                  </div>
                  <div style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0B1218' }}>
                    {[selectedDriver.vehicleBrand, selectedDriver.vehicleModel, selectedDriver.vehicleYear]
                      .filter(Boolean)
                      .join(' ') || 'Veículo Kavro Drive'}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#475569' }}>
                    Cor: {selectedDriver.vehicleColor || 'Não informada'} • Nota ★{' '}
                    {selectedDriver.rating.toFixed(2)}
                  </div>
                </div>
                {selectedDriver.vehiclePlate && (
                  <MercosulPlateBadge plate={selectedDriver.vehiclePlate} size="md" />
                )}
              </div>

              {/* Selos KYC & Termo */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                  gap: 10,
                }}
              >
                <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 700 }}>
                    Biometria Facial &amp; CNH
                  </div>
                  <div style={{ fontSize: '0.92rem', fontWeight: 800, color: selectedDriver.kycVerified ? '#16A34A' : '#0B1218' }}>
                    {selectedDriver.kycVerified ? 'Verificada e Aprovada' : 'Validada pelo Cadastro'}
                  </div>
                </div>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 700 }}>
                    Contrato Digital Kavro
                  </div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0B1218' }}>
                    {selectedDriver.termsSignatureCode || (selectedDriver.termsAccepted ? 'Assinado eletronicamente' : 'Ativo')}
                  </div>
                </div>
              </div>

              {/* Corridas do Motorista */}
              <div>
                <div
                  style={{
                    fontSize: '0.95rem',
                    fontWeight: 800,
                    color: '#0B1218',
                    marginBottom: 10,
                  }}
                >
                  Corridas Finalizadas deste Motorista ({selectedDriverRides.length})
                </div>

                {selectedDriverRides.length === 0 ? (
                  <div
                    style={{
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: 12,
                      padding: 18,
                      fontSize: '0.86rem',
                      color: '#64748B',
                      textAlign: 'center',
                    }}
                  >
                    Nenhuma corrida finalizada atribuída a este motorista no registro público atual.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {selectedDriverRides.map((r) => (
                      <div
                        key={r.id}
                        style={{
                          border: '1px solid #E2E8F0',
                          borderRadius: 12,
                          padding: 12,
                          fontSize: '0.82rem',
                          backgroundColor: '#F8FAFC',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <strong style={{ color: '#0B1218' }}>{r.rideCode}</strong>
                          <span style={{ color: '#64748B' }}>
                            {r.date} • {r.time} • {r.distanceKm} km
                          </span>
                        </div>
                        <div style={{ color: '#334155', marginBottom: 2 }}>
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
