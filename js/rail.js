// ══════════════════════════════════════
// rail.js — 電車路線：站名搜尋、找搭法（最多 3 種）、沿鐵軌的線形、地圖上的分段顏色
// 資料：data/rail/（tools/build-rail.mjs 由 station_database 產生，CC BY-SA 4.0）
// 資料第一次用到才下載；分享頁只用到 legFeatures／legChipsHtml，不會下載資料。
// ══════════════════════════════════════

const DATA = new URL('../data/rail/', import.meta.url);
export const TRAIN_FALLBACK_COLOR = '#D85A30';   // lines without an official color
export const RAIL_ATTRIBUTION = '<a href="https://github.com/Seo-4d696b75/station_database" target="_blank" rel="noopener">鐵路資料 station_database</a>（CC BY-SA 4.0）';

const PREFS = ['', '北海道', '青森', '岩手', '宮城', '秋田', '山形', '福島', '茨城', '栃木', '群馬', '埼玉', '千葉', '東京', '神奈川',
  '新潟', '富山', '石川', '福井', '山梨', '長野', '岐阜', '静岡', '愛知', '三重', '滋賀', '京都', '大阪', '兵庫', '奈良', '和歌山',
  '鳥取', '島根', '岡山', '広島', '山口', '徳島', '香川', '愛媛', '高知', '福岡', '佐賀', '長崎', '熊本', '大分', '宮崎', '鹿児島', '沖縄'];

// ── Search normalisation ──
// Traditional / simplified Chinese forms → Japanese forms, so 澀谷 finds 渋谷 and 橫濱 finds 横浜.
// Applied to both the query and the station names (variants that both appear in Japanese, like 龍/竜, fold together).
const VARIANTS = (
  '澀渋澁渋涩渋濱浜濵浜滨浜驛駅驿駅澤沢泽沢邊辺邉辺边辺鹽塩盐塩廣広广広櫻桜樱桜龍竜龙竜惠恵關関关関榮栄荣栄縣県县県區区' +
  '條条鐵鉄铁鉄銕鉄氣気气気黑黒圓円圆円學学國国會会舊旧對対臺台灣湾藝芸豐豊寶宝實実德徳戶戸户戸淺浅瀨瀬濑瀬齋斎斋斎齊斉' +
  '齐斉樂楽乐楽藥薬檢検險険驗験劍剣嶽岳莊荘壽寿靜静淨浄總総总総綠緑绿緑线線鄉郷鄕郷乡郷營営营営觀観观観權権擇択釋釈濟済' +
  '济済圖図图図團団团団傳伝传伝轉転转転輕軽轻軽經経经経徑径變変变変兩両两両滿満满満當当稱称彌弥錢銭殘残發発发発廢廃拜拝' +
  '來来麥麦萬万與与擧挙譽誉處処號号醫医兒児峽峡狹狭卷巻圈圏舍舎價価假仮惡悪壓圧圍囲围囲隱隠衞衛謠謡應応应応奧奥溫温穩穏' +
  '畫画繪絵擴拡覺覚觉覚渴渇陷陥寬寛歸帰归帰龜亀龟亀曉暁勳勲薰薫揭掲溪渓顯顕嚴厳严厳恆恒黃黄碎砕雜雑參参棧桟蠶蚕讚讃齒歯' +
  '辭辞濕湿寫写收収從従獸獣縱縦肅粛敘叙燒焼將将涉渉獎奨狀状乘乗剩剰疊畳讓譲釀醸觸触寢寝晉晋眞真盡尽粹粋醉酔穗穂隨随數数' +
  '聲声攝摂專専专専戰戦战戦潛潜纖繊禪禅雙双壯壮爭争搜捜插挿巢巣聰聡裝装騷騒增増藏蔵臟臓屬属續続续続墮堕體体帶帯带帯滯滞' +
  '瀧滝泷滝擔担單単单単膽胆彈弾斷断遲遅晝昼蟲虫鑄鋳廳庁聽聴鎭鎮燈灯黨党盜盗稻稲鬥闘鬪闘獨独讀読读読屆届繩縄绳縄貳弐惱悩' +
  '腦脳霸覇賣売卖売髮髪拔抜蠻蛮祕秘甁瓶拂払佛仏竝並辨弁瓣弁辯弁舖舗步歩每毎默黙譯訳译訳豫予餘余搖揺樣様样様賴頼亂乱覽覧' +
  '览覧獵猟壘塁淚涙勵励隸隷靈霊灵霊齡齢戀恋爐炉勞労劳労樓楼祿禄錄録录録鷗鴎鸥鴎橫横姬姫冨富曾曽檜桧蘆芦苅刈藪薮籠篭嵜崎' +
  '﨑崎髙高峯峰舘館槇槙淵渕冲沖靑青淸清內内絲糸丝糸鶯鴬莺鴬埗歩' +
  '东東车車门門间間桥橋长長冈岡岛島汤湯马馬鸟鳥鱼魚见見贝貝风風飞飛鸣鳴鹤鶴阳陽开開场場业業仓倉园園远遠进進过過达達运運' +
  '还還连連铃鈴银銀锦錦镰鎌钏釧历歴丽麗华華临臨为為乌烏举挙义義习習书書买買亚亜亲親产産众衆优優伤傷侧側剑剑剧劇劝勧务務动動' +
  '势勢协協卫衛压圧厅庁叠畳吴呉员員呗唄响響喷噴坚堅坛壇垒塁'
);
const FOLD = new Map();
for (let i = 0; i < VARIANTS.length; i += 2) FOLD.set(VARIANTS[i], VARIANTS[i + 1]);

// Folded form used for matching: NFKC, variant forms, 々 expanded, small particles and punctuation dropped
// (市ケ谷 / 市ヶ谷 / 市之谷 / 市谷 all match), trailing 駅／站 dropped.
export function foldName(s) {
  const chars = [...String(s || '').normalize('NFKC').replace(/\s+/g, '')].map(c => FOLD.get(c) || c);
  for (let i = 1; i < chars.length; i++) if (chars[i] === '々') chars[i] = chars[i - 1];
  return chars.join('').replace(/[ヶヵケがノの之・･\-－()（）]/g, '').replace(/(駅|站|車站)$/, '');
}
const toHira = (s) => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const isKana = (s) => /^[ぁ-ゖァ-ヺー]+$/.test(s);

// ── Data loading ──
let railPromise = null;
export function loadRail() {
  if (!railPromise) railPromise = fetch(new URL('index.json', DATA)).then(r => {
    if (!r.ok) throw new Error('rail data ' + r.status);
    return r.json();
  }).then(build).catch(err => { railPromise = null; throw err; });
  return railPromise;
}

function build(idx) {
  const st = idx.s.map(([n, d, k, lat, lng, p], i) => ({ i, name: n, disp: d || n, kana: k || '', lat, lng, pref: PREFS[p] || '', lines: [], f: foldName(n) }));
  const lines = idx.l.map((l, li) => ({
    li, code: l.c, name: l.n, color: l.col || null, sym: l.sym || '', hs: !!l.hs, edges: l.e,
    surcharge: /成田エクスプレス/.test(l.n),   // limited express with a seat fee: not the everyday choice
  }));
  const adj = st.map(() => []);   // [lineIdx, edgeIdx, otherStation, meters, reversed]
  lines.forEach((l, li) => l.edges.forEach(([a, b, len], ei) => {
    adj[a].push([li, ei, b, len, 0]);
    adj[b].push([li, ei, a, len, 1]);
    if (!st[a].lines.includes(li)) st[a].lines.push(li);
    if (!st[b].lines.includes(li)) st[b].lines.push(li);
  }));
  return { version: idx.v, st, lines, adj, geo: new Map() };
}

// ── Station search (local data, so it can run as the user types) ──
export function searchStations(R, q, limit = 8) {
  const raw = String(q || '').trim().normalize('NFKC');
  if (!raw) return [];
  const kanaQ = isKana(raw) ? toHira(raw) : null;
  const fq = foldName(raw);
  if (!fq && !kanaQ) return [];
  const hits = [];
  for (const s of R.st) {
    let rank;
    if (kanaQ) rank = s.kana === kanaQ ? 0 : s.kana.startsWith(kanaQ) ? 1 : s.kana.includes(kanaQ) ? 3 : -1;
    if ((rank === undefined || rank < 0) && fq) rank = s.f === fq ? 0 : s.f.startsWith(fq) ? 2 : s.f.includes(fq) ? 4 : -1;
    if (rank >= 0) hits.push([rank, s]);
  }
  hits.sort((a, b) => a[0] - b[0] || b[1].lines.length - a[1].lines.length || a[1].name.length - b[1].name.length);
  return hits.slice(0, limit).map(h => h[1]);
}

export function nearestStation(R, lat, lng, maxMeters = 2000) {
  let best = null, bestD = maxMeters;
  for (const s of R.st) {
    const d = meters(lat, lng, s.lat, s.lng);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

export function stationLines(R, s) { return s.lines.map(li => R.lines[li]); }

function meters(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371008 * Math.asin(Math.sqrt(a));
}

// ── Route finding ──
// No timetables, so "cost" is a rough time estimate (minutes) used only to rank the options:
// shinkansen ~200 km/h, other lines ~48 km/h, a short stop at each station, 6 minutes per transfer.
const TRANSFER_MIN = 6;
function rideCost(line, len) {
  const c = line.hs ? len / 3300 + 1 : len / 800 + 0.35;
  return line.surcharge ? c * 1.6 : line.color ? c : c * 1.03;   // on ties prefer lines with an official color
}

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(k, v) {
    const a = this.a; a.push([k, v]);
    for (let i = a.length - 1; i > 0;) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

// Cheapest path from station `from` to `to`. State = (station, line it is on); factor penalises lines.
function shortest(R, from, to, factor) {
  const K = 1024, key = (s, li) => s * K + li;
  const dist = new Map(), prev = new Map(), heap = new Heap();
  for (const li of R.st[from].lines) { dist.set(key(from, li), 0); heap.push(0, key(from, li)); }
  const relax = (k, d, p) => { if (d < (dist.get(k) ?? Infinity)) { dist.set(k, d); prev.set(k, p); heap.push(d, k); } };
  let goal = -1;
  while (heap.size) {
    const [d, k] = heap.pop();
    if (d > dist.get(k)) continue;
    const s = Math.floor(k / K), li = k % K;
    if (s === to) { goal = k; break; }
    const line = R.lines[li], f = factor.get(li) || 1;
    for (const [l2, ei, o, len, rev] of R.adj[s]) {
      if (l2 === li) relax(key(o, li), d + rideCost(line, len) * f, { k, ei, rev });
    }
    for (const l2 of R.st[s].lines) if (l2 !== li) relax(key(s, l2), d + TRANSFER_MIN, { k });
  }
  if (goal < 0) return null;
  // Walk back: ride steps grouped into legs (one leg per line)
  const steps = [];
  for (let k = goal; prev.has(k);) {
    const p = prev.get(k);
    if (p.ei !== undefined) steps.push({ li: k % K, from: Math.floor(p.k / K), to: Math.floor(k / K), ei: p.ei, rev: p.rev });
    k = p.k;
  }
  steps.reverse();
  return legsFromSteps(R, steps);
}

function legsFromSteps(R, steps) {
  const legs = [];
  for (const s of steps) {
    const last = legs[legs.length - 1];
    if (last && last.li === s.li && last.stations[last.stations.length - 1] === s.from) {
      last.stations.push(s.to); last.steps.push([s.ei, s.rev]);
    } else {
      legs.push({ li: s.li, stations: [s.from, s.to], steps: [[s.ei, s.rev]] });
    }
  }
  return summarize(R, legs);
}

function summarize(R, legs) {
  let len = 0, cost = 0;
  for (const g of legs) {
    const line = R.lines[g.li];
    for (const [ei] of g.steps) { const m = line.edges[ei][2]; len += m; cost += rideCost(line, m); }
  }
  cost += TRANSFER_MIN * Math.max(0, legs.length - 1);
  const path = legs.flatMap((g, i) => (i ? g.stations.slice(1) : g.stations));
  return { legs, len, cost, path, transfers: Math.max(0, legs.length - 1), stops: path.length - 1, key: path.join('>') };
}

// Up to `max` distinct ways from → to (optionally via a station). Each further option is found by
// making the lines of the earlier options expensive. Options on the same track (an express that skips
// stations of a local line, e.g. 中央本線 vs 中央線快速) count as one; the line with a symbol is shown.
export function findRoutes(R, from, to, via = null, max = 3) {
  if (via !== null && via !== from && via !== to) return combineVia(R, alternatives(R, from, via, max), alternatives(R, via, to, max), max);
  return from === to ? [] : alternatives(R, from, to, max);
}

function alternatives(R, from, to, max) {
  const found = [], factor = new Map();
  for (let iter = 0; iter < 10 && found.length < max; iter++) {
    const r = shortest(R, from, to, factor);
    if (!r) break;
    const same = found.findIndex(e => sameTrack(e, r));
    if (same < 0) found.push(r);
    else if (displayScore(R, r) < displayScore(R, found[same])) found[same] = r;
    for (const g of r.legs) factor.set(g.li, (factor.get(g.li) || 1) * 3);
  }
  if (!found.length) return [];
  found.sort((a, b) => a.cost - b.cost);
  const best = found[0];
  return found.filter(r => r.cost <= best.cost * 2.3 + 15 && r.transfers <= best.transfers + 1);   // drop detours
}
// Same track = one route's stations are a subsequence of the other's and the distance is about the same
function sameTrack(a, b) {
  if (Math.abs(a.len - b.len) > 0.05 * Math.max(a.len, b.len)) return false;
  const sub = (x, y) => { let j = 0; for (const s of y) if (s === x[j]) j++; return j === x.length; };
  return sub(a.path, b.path) || sub(b.path, a.path);
}
// Lower is nicer to show: legs on lines without a symbol, then more legs
const displayScore = (R, r) => r.legs.filter(g => !R.lines[g.li].sym).length * 10 + r.legs.length;

function combineVia(R, first, second, max) {
  if (!first.length || !second.length) return [];
  const combos = [];
  first.forEach((a, i) => second.forEach((b, j) => { if (i === 0 || j === 0) combos.push(joinRoutes(R, a, b)); }));
  const seen = new Set();
  return combos.sort((x, y) => x.cost - y.cost).filter(r => !seen.has(r.key) && seen.add(r.key)).slice(0, max);
}

function joinRoutes(R, a, b) {
  const legs = [...a.legs.map(g => ({ ...g, stations: [...g.stations], steps: [...g.steps] }))];
  b.legs.forEach((g, i) => {
    const last = legs[legs.length - 1];
    if (i === 0 && last.li === g.li) { last.stations.push(...g.stations.slice(1)); last.steps.push(...g.steps); }   // stay on the train
    else legs.push({ ...g, stations: [...g.stations], steps: [...g.steps] });
  });
  return summarize(R, legs);
}

// ── Geometry ──
async function lineGeo(R, line) {
  if (!R.geo.has(line.code)) {
    R.geo.set(line.code, fetch(new URL(`geo/${line.code}.json?v=${R.version}`, DATA)).then(r => {
      if (!r.ok) throw new Error('rail geo ' + r.status);
      return r.json();
    }).catch(err => { R.geo.delete(line.code); throw err; }));
  }
  return R.geo.get(line.code);
}

const MAX_SAVED_POINTS = 1500;

// A found route → what gets saved: points along the track plus legs that index into them.
export async function routeGeometry(R, route) {
  const geos = await Promise.all(route.legs.map(g => lineGeo(R, R.lines[g.li])));
  const legPts = route.legs.map((g, n) => {
    const pts = [];
    for (const [ei, rev] of g.steps) {
      const flat = geos[n][ei];
      const seg = [];
      for (let i = 0; i < flat.length; i += 2) seg.push([flat[i], flat[i + 1]]);
      if (rev) seg.reverse();
      const last = pts[pts.length - 1];
      if (last && last[0] === seg[0][0] && last[1] === seg[0][1]) seg.shift();
      pts.push(...seg);
    }
    return pts;
  });
  // Keep the saved route light: coarser simplification for long trips
  let simplified = legPts;
  for (const tol of [0, 15, 40, 100, 250]) {
    simplified = tol ? legPts.map(p => simplify(p, tol)) : legPts;
    if (simplified.reduce((a, p) => a + p.length, 0) <= MAX_SAVED_POINTS) break;
  }
  const points = [], legs = [];
  route.legs.forEach((g, n) => {
    const line = R.lines[g.li];
    const i0 = points.length;
    simplified[n].forEach(([lng, lat]) => points.push({ lat, lng }));
    legs.push({
      line: line.name, code: line.code, sym: line.sym, color: line.color || TRAIN_FALLBACK_COLOR,
      from: R.st[g.stations[0]].name, to: R.st[g.stations[g.stations.length - 1]].name,
      stops: g.stations.length - 1, i0, i1: points.length - 1,
    });
  });
  return { points, legs, distanceMeters: Math.round(route.len) };
}

function simplify(pts, tolM) {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let maxD = 0, idx = -1;
    for (let k = i + 1; k < j; k++) {
      const d = segDist(pts[k], pts[i], pts[j]);
      if (d > maxD) { maxD = d; idx = k; }
    }
    if (maxD > tolM) { keep[idx] = 1; stack.push([i, idx], [idx, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}
function segDist(p, a, b) {
  const kx = Math.cos(p[1] * Math.PI / 180) * 111320, ky = 110540;
  const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky, bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
  return Math.hypot(ax + dx * t, ay + dy * t);
}

// ── Display helpers (main app and share page) ──
export function hasLegs(r) {
  const n = Array.isArray(r && r.points) ? r.points.length : 0;
  return Array.isArray(r && r.legs) && r.legs.length > 0 &&
    r.legs.every(g => Number.isInteger(g.i0) && Number.isInteger(g.i1) && g.i0 >= 0 && g.i0 < g.i1 && g.i1 < n);
}

// Map features for a route with legs: one line per leg in the line's color, plus white dots
// at the start, every transfer and the end.
export function legFeatures(r, props = {}) {
  const pts = r.points, feats = [];
  r.legs.forEach(g => {
    feats.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: pts.slice(g.i0, g.i1 + 1).map(p => [p.lng, p.lat]) },
      properties: { ...props, color: g.color || TRAIN_FALLBACK_COLOR },
    });
  });
  const stops = [pts[r.legs[0].i0], ...r.legs.map(g => pts[g.i1])];
  stops.forEach(p => feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { ...props, stop: true } }));
  return feats;
}

// Readable text on a line-color chip
export function chipTextColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? '#1d1d1f' : '#fff';
}
const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Short line name for chips: "JR中央本線(東京～塩尻)" → "中央本線"
export function shortLineName(name) {
  return String(name || '').replace(/[（(][^)）]*[)）]/g, '').replace(/^JR/, '') || name;
}
export function lineChipHtml(g) {
  const color = g.color || TRAIN_FALLBACK_COLOR;
  return `<span class="line-chip" style="background:${escHtml(color)};color:${chipTextColor(color)};" title="${escHtml(g.line)}">${escHtml(g.sym || shortLineName(g.line))}</span>`;
}
// "JY → JC" style chain of line chips
export function legChipsHtml(legs) {
  return `<span class="line-chips">${legs.map(lineChipHtml).join('<span class="line-chip-arrow">›</span>')}</span>`;
}
