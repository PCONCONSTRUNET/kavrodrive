const fs = require('fs');
const path = require('path');

require('./env.cjs');
const db = require('./db.cjs');
const kycStorage = require('./kycStorage.cjs');

const STATIC_MIME_MAP = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

async function migrateSystemConfig() {
  const res = await db.query('SELECT id, config FROM public.system_config');
  let migratedCount = 0;

  for (const row of res.rows) {
    const cfg = row.config && typeof row.config === 'object' ? { ...row.config } : {};
    let changed = false;

    if (Array.isArray(cfg.partnerBanners)) {
      const nextBanners = [];
      for (const banner of cfg.partnerBanners) {
        if (banner && typeof banner.imageUrl === 'string' && banner.imageUrl.startsWith('data:')) {
          const uploadedUrl = await kycStorage.savePublicMedia(
            banner.id || 'partner',
            'partner-banner',
            banner.imageUrl
          );
          if (uploadedUrl && !uploadedUrl.startsWith('data:')) {
            nextBanners.push({ ...banner, imageUrl: uploadedUrl });
            changed = true;
            migratedCount++;
            continue;
          }
        }
        nextBanners.push(banner);
      }
      cfg.partnerBanners = nextBanners;
    }

    if (typeof cfg.driverPhoto === 'string' && cfg.driverPhoto.startsWith('data:')) {
      const url = await kycStorage.savePublicMedia('master', 'config-avatar', cfg.driverPhoto);
      if (url && !url.startsWith('data:')) {
        cfg.driverPhoto = url;
        changed = true;
        migratedCount++;
      }
    }

    if (typeof cfg.driverCarPhoto === 'string' && cfg.driverCarPhoto.startsWith('data:')) {
      const url = await kycStorage.savePublicMedia('master', 'config-vehicle', cfg.driverCarPhoto);
      if (url && !url.startsWith('data:')) {
        cfg.driverCarPhoto = url;
        changed = true;
        migratedCount++;
      }
    }

    if (changed) {
      await db.query(
        'UPDATE public.system_config SET config = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(cfg), row.id]
      );
    }
  }

  return migratedCount;
}

async function migrateDrivers() {
  const res = await db.query('SELECT id, photo, vehicle_photo, metadata FROM public.drivers');
  let migratedCount = 0;

  for (const row of res.rows) {
    let changed = false;
    let nextPhoto = row.photo;
    let nextVehiclePhoto = row.vehicle_photo;
    const nextMeta = row.metadata && typeof row.metadata === 'object' ? { ...row.metadata } : {};

    if (typeof nextPhoto === 'string' && nextPhoto.startsWith('data:')) {
      const url = await kycStorage.savePublicMedia(row.id, 'avatar', nextPhoto);
      if (url && !url.startsWith('data:')) {
        nextPhoto = url;
        changed = true;
        migratedCount++;
      }
    }

    if (typeof nextVehiclePhoto === 'string' && nextVehiclePhoto.startsWith('data:')) {
      const url = await kycStorage.savePublicMedia(row.id, 'vehicle', nextVehiclePhoto);
      if (url && !url.startsWith('data:')) {
        nextVehiclePhoto = url;
        changed = true;
        migratedCount++;
      }
    }

    if (typeof nextMeta.crlvDocumentPhoto === 'string' && nextMeta.crlvDocumentPhoto.startsWith('data:')) {
      const url = await kycStorage.savePublicMedia(row.id, 'crlv', nextMeta.crlvDocumentPhoto);
      if (url && !url.startsWith('data:')) {
        nextMeta.crlvDocumentPhoto = url;
        changed = true;
        migratedCount++;
      }
    }

    if (Array.isArray(nextMeta.vehicles)) {
      const updatedVehicles = [];
      for (const veh of nextMeta.vehicles) {
        const nextVeh = { ...veh };
        if (typeof nextVeh.vehiclePhoto === 'string' && nextVeh.vehiclePhoto.startsWith('data:')) {
          const url = await kycStorage.savePublicMedia(row.id, 'vehicle', nextVeh.vehiclePhoto);
          if (url && !url.startsWith('data:')) {
            nextVeh.vehiclePhoto = url;
            changed = true;
            migratedCount++;
          }
        }
        if (typeof nextVeh.crlvDocumentPhoto === 'string' && nextVeh.crlvDocumentPhoto.startsWith('data:')) {
          const url = await kycStorage.savePublicMedia(row.id, 'crlv', nextVeh.crlvDocumentPhoto);
          if (url && !url.startsWith('data:')) {
            nextVeh.crlvDocumentPhoto = url;
            changed = true;
            migratedCount++;
          }
        }
        updatedVehicles.push(nextVeh);
      }
      nextMeta.vehicles = updatedVehicles;
    }

    if (changed) {
      await db.query(
        `UPDATE public.drivers
         SET photo = $1, vehicle_photo = $2, metadata = $3, updated_at = NOW()
         WHERE id = $4`,
        [nextPhoto, nextVehiclePhoto, JSON.stringify(nextMeta), row.id]
      );
    }
  }

  return migratedCount;
}

async function migrateClients() {
  const res = await db.query("SELECT id, photo FROM public.clients WHERE photo LIKE 'data:%'");
  let migratedCount = 0;

  for (const row of res.rows) {
    const url = await kycStorage.savePublicMedia(row.id, 'client-avatar', row.photo);
    if (url && !url.startsWith('data:')) {
      await db.query('UPDATE public.clients SET photo = $1 WHERE id = $2', [url, row.id]);
      migratedCount++;
    }
  }

  return migratedCount;
}

async function migrateRides() {
  const res = await db.query("SELECT id, driver_id, driver_photo FROM public.rides WHERE driver_photo LIKE 'data:%'");
  let migratedCount = 0;

  for (const row of res.rows) {
    const owner = row.driver_id || `ride-${row.id}`;
    const url = await kycStorage.savePublicMedia(owner, 'avatar', row.driver_photo);
    if (url && !url.startsWith('data:')) {
      await db.query('UPDATE public.rides SET driver_photo = $1 WHERE id = $2', [url, row.id]);
      migratedCount++;
    }
  }

  return migratedCount;
}

async function uploadStaticLandingAssets() {
  const landingDir = path.resolve(__dirname, '..', 'public', 'landing');
  if (!fs.existsSync(landingDir)) return [];

  const uploaded = [];
  const files = fs.readdirSync(landingDir);
  for (const fileName of files) {
    const ext = path.extname(fileName).toLowerCase();
    const mime = STATIC_MIME_MAP[ext];
    if (!mime) continue;
    const filePath = path.join(landingDir, fileName);
    const buffer = fs.readFileSync(filePath);
    const key = `landing/${fileName}`;
    const url = await kycStorage.uploadBufferToPublicR2(key, buffer, mime);
    if (url) {
      uploaded.push({ fileName, key, url, sizeBytes: buffer.length });
    }
  }
  return uploaded;
}

async function runMigration() {
  const status = kycStorage.getCloudflareR2Status();
  if (!status.publicConfigured) {
    throw new Error('Cloudflare R2 público não configurado neste ambiente.');
  }

  const landingUploaded = await uploadStaticLandingAssets();
  const configCount = await migrateSystemConfig();
  const driversCount = await migrateDrivers();
  const clientsCount = await migrateClients();
  const ridesCount = await migrateRides();

  console.log('[R2 Migration] Concluída com sucesso:', {
    landingAssetsUploaded: landingUploaded.length,
    systemConfigMigrated: configCount,
    driversMigrated: driversCount,
    clientsMigrated: clientsCount,
    ridesMigrated: ridesCount
  });
  return {
    landingUploaded,
    configCount,
    driversCount,
    clientsCount,
    ridesCount
  };
}

if (require.main === module) {
  runMigration()
    .then(async () => {
      await db.pool?.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[R2 Migration] Erro:', err);
      await db.pool?.end();
      process.exit(1);
    });
}

module.exports = { runMigration };
