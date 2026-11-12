import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Clock,
  Eye, RefreshCw, X, FileText, Camera, Trash2, ExternalLink,
  UserCheck, Send, ShieldAlert
} from 'lucide-react';
import { DriverProfile, KycAuditLog, DriverKycData } from '../types';
import { StorageService } from '../services/storage';

interface AdminKycReviewModalProps {
  driver: DriverProfile;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (updatedDriver: DriverProfile) => void;
}

export const AdminKycReviewModal: React.FC<AdminKycReviewModalProps> = ({
  driver,
  isOpen,
  onClose,
  onUpdated,
}) => {
  const [kycData, setKycData] = useState<DriverKycData | null>(driver.kyc || null);
  const [isLoading, setIsLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Form de correção ou recusa
  const [reviewNote, setReviewNote] = useState('');
  const [selectedAction, setSelectedAction] = useState<'aprovado' | 'rejeitado' | 'correcao_solicitada' | null>(null);
  const [adminName, setAdminName] = useState('Administrador Master');

  // Buscar dados e URLs temporárias frescas (15 min) ao abrir
  useEffect(() => {
    if (isOpen && driver.id) {
      loadFreshKyc();
    }
  }, [isOpen, driver.id]);

  const loadFreshKyc = async () => {
    setIsLoading(true);
    const res = await StorageService.fetchDriverKyc(driver.id);
    setIsLoading(false);
    if (res.ok && res.kyc) {
      setKycData(res.kyc);
    }
  };

  if (!isOpen) return null;

  const currentStatus = driver.approvalStatus;
  const biometric = kycData?.biometricResult || driver.kyc?.biometricResult;
  const auditLogs = kycData?.auditLogs || driver.kyc?.auditLogs || [];

  const cnhUrl = kycData?.cnhDocumentUrl || driver.cnhDocumentPhoto || '';
  const selfieUrl = kycData?.selfieUrl || driver.selfiePhoto || '';

  const handleExecuteReview = async (action: 'aprovado' | 'rejeitado' | 'correcao_solicitada') => {
    if (action === 'correcao_solicitada' && !reviewNote.trim()) {
      alert('Por favor, informe a instrução do que o motorista precisa corrigir.');
      return;
    }
    if (action === 'rejeitado' && !reviewNote.trim()) {
      alert('Por favor, informe o motivo da rejeição do cadastro.');
      return;
    }

    setActionInProgress(action);
    const res = await StorageService.adminReviewKyc({
      driverId: driver.id,
      action,
      notes: reviewNote.trim(),
      adminName: adminName.trim() || 'Administrador Master'
    });
    setActionInProgress(null);

    if (res.ok && res.driver) {
      onUpdated(res.driver);
      setSelectedAction(null);
      setReviewNote('');
      loadFreshKyc();
    } else {
      alert(res.error || 'Erro ao processar ação administrativa.');
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
      performedBy: adminName
    });
    setActionInProgress(null);

    if (res.ok && res.driver) {
      onUpdated(res.driver);
      loadFreshKyc();
    } else {
      alert(res.error || 'Erro ao purgar documentos.');
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(6px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxSizing: 'border-box'
    }}>
      <div style={{
        width: '100%',
        maxWidth: 760,
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: '26px 24px',
        color: '#121A21',
        boxShadow: '0 25px 70px rgba(0,0,0,0.3)',
        boxSizing: 'border-box',
        maxHeight: '92vh',
        overflowY: 'auto'
      }}>
        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: '#F0FDF4',
              border: '2px solid #76D800',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#15803D'
            }}>
              <ShieldCheck size={24} />
            </div>
            <div>
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#0F172A', lineHeight: 1.15 }}>
                Análise Manual de KYC & Biometria
              </div>
              <div style={{ fontSize: '0.80rem', color: '#64748B' }}>
                Motorista: <strong>{driver.name}</strong> • CPF: {driver.document} • CNH: {driver.cnh}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              backgroundColor: '#F1F5F9',
              border: 'none',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Status Atual do Cadastro */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: 14,
          padding: '12px 16px',
          marginBottom: 18
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569' }}>Status Atual:</span>
            <span style={{
              padding: '4px 12px',
              borderRadius: 20,
              fontSize: '0.78rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              backgroundColor:
                currentStatus === 'aprovado' ? '#DCFCE7' :
                currentStatus === 'correcao_solicitada' ? '#FEF3C7' :
                currentStatus === 'rejeitado' ? '#FEE2E2' : '#E0E7FF',
              color:
                currentStatus === 'aprovado' ? '#15803D' :
                currentStatus === 'correcao_solicitada' ? '#B45309' :
                currentStatus === 'rejeitado' ? '#B91C1C' : '#3730A3',
              border: `1px solid ${
                currentStatus === 'aprovado' ? '#86EFAC' :
                currentStatus === 'correcao_solicitada' ? '#FCD34D' :
                currentStatus === 'rejeitado' ? '#FCA5A5' : '#A5B4FC'
              }`
            }}>
              {currentStatus === 'aprovado' ? '✅ Aprovado' :
               currentStatus === 'correcao_solicitada' ? '⚠️ Correção Solicitada' :
               currentStatus === 'rejeitado' ? '❌ Rejeitado' :
               currentStatus === 'em_analise' ? '⏳ Em Análise' : '⏳ Pendente'}
            </span>
          </div>

          <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
            Veículo: <strong>{driver.vehicleBrand} {driver.vehicleModel}</strong> ({driver.vehiclePlate})
          </div>
        </div>

        {/* 1. VISUALIZAÇÃO DOS DOCUMENTOS LADO A LADO */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Documentos Submetidos (Acesso Privado via URL Temporária Assinada):</span>
            <button
              type="button"
              onClick={loadFreshKyc}
              style={{
                background: 'none', border: 'none', color: '#2563EB', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
              }}
            >
              <RefreshCw size={13} />
              <span>Atualizar Tokens (15 min)</span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Foto CNH */}
            <div style={{
              backgroundColor: '#F8FAFC',
              border: '1.5px solid #E2E8F0',
              borderRadius: 16,
              padding: 12,
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#475569', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <FileText size={15} color="#2563EB" />
                <span>Documento CNH</span>
              </div>
              {cnhUrl ? (
                <div>
                  <img
                    src={cnhUrl}
                    alt="CNH do Motorista"
                    style={{ maxHeight: 180, width: '100%', objectFit: 'contain', borderRadius: 8, border: '1px solid #CBD5E1' }}
                  />
                  <div style={{ marginTop: 8 }}>
                    <a
                      href={cnhUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '0.74rem', color: '#2563EB', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <span>Abrir em Alta Resolução</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '36px 12px', color: '#94A3B8', fontSize: '0.82rem' }}>
                  Nenhum documento CNH enviado ainda.
                </div>
              )}
            </div>

            {/* Selfie ao Vivo */}
            <div style={{
              backgroundColor: '#F8FAFC',
              border: '1.5px solid #E2E8F0',
              borderRadius: 16,
              padding: 12,
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#475569', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Camera size={15} color="#15803D" />
                <span>Selfie Capturada ao Vivo</span>
              </div>
              {selfieUrl ? (
                <div>
                  <img
                    src={selfieUrl}
                    alt="Selfie do Motorista"
                    style={{ maxHeight: 180, width: '100%', objectFit: 'contain', borderRadius: 8, border: '1px solid #CBD5E1' }}
                  />
                  <div style={{ marginTop: 8 }}>
                    <a
                      href={selfieUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '0.74rem', color: '#2563EB', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <span>Abrir em Alta Resolução</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '36px 12px', color: '#94A3B8', fontSize: '0.82rem' }}>
                  Nenhuma selfie capturada ainda.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. PAINEL DE BIOMETRIA FACIAL (HUMAN AI) */}
        {biometric && (
          <div style={{
            backgroundColor: biometric.match ? '#F0FDF4' : '#FFFBEB',
            border: `1.5px solid ${biometric.match ? '#BBF7D0' : '#FDE68A'}`,
            borderRadius: 16,
            padding: 16,
            marginBottom: 20
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {biometric.match ? (
                  <CheckCircle2 size={24} color="#15803D" />
                ) : (
                  <AlertTriangle size={24} color="#D97706" />
                )}
                <div>
                  <div style={{ fontSize: '0.98rem', fontWeight: 900, color: '#0F172A' }}>
                    Triagem Facial Human: {biometric.match ? 'Padrões Compatíveis' : 'Possível Divergência'}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#64748B' }}>
                    Motor: {biometric.engine} {biometric.engineVersion} • Distância: {biometric.distance}
                  </div>
                </div>
              </div>
              <div style={{
                fontSize: '1.4rem',
                fontWeight: 900,
                color: biometric.match ? '#15803D' : '#D97706'
              }}>
                {biometric.similarity}%
              </div>
            </div>

            {biometric.divergences.length > 0 && (
              <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: '10px 12px', marginBottom: 8, border: '1px solid #FEF3C7' }}>
                <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#B45309', marginBottom: 4 }}>
                  Divergências Identificadas pelo Modelo:
                </div>
                {biometric.divergences.map((div, i) => (
                  <div key={i} style={{ fontSize: '0.74rem', color: '#78350F', marginBottom: 2 }}>
                    • {div}
                  </div>
                ))}
              </div>
            )}

            <div style={{ fontSize: '0.70rem', color: '#64748B', lineHeight: 1.35 }}>
              🛡️ {biometric.disclaimer}
            </div>
          </div>
        )}

        {/* 3. AÇÕES DO ADMINISTRADOR (APROVAR, REJEITAR OU SOLICITAR CORREÇÃO) */}
        <div style={{
          backgroundColor: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: 16,
          padding: 16,
          marginBottom: 20
        }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>
            Ação da Central de Segurança:
          </div>

          {selectedAction ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: selectedAction === 'aprovado' ? '#15803D' : selectedAction === 'correcao_solicitada' ? '#B45309' : '#B91C1C' }}>
                {selectedAction === 'aprovado' && 'Confirmar Aprovação do Motorista:'}
                {selectedAction === 'correcao_solicitada' && 'Instruções de Correção para o Motorista:'}
                {selectedAction === 'rejeitado' && 'Motivo da Recusa Definitiva:'}
              </div>

              {selectedAction !== 'aprovado' && (
                <textarea
                  placeholder={
                    selectedAction === 'correcao_solicitada'
                      ? 'Ex: A foto da CNH ficou com reflexo de luz sobre a data de validade. Por favor, envie uma nova foto nítida e sem reflexos.'
                      : 'Ex: Os dados fornecidos e a documentação não atendem aos requisitos regulamentares da cidade.'
                  }
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: 12,
                    borderRadius: 10,
                    border: '1.5px solid #CBD5E1',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit'
                  }}
                />
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setSelectedAction(null)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 10,
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#64748B',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={actionInProgress !== null}
                  onClick={() => handleExecuteReview(selectedAction)}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: 10,
                    backgroundColor:
                      selectedAction === 'aprovado' ? '#15803D' :
                      selectedAction === 'correcao_solicitada' ? '#D97706' : '#DC2626',
                    color: '#FFFFFF',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    cursor: 'pointer'
                  }}
                >
                  {actionInProgress ? 'Salvando...' : 'Confirmar e Notificar Motorista'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <button
                type="button"
                onClick={() => setSelectedAction('aprovado')}
                style={{
                  height: 46,
                  borderRadius: 12,
                  backgroundColor: '#15803D',
                  color: '#FFFFFF',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <CheckCircle2 size={16} />
                <span>Aprovar Motorista</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedAction('correcao_solicitada')}
                style={{
                  height: 46,
                  borderRadius: 12,
                  backgroundColor: '#D97706',
                  color: '#FFFFFF',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <AlertTriangle size={16} />
                <span>Solicitar Correção</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedAction('rejeitado')}
                style={{
                  height: 46,
                  borderRadius: 12,
                  backgroundColor: '#DC2626',
                  color: '#FFFFFF',
                  border: 'none',
                  fontWeight: 800,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <XCircle size={16} />
                <span>Rejeitar Cadastro</span>
              </button>
            </div>
          )}
        </div>

        {/* 4. REGISTRO DE AUDITORIA & RETENÇÃO LGPD */}
        <div style={{
          borderTop: '1px solid #E2E8F0',
          paddingTop: 16
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#334155' }}>
              Trilha de Auditoria & Conformidade LGPD:
            </div>
            <button
              type="button"
              onClick={handlePurgeDocuments}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid #FCA5A5',
                color: '#DC2626',
                padding: '5px 10px',
                borderRadius: 8,
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <Trash2 size={12} />
              <span>Purgar Documentos Sensíveis</span>
            </button>
          </div>

          <div style={{
            maxHeight: 140,
            overflowY: 'auto',
            backgroundColor: '#F8FAFC',
            borderRadius: 10,
            padding: 10,
            border: '1px solid #E2E8F0',
            fontSize: '0.74rem',
            color: '#475569'
          }}>
            {auditLogs.length > 0 ? (
              auditLogs.map((log: KycAuditLog, idx: number) => (
                <div key={log.id || idx} style={{ marginBottom: 6, paddingBottom: 6, borderBottom: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                    <span>{log.performedBy}: {log.action}</span>
                    <span style={{ color: '#94A3B8' }}>{new Date(log.timestamp).toLocaleString('pt-BR')}</span>
                  </div>
                  {log.notes && <div style={{ color: '#64748B', marginTop: 2 }}>{log.notes}</div>}
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
  );
};

