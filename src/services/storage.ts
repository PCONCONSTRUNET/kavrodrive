import {
  Ride,
  SystemConfig,
  Expense,
  ClientProfile,
  NotificationItem,
  LocationPoint,
  DriverProfile,
  DriverVehicle,
  DriverWalletSummary,
  SavedCard,
  PaymentTransaction,
  WithdrawalRequest,
  FinancialLedgerEntry,
  RideChatMessage
} from '../types';
import { formatRideCode, getNextSequentialRideId } from '../utils/format';
import {
  DEFAULT_RIDE_CATEGORIES,
  normalizeCategoriesFromConfig,
  getCategoryById,
  getEffectiveCategoryPricing
} from '../utils/categoryEngine';

const STORAGE_KEYS = {
  RIDES: 'up_mobilidade_rides',
  CLIENTS: 'up_mobilidade_clients',
  DRIVERS: 'up_mobilidade_drivers',
  CURRENT_DRIVER: 'up_mobilidade_current_driver',
  EXPENSES: 'up_mobilidade_expenses',
  CONFIG: 'up_mobilidade_config',
  NOTIFICATIONS: 'up_mobilidade_notifications',
  CURRENT_USER: 'up_mobilidade_current_user',
  ADMIN_AUTH: 'up_mobilidade_admin_auth',
  RECENT_DESTINATIONS: 'up_mobilidade_recent_destinations',
};

export const DEFAULT_CONFIG: SystemConfig = {
  companyName: 'Kavro Drive',
  companyPhone: '(48) 99691-5303',
  companyWhatsapp: '5548996915303',
  companyEmail: 'contato@upmobilidade.com.br',
  driverName: 'Alisson Santos',
  driverPhoto: '',
  driverPhone: '(48) 99691-5303',
  driverVehicle: 'Toyota Corolla XEi 2.0',
  driverPlate: 'QXZ4G21',
  driverCarBrand: 'Toyota',
  driverCarModel: 'Corolla XEi 2.0',
  driverCarColor: 'Prata',
  driverCarYear: '2024',
  driverCarCategory: 'Sedan Executivo',
  driverCarPhoto: '',
  driverCarCity: 'Lauro Müller/SC',
  driverBio: 'Plataforma de mobilidade urbana sob demanda com motoristas verificados e rastreamento em tempo real.',
  baseFare: 8.0,
  pricePerKm: 3.2,
  pricePerMinute: 0.5,
  minimumFare: 15.0,
  nightSurchargePercent: 20,
  nightStartHour: 22,
  nightEndHour: 6,
  advanceNoticeHours: 0,
  bufferBetweenRidesMin: 0,
  platformCommissionPercent: 20,
  maxDriverDebtLimit: 100.0,
  autoBlockDelinquentDrivers: true,
  minWithdrawalAmount: 20.0,
  autoSplitPixEnabled: true,
  cardSettlementDays: 0,
  activePaymentMethods: ['pix', 'cartao_credito', 'cartao_debito', 'dinheiro'],
  rideCategories: DEFAULT_RIDE_CATEGORIES,
  serviceCategories: DEFAULT_RIDE_CATEGORIES,
  pixKey: 'contato@upmobilidade.com.br',
  pixType: 'email',
  pixBeneficiary: 'Kavro Drive Plataforma',
  whatsappAutomations: {
    notifyNewBooking: true,
    notifyConfirmation: true,
    notifyOnTheWay: true,
    notifyCompleted: true,
  },
  operatingHours: {
    start: '00:00',
    end: '23:59',
    daysOpen: [0, 1, 2, 3, 4, 5, 6],
  },
};

let lastConfigSaveTimestamp = 0;

export const StorageService = {
  async syncFromDatabase(): Promise<boolean> {
    try {
      await this.flushPendingDeletes();
      const isAdmin = this.isAdminAuthenticated();
      const currentUser = this.getCurrentUser();
      const currentDriver = this.getCurrentDriver();
      const params = new URLSearchParams({ _t: String(Date.now()) });
      if (currentUser?.id) params.set('clientId', currentUser.id);
      if (currentUser?.phone) params.set('clientPhone', currentUser.phone);
      if (currentDriver?.id) params.set('driverId', currentDriver.id);

      const headers: Record<string, string> = this.getAuthHeaders();
      if (currentUser?.id) headers['x-client-id'] = currentUser.id;
      if (currentUser?.phone) headers['x-client-phone'] = currentUser.phone;
      if (currentDriver?.id) headers['x-driver-id'] = currentDriver.id;

      const res = await fetch(`/api/sync?${params.toString()}`, {
        cache: 'no-store',
        headers
      });
      if (!res.ok) return false;
      const data = await res.json();
      const pending = this.getPendingDeletes();
      const notPending = (kind: string) => (item: { id: string }) =>
        !pending.some(p => p.kind === kind && p.id === item.id);

      if (data.config && Date.now() - lastConfigSaveTimestamp > 8000) {
        localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(data.config));
      }
      if (Array.isArray(data.rides)) {
        const filteredRides = data.rides.filter(notPending('rides'));
        const oldRides = localStorage.getItem(STORAGE_KEYS.RIDES) || '[]';
        const newRidesStr = JSON.stringify(filteredRides);
        if (oldRides !== newRidesStr) {
          localStorage.setItem(STORAGE_KEYS.RIDES, newRidesStr);
          window.dispatchEvent(new CustomEvent('up_rides_updated'));
        }
      }
      if (Array.isArray(data.drivers)) {
        localStorage.setItem(STORAGE_KEYS.DRIVERS, JSON.stringify(data.drivers));
        if (currentDriver) {
          const updatedSelf = data.drivers.find((d: DriverProfile) => d.id === currentDriver.id);
          if (updatedSelf) {
            this.setCurrentDriver({ ...currentDriver, ...updatedSelf });
          }
        }
      } else if (Array.isArray(data.onlineDrivers)) {
        localStorage.setItem('up_online_drivers', JSON.stringify(data.onlineDrivers));
      }
      if (typeof data.onlineDriversCount === 'number') {
        localStorage.setItem('up_online_drivers_count', String(data.onlineDriversCount));
      }

      if (isAdmin && Array.isArray(data.expenses)) {
        localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(data.expenses.filter(notPending('expenses'))));
      } else if (!isAdmin) {
        localStorage.removeItem(STORAGE_KEYS.EXPENSES);
      }
      if (isAdmin && Array.isArray(data.clients)) {
        localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(data.clients.filter(notPending('clients'))));
      } else if (!isAdmin) {
        localStorage.removeItem(STORAGE_KEYS.CLIENTS);
        if (Array.isArray(data.clients) && data.clients[0] && currentUser && data.clients[0].id === currentUser.id) {
          this.setCurrentUser({ ...currentUser, ...data.clients[0] });
        }
      }
      if (isAdmin && Array.isArray(data.notifications)) {
        localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(data.notifications));
        window.dispatchEvent(new CustomEvent('up_notifications_updated'));
      }
      if (data.blockedSlots) {
        localStorage.setItem('up_blocked_slots', JSON.stringify(data.blockedSlots));
      }
      window.dispatchEvent(new CustomEvent('up_database_synced'));
      return true;
    } catch {
      return false;
    }
  },

  getRides(): Ride[] {
    const data = localStorage.getItem(STORAGE_KEYS.RIDES);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  getNextRideId(): string {
    return getNextSequentialRideId(this.getRides());
  },

  // Solicitação de corrida sob demanda (Uber style) com retorno da resposta do gateway (Pix / Cartão / Dinheiro)
  async requestRideOnDemand(ridePayload: Partial<Ride>): Promise<{
    ok: boolean;
    ride?: Ride;
    error?: string;
    paymentStatus?: string;
  }> {
    try {
      const res = await fetch('/api/rides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
        body: JSON.stringify(ridePayload)
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return {
          ok: false,
          error: data.error || 'Não foi possível solicitar a corrida.',
          paymentStatus: data.paymentStatus
        };
      }
      const savedRide: Ride = data.ride;
      const rides = this.getRides();
      const idx = rides.findIndex(r => r.id === savedRide.id);
      if (idx >= 0) rides[idx] = savedRide;
      else rides.unshift(savedRide);
      localStorage.setItem(STORAGE_KEYS.RIDES, JSON.stringify(rides));
      window.dispatchEvent(new CustomEvent('up_rides_updated', { detail: { rideId: savedRide.id } }));
      return { ok: true, ride: savedRide };
    } catch {
      return { ok: false, error: 'Erro de conexão ao solicitar corrida.' };
    }
  },

  saveRide(ride: Ride): void {
    const rides = this.getRides();
    const index = rides.findIndex(r => r.id === ride.id);
    const num = ride.rideNumber || parseInt(String(ride.id || '').replace(/\D/g, ''), 10) || 1;
    const toSave: Ride = {
      ...ride,
      rideNumber: num,
      rideCode: formatRideCode({ id: ride.id, rideNumber: num, rideCode: ride.rideCode }),
      updatedAt: new Date().toISOString(),
      createdAt: ride.createdAt || new Date().toISOString()
    };
    if (index >= 0) {
      rides[index] = toSave;
    } else {
      rides.unshift(toSave);
    }
    localStorage.setItem(STORAGE_KEYS.RIDES, JSON.stringify(rides));
    window.dispatchEvent(new CustomEvent('up_rides_updated', { detail: { rideId: toSave.id } }));

    fetch('/api/rides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
      body: JSON.stringify(toSave)
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.ok && data.ride) {
          const current = this.getRides();
          const idx = current.findIndex(r => r.id === toSave.id || r.id === data.ride.id);
          if (idx >= 0) {
            current[idx] = { ...current[idx], ...data.ride };
            localStorage.setItem(STORAGE_KEYS.RIDES, JSON.stringify(current));
            window.dispatchEvent(new CustomEvent('up_rides_updated', { detail: { rideId: data.ride.id } }));
          }
        }
      })
      .catch(err => console.warn('Ride sync error:', err));
  },

  // Aceitar corrida (com suporte automático a Fila de Próxima Corrida)
  async acceptRide(rideId: string, driverId: string): Promise<{
    ok: boolean;
    ride?: Ride;
    isQueued?: boolean;
    activeRideId?: string | null;
    error?: string;
  }> {
    try {
      const res = await fetch(`/api/rides/${encodeURIComponent(rideId)}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
        body: JSON.stringify({ driverId })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || 'Erro ao aceitar corrida.' };
      }
      await this.syncFromDatabase();
      return {
        ok: true,
        ride: data.ride,
        isQueued: data.isQueued,
        activeRideId: data.activeRideId
      };
    } catch {
      return { ok: false, error: 'Erro de conexão ao aceitar corrida.' };
    }
  },

  async declineRide(rideId: string, driverId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/rides/${encodeURIComponent(rideId)}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
        body: JSON.stringify({ driverId })
      });
      await this.syncFromDatabase();
      return res.ok;
    } catch {
      return false;
    }
  },

  async completeRide(
    rideId: string,
    payload: {
      driverId?: string;
      finalAmount?: number;
      receivedCashAmount?: number;
      cashResolution?: 'confirmado' | 'parcialmente_pago' | 'pendente';
    }
  ): Promise<{
    ok: boolean;
    ride?: Ride;
    promotedNextRide?: Ride | null;
    wallet?: DriverWalletSummary;
    error?: string;
  }> {
    try {
      const res = await fetch(`/api/rides/${encodeURIComponent(rideId)}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || 'Erro ao finalizar corrida.' };
      }
      await this.syncFromDatabase();
      return data;
    } catch {
      return { ok: false, error: 'Erro de conexão ao finalizar corrida.' };
    }
  },

  // Simular ou processar Webhook do Gateway (para testar PIX no ambiente de desenvolvimento)
  async triggerGatewayWebhook(payload: {
    event?: 'payment.confirmed' | 'debt.confirmed';
    rideId?: string;
    driverId?: string;
    amount?: number;
    gatewayTxId?: string;
  }): Promise<{ ok: boolean; ride?: Ride; wallet?: DriverWalletSummary; error?: string }> {
    try {
      const res = await fetch('/api/payments/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      await this.syncFromDatabase();
      return data;
    } catch {
      return { ok: false, error: 'Falha ao comunicar com webhook.' };
    }
  },

  // Cartões Salvos do Passageiro (Tokenizados)
  async getSavedCards(clientId?: string, clientPhone?: string): Promise<SavedCard[]> {
    try {
      const params = new URLSearchParams();
      if (clientId) params.set('clientId', clientId);
      if (clientPhone) params.set('clientPhone', clientPhone);
      const res = await fetch(`/api/payments/cards?${params.toString()}`, {
        cache: 'no-store',
        headers: this.getAuthHeaders()
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.cards || [];
    } catch {
      return [];
    }
  },

  async fetchPaymentsConfig(): Promise<{
    mercadopagoEnabled: boolean;
    mercadopagoPublicKey: string;
    autoPixPayoutEnabled: boolean;
  }> {
    try {
      const res = await fetch('/api/payments/config', { cache: 'no-store' });
      if (res.ok) {
        const d = await res.json();
        return {
          mercadopagoEnabled: Boolean(d.mercadopagoEnabled),
          mercadopagoPublicKey: String(d.mercadopagoPublicKey || '').trim(),
          autoPixPayoutEnabled: Boolean(d.autoPixPayoutEnabled)
        };
      }
    } catch {}
    return {
      mercadopagoEnabled: false,
      mercadopagoPublicKey: String(import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY || '').trim(),
      autoPixPayoutEnabled: false
    };
  },

  async saveTokenizedCard(payload: {
    clientId?: string;
    clientPhone?: string;
    cardNumber: string;
    holderName: string;
    expMonth: string;
    expYear: string;
    cvv: string;
    cardType: 'cartao_credito' | 'cartao_debito';
    mpCardToken?: string;
    holderDocument?: string;
  }): Promise<{ ok: boolean; card?: SavedCard; error?: string }> {
    try {
      const res = await fetch('/api/payments/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch {
      return { ok: false, error: 'Erro ao cadastrar cartão.' };
    }
  },

  // ============================================================
  // MOTORISTAS (CADASTRO, LOGIN, ONLINE/OFFLINE, CARTEIRA)
  // ============================================================
  getDriverToken(): string {
    return localStorage.getItem('up_driver_token') || '';
  },

  setDriverToken(token: string | null): void {
    if (token && token.startsWith('kavro_drv.')) {
      localStorage.setItem('up_driver_token', token);
    } else {
      localStorage.removeItem('up_driver_token');
    }
  },

  getClientToken(): string {
    return localStorage.getItem('up_client_token') || '';
  },

  setClientToken(token: string | null): void {
    if (token && token.startsWith('kavro_cli.')) {
      localStorage.setItem('up_client_token', token);
    } else {
      localStorage.removeItem('up_client_token');
    }
  },

  getAuthHeaders(): Record<string, string> {
    const h: Record<string, string> = {};
    const adminPin = this.getAdminPin();
    const drvTok = this.getDriverToken();
    const cliTok = this.getClientToken();
    if (adminPin) h['x-admin-pin'] = adminPin;
    if (drvTok) h['x-driver-token'] = drvTok;
    if (cliTok) h['x-client-token'] = cliTok;
    return h;
  },

  getCurrentDriver(): DriverProfile | null {
    const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_DRIVER);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  setCurrentDriver(driver: DriverProfile | null): void {
    if (!driver) {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_DRIVER);
      this.setDriverToken(null);
    } else {
      localStorage.setItem(STORAGE_KEYS.CURRENT_DRIVER, JSON.stringify(driver));
    }
  },

  async fetchDriverSelf(driverId: string): Promise<{ driver?: DriverProfile; wallet?: DriverWalletSummary } | null> {
    try {
      const res = await fetch(`/api/drivers/${encodeURIComponent(driverId)}?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: this.getAuthHeaders()
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.ok ? { driver: data.driver, wallet: data.wallet } : null;
    } catch {
      return null;
    }
  },

  getDrivers(): DriverProfile[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.DRIVERS) || '[]');
    } catch {
      return [];
    }
  },

  getOnlineDrivers(): DriverProfile[] {
    try {
      const allDrivers = this.getDrivers();
      if (allDrivers.length > 0) {
        return allDrivers.filter(d => d.approvalStatus === 'aprovado' && d.isOnline);
      }
      const pubOnline = JSON.parse(localStorage.getItem('up_online_drivers') || '[]');
      return Array.isArray(pubOnline) ? pubOnline : [];
    } catch {
      return [];
    }
  },

  getOnlineDriversCount(): number {
    const online = this.getOnlineDrivers();
    if (online.length > 0) return online.length;
    const count = Number(localStorage.getItem('up_online_drivers_count') || 0);
    return count >= 0 ? count : 0;
  },

  async fetchDriversList(): Promise<DriverProfile[]> {
    try {
      const res = await fetch('/api/drivers', {
        cache: 'no-store',
        headers: this.getAuthHeaders()
      });
      if (!res.ok) return this.getDrivers();
      const data = await res.json();
      if (Array.isArray(data.drivers)) {
        localStorage.setItem(STORAGE_KEYS.DRIVERS, JSON.stringify(data.drivers));
        return data.drivers;
      }
      return this.getDrivers();
    } catch {
      return this.getDrivers();
    }
  },

  async registerDriver(payload: Partial<DriverProfile> & {
    password: string;
    turnstileToken?: string;
    termsAcceptance?: {
      accepted: boolean;
      contractId: string;
      contractVersion: string;
      acceptedAtClient: string;
      affirmativeText: string;
      language?: string;
      timezone?: string;
    };
  }): Promise<{
    ok: boolean;
    driver?: DriverProfile;
    error?: string;
  }> {
    try {
      const res = await fetch('/api/drivers/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || 'Erro ao cadastrar motorista.' };
      }
      if (data.driverToken) {
        this.setDriverToken(data.driverToken);
      }
      this.setCurrentDriver(data.driver);
      return { ok: true, driver: data.driver };
    } catch {
      return { ok: false, error: 'Erro de conexão com o servidor.' };
    }
  },

  async checkDriverByIdentifier(identifier: string): Promise<{
    ok: boolean;
    found?: boolean;
    driver?: Partial<DriverProfile> & { firstName?: string };
    error?: string;
  }> {
    try {
      const res = await fetch('/api/drivers/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier })
      });
      return await res.json();
    } catch {
      return { ok: false, error: 'Erro de conexão com o servidor.' };
    }
  },

  async loginDriver(identifier: string, password: string, turnstileToken?: string): Promise<{
    ok: boolean;
    driver?: DriverProfile;
    wallet?: DriverWalletSummary;
    error?: string;
  }> {
    try {
      const res = await fetch('/api/drivers/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, turnstileToken })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || 'Credenciais inválidas.' };
      }
      if (data.driverToken) {
        this.setDriverToken(data.driverToken);
      }
      this.setCurrentDriver(data.driver);
      return data;
    } catch {
      return { ok: false, error: 'Erro de conexão com o servidor.' };
    }
  },

  async toggleDriverOnline(
    driverId: string,
    isOnline: boolean,
    location?: { lat: number; lng: number }
  ): Promise<{ ok: boolean; driver?: DriverProfile; error?: string }> {
    try {
      const res = await fetch(`/api/drivers/${encodeURIComponent(driverId)}/online`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
        body: JSON.stringify({ isOnline, location })
      });
      const data = await res.json();
      if (data?.driver) {
        this.setCurrentDriver(data.driver);
      }
      return data;
    } catch {
      return { ok: false, error: 'Erro de rede ao alterar status Online/Offline.' };
    }
  },

  async updateDriverProfile(driverId: string, updates: Partial<DriverProfile>): Promise<{ ok: boolean; driver?: DriverProfile; error?: string }> {
    try {
      const res = await fetch(`/api/drivers/${encodeURIComponent(driverId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (data?.driver) {
        this.setCurrentDriver(data.driver);
      }
      return data;
    } catch {
      return { ok: false };
    }
  },

  async requestDriverProfileChange(
    driverId: string,
    fields: { name?: string; phone?: string; email?: string; city?: string }
  ): Promise<{ ok: boolean; driver?: DriverProfile; error?: string }> {
    try {
      const res = await fetch(`/api/drivers/${encodeURIComponent(driverId)}/profile-change-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
        body: JSON.stringify(fields)
      });
      const data = await res.json();
      if (data?.driver) {
        this.setCurrentDriver(data.driver);
      }
      return data;
    } catch {
      return { ok: false, error: 'Erro de conexão ao enviar solicitação de alteração.' };
    }
  },

  async registerDriverVehicle(
    driverId: string,
    payload: {
      brand: string;
      model: string;
      version?: string;
      color: string;
      year: string;
      plate: string;
      vehiclePhoto?: string;
      crlvNumber: string;
      crlvDocumentPhoto: string;
      hasFourDoors: boolean;
      hasAirConditioning: boolean;
      hasLargeTrunk?: boolean;
      hasLeatherSeats?: boolean;
    }
  ): Promise<{ ok: boolean; driver?: DriverProfile; vehicle?: DriverVehicle; error?: string }> {
    try {
      const res = await fetch(`/api/drivers/${encodeURIComponent(driverId)}/vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data?.driver) {
        this.setCurrentDriver(data.driver);
      }
      return data;
    } catch {
      return { ok: false, error: 'Erro de conexão ao registrar veículo.' };
    }
  },

  async selectDriverActiveVehicle(
    driverId: string,
    vehicleId: string
  ): Promise<{ ok: boolean; driver?: DriverProfile; error?: string }> {
    try {
      const res = await fetch(
        `/api/drivers/${encodeURIComponent(driverId)}/vehicles/${encodeURIComponent(vehicleId)}/select`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
          body: JSON.stringify({})
        }
      );
      const data = await res.json();
      if (data?.driver) {
        this.setCurrentDriver(data.driver);
      }
      return data;
    } catch {
      return { ok: false, error: 'Erro de conexão ao selecionar veículo ativo.' };
    }
  },

  async deleteDriverVehicle(
    driverId: string,
    vehicleId: string
  ): Promise<{ ok: boolean; driver?: DriverProfile; error?: string }> {
    try {
      const res = await fetch(
        `/api/drivers/${encodeURIComponent(driverId)}/vehicles/${encodeURIComponent(vehicleId)}`,
        {
          method: 'DELETE',
          headers: { ...this.getAuthHeaders() }
        }
      );
      const data = await res.json();
      if (data?.driver) {
        this.setCurrentDriver(data.driver);
      }
      return data;
    } catch {
      return { ok: false, error: 'Erro de conexão ao remover veículo.' };
    }
  },

  async reviewDriverVehicleAdmin(
    driverId: string,
    vehicleId: string,
    decision: 'aprovar' | 'recusar',
    reasonOrOptions?:
      | string
      | {
          rejectionReason?: string;
          reviewedBy?: string;
          checklist?: Record<string, boolean>;
          correctedFields?: {
            brand?: string;
            model?: string;
            version?: string;
            color?: string;
            year?: string;
            plate?: string;
            crlvNumber?: string;
          };
        }
  ): Promise<{ ok: boolean; driver?: DriverProfile; error?: string }> {
    try {
      const payload =
        typeof reasonOrOptions === 'string'
          ? { decision, rejectionReason: reasonOrOptions }
          : { decision, ...(reasonOrOptions || {}) };
      const res = await fetch(
        `/api/admin/drivers/${encodeURIComponent(driverId)}/vehicles/${encodeURIComponent(vehicleId)}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
          body: JSON.stringify(payload)
        }
      );
      return await res.json();
    } catch {
      return { ok: false, error: 'Erro de conexão ao analisar veículo.' };
    }
  },

  async fetchDriverWallet(driverId: string): Promise<DriverWalletSummary | null> {
    try {
      const res = await fetch(`/api/drivers/${encodeURIComponent(driverId)}/wallet?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: this.getAuthHeaders()
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.wallet || null;
    } catch {
      return null;
    }
  },

  async requestDriverWithdrawal(
    driverId: string,
    payload: { amount: number; pixKey?: string; pixType?: string }
  ): Promise<{ ok: boolean; wallet?: DriverWalletSummary; error?: string }> {
    try {
      const res = await fetch(`/api/drivers/${encodeURIComponent(driverId)}/withdrawals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch {
      return { ok: false, error: 'Erro de conexão ao solicitar saque.' };
    }
  },

  async createDriverDebtPix(driverId: string, amount?: number): Promise<{
    ok: boolean;
    amount?: number;
    txid?: string;
    pixCopyPaste?: string;
    pixQrCode?: string;
    error?: string;
  }> {
    try {
      const res = await fetch(`/api/drivers/${encodeURIComponent(driverId)}/debt/pix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
        body: JSON.stringify({ amount })
      });
      return await res.json();
    } catch {
      return { ok: false, error: 'Erro ao gerar PIX para quitação de dívida.' };
    }
  },

  // ============================================================
  // ADMIN MASTER: GESTÃO DE MOTORISTAS E FINANCEIRO DA PLATAFORMA
  // ============================================================
  async fetchAdminFinanceOverview(): Promise<{
    ok: boolean;
    commissionPercent: number;
    maxDriverDebtLimit: number;
    autoBlockDelinquentDrivers: boolean;
    minWithdrawalAmount: number;
    totalGrossVolume: number;
    totalPlatformCommission: number;
    totalPixVolume: number;
    totalCardVolume: number;
    totalCashVolume: number;
    totalRefunded: number;
    totalPendingDriverDebt: number;
    totalAvailableForDrivers: number;
    delinquentDriversCount: number;
    driverWallets: DriverWalletSummary[];
    transactions: PaymentTransaction[];
    withdrawals: WithdrawalRequest[];
    ledger: FinancialLedgerEntry[];
  } | null> {
    try {
      const res = await fetch(`/api/admin/finance/overview?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'x-admin-pin': this.getAdminPin() }
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },

  async adminUpdateDriverStatus(
    driverId: string,
    payload: Partial<DriverProfile> & {
      approvalStatus?: DriverProfile['approvalStatus'];
      financialBlocked?: boolean;
      financialBlockReason?: string | null;
    }
  ): Promise<{ ok: boolean; driver?: DriverProfile }> {
    try {
      const res = await fetch(`/api/admin/drivers/${encodeURIComponent(driverId)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': this.getAdminPin()
        },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch {
      return { ok: false };
    }
  },

  async submitKycDocuments(payload: {
    driverId: string;
    driverDocument?: string;
    driverPhone?: string;
    driverEmail?: string;
    cnhDocumentPhoto: string;
    selfiePhoto: string;
    biometricResult: import('../types').KycBiometricResult;
  }): Promise<{ ok: boolean; driver?: DriverProfile; kyc?: import('../types').DriverKycData; error?: string }> {
    try {
      const res = await fetch('/api/kyc/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data?.driver) {
        this.setCurrentDriver(data.driver);
      }
      return data;
    } catch {
      return { ok: false, error: 'Erro de comunicação ao enviar documentos KYC.' };
    }
  },

  async fetchDriverKyc(driverId: string): Promise<{
    ok: boolean;
    kyc?: import('../types').DriverKycData;
    error?: string;
  }> {
    try {
      const res = await fetch(`/api/kyc/driver/${encodeURIComponent(driverId)}`, {
        headers: { 'x-admin-pin': this.getAdminPin() }
      });
      return await res.json();
    } catch {
      return { ok: false, error: 'Erro ao obter dados biométricos do motorista.' };
    }
  },

  async adminReviewKyc(payload: {
    driverId: string;
    action: 'aprovado' | 'rejeitado' | 'correcao_solicitada';
    notes?: string;
    adminName?: string;
    checklist?: Record<string, boolean>;
  }): Promise<{ ok: boolean; driver?: DriverProfile; error?: string }> {
    try {
      const res = await fetch('/api/kyc/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': this.getAdminPin()
        },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch {
      return { ok: false, error: 'Erro ao salvar revisão KYC.' };
    }
  },

  async adminPurgeKycDocuments(payload: {
    driverId: string;
    reason?: string;
    performedBy?: string;
  }): Promise<{ ok: boolean; driver?: DriverProfile; error?: string }> {
    try {
      const res = await fetch('/api/kyc/purge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': this.getAdminPin()
        },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch {
      return { ok: false, error: 'Erro ao purgar documentos biométricos.' };
    }
  },

  async adminProcessWithdrawal(
    withdrawalId: string,
    action: 'approve' | 'reject',
    notes?: string
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/admin/withdrawals/${encodeURIComponent(withdrawalId)}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': this.getAdminPin()
        },
        body: JSON.stringify({ action, notes })
      });
      return await res.json();
    } catch {
      return { ok: false, error: 'Erro ao processar solicitação de saque.' };
    }
  },

  async adminPaymentAction(
    txOrRideId: string,
    action: 'refund' | 'dispute',
    reason?: string
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`/api/admin/payments/${encodeURIComponent(txOrRideId)}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': this.getAdminPin()
        },
        body: JSON.stringify({ action, reason })
      });
      return await res.json();
    } catch {
      return { ok: false, error: 'Erro ao executar ação financeira.' };
    }
  },

  updateRideDriverLocation(
    rideId: string, 
    location: { lat: number; lng: number; heading?: number; speedKmH?: number }
  ): void {
    const updatedLoc = {
      lat: location.lat,
      lng: location.lng,
      heading: location.heading || 0,
      speedKmH: location.speedKmH || 0,
      updatedAt: new Date().toISOString()
    };
    const rides = this.getRides();
    const index = rides.findIndex(r => r.id === rideId);
    if (index >= 0) {
      rides[index].driverLocation = updatedLoc;
      rides[index].updatedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEYS.RIDES, JSON.stringify(rides));
      window.dispatchEvent(new CustomEvent('up_driver_location_update', { 
        detail: { rideId, location: updatedLoc } 
      }));
    }

    fetch(`/api/rides/${encodeURIComponent(rideId)}/location`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-pin': this.getAdminPin() },
      body: JSON.stringify({ role: 'driver', location: updatedLoc })
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.clientLocation) {
          window.dispatchEvent(new CustomEvent('up_client_location_update', {
            detail: { rideId, location: data.clientLocation }
          }));
        }
      })
      .catch(() => {});
  },

  updateRideClientLocation(
    rideId: string,
    location: { lat: number; lng: number; heading?: number; speedKmH?: number }
  ): void {
    const updatedLoc = {
      lat: location.lat,
      lng: location.lng,
      heading: location.heading || 0,
      speedKmH: location.speedKmH || 0,
      updatedAt: new Date().toISOString()
    };
    const rides = this.getRides();
    const index = rides.findIndex(r => r.id === rideId);
    if (index >= 0) {
      rides[index].clientLocation = updatedLoc;
      localStorage.setItem(STORAGE_KEYS.RIDES, JSON.stringify(rides));
    }

    fetch(`/api/rides/${encodeURIComponent(rideId)}/location`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
      body: JSON.stringify({ role: 'client', location: updatedLoc })
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.driverLocation) {
          window.dispatchEvent(new CustomEvent('up_driver_location_update', {
            detail: { rideId, location: data.driverLocation, status: data.status }
          }));
        }
      })
      .catch(() => {});
  },

  async fetchRideLiveLocation(rideId: string): Promise<{
    status?: Ride['status'];
    paymentStatus?: Ride['paymentStatus'];
    driverLocation?: Ride['driverLocation'];
    clientLocation?: Ride['clientLocation'];
  } | null> {
    try {
      const res = await fetch(`/api/rides/${encodeURIComponent(rideId)}/location?_t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.ok) return null;

      const rides = this.getRides();
      const index = rides.findIndex(r => r.id === rideId);
      if (index >= 0) {
        let changed = false;
        if (data.status && rides[index].status !== data.status) {
          rides[index].status = data.status;
          changed = true;
        }
        if (data.paymentStatus && rides[index].paymentStatus !== data.paymentStatus) {
          rides[index].paymentStatus = data.paymentStatus;
          changed = true;
        }
        if (data.driverLocation) {
          rides[index].driverLocation = data.driverLocation;
        }
        if (data.clientLocation) {
          rides[index].clientLocation = data.clientLocation;
        }
        localStorage.setItem(STORAGE_KEYS.RIDES, JSON.stringify(rides));
        if (changed) {
          window.dispatchEvent(new CustomEvent('up_rides_updated', { detail: { rideId, status: data.status } }));
        }
      }
      return data;
    } catch {
      return null;
    }
  },

  getPendingDeletes(): { kind: 'rides' | 'clients' | 'expenses'; id: string }[] {
    try {
      return JSON.parse(localStorage.getItem('up_pending_deletes') || '[]');
    } catch {
      return [];
    }
  },

  setPendingDeletes(list: { kind: 'rides' | 'clients' | 'expenses'; id: string }[]): void {
    localStorage.setItem('up_pending_deletes', JSON.stringify(list));
  },

  async sendDelete(kind: 'rides' | 'clients' | 'expenses', id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/${kind}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'x-admin-pin': this.getAdminPin() }
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  queueDelete(kind: 'rides' | 'clients' | 'expenses', id: string): void {
    const pending = this.getPendingDeletes().filter(p => !(p.kind === kind && p.id === id));
    pending.push({ kind, id });
    this.setPendingDeletes(pending);
    this.sendDelete(kind, id).then(ok => {
      if (ok) {
        this.setPendingDeletes(this.getPendingDeletes().filter(p => !(p.kind === kind && p.id === id)));
      }
    });
  },

  async flushPendingDeletes(): Promise<void> {
    const pending = this.getPendingDeletes();
    if (pending.length === 0) return;
    const remaining: typeof pending = [];
    for (const p of pending) {
      const ok = await this.sendDelete(p.kind, p.id);
      if (!ok) remaining.push(p);
    }
    this.setPendingDeletes(remaining);
  },

  deleteRide(id: string): void {
    const rides = this.getRides().filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEYS.RIDES, JSON.stringify(rides));
    window.dispatchEvent(new CustomEvent('up_rides_updated', { detail: { rideId: id } }));
    this.queueDelete('rides', id);
  },

  getClients(): ClientProfile[] {
    if (!this.isAdminAuthenticated()) return [];
    const data = localStorage.getItem(STORAGE_KEYS.CLIENTS);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  saveClient(client: ClientProfile): void {
    const sanitized = { ...client };
    delete sanitized.password;

    if (this.isAdminAuthenticated()) {
      const clients = this.getClients();
      const index = clients.findIndex(c => c.id === sanitized.id);
      if (index >= 0) {
        clients[index] = sanitized;
      } else {
        clients.unshift(sanitized);
      }
      localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(clients));
    }

    fetch('/api/clients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-pin': this.getAdminPin()
      },
      body: JSON.stringify(client)
    }).catch(err => console.warn('Client sync error:', err));
  },

  async fetchClientProfile(clientId: string): Promise<ClientProfile | null> {
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: this.getAuthHeaders()
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.client) {
        this.setCurrentUser(data.client);
        return data.client;
      }
      return null;
    } catch {
      return null;
    }
  },

  async uploadClientPhoto(clientId: string, photo: string): Promise<{ ok: boolean; client?: ClientProfile; error?: string }> {
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
        body: JSON.stringify({ photo })
      });
      const data = await res.json();
      if (data?.client) {
        this.setCurrentUser(data.client);
      }
      return data;
    } catch {
      return { ok: false, error: 'Erro de conexão ao salvar foto de perfil.' };
    }
  },

  async requestClientProfileChange(
    clientId: string,
    fields: { name?: string; phone?: string; email?: string; document?: string }
  ): Promise<{ ok: boolean; client?: ClientProfile; error?: string }> {
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/profile-change-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.getAuthHeaders() },
        body: JSON.stringify(fields)
      });
      const data = await res.json();
      if (data?.client) {
        this.setCurrentUser(data.client);
      }
      return data;
    } catch {
      return { ok: false, error: 'Erro de conexão ao enviar solicitação ao Admin Master.' };
    }
  },

  async reviewProfileChangeRequest(
    role: 'driver' | 'client',
    targetId: string,
    decision: 'aprovar' | 'recusar',
    rejectionReason?: string
  ): Promise<{ ok: boolean; driver?: DriverProfile; client?: ClientProfile; error?: string }> {
    try {
      const res = await fetch(`/api/admin/profile-change-requests/${role}/${encodeURIComponent(targetId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pin': this.getAdminPin(),
          ...this.getAuthHeaders()
        },
        body: JSON.stringify({ decision, rejectionReason })
      });
      const data = await res.json();
      if (data?.ok && data?.client) {
        const list = this.getClients();
        const idx = list.findIndex(c => c.id === data.client.id);
        if (idx >= 0) {
          list[idx] = { ...list[idx], ...data.client };
          localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(list));
        }
      }
      return data;
    } catch {
      return { ok: false, error: 'Erro de conexão ao analisar solicitação cadastral.' };
    }
  },

  async registerClient(payload: {
    name: string;
    phone: string;
    document: string;
    email: string;
    password: string;
    termsAcceptedAt?: string;
    termsAcceptance?: {
      accepted: boolean;
      contractId?: string;
      contractVersion?: string;
      acceptedAtClient?: string;
      affirmativeText?: string;
      language?: string;
      timezone?: string;
    };
    turnstileToken?: string;
  }): Promise<{ ok: boolean; client?: ClientProfile; error?: string }> {
    try {
      const res = await fetch('/api/clients/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || 'Erro ao realizar cadastro.' };
      }
      if (data.clientToken) {
        this.setClientToken(data.clientToken);
      }
      this.setCurrentUser(data.client);
      return { ok: true, client: data.client };
    } catch {
      return { ok: false, error: 'Erro de conexão com o servidor. Verifique sua internet.' };
    }
  },

  async loginClient(identifier: string, password: string, turnstileToken?: string): Promise<{ ok: boolean; client?: ClientProfile; error?: string }> {
    try {
      const res = await fetch('/api/clients/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, turnstileToken })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || 'Credenciais inválidas.' };
      }
      if (data.clientToken) {
        this.setClientToken(data.clientToken);
      }
      this.setCurrentUser(data.client);
      return { ok: true, client: data.client };
    } catch {
      return { ok: false, error: 'Erro de conexão com o servidor. Verifique sua internet.' };
    }
  },

  async getAuthConfig(): Promise<{
    googleEnabled: boolean;
    googleClientId: string;
    turnstileEnabled: boolean;
    turnstileSiteKey: string;
  }> {
    const buildGoogleId = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
    const buildTurnstileKey = String(import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();
    try {
      const res = await fetch('/api/auth-config');
      if (res.ok) {
        const data = await res.json();
        const googleClientId = String(data?.googleClientId || buildGoogleId || '').trim();
        const turnstileSiteKey = String(data?.turnstileSiteKey || data?.siteKey || buildTurnstileKey || '').trim();
        return {
          googleEnabled: Boolean(googleClientId || data?.googleEnabled),
          googleClientId,
          turnstileEnabled: Boolean(data?.turnstileEnabled ?? turnstileSiteKey),
          turnstileSiteKey,
        };
      }
    } catch {
      // Fallback para build env
    }
    return {
      googleEnabled: Boolean(buildGoogleId),
      googleClientId: buildGoogleId,
      turnstileEnabled: Boolean(buildTurnstileKey),
      turnstileSiteKey: buildTurnstileKey,
    };
  },

  async authenticateWithGoogle(payload: {
    accessToken?: string;
    idToken?: string;
    name?: string;
    phone?: string;
    termsAcceptance?: {
      accepted: boolean;
      contractId?: string;
      contractVersion?: string;
      acceptedAtClient?: string;
      affirmativeText?: string;
      language?: string;
      timezone?: string;
    };
    turnstileToken?: string;
  }): Promise<{
    ok: boolean;
    needsRegistration?: boolean;
    googleProfile?: {
      email: string;
      name: string;
      picture?: string;
      existingPhone?: string;
    };
    client?: ClientProfile;
    error?: string;
  }> {
    try {
      const res = await fetch('/api/clients/google-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || 'Erro ao autenticar com o Google.' };
      }
      if (data.clientToken) {
        this.setClientToken(data.clientToken);
      }
      if (data.client) {
        this.setCurrentUser(data.client);
      }
      return {
        ok: true,
        needsRegistration: Boolean(data.needsRegistration),
        googleProfile: data.googleProfile,
        client: data.client
      };
    } catch {
      return { ok: false, error: 'Erro de conexão com o servidor. Verifique sua internet.' };
    }
  },

  async completeClientContact(payload: {
    clientId: string;
    password: string;
    name?: string;
    phone: string;
    email: string;
  }): Promise<{ ok: boolean; client?: ClientProfile; error?: string }> {
    try {
      const res = await fetch('/api/clients/complete-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.client) {
        return { ok: false, error: data.error || 'Erro ao atualizar dados de contato.' };
      }
      if (data.clientToken) {
        this.setClientToken(data.clientToken);
      }
      this.setCurrentUser(data.client);
      return { ok: true, client: data.client };
    } catch {
      return { ok: false, error: 'Erro de conexão com o servidor. Verifique sua internet.' };
    }
  },

  async checkClientExists(identifier: string): Promise<{
    ok: boolean;
    exists: boolean;
    name?: string;
    firstName?: string;
    hasPassword?: boolean;
    blocked?: boolean;
  }> {
    try {
      const res = await fetch('/api/clients/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier })
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        return data;
      }
      return { ok: false, exists: false };
    } catch {
      // Fallback local caso offline
      const clean = identifier.replace(/\D/g, '');
      const local = this.getClients().find(c => {
        const cPhone = (c.phone || '').replace(/\D/g, '');
        const cEmail = (c.email || '').toLowerCase();
        return (clean && cPhone === clean) || (identifier.includes('@') && cEmail === identifier.toLowerCase());
      });
      if (local) {
        return {
          ok: true,
          exists: true,
          name: local.name,
          firstName: local.name.split(' ')[0],
          hasPassword: Boolean(local.password)
        };
      }
      return { ok: true, exists: false };
    }
  },

  deleteClient(id: string): void {
    const clients = this.getClients().filter(c => c.id !== id);
    localStorage.setItem(STORAGE_KEYS.CLIENTS, JSON.stringify(clients));
    this.queueDelete('clients', id);
  },

  getExpenses(): Expense[] {
    if (!this.isAdminAuthenticated()) return [];
    const data = localStorage.getItem(STORAGE_KEYS.EXPENSES);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  saveExpense(expense: Expense): void {
    const list = this.getExpenses();
    const index = list.findIndex(e => e.id === expense.id);
    if (index >= 0) {
      list[index] = expense;
    } else {
      list.unshift(expense);
    }
    localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(list));

    fetch('/api/expenses', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-admin-pin': this.getAdminPin()
      },
      body: JSON.stringify(expense)
    }).catch(err => console.warn('Expense sync error:', err));
  },

  deleteExpense(id: string): void {
    const list = this.getExpenses().filter(e => e.id !== id);
    localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(list));
    this.queueDelete('expenses', id);
  },

  getConfig(): SystemConfig {
    const data = localStorage.getItem(STORAGE_KEYS.CONFIG);
    if (!data) {
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(DEFAULT_CONFIG));
      return DEFAULT_CONFIG;
    }
    try {
      const parsed = JSON.parse(data);
      const normalizedCats = normalizeCategoriesFromConfig(parsed);
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        rideCategories: normalizedCats,
        serviceCategories: normalizedCats
      };
    } catch {
      return DEFAULT_CONFIG;
    }
  },

  saveConfig(config: SystemConfig): Promise<boolean> {
    lastConfigSaveTimestamp = Date.now();
    const normalizedCats = normalizeCategoriesFromConfig(config);
    const payload: SystemConfig = {
      ...config,
      rideCategories: normalizedCats,
      serviceCategories: normalizedCats
    };
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(payload));

    return fetch('/api/config', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-admin-pin': this.getAdminPin()
      },
      body: JSON.stringify(payload)
    })
      .then(res => res.ok)
      .catch(() => false);
  },

  getNotifications(): NotificationItem[] {
    const data = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    if (!data) return [];
    try {
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  addNotification(notification: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>): void {
    const notifications = this.getNotifications();
    const newItem: NotificationItem = {
      ...notification,
      id: `notif-${Date.now()}`,
      timestamp: new Date().toISOString(),
      read: false,
    };
    notifications.unshift(newItem);
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications.slice(0, 50)));

    fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newItem)
    }).catch(() => {});
  },

  markNotificationsRead(): void {
    const list = this.getNotifications().map(n => ({ ...n, read: true }));
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list));
    fetch('/api/notifications/read', {
      method: 'PATCH',
      headers: { 'x-admin-pin': this.getAdminPin() }
    }).catch(() => {});
    window.dispatchEvent(new CustomEvent('up_notifications_updated'));
  },

  markNotificationAsRead(id: string): void {
    const list = this.getNotifications().map(n => n.id === id ? { ...n, read: true } : n);
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list));
    fetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-pin': this.getAdminPin() },
      body: JSON.stringify({ read: true })
    }).catch(() => {});
    window.dispatchEvent(new CustomEvent('up_notifications_updated'));
  },

  deleteNotification(id: string): void {
    const list = this.getNotifications().filter(n => n.id !== id);
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list));
    fetch(`/api/notifications/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-admin-pin': this.getAdminPin() }
    }).catch(() => {});
    window.dispatchEvent(new CustomEvent('up_notifications_updated'));
  },

  clearAllNotifications(): void {
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify([]));
    fetch('/api/notifications', {
      method: 'DELETE',
      headers: { 'x-admin-pin': this.getAdminPin() }
    }).catch(() => {});
    window.dispatchEvent(new CustomEvent('up_notifications_updated'));
  },

  getBlockedSlots(): Record<string, string[]> {
    const data = localStorage.getItem('up_blocked_slots');
    if (!data) return {};
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  },

  saveBlockedSlots(date: string, slots: string[]): void {
    const current = this.getBlockedSlots();
    current[date] = slots;
    localStorage.setItem('up_blocked_slots', JSON.stringify(current));
    window.dispatchEvent(new CustomEvent('up_blocked_slots_updated'));
    fetch('/api/blocked-slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-pin': this.getAdminPin() },
      body: JSON.stringify({ date, slots })
    }).catch(() => {});
  },

  blockSlot(date: string, slotTime: string): void {
    const current = this.getBlockedSlots();
    const daySlots = current[date] ? [...current[date]] : [];
    if (!daySlots.includes(slotTime)) {
      daySlots.push(slotTime);
      daySlots.sort();
    }
    this.saveBlockedSlots(date, daySlots);
  },

  unblockSlot(date: string, slotTime: string): void {
    const current = this.getBlockedSlots();
    const daySlots = current[date] || [];
    this.saveBlockedSlots(date, daySlots.filter(s => s !== slotTime));
  },

  //No modelo Uber sob demanda 100% imediato, nunca há bloqueio por horário de agenda
  isSlotBlocked(): boolean {
    return false;
  },

  getCurrentUser(): ClientProfile | null {
    const data = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  },

  setCurrentUser(user: ClientProfile | null): void {
    if (!user) {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      this.setClientToken(null);
    } else {
      const sanitized = { ...user };
      delete sanitized.password;
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(sanitized));
    }
  },

  isAdminAuthenticated(): boolean {
    if (localStorage.getItem(STORAGE_KEYS.ADMIN_AUTH) !== 'true') return false;
    const token = localStorage.getItem('up_admin_token') || '';
    if (!token.startsWith('kavro_adm.')) return false;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(b64));
      if (!payload || !payload.exp || Number(payload.exp) <= Date.now()) {
        this.setAdminAuthenticated(false);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },

  setAdminAuthenticated(auth: boolean): void {
    if (auth) {
      localStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, 'true');
    } else {
      localStorage.removeItem(STORAGE_KEYS.ADMIN_AUTH);
      localStorage.removeItem('up_admin_token');
      localStorage.removeItem('up_admin_pin');
      localStorage.removeItem('up_admin_email');
    }
  },

  getAdminPin(): string {
    if (!this.isAdminAuthenticated()) return '';
    return localStorage.getItem('up_admin_token') || '';
  },

  setAdminPin(token: string): void {
    localStorage.removeItem('up_admin_pin');
    if (token && token.startsWith('kavro_adm.')) {
      localStorage.setItem('up_admin_token', token);
    } else {
      localStorage.removeItem('up_admin_token');
    }
  },

  getAdminEmail(): string {
    if (!this.isAdminAuthenticated()) return '';
    return localStorage.getItem('up_admin_email') || '';
  },

  async loginMasterAdmin(
    email: string,
    password: string,
    turnstileToken?: string
  ): Promise<{ ok: boolean; email?: string; error?: string }> {
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, turnstileToken })
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.token) {
        return { ok: false, error: data.error || 'Credenciais inválidas para o Painel Master.' };
      }
      this.setAdminPin(data.token);
      if (data.email) {
        localStorage.setItem('up_admin_email', String(data.email));
      }
      this.setAdminAuthenticated(true);
      return { ok: true, email: data.email };
    } catch {
      return { ok: false, error: 'Erro de conexão com o servidor ao autenticar administrador.' };
    }
  },

  async verifyAdminSession(): Promise<boolean> {
    const token = localStorage.getItem('up_admin_token') || '';
    if (!token.startsWith('kavro_adm.')) {
      this.setAdminAuthenticated(false);
      return false;
    }
    try {
      const res = await fetch('/api/admin/session', {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-admin-pin': token
        }
      });
      if (!res.ok) {
        this.setAdminAuthenticated(false);
        return false;
      }
      const data = await res.json();
      if (!data?.ok) {
        this.setAdminAuthenticated(false);
        return false;
      }
      if (data.email) {
        localStorage.setItem('up_admin_email', String(data.email));
      }
      localStorage.setItem(STORAGE_KEYS.ADMIN_AUTH, 'true');
      return true;
    } catch {
      return this.isAdminAuthenticated();
    }
  },

  getRecentDestinations(): LocationPoint[] {
    const user = this.getCurrentUser();
    const cleanPhone = (user?.phone || '').replace(/\D/g, '');
    const userKey = cleanPhone ? `${STORAGE_KEYS.RECENT_DESTINATIONS}_${cleanPhone}` : STORAGE_KEYS.RECENT_DESTINATIONS;
    const data = localStorage.getItem(userKey);
    if (!data) return [];
    try {
      const parsed: LocationPoint[] = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(p =>
        p && p.address &&
        !p.address.includes('Rua Bruno Benedet, 170') &&
        !p.address.includes('Rodovia Franklin Locatelli')
      );
    } catch {
      return [];
    }
  },

  addRecentDestination(point: LocationPoint): void {
    if (!point || !point.address) return;
    const user = this.getCurrentUser();
    const cleanPhone = (user?.phone || '').replace(/\D/g, '');
    const userKey = cleanPhone ? `${STORAGE_KEYS.RECENT_DESTINATIONS}_${cleanPhone}` : STORAGE_KEYS.RECENT_DESTINATIONS;
    const list = this.getRecentDestinations();
    const filtered = list.filter(p => p.address !== point.address);
    filtered.unshift(point);
    localStorage.setItem(userKey, JSON.stringify(filtered.slice(0, 8)));
  },

  removeRecentDestination(address: string): void {
    const user = this.getCurrentUser();
    const cleanPhone = (user?.phone || '').replace(/\D/g, '');
    const userKey = cleanPhone ? `${STORAGE_KEYS.RECENT_DESTINATIONS}_${cleanPhone}` : STORAGE_KEYS.RECENT_DESTINATIONS;
    const list = this.getRecentDestinations();
    const filtered = list.filter(p => p.address !== address);
    localStorage.setItem(userKey, JSON.stringify(filtered));
  },

  clearRecentDestinations(): void {
    const user = this.getCurrentUser();
    const cleanPhone = (user?.phone || '').replace(/\D/g, '');
    if (cleanPhone) {
      localStorage.removeItem(`${STORAGE_KEYS.RECENT_DESTINATIONS}_${cleanPhone}`);
    }
    localStorage.removeItem(STORAGE_KEYS.RECENT_DESTINATIONS);
  },

  calculateRidePrice(
    distanceKm: number,
    durationMin: number,
    timeStr: string,
    config: SystemConfig,
    categoryId = 'kavro_go',
    city?: string
  ) {
    return calculateRidePrice(distanceKm, durationMin, timeStr, config, categoryId, city);
  },

  async getRideMessages(rideId: string): Promise<{ ok: boolean; messages: RideChatMessage[]; error?: string }> {
    try {
      const currentUser = this.getCurrentUser();
      const currentDriver = this.getCurrentDriver();
      const headers: Record<string, string> = this.getAuthHeaders();
      if (currentUser?.id) headers['x-client-id'] = currentUser.id;
      if (currentUser?.phone) headers['x-client-phone'] = currentUser.phone;
      if (currentDriver?.id) headers['x-driver-id'] = currentDriver.id;

      const res = await fetch(`/api/rides/${encodeURIComponent(rideId)}/messages?_t=${Date.now()}`, {
        cache: 'no-store',
        headers
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, messages: [], error: data.error || 'Erro ao carregar mensagens.' };
      }
      return { ok: true, messages: Array.isArray(data.messages) ? data.messages : [] };
    } catch {
      return { ok: false, messages: [], error: 'Erro de conexão ao carregar chat.' };
    }
  },

  async sendRideMessage(
    rideId: string,
    payload: { text: string; senderRole: 'driver' | 'client'; senderName?: string }
  ): Promise<{ ok: boolean; message?: RideChatMessage; error?: string }> {
    try {
      const currentUser = this.getCurrentUser();
      const currentDriver = this.getCurrentDriver();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders()
      };
      if (currentUser?.id) headers['x-client-id'] = currentUser.id;
      if (currentUser?.phone) headers['x-client-phone'] = currentUser.phone;
      if (currentDriver?.id) headers['x-driver-id'] = currentDriver.id;

      const res = await fetch(`/api/rides/${encodeURIComponent(rideId)}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || 'Não foi possível enviar a mensagem.' };
      }
      return { ok: true, message: data.message };
    } catch {
      return { ok: false, error: 'Erro de conexão ao enviar mensagem.' };
    }
  },

  async requestPasswordRecovery(
    role: 'client' | 'driver',
    identifier: string
  ): Promise<{
    ok: boolean;
    maskedDestination?: string;
    channels?: string[];
    expiresInMinutes?: number;
    devCode?: string;
    error?: string;
  }> {
    try {
      const res = await fetch('/api/auth/recovery/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, identifier })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || 'Não foi possível iniciar a recuperação.' };
      }
      return data;
    } catch {
      return { ok: false, error: 'Erro de conexão ao solicitar código de recuperação.' };
    }
  },

  async resetPasswordWithOtp(
    role: 'client' | 'driver',
    identifier: string,
    code: string,
    newPassword: string
  ): Promise<{ ok: boolean; message?: string; error?: string }> {
    try {
      const res = await fetch('/api/auth/recovery/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, identifier, code, newPassword })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || 'Não foi possível redefinir a senha.' };
      }
      return data;
    } catch {
      return { ok: false, error: 'Erro de conexão ao redefinir a senha.' };
    }
  }
};

export function calculateRidePrice(
  distanceKm: number,
  durationMin: number,
  timeStr: string,
  config: SystemConfig,
  categoryId = 'kavro_go',
  city?: string
): {
  totalPrice: number;
  commissionPercent: number;
  commissionAmount: number;
  driverNetAmount: number;
  categoryName: string;
  appliedFareSnapshot: {
    categoryId: string;
    categoryName: string;
    baseFare: number;
    pricePerKm: number;
    pricePerMinute: number;
    minimumFare: number;
    multiplier: number;
    commissionPercent: number;
    nightSurchargePercent?: number;
    city?: string;
  };
  breakdown: any;
} {
  const category = getCategoryById(categoryId, config);
  const pricing = getEffectiveCategoryPricing(category, city);

  let isNight = false;
  if (timeStr) {
    const [hour] = timeStr.split(':').map(Number);
    if (hour >= config.nightStartHour || hour < config.nightEndHour) {
      isNight = true;
    }
  }

  // Cada categoria possui sua própria tarifa base, valor por KM, valor por minuto e tarifa mínima.
  // Se o administrador usar apenas o multiplicador sobre a base padrão ou tarifas customizadas,
  // aplicamos os parâmetros efetivos da categoria escolhida.
  const basePart = pricing.baseFare;
  const kmPart = distanceKm * pricing.pricePerKm;
  const timePart = durationMin * pricing.pricePerMinute;

  let subtotal = basePart + kmPart + timePart;

  let nightSurcharge = 0;
  if (isNight && config.nightSurchargePercent > 0) {
    nightSurcharge = subtotal * (config.nightSurchargePercent / 100);
    subtotal += nightSurcharge;
  }

  const finalPrice = Math.max(pricing.minimumFare, Math.round(subtotal * 10) / 10);
  const commPct = Number(pricing.commissionPercent ?? config.platformCommissionPercent ?? 20);
  const commAmt = Math.round(finalPrice * (commPct / 100) * 100) / 100;
  const netAmt = Math.round((finalPrice - commAmt) * 100) / 100;

  return {
    totalPrice: finalPrice,
    commissionPercent: commPct,
    commissionAmount: commAmt,
    driverNetAmount: netAmt,
    categoryName: category.name,
    appliedFareSnapshot: {
      categoryId: category.id,
      categoryName: category.name,
      baseFare: pricing.baseFare,
      pricePerKm: pricing.pricePerKm,
      pricePerMinute: pricing.pricePerMinute,
      minimumFare: pricing.minimumFare,
      multiplier: pricing.multiplier,
      commissionPercent: commPct,
      nightSurchargePercent: config.nightSurchargePercent,
      city
    },
    breakdown: {
      baseFare: basePart,
      distanceCost: kmPart,
      timeCost: timePart,
      nightSurcharge,
      isNight,
      minimumFareApplied: finalPrice === pricing.minimumFare,
      categoryMultiplier: pricing.multiplier
    }
  };
}
