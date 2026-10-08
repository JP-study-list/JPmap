# project-index.md — 專案檔案索引

> 進入點：`index.html`（主程式）、`share.html`（唯讀分享頁，獨立運作）。無 build step，瀏覽器直接載入。

## 檔案

| 檔案 | 用途 | 關係 |
|---|---|---|
| `index.html` | 主頁面：SVG 圖示 sprite、登入／註冊畫面、側欄、地圖區、所有彈窗（新增地點、路線資料、行程、統計、設定〔含底圖切換〕、匯入、待整理） | 載入 `css/style.css`、MapLibre GL JS 5.24.0（jsdelivr，`defer`）、`js/app.js`（module）；註冊 `sw.js` |
| `js/app.js` | 主程式（約 2700 行）：Firebase 初始化、登入、地圖、Firestore 訂閱、清單渲染、行程、表單、統計、匯出入、分享 | import `config.js`、`helpers.js`、`map.js`、`photos.js`、`gestures.js`、`rail.js`；HTML 透過 `window.xxx` 全域函式呼叫 |
| `js/map.js` | 地圖底圖與免費地理服務：OpenFreeMap 底圖（彩色 liberty／淡色 positron，標籤改日文、淡色版補上店家圖示圖層）、Nominatim 搜尋／反查（每秒 1 次佇列）、OSRM 算路線（開車／走路）、距離時間格式化 | 被 `app.js`、`share.html` 引用；不依賴其他模組 |
| `js/rail.js` | 電車路線：站名搜尋（繁中／簡中寫法、假名都找得到）、找最多 3 種搭法（依粗估時間，沒有時刻表）、組沿鐵軌的線形（`legs` 對應 `points` 索引）、地圖分段顏色與換車站白點（`legFeatures`）、線路標籤 HTML | 被 `app.js`、`share.html` 引用；第一次用到才下載 `data/rail/` |
| `data/rail/` | 鐵路資料（station_database 加工，CC BY-SA 4.0）：`index.json`（站、線、相鄰站）與 `geo/<路線代碼>.json`（站間線形）；說明與更新方式見該資料夾 README | 由 `tools/build-rail.mjs` 產生，勿手改 |
| `tools/build-rail.mjs` | 離線整理鐵路資料的 Node 腳本（相鄰關係沿鐵軌線形判斷，不照原始站序；共用軌道向其他線借線形） | 輸出到 `data/rail/` |
| `js/gestures.js` | 觸控手勢（只對觸控）：卡片／彈窗往下拖關閉（表單只會彈回）、手機側欄往左滑收起、全螢幕照片左右滑換張與往下拖關閉；放手時用彈簧動畫接手指速度，動畫中可再抓住 | 被 `app.js`、`share.html` 引用；不依賴其他模組 |
| `js/photos.js` | 照片：縮小（長邊 1280）並去除中繼資料、上傳到 Firestore `photos`（Bytes）、以 `fs:<id>` 讀成 blob 網址顯示（快取）、刪除、設為分享 | 被 `app.js`、`share.html` 引用；直接 import Firestore SDK |
| `js/config.js` | 常數：Firebase 前端設定、交通方式、分類樣式／預設圖示／預設顏色、圖示 SVG、色盤、美食子類型、標記縮放參數 | 被 `app.js`、`helpers.js` 引用；`share.html` 內有一份手動複製版 |
| `js/helpers.js` | 純函式：`esc`、`placeIcon`、`placeColor`、`routeColor`、`byOrder`、`fmtDate`、`localToday`、`stripUndefined` | 被 `app.js` 引用 |
| `css/style.css` | 主頁面全部樣式：開頭是色彩／材質／彈簧曲線的變數（`:root`）；浮在地圖上的元件為毛玻璃；滑鼠效果集中在 `@media (hover: hover)`；進出動畫（`.hidden` 搭配 `@starting-style`）；`max-width: 640px` 手機版（側欄變滑出抽屜＋變暗遮罩、卡片與彈窗變底部卡片）；最後是減少動態／降低透明度／增強對比 | `index.html` |
| `share.html` | 唯讀分享頁：以 `?id=` 讀 `shares/{id}`，用 MapLibre 畫地點與路線（電車分段顏色），含照片輪播（含 Firestore 照片）、Google Maps 導航連結；地點卡為可往下拖關閉的底部卡片 | 自帶 Firebase 設定、config 副本與樣式（設計變數與 `css/style.css` 同一套）；底圖從 `js/map.js`、照片從 `js/photos.js`、手勢從 `js/gestures.js`、電車分段從 `js/rail.js` 載入 |
| `sw.js` | Service Worker：殼層 network-first、`/photos/` cache-first；快取名 `jpmap-v6`（改檔時要手動升版）；`data/rail/` 走 network-first，用過的站離線也能用 | `index.html` 註冊 |
| `manifest.json` | PWA 設定（名稱「日本旅遊地圖」、圖示） | `index.html` |
| `firestore.rules` | Firestore 規則（2026-10-04 起與線上同步，為唯一來源）；開頭有個人OS 助手帳號與你的 UID | 整份貼到 Console 發布 |
| `docs/personal-os.md` | 個人OS ↔ 個人地圖的約定：助手帳號能做什麼、REST 怎麼連、讀得到的欄位、提案（`inbox`）格式 | 改 `places`／`trips`／`inbox` 欄位或規則時同步更新，並交接給個人OS |
| `tools/bridge-check.mjs` | 用助手帳號連正式 Firestore，實測該擋的都擋住（`--propose` 送一筆測試提案） | 讀 `.env`、`firestore.rules`、`js/config.js` |
| `.gitignore` | 只擋 `.env`（助手帳號密碼，本機測試用） | — |
| `photos/` | 舊捷徑上傳的地點照片（約 35 張，多數含 GPS）＋說明 README | `places.photos[]` 以網址引用；用「設定 → 搬移舊照片」搬到 Firestore 後再決定是否刪除 |
| `apple-touch-icon.png`、`icon-512.png`、`favicon.png` | 圖示 | `index.html`、`manifest.json` |
| `README.md` | 舊的部署說明（GitHub Pages、Firebase、Google Maps 金鑰限制） | — |
| `CLAUDE.md`、`progress.md`、`project-index.md` | 開發規範、開發歷史、本索引 | — |

## `js/app.js` 內部結構（依出現順序）

1. Firebase 初始化、標記圖示產生（含快取）
2. 狀態變數；`?quickadd=1` 快速新增解析（舊 iOS 捷徑用）
3. 登入（Email／Google）、`onAuthStateChanged`
4. 地圖初始化（MapLibre、疊加圖層：路線／預覽／替代路線／手繪／地點叢集與標記）、點擊分派（標記→叢集→路線模式選點→路線→底圖店家→新增模式）、滑鼠提示、底圖店家資訊卡 — **地圖綁定**
5. 頂部搜尋列：按 Enter 用 Nominatim 搜尋（限日本、偏好目前畫面）、路線模式點地圖反查地名
6. Firestore：`subscribeData`（places／routes／trips 即時訂閱）與 CRUD
7. 標記與路線資料同步：`syncPlaceMarkers`／`syncRoutePolylines` 依篩選與選取重建 GeoJSON（`setOverlay`），路線滑鼠提示
8. 選取、資訊面板、照片輪播、全螢幕看圖（`setPhotoSrc` 非同步載入）、標記已去
9. 刪除模式（含 6 秒復原，過後才刪照片）、批次歸行程、模式切換
10. 側欄：分頁、分類篩選、檢視模式、清單搜尋、清單渲染（全部／依年份與行程樹狀）
11. 拖曳排序（行程、地點、路線）
12. 行程 CRUD、行程日期區間下拉
13. 新增／編輯地點表單（圖示、顏色、評分、選照片〔縮圖、儲存時上傳〕、貼 Google Maps 網址帶入座標、美食子類型）
14. 待整理（`inbox`：紅色數字、清單、收下＝打開預填表單、丟掉可復原、地圖預覽）；設定（含底圖切換，記在 localStorage `jpmap.basemap`；搬移舊照片）、餐廳模式、統計（含總里程）、JSON 匯出入
15. 算路線（OSRM：開車可選替代路線、走路；電車：`rail.js` 站名搜尋〔邊打邊搜、可加經過車站、點地圖／清單取最近車站〕→ 選搭法 → 存 `legs`；找不到可改手繪）、手繪路線、路線資料表單（電車顯示搭乘路線、隱藏顏色）
16. Google 時間軸匯入（舊格式）
17. 鍵盤快捷鍵（Esc、Enter）、觸控手勢接線（`gestures.js`：哪些卡片／彈窗可拖關閉、側欄、全螢幕照片）
18. 唯讀分享（把該行程照片設為 shared、寫入 `shares` 快照、複製連結）

> 2026-10-04 起地圖改為 MapLibre + OpenFreeMap（取代 Google Maps）。地圖相關集中在第 4、5、7、15 段與 `js/map.js`；其餘與地圖無關。
> MapLibre 的 zoom 比 Google 小 1（`config.js` 的 `MARKER_BASE_ZOOM` 已換算）。
