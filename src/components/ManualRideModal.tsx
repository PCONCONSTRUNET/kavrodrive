import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Plus, Calendar, Clock, MapPin, User, Phone, 
  DollarSign, Check, X, Navigation, ChevronRight, Car, ShieldCheck, Sparkles, Users, Edit2, Trash2
} from 'lucide-react';
import { Ride, SystemConfig, LocationPoint, PaymentMethod, PaymentStatus, RideStatus } from '../types';
import { calculateHaversineDistance, estimateDurationMinutes } from '../utils/geo';
import { calculateRidePrice, StorageService } from '../services/storage';
import { AddressPickerModal } from '../components/AddressPickerModal';
import { formatPhone, formatRideCode, parseCurrencyInput, parseCurrencyToFloat } from '../utils/format';

interface ManualRideModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SystemConfig;
  onRideCreated: (ride: Ride) => void;
  initialDate?: string;
  initialTime?: string;
  initialClientName?: string;
  initialClientPhone?: string;
  editingRide?: Ride | null;
  onDeleteRide?: (rideId: string) => void;
}

export const ManualRideModal: React.FC<ManualRideModalProps> = ({
  isOpen,
  onClose,
  config,
  onRideCreated,
  initialDate,
  initialTime,
  initialClientName,
  initialClientPhone,
  editingRide,
  onDeleteRide,
}) => {
  const [clientName, setClientName] = useState(initialClientName || '');
  const [clientPhone, setClientPhone] = useState(initialClientPhone || '');
  const [origin, setOrigin] = useState<LocationPoint | null>(null);
  const [destination, setDestination] = useState<LocationPoint | null>(null);
  const [date, setDate] = useState(initialDate || new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState(initialTime || '14:00');
  const [passengers, setPassengers] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<string>('standard');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pago');
  const [status, setStatus] = useState<RideStatus>('confirmada');
  const [manualPrice, setManualPrice] = useState<string>('');
  const [useAutoPrice, setUseAutoPrice] = useState(true);
  const [driverNotes, setDriverNotes] = useState('');

  const [pickingOrigin, setPickingOrigin] = useState(false);
  const [pickingDestination, setPickingDestination] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editingRide) {
        setClientName(editingRide.clientName || '');
        setClientPhone(editingRide.clientPhone || '');
        setOrigin(editingRide.origin);
        setDestination(editingRide.destination);
        setDate(editingRide.date);
        setTime(editingRide.time);
        setPassengers(editingRide.passengers || 1);
        setSelectedCategory(editingRide.category || 'standard');
        setPaymentMethod(editingRide.paymentMethod || 'pix');
        setPaymentStatus(editingRide.paymentStatus || 'pago');
        setStatus(editingRide.status || 'confirmada');
        setManualPrice(editingRide.totalPrice ? editingRide.totalPrice.toFixed(2) : '');
        setUseAutoPrice(false);
        setDriverNotes(editingRide.driverNotes || '');
      } else {
        if (initialDate) setDate(initialDate);
        if (initialTime) setTime(initialTime);
        if (initialClientName) setClientName(initialClientName);
        if (initialClientPhone) setClientPhone(initialClientPhone);
        if (!editingRide) {
          setUseAutoPrice(true);
        }
      }
    }
  }, [isOpen, editingRide, initialDate, initialTime, initialClientName, initialClientPhone]);

  if (!isOpen) return null;

  const distanceKm = origin && destination 
    ? calculateHaversineDistance(origin.lat, origin.lng, destination.lat, destination.lng)
    : 5;
  const durationMin = origin && destination 
    ? estimateDurationMinutes(distanceKm)
    : 15;

  const pricing = calculateRidePrice(distanceKm, durationMin, time, config, selectedCategory);
  const autoPrice = pricing.totalPrice;
  const finalPrice = useAutoPrice ? autoPrice : (parseCurrencyToFloat(manualPrice) || autoPrice);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!origin || !destination) {
      alert('Por favor, selecione os pontos de embarque e destino.');
      return;
    }

    const finalClientName = clientName.trim() || 'Passageiro Particular';
    const finalClientPhone = clientPhone.trim() || '';

    const nextId = editingRide ? editingRide.id : StorageService.getNextRideId();
    const nextNum = editingRide?.rideNumber || parseInt(nextId.replace(/\D/g, ''), 10) || 1;
    const newRide: Ride = {
      id: nextId,
      rideNumber: nextNum,
      rideCode: formatRideCode({ id: nextId, rideNumber: nextNum }),
      clientId: editingRide?.clientId,
      clientName: finalClientName,
      clientPhone: finalClientPhone,
      origin,
      destination,
      date,
      time,
      passengers,
      distanceKm,
      durationMin,
      category: selectedCategory,
      baseFare: config.baseFare,
      totalPrice: finalPrice,
      paymentMethod,
      paymentStatus,
      status,
      driverNotes,
      isManualBooking: true,
      createdAt: editingRide ? editingRide.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    StorageService.saveRide(newRide);
    onRideCreated(newRide);
    onClose();
  };

  return createPortal(
    <div 
      className="app-fullscreen-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <AddressPickerModal
        isOpen={pickingOrigin}
        onClose={() => setPickingOrigin(false)}
        title="Local de Embarque (GPS)"
        onSelect={(p) => setOrigin(p)}
      />
      <AddressPickerModal
        isOpen={pickingDestination}
        onClose={() => setPickingDestination(false)}
        title="Destino da Corrida (GPS)"
        onSelect={(p) => setDestination(p)}
      />

      <div className="app-fullscreen-modal-card">
        {/* Cabeçalho Compacto & Elegante */}
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid #F1F5F9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#ffffff',
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
              {editingRide ? <Edit2 size={18} /> : <Plus size={20} strokeWidth={2.8} />}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#121A21', lineHeight: 1.1 }}>
                  {editingRide ? `Editar Corrida (${formatRideCode(editingRide)})` : 'Nova Corrida Manual'}
                </h3>
                <span style={{ fontSize: '0.62rem', fontWeight: 800, backgroundColor: 'rgba(118, 216, 0, 0.18)', color: '#15803D', padding: '1px 6px', borderRadius: 8 }}>
                  ADMIN
                </span>
              </div>
              <p style={{ fontSize: '0.7rem', color: '#64748B', marginTop: 1 }}>
                {editingRide ? 'Altere horário, trajeto, valores ou status' : 'Agende por WhatsApp, telefone ou balcão'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {editingRide && onDeleteRide && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Tem certeza que deseja excluir a corrida ${editingRide.id}?`)) {
                    onDeleteRide(editingRide.id);
                    onClose();
                  }
                }}
                title="Excluir corrida"
                style={{
                  background: '#FEE2E2',
                  border: 'none',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#DC2626',
                  flexShrink: 0
                }}
              >
                <Trash2 size={15} />
              </button>
            )}

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
                color: '#64748B',
                flexShrink: 0
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Formulário Polido */}
        <form onSubmit={handleSubmit} style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Seção 1: Dados do Passageiro (Layout Limpo sem Aperto e 100% Opcional) */}
          <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: 16, border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Dados do Passageiro (opcional)
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 3 }}>
                Nome do Passageiro (opcional)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Nome do cliente (ou deixe em branco)"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px 9px 34px',
                    borderRadius: 10,
                    border: '1px solid #CBD5E1',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    backgroundColor: '#ffffff',
                    color: '#121A21'
                  }}
                />
                <User size={15} color="#94A3B8" style={{ position: 'absolute', left: 11, top: 11 }} />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 3 }}>
                WhatsApp / Celular (opcional)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="tel"
                  placeholder="(48) 99999-9999 (opcional)"
                  value={clientPhone}
                  inputMode="numeric"
                  onChange={(e) => setClientPhone(formatPhone(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '9px 12px 9px 34px',
                    borderRadius: 10,
                    border: '1px solid #CBD5E1',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    backgroundColor: '#ffffff',
                    color: '#121A21'
                  }}
                />
                <Phone size={15} color="#25D366" style={{ position: 'absolute', left: 11, top: 11 }} />
              </div>
            </div>
          </div>

          {/* Seção 2: Categoria do Serviço (Pills Modernos) */}
          <div>
            <label style={{ display: 'block', fontSize: '0.66rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.04em' }}>
              Categoria do Veículo / Serviço
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {config.serviceCategories.filter(cat => cat.id !== 'viagem').map((cat) => {
                const isSelected = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 12,
                      border: isSelected ? '2px solid #76D800' : '1px solid #E2E8F0',
                      backgroundColor: isSelected ? 'rgba(118, 216, 0, 0.08)' : '#ffffff',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                  >
                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: isSelected ? '#121A21' : '#334155' }}>
                      {cat.name}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: isSelected ? '#15803D' : '#64748B', fontWeight: 700, marginTop: 1 }}>
                      {cat.id === 'aeroporto' ? 'Identificador de Voo' : 'Tarifa Geral Padrão'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Seção 3: Trajeto no GPS (Stepper Unificado & Bonito) */}
          <div>
            <label style={{ display: 'block', fontSize: '0.66rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.04em' }}>
              Trajeto (GPS / Endereço)
            </label>
            <div style={{
              backgroundColor: '#F8FAFC',
              borderRadius: 14,
              border: '1px solid #E2E8F0',
              padding: '6px 12px',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* Ponto de Embarque */}
              <div
                onClick={() => setPickingOrigin(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 0',
                  borderBottom: '1px solid #F1F5F9',
                  cursor: 'pointer'
                }}
              >
                <div style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(118, 216, 0, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#76D800' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.62rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Embarque</div>
                  <div style={{
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: origin ? '#121A21' : '#94A3B8',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {origin ? origin.address : 'Toque para selecionar embarque...'}
                  </div>
                </div>
                <ChevronRight size={15} color="#94A3B8" />
              </div>

              {/* Ponto de Destino */}
              <div
                onClick={() => setPickingDestination(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 0',
                  cursor: 'pointer'
                }}
              >
                <div style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(18, 26, 33, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <MapPin size={10} color="#121A21" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.62rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Destino</div>
                  <div style={{
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: destination ? '#121A21' : '#94A3B8',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {destination ? destination.address : 'Toque para selecionar destino...'}
                  </div>
                </div>
                <ChevronRight size={15} color="#94A3B8" />
              </div>
            </div>
          </div>

          {/* Seção 4: Data e Horário (2 Colunas Perfeitas) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#475569', marginBottom: 3 }}>
                Data da Viagem
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 8px 8px 30px',
                    borderRadius: 10,
                    border: '1px solid #CBD5E1',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    backgroundColor: '#FFFFFF',
                    color: '#121A21'
                  }}
                  required
                />
                <Calendar size={14} color="#76D800" style={{ position: 'absolute', left: 9, top: 10 }} />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#475569', marginBottom: 3 }}>
                Horário
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 8px 8px 30px',
                    borderRadius: 10,
                    border: '1px solid #CBD5E1',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    backgroundColor: '#FFFFFF',
                    color: '#121A21'
                  }}
                  required
                />
                <Clock size={14} color="#76D800" style={{ position: 'absolute', left: 9, top: 10 }} />
              </div>
            </div>
          </div>

          {/* Seção 5: Número de Passageiros (Chips Rápidos em vez de Dropdown Cortado!) */}
          <div>
            <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
              Passageiros
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {[1, 2, 3, 4].map(num => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setPassengers(num)}
                  style={{
                    padding: '7px 4px',
                    borderRadius: 10,
                    border: passengers === num ? '2px solid #76D800' : '1px solid #E2E8F0',
                    backgroundColor: passengers === num ? 'rgba(118, 216, 0, 0.1)' : '#FFFFFF',
                    color: passengers === num ? '#121A21' : '#64748B',
                    fontWeight: passengers === num ? 900 : 700,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4
                  }}
                >
                  <Users size={12} color={passengers === num ? '#15803D' : '#94A3B8'} />
                  <span>{num} {num === 1 ? 'pes.' : 'pes.'}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Seção 6: Forma de Pagamento e Status do Pagamento (Alinhados Perfeitamente) */}
          <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: 16, border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Forma de Pagamento
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => setPaymentStatus('pago')}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 6,
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: paymentStatus === 'pago' ? '#DCFCE7' : '#E2E8F0',
                    color: paymentStatus === 'pago' ? '#15803D' : '#64748B'
                  }}
                >
                  ✓ Pago
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentStatus('pendente')}
                  style={{
                    padding: '3px 8px',
                    borderRadius: 6,
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: paymentStatus === 'pendente' ? '#FEF3C7' : '#E2E8F0',
                    color: paymentStatus === 'pendente' ? '#B45309' : '#64748B'
                  }}
                >
                  Pendente
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {/* PIX */}
              <div
                onClick={() => setPaymentMethod('pix')}
                style={{
                  padding: '8px 4px',
                  borderRadius: 12,
                  border: paymentMethod === 'pix' ? '2px solid #76D800' : '1px solid #CBD5E1',
                  backgroundColor: paymentMethod === 'pix' ? 'rgba(118, 216, 0, 0.1)' : '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                  boxShadow: paymentMethod === 'pix' ? '0 2px 8px rgba(118, 216, 0, 0.2)' : 'none'
                }}
              >
                <img width="24" height="24" src="https://img.icons8.com/fluency/48/pix.png" alt="pix" />
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#121A21' }}>PIX</span>
              </div>

              {/* Cartão */}
              <div
                onClick={() => setPaymentMethod('cartao_credito')}
                style={{
                  padding: '8px 4px',
                  borderRadius: 12,
                  border: paymentMethod === 'cartao_credito' ? '2px solid #76D800' : '1px solid #CBD5E1',
                  backgroundColor: paymentMethod === 'cartao_credito' ? 'rgba(118, 216, 0, 0.1)' : '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                  boxShadow: paymentMethod === 'cartao_credito' ? '0 2px 8px rgba(118, 216, 0, 0.2)' : 'none'
                }}
              >
                <img width="24" height="24" src="https://img.icons8.com/color/48/bank-card-back-side.png" alt="cartão" />
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#121A21' }}>Cartão</span>
              </div>

              {/* Dinheiro */}
              <div
                onClick={() => setPaymentMethod('dinheiro')}
                style={{
                  padding: '8px 4px',
                  borderRadius: 12,
                  border: paymentMethod === 'dinheiro' ? '2px solid #76D800' : '1px solid #CBD5E1',
                  backgroundColor: paymentMethod === 'dinheiro' ? 'rgba(118, 216, 0, 0.1)' : '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                  boxShadow: paymentMethod === 'dinheiro' ? '0 2px 8px rgba(118, 216, 0, 0.2)' : 'none'
                }}
              >
                <img width="24" height="24" src="https://img.icons8.com/fluency/48/money.png" alt="dinheiro" />
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#121A21' }}>Dinheiro</span>
              </div>
            </div>
          </div>

          {/* Seção 7: Preço da Viagem (Card Escuro Limpo & Compacto) */}
          <div style={{
            background: '#121A21',
            borderRadius: 14,
            padding: '12px 14px',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <span style={{ fontSize: '0.66rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Valor da Corrida
              </span>
              <div style={{ fontSize: '0.68rem', color: '#76D800' }}>
                {distanceKm.toFixed(1)} km • ~{durationMin} min
              </div>
              {useAutoPrice ? (
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#76D800', lineHeight: 1.1, marginTop: 2 }}>
                  R$ {autoPrice.toFixed(2)}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <span style={{ color: '#76D800', fontWeight: 900, fontSize: '1rem' }}>R$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0,00"
                    value={manualPrice}
                    onChange={(e) => setManualPrice(parseCurrencyInput(e.target.value))}
                    style={{
                      width: 80,
                      padding: '4px 8px',
                      borderRadius: 8,
                      border: '1px solid #334155',
                      backgroundColor: '#1E293B',
                      color: '#ffffff',
                      fontSize: '0.95rem',
                      fontWeight: 800
                    }}
                  />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <div style={{ display: 'flex', gap: 4, backgroundColor: 'rgba(255,255,255,0.08)', padding: 2, borderRadius: 8 }}>
                <button
                  type="button"
                  onClick={() => setUseAutoPrice(true)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: useAutoPrice ? '#76D800' : 'transparent',
                    color: useAutoPrice ? '#121A21' : '#94A3B8'
                  }}
                >
                  Auto
                </button>
                <button
                  type="button"
                  onClick={() => setUseAutoPrice(false)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 6,
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: !useAutoPrice ? '#76D800' : 'transparent',
                    color: !useAutoPrice ? '#121A21' : '#94A3B8'
                  }}
                >
                  Manual
                </button>
              </div>
            </div>
          </div>

          {/* Observações Opcionais */}
          <div>
            <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, color: '#475569', marginBottom: 3 }}>
              Observações (opcional)
            </label>
            <input
              type="text"
              placeholder="Ex: Cliente aguarda na portaria"
              value={driverNotes}
              onChange={(e) => setDriverNotes(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid #CBD5E1',
                fontSize: '0.82rem',
                backgroundColor: '#F8FAFC',
                color: '#121A21'
              }}
            />
          </div>

          {/* Botão de Confirmação */}
          <button
            type="submit"
            className="btn-ios-primary"
            style={{
              width: '100%',
              height: 48,
              fontSize: '0.94rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderRadius: 14,
              boxShadow: '0 4px 16px rgba(118, 216, 0, 0.4)',
              margin: 0
            }}
          >
            <Check size={18} strokeWidth={2.8} />
            <span>{editingRide ? 'Salvar Alterações da Corrida' : 'Salvar e Agendar Corrida'}</span>
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
};
