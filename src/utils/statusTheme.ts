export interface LatencySample {
  time: string;
  latencyMs: number;
  heapMb: number;
  sseCount: number;
}

export interface DailyRideMetric {
  date: string;
  label: string;
  completed: number;
  active: number;
  cancelled: number;
  total: number;
}

export interface PaymentSummaryMetric {
  confirmed: number;
  pending: number;
  failed: number;
  refunded: number;
  byMethod: {
    pix: number;
    cartao_credito: number;
    cartao_debito: number;
    dinheiro: number;
    carteira: number;
  };
}

export interface TableStatMetric {
  name: string;
  label: string;
  count: number;
  sizeBytes: number | null;
  sizeFormatted: string;
  status: 'ok' | 'missing' | 'error';
}

export const TRAFFIC_COLORS = {
  green: {
    solid: '#22C55E',
    text: '#4ADE80',
    bg: 'rgba(34, 197, 94, 0.14)',
    border: 'rgba(34, 197, 94, 0.42)'
  },
  orange: {
    solid: '#F97316',
    text: '#FB923C',
    bg: 'rgba(249, 115, 22, 0.14)',
    border: 'rgba(249, 115, 22, 0.42)'
  },
  red: {
    solid: '#EF4444',
    text: '#F87171',
    bg: 'rgba(239, 68, 68, 0.15)',
    border: 'rgba(239, 68, 68, 0.45)'
  },
  gray: {
    solid: '#64748B',
    text: '#94A3B8',
    bg: 'rgba(100, 116, 139, 0.14)',
    border: 'rgba(100, 116, 139, 0.35)'
  }
} as const;

export function getTrafficPaletteByScore(score: number, overallStatus?: string) {
  if (overallStatus === 'critical' || score < 60) return TRAFFIC_COLORS.red;
  if (overallStatus === 'degraded' || score < 90) return TRAFFIC_COLORS.orange;
  return TRAFFIC_COLORS.green;
}

export function getLatencyColor(latencyMs: number | null) {
  if (latencyMs === null) return TRAFFIC_COLORS.red;
  if (latencyMs <= 200) return TRAFFIC_COLORS.green;
  if (latencyMs <= 500) return TRAFFIC_COLORS.orange;
  return TRAFFIC_COLORS.red;
}
