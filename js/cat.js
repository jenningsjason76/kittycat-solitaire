// The cat: one SVG, five states (idle, perk, flick, sleep, cheer), driven by CSS (see styles.css).
// It sits in the empty slot of the top row, or large on the win and end screens.

export function catHTML(extraClass = '') {
  return `<div class="cat ${extraClass}" data-state="idle" aria-hidden="true">
<svg class="cat-svg" viewBox="0 0 100 150" xmlns="http://www.w3.org/2000/svg">
  <ellipse class="cat-shadow" cx="54" cy="140" rx="38" ry="6.5"/>
  <g class="cat-tail"><path class="tail" d="M76 133 C 99 136 104 106 91 96"/></g>
  <g class="cat-body">
    <path class="fur" d="M37 66 C 26 84 24 112 27 137 L 82 137 C 88 112 80 86 62 68 Z"/>
    <ellipse class="fur" cx="65" cy="117" rx="22" ry="21"/>
    <path class="fur-hi" d="M62 70 C 78 84 86 108 80 128"/>
    <ellipse class="bib" cx="41" cy="86" rx="9" ry="15"/>
    <ellipse class="bib" cx="39" cy="137" rx="9" ry="5.5"/>
    <ellipse class="bib" cx="52" cy="138" rx="8.5" ry="5"/>
    <g class="paw-up"><path class="arm" d="M33 98 C 22 92 19 80 22 66"/><ellipse class="bib" cx="22" cy="63" rx="6" ry="7.5"/></g>
  </g>
  <g class="cat-head">
    <g class="ear ear-l"><path class="fur" d="M24 43 L 27 16 L 45 33 Z"/><path class="ear-in" d="M29 37 L 30 24 L 39 33 Z"/></g>
    <g class="ear ear-r"><path class="fur" d="M45 33 L 63 16 L 67 43 Z"/><path class="ear-in" d="M50 33 L 60 24 L 62 37 Z"/></g>
    <ellipse class="fur" cx="45" cy="52" rx="24" ry="21"/>
    <ellipse class="face-blaze" cx="45" cy="57" rx="11" ry="11"/>
    <g class="eyes">
      <g class="eye-open"><ellipse class="eye" cx="36" cy="52" rx="4.3" ry="4.8"/><ellipse class="pupil" cx="36" cy="52" rx="1.5" ry="3.8"/><ellipse class="eye" cx="54" cy="52" rx="4.3" ry="4.8"/><ellipse class="pupil" cx="54" cy="52" rx="1.5" ry="3.8"/></g>
      <g class="eye-closed"><path d="M31.5 53 Q 36 56.5 40.5 53"/><path d="M49.5 53 Q 54 56.5 58.5 53"/></g>
      <g class="eye-happy"><path d="M31.5 55 Q 36 49 40.5 55"/><path d="M49.5 55 Q 54 49 58.5 55"/></g>
    </g>
    <path class="nose" d="M42.5 60 L 47.5 60 L 45 63 Z"/>
    <path class="mouth" d="M45 63 Q 42.5 67 39 65 M45 63 Q 47.5 67 51 65"/>
    <path class="whisker" d="M31 62 L 12 58 M31 65 L 12 67 M59 62 L 78 58 M59 65 L 78 67"/>
  </g>
</svg></div>`;
}

export function setCatState(state, flick = false) {
  document.querySelectorAll('.cat').forEach((c) => {
    c.dataset.state = state;
    if (flick) { c.removeAttribute('data-flick'); void c.offsetWidth; c.setAttribute('data-flick', ''); }
  });
}
