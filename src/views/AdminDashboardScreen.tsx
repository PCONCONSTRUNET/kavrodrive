import React, { useState, useEffect, useRef } from 'react';
import { 
  TrendingUp, Calendar, Clock, DollarSign, CheckCircle2, 
  AlertCircle, Users, ExternalLink, Plus, MapPin, 
  Play, CheckSquare, XCircle, ChevronRight, ChevronLeft, CalendarDays, Navigation, Phone, 
  MessageSquare, FileText, ArrowRight, Settings, Sliders, Briefcase,
  Calculator, HelpCircle, Zap, Moon, Sun, Check, X, Sparkles, User, Luggage,
  Menu, LayoutDashboard, Car, LogOut, Search, UserPlus, Award, Edit2, Trash2,
  Fuel, Wrench, Wallet, ArrowUpRight, ArrowDownRight, Share2, Coins, CreditCard, Lock, RefreshCw, Bell,
  Route, ShieldAlert
} from 'lucide-react';
import { playNewRideSound } from '../utils/soundAndVoice';
import { Ride, SystemConfig, Expense, ClientProfile, RideStatus, PaymentStatus, PaymentMethod } from '../types';
import { StorageService } from '../services/storage';
import { PushTemplatesEditor } from '../components/PushTemplatesEditor';
import { getGoogleMapsRouteUrl, getGoogleMapsPlaceUrl } from '../utils/geo';
import { ManualRideModal } from '../components/ManualRideModal';
import { RideDetailAdminModal } from '../components/RideDetailAdminModal';
import { LiveGpsNavigationScreen } from '../components/LiveGpsNavigationScreen';
import { RidePaymentCheckoutModal } from '../components/RidePaymentCheckoutModal';
import { ClientFormModal, ClientDetailModal } from '../components/ClientManagementModals';
import { PassengerTermsContractModal } from '../components/PassengerTermsContractModal';
import { FinanceReportPdfModal } from '../components/FinanceReportPdfModal';
import { AdminDriverProfileTab } from '../components/AdminDriverProfileTab';
import { SosEmergencyModal } from '../components/SosEmergencyModal';
import { NotificationsModal } from '../components/NotificationsModal';
import { RideRoutePlaybackModal } from '../components/RideRoutePlaybackModal';
import { AdminRecordedRoutesTab } from '../components/AdminRecordedRoutesTab';
import { AdminPlatformFinanceTab } from '../components/AdminPlatformFinanceTab';
import { AdminMasterOverviewTab } from '../components/AdminMasterOverviewTab';
import { AdminSosCenterTab } from '../components/AdminSosCenterTab';
import { AdminRideCategoriesTab } from '../components/AdminRideCategoriesTab';
import { normalizeCategoriesFromConfig } from '../utils/categoryEngine';
import { WhatsAppIcon } from '../components/WhatsAppIcon';
import { isDriverVehicleConfigured, getMissingVehicleFields } from '../services/vehicleService';
import { 
  formatPhone, formatRideCode, parseCurrencyInput, parseCurrencyToFloat, 
  formatCurrency, formatCurrencyValue, getCleanWhatsappNumber 
} from '../utils/format';

interface AdminDashboardScreenProps {
  rides: Ride[];
  config: SystemConfig;
  onRefreshData: () => void;
  onExitAdmin: () => void;
}

export const AdminDashboardScreen: React.FC<AdminDashboardScreenProps> = ({
  rides,
  config,
  onRefreshData,
  onExitAdmin,
}) => {
  const [activeTab, setActiveTab] = useState<'corridas' | 'plataforma' | 'categorias' | 'agenda' | 'rotas' | 'financeiro' | 'sos' | 'clientes' | 'perfil' | 'config'>('corridas');
  const [activeSosAlertsCount, setActiveSosAlertsCount] = useState<number>(0);

  useEffect(() => {
    const checkSosCount = async () => {
      try {
        const res = await fetch(`/api/sos/alerts?_t=${Date.now()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.alerts)) {
          setActiveSosAlertsCount(data.alerts.filter((a: any) => a.status !== 'resolvido').length);
        }
      } catch {}
    };
    checkSosCount();
    const t = setInterval(checkSosCount, 3000);
    return () => clearInterval(t);
  }, []);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [filterDate, setFilterDate] = useState<string>('');
  const [selectedRideDetail, setSelectedRideDetail] = useState<Ride | null>(null);
  const [gpsRide, setGpsRide] = useState<Ride | null>(null);
  const [checkoutRide, setCheckoutRide] = useState<Ride | null>(null);
  const [auditPlaybackRide, setAuditPlaybackRide] = useState<Ride | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSosOpen, setIsSosOpen] = useState(false);
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);
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

  // Estados de Clientes & Histórico Completo
  const [clientsList, setClientsList] = useState<ClientProfile[]>(() => StorageService.getClients());
  const [isClientFormOpen, setIsClientFormOpen] = useState(false);
  const [clientToEdit, setClientToEdit] = useState<ClientProfile | null>(null);
  const [selectedClientDetail, setSelectedClientDetail] = useState<ClientProfile | null>(null);
  const [termsViewerClient, setTermsViewerClient] = useState<ClientProfile | null>(null);
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [manualInitialClientName, setManualInitialClientName] = useState('');
  const [manualInitialClientPhone, setManualInitialClientPhone] = useState('');
  const [editingRide, setEditingRide] = useState<Ride | null>(null);

  // Monitora chegada de novas corridas pendentes para tocar sinal sonoro no painel do motorista
  const prevPendingIdsRef = useRef<Set<string>>(new Set(rides.filter(r => r.status === 'aguardando_confirmacao').map(r => r.id)));
  const isFirstMountRef = useRef(true);

  useEffect(() => {
    const currentPending = rides.filter(r => r.status === 'aguardando_confirmacao');
    const currentPendingIds = new Set(currentPending.map(r => r.id));

    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      prevPendingIdsRef.current = currentPendingIds;
      return;
    }

    // Se surgiu um novo ID de corrida que não existia na lista anterior
    const hasNewPending = currentPending.some(r => !prevPendingIdsRef.current.has(r.id));
    if (hasNewPending) {
      playNewRideSound();
    }
    prevPendingIdsRef.current = currentPendingIds;
  }, [rides]);

  const handleOpenEditRide = (ride: Ride) => {
    if (!ride.isManualBooking) {
      alert('Somente agendamentos e transações adicionados manualmente pelo motorista podem ser editados.');
      return;
    }
    setEditingRide(ride);
    setIsManualModalOpen(true);
  };

  const refreshClients = () => {
    setClientsList(StorageService.getClients());
  };

  const handleOpenClientDetail = (client: ClientProfile) => {
    setSelectedClientDetail(client);
  };

  const handleEditClient = (client: ClientProfile) => {
    setClientToEdit(client);
    setIsClientFormOpen(true);
  };

  const handleScheduleForClient = (client: ClientProfile) => {
    setManualInitialClientName(client.name);
    setManualInitialClientPhone(client.phone);
    setManualInitialDate(selectedAgendaDate || todayStr);
    setManualInitialTime('');
    setIsManualModalOpen(true);
  };

  const handleDeleteClient = (clientId: string) => {
    StorageService.deleteClient(clientId);
    refreshClients();
    if (selectedClientDetail?.id === clientId) {
      setSelectedClientDetail(null);
    }
  };

  // Métricas do Dashboard & Data
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

  // Estados de Despesas & Financeiro
  const [financePeriod, setFinancePeriod] = useState<'hoje' | 'semanal' | 'mensal' | 'todos'>('mensal');
  const [financeSelectedMonth, setFinanceSelectedMonth] = useState<string>(() => todayStr.slice(0, 7));
  const [financeFeedFilter, setFinanceFeedFilter] = useState<'todos' | 'entradas' | 'despesas' | 'a_receber'>('todos');
  const [expenses, setExpenses] = useState<Expense[]>(() => StorageService.getExpenses());
  const [newTransactionType, setNewTransactionType] = useState<'entrada' | 'saida'>('saida');
  const [newTransactionPaymentMethod, setNewTransactionPaymentMethod] = useState<PaymentMethod>('pix');
  const [newExpenseDesc, setNewExpenseDesc] = useState('');
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [newExpenseCat, setNewExpenseCat] = useState<string>('Combustível');
  const [newExpenseDate, setNewExpenseDate] = useState(todayStr);
  const [newExpenseTime, setNewExpenseTime] = useState<string>(() => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [selectedExpenseDetail, setSelectedExpenseDetail] = useState<Expense | null>(null);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [isSyncingDb, setIsSyncingDb] = useState(false);

  // Sincronizar com o banco de dados Supabase PostgreSQL
  const handleSyncDatabase = async () => {
    setIsSyncingDb(true);
    try {
      await StorageService.syncFromDatabase();
      setExpenses(StorageService.getExpenses());
      setClientsList(StorageService.getClients());
      onRefreshData();
    } catch (err) {
      console.warn('Erro ao sincronizar com banco:', err);
    } finally {
      setIsSyncingDb(false);
    }
  };

  // Navegação de Meses no Painel Financeiro
  const handleShiftFinanceMonth = (delta: number) => {
    const [y, m] = financeSelectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const ny = d.getFullYear();
    const nm = String(d.getMonth() + 1).padStart(2, '0');
    setFinanceSelectedMonth(`${ny}-${nm}`);
  };

  const financeMonthLabel = React.useMemo(() => {
    const [y, m] = financeSelectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    const monthName = d.toLocaleDateString('pt-BR', { month: 'long' });
    return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} de ${y}`;
  }, [financeSelectedMonth]);

  const isCurrentFinanceMonth = financeSelectedMonth === todayStr.slice(0, 7);

  // Estados de Configuração com Edição Livre e Formatação Automática ao Sair do Campo
  const [currentConfig, setCurrentConfig] = useState<SystemConfig>(config);
  const [configSaved, setConfigSaved] = useState(false);
  const [isConfigDirty, setIsConfigDirty] = useState(false);
  const [baseFareStr, setBaseFareStr] = useState<string>(formatCurrencyValue(config.baseFare));
  const [pricePerKmStr, setPricePerKmStr] = useState<string>(formatCurrencyValue(config.pricePerKm));
  const [pricePerMinuteStr, setPricePerMinuteStr] = useState<string>(formatCurrencyValue(config.pricePerMinute));
  const [minimumFareStr, setMinimumFareStr] = useState<string>(formatCurrencyValue(config.minimumFare));
  const [nightSurchargeStr, setSetNightSurchargeStr] = useState<string>(String(config.nightSurchargePercent ?? 20));
  const [whatsappStr, setWhatsappStr] = useState<string>(formatPhone(config.companyWhatsapp));

  // Sincroniza estados formatados apenas se o usuário não estiver editando na aba de configuração
  React.useEffect(() => {
    if (isConfigDirty || activeTab === 'config') return;
    setCurrentConfig(config);
    setBaseFareStr(formatCurrencyValue(config.baseFare));
    setPricePerKmStr(formatCurrencyValue(config.pricePerKm));
    setPricePerMinuteStr(formatCurrencyValue(config.pricePerMinute));
    setMinimumFareStr(formatCurrencyValue(config.minimumFare));
    setSetNightSurchargeStr(String(config.nightSurchargePercent ?? 20));
    setWhatsappStr(formatPhone(config.companyWhatsapp));
  }, [config, isConfigDirty, activeTab]);

  // Estados de Simulação ao Vivo (Estilo Uber)
  const [simKm, setSimKm] = useState<number>(10);
  const [simKmStr, setSimKmStr] = useState<string>('10');
  const [simMin, setSimMin] = useState<number>(15);
  const [simMinStr, setSimMinStr] = useState<string>('15');
  const [simNight, setSimNight] = useState<boolean>(false);

  // ==========================================
  // ESTADOS E HELPERS DA AGENDA ESTILO IOS
  // ==========================================
  const [selectedAgendaDate, setSelectedAgendaDate] = useState<string>(todayStr);
  const [isMonthCalendarOpen, setIsMonthCalendarOpen] = useState<boolean>(false);
  const [calendarMonthOffset, setCalendarMonthOffset] = useState<number>(0);
  const [manualInitialDate, setManualInitialDate] = useState<string>('');
  const [manualInitialTime, setManualInitialTime] = useState<string>('');
  const [agendaSubTab, setAgendaSubTab] = useState<'agenda' | 'bloquear' | 'horarios'>('agenda');
  const [agendaViewHours, setAgendaViewHours] = useState<'trabalho' | '24h'>('trabalho');
  const [customBlockTime, setCustomBlockTime] = useState<string>('12:00');
  const [blockedSlots, setBlockedSlots] = useState<Record<string, string[]>>(() => {
    return StorageService.getBlockedSlots();
  });

  // Re-sincronizar slots bloqueados e lista de clientes sempre que houver alteração ou sync com Supabase
  React.useEffect(() => {
    const handleSlotsSync = () => {
      setBlockedSlots(StorageService.getBlockedSlots());
      setClientsList(StorageService.getClients());
    };
    window.addEventListener('up_blocked_slots_updated', handleSlotsSync);
    window.addEventListener('up_database_synced', handleSlotsSync);
    return () => {
      window.removeEventListener('up_blocked_slots_updated', handleSlotsSync);
      window.removeEventListener('up_database_synced', handleSlotsSync);
    };
  }, []);

  const handleBlockSlot = (slotTime: string) => {
    StorageService.blockSlot(selectedAgendaDate, slotTime);
    setBlockedSlots(StorageService.getBlockedSlots());
  };

  const handleUnblockSlot = (slotTime: string) => {
    StorageService.unblockSlot(selectedAgendaDate, slotTime);
    setBlockedSlots(StorageService.getBlockedSlots());
  };

  const toggleBlockSlot = (slotTime: string) => {
    const isCurrentlyBlocked = (blockedSlots[selectedAgendaDate] || []).includes(slotTime);
    if (isCurrentlyBlocked) {
      handleUnblockSlot(slotTime);
    } else {
      handleBlockSlot(slotTime);
    }
  };

  const calculateEndTime = (timeStr: string, durationMinutes: number = 30) => {
    const [h, m] = timeStr.split(':').map(Number);
    const totalM = h * 60 + (m || 0) + durationMinutes;
    const endH = Math.floor(totalM / 60) % 24;
    const endM = totalM % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  };

  // Corridas da data selecionada na agenda (SOMENTE ATIVAS - Corridas canceladas NÃO ocupam horário!)
  const agendaRides = React.useMemo(() => {
    return rides
      .filter(r => r.date === selectedAgendaDate && r.status !== 'cancelada')
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [rides, selectedAgendaDate]);

  // Gerador de slots da timeline diária (30 em 30 min no modelo solicitado)
  const dayTimelineSlots = React.useMemo(() => {
    const slots: string[] = [];
    const startHour = agendaViewHours === '24h' ? 0 : 6;
    const endHour = 24;
    for (let h = startHour; h < endHour; h++) {
      const hStr = String(h).padStart(2, '0');
      slots.push(`${hStr}:00`);
      slots.push(`${hStr}:30`);
    }
    return slots;
  }, [agendaViewHours]);

  // Busca a ocupação inteligente do slot considerando minutagem da corrida e intervalo pós-viagem
  const getSlotOccupation = (slotTime: string) => {
    const [slotH, slotM] = slotTime.split(':').map(Number);
    const slotStartMin = slotH * 60 + (slotM || 0);
    const slotEndMin = slotStartMin + 30;
    const bufferMin = typeof currentConfig.bufferBetweenRidesMin === 'number' ? currentConfig.bufferBetweenRidesMin : 30;

    for (const r of agendaRides) {
      const [rH, rM] = (r.time || '12:00').split(':').map(Number);
      const rStartMin = rH * 60 + (rM || 0);
      const rDuration = r.durationMin && r.durationMin > 0 ? r.durationMin : 30;
      const rEndMin = rStartMin + rDuration;
      const rEndWithBuffer = rEndMin + bufferMin;

      // 1. Início da corrida (começa dentro desta faixa de 30 min)
      if (rStartMin >= slotStartMin && rStartMin < slotEndMin) {
        return { type: 'ride_start' as const, ride: r, occupied: true };
      }

      // 2. Viagem em andamento (a corrida começou antes e ainda está rolando neste horário)
      if (slotStartMin < rEndMin && slotEndMin > rStartMin) {
        return { type: 'ride_transit' as const, ride: r, occupied: true };
      }

      // 3. Janela de descanso/deslocamento pós-viagem (buffer de segurança)
      if (bufferMin > 0 && slotStartMin < rEndWithBuffer && slotEndMin > rEndMin) {
        return { type: 'ride_buffer' as const, ride: r, occupied: true };
      }
    }

    return null;
  };

  // Busca se existe corrida iniciando no slot
  const getRideForSlot = (slotTime: string) => {
    const occ = getSlotOccupation(slotTime);
    if (occ?.type === 'ride_start') return occ.ride;
    return undefined;
  };

  // Mapa de contagem de viagens por data para bolinhas indicadoras
  const ridesCountByDate = React.useMemo(() => {
    const map: Record<string, { total: number; pending: number }> = {};
    rides.forEach(r => {
      if (r.status !== 'cancelada') {
        if (!map[r.date]) map[r.date] = { total: 0, pending: 0 };
        map[r.date].total += 1;
        if (r.status === 'aguardando_confirmacao') map[r.date].pending += 1;
      }
    });
    return map;
  }, [rides]);

  // Função para avançar ou recuar dias na agenda
  const handleShiftAgendaDay = (daysDelta: number) => {
    const [y, m, d] = selectedAgendaDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d, 12, 0, 0);
    dateObj.setDate(dateObj.getDate() + daysDelta);
    const ny = dateObj.getFullYear();
    const nm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const nd = String(dateObj.getDate()).padStart(2, '0');
    setSelectedAgendaDate(`${ny}-${nm}-${nd}`);
  };

  // Dias da fita semanal estilo iOS (semana da data selecionada)
  const weekStripDays = React.useMemo(() => {
    const [y, m, d] = selectedAgendaDate.split('-').map(Number);
    const center = new Date(y, m - 1, d, 12, 0, 0);
    const dayOfWeek = center.getDay(); // 0 = Domingo, 1 = Segunda...
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(center);
    monday.setDate(center.getDate() + diffToMonday);

    const list: { dateStr: string; dayNum: number; weekDayShort: string; isToday: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const cur = new Date(monday);
      cur.setDate(monday.getDate() + i);
      const curY = cur.getFullYear();
      const curM = String(cur.getMonth() + 1).padStart(2, '0');
      const curD = String(cur.getDate()).padStart(2, '0');
      const dStr = `${curY}-${curM}-${curD}`;
      const shortWeekday = cur.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').slice(0, 3).toUpperCase();
      list.push({
        dateStr: dStr,
        dayNum: cur.getDate(),
        weekDayShort: shortWeekday,
        isToday: dStr === todayStr
      });
    }
    return list;
  }, [selectedAgendaDate, todayStr]);

  // Informações da data selecionada para exibição
  const agendaDateInfo = React.useMemo(() => {
    const [y, m, d] = selectedAgendaDate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d, 12, 0, 0);
    const weekdayFull = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
    const capitalizedWeekday = weekdayFull.charAt(0).toUpperCase() + weekdayFull.slice(1);
    const monthFull = dateObj.toLocaleDateString('pt-BR', { month: 'long' });
    const capitalizedMonth = monthFull.charAt(0).toUpperCase() + monthFull.slice(1);
    const isToday = selectedAgendaDate === todayStr;
    const isTomorrow = selectedAgendaDate === tomorrowStr;

    return {
      weekday: capitalizedWeekday,
      day: d,
      month: capitalizedMonth,
      year: y,
      isToday,
      isTomorrow,
      subtitle: isToday ? 'Hoje' : isTomorrow ? 'Amanhã' : `${d} de ${capitalizedMonth}`
    };
  }, [selectedAgendaDate, todayStr, tomorrowStr]);

  // Grade do mês do calendário personalizado
  const monthGridData = React.useMemo(() => {
    const [baseY, baseM] = selectedAgendaDate.split('-').map(Number);
    const targetDate = new Date(baseY, baseM - 1 + calendarMonthOffset, 1, 12, 0, 0);
    const year = targetDate.getFullYear();
    const monthZeroIndexed = targetDate.getMonth();
    const monthName = targetDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const capitalizedMonthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    const firstDay = new Date(year, monthZeroIndexed, 1).getDay(); // 0 = Domingo
    const totalDays = new Date(year, monthZeroIndexed + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, monthZeroIndexed, 0).getDate();

    const cells: { dateStr: string; dayNum: number; isCurrentMonth: boolean; isToday: boolean; isSelected: boolean }[] = [];

    // Dias do mês anterior para completar o início da semana
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevMonthTotalDays - i;
      const prevM = monthZeroIndexed === 0 ? 12 : monthZeroIndexed;
      const prevY = monthZeroIndexed === 0 ? year - 1 : year;
      const dStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dateStr: dStr,
        dayNum: d,
        isCurrentMonth: false,
        isToday: dStr === todayStr,
        isSelected: dStr === selectedAgendaDate
      });
    }

    // Dias do mês atual
    for (let d = 1; d <= totalDays; d++) {
      const dStr = `${year}-${String(monthZeroIndexed + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dateStr: dStr,
        dayNum: d,
        isCurrentMonth: true,
        isToday: dStr === todayStr,
        isSelected: dStr === selectedAgendaDate
      });
    }

    // Dias do próximo mês para completar semanas
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextM = monthZeroIndexed === 11 ? 1 : monthZeroIndexed + 2;
      const nextY = monthZeroIndexed === 11 ? year + 1 : year;
      const dStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dateStr: dStr,
        dayNum: d,
        isCurrentMonth: false,
        isToday: dStr === todayStr,
        isSelected: dStr === selectedAgendaDate
      });
    }

    return {
      title: capitalizedMonthName,
      cells
    };
  }, [selectedAgendaDate, calendarMonthOffset, todayStr]);

  const todayRides = rides.filter(r => r.date === todayStr);
  const tomorrowRides = rides.filter(r => r.date === tomorrowStr);
  const pendingRides = rides.filter(r => r.status === 'aguardando_confirmacao');
  const confirmedRides = rides.filter(r => r.status === 'confirmada');

  // Faturamento
  const totalReceivedToday = todayRides
    .filter(r => r.paymentStatus === 'pago')
    .reduce((acc, r) => acc + r.totalPrice, 0);

  const totalMonthRevenue = rides
    .filter(r => r.paymentStatus === 'pago')
    .reduce((acc, r) => acc + r.totalPrice, 0);

  const totalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);
  const netProfit = totalMonthRevenue - totalExpenses;

  // Faturamento por Forma de Pagamento (Geral)
  const paidRides = rides.filter(r => r.paymentStatus === 'pago');
  const pixRevenue = paidRides.filter(r => r.paymentMethod === 'pix').reduce((acc, r) => acc + r.totalPrice, 0);
  const pixCount = paidRides.filter(r => r.paymentMethod === 'pix').length;

  const cardRevenue = paidRides.filter(r => r.paymentMethod === 'cartao_credito' || r.paymentMethod === 'cartao_debito').reduce((acc, r) => acc + r.totalPrice, 0);
  const cardCount = paidRides.filter(r => r.paymentMethod === 'cartao_credito' || r.paymentMethod === 'cartao_debito').length;

  const cashRevenue = paidRides.filter(r => r.paymentMethod === 'dinheiro').reduce((acc, r) => acc + r.totalPrice, 0);
  const cashCount = paidRides.filter(r => r.paymentMethod === 'dinheiro').length;

  // Cálculos do Hub Financeiro com Filtro Inteligente de Período e Navegação de Meses
  const financeStats = React.useMemo(() => {
    const now = new Date();
    const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    // Corridas no período selecionado
    const periodRides = rides.filter(r => {
      if (financePeriod === 'todos') return true;
      if (financePeriod === 'hoje') return r.date === todayStr || r.date === localToday;
      if (financePeriod === 'mensal') return r.date.startsWith(financeSelectedMonth);
      if (financePeriod === 'semanal') {
        const rideD = new Date(r.date + 'T12:00:00');
        const diffTime = Math.abs(now.getTime() - rideD.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= 7;
      }
      return true;
    });

    // Despesas e Entradas manuais no período selecionado
    const periodExpenses = expenses.filter(e => {
      if (financePeriod === 'todos') return true;
      if (financePeriod === 'hoje') return e.date === todayStr || e.date === localToday;
      if (financePeriod === 'mensal') return e.date.startsWith(financeSelectedMonth);
      if (financePeriod === 'semanal') {
        const expD = new Date(e.date + 'T12:00:00');
        const diffTime = Math.abs(now.getTime() - expD.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= 7;
      }
      return true;
    });

    const periodEntradas = periodExpenses.filter(e => e.type === 'entrada');
    const periodSaidas = periodExpenses.filter(e => e.type !== 'entrada');

    // Agendamentos ativos (não cancelados entram para o faturamento financeiro)
    const activeRides = periodRides.filter(r => r.status !== 'cancelada');
    const paid = activeRides.filter(r => r.paymentStatus === 'pago');
    const pending = activeRides.filter(r => r.paymentStatus !== 'pago');

    // Faturamento Total: Agendamentos + Entradas Manuais
    const manualEntradasTotal = periodEntradas.reduce((acc, e) => acc + (e.amount || 0), 0);
    const ridesTotalRev = activeRides.reduce((acc, r) => acc + (r.totalPrice || 0), 0);
    const totalRev = ridesTotalRev + manualEntradasTotal;
    const paidRev = paid.reduce((acc, r) => acc + (r.totalPrice || 0), 0) + manualEntradasTotal;
    const pendingRev = pending.reduce((acc, r) => acc + (r.totalPrice || 0), 0);

    const totalExp = periodSaidas.reduce((acc, e) => acc + (e.amount || 0), 0);
    const net = totalRev - totalExp; // Lucro líquido
    const paidNet = paidRev - totalExp; // Lucro líquido liquidado em caixa
    const margin = totalRev > 0 ? Math.round((net / totalRev) * 100) : (totalExp > 0 ? -100 : 0);
    const marginBadge = net > 0 ? `+${margin}% Margem` : net === 0 ? 'Equilibrado' : 'Despesas > Receita';

    // Por forma de pagamento (corridas ativas + entradas manuais)
    const pixRidesRev = activeRides.filter(r => r.paymentMethod === 'pix').reduce((acc, r) => acc + r.totalPrice, 0);
    const pixManualRev = periodEntradas.filter(e => e.paymentMethod === 'pix').reduce((acc, e) => acc + e.amount, 0);
    const pixRRev = pixRidesRev + pixManualRev;
    const pixPct = totalRev > 0 ? Math.round((pixRRev / totalRev) * 100) : 0;

    const cardRidesRev = activeRides.filter(r => r.paymentMethod === 'cartao_credito' || r.paymentMethod === 'cartao_debito').reduce((acc, r) => acc + r.totalPrice, 0);
    const cardManualRev = periodEntradas.filter(e => e.paymentMethod === 'cartao_credito' || e.paymentMethod === 'cartao_debito').reduce((acc, e) => acc + e.amount, 0);
    const cardRRev = cardRidesRev + cardManualRev;
    const cardPct = totalRev > 0 ? Math.round((cardRRev / totalRev) * 100) : 0;

    const cashRidesRev = activeRides.filter(r => r.paymentMethod === 'dinheiro').reduce((acc, r) => acc + r.totalPrice, 0);
    const cashManualRev = periodEntradas.filter(e => e.paymentMethod === 'dinheiro').reduce((acc, e) => acc + e.amount, 0);
    const cashRRev = cashRidesRev + cashManualRev;
    const cashPct = totalRev > 0 ? Math.round((cashRRev / totalRev) * 100) : 0;

    // Métricas Operacionais
    const avgTicket = (activeRides.length + periodEntradas.length) > 0 ? totalRev / (activeRides.length + periodEntradas.length) : 0;
    const totalKm = activeRides.reduce((acc, r) => acc + (r.distanceKm || 0), 0);
    const revPerKm = totalKm > 0 ? totalRev / totalKm : 0;
    const totalMin = activeRides.reduce((acc, r) => acc + (r.durationMin || 0), 0);
    const hourlyEarnings = totalMin > 0 ? (totalRev / totalMin) * 60 : 0;

    return {
      periodRides,
      periodExpenses,
      periodEntradas,
      periodSaidas,
      activeRides,
      paidRides: paid,
      pendingRides: pending,
      totalRev,
      paidRev,
      pendingRev,
      totalExp,
      net,
      paidNet,
      margin,
      marginBadge,
      pixRides: activeRides.filter(r => r.paymentMethod === 'pix'),
      pixRev: pixRRev,
      pixPct,
      cardRides: activeRides.filter(r => r.paymentMethod === 'cartao_credito' || r.paymentMethod === 'cartao_debito'),
      cardRev: cardRRev,
      cardPct,
      cashRides: activeRides.filter(r => r.paymentMethod === 'dinheiro'),
      cashRev: cashRRev,
      cashPct,
      avgTicket,
      totalKm,
      revPerKm,
      totalMin,
      hourlyEarnings
    };
  }, [rides, expenses, financePeriod, financeSelectedMonth, todayStr]);

  // Garante que o veículo oficial está cadastrado antes de confirmar ou iniciar corridas
  const ensureVehicleConfigured = (): boolean => {
    const missing = getMissingVehicleFields(currentConfig);
    if (missing.length > 0) {
      alert(
        `⚠️ CADASTRO DO VEÍCULO OBRIGATÓRIO\n\nPara segurança e transparência com o passageiro, preencha manualmente os dados reais do seu veículo antes de confirmar ou iniciar uma corrida:\n\n• ${missing.join('\n• ')}\n\nVocê será direcionado para a aba Perfil do Motorista.`
      );
      setSelectedRideDetail(null);
      setActiveTab('perfil');
      return false;
    }
    return true;
  };

  // Atualizar Status da Corrida
  const handleUpdateStatus = (rideId: string, newStatus: RideStatus): boolean => {
    if (newStatus === 'confirmada' || newStatus === 'a_caminho' || newStatus === 'em_andamento') {
      if (!ensureVehicleConfigured()) return false;
    }
    const ride = rides.find(r => r.id === rideId);
    if (!ride) return false;
    const updated = { ...ride, status: newStatus };
    if (newStatus === 'finalizada') {
      updated.paymentStatus = 'pago';
    }
    StorageService.saveRide(updated);
    if (newStatus === 'cancelada') {
      // Ao cancelar corrida, libera qualquer bloqueio manual que possa ter sido associado ao mesmo slot
      StorageService.unblockSlot(ride.date, ride.time);
      setBlockedSlots(StorageService.getBlockedSlots());
    }
    onRefreshData();
    if (selectedRideDetail?.id === rideId) {
      setSelectedRideDetail(updated);
    }
    return true;
  };

  // Confirmar Pagamento com Checkout Oficial (PIX QR Code, Cartão ou Dinheiro)
  const handleConfirmPayment = (rideId: string, method: PaymentMethod) => {
    const ride = rides.find(r => r.id === rideId);
    if (!ride) return;
    const isCompleted = ride.status === 'em_andamento' || ride.status === 'a_caminho' || ride.status === 'finalizada';
    const updated: Ride = {
      ...ride,
      status: isCompleted ? 'finalizada' : ride.status === 'aguardando_confirmacao' ? 'confirmada' : ride.status,
      paymentStatus: 'pago',
      paymentMethod: method,
      updatedAt: new Date().toISOString()
    };
    StorageService.saveRide(updated);
    onRefreshData();
    setCheckoutRide(null);
    if (selectedRideDetail?.id === rideId) {
      setSelectedRideDetail(updated);
    }
  };

  // Atualizar Status do Pagamento
  const handleUpdatePaymentStatus = (rideId: string, newPaymentStatus: any) => {
    const ride = rides.find(r => r.id === rideId);
    if (!ride) return;
    const updated = { ...ride, paymentStatus: newPaymentStatus };
    StorageService.saveRide(updated);
    onRefreshData();
    if (selectedRideDetail?.id === rideId) {
      setSelectedRideDetail(updated);
    }
  };

  // Excluir Corrida
  const handleDeleteRide = (rideId: string) => {
    const ride = rides.find(r => r.id === rideId);
    if (window.confirm('Tem certeza que deseja excluir esta corrida? O horário agendado será liberado imediatamente.')) {
      if (ride) {
        StorageService.unblockSlot(ride.date, ride.time);
        setBlockedSlots(StorageService.getBlockedSlots());
      }
      StorageService.deleteRide(rideId);
      setSelectedRideDetail(null);
      onRefreshData();
    }
  };

  // Abertura do Modal Compacto de Entrada / Saída
  const handleOpenNewTransaction = (type: 'entrada' | 'saida') => {
    setEditingExpenseId(null);
    setNewTransactionType(type);
    setNewExpenseDesc('');
    setNewExpenseAmount('');
    setNewExpenseCat(type === 'entrada' ? 'Corrida Particular' : 'Combustível');
    setNewTransactionPaymentMethod(type === 'entrada' ? 'pix' : 'dinheiro');
    setNewExpenseDate(todayStr);
    setIsExpenseModalOpen(true);
  };

  // Gerenciamento de Entradas & Saídas (Salvar, Editar, Excluir e Compartilhar)
  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpenseDesc.trim() || !newExpenseAmount) return;
    const amountVal = parseCurrencyToFloat(newExpenseAmount);
    if (amountVal <= 0) return;

    const dStr = newExpenseDate || todayStr;
    const tStr = newExpenseTime || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    let combinedIso = new Date().toISOString();
    try {
      const [h, m] = tStr.split(':').map(Number);
      const [year, month, day] = dStr.split('-').map(Number);
      const customDate = new Date(year, month - 1, day, h || 0, m || 0, 0);
      if (!isNaN(customDate.getTime())) {
        combinedIso = customDate.toISOString();
      }
    } catch {
      // fallback
    }

    if (editingExpenseId) {
      const existing = expenses.find(x => x.id === editingExpenseId);
      if (existing) {
        const updated: Expense = {
          ...existing,
          category: newExpenseCat.trim() || (newTransactionType === 'entrada' ? 'Corrida Particular' : 'Outros'),
          description: newExpenseDesc.trim(),
          amount: amountVal,
          date: dStr,
          type: newTransactionType,
          paymentMethod: newTransactionPaymentMethod,
          createdAt: combinedIso
        };
        StorageService.saveExpense(updated);
        if (selectedExpenseDetail?.id === updated.id) {
          setSelectedExpenseDetail(updated);
        }
      }
    } else {
      const item: Expense = {
        id: `exp-${Date.now()}`,
        category: newExpenseCat.trim() || (newTransactionType === 'entrada' ? 'Corrida Particular' : 'Outros'),
        description: newExpenseDesc.trim(),
        amount: amountVal,
        date: dStr,
        type: newTransactionType,
        paymentMethod: newTransactionPaymentMethod,
        createdAt: combinedIso
      };
      StorageService.saveExpense(item);
    }
    setExpenses(StorageService.getExpenses());
    handleCancelEditExpense();
    onRefreshData();
  };

  const handleEditExpense = (exp: Expense) => {
    setEditingExpenseId(exp.id);
    setNewTransactionType(exp.type === 'entrada' ? 'entrada' : 'saida');
    setNewExpenseCat(exp.category || (exp.type === 'entrada' ? 'Corrida Particular' : 'Combustível'));
    setNewExpenseDesc(exp.description);
    setNewExpenseAmount(formatCurrencyValue(exp.amount));
    setNewTransactionPaymentMethod(exp.paymentMethod || (exp.type === 'entrada' ? 'pix' : 'dinheiro'));
    setNewExpenseDate(exp.date);
    
    let tStr = '';
    if (exp.createdAt) {
      try {
        const d = new Date(exp.createdAt);
        if (!isNaN(d.getTime())) {
          tStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }
      } catch {}
    }
    setNewExpenseTime(tStr || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    setIsExpenseModalOpen(true);
  };

  const handleCancelEditExpense = () => {
    setEditingExpenseId(null);
    setNewExpenseDesc('');
    setNewExpenseAmount('');
    setNewExpenseCat('Combustível');
    setNewTransactionType('saida');
    setNewTransactionPaymentMethod('pix');
    setNewExpenseDate(todayStr);
    setNewExpenseTime(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    setIsExpenseModalOpen(false);
  };

  const handleDeleteExpense = (id: string) => {
    const item = expenses.find(x => x.id === id);
    const label = item?.type === 'entrada' ? 'esta entrada' : 'esta despesa';
    if (window.confirm(`Tem certeza que deseja excluir ${label}?`)) {
      StorageService.deleteExpense(id);
      setExpenses(StorageService.getExpenses());
      if (editingExpenseId === id) {
        handleCancelEditExpense();
      }
      if (selectedExpenseDetail?.id === id) {
        setSelectedExpenseDetail(null);
      }
      onRefreshData();
    }
  };

  const handleShareFinanceSummary = () => {
    const periodLabel = 
      financePeriod === 'hoje' ? 'Hoje' :
      financePeriod === 'semanal' ? 'Semanal (Últimos 7 Dias)' :
      financePeriod === 'mensal' ? `Mensal (${financeMonthLabel})` : 'Todo o Histórico';

    const text = `📊 *RELATÓRIO FINANCEIRO - KAVRO DRIVE* 🚀\n\n` +
      `📅 *Período:* ${periodLabel}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💰 *Receita Bruta Total:* R$ ${financeStats.totalRev.toFixed(2)}\n` +
      `⛽ *Despesas Operacionais:* R$ ${financeStats.totalExp.toFixed(2)}\n` +
      `🏆 *LUCRO LÍQUIDO:* R$ ${financeStats.net.toFixed(2)}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🚗 *Corridas Pagas:* ${financeStats.paidRides.length} viagens\n` +
      `🎯 *Ticket Médio:* R$ ${financeStats.avgTicket.toFixed(2)}\n` +
      `📍 *Ganho por KM:* R$ ${financeStats.revPerKm.toFixed(2)}/km\n` +
      `⏱️ *Ganho por Hora:* R$ ${financeStats.hourlyEarnings.toFixed(2)}/h\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `💳 *PIX:* R$ ${financeStats.pixRev.toFixed(2)} (${financeStats.pixPct}%)\n` +
      `💳 *Cartão:* R$ ${financeStats.cardRev.toFixed(2)} (${financeStats.cardPct}%)\n` +
      `💵 *Dinheiro:* R$ ${financeStats.cashRev.toFixed(2)} (${financeStats.cashPct}%)\n\n` +
      `_Kavro Drive • Painel Financeiro do Motorista_`;

    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  // Salvar Configurações
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanWhatsapp = getCleanWhatsappNumber(whatsappStr);
    const parsedBase = parseCurrencyToFloat(baseFareStr);
    const parsedKm = parseCurrencyToFloat(pricePerKmStr);
    const parsedMin = parseCurrencyToFloat(pricePerMinuteStr);
    const parsedFloor = parseCurrencyToFloat(minimumFareStr);
    const parsedNight = Math.min(100, Math.max(0, parseInt(nightSurchargeStr, 10) || 0));

    const toSave: SystemConfig = {
      ...currentConfig,
      baseFare: parsedBase,
      pricePerKm: parsedKm,
      pricePerMinute: parsedMin,
      minimumFare: parsedFloor,
      nightSurchargePercent: parsedNight,
      companyWhatsapp: cleanWhatsapp,
      companyPhone: formatPhone(whatsappStr)
    };
    setBaseFareStr(formatCurrencyValue(parsedBase));
    setPricePerKmStr(formatCurrencyValue(parsedKm));
    setPricePerMinuteStr(formatCurrencyValue(parsedMin));
    setMinimumFareStr(formatCurrencyValue(parsedFloor));
    setSetNightSurchargeStr(String(parsedNight));
    setCurrentConfig(toSave);
    setIsConfigDirty(false);
    await StorageService.saveConfig(toSave);
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 2500);
    onRefreshData();
  };

  // Filtro de Corridas
  const displayedRides = rides.filter(r => {
    if (filterDate && r.date !== filterDate) return false;
    return true;
  });

  return (
    <div className="animate-fade-in admin-mode admin-main-container" style={{ minHeight: '100vh', backgroundColor: '#FFFFFF', paddingBottom: 85 }}>
      {/* Modal de Criação / Edição de Corrida */}
      <ManualRideModal
        isOpen={isManualModalOpen}
        onClose={() => {
          setIsManualModalOpen(false);
          setEditingRide(null);
          setManualInitialTime('');
          setManualInitialClientName('');
          setManualInitialClientPhone('');
        }}
        config={config}
        initialDate={manualInitialDate || selectedAgendaDate}
        initialTime={manualInitialTime}
        initialClientName={manualInitialClientName}
        initialClientPhone={manualInitialClientPhone}
        editingRide={editingRide}
        onDeleteRide={handleDeleteRide}
        onRideCreated={() => {
          onRefreshData();
          refreshClients();
        }}
      />

      {/* Modal de Cadastro / Edição Manual de Cliente */}
      <ClientFormModal
        isOpen={isClientFormOpen}
        onClose={() => {
          setIsClientFormOpen(false);
          setClientToEdit(null);
        }}
        clientToEdit={clientToEdit}
        onSaved={(savedClient) => {
          refreshClients();
          if (selectedClientDetail?.id === savedClient.id) {
            setSelectedClientDetail(savedClient);
          }
        }}
      />

      {/* Modal de Ficha e Histórico Completo do Cliente */}
      <ClientDetailModal
        isOpen={Boolean(selectedClientDetail)}
        onClose={() => setSelectedClientDetail(null)}
        client={selectedClientDetail}
        rides={rides}
        config={config}
        onOpenRideDetail={(ride) => setSelectedRideDetail(ride)}
        onScheduleForClient={handleScheduleForClient}
        onEditClient={handleEditClient}
        onDeleteClient={handleDeleteClient}
      />

      <PassengerTermsContractModal
        isOpen={Boolean(termsViewerClient)}
        onClose={() => setTermsViewerClient(null)}
        mode="admin"
        client={termsViewerClient}
        config={config}
      />

      {/* Modal de Detalhes e Gestão da Corrida */}
      <RideDetailAdminModal
        isOpen={Boolean(selectedRideDetail)}
        ride={selectedRideDetail}
        onClose={() => setSelectedRideDetail(null)}
        config={config}
        onUpdateStatus={handleUpdateStatus}
        onUpdatePaymentStatus={handleUpdatePaymentStatus}
        onDeleteRide={handleDeleteRide}
        onEditRide={selectedRideDetail?.isManualBooking ? handleOpenEditRide : undefined}
        onOpenGps={(r) => {
          if (!ensureVehicleConfigured()) return;
          setSelectedRideDetail(null);
          setGpsRide(r);
        }}
        onOpenCheckout={(r) => {
          setSelectedRideDetail(null);
          setCheckoutRide(r);
        }}
      />

      {/* Tela de Navegação GPS em Tempo Real */}
      {gpsRide && (
        <LiveGpsNavigationScreen
          isOpen={Boolean(gpsRide)}
          ride={gpsRide}
          userRole="driver"
          onClose={() => {
            setGpsRide(null);
            onRefreshData();
          }}
          onUpdateStatus={(rideId, newStatus) => {
            handleUpdateStatus(rideId, newStatus);
            setGpsRide(prev => prev ? { ...prev, status: newStatus } : null);
          }}
          config={config}
        />
      )}

      {/* Modal Oficial de Recebimento de Pagamento (PIX QR Code, Cartão, Dinheiro) */}
      <RidePaymentCheckoutModal
        isOpen={Boolean(checkoutRide)}
        ride={checkoutRide}
        config={config}
        onClose={() => setCheckoutRide(null)}
        onPaymentConfirmed={(rideId, method) => handleConfirmPayment(rideId, method)}
      />

      {/* Modal Oficial de Emissão e Impressão de Relatório PDF no Filtro Selecionado */}
      <FinanceReportPdfModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        period={financePeriod}
        selectedMonthLabel={financeMonthLabel}
        stats={financeStats}
        config={config}
        onShareWhatsApp={handleShareFinanceSummary}
      />

      {/* Modal Compacto de Entrada & Saída (Menor, Flutuante e Rápido) */}
      {isExpenseModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            animation: 'fadeIn 0.15s ease-out'
          }}
          onClick={handleCancelEditExpense}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 20,
              width: '100%',
              maxWidth: 440,
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 45px rgba(0,0,0,0.3)',
              border: '1.5px solid #E2E8F0',
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14
            }}
          >
            {/* Header com Título e Fechar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #F1F5F9',
              paddingBottom: 10
            }}>
              <div>
                <h3 style={{ fontSize: '1.02rem', fontWeight: 900, color: '#121A21', margin: 0 }}>
                  {editingExpenseId
                    ? (newTransactionType === 'entrada' ? 'Editar Entrada' : 'Editar Saída')
                    : (newTransactionType === 'entrada' ? 'Nova Entrada' : 'Nova Saída')}
                </h3>
                <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                  {newTransactionType === 'entrada' ? 'Receita & ganho operacional' : 'Despesa & custo operacional'}
                </span>
              </div>

              <button
                type="button"
                onClick={handleCancelEditExpense}
                style={{
                  width: 32,
                  height: 32,
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
                <X size={16} />
              </button>
            </div>

            {/* Alternador Compacto: Entrada vs Saída */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 6,
              backgroundColor: '#F1F5F9',
              padding: 4,
              borderRadius: 14,
              border: '1px solid #E2E8F0'
            }}>
              <button
                type="button"
                onClick={() => {
                  setNewTransactionType('entrada');
                  if (!newExpenseCat || newExpenseCat === 'Combustível') {
                    setNewExpenseCat('Corrida Particular');
                  }
                }}
                style={{
                  padding: '8px 10px',
                  borderRadius: 10,
                  backgroundColor: newTransactionType === 'entrada' ? '#16A34A' : 'transparent',
                  color: newTransactionType === 'entrada' ? '#FFFFFF' : '#475569',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  boxShadow: newTransactionType === 'entrada' ? '0 2px 8px rgba(22, 163, 74, 0.3)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>🟢</span>
                <span>+ Entrada</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setNewTransactionType('saida');
                  if (!newExpenseCat || newExpenseCat === 'Corrida Particular') {
                    setNewExpenseCat('Combustível');
                  }
                }}
                style={{
                  padding: '8px 10px',
                  borderRadius: 10,
                  backgroundColor: newTransactionType === 'saida' ? '#DC2626' : 'transparent',
                  color: newTransactionType === 'saida' ? '#FFFFFF' : '#475569',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  boxShadow: newTransactionType === 'saida' ? '0 2px 8px rgba(220, 38, 38, 0.3)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>🔴</span>
                <span>- Saída (Despesa)</span>
              </button>
            </div>

            {/* Formulário */}
            <form onSubmit={handleSaveExpense} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Campo de Valor */}
              <div style={{
                backgroundColor: newTransactionType === 'entrada' ? 'rgba(22, 163, 74, 0.06)' : 'rgba(220, 38, 38, 0.06)',
                border: `1.5px solid ${newTransactionType === 'entrada' ? '#86EFAC' : '#FECACA'}`,
                borderRadius: 14,
                padding: '10px 14px',
                textAlign: 'center'
              }}>
                <span style={{
                  fontSize: '0.66rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  color: newTransactionType === 'entrada' ? '#15803D' : '#DC2626',
                  letterSpacing: '0.04em'
                }}>
                  {newTransactionType === 'entrada' ? 'Valor da Entrada' : 'Valor da Saída'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 2 }}>
                  <span style={{
                    fontSize: '1.25rem',
                    fontWeight: 900,
                    color: newTransactionType === 'entrada' ? '#16A34A' : '#DC2626'
                  }}>
                    {newTransactionType === 'entrada' ? '+ R$' : '- R$'}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0,00"
                    value={newExpenseAmount}
                    onChange={(e) => setNewExpenseAmount(parseCurrencyInput(e.target.value))}
                    autoFocus
                    style={{
                      fontSize: '1.75rem',
                      fontWeight: 900,
                      color: '#121A21',
                      border: 'none',
                      background: 'transparent',
                      outline: 'none',
                      width: '160px',
                      textAlign: 'center'
                    }}
                    required
                  />
                </div>
              </div>

              {/* Formato / Forma de Pagamento */}
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 5 }}>
                  Formato de Pagamento *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {[
                    { id: 'pix', label: 'PIX', icon: '💠' },
                    { id: 'cartao_credito', label: 'Cartão', icon: '💳' },
                    { id: 'dinheiro', label: 'Dinheiro', icon: '💵' }
                  ].map(m => {
                    const isSelected = newTransactionPaymentMethod === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setNewTransactionPaymentMethod(m.id as any)}
                        style={{
                          padding: '7px 4px',
                          borderRadius: 10,
                          border: isSelected ? '2px solid #121A21' : '1px solid #E2E8F0',
                          backgroundColor: isSelected ? '#121A21' : '#F8FAFC',
                          color: isSelected ? '#FFFFFF' : '#334155',
                          fontSize: '0.74rem',
                          fontWeight: isSelected ? 800 : 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>{m.icon}</span>
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Nome da Categoria */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>
                    Nome da Categoria *
                  </label>
                  <span style={{ fontSize: '0.64rem', color: '#94A3B8' }}>Escolha ou digite</span>
                </div>
                <input
                  type="text"
                  placeholder={newTransactionType === 'entrada' ? 'Ex: Corrida Particular' : 'Ex: Combustível'}
                  value={newExpenseCat}
                  onChange={(e) => setNewExpenseCat(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 10,
                    border: '1.5px solid #CBD5E1',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: '#121A21',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  required
                />

                {/* Sugestões Rápidas de Categoria */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                  {(newTransactionType === 'entrada' ? [
                    'Corrida Particular',
                    'Corrida Direta',
                    'Gorjeta',
                    'Frete / Entrega',
                    'Reembolso',
                    'Outros'
                  ] : [
                    'Combustível',
                    'Lavagem',
                    'Manutenção',
                    'Alimentação',
                    'Pedágio',
                    'Estacionar',
                    'Seguro/IPVA',
                    'Outros'
                  ]).map(catName => (
                    <button
                      key={catName}
                      type="button"
                      onClick={() => setNewExpenseCat(catName)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        backgroundColor: newExpenseCat === catName ? (newTransactionType === 'entrada' ? '#DCFCE7' : '#FEE2E2') : '#F1F5F9',
                        border: `1px solid ${newExpenseCat === catName ? (newTransactionType === 'entrada' ? '#86EFAC' : '#FECACA') : '#E2E8F0'}`,
                        color: newExpenseCat === catName ? (newTransactionType === 'entrada' ? '#15803D' : '#DC2626') : '#475569',
                        fontSize: '0.68rem',
                        fontWeight: newExpenseCat === catName ? 800 : 600,
                        cursor: 'pointer'
                      }}
                    >
                      {catName}
                    </button>
                  ))}
                </div>
              </div>

              {/* Descrição do Pagamento ou Despesa */}
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Descrição {newTransactionType === 'entrada' ? 'do Pagamento Recebido' : 'da Despesa'} *
                </label>
                <input
                  type="text"
                  placeholder={newTransactionType === 'entrada' ? 'Ex: Corrida avulsa centro ao aeroporto' : 'Ex: Abastecimento Shell'}
                  value={newExpenseDesc}
                  onChange={(e) => setNewExpenseDesc(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 10,
                    border: '1.5px solid #CBD5E1',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    color: '#121A21',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  required
                />
              </div>

              {/* Data e Horário Exato da Movimentação */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    Data do Lançamento
                  </label>
                  <input
                    type="date"
                    value={newExpenseDate}
                    onChange={(e) => setNewExpenseDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1.5px solid #CBD5E1',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: '#121A21',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    Horário Exato
                  </label>
                  <input
                    type="time"
                    value={newExpenseTime}
                    onChange={(e) => setNewExpenseTime(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1.5px solid #CBD5E1',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: '#121A21',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Botões do Rodapé */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={handleCancelEditExpense}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: 12,
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
                  type="submit"
                  style={{
                    flex: 2,
                    padding: '10px',
                    borderRadius: 12,
                    backgroundColor: newTransactionType === 'entrada' ? '#16A34A' : '#DC2626',
                    color: '#FFFFFF',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.84rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    boxShadow: newTransactionType === 'entrada' ? '0 3px 10px rgba(22, 163, 74, 0.3)' : '0 3px 10px rgba(220, 38, 38, 0.3)'
                  }}
                >
                  <CheckCircle2 size={15} />
                  <span>
                    {editingExpenseId
                      ? 'Salvar Alterações'
                      : (newTransactionType === 'entrada' ? 'Confirmar Entrada' : 'Confirmar Saída')}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Detalhes da Movimentação Financeira (Entrada / Saída) */}
      {selectedExpenseDetail && (() => {
        const isEntrada = selectedExpenseDetail.type === 'entrada';
        const formattedDate = selectedExpenseDetail.date
          ? selectedExpenseDetail.date.split('-').reverse().join('/')
          : '';

        let exactTime = '';
        if (selectedExpenseDetail.createdAt) {
          try {
            const d = new Date(selectedExpenseDetail.createdAt);
            if (!isNaN(d.getTime())) {
              exactTime = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            }
          } catch {
            // fallback
          }
        }
        if (!exactTime && selectedExpenseDetail.id.startsWith('exp-')) {
          const ts = parseInt(selectedExpenseDetail.id.replace('exp-', ''), 10);
          if (!isNaN(ts) && ts > 1000000000000) {
            exactTime = new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          }
        }

        const paymentLabel = {
          pix: 'PIX Instantâneo',
          dinheiro: 'Dinheiro em Espécie',
          cartao_credito: 'Cartão de Crédito/Débito',
          cartao_debito: 'Cartão de Débito',
          online: 'Online',
        }[selectedExpenseDetail.paymentMethod || 'dinheiro'] || 'Dinheiro';

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.70)',
              backdropFilter: 'blur(4px)',
              zIndex: 99999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              animation: 'fadeIn 0.15s ease-out'
            }}
            onClick={() => setSelectedExpenseDetail(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: '#1E2530',
                borderRadius: 20,
                width: '100%',
                maxWidth: 440,
                boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
                border: `1.5px solid ${isEntrada ? 'rgba(74, 222, 128, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                color: '#FFFFFF'
              }}
            >
              {/* Topo com Tipo e Fechar */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: '1.1rem' }}>{isEntrada ? '🟢' : '🔴'}</span>
                  <div>
                    <div style={{ fontSize: '0.90rem', fontWeight: 900, color: '#FFFFFF' }}>
                      {isEntrada ? 'Detalhes da Entrada' : 'Detalhes da Saída'}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>
                      Movimentação Financeira Operacional
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedExpenseDetail(null)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    color: '#94A3B8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Bloco de Valor */}
              <div style={{
                backgroundColor: isEntrada ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                borderRadius: 14,
                padding: '14px',
                textAlign: 'center',
                border: `1px solid ${isEntrada ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
              }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', color: isEntrada ? '#4ADE80' : '#F87171' }}>
                  {isEntrada ? 'Valor Recebido' : 'Valor Pago / Despesa'}
                </div>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: isEntrada ? '#4ADE80' : '#EF4444', marginTop: 2, letterSpacing: '-0.02em' }}>
                  {isEntrada ? '+' : '-'} R$ {selectedExpenseDetail.amount.toFixed(2).replace('.', ',')}
                </div>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#FFFFFF', marginTop: 4 }}>
                  {selectedExpenseDetail.description}
                </div>
              </div>

              {/* Grade de Especificações */}
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                borderRadius: 14,
                padding: '12px 14px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: 9,
                fontSize: '0.80rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Calendar size={13} color="#94A3B8" /> Data:
                  </span>
                  <strong style={{ color: '#FFFFFF' }}>{formattedDate}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Clock size={13} color="#94A3B8" /> Horário Exato:
                  </span>
                  <strong style={{ color: '#4ADE80', backgroundColor: 'rgba(74, 222, 128, 0.1)', padding: '2px 8px', borderRadius: 6 }}>
                    {exactTime || 'Horário de registro'}
                  </strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#94A3B8' }}>🏷️ Categoria:</span>
                  <strong style={{ color: '#FFFFFF' }}>{selectedExpenseDetail.category || 'Geral'}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#94A3B8' }}>💳 Forma de Pagamento:</span>
                  <strong style={{ color: '#FFFFFF' }}>{paymentLabel}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 7, fontSize: '0.72rem' }}>
                  <span style={{ color: '#64748B' }}>Identificador:</span>
                  <span style={{ color: '#94A3B8', fontFamily: 'monospace' }}>{selectedExpenseDetail.id}</span>
                </div>
              </div>

              {/* Botões de Ação */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => {
                    const expToEdit = selectedExpenseDetail;
                    setSelectedExpenseDetail(null);
                    handleEditExpense(expToEdit);
                  }}
                  style={{
                    padding: '11px',
                    borderRadius: 12,
                    backgroundColor: '#76D800',
                    color: '#121A21',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <Edit2 size={15} />
                  <span>Editar Lançamento</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const id = selectedExpenseDetail.id;
                    handleDeleteExpense(id);
                  }}
                  style={{
                    padding: '11px',
                    borderRadius: 12,
                    backgroundColor: 'rgba(239, 68, 68, 0.18)',
                    color: '#F87171',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <Trash2 size={15} />
                  <span>Excluir</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* FUNÇÃO REUTILIZÁVEL DO CONTEÚDO DA BARRA LATERAL (DESKTOP FIXA + DRAWER MOBILE) */}
      {(() => {
        const completedRoutesCount = rides.filter(r => r.status === 'finalizada').length;
        const navGroups = [
          {
            groupTitle: 'Operação',
            items: [
              { id: 'corridas', label: 'Visão Geral', icon: LayoutDashboard, badge: pendingRides.length > 0 ? String(pendingRides.length) : null },
              { id: 'plataforma', label: 'Motoristas', icon: Car, badge: null },
              { id: 'categorias', label: 'Categorias de Corridas', icon: Sliders, badge: null },
              { id: 'financeiro', label: 'Financeiro & Split', icon: DollarSign, badge: null },
              { id: 'sos', label: 'Central SOS', icon: ShieldAlert, badge: activeSosAlertsCount > 0 ? String(activeSosAlertsCount) : null, isDanger: activeSosAlertsCount > 0 },
            ]
          },
          {
            groupTitle: 'Auditoria & Dados',
            items: [
              { id: 'rotas', label: 'Rotas GPS', icon: Route, badge: completedRoutesCount > 0 ? String(completedRoutesCount) : null },
              { id: 'clientes', label: 'Passageiros', icon: Users, badge: null },
              { id: 'config', label: 'Tarifas & Regras', icon: Settings, badge: null },
            ]
          }
        ];

        const renderSidebarInner = (isMobileDrawer: boolean) => (
          <>
            {/* Topo da Barra Lateral */}
            <div style={{
              padding: isMobileDrawer ? 'calc(16px + env(safe-area-inset-top, 0px)) 18px 16px 18px' : '18px 20px',
              borderBottom: '1px solid #1E293B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#0B0F19'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src="/logo-horizontal-white.png" alt="KAVRO DRIVE" style={{ height: 24, width: 'auto', objectFit: 'contain' }} />
              </div>

              {isMobileDrawer && (
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(false)}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: 'none',
                    borderRadius: 6,
                    width: 28,
                    height: 28,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#94A3B8',
                    cursor: 'pointer'
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Lista de Navegação Principal Agrupada */}
            <div style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 18, flex: 1, backgroundColor: '#0B0F19' }}>
              {navGroups.map(group => (
                <div key={group.groupTitle} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 10px 6px' }}>
                    {group.groupTitle}
                  </div>
                  {group.items.map(item => {
                    const IconComp = item.icon;
                    const isSelected = activeTab === item.id;
                    const isSosItem = item.id === 'sos';
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(item.id as any);
                          setIsSidebarOpen(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '9px 12px',
                          borderRadius: 7,
                          border: 'none',
                          borderLeft: isSelected ? '3px solid #76D800' : '3px solid transparent',
                          backgroundColor: isSelected ? '#1E293B' : 'transparent',
                          color: isSelected ? '#FFFFFF' : '#94A3B8',
                          fontWeight: isSelected ? 600 : 500,
                          fontSize: '0.82rem',
                          cursor: 'pointer',
                          transition: 'all 0.12s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <IconComp size={16} color={isSelected ? '#FFFFFF' : (isSosItem && activeSosAlertsCount > 0 ? '#EF4444' : '#64748B')} style={{ flexShrink: 0 }} />
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                        </div>

                        {item.badge && (
                          <span style={{
                            backgroundColor: isSosItem && activeSosAlertsCount > 0 ? '#DC2626' : '#334155',
                            color: '#FFFFFF',
                            fontSize: '0.66rem',
                            fontWeight: 600,
                            padding: '1px 7px',
                            borderRadius: 999,
                            flexShrink: 0
                          }}>
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}

              {/* Divisor */}
              <div style={{ height: 1, backgroundColor: '#1E293B', margin: '4px 0' }} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 10px 4px' }}>
                  Acessos Externos
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsSidebarOpen(false);
                    window.location.href = '/kavro-drive';
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    borderRadius: 7,
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#94A3B8',
                    fontSize: '0.78rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <Car size={15} color="#64748B" />
                  <span>Portal do Motorista</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsSidebarOpen(false);
                    onExitAdmin();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    borderRadius: 7,
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#94A3B8',
                    fontSize: '0.78rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <LogOut size={15} color="#64748B" />
                  <span>App do Passageiro</span>
                </button>
              </div>
            </div>

            {/* Rodapé da Barra Lateral */}
            <div style={{
              padding: isMobileDrawer ? '12px 18px calc(14px + env(safe-area-inset-bottom, 0px)) 18px' : '12px 20px',
              borderTop: '1px solid #1E293B',
              backgroundColor: '#0B0F19',
              fontSize: '0.68rem',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span>Kavro Drive</span>
              <span style={{ color: '#94A3B8', fontWeight: 500 }}>Admin Master</span>
            </div>
          </>
        );

        return (
          <>
            {/* BARRA LATERAL FIXA NO PC (VISÍVEL EM TELAS >= 900PX) */}
            <aside className="admin-desktop-sidebar">
              {renderSidebarInner(false)}
            </aside>

            {/* DRAWER LATERAL RETRÁTIL NO MOBILE (VISÍVEL AO TOCAR EM ☰) */}
            {isSidebarOpen && (
              <div
                className="drawer-backdrop"
                onClick={() => setIsSidebarOpen(false)}
              >
                <div
                  className="drawer-content"
                  onClick={(e) => e.stopPropagation()}
                >
                  {renderSidebarInner(true)}
                </div>
              </div>
            )}
          </>
        );
      })()}

      {/* WRAPPER DO CONTEÚDO (COM MARGEM ESQUERDA AUTOMÁTICA NO DESKTOP PARA A BARRA LATERAL) */}
      <div className="admin-content-wrapper" style={{ backgroundColor: '#F8FAFC' }}>
        {/* HEADER PRINCIPAL CLEAN (BRANCO CORPORATIVO) */}
        <header style={{
          backgroundColor: '#FFFFFF',
          color: '#0F172A',
          padding: 'calc(10px + env(safe-area-inset-top, 0px)) 24px 10px 24px',
          borderBottom: '1px solid #E2E8F0',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}>
          <div style={{
            maxWidth: 1280,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'relative',
            minHeight: 38
          }}>
            {/* Lado Esquerdo no Mobile: Botão Menu Lateral (☰) */}
            <button
              type="button"
              className="admin-mobile-menu-btn"
              onClick={() => setIsSidebarOpen(true)}
              title="Abrir Menu Lateral"
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                backgroundColor: '#F8FAFC',
                border: '1px solid #CBD5E1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0F172A',
                cursor: 'pointer',
                flexShrink: 0,
                zIndex: 2
              }}
            >
              <Menu size={18} />
            </button>

            {/* Lado Esquerdo no PC: Breadcrumb & Seção Ativa */}
            <div className="admin-desktop-header-title" style={{ display: 'none', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 500 }}>
                Administração
              </span>
              <span style={{ fontSize: '0.78rem', color: '#CBD5E1' }}>/</span>
              <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#0F172A' }}>
                {activeTab === 'corridas' && 'Visão Geral'}
                {activeTab === 'plataforma' && 'Frota de Motoristas'}
                {activeTab === 'categorias' && 'Categorias de Corridas'}
                {activeTab === 'financeiro' && 'Financeiro & Split'}
                {activeTab === 'sos' && 'Central SOS'}
                {activeTab === 'rotas' && 'Rotas GPS'}
                {activeTab === 'clientes' && 'Passageiros'}
                {activeTab === 'config' && 'Tarifas & Regras'}
              </span>
            </div>

            {/* Centro Absoluto no Mobile: Logo Oficial KAVRO DRIVE */}
            <div
              className="admin-mobile-center-logo"
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none'
              }}
            >
              <img
                src="/logo-horizontal.png"
                alt="KAVRO DRIVE"
                style={{
                  height: 24,
                  width: 'auto',
                  objectFit: 'contain'
                }}
              />
            </div>

            {/* Controles do Lado Direito: Alerta SOS Ativo (se houver) + Notificações */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, zIndex: 2 }}>
              {activeSosAlertsCount > 0 && activeTab !== 'sos' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('sos')}
                  style={{
                    height: 32,
                    padding: '0 10px',
                    borderRadius: 6,
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    color: '#DC2626',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.74rem'
                  }}
                >
                  <ShieldAlert size={14} />
                  <span>{activeSosAlertsCount} SOS Ativo</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsNotificationsModalOpen(true);
                }}
                title="Notificações"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#475569',
                  cursor: 'pointer',
                  flexShrink: 0,
                  position: 'relative'
                }}
              >
                <Bell size={16} />
                {unreadNotifCount > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    backgroundColor: '#DC2626',
                    color: '#FFFFFF',
                    fontSize: '0.6rem',
                    fontWeight: 700,
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
            </div>
          </div>
        </header>

      {/* CONTEÚDO PRINCIPAL (TELA INTEIRA EM TODAS AS ABAS) */}
      <main style={{ maxWidth: 1280, width: '100%', margin: '0 auto', padding: '24px 24px 85px 24px' }}>
        {/* ================= ABA 1: DASHBOARD MASTER & TORRE DE CONTROLE ================= */}
        {activeTab === 'corridas' && (
          <AdminMasterOverviewTab
            rides={rides}
            config={currentConfig}
            activeSosCount={activeSosAlertsCount}
            onNavigateTab={(t) => setActiveTab(t)}
            onSelectRideDetail={(r) => setSelectedRideDetail(r)}
            onRefreshData={onRefreshData}
          />
        )}

        {/* LEGADO DESATIVADO NO MASTER */}
        {false && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Grid de Métricas Principais (Otimizado em 2 colunas no mobile) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 10
            }}>
              <div className="card-glass" style={{ padding: '12px 14px', borderLeft: '4px solid #76D800' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Hoje</div>
                <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#121A21', marginTop: 2 }}>
                  {todayRides.length}
                </div>
                <div style={{ fontSize: '0.68rem', color: '#65BE00', fontWeight: 700 }}>
                  {todayRides.filter(r => r.status === 'confirmada').length} confirmadas
                </div>
              </div>

              <div className="card-glass" style={{ padding: '12px 14px', borderLeft: '4px solid #F59E0B' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Pendentes</div>
                <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#F59E0B', marginTop: 2 }}>
                  {pendingRides.length}
                </div>
                <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Aguardando ação</div>
              </div>

              <div className="card-glass" style={{ padding: '12px 14px', borderLeft: '4px solid #3B82F6' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Amanhã</div>
                <div style={{ fontSize: '1.45rem', fontWeight: 900, color: '#121A21', marginTop: 2 }}>
                  {tomorrowRides.length}
                </div>
                <div style={{ fontSize: '0.68rem', color: '#3B82F6', fontWeight: 700 }}>Programadas</div>
              </div>

              <div className="card-glass" style={{ padding: '12px 14px', borderLeft: '4px solid #10B981' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Faturamento</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#10B981', marginTop: 2 }}>
                  R$ {totalMonthRevenue.toFixed(2)}
                </div>
                <div style={{ fontSize: '0.68rem', color: '#64748B' }}>{rides.length} cadastradas</div>
              </div>
            </div>

            {/* Filtros e Barra de Ações */}
            <div className="card-glass" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#121A21' }}>Filtrar por data:</span>
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #CBD5E1',
                    fontSize: '0.82rem'
                  }}
                />
                {filterDate && (
                  <button
                    onClick={() => setFilterDate('')}
                    style={{ fontSize: '0.75rem', background: '#F1F5F9', border: 'none', padding: '6px 10px', borderRadius: 6 }}
                  >
                    Limpar
                  </button>
                )}
              </div>

              <div style={{ fontSize: '0.82rem', color: '#64748B' }}>
                Mostrando <strong style={{ color: '#121A21' }}>{displayedRides.length}</strong> corridas
              </div>
            </div>

            {/* Lista das Corridas com Ações Rápidas */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {displayedRides.length === 0 ? (
                <div className="card-glass" style={{ padding: 40, textAlign: 'center' }}>
                  <p style={{ color: '#64748B' }}>Nenhuma corrida encontrada para o filtro selecionado.</p>
                </div>
              ) : (
                displayedRides.map((ride) => {
                  const cleanPhone = (ride.clientPhone || '').replace(/\D/g, '');
                  const rideCode = formatRideCode(ride);
                  const whatsappUrl = `https://wa.me/55${cleanPhone}?text=Ol%C3%A1%20${encodeURIComponent(ride.clientName)},%20sou%20seu%20motorista%20da%20UP%20Mobilidade%20sobre%20a%20corrida%20${encodeURIComponent(rideCode)}.`;
                  
                  // Configuração visual do status conforme pedido (Aguardando: Laranja, Confirmada: Azul, Finalizada: Verde, Cancelada: Vermelho)
                  const statusMap: Record<string, { label: string; bg: string; color: string; border: string; stripe: string; Icon: any }> = {
                    aguardando_confirmacao: { label: 'Aguardando', bg: '#FEF3C7', color: '#B45309', border: '#FDE68A', stripe: '#F59E0B', Icon: Clock },
                    confirmada: { label: 'Confirmada', bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', stripe: '#2563EB', Icon: CheckCircle2 },
                    a_caminho: { label: 'A Caminho', bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', stripe: '#2563EB', Icon: Navigation },
                    em_andamento: { label: 'Em Andamento', bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', stripe: '#2563EB', Icon: Play },
                    finalizada: { label: 'Finalizada', bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0', stripe: '#16A34A', Icon: CheckSquare },
                    cancelada: { label: 'Cancelada', bg: '#FEE2E2', color: '#DC2626', border: '#FECACA', stripe: '#EF4444', Icon: XCircle }
                  };
                  const statusInfo = statusMap[ride.status] || { label: ride.status, bg: '#F1F5F9', color: '#334155', border: '#CBD5E1', stripe: '#CBD5E1', Icon: Clock };
                  const StatusIcon = statusInfo.Icon;

                  return (
                    <div
                      key={ride.id}
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 20,
                        border: '1.5px solid #E2E8F0',
                        borderLeft: `5px solid ${statusInfo.stripe}`,
                        boxShadow: '0 4px 20px rgba(18, 26, 33, 0.05)',
                        overflow: 'hidden',
                        position: 'relative',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {/* Faixa superior de status elegante */}
                      <div style={{ height: 3, width: '100%', backgroundColor: statusInfo.stripe }} />

                      <div style={{ padding: '18px 20px' }}>
                        {/* Linha de Cabeçalho: Código, Status, Categoria e Valor */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                            {/* Badge do Código da Corrida */}
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              backgroundColor: '#121A21',
                              color: '#76D800',
                              padding: '5px 12px',
                              borderRadius: 10,
                              fontWeight: 900,
                              fontSize: '0.9rem',
                              letterSpacing: '0.04em',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                            }}>
                              <Sparkles size={13} color="#76D800" />
                              <span>{rideCode}</span>
                            </div>

                            {/* Badge do Status com Ícone */}
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '4px 11px',
                              borderRadius: 20,
                              fontSize: '0.74rem',
                              fontWeight: 800,
                              backgroundColor: statusInfo.bg,
                              color: statusInfo.color,
                              border: `1px solid ${statusInfo.border}`
                            }}>
                              <StatusIcon size={12} />
                              <span>{statusInfo.label}</span>
                            </span>

                            {ride.isManualBooking && (
                              <span style={{
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                background: '#F1F5F9',
                                color: '#475569',
                                padding: '4px 8px',
                                borderRadius: 8,
                                border: '1px solid #E2E8F0'
                              }}>
                                Criada pelo Motorista
                              </span>
                            )}
                          </div>

                          {/* Preço e Forma de Pagamento */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                              <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#121A21', letterSpacing: '-0.02em' }}>
                                R$ {ride.totalPrice.toFixed(2)}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {ride.paymentMethod === 'pix' && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '2px 8px', borderRadius: 8 }}>
                                    <img width="16" height="16" src="https://img.icons8.com/fluency/48/pix.png" alt="pix" />
                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#121A21' }}>PIX</span>
                                  </div>
                                )}
                                {ride.paymentMethod === 'cartao_credito' && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '2px 8px', borderRadius: 8 }}>
                                    <img width="16" height="16" src="https://img.icons8.com/color/48/bank-card-back-side.png" alt="cartão" />
                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#121A21' }}>Cartão</span>
                                  </div>
                                )}
                                {ride.paymentMethod === 'dinheiro' && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '2px 8px', borderRadius: 8 }}>
                                    <img width="16" height="16" src="https://img.icons8.com/fluency/48/money.png" alt="dinheiro" />
                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#121A21' }}>Dinheiro</span>
                                  </div>
                                )}
                                <span style={{
                                  fontSize: '0.7rem',
                                  fontWeight: 800,
                                  textTransform: 'uppercase',
                                  padding: '2px 8px',
                                  borderRadius: 8,
                                  backgroundColor: ride.paymentStatus === 'pago' ? '#DCFCE7' : '#FEF3C7',
                                  color: ride.paymentStatus === 'pago' ? '#15803D' : '#B45309',
                                  border: `1px solid ${ride.paymentStatus === 'pago' ? '#BBF7D0' : '#FDE68A'}`
                                }}>
                                  {ride.paymentStatus === 'pago' ? '✓ Pago' : 'Pendente'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* BLOCO COMPACTO DO PASSAGEIRO & AGENDAMENTO (Design mobile-first otimizado) */}
                        <div style={{
                          background: '#F8FAFC',
                          borderRadius: 16,
                          border: '1.5px solid #E2E8F0',
                          padding: '12px 14px',
                          marginBottom: 10
                        }}>
                          {/* Linha 1: Passageiro + Ações Oficiais WhatsApp e Telefone */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                              <div style={{
                                width: 38,
                                height: 38,
                                borderRadius: '50%',
                                backgroundColor: '#121A21',
                                color: '#76D800',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 800,
                                fontSize: '0.95rem',
                                flexShrink: 0
                              }}>
                                {ride.clientName ? ride.clientName.charAt(0).toUpperCase() : 'C'}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {ride.clientName}
                                </div>
                                <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>
                                  {formatPhone(ride.clientPhone)}
                                </div>
                              </div>
                            </div>

                            {/* Ações Rápidas de Contato (WhatsApp Oficial & Telefone) */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                              <a
                                href={whatsappUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Conversar no WhatsApp Oficial"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: 36,
                                  height: 36,
                                  borderRadius: 10,
                                  backgroundColor: '#FFFFFF',
                                  border: '1.5px solid #25D366',
                                  textDecoration: 'none',
                                  boxShadow: '0 2px 6px rgba(37, 211, 102, 0.2)',
                                  transition: 'transform 0.15s ease'
                                }}
                              >
                                <WhatsAppIcon size={22} />
                              </a>
                              <a
                                href={`tel:${cleanPhone}`}
                                title="Ligar para o passageiro"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: 36,
                                  height: 36,
                                  borderRadius: 10,
                                  backgroundColor: '#1E293B',
                                  color: '#ffffff',
                                  textDecoration: 'none',
                                  boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                                }}
                              >
                                <Phone size={16} />
                              </a>
                            </div>
                          </div>

                          {/* Linha 2: Chips Compactos de Metadados (Data/Hora, Rota e Passageiros) */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            flexWrap: 'wrap',
                            marginTop: 10,
                            paddingTop: 10,
                            borderTop: '1px solid #E2E8F0'
                          }}>
                            {/* Data e Hora em Destaque */}
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              backgroundColor: '#121A21',
                              color: '#FFFFFF',
                              padding: '4px 9px',
                              borderRadius: 8,
                              fontSize: '0.78rem',
                              fontWeight: 800
                            }}>
                              <Calendar size={13} color="#76D800" />
                              <span>{ride.date.split('-').reverse().join('/')}</span>
                              <span style={{ color: '#76D800', fontWeight: 900 }}>{ride.time}</span>
                            </span>

                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              backgroundColor: '#FFFFFF',
                              border: '1px solid #CBD5E1',
                              padding: '3px 8px',
                              borderRadius: 8,
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: '#334155'
                            }}>
                              📍 {ride.distanceKm.toFixed(1)} km
                            </span>

                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              backgroundColor: '#FFFFFF',
                              border: '1px solid #CBD5E1',
                              padding: '3px 8px',
                              borderRadius: 8,
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: '#334155'
                            }}>
                              ⏱️ ~{ride.durationMin} min
                            </span>

                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              backgroundColor: '#FFFFFF',
                              border: '1px solid #CBD5E1',
                              padding: '3px 8px',
                              borderRadius: 8,
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: '#334155'
                            }}>
                              <User size={12} color="#64748B" />
                              <span>{ride.passengers} {ride.passengers > 1 ? 'pass.' : 'pass.'}</span>
                            </span>

                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              backgroundColor: '#FFFFFF',
                              border: '1px solid #CBD5E1',
                              padding: '3px 8px',
                              borderRadius: 8,
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: ride.hasLuggage ? '#15803D' : '#64748B'
                            }}>
                              <Luggage size={12} />
                              <span>{ride.hasLuggage ? 'Com malas' : 'Sem malas'}</span>
                            </span>

                            {ride.category && ride.category !== 'standard' && (
                              <span style={{
                                backgroundColor: '#FEF3C7',
                                color: '#92400E',
                                padding: '3px 8px',
                                borderRadius: 8,
                                fontSize: '0.72rem',
                                fontWeight: 700
                              }}>
                                ✈️ Executivo
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Trajeto Completo com Conector de Rota Estilo Linha do Tempo Compacta */}
                        <div style={{
                          backgroundColor: '#F8FAFC',
                          borderRadius: 14,
                          padding: '10px 14px',
                          border: '1px solid #E2E8F0',
                          marginBottom: 12
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
                            {/* Linha vertical conectora */}
                            <div style={{
                              position: 'absolute',
                              left: 6,
                              top: 10,
                              bottom: 10,
                              width: 2,
                              backgroundColor: '#CBD5E1'
                            }} />

                            {/* Ponto de Embarque */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative', zIndex: 1 }}>
                              <div style={{
                                width: 14,
                                height: 14,
                                borderRadius: '50%',
                                backgroundColor: '#76D800',
                                border: '2.5px solid #FFFFFF',
                                boxShadow: '0 0 0 1.5px #76D800',
                                flexShrink: 0
                              }} />
                              <div style={{ flex: 1, minWidth: 0, fontSize: '0.84rem', color: '#121A21' }}>
                                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#4D9400', textTransform: 'uppercase', marginRight: 6 }}>
                                  Embarque:
                                </span>
                                <strong style={{ fontWeight: 700 }}>{ride.origin.address}</strong>
                                {ride.origin.reference && (
                                  <span style={{ fontSize: '0.72rem', color: '#64748B', marginLeft: 6 }}>
                                    ({ride.origin.reference})
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Ponto de Destino */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative', zIndex: 1 }}>
                              <div style={{
                                width: 14,
                                height: 14,
                                borderRadius: '50%',
                                backgroundColor: '#121A21',
                                border: '2.5px solid #FFFFFF',
                                boxShadow: '0 0 0 1.5px #121A21',
                                flexShrink: 0
                              }} />
                              <div style={{ flex: 1, minWidth: 0, fontSize: '0.84rem', color: '#121A21' }}>
                                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginRight: 6 }}>
                                  Destino:
                                </span>
                                <strong style={{ fontWeight: 700 }}>{ride.destination.address}</strong>
                              </div>
                            </div>
                          </div>

                          {ride.notes && (
                            <div style={{
                              marginTop: 8,
                              paddingTop: 8,
                              borderTop: '1px dashed #CBD5E1',
                              fontSize: '0.76rem',
                              color: '#475569',
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 6
                            }}>
                              <strong style={{ color: '#121A21' }}>Obs:</strong>
                              <span>{ride.notes}</span>
                            </div>
                          )}
                        </div>

                        {/* BARRA DE AÇÕES DO MOTORISTA (Grid 2 Linhas: Organizado e Proporcional) */}
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                          paddingTop: 12,
                          borderTop: '1px solid #E2E8F0'
                        }}>
                          {/* Linha 1: Ferramentas (Maps, Gestão e Excluir) */}
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr auto',
                            gap: 8,
                            width: '100%'
                          }}>
                            {/* Botão Oficial: Abrir Rota no Google Maps */}
                            <a
                              href={getGoogleMapsRouteUrl(ride.origin, ride.destination)}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                height: 40,
                                borderRadius: 12,
                                backgroundColor: '#121A21',
                                color: '#FFFFFF',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                textDecoration: 'none',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
                              }}
                            >
                              <ExternalLink size={14} color="#76D800" />
                              <span>Google Maps</span>
                            </a>

                            {/* Botão para abrir o Modal de Gestão Completa */}
                            <button
                              type="button"
                              onClick={() => setSelectedRideDetail(ride)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                height: 40,
                                borderRadius: 12,
                                backgroundColor: '#F8FAFC',
                                color: '#1E293B',
                                border: '1.5px solid #CBD5E1',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <Settings size={14} color="#64748B" />
                              <span>Gerenciar</span>
                            </button>

                            {/* Botão Direto: Excluir Corrida */}
                            <button
                              type="button"
                              onClick={() => handleDeleteRide(ride.id)}
                              title="Excluir corrida permanentemente"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 5,
                                height: 40,
                                padding: '0 14px',
                                borderRadius: 12,
                                backgroundColor: '#FEF2F2',
                                color: '#DC2626',
                                border: '1.5px solid #FECACA',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <Trash2 size={14} color="#DC2626" />
                              <span>Excluir</span>
                            </button>
                          </div>

                          {/* Linha 2: Ações de Decisão e Status (Proporcionalidade Perfeita) */}
                          <div style={{ width: '100%' }}>
                            {ride.status === 'aguardando_confirmacao' && (
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1.6fr',
                                gap: 8,
                                alignItems: 'center',
                                width: '100%'
                              }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm('Deseja realmente recusar / cancelar este agendamento?')) {
                                      handleUpdateStatus(ride.id, 'cancelada');
                                    }
                                  }}
                                  style={{
                                    height: 44,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 5,
                                    backgroundColor: '#FEE2E2',
                                    color: '#991B1B',
                                    border: '1px solid #FECACA',
                                    borderRadius: 12,
                                    fontSize: '0.82rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                >
                                  <X size={15} />
                                  <span>Recusar</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleUpdateStatus(ride.id, 'confirmada')}
                                  className="btn-ios-primary"
                                  style={{
                                    height: 44,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 6,
                                    fontSize: '0.86rem',
                                    fontWeight: 800,
                                    margin: 0,
                                    width: '100%'
                                  }}
                                >
                                  <Check size={16} />
                                  <span>Confirmar Corrida</span>
                                </button>
                              </div>
                            )}

                            {ride.status === 'confirmada' && (
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1.6fr',
                                gap: 8,
                                alignItems: 'center',
                                width: '100%'
                              }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm('Deseja cancelar esta corrida confirmada?')) {
                                      handleUpdateStatus(ride.id, 'cancelada');
                                    }
                                  }}
                                  style={{
                                    height: 44,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 5,
                                    backgroundColor: '#FEE2E2',
                                    color: '#991B1B',
                                    border: '1px solid #FECACA',
                                    borderRadius: 12,
                                    fontSize: '0.82rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                >
                                  <X size={15} />
                                  <span>Cancelar</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    if (handleUpdateStatus(ride.id, 'a_caminho')) {
                                      setGpsRide({ ...ride, status: 'a_caminho' });
                                    }
                                  }}
                                  className="btn-ios-primary"
                                  style={{
                                    height: 44,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 6,
                                    fontSize: '0.86rem',
                                    fontWeight: 800,
                                    margin: 0,
                                    width: '100%'
                                  }}
                                >
                                  <Play size={15} fill="#121A21" />
                                  <span>Iniciar Corrida (GPS)</span>
                                </button>
                              </div>
                            )}

                            {ride.status === 'a_caminho' && (
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1.6fr',
                                gap: 8,
                                alignItems: 'center',
                                width: '100%'
                              }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm('Deseja cancelar esta corrida?')) {
                                      handleUpdateStatus(ride.id, 'cancelada');
                                    }
                                  }}
                                  style={{
                                    height: 44,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 5,
                                    backgroundColor: '#FEE2E2',
                                    color: '#991B1B',
                                    border: '1px solid #FECACA',
                                    borderRadius: 12,
                                    fontSize: '0.82rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                >
                                  <X size={15} />
                                  <span>Cancelar</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!ensureVehicleConfigured()) return;
                                    setGpsRide(ride);
                                  }}
                                  style={{
                                    height: 44,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 6,
                                    backgroundColor: '#121A21',
                                    color: '#76D800',
                                    borderRadius: 12,
                                    fontSize: '0.86rem',
                                    fontWeight: 800,
                                    border: '1.5px solid #76D800',
                                    cursor: 'pointer',
                                    boxShadow: '0 3px 10px rgba(118, 216, 0, 0.25)'
                                  }}
                                >
                                  <Navigation size={15} color="#76D800" />
                                  <span>Abrir GPS ao Vivo</span>
                                </button>
                              </div>
                            )}

                            {ride.status === 'em_andamento' && (
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1.3fr',
                                gap: 8,
                                alignItems: 'center',
                                width: '100%'
                              }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!ensureVehicleConfigured()) return;
                                    setGpsRide(ride);
                                  }}
                                  style={{
                                    height: 44,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 6,
                                    backgroundColor: '#121A21',
                                    color: '#76D800',
                                    borderRadius: 12,
                                    fontSize: '0.82rem',
                                    fontWeight: 800,
                                    border: '1.5px solid #76D800',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <Navigation size={14} color="#76D800" />
                                  <span>Abrir GPS</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setCheckoutRide(ride)}
                                  style={{
                                    height: 44,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 6,
                                    backgroundColor: '#10B981',
                                    color: '#ffffff',
                                    borderRadius: 12,
                                    fontSize: '0.84rem',
                                    fontWeight: 800,
                                    border: 'none',
                                    cursor: 'pointer',
                                    boxShadow: '0 3px 10px rgba(16, 185, 129, 0.3)'
                                  }}
                                >
                                  <CheckCircle2 size={15} />
                                  <span>Concluir (R$ {ride.totalPrice.toFixed(2)})</span>
                                </button>
                              </div>
                            )}

                            {ride.status === 'finalizada' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                                <button
                                  type="button"
                                  onClick={() => setAuditPlaybackRide(ride)}
                                  style={{
                                    width: '100%',
                                    height: 40,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 6,
                                    background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                                    color: '#FFFFFF',
                                    border: '1.5px solid #38BDF8',
                                    borderRadius: 12,
                                    fontSize: '0.80rem',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    boxShadow: '0 3px 10px rgba(56, 189, 248, 0.25)'
                                  }}
                                >
                                  <Play size={14} color="#76D800" fill="#76D800" />
                                  <span>🎥 Auditoria GPS & Laudo ({rideCode})</span>
                                </button>
                              </div>
                            )}

                            {ride.status === 'cancelada' && (
                              <div style={{
                                width: '100%',
                                height: 40,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                backgroundColor: '#FEF2F2',
                                color: '#991B1B',
                                borderRadius: 12,
                                fontSize: '0.82rem',
                                fontWeight: 700
                              }}>
                                <XCircle size={15} />
                                <span>Corrida Cancelada</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ================= ABA 2: AGENDA NO MODELO DAS IMAGENS (FULL WIDTH, CLEAN E 100% BRANCA) ================= */}
        {activeTab === 'agenda' && (
          <div style={{
            backgroundColor: '#FFFFFF',
            minHeight: 'calc(100vh - 120px)',
            width: '100%',
            padding: '16px 14px',
            color: '#121A21',
            display: 'flex',
            flexDirection: 'column',
            gap: 14
          }}>
            {/* ── 1. SUB-PILLS DE NAVEGAÇÃO (Agenda, Bloquear, Horários) + ÍCONES (BRANCO/LIGHT) ── */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              borderBottom: '1px solid #F1F5F9',
              paddingBottom: 12
            }}>
              {/* Segmented Control */}
              <div style={{
                display: 'inline-flex',
                backgroundColor: '#F1F5F9',
                padding: 3,
                borderRadius: 20,
                border: '1px solid #E2E8F0'
              }}>
                <button
                  type="button"
                  onClick={() => setAgendaSubTab('agenda')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 16,
                    backgroundColor: agendaSubTab === 'agenda' ? '#FFFFFF' : 'transparent',
                    color: agendaSubTab === 'agenda' ? '#121A21' : '#64748B',
                    fontSize: '0.78rem',
                    fontWeight: agendaSubTab === 'agenda' ? 800 : 600,
                    border: 'none',
                    boxShadow: agendaSubTab === 'agenda' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Agenda
                </button>

                <button
                  type="button"
                  onClick={() => setAgendaSubTab('bloquear')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 16,
                    backgroundColor: agendaSubTab === 'bloquear' ? '#FFFFFF' : 'transparent',
                    color: agendaSubTab === 'bloquear' ? '#D97706' : '#64748B',
                    fontSize: '0.78rem',
                    fontWeight: agendaSubTab === 'bloquear' ? 800 : 600,
                    border: 'none',
                    boxShadow: agendaSubTab === 'bloquear' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <span>Bloqueio de Horários</span>
                  {(blockedSlots[selectedAgendaDate] || []).length > 0 && (
                    <span style={{
                      backgroundColor: '#FEF3C7',
                      color: '#B45309',
                      fontSize: '0.64rem',
                      fontWeight: 800,
                      padding: '1px 6px',
                      borderRadius: 10
                    }}>
                      {(blockedSlots[selectedAgendaDate] || []).length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setAgendaSubTab('horarios')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 16,
                    backgroundColor: agendaSubTab === 'horarios' ? '#FFFFFF' : 'transparent',
                    color: agendaSubTab === 'horarios' ? '#15803D' : '#64748B',
                    fontSize: '0.78rem',
                    fontWeight: agendaSubTab === 'horarios' ? 800 : 600,
                    border: 'none',
                    boxShadow: agendaSubTab === 'horarios' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Configurações
                </button>
              </div>

              {/* Botões do lado direito (Calendário e Filtro de Horas) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setIsMonthCalendarOpen(prev => !prev)}
                  title="Abrir Calendário Mensal"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    backgroundColor: isMonthCalendarOpen ? '#76D800' : '#F8FAFC',
                    color: isMonthCalendarOpen ? '#121A21' : '#334155',
                    border: '1px solid #CBD5E1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                  }}
                >
                  <CalendarDays size={17} />
                </button>

                <button
                  type="button"
                  onClick={() => setAgendaViewHours(prev => prev === 'trabalho' ? '24h' : 'trabalho')}
                  title={agendaViewHours === 'trabalho' ? 'Modo Comercial (06h às 23h)' : 'Modo 24 Horas'}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    backgroundColor: agendaViewHours === '24h' ? 'rgba(118, 216, 0, 0.18)' : '#F8FAFC',
                    color: agendaViewHours === '24h' ? '#15803D' : '#334155',
                    border: agendaViewHours === '24h' ? '1.5px solid #76D800' : '1px solid #CBD5E1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                  }}
                >
                  {agendaViewHours === '24h' ? '24h' : 'Dia'}
                </button>
              </div>
            </div>

            {/* ── 2. SELETOR DE DATA CENTRAL COM SETAS (< Hoje / Sexta-Feira >) ── */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 4px'
            }}>
              <button
                type="button"
                onClick={() => handleShiftAgendaDay(-1)}
                title="Dia Anterior"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  color: '#121A21',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}
              >
                <ChevronLeft size={22} />
              </button>

              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: '1.3rem',
                  fontWeight: 900,
                  color: '#121A21',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.2
                }}>
                  {agendaDateInfo.isToday ? 'Hoje' : agendaDateInfo.weekday}
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  marginTop: 3
                }}>
                  <span style={{ fontSize: '0.82rem', color: '#64748B', fontWeight: 600 }}>
                    {agendaDateInfo.day} de {agendaDateInfo.month.toLowerCase()}
                  </span>
                  {agendaRides.length > 0 && (
                    <span style={{
                      backgroundColor: '#DC2626',
                      color: '#FFFFFF',
                      fontSize: '0.68rem',
                      fontWeight: 900,
                      borderRadius: '50%',
                      width: 18,
                      height: 18,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {agendaRides.length}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleShiftAgendaDay(1)}
                title="Próximo Dia"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  color: '#121A21',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}
              >
                <ChevronRight size={22} />
              </button>
            </div>

            {/* ── 3. DOIS BOTÕES DE ATALHOS RÁPIDOS (⚡ Encaixe | 📋 Corrida Externa) - SOMENTE NA SUB-ABA AGENDA ── */}
            {agendaSubTab === 'agenda' && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                paddingBottom: 4
              }}>
                <button
                  type="button"
                  onClick={() => {
                    setManualInitialDate(selectedAgendaDate);
                    setManualInitialTime('');
                    setIsManualModalOpen(true);
                  }}
                  style={{
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: '#FFFBEB',
                    border: '1.5px solid #F59E0B',
                    color: '#B45309',
                    fontSize: '0.86rem',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(245, 158, 11, 0.12)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Zap size={16} fill="#F59E0B" />
                  <span>⚡ Encaixe</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setManualInitialDate(selectedAgendaDate);
                    setManualInitialTime('');
                    setIsManualModalOpen(true);
                  }}
                  style={{
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: '#F0FDF4',
                    border: '1.5px solid #10B981',
                    color: '#15803D',
                    fontSize: '0.86rem',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.12)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <FileText size={16} />
                  <span>📋 Corrida Externa</span>
                </button>
              </div>
            )}

            {/* ── 4. CALENDÁRIO MENSAL EXPANSÍVEL (Se aberto) ── */}
            {isMonthCalendarOpen && (
              <div style={{
                backgroundColor: '#F8FAFC',
                borderRadius: 16,
                padding: 14,
                border: '1.5px solid #E2E8F0',
                animation: 'fadeIn 0.2s ease',
                marginBottom: 6,
                boxShadow: '0 4px 16px rgba(0,0,0,0.06)'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10
                }}>
                  <button
                    type="button"
                    onClick={() => setCalendarMonthOffset(prev => prev - 1)}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      borderRadius: 8,
                      color: '#334155',
                      padding: '4px 8px',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    ◀ Mês Anterior
                  </button>

                  <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#121A21' }}>
                    {monthGridData.title}
                  </span>

                  <button
                    type="button"
                    onClick={() => setCalendarMonthOffset(prev => prev + 1)}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      borderRadius: 8,
                      color: '#334155',
                      padding: '4px 8px',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Próximo Mês ▶
                  </button>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: 4,
                  textAlign: 'center',
                  marginBottom: 6
                }}>
                  {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((wd, i) => (
                    <span key={i} style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748B' }}>
                      {wd}
                    </span>
                  ))}
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: 4
                }}>
                  {monthGridData.cells.map(cell => {
                    const ridesCount = ridesCountByDate[cell.dateStr]?.total || 0;
                    return (
                      <button
                        key={cell.dateStr}
                        type="button"
                        onClick={() => {
                          setSelectedAgendaDate(cell.dateStr);
                          setIsMonthCalendarOpen(false);
                        }}
                        style={{
                          height: 38,
                          borderRadius: 10,
                          border: cell.isSelected
                            ? '2px solid #76D800'
                            : cell.isToday
                            ? '1.5px solid #475569'
                            : '1px solid #E2E8F0',
                          backgroundColor: cell.isSelected
                            ? '#76D800'
                            : cell.isToday
                            ? '#EFF6FF'
                            : '#FFFFFF',
                          color: cell.isSelected
                            ? '#121A21'
                            : cell.isCurrentMonth
                            ? '#121A21'
                            : '#94A3B8',
                          fontWeight: cell.isSelected || cell.isToday ? 900 : 600,
                          fontSize: '0.82rem',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          position: 'relative',
                          boxShadow: cell.isSelected ? '0 2px 8px rgba(118, 216, 0, 0.4)' : 'none'
                        }}
                      >
                        <span>{cell.dayNum}</span>
                        {ridesCount > 0 && (
                          <span style={{
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            backgroundColor: cell.isSelected ? '#121A21' : '#10B981',
                            marginTop: 1
                          }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── 5. ABA DEDICADA: BLOQUEIO DE HORÁRIOS MANUAIS & AGENDAMENTOS ── */}
            {agendaSubTab === 'bloquear' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* 1. NO TOPO: MODAL / CARD DE BLOQUEAR HORÁRIOS LIVRES (GRADE DE SELEÇÃO RÁPIDA + PERSONALIZADO) */}
                <div style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 16,
                  border: '1.5px solid #E2E8F0',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.05)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        backgroundColor: '#FEF3C7',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#D97706',
                        fontSize: '1rem',
                        flexShrink: 0
                      }}>
                        🔒
                      </div>
                      <div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#121A21' }}>
                          ➕ Bloquear Horários Livres (Toque para Bloquear)
                        </div>
                        <div style={{ fontSize: '0.73rem', color: '#64748B' }}>
                          Toque em um horário disponível para bloqueá-lo ou em um bloqueado para liberar.
                        </div>
                      </div>
                    </div>

                    {/* Resumo Rápido Compacto (Agendamentos / Bloqueados / Livres) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '4px 9px', borderRadius: 8, backgroundColor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #DBEAFE' }}>
                        🚗 {agendaRides.length} {agendaRides.length === 1 ? 'agendado' : 'agendados'}
                      </span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '4px 9px', borderRadius: 8, backgroundColor: '#FFFBEB', color: '#B45309', border: '1px solid #FED7AA' }}>
                        🔒 {(blockedSlots[selectedAgendaDate] || []).length} {(blockedSlots[selectedAgendaDate] || []).length === 1 ? 'bloqueado' : 'bloqueados'}
                      </span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '4px 9px', borderRadius: 8, backgroundColor: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}>
                        ✓ {dayTimelineSlots.filter(s => !getSlotOccupation(s)?.occupied && !(blockedSlots[selectedAgendaDate] || []).includes(s)).length} livres
                      </span>
                    </div>
                  </div>

                  {/* Seletor Manual de Horário Específico */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                    padding: '8px 10px',
                    backgroundColor: '#F8FAFC',
                    borderRadius: 10,
                    border: '1px solid #E2E8F0'
                  }}>
                    <Clock size={16} color="#64748B" />
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
                      Bloqueio personalizado:
                    </span>
                    <input
                      type="time"
                      value={customBlockTime}
                      onChange={(e) => setCustomBlockTime(e.target.value)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: '1px solid #CBD5E1',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        color: '#121A21'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (customBlockTime) {
                          handleBlockSlot(customBlockTime);
                        }
                      }}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 8,
                        backgroundColor: '#D97706',
                        color: '#FFFFFF',
                        border: 'none',
                        fontSize: '0.76rem',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      + Bloquear Horário
                    </button>
                  </div>

                  {/* Grid de Horários do Dia */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))',
                    gap: 6,
                    maxHeight: 240,
                    overflowY: 'auto',
                    padding: '2px'
                  }}>
                    {dayTimelineSlots.map(slot => {
                      const occ = getSlotOccupation(slot);
                      const isRideOccupied = Boolean(occ?.occupied);
                      const isManuallyBlocked = (blockedSlots[selectedAgendaDate] || []).includes(slot);

                      if (isRideOccupied) {
                        return (
                          <div
                            key={slot}
                            title={occ?.type === 'ride_buffer' ? 'Intervalo de descanso/folga pós-viagem' : 'Ocupado por agendamento ativo'}
                            style={{
                              padding: '7px 4px',
                              borderRadius: 8,
                              backgroundColor: occ?.type === 'ride_buffer' ? '#F1F5F9' : '#EFF6FF',
                              border: occ?.type === 'ride_buffer' ? '1px dashed #CBD5E1' : '1px solid #BFDBFE',
                              color: occ?.type === 'ride_buffer' ? '#64748B' : '#1D4ED8',
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              textAlign: 'center',
                              opacity: 0.8,
                              cursor: 'not-allowed'
                            }}
                          >
                            {slot} {occ?.type === 'ride_buffer' ? '⏱️' : '🚗'}
                          </div>
                        );
                      }

                      if (isManuallyBlocked) {
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => handleUnblockSlot(slot)}
                            title="Horário bloqueado. Clique para desbloquear"
                            style={{
                              padding: '7px 4px',
                              borderRadius: 8,
                              backgroundColor: '#FEF3C7',
                              border: '1.5px solid #F59E0B',
                              color: '#B45309',
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              textAlign: 'center',
                              cursor: 'pointer',
                              boxShadow: '0 1px 3px rgba(245, 158, 11, 0.15)'
                            }}
                          >
                            {slot} 🔒
                          </button>
                        );
                      }

                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => handleBlockSlot(slot)}
                          title="Horário livre. Clique para bloquear"
                          style={{
                            padding: '7px 4px',
                            borderRadius: 8,
                            backgroundColor: '#F8FAFC',
                            border: '1px solid #CBD5E1',
                            color: '#334155',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            textAlign: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#FEF2F2';
                            e.currentTarget.style.borderColor = '#EF4444';
                            e.currentTarget.style.color = '#DC2626';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#F8FAFC';
                            e.currentTarget.style.borderColor = '#CBD5E1';
                            e.currentTarget.style.color = '#334155';
                          }}
                        >
                          + {slot}
                        </button>
                      );
                    })}
                  </div>

                  {/* Legenda */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.68rem', color: '#64748B', paddingTop: 2, flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#CBD5E1' }} /> Horário Livre (Toque p/ Bloquear)
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#F59E0B' }} /> Bloqueado Manual (Toque p/ Desbloquear)
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#2563EB' }} /> Agendamento Ativo
                    </span>
                  </div>
                </div>

                {/* 2. HORÁRIOS BLOQUEADOS MANUALMENTE PELO MOTORISTA */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#121A21' }}>
                        🔒 Horários Bloqueados Manualmente
                      </span>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        backgroundColor: '#FEF3C7',
                        color: '#B45309',
                        padding: '2px 8px',
                        borderRadius: 10
                      }}>
                        {(blockedSlots[selectedAgendaDate] || []).length}
                      </span>
                    </div>

                    {(blockedSlots[selectedAgendaDate] || []).length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('Deseja liberar todos os horários bloqueados manualmente nesta data?')) {
                            StorageService.saveBlockedSlots(selectedAgendaDate, []);
                            setBlockedSlots(StorageService.getBlockedSlots());
                          }
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#EF4444',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Liberar Todos
                      </button>
                    )}
                  </div>

                  {(blockedSlots[selectedAgendaDate] || []).length === 0 ? (
                    <div style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: 14,
                      padding: '16px',
                      border: '1.5px dashed #CBD5E1',
                      textAlign: 'center',
                      color: '#64748B',
                      fontSize: '0.8rem'
                    }}>
                      Nenhum horário bloqueado manualmente nesta data. Use a grade acima para bloquear intervalos ou folgas.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
                      {(blockedSlots[selectedAgendaDate] || []).map(slot => (
                        <div
                          key={slot}
                          style={{
                            backgroundColor: '#FFFBEB',
                            borderRadius: 12,
                            border: '1.5px solid #F59E0B',
                            padding: '10px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            boxShadow: '0 2px 6px rgba(245, 158, 11, 0.08)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              backgroundColor: '#FEF3C7',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#D97706',
                              fontWeight: 900
                            }}>
                              🔒
                            </div>
                            <div>
                              <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#92400E' }}>
                                {slot} - {calculateEndTime(slot, 30)}
                              </div>
                              <div style={{ fontSize: '0.68rem', color: '#B45309', fontWeight: 600 }}>
                                Bloqueio Manual do Motorista
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleUnblockSlot(slot)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '6px 12px',
                              borderRadius: 8,
                              backgroundColor: '#FFFFFF',
                              border: '1.5px solid #16A34A',
                              color: '#15803D',
                              fontSize: '0.76rem',
                              fontWeight: 800,
                              cursor: 'pointer',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                            }}
                          >
                            <span>🔓 Desbloquear</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. HORÁRIOS OCUPADOS POR AGENDAMENTOS (AUTOMÁTICOS) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#121A21' }}>
                      🚗 Horários Ocupados por Agendamentos
                    </span>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      backgroundColor: '#DBEAFE',
                      color: '#1D4ED8',
                      padding: '2px 8px',
                      borderRadius: 10
                    }}>
                      {agendaRides.length}
                    </span>
                  </div>

                  {agendaRides.length === 0 ? (
                    <div style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: 14,
                      padding: '16px',
                      border: '1.5px dashed #CBD5E1',
                      textAlign: 'center',
                      color: '#64748B',
                      fontSize: '0.8rem'
                    }}>
                      Nenhum agendamento ativo nesta data.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {agendaRides.map(ride => (
                        <div
                          key={ride.id}
                          style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: 14,
                            border: '1.5px solid #E2E8F0',
                            borderLeft: '4.5px solid #2563EB',
                            padding: '12px 14px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                          }}
                        >
                          {/* Topo do Card de Agendamento */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{
                                backgroundColor: '#121A21',
                                color: '#76D800',
                                fontSize: '0.68rem',
                                fontWeight: 900,
                                padding: '2px 7px',
                                borderRadius: 6
                              }}>
                                {formatRideCode(ride)}
                              </span>
                              <span style={{ fontSize: '0.94rem', fontWeight: 900, color: '#121A21' }}>
                                {ride.time} - {calculateEndTime(ride.time, ride.durationMin || 30)}
                              </span>
                              <span style={{
                                fontSize: '0.66rem',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: 6,
                                backgroundColor:
                                  ride.status === 'aguardando_confirmacao' ? '#FEF3C7' :
                                  ride.status === 'confirmada' ? '#DBEAFE' :
                                  ride.status === 'a_caminho' || ride.status === 'em_andamento' ? '#E0E7FF' :
                                  ride.status === 'finalizada' ? '#DCFCE7' : '#FEE2E2',
                                color:
                                  ride.status === 'aguardando_confirmacao' ? '#B45309' :
                                  ride.status === 'confirmada' ? '#1D4ED8' :
                                  ride.status === 'a_caminho' || ride.status === 'em_andamento' ? '#3730A3' :
                                  ride.status === 'finalizada' ? '#15803D' : '#DC2626'
                              }}>
                                {ride.status === 'aguardando_confirmacao' ? 'Aguardando' :
                                 ride.status === 'confirmada' ? 'Confirmada' :
                                 ride.status === 'a_caminho' ? 'A Caminho' :
                                 ride.status === 'em_andamento' ? 'Em Andamento' :
                                 ride.status === 'finalizada' ? 'Finalizada' : 'Cancelada'}
                              </span>
                            </div>

                            <div style={{ fontSize: '0.94rem', fontWeight: 900, color: '#15803D' }}>
                              R$ {ride.totalPrice.toFixed(2)}
                            </div>
                          </div>

                          {/* Dados do Passageiro e Rota */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#121A21' }}>
                              👤 {ride.clientName}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                              {ride.clientPhone}
                            </div>
                          </div>

                          <div style={{ fontSize: '0.74rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span>📍 {ride.origin.address.split(',')[0]}</span>
                            <span>➔</span>
                            <span style={{ fontWeight: 600, color: '#121A21' }}>{ride.destination.address.split(',')[0]}</span>
                          </div>

                          {/* Botões de Ação Direta + Liberar o Horário */}
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            flexWrap: 'wrap',
                            gap: 8,
                            paddingTop: 6,
                            borderTop: '1px solid #F1F5F9'
                          }}>
                            {ride.status === 'aguardando_confirmacao' && (
                              <button
                                type="button"
                                onClick={() => handleUpdateStatus(ride.id, 'confirmada')}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: 8,
                                  backgroundColor: '#76D800',
                                  border: '1px solid #65BE00',
                                  fontSize: '0.74rem',
                                  fontWeight: 800,
                                  color: '#121A21',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4
                                }}
                              >
                                <Check size={13} strokeWidth={3} />
                                <span>Aceitar Corrida</span>
                              </button>
                            )}

                            {ride.status === 'confirmada' && (
                              <button
                                type="button"
                                onClick={() => {
                                  handleUpdateStatus(ride.id, 'a_caminho');
                                  setGpsRide({ ...ride, status: 'a_caminho' });
                                }}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: 8,
                                  backgroundColor: '#76D800',
                                  border: '1px solid #65BE00',
                                  fontSize: '0.74rem',
                                  fontWeight: 800,
                                  color: '#121A21',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4
                                }}
                              >
                                <Play size={13} fill="#121A21" />
                                <span>Iniciar Corrida (GPS)</span>
                              </button>
                            )}

                            {(ride.status === 'a_caminho' || ride.status === 'em_andamento') && (
                              <button
                                type="button"
                                onClick={() => setGpsRide(ride)}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: 8,
                                  backgroundColor: '#121A21',
                                  border: '1.5px solid #76D800',
                                  fontSize: '0.74rem',
                                  fontWeight: 800,
                                  color: '#76D800',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4
                                }}
                              >
                                <Navigation size={13} color="#76D800" />
                                <span>Abrir GPS</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setSelectedRideDetail(ride)}
                              style={{
                                padding: '6px 12px',
                                borderRadius: 8,
                                backgroundColor: '#F8FAFC',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                color: '#334155',
                                cursor: 'pointer'
                              }}
                            >
                              Ver Detalhes
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Deseja cancelar o agendamento de ${ride.clientName} e liberar o horário ${ride.time}?`)) {
                                  handleUpdateStatus(ride.id, 'cancelada');
                                }
                              }}
                              style={{
                                padding: '6px 12px',
                                borderRadius: 8,
                                backgroundColor: '#FEF2F2',
                                border: '1px solid #FECACA',
                                fontSize: '0.74rem',
                                fontWeight: 800,
                                color: '#DC2626',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                            >
                              <span>🚫 Cancelar (Liberar Horário)</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteRide(ride.id)}
                              style={{
                                padding: '6px 10px',
                                borderRadius: 8,
                                backgroundColor: '#FFF',
                                border: '1px solid #E2E8F0',
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                color: '#64748B',
                                cursor: 'pointer'
                              }}
                              title="Excluir corrida permanentemente"
                            >
                              <Trash2 size={13} color="#DC2626" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : agendaSubTab === 'horarios' ? (
              /* SUB-ABA CONFIGURAÇÕES: AJUSTE DE INTERVALO E DESLOCAMENTO (SEM LISTA DE + AGENDAR) */
              <div style={{
                backgroundColor: '#F8FAFC',
                borderRadius: 16,
                padding: '16px',
                border: '1.5px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                gap: 12
              }}>
                <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#121A21' }}>
                  Configurações de Disponibilidade & Folga
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                  Defina o tempo de descanso e deslocamento automático entre corridas agendadas:
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {[0, 15, 30, 45, 60].map(min => {
                    const activeBuffer = typeof currentConfig.bufferBetweenRidesMin === 'number' ? currentConfig.bufferBetweenRidesMin : 30;
                    const isSelected = activeBuffer === min;
                    return (
                      <button
                        key={min}
                        type="button"
                        onClick={async () => {
                          const updated = { ...currentConfig, bufferBetweenRidesMin: min };
                          setCurrentConfig(updated);
                          await StorageService.saveConfig(updated);
                          onRefreshData();
                        }}
                        style={{
                          padding: '9px 14px',
                          borderRadius: 10,
                          backgroundColor: isSelected ? '#76D800' : '#FFFFFF',
                          color: isSelected ? '#121A21' : '#334155',
                          fontWeight: 800,
                          fontSize: '0.82rem',
                          border: isSelected ? '1.5px solid #76D800' : '1px solid #CBD5E1',
                          cursor: 'pointer',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                        }}
                      >
                        {min === 0 ? '0 min (Sem folga)' : `${min} min`}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* TIMELINE NORMAL DA AGENDA (quando agendaSubTab === 'agenda') */
              <>
                {/* TIMELINE DE SLOTS DIÁRIOS (COM BOTÕES DIRETOS DE ACEITAR / INICIAR / DESBLOQUEAR) */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  paddingTop: 4,
                  position: 'relative'
                }}>
                  {/* Linha Vertical Conectora da Timeline */}
                  <div style={{
                    position: 'absolute',
                    left: 56,
                    top: 8,
                    bottom: 8,
                    width: 2,
                    backgroundColor: '#E2E8F0',
                    zIndex: 0
                  }} />

                  {dayTimelineSlots.map(slotTime => {
                    const occ = getSlotOccupation(slotTime);
                    const isRideStart = occ?.type === 'ride_start';
                    const isRideTransit = occ?.type === 'ride_transit';
                    const isRideBuffer = occ?.type === 'ride_buffer';
                    const ride = occ?.ride;
                    const isBlocked = (blockedSlots[selectedAgendaDate] || []).includes(slotTime);

                    return (
                      <div
                        key={slotTime}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 14,
                          position: 'relative',
                          zIndex: 1
                        }}
                      >
                        {/* Coluna da Hora à Esquerda (08:30, 09:00, 10:00...) */}
                        <div style={{
                          width: 44,
                          textAlign: 'right',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          color: (isRideStart || isRideTransit) ? '#121A21' : '#64748B',
                          paddingTop: 11,
                          flexShrink: 0,
                          letterSpacing: '-0.02em'
                        }}>
                          {slotTime}
                        </div>

                        {/* Conteúdo do Slot (Tracejado se Vazio, Card Ocupado se Marcado, ou Card Bloqueado com Botão Desbloquear) */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {isRideStart && ride ? (
                            /* CARD OCUPADO COM AÇÕES DIRETAS */
                            <div
                              onClick={() => setSelectedRideDetail(ride)}
                              style={{
                                backgroundColor: '#FFFFFF',
                                borderRadius: 14,
                                padding: '12px 14px',
                                border: '1px solid #E2E8F0',
                                borderLeft: `4.5px solid ${
                                  ride.status === 'aguardando_confirmacao' ? '#F59E0B' :
                                  ride.status === 'confirmada' || ride.status === 'a_caminho' || ride.status === 'em_andamento' ? '#2563EB' :
                                  ride.status === 'finalizada' ? '#16A34A' :
                                  '#EF4444'
                                }`,
                                boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 6,
                                transition: 'all 0.15s ease'
                              }}
                            >
                              {/* Linha 1: Horário Real com Duração Calculada, VIP / Status */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: '0.88rem', fontWeight: 900, color: '#121A21' }}>
                                    {ride.time} - {calculateEndTime(ride.time, ride.durationMin || 30)}
                                  </span>
                                  <span style={{
                                    backgroundColor: '#F1F5F9',
                                    color: '#475569',
                                    fontSize: '0.64rem',
                                    fontWeight: 700,
                                    padding: '2px 6px',
                                    borderRadius: 6
                                  }}>
                                    {ride.durationMin || 30}min
                                  </span>
                                  <span style={{
                                    fontSize: '0.64rem',
                                    fontWeight: 800,
                                    padding: '2px 7px',
                                    borderRadius: 6,
                                    backgroundColor:
                                      ride.status === 'aguardando_confirmacao' ? '#FEF3C7' :
                                      ride.status === 'confirmada' ? '#DBEAFE' :
                                      ride.status === 'a_caminho' || ride.status === 'em_andamento' ? '#E0E7FF' :
                                      ride.status === 'finalizada' ? '#DCFCE7' : '#FEE2E2',
                                    color:
                                      ride.status === 'aguardando_confirmacao' ? '#B45309' :
                                      ride.status === 'confirmada' ? '#1D4ED8' :
                                      ride.status === 'a_caminho' || ride.status === 'em_andamento' ? '#3730A3' :
                                      ride.status === 'finalizada' ? '#15803D' : '#DC2626'
                                  }}>
                                    {ride.status === 'aguardando_confirmacao' ? 'Aguardando' :
                                     ride.status === 'confirmada' ? 'Confirmada' :
                                     ride.status === 'a_caminho' ? 'A Caminho' :
                                     ride.status === 'em_andamento' ? 'Em Andamento' :
                                     ride.status === 'finalizada' ? 'Concluída' : 'Cancelada'}
                                  </span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  {ride.passengers > 1 && (
                                    <span style={{
                                      backgroundColor: '#FEE2E2',
                                      color: '#991B1B',
                                      fontSize: '0.64rem',
                                      fontWeight: 800,
                                      padding: '2px 7px',
                                      borderRadius: 8,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 3
                                    }}>
                                      👑 VIP
                                    </span>
                                  )}

                                  <div style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    backgroundColor:
                                      ride.status === 'aguardando_confirmacao' ? '#F59E0B' :
                                      ride.status === 'confirmada' || ride.status === 'a_caminho' || ride.status === 'em_andamento' ? '#2563EB' :
                                      ride.status === 'finalizada' ? '#16A34A' :
                                      '#EF4444',
                                    boxShadow: `0 0 6px ${
                                      ride.status === 'aguardando_confirmacao' ? '#F59E0B' :
                                      ride.status === 'confirmada' || ride.status === 'a_caminho' || ride.status === 'em_andamento' ? '#2563EB' :
                                      ride.status === 'finalizada' ? '#16A34A' :
                                      '#EF4444'
                                    }`
                                  }} />
                                </div>
                              </div>

                              {/* Linha 2: Nome do Passageiro + Botão WhatsApp */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.94rem', fontWeight: 800, color: '#121A21' }}>
                                  {ride.clientName}
                                </span>

                                <a
                                  href={`https://wa.me/55${ride.clientPhone.replace(/\D/g, '')}?text=Ol%C3%A1%20${encodeURIComponent(ride.clientName)},%20sou%20seu%20motorista%20da%20UP%20Mobilidade%20sobre%20a%20corrida%20${ride.id}.`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  title="WhatsApp"
                                  style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: '50%',
                                    backgroundColor: '#25D366',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: '0 2px 6px rgba(37, 211, 102, 0.3)',
                                    flexShrink: 0
                                  }}
                                >
                                  <WhatsAppIcon size={17} />
                                </a>
                              </div>

                              {/* Linha 3: Rota / Trajeto */}
                              <div style={{ fontSize: '0.74rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <span style={{ color: '#475569' }}>{ride.origin.address.split(',')[0]}</span>
                                <span>➔</span>
                                <span style={{ color: '#121A21', fontWeight: 700 }}>{ride.destination.address.split(',')[0]}</span>
                              </div>

                              {/* Linha 4: Preço em destaque e Botões Diretos de Aceitar / Iniciar / Concluir */}
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: 8,
                                paddingTop: 6,
                                borderTop: '1px solid #F1F5F9',
                                marginTop: 2
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: '0.94rem', fontWeight: 900, color: '#15803D' }}>
                                    R$ {ride.totalPrice.toFixed(2)}
                                  </span>
                                  <span style={{ fontSize: '0.68rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>
                                    • {ride.paymentMethod === 'pix' ? 'PIX' : ride.paymentMethod === 'cartao_credito' ? 'Cartão' : 'Dinheiro'}
                                  </span>
                                  <span style={{
                                    fontSize: '0.62rem',
                                    fontWeight: 800,
                                    padding: '1px 5px',
                                    borderRadius: 5,
                                    backgroundColor: ride.paymentStatus === 'pago' ? '#DCFCE7' : '#FEF3C7',
                                    color: ride.paymentStatus === 'pago' ? '#15803D' : '#B45309'
                                  }}>
                                    {ride.paymentStatus === 'pago' ? '✓ Pago' : '⏳ A Receber'}
                                  </span>
                                </div>

                                {/* Botões de Ação Direta na Agenda */}
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
                                >
                                  {ride.status === 'aguardando_confirmacao' && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (window.confirm('Deseja recusar e cancelar este agendamento?')) {
                                            handleUpdateStatus(ride.id, 'cancelada');
                                          }
                                        }}
                                        style={{
                                          padding: '5px 10px',
                                          borderRadius: 8,
                                          backgroundColor: '#FEF2F2',
                                          border: '1px solid #FECACA',
                                          color: '#DC2626',
                                          fontSize: '0.72rem',
                                          fontWeight: 800,
                                          cursor: 'pointer'
                                        }}
                                      >
                                        Recusar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateStatus(ride.id, 'confirmada')}
                                        style={{
                                          padding: '6px 12px',
                                          borderRadius: 8,
                                          backgroundColor: '#76D800',
                                          border: '1px solid #65BE00',
                                          color: '#121A21',
                                          fontSize: '0.74rem',
                                          fontWeight: 900,
                                          cursor: 'pointer',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 4,
                                          boxShadow: '0 2px 6px rgba(118, 216, 0, 0.25)'
                                        }}
                                      >
                                        <Check size={13} strokeWidth={3} />
                                        <span>Aceitar Corrida</span>
                                      </button>
                                    </>
                                  )}

                                  {ride.status === 'confirmada' && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (window.confirm('Deseja cancelar esta corrida?')) {
                                            handleUpdateStatus(ride.id, 'cancelada');
                                          }
                                        }}
                                        style={{
                                          padding: '5px 10px',
                                          borderRadius: 8,
                                          backgroundColor: '#FEF2F2',
                                          border: '1px solid #FECACA',
                                          color: '#DC2626',
                                          fontSize: '0.72rem',
                                          fontWeight: 700,
                                          cursor: 'pointer'
                                        }}
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleUpdateStatus(ride.id, 'a_caminho');
                                          setGpsRide({ ...ride, status: 'a_caminho' });
                                        }}
                                        style={{
                                          padding: '6px 12px',
                                          borderRadius: 8,
                                          backgroundColor: '#76D800',
                                          border: '1px solid #65BE00',
                                          color: '#121A21',
                                          fontSize: '0.74rem',
                                          fontWeight: 900,
                                          cursor: 'pointer',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 5,
                                          boxShadow: '0 2px 6px rgba(118, 216, 0, 0.28)'
                                        }}
                                      >
                                        <Play size={12} fill="#121A21" />
                                        <span>Iniciar Corrida (GPS)</span>
                                      </button>
                                    </>
                                  )}

                                  {ride.status === 'a_caminho' && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => setGpsRide(ride)}
                                        style={{
                                          padding: '6px 12px',
                                          borderRadius: 8,
                                          backgroundColor: '#121A21',
                                          border: '1.5px solid #76D800',
                                          color: '#76D800',
                                          fontSize: '0.74rem',
                                          fontWeight: 800,
                                          cursor: 'pointer',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 4
                                        }}
                                      >
                                        <Navigation size={12} color="#76D800" />
                                        <span>Abrir GPS ao Vivo</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setCheckoutRide(ride)}
                                        style={{
                                          padding: '6px 10px',
                                          borderRadius: 8,
                                          backgroundColor: '#10B981',
                                          border: 'none',
                                          color: '#FFFFFF',
                                          fontSize: '0.72rem',
                                          fontWeight: 800,
                                          cursor: 'pointer'
                                        }}
                                      >
                                        ✓ Concluir
                                      </button>
                                    </>
                                  )}

                                  {ride.status === 'em_andamento' && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => setGpsRide(ride)}
                                        style={{
                                          padding: '6px 12px',
                                          borderRadius: 8,
                                          backgroundColor: '#121A21',
                                          border: '1.5px solid #76D800',
                                          color: '#76D800',
                                          fontSize: '0.74rem',
                                          fontWeight: 800,
                                          cursor: 'pointer',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 4
                                        }}
                                      >
                                        <Navigation size={12} color="#76D800" />
                                        <span>Abrir GPS</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setCheckoutRide(ride)}
                                        style={{
                                          padding: '6px 12px',
                                          borderRadius: 8,
                                          backgroundColor: '#10B981',
                                          border: 'none',
                                          color: '#FFFFFF',
                                          fontSize: '0.74rem',
                                          fontWeight: 800,
                                          cursor: 'pointer',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 4
                                        }}
                                      >
                                        <CheckCircle2 size={13} />
                                        <span>Concluir Corrida</span>
                                      </button>
                                    </>
                                  )}

                                  {ride.status === 'finalizada' && (
                                    <span
                                      onClick={() => setSelectedRideDetail(ride)}
                                      style={{ fontSize: '0.7rem', color: '#15803D', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                      Detalhes ➔
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : isRideTransit && ride ? (
                            /* CARD DE VIAGEM EM ANDAMENTO */
                            <div
                              onClick={() => setSelectedRideDetail(ride)}
                              style={{
                                backgroundColor: '#EFF6FF',
                                borderRadius: 12,
                                padding: '10px 14px',
                                border: '1.5px solid #BFDBFE',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: 8,
                                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.08)',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: '#1D4ED8', fontWeight: 800 }}>
                                <span style={{ fontSize: '1.05rem' }}>🚗</span>
                                <div>
                                  <div>Em Viagem: {ride.clientName}</div>
                                  <div style={{ fontSize: '0.68rem', color: '#60A5FA', fontWeight: 600 }}>
                                    Iniciou às {ride.time} • Término previsto às {calculateEndTime(ride.time, ride.durationMin || 30)}
                                  </div>
                                </div>
                              </div>
                              <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {(ride.status === 'confirmada') && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleUpdateStatus(ride.id, 'a_caminho');
                                      setGpsRide({ ...ride, status: 'a_caminho' });
                                    }}
                                    style={{
                                      padding: '5px 10px',
                                      borderRadius: 8,
                                      backgroundColor: '#76D800',
                                      border: '1px solid #65BE00',
                                      color: '#121A21',
                                      fontSize: '0.7rem',
                                      fontWeight: 800,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    ▶ Iniciar GPS
                                  </button>
                                )}
                                {(ride.status === 'a_caminho' || ride.status === 'em_andamento') && (
                                  <button
                                    type="button"
                                    onClick={() => setGpsRide(ride)}
                                    style={{
                                      padding: '5px 10px',
                                      borderRadius: 8,
                                      backgroundColor: '#121A21',
                                      border: '1px solid #76D800',
                                      color: '#76D800',
                                      fontSize: '0.7rem',
                                      fontWeight: 800,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    🧭 Abrir GPS
                                  </button>
                                )}
                                <span
                                  onClick={() => setSelectedRideDetail(ride)}
                                  style={{ fontSize: '0.7rem', color: '#2563EB', fontWeight: 700, cursor: 'pointer' }}
                                >
                                  Ver corrida ➔
                                </span>
                              </div>
                            </div>
                          ) : isRideBuffer && ride ? (
                            /* CARD DE FOLGA / DESLOCAMENTO PÓS-VIAGEM */
                            <div
                              style={{
                                backgroundColor: '#F8FAFC',
                                borderRadius: 10,
                                padding: '8px 12px',
                                border: '1px dashed #CBD5E1',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                color: '#64748B',
                                fontSize: '0.74rem',
                                fontWeight: 600
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span>⏱️</span>
                                <span>Intervalo de Folga / Deslocamento pós-viagem</span>
                              </div>
                              <span style={{ fontSize: '0.68rem', backgroundColor: '#E2E8F0', color: '#334155', padding: '2px 7px', borderRadius: 6, fontWeight: 800 }}>
                                {typeof currentConfig.bufferBetweenRidesMin === 'number' ? currentConfig.bufferBetweenRidesMin : 30} min
                              </span>
                            </div>
                          ) : isBlocked ? (
                            /* CARD BLOQUEADO COM BOTÃO DIRETO DE DESBLOQUEAR */
                            <div
                              style={{
                                border: '1.5px solid #F59E0B',
                                borderRadius: 12,
                                minHeight: 46,
                                padding: '8px 12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 8,
                                color: '#B45309',
                                backgroundColor: '#FFFBEB',
                                boxShadow: '0 2px 6px rgba(245, 158, 11, 0.08)'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700 }}>
                                <span>🔒</span>
                                <span>Horário Bloqueado Manualmente</span>
                              </div>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUnblockSlot(slotTime);
                                }}
                                title="Desbloquear este horário"
                                style={{
                                  padding: '5px 12px',
                                  borderRadius: 8,
                                  backgroundColor: '#FFFFFF',
                                  border: '1.5px solid #16A34A',
                                  color: '#15803D',
                                  fontSize: '0.74rem',
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
                                }}
                              >
                                <span>🔓 Desbloquear</span>
                              </button>
                            </div>
                          ) : (
                            /* SLOT VAZIO TRACEJADO (+ AGENDAR) */
                            <div
                              onClick={() => {
                                setManualInitialDate(selectedAgendaDate);
                                setManualInitialTime(slotTime);
                                setIsManualModalOpen(true);
                              }}
                              style={{
                                border: '1.5px dashed #CBD5E1',
                                borderRadius: 12,
                                height: 44,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                color: '#64748B',
                                backgroundColor: '#F8FAFC',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = '#76D800';
                                e.currentTarget.style.color = '#15803D';
                                e.currentTarget.style.backgroundColor = 'rgba(118, 216, 0, 0.08)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = '#CBD5E1';
                                e.currentTarget.style.color = '#64748B';
                                e.currentTarget.style.backgroundColor = '#F8FAFC';
                              }}
                            >
                              <Plus size={14} />
                              <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                                + Agendar
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ================= ABA DEDICADA: CENTRAL SOS EM TEMPO REAL ================= */}
        {activeTab === 'sos' && (
          <AdminSosCenterTab
            rides={rides}
            config={currentConfig}
            onAlertsCountChange={setActiveSosAlertsCount}
          />
        )}

        {/* ================= ABA DEDICADA: PLATAFORMA, 1000+ MOTORISTAS & SPLIT FINANCEIRO ================= */}
        {activeTab === 'plataforma' && (
          <AdminPlatformFinanceTab
            config={currentConfig}
            rides={rides}
            initialSection="motoristas"
            onConfigUpdated={(next) => {
              setCurrentConfig(next);
              onRefreshData();
            }}
          />
        )}

        {/* ================= ABA DEDICADA: CATEGORIAS DE CORRIDAS (GO, PLUS, EXEC) ================= */}
        {activeTab === 'categorias' && (
          <AdminRideCategoriesTab
            config={currentConfig}
            rides={rides}
            onConfigUpdated={(next) => {
              setCurrentConfig(next);
              onRefreshData();
            }}
          />
        )}

        {/* ================= ABA DEDICADA: ROTAS GRAVADAS & AUDITORIA GPS ================= */}
        {activeTab === 'rotas' && (
          <AdminRecordedRoutesTab
            rides={rides}
            config={currentConfig}
            onOpenPlayback={(r) => setAuditPlaybackRide(r)}
          />
        )}

        {/* ================= ABA 3: FINANCEIRO MASTER, TAXAS & LIVRO-RAZÃO ================= */}
        {activeTab === 'financeiro' && (
          <AdminPlatformFinanceTab
            config={currentConfig}
            rides={rides}
            initialSection="visao_geral"
            onConfigUpdated={(next) => {
              setCurrentConfig(next);
              onRefreshData();
            }}
          />
        )}

        {/* LEGADO DESATIVADO NO MASTER */}
        {false && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Top Bar: Título & Ações Rápidas Ultra-Compactas (Otimizado para Caber Extrato na Tela) */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 6,
              paddingBottom: 0
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <h2 style={{ fontSize: '1.08rem', fontWeight: 900, color: '#121A21', letterSpacing: '-0.02em', margin: 0 }}>
                    Painel Financeiro
                  </h2>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 7px',
                    borderRadius: 999,
                    backgroundColor: '#ECFDF5',
                    border: '1px solid #A7F3D0',
                    fontSize: '0.62rem',
                    color: '#065F46',
                    fontWeight: 700
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block' }} />
                    Supabase PostgreSQL
                  </span>
                </div>
                <p style={{ fontSize: '0.66rem', color: '#64748B', margin: '1px 0 0 0' }}>
                  Rentabilidade líquida, faturamento e despesas operacionais
                </p>
              </div>

              {/* Botões de Ação no Topo (Compactos) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleSyncDatabase}
                  disabled={isSyncingDb}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '5px 8px',
                    borderRadius: 8,
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #CBD5E1',
                    color: '#334155',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  title="Sincronizar com banco de dados Supabase PostgreSQL"
                >
                  <RefreshCw size={12} className={isSyncingDb ? 'animate-spin' : ''} />
                  <span>Sync</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenNewTransaction('entrada')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '5px 9px',
                    borderRadius: 8,
                    backgroundColor: '#16A34A',
                    color: '#FFFFFF',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(22,163,74,0.22)',
                    transition: 'all 0.15s ease'
                  }}
                  title="Lançar nova entrada (receita)"
                >
                  <Plus size={13} strokeWidth={2.5} />
                  <span>Entrada</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenNewTransaction('saida')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '5px 9px',
                    borderRadius: 8,
                    backgroundColor: '#DC2626',
                    color: '#FFFFFF',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(220,38,38,0.22)',
                    transition: 'all 0.15s ease'
                  }}
                  title="Lançar nova saída (despesa operacional)"
                >
                  <Plus size={13} strokeWidth={2.5} />
                  <span>Saída</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPdfModalOpen(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '5px 9px',
                    borderRadius: 8,
                    backgroundColor: '#0284C7',
                    color: '#FFFFFF',
                    border: 'none',
                    fontWeight: 800,
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(2,132,199,0.22)',
                    transition: 'all 0.15s ease'
                  }}
                  title="Gerar e Baixar Relatório em PDF"
                >
                  <FileText size={13} />
                  <span>PDF</span>
                </button>
              </div>
            </div>

            {/* Seletor de Período Ultra-Compacto */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 3,
              padding: 2.5,
              backgroundColor: '#F1F5F9',
              borderRadius: 10
            }}>
              {[
                { id: 'hoje', label: 'Hoje', icon: '⚡' },
                { id: 'semanal', label: 'Semanal', icon: '📅' },
                { id: 'mensal', label: 'Mensal', icon: '📆' },
                { id: 'todos', label: 'Todos', icon: '🌐' }
              ].map(tab => {
                const isActive = financePeriod === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFinancePeriod(tab.id as any)}
                    style={{
                      padding: '5px 2px',
                      borderRadius: 7,
                      border: 'none',
                      backgroundColor: isActive ? '#121A21' : 'transparent',
                      color: isActive ? '#76D800' : '#475569',
                      fontWeight: isActive ? 800 : 600,
                      fontSize: '0.72rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 3,
                      cursor: 'pointer',
                      boxShadow: isActive ? '0 2px 5px rgba(18,26,33,0.18)' : 'none',
                      transition: 'all 0.15s ease',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <span>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Navegador de Mês Slim (Apenas 30px de altura, economiza espaço na tela) */}
            {financePeriod === 'mensal' && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 8px',
                backgroundColor: '#FFFFFF',
                borderRadius: 10,
                border: '1px solid #E2E8F0',
                gap: 6
              }}>
                <button
                  type="button"
                  onClick={() => handleShiftFinanceMonth(-1)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 7,
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #CBD5E1',
                    color: '#1E293B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                  title="Mês anterior"
                >
                  <ChevronLeft size={16} />
                </button>

                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  position: 'relative',
                  cursor: 'pointer'
                }}>
                  <Calendar size={13} color="#0284C7" />
                  <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#121A21', textTransform: 'capitalize' }}>
                    {financeMonthLabel}
                  </span>
                  {isCurrentFinanceMonth ? (
                    <span style={{ fontSize: '0.58rem', fontWeight: 800, backgroundColor: '#DCFCE7', color: '#15803D', padding: '1px 5px', borderRadius: 4 }}>
                      Atual
                    </span>
                  ) : (
                    <span
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFinanceSelectedMonth(todayStr.slice(0, 7)); }}
                      style={{ fontSize: '0.58rem', fontWeight: 800, backgroundColor: '#E0F2FE', color: '#0369A1', padding: '1px 5px', borderRadius: 4, cursor: 'pointer' }}
                    >
                      Ir ao Atual
                    </span>
                  )}
                  <input
                    type="month"
                    value={financeSelectedMonth}
                    onChange={(e) => { if (e.target.value) setFinanceSelectedMonth(e.target.value); }}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                  />
                </label>

                <button
                  type="button"
                  onClick={() => handleShiftFinanceMonth(1)}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 7,
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #CBD5E1',
                    color: '#1E293B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                  title="Próximo mês"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}

            {/* DASHBOARD EXECUTIVO CONDENSADO: Lucro Líquido + Receita + Despesas + Micro KPIs (Altura Reduzida) */}
            <div style={{
              background: 'linear-gradient(135deg, #0F172A 0%, #121A21 60%, #1A2632 100%)',
              borderRadius: 12,
              padding: '10px 12px',
              color: '#FFFFFF',
              boxShadow: '0 4px 14px rgba(15,23,42,0.18), 0 0 0 1px rgba(255,255,255,0.08)',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              gap: 7
            }}>
              {/* Linha 1: Lucro Líquido em Destaque + Badge de Margem */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: '0.64rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94A3B8' }}>
                    Lucro Líquido:
                  </span>
                  <span style={{
                    fontSize: '1.35rem',
                    fontWeight: 900,
                    letterSpacing: '-0.02em',
                    lineHeight: 1,
                    color: financeStats.net >= 0 ? '#4ADE80' : '#FCA5A5'
                  }}>
                    R$ {financeStats.net.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {financeStats.pendingRev > 0 && (
                    <span style={{
                      fontSize: '0.6rem',
                      fontWeight: 800,
                      padding: '1px 6px',
                      borderRadius: 999,
                      backgroundColor: 'rgba(245,158,11,0.2)',
                      color: '#FCD34D',
                      border: '1px solid rgba(245,158,11,0.35)'
                    }}>
                      ⏳ R$ {financeStats.pendingRev.toFixed(2)}
                    </span>
                  )}
                  <span style={{
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    padding: '2px 7px',
                    borderRadius: 999,
                    backgroundColor: financeStats.net >= 0 ? 'rgba(118,216,0,0.18)' : 'rgba(239,68,68,0.2)',
                    color: financeStats.net >= 0 ? '#76D800' : '#FCA5A5',
                    border: `1px solid ${financeStats.net >= 0 ? 'rgba(118,216,0,0.35)' : 'rgba(239,68,68,0.4)'}`
                  }}>
                    {financeStats.marginBadge}
                  </span>
                </div>
              </div>

              {/* Linha 2: 3 Mini Colunas (Receita, Despesas, Caixa Liquidado) */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 5,
                paddingTop: 6,
                borderTop: '1px solid rgba(255,255,255,0.08)'
              }}>
                <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', padding: '4px 6px', borderRadius: 7 }}>
                  <div style={{ fontSize: '0.58rem', color: '#94A3B8', fontWeight: 700 }}>↑ Receita ({financeStats.activeRides.length})</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 900, color: '#4ADE80' }}>+ R$ {financeStats.totalRev.toFixed(2)}</div>
                </div>

                <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', padding: '4px 6px', borderRadius: 7 }}>
                  <div style={{ fontSize: '0.58rem', color: '#94A3B8', fontWeight: 700 }}>↓ Despesas ({financeStats.periodExpenses.length})</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 900, color: '#F87171' }}>- R$ {financeStats.totalExp.toFixed(2)}</div>
                </div>

                <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', padding: '4px 6px', borderRadius: 7 }}>
                  <div style={{ fontSize: '0.58rem', color: '#94A3B8', fontWeight: 700 }}>✓ Caixa Liquidado</div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 900, color: financeStats.paidNet >= 0 ? '#4ADE80' : '#FCA5A5' }}>
                    R$ {financeStats.paidNet.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Linha 3: Micro Indicadores (Ticket, KM, Hora) e Formas de Pagamento em 1 linha compacta */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.62rem',
                color: '#94A3B8',
                paddingTop: 4,
                borderTop: '1px solid rgba(255,255,255,0.06)',
                flexWrap: 'wrap',
                gap: 4
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span>🎯 Ticket: <b style={{ color: '#FFFFFF' }}>R$ {financeStats.avgTicket.toFixed(2)}</b></span>
                  <span>•</span>
                  <span>📍 KM: <b style={{ color: '#4ADE80' }}>R$ {financeStats.revPerKm.toFixed(2)}</b></span>
                  <span>•</span>
                  <span>⏱️ Hora: <b style={{ color: '#60A5FA' }}>R$ {financeStats.hourlyEarnings.toFixed(0)}/h</b></span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ color: '#2DD4BF', fontWeight: 700 }}>PIX: {financeStats.pixPct}%</span>
                  <span>•</span>
                  <span style={{ color: '#93C5FD', fontWeight: 700 }}>Cartão: {financeStats.cardPct}%</span>
                  <span>•</span>
                  <span style={{ color: '#FCD34D', fontWeight: 700 }}>Dinheiro: {financeStats.cashPct}%</span>
                </div>
              </div>
            </div>

            {/* ================= EXTRATO UNIFICADO: ENTRADAS, DESPESAS E AGENDAMENTOS NO MESMO LUGAR (TELA INTEIRA) ================= */}
            {(() => {
              type UnifiedFinanceItem = 
                | { kind: 'ride'; id: string; date: string; time: string; data: Ride }
                | { kind: 'expense'; id: string; date: string; time: string; data: Expense };

              const unifiedFeed: UnifiedFinanceItem[] = [
                ...financeStats.activeRides.map(ride => ({
                  kind: 'ride' as const,
                  id: ride.id,
                  date: ride.date,
                  time: ride.time || '12:00',
                  data: ride
                })),
                ...financeStats.periodExpenses.map(exp => ({
                  kind: 'expense' as const,
                  id: exp.id,
                  date: exp.date,
                  time: '00:00',
                  data: exp
                }))
              ].sort((a, b) => {
                if (b.date !== a.date) return b.date.localeCompare(a.date);
                return b.time.localeCompare(a.time);
              });

              const filteredFeed = unifiedFeed.filter(item => {
                if (financeFeedFilter === 'entradas') {
                  return item.kind === 'ride' || (item.kind === 'expense' && item.data.type === 'entrada');
                }
                if (financeFeedFilter === 'despesas') {
                  return item.kind === 'expense' && item.data.type !== 'entrada';
                }
                if (financeFeedFilter === 'a_receber') {
                  return item.kind === 'ride' && item.data.paymentStatus !== 'pago';
                }
                return true;
              });

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', marginTop: 2 }}>
                  {/* Header do Extrato Unificado (Sem bordas de modal, 100% tela inteira) */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 10,
                    padding: '2px 2px'
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{
                          width: 24,
                          height: 24,
                          borderRadius: 8,
                          backgroundColor: '#121A21',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <ArrowDownRight size={14} color="#76D800" />
                        </div>
                        <h3 style={{ fontSize: '1.08rem', fontWeight: 900, color: '#121A21', margin: 0, letterSpacing: '-0.02em' }}>
                          Extrato & Lançamentos
                        </h3>
                      </div>
                      <p style={{ fontSize: '0.72rem', color: '#64748B', margin: '3px 0 0 0' }}>
                        {unifiedFeed.length} movimentações no período • + R$ {financeStats.totalRev.toFixed(2)} entradas, - R$ {financeStats.totalExp.toFixed(2)} despesas
                      </p>
                    </div>

                    {/* Botões Rápidos de Lançamento: Entrada e Saída lado a lado */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenNewTransaction('entrada')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '6px 14px',
                          borderRadius: 10,
                          backgroundColor: '#DCFCE7',
                          border: '1.5px solid #86EFAC',
                          color: '#15803D',
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          boxShadow: '0 1px 3px rgba(22, 163, 74, 0.12)',
                          transition: 'all 0.15s ease'
                        }}
                        title="Lançar nova entrada (receita)"
                      >
                        <Plus size={14} strokeWidth={2.5} />
                        <span>Entrada</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenNewTransaction('saida')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '6px 14px',
                          borderRadius: 10,
                          backgroundColor: '#FEF2F2',
                          border: '1.5px solid #FECACA',
                          color: '#DC2626',
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          boxShadow: '0 1px 3px rgba(220, 38, 38, 0.12)',
                          transition: 'all 0.15s ease'
                        }}
                        title="Lançar nova saída (despesa operacional)"
                      >
                        <Plus size={14} strokeWidth={2.5} />
                        <span>Saída</span>
                      </button>
                    </div>
                  </div>

                  {/* Segmented Control Filtro 100% Tela Inteira */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 4,
                    padding: 3,
                    backgroundColor: '#F1F5F9',
                    borderRadius: 12
                  }}>
                    {[
                      { id: 'todos', label: 'Todos', count: unifiedFeed.length },
                      { id: 'entradas', label: 'Entradas', count: financeStats.activeRides.length + (financeStats.periodEntradas?.length || 0) },
                      { id: 'despesas', label: 'Despesas', count: financeStats.periodSaidas?.length || 0 },
                      { id: 'a_receber', label: 'A Receber', count: financeStats.pendingRides.length }
                    ].map(tab => {
                      const isActive = financeFeedFilter === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setFinanceFeedFilter(tab.id as any)}
                          style={{
                            border: 'none',
                            borderRadius: 9,
                            padding: '7px 2px',
                            fontSize: '0.72rem',
                            fontWeight: isActive ? 800 : 600,
                            backgroundColor: isActive ? '#121A21' : 'transparent',
                            color: isActive ? '#76D800' : '#64748B',
                            cursor: 'pointer',
                            textAlign: 'center',
                            boxShadow: isActive ? '0 2px 6px rgba(18,26,33,0.15)' : 'none',
                            transition: 'all 0.15s ease',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {tab.label} ({tab.count})
                        </button>
                      );
                    })}
                  </div>

                  {/* Lista Unificada */}
                  {filteredFeed.length === 0 ? (
                    <div style={{
                      padding: '36px 20px',
                      textAlign: 'center',
                      backgroundColor: '#FFFFFF',
                      borderRadius: 14,
                      border: '1.5px dashed #CBD5E1'
                    }}>
                      <div style={{ fontSize: '1.8rem', marginBottom: 6 }}>
                        {financeFeedFilter === 'despesas' ? '⛽' : financeFeedFilter === 'a_receber' ? '⏳' : '📊'}
                      </div>
                      <p style={{ fontSize: '0.84rem', fontWeight: 800, color: '#1E293B', margin: 0 }}>
                        {financeFeedFilter === 'a_receber' ? 'Nenhum valor pendente a receber neste filtro!' :
                         financeFeedFilter === 'despesas' ? 'Nenhuma despesa registrada no período.' :
                         financeFeedFilter === 'entradas' ? 'Nenhuma corrida ou agendamento registrado no período.' :
                         'Nenhum lançamento financeiro registrado neste período.'}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 }}>
                        {financeFeedFilter !== 'despesas' && (
                          <button
                            type="button"
                            onClick={() => handleOpenNewTransaction('entrada')}
                            style={{
                              padding: '6px 14px',
                              borderRadius: 10,
                              backgroundColor: '#DCFCE7',
                              border: '1.5px solid #86EFAC',
                              color: '#15803D',
                              fontSize: '0.76rem',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                          >
                            + Lançar Entrada
                          </button>
                        )}
                        {financeFeedFilter !== 'entradas' && (
                          <button
                            type="button"
                            onClick={() => handleOpenNewTransaction('saida')}
                            style={{
                              padding: '6px 14px',
                              borderRadius: 10,
                              backgroundColor: '#FEF2F2',
                              border: '1.5px solid #FECACA',
                              color: '#DC2626',
                              fontSize: '0.76rem',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                          >
                            + Lançar Saída
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, width: '100%' }}>
                      {filteredFeed.map(item => {
                        if (item.kind === 'ride') {
                          const ride = item.data;
                          const isPaid = ride.paymentStatus === 'pago';
                          const orig = typeof ride.origin === 'string' ? ride.origin : (ride.origin?.address || '');
                          const dest = typeof ride.destination === 'string' ? ride.destination : (ride.destination?.address || '');
                          const origShort = orig.split(',')[0];
                          const destShort = dest.split(',')[0];
                          const stripeColor = 
                            ride.status === 'aguardando_confirmacao' ? '#F59E0B' :
                            ride.status === 'confirmada' || ride.status === 'a_caminho' || ride.status === 'em_andamento' ? '#3B82F6' :
                            ride.status === 'finalizada' ? '#10B981' :
                            '#EF4444';

                          return (
                            <div
                              key={`ride-${ride.id}`}
                              onClick={() => setSelectedRideDetail(ride)}
                              style={{
                                position: 'relative',
                                backgroundColor: '#14171F',
                                borderRadius: 13,
                                padding: '10px 12px 10px 16px',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                boxShadow: '0 3px 12px rgba(0, 0, 0, 0.25)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 4,
                                overflow: 'hidden',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              {/* Faixa Lateral Colorida (Referência: Azul=Confirmada, Laranja=Aguardando, Verde=Finalizada, Vermelho=Cancelada) */}
                              <div style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: 4,
                                backgroundColor: stripeColor,
                                borderRadius: '4px 0 0 4px'
                              }} />

                              {/* Linha 1: Horário Inicial e Final + Duração + Data + Modalidade de Pagamento */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 5 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  {/* Badge ID Oficial (#UP - 001) */}
                                  <span style={{
                                    backgroundColor: 'rgba(118, 216, 0, 0.16)',
                                    color: '#76D800',
                                    border: '1px solid rgba(118, 216, 0, 0.35)',
                                    fontSize: '0.68rem',
                                    fontWeight: 900,
                                    padding: '1px 7px',
                                    borderRadius: 5
                                  }}>
                                    {formatRideCode(ride)}
                                  </span>
                                  {/* Horário Principal (Estilo Referência: 16:00 - 17:00) */}
                                  <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
                                    {ride.time} - {calculateEndTime(ride.time, ride.durationMin || 30)}
                                  </span>

                                  {/* Duração em Minutos (Pill 60min) */}
                                  <span style={{
                                    backgroundColor: '#262D38',
                                    color: '#CBD5E1',
                                    fontSize: '0.67rem',
                                    fontWeight: 700,
                                    padding: '1px 6px',
                                    borderRadius: 5,
                                    border: '1px solid rgba(255, 255, 255, 0.08)'
                                  }}>
                                    {ride.durationMin || 30}min
                                  </span>

                                  {/* Data em Destaque */}
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    color: '#94A3B8',
                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                    padding: '1px 6px',
                                    borderRadius: 5
                                  }}>
                                    <Calendar size={11} color="#76D800" />
                                    <span>{ride.date.split('-').reverse().slice(0, 2).join('/')}</span>
                                  </span>

                                  {ride.isManualBooking ? (
                                    <span style={{
                                      backgroundColor: 'rgba(118, 216, 0, 0.14)',
                                      color: '#76D800',
                                      fontSize: '0.6rem',
                                      fontWeight: 800,
                                      padding: '1px 5px',
                                      borderRadius: 4,
                                      border: '1px solid rgba(118, 216, 0, 0.3)'
                                    }} title="Transação adicionada manualmente pelo motorista">
                                      ✍️ Manual
                                    </span>
                                  ) : (
                                    <span style={{
                                      backgroundColor: 'rgba(148, 163, 184, 0.12)',
                                      color: '#94A3B8',
                                      fontSize: '0.6rem',
                                      fontWeight: 700,
                                      padding: '1px 5px',
                                      borderRadius: 4,
                                      border: '1px solid rgba(148, 163, 184, 0.2)'
                                    }} title="Agendamento feito pelo cliente online (Edição restrita)">
                                      🌐 Cliente
                                    </span>
                                  )}

                                  {ride.category === 'aeroporto' && (
                                    <span style={{
                                      backgroundColor: 'rgba(245, 158, 11, 0.15)',
                                      color: '#FCD34D',
                                      fontSize: '0.6rem',
                                      fontWeight: 800,
                                      padding: '1px 5px',
                                      borderRadius: 4,
                                      border: '1px solid rgba(245, 158, 11, 0.3)'
                                    }} title="Viagem identificada para Aeroporto / Voo">
                                      ✈️ Aeroporto
                                    </span>
                                  )}
                                </div>

                                {/* Destaque Forma de Pagamento & Status */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '2px 7px',
                                    borderRadius: 6,
                                    backgroundColor: ride.paymentMethod === 'pix' ? 'rgba(0, 180, 216, 0.15)' : ride.paymentMethod === 'dinheiro' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                                    border: `1px solid ${ride.paymentMethod === 'pix' ? 'rgba(0, 180, 216, 0.35)' : ride.paymentMethod === 'dinheiro' ? 'rgba(245, 158, 11, 0.35)' : 'rgba(59, 130, 246, 0.35)'}`
                                  }}>
                                    {ride.paymentMethod === 'pix' ? (
                                      <img width="13" height="13" src="https://img.icons8.com/fluency/48/pix.png" alt="pix" />
                                    ) : ride.paymentMethod === 'dinheiro' ? (
                                      <img width="13" height="13" src="https://img.icons8.com/fluency/48/money.png" alt="dinheiro" />
                                    ) : (
                                      <img width="13" height="13" src="https://img.icons8.com/color/48/bank-card-back-side.png" alt="cartão" />
                                    )}
                                    <span style={{
                                      fontSize: '0.64rem',
                                      fontWeight: 800,
                                      color: ride.paymentMethod === 'pix' ? '#2DD4BF' : ride.paymentMethod === 'dinheiro' ? '#FCD34D' : '#93C5FD',
                                      textTransform: 'uppercase'
                                    }}>
                                      {ride.paymentMethod === 'pix' ? 'PIX' : ride.paymentMethod === 'dinheiro' ? 'Dinheiro' : 'Cartão'}
                                    </span>
                                  </div>

                                  <span style={{
                                    fontSize: '0.62rem',
                                    fontWeight: 800,
                                    padding: '2px 6px',
                                    borderRadius: 6,
                                    backgroundColor: isPaid ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                                    color: isPaid ? '#4ADE80' : '#FCD34D',
                                    border: `1px solid ${isPaid ? 'rgba(16, 185, 129, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`
                                  }}>
                                    {isPaid ? '✓ Pago' : '⏳ A Receber'}
                                  </span>
                                </div>
                              </div>

                              {/* Linha 2: Nome do Passageiro + WhatsApp */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.98rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
                                  {ride.clientName}
                                </span>

                                {ride.clientPhone && (
                                  <a
                                    href={`https://wa.me/55${ride.clientPhone.replace(/\D/g, '')}?text=Ol%C3%A1%20${encodeURIComponent(ride.clientName)},%20sou%20seu%20motorista%20da%20UP%20Mobilidade.`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    style={{
                                      width: 26,
                                      height: 26,
                                      borderRadius: '50%',
                                      backgroundColor: '#25D366',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      boxShadow: '0 2px 6px rgba(37, 211, 102, 0.35)',
                                      flexShrink: 0
                                    }}
                                    title="Abrir WhatsApp"
                                  >
                                    <WhatsAppIcon size={14} />
                                  </a>
                                )}
                              </div>

                              {/* Linha 3: Rota / Trajeto */}
                              <div style={{ fontSize: '0.76rem', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <span style={{ color: '#CBD5E1' }}>{origShort}</span>
                                <span style={{ color: '#64748B' }}>➔</span>
                                <span style={{ color: '#FFFFFF', fontWeight: 600 }}>{destShort}</span>
                                {ride.notes && (
                                  <span style={{ color: '#64748B', marginLeft: 4 }}>• {ride.notes}</span>
                                )}
                              </div>

                              {/* Linha 4: Valor em Destaque e Ações Rápidas (Exatamente R$ 120,00 (Falta R$ 120,00)) */}
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                paddingTop: 6,
                                borderTop: '1px solid rgba(255, 255, 255, 0.07)',
                                marginTop: 4,
                                flexWrap: 'wrap',
                                gap: 8
                              }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                                  <span style={{
                                    fontSize: '1.05rem',
                                    fontWeight: 900,
                                    color: isPaid ? '#4ADE80' : '#F87171'
                                  }}>
                                    R$ {ride.totalPrice.toFixed(2)}
                                  </span>

                                  {!isPaid ? (
                                    <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#FB923C' }}>
                                      (Falta R$ {ride.totalPrice.toFixed(2)})
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#34D399' }}>
                                      (✓ Pago)
                                    </span>
                                  )}
                                </div>

                                {/* Ações de Cobrança / Liquidação */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  {!isPaid ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setCheckoutRide(ride);
                                        }}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 4,
                                          padding: '5px 11px',
                                          borderRadius: 9,
                                          backgroundColor: '#10B981',
                                          color: '#FFFFFF',
                                          border: 'none',
                                          fontSize: '0.72rem',
                                          fontWeight: 800,
                                          cursor: 'pointer',
                                          boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)',
                                          transition: 'all 0.15s ease'
                                        }}
                                        title="Abrir tela de recebimento oficial iOS"
                                      >
                                        <CreditCard size={13} />
                                        <span>Receber</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleUpdatePaymentStatus(ride.id, 'pago');
                                        }}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 4,
                                          padding: '5px 9px',
                                          borderRadius: 9,
                                          backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                          color: '#76D800',
                                          border: '1px solid rgba(118, 216, 0, 0.35)',
                                          fontSize: '0.72rem',
                                          fontWeight: 800,
                                          cursor: 'pointer',
                                          transition: 'all 0.15s ease'
                                        }}
                                        title="Marcar como Pago imediatamente"
                                      >
                                        <Check size={13} strokeWidth={2.5} />
                                        <span>Pago</span>
                                      </button>
                                    </>
                                  ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span style={{
                                        fontSize: '0.7rem',
                                        fontWeight: 800,
                                        color: '#4ADE80',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 3
                                      }}>
                                        <CheckCircle2 size={13} color="#4ADE80" />
                                        <span>Liquidado</span>
                                      </span>

                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleUpdatePaymentStatus(ride.id, 'pendente');
                                        }}
                                        style={{
                                          padding: '3px 7px',
                                          borderRadius: 7,
                                          backgroundColor: 'rgba(255, 255, 255, 0.06)',
                                          color: '#94A3B8',
                                          border: '1px solid rgba(255, 255, 255, 0.12)',
                                          fontSize: '0.64rem',
                                          fontWeight: 600,
                                          cursor: 'pointer'
                                        }}
                                        title="Voltar status para pendente"
                                      >
                                        Desfazer
                                      </button>
                                    </div>
                                  )}

                                  {/* SOMENTE TRANSAÇÕES ADICIONADAS MANUALMENTE PODEM SER EDITADAS */}
                                  {ride.isManualBooking ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenEditRide(ride);
                                      }}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        padding: '5px 9px',
                                        borderRadius: 8,
                                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                        color: '#E2E8F0',
                                        border: '1px solid rgba(255, 255, 255, 0.12)',
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                      }}
                                      title="Editar agendamento adicionado manualmente"
                                    >
                                      <Edit2 size={12} />
                                      <span>Editar</span>
                                    </button>
                                  ) : (
                                    <span
                                      style={{
                                        fontSize: '0.64rem',
                                        color: '#64748B',
                                        fontWeight: 600,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 3,
                                        padding: '3px 7px',
                                        borderRadius: 6,
                                        backgroundColor: 'rgba(255, 255, 255, 0.04)',
                                        border: '1px solid rgba(255, 255, 255, 0.06)'
                                      }}
                                      title="Agendamento feito pelo cliente via site (Edição restrita a transações manuais)"
                                    >
                                      <Lock size={10} color="#64748B" />
                                      <span>Cliente</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        } else {
                          // ENTRADA OU SAÍDA OPERACIONAL
                          const exp = item.data;
                          const isEntrada = exp.type === 'entrada';
                          const catName = exp.category || (isEntrada ? 'Corrida Particular' : 'Outros');

                          let exactTime = '';
                          if (exp.createdAt) {
                            try {
                              const d = new Date(exp.createdAt);
                              if (!isNaN(d.getTime())) {
                                exactTime = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                              }
                            } catch {
                              // fallback
                            }
                          }
                          if (!exactTime && exp.id.startsWith('exp-')) {
                            const ts = parseInt(exp.id.replace('exp-', ''), 10);
                            if (!isNaN(ts) && ts > 1000000000000) {
                              exactTime = new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                            }
                          }

                          return (
                            <div
                              key={`exp-${exp.id}`}
                              onClick={() => setSelectedExpenseDetail(exp)}
                              style={{
                                position: 'relative',
                                backgroundColor: '#14171F',
                                borderRadius: 13,
                                padding: '10px 12px 10px 16px',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                boxShadow: '0 3px 12px rgba(0, 0, 0, 0.25)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 4,
                                overflow: 'hidden',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              title="Toque para ver os detalhes completos desta movimentação"
                            >
                              {/* Faixa Lateral (Verde para Entrada / Vermelha para Saída) */}
                              <div style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: 4,
                                backgroundColor: isEntrada ? '#10B981' : '#EF4444',
                                borderRadius: '4px 0 0 4px'
                              }} />

                              {/* Linha 1: Data, Horário Exato, Categoria, Formato de Pagamento e Badge */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 5 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    fontSize: '0.80rem',
                                    fontWeight: 800,
                                    color: '#FFFFFF',
                                    letterSpacing: '-0.01em'
                                  }}>
                                    <Calendar size={12} color={isEntrada ? '#4ADE80' : '#F87171'} />
                                    <span>{exp.date.split('-').reverse().join('/')}</span>
                                    {exactTime && (
                                      <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 3,
                                        color: '#94A3B8',
                                        fontSize: '0.72rem',
                                        fontWeight: 600,
                                        marginLeft: 2
                                      }}>
                                        <Clock size={11} color="#64748B" />
                                        <span>{exactTime}</span>
                                      </span>
                                    )}
                                  </span>

                                  <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                    padding: '2px 7px',
                                    borderRadius: 6,
                                    backgroundColor: isEntrada ? 'rgba(16, 185, 129, 0.18)' : 'rgba(239, 68, 68, 0.18)',
                                    border: `1px solid ${isEntrada ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                                  }}>
                                    <span style={{ fontSize: '0.72rem' }}>{isEntrada ? '🟢' : '🏷️'}</span>
                                    <span style={{
                                      fontSize: '0.64rem',
                                      fontWeight: 800,
                                      color: isEntrada ? '#4ADE80' : '#FCA5A5',
                                      textTransform: 'uppercase'
                                    }}>
                                      {catName}
                                    </span>
                                  </div>

                                  {exp.paymentMethod && (
                                    <span style={{
                                      fontSize: '0.62rem',
                                      fontWeight: 800,
                                      padding: '1px 5px',
                                      borderRadius: 5,
                                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                      color: exp.paymentMethod === 'pix' ? '#2DD4BF' : exp.paymentMethod === 'dinheiro' ? '#FCD34D' : '#93C5FD',
                                      textTransform: 'uppercase'
                                    }}>
                                      {exp.paymentMethod === 'pix' ? 'PIX' : exp.paymentMethod === 'dinheiro' ? 'Dinheiro' : 'Cartão'}
                                    </span>
                                  )}
                                </div>

                                <span style={{
                                  fontSize: '0.62rem',
                                  fontWeight: 800,
                                  padding: '2px 7px',
                                  borderRadius: 6,
                                  backgroundColor: isEntrada ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.18)',
                                  color: isEntrada ? '#4ADE80' : '#F87171',
                                  border: `1px solid ${isEntrada ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`
                                }}>
                                  {isEntrada ? '↑ Entrada' : '↓ Saída'}
                                </span>
                              </div>

                              {/* Linha 2: Descrição da Entrada/Despesa */}
                              <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
                                {exp.description}
                              </div>

                              {/* Linha 3: Subtítulo Operacional */}
                              <div style={{ fontSize: '0.73rem', color: '#94A3B8' }}>
                                {isEntrada ? 'Entrada operacional' : 'Saída operacional'} • Categoria: <span style={{ color: '#E2E8F0', fontWeight: 600 }}>{catName}</span>
                              </div>

                              {/* Linha 4: Valor e Botões Editar / Excluir */}
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                paddingTop: 5,
                                borderTop: '1px solid rgba(255, 255, 255, 0.07)',
                                marginTop: 2,
                                flexWrap: 'wrap',
                                gap: 6
                              }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                                  <span style={{
                                    fontSize: '1.02rem',
                                    fontWeight: 900,
                                    color: isEntrada ? '#4ADE80' : '#EF4444',
                                    letterSpacing: '-0.01em'
                                  }}>
                                    {isEntrada ? '+' : '-'} R$ {exp.amount.toFixed(2)}
                                  </span>
                                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94A3B8' }}>
                                    {isEntrada ? '(Receita direta)' : '(Custo operacional)'}
                                  </span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  {/* Editar */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditExpense(exp);
                                    }}
                                    title={isEntrada ? 'Editar entrada' : 'Editar despesa'}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 3,
                                      padding: '4px 8px',
                                      borderRadius: 7,
                                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                      color: '#E2E8F0',
                                      border: '1px solid rgba(255, 255, 255, 0.12)',
                                      fontSize: '0.68rem',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease'
                                    }}
                                  >
                                    <Edit2 size={11} />
                                    <span>Editar</span>
                                  </button>

                                  {/* Excluir */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteExpense(exp.id);
                                    }}
                                    title={isEntrada ? 'Excluir entrada' : 'Excluir despesa'}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      padding: '5px 9px',
                                      borderRadius: 8,
                                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                      color: '#F87171',
                                      border: '1px solid rgba(239, 68, 68, 0.3)',
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      transition: 'all 0.15s ease'
                                    }}
                                  >
                                    <Trash2 size={12} />
                                    <span>Excluir</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        }
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

          </div>
        )}

        {/* ================= ABA 4: CLIENTES / PASSAGEIROS ================= */}
        {activeTab === 'clientes' && (() => {
          const filteredClients = clientsList.filter(c => {
            if (!clientSearchTerm.trim()) return true;
            const term = clientSearchTerm.toLowerCase();
            const cleanSearch = getCleanWhatsappNumber(term);
            const cleanPhone = getCleanWhatsappNumber(c.phone);
            return (
              c.name.toLowerCase().includes(term) ||
              (c.email && c.email.toLowerCase().includes(term)) ||
              (cleanPhone && cleanSearch && cleanPhone.includes(cleanSearch))
            );
          });

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Cabeçalho Limpo */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                borderBottom: '1px solid #E2E8F0',
                paddingBottom: 14
              }}>
                <div>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A', margin: 0, letterSpacing: '-0.01em' }}>
                    Base de Passageiros
                  </h2>
                  <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '2px 0 0 0' }}>
                    {clientsList.length} passageiro(s) cadastrado(s) na plataforma
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setClientToEdit(null);
                    setIsClientFormOpen(true);
                  }}
                  style={{
                    height: 34,
                    padding: '0 14px',
                    borderRadius: 6,
                    border: 'none',
                    backgroundColor: '#0F172A',
                    color: '#FFFFFF',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer'
                  }}
                >
                  <Plus size={14} />
                  <span>Cadastrar Passageiro</span>
                </button>
              </div>

              {/* Tabela Corporativa de Passageiros */}
              <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                <div style={{
                  padding: '14px 18px',
                  borderBottom: '1px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12
                }}>
                  <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#0F172A' }}>
                    Diretório de Usuários
                  </div>

                  <div style={{ position: 'relative', minWidth: 260, flex: '0 1 320px' }}>
                    <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      placeholder="Buscar por nome, telefone ou e-mail..."
                      value={clientSearchTerm}
                      onChange={(e) => setClientSearchTerm(e.target.value)}
                      style={{
                        width: '100%',
                        height: 34,
                        padding: '0 12px 0 32px',
                        borderRadius: 6,
                        border: '1px solid #CBD5E1',
                        fontSize: '0.76rem',
                        color: '#0F172A',
                        backgroundColor: '#FFFFFF'
                      }}
                    />
                  </div>
                </div>

                {filteredClients.length === 0 ? (
                  <div style={{ padding: '44px 20px', textAlign: 'center', color: '#64748B', fontSize: '0.82rem' }}>
                    Nenhum passageiro encontrado.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                          <th style={{ padding: '10px 16px', fontWeight: 600 }}>Passageiro</th>
                          <th style={{ padding: '10px 14px', fontWeight: 600 }}>Telefone / Contato</th>
                          <th style={{ padding: '10px 14px', fontWeight: 600 }}>E-mail</th>
                          <th style={{ padding: '10px 14px', fontWeight: 600 }}>Corridas</th>
                          <th style={{ padding: '10px 14px', fontWeight: 600 }}>Volume Movimentado</th>
                          <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredClients.map((c) => {
                          const clientCleanPhone = getCleanWhatsappNumber(c.phone);
                          const clientRides = rides.filter(r => {
                            const rideCleanPhone = getCleanWhatsappNumber(r.clientPhone);
                            return (
                              r.clientId === c.id ||
                              (clientCleanPhone && rideCleanPhone && clientCleanPhone === rideCleanPhone) ||
                              r.clientName.trim().toLowerCase() === c.name.trim().toLowerCase()
                            );
                          });
                          const totalSpent = clientRides
                            .filter(r => r.status !== 'cancelada')
                            .reduce((acc, r) => acc + (r.totalPrice || 0), 0);

                          return (
                            <tr
                              key={c.id}
                              onClick={() => handleOpenClientDetail(c)}
                              style={{ borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}
                            >
                              <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0F172A' }}>
                                <div>{c.name}</div>
                                {c.termsSignature?.signed ? (
                                  <div
                                    title={`Código: ${c.termsSignature.validationCode} • Assinado em ${c.termsSignature.signedAtBrasilia || c.termsSignature.signedAt}`}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      marginTop: 4,
                                      padding: '2px 7px',
                                      borderRadius: 999,
                                      backgroundColor: '#DCFCE7',
                                      color: '#166534',
                                      fontSize: '0.66rem',
                                      fontWeight: 700
                                    }}
                                  >
                                    ✓ Termo Assinado • {c.termsSignature.validationCode}
                                  </div>
                                ) : c.termsAcceptedAt ? (
                                  <div
                                    style={{
                                      display: 'inline-block',
                                      marginTop: 4,
                                      padding: '2px 7px',
                                      borderRadius: 999,
                                      backgroundColor: '#FEF9C3',
                                      color: '#854D0E',
                                      fontSize: '0.66rem',
                                      fontWeight: 600
                                    }}
                                  >
                                    Aceite registrado
                                  </div>
                                ) : null}
                              </td>
                              <td style={{ padding: '12px 14px', color: '#334155' }}>
                                {c.phone}
                              </td>
                              <td style={{ padding: '12px 14px', color: '#64748B' }}>
                                {c.email || '—'}
                              </td>
                              <td style={{ padding: '12px 14px', color: '#334155', fontWeight: 500 }}>
                                {clientRides.length} viagem(ns)
                              </td>
                              <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0F172A' }}>
                                R$ {totalSpent.toFixed(2)}
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                  <button
                                    type="button"
                                    onClick={() => setTermsViewerClient(c)}
                                    title={c.termsSignature?.signed ? `Visualizar contrato assinado (${c.termsSignature.validationCode})` : 'Visualizar minuta dos Termos de Uso — Passageiro'}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      padding: '5px 9px',
                                      borderRadius: 6,
                                      border: c.termsSignature?.signed ? '1px solid #86EFAC' : '1px solid #CBD5E1',
                                      backgroundColor: c.termsSignature?.signed ? '#F0FDF4' : '#FFFFFF',
                                      color: c.termsSignature?.signed ? '#166534' : '#475569',
                                      fontSize: '0.72rem',
                                      fontWeight: 600,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <FileText size={12} />
                                    {c.termsSignature?.signed ? 'Termo Assinado' : 'Termo'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenClientDetail(c)}
                                    style={{
                                      padding: '5px 10px',
                                      borderRadius: 6,
                                      border: '1px solid #CBD5E1',
                                      backgroundColor: '#F8FAFC',
                                      color: '#0F172A',
                                      fontSize: '0.72rem',
                                      fontWeight: 600,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Ver Histórico
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleEditClient(c)}
                                    style={{
                                      padding: '5px 8px',
                                      borderRadius: 6,
                                      border: '1px solid #CBD5E1',
                                      backgroundColor: '#FFFFFF',
                                      color: '#475569',
                                      fontSize: '0.72rem',
                                      fontWeight: 600,
                                      cursor: 'pointer'
                                    }}
                                    title="Editar"
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (window.confirm(`Deseja realmente excluir o passageiro ${c.name}?`)) {
                                        handleDeleteClient(c.id);
                                      }
                                    }}
                                    style={{
                                      padding: '5px 8px',
                                      borderRadius: 6,
                                      border: '1px solid #FECACA',
                                      backgroundColor: '#FFFFFF',
                                      color: '#DC2626',
                                      fontSize: '0.72rem',
                                      fontWeight: 600,
                                      cursor: 'pointer'
                                    }}
                                    title="Excluir"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ================= ABA 5: TARIFAS & REGRAS DA PLATAFORMA ================= */}
        {activeTab === 'config' && (() => {
          const simPrice = StorageService.calculateRidePrice(
            simKm,
            simMin,
            simNight ? '23:00' : '14:00',
            currentConfig
          );

          const commissionPct = 20;
          const simCommission = Number(((simPrice.totalPrice * commissionPct) / 100).toFixed(2));
          const simDriverNet = Number((simPrice.totalPrice - simCommission).toFixed(2));

          const fleetCategories = normalizeCategoriesFromConfig(currentConfig);

          return (
            <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Cabeçalho Corporativo com Botão de Ação Direta */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                paddingBottom: 14,
                borderBottom: '1px solid #E2E8F0'
              }}>
                <div>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A', margin: 0, letterSpacing: '-0.01em' }}>
                    Tarifas, Categorias & Regras Operacionais
                  </h2>
                  <p style={{ fontSize: '0.78rem', color: '#64748B', margin: '2px 0 0 0' }}>
                    Matriz de precificação por quilometragem e tempo, multiplicadores por categoria e parâmetros centrais
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {configSaved && (
                    <span style={{
                      background: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      color: '#15803D',
                      padding: '6px 12px',
                      borderRadius: 6,
                      fontSize: '0.75rem',
                      fontWeight: 600
                    }}>
                      Configurações salvas e aplicadas
                    </span>
                  )}

                  <button
                    type="submit"
                    style={{
                      height: 36,
                      padding: '0 16px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      borderRadius: 6,
                      border: 'none',
                      backgroundColor: '#0F172A',
                      color: '#FFFFFF',
                      cursor: 'pointer'
                    }}
                  >
                    <Check size={14} />
                    <span>Salvar Alterações</span>
                  </button>
                </div>
              </div>

              {/* 4 KPIs Executivos da Matriz Tarifária */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: '16px 18px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.74rem', fontWeight: 500, color: '#64748B' }}>Tarifa Base (Bandeirada)</div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 700, color: '#0F172A', marginTop: 6 }}>
                    {formatCurrency(currentConfig.baseFare)}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 6 }}>
                    Piso mínimo por corrida: <strong style={{ color: '#0F172A' }}>{formatCurrency(currentConfig.minimumFare)}</strong>
                  </div>
                </div>

                <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: '16px 18px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.74rem', fontWeight: 500, color: '#64748B' }}>Custo Variável (KM + Minuto)</div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 700, color: '#0F172A', marginTop: 6 }}>
                    {formatCurrency(currentConfig.pricePerKm)} <span style={{ fontSize: '0.82rem', fontWeight: 500, color: '#64748B' }}>/ km</span>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 6 }}>
                    Tempo de deslocamento: <strong style={{ color: '#0F172A' }}>{formatCurrency(currentConfig.pricePerMinute)} / min</strong>
                  </div>
                </div>

                <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: '16px 18px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.74rem', fontWeight: 500, color: '#64748B' }}>Adicional Noturno (22h às 06h)</div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 700, color: '#0F172A', marginTop: 6 }}>
                    +{currentConfig.nightSurchargePercent || 0}%
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 6 }}>
                    Aplicado automaticamente em viagens noturnas
                  </div>
                </div>

                <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, padding: '16px 18px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.74rem', fontWeight: 500, color: '#64748B' }}>
                    Projeção ({simKm} km / {simMin} min • {simNight ? 'Noturno' : 'Diurno'})
                  </div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 700, color: '#15803D', marginTop: 6 }}>
                    {formatCurrency(simPrice.totalPrice)}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 6 }}>
                    Motorista (80%): <strong style={{ color: '#0F172A' }}>{formatCurrency(simDriverNet)}</strong> • Kavro: <strong style={{ color: '#15803D' }}>{formatCurrency(simCommission)}</strong>
                  </div>
                </div>
              </div>

              {/* Painel Principal em 2 Colunas: Parâmetros de Cálculo vs Simulador Contábil */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
                {/* Coluna 1: Matriz Base de Precificação */}
                <div style={{ backgroundColor: '#FFFFFF', padding: 20, borderRadius: 10, border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 16 }}>
                  <div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingBottom: 12,
                      marginBottom: 14,
                      borderBottom: '1px solid #F1F5F9'
                    }}>
                      <div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>
                          Parâmetros Base de Cobrança
                        </div>
                        <div style={{ fontSize: '0.73rem', color: '#64748B', marginTop: 2 }}>
                          Valores unitários utilizados na equação tarifária oficial da plataforma
                        </div>
                      </div>
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: 4,
                        backgroundColor: '#F1F5F9',
                        color: '#334155'
                      }}>
                        Moeda: BRL (R$)
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: '#334155', marginBottom: 5 }}>
                          Tarifa Base (Bandeirada)
                        </label>
                        <div style={{ position: 'relative' }}>
                          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.76rem', fontWeight: 600, color: '#64748B' }}>
                            R$
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={baseFareStr}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^\d.,]/g, '');
                              setIsConfigDirty(true);
                              setBaseFareStr(raw);
                              setCurrentConfig(prev => ({ ...prev, baseFare: parseCurrencyToFloat(raw) }));
                            }}
                            onBlur={() => {
                              const val = parseCurrencyToFloat(baseFareStr);
                              setBaseFareStr(formatCurrencyValue(val));
                            }}
                            style={{
                              width: '100%',
                              height: 36,
                              padding: '0 10px 0 32px',
                              borderRadius: 6,
                              border: '1px solid #CBD5E1',
                              fontSize: '0.84rem',
                              fontWeight: 600,
                              color: '#0F172A',
                              backgroundColor: '#FFFFFF'
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: '#334155', marginBottom: 5 }}>
                          Valor por Quilômetro (KM)
                        </label>
                        <div style={{ position: 'relative' }}>
                          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.76rem', fontWeight: 600, color: '#64748B' }}>
                            R$
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={pricePerKmStr}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^\d.,]/g, '');
                              setIsConfigDirty(true);
                              setPricePerKmStr(raw);
                              setCurrentConfig(prev => ({ ...prev, pricePerKm: parseCurrencyToFloat(raw) }));
                            }}
                            onBlur={() => {
                              const val = parseCurrencyToFloat(pricePerKmStr);
                              setPricePerKmStr(formatCurrencyValue(val));
                            }}
                            style={{
                              width: '100%',
                              height: 36,
                              padding: '0 10px 0 32px',
                              borderRadius: 6,
                              border: '1px solid #CBD5E1',
                              fontSize: '0.84rem',
                              fontWeight: 600,
                              color: '#0F172A',
                              backgroundColor: '#FFFFFF'
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: '#334155', marginBottom: 5 }}>
                          Valor por Minuto (Tempo)
                        </label>
                        <div style={{ position: 'relative' }}>
                          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.76rem', fontWeight: 600, color: '#64748B' }}>
                            R$
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={pricePerMinuteStr}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^\d.,]/g, '');
                              setIsConfigDirty(true);
                              setPricePerMinuteStr(raw);
                              setCurrentConfig(prev => ({ ...prev, pricePerMinute: parseCurrencyToFloat(raw) }));
                            }}
                            onBlur={() => {
                              const val = parseCurrencyToFloat(pricePerMinuteStr);
                              setPricePerMinuteStr(formatCurrencyValue(val));
                            }}
                            style={{
                              width: '100%',
                              height: 36,
                              padding: '0 10px 0 32px',
                              borderRadius: 6,
                              border: '1px solid #CBD5E1',
                              fontSize: '0.84rem',
                              fontWeight: 600,
                              color: '#0F172A',
                              backgroundColor: '#FFFFFF'
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: '#334155', marginBottom: 5 }}>
                          Tarifa Mínima (Piso)
                        </label>
                        <div style={{ position: 'relative' }}>
                          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.76rem', fontWeight: 600, color: '#64748B' }}>
                            R$
                          </span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={minimumFareStr}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^\d.,]/g, '');
                              setIsConfigDirty(true);
                              setMinimumFareStr(raw);
                              setCurrentConfig(prev => ({ ...prev, minimumFare: parseCurrencyToFloat(raw) }));
                            }}
                            onBlur={() => {
                              const val = parseCurrencyToFloat(minimumFareStr);
                              setMinimumFareStr(formatCurrencyValue(val));
                            }}
                            style={{
                              width: '100%',
                              height: 36,
                              padding: '0 10px 0 32px',
                              borderRadius: 6,
                              border: '1px solid #CBD5E1',
                              fontSize: '0.84rem',
                              fontWeight: 600,
                              color: '#0F172A',
                              backgroundColor: '#FFFFFF'
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12
                  }}>
                    <div>
                      <div style={{ fontSize: '0.76rem', fontWeight: 600, color: '#0F172A' }}>
                        Adicional Noturno Automático (22h às 06h)
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: 1 }}>
                        Acréscimo percentual aplicado sobre corridas solicitadas entre 22:00 e 05:59
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={nightSurchargeStr}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, '').slice(0, 3);
                          setIsConfigDirty(true);
                          setSetNightSurchargeStr(raw);
                          const val = Math.min(100, Math.max(0, parseInt(raw, 10) || 0));
                          setCurrentConfig(prev => ({ ...prev, nightSurchargePercent: val }));
                        }}
                        style={{
                          width: 64,
                          height: 34,
                          padding: '0 8px',
                          borderRadius: 6,
                          border: '1px solid #CBD5E1',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          textAlign: 'center',
                          color: '#0F172A',
                          backgroundColor: '#FFFFFF'
                        }}
                      />
                      <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>%</span>
                    </div>
                  </div>
                </div>

                {/* Coluna 2: Simulador Contábil de Corrida & Split */}
                <div style={{ backgroundColor: '#FFFFFF', padding: 20, borderRadius: 10, border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 14 }}>
                  <div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingBottom: 12,
                      marginBottom: 14,
                      borderBottom: '1px solid #F1F5F9',
                      flexWrap: 'wrap',
                      gap: 8
                    }}>
                      <div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>
                          Simulador de Precificação & Retenção de Split
                        </div>
                        <div style={{ fontSize: '0.73rem', color: '#64748B', marginTop: 2 }}>
                          Audite o cálculo exato cobrado do passageiro e o repasse líquido do motorista
                        </div>
                      </div>

                      <div style={{ display: 'inline-flex', borderRadius: 6, border: '1px solid #CBD5E1', overflow: 'hidden' }}>
                        <button
                          type="button"
                          onClick={() => setSimNight(false)}
                          style={{
                            padding: '5px 10px',
                            border: 'none',
                            backgroundColor: !simNight ? '#0F172A' : '#FFFFFF',
                            color: !simNight ? '#FFFFFF' : '#475569',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Diurno
                        </button>
                        <button
                          type="button"
                          onClick={() => setSimNight(true)}
                          style={{
                            padding: '5px 10px',
                            border: 'none',
                            borderLeft: '1px solid #CBD5E1',
                            backgroundColor: simNight ? '#0F172A' : '#FFFFFF',
                            color: simNight ? '#FFFFFF' : '#475569',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Noturno (+{currentConfig.nightSurchargePercent || 0}%)
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', color: '#475569', fontWeight: 600, marginBottom: 4 }}>
                          Distância Simulada (KM)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={simKmStr}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^\d.,]/g, '');
                            setSimKmStr(raw);
                            const num = parseFloat(raw.replace(',', '.'));
                            if (!isNaN(num) && num > 0) setSimKm(num);
                          }}
                          style={{
                            width: '100%',
                            height: 34,
                            padding: '0 10px',
                            border: '1px solid #CBD5E1',
                            borderRadius: 6,
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            color: '#0F172A'
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', color: '#475569', fontWeight: 600, marginBottom: 4 }}>
                          Duração Estimada (Minutos)
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={simMinStr}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, '');
                            setSimMinStr(raw);
                            const num = parseInt(raw, 10);
                            if (!isNaN(num) && num > 0) setSimMin(num);
                          }}
                          style={{
                            width: '100%',
                            height: 34,
                            padding: '0 10px',
                            border: '1px solid #CBD5E1',
                            borderRadius: 6,
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            color: '#0F172A'
                          }}
                        />
                      </div>
                    </div>

                    {/* Demonstrativo Contábil da Viagem Simulada */}
                    <div style={{
                      padding: '12px 14px',
                      borderRadius: 8,
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      fontSize: '0.76rem'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                        <span>Tarifa Base + Distância ({simKm} km) + Tempo ({simMin} min):</span>
                        <strong style={{ color: '#0F172A' }}>
                          {formatCurrency(currentConfig.baseFare + simPrice.breakdown.distanceCost + simPrice.breakdown.timeCost)}
                        </strong>
                      </div>
                      {simNight && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                          <span>Adicional Noturno (+{currentConfig.nightSurchargePercent || 0}%):</span>
                          <strong style={{ color: '#0F172A' }}>
                            +{formatCurrency(simPrice.breakdown.nightSurchargeAmount || 0)}
                          </strong>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid #E2E8F0', fontSize: '0.82rem' }}>
                        <span style={{ fontWeight: 600, color: '#0F172A' }}>Total Cobrado do Passageiro:</span>
                        <strong style={{ fontWeight: 700, color: '#0F172A' }}>{formatCurrency(simPrice.totalPrice)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803D' }}>
                        <span>Taxa Retida Kavro Drive ({commissionPct}%):</span>
                        <strong>{formatCurrency(simCommission)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#334155' }}>
                        <span>Repasse Líquido do Motorista (80%):</span>
                        <strong>{formatCurrency(simDriverNet)}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabela Corporativa de Categorias da Frota & Multiplicadores */}
              <div style={{ backgroundColor: '#FFFFFF', borderRadius: 10, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                <div style={{
                  padding: '14px 18px',
                  borderBottom: '1px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 10
                }}>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>
                      Categorias de Corridas KAVRO DRIVE & Multiplicadores Tarifários
                    </div>
                    <div style={{ fontSize: '0.73rem', color: '#64748B', marginTop: 2 }}>
                      Resumo das modalidades configuradas na plataforma (KAVRO GO, KAVRO PLUS, KAVRO EXEC)
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('categorias')}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      border: '1px solid #0F172A',
                      backgroundColor: '#0F172A',
                      color: '#76D800',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Configurar Categorias & Elegibilidade ➔
                  </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        <th style={{ padding: '10px 16px', fontWeight: 600 }}>Categoria</th>
                        <th style={{ padding: '10px 14px', fontWeight: 600 }}>Multiplicador</th>
                        <th style={{ padding: '10px 14px', fontWeight: 600 }}>Tarifa Base</th>
                        <th style={{ padding: '10px 14px', fontWeight: 600 }}>Preço / KM</th>
                        <th style={{ padding: '10px 14px', fontWeight: 600 }}>Preço / Min</th>
                        <th style={{ padding: '10px 14px', fontWeight: 600 }}>Piso Mínimo</th>
                        <th style={{ padding: '10px 14px', fontWeight: 600 }}>Comissão KAVRO</th>
                        <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fleetCategories.map(cat => {
                        const m = cat.multiplier;
                        return (
                          <tr key={cat.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ fontWeight: 700, color: '#0F172A' }}>{cat.name}</div>
                              <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: 1 }}>{cat.description}</div>
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: 4,
                                backgroundColor: '#F1F5F9',
                                color: '#0F172A',
                                fontWeight: 600,
                                fontSize: '0.72rem'
                              }}>
                                {m.toFixed(2)}x
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px', color: '#334155', fontWeight: 500 }}>
                              {formatCurrency(cat.baseFare)}
                            </td>
                            <td style={{ padding: '12px 14px', color: '#334155', fontWeight: 500 }}>
                              {formatCurrency(cat.pricePerKm)}
                            </td>
                            <td style={{ padding: '12px 14px', color: '#334155', fontWeight: 500 }}>
                              {formatCurrency(cat.pricePerMinute)}
                            </td>
                            <td style={{ padding: '12px 14px', color: '#334155', fontWeight: 500 }}>
                              {formatCurrency(cat.minimumFare)}
                            </td>
                            <td style={{ padding: '12px 14px', fontWeight: 700, color: '#15803D' }}>
                              {cat.commissionPercent}%
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: 4,
                                backgroundColor: cat.active ? '#DCFCE7' : '#FEE2E2',
                                color: cat.active ? '#15803D' : '#DC2626',
                                fontWeight: 600,
                                fontSize: '0.68rem'
                              }}>
                                {cat.active ? 'Ativa' : 'Inativa'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Canais Oficiais da Central Master & Recebimento PIX */}
              <div style={{ backgroundColor: '#FFFFFF', padding: 20, borderRadius: 10, border: '1px solid #E2E8F0' }}>
                <div style={{
                  paddingBottom: 12,
                  marginBottom: 14,
                  borderBottom: '1px solid #F1F5F9'
                }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>
                    Canais Oficiais da Central Master & Liquidação PIX
                  </div>
                  <div style={{ fontSize: '0.73rem', color: '#64748B', marginTop: 2 }}>
                    Dados institucionais utilizados no suporte ao passageiro, SOS e recebimento centralizado
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: '#334155', marginBottom: 5 }}>
                      WhatsApp Oficial da Central de Operações
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      placeholder="(48) 99999-9999"
                      value={whatsappStr}
                      onChange={(e) => {
                        const formatted = formatPhone(e.target.value);
                        setIsConfigDirty(true);
                        setWhatsappStr(formatted);
                        setCurrentConfig(prev => ({ ...prev, companyWhatsapp: formatted }));
                      }}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 12px',
                        borderRadius: 6,
                        border: '1px solid #CBD5E1',
                        fontSize: '0.82rem',
                        color: '#0F172A',
                        backgroundColor: '#FFFFFF'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: '#334155', marginBottom: 5 }}>
                      Chave PIX Recebedora Master (Conta Central)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: financeiro@kavrodrive.com.br ou CNPJ"
                      value={currentConfig.pixKey}
                      onChange={(e) => {
                        setIsConfigDirty(true);
                        setCurrentConfig({ ...currentConfig, pixKey: e.target.value });
                      }}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 12px',
                        borderRadius: 6,
                        border: '1px solid #CBD5E1',
                        fontSize: '0.82rem',
                        color: '#0F172A',
                        backgroundColor: '#FFFFFF'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, color: '#334155', marginBottom: 5 }}>
                      Regra de Confirmação Pré-Paga (Gateway PIX)
                    </label>
                    <div style={{
                      height: 36,
                      padding: '0 12px',
                      borderRadius: 6,
                      border: '1px solid #E2E8F0',
                      backgroundColor: '#F8FAFC',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.76rem',
                      color: '#334155'
                    }}>
                      <span>Exigir confirmação Webhook antes do despacho</span>
                      <span style={{ fontWeight: 700, color: '#15803D' }}>Ativo</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modelos de Notificação Push */}
              <PushTemplatesEditor
                value={currentConfig.pushTemplates}
                onChange={(next) => {
                  setIsConfigDirty(true);
                  setCurrentConfig(prev => ({ ...prev, pushTemplates: next }));
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  style={{
                    height: 38,
                    padding: '0 22px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    borderRadius: 6,
                    border: 'none',
                    backgroundColor: '#0F172A',
                    color: '#FFFFFF',
                    cursor: 'pointer'
                  }}
                >
                  <Check size={15} />
                  <span>Salvar Tarifas e Configurações</span>
                </button>
              </div>
            </form>
          );
        })()}

        {/* ================= ABA 6: PERFIL DO MOTORISTA & AUDITORIA PÚBLICA ================= */}
        {activeTab === 'perfil' && (
          <AdminDriverProfileTab
            config={currentConfig}
            rides={rides}
            onSaved={(newCfg) => {
              setCurrentConfig(newCfg);
              onRefreshData();
            }}
          />
        )}

      </main>
      </div>

      {/* BARRA DE RODAPÉ FIXA PARA MOBILE COM ATALHOS RÁPIDOS */}
      <nav className="admin-bottom-nav">
        {/* 1. Corridas / Dashboard */}
        <button
          type="button"
          onClick={() => setActiveTab('corridas')}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            color: activeTab === 'corridas' ? '#76D800' : '#94A3B8',
            cursor: 'pointer',
            padding: '4px 2px',
            position: 'relative'
          }}
        >
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 22 }}>
            <LayoutDashboard size={20} strokeWidth={activeTab === 'corridas' ? 2.5 : 2} />
            {pendingRides.length > 0 && (
              <span style={{
                position: 'absolute',
                top: -5,
                right: -9,
                backgroundColor: '#F59E0B',
                color: '#121A21',
                borderRadius: '50%',
                width: 16,
                height: 16,
                fontSize: '0.62rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1.5px solid #121A21'
              }}>
                {pendingRides.length}
              </span>
            )}
          </div>
          <span style={{ fontSize: '0.66rem', lineHeight: 1.1, fontWeight: activeTab === 'corridas' ? 800 : 600 }}>
            Corridas
          </span>
        </button>

        {/* 2. Motoristas & Plataforma */}
        <button
          type="button"
          onClick={() => setActiveTab('plataforma')}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            color: activeTab === 'plataforma' ? '#76D800' : '#94A3B8',
            cursor: 'pointer',
            padding: '4px 2px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 22 }}>
            <Car size={20} strokeWidth={activeTab === 'plataforma' ? 2.5 : 2} />
          </div>
          <span style={{ fontSize: '0.66rem', lineHeight: 1.1, fontWeight: activeTab === 'plataforma' ? 800 : 600 }}>
            Motoristas
          </span>
        </button>

        {/* 3. Botão Central em Destaque (Central SOS Ao Vivo) */}
        <button
          type="button"
          onClick={() => setActiveTab('sos')}
          title="Central SOS (Tempo Real)"
          style={{
            flex: 1,
            minWidth: 0,
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: '0 2px',
            marginTop: -20
          }}
        >
          <div style={{
            width: 46,
            height: 46,
            borderRadius: '50%',
            backgroundColor: activeTab === 'sos' || activeSosAlertsCount > 0 ? '#DC2626' : '#1E293B',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: activeSosAlertsCount > 0 ? '0 4px 14px rgba(220, 38, 38, 0.55)' : '0 4px 14px rgba(0, 0, 0, 0.35)',
            border: activeTab === 'sos' ? '3px solid #FCA5A5' : '3px solid #121A21',
            transition: 'transform 0.15s ease'
          }}>
            <ShieldAlert size={22} strokeWidth={2.5} color={activeTab === 'sos' || activeSosAlertsCount > 0 ? '#FFFFFF' : '#F87171'} />
          </div>
          <span style={{ fontSize: '0.66rem', lineHeight: 1.1, fontWeight: 800, color: activeTab === 'sos' || activeSosAlertsCount > 0 ? '#F87171' : '#94A3B8', marginTop: 3 }}>
            SOS
          </span>
        </button>

        {/* 4. Rotas Gravadas (Auditoria GPS) */}
        <button
          type="button"
          onClick={() => setActiveTab('rotas')}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            color: activeTab === 'rotas' ? '#76D800' : '#94A3B8',
            cursor: 'pointer',
            padding: '4px 2px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 22 }}>
            <Route size={20} strokeWidth={activeTab === 'rotas' ? 2.5 : 2} />
          </div>
          <span style={{ fontSize: '0.64rem', lineHeight: 1.1, fontWeight: activeTab === 'rotas' ? 800 : 600 }}>
            Rotas
          </span>
        </button>

        {/* 5. Financeiro */}
        <button
          type="button"
          onClick={() => setActiveTab('financeiro')}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            color: activeTab === 'financeiro' ? '#76D800' : '#94A3B8',
            cursor: 'pointer',
            padding: '4px 2px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 22 }}>
            <DollarSign size={20} strokeWidth={activeTab === 'financeiro' ? 2.5 : 2} />
          </div>
          <span style={{ fontSize: '0.66rem', lineHeight: 1.1, fontWeight: activeTab === 'financeiro' ? 800 : 600 }}>
            Financeiro
          </span>
        </button>

        {/* 6. Menu Lateral (Abrir Barra Lateral) */}
        <button
          type="button"
          onClick={() => setIsSidebarOpen(true)}
          style={{
            flex: 1,
            minWidth: 0,
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            color: isSidebarOpen ? '#76D800' : '#94A3B8',
            cursor: 'pointer',
            padding: '4px 2px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 22 }}>
            <Menu size={20} />
          </div>
          <span style={{ fontSize: '0.66rem', lineHeight: 1.1, fontWeight: 600 }}>
            Menu
          </span>
        </button>
      </nav>

      {/* Modal Exclusivo Admin de Auditoria GPS e Laudo de Prova vinculado ao ID #UP - 001 */}
      {auditPlaybackRide && (
        <RideRoutePlaybackModal
          ride={auditPlaybackRide}
          isOpen={Boolean(auditPlaybackRide)}
          onClose={() => setAuditPlaybackRide(null)}
          config={config}
        />
      )}

      {/* Central de Emergência SOS do Motorista */}
      <SosEmergencyModal
        isOpen={isSosOpen}
        onClose={() => setIsSosOpen(false)}
        currentLocationText="Lauro Müller e Região - Base Operacional Kavro Drive"
      />

      {/* Central de Notificações do Motorista */}
      <NotificationsModal
        isOpen={isNotificationsModalOpen}
        onClose={() => setIsNotificationsModalOpen(false)}
        userRole="admin"
        onSelectRide={(rId) => {
          const found = rides.find(r => r.id === rId);
          if (found) setSelectedRideDetail(found);
        }}
      />
    </div>
  );
};
