import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface PixQrCodeProps {
  /** Código PIX "copia e cola" (EMV). O QR é gerado localmente a partir dele. */
  payload?: string;
  /** URL de imagem do gateway usada apenas como alternativa. */
  fallbackUrl?: string;
  size?: number;
}

/**
 * Renderiza o QR Code PIX gerado no próprio dispositivo (sem depender de serviços externos).
 * Se não houver código copia-e-cola, usa a imagem fornecida pelo gateway.
 */
export const PixQrCode: React.FC<PixQrCodeProps> = ({ payload, fallbackUrl, size = 200 }) => {
  const [dataUrl, setDataUrl] = useState<string>('');
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const code = String(payload || '').trim();
    if (!code) {
      setDataUrl('');
      return;
    }
    QRCode.toDataURL(code, { width: size * 2, margin: 1, errorCorrectionLevel: 'M' })
      .then((url: string) => {
        if (alive) setDataUrl(url);
      })
      .catch(() => {
        if (alive) setDataUrl('');
      });
    return () => {
      alive = false;
    };
  }, [payload, size]);

  const src = dataUrl || (!imgFailed ? fallbackUrl : '') || '';

  if (!src) {
    return (
      <div style={{ fontSize: '0.78rem', color: '#64748B', padding: 12, textAlign: 'center' }}>
        QR Code indisponível. Use o botão &ldquo;Copiar Código PIX&rdquo; abaixo.
      </div>
    );
  }

  return (
    <img
      src={src}
      alt="QR Code PIX"
      onError={() => setImgFailed(true)}
      style={{ width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' }}
    />
  );
};
