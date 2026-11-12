import React, { useState } from 'react';

interface WhatsAppIconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Ícone Oficial Colorido do WhatsApp
 * Utiliza o logo original com alta fidelidade e fallback vetorial SVG garantido.
 */
export const WhatsAppIcon: React.FC<WhatsAppIconProps> = ({ size = 20, className, style }) => {
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return (
      <svg
        viewBox="0 0 48 48"
        width={size}
        height={size}
        className={className}
        style={{
          display: 'inline-block',
          verticalAlign: 'middle',
          flexShrink: 0,
          ...style
        }}
      >
        <circle cx="24" cy="24" r="23" fill="#25D366" />
        <path
          fill="#FFFFFF"
          d="M34.5 13.5C31.8 10.8 28.1 9.3 24.2 9.3C16.1 9.3 9.5 15.9 9.5 24C9.5 26.6 10.2 29.1 11.5 31.3L9 40.5L18.5 38C20.6 39.2 22.9 39.8 24.2 39.8H24.3C32.4 39.8 39 33.2 39 25.1C39 21.2 37.4 17.5 34.5 13.5ZM24.2 37.2C22 37.2 19.9 36.6 18 35.5L17.5 35.2L11.9 36.7L13.4 31.2L13.1 30.7C11.9 28.7 11.2 26.4 11.2 24C11.2 16.8 17 11 24.2 11C27.7 11 31 12.4 33.5 14.8C36 17.3 37.3 20.6 37.3 24.1C37.3 31.3 31.4 37.2 24.2 37.2ZM31.4 27.2C31 27 29 26 28.6 25.9C28.2 25.7 28 25.7 27.7 26.1C27.4 26.5 26.7 27.4 26.5 27.7C26.3 27.9 26 28 25.6 27.7C25.2 27.5 23.8 27.1 22.2 25.6C21 24.5 20.1 23.1 19.9 22.7C19.7 22.3 19.9 22.1 20.1 21.9C20.3 21.7 20.5 21.4 20.7 21.2C20.9 21 21 20.7 21.1 20.4C21.2 20.1 21.2 19.9 21.1 19.7C21 19.5 20.1 17.3 19.7 16.4C19.3 15.5 18.9 15.6 18.7 15.6C18.4 15.6 18.2 15.6 17.9 15.6C17.6 15.6 17.2 15.7 16.8 16.1C16.4 16.5 15.4 17.5 15.4 19.5C15.4 21.5 16.9 23.4 17.1 23.7C17.3 24 20 28.2 24.2 30C25.2 30.4 26 30.7 26.6 30.9C27.6 31.2 28.5 31.2 29.2 31.1C30 31 31.6 30.1 32 29.1C32.4 28.1 32.4 27.3 32.3 27.1C32.1 27.3 31.8 27.4 31.4 27.2Z"
        />
      </svg>
    );
  }

  return (
    <img
      src="https://img.icons8.com/color/48/whatsapp--v1.png"
      alt="WhatsApp"
      width={size}
      height={size}
      onError={() => setImgError(true)}
      className={className}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        objectFit: 'contain',
        ...style
      }}
    />
  );
};
