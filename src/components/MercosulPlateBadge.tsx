import React from 'react';
import { cleanPlate, formatPlate } from '../services/vehicleService';

interface MercosulPlateBadgeProps {
  plate?: string;
  size?: 'sm' | 'md' | 'lg';
  showBorder?: boolean;
}

export const MercosulPlateBadge: React.FC<MercosulPlateBadgeProps> = ({
  plate = '',
  size = 'md',
  showBorder = true,
}) => {
  const formatted = formatPlate(cleanPlate(plate)) || '--- • ---';

  // Configurações dimensionais baseadas no tamanho
  const dimensions = {
    sm: { width: 92, height: 28, fontSize: '0.85rem', headerHeight: 8, flagSize: 7 },
    md: { width: 130, height: 38, fontSize: '1.15rem', headerHeight: 11, flagSize: 10 },
    lg: { width: 165, height: 48, fontSize: '1.45rem', headerHeight: 14, flagSize: 12 },
  }[size];

  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        width: dimensions.width,
        height: dimensions.height,
        backgroundColor: '#FFFFFF',
        borderRadius: size === 'sm' ? 5 : 7,
        border: showBorder ? '1.5px solid #0F172A' : '1px solid #CBD5E1',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        overflow: 'hidden',
        boxSizing: 'border-box',
        userSelect: 'none',
        flexShrink: 0,
      }}
      title={`Placa Oficial Mercosul: ${formatted}`}
    >
      {/* Topo Azul Oficial Mercosul */}
      <div
        style={{
          height: dimensions.headerHeight,
          backgroundColor: '#003399',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 4px',
          boxSizing: 'border-box',
        }}
      >
        {/* Emblema Mercosul (4 pontinhos de estrelas) */}
        <div style={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <div style={{ width: 2, height: 2, borderRadius: '50%', backgroundColor: '#FFFFFF' }} />
          <div style={{ width: 2, height: 2, borderRadius: '50%', backgroundColor: '#FFFFFF' }} />
          <div style={{ width: 2, height: 2, borderRadius: '50%', backgroundColor: '#FFFFFF' }} />
        </div>

        {/* Texto BRASIL */}
        <span
          style={{
            color: '#FFFFFF',
            fontSize: size === 'sm' ? '0.45rem' : size === 'md' ? '0.55rem' : '0.68rem',
            fontWeight: 900,
            letterSpacing: '0.12em',
            lineHeight: 1,
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          BRASIL
        </span>

        {/* Bandeira do Brasil Minimalista em CSS */}
        <div
          style={{
            width: dimensions.flagSize * 1.3,
            height: dimensions.flagSize,
            backgroundColor: '#009b3a',
            borderRadius: 1,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {/* Losango Amarelo */}
          <div
            style={{
              width: dimensions.flagSize * 0.9,
              height: dimensions.flagSize * 0.6,
              backgroundColor: '#fedf00',
              transform: 'rotate(45deg)',
            }}
          />
          {/* Círculo Azul */}
          <div
            style={{
              position: 'absolute',
              width: dimensions.flagSize * 0.45,
              height: dimensions.flagSize * 0.45,
              borderRadius: '50%',
              backgroundColor: '#002776',
            }}
          />
        </div>
      </div>

      {/* Corpo da Placa com os Caracteres */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FFFFFF',
          paddingBottom: 1,
        }}
      >
        <span
          style={{
            fontFamily: "'Courier New', Courier, monospace, 'Plus Jakarta Sans', sans-serif",
            fontWeight: 900,
            fontSize: dimensions.fontSize,
            color: '#000000',
            letterSpacing: size === 'sm' ? '0.04em' : '0.08em',
            lineHeight: 1,
          }}
        >
          {formatted}
        </span>
      </div>
    </div>
  );
};

