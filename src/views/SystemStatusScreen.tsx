import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
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
  ShieldAlert,
  ShieldCheck,
  Wifi,
  XCircle
} from 'lucide-react';

type CheckHealthStatus = 'ok' | 'warn' | 'error' | 'inactive';

interface SystemDiagnosticCheck {
  id: string;
  title: string;
  category: string;
  status: CheckHealthStatus;
  metric: string;
  detail: string;
}

interface TableStatItem {
  name: string;
  label: string;
  count: number;
  sizeBytes: number | null;
  sizeFormatted: string;
  status: 'ok' | 'missing' | 'error';
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
    tableStats: TableStatItem[];
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
  if (status === 'ok') {
    return {
      bg: 'rgba(22, 163, 74, 0.14)',
      border: 'rgba(34, 197, 94, 0.35)',
      color: '#4ADE80',
      label: 'OK'
    };
  }
  if (status === 'warn') {
    return {
      bg: 'rgba(245, 158, 11, 0.14)',
      border: 'rgba(245, 158, 11, 0.35)',
      color: '#FBBF24',
      label: 'ATENÇÃO'
    };
  }
  if (status === 'error') {
    return {
      bg: 'rgba(239, 68, 68, 0.14)',
      border: 'rgba(239, 68, 68, 0.38)',
      color: '#F87171',
      label: 'ERRO'
    };
  }
  return {
    bg: 'rgba(148, 163, 184, 0.12)',
    border: 'rgba(148, 163, 184, 0.25)',
    color: '#94A3B8',
    label: 'DESATIVADO'
  };
}

export const SystemStatusScreen: React.FC = () => {
  const [token, setToken] = useState<string>(() => loadStoredStatusToken());
  const [pinInput, setPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const [report, setReport] = useState<SystemDiagnosticsReport | null>(null);
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
        setAuthError(data?.error || 'Sessão expirada. Informe o PIN novamente.');
        return;
      }
      if (!res.ok || !data?.ok) {
        setFetchError(data?.error || `Falha ao consultar diagnóstico (HTTP ${res.status}).`);
        return;
      }
      setReport(data as SystemDiagnosticsReport);
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
              backgroundColor: 'rgba(163, 230, 53, 0.14)',
              border: '1px solid rgba(163, 230, 53, 0.35)',
              color: '#A3E635',
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
              color: '#A3E635'
            }}>
              <Lock size={18} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: '#FFFFFF' }}>
                Diagnóstico &amp; Status do Sistema
              </h1>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.76rem', color: '#94A3B8' }}>
                Área técnica isolada fora do Admin
              </p>
            </div>
          </div>

          <p style={{ fontSize: '0.78rem', color: '#CBD5E1', lineHeight: 1.5, margin: '14px 0 18px 0' }}>
            Informe o PIN técnico para acompanhar saúde do banco PostgreSQL, pool de conexões, latência, tempo real e APIs integradas.
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
                backgroundColor: 'rgba(239, 68, 68, 0.14)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#FCA5A5',
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
                backgroundColor: '#A3E635',
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

  const overallColors = !report
    ? { bg: '#111827', border: '#334155', accent: '#94A3B8' }
    : report.overall.status === 'operational'
    ? { bg: 'rgba(22, 163, 74, 0.12)', border: 'rgba(34, 197, 94, 0.38)', accent: '#4ADE80' }
    : report.overall.status === 'degraded'
    ? { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.38)', accent: '#FBBF24' }
    : { bg: 'rgba(239, 68, 68, 0.14)', border: 'rgba(239, 68, 68, 0.42)', accent: '#F87171' };

  const ops = report?.database.operationalCounts;
  const poolPct = report?.database.pool.max
    ? Math.min(100, Math.round((report.database.pool.totalCount / report.database.pool.max) * 100))
    : 0;

  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: '#0B1117',
      color: '#F8FAFC',
      fontFamily: "'Inter', 'Plus Jakarta Sans', sans-serif",
      padding: '18px 16px 40px 16px'
    }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
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
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#FFFFFF' }}>
                Monitoramento &amp; Banco de Dados
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                Aba técnica isolada (/status) • Sem acesso financeiro/administrativo
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
                style={{ accentColor: '#A3E635' }}
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
                border: '1px solid rgba(163, 230, 53, 0.4)',
                backgroundColor: 'rgba(163, 230, 53, 0.14)',
                color: '#A3E635',
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
                border: '1px solid rgba(239, 68, 68, 0.35)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: '#FCA5A5',
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

        {fetchError && (
          <div style={{
            padding: '12px 14px',
            borderRadius: 10,
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#FCA5A5',
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
            Coletando telemetria e estatísticas do banco de dados...
          </div>
        )}

        {report && (
          <>
            {/* Banner Principal de Saúde Geral */}
            <div style={{
              padding: '18px 20px',
              borderRadius: 14,
              border: `1px solid ${overallColors.border}`,
              backgroundColor: overallColors.bg,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  backgroundColor: 'rgba(15, 23, 42, 0.65)',
                  border: `1px solid ${overallColors.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: overallColors.accent
                }}>
                  {report.overall.status === 'operational' ? (
                    <ShieldCheck size={24} />
                  ) : report.overall.status === 'degraded' ? (
                    <AlertTriangle size={24} />
                  ) : (
                    <ShieldAlert size={24} />
                  )}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: '#FFFFFF' }}>
                      {report.overall.label}
                    </h2>
                    <span style={{
                      padding: '2px 9px',
                      borderRadius: 999,
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      backgroundColor: 'rgba(15, 23, 42, 0.75)',
                      color: overallColors.accent,
                      border: `1px solid ${overallColors.border}`
                    }}>
                      Saúde: {report.overall.score}/100
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#E2E8F0' }}>
                    {report.overall.summary}
                  </p>
                  <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: 4 }}>
                    Última verificação: {new Date(report.generatedAt).toLocaleString('pt-BR')} • {report.runtime.instanceNote}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.76rem' }}>
                <div style={{ padding: '8px 12px', borderRadius: 10, backgroundColor: 'rgba(15, 23, 42, 0.72)', border: '1px solid #334155' }}>
                  <div style={{ color: '#94A3B8', fontSize: '0.67rem', textTransform: 'uppercase' }}>Uptime Instância</div>
                  <div style={{ fontWeight: 800, color: '#FFFFFF', fontSize: '0.92rem' }}>
                    {formatUptimeDuration(report.runtime.uptimeSeconds)}
                  </div>
                </div>
                <div style={{ padding: '8px 12px', borderRadius: 10, backgroundColor: 'rgba(15, 23, 42, 0.72)', border: '1px solid #334155' }}>
                  <div style={{ color: '#94A3B8', fontSize: '0.67rem', textTransform: 'uppercase' }}>Memória Processo</div>
                  <div style={{ fontWeight: 800, color: '#FFFFFF', fontSize: '0.92rem' }}>
                    {report.runtime.memory.heapUsedMb} MB / {report.runtime.memory.rssMb} MB RSS
                  </div>
                </div>
                <div style={{ padding: '8px 12px', borderRadius: 10, backgroundColor: 'rgba(15, 23, 42, 0.72)', border: '1px solid #334155' }}>
                  <div style={{ color: '#94A3B8', fontSize: '0.67rem', textTransform: 'uppercase' }}>Ambiente</div>
                  <div style={{ fontWeight: 800, color: '#FFFFFF', fontSize: '0.92rem' }}>
                    {report.runtime.environment}
                    {report.runtime.vercelRegion ? ` (${report.runtime.vercelRegion})` : ''}
                  </div>
                </div>
              </div>
            </div>

            {/* Checklist de Todos os Componentes do Sistema */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 12
            }}>
              {report.checks.map(item => {
                const badge = getStatusBadgeTheme(item.status);
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: 14,
                      borderRadius: 12,
                      backgroundColor: '#111827',
                      border: `1px solid ${item.status === 'error' ? 'rgba(239, 68, 68, 0.45)' : item.status === 'warn' ? 'rgba(245, 158, 11, 0.35)' : '#1E293B'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 7
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#FFFFFF' }}>{item.title}</span>
                      <span style={{
                        padding: '2px 7px',
                        borderRadius: 6,
                        fontSize: '0.65rem',
                        fontWeight: 800,
                        backgroundColor: badge.bg,
                        border: `1px solid ${badge.border}`,
                        color: badge.color
                      }}>
                        {badge.label}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.94rem', fontWeight: 800, color: badge.color }}>
                      {item.metric}
                    </div>
                    <div style={{ fontSize: '0.73rem', color: '#94A3B8', lineHeight: 1.4 }}>
                      {item.detail}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bloco Banco de Dados + Pool + Contadores Operacionais */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
              gap: 16
            }}>
              {/* Saúde & Pool do Banco */}
              <div style={{
                padding: 18,
                borderRadius: 14,
                backgroundColor: '#111827',
                border: '1px solid #1E293B',
                display: 'flex',
                flexDirection: 'column',
                gap: 14
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.86rem', fontWeight: 800, color: '#FFFFFF' }}>
                    <Database size={17} color="#A3E635" />
                    <span>Estatísticas do Banco de Dados</span>
                  </div>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    backgroundColor: report.database.connected ? 'rgba(22, 163, 74, 0.16)' : 'rgba(239, 68, 68, 0.2)',
                    color: report.database.connected ? '#4ADE80' : '#F87171'
                  }}>
                    {report.database.connected ? 'CONECTADO' : 'OFFLINE'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.78rem' }}>
                  <div style={{ padding: 10, borderRadius: 10, backgroundColor: '#0F172A', border: '1px solid #1E293B' }}>
                    <div style={{ color: '#94A3B8', fontSize: '0.68rem' }}>Latência de Query</div>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#FFFFFF', marginTop: 2 }}>
                      {report.database.latencyMs !== null ? `${report.database.latencyMs} ms` : '—'}
                    </div>
                  </div>
                  <div style={{ padding: 10, borderRadius: 10, backgroundColor: '#0F172A', border: '1px solid #1E293B' }}>
                    <div style={{ color: '#94A3B8', fontSize: '0.68rem' }}>Tamanho do Banco</div>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#FFFFFF', marginTop: 2 }}>
                      {report.database.databaseSizeFormatted}
                    </div>
                  </div>
                  <div style={{ padding: 10, borderRadius: 10, backgroundColor: '#0F172A', border: '1px solid #1E293B' }}>
                    <div style={{ color: '#94A3B8', fontSize: '0.68rem' }}>Engine / Versão</div>
                    <div style={{ fontWeight: 700, color: '#E2E8F0', marginTop: 2 }}>
                      {report.database.serverVersion}
                    </div>
                  </div>
                  <div style={{ padding: 10, borderRadius: 10, backgroundColor: '#0F172A', border: '1px solid #1E293B' }}>
                    <div style={{ color: '#94A3B8', fontSize: '0.68rem' }}>Modo de Persistência</div>
                    <div style={{ fontWeight: 700, color: '#E2E8F0', marginTop: 2 }}>
                      {report.database.mode === 'postgresql' ? 'PostgreSQL (Supabase)' : 'JSON Local (Dev)'}
                    </div>
                  </div>
                </div>

                <div style={{ padding: 12, borderRadius: 10, backgroundColor: '#0F172A', border: '1px solid #1E293B' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem', color: '#CBD5E1', marginBottom: 6 }}>
                    <span>Pool de Conexões ({report.database.pool.totalCount} / {report.database.pool.max || 1})</span>
                    <span>Ociosas: {report.database.pool.idleCount} • Fila: {report.database.pool.waitingCount}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, backgroundColor: '#1E293B', overflow: 'hidden' }}>
                    <div style={{
                      width: `${poolPct}%`,
                      height: '100%',
                      backgroundColor: report.database.pool.waitingCount > 0 ? '#FBBF24' : '#4ADE80'
                    }} />
                  </div>
                </div>
              </div>

              {/* Resumo Operacional do Sistema */}
              <div style={{
                padding: 18,
                borderRadius: 14,
                backgroundColor: '#111827',
                border: '1px solid #1E293B',
                display: 'flex',
                flexDirection: 'column',
                gap: 14
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.86rem', fontWeight: 800, color: '#FFFFFF' }}>
                  <Activity size={17} color="#A3E635" />
                  <span>Contadores Operacionais em Tempo Real</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, fontSize: '0.76rem' }}>
                  <div style={{ padding: 10, borderRadius: 10, backgroundColor: '#0F172A', border: '1px solid #1E293B' }}>
                    <div style={{ color: '#94A3B8', fontSize: '0.67rem' }}>Corridas</div>
                    <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#FFFFFF', marginTop: 2 }}>{ops?.totalRides ?? 0}</div>
                    <div style={{ fontSize: '0.68rem', color: '#4ADE80' }}>Ativas: {ops?.activeRides ?? 0} • Concl.: {ops?.completedRides ?? 0}</div>
                  </div>

                  <div style={{ padding: 10, borderRadius: 10, backgroundColor: '#0F172A', border: '1px solid #1E293B' }}>
                    <div style={{ color: '#94A3B8', fontSize: '0.67rem' }}>Motoristas</div>
                    <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#FFFFFF', marginTop: 2 }}>{ops?.totalDrivers ?? 0}</div>
                    <div style={{ fontSize: '0.68rem', color: '#A3E635' }}>Online: {ops?.onlineDrivers ?? 0} • KYC Pend.: {ops?.pendingDrivers ?? 0}</div>
                  </div>

                  <div style={{ padding: 10, borderRadius: 10, backgroundColor: '#0F172A', border: '1px solid #1E293B' }}>
                    <div style={{ color: '#94A3B8', fontSize: '0.67rem' }}>Passageiros</div>
                    <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#FFFFFF', marginTop: 2 }}>{ops?.totalClients ?? 0}</div>
                    <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Cadastros totais</div>
                  </div>

                  <div style={{ padding: 10, borderRadius: 10, backgroundColor: '#0F172A', border: '1px solid #1E293B' }}>
                    <div style={{ color: '#94A3B8', fontSize: '0.67rem' }}>Pagamentos</div>
                    <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#FFFFFF', marginTop: 2 }}>{ops?.totalTransactions ?? 0}</div>
                    <div style={{ fontSize: '0.68rem', color: (ops?.failedTransactions || 0) > 0 ? '#F87171' : '#94A3B8' }}>
                      Falhas: {ops?.failedTransactions ?? 0} • Estornos: {ops?.refundedTransactions ?? 0}
                    </div>
                  </div>

                  <div style={{ padding: 10, borderRadius: 10, backgroundColor: '#0F172A', border: '1px solid #1E293B' }}>
                    <div style={{ color: '#94A3B8', fontSize: '0.67rem' }}>Saques PIX</div>
                    <div style={{ fontWeight: 900, fontSize: '1.1rem', color: (ops?.pendingWithdrawals || 0) > 0 ? '#FBBF24' : '#FFFFFF', marginTop: 2 }}>
                      {ops?.pendingWithdrawals ?? 0} pendente(s)
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Pagos: {ops?.paidWithdrawals ?? 0}</div>
                  </div>

                  <div style={{ padding: 10, borderRadius: 10, backgroundColor: '#0F172A', border: '1px solid #1E293B' }}>
                    <div style={{ color: '#94A3B8', fontSize: '0.67rem' }}>SOS &amp; Segurança</div>
                    <div style={{ fontWeight: 900, fontSize: '1.1rem', color: (ops?.activeSosAlerts || 0) > 0 ? '#F87171' : '#4ADE80', marginTop: 2 }}>
                      {ops?.activeSosAlerts ?? 0} ativo(s)
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Bloqueados fin.: {ops?.blockedDrivers ?? 0}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Inventário das Tabelas do Banco */}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.86rem', fontWeight: 800, color: '#FFFFFF' }}>
                  <HardDrive size={17} color="#A3E635" />
                  <span>Tabelas do Banco de Dados ({report.database.tableStats.length})</span>
                </div>
                <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                  Node {report.runtime.nodeVersion} • {report.runtime.platform}
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
                      <th style={{ padding: '10px 16px', textAlign: 'right' }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.database.tableStats.map(tbl => (
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
                            backgroundColor: tbl.status === 'ok' ? 'rgba(22, 163, 74, 0.14)' : 'rgba(245, 158, 11, 0.16)',
                            color: tbl.status === 'ok' ? '#4ADE80' : '#FBBF24'
                          }}>
                            {tbl.status === 'ok' ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                            {tbl.status === 'ok' ? 'OK' : tbl.status.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Integrações + Eventos Críticos Recentes */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
              gap: 16
            }}>
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
                  <Server size={17} color="#A3E635" />
                  <span>Gateways, Mensageria &amp; Storage</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.76rem' }}>
                  <div style={{ padding: 10, borderRadius: 9, backgroundColor: '#0F172A', border: '1px solid #1E293B' }}>
                    <div style={{ fontWeight: 700, color: '#FFFFFF', marginBottom: 3 }}>Mercado Pago</div>
                    <div style={{ color: '#94A3B8' }}>
                      Ativo: <strong style={{ color: '#E2E8F0' }}>{report.integrations.mercadopago.enabled ? 'Sim' : 'Não'}</strong> •{' '}
                      Ambiente: <strong style={{ color: '#E2E8F0' }}>{report.integrations.mercadopago.sandbox ? 'Sandbox' : 'Produção'}</strong> •{' '}
                      Token: <strong style={{ color: '#E2E8F0' }}>{report.integrations.mercadopago.hasAccessToken ? 'OK' : 'Ausente'}</strong> •{' '}
                      Public Key: <strong style={{ color: '#E2E8F0' }}>{report.integrations.mercadopago.hasPublicKey ? 'OK' : 'Ausente'}</strong>
                    </div>
                  </div>

                  <div style={{ padding: 10, borderRadius: 9, backgroundColor: '#0F172A', border: '1px solid #1E293B' }}>
                    <div style={{ fontWeight: 700, color: '#FFFFFF', marginBottom: 3 }}>Efí Bank</div>
                    <div style={{ color: '#94A3B8' }}>
                      Ativo: <strong style={{ color: '#E2E8F0' }}>{report.integrations.efibank.enabled ? 'Sim' : 'Desativado'}</strong> •{' '}
                      Credenciais: <strong style={{ color: '#E2E8F0' }}>{report.integrations.efibank.hasCredentials ? 'Presentes' : 'Ausentes'}</strong>
                    </div>
                  </div>

                  <div style={{ padding: 10, borderRadius: 9, backgroundColor: '#0F172A', border: '1px solid #1E293B' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#FFFFFF', marginBottom: 3 }}>
                      <Radio size={13} color="#4ADE80" /> Realtime &amp; Cloud
                    </div>
                    <div style={{ color: '#94A3B8' }}>
                      SSE ativos: <strong style={{ color: '#E2E8F0' }}>{report.integrations.realtime.activeConnections}</strong> •{' '}
                      Buffer: <strong style={{ color: '#E2E8F0' }}>{report.integrations.realtime.bufferedEvents}</strong> •{' '}
                      R2 Privado/Público: <strong style={{ color: '#E2E8F0' }}>{report.integrations.storageR2.configured ? 'Sim' : 'Não'} / {report.integrations.storageR2.publicConfigured ? 'Sim' : 'Não'}</strong>
                    </div>
                  </div>
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
                  <Cpu size={17} color="#A3E635" />
                  <span>Últimos Alertas de Auditoria ({report.recentCriticalAudit.length})</span>
                </div>

                {report.recentCriticalAudit.length === 0 ? (
                  <div style={{
                    padding: 16,
                    borderRadius: 10,
                    backgroundColor: '#0F172A',
                    border: '1px solid #1E293B',
                    color: '#94A3B8',
                    fontSize: '0.77rem'
                  }}>
                    Nenhum evento crítico ou de atenção registrado recentemente na auditoria.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {report.recentCriticalAudit.map(ev => (
                      <div
                        key={ev.id}
                        style={{
                          padding: '9px 11px',
                          borderRadius: 9,
                          backgroundColor: '#0F172A',
                          border: `1px solid ${ev.severity === 'critico' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(245, 158, 11, 0.3)'}`,
                          fontSize: '0.74rem'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                          <span style={{ fontWeight: 800, color: ev.severity === 'critico' ? '#F87171' : '#FBBF24', fontFamily: 'monospace' }}>
                            {ev.auditCode} • {ev.severity.toUpperCase()}
                          </span>
                          <span style={{ color: '#64748B', fontSize: '0.68rem' }}>
                            {new Date(ev.createdAt).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        <div style={{ color: '#E2E8F0', fontWeight: 600 }}>{ev.title}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
