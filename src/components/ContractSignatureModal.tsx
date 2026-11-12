import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, ShieldCheck, CheckCircle2, Printer, Copy, Check, AlertCircle, Lock } from 'lucide-react';
import { SystemConfig, TermsSignatureTechnicalEvidence } from '../types';
import { ParsedTermsSection } from '../utils/contractMarkdownParser';
import { formatPhone } from '../utils/format';

export interface ContractSignatureInfo {
  signed: boolean;
  contractId: string;
  contractVersion: string;
  contractDate: string;
  contractTitle: string;
  contractHash: string;
  signatureHash: string;
  validationCode: string;
  signedAt: string;
  signedAtBrasilia: string;
  affirmativeAction: string;
  technicalEvidence: TermsSignatureTechnicalEvidence;
}

export interface ContractSignerField {
  label: string;
  value: string;
  monospace?: boolean;
}

interface ContractSignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdminMode?: boolean;
  config?: SystemConfig;
  headerTitle: string;
  contractId: string;
  contractVersion: string;
  contractDate: string;
  contractTitle: string;
  contractDisclaimerSubtitle?: string;
  roleLabel: string;
  signerPrimaryName: string;
  signerPrimaryCpf: string;
  signerSummaryLine: string;
  signerFields: ContractSignerField[];
  signature: ContractSignatureInfo | null;
  sections: ParsedTermsSection[];
  onAccept?: () => void;
}

export const ContractSignatureModal: React.FC<ContractSignatureModalProps> = ({
  isOpen,
  onClose,
  isAdminMode = false,
  config,
  headerTitle,
  contractId,
  contractVersion,
  contractDate,
  contractTitle,
  contractDisclaimerSubtitle,
  roleLabel,
  signerPrimaryName,
  signerPrimaryCpf,
  signerSummaryLine,
  signerFields,
  signature,
  sections,
  onAccept
}) => {
  const [copiedCert, setCopiedCert] = useState(false);

  if (!isOpen) return null;

  const isSigned = Boolean(signature?.signed);
  const companyName = config?.companyName || 'KAVRO DRIVE';
  const companyPhone = config?.companyPhone ? formatPhone(config.companyPhone) : '[CANAL OFICIAL]';
  const companyEmail = config?.companyEmail || '[E-MAIL]';

  const handleCopyCertificate = () => {
    if (!signature) return;
    const summary = [
      `CERTIFICADO DE ASSINATURA ELETRÔNICA — ${signature.contractTitle}`,
      `Código de Validação: ${signature.validationCode}`,
      `Versão do Contrato: ${signature.contractVersion} (${signature.contractId})`,
      `${roleLabel}: ${signerPrimaryName}`,
      ...signerFields.map((f) => `${f.label}: ${f.value}`),
      `Data e Hora (Brasília): ${signature.signedAtBrasilia}`,
      `Timestamp UTC: ${signature.signedAt}`,
      `IP de Origem: ${signature.technicalEvidence?.ip || 'N/A'}`,
      `Dispositivo (User-Agent): ${signature.technicalEvidence?.userAgent || 'N/A'}`,
      `Hash SHA-256 do Contrato: ${signature.contractHash}`,
      `Hash SHA-256 da Assinatura: ${signature.signatureHash}`
    ].join('\n');
    navigator.clipboard?.writeText(summary);
    setCopiedCert(true);
    setTimeout(() => setCopiedCert(false), 2500);
  };

  const handlePrintContract = () => {
    const win = window.open('', '_blank', 'width=900,height=780');
    if (!win) return;
    const escapeHtml = (s: string) =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const fieldsHtml = signerFields
      .map((f) => `<div><div class="lbl">${escapeHtml(f.label)}</div><div class="val">${escapeHtml(f.value)}</div></div>`)
      .join('');

    const sectionsHtml = sections
      .map(
        (sec) => `
        <div style="margin-bottom:16px;page-break-inside:avoid;">
          <h3 style="font-size:13px;font-weight:700;margin:0 0 6px 0;color:#0F172A;border-bottom:1px solid #E2E8F0;padding-bottom:4px;">
            ${escapeHtml(sec.heading)}
          </h3>
          ${sec.blocks
            .map((b) =>
              b.type === 'bullets'
                ? `<ul style="margin:4px 0 8px 18px;padding:0;">${b.items
                    .map((it) => `<li style="margin-bottom:3px;">${escapeHtml(it)}</li>`)
                    .join('')}</ul>`
                : `<p style="margin:0 0 7px 0;">${escapeHtml(b.text)}</p>`
            )
            .join('')}
        </div>`
      )
      .join('');

    win.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Termo Assinado — ${escapeHtml(signerPrimaryName)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 11.5px; line-height: 1.5; margin: 28px; }
  .box { border: 1.5px solid #CBD5E1; border-radius: 8px; padding: 14px; margin-bottom: 18px; background: #F8FAFC; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
  .lbl { font-size: 10px; color: #64748B; text-transform: uppercase; font-weight: 700; }
  .val { font-size: 12px; font-weight: 600; color: #0F172A; }
  .sig { border: 2px solid #16A34A; background: #F0FDF4; border-radius: 8px; padding: 14px; margin-top: 20px; page-break-inside: avoid; }
</style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0F172A;padding-bottom:10px;margin-bottom:16px;">
    <div>
      <div style="font-size:18px;font-weight:800;letter-spacing:-0.02em;">${escapeHtml(companyName.toUpperCase())}</div>
      <div style="font-size:13px;font-weight:700;margin-top:2px;">${escapeHtml(contractTitle)}</div>
      <div style="font-size:10.5px;color:#475569;margin-top:2px;">Versão ${escapeHtml(contractVersion)} • Data de elaboração: ${escapeHtml(contractDate)}</div>
    </div>
    <div style="text-align:right;">
      <div style="display:inline-block;padding:4px 10px;border-radius:4px;background:${isSigned ? '#DCFCE7' : '#FEF3C7'};color:${isSigned ? '#166534' : '#92400E'};font-weight:700;font-size:11px;">
        ${isSigned ? 'ASSINADO DIGITALMENTE' : 'PENDENTE DE ASSINATURA'}
      </div>
      ${signature ? `<div style="font-family:monospace;font-size:10.5px;margin-top:4px;font-weight:700;">${escapeHtml(signature.validationCode)}</div>` : ''}
    </div>
  </div>

  <div class="box">
    <div style="font-size:11px;font-weight:800;text-transform:uppercase;margin-bottom:8px;color:#0F172A;">Identificação do ${escapeHtml(roleLabel)} Signatário</div>
    <div class="grid">
      ${fieldsHtml}
    </div>
  </div>

  ${sectionsHtml}

  <div class="sig">
    <div style="font-size:12px;font-weight:800;color:#166534;margin-bottom:8px;">REGISTRO DE VALIDAÇÃO DIGITAL E ASSINATURA ELETRÔNICA</div>
    ${
      signature
        ? `<div class="grid">
            <div><div class="lbl">Signatário</div><div class="val">${escapeHtml(signerPrimaryName)} (CPF: ${escapeHtml(signerPrimaryCpf)})</div></div>
            <div><div class="lbl">Data e Hora do Aceite</div><div class="val">${escapeHtml(signature.signedAtBrasilia)} (Brasília)</div></div>
            <div><div class="lbl">Código de Validação</div><div class="val" style="font-family:monospace;">${escapeHtml(signature.validationCode)}</div></div>
            <div><div class="lbl">Versão / ID do Contrato</div><div class="val">${escapeHtml(signature.contractVersion)} (${escapeHtml(signature.contractId)})</div></div>
            <div><div class="lbl">IP de Origem</div><div class="val" style="font-family:monospace;">${escapeHtml(signature.technicalEvidence?.ip || 'N/A')}</div></div>
            <div><div class="lbl">Timestamp UTC</div><div class="val" style="font-family:monospace;">${escapeHtml(signature.signedAt)}</div></div>
          </div>
          <div style="margin-top:8px;font-size:10px;color:#334155;">
            <div><strong>Ação Afirmativa:</strong> ${escapeHtml(signature.affirmativeAction)}</div>
            <div style="font-family:monospace;word-break:break-all;margin-top:4px;"><strong>SHA-256 Contrato:</strong> ${escapeHtml(signature.contractHash)}</div>
            <div style="font-family:monospace;word-break:break-all;margin-top:2px;"><strong>SHA-256 Assinatura:</strong> ${escapeHtml(signature.signatureHash)}</div>
            <div style="word-break:break-all;margin-top:2px;"><strong>User-Agent:</strong> ${escapeHtml(signature.technicalEvidence?.userAgent || 'N/A')}</div>
          </div>`
        : `<div style="color:#92400E;">Este ${escapeHtml(roleLabel.toLowerCase())} ainda não possui registro eletrônico de aceite vinculado.</div>`
    }
  </div>
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`);
    win.document.close();
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(4px)',
        zIndex: 100001,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
      onClick={onClose}
    >
      <div
        className="kv-light"
        style={{
          backgroundColor: '#FFFFFF',
          color: '#000000',
          borderRadius: 16,
          width: '100%',
          maxWidth: 760,
          maxHeight: '92dvh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho Preto Estilo Uber / Institucional */}
        <div style={{
          backgroundColor: '#000000',
          color: '#FFFFFF',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              backgroundColor: 'rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <FileText size={19} color="#FFFFFF" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.96rem', fontWeight: 700, color: '#FFFFFF', lineHeight: 1.25 }}>
                {headerTitle}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#CBD5E1', marginTop: 2 }}>
                {contractId} • Versão {contractVersion} • {contractDate}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {(isAdminMode || isSigned) && (
              <button
                type="button"
                onClick={handlePrintContract}
                style={{
                  height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.25)',
                  backgroundColor: 'rgba(255,255,255,0.1)', color: '#FFFFFF',
                  fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6
                }}
              >
                <Printer size={14} />
                <span>Imprimir / PDF</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              style={{
                width: 34, height: 34, borderRadius: '50%', border: 'none',
                backgroundColor: 'rgba(255,255,255,0.14)', color: '#FFFFFF',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Corpo com rolagem */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}>
          {/* Selo de Assinatura Eletrônica */}
          {isSigned && signature ? (
            <div style={{
              backgroundColor: '#F0FDF4',
              border: '1.5px solid #86EFAC',
              borderRadius: 12,
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={20} color="#15803D" />
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#166534' }}>
                      ASSINADO DIGITALMENTE — VALIDAÇÃO ATIVA
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#15803D' }}>
                      Aceite registrado em {signature.signedAtBrasilia} (Horário de Brasília)
                    </div>
                  </div>
                </div>
                <div style={{
                  padding: '5px 10px', borderRadius: 6, backgroundColor: '#DCFCE7',
                  color: '#166534', fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 800
                }}>
                  {signature.validationCode}
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
                gap: 8,
                fontSize: '0.76rem',
                backgroundColor: '#FFFFFF',
                borderRadius: 8,
                padding: 12,
                border: '1px solid #BBF7D0'
              }}>
                {signerFields.map((field) => (
                  <div key={field.label}>
                    <div style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                      {field.label}
                    </div>
                    <div style={{
                      fontWeight: 700,
                      color: '#0F172A',
                      fontFamily: field.monospace ? 'monospace' : 'inherit'
                    }}>
                      {field.value}
                    </div>
                  </div>
                ))}
                <div>
                  <div style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                    IP de Registro
                  </div>
                  <div style={{ fontWeight: 600, color: '#0F172A', fontFamily: 'monospace' }}>
                    {signature.technicalEvidence?.ip || '—'}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '0.7rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div><strong>Evidência Afirmativa:</strong> {signature.affirmativeAction}</div>
                <div style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  <strong>Hash Contrato (SHA-256):</strong> {signature.contractHash}
                </div>
                <div style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  <strong>Hash Assinatura (SHA-256):</strong> {signature.signatureHash}
                </div>
                <div style={{ wordBreak: 'break-all', color: '#475569' }}>
                  <strong>Sessão / Dispositivo:</strong> {signature.technicalEvidence?.userAgent}
                </div>
              </div>

              {(isAdminMode || isSigned) && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={handleCopyCertificate}
                    style={{
                      padding: '6px 12px', borderRadius: 6, border: '1px solid #86EFAC',
                      backgroundColor: '#FFFFFF', color: '#166534', fontSize: '0.74rem', fontWeight: 700,
                      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6
                    }}
                  >
                    {copiedCert ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copiedCert ? 'Certificado Copiado!' : 'Copiar Certificado Digital'}</span>
                  </button>
                </div>
              )}
            </div>
          ) : isAdminMode ? (
            <div style={{
              backgroundColor: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: '0.8rem',
              color: '#92400E'
            }}>
              <AlertCircle size={18} color="#D97706" style={{ flexShrink: 0 }} />
              <div>
                <strong>Assinatura eletrônica ainda não registrada</strong> — cadastro criado antes da versão {contractVersion} dos Termos.
              </div>
            </div>
          ) : (
            <div style={{
              backgroundColor: '#F3F3F3',
              borderRadius: 12,
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', fontWeight: 700, color: '#000000' }}>
                <ShieldCheck size={16} />
                <span>DADOS DO SIGNATÁRIO QUE CONSTARÃO NO ACEITE</span>
              </div>
              <div style={{ fontSize: '0.82rem', color: '#333333', lineHeight: 1.5 }}>
                {signerSummaryLine}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#6B6B6B' }}>
                Operadora: {companyName} • Suporte: {companyPhone} • Contato: {companyEmail}
              </div>
            </div>
          )}

          {/* Cabeçalho da Minuta */}
          <div style={{
            padding: '12px 14px',
            backgroundColor: '#F8FAFC',
            borderRadius: 10,
            border: '1px solid #E2E8F0',
            fontSize: '0.76rem',
            color: '#475569'
          }}>
            <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.88rem' }}>
              KAVRO DRIVE — {contractTitle}
            </div>
            <div style={{ marginTop: 4 }}>
              <strong>Versão:</strong> {contractVersion} — Minuta jurídica para revisão •{' '}
              <strong>Data de elaboração:</strong> {contractDate}
            </div>
            <div style={{ marginTop: 2, fontStyle: 'italic' }}>
              {contractDisclaimerSubtitle || 'Situação: Documento em desenvolvimento — sujeito à revisão jurídica.'}
            </div>
          </div>

          {/* Cláusulas e Anexos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {sections.map((section, idx) => (
              <section
                key={idx}
                style={{
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF'
                }}
              >
                <h4 style={{
                  margin: '0 0 8px 0',
                  fontSize: '0.84rem',
                  fontWeight: 800,
                  color: '#0F172A'
                }}>
                  {section.heading}
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.81rem', lineHeight: 1.55, color: '#334155' }}>
                  {section.blocks.map((block, bIdx) =>
                    block.type === 'bullets' ? (
                      <ul key={bIdx} style={{ margin: '2px 0 4px 18px', padding: 0 }}>
                        {block.items.map((item, iIdx) => (
                          <li key={iIdx} style={{ marginBottom: 3 }}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p key={bIdx} style={{ margin: 0 }}>{block.text}</p>
                    )
                  )}
                </div>
              </section>
            ))}
          </div>

          {/* Bloco Final de Assinatura / Protocolo */}
          <div style={{
            padding: '14px 16px',
            borderRadius: 10,
            backgroundColor: isSigned ? '#F0FDF4' : '#F8FAFC',
            border: `1px solid ${isSigned ? '#86EFAC' : '#E2E8F0'}`,
            fontSize: '0.78rem',
            color: '#334155',
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}>
            <Lock size={16} color={isSigned ? '#15803D' : '#64748B'} style={{ flexShrink: 0 }} />
            <div>
              {isSigned && signature ? (
                <span>
                  Documento assinado eletronicamente por <strong>{signerPrimaryName}</strong>
                  {signerPrimaryCpf && signerPrimaryCpf !== 'Não informado' ? <> (CPF <strong>{signerPrimaryCpf}</strong>)</> : null} em{' '}
                  <strong>{signature.signedAtBrasilia}</strong> sob código <strong>{signature.validationCode}</strong>.
                </span>
              ) : (
                <span>
                  FIM DA MINUTA — VERSÃO {contractVersion}. Ao marcar que concorda no cadastro, o sistema registrará seu aceite eletrônico com data, horário, identificação e hash criptográfico SHA-256.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid #E2E8F0',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 10,
          flexShrink: 0
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              height: 44, padding: '0 18px', borderRadius: 10, border: 'none',
              backgroundColor: '#F3F3F3', color: '#000000', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer'
            }}
          >
            Fechar
          </button>
          {onAccept && (
            <button
              type="button"
              onClick={() => {
                onAccept();
                onClose();
              }}
              style={{
                height: 44, padding: '0 22px', borderRadius: 10, border: 'none',
                backgroundColor: '#000000', color: '#FFFFFF', fontSize: '0.92rem', fontWeight: 600, cursor: 'pointer'
              }}
            >
              Li e concordo com os Termos
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

