# CLAUDE.md — 開發規範與專案脈絡（單一檔）

> 本檔為通用規範 + 本專案技術背景的合併檔，放在專案根目錄，Claude Code 啟動時自動載入。
> 新 repo 只需複製本檔（§0~§7 通用部分照抄），第一次對 Claude Code 說「初始化這個專案」，
> 其餘檔案（project-index.md、progress.md）與 §8 專案背景會自動長出來（見 §1 自舉）。
>
> ⚠️ 本檔會 commit 上公開 repo。**嚴禁寫入任何 secret**（見 §4 規則 D 的可寫/不可寫清單）。

---

## 0. 語言與溝通
- 一律使用**繁體中文**回覆。
- 解釋精簡、切中要點，節省 token。

---

## 1. 啟動 SOP（每次新 session 開場）

### 一般啟動
1. 讀 `project-index.md`（全部）——掌握結構與各檔用途，**不重掃全部原始碼**。
2. 讀 `progress.md` **最新 3~5 筆**——掌握上次進度與待辦。
3. 需動到某檔時，才針對性讀該檔。

### 首次進專案 / 使用者說「初始化這個專案」時（自舉）
依序執行，**全程只新增、不刪除、不覆蓋**：
1. **讀**現有全部檔案（唯讀，不動任何一個）。
2. 若 `project-index.md` **不存在** → 自動生成；若已存在 → 更新，**絕不覆蓋既有內容**。
3. 若 `progress.md` **不存在** → 建立空模板；若已存在 → 保留。
4. 訪談使用者補齊 §8 專案技術背景，寫進本檔 §8 區塊。
   - **只問非機密項**（Project ID、collection 結構、部署 branch 等）。
   - 遇到金鑰類（`/exec` URL、API key）→ **不寫進本檔**，改提醒使用者放 `.env`，本檔只記指標。

> **自舉硬規則**：初始化流程明文禁止任何 `rm`、覆寫、`git reset` 等破壞既有檔案的操作。只建立不存在的檔。

---

## 2. 開發流程規範（嚴格執行）

收到任何工具／功能開發請求時，**不得立即寫程式碼**。依序：

### Phase 1：需求確認（必做）
1. 用自己的話覆述需求。
2. 提釐清問題，涵蓋：使用情境（手機／桌機／網頁、頻率）、核心功能（MVP vs. 加分）、UI 偏好（語言預設繁中、深/淺色、版面）、資料處理（需持久化？存哪？）、技術限制（單一 HTML？React？GitHub Pages？）。
3. 一次最多 3~5 個關鍵問題，不洗版。

### Phase 2：提案（必做）
- 功能清單（MVP vs. 未來擴充）
- 技術方案 + 一句話理由
- UI 結構文字描述（免圖）
- 結尾問：「確認後才動工，有要調整的嗎？」

### Phase 3：實作
- 僅在明確說「start／確認／go ahead」後開始寫碼。
- 驗證與 review 嚴謹徹底；交付前自我檢查功能完整性。

### 例外
- 瑣碎請求（一行 CSS、明顯 bug）可跳過，但先說「Simple request, proceeding directly」。

### 中途變更
- 需求中途更動且影響架構 → **先指出影響範圍**再動手。

---

## 3. 交付原則（本機環境）
- 直接讀寫本機檔案，不再提供「完整檔案手動貼回／ZIP」。
- 偏好乾淨美學：衝突時，簡潔 > 附加功能；果斷、直接。
- 期望根因診斷，不要表面修復。

---

## 4. 本機環境安全與協作規則（ABCD）

### A. Commit 規範
- **允許直接 commit**，不需事前確認。
- 訊息格式：`feat:` / `fix:` / `refactor:` / `docs:` / `chore:` 前綴 + 繁中摘要。
  - 例：`fix: 修正背景卡 shiny 切換未同步 Firestore`

### B. 破壞性操作前先確認（最高優先，不因 A 而放寬）
- 以下操作**必須先說明影響範圍並等待明確同意**：
  - 刪除檔案、`rm`
  - `git reset --hard`、`git push -f`、`git rebase`
  - 大範圍重構、跨多檔結構性變更
- Commit 可逆，故 A 放行；上述不可逆，故一律先問。不確定是否具破壞性時，先問。

### C. 本機測試優先於宣稱完成
- 宣稱「完成」前，能本機驗證的先驗證：起 server、看 console、跑既有測試。
- 不憑「讀過碼看起來對」就宣稱完成。

### D. Secrets 不進 git（含本 CLAUDE.md）
本檔會上公開 repo，界線如下：

**可寫進本檔（非機密）：**
- Firebase **Project ID**（本就出現在前端 config，非機密）
- Firestore collection 結構、key 設計原則
- 部署 branch、GitHub Pages 網域
- 使用的 API、資料來源、cron 時間
- 已知地雷

**絕不寫進本檔（外置到 `.env` / `config.local.js`，並列入 `.gitignore`）：**
- Apps Script `/exec` URL（等同後端入口，視為機密）
- 任何 API key / token / 私鑰、service account 憑證

本檔只記**指標**，例：`Apps Script /exec URL 存於 .env 的 APPS_SCRIPT_URL（不進 git）`。

> 註：Firebase 前端 `apiKey` 並非密鑰，本就暴露於客戶端，靠 Firestore Security Rules 保護；重點是 Rules 有沒有寫好，而非藏 key。Apps Script `/exec` URL 則須當機密。

---

## 5. 檔案維護機制

### progress.md — 開發歷史（每次改檔即更新）
- 反向時間序（最新在上）。
- 欄位：
  ```
  ## YYYY-MM-DD
  - 類型：新增 / 修正 / 重構
  - 影響檔案：xxx.html, yyy.js
  - 摘要：做了什麼
  - 原因：為什麼
  - 待辦/已知問題：（可留空）
  ```
- 小改允許精簡：只填「日期 + 類型 + 摘要」。

### project-index.md — 專案檔案索引（首次建立，每次改檔同步）
- 每個檔案的用途、彼此關係、進入點。
- 檔案新增／刪除／職責變動 → 同步更新。

---

## 6. 技術教訓（跨專案通用原則）

> 以下為既往踩坑固化的原則。**若當下發現更優解，先提出與使用者討論，不擅自沿用舊規則、也不默默改掉。**

- **Firestore key 設計**：用穩定 ID（`p###`、costume ID）當 key，seed 變動不破壞既有紀錄；只存狀態，不存顯示資料。
- **Apps Script 部署**：一律**編輯現有 deployment**（鉛筆 → 新版本 → 部署）保留 `/exec` URL，絕不新建 deployment。
- **Base64 圖片**：存 Firestore <700KB；iOS Shortcut Base64 encode 關閉換行。
- **GitHub Actions cron**：避開 UTC 午夜，偏移如 `43 0 * * *`。
- **日期／時區**：Taiwan UTC+8，日期邏輯用 local time 格式化，**不用 `toISOString()`**。
- **Google Maps API**：tile 依 ToS 不可快取；離線資料由 Firestore `persistentLocalCache` 處理。
- **靜態站資料源**：AniList GraphQL 支援 CORS 免金鑰；Nominatim 1 req/sec、免金鑰。
- **iOS Shortcut 分享**：LINE Flex Message 擷取走「截圖 → OCR」最可靠。
- **fast-flights**：用 `FlightQuery` / `create_query`（v3.x）；`FlightData` 為破壞性移除。
- **圖片格式**：背景卡等圖片 jpg/png/webp 混雜，寫死檔名前**先確認格式**。

---

## 7. 環境差異備註（vs. Artifact）
- 本機開發可用 localStorage／IndexedDB 除錯；線上部署 GitHub Pages 時，持久化仍走 Firestore。
- 本機可實跑、可 git、可 build/test —— review 標準相應提高。

---

## 8. 專案技術背景

> 2026-10-02 由 social-bookmark 視窗的討論整理而來（使用者已確認方向）。金鑰類不寫此處。

### 技術棧（一行摘要）
無 build step 的靜態 PWA：`index.html` + `js/app.js`（ES module，主程式）+ `js/config.js` + `js/helpers.js` + `css/style.css`，另有獨立的 `share.html`（唯讀分享頁）；Firebase Auth（Email/密碼 + Google 登入）+ Firestore（有開 `persistentLocalCache` 離線快取）；部署 GitHub Pages。地圖目前用 Google Maps，**已停止計費、無法正常顯示，階段 1 要換成免費地圖**。

### Firebase
- Project ID：`japan-map-500903`
- collection 與欄位：
  - `places`：`name`、`tag`（分類）、`foodType`、`date`、`note`、`photos[]`（圖片網址，最多 5）、`rating`、`icon`、`color`、`tripId`、`wishlist`、`favorite`、`order`、`lat`、`lng`、`uid`、`createdAt`
  - `routes`：`name`、`transport`（`drive`/`walk`/`train`）、`points[{lat,lng}]`（目前存檔時降採樣到約 200 點）、`cat`、`color`、`date`、`note`、`fare`、`tripId`、`distanceMeters`、`favorite`、`order`、`uid`、`createdAt`
  - `trips`：`name`、`start`、`end`、`order`、`uid`、`createdAt`
  - `shares`：唯讀分享快照（`tripName`、`tripDate`、`places[]`、`routes[]`、`owner`、`createdAt`），`share.html?id=` 以文件 ID 讀取
- key 設計：全部用 Firestore 自動 ID；每筆帶 `uid`，查詢一律 `where('uid','==',uid)`。
- Rules：`places`/`routes`/`trips` 只有本人可讀寫。**repo 內 `firestore.rules` 與線上版本不一致（線上另有 `shares` 規則），以 Firebase Console 為準**；階段 0 會校正並同步回 repo。
- 資料量：約 136 個地點（2026-10-02 截圖估算）。

### 部署
- repo：`JP-study-list/JPmap`；GitHub Pages = `main` 分支根目錄；網址 https://jp-study-list.github.io/JPmap/ 。**push 上 main 即上線，無 staging。**
- 另有遠端分支 `clone`（刪掉 `photos/` 與 `share.html` 的版本，用途待向使用者確認）。

### 外部服務現況
- Google Maps JS API、Places API (New)（搜尋自動完成、點 POI）、Directions（算路線）、Geocoder（反查）：試用期結束後停用，2026-10-02 確認地圖出現「For development purposes only」。
- 舊 iOS 捷徑：拍照 → 上傳到 repo `photos/` → 開 `index.html?quickadd=1&lat=&lng=&photo=&date=`。計畫淘汰（見 progress.md）。

### 已知地雷
- `photos/` 在公開 repo 中，照片保留了原始中繼資料 → 計畫改存 Firebase（隱私考量），搬完再處理 repo 內檔案（屬刪檔，須先徵得同意）。
- `share.html` 內複製了一份 config（分類樣式、圖示、交通方式），改 `config.js` 時要同步。
- 「建築物」分類存在於選單與篩選列，但 `config.js` 沒有對應的預設圖示／顏色（會退回灰色圖釘）。
- 舊的時間軸匯入（`parseGoogleTimeline`）只支援 Google 舊匯出格式，且每段移動只取起終點（畫成直線）。
- 日期一律用 `helpers.js` 的 `fmtDate`/`localToday`（本地時區），不用 `toISOString()`。
