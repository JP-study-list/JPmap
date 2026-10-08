// ══════════════════════════════════════
// bridge-check.mjs — 實測個人OS 助手帳號的權限（連正式的 Firestore，見 docs/personal-os.md）
//
// 用法：node tools/bridge-check.mjs [--propose]
//   帳號密碼放在專案根目錄的 .env（已在 .gitignore，不會進 git）：
//     JPMAP_BOT_EMAIL=...
//     JPMAP_BOT_PASSWORD=...
//   --propose：另外送一筆「測試提案」進待整理，讓你在網頁上試收下／丟掉。
//
// 會被擋的寫入都帶一個不可能成立的前提（文件更新時間＝1970），萬一規則沒擋住也不會真的改到資料。
// UID 與 API key 直接從 firestore.rules、js/config.js 讀，不另外抄一份。
// ══════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  (fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '')
    .split(/\r?\n/).map(l => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map(m => [m[1], m[2]]),
);
const email = process.env.JPMAP_BOT_EMAIL || env.JPMAP_BOT_EMAIL;
const password = process.env.JPMAP_BOT_PASSWORD || env.JPMAP_BOT_PASSWORD;
if (!email || !password) { console.error('.env 裡要有 JPMAP_BOT_EMAIL 與 JPMAP_BOT_PASSWORD'); process.exit(1); }

const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
const OWNER = rules.match(/function ownerUid\(\) \{ return '([^']+)'/)[1];
const BOT = rules.match(/request\.auth\.uid == '([^']+)'; \}\s+\/\/ 助手帳號/)[1];
const config = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8');
const API_KEY = config.match(/apiKey: "([^"]+)"/)[1];
const PROJECT = config.match(/projectId: "([^"]+)"/)[1];
const REFERER = 'https://jp-study-list.github.io/JPmap/';   // the API key only accepts this site
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const NEVER = 'currentDocument.updateTime=1970-01-01T00:00:00Z';

// ── Firestore REST value encoding ──
const enc = (v) => typeof v === 'string' ? { stringValue: v }
  : typeof v === 'boolean' ? { booleanValue: v }
  : Number.isInteger(v) ? { integerValue: String(v) }
  : typeof v === 'number' ? { doubleValue: v }
  : { mapValue: { fields: fields(v) } };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)]));

let token;
async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}
const query = (collection, ownerFilter = true) => call('POST', `${DOCS}:runQuery`, {
  structuredQuery: {
    from: [{ collectionId: collection }],
    ...(ownerFilter ? { where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: OWNER } } } } : {}),
    limit: 500,
  },
});
const denied = (r) => r.status === 403;
const rows = (r) => Array.isArray(r.json) ? r.json.filter(x => x.document) : [];

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
}

// 1. Sign in as the assistant
const login = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Referer: REFERER },
  body: JSON.stringify({ email, password, returnSecureToken: true }),
}).then(r => r.json());
if (!login.idToken) { console.error('登入失敗：', login.error && login.error.message); process.exit(1); }
token = login.idToken;
check('助手帳號登入', login.localId === BOT, login.localId === BOT ? '' : `UID ${login.localId} 跟 firestore.rules 的 ${BOT} 不一樣`);

// 2. What it may read
const places = await query('places');
check('讀得到你的地點', places.status === 200 && rows(places).length > 0, `${rows(places).length} 筆`);
const trips = await query('trips');
check('讀得到你的行程', trips.status === 200, `${rows(trips).length} 筆`);
const inboxRead = await query('inbox');
check('讀得到待整理（避免重複提案）', inboxRead.status === 200, `${rows(inboxRead).length} 筆`);

// 3. What it may not read
check('讀不到路線', denied(await query('routes')));
check('讀不到照片清單', denied(await query('photos')));
check('不帶「你的帳號」條件就讀不到地點', denied(await query('places', false)));

// 4. What it may not write (impossible precondition: nothing changes even if a rule were wrong)
const anyPlace = rows(places)[0] && rows(places)[0].document.name;
const placeBody = { uid: OWNER, name: 'x', lat: 35, lng: 139, createdAt: Date.now() };
check('不能新增地點', denied(await call('POST', `${DOCS}/places`, { fields: fields(placeBody) })));
check('不能新增行程', denied(await call('POST', `${DOCS}/trips`, { fields: fields({ uid: OWNER, name: 'x', start: '2026-01-01', end: '2026-01-01' }) })));
if (anyPlace) {
  const url = `https://firestore.googleapis.com/v1/${anyPlace}`;
  check('不能修改地點', denied(await call('PATCH', `${url}?updateMask.fieldPaths=note&${NEVER}`, { fields: fields({ note: 'x' }) })));
  check('不能刪除地點', denied(await call('DELETE', `${url}?${NEVER}`)));
}

// 5. Proposals: malformed ones are rejected
const good = { uid: OWNER, kind: 'place', source: 'personal-os', status: 'pending', createdAt: Date.now(),
  key: 'bridge-check:test', reason: '連線測試（可丟掉）', place: { name: '鶴岡八幡宮', lat: 35.3259, lng: 139.5565, wishlist: true, tag: '神社' } };
const propose = (d) => call('POST', `${DOCS}/inbox`, { fields: fields(d) });
check('提案擋：寫給別人', denied(await propose({ ...good, uid: BOT })));
check('提案擋：狀態不是 pending', denied(await propose({ ...good, status: 'accepted' })));
check('提案擋：多了不認得的欄位', denied(await propose({ ...good, extra: 1 })));
check('提案擋：地點沒有座標', denied(await propose({ ...good, place: { name: 'x' } })));
check('提案擋：地點又帶行程', denied(await propose({ ...good, trip: { name: 'x', start: '2026-01-01', end: '2026-01-01' } })));
check('提案擋：來源不是 personal-os', denied(await propose({ ...good, source: 'x' })));
const { place: _p, ...noPlace } = good;
check('提案擋：行程日期格式錯', denied(await propose({ ...noPlace, kind: 'trip', trip: { name: 'x', start: '1/1', end: '1/2' } })));
const anyInbox = rows(inboxRead)[0] && rows(inboxRead)[0].document.name;
if (anyInbox) {
  const url = `https://firestore.googleapis.com/v1/${anyInbox}`;
  check('不能改提案狀態（只有你能收下／丟掉）', denied(await call('PATCH', `${url}?updateMask.fieldPaths=status&${NEVER}`, { fields: fields({ status: 'accepted' }) })));
  check('不能刪提案', denied(await call('DELETE', `${url}?${NEVER}`)));
}

// 6. Optional: one real proposal for the user to try in the app
if (process.argv.includes('--propose')) {
  const r = await propose({ ...good, key: `bridge-check:${Date.now()}` });
  check('送出測試提案（到網頁的「待整理」收下或丟掉）', r.status === 200, r.status === 200 ? '' : JSON.stringify(r.json).slice(0, 200));
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
