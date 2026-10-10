// Settings live in localStorage (small, read synchronously) and are applied to <html>.

export const DEFAULTS = {
  drawMode: 1, scoringMode: 'standard', winnableDeals: true, tapToMove: false, catMode: 'endScreens', motion: 'calm', victory: 'random', light: 'auto',
  feedbackOn: true, feedbackTone: 'direct', undoPolicy: 'flaggedOnly',
  appearance: 'system', cardSize: 'large', tableStyle: 'calm', cardBack: 'blue', zoomEffect: true,
  soundsOn: true, effectsOn: true, effectsLevel: 'subtle', musicOn: false, musicLevel: 'subtle',
  hapticLevel: 'subtle',
};

const KEY = 'kittycat.settings.v1';
const listeners = new Set();
let values = { ...DEFAULTS };

try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  for (const k of Object.keys(DEFAULTS)) if (k in saved && typeof saved[k] === typeof DEFAULTS[k]) values[k] = saved[k];
} catch { /* first run */ }

export const settings = {
  get(key) { return values[key]; },
  all() { return { ...values }; },
  set(key, value) {
    if (!(key in DEFAULTS) || values[key] === value) return;
    values[key] = value;
    try { localStorage.setItem(KEY, JSON.stringify(values)); } catch { /* storage full or blocked */ }
    apply();
    listeners.forEach((fn) => fn(key, value));
  },
  replaceAll(obj) {
    for (const k of Object.keys(DEFAULTS)) if (k in obj && typeof obj[k] === typeof DEFAULTS[k]) values[k] = obj[k];
    try { localStorage.setItem(KEY, JSON.stringify(values)); } catch { /* ignore */ }
    apply();
    listeners.forEach((fn) => fn('*', null));
  },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

/** 0 = no animation, 1 = calm, 1.4 = lively. Reduce Motion always wins. */
export function motionScale() {
  if (reducedMotion() || values.motion === 'off') return 0;
  return values.motion === 'lively' ? 1.4 : 1;
}

/** dawn 5-9, day 9-17, dusk 17-21, night otherwise */
export function lightPhase(date = new Date()) {
  const h = date.getHours();
  return h >= 5 && h < 9 ? 'dawn' : h >= 9 && h < 17 ? 'day' : h >= 17 && h < 21 ? 'dusk' : 'night';
}

export function reducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

export function apply() {
  const root = document.documentElement;
  const a = values.appearance;
  const dark = a === 'dark' || (a === 'system' && media && media.matches);
  root.dataset.scheme = dark ? 'dark' : 'light';
  root.dataset.table = values.tableStyle;
  root.dataset.back = values.cardBack;
  root.dataset.size = values.cardSize;
  root.dataset.zoom = values.zoomEffect && !reducedMotion() ? 'on' : 'off';
  root.dataset.light = values.light === 'day' ? 'day' : values.light === 'evening' ? 'dusk' : lightPhase();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const colors = { calm: dark ? '#17241E' : '#7F9F8C', paws: dark ? '#2A2433' : '#BBAECB' };
    meta.setAttribute('content', colors[values.tableStyle] || colors.calm);
  }
}
if (media && media.addEventListener) media.addEventListener('change', apply);
setInterval(apply, 5 * 60 * 1000);                                   // the light follows the clock
document.addEventListener('visibilitychange', () => { if (!document.hidden) apply(); });
apply();

export const CARD_SCALE = { large: 1.0, medium: 0.9, small: 0.8 };
