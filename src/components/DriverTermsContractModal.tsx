import React, { useMemo } from 'react';
import { DriverProfile, DriverTermsSignature, SystemConfig } from '../types';
import {
  DRIVER_TERMS_CONTRACT_ID,
  DRIVER_TERMS_CONTRACT_VERSION,
  DRIVER_TERMS_CONTRACT_DATE,
  DRIVER_TERMS_CONTRACT_TITLE,
  parseDriverTermsSections
} from '../utils/driverTermsContract';
import { formatCPF, formatPhone } from '../utils/format';
import { ContractSignatureModal } from './ContractSignatureModal';

interface DriverTermsContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: 'driver' | 'admin';
  config?: SystemConfig;
  driver?: Partial<DriverProfile> | null;
  draftSigner?: {
    name?: string;
    cpf?: string;
    cnh?: string;
    phone?: string;
    email?: string;
    city?: string;
    vehicle?: string;
    plate?: string;
  };
  onAccept?: () => void;
}

export const DriverTermsContractModal: React.FC<DriverTermsContractModalProps> = ({
  isOpen,
  onClose,
  mode = 'driver',
  config,
  driver,
  draftSigner,
  onAccept
}) => {
  const sections = useMemo(() => parseDriverTermsSections(), []);

  if (!isOpen) return null;

  const sig: DriverTermsSignature | null = driver?.termsSignature || null;
  const signerName = sig?.driverSnapshot?.name || driver?.name || draftSigner?.name || 'Não informado';
  const rawCpf = sig?.driverSnapshot?.cpf || driver?.document || draftSigner?.cpf || '';
  const signerCpf = rawCpf ? formatCPF(rawCpf) : 'Não informado';
  const signerCnh = sig?.driverSnapshot?.cnh || driver?.cnh || draftSigner?.cnh || 'Não informada';
  const rawPhone = sig?.driverSnapshot?.phone || driver?.phone || draftSigner?.phone || '';
  const signerPhone = rawPhone ? formatPhone(rawPhone) : 'Não informado';
  const signerEmail = sig?.driverSnapshot?.email || driver?.email || draftSigner?.email || 'Não informado';
  const signerCity = sig?.driverSnapshot?.city || driver?.city || draftSigner?.city || 'Não informada';
  const signerVehicle =
    sig?.driverSnapshot?.vehicle ||
    [driver?.vehicleBrand, driver?.vehicleModel, driver?.vehicleYear].filter(Boolean).join(' ') ||
    draftSigner?.vehicle ||
    'Não informado';
  const signerPlate = sig?.driverSnapshot?.vehiclePlate || driver?.vehiclePlate || draftSigner?.plate || '—';

  return (
    <ContractSignatureModal
      isOpen={isOpen}
      onClose={onClose}
      isAdminMode={mode === 'admin'}
      config={config}
      headerTitle={mode === 'admin' ? 'Contrato & Termo Assinado Digitalmente' : 'Termos e Condições — Motorista Parceiro'}
      contractId={DRIVER_TERMS_CONTRACT_ID}
      contractVersion={DRIVER_TERMS_CONTRACT_VERSION}
      contractDate={DRIVER_TERMS_CONTRACT_DATE}
      contractTitle={DRIVER_TERMS_CONTRACT_TITLE}
      contractDisclaimerSubtitle="Situação: Documento em desenvolvimento — sujeito à validação por advogado habilitado antes da utilização comercial."
      roleLabel="Motorista Parceiro"
      signerPrimaryName={signerName}
      signerPrimaryCpf={signerCpf}
      signerSummaryLine={`Nome: ${signerName} • CPF: ${signerCpf} • Veículo: ${signerVehicle} (${signerPlate})`}
      signerFields={[
        { label: 'Nome Completo', value: signerName },
        { label: 'CPF', value: signerCpf, monospace: true },
        { label: 'CNH', value: signerCnh },
        { label: 'WhatsApp', value: signerPhone },
        { label: 'E-mail', value: signerEmail },
        { label: 'Cidade Base', value: signerCity },
        { label: 'Veículo', value: signerVehicle },
        { label: 'Placa', value: signerPlate, monospace: true }
      ]}
      signature={sig}
      sections={sections}
      onAccept={onAccept}
    />
  );
};
