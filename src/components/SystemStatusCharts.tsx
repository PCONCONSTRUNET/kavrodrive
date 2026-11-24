import React from 'react';
import { Activity, Cpu, CreditCard, Database, HardDrive } from 'lucide-react';
import {
  DailyRideMetric,
  LatencySample,
  PaymentSummaryMetric,
  TableStatMetric,
  TRAFFIC_COLORS,
  getLatencyColor,
  getTrafficPaletteByScore
} from '../utils/statusTheme';

export const HealthGaugeCard: React.FC<{
  score: number;
  overallStatus: 'operational' | 'degraded' | 'critical';
  label: string;
  summary: string;
  statusCounts: { ok: number; warn: number; error: number; inactive: number };
  generatedAt: string;
  instanceNote: string;
}> = ({ score, overallStatus, label, summary, statusCounts, generatedAt, instanceNote }) => {
  const palette = getTrafficPaletteByScore(score, overallStatus);
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);
  const totalChecks = Math.max(1, statusCounts.ok + statusCounts.warn + statusCounts.error + statusCounts.inactive);

  return (
    <div style={{
      padding: 20,
      borderRadius: 16,
      border: `1px solid ${palette.border}`,
      background: `linear-gradient(135deg, ${palette.bg} 0%, rgba(15, 23, 42, 0.94) 68%)`,
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
      gap: 20,
      alignItems: 'center'
    }}>
      {/* Esquerda: Medidor Circular SVG + Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ position: 'relative', width: 124, height: 124, flexShrink: 0 }}>
          <svg width="124" height="124" viewBox="0 0 124 124" style={{ transform: 'rotate(-90deg)' }}>
            <circle
              cx="62"
              cy="62"
              r={radius}
              fill="none"
              stroke="rgba(148, 163, 184, 0.16)"
              strokeWidth="12"
            />
            <circle
              cx="62"
              cy="62"
              r={radius}
              fill="none"
              stroke={palette.solid}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center'
          }}>
            <span style={{ fontSize: '1.65rem', fontWeight: 900, color: '#FFFFFF', lineHeight: 1 }}>
              {clamped}
            </span>
            <span style={{ fontSize: '0.66rem', fontWeight: 700, color: palette.text, textTransform: 'uppercase', marginTop: 2 }}>
              / 100 PTS
            </span>
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 10px',
              borderRadius: 999,
              backgroundColor: palette.bg,
              border: `1px solid ${palette.border}`,
              color: palette.text,
              fontSize: '0.7rem',
              fontWeight: 800,
              letterSpacing: '0.04em'
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: palette.solid }} />
              {overallStatus === 'operational' ? 'VERDE • OPERACIONAL' : overallStatus === 'degraded' ? 'LARANJA • ATENÇÃO' : 'VERMELHO • CRÍTICO'}
            </span>
          </div>
          <h2 style={{ margin: '8px 0 4px 0', fontSize: '1.22rem', fontWeight: 900, color: '#FFFFFF' }}>
            {label}
          </h2>
          <p style={{ margin: 0, fontSize: '0.8rem', color: '#E2E8F0', lineHeight: 1.45 }}>
            {summary}
          </p>
          <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: 6 }}>
            Atualizado em {new Date(generatedAt).toLocaleString('pt-BR')} • {instanceNote}
          </div>
        </div>
      </div>

      {/* Direita: Painel Semafórico (Verde / Laranja / Vermelho / Cinza) */}
      <div style={{
        padding: 14,
        borderRadius: 12,
        backgroundColor: 'rgba(15, 23, 42, 0.78)',
        border: '1px solid #1E293B',
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', fontWeight: 700, color: '#CBD5E1' }}>
          <span>Semáforo dos Módulos ({totalChecks} monitorados)</span>
          <span style={{ color: '#94A3B8', fontSize: '0.68rem' }}>Verde • Laranja • Vermelho</span>
        </div>

        {/* Barra Semafórica Segmentada */}
        <div style={{
          height: 12,
          borderRadius: 999,
          overflow: 'hidden',
          display: 'flex',
          backgroundColor: '#1E293B',
          gap: 2
        }}>
          {statusCounts.ok > 0 && (
            <div
              title={`${statusCounts.ok} módulo(s) saudáveis (Verde)`}
              style={{ width: `${(statusCounts.ok / totalChecks) * 100}%`, backgroundColor: TRAFFIC_COLORS.green.solid }}
            />
          )}
          {statusCounts.warn > 0 && (
            <div
              title={`${statusCounts.warn} módulo(s) em atenção (Laranja)`}
              style={{ width: `${(statusCounts.warn / totalChecks) * 100}%`, backgroundColor: TRAFFIC_COLORS.orange.solid }}
            />
          )}
          {statusCounts.error > 0 && (
            <div
              title={`${statusCounts.error} módulo(s) com falha (Vermelho)`}
              style={{ width: `${(statusCounts.error / totalChecks) * 100}%`, backgroundColor: TRAFFIC_COLORS.red.solid }}
            />
          )}
          {statusCounts.inactive > 0 && (
            <div
              title={`${statusCounts.inactive} módulo(s) desativados (Cinza)`}
              style={{ width: `${(statusCounts.inactive / totalChecks) * 100}%`, backgroundColor: TRAFFIC_COLORS.gray.solid }}
            />
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            { label: 'Saudáveis', val: statusCounts.ok, theme: TRAFFIC_COLORS.green },
            { label: 'Atenção', val: statusCounts.warn, theme: TRAFFIC_COLORS.orange },
            { label: 'Críticos', val: statusCounts.error, theme: TRAFFIC_COLORS.red },
            { label: 'Off / Inativo', val: statusCounts.inactive, theme: TRAFFIC_COLORS.gray }
          ].map(item => (
            <div
              key={item.label}
              style={{
                padding: '8px 6px',
                borderRadius: 8,
                backgroundColor: item.theme.bg,
                border: `1px solid ${item.theme.border}`,
                textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '1.15rem', fontWeight: 900, color: item.theme.text, lineHeight: 1.1 }}>
                {item.val}
              </div>
              <div style={{ fontSize: '0.64rem', fontWeight: 700, color: '#E2E8F0', marginTop: 2 }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const LatencyHistoryChart: React.FC<{
  samples: LatencySample[];
  currentLatencyMs: number | null;
}> = ({ samples, currentLatencyMs }) => {
  const width = 480;
  const height = 180;
  const padL = 42;
  const padR = 14;
  const padT = 18;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const validVals = samples.map(s => s.latencyMs).filter(v => Number.isFinite(v));
  const rawMax = validVals.length > 0 ? Math.max(...validVals, 550) : 600;
  const yMax = Math.ceil(rawMax / 100) * 100;
  const yFor = (val: number) => padT + plotH - (Math.min(yMax, Math.max(0, val)) / yMax) * plotH;

  const minMs = validVals.length > 0 ? Math.min(...validVals) : null;
  const maxMs = validVals.length > 0 ? Math.max(...validVals) : null;
  const avgMs = validVals.length > 0
    ? Number((validVals.reduce((acc, v) => acc + v, 0) / validVals.length).toFixed(1))
    : null;

  const pts = samples.map((s, idx) => {
    const x = samples.length === 1
      ? padL + plotW / 2
      : padL + (idx / Math.max(1, samples.length - 1)) * plotW;
    const y = yFor(s.latencyMs);
    return { x, y, sample: s };
  });

  const polylinePoints = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPoints = pts.length > 1
    ? `${pts[0].x.toFixed(1)},${(padT + plotH).toFixed(1)} ${polylinePoints} ${pts[pts.length - 1].x.toFixed(1)},${(padT + plotH).toFixed(1)}`
    : '';
  const currentColor = getLatencyColor(currentLatencyMs);

  const greenTopY = yFor(200);
  const orangeTopY = yFor(500);

  return (
    <div style={{
      padding: 18,
      borderRadius: 14,
      backgroundColor: '#111827',
      border: '1px solid #1E293B',
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={17} color={currentColor.solid} />
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#FFFFFF' }}>
              Latência do Banco Ao Vivo (ms)
            </div>
            <div style={{ fontSize: '0.69rem', color: '#94A3B8' }}>
              Faixas: Verde &lt;200ms • Laranja 200–500ms • Vermelho &gt;500ms
            </div>
          </div>
        </div>
        <span style={{
          padding: '3px 9px',
          borderRadius: 999,
          fontSize: '0.73rem',
          fontWeight: 800,
          backgroundColor: currentColor.bg,
          border: `1px solid ${currentColor.border}`,
          color: currentColor.text
        }}>
          {currentLatencyMs !== null ? `${currentLatencyMs} ms` : 'OFFLINE'}
        </span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 185, display: 'block' }}>
        {/* Zonas semafóricas de fundo */}
        <rect x={padL} y={padT} width={plotW} height={Math.max(0, orangeTopY - padT)} fill="rgba(239, 68, 68, 0.08)" />
        <rect x={padL} y={orangeTopY} width={plotW} height={Math.max(0, greenTopY - orangeTopY)} fill="rgba(249, 115, 22, 0.08)" />
        <rect x={padL} y={greenTopY} width={plotW} height={Math.max(0, padT + plotH - greenTopY)} fill="rgba(34, 197, 94, 0.08)" />

        {/* Linhas de referência 500ms e 200ms */}
        <line x1={padL} x2={padL + plotW} y1={orangeTopY} y2={orangeTopY} stroke="#EF4444" strokeOpacity="0.45" strokeDasharray="4 4" />
        <text x={padL - 5} y={orangeTopY + 3} textAnchor="end" fontSize="9.5" fill="#F87171" fontFamily="monospace">500</text>

        <line x1={padL} x2={padL + plotW} y1={greenTopY} y2={greenTopY} stroke="#F97316" strokeOpacity="0.5" strokeDasharray="4 4" />
        <text x={padL - 5} y={greenTopY + 3} textAnchor="end" fontSize="9.5" fill="#FB923C" fontFamily="monospace">200</text>

        <line x1={padL} x2={padL + plotW} y1={padT + plotH} y2={padT + plotH} stroke="#334155" strokeWidth="1" />
        <text x={padL - 5} y={padT + plotH + 3} textAnchor="end" fontSize="9.5" fill="#94A3B8" fontFamily="monospace">0ms</text>

        {areaPoints && (
          <polygon points={areaPoints} fill={currentColor.solid} fillOpacity="0.16" />
        )}
        {pts.length > 1 && (
          <polyline
            fill="none"
            stroke={currentColor.solid}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={polylinePoints}
          />
        )}

        {pts.map((p, idx) => {
          const dotTheme = getLatencyColor(p.sample.latencyMs);
          const showLabel = idx === 0 || idx === pts.length - 1;
          return (
            <g key={`${p.sample.time}-${idx}`}>
              <circle
                cx={p.x}
                cy={p.y}
                r={pts.length === 1 ? 6 : 4}
                fill={dotTheme.solid}
                stroke="#0B1117"
                strokeWidth="1.5"
              >
                <title>{`${p.sample.time}: ${p.sample.latencyMs} ms`}</title>
              </circle>
              {showLabel && (
                <text
                  x={p.x}
                  y={height - 6}
                  textAnchor={pts.length === 1 ? 'middle' : idx === 0 ? 'start' : 'end'}
                  fontSize="9.5"
                  fill="#94A3B8"
                  fontFamily="monospace"
                >
                  {p.sample.time}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: '0.72rem' }}>
        <div style={{ padding: '7px 10px', borderRadius: 8, backgroundColor: '#0F172A', border: '1px solid #1E293B' }}>
          <span style={{ color: '#94A3B8' }}>Mínima: </span>
          <strong style={{ color: '#4ADE80' }}>{minMs !== null ? `${minMs} ms` : '—'}</strong>
        </div>
        <div style={{ padding: '7px 10px', borderRadius: 8, backgroundColor: '#0F172A', border: '1px solid #1E293B' }}>
          <span style={{ color: '#94A3B8' }}>Média ({samples.length}x): </span>
          <strong style={{ color: '#FFFFFF' }}>{avgMs !== null ? `${avgMs} ms` : '—'}</strong>
        </div>
        <div style={{ padding: '7px 10px', borderRadius: 8, backgroundColor: '#0F172A', border: '1px solid #1E293B' }}>
          <span style={{ color: '#94A3B8' }}>Pico Máx.: </span>
          <strong style={{ color: getLatencyColor(maxMs).text }}>{maxMs !== null ? `${maxMs} ms` : '—'}</strong>
        </div>
      </div>
    </div>
  );
};

export const Rides7DaysBarChart: React.FC<{
  days: DailyRideMetric[];
}> = ({ days }) => {
  const width = 480;
  const height = 180;
  const padL = 28;
  const padR = 14;
  const padT = 22;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const list = days.length > 0 ? days : [];
  const maxDayTotal = Math.max(4, ...list.map(d => d.total || 0));
  const barSlotW = list.length > 0 ? plotW / list.length : plotW;
  const barW = Math.min(34, Math.max(16, barSlotW * 0.56));

  const totals = list.reduce(
    (acc, d) => ({
      completed: acc.completed + d.completed,
      active: acc.active + d.active,
      cancelled: acc.cancelled + d.cancelled
    }),
    { completed: 0, active: 0, cancelled: 0 }
  );

  return (
    <div style={{
      padding: 18,
      borderRadius: 14,
      backgroundColor: '#111827',
      border: '1px solid #1E293B',
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#FFFFFF' }}>
            Corridas nos Últimos 7 Dias (Banco Real)
          </div>
          <div style={{ fontSize: '0.69rem', color: '#94A3B8' }}>
            Distribuição diária por desfecho operacional
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, fontSize: '0.68rem', fontWeight: 700, flexWrap: 'wrap' }}>
          <span style={{ color: '#4ADE80' }}>● Concluídas ({totals.completed})</span>
          <span style={{ color: '#FB923C' }}>● Ativas ({totals.active})</span>
          <span style={{ color: '#F87171' }}>● Canceladas ({totals.cancelled})</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 185, display: 'block' }}>
        {[0, 0.5, 1].map((frac, idx) => {
          const y = padT + plotH * (1 - frac);
          const val = Math.round(maxDayTotal * frac);
          return (
            <g key={idx}>
              <line x1={padL} x2={padL + plotW} y1={y} y2={y} stroke="#1E293B" strokeWidth="1" />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="9.5" fill="#64748B" fontFamily="monospace">
                {val}
              </text>
            </g>
          );
        })}

        {list.map((d, i) => {
          const cx = padL + i * barSlotW + barSlotW / 2;
          const x = cx - barW / 2;
          const completedH = (d.completed / maxDayTotal) * plotH;
          const activeH = (d.active / maxDayTotal) * plotH;
          const cancelledH = (d.cancelled / maxDayTotal) * plotH;
          const baseBottom = padT + plotH;
          const totalH = completedH + activeH + cancelledH;

          return (
            <g key={d.date || i}>
              {/* Barra fantasma de fundo */}
              <rect
                x={x}
                y={padT}
                width={barW}
                height={plotH}
                rx="4"
                fill="rgba(30, 41, 59, 0.35)"
              />
              {/* Verde: Concluídas (base) */}
              {completedH > 0 && (
                <rect
                  x={x}
                  y={baseBottom - completedH}
                  width={barW}
                  height={completedH}
                  fill="#22C55E"
                  rx="2"
                >
                  <title>{`${d.label}: ${d.completed} concluída(s)`}</title>
                </rect>
              )}
              {/* Laranja: Ativas */}
              {activeH > 0 && (
                <rect
                  x={x}
                  y={baseBottom - completedH - activeH}
                  width={barW}
                  height={activeH}
                  fill="#F97316"
                  rx="2"
                >
                  <title>{`${d.label}: ${d.active} ativa(s)`}</title>
                </rect>
              )}
              {/* Vermelho: Canceladas */}
              {cancelledH > 0 && (
                <rect
                  x={x}
                  y={baseBottom - totalH}
                  width={barW}
                  height={cancelledH}
                  fill="#EF4444"
                  rx="2"
                >
                  <title>{`${d.label}: ${d.cancelled} cancelada(s)`}</title>
                </rect>
              )}
              {d.total > 0 && (
                <text
                  x={cx}
                  y={Math.max(12, baseBottom - totalH - 5)}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  fill="#E2E8F0"
                >
                  {d.total}
                </text>
              )}
              <text
                x={cx}
                y={height - 6}
                textAnchor="middle"
                fontSize="10"
                fill="#94A3B8"
                fontFamily="monospace"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: '0.72rem' }}>
        <div style={{ padding: '7px 10px', borderRadius: 8, backgroundColor: TRAFFIC_COLORS.green.bg, border: `1px solid ${TRAFFIC_COLORS.green.border}` }}>
          <span style={{ color: '#CBD5E1' }}>Concluídas: </span>
          <strong style={{ color: '#4ADE80' }}>{totals.completed}</strong>
        </div>
        <div style={{ padding: '7px 10px', borderRadius: 8, backgroundColor: TRAFFIC_COLORS.orange.bg, border: `1px solid ${TRAFFIC_COLORS.orange.border}` }}>
          <span style={{ color: '#CBD5E1' }}>Em Aberto: </span>
          <strong style={{ color: '#FB923C' }}>{totals.active}</strong>
        </div>
        <div style={{ padding: '7px 10px', borderRadius: 8, backgroundColor: TRAFFIC_COLORS.red.bg, border: `1px solid ${TRAFFIC_COLORS.red.border}` }}>
          <span style={{ color: '#CBD5E1' }}>Canceladas: </span>
          <strong style={{ color: '#F87171' }}>{totals.cancelled}</strong>
        </div>
      </div>
    </div>
  );
};

export const PaymentHealthDonutChart: React.FC<{
  summary: PaymentSummaryMetric;
}> = ({ summary }) => {
  const redCount = summary.failed + summary.refunded;
  const total = summary.confirmed + summary.pending + redCount;
  const radius = 44;
  const circumference = 2 * Math.PI * radius;

  const segments = [
    { key: 'confirmed', label: 'Aprovados / Pagos', count: summary.confirmed, color: '#22C55E', text: '#4ADE80' },
    { key: 'pending', label: 'Aguardando', count: summary.pending, color: '#F97316', text: '#FB923C' },
    { key: 'issues', label: 'Falhos / Estornos', count: redCount, color: '#EF4444', text: '#F87171' }
  ];

  const successRate = total > 0 ? Math.round((summary.confirmed / total) * 100) : 100;
  let cumulativeLen = 0;

  const methods = [
    { label: 'PIX', val: summary.byMethod.pix, color: '#22C55E' },
    { label: 'Cartão Créd.', val: summary.byMethod.cartao_credito, color: '#F97316' },
    { label: 'Cartão Déb.', val: summary.byMethod.cartao_debito, color: '#38BDF8' },
    { label: 'Dinheiro', val: summary.byMethod.dinheiro, color: '#A3E635' },
    { label: 'Carteira', val: summary.byMethod.carteira, color: '#C084FC' }
  ];
  const maxMethodVal = Math.max(1, ...methods.map(m => m.val));

  return (
    <div style={{
      padding: 18,
      borderRadius: 14,
      backgroundColor: '#111827',
      border: '1px solid #1E293B',
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CreditCard size={17} color={redCount > 0 ? '#FB923C' : '#22C55E'} />
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#FFFFFF' }}>
              Saúde das Transações ({total})
            </div>
            <div style={{ fontSize: '0.69rem', color: '#94A3B8' }}>
              Confirmadas vs Pendentes vs Falhas/Estornos
            </div>
          </div>
        </div>
        <span style={{
          padding: '3px 9px',
          borderRadius: 999,
          fontSize: '0.72rem',
          fontWeight: 800,
          backgroundColor: successRate >= 85 ? TRAFFIC_COLORS.green.bg : successRate >= 60 ? TRAFFIC_COLORS.orange.bg : TRAFFIC_COLORS.red.bg,
          border: `1px solid ${successRate >= 85 ? TRAFFIC_COLORS.green.border : successRate >= 60 ? TRAFFIC_COLORS.orange.border : TRAFFIC_COLORS.red.border}`,
          color: successRate >= 85 ? TRAFFIC_COLORS.green.text : successRate >= 60 ? TRAFFIC_COLORS.orange.text : TRAFFIC_COLORS.red.text
        }}>
          {total > 0 ? `${successRate}% OK` : 'Sem registros'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '126px 1fr', gap: 16, alignItems: 'center' }}>
        <div style={{ position: 'relative', width: 118, height: 118, margin: '0 auto' }}>
          <svg width="118" height="118" viewBox="0 0 118 118" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="59" cy="59" r={radius} fill="none" stroke="#1E293B" strokeWidth="14" />
            {total > 0 && segments.map(seg => {
              if (seg.count <= 0) return null;
              const segLen = (seg.count / total) * circumference;
              const offset = -cumulativeLen;
              cumulativeLen += segLen;
              return (
                <circle
                  key={seg.key}
                  cx="59"
                  cy="59"
                  r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="14"
                  strokeDasharray={`${segLen} ${circumference}`}
                  strokeDashoffset={offset}
                />
              );
            })}
          </svg>
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#FFFFFF' }}>{total}</span>
            <span style={{ fontSize: '0.62rem', color: '#94A3B8', fontWeight: 700 }}>TRANSAÇÕES</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {segments.map(seg => {
            const pct = total > 0 ? Math.round((seg.count / total) * 100) : 0;
            return (
              <div key={seg.key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem' }}>
                  <span style={{ color: '#E2E8F0', fontWeight: 600 }}>
                    <span style={{ color: seg.text }}>● </span>{seg.label}
                  </span>
                  <strong style={{ color: seg.text }}>{seg.count} ({pct}%)</strong>
                </div>
                <div style={{ height: 6, borderRadius: 999, backgroundColor: '#1E293B', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', backgroundColor: seg.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Barras por Meio de Pagamento */}
      <div style={{ paddingTop: 8, borderTop: '1px solid #1E293B', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>
          Distribuição por Meio de Pagamento
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
          {methods.map(m => (
            <div key={m.label} style={{ padding: '7px 9px', borderRadius: 8, backgroundColor: '#0F172A', border: '1px solid #1E293B' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginBottom: 4 }}>
                <span style={{ color: '#CBD5E1' }}>{m.label}</span>
                <strong style={{ color: '#FFFFFF' }}>{m.val}</strong>
              </div>
              <div style={{ height: 4, borderRadius: 999, backgroundColor: '#1E293B', overflow: 'hidden' }}>
                <div style={{ width: `${Math.round((m.val / maxMethodVal) * 100)}%`, height: '100%', backgroundColor: m.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const StorageAndPoolChartCard: React.FC<{
  pool: { max: number; totalCount: number; idleCount: number; waitingCount: number };
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
  databaseSizeBytes: number | null;
  databaseSizeFormatted: string;
  tableStats: TableStatMetric[];
}> = ({ pool, memory, databaseSizeBytes, databaseSizeFormatted, tableStats }) => {
  const heapPct = memory.heapTotalMb > 0
    ? Math.min(100, Math.round((memory.heapUsedMb / memory.heapTotalMb) * 100))
    : 0;
  const heapPalette = heapPct < 70 ? TRAFFIC_COLORS.green : heapPct < 88 ? TRAFFIC_COLORS.orange : TRAFFIC_COLORS.red;

  const poolMax = Math.max(1, pool.max || 1);
  const poolPct = Math.min(100, Math.round((pool.totalCount / poolMax) * 100));
  const poolPalette = pool.waitingCount > 0
    ? TRAFFIC_COLORS.red
    : poolPct >= 85
    ? TRAFFIC_COLORS.orange
    : TRAFFIC_COLORS.green;

  const sortedTables = tableStats
    .slice()
    .sort((a, b) => (Number(b.sizeBytes || 0) - Number(a.sizeBytes || 0)) || (b.count - a.count))
    .slice(0, 6);
  const maxWeight = Math.max(
    1,
    ...sortedTables.map(t => (databaseSizeBytes && t.sizeBytes !== null ? t.sizeBytes : t.count))
  );

  return (
    <div style={{
      padding: 18,
      borderRadius: 14,
      backgroundColor: '#111827',
      border: '1px solid #1E293B',
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <HardDrive size={17} color="#22C55E" />
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#FFFFFF' }}>
              Recursos &amp; Ocupação do Banco ({databaseSizeFormatted})
            </div>
            <div style={{ fontSize: '0.69rem', color: '#94A3B8' }}>
              Pool PostgreSQL, Memória Heap e Maiores Tabelas
            </div>
          </div>
        </div>
      </div>

      {/* Pool + Memória */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ padding: 10, borderRadius: 10, backgroundColor: '#0F172A', border: `1px solid ${poolPalette.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: 6 }}>
            <span style={{ color: '#CBD5E1', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Database size={12} color={poolPalette.solid} /> Pool DB
            </span>
            <strong style={{ color: poolPalette.text }}>{pool.totalCount}/{poolMax} • Fila {pool.waitingCount}</strong>
          </div>
          <div style={{ height: 7, borderRadius: 999, backgroundColor: '#1E293B', overflow: 'hidden' }}>
            <div style={{ width: `${poolPct}%`, height: '100%', backgroundColor: poolPalette.solid }} />
          </div>
        </div>

        <div style={{ padding: 10, borderRadius: 10, backgroundColor: '#0F172A', border: `1px solid ${heapPalette.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: 6 }}>
            <span style={{ color: '#CBD5E1', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Cpu size={12} color={heapPalette.solid} /> Memória Heap
            </span>
            <strong style={{ color: heapPalette.text }}>{memory.heapUsedMb} MB ({heapPct}%)</strong>
          </div>
          <div style={{ height: 7, borderRadius: 999, backgroundColor: '#1E293B', overflow: 'hidden' }}>
            <div style={{ width: `${heapPct}%`, height: '100%', backgroundColor: heapPalette.solid }} />
          </div>
        </div>
      </div>

      {/* Maiores Tabelas (Barras Horizontais) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>
          Top Tabelas por Espaço / Registros
        </div>
        {sortedTables.map(tbl => {
          const weight = databaseSizeBytes && tbl.sizeBytes !== null ? tbl.sizeBytes : tbl.count;
          const barPct = Math.max(4, Math.round((weight / maxWeight) * 100));
          const theme = tbl.status === 'ok'
            ? TRAFFIC_COLORS.green
            : tbl.status === 'missing'
            ? TRAFFIC_COLORS.orange
            : TRAFFIC_COLORS.red;

          return (
            <div key={tbl.name} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', gap: 8 }}>
                <span style={{ color: '#E2E8F0', fontWeight: 600 }}>
                  {tbl.label} <span style={{ color: '#64748B', fontFamily: 'monospace' }}>({tbl.name})</span>
                </span>
                <span style={{ color: '#CBD5E1', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                  {tbl.count} reg • <strong style={{ color: theme.text }}>{tbl.sizeFormatted}</strong>
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 999, backgroundColor: '#1E293B', overflow: 'hidden' }}>
                <div style={{ width: `${barPct}%`, height: '100%', backgroundColor: theme.solid }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
