import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu, Search, Power, Navigation, Phone, MessageSquare,
  Shield, DollarSign, Wallet, Star, Clock, Car, ChevronRight,
  TrendingUp, ArrowUpRight, Check, X, AlertTriangle, User,
  Calendar, Award, Banknote, QrCode, Copy, RefreshCw, LogOut,
  Sliders, Zap, ShieldCheck, Camera, CheckCircle2, XCircle, FileText, Eye
} from 'lucide-react';
import { DriverProfile, DriverWalletSummary, Ride, SystemConfig } from '../types';
import { StorageService } from '../services/storage';
import { PushService, driverExternalId } from '../services/push';
import { PushPermissionPrompt } from '../components/PushNotifications';
import { LiveGpsNavigationScreen } from '../components/LiveGpsNavigationScreen';
import { MercosulPlateBadge } from '../components/MercosulPlateBadge';
import { WhatsAppIcon } from '../components/WhatsAppIcon';
import { playNewRideSound } from '../utils/soundAndVoice';
import { formatRideCode, getCleanWhatsappNumber, formatPhone, formatCPF, formatMercosulPlate, formatCNH } from '../utils/format';
import {
  normalizeCategoriesFromConfig,
  evaluateAllDriverCategories,
  mapLegacyCategoryId,
  getCategoryById
} from '../utils/categoryEngine';
import {
  POPULAR_VEHICLES_CATALOG,
  POPULAR_VEHICLE_BRANDS,
  findVehicleTemplate,
  POPULAR_CAR_COLORS
} from '../services/vehicleService';
import { DriverChatModal } from '../components/DriverChatModal';
import { DriverPreferencesModal } from '../components/DriverPreferencesModal';
import { compressDataUrlForUpload } from '../utils/imageCompression';
import { DriverIncomingRideModal } from '../components/DriverIncomingRideModal';
import { DriverActiveRideCard } from '../components/DriverActiveRideCard';
import { DriverDrawerMenu } from '../components/DriverDrawerMenu';
import { DriverKycVerificationModal } from '../components/DriverKycVerificationModal';
import { DriverTermsContractModal } from '../components/DriverTermsContractModal';
import {
  DRIVER_TERMS_AFFIRMATIVE_TEXT,
  DRIVER_TERMS_CONTRACT_ID,
  DRIVER_TERMS_CONTRACT_VERSION
} from '../utils/driverTermsContract';
import { TurnstileWidget, isTurnstileEnabled } from '../components/TurnstileWidget';
import confetti from 'canvas-confetti';

interface DriverPortalScreenProps {
  rides: Ride[];
  config: SystemConfig;
  refreshData: () => void;
}

export const DriverPortalScreen: React.FC<DriverPortalScreenProps> = ({
  rides,
  config,
  refreshData
}) => {
  const navigate = useNavigate();
  const [currentDriver, setCurrentDriver] = useState<DriverProfile | null>(() => StorageService.getCurrentDriver());
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [activeTab, setActiveTab] = useState<'radar' | 'ganhos' | 'carteira' | 'perfil'>('radar');

  // Modais estilo Uber
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isGpsOpen, setIsGpsOpen] = useState(false);
  const [isKycModalOpen, setIsKycModalOpen] = useState(false);

  // Login states
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginStep, setLoginStep] = useState<'identifier' | 'password'>('identifier');
  const [loginMatchedName, setLoginMatchedName] = useState('');
  const [loginNotFound, setLoginNotFound] = useState(false);
  const [isLookupOnlySession, setIsLookupOnlySession] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);

  // Cadastro em etapas estilo Uber Partner
  const [regStep, setRegStep] = useState<number>(1);
  const REG_TOTAL_STEPS = 10;
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regDocument, setRegDocument] = useState('');
  const [regCnh, setRegCnh] = useState('');
  const [regCnhHasEar, setRegCnhHasEar] = useState(true);
  const [regPhoto, setRegPhoto] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regCity, setRegCity] = useState('Lauro Müller/SC');
  const [regBrand, setRegBrand] = useState('');
  const [regModel, setRegModel] = useState('');
  const [regVersion, setRegVersion] = useState('');
  const [regColor, setRegColor] = useState('Prata');
  const [regYear, setRegYear] = useState('2024');
  const [regPlate, setRegPlate] = useState('');
  const [regCrlvNumber, setRegCrlvNumber] = useState('');
  const [regCrlvRegular, setRegCrlvRegular] = useState(true);
  const [regHasFourDoors, setRegHasFourDoors] = useState(true);
  const [regHasAc, setRegHasAc] = useState(true);
  const [regHasLargeTrunk, setRegHasLargeTrunk] = useState(true);
  const [regHasLeatherSeats, setRegHasLeatherSeats] = useState(false);
  const [regCategory, setRegCategory] = useState('kavro_go');
  const [regTermsAccepted, setRegTermsAccepted] = useState(false);
  const [isRegTermsModalOpen, setIsRegTermsModalOpen] = useState(false);
  const [isDriverSignedContractOpen, setIsDriverSignedContractOpen] = useState(false);

  // Edição de chave PIX após aprovação (na aba Carteira)
  const [pixEditType, setPixEditType] = useState<'cpf' | 'cnpj' | 'telefone' | 'email' | 'aleatoria'>('cpf');
  const [pixEditKey, setPixEditKey] = useState('');
  const [pixEditBank, setPixEditBank] = useState('');
  const [isSavingPix, setIsSavingPix] = useState(false);
  const [pixSaveNotice, setPixSaveNotice] = useState('');
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  // Aplica ficha técnica pré-cadastrada da marca/modelo com características automáticas
  const handleApplyVehicleTemplate = (brand: string, model: string) => {
    setRegBrand(brand);
    setRegModel(model);
    const tmpl = findVehicleTemplate(brand, model);
    if (tmpl) {
      setRegHasFourDoors(true);
      setRegHasAc(true);
      setRegHasLargeTrunk(tmpl.hasLargeTrunk);
      setRegHasLeatherSeats(tmpl.hasLeatherSeats);
      setRegCategory(tmpl.category);
    }
  };

  const platformCategories = normalizeCategoriesFromConfig(config);

  // Carteira & Operação
  const [wallet, setWallet] = useState<DriverWalletSummary | null>(null);
  const [statusError, setStatusError] = useState('');

  // Modal de Dinheiro
  const [cashCompleteRide, setCashCompleteRide] = useState<Ride | null>(null);
  const [cashResolution, setCashResolution] = useState<'confirmado' | 'parcialmente_pago' | 'pendente'>('confirmado');
  const [partialCashStr, setPartialCashStr] = useState('');
  const [cashChangeGivenStr, setCashChangeGivenStr] = useState('');
  const [isCompletingRide, setIsCompletingRide] = useState(false);

  // Modal de Saque e Quitação de Dívida PIX
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [withdrawAmountStr, setWithdrawAmountStr] = useState('');
  const [withdrawPixKey, setWithdrawPixKey] = useState('');
  const [withdrawError, setWithdrawError] = useState('');
  const [isRequestingWithdraw, setIsRequestingWithdraw] = useState(false);

  const [debtPixModalData, setDebtPixModalData] = useState<{
    amount: number;
    pixCopyPaste: string;
    pixQrCode: string;
  } | null>(null);
  const [copiedDebtPix, setCopiedDebtPix] = useState(false);
  const [isSimulatingDebtWebhook, setIsSimulatingDebtWebhook] = useState(false);

  useEffect(() => {
    if (currentDriver?.id) {
      setPixEditType(currentDriver.pixType || 'cpf');
      setPixEditKey(currentDriver.pixKey || '');
      setPixEditBank(currentDriver.bankName || '');
    }
  }, [currentDriver?.id]);

  const loadDriverAndWallet = async (drvId: string) => {
    if (currentDriver && (currentDriver.approvalStatus !== 'aprovado' || isLookupOnlySession)) {
      const lookupKey = currentDriver.document || currentDriver.phone || '';
      if (lookupKey) {
        const res = await StorageService.checkDriverByIdentifier(lookupKey);
        if (res.ok && res.found && res.driver) {
          if (!isLookupOnlySession && res.driver.approvalStatus === 'aprovado') {
            const w = await StorageService.fetchDriverWallet(drvId);
            if (w) setWallet(w);
            const list = await StorageService.fetchDriversList();
            const fresh = list.find(d => d.id === drvId);
            if (fresh) {
              setCurrentDriver(fresh);
              StorageService.setCurrentDriver(fresh);
              return;
            }
          }
          const checkedDriver = res.driver;
          setCurrentDriver(prev => {
            if (!prev) return null;
            const merged = {
              ...prev,
              ...checkedDriver,
              phone: checkedDriver.phone || prev.phone,
              email: checkedDriver.email || prev.email,
              termsSignature: checkedDriver.termsSignature || prev.termsSignature
            } as DriverProfile;
            if (!isLookupOnlySession) StorageService.setCurrentDriver(merged);
            return merged;
          });
          return;
        }
      }
    }
    if (isLookupOnlySession) return;
    const w = await StorageService.fetchDriverWallet(drvId);
    if (w) setWallet(w);
    const list = await StorageService.fetchDriversList();
    const fresh = list.find(d => d.id === drvId);
    if (fresh) {
      setCurrentDriver(fresh);
      StorageService.setCurrentDriver(fresh);
    }
  };

  useEffect(() => {
    if (currentDriver?.id) {
      const drvExt = driverExternalId(currentDriver.id, currentDriver.phone);
      if (drvExt) {
        PushService.identify('motorista', drvExt).catch(() => {});
      }
      loadDriverAndWallet(currentDriver.id);
      const t = setInterval(() => {
        if (document.visibilityState === 'visible') {
          loadDriverAndWallet(currentDriver.id);
        }
      }, 3000);
      return () => clearInterval(t);
    }
  }, [currentDriver?.id, currentDriver?.approvalStatus, isLookupOnlySession]);

  // Alerta sonoro para novas chamadas no radar
  const prevRadarIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!currentDriver?.isOnline || currentDriver.approvalStatus !== 'aprovado') return;
    const { enabledCategoryIds } = evaluateAllDriverCategories(currentDriver, platformCategories);
    const incoming = rides.filter(r => {
      if (r.status !== 'aguardando_confirmacao') return false;
      if ((r.declinedDriverIds || []).includes(currentDriver.id)) return false;
      const rideCat = mapLegacyCategoryId(r.category);
      return enabledCategoryIds.includes(rideCat);
    });
    const ids = new Set(incoming.map(r => r.id));
    const hasNew = incoming.some(r => !prevRadarIdsRef.current.has(r.id));
    if (hasNew && prevRadarIdsRef.current.size >= 0) {
      playNewRideSound();
    }
    prevRadarIdsRef.current = ids;
  }, [rides, currentDriver?.isOnline, currentDriver?.id, currentDriver?.approvalStatus, currentDriver?.enabledCategories]);

  // Handlers de Autenticação
  const handleLogoutDriver = () => {
    StorageService.setCurrentDriver(null);
    setCurrentDriver(null);
    setIsLookupOnlySession(false);
    setLoginStep('identifier');
    setLoginMatchedName('');
    setLoginPassword('');
    setAuthError('');
    setLoginNotFound(false);
  };

  const handleCheckIdentifierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setLoginNotFound(false);
    const trimmed = loginIdentifier.trim();
    if (!trimmed) {
      setAuthError('Informe seu CPF, celular ou e-mail.');
      return;
    }
    setIsLoadingAuth(true);
    const res = await StorageService.checkDriverByIdentifier(trimmed);
    setIsLoadingAuth(false);
    if (!res.ok) {
      setAuthError(res.error || 'Erro ao consultar cadastro.');
      return;
    }
    if (!res.found || !res.driver) {
      setLoginNotFound(true);
      setAuthError('Cadastro não localizado com este dado.');
      return;
    }
    if (res.driver.approvalStatus !== 'aprovado') {
      setIsLookupOnlySession(true);
      setCurrentDriver(res.driver as DriverProfile);
      return;
    }
    setLoginMatchedName(res.driver.firstName || String(res.driver.name || '').split(' ')[0] || 'Motorista');
    setLoginPassword('');
    setTurnstileResetKey(k => k + 1);
    setLoginStep('password');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (isTurnstileEnabled() && !turnstileToken) {
      setAuthError('Confirme a verificação de segurança anti-robô para entrar.');
      return;
    }
    setIsLoadingAuth(true);
    const res = await StorageService.loginDriver(loginIdentifier, loginPassword, turnstileToken || undefined);
    setIsLoadingAuth(false);
    if (!res.ok || !res.driver) {
      setAuthError(res.error || 'Falha no login.');
      setTurnstileResetKey(k => k + 1);
      return;
    }
    setIsLookupOnlySession(false);
    setCurrentDriver(res.driver);
    if (res.wallet) setWallet(res.wallet);
  };

  const handleRegisterPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        const compressed = await compressDataUrlForUpload(reader.result, 720, 0.82);
        setRegPhoto(compressed);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    // Validação etapa a etapa (fluxo estilo Uber: poucas informações por tela)
    const stepError = (() => {
      switch (regStep) {
        case 1: return regName.trim().split(/\s+/).filter(Boolean).length < 2 ? 'Informe seu nome completo (nome e sobrenome).' : '';
        case 2: return regPhone.replace(/\D/g, '').length < 10 ? 'Informe um celular válido com DDD.' : (regEmail && !/^\S+@\S+\.\S+$/.test(regEmail) ? 'Informe um e-mail válido.' : '');
        case 3: return regDocument.replace(/\D/g, '').length !== 11 ? 'Informe um CPF válido com 11 dígitos.' : '';
        case 4: return !regCity.trim() ? 'Informe a cidade onde vai dirigir.' : '';
        case 5: return !regPassword || regPassword.length < 4 ? 'A senha precisa ter no mínimo 4 caracteres.' : '';
        case 6: return !regBrand.trim() || !regModel.trim() ? 'Informe a marca e o modelo do veículo.' : '';
        case 7: return !/^\d{4}$/.test(regYear) ? 'Informe o ano do veículo (ex: 2022).' : (!regColor.trim() ? 'Informe a cor do veículo.' : '');
        case 8: return regPlate.replace(/[^A-Za-z0-9]/g, '').length < 7 ? 'Informe uma placa válida (ex: ABC1D23).' : '';
        case 10: return !regTermsAccepted ? 'Leia e marque o aceite dos Termos e Condições de Uso do Motorista Parceiro para assinar e enviar.' : '';
        default: return '';
      }
    })();
    if (stepError) {
      setAuthError(stepError);
      return;
    }
    if (regStep < REG_TOTAL_STEPS) {
      setRegStep(regStep + 1);
      return;
    }
    if (isTurnstileEnabled() && !turnstileToken) {
      setAuthError('Confirme a verificação de segurança anti-robô para continuar.');
      return;
    }

    const previewEval = evaluateAllDriverCategories(
      {
        cnhHasEar: regCnhHasEar,
        vehicleBrand: regBrand,
        vehicleModel: regModel,
        vehicleVersion: regVersion,
        vehicleYear: regYear,
        crlvRegular: regCrlvRegular,
        hasFourDoors: regHasFourDoors,
        hasAirConditioning: regHasAc,
        hasLargeTrunk: regHasLargeTrunk,
        hasLeatherSeats: regHasLeatherSeats,
        city: regCity,
        rating: 5.0,
        totalRides: 0
      },
      platformCategories,
      { ignoreApprovalStatus: true }
    );

    setIsLoadingAuth(true);
    const res = await StorageService.registerDriver({
      name: regName,
      phone: regPhone,
      email: regEmail,
      document: regDocument,
      cnh: regCnh,
      cnhHasEar: regCnhHasEar,
      photo: regPhoto,
      password: regPassword,
      city: regCity,
      vehicleBrand: regBrand,
      vehicleModel: regModel,
      vehicleVersion: regVersion,
      vehicleColor: regColor,
      vehicleYear: regYear,
      vehiclePlate: regPlate.toUpperCase(),
      crlvNumber: regCrlvNumber,
      crlvRegular: regCrlvRegular,
      hasFourDoors: regHasFourDoors,
      hasAirConditioning: regHasAc,
      hasLargeTrunk: regHasLargeTrunk,
      hasLeatherSeats: regHasLeatherSeats,
      vehicleCategory: previewEval.eligibleCategoryIds[previewEval.eligibleCategoryIds.length - 1] || regCategory,
      eligibleCategories: previewEval.eligibleCategoryIds,
      enabledCategories: previewEval.eligibleCategoryIds,
      pixType: 'cpf',
      pixKey: '',
      bankName: '',
      turnstileToken: turnstileToken || undefined,
      termsAcceptance: {
        accepted: true,
        contractId: DRIVER_TERMS_CONTRACT_ID,
        contractVersion: DRIVER_TERMS_CONTRACT_VERSION,
        acceptedAtClient: new Date().toISOString(),
        affirmativeText: DRIVER_TERMS_AFFIRMATIVE_TEXT,
        language: typeof navigator !== 'undefined' ? navigator.language : 'pt-BR',
        timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'America/Sao_Paulo'
      }
    });
    setIsLoadingAuth(false);
    if (!res.ok || !res.driver) {
      setAuthError(res.error || 'Erro ao enviar cadastro.');
      setTurnstileResetKey(k => k + 1);
      return;
    }
    setIsLookupOnlySession(false);
    setCurrentDriver(res.driver);
    // Abrir imediatamente a verificação facial KYC semiautomática via Human AI
    setIsKycModalOpen(true);
  };

  // Handlers Operacionais
  const handleToggleOnline = async () => {
    if (!currentDriver) return;
    setStatusError('');
    if (currentDriver.approvalStatus !== 'aprovado') {
      setStatusError(
        currentDriver.approvalStatus === 'correcao_solicitada'
          ? 'A Central Master solicitou correções em sua documentação. Toque para reenviar seus documentos.'
          : currentDriver.approvalStatus === 'em_analise'
            ? 'Sua documentação e biometria facial estão em análise pela Central Master. Aguarde a aprovação para iniciar.'
            : 'Seu cadastro precisa estar Aprovado pelo administrador antes de poder ficar online.'
      );
      return;
    }
    const nextOnline = !currentDriver.isOnline;
    const res = await StorageService.toggleDriverOnline(currentDriver.id, nextOnline);
    if (!res.ok || !res.driver) {
      setStatusError(res.error || 'Não foi possível alterar status.');
      return;
    }
    setCurrentDriver(res.driver);
  };

  const handleAcceptRide = async (rideId: string) => {
    if (!currentDriver) return;
    setStatusError('');
    const res = await StorageService.acceptRide(rideId, currentDriver.id);
    if (!res.ok) {
      setStatusError(res.error || 'Não foi possível aceitar esta corrida.');
      return;
    }
    refreshData();
    await loadDriverAndWallet(currentDriver.id);
  };

  const handleDeclineRide = async (rideId: string) => {
    if (!currentDriver) return;
    await StorageService.declineRide(rideId, currentDriver.id);
    refreshData();
  };

  const handleStartTrip = async (ride: Ride) => {
    await fetch(`/api/rides/${encodeURIComponent(ride.id)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'em_andamento' })
    });
    await StorageService.syncFromDatabase();
    refreshData();
  };

  const handleInitiateCompleteRide = async (ride: Ride) => {
    if (ride.paymentMethod === 'dinheiro') {
      setCashCompleteRide(ride);
      setCashResolution('confirmado');
      setPartialCashStr(ride.totalPrice.toFixed(2));
      setCashChangeGivenStr('');
      return;
    }
    setIsCompletingRide(true);
    const res = await StorageService.completeRide(ride.id, {
      driverId: currentDriver?.id,
      finalAmount: ride.totalPrice
    });
    setIsCompletingRide(false);
    if (res.ok) {
      if (res.wallet) setWallet(res.wallet);
      refreshData();
      try {
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
      } catch {}
    } else {
      setStatusError(res.error || 'Erro ao concluir viagem.');
    }
  };

  const handleConfirmCashCompletion = async () => {
    if (!cashCompleteRide || !currentDriver) return;
    setIsCompletingRide(true);
    const receivedVal =
      cashResolution === 'confirmado'
        ? cashCompleteRide.totalPrice
        : cashResolution === 'pendente'
          ? 0
          : Math.max(0, parseFloat(partialCashStr.replace(',', '.')) || 0);

    const res = await StorageService.completeRide(cashCompleteRide.id, {
      driverId: currentDriver.id,
      finalAmount: cashCompleteRide.totalPrice,
      receivedCashAmount: receivedVal,
      cashResolution
    });
    setIsCompletingRide(false);
    setCashCompleteRide(null);
    if (res.ok) {
      if (res.wallet) setWallet(res.wallet);
      refreshData();
      await loadDriverAndWallet(currentDriver.id);
    } else {
      setStatusError(res.error || 'Erro ao registrar recebimento em dinheiro.');
    }
  };

  const handleToggleAcceptCash = async (enabled: boolean) => {
    if (!currentDriver) return;
    const res = await StorageService.updateDriverProfile(currentDriver.id, {
      acceptsCash: enabled
    });
    if (res.ok && res.driver) {
      setCurrentDriver(res.driver);
    }
  };

  const handleToggleCategoryReceive = async (categoryId: string) => {
    if (!currentDriver) return;
    const { eligibleCategoryIds, enabledCategoryIds } = evaluateAllDriverCategories(currentDriver, platformCategories);
    if (!eligibleCategoryIds.includes(categoryId)) return;

    const isCurrentlyEnabled = enabledCategoryIds.includes(categoryId);
    const nextEnabled = isCurrentlyEnabled
      ? enabledCategoryIds.filter(id => id !== categoryId)
      : [...enabledCategoryIds, categoryId];

    if (nextEnabled.length === 0) return;

    const res = await StorageService.updateDriverProfile(currentDriver.id, {
      enabledCategories: nextEnabled
    });
    if (res.ok && res.driver) {
      setCurrentDriver(res.driver);
    }
  };

  const handleRequestWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentDriver) return;
    setWithdrawError('');
    const targetPixKey = (withdrawPixKey || currentDriver.pixKey || '').trim();
    if (!targetPixKey) {
      setWithdrawError('Cadastre ou informe sua chave PIX antes de solicitar o saque.');
      return;
    }
    const amount = parseFloat(withdrawAmountStr.replace(',', '.')) || 0;
    setIsRequestingWithdraw(true);
    const res = await StorageService.requestDriverWithdrawal(currentDriver.id, {
      amount,
      pixKey: targetPixKey,
      pixType: currentDriver.pixType || 'cpf'
    });
    setIsRequestingWithdraw(false);
    if (!res.ok) {
      setWithdrawError(res.error || 'Não foi possível solicitar o saque.');
      return;
    }
    if (res.wallet) setWallet(res.wallet);
    setIsWithdrawModalOpen(false);
    setWithdrawAmountStr('');
  };

  const handleSavePixKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentDriver) return;
    setPixSaveNotice('');
    if (!pixEditKey.trim()) {
      setPixSaveNotice('Informe uma chave PIX válida.');
      return;
    }
    setIsSavingPix(true);
    const res = await StorageService.updateDriverProfile(currentDriver.id, {
      pixType: pixEditType,
      pixKey: pixEditKey.trim(),
      bankName: pixEditBank.trim()
    });
    setIsSavingPix(false);
    if (res.ok && res.driver) {
      setCurrentDriver(res.driver);
      setPixSaveNotice('Chave PIX salva com sucesso!');
      setTimeout(() => setPixSaveNotice(''), 3500);
    } else {
      setPixSaveNotice('Não foi possível salvar sua chave PIX agora.');
    }
  };

  const handleOpenDebtPixModal = async () => {
    if (!currentDriver) return;
    const res = await StorageService.createDriverDebtPix(currentDriver.id);
    if (res.ok && res.pixQrCode && res.pixCopyPaste && res.amount) {
      setDebtPixModalData({
        amount: res.amount,
        pixCopyPaste: res.pixCopyPaste,
        pixQrCode: res.pixQrCode
      });
    } else {
      setStatusError(res.error || 'Erro ao gerar QR Code de quitação.');
    }
  };

  const handleSimulateDebtPixWebhook = async () => {
    if (!currentDriver || !debtPixModalData) return;
    setIsSimulatingDebtWebhook(true);
    const res = await StorageService.triggerGatewayWebhook({
      event: 'debt.confirmed',
      driverId: currentDriver.id,
      amount: debtPixModalData.amount,
      gatewayTxId: `gw_debt_${currentDriver.id}_${Date.now()}`
    });
    setIsSimulatingDebtWebhook(false);
    if (res.ok) {
      setDebtPixModalData(null);
      await loadDriverAndWallet(currentDriver.id);
      try {
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
      } catch {}
    }
  };

  // 1. TELA DE LOGIN & CADASTRO DE MOTORISTA (TELA CHEIA ESTILO UBER)
  if (!currentDriver) {
    // ── Estilo Uber Driver: cabeçalho preto, corpo branco, inputs cinza, botão preto ──
    const uLabel: React.CSSProperties = { display: 'block', fontSize: '0.84rem', color: '#000000', fontWeight: 600, marginBottom: 6 };
    const uInput: React.CSSProperties = {
      width: '100%', boxSizing: 'border-box', height: 52, padding: '0 16px',
      borderRadius: 8, border: '2px solid transparent', backgroundColor: '#F3F3F3',
      color: '#000000', fontSize: '1rem', outline: 'none', fontFamily: 'inherit'
    };
    const uPrimaryBtn = (disabled?: boolean): React.CSSProperties => ({
      width: '100%', height: 54, borderRadius: 8, border: 'none',
      backgroundColor: disabled ? '#6B6B6B' : '#000000', color: '#FFFFFF',
      fontSize: '1rem', fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
    });
    const uChip = (active: boolean): React.CSSProperties => ({
      padding: '10px 14px', borderRadius: 999, flexShrink: 0, whiteSpace: 'nowrap',
      border: active ? '2px solid #000000' : '2px solid #E2E2E2',
      backgroundColor: active ? '#000000' : '#FFFFFF', color: active ? '#FFFFFF' : '#000000',
      fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer'
    });
    const uToggleRow = (checked: boolean, onToggle: () => void, label: string, hint?: string) => (
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          width: '100%', padding: '14px 0', background: 'none', border: 'none',
          borderBottom: '1px solid #EEEEEE', cursor: 'pointer', textAlign: 'left'
        }}
      >
        <div>
          <div style={{ fontSize: '0.95rem', fontWeight: 500, color: '#000000' }}>{label}</div>
          {hint && <div style={{ fontSize: '0.78rem', color: '#6B6B6B', marginTop: 2 }}>{hint}</div>}
        </div>
        <div style={{
          width: 24, height: 24, borderRadius: 6, flexShrink: 0,
          border: checked ? 'none' : '2px solid #A6A6A6',
          backgroundColor: checked ? '#000000' : '#FFFFFF',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          {checked && <Check size={16} color="#FFFFFF" strokeWidth={3} />}
        </div>
      </button>
    );

    const stepTitles: Record<number, { section: string; title: string; subtitle?: string }> = {
      1: { section: 'Seus dados', title: 'Qual é o seu nome?', subtitle: 'Use o mesmo nome que aparece na sua CNH.' },
      2: { section: 'Seus dados', title: 'Como podemos falar com você?', subtitle: 'Vamos usar o celular para avisos de corridas e da sua conta.' },
      3: { section: 'Seus dados', title: 'Qual é o seu CPF?', subtitle: 'Necessário para a verificação de antecedentes e pagamentos.' },
      4: { section: 'Seus dados', title: 'Em qual cidade você vai dirigir?' },
      5: { section: 'Sua conta', title: 'Crie uma senha', subtitle: 'Você vai usar essa senha para entrar no app.' },
      6: { section: 'Veículo', title: 'Qual carro você vai usar?', subtitle: 'O veículo precisa ter 4 portas e documentação em dia.' },
      7: { section: 'Veículo', title: 'Ano e cor do veículo' },
      8: { section: 'Veículo', title: 'Qual é a placa?', subtitle: 'Padrão Mercosul ou antigo.' },
      9: { section: 'Veículo', title: 'O que seu carro tem?', subtitle: 'Isso define em quais categorias você pode receber viagens.' },
      10: {
        section: 'Contrato de parceria',
        title: 'Termos e condições de uso',
        subtitle: 'Leia o contrato de Motorista Parceiro e registre seu aceite eletrônico.'
      }
    };

    return (
      <div className="kv-light" style={{
        minHeight: '100dvh',
        backgroundColor: '#FFFFFF',
        color: '#000000',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        {/* Cabeçalho preto estilo Uber */}
        <header style={{
          backgroundColor: '#000000',
          padding: 'calc(14px + env(safe-area-inset-top, 0px)) 20px 14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <img src="/logo-horizontal-white.png" alt="Kavro Drive" style={{ height: 28, width: 'auto', objectFit: 'contain' }} />
          <span style={{ color: '#FFFFFF', fontSize: '0.8rem', fontWeight: 500, opacity: 0.8 }}>Motorista parceiro</span>
        </header>

        <main style={{
          flex: 1,
          width: '100%',
          maxWidth: 480,
          margin: '0 auto',
          padding: '24px 20px calc(32px + env(safe-area-inset-bottom, 0px)) 20px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {authMode === 'login' ? (
            loginStep === 'identifier' ? (
              <form onSubmit={handleCheckIdentifierSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.2, margin: '8px 0 4px 0', color: '#000000', letterSpacing: '-0.02em' }}>
                  Informe seu CPF
                </h1>
                <p style={{ fontSize: '0.95rem', color: '#6B6B6B', margin: '0 0 8px 0' }}>
                  Digite seu CPF para continuar seu cadastro, ver análise ou entrar no app.
                </p>

                <div>
                  <label style={uLabel}>CPF (ou celular / e-mail)</label>
                  <input
                    type="text"
                    placeholder="000.000.000-00"
                    value={loginIdentifier}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setLoginNotFound(false);
                      setAuthError('');
                      if (/^\d[\d.-]*$/.test(raw) && raw.replace(/\D/g, '').length <= 11) {
                        setLoginIdentifier(formatCPF(raw));
                      } else {
                        setLoginIdentifier(raw);
                      }
                    }}
                    required
                    style={uInput}
                  />
                </div>

                {authError && (
                  <div style={{ color: '#C1121F', fontSize: '0.86rem', fontWeight: 500, padding: '10px 12px', backgroundColor: '#FDECEC', borderRadius: 8 }}>
                    {authError}
                  </div>
                )}

                <button type="submit" disabled={isLoadingAuth} style={{ ...uPrimaryBtn(isLoadingAuth), marginTop: 4 }}>
                  {isLoadingAuth ? 'Verificando...' : 'Continuar'}
                </button>

                {loginNotFound && (
                  <button
                    type="button"
                    onClick={() => {
                      const digits = loginIdentifier.replace(/\D/g, '');
                      if (digits.length === 11) setRegDocument(formatCPF(digits));
                      setAuthMode('register');
                      setRegStep(1);
                      setRegTermsAccepted(false);
                      setAuthError('');
                      setLoginNotFound(false);
                    }}
                    style={{ ...uPrimaryBtn(), backgroundColor: '#000000', color: '#FFFFFF' }}
                  >
                    Cadastrar com este CPF
                  </button>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0' }}>
                  <div style={{ flex: 1, height: 1, backgroundColor: '#E2E2E2' }} />
                  <span style={{ fontSize: '0.85rem', color: '#6B6B6B' }}>ou</span>
                  <div style={{ flex: 1, height: 1, backgroundColor: '#E2E2E2' }} />
                </div>

                <button
                  type="button"
                  onClick={() => { setAuthMode('register'); setRegStep(1); setRegTermsAccepted(false); setAuthError(''); setLoginNotFound(false); }}
                  style={{ ...uPrimaryBtn(), backgroundColor: '#F3F3F3', color: '#000000' }}
                >
                  Quero dirigir com a Kavro
                </button>
              </form>
            ) : (
              <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => { setLoginStep('identifier'); setLoginPassword(''); setAuthError(''); }}
                    aria-label="Voltar"
                    style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', backgroundColor: '#F3F3F3', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1.2rem', color: '#000' }}
                  >
                    ←
                  </button>
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Cadastro aprovado
                    </div>
                    <div style={{ fontSize: '0.84rem', color: '#6B6B6B' }}>{loginIdentifier}</div>
                  </div>
                </div>

                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.2, margin: '4px 0 0 0', color: '#000000', letterSpacing: '-0.02em' }}>
                  Olá, {loginMatchedName || 'motorista'}
                </h1>
                <p style={{ fontSize: '0.95rem', color: '#6B6B6B', margin: '0 0 8px 0' }}>
                  Digite sua senha cadastrada para entrar.
                </p>

                <div>
                  <label style={uLabel}>Senha</label>
                  <input
                    autoFocus
                    type="password"
                    placeholder="Sua senha"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    style={uInput}
                  />
                </div>

                {authError && (
                  <div style={{ color: '#C1121F', fontSize: '0.86rem', fontWeight: 500, padding: '10px 12px', backgroundColor: '#FDECEC', borderRadius: 8 }}>
                    {authError}
                  </div>
                )}

                <TurnstileWidget theme="light" onVerify={setTurnstileToken} resetKey={turnstileResetKey} />

                <button type="submit" disabled={isLoadingAuth} style={{ ...uPrimaryBtn(isLoadingAuth), marginTop: 8 }}>
                  {isLoadingAuth ? 'Entrando...' : 'Entrar'}
                </button>
              </form>
            )
          ) : (
            <form key={`reg-step-${regStep}`} onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
              {/* Voltar + barra de progresso contínua */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <button
                  type="button"
                  onClick={() => {
                    setAuthError('');
                    if (regStep > 1) setRegStep(regStep - 1);
                    else setAuthMode('login');
                  }}
                  aria-label="Voltar"
                  style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', backgroundColor: '#F3F3F3', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1.2rem', color: '#000' }}
                >
                  ←
                </button>
                <div style={{ flex: 1, height: 4, borderRadius: 4, backgroundColor: '#E2E2E2', overflow: 'hidden' }}>
                  <div style={{ width: `${(regStep / REG_TOTAL_STEPS) * 100}%`, height: '100%', backgroundColor: '#000000', borderRadius: 4, transition: 'width 0.35s ease' }} />
                </div>
              </div>

              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6B6B6B', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>
                {stepTitles[regStep].section}
              </div>

              <div style={{ marginTop: -10 }}>
                <h1 style={{ fontSize: '1.65rem', fontWeight: 700, lineHeight: 1.2, margin: '0 0 8px 0', color: '#000000', letterSpacing: '-0.02em' }}>
                  {stepTitles[regStep].title}
                </h1>
                {stepTitles[regStep].subtitle && (
                  <p style={{ fontSize: '0.94rem', color: '#6B6B6B', margin: 0, lineHeight: 1.45 }}>
                    {stepTitles[regStep].subtitle}
                  </p>
                )}
              </div>

              {/* 1. Nome */}
              {regStep === 1 && (
                <div>
                  <input autoFocus type="text" autoComplete="name" placeholder="Nome e sobrenome" value={regName}
                    onChange={(e) => setRegName(e.target.value)} style={uInput} />
                </div>
              )}

              {/* 2. Contato */}
              {regStep === 2 && (
                <>
                  <div>
                    <label style={uLabel}>Celular (WhatsApp)</label>
                    <input autoFocus type="tel" inputMode="tel" autoComplete="tel" placeholder="(48) 99999-0000" value={regPhone}
                      onChange={(e) => setRegPhone(formatPhone(e.target.value))} style={uInput} />
                  </div>
                  <div>
                    <label style={uLabel}>E-mail <span style={{ color: '#6B6B6B', fontWeight: 400 }}>(opcional)</span></label>
                    <input type="email" autoComplete="email" placeholder="nome@email.com" value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)} style={uInput} />
                  </div>
                </>
              )}

              {/* 3. CPF */}
              {regStep === 3 && (
                <div>
                  <input autoFocus type="text" inputMode="numeric" placeholder="000.000.000-00" value={regDocument}
                    onChange={(e) => setRegDocument(formatCPF(e.target.value))} style={{ ...uInput, fontSize: '1.1rem', letterSpacing: '0.04em' }} />
                </div>
              )}

              {/* 4. Cidade */}
              {regStep === 4 && (
                <div>
                  <input autoFocus type="text" placeholder="Cidade/UF" value={regCity}
                    onChange={(e) => setRegCity(e.target.value)} style={uInput} />
                </div>
              )}

              {/* 5. Senha */}
              {regStep === 5 && (
                <div>
                  <input autoFocus type="password" autoComplete="new-password" placeholder="Mínimo de 4 caracteres" value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)} style={uInput} />
                </div>
              )}

              {/* 6. Marca e modelo */}
              {regStep === 6 && (
                <>
                  <datalist id="kavro-brands-list">
                    {POPULAR_VEHICLE_BRANDS.map(b => (<option key={b} value={b} />))}
                  </datalist>
                  <datalist id="kavro-models-list">
                    {POPULAR_VEHICLES_CATALOG
                      .filter(v => !regBrand || v.brand.toLowerCase() === regBrand.toLowerCase())
                      .map(v => (
                        <option key={`${v.brand}-${v.model}`} value={v.model} label={v.brand} />
                      ))}
                  </datalist>

                  <div>
                    <label style={{ ...uLabel, color: '#6B6B6B', fontWeight: 500 }}>Mais comuns</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {[
                        { brand: 'Toyota', model: 'Corolla' },
                        { brand: 'Chevrolet', model: 'Onix Plus' },
                        { brand: 'Volkswagen', model: 'Polo' },
                        { brand: 'Fiat', model: 'Cronos' },
                        { brand: 'Hyundai', model: 'HB20S Sedan' },
                        { brand: 'Honda', model: 'Civic' }
                      ].map((item, idx) => (
                        <button key={idx} type="button"
                          onClick={() => handleApplyVehicleTemplate(item.brand, item.model)}
                          style={uChip(regBrand === item.brand && regModel === item.model)}
                        >{item.brand} {item.model}</button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label style={uLabel}>Marca</label>
                    <input type="text" list="kavro-brands-list" placeholder="Ex: Toyota" value={regBrand}
                      onChange={(e) => { const v = e.target.value; setRegBrand(v); const t = findVehicleTemplate(v, regModel); if (t) handleApplyVehicleTemplate(t.brand, t.model); }}
                      style={uInput} />
                  </div>
                  <div>
                    <label style={uLabel}>Modelo</label>
                    <input type="text" list="kavro-models-list" placeholder="Ex: Corolla" value={regModel}
                      onChange={(e) => { const v = e.target.value; setRegModel(v); const t = findVehicleTemplate(regBrand, v); if (t) handleApplyVehicleTemplate(t.brand, t.model); }}
                      style={uInput} />
                  </div>
                </>
              )}

              {/* 7. Ano e cor */}
              {regStep === 7 && (
                <>
                  <div>
                    <label style={uLabel}>Ano do veículo</label>
                    <input autoFocus type="text" inputMode="numeric" placeholder="2024" maxLength={4} value={regYear}
                      onChange={(e) => setRegYear(e.target.value.replace(/\D/g, '').slice(0, 4))} style={uInput} />
                  </div>
                  <div>
                    <label style={uLabel}>Cor</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {POPULAR_CAR_COLORS.slice(0, 8).map(c => (
                        <button key={c.name} type="button" onClick={() => setRegColor(c.name)} style={uChip(regColor === c.name)}>
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* 8. Placa */}
              {regStep === 8 && (
                <div>
                  <input autoFocus type="text" placeholder="ABC1D23" maxLength={7} value={regPlate}
                    onChange={(e) => setRegPlate(formatMercosulPlate(e.target.value))}
                    style={{ ...uInput, height: 60, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 700, fontSize: '1.4rem' }} />
                </div>
              )}

              {/* 9. Itens do veículo */}
              {regStep === 9 && (
                <div>
                  {uToggleRow(regHasFourDoors, () => setRegHasFourDoors(!regHasFourDoors), '4 portas')}
                  {uToggleRow(regHasAc, () => setRegHasAc(!regHasAc), 'Ar-condicionado')}
                  {uToggleRow(regHasLargeTrunk, () => setRegHasLargeTrunk(!regHasLargeTrunk), 'Porta-malas amplo', 'Libera a categoria Plus')}
                  {uToggleRow(regHasLeatherSeats, () => setRegHasLeatherSeats(!regHasLeatherSeats), 'Bancos de couro', 'Libera a categoria Exec')}
                </div>
              )}

              {/* 10. Termos e Condições de Uso — Motorista Parceiro + Assinatura Digital */}
              {regStep === 10 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{
                    backgroundColor: '#F3F3F3',
                    borderRadius: 12,
                    padding: '14px 16px',
                    border: '1px solid #E2E2E2',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#000000' }}>
                        Instrumento de Parceria • {DRIVER_TERMS_CONTRACT_ID}
                      </span>
                      <span style={{
                        fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                        backgroundColor: '#E5E7EB', color: '#111827'
                      }}>
                        Versão {DRIVER_TERMS_CONTRACT_VERSION}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.82rem', color: '#333333', lineHeight: 1.45 }}>
                      <div><strong>Signatário:</strong> {regName || 'Motorista Parceiro'} • <strong>CPF:</strong> {regDocument || '—'}</div>
                      <div><strong>Veículo:</strong> {[regBrand, regModel, regYear].filter(Boolean).join(' ') || '—'} • <strong>Placa:</strong> {regPlate ? regPlate.toUpperCase() : '—'}</div>
                    </div>

                    <div style={{ fontSize: '0.78rem', color: '#525252', lineHeight: 1.45, borderTop: '1px solid #E2E2E2', paddingTop: 8 }}>
                      Regula a relação de parceria sem vínculo exclusivo, regras de verificação KYC, repasses financeiros, taxas da plataforma (Anexo I — a partir de 12% no cartão e regras de saques PIX) e segurança.
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsRegTermsModalOpen(true)}
                      style={{
                        height: 44,
                        borderRadius: 10,
                        border: '1.5px solid #000000',
                        backgroundColor: '#FFFFFF',
                        color: '#000000',
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8
                      }}
                    >
                      <span>Ler contrato completo (34 cláusulas + Anexos)</span>
                    </button>
                  </div>

                  <div
                    role="checkbox"
                    aria-checked={regTermsAccepted}
                    tabIndex={0}
                    onClick={() => {
                      setRegTermsAccepted(!regTermsAccepted);
                      setAuthError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        setRegTermsAccepted(!regTermsAccepted);
                        setAuthError('');
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: '14px',
                      borderRadius: 12,
                      cursor: 'pointer',
                      backgroundColor: regTermsAccepted ? '#F0FDF4' : '#FFFFFF',
                      border: regTermsAccepted ? '2px solid #16A34A' : '1.5px solid #D4D4D4'
                    }}
                  >
                    <span style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      marginTop: 1,
                      flexShrink: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: regTermsAccepted ? '#16A34A' : '#FFFFFF',
                      border: regTermsAccepted ? '2px solid #16A34A' : '2px solid #737373',
                      color: '#FFFFFF',
                      fontSize: '0.82rem',
                      fontWeight: 800
                    }}>
                      {regTermsAccepted ? '✓' : ''}
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: '0.86rem', fontWeight: 600, color: '#000000', lineHeight: 1.4 }}>
                        {DRIVER_TERMS_AFFIRMATIVE_TEXT}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#525252', lineHeight: 1.4 }}>
                        Sua assinatura eletrônica será registrada com data, horário de Brasília, IP de origem e hash criptográfico SHA-256.
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {authError && (
                <div style={{ color: '#C1121F', fontSize: '0.86rem', fontWeight: 500, padding: '10px 12px', backgroundColor: '#FDECEC', borderRadius: 8 }}>
                  {authError}
                </div>
              )}

              {/* Espaço flexível: botão fica embaixo como no app da Uber */}
              <div style={{ flex: 1, minHeight: 12 }} />

              {regStep === REG_TOTAL_STEPS && (
                <>
                  <TurnstileWidget theme="light" onVerify={setTurnstileToken} resetKey={turnstileResetKey} />
                  <div style={{ fontSize: '0.8rem', color: '#6B6B6B', lineHeight: 1.45, textAlign: 'center' }}>
                    Ao continuar, seu contrato assinado eletronicamente será salvo e você seguirá para envio da CNH e selfie ao vivo.
                  </div>
                </>
              )}

              <button type="submit" disabled={isLoadingAuth} style={uPrimaryBtn(isLoadingAuth)}>
                {regStep < REG_TOTAL_STEPS ? 'Continuar' : isLoadingAuth ? 'Assinando e enviando...' : 'Concordar, Assinar e Enviar'}
              </button>

              {regStep === 1 && (
                <button
                  type="button"
                  onClick={() => { setAuthMode('login'); setAuthError(''); }}
                  style={{ background: 'none', border: 'none', color: '#000000', fontSize: '0.92rem', fontWeight: 500, cursor: 'pointer', textDecoration: 'underline', padding: 4 }}
                >
                  Já tenho uma conta
                </button>
              )}
            </form>
          )}
        </main>

        <DriverTermsContractModal
          isOpen={isRegTermsModalOpen}
          onClose={() => setIsRegTermsModalOpen(false)}
          mode="driver"
          config={config}
          draftSigner={{
            name: regName,
            cpf: regDocument,
            phone: regPhone,
            email: regEmail,
            city: regCity,
            vehicle: [regBrand, regModel, regYear].filter(Boolean).join(' '),
            plate: regPlate ? regPlate.toUpperCase() : ''
          }}
          onAccept={() => {
            setRegTermsAccepted(true);
            setAuthError('');
          }}
        />
      </div>
    );
  }

  // 2. TELA DE KYC & AGUARDANDO APROVAÇÃO (TEMA CLEAN ESTILO UBER)
  if (currentDriver.approvalStatus !== 'aprovado' || isLookupOnlySession) {
    const firstName = String(currentDriver.name || '').trim().split(/\s+/)[0] || 'motorista';
    const isApprovedLookup = isLookupOnlySession && currentDriver.approvalStatus === 'aprovado';
    const isCorrection = !isApprovedLookup && currentDriver.approvalStatus === 'correcao_solicitada';
    const isInReview = !isApprovedLookup && currentDriver.approvalStatus === 'em_analise';
    const isRejected = !isApprovedLookup && currentDriver.approvalStatus === 'rejeitado';
    const isPending = !isApprovedLookup && !isCorrection && !isInReview && !isRejected;
    const feedbackMsg = currentDriver.kyc?.adminNotes || currentDriver.kyc?.correctionInstructions || currentDriver.rejectionReason;

    const handleManualStatusRefresh = async () => {
      setIsCheckingStatus(true);
      await loadDriverAndWallet(currentDriver.id);
      setIsCheckingStatus(false);
    };

    const handleProceedToPasswordLogin = () => {
      const idVal = currentDriver.document ? formatCPF(currentDriver.document) : (loginIdentifier || currentDriver.phone || '');
      setLoginIdentifier(idVal);
      setLoginMatchedName(firstName);
      setLoginPassword('');
      setAuthError('');
      setTurnstileResetKey(k => k + 1);
      setLoginStep('password');
      setAuthMode('login');
      setIsLookupOnlySession(false);
      StorageService.setCurrentDriver(null);
      setCurrentDriver(null);
    };

    return (
      <div className="kv-light" style={{
        minHeight: '100dvh',
        backgroundColor: '#FFFFFF',
        color: '#000000',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        {/* Cabeçalho preto igual à tela de KYC */}
        <header style={{
          backgroundColor: '#000000',
          padding: 'calc(14px + env(safe-area-inset-top, 0px)) 20px 14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <img src="/logo-horizontal-white.png" alt="Kavro Drive" style={{ height: 28, width: 'auto', objectFit: 'contain' }} />
          <button
            type="button"
            onClick={handleLogoutDriver}
            aria-label="Sair"
            style={{
              height: 36,
              padding: '0 14px',
              borderRadius: 999,
              border: 'none',
              backgroundColor: 'rgba(255,255,255,0.14)',
              color: '#FFFFFF',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Sair
          </button>
        </header>

        <main style={{
          flex: 1,
          width: '100%',
          maxWidth: 460,
          margin: '0 auto',
          padding: '28px 20px calc(32px + env(safe-area-inset-bottom, 0px)) 20px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {isApprovedLookup ? (
            <>
              <div style={{ display: 'inline-flex', alignSelf: 'flex-start', padding: '5px 12px', borderRadius: 999, backgroundColor: '#DCFCE7', color: '#166534', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em', marginBottom: 14 }}>
                CADASTRO APROVADO
              </div>
              <h1 style={{ fontSize: '1.7rem', fontWeight: 700, lineHeight: 1.2, margin: '0 0 8px 0', color: '#000000', letterSpacing: '-0.02em' }}>
                Sua conta foi aprovada
              </h1>
              <p style={{ fontSize: '0.96rem', color: '#6B6B6B', lineHeight: 1.5, margin: '0 0 24px 0' }}>
                Olá, {firstName}. Agora é só entrar com sua senha cadastrada para ficar online e receber viagens.
              </p>

              {(currentDriver.vehicleBrand || currentDriver.vehiclePlate) && (
                <div style={{ backgroundColor: '#F3F3F3', borderRadius: 12, padding: '14px 16px', marginBottom: 24 }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B6B6B', textTransform: 'uppercase', marginBottom: 4 }}>Veículo cadastrado</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#000000' }}>
                    {currentDriver.vehicleBrand} {currentDriver.vehicleModel} {currentDriver.vehiclePlate ? `• ${currentDriver.vehiclePlate}` : ''}
                  </div>
                </div>
              )}

              <div style={{ flex: 1, minHeight: 16 }} />

              <button
                type="button"
                onClick={handleProceedToPasswordLogin}
                style={{
                  width: '100%', height: 54, borderRadius: 10, border: 'none',
                  backgroundColor: '#000000', color: '#FFFFFF', fontSize: '1rem', fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Entrar com minha senha
              </button>
            </>
          ) : isInReview ? (
            <>
              <div style={{ width: 52, height: 52, borderRadius: '50%', backgroundColor: '#F3F3F3', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Clock size={24} color="#000000" />
              </div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6B6B6B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                EM ANÁLISE
              </div>
              <h1 style={{ fontSize: '1.7rem', fontWeight: 700, lineHeight: 1.2, margin: '0 0 10px 0', color: '#000000', letterSpacing: '-0.02em' }}>
                Seu cadastro está em análise
              </h1>
              <p style={{ fontSize: '0.96rem', color: '#6B6B6B', lineHeight: 1.5, margin: '0 0 24px 0' }}>
                Olá, {firstName}. Recebemos seus documentos e nossa equipe já está revisando seu perfil.
              </p>

              <div style={{ backgroundColor: '#F3F3F3', borderRadius: 12, padding: '16px', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CheckCircle2 size={18} color="#000000" />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#000000' }}>CNH e selfie enviadas com sucesso</span>
                </div>
                {currentDriver.termsSignature?.signed && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <CheckCircle2 size={18} color="#15803D" />
                    <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#15803D' }}>
                      Termo assinado ({currentDriver.termsSignature.validationCode})
                    </span>
                  </div>
                )}
                {(currentDriver.vehicleBrand || currentDriver.vehiclePlate) && (
                  <div style={{ fontSize: '0.84rem', color: '#545454', paddingLeft: 28 }}>
                    Veículo: {currentDriver.vehicleBrand} {currentDriver.vehicleModel} {currentDriver.vehiclePlate ? `• ${currentDriver.vehiclePlate}` : ''}
                  </div>
                )}
                <div style={{ fontSize: '0.82rem', color: '#6B6B6B', paddingLeft: 28, lineHeight: 1.45 }}>
                  Você pode fechar o app. Na próxima vez, basta digitar seu CPF para acompanhar ou entrar.
                </div>
              </div>

              <div style={{ flex: 1, minHeight: 16 }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  type="button"
                  onClick={handleManualStatusRefresh}
                  disabled={isCheckingStatus}
                  style={{
                    width: '100%', height: 54, borderRadius: 10, border: 'none',
                    backgroundColor: '#000000', color: '#FFFFFF', fontSize: '1rem', fontWeight: 600,
                    cursor: isCheckingStatus ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                  }}
                >
                  <RefreshCw size={17} />
                  <span>{isCheckingStatus ? 'Consultando...' : 'Atualizar status'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsKycModalOpen(true)}
                  style={{
                    width: '100%', height: 48, borderRadius: 10, border: 'none',
                    backgroundColor: '#F3F3F3', color: '#000000', fontSize: '0.92rem', fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Reenviar documentos
                </button>
                {currentDriver.termsSignature?.signed && (
                  <button
                    type="button"
                    onClick={() => setIsDriverSignedContractOpen(true)}
                    style={{
                      width: '100%', height: 46, borderRadius: 10, border: '1px solid #E2E8F0',
                      backgroundColor: '#FFFFFF', color: '#15803D', fontSize: '0.86rem', fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Ver Termo Assinado ({currentDriver.termsSignature.validationCode})
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div style={{
                display: 'inline-flex', alignSelf: 'flex-start', padding: '5px 12px', borderRadius: 999,
                backgroundColor: isCorrection ? '#FEF3C7' : isRejected ? '#FDECEC' : '#F3F3F3',
                color: isCorrection ? '#92400E' : isRejected ? '#C1121F' : '#000000',
                fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 12
              }}>
                {isCorrection ? 'CORREÇÃO SOLICITADA' : isRejected ? 'NÃO APROVADO' : 'DOCUMENTOS'}
              </div>

              <h1 style={{ fontSize: '1.7rem', fontWeight: 700, lineHeight: 1.2, margin: '0 0 8px 0', color: '#000000', letterSpacing: '-0.02em' }}>
                {isCorrection ? 'Envie seus documentos novamente' : isRejected ? 'Cadastro não aprovado' : 'Falta validar sua conta'}
              </h1>
              <p style={{ fontSize: '0.96rem', color: '#6B6B6B', lineHeight: 1.5, margin: '0 0 24px 0' }}>
                {isCorrection
                  ? `Olá, ${firstName}. Precisamos de uma nova foto mais nítida para concluir a análise.`
                  : isRejected
                    ? `Olá, ${firstName}. Não foi possível aprovar os documentos anteriores.`
                    : `Olá, ${firstName}. São só 2 passos rápidos para enviar sua conta para análise.`}
              </p>

              {(isCorrection || isRejected) && feedbackMsg && (
                <div style={{
                  backgroundColor: isRejected ? '#FDECEC' : '#FEF3C7',
                  borderRadius: 12,
                  padding: '14px 16px',
                  marginBottom: 20,
                  fontSize: '0.88rem',
                  color: isRejected ? '#991B1B' : '#78350F',
                  lineHeight: 1.45
                }}>
                  <strong>Observação:</strong> {feedbackMsg}
                </div>
              )}

              {isPending && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                  {[
                    { num: '1', title: 'Foto da CNH', desc: 'Foto nítida da CNH ou PDF digital' },
                    { num: '2', title: 'Selfie ao vivo', desc: 'Captura rápida pela câmera do aparelho' }
                  ].map(step => (
                    <div key={step.num} style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      backgroundColor: '#F3F3F3', borderRadius: 12, padding: '14px 16px'
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', backgroundColor: '#000000', color: '#FFFFFF',
                        fontSize: '0.88rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                      }}>
                        {step.num}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.96rem', fontWeight: 600, color: '#000000' }}>{step.title}</div>
                        <div style={{ fontSize: '0.8rem', color: '#6B6B6B', marginTop: 2 }}>{step.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ flex: 1, minHeight: 16 }} />

              <button
                type="button"
                onClick={() => setIsKycModalOpen(true)}
                style={{
                  width: '100%', height: 54, borderRadius: 10, border: 'none',
                  backgroundColor: '#000000', color: '#FFFFFF', fontSize: '1rem', fontWeight: 600,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                }}
              >
                <Camera size={18} />
                <span>{isCorrection || isRejected ? 'Reenviar documentos' : 'Fazer verificação'}</span>
              </button>
              {currentDriver.termsSignature?.signed && (
                <button
                  type="button"
                  onClick={() => setIsDriverSignedContractOpen(true)}
                  style={{
                    width: '100%', height: 46, borderRadius: 10, border: '1px solid #E2E8F0',
                    backgroundColor: '#FFFFFF', color: '#15803D', fontSize: '0.86rem', fontWeight: 600,
                    cursor: 'pointer', marginTop: 10
                  }}
                >
                  Ver Termo Assinado ({currentDriver.termsSignature.validationCode})
                </button>
              )}
            </>
          )}
        </main>

        {/* Modal de KYC do Motorista */}
        <DriverKycVerificationModal
          driver={currentDriver}
          config={config}
          isOpen={isKycModalOpen}
          onClose={() => setIsKycModalOpen(false)}
          onSuccess={(updated) => {
            setCurrentDriver(updated);
            if (!isLookupOnlySession) {
              StorageService.setCurrentDriver(updated);
            }
            setIsKycModalOpen(false);
          }}
          correctionInstructions={currentDriver.kyc?.adminNotes}
        />

        <DriverTermsContractModal
          isOpen={isDriverSignedContractOpen}
          onClose={() => setIsDriverSignedContractOpen(false)}
          mode="driver"
          config={config}
          driver={currentDriver}
        />
      </div>
    );
  }

  // 3. ESTADOS DA OPERAÇÃO DO MOTORISTA APROVADO
  const driverCatEval = evaluateAllDriverCategories(currentDriver, platformCategories);

  const activeRide = rides.find(
    r => r.driverId === currentDriver.id &&
      (r.status === 'a_caminho' || r.status === 'no_local' || r.status === 'em_andamento')
  );

  // Chamada de radar tocando agora (Uber Incoming Modal)
  const incomingRide = currentDriver.isOnline
    ? rides.find(r => {
        if (r.status !== 'aguardando_confirmacao') return false;
        if ((r.declinedDriverIds || []).includes(currentDriver.id)) return false;
        const rideCat = mapLegacyCategoryId(r.category);
        return driverCatEval.enabledCategoryIds.includes(rideCat);
      }) || null
    : null;

  const completedRides = rides.filter(
    r => r.driverId === currentDriver.id && (r.status === 'finalizada' || r.status === 'cancelada')
  );

  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: '#000000',
      color: '#FFFFFF',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* =========================================================================
          MAPA VETORIAL ESCURO ESTILIZADO UBER DRIVER COM PONTOS DE PREÇO DINÂMICO
         ========================================================================= */}
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#0B1118',
        zIndex: 1,
        backgroundImage: `
          radial-gradient(circle at 50% 50%, rgba(30, 41, 59, 0.4) 0%, #000000 100%),
          linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: '100% 100%, 40px 40px, 40px 40px',
        pointerEvents: 'none'
      }}>
        {/* Ilhas de Calor Rosa/Roxa Preço Dinâmico estilo Uber Driver */}
        <div style={{
          position: 'absolute',
          top: '25%',
          left: '15%',
          width: 220,
          height: 220,
          borderRadius: '50%',
          backgroundColor: 'rgba(217, 70, 239, 0.14)',
          filter: 'blur(40px)'
        }} />
        <div style={{
          position: 'absolute',
          top: '45%',
          right: '10%',
          width: 260,
          height: 260,
          borderRadius: '50%',
          backgroundColor: 'rgba(168, 85, 247, 0.16)',
          filter: 'blur(50px)'
        }} />

        {/* Badges de Preço Dinâmico espalhadas pelo mapa estilo Uber Driver */}
        <div style={{
          position: 'absolute',
          top: '32%',
          left: '22%',
          backgroundColor: '#86198F',
          color: '#FFFFFF',
          padding: '4px 10px',
          borderRadius: 20,
          fontSize: '0.78rem',
          fontWeight: 800,
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }}>
          <span>+R$ 4,50</span>
        </div>

        <div style={{
          position: 'absolute',
          top: '42%',
          right: '25%',
          backgroundColor: '#86198F',
          color: '#FFFFFF',
          padding: '4px 10px',
          borderRadius: 20,
          fontSize: '0.78rem',
          fontWeight: 800,
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
        }}>
          <span>+R$ 3,25</span>
        </div>

        <div style={{
          position: 'absolute',
          top: '55%',
          left: '28%',
          backgroundColor: '#701A75',
          color: '#FFFFFF',
          padding: '4px 10px',
          borderRadius: 20,
          fontSize: '0.78rem',
          fontWeight: 800,
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
        }}>
          <span>+R$ 2,00</span>
        </div>

        {/* Marcador do Veículo do Motorista no Centro */}
        <div style={{
          position: 'absolute',
          top: '48%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4
        }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            backgroundColor: '#0F172A',
            border: '3px solid #22C55E',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px rgba(34, 197, 94, 0.6)'
          }}>
            <Navigation size={22} fill="#22C55E" color="#22C55E" style={{ transform: 'rotate(45deg)' }} />
          </div>
          <div style={{
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            padding: '2px 8px',
            borderRadius: 8,
            fontSize: '0.68rem',
            fontWeight: 800,
            color: '#E2E8F0',
            border: '1px solid #334155'
          }}>
            {(currentDriver.name || 'Motorista').split(' ')[0]}
          </div>
        </div>
      </div>

      {/* =========================================================================
          BARRA DE TOPO FLUTUANTE ESTILO UBER DRIVER
          [ ≡ Menu ]     [ R$ 0,00 Ganhos do Dia ]     [ 🔍 Busca ]
         ========================================================================= */}
      <header style={{
        position: 'fixed',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 480,
        zIndex: 50,
        padding: 'calc(14px + env(safe-area-inset-top, 0px)) 16px 0 16px',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        pointerEvents: 'none'
      }}>
        {/* Botão Hamburger ≡ */}
        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          style={{
            width: 46,
            height: 46,
            borderRadius: '50%',
            backgroundColor: '#161F28',
            border: '1px solid #283544',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
            cursor: 'pointer',
            pointerEvents: 'auto'
          }}
        >
          <Menu size={22} />
        </button>

        {/* Pílula Central de Ganhos estilo Uber Driver */}
        <button
          type="button"
          onClick={() => setActiveTab('ganhos')}
          style={{
            height: 46,
            padding: '0 20px',
            borderRadius: 24,
            backgroundColor: '#161F28',
            border: '1px solid #283544',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
            cursor: 'pointer',
            pointerEvents: 'auto'
          }}
        >
          <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#22C55E' }}>
            R$ {(wallet?.availableBalance || 0).toFixed(2).replace('.', ',')}
          </span>
        </button>

        {/* Botão de Busca / Preferências 🔍 */}
        <button
          type="button"
          onClick={() => setIsPreferencesOpen(true)}
          style={{
            width: 46,
            height: 46,
            borderRadius: '50%',
            backgroundColor: '#161F28',
            border: '1px solid #283544',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
            cursor: 'pointer',
            pointerEvents: 'auto'
          }}
        >
          <Sliders size={20} />
        </button>
      </header>

      {/* =========================================================================
          BOTÃO CENTRAL INICIAR / PARAR (QUANDO OFFLINE OU ONLINE NO MAPA)
         ========================================================================= */}
      {!activeRide && activeTab === 'radar' && (
        <div style={{
          position: 'fixed',
          top: '60%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 40,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          pointerEvents: 'none'
        }}>
          {!currentDriver.isOnline ? (
            <button
              type="button"
              onClick={handleToggleOnline}
              style={{
                width: 90,
                height: 90,
                borderRadius: '50%',
                backgroundColor: '#0284C7', // Azul petróleo estilo Uber Driver
                color: '#FFFFFF',
                border: '4px solid rgba(255,255,255,0.2)',
                boxShadow: '0 0 35px rgba(2, 132, 199, 0.7)',
                fontSize: '1rem',
                fontWeight: 900,
                letterSpacing: '0.04em',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'auto',
                transition: 'transform 0.15s ease'
              }}
            >
              INICIAR
            </button>
          ) : (
            <button
              type="button"
              onClick={handleToggleOnline}
              style={{
                width: 82,
                height: 82,
                borderRadius: '50%',
                backgroundColor: '#DC2626',
                color: '#FFFFFF',
                border: '4px solid rgba(255,255,255,0.2)',
                boxShadow: '0 0 30px rgba(220, 38, 38, 0.6)',
                fontSize: '0.9rem',
                fontWeight: 900,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'auto'
              }}
            >
              PARAR
            </button>
          )}
        </div>
      )}

      {/* =========================================================================
          BOTTOM SHEET QUANDO OFFLINE OU ONLINE PROCURANDO VIAGENS
         ========================================================================= */}
      {!activeRide && activeTab === 'radar' && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: 480,
          zIndex: 45,
          padding: '0 12px calc(14px + env(safe-area-inset-bottom, 0px)) 12px',
          boxSizing: 'border-box'
        }}>
          <div style={{
            backgroundColor: '#161F28',
            borderRadius: 22,
            border: '1px solid #283544',
            padding: '16px 18px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                backgroundColor: currentDriver.isOnline ? '#22C55E' : '#64748B'
              }} />
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 900, color: '#FFFFFF' }}>
                  {currentDriver.isOnline ? 'Próxima viagem: +R$ 1,50' : 'Você está offline'}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>
                  {currentDriver.isOnline ? 'Preço dinâmico ativo na região' : 'Fique online para receber solicitações'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsPreferencesOpen(true)}
              style={{
                padding: '8px 14px',
                borderRadius: 20,
                backgroundColor: '#232E3B',
                border: '1px solid #334155',
                color: '#FFFFFF',
                fontSize: '0.78rem',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              Filtros
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          CORRIDA ATIVA (CARD INFERIOR PRINT 2 DO USUÁRIO)
         ========================================================================= */}
      {activeRide && (
        <DriverActiveRideCard
          ride={activeRide}
          config={config}
          onOpenChat={() => setIsChatOpen(true)}
          onOpenGps={() => setIsGpsOpen(true)}
          onStartTrip={() => handleStartTrip(activeRide)}
          onInitiateComplete={() => handleInitiateCompleteRide(activeRide)}
        />
      )}

      {/* =========================================================================
          MODAL DE CHAMADA TOCANDO (BOTTOM SHEET INCOMING RIDE ESTILO UBER)
         ========================================================================= */}
      {incomingRide && !activeRide && (
        <DriverIncomingRideModal
          ride={incomingRide}
          config={config}
          onAccept={handleAcceptRide}
          onDecline={handleDeclineRide}
        />
      )}

      {/* =========================================================================
          TELAS SECUNDÁRIAS: GANHOS, CARTEIRA, PERFIL
         ========================================================================= */}
      {activeTab !== 'radar' && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: '#0F172A',
          zIndex: 60,
          overflowY: 'auto',
          padding: 'calc(16px + env(safe-area-inset-top, 0px)) 16px calc(24px + env(safe-area-inset-bottom, 0px)) 16px',
          boxSizing: 'border-box'
        }}>
          {/* Top Header com Voltar ao Mapa */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20
          }}>
            <button
              type="button"
              onClick={() => setActiveTab('radar')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'none',
                border: 'none',
                color: '#60A5FA',
                fontSize: '0.94rem',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              ← Voltar ao Mapa
            </button>

            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#94A3B8' }}>
              {activeTab === 'ganhos' ? 'Ganhos Semanais' : activeTab === 'carteira' ? 'Carteira PIX' : 'Perfil do Motorista'}
            </span>
          </div>

          {/* TAB GANHOS ESTILO UBER */}
          {activeTab === 'ganhos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Card Semanal */}
              <div style={{
                backgroundColor: '#1E293B',
                borderRadius: 20,
                padding: '20px',
                border: '1px solid #334155'
              }}>
                <div style={{ fontSize: '0.8rem', color: '#94A3B8', fontWeight: 700 }}>
                  Ganhos desta semana
                </div>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#22C55E', letterSpacing: '-0.03em', margin: '6px 0' }}>
                  R$ {(wallet?.totalNetEarnings || 0).toFixed(2).replace('.', ',')}
                </div>
                <div style={{ fontSize: '0.82rem', color: '#CBD5E1' }}>
                  {completedRides.length} viagens concluídas • 100% repassado
                </div>

                {/* Dias da Semana estilo Uber (S T Q Q S S D) */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: 20,
                  paddingTop: 16,
                  borderTop: '1px solid #334155'
                }}>
                  {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((day, idx) => (
                    <div key={idx} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.74rem', color: '#94A3B8', fontWeight: 800 }}>{day}</div>
                      <div style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        backgroundColor: idx === 2 ? '#2563EB' : 'transparent',
                        color: '#FFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        margin: '6px auto 0 auto'
                      }}>
                        {11 + idx}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Botão de Transferência Imediata */}
              <button
                type="button"
                onClick={() => {
                  setWithdrawPixKey(currentDriver.pixKey || '');
                  setWithdrawError('');
                  setIsWithdrawModalOpen(true);
                }}
                style={{
                  width: '100%',
                  height: 50,
                  borderRadius: 14,
                  backgroundColor: '#22C55E',
                  color: '#121A21',
                  border: 'none',
                  fontSize: '1rem',
                  fontWeight: 900,
                  cursor: 'pointer'
                }}
              >
                Transferir Saldo via PIX
              </button>
            </div>
          )}

          {/* TAB CARTEIRA */}
          {activeTab === 'carteira' && wallet && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{
                backgroundColor: '#1E293B',
                borderRadius: 20,
                padding: '20px',
                border: '1px solid #334155'
              }}>
                <div style={{ fontSize: '0.78rem', color: '#94A3B8', fontWeight: 800 }}>SALDO DISPONÍVEL</div>
                <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#22C55E', margin: '4px 0' }}>
                  R$ {wallet.availableBalance.toFixed(2).replace('.', ',')}
                </div>
                <div style={{ fontSize: '0.82rem', color: currentDriver.pixKey ? '#94A3B8' : '#FBBF24' }}>
                  {currentDriver.pixKey
                    ? `Chave PIX: ${currentDriver.pixKey} (${currentDriver.pixType || 'cpf'})`
                    : 'Chave PIX ainda não cadastrada — configure abaixo para receber seus saques.'}
                </div>
              </div>

              {/* Cadastro / Edição de Chave PIX após aprovação */}
              <form onSubmit={handleSavePixKey} style={{
                backgroundColor: '#1E293B',
                borderRadius: 20,
                padding: '18px 20px',
                border: '1px solid #334155',
                display: 'flex',
                flexDirection: 'column',
                gap: 12
              }}>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#FFFFFF' }}>
                  Chave PIX para Recebimentos
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {([
                    { id: 'cpf', label: 'CPF' },
                    { id: 'cnpj', label: 'CNPJ' },
                    { id: 'telefone', label: 'Celular' },
                    { id: 'email', label: 'E-mail' },
                    { id: 'aleatoria', label: 'Aleatória' }
                  ] as const).map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setPixEditType(opt.id);
                        if (opt.id === 'cpf' && currentDriver.document) setPixEditKey(formatCPF(currentDriver.document));
                        else if (opt.id === 'telefone' && currentDriver.phone) setPixEditKey(formatPhone(currentDriver.phone));
                        else if (opt.id === 'email' && currentDriver.email) setPixEditKey(currentDriver.email);
                      }}
                      style={{
                        padding: '7px 12px',
                        borderRadius: 999,
                        border: pixEditType === opt.id ? '1.5px solid #22C55E' : '1px solid #475569',
                        backgroundColor: pixEditType === opt.id ? 'rgba(34,197,94,0.16)' : '#0F172A',
                        color: pixEditType === opt.id ? '#4ADE80' : '#CBD5E1',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Digite sua chave PIX"
                  value={pixEditKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (pixEditType === 'cpf') setPixEditKey(formatCPF(val));
                    else if (pixEditType === 'telefone') setPixEditKey(formatPhone(val));
                    else setPixEditKey(val);
                  }}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 10,
                    border: '1px solid #475569', backgroundColor: '#0F172A', color: '#FFFFFF', fontSize: '0.9rem'
                  }}
                />
                <input
                  type="text"
                  placeholder="Banco (opcional)"
                  value={pixEditBank}
                  onChange={(e) => setPixEditBank(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 10,
                    border: '1px solid #475569', backgroundColor: '#0F172A', color: '#FFFFFF', fontSize: '0.9rem'
                  }}
                />
                {pixSaveNotice && (
                  <div style={{ fontSize: '0.8rem', color: pixSaveNotice.includes('sucesso') ? '#4ADE80' : '#F87171', fontWeight: 600 }}>
                    {pixSaveNotice}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={isSavingPix}
                  style={{
                    width: '100%', height: 44, borderRadius: 10, border: 'none',
                    backgroundColor: '#22C55E', color: '#0F172A', fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer'
                  }}
                >
                  {isSavingPix ? 'Salvando...' : 'Salvar Chave PIX'}
                </button>
              </form>

              {wallet.debtBalance > 0 && (
                <div style={{
                  backgroundColor: '#FEF2F2',
                  border: '1.5px solid #EF4444',
                  borderRadius: 16,
                  padding: '14px',
                  color: '#991B1B'
                }}>
                  <div style={{ fontWeight: 900, fontSize: '0.9rem', marginBottom: 4 }}>
                    Dívida de Comissões em Dinheiro: R$ {wallet.debtBalance.toFixed(2).replace('.', ',')}
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenDebtPixModal}
                    style={{
                      marginTop: 8,
                      padding: '8px 14px',
                      borderRadius: 10,
                      backgroundColor: '#DC2626',
                      color: '#FFF',
                      border: 'none',
                      fontWeight: 800,
                      fontSize: '0.78rem',
                      cursor: 'pointer'
                    }}
                  >
                    Quitar via PIX
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB PERFIL */}
          {activeTab === 'perfil' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{
                backgroundColor: '#1E293B',
                borderRadius: 20,
                padding: '20px',
                border: '1px solid #334155',
                textAlign: 'center'
              }}>
                <div style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  backgroundColor: '#0F172A',
                  border: '3px solid #76D800',
                  margin: '0 auto 12px auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                  fontWeight: 900,
                  color: '#76D800'
                }}>
                  {(currentDriver.name || 'M').charAt(0).toUpperCase()}
                </div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '1.2rem', fontWeight: 900 }}>{currentDriver.name || 'Motorista'}</h3>
                <div style={{ fontSize: '0.84rem', color: '#94A3B8' }}>
                  {currentDriver.vehicleBrand} {currentDriver.vehicleModel} • {currentDriver.vehiclePlate}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 8, color: '#EAB308', fontWeight: 800 }}>
                  <Star size={16} fill="#EAB308" />
                  <span>{(currentDriver.rating || 4.96).toFixed(2)} Avaliação</span>
                </div>
              </div>

              {/* Card de Verificação KYC e Biometria */}
              <div style={{
                backgroundColor: '#1E293B',
                borderRadius: 20,
                padding: '18px',
                border: '1px solid #334155'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ShieldCheck size={20} color="#76D800" />
                    <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#FFFFFF' }}>Identidade & Biometria KYC</span>
                  </div>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    backgroundColor: 'rgba(118, 216, 0, 0.15)',
                    color: '#76D800'
                  }}>
                    Aprovado
                  </span>
                </div>

                <div style={{ fontSize: '0.78rem', color: '#94A3B8', lineHeight: 1.45, marginBottom: 14 }}>
                  Sua identidade foi conferida via modelo open source Human Biometrics comparando CNH e selfie facial.
                  {currentDriver.kyc?.biometricResult && (
                    <strong style={{ color: '#E2E8F0', display: 'block', marginTop: 4 }}>
                      Índice de similaridade registrado: {currentDriver.kyc.biometricResult.similarityScore ?? currentDriver.kyc.biometricResult.similarity ?? 0}%
                    </strong>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIsKycModalOpen(true)}
                  style={{
                    width: '100%',
                    padding: '11px',
                    borderRadius: 12,
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    color: '#FFFFFF',
                    border: '1px solid #475569',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <Eye size={14} />
                  <span>Visualizar CNH & Selfie KYC</span>
                </button>
              </div>

              {/* Card Termos de Uso & Assinatura Eletrônica */}
              <div style={{
                backgroundColor: '#1E293B',
                borderRadius: 20,
                padding: '18px',
                border: '1px solid #334155',
                marginTop: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ShieldCheck size={20} color="#76D800" />
                    <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#FFFFFF' }}>Termos & Contrato Digital</span>
                  </div>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    backgroundColor: currentDriver.termsSignature?.signed ? 'rgba(118, 216, 0, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                    color: currentDriver.termsSignature?.signed ? '#76D800' : '#FACC15'
                  }}>
                    {currentDriver.termsSignature?.signed ? 'Assinado' : `Versão ${DRIVER_TERMS_CONTRACT_VERSION}`}
                  </span>
                </div>

                {currentDriver.termsSignature?.signed ? (
                  <div style={{ fontSize: '0.78rem', color: '#94A3B8', lineHeight: 1.5, marginBottom: 12 }}>
                    Assinado eletronicamente em <strong style={{ color: '#E2E8F0' }}>{currentDriver.termsSignature.signedAtBrasilia}</strong>.
                    <div style={{ fontFamily: 'monospace', fontSize: '0.74rem', color: '#76D800', marginTop: 4 }}>
                      Código: {currentDriver.termsSignature.validationCode}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.78rem', color: '#94A3B8', lineHeight: 1.5, marginBottom: 12 }}>
                    Instrumento contratual de Motorista Parceiro Kavro Drive ({DRIVER_TERMS_CONTRACT_ID}).
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setIsDriverSignedContractOpen(true)}
                  style={{
                    width: '100%',
                    padding: '11px',
                    borderRadius: 12,
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    color: '#FFFFFF',
                    border: '1px solid #475569',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <Eye size={14} />
                  <span>
                    {currentDriver.termsSignature?.signed
                      ? `Ver Termo Assinado (${currentDriver.termsSignature.validationCode})`
                      : 'Visualizar Termos e Condições'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          MODAIS AUXILIARES
         ========================================================================= */}
      {/* 1. Menu Gaveta Lateral */}
      <DriverDrawerMenu
        isOpen={isDrawerOpen}
        driver={currentDriver}
        onClose={() => setIsDrawerOpen(false)}
        onSelectTab={(tab) => setActiveTab(tab)}
        onOpenPreferences={() => setIsPreferencesOpen(true)}
        onLogout={handleLogoutDriver}
      />

      {/* 2. Preferências da Viagem (Print 1 do usuário) */}
      <DriverPreferencesModal
        isOpen={isPreferencesOpen}
        currentDriver={currentDriver}
        config={config}
        onClose={() => setIsPreferencesOpen(false)}
        onToggleAcceptCash={handleToggleAcceptCash}
        onToggleCategory={handleToggleCategoryReceive}
      />

      {/* 3. Chat Oficial com o Passageiro (Print 3 do usuário) */}
      {activeRide && (
        <DriverChatModal
          isOpen={isChatOpen}
          ride={activeRide}
          driverName={currentDriver.name}
          onClose={() => setIsChatOpen(false)}
        />
      )}

      {/* 4. Navegador GPS em Tela Cheia */}
      {isGpsOpen && activeRide && (
        <LiveGpsNavigationScreen
          ride={activeRide}
          isOpen={true}
          userRole="driver"
          config={config}
          onClose={() => setIsGpsOpen(false)}
          onUpdateStatus={(_rideId, newStatus) => {
            if (newStatus === 'finalizada') {
              setIsGpsOpen(false);
              handleInitiateCompleteRide(activeRide);
              return;
            }
            fetch(`/api/rides/${encodeURIComponent(activeRide.id)}/status`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: newStatus })
            }).then(() => {
              StorageService.syncFromDatabase().then(refreshData);
            });
          }}
        />
      )}

      {/* 5. Modal de Confirmação de Recebimento em Dinheiro */}
      {cashCompleteRide && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          zIndex: 100000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16
        }}>
          <div style={{
            backgroundColor: '#1E293B',
            borderRadius: 24,
            padding: 22,
            width: '100%',
            maxWidth: 400,
            border: '1px solid #334155'
          }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.2rem', fontWeight: 900 }}>
              Cobrar do Passageiro: R$ {cashCompleteRide.totalPrice.toFixed(2).replace('.', ',')}
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: 14, lineHeight: 1.45 }}>
              Receba o dinheiro em mãos do passageiro. A comissão de{' '}
              <strong style={{ color: '#F8FAFC' }}>{cashCompleteRide.commissionPercent ?? 20}%</strong>{' '}
              (R$ {((cashCompleteRide.totalPrice * (cashCompleteRide.commissionPercent ?? 20)) / 100).toFixed(2).replace('.', ',')})
              será descontada automaticamente do seu Saldo Livre; caso não haja saldo suficiente, a diferença entra no seu Saldo Devedor.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setCashCompleteRide(null)}
                style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid #475569', backgroundColor: 'transparent', color: '#FFF' }}
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmCashCompletion}
                style={{ flex: 1, padding: '12px', borderRadius: 12, backgroundColor: '#22C55E', color: '#121A21', border: 'none', fontWeight: 900 }}
              >
                Confirmar Recebimento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Modal de Saque PIX */}
      {isWithdrawModalOpen && wallet && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          zIndex: 100000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16
        }}>
          <div style={{
            backgroundColor: '#1E293B',
            borderRadius: 24,
            padding: 22,
            width: '100%',
            maxWidth: 400,
            border: '1px solid #334155'
          }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.2rem', fontWeight: 900 }}>
              Solicitar Saque PIX
            </h3>
            <div style={{ fontSize: '0.84rem', color: '#94A3B8', marginBottom: 14 }}>
              Saldo Disponível: <strong style={{ color: '#22C55E' }}>R$ {wallet.availableBalance.toFixed(2).replace('.', ',')}</strong>
            </div>
            <form onSubmit={handleRequestWithdrawal} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                type="text"
                placeholder="Valor (R$)"
                value={withdrawAmountStr}
                onChange={(e) => setWithdrawAmountStr(e.target.value)}
                required
                style={{ padding: '12px', borderRadius: 12, border: '1px solid #475569', backgroundColor: '#0F172A', color: '#FFF' }}
              />
              <input
                type="text"
                placeholder="Chave PIX"
                value={withdrawPixKey || currentDriver.pixKey}
                onChange={(e) => setWithdrawPixKey(e.target.value)}
                required
                style={{ padding: '12px', borderRadius: 12, border: '1px solid #475569', backgroundColor: '#0F172A', color: '#FFF' }}
              />
              {withdrawError && <div style={{ color: '#F87171', fontSize: '0.78rem' }}>{withdrawError}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setIsWithdrawModalOpen(false)}
                  style={{ padding: '12px', borderRadius: 12, border: '1px solid #475569', backgroundColor: 'transparent', color: '#FFF' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isRequestingWithdraw}
                  style={{ flex: 1, padding: '12px', borderRadius: 12, backgroundColor: '#22C55E', color: '#121A21', border: 'none', fontWeight: 900 }}
                >
                  Confirmar Saque
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Modal de Quitação de Dívida PIX */}
      {debtPixModalData && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.85)',
          zIndex: 100000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16
        }}>
          <div style={{
            backgroundColor: '#1E293B',
            borderRadius: 24,
            padding: 22,
            width: '100%',
            maxWidth: 380,
            textAlign: 'center',
            border: '1px solid #334155'
          }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.2rem', fontWeight: 900 }}>Quitar Saldo Devedor</h3>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#EF4444', margin: '8px 0' }}>
              R$ {debtPixModalData.amount.toFixed(2).replace('.', ',')}
            </div>
            <img
              src={debtPixModalData.pixQrCode}
              alt="QR Code PIX"
              style={{ width: 180, height: 180, margin: '0 auto 12px auto', borderRadius: 12, border: '2px solid #334155' }}
            />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(debtPixModalData.pixCopyPaste);
                setCopiedDebtPix(true);
                setTimeout(() => setCopiedDebtPix(false), 2000);
              }}
              style={{ width: '100%', padding: '12px', borderRadius: 12, backgroundColor: '#0F172A', color: '#FFF', border: '1px solid #334155', fontWeight: 800, marginBottom: 8 }}
            >
              {copiedDebtPix ? 'Copiado!' : 'Copiar Código PIX'}
            </button>
            <button
              type="button"
              onClick={handleSimulateDebtPixWebhook}
              disabled={isSimulatingDebtWebhook}
              style={{ width: '100%', padding: '12px', borderRadius: 12, backgroundColor: '#22C55E', color: '#121A21', border: 'none', fontWeight: 900, marginBottom: 8 }}
            >
              {isSimulatingDebtWebhook ? 'Confirmando...' : '⚡ Confirmar Pagamento'}
            </button>
            <button
              type="button"
              onClick={() => setDebtPixModalData(null)}
              style={{ background: 'none', border: 'none', color: '#94A3B8', fontWeight: 700 }}
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Modal de KYC do Motorista Aprovado / Consulta */}
      {currentDriver && (
        <DriverKycVerificationModal
          driver={currentDriver}
          config={config}
          isOpen={isKycModalOpen}
          onClose={() => setIsKycModalOpen(false)}
          onSuccess={(updated) => {
            setCurrentDriver(updated);
            StorageService.setCurrentDriver(updated);
            setIsKycModalOpen(false);
          }}
          correctionInstructions={currentDriver.kyc?.adminNotes}
        />
      )}

      {currentDriver && (
        <DriverTermsContractModal
          isOpen={isDriverSignedContractOpen}
          onClose={() => setIsDriverSignedContractOpen(false)}
          mode="driver"
          config={config}
          driver={currentDriver}
        />
      )}

      {currentDriver && (
        <PushPermissionPrompt
          role="motorista"
          externalId={driverExternalId(currentDriver.id, currentDriver.phone) || null}
        />
      )}
    </div>
  );
};
