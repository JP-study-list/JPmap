# project-index.md — 專案檔案索引

> 進入點：`index.html`（主程式）、`share.html`（唯讀分享頁，獨立運作）。無 build step，瀏覽器直接載入。

## 檔案

| 檔案 | 用途 | 關係 |
|---|---|---|
| `index.html` | 主頁面：SVG 圖示 sprite、登入／註冊畫面、側欄、地圖區、所有彈窗（新增地點、路線資料、行程、統計、設定、匯入） | 載入 `css/style.css`、`js/app.js`（module）、Google Maps JS（`callback=initMap`）、MarkerClusterer（unpkg）；註冊 `sw.js` |
| `js/app.js` | 主程式（約 2400 行）：Firebase 初始化、登入、地圖、Firestore 訂閱、清單渲染、行程、表單、統計、匯出入、分享 | import `config.js`、`helpers.js`；HTML 透過 `window.xxx` 全域函式呼叫 |
| `js/config.js` | 常數：Firebase 前端設定、交通方式、分類樣式／預設圖示／預設顏色、圖示 SVG、色盤、美食子類型、標記縮放參數 | 被 `app.js`、`helpers.js` 引用；`share.html` 內有一份手動複製版 |
| `js/helpers.js` | 純函式：`esc`、`placeIcon`、`placeColor`、`routeColor`、`byOrder`、`fmtDate`、`localToday`、`stripUndefined` | 被 `app.js` 引用 |
| `css/style.css` | 主頁面全部樣式，含 `max-width: 640px` 手機版（側欄變抽屜、彈窗變底部卡片） | `index.html` |
| `share.html` | 唯讀分享頁：以 `?id=` 讀 `shares/{id}`，用 Google Maps 畫地點與路線，含照片輪播、Google Maps 導航連結 | 自帶 Firebase 設定與 config 副本，不依賴 `js/` |
| `sw.js` | Service Worker：殼層 network-first、`/photos/` cache-first；快取名 `jpmap-v1`（改檔時要手動升版） | `index.html` 註冊 |
| `manifest.json` | PWA 設定（名稱「日本旅遊地圖」、圖示） | `index.html` |
| `firestore.rules` | Firestore 規則參考檔（**與線上不一致**，線上以 Console 為準） | 手動貼到 Console |
| `photos/` | 舊捷徑上傳的地點照片（約 35 張）＋說明 README | `places.photos[]` 以網址引用；計畫搬到 Firestore |
| `apple-touch-icon.png`、`icon-512.png`、`favicon.png` | 圖示 | `index.html`、`manifest.json` |
| `README.md` | 舊的部署說明（GitHub Pages、Firebase、Google Maps 金鑰限制） | — |
| `CLAUDE.md`、`progress.md`、`project-index.md` | 開發規範、開發歷史、本索引 | — |

## `js/app.js` 內部結構（依出現順序）

1. Firebase 初始化、標記圖示產生（含快取）
2. 狀態變數；`?quickadd=1` 快速新增解析（舊 iOS 捷徑用）
3. 登入（Email／Google）、`onAuthStateChanged`
4. 地圖初始化與點擊處理（新增模式、POI 點擊、路線模式選點、手繪）— **Google Maps 綁定**
5. 頂部搜尋列：Places 自動完成（限日本）、反查地址 — **Google 綁定**
6. Firestore：`subscribeData`（places／routes／trips 即時訂閱）與 CRUD
7. 標記與路線繪製：叢集、依縮放調整標記大小、路線虛線樣式、滑鼠提示 — **Google 綁定**
8. 選取、資訊面板、照片輪播、全螢幕看圖、標記已去
9. 刪除模式（含 6 秒復原）、批次歸行程、模式切換
10. 側欄：分頁、分類篩選、檢視模式、清單搜尋、清單渲染（全部／依年份與行程樹狀）
11. 拖曳排序（行程、地點、路線）
12. 行程 CRUD、行程日期區間下拉
13. 新增／編輯地點表單（圖示、顏色、評分、照片網址、貼 Google Maps 網址帶入座標、美食子類型）
14. 設定、餐廳模式、統計（含總里程）、JSON 匯出入
15. 算路線（Directions，開車可選替代路線、電車失敗改手繪）、手繪路線、路線資料表單 — **Google 綁定**
16. Google 時間軸匯入（舊格式）
17. 鍵盤快捷鍵（Esc、Enter）
18. 唯讀分享（寫入 `shares` 快照、複製連結）

> 約三分之一（第 4、5、7、15 段及標記圖示）綁定 Google Maps，換地圖時集中改這些；其餘與地圖無關。
