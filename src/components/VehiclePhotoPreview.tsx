import React, { useEffect, useState } from 'react';
import {
  getCarColorProfile,
  getStudioVehicleFallback,
  resolveVehiclePhotoExact,
} from '../services/vehicleService';
import { MercosulPlateBadge } from './MercosulPlateBadge';
import { Camera } from 'lucide-react';

interface VehiclePhotoPreviewProps {
  photoUrl?: string;
  brand?: string;
  model?: string;
  colorName?: string;
  plate?: string;
  category?: string;
  year?: string;
  size?: 'compact' | 'normal' | 'large';
  showPlate?: boolean;
}

export const VehiclePhotoPreview: React.FC<VehiclePhotoPreviewProps> = ({
  photoUrl,
  brand = '',
  model = '',
  colorName = '',
  plate = '',
  category = 'Sedan Executivo',
  year = '',
  size = 'normal',
  showPlate = true,
}) => {
  const colorProfile = getCarColorProfile(colorName);
  const fullName = `${brand || ''} ${model || ''}`.trim() || 'Veículo em cadastramento';
  const hasPlate = Boolean(plate && plate.trim());

  const isCompact = size === 'compact';
  const isLarge = size === 'large';
  const containerHeight = photoUrl
    ? (isCompact ? 132 : isLarge ? 240 : 195)
    : (isCompact ? 124 : isLarge ? 215 : 168);

  const studioFallback = getStudioVehicleFallback(model, category, colorName);
  const [resolvedAutoUrl, setResolvedAutoUrl] = useState<string>(studioFallback);
  const [isExactMatch, setIsExactMatch] = useState<boolean>(false);

  useEffect(() => {
    if (photoUrl) return;
    let active = true;
    setResolvedAutoUrl(studioFallback);
    setIsExactMatch(false);
    resolveVehiclePhotoExact({
      brand,
      model,
      year,
      color: colorName,
      category,
    }).then((res) => {
      if (!active) return;
      if (res.photoUrl) {
        setResolvedAutoUrl(res.photoUrl);
        setIsExactMatch(res.source === 'exact_lookup');
      }
    });
    return () => {
      active = false;
    };
  }, [photoUrl, brand, model, year, colorName, category, studioFallback]);

  return (
    <div
      style={{
        width: '100%',
        backgroundColor: '#0F172A',
        borderRadius: isCompact ? 12 : 16,
        overflow: 'hidden',
        border: '1.5px solid #1E293B',
        boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Área da Imagem / Renderização do Carro */}
      <div
        style={{
          width: '100%',
          height: containerHeight,
          position: 'relative',
          backgroundColor: '#090D12',
          backgroundImage: 'radial-gradient(ellipse at 50% 65%, #1E293B 0%, #090D12 75%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {photoUrl ? (
          /* Foto Real do Veículo Enviada pelo Motorista (Fundo ambientado + foto inteira sem corte) */
          <div
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {/* Camada de fundo ambientada com blur para preencher qualquer proporção de tela sem tarjas */}
            <img
              src={photoUrl}
              alt=""
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: 'blur(20px) brightness(0.42)',
                transform: 'scale(1.15)',
                pointerEvents: 'none',
              }}
            />
            {/* Foto principal nítida e centralizada sem cortar o carro */}
            <img
              src={photoUrl}
              alt={fullName}
              style={{
                position: 'relative',
                zIndex: 1,
                maxWidth: '100%',
                maxHeight: '100%',
                width: 'auto',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
                filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.5))',
              }}
            />
            {/* Gradiente escuro sutil na base para contraste */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: 44,
                zIndex: 2,
                background: 'linear-gradient(to top, rgba(15,23,42,0.88), transparent)',
                pointerEvents: 'none',
              }}
            />
            {/* Selo Foto Real */}
            <div
              style={{
                position: 'absolute',
                top: 10,
                left: 10,
                zIndex: 3,
                backgroundColor: 'rgba(22, 163, 74, 0.92)',
                color: '#FFFFFF',
                fontSize: '0.65rem',
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: 999,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                backdropFilter: 'blur(4px)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              }}
            >
              <Camera size={11} />
              <span>Foto Real do Veículo</span>
            </div>
          </div>
        ) : (
          /* Veículo Elétrico Minimalista de Estúdio (fallback fotorrealista Kavro Drive) */
          <div
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              overflow: 'hidden',
              backgroundColor: '#090D12',
            }}
          >
            <img
              src={resolvedAutoUrl}
              alt={fullName}
              onError={() => {
                if (resolvedAutoUrl !== studioFallback) {
                  setResolvedAutoUrl(studioFallback);
                  setIsExactMatch(false);
                }
              }}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center 56%',
                display: 'block',
              }}
            />

            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to top, rgba(11,18,24,0.72) 0%, rgba(11,18,24,0.08) 48%, rgba(11,18,24,0.3) 100%)',
                pointerEvents: 'none',
              }}
            />

            {/* Badge discreta de Cor + Identificação */}
            <div
              style={{
                position: 'absolute',
                top: 8,
                left: 10,
                backgroundColor: 'rgba(11,18,24,0.82)',
                border: '1px solid rgba(118,216,0,0.3)',
                color: '#E2E8F0',
                fontSize: '0.64rem',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 999,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                backdropFilter: 'blur(6px)',
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: colorProfile.hex,
                  border: '1px solid rgba(255,255,255,0.65)',
                }}
              />
              <span>
                {colorProfile.label}
                {isExactMatch && year ? ` • ${year}` : ''}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Faixa Inferior de Especificações do Veículo */}
      <div
        style={{
          padding: isCompact ? '8px 12px' : '12px 16px',
          backgroundColor: '#121A21',
          borderTop: '1px solid #1E293B',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: isCompact ? '0.62rem' : '0.68rem',
                fontWeight: 800,
                color: '#76D800',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {category || 'Sedan Executivo'}
            </span>
            {year && year.trim() && (
              <>
                <span style={{ fontSize: '0.65rem', color: '#64748B' }}>•</span>
                <span style={{ fontSize: isCompact ? '0.65rem' : '0.72rem', color: '#94A3B8' }}>
                  Ano {year}
                </span>
              </>
            )}
          </div>

          <div
            style={{
              fontSize: isCompact ? '0.90rem' : '1.05rem',
              fontWeight: 800,
              color: '#FFFFFF',
              marginTop: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {fullName}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <div
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                backgroundColor: colorProfile.hex,
                border: '1px solid #475569',
              }}
            />
            <span style={{ fontSize: isCompact ? '0.68rem' : '0.74rem', color: '#CBD5E1', fontWeight: 600 }}>
              {colorProfile.label}
            </span>
          </div>
        </div>

        {/* Placa Oficial Mercosul (Exibida somente se cadastrada) */}
        {showPlate && hasPlate && (
          <div style={{ flexShrink: 0 }}>
            <MercosulPlateBadge plate={plate} size={isCompact ? 'sm' : 'md'} />
          </div>
        )}
      </div>
    </div>
  );
};

