# 鐵路資料（電車路線用）

- **來源**：[station_database](https://github.com/Seo-4d696b75/station_database)（Seo-4d696b75），版本見 `index.json` 的 `v`（目前 20260930）。該資料整合了駅データ.jp、国土数値情報（国土交通省）等來源。
- **授權**：CC BY-SA 4.0。本資料夾的檔案由上述資料加工而成，依相同授權（[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)）提供。網頁地圖右下角的出處已標示。
- 由 `tools/build-rail.mjs` 產生，**不要手動修改**。

## 檔案

- `index.json`：站（名稱、假名、座標、都道府縣）、線（名稱、代表色、代號）、每條線的相鄰站與距離。
- `geo/<路線代碼>.json`：每段相鄰站之間沿鐵軌的線形，順序與 `index.json` 裡該線的相鄰清單相同。用到哪條線才下載。

## 更新資料

1. 下載 station_database 的 `out/main/json.zip` 並解壓。
2. `node tools/build-rail.mjs <解壓後的資料夾> <版本>`（版本見該 repo 的 `latest_info.json`）。
3. 本機測試後 commit。

已存的路線保存了自己的線形與線名，更新資料不會改到舊路線。
