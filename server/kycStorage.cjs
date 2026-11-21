const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

let supabaseClient = null;
let r2Client = null;
let r2CredKey = '';
let r2OverrideClient = null;

/**
 * Cliente Cloudflare R2 (S3-compatible Object Storage)
 * 10 GB Free, Zero Egress (tráfego grátis), máxima performance sem sobrecarregar o banco de dados.
 */
function getCloudflareR2() {
  if (r2OverrideClient) return r2OverrideClient;
  const accountId = (process.env.CLOUDFLARE_R2_ACCOUNT_ID || '').trim();
  const accessKeyId = (process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '').trim();
  if (!accountId || !accessKeyId || !secretAccessKey) {
    r2Client = null;
    r2CredKey = '';
    return null;
  }

  const nextCredKey = `${accountId}:${accessKeyId}`;
  if (r2Client && r2CredKey === nextCredKey) return r2Client;

  try {
    const { S3Client } = require('@aws-sdk/client-s3');
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    });
    r2CredKey = nextCredKey;
    console.log('[KYC Storage] Cloudflare R2 inicializado com sucesso.');
    return r2Client;
  } catch (err) {
    console.warn('[KYC Storage] Erro ao instanciar Cloudflare R2 Client:', err.message);
    return null;
  }
}

function setCloudflareR2ClientOverride(clientOrNull) {
  r2OverrideClient = clientOrNull || null;
}

function getR2PublicBaseUrl() {
  return (process.env.CLOUDFLARE_R2_PUBLIC_URL || '').trim().replace(/\/+$/, '');
}

function getR2PublicBucketName() {
  return (process.env.CLOUDFLARE_R2_PUBLIC_BUCKET || 'kavro-media').trim();
}

function getCloudflareR2Status() {
  const configured = Boolean(getCloudflareR2());
  const publicUrlBase = getR2PublicBaseUrl();
  const publicBucket = getR2PublicBucketName();
  const privateBucket = (process.env.CLOUDFLARE_R2_BUCKET || 'kyc-documents').trim();
  return {
    configured,
    publicConfigured: Boolean(configured && publicUrlBase && publicBucket),
    publicUrlBase: publicUrlBase || null,
    privateBucket,
    publicBucket
  };
}

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) return null;

  try {
    const { createClient } = require('@supabase/supabase-js');
    supabaseClient = createClient(url, key, {
      auth: { persistSession: false }
    });
    return supabaseClient;
  } catch (err) {
    console.warn('[KYC Storage] Erro ao instanciar Supabase Client:', err.message);
    return null;
  }
}

// Armazenamento local seguro caso Cloudflare R2 ou Supabase Storage não estejam com credenciais configuradas
function resolveLocalVaultDir() {
  const candidates = process.env.VERCEL
    ? [path.join(os.tmpdir(), 'kavro_kyc_vault')]
    : [path.resolve(__dirname, '.kyc_vault'), path.join(os.tmpdir(), 'kavro_kyc_vault')];
  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      return dir;
    } catch {}
  }
  return os.tmpdir();
}

const LOCAL_VAULT_DIR = resolveLocalVaultDir();

function inferExtensionAndMime(mimeType) {
  const normalized = String(mimeType || '').toLowerCase().split(';')[0].trim();
  if (normalized === 'application/pdf') return { ext: 'pdf', contentType: 'application/pdf' };
  if (normalized === 'image/png') return { ext: 'png', contentType: 'image/png' };
  if (normalized === 'image/webp') return { ext: 'webp', contentType: 'image/webp' };
  if (normalized === 'image/heic' || normalized === 'image/heif') return { ext: 'heic', contentType: normalized };
  if (normalized === 'audio/mp4' || normalized === 'audio/x-m4a' || normalized === 'video/mp4') {
    return { ext: 'm4a', contentType: 'audio/mp4' };
  }
  if (normalized === 'audio/ogg' || normalized === 'application/ogg') {
    return { ext: 'ogg', contentType: 'audio/ogg' };
  }
  if (normalized === 'audio/mpeg' || normalized === 'audio/mp3') {
    return { ext: 'mp3', contentType: 'audio/mpeg' };
  }
  if (normalized === 'audio/wav' || normalized === 'audio/wave' || normalized === 'audio/x-wav') {
    return { ext: 'wav', contentType: 'audio/wav' };
  }
  if (normalized === 'audio/webm' || normalized === 'video/webm') {
    return { ext: 'webm', contentType: 'audio/webm' };
  }
  return { ext: 'jpg', contentType: normalized.startsWith('image/') ? normalized : 'image/jpeg' };
}

function inferContentTypeFromFilename(filename) {
  const lower = String(filename || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.webm')) return 'audio/webm';
  if (lower.endsWith('.m4a') || lower.endsWith('.mp4')) return 'audio/mp4';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  return 'image/jpeg';
}

// Tokens temporários de visualização com assinatura HMAC stateless + compatibilidade em memória (15 minutos)
const tempSignedTokens = new Map();

function getKycTokenSecret() {
  const configured = String(process.env.ADMIN_SESSION_SECRET || '').trim();
  if (configured) return configured;
  return crypto
    .createHash('sha256')
    .update(`${process.env.DATABASE_URL || 'local'}:${process.env.ADMIN_MASTER_EMAIL || 'kavro'}:kyc_v1`)
    .digest('hex');
}

function signStatelessDocToken(payloadObj) {
  const encoded = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getKycTokenSecret())
    .update(`kyc.${encoded}`)
    .digest('base64url');
  return `kdoc_${encoded}_${sig}`;
}

function verifyStatelessDocToken(token) {
  if (!token || !String(token).startsWith('kdoc_')) return null;
  const parts = String(token).split('_');
  if (parts.length !== 3) return null;
  const [, encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getKycTokenSecret())
    .update(`kyc.${encoded}`)
    .digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!data || Number(data.exp || 0) < Date.now() || !data.filename) return null;
    return data;
  } catch {
    return null;
  }
}

function cleanExpiredTokens() {
  const now = Date.now();
  for (const [token, data] of tempSignedTokens.entries()) {
    if (data.expiresAt < now) {
      tempSignedTokens.delete(token);
    }
  }
}

async function savePrivateObject({ storagePath, fallbackFilename, dataUrlOrBuffer, defaultMimeType = 'image/jpeg' }) {
  let buffer;
  let detected = inferExtensionAndMime(defaultMimeType);

  if (typeof dataUrlOrBuffer === 'string') {
    const match = dataUrlOrBuffer.match(/^data:([^,;]+)(?:;[^,]*)?;base64,(.+)$/s);
    if (match) {
      detected = inferExtensionAndMime(match[1]);
      buffer = Buffer.from(match[2], 'base64');
    } else {
      buffer = Buffer.from(dataUrlOrBuffer, 'utf8');
    }
  } else {
    buffer = dataUrlOrBuffer;
  }

  const contentType = detected.contentType;

  // 1. PRIORIDADE: Cloudflare R2 (Bucket privado - 10 GB grátis, zero egress)
  const r2 = getCloudflareR2();
  if (r2) {
    try {
      const { PutObjectCommand } = require('@aws-sdk/client-s3');
      const bucket = process.env.CLOUDFLARE_R2_BUCKET || 'kyc-documents';
      await r2.send(new PutObjectCommand({
        Bucket: bucket,
        Key: storagePath,
        Body: buffer,
        ContentType: contentType
      }));

      return {
        storage: 'cloudflare_r2',
        path: storagePath,
        bucket,
        filename: fallbackFilename,
        contentType
      };
    } catch (err) {
      console.error('[KYC Storage] Falha no upload para Cloudflare R2, tentando fallback:', err.message);
    }
  }

  // 2. ALTERNATIVA: Supabase Storage Privado (Bucket kyc-documents)
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.storage.createBucket('kyc-documents', { public: false }).catch(() => {});

      const { data, error } = await supabase.storage
        .from('kyc-documents')
        .upload(storagePath, buffer, {
          contentType,
          upsert: true
        });

      if (!error && data) {
        return {
          storage: 'supabase',
          path: storagePath,
          filename: fallbackFilename,
          contentType
        };
      }
      console.warn('[KYC Storage] Falha no upload Supabase, utilizando cofre local:', error?.message);
    } catch (e) {
      console.warn('[KYC Storage] Exceção no upload Supabase:', e.message);
    }
  }

  // 3. FALLBACK: Armazenamento seguro no cofre local (ou /tmp em serverless)
  const vaultDir = resolveLocalVaultDir();
  const localFilePath = path.join(vaultDir, fallbackFilename);
  fs.writeFileSync(localFilePath, buffer);

  return {
    storage: 'local_vault',
    path: fallbackFilename,
    filename: fallbackFilename,
    contentType
  };
}

/**
 * Salva um documento (CNH ou Selfie) no Cloudflare R2, Supabase Storage privado ou cofre local seguro
 */
async function saveKycDocument(driverId, docType, dataUrlOrBuffer) {
  const isCnh = docType === 'cnh';
  const prefix = isCnh ? 'cnh' : 'selfie';
  const timestamp = Date.now();
  let defaultMime = 'image/jpeg';

  if (typeof dataUrlOrBuffer === 'string') {
    const match = dataUrlOrBuffer.match(/^data:([^,;]+)(?:;[^,]*)?;base64,/);
    if (match) defaultMime = match[1];
  }
  const { ext } = inferExtensionAndMime(defaultMime);
  const safeDriverId = sanitizeR2PathSegment(driverId, 'driver');
  const filename = `${prefix}_${safeDriverId}_${timestamp}.${ext}`;
  return savePrivateObject({
    storagePath: `drivers/${safeDriverId}/${filename}`,
    fallbackFilename: filename,
    dataUrlOrBuffer,
    defaultMimeType: defaultMime
  });
}

/**
 * Salva um clipe de áudio K-Áudio no cofre privado (Cloudflare R2 privado, Supabase privado ou cofre local)
 */
async function savePrivateSafetyAudio(rideId, clipId, dataUrlOrBuffer, rawMimeType = 'audio/webm') {
  let detectedMime = rawMimeType || 'audio/webm';
  if (typeof dataUrlOrBuffer === 'string') {
    const match = dataUrlOrBuffer.match(/^data:([^,;]+)(?:;[^,]*)?;base64,/);
    if (match) detectedMime = match[1];
  }
  const { ext } = inferExtensionAndMime(detectedMime);
  const safeRideId = sanitizeR2PathSegment(rideId, 'ride');
  const safeClipId = sanitizeR2PathSegment(clipId, `clip-${Date.now()}`);
  const filename = `kaudio_${safeRideId}_${safeClipId}.${ext}`;
  return savePrivateObject({
    storagePath: `safety-audio/${safeRideId}/${safeClipId}.${ext}`,
    fallbackFilename: filename,
    dataUrlOrBuffer,
    defaultMimeType: detectedMime
  });
}

/**
 * Gera uma URL temporária assinada (15 minutos) para visualização restrita
 */
async function generateTemporarySignedUrl(docInfo, driverId, reqHost) {
  if (!docInfo) return '';

  cleanExpiredTokens();

  // 1. URL assinada temporária do Cloudflare R2 (Presigned URL)
  if (docInfo.storage === 'cloudflare_r2' && docInfo.path) {
    const r2 = getCloudflareR2();
    if (r2) {
      try {
        const { GetObjectCommand } = require('@aws-sdk/client-s3');
        const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
        const bucket = docInfo.bucket || process.env.CLOUDFLARE_R2_BUCKET || 'kyc-documents';

        const signedUrl = await getSignedUrl(r2, new GetObjectCommand({
          Bucket: bucket,
          Key: docInfo.path
        }), { expiresIn: 900 }); // 15 minutos (900s)

        return signedUrl;
      } catch (e) {
        console.warn('[KYC Storage] Erro ao gerar Presigned URL no Cloudflare R2:', e.message);
      }
    }
  }

  // 2. URL assinada temporária do Supabase Storage
  const supabase = getSupabase();
  if (supabase && docInfo.storage === 'supabase' && docInfo.path) {
    try {
      const { data, error } = await supabase.storage
        .from('kyc-documents')
        .createSignedUrl(docInfo.path, 900); // 15 minutos (900s)

      if (!error && data?.signedUrl) {
        return data.signedUrl;
      }
    } catch (e) {
      console.warn('[KYC Storage] Erro ao gerar Signed URL no Supabase:', e.message);
    }
  }

  // 3. Token assinado stateless por HMAC-SHA256 para o cofre local (compatível com múltiplas instâncias serverless)
  const safeFilename = path.basename(String(docInfo.path || docInfo.filename || ''));
  const resolvedMime = docInfo.contentType || inferContentTypeFromFilename(safeFilename);
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutos
  const token = signStatelessDocToken({
    driverId,
    filename: safeFilename,
    contentType: resolvedMime,
    exp: expiresAt
  });

  tempSignedTokens.set(token, {
    driverId,
    filename: safeFilename,
    contentType: resolvedMime,
    expiresAt
  });

  const protocol = reqHost && reqHost.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${reqHost || 'localhost:5173'}/api/kyc/document/${token}`;
}

/**
 * Resolve e serve um documento a partir do token temporário assinado
 */
function resolveTemporaryDocument(token) {
  cleanExpiredTokens();
  let item = verifyStatelessDocToken(token);
  if (!item) {
    const legacyItem = tempSignedTokens.get(token);
    if (!legacyItem || legacyItem.expiresAt < Date.now()) {
      if (legacyItem) tempSignedTokens.delete(token);
      return null;
    }
    item = legacyItem;
  }

  const vaultDir = resolveLocalVaultDir();
  const safeFilename = path.basename(String(item.filename || ''));
  if (!safeFilename) return null;
  const filePath = path.join(vaultDir, safeFilename);
  if (!fs.existsSync(filePath)) return null;

  return {
    buffer: fs.readFileSync(filePath),
    contentType: item.contentType || inferContentTypeFromFilename(safeFilename),
    driverId: item.driverId
  };
}

/**
 * Elimina com segurança documentos do motorista (Conformidade LGPD / Retenção)
 */
async function purgeDriverDocuments(driverId, docInfos = []) {
  // 1. Deletar do Cloudflare R2 se presente
  const r2 = getCloudflareR2();
  if (r2) {
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    const bucket = process.env.CLOUDFLARE_R2_BUCKET || 'kyc-documents';
    for (const doc of docInfos) {
      if (doc && doc.storage === 'cloudflare_r2' && doc.path) {
        try {
          await r2.send(new DeleteObjectCommand({
            Bucket: bucket,
            Key: doc.path
          }));
        } catch (err) {
          console.warn('[KYC Storage] Erro ao purgar documento no Cloudflare R2:', err.message);
        }
      }
    }
  }

  // 2. Deletar do Supabase Storage
  const supabase = getSupabase();
  if (supabase) {
    const pathsToDelete = docInfos
      .filter(d => d && d.storage === 'supabase' && d.path)
      .map(d => d.path);

    if (pathsToDelete.length > 0) {
      try {
        await supabase.storage.from('kyc-documents').remove(pathsToDelete);
      } catch (err) {
        console.warn('[KYC Storage] Erro ao purgar documentos no Supabase:', err.message);
      }
    }
  }

  // 3. Remove do cofre local
  try {
    const files = fs.readdirSync(LOCAL_VAULT_DIR);
    for (const f of files) {
      if (f.includes(`_${driverId}_`)) {
        try {
          fs.unlinkSync(path.join(LOCAL_VAULT_DIR, f));
        } catch {}
      }
    }
  } catch {}

  return true;
}

const PUBLIC_MEDIA_EXT_MAP = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg'
};

function sanitizeR2PathSegment(rawId, fallback = 'anon') {
  const cleaned = String(rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/\.{2,}/g, '')
    .slice(0, 80);
  return cleaned || fallback;
}

function parseMediaDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const base64Match = dataUrl.match(
    /^data:((?:image\/[a-zA-Z0-9+.-]+)|application\/pdf)(?:;charset=[^;,]+)?;base64,(.+)$/i
  );
  if (base64Match) {
    const mimeType = base64Match[1].toLowerCase();
    const ext = PUBLIC_MEDIA_EXT_MAP[mimeType] || (mimeType.includes('pdf') ? 'pdf' : 'jpg');
    return {
      mimeType,
      ext,
      buffer: Buffer.from(base64Match[2], 'base64')
    };
  }

  // Suporta SVG inline em DataURL texto/utf8 sem base64
  const svgPlainMatch = dataUrl.match(/^data:(image\/svg\+xml)(?:;charset=[^;,]+)?,(.*)$/i);
  if (svgPlainMatch) {
    let rawBody = svgPlainMatch[2] || '';
    try {
      rawBody = decodeURIComponent(rawBody);
    } catch {
      // mantém literal caso já esteja decodificado
    }
    return {
      mimeType: 'image/svg+xml',
      ext: 'svg',
      buffer: Buffer.from(rawBody, 'utf8')
    };
  }

  return null;
}

function buildPublicMediaKey(ownerId, mediaType, ext, options = {}) {
  if (options && typeof options.key === 'string' && options.key.trim()) {
    return options.key.trim().replace(/^\/+/, '');
  }
  const safeOwner = sanitizeR2PathSegment(ownerId, 'anon');
  const suffix = `${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  switch (mediaType) {
    case 'client-avatar':
      return `clients/${safeOwner}/avatar_${suffix}.${ext}`;
    case 'partner-banner':
      return `partners/${safeOwner}/banner_${suffix}.${ext}`;
    case 'config-avatar':
      return `system/driver-avatar_${suffix}.${ext}`;
    case 'config-vehicle':
      return `system/driver-vehicle_${suffix}.${ext}`;
    case 'landing-banner':
      return `landing/${safeOwner}.${ext}`;
    case 'vehicle':
      return `drivers/${safeOwner}/vehicle_${suffix}.${ext}`;
    case 'crlv':
      return `drivers/${safeOwner}/crlv_${suffix}.${ext}`;
    case 'avatar':
    default:
      return `drivers/${safeOwner}/avatar_${suffix}.${ext}`;
  }
}

async function uploadBufferToPublicR2(key, buffer, contentType, cacheControl = 'public, max-age=31536000') {
  const r2 = getCloudflareR2();
  const publicBase = getR2PublicBaseUrl();
  const bucket = getR2PublicBucketName();
  if (!r2 || !publicBase || !bucket || !key || !buffer) {
    return null;
  }

  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  await r2.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream',
    CacheControl: cacheControl
  }));
  return `${publicBase}/${key}`;
}

/**
 * Salva mídia pública permanente (fotos de perfil, veículos, CRLV e banners) no Cloudflare R2 (bucket público kavro-media).
 * Retorna a URL pública curta para salvar no PostgreSQL em vez de Base64 gigante.
 */
async function savePublicMedia(ownerId, mediaType, dataUrlOrUrl, options = {}) {
  if (!dataUrlOrUrl || typeof dataUrlOrUrl !== 'string') return dataUrlOrUrl || '';
  if (!dataUrlOrUrl.startsWith('data:image/') && !dataUrlOrUrl.startsWith('data:application/pdf')) {
    return dataUrlOrUrl;
  }

  const parsed = parseMediaDataUrl(dataUrlOrUrl);
  if (!parsed || !parsed.buffer || parsed.buffer.length === 0) {
    return dataUrlOrUrl;
  }

  const key = buildPublicMediaKey(ownerId, mediaType, parsed.ext, options);

  try {
    const publicUrl = await uploadBufferToPublicR2(key, parsed.buffer, parsed.mimeType);
    return publicUrl || dataUrlOrUrl;
  } catch (err) {
    console.warn('[Public Media R2] Falha no upload para R2 público:', err.message);
    return dataUrlOrUrl;
  }
}

module.exports = {
  saveKycDocument,
  savePrivateSafetyAudio,
  savePublicMedia,
  uploadBufferToPublicR2,
  parseMediaDataUrl,
  buildPublicMediaKey,
  generateTemporarySignedUrl,
  resolveTemporaryDocument,
  purgeDriverDocuments,
  tempSignedTokens,
  getCloudflareR2,
  getCloudflareR2Status,
  getR2PublicBaseUrl,
  getR2PublicBucketName,
  setCloudflareR2ClientOverride
};
