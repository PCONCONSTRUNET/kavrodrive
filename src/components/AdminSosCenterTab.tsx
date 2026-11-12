import React, { useState, useEffect } from 'react';
import {
  ShieldAlert, MapPin, Phone, Car, User, ExternalLink, Copy, CheckCircle2,
  RefreshCw, Search
} from 'lucide-react';
import { Ride, SystemConfig } from '../types';

export interface SosAlertItem {
  id: string;
  rideId: string | null;
  rideCode: string | null;
  triggeredBy: 'passageiro' | 'motorista';
  status: 'ativo' | 'em_atendimento' | 'resolvido';
  driverId: string | null;
  driverName: string;
  driverPhone: string;
  driverDocument: string;
  driverVehicle: string;
  driverPlate: string;
  driverCarColor: string;
  clientId: string | null;
  clientName: string;
  clientPhone: string;
  originAddress: string;
  destinationAddress: string;
  lat: number;
  lng: number;
  speedKmH: number;
  accuracy: number;
  batteryLevel: number | null;
  trackingUrl: string;
  googleMapsUrl: string;
  notes: string;
  history: Array<{ lat: number; lng: number; speedKmH?: number; timestamp: string }>;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
}

interface AdminSosCenterTabProps {
  rides: Ride[];
  config: SystemConfig;
  onAlertsCountChange?: (activeCount: number) => void;
}

export const AdminSosCenterTab: React.FC<AdminSosCenterTabProps> = ({
  rides,
  config,
  onAlertsCountChange
}) => {
  const [alerts, setAlerts] = useState<SosAlertItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativo' | 'em_atendimento' | 'resolvido'>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  const loadSosAlerts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/sos/alerts');
      if (res.ok) {
        const data = await res.json();
        const list: SosAlertItem[] = Array.isArray(data.alerts) ? data.alerts : [];
        setAlerts(list);
        const activeCount = list.filter(a => a.status !== 'resolvido').length;
        onAlertsCountChange?.(activeCount);
      }
    } catch {
      // Silencioso
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSosAlerts();
    const timer = setInterval(loadSosAlerts, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleUpdateAlertStatus = async (sosId: string, status: 'ativo' | 'em_atendimento' | 'resolvido') => {
    const notes = status === 'resolvido'
      ? window.prompt('Registre o desfecho do atendimento SOS:') || 'Ocorrência encerrada pela Central.'
      : undefined;
    try {
      await fetch(`/api/sos/${encodeURIComponent(sosId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes })
      });
      await loadSosAlerts();
    } catch {
      // Silencioso
    }
  };

  const handleSimulateSosAlert = async () => {
    setIsSimulating(true);
    try {
      const sampleRide = rides[0];
      const sosId = `SOS-${Date.now().toString(36).toUpperCase().slice(-5)}`;
      const lat = sampleRide?.origin?.lat || -28.3919;
      const lng = sampleRide?.origin?.lng || -49.3967;

      await fetch('/api/sos/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sosId,
          rideId: sampleRide?.id || 'UP-001',
          rideCode: sampleRide?.rideCode || '#UP-001',
          triggeredBy: 'passageiro',
          status: 'ativo',
          driverId: sampleRide?.driverId || 'drv-default',
          driverName: sampleRide?.driverName || config.driverName || 'Alisson Santos',
          driverPhone: sampleRide?.driverPhone || config.companyWhatsapp || '48996915303',
          driverVehicle: sampleRide?.driverVehicle || `${config.driverCarBrand || 'Toyota'} ${config.driverCarModel || 'Corolla'}`,
          driverPlate: sampleRide?.driverPlate || config.driverPlate || 'QXZ4G21',
          driverCarColor: sampleRide?.driverCarColor || config.driverCarColor || 'Prata',
          clientName: sampleRide?.clientName || 'Maria Fernanda Oliveira',
          clientPhone: sampleRide?.clientPhone || '(48) 99912-3456',
          originAddress: sampleRide?.origin?.address || 'Centro, Lauro Müller - SC',
          destinationAddress: sampleRide?.destination?.address || 'Criciúma Shopping, Criciúma - SC',
          lat,
          lng,
          speedKmH: 48,
          accuracy: 8,
          batteryLevel: 84
        })
      });
      await loadSosAlerts();
    } finally {
      setIsSimulating(false);
    }
  };

  const handleCopyLink = (id: string, url: string) => {
    const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const activeAlertsCount = alerts.filter(a => a.status === 'ativo').length;
  const attendingAlertsCount = alerts.filter(a => a.status === 'em_atendimento').length;
  const resolvedAlertsCount = alerts.filter(a => a.status === 'resolvido').length;

  const filteredAlerts = alerts.filter(a => {
    if (statusFilter !== 'todos' && a.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        a.id.toLowerCase().includes(q) ||
        (a.driverName || '').toLowerCase().includes(q) ||
        (a.clientName || '').toLowerCase().includes(q) ||
        (a.driverPlate || '').toLowerCase().includes(q) ||
        (a.rideCode || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Cabeçalho Limpo da Central SOS */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingBottom: 14,
        borderBottom: '1px solid #E2E8F0'
      }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A', margin: 0, letterSpacing: '-0.01em' }}>
            Central de Monitoramento SOS
          </h2>
          <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '2px 0 0 0' }}>
            Acompanhamento em tempo real de incidentes, dados do motorista/passageiro e links de localização ao vivo
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={handleSimulateSosAlert}
            disabled={isSimulating}
            style={{
              height: 34,
              padding: '0 12px',
              borderRadius: 6,
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#334155',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {isSimulating ? 'Gerando...' : 'Gerar Chamado de Teste'}
          </button>

          <button
            type="button"
            onClick={loadSosAlerts}
            style={{
              height: 34,
              padding: '0 12px',
              borderRadius: 6,
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#334155',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* 4 Cards Uniformes */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: 14
      }}>
        <div style={{
          backgroundColor: activeAlertsCount > 0 ? '#FEF2F2' : '#FFFFFF',
          borderRadius: 10,
          padding: '16px 18px',
          border: activeAlertsCount > 0 ? '1px solid #FECACA' : '1px solid #E2E8F0'
        }}>
          <div style={{ fontSize: '0.74rem', fontWeight: 600, color: activeAlertsCount > 0 ? '#B91C1C' : '#64748B' }}>
            Alertas Críticos Ativos
          </div>
          <div style={{ fontSize: '1.55rem', fontWeight: 700, color: activeAlertsCount > 0 ? '#DC2626' : '#0F172A', marginTop: 6 }}>
            {activeAlertsCount}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 6 }}>
            Aguardando intervenção imediata
          </div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: '16px 18px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>Em Atendimento</div>
          <div style={{ fontSize: '1.55rem', fontWeight: 700, color: '#0F172A', marginTop: 6 }}>{attendingAlertsCount}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 6 }}>Acompanhados pela equipe</div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: '16px 18px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>Ocorrências Resolvidas</div>
          <div style={{ fontSize: '1.55rem', fontWeight: 700, color: '#15803D', marginTop: 6 }}>{resolvedAlertsCount}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 6 }}>Encerradas e auditadas</div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: '16px 18px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>Contatos de Emergência</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <a href="tel:190" style={{ flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: 6, border: '1px solid #CBD5E1', color: '#0F172A', fontWeight: 600, fontSize: '0.74rem', textDecoration: 'none' }}>
              190 PM
            </a>
            <a href="tel:192" style={{ flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: 6, border: '1px solid #CBD5E1', color: '#0F172A', fontWeight: 600, fontSize: '0.74rem', textDecoration: 'none' }}>
              192 SAMU
            </a>
            <a href="tel:193" style={{ flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: 6, border: '1px solid #CBD5E1', color: '#0F172A', fontWeight: 600, fontSize: '0.74rem', textDecoration: 'none' }}>
              193 Bombeiros
            </a>
          </div>
        </div>
      </div>

      {/* Painel de Filtros e Lista de Chamados SOS */}
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12
        }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {[
              { id: 'todos', label: `Todos (${alerts.length})` },
              { id: 'ativo', label: `Ativos (${activeAlertsCount})` },
              { id: 'em_atendimento', label: `Em Atendimento (${attendingAlertsCount})` },
              { id: 'resolvido', label: `Resolvidos (${resolvedAlertsCount})` }
            ].map(tab => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id as any)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: active ? '1px solid #0F172A' : '1px solid transparent',
                    backgroundColor: active ? '#0F172A' : 'transparent',
                    color: active ? '#FFFFFF' : '#64748B',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div style={{ position: 'relative', minWidth: 260, flex: '0 1 320px' }}>
            <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar protocolo, motorista, placa ou passageiro..."
              style={{
                width: '100%',
                height: 34,
                padding: '0 12px 0 32px',
                borderRadius: 6,
                border: '1px solid #CBD5E1',
                fontSize: '0.76rem',
                color: '#0F172A'
              }}
            />
          </div>
        </div>

        {filteredAlerts.length === 0 ? (
          <div style={{ padding: '44px 20px', textAlign: 'center', color: '#64748B', fontSize: '0.82rem' }}>
            Nenhum chamado de SOS registrado para o filtro selecionado.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filteredAlerts.map((alert, index) => {
              const isCritical = alert.status === 'ativo';
              const isAttending = alert.status === 'em_atendimento';
              const fullTrackingLink = `${window.location.origin}/sos/${alert.id}`;
              const cleanDriverPhone = (alert.driverPhone || '').replace(/\D/g, '');
              const cleanClientPhone = (alert.clientPhone || '').replace(/\D/g, '');

              return (
                <div
                  key={alert.id}
                  style={{
                    padding: '18px 20px',
                    borderBottom: index < filteredAlerts.length - 1 ? '1px solid #E2E8F0' : 'none',
                    backgroundColor: isCritical ? '#FFFBFB' : '#FFFFFF',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14
                  }}
                >
                  {/* Topo do Chamado */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        backgroundColor: isCritical ? '#FEF2F2' : isAttending ? '#FFFBEB' : '#F0FDF4',
                        border: `1px solid ${isCritical ? '#FECACA' : isAttending ? '#FDE68A' : '#BBF7D0'}`,
                        color: isCritical ? '#DC2626' : isAttending ? '#B45309' : '#15803D'
                      }}>
                        {isCritical ? 'SOS ATIVO' : isAttending ? 'EM ATENDIMENTO' : 'RESOLVIDO'}
                      </span>

                      <span style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.84rem', fontFamily: 'monospace' }}>
                        Protocolo #{alert.id}
                      </span>

                      <span style={{ fontSize: '0.74rem', color: '#475569' }}>
                        Acionado por: <strong style={{ color: '#0F172A' }}>{alert.triggeredBy === 'motorista' ? 'Motorista' : 'Passageiro'}</strong>
                      </span>

                      {alert.rideCode && (
                        <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                          Corrida: <strong style={{ color: '#0F172A' }}>{alert.rideCode}</strong>
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        Atualizado às {new Date(alert.updatedAt).toLocaleTimeString('pt-BR')}
                      </span>

                      {alert.status === 'ativo' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateAlertStatus(alert.id, 'em_atendimento')}
                          style={{
                            padding: '5px 10px',
                            borderRadius: 6,
                            border: '1px solid #F59E0B',
                            backgroundColor: '#FFFBEB',
                            color: '#B45309',
                            fontWeight: 600,
                            fontSize: '0.72rem',
                            cursor: 'pointer'
                          }}
                        >
                          Assumir Atendimento
                        </button>
                      )}

                      {alert.status !== 'resolvido' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateAlertStatus(alert.id, 'resolvido')}
                          style={{
                            padding: '5px 10px',
                            borderRadius: 6,
                            border: 'none',
                            backgroundColor: '#0F172A',
                            color: '#FFFFFF',
                            fontWeight: 600,
                            fontSize: '0.72rem',
                            cursor: 'pointer'
                          }}
                        >
                          Marcar Resolvido
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 3 Colunas: Passageiro, Motorista/Veículo e Links de Localização */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: 12
                  }}>
                    {/* Passageiro */}
                    <div style={{ padding: 14, borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 6 }}>
                        <User size={13} /> Passageiro
                      </div>
                      <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.86rem' }}>{alert.clientName}</div>
                      <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: 2 }}>Telefone: {alert.clientPhone}</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 6 }}>
                        <div>Origem: <strong style={{ color: '#334155' }}>{alert.originAddress}</strong></div>
                        <div>Destino: <strong style={{ color: '#334155' }}>{alert.destinationAddress}</strong></div>
                      </div>
                      {cleanClientPhone && (
                        <a
                          href={`https://wa.me/55${cleanClientPhone}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            marginTop: 8,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            color: '#0F172A',
                            textDecoration: 'underline'
                          }}
                        >
                          <Phone size={12} /> Contatar Passageiro
                        </a>
                      )}
                    </div>

                    {/* Motorista e Veículo */}
                    <div style={{ padding: 14, borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 6 }}>
                        <Car size={13} /> Motorista & Veículo
                      </div>
                      <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.86rem' }}>{alert.driverName}</div>
                      <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: 2 }}>Telefone: {alert.driverPhone}</div>
                      <div style={{ fontSize: '0.74rem', color: '#334155', marginTop: 6 }}>
                        Veículo: <strong>{alert.driverVehicle} ({alert.driverCarColor})</strong>
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#334155', fontFamily: 'monospace' }}>
                        Placa: <strong>{alert.driverPlate}</strong>
                      </div>
                      {cleanDriverPhone && (
                        <a
                          href={`https://wa.me/55${cleanDriverPhone}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            marginTop: 8,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            color: '#0F172A',
                            textDecoration: 'underline'
                          }}
                        >
                          <Phone size={12} /> Contatar Motorista
                        </a>
                      )}
                    </div>

                    {/* Telemetria GPS & Links Gerados */}
                    <div style={{ padding: 14, borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', marginBottom: 6 }}>
                          <MapPin size={13} /> Localização em Tempo Real
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#0F172A', fontFamily: 'monospace', fontWeight: 600 }}>
                          Lat: {Number(alert.lat).toFixed(5)} | Lng: {Number(alert.lng).toFixed(5)}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 2 }}>
                          Velocidade: {Math.round(alert.speedKmH || 0)} km/h • Precisão: ±{Math.round(alert.accuracy || 10)}m
                        </div>
                        <div style={{
                          marginTop: 6,
                          padding: '5px 8px',
                          borderRadius: 6,
                          backgroundColor: '#FFFFFF',
                          border: '1px solid #CBD5E1',
                          fontSize: '0.68rem',
                          fontFamily: 'monospace',
                          color: '#334155',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {fullTrackingLink}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => handleCopyLink(alert.id, fullTrackingLink)}
                          style={{
                            flex: 1,
                            padding: '6px 10px',
                            borderRadius: 6,
                            border: '1px solid #CBD5E1',
                            backgroundColor: '#FFFFFF',
                            color: '#0F172A',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4
                          }}
                        >
                          {copiedId === alert.id ? <CheckCircle2 size={12} color="#16A34A" /> : <Copy size={12} />}
                          <span>{copiedId === alert.id ? 'Copiado' : 'Copiar Link'}</span>
                        </button>

                        <a
                          href={`/sos/${alert.id}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            flex: 1,
                            padding: '6px 10px',
                            borderRadius: 6,
                            backgroundColor: '#0F172A',
                            color: '#FFFFFF',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4
                          }}
                        >
                          <ExternalLink size={12} />
                          <span>Rastreio Ao Vivo</span>
                        </a>

                        <a
                          href={alert.googleMapsUrl || `https://www.google.com/maps?q=${alert.lat},${alert.lng}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            padding: '6px 10px',
                            borderRadius: 6,
                            border: '1px solid #CBD5E1',
                            backgroundColor: '#FFFFFF',
                            color: '#334155',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <span>Maps</span>
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
