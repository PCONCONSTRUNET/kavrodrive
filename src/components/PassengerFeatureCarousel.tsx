import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Home,
  Briefcase,
  MapPin,
  Shield,
  Star,
  Dumbbell
} from 'lucide-react';
import { ClientProfile, LocationPoint, Ride, SystemConfig } from '../types';
import { StorageService } from '../services/storage';
import { AddressPickerModal } from './AddressPickerModal';
import { SafetyCenterModal } from './SafetyCenterModal';
import { SosEmergencyModal } from './SosEmergencyModal';
import { TermsPrivacyModal } from './TermsPrivacyModal';

interface PassengerFeatureCarouselProps {
  config: SystemConfig;
  currentUser: ClientProfile | null;
  activeRide?: Ride | null;
  recentDestinations?: LocationPoint[];
  onUserChange?: (updatedUser: ClientProfile) => void;
  onRequireAuth?: () => void;
}

const PRESET_MARKERS = [
  { id: 'Casa', icon: Home },
  { id: 'Trabalho', icon: Briefcase },
  { id: 'Academia', icon: Dumbbell },
  { id: 'Favorito', icon: Star }
];

export const PassengerFeatureCarousel: React.FC<PassengerFeatureCarouselProps> = ({
  config,
  currentUser,
  activeRide,
  recentDestinations = [],
  onUserChange,
  onRequireAuth
}) => {
  const [isAddFavoriteOpen, setIsAddFavoriteOpen] = useState(false);
  const [markerLabel, setMarkerLabel] = useState('Casa');
  const [draftAddress, setDraftAddress] = useState<LocationPoint | null>(null);
  const [isPickingAddress, setIsPickingAddress] = useState(false);
  const [favError, setFavError] = useState('');

  const [isSafetyHubOpen, setIsSafetyHubOpen] = useState(false);
  const [isSosOpen, setIsSosOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);

  const suggestedRecent = useMemo(() => {
    const saved = currentUser?.savedAddresses || [];
    const list = recentDestinations.length > 0 ? recentDestinations : StorageService.getRecentDestinations();
    return (
      list.find(
        (rec) =>
          rec?.address &&
          !saved.some((s) => s.address.trim().toLowerCase() === rec.address.trim().toLowerCase())
      ) || null
    );
  }, [currentUser?.savedAddresses, recentDestinations]);

  const suggestedName = useMemo(() => {
    if (!suggestedRecent) return '';
    const short = suggestedRecent.reference || suggestedRecent.address.split(',')[0] || suggestedRecent.address;
    return short.trim();
  }, [suggestedRecent]);

  const handleOpenFavoriteModal = () => {
    setFavError('');
    const saved = currentUser?.savedAddresses || [];
    const hasCasa = saved.some((a) => a.label.toLowerCase() === 'casa');
    const hasTrabalho = saved.some((a) => a.label.toLowerCase() === 'trabalho');
    setMarkerLabel(!hasCasa ? 'Casa' : !hasTrabalho ? 'Trabalho' : 'Favorito');
    setDraftAddress(suggestedRecent || null);
    setIsAddFavoriteOpen(true);
  };

  const handleSaveFavoriteLocation = () => {
    if (!currentUser) {
      setIsAddFavoriteOpen(false);
      onRequireAuth?.();
      return;
    }
    const cleanLabel = markerLabel.trim() || 'Favorito';
    if (!draftAddress || !draftAddress.address) {
      setFavError('Selecione o endereço no mapa ou pela busca para salvar.');
      return;
    }
    const nextItem = {
      id: `addr-${Date.now()}`,
      label: cleanLabel,
      address: draftAddress.address,
      lat: draftAddress.lat,
      lng: draftAddress.lng
    };
    const updatedUser: ClientProfile = {
      ...currentUser,
      savedAddresses: [...(currentUser.savedAddresses || []), nextItem]
    };
    StorageService.setCurrentUser(updatedUser);
    StorageService.saveClient(updatedUser);
    onUserChange?.(updatedUser);
    setIsAddFavoriteOpen(false);
    setDraftAddress(null);
    setFavError('');
  };

  const favoriteModal = isAddFavoriteOpen
    ? createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10055,
            backgroundColor: 'rgba(15, 23, 42, 0.56)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-end',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}
          onClick={() => setIsAddFavoriteOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 480,
              minHeight: '72dvh',
              maxHeight: '92dvh',
              backgroundColor: '#FFFFFF',
              borderRadius: '22px 22px 0 0',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 -12px 36px rgba(0,0,0,0.28)'
            }}
          >
            {/* Header estilo Uber */}
            <div style={{ padding: '16px 18px 8px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                type="button"
                onClick={() => setIsAddFavoriteOpen(false)}
                aria-label="Voltar"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  backgroundColor: '#F3F4F6',
                  border: 'none',
                  color: '#111111',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <ArrowLeft size={19} />
              </button>
            </div>

            <div style={{ padding: '4px 18px 16px 18px', flex: 1, overflowY: 'auto' }}>
              <h2 style={{ margin: '0 0 14px 0', fontSize: '1.42rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.02em' }}>
                Adicionar um local salvo
              </h2>

              <div style={{
                backgroundColor: '#EFF6FF',
                border: '1px solid #DBEAFE',
                borderRadius: 12,
                padding: '11px 13px',
                fontSize: '0.8rem',
                color: '#1E3A8A',
                fontWeight: 600,
                lineHeight: 1.4,
                marginBottom: 18
              }}>
                Salve seus locais frequentes para selecionar sua origem ou destino em 1 toque na tela inicial.
              </div>

              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>
                Marcador de local
              </label>

              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
                {PRESET_MARKERS.map((preset) => {
                  const IconComp = preset.icon;
                  const active = markerLabel.trim().toLowerCase() === preset.id.toLowerCase();
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setMarkerLabel(preset.id)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        borderRadius: 999,
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: active ? '1.5px solid #111111' : '1px solid #E5E7EB',
                        backgroundColor: active ? '#111111' : '#F8FAFC',
                        color: active ? '#FFFFFF' : '#334155'
                      }}
                    >
                      <IconComp size={13} />
                      <span>{preset.id}</span>
                    </button>
                  );
                })}
              </div>

              <input
                type="text"
                value={markerLabel}
                onChange={(e) => setMarkerLabel(e.target.value)}
                placeholder="Ex: Casa, Trabalho, Academia..."
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  height: 46,
                  padding: '0 14px',
                  borderRadius: 12,
                  border: '1px solid #E5E7EB',
                  backgroundColor: '#F3F4F6',
                  color: '#0F172A',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  marginBottom: 18,
                  outline: 'none'
                }}
              />

              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>
                Endereço
              </label>

              <button
                type="button"
                onClick={() => {
                  setFavError('');
                  setIsPickingAddress(true);
                }}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '13px 14px',
                  borderRadius: 12,
                  border: '1px solid #E5E7EB',
                  backgroundColor: '#F8FAFC',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <MapPin size={17} color="#111111" style={{ flexShrink: 0 }} />
                  <span style={{
                    fontSize: '0.88rem',
                    fontWeight: draftAddress ? 700 : 500,
                    color: draftAddress ? '#0F172A' : '#64748B',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {draftAddress ? draftAddress.address : 'Buscar endereço ou marcar no mapa'}
                  </span>
                </div>
                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#276EF1', flexShrink: 0 }}>
                  {draftAddress ? 'Alterar' : 'Selecionar'}
                </span>
              </button>

              {favError && (
                <div style={{
                  marginTop: 12,
                  padding: '9px 12px',
                  borderRadius: 10,
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  color: '#B91C1C',
                  fontSize: '0.78rem',
                  fontWeight: 700
                }}>
                  {favError}
                </div>
              )}
            </div>

            <div style={{ padding: '12px 18px calc(18px + env(safe-area-inset-bottom, 0px)) 18px', borderTop: '1px solid #F1F5F9', backgroundColor: '#FFFFFF' }}>
              <button
                type="button"
                onClick={handleSaveFavoriteLocation}
                style={{
                  width: '100%',
                  height: 48,
                  borderRadius: 12,
                  border: 'none',
                  backgroundColor: '#111111',
                  color: '#FFFFFF',
                  fontSize: '0.94rem',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                Salvar local
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      {/* Carrossel Horizontal Estilo Uber (Favorito <-> Segurança) */}
      <div className="kavro-hscroll" style={{ padding: '2px 0 4px 0' }}>
        {/* Card 1: Adicionar local favorito */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleOpenFavoriteModal}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleOpenFavoriteModal();
            }
          }}
          style={{
            flex: '0 0 85%',
            scrollSnapAlign: 'start',
            borderRadius: 18,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'stretch',
            minHeight: 118,
            backgroundColor: '#0E2452',
            boxShadow: '0 6px 18px rgba(14, 36, 82, 0.16)',
            cursor: 'pointer'
          }}
        >
          <div style={{
            flex: 1,
            padding: '15px 14px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minWidth: 0
          }}>
            <div style={{
              fontSize: '0.98rem',
              fontWeight: 900,
              color: '#FFFFFF',
              lineHeight: 1.22,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}>
              {suggestedName ? `Salvar ${suggestedName}` : 'Salvar seu local favorito'}
            </div>
            <span style={{
              alignSelf: 'flex-start',
              marginTop: 10,
              backgroundColor: 'rgba(15, 23, 42, 0.72)',
              color: '#FFFFFF',
              borderRadius: 999,
              padding: '6px 13px',
              fontSize: '0.75rem',
              fontWeight: 700,
              whiteSpace: 'nowrap'
            }}>
              Adicionar como favorito
            </span>
          </div>

          <div style={{
            width: 108,
            backgroundColor: '#1E54D6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            position: 'relative'
          }}>
            <div style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              backgroundColor: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Star size={44} color="#FACC15" fill="#FACC15" strokeWidth={1.6} />
            </div>
          </div>
        </div>

        {/* Card 2: Personalize seus recursos de segurança */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsSafetyHubOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsSafetyHubOpen(true);
            }
          }}
          style={{
            flex: '0 0 85%',
            scrollSnapAlign: 'start',
            borderRadius: 18,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'stretch',
            minHeight: 118,
            backgroundColor: '#1C6AE4',
            boxShadow: '0 6px 18px rgba(28, 106, 228, 0.18)',
            cursor: 'pointer'
          }}
        >
          <div style={{
            flex: 1,
            padding: '15px 14px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minWidth: 0
          }}>
            <div style={{
              fontSize: '0.98rem',
              fontWeight: 900,
              color: '#FFFFFF',
              lineHeight: 1.22
            }}>
              Personalize seus recursos de segurança
            </div>
            <span style={{
              alignSelf: 'flex-start',
              marginTop: 10,
              backgroundColor: '#111827',
              color: '#FFFFFF',
              borderRadius: 999,
              padding: '6px 14px',
              fontSize: '0.75rem',
              fontWeight: 700,
              whiteSpace: 'nowrap'
            }}>
              Configurar agora
            </span>
          </div>

          <div style={{
            width: 108,
            backgroundColor: '#BFDBFE',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <div style={{
              width: 68,
              height: 68,
              borderRadius: '50%',
              backgroundColor: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(29, 78, 216, 0.18)'
            }}>
              <Shield size={34} color="#1D4ED8" strokeWidth={2.3} />
            </div>
          </div>
        </div>
      </div>

      {favoriteModal}

      <AddressPickerModal
        isOpen={isPickingAddress}
        onClose={() => setIsPickingAddress(false)}
        title="Selecionar endereço favorito"
        initialPoint={draftAddress || undefined}
        onSelect={(pt) => {
          setDraftAddress(pt);
          setIsPickingAddress(false);
        }}
      />

      <SafetyCenterModal
        isOpen={isSafetyHubOpen}
        onClose={() => setIsSafetyHubOpen(false)}
        config={config}
        currentUser={currentUser}
        activeRide={activeRide}
        onUserChange={(updatedClient) => {
          onUserChange?.(updatedClient);
        }}
        onRequireAuth={onRequireAuth}
        onOpenSos={() => setIsSosOpen(true)}
        onOpenTerms={() => setIsTermsOpen(true)}
      />

      <SosEmergencyModal
        isOpen={isSosOpen}
        onClose={() => setIsSosOpen(false)}
        currentLocationText={
          currentUser ? `Cliente: ${currentUser.name} (${currentUser.phone})` : 'Lauro Müller e Região - SC'
        }
        rideId={activeRide?.id}
        driverPhone={config?.driverPhone || config?.companyPhone || config?.companyWhatsapp}
      />

      <TermsPrivacyModal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
        config={config}
      />
    </>
  );
};
