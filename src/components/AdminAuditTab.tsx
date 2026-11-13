import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck,
  Search,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Clock,
  Database,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  ArrowRight,
  KeyRound,
  FileText
} from 'lucide-react';
import { AuditLogRecord } from '../types';
import { StorageService } from '../services/storage';

const CATEGORY_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'todas', label: 'Todas as Áreas' },
  { id: 'taxas_financeiras', label: 'Taxas Financeiras' },
  { id: 'financeiro_corridas', label: 'Corridas, Multas & Estornos' },
  { id: 'saques_repasses', label: 'Saques & Repasses' },
  { id: 'motoristas_kyc', label: 'Motoristas, KYC & Veículos' },
  { id: 'categorias', label: 'Categorias' },
  { id: 'tarifas_regras', label: 'Tarifas & Regras' },
  { id: 'acessos', label: 'Acessos Admin' }
];

const SEVERITY_BADGE: Record<string, { label: string; bg: string; border: string; text: string }> = {
  info: { label: 'Registro Normal', bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D' },
  atencao: { label: 'Atenção / Alteração Crítica', bg: '#FFFBEB', border: '#FDE68A', text: '#B45309' },
  critico: { label: 'Alto Impacto', bg: '#FEF2F2', border: '#FECACA', text: '#DC2626' }
};

const ACTOR_ROLE_LABELS: Record<string, string> = {
  admin_master: 'Administrador Master',
  motorista: 'Motorista',
  passageiro: 'Passageiro',
  gateway: 'Gateway de Pagamento',
  sistema: 'Sistema Automático'
};

const RELATED_ID_LABELS: Record<string, string> = {
  rideId: 'ID Corrida',
  rideCode: 'Código Corrida',
  driverId: 'ID Motorista',
  withdrawalId: 'ID Saque',
  transactionId: 'ID Transação',
  gatewayTxId: 'ID Gateway',
  payoutProviderTxId: 'ID Repasse Gateway',
  ledgerId: 'ID Livro-Razão',
  vehicleId: 'ID Veículo',
  plate: 'Placa',
  kycAuditId: 'ID Análise KYC',
  vehicleAuditId: 'ID Análise CRLV',
  pixKey: 'Chave PIX',
  configId: 'ID Configuração',
  adminEmail: 'E-mail Admin'
};

function formatPtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return iso;
  }
}

export const AdminAuditTab: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [latestDbId, setLatestDbId] = useState<number>(0);
  const [summaryByCategory, setSummaryByCategory] = useState<Record<string, number>>({});
  const [category, setCategory] = useState<string>('todas');
  const [severity, setSeverity] = useState<string>('todas');
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [verifyStates, setVerifyStates] = useState<Record<number, { loading: boolean; ok?: boolean; msg?: string }>>({});

  const loadAudit = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const res = await StorageService.fetchAdminAuditLogs({
      category: category === 'todas' ? '' : category,
      severity: severity === 'todas' ? '' : severity,
      search: search.trim(),
      limit: 150
    });
    setLoading(false);
    if (!res.ok) {
      setErrorMsg(res.error || 'Erro ao carregar trilha de auditoria.');
      return;
    }
    setLogs(Array.isArray(res.logs) ? res.logs : []);
    setTotal(Number(res.total || 0));
    setLatestDbId(Number(res.latestDbId || 0));
    setSummaryByCategory(res.summaryByCategory || {});
  }, [category, severity, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAudit();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [loadAudit]);

  useEffect(() => {
    const onRtAudit = () => {
      void loadAudit();
    };
    window.addEventListener('up_realtime_audit', onRtAudit);
    return () => window.removeEventListener('up_realtime_audit', onRtAudit);
  }, [loadAudit]);

  const handleCopy = (key: string, value: string) => {
    if (!value) return;
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(prev => (prev === key ? null : prev)), 1800);
  };

  const handleVerifyDbRecord = async (rec: AuditLogRecord) => {
    setVerifyStates(prev => ({ ...prev, [rec.id]: { loading: true } }));
    const res = await StorageService.verifyAdminAuditRecord(rec.auditCode);
    if (!res.ok) {
      setVerifyStates(prev => ({
        ...prev,
        [rec.id]: { loading: false, ok: false, msg: res.error || 'Falha ao verificar no banco.' }
      }));
      return;
    }
    setVerifyStates(prev => ({
      ...prev,
      [rec.id]: {
        loading: false,
        ok: Boolean(res.integrityOk),
        msg: res.integrityOk
          ? `Integridade confirmada no banco (${rec.auditCode} • ID #${rec.id})`
          : 'Divergência de assinatura detectada no registro.'
      }
    }));
  };

  const handleExportCsv = () => {
    const header = [
      'Codigo Auditoria',
      'ID Sequencial Banco',
      'UUID Banco',
      'Data/Hora',
      'Area',
      'Severidade',
      'Titulo',
      'Resumo',
      'Responsavel',
      'Perfil',
      'Email',
      'IP',
      'Entidade',
      'ID Entidade',
      'Alteracoes',
      'Checksum SHA-256'
    ];
    const escapeCsv = (val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const rows = logs.map(item => [
      item.auditCode,
      item.id,
      item.auditUuid,
      formatPtDateTime(item.createdAt),
      item.categoryLabel,
      SEVERITY_BADGE[item.severity]?.label || item.severity,
      item.title,
      item.summary,
      item.actorName,
      ACTOR_ROLE_LABELS[item.actorRole] || item.actorRole,
      item.actorEmail || '',
      item.ipAddress || '',
      item.entityType || '',
      item.entityId || '',
      (item.changes || []).map(c => c.summary).join(' | '),
      item.checksum
    ]);
    const csvContent = '\uFEFF' + [header, ...rows].map(r => r.map(escapeCsv).join(';')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `auditoria-kavro-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const kpis = useMemo(() => {
    const feesCount = (summaryByCategory.taxas_financeiras || 0) + (summaryByCategory.tarifas_regras || 0) + (summaryByCategory.categorias || 0);
    const finCount = (summaryByCategory.financeiro_corridas || 0) + (summaryByCategory.saques_repasses || 0);
    const docsCount = summaryByCategory.motoristas_kyc || 0;
    const totalAll = Object.values(summaryByCategory).reduce((acc, n) => acc + (Number(n) || 0), 0);
    return { totalAll, feesCount, finCount, docsCount };
  }, [summaryByCategory]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Cabeçalho */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        backgroundColor: '#FFFFFF',
        padding: '18px 20px',
        borderRadius: 12,
        border: '1px solid #E2E8F0'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={20} color="#15803D" />
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0F172A' }}>
              Central de Auditoria Imutável (PostgreSQL)
            </h2>
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 999,
              backgroundColor: '#ECFDF5',
              color: '#065F46',
              border: '1px solid #A7F3D0'
            }}>
              IDs Gerados pelo Banco
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>
            Histórico 100% em português de alterações em taxas financeiras, tarifas, multas, estornos, saques, aprovações de KYC/CRLV e acessos.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={logs.length === 0}
            style={{
              height: 36,
              padding: '0 14px',
              borderRadius: 8,
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#0F172A',
              fontSize: '0.78rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: logs.length === 0 ? 'not-allowed' : 'pointer',
              opacity: logs.length === 0 ? 0.5 : 1
            }}
          >
            <Download size={14} />
            <span>Exportar CSV</span>
          </button>

          <button
            type="button"
            onClick={() => void loadAudit()}
            disabled={loading}
            style={{
              height: 36,
              padding: '0 14px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: '#0F172A',
              color: '#FFFFFF',
              fontSize: '0.78rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div style={{ backgroundColor: '#FFFFFF', padding: '14px 16px', borderRadius: 10, border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>Registros Totais no Banco</div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{kpis.totalAll}</div>
          <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: 4 }}>
            Último ID gerado: <strong style={{ color: '#15803D' }}>{latestDbId > 0 ? `AUD-${String(latestDbId).padStart(6, '0')} (#${latestDbId})` : '—'}</strong>
          </div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', padding: '14px 16px', borderRadius: 10, border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>Alterações de Taxas & Tarifas</div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#B45309', marginTop: 4 }}>{kpis.feesCount}</div>
          <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: 4 }}>Comissões, PIX, Cartão, Multa e Categorias</div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', padding: '14px 16px', borderRadius: 10, border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>Movimentações & Repasses</div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{kpis.finCount}</div>
          <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: 4 }}>Liquidações, Cancelamentos, Saques e Estornos</div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', padding: '14px 16px', borderRadius: 10, border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>Motoristas, KYC & CRLV</div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{kpis.docsCount}</div>
          <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: 4 }}>Aprovações, recusas e bloqueios financeiros</div>
        </div>
      </div>

      {/* Filtros e Busca */}
      <div style={{
        backgroundColor: '#FFFFFF',
        padding: '14px 16px',
        borderRadius: 10,
        border: '1px solid #E2E8F0',
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 280px' }}>
            <Search size={15} color="#64748B" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por código AUD-000001, UUID do banco, corrida (#UP), motorista ou palavra-chave..."
              style={{
                width: '100%',
                height: 38,
                paddingLeft: 34,
                paddingRight: 12,
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                fontSize: '0.8rem',
                color: '#0F172A',
                outline: 'none'
              }}
            />
          </div>

          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            style={{
              height: 38,
              padding: '0 12px',
              borderRadius: 8,
              border: '1px solid #CBD5E1',
              fontSize: '0.8rem',
              color: '#0F172A',
              backgroundColor: '#FFFFFF',
              cursor: 'pointer'
            }}
          >
            <option value="todas">Todas as Severidades</option>
            <option value="info">Registro Normal</option>
            <option value="atencao">Atenção / Taxas</option>
            <option value="critico">Alto Impacto / Crítico</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CATEGORY_OPTIONS.map((opt) => {
            const active = category === opt.id;
            const count = opt.id === 'todas' ? kpis.totalAll : (summaryByCategory[opt.id] || 0);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setCategory(opt.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: active ? '1px solid #0F172A' : '1px solid #E2E8F0',
                  backgroundColor: active ? '#0F172A' : '#F8FAFC',
                  color: active ? '#FFFFFF' : '#475569',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span>{opt.label}</span>
                <span style={{
                  fontSize: '0.66rem',
                  padding: '1px 6px',
                  borderRadius: 999,
                  backgroundColor: active ? 'rgba(255,255,255,0.16)' : '#E2E8F0',
                  color: active ? '#FFFFFF' : '#334155'
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Erro */}
      {errorMsg && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 10,
          backgroundColor: '#FEF2F2',
          border: '1px solid #FECACA',
          color: '#B91C1C',
          fontSize: '0.82rem',
          fontWeight: 600
        }}>
          {errorMsg}
        </div>
      )}

      {/* Lista de Eventos Auditados */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && logs.length === 0 ? (
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: 32, textAlign: 'center', border: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.85rem' }}>
            Consultando trilha de auditoria no banco de dados...
          </div>
        ) : logs.length === 0 ? (
          <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: 36, textAlign: 'center', border: '1px solid #E2E8F0', color: '#64748B' }}>
            <FileText size={28} color="#94A3B8" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.92rem' }}>
              Nenhum evento encontrado para os filtros aplicados
            </div>
            <div style={{ fontSize: '0.78rem', marginTop: 4 }}>
              Qualquer alteração em Taxas Financeiras, Tarifas, Saques, Corridas ou Documentações gera automaticamente um registro confirmado com ID do banco.
            </div>
          </div>
        ) : (
          logs.map((rec) => {
            const isExpanded = expandedId === rec.id;
            const sev = SEVERITY_BADGE[rec.severity] || SEVERITY_BADGE.info;
            const verifyState = verifyStates[rec.id];
            const relatedEntries = Object.entries(rec.relatedIds || {}).filter(([, v]) => v !== null && v !== undefined && v !== '');

            return (
              <div
                key={`${rec.id}-${rec.auditUuid}`}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 10,
                  border: isExpanded ? '1px solid #0F172A' : '1px solid #E2E8F0',
                  overflow: 'hidden',
                  transition: 'border-color 0.15s ease'
                }}
              >
                {/* Linha Resumo Clicável */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : rec.id)}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {/* ID Sequencial Gerado pelo Banco */}
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '3px 9px',
                        borderRadius: 6,
                        backgroundColor: '#0F172A',
                        color: '#76D800',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: '0.74rem',
                        fontWeight: 800
                      }}>
                        <Database size={12} />
                        {rec.auditCode}
                      </span>

                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        backgroundColor: '#F1F5F9',
                        color: '#334155',
                        fontSize: '0.7rem',
                        fontWeight: 700
                      }}>
                        {rec.categoryLabel}
                      </span>

                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        backgroundColor: sev.bg,
                        border: `1px solid ${sev.border}`,
                        color: sev.text,
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}>
                        {rec.severity === 'critico' ? <AlertOctagon size={11} /> : rec.severity === 'atencao' ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />}
                        {sev.label}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748B', fontSize: '0.74rem' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={12} />
                        {formatPtDateTime(rec.createdAt)}
                      </span>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A' }}>{rec.title}</div>
                    <div style={{ fontSize: '0.79rem', color: '#475569', marginTop: 2, lineHeight: 1.4 }}>{rec.summary}</div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, fontSize: '0.72rem', color: '#64748B' }}>
                    <span>
                      Responsável: <strong style={{ color: '#0F172A' }}>{rec.actorName}</strong> ({ACTOR_ROLE_LABELS[rec.actorRole] || rec.actorRole})
                      {rec.actorEmail ? ` • ${rec.actorEmail}` : ''}
                    </span>
                    {rec.entityId && (
                      <span>
                        Registro Afetado: <strong style={{ color: '#0F172A', fontFamily: 'ui-monospace, monospace' }}>{rec.entityId}</strong>
                      </span>
                    )}
                    {rec.ipAddress && <span>IP: {rec.ipAddress}</span>}
                  </div>
                </button>

                {/* Detalhes Expandidos + Confirmação do Banco */}
                {isExpanded && (
                  <div style={{
                    borderTop: '1px solid #E2E8F0',
                    backgroundColor: '#F8FAFC',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14
                  }}>
                    {/* Quadro de Prova / IDs Gerados pelo Banco */}
                    <div style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      borderRadius: 8,
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <KeyRound size={14} color="#15803D" />
                          <span>Comprovação Criptográfica & Identificadores do Banco</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleVerifyDbRecord(rec)}
                          disabled={verifyState?.loading}
                          style={{
                            padding: '5px 11px',
                            borderRadius: 6,
                            border: '1px solid #0F172A',
                            backgroundColor: '#0F172A',
                            color: '#76D800',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {verifyState?.loading ? 'Verificando no PostgreSQL...' : 'Verificar Autenticidade no Banco'}
                        </button>
                      </div>

                      {verifyState?.msg && (
                        <div style={{
                          padding: '7px 10px',
                          borderRadius: 6,
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          backgroundColor: verifyState.ok ? '#DCFCE7' : '#FEE2E2',
                          color: verifyState.ok ? '#15803D' : '#DC2626',
                          border: `1px solid ${verifyState.ok ? '#86EFAC' : '#FCA5A5'}`
                        }}>
                          {verifyState.msg}
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, fontSize: '0.73rem' }}>
                        <div style={{ backgroundColor: '#F8FAFC', padding: '7px 10px', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                          <div style={{ color: '#64748B', fontSize: '0.67rem' }}>ID Sequencial PostgreSQL</div>
                          <div style={{ fontWeight: 700, color: '#0F172A', fontFamily: 'ui-monospace, monospace' }}>#{rec.id} ({rec.auditCode})</div>
                        </div>

                        <div style={{ backgroundColor: '#F8FAFC', padding: '7px 10px', borderRadius: 6, border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: '#64748B', fontSize: '0.67rem' }}>UUID Único do Banco</div>
                            <div style={{ fontWeight: 600, color: '#0F172A', fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {rec.auditUuid}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopy(`uuid-${rec.id}`, rec.auditUuid)}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#475569' }}
                            title="Copiar UUID"
                          >
                            {copiedKey === `uuid-${rec.id}` ? <Check size={14} color="#15803D" /> : <Copy size={14} />}
                          </button>
                        </div>

                        <div style={{ backgroundColor: '#F8FAFC', padding: '7px 10px', borderRadius: 6, border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: '#64748B', fontSize: '0.67rem' }}>Selo SHA-256</div>
                            <div style={{ fontWeight: 600, color: '#0F172A', fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {rec.checksum || '—'}
                            </div>
                          </div>
                          {rec.checksum && (
                            <button
                              type="button"
                              onClick={() => handleCopy(`chk-${rec.id}`, rec.checksum)}
                              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#475569' }}
                              title="Copiar Checksum SHA-256"
                            >
                              {copiedKey === `chk-${rec.id}` ? <Check size={14} color="#15803D" /> : <Copy size={14} />}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Alterações Legíveis em Português */}
                    {rec.changes && rec.changes.length > 0 && (
                      <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ padding: '9px 12px', backgroundColor: '#F1F5F9', fontSize: '0.74rem', fontWeight: 700, color: '#0F172A', borderBottom: '1px solid #E2E8F0' }}>
                          Comparativo de Alterações (Antes ➔ Depois)
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {rec.changes.map((chg, idx) => (
                            <div
                              key={`${rec.id}-chg-${idx}`}
                              style={{
                                padding: '9px 12px',
                                borderBottom: idx < rec.changes.length - 1 ? '1px solid #F1F5F9' : 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: 8,
                                fontSize: '0.78rem'
                              }}
                            >
                              <span style={{ fontWeight: 600, color: '#0F172A' }}>{chg.label}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: 6,
                                  backgroundColor: '#FEF2F2',
                                  color: '#991B1B',
                                  fontWeight: 600
                                }}>
                                  {chg.before}
                                </span>
                                <ArrowRight size={13} color="#64748B" />
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: 6,
                                  backgroundColor: '#DCFCE7',
                                  color: '#166534',
                                  fontWeight: 700
                                }}>
                                  {chg.after}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* IDs Relacionados */}
                    {relatedEntries.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {relatedEntries.map(([k, v]) => (
                          <span
                            key={`${rec.id}-rel-${k}`}
                            style={{
                              fontSize: '0.71rem',
                              padding: '4px 9px',
                              borderRadius: 6,
                              backgroundColor: '#FFFFFF',
                              border: '1px solid #E2E8F0',
                              color: '#334155'
                            }}
                          >
                            <strong>{RELATED_ID_LABELS[k] || k}:</strong>{' '}
                            <span style={{ fontFamily: 'ui-monospace, monospace' }}>{String(v)}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {total > logs.length && (
        <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#64748B' }}>
          Exibindo {logs.length} de {total} registros no banco. Utilize a busca ou os filtros acima para localizar eventos específicos.
        </div>
      )}
    </div>
  );
};
