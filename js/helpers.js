// ══════════════════════════════════════
// helpers.js — 純函式工具（無狀態）
// ══════════════════════════════════════
import { TRANSPORT, WISHLIST_COLOR, TAG_DEFAULT_ICON, TAG_DEFAULT_COLOR } from './config.js';

// HTML escape for安全插入使用者輸入
export function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Resolve a place's effective icon and color (custom overrides, else category default, else fallback)
export function placeIcon(p) { return p.icon || TAG_DEFAULT_ICON[p.tag] || 'pin'; }
export function placeColor(p) { return p.wishlist ? WISHLIST_COLOR : (p.color || TAG_DEFAULT_COLOR[p.tag] || '#566573'); }

// Route effective color: custom color if set, else the transport's default color
export function routeColor(r) { return r.color || (TRANSPORT[r.transport] || TRANSPORT.drive).color; }

// Sort by manual `order` field; items without order keep original (createdAt) order after ordered ones
export function byOrder(a, b) {
  const ao = (typeof a.order === 'number') ? a.order : Infinity;
  const bo = (typeof b.order === 'number') ? b.order : Infinity;
  if (ao !== bo) return ao - bo;
  return (a.createdAt || 0) - (b.createdAt || 0);
}

// ── 本地時區日期（修正 toISOString 的 UTC 偏移 bug）──
// Format a Date as YYYY-MM-DD in LOCAL time (toISOString would use UTC and can shift a day in UTC+8/+9)
export function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function localToday() { return fmtDate(new Date()); }

// Firestore rejects undefined values; drop them
export function stripUndefined(obj) {
  const out = {};
  Object.keys(obj).forEach(k => { if (obj[k] !== undefined) out[k] = obj[k]; });
  return out;
}
