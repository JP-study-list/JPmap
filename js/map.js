// ══════════════════════════════════════
// map.js — 底圖與免費地理服務（MapLibre + OpenFreeMap、Nominatim、OSRM）
// 被 app.js 與 share.html 引用；不依賴其他模組
// ══════════════════════════════════════

// OpenFreeMap: free, no key, no usage limits (attribution comes from the style itself)
export const BASEMAPS = {
  liberty:  { label: '彩色', url: 'https://tiles.openfreemap.org/styles/liberty' },
  positron: { label: '淡色', url: 'https://tiles.openfreemap.org/styles/positron' },
};

// MapLibre zoom = Google Maps zoom − 1 (512px vs 256px tiles)
export const JAPAN_VIEW = { center: [138.5, 36.2], zoom: 4 };

// CJK glyphs are drawn with local fonts (no glyph download); Japanese fonts first so
// kanji use Japanese shapes even on a zh-TW device.
export const JP_FONTS = "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic', Meiryo, sans-serif";

const JA_NAME = ['coalesce', ['get', 'name:ja'], ['get', 'name']];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Base style JSON with Japanese labels. Cached per basemap; callers pass a clone to MapLibre.
const styleCache = new Map();
export function loadBaseStyle(key) {
  if (!styleCache.has(key)) {
    styleCache.set(key, buildStyle(key).catch((err) => { styleCache.delete(key); throw err; }));
  }
  return styleCache.get(key);
}

async function buildStyle(key) {
  const style = await fetchJson((BASEMAPS[key] || BASEMAPS.liberty).url);
  // The pale style has no POI layer: borrow the colorful style's POI icons
  // (same tiles and sprite) so shops and stations stay visible and clickable.
  if (!style.layers.some((l) => l['source-layer'] === 'poi')) {
    const colorful = await fetchJson(BASEMAPS.liberty.url);
    style.layers.push(...colorful.layers.filter((l) => l['source-layer'] === 'poi'));
  }
  // Labels: Japanese name only (default styles show "Latin \n 日本語")
  style.layers.forEach((l) => {
    const tf = l.layout && l.layout['text-field'];
    if (tf && JSON.stringify(tf).includes('name')) l.layout['text-field'] = JA_NAME;
  });
  return style;
}

// ── Nominatim (OSM search) ──
// Public server policy: max 1 request/second, no search-as-you-type → search on Enter only.
const NOMINATIM = 'https://nominatim.openstreetmap.org';
let nominatimLast = 0;
let nominatimChain = Promise.resolve();
function nominatim(path, params) {
  const run = async () => {
    const wait = nominatimLast + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    nominatimLast = Date.now();
    const qs = new URLSearchParams({ format: 'jsonv2', 'accept-language': 'ja', ...params });
    return fetchJson(`${NOMINATIM}/${path}?${qs}`);
  };
  const p = nominatimChain.then(run, run);
  nominatimChain = p.catch(() => {});
  return p;
}

// "一蘭, 宇田川町, 渋谷区, 東京都, 150-0042, 日本" → "東京都渋谷区宇田川町"
function jpAddress(displayName, name) {
  const parts = String(displayName || '').split(', ');
  if (parts[0] === name) parts.shift();
  return parts.filter((s) => s && s !== '日本' && !/^\d{3}-?\d{4}$/.test(s)).reverse().join('');
}

// Search places in Japan, biased toward the current map view. bounds: MapLibre LngLatBounds
export async function searchPlaces(q, bounds) {
  const params = { q, limit: 6, countrycodes: 'jp' };
  if (bounds) params.viewbox = [bounds.getWest(), bounds.getNorth(), bounds.getEast(), bounds.getSouth()].join(',');
  const list = await nominatim('search', params);
  return (Array.isArray(list) ? list : []).map((r) => {
    const name = r.name || String(r.display_name || '').split(', ')[0];
    return { name, addr: jpAddress(r.display_name, name), lat: +r.lat, lng: +r.lon };
  });
}

// Nearest named thing (station, shop, street…) for a coordinate; '' when nothing found
export async function reverseName(lat, lng) {
  const r = await nominatim('reverse', { lat, lon: lng, zoom: 18 });
  return (r && (r.name || String(r.display_name || '').split(', ')[0])) || '';
}

// ── OSRM routing (FOSSGIS public server) ──
// Free, non-commercial use, max 1 request/second, no uptime guarantee. No railway routing.
const OSRM = {
  drive: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  walk:  'https://routing.openstreetmap.de/routed-foot/route/v1/foot',
};

// Returns [{ distance (m), duration (s), points: [{lat,lng}] }]; drive may include alternatives.
// Throws an Error whose .code is the OSRM code (e.g. 'NoRoute') or 'NETWORK'.
export async function fetchRoutes(transport, from, to) {
  const qs = new URLSearchParams({
    overview: 'full', geometries: 'geojson', alternatives: transport === 'drive' ? 'true' : 'false',
  });
  const url = `${OSRM[transport]}/${from.lng},${from.lat};${to.lng},${to.lat}?${qs}`;
  let res, data;
  try {
    res = await fetch(url);
    data = await res.json();
  } catch {
    throw Object.assign(new Error('routing server unreachable'), { code: res ? `HTTP ${res.status}` : 'NETWORK' });
  }
  if (!data || data.code !== 'Ok' || !data.routes || !data.routes.length) {
    throw Object.assign(new Error((data && data.message) || 'no route'), { code: (data && data.code) || `HTTP ${res.status}` });
  }
  return data.routes.map((r) => ({
    distance: r.distance,
    duration: r.duration,
    points: r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
  }));
}

export function fmtDistance(m) { return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`; }
export function fmtDuration(sec) {
  const min = Math.max(1, Math.round(sec / 60));
  return min < 60 ? `${min} 分` : `${Math.floor(min / 60)} 小時 ${min % 60} 分`;
}
