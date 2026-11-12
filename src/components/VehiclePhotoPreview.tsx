import React from 'react';
import { getCarColorProfile } from '../services/vehicleService';
import { MercosulPlateBadge } from './MercosulPlateBadge';
import { ShieldCheck, Sparkles, Camera } from 'lucide-react';

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
    ? (isCompact ? 155 : isLarge ? 250 : 210)
    : (isCompact ? 130 : isLarge ? 220 : 170);

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
          /* Renderização Vetorial / 3D Estilizada com a Cor Exata do Carro */
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              padding: '10px 14px',
            }}
          >
            {/* Badge de Cor e Representação */}
            <div
              style={{
                position: 'absolute',
                top: 8,
                left: 10,
                backgroundColor: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#E2E8F0',
                fontSize: '0.64rem',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 999,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                backdropFilter: 'blur(4px)',
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: colorProfile.hex,
                  border: '1px solid rgba(255,255,255,0.5)',
                  boxShadow: `0 0 6px ${colorProfile.hex}`,
                }}
              />
              <span>{colorProfile.label}</span>
            </div>

            {/* Ilustração Vetorial de Silhueta de Carro Executivo com Cor Dinâmica */}
            <svg
              viewBox="0 0 520 220"
              style={{
                width: isCompact ? '82%' : '88%',
                maxWidth: 420,
                height: 'auto',
                filter: 'drop-shadow(0 14px 18px rgba(0,0,0,0.65))',
              }}
            >
              <defs>
                {/* Gradiente da Carroceria com a Cor Escolhida */}
                <linearGradient id="bodyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={colorProfile.accent} stopOpacity="1" />
                  <stop offset="25%" stopColor={colorProfile.hex} stopOpacity="1" />
                  <stop offset="70%" stopColor={colorProfile.hex} stopOpacity="1" />
                  <stop offset="100%" stopColor={colorProfile.accent} stopOpacity="1" />
                </linearGradient>

                {/* Reflexo Metálico Superior */}
                <linearGradient id="metalHighlight" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.0" />
                  <stop offset="45%" stopColor="#FFFFFF" stopOpacity="0.35" />
                  <stop offset="75%" stopColor="#FFFFFF" stopOpacity="0.05" />
                </linearGradient>

                {/* Vidros Fumê Executivos */}
                <linearGradient id="windowTint" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#1E293B" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#0B132B" stopOpacity="0.98" />
                </linearGradient>

                {/* Roda e Pneu */}
                <radialGradient id="tireGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#334155" />
                  <stop offset="70%" stopColor="#1E293B" />
                  <stop offset="100%" stopColor="#0F172A" />
                </radialGradient>

                <linearGradient id="rimGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#F1F5F9" />
                  <stop offset="50%" stopColor="#94A3B8" />
                  <stop offset="100%" stopColor="#475569" />
                </linearGradient>
              </defs>

              {/* Sombra no Asfalto */}
              <ellipse cx="260" cy="195" rx="220" ry="14" fill="#000000" opacity="0.65" />

              {/* Corpo Principal da Carroceria (Sedan / SUV Executivo) */}
              <path
                d="M 55 155 
                   C 60 148, 75 142, 105 142 
                   C 118 142, 130 135, 145 115 
                   C 175 75, 230 68, 320 68 
                   C 365 68, 410 88, 435 118 
                   L 468 132 
                   C 485 138, 495 148, 495 158 
                   C 495 168, 482 172, 470 172 
                   L 425 172 
                   C 420 145, 360 145, 355 172 
                   L 175 172 
                   C 170 145, 110 145, 105 172 
                   L 60 172 
                   C 48 172, 45 165, 55 155 Z"
                fill="url(#bodyGradient)"
                stroke="#1E293B"
                strokeWidth="2"
              />

              {/* Brilho da Linha de Cintura */}
              <path
                d="M 55 155 Q 260 138 495 158"
                stroke="url(#metalHighlight)"
                strokeWidth="4"
                fill="none"
              />

              {/* Cabine / Janelas com Vidros Fumê */}
              <path
                d="M 152 114 
                   C 178 78, 226 73, 316 73 
                   C 356 73, 396 90, 422 116 
                   C 424 122, 400 126, 320 126 
                   C 240 126, 160 122, 152 114 Z"
                fill="url(#windowTint)"
                stroke="#475569"
                strokeWidth="2"
              />

              {/* Colunas das Portas (B-Pillar) */}
              <line x1="285" y1="73" x2="285" y2="126" stroke="#0F172A" strokeWidth="6" />

              {/* Farol Dianteiro com Led */}
              <polygon points="465,134 492,142 485,152 460,145" fill="#E0F2FE" opacity="0.9" />
              <polygon points="472,136 490,142 484,148 468,143" fill="#38BDF8" opacity="0.7" />

              {/* Lanterna Traseira Vermelha */}
              <polygon points="56,152 75,148 70,160 54,162" fill="#DC2626" opacity="0.9" />

              {/* Roda Dianteira */}
              <g transform="translate(390, 172)">
                <circle cx="0" cy="0" r="32" fill="url(#tireGrad)" stroke="#0F172A" strokeWidth="2" />
                <circle cx="0" cy="0" r="22" fill="url(#rimGrad)" stroke="#334155" strokeWidth="2" />
                <circle cx="0" cy="0" r="7" fill="#0F172A" />
                {/* Raios da Roda de Liga Leve */}
                <line x1="-18" y1="0" x2="18" y2="0" stroke="#E2E8F0" strokeWidth="3" />
                <line x1="0" y1="-18" x2="0" y2="18" stroke="#E2E8F0" strokeWidth="3" />
                <line x1="-13" y1="-13" x2="13" y2="13" stroke="#E2E8F0" strokeWidth="3" />
                <line x1="-13" y1="13" x2="13" y2="-13" stroke="#E2E8F0" strokeWidth="3" />
              </g>

              {/* Roda Traseira */}
              <g transform="translate(140, 172)">
                <circle cx="0" cy="0" r="32" fill="url(#tireGrad)" stroke="#0F172A" strokeWidth="2" />
                <circle cx="0" cy="0" r="22" fill="url(#rimGrad)" stroke="#334155" strokeWidth="2" />
                <circle cx="0" cy="0" r="7" fill="#0F172A" />
                {/* Raios da Roda */}
                <line x1="-18" y1="0" x2="18" y2="0" stroke="#E2E8F0" strokeWidth="3" />
                <line x1="0" y1="-18" x2="0" y2="18" stroke="#E2E8F0" strokeWidth="3" />
                <line x1="-13" y1="-13" x2="13" y2="13" stroke="#E2E8F0" strokeWidth="3" />
                <line x1="-13" y1="13" x2="13" y2="-13" stroke="#E2E8F0" strokeWidth="3" />
              </g>
            </svg>
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

