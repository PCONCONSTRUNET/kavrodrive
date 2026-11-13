import React, { useState } from 'react';
import {
  Landmark, TrendingUp, ArrowUpRight, ArrowDownRight, Plus, Trash2,
  CreditCard, QrCode, Banknote, Send, Wallet, Receipt, ChevronRight
} from 'lucide-react';
import { Expense, PaymentMethod } from '../types';

export interface TreasuryMetrics {
  ridesCount: number;
  gross: number;
  platformFee: number;
  driverNet: number;
  refundedTotal: number;
  avgTicket: number;
  pixCount: number;
  pixGross: number;
  pixFee: number;
  cardCount: number;
  cardGross: number;
  cardFee: number;
  cashCount: number;
  cashGross: number;
  cashFee: number;
  digitalInflow: number;
  paidWithdrawals: number;
  paidWithdrawalsCount: number;
  pendingWithdrawals: number;
  pendingWithdrawalsCount: number;
  debtSettlementsReceived: number;
  totalAvailableForDrivers: number;
  totalPendingDriverDebt: number;
  delinquentDriversCount: number;
  directRevenues: number;
  operationalExpenses: number;
  grossProfit: number;
  netProfit: number;
  cashBalance: number;
}

interface AdminFinanceTreasurySectionProps {
  currentCommPct: number;
  periodLabel: string;
  metrics: TreasuryMetrics;
  expenses: Expense[];
  onSaveExpense: (expense: Expense) => void;
  onDeleteExpense: (id: string) => void;
  onNavigateSubTab: (tab: 'corridas_split' | 'saques' | 'motoristas' | 'livro_razao') => void;
}

const formatBRL = (val: number) =>
  `R$ ${Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const EXPENSE_CATEGORIES = {
  saida: ['Tráfego & Marketing', 'Servidor / APIs / Cloud', 'Taxas Gateway / Banco', 'Suporte & Equipe', 'Impostos / Contabilidade', 'Outros Custos'],
  entrada: ['Aporte de Caixa', 'Receita Extra / Parceria', 'Ajuste Positivo de Caixa', 'Reembolso Recebido']
};

export const AdminFinanceTreasurySection: React.FC<AdminFinanceTreasurySectionProps> = ({
  currentCommPct,
  periodLabel,
  metrics,
  expenses,
  onSaveExpense,
  onDeleteExpense,
  onNavigateSubTab
}) => {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [entryType, setEntryType] = useState<'saida' | 'entrada'>('saida');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES.saida[0]);
  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [notes, setNotes] = useState('');

  const handleSubmitEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'));
    if (!description.trim() || Number.isNaN(numeric) || numeric <= 0) return;

    const item: Expense = {
      id: `exp-${Date.now()}`,
      type: entryType,
      category,
      description: description.trim(),
      amount: Number(numeric.toFixed(2)),
      date: entryDate || new Date().toISOString().slice(0, 10),
      paymentMethod,
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString()
    };
    onSaveExpense(item);
    setDescription('');
    setAmountStr('');
    setNotes('');
    setIsAddOpen(false);
  };

  const grossMarginPct = metrics.gross > 0
    ? ((metrics.grossProfit / metrics.gross) * 100).toFixed(1)
    : '0.0';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* BLOCO 1: DRE GERENCIAL (NOSSO CAIXA + LUCRO BRUTO + LUCRO LÍQUIDO) E REPASSES EM GERAL */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: 16
      }}>
        {/* ESQUERDA: DRE & Fluxo de Caixa da Empresa */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '14px 18px',
            borderBottom: '1px solid #E2E8F0',
            backgroundColor: '#0F172A',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                backgroundColor: 'rgba(163, 230, 53, 0.16)',
                color: '#A3E635',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Landmark size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 800 }}>
                  Nosso Caixa &amp; DRE Gerencial ({periodLabel})
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>
                  Fluxo de entradas da conta, lucro bruto das comissões e resultado líquido
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.64rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>
                Saldo em Caixa
              </div>
              <div style={{
                fontSize: '1.15rem',
                fontWeight: 900,
                color: metrics.cashBalance >= 0 ? '#A3E635' : '#F87171'
              }}>
                {formatBRL(metrics.cashBalance)}
              </div>
            </div>
          </div>

          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 9, fontSize: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#334155' }}>
              <span>(+) Volume Bruto de Corridas ({metrics.ridesCount} viagens)</span>
              <strong style={{ color: '#0F172A' }}>{formatBRL(metrics.gross)}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
              <span>(-) Parcela dos Motoristas ({100 - currentCommPct}% split médio)</span>
              <strong>- {formatBRL(metrics.driverNet)}</strong>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '9px 11px',
              borderRadius: 8,
              backgroundColor: '#F0FDF4',
              border: '1px solid #BBF7D0',
              color: '#14532D'
            }}>
              <span style={{ fontWeight: 800 }}>
                (=) Lucro Bruto da Plataforma (Comissões + Extras • {grossMarginPct}%)
              </span>
              <strong style={{ fontSize: '0.92rem' }}>{formatBRL(metrics.grossProfit)}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803D' }}>
              <span>(+) Entradas Diretas / Aportes no Caixa</span>
              <strong>+ {formatBRL(metrics.directRevenues)}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#DC2626' }}>
              <span>(-) Custos &amp; Despesas Operacionais Lançadas</span>
              <strong>- {formatBRL(metrics.operationalExpenses)}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
              <span>(-) Estornos e Reembolsos no Período</span>
              <strong>- {formatBRL(metrics.refundedTotal)}</strong>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: 10,
              marginTop: 4,
              borderTop: '2px solid #E2E8F0'
            }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: '0.86rem', color: '#0F172A' }}>
                  (=) Lucro Líquido Operacional
                </div>
                <div style={{ fontSize: '0.69rem', color: '#64748B' }}>
                  Composição Caixa: {formatBRL(metrics.digitalInflow)} digital + {formatBRL(metrics.debtSettlementsReceived)} quitações PIX − {formatBRL(metrics.paidWithdrawals)} repassado
                </div>
              </div>
              <div style={{
                fontSize: '1.15rem',
                fontWeight: 900,
                color: metrics.netProfit >= 0 ? '#15803D' : '#DC2626',
                whiteSpace: 'nowrap'
              }}>
                {formatBRL(metrics.netProfit)}
              </div>
            </div>
          </div>
        </div>

        {/* DIREITA: Central de Repasses em Geral (Motoristas) */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          border: '1px solid #E2E8F0',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{
            padding: '14px 18px',
            borderBottom: '1px solid #E2E8F0',
            backgroundColor: '#F8FAFC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                backgroundColor: '#EFF6FF',
                color: '#1D4ED8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Send size={17} />
              </div>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                  Repasses em Geral &amp; Obrigações com Motoristas
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                  O que já foi transferido via PIX, o que falta pagar e dívidas em dinheiro a receber
                </div>
              </div>
            </div>
          </div>

          <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
                1. Já Repassado (Saques Pagos)
              </div>
              <div style={{ fontSize: '1.22rem', fontWeight: 900, color: '#15803D', marginTop: 4 }}>
                {formatBRL(metrics.paidWithdrawals)}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#166534', marginTop: 3 }}>
                {metrics.paidWithdrawalsCount} transferência(s) PIX concluída(s)
              </div>
            </div>

            <div style={{
              backgroundColor: metrics.pendingWithdrawalsCount > 0 ? '#FFFBEB' : '#F8FAFC',
              border: `1px solid ${metrics.pendingWithdrawalsCount > 0 ? '#FDE68A' : '#E2E8F0'}`,
              borderRadius: 10,
              padding: '12px 14px'
            }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#92400E', textTransform: 'uppercase' }}>
                2. Saques Aguardando PIX
              </div>
              <div style={{
                fontSize: '1.22rem',
                fontWeight: 900,
                color: metrics.pendingWithdrawalsCount > 0 ? '#B45309' : '#0F172A',
                marginTop: 4
              }}>
                {formatBRL(metrics.pendingWithdrawals)}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#78350F', marginTop: 3 }}>
                {metrics.pendingWithdrawalsCount} solicitação(ões) pendente(s)
              </div>
            </div>

            <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                3. Saldo nas Carteiras (A Repassar)
              </div>
              <div style={{ fontSize: '1.22rem', fontWeight: 900, color: '#0F172A', marginTop: 4 }}>
                {formatBRL(metrics.totalAvailableForDrivers)}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: 3 }}>
                Passivo acumulado disponível para saque
              </div>
            </div>

            <div style={{
              backgroundColor: metrics.totalPendingDriverDebt > 0 ? '#FEF2F2' : '#F8FAFC',
              border: `1px solid ${metrics.totalPendingDriverDebt > 0 ? '#FECACA' : '#E2E8F0'}`,
              borderRadius: 10,
              padding: '12px 14px'
            }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#991B1B', textTransform: 'uppercase' }}>
                4. A Receber (Comissão Dinheiro)
              </div>
              <div style={{
                fontSize: '1.22rem',
                fontWeight: 900,
                color: metrics.totalPendingDriverDebt > 0 ? '#DC2626' : '#0F172A',
                marginTop: 4
              }}>
                {formatBRL(metrics.totalPendingDriverDebt)}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#7F1D1D', marginTop: 3 }}>
                {metrics.delinquentDriversCount} motorista(s) bloqueado(s) no teto
              </div>
            </div>
          </div>

          <div style={{
            padding: '10px 18px 14px 18px',
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            borderTop: '1px solid #F1F5F9'
          }}>
            <button
              type="button"
              onClick={() => onNavigateSubTab('saques')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 8,
                border: 'none',
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5
              }}
            >
              <span>Gerenciar Saques PIX</span>
              <ChevronRight size={14} />
            </button>
            <button
              type="button"
              onClick={() => onNavigateSubTab('motoristas')}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#0F172A',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <Wallet size={14} />
              <span>Carteiras</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateSubTab('corridas_split')}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#0F172A',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <TrendingUp size={14} />
              <span>Split por Corrida</span>
            </button>
          </div>
        </div>
      </div>

      {/* BLOCO 2: BREAKDOWN POR CANAL DE PAGAMENTO */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: 14
      }}>
        {[
          {
            title: 'PIX Dinâmico (Entra no Caixa)',
            icon: <QrCode size={16} color="#15803D" />,
            count: metrics.pixCount,
            gross: metrics.pixGross,
            fee: metrics.pixFee,
            netDriver: metrics.pixGross - metrics.pixFee,
            desc: 'Valor integral entra na conta da plataforma; parte líquida vai para carteira do motorista.'
          },
          {
            title: 'Cartão Crédito / Débito (Entra no Caixa)',
            icon: <CreditCard size={16} color="#1D4ED8" />,
            count: metrics.cardCount,
            gross: metrics.cardGross,
            fee: metrics.cardFee,
            netDriver: metrics.cardGross - metrics.cardFee,
            desc: 'Capturado no gateway ao finalizar corrida e creditado ao motorista após split.'
          },
          {
            title: 'Dinheiro (Em Mãos do Motorista)',
            icon: <Banknote size={16} color="#B45309" />,
            count: metrics.cashCount,
            gross: metrics.cashGross,
            fee: metrics.cashFee,
            netDriver: metrics.cashGross - metrics.cashFee,
            desc: 'Motorista recebe direto do passageiro; taxa da plataforma entra como débito a receber.'
          }
        ].map((ch, idx) => (
          <div key={idx} style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 11,
            padding: '15px 18px',
            border: '1px solid #E2E8F0',
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {ch.icon}
                {ch.title}
              </span>
              <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>{ch.count} viagem(ns)</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ fontSize: '0.64rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Bruto</div>
                <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0F172A' }}>{formatBRL(ch.gross)}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.64rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Lucro Bruto</div>
                <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#15803D' }}>{formatBRL(ch.fee)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.64rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Repasse Mot.</div>
                <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#334155' }}>{formatBRL(ch.netDriver)}</div>
              </div>
            </div>
            <div style={{ fontSize: '0.69rem', color: '#64748B', borderTop: '1px solid #F1F5F9', paddingTop: 8 }}>
              {ch.desc}
            </div>
          </div>
        ))}
      </div>

      {/* BLOCO 3: MOVIMENTAÇÕES MANUAIS DO CAIXA (DESPESAS OPERACIONAIS E ENTRADAS DIRETAS) */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        border: '1px solid #E2E8F0',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Receipt size={17} color="#0F172A" />
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                Movimentações do Caixa da Empresa (Despesas &amp; Aportes)
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                Lance custos operacionais (servidor, marketing, taxas, equipe) ou entradas extras para apurar o Lucro Líquido real
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsAddOpen(v => !v)}
            style={{
              padding: '7px 13px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: isAddOpen ? '#E2E8F0' : '#0F172A',
              color: isAddOpen ? '#0F172A' : '#FFFFFF',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5
            }}
          >
            <Plus size={14} />
            <span>{isAddOpen ? 'Cancelar' : 'Novo Lançamento no Caixa'}</span>
          </button>
        </div>

        {isAddOpen && (
          <form
            onSubmit={handleSubmitEntry}
            style={{
              padding: 16,
              backgroundColor: '#F8FAFC',
              borderBottom: '1px solid #E2E8F0',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 10,
              alignItems: 'end'
            }}
          >
            <div>
              <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>Tipo</label>
              <select
                value={entryType}
                onChange={(e) => {
                  const next = e.target.value as 'saida' | 'entrada';
                  setEntryType(next);
                  setCategory(EXPENSE_CATEGORIES[next][0]);
                }}
                style={{ width: '100%', height: 36, padding: '0 8px', borderRadius: 7, border: '1px solid #CBD5E1', fontSize: '0.78rem', backgroundColor: '#FFFFFF' }}
              >
                <option value="saida">Saída / Despesa (-)</option>
                <option value="entrada">Entrada / Aporte (+)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>Categoria</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ width: '100%', height: 36, padding: '0 8px', borderRadius: 7, border: '1px solid #CBD5E1', fontSize: '0.78rem', backgroundColor: '#FFFFFF' }}
              >
                {EXPENSE_CATEGORIES[entryType].map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>Descrição</label>
              <input
                type="text"
                required
                placeholder="Ex: Tráfego Meta Ads / Servidor Neon"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ width: '100%', height: 36, padding: '0 10px', borderRadius: 7, border: '1px solid #CBD5E1', fontSize: '0.78rem', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>Valor (R$)</label>
              <input
                type="text"
                required
                placeholder="Ex: 150,00"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                style={{ width: '100%', height: 36, padding: '0 10px', borderRadius: 7, border: '1px solid #CBD5E1', fontSize: '0.78rem', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>Data &amp; Meio</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  style={{ flex: 1, height: 36, padding: '0 6px', borderRadius: 7, border: '1px solid #CBD5E1', fontSize: '0.74rem' }}
                />
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  style={{ height: 36, padding: '0 6px', borderRadius: 7, border: '1px solid #CBD5E1', fontSize: '0.74rem', backgroundColor: '#FFFFFF' }}
                >
                  <option value="pix">PIX</option>
                  <option value="cartao_credito">Cartão</option>
                  <option value="dinheiro">Dinheiro</option>
                </select>
              </div>
            </div>

            <div>
              <button
                type="submit"
                style={{
                  width: '100%',
                  height: 36,
                  borderRadius: 7,
                  border: 'none',
                  backgroundColor: entryType === 'entrada' ? '#15803D' : '#DC2626',
                  color: '#FFFFFF',
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {entryType === 'entrada' ? '+ Registrar Entrada' : '- Registrar Despesa'}
              </button>
            </div>
          </form>
        )}

        {expenses.length === 0 ? (
          <div style={{ padding: '24px 18px', textAlign: 'center', color: '#64748B', fontSize: '0.78rem' }}>
            Nenhuma despesa operacional ou entrada extra lançada neste período.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.77rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '9px 16px', fontWeight: 700 }}>Data</th>
                  <th style={{ padding: '9px 14px', fontWeight: 700 }}>Tipo</th>
                  <th style={{ padding: '9px 14px', fontWeight: 700 }}>Categoria</th>
                  <th style={{ padding: '9px 14px', fontWeight: 700 }}>Descrição</th>
                  <th style={{ padding: '9px 14px', fontWeight: 700 }}>Valor</th>
                  <th style={{ padding: '9px 16px', fontWeight: 700, textAlign: 'right' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => {
                  const isIn = exp.type === 'entrada';
                  return (
                    <tr key={exp.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '10px 16px', color: '#64748B', whiteSpace: 'nowrap' }}>{exp.date}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: '0.69rem',
                          fontWeight: 700,
                          backgroundColor: isIn ? '#DCFCE7' : '#FEE2E2',
                          color: isIn ? '#15803D' : '#B91C1C'
                        }}>
                          {isIn ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                          {isIn ? 'Entrada' : 'Despesa'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#334155', fontWeight: 600 }}>{exp.category}</td>
                      <td style={{ padding: '10px 14px', color: '#0F172A', fontWeight: 600 }}>{exp.description}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 800, color: isIn ? '#15803D' : '#DC2626', whiteSpace: 'nowrap' }}>
                        {isIn ? '+' : '-'} {formatBRL(exp.amount)}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => onDeleteExpense(exp.id)}
                          title="Excluir lançamento"
                          style={{
                            padding: '4px 8px',
                            borderRadius: 6,
                            border: '1px solid #FECACA',
                            backgroundColor: '#FFFFFF',
                            color: '#DC2626',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: '0.7rem',
                            fontWeight: 600
                          }}
                        >
                          <Trash2 size={12} />
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
