import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Cpu,
  Database,
  Eye,
  EyeOff,
  HardDrive,
  Lock,
  LogOut,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  Wifi,
  XCircle
} from 'lucide-react';
import {
  HealthGaugeCard,
  LatencyHistoryChart,
  PaymentHealthDonutChart,
  Rides7DaysBarChart,
  StorageAndPoolChartCard
} from '../components/SystemStatusCharts';
import {
  DailyRideMetric,
  LatencySample,
  PaymentSummaryMetric,
  TableStatMetric,
  TRAFFIC_COLORS,
  getLatencyColor
} from '../utils/statusTheme';

type CheckHealthStatus = 'ok' | 'warn' | 'error' | 'inactive';
type StatusViewTab = 'overview' | 'charts' | 'services' | 'database' | 'audit';

interface SystemDiagnosticCheck {
  id: string;
  title: string;
  category: string;
  status: CheckHealthStatus;
  metric: string;
  detail: string;
}

interface CriticalAuditItem {
  id: number;
  auditCode: string;
  category: string;
  categoryLabel?: string;
  title: string;
  severity: string;
  createdAt: string;
}

interface SystemDiagnosticsReport {
  generatedAt: string;
  overall: {
    status: 'operational' | 'degraded' | 'critical';
    label: string;
    summary: string;
    score: number;
    statusCounts?: {
      ok: number;
      warn: number;
      error: number;
      inactive: number;
    };
  };
  runtime: {
    environment: string;
    vercelRegion: string | null;
    nodeVersion: string;
    platform: string;
    uptimeSeconds: number;
    memory: {
      rssMb: number;
      heapUsedMb: number;
      heapTotalMb: number;
    };
    instanceNote: string;
  };
  database: {
    connected: boolean;
    mode: 'postgresql' | 'local_json';
    latencyMs: number | null;
    serverVersion: string;
    databaseSizeBytes: number | null;
    databaseSizeFormatted: string;
    pool: {
      max: number;
      totalCount: number;
      idleCount: number;
      waitingCount: number;
    };
    error: string | null;
    operationalCounts: {
      totalRides: number;
      activeRides: number;
      completedRides: number;
      cancelledRides: number;
      totalDrivers: number;
      approvedDrivers: number;
      pendingDrivers: number;
      onlineDrivers: number;
      blockedDrivers: number;
      totalClients: number;
      pendingWithdrawals: number;
      paidWithdrawals: number;
      totalTransactions: number;
      failedTransactions: number;
      refundedTransactions: number;
      activeSosAlerts: number;
      auditLogsCount: number;
      notificationsCount: number;
    };
    dailyRides7d?: DailyRideMetric[];
    paymentSummary?: PaymentSummaryMetric;
    tableStats: TableStatMetric[];
  };
  integrations: {
    realtime: {
      status: CheckHealthStatus;
      activeConnections: number;
      totalEventsPublished: number;
      bufferedEvents: number;
      upstashConfigured: boolean;
      upstashLatencyMs: number | null;
      upstashOk: boolean;
    };
    mercadopago: {
      status: CheckHealthStatus;
      enabled: boolean;
      sandbox: boolean;
      useForCard: boolean;
      useForPassengerPix: boolean;
      hasAccessToken: boolean;
      hasPublicKey: boolean;
      hasWebhookSecret: boolean;
      lastTestedAt: string | null;
      lastTestOk: boolean | null;
      lastTestMessage: string;
      liveProbe: { ok: boolean; message?: string } | null;
    };
    efibank: {
      status: CheckHealthStatus;
      enabled: boolean;
      sandbox: boolean;
      useForPassengerPix: boolean;
      driverPixSendEnabled: boolean;
      splitEnabled: boolean;
      hasCredentials: boolean;
      lastTestedAt: string | null;
      lastTestOk: boolean | null;
      lastTestMessage: string;
      liveProbe: { ok: boolean; message?: string } | null;
    };
    storageR2: {
      status: CheckHealthStatus;
      configured: boolean;
      publicConfigured: boolean;
      privateBucket: string;
      publicBucket: string;
    };
    push: {
      status: CheckHealthStatus;
      configured: boolean;
      appIdConfigured: boolean;
    };
    authAndSecurity: {
      turnstileConfigured: boolean;
      googleAuthConfigured: boolean;
      otpEmailConfigured: boolean;
      otpWebhookConfigured: boolean;
      adminSessionSecretConfigured: boolean;
    };
  };
  checks: SystemDiagnosticCheck[];
  recentCriticalAudit: CriticalAuditItem[];
}

const STATUS_TOKEN_STORAGE_KEY = 'kavro_isolated_status_session_v1';

const CHECK_CATEGORY_GROUPS: { id: string; title: string; categories: string[] }[] = [
  { id: 'infra', title: 'Infraestrutura, Banco & Tempo Real', categories: ['infra', 'armazenamento'] },
  { id: 'payments', title: 'Pagamentos & Gateways', categories: ['pagamentos'] },
  { id: 'security', title: 'Segurança, Mensageria & Operação', categories: ['seguranca', 'mensageria', 'operacao'] }
];

function loadStoredStatusToken(): string {
  try {
    const raw = localStorage.getItem(STATUS_TOKEN_STORAGE_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.expiresAt) return '';
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(STATUS_TOKEN_STORAGE_KEY);
      return '';
    }
    return String(parsed.token);
  } catch {
    return '';
  }
}

function persistStatusToken(token: string, expiresAt: string) {
  try {
    localStorage.setItem(STATUS_TOKEN_STORAGE_KEY, JSON.stringify({ token, expiresAt }));
  } catch {
    // ignore storage errors
  }
}

function clearStoredStatusToken() {
  try {
    localStorage.removeItem(STATUS_TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function formatUptimeDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function getStatusBadgeTheme(status: CheckHealthStatus) {
  if (status === 'ok') return { ...TRAFFIC_COLORS.green, label: 'OK' };
  if (status === 'warn') return { ...TRAFFIC_COLORS.orange, label: 'ATENÇÃO' };
  if (status === 'error') return { ...TRAFFIC_COLORS.red, label: 'CRÍTICO' };
  return { ...TRAFFIC_COLORS.gray, label: 'DESATIVADO' };
}

export const SystemStatusScreen: React.FC = () => {
  const [token, setToken] = useState<string>(() => loadStoredStatusToken());
  const [pinInput, setPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const [activeView, setActiveView] = useState<StatusViewTab>('overview');
  const [report, setReport] = useState<SystemDiagnosticsReport | null>(null);
  const [latencySamples, setLatencySamples] = useState<LatencySample[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isProbingLive, setIsProbingLive] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchDiagnostics = useCallback(async (authToken: string, probe = false) => {
    if (!authToken) return;
    if (probe) {
      setIsProbingLive(true);
    } else {
      setIsFetching(true);
    }
    setFetchError(null);
    try {
      const url = `/api/status/diagnostics${probe ? '?probe=1' : ''}`;
      const res = await fetch(url, {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      });
      const data = await res.json().catch(() => null);
      if (res.status === 401) {
        clearStoredStatusToken();
        setToken('');
        setReport(null);
        setLatencySamples([]);
        setAuthError(data?.error || 'Sessão expirada. Informe o PIN novamente.');
        return;
      }
      if (!res.ok || !data?.ok) {
        setFetchError(data?.error || `Falha ao consultar diagnóstico (HTTP ${res.status}).`);
        return;
      }
      const typed = data as SystemDiagnosticsReport;
      setReport(typed);
      const timeLabel = new Date(typed.generatedAt || Date.now()).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      setLatencySamples(prev => {
        const next: LatencySample = {
          time: timeLabel,
          latencyMs: Number(typed.database?.latencyMs ?? 0),
          heapMb: Number(typed.runtime?.memory?.heapUsedMb ?? 0),
          sseCount: Number(typed.integrations?.realtime?.activeConnections ?? 0)
        };
        return [...prev, next].slice(-24);
      });
    } catch {
      setFetchError('Erro de conexão com o servidor de API.');
    } finally {
      setIsFetching(false);
      setIsProbingLive(false);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    const initialTimer = window.setTimeout(() => {
      void fetchDiagnostics(token, false);
    }, 0);
    if (!autoRefresh) {
      return () => window.clearTimeout(initialTimer);
    }
    const interval = window.setInterval(() => {
      void fetchDiagnostics(token, false);
    }, 15000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [token, autoRefresh, fetchDiagnostics]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = pinInput.trim();
    if (!cleanPin) {
      setAuthError('Digite o PIN de acesso ao diagnóstico.');
      return;
    }
    setAuthError(null);
    setIsAuthenticating(true);
    try {
      const res = await fetch('/api/status/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: cleanPin })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !data?.token) {
        setAuthError(data?.error || 'PIN incorreto.');
        return;
      }
      persistStatusToken(data.token, data.expiresAt || new Date(Date.now() + 12 * 3600 * 1000).toISOString());
      setPinInput('');
      setToken(data.token);
    } catch {
      setAuthError('Falha ao conectar com o servidor.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLock = () => {
    clearStoredStatusToken();
    setToken('');
    setReport(null);
    setLatencySamples([]);
    setFetchError(null);
    setAuthError(null);
  };

  if (!token) {
    return (
      <div style={{
        minHeight: '100dvh',
        backgroundColor: '#0B1117',
        color: '#F8FAFC',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontFamily: "'Inter', 'Plus Jakarta Sans', sans-serif"
      }}>
        <div style={{
          width: '100%',
          maxWidth: 420,
          backgroundColor: '#111827',
          border: '1px solid #1E293B',
          borderRadius: 16,
          padding: 28,
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <img src="/logo-horizontal-white.png" alt="KAVRO DRIVE" style={{ height: 26, objectFit: 'contain' }} />
            <span style={{
              padding: '3px 9px',
              borderRadius: 999,
              backgroundColor: TRAFFIC_COLORS.green.bg,
              border: `1px solid ${TRAFFIC_COLORS.green.border}`,
              color: TRAFFIC_COLORS.green.text,
              fontSize: '0.68rem',
              fontWeight: 800
            }}>
              /status
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              backgroundColor: '#1E293B',
              border: '1px solid #334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#22C55E'
            }}>
              <Lock size={18} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: '#FFFFFF' }}>
                Diagnóstico &amp; Status do Sistema
              </h1>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.76rem', color: '#94A3B8' }}>
                Painel técnico isolado com gráficos e telemetria
              </p>
            </div>
          </div>

          <p style={{ fontSize: '0.78rem', color: '#CBD5E1', lineHeight: 1.5, margin: '14px 0 18px 0' }}>
            Informe o PIN técnico para acompanhar saúde do banco PostgreSQL, latência ao vivo, gráficos operacionais e status das APIs.
          </p>

          <form onSubmit={handleUnlock} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ position: 'relative' }}>
              <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                autoFocus
                placeholder="Digite o PIN de monitoramento..."
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                style={{
                  width: '100%',
                  height: 44,
                  padding: '0 42px 0 14px',
                  borderRadius: 10,
                  border: authError ? '1px solid #EF4444' : '1px solid #334155',
                  backgroundColor: '#0F172A',
                  color: '#FFFFFF',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  letterSpacing: '0.16em',
                  outline: 'none'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPin(prev => !prev)}
                aria-label={showPin ? 'Ocultar PIN' : 'Mostrar PIN'}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  padding: 4
                }}
              >
                {showPin ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>

            {authError && (
              <div style={{
                padding: '9px 12px',
                borderRadius: 8,
                backgroundColor: TRAFFIC_COLORS.red.bg,
                border: `1px solid ${TRAFFIC_COLORS.red.border}`,
                color: TRAFFIC_COLORS.red.text,
                fontSize: '0.76rem',
                fontWeight: 600
              }}>
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={isAuthenticating}
              style={{
                height: 44,
                borderRadius: 10,
                border: 'none',
                backgroundColor: '#22C55E',
                color: '#0B1117',
                fontSize: '0.88rem',
                fontWeight: 800,
                cursor: isAuthenticating ? 'wait' : 'pointer',
                opacity: isAuthenticating ? 0.75 : 1
              }}
            >
              {isAuthenticating ? 'Validando PIN...' : 'Acessar Painel Técnico'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const computedCounts = report?.overall.statusCounts || {
    ok: (report?.checks || []).filter(c => c.status === 'ok').length,
    warn: (report?.checks || []).filter(c => c.status === 'warn').length,
    error: (report?.checks || []).filter(c => c.status === 'error').length,
    inactive: (report?.checks || []).filter(c => c.status === 'inactive').length
  };
  const ops = report?.database.operationalCounts;
  const fallbackPaymentSummary: PaymentSummaryMetric = report?.database.paymentSummary || {
    confirmed: Math.max(0, (ops?.totalTransactions || 0) - (ops?.failedTransactions || 0) - (ops?.refundedTransactions || 0)),
    pending: 0,
    failed: ops?.failedTransactions || 0,
    refunded: ops?.refundedTransactions || 0,
    byMethod: { pix: 0, cartao_credito: 0, cartao_debito: 0, dinheiro: 0, carteira: 0 }
  };

  const renderCheckCard = (item: SystemDiagnosticCheck) => {
    const badge = getStatusBadgeTheme(item.status);
    return (
      <div
        key={item.id}
        style={{
          padding: '13px 15px',
          borderRadius: 12,
          backgroundColor: '#111827',
          border: `1px solid ${item.status === 'error' ? TRAFFIC_COLORS.red.border : item.status === 'warn' ? TRAFFIC_COLORS.orange.border : '#1E293B'}`,
          borderLeft: `4px solid ${badge.solid}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#FFFFFF' }}>{item.title}</span>
          <span style={{
            padding: '2px 8px',
            borderRadius: 6,
            fontSize: '0.64rem',
            fontWeight: 800,
            backgroundColor: badge.bg,
            border: `1px solid ${badge.border}`,
            color: badge.text
          }}>
            {badge.label}
          </span>
        </div>
        <div style={{ fontSize: '0.94rem', fontWeight: 800, color: badge.text }}>
          {item.metric}
        </div>
        <div style={{ fontSize: '0.73rem', color: '#94A3B8', lineHeight: 1.4 }}>
          {item.detail}
        </div>
      </div>
    );
  };

  const showCharts = activeView === 'overview' || activeView === 'charts';
  const showServices = activeView === 'overview' || activeView === 'services';
  const showDatabase = activeView === 'overview' || activeView === 'database';
  const showAudit = activeView === 'overview' || activeView === 'audit';

  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: '#0B1117',
      color: '#F8FAFC',
      fontFamily: "'Inter', 'Plus Jakarta Sans', sans-serif",
      padding: '18px 16px 44px 16px'
    }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Barra Superior */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          paddingBottom: 14,
          borderBottom: '1px solid #1E293B'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img src="/logo-horizontal-white.png" alt="KAVRO DRIVE" style={{ height: 24, objectFit: 'contain' }} />
            <div style={{ height: 20, width: 1, backgroundColor: '#334155' }} />
            <div>
              <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#FFFFFF' }}>
                Centro de Operações, Gráficos &amp; Banco de Dados
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                Monitoramento isolado (/status) • Sem acesso administrativo ou financeiro
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <label style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #334155',
              backgroundColor: '#111827',
              fontSize: '0.74rem',
              color: '#CBD5E1',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                style={{ accentColor: '#22C55E' }}
              />
              <span>Auto 15s</span>
            </label>

            <button
              type="button"
              onClick={() => void fetchDiagnostics(token, false)}
              disabled={isFetching || isProbingLive}
              style={{
                height: 34,
                padding: '0 12px',
                borderRadius: 8,
                border: '1px solid #334155',
                backgroundColor: '#1E293B',
                color: '#FFFFFF',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: isFetching ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <RefreshCw size={14} />
              <span>{isFetching ? 'Atualizando...' : 'Atualizar'}</span>
            </button>

            <button
              type="button"
              onClick={() => void fetchDiagnostics(token, true)}
              disabled={isFetching || isProbingLive}
              style={{
                height: 34,
                padding: '0 12px',
                borderRadius: 8,
                border: `1px solid ${TRAFFIC_COLORS.green.border}`,
                backgroundColor: TRAFFIC_COLORS.green.bg,
                color: TRAFFIC_COLORS.green.text,
                fontSize: '0.75rem',
                fontWeight: 800,
                cursor: isProbingLive ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Wifi size={14} />
              <span>{isProbingLive ? 'Testando APIs...' : 'Testar APIs ao Vivo'}</span>
            </button>

            <button
              type="button"
              onClick={handleLock}
              style={{
                height: 34,
                padding: '0 12px',
                borderRadius: 8,
                border: `1px solid ${TRAFFIC_COLORS.red.border}`,
                backgroundColor: TRAFFIC_COLORS.red.bg,
                color: TRAFFIC_COLORS.red.text,
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <LogOut size={14} />
              <span>Bloquear</span>
            </button>
          </div>
        </div>

        {/* Navegação Organizada por Abas */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { id: 'overview', label: 'Visão Geral', icon: ShieldCheck },
            { id: 'charts', label: 'Gráficos & Latência', icon: BarChart3 },
            { id: 'services', label: 'Serviços & Gateways', icon: Server },
            { id: 'database', label: 'Banco & Tabelas SQL', icon: Database },
            { id: 'audit', label: `Alertas & Auditoria (${report?.recentCriticalAudit.length ?? 0})`, icon: AlertTriangle }
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveView(tab.id as StatusViewTab)}
                style={{
                  height: 35,
                  padding: '0 13px',
                  borderRadius: 9,
                  border: active ? `1px solid ${TRAFFIC_COLORS.green.border}` : '1px solid #1E293B',
                  backgroundColor: active ? TRAFFIC_COLORS.green.bg : '#111827',
                  color: active ? TRAFFIC_COLORS.green.text : '#CBD5E1',
                  fontSize: '0.76rem',
                  fontWeight: active ? 800 : 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {fetchError && (
          <div style={{
            padding: '12px 14px',
            borderRadius: 10,
            backgroundColor: TRAFFIC_COLORS.red.bg,
            border: `1px solid ${TRAFFIC_COLORS.red.border}`,
            color: TRAFFIC_COLORS.red.text,
            fontSize: '0.82rem',
            fontWeight: 600
          }}>
            {fetchError}
          </div>
        )}

        {!report && !fetchError && (
          <div style={{
            padding: 40,
            borderRadius: 14,
            border: '1px solid #1E293B',
            backgroundColor: '#111827',
            textAlign: 'center',
            color: '#94A3B8',
            fontSize: '0.86rem'
          }}>
            Coletando telemetria, gráficos e estatísticas do banco de dados...
          </div>
        )}

        {report && (
          <>
            {/* Gauge Radial + Semáforo Geral */}
            <HealthGaugeCard
              score={report.overall.score}
              overallStatus={report.overall.status}
              label={report.overall.label}
              summary={report.overall.summary}
              statusCounts={computedCounts}
              generatedAt={report.generatedAt}
              instanceNote={report.runtime.instanceNote}
            />

            {/* Faixa de Indicadores Rápidos (Verde / Laranja / Vermelho) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: 10 }}>
              {[
                {
                  label: 'Latência DB',
                  value: report.database.latencyMs !== null ? `${report.database.latencyMs} ms` : 'OFF',
                  sub: report.database.serverVersion,
                  theme: getLatencyColor(report.database.latencyMs)
                },
                {
                  label: 'Uptime Instância',
                  value: formatUptimeDuration(report.runtime.uptimeSeconds),
                  sub: `${report.runtime.environment}${report.runtime.vercelRegion ? ` (${report.runtime.vercelRegion})` : ''}`,
                  theme: TRAFFIC_COLORS.green
                },
                {
                  label: 'Tamanho do Banco',
                  value: report.database.databaseSizeFormatted,
                  sub: `${report.database.tableStats.length} tabelas mapeadas`,
                  theme: TRAFFIC_COLORS.green
                },
                {
                  label: 'Motoristas Online',
                  value: `${ops?.onlineDrivers ?? 0} / ${ops?.approvedDrivers ?? 0}`,
                  sub: `KYC pend.: ${ops?.pendingDrivers ?? 0}`,
                  theme: (ops?.pendingDrivers || 0) > 0 ? TRAFFIC_COLORS.orange : TRAFFIC_COLORS.green
                },
                {
                  label: 'Saques Pendentes',
                  value: String(ops?.pendingWithdrawals ?? 0),
                  sub: `Pagos: ${ops?.paidWithdrawals ?? 0}`,
                  theme: (ops?.pendingWithdrawals || 0) > 0 ? TRAFFIC_COLORS.orange : TRAFFIC_COLORS.green
                },
                {
                  label: 'Alertas SOS Ativos',
                  value: String(ops?.activeSosAlerts ?? 0),
                  sub: (ops?.activeSosAlerts || 0) > 0 ? 'Requer atenção imediata' : 'Nenhum alerta ativo',
                  theme: (ops?.activeSosAlerts || 0) > 0 ? TRAFFIC_COLORS.red : TRAFFIC_COLORS.green
                }
              ].map(card => (
                <div
                  key={card.label}
                  style={{
                    padding: '11px 13px',
                    borderRadius: 11,
                    backgroundColor: '#111827',
                    border: `1px solid ${card.theme.border}`,
                    borderTop: `3px solid ${card.theme.solid}`
                  }}
                >
                  <div style={{ fontSize: '0.68rem', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase' }}>
                    {card.label}
                  </div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 900, color: card.theme.text, marginTop: 2 }}>
                    {card.value}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#CBD5E1', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {card.sub}
                  </div>
                </div>
              ))}
            </div>

            {/* BLOCO DE GRÁFICOS VISUAIS */}
            {showCharts && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
                <LatencyHistoryChart
                  samples={latencySamples}
                  currentLatencyMs={report.database.latencyMs}
                />
                <Rides7DaysBarChart
                  days={report.database.dailyRides7d || []}
                />
                <PaymentHealthDonutChart
                  summary={fallbackPaymentSummary}
                />
                <StorageAndPoolChartCard
                  pool={report.database.pool}
                  memory={report.runtime.memory}
                  databaseSizeBytes={report.database.databaseSizeBytes}
                  databaseSizeFormatted={report.database.databaseSizeFormatted}
                  tableStats={report.database.tableStats}
                />
              </div>
            )}

            {/* BLOCO DE SERVIÇOS ORGANIZADO POR CATEGORIA */}
            {showServices && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {CHECK_CATEGORY_GROUPS.map(group => {
                  const groupChecks = report.checks.filter(c => group.categories.includes(c.category));
                  if (groupChecks.length === 0) return null;
                  return (
                    <div key={group.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#CBD5E1', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {group.title}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                        {groupChecks.map(renderCheckCard)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* BLOCO DE TABELAS SQL & CONTADORES */}
            {showDatabase && (
              <div style={{
                borderRadius: 14,
                backgroundColor: '#111827',
                border: '1px solid #1E293B',
                overflow: 'hidden'
              }}>
                <div style={{
                  padding: '14px 18px',
                  borderBottom: '1px solid #1E293B',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', fontWeight: 800, color: '#FFFFFF' }}>
                    <HardDrive size={17} color="#22C55E" />
                    <span>Inventário Completo do Banco ({report.database.tableStats.length} tabelas)</span>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                    {report.database.serverVersion} • Node {report.runtime.nodeVersion} • {report.runtime.platform}
                  </span>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#0F172A', borderBottom: '1px solid #1E293B', color: '#94A3B8', fontSize: '0.69rem', textTransform: 'uppercase' }}>
                        <th style={{ padding: '10px 16px' }}>Coleção / Entidade</th>
                        <th style={{ padding: '10px 14px' }}>Tabela SQL</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Registros</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Espaço</th>
                        <th style={{ padding: '10px 16px', textAlign: 'right' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.database.tableStats.map(tbl => {
                        const tColor = tbl.status === 'ok'
                          ? TRAFFIC_COLORS.green
                          : tbl.status === 'missing'
                          ? TRAFFIC_COLORS.orange
                          : TRAFFIC_COLORS.red;
                        return (
                          <tr key={tbl.name} style={{ borderBottom: '1px solid #1E293B' }}>
                            <td style={{ padding: '9px 16px', fontWeight: 600, color: '#F8FAFC' }}>{tbl.label}</td>
                            <td style={{ padding: '9px 14px', fontFamily: 'monospace', color: '#94A3B8' }}>public.{tbl.name}</td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>
                              {tbl.count.toLocaleString('pt-BR')}
                            </td>
                            <td style={{ padding: '9px 14px', textAlign: 'right', color: '#CBD5E1', fontFamily: 'monospace' }}>
                              {tbl.sizeFormatted}
                            </td>
                            <td style={{ padding: '9px 16px', textAlign: 'right' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '2px 8px',
                                borderRadius: 6,
                                fontSize: '0.67rem',
                                fontWeight: 700,
                                backgroundColor: tColor.bg,
                                border: `1px solid ${tColor.border}`,
                                color: tColor.text
                              }}>
                                {tbl.status === 'ok' ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                                {tbl.status === 'ok' ? 'OK' : tbl.status.toUpperCase()}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* BLOCO DE INTEGRAÇÕES & AUDITORIA CRÍTICA */}
            {showAudit && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
                <div style={{
                  padding: 18,
                  borderRadius: 14,
                  backgroundColor: '#111827',
                  border: '1px solid #1E293B',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.86rem', fontWeight: 800, color: '#FFFFFF' }}>
                    <Radio size={17} color="#22C55E" />
                    <span>Variáveis &amp; Integrações Críticas</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.75rem' }}>
                    {[
                      {
                        name: 'Mercado Pago',
                        ok: report.integrations.mercadopago.enabled && report.integrations.mercadopago.hasAccessToken,
                        detail: `${report.integrations.mercadopago.sandbox ? 'Sandbox' : 'Produção'} • Token: ${report.integrations.mercadopago.hasAccessToken ? 'OK' : 'Falta'} • Webhook: ${report.integrations.mercadopago.hasWebhookSecret ? 'OK' : 'Falta'}`
                      },
                      {
                        name: 'Cloudflare R2',
                        ok: report.integrations.storageR2.configured && report.integrations.storageR2.publicConfigured,
                        detail: `Privado: ${report.integrations.storageR2.configured ? 'OK' : 'OFF'} • Público: ${report.integrations.storageR2.publicConfigured ? 'OK' : 'OFF'}`
                      },
                      {
                        name: 'Upstash Redis (SSE Serverless)',
                        ok: report.integrations.realtime.upstashConfigured && report.integrations.realtime.upstashOk,
                        detail: report.integrations.realtime.upstashConfigured
                          ? `PING: ${report.integrations.realtime.upstashOk ? `${report.integrations.realtime.upstashLatencyMs} ms` : 'Falhou'}`
                          : 'Não configurado (SSE local na instância)'
                      },
                      {
                        name: 'OneSignal Push & Resend OTP',
                        ok: report.integrations.push.configured && report.integrations.authAndSecurity.otpEmailConfigured,
                        detail: `Push: ${report.integrations.push.configured ? 'ON' : 'OFF'} • OTP E-mail: ${report.integrations.authAndSecurity.otpEmailConfigured ? 'ON' : 'OFF'} • Turnstile: ${report.integrations.authAndSecurity.turnstileConfigured ? 'ON' : 'OFF'}`
                      }
                    ].map(row => {
                      const theme = row.ok ? TRAFFIC_COLORS.green : TRAFFIC_COLORS.orange;
                      return (
                        <div key={row.name} style={{
                          padding: '9px 11px',
                          borderRadius: 9,
                          backgroundColor: '#0F172A',
                          border: `1px solid ${theme.border}`,
                          borderLeft: `3px solid ${theme.solid}`
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                            <strong style={{ color: '#FFFFFF' }}>{row.name}</strong>
                            <span style={{ color: theme.text, fontWeight: 800, fontSize: '0.68rem' }}>
                              {row.ok ? 'VERDE • PRONTO' : 'LARANJA • REVISAR'}
                            </span>
                          </div>
                          <div style={{ color: '#94A3B8' }}>{row.detail}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{
                  padding: 18,
                  borderRadius: 14,
                  backgroundColor: '#111827',
                  border: '1px solid #1E293B',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.86rem', fontWeight: 800, color: '#FFFFFF' }}>
                    <Cpu size={17} color="#F97316" />
                    <span>Últimos Alertas Críticos / Atenção ({report.recentCriticalAudit.length})</span>
                  </div>

                  {report.recentCriticalAudit.length === 0 ? (
                    <div style={{
                      padding: 16,
                      borderRadius: 10,
                      backgroundColor: TRAFFIC_COLORS.green.bg,
                      border: `1px solid ${TRAFFIC_COLORS.green.border}`,
                      color: TRAFFIC_COLORS.green.text,
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}>
                      <Activity size={16} />
                      <span>Nenhum evento crítico ou de atenção recente na auditoria.</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {report.recentCriticalAudit.map(ev => {
                        const evTheme = ev.severity === 'critico' ? TRAFFIC_COLORS.red : TRAFFIC_COLORS.orange;
                        return (
                          <div
                            key={ev.id}
                            style={{
                              padding: '9px 11px',
                              borderRadius: 9,
                              backgroundColor: '#0F172A',
                              border: `1px solid ${evTheme.border}`,
                              borderLeft: `4px solid ${evTheme.solid}`,
                              fontSize: '0.74rem'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                              <span style={{ fontWeight: 800, color: evTheme.text, fontFamily: 'monospace' }}>
                                {ev.auditCode} • {ev.severity.toUpperCase()}
                              </span>
                              <span style={{ color: '#64748B', fontSize: '0.68rem' }}>
                                {new Date(ev.createdAt).toLocaleString('pt-BR')}
                              </span>
                            </div>
                            <div style={{ color: '#E2E8F0', fontWeight: 600 }}>{ev.title}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
