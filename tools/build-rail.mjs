// ══════════════════════════════════════
// build-rail.mjs — 把 station_database 整理成網頁用的精簡鐵路資料（離線執行；網站本身不需要 build）
//
// 用法：
//   1. 下載 https://github.com/Seo-4d696b75/station_database 的 out/main/json.zip 並解壓
//   2. node tools/build-rail.mjs <解壓後的 json 資料夾（內含 line.json、station.json、line/、polyline/）> [資料版本，如 20260930]
//      資料版本見該 repo 的 latest_info.json
// 輸出：data/rail/index.json（站、線、相鄰關係）與 data/rail/geo/<路線代碼>.json（站與站之間的線形）
//
// 相鄰關係不照原始資料的站序，而是沿鐵軌線形走：碰到的下一個站才算相鄰
// （站序遇到環狀線、6 字形、支線時會把不相鄰的站排在一起）。
// ══════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = process.argv[2];
if (!SRC || !fs.existsSync(path.join(SRC, 'line.json'))) {
  console.error('用法：node tools/build-rail.mjs <station_database 的 json 資料夾>');
  process.exit(1);
}
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'rail');
const read = (p) => JSON.parse(fs.readFileSync(path.join(SRC, p), 'utf8'));

const SNAP_MAX_M = 1500;   // a station farther than this from its line's track is not on the geometry
const JOIN_GAP_M = 60;     // track pieces whose ends are this close are treated as connected
const SIMPLIFY_M = 8;      // geometry simplification tolerance

// ── Geometry helpers ──
const toRad = (x) => x * Math.PI / 180;
function distM(a, b) {  // a, b = [lng, lat]
  const dLat = toRad(b[1] - a[1]), dLng = toRad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371008 * Math.asin(Math.sqrt(s));
}
// Nearest point on segment a→b to p, in a local equirectangular projection
function projectOnSegment(p, a, b) {
  const kx = Math.cos(toRad(p[1]));
  const ax = (a[0] - p[0]) * kx, ay = a[1] - p[1], bx = (b[0] - p[0]) * kx, by = b[1] - p[1];
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  let t = len2 ? -(ax * dx + ay * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { t, q, d: distM(p, q) };
}
// Douglas–Peucker simplification (tolerance in meters)
function simplify(pts, tol) {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let maxD = 0, idx = -1;
    for (let k = i + 1; k < j; k++) {
      const d = projectOnSegment(pts[k], pts[i], pts[j]).d;
      if (d > maxD) { maxD = d; idx = k; }
    }
    if (maxD > tol) { keep[idx] = 1; stack.push([i, idx], [idx, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}
const round5 = (x) => Math.round(x * 1e5) / 1e5;

// ── Min-heap for Dijkstra ──
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

// ── Load source ──
const linesSrc = read('line.json').filter(l => !l.closed);
const stationsSrc = read('station.json').filter(s => !s.closed);
const stationByCode = new Map(stationsSrc.map(s => [s.code, s]));

const stationIdx = new Map();   // station code → index in output
const stationsOut = [];
function idxOf(code) {
  if (!stationIdx.has(code)) {
    const s = stationByCode.get(code);
    stationIdx.set(code, stationsOut.length);
    // [原名, 顯示名（有括號區分時）, 假名, 緯度, 經度, 都道府縣代碼]
    stationsOut.push([s.original_name || s.name, s.name !== (s.original_name || s.name) ? s.name : 0, s.name_kana, s.lat, s.lng, s.prefecture]);
  }
  return stationIdx.get(code);
}

// ── Per line: track graph → station adjacency with geometry ──
const built = [];   // { line, list: edges }
const linesOut = [];
const report = { straight: [], unsnapped: [], noGeo: [] };
fs.mkdirSync(path.join(OUT, 'geo'), { recursive: true });

for (const line of linesSrc) {
  const detail = read(`line/${line.code}.json`);
  const stations = detail.station_list.filter(s => !s.closed && stationByCode.has(s.code));
  if (stations.length < 2) continue;
  const polyPath = path.join(SRC, `polyline/${line.code}.json`);
  const features = fs.existsSync(polyPath) ? JSON.parse(fs.readFileSync(polyPath, 'utf8')).features : [];
  if (!features.length) report.noGeo.push(line.name);

  // Vertex graph: shared coordinates are the same vertex
  const coords = [], key2v = new Map(), adj = [];
  const vtx = (c) => {
    const k = c[0] + ',' + c[1];
    if (!key2v.has(k)) { key2v.set(k, coords.length); coords.push(c); adj.push([]); }
    return key2v.get(k);
  };
  const link = (u, v) => { if (u === v) return; const w = distM(coords[u], coords[v]); adj[u].push([v, w]); adj[v].push([u, w]); };
  const segs = [];   // [u, v] track segments (for projecting stations)
  const ends = [];
  for (const f of features) {
    const cs = f.geometry.coordinates;
    if (cs.length < 2) continue;
    let prev = vtx(cs[0]);
    ends.push(prev);
    for (let i = 1; i < cs.length; i++) { const v = vtx(cs[i]); if (v !== prev) { link(prev, v); segs.push([prev, v]); } prev = v; }
    ends.push(prev);
  }
  // Close small gaps: a piece's end joins the nearest vertex of the track within JOIN_GAP_M
  for (const e of ends) {
    let best = -1, bestD = JOIN_GAP_M;
    for (let v = 0; v < coords.length; v++) {
      if (v === e || adj[e].some(([n]) => n === v)) continue;
      const d = distM(coords[e], coords[v]);
      if (d < bestD) { bestD = d; best = v; }
    }
    if (best >= 0 && bestD > 0) link(e, best);
  }

  // Project each station onto the nearest track segment; insert it as its own vertex
  const stationV = new Map();   // station code → vertex
  const onSeg = new Map();      // segment index → [{ t, v }]
  for (const s of stations) {
    if (stationV.has(s.code)) continue;
    const p = [s.lng, s.lat];
    let best = null;
    segs.forEach(([u, v], i) => {
      const r = projectOnSegment(p, coords[u], coords[v]);
      if (!best || r.d < best.d) best = { ...r, i };
    });
    if (!best || best.d > SNAP_MAX_M) { report.unsnapped.push(`${line.name} ${s.name}`); continue; }
    const v = coords.length; coords.push(best.q); adj.push([]);
    stationV.set(s.code, v);
    (onSeg.get(best.i) || onSeg.set(best.i, []).get(best.i)).push({ t: best.t, v });
  }
  for (const [i, list] of onSeg) {
    const [u, w] = segs[i];
    list.sort((a, b) => a.t - b.t);
    // Replace u–w with u–s1–s2–…–w (drop the original edge)
    adj[u] = adj[u].filter(([n]) => n !== w); adj[w] = adj[w].filter(([n]) => n !== u);
    let prev = u;
    for (const { v } of list) { link(prev, v); prev = v; }
    link(prev, w);
  }

  // From each station, walk the track; the first station reached in each direction is a neighbor
  const vToStation = new Map([...stationV].map(([code, v]) => [v, code]));
  const edges = new Map();   // "a|b" (a<b station idx) → { a, b, len, pts }
  for (const [code, start] of stationV) {
    const dist = new Map([[start, 0]]), prev = new Map(), heap = new Heap();
    heap.push(0, start);
    while (heap.size) {
      const [d, u] = heap.pop();
      if (d > dist.get(u)) continue;
      if (u !== start && vToStation.has(u)) {
        const other = vToStation.get(u);
        const pts = [];
        for (let x = u; x !== undefined; x = prev.get(x)) pts.push(coords[x]);
        pts.reverse();
        const a = idxOf(code), b = idxOf(other);
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (!edges.has(k) || edges.get(k).len > d) edges.set(k, a < b ? { a, b, len: d, pts } : { a: b, b: a, len: d, pts: pts.reverse() });
        continue;   // do not walk past another station
      }
      for (const [v, w] of adj[u]) {
        const nd = d + w;
        if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); heap.push(nd, v); }
      }
    }
  }
  // Drop "skip" edges a–c that only exist because a parallel track bypasses station b
  const nb = new Map();
  for (const e of edges.values()) {
    (nb.get(e.a) || nb.set(e.a, new Map()).get(e.a)).set(e.b, e.len);
    (nb.get(e.b) || nb.set(e.b, new Map()).get(e.b)).set(e.a, e.len);
  }
  for (const [k, e] of edges) {
    for (const [mid, l1] of nb.get(e.a)) {
      const l2 = nb.get(mid)?.get(e.b);
      if (mid !== e.b && l2 !== undefined && l1 + l2 <= e.len * 1.05) { edges.delete(k); break; }
    }
  }
  // Pieces the track geometry does not connect: fall back to straight lines in the source order
  const parent = new Map(); const find = (x) => { while (parent.has(x) && parent.get(x) !== x) x = parent.get(x); return x; };
  const union = (x, y) => { parent.set(find(x), find(y)); };
  for (const e of edges.values()) union(e.a, e.b);
  for (let i = 1; i < stations.length; i++) {
    const a = idxOf(stations[i - 1].code), b = idxOf(stations[i].code);
    if (a === b || find(a) === find(b)) continue;
    const pa = stationsOut[a], pb = stationsOut[b];
    const pts = [[pa[4], pa[3]], [pb[4], pb[3]]];
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    const e = { a, b, len: distM(pts[0], pts[1]), pts, straight: `${line.name} ${stations[i - 1].name}–${stations[i].name}` };
    edges.set(k, a < b ? e : { ...e, a: b, b: a, pts: pts.reverse() });
    union(a, b);
  }
  built.push({ line, list: [...edges.values()] });
}

// Straight fallbacks: borrow the track from another line that runs between the same two stations
// (shared track is often drawn on only one of the lines, e.g. 副都心線 和光市–小竹向原 on 有楽町線)
const tracked = new Map();
for (const { list } of built) for (const e of list) {
  const k = `${e.a}|${e.b}`;
  if (!e.straight && (!tracked.has(k) || tracked.get(k).len > e.len)) tracked.set(k, e);
}
for (const { list } of built) for (const e of list) {
  if (!e.straight) continue;
  const t = tracked.get(`${e.a}|${e.b}`);
  if (t) { e.pts = t.pts; e.len = t.len; delete e.straight; }
  else report.straight.push(e.straight);
}

for (const { line, list } of built) {
  const geo = list.map(e => simplify(e.pts, SIMPLIFY_M).flatMap(([lng, lat]) => [round5(lng), round5(lat)]));
  fs.writeFileSync(path.join(OUT, 'geo', `${line.code}.json`), JSON.stringify(geo));
  const out = { c: line.code, n: line.name, e: list.map(e => [e.a, e.b, Math.round(e.len)]) };
  if (line.color) out.col = line.color;
  if (line.symbol) out.sym = line.symbol;
  if (/新幹線/.test(line.name)) out.hs = 1;   // high-speed (for ranking alternatives)
  linesOut.push(out);
}

const index = {
  v: Number(process.argv[3]) || 0,
  src: 'station_database (Seo-4d696b75) — CC BY-SA 4.0',
  s: stationsOut.map(s => [s[0], s[1], s[2], round5(s[3]), round5(s[4]), s[5]]),
  l: linesOut,
};
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));

const kb = (p) => (fs.statSync(p).size / 1024).toFixed(0) + ' KB';
let geoBytes = 0; for (const f of fs.readdirSync(path.join(OUT, 'geo'))) geoBytes += fs.statSync(path.join(OUT, 'geo', f)).size;
console.log(`站 ${stationsOut.length}、線 ${linesOut.length}、相鄰 ${linesOut.reduce((a, l) => a + l.e.length, 0)}`);
console.log(`index.json ${kb(path.join(OUT, 'index.json'))}，geo/ 共 ${(geoBytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`沒有線形的線 ${report.noGeo.length}、離鐵軌太遠的站 ${report.unsnapped.length}（已向其他線借線形）`);
console.log(`仍用直線的區間 ${report.straight.length}：${report.straight.join('、')}`);
