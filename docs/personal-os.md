# 個人OS 介面（個人地圖 ↔ 個人OS）

個人地圖（本專案 JPmap）是[個人OS](https://github.com/JP-study-list/personal-os)的子專案：個人OS 的助手用一個**專用的助手帳號**讀地圖資料、把提案丟進「待整理」。
本檔是兩邊的約定。**改到下面列的集合、欄位或意義時，要同時更新本檔，並把變更交接給個人OS**（它的做法檔照本檔寫）。

## 助手能做什麼（由 `firestore.rules` 擋，不是靠腳本自律）

| 動作 | 可以 |
|---|---|
| 讀你的地點 `places`、行程 `trips` | ✅（查詢一定要帶 `uid == 你的 UID`） |
| 讀待整理 `inbox` | ✅（用來避免重複提案） |
| 新增提案到 `inbox` | ✅（格式不對會被擋，見下面） |
| 讀路線、照片 | ❌ |
| 新增、修改、刪除地點、行程、路線 | ❌ |
| 修改、刪除提案 | ❌（只有你能收下／丟掉） |

- 你的 UID：`OWNER_UID`；助手帳號 UID：`XVJSZjgQykg6j9PI40NgU0FqMtt2`（Email `jpmap-bot@rensakobo.com`）（都寫在 `firestore.rules`，不是密碼）。
- 助手帳號的 Email、密碼：密碼只放在 mac 鑰匙圈 `jpmap-bot-password`（帳號名稱填 Email），不進任何 git。Windows 本機測試放專案根目錄的 `.env`（已在 `.gitignore`）。
- 停用助手：Firebase Console → Authentication → 停用那個帳號。

## 怎麼連（REST，不需要套件）

1. **登入**（拿到的 `idToken` 一小時有效）

       POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=<js/config.js 的 apiKey>
       Referer: https://jp-study-list.github.io/JPmap/      ← 一定要帶：這把 key 只允許這個網址
       { "email": "...", "password": "...", "returnSecureToken": true }

2. **讀**：`POST https://firestore.googleapis.com/v1/projects/japan-map-500903/databases/(default)/documents:runQuery`，header `Authorization: Bearer <idToken>`

       { "structuredQuery": { "from": [{ "collectionId": "places" }],
         "where": { "fieldFilter": { "field": { "fieldPath": "uid" }, "op": "EQUAL", "value": { "stringValue": "<你的 UID>" } } } } }

   沒帶 `uid` 條件會被擋。回傳的值是 Firestore 型別格式（`stringValue`、`doubleValue`、`integerValue`、`booleanValue`…）。

3. **提案**：`POST .../documents/inbox`，body `{ "fields": { ... } }`（同樣是型別格式）。

範例程式：`tools/bridge-check.mjs`（登入、讀、提案的寫法都在裡面）。

## 讀得到的欄位

**places**（一筆＝一個地點）

| 欄位 | 意思 |
|---|---|
| `name` | 名稱 |
| `lat`、`lng` | 座標 |
| `wishlist` | `true`＝想去；沒有或 `false`＝去過 |
| `date` | `YYYY-MM-DD`（日本當地日期）。去過＝造訪日；想去＝預計日期（可能是空的） |
| `tag` | 分類：美食、神社、自然、文化、購物、住宿、交通、活動、美術館/博物館、景點、建築物 |
| `foodType` | 美食的子分類（拉麵、壽司…） |
| `note` | 筆記 |
| `rating` | 0～5 |
| `favorite` | 我的最愛 |
| `tripId` | 所屬行程（`trips` 的文件 ID），空字串＝未分類 |
| `createdAt` | 建立時間（毫秒） |

**trips**：`name`、`start`、`end`（`YYYY-MM-DD`）。

- 「去過」的判斷：`wishlist` 不是 `true` 的地點。社群收藏（bookmark）也有「去過了」，兩邊都算（只有使用者會標）。
- 都道府縣：地點沒有存。要算「去過幾個縣」，可以用 `data/rail/index.json` 找最近的車站，取它的都道府縣（邊界附近可能差一點）。

## 提案（`inbox`）的格式

| 欄位 | 必填 | 規定 |
|---|---|---|
| `uid` | ✅ | 你的 UID |
| `kind` | ✅ | `place` 或 `trip` |
| `source` | ✅ | 固定 `personal-os` |
| `status` | ✅ | 固定 `pending`（收下／丟掉由網頁改成 `accepted`／`dismissed`） |
| `createdAt` | ✅ | 毫秒，**整數** |
| `key` | | 去重用，≤200 字。例：`calendar:<行程 ID>`、`bookmark:<地點 ID>`。提案前先讀 `inbox`，同一個 `key` 已經存在（不論狀態）就不要再提 |
| `reason` | | 為什麼提這筆，≤300 字（網頁上會顯示），例：「10/7 行事曆：國民年金說明會」 |
| `place` | kind＝place 時 | `name`（必填，≤100）、`lat`、`lng`（必填，數字）、`date`（`YYYY-MM-DD`）、`wishlist`（布林）、`tag`（≤20，用上面的分類名稱才會帶入）、`note`（≤1000）、`url`（≤500） |
| `trip` | kind＝trip 時 | `name`（≤100）、`start`、`end`（都是 `YYYY-MM-DD`，必填） |

不能有別的欄位；`place`、`trip` 只能帶其中一個。

**網頁上的流程**：側欄出現「待整理」按鈕（紅色數字）。收下＝打開已填好的新增表單，使用者存檔後才會變成真的地點／行程，提案標 `accepted`；丟掉＝標 `dismissed`（6 秒內可復原）。提案不會被刪，所以 `key` 一直能拿來去重。

## 個人OS 用到的情境（2026-10-07 使用者定）

1. 「去哪玩」：跳過已去過的、也推薦地圖上的「想去」。
2. 「把 X 加到想去」→ 提案（`wishlist: true`）。
3. 晚安：今天行事曆上有地點的行程 → 提案（去過，`date` 是今天）。
4. 「我去過幾個縣」「上次去 X 是什麼時候」→ 讀地點。
5. 行事曆上的旅行 → 提案建行程。
