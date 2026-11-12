import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Phone, Send, AlertTriangle, CheckCheck, Clock } from 'lucide-react';
import { Ride } from '../types';
import { getCleanWhatsappNumber } from '../utils/format';

interface ChatMessage {
  id: string;
  sender: 'driver' | 'client';
  text: string;
  timestamp: string;
}

interface DriverChatModalProps {
  isOpen: boolean;
  ride: Ride;
  driverName: string;
  onClose: () => void;
}

export const DriverChatModal: React.FC<DriverChatModalProps> = ({
  isOpen,
  ride,
  driverName,
  onClose,
}) => {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    // Carrega mensagens salvas no localStorage para esta corrida
    const storageKey = `kavro_chat_ride_${ride.id}`;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    // Mensagens iniciais padrão
    return [
      {
        id: 'init-1',
        sender: 'client',
        text: `Olá! Estou aguardando em ${ride.origin.address.split(',')[0] || 'no ponto de embarque'}.`,
        timestamp: new Date(Date.now() - 1000 * 60 * 2).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      }
    ];
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      const storageKey = `kavro_chat_ride_${ride.id}`;
      localStorage.setItem(storageKey, JSON.stringify(messages));
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, ride.id]);

  if (!isOpen) return null;

  const quickReplies = [
    'Cheguei',
    'Ok, entendi',
    'Estou a caminho',
    'Estou no local de embarque',
    'O trânsito está um pouco lento',
    'Pode me confirmar o ponto de referência?'
  ];

  const handleSendMessage = (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text) return;

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'driver',
      text,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, newMsg]);
    if (!textToSend) setInputText('');

    // Resposta automática simulada do passageiro após 2.5 segundos para teste realista
    if (text.toLowerCase().includes('cheguei') || text.toLowerCase().includes('caminho')) {
      setTimeout(() => {
        const autoReply: ChatMessage = {
          id: `reply-${Date.now()}`,
          sender: 'client',
          text: 'Perfeito, já estou saindo! Obrigado.',
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, autoReply]);
      }, 2500);
    }
  };

  const cleanPhone = getCleanWhatsappNumber(ride.clientPhone || '');

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
              {ride.clientName || 'Passageiro'}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
              Passageiro Kavro Drive
            </div>
          </div>
        </div>

        {/* Botão de Ligação / WhatsApp */}
        <a
          href={cleanPhone ? `https://wa.me/${cleanPhone}?text=Ol%C3%A1%20${encodeURIComponent(ride.clientName)}%2C%20sou%20seu%20motorista%20Kavro%20Drive!` : '#'}
          target="_blank"
          rel="noopener noreferrer"
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
      </header>

      {/* Corpo com mensagens e Aviso de Segurança estilo Uber */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        {/* Data centralizada */}
        <div style={{
          textAlign: 'center',
          fontSize: '0.74rem',
          color: '#64748B',
          fontWeight: 600,
          marginBottom: 4
        }}>
          {new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </div>

        {/* Card Oficial de Aviso Uber Driver */}
        <div style={{
          backgroundColor: 'rgba(30, 41, 59, 0.7)',
          border: '1px solid #334155',
          borderRadius: 16,
          padding: '16px 14px',
          textAlign: 'center',
          maxWidth: 320,
          margin: '0 auto 12px auto'
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8, color: '#F59E0B' }}>
            <AlertTriangle size={32} />
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#FFFFFF', marginBottom: 6 }}>
            Mensagem de aviso
          </div>
          <div style={{ fontSize: '0.8rem', color: '#94A3B8', lineHeight: 1.45 }}>
            Para a segurança da sua conta, nunca compartilhe informações pessoais ou da sua conta neste chat.
          </div>
        </div>

        {/* Lista de Mensagens do Chat */}
        {messages.map(msg => {
          const isMe = msg.sender === 'driver';
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
                <span>{msg.timestamp}</span>
                {isMe && <CheckCheck size={12} color="#60A5FA" />}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Seção Inferior: Chips Rápidos + Campo de Texto estilo Uber Driver */}
      <div style={{
        padding: '10px 14px calc(14px + env(safe-area-inset-bottom, 0px)) 14px',
        backgroundColor: '#161F28',
        borderTop: '1px solid #232E3B',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }}>
        {/* Chips de Resposta Rápida com scroll horizontal */}
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

        {/* Input Bar com Botão Enviar */}
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
            placeholder="Mensagem..."
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
            disabled={!inputText.trim()}
            style={{
              width: 46,
              height: 46,
              borderRadius: '50%',
              backgroundColor: inputText.trim() ? '#2563EB' : '#232E3B',
              border: 'none',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: inputText.trim() ? 'pointer' : 'default',
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

