import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu, Search, Power, Navigation, Phone, MessageSquare,
  Shield, DollarSign, Wallet, Star, Clock, Car, ChevronRight,
  TrendingUp, ArrowUpRight, Check, X, AlertTriangle, User,
  Calendar, Award, Banknote, QrCode, Copy, RefreshCw, LogOut,
  Sliders, Zap, ShieldCheck, Camera, CheckCircle2, XCircle, FileText, Eye,
  BarChart2, Compass, List
} from 'lucide-react';
import { DriverProfile, DriverVehicle, DriverWalletSummary, Ride, SystemConfig } from '../types';
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
  POPULAR_CAR_COLORS,
  detectVehicleFromDescription,
  resolveVehiclePhotoExact
} from '../services/vehicleService';
import { VehiclePhotoPreview } from '../components/VehiclePhotoPreview';
import { DriverChatModal } from '../components/DriverChatModal';
import { DriverPreferencesModal } from '../components/DriverPreferencesModal';
import { compressDataUrlForUpload } from '../utils/imageCompression';
import { DriverIncomingRideModal } from '../components/DriverIncomingRideModal';
import { DriverActiveRideCard } from '../components/DriverActiveRideCard';
import { DriverDrawerMenu } from '../components/DriverDrawerMenu';
import { DriverSecondaryTabs } from '../components/DriverSecondaryTabs';
import { DriverHomeMap, RouteStepSummary } from '../components/DriverHomeMap';
import { SosEmergencyModal } from '../components/SosEmergencyModal';
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

const StartModalVehicleThumb: React.FC<{
  brand?: string;
  model?: string;
  year?: string;
  color?: string;
  photoUrl?: string;
}> = ({ brand, model, year, color, photoUrl }) => {
  const [src, setSrc] = useState<string>(photoUrl || '/vehicles/kavro-sedan-ev.jpg');

  useEffect(() => {
    if (photoUrl) {
      setSrc(photoUrl);
      return;
    }
    if (!brand && !model) return;
    let active = true;
    resolveVehiclePhotoExact({ brand, model, year, color })
      .then((res) => {
        if (active && res?.photoUrl) setSrc(res.photoUrl);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [brand, model, year, color, photoUrl]);

  return (
    <img
      src={src}
      alt={`${brand || ''} ${model || ''}`.trim() || 'Veículo'}
      onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/vehicles/kavro-sedan-ev.jpg'; }}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  );
};

export const DriverPortalScreen: React.FC<DriverPortalScreenProps> = ({
  rides,
  config,
  refreshData
}) => {
  const navigate = useNavigate();
  const [currentDriver, setCurrentDriver] = useState<DriverProfile | null>(() => StorageService.getCurrentDriver());
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [activeTab, setActiveTab] = useState<'radar' | 'ganhos' | 'carteira' | 'veiculos' | 'perfil'>('radar');

  // Modais estilo Uber
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isGpsOpen, setIsGpsOpen] = useState(false);
  const [isKycModalOpen, setIsKycModalOpen] = useState(false);
  const [isSosOpen, setIsSosOpen] = useState(false);
  const [isStartVehicleModalOpen, setIsStartVehicleModalOpen] = useState(false);
  const [selectedStartVehicleId, setSelectedStartVehicleId] = useState<string>('');
  const [isStartingOnline, setIsStartingOnline] = useState(false);
  const [startModalError, setStartModalError] = useState('');
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [activeRouteInfo, setActiveRouteInfo] = useState<{
    distanceKm: number;
    durationMin: number;
    step: RouteStepSummary;
  } | null>(null);

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
  const [regQuickVehicleInput, setRegQuickVehicleInput] = useState('');
  const [regVehiclePhoto, setRegVehiclePhoto] = useState('');
  const [vehiclePhotoCandidates, setVehiclePhotoCandidates] = useState<{ title: string; url: string; score: number }[]>([]);
  const [isResolvingVehiclePhoto, setIsResolvingVehiclePhoto] = useState(false);

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
    setRegVehiclePhoto('');
    const tmpl = findVehicleTemplate(brand, model);
    if (tmpl) {
      setRegHasFourDoors(true);
      setRegHasAc(true);
      setRegHasLargeTrunk(tmpl.hasLargeTrunk);
      setRegHasLeatherSeats(tmpl.hasLeatherSeats);
      setRegCategory(tmpl.category);
    }
  };

  // Identifica marca, modelo, ano e cor automaticamente a partir de descrição livre (ex: "Corolla 2024 Prata")
  const handleQuickVehicleIdentify = (text: string) => {
    setRegQuickVehicleInput(text);
    const detected = detectVehicleFromDescription(text);
    if (!detected) return;
    if (detected.brand) setRegBrand(detected.brand);
    if (detected.model) setRegModel(detected.model);
    if (detected.year) setRegYear(detected.year);
    if (detected.color) {
      const matchedColor = POPULAR_CAR_COLORS.find(
        c => c.label.toLowerCase() === detected.color.toLowerCase() || c.name.toLowerCase() === detected.color.toLowerCase()
      );
      setRegColor(matchedColor ? matchedColor.name : detected.color);
    }
    setRegHasFourDoors(true);
    setRegHasAc(true);
    setRegHasLargeTrunk(detected.hasLargeTrunk);
    setRegHasLeatherSeats(detected.hasLeatherSeats);
    setRegCategory(detected.category);
    setRegVehiclePhoto('');
  };

  useEffect(() => {
    if (regStep !== 7 || (!regBrand.trim() && !regModel.trim())) return;
    let active = true;
    setIsResolvingVehiclePhoto(true);
    resolveVehiclePhotoExact({
      brand: regBrand,
      model: regModel,
      year: regYear,
      color: regColor,
      category: regCategory
    }).then((res) => {
      if (!active) return;
      setVehiclePhotoCandidates(res.candidates || []);
      if (res.source === 'exact_lookup' && res.photoUrl) {
        setRegVehiclePhoto(res.photoUrl);
      } else {
        setRegVehiclePhoto('');
      }
      setIsResolvingVehiclePhoto(false);
    }).catch(() => {
      if (active) setIsResolvingVehiclePhoto(false);
    });
    return () => { active = false; };
  }, [regStep, regBrand, regModel, regYear, regColor, regCategory]);

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
  const [withdrawPixType, setWithdrawPixType] = useState<'cpf' | 'cnpj' | 'telefone' | 'email' | 'aleatoria'>('cpf');
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
            const selfRes = await StorageService.fetchDriverSelf(drvId);
            if (selfRes?.wallet) setWallet(selfRes.wallet);
            if (selfRes?.driver) {
              setCurrentDriver(selfRes.driver);
              StorageService.setCurrentDriver(selfRes.driver);
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
    const selfRes = await StorageService.fetchDriverSelf(drvId);
    if (selfRes?.wallet) {
      setWallet(selfRes.wallet);
    } else {
      const w = await StorageService.fetchDriverWallet(drvId);
      if (w) setWallet(w);
    }
    if (selfRes?.driver) {
      setCurrentDriver(selfRes.driver);
      StorageService.setCurrentDriver(selfRes.driver);
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
      vehiclePhoto: regVehiclePhoto || undefined,
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

  // Lista normalizada de veículos do motorista (suporte a legado + multi-veículos)
  const getDriverVehiclesList = (driver: DriverProfile): DriverVehicle[] => {
    if (Array.isArray(driver.vehicles) && driver.vehicles.length > 0) {
      return driver.vehicles;
    }
    if (driver.vehicleBrand || driver.vehicleModel || driver.vehiclePlate) {
      return [{
        id: 'veh-primary',
        brand: driver.vehicleBrand || '',
        model: driver.vehicleModel || '',
        version: driver.vehicleVersion || '',
        color: driver.vehicleColor || 'Prata',
        year: driver.vehicleYear || '2024',
        plate: driver.vehiclePlate || '',
        vehiclePhoto: driver.vehiclePhoto || '',
        crlvNumber: driver.crlvNumber || '',
        crlvDocumentPhoto: '',
        crlvRegular: driver.crlvRegular !== false,
        hasFourDoors: driver.hasFourDoors !== false,
        hasAirConditioning: driver.hasAirConditioning !== false,
        hasLargeTrunk: Boolean(driver.hasLargeTrunk),
        hasLeatherSeats: Boolean(driver.hasLeatherSeats),
        eligibleCategories: driver.eligibleCategories || ['kavro_go'],
        approvalStatus: driver.approvalStatus === 'aprovado' ? 'aprovado' : 'pendente_aprovacao',
        isActive: true,
        submittedAt: driver.createdAt
      }];
    }
    return [];
  };

  // Handlers Operacionais
  const handleToggleOnline = async () => {
    if (!currentDriver) return;
    setStatusError('');
    if (currentDriver.approvalStatus !== 'aprovado') {
      setStatusError(
        currentDriver.approvalStatus === 'correcao_solicitada'
          ? 'Solicitamos correções em sua documentação. Toque para reenviar seus documentos.'
          : currentDriver.approvalStatus === 'em_analise'
            ? 'Sua documentação e biometria facial estão em análise. Aguarde a aprovação para iniciar.'
            : 'Seu cadastro precisa estar Aprovado antes de poder ficar online.'
      );
      return;
    }

    // Ao clicar em INICIAR (indo para online), abre modal compacto para confirmar/selecionar o veículo ativo
    if (!currentDriver.isOnline) {
      const vehicles = getDriverVehiclesList(currentDriver);
      const preferred =
        vehicles.find(v => v.isActive && v.approvalStatus === 'aprovado') ||
        vehicles.find(v => v.approvalStatus === 'aprovado') ||
        vehicles[0];
      setSelectedStartVehicleId(preferred?.id || '');
      setStartModalError('');
      setIsStartVehicleModalOpen(true);
      return;
    }

    const res = await StorageService.toggleDriverOnline(currentDriver.id, false);
    if (!res.ok || !res.driver) {
      setStatusError(res.error || 'Não foi possível alterar status.');
      return;
    }
    setCurrentDriver(res.driver);
  };

  const handleConfirmStartOnline = async () => {
    if (!currentDriver) return;
    setStartModalError('');
    const vehicles = getDriverVehiclesList(currentDriver);
    const chosen = vehicles.find(v => v.id === selectedStartVehicleId);

    if (!chosen || chosen.approvalStatus !== 'aprovado') {
      setStartModalError('Selecione um veículo com CRLV aprovado para iniciar suas corridas.');
      return;
    }

    setIsStartingOnline(true);
    try {
      let updatedDriver = currentDriver;
      if (
        chosen.id !== 'veh-primary' &&
        (!chosen.isActive || currentDriver.vehiclePlate !== chosen.plate)
      ) {
        const switchRes = await StorageService.selectDriverActiveVehicle(currentDriver.id, chosen.id);
        if (!switchRes.ok || !switchRes.driver) {
          setStartModalError(switchRes.error || 'Não foi possível ativar o veículo selecionado.');
          setIsStartingOnline(false);
          return;
        }
        updatedDriver = switchRes.driver;
      }

      const res = await StorageService.toggleDriverOnline(updatedDriver.id, true);
      if (!res.ok || !res.driver) {
        setStartModalError(res.error || 'Não foi possível ficar online.');
        setIsStartingOnline(false);
        return;
      }
      setCurrentDriver(res.driver);
      StorageService.setCurrentDriver(res.driver);
      setIsStartVehicleModalOpen(false);
    } finally {
      setIsStartingOnline(false);
    }
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

  const handleArrivePickup = async (ride: Ride) => {
    await fetch(`/api/rides/${encodeURIComponent(ride.id)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...StorageService.getAuthHeaders() },
      body: JSON.stringify({ status: 'no_local' })
    });
    await StorageService.syncFromDatabase();
    refreshData();
  };

  const handleStartTrip = async (ride: Ride) => {
    await fetch(`/api/rides/${encodeURIComponent(ride.id)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...StorageService.getAuthHeaders() },
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
    const savedList = Array.isArray(currentDriver.pixKeys) ? currentDriver.pixKeys : [];
    const defaultSaved = savedList.find(k => k.isDefault) || savedList[0];
    const targetPixKey = (withdrawPixKey || defaultSaved?.pixKey || currentDriver.pixKey || '').trim();
    const targetPixType = withdrawPixKey
      ? (savedList.find(k => k.pixKey === withdrawPixKey)?.pixType || withdrawPixType)
      : (defaultSaved?.pixType || currentDriver.pixType || 'cpf');
    if (!targetPixKey) {
      setWithdrawError('Cadastre uma chave PIX de mesma titularidade na carteira antes de solicitar o saque.');
      return;
    }
    const amount = parseFloat(withdrawAmountStr.replace(',', '.')) || 0;
    setIsRequestingWithdraw(true);
    const res = await StorageService.requestDriverWithdrawal(currentDriver.id, {
      amount,
      pixKey: targetPixKey,
      pixType: targetPixType
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

                  <div style={{ padding: 12, borderRadius: 12, background: '#F6F7F9', border: '1px solid #E2E5EA' }}>
                    <label style={{ ...uLabel, color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Zap size={13} color="#16A34A" />
                      Identificação rápida por texto
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Corolla 2024 Prata ou Onix Plus 2023 Preto"
                      value={regQuickVehicleInput}
                      onChange={(e) => handleQuickVehicleIdentify(e.target.value)}
                      style={{ ...uInput, background: '#FFFFFF' }}
                    />
                    <div style={{ marginTop: 6, fontSize: 11, color: '#64748B' }}>
                      Digite modelo, ano e cor para preencher os campos e localizar a foto exata automaticamente.
                    </div>
                  </div>

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
                      onChange={(e) => { const v = e.target.value; setRegBrand(v); setRegVehiclePhoto(''); const t = findVehicleTemplate(v, regModel); if (t) handleApplyVehicleTemplate(t.brand, t.model); }}
                      style={uInput} />
                  </div>
                  <div>
                    <label style={uLabel}>Modelo</label>
                    <input type="text" list="kavro-models-list" placeholder="Ex: Corolla" value={regModel}
                      onChange={(e) => { const v = e.target.value; setRegModel(v); setRegVehiclePhoto(''); const t = findVehicleTemplate(regBrand, v); if (t) handleApplyVehicleTemplate(t.brand, t.model); }}
                      style={uInput} />
                  </div>
                </>
              )}

              {/* 7. Ano, cor e prévia automática do veículo */}
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

                  {(regBrand || regModel) && (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>
                          Foto identificada ({regBrand} {regModel} {regYear} • {regColor})
                        </span>
                        {isResolvingVehiclePhoto && (
                          <span style={{ fontSize: 11, color: '#64748B' }}>Buscando foto exata...</span>
                        )}
                      </div>
                      <VehiclePhotoPreview
                        photoUrl={regVehiclePhoto || undefined}
                        brand={regBrand}
                        model={regModel}
                        year={regYear}
                        colorName={regColor}
                        plate={regPlate}
                        category={regCategory}
                        size="compact"
                        showPlate={false}
                      />
                      {vehiclePhotoCandidates.length > 1 && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 8, overflowX: 'auto', paddingBottom: 2 }}>
                          {vehiclePhotoCandidates.map((cand, idx) => {
                            const selected = regVehiclePhoto === cand.url;
                            return (
                              <button
                                key={cand.url + idx}
                                type="button"
                                onClick={() => setRegVehiclePhoto(cand.url)}
                                title={cand.title}
                                style={{
                                  flexShrink: 0,
                                  width: 68,
                                  height: 44,
                                  padding: 0,
                                  borderRadius: 8,
                                  overflow: 'hidden',
                                  border: selected ? '2px solid #84CC16' : '1px solid #E2E8F0',
                                  background: '#0F172A',
                                  cursor: 'pointer'
                                }}
                              >
                                <img
                                  src={cand.url}
                                  alt={cand.title}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                />
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
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

  const todayDatePrefix = new Date().toISOString().slice(0, 10);
  const todayEarnings = completedRides
    .filter(r => r.status === 'finalizada' && String(r.createdAt || '').startsWith(todayDatePrefix))
    .reduce((acc, r) => acc + (r.driverNetAmount || r.totalPrice * (1 - (r.commissionPercent || 20) / 100)), 0);
  const headerEarningsValue = todayEarnings > 0 ? todayEarnings : (wallet?.availableBalance || 0);

  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: '#E8EDF3',
      color: '#111111',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* =========================================================================
          MAPA REAL EM TELA CHEIA ESTILO UBER DRIVER
         ========================================================================= */}
      <DriverHomeMap
        driverLocation={activeRide?.driverLocation || currentDriver.location || null}
        isOnline={Boolean(currentDriver.isOnline)}
        activeRide={activeRide || null}
        recenterSignal={recenterSignal}
        onRouteInfoUpdate={setActiveRouteInfo}
      />

      {/* =========================================================================
          BARRA DE TOPO FLUTUANTE ESTILO UBER DRIVER (OCULTA QUANDO EM CORRIDA ATIVA)
          [ ☰ ]     [ R$ 72,37 ] / [ HOJE ]     [ 🔍 ]
         ========================================================================= */}
      {!activeRide && (
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
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          pointerEvents: 'none'
        }}>
          {/* Botão Menu Circular Branco ☰ */}
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            aria-label="Abrir menu do motorista"
            style={{
              width: 46,
              height: 46,
              borderRadius: '50%',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E5E7EB',
              color: '#111111',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(0,0,0,0.16)',
              cursor: 'pointer',
              pointerEvents: 'auto'
            }}
          >
            <Menu size={22} />
          </button>

          {/* Pílula Central Escura de Ganhos + Tag HOJE estilo Print Uber Driver */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'auto' }}>
            <button
              type="button"
              onClick={() => setActiveTab('ganhos')}
              style={{
                height: 44,
                padding: '0 20px',
                borderRadius: 999,
                backgroundColor: '#141414',
                border: '1px solid rgba(255,255,255,0.14)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 6px 18px rgba(0,0,0,0.28)',
                cursor: 'pointer'
              }}
            >
              <span style={{ fontSize: '1rem', fontWeight: 900, color: '#22C55E' }}>R$</span>
              <span style={{ fontSize: '1.16rem', fontWeight: 900, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
                {headerEarningsValue.toFixed(2).replace('.', ',')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ganhos')}
              style={{
                marginTop: -6,
                backgroundColor: '#FFFFFF',
                color: '#111111',
                border: '1px solid #E5E7EB',
                borderRadius: 6,
                padding: '2px 10px',
                fontSize: '0.68rem',
                fontWeight: 900,
                letterSpacing: '0.06em',
                boxShadow: '0 3px 10px rgba(0,0,0,0.12)',
                cursor: 'pointer'
              }}
            >
              HOJE
            </button>
          </div>

          {/* Botão Busca / Preferências Circular Branco 🔍 */}
          <button
            type="button"
            onClick={() => setIsPreferencesOpen(true)}
            aria-label="Buscar região e filtros"
            style={{
              width: 46,
              height: 46,
              borderRadius: '50%',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E5E7EB',
              color: '#111111',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(0,0,0,0.16)',
              cursor: 'pointer',
              pointerEvents: 'auto'
            }}
          >
            <Search size={20} />
          </button>
        </header>
      )}

      {/* Aviso discreto de status (ex: KYC ou erro operacional) */}
      {statusError && !activeRide && (
        <div style={{
          position: 'fixed',
          top: 'calc(84px + env(safe-area-inset-top, 0px))',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 32px)',
          maxWidth: 440,
          zIndex: 55,
          backgroundColor: '#FEF2F2',
          color: '#991B1B',
          border: '1px solid #FECACA',
          borderRadius: 12,
          padding: '10px 14px',
          fontSize: '0.8rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          boxShadow: '0 6px 20px rgba(0,0,0,0.14)'
        }}>
          <span>{statusError}</span>
          <button
            type="button"
            onClick={() => setStatusError('')}
            style={{ background: 'none', border: 'none', color: '#991B1B', fontWeight: 900, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* =========================================================================
          DOCK INFERIOR QUANDO OFFLINE OU ONLINE PROCURANDO VIAGENS
          [ 🛡️ ]         (  INICIAR  )         [ ⌖ ] [ 📊 ]
          [ 🎚️       Você está offline        ≡ ]
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
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Controles Flutuantes acima da Sheet Branca */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            padding: '0 16px 14px 16px',
            pointerEvents: 'none'
          }}>
            {/* Escudo Azul SOS à esquerda */}
            <button
              type="button"
              onClick={() => setIsSosOpen(true)}
              title="Central de Segurança SOS"
              style={{
                width: 46,
                height: 46,
                borderRadius: '50%',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E5E7EB',
                boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                pointerEvents: 'auto'
              }}
            >
              <Shield size={22} color="#276EF1" fill="#DBEAFE" strokeWidth={2.2} />
            </button>

            {/* Botão Central INICIAR / PARAR Azul Uber (#276EF1) */}
            {!currentDriver.isOnline ? (
              <button
                type="button"
                onClick={handleToggleOnline}
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: '50%',
                  backgroundColor: '#276EF1',
                  color: '#FFFFFF',
                  border: '3px solid #FFFFFF',
                  outline: '2px solid #276EF1',
                  boxShadow: '0 8px 26px rgba(39, 110, 241, 0.5)',
                  fontSize: '0.95rem',
                  fontWeight: 900,
                  letterSpacing: '0.03em',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'auto'
                }}
              >
                INICIAR
              </button>
            ) : (
              <button
                type="button"
                onClick={handleToggleOnline}
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: '50%',
                  backgroundColor: '#DC2626',
                  color: '#FFFFFF',
                  border: '3px solid #FFFFFF',
                  outline: '2px solid #DC2626',
                  boxShadow: '0 8px 26px rgba(220, 38, 38, 0.45)',
                  fontSize: '0.92rem',
                  fontWeight: 900,
                  letterSpacing: '0.03em',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'auto'
                }}
              >
                <Power size={20} strokeWidth={2.8} />
                <span style={{ fontSize: '0.72rem', marginTop: 2 }}>PARAR</span>
              </button>
            )}

            {/* Botões Circulares à direita (Centralizar + Ganhos) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'auto' }}>
              <button
                type="button"
                onClick={() => setRecenterSignal(s => s + 1)}
                title="Centralizar minha posição"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  color: '#111111',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.16)',
                  cursor: 'pointer'
                }}
              >
                <Compass size={20} />
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ganhos')}
                title="Resumo de Ganhos"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  color: '#111111',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.16)',
                  cursor: 'pointer'
                }}
              >
                <BarChart2 size={20} />
              </button>
            </div>
          </div>

          {/* Barra Branca Inferior Docked Estilo Uber Driver */}
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '20px 20px 0 0',
            padding: '10px 18px calc(16px + env(safe-area-inset-bottom, 0px)) 18px',
            boxShadow: '0 -6px 26px rgba(0,0,0,0.14)',
            pointerEvents: 'auto',
            color: '#111111'
          }}>
            {/* Handle cinza superior */}
            <div style={{
              width: 38,
              height: 4,
              borderRadius: 999,
              backgroundColor: '#D1D5DB',
              margin: '0 auto 12px auto'
            }} />

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12
            }}>
              <button
                type="button"
                onClick={() => setIsPreferencesOpen(true)}
                title="Preferências"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  backgroundColor: '#F3F4F6',
                  border: 'none',
                  color: '#111111',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                <Sliders size={19} />
              </button>

              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{
                  fontSize: '1.1rem',
                  fontWeight: 800,
                  color: currentDriver.isOnline ? '#15803D' : '#111111',
                  letterSpacing: '-0.02em'
                }}>
                  {currentDriver.isOnline ? 'Você está online' : 'Você está offline'}
                </div>
                <div style={{ fontSize: '0.76rem', color: '#6B7280', fontWeight: 600, marginTop: 1 }}>
                  {currentDriver.isOnline
                    ? `Procurando chamadas • ${driverCatEval.enabledCategoryIds.length} categoria(s) ativa(s)`
                    : 'Toque em INICIAR para receber viagens'}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('ganhos')}
                title="Histórico e Ganhos"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  backgroundColor: '#F3F4F6',
                  border: 'none',
                  color: '#111111',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                <List size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          CORRIDA ATIVA ESTILO UBER TURN-BY-TURN
         ========================================================================= */}
      {activeRide && (
        <DriverActiveRideCard
          ride={activeRide}
          config={config}
          routeInfo={activeRouteInfo}
          onOpenChat={() => setIsChatOpen(true)}
          onOpenGps={() => setIsGpsOpen(true)}
          onOpenPreferences={() => setIsPreferencesOpen(true)}
          onOpenSos={() => setIsSosOpen(true)}
          onRecenterMap={() => setRecenterSignal(s => s + 1)}
          onArrivePickup={() => handleArrivePickup(activeRide)}
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
          TELAS SECUNDÁRIAS: GANHOS, CARTEIRA, VEÍCULOS, PERFIL
         ========================================================================= */}
      {activeTab !== 'radar' && (
        <DriverSecondaryTabs
          activeTab={activeTab}
          currentDriver={currentDriver}
          wallet={wallet}
          completedRides={completedRides}
          todayEarnings={todayEarnings}
          pixEditType={pixEditType}
          pixEditKey={pixEditKey}
          pixEditBank={pixEditBank}
          isSavingPix={isSavingPix}
          pixSaveNotice={pixSaveNotice}
          onChangeTab={(t) => setActiveTab(t)}
          onOpenDrawer={() => setIsDrawerOpen(true)}
          onOpenPreferences={() => setIsPreferencesOpen(true)}
          onDriverUpdated={(d) => {
            setCurrentDriver(d);
            StorageService.setCurrentDriver(d);
          }}
          onOpenWithdrawModal={() => {
            const list = Array.isArray(currentDriver.pixKeys) ? currentDriver.pixKeys : [];
            const def = list.find(k => k.isDefault) || list[0];
            setWithdrawPixKey(def?.pixKey || currentDriver.pixKey || '');
            setWithdrawPixType(def?.pixType || currentDriver.pixType || 'cpf');
            setWithdrawError('');
            setIsWithdrawModalOpen(true);
          }}
          onOpenDebtPixModal={handleOpenDebtPixModal}
          onPixTypeChange={(t) => setPixEditType(t)}
          onPixKeyChange={(v) => setPixEditKey(v)}
          onPixBankChange={(v) => setPixEditBank(v)}
          onSavePixKey={handleSavePixKey}
          onOpenKycModal={() => setIsKycModalOpen(true)}
          onOpenTermsModal={() => setIsDriverSignedContractOpen(true)}
        />
      )}

      {/* 1. Menu Gaveta Lateral */}
      <DriverDrawerMenu
        isOpen={isDrawerOpen}
        driver={currentDriver}
        activeTab={activeTab}
        onClose={() => setIsDrawerOpen(false)}
        onSelectTab={(tab) => setActiveTab(tab)}
        onOpenPreferences={() => setIsPreferencesOpen(true)}
        onOpenSos={() => setIsSosOpen(true)}
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
              headers: { 'Content-Type': 'application/json', ...StorageService.getAuthHeaders() },
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
      {isWithdrawModalOpen && wallet && (() => {
        const modalPixKeys = Array.isArray(currentDriver.pixKeys) && currentDriver.pixKeys.length > 0
          ? currentDriver.pixKeys
          : (currentDriver.pixKey
            ? [{
                id: 'pix-primary',
                pixType: currentDriver.pixType || 'cpf',
                pixKey: currentDriver.pixKey,
                bankName: currentDriver.bankName || '',
                holderName: currentDriver.name,
                holderDocument: currentDriver.document || '',
                sameOwnershipConfirmed: true,
                isDefault: true,
                createdAt: currentDriver.createdAt
              }]
            : []);

        return (
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
            backgroundColor: '#FFFFFF',
            color: '#111111',
            borderRadius: 20,
            padding: 22,
            width: '100%',
            maxWidth: 420,
            border: '1px solid #E5E7EB',
            boxShadow: '0 20px 45px rgba(0,0,0,0.22)'
          }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem', fontWeight: 900, color: '#111111' }}>
              Solicitar Saque PIX
            </h3>
            <div style={{ fontSize: '0.84rem', color: '#6B7280', marginBottom: 14 }}>
              Saldo Disponível: <strong style={{ color: '#16A34A' }}>R$ {wallet.availableBalance.toFixed(2).replace('.', ',')}</strong>
            </div>
            <form onSubmit={handleRequestWithdrawal} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                type="text"
                placeholder="Valor (R$)"
                value={withdrawAmountStr}
                onChange={(e) => setWithdrawAmountStr(e.target.value)}
                required
                style={{ padding: '12px', borderRadius: 10, border: '1.5px solid #E5E7EB', backgroundColor: '#F9FAFB', color: '#111111', fontWeight: 700 }}
              />

              {modalPixKeys.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#374151' }}>
                    Escolha a chave PIX de destino (mesma titularidade):
                  </div>
                  {modalPixKeys.map((k) => {
                    const selected = (withdrawPixKey || modalPixKeys[0].pixKey) === k.pixKey;
                    return (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() => {
                          setWithdrawPixKey(k.pixKey);
                          setWithdrawPixType(k.pixType);
                        }}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: selected ? '2px solid #111111' : '1px solid #E5E7EB',
                          backgroundColor: selected ? '#F8FAFC' : '#FFFFFF',
                          textAlign: 'left',
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#111111' }}>
                          {k.pixKey}
                        </div>
                        <div style={{ fontSize: '0.71rem', color: '#6B7280', marginTop: 2 }}>
                          {k.pixType.toUpperCase()} {k.bankName ? `• ${k.bankName}` : ''} • Titular CPF {formatCPF(currentDriver.document || '')}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  backgroundColor: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: '#92400E'
                }}>
                  Nenhuma chave PIX cadastrada ainda. Cadastre uma chave em sua própria titularidade na aba Carteira &amp; PIX.
                </div>
              )}

              {withdrawError && <div style={{ color: '#DC2626', fontSize: '0.78rem', fontWeight: 700 }}>{withdrawError}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setIsWithdrawModalOpen(false)}
                  style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #E5E7EB', backgroundColor: '#F3F4F6', color: '#111111', fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isRequestingWithdraw || modalPixKeys.length === 0}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: 10,
                    backgroundColor: modalPixKeys.length === 0 ? '#9CA3AF' : '#111111',
                    color: '#FFFFFF',
                    border: 'none',
                    fontWeight: 800,
                    cursor: modalPixKeys.length === 0 ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isRequestingWithdraw ? 'Solicitando...' : 'Confirmar Saque'}
                </button>
              </div>
            </form>
          </div>
        </div>
        );
      })()}

      {/* 7. Modal de Quitação de Dívida PIX */}
      {debtPixModalData && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.65)',
          zIndex: 100000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            color: '#111111',
            borderRadius: 20,
            padding: 22,
            width: '100%',
            maxWidth: 380,
            textAlign: 'center',
            border: '1px solid #E5E7EB',
            boxShadow: '0 20px 45px rgba(0,0,0,0.22)'
          }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem', fontWeight: 900, color: '#111111' }}>Quitar Saldo Devedor</h3>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#DC2626', margin: '8px 0' }}>
              R$ {debtPixModalData.amount.toFixed(2).replace('.', ',')}
            </div>
            <img
              src={debtPixModalData.pixQrCode}
              alt="QR Code PIX"
              style={{ width: 180, height: 180, margin: '0 auto 12px auto', borderRadius: 12, border: '1px solid #E5E7EB' }}
            />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(debtPixModalData.pixCopyPaste);
                setCopiedDebtPix(true);
                setTimeout(() => setCopiedDebtPix(false), 2000);
              }}
              style={{ width: '100%', padding: '12px', borderRadius: 10, backgroundColor: '#F3F4F6', color: '#111111', border: '1px solid #E5E7EB', fontWeight: 800, marginBottom: 8, cursor: 'pointer' }}
            >
              {copiedDebtPix ? 'Copiado!' : 'Copiar Código PIX'}
            </button>
            <button
              type="button"
              onClick={handleSimulateDebtPixWebhook}
              disabled={isSimulatingDebtWebhook}
              style={{ width: '100%', padding: '12px', borderRadius: 10, backgroundColor: '#111111', color: '#FFFFFF', border: 'none', fontWeight: 800, marginBottom: 8, cursor: 'pointer' }}
            >
              {isSimulatingDebtWebhook ? 'Confirmando...' : 'Confirmar Pagamento'}
            </button>
            <button
              type="button"
              onClick={() => setDebtPixModalData(null)}
              style={{ background: 'none', border: 'none', color: '#6B7280', fontWeight: 700, cursor: 'pointer', padding: '6px 12px' }}
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
        <SosEmergencyModal
          isOpen={isSosOpen}
          onClose={() => setIsSosOpen(false)}
          rideId={activeRide?.id}
          driverPhone={currentDriver.phone}
        />
      )}

      {/* Modalzinho compacto ao apertar INICIAR para selecionar/confirmar o veículo ativo */}
      {currentDriver && isStartVehicleModalOpen && (() => {
        const vehicles = getDriverVehiclesList(currentDriver);
        const selectedVeh = vehicles.find(v => v.id === selectedStartVehicleId);
        const canStartWithSelected = Boolean(selectedVeh && selectedVeh.approvalStatus === 'aprovado');

        return (
          <div
            onClick={() => !isStartingOnline && setIsStartVehicleModalOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.56)',
              backdropFilter: 'blur(3px)',
              zIndex: 100010,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              padding: 0
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 520,
                backgroundColor: '#FFFFFF',
                color: '#111111',
                borderRadius: '28px 28px 0 0',
                padding: '12px 20px calc(34px + env(safe-area-inset-bottom, 0px)) 20px',
                boxShadow: '0 -12px 36px rgba(0,0,0,0.24)',
                borderTop: '1px solid #E5E7EB',
                minHeight: '38vh',
                maxHeight: '84vh',
                overflowY: 'auto',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div>
                {/* Barra puxadora do Bottom Sheet */}
                <div style={{
                  width: 42,
                  height: 4,
                  borderRadius: 999,
                  backgroundColor: '#CBD5E1',
                  margin: '0 auto 14px auto'
                }} />

                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: '1.02rem', fontWeight: 900, color: '#111111', letterSpacing: '-0.02em' }}>
                    Com qual veículo vai rodar?
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#6B7280', marginTop: 2 }}>
                    Selecione o carro ativo para ficar online.
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isStartingOnline}
                  onClick={() => setIsStartVehicleModalOpen(false)}
                  aria-label="Fechar"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    border: 'none',
                    backgroundColor: '#F3F4F6',
                    color: '#111111',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {vehicles.length === 0 ? (
                <div style={{
                  padding: 14,
                  borderRadius: 12,
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  color: '#B91C1C',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  marginBottom: 12
                }}>
                  Nenhum veículo cadastrado ainda. Cadastre um veículo com CRLV antes de iniciar.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {vehicles.map((veh) => {
                    const isApproved = veh.approvalStatus === 'aprovado';
                    const isRejected = veh.approvalStatus === 'rejeitado';
                    const isSelected = selectedStartVehicleId === veh.id;
                    const tag = isApproved
                      ? { label: 'Aprovado', bg: '#DCFCE7', color: '#15803D' }
                      : isRejected
                      ? { label: 'Recusado', bg: '#FEE2E2', color: '#B91C1C' }
                      : { label: 'Em análise', bg: '#FEF3C7', color: '#B45309' };

                    return (
                      <button
                        key={veh.id}
                        type="button"
                        disabled={!isApproved || isStartingOnline}
                        onClick={() => {
                          setSelectedStartVehicleId(veh.id);
                          setStartModalError('');
                        }}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: 10,
                          borderRadius: 13,
                          border: isSelected ? '2px solid #276EF1' : '1px solid #E5E7EB',
                          backgroundColor: !isApproved ? '#F9FAFB' : isSelected ? '#EFF6FF' : '#FFFFFF',
                          opacity: isApproved ? 1 : 0.65,
                          textAlign: 'left',
                          cursor: isApproved ? 'pointer' : 'not-allowed'
                        }}
                      >
                        <div style={{
                          width: 66,
                          height: 44,
                          borderRadius: 9,
                          overflow: 'hidden',
                          backgroundColor: '#0F172A',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <StartModalVehicleThumb
                            brand={veh.brand}
                            model={veh.model}
                            year={veh.year}
                            color={veh.color}
                            photoUrl={veh.vehiclePhoto}
                          />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 2 }}>
                            <span style={{
                              fontSize: '0.64rem',
                              fontWeight: 800,
                              padding: '1px 7px',
                              borderRadius: 999,
                              backgroundColor: tag.bg,
                              color: tag.color
                            }}>
                              {tag.label}
                            </span>
                            {veh.isActive && isApproved && (
                              <span style={{
                                fontSize: '0.63rem',
                                fontWeight: 800,
                                padding: '1px 7px',
                                borderRadius: 999,
                                backgroundColor: '#111111',
                                color: '#A3E635'
                              }}>
                                Atual
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#111111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {veh.brand} {veh.model} {veh.year}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#4B5563' }}>
                            <strong style={{ fontFamily: 'monospace' }}>{veh.plate}</strong> • {veh.color}
                          </div>
                        </div>

                        <div style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          border: isSelected ? 'none' : '2px solid #CBD5E1',
                          backgroundColor: isSelected ? '#276EF1' : 'transparent',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          {isSelected && <Check size={13} strokeWidth={3} />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {startModalError && (
                <div style={{
                  marginBottom: 10,
                  padding: '8px 10px',
                  borderRadius: 9,
                  backgroundColor: '#FEF2F2',
                  color: '#DC2626',
                  fontSize: '0.75rem',
                  fontWeight: 700
                }}>
                  {startModalError}
                </div>
              )}

              </div>

              <button
                type="button"
                disabled={!canStartWithSelected || isStartingOnline}
                onClick={handleConfirmStartOnline}
                style={{
                  width: '100%',
                  height: 48,
                  borderRadius: 13,
                  border: 'none',
                  backgroundColor: canStartWithSelected ? '#276EF1' : '#E5E7EB',
                  color: canStartWithSelected ? '#FFFFFF' : '#6B7280',
                  fontSize: '0.92rem',
                  fontWeight: 900,
                  cursor: canStartWithSelected ? 'pointer' : 'not-allowed',
                  marginTop: 12
                }}
              >
                {isStartingOnline ? 'Iniciando...' : 'Confirmar e Ficar Online'}
              </button>
            </div>
          </div>
        );
      })()}

      {currentDriver && (
        <PushPermissionPrompt
          role="motorista"
          externalId={driverExternalId(currentDriver.id, currentDriver.phone) || null}
        />
      )}
    </div>
  );
};
