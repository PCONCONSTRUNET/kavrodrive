function decodeBase64HeaderAscii(dataUrl: string, maxChars = 1024): string {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) return '';
  const b64Sample = dataUrl.slice(commaIdx + 1, commaIdx + 1 + maxChars);
  try {
    return atob(b64Sample.slice(0, b64Sample.length - (b64Sample.length % 4)));
  } catch {
    return '';
  }
}

export function isAnimatedOrVectorDataUrl(dataUrl: string): boolean {
  if (!dataUrl) return false;
  if (
    dataUrl.startsWith('data:image/svg+xml') ||
    dataUrl.startsWith('data:image/gif')
  ) {
    return true;
  }
  if (dataUrl.startsWith('data:image/webp')) {
    const header = decodeBase64HeaderAscii(dataUrl, 512);
    return header.includes('ANIM') || header.includes('ANMF');
  }
  if (dataUrl.startsWith('data:image/png')) {
    const header = decodeBase64HeaderAscii(dataUrl, 2048);
    return header.includes('acTL');
  }
  return false;
}

/**
 * Redimensiona e comprime imagens DataURL via Canvas antes de enviar ao backend,
 * evitando estouro de limite de payload (ex.: 4,5 MB em funções serverless da Vercel).
 */
export function compressDataUrlForUpload(dataUrl: string, maxDim = 1280, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      resolve(dataUrl);
      return;
    }
    if (isAnimatedOrVectorDataUrl(dataUrl)) {
      resolve(dataUrl);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) {
        resolve(dataUrl);
        return;
      }
      const scale = Math.min(1, maxDim / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Comprime logos e banners estáticos e preserva GIFs animados / WebP animados / APNG / SVG sem achatar quadros.
 */
export function compressPartnerImageDataUrl(
  dataUrl: string,
  displayMode: 'logo' | 'banner' = 'logo'
): Promise<string> {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      resolve(dataUrl);
      return;
    }
    if (isAnimatedOrVectorDataUrl(dataUrl)) {
      resolve(dataUrl);
      return;
    }
    const maxDim = displayMode === 'banner' ? 1200 : 520;
    const preserveAlpha =
      dataUrl.startsWith('data:image/png') ||
      dataUrl.startsWith('data:image/webp');
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) {
        resolve(dataUrl);
        return;
      }
      const scale = Math.min(1, maxDim / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const mime = preserveAlpha ? 'image/webp' : 'image/jpeg';
      const compressed = canvas.toDataURL(mime, displayMode === 'banner' ? 0.84 : 0.88);
      resolve(compressed.length < dataUrl.length ? compressed : dataUrl);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

