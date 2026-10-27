// Sound effects, optional music and haptics.
// Everything is silent until sound files are listed in sounds/manifest.json.
// Sounds are quiet by default. Music is off until she turns it on.
import { settings } from './settings.js';
import { asset } from './assets.js';

const LEVEL_SFX = { subtle: 0.3, full: 0.7 };
const LEVEL_MUSIC = { subtle: 0.22, full: 0.55 };
const EVENT_GROUP = { place: 'place', foundation: 'found', draw: 'slide', flip: 'flip', flagged: 'tick', win: 'win', denied: null };
const FALLBACK = { found: 'place' };          // an older cache without the chime still gets a sound

const VIBRATE = {
  subtle: { place: 8, draw: 8, foundation: 10, flagged: 12, win: [20, 40, 20], denied: 6 },
  full: { place: 18, draw: 10, foundation: 22, flagged: [25, 40, 25], win: [30, 50, 30, 50, 60], denied: [30, 40, 30] },
};

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.buffers = {};          // group -> [AudioBuffer]
    this.last = {};
    this.manifest = { effects: {}, music: [] };
    this.musicEl = null;
    this.musicGain = null;
    this.musicIndex = 0;
    this.musicOrder = [];
    this.ready = false;
    this.pending = null;        // a cued sound the board has not claimed yet
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch { /* not supported */ }
    document.addEventListener('visibilitychange', () => this.refreshMusic());
    settings.onChange(() => this.refreshMusic());
  }

  /** Must be called from a tap or click (browsers block audio until then). */
  async unlock() {
    if (this.ready) { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); return; }
    this.ready = true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    try {
      const res = await fetch(asset('sounds/manifest.json'), { cache: 'no-cache' });
      if (res.ok) this.manifest = await res.json();
    } catch { /* offline and not cached yet: stay silent */ }
    for (const [group, files] of Object.entries(this.manifest.effects || {})) {
      this.buffers[group] = [];
      for (const f of files) {
        try {
          const data = await (await fetch(asset('sounds/' + f))).arrayBuffer();
          this.buffers[group].push(await this.ctx.decodeAudioData(data));
        } catch { /* skip a bad file */ }
      }
    }
    this.musicOrder = (this.manifest.music || []).map((_, i) => i).sort(() => Math.random() - 0.5);
    this.refreshMusic();
  }

  /** Cue a move's sound. The board claims it and times it to the motion (the landing, the turn); if nothing
   *  claims it by the next tick (no board, Motion off), it just plays. */
  cue(event) {
    if (this.pending) { clearTimeout(this.pending.timer); this.play(this.pending.event); }
    const p = { event, timer: setTimeout(() => { if (this.pending === p) { this.pending = null; this.play(event); } }, 0) };
    this.pending = p;
  }

  /** The board takes the cued sound and plays it `delays[event]` ms from now (0 when motion is off). */
  claim(delays, opts) {
    const p = this.pending; if (!p) return;
    clearTimeout(p.timer); this.pending = null;
    this.play(p.event, delays[p.event] || 0, opts);
  }

  play(event, delayMs = 0, { rate = 1 } = {}) {
    if (delayMs > 0) setTimeout(() => this.haptic(event), delayMs); else this.haptic(event);
    if (!this.ctx || !settings.get('soundsOn') || !settings.get('effectsOn')) return;
    let group = EVENT_GROUP[event];
    if (group && !(this.buffers[group] || []).length) group = FALLBACK[group];
    const list = group && this.buffers[group];
    if (!list || !list.length) return;
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === this.last[group]) i = (i + 1) % list.length;
    this.last[group] = i;
    const src = this.ctx.createBufferSource();
    src.buffer = list[i];
    src.playbackRate.value = (0.97 + Math.random() * 0.06) * rate;
    const gain = this.ctx.createGain();
    const quiet = group === 'flip' ? 0.55 : group === 'found' ? 0.8 : 1;     // the paper and the bell sit under the card sounds
    gain.gain.value = LEVEL_SFX[settings.get('effectsLevel')] * (0.9 + Math.random() * 0.1) * quiet;
    src.connect(gain).connect(this.ctx.destination);
    src.start(this.ctx.currentTime + Math.max(0, delayMs) / 1000);
  }

  haptic(event) {
    const level = settings.get('hapticLevel');
    if (level === 'off' || !navigator.vibrate) return;
    const pattern = (VIBRATE[level] || {})[event];
    if (pattern) navigator.vibrate(pattern);
  }

  // ----- music -----

  get wantsMusic() {
    return settings.get('soundsOn') && settings.get('musicOn') && !document.hidden && this.musicOrder.length > 0;
  }

  refreshMusic() {
    if (!this.ctx) return;
    const level = LEVEL_MUSIC[settings.get('musicLevel')];
    if (this.wantsMusic) {
      if (!this.musicEl) this.startTrack();
      else {
        if (this.musicEl.paused) this.musicEl.play().catch(() => {});
        this.fadeTo(level, 0.5);
      }
    } else if (this.musicEl && !this.musicEl.paused) {
      this.fadeTo(0, 0.5);
      const el = this.musicEl;
      setTimeout(() => { if (!this.wantsMusic) el.pause(); }, 600);
    }
  }

  fadeTo(value, seconds) {
    if (!this.musicGain) return;
    const g = this.musicGain.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(value, t + seconds);
  }

  startTrack() {
    const file = this.manifest.music[this.musicOrder[this.musicIndex % this.musicOrder.length]];
    const el = new Audio(asset('sounds/' + file));
    el.crossOrigin = 'anonymous';
    const src = this.ctx.createMediaElementSource(el);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0;
    src.connect(this.musicGain).connect(this.ctx.destination);
    this.musicEl = el;
    el.onended = () => {
      this.musicEl = null;
      this.musicIndex += 1;
      setTimeout(() => this.refreshMusic(), 3000);   // a quiet gap between tracks
    };
    el.play().then(() => this.fadeTo(LEVEL_MUSIC[settings.get('musicLevel')], 2)).catch(() => { this.musicEl = null; });
  }
}
