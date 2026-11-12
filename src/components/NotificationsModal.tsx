import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Bell, CheckCheck, Trash2, X, AlertTriangle, Car, 
  CheckCircle2, XCircle, CreditCard, Clock, ExternalLink, 
  Sparkles, Check, ChevronRight, UserPlus, ShieldCheck 
} from 'lucide-react';
import { NotificationItem, Ride } from '../types';
import { StorageService } from '../services/storage';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: 'admin' | 'client';
  onSelectRide?: (rideId: string) => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  userRole,
  onSelectRide
}) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const loadNotifications = () => {
    const all = StorageService.getNotifications();

    if (userRole === 'admin') {
      setNotifications(all);
    } else {
      // No modo Cliente, filtra notificações que pertençam às corridas do cliente ou gerais
      const currentUser = StorageService.getCurrentUser();
      const allRides = StorageService.getRides();
      const clientRides = allRides.filter(r => 
        (currentUser?.phone && r.clientPhone === currentUser.phone) ||
        (currentUser?.id && r.clientId === currentUser.id) ||
        (currentUser?.name && r.clientName && r.clientName.trim().toLowerCase() === currentUser.name.trim().toLowerCase())
      );
      const clientRideIds = new Set(clientRides.map(r => r.id));

      const filtered = all.filter(n => !n.rideId || clientRideIds.has(n.rideId));
      setNotifications(filtered);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadNotifications();

    const handleUpdate = () => {
      loadNotifications();
    };

    window.addEventListener('up_notifications_updated', handleUpdate);
    window.addEventListener('up_database_synced', handleUpdate);
    window.addEventListener('up_push_received', handleUpdate);

    return () => {
      window.removeEventListener('up_notifications_updated', handleUpdate);
      window.removeEventListener('up_database_synced', handleUpdate);
      window.removeEventListener('up_push_received', handleUpdate);
    };
  }, [isOpen, userRole]);

  if (!isOpen) return null;

  const isAdmin = userRole === 'admin';

  // Paleta de cores dinâmica
  const bgModal = isAdmin ? '#121A21' : '#FFFFFF';
  const bgHeader = isAdmin ? '#1A232C' : '#F8FAFC';
  const borderCol = isAdmin ? '#2A3642' : '#E2E8F0';
  const textColor = isAdmin ? '#FFFFFF' : '#0F172A';
  const textMuted = isAdmin ? '#94A3B8' : '#64748B';
  const cardBg = isAdmin ? '#1E293B' : '#F8FAFC';
  const cardBorder = isAdmin ? '#334155' : '#E2E8F0';
  const cardUnreadBg = isAdmin ? 'rgba(118, 216, 0, 0.08)' : '#F0FDF4';
  const cardUnreadBorder = isAdmin ? 'rgba(118, 216, 0, 0.35)' : '#86EFAC';

  const unreadCount = notifications.filter(n => !n.read).length;
  const filteredList = filter === 'unread' ? notifications.filter(n => !n.read) : notifications;

  const handleMarkAllRead = () => {
    StorageService.markNotificationsRead();
    loadNotifications();
  };

  const handleMarkSingleRead = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    StorageService.markNotificationAsRead(id);
    loadNotifications();
  };

  const handleDeleteSingle = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    StorageService.deleteNotification(id);
    loadNotifications();
  };

  const handleClearAll = () => {
    StorageService.clearAllNotifications();
    setConfirmClearAll(false);
    loadNotifications();
  };

  const formatTimestamp = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const isYesterday = d.toDateString() === yesterday.toDateString();

      const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      if (isToday) return `Hoje às ${timeStr}`;
      if (isYesterday) return `Ontem às ${timeStr}`;
      return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} • ${timeStr}`;
    } catch {
      return '';
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'sos_alert':
        return (
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: '#DC2626',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 3px 10px rgba(220, 38, 38, 0.4)'
          }}>
            <AlertTriangle size={19} strokeWidth={2.4} />
          </div>
        );
      case 'payment':
        return (
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: '#15803D',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 3px 10px rgba(21, 128, 61, 0.35)'
          }}>
            <CreditCard size={19} strokeWidth={2.2} />
          </div>
        );
      case 'ride_confirmed':
        return (
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: '#16A34A',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 3px 10px rgba(22, 163, 74, 0.3)'
          }}>
            <CheckCircle2 size={19} strokeWidth={2.4} />
          </div>
        );
      case 'ride_cancelled':
        return (
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: '#E11D48',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 3px 10px rgba(225, 29, 72, 0.3)'
          }}>
            <XCircle size={19} strokeWidth={2.4} />
          </div>
        );
      case 'reminder':
        return (
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: '#EA580C',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 3px 10px rgba(234, 88, 12, 0.3)'
          }}>
            <Clock size={19} strokeWidth={2.4} />
          </div>
        );
      case 'driver_new':
        return (
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: '#4F46E5',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 3px 10px rgba(79, 70, 229, 0.35)'
          }}>
            <UserPlus size={19} strokeWidth={2.3} />
          </div>
        );
      case 'driver_kyc':
        return (
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: '#0F172A',
            color: '#76D800',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 3px 10px rgba(15, 23, 42, 0.3)'
          }}>
            <ShieldCheck size={19} strokeWidth={2.3} />
          </div>
        );
      case 'client_new':
        return (
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: '#0D9488',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 3px 10px rgba(13, 148, 136, 0.3)'
          }}>
            <UserPlus size={19} strokeWidth={2.3} />
          </div>
        );
      case 'ride_new':
      default:
        return (
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: '#2563EB',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 3px 10px rgba(37, 99, 235, 0.35)'
          }}>
            <Car size={19} strokeWidth={2.2} />
          </div>
        );
    }
  };

  return createPortal(
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: 'rgba(10, 15, 20, 0.78)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 0,
        animation: 'fadeIn 0.2s ease-out'
      }}
    >
      <div
        className="modal-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 500,
          backgroundColor: bgModal,
          borderRadius: '24px 24px 0 0',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.4)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '88dvh',
          borderTop: `2px solid ${isAdmin ? '#76D800' : '#15803D'}`
        }}
      >
        {/* CABEÇALHO */}
        <div style={{
          backgroundColor: bgHeader,
          padding: '16px 18px 12px 18px',
          borderBottom: `1px solid ${borderCol}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              backgroundColor: isAdmin ? 'rgba(118, 216, 0, 0.15)' : '#F0FDF4',
              border: `1.5px solid ${isAdmin ? 'rgba(118, 216, 0, 0.4)' : '#BBF7D0'}`,
              color: isAdmin ? '#76D800' : '#15803D',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Bell size={20} strokeWidth={2.4} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 900, color: textColor, margin: 0, lineHeight: 1.2 }}>
                  Notificações & Avisos
                </h2>
                {unreadCount > 0 && (
                  <span style={{
                    backgroundColor: '#EF4444',
                    color: '#FFFFFF',
                    fontSize: '0.68rem',
                    fontWeight: 900,
                    padding: '1px 7px',
                    borderRadius: 10
                  }}>
                    {unreadCount} nova{unreadCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <span style={{ fontSize: '0.74rem', color: textMuted }}>
                {isAdmin ? 'Painel Operacional do Motorista' : 'Avisos da sua conta e corridas'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: isAdmin ? '#2A3642' : '#FFFFFF',
              border: `1px solid ${borderCol}`,
              color: textMuted,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={17} />
          </button>
        </div>

        {/* BARRA DE AÇÕES (FILTROS + BOTÕES DE LIMPAR/MARCAR LIDAS) */}
        <div style={{
          padding: '10px 18px',
          borderBottom: `1px solid ${borderCol}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexShrink: 0,
          backgroundColor: isAdmin ? '#161F28' : '#FAFBFD'
        }}>
          {/* ABAS DE FILTRO */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setFilter('all')}
              style={{
                padding: '5px 12px',
                borderRadius: 20,
                fontSize: '0.74rem',
                fontWeight: 800,
                backgroundColor: filter === 'all' ? (isAdmin ? '#76D800' : '#121A21') : 'transparent',
                color: filter === 'all' ? (isAdmin ? '#121A21' : '#FFFFFF') : textMuted,
                border: `1px solid ${filter === 'all' ? 'transparent' : borderCol}`,
                cursor: 'pointer'
              }}
            >
              Todas ({notifications.length})
            </button>

            <button
              onClick={() => setFilter('unread')}
              style={{
                padding: '5px 12px',
                borderRadius: 20,
                fontSize: '0.74rem',
                fontWeight: 800,
                backgroundColor: filter === 'unread' ? '#EF4444' : 'transparent',
                color: filter === 'unread' ? '#FFFFFF' : textMuted,
                border: `1px solid ${filter === 'unread' ? 'transparent' : borderCol}`,
                cursor: 'pointer'
              }}
            >
              Não lidas ({unreadCount})
            </button>
          </div>

          {/* BOTÕES DE AÇÃO GERAL */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 9px',
                  borderRadius: 8,
                  backgroundColor: isAdmin ? '#2A3642' : '#EFF6FF',
                  border: `1px solid ${isAdmin ? '#3D4C5A' : '#BFDBFE'}`,
                  color: isAdmin ? '#76D800' : '#2563EB',
                  fontSize: '0.70rem',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
                title="Marcar todas como lidas"
              >
                <CheckCheck size={14} />
                <span>Marcar lidas</span>
              </button>
            )}

            {notifications.length > 0 && (
              confirmClearAll ? (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={handleClearAll}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 6,
                      backgroundColor: '#DC2626',
                      color: '#FFFFFF',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    Confirmar
                  </button>
                  <button
                    onClick={() => setConfirmClearAll(false)}
                    style={{
                      padding: '4px 6px',
                      borderRadius: 6,
                      backgroundColor: isAdmin ? '#334155' : '#E2E8F0',
                      color: textColor,
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClearAll(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '5px 9px',
                    borderRadius: 8,
                    backgroundColor: 'transparent',
                    border: `1px solid ${borderCol}`,
                    color: '#EF4444',
                    fontSize: '0.70rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  title="Limpar todas as notificações"
                >
                  <Trash2 size={13} />
                  <span>Limpar</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* LISTAGEM DE NOTIFICAÇÕES */}
        <div style={{
          padding: '14px 18px 20px 18px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          flex: 1
        }}>
          {filteredList.length === 0 ? (
            <div style={{
              padding: '40px 16px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10
            }}>
              <div style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                backgroundColor: isAdmin ? 'rgba(118, 216, 0, 0.12)' : '#F0FDF4',
                color: isAdmin ? '#76D800' : '#16A34A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Check size={26} strokeWidth={2.5} />
              </div>

              <div>
                <div style={{ fontSize: '0.96rem', fontWeight: 800, color: textColor }}>
                  {filter === 'unread' ? 'Nenhuma notificação não lida!' : 'Tudo limpo por aqui!'}
                </div>
                <div style={{ fontSize: '0.76rem', color: textMuted, marginTop: 4, maxWidth: 280 }}>
                  {filter === 'unread'
                    ? 'Você já visualizou todos os seus alertas recentes.'
                    : 'Quando houver novidades sobre corridas ou pagamentos, elas aparecerão aqui.'}
                </div>
              </div>
            </div>
          ) : (
            filteredList.map((item) => {
              const isUnread = !item.read;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (isUnread) handleMarkSingleRead(item.id);
                    if (item.rideId && onSelectRide) {
                      onSelectRide(item.rideId);
                      onClose();
                    }
                  }}
                  style={{
                    backgroundColor: isUnread ? cardUnreadBg : cardBg,
                    border: `1.5px solid ${isUnread ? cardUnreadBorder : cardBorder}`,
                    borderRadius: 14,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    position: 'relative'
                  }}
                >
                  {/* Ícone customizado por tipo de notificação */}
                  {getNotificationIcon(item.type)}

                  {/* Conteúdo textual */}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{
                          fontSize: '0.88rem',
                          fontWeight: isUnread ? 900 : 700,
                          color: textColor,
                          lineHeight: 1.25,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {item.title}
                        </span>

                        {isUnread && (
                          <div style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            backgroundColor: '#EF4444',
                            flexShrink: 0
                          }} />
                        )}
                      </div>

                      <span style={{ fontSize: '0.68rem', color: textMuted, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {formatTimestamp(item.timestamp)}
                      </span>
                    </div>

                    <div style={{
                      fontSize: '0.78rem',
                      color: isUnread ? (isAdmin ? '#E2E8F0' : '#1E293B') : textMuted,
                      lineHeight: 1.35,
                      marginTop: 4
                    }}>
                      {item.message}
                    </div>

                    {/* Rodapé do card: Ações rápidas */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 8,
                      paddingTop: 6,
                      borderTop: `1px solid ${isAdmin ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}`
                    }}>
                      {item.rideId ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isUnread) handleMarkSingleRead(item.id);
                            if (onSelectRide) {
                              onSelectRide(item.rideId!);
                              onClose();
                            }
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            backgroundColor: isAdmin ? '#2A3642' : '#EFF6FF',
                            color: isAdmin ? '#76D800' : '#2563EB',
                            border: 'none',
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: '0.70rem',
                            fontWeight: 800,
                            cursor: 'pointer'
                          }}
                        >
                          <span>Ver Corrida ({item.rideId})</span>
                          <ChevronRight size={13} />
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.68rem', color: textMuted }}>Aviso do sistema</span>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {isUnread && (
                          <button
                            type="button"
                            onClick={(e) => handleMarkSingleRead(item.id, e)}
                            style={{
                              backgroundColor: 'transparent',
                              border: 'none',
                              color: isAdmin ? '#76D800' : '#15803D',
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 3,
                              padding: '2px 6px'
                            }}
                            title="Marcar como lida"
                          >
                            <Check size={12} strokeWidth={3} />
                            <span>Lida</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => handleDeleteSingle(item.id, e)}
                          style={{
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: '#94A3B8',
                            fontSize: '0.68rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '2px 4px'
                          }}
                          title="Excluir notificação"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

