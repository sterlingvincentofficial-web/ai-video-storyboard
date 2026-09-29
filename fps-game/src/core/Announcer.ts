import { settings } from './Settings';

/**
 * Cartoon announcer using the browser's speech synthesis (optional, no assets).
 * Lines are throttled so it never talks over itself.
 */
class Announcer {
  private voice: SpeechSynthesisVoice | null = null;
  private last = 0;
  private ok = typeof window !== 'undefined' && 'speechSynthesis' in window;

  constructor() {
    if (!this.ok) return;
    const pickVoice = () => {
      try {
        const vs = window.speechSynthesis.getVoices();
        this.voice = vs.find((v) => /en[-_](US|GB)/i.test(v.lang) && /male|daniel|fred|alex|google us/i.test(v.name)) ?? vs.find((v) => /^en/i.test(v.lang)) ?? null;
      } catch {
        this.ok = false;
      }
    };
    pickVoice();
    try {
      window.speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
    } catch {
      /* ignore */
    }
  }

  say(text: string, priority = false) {
    if (!this.ok || !settings.announcer || settings.master <= 0) return;
    const now = performance.now();
    if (!priority && now - this.last < 1600) return;
    this.last = now;
    try {
      const s = window.speechSynthesis;
      if (priority) s.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.pitch = 1.35;
      u.rate = 1.12;
      u.volume = Math.min(1, settings.master * 1.1);
      s.speak(u);
    } catch {
      this.ok = false;
    }
  }

  stop() {
    try {
      if (this.ok) window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}

export const announcer = new Announcer();
