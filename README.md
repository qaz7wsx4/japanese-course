# 日文閱讀輔助（Japanese Reading Helper）

貼上日文 → 自動斷詞、標假名（ふりがな）、詞性上色。P1 完全離線運作，不需網路、不需 API 金鑰。

## 怎麼跑起來

在專案資料夾執行：

    python3 -m http.server 8000

然後用瀏覽器開 http://localhost:8000

Mac 內建 python3，不需要安裝任何東西。**在蘭嶼沒有網路也照樣能跑**——kuromoji 與 17 MB 字典都已放在 `vendor/` 裡。

### 用手機開
確認手機和電腦連同一個 Wi-Fi，查電腦 IP：

    ipconfig getifaddr en0

手機瀏覽器開 `http://<那個IP>:8000`

## 檔案在哪

| 位置 | 角色 |
|---|---|
| `~/Projects/japanese-reader` | **工作副本**，平常在這裡改東西。在電腦內接硬碟，離線可用 |
| `/Volumes/公共空間/Share/japanese-reader` | **NAS 上的備份**，只有回到家連得到 NAS 時才同步 |

### 出門在外（例如蘭嶼）
照常改程式，改完存檔就好。想留一個進度紀錄就 commit：

    git add -A && git commit -m "說明改了什麼"

完全不需要網路，也不需要 NAS。

### 回家後同步回 NAS
連上 NAS 之後，在 `~/Projects/japanese-reader` 執行：

    git push nas main

NAS 上的資料夾會自動更新成最新版（已設定 `receive.denyCurrentBranch=updateInstead`），
可以直接在 NAS 上瀏覽檔案，不是只有 git 資料。

## 程式結構

    index.html          入口
    style.css           樣式與詞性色票
    src/
      app.js            啟動、事件、流程串接
      tokenizer.js      kuromoji 載入（含進度）、斷詞、詞塊合併
      furigana.js       讀音對齊演算法（核心）
      pos.js            詞性正規化與分類
      render.js         tokens → DOM
    vendor/kuromoji/    kuromoji 0.1.2 + 字典（17 MB，離線用）

## 進度

- [x] **P1** 斷詞 + ふりがな + 詞性上色 + 假名開關
- [ ] **P2** 點詞顯示原形／詞性／活用形（資料 kuromoji 已有，不花錢）
- [ ] **P3** 點詞查中文意思（Claude API，本機 proxy）
- [ ] **P4** 整句翻譯對照
- [ ] **P5** 部署 + serverless proxy 藏 API 金鑰

## 已知的技術決定

- **字典放本地而非 CDN**：kuromoji 內部用 `path.join` 組字典網址，會把 `https://` 壓成 `https:/` 而載入失敗。放本地一併解決離線需求。
- **`.tok` 用 `display: inline` 而非 `inline-block`**：inline-block 會把 ruby 高度算進盒子，底線被推離文字、助詞底色變成整塊高矩形。
- **動詞併回助動詞**：kuromoji 把「行きました」切成 行き＋まし＋た，對初學者太破碎，且點詞時該顯示的是整個詞對應的原形「行く」。
