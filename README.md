# 日本旅遊地圖

個人 Japan 旅遊記錄工具，使用 Google Maps + Firebase 建立。

## 功能
- 標記去過的地點（美食、神社、自然、文化、購物）
- 繪製路線並標示交通方式（開車/公車、走路、電車）
- 附加筆記與造訪日期
- 多帳號登入（Email 或 Google 帳號）
- 匯入 Google 時間軸記錄（Semantic Location History）
- 側欄收合功能

## 部署到 GitHub Pages

### 1. 上傳到 GitHub
```bash
git init
git add .
git commit -m "初始建立"
git branch -M main
git remote add origin https://github.com/你的帳號/japan-map.git
git push -u origin main
```

### 2. 開啟 GitHub Pages
Repository → Settings → Pages → Source 選 `main` 分支 → Save

網址會是：`https://你的帳號.github.io/japan-map`

### 3. Firebase 設定

#### 新增授權網域
Firebase Console → Authentication → Settings → 授權網域 → 新增 `你的帳號.github.io`

#### 設定 Firestore 安全規則
Firebase Console → Firestore Database → 規則 → 貼上 `firestore.rules` 的內容 → 發布

#### 設定 Google 登入（可選）
Firebase Console → Authentication → Sign-in method → Google → 啟用

### 4. Google Maps API 限制
Google Cloud Console → 憑證 → 你的 API Key → HTTP 參照網址 → 新增：
- `localhost:*`（本地測試）
- `你的帳號.github.io/*`（正式網址）

## 本地測試
直接用瀏覽器開啟 `index.html` 即可（需要網路連線）。
