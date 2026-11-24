export type RideStatus = 
  | 'aguardando_pagamento'
  | 'aguardando_confirmacao' // Buscando motorista / Tocando para motorista
  | 'na_fila'                // Aceita pelo motorista que está finalizando corrida próxima
  | 'confirmada'             // Motorista aceitou / confirmado
  | 'a_caminho'              // Motorista em deslocamento até o passageiro
  | 'no_local'               // Motorista chegou no embarque
  | 'em_andamento'           // Viagem em curso até o destino
  | 'finalizada'             // Viagem concluída
  | 'cancelada';             // Cancelada

export type PaymentMethod = 'pix' | 'dinheiro' | 'cartao_credito' | 'cartao_debito' | 'apple_pay' | 'carteira' | 'online';

export type PaymentStatus =
  | 'aguardando'
  | 'autorizado'
  | 'confirmado'
  | 'parcialmente_pago'
  | 'pendente'
  | 'falhou'
  | 'reembolsado'
  | 'cancelado'
  | 'taxa_cancelamento'
  | 'contestado'
  | 'pago'      // compatibilidade com código existente (= confirmado)
  | 'parcial';  // compatibilidade com código existente (= parcialmente_pago)

export interface LocationPoint {
  address: string;
  lat: number;
  lng: number;
  reference?: string;
  complement?: string;
}

export type ServiceCategoryType = 'padrao' | 'entregas';

export interface RideDeliveryDetails {
  role: 'sender' | 'receiver';
  recipientName: string;
  recipientPhone: string;
  itemDescription: string;
  packageSize?: 'pequeno' | 'medio' | 'grande';
  dropoffMode?: 'porta_mao' | 'portaria' | 'recepcao';
  instructions?: string;
}

export interface SavedCard {
  id: string;
  clientId?: string;
  clientPhone?: string;
  brand: string;
  last4: string;
  holderName: string;
  holderDocLast4?: string;
  expMonth: string;
  expYear: string;
  cardType: 'cartao_credito' | 'cartao_debito';
  gatewayToken: string;
  mpCustomerId?: string;
  mpCardId?: string;
  isDefault?: boolean;
  createdAt: string;
}

export interface TermsSignatureTechnicalEvidence {
  ip: string;
  userAgent: string;
  host?: string;
  clientAcceptedAt?: string;
  language?: string;
  timezone?: string;
}

export interface PassengerTermsSignature {
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
  passengerSnapshot: {
    clientId: string;
    name: string;
    cpf: string;
    rawCpf?: string;
    phone?: string;
    email?: string;
  };
  technicalEvidence: TermsSignatureTechnicalEvidence;
}

export interface ProfileChangeRequest {
  id: string;
  requestedFields: {
    name?: string;
    phone?: string;
    email?: string;
    document?: string;
    city?: string;
    vehicleBrand?: string;
    vehicleModel?: string;
    vehicleColor?: string;
    vehiclePlate?: string;
  };
  previousValues?: {
    name?: string;
    phone?: string;
    email?: string;
    document?: string;
    city?: string;
    vehicleBrand?: string;
    vehicleModel?: string;
    vehicleColor?: string;
    vehiclePlate?: string;
  };
  status: 'pendente' | 'aprovado' | 'recusado';
  requestedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
}

export interface TrustedContact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  autoShareAllRides: boolean;
  autoShareNightOnly: boolean;
  notifyOnAnomalyOrSos: boolean;
  createdAt: string;
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship?: string;
  createdAt: string;
}

export interface PassengerSafetyPreferences {
  boardingPinEnabled: boolean;
  customBoardingPin?: string;
  audioRecordingEnabled: boolean;
  audioAutoRecord: boolean;
  rideCheckEnabled: boolean;
  familySafetyEnabled: boolean;
  familyGuardianName?: string;
  familyGuardianPhone?: string;
  updatedAt?: string;
}

export interface FamilyMemberRideSummary {
  id: string;
  rideCode?: string;
  status: string;
  originAddress: string;
  destinationAddress: string;
  totalPrice: number;
  driverName?: string | null;
  driverPlate?: string | null;
  driverVehicle?: string | null;
  trackingUrl?: string;
  createdAt: string;
}

export interface FamilyMemberRecord {
  id: string;
  guardianId: string;
  guardianName: string;
  guardianPhone: string;
  teenClientId?: string | null;
  teenName: string;
  teenPhone: string;
  teenBirthDate: string;
  teenAge: number;
  status: 'convite_enviado' | 'ativo' | 'revogado';
  inviteToken: string;
  inviteUrl: string;
  termsAccepted: boolean;
  termsAcceptedAt: string;
  apiDispatch?: {
    whatsappUrl?: string;
    messageText?: string;
    channel?: string;
    sentAt?: string;
  } | null;
  activeRide?: FamilyMemberRideSummary | null;
  recentRides?: FamilyMemberRideSummary[];
  totalRidesCount?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface SafetyAudioIncidentRecord {
  id: string;
  rideId?: string;
  durationSec: number;
  mimeType: string;
  sizeBytes: number;
  recordedAt: string;
  reportedBy: 'passageiro' | 'motorista';
  notes?: string;
  hasAudioFile?: boolean;
  storage?: string;
}

export interface RideCheckAlertState {
  id: string;
  reason: 'parada_longa' | 'desvio_rota';
  reasonLabel: string;
  triggeredAt: string;
  expiresAt: string;
  status: 'aguardando_resposta' | 'confirmado_ok' | 'escalado_sos';
  respondedBy?: 'passageiro' | 'motorista' | 'sistema_timeout';
  respondedAt?: string;
  lat?: number;
  lng?: number;
  sosAlertId?: string;
}

export interface TrustedContactDispatchRecord {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  event: 'ride_started' | 'ridecheck_escalation' | 'sos_triggered' | 'manual_share';
  trackingUrl: string;
  whatsappUrl: string;
  apiDelivered: boolean;
  channel: string;
  sentAt: string;
}

export interface ClientProfile {
  id: string;
  name: string;
  phone: string;
  email?: string;
  document?: string;
  photo?: string;
  profileChangeRequest?: ProfileChangeRequest | null;
  password?: string;
  notes?: string;
  blocked?: boolean;
  savedAddresses?: Array<{
    id: string;
    label: string;
    address: string;
    lat: number;
    lng: number;
  }>;
  savedCards?: SavedCard[];
  trustedContacts?: TrustedContact[];
  emergencyContacts?: EmergencyContact[];
  safetyPreferences?: PassengerSafetyPreferences;
  accountType?: 'standard' | 'teen';
  guardianClientId?: string | null;
  birthDate?: string;
  termsAcceptedAt?: string;
  termsSignature?: PassengerTermsSignature | null;
  walletBalance?: number;
  createdAt: string;
}

export type ClientWalletEntryType = 'topup' | 'ride_debit' | 'ride_refund' | 'route_adjustment' | 'admin_adjustment';

export interface ClientWalletEntry {
  id: string;
  idempotencyKey: string;
  clientId: string;
  clientPhone?: string;
  clientName?: string;
  entryType: ClientWalletEntryType;
  paymentMethod: string;
  amount: number;
  balanceDelta: number;
  status: 'aguardando' | 'confirmado' | 'cancelado' | 'falhou';
  rideId?: string | null;
  rideCode?: string | null;
  gatewayTxId?: string | null;
  pixQrCode?: string;
  pixCopyPaste?: string;
  pixExpiresAt?: string;
  description: string;
  metadata?: {
    provider?: string;
    requestedDepositAmount?: number;
    cardFeePercent?: number;
    cardFeeAmount?: number;
    chargedTotalAmount?: number;
    cardId?: string;
    cardBrand?: string;
    cardLast4?: string;
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt?: string;
}

export interface ClientWalletSummary {
  clientId: string;
  balance: number;
  pendingBalance: number;
  minTopupAmount: number;
  totalDeposited: number;
  totalSpent: number;
  totalRefunded: number;
  entries: ClientWalletEntry[];
}

export type KycStatus = 'pendente' | 'em_analise' | 'correcao_solicitada' | 'aprovado' | 'rejeitado';

export type DriverApprovalStatus =
  | 'pendente'
  | 'em_analise'
  | 'correcao_solicitada'
  | 'aprovado'
  | 'rejeitado'
  | 'pendente_aprovacao'
  | 'bloqueado'
  | 'suspenso';

export interface KycBiometricResult {
  similarity: number;            // Similaridade facial de 0 a 100%
  similarityScore?: number;      // Alias para exibição em componentes
  distance: number;              // Distância euclidiana calculada pelo modelo
  match: boolean;                // true se similarity >= limiar configurado (ex: 60%)
  isMatch?: boolean;             // Alias para exibição em componentes
  divergences: string[];         // Alertas ou possíveis divergências encontradas
  cnhFaceDetected: boolean;      // Rosto identificado na fotografia da CNH
  selfieFaceDetected: boolean;   // Rosto identificado na selfie da câmara
  livenessScore?: number;        // Estimativa de vivacidade facial
  antiSpoofScore?: number;       // Detecção de foto de tela / máscara
  engine: 'Human (vladmandic/human)' | 'Client-Vision-Fallback';
  engineVersion: string;
  analyzedAt: string;
  disclaimer: string;            // Aviso: resultado serve como apoio à análise manual
}

export interface KycAuditLog {
  id: string;
  timestamp: string;
  action: 'kyc_submitted' | 'document_viewed' | 'approved' | 'rejected' | 'correction_requested' | 'data_purged';
  performedBy: string;           // 'motorista' | 'admin' | nome do operador
  notes?: string;
  ip?: string;
  userAgent?: string;
}

export interface DriverKycStoredDocInfo {
  storage?: string;
  path?: string;
  bucket?: string;
  filename?: string;
  contentType?: string;
}

export interface DriverKycData {
  status: KycStatus;
  cnhDocumentUrl?: string;       // URL temporária ou caminho no storage privado Supabase/R2
  selfieUrl?: string;            // URL temporária ou caminho no storage privado Supabase/R2
  cnhDocumentPath?: string;      // Caminho interno no storage
  selfiePath?: string;           // Caminho interno no storage
  cnhDocInfo?: DriverKycStoredDocInfo | null;
  selfieDocInfo?: DriverKycStoredDocInfo | null;
  biometricResult?: KycBiometricResult;
  rejectionReason?: string;
  correctionInstructions?: string;
  adminNotes?: string;           // Instruções / parecer do administrador
  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  checklist?: Record<string, boolean>;
  auditLogs?: KycAuditLog[];
  retentionExpiresAt?: string;   // Política de retenção LGPD (ex: 90 dias após encerramento)
}

export interface CityCategoryPricingOverride {
  city: string;
  active: boolean;
  baseFare?: number;
  pricePerKm?: number;
  pricePerMinute?: number;
  minimumFare?: number;
  commissionPercent?: number;
  multiplier?: number;
  minVehicleYear?: number;
}

export interface RideCategoryConfig {
  id: string;                 // ex: 'kavro_go' | 'kavro_plus' | 'kavro_exec' | 'kavro_entregas'
  code?: string;              // ex: 'GO' | 'PLUS' | 'EXEC' | 'ENTREGAS'
  name: string;               // ex: 'KAVRO GO' | 'KAVRO PLUS' | 'KAVRO EXEC' | 'KAVRO ENTREGAS'
  subtitle?: string;          // ex: 'Econômico' | 'Conforto' | 'Executivo' | 'Produtos • Encomendas'
  description: string;
  categoryType?: ServiceCategoryType; // 'padrao' (Viagem) | 'entregas' (Produtos/Encomendas)
  active: boolean;
  sortOrder?: number;
  // Precificação e Comissão Independentes por Categoria
  multiplier: number;         // ex: 1.00, 1.25, 1.50
  baseFare: number;           // Tarifa base da categoria
  pricePerKm: number;         // Valor por KM da categoria
  pricePerMinute: number;     // Valor por minuto da categoria
  minimumFare: number;        // Tarifa mínima da categoria
  commissionPercent: number;  // Comissão percentual da KAVRO DRIVE nesta categoria
  maxPassengers?: number;     // Capacidade padrão (ex: 4)
  // Regras de Elegibilidade Configuráveis
  minVehicleYear: number;     // Ano mínimo do veículo (ex: 2014, 2018, 2021)
  minDriverRating: number;    // Avaliação mínima do motorista (ex: 4.50, 4.75, 4.85)
  minCompletedRides: number;  // Viagens concluídas mínimas (ex: 0, 10, 25)
  requireFourDoors: boolean;
  requireAirConditioning: boolean;
  requireRegularDoc: boolean; // CRLV regularizado
  requireEar: boolean;        // CNH com EAR
  requireLargeTrunk: boolean; // Porta-malas espaçoso / sedan / SUV
  requireLeatherSeats: boolean; // Bancos em couro / acabamento executivo
  allowedModels: string[];    // Lista de modelos permitidos (vazio = aceita todos que cumpram ano/requisitos)
  allowedCities: string[];    // Lista de cidades liberadas (vazio = disponível em todas as cidades)
  cityOverrides?: CityCategoryPricingOverride[];
}

export interface CategoryEligibilityEvaluation {
  categoryId: string;
  categoryName: string;
  status: 'liberada' | 'bloqueada' | 'aguardando_analise';
  isEligible: boolean;
  isEnabledByDriver: boolean;
  isManuallyApprovedException: boolean;
  isManuallyBlocked: boolean;
  hasPendingExceptionRequest: boolean;
  reasons: string[];
  metCriteria: string[];
}

export interface DriverTermsSignature {
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
  driverSnapshot: {
    driverId: string;
    name: string;
    cpf: string;
    rawCpf?: string;
    cnh?: string;
    phone?: string;
    email?: string;
    city?: string;
    vehicle?: string;
    vehiclePlate?: string;
  };
  technicalEvidence: TermsSignatureTechnicalEvidence;
}

export interface DriverProfile {
  id: string;
  name: string;
  phone: string;
  email?: string;
  document: string; // CPF
  cnh: string;      // CNH
  cnhHasEar?: boolean; // CNH com Exerce Atividade Remunerada (EAR)
  photo?: string;
  cnhDocumentPhoto?: string;  // Foto da CNH enviada pelo motorista
  selfiePhoto?: string;       // Selfie capturada diretamente pela câmara
  kyc?: DriverKycData;        // Registro completo do processo KYC semiautomático
  termsSignature?: DriverTermsSignature | null; // Assinatura digital dos Termos de Uso
  vehicleBrand: string;
  vehicleModel: string;
  vehicleVersion?: string; // Versão do veículo (ex: XEi 2.0 Automático)
  vehicleColor: string;
  vehicleYear: string;
  vehiclePlate: string;
  vehicleCategory: string;
  vehiclePhoto?: string;
  crlvNumber?: string;     // Número ou código do CRLV
  crlvRegular?: boolean;   // Documentação CRLV regularizada
  hasFourDoors?: boolean;
  hasAirConditioning?: boolean;
  hasLargeTrunk?: boolean;
  hasLeatherSeats?: boolean;
  eligibleCategories?: string[];          // IDs de categorias habilitadas pelo motor automático + exceções
  enabledCategories?: string[];           // IDs de categorias ativas pelo motorista para receber chamadas
  disabledCategoryIds?: string[];         // IDs de categorias desmarcadas manualmente pelo motorista nas Preferências
  approvedCategoryExceptions?: string[];  // IDs de categorias liberadas manualmente por exceção pelo Admin
  blockedCategoryIds?: string[];          // IDs de categorias bloqueadas manualmente pelo Admin
  pendingCategoryRequests?: string[];     // IDs de categorias solicitadas pelo motorista aguardando análise
  city?: string;
  bio?: string;
  pixKey: string;
  pixType: 'cpf' | 'cnpj' | 'telefone' | 'email' | 'aleatoria';
  pixKeys?: DriverPixKey[];
  bankName?: string;
  bankAgency?: string;
  bankAccount?: string;
  efiAccountId?: string;
  autoPayoutWeekly?: boolean;
  acceptsCash?: boolean;
  approvalStatus: DriverApprovalStatus;
  rejectionReason?: string;
  financialBlocked?: boolean;
  financialBlockReason?: string;
  isOnline: boolean;
  currentRideId?: string | null;
  queuedRideId?: string | null;
  location?: {
    lat: number;
    lng: number;
    heading?: number;
    speedKmH?: number;
    updatedAt: string;
  } | null;
  rating: number;
  totalRides: number;
  vehicles?: DriverVehicle[];
  activeVehicleId?: string;
  profileChangeRequest?: ProfileChangeRequest | null;
  createdAt: string;
  updatedAt?: string;
}

export interface DriverVehicle {
  id: string;
  brand: string;
  model: string;
  version?: string;
  color: string;
  year: string;
  plate: string;
  vehiclePhoto?: string;
  crlvNumber: string;
  crlvDocumentPhoto: string;
  crlvRegular?: boolean;
  hasFourDoors: boolean;
  hasAirConditioning: boolean;
  hasLargeTrunk?: boolean;
  hasLeatherSeats?: boolean;
  eligibleCategories?: string[];
  enabledCategories?: string[];
  approvalStatus: 'pendente_aprovacao' | 'aprovado' | 'rejeitado';
  rejectionReason?: string;
  isActive?: boolean;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  checklist?: Record<string, boolean>;
  auditLogs?: KycAuditLog[];
}

export type LedgerEntryType =
  | 'ride_earning_credit'    // Crédito líquido de corrida digital (Pix/Cartão)
  | 'platform_commission'    // Comissão retida pela Kavro Drive
  | 'cash_ride_received'     // Valor recebido em mãos pelo motorista (Dinheiro)
  | 'cash_commission_debit'  // Débito de comissão da plataforma sobre corrida em dinheiro
  | 'debt_auto_offset'       // Abatimento automático de dívida com ganhos digitais
  | 'debt_pix_settlement'    // Quitação de dívida paga via Pix pelo motorista
  | 'payout_withdrawal'      // Saque / repasse para chave Pix do motorista
  | 'refund_debit'           // Estorno / reembolso de corrida
  | 'dispute_hold'           // Retenção por contestação / chargeback
  | 'admin_adjustment';      // Ajuste financeiro manual auditado

export interface FinancialLedgerEntry {
  id: string;
  idempotencyKey: string;
  driverId: string;
  driverName?: string;
  rideId?: string | null;
  rideCode?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  entryType: LedgerEntryType;
  paymentMethod: PaymentMethod;
  grossAmount: number;
  commissionPercent: number;
  commissionAmount: number;
  driverNetAmount: number;
  balanceDelta: number; // + crédito no saldo digital do motorista, - débito/saque
  balanceBucket: 'available' | 'pending' | 'debt' | 'platform';
  status: 'confirmado' | 'pendente_liberacao' | 'processando' | 'revertido';
  description: string;
  metadata?: {
    rideBaseTotal?: number;
    baseCommissionAmount?: number;
    cardFeePercent?: number;
    cardFeeAmount?: number;
    commissionFixed?: number;
    debtOffsetApplied?: number;
    autoSplit?: boolean;
    [key: string]: unknown;
  };
  createdAt: string;
}

export interface DriverWalletSummary {
  driverId: string;
  driverName?: string;
  availableBalance: number;       // Saldo livre para saque
  pendingBalance: number;         // Saldo pendente de liquidação do gateway
  totalGrossEarnings: number;     // Total bruto movimentado nas corridas do motorista
  totalNetEarnings: number;       // Total líquido ganho pelo motorista
  totalCashReceived: number;      // Total recebido diretamente em dinheiro
  totalCommissionPaid: number;    // Comissões já descontadas
  totalCommissionPending: number; // Comissões pendentes (dívida ativa)
  debtBalance: number;            // Saldo devedor atual com a plataforma
  maxDebtLimit: number;           // Limite de inadimplência configurado
  isDelinquent: boolean;          // Se atingiu o limite de dívida ou está bloqueado financeiramente
  financialBlocked: boolean;
  totalWithdrawn: number;         // Total já sacado
  pixKey?: string;
  pixType?: string;
  pixKeys?: DriverPixKey[];
  autoPayoutWeekly?: boolean;
  ledger: FinancialLedgerEntry[];
  withdrawals: WithdrawalRequest[];
}

export interface DriverPixKey {
  id: string;
  pixType: 'cpf' | 'cnpj' | 'telefone' | 'email' | 'aleatoria';
  pixKey: string;
  bankName: string;
  holderName: string;
  holderDocument: string;
  sameOwnershipConfirmed: boolean;
  isDefault?: boolean;
  createdAt: string;
}

export interface WithdrawalRequest {
  id: string;
  driverId: string;
  driverName: string;
  amount: number;
  feeAmount?: number;
  netPayoutAmount?: number;
  pixKey: string;
  pixType: string;
  status: 'solicitado' | 'processando' | 'pago' | 'rejeitado';
  ledgerEntryId?: string;
  notes?: string;
  payoutProviderTxId?: string | null;
  payoutStatus?: string | null;
  payoutProvider?: string | null;
  createdAt: string;
  processedAt?: string;
}

export interface PaymentTransaction {
  id: string;
  rideId: string;
  rideCode?: string;
  driverId?: string | null;
  driverName?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  method: PaymentMethod;
  status: PaymentStatus;
  estimatedAmount: number;
  finalAmount: number;
  paidAmount: number;
  refundedAmount: number;
  commissionPercent: number;
  commissionAmount: number;
  driverNetAmount: number;
  pixQrCode?: string;
  pixCopyPaste?: string;
  pixExpiresAt?: string;
  cardId?: string;
  cardLast4?: string;
  cardBrand?: string;
  gatewayAuthCode?: string;
  gatewayTxId: string;
  disputeReason?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Ride {
  id: string; // Ex: UP-001
  rideNumber?: number; // Sequencial: 1, 2, 3...
  rideCode?: string; // Exibição oficial: #UP - 001
  clientId?: string;
  clientName: string;
  clientPhone: string;
  clientPhoneMasked?: string;
  driverId?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  driverPhoneMasked?: string | null;
  boardingPin?: string | null;
  requiresBoardingPin?: boolean;
  driverPhoto?: string | null;
  driverVehicle?: string | null;
  driverPlate?: string | null;
  driverCarColor?: string | null;
  driverRating?: number | null;
  passengerRating?: number | null;
  passengerNotes?: string | null;
  clientRatedStars?: number | null;
  clientRating?: number | null;
  isQueuedRide?: boolean;
  queuedForDriverId?: string | null;
  declinedDriverIds?: string[];
  origin: LocationPoint;
  destination: LocationPoint;
  date: string; // YYYY-MM-DD (data atual da solicitação)
  time: string; // HH:mm (hora atual da solicitação)
  passengers: number;
  notes?: string;
  hasLuggage?: boolean;
  distanceKm: number;
  durationMin: number;
  category?: string;
  categoryName?: string;
  serviceType?: ServiceCategoryType;
  deliveryDetails?: RideDeliveryDetails | null;
  appliedFareSnapshot?: {
    categoryId: string;
    categoryName: string;
    categoryType?: ServiceCategoryType;
    deliveryDetails?: RideDeliveryDetails | null;
    baseFare: number;
    pricePerKm: number;
    pricePerMinute: number;
    minimumFare: number;
    multiplier: number;
    commissionPercent: number;
    commissionFixed?: number;
    rideBaseTotal?: number;
    cardFeePercent?: number;
    cardFeeAmount?: number;
    nightSurchargePercent?: number;
    city?: string;
  };
  baseFare: number;
  estimatedPrice?: number;
  totalPrice: number;
  paidAmount?: number;
  commissionPercent?: number;
  commissionFixed?: number;
  commissionAmount?: number;
  driverNetAmount?: number;
  cardFeePercent?: number;
  cardFeeAmount?: number;
  cancellationFeeApplied?: number;
  cancelledBy?: 'passenger' | 'driver' | 'admin';
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentTxId?: string;
  pixQrCode?: string;
  pixCopyPaste?: string;
  cardId?: string;
  cardLast4?: string;
  cardBrand?: string;
  status: RideStatus;
  driverNotes?: string;
  driverLocation?: {
    lat: number;
    lng: number;
    heading?: number;
    speedKmH?: number;
    updatedAt: string;
  };
  clientLocation?: {
    lat: number;
    lng: number;
    heading?: number;
    speedKmH?: number;
    updatedAt: string;
  };
  trackingToken?: string;
  trackingUrl?: string;
  rideCheck?: RideCheckAlertState | null;
  trustedContactsDispatches?: TrustedContactDispatchRecord[];
  safetyAudioRecords?: SafetyAudioIncidentRecord[];
  isManualBooking?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RideChatMessage {
  id: string;
  rideId: string;
  sender: 'driver' | 'client';
  senderName: string;
  text: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  notes?: string;
  type?: 'saida' | 'entrada';
  paymentMethod?: PaymentMethod;
  createdAt: string;
}

export interface SystemConfig {
  companyName: string;
  companyPhone: string;
  companyWhatsapp: string;
  companyEmail: string;
  driverName?: string;
  driverPhoto?: string;
  driverPhone?: string;
  driverVehicle?: string;
  driverPlate?: string;
  driverCarBrand?: string;
  driverCarModel?: string;
  driverCarColor?: string;
  driverCarYear?: string;
  driverCarCategory?: string;
  driverCarPhoto?: string;
  driverCarCity?: string;
  driverVehicleApiToken?: string;
  driverBio?: string;
  baseFare: number;
  pricePerKm: number;
  pricePerMinute: number;
  minimumFare: number;
  nightSurchargePercent: number; // ex: 20%
  nightStartHour: number; // 22
  nightEndHour: number; // 6
  advanceNoticeHours: number;
  bufferBetweenRidesMin: number;
  // Configurações financeiras da plataforma (Comissão, Gateway, Saques, Limite de Dívida e Repasses)
  platformCommissionPercent?: number;   // Ex: 20%
  platformCommissionFixed?: number;     // Ex: R$ 1.50 fixo por corrida (geral)
  paymentMethodCommissionPercents?: {
    pix?: number;
    cartao_credito?: number;
    cartao_debito?: number;
    apple_pay?: number;
    carteira?: number;
    dinheiro?: number;
  };
  gatewayFeePercents?: {
    pix?: number;
    cartao_credito?: number;
    cartao_debito?: number;
    apple_pay?: number;
  };
  cardFeePassThroughEnabled?: boolean;
  cardFeePassThroughPercent?: number;
  withdrawalFeePercent?: number;        // Taxa % cobrada por saque PIX do motorista (ex: 0%)
  withdrawalFeeFixed?: number;          // Taxa fixa em R$ por saque PIX do motorista (ex: R$ 0,00)
  cancellationFeeAmount?: number;       // Taxa padrão de cancelamento em R$ quando aplicável (ex: R$ 0,00)
  useCategoryCommissionOverride?: boolean; // Prioriza comissão individual da categoria quando ativo
  cashDeductFromBalanceFirst?: boolean;    // Padrão Uber: desconta comissão em dinheiro do saldo disponível antes de gerar dívida
  maxDriverDebtLimit?: number;          // Ex: R$ 100,00 (limite de dívida em dinheiro)
  autoBlockDelinquentDrivers?: boolean; // Bloqueia motorista inadimplente de receber corridas em dinheiro
  minWithdrawalAmount?: number;         // Saque mínimo, ex: R$ 20,00
  driverWithdrawalEnabled?: boolean;    // Habilita ou desabilita o botão de saque dos motoristas
  driverWithdrawalWeekdays?: number[];  // Dias permitidos para saque (0=Dom..6=Sáb), padrão [5] = Sexta-feira
  autoSplitPixEnabled?: boolean;        // Split automático no gateway
  cardSettlementDays?: number;          // Dias para liberação de cartão (0 = imediato no disponível, >0 = saldo pendente)
  applePayDisabled?: boolean;
  walletPaymentDisabled?: boolean;
  activePaymentMethods: PaymentMethod[];
  rideCategories?: RideCategoryConfig[];
  serviceCategories: Array<{
    id: string;
    name: string;
    multiplier: number;
    description: string;
    categoryType?: ServiceCategoryType;
    code?: string;
    subtitle?: string;
    active?: boolean;
    baseFare?: number;
    pricePerKm?: number;
    pricePerMinute?: number;
    minimumFare?: number;
    commissionPercent?: number;
    minVehicleYear?: number;
    minDriverRating?: number;
    minCompletedRides?: number;
    requireFourDoors?: boolean;
    requireAirConditioning?: boolean;
    requireRegularDoc?: boolean;
    requireEar?: boolean;
    requireLargeTrunk?: boolean;
    requireLeatherSeats?: boolean;
    allowedModels?: string[];
    allowedCities?: string[];
    cityOverrides?: CityCategoryPricingOverride[];
  }>;
  pixKey: string;
  pixType: 'cpf' | 'cnpj' | 'telefone' | 'email' | 'aleatoria';
  pixBeneficiary: string;
  googleMapsApiKey?: string;
  whatsappAutomations: {
    notifyNewBooking: boolean;
    notifyConfirmation: boolean;
    notifyOnTheWay: boolean;
    notifyCompleted: boolean;
  };
  operatingHours: {
    start: string;
    end: string;
    daysOpen: number[];
  };
  pushTemplates?: Record<string, PushTemplate>;
  partnerBanners?: HomePartnerBanner[];
  partnerShowOnSite?: boolean;
  partnerShowOnClientHome?: boolean;
  partnerShowOnClientRides?: boolean;
  partnerShowOnClientProfile?: boolean;
  partnerHideEmptyPlaceholder?: boolean;
}

export type PartnerBannerArea = 'site' | 'client_home' | 'client_rides' | 'client_profile';

export interface HomePartnerBanner {
  id: string;
  name?: string;
  kind: 'parceiro' | 'patrocinador';
  displayMode: 'logo' | 'banner';
  placement?: 'both' | 'site' | 'client';
  areas?: PartnerBannerArea[];
  imageUrl: string;
  subtitle?: string;
  linkUrl?: string;
  active: boolean;
  sortOrder?: number;
}

export type PushAudience = 'admin' | 'cliente' | 'motorista' | 'ambos' | 'todos';
export type PushTriggerEvent =
  | 'manual'
  | 'new_ride'
  | 'ride_confirmed'
  | 'driver_on_way'
  | 'ride_in_progress'
  | 'ride_finished'
  | 'ride_cancelled'
  | 'payment_approved'
  | 'pix_paid'
  | 'reminder';

export interface PushTemplate {
  enabled: boolean;
  title: string;
  message: string;
  minutesBefore?: number;
  audience?: PushAudience;
  event?: PushTriggerEvent;
  label?: string;
  isCustom?: boolean;
  url?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  type: 'ride_new' | 'ride_confirmed' | 'ride_cancelled' | 'payment' | 'sos_alert' | 'reminder' | 'admin_broadcast' | 'general' | string;
  rideId?: string;
  driverId?: string;
  audience?: 'admin' | 'cliente' | 'motorista' | 'ambos' | string;
  targetClientId?: string | null;
  targetDriverId?: string | null;
  url?: string | null;
}

export type AuditCategory =
  | 'taxas_financeiras'
  | 'tarifas_regras'
  | 'categorias'
  | 'financeiro_corridas'
  | 'saques_repasses'
  | 'motoristas_kyc'
  | 'acessos';

export interface AuditLogChange {
  field: string;
  label: string;
  before: string;
  after: string;
  summary: string;
}

export interface AuditLogRecord {
  id: number;
  auditCode: string;
  auditUuid: string;
  category: AuditCategory | string;
  categoryLabel: string;
  actionKey: string;
  title: string;
  summary: string;
  severity: 'info' | 'atencao' | 'critico';
  actorRole: 'admin_master' | 'motorista' | 'passageiro' | 'gateway' | 'sistema' | string;
  actorId?: string | null;
  actorName: string;
  actorEmail?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  entityLabel?: string | null;
  relatedIds?: Record<string, string | number | null | undefined>;
  changes: AuditLogChange[];
  ipAddress?: string | null;
  userAgent?: string | null;
  checksum: string;
  createdAt: string;
}

export interface AuditLogsResponse {
  ok: boolean;
  logs: AuditLogRecord[];
  total: number;
  latestDbId: number;
  summaryByCategory: Record<string, number>;
}

export interface EfiBankAdminConfig {
  enabled: boolean;
  sandbox: boolean;
  clientId: string;
  hasClientSecret: boolean;
  clientSecretMasked: string;
  pixKey: string;
  hasCertificate: boolean;
  certificateFileName: string;
  certificateBytes: number;
  hasCertificatePassphrase: boolean;
  hasPemCert: boolean;
  hasPemKey: boolean;
  useForPassengerPix: boolean;
  splitEnabled: boolean;
  driverPixSendEnabled: boolean;
  skipMtlsWebhook: boolean;
  webhookSecret: string;
  webhookUrl: string;
  lastTestedAt?: string | null;
  lastTestOk?: boolean | null;
  lastTestMessage?: string;
  updatedAt?: string | null;
  credentialsReady: boolean;
}

export interface EfiBankConfigUpdatePayload {
  enabled?: boolean;
  sandbox?: boolean;
  clientId?: string;
  clientSecret?: string;
  clearClientSecret?: boolean;
  pixKey?: string;
  certificateBase64?: string;
  certificateFileName?: string;
  certificatePassphrase?: string;
  removeCertificate?: boolean;
  pemCert?: string;
  pemKey?: string;
  useForPassengerPix?: boolean;
  splitEnabled?: boolean;
  driverPixSendEnabled?: boolean;
  skipMtlsWebhook?: boolean;
  regenerateWebhookSecret?: boolean;
  webhookUrl?: string;
}

export interface MercadoPagoAdminConfig {
  enabled: boolean;
  sandbox: boolean;
  publicKey: string;
  hasAccessToken: boolean;
  accessTokenMasked: string;
  hasWebhookSecret: boolean;
  webhookSecretMasked: string;
  useForCard: boolean;
  useForPassengerPix: boolean;
  statementDescriptor: string;
  webhookUrl: string;
  lastTestedAt?: string | null;
  lastTestOk?: boolean | null;
  lastTestMessage?: string;
  updatedAt?: string | null;
  credentialsReady: boolean;
  source?: 'env' | 'database' | 'default';
}

export interface MercadoPagoConfigUpdatePayload {
  enabled?: boolean;
  sandbox?: boolean;
  publicKey?: string;
  clearPublicKey?: boolean;
  accessToken?: string;
  clearAccessToken?: boolean;
  webhookSecret?: string;
  clearWebhookSecret?: boolean;
  useForCard?: boolean;
  useForPassengerPix?: boolean;
  statementDescriptor?: string;
  webhookUrl?: string;
}
