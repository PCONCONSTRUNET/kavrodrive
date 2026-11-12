import React, { useState, useEffect } from 'react';
import { 
  Download, Smartphone, Share, PlusSquare, X, 
  Check, Sparkles, ArrowRight, Info
} from 'lucide-react';

interface PwaInstallBannerProps {
  customBottomOffset?: number;
  onInstalled?: () => void;
}

export const PwaInstallBanner: React.FC<PwaInstallBannerProps> = ({
  customBottomOffset = 76,
  onInstalled
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isDismissed, setIsDismissed] = useState(true);
  const [isIos, setIsIos] = useState(false);
  const [showIosModal, setShowIosModal] = useState(false);
  const [showAndroidModal, setShowAndroidModal] = useState(false);

  useEffect(() => {
    // 1. Detecta se já está rodando como PWA Standalone (instalado)
    const checkStandalone = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');

    setIsStandalone(checkStandalone);
    if (checkStandalone) return;

    // 2. Detecta iOS (iPhone / iPad)
    const ua = window.navigator.userAgent.toLowerCase();
    const isAppleDevice = /iphone|ipad|ipod/.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
    setIsIos(isAppleDevice);

    // 3. Checa se o usuário já dispensou recentemente
    const dismissedUntil = localStorage.getItem('up_pwa_dismissed_until');
    if (dismissedUntil && Date.now() < parseInt(dismissedUntil)) {
      setIsDismissed(true);
    } else {
      setIsDismissed(false);
    }

    // 4. Captura o evento nativo beforeinstallprompt (Android / Chrome Desktop)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsDismissed(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Evento quando o PWA for instalado com sucesso
    const handleAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
      if (onInstalled) onInstalled();
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [onInstalled]);

  // Se já estiver instalado em modo standalone ou o usuário dispensou, não exibe o banner flutuante
  if (isStandalone || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    // Dispensa por 5 dias
    const fiveDaysMs = Date.now() + 5 * 24 * 60 * 60 * 1000;
    localStorage.setItem('up_pwa_dismissed_until', String(fiveDaysMs));
    setIsDismissed(true);
  };

  const handleInstallClick = async () => {
    if (isIos) {
      // No iPhone / Safari abre o guia passo a passo da Apple
      setShowIosModal(true);
      return;
    }

    if (deferredPrompt) {
      // Dispara o prompt nativo do Chrome Android
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsStandalone(true);
        setDeferredPrompt(null);
        if (onInstalled) onInstalled();
      }
    } else {
      // Fallback para Android / Navegadores onde beforeinstallprompt já passou
      setShowAndroidModal(true);
    }
  };

  return (
    <>
      {/* BANNER FLUTUANTE ULTRA-ELEGANTE */}
      <div
        className="animate-fade-in"
        style={{
          position: 'fixed',
          bottom: customBottomOffset,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 24px)',
          maxWidth: 450,
          backgroundColor: '#121A21',
          border: '1.5px solid rgba(118, 216, 0, 0.4)',
          borderRadius: 18,
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          zIndex: 45,
          boxShadow: '0 10px 30px -4px rgba(0, 0, 0, 0.5), 0 0 16px rgba(118, 216, 0, 0.18)',
          boxSizing: 'border-box'
        }}
      >
        {/* Ícone e Texto */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <img
              src="/logo-icon.png"
              alt="Kavro Drive"
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                objectFit: 'cover',
                border: '1px solid rgba(255,255,255,0.15)',
                display: 'block'
              }}
            />
            <div style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 12,
              height: 12,
              borderRadius: '50%',
              backgroundColor: '#76D800',
              border: '2px solid #121A21'
            }} />
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: '0.84rem',
              fontWeight: 800,
              color: '#FFFFFF',
              lineHeight: 1.2,
              display: 'flex',
              alignItems: 'center',
              gap: 5
            }}>
              <span>Instalar o App</span>
              <span style={{
                backgroundColor: 'rgba(118, 216, 0, 0.2)',
                color: '#76D800',
                fontSize: '0.62rem',
                fontWeight: 800,
                padding: '1px 5px',
                borderRadius: 4,
                textTransform: 'uppercase'
              }}>
                Grátis
              </span>
            </div>
            <div style={{
              fontSize: '0.7rem',
              color: '#94A3B8',
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              Peça corridas com 1 toque na tela inicial
            </div>
          </div>
        </div>

        {/* Botão de Instalar e Fechar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={handleInstallClick}
            style={{
              backgroundColor: '#76D800',
              color: '#121A21',
              border: 'none',
              borderRadius: 10,
              padding: '8px 14px',
              fontSize: '0.8rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              boxShadow: '0 2px 8px rgba(118, 216, 0, 0.4)',
              transition: 'all 0.15s ease'
            }}
          >
            <Download size={14} strokeWidth={2.5} />
            <span>Instalar</span>
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748B',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Fechar banner"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* MODAL BOTTOM-SHEET PARA IPHONE (iOS SAFARI) */}
      {showIosModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.65)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          padding: 12
        }}>
          <div
            className="animate-fade-in"
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 22,
              width: '100%',
              maxWidth: 440,
              padding: '24px 20px',
              boxShadow: '0 -10px 40px rgba(0,0,0,0.3)',
              position: 'relative'
            }}
          >
            {/* Fechar */}
            <button
              onClick={() => setShowIosModal(false)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: '#F1F5F9',
                border: 'none',
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748B',
                cursor: 'pointer'
              }}
            >
              <X size={16} />
            </button>

            {/* Topo do Modal */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <img
                src="/logo-icon.png"
                alt="Kavro Drive"
                style={{ width: 48, height: 48, borderRadius: 12, border: '1px solid #E2E8F0' }}
              />
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 900, color: '#121A21', margin: 0 }}>
                  Como Instalar no seu iPhone
                </h3>
                <p style={{ fontSize: '0.74rem', color: '#64748B', margin: '2px 0 0 0' }}>
                  Siga os 2 passos rápidos no Safari:
                </p>
              </div>
            </div>

            {/* Passo 1 */}
            <div style={{
              backgroundColor: '#F8FAFC',
              borderRadius: 14,
              padding: '12px 14px',
              border: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 10
            }}>
              <div style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                backgroundColor: '#EFF6FF',
                color: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Share size={20} />
              </div>
              <div style={{ fontSize: '0.82rem', color: '#1E293B', lineHeight: 1.35 }}>
                <strong>1. Toque em Compartilhar</strong><br />
                Localizado na barra inferior do Safari (o quadrado com a setinha para cima).
              </div>
            </div>

            {/* Passo 2 */}
            <div style={{
              backgroundColor: '#F8FAFC',
              borderRadius: 14,
              padding: '12px 14px',
              border: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 16
            }}>
              <div style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                backgroundColor: '#DCFCE7',
                color: '#15803D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <PlusSquare size={20} />
              </div>
              <div style={{ fontSize: '0.82rem', color: '#1E293B', lineHeight: 1.35 }}>
                <strong>2. Adicionar à Tela de Início</strong><br />
                Role a lista para baixo e toque em <strong>"Adicionar à Tela de Início"</strong>.
              </div>
            </div>

            {/* Conclusão */}
            <button
              onClick={() => setShowIosModal(false)}
              className="btn-primary"
              style={{
                width: '100%',
                padding: '13px',
                fontSize: '0.92rem',
                fontWeight: 800,
                borderRadius: 14
              }}
            >
              <span>Entendido! Vou Adicionar</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL GUIA PARA ANDROID (CHROME) */}
      {showAndroidModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.65)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          padding: 12
        }}>
          <div
            className="animate-fade-in"
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 22,
              width: '100%',
              maxWidth: 440,
              padding: '24px 20px',
              boxShadow: '0 -10px 40px rgba(0,0,0,0.3)',
              position: 'relative'
            }}
          >
            <button
              onClick={() => setShowAndroidModal(false)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: '#F1F5F9',
                border: 'none',
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748B',
                cursor: 'pointer'
              }}
            >
              <X size={16} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <img
                src="/logo-icon.png"
                alt="Kavro Drive"
                style={{ width: 48, height: 48, borderRadius: 12, border: '1px solid #E2E8F0' }}
              />
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 900, color: '#121A21', margin: 0 }}>
                  Como Instalar no Android
                </h3>
                <p style={{ fontSize: '0.74rem', color: '#64748B', margin: '2px 0 0 0' }}>
                  No Google Chrome:
                </p>
              </div>
            </div>

            <div style={{
              backgroundColor: '#F8FAFC',
              borderRadius: 14,
              padding: '12px 14px',
              border: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 10
            }}>
              <div style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                backgroundColor: '#EFF6FF',
                color: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Smartphone size={20} />
              </div>
              <div style={{ fontSize: '0.82rem', color: '#1E293B', lineHeight: 1.35 }}>
                <strong>1. Toque nos 3 Pontinhos (⋮)</strong><br />
                No canto superior direito do Google Chrome.
              </div>
            </div>

            <div style={{
              backgroundColor: '#F8FAFC',
              borderRadius: 14,
              padding: '12px 14px',
              border: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 16
            }}>
              <div style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                backgroundColor: '#DCFCE7',
                color: '#15803D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Download size={20} />
              </div>
              <div style={{ fontSize: '0.82rem', color: '#1E293B', lineHeight: 1.35 }}>
                <strong>2. Selecione "Instalar aplicativo"</strong><br />
                Ou <strong>"Adicionar à tela inicial"</strong>.
              </div>
            </div>

            <button
              onClick={() => setShowAndroidModal(false)}
              className="btn-primary"
              style={{
                width: '100%',
                padding: '13px',
                fontSize: '0.92rem',
                fontWeight: 800,
                borderRadius: 14
              }}
            >
              <span>Entendido!</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};

