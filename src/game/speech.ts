let sharedAudioCtx: AudioContext | null = null;

function playTone(freqStart: number, freqEnd: number, duration = 0.24) {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume();
    }
    const now = sharedAudioCtx.currentTime;
    const osc = sharedAudioCtx.createOscillator();
    const gain = sharedAudioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, now + duration * 0.7);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(sharedAudioCtx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  } catch {
    // Audio playback restricted
  }
}

export function playSuccessChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume();
    }
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      if (!sharedAudioCtx) return;
      const now = sharedAudioCtx.currentTime + idx * 0.08;
      const osc = sharedAudioCtx.createOscillator();
      const gain = sharedAudioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(sharedAudioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.24);
    });
  } catch {
    // Audio playback restricted
  }
}

export interface ArabicSpeakResult {
  supported: boolean;
  hasArabicVoice: boolean;
}

export function speakArabic(text: string, onEnd?: () => void): ArabicSpeakResult {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    playTone(480, 640);
    if (onEnd) setTimeout(onEnd, 320);
    return { supported: false, hasArabicVoice: false };
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA';
    utterance.rate = 0.85;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const arabicVoice =
      voices.find((v) => v.lang.toLowerCase().startsWith('ar-sa')) ||
      voices.find((v) => v.lang.toLowerCase().startsWith('ar'));

    if (arabicVoice) {
      utterance.voice = arabicVoice;
    }

    utterance.onend = () => onEnd?.();
    utterance.onerror = () => {
      playTone(480, 640);
      onEnd?.();
    };

    window.speechSynthesis.speak(utterance);

    if (!arabicVoice) {
      playTone(480, 640);
    }

    return { supported: true, hasArabicVoice: Boolean(arabicVoice) };
  } catch {
    playTone(480, 640);
    if (onEnd) setTimeout(onEnd, 320);
    return { supported: false, hasArabicVoice: false };
  }
}
