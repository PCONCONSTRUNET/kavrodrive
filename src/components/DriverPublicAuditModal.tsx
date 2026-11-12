import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X, ShieldCheck, CheckCircle2, Phone, MapPin, Calendar,
  Clock, Car, Award, Search, Share2, Check, User
} from 'lucide-react';
import { Ride, SystemConfig } from '../types';
import { WhatsAppIcon } from './WhatsAppIcon';
import { VehiclePhotoPreview } from './VehiclePhotoPreview';
import { formatPhone, formatRideCode, getCleanWhatsappNumber } from '../utils/format';

interface DriverPublicAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SystemConfig;
  rides: Ride[];
  isAdminView?: boolean;
}

// Mascara o sobrenome do passageiro na auditoria pública para proteger a LGPD mantendo a transparência
function maskClientNameForAudit(fullName: string, isAdminView?: boolean): string {
  if (!fullName) return 'Passageiro Verificado';
  if (isAdminView) return fullName;
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return `${parts[0].slice(0, 3)}•••`;
  }
  const first = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${first} ${lastInitial}. •••`;
}

export const DriverPublicAuditModal: React.FC<DriverPublicAuditModalProps> = ({
  isOpen,
  onClose,
  config,
  rides,
  isAdminView = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedAuditLink, setCopiedAuditLink] = useState(false);

  const driverName = config.driverName?.trim() || 'Alisson Santos';
  const driverPhone = config.driverPhone?.trim() || config.companyPhone || '(48) 99691-5303';
  const driverPhoto = config.driverPhoto || '';
  const driverVehicle = config.driverVehicle?.trim() || 'Veículo Executivo • Ar-Condicionado';
  const driverPlate = config.driverPlate?.trim() || '';
  const driverBio =
    config.driverBio?.trim() ||
    'Motorista particular verificado com agendamento exclusivo, rastreamento ao vivo e histórico de viagens 100% auditado.';

  const cleanWhatsapp = getCleanWhatsappNumber(driverPhone || config.companyWhatsapp);

  // Corridas finalizadas (auditadas) ordenadas da mais recente para a mais antiga
  const completedRides = useMemo(() => {
    return rides
      .filter((r) => r.status === 'finalizada')
      .sort((a, b) => {
        const dA = `${a.date}T${a.time || '00:00'}`;
        const dB = `${b.date}T${b.time || '00:00'}`;
        return dB.localeCompare(dA);
      });
  }, [rides]);

  const filteredCompletedRides = useMemo(() => {
    if (!searchTerm.trim()) return completedRides;
    const q = searchTerm.toLowerCase();
    return completedRides.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        r.origin.address.toLowerCase().includes(q) ||
        r.destination.address.toLowerCase().includes(q) ||
        r.date.includes(q) ||
        (isAdminView && r.clientName.toLowerCase().includes(q))
    );
  }, [completedRides, searchTerm, isAdminView]);

  const totalCompleted = completedRides.length;
  const totalRegistered = rides.filter((r) => r.status !== 'cancelada').length;
  const totalKm = useMemo(
    () => completedRides.reduce((acc, r) => acc + (Number(r.distanceKm) || 0), 0),
    [completedRides]
  );
  const totalPassengersServed = useMemo(
    () => completedRides.reduce((acc, r) => acc + (Number(r.passengers) || 1), 0),
    [completedRides]
  );

  const handleShareAudit = () => {
    const auditUrl = `${window.location.origin}/auditoria`;
    if (navigator.share) {
      navigator
        .share({
          title: `Perfil & Auditoria de Segurança - ${driverName} (Kavro Drive)`,
          text: `Confira o perfil verificado e o histórico auditado de corridas realizadas por ${driverName} na Kavro Drive.`,
          url: auditUrl,
        })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(auditUrl);
      setCopiedAuditLink(true);
      setTimeout(() => setCopiedAuditLink(false), 2500);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '14px',
        boxSizing: 'border-box',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 460,
          maxHeight: '86vh',
          backgroundColor: '#F8FAFC',
          borderRadius: 20,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
          border: '1px solid #E2E8F0',
        }}
      >
        {/* ── HEADER FIXO ESCURO COM SELO DE AUDITORIA ── */}
        <div
          style={{
            backgroundColor: '#121A21',
            color: '#FFFFFF',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #1E293B',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                backgroundColor: 'rgba(118, 216, 0, 0.16)',
                border: '1px solid rgba(118, 216, 0, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#76D800',
              }}
            >
              <ShieldCheck size={16} />
            </div>
            <div>
              <div
                style={{
                  fontSize: '0.6rem',
                  fontWeight: 800,
                  color: '#76D800',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Transparência & Segurança
              </div>
              <div style={{ fontSize: '0.88rem', fontWeight: 900 }}>
                Perfil & Auditoria Pública
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={handleShareAudit}
              title="Compartilhar Auditoria"
              style={{
                height: 28,
                padding: '0 9px',
                borderRadius: 999,
                backgroundColor: copiedAuditLink ? '#76D800' : 'rgba(255,255,255,0.1)',
                color: copiedAuditLink ? '#121A21' : '#FFFFFF',
                border: 'none',
                fontSize: '0.68rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer',
              }}
            >
              {copiedAuditLink ? <Check size={12} /> : <Share2 size={12} />}
              <span>{copiedAuditLink ? 'Copiado!' : 'Compartilhar'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                backgroundColor: 'rgba(255,255,255,0.1)',
                border: 'none',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── CORPO ROLÁVEL ── */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            padding: '12px 12px 20px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {/* CARD 1: IDENTIFICAÇÃO OFICIAL DO MOTORISTA */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 14,
              padding: '12px 14px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Foto ou Avatar do Motorista */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {driverPhoto ? (
                  <img
                    src={driverPhoto}
                    alt={driverName}
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid #76D800',
                      boxShadow: '0 2px 8px rgba(118, 216, 0, 0.25)',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: '50%',
                      backgroundColor: '#121A21',
                      color: '#76D800',
                      border: '2px solid #76D800',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.3rem',
                      fontWeight: 900,
                    }}
                  >
                    {driverName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div
                  title="Motorista Verificado"
                  style={{
                    position: 'absolute',
                    bottom: -2,
                    right: -2,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    backgroundColor: '#16A34A',
                    color: '#FFFFFF',
                    border: '1.5px solid #FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Check size={10} strokeWidth={3} />
                </div>
              </div>

              {/* Dados Principais */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <h2
                    style={{
                      fontSize: '1rem',
                      fontWeight: 900,
                      color: '#0F172A',
                      margin: 0,
                      lineHeight: 1.2,
                    }}
                  >
                    {driverName}
                  </h2>
                  <span
                    style={{
                      backgroundColor: '#DCFCE7',
                      color: '#15803D',
                      fontSize: '0.6rem',
                      fontWeight: 800,
                      padding: '2px 6px',
                      borderRadius: 999,
                      textTransform: 'uppercase',
                    }}
                  >
                    ✓ Verificado
                  </span>
                </div>

                <div
                  style={{
                    fontSize: '0.74rem',
                    color: '#475569',
                    fontWeight: 700,
                    marginTop: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Phone size={12} color="#16A34A" />
                  <span>{formatPhone(driverPhone)}</span>
                </div>

                <div
                  style={{
                    fontSize: '0.7rem',
                    color: '#64748B',
                    fontWeight: 600,
                    marginTop: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Car size={12} color="#64748B" />
                  <span>
                    {driverVehicle}
                    {driverPlate ? ` • ${driverPlate.toUpperCase()}` : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Bio / Credencial de Segurança */}
            <p
              style={{
                fontSize: '0.72rem',
                color: '#475569',
                backgroundColor: '#F8FAFC',
                padding: '7px 10px',
                borderRadius: 8,
                border: '1px solid #E2E8F0',
                margin: '8px 0 8px 0',
                lineHeight: 1.35,
              }}
            >
              🛡️ {driverBio}
            </p>

            {/* Botões de Contato Direto com o Motorista */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <a
                href={`https://wa.me/${cleanWhatsapp}?text=Ol%C3%A1%20${encodeURIComponent(driverName)},%20vi%20seu%20perfil%20verificado%20na%20UP%20Mobilidade!`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  height: 34,
                  borderRadius: 8,
                  backgroundColor: '#DCFCE7',
                  border: '1px solid #86EFAC',
                  color: '#15803D',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  textDecoration: 'none',
                }}
              >
                <WhatsAppIcon size={14} />
                <span>WhatsApp</span>
              </a>

              <a
                href={`tel:${driverPhone.replace(/\D/g, '')}`}
                style={{
                  height: 34,
                  borderRadius: 8,
                  backgroundColor: '#121A21',
                  color: '#FFFFFF',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  textDecoration: 'none',
                }}
              >
                <Phone size={13} color="#76D800" />
                <span>Ligar</span>
              </a>
            </div>
          </div>

          {/* CARD 1.5: FICHA OFICIAL DO VEÍCULO CADASTRADO (TRANSPARÊNCIA TOTAL) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Veículo Oficial da Operação
              </span>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#16A34A', display: 'flex', alignItems: 'center', gap: 3 }}>
                <CheckCircle2 size={12} />
                Vistoriado & Conforto
              </span>
            </div>
            <VehiclePhotoPreview
              photoUrl={config.driverCarPhoto}
              brand={config.driverCarBrand}
              model={config.driverCarModel}
              colorName={config.driverCarColor}
              plate={config.driverPlate}
              category={config.driverCarCategory || 'Sedan Executivo'}
              year={config.driverCarYear}
              size="normal"
              showPlate={Boolean(config.driverPlate?.trim())}
            />
          </div>

          {/* CARD 2: MÉTRICAS AUDITADAS DE SEGURANÇA & EXPERIÊNCIA */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 6,
            }}
          >
            <div
              style={{
                backgroundColor: '#121A21',
                color: '#FFFFFF',
                borderRadius: 12,
                padding: '8px 4px',
                textAlign: 'center',
                border: '1px solid #2C3E50',
              }}
            >
              <div style={{ fontSize: '0.55rem', color: '#94A3B8', fontWeight: 800, textTransform: 'uppercase' }}>
                Finalizadas
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#76D800', marginTop: 1 }}>
                {totalCompleted}
              </div>
              <div style={{ fontSize: '0.55rem', color: '#CBD5E1' }}>Auditadas</div>
            </div>

            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 12,
                padding: '8px 4px',
                textAlign: 'center',
                border: '1px solid #E2E8F0',
              }}
            >
              <div style={{ fontSize: '0.55rem', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>
                Registradas
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0F172A', marginTop: 1 }}>
                {totalRegistered}
              </div>
              <div style={{ fontSize: '0.55rem', color: '#64748B' }}>No sistema</div>
            </div>

            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 12,
                padding: '8px 4px',
                textAlign: 'center',
                border: '1px solid #E2E8F0',
              }}
            >
              <div style={{ fontSize: '0.55rem', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>
                KM Rodados
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0F172A', marginTop: 1 }}>
                {totalKm.toFixed(0)}
              </div>
              <div style={{ fontSize: '0.55rem', color: '#64748B' }}>km seguros</div>
            </div>

            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 12,
                padding: '8px 4px',
                textAlign: 'center',
                border: '1px solid #E2E8F0',
              }}
            >
              <div style={{ fontSize: '0.55rem', color: '#64748B', fontWeight: 800, textTransform: 'uppercase' }}>
                Passageiros
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#16A34A', marginTop: 1 }}>
                {totalPassengersServed}
              </div>
              <div style={{ fontSize: '0.55rem', color: '#64748B' }}>Atendidos</div>
            </div>
          </div>

          {/* CARD 3: REGISTRO PÚBLICO DE AUDITORIA DE CORRIDAS FINALIZADAS */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 14,
              padding: '12px',
              border: '1px solid #E2E8F0',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Award size={16} color="#16A34A" />
                <div>
                  <h3 style={{ fontSize: '0.84rem', fontWeight: 900, color: '#0F172A', margin: 0 }}>
                    Auditoria de Corridas Concluídas
                  </h3>
                  <p style={{ fontSize: '0.66rem', color: '#64748B', margin: 0 }}>
                    Histórico auditado pelo sistema para segurança
                  </p>
                </div>
              </div>
              <span
                style={{
                  backgroundColor: '#F0FDF4',
                  color: '#15803D',
                  border: '1px solid #BBF7D0',
                  fontSize: '0.64rem',
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: 999,
                  whiteSpace: 'nowrap',
                }}
              >
                {completedRides.length} {completedRides.length === 1 ? 'corrida' : 'corridas'}
              </span>
            </div>

            {/* Busca rápida por código ou bairro/rua */}
            <div style={{ position: 'relative' }}>
              <Search
                size={14}
                color="#94A3B8"
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                placeholder="Pesquisar por #UP, rua ou cidade..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 30px',
                  borderRadius: 8,
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#F8FAFC',
                  fontSize: '0.76rem',
                  color: '#0F172A',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Lista de Corridas Finalizadas Auditadas */}
            {filteredCompletedRides.length === 0 ? (
              <div
                style={{
                  padding: '28px 16px',
                  textAlign: 'center',
                  backgroundColor: '#F8FAFC',
                  borderRadius: 12,
                  border: '1px dashed #CBD5E1',
                  color: '#64748B',
                  fontSize: '0.8rem',
                }}
              >
                {completedRides.length === 0
                  ? 'Nenhuma corrida finalizada registrada até o momento. Assim que o motorista concluir corridas, elas aparecerão automaticamente nesta auditoria pública.'
                  : 'Nenhuma corrida encontrada para esta busca.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredCompletedRides.map((r) => {
                  const formattedDate = r.date ? r.date.split('-').reverse().join('/') : '';
                  return (
                    <div
                      key={r.id}
                      style={{
                        backgroundColor: '#F8FAFC',
                        borderRadius: 12,
                        padding: '10px 12px',
                        border: '1px solid #E2E8F0',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      {/* Topo do item auditado */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            style={{
                              backgroundColor: '#121A21',
                              color: '#76D800',
                              fontSize: '0.66rem',
                              fontWeight: 900,
                              padding: '2px 7px',
                              borderRadius: 6,
                            }}
                          >
                            {formatRideCode(r)}
                          </span>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              backgroundColor: '#DCFCE7',
                              color: '#15803D',
                              fontSize: '0.64rem',
                              fontWeight: 800,
                              padding: '2px 7px',
                              borderRadius: 999,
                            }}
                          >
                            <CheckCircle2 size={11} />
                            <span>Concluída & Auditada</span>
                          </span>
                        </div>

                        <div
                          style={{
                            fontSize: '0.68rem',
                            color: '#64748B',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Calendar size={11} />
                          <span>
                            {formattedDate} • {r.time}
                          </span>
                        </div>
                      </div>

                      {/* Trajeto Origem -> Destino */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: '0.75rem' }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            color: '#334155',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              backgroundColor: '#76D800',
                              flexShrink: 0,
                            }}
                          />
                          <strong style={{ color: '#0F172A' }}>Partida:</strong>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.origin.address}</span>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            color: '#334155',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          <MapPin size={11} color="#0F172A" style={{ flexShrink: 0 }} />
                          <strong style={{ color: '#0F172A' }}>Destino:</strong>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.destination.address}</span>
                        </div>
                      </div>

                      {/* Rodapé do item: Passageiro (mascarado no público), Distância e Duração */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderTop: '1px solid #E2E8F0',
                          paddingTop: 5,
                          fontSize: '0.68rem',
                          color: '#64748B',
                          fontWeight: 600,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <User size={11} color="#64748B" />
                          <span>Passageiro: {maskClientNameForAudit(r.clientName, isAdminView)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>📍 {r.distanceKm} km</span>
                          <span>
                            <Clock size={10} style={{ display: 'inline', marginRight: 2 }} />
                            ~{r.durationMin} min
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

