/* Minimal inline icon set (stroke style, 24×24 grid). */

const paths = {
  play: '<path d="M7 4.9v14.2c0 .9 1 1.5 1.8 1L20 13.1a1.3 1.3 0 0 0 0-2.2L8.8 3.9C8 3.4 7 4 7 4.9Z" fill="currentColor" stroke="none"/>',
  pause:
    '<rect x="6.4" y="4" width="4.2" height="16" rx="1.5" fill="currentColor" stroke="none"/><rect x="13.4" y="4" width="4.2" height="16" rx="1.5" fill="currentColor" stroke="none"/>',
  prev:
    '<path d="M18.8 5.3v13.4c0 .9-1 1.5-1.8.9L8 12.9a1.1 1.1 0 0 1 0-1.8l9-6.7c.8-.6 1.8 0 1.8.9Z" fill="currentColor" stroke="none"/><rect x="4.2" y="5" width="2.4" height="14" rx="1.2" fill="currentColor" stroke="none"/>',
  next:
    '<path d="M5.2 5.3v13.4c0 .9 1 1.5 1.8.9L16 12.9a1.1 1.1 0 0 0 0-1.8L7 4.4c-.8-.6-1.8 0-1.8.9Z" fill="currentColor" stroke="none"/><rect x="17.4" y="5" width="2.4" height="14" rx="1.2" fill="currentColor" stroke="none"/>',
  shuffle:
    '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.8-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/>',
  repeat:
    '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  repeat1:
    '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/><path d="M11 10h1.2v4"/>',
  heart:
    '<path d="M19.4 14.2c1.5-1.5 2.8-3.2 2.8-5.4A5.3 5.3 0 0 0 16.9 3c-1.7 0-3 .6-4.4 2-1.4-1.4-2.7-2-4.4-2A5.3 5.3 0 0 0 2.8 8.8c0 2.2 1.3 3.9 2.8 5.4L12 20.5l7.4-6.3Z"/>',
  heartFill:
    '<path d="M19.4 14.2c1.5-1.5 2.8-3.2 2.8-5.4A5.3 5.3 0 0 0 16.9 3c-1.7 0-3 .6-4.4 2-1.4-1.4-2.7-2-4.4-2A5.3 5.3 0 0 0 2.8 8.8c0 2.2 1.3 3.9 2.8 5.4L12 20.5l7.4-6.3Z" fill="currentColor" stroke="none"/>',
  search: '<circle cx="11" cy="11" r="7.4"/><path d="m20.6 20.6-4.2-4.2"/>',
  home:
    '<path d="m3.2 9.4 8.8-6.8 8.8 6.8V20a2 2 0 0 1-2 2H5.2a2 2 0 0 1-2-2V9.4Z"/><path d="M9.2 22v-9.5h5.6V22"/>',
  library:
    '<path d="m16.2 6.3 3.9 13.4"/><path d="M11.9 6.2v13.6"/><path d="M7.7 7.8v12"/><path d="M3.7 4.5v15.3"/>',
  clock: '<circle cx="12" cy="12" r="9.2"/><path d="M12 7.4V12l3.2 1.9"/>',
  queue: '<path d="M21 15V6"/><path d="M18.4 18.2a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Z"/><path d="M12.4 12H3"/><path d="M16.2 6H3"/><path d="M12.4 18H3"/>',
  volume:
    '<path d="M11 5.2 6.4 8.8H3v6.4h3.4L11 18.8V5.2Z"/><path d="M15.2 8.6a4.8 4.8 0 0 1 0 6.8"/><path d="M18.3 5.5a9.2 9.2 0 0 1 0 13"/>',
  volume1:
    '<path d="M11 5.2 6.4 8.8H3v6.4h3.4L11 18.8V5.2Z"/><path d="M15.2 8.6a4.8 4.8 0 0 1 0 6.8"/>',
  volumeX:
    '<path d="M11 5.2 6.4 8.8H3v6.4h3.4L11 18.8V5.2Z"/><path d="m16 9 5 5"/><path d="m21 9-5 5"/>',
  expand:
    '<path d="M14.5 3.5H20.5V9.5"/><path d="M9.5 20.5H3.5V14.5"/><path d="m20.5 3.5-6.2 6.2"/><path d="m3.5 20.5 6.2-6.2"/>',
  collapse:
    '<path d="M9.5 3.5v6h-6"/><path d="M14.5 20.5v-6h6"/><path d="M3.5 9.5l6-6"/><path d="M20.5 14.5l-6 6"/>',
  chevronDown: '<path d="m6 9.5 6 6 6-6"/>',
  chevronLeft: '<path d="m15 18.5-6.5-6.5L15 5.5"/>',
  arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  arrowRight: '<path d="m12 5 7 7-7 7"/><path d="M5 12h14"/>',
  arrowUpRight: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  more: '<circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  verified:
    '<circle cx="12" cy="12" r="9.2" fill="currentColor" stroke="none"/><path d="m8 12.2 2.6 2.6 5.4-5.8" stroke="#0a0f03" stroke-width="2.2"/>',
  music:
    '<path d="M9 18V5.5L21 3v12.5"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="15.5" r="2.8"/>',
  disc: '<circle cx="12" cy="12" r="9.2"/><circle cx="12" cy="12" r="2.6"/>',
  sparkles:
    '<path d="m12 2.8 1.8 5.2 5.2 1.8-5.2 1.8L12 16.8l-1.8-5.2L5 9.8l5.2-1.8L12 2.8Z"/><path d="M19 15.5 19.9 18l2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9.9-2.5Z"/>',
  trash:
    '<path d="M4 7h16"/><path d="M9.5 7V4.8h5V7"/><path d="m6.2 7 .8 13.2a1.8 1.8 0 0 0 1.8 1.6h6.4a1.8 1.8 0 0 0 1.8-1.6L17.8 7"/><path d="M10 11v6.5"/><path d="M14 11v6.5"/>',
  refresh:
    '<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"/><path d="M20.5 3.5V9H15"/>',
  external: '<path d="M14 4h6v6"/><path d="m20 4-8.5 8.5"/><path d="M19 14.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4.5"/>',
  user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  info: '<circle cx="12" cy="12" r="9.2"/><path d="M12 11.2V17"/><path d="M12 7.1h.01"/>',
  alert: '<path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4.5"/><path d="M12 16.8h.01"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  wave: '<path d="M3 12h1.5"/><path d="M7 8.5v7"/><path d="M11 5v14"/><path d="M15 8v8"/><path d="M19 10.5v3"/>',
  headphones:
    '<path d="M3.5 14.5h2.8a2 2 0 0 1 2 2v2.6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a9 9 0 0 1 18 0v6a2 2 0 0 1-2 2h-1.3a2 2 0 0 1-2-2v-2.6a2 2 0 0 1 2-2h2.8"/>',
  telegram:
    '<path d="m21.2 4.4-3.1 15c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.6 12.9 1.7 11.4c-1.1-.3-1.1-1.1.2-1.6L19.6 2.6c.9-.3 1.7.2 1.6 1.8Z" fill="currentColor" stroke="none"/>',
  github:
    '<path d="M12 2.2a9.8 9.8 0 0 0-3.1 19.1c.5.1.7-.2.7-.5v-1.8c-2.7.6-3.3-1.2-3.3-1.2-.5-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.3-1.1.6-1.4-2.2-.3-4.5-1.1-4.5-4.9 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.8-2.3 4.6-4.5 4.9.4.3.7.9.7 1.8v2.7c0 .3.2.6.7.5A9.8 9.8 0 0 0 12 2.2Z" fill="currentColor" stroke="none"/>',
  apple:
    '<path d="M16.4 12.7c0-2.4 2-3.5 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.9-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3.1 2.5 1.2-.1 1.7-.8 3.2-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.7-1-2.7-4Z" fill="currentColor" stroke="none"/><path d="M14.1 5.4c.7-.8 1.1-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4Z" fill="currentColor" stroke="none"/>',
  globe:
    '<circle cx="12" cy="12" r="9.2"/><path d="M2.8 12h18.4"/><path d="M12 2.8c2.4 2.5 3.7 5.7 3.7 9.2s-1.3 6.7-3.7 9.2c-2.4-2.5-3.7-5.7-3.7-9.2S9.6 5.3 12 2.8Z"/>',
  bolt: '<path d="M13.2 2.5 4.6 13.3h6l-1.8 8.2 8.6-10.8h-6l1.8-8.2Z"/>',
  filter: '<path d="M3.5 5.5h17"/><path d="M6.5 12h11"/><path d="M10 18.5h4"/>',
  list: '<path d="M8.5 6H21"/><path d="M8.5 12H21"/><path d="M8.5 18H21"/><path d="M3.5 6h.01"/><path d="M3.5 12h.01"/><path d="M3.5 18h.01"/>',
};

export function icon(name, className = "") {
  const body = paths[name];
  if (!body) return "";
  return `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
}

export function iconMark(className = "") {
  return `<svg class="brand-mark ${className}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="bm-g" x1="10" y1="8" x2="56" y2="58" gradientUnits="userSpaceOnUse">
        <stop stop-color="#d4ff57"/><stop offset=".55" stop-color="#b6ff3f"/><stop offset="1" stop-color="#62e6bb"/>
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="17" fill="#0b0d10"/>
    <rect x="1" y="1" width="62" height="62" rx="16" fill="none" stroke="#fff" stroke-opacity=".08"/>
    <g fill="url(#bm-g)">
      <rect x="13" y="27" width="6" height="11" rx="3"/>
      <rect x="23" y="20" width="6" height="25" rx="3"/>
      <rect x="33" y="24" width="6" height="17" rx="3"/>
      <rect x="43" y="14" width="6" height="36" rx="3"/>
    </g>
  </svg>`;
}

export const ICONS = paths;
