import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Capturado erro de renderização:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetApp = () => {
    try {
      // Limpa dados temporários que possam estar corrompidos sem apagar dados vitais
      localStorage.removeItem('up_mobilidade_current_driver');
      localStorage.removeItem('up_mobilidade_current_user');
    } catch {}
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100dvh',
          backgroundColor: '#090D14',
          color: '#FFFFFF',
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          boxSizing: 'border-box'
        }}>
          <div style={{
            maxWidth: 440,
            width: '100%',
            backgroundColor: '#121722',
            borderRadius: 24,
            padding: '28px 22px',
            border: '1.5px solid #1E293B',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            boxSizing: 'border-box'
          }}>
            <div style={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '2px solid #EF4444',
              color: '#EF4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto'
            }}>
              <AlertTriangle size={32} />
            </div>

            <h2 style={{ fontSize: '1.25rem', fontWeight: 900, margin: '0 0 8px 0', color: '#FFFFFF' }}>
              Ops! Ocorreu uma instabilidade
            </h2>
            <p style={{ fontSize: '0.86rem', color: '#94A3B8', margin: '0 0 20px 0', lineHeight: 1.45 }}>
              O app encontrou uma divergência inesperada ao carregar este módulo. Você pode recarregar a tela ou reiniciar a sessão.
            </p>

            {this.state.error && (
              <div style={{
                backgroundColor: '#090D14',
                border: '1px solid #1E293B',
                borderRadius: 12,
                padding: '10px 12px',
                marginBottom: 20,
                textAlign: 'left',
                maxHeight: 120,
                overflowY: 'auto',
                fontSize: '0.74rem',
                color: '#F87171',
                fontFamily: 'monospace',
                lineHeight: 1.3
              }}>
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: 14,
                  backgroundColor: '#76D800',
                  color: '#000000',
                  border: 'none',
                  fontWeight: 900,
                  fontSize: '0.92rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 4px 18px rgba(118, 216, 0, 0.35)'
                }}
              >
                <RefreshCw size={17} />
                <span>Recarregar Página</span>
              </button>

              <button
                type="button"
                onClick={this.handleResetApp}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 14,
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: '#CBD5E1',
                  border: '1px solid #334155',
                  fontWeight: 700,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}
              >
                <Trash2 size={16} />
                <span>Restaurar Sessão & Voltar</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

