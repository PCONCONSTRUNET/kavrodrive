import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, Phone, Mail, LogOut, 
  MapPin, Trash2, Home, Briefcase, Star,
  LogIn, UserPlus, Smartphone, Download,
  CheckCircle2, ShieldCheck, Car, Clock,
  Save, Check, Plus, CreditCard, ChevronRight,
  Headphones, Sparkles, Bell,
  Camera, Lock, Send, XCircle, HelpCircle, Users, Wallet
} from 'lucide-react';
import { ClientProfile, SystemConfig } from '../types';
import { StorageService } from '../services/storage';
import { compressDataUrlForUpload } from '../utils/imageCompression';
import { AuthModal } from '../components/AuthModal';
import { PassengerFeatureCarousel } from '../components/PassengerFeatureCarousel';
import { PushToggleButton } from '../components/PushNotifications';
import { WhatsAppIcon } from '../components/WhatsAppIcon';
import { TrustedContactsModal } from '../components/TrustedContactsModal';
import { FamilyProfileFlowModal } from '../components/FamilyProfileFlowModal';
import { NotificationsModal } from '../components/NotificationsModal';
import { TermsPrivacyModal } from '../components/TermsPrivacyModal';
import { PassengerTermsContractModal } from '../components/PassengerTermsContractModal';
import { PassengerWalletModal } from '../components/PassengerWalletModal';
import { clientExternalId } from '../services/push';
import { formatPhone, formatCPF, isValidCPF, getCleanWhatsappNumber } from '../utils/format';
import { searchAddressGeocode } from '../utils/geo';

interface ClientProfileScreenProps {
  onOpenAdminLogin?: () => void;
  currentUser?: ClientProfile | null;
  onUserChange?: (user: ClientProfile | null) => void;
}

export const ClientProfileScreen: React.FC<ClientProfileScreenProps> = ({
  currentUser: propUser,
  onUserChange
}) => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<ClientProfile | null>(
    propUser !== undefined ? propUser : StorageService.getCurrentUser()
  );
  const [config] = useState<SystemConfig>(StorageService.getConfig());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<'register' | 'login'>('register');
  const [isTrustedContactsOpen, setIsTrustedContactsOpen] = useState(false);
  const [isFamilyFlowOpen, setIsFamilyFlowOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number>(Number(currentUser?.walletBalance || 0));
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(() => {
    return StorageService.getNotifications().filter(n => !n.read).length;
  });

  useEffect(() => {
    const updateCount = () => {
      setUnreadNotifCount(StorageService.getNotifications().filter(n => !n.read).length);
    };
    window.addEventListener('up_notifications_updated', updateCount);
    window.addEventListener('up_database_synced', updateCount);
    window.addEventListener('up_push_received', updateCount);
    return () => {
      window.removeEventListener('up_notifications_updated', updateCount);
      window.removeEventListener('up_database_synced', updateCount);
      window.removeEventListener('up_push_received', updateCount);
    };
  }, []);

  // Formulário de edição (enviado ao Admin Master para aprovação)
  const [name, setName] = useState(currentUser?.name || '');
  const [phone, setPhone] = useState(currentUser?.phone ? formatPhone(currentUser.phone) : '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [document, setDocument] = useState(currentUser?.document ? formatCPF(currentUser.document) : '');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSubmittingProfileReq, setIsSubmittingProfileReq] = useState(false);
  const [profileReqError, setProfileReqError] = useState('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoFeedback, setPhotoFeedback] = useState('');
  const clientPhotoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!currentUser?.id) {
      setWalletBalance(0);
      return;
    }
    let active = true;
    const syncWallet = async () => {
      const w = await StorageService.fetchClientWallet(currentUser.id);
      if (active && w.ok && w.wallet) {
        setWalletBalance(w.wallet.balance);
      }
    };
    const onWalletEvent = (evt: Event) => {
      const detail = (evt as CustomEvent)?.detail;
      if (detail && typeof detail.balance === 'number') {
        setWalletBalance(detail.balance);
      }
    };
    setWalletBalance(Number(currentUser.walletBalance || 0));
    syncWallet();
    window.addEventListener('up_client_wallet_updated', onWalletEvent);
    return () => {
      active = false;
      window.removeEventListener('up_client_wallet_updated', onWalletEvent);
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    let active = true;
    const syncMe = async () => {
      const fresh = await StorageService.fetchClientProfile(currentUser.id);
      if (fresh && active) {
        setCurrentUser(fresh);
        if (onUserChange) onUserChange(fresh);
      }
    };
    syncMe();
    const t = setInterval(syncMe, 5000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) return;
    const pending = currentUser.profileChangeRequest?.status === 'pendente'
      ? currentUser.profileChangeRequest.requestedFields
      : null;
    setName(pending?.name || currentUser.name || '');
    setPhone(formatPhone(pending?.phone || currentUser.phone || ''));
    setEmail(pending?.email !== undefined ? pending.email : (currentUser.email || ''));
    setDocument(formatCPF(pending?.document !== undefined ? pending.document : (currentUser.document || '')));
  }, [
    currentUser?.id,
    currentUser?.name,
    currentUser?.phone,
    currentUser?.email,
    currentUser?.document,
    currentUser?.profileChangeRequest?.id,
    currentUser?.profileChangeRequest?.status
  ]);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isSignedContractOpen, setIsSignedContractOpen] = useState(false);

  // Sincroniza com propUser
  useEffect(() => {
    if (propUser !== undefined) {
      setCurrentUser(propUser);
      setName(propUser?.name || '');
      setPhone(propUser?.phone ? formatPhone(propUser.phone) : '');
      setEmail(propUser?.email || '');
      setDocument(propUser?.document ? formatCPF(propUser.document) : '');
    }
  }, [propUser]);

  // Contagem de viagens concluídas pelo cliente para badge e estatísticas VIP
  const completedRidesCount = useMemo(() => {
    if (!currentUser) return 0;
    try {
      const allRides = StorageService.getRides();
      const uPhoneClean = (currentUser.phone || '').replace(/\D/g, '');
      const clientRides = allRides.filter(r => 
        (currentUser.id && r.clientId === currentUser.id) ||
        (uPhoneClean && r.clientPhone && r.clientPhone.replace(/\D/g, '').includes(uPhoneClean.slice(-8))) ||
        (currentUser.name && r.clientName && r.clientName.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
      );
      return clientRides.filter(r => r.status === 'finalizada').length;
    } catch {
      return 0;
    }
  }, [currentUser]);

  // Detecta se houve alteração nos campos em relação aos dados salvos
  const hasChanges = useMemo(() => {
    if (!currentUser) return false;
    const currentName = currentUser.name || '';
    const currentPhone = formatPhone(currentUser.phone || '');
    const currentEmail = currentUser.email || '';
    const currentDoc = currentUser.document ? formatCPF(currentUser.document) : '';

    return (
      name.trim() !== currentName.trim() ||
      phone.trim() !== currentPhone.trim() ||
      email.trim() !== currentEmail.trim() ||
      document.trim() !== currentDoc.trim()
    );
  }, [currentUser, name, phone, email, document]);

  // Endereços salvos (Casa, Trabalho, Favoritos)
  const [newAddrLabel, setNewAddrLabel] = useState('');
  const [newAddrText, setNewAddrText] = useState('');
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);

  const handleAuthSuccess = (client: ClientProfile) => {
    setCurrentUser(client);
    setName(client.name);
    setPhone(client.phone ? formatPhone(client.phone) : '');
    setEmail(client.email || '');
    setDocument(client.document ? formatCPF(client.document) : '');
    if (onUserChange) onUserChange(client);
  };

  const handleClientPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentUser) return;
    setIsUploadingPhoto(true);
    setPhotoFeedback('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Falha ao ler imagem.'));
        reader.readAsDataURL(file);
      });
      const compressed = await compressDataUrlForUpload(dataUrl, 640, 0.82);
      const res = await StorageService.uploadClientPhoto(currentUser.id, compressed);
      if (res.ok && res.client) {
        setCurrentUser(res.client);
        if (onUserChange) onUserChange(res.client);
        setPhotoFeedback('Foto atualizada!');
        setTimeout(() => setPhotoFeedback(''), 3000);
      } else {
        setPhotoFeedback(res.error || 'Erro ao salvar foto.');
      }
    } catch {
      setPhotoFeedback('Imagem inválida.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setProfileReqError('');
    if (!isValidCPF(document)) {
      setProfileReqError('Informe um CPF válido com 11 dígitos.');
      return;
    }
    setIsSubmittingProfileReq(true);
    const res = await StorageService.requestClientProfileChange(currentUser.id, {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      document: document.trim()
    });
    setIsSubmittingProfileReq(false);
    if (!res.ok || !res.client) {
      setProfileReqError(res.error || 'Não foi possível enviar a solicitação.');
      return;
    }
    setCurrentUser(res.client);
    if (onUserChange) onUserChange(res.client);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3500);
  };

  const handleLogout = () => {
    if (window.confirm('Deseja realmente sair da sua conta neste aparelho?')) {
      StorageService.setCurrentUser(null);
      setCurrentUser(null);
      setName('');
      setPhone('');
      setEmail('');
      setDocument('');
      if (onUserChange) onUserChange(null);
    }
  };

  const handleAddSavedAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newAddrLabel.trim() || !newAddrText.trim()) return;

    setIsGeocoding(true);
    let lat = -28.3878;
    let lng = -49.3977;
    try {
      const geo = await searchAddressGeocode(newAddrText.trim());
      if (geo.length > 0) {
        lat = geo[0].lat;
        lng = geo[0].lng;
      }
    } catch {
      // fallback
    } finally {
      setIsGeocoding(false);
    }

    const list = currentUser.savedAddresses || [];
    const updatedList = [
      ...list,
      {
        id: `addr-${Date.now()}`,
        label: newAddrLabel.trim(),
        address: newAddrText.trim(),
        lat,
        lng,
      }
    ];

    const updatedUser = { ...currentUser, savedAddresses: updatedList };
    StorageService.setCurrentUser(updatedUser);
    StorageService.saveClient(updatedUser);
    setCurrentUser(updatedUser);
    if (onUserChange) onUserChange(updatedUser);
    setNewAddrLabel('');
    setNewAddrText('');
    setShowAddAddress(false);
  };

  const handleDeleteAddress = (id: string) => {
    if (!currentUser) return;
    const updatedList = (currentUser.savedAddresses || []).filter(a => a.id !== id);
    const updatedUser = { ...currentUser, savedAddresses: updatedList };
    StorageService.setCurrentUser(updatedUser);
    StorageService.saveClient(updatedUser);
    setCurrentUser(updatedUser);
    if (onUserChange) onUserChange(updatedUser);
  };

  const startAddPredefined = (label: string) => {
    setNewAddrLabel(label);
    setShowAddAddress(true);
  };

  const supportWhatsapp = getCleanWhatsappNumber(config.companyWhatsapp || config.companyPhone || '48996915303');
  const supportUrl = `https://wa.me/${supportWhatsapp}?text=${encodeURIComponent(`Olá! Sou o cliente ${currentUser?.name || ''} da Kavro Drive e gostaria de tirar uma dúvida.`)}`;

  return (
    <div className="animate-fade-in" style={{ padding: '16px 18px 95px 18px', maxWidth: 480, margin: '0 auto' }}>
      {/* Modal de Cadastro / Login */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
        initialMode={authInitialMode}
      />

      {/* Cabeçalho da Página */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#121A21', letterSpacing: '-0.02em', margin: 0 }}>
            Meu Perfil
          </h2>
          <p style={{ fontSize: '0.78rem', color: '#64748B', marginTop: 2 }}>
            Cadastro, endereços salvos e preferências
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Botão de Notificações */}
          <button
            type="button"
            onClick={() => setIsNotificationsOpen(true)}
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              backgroundColor: '#FFFFFF',
              border: '1.5px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#121A21',
              cursor: 'pointer',
              position: 'relative',
              flexShrink: 0,
              boxShadow: '0 2px 5px rgba(0,0,0,0.04)'
            }}
            title="Notificações e Avisos"
          >
            <Bell size={15} strokeWidth={2.4} />
            {unreadNotifCount > 0 && (
              <span style={{
                position: 'absolute',
                top: -3,
                right: -3,
                backgroundColor: '#EF4444',
                color: '#FFFFFF',
                fontSize: '0.58rem',
                fontWeight: 900,
                minWidth: 15,
                height: 15,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 3px',
                border: '1.5px solid #FFFFFF'
              }}>
                {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
              </span>
            )}
          </button>

          {currentUser && (
            <span style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              padding: '4px 9px',
              borderRadius: 20,
              backgroundColor: 'rgba(118, 216, 0, 0.14)',
              color: '#3B7300',
              border: '1px solid rgba(118, 216, 0, 0.35)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4
            }}>
              <Sparkles size={11} color="#4D9400" />
              <span>UP VIP</span>
            </span>
          )}
        </div>
      </div>

      {/* CASO NÃO ESTEJA LOGADO / CADASTRADO */}
      {!currentUser ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            padding: '24px 20px',
            background: 'linear-gradient(145deg, #ffffff 0%, #F8FAFC 100%)',
            border: '1.5px solid rgba(118, 216, 0, 0.4)',
            borderRadius: 20,
            boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
            textAlign: 'center'
          }}>
            <div style={{
              width: 58,
              height: 58,
              borderRadius: '50%',
              backgroundColor: 'rgba(118, 216, 0, 0.16)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px auto',
              color: '#4D9400'
            }}>
              <UserPlus size={28} />
            </div>

            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#121A21', marginBottom: 6 }}>
              Acesse seu Perfil Kavro Drive
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#64748B', marginBottom: 20, lineHeight: 1.4 }}>
              Cadastre-se para salvar seus locais favoritos, agendar corridas com 1 toque e receber recibos automáticos por e-mail.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => {
                  setAuthInitialMode('register');
                  setIsAuthModalOpen(true);
                }}
                className="btn-ios-primary"
                style={{ padding: '14px 20px', fontSize: '0.95rem' }}
              >
                <UserPlus size={18} />
                <span>Criar Conta em 1 Minuto</span>
              </button>

              <button
                onClick={() => {
                  setAuthInitialMode('login');
                  setIsAuthModalOpen(true);
                }}
                className="btn-ios-secondary"
                style={{ padding: '12px 20px', fontSize: '0.88rem' }}
              >
                <LogIn size={16} />
                <span>Já tenho conta — Entrar</span>
              </button>
            </div>
          </div>

          <PassengerFeatureCarousel
            config={config}
            currentUser={null}
            recentDestinations={StorageService.getRecentDestinations()}
            onUserChange={(updatedUser) => {
              setCurrentUser(updatedUser);
              if (onUserChange) onUserChange(updatedUser);
            }}
            onRequireAuth={() => {
              setAuthInitialMode('login');
              setIsAuthModalOpen(true);
            }}
          />
        </div>
      ) : (
        /* CASO ESTEJA CADASTRADO: PAINEL EXECUTIVO OTIMIZADO */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 1. Card de Identificação VIP do Cliente */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: 20,
            padding: '18px 18px 16px 18px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 4px 20px -2px rgba(18, 26, 33, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: 14
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                {/* Avatar com foto de perfil editável estilo Uber */}
                <input
                  ref={clientPhotoInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleClientPhotoChange}
                />
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  {currentUser.photo ? (
                    <img
                      src={currentUser.photo}
                      alt={currentUser.name}
                      style={{
                        width: 60,
                        height: 60,
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '2px solid #111111'
                      }}
                    />
                  ) : (
                    <div style={{
                      width: 60,
                      height: 60,
                      borderRadius: '50%',
                      background: '#111111',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.4rem',
                      fontWeight: 900,
                      border: '2px solid #E5E7EB'
                    }}>
                      {currentUser.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={isUploadingPhoto}
                    onClick={() => clientPhotoInputRef.current?.click()}
                    title="Adicionar ou trocar foto de perfil"
                    style={{
                      position: 'absolute',
                      bottom: -2,
                      right: -2,
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      backgroundColor: '#FFFFFF',
                      border: '1.5px solid #D1D5DB',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#111111',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.16)',
                      cursor: 'pointer'
                    }}
                  >
                    <Camera size={12} />
                  </button>
                </div>

                {/* Nome, telefone e badges */}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    fontSize: '1.08rem',
                    fontWeight: 800,
                    color: '#121A21',
                    lineHeight: 1.25,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {currentUser.name}
                  </div>

                  <div style={{
                    fontSize: '0.8rem',
                    color: '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    marginTop: 3,
                    fontWeight: 600
                  }}>
                    <WhatsAppIcon size={13} />
                    <span>{currentUser.phone}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      backgroundColor: '#DCFCE7',
                      color: '#15803D',
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      border: '1px solid #BBF7D0',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3
                    }}>
                      <ShieldCheck size={11} />
                      Cliente Verificado
                    </span>
                  </div>
                </div>
              </div>

              {/* Botão Sair da Conta (Clean e Discreto) */}
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 10,
                  padding: '7px 11px',
                  color: '#64748B',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s ease'
                }}
                title="Sair desta conta no aparelho"
              >
                <LogOut size={13} color="#EF4444" />
                <span>Sair</span>
              </button>
            </div>

            {/* Métricas Rápidas do Passageiro */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 8,
              paddingTop: 12,
              borderTop: '1px solid #F1F5F9'
            }}>
              <div style={{
                background: '#F8FAFC',
                borderRadius: 12,
                padding: '8px 10px',
                textAlign: 'center',
                border: '1px solid #F1F5F9'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, color: '#3B82F6', marginBottom: 2 }}>
                  <Car size={13} />
                  <span style={{ fontSize: '0.98rem', fontWeight: 900, color: '#121A21' }}>
                    {completedRidesCount}
                  </span>
                </div>
                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>
                  {completedRidesCount === 1 ? 'Viagem' : 'Viagens'}
                </div>
              </div>

              <div style={{
                background: '#F8FAFC',
                borderRadius: 12,
                padding: '8px 10px',
                textAlign: 'center',
                border: '1px solid #F1F5F9'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, color: '#10B981', marginBottom: 2 }}>
                  <Clock size={13} />
                  <span style={{ fontSize: '0.92rem', fontWeight: 900, color: '#121A21' }}>
                    100%
                  </span>
                </div>
                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>
                  Pontualidade
                </div>
              </div>

              <div style={{
                background: '#F8FAFC',
                borderRadius: 12,
                padding: '8px 10px',
                textAlign: 'center',
                border: '1px solid #F1F5F9'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, color: '#F59E0B', marginBottom: 2 }}>
                  <Star size={13} />
                  <span style={{ fontSize: '0.92rem', fontWeight: 900, color: '#121A21' }}>
                    5.0
                  </span>
                </div>
                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>
                  Passageiro VIP
                </div>
              </div>
            </div>
          </div>

          {/* Atalhos Rápidos Estilo Uber (Ajuda, Carteira, Segurança, Mensagens/Avisos) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10
          }}>
            <button
              type="button"
              onClick={() => navigate('/ajuda')}
              style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 16,
                padding: '13px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)'
              }}
            >
              <div style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                backgroundColor: '#F1F5F9',
                color: '#0F172A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <HelpCircle size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F172A' }}>Ajuda</div>
                <div style={{ fontSize: '0.67rem', color: '#64748B', fontWeight: 600 }}>Suporte &amp; FAQ</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setIsWalletOpen(true)}
              style={{
                background: 'linear-gradient(145deg, #0B1117 0%, #16222E 100%)',
                border: '1px solid #1E293B',
                borderRadius: 16,
                padding: '13px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: '0 6px 16px rgba(15, 23, 42, 0.14)'
              }}
            >
              <div style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                backgroundColor: 'rgba(118, 216, 0, 0.16)',
                border: '1px solid rgba(118, 216, 0, 0.35)',
                color: '#76D800',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Wallet size={18} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#FFFFFF' }}>Carteira</div>
                <div style={{ fontSize: '0.72rem', color: '#BEF264', fontWeight: 800 }}>
                  {walletBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setIsTrustedContactsOpen(true)}
              style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 16,
                padding: '13px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)'
              }}
            >
              <div style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                backgroundColor: '#EFF6FF',
                color: '#1D4ED8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <ShieldCheck size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F172A' }}>Segurança</div>
                <div style={{ fontSize: '0.67rem', color: '#64748B', fontWeight: 600 }}>Contatos &amp; SOS</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setIsNotificationsOpen(true)}
              style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 16,
                padding: '13px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
                textAlign: 'left',
                boxShadow: '0 2px 10px rgba(15, 23, 42, 0.04)'
              }}
            >
              <div style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                backgroundColor: '#F0FDF4',
                color: '#15803D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Bell size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F172A' }}>Mensagens</div>
                <div style={{ fontSize: '0.67rem', color: '#64748B', fontWeight: 600 }}>
                  {unreadNotifCount > 0 ? `${unreadNotifCount} novo(s)` : 'Avisos do app'}
                </div>
              </div>
            </button>
          </div>

          {/* Carrossel horizontal estilo Uber (Favoritos <-> Recursos de Segurança) dentro da área do cliente */}
          <PassengerFeatureCarousel
            config={config}
            currentUser={currentUser}
            recentDestinations={StorageService.getRecentDestinations()}
            onUserChange={(updatedUser) => {
              setCurrentUser(updatedUser);
              if (onUserChange) onUserChange(updatedUser);
            }}
            onRequireAuth={() => {
              setAuthInitialMode('login');
              setIsAuthModalOpen(true);
            }}
          />

          {/* 1.5 Segurança & Contatos de Confiança (visível logo no topo do Menu/Perfil para configurar antes da corrida) */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: 20,
            padding: '15px 18px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 4px 20px -2px rgba(18, 26, 33, 0.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  backgroundColor: '#EFF6FF',
                  color: '#276EF1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <ShieldCheck size={18} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '0.92rem', fontWeight: 900, color: '#0F172A' }}>
                    Contatos de Confiança
                  </div>
                  <div style={{ fontSize: '0.73rem', color: '#64748B', fontWeight: 600, marginTop: 1 }}>
                    {currentUser.trustedContacts && currentUser.trustedContacts.length > 0
                      ? `${currentUser.trustedContacts.length} contato(s) configurado(s) para envio automático`
                      : 'Configure quem recebe sua rota ao vivo antes da corrida'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsTrustedContactsOpen(true)}
                style={{
                  backgroundColor: '#111111',
                  border: 'none',
                  color: '#FFFFFF',
                  padding: '8px 14px',
                  borderRadius: 999,
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  flexShrink: 0
                }}
              >
                <Plus size={13} />
                <span>{currentUser.trustedContacts && currentUser.trustedContacts.length > 0 ? 'Gerenciar' : 'Configurar'}</span>
              </button>
            </div>

            {currentUser.trustedContacts && currentUser.trustedContacts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                {currentUser.trustedContacts.map((tc) => (
                  <div
                    key={tc.id}
                    onClick={() => setIsTrustedContactsOpen(true)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setIsTrustedContactsOpen(true);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 11px',
                      borderRadius: 12,
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #E5E7EB',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0F172A' }}>
                        {tc.name} • {tc.relationship || 'Familiar'}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>
                        {formatPhone(tc.phone)} • {tc.autoShareAllRides ? 'Automático em todas as corridas' : tc.autoShareNightOnly ? 'Automático à noite (20h-06h)' : 'Alertas SOS'}
                      </div>
                    </div>
                    <Check size={15} color="#16A34A" style={{ flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            )}

            {/* Atalho Perfil Familiar / Conta para Adolescentes (12-18 anos) */}
            <div style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid #F1F5F9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                <div style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  backgroundColor: '#F3E8FF',
                  color: '#7E22CE',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Users size={16} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0F172A' }}>
                    {currentUser.accountType === 'teen'
                      ? 'Conta Adolescente (Perfil Familiar)'
                      : 'Perfil Familiar (12 a 18 anos)'}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>
                    {currentUser.accountType === 'teen'
                      ? `Supervisionado por ${currentUser.safetyPreferences?.familyGuardianName || 'Responsável Legal'}`
                      : 'Convide adolescentes, acompanhe status e rastreie viagens'}
                  </div>
                </div>
              </div>

              {currentUser.accountType !== 'teen' && (
                <button
                  type="button"
                  onClick={() => setIsFamilyFlowOpen(true)}
                  style={{
                    backgroundColor: '#F1F5F9',
                    border: '1px solid #CBD5E1',
                    color: '#0F172A',
                    padding: '6px 12px',
                    borderRadius: 999,
                    fontSize: '0.73rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                >
                  Gerenciar
                </button>
              )}
            </div>
          </div>

          {/* 2. Formulário Otimizado de Dados Pessoais */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: 20,
            padding: '16px 18px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 4px 20px -2px rgba(18, 26, 33, 0.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  backgroundColor: '#111111',
                  color: '#FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <User size={15} />
                </div>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 900, color: '#111111' }}>
                    Dados do Cadastro
                  </div>
                  <div style={{ fontSize: '0.70rem', color: '#6B7280' }}>
                    Troca de nome, telefone ou e-mail requer aprovação do Admin Master
                  </div>
                </div>
              </div>

              {photoFeedback && (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#15803D' }}>
                  {photoFeedback}
                </span>
              )}
              {!photoFeedback && hasChanges && (
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  color: '#B45309',
                  backgroundColor: '#FEF3C7',
                  padding: '3px 8px',
                  borderRadius: 8,
                  border: '1px solid #FDE68A'
                }}>
                  Alterações não enviadas
                </span>
              )}
            </div>

            {currentUser.profileChangeRequest?.status === 'pendente' && (
              <div style={{
                padding: '10px 12px',
                borderRadius: 10,
                backgroundColor: '#FFFBEB',
                border: '1px solid #FDE68A',
                color: '#92400E',
                fontSize: '0.76rem',
                marginBottom: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800 }}>
                  <Clock size={14} />
                  <span>Solicitação em análise pelo Admin Master</span>
                </div>
                <div style={{ marginTop: 3 }}>
                  Seus dados atuais permanecem ativos até a aprovação.
                </div>
              </div>
            )}

            {currentUser.profileChangeRequest?.status === 'aprovado' && (
              <div style={{
                padding: '9px 12px',
                borderRadius: 10,
                backgroundColor: '#F0FDF4',
                border: '1px solid #BBF7D0',
                color: '#166534',
                fontSize: '0.75rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 12
              }}>
                <CheckCircle2 size={14} />
                <span>Sua última solicitação de alteração cadastral foi aprovada.</span>
              </div>
            )}

            {currentUser.profileChangeRequest?.status === 'recusado' && (
              <div style={{
                padding: '10px 12px',
                borderRadius: 10,
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#991B1B',
                fontSize: '0.76rem',
                marginBottom: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800 }}>
                  <XCircle size={14} />
                  <span>Alteração recusada pelo Admin Master</span>
                </div>
                <div style={{ marginTop: 3 }}>
                  {currentUser.profileChangeRequest.rejectionReason || 'A troca de dados não foi autorizada pela central.'}
                </div>
              </div>
            )}

            {profileReqError && (
              <div style={{
                padding: '8px 10px',
                borderRadius: 8,
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#DC2626',
                fontSize: '0.76rem',
                fontWeight: 700,
                marginBottom: 10
              }}>
                {profileReqError}
              </div>
            )}

            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Nome */}
              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Nome Completo
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px 9px 36px',
                      borderRadius: 12,
                      border: '1.5px solid #CBD5E1',
                      fontSize: '0.86rem',
                      color: '#121A21',
                      fontWeight: 600,
                      backgroundColor: '#F8FAFC'
                    }}
                    required
                  />
                </div>
              </div>

              {/* Linha com WhatsApp e CPF */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    WhatsApp / Celular
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Phone size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="tel"
                      value={phone}
                      inputMode="numeric"
                      onChange={(e) => setPhone(formatPhone(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '9px 10px 9px 34px',
                        borderRadius: 12,
                        border: '1.5px solid #CBD5E1',
                        fontSize: '0.84rem',
                        color: '#121A21',
                        fontWeight: 600,
                        backgroundColor: '#F8FAFC'
                      }}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    CPF *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <CreditCard size={15} color="#94A3B8" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      placeholder="000.000.000-00"
                      value={document}
                      inputMode="numeric"
                      maxLength={14}
                      onChange={(e) => setDocument(formatCPF(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '9px 10px 9px 33px',
                        borderRadius: 12,
                        border: '1.5px solid #CBD5E1',
                        fontSize: '0.84rem',
                        color: '#121A21',
                        fontWeight: 600,
                        backgroundColor: '#F8FAFC'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* E-mail para Recibos */}
              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  E-mail para Recibos <span style={{ color: '#94A3B8', fontWeight: 500 }}>(opcional)</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="exemplo@gmail.com"
                    style={{
                      width: '100%',
                      padding: '9px 12px 9px 36px',
                      borderRadius: 12,
                      border: '1.5px solid #CBD5E1',
                      fontSize: '0.86rem',
                      color: '#121A21',
                      fontWeight: 600,
                      backgroundColor: '#F8FAFC'
                    }}
                  />
                </div>
              </div>

              {/* Botão de Solicitação ao Admin Master */}
              <button
                type="submit"
                disabled={isSubmittingProfileReq || (!hasChanges && !savedSuccess)}
                style={{
                  height: 44,
                  borderRadius: 10,
                  marginTop: 4,
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  cursor: hasChanges && !isSubmittingProfileReq ? 'pointer' : 'default',
                  transition: 'all 0.2s ease',
                  border: savedSuccess ? '1px solid #86EFAC' : hasChanges ? 'none' : '1px solid #E5E7EB',
                  backgroundColor: savedSuccess
                    ? '#DCFCE7'
                    : hasChanges
                    ? '#111111'
                    : '#F3F4F6',
                  color: savedSuccess
                    ? '#15803D'
                    : hasChanges
                    ? '#FFFFFF'
                    : '#6B7280'
                }}
              >
                {savedSuccess ? (
                  <>
                    <Check size={16} color="#15803D" />
                    <span>Solicitação Enviada ao Admin Master!</span>
                  </>
                ) : isSubmittingProfileReq ? (
                  <span>Enviando solicitação...</span>
                ) : hasChanges ? (
                  <>
                    <Send size={15} />
                    <span>Solicitar Alteração ao Admin Master</span>
                  </>
                ) : (
                  <>
                    <Lock size={14} color="#9CA3AF" />
                    <span>Dados Protegidos (Sem Alterações)</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* 3. Card de Endereços Salvos / Favoritos */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: 20,
            padding: '16px 18px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 4px 20px -2px rgba(18, 26, 33, 0.05)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  backgroundColor: 'rgba(118, 216, 0, 0.16)',
                  color: '#4D9400',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <MapPin size={16} />
                </div>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#121A21' }}>
                    Endereços Salvos
                  </div>
                  <div style={{ fontSize: '0.70rem', color: '#64748B' }}>
                    Agilize seus agendamentos com 1 toque
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAddAddress(!showAddAddress)}
                style={{
                  background: showAddAddress ? '#F1F5F9' : 'rgba(118, 216, 0, 0.16)',
                  border: 'none',
                  color: showAddAddress ? '#475569' : '#3B7300',
                  padding: '6px 11px',
                  borderRadius: 9,
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                {showAddAddress ? 'Fechar' : (
                  <>
                    <Plus size={13} />
                    <span>Adicionar</span>
                  </>
                )}
              </button>
            </div>

            {/* Formulário de Adicionar Endereço */}
            {showAddAddress && (
              <form onSubmit={handleAddSavedAddress} style={{
                background: '#F8FAFC',
                padding: 13,
                borderRadius: 14,
                marginBottom: 12,
                border: '1.5px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                gap: 9
              }}>
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 5 }}>
                    Escolha um apelido rápido:
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['Casa', 'Trabalho', 'Aeroporto', 'Academia'].map((lbl) => (
                      <button
                        key={lbl}
                        type="button"
                        onClick={() => setNewAddrLabel(lbl)}
                        style={{
                          padding: '4px 9px',
                          borderRadius: 8,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: newAddrLabel === lbl ? '1.5px solid #76D800' : '1px solid #CBD5E1',
                          backgroundColor: newAddrLabel === lbl ? '#DCFCE7' : '#FFFFFF',
                          color: newAddrLabel === lbl ? '#15803D' : '#475569'
                        }}
                      >
                        {lbl === 'Casa' ? '🏠 Casa' : lbl === 'Trabalho' ? '💼 Trabalho' : lbl === 'Aeroporto' ? '✈️ Aeroporto' : '💪 Academia'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <input
                    type="text"
                    placeholder="Ou digite outro apelido (Ex: Casa de Praia)"
                    value={newAddrLabel}
                    onChange={(e) => setNewAddrLabel(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: '1px solid #CBD5E1',
                      fontSize: '0.82rem',
                      backgroundColor: '#FFFFFF'
                    }}
                    required
                  />
                </div>

                <div>
                  <input
                    type="text"
                    placeholder="Endereço completo (Rua, nº, bairro e cidade)"
                    value={newAddrText}
                    onChange={(e) => setNewAddrText(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: '1px solid #CBD5E1',
                      fontSize: '0.82rem',
                      backgroundColor: '#FFFFFF'
                    }}
                    required
                  />
                </div>

                <div style={{ display: 'flex', gap: 7, marginTop: 2 }}>
                  <button
                    type="submit"
                    disabled={isGeocoding}
                    className="btn-ios-primary"
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      fontSize: '0.80rem',
                      borderRadius: 10,
                      boxShadow: 'none'
                    }}
                  >
                    <Check size={14} />
                    <span>{isGeocoding ? 'Localizando...' : 'Salvar Local'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowAddAddress(false);
                      setNewAddrLabel('');
                      setNewAddrText('');
                    }}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: '1px solid #CBD5E1',
                      backgroundColor: '#FFFFFF',
                      color: '#475569',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}

            {/* Lista de Endereços Salvos ou Atalhos Rápidos */}
            {(!currentUser.savedAddresses || currentUser.savedAddresses.length === 0) ? (
              <div>
                <p style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: 10, lineHeight: 1.35 }}>
                  Você ainda não cadastrou locais salvos. Use os atalhos rápidos abaixo:
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => startAddPredefined('Casa')}
                    style={{
                      background: '#F8FAFC',
                      border: '1px dashed #CBD5E1',
                      borderRadius: 12,
                      padding: '10px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor: '#DCFCE7',
                      color: '#15803D',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Home size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#121A21' }}>+ Adicionar Casa</div>
                      <div style={{ fontSize: '0.67rem', color: '#64748B' }}>Sua residência</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => startAddPredefined('Trabalho')}
                    style={{
                      background: '#F8FAFC',
                      border: '1px dashed #CBD5E1',
                      borderRadius: 12,
                      padding: '10px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor: '#DBEAFE',
                      color: '#1E40AF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Briefcase size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#121A21' }}>+ Trabalho</div>
                      <div style={{ fontSize: '0.67rem', color: '#64748B' }}>Empresa / escritório</div>
                    </div>
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {currentUser.savedAddresses.map((addr) => {
                  const isHome = addr.label.toLowerCase().includes('casa') || addr.label.toLowerCase().includes('residencia');
                  const isWork = addr.label.toLowerCase().includes('trabalho') || addr.label.toLowerCase().includes('empresa') || addr.label.toLowerCase().includes('escritorio');

                  return (
                    <div
                      key={addr.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        backgroundColor: '#F8FAFC',
                        borderRadius: 12,
                        border: '1px solid #E2E8F0',
                        gap: 10
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                        <div style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          backgroundColor: isHome ? '#DCFCE7' : isWork ? '#DBEAFE' : 'rgba(118, 216, 0, 0.18)',
                          color: isHome ? '#15803D' : isWork ? '#1E40AF' : '#4D9400',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          {isHome ? <Home size={16} /> : isWork ? <Briefcase size={16} /> : <MapPin size={16} />}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#121A21', lineHeight: 1.2 }}>
                            {addr.label}
                          </div>
                          <div style={{
                            fontSize: '0.72rem',
                            color: '#64748B',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            marginTop: 2
                          }}>
                            {addr.address}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteAddress(addr.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#94A3B8',
                          cursor: 'pointer',
                          padding: 6,
                          borderRadius: 6
                        }}
                        title="Excluir endereço"
                      >
                        <Trash2 size={15} color="#EF4444" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 4. Notificações Push (Direto, sem borda dupla) */}
          <PushToggleButton role="cliente" externalId={clientExternalId(currentUser?.phone)} />

          {/* 5. Suporte VIP & Central de Ajuda */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: 20,
            padding: '14px 16px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 4px 20px -2px rgba(18, 26, 33, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            {/* Suporte WhatsApp */}
            <a
              href={supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderRadius: 12,
                backgroundColor: '#F0FDF4',
                border: '1px solid #BBF7D0',
                textDecoration: 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  backgroundColor: '#25D366',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <WhatsAppIcon size={19} />
                </div>
                <div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#166534' }}>
                    Suporte Direto no WhatsApp
                  </div>
                  <div style={{ fontSize: '0.70rem', color: '#15803D' }}>
                    Fale com a central Kavro Drive a qualquer momento
                  </div>
                </div>
              </div>
              <ChevronRight size={16} color="#16A34A" />
            </a>

            {/* Central de Ajuda Clean */}
            <button
              type="button"
              onClick={() => navigate('/ajuda')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                borderRadius: 12,
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  backgroundColor: '#0F172A',
                  color: '#8CE826',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <HelpCircle size={17} />
                </div>
                <div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0F172A' }}>
                    Central de Ajuda &amp; FAQ
                  </div>
                  <div style={{ fontSize: '0.70rem', color: '#64748B' }}>
                    Dúvidas sobre corridas, Pix, perfil e segurança
                  </div>
                </div>
              </div>
              <ChevronRight size={16} color="#64748B" />
            </button>

            {/* Instalação do Aplicativo (PWA) */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: 12,
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <Smartphone size={18} color="#64748B" />
                <div>
                  <div style={{ fontSize: '0.80rem', fontWeight: 700, color: '#121A21' }}>
                    Instalar Aplicativo UP
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                    Adicione o ícone na tela inicial do seu celular
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('up_pwa_dismissed_until');
                  window.location.reload();
                }}
                style={{
                  backgroundColor: '#111111',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '7px 12px',
                  borderRadius: 8,
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <Download size={13} />
                <span>Instalar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Termos de Uso & Assinatura Digital + Privacidade LGPD */}
      <div style={{ marginTop: 16, textAlign: 'center', paddingBottom: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => setIsSignedContractOpen(true)}
          style={{
            background: currentUser?.termsSignature?.signed ? '#F0FDF4' : '#F8FAFC',
            border: currentUser?.termsSignature?.signed ? '1.5px solid #86EFAC' : '1.5px solid #E2E8F0',
            borderRadius: 12,
            padding: '10px 16px',
            fontSize: '0.78rem',
            fontWeight: 700,
            color: currentUser?.termsSignature?.signed ? '#15803D' : '#334155',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
          }}
        >
          <ShieldCheck size={16} color="#16A34A" />
          <span>
            {currentUser?.termsSignature?.signed
              ? `Ver Termo Assinado (${currentUser.termsSignature.validationCode})`
              : 'Termos e Condições Gerais de Uso — Passageiro'}
          </span>
        </button>

        {currentUser?.termsSignature?.signed && (
          <div style={{ fontSize: '0.7rem', color: '#15803D', fontWeight: 600 }}>
            Assinado digitalmente em {currentUser.termsSignature.signedAtBrasilia} (Brasília)
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsTermsOpen(true)}
          style={{
            background: 'none',
            border: 'none',
            padding: '4px 8px',
            fontSize: '0.72rem',
            fontWeight: 600,
            color: '#64748B',
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          Resumo de Privacidade & Auditoria GPS (LGPD)
        </button>
        <div style={{ fontSize: '0.66rem', color: '#94A3B8' }}>
          🔒 Dados cadastrais e rotas GPS protegidos conforme a Lei 13.709/2018
        </div>
      </div>

      {/* Modal de Contrato & Termo Assinado Digitalmente do Passageiro */}
      <PassengerTermsContractModal
        isOpen={isSignedContractOpen}
        onClose={() => setIsSignedContractOpen(false)}
        mode="passenger"
        config={config}
        client={currentUser}
      />

      {/* Modal de Resumo de Privacidade (LGPD) */}
      <TermsPrivacyModal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
        config={config}
      />

      {/* Contatos de Confiança */}
      <TrustedContactsModal
        isOpen={isTrustedContactsOpen}
        onClose={() => setIsTrustedContactsOpen(false)}
        currentUser={currentUser}
        onUpdated={(_, updatedClient) => {
          if (updatedClient) {
            setCurrentUser(updatedClient);
            if (onUserChange) onUserChange(updatedClient);
          }
        }}
      />

      {/* Perfil Familiar / Segurança para Adolescentes */}
      <FamilyProfileFlowModal
        isOpen={isFamilyFlowOpen}
        onClose={() => setIsFamilyFlowOpen(false)}
        currentUser={currentUser}
        onRequireAuth={() => {
          setIsFamilyFlowOpen(false);
          setAuthInitialMode('login');
          setIsAuthModalOpen(true);
        }}
        onUserChange={(updatedClient) => {
          setCurrentUser(updatedClient);
          if (onUserChange) onUserChange(updatedClient);
        }}
      />

      {/* Central de Notificações */}
      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        userRole="client"
      />

      {/* Carteira Digital Kavro Drive (Depósito Mínimo R$ 20,00 + Formas de Pagamento) */}
      <PassengerWalletModal
        isOpen={isWalletOpen}
        onClose={() => setIsWalletOpen(false)}
        currentUser={currentUser}
        config={config}
        onRequireAuth={() => {
          setAuthInitialMode('login');
          setIsAuthModalOpen(true);
        }}
        onWalletUpdated={(w) => {
          setWalletBalance(w.balance);
          if (currentUser) {
            const nextUser = { ...currentUser, walletBalance: w.balance };
            setCurrentUser(nextUser);
            if (onUserChange) onUserChange(nextUser);
          }
        }}
      />
    </div>
  );
};
