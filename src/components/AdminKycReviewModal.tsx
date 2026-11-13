import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, AlertTriangle, CheckCircle2, XCircle,
  RefreshCw, X, FileText, Camera, Trash2, ExternalLink,
  UserCheck, ZoomIn, ZoomOut, RotateCw, SunMedium, Printer, Columns
} from 'lucide-react';
import { DriverProfile, KycAuditLog, DriverKycData } from '../types';
import { StorageService } from '../services/storage';
import { DriverTermsContractModal } from './DriverTermsContractModal';

interface AdminKycReviewModalProps {
  driver: DriverProfile;
  isOpen: boolean;
  analystName?: string;
  onClose: () => void;
  onUpdated: (updatedDriver: DriverProfile) => void;
}

const KYC_CHECKLIST_ITEMS = [
  { id: 'cnh_legible', label: 'CNH física/digital legível, original e dentro da validade' },
  { id: 'ear_present', label: 'Observação EAR (Exerce Atividade Remunerada) visível na CNH' },
  { id: 'identity_match', label: 'Nome completo, CPF e registro CNH conferem com o cadastro' },
  { id: 'selfie_match', label: 'Selfie ao vivo nítida, sem terceiros/acessórios e compatível' }
] as const;

const CORRECTION_MACROS = [
  'Foto da CNH desfocada ou com reflexo de luz cobrindo os dados/validade. Envie uma imagem nítida.',
  'Documento CNH cortado nas bordas — envie foto inteira da CNH aberta (frente e verso).',
  'Selfie escura ou com óculos escuros/boné — refaça em local iluminado olhando para a câmera.',
  'Não foi possível visualizar a observação EAR na CNH. Envie foto legível ou CNH-e atualizada.',
  'CNH vencida — anexe a renovação válida ou protocolo oficial do Detran.'
];

const REJECTION_MACROS = [
  'Divergência biométrica severa ou indício de documento de terceiros.',
  'CNH irregular, suspensa ou sem habilitação válida para transporte remunerado.',
  'Documentação não atende aos critérios de segurança e compliance da plataforma.'
];

export const AdminKycReviewModal: React.FC<AdminKycReviewModalProps> = ({
  driver,
  isOpen,
  analystName: propAnalystName,
  onClose,
  onUpdated,
}) => {
  const [kycData, setKycData] = useState<DriverKycData | null>(driver.kyc || null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [cnhImgError, setCnhImgError] = useState(false);
  const [selfieImgError, setSelfieImgError] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Controles de visualização profissional para a equipe
  const [focusView, setFocusView] = useState<'split' | 'cnh' | 'selfie'>('split');
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [highContrast, setHighContrast] = useState(false);

  // Checklist, analista e parecer
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [reviewNote, setReviewNote] = useState('');
  const [selectedAction, setSelectedAction] = useState<'aprovado' | 'rejeitado' | 'correcao_solicitada' | null>(null);
  const [adminName, setAdminName] = useState(() =>
    propAnalystName ||
    localStorage.getItem('kavro_compliance_analyst_name') ||
    'Equipe Compliance Master'
  );
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (isOpen && driver.id) {
      setKycData(driver.kyc || null);
      setFetchError('');
      setFormError('');
      setCnhImgError(false);
      setSelfieImgError(false);
      setFocusView('split');
      setZoom(1);
      setRotation(0);
      setHighContrast(false);
      setSelectedAction(null);
      setReviewNote('');
      setChecklist(
        driver.kyc?.checklist && typeof driver.kyc.checklist === 'object'
          ? { ...driver.kyc.checklist }
          : {}
      );
      if (propAnalystName) {
        setAdminName(propAnalystName);
      }
      loadFreshKyc();
    }
  }, [isOpen, driver.id, propAnalystName]);

  const loadFreshKyc = async () => {
    setIsLoading(true);
    setFetchError('');
    setCnhImgError(false);
    setSelfieImgError(false);
    const res = await StorageService.fetchDriverKyc(driver.id);
    setIsLoading(false);
    if (res.ok && res.kyc) {
      setKycData(res.kyc);
      if (res.kyc.checklist && typeof res.kyc.checklist === 'object') {
        setChecklist(res.kyc.checklist);
      }
    } else if (!res.ok) {
      setFetchError(res.error || 'Não foi possível carregar os documentos KYC no servidor.');
    }
  };

  if (!isOpen) return null;

  const currentStatus = driver.approvalStatus;
  const biometric = kycData?.biometricResult || driver.kyc?.biometricResult;
  const auditLogs = kycData?.auditLogs || driver.kyc?.auditLogs || [];
  const cnhUrl = kycData?.cnhDocumentUrl || driver.cnhDocumentPhoto || '';
  const selfieUrl = kycData?.selfieUrl || driver.selfiePhoto || '';

  const checkedCount = KYC_CHECKLIST_ITEMS.filter(item => checklist[item.id]).length;
  const allChecked = checkedCount === KYC_CHECKLIST_ITEMS.length;

  const handleAnalystChange = (val: string) => {
    setAdminName(val);
    localStorage.setItem('kavro_compliance_analyst_name', val);
  };

  const handleExecuteReview = async (action: 'aprovado' | 'rejeitado' | 'correcao_solicitada') => {
    setFormError('');
    if (action === 'correcao_solicitada' && !reviewNote.trim()) {
      setFormError('Informe ou clique em uma instrução de correção para o motorista.');
      return;
    }
    if (action === 'rejeitado' && !reviewNote.trim()) {
      setFormError('Informe ou selecione o motivo da recusa do cadastro.');
      return;
    }

    const cleanAdmin = adminName.trim() || 'Equipe Compliance Master';
    localStorage.setItem('kavro_compliance_analyst_name', cleanAdmin);

    setActionInProgress(action);
    const res = await StorageService.adminReviewKyc({
      driverId: driver.id,
      action,
      notes: reviewNote.trim(),
      adminName: cleanAdmin,
      checklist
    });
    setActionInProgress(null);

    if (res.ok && res.driver) {
      onUpdated(res.driver);
      setSelectedAction(null);
      setReviewNote('');
      loadFreshKyc();
    } else {
      setFormError(res.error || 'Erro ao processar ação administrativa.');
    }
  };

  const handlePurgeDocuments = async () => {
    const confirm = window.confirm(
      `Confirma a eliminação definitiva das fotografias e laudos biométricos de ${driver.name}? Esta ação atende à política de retenção LGPD e não pode ser desfeita.`
    );
    if (!confirm) return;

    setActionInProgress('purge');
    const res = await StorageService.adminPurgeKycDocuments({
      driverId: driver.id,
      reason: 'Eliminação definitiva solicitada pela administração (Conformidade LGPD)',
      performedBy: adminName.trim() || 'Equipe Compliance Master'
    });
    setActionInProgress(null);

    if (res.ok && res.driver) {
      onUpdated(res.driver);
      loadFreshKyc();
    } else {
      setFormError(res.error || 'Erro ao purgar documentos.');
    }
  };

  const handlePrintDossier = () => {
    const w = window.open('', '_blank', 'width=860,height=900');
    if (!w) return;
    const bioSim = biometric ? Number(biometric.similarityScore ?? biometric.similarity ?? 0) : null;
    w.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Dossiê KYC — ${driver.name}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; padding: 28px; line-height: 1.5; }
            h1 { font-size: 18px; margin: 0 0 6px 0; }
            .meta { font-size: 12px; color: #475569; margin-bottom: 18px; }
            .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin-bottom: 14px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px; }
            ul { margin: 8px 0 0 18px; padding: 0; font-size: 12px; }
          </style>
        </head>
        <body>
          <h1>Dossiê de Compliance KYC &amp; Biometria — Kavro Drive</h1>
          <div class="meta">Emitido em ${new Date().toLocaleString('pt-BR')} • Analista: ${adminName || 'Equipe Compliance Master'}</div>
          <div class="card">
            <div class="row"><strong>Motorista:</strong><span>${driver.name}</span></div>
            <div class="row"><strong>CPF:</strong><span>${driver.document || '—'}</span></div>
            <div class="row"><strong>CNH / EAR:</strong><span>${driver.cnh || '—'} • EAR: ${driver.cnhHasEar === false ? 'Não' : 'Sim'}</span></div>
            <div class="row"><strong>Status Cadastral:</strong><span>${currentStatus.toUpperCase()}</span></div>
            <div class="row"><strong>Score Biometria IA:</strong><span>${bioSim !== null ? `${bioSim}%` : 'Não executada'}</span></div>
            <div class="row"><strong>Contrato Digital:</strong><span>${driver.termsSignature?.signed ? `Assinado (${driver.termsSignature.validationCode})` : 'Pendente'}</span></div>
          </div>
          <div class="card">
            <strong>Checklist da Equipe (${checkedCount}/${KYC_CHECKLIST_ITEMS.length}):</strong>
            <ul>
              ${KYC_CHECKLIST_ITEMS.map(item => `<li>[${checklist[item.id] ? 'OK' : 'PENDENTE'}] ${item.label}</li>`).join('')}
            </ul>
          </div>
          ${auditLogs.length > 0 ? `
            <div class="card">
              <strong>Últimos Registros de Auditoria LGPD:</strong>
              <ul>
                ${auditLogs.slice(0, 8).map(l => `<li>${new Date(l.timestamp).toLocaleString('pt-BR')} — ${l.performedBy}: ${l.action}${l.notes ? ` (${l.notes})` : ''}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
          <script>window.print();</script>
        </body>
      </html>
    `);
    w.document.close();
  };

  const renderDocImageBox = (
    title: string,
    url: string,
    isErr: boolean,
    onErr: () => void,
    icon: React.ReactNode,
    emptyText: string,
    tallMode: boolean
  ) => (
    <div style={{
      backgroundColor: '#0F172A',
      border: '1px solid #334155',
      borderRadius: 14,
      padding: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#E2E8F0', fontSize: '0.78rem', fontWeight: 800 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{icon}{title}</span>
        {url && !isErr && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '0.72rem', color: '#60A5FA', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <span>Nova guia</span>
            <ExternalLink size={12} />
          </a>
        )}
      </div>

      <div style={{
        minHeight: tallMode ? 360 : 230,
        maxHeight: tallMode ? 460 : 280,
        overflow: 'auto',
        backgroundColor: '#020617',
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 8
      }}>
        {url && !isErr ? (
          <img
            src={url}
            alt={title}
            onError={onErr}
            style={{
              maxWidth: zoom === 1 ? '100%' : 'none',
              maxHeight: zoom === 1 ? (tallMode ? 430 : 260) : 'none',
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
              transition: 'transform 0.15s ease',
              filter: highContrast ? 'contrast(1.32) brightness(1.06)' : 'none',
              borderRadius: 6
            }}
          />
        ) : isErr ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#FBBF24', fontSize: '0.78rem' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Link temporário expirado ou indisponível.</div>
            <button
              type="button"
              onClick={loadFreshKyc}
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid #F59E0B',
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                color: '#FDE68A',
                fontSize: '0.73rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Gerar Nova URL (15 min)
            </button>
          </div>
        ) : (
          <div style={{ color: '#64748B', fontSize: '0.8rem', textAlign: 'center', padding: 24 }}>
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.78)',
        backdropFilter: 'blur(6px)',
        zIndex: 100250,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 1060,
          maxHeight: '94vh',
          backgroundColor: '#FFFFFF',
          borderRadius: 18,
          color: '#0F172A',
          boxShadow: '0 25px 70px rgba(0,0,0,0.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Cabeçalho Corporativo Compliance */}
        <div style={{
          padding: '16px 22px',
          borderBottom: '1px solid #E2E8F0',
          backgroundColor: '#F8FAFC',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: '#EFF6FF',
              border: '1.5px solid #2563EB',
              color: '#1D4ED8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ShieldCheck size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.08rem', fontWeight: 900, color: '#0F172A' }}>
                  Mesa de Análise KYC, CNH &amp; Biometria Facial
                </span>
                <span style={{
                  padding: '3px 10px',
                  borderRadius: 999,
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  backgroundColor:
                    currentStatus === 'aprovado' ? '#DCFCE7' :
                    currentStatus === 'correcao_solicitada' ? '#FEF3C7' :
                    currentStatus === 'rejeitado' ? '#FEE2E2' : '#E0E7FF',
                  color:
                    currentStatus === 'aprovado' ? '#15803D' :
                    currentStatus === 'correcao_solicitada' ? '#B45309' :
                    currentStatus === 'rejeitado' ? '#B91C1C' : '#3730A3'
                }}>
                  {currentStatus === 'aprovado' ? 'Aprovado' :
                   currentStatus === 'correcao_solicitada' ? 'Correção Solicitada' :
                   currentStatus === 'rejeitado' ? 'Rejeitado' :
                   currentStatus === 'em_analise' ? 'Em Análise' : 'Pendente'}
                </span>
              </div>
              <div style={{ fontSize: '0.77rem', color: '#475569', marginTop: 2 }}>
                Motorista: <strong>{driver.name}</strong> • CPF: <strong>{driver.document}</strong> • CNH: <strong>{driver.cnh}</strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: 8
            }}>
              <UserCheck size={14} color="#475569" />
              <input
                type="text"
                value={adminName}
                onChange={(e) => handleAnalystChange(e.target.value)}
                placeholder="Nome do analista"
                title="Analista responsável na trilha de auditoria"
                style={{
                  border: 'none',
                  outline: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#0F172A',
                  width: 155,
                  background: 'transparent'
                }}
              />
            </div>

            <button
              type="button"
              onClick={handlePrintDossier}
              style={{
                padding: '7px 11px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#0F172A',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <Printer size={14} />
              <span>Dossiê PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#475569',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Corpo Lado a Lado */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: 20,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
          gap: 20
        }}>
          {/* COLUNA ESQUERDA: Documentos + Controles de Zoom/Rotação + Score IA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Controles do Visor */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', gap: 5 }}>
                {[
                  { id: 'split', label: 'Lado a Lado', icon: <Columns size={13} /> },
                  { id: 'cnh', label: 'Focar CNH', icon: <FileText size={13} /> },
                  { id: 'selfie', label: 'Focar Selfie', icon: <Camera size={13} /> }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => { setFocusView(tab.id as 'split' | 'cnh' | 'selfie'); setZoom(1); setRotation(0); }}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 8,
                      border: focusView === tab.id ? 'none' : '1px solid #CBD5E1',
                      backgroundColor: focusView === tab.id ? '#0F172A' : '#FFFFFF',
                      color: focusView === tab.id ? '#FFFFFF' : '#334155',
                      fontSize: '0.73rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5
                    }}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => setZoom(z => Math.max(0.75, Number((z - 0.25).toFixed(2))))}
                  title="Diminuir zoom"
                  style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', cursor: 'pointer' }}
                >
                  <ZoomOut size={14} />
                </button>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, minWidth: 36, textAlign: 'center' }}>
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom(z => Math.min(3, Number((z + 0.25).toFixed(2))))}
                  title="Aumentar zoom"
                  style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', cursor: 'pointer' }}
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setRotation(r => (r + 90) % 360)}
                  title="Girar 90°"
                  style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', cursor: 'pointer' }}
                >
                  <RotateCw size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setHighContrast(v => !v)}
                  title="Realçar contraste e nitidez"
                  style={{
                    padding: '5px 8px',
                    borderRadius: 6,
                    border: highContrast ? '1px solid #2563EB' : '1px solid #CBD5E1',
                    backgroundColor: highContrast ? '#EFF6FF' : '#FFFFFF',
                    color: highContrast ? '#1D4ED8' : '#334155',
                    cursor: 'pointer'
                  }}
                >
                  <SunMedium size={14} />
                </button>
                <button
                  type="button"
                  onClick={loadFreshKyc}
                  disabled={isLoading}
                  title="Atualizar URLs privadas (15 min)"
                  style={{
                    padding: '5px 9px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#2563EB',
                    fontSize: '0.71rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <RefreshCw size={12} />
                  <span>{isLoading ? '...' : 'Tokens'}</span>
                </button>
              </div>
            </div>

            {fetchError && (
              <div style={{
                padding: '9px 12px',
                borderRadius: 10,
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#991B1B',
                fontSize: '0.76rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8
              }}>
                <span>⚠️ {fetchError}</span>
                <button
                  type="button"
                  onClick={loadFreshKyc}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid #DC2626',
                    backgroundColor: '#FFFFFF',
                    color: '#B91C1C',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Recarregar
                </button>
              </div>
            )}

            {/* Imagens */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: focusView === 'split' ? '1fr 1fr' : '1fr',
              gap: 12
            }}>
              {(focusView === 'split' || focusView === 'cnh') &&
                renderDocImageBox(
                  'Documento CNH',
                  cnhUrl,
                  cnhImgError,
                  () => setCnhImgError(true),
                  <FileText size={14} color="#60A5FA" />,
                  'Nenhuma imagem de CNH disponível no momento (pode ter sido removida via auto-purge LGPD).',
                  focusView === 'cnh'
                )}
              {(focusView === 'split' || focusView === 'selfie') &&
                renderDocImageBox(
                  'Selfie ao Vivo (WebRTC)',
                  selfieUrl,
                  selfieImgError,
                  () => setSelfieImgError(true),
                  <Camera size={14} color="#4ADE80" />,
                  'Nenhuma selfie capturada disponível no momento.',
                  focusView === 'selfie'
                )}
            </div>

            {/* Painel de Triagem Facial Human AI */}
            {biometric ? (() => {
              const bioSim = Number(biometric.similarityScore ?? biometric.similarity ?? 0);
              const bioMatch = Boolean(biometric.isMatch ?? biometric.match ?? (bioSim >= 55));
              return (
                <div style={{
                  backgroundColor: bioMatch ? '#F0FDF4' : '#FFFBEB',
                  border: `1.5px solid ${bioMatch ? '#BBF7D0' : '#FDE68A'}`,
                  borderRadius: 14,
                  padding: 14
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {bioMatch ? <CheckCircle2 size={22} color="#15803D" /> : <AlertTriangle size={22} color="#D97706" />}
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#0F172A' }}>
                          Triagem Facial Human AI: {bioMatch ? 'Padrões Compatíveis' : 'Possível Divergência'}
                        </div>
                        <div style={{ fontSize: '0.73rem', color: '#475569' }}>
                          Motor: {biometric.engine} {biometric.engineVersion} • Distância vetorial: {biometric.distance}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 900, color: bioMatch ? '#15803D' : '#D97706' }}>
                      {bioSim}%
                    </div>
                  </div>
                  <div style={{ height: 7, backgroundColor: 'rgba(15,23,42,0.08)', borderRadius: 999, marginTop: 8, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, Math.max(0, bioSim))}%`,
                      height: '100%',
                      backgroundColor: bioMatch ? '#16A34A' : '#D97706'
                    }} />
                  </div>
                  {(biometric.divergences || []).length > 0 && (
                    <div style={{ backgroundColor: '#FFFFFF', borderRadius: 8, padding: '8px 10px', marginTop: 8, border: '1px solid #FDE68A' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#B45309', marginBottom: 3 }}>
                        Alertas do Modelo:
                      </div>
                      {(biometric.divergences || []).map((div, i) => (
                        <div key={i} style={{ fontSize: '0.72rem', color: '#78350F' }}>• {div}</div>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: '0.69rem', color: '#64748B', marginTop: 6 }}>
                    🛡️ {biometric.disclaimer}
                  </div>
                </div>
              );
            })() : (
              <div style={{
                backgroundColor: '#F8FAFC',
                border: '1px dashed #CBD5E1',
                borderRadius: 12,
                padding: '12px 14px',
                fontSize: '0.76rem',
                color: '#64748B'
              }}>
                Laudo de biometria facial automática ainda não anexado ou já expurgado após revisão anterior.
              </div>
            )}
          </div>

          {/* COLUNA DIREITA: Conferência Cadastral, Checklist da Equipe, Ações e Auditoria */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* 1. Conferência Cadastral & Termo Digital */}
            <div style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: 14,
              padding: 14
            }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', marginBottom: 8 }}>
                1. Conferência Cadastral vs Documento
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.76rem' }}>
                <div>
                  <span style={{ color: '#64748B', fontSize: '0.68rem', display: 'block' }}>Nome Completo</span>
                  <strong style={{ color: '#0F172A' }}>{driver.name}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B', fontSize: '0.68rem', display: 'block' }}>CPF</span>
                  <strong style={{ color: '#0F172A', fontFamily: 'monospace' }}>{driver.document || 'Não informado'}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B', fontSize: '0.68rem', display: 'block' }}>Registro CNH / EAR</span>
                  <strong style={{ color: '#0F172A' }}>
                    {driver.cnh || '—'} • {driver.cnhHasEar === false ? 'Sem EAR' : 'Com EAR'}
                  </strong>
                </div>
                <div>
                  <span style={{ color: '#64748B', fontSize: '0.68rem', display: 'block' }}>Cidade / Telefone</span>
                  <strong style={{ color: '#0F172A' }}>{driver.city || '—'} • {driver.phone}</strong>
                </div>
              </div>

              <div style={{
                marginTop: 10,
                padding: '8px 10px',
                borderRadius: 9,
                backgroundColor: driver.termsSignature?.signed ? '#F0FDF4' : '#FFFBEB',
                border: `1px solid ${driver.termsSignature?.signed ? '#BBF7D0' : '#FDE68A'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                flexWrap: 'wrap'
              }}>
                <div style={{ fontSize: '0.73rem', color: '#0F172A' }}>
                  {driver.termsSignature?.signed ? (
                    <>
                      <strong>Termo Assinado:</strong> {driver.termsSignature.validationCode} ({driver.termsSignature.signedAtBrasilia})
                    </>
                  ) : (
                    <strong>Contrato Digital: Sem assinatura eletrônica anexada</strong>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsTermsModalOpen(true)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 7,
                    border: 'none',
                    backgroundColor: driver.termsSignature?.signed ? '#15803D' : '#0F172A',
                    color: '#FFFFFF',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {driver.termsSignature?.signed ? 'Ver Termo' : 'Abrir Minuta'}
                </button>
              </div>
            </div>

            {/* 2. Checklist de Conformidade da Equipe */}
            <div style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 14,
              padding: 14
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase' }}>
                  2. Checklist de Compliance ({checkedCount}/{KYC_CHECKLIST_ITEMS.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const next: Record<string, boolean> = {};
                    KYC_CHECKLIST_ITEMS.forEach(item => { next[item.id] = !allChecked; });
                    setChecklist(next);
                  }}
                  style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  {allChecked ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {KYC_CHECKLIST_ITEMS.map((item) => {
                  const checked = Boolean(checklist[item.id]);
                  return (
                    <label
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 9,
                        padding: '8px 10px',
                        borderRadius: 9,
                        border: checked ? '1px solid #86EFAC' : '1px solid #E2E8F0',
                        backgroundColor: checked ? '#F0FDF4' : '#F8FAFC',
                        fontSize: '0.77rem',
                        fontWeight: checked ? 700 : 500,
                        color: checked ? '#14532D' : '#334155',
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setChecklist(prev => ({ ...prev, [item.id]: e.target.checked }))}
                        style={{ width: 15, height: 15, accentColor: '#16A34A', cursor: 'pointer' }}
                      />
                      <span>{item.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 3. Ações da Central Compliance */}
            <div style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: 14,
              padding: 14
            }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', marginBottom: 10 }}>
                3. Parecer &amp; Decisão Final
              </div>

              {formError && (
                <div style={{
                  marginBottom: 10,
                  padding: '8px 11px',
                  borderRadius: 8,
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  color: '#B91C1C',
                  fontSize: '0.75rem',
                  fontWeight: 700
                }}>
                  {formError}
                </div>
              )}

              {selectedAction ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div style={{
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    color: selectedAction === 'aprovado' ? '#15803D' : selectedAction === 'correcao_solicitada' ? '#B45309' : '#B91C1C'
                  }}>
                    {selectedAction === 'aprovado' && 'Confirmar Aprovação do Motorista (Auto-Purge LGPD das mídias será executado após conclusão):'}
                    {selectedAction === 'correcao_solicitada' && 'Instruções de Correção para o Motorista:'}
                    {selectedAction === 'rejeitado' && 'Motivo Técnico da Recusa:'}
                  </div>

                  {selectedAction !== 'aprovado' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(selectedAction === 'correcao_solicitada' ? CORRECTION_MACROS : REJECTION_MACROS).map((macro, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setReviewNote(macro)}
                          style={{
                            padding: '4px 9px',
                            borderRadius: 999,
                            border: `1px solid ${selectedAction === 'correcao_solicitada' ? '#FCD34D' : '#FECACA'}`,
                            backgroundColor: '#FFFFFF',
                            color: selectedAction === 'correcao_solicitada' ? '#92400E' : '#991B1B',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          + {macro.slice(0, 42)}{macro.length > 42 ? '…' : ''}
                        </button>
                      ))}
                    </div>
                  )}

                  <textarea
                    placeholder={
                      selectedAction === 'aprovado'
                        ? 'Observação opcional interna da auditoria (ex: CNH conferida com EAR ativo)...'
                        : selectedAction === 'correcao_solicitada'
                        ? 'Descreva claramente o que o motorista deve corrigir e reenviar...'
                        : 'Informe o motivo objetivo da recusa do cadastro...'
                    }
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    rows={3}
                    style={{
                      width: '100%',
                      padding: 10,
                      borderRadius: 9,
                      border: '1.5px solid #CBD5E1',
                      fontSize: '0.8rem',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit'
                    }}
                  />

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => { setSelectedAction(null); setFormError(''); }}
                      style={{
                        padding: '9px 14px',
                        borderRadius: 9,
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        color: '#64748B',
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        cursor: 'pointer'
                      }}
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      disabled={actionInProgress !== null}
                      onClick={() => handleExecuteReview(selectedAction)}
                      style={{
                        flex: 1,
                        height: 42,
                        borderRadius: 9,
                        backgroundColor:
                          selectedAction === 'aprovado' ? '#15803D' :
                          selectedAction === 'correcao_solicitada' ? '#D97706' : '#DC2626',
                        color: '#FFFFFF',
                        border: 'none',
                        fontWeight: 800,
                        fontSize: '0.82rem',
                        cursor: actionInProgress ? 'wait' : 'pointer'
                      }}
                    >
                      {actionInProgress ? 'Salvando...' : 'Confirmar Parecer e Notificar'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {!allChecked && (
                    <div style={{ fontSize: '0.72rem', color: '#B45309', fontWeight: 600 }}>
                      Checklist recomendado: verifique os 4 itens antes de aprovar o motorista.
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => { setFormError(''); setSelectedAction('aprovado'); }}
                      style={{
                        height: 44,
                        borderRadius: 10,
                        backgroundColor: '#15803D',
                        color: '#FFFFFF',
                        border: 'none',
                        fontWeight: 800,
                        fontSize: '0.79rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 5
                      }}
                    >
                      <CheckCircle2 size={15} />
                      <span>Aprovar KYC</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setFormError(''); setSelectedAction('correcao_solicitada'); }}
                      style={{
                        height: 44,
                        borderRadius: 10,
                        backgroundColor: '#D97706',
                        color: '#FFFFFF',
                        border: 'none',
                        fontWeight: 800,
                        fontSize: '0.79rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 5
                      }}
                    >
                      <AlertTriangle size={15} />
                      <span>Pedir Correção</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setFormError(''); setSelectedAction('rejeitado'); }}
                      style={{
                        height: 44,
                        borderRadius: 10,
                        backgroundColor: '#DC2626',
                        color: '#FFFFFF',
                        border: 'none',
                        fontWeight: 800,
                        fontSize: '0.79rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 5
                      }}
                    >
                      <XCircle size={15} />
                      <span>Recusar</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Trilha de Auditoria & Retenção LGPD */}
            <div style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 14,
              padding: 14
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#334155' }}>
                  Trilha de Auditoria &amp; Conformidade LGPD ({auditLogs.length})
                </div>
                <button
                  type="button"
                  onClick={handlePurgeDocuments}
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid #FCA5A5',
                    color: '#DC2626',
                    padding: '4px 9px',
                    borderRadius: 7,
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <Trash2 size={12} />
                  <span>Purgar Mídias Sensíveis</span>
                </button>
              </div>

              <div style={{
                maxHeight: 130,
                overflowY: 'auto',
                backgroundColor: '#F8FAFC',
                borderRadius: 9,
                padding: 9,
                border: '1px solid #E2E8F0',
                fontSize: '0.72rem',
                color: '#475569'
              }}>
                {auditLogs.length > 0 ? (
                  auditLogs.map((log: KycAuditLog, idx: number) => (
                    <div key={log.id || idx} style={{ marginBottom: 6, paddingBottom: 6, borderBottom: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#0F172A' }}>
                        <span>{log.performedBy}: {log.action}</span>
                        <span style={{ color: '#64748B', fontWeight: 500 }}>{new Date(log.timestamp).toLocaleString('pt-BR')}</span>
                      </div>
                      {log.notes && <div style={{ color: '#475569', marginTop: 2 }}>{log.notes}</div>}
                    </div>
                  ))
                ) : (
                  <div style={{ color: '#94A3B8', textAlign: 'center', padding: 8 }}>
                    Nenhum evento registrado nesta trilha ainda.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <DriverTermsContractModal
        isOpen={isTermsModalOpen}
        onClose={() => setIsTermsModalOpen(false)}
        mode="admin"
        driver={driver}
      />
    </div>
  );
};
