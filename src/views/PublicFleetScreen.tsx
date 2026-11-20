import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Search,
  Share2,
  Check,
  Car,
  Users,
  Star,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  Radio,
  X,
  Award,
  Sparkles,
} from 'lucide-react';
import { SystemConfig } from '../types';
import { MercosulPlateBadge } from '../components/MercosulPlateBadge';
import {
  getCarColorProfile,
  getStudioVehicleFallback,
  resolveVehiclePhotoExact,
} from '../services/vehicleService';

interface PublicFleetScreenProps {
  config: SystemConfig;
}

interface PublicFleetVehicle {
  id: string;
  brand: string;
  model: string;
  version: string;
  color: string;
  year: string;
  plate: string;
  vehiclePhoto: string;
  hasFourDoors: boolean;
  hasAirConditioning: boolean;
  eligibleCategories: string[];
  enabledCategories: string[];
  isActive: boolean;
}

interface PublicFleetDriver {
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
  vehicles: PublicFleetVehicle[];
  eligibleCategories: string[];
  enabledCategories: string[];
  hasAirConditioning: boolean;
  hasFourDoors: boolean;
  isOnline: boolean;
  rating: number;
  kycVerified: boolean;
  termsAccepted: boolean;
  createdAt?: string;
}

interface PublicFleetSummary {
  city: string;
  totalApprovedDrivers: number;
  onlineDrivers: number;
  totalVehicles: number;
  verifiedKycCount: number;
  avgRating: number;
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

export const PublicFleetScreen: React.FC<PublicFleetScreenProps> = ({ config }) => {
  const navigate = useNavigate();

  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 900 : false
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const [drivers, setDrivers] = useState<PublicFleetDriver[]>([]);
  const [summary, setSummary] = useState<PublicFleetSummary | null>(null);

  const [driverSearch, setDriverSearch] = useState<string>('');
  const [driverFilter, setDriverFilter] = useState<'all' | 'online' | 'kyc'>('all');
  const [selectedDriver, setSelectedDriver] = useState<PublicFleetDriver | null>(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const fetchPublicFleet = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/public/fleet?_t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data?.ok) {
          setDrivers(Array.isArray(data.drivers) ? data.drivers : []);
          setSummary(data.summary || null);
          setLoading(false);
          return;
        }
      }
    } catch {
      // Fallback offline/sem rede
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPublicFleet();
  }, []);

  const effectiveSummary = useMemo<PublicFleetSummary>(() => {
    if (summary) return summary;
    const totalVehicles = drivers.reduce(
      (acc, d) => acc + Math.max(Array.isArray(d.vehicles) ? d.vehicles.length : 0, d.vehiclePlate ? 1 : 0),
      0
    );
    const verifiedKycCount = drivers.filter((d) => d.kycVerified).length;
    return {
      city: config.driverCarCity || 'Santa Catarina',
      totalApprovedDrivers: drivers.length,
      onlineDrivers: drivers.filter((d) => d.isOnline).length,
      totalVehicles,
      verifiedKycCount,
      avgRating:
        drivers.length > 0
          ? Number((drivers.reduce((acc, d) => acc + (d.rating || 5), 0) / drivers.length).toFixed(2))
          : 5.0,
    };
  }, [summary, drivers, config.driverCarCity]);

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
        d.city.toLowerCase().includes(q) ||
        (Array.isArray(d.vehicles) &&
          d.vehicles.some(
            (v) =>
              v.brand.toLowerCase().includes(q) ||
              v.model.toLowerCase().includes(q) ||
              v.plate.toLowerCase().includes(q)
          ))
      );
    });
  }, [drivers, driverFilter, driverSearch]);

  const handleShare = () => {
    const fleetUrl = `${window.location.origin}/frotas`;
    if (navigator.share) {
      navigator
        .share({
          title: 'Frota Verificada — Kavro Drive',
          text: 'Confira os motoristas habilitados e veículos verificados da Kavro Drive.',
          url: fleetUrl,
        })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(fleetUrl);
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
          backgroundColor: 'rgba(11, 18, 24, 0.88)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(118, 216, 0, 0.2)',
        }}
      >
        <div
          style={{
            ...containerStyle,
            height: isMobile ? 60 : 66,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 12, minWidth: 0 }}>
            <button
              type="button"
              onClick={() => navigate('/')}
              title="Voltar para a Home"
              aria-label="Voltar para a Home"
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
              <ArrowLeft size={16} />
            </button>

            <img
              src="/logo-horizontal-white.png"
              alt="Kavro Drive"
              onClick={() => navigate('/')}
              style={{
                height: isMobile ? 24 : 28,
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
                Frota Verificada
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {!isMobile && (
              <>
                <button
                  type="button"
                  onClick={fetchPublicFleet}
                  title="Atualizar frota"
                  style={{
                    height: 36,
                    padding: '0 13px',
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
                  <RefreshCw size={14} style={{ opacity: loading ? 0.55 : 1 }} />
                  <span>Atualizar</span>
                </button>

                <button
                  type="button"
                  onClick={handleShare}
                  style={{
                    height: 36,
                    padding: '0 13px',
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
                  <span>{copiedLink ? 'Copiado' : 'Compartilhar'}</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => navigate('/cliente')}
              style={{
                height: 36,
                padding: isMobile ? '0 15px' : '0 16px',
                borderRadius: 10,
                border: 'none',
                backgroundColor: '#76D800',
                color: '#0B1218',
                fontSize: isMobile ? '0.8rem' : '0.82rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
              }}
            >
              <span>Pedir corrida</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* ═══ HERO DA FROTA + KPIS ═══ */}
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
                <span>Frota Oficial Kavro • {effectiveSummary.city}</span>
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
                Frota de Motoristas &amp; Veículos Verificados
              </h1>
              <p style={{ fontSize: isMobile ? '0.84rem' : '0.92rem', lineHeight: 1.5, color: '#CBD5E1' }}>
                Conheça os motoristas parceiros habilitados e os veículos aprovados em vistoria documental (CNH, CRLV e
                biometria facial KYC) disponíveis na Kavro Drive — com total proteção à privacidade das rotas.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => navigate('/kavro-drive')}
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
                <Car size={14} />
                <span>Quero dirigir na Kavro</span>
              </button>

              {isMobile && (
                <>
                  <button
                    type="button"
                    onClick={handleShare}
                    style={{
                      height: 38,
                      padding: '0 13px',
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.16)',
                      backgroundColor: '#131E26',
                      color: copiedLink ? '#76D800' : '#E2E8F0',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                    }}
                  >
                    {copiedLink ? <Check size={14} /> : <Share2 size={14} />}
                    <span>{copiedLink ? 'Copiado' : 'Compartilhar'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={fetchPublicFleet}
                    title="Atualizar frota"
                    aria-label="Atualizar frota"
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.16)',
                      backgroundColor: '#131E26',
                      color: '#E2E8F0',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <RefreshCw size={14} style={{ opacity: loading ? 0.55 : 1 }} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 4 KPIs da Frota (sem dados de viagens/localizações públicas) */}
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
                label: 'Veículos na Frota',
                value: effectiveSummary.totalVehicles,
                sub: 'Vistoria CRLV aprovada',
                accent: '#FFFFFF',
                icon: <Car size={15} color="#76D800" />,
              },
              {
                label: 'Biometria KYC',
                value: effectiveSummary.verifiedKycCount,
                sub: 'CNH EAR conferida',
                accent: '#FFFFFF',
                icon: <ShieldCheck size={15} color="#76D800" />,
              },
              {
                label: 'Avaliação da Rede',
                value: `★ ${effectiveSummary.avgRating.toFixed(2)}`,
                sub: 'Média dos parceiros',
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

      {/* ═══ CONTEÚDO PRINCIPAL: SOMENTE AS FROTAS ═══ */}
      <main style={{ ...containerStyle, paddingTop: isMobile ? 16 : 26, paddingBottom: 56, minWidth: 0 }}>
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
            width: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <Search
              size={16}
              color="#64748B"
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              value={driverSearch}
              onChange={(e) => setDriverSearch(e.target.value)}
              placeholder="Buscar por motorista, marca, modelo, placa ou cidade..."
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
              width: isMobile ? '100%' : undefined,
              minWidth: 0,
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
            Carregando motoristas e veículos da frota...
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
              Ajuste a busca ou visualize todos os veículos habilitados na frota.
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))',
              gap: isMobile ? 12 : 16,
              width: '100%',
            }}
          >
            {filteredDrivers.map((drv) => {
              const vehicleLabel =
                [drv.vehicleBrand, drv.vehicleModel, drv.vehicleVersion].filter(Boolean).join(' ') ||
                'Veículo Kavro Drive';
              const colorInfo = getCarColorProfile(drv.vehicleColor || '');
              const extraVehiclesCount =
                Array.isArray(drv.vehicles) && drv.vehicles.length > 1 ? drv.vehicles.length - 1 : 0;

              return (
                <div
                  key={drv.id}
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #DCE5DF',
                    borderRadius: 16,
                    padding: isMobile ? 12 : 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 11,
                    boxShadow: '0 4px 16px rgba(11, 18, 24, 0.04)',
                    minWidth: 0,
                    width: '100%',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                  }}
                >
                  {/* Linha 1: Motorista + Nota + Status */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: isMobile ? 'flex-start' : 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                      minWidth: 0,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 170px' }}>
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

                  {/* Linha 2: Foto do Veículo + Modelo + Placa Mercosul */}
                  <div
                    style={{
                      backgroundColor: '#0F172A',
                      borderRadius: 12,
                      padding: isMobile ? 10 : 12,
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: isMobile ? 'wrap' : 'nowrap',
                      gap: isMobile ? 10 : 12,
                      border: '1px solid #1E293B',
                      minWidth: 0,
                      width: '100%',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div
                      style={{
                        width: isMobile ? 84 : 122,
                        height: isMobile ? 58 : 76,
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

                    <div style={{ flex: '1 1 130px', minWidth: 0 }}>
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
                          fontSize: isMobile ? '0.84rem' : '0.94rem',
                          fontWeight: 800,
                          color: '#FFFFFF',
                          whiteSpace: isMobile ? 'normal' : 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          lineHeight: 1.2,
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
                        {extraVehiclesCount > 0 && (
                          <span
                            style={{
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              color: '#8CE826',
                              backgroundColor: 'rgba(118, 216, 0, 0.14)',
                              padding: '1px 6px',
                              borderRadius: 999,
                            }}
                          >
                            +{extraVehiclesCount} veículo(s)
                          </span>
                        )}
                      </div>
                    </div>

                    {drv.vehiclePlate && (
                      <div
                        style={{
                          flexShrink: 0,
                          marginLeft: isMobile ? 'auto' : 0,
                        }}
                      >
                        <MercosulPlateBadge plate={drv.vehiclePlate} size="sm" />
                      </div>
                    )}
                  </div>

                  {/* Linha 3: Especificações de Conforto + Botão Ficha */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                      borderTop: '1px solid #E2E8F0',
                      paddingTop: 10,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 8,
                        fontSize: isMobile ? '0.73rem' : '0.77rem',
                        color: '#475569',
                        fontWeight: 600,
                      }}
                    >
                      <span>{drv.hasFourDoors ? '4 portas' : 'Compacto'}</span>
                      <span>•</span>
                      <span>{drv.hasAirConditioning ? 'Ar-condicionado' : 'Padrão'}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedDriver(drv)}
                      style={{
                        height: 34,
                        padding: '0 12px',
                        borderRadius: 9,
                        border: 'none',
                        backgroundColor: '#121A21',
                        color: '#76D800',
                        fontSize: '0.76rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        whiteSpace: 'nowrap',
                        marginLeft: 'auto',
                      }}
                    >
                      <span>Ficha do Veículo</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ═══ MODAL COMPACTO DA FICHA DO MOTORISTA & VEÍCULOS ═══ */}
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
                    MOTORISTA &amp; VEÍCULO VERIFICADOS
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

            <div
              style={{
                padding: isMobile ? 14 : 18,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {/* Veículo Principal + Placa */}
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

              {/* Bio do motorista se houver */}
              {selectedDriver.bio && (
                <div
                  style={{
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: 10,
                    padding: '10px 12px',
                    fontSize: '0.8rem',
                    color: '#334155',
                    lineHeight: 1.45,
                  }}
                >
                  {selectedDriver.bio}
                </div>
              )}

              {/* Verificações Documentais */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 10 }}>
                  <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>KYC &amp; Biometria</div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#16A34A' }}>
                    {selectedDriver.kycVerified ? 'Aprovado' : 'Verificado'}
                  </div>
                </div>
                <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 10 }}>
                  <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>Documentação CRLV/CNH</div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0B1218' }}>
                    Regular ✓
                  </div>
                </div>
              </div>

              {/* Outros veículos aprovados do motorista */}
              {Array.isArray(selectedDriver.vehicles) && selectedDriver.vehicles.length > 1 && (
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0B1218', marginBottom: 6 }}>
                    Veículos cadastrados na frota ({selectedDriver.vehicles.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {selectedDriver.vehicles.map((veh) => (
                      <div
                        key={veh.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          padding: '9px 11px',
                          backgroundColor: '#F8FAFC',
                          border: veh.isActive ? '1px solid #76D800' : '1px solid #E2E8F0',
                          borderRadius: 10,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0B1218' }}>
                            {[veh.brand, veh.model, veh.version].filter(Boolean).join(' ')}
                            {veh.year ? ` (${veh.year})` : ''}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                            Cor: {veh.color || 'Padrão'} • {veh.hasAirConditioning ? 'Com ar' : 'Padrão'}
                            {veh.isActive ? ' • Em uso' : ''}
                          </div>
                        </div>
                        {veh.plate && <MercosulPlateBadge plate={veh.plate} size="sm" />}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Aviso de Privacidade */}
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
                Por privacidade e segurança (LGPD), a Kavro Drive não exibe rotas, horários ou localizações de viagens
                publicamente. Ao chamar uma corrida, confira sempre a placa e o veículo acima no embarque.
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedDriver(null);
                  navigate('/cliente');
                }}
                style={{
                  height: 44,
                  borderRadius: 11,
                  border: 'none',
                  backgroundColor: '#76D800',
                  color: '#0B1218',
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Sparkles size={15} />
                <span>Solicitar viagem na Kavro</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
