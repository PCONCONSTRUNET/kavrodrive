const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let supabaseClient = null;
let r2Client = null;

/**
 * Cliente Cloudflare R2 (S3-compatible Object Storage)
 * 10 GB Free, Zero Egress (tráfego grátis), máxima performance sem sobrecarregar o banco de dados.
 */
function getCloudflareR2() {
  if (r2Client) return r2Client;
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;

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
    console.log('[KYC Storage] Cloudflare R2 inicializado com sucesso.');
    return r2Client;
  } catch (err) {
    console.warn('[KYC Storage] Erro ao instanciar Cloudflare R2 Client:', err.message);
    return null;
  }
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
const LOCAL_VAULT_DIR = path.resolve(__dirname, '.kyc_vault');
if (!fs.existsSync(LOCAL_VAULT_DIR)) {
  try {
    fs.mkdirSync(LOCAL_VAULT_DIR, { recursive: true });
  } catch {}
}

// Tokens temporários de visualização com expiração automática (15 minutos)
const tempSignedTokens = new Map();

function cleanExpiredTokens() {
  const now = Date.now();
  for (const [token, data] of tempSignedTokens.entries()) {
    if (data.expiresAt < now) {
      tempSignedTokens.delete(token);
    }
  }
}

/**
 * Salva um documento (CNH ou Selfie) no Cloudflare R2, Supabase Storage privado ou cofre local seguro
 */
async function saveKycDocument(driverId, docType, dataUrlOrBuffer) {
  const isCnh = docType === 'cnh';
  const prefix = isCnh ? 'cnh' : 'selfie';
  const timestamp = Date.now();
  const filename = `${prefix}_${driverId}_${timestamp}.jpg`;
  const storagePath = `drivers/${driverId}/${filename}`;

  let buffer;
  if (typeof dataUrlOrBuffer === 'string') {
    const match = dataUrlOrBuffer.match(/^data:image\/[a-zA-Z+]+;base64,(.+)$/);
    if (match) {
      buffer = Buffer.from(match[1], 'base64');
    } else {
      buffer = Buffer.from(dataUrlOrBuffer, 'utf8');
    }
  } else {
    buffer = dataUrlOrBuffer;
  }

  // 1. PRIORIDADE: Cloudflare R2 (Object Storage dedicado, 10 GB grátis, zero egress)
  const r2 = getCloudflareR2();
  if (r2) {
    try {
      const { PutObjectCommand } = require('@aws-sdk/client-s3');
      const bucket = process.env.CLOUDFLARE_R2_BUCKET || 'kyc-documents';
      await r2.send(new PutObjectCommand({
        Bucket: bucket,
        Key: storagePath,
        Body: buffer,
        ContentType: 'image/jpeg'
      }));

      return {
        storage: 'cloudflare_r2',
        path: storagePath,
        bucket,
        filename
      };
    } catch (err) {
      console.warn('[KYC Storage] Falha no upload para Cloudflare R2, tentando fallback:', err.message);
    }
  }

  // 2. ALTERNATIVA: Supabase Storage Privado (Bucket kyc-documents)
  const supabase = getSupabase();
  if (supabase) {
    try {
      // Garante que o bucket privado kyc-documents existe
      await supabase.storage.createBucket('kyc-documents', { public: false }).catch(() => {});

      const { data, error } = await supabase.storage
        .from('kyc-documents')
        .upload(storagePath, buffer, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (!error && data) {
        return {
          storage: 'supabase',
          path: storagePath,
          filename
        };
      }
      console.warn('[KYC Storage] Falha no upload Supabase, utilizando cofre local:', error?.message);
    } catch (e) {
      console.warn('[KYC Storage] Exceção no upload Supabase:', e.message);
    }
  }

  // 3. FALLBACK: Armazenamento seguro no cofre local (sem VPS externa)
  const localFilePath = path.join(LOCAL_VAULT_DIR, filename);
  fs.writeFileSync(localFilePath, buffer);

  return {
    storage: 'local_vault',
    path: filename,
    filename
  };
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

  // 3. Token assinado seguro para o cofre local
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutos

  tempSignedTokens.set(token, {
    driverId,
    filename: docInfo.path || docInfo.filename,
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
  const item = tempSignedTokens.get(token);
  if (!item) return null;
  if (item.expiresAt < Date.now()) {
    tempSignedTokens.delete(token);
    return null;
  }

  const filePath = path.join(LOCAL_VAULT_DIR, item.filename);
  if (!fs.existsSync(filePath)) return null;

  return {
    buffer: fs.readFileSync(filePath),
    contentType: 'image/jpeg',
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

/**
 * Salva mídia pública permanente (foto de perfil ou foto do veículo) no Cloudflare R2 (bucket público kavro-media)
 * Retorna a URL pública curta para salvar no PostgreSQL em vez de Base64 gigante.
 */
async function savePublicMedia(driverId, mediaType, dataUrlOrUrl) {
  if (!dataUrlOrUrl || typeof dataUrlOrUrl !== 'string') return dataUrlOrUrl || '';
  if (!dataUrlOrUrl.startsWith('data:image/')) return dataUrlOrUrl;

  const r2 = getCloudflareR2();
  const publicBase = (process.env.CLOUDFLARE_R2_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  const bucket = (process.env.CLOUDFLARE_R2_PUBLIC_BUCKET || 'kavro-media').trim();
  if (!r2 || !publicBase || !bucket) {
    return dataUrlOrUrl;
  }

  const match = dataUrlOrUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) return dataUrlOrUrl;

  const mimeType = match[1];
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const buffer = Buffer.from(match[2], 'base64');
  const safeType = mediaType === 'vehicle' ? 'vehicle' : 'avatar';
  const key = `drivers/${driverId}/${safeType}_${Date.now()}.${ext}`;

  try {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await r2.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      CacheControl: 'public, max-age=31536000'
    }));
    return `${publicBase}/${key}`;
  } catch (err) {
    console.warn('[Public Media R2] Falha no upload para R2 público:', err.message);
    return dataUrlOrUrl;
  }
}

module.exports = {
  saveKycDocument,
  savePublicMedia,
  generateTemporarySignedUrl,
  resolveTemporaryDocument,
  purgeDriverDocuments,
  tempSignedTokens,
  getCloudflareR2
};
