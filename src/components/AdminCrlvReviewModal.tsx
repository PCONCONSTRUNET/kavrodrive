import React, { useState, useEffect } from 'react';
import {
  Car, CheckCircle2, XCircle, AlertTriangle, X, ZoomIn, ZoomOut,
  RotateCw, SunMedium, FileText, ExternalLink, Download, Edit3,
  Check, Clock, ShieldCheck, Printer, UserCheck
} from 'lucide-react';
import { DriverProfile, DriverVehicle, KycAuditLog } from '../types';
import { StorageService } from '../services/storage';
import { MercosulPlateBadge } from './MercosulPlateBadge';
import { formatPlate, cleanPlate } from '../services/vehicleService';

interface AdminCrlvReviewModalProps {
  driver: DriverProfile;
  vehicle: DriverVehicle;
  isOpen: boolean;
  analystName?: string;
  onClose: () => void;
  onUpdated: (updatedDriver: DriverProfile) => void;
}

const CRLV_CHECKLIST_ITEMS = [
  { id: 'plate_match', label: 'Placa no CRLV confere com o cadastro do veículo' },
  { id: 'vehicle_specs_match', label: 'Marca, modelo, ano e cor conferem com o documento' },
  { id: 'licensing_valid', label: 'Exercício / licenciamento anual em dia e sem restrições' },
  { id: 'doc_legible', label: 'QR Code, Renavam/Código CRLV e campos 100% legíveis' }
] as const;

const CRLV_REJECTION_MACROS = [
  'CRLV vencido ou de exercício anterior — envie o licenciamento atualizado.',
  'Placa informada no cadastro diverge da placa impressa no CRLV.',
  'Documento ilegível, cortado ou com reflexo impedindo a leitura dos dados.',
  'Marca, modelo, ano ou cor divergentes do documento apresentado.',
  'Arquivo enviado não corresponde a um CRLV / CRLV-e oficial.'
];

export const AdminCrlvReviewModal: React.FC<AdminCrlvReviewModalProps> = ({
  driver,
  vehicle,
  isOpen,
  analystName: propAnalystName,
  onClose,
  onUpdated
}) => {
  const [analystName, setAnalystName] = useState(() =>
    propAnalystName ||
    localStorage.getItem('kavro_compliance_analyst_name') ||
    'Equipe Compliance Master'
  );
  const [viewerTab, setViewerTab] = useState<'crlv' | 'vehicle_photo'>('crlv');
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [highContrast, setHighContrast] = useState(false);

  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [isEditingFields, setIsEditingFields] = useState(false);
  const [editBrand, setEditBrand] = useState(vehicle.brand || '');
  const [editModel, setEditModel] = useState(vehicle.model || '');
  const [editYear, setEditYear] = useState(vehicle.year || '');
  const [editColor, setEditColor] = useState(vehicle.color || '');
  const [editPlate, setEditPlate] = useState(vehicle.plate || '');
  const [editCrlvNumber, setEditCrlvNumber] = useState(vehicle.crlvNumber || '');

  const [actionMode, setActionMode] = useState<'aprovar' | 'recusar' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setViewerTab('crlv');
    setZoom(1);
    setRotation(0);
    setHighContrast(false);
    setIsEditingFields(false);
    setActionMode(null);
    setRejectionReason(vehicle.rejectionReason || '');
    setErrorMsg('');
    setEditBrand(vehicle.brand || '');
    setEditModel(vehicle.model || '');
    setEditYear(vehicle.year || '');
    setEditColor(vehicle.color || '');
    setEditPlate(vehicle.plate || '');
    setEditCrlvNumber(vehicle.crlvNumber || '');
    setChecklist(
      vehicle.checklist && typeof vehicle.checklist === 'object'
        ? { ...vehicle.checklist }
        : {}
    );
    if (propAnalystName) {
      setAnalystName(propAnalystName);
    }
  }, [isOpen, vehicle.id, propAnalystName]);

  if (!isOpen) return null;

  const docUrl = vehicle.crlvDocumentPhoto || '';
  const isPdfDoc =
    docUrl.startsWith('data:application/pdf') ||
    docUrl.toLowerCase().includes('.pdf');

  const checkedCount = CRLV_CHECKLIST_ITEMS.filter(item => checklist[item.id]).length;
  const allChecked = checkedCount === CRLV_CHECKLIST_ITEMS.length;

  const handleAnalystChange = (val: string) => {
    setAnalystName(val);
    localStorage.setItem('kavro_compliance_analyst_name', val);
  };

  const handleSubmitDecision = async (decision: 'aprovar' | 'recusar') => {
    setErrorMsg('');
    if (decision === 'recusar' && !rejectionReason.trim()) {
      setErrorMsg('Informe ou selecione o motivo técnico da recusa para orientar o motorista.');
      return;
    }

    const cleanAnalyst = analystName.trim() || 'Equipe Compliance Master';
    localStorage.setItem('kavro_compliance_analyst_name', cleanAnalyst);

    const correctedFields =
      isEditingFields ||
      editBrand !== vehicle.brand ||
      editModel !== vehicle.model ||
      editYear !== vehicle.year ||
      editColor !== vehicle.color ||
      cleanPlate(editPlate) !== cleanPlate(vehicle.plate) ||
      editCrlvNumber !== (vehicle.crlvNumber || '')
        ? {
            brand: editBrand.trim() || vehicle.brand,
            model: editModel.trim() || vehicle.model,
            year: editYear.trim() || vehicle.year,
            color: editColor.trim() || vehicle.color,
            plate: cleanPlate(editPlate) || vehicle.plate,
            crlvNumber: editCrlvNumber.trim()
          }
        : undefined;

    setIsSubmitting(true);
    const res = await StorageService.reviewDriverVehicleAdmin(driver.id, vehicle.id, decision, {
      rejectionReason: decision === 'recusar' ? rejectionReason.trim() : undefined,
      reviewedBy: cleanAnalyst,
      checklist,
      correctedFields
    });
    setIsSubmitting(false);

    if (!res.ok || !res.driver) {
      setErrorMsg(res.error || 'Erro ao salvar análise do CRLV.');
      return;
    }

    onUpdated(res.driver);
    onClose();
  };

  const handlePrintDossier = () => {
    const w = window.open('', '_blank', 'width=860,height=900');
    if (!w) return;
    const statusLabel =
      vehicle.approvalStatus === 'aprovado'
        ? 'APROVADO'
        : vehicle.approvalStatus === 'rejeitado'
        ? 'RECUSADO'
        : 'EM ANÁLISE';

    w.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Parecer CRLV — ${formatPlate(vehicle.plate)}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; padding: 28px; line-height: 1.5; }
            h1 { font-size: 18px; margin: 0 0 6px 0; }
            .meta { font-size: 12px; color: #475569; margin-bottom: 18px; }
            .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin-bottom: 14px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px; }
            .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-weight: bold; font-size: 11px; background: #f1f5f9; }
            ul { margin: 8px 0 0 18px; padding: 0; font-size: 12px; }
          </style>
        </head>
        <body>
          <h1>Dossiê de Análise de Veículo &amp; CRLV — Kavro Drive Compliance</h1>
          <div class="meta">Emitido em ${new Date().toLocaleString('pt-BR')} • Analista: ${analystName || 'Equipe Compliance Master'}</div>
          <div class="card">
            <div class="row"><strong>Motorista Titular:</strong><span>${driver.name} (CPF: ${driver.document || '—'})</span></div>
            <div class="row"><strong>Veículo:</strong><span>${editBrand} ${editModel} ${editYear} • ${editColor}</span></div>
            <div class="row"><strong>Placa Mercosul:</strong><span>${formatPlate(editPlate)}</span></div>
            <div class="row"><strong>Nº / Código CRLV:</strong><span>${editCrlvNumber || 'Não informado'}</span></div>
            <div class="row"><strong>Status Atual:</strong><span class="badge">${statusLabel}</span></div>
            ${vehicle.reviewedBy ? `<div class="row"><strong>Último Revisor:</strong><span>${vehicle.reviewedBy} em ${vehicle.reviewedAt ? new Date(vehicle.reviewedAt).toLocaleString('pt-BR') : '—'}</span></div>` : ''}
          </div>
          <div class="card">
            <strong>Checklist de Conferência (${checkedCount}/${CRLV_CHECKLIST_ITEMS.length}):</strong>
            <ul>
              ${CRLV_CHECKLIST_ITEMS.map(item => `<li>[${checklist[item.id] ? 'OK' : 'PENDENTE'}] ${item.label}</li>`).join('')}
            </ul>
          </div>
          ${rejectionReason ? `<div class="card"><strong>Observação / Parecer:</strong><br/>${rejectionReason}</div>` : ''}
          <script>window.print();</script>
        </body>
      </html>
    `);
    w.document.close();
  };

  const vehAuditLogs: KycAuditLog[] = Array.isArray(vehicle.auditLogs) ? vehicle.auditLogs : [];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.78)',
        backdropFilter: 'blur(5px)',
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
          maxWidth: 1040,
          maxHeight: '94vh',
          backgroundColor: '#FFFFFF',
          borderRadius: 18,
          boxShadow: '0 25px 70px rgba(0,0,0,0.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Barra Superior da Mesa de Análise */}
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
              width: 42,
              height: 42,
              borderRadius: 11,
              backgroundColor: '#ECFDF5',
              border: '1.5px solid #10B981',
              color: '#047857',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Car size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0F172A' }}>
                  Mesa de Conferência CRLV &amp; Vistoria Veicular
                </span>
                <span style={{
                  padding: '3px 10px',
                  borderRadius: 999,
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  backgroundColor:
                    vehicle.approvalStatus === 'aprovado' ? '#DCFCE7' :
                    vehicle.approvalStatus === 'rejeitado' ? '#FEE2E2' : '#FEF3C7',
                  color:
                    vehicle.approvalStatus === 'aprovado' ? '#15803D' :
                    vehicle.approvalStatus === 'rejeitado' ? '#B91C1C' : '#B45309'
                }}>
                  {vehicle.approvalStatus === 'aprovado' ? 'Aprovado' :
                   vehicle.approvalStatus === 'rejeitado' ? 'Recusado' : 'Aguardando Análise'}
                </span>
              </div>
              <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: 2 }}>
                Condutor: <strong>{driver.name}</strong> • CPF {driver.document || '—'} • CNH {driver.cnh || '—'}
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
                value={analystName}
                onChange={(e) => handleAnalystChange(e.target.value)}
                placeholder="Nome do analista"
                title="Analista responsável pela auditoria"
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
              title="Imprimir ou gerar PDF do parecer"
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
              <span>Parecer PDF</span>
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
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 20
        }}>
          {/* COLUNA ESQUERDA: Visor Avançado de Documento CRLV e Foto do Veículo */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8
            }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => { setViewerTab('crlv'); setZoom(1); setRotation(0); }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: viewerTab === 'crlv' ? 'none' : '1px solid #CBD5E1',
                    backgroundColor: viewerTab === 'crlv' ? '#0F172A' : '#FFFFFF',
                    color: viewerTab === 'crlv' ? '#FFFFFF' : '#334155',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5
                  }}
                >
                  <FileText size={13} />
                  <span>Documento CRLV ({isPdfDoc ? 'PDF' : 'Imagem'})</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setViewerTab('vehicle_photo'); setZoom(1); setRotation(0); }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: viewerTab === 'vehicle_photo' ? 'none' : '1px solid #CBD5E1',
                    backgroundColor: viewerTab === 'vehicle_photo' ? '#0F172A' : '#FFFFFF',
                    color: viewerTab === 'vehicle_photo' ? '#FFFFFF' : '#334155',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5
                  }}
                >
                  <Car size={13} />
                  <span>Foto do Veículo</span>
                </button>
              </div>

              {(!isPdfDoc || viewerTab === 'vehicle_photo') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => setZoom(z => Math.max(0.75, Number((z - 0.25).toFixed(2))))}
                    title="Diminuir zoom"
                    style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', cursor: 'pointer' }}
                  >
                    <ZoomOut size={14} />
                  </button>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, minWidth: 38, textAlign: 'center', color: '#0F172A' }}>
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
                    title="Realce de contraste/nitidez"
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
                </div>
              )}
            </div>

            {/* Palco do Documento */}
            <div style={{
              backgroundColor: '#0F172A',
              borderRadius: 14,
              border: '1px solid #334155',
              minHeight: 420,
              maxHeight: 500,
              overflow: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 12,
              position: 'relative'
            }}>
              {viewerTab === 'crlv' ? (
                !docUrl ? (
                  <div style={{ color: '#94A3B8', textAlign: 'center', padding: 24, fontSize: '0.84rem' }}>
                    <AlertTriangle size={28} color="#F59E0B" style={{ marginBottom: 8 }} />
                    <div style={{ fontWeight: 700, color: '#F8FAFC' }}>Nenhum arquivo de CRLV anexado</div>
                    <div style={{ fontSize: '0.75rem', marginTop: 4 }}>
                      Solicite ao motorista o reenvio do CRLV-e na aba Meus Veículos.
                    </div>
                  </div>
                ) : isPdfDoc ? (
                  <iframe
                    src={docUrl}
                    title="Documento CRLV PDF"
                    style={{ width: '100%', height: 460, border: 'none', borderRadius: 8, backgroundColor: '#FFFFFF' }}
                  />
                ) : (
                  <img
                    src={docUrl}
                    alt="Documento CRLV"
                    style={{
                      maxWidth: zoom === 1 ? '100%' : 'none',
                      maxHeight: zoom === 1 ? 450 : 'none',
                      transform: `scale(${zoom}) rotate(${rotation}deg)`,
                      transformOrigin: 'center center',
                      transition: 'transform 0.15s ease',
                      filter: highContrast ? 'contrast(1.35) brightness(1.06)' : 'none',
                      borderRadius: 6
                    }}
                  />
                )
              ) : (
                <img
                  src={vehicle.vehiclePhoto || '/vehicles/kavro-sedan-ev.jpg'}
                  alt={`${vehicle.brand} ${vehicle.model}`}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/vehicles/kavro-sedan-ev.jpg'; }}
                  style={{
                    maxWidth: zoom === 1 ? '100%' : 'none',
                    maxHeight: zoom === 1 ? 450 : 'none',
                    transform: `scale(${zoom}) rotate(${rotation}deg)`,
                    transformOrigin: 'center center',
                    transition: 'transform 0.15s ease',
                    filter: highContrast ? 'contrast(1.25) brightness(1.05)' : 'none',
                    borderRadius: 8
                  }}
                />
              )}
            </div>

            {docUrl && viewerTab === 'crlv' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', color: '#475569' }}>
                <span>Enviado em: {vehicle.submittedAt ? new Date(vehicle.submittedAt).toLocaleString('pt-BR') : '—'}</span>
                <div style={{ display: 'flex', gap: 12 }}>
                  <a
                    href={docUrl}
                    download={`CRLV-${cleanPlate(vehicle.plate)}.${isPdfDoc ? 'pdf' : 'jpg'}`}
                    style={{ color: '#0F172A', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <Download size={13} />
                    <span>Baixar CRLV</span>
                  </a>
                  <a
                    href={docUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#2563EB', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <span>Abrir em Nova Guia</span>
                    <ExternalLink size={13} />
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* COLUNA DIREITA: Conferência Cruzada, Checklist e Parecer */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Card de Conferência Cruzada */}
            <div style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: 14,
              padding: 14
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase' }}>
                  1. Dados Declarados para Conferência
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingFields(v => !v)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 7,
                    border: '1px solid #CBD5E1',
                    backgroundColor: isEditingFields ? '#0F172A' : '#FFFFFF',
                    color: isEditingFields ? '#FFFFFF' : '#0F172A',
                    fontSize: '0.71rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <Edit3 size={12} />
                  <span>{isEditingFields ? 'Concluir Edição' : 'Corrigir Digitação'}</span>
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
                <MercosulPlateBadge plate={editPlate} size="md" />
                <div style={{ fontSize: '0.8rem', color: '#334155', lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 900, fontSize: '0.96rem', color: '#0F172A' }}>
                    {editBrand} {editModel} {editYear}
                  </div>
                  <div>
                    Cor: <strong>{editColor}</strong> • CRLV Nº: <strong style={{ fontFamily: 'monospace' }}>{editCrlvNumber || 'Não informado'}</strong>
                  </div>
                  <div style={{ fontSize: '0.73rem', color: '#64748B' }}>
                    4 portas: {vehicle.hasFourDoors ? 'Sim' : 'Não'} • Ar-condicionado: {vehicle.hasAirConditioning ? 'Sim' : 'Não'}
                  </div>
                </div>
              </div>

              {isEditingFields && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  paddingTop: 10,
                  borderTop: '1px dashed #CBD5E1'
                }}>
                  {[
                    { label: 'Marca', val: editBrand, set: setEditBrand },
                    { label: 'Modelo', val: editModel, set: setEditModel },
                    { label: 'Ano', val: editYear, set: setEditYear },
                    { label: 'Cor', val: editColor, set: setEditColor },
                    { label: 'Placa', val: editPlate, set: (v: string) => setEditPlate(v.toUpperCase()) },
                    { label: 'Código / Nº CRLV', val: editCrlvNumber, set: setEditCrlvNumber }
                  ].map((f) => (
                    <div key={f.label}>
                      <div style={{ fontSize: '0.67rem', fontWeight: 700, color: '#475569', marginBottom: 2 }}>{f.label}</div>
                      <input
                        type="text"
                        value={f.val}
                        onChange={(e) => f.set(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 9px',
                          borderRadius: 7,
                          border: '1px solid #CBD5E1',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Checklist Obrigatório da Equipe */}
            <div style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 14,
              padding: 14
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase' }}>
                  2. Checklist de Conferência ({checkedCount}/{CRLV_CHECKLIST_ITEMS.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const next: Record<string, boolean> = {};
                    CRLV_CHECKLIST_ITEMS.forEach(item => { next[item.id] = !allChecked; });
                    setChecklist(next);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563EB',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {allChecked ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {CRLV_CHECKLIST_ITEMS.map((item) => {
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
                        fontSize: '0.78rem',
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

            {/* Parecer e Ação */}
            <div style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: 14,
              padding: 14
            }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', marginBottom: 10 }}>
                3. Decisão da Central Compliance
              </div>

              {errorMsg && (
                <div style={{
                  marginBottom: 10,
                  padding: '8px 11px',
                  borderRadius: 8,
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FCA5A5',
                  color: '#B91C1C',
                  fontSize: '0.76rem',
                  fontWeight: 700
                }}>
                  {errorMsg}
                </div>
              )}

              {actionMode === 'recusar' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#991B1B' }}>
                    Macros rápidas de motivo técnico (clique para preencher):
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {CRLV_REJECTION_MACROS.map((macro, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setRejectionReason(macro)}
                        style={{
                          padding: '4px 9px',
                          borderRadius: 999,
                          border: '1px solid #FECACA',
                          backgroundColor: '#FFFFFF',
                          color: '#991B1B',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                      >
                        + {macro.slice(0, 44)}{macro.length > 44 ? '…' : ''}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={3}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Descreva o motivo claro para o motorista corrigir ou reenviar o CRLV..."
                    style={{
                      width: '100%',
                      padding: 10,
                      borderRadius: 9,
                      border: '1.5px solid #FCA5A5',
                      fontSize: '0.8rem',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box'
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setActionMode(null)}
                      style={{
                        padding: '9px 14px',
                        borderRadius: 9,
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        color: '#475569',
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        cursor: 'pointer'
                      }}
                    >
                      Voltar
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleSubmitDecision('recusar')}
                      style={{
                        flex: 1,
                        padding: '10px 14px',
                        borderRadius: 9,
                        border: 'none',
                        backgroundColor: '#DC2626',
                        color: '#FFFFFF',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        cursor: isSubmitting ? 'wait' : 'pointer'
                      }}
                    >
                      {isSubmitting ? 'Registrando...' : 'Confirmar Recusa do CRLV'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {!allChecked && (
                    <div style={{ fontSize: '0.72rem', color: '#B45309', fontWeight: 600 }}>
                      Recomenda-se marcar os 4 itens do checklist antes de aprovar o CRLV.
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleSubmitDecision('aprovar')}
                      style={{
                        height: 44,
                        borderRadius: 10,
                        border: 'none',
                        backgroundColor: '#15803D',
                        color: '#FFFFFF',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                        cursor: isSubmitting ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      <CheckCircle2 size={16} />
                      <span>{isSubmitting ? 'Salvando...' : 'Aprovar Veículo & CRLV'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => setActionMode('recusar')}
                      style={{
                        height: 44,
                        borderRadius: 10,
                        border: '1px solid #FCA5A5',
                        backgroundColor: '#FFFFFF',
                        color: '#DC2626',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      <XCircle size={16} />
                      <span>Recusar CRLV</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Histórico de Auditoria do Veículo */}
            <div style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: 12,
              padding: 12
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#334155', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                <ShieldCheck size={14} color="#0F172A" />
                <span>Histórico de Conferência deste Veículo</span>
              </div>
              {vehAuditLogs.length > 0 ? (
                <div style={{ maxHeight: 110, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {vehAuditLogs.map((log, i) => (
                    <div key={log.id || i} style={{ fontSize: '0.72rem', color: '#475569', paddingBottom: 5, borderBottom: '1px solid #F1F5F9' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#0F172A' }}>
                        <span>{log.performedBy} • {log.action === 'approved' ? 'Aprovado' : 'Recusado'}</span>
                        <span style={{ color: '#64748B', fontWeight: 500 }}>{new Date(log.timestamp).toLocaleString('pt-BR')}</span>
                      </div>
                      {log.notes && <div style={{ marginTop: 2 }}>{log.notes}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '0.72rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Clock size={12} />
                  <span>
                    {vehicle.reviewedBy
                      ? `Último parecer por ${vehicle.reviewedBy} em ${vehicle.reviewedAt ? new Date(vehicle.reviewedAt).toLocaleString('pt-BR') : '—'}`
                      : 'Aguardando primeira inspeção da equipe.'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
