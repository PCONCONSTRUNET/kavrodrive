import React, { useMemo } from 'react';
import { ClientProfile, PassengerTermsSignature, SystemConfig } from '../types';
import {
  PASSENGER_TERMS_CONTRACT_ID,
  PASSENGER_TERMS_CONTRACT_VERSION,
  PASSENGER_TERMS_CONTRACT_DATE,
  PASSENGER_TERMS_CONTRACT_TITLE,
  parsePassengerTermsSections
} from '../utils/passengerTermsContract';
import { formatCPF, formatPhone } from '../utils/format';
import { ContractSignatureModal } from './ContractSignatureModal';

interface PassengerTermsContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: 'passenger' | 'admin';
  config?: SystemConfig;
  client?: Partial<ClientProfile> | null;
  draftSigner?: {
    name?: string;
    cpf?: string;
    phone?: string;
    email?: string;
  };
  onAccept?: () => void;
}

export const PassengerTermsContractModal: React.FC<PassengerTermsContractModalProps> = ({
  isOpen,
  onClose,
  mode = 'passenger',
  config,
  client,
  draftSigner,
  onAccept
}) => {
  const sections = useMemo(() => parsePassengerTermsSections(), []);

  if (!isOpen) return null;

  const sig: PassengerTermsSignature | null = client?.termsSignature || null;
  const signerName = sig?.passengerSnapshot?.name || client?.name || draftSigner?.name || 'Não informado';
  const rawCpf = sig?.passengerSnapshot?.rawCpf || client?.document || draftSigner?.cpf || '';
  const signerCpf = rawCpf ? formatCPF(rawCpf) : (sig?.passengerSnapshot?.cpf || 'Não informado');
  const rawPhone = sig?.passengerSnapshot?.phone || client?.phone || draftSigner?.phone || '';
  const signerPhone = rawPhone ? formatPhone(rawPhone) : 'Não informado';
  const signerEmail = sig?.passengerSnapshot?.email || client?.email || draftSigner?.email || 'Não informado';
  const signerAccountId = sig?.passengerSnapshot?.clientId || client?.id || 'Em criação';

  return (
    <ContractSignatureModal
      isOpen={isOpen}
      onClose={onClose}
      isAdminMode={mode === 'admin'}
      config={config}
      headerTitle={mode === 'admin' ? 'Termo Assinado Digitalmente — Passageiro' : 'Termos e Condições Gerais de Uso — Passageiro'}
      contractId={PASSENGER_TERMS_CONTRACT_ID}
      contractVersion={PASSENGER_TERMS_CONTRACT_VERSION}
      contractDate={PASSENGER_TERMS_CONTRACT_DATE}
      contractTitle={PASSENGER_TERMS_CONTRACT_TITLE}
      contractDisclaimerSubtitle="Abrangência: Aplicativo de passageiros KAVRO DRIVE — Brasil • Minuta em desenvolvimento sujeita à revisão jurídica."
      roleLabel="Passageiro"
      signerPrimaryName={signerName}
      signerPrimaryCpf={signerCpf}
      signerSummaryLine={`Nome: ${signerName} • WhatsApp: ${signerPhone} • CPF: ${signerCpf}${signerEmail !== 'Não informado' ? ` • E-mail: ${signerEmail}` : ''}`}
      signerFields={[
        { label: 'Nome Completo', value: signerName },
        { label: 'CPF', value: signerCpf, monospace: true },
        { label: 'WhatsApp / Telefone', value: signerPhone },
        { label: 'E-mail', value: signerEmail },
        { label: 'ID da Conta', value: signerAccountId, monospace: true }
      ]}
      signature={sig}
      sections={sections}
      onAccept={onAccept}
    />
  );
};

