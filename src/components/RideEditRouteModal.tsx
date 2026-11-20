import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, ArrowRight, Pencil, RefreshCw, X } from 'lucide-react';
import { LocationPoint, Ride, SystemConfig } from '../types';
import { calculateRidePrice, StorageService, canPassengerEditRoute } from '../services/storage';
import { calculateHaversineDistance, estimateDurationMinutes } from '../utils/geo';
import { formatRideCode } from '../utils/format';
import { AddressPickerModal } from './AddressPickerModal';

interface RideEditRouteModalProps {
  isOpen: boolean;
  ride: Ride | null;
  config: SystemConfig;
  onClose: () => void;
  onUpdated: (updatedRide: Ride) => void;
}

const RideEditRouteModalBody: React.FC<{
  ride: Ride;
  config: SystemConfig;
  onClose: () => void;
  onUpdated: (updatedRide: Ride) => void;
}> = ({ ride, config, onClose, onUpdated }) => {
  const [draftOrigin, setDraftOrigin] = useState<LocationPoint>(ride.origin);
  const [draftDestination, setDraftDestination] = useState<LocationPoint>(ride.destination);
  const [pickingField, setPickingField] = useState<'origin' | 'destination' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const originChanged =
    draftOrigin.address !== ride.origin.address ||
    Math.abs(draftOrigin.lat - ride.origin.lat) > 0.0001 ||
    Math.abs(draftOrigin.lng - ride.origin.lng) > 0.0001;
  const destChanged =
    draftDestination.address !== ride.destination.address ||
    Math.abs(draftDestination.lat - ride.destination.lat) > 0.0001 ||
    Math.abs(draftDestination.lng - ride.destination.lng) > 0.0001;
  const hasChanged = originChanged || destChanged;

  const previewMetrics = useMemo(() => {
    const distanceKm = calculateHaversineDistance(
      draftOrigin.lat,
      draftOrigin.lng,
      draftDestination.lat,
      draftDestination.lng
    );
    const durationMin = estimateDurationMinutes(distanceKm);
    const pricing = calculateRidePrice(
      distanceKm,
      durationMin,
      ride.time || '12:00',
      config,
      ride.category || 'kavro_go',
      undefined,
      ride.paymentMethod
    );
    return {
      distanceKm,
      durationMin,
      estimatedTotal: pricing.totalPrice
    };
  }, [
    draftOrigin.lat,
    draftOrigin.lng,
    draftDestination.lat,
    draftDestination.lng,
    ride.time,
    ride.category,
    ride.paymentMethod,
    config
  ]);

  const canEdit = canPassengerEditRoute(ride);
  const isPaidPix =
    ride.paymentMethod === 'pix' &&
    (ride.paymentStatus === 'confirmado' || ride.paymentStatus === 'pago');

  const handleSaveRoute = async () => {
    if (!canEdit || !hasChanged || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    const res = await StorageService.updateRideRoute(ride.id, {
      origin: draftOrigin,
      destination: draftDestination,
      distanceKm: previewMetrics.distanceKm,
      durationMin: previewMetrics.durationMin
    });
    setSubmitting(false);
    if (!res.ok || !res.ride) {
      setErrorMsg(res.error || 'Não foi possível atualizar a rota agora.');
      return;
    }
    onUpdated(res.ride);
  };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10060,
          backgroundColor: 'rgba(15, 23, 42, 0.62)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}
        onClick={() => {
          if (!submitting && !pickingField) onClose();
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 480,
            backgroundColor: '#FFFFFF',
            borderRadius: '22px 22px 0 0',
            padding: '14px 18px calc(20px + env(safe-area-inset-bottom, 0px)) 18px',
            boxShadow: '0 -10px 36px rgba(0,0,0,0.28)',
            boxSizing: 'border-box'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <div style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: '#E2E8F0' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {formatRideCode(ride)} • Antes de iniciar
              </div>
              <h3 style={{ margin: '2px 0 0 0', fontSize: '1.1rem', fontWeight: 900, color: '#0F172A' }}>
                Alterar origem ou destino
              </h3>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              aria-label="Fechar"
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                border: 'none',
                backgroundColor: '#F1F5F9',
                color: '#0F172A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: submitting ? 'not-allowed' : 'pointer',
                flexShrink: 0
              }}
            >
              <X size={17} />
            </button>
          </div>

          {/* Pontos editáveis estilo Uber */}
          <div style={{ position: 'relative', marginTop: 14 }}>
            <div
              style={{
                position: 'absolute',
                left: 17,
                top: 26,
                bottom: 26,
                width: 1.5,
                backgroundColor: '#CBD5E1',
                pointerEvents: 'none',
                zIndex: 2
              }}
            />

            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setErrorMsg(null);
                setPickingField('origin');
              }}
              style={{
                width: '100%',
                backgroundColor: originChanged ? '#EFF6FF' : '#F8FAFC',
                border: originChanged ? '1.5px solid #93C5FD' : '1px solid #E2E8F0',
                borderRadius: 13,
                padding: '10px 12px 10px 36px',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                cursor: 'pointer',
                textAlign: 'left',
                position: 'relative'
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: 13,
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  border: '2.5px solid #111111',
                  backgroundColor: '#FFFFFF',
                  boxSizing: 'border-box',
                  zIndex: 3
                }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                  Embarque
                </div>
                <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {draftOrigin.address}
                </div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 800, color: '#276EF1', flexShrink: 0 }}>
                <Pencil size={12} />
                <span>Alterar</span>
              </span>
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setErrorMsg(null);
                setPickingField('destination');
              }}
              style={{
                width: '100%',
                backgroundColor: destChanged ? '#EFF6FF' : '#F8FAFC',
                border: destChanged ? '1.5px solid #93C5FD' : '1px solid #E2E8F0',
                borderRadius: 13,
                padding: '10px 12px 10px 36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                cursor: 'pointer',
                textAlign: 'left',
                position: 'relative'
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: 13,
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  backgroundColor: '#111111',
                  zIndex: 3
                }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                  Destino
                </div>
                <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {draftDestination.address}
                </div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 800, color: '#276EF1', flexShrink: 0 }}>
                <Pencil size={12} />
                <span>Alterar</span>
              </span>
            </button>
          </div>

          {/* Prévia de tarifa recalculada */}
          <div
            style={{
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: 12,
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10
            }}
          >
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>
                {hasChanged
                  ? `Novo trajeto: ${previewMetrics.distanceKm.toFixed(1)} km (~${previewMetrics.durationMin} min)`
                  : `Trajeto atual: ${ride.distanceKm.toFixed(1)} km (~${ride.durationMin} min)`}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: 2, fontWeight: 600 }}>
                {isPaidPix
                  ? 'PIX já pago: destinos mais curtos geram estorno da diferença.'
                  : ride.driverId
                    ? `${ride.driverName || 'O motorista'} receberá a nova rota em tempo real.`
                    : 'A tarifa será recalculada automaticamente.'}
              </div>
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {hasChanged && Math.abs(previewMetrics.estimatedTotal - ride.totalPrice) >= 0.05 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 900, fontSize: '0.94rem', color: '#0F172A' }}>
                  <span style={{ fontSize: '0.74rem', color: '#94A3B8', textDecoration: 'line-through', fontWeight: 700 }}>
                    R$ {ride.totalPrice.toFixed(2).replace('.', ',')}
                  </span>
                  <ArrowRight size={13} color="#64748B" />
                  <span>R$ {previewMetrics.estimatedTotal.toFixed(2).replace('.', ',')}</span>
                </div>
              ) : (
                <div style={{ fontSize: '0.96rem', fontWeight: 900, color: '#0F172A' }}>
                  R$ {(hasChanged ? previewMetrics.estimatedTotal : ride.totalPrice).toFixed(2).replace('.', ',')}
                </div>
              )}
            </div>
          </div>

          {errorMsg && (
            <div
              style={{
                marginTop: 10,
                padding: '9px 11px',
                borderRadius: 10,
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#B91C1C',
                fontSize: '0.78rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 7
              }}
            >
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
            <button
              type="button"
              disabled={!canEdit || !hasChanged || submitting}
              onClick={handleSaveRoute}
              style={{
                width: '100%',
                height: 44,
                borderRadius: 12,
                border: 'none',
                backgroundColor: !canEdit || !hasChanged ? '#CBD5E1' : '#111111',
                color: '#FFFFFF',
                fontSize: '0.88rem',
                fontWeight: 800,
                cursor: !canEdit || !hasChanged || submitting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              }}
            >
              {submitting && <RefreshCw size={15} className="animate-spin" />}
              <span>{submitting ? 'Atualizando rota...' : 'Confirmar nova rota'}</span>
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              style={{
                width: '100%',
                height: 40,
                borderRadius: 12,
                border: 'none',
                backgroundColor: '#F1F5F9',
                color: '#0F172A',
                fontSize: '0.84rem',
                fontWeight: 800,
                cursor: submitting ? 'not-allowed' : 'pointer'
              }}
            >
              Cancelar edição
            </button>
          </div>
        </div>
      </div>

      <AddressPickerModal
        isOpen={Boolean(pickingField)}
        onClose={() => setPickingField(null)}
        title={pickingField === 'origin' ? 'Alterar local de embarque' : 'Alterar destino'}
        initialPoint={pickingField === 'origin' ? draftOrigin : draftDestination}
        onSelect={(pt) => {
          if (pickingField === 'origin') {
            setDraftOrigin(pt);
          } else if (pickingField === 'destination') {
            setDraftDestination(pt);
          }
          setPickingField(null);
        }}
      />
    </>
  );
};

export const RideEditRouteModal: React.FC<RideEditRouteModalProps> = ({
  isOpen,
  ride,
  config,
  onClose,
  onUpdated
}) => {
  if (!isOpen || !ride) return null;

  const content = (
    <RideEditRouteModalBody
      key={`${ride.id}-${ride.origin.address}-${ride.destination.address}`}
      ride={ride}
      config={config}
      onClose={onClose}
      onUpdated={onUpdated}
    />
  );

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }
  return content;
};
