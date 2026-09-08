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
| `/Volumes/公共空間/Share/japanese-reader` | NAS 上**可瀏覽的檔案鏡像** |
| `/Volumes/公共空間/Share/japanese-reader.git` | NAS 上的 **git 備份**（含完整歷史） |

### 出門在外（例如蘭嶼）
照常改程式，改完存檔就好。想留一個進度紀錄就 commit：

    git add -A && git commit -m "說明改了什麼"

完全不需要網路，也不需要 NAS。

### 回家後同步回 NAS
連上 NAS 之後，在專案資料夾執行：

    ./sync-to-nas.sh

它會把 git 歷史推到 NAS 的 `japanese-reader.git`，再把檔案鏡像到 `japanese-reader/` 資料夾
（後者可以在 Finder 或手機上直接瀏覽）。沒連到 NAS 時它會直接告訴你，不會做半套。

> 為什麼不是單純 `git push`：NAS 的 SMB 掛載上，git 的 `receive-pack` 不會讀該 repo 的
> `.git/config`，`receive.denyCurrentBranch` 設了也沒用，推不進有 checkout 的 repo。
> 改用 bare repo 收 push 就完全避開這個問題。

## 在外面使用（NAS + Tailscale）

網站放在 NAS 的 Web Station，靠 Tailscale 這個私人網路從外面連回來。
**NAS 不開任何對外連接埠**，監視器錄影與備份不會暴露。

- NAS：Synology DSM 7.x（10.0.0.57），已裝 Container Manager
- 網站根目錄直接指向 NAS 上的鏡像資料夾 `/公共空間/Share/japanese-reader`，
  所以跑一次 `./sync-to-nas.sh` 就等於更新了網站，不需要第二套部署流程。

> QuickConnect 做不到這件事。它只中繼 DSM 本身與有註冊的 Synology 套件，
> 不會把 Web Station 的自訂網站對外開放（2026-09 查證）。

## 程式結構

    index.html          入口
    style.css           樣式與詞性色票
    src/
      app.js            啟動、事件、流程串接
      tokenizer.js      kuromoji 載入（含進度）、斷詞、詞塊合併
      furigana.js       讀音對齊演算法（核心）
      pos.js            詞性正規化與分類
      render.js         tokens → DOM
    sync-to-nas.sh      回家後一鍵同步回 NAS
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
- **`vendor/kuromoji/kuromoji.js` 有一處本地修改**：原始碼一律把字典檔當 gzip 解壓，
  但有些伺服器（例如設了 `gzip_static` 的 nginx）會自動解壓後才送出，再解一次就會失敗。
  已改成先檢查 gzip magic bytes（`1f 8b`）再決定要不要解壓，兩種情況都能運作。
  **若日後重新下載 kuromoji，這個修改會不見，要重新套用。**
