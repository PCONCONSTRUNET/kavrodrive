import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck, Car, FileCheck2, Search, RefreshCw, Eye,
  AlertTriangle, CheckCircle2, XCircle, Clock, UserCheck, FileText
} from 'lucide-react';
import { DriverProfile, DriverVehicle } from '../types';
import { StorageService } from '../services/storage';
import { AdminKycReviewModal } from './AdminKycReviewModal';
import { AdminCrlvReviewModal } from './AdminCrlvReviewModal';
import { formatPlate } from '../services/vehicleService';

interface AdminDocumentsCenterTabProps {
  onRefreshDrivers?: () => void;
}

type QueueTab = 'fila_pendente' | 'kyc' | 'crlv' | 'aprovados' | 'recusados';

interface DocQueueItem {
  id: string;
  kind: 'kyc' | 'crlv';
  driver: DriverProfile;
  vehicle?: DriverVehicle;
  status: 'pendente' | 'em_analise' | 'correcao' | 'aprovado' | 'recusado';
  statusLabel: string;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  searchIndex: string;
}

export const AdminDocumentsCenterTab: React.FC<AdminDocumentsCenterTabProps> = ({
  onRefreshDrivers
}) => {
  const [drivers, setDrivers] = useState<DriverProfile[]>(() => StorageService.getDrivers());
  const [isLoading, setIsLoading] = useState(false);
  const [activeQueueTab, setActiveQueueTab] = useState<QueueTab>('fila_pendente');
  const [searchQuery, setSearchQuery] = useState('');
  const [analystName, setAnalystName] = useState(() =>
    localStorage.getItem('kavro_compliance_analyst_name') || 'Equipe Compliance Master'
  );

  const [reviewingKycDriver, setReviewingKycDriver] = useState<DriverProfile | null>(null);
  const [reviewingCrlvTarget, setReviewingCrlvTarget] = useState<{
    driver: DriverProfile;
    vehicle: DriverVehicle;
  } | null>(null);

  const loadDrivers = async () => {
    setIsLoading(true);
    const list = await StorageService.fetchDriversList();
    setDrivers(list);
    setIsLoading(false);
  };

  useEffect(() => {
    loadDrivers();
    const onSynced = () => setDrivers(StorageService.getDrivers());
    const onRtDriver = () => {
      StorageService.fetchDriversList().then(setDrivers).catch(() => {});
    };
    window.addEventListener('up_database_synced', onSynced);
    window.addEventListener('up_realtime_driver', onRtDriver);
    return () => {
      window.removeEventListener('up_database_synced', onSynced);
      window.removeEventListener('up_realtime_driver', onRtDriver);
    };
  }, []);

  const handleAnalystChange = (value: string) => {
    setAnalystName(value);
    localStorage.setItem('kavro_compliance_analyst_name', value);
  };

  // Monta a fila unificada de KYC + CRLV
  const queueItems = useMemo<DocQueueItem[]>(() => {
    const items: DocQueueItem[] = [];

    drivers.forEach((drv) => {
      const kycStatusRaw = drv.kyc?.status || drv.approvalStatus || 'pendente_aprovacao';
      const kycMapped: DocQueueItem['status'] =
        kycStatusRaw === 'aprovado'
          ? 'aprovado'
          : kycStatusRaw === 'rejeitado'
          ? 'recusado'
          : kycStatusRaw === 'correcao_solicitada'
          ? 'correcao'
          : kycStatusRaw === 'em_analise'
          ? 'em_analise'
          : 'pendente';

      const kycStatusLabel =
        kycMapped === 'aprovado'
          ? 'KYC Aprovado'
          : kycMapped === 'recusado'
          ? 'KYC Recusado'
          : kycMapped === 'correcao'
          ? 'Correção Solicitada'
          : kycMapped === 'em_analise'
          ? 'Em Análise KYC'
          : 'Aguardando KYC';

      items.push({
        id: `kyc-${drv.id}`,
        kind: 'kyc',
        driver: drv,
        status: kycMapped,
        statusLabel: kycStatusLabel,
        submittedAt: drv.kyc?.submittedAt || drv.updatedAt || drv.createdAt || '',
        reviewedBy: drv.kyc?.reviewedBy,
        reviewedAt: drv.kyc?.reviewedAt,
        searchIndex: `${drv.name} ${drv.document} ${drv.cnh} ${drv.phone} ${drv.city || ''} ${drv.vehiclePlate || ''}`.toLowerCase()
      });

      const vehicles = Array.isArray(drv.vehicles) ? drv.vehicles : [];
      vehicles.forEach((veh) => {
        const vehMapped: DocQueueItem['status'] =
          veh.approvalStatus === 'aprovado'
            ? 'aprovado'
            : veh.approvalStatus === 'rejeitado'
            ? 'recusado'
            : 'pendente';

        const vehStatusLabel =
          vehMapped === 'aprovado'
            ? 'CRLV Aprovado'
            : vehMapped === 'recusado'
            ? 'CRLV Recusado'
            : 'CRLV em Análise';

        items.push({
          id: `crlv-${drv.id}-${veh.id}`,
          kind: 'crlv',
          driver: drv,
          vehicle: veh,
          status: vehMapped,
          statusLabel: vehStatusLabel,
          submittedAt: veh.submittedAt || drv.updatedAt || drv.createdAt || '',
          reviewedBy: veh.reviewedBy,
          reviewedAt: veh.reviewedAt,
          searchIndex: `${drv.name} ${drv.document} ${veh.plate} ${veh.brand} ${veh.model} ${veh.crlvNumber || ''}`.toLowerCase()
        });
      });
    });

    // Ordenação de fila: pendentes/em análise primeiro, depois mais recentes
    const priorityWeight: Record<DocQueueItem['status'], number> = {
      em_analise: 0,
      pendente: 1,
      correcao: 2,
      recusado: 3,
      aprovado: 4
    };

    return items.sort((a, b) => {
      const diff = priorityWeight[a.status] - priorityWeight[b.status];
      if (diff !== 0) return diff;
      return String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''));
    });
  }, [drivers]);

  const stats = useMemo(() => {
    const kycPending = queueItems.filter(
      i => i.kind === 'kyc' && (i.status === 'pendente' || i.status === 'em_analise')
    ).length;
    const crlvPending = queueItems.filter(
      i => i.kind === 'crlv' && (i.status === 'pendente' || i.status === 'em_analise')
    ).length;
    const approved = queueItems.filter(i => i.status === 'aprovado').length;
    const attention = queueItems.filter(i => i.status === 'correcao' || i.status === 'recusado').length;
    return {
      kycPending,
      crlvPending,
      totalPending: kycPending + crlvPending,
      approved,
      attention
    };
  }, [queueItems]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return queueItems.filter((item) => {
      if (activeQueueTab === 'fila_pendente') {
        if (item.status !== 'pendente' && item.status !== 'em_analise' && item.status !== 'correcao') {
          return false;
        }
      } else if (activeQueueTab === 'kyc' && item.kind !== 'kyc') {
        return false;
      } else if (activeQueueTab === 'crlv' && item.kind !== 'crlv') {
        return false;
      } else if (activeQueueTab === 'aprovados' && item.status !== 'aprovado') {
        return false;
      } else if (activeQueueTab === 'recusados' && item.status !== 'correcao' && item.status !== 'recusado') {
        return false;
      }

      if (q && !item.searchIndex.includes(q)) {
        return false;
      }
      return true;
    });
  }, [queueItems, activeQueueTab, searchQuery]);

  const handleUpdatedDriver = (updated: DriverProfile) => {
    setDrivers(prev => prev.map(d => (d.id === updated.id ? updated : d)));
    if (reviewingKycDriver?.id === updated.id) {
      setReviewingKycDriver(updated);
    }
    if (reviewingCrlvTarget?.driver.id === updated.id) {
      const updatedVeh = (updated.vehicles || []).find(v => v.id === reviewingCrlvTarget.vehicle.id);
      if (updatedVeh) {
        setReviewingCrlvTarget({ driver: updated, vehicle: updatedVeh });
      }
    }
    onRefreshDrivers?.();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Cabeçalho Operacional da Equipe */}
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: 12,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 11,
            backgroundColor: '#0F172A',
            color: '#A3E635',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <FileCheck2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: '1.08rem', fontWeight: 900, color: '#0F172A' }}>
              Central de Análise Documental — KYC &amp; CRLV
            </div>
            <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: 2 }}>
              Mesa operacional da equipe de compliance para auditoria de CNH, biometria facial e licenciamento de veículos.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 9,
            border: '1px solid #CBD5E1',
            backgroundColor: '#F8FAFC'
          }}>
            <UserCheck size={14} color="#0F172A" />
            <span style={{ fontSize: '0.71rem', fontWeight: 700, color: '#64748B' }}>Analista:</span>
            <input
              type="text"
              value={analystName}
              onChange={(e) => handleAnalystChange(e.target.value)}
              placeholder="Seu nome na equipe"
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: '0.76rem',
                fontWeight: 800,
                color: '#0F172A',
                width: 170
              }}
            />
          </div>

          <button
            type="button"
            onClick={loadDrivers}
            disabled={isLoading}
            style={{
              padding: '8px 14px',
              borderRadius: 9,
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#0F172A',
              fontSize: '0.76rem',
              fontWeight: 800,
              cursor: isLoading ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <RefreshCw size={14} />
            <span>{isLoading ? 'Atualizando...' : 'Atualizar Fila'}</span>
          </button>
        </div>
      </div>

      {/* 4 KPIs de Produtividade da Equipe */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 11, padding: '15px 18px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748B' }}>KYC / CNH Pendentes</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: stats.kycPending > 0 ? '#1D4ED8' : '#0F172A', marginTop: 4 }}>
            {stats.kycPending}
          </div>
          <div style={{ fontSize: '0.71rem', color: '#64748B', marginTop: 4 }}>Aguardando análise documental/facial</div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 11, padding: '15px 18px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748B' }}>CRLV de Veículos em Fila</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: stats.crlvPending > 0 ? '#D97706' : '#0F172A', marginTop: 4 }}>
            {stats.crlvPending}
          </div>
          <div style={{ fontSize: '0.71rem', color: '#64748B', marginTop: 4 }}>Vistorias e placas aguardando parecer</div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 11, padding: '15px 18px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748B' }}>Itens Regulares Aprovados</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#15803D', marginTop: 4 }}>
            {stats.approved}
          </div>
          <div style={{ fontSize: '0.71rem', color: '#64748B', marginTop: 4 }}>Perfis e CRLVs liberados</div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 11, padding: '15px 18px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748B' }}>Correções &amp; Recusas</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: stats.attention > 0 ? '#DC2626' : '#0F172A', marginTop: 4 }}>
            {stats.attention}
          </div>
          <div style={{ fontSize: '0.71rem', color: '#64748B', marginTop: 4 }}>Aguardando reenvio ou reprovados</div>
        </div>
      </div>

      {/* Filtros & Busca da Fila */}
      <div style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: 12,
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          backgroundColor: '#F8FAFC'
        }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'fila_pendente', label: `Fila Prioritária (${stats.totalPending})` },
              { id: 'kyc', label: 'KYC / CNH & Selfie' },
              { id: 'crlv', label: 'Veículos & CRLV' },
              { id: 'aprovados', label: `Aprovados (${stats.approved})` },
              { id: 'recusados', label: `Correção / Recusados (${stats.attention})` }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveQueueTab(tab.id as QueueTab)}
                style={{
                  padding: '7px 13px',
                  borderRadius: 8,
                  border: activeQueueTab === tab.id ? 'none' : '1px solid #CBD5E1',
                  backgroundColor: activeQueueTab === tab.id ? '#0F172A' : '#FFFFFF',
                  color: activeQueueTab === tab.id ? '#FFFFFF' : '#334155',
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 12px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #CBD5E1',
            borderRadius: 9,
            minWidth: 260
          }}>
            <Search size={14} color="#64748B" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar nome, CPF, CNH, placa ou CRLV..."
              style={{
                border: 'none',
                outline: 'none',
                fontSize: '0.77rem',
                width: '100%',
                color: '#0F172A'
              }}
            />
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: '#64748B' }}>
            <CheckCircle2 size={32} color="#16A34A" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A' }}>
              Nenhum item encontrado nesta fila
            </div>
            <div style={{ fontSize: '0.78rem', marginTop: 4 }}>
              Todos os documentos filtrados já foram analisados ou não correspondem à busca.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '11px 16px', fontWeight: 700 }}>Tipo</th>
                  <th style={{ padding: '11px 14px', fontWeight: 700 }}>Motorista / CPF</th>
                  <th style={{ padding: '11px 14px', fontWeight: 700 }}>Dados para Conferência</th>
                  <th style={{ padding: '11px 14px', fontWeight: 700 }}>Indicadores &amp; Anexos</th>
                  <th style={{ padding: '11px 14px', fontWeight: 700 }}>Status / Auditoria</th>
                  <th style={{ padding: '11px 16px', fontWeight: 700, textAlign: 'right' }}>Ação da Equipe</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const bioSim = item.driver.kyc?.biometricResult
                    ? Number(item.driver.kyc.biometricResult.similarityScore ?? item.driver.kyc.biometricResult.similarity ?? 0)
                    : null;
                  const hasCnh = Boolean(item.driver.cnhDocumentPhoto || item.driver.kyc?.cnhDocumentPath || item.driver.kyc?.cnhDocumentUrl);
                  const hasSelfie = Boolean(item.driver.selfiePhoto || item.driver.kyc?.selfiePath || item.driver.kyc?.selfieUrl);

                  const badgeColors =
                    item.status === 'aprovado'
                      ? { bg: '#DCFCE7', text: '#15803D', border: '#86EFAC' }
                      : item.status === 'recusado'
                      ? { bg: '#FEE2E2', text: '#B91C1C', border: '#FCA5A5' }
                      : item.status === 'correcao'
                      ? { bg: '#FEF3C7', text: '#B45309', border: '#FCD34D' }
                      : { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' };

                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        {item.kind === 'kyc' ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '4px 9px', borderRadius: 7,
                            backgroundColor: '#EFF6FF', color: '#1D4ED8', fontWeight: 800, fontSize: '0.72rem'
                          }}>
                            <ShieldCheck size={13} />
                            <span>KYC &amp; CNH</span>
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '4px 9px', borderRadius: 7,
                            backgroundColor: '#ECFDF5', color: '#047857', fontWeight: 800, fontSize: '0.72rem'
                          }}>
                            <Car size={13} />
                            <span>CRLV Veículo</span>
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 800, color: '#0F172A' }}>{item.driver.name}</div>
                        <div style={{ fontSize: '0.71rem', color: '#64748B', fontFamily: 'monospace' }}>
                          CPF: {item.driver.document || '—'}
                        </div>
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        {item.kind === 'kyc' ? (
                          <div style={{ lineHeight: 1.45 }}>
                            <div>CNH: <strong style={{ fontFamily: 'monospace' }}>{item.driver.cnh || '—'}</strong> • EAR: <strong>{item.driver.cnhHasEar === false ? 'Não' : 'Sim'}</strong></div>
                            <div style={{ fontSize: '0.71rem', color: '#64748B' }}>{item.driver.city || 'Cidade não informada'} • {item.driver.phone}</div>
                          </div>
                        ) : item.vehicle ? (
                          <div style={{ lineHeight: 1.45 }}>
                            <div style={{ fontWeight: 700, color: '#0F172A' }}>
                              {item.vehicle.brand} {item.vehicle.model} {item.vehicle.year} ({item.vehicle.color})
                            </div>
                            <div style={{ fontSize: '0.71rem', color: '#475569' }}>
                              Placa: <strong style={{ fontFamily: 'monospace' }}>{formatPlate(item.vehicle.plate)}</strong> • CRLV: <strong>{item.vehicle.crlvNumber || 'Não informado'}</strong>
                            </div>
                          </div>
                        ) : null}
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        {item.kind === 'kyc' ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            <span style={{
                              padding: '2px 7px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 700,
                              backgroundColor: hasCnh ? '#DCFCE7' : '#F1F5F9', color: hasCnh ? '#15803D' : '#64748B'
                            }}>
                              {hasCnh ? '✓ CNH' : 'Sem CNH'}
                            </span>
                            <span style={{
                              padding: '2px 7px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 700,
                              backgroundColor: hasSelfie ? '#DCFCE7' : '#F1F5F9', color: hasSelfie ? '#15803D' : '#64748B'
                            }}>
                              {hasSelfie ? '✓ Selfie' : 'Sem Selfie'}
                            </span>
                            {bioSim !== null && (
                              <span style={{
                                padding: '2px 7px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 800,
                                backgroundColor: bioSim >= 55 ? '#EFF6FF' : '#FEF3C7',
                                color: bioSim >= 55 ? '#1D4ED8' : '#B45309'
                              }}>
                                IA {bioSim}%
                              </span>
                            )}
                            <span style={{
                              padding: '2px 7px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 700,
                              backgroundColor: item.driver.termsSignature?.signed ? '#F0FDF4' : '#FFFBEB',
                              color: item.driver.termsSignature?.signed ? '#15803D' : '#B45309'
                            }}>
                              {item.driver.termsSignature?.signed ? '✓ Termo' : 'Termo pend.'}
                            </span>
                          </div>
                        ) : item.vehicle ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            <span style={{
                              padding: '2px 7px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 700,
                              backgroundColor: item.vehicle.crlvDocumentPhoto ? '#DCFCE7' : '#FEE2E2',
                              color: item.vehicle.crlvDocumentPhoto ? '#15803D' : '#B91C1C'
                            }}>
                              {item.vehicle.crlvDocumentPhoto ? '✓ CRLV Anexado' : 'Sem Anexo'}
                            </span>
                            {item.vehicle.isActive && (
                              <span style={{ padding: '2px 7px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 700, backgroundColor: '#0F172A', color: '#A3E635' }}>
                                Em uso
                              </span>
                            )}
                          </div>
                        ) : null}
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 9px',
                          borderRadius: 999,
                          fontSize: '0.7rem',
                          fontWeight: 800,
                          backgroundColor: badgeColors.bg,
                          color: badgeColors.text,
                          border: `1px solid ${badgeColors.border}`
                        }}>
                          {item.status === 'aprovado' ? <CheckCircle2 size={11} /> :
                           item.status === 'recusado' ? <XCircle size={11} /> :
                           item.status === 'correcao' ? <AlertTriangle size={11} /> :
                           <Clock size={11} />}
                          <span>{item.statusLabel}</span>
                        </span>
                        {item.reviewedBy && (
                          <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: 3 }}>
                            Por {item.reviewedBy}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (item.kind === 'kyc') {
                              setReviewingKycDriver(item.driver);
                            } else if (item.vehicle) {
                              setReviewingCrlvTarget({ driver: item.driver, vehicle: item.vehicle });
                            }
                          }}
                          style={{
                            padding: '7px 13px',
                            borderRadius: 8,
                            border: 'none',
                            backgroundColor: item.status === 'aprovado' ? '#F1F5F9' : '#0F172A',
                            color: item.status === 'aprovado' ? '#0F172A' : '#FFFFFF',
                            fontSize: '0.74rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5
                          }}
                        >
                          {item.kind === 'kyc' ? <Eye size={13} /> : <FileText size={13} />}
                          <span>{item.kind === 'kyc' ? 'Analisar KYC' : 'Analisar CRLV'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {reviewingKycDriver && (
        <AdminKycReviewModal
          driver={reviewingKycDriver}
          isOpen={!!reviewingKycDriver}
          analystName={analystName}
          onClose={() => setReviewingKycDriver(null)}
          onUpdated={handleUpdatedDriver}
        />
      )}

      {reviewingCrlvTarget && (
        <AdminCrlvReviewModal
          driver={reviewingCrlvTarget.driver}
          vehicle={reviewingCrlvTarget.vehicle}
          isOpen={!!reviewingCrlvTarget}
          analystName={analystName}
          onClose={() => setReviewingCrlvTarget(null)}
          onUpdated={handleUpdatedDriver}
        />
      )}
    </div>
  );
};
