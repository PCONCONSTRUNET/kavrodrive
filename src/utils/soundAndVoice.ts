// Utilitário de Sons Nativos, Navegação por Voz (Turn-by-turn) e Screen Wake Lock

export const NEW_RIDE_RINGTONE_URL = '/sounds/new-ride-toq3.mp3';

let audioCtx: AudioContext | null = null;
let rideRingtoneAudio: HTMLAudioElement | null = null;
let lastRingtoneStartMs = 0;
let audioUnlocked = false;
let remainingRingtonePlays = 0;
let ringtonePlaybackSessionId = 0;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function getRideRingtoneElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (!rideRingtoneAudio) {
    const audio = new Audio(NEW_RIDE_RINGTONE_URL);
    audio.preload = 'auto';
    rideRingtoneAudio = audio;
  }
  return rideRingtoneAudio;
}

function playSyntheticFallbackTone(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [
      { freq: 523.25, start: 0, dur: 0.12 },
      { freq: 659.25, start: 0.10, dur: 0.12 },
      { freq: 783.99, start: 0.20, dur: 0.16 },
      { freq: 1046.50, start: 0.32, dur: 0.35 }
    ];

    notes.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(0.28, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.05);
    });
  } catch {
    // ignore fallback error
  }
}

/** Desbloqueia o elemento de áudio em navegadores/PWAs após o primeiro toque do usuário */
export function unlockNewRideAudio(): void {
  if (typeof window === 'undefined' || audioUnlocked) return;
  try {
    getAudioContext();
    const audio = getRideRingtoneElement();
    if (!audio) return;
    audio.muted = true;
    const p = audio.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        audioUnlocked = true;
      }).catch(() => {
        audio.muted = false;
      });
    } else {
      audio.muted = false;
      audioUnlocked = true;
    }
  } catch {
    // ignore unlock error
  }
}

/** Para imediatamente a melodia de nova corrida (ao aceitar, recusar ou encerrar o modal) */
export function stopNewRideSound(): void {
  try {
    ringtonePlaybackSessionId += 1;
    remainingRingtonePlays = 0;
    if (!rideRingtoneAudio) return;
    rideRingtoneAudio.onended = null;
    rideRingtoneAudio.loop = false;
    rideRingtoneAudio.pause();
    rideRingtoneAudio.currentTime = 0;
  } catch {
    // ignore stop error
  }
}

/** Toca a melodia personalizada de chamada de corrida nova (/sounds/new-ride-toq3.mp3) até repeatCount vezes (padrão: 3) */
export function playNewRideSound(options?: { repeatCount?: number; loop?: boolean }): void {
  try {
    const targetPlays = Math.max(1, options?.repeatCount ?? 3);
    const nowMs = Date.now();
    const audio = getRideRingtoneElement();

    if (audio) {
      audio.muted = false;
      audio.volume = 1.0;

      // Evita reiniciar a melodia se acabou de iniciar (<800ms) no radar/modal simultaneamente
      if (!audio.paused && nowMs - lastRingtoneStartMs < 800) {
        return;
      }

      ringtonePlaybackSessionId += 1;
      const sessionId = ringtonePlaybackSessionId;
      remainingRingtonePlays = targetPlays - 1;
      audio.loop = false;
      audio.onended = () => {
        if (sessionId !== ringtonePlaybackSessionId || remainingRingtonePlays <= 0) {
          audio.onended = null;
          audio.currentTime = 0;
          return;
        }
        remainingRingtonePlays -= 1;
        audio.currentTime = 0;
        const replayPromise = audio.play();
        if (replayPromise && typeof replayPromise.catch === 'function') {
          replayPromise.catch(() => {
            remainingRingtonePlays = 0;
            audio.onended = null;
          });
        }
      };

      audio.currentTime = 0;
      lastRingtoneStartMs = nowMs;

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          remainingRingtonePlays = 0;
          audio.onended = null;
          playSyntheticFallbackTone();
        });
      }
    } else {
      playSyntheticFallbackTone();
    }

    // Vibração tátil no celular se suportado
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([180, 90, 180, 90, 260]);
    }
  } catch (err) {
    console.warn('Erro ao reproduzir som de nova corrida:', err);
  }
}

if (typeof window !== 'undefined') {
  const handleFirstGesture = () => {
    unlockNewRideAudio();
    if (audioUnlocked) {
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
    }
  };
  window.addEventListener('pointerdown', handleFirstGesture, { passive: true });
  window.addEventListener('keydown', handleFirstGesture, { passive: true });
}

/** Reproduz uma instrução de navegação por voz (Turn-by-Turn) usando a API nativa de síntese */
export function speakVoiceInstruction(text: string, voiceEnabled: boolean): void {
  if (!voiceEnabled || !text || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }

  try {
    // Interrompe qualquer fala anterior para evitar sobreposição ou atraso
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.05; // Velocidade natural e dinâmica
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Tenta encontrar uma voz em pt-BR (Google português, Luciana, etc.)
    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find(v => v.lang.startsWith('pt-BR') || v.lang.startsWith('pt'));
    if (ptVoice) {
      utterance.voice = ptVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Erro ao falar instrução por voz:', err);
  }
}

/** Cancela qualquer fala ativa no momento */
export function stopVoiceSpeech(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

/** Estrutura de passo de rota do OSRM */
export interface RouteStep {
  instruction: string;
  shortText: string;
  modifier?: string;
  type?: string;
  location: [number, number]; // [lat, lng]
  distanceMeters: number;
  streetName: string;
}

/** Traduz a manobra do OSRM para português falado e texto amigável */
export function translateOsrmStep(step: any): RouteStep {
  const maneuver = step.maneuver || {};
  const type = maneuver.type || 'turn';
  const modifier = maneuver.modifier || '';
  const streetName = (step.name || '').trim();
  const distance = Math.round(step.distance || 0);

  let actionText = 'Siga em frente';
  let shortText = 'Siga em frente';

  if (type === 'depart') {
    actionText = streetName ? `Inicie a rota na ${streetName}` : 'Inicie a rota seguindo em frente';
    shortText = 'Inicie o trajeto';
  } else if (type === 'arrive') {
    actionText = 'Você está chegando ao destino';
    shortText = 'Destino à frente';
  } else if (type === 'roundabout' || type === 'rotary') {
    const exit = maneuver.exit ? `${maneuver.exit}ª` : '';
    actionText = exit ? `Na rotatória, pegue a ${exit} saída` : 'Entre na rotatória';
    shortText = exit ? `Rotatória (${exit} saída)` : 'Rotatória';
  } else if (modifier === 'left') {
    actionText = streetName ? `Vire à esquerda na ${streetName}` : 'Vire à esquerda';
    shortText = 'Vire à esquerda';
  } else if (modifier === 'right') {
    actionText = streetName ? `Vire à direita na ${streetName}` : 'Vire à direita';
    shortText = 'Vire à direita';
  } else if (modifier === 'slight left') {
    actionText = streetName ? `Mantenha-se à esquerda na ${streetName}` : 'Mantenha-se à esquerda';
    shortText = 'Mantenha à esquerda';
  } else if (modifier === 'slight right') {
    actionText = streetName ? `Mantenha-se à direita na ${streetName}` : 'Mantenha-se à direita';
    shortText = 'Mantenha à direita';
  } else if (modifier === 'sharp left') {
    actionText = streetName ? `Curva acentuada à esquerda na ${streetName}` : 'Curva acentuada à esquerda';
    shortText = 'Curva à esquerda';
  } else if (modifier === 'sharp right') {
    actionText = streetName ? `Curva acentuada à direita na ${streetName}` : 'Curva acentuada à direita';
    shortText = 'Curva à direita';
  } else if (modifier === 'uturn') {
    actionText = 'Faça o retorno quando possível';
    shortText = 'Faça o retorno';
  } else if (streetName) {
    actionText = `Continue na ${streetName}`;
    shortText = 'Continue';
  }

  // OSRM retorna location como [lng, lat], convertemos para [lat, lng]
  const location: [number, number] = maneuver.location
    ? [maneuver.location[1], maneuver.location[0]]
    : [0, 0];

  return {
    instruction: actionText,
    shortText,
    modifier,
    type,
    location,
    distanceMeters: distance,
    streetName
  };
}

/** Gerenciador do Screen Wake Lock (Impede que a tela do celular apague durante a navegação) */
export class ScreenWakeLockManager {
  private sentinel: any = null;
  private isRequested = false;

  public async request(): Promise<boolean> {
    this.isRequested = true;
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return false;
    }
    if (document.visibilityState !== 'visible') {
      return false;
    }
    try {
      this.sentinel = await (navigator as any).wakeLock.request('screen');
      this.sentinel.addEventListener('release', () => {
        this.sentinel = null;
      });
      return true;
    } catch (err) {
      console.warn('Falha ao ativar Screen Wake Lock:', err);
      return false;
    }
  }

  public release(): void {
    this.isRequested = false;
    if (this.sentinel) {
      try {
        this.sentinel.release().catch(() => {});
      } catch { /* noop */ }
      this.sentinel = null;
    }
  }

  public handleVisibilityChange(): void {
    if (this.isRequested && document.visibilityState === 'visible' && !this.sentinel) {
      this.request();
    }
  }
}

