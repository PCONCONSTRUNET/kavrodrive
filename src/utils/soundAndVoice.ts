// Utilitário de Sons Nativos, Navegação por Voz (Turn-by-turn) e Screen Wake Lock

let audioCtx: AudioContext | null = null;

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

/** Toca som agradável de chamada de corrida nova (estilo app de transporte executivo) */
export function playNewRideSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    
    // Arpeggio de 3 notas ascendentes (Dó5 -> Mi5 -> Sol5 -> Dó6) com envelope suave
    const notes = [
      { freq: 523.25, start: 0, dur: 0.12 }, // C5
      { freq: 659.25, start: 0.10, dur: 0.12 }, // E5
      { freq: 783.99, start: 0.20, dur: 0.16 }, // G5
      { freq: 1046.50, start: 0.32, dur: 0.35 }, // C6
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

    // Vibração tátil no celular se suportado
    if ('vibrate' in navigator) {
      navigator.vibrate([150, 80, 150, 80, 250]);
    }
  } catch (err) {
    console.warn('Erro ao reproduzir som de nova corrida:', err);
  }
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

