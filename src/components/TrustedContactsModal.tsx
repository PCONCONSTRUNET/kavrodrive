import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ShieldCheck, X, Plus, Trash2, Check, Moon, BellRing, Send, ExternalLink, ChevronDown
} from 'lucide-react';
import {
  ClientProfile,
  Ride,
  TrustedContact,
  TrustedContactDispatchRecord
} from '../types';
import { StorageService } from '../services/storage';
import { formatPhone } from '../utils/format';
import { WhatsAppIcon } from './WhatsAppIcon';

interface TrustedContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: ClientProfile | null;
  activeRide?: Ride | null;
  onUpdated?: (contacts: TrustedContact[], updatedClient?: ClientProfile) => void;
}

const RELATIONSHIP_OPTIONS = ['Mãe', 'Pai', 'Cônjuge', 'Familiar', 'Amigo(a)'];

export const TrustedContactsModal: React.FC<TrustedContactsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  activeRide,
  onUpdated
}) => {
  const [contacts, setContacts] = useState<TrustedContact[]>(currentUser?.trustedContacts || []);
  const [showAddForm, setShowAddForm] = useState<boolean>((currentUser?.trustedContacts || []).length === 0);
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('Familiar');
  const [phone, setPhone] = useState('');
  const [autoShareAllRides, setAutoShareAllRides] = useState(true);
  const [autoShareNightOnly, setAutoShareNightOnly] = useState(true);
  const [notifyOnAnomalyOrSos, setNotifyOnAnomalyOrSos] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [recentDispatches, setRecentDispatches] = useState<TrustedContactDispatchRecord[]>(
    activeRide?.trustedContactsDispatches || []
  );

  useEffect(() => {
    setRecentDispatches(activeRide?.trustedContactsDispatches || []);
  }, [activeRide?.id, activeRide?.trustedContactsDispatches?.length]);

  useEffect(() => {
    if (!isOpen || !currentUser?.id) return;
    const initial = currentUser.trustedContacts || [];
    setContacts(initial);
    setShowAddForm(initial.length === 0);
    setErrorMsg('');
    setFeedbackMsg('');

    let active = true;
    setIsLoading(true);
    fetch(`/api/clients/${encodeURIComponent(currentUser.id)}/trusted-contacts`, {
      headers: { ...StorageService.getAuthHeaders() }
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (active && data?.ok && Array.isArray(data.trustedContacts)) {
          setContacts(data.trustedContacts);
          setShowAddForm(data.trustedContacts.length === 0);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, currentUser?.id, currentUser?.trustedContacts]);

  if (!isOpen) return null;

  const persistContacts = async (nextList: TrustedContact[], successNotice: string): Promise<boolean> => {
    if (!currentUser?.id) {
      setErrorMsg('Faça login para salvar contatos de confiança.');
      return false;
    }
    setIsSaving(true);
    setErrorMsg('');
    setFeedbackMsg('');
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(currentUser.id)}/trusted-contacts`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...StorageService.getAuthHeaders()
        },
        body: JSON.stringify({ trustedContacts: nextList })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error || 'Não foi possível salvar os contatos.');
        return false;
      }
      const saved: TrustedContact[] = Array.isArray(data.trustedContacts) ? data.trustedContacts : nextList;
      setContacts(saved);
      const nextClient = data.client
        ? data.client
        : { ...currentUser, trustedContacts: saved };
      StorageService.setCurrentUser(nextClient);
      onUpdated?.(saved, nextClient);
      setFeedbackMsg(successNotice);
      return true;
    } catch {
      setErrorMsg('Falha de conexão ao salvar contatos.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setFeedbackMsg('');

    const cleanName = name.trim();
    const digits = phone.replace(/\D/g, '');
    if (cleanName.length < 2) {
      setErrorMsg('Informe o nome completo do contato.');
      return;
    }
    if (digits.length < 10) {
      setErrorMsg('Informe um WhatsApp válido com DDD.');
      return;
    }
    if (contacts.length >= 5) {
      setErrorMsg('Você já atingiu o limite de 5 contatos.');
      return;
    }

    const newContact: TrustedContact = {
      id: `tc-${Date.now()}`,
      name: cleanName,
      relationship,
      phone: formatPhone(digits),
      autoShareAllRides,
      autoShareNightOnly: autoShareAllRides ? true : autoShareNightOnly,
      notifyOnAnomalyOrSos,
      createdAt: new Date().toISOString()
    };

    const nextList = [...contacts, newContact];
    const ok = await persistContacts(
      nextList,
      `${cleanName} adicionado aos seus contatos de confiança.`
    );
    if (ok) {
      setName('');
      setPhone('');
      setShowAddForm(false);
    }
  };

  const handleRemoveContact = async (id: string) => {
    const nextList = contacts.filter(c => c.id !== id);
    await persistContacts(nextList, 'Contato removido.');
    if (nextList.length === 0) setShowAddForm(true);
  };

  const handleToggleRule = async (
    id: string,
    field: 'autoShareAllRides' | 'autoShareNightOnly' | 'notifyOnAnomalyOrSos'
  ) => {
    const nextList = contacts.map(c => (c.id === id ? { ...c, [field]: !c[field] } : c));
    await persistContacts(nextList, 'Preferência atualizada.');
  };

  const handleManualShareDispatch = async () => {
    if (!activeRide?.id) return;
    setIsDispatching(true);
    setErrorMsg('');
    setFeedbackMsg('');
    try {
      const res = await fetch(`/api/rides/${encodeURIComponent(activeRide.id)}/share-trusted-contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...StorageService.getAuthHeaders()
        },
        body: JSON.stringify({})
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error || 'Não foi possível enviar o link agora.');
        return;
      }
      if (Array.isArray(data.dispatches)) {
        setRecentDispatches(prev => [...prev, ...data.dispatches]);
      }
      setFeedbackMsg(
        Array.isArray(data.dispatches) && data.dispatches.length > 0
          ? `Rastreamento enviado para ${data.dispatches.length} contato(s)!`
          : 'Cadastre pelo menos 1 contato para compartilhar.'
      );
    } catch {
      setErrorMsg('Falha de rede ao compartilhar sua viagem.');
    } finally {
      setIsDispatching(false);
    }
  };

  const modalContent = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.58)',
        backdropFilter: 'blur(3px)',
        zIndex: 10065,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          maxHeight: '88dvh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          backgroundColor: '#FFFFFF',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          padding: '10px 18px calc(20px + env(safe-area-inset-bottom, 0px)) 18px',
          boxSizing: 'border-box',
          boxShadow: '0 -12px 36px rgba(0,0,0,0.25)'
        }}
      >
        {/* Alça superior */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <div style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: '#E2E8F0' }} />
        </div>

        {/* Cabeçalho limpo estilo Uber */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0, flex: 1 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              backgroundColor: '#EFF6FF',
              color: '#276EF1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <ShieldCheck size={20} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 900, color: '#0F172A', lineHeight: 1.2 }}>
                Contatos de confiança
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.74rem', color: '#64748B', fontWeight: 500, lineHeight: 1.35 }}>
                Acompanhamento em tempo real com placa e localização
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              backgroundColor: '#F3F4F6',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#111111',
              flexShrink: 0
            }}
          >
            <X size={17} />
          </button>
        </div>

        {errorMsg && (
          <div style={{
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#B91C1C',
            padding: '9px 12px',
            borderRadius: 11,
            fontSize: '0.78rem',
            fontWeight: 700,
            marginBottom: 12
          }}>
            {errorMsg}
          </div>
        )}

        {feedbackMsg && (
          <div style={{
            backgroundColor: '#F0FDF4',
            border: '1px solid #BBF7D0',
            color: '#166534',
            padding: '9px 12px',
            borderRadius: 11,
            fontSize: '0.78rem',
            fontWeight: 700,
            marginBottom: 12
          }}>
            {feedbackMsg}
          </div>
        )}

        {/* Lista de contatos salvos primeiro (padrão Uber) */}
        {isLoading && contacts.length === 0 ? (
          <div style={{ padding: '16px 0', textAlign: 'center', fontSize: '0.8rem', color: '#64748B' }}>
            Carregando contatos...
          </div>
        ) : contacts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Seus contatos ({contacts.length}/5)
              </span>
              {contacts.length < 5 && (
                <button
                  type="button"
                  onClick={() => setShowAddForm(v => !v)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '4px 6px',
                    color: '#276EF1',
                    fontSize: '0.76rem',
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer'
                  }}
                >
                  {showAddForm ? <ChevronDown size={14} /> : <Plus size={14} />}
                  <span>{showAddForm ? 'Ocultar' : 'Adicionar'}</span>
                </button>
              )}
            </div>

            {contacts.map(c => (
              <div
                key={c.id}
                style={{
                  padding: '11px 12px',
                  borderRadius: 14,
                  border: '1px solid #E5E7EB',
                  backgroundColor: '#FFFFFF',
                  boxSizing: 'border-box'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    <div style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      backgroundColor: '#F3F4F6',
                      color: '#111111',
                      fontWeight: 800,
                      fontSize: '0.84rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.86rem', fontWeight: 800, color: '#111111' }}>
                          {c.name}
                        </span>
                        <span style={{
                          fontSize: '0.66rem',
                          fontWeight: 700,
                          color: '#475569',
                          backgroundColor: '#F1F5F9',
                          padding: '1px 7px',
                          borderRadius: 999
                        }}>
                          {c.relationship || 'Familiar'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600, marginTop: 1 }}>
                        {formatPhone(c.phone)}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveContact(c.id)}
                    disabled={isSaving}
                    title="Remover contato"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      backgroundColor: '#FEF2F2',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#DC2626',
                      flexShrink: 0
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
                  <button
                    type="button"
                    onClick={() => handleToggleRule(c.id, 'autoShareAllRides')}
                    style={{
                      padding: '4px 9px',
                      borderRadius: 999,
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: c.autoShareAllRides ? '1px solid #16A34A' : '1px solid #E2E8F0',
                      backgroundColor: c.autoShareAllRides ? '#F0FDF4' : '#F8FAFC',
                      color: c.autoShareAllRides ? '#15803D' : '#64748B',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Check size={11} />
                    <span>Envio automático</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleRule(c.id, 'autoShareNightOnly')}
                    style={{
                      padding: '4px 9px',
                      borderRadius: 999,
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: c.autoShareNightOnly ? '1px solid #4F46E5' : '1px solid #E2E8F0',
                      backgroundColor: c.autoShareNightOnly ? '#EEF2FF' : '#F8FAFC',
                      color: c.autoShareNightOnly ? '#3730A3' : '#64748B',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <Moon size={11} />
                    <span>Viagens noturnas</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleRule(c.id, 'notifyOnAnomalyOrSos')}
                    style={{
                      padding: '4px 9px',
                      borderRadius: 999,
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: c.notifyOnAnomalyOrSos ? '1px solid #DC2626' : '1px solid #E2E8F0',
                      backgroundColor: c.notifyOnAnomalyOrSos ? '#FEF2F2' : '#F8FAFC',
                      color: c.notifyOnAnomalyOrSos ? '#B91C1C' : '#64748B',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <BellRing size={11} />
                    <span>Alertas SOS</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Formulário compacto estilo Uber */}
        {showAddForm && contacts.length < 5 && (
          <form
            onSubmit={handleAddContact}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              marginBottom: activeRide ? 14 : 0
            }}
          >
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {RELATIONSHIP_OPTIONS.map(rel => (
                <button
                  key={rel}
                  type="button"
                  onClick={() => setRelationship(rel)}
                  style={{
                    padding: '5px 11px',
                    borderRadius: 999,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: relationship === rel ? '1px solid #111111' : '1px solid #E5E7EB',
                    backgroundColor: relationship === rel ? '#111111' : '#F8FAFC',
                    color: relationship === rel ? '#FFFFFF' : '#475569'
                  }}
                >
                  {rel}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="Nome completo"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              style={{
                width: '100%',
                boxSizing: 'border-box',
                height: 44,
                padding: '0 14px',
                borderRadius: 12,
                border: '1px solid #E5E7EB',
                backgroundColor: '#F3F4F6',
                color: '#111111',
                fontSize: '0.86rem',
                fontWeight: 600,
                outline: 'none'
              }}
            />

            <input
              type="tel"
              placeholder="WhatsApp com DDD (ex: 48 99999-9999)"
              value={phone}
              onChange={e => setPhone(formatPhone(e.target.value))}
              required
              style={{
                width: '100%',
                boxSizing: 'border-box',
                height: 44,
                padding: '0 14px',
                borderRadius: 12,
                border: '1px solid #E5E7EB',
                backgroundColor: '#F3F4F6',
                color: '#111111',
                fontSize: '0.86rem',
                fontWeight: 600,
                outline: 'none'
              }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.75rem', color: '#475569', fontWeight: 600, paddingTop: 2 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoShareAllRides}
                  onChange={e => setAutoShareAllRides(e.target.checked)}
                />
                <span>Compartilhar trajeto automaticamente em todas as viagens</span>
              </label>
              {!autoShareAllRides && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={autoShareNightOnly}
                    onChange={e => setAutoShareNightOnly(e.target.checked)}
                  />
                  <span>Enviar automaticamente apenas à noite (20h às 06h)</span>
                </label>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={notifyOnAnomalyOrSos}
                  onChange={e => setNotifyOnAnomalyOrSos(e.target.checked)}
                />
                <span>Avisar automaticamente se eu acionar o SOS</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isSaving || contacts.length >= 5}
              style={{
                width: '100%',
                height: 46,
                borderRadius: 12,
                border: 'none',
                backgroundColor: '#111111',
                color: '#FFFFFF',
                fontSize: '0.88rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                cursor: isSaving || contacts.length >= 5 ? 'not-allowed' : 'pointer',
                opacity: isSaving || contacts.length >= 5 ? 0.6 : 1,
                marginTop: 2
              }}
            >
              <Plus size={16} />
              <span>{isSaving ? 'Salvando...' : 'Adicionar contato'}</span>
            </button>
          </form>
        )}

        {/* Compartilhar viagem atual */}
        {activeRide && (
          <div style={{
            borderTop: '1px solid #F1F5F9',
            paddingTop: 12,
            marginTop: 4
          }}>
            {contacts.length > 0 ? (
              <button
                type="button"
                onClick={handleManualShareDispatch}
                disabled={isDispatching}
                style={{
                  width: '100%',
                  height: 44,
                  borderRadius: 12,
                  border: 'none',
                  backgroundColor: '#16A34A',
                  color: '#FFFFFF',
                  fontSize: '0.86rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  cursor: isDispatching ? 'not-allowed' : 'pointer',
                  opacity: isDispatching ? 0.7 : 1
                }}
              >
                <Send size={15} />
                <span>{isDispatching ? 'Enviando...' : 'Enviar status da viagem agora'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const sharePath = activeRide.trackingUrl
                    ? activeRide.trackingUrl.replace(/^\/track\//, '/viagem/')
                    : `/viagem/${encodeURIComponent(activeRide.id)}`;
                  const shareUrl = `${window.location.origin}${sharePath}`;
                  const msg = `Acompanhe minha viagem Kavro Drive (${activeRide.origin.address} -> ${activeRide.destination.address}): ${shareUrl}`;
                  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
                }}
                style={{
                  width: '100%',
                  height: 42,
                  borderRadius: 12,
                  border: '1px solid #E5E7EB',
                  backgroundColor: '#F8FAFC',
                  color: '#111111',
                  fontSize: '0.82rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  cursor: 'pointer'
                }}
              >
                <WhatsAppIcon size={16} />
                <span>Compartilhar link rápido pelo WhatsApp</span>
              </button>
            )}

            {recentDispatches.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B' }}>
                  Enviado nesta viagem ({recentDispatches.length})
                </div>
                {recentDispatches.slice(-5).reverse().map(d => (
                  <div
                    key={d.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '8px 10px',
                      borderRadius: 11,
                      backgroundColor: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      fontSize: '0.72rem'
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, color: '#166534', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        ✓ {d.contactName} ({formatPhone(d.contactPhone)})
                      </div>
                      <div style={{ color: '#15803D', fontSize: '0.67rem' }}>
                        Enviado às {new Date(d.sentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <a
                      href={d.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '5px 9px',
                        borderRadius: 8,
                        backgroundColor: '#25D366',
                        color: '#FFFFFF',
                        fontWeight: 800,
                        fontSize: '0.68rem',
                        textDecoration: 'none',
                        flexShrink: 0
                      }}
                    >
                      <WhatsAppIcon size={13} />
                      <span>Abrir</span>
                      <ExternalLink size={10} />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};
