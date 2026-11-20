import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  BellRing,
  CarFront,
  Check,
  ChevronRight,
  Download,
  FileText,
  Grid3x3,
  Mic,
  Phone,
  PhoneCall,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Square,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X
} from 'lucide-react';
import {
  ClientProfile,
  EmergencyContact,
  PassengerSafetyPreferences,
  Ride,
  SystemConfig,
  TrustedContact
} from '../types';
import { StorageService } from '../services/storage';
import { formatPhone, getCleanWhatsappNumber } from '../utils/format';
import { KavroSecurityGuideModal } from './KavroSecurityGuideModal';
import { FamilyProfileFlowModal } from './FamilyProfileFlowModal';
import {
  ActiveAudioRecorderSession,
  SafetyAudioClip,
  deleteSafetyAudioClip,
  isAudioCaptureSupported,
  listSafetyAudioClips,
  markSafetyAudioClipReported,
  startSafetyAudioCapture
} from '../utils/safetyAudioRecorder';

export type SafetyCenterInitialView =
  | 'hub'
  | 'pin'
  | 'audio'
  | 'emergency'
  | 'share'
  | 'ridecheck'
  | 'tips'
  | 'family';

interface SafetyCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SystemConfig;
  currentUser: ClientProfile | null;
  activeRide?: Ride | null;
  initialView?: SafetyCenterInitialView;
  onUserChange?: (updatedUser: ClientProfile) => void;
  onRequireAuth?: () => void;
  onOpenSos?: () => void;
  onOpenTerms?: () => void;
}

type ModalView = SafetyCenterInitialView | 'add_contact';
type ContactPoolItem = {
  id: string;
  name: string;
  phone: string;
  relationship: string;
};

const RELATIONSHIPS = ['Mãe', 'Pai', 'Cônjuge', 'Familiar', 'Amigo(a)'];

function normalizePrefs(raw?: PassengerSafetyPreferences | null): PassengerSafetyPreferences {
  const familySafetyEnabled = Boolean(raw?.familySafetyEnabled);
  return {
    boardingPinEnabled: familySafetyEnabled ? true : raw?.boardingPinEnabled !== false,
    customBoardingPin:
      raw?.customBoardingPin && /^\d{4}$/.test(raw.customBoardingPin)
        ? raw.customBoardingPin
        : '9130',
    audioRecordingEnabled: Boolean(raw?.audioRecordingEnabled),
    audioAutoRecord: Boolean(raw?.audioAutoRecord),
    rideCheckEnabled: raw?.rideCheckEnabled !== false,
    familySafetyEnabled,
    familyGuardianName: raw?.familyGuardianName || '',
    familyGuardianPhone: raw?.familyGuardianPhone || ''
  };
}

function getInitials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatDuration(sec: number): string {
  const safe = Math.max(0, Math.round(sec));
  const m = String(Math.floor(safe / 60)).padStart(2, '0');
  const s = String(safe % 60).padStart(2, '0');
  return `${m}:${s}`;
}

const DarkSwitch: React.FC<{
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  ariaLabel: string;
}> = ({ checked, disabled, onToggle, ariaLabel }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    disabled={disabled}
    onClick={onToggle}
    style={{
      width: 50,
      height: 30,
      borderRadius: 999,
      padding: 3,
      border: 'none',
      backgroundColor: checked ? '#E5E7EB' : '#3A3A3C',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: checked ? 'flex-end' : 'flex-start',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.55 : 1,
      transition: 'all 0.16s ease',
      flexShrink: 0
    }}
  >
    <span
      style={{
        width: 24,
        height: 24,
        borderRadius: '50%',
        backgroundColor: checked ? '#111111' : '#8E8E93',
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)'
      }}
    />
  </button>
);

const ContactEmptyBadgeIcon: React.FC = () => (
  <div style={{ position: 'relative', width: 58, height: 58, margin: '0 auto 14px auto' }}>
    <div
      style={{
        width: 52,
        height: 52,
        borderRadius: 12,
        backgroundColor: '#2563EB',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        border: '2px solid #60A5FA'
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          backgroundColor: '#FFFFFF',
          marginBottom: 4
        }}
      />
      <div
        style={{
          width: 24,
          height: 10,
          borderRadius: '10px 10px 4px 4px',
          backgroundColor: '#FFFFFF'
        }}
      />
    </div>
    <div
      style={{
        position: 'absolute',
        top: -5,
        right: -2,
        width: 24,
        height: 24,
        borderRadius: '50%',
        backgroundColor: '#0A0A0A',
        border: '2px solid #141414',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#FFFFFF',
        fontSize: '0.95rem',
        fontWeight: 900
      }}
    >
      *
    </div>
  </div>
);

export const SafetyCenterModal: React.FC<SafetyCenterModalProps> = ({
  isOpen,
  onClose,
  config,
  currentUser,
  activeRide,
  initialView = 'hub',
  onUserChange,
  onRequireAuth,
  onOpenSos,
  onOpenTerms
}) => {
  const [view, setView] = useState<ModalView>(initialView);
  const [addTarget, setAddTarget] = useState<'emergency' | 'share'>('emergency');
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isFamilyFlowOpen, setIsFamilyFlowOpen] = useState(false);

  const [prefs, setPrefs] = useState<PassengerSafetyPreferences>(() =>
    normalizePrefs(currentUser?.safetyPreferences)
  );
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>(
    currentUser?.emergencyContacts || []
  );
  const [trustedContacts, setTrustedContacts] = useState<TrustedContact[]>(
    currentUser?.trustedContacts || []
  );

  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showLearnMore, setShowLearnMore] = useState(false);

  // K-Código edição
  const [isEditingPin, setIsEditingPin] = useState(false);
  const [pinDraft, setPinDraft] = useState('9130');

  // Adicionar contato
  const [searchQuery, setSearchQuery] = useState('');
  const [isModifyMode, setIsModifyMode] = useState(false);
  const [showNewContactForm, setShowNewContactForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRel, setNewRel] = useState('Familiar');
  const [newAutoShareMode, setNewAutoShareMode] = useState<'all' | 'night' | 'sos'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [extraPoolContacts, setExtraPoolContacts] = useState<ContactPoolItem[]>([]);

  // K-Áudio gravação real
  const [audioClips, setAudioClips] = useState<SafetyAudioClip[]>([]);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const recorderRef = useRef<ActiveAudioRecorderSession | null>(null);
  const mountedUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    if (initialView === 'family') {
      setView('hub');
      setIsFamilyFlowOpen(true);
    } else {
      setView(initialView);
    }
    setShowLearnMore(false);
    setErrorMsg('');
    setFeedback('');
    setIsEditingPin(false);

    const normalized = normalizePrefs(currentUser?.safetyPreferences);
    setPrefs(normalized);
    setPinDraft(normalized.customBoardingPin || '9130');
    setEmergencyContacts(currentUser?.emergencyContacts || []);
    setTrustedContacts(currentUser?.trustedContacts || []);

    if (currentUser?.id) {
      StorageService.getClientSafety(currentUser.id).then((res) => {
        if (res.ok && res.client) {
          const freshPrefs = normalizePrefs(res.safetyPreferences || res.client.safetyPreferences);
          setPrefs(freshPrefs);
          setPinDraft(freshPrefs.customBoardingPin || '9130');
          setEmergencyContacts(res.emergencyContacts || res.client.emergencyContacts || []);
          setTrustedContacts(res.trustedContacts || res.client.trustedContacts || []);
          onUserChange?.(res.client);
        }
      });
    }

    listSafetyAudioClips().then((clips) => {
      setAudioClips(clips);
    });
  }, [isOpen, currentUser?.id, initialView]);

  useEffect(() => {
    mountedUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    mountedUrlsRef.current = [];
    const nextMap: Record<string, string> = {};
    audioClips.forEach((clip) => {
      try {
        const url = URL.createObjectURL(clip.blob);
        nextMap[clip.id] = url;
        mountedUrlsRef.current.push(url);
      } catch {
        // ignore blob errors
      }
    });
    setAudioUrls(nextMap);
    return () => {
      mountedUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      mountedUrlsRef.current = [];
    };
  }, [audioClips]);

  useEffect(() => {
    if (!isOpen && recorderRef.current) {
      recorderRef.current.cancel();
      recorderRef.current = null;
      setIsRecording(false);
      setRecordingSec(0);
    }
  }, [isOpen]);

  const combinedContactPool = useMemo(() => {
    const byDigits = new Map<string, ContactPoolItem>();
    const addItem = (item: ContactPoolItem) => {
      const digits = item.phone.replace(/\D/g, '');
      const key = digits || item.id;
      if (!byDigits.has(key)) {
        byDigits.set(key, item);
      }
    };
    emergencyContacts.forEach((c) =>
      addItem({
        id: c.id,
        name: c.name,
        phone: c.phone,
        relationship: c.relationship || 'Emergência'
      })
    );
    trustedContacts.forEach((c) =>
      addItem({
        id: c.id,
        name: c.name,
        phone: c.phone,
        relationship: c.relationship || 'Familiar'
      })
    );
    extraPoolContacts.forEach(addItem);

    const list = Array.from(byDigits.values());
    list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return list;
  }, [emergencyContacts, trustedContacts, extraPoolContacts]);

  const filteredPool = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const qDigits = searchQuery.replace(/\D/g, '');
    if (!q) return combinedContactPool;
    return combinedContactPool.filter((c) => {
      const nameHit = c.name.toLowerCase().includes(q);
      const phoneHit = qDigits ? c.phone.replace(/\D/g, '').includes(qDigits) : c.phone.includes(q);
      return nameHit || phoneHit;
    });
  }, [combinedContactPool, searchQuery]);

  if (!isOpen) return null;

  const ensureAuthenticated = (): boolean => {
    if (!currentUser?.id) {
      onClose();
      onRequireAuth?.();
      return false;
    }
    return true;
  };

  const persistSafetyPreferences = async (
    nextPrefs: PassengerSafetyPreferences,
    nextEmergency: EmergencyContact[] = emergencyContacts,
    successNote?: string
  ): Promise<boolean> => {
    setPrefs(nextPrefs);
    setEmergencyContacts(nextEmergency);
    if (!currentUser?.id) {
      setErrorMsg('Entre ou cadastre sua conta para salvar suas preferências no servidor.');
      return false;
    }
    setIsSaving(true);
    setErrorMsg('');
    const res = await StorageService.updateClientSafety(currentUser.id, {
      safetyPreferences: nextPrefs,
      emergencyContacts: nextEmergency
    });
    setIsSaving(false);
    if (!res.ok) {
      setErrorMsg(res.error || 'Erro ao salvar preferências de segurança.');
      return false;
    }
    if (res.client) {
      onUserChange?.(res.client);
    }
    if (successNote) {
      setFeedback(successNote);
      window.setTimeout(() => setFeedback(''), 2800);
    }
    return true;
  };

  const persistTrustedContacts = async (
    nextTrusted: TrustedContact[],
    successNote?: string
  ): Promise<boolean> => {
    setTrustedContacts(nextTrusted);
    if (!ensureAuthenticated() || !currentUser?.id) return false;
    setIsSaving(true);
    setErrorMsg('');
    const res = await StorageService.updateTrustedContacts(currentUser.id, nextTrusted);
    setIsSaving(false);
    if (!res.ok) {
      setErrorMsg(res.error || 'Erro ao salvar contatos de acompanhamento.');
      return false;
    }
    if (res.client) {
      onUserChange?.(res.client);
    }
    if (successNote) {
      setFeedback(successNote);
      window.setTimeout(() => setFeedback(''), 2800);
    }
    return true;
  };

  const openAddContactScreen = (target: 'emergency' | 'share') => {
    setAddTarget(target);
    setSearchQuery('');
    setIsModifyMode(false);
    setShowNewContactForm(combinedContactPool.length === 0);
    setErrorMsg('');
    if (target === 'emergency') {
      setSelectedIds(emergencyContacts.map((c) => c.id));
    } else {
      setSelectedIds(trustedContacts.map((c) => c.id));
    }
    setView('add_contact');
  };

  const handleImportDeviceContacts = async () => {
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
      setShowNewContactForm(true);
      setErrorMsg('Agenda nativa disponível apenas no celular. Digite nome e WhatsApp abaixo.');
      return;
    }
    try {
      const picked = await navContacts.select(['name', 'tel'], { multiple: true });
      if (!Array.isArray(picked) || picked.length === 0) return;
      const imported: ContactPoolItem[] = [];
      picked.forEach((p, idx) => {
        const pName = String(p.name?.[0] || '').trim();
        const pTel = String(p.tel?.[0] || '').trim();
        if (pName && pTel.replace(/\D/g, '').length >= 10) {
          imported.push({
            id: `phone-${Date.now()}-${idx}`,
            name: pName,
            phone: pTel,
            relationship: 'Contato'
          });
        }
      });
      if (imported.length > 0) {
        setExtraPoolContacts((prev) => [...imported, ...prev]);
        setSelectedIds((prev) => Array.from(new Set([...prev, ...imported.map((i) => i.id)])));
      }
    } catch {
      setErrorMsg('Não foi possível ler os contatos da agenda.');
    }
  };

  const handleAddNewPoolContact = () => {
    setErrorMsg('');
    const cleanName = newName.trim();
    const digits = newPhone.replace(/\D/g, '');
    if (cleanName.length < 2) {
      setErrorMsg('Informe o nome completo do contato.');
      return;
    }
    if (digits.length < 10) {
      setErrorMsg('Informe um número de WhatsApp/telefone válido com DDD.');
      return;
    }
    const createdId = `ct-${Date.now()}`;
    const created: ContactPoolItem = {
      id: createdId,
      name: cleanName,
      phone: formatPhone(digits),
      relationship: newRel
    };
    setExtraPoolContacts((prev) => [created, ...prev]);
    setSelectedIds((prev) => {
      if (prev.length >= 5) return prev;
      return [...prev, createdId];
    });
    setNewName('');
    setNewPhone('');
    setShowNewContactForm(false);
  };

  const handleConfirmSelectedContacts = async () => {
    if (!ensureAuthenticated()) return;
    if (selectedIds.length > 5) {
      setErrorMsg('Você pode selecionar no máximo 5 contatos.');
      return;
    }
    const chosenPool = combinedContactPool.filter((c) => selectedIds.includes(c.id));
    if (chosenPool.length === 0) {
      setErrorMsg('Selecione ou adicione pelo menos 1 contato.');
      return;
    }

    if (addTarget === 'emergency') {
      const nextList: EmergencyContact[] = chosenPool.map((c) => ({
        id: c.id.startsWith('ec-') ? c.id : `ec-${c.id}`,
        name: c.name,
        phone: c.phone,
        relationship: c.relationship || 'Emergência',
        createdAt: new Date().toISOString()
      }));
      const ok = await persistSafetyPreferences(prefs, nextList, 'Contatos de emergência salvos!');
      if (ok) setView('emergency');
    } else {
      const nextTrusted: TrustedContact[] = chosenPool.map((c) => {
        const existing = trustedContacts.find((tc) => tc.id === c.id);
        if (existing) return existing;
        return {
          id: c.id.startsWith('tc-') ? c.id : `tc-${c.id}`,
          name: c.name,
          relationship: c.relationship || 'Familiar',
          phone: c.phone,
          autoShareAllRides: newAutoShareMode === 'all',
          autoShareNightOnly: newAutoShareMode === 'night',
          notifyOnAnomalyOrSos: true,
          createdAt: new Date().toISOString()
        };
      });
      const ok = await persistTrustedContacts(nextTrusted, 'Contatos de acompanhamento salvos!');
      if (ok) setView('share');
    }
  };

  const handleToggleStartRecording = async () => {
    setErrorMsg('');
    if (isRecording && recorderRef.current) {
      try {
        const clip = await recorderRef.current.stop();
        recorderRef.current = null;
        setIsRecording(false);
        setRecordingSec(0);
        setAudioClips((prev) => [clip, ...prev]);
        setFeedback('Áudio salvo com segurança neste aparelho.');
        if (activeRide?.id && currentUser?.id) {
          await StorageService.reportSafetyAudioIncident(activeRide.id, {
            durationSec: clip.durationSec,
            mimeType: clip.mimeType,
            sizeBytes: clip.sizeBytes,
            recordedAt: clip.createdAt,
            escalateToSos: false
          });
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Erro ao encerrar gravação.');
      }
      return;
    }

    try {
      const session = await startSafetyAudioCapture({
        rideId: activeRide?.id,
        rideCode: activeRide?.rideCode,
        onTick: (sec) => setRecordingSec(sec)
      });
      recorderRef.current = session;
      setIsRecording(true);
      setRecordingSec(0);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Permissão de microfone negada. Autorize o microfone nas configurações do navegador.'
      );
    }
  };

  const handleSendClipToCentral = async (clip: SafetyAudioClip) => {
    if (!activeRide?.id) {
      setFeedback('Inicie uma viagem para anexar este áudio diretamente à corrida.');
      return;
    }
    setIsSaving(true);
    const res = await StorageService.reportSafetyAudioIncident(activeRide.id, {
      durationSec: clip.durationSec,
      mimeType: clip.mimeType,
      sizeBytes: clip.sizeBytes,
      recordedAt: clip.createdAt,
      notes: 'Anexado pelo passageiro na Central de Segurança K-Áudio.',
      escalateToSos: true
    });
    setIsSaving(false);
    if (res.ok) {
      await markSafetyAudioClipReported(clip.id);
      setAudioClips((prev) =>
        prev.map((c) => (c.id === clip.id ? { ...c, reportedToSos: true } : c))
      );
      setFeedback('Registro K-Áudio anexado à corrida e notificado à Central SOS!');
    } else {
      setErrorMsg(res.error || 'Não foi possível enviar registro K-Áudio.');
    }
  };

  const handleShareRideNow = async () => {
    if (!activeRide?.id) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/rides/${encodeURIComponent(activeRide.id)}/share-trusted-contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...StorageService.getAuthHeaders() }
      });
      const data = await res.json();
      if (res.ok && data?.ok) {
        setFeedback('Link ao vivo enviado pela API para seus contatos configurados!');
      } else {
        setErrorMsg(data?.error || 'Não foi possível compartilhar agora.');
      }
    } catch {
      setErrorMsg('Erro de conexão ao compartilhar rota.');
    } finally {
      setIsSaving(false);
    }
  };

  const spacedPinDigits = (prefs.customBoardingPin || '9130').split('').join(' ');

  return (
    <>
      {createPortal(
        <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10065,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
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
          height: '92dvh',
          maxHeight: '94dvh',
          backgroundColor: '#141414',
          color: '#FFFFFF',
          borderRadius: '22px 22px 0 0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 -12px 40px rgba(0, 0, 0, 0.65)'
        }}
      >
        {/* TOP NAVIGATION BAR */}
        <div
          style={{
            padding: '14px 16px 8px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0
          }}
        >
          {view === 'hub' ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar Central de segurança"
              style={{
                width: 36,
                height: 36,
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
              <X size={24} />
            </button>
          ) : view === 'add_contact' ? (
            <>
              <button
                type="button"
                onClick={() => setView(addTarget === 'emergency' ? 'emergency' : 'share')}
                aria-label="Voltar"
                style={{
                  width: 36,
                  height: 36,
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
              <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#FFFFFF' }}>
                Adicionar contato
              </span>
              <button
                type="button"
                onClick={() => setIsModifyMode((prev) => !prev)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#FFFFFF',
                  fontSize: '0.92rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '4px 6px'
                }}
              >
                {isModifyMode ? 'Pronto' : 'Modificar'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setView('hub');
                setShowLearnMore(false);
                setErrorMsg('');
                setIsEditingPin(false);
              }}
              aria-label="Voltar para Central de segurança"
              style={{
                width: 36,
                height: 36,
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
              {view === 'pin' || view === 'tips' || view === 'audio' ? (
                <ArrowLeft size={23} />
              ) : (
                <X size={23} />
              )}
            </button>
          )}
          {view !== 'add_contact' && <div style={{ width: 36 }} />}
        </div>

        {/* AVISOS INLINE */}
        {(feedback || errorMsg) && (
          <div style={{ padding: '0 18px 8px 18px', flexShrink: 0 }}>
            {feedback && (
              <div
                style={{
                  backgroundColor: 'rgba(34, 197, 94, 0.16)',
                  border: '1px solid rgba(34, 197, 94, 0.45)',
                  color: '#86EFAC',
                  borderRadius: 10,
                  padding: '8px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600
                }}
              >
                {feedback}
              </div>
            )}
            {errorMsg && (
              <div
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.16)',
                  border: '1px solid rgba(239, 68, 68, 0.45)',
                  color: '#FCA5A5',
                  borderRadius: 10,
                  padding: '8px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  marginTop: feedback ? 6 : 0
                }}
              >
                {errorMsg}
              </div>
            )}
          </div>
        )}

        {/* CONTEÚDO PRINCIPAL */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 18px 24px 18px' }}>
          {/* 1. HUB: CENTRAL DE SEGURANÇA (Screenshot 1) */}
          {view === 'hub' && (
            <div>
              <h2
                style={{
                  margin: '0 0 20px 0',
                  fontSize: '1.85rem',
                  fontWeight: 800,
                  letterSpacing: '-0.025em',
                  color: '#FFFFFF'
                }}
              >
                Central de segurança
              </h2>

              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: '1.22rem', fontWeight: 800, color: '#FFFFFF' }}>
                  Preferências de segurança
                </div>
                <div
                  style={{
                    fontSize: '0.86rem',
                    color: '#A3A3A3',
                    marginTop: 4,
                    marginBottom: 10,
                    lineHeight: 1.35
                  }}
                >
                  Gerencie e programe seus recursos de segurança antes de viajar
                </div>

                {/* Item 1: K-Código */}
                <button
                  type="button"
                  onClick={() => {
                    setShowLearnMore(false);
                    setView('pin');
                  }}
                  style={{
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    padding: '15px 0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 14,
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: '#FFFFFF'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
                    <Grid3x3 size={22} color="#E5E5E5" style={{ flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '0.98rem', fontWeight: 600, color: '#FFFFFF' }}>
                        K-Código: Verificação de viagens
                      </div>
                      <div
                        style={{
                          fontSize: '0.82rem',
                          color: '#A3A3A3',
                          marginTop: 3,
                          lineHeight: 1.35
                        }}
                      >
                        Use o K-Código para ajudar você a entrar no carro certo.
                      </div>
                    </div>
                  </div>
                  {prefs.boardingPinEnabled ? (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: '#3B82F6',
                        flexShrink: 0
                      }}
                    />
                  ) : (
                    <ChevronRight size={18} color="#737373" style={{ flexShrink: 0 }} />
                  )}
                </button>

                {/* Item 2: K-Áudio */}
                <button
                  type="button"
                  onClick={() => {
                    setShowLearnMore(false);
                    setView('audio');
                  }}
                  style={{
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    padding: '15px 0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 14,
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: '#FFFFFF'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
                    <Mic size={22} color="#E5E5E5" style={{ flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '0.98rem', fontWeight: 600, color: '#FFFFFF' }}>
                        K-Áudio
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#A3A3A3', marginTop: 3 }}>
                        Grave o áudio da sua viagem.
                      </div>
                    </div>
                  </div>
                  {prefs.audioRecordingEnabled || audioClips.length > 0 ? (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: '#3B82F6',
                        flexShrink: 0
                      }}
                    />
                  ) : (
                    <ChevronRight size={18} color="#737373" style={{ flexShrink: 0 }} />
                  )}
                </button>

                {/* Item 3: Contatos de emergência */}
                <button
                  type="button"
                  onClick={() => {
                    setShowLearnMore(false);
                    setView('emergency');
                  }}
                  style={{
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    padding: '15px 0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 14,
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: '#FFFFFF'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
                    <UserPlus size={22} color="#E5E5E5" style={{ flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '0.98rem', fontWeight: 600, color: '#FFFFFF' }}>
                        Contatos de emergência
                      </div>
                      <div
                        style={{
                          fontSize: '0.82rem',
                          color: '#A3A3A3',
                          marginTop: 3,
                          lineHeight: 1.35
                        }}
                      >
                        Vamos avisar e ligar para eles em caso de emergência.
                      </div>
                    </div>
                  </div>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: emergencyContacts.length > 0 ? '#3B82F6' : '#3B82F6',
                      opacity: emergencyContacts.length > 0 ? 1 : 0.75,
                      flexShrink: 0
                    }}
                  />
                </button>

                {/* Item 4: K-Acompanha */}
                <button
                  type="button"
                  onClick={() => {
                    setShowLearnMore(false);
                    setView('share');
                  }}
                  style={{
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    padding: '15px 0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 14,
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: '#FFFFFF'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
                    <UserCheck size={22} color="#E5E5E5" style={{ flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '0.98rem', fontWeight: 600, color: '#FFFFFF' }}>
                        K-Acompanha
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#A3A3A3', marginTop: 3 }}>
                        {trustedContacts.length > 0
                          ? `${trustedContacts.length} contato(s) acompanhando suas viagens.`
                          : 'Permita que contatos acompanhem suas viagens.'}
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={18} color="#737373" style={{ flexShrink: 0 }} />
                </button>

                {/* Item 5: K-Ajuda (RideCheck) */}
                <button
                  type="button"
                  onClick={() => {
                    setShowLearnMore(false);
                    setView('ridecheck');
                  }}
                  style={{
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    padding: '15px 0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 14,
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: '#FFFFFF'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
                    <CarFront size={22} color="#E5E5E5" style={{ flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '0.98rem', fontWeight: 600, color: '#FFFFFF' }}>
                        K-Ajuda
                      </div>
                      <div
                        style={{
                          fontSize: '0.82rem',
                          color: '#A3A3A3',
                          marginTop: 3,
                          lineHeight: 1.35
                        }}
                      >
                        Receba uma mensagem se detectarmos um possível problema de segurança.
                      </div>
                      <span
                        style={{
                          display: 'inline-block',
                          marginTop: 7,
                          backgroundColor: prefs.rideCheckEnabled ? '#153057' : '#262626',
                          color: prefs.rideCheckEnabled ? '#93C5FD' : '#A3A3A3',
                          fontSize: '0.73rem',
                          fontWeight: 700,
                          padding: '3px 9px',
                          borderRadius: 6
                        }}
                      >
                        {prefs.rideCheckEnabled ? 'Todas as viagens' : 'Desativado'}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={18} color="#737373" style={{ flexShrink: 0 }} />
                </button>
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: '1.22rem', fontWeight: 800, color: '#FFFFFF', marginBottom: 8 }}>
                  Mais opções de segurança
                </div>

                <button
                  type="button"
                  onClick={() => setView('tips')}
                  style={{
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    padding: '14px 0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 14,
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <ShieldCheck size={22} color="#E5E5E5" />
                    <div>
                      <div style={{ fontSize: '0.96rem', fontWeight: 600, color: '#FFFFFF' }}>
                        Dicas de segurança
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#A3A3A3', marginTop: 2 }}>
                        Cuide da sua segurança.
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={18} color="#737373" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsFamilyFlowOpen(true)}
                  style={{
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    padding: '14px 0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 14,
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
                    <Users size={22} color="#E5E5E5" style={{ flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '0.96rem', fontWeight: 600, color: '#FFFFFF' }}>
                        Segurança para adolescentes
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#A3A3A3', marginTop: 2, lineHeight: 1.35 }}>
                        Crie um Perfil Familiar para que os adolescentes possam usar ferramentas de segurança integradas e muito mais.
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={18} color="#737373" style={{ flexShrink: 0 }} />
                </button>

                <button
                  type="button"
                  onClick={() => setIsGuideOpen(true)}
                  style={{
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    padding: '14px 0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 14,
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
                    <ShieldAlert size={22} color="#E5E5E5" style={{ flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '0.96rem', fontWeight: 600, color: '#FFFFFF' }}>
                        Segurança na {config?.companyName || 'Kavro Drive'}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#A3A3A3', marginTop: 2, lineHeight: 1.35 }}>
                        Saiba como priorizamos a sua segurança.
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={18} color="#737373" style={{ flexShrink: 0 }} />
                </button>

                {activeRide?.status === 'em_andamento' && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSos?.();
                    }}
                    style={{
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      padding: '14px 0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 14,
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <PhoneCall size={21} color="#F87171" />
                      <div>
                        <div style={{ fontSize: '0.96rem', fontWeight: 600, color: '#FFFFFF' }}>
                          Emergência SOS (190 / 192 / Central)
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#A3A3A3', marginTop: 2 }}>
                          Acionar socorro imediato com transmissão GPS ao vivo.
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={18} color="#737373" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 2. VERIFICAÇÃO COM K-CÓDIGO (Screenshot 2) */}
          {view === 'pin' && (
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
              <h2
                style={{
                  margin: '4px 0 14px 0',
                  fontSize: '1.85rem',
                  fontWeight: 800,
                  lineHeight: 1.15,
                  letterSpacing: '-0.025em'
                }}
              >
                Verificação com K-Código
              </h2>
              <p style={{ margin: '0 0 14px 0', fontSize: '0.92rem', color: '#D4D4D4', lineHeight: 1.48 }}>
                Você ou seu motorista podem exigir um K-Código. Antes de você entrar no carro, o
                motorista parceiro precisará digitar seu K-Código no app para iniciar a viagem.
              </p>

              <button
                type="button"
                onClick={() => setShowLearnMore((p) => !p)}
                style={{
                  alignSelf: 'flex-start',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: '#FFFFFF',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  marginBottom: 22
                }}
              >
                Saiba mais
              </button>

              {showLearnMore && (
                <div
                  style={{
                    backgroundColor: '#1E1E1E',
                    border: '1px solid #2E2E2E',
                    borderRadius: 12,
                    padding: '12px 14px',
                    fontSize: '0.82rem',
                    color: '#D4D4D4',
                    lineHeight: 1.45,
                    marginBottom: 18
                  }}
                >
                  Enquanto esta opção estiver ligada, seu K-Código de 4 dígitos será exigido do
                  motorista antes de iniciar qualquer viagem. Ele garante que você está embarcando
                  no veículo correto cadastrado.
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                  padding: '16px 0',
                  borderTop: '1px solid #262626',
                  borderBottom: '1px solid #262626'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
                  <Grid3x3 size={21} color="#E5E5E5" style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '0.96rem', fontWeight: 600, color: '#FFFFFF', lineHeight: 1.3 }}>
                      Confirmação de viagens com K-Código
                    </div>
                    {prefs.familySafetyEnabled && (
                      <div style={{ fontSize: '0.73rem', color: '#60A5FA', marginTop: 2 }}>
                        Ativado obrigatoriamente pelo Perfil Familiar
                      </div>
                    )}
                  </div>
                </div>
                <DarkSwitch
                  checked={prefs.boardingPinEnabled}
                  disabled={prefs.familySafetyEnabled}
                  ariaLabel="Confirmação de viagens com K-Código"
                  onToggle={() => {
                    const nextVal = !prefs.boardingPinEnabled;
                    const nextPrefs = { ...prefs, boardingPinEnabled: nextVal };
                    persistSafetyPreferences(
                      nextPrefs,
                      emergencyContacts,
                      nextVal ? 'K-Código ativado para suas viagens.' : 'K-Código desativado.'
                    );
                  }}
                />
              </div>

              <div style={{ marginTop: 24, opacity: prefs.boardingPinEnabled ? 1 : 0.45 }}>
                <div style={{ fontSize: '0.98rem', fontWeight: 700, color: '#E5E5E5', marginBottom: 12 }}>
                  Seu K-Código
                </div>

                <div
                  style={{
                    backgroundColor: '#102A54',
                    borderRadius: 16,
                    padding: '22px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12
                  }}
                >
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    {isEditingPin ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                        <input
                          type="tel"
                          inputMode="numeric"
                          maxLength={4}
                          value={pinDraft}
                          onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          autoFocus
                          style={{
                            width: 150,
                            height: 46,
                            borderRadius: 10,
                            border: '2px solid #60A5FA',
                            backgroundColor: '#0A1935',
                            color: '#FFFFFF',
                            textAlign: 'center',
                            fontSize: '1.65rem',
                            fontWeight: 800,
                            letterSpacing: '0.28em',
                            outline: 'none'
                          }}
                        />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            onClick={() =>
                              setPinDraft(String(Math.floor(1000 + Math.random() * 9000)))
                            }
                            style={{
                              backgroundColor: '#1E3A8A',
                              color: '#DBEAFE',
                              border: 'none',
                              borderRadius: 999,
                              padding: '6px 12px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                          >
                            <RefreshCw size={12} />
                            Aleatório
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!/^\d{4}$/.test(pinDraft)) {
                                setErrorMsg('Digite exatamente 4 números para seu K-Código.');
                                return;
                              }
                              const ok = await persistSafetyPreferences(
                                { ...prefs, boardingPinEnabled: true, customBoardingPin: pinDraft },
                                emergencyContacts,
                                `Seu K-Código foi alterado para ${pinDraft}!`
                              );
                              if (ok) setIsEditingPin(false);
                            }}
                            style={{
                              backgroundColor: '#FFFFFF',
                              color: '#111111',
                              border: 'none',
                              borderRadius: 999,
                              padding: '6px 14px',
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                          >
                            Aplicar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span
                        style={{
                          fontSize: '2.05rem',
                          fontWeight: 700,
                          letterSpacing: '0.18em',
                          color: '#FFFFFF',
                          fontVariantNumeric: 'tabular-nums'
                        }}
                      >
                        {spacedPinDigits}
                      </span>
                    )}
                  </div>

                  {!isEditingPin && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!ensureAuthenticated()) return;
                        setPinDraft(prefs.customBoardingPin || '9130');
                        setIsEditingPin(true);
                      }}
                      style={{
                        backgroundColor: '#163D7A',
                        color: '#E0F2FE',
                        border: 'none',
                        borderRadius: 999,
                        padding: '8px 16px',
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        flexShrink: 0
                      }}
                    >
                      Alterar
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 3. K-ÁUDIO (GRAVAÇÃO DE ÁUDIO DA VIAGEM) */}
          {view === 'audio' && (
            <div>
              <h2
                style={{
                  margin: '4px 0 12px 0',
                  fontSize: '1.85rem',
                  fontWeight: 800,
                  letterSpacing: '-0.025em'
                }}
              >
                K-Áudio
              </h2>
              <p style={{ margin: '0 0 14px 0', fontSize: '0.9rem', color: '#D4D4D4', lineHeight: 1.48 }}>
                Grave o áudio da sua viagem diretamente pelo microfone do aparelho. Os clipes ficam
                salvos localmente no navegador e só são enviados à Central se você decidir reportar.
              </p>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                  padding: '15px 0',
                  borderTop: '1px solid #262626',
                  borderBottom: '1px solid #262626'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                  <Mic size={20} color="#E5E5E5" />
                  <div>
                    <div style={{ fontSize: '0.94rem', fontWeight: 600 }}>
                      Ativar K-Áudio nas viagens
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#A3A3A3', marginTop: 2 }}>
                      Habilita o botão de gravação durante o trajeto
                    </div>
                  </div>
                </div>
                <DarkSwitch
                  checked={prefs.audioRecordingEnabled}
                  ariaLabel="Ativar K-Áudio nas viagens"
                  onToggle={() =>
                    persistSafetyPreferences(
                      { ...prefs, audioRecordingEnabled: !prefs.audioRecordingEnabled },
                      emergencyContacts,
                      !prefs.audioRecordingEnabled ? 'K-Áudio ativado!' : 'K-Áudio desativado.'
                    )
                  }
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                  padding: '15px 0',
                  borderBottom: '1px solid #262626'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                  <BellRing size={20} color="#E5E5E5" />
                  <div>
                    <div style={{ fontSize: '0.94rem', fontWeight: 600 }}>
                      Sugerir gravação ao embarcar
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#A3A3A3', marginTop: 2 }}>
                      Solicita início rápido ao entrar no veículo
                    </div>
                  </div>
                </div>
                <DarkSwitch
                  checked={prefs.audioAutoRecord}
                  disabled={!prefs.audioRecordingEnabled}
                  ariaLabel="Sugerir gravação automática"
                  onToggle={() =>
                    persistSafetyPreferences({
                      ...prefs,
                      audioAutoRecord: !prefs.audioAutoRecord
                    })
                  }
                />
              </div>

              {/* Gravador real */}
              <div
                style={{
                  marginTop: 18,
                  backgroundColor: '#1E1E1E',
                  border: '1px solid #2D2D2D',
                  borderRadius: 16,
                  padding: '16px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: '0.94rem', fontWeight: 800 }}>Gravador de segurança</div>
                    <div style={{ fontSize: '0.76rem', color: isRecording ? '#FCA5A5' : '#A3A3A3', marginTop: 2 }}>
                      {isRecording
                        ? `Gravando ao vivo • ${formatDuration(recordingSec)}`
                        : isAudioCaptureSupported()
                          ? 'Microfone pronto para gravar agora'
                          : 'Captura de áudio indisponível neste navegador'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleStartRecording}
                    disabled={!isAudioCaptureSupported()}
                    style={{
                      backgroundColor: isRecording ? '#DC2626' : '#FFFFFF',
                      color: isRecording ? '#FFFFFF' : '#111111',
                      border: 'none',
                      borderRadius: 999,
                      padding: '9px 16px',
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      cursor: isAudioCaptureSupported() ? 'pointer' : 'not-allowed',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7
                    }}
                  >
                    {isRecording ? <Square size={14} fill="#FFFFFF" /> : <Mic size={15} />}
                    <span>{isRecording ? 'Parar' : 'Gravar áudio'}</span>
                  </button>
                </div>

                {audioClips.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                    {audioClips.map((clip) => (
                      <div
                        key={clip.id}
                        style={{
                          backgroundColor: '#141414',
                          border: '1px solid #2A2A2A',
                          borderRadius: 12,
                          padding: '10px 12px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#E5E5E5' }}>
                            {clip.rideCode ? `${clip.rideCode} • ` : ''}
                            {new Date(clip.createdAt).toLocaleString('pt-BR')} •{' '}
                            {formatDuration(clip.durationSec)}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {audioUrls[clip.id] && (
                              <a
                                href={audioUrls[clip.id]}
                                download={`${clip.id}.webm`}
                                style={{ color: '#93C5FD', display: 'inline-flex' }}
                                title="Baixar gravação"
                              >
                                <Download size={15} />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={async () => {
                                await deleteSafetyAudioClip(clip.id);
                                setAudioClips((prev) => prev.filter((c) => c.id !== clip.id));
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#F87171',
                                cursor: 'pointer',
                                padding: 0
                              }}
                              title="Excluir áudio"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>

                        {audioUrls[clip.id] && (
                          <audio
                            controls
                            src={audioUrls[clip.id]}
                            style={{ width: '100%', height: 34 }}
                          />
                        )}

                        {activeRide?.id && (
                          <button
                            type="button"
                            disabled={clip.reportedToSos || isSaving}
                            onClick={() => handleSendClipToCentral(clip)}
                            style={{
                              marginTop: 8,
                              width: '100%',
                              padding: '7px 10px',
                              borderRadius: 8,
                              border: 'none',
                              backgroundColor: clip.reportedToSos ? '#14532D' : '#1E3A8A',
                              color: '#FFFFFF',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: clip.reportedToSos ? 'default' : 'pointer'
                            }}
                          >
                            {clip.reportedToSos
                              ? 'Anexado à Central SOS da corrida'
                              : 'Anexar à corrida / Central SOS'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. CONTATOS DE EMERGÊNCIA (Screenshot 3) */}
          {view === 'emergency' && (
            <div>
              <h2
                style={{
                  margin: '4px 0 12px 0',
                  fontSize: '1.85rem',
                  fontWeight: 800,
                  lineHeight: 1.15,
                  letterSpacing: '-0.025em'
                }}
              >
                Contatos de emergência
              </h2>
              <p style={{ margin: '0 0 14px 0', fontSize: '0.9rem', color: '#D4D4D4', lineHeight: 1.48 }}>
                Selecione as pessoas que você quer avisar em caso de emergência.
              </p>

              <button
                type="button"
                onClick={() => setShowLearnMore((p) => !p)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: '#FFFFFF',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  textDecoration: 'underline',
                  cursor: 'pointer'
                }}
              >
                Saiba mais
              </button>

              {showLearnMore && (
                <div
                  style={{
                    marginTop: 14,
                    backgroundColor: '#1E1E1E',
                    border: '1px solid #2D2D2D',
                    borderRadius: 12,
                    padding: '12px 14px',
                    fontSize: '0.82rem',
                    color: '#D4D4D4',
                    lineHeight: 1.45
                  }}
                >
                  Ao acionar o botão SOS ou em caso de alerta de parada longa/desvio sem resposta,
                  enviamos automaticamente o link de rastreamento ao vivo para seus contatos de
                  emergência e liberamos ligação rápida no modal SOS.
                </div>
              )}

              {emergencyContacts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '90px 18px 40px 18px' }}>
                  <ContactEmptyBadgeIcon />
                  <div style={{ fontSize: '1.08rem', fontWeight: 700, color: '#FFFFFF', lineHeight: 1.3 }}>
                    Você ainda não tem nenhum contato de emergência
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
                  {emergencyContacts.map((ec) => {
                    const waDigits = getCleanWhatsappNumber(ec.phone);
                    return (
                      <div
                        key={ec.id}
                        style={{
                          backgroundColor: '#1E1E1E',
                          border: '1px solid #2D2D2D',
                          borderRadius: 14,
                          padding: '12px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: '50%',
                              backgroundColor: '#2563EB',
                              color: '#FFFFFF',
                              fontWeight: 800,
                              fontSize: '0.82rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            {getInitials(ec.name)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#FFFFFF' }}>
                              {ec.name}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#A3A3A3' }}>
                              {formatPhone(ec.phone)} • {ec.relationship || 'Emergência'}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <a
                            href={`tel:${waDigits}`}
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: '50%',
                              backgroundColor: '#262626',
                              color: '#93C5FD',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            title="Ligar"
                          >
                            <Phone size={15} />
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              const nextList = emergencyContacts.filter((item) => item.id !== ec.id);
                              persistSafetyPreferences(prefs, nextList, 'Contato removido.');
                            }}
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: '50%',
                              border: 'none',
                              backgroundColor: '#262626',
                              color: '#F87171',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer'
                            }}
                            title="Remover contato"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 5. K-ACOMPANHA / COMPARTILHAR O LOCAL DA VIAGEM (Screenshot 5) */}
          {view === 'share' && (
            <div>
              <h2
                style={{
                  margin: '4px 0 12px 0',
                  fontSize: '1.85rem',
                  fontWeight: 800,
                  lineHeight: 1.15,
                  letterSpacing: '-0.025em'
                }}
              >
                Compartilhar o local da viagem
              </h2>
              <p style={{ margin: '0 0 14px 0', fontSize: '0.9rem', color: '#D4D4D4', lineHeight: 1.48 }}>
                Você pode compartilhar automaticamente as informações e a localização da viagem em
                andamento com pessoas de sua confiança.
              </p>

              <button
                type="button"
                onClick={() => setShowLearnMore((p) => !p)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: '#FFFFFF',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  textDecoration: 'underline',
                  cursor: 'pointer'
                }}
              >
                Saiba mais
              </button>

              {showLearnMore && (
                <div
                  style={{
                    marginTop: 14,
                    backgroundColor: '#1E1E1E',
                    border: '1px solid #2D2D2D',
                    borderRadius: 12,
                    padding: '12px 14px',
                    fontSize: '0.82rem',
                    color: '#D4D4D4',
                    lineHeight: 1.45
                  }}
                >
                  Sempre que sua corrida iniciar, nossa API gera e envia automaticamente um link
                  exclusivo com motorista, placa Mercosul, previsão de chegada e mapa GPS ao vivo.
                </div>
              )}

              {trustedContacts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '84px 18px 40px 18px' }}>
                  <ContactEmptyBadgeIcon />
                  <div style={{ fontSize: '1.08rem', fontWeight: 700, color: '#FFFFFF', lineHeight: 1.3 }}>
                    Você ainda não está compartilhando com nenhum contato
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
                  {trustedContacts.map((tc) => (
                    <div
                      key={tc.id}
                      style={{
                        backgroundColor: '#1E1E1E',
                        border: '1px solid #2D2D2D',
                        borderRadius: 14,
                        padding: '12px 14px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div>
                          <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#FFFFFF' }}>
                            {tc.name} • {tc.relationship}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#A3A3A3' }}>
                            {formatPhone(tc.phone)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const nextList = trustedContacts.filter((item) => item.id !== tc.id);
                            persistTrustedContacts(nextList, 'Contato removido do K-Acompanha.');
                          }}
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: '50%',
                            border: 'none',
                            backgroundColor: '#262626',
                            color: '#F87171',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                        {[
                          { label: 'Todas as viagens', all: true, night: false },
                          { label: 'Só à noite (20h–06h)', all: false, night: true },
                          { label: 'Somente SOS/Alerta', all: false, night: false }
                        ].map((mode) => {
                          const isAct =
                            tc.autoShareAllRides === mode.all &&
                            tc.autoShareNightOnly === mode.night;
                          return (
                            <button
                              key={mode.label}
                              type="button"
                              onClick={() => {
                                const updated = trustedContacts.map((item) =>
                                  item.id === tc.id
                                    ? {
                                        ...item,
                                        autoShareAllRides: mode.all,
                                        autoShareNightOnly: mode.night
                                      }
                                    : item
                                );
                                persistTrustedContacts(updated);
                              }}
                              style={{
                                borderRadius: 999,
                                padding: '5px 10px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                border: isAct ? '1px solid #3B82F6' : '1px solid #333333',
                                backgroundColor: isAct ? '#153057' : '#262626',
                                color: isAct ? '#93C5FD' : '#D4D4D4',
                                cursor: 'pointer'
                              }}
                            >
                              {mode.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {activeRide?.id && (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={handleShareRideNow}
                      style={{
                        marginTop: 6,
                        width: '100%',
                        padding: '11px 14px',
                        borderRadius: 12,
                        border: 'none',
                        backgroundColor: '#16A34A',
                        color: '#FFFFFF',
                        fontSize: '0.86rem',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      Enviar link ao vivo agora pela API
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 6. ADICIONAR CONTATO (Screenshots 4 e 6) */}
          {view === 'add_contact' && (
            <div>
              {/* Campo Pesquisar */}
              <div
                style={{
                  backgroundColor: '#262626',
                  borderRadius: 999,
                  height: 44,
                  padding: '0 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 14
                }}
              >
                <Search size={18} color="#A3A3A3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pesquisar nome ou número"
                  style={{
                    flex: 1,
                    background: 'none',
                    border: 'none',
                    color: '#FFFFFF',
                    fontSize: '0.92rem',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Ação Adicionar novo contato */}
              <button
                type="button"
                onClick={() => setShowNewContactForm((prev) => !prev)}
                style={{
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid #262626',
                  padding: '13px 4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  color: '#FFFFFF',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <UserPlus size={20} color="#E5E5E5" />
                <span>Adicionar novo contato</span>
              </button>

              {showNewContactForm && (
                <div
                  style={{
                    marginTop: 12,
                    marginBottom: 14,
                    backgroundColor: '#1E1E1E',
                    border: '1px solid #303030',
                    borderRadius: 14,
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10
                  }}
                >
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {RELATIONSHIPS.map((rel) => (
                      <button
                        key={rel}
                        type="button"
                        onClick={() => setNewRel(rel)}
                        style={{
                          borderRadius: 999,
                          padding: '5px 11px',
                          fontSize: '0.73rem',
                          fontWeight: 700,
                          border: newRel === rel ? '1px solid #FFFFFF' : '1px solid #3A3A3A',
                          backgroundColor: newRel === rel ? '#FFFFFF' : '#262626',
                          color: newRel === rel ? '#111111' : '#D4D4D4',
                          cursor: 'pointer'
                        }}
                      >
                        {rel}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nome completo (ex: Maria Silva)"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      height: 44,
                      borderRadius: 10,
                      border: '1px solid #3A3A3A',
                      backgroundColor: '#141414',
                      color: '#FFFFFF',
                      padding: '0 12px',
                      fontSize: '0.88rem',
                      outline: 'none'
                    }}
                  />
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={newPhone}
                    onChange={(e) => setNewPhone(formatPhone(e.target.value))}
                    placeholder="WhatsApp / Telefone com DDD"
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      height: 44,
                      borderRadius: 10,
                      border: '1px solid #3A3A3A',
                      backgroundColor: '#141414',
                      color: '#FFFFFF',
                      padding: '0 12px',
                      fontSize: '0.88rem',
                      outline: 'none'
                    }}
                  />

                  {addTarget === 'share' && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {[
                        { id: 'all' as const, label: 'Todas as corridas' },
                        { id: 'night' as const, label: 'Só à noite (20h–06h)' },
                        { id: 'sos' as const, label: 'Somente alertas/SOS' }
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setNewAutoShareMode(m.id)}
                          style={{
                            borderRadius: 999,
                            padding: '5px 10px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            border: 'none',
                            backgroundColor: newAutoShareMode === m.id ? '#2563EB' : '#262626',
                            color: '#FFFFFF',
                            cursor: 'pointer'
                          }}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={handleAddNewPoolContact}
                      style={{
                        flex: 1,
                        height: 42,
                        borderRadius: 10,
                        border: 'none',
                        backgroundColor: '#FFFFFF',
                        color: '#111111',
                        fontSize: '0.85rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      <Plus size={15} />
                      <span>Adicionar à lista</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleImportDeviceContacts}
                      style={{
                        height: 42,
                        borderRadius: 10,
                        border: '1px solid #3A3A3A',
                        backgroundColor: '#262626',
                        color: '#FFFFFF',
                        padding: '0 12px',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Agenda
                    </button>
                  </div>
                </div>
              )}

              <div
                style={{
                  marginTop: 18,
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#FFFFFF' }}>
                  Contatos do telefone
                </span>
                <button
                  type="button"
                  onClick={handleImportDeviceContacts}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#60A5FA',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Importar da agenda
                </button>
              </div>

              {filteredPool.length === 0 ? (
                <div
                  style={{
                    padding: '26px 12px',
                    textAlign: 'center',
                    color: '#A3A3A3',
                    fontSize: '0.84rem'
                  }}
                >
                  Nenhum contato salvo ainda. Toque em <strong>Adicionar novo contato</strong>{' '}
                  acima ou importe da agenda do aparelho.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {filteredPool.map((c) => {
                    const isSelected = selectedIds.includes(c.id);
                    return (
                      <div
                        key={c.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (isModifyMode) return;
                          setSelectedIds((prev) =>
                            prev.includes(c.id)
                              ? prev.filter((id) => id !== c.id)
                              : prev.length < 5
                                ? [...prev, c.id]
                                : prev
                          );
                        }}
                        onKeyDown={(e) => {
                          if ((e.key === 'Enter' || e.key === ' ') && !isModifyMode) {
                            e.preventDefault();
                            setSelectedIds((prev) =>
                              prev.includes(c.id)
                                ? prev.filter((id) => id !== c.id)
                                : prev.length < 5
                                  ? [...prev, c.id]
                                  : prev
                            );
                          }
                        }}
                        style={{
                          padding: '12px 4px',
                          borderBottom: '1px solid #222222',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
                          <div
                            style={{
                              width: 42,
                              height: 42,
                              borderRadius: '50%',
                              backgroundColor: '#2A2A2C',
                              color: '#FFFFFF',
                              fontSize: '0.85rem',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            {getInitials(c.name)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#FFFFFF' }}>
                              {c.name}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#A3A3A3' }}>
                              +55 {c.phone}
                            </div>
                          </div>
                        </div>

                        {isModifyMode ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedIds((prev) => prev.filter((id) => id !== c.id));
                              setExtraPoolContacts((prev) => prev.filter((item) => item.id !== c.id));
                            }}
                            style={{
                              backgroundColor: 'rgba(239, 68, 68, 0.2)',
                              border: 'none',
                              color: '#FCA5A5',
                              borderRadius: 999,
                              padding: '5px 10px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            Remover
                          </button>
                        ) : (
                          <span
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              border: isSelected ? '2px solid #FFFFFF' : '2px solid #737373',
                              backgroundColor: isSelected ? '#FFFFFF' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            {isSelected && <Check size={14} color="#111111" strokeWidth={3} />}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 7. K-AJUDA / RIDECHECK (Screenshot 7) */}
          {view === 'ridecheck' && (
            <div>
              <h2
                style={{
                  margin: '4px 0 14px 0',
                  fontSize: '1.85rem',
                  fontWeight: 800,
                  letterSpacing: '-0.025em'
                }}
              >
                K-Ajuda
              </h2>
              <p style={{ margin: '0 0 16px 0', fontSize: '0.92rem', color: '#D4D4D4', lineHeight: 1.5 }}>
                Se detectarmos que sua viagem sai do trajeto, para de forma inesperada ou termina
                antes do programado, vamos enviar uma mensagem para saber se você está bem.
              </p>

              <button
                type="button"
                onClick={() => setShowLearnMore((p) => !p)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: '#FFFFFF',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  marginBottom: 24
                }}
              >
                Saiba mais
              </button>

              {showLearnMore && (
                <div
                  style={{
                    backgroundColor: '#1E1E1E',
                    border: '1px solid #2D2D2D',
                    borderRadius: 12,
                    padding: '12px 14px',
                    fontSize: '0.82rem',
                    color: '#D4D4D4',
                    lineHeight: 1.45,
                    marginBottom: 18
                  }}
                >
                  O monitoramento analisa desvios acima de 3 km ou paradas longas fora do curso e
                  exibe confirmação imediata na tela. Sem resposta em 60 segundos, o chamado escala
                  para a Central SOS e seus contatos cadastrados.
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                  padding: '18px 0',
                  borderTop: '1px solid #262626',
                  borderBottom: '1px solid #262626'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <CarFront size={22} color="#E5E5E5" />
                  <span style={{ fontSize: '0.98rem', fontWeight: 600 }}>Receber mensagens</span>
                </div>
                <DarkSwitch
                  checked={prefs.rideCheckEnabled}
                  ariaLabel="Receber mensagens K-Ajuda"
                  onToggle={() => {
                    const nextVal = !prefs.rideCheckEnabled;
                    persistSafetyPreferences(
                      { ...prefs, rideCheckEnabled: nextVal },
                      emergencyContacts,
                      nextVal
                        ? 'K-Ajuda ativado para todas as viagens.'
                        : 'K-Ajuda pausado nas suas corridas.'
                    );
                  }}
                />
              </div>
            </div>
          )}

          {/* 8. DICAS DE SEGURANÇA */}
          {view === 'tips' && (
            <div>
              <h2 style={{ margin: '4px 0 12px 0', fontSize: '1.75rem', fontWeight: 800 }}>
                Dicas de segurança
              </h2>
              <p style={{ margin: '0 0 18px 0', fontSize: '0.88rem', color: '#A3A3A3', lineHeight: 1.45 }}>
                Boas práticas rápidas antes e durante qualquer corrida Kavro Drive:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  {
                    title: '1. Confira placa Mercosul, veículo e motorista',
                    desc: 'Antes de abrir a porta, compare o modelo/cor do carro, placa Mercosul e foto do motorista exibidos no app.'
                  },
                  {
                    title: '2. Confirme seu K-Código (PIN de embarque)',
                    desc: 'O motorista precisa digitar seu código de 4 dígitos no aplicativo dele para destravar o início da viagem.'
                  },
                  {
                    title: '3. Use o K-Acompanha com familiares',
                    desc: 'Ative o envio automático para que sua família acompanhe o mapa em tempo real direto no WhatsApp.'
                  },
                  {
                    title: '4. Botão SOS e 190 sempre acessíveis',
                    desc: 'Durante o trajeto, use o botão SOS para ligar para a Polícia (190) e alertar a Central Kavro com GPS ativo.'
                  }
                ].map((tip) => (
                  <div
                    key={tip.title}
                    style={{
                      backgroundColor: '#1E1E1E',
                      border: '1px solid #2D2D2D',
                      borderRadius: 14,
                      padding: '13px 14px'
                    }}
                  >
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#FFFFFF' }}>
                      {tip.title}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#A3A3A3', marginTop: 4, lineHeight: 1.4 }}>
                      {tip.desc}
                    </div>
                  </div>
                ))}

                {onOpenTerms && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenTerms();
                    }}
                    style={{
                      marginTop: 6,
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: '1px solid #303030',
                      backgroundColor: '#1E1E1E',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.86rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <FileText size={16} />
                      Privacidade, Termos e LGPD
                    </span>
                    <ChevronRight size={16} color="#737373" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* BOTÃO DE RODAPÉ FIXO BRANCO ESTILO UBER */}
        {(view === 'pin' ||
          view === 'emergency' ||
          view === 'share' ||
          view === 'add_contact' ||
          view === 'ridecheck' ||
          view === 'audio') && (
          <div
            style={{
              padding: '12px 18px calc(18px + env(safe-area-inset-bottom, 0px)) 18px',
              backgroundColor: '#141414',
              borderTop: '1px solid #222222',
              flexShrink: 0
            }}
          >
            {view === 'pin' && (
              <button
                type="button"
                disabled={isSaving}
                onClick={async () => {
                  if (isEditingPin && /^\d{4}$/.test(pinDraft)) {
                    await persistSafetyPreferences({
                      ...prefs,
                      boardingPinEnabled: true,
                      customBoardingPin: pinDraft
                    });
                  }
                  setView('hub');
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
                OK
              </button>
            )}

            {(view === 'emergency' || view === 'share') && (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => openAddContactScreen(view === 'emergency' ? 'emergency' : 'share')}
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
                Adicionar contato
              </button>
            )}

            {view === 'add_contact' && (
              <button
                type="button"
                disabled={isSaving}
                onClick={handleConfirmSelectedContacts}
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
                {isSaving ? 'Salvando...' : 'Confirmar'}
              </button>
            )}

            {(view === 'ridecheck' || view === 'audio') && (
              <button
                type="button"
                onClick={() => setView('hub')}
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
                OK
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
      )}

      <KavroSecurityGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        config={config}
        currentUser={currentUser}
        onSelectFeature={(targetView) => {
          setIsGuideOpen(false);
          setShowLearnMore(false);
          setView(targetView);
        }}
        onOpenSos={() => {
          setIsGuideOpen(false);
          onClose();
          onOpenSos?.();
        }}
        onOpenTerms={() => {
          setIsGuideOpen(false);
          onClose();
          onOpenTerms?.();
        }}
      />

      <FamilyProfileFlowModal
        isOpen={isFamilyFlowOpen}
        onClose={() => setIsFamilyFlowOpen(false)}
        currentUser={currentUser}
        onRequireAuth={() => {
          setIsFamilyFlowOpen(false);
          onClose();
          onRequireAuth?.();
        }}
        onUserChange={onUserChange}
      />
    </>
  );
};
