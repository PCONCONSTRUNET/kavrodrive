import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, Share2, X, FileText, ChevronLeft, CheckCircle2, Download, Check } from 'lucide-react';
import { Ride, Expense, SystemConfig } from '../types';
import { downloadElementAsPdf } from '../utils/pdfGenerator';

interface FinanceReportPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  period: 'hoje' | 'semanal' | 'mensal' | 'todos';
  selectedMonthLabel: string;
  stats: {
    totalRev: number;
    totalExp: number;
    net: number;
    margin: number;
    paidRides: Ride[];
    activeRides?: Ride[];
    pendingRides?: Ride[];
    paidRev?: number;
    pendingRev?: number;
    periodRides: Ride[];
    periodExpenses: Expense[];
    pixRev: number;
    pixPct: number;
    pixRides: Ride[];
    cardRev: number;
    cardPct: number;
    cardRides: Ride[];
    cashRev: number;
    cashPct: number;
    cashRides: Ride[];
    avgTicket: number;
    totalKm: number;
    revPerKm: number;
    hourlyEarnings: number;
  };
  config: SystemConfig;
  onShareWhatsApp: () => void;
}

export const FinanceReportPdfModal: React.FC<FinanceReportPdfModalProps> = ({
  isOpen,
  onClose,
  period,
  selectedMonthLabel,
  stats,
  config,
  onShareWhatsApp
}) => {
  const emissionDate = React.useMemo(() => {
    return new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, [isOpen]);

  const reportId = React.useMemo(() => {
    const d = new Date();
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    return `${ym}-${Math.floor(1000 + Math.random() * 9000)}`;
  }, [isOpen]);

  const periodLabel = React.useMemo(() => {
    if (period === 'hoje') return `Diário • ${new Date().toLocaleDateString('pt-BR')}`;
    if (period === 'semanal') return 'Semanal • Últimos 7 Dias';
    if (period === 'mensal') return `Mensal • ${selectedMonthLabel}`;
    return 'Consolidado Geral • Todo o Histórico';
  }, [period, selectedMonthLabel]);

  const reportRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfSuccess, setPdfSuccess] = useState(false);

  const handleDownloadPdf = async () => {
    if (!reportRef.current) return;
    setIsGeneratingPdf(true);
    try {
      const filename = `Relatorio_Financeiro_UP_${reportId}.pdf`;
      const res = await downloadElementAsPdf(reportRef.current, {
        filename,
        title: `Relatório Financeiro Kavro Drive - ${periodLabel}`,
      });
      if (res.success) {
        setPdfSuccess(true);
        setTimeout(() => setPdfSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Falha ao baixar PDF:', err);
      // Fallback
      window.print();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const getCategoryLabel = (cat: Expense['category']) => {
    const map: Record<Expense['category'], string> = {
      combustivel: 'Combustível',
      lavagem: 'Higienização & Lavagem',
      manutencao: 'Manutenção / Mecânica',
      pedagio: 'Pedágio',
      estacionamento: 'Estacionamento',
      seguro: 'Seguro / Proteção',
      outros: 'Outros Custos'
    };
    return map[cat] || 'Despesa';
  };

  // Renderizador do Conteúdo do Relatório
  const renderDocument = (isPrintVersion: boolean) => (
    <div 
      className="pdf-page" 
      style={{ 
        color: '#0F172A', 
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        width: '100%',
        boxSizing: 'border-box'
      }}
    >
      {/* CABEÇALHO DO RELATÓRIO */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start', 
        borderBottom: '2.5px solid #0F172A', 
        paddingBottom: 12, 
        marginBottom: 14,
        flexWrap: isPrintVersion ? 'nowrap' : 'wrap',
        gap: 8
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <div style={{ backgroundColor: '#121A21', color: '#76D800', fontWeight: 900, padding: '3px 8px', borderRadius: 7, fontSize: '0.88rem', letterSpacing: '0.04em' }}>
              KAVRO DRIVE
            </div>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Gestão Financeira & Operacional
            </span>
          </div>
          <h1 style={{ fontSize: isPrintVersion ? '1.25rem' : '1.1rem', fontWeight: 900, color: '#0F172A', margin: 0, lineHeight: 1.2 }}>
            DEMONSTRATIVO FINANCEIRO
          </h1>
          <div style={{ fontSize: '0.78rem', color: '#334155', marginTop: 3 }}>
            <strong>Filtro:</strong> <span style={{ color: '#0284C7', fontWeight: 800 }}>{periodLabel}</span>
          </div>
        </div>

        <div style={{ textAlign: isPrintVersion ? 'right' : 'left', fontSize: '0.7rem', color: '#64748B' }}>
          <div><strong>Emissão:</strong> {emissionDate}</div>
          <div><strong>Protocolo:</strong> #{reportId}</div>
          <div style={{ marginTop: 3, display: 'inline-block', backgroundColor: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0', padding: '1px 6px', borderRadius: 5, fontWeight: 800, fontSize: '0.65rem' }}>
            ✓ Consolidado Oficial
          </div>
        </div>
      </div>

      {/* QUADRO EXECUTIVO DE RENTABILIDADE LÍQUIDA (100% RESPONSIVO, SEM CORTAR NO MOBILE) */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: isPrintVersion ? 'repeat(3, 1fr)' : 'repeat(auto-fit, minmax(95px, 1fr))', 
        gap: 6, 
        marginBottom: 12 
      }}>
        {/* Receita Bruta */}
        <div style={{ backgroundColor: '#F0FDF4', border: '1.5px solid #BBF7D0', borderRadius: 10, padding: '8px 8px' }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Receita Bruta
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#15803D', marginTop: 2, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
            R$ {stats.totalRev.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.6rem', color: '#166534', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {(stats.activeRides || stats.periodRides).length} viagens ({stats.paidRides.length} pagas)
          </div>
        </div>

        {/* Despesas */}
        <div style={{ backgroundColor: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '8px 8px' }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#991B1B', textTransform: 'uppercase', letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Despesas
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#DC2626', marginTop: 2, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
            - R$ {stats.totalExp.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.6rem', color: '#991B1B', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {stats.periodExpenses.length} custos lançados
          </div>
        </div>

        {/* Lucro Líquido */}
        <div style={{ 
          backgroundColor: stats.net >= 0 ? '#121A21' : '#7F1D1D', 
          border: stats.net >= 0 ? '1.5px solid #243342' : '1.5px solid #991B1B', 
          borderRadius: 10, 
          padding: '8px 8px',
          color: '#FFFFFF'
        }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 800, color: stats.net >= 0 ? '#76D800' : '#FCA5A5', textTransform: 'uppercase', letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Lucro Líquido
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: stats.net >= 0 ? '#76D800' : '#FFFFFF', marginTop: 2, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
            R$ {stats.net.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.6rem', color: stats.net >= 0 ? '#94A3B8' : '#FCA5A5', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Margem: <strong>{stats.margin}%</strong>
          </div>
        </div>
      </div>

      {/* INDICADORES OPERACIONAIS (KPIS) - 2X2 NO MOBILE, 4 COLUNAS NA IMPRESSÃO */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: isPrintVersion ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)', 
        gap: 8, 
        marginBottom: 14 
      }}>
        <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '9px 11px' }}>
          <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 700 }}>Ticket Médio</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0F172A', marginTop: 1 }}>R$ {stats.avgTicket.toFixed(2)}</div>
          <div style={{ fontSize: '0.62rem', color: '#94A3B8' }}>por corrida paga</div>
        </div>
        <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '9px 11px' }}>
          <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 700 }}>Ganho por KM</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#10B981', marginTop: 1 }}>R$ {stats.revPerKm.toFixed(2)}/km</div>
          <div style={{ fontSize: '0.62rem', color: '#94A3B8' }}>{stats.totalKm.toFixed(1)} km rodados</div>
        </div>
        <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '9px 11px' }}>
          <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 700 }}>Ganho por Hora</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0284C7', marginTop: 1 }}>R$ {stats.hourlyEarnings.toFixed(2)}/h</div>
          <div style={{ fontSize: '0.62rem', color: '#94A3B8' }}>em viagem</div>
        </div>
        <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '9px 11px' }}>
          <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 700 }}>Corridas Pagas</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0F172A', marginTop: 1 }}>{stats.paidRides.length}</div>
          <div style={{ fontSize: '0.62rem', color: '#94A3B8' }}>de {stats.periodRides.length} agendadas</div>
        </div>
      </div>

      {/* FORMAS DE PAGAMENTO */}
      <div style={{ marginBottom: 14 }} className="pdf-avoid-break">
        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', marginBottom: 5, letterSpacing: '0.04em' }}>
          Distribuição por Forma de Pagamento
        </div>
        <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: 280, borderCollapse: 'collapse', fontSize: '0.72rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1', textAlign: 'left' }}>
                <th style={{ padding: '6px 8px', color: '#475569' }}>Modalidade</th>
                <th style={{ padding: '6px 8px', color: '#475569', textAlign: 'center' }}>Corridas</th>
                <th style={{ padding: '6px 8px', color: '#475569', textAlign: 'center' }}>Participação</th>
                <th style={{ padding: '6px 8px', color: '#475569', textAlign: 'right' }}>Total (R$)</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                <td style={{ padding: '6px 8px', fontWeight: 700, color: '#059669' }}>PIX Instantâneo</td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>{stats.pixRides.length}</td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>{stats.pixPct}%</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800, color: '#059669' }}>R$ {stats.pixRev.toFixed(2)}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                <td style={{ padding: '6px 8px', fontWeight: 700, color: '#0284C7' }}>Cartão de Crédito/Débito</td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>{stats.cardRides.length}</td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>{stats.cardPct}%</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800, color: '#0284C7' }}>R$ {stats.cardRev.toFixed(2)}</td>
              </tr>
              <tr style={{ borderBottom: '1.5px solid #CBD5E1' }}>
                <td style={{ padding: '6px 8px', fontWeight: 700, color: '#D97706' }}>Dinheiro em Espécie</td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>{stats.cashRides.length}</td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>{stats.cashPct}%</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800, color: '#D97706' }}>R$ {stats.cashRev.toFixed(2)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: '#F8FAFC', fontWeight: 900 }}>
                <td style={{ padding: '6px 8px' }} colSpan={3}>TOTAL FATURADO NO PERÍODO</td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#15803D', fontSize: '0.8rem' }}>R$ {stats.totalRev.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* EXTRATO DE DESPESAS OPERACIONAIS */}
      <div style={{ marginBottom: 14 }} className="pdf-avoid-break">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Despesas Operacionais ({stats.periodExpenses.length})
          </div>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#DC2626' }}>
            Total: - R$ {stats.totalExp.toFixed(2)}
          </div>
        </div>

        {stats.periodExpenses.length === 0 ? (
          <div style={{ padding: '10px', textAlign: 'center', backgroundColor: '#F8FAFC', borderRadius: 8, color: '#64748B', fontSize: '0.72rem', border: '1px dashed #CBD5E1' }}>
            Nenhuma despesa operacional registrada no período selecionado.
          </div>
        ) : (
          <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1', textAlign: 'left' }}>
                  <th style={{ padding: '5px 6px', color: '#475569', width: '55px' }}>Data</th>
                  <th style={{ padding: '5px 6px', color: '#475569', width: '85px' }}>Categoria</th>
                  <th style={{ padding: '5px 6px', color: '#475569' }}>Descrição</th>
                  <th style={{ padding: '5px 6px', color: '#475569', textAlign: 'right', width: '75px' }}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {stats.periodExpenses.map((exp: Expense, idx: number) => {
                  const [ey, em, ed] = exp.date.split('-');
                  const dateFmt = `${ed}/${em}`;
                  return (
                    <tr key={exp.id || idx} style={{ borderBottom: '1px solid #E2E8F0' }}>
                      <td style={{ padding: '5px 8px', color: '#334155' }}>{dateFmt}</td>
                      <td style={{ padding: '5px 8px' }}>
                        <span style={{ 
                          backgroundColor: '#F1F5F9', 
                          padding: '1px 5px', 
                          borderRadius: 4, 
                          fontWeight: 700, 
                          fontSize: '0.64rem',
                          textTransform: 'uppercase',
                          color: '#475569' 
                        }}>
                          {getCategoryLabel(exp.category)}
                        </span>
                      </td>
                      <td style={{ padding: '5px 8px', color: '#1E293B', fontWeight: 600 }}>{exp.description}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: '#DC2626', fontWeight: 800 }}>
                        - R$ {exp.amount.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: '#FEF2F2', fontWeight: 900 }}>
                  <td style={{ padding: '5px 8px' }} colSpan={3}>TOTAL DE DESPESAS</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', color: '#DC2626', fontSize: '0.78rem' }}>
                    - R$ {stats.totalExp.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* EXTRATO DE AGENDAMENTOS & VIAGENS */}
      {(() => {
        const reportRides = (stats.activeRides && stats.activeRides.length > 0) ? stats.activeRides : stats.periodRides;
        const totalScheduled = stats.totalRev;
        const totalReceived = stats.paidRev ?? stats.paidRides.reduce((acc, r) => acc + (r.totalPrice || 0), 0);
        const totalPending = stats.pendingRev ?? (totalScheduled - totalReceived);

        return (
          <div style={{ marginBottom: 14 }} className="pdf-avoid-break">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Agendamentos & Viagens ({reportRides.length})
              </div>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#15803D' }}>
                Total: R$ {totalScheduled.toFixed(2)}
              </div>
            </div>

            {reportRides.length === 0 ? (
              <div style={{ padding: '10px', textAlign: 'center', backgroundColor: '#F8FAFC', borderRadius: 8, color: '#64748B', fontSize: '0.72rem', border: '1px dashed #CBD5E1' }}>
                Nenhum agendamento registrado no período selecionado.
              </div>
            ) : (
              <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1', textAlign: 'left' }}>
                      <th style={{ padding: '5px 6px', color: '#475569', width: '55px' }}>Data</th>
                      <th style={{ padding: '5px 6px', color: '#475569', width: '85px' }}>Passageiro</th>
                      <th style={{ padding: '5px 6px', color: '#475569' }}>Itinerário</th>
                      <th style={{ padding: '5px 6px', color: '#475569', width: '50px', textAlign: 'center' }}>Forma</th>
                      <th style={{ padding: '5px 6px', color: '#475569', width: '60px', textAlign: 'center' }}>Status</th>
                      <th style={{ padding: '5px 6px', color: '#475569', textAlign: 'right', width: '65px' }}>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportRides.map((ride: Ride) => {
                      const [ry, rm, rd] = (ride.date || '').split('-');
                      const dateFmt = ride.date ? `${rd}/${rm}` : '--';
                      const orig = typeof ride.origin === 'string' ? ride.origin : (ride.origin?.address || 'Origem');
                      const dest = typeof ride.destination === 'string' ? ride.destination : (ride.destination?.address || 'Destino');
                      const isPaid = ride.paymentStatus === 'pago';

                      return (
                        <tr key={ride.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                          <td style={{ padding: '5px 8px', color: '#475569' }}>
                            {dateFmt} {ride.time}
                          </td>
                          <td style={{ padding: '5px 8px', fontWeight: 700, color: '#0F172A' }}>
                            {ride.clientName || 'Passageiro'}
                          </td>
                          <td style={{ padding: '5px 8px', color: '#334155' }}>
                            <span style={{ color: '#0284C7', fontWeight: 600 }}>{orig.split(',')[0]}</span>
                            <span style={{ color: '#94A3B8', margin: '0 3px' }}>→</span>
                            <span style={{ color: '#059669', fontWeight: 600 }}>{dest.split(',')[0]}</span>
                          </td>
                          <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                            <span style={{ 
                              backgroundColor: '#F1F5F9', 
                              padding: '1px 5px', 
                              borderRadius: 4, 
                              fontWeight: 700, 
                              fontSize: '0.62rem',
                              textTransform: 'uppercase',
                              color: '#475569'
                            }}>
                              {ride.paymentMethod === 'pix' ? 'PIX' : ride.paymentMethod === 'dinheiro' ? 'DIN' : 'CARD'}
                            </span>
                          </td>
                          <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                            <span style={{
                              padding: '1px 6px',
                              borderRadius: 4,
                              fontWeight: 800,
                              fontSize: '0.62rem',
                              backgroundColor: isPaid ? '#DCFCE7' : '#FEF3C7',
                              color: isPaid ? '#15803D' : '#B45309'
                            }}>
                              {isPaid ? 'Pago' : 'A Receber'}
                            </span>
                          </td>
                          <td style={{ padding: '5px 8px', textAlign: 'right', color: '#15803D', fontWeight: 800 }}>
                            R$ {ride.totalPrice.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: '#F0FDF4', fontWeight: 900 }}>
                      <td style={{ padding: '5px 8px' }} colSpan={5}>TOTAL FATURADO EM AGENDAMENTOS</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: '#15803D', fontSize: '0.78rem' }}>
                        R$ {totalScheduled.toFixed(2)}
                      </td>
                    </tr>
                    <tr style={{ backgroundColor: '#F8FAFC', fontSize: '0.66rem', color: '#475569' }}>
                      <td style={{ padding: '3px 8px' }} colSpan={5}>
                        ✓ Já Liquidado / Recebido: <strong>R$ {totalReceived.toFixed(2)}</strong> &nbsp;|&nbsp; 
                        ⏳ A Receber nos Agendamentos: <strong>R$ {totalPending.toFixed(2)}</strong>
                      </td>
                      <td style={{ padding: '3px 8px', textAlign: 'right' }}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* RODAPÉ DO DOCUMENTO */}
      <div style={{ marginTop: 16, paddingTop: 10, borderTop: '1.5px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.66rem', color: '#64748B' }}>
        <div>
          <strong>Kavro Drive</strong> • Gestão Operacional & Financeira
        </div>
        <div>
          Relatório eletrônico emitido para prestação de contas.
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* 1. PORTAL DE IMPRESSÃO LIMPO (A4 oficial) */}
      {createPortal(
        <div id="printable-finance-report" className="printable-finance-report-container">
          {renderDocument(true)}
        </div>,
        document.body
      )}

      {/* 2. TELA INTEIRA DE VISUALIZAÇÃO E DOWNLOAD (100% Full-Screen, sem caixas escuras cortando) */}
      {isOpen && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            minHeight: '100dvh',
            backgroundColor: '#F1F5F9',
            zIndex: 999999,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          {/* Header Superior iOS */}
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#121A21',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #1E293B',
            flexShrink: 0
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: 10,
                padding: '6px 12px',
                color: '#FFFFFF',
                fontSize: '0.8rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'pointer'
              }}
            >
              <ChevronLeft size={16} />
              <span>Voltar</span>
            </button>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 900, color: '#FFFFFF' }}>
                Relatório Financeiro PDF
              </div>
              <div style={{ fontSize: '0.68rem', color: '#76D800', fontWeight: 700 }}>
                {periodLabel}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Fechar tela"
            >
              <X size={16} />
            </button>
          </div>

          {/* Barra de Ações Rápidas (Baixar PDF e WhatsApp) */}
          <div style={{
            padding: '10px 16px',
            backgroundColor: '#FFFFFF',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            flexShrink: 0
          }}>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              style={{
                flex: 1,
                maxWidth: 240,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '10px 16px',
                borderRadius: 12,
                backgroundColor: '#76D800',
                color: '#121A21',
                border: 'none',
                fontWeight: 900,
                fontSize: '0.86rem',
                cursor: isGeneratingPdf ? 'wait' : 'pointer',
                boxShadow: '0 3px 12px rgba(118,216,0,0.35)',
                transition: 'all 0.15s ease'
              }}
              title="Salvar como PDF no seu aparelho"
            >
              {pdfSuccess ? (
                <>
                  <Check size={16} color="#15803D" />
                  <span>PDF Baixado!</span>
                </>
              ) : isGeneratingPdf ? (
                <span>Gerando PDF...</span>
              ) : (
                <>
                  <Download size={16} />
                  <span>Baixar / Salvar PDF</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onShareWhatsApp}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                padding: '10px 14px',
                borderRadius: 12,
                backgroundColor: '#25D366',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 800,
                fontSize: '0.82rem',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(37,211,102,0.25)',
                transition: 'all 0.15s ease'
              }}
              title="Enviar resumo no WhatsApp"
            >
              <Share2 size={15} />
              <span>WhatsApp</span>
            </button>
          </div>

          {/* Área de Visualização do Documento (Totalmente Responsiva, Sem Cortar) */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            padding: '10px 8px 40px 8px'
          }}>
            <div 
              ref={reportRef}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 14,
                padding: '14px 10px',
                boxShadow: '0 4px 18px rgba(0,0,0,0.05)',
                border: '1px solid #E2E8F0',
                maxWidth: 720,
                margin: '0 auto',
                width: '100%',
                boxSizing: 'border-box'
              }}
            >
              {renderDocument(false)}
            </div>

            <div style={{
              maxWidth: 720,
              margin: '12px auto 0 auto',
              textAlign: 'center',
              fontSize: '0.74rem',
              color: '#64748B'
            }}>
              Toque em <strong>"Baixar / Salvar PDF"</strong> acima para gerar o arquivo oficial em alta resolução.
            </div>
          </div>
        </div>
      )}
    </>
  );
};
