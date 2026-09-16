/* core.js — shared state, storage, sync, helpers, icons, theme, shell-agnostic UI primitives */
import {
  getCurrentUser,
  loadUserState,
  loadOwnProfile,
  loadUserSettings,
  saveUserSettings,
  avatarPublicUrl,
  syncUserState,
  syncProfile,
  syncProgress,
  subscribeToUserState,
  backendConfigured,
} from "./services/backend.js";
import { shell, render } from "./app.js";
const $ = (selector, root = document) => root.querySelector(selector);

const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const uid = () => Math.random().toString(36).slice(2, 10);

const get = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ],
  );

const SICON_PATHS = {
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  star: '<path fill="currentColor" stroke="none" d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.3-5.7-3.1-5.7 3.1 1.2-6.3L2.8 9.5l6.4-.8z"/>',
  starOutline: '<path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.3-5.7-3.1-5.7 3.1 1.2-6.3L2.8 9.5l6.4-.8z"/>',
  sparkle: '<path d="M12 3l1.9 5.8 5.8 1.9-5.8 1.9L12 18.4l-1.9-5.8L4.3 10.7l5.8-1.9z"/><path d="M18.6 15.4l.8 2.3 2.3.8-2.3.8-.8 2.3-.8-2.3-2.3-.8 2.3-.8z"/>',
  heart: '<path fill="currentColor" stroke="none" d="M12 20.5S3.5 15.4 3.5 9.6C3.5 7 5.5 5 8 5c1.6 0 3.1.9 4 2.2C12.9 5.9 14.4 5 16 5c2.5 0 4.5 2 4.5 4.6 0 5.8-8.5 10.9-8.5 10.9z"/>',
  heartOutline: '<path d="M12 20.5S3.5 15.4 3.5 9.6C3.5 7 5.5 5 8 5c1.6 0 3.1.9 4 2.2C12.9 5.9 14.4 5 16 5c2.5 0 4.5 2 4.5 4.6 0 5.8-8.5 10.9-8.5 10.9z"/>',
  fire: '<path d="M12 21.3c-4.4 0-7.3-2.9-7.3-6.8 0-2.9 1.7-5.1 3.3-6.9.4 1.2 1 2.2 2 3 .2-2.5 1.3-4.8 3.1-6.5-.2 1.9 0 3.3.7 4.8.9-1 1.6-2 2-3.3 1.8 2 3.5 4.6 3.5 7.4 0 5.4-2.9 8.3-7.3 8.3z"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.2"/>',
  coins: '<ellipse cx="10" cy="7.5" rx="6.5" ry="3"/><path d="M3.5 7.5v9c0 1.7 2.9 3 6.5 3 1.2 0 2.4-.1 3.3-.4"/><path d="M13.8 10.8v5.7c0 1.4 2.3 2.5 5.4 2.5"/>',
  gift: '<rect x="4" y="9" width="16" height="4" rx="1"/><path d="M6 13v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7M12 9v12"/><path d="M12 9S5.5 9 4.3 7.4 5.7 4.2 7.6 5 12 9 12 9zm0 0s6.5 0 7.7-1.6S18.3 4.2 16.4 5 12 9 12 9z"/>',
  bolt: '<path d="M13 2.5L4.5 13.5H11l-1 8 8.5-11H12z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 5.5H4.8A3.7 3.7 0 0 0 8.5 9M16 5.5h3.2A3.7 3.7 0 0 1 15.5 9"/><path d="M12 13v3.5M8.5 20.5h7M10 16.5h4"/>',
  medal: '<circle cx="12" cy="14" r="5"/><path d="M9.2 9.7L6.5 3.5h3.6L12 8.3l1.9-4.8h3.6l-2.7 6.2"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  crown: '<path d="M3.5 8l4.5 3.5L12 5l4 6.5L20.5 8 19 17H5z"/><path d="M5.5 20.5h13"/>',
  gem: '<path d="M7 3.5h10l4 5.5-9 11.5L3 9z"/><path d="M3 9h18M9.5 9L12 20.5 14.5 9M7 3.5L9.5 9h5L17 3.5"/>',
  rocket: '<path d="M12 2.5c2.8 1.8 4.2 5.2 4.2 8.7l-2.4 2.6h-3.6l-2.4-2.6c0-3.5 1.4-6.9 4.2-8.7z"/><circle cx="12" cy="9" r="1.6"/><path d="M7.8 13.8L6 19.5l4.3-1.8M16.2 13.8l1.8 5.7-4.3-1.8"/><path d="M10.5 18c0 1.4.7 2.4 1.5 3.2.8-.8 1.5-1.8 1.5-3.2"/>',
  comet: '<circle cx="16.5" cy="7.5" r="3.5"/><path d="M13 11L4.5 19.5M13.5 14.5L8 20M10 12L4.5 14"/>',
  smile: '<circle cx="12" cy="12" r="8.5"/><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/><path d="M8.5 14.3c1 1.6 2.2 2.3 3.5 2.3s2.5-.7 3.5-2.3"/>',
  laugh: '<circle cx="12" cy="12" r="8.5"/><path d="M7.5 10.5l1.8-1.8 1.8 1.8M12.9 10.5l1.8-1.8 1.8 1.8"/><path d="M7.8 13.8c1.2 2.2 2.6 3.2 4.2 3.2s3-1 4.2-3.2"/>',
  wow: '<circle cx="12" cy="12" r="8.5"/><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/><ellipse cx="12" cy="15.8" rx="2" ry="2.5"/>',
  cry: '<circle cx="12" cy="12" r="8.5"/><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/><path d="M8.5 15c1-1.4 2.2-2 3.5-2s2.5.6 3.5 2"/><path d="M7.5 7c-.5 1.6-.5 3.2 0 4.8M16.5 7c.5 1.6.5 3.2 0 4.8"/>',
  clap: '<path d="M8.5 12.5v-6a1.5 1.5 0 0 1 3 0V11m0-6.5a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V14l-1 5.5a3 3 0 0 1-5.8.6z"/><path d="M3 5l1.5 1.5M2 9.5L3.8 10"/>',
  thumbsUp: '<path d="M7 11.5V19H4.7A1.7 1.7 0 0 1 3 17.3v-4.1a1.7 1.7 0 0 1 1.7-1.7z"/><path d="M7 11.5l3.8-7c1.2 0 2 1 1.7 2.1L11.3 11H18.8a1.6 1.6 0 0 1 1.6 1.9l-1.2 5.2a2 2 0 0 1-2 1.6H7"/>',
  eyes: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/>',
  hand: '<path d="M8 12.5V6a1.5 1.5 0 0 1 3 0v5.5m0-7a1.5 1.5 0 0 1 3 0V11m0-5a1.5 1.5 0 0 1 3 0v6.5m0-2.5a1.5 1.5 0 0 1 3 0V15c0 3.6-2.6 6-6 6-2.6 0-4.1-1-5.7-3.6l-2.4-4c-.7-1.2.3-2.6 1.7-2.2z"/>',
  strong: '<path d="M6.5 20v-5.5L9.5 7c.5-1.1 1.9-1.3 2.6-.4L14.5 9H19a1.5 1.5 0 0 1 1.4 2.1l-1.6 5.2a2 2 0 0 1-1.9 1.5H10z"/>',
  bell: '<path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  bookmark: '<path d="M7 3.5h10v15l-5-3.8-5 3.8z"/>',
  download: '<path d="M12 3.5v11M7.5 10.5L12 15l4.5-4.5"/><path d="M4.5 19.5h15"/>',
  upload: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5"/><path d="M4.5 19.5h15"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M15.8 15.8L20.5 20.5"/>',
  chart: '<path d="M4 4v15.5h16"/><path d="M8 15l3.5-4 2.5 2.5L19 8"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="15" rx="2"/><path d="M4 10h16M8.5 3v4M15.5 3v4"/>',
  book: '<path d="M6 3.5h12A1.5 1.5 0 0 1 19.5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M9 8.5h6M9 12h6"/>',
  bookOpen: '<path d="M12 6.5C10 4.8 7 4.5 4 5v13c3-.5 6-.2 8 1.5 2-1.7 5-2 8-1.5V5c-3-.5-6-.2-8 1.5z"/><path d="M12 6.5v13"/>',
  shield: '<path d="M12 2.8l7.5 3v6c0 5-3.2 8.3-7.5 9.7-4.3-1.4-7.5-4.7-7.5-9.7v-6z"/><path d="M9 11.8l2.2 2.2 4.3-4.5"/>',
  sprout: '<path d="M12 21v-8"/><path d="M12 13c0-4 3-7 8-7 0 4-3 7-8 7z"/><path d="M12 13c0-3-2.5-5-6-5 0 3 2.5 5 6 5z"/>',
  leaf: '<path d="M5 19C5 10 10 5 20 4c-1 10-6 15-15 15z"/><path d="M5 19c3-5 7-9 12-11"/>',
  tree: '<path d="M12 3l5.5 7h-3.3L18 16H6l3.8-6H6.5z"/><path d="M12 16v5"/>',
  flower: '<circle cx="12" cy="12" r="2.1"/><circle cx="12" cy="7" r="2.4"/><circle cx="16.8" cy="10.6" r="2.4"/><circle cx="15" cy="16.1" r="2.4"/><circle cx="9" cy="16.1" r="2.4"/><circle cx="7.2" cy="10.6" r="2.4"/>',
  lotus: '<path d="M12 17c-4 0-7.5-2.5-9-6 2.8-.3 5.2.3 7 1.7.5-2.7 1-5.2 2-7.7 1 2.5 1.5 5 2 7.7 1.8-1.4 4.2-2 7-1.7-1.5 3.5-5 6-9 6z"/><path d="M4 20h16"/>',
  party: '<path d="M5.5 14.5L14.5 5.5l2.5 2.5-9 9z"/><path d="M5.5 14.5L4.5 19.5l5-1"/><path d="M14.5 4.5L16 3M17 6.5l1.8-.8M18.3 9.5l1.9.4M6.5 5L5 3.5M4 7.7L2.2 7.2"/>',
  brain: '<path d="M9.6 3.6A2.5 2.5 0 0 0 7 6.1c-1.6.3-2.9 1.7-2.9 3.5 0 .9.4 1.8 1 2.4a3.5 3.5 0 0 0 .4 4.4c.7.7 1.6 1.1 2.5 1.1.4 1.4 1.7 2.4 3.1 2.4h1.8c1.4 0 2.7-1 3.1-2.4.9 0 1.8-.4 2.5-1.1a3.5 3.5 0 0 0 .4-4.4c.6-.6 1-1.5 1-2.4 0-1.8-1.3-3.2-2.9-3.5a2.5 2.5 0 0 0-2.6-2.5c-.7 0-1.3.3-1.8.8-.4-.5-1-.8-1.7-.8z"/><path d="M12 4.2V20"/>',
  bird: '<path d="M5 15.5c4 0 6-1.2 8-4.2l3-.8-1 3c1.8.2 3 1 4 2-2 0-3.5.2-4.8 1-.6 2.4-2.6 4-5.2 4H6.5l-2-2 2.8-.8c-.6-.5-1-1-1.3-1.2z"/><circle cx="14" cy="11.3" r=".9" fill="currentColor" stroke="none"/>',
  rain: '<path d="M7 14a4.5 4.5 0 1 1 .8-8.9A5.5 5.5 0 0 1 18.5 7 3.8 3.8 0 0 1 17.5 14z"/><path d="M8 17.5l-1 3M12.5 17.5l-1 3M17 17.5l-1 3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/>',
  sunrise: '<path d="M4 18.5h16"/><path d="M7.5 18.5a4.5 4.5 0 0 1 9 0"/><path d="M12 8.5V2.5M9.5 5L12 2.5 14.5 5M4.5 10.5l1.5 1.5M19.5 10.5L18 12"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  storm: '<path d="M7 12.5a4.5 4.5 0 1 1 .8-8.9A5.5 5.5 0 0 1 18.5 5.5 3.8 3.8 0 0 1 17.5 12.5z"/><path d="M12.5 12.5L10 18h3l-2 4"/>',
  wave: '<path d="M2.5 9c2.5 0 2.5 2.5 5 2.5s2.5-2.5 5-2.5 2.5 2.5 5 2.5 2.5-2.5 4-2.5"/><path d="M2.5 15c2.5 0 2.5 2.5 5 2.5s2.5-2.5 5-2.5 2.5 2.5 5 2.5 2.5-2.5 4-2.5"/>',
  coffee: '<path d="M5 9.5h11V15a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 15z"/><path d="M16 10.5h1.8a2.6 2.6 0 0 1 0 5.2H16"/><path d="M8.5 6c0-1.2.9-1.2.9-2.4M12.5 6c0-1.2.9-1.2.9-2.4"/>',
  doc: '<path d="M6 2.5h8L19 8v12.5a.5.5 0 0 1-.5.5h-12a.5.5 0 0 1-.5-.5z"/><path d="M13.5 2.5V8H19M9 12h6M9 15.5h6"/>',
  memo: '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M14.5 6.5l3 3"/>',
  music: '<circle cx="7" cy="17.5" r="3"/><circle cx="17.5" cy="15.5" r="3"/><path d="M10 17.5V6l10-2.5V15.5"/>',
  headphones: '<path d="M4 15v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4.5" height="7" rx="2"/><rect x="16.5" y="14" width="4.5" height="7" rx="2"/>',
  mic: '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M6 11.5a6 6 0 0 0 12 0M12 17.5V21"/>',
  camera: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8.5 7L10 4.5h4L15.5 7"/>',
  film: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M8 5v14M16 5v14M3.5 9.5H8M3.5 14.5H8M16 9.5h4.5M16 14.5h4.5"/>',
  chat: '<path d="M4 5.5h16a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9.5L4 19.5z"/><path d="M8.5 10h7M8.5 12.8h4"/>',
  clip: '<path d="M9.5 4.5a2.8 2.8 0 0 1 2.8 2.8v9.2a4.3 4.3 0 0 1-8.6 0V9.2a1.4 1.4 0 0 1 2.8 0v7.6a1 1 0 0 0 2 0V7.3"/>',
  pin: '<path d="M9 3.5h6l-1 7 3 3v1.5H7V13.5l3-3z"/><path d="M12 15v6"/>',
  run: '<circle cx="15" cy="4.5" r="1.8"/><path d="M6.5 20l3-3.8 2.2 1.8.8 2.5M11.5 16L8.5 13l3-2 2.3 1.3L16.5 8.5M13.5 4.5L11 8.5l3.8 1 2.7 3"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.9 2-2 0-1.6-1.4-2-1.4-3.4 0-1.2 1-2.1 2.2-2.1H17a4.5 4.5 0 0 0 4.5-4.5c0-2.8-4-5-9.5-5z"/><circle cx="8" cy="10.2" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="7.6" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="10.2" r="1" fill="currentColor" stroke="none"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.6M12 18.6v2.6M4.2 7.4l2.3 1.3M17.5 15.3l2.3 1.3M2.8 12h2.6M18.6 12h2.6M4.2 16.6l2.3-1.3M17.5 8.7l2.3-1.3"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c-4.6 4.6-4.6 12.4 0 17M12 3.5c4.6 4.6 4.6 12.4 0 17"/>',
  map: '<path d="M9 4L4 6v14l5-2 6 2 5-2V4l-5 2z"/><path d="M9 4v14M15 6v14"/>',
  robot: '<rect x="5" y="9.5" width="14" height="9.5" rx="2.5"/><circle cx="9.5" cy="14.2" r="1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="14.2" r="1" fill="currentColor" stroke="none"/><path d="M9.5 16.8h5M12 5.5V9.5"/><circle cx="12" cy="4" r="1.2"/>',
  flask: '<path d="M10 2.5h4M10.5 2.5V8l-5.4 10.8A1.5 1.5 0 0 0 6.4 21h11.2a1.5 1.5 0 0 0 1.3-2.2L13.5 8V2.5"/><path d="M8.2 14.5h7.6"/>',
  cross: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8.5v7M8.5 12h7"/>',
  users: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><circle cx="16.5" cy="9.5" r="2.4"/><path d="M16.2 14.3c2.2.4 3.8 2 3.8 4.2"/>',
  user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20c1-4 3.8-6 7.5-6s6.5 2 7.5 6"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 0 1-13 5.1M4.5 12a7.5 7.5 0 0 1 13-5.1"/><path d="M18 3.5V8h-4.5M6 20.5V16h4.5"/>',
  trash: '<path d="M4.5 6.5h15M9.5 6V4.5A1.5 1.5 0 0 1 11 3h2a1.5 1.5 0 0 1 1.5 1.5V6"/><path d="M6.5 6.5l1 13a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-13"/><path d="M10 10.5v6M14 10.5v6"/>',
  flag: '<path d="M6 21V4"/><path d="M6 4.5c4-2 7 2 12 0v9c-5 2-8-2-12 0"/>',
  mountain: '<path d="M3 19L10 7l4 6 2.5-3.5L21 19z"/><circle cx="17" cy="5.5" r="1.6"/>',
  timer: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 2M9.5 2.5h5M12 2.5V5.5"/>',
  ghost: '<path d="M6 20.5v-8a6 6 0 0 1 12 0v8l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5z"/><circle cx="10" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="14" cy="11" r="1" fill="currentColor" stroke="none"/>',
  pumpkin: '<ellipse cx="12" cy="13.5" rx="7.5" ry="6"/><path d="M12 8v5.5M12 8c0-2.2 1-3.2 2.6-3.7M9 13.2v.6M15 13.2v.6"/>',
  fox: '<path d="M5 3.5l3.5 3L12 5l3.5 1.5L19 3.5 17.5 12a5.5 5.5 0 0 1-11 0z"/><path d="M9.5 12.5l2.5 2 2.5-2"/>',
  cat: '<circle cx="12" cy="13" r="6.5"/><path d="M7.2 8.8L5.5 3.5 11 6M16.8 8.8l1.7-5.3L13 6"/><path d="M4.5 13h2.8M4.5 15.5l2.5-.5M19.5 13h-2.8M19.5 15.5l-2.5-.5M10.5 14.5h3"/>',
  owl: '<circle cx="9" cy="10" r="3.4"/><circle cx="15" cy="10" r="3.4"/><path d="M5.6 12.3c0 4.1 2.8 7.2 6.4 7.2s6.4-3.1 6.4-7.2"/><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/><path d="M12 13.5l-1 1.5h2z"/>',
  bug: '<ellipse cx="12" cy="13" rx="5" ry="6"/><path d="M12 7v12"/><path d="M7.5 9.5L4.5 7M16.5 9.5l3-2.5M7.5 15.5l-3.5.5M16.5 15.5l3.5.5M9.3 5.8L8.3 3.5M14.7 5.8l1-2.3"/>',
  butterfly: '<ellipse cx="8.3" cy="11.5" rx="3.4" ry="4.8" transform="rotate(-18 8.3 11.5)"/><ellipse cx="15.7" cy="11.5" rx="3.4" ry="4.8" transform="rotate(18 15.7 11.5)"/><path d="M12 8.5V20M10.6 8.5L9.6 6M13.4 8.5l1-2.5"/>',
  drop: '<path d="M12 3s6.5 7.2 6.5 12a6.5 6.5 0 0 1-13 0C5.5 10.2 12 3 12 3z"/>',
  wind: '<path d="M3 8.5h9.5a2.5 2.5 0 1 0-2.4-3.2M3 12.5h14.5a2.5 2.5 0 1 1-2.4 3.2M3 16.5h7"/>',
  rec: '<circle cx="12" cy="12" r="6" fill="var(--coral,#e8795b)" stroke="none"/>',
  volume: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15 9a4.5 4.5 0 0 1 0 6M17.5 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5"/>',
  question: '<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.1 1-1.1 1.8"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/>',
  hundred: '<rect x="2.5" y="7" width="19" height="10" rx="5"/><text x="12" y="14.6" text-anchor="middle" font-size="8" font-weight="800" fill="currentColor" stroke="none">100</text>',
  ten: '<rect x="2.5" y="7" width="19" height="10" rx="5"/><text x="12" y="14.6" text-anchor="middle" font-size="8" font-weight="800" fill="currentColor" stroke="none">10</text>',
  seven: '<path d="M9.5 9.5L7 3.5h3.4L12 8l1.6-4.5H17l-2.5 6"/><circle cx="12" cy="14.5" r="5"/><text x="12" y="16.9" text-anchor="middle" font-size="7" font-weight="800" fill="currentColor" stroke="none">7</text>',
  wheel: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="1.4"/><path d="M12 3.5V12M12 12l7.4 4.3M12 12l-7.4 4.3"/>',
  expand: '<path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/>',
  planet: '<circle cx="12" cy="12" r="6"/><ellipse cx="12" cy="12" rx="10" ry="3.4" transform="rotate(-20 12 12)"/>',
  noise: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12.5h1.8l1.4-3 2 6 1.4-3H16"/>',
  play: '<path fill="currentColor" stroke="none" d="M8 5v14l11-7z"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/>',
  'skip-back': '<path fill="currentColor" stroke="none" d="M6 5.4a1.3 1.3 0 0 1 2.6 0v13.2a1.3 1.3 0 0 1-2.6 0z"/><path fill="currentColor" stroke="none" d="M18.7 5.9v12.2a1 1 0 0 1-1.55.83L8.4 12.83a1 1 0 0 1 0-1.66l8.75-6.1a1 1 0 0 1 1.55.83z"/>',
  'skip-forward': '<path fill="currentColor" stroke="none" d="M15.4 5.4a1.3 1.3 0 0 1 2.6 0v13.2a1.3 1.3 0 0 1-2.6 0z"/><path fill="currentColor" stroke="none" d="M5.3 5.9v12.2a1 1 0 0 0 1.55.83l8.75-6.1a1 1 0 0 0 0-1.66L6.85 5.07A1 1 0 0 0 5.3 5.9z"/>',
  'chevron-up': '<path d="M5.5 14.5L12 8l6.5 6.5"/>',
  'chevron-down': '<path d="M5.5 9.5L12 16l6.5-6.5"/>',
  'grip-vertical': '<circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none"/>',
  repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 12V9a4 4 0 0 1 4-4h13"/><path d="M7 22l-3-3 3-3"/><path d="M20 12v3a4 4 0 0 1-4 4H3"/>',
  'repeat-one': '<path d="M17 2l3 3-3 3"/><path d="M4 12V9a4 4 0 0 1 4-4h13"/><path d="M7 22l-3-3 3-3"/><path d="M20 12v3a4 4 0 0 1-4 4H3"/><text x="12" y="14.5" text-anchor="middle" font-size="7" font-weight="800" fill="currentColor" stroke="none">1</text>',
  shuffle: '<path d="M16 3l5 5-5 5"/><path d="M21 8H9a4 4 0 0 0 0 8h2"/><path d="M16 16l5 5-5 5"/><path d="M21 20H9a4 4 0 0 1 0-8h2"/>',
  'volume-2': '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15 9a4.5 4.5 0 0 1 0 6M17.5 6.5a8 8 0 0 1 0 11"/>',
  'volume-x': '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5"/>',
  'heart-filled': '<path fill="currentColor" stroke="none" d="M12 20.5S3.5 15.4 3.5 9.6C3.5 7 5.5 5 8 5c1.6 0 3.1.9 4 2.2C12.9 5.9 14.4 5 16 5c2.5 0 4.5 2 4.5 4.6 0 5.8-8.5 10.9-8.5 10.9z"/>',
  reply: '<path d="M9.5 14L5.5 10l4-4"/><path d="M5.5 10H14a7 7 0 0 1 0 14h-2.5"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.2 10h.6M10 10h.6M13.8 10h.6M17.6 10h.6M6.2 14h.6M17.6 14h.6M9.4 14h5.2"/>',
  cards: '<rect x="8" y="7.5" width="11.5" height="13" rx="2"/><path d="M8 7.5V5.5a2 2 0 0 1 2-2h8.5a2 2 0 0 1 2 2v10.5a2 2 0 0 1-2 2H17"/>',
  list: '<path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11"/><circle cx="5" cy="6.5" r="1" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="5" cy="17.5" r="1" fill="currentColor" stroke="none"/>',
  warn: '<path d="M12 3.5L22 20H2z"/><path d="M12 9.5v4.5"/><circle cx="12" cy="16.8" r="1" fill="currentColor" stroke="none"/>',
};

function sicon(name, cls) {
  const p = SICON_PATHS[name] || SICON_PATHS.sparkle;
  return `<svg class="sicon${cls ? " " + cls : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
}

const state = {
  tab: localStorage.getItem("sf-tab") || "timer",
  mode: "focus",
  time: 1500,
  running: false,
  endsAt: null,
  sessionDuration: null,
  sessions: get("sf-sessions", 0),
  coins: get("sf-coins", 0),
  tasks: get("sf-tasks", []),
  techCheck: get("sf-techcheck", null),
  favorites: get("sf-favorites", []),
  owned: get("sf-owned", []),
  friends: get("sf-friends", []),
  blocks: get("sf-blocks", {}),
  mutedChats: get("sf-muted", {}),
  reports: get("sf-reports", []),
  customGroups: get("sf-groups", []),
  messages: get("sf-messages", {}),
  profile: get("sf-profile", {
    name: "Study Learner",
    handle: "study_learner",
    bio: "Building better study habits, one session at a time.",
    avatar: "SL",
    photo: "",
    country: "",
    phone: "",
    university: "",
    email: "",
    subjects: [],
  }),
  timerMinutes: get("sf-durations", { focus: 25, short: 5, long: 15 }),
  timerSeconds: get("sf-duration-secs", { focus: 0, short: 0, long: 0 }),
  techUses: get("sf-tech-uses", {}),
  techStats: get("sf-tech-stats", {}),
  techTime: get("sf-tech-time", {}),
  feynmanNotes: get("sf-feynman", []),
  duckChat: get("sf-duck", []),
  mindmaps: get("sf-mindmaps", []),
  decks: get("sf-decks", []),
  cornellNotes: get("sf-cornell", []),
  sessionTech: null,
  equipped: get("sf-equipped", { theme: null, avatar: null, badge: null }),
  boosts: get("sf-boosts", { shields: 0, multiplierUntil: 0, doubleArmed: false }),
  checkin: get("sf-checkin", { last: "" }),
  boxes: get("sf-boxes", []),
  freeBox: get("sf-freebox", { lastClaimDay: "", history: [], pending: null }),
  deviceId: get("sf-device", null) || null,
  sprints: get("sf-sprints", []),
  sprintInvites: get("sf-sprint-invites", []),
  sprintSession: null,
  challenges: get("sf-challenges", []),
  activeChallengeId: get("sf-active-challenge", null),
  privacyAccepted: get("sf-privacy-accepted", null),
  eventInvites: get("sf-event-invites", []),
  events: get("sf-events", []),
  pins: get("sf-pins", {}),
  stories: get("sf-stories", []),
  statusSeen: get("sf-status-seen", {}),
  focusDays: get("sf-focus-days", {}),
  garden: get("sf-garden", []),
  focusLog: get("sf-focus-log", []),
  bestStreak: get("sf-best-streak", 0),
  totalFocusMin: get("sf-total-focus", 0),
  achievements: get("sf-achievements", []),
  distractions: 0,
  lastScore: null,
  chimeStyle: get("sf-chime", "arpeggio"),
  chimeVolume: get("sf-chime-vol", 0.8),
  notifPrefs: get("sf-notifs", { completion: true, streaks: true, community: true }),
  reminder: get("sf-reminder", { enabled: false, time: "18:00", lastFired: "" }),
  reduceMotion: get("sf-motion", false),
  night: get("sf-night", false),
  whatsNewSeen: get("sf-whatsnew", 0),
  autostart: get("sf-autostart", { breaks: false, focus: false }),
  customSkin: get("sf-skin", null),
  display: get("sf-display", { compact: false, zoom: 1 }),
  entered: get("sf-entered", false),
  toured: get("sf-toured", false),
  referrals: get("sf-referrals", { code: "", redeemed: [] }),
  techFilter: "All",
  techSearch: "",
  notifications: get("sf-notifications", [
    {
      id: uid(),
      title: "Welcome to StudyFlow",
      text: "Your focused workspace is ready.",
      read: false,
      time: Date.now(),
    },
  ]),
  posts: get("sf-posts", []),
  books: get("sf-books", []),
  bookProgress: get("sf-book-progress", {}),
  bookFavorites: get("sf-book-favorites", []),
  bookLocal: get("sf-book-local", {}),
  purchases: get("sf-purchases", []),
  selectedStore: [],
  storeQty: get("sf-store-qty", {}),
  storeCategory: "All",
  soundFilter: "All",
  activeSound: null,
  soundMix: get("sf-sound-mix", {}),
  soundVolume: get("sf-sound-volume", 0.8),
  linkSound: get("sf-link-sound", false),
  songs: get("sf-songs", []),
  playerVol: get("sf-player", { vol: 0.8 }).vol ?? 0.8,
  playerTrack: get("sf-player", {}).track || null,
  player: get("sf-player", {}),
  playerRepeat: get("sf-player", {}).repeat || "off",
  playerShuffle: Boolean(get("sf-player", {}).shuffle),
  playerSpeed: get("sf-player", {}).speed || 1,
  playerMuted: Boolean(get("sf-player", {}).muted),
  playerQueue: get("sf-player", {}).queue || [],
  playerIndex: get("sf-player", {}).index ?? -1,
  playerFavs: get("sf-player", {}).favorites || [],
  playerHistory: get("sf-player", {}).history || [],
  playerHidden: false,
  streak: get("sf-streak", { count: 0, lastDate: "", days: [] }),
  subtab: "discover",
  activeChat: null,
  call: null,
  callMinimized: false,
  callStatus: "idle",
  accountView: "welcome",
  privacy: get("sf-privacy", {
    profileVisibility: "friends",
    activityVisibility: "friends",
    searchable: true,
  }),
  user: null,
  typing: {},
  messageStatus: {},
};

let cloudStateSubscription;

let persistFailed = false;

// Once the user wipes everything, nothing may write again — not even the
// beforeunload handlers that fire during the farewell reload. Without this,
// the reload re-saves the in-memory state and the "deleted" data comes back.
let persistHalted = false;
function haltPersist() {
  persistHalted = true;
}
function isPersistHalted() {
  return persistHalted;
}

function persist() {
  if (persistHalted) return;
  try {
    persistNow();
    persistFailed = false;
  } catch (err) {
    if (!persistFailed) {
      persistFailed = true;
      try {
        notify("Browser storage is full — some progress may not stick");
      } catch {
        /* ignore */
      }
    }
  }
}

function persistNow() {
  save("sf-sessions", state.sessions);
  save("sf-coins", state.coins);
  save("sf-tasks", state.tasks);
  save("sf-techcheck", state.techCheck);
  save("sf-favorites", state.favorites);
  save("sf-owned", state.owned);
  save("sf-friends", state.friends);
  save("sf-blocks", state.blocks || {});
  save("sf-muted", state.mutedChats || {});
  save("sf-reports", state.reports || []);
  save("sf-groups", state.customGroups);
  save("sf-songs", state.songs);
  save("sf-messages", state.messages);
  save("sf-profile", state.profile);
  save("sf-notifications", state.notifications);
  save("sf-posts", state.posts);
  save("sf-books", state.books || []);
  save("sf-book-progress", state.bookProgress || {});
  save("sf-book-favorites", state.bookFavorites || []);
  save("sf-book-local", state.bookLocal || {});
  save("sf-privacy", state.privacy);
  save("sf-streak", state.streak);
  save("sf-tech-uses", state.techUses || {});
  save("sf-tech-stats", state.techStats || {});
  save("sf-tech-time", state.techTime || {});
  save("sf-feynman", state.feynmanNotes || []);
  save("sf-duck", state.duckChat || []);
  save("sf-mindmaps", state.mindmaps || []);
  save("sf-decks", state.decks || []);
  save("sf-cornell", state.cornellNotes || []);
  save("sf-equipped", state.equipped || { theme: null, avatar: null, badge: null });
  save("sf-boosts", state.boosts || { shields: 0, multiplierUntil: 0, doubleArmed: false });
  save("sf-checkin", state.checkin || { last: "" });
  save("sf-boxes", state.boxes || []);
  save("sf-freebox", state.freeBox || { lastClaimDay: "", history: [], pending: null });
  save("sf-sprints", (state.sprints || []).slice(-20));
  save("sf-sprint-invites", (state.sprintInvites || []).slice(-20));
  save("sf-challenges", state.challenges || []);
  save("sf-active-challenge", state.activeChallengeId || null);
  save("sf-event-invites", (state.eventInvites || []).slice(-20));
  save("sf-privacy-accepted", state.privacyAccepted || null);
  save("sf-events", state.events || []);
  save("sf-pins", state.pins || {});
  save("sf-stories", state.stories || []);
  save("sf-purchases", state.purchases || []);
  save("sf-store-qty", state.storeQty || {});
  save("sf-status-seen", state.statusSeen || {});
  save("sf-focus-days", state.focusDays || {});
  save("sf-garden", (state.garden || []).slice(-60));
  save("sf-focus-log", (state.focusLog || []).slice(-100));
  save("sf-best-streak", state.bestStreak || 0);
  save("sf-total-focus", state.totalFocusMin || 0);
  save("sf-achievements", state.achievements || []);
  save("sf-chime", state.chimeStyle || "arpeggio");
  save("sf-chime-vol", state.chimeVolume ?? 0.8);
  save("sf-notifs", state.notifPrefs || { completion: true, streaks: true, community: true });
  save("sf-reminder", state.reminder || { enabled: false, time: "18:00", lastFired: "" });
  save("sf-motion", Boolean(state.reduceMotion));
  save("sf-night", Boolean(state.night));
  save("sf-whatsnew", state.whatsNewSeen || 0);
  save("sf-autostart", state.autostart || { breaks: false, focus: false });
  save("sf-skin", state.customSkin || null);
  save("sf-display", state.display || { compact: false, zoom: 1 });
  save("sf-entered", Boolean(state.entered));
  save("sf-toured", Boolean(state.toured));
  save("sf-referrals", state.referrals || { code: "", redeemed: [] });
  save("sf-sound-mix", state.soundMix || {});
  save("sf-sound-volume", state.soundVolume ?? 0.8);
  save("sf-link-sound", Boolean(state.linkSound));
  save("sf-durations", state.timerMinutes);
  save("sf-duration-secs", state.timerSeconds);
  save("sf-session", {
    mode: state.mode,
    time: state.time,
    running: state.running,
    endsAt: state.endsAt || null,
    duration: state.sessionDuration || null,
  });
  save("sf-player", { vol: state.playerVol ?? 0.8, track: state.playerTrack || null, ...(state.player || {}) });
  localStorage.setItem("sf-tab", state.tab);
  scheduleCloudSync();
}

function refreshCoinDisplays() {
  try {
    const v = String(state.coins || 0);
    document.querySelectorAll("[data-coin]").forEach((el) => {
      el.innerHTML = el.dataset.coin === "earn" ? `${sicon("coin")} ${v}` : v;
    });
  } catch {
    /* non-DOM environment */
  }
}

// Fixed bottom bars (now-playing bar, mini timer pill, mini player) overlap
// whatever content sits at the bottom of the page. Measure whichever exist and
// publish the total height as --bar-pad; .content uses it as bottom padding so
// nothing is ever hidden behind the bars.
function updateBarPadding() {
  try {
    let pad = 0;
    ["#now-playing", "#np-mini", ".mini-timer"].forEach((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.height <= 0) return;
      if (sel === "#now-playing") {
        // full-width bar anchored to the bottom edge
        pad = Math.max(pad, r.bottom > 0 ? window.innerHeight - r.top + 8 : 0);
      } else {
        // floating pills: reserve their height + bottom offset
        const cs = getComputedStyle(el);
        const bottom = parseFloat(cs.bottom) || 0;
        pad = Math.max(pad, bottom + r.height + 12);
      }
    });
    document.body.style.setProperty("--bar-pad", pad + "px");
  } catch {
    /* never break rendering over padding */
  }
}

function addCoins(n) {
  state.coins = Math.max(0, (state.coins || 0) + (Number(n) || 0));
  persist();
  refreshCoinDisplays();
  return state.coins;
}

function spendCoins(n) {
  n = Number(n) || 0;
  if ((state.coins || 0) < n) return false;
  state.coins -= n;
  persist();
  refreshCoinDisplays();
  return true;
}

function cloudSnapshot() {
  return {
    tasks: state.tasks,
    techCheck: state.techCheck,
    coins: state.coins,
    sessions: state.sessions,
    favorites: state.favorites,
    owned: state.owned,
    friends: state.friends,
    blocks: state.blocks,
    mutedChats: state.mutedChats,
    reports: state.reports,
    customGroups: state.customGroups,
    messages: state.messages,
    notifications: state.notifications,
    posts: state.posts,
    bookFavorites: state.bookFavorites,
    bookProgress: state.bookProgress,
    stories: state.stories,
    purchases: state.purchases,
    storeQty: state.storeQty,
    boxes: state.boxes,
    freeBox: state.freeBox,
    night: state.night,
  };
}

let cloudSyncTimer;

function scheduleCloudSync() {
  if (!backendConfigured || !state.user) return;
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(async () => {
    const snapshot = cloudSnapshot();
    const result = await syncUserState(state.user.id, snapshot);
    await syncProgress(state.user.id, {
      coins: state.coins,
      sessions: state.sessions,
    });
    if (result.error) notify("Saved locally; cloud sync failed");
  }, 500);
}

// --- User settings (user_settings table) ------------------------------------
// Collect the local settings slice into a row patch for the backend.
function collectUserSettings() {
  return {
    theme: state.equipped?.theme || "system",
    notifications: {
      chime: state.chimeStyle,
      volume: state.chimeVolume,
      prefs: state.notifPrefs,
    },
    timer: { minutes: state.timerMinutes, seconds: state.timerSeconds },
    display: {
      compact: Boolean(state.display?.compact),
      zoom: state.display?.zoom || 1,
      night: Boolean(state.night),
    },
  };
}

// Apply a cloud settings row onto local state. Returns true when anything
// changed (caller re-renders). Cloud wins — same rule as the state snapshot.
async function applyUserSettings(row) {
  if (!row || typeof row !== "object") return false;
  let touched = false;
  if (typeof row.theme === "string" && row.theme) {
    // 'custom' skins need local-only color vars, so a cloud 'custom' keeps
    // whatever this device already has.
    if (row.theme === "system")
      state.equipped = { ...(state.equipped || {}), theme: null };
    else if (THEME_SKINS[row.theme])
      state.equipped = { ...(state.equipped || {}), theme: row.theme };
    else return touched;
    touched = true;
  }
  const n = row.notifications;
  if (n && typeof n === "object") {
    if (typeof n.chime === "string" && n.chime) state.chimeStyle = n.chime;
    if (Number.isFinite(+n.volume))
      state.chimeVolume = Math.min(1, Math.max(0, +n.volume));
    if (n.prefs && typeof n.prefs === "object")
      state.notifPrefs = {
        completion: true,
        streaks: true,
        community: true,
        ...n.prefs,
      };
    touched = true;
  }
  const t = row.timer;
  if (t && typeof t === "object") {
    const mins = t.minutes || {};
    const secs = t.seconds || {};
    for (const k of ["focus", "short", "long"]) {
      const m = Number.parseInt(mins[k], 10);
      if (Number.isFinite(m))
        state.timerMinutes[k] = Math.min(180, Math.max(0, m));
      const s = Number.parseInt(secs[k], 10);
      if (Number.isFinite(s))
        state.timerSeconds[k] = Math.min(59, Math.max(0, s));
    }
    touched = true;
  }
  const d = row.display;
  if (d && typeof d === "object") {
    state.display = {
      ...(state.display || {}),
      compact: d.compact === true,
      zoom: Number.isFinite(+d.zoom)
        ? Math.min(2, Math.max(0.5, +d.zoom))
        : state.display?.zoom || 1,
    };
    if (typeof d.night === "boolean") state.night = d.night;
    touched = true;
  }
  if (!touched) return false;
  persist();
  applyEquippedTheme();
  applyDisplay();
  try {
    // Recompute timer lengths from the fresh values (dynamic import keeps
    // the core <-> timer dependency one-directional at load time).
    const timer = await import("./timer.js");
    timer.applyDurations();
    if (!state.running) {
      state.time = timer.durations[state.mode];
      state.sessionDuration = timer.durations[state.mode];
    }
  } catch {
    /* timer warms it on next render */
  }
  return true;
}

// Push local settings to the cloud. Call from settings toggles only —
// never from persist() — so offline tinkering costs zero writes.
function pushUserSettings() {
  if (!backendConfigured || !state.user) return;
  saveUserSettings(collectUserSettings()).catch(() => {});
}

// Merge the cloud profile row into local state. Cloud wins for scalars;
// the photo follows the storage path when one exists, otherwise local
// pixels (e.g. an offline data-URL) are preserved.
async function pullCloudProfile() {
  if (!backendConfigured || !state.user) return false;
  let data = null;
  try {
    const res = await loadOwnProfile();
    if (res.error || !res.data) return false;
    data = res.data;
  } catch {
    return false;
  }
  const str = (v, keep) => (typeof v === "string" && v ? v : keep);
  state.profile = {
    ...state.profile,
    name: str(data.name, state.profile.name),
    handle: str(data.handle, state.profile.handle),
    bio: typeof data.bio === "string" ? data.bio : state.profile.bio,
    avatar: str(data.avatar, state.profile.avatar),
    email: typeof data.email === "string" ? data.email : state.profile.email,
    country: typeof data.country === "string" ? data.country : state.profile.country,
    phone: typeof data.phone === "string" ? data.phone : state.profile.phone,
    university:
      typeof data.university === "string" ? data.university : state.profile.university,
    subjects: Array.isArray(data.subjects) ? data.subjects : state.profile.subjects,
  };
  const vis = (v, keep) =>
    ["private", "friends", "public"].includes(v) ? v : keep;
  state.privacy = {
    ...state.privacy,
    profileVisibility: vis(data.profile_visibility, state.privacy.profileVisibility),
    activityVisibility: vis(data.activity_visibility, state.privacy.activityVisibility),
    searchable: typeof data.searchable === "boolean" ? data.searchable : state.privacy.searchable,
  };
  if (typeof data.photo_path === "string" && data.photo_path) {
    state.profile.photoPath = data.photo_path;
    try {
      const url = avatarPublicUrl(data.photo_path);
      if (url) state.profile.photo = url;
    } catch {
      /* keep local photo */
    }
  } else {
    state.profile.photoPath = "";
  }
  save("sf-profile", state.profile);
  save("sf-privacy", state.privacy);
  persist();
  return true;
}

async function hydrateCloudState(user) {
  if (!backendConfigured || !user) return;
  const result = await loadUserState(user.id);
  if (result.error) return notify("Cloud sync could not be loaded");
  if (result.data?.state) {
    Object.assign(state, result.data.state);
    save("sf-tasks", state.tasks);
    save("sf-coins", state.coins);
    save("sf-sessions", state.sessions);
    save("sf-favorites", state.favorites);
    save("sf-owned", state.owned);
    save("sf-friends", state.friends);
    save("sf-blocks", state.blocks || {});
  save("sf-muted", state.mutedChats || {});
    save("sf-reports", state.reports || []);
    save("sf-groups", state.customGroups);
    save("sf-messages", state.messages);
    save("sf-notifications", state.notifications);
    save("sf-posts", state.posts);
    save("sf-books", state.books || []);
    save("sf-book-progress", state.bookProgress || {});
    save("sf-book-favorites", state.bookFavorites || []);
    save("sf-book-local", state.bookLocal || {});
    save("sf-stories", state.stories);
    save("sf-purchases", state.purchases);
    save("sf-store-qty", state.storeQty);
    save("sf-boxes", state.boxes);
    save("sf-freebox", state.freeBox);
    save("sf-techcheck", state.techCheck);
    save("sf-night", state.night);
    sanitizeState();
    await pullCloudProfile();
    try {
      const sres = await loadUserSettings();
      if (!sres.error && sres.data) await applyUserSettings(sres.data);
    } catch {
      /* offline profile keeps local settings */
    }
    shell();
  } else {
    await syncUserState(user.id, cloudSnapshot());
    await syncProgress(user.id, {
      coins: state.coins,
      sessions: state.sessions,
    });
    // Fresh cloud account: publish this device's identity + settings so a
    // second device sees the real profile on its first login.
    try {
      await syncProfile(state.profile);
    } catch {
      /* saved locally; syncs on next profile save */
    }
    pushUserSettings();
  }
  cloudStateSubscription?.unsubscribe();
  cloudStateSubscription = subscribeToUserState(user.id, (remoteState) => {
    if (!remoteState) return;
    Object.assign(state, remoteState);
    save("sf-tasks", state.tasks);
    save("sf-coins", state.coins);
    save("sf-sessions", state.sessions);
    save("sf-favorites", state.favorites);
    save("sf-owned", state.owned);
    save("sf-friends", state.friends);
    save("sf-blocks", state.blocks || {});
  save("sf-muted", state.mutedChats || {});
    save("sf-reports", state.reports || []);
    save("sf-groups", state.customGroups);
    save("sf-messages", state.messages);
    save("sf-notifications", state.notifications);
    save("sf-posts", state.posts);
    save("sf-books", state.books || []);
    save("sf-book-progress", state.bookProgress || {});
    save("sf-book-favorites", state.bookFavorites || []);
    save("sf-book-local", state.bookLocal || {});
    save("sf-stories", state.stories);
    save("sf-purchases", state.purchases);
    save("sf-store-qty", state.storeQty);
    save("sf-boxes", state.boxes);
    save("sf-freebox", state.freeBox);
    save("sf-techcheck", state.techCheck);
    save("sf-night", state.night);
    sanitizeState();
    if (!state.running) shell();
  });
}

export function setCloudSubscription(sub) {
  cloudStateSubscription = sub;
}
const STATE_ARRAYS = ["tasks", "favorites", "owned", "friends", "customGroups", "songs", "posts", "books", "bookFavorites", "stories", "challenges", "events", "sprints", "sprintInvites", "eventInvites", "garden", "focusLog", "notifications", "purchases", "boxes", "achievements", "decks", "mindmaps", "feynmanNotes", "duckChat", "cornellNotes", "reports"];
const STATE_OBJECT_DEFAULTS = {
  messages: {}, pins: {}, statusSeen: {}, focusDays: {}, techUses: {},
  techStats: {}, techTime: {}, storeQty: {}, soundMix: {}, blocks: {}, mutedChats: {},
  bookProgress: {}, bookLocal: {},
  equipped: { theme: null, avatar: null, badge: null },
  boosts: { shields: 0, multiplierUntil: 0, doubleArmed: false },
  checkin: { last: "" },
  freeBox: { lastClaimDay: "", history: [], pending: null },
  timerMinutes: { focus: 25, short: 5, long: 15 },
  timerSeconds: { focus: 0, short: 0, long: 0 },
  notifPrefs: { completion: true, streaks: true, community: true },
  reminder: { enabled: false, time: "18:00", lastFired: "" },
  autostart: { breaks: false, focus: false },
  display: { compact: false, zoom: 1 },
  referrals: { code: "", redeemed: [] },
  privacy: { profileVisibility: "friends", activityVisibility: "friends", searchable: true },
  profile: {
    name: "Study Learner", handle: "study_learner", bio: "", avatar: "SL",
    photo: "", photoPath: "", country: "", phone: "", university: "", email: "", subjects: [],
  },
  streak: { count: 0, lastDate: "", days: [] },
};
function sanitizeState() {
  try {
    for (const k of STATE_ARRAYS) {
      if (!Array.isArray(state[k])) state[k] = [];
    }
    for (const [k, fallback] of Object.entries(STATE_OBJECT_DEFAULTS)) {
      if (!state[k] || typeof state[k] !== "object" || Array.isArray(state[k]))
        state[k] = { ...fallback };
    }
    state.profile = { ...STATE_OBJECT_DEFAULTS.profile, ...state.profile };
    if (!Array.isArray(state.profile.subjects)) state.profile.subjects = [];
    if (!Array.isArray(state.streak.days)) state.streak.days = [];
    if (!Array.isArray(state.referrals.redeemed)) state.referrals.redeemed = [];
    if (!Number.isFinite(Number(state.coins))) state.coins = 0;
    if (!Number.isFinite(Number(state.sessions))) state.sessions = 0;
    if (typeof state.tab !== "string") state.tab = "timer";
    if (state.activeChallengeId != null && typeof state.activeChallengeId !== "string")
      state.activeChallengeId = null;
    if (state.privacyAccepted != null && typeof state.privacyAccepted !== "object")
      state.privacyAccepted = null;
    if (typeof state.mode !== "string") state.mode = "focus";
    for (const k of ["focus", "short", "long"]) {
      const s = Number.parseInt(state.timerSeconds?.[k], 10);
      state.timerSeconds[k] = Number.isFinite(s) ? Math.min(59, Math.max(0, s)) : 0;
    }
    if (!Number.isFinite(Number(state.time))) state.time = 1500;
    state.running = state.running === true;
    if (!Number.isFinite(Number(state.chimeVolume))) state.chimeVolume = 0.8;
    if (!Number.isFinite(Number(state.soundVolume))) state.soundVolume = 0.8;
    state.night = state.night === true;
    state.reduceMotion = state.reduceMotion === true;
    state.entered = state.entered === true;
    state.toured = state.toured === true;
    state.linkSound = state.linkSound === true;
    sanitizeMessageReactions();
  } catch {
    /* never let sanitation itself break boot */
  }
}

// Reactions used to be keyed by raw SVG strings (pre-fix data), which broke
// rendering. Any reaction key that isn't a plain short name is dropped.
function sanitizeMessageReactions() {
  try {
    for (const msgs of Object.values(state.messages || {})) {
      if (!Array.isArray(msgs)) continue;
      for (const m of msgs) {
        if (!m || !m.reactions || typeof m.reactions !== "object") continue;
        for (const k of Object.keys(m.reactions)) {
          if (k.length > 24 || /[<>"]|\s/.test(k)) delete m.reactions[k];
        }
      }
    }
  } catch {
    /* ignore */
  }
}
function fitTextarea(el) {
  if (!el || el.tagName !== "TEXTAREA") return;
  if (!el.dataset.growMin) el.dataset.growMin = String(el.offsetHeight || 76);
  const min = Number(el.dataset.growMin) || 76;
  const max = Number(el.dataset.growMax) || 320;
  el.style.height = "auto";
  const h = Math.min(Math.max(el.scrollHeight, min), max);
  el.style.height = h + "px";
  el.style.overflowY = el.scrollHeight > max + 1 ? "auto" : "hidden";
}

if (!window.__sfGrowBound) {
  window.__sfGrowBound = true;
  document.addEventListener("input", (e) => {
    const t =
      e.target && e.target.closest
        ? e.target.closest("textarea.autogrow")
        : null;
    if (t) fitTextarea(t);
  });
  document.addEventListener("focusin", (e) => {
    const t =
      e.target && e.target.closest
        ? e.target.closest("textarea.autogrow")
        : null;
    if (t) fitTextarea(t);
  });
}

function notify(text) {
  const existing = document.querySelector(".notify-dialog");
  if (existing) existing.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop notify-dialog";
  backdrop.innerHTML = `<div class="modal notify-modal"><div class="notify-icon">${sicon("bell")}</div><p class="notify-text">${text}</p><button class="primary notify-ok">OK</button></div>`;
  document.body.append(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector(".notify-ok").onclick = close;
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelector(".notify-ok").focus();
}

function notifOn(key) {
  return !state.notifPrefs || state.notifPrefs[key] !== false;
}

function ensureNotifyPermission() {
  try {
    if ("Notification" in window && Notification.permission === "default") {
      const req = Notification.requestPermission();
      if (req && typeof req.catch === "function") req.catch(() => {});
    }
  } catch {
    /* unsupported */
  }
}

function browserNotify(title, body) {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      // OS notifications are plain text — icon markup would print raw.
      new Notification(stripIcon(title), { body: stripIcon(body) });
    }
  } catch {
    /* ignore */
  }
}

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatHeaderDate(date, short) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  try {
    return d.toLocaleDateString(undefined, short
      ? { weekday: "short", month: "short", day: "numeric" }
      : { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  } catch {
    return dayKey(d);
  }
}

let serverOffsetMs = Number(get("sf-time-offset", 0)) || 0;

async function refreshServerTime() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(window.location.origin + "/", {
      method: "HEAD",
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    const stamp = Date.parse(res.headers.get("date") || "");
    if (Number.isFinite(stamp)) {
      serverOffsetMs = stamp - Date.now();
      save("sf-time-offset", serverOffsetMs);
    }
  } catch {
    /* offline — device clock fallback */
  }
}

function serverNow() {
  return new Date(Date.now() + serverOffsetMs);
}

function serverDayKey(date) {
  const d = date || serverNow();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function addNotification(title, text, icon) {
  // The activity centre renders text with esc() — icon markup would print raw,
  // so icons travel in their own field and render as real badges.
  state.notifications.unshift({
    id: uid(),
    title: stripIcon(title),
    text: stripIcon(text),
    icon: typeof icon === "string" ? icon.slice(0, 24) : "",
    read: false,
    time: Date.now(),
  });
  state.notifications = state.notifications.slice(0, 20);
  persist();
}

// Icon markup (sicon SVG) is for innerHTML surfaces only. Anything rendered
// as text — inputs, clipboard, OS notifications, the activity centre — must
// pass through here first so users never see raw "<svg ...>" in the UI.
function stripIcon(value) {
  return String(value ?? "")
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function avatarMarkup(photo, fallback) {
  return photo
    ? `<img src="${photo}" alt="Profile photo">`
    : esc(fallback);
}

function iconStar(id) {
  return `<button class="favorite ${state.favorites.includes(id) ? "on" : ""}" data-fav="${id}" title="Favorite">${state.favorites.includes(id) ? sicon("star") : sicon("starOutline")}</button>`;
}

const THEME_SKINS = {
  "focus-flame": { paper: "#faf3ec", panel: "#ffffff", ink: "#2a1c11", muted: "#8d7a66", line: "#e9d9c6", sage: "#cf5427", coral: "#e8795b", gold: "#e9ae3f" },
  "ocean-mist": { paper: "#edf4f6", panel: "#ffffff", ink: "#13262e", muted: "#5f7d89", line: "#d2e1e7", sage: "#1e7f8c", coral: "#e8795b", gold: "#e9ae3f" },
  "forest-glow": { paper: "#ecf3ea", panel: "#ffffff", ink: "#15241b", muted: "#5f7a68", line: "#d4e1d5", sage: "#2f7d4f", coral: "#e8795b", gold: "#e9ae3f" },
  midnight: { paper: "#0f141c", panel: "#1a2230", ink: "#e9edf5", muted: "#8f99ad", line: "#2b3549", sage: "#7c8aff", coral: "#ff7a6b", gold: "#e9ae3f", dark: true },
  sunrise: { paper: "#fff6ea", panel: "#ffffff", ink: "#2c1e10", muted: "#8d7a5f", line: "#ecdcc2", sage: "#dd7f2e", coral: "#e86a4a", gold: "#f0b429" },
  lavender: { paper: "#f2eefb", panel: "#ffffff", ink: "#241d38", muted: "#776e94", line: "#ddd3f0", sage: "#8a6fd1", coral: "#e8795b", gold: "#e9ae3f" },
  cafe: { paper: "#f4eee3", panel: "#fffaf2", ink: "#2b2118", muted: "#87755f", line: "#e2d5c1", sage: "#8a5f3c", coral: "#c96f4a", gold: "#d9a441" },
  paper: { paper: "#f6f3ea", panel: "#fffdf6", ink: "#2a2620", muted: "#7c766a", line: "#e0d9c8", sage: "#6b7f59", coral: "#c96f4a", gold: "#d9a441" },
  neon: { paper: "#0b0f0e", panel: "#131a17", ink: "#e6f5ec", muted: "#7fa08d", line: "#24352c", sage: "#2fe08a", coral: "#ff6b9d", gold: "#ffd23f", dark: true },
  solar: { paper: "#fffaeb", panel: "#ffffff", ink: "#2e230d", muted: "#8a7748", line: "#ecdfb8", sage: "#c98f1b", coral: "#e8795b", gold: "#f0b429" },
  aurora: { paper: "#eef4f2", panel: "#ffffff", ink: "#152b28", muted: "#5f7f79", line: "#cfe3de", sage: "#1f9d8a", coral: "#e8795b", gold: "#e9ae3f" },
  celestial: { paper: "#fff9ec", panel: "#fffdf6", ink: "#33270d", muted: "#8f7a45", line: "#eadfc0", sage: "#b8860b", coral: "#e8795b", gold: "#ffd700" },
};

function applyMotion() {
  try {
    document.documentElement.dataset.motion = state.reduceMotion
      ? "reduced"
      : "";
  } catch {
    /* ignore */
  }
}

let groupLookup = () => [];
export function setGroupLookup(fn) {
  if (typeof fn === "function") groupLookup = fn;
}
function checkReminder() {
  try {
    const r = state.reminder;
    if (r && r.enabled && r.time) {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      if (hhmm === r.time && r.lastFired !== dayKey(now)) {
        state.reminder = { ...r, lastFired: dayKey(now) };
        persist();
        browserNotify(
          "🎯 Time to focus",
          "Your daily session is waiting on the Focus desk.",
        );
        notify("Daily nudge — time to focus");
      }
    }
  } catch {
    /* ignore */
  }
  try {
    let touched = false;
    (state.events || []).forEach((e) => {
      if (!e.mine || e.reminded) return;
      const ms = e.at - Date.now();
      if (ms <= 10 * 60 * 1000 && ms > -e.durationMin * 60000) {
        e.reminded = true;
        touched = true;
        const g = groupLookup().find((x) => x.id === e.groupId);
        browserNotify(
          `📅 ${e.title}`,
          `Starting soon${g ? " · " + g.name : ""} — get ready.`,
        );
        notify(`${sicon("calendar")} “${esc(e.title)}” starting soon`);
      }
    });
    if (touched) persist();
  } catch {
    /* ignore */
  }
}

function viewHead(title, copy, action = "") {
  return `<div class="page-head"><div><div class="eyebrow">StudyFlow / ${esc(title)}</div><h1>${esc(title)}</h1><p class="lede">${copy}</p></div>${action}</div>`;
}

function fmt(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function fmtDur(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${sec}s`;
}

function bindFavorites(root) {
  $$("[data-fav]", root).forEach(
    (b) =>
      (b.onclick = (e) => {
        e.stopPropagation();
        const id = b.dataset.fav;
        state.favorites = state.favorites.includes(id)
          ? state.favorites.filter((x) => x !== id)
          : [...state.favorites, id];
        persist();
        b.classList.toggle("on");
        b.innerHTML = state.favorites.includes(id) ? sicon("star") : sicon("starOutline");
        if (state.tab === "favorites") render();
      }),
  );
}

function fmtClock(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  return `${m}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

function fmtSize(bytes) {
  if (!bytes) return "";
  const mb = bytes / 1048576;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function isDarkPaper(hex) {
  const m = String(hex || "").replace("#", "");
  if (m.length < 6) return false;
  const r = parseInt(m.substr(0, 2), 16) / 255;
  const g = parseInt(m.substr(2, 2), 16) / 255;
  const b = parseInt(m.substr(4, 2), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4;
}

const NIGHT_BASE = {
  paper: "#0f141c",
  panel: "#1a2230",
  ink: "#e9edf5",
  muted: "#8f99ad",
  line: "#2b3549",
};

const NIGHT_SHADOW = "0 18px 50px rgba(0, 0, 0, 0.45)";

function accentLuminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return 0.2;
  const c = [0, 2, 4].map((i) => {
    const v = parseInt(m[1].substr(i, 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function onAccentText(hex) {
  const lum = accentLuminance(hex);
  return 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.05 ? "#ffffff" : "#0c1210";
}

function applyEquippedTheme() {
  const root = document.documentElement;
  const custom =
    state.equipped?.theme === "custom" ? state.customSkin?.vars : null;
  const skin = custom || THEME_SKINS[state.equipped?.theme];
  const night = Boolean(state.night);
  const nightBase = night && !(skin && skin.dark) ? NIGHT_BASE : null;
  let key = state.equipped?.theme || "";
  if (custom) key = isDarkPaper(custom.paper) ? "neon" : "";
  if (root.dataset) {
    root.dataset.theme = key;
    root.dataset.night = night ? "1" : "";
  }
  ["paper", "panel", "ink", "muted", "line"].forEach((k) => {
    if (nightBase) root.style.setProperty("--" + k, nightBase[k]);
    else if (skin && skin[k]) root.style.setProperty("--" + k, skin[k]);
    else root.style.removeProperty("--" + k);
  });
  ["sage", "coral", "gold"].forEach((k) => {
    if (skin && skin[k]) root.style.setProperty("--" + k, skin[k]);
    else root.style.removeProperty("--" + k);
  });
  const sageHex =
    (skin && skin.sage) ||
    getComputedStyle(root).getPropertyValue("--sage") ||
    "#47765a";
  try {
    root.style.setProperty("--on-accent", onAccentText(sageHex.trim()));
  } catch {
    /* ignore */
  }
  if (nightBase || (skin && skin.dark))
    root.style.setProperty("--shadow", NIGHT_SHADOW);
  else root.style.removeProperty("--shadow");
}

function toggleNight() {
  state.night = !state.night;
  persist();
  pushUserSettings();
  applyEquippedTheme();
  syncThemeToggle();
  try {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", state.night ? "#0f141c" : "#47765a");
  } catch {
    /* ignore */
  }
}

function syncThemeToggle() {
  const btn = $("[data-theme-toggle]");
  if (!btn) return;
  btn.classList.toggle("night", Boolean(state.night));
  btn.setAttribute("aria-checked", String(Boolean(state.night)));
  btn.title = state.night ? "Switch to day mode" : "Switch to night mode";
}

function applyDisplay() {
  try {
    document.documentElement.dataset.compact = state.display?.compact
      ? "1"
      : "";
  } catch {
    /* ignore */
  }
  try {
    document.body.style.zoom = String(state.display?.zoom || 1);
  } catch {
    /* ignore */
  }
}

function confirmBox(title, message, yes, opt) {
  opt = opt || {};
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `<div class="modal"><div class="eyebrow">${esc(opt.eyebrow || "Confirmation")}</div><h2>${title}</h2><p class="muted">${message}</p><div style="display:flex;justify-content:flex-end;gap:8px"><button class="ghost" data-no>${esc(opt.noLabel || "Cancel")}</button><button class="primary" data-yes>${esc(opt.yesLabel || "Confirm")}</button></div></div>`;
  $("#modal-root").append(modal);
  let closed = false;
  const close = (cancelled) => {
    if (closed) return;
    closed = true;
    modal.remove();
    if (cancelled && opt.onCancel) opt.onCancel();
  };
  $("[data-no]", modal).onclick = () => close(true);
  $("[data-yes]", modal).onclick = () => {
    close(false);
    yes();
  };
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close(true);
  });
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close(true);
      document.removeEventListener("keydown", onKey, true);
    }
  };
  document.addEventListener("keydown", onKey, true);
  setTimeout(() => $("[data-yes]", modal)?.focus(), 0);
}

var whatsNewShown = false;

const WHATS_NEW = {
  v: 8,
  title: "Fresh in StudyFlow",
  items: [
    sicon("bell") + " Notification center — chime styles, volume, test button, and per-type alert toggles",
    sicon("bell") + " Daily focus nudge at your chosen hour, plus a calm reduce-motion mode",
    sicon("search") + " Global search across tasks, groups, techniques, friends and rewards (Ctrl K)",
    sicon("keyboard") + " Space starts and pauses the timer from the Focus desk",
    sicon("phone") + " Installable app with an offline shell and its own icon",
    sicon("palette") + " Store themes apply instantly · equip avatars, badges and sound packs",
    sicon("shield") + " Streak Shield, " + sicon("sparkle") + " Coin Multiplier and " + sicon("target") + " Double Dip now have real effects",
    sicon("headphones") + " Sound studio: true rain, fire, ocean, forest, thunder + layered mixer with timer link",
    sicon("bolt") + " Co-focus sprint rooms with live countdowns and finish boards",
    sicon("chart") + " Weekly focus chart, group challenges with coin showers, scheduled sessions",
    sicon("camera") + " 24-hour stories, @mentions, pinned messages and voice notes in chat",
    sicon("sprout") + " Focus garden, focus scores, win journal, records and achievements",
    sicon("bolt") + " Session templates, technique of the day, break spinner, boss mode (B)",
    sicon("play") + " Auto-start flow with 5-second countdown, custom theme builder, backup import",
    sicon("search") + " Compact mode, text sizes, global search, shortcuts and PWA install",
    sicon("gift") + " Referrals (+30), guided tour, landing page, confetti everywhere",
    sicon("refresh") + " One-tap refresh when a new version lands",
    sicon("music") + " Rebuilt music library: safe imports, play/pause/seek/volume that survives navigation",
    sicon("cards") + " True one-card-at-a-time reviews with saved progress, two mystery boxes with staged openings",
  ],
};

function openWhatsNew() {
  closeWhatsNew();
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop";
  overlay.id = "whatsnew-modal";
  overlay.innerHTML = `<div class="modal"><div class="eyebrow">What's new · v${WHATS_NEW.v}</div><h2>${WHATS_NEW.title}</h2><ul class="detail-steps">${WHATS_NEW.items.map((i) => `<li>${i}</li>`).join("")}</ul><div class="modal-actions" style="margin-top:16px"><button class="primary" data-whatsnew-close>Let's go</button></div></div>`;
  ($("#modal-root") || document.body).append(overlay);
  $("[data-whatsnew-close]", overlay).onclick = () => {
    whatsNewShown = true;
    state.whatsNewSeen = WHATS_NEW.v;
    persist();
    overlay.remove();
  };
}

function closeWhatsNew() {
  $("#whatsnew-modal")?.remove();
}

function maybeWhatsNew() {
  if (whatsNewShown) return;
  if ((state.whatsNewSeen || 0) >= WHATS_NEW.v) return;
  whatsNewShown = true;
  openWhatsNew();
}

let confettiPieces = [];

let confettiRunning = false;

function confettiCanvas() {
  let canvas = $("#confetti-canvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "confetti-canvas";
    document.body.append(canvas);
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  return { canvas, ctx: canvas.getContext("2d"), dpr };
}

function confettiBurst(x, y, count) {
  if (state.reduceMotion) return;
  try {
    if (document.hidden) return;
  } catch {
    /* ignore */
  }
  const colors = ["#47765a", "#e9ae3f", "#e8795b", "#ffffff", "#7c8aff"];
  for (let i = 0; i < (count || 60); i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 7;
    confettiPieces.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3,
      size: 4 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      life: 1,
      decay: 0.008 + Math.random() * 0.01,
    });
  }
  confettiLoop();
}

function confettiLoop() {
  if (confettiRunning || !confettiPieces.length) return;
  confettiRunning = true;
  const step = () => {
    let live = null;
    try {
      live = confettiCanvas();
    } catch {
      confettiPieces = [];
      confettiRunning = false;
      return;
    }
    const { canvas, ctx, dpr } = live;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    confettiPieces = confettiPieces.filter((p) => p.life > 0);
    confettiPieces.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.22;
      p.vx *= 0.99;
      p.rot += p.vr;
      p.life -= p.decay;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5));
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    });
    ctx.restore();
    if (confettiPieces.length) requestAnimationFrame(step);
    else {
      confettiRunning = false;
      try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      } catch {
        /* ignore */
      }
    }
  };
  requestAnimationFrame(step);
}

function celebrate(big) {
  if (state.reduceMotion) return;
  try {
    const w = window.innerWidth;
    const h = window.innerHeight;
    confettiBurst(w * 0.5, h * 0.35, big ? 110 : 60);
    if (big)
      setTimeout(() => {
        confettiBurst(w * 0.2, h * 0.3, 50);
        confettiBurst(w * 0.8, h * 0.3, 50);
      }, 250);
  } catch {
    /* ignore */
  }
}



export { $, $$, uid, get, save, esc, SICON_PATHS, sicon, stripIcon, haltPersist, isPersistHalted, collectUserSettings, applyUserSettings, pushUserSettings, pullCloudProfile, state, sanitizeState, persistFailed, persist, persistNow, refreshCoinDisplays, updateBarPadding, addCoins, spendCoins, cloudSnapshot, cloudSyncTimer, scheduleCloudSync, hydrateCloudState, cloudStateSubscription, fitTextarea, notify, notifOn, ensureNotifyPermission, browserNotify, dayKey, formatHeaderDate, serverOffsetMs, refreshServerTime, serverNow, serverDayKey, addNotification, avatarMarkup, iconStar, bindFavorites, THEME_SKINS, isDarkPaper, NIGHT_BASE, NIGHT_SHADOW, accentLuminance, onAccentText, applyEquippedTheme, toggleNight, syncThemeToggle, applyMotion, applyDisplay, viewHead, fmt, fmtDur, fmtClock, fmtSize, confirmBox, checkReminder, whatsNewShown, WHATS_NEW, openWhatsNew, closeWhatsNew, maybeWhatsNew, confettiPieces, confettiRunning, confettiCanvas, confettiBurst, confettiLoop, celebrate };
