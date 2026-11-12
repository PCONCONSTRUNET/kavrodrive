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
import { DriverIncomingRideModal } from '../components/DriverIncomingRideModal';
import { DriverActiveRideCard } from '../components/DriverActiveRideCard';
import { DriverDrawerMenu } from '../components/DriverDrawerMenu';
import { DriverKycVerificationModal } from '../components/DriverKycVerificationModal';
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
  const [authError, setAuthError] = useState('');
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);

  // Cadastro em 3 etapas estilo Uber Partner
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
  const [regPixType, setRegPixType] = useState<'cpf' | 'telefone' | 'email' | 'aleatoria'>('cpf');
  const [regPixKey, setRegPixKey] = useState('');
  const [regBankName, setRegBankName] = useState('');

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

  const loadDriverAndWallet = async (drvId: string) => {
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
      loadDriverAndWallet(currentDriver.id);
      const t = setInterval(() => {
        if (document.visibilityState === 'visible') {
          loadDriverAndWallet(currentDriver.id);
        }
      }, 3000);
      return () => clearInterval(t);
    }
  }, [currentDriver?.id]);

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
    setCurrentDriver(res.driver);
    if (res.wallet) setWallet(res.wallet);
  };

  const handleRegisterPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setRegPhoto(reader.result);
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
    if (!regPixKey.trim()) {
      setAuthError('Informe sua chave PIX para receber os ganhos.');
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
      pixType: regPixType,
      pixKey: regPixKey || regDocument,
      bankName: regBankName,
      turnstileToken: turnstileToken || undefined
    });
    setIsLoadingAuth(false);
    if (!res.ok || !res.driver) {
      setAuthError(res.error || 'Erro ao enviar cadastro.');
      setTurnstileResetKey(k => k + 1);
      return;
    }
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
    const amount = parseFloat(withdrawAmountStr.replace(',', '.')) || 0;
    setIsRequestingWithdraw(true);
    const res = await StorageService.requestDriverWithdrawal(currentDriver.id, {
      amount,
      pixKey: withdrawPixKey || currentDriver.pixKey,
      pixType: currentDriver.pixType
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
      10: { section: 'Pagamentos', title: 'Onde quer receber seus ganhos?', subtitle: 'Em seguida você vai enviar a foto da CNH e fazer a validação facial.' }
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
            <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.2, margin: '8px 0 4px 0', color: '#000000', letterSpacing: '-0.02em' }}>
                Bem-vindo de volta
              </h1>
              <p style={{ fontSize: '0.95rem', color: '#6B6B6B', margin: '0 0 8px 0' }}>
                Entre para ficar online e receber viagens.
              </p>

              <div>
                <label style={uLabel}>CPF, celular ou e-mail</label>
                <input
                  type="text"
                  placeholder="Digite seu identificador"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  required
                  style={uInput}
                />
              </div>
              <div>
                <label style={uLabel}>Senha</label>
                <input
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

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0' }}>
                <div style={{ flex: 1, height: 1, backgroundColor: '#E2E2E2' }} />
                <span style={{ fontSize: '0.85rem', color: '#6B6B6B' }}>ou</span>
                <div style={{ flex: 1, height: 1, backgroundColor: '#E2E2E2' }} />
              </div>

              <button
                type="button"
                onClick={() => { setAuthMode('register'); setRegStep(1); setAuthError(''); }}
                style={{ ...uPrimaryBtn(), backgroundColor: '#F3F3F3', color: '#000000' }}
              >
                Quero dirigir com a Kavro
              </button>
            </form>
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

              {/* 10. PIX */}
              {regStep === 10 && (
                <>
                  <div>
                    <label style={uLabel}>Tipo de chave</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {([
                        { id: 'cpf', label: 'CPF' },
                        { id: 'telefone', label: 'Celular' },
                        { id: 'email', label: 'E-mail' },
                        { id: 'aleatoria', label: 'Aleatória' }
                      ] as const).map(opt => (
                        <button key={opt.id} type="button"
                          onClick={() => {
                            setRegPixType(opt.id);
                            if (opt.id === 'cpf' && regDocument) setRegPixKey(formatCPF(regDocument));
                            else if (opt.id === 'telefone' && regPhone) setRegPixKey(formatPhone(regPhone));
                            else if (opt.id === 'email' && regEmail) setRegPixKey(regEmail);
                            else if (opt.id === 'aleatoria') setRegPixKey('');
                          }}
                          style={uChip(regPixType === opt.id)}
                        >{opt.label}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={uLabel}>Chave PIX</label>
                    <input type="text" placeholder="Digite sua chave PIX" value={regPixKey}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (regPixType === 'cpf') setRegPixKey(formatCPF(val));
                        else if (regPixType === 'telefone') setRegPixKey(formatPhone(val));
                        else setRegPixKey(val);
                      }}
                      style={uInput} />
                  </div>
                  <div>
                    <label style={uLabel}>Banco <span style={{ color: '#6B6B6B', fontWeight: 400 }}>(opcional)</span></label>
                    <input type="text" placeholder="Ex: Nubank, Inter, Itaú" value={regBankName}
                      onChange={(e) => setRegBankName(e.target.value)} style={uInput} />
                  </div>
                </>
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
                    Em seguida você fará a verificação de identidade (CNH + selfie ao vivo).
                  </div>
                </>
              )}

              <button type="submit" disabled={isLoadingAuth} style={uPrimaryBtn(isLoadingAuth)}>
                {regStep < REG_TOTAL_STEPS ? 'Continuar' : isLoadingAuth ? 'Enviando...' : 'Continuar para documentos'}
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
      </div>
    );
  }

  // 2. TELA DE KYC & AGUARDANDO APROVAÇÃO
  if (currentDriver.approvalStatus !== 'aprovado') {
    const isCorrection = currentDriver.approvalStatus === 'correcao_solicitada';
    const isInReview = currentDriver.approvalStatus === 'em_analise';
    const isRejected = currentDriver.approvalStatus === 'rejeitado';
    const isPending = !isCorrection && !isInReview && !isRejected;

    const biometric = currentDriver.kyc?.biometricResult;

    return (
      <div style={{
        minHeight: '100dvh',
        backgroundColor: '#090D14',
        color: '#FFFFFF',
        padding: '24px 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        <div style={{
          maxWidth: 440,
          width: '100%',
          backgroundColor: '#121722',
          borderRadius: 24,
          padding: '28px 22px',
          border: '1.5px solid #1E293B',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          boxSizing: 'border-box'
        }}>
          {/* Ícone contextual */}
          <div style={{
            width: 68,
            height: 68,
            borderRadius: '50%',
            backgroundColor: isCorrection ? 'rgba(245, 158, 11, 0.15)' : isInReview ? 'rgba(37, 99, 235, 0.15)' : isRejected ? 'rgba(239, 68, 68, 0.15)' : 'rgba(118, 216, 0, 0.15)',
            color: isCorrection ? '#F59E0B' : isInReview ? '#60A5FA' : isRejected ? '#EF4444' : '#76D800',
            border: `2px solid ${isCorrection ? '#F59E0B' : isInReview ? '#3B82F6' : isRejected ? '#EF4444' : '#76D800'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 18px auto'
          }}>
            {isCorrection ? <AlertTriangle size={34} /> : isInReview ? <Clock size={34} /> : isRejected ? <XCircle size={34} /> : <ShieldCheck size={36} />}
          </div>

          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 20,
            fontSize: '0.72rem',
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            backgroundColor: isCorrection ? 'rgba(245, 158, 11, 0.2)' : isInReview ? 'rgba(37, 99, 235, 0.2)' : isRejected ? 'rgba(239, 68, 68, 0.2)' : 'rgba(118, 216, 0, 0.2)',
            color: isCorrection ? '#FBBF24' : isInReview ? '#93C5FD' : isRejected ? '#FCA5A5' : '#76D800',
            marginBottom: 12
          }}>
            {isCorrection ? 'Correção Solicitada' : isInReview ? 'Em Análise Manual' : isRejected ? 'Cadastro Recusado' : 'Validação KYC Pendente'}
          </div>

          <h2 style={{ fontSize: '1.3rem', fontWeight: 900, margin: '0 0 10px 0', letterSpacing: '-0.02em', color: '#FFFFFF' }}>
            {isCorrection
              ? 'Ajuste nos Documentos Solicitado'
              : isInReview
                ? 'Documentação em Análise'
                : isRejected
                  ? 'Cadastro Não Aprovado'
                  : 'Verificação Facial Obrigatória'}
          </h2>

          <p style={{ fontSize: '0.86rem', color: '#94A3B8', lineHeight: 1.5, margin: '0 0 20px 0' }}>
            {isCorrection
              ? 'A Central Master analisou seus documentos e solicitou uma nova foto com melhor nitidez ou iluminação.'
              : isInReview
                ? `Olá ${currentDriver.name}, sua foto da CNH e selfie foram comparadas pela IA local no navegador e enviadas com segurança ao administrador.`
                : isRejected
                  ? 'Infelizmente seu cadastro não pôde ser ativado com as informações fornecidas.'
                  : `Olá ${currentDriver.name}, para ativar sua conta e receber corridas, é necessário validar sua CNH e capturar uma selfie via IA facial local.`}
          </p>

          {/* Feedback ou instruções do Administrador (quando houver correção solicitada ou recusa) */}
          {(isCorrection || isRejected) && (currentDriver.kyc?.adminNotes || currentDriver.rejectionReason) && (
            <div style={{
              backgroundColor: isRejected ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
              border: `1px solid ${isRejected ? 'rgba(239, 68, 68, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
              borderRadius: 14,
              padding: '12px 14px',
              textAlign: 'left',
              marginBottom: 18
            }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: isRejected ? '#F87171' : '#FBBF24', textTransform: 'uppercase', marginBottom: 4 }}>
                Mensagem da Central Kavro:
              </div>
              <div style={{ fontSize: '0.82rem', color: '#E2E8F0', lineHeight: 1.45 }}>
                {currentDriver.kyc?.adminNotes || currentDriver.rejectionReason}
              </div>
            </div>
          )}

          {/* Card de Score Biométrico (quando já realizado) */}
          {biometric && (
            <div style={{
              backgroundColor: '#1E293B',
              borderRadius: 14,
              padding: '12px 14px',
              marginBottom: 20,
              border: '1px solid #334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '0.7rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 700 }}>
                  IA Facial Human Biometrics
                </div>
                <div style={{ fontSize: '0.78rem', color: '#E2E8F0', marginTop: 2 }}>
                  Comparação CNH ↔ Selfie
                </div>
              </div>
              <div style={{
                padding: '4px 10px',
                borderRadius: 8,
                backgroundColor: (biometric.isMatch ?? biometric.match) ? 'rgba(118, 216, 0, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: (biometric.isMatch ?? biometric.match) ? '#76D800' : '#EF4444',
                fontWeight: 900,
                fontSize: '0.88rem'
              }}>
                {(biometric.similarityScore ?? biometric.similarity ?? 0)}% {(biometric.isMatch ?? biometric.match) ? 'Compatível' : 'Divergente'}
              </div>
            </div>
          )}

          {/* Ações */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Se precisa fazer ou refazer KYC */}
            {(isPending || isCorrection || isRejected) && (
              <button
                type="button"
                onClick={() => setIsKycModalOpen(true)}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: 14,
                  backgroundColor: '#76D800',
                  color: '#000000',
                  border: 'none',
                  fontWeight: 900,
                  fontSize: '0.92rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 4px 20px rgba(118, 216, 0, 0.35)'
                }}
              >
                <Camera size={18} />
                <span>{isCorrection ? 'Reenviar CNH & Nova Selfie' : isRejected ? 'Tentar Novo Envio KYC' : 'Fazer Verificação Facial (KYC)'}</span>
              </button>
            )}

            {/* Se está em análise manual */}
            {isInReview && (
              <>
                <button
                  type="button"
                  onClick={() => loadDriverAndWallet(currentDriver.id)}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: 14,
                    backgroundColor: '#2563EB',
                    color: '#FFF',
                    border: 'none',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8
                  }}
                >
                  <RefreshCw size={16} />
                  <span>Verificar Aprovação Agora</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsKycModalOpen(true)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: 14,
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    color: '#CBD5E1',
                    border: '1px solid #334155',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  Rever ou Substituir Documentos
                </button>
              </>
            )}


            <button
              type="button"
              onClick={() => {
                StorageService.setCurrentDriver(null);
                setCurrentDriver(null);
              }}
              style={{ background: 'none', border: 'none', color: '#64748B', fontSize: '0.8rem', cursor: 'pointer', marginTop: 4 }}
            >
              Sair da conta
            </button>
          </div>
        </div>

        {/* Modal de KYC do Motorista */}
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
                onClick={() => setIsWithdrawModalOpen(true)}
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
                <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                  Chave PIX: {currentDriver.pixKey} ({currentDriver.pixType})
                </div>
              </div>

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
        onLogout={() => {
          StorageService.setCurrentDriver(null);
          setCurrentDriver(null);
        }}
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
            <p style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: 14 }}>
              Receba o dinheiro em mãos. A comissão de {cashCompleteRide.commissionPercent || 20}% será debitada da carteira.
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
    </div>
  );
};
