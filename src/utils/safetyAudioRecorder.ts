export interface SafetyAudioClip {
  id: string;
  rideId?: string;
  rideCode?: string;
  createdAt: string;
  durationSec: number;
  mimeType: string;
  sizeBytes: number;
  blob: Blob;
  reportedToSos?: boolean;
  uploadedToCloud?: boolean;
  cloudStorage?: string;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === 'undefined') {
      reject(new Error('FileReader indisponível neste dispositivo.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao codificar áudio para envio.'));
    reader.readAsDataURL(blob);
  });
}

const DB_NAME = 'kavro_safety_audio_db';
const STORE_NAME = 'clips';
const DB_VERSION = 1;

function openAudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível neste dispositivo.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Erro ao abrir cofre local de áudio.'));
  });
}

export function isAudioCaptureSupported(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
      typeof MediaRecorder !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
  );
}

export async function saveSafetyAudioClip(clip: SafetyAudioClip): Promise<void> {
  const db = await openAudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(clip);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Falha ao salvar gravação de segurança.'));
    };
  });
}

export async function listSafetyAudioClips(): Promise<SafetyAudioClip[]> {
  try {
    const db = await openAudioDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        const rows = Array.isArray(req.result) ? (req.result as SafetyAudioClip[]) : [];
        rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        db.close();
        resolve(rows);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return [];
  }
}

export async function markSafetyAudioClipReported(
  clipId: string,
  cloudMeta?: { reportedToSos?: boolean; uploadedToCloud?: boolean; cloudStorage?: string }
): Promise<void> {
  try {
    const db = await openAudioDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(clipId);
      getReq.onsuccess = () => {
        const existing = getReq.result as SafetyAudioClip | undefined;
        if (existing) {
          store.put({
            ...existing,
            reportedToSos: cloudMeta?.reportedToSos !== undefined ? cloudMeta.reportedToSos : true,
            ...(cloudMeta?.uploadedToCloud !== undefined ? { uploadedToCloud: cloudMeta.uploadedToCloud } : {}),
            ...(cloudMeta?.cloudStorage ? { cloudStorage: cloudMeta.cloudStorage } : {})
          });
        }
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // fallback silencioso
  }
}

export async function deleteSafetyAudioClip(clipId: string): Promise<void> {
  const db = await openAudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(clipId);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Erro ao excluir gravação.'));
    };
  });
}

export interface ActiveAudioRecorderSession {
  stop: () => Promise<SafetyAudioClip>;
  cancel: () => void;
}

export async function startSafetyAudioCapture(options?: {
  rideId?: string;
  rideCode?: string;
  onTick?: (elapsedSec: number) => void;
}): Promise<ActiveAudioRecorderSession> {
  if (!isAudioCaptureSupported()) {
    throw new Error('Gravação de áudio não suportada neste navegador.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  const supportedMime =
    preferredTypes.find((m) => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(m)) ||
    '';

  const recorder = supportedMime
    ? new MediaRecorder(stream, { mimeType: supportedMime })
    : new MediaRecorder(stream);

  const chunks: BlobPart[] = [];
  const startedAtMs = Date.now();
  const createdAt = new Date(startedAtMs).toISOString();

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) {
      chunks.push(ev.data);
    }
  };

  const timer = window.setInterval(() => {
    options?.onTick?.(Math.max(1, Math.round((Date.now() - startedAtMs) / 1000)));
  }, 500);

  const stopTracks = () => {
    window.clearInterval(timer);
    stream.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        // ignore
      }
    });
  };

  recorder.start(1000);

  return {
    stop: () =>
      new Promise((resolve, reject) => {
        recorder.onerror = () => {
          stopTracks();
          reject(new Error('Falha ao finalizar gravação de áudio.'));
        };
        recorder.onstop = async () => {
          stopTracks();
          const mimeType = recorder.mimeType || supportedMime || 'audio/webm';
          const blob = new Blob(chunks, { type: mimeType });
          const durationSec = Math.max(1, Math.round((Date.now() - startedAtMs) / 1000));
          const clip: SafetyAudioClip = {
            id: `kaudio-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            rideId: options?.rideId,
            rideCode: options?.rideCode,
            createdAt,
            durationSec,
            mimeType,
            sizeBytes: blob.size,
            blob
          };
          try {
            await saveSafetyAudioClip(clip);
          } catch {
            // segue retornando clip em memória mesmo se storage estiver restrito
          }
          resolve(clip);
        };
        if (recorder.state !== 'inactive') {
          recorder.stop();
        } else {
          stopTracks();
        }
      }),
    cancel: () => {
      try {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      } catch {
        // ignore
      }
      stopTracks();
    }
  };
}
