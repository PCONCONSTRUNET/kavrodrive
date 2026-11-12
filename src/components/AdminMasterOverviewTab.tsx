import React, { useState, useEffect, useMemo } from 'react';
import {
  Car, DollarSign, ShieldAlert, Search, RefreshCw, Eye, ArrowUpRight
} from 'lucide-react';
import { DriverProfile, PaymentTransaction, Ride, SystemConfig } from '../types';
import { StorageService } from '../services/storage';

interface AdminMasterOverviewTabProps {
  rides: Ride[];
  config: SystemConfig;
  activeSosCount: number;
  onNavigateTab: (tab: 'corridas' | 'plataforma' | 'financeiro' | 'sos' | 'rotas' | 'clientes' | 'config') => void;
  onSelectRideDetail: (ride: Ride) => void;
  onRefreshData: () => void;
}

const formatBRL = (val: number) =>
  `R$ ${Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const AdminMasterOverviewTab: React.FC<AdminMasterOverviewTabProps> = ({
  rides,
  config,
  activeSosCount,
  onNavigateTab,
  onSelectRideDetail,
  onRefreshData
}) => {
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [rideStatusFilter, setRideStatusFilter] = useState<'todas' | 'ativas' | 'fila' | 'finalizadas' | 'canceladas'>('todas');
  const [searchTerm, setSearchTerm] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadMasterData = async () => {
    setIsRefreshing(true);
    try {
      const [drvList, fin] = await Promise.all([
        StorageService.fetchDriversList(),
        StorageService.fetchAdminFinanceOverview()
      ]);
      setDrivers(drvList);
      if (fin?.transactions) setTransactions(fin.transactions);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadMasterData();
  }, [rides.length]);

  const commPct = Number(config.platformCommissionPercent ?? 20);

  const stats = useMemo(() => {
    const onlineDrivers = drivers.filter(d => d.isOnline && d.approvalStatus === 'aprovado').length;
    const busyDrivers = drivers.filter(d => Boolean(d.currentRideId)).length;
    const pendingDrivers = drivers.filter(d => d.approvalStatus === 'pendente_aprovacao').length;
    const blockedDrivers = drivers.filter(d => d.financialBlocked).length;

    const activeRides = rides.filter(r =>
      r.status === 'aguardando_pagamento' ||
      r.status === 'aguardando_confirmacao' ||
      r.status === 'na_fila' ||
      r.status === 'confirmada' ||
      r.status === 'a_caminho' ||
      r.status === 'no_local' ||
      r.status === 'em_andamento'
    );
    const queuedRides = rides.filter(r => r.status === 'na_fila');
    const finishedRides = rides.filter(r => r.status === 'finalizada');
    const cancelledRides = rides.filter(r => r.status === 'cancelada');

    const validRides = rides.filter(r => r.status !== 'cancelada');
    let grossTotal = 0;
    let platformFeeTotal = 0;
    let driverNetTotal = 0;
    let pixTotal = 0;
    let cardTotal = 0;
    let cashTotal = 0;
    let catStandard = 0;
    let catComfort = 0;
    let catBagagem = 0;

    for (const r of validRides) {
      const val = Number(r.totalPrice || 0);
      const fee = Number(r.commissionAmount ?? ((val * commPct) / 100));
      const net = Number(r.driverNetAmount ?? (val - fee));
      grossTotal += val;
      platformFeeTotal += fee;
      driverNetTotal += net;

      if (r.paymentMethod === 'pix') pixTotal += val;
      else if (r.paymentMethod === 'dinheiro') cashTotal += val;
      else cardTotal += val;

      if (r.category === 'comfort') catComfort++;
      else if (r.category === 'bagagem' || r.hasLuggage) catBagagem++;
      else catStandard++;
    }

    if (grossTotal === 0 && transactions.length > 0) {
      for (const tx of transactions) {
        if (tx.status !== 'reembolsado' && tx.status !== 'falhou') {
          grossTotal += tx.finalAmount;
          platformFeeTotal += tx.commissionAmount;
          driverNetTotal += tx.driverNetAmount;
          if (tx.method === 'pix') pixTotal += tx.finalAmount;
          else if (tx.method === 'dinheiro') cashTotal += tx.finalAmount;
          else cardTotal += tx.finalAmount;
        }
      }
    }

    const timeBuckets = [
      { label: '06h–10h', count: 0, revenue: 0 },
      { label: '10h–14h', count: 0, revenue: 0 },
      { label: '14h–18h', count: 0, revenue: 0 },
      { label: '18h–22h', count: 0, revenue: 0 },
      { label: '22h–06h', count: 0, revenue: 0 }
    ];

    for (const r of validRides) {
      const h = parseInt((r.time || '12:00').split(':')[0], 10);
      const val = Number(r.totalPrice || 0);
      if (h >= 6 && h < 10) { timeBuckets[0].count++; timeBuckets[0].revenue += val; }
      else if (h >= 10 && h < 14) { timeBuckets[1].count++; timeBuckets[1].revenue += val; }
      else if (h >= 14 && h < 18) { timeBuckets[2].count++; timeBuckets[2].revenue += val; }
      else if (h >= 18 && h < 22) { timeBuckets[3].count++; timeBuckets[3].revenue += val; }
      else { timeBuckets[4].count++; timeBuckets[4].revenue += val; }
    }

    const avgTicket = validRides.length > 0 ? grossTotal / validRides.length : 0;

    return {
      totalDrivers: drivers.length,
      onlineDrivers,
      busyDrivers,
      pendingDrivers,
      blockedDrivers,
      activeRidesCount: activeRides.length,
      queuedRidesCount: queuedRides.length,
      finishedRidesCount: finishedRides.length,
      cancelledRidesCount: cancelledRides.length,
      grossTotal,
      platformFeeTotal,
      driverNetTotal,
      pixTotal,
      cardTotal,
      cashTotal,
      catStandard,
      catComfort,
      catBagagem,
      avgTicket,
      timeBuckets
    };
  }, [drivers, rides, transactions, commPct]);

  const filteredRides = useMemo(() => {
    return rides.filter(r => {
      if (rideStatusFilter === 'ativas') {
        const isAct =
          r.status === 'aguardando_pagamento' ||
          r.status === 'aguardando_confirmacao' ||
          r.status === 'na_fila' ||
          r.status === 'confirmada' ||
          r.status === 'a_caminho' ||
          r.status === 'no_local' ||
          r.status === 'em_andamento';
        if (!isAct) return false;
      } else if (rideStatusFilter === 'fila') {
        if (r.status !== 'na_fila') return false;
      } else if (rideStatusFilter === 'finalizadas') {
        if (r.status !== 'finalizada') return false;
      } else if (rideStatusFilter === 'canceladas') {
        if (r.status !== 'cancelada') return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          (r.rideCode || r.id || '').toLowerCase().includes(q) ||
          (r.clientName || '').toLowerCase().includes(q) ||
          (r.driverName || '').toLowerCase().includes(q) ||
          (r.origin?.address || '').toLowerCase().includes(q) ||
          (r.destination?.address || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rides, rideStatusFilter, searchTerm]);

  const rawPaymentSum = stats.pixTotal + stats.cardTotal + stats.cashTotal;
  const pixPct = rawPaymentSum > 0 ? Math.round((stats.pixTotal / rawPaymentSum) * 100) : 0;
  const cardPct = rawPaymentSum > 0 ? Math.round((stats.cardTotal / rawPaymentSum) * 100) : 0;
  const cashPct = rawPaymentSum > 0 ? Math.max(0, 100 - pixPct - cardPct) : 0;

  const maxBucketVal = Math.max(10, ...stats.timeBuckets.map(b => b.revenue));

  const renderRideStatusBadge = (status: Ride['status']) => {
    const map: Record<string, { bg: string; border: string; color: string; label: string }> = {
      aguardando_pagamento: { bg: '#FFFBEB', border: '#FDE68A', color: '#B45309', label: 'Aguardando PIX' },
      aguardando_confirmacao: { bg: '#EFF6FF', border: '#BFDBFE', color: '#1D4ED8', label: 'Buscando Motorista' },
      na_fila: { bg: '#F8FAFC', border: '#CBD5E1', color: '#334155', label: 'Em Fila (2º Plano)' },
      confirmada: { bg: '#F0FDF4', border: '#BBF7D0', color: '#15803D', label: 'Confirmada' },
      a_caminho: { bg: '#EFF6FF', border: '#BFDBFE', color: '#0369A1', label: 'A Caminho' },
      no_local: { bg: '#FFFBEB', border: '#FDE68A', color: '#B45309', label: 'No Local' },
      em_andamento: { bg: '#F0FDF4', border: '#BBF7D0', color: '#15803D', label: 'Em Viagem' },
      finalizada: { bg: '#F8FAFC', border: '#E2E8F0', color: '#475569', label: 'Concluída' },
      cancelada: { bg: '#FEF2F2', border: '#FECACA', color: '#B91C1C', label: 'Cancelada' }
    };
    const st = map[status] || { bg: '#F8FAFC', border: '#E2E8F0', color: '#475569', label: status };
    return (
      <span style={{
        display: 'inline-block',
        padding: '3px 8px',
        borderRadius: 6,
        backgroundColor: st.bg,
        border: `1px solid ${st.border}`,
        color: st.color,
        fontSize: '0.7rem',
        fontWeight: 600,
        whiteSpace: 'nowrap'
      }}>
        {st.label}
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ═══ CABEÇALHO LIMPO DE PÁGINA ═══ */}
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
            Visão Geral da Operação
          </h2>
          <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '2px 0 0 0' }}>
            Monitoramento de frota, despacho de corridas e indicadores financeiros ({commPct}% taxa da plataforma)
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => onNavigateTab('plataforma')}
            style={{
              height: 34,
              padding: '0 12px',
              borderRadius: 6,
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#334155',
              fontSize: '0.76rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <Car size={14} color="#64748B" />
            <span>Motoristas ({stats.totalDrivers})</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab('financeiro')}
            style={{
              height: 34,
              padding: '0 12px',
              borderRadius: 6,
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#334155',
              fontSize: '0.76rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <DollarSign size={14} color="#64748B" />
            <span>Financeiro</span>
          </button>

          <button
            type="button"
            onClick={() => {
              loadMasterData();
              onRefreshData();
            }}
            style={{
              height: 34,
              padding: '0 10px',
              borderRadius: 6,
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#475569',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: '0.76rem',
              fontWeight: 600
            }}
            title="Atualizar dados"
          >
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* ═══ 4 CARDS DE MÉTRICAS (DESIGN UNIFORME E LIMPO) ═══ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 14
      }}>
        {/* Card 1: Frota */}
        <div
          onClick={() => onNavigateTab('plataforma')}
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 10,
            padding: '16px 18px',
            border: '1px solid #E2E8F0',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 10
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>
              Motoristas Cadastrados
            </span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: '0.7rem',
              fontWeight: 600,
              color: stats.onlineDrivers > 0 ? '#15803D' : '#64748B'
            }}>
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: stats.onlineDrivers > 0 ? '#16A34A' : '#94A3B8'
              }} />
              {stats.onlineDrivers} online
            </span>
          </div>

          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            {stats.totalDrivers}
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.72rem',
            color: '#64748B',
            borderTop: '1px solid #F1F5F9',
            paddingTop: 8
          }}>
            <span>Em viagem: <strong style={{ color: '#0F172A' }}>{stats.busyDrivers}</strong></span>
            <span>Pendentes: <strong style={{ color: stats.pendingDrivers > 0 ? '#B45309' : '#0F172A' }}>{stats.pendingDrivers}</strong></span>
          </div>
        </div>

        {/* Card 2: Despacho & Corridas */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 10,
          padding: '16px 18px',
          border: '1px solid #E2E8F0',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>
              Corridas Ativas
            </span>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748B' }}>
              Fila: {stats.queuedRidesCount}
            </span>
          </div>

          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            {stats.activeRidesCount}
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.72rem',
            color: '#64748B',
            borderTop: '1px solid #F1F5F9',
            paddingTop: 8
          }}>
            <span>Concluídas: <strong style={{ color: '#0F172A' }}>{stats.finishedRidesCount}</strong></span>
            <span>Canceladas: <strong style={{ color: '#0F172A' }}>{stats.cancelledRidesCount}</strong></span>
          </div>
        </div>

        {/* Card 3: Receita da Plataforma */}
        <div
          onClick={() => onNavigateTab('financeiro')}
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 10,
            padding: '16px 18px',
            border: '1px solid #E2E8F0',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 10
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748B' }}>
              Receita da Plataforma ({commPct}%)
            </span>
            <ArrowUpRight size={14} color="#64748B" />
          </div>

          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            {formatBRL(stats.platformFeeTotal)}
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.72rem',
            color: '#64748B',
            borderTop: '1px solid #F1F5F9',
            paddingTop: 8
          }}>
            <span>Volume Bruto: <strong style={{ color: '#0F172A' }}>{formatBRL(stats.grossTotal)}</strong></span>
            <span>Ticket: <strong style={{ color: '#0F172A' }}>{formatBRL(stats.avgTicket)}</strong></span>
          </div>
        </div>

        {/* Card 4: Central SOS */}
        <div
          onClick={() => onNavigateTab('sos')}
          style={{
            backgroundColor: activeSosCount > 0 ? '#FEF2F2' : '#FFFFFF',
            borderRadius: 10,
            padding: '16px 18px',
            border: activeSosCount > 0 ? '1px solid #FECACA' : '1px solid #E2E8F0',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 10
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 600, color: activeSosCount > 0 ? '#B91C1C' : '#64748B' }}>
              Monitoramento SOS
            </span>
            <ShieldAlert size={14} color={activeSosCount > 0 ? '#DC2626' : '#64748B'} />
          </div>

          <div style={{
            fontSize: '1.6rem',
            fontWeight: 700,
            color: activeSosCount > 0 ? '#DC2626' : '#0F172A',
            letterSpacing: '-0.02em',
            lineHeight: 1.1
          }}>
            {activeSosCount}
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.72rem',
            color: activeSosCount > 0 ? '#B91C1C' : '#64748B',
            borderTop: activeSosCount > 0 ? '1px solid #FECACA' : '1px solid #F1F5F9',
            paddingTop: 8
          }}>
            <span>{activeSosCount > 0 ? 'Chamados ativos em aberto' : 'Nenhum incidente ativo'}</span>
            <span style={{ fontWeight: 600, color: '#0F172A' }}>Abrir painel →</span>
          </div>
        </div>
      </div>

      {/* ═══ SEÇÃO DE ANÁLISE (3 PAINÉIS LIMPOS) ═══ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
        gap: 14
      }}>
        {/* Painel 1: Volume por Faixa de Horário */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 10,
          padding: '18px 20px',
          border: '1px solid #E2E8F0',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 16
        }}>
          <div>
            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A' }}>
              Demanda por Faixa Horária
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 2 }}>
              Faturamento bruto e viagens por período do dia
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 10,
            alignItems: 'end',
            height: 120,
            paddingTop: 12,
            borderBottom: '1px solid #F1F5F9',
            paddingBottom: 8
          }}>
            {stats.timeBuckets.map((b, i) => {
              const pctHeight = b.revenue > 0 ? Math.max(12, Math.round((b.revenue / maxBucketVal) * 100)) : 4;
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ fontSize: '0.66rem', fontWeight: 600, color: '#64748B' }}>
                    {b.count}
                  </div>
                  <div style={{
                    width: '100%',
                    maxWidth: 32,
                    height: `${pctHeight}%`,
                    borderRadius: '4px 4px 0 0',
                    backgroundColor: b.revenue > 0 ? '#0F172A' : '#E2E8F0',
                    transition: 'height 0.25s ease'
                  }} />
                </div>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, textAlign: 'center' }}>
            {stats.timeBuckets.map((b, i) => (
              <div key={i}>
                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#334155' }}>{b.label}</div>
                <div style={{ fontSize: '0.64rem', color: '#64748B' }}>{formatBRL(b.revenue)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Painel 2: Meios de Pagamento */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 10,
          padding: '18px 20px',
          border: '1px solid #E2E8F0',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 14
        }}>
          <div>
            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A' }}>
              Meios de Pagamento
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 2 }}>
              Proporção financeira entre PIX, Cartão e Dinheiro
            </div>
          </div>

          <div style={{
            width: '100%',
            height: 8,
            borderRadius: 999,
            backgroundColor: '#F1F5F9',
            overflow: 'hidden',
            display: 'flex'
          }}>
            {rawPaymentSum > 0 && (
              <>
                <div style={{ width: `${pixPct}%`, backgroundColor: '#0F172A' }} />
                <div style={{ width: `${cardPct}%`, backgroundColor: '#64748B' }} />
                <div style={{ width: `${cashPct}%`, backgroundColor: '#94A3B8' }} />
              </>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'PIX Dinâmico (Gateway)', value: stats.pixTotal, pct: pixPct, dot: '#0F172A' },
              { label: 'Cartão de Crédito / Débito', value: stats.cardTotal, pct: cardPct, dot: '#64748B' },
              { label: 'Dinheiro (Comissão em Débito)', value: stats.cashTotal, pct: cashPct, dot: '#94A3B8' }
            ].map((item, idx) => (
              <div key={idx} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: idx < 2 ? 8 : 0,
                borderBottom: idx < 2 ? '1px solid #F1F5F9' : 'none',
                fontSize: '0.76rem'
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#334155', fontWeight: 500 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: item.dot }} />
                  {item.label}
                </span>
                <span style={{ fontWeight: 600, color: '#0F172A' }}>
                  {formatBRL(item.value)} <span style={{ color: '#64748B', fontWeight: 500 }}>({item.pct}%)</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Painel 3: Categorias & Resumo da Frota */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 10,
          padding: '18px 20px',
          border: '1px solid #E2E8F0',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 14
        }}>
          <div>
            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A' }}>
              Categorias & Status da Frota
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 2 }}>
              Corridas por modalidade e situação cadastral
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { name: 'Kavro X (Particular)', count: stats.catStandard },
              { name: 'Kavro Comfort', count: stats.catComfort },
              { name: 'Kavro Bagagem', count: stats.catBagagem }
            ].map((cat, i) => {
              const totalCat = stats.catStandard + stats.catComfort + stats.catBagagem;
              const pct = totalCat > 0 ? Math.round((cat.count / totalCat) * 100) : 0;
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                    <span style={{ color: '#334155', fontWeight: 500 }}>{cat.name}</span>
                    <span style={{ color: '#0F172A', fontWeight: 600 }}>{cat.count} ({pct}%)</span>
                  </div>
                  <div style={{ width: '100%', height: 5, borderRadius: 999, backgroundColor: '#F1F5F9', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#0F172A' }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 10,
            borderTop: '1px solid #F1F5F9',
            fontSize: '0.74rem',
            color: '#64748B'
          }}>
            <span>Motoristas bloqueados por limite de dívida:</span>
            <strong style={{ color: stats.blockedDrivers > 0 ? '#DC2626' : '#0F172A' }}>
              {stats.blockedDrivers}
            </strong>
          </div>
        </div>
      </div>

      {/* ═══ TABELA DE DESPACHO E CORRIDAS ═══ */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        border: '1px solid #E2E8F0',
        overflow: 'hidden'
      }}>
        {/* Topo da Tabela: Filtros em Abas Lineares + Busca */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            {[
              { id: 'todas', label: `Todas (${rides.length})` },
              { id: 'ativas', label: `Ativas (${stats.activeRidesCount})` },
              { id: 'fila', label: `Em Fila (${stats.queuedRidesCount})` },
              { id: 'finalizadas', label: `Concluídas (${stats.finishedRidesCount})` },
              { id: 'canceladas', label: `Canceladas (${stats.cancelledRidesCount})` }
            ].map(tab => {
              const active = rideStatusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRideStatusFilter(tab.id as any)}
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
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar código, passageiro, motorista ou endereço..."
              style={{
                width: '100%',
                height: 34,
                padding: '0 12px 0 32px',
                borderRadius: 6,
                border: '1px solid #CBD5E1',
                fontSize: '0.76rem',
                color: '#0F172A',
                backgroundColor: '#FFFFFF'
              }}
            />
          </div>
        </div>

        {/* Corpo da Tabela */}
        {filteredRides.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748B', fontSize: '0.82rem' }}>
            Nenhuma corrida encontrada para o filtro selecionado.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Código</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Passageiro</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Motorista</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Trajeto</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Método</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Bruto</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Taxa ({commPct}%)</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Líquido</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {filteredRides.slice(0, 40).map((r) => {
                  const gross = Number(r.totalPrice || 0);
                  const fee = Number(r.commissionAmount ?? ((gross * commPct) / 100));
                  const net = Number(r.driverNetAmount ?? (gross - fee));
                  const orig = typeof r.origin === 'string' ? r.origin : (r.origin?.address || '');
                  const dest = typeof r.destination === 'string' ? r.destination : (r.destination?.address || '');

                  return (
                    <tr
                      key={r.id}
                      onClick={() => onSelectRideDetail(r)}
                      style={{ borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}
                    >
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700, color: '#0F172A' }}>
                          {r.rideCode || `#${r.id.slice(-5).toUpperCase()}`}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                          {r.date} • {r.time}
                        </div>
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: '#0F172A' }}>{r.clientName || 'Passageiro'}</div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>{r.clientPhone || '—'}</div>
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        {r.driverName ? (
                          <div>
                            <div style={{ fontWeight: 600, color: '#0F172A' }}>{r.driverName}</div>
                            <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                              {r.driverVehicle || 'Veículo'} {r.driverPlate ? `• ${r.driverPlate}` : ''}
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Aguardando alocação</span>
                        )}
                      </td>

                      <td style={{ padding: '12px 14px', maxWidth: 240 }}>
                        <div style={{ fontSize: '0.73rem', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          De: {orig.split(',')[0]}
                        </div>
                        <div style={{ fontSize: '0.73rem', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          Para: {dest.split(',')[0]}
                        </div>
                      </td>

                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', fontSize: '0.74rem', color: '#334155', fontWeight: 500 }}>
                        {r.paymentMethod === 'pix' ? 'PIX' : r.paymentMethod === 'dinheiro' ? 'Dinheiro' : 'Cartão'}
                      </td>

                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap' }}>
                        {formatBRL(gross)}
                      </td>

                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap' }}>
                        {formatBRL(fee)}
                      </td>

                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#15803D', whiteSpace: 'nowrap' }}>
                        {formatBRL(net)}
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        {renderRideStatusBadge(r.status)}
                      </td>

                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectRideDetail(r);
                          }}
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
                          <Eye size={12} />
                          <span>Ver</span>
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
    </div>
  );
};
