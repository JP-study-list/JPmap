// ══════════════════════════════════════
// config.js — 常數設定（Firebase、分類、圖示、顏色）
// ══════════════════════════════════════

export const firebaseConfig = {
  apiKey: "AIzaSyCN2CD_zIC7FedAfRm6ZnVh7jIqhZD6NWs",
  authDomain: "japan-map-500903.firebaseapp.com",
  projectId: "japan-map-500903",
  storageBucket: "japan-map-500903.firebasestorage.app",
  messagingSenderId: "447815719019",
  appId: "1:447815719019:web:16c9a59eef4e71fe3c392e"
};

export const TRANSPORT = {
  drive: { label: '開車 / 公車', color: '#378ADD', dash: [8, 4] },
  walk:  { label: '走路',        color: '#EF9F27', dash: [4, 4] },
  train: { label: '電車',        color: '#D85A30', dash: [12, 3] },
};

// Route-specific categories (separate from place tags)
export const ROUTE_CATEGORIES = ['散步', '通勤', '觀光', '美食巡禮', '購物', '其他'];

// Color used for places marked as "want to go" (not yet visited)
export const WISHLIST_COLOR = '#1a1a1a';

export const TAG_STYLE = {
  '美食': { bg: '#FAEEDA', text: '#633806' },
  '神社': { bg: '#E1F5EE', text: '#085041' },
  '自然': { bg: '#EAF3DE', text: '#27500A' },
  '文化': { bg: '#EEEDFE', text: '#3C3489' },
  '購物': { bg: '#FAECE7', text: '#712B13' },
  '住宿': { bg: '#E8F0FE', text: '#1A3A7A' },
  '交通': { bg: '#FCE8E6', text: '#8C2D1E' },
  '活動': { bg: '#FDF6D8', text: '#7A5B00' },
};

// Icon catalog — keys map to SVG symbol ids in index.html (pin-*).
export const ICON_CATALOG = {
  pin:      { label: '圖釘' },
  food:     { label: '美食' },
  cafe:     { label: '咖啡' },
  shrine:   { label: '神社' },
  castle:   { label: '城堡' },
  nature:   { label: '自然' },
  shopping: { label: '購物' },
  lodging:  { label: '住宿' },
  station:  { label: '車站' },
  camera:   { label: '景點' },
  heart:    { label: '愛心' },
  star:     { label: '星星' },
};

// Default icon per category
export const TAG_DEFAULT_ICON = {
  '美食': 'food', '神社': 'shrine', '自然': 'nature', '文化': 'castle',
  '購物': 'shopping', '住宿': 'lodging', '交通': 'station', '活動': 'star',
};

// Default color per category
export const TAG_DEFAULT_COLOR = {
  '美食': '#E8833A', '神社': '#0E8A6E', '自然': '#4C9A2A', '文化': '#6C5CE7',
  '購物': '#D6336C', '住宿': '#2B7DE9', '交通': '#C0392B', '活動': '#F1B807',
};

// Color palette for the pickers
export const COLOR_PALETTE = ['#E0392B', '#E8833A', '#F1B807', '#4C9A2A', '#0E8A6E', '#2B7DE9', '#6C5CE7', '#D6336C', '#7A5C3E', '#566573'];

// Raw SVG inner markup for each icon, used to render map markers as data-URIs.
export const ICON_SVG_PATHS = {
  pin:      '<path d="M12 21c-3.5-3.5-7-6.93-7-11a7 7 0 0 1 14 0c0 4.07-3.5 7.5-7 11Z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.5" fill="none" stroke="#fff" stroke-width="1.8"/>',
  food:     '<path d="M6 3v7a2 2 0 0 0 2 2v9M6 3v5M9 3v5M16 3c-1.5 0-2.5 2-2.5 5s1 4 2.5 4v9" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  cafe:     '<path d="M5 8h12v5a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V8ZM17 9h2a2 2 0 0 1 0 4h-2M7 3v2M10 3v2M13 3v2" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  shrine:   '<path d="M3 7h18M4 7l1-2.5h14L20 7M6 7v13M18 7v13M5 11h14" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  castle:   '<path d="M4 21V8l2 1V6l2 1V5l2 1V4h4v2l2-1v2l2-1v3l2-1v13M4 21h16M9 21v-4a3 3 0 0 1 6 0v4" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  nature:   '<path d="M12 3 5 13h4l-3 5h12l-3-5h4L12 3ZM12 18v3" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  shopping: '<path d="M6 8h12l-1 12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 8ZM9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
  lodging:  '<path d="M3 18v-6a2 2 0 0 1 2-2h10a4 4 0 0 1 4 4v4M3 14h16M3 18v2M21 14v6M7 10V7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  station:  '<rect x="5" y="3" width="14" height="13" rx="3" fill="none" stroke="#fff" stroke-width="1.7"/><line x1="5" y1="10" x2="19" y2="10" stroke="#fff" stroke-width="1.7"/><circle cx="9" cy="13.2" r="1" fill="#fff"/><circle cx="15" cy="13.2" r="1" fill="#fff"/><line x1="8.5" y1="16" x2="7" y2="20" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/><line x1="15.5" y1="16" x2="17" y2="20" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/>',
  camera:   '<path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L19 6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12.5" r="3.2" fill="none" stroke="#fff" stroke-width="1.6"/>',
  heart:    '<path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.4-7 10-7 10Z" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/>',
  star:     '<path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.4 9.4l6-.8L12 3Z" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>',
};

// Marker base scale at zoom 14 (inverted: zoom out = bigger markers)
export const MARKER_BASE_ZOOM = 14;
export const MARKER_BASE_SCALE = 7;
export const MARKER_MIN_SCALE = 3;
export const MARKER_MAX_SCALE = 13;
