import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Car,
  Copy,
  ExternalLink,
  Navigation,
  PartyPopper,
  Plus,
  RefreshCw,
  Share2,
  ShieldCheck,
  Trash2,
  Users,
  X
} from 'lucide-react';
import { ClientProfile, FamilyMemberRecord } from '../types';
import { StorageService } from '../services/storage';
import { formatPhone } from '../utils/format';

interface FamilyProfileFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: ClientProfile | null;
  onRequireAuth?: () => void;
  onUserChange?: (updatedUser: ClientProfile) => void;
}

type FamilyFlowStep = 'hub' | 'intro' | 'form' | 'terms';

function maskBirthDateInput(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

function validateTeenAgeFromBrDate(dateStr: string): { valid: boolean; age?: number; error?: string } {
  const m = dateStr.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) {
    return { valid: false, error: 'Informe a data completa no formato DD/MM/AAAA.' };
  }
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (year < 1920 || month < 1 || month > 12 || day < 1 || day > 31) {
    return { valid: false, error: 'Data de nascimento inválida.' };
  }
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return { valid: false, error: 'Data de nascimento inexistente no calendário.' };
  }
  const now = new Date();
  let age = now.getFullYear() - year;
  const monthDiff = now.getMonth() - (month - 1);
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < day)) {
    age -= 1;
  }
  if (age < 12) {
    return { valid: false, error: 'Permitido apenas para adolescentes a partir de 12 anos (12 a 18 anos).' };
  }
  if (age > 18) {
    return { valid: false, error: 'A conta para adolescentes permite apenas idades entre 12 e 18 anos.' };
  }
  return { valid: true, age };
}

export const FamilyProfileFlowModal: React.FC<FamilyProfileFlowModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onRequireAuth,
  onUserChange
}) => {
  const [step, setStep] = useState<FamilyFlowStep>('hub');
  const [members, setMembers] = useState<FamilyMemberRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState('');

  // Form fields
  const [teenName, setTeenName] = useState('');
  const [teenPhone, setTeenPhone] = useState('');
  const [teenBirthDate, setTeenBirthDate] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showFullTermsNotice, setShowFullTermsNotice] = useState(false);

  // Post-invite celebratory sheet
  const [celebrateData, setCelebrateData] = useState<{
    member: FamilyMemberRecord;
    whatsappUrl: string;
    fullInviteUrl: string;
    alreadyRegistered: boolean;
  } | null>(null);

  const [expandedRidesMemberId, setExpandedRidesMemberId] = useState<string | null>(null);

  const loadFamilyData = async (silent = false) => {
    if (!currentUser?.id) return;
    if (!silent) setIsLoading(true);
    const res = await StorageService.getFamilyMembers(currentUser.id);
    if (!silent) setIsLoading(false);
    if (res.ok && Array.isArray(res.members)) {
      setMembers(res.members);
      return res.members;
    }
    return null;
  };

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    setFeedbackMsg('');
    setCelebrateData(null);

    if (!currentUser?.id) {
      setMembers([]);
      setStep('intro');
      return;
    }

    setStep('hub');
    loadFamilyData(false).then((list) => {
      if (list && list.length === 0) {
        setStep('intro');
      }
    });

    const interval = window.setInterval(() => {
      loadFamilyData(true);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [isOpen, currentUser?.id]);

  if (!isOpen) return null;

  const phoneDigits = teenPhone.replace(/\D/g, '');
  const isPhoneValid = phoneDigits.length >= 10;
  const ageCheck = teenBirthDate.length === 10 ? validateTeenAgeFromBrDate(teenBirthDate) : null;

  const handleImportContact = async () => {
    setErrorMsg('');
    const navContacts = (navigator as unknown as {
      contacts?: {
        select?: (
          props: string[],
          opts?: { multiple?: boolean }
        ) => Promise<Array<{ name?: string[]; tel?: string[] }>>;
      };
    }).contacts;

    if (!navContacts || typeof navContacts.select !== 'function') {
      setFeedbackMsg('Preencha nome, telefone e data de nascimento do adolescente abaixo.');
      return;
    }
    try {
      const picked = await navContacts.select(['name', 'tel'], { multiple: false });
      if (Array.isArray(picked) && picked[0]) {
        if (picked[0].name?.[0]) setTeenName(picked[0].name[0]);
        if (picked[0].tel?.[0]) setTeenPhone(formatPhone(picked[0].tel[0]));
      }
    } catch {
      setErrorMsg('Não foi possível ler a agenda. Digite os dados manualmente.');
    }
  };

  const handleContinueFromForm = () => {
    setErrorMsg('');
    if (!currentUser?.id) {
      onClose();
      onRequireAuth?.();
      return;
    }
    if (teenName.trim().length < 2) {
      setErrorMsg('Informe o nome completo do adolescente.');
      return;
    }
    if (!isPhoneValid) {
      setErrorMsg('Informe um número de telefone válido com DDD (ex.: (48) 99612-3456).');
      return;
    }
    const birthRes = validateTeenAgeFromBrDate(teenBirthDate);
    if (!birthRes.valid) {
      setErrorMsg(birthRes.error || 'Data de nascimento inválida para adolescentes (12 a 18 anos).');
      return;
    }
    setTermsAccepted(false);
    setStep('terms');
  };

  const handleSendInviteSubmit = async () => {
    if (!currentUser?.id) {
      onClose();
      onRequireAuth?.();
      return;
    }
    if (!termsAccepted) {
      setErrorMsg('Marque a caixa declarando que leu e concorda com os termos para enviar o convite.');
      return;
    }
    setIsSubmitting(true);
    setErrorMsg('');
    const res = await StorageService.inviteFamilyTeen(currentUser.id, {
      name: teenName.trim(),
      phone: teenPhone.trim(),
      birthDate: teenBirthDate.trim(),
      termsAccepted: true
    });
    setIsSubmitting(false);

    if (!res.ok || !res.member) {
      setErrorMsg(res.error || 'Não foi possível enviar o convite.');
      return;
    }

    setMembers((prev) => [res.member!, ...prev]);
    setStep('hub');
    setCelebrateData({
      member: res.member,
      whatsappUrl: res.whatsappUrl || '',
      fullInviteUrl: res.fullInviteUrl || `${window.location.origin}${res.member.inviteUrl}`,
      alreadyRegistered: Boolean(res.alreadyRegistered)
    });
    setTeenName('');
    setTeenPhone('');
    setTeenBirthDate('');
    setTermsAccepted(false);

    StorageService.fetchClientProfile(currentUser.id).then((fresh) => {
      if (fresh) onUserChange?.(fresh);
    });
  };

  const handleShareInviteLink = (member: FamilyMemberRecord, directWhatsappUrl?: string) => {
    const fullUrl = `${window.location.origin}${member.inviteUrl}`;
    const defaultMsg =
      member.apiDispatch?.messageText ||
      `${member.guardianName} adicionou você à Família Kavro Drive. Agora, sua conta é para adolescentes (12 a 18 anos). Acesse o link rastreável para ativar: ${fullUrl}`;

    if (navigator.share) {
      navigator
        .share({
          title: 'Convite Perfil Familiar Kavro Drive',
          text: defaultMsg
        })
        .catch(() => {
          if (directWhatsappUrl) window.open(directWhatsappUrl, '_blank', 'noopener,noreferrer');
        });
      return;
    }

    if (directWhatsappUrl || member.apiDispatch?.whatsappUrl) {
      window.open(directWhatsappUrl || member.apiDispatch?.whatsappUrl, '_blank', 'noopener,noreferrer');
    } else if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(fullUrl);
      setFeedbackMsg('Link rastreável copiado!');
    }
  };

  const handleRevokeMember = async (member: FamilyMemberRecord) => {
    if (!currentUser?.id) return;
    setIsSubmitting(true);
    const res = await StorageService.removeFamilyMember(currentUser.id, member.id);
    setIsSubmitting(false);
    if (!res.ok) {
      setErrorMsg(res.error || 'Erro ao remover membro.');
      return;
    }
    setMembers((prev) => prev.filter((m) => m.id !== member.id));
    setFeedbackMsg(`Acesso de ${member.teenName} revogado com sucesso.`);
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10072,
        backgroundColor: 'rgba(0, 0, 0, 0.76)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-end',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          height: '93dvh',
          maxHeight: '95dvh',
          backgroundColor: '#141414',
          color: '#FFFFFF',
          borderRadius: '22px 22px 0 0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.68)'
        }}
      >
        {/* TOP HEADER */}
        <div
          style={{
            padding: '14px 16px 10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexShrink: 0
          }}
        >
          {step === 'hub' || step === 'intro' ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <X size={23} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setErrorMsg('');
                if (step === 'terms') setStep('form');
                else if (step === 'form') setStep(members.length > 0 ? 'hub' : 'intro');
              }}
              aria-label="Voltar"
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <ArrowLeft size={23} />
            </button>
          )}

          <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#FFFFFF' }}>
            {step === 'intro'
              ? 'Adicione um adolescente'
              : step === 'terms'
                ? 'Termos para o Perfil Familiar'
                : step === 'form'
                  ? ''
                  : ''}
          </span>
        </div>

        {/* ALERTS */}
        {(errorMsg || feedbackMsg) && (
          <div style={{ padding: '0 18px 8px 18px', flexShrink: 0 }}>
            {errorMsg && (
              <div
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.16)',
                  border: '1px solid rgba(239, 68, 68, 0.45)',
                  color: '#FCA5A5',
                  borderRadius: 10,
                  padding: '9px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600
                }}
              >
                {errorMsg}
              </div>
            )}
            {feedbackMsg && (
              <div
                style={{
                  backgroundColor: 'rgba(34, 197, 94, 0.16)',
                  border: '1px solid rgba(34, 197, 94, 0.45)',
                  color: '#86EFAC',
                  borderRadius: 10,
                  padding: '9px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  marginTop: errorMsg ? 6 : 0
                }}
              >
                {feedbackMsg}
              </div>
            )}
          </div>
        )}

        {/* SCROLLABLE BODY */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 16 }}>
          {/* STEP 1: INTRO ONBOARDING (Screenshot 2) */}
          {step === 'intro' && (
            <div>
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: 175,
                  overflow: 'hidden',
                  backgroundColor: '#0F2544',
                  marginBottom: 18
                }}
              >
                <img
                  src="/landing/corporate-ride.jpg"
                  alt="Adolescente viajando com segurança Kavro Drive"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }}
                />
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(180deg, rgba(20,20,20,0.05) 35%, #141414 100%)'
                  }}
                />
              </div>

              <div style={{ padding: '0 18px' }}>
                <h2
                  style={{
                    margin: '0 0 12px 0',
                    fontSize: '1.85rem',
                    fontWeight: 800,
                    lineHeight: 1.15,
                    letterSpacing: '-0.025em'
                  }}
                >
                  Convide seu adolescente para viajar de Kavro
                </h2>
                <p style={{ margin: '0 0 18px 0', fontSize: '0.92rem', color: '#D4D4D4', lineHeight: 1.48 }}>
                  Agora você pode permitir que adolescentes (com idades entre 12 e 18 anos)
                  solicitem viagens com:
                </p>

                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {[
                    'Somente os motoristas parceiros mais bem avaliados por outros usuários',
                    'K-Ajuda (monitoramento inteligente de rota e paradas)',
                    'K-Acompanha: compartilhamento automático de viagem ao vivo',
                    'Verificação obrigatória do K-Código (PIN de 4 dígitos)',
                    'Gravação de áudio (K-Áudio)'
                  ].map((item, idx) => (
                    <div
                      key={item}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        padding: '13px 0',
                        borderBottom: idx < 4 ? '1px solid #262626' : 'none'
                      }}
                    >
                      <span
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: '50%',
                          border: '2px solid #FFFFFF',
                          flexShrink: 0
                        }}
                      />
                      <span style={{ fontSize: '0.93rem', fontWeight: 500, color: '#F5F5F5', lineHeight: 1.35 }}>
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: FORMULÁRIO CONVIDE UM ADOLESCENTE (Screenshot 3) */}
          {step === 'form' && (
            <div style={{ padding: '4px 18px 16px 18px' }}>
              <h2
                style={{
                  margin: '0 0 18px 0',
                  fontSize: '1.9rem',
                  fontWeight: 800,
                  lineHeight: 1.12,
                  letterSpacing: '-0.025em'
                }}
              >
                Convide um adolescente
              </h2>

              {/* Card Economize tempo */}
              <div
                style={{
                  border: '1px solid #2D2D30',
                  borderRadius: 14,
                  padding: '15px 16px',
                  backgroundColor: '#18181A',
                  marginBottom: 20
                }}
              >
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#FFFFFF', marginBottom: 4 }}>
                  Economize tempo
                </div>
                <div style={{ fontSize: '0.84rem', color: '#A3A3A3', marginBottom: 14, lineHeight: 1.4 }}>
                  Importe as informações de contato para preencher o formulário
                </div>
                <button
                  type="button"
                  onClick={handleImportContact}
                  style={{
                    backgroundColor: '#2C2C2E',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 999,
                    padding: '9px 16px',
                    fontSize: '0.86rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Selecionar contato
                </button>
              </div>

              {/* Nome */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, marginBottom: 8 }}>
                  Nome
                </label>
                <input
                  type="text"
                  value={teenName}
                  onChange={(e) => setTeenName(e.target.value)}
                  placeholder="Nome completo do adolescente"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    height: 48,
                    borderRadius: 10,
                    border: '1px solid #2E2E30',
                    backgroundColor: '#2A2A2D',
                    color: '#FFFFFF',
                    padding: '0 14px',
                    fontSize: '0.95rem',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Telefone */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, marginBottom: 8 }}>
                  Telefone
                </label>
                <div
                  style={{
                    height: 48,
                    borderRadius: 10,
                    border: teenPhone && !isPhoneValid ? '1.5px solid #F87171' : '1px solid #2E2E30',
                    backgroundColor: '#2A2A2D',
                    padding: '0 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10
                  }}
                >
                  <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#E5E5E5', whiteSpace: 'nowrap' }}>
                    🇧🇷 +55
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={teenPhone}
                    onChange={(e) => setTeenPhone(formatPhone(e.target.value))}
                    placeholder="(48) 99123-4567"
                    style={{
                      flex: 1,
                      background: 'none',
                      border: 'none',
                      color: '#FFFFFF',
                      fontSize: '0.96rem',
                      outline: 'none'
                    }}
                  />
                </div>
                {teenPhone.length > 0 && !isPhoneValid && (
                  <div style={{ marginTop: 7, fontSize: '0.8rem', color: '#F87171', lineHeight: 1.35 }}>
                    Informe um número de telefone no formato correto para continuar (ex.: (48) 99123-4567).
                  </div>
                )}
              </div>

              {/* Data de nascimento */}
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, marginBottom: 8 }}>
                  Data de nascimento
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={teenBirthDate}
                  onChange={(e) => setTeenBirthDate(maskBirthDateInput(e.target.value))}
                  placeholder="DD/MM/YYYY"
                  maxLength={10}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    height: 48,
                    borderRadius: 10,
                    border: ageCheck && !ageCheck.valid ? '1.5px solid #F87171' : '1px solid #2E2E30',
                    backgroundColor: '#2A2A2D',
                    color: '#FFFFFF',
                    padding: '0 14px',
                    fontSize: '0.96rem',
                    letterSpacing: '0.04em',
                    outline: 'none'
                  }}
                />
                {ageCheck && ageCheck.valid && (
                  <div style={{ marginTop: 7, fontSize: '0.8rem', color: '#4ADE80', fontWeight: 600 }}>
                    Idade validada: {ageCheck.age} anos (elegível para conta de adolescente).
                  </div>
                )}
                {ageCheck && !ageCheck.valid && (
                  <div style={{ marginTop: 7, fontSize: '0.8rem', color: '#F87171', fontWeight: 600 }}>
                    {ageCheck.error}
                  </div>
                )}
                <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#A3A3A3', lineHeight: 1.4 }}>
                  A idade do adolescente deve ser 12–18 anos. Essas informações não serão
                  compartilhadas com terceiros. Eles só são usados para validar o vínculo e
                  personalizar a segurança do membro.
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: TERMOS PARA O PERFIL FAMILIAR (Screenshot 4) */}
          {step === 'terms' && (
            <div style={{ padding: '4px 18px 16px 18px' }}>
              <p style={{ margin: '0 0 14px 0', fontSize: '0.94rem', color: '#D4D4D4' }}>
                Para criar uma conta para adolescente ou tutelado, você:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {[
                  'Aceita a responsabilidade por todas as viagens e pedidos feitos pelo adolescente',
                  'Compreende que você pode revogar o acesso de um adolescente removendo-o do seu Perfil Familiar',
                  'Autoriza o uso de qualquer forma de pagamento compartilhada que você adicionar para todas as cobranças do Perfil Familiar',
                  'Concorda em não permitir que menores de idade não autorizados usem o Perfil Familiar',
                  'Declara ser o responsável legal com poderes para representar o adolescente',
                  'Permite que a Kavro Drive se comunique diretamente com o adolescente'
                ].map((clause, idx) => (
                  <div
                    key={clause}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      padding: '14px 0',
                      borderBottom: idx < 5 ? '1px solid #242426' : 'none'
                    }}
                  >
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        border: '2px solid #FFFFFF',
                        flexShrink: 0
                      }}
                    />
                    <span style={{ fontSize: '0.92rem', color: '#F5F5F5', lineHeight: 1.4 }}>
                      {clause}
                    </span>
                  </div>
                ))}
              </div>

              {showFullTermsNotice && (
                <div
                  style={{
                    marginTop: 12,
                    backgroundColor: '#1E1E22',
                    border: '1px solid #303036',
                    borderRadius: 12,
                    padding: '12px',
                    fontSize: '0.8rem',
                    color: '#D4D4D4',
                    lineHeight: 1.45
                  }}
                >
                  Termos Kavro Família (V1): O responsável legal mantém histórico integral de rotas,
                  rastreamento em tempo real, K-Código e K-Ajuda sempre ativos para viagens da conta
                  adolescente (12 a 18 anos), conforme LGPD e Estatuto da Criança e do Adolescente.
                </div>
              )}

              <label
                style={{
                  marginTop: 18,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  cursor: 'pointer',
                  paddingTop: 14,
                  borderTop: '1px solid #262626'
                }}
              >
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  style={{ width: 20, height: 20, marginTop: 2, accentColor: '#FFFFFF', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.84rem', color: '#D4D4D4', lineHeight: 1.42 }}>
                  Ao marcar a caixa, declaro que li e concordo com os{' '}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowFullTermsNotice((p) => !p);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: '#FFFFFF',
                      textDecoration: 'underline',
                      fontSize: '0.84rem',
                      cursor: 'pointer'
                    }}
                  >
                    Termos de Uso do Perfil Familiar, Termos de Uso da Conta para Adolescentes e Aviso de Privacidade
                  </button>
                </span>
              </label>
            </div>
          )}

          {/* STEP 4: HUB PERFIL FAMILIAR — CONTROLE DO RESPONSÁVEL (Screenshot 5 fundo + rastreio) */}
          {step === 'hub' && (
            <div style={{ padding: '0 18px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  marginBottom: 14
                }}
              >
                <h2 style={{ margin: 0, fontSize: '1.85rem', fontWeight: 800, letterSpacing: '-0.025em' }}>
                  Perfil Familiar
                </h2>
                <button
                  type="button"
                  onClick={() => loadFamilyData(false)}
                  aria-label="Atualizar Perfil Familiar"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    border: 'none',
                    backgroundColor: '#262628',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
                </button>
              </div>

              <div style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: 4 }}>Membros</div>
              <p style={{ margin: '0 0 16px 0', fontSize: '0.84rem', color: '#A3A3A3', lineHeight: 1.4 }}>
                Adicione ou remova pessoas que podem usar seu Perfil Familiar. Acompanhe o cadastro,
                status e viagens ao vivo.
              </p>

              {isLoading && members.length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: '#A3A3A3', fontSize: '0.88rem' }}>
                  Carregando membros do Perfil Familiar...
                </div>
              ) : members.length === 0 ? (
                <div
                  style={{
                    backgroundColor: '#1E1E20',
                    border: '1px solid #2D2D30',
                    borderRadius: 16,
                    padding: '24px 18px',
                    textAlign: 'center'
                  }}
                >
                  <Users size={30} color="#60A5FA" style={{ margin: '0 auto 10px auto' }} />
                  <div style={{ fontSize: '0.98rem', fontWeight: 700, marginBottom: 6 }}>
                    Nenhum adolescente adicionado ainda
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#A3A3A3', marginBottom: 16 }}>
                    Convide adolescentes de 12 a 18 anos com rastreamento ao vivo e K-Código obrigatório.
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep('intro')}
                    style={{
                      backgroundColor: '#FFFFFF',
                      color: '#111111',
                      border: 'none',
                      borderRadius: 999,
                      padding: '10px 18px',
                      fontSize: '0.86rem',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    + Convidar adolescente
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {members.map((m) => {
                    const isActive = m.status === 'ativo';
                    const isRidesOpen = expandedRidesMemberId === m.id;
                    const fullInviteLink = `${window.location.origin}${m.inviteUrl}`;

                    return (
                      <div
                        key={m.id}
                        style={{
                          backgroundColor: '#1C1C1E',
                          border: m.activeRide ? '1.5px solid #2563EB' : '1px solid #2D2D30',
                          borderRadius: 16,
                          padding: '14px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '1rem', fontWeight: 800, color: '#FFFFFF' }}>
                                {m.teenName}
                              </span>
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  color: '#CBD5E1',
                                  backgroundColor: '#2C2C2E',
                                  padding: '2px 7px',
                                  borderRadius: 999
                                }}
                              >
                                {m.teenAge} anos
                              </span>
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#A3A3A3', marginTop: 2 }}>
                              {formatPhone(m.teenPhone)} • {m.totalRidesCount || 0} corrida(s)
                            </div>
                          </div>

                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 800,
                              padding: '4px 9px',
                              borderRadius: 999,
                              backgroundColor: isActive ? 'rgba(34,197,94,0.18)' : 'rgba(245,158,11,0.18)',
                              color: isActive ? '#86EFAC' : '#FCD34D',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {isActive ? 'Conta cadastrada' : 'Aguardando cadastro'}
                          </span>
                        </div>

                        {/* CORRIDA ATIVA AO VIVO */}
                        {m.activeRide && (
                          <div
                            style={{
                              marginTop: 12,
                              backgroundColor: '#0F2544',
                              border: '1px solid #1D4ED8',
                              borderRadius: 12,
                              padding: '11px 12px'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 900, color: '#93C5FD', textTransform: 'uppercase' }}>
                                ● Em viagem agora • {m.activeRide.rideCode || m.activeRide.id}
                              </span>
                              <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#FFFFFF' }}>
                                R$ {m.activeRide.totalPrice.toFixed(2).replace('.', ',')}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#E2E8F0', lineHeight: 1.38 }}>
                              <div>Origem: {m.activeRide.originAddress}</div>
                              <div>Destino: {m.activeRide.destinationAddress}</div>
                              {m.activeRide.driverName && (
                                <div style={{ color: '#93C5FD', fontWeight: 700, marginTop: 3 }}>
                                  Motorista: {m.activeRide.driverName}
                                  {m.activeRide.driverPlate ? ` • Placa ${m.activeRide.driverPlate}` : ''}
                                </div>
                              )}
                            </div>
                            {m.activeRide.trackingUrl && (
                              <a
                                href={m.activeRide.trackingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  marginTop: 9,
                                  width: '100%',
                                  boxSizing: 'border-box',
                                  height: 36,
                                  borderRadius: 9,
                                  backgroundColor: '#2563EB',
                                  color: '#FFFFFF',
                                  fontSize: '0.8rem',
                                  fontWeight: 800,
                                  textDecoration: 'none',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 6
                                }}
                              >
                                <Navigation size={14} />
                                <span>Rastrear corrida ao vivo no mapa</span>
                                <ExternalLink size={12} />
                              </a>
                            )}
                          </div>
                        )}

                        {/* AÇÕES DO MEMBRO */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                          {!isActive && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleShareInviteLink(m)}
                                style={{
                                  flex: 1,
                                  minWidth: 130,
                                  height: 36,
                                  borderRadius: 9,
                                  border: 'none',
                                  backgroundColor: '#2563EB',
                                  color: '#FFFFFF',
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 5
                                }}
                              >
                                <Share2 size={13} />
                                <span>Enviar convite WhatsApp</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  if (navigator.clipboard?.writeText) {
                                    navigator.clipboard.writeText(fullInviteLink);
                                    setFeedbackMsg(`Link rastreável de ${m.teenName} copiado!`);
                                  }
                                }}
                                style={{
                                  height: 36,
                                  padding: '0 10px',
                                  borderRadius: 9,
                                  border: '1px solid #3A3A3D',
                                  backgroundColor: '#262628',
                                  color: '#FFFFFF',
                                  fontSize: '0.76rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 5
                                }}
                              >
                                <Copy size={13} />
                                <span>Copiar link</span>
                              </button>
                            </>
                          )}

                          {(m.recentRides?.length || 0) > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedRidesMemberId((cur) => (cur === m.id ? null : m.id))
                              }
                              style={{
                                height: 36,
                                padding: '0 12px',
                                borderRadius: 9,
                                border: '1px solid #3A3A3D',
                                backgroundColor: '#262628',
                                color: '#E5E7EB',
                                fontSize: '0.76rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5
                              }}
                            >
                              <Car size={13} />
                              <span>{isRidesOpen ? 'Ocultar corridas' : `Ver corridas (${m.totalRidesCount})`}</span>
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleRevokeMember(m)}
                            style={{
                              height: 36,
                              padding: '0 11px',
                              borderRadius: 9,
                              border: 'none',
                              backgroundColor: 'rgba(239,68,68,0.16)',
                              color: '#FCA5A5',
                              fontSize: '0.76rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5
                            }}
                          >
                            <Trash2 size={13} />
                            <span>Remover</span>
                          </button>
                        </div>

                        {/* HISTÓRICO DE CORRIDAS DO ADOLESCENTE */}
                        {isRidesOpen && m.recentRides && m.recentRides.length > 0 && (
                          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
                            {m.recentRides.map((rideItem) => (
                              <div
                                key={rideItem.id}
                                style={{
                                  backgroundColor: '#141416',
                                  border: '1px solid #2A2A2D',
                                  borderRadius: 10,
                                  padding: '8px 10px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: 8
                                }}
                              >
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#FFFFFF' }}>
                                    {rideItem.rideCode || rideItem.id} • {rideItem.status}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: '0.72rem',
                                      color: '#A3A3A3',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis'
                                    }}
                                  >
                                    {rideItem.originAddress} → {rideItem.destinationAddress}
                                  </div>
                                </div>
                                {rideItem.trackingUrl && (
                                  <a
                                    href={rideItem.trackingUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      fontSize: '0.72rem',
                                      fontWeight: 700,
                                      color: '#93C5FD',
                                      textDecoration: 'none',
                                      flexShrink: 0
                                    }}
                                  >
                                    Rastrear →
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div
                style={{
                  marginTop: 16,
                  backgroundColor: '#19191B',
                  border: '1px solid #28282B',
                  borderRadius: 12,
                  padding: '12px 14px',
                  fontSize: '0.78rem',
                  color: '#A3A3A3',
                  lineHeight: 1.45,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10
                }}
              >
                <ShieldCheck size={17} color="#60A5FA" style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  Todas as viagens de contas adolescentes exigem K-Código, possuem K-Ajuda
                  (RideCheck) ativo e disparam automaticamente o link de rastreamento para seu
                  WhatsApp no início da corrida.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM FOOTER BUTTON */}
        <div
          style={{
            padding: '12px 18px calc(18px + env(safe-area-inset-bottom, 0px)) 18px',
            backgroundColor: '#141414',
            borderTop: '1px solid #222222',
            flexShrink: 0
          }}
        >
          {step === 'intro' && (
            <button
              type="button"
              onClick={() => {
                if (!currentUser?.id) {
                  onClose();
                  onRequireAuth?.();
                  return;
                }
                setStep('form');
              }}
              style={{
                width: '100%',
                height: 48,
                borderRadius: 10,
                border: 'none',
                backgroundColor: '#EFEFEF',
                color: '#111111',
                fontSize: '0.98rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Selecionar contato
            </button>
          )}

          {step === 'form' && (
            <button
              type="button"
              onClick={handleContinueFromForm}
              style={{
                width: '100%',
                height: 48,
                borderRadius: 10,
                border: 'none',
                backgroundColor: '#EFEFEF',
                color: '#111111',
                fontSize: '0.98rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Enviar convite
            </button>
          )}

          {step === 'terms' && (
            <button
              type="button"
              disabled={!termsAccepted || isSubmitting}
              onClick={handleSendInviteSubmit}
              style={{
                width: '100%',
                height: 48,
                borderRadius: 10,
                border: 'none',
                backgroundColor: termsAccepted ? '#EFEFEF' : '#2E2E30',
                color: termsAccepted ? '#111111' : '#737373',
                fontSize: '0.98rem',
                fontWeight: 700,
                cursor: termsAccepted && !isSubmitting ? 'pointer' : 'not-allowed'
              }}
            >
              {isSubmitting ? 'Enviando convite...' : 'Enviar convite'}
            </button>
          )}

          {step === 'hub' && (
            <button
              type="button"
              onClick={() => setStep('intro')}
              style={{
                width: '100%',
                height: 48,
                borderRadius: 10,
                border: 'none',
                backgroundColor: '#EFEFEF',
                color: '#111111',
                fontSize: '0.96rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7
              }}
            >
              <Plus size={18} />
              <span>Convidar outro adolescente</span>
            </button>
          )}
        </div>

        {/* POPUP COMEMORATIVO "AS VIAGENS PODERÃO COMEÇAR EM BREVE" (Screenshot 5) */}
        {celebrateData && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.72)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 18,
              zIndex: 25
            }}
          >
            <div
              style={{
                width: '100%',
                backgroundColor: '#1E1E20',
                borderRadius: 20,
                padding: '22px 20px',
                border: '1px solid #303036',
                boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: 'rgba(250, 204, 21, 0.16)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <PartyPopper size={25} color="#FACC15" />
                </div>
                <button
                  type="button"
                  onClick={() => setCelebrateData(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#A3A3A3',
                    cursor: 'pointer',
                    padding: 4
                  }}
                >
                  <X size={22} />
                </button>
              </div>

              <h3 style={{ margin: '0 0 12px 0', fontSize: '1.55rem', fontWeight: 800, lineHeight: 1.18 }}>
                As viagens poderão começar em breve
              </h3>

              <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#D4D4D4', lineHeight: 1.48 }}>
                {celebrateData.alreadyRegistered
                  ? `${celebrateData.member.teenName} já possui conta na Kavro Drive e já foi vinculado ao seu Perfil Familiar imediatamente!`
                  : `Se ${celebrateData.member.teenName} já tiver uma conta da Kavro Drive, fará parte do seu Perfil Familiar imediatamente.`}
              </p>

              {!celebrateData.alreadyRegistered && (
                <p style={{ margin: '0 0 18px 0', fontSize: '0.9rem', color: '#D4D4D4', lineHeight: 1.48 }}>
                  Caso ainda não tenha uma conta, ele(a) participará automaticamente depois de
                  abrir o link rastreável enviado para seu WhatsApp e finalizar o cadastro.
                </p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  type="button"
                  onClick={() =>
                    handleShareInviteLink(celebrateData.member, celebrateData.whatsappUrl)
                  }
                  style={{
                    width: '100%',
                    height: 46,
                    borderRadius: 10,
                    border: 'none',
                    backgroundColor: '#EFEFEF',
                    color: '#111111',
                    fontSize: '0.94rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8
                  }}
                >
                  <Share2 size={17} />
                  <span>Divulgar no WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCelebrateData(null)}
                  style={{
                    width: '100%',
                    height: 44,
                    borderRadius: 10,
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: '#FFFFFF',
                    fontSize: '0.94rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
