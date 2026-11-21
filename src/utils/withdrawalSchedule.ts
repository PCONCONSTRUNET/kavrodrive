import { SystemConfig } from '../types';

export interface WeekdayOption {
  value: number;
  short: string;
  label: string;
}

export const WEEKDAY_OPTIONS: WeekdayOption[] = [
  { value: 0, short: 'Dom', label: 'Domingo' },
  { value: 1, short: 'Seg', label: 'Segunda-feira' },
  { value: 2, short: 'Ter', label: 'Terça-feira' },
  { value: 3, short: 'Qua', label: 'Quarta-feira' },
  { value: 4, short: 'Qui', label: 'Quinta-feira' },
  { value: 5, short: 'Sex', label: 'Sexta-feira' },
  { value: 6, short: 'Sáb', label: 'Sábado' },
];

export const DEFAULT_WITHDRAWAL_WEEKDAYS: number[] = [5];

const TZ_WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function normalizeWithdrawalWeekdays(raw?: unknown): number[] {
  if (!Array.isArray(raw)) return [...DEFAULT_WITHDRAWAL_WEEKDAYS];
  const valid = raw
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return Array.from(new Set(valid)).sort((a, b) => a - b);
}

export function getBrazilWeekdayIndex(date: Date = new Date()): number {
  try {
    const short = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'short',
    }).format(date);
    if (short in TZ_WEEKDAY_TO_INDEX) {
      return TZ_WEEKDAY_TO_INDEX[short];
    }
  } catch {
    // fallback local
  }
  return date.getDay();
}

export function getWeekdayLabel(dayIndex: number, useShort = false): string {
  const found = WEEKDAY_OPTIONS.find((d) => d.value === dayIndex);
  if (!found) return '';
  return useShort ? found.short : found.label;
}

export function formatWithdrawalWeekdaysText(weekdays: number[]): string {
  const clean = normalizeWithdrawalWeekdays(weekdays);
  if (clean.length === 0) return 'Nenhum dia configurado';
  if (clean.length === 7) return 'Todos os dias';
  if (clean.length === 1 && clean[0] === 5) return 'Somente Sexta-feira';
  if (clean.length === 1) return `Somente ${getWeekdayLabel(clean[0])}`;
  const names = clean.map((d) => getWeekdayLabel(d));
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

export interface WithdrawalAvailabilityInfo {
  enabled: boolean;
  allowedWeekdays: number[];
  currentWeekday: number;
  currentWeekdayLabel: string;
  isAllowedToday: boolean;
  canRequestNow: boolean;
  isFridayOnlyDefault: boolean;
  daysText: string;
  headline: string;
  subline: string;
  buttonText: string;
  blockedReason: string;
}

export function evaluateDriverWithdrawalRule(
  config?: Pick<SystemConfig, 'driverWithdrawalEnabled' | 'driverWithdrawalWeekdays'> | null,
  now: Date = new Date()
): WithdrawalAvailabilityInfo {
  const enabled = config?.driverWithdrawalEnabled !== false;
  const allowedWeekdays = normalizeWithdrawalWeekdays(config?.driverWithdrawalWeekdays);
  const currentWeekday = getBrazilWeekdayIndex(now);
  const currentWeekdayLabel = getWeekdayLabel(currentWeekday);
  const isFridayOnlyDefault = allowedWeekdays.length === 1 && allowedWeekdays[0] === 5;
  const daysText = formatWithdrawalWeekdaysText(allowedWeekdays);
  const isAllowedToday = allowedWeekdays.includes(currentWeekday);
  const canRequestNow = enabled && isAllowedToday;

  if (!enabled) {
    return {
      enabled,
      allowedWeekdays,
      currentWeekday,
      currentWeekdayLabel,
      isAllowedToday,
      canRequestNow: false,
      isFridayOnlyDefault,
      daysText,
      headline: 'Saques temporariamente desabilitados',
      subline: isFridayOnlyDefault
        ? 'Programação padrão: toda Sexta-feira é dia de fazer saque (botão pausado pelo Admin).'
        : `Programação salva: ${daysText} (botão pausado pelo Admin).`,
      buttonText: 'Saque Desabilitado',
      blockedReason: 'As solicitações de saque PIX estão temporariamente desabilitadas pela administração.',
    };
  }

  if (allowedWeekdays.length === 0) {
    return {
      enabled,
      allowedWeekdays,
      currentWeekday,
      currentWeekdayLabel,
      isAllowedToday: false,
      canRequestNow: false,
      isFridayOnlyDefault: false,
      daysText,
      headline: 'Nenhum dia de saque liberado no momento',
      subline: 'Aguarde a administração liberar os dias permitidos para saque.',
      buttonText: 'Saque Indisponível',
      blockedReason: 'Nenhum dia da semana está liberado para solicitação de saque no momento.',
    };
  }

  if (isAllowedToday) {
    return {
      enabled,
      allowedWeekdays,
      currentWeekday,
      currentWeekdayLabel,
      isAllowedToday: true,
      canRequestNow: true,
      isFridayOnlyDefault,
      daysText,
      headline: isFridayOnlyDefault
        ? 'Hoje é Sexta-feira — Dia de Fazer Saque!'
        : `Hoje (${currentWeekdayLabel}) o saque PIX está liberado!`,
      subline: isFridayOnlyDefault
        ? 'Toda Sexta-feira é dia de fazer saque na Kavro Drive.'
        : `Dias configurados para saque: ${daysText}.`,
      buttonText: 'Solicitar Saque PIX',
      blockedReason: '',
    };
  }

  return {
    enabled,
    allowedWeekdays,
    currentWeekday,
    currentWeekdayLabel,
    isAllowedToday: false,
    canRequestNow: false,
    isFridayOnlyDefault,
    daysText,
    headline: isFridayOnlyDefault
      ? 'Toda Sexta-feira é dia de fazer saque (somente Sexta-feira)'
      : `Saques liberados somente: ${daysText}`,
    subline: isFridayOnlyDefault
      ? `Hoje é ${currentWeekdayLabel}. Volte na Sexta-feira para solicitar seu saque PIX.`
      : `Hoje é ${currentWeekdayLabel}. Solicitação liberada em: ${daysText}.`,
    buttonText: isFridayOnlyDefault ? 'Saque somente na Sexta-feira' : `Saque em: ${daysText}`,
    blockedReason: isFridayOnlyDefault
      ? 'Saques liberados somente às Sextas-feiras (toda Sexta-feira é dia de fazer saque).'
      : `Saques liberados apenas nos dias configurados: ${daysText}.`,
  };
}
