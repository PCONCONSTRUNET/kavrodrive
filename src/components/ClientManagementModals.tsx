import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  User, Phone, Mail, FileText, MapPin, Plus, Edit2, Trash2, 
  X, Check, Calendar, Clock, DollarSign, ChevronRight, Navigation,
  Sparkles, ExternalLink, ShieldCheck, AlertCircle, Award
} from 'lucide-react';
import { ClientProfile, Ride, SystemConfig } from '../types';
import { StorageService } from '../services/storage';
import { formatPhone, getCleanWhatsappNumber } from '../utils/format';
import { WhatsAppIcon } from './WhatsAppIcon';
import { PassengerTermsContractModal } from './PassengerTermsContractModal';

// ============================================================================
// MODAL 1: FORMULÁRIO DE CADASTRO / EDIÇÃO MANUAL DE CLIENTE
// ============================================================================
interface ClientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientToEdit?: ClientProfile | null;
  onSaved: (client: ClientProfile) => void;
}

export const ClientFormModal: React.FC<ClientFormModalProps> = ({
  isOpen,
  onClose,
  clientToEdit,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [favoriteAddress, setFavoriteAddress] = useState('');

  useEffect(() => {
    if (clientToEdit) {
      setName(clientToEdit.name || '');
      setPhone(clientToEdit.phone || '');
      setEmail(clientToEdit.email || '');
      setDocNumber(clientToEdit.document || '');
      setNotes(clientToEdit.notes || '');
      const primaryAddr = clientToEdit.savedAddresses?.[0]?.address || '';
      setFavoriteAddress(primaryAddr);
    } else {
      setName('');
      setPhone('');
      setEmail('');
      setDocNumber('');
      setNotes('');
      setFavoriteAddress('');
    }
  }, [clientToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const finalName = name.trim() || 'Cliente Manual';
    const finalPhone = phone.trim() || '';

    const savedAddresses = favoriteAddress.trim()
      ? [
          {
            id: `addr-${Date.now()}`,
            label: 'Principal',
            address: favoriteAddress.trim(),
            lat: 0,
            lng: 0,
          },
        ]
      : clientToEdit?.savedAddresses || [];

    const updatedClient: ClientProfile = {
      id: clientToEdit ? clientToEdit.id : `cli-${Date.now()}`,
      name: finalName,
      phone: finalPhone,
      email: email.trim() || undefined,
      document: docNumber.trim() || undefined,
      notes: notes.trim() || undefined,
      savedAddresses,
      createdAt: clientToEdit?.createdAt || new Date().toISOString(),
    };

    StorageService.saveClient(updatedClient);
    onSaved(updatedClient);
    onClose();
  };

  return createPortal(
    <div
      className="app-fullscreen-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="app-fullscreen-modal-card">
        {/* Cabeçalho */}
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid #F1F5F9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#FFFFFF',
          position: 'sticky',
          top: 0,
          zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              backgroundColor: '#121A21',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#76D800',
              flexShrink: 0
            }}>
              {clientToEdit ? <Edit2 size={18} /> : <User size={19} />}
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#121A21', lineHeight: 1.1 }}>
                {clientToEdit ? 'Editar Cliente' : 'Novo Cliente Manual'}
              </h3>
              <p style={{ fontSize: '0.7rem', color: '#64748B', marginTop: 1 }}>
                {clientToEdit ? 'Atualize os dados e notas' : 'Cadastre para agendamentos rápidos'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#F1F5F9',
              border: 'none',
              borderRadius: '50%',
              width: 32,
              height: 32,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748B'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Nome */}
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
              Nome Completo (opcional)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Ex: Carlos Eduardo Mendes (ou deixe em branco)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 34px',
                  borderRadius: 10,
                  border: '1px solid #CBD5E1',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  backgroundColor: '#FFFFFF',
                  color: '#121A21'
                }}
              />
              <User size={15} color="#94A3B8" style={{ position: 'absolute', left: 11, top: 11 }} />
            </div>
          </div>

          {/* WhatsApp / Celular */}
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
              WhatsApp / Celular (opcional)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="tel"
                placeholder="(48) 99999-9999 (opcional)"
                value={phone}
                inputMode="numeric"
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 34px',
                  borderRadius: 10,
                  border: '1px solid #CBD5E1',
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  backgroundColor: '#FFFFFF',
                  color: '#121A21'
                }}
              />
              <Phone size={15} color="#25D366" style={{ position: 'absolute', left: 11, top: 11 }} />
            </div>
          </div>

          {/* CPF / Documento (Opcional) */}
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
              CPF / Documento (opcional)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="000.000.000-00 (opcional)"
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 34px',
                  borderRadius: 10,
                  border: '1px solid #CBD5E1',
                  fontSize: '0.86rem',
                  backgroundColor: '#FFFFFF',
                  color: '#121A21'
                }}
              />
              <FileText size={15} color="#94A3B8" style={{ position: 'absolute', left: 11, top: 11 }} />
            </div>
          </div>

          {/* E-mail (Opcional) */}
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
              E-mail (opcional)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                placeholder="cliente@email.com (opcional)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 34px',
                  borderRadius: 10,
                  border: '1px solid #CBD5E1',
                  fontSize: '0.86rem',
                  backgroundColor: '#FFFFFF',
                  color: '#121A21'
                }}
              />
              <Mail size={15} color="#94A3B8" style={{ position: 'absolute', left: 11, top: 11 }} />
            </div>
          </div>

          {/* Endereço Frequente / Residência (Opcional) */}
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
              Endereço Frequente / Casa (opcional)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Ex: Rua Padre Hercílio Capeller, 120"
                value={favoriteAddress}
                onChange={(e) => setFavoriteAddress(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 34px',
                  borderRadius: 10,
                  border: '1px solid #CBD5E1',
                  fontSize: '0.86rem',
                  backgroundColor: '#FFFFFF',
                  color: '#121A21'
                }}
              />
              <MapPin size={15} color="#94A3B8" style={{ position: 'absolute', left: 11, top: 11 }} />
            </div>
          </div>

          {/* Observações Internas (Exclusivo Motorista) */}
          <div style={{ backgroundColor: '#F8FAFC', padding: '12px', borderRadius: 12, border: '1px solid #E2E8F0' }}>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: '#15803D', marginBottom: 4 }}>
              Observação Interna do Motorista (VIP, preferências, etc.)
            </label>
            <textarea
              rows={2}
              placeholder="Ex: Cliente VIP. Prefere ar condicionado ligado e silêncio. Costuma agendar viagens para o aeroporto."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                fontSize: '0.82rem',
                backgroundColor: '#FFFFFF',
                color: '#121A21',
                resize: 'none'
              }}
            />
          </div>

          {/* Botão de Salvar */}
          <button
            type="submit"
            className="btn-ios-primary"
            style={{
              width: '100%',
              height: 48,
              fontSize: '0.92rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderRadius: 14,
              boxShadow: '0 4px 16px rgba(118, 216, 0, 0.4)',
              marginTop: 4
            }}
          >
            <Check size={18} strokeWidth={2.8} />
            <span>{clientToEdit ? 'Salvar Alterações' : 'Cadastrar Cliente'}</span>
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
};

// ============================================================================
// MODAL 2: HISTÓRICO COMPLETO & FICHA DO CLIENTE
// ============================================================================
interface ClientDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: ClientProfile | null;
  rides: Ride[];
  config?: SystemConfig;
  onOpenRideDetail: (ride: Ride) => void;
  onScheduleForClient: (client: ClientProfile) => void;
  onEditClient: (client: ClientProfile) => void;
  onDeleteClient: (clientId: string) => void;
}

export const ClientDetailModal: React.FC<ClientDetailModalProps> = ({
  isOpen,
  onClose,
  client,
  rides,
  config,
  onOpenRideDetail,
  onScheduleForClient,
  onEditClient,
  onDeleteClient,
}) => {
  const [activeTab, setActiveTab] = useState<'resumo' | 'corridas' | 'financeiro'>('resumo');
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('resumo');
      setIsTermsModalOpen(false);
    }
  }, [isOpen, client?.id]);

  if (!isOpen || !client) return null;

  const clientCleanPhone = getCleanWhatsappNumber(client.phone);
  const clientRides = rides
    .filter(r => {
      const rideCleanPhone = getCleanWhatsappNumber(r.clientPhone);
      return (
        r.clientId === client.id ||
        (clientCleanPhone && rideCleanPhone && clientCleanPhone === rideCleanPhone) ||
        r.clientName.trim().toLowerCase() === client.name.trim().toLowerCase()
      );
    })
    .sort((a, b) => {
      const dateA = `${a.date}T${a.time}`;
      const dateB = `${b.date}T${b.time}`;
      return dateB.localeCompare(dateA);
    });

  const totalCompletedRides = clientRides.filter(r => r.status === 'finalizada').length;
  const totalCancelledRides = clientRides.filter(r => r.status === 'cancelada').length;
  const totalSpent = clientRides
    .filter(r => r.status !== 'cancelada')
    .reduce((acc, r) => acc + (r.totalPrice || 0), 0);
  const averageTicket = clientRides.length > 0 ? totalSpent / (clientRides.length || 1) : 0;

  const ratedRides = clientRides.filter(r => typeof r.driverRating === 'number' && r.driverRating > 0);
  const averageRating = ratedRides.length > 0
    ? (ratedRides.reduce((acc, r) => acc + (r.driverRating || 5), 0) / ratedRides.length).toFixed(2)
    : '5.00';

  const pixSpent = clientRides
    .filter(r => r.status !== 'cancelada' && r.paymentMethod === 'pix')
    .reduce((acc, r) => acc + (r.totalPrice || 0), 0);
  const cardSpent = clientRides
    .filter(r => r.status !== 'cancelada' && (r.paymentMethod === 'cartao_credito' || r.paymentMethod === 'cartao_debito' || r.paymentMethod === 'online'))
    .reduce((acc, r) => acc + (r.totalPrice || 0), 0);
  const cashSpent = clientRides
    .filter(r => r.status !== 'cancelada' && r.paymentMethod === 'dinheiro')
    .reduce((acc, r) => acc + (r.totalPrice || 0), 0);
  const refundedTotal = clientRides
    .filter(r => r.paymentStatus === 'reembolsado')
    .reduce((acc, r) => acc + (r.totalPrice || 0), 0);

  const initials = client.name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join('');

  return (
    <>
      {createPortal(
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}
        >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 920,
          maxHeight: '90vh',
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          border: '1px solid #E2E8F0',
          boxShadow: '0 24px 48px rgba(15, 23, 42, 0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Cabeçalho Corporativo Clean */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          backgroundColor: '#FFFFFF'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              backgroundColor: '#0F172A',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.95rem',
              fontWeight: 700,
              flexShrink: 0
            }}>
              {initials || <User size={20} />}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>
                  {client.name}
                </h3>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  backgroundColor: '#DCFCE7',
                  color: '#15803D'
                }}>
                  Passageiro Verificado
                </span>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  backgroundColor: '#F1F5F9',
                  color: '#334155'
                }}>
                  Nota {averageRating} ({ratedRides.length > 0 ? `${ratedRides.length} aval.` : 'Novo'})
                </span>
              </div>
              <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: 3 }}>
                ID: {client.id} • Telefone: {client.phone} {client.email ? `• ${client.email}` : ''}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a
              href={`https://wa.me/${clientCleanPhone}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#0F172A',
                fontSize: '0.74rem',
                fontWeight: 600,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <WhatsAppIcon size={13} />
              <span>WhatsApp</span>
            </a>

            <button
              type="button"
              onClick={() => onEditClient(client)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#334155',
                fontSize: '0.74rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Editar Cadastro
            </button>

            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Deseja realmente excluir o passageiro ${client.name}?`)) {
                  onDeleteClient(client.id);
                  onClose();
                }
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #FECACA',
                backgroundColor: '#FFFFFF',
                color: '#DC2626',
                fontSize: '0.74rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Excluir
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                border: '1px solid #E2E8F0',
                backgroundColor: '#F8FAFC',
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Barra de Abas do Dossiê do Passageiro */}
        <div style={{
          padding: '0 24px',
          borderBottom: '1px solid #E2E8F0',
          backgroundColor: '#F8FAFC',
          display: 'flex',
          gap: 20
        }}>
          {[
            { id: 'resumo', label: 'Cadastro, Avaliação & Resumo' },
            { id: 'corridas', label: `Histórico de Corridas (${clientRides.length})` },
            { id: 'financeiro', label: 'Pagamentos, Saques & Reembolsos' }
          ].map(tab => {
            const isTabActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  padding: '12px 4px',
                  border: 'none',
                  borderBottom: isTabActive ? '2px solid #0F172A' : '2px solid transparent',
                  backgroundColor: 'transparent',
                  color: isTabActive ? '#0F172A' : '#64748B',
                  fontSize: '0.78rem',
                  fontWeight: isTabActive ? 700 : 500,
                  cursor: 'pointer'
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Conteúdo Rolável */}
        <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* KPIs Superiores */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div style={{ padding: 14, borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
              <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 500 }}>Avaliação do Passageiro</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginTop: 4 }}>
                {averageRating} / 5.0
              </div>
              <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: 2 }}>
                {ratedRides.length > 0 ? `${ratedRides.length} avaliação(ões)` : 'Reputação padrão 5.0'}
              </div>
            </div>

            <div style={{ padding: 14, borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
              <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 500 }}>Total de Corridas</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginTop: 4 }}>
                {clientRides.length}
              </div>
              <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: 2 }}>
                Concluídas: {totalCompletedRides} • Canceladas: {totalCancelledRides}
              </div>
            </div>

            <div style={{ padding: 14, borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
              <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 500 }}>Volume Total Movimentado</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#15803D', marginTop: 4 }}>
                R$ {totalSpent.toFixed(2)}
              </div>
              <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: 2 }}>
                Ticket médio: R$ {averageTicket.toFixed(2)}
              </div>
            </div>

            <div style={{ padding: 14, borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
              <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 500 }}>Estornos / Reembolsos</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: refundedTotal > 0 ? '#DC2626' : '#0F172A', marginTop: 4 }}>
                R$ {refundedTotal.toFixed(2)}
              </div>
              <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: 2 }}>
                Créditos / devoluções PIX
              </div>
            </div>
          </div>

          {activeTab === 'resumo' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {/* Dados Cadastrais */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0F172A', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #F1F5F9' }}>
                  Dados Cadastrais do Passageiro
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.76rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Nome Completo:</span>
                    <strong style={{ color: '#0F172A' }}>{client.name}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>WhatsApp / Telefone:</span>
                    <strong style={{ color: '#0F172A' }}>{client.phone}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>E-mail:</span>
                    <strong style={{ color: '#0F172A' }}>{client.email || 'Não informado'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>CPF / Documento:</span>
                    <strong style={{ color: '#0F172A' }}>{client.document || 'Não informado'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Endereço Favorito:</span>
                    <strong style={{ color: '#0F172A', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {client.savedAddresses?.[0]?.address || 'Não cadastrado'}
                    </strong>
                  </div>
                  {client.notes && (
                    <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 6, backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', color: '#334155' }}>
                      <strong>Observações:</strong> {client.notes}
                    </div>
                  )}
                </div>
              </div>

              {/* Avaliações e Reputação */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0F172A', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #F1F5F9' }}>
                  Avaliações & Histórico de Atendimento
                </div>
                {ratedRides.length === 0 ? (
                  <div style={{ fontSize: '0.76rem', color: '#64748B', padding: '12px 0' }}>
                    Nenhuma avaliação específica registrada nas corridas deste passageiro. Nota base: <strong>5.00</strong>.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {ratedRides.slice(0, 5).map(r => (
                      <div key={r.id} style={{ padding: '8px 10px', borderRadius: 6, backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#0F172A' }}>
                          <span>Viagem {r.id} ({r.date.split('-').reverse().join('/')})</span>
                          <span>Nota: {r.driverRating} / 5</span>
                        </div>
                        {r.driverNotes && (
                          <div style={{ color: '#475569', marginTop: 4 }}>"{r.driverNotes}"</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div
                style={{
                  gridColumn: '1 / -1',
                  backgroundColor: '#FFFFFF',
                  border: client.termsSignature?.signed ? '1px solid #BBF7D0' : '1px solid #E2E8F0',
                  borderRadius: 10,
                  padding: 16
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <ShieldCheck size={16} color={client.termsSignature?.signed ? '#16A34A' : '#64748B'} />
                    <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A' }}>
                      Termos e Condições de Uso — Passageiro (Assinatura Digital)
                    </span>
                    {client.termsSignature?.signed ? (
                      <span style={{
                        padding: '3px 9px',
                        borderRadius: 999,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        backgroundColor: '#DCFCE7',
                        color: '#166534'
                      }}>
                        ✓ ASSINADO • v{client.termsSignature.contractVersion || '0.1'}
                      </span>
                    ) : client.termsAcceptedAt ? (
                      <span style={{
                        padding: '3px 9px',
                        borderRadius: 999,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        backgroundColor: '#FEF9C3',
                        color: '#854D0E'
                      }}>
                        ACEITE REGISTRADO (SEM CERTIFICADO SHA-256)
                      </span>
                    ) : (
                      <span style={{
                        padding: '3px 9px',
                        borderRadius: 999,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        backgroundColor: '#F1F5F9',
                        color: '#475569'
                      }}>
                        PENDENTE / CADASTRO LEGADO
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsTermsModalOpen(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 12px',
                      borderRadius: 8,
                      border: '1px solid #0F172A',
                      backgroundColor: '#0F172A',
                      color: '#FFFFFF',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <FileText size={13} />
                    {client.termsSignature?.signed ? 'Ver Contrato & Certificado / PDF' : 'Visualizar Minuta / PDF'}
                  </button>
                </div>

                {client.termsSignature?.signed ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
                    <div style={{ padding: '8px 10px', borderRadius: 8, backgroundColor: '#F0FDF4', border: '1px solid #DCFCE7' }}>
                      <div style={{ fontSize: '0.67rem', fontWeight: 700, color: '#15803D', textTransform: 'uppercase' }}>Código de Validação</div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A', fontFamily: 'monospace', marginTop: 2 }}>
                        {client.termsSignature.validationCode}
                      </div>
                    </div>
                    <div style={{ padding: '8px 10px', borderRadius: 8, backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '0.67rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Data/Hora do Aceite (Brasília)</div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0F172A', marginTop: 2 }}>
                        {client.termsSignature.signedAtBrasilia || client.termsSignature.signedAt}
                      </div>
                    </div>
                    <div style={{ padding: '8px 10px', borderRadius: 8, backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }} title={client.termsSignature.signatureHash}>
                      <div style={{ fontSize: '0.67rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Hash SHA-256</div>
                      <div style={{ fontSize: '0.76rem', fontWeight: 600, color: '#334155', fontFamily: 'monospace', marginTop: 2 }}>
                        {client.termsSignature.signatureHash ? `${client.termsSignature.signatureHash.slice(0, 22)}...` : '—'}
                      </div>
                    </div>
                    <div style={{ padding: '8px 10px', borderRadius: 8, backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '0.67rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Identificação no Aceite</div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0F172A', marginTop: 2 }}>
                        {client.termsSignature.passengerSnapshot?.name || client.name}
                        {client.termsSignature.passengerSnapshot?.cpf ? ` • CPF ${client.termsSignature.passengerSnapshot.cpf}` : ''}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.76rem', color: '#64748B', lineHeight: 1.5 }}>
                    {client.termsAcceptedAt
                      ? `Aceite registrado em ${new Date(client.termsAcceptedAt).toLocaleString('pt-BR')} sem metadados SHA-256 estendidos.`
                      : 'Passageiro cadastrado manualmente pelo painel administrativo ou antes da exigência do certificado eletrônico SHA-256.'}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'corridas' && (
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
              {clientRides.length === 0 ? (
                <div style={{ padding: '36px 20px', textAlign: 'center', color: '#64748B', fontSize: '0.8rem' }}>
                  Nenhuma corrida registrada para este passageiro.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.76rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                        <th style={{ padding: '10px 14px' }}>Corrida</th>
                        <th style={{ padding: '10px 12px' }}>Data / Hora</th>
                        <th style={{ padding: '10px 12px' }}>Trajeto (Origem → Destino)</th>
                        <th style={{ padding: '10px 12px' }}>Motorista</th>
                        <th style={{ padding: '10px 12px' }}>Método</th>
                        <th style={{ padding: '10px 12px' }}>Status</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Valor Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientRides.map(r => (
                        <tr
                          key={r.id}
                          onClick={() => {
                            onClose();
                            onOpenRideDetail(r);
                          }}
                          style={{ borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}
                        >
                          <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0F172A' }}>{r.id}</td>
                          <td style={{ padding: '10px 12px', color: '#475569' }}>
                            {r.date.split('-').reverse().join('/')} às {r.time}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#334155', maxWidth: 260 }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.origin?.address} → {r.destination?.address}
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px', color: '#334155' }}>
                            {r.driverName || 'Frota Kavro'}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#334155', textTransform: 'uppercase' }}>
                            {r.paymentMethod}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              backgroundColor: r.status === 'finalizada' ? '#DCFCE7' : r.status === 'cancelada' ? '#FEE2E2' : '#EFF6FF',
                              color: r.status === 'finalizada' ? '#15803D' : r.status === 'cancelada' ? '#DC2626' : '#1D4ED8'
                            }}>
                              {r.status}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>
                            R$ {(r.totalPrice || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'financeiro' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div style={{ padding: 14, borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#FFFFFF' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Pagamentos via PIX</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A', marginTop: 4 }}>R$ {pixSpent.toFixed(2)}</div>
                </div>
                <div style={{ padding: 14, borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#FFFFFF' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Pagamentos via Cartão</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A', marginTop: 4 }}>R$ {cardSpent.toFixed(2)}</div>
                </div>
                <div style={{ padding: 14, borderRadius: 8, border: '1px solid #E2E8F0', backgroundColor: '#FFFFFF' }}>
                  <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Pagamentos em Dinheiro</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A', marginTop: 4 }}>R$ {cashSpent.toFixed(2)}</div>
                </div>
              </div>

              <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '0.78rem', fontWeight: 600, color: '#0F172A' }}>
                  Transações, Estornos e Reembolsos do Cliente
                </div>
                {clientRides.length === 0 ? (
                  <div style={{ padding: '32px 20px', textAlign: 'center', color: '#64748B', fontSize: '0.78rem' }}>
                    Nenhuma movimentação financeira registrada para este cliente.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.76rem' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#FFFFFF', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                          <th style={{ padding: '10px 14px' }}>Data</th>
                          <th style={{ padding: '10px 12px' }}>Referência</th>
                          <th style={{ padding: '10px 12px' }}>Meio de Pagamento</th>
                          <th style={{ padding: '10px 12px' }}>Status Financeiro</th>
                          <th style={{ padding: '10px 14px', textAlign: 'right' }}>Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientRides.map(r => (
                          <tr key={r.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '10px 14px', color: '#475569' }}>
                              {r.date.split('-').reverse().join('/')} {r.time}
                            </td>
                            <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0F172A' }}>
                              Corrida {r.id}
                            </td>
                            <td style={{ padding: '10px 12px', color: '#334155', textTransform: 'uppercase' }}>
                              {r.paymentMethod}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: 4,
                                fontSize: '0.68rem',
                                fontWeight: 600,
                                backgroundColor: r.paymentStatus === 'pago' ? '#DCFCE7' : '#FEF3C7',
                                color: r.paymentStatus === 'pago' ? '#15803D' : '#B45309'
                              }}>
                                {r.paymentStatus}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>
                              R$ {(r.totalPrice || 0).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
      )}
      <PassengerTermsContractModal
        isOpen={isOpen && isTermsModalOpen}
        onClose={() => setIsTermsModalOpen(false)}
        mode="admin"
        client={client}
        config={config}
      />
    </>
  );
};
