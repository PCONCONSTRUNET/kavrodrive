import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Phone, Send, AlertTriangle, CheckCheck } from 'lucide-react';
import { Ride, RideChatMessage } from '../types';
import { StorageService } from '../services/storage';
import { RealtimeService } from '../services/realtime';
import { getCleanWhatsappNumber } from '../utils/format';

interface DriverChatModalProps {
  isOpen: boolean;
  ride: Ride;
  driverName?: string;
  viewerRole?: 'driver' | 'client';
  onClose: () => void;
}

export const RideChatModal: React.FC<DriverChatModalProps> = ({
  isOpen,
  ride,
  driverName,
  viewerRole = 'driver',
  onClose,
}) => {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<RideChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    const res = await StorageService.getRideMessages(ride.id);
    if (res.ok) {
      setMessages(res.messages);
    }
  }, [ride.id]);

  useEffect(() => {
    if (!isOpen) return;
    setSendError('');
    setIsLoading(true);
    fetchMessages().finally(() => setIsLoading(false));

    const handleRealtimeChat = (evt: Event) => {
      const detail = (evt as CustomEvent)?.detail;
      if (!detail || detail.rideId !== ride.id || !detail.message) return;
      const incoming: RideChatMessage = detail.message;
      setMessages(prev => (prev.some(m => m.id === incoming.id) ? prev : [...prev, incoming]));
    };

    window.addEventListener('up_realtime_chat', handleRealtimeChat);
    const fallbackInterval = window.setInterval(() => {
      if (!RealtimeService.isConnected()) {
        fetchMessages();
      }
    }, 4000);

    return () => {
      clearInterval(fallbackInterval);
      window.removeEventListener('up_realtime_chat', handleRealtimeChat);
    };
  }, [isOpen, ride.id, fetchMessages]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isOpen]);

  if (!isOpen) return null;

  const isDriverView = viewerRole === 'driver';
  const quickReplies = isDriverView
    ? [
        'Cheguei',
        'Estou a caminho',
        'Estou no local de embarque',
        'O trânsito está um pouco lento',
        'Pode confirmar o ponto de referência?'
      ]
    : [
        'Já estou descendo',
        'Estou no ponto de embarque',
        'Ok, obrigado!',
        'Pode aguardar 1 minuto?',
        'Estou aqui na entrada'
      ];

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend ?? inputText).trim();
    if (!text || isSending) return;

    setSendError('');
    setIsSending(true);
    if (!textToSend) setInputText('');

    const res = await StorageService.sendRideMessage(ride.id, {
      text,
      senderRole: viewerRole,
      senderName: isDriverView ? (driverName || ride.driverName || 'Motorista') : (ride.clientName || 'Passageiro')
    });

    setIsSending(false);

    if (!res.ok || !res.message) {
      if (!textToSend) setInputText(text);
      setSendError(res.error || 'Erro ao enviar mensagem.');
      return;
    }

    const created = res.message;
    setMessages(prev => (prev.some(m => m.id === created.id) ? prev : [...prev, created]));
  };

  const counterpartName = isDriverView
    ? (ride.clientName || 'Passageiro')
    : (ride.driverName || driverName || 'Motorista Parceiro');
  const counterpartSub = isDriverView
    ? 'Passageiro Kavro Drive • Tempo real'
    : `${ride.driverVehicle || 'Motorista Parceiro'} • Tempo real`;
  const counterpartPhone = isDriverView
    ? getCleanWhatsappNumber(ride.clientPhone || '')
    : getCleanWhatsappNumber(ride.driverPhone || '');

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: '#12171E',
      color: '#FFFFFF',
      zIndex: 100000,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Top Header estilo Uber Driver */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'calc(12px + env(safe-area-inset-top, 0px)) 16px 12px 16px',
        backgroundColor: '#161F28',
        borderBottom: '1px solid #232E3B',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Voltar do chat"
            style={{
              background: 'none',
              border: 'none',
              color: '#FFFFFF',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 4
            }}
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
              {counterpartName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#94A3B8' }}>
              <span style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: '#22C55E',
                display: 'inline-block'
              }} />
              <span>{counterpartSub}</span>
            </div>
          </div>
        </div>

        {/* Botão de Ligação direta */}
        {counterpartPhone && (
          <a
            href={`tel:${counterpartPhone}`}
            aria-label="Ligar"
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              backgroundColor: '#232E3B',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              border: '1px solid #334155'
            }}
          >
            <Phone size={18} />
          </a>
        )}
      </header>

      {/* Corpo com mensagens e Aviso de Segurança */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        <div style={{
          textAlign: 'center',
          fontSize: '0.74rem',
          color: '#64748B',
          fontWeight: 600,
          marginBottom: 4
        }}>
          Corrida {ride.rideCode || ride.id} • {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
        </div>

        {/* Card Oficial de Aviso */}
        <div style={{
          backgroundColor: 'rgba(30, 41, 59, 0.7)',
          border: '1px solid #334155',
          borderRadius: 16,
          padding: '14px',
          textAlign: 'center',
          maxWidth: 320,
          margin: '0 auto 8px auto'
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6, color: '#F59E0B' }}>
            <AlertTriangle size={28} />
          </div>
          <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#FFFFFF', marginBottom: 4 }}>
            Chat direto da viagem
          </div>
          <div style={{ fontSize: '0.78rem', color: '#94A3B8', lineHeight: 1.45 }}>
            Para sua segurança, nunca compartilhe senhas ou dados bancários neste chat. Mensagens sincronizadas em tempo real.
          </div>
        </div>

        {isLoading && messages.length === 0 && (
          <div style={{ textAlign: 'center', fontSize: '0.84rem', color: '#94A3B8', padding: '20px 0' }}>
            Carregando histórico do chat...
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div style={{ textAlign: 'center', fontSize: '0.82rem', color: '#64748B', padding: '16px 12px' }}>
            Nenhuma mensagem ainda. Use um atalho abaixo ou digite para iniciar a conversa ao vivo.
          </div>
        )}

        {messages.map(msg => {
          const isMe = msg.sender === viewerRole;
          return (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isMe ? 'flex-end' : 'flex-start',
                marginBottom: 2
              }}
            >
              <div style={{
                maxWidth: '78%',
                padding: '11px 15px',
                borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                backgroundColor: isMe ? '#2563EB' : '#1E293B',
                color: '#FFFFFF',
                fontSize: '0.92rem',
                lineHeight: 1.35,
                border: isMe ? 'none' : '1px solid #334155',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
              }}>
                {msg.text}
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '0.65rem',
                color: '#64748B',
                marginTop: 3,
                padding: '0 4px'
              }}>
                <span>{formatTime(msg.createdAt)}</span>
                {isMe && <CheckCheck size={12} color="#60A5FA" />}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Seção Inferior: Chips Rápidos + Campo de Texto */}
      <div style={{
        padding: '10px 14px calc(14px + env(safe-area-inset-bottom, 0px)) 14px',
        backgroundColor: '#161F28',
        borderTop: '1px solid #232E3B',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }}>
        {sendError && (
          <div style={{ fontSize: '0.78rem', color: '#FCA5A5', fontWeight: 600 }}>
            {sendError}
          </div>
        )}

        <div style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 4,
          scrollbarWidth: 'none'
        }}>
          {quickReplies.map((reply, index) => (
            <button
              key={index}
              type="button"
              disabled={isSending}
              onClick={() => handleSendMessage(reply)}
              style={{
                padding: '8px 15px',
                borderRadius: 20,
                backgroundColor: '#263445',
                color: '#E2E8F0',
                border: '1px solid #3B4A5C',
                fontSize: '0.84rem',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              {reply}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}
        >
          <input
            type="text"
            placeholder="Mensagem em tempo real..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            style={{
              flex: 1,
              height: 46,
              borderRadius: 24,
              backgroundColor: '#232E3B',
              border: '1px solid #37475A',
              padding: '0 16px',
              color: '#FFFFFF',
              fontSize: '0.92rem',
              outline: 'none'
            }}
          />

          <button
            type="submit"
            disabled={!inputText.trim() || isSending}
            aria-label="Enviar mensagem"
            style={{
              width: 46,
              height: 46,
              borderRadius: '50%',
              backgroundColor: inputText.trim() && !isSending ? '#2563EB' : '#232E3B',
              border: 'none',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: inputText.trim() && !isSending ? 'pointer' : 'default',
              transition: 'all 0.15s ease'
            }}
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};

export const DriverChatModal = RideChatModal;
