import React, { useState, useMemo } from 'react';
import {
  Play, FileText, Search
} from 'lucide-react';
import { Ride, SystemConfig } from '../types';
import { formatCurrency, formatRideCode } from '../utils/format';
import { RideRoutePlaybackModal } from './RideRoutePlaybackModal';

interface AdminRecordedRoutesTabProps {
  rides: Ride[];
  config: SystemConfig;
  onOpenPlayback?: (ride: Ride) => void;
}

export const AdminRecordedRoutesTab: React.FC<AdminRecordedRoutesTabProps> = ({
  rides,
  config,
  onOpenPlayback,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'todas' | 'finalizadas' | 'em_andamento'>('todas');
  const [selectedRideForPlayback, setSelectedRideForPlayback] = useState<Ride | null>(null);

  const sortedRides = useMemo(() => {
    return [...rides].sort((a, b) => {
      const dateA = `${a.date}T${a.time || '00:00'}`;
      const dateB = `${b.date}T${b.time || '00:00'}`;
      return dateB.localeCompare(dateA);
    });
  }, [rides]);

  const filteredRides = useMemo(() => {
    return sortedRides.filter((r) => {
      if (filterStatus === 'finalizadas' && r.status !== 'finalizada') return false;
      if (filterStatus === 'em_andamento' && r.status !== 'em_andamento' && r.status !== 'a_caminho') return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const code = formatRideCode(r).toLowerCase();
      const rawId = (r.id || '').toLowerCase();
      const client = (r.clientName || '').toLowerCase();
      const phone = (r.clientPhone || '').replace(/\D/g, '');
      const orig = (r.origin?.address || '').toLowerCase();
      const dest = (r.destination?.address || '').toLowerCase();
      const date = (r.date || '').toLowerCase();

      return (
        code.includes(q) ||
        rawId.includes(q) ||
        client.includes(q) ||
        phone.includes(q.replace(/\D/g, '')) ||
        orig.includes(q) ||
        dest.includes(q) ||
        date.includes(q)
      );
    });
  }, [sortedRides, searchQuery, filterStatus]);

  const stats = useMemo(() => {
    const completed = rides.filter((r) => r.status === 'finalizada');
    const totalKm = completed.reduce((acc, r) => acc + (Number(r.distanceKm) || 0), 0);
    const totalMin = completed.reduce((acc, r) => acc + (Number(r.durationMin) || 0), 0);
    const hours = (totalMin / 60).toFixed(1);

    return {
      totalCompleted: completed.length,
      totalKm: totalKm.toFixed(1),
      totalHours: hours,
      totalRegistered: rides.length,
    };
  }, [rides]);

  const handleOpenPlayer = (ride: Ride) => {
    if (onOpenPlayback) {
      onOpenPlayback(ride);
    } else {
      setSelectedRideForPlayback(ride);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {selectedRideForPlayback && (
        <RideRoutePlaybackModal
          ride={selectedRideForPlayback}
          isOpen={true}
          onClose={() => setSelectedRideForPlayback(null)}
          config={config}
        />
      )}

      {/* Cabeçalho Limpo */}
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
            Rotas Gravadas & Auditoria GPS
          </h2>
          <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '2px 0 0 0' }}>
            Histórico de viagens com telemetria GPS, reprodução de trajeto em mapa e emissão de relatório de viagem
          </p>
        </div>
      </div>

      {/* 4 Cards Uniformes */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: 14
      }}>
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: '16px 18px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>Viagens Concluídas</div>
          <div style={{ fontSize: '1.55rem', fontWeight: 700, color: '#0F172A', marginTop: 6 }}>{stats.totalCompleted}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 6 }}>Rotas com telemetria salva</div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: '16px 18px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>Distância Auditada</div>
          <div style={{ fontSize: '1.55rem', fontWeight: 700, color: '#0F172A', marginTop: 6 }}>{stats.totalKm} km</div>
          <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 6 }}>Quilometragem percorrida</div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: '16px 18px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>Tempo em Operação</div>
          <div style={{ fontSize: '1.55rem', fontWeight: 700, color: '#0F172A', marginTop: 6 }}>{stats.totalHours} h</div>
          <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 6 }}>Duração acumulada</div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: '16px 18px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>Total de Registros</div>
          <div style={{ fontSize: '1.55rem', fontWeight: 700, color: '#0F172A', marginTop: 6 }}>{stats.totalRegistered}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 6 }}>Corridas registradas na base</div>
        </div>
      </div>

      {/* Tabela de Rotas Gravadas */}
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
              { id: 'todas', label: `Todas (${rides.length})` },
              { id: 'finalizadas', label: `Concluídas (${rides.filter(r => r.status === 'finalizada').length})` },
              { id: 'em_andamento', label: `Em Curso (${rides.filter(r => r.status === 'em_andamento' || r.status === 'a_caminho').length})` },
            ].map((tab) => {
              const active = filterStatus === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterStatus(tab.id as any)}
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
              placeholder="Buscar por código (#UP), passageiro ou endereço..."
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

        {filteredRides.length === 0 ? (
          <div style={{ padding: '44px 20px', textAlign: 'center', color: '#64748B', fontSize: '0.82rem' }}>
            Nenhuma rota gravada encontrada para o filtro selecionado.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Código / Data</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Passageiro</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Motorista & Veículo</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Trajeto</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Distância / Tempo</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Valor</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Auditoria</th>
                </tr>
              </thead>
              <tbody>
                {filteredRides.map((ride) => {
                  const code = formatRideCode(ride);
                  const orig = typeof ride.origin === 'string' ? ride.origin : ride.origin?.address || 'Origem';
                  const dest = typeof ride.destination === 'string' ? ride.destination : ride.destination?.address || 'Destino';

                  return (
                    <tr key={ride.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{code}</div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>{ride.date} • {ride.time}</div>
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>{ride.clientName}</div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>{ride.clientPhone}</div>
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>{ride.driverName || config.driverName || 'Motorista Parceiro'}</div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                          {ride.driverVehicle || `${config.driverCarBrand || ''} ${config.driverCarModel || ''}`.trim() || 'Veículo'} • {ride.driverPlate || config.driverPlate || '—'}
                        </div>
                      </td>

                      <td style={{ padding: '12px 14px', maxWidth: 260 }}>
                        <div style={{ fontSize: '0.73rem', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          De: {orig}
                        </div>
                        <div style={{ fontSize: '0.73rem', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          Para: {dest}
                        </div>
                      </td>

                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: '#334155' }}>
                        {ride.distanceKm} km • {ride.durationMin || 25} min
                      </td>

                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap' }}>
                        {formatCurrency(ride.totalPrice)}
                      </td>

                      <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => handleOpenPlayer(ride)}
                            style={{
                              padding: '5px 10px',
                              borderRadius: 6,
                              border: 'none',
                              backgroundColor: '#0F172A',
                              color: '#FFFFFF',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                          >
                            <Play size={11} />
                            <span>Reproduzir GPS</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenPlayer(ride)}
                            style={{
                              padding: '5px 10px',
                              borderRadius: 6,
                              border: '1px solid #CBD5E1',
                              backgroundColor: '#FFFFFF',
                              color: '#334155',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                          >
                            <FileText size={11} />
                            <span>Laudo</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
