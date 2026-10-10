// A small custom line-icon set (1.75 stroke, round caps) so the interface does not rely on text symbols.
const P = {
  menu: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  undo: '<path d="M9 7H15a4.5 4.5 0 0 1 0 9H8"/><path d="M12 4 8.5 7 12 10"/>',
  check: '<path d="M5 12.5 10 17.5 19 7"/>',
  close: '<path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  list: '<path d="M9 7h10M9 12h10M9 17h10"/><circle cx="5" cy="7" r=".9"/><circle cx="5" cy="12" r=".9"/><circle cx="5" cy="17" r=".9"/>',
  bars: '<path d="M6 19V11M12 19V5M18 19v-6"/>',
  sliders: '<path d="M5 8h8M17 8h2M5 16h2M11 16h8"/><circle cx="15" cy="8" r="2"/><circle cx="9" cy="16" r="2"/>',
  moves: '<path d="M6 8h11l-3-3M18 16H7l3 3"/>',
  paw: '<ellipse cx="12" cy="15.5" rx="4.6" ry="3.7"/><ellipse cx="6.6" cy="10.4" rx="1.7" ry="2.2"/><ellipse cx="9.8" cy="7.2" rx="1.8" ry="2.4"/><ellipse cx="14.2" cy="7.2" rx="1.8" ry="2.4"/><ellipse cx="17.4" cy="10.4" rx="1.7" ry="2.2"/>',
};

/** Returns an inline SVG string. name: menu, undo, check, close, plus, list, bars, sliders, paw. */
export function icon(name, size = 22) {
  const filled = name === 'paw';
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" ` +
    (filled ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"') +
    `>${P[name] || ''}</svg>`;
}
