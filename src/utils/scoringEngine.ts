import { ClientProfile, DriverProfile, DriverWalletSummary, Ride } from '../types';

export interface ScoreFactor {
  id: string;
  label: string;
  points: number;
  positive: boolean;
  detail: string;
}

export interface AutoScoreResult {
  score: number;
  maxScore: number;
  level: 'Diamante' | 'Ouro' | 'Prata' | 'Iniciante' | 'Atenção';
  levelBg: string;
  levelColor: string;
  levelBorder: string;
  averageRating: number;
  ratedCount: number;
  fiveStarCount: number;
  totalRides: number;
  completedRides: number;
  cancelledRides: number;
  completionRate: number;
  breakdown: ScoreFactor[];
}

function resolveTier(score: number): Pick<AutoScoreResult, 'level' | 'levelBg' | 'levelColor' | 'levelBorder'> {
  if (score >= 880) {
    return { level: 'Diamante', levelBg: '#EFF6FF', levelColor: '#1D4ED8', levelBorder: '#BFDBFE' };
  }
  if (score >= 740) {
    return { level: 'Ouro', levelBg: '#FFFBEB', levelColor: '#B45309', levelBorder: '#FDE68A' };
  }
  if (score >= 580) {
    return { level: 'Prata', levelBg: '#F1F5F9', levelColor: '#334155', levelBorder: '#CBD5E1' };
  }
  if (score >= 420) {
    return { level: 'Iniciante', levelBg: '#F8FAFC', levelColor: '#475569', levelBorder: '#E2E8F0' };
  }
  return { level: 'Atenção', levelBg: '#FEF2F2', levelColor: '#B91C1C', levelBorder: '#FECACA' };
}

/**
 * Calcula automaticamente a Pontuação Kavro Score (0 a 1.000 pts) e a reputação
 * real do Motorista Parceiro com base em corridas, avaliações, KYC, termo e carteira.
 */
export function computeDriverAutoScore(
  driver: DriverProfile,
  driverRides: Ride[],
  wallet?: DriverWalletSummary | null
): AutoScoreResult {
  const completed = driverRides.filter(r => r.status === 'finalizada');
  const cancelled = driverRides.filter(r => r.status === 'cancelada');
  const totalRides = driverRides.length;
  const completionRate = totalRides > 0 ? Math.round((completed.length / totalRides) * 100) : 100;

  // Avaliações recebidas do passageiro (passengerRating) — fallback apenas se houver campo explícito
  const explicitRatings = driverRides
    .map(r => (typeof r.passengerRating === 'number' && r.passengerRating > 0 ? r.passengerRating : null))
    .filter((v): v is number => v !== null);

  const ratedCount = explicitRatings.length;
  const fiveStarCount = explicitRatings.filter(v => v >= 4.9).length;
  const averageRating =
    ratedCount > 0
      ? Number((explicitRatings.reduce((sum, n) => sum + n, 0) / ratedCount).toFixed(2))
      : Number(driver.rating || 5.0);

  const breakdown: ScoreFactor[] = [];
  let score = 400;
  breakdown.push({
    id: 'base',
    label: 'Cadastro Base na Frota',
    points: 400,
    positive: true,
    detail: 'Pontuação inicial de entrada na Kavro Drive',
  });

  const kycOk = driver.approvalStatus === 'aprovado' || driver.kyc?.status === 'aprovado';
  if (kycOk) {
    score += 120;
    breakdown.push({
      id: 'kyc',
      label: 'KYC Facial & Documentos Aprovados',
      points: 120,
      positive: true,
      detail: 'Identidade e CNH validadas na plataforma',
    });
  }

  if (driver.termsSignature?.signed) {
    score += 100;
    breakdown.push({
      id: 'terms',
      label: 'Termo de Parceria Assinado (SHA-256)',
      points: 100,
      positive: true,
      detail: 'Aceite jurídico completo registrado',
    });
  }

  if (driver.cnhHasEar !== false && (driver.cnh || '').replace(/\D/g, '').length >= 9) {
    score += 40;
    breakdown.push({
      id: 'ear',
      label: 'CNH Regular com EAR',
      points: 40,
      positive: true,
      detail: 'Exerce Atividade Remunerada verificado',
    });
  }

  if (completed.length > 0) {
    const ridePts = Math.min(200, completed.length * 20);
    score += ridePts;
    breakdown.push({
      id: 'completed',
      label: `${completed.length} Corrida(s) Concluída(s)`,
      points: ridePts,
      positive: true,
      detail: '+20 pts por viagem finalizada (máx. 200 pts)',
    });

    const ratePts = Math.round((completionRate / 100) * 80);
    score += ratePts;
    breakdown.push({
      id: 'rate',
      label: `Taxa de Conclusão (${completionRate}%)`,
      points: ratePts,
      positive: true,
      detail: 'Bônus automático de pontualidade e compromisso',
    });
  }

  if (ratedCount > 0) {
    const starBonus = averageRating >= 4.8 ? 60 : averageRating >= 4.5 ? 40 : averageRating >= 4.0 ? 15 : -40;
    score += starBonus;
    breakdown.push({
      id: 'stars',
      label: `Média Real dos Passageiros (${averageRating.toFixed(2)}★)`,
      points: starBonus,
      positive: starBonus >= 0,
      detail: `Baseado em ${ratedCount} avaliação(ões) registrada(s)`,
    });
  }

  if (cancelled.length > 0) {
    const penalty = Math.min(180, cancelled.length * 35);
    score -= penalty;
    breakdown.push({
      id: 'cancels',
      label: `${cancelled.length} Corrida(s) Cancelada(s)`,
      points: -penalty,
      positive: false,
      detail: '-35 pts por cancelamento registrado',
    });
  }

  const debt = wallet?.debtBalance ?? 0;
  if (driver.approvalStatus === 'bloqueado' || debt > 0) {
    const penalty = driver.approvalStatus === 'bloqueado' ? 120 : 40;
    score -= penalty;
    breakdown.push({
      id: 'financial',
      label: driver.approvalStatus === 'bloqueado' ? 'Cadastro Bloqueado / Inadimplência' : 'Saldo Devedor em Aberto',
      points: -penalty,
      positive: false,
      detail: driver.approvalStatus === 'bloqueado' ? 'Bloqueio operacional ativo' : `Dívida pendente de R$ ${debt.toFixed(2)}`,
    });
  }

  score = Math.max(0, Math.min(1000, Math.round(score)));
  const tier = resolveTier(score);

  return {
    score,
    maxScore: 1000,
    ...tier,
    averageRating,
    ratedCount,
    fiveStarCount,
    totalRides,
    completedRides: completed.length,
    cancelledRides: cancelled.length,
    completionRate,
    breakdown,
  };
}

/**
 * Calcula automaticamente a Pontuação Kavro Score (0 a 1.000 pts) e a reputação
 * do Passageiro com base em corridas concluídas, cancelamentos, documento, termo e notas.
 */
export function computeClientAutoScore(client: ClientProfile, clientRides: Ride[]): AutoScoreResult {
  const completed = clientRides.filter(r => r.status === 'finalizada');
  const cancelled = clientRides.filter(r => r.status === 'cancelada');
  const totalRides = clientRides.length;
  const completionRate = totalRides > 0 ? Math.round((completed.length / totalRides) * 100) : 100;

  const explicitRatings = clientRides
    .map(r => (typeof r.driverRating === 'number' && r.driverRating > 0 && r.status === 'finalizada' ? r.driverRating : null))
    .filter((v): v is number => v !== null);

  const ratedCount = explicitRatings.length;
  const fiveStarCount = explicitRatings.filter(v => v >= 4.9).length;
  const averageRating =
    ratedCount > 0
      ? Number((explicitRatings.reduce((sum, n) => sum + n, 0) / ratedCount).toFixed(2))
      : 5.0;

  const breakdown: ScoreFactor[] = [];
  let score = 450;
  breakdown.push({
    id: 'base',
    label: 'Cadastro Base do Passageiro',
    points: 450,
    positive: true,
    detail: 'Pontuação inicial da conta na Kavro Drive',
  });

  if ((client.document || '').replace(/\D/g, '').length >= 11) {
    score += 120;
    breakdown.push({
      id: 'doc',
      label: 'CPF / Documento Informado',
      points: 120,
      positive: true,
      detail: 'Identificação documental preenchida no cadastro',
    });
  }

  if (client.termsSignature?.signed || client.termsAcceptedAt) {
    const pts = client.termsSignature?.signed ? 100 : 60;
    score += pts;
    breakdown.push({
      id: 'terms',
      label: client.termsSignature?.signed ? 'Termos Assinados Digitalmente' : 'Aceite de Termos Registrado',
      points: pts,
      positive: true,
      detail: 'Conformidade com regras de uso da plataforma',
    });
  }

  if (completed.length > 0) {
    const ridePts = Math.min(150, completed.length * 25);
    score += ridePts;
    breakdown.push({
      id: 'completed',
      label: `${completed.length} Viagem(ns) Concluída(s)`,
      points: ridePts,
      positive: true,
      detail: '+25 pts por corrida realizada (máx. 150 pts)',
    });

    const ratePts = Math.round((completionRate / 100) * 70);
    score += ratePts;
    breakdown.push({
      id: 'rate',
      label: `Assiduidade nas Solicitações (${completionRate}%)`,
      points: ratePts,
      positive: true,
      detail: 'Percentual de corridas concluídas sem cancelamento',
    });
  }

  if (ratedCount > 0) {
    const starBonus = averageRating >= 4.8 ? 110 : averageRating >= 4.4 ? 70 : averageRating >= 4.0 ? 30 : -40;
    score += starBonus;
    breakdown.push({
      id: 'stars',
      label: `Avaliação dos Motoristas (${averageRating.toFixed(2)}★)`,
      points: starBonus,
      positive: starBonus >= 0,
      detail: `Baseado em ${ratedCount} corrida(s) avaliada(s)`,
    });
  }

  if (cancelled.length > 0) {
    const penalty = Math.min(200, cancelled.length * 40);
    score -= penalty;
    breakdown.push({
      id: 'cancels',
      label: `${cancelled.length} Corrida(s) Cancelada(s)`,
      points: -penalty,
      positive: false,
      detail: '-40 pts por cancelamento registrado',
    });
  }

  score = Math.max(0, Math.min(1000, Math.round(score)));
  const tier = resolveTier(score);

  return {
    score,
    maxScore: 1000,
    ...tier,
    averageRating,
    ratedCount,
    fiveStarCount,
    totalRides,
    completedRides: completed.length,
    cancelledRides: cancelled.length,
    completionRate,
    breakdown,
  };
}
