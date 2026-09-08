# 日文自學 App

從五十音之後接手，帶你走到 N5 的自學課程。課程內容烤在 App 裡，**完全離線運作**，
不需網路、不需 API 金鑰。

- `index.html` — **課程**（主要功能）：一課一課學，每課 單字 → 文法 → 練習
- `reader.html` — 自由閱讀：貼上任何日文，自動斷詞標音（程度夠了再用）

## 怎麼跑起來

在專案資料夾執行：

    ./devserver.py

然後用瀏覽器開 http://localhost:8000

（`devserver.py` 跟 `python3 -m http.server` 一樣，但會送 `no-store`，
避免改了 css/js 卻因為瀏覽器快取看到舊版本。）

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
- 網站放在 NAS 的 `web` 共享資料夾底下：`web/japanese/`。
  `web` 就是 DSM 預設網站的根目錄，所以**不需要在 Web Station 裡做任何別名或入口設定**，
  檔案放進去就會出現在 `http://10.0.0.57/japanese/`。
- 更新網站：跑 `./sync-to-nas.sh`（會一併部署）。需要先在 Finder 掛載 `smb://10.0.0.57/web`。
- DSM 的 nginx 送出 `.dat.gz` 時**不會**自動解壓（實測 Content-Length 吻合、開頭仍是 `1f 8b`），
  字典可正常載入。

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
    course.js         課程 App 主流程
      curriculum.js     課程資料載入
      practice.js       練習題產生器
      progress.js       進度（localStorage）
    curriculum/
      lessons.json      **課程內容**
    devserver.py        本機開發伺服器（no-cache）
    sync-to-nas.sh      回家後一鍵同步回 NAS
    vendor/kuromoji/    kuromoji 0.1.2 + 字典（17 MB，離線用）

## 進度

- [x] 閱讀引擎：斷詞 + ふりがな + 詞性上色 + 假名開關（現為 `reader.html`）
- [x] 部署到 NAS Web Station，走 Tailscale 從外面連
- [x] **課程 App**：5 課、60 單字、15 個文法點，含自動出題與關卡
- [ ] 擴充到 10 課（N5 前半）
- [ ] 間隔複習（把學過的單字按遺忘曲線排回來）
- [ ] 選配：用 Claude API 做「再解釋一次」與「再給我五題」

### 路線調整的原因
原本規劃的「點詞查中文 → 整句翻譯」全都預設使用者已經能讀真實日文文章。
實際程度是剛學完平假名、正在練片假名，那條路線接不上，因此改成課程型自學 App。
閱讀引擎沒有白做——它現在負責把課程例句自動標假名，不必手工標註。

## 課程資料怎麼加

`curriculum/lessons.json` 是唯一的內容來源。加一課就是加一個物件：

- `vocab`：單字（`kana` 一定要寫，`kanji` 沒有就填 `null`）
- `grammar`：文法點，每個含 `pattern` / `summary` / `detail` / `examples`

**練習題會自己長出來**，不用手寫題庫：單字題由 `vocab` 組合，助詞填空與排列組句
則由 kuromoji 斷詞後從 `examples` 自動生成。

> 加新內容後務必檢查標音：kuromoji 用的是 IPA 字典，有些詞它給的讀音跟教學慣用的不同
> （日本人→にっぽんじん），甚至會讀錯（何時→いつ）。這類詞要加進 `src/tokenizer.js`
> 的 `READING_OVERRIDES`，否則 App 會教錯讀音。

## 已知的技術決定

- **字典放本地而非 CDN**：kuromoji 內部用 `path.join` 組字典網址，會把 `https://` 壓成 `https:/` 而載入失敗。放本地一併解決離線需求。
- **`.tok` 用 `display: inline` 而非 `inline-block`**：inline-block 會把 ruby 高度算進盒子，底線被推離文字、助詞底色變成整塊高矩形。
- **動詞併回助動詞**：kuromoji 把「行きました」切成 行き＋まし＋た，對初學者太破碎，且點詞時該顯示的是整個詞對應的原形「行く」。
- **`vendor/kuromoji/kuromoji.js` 有一處本地修改**：原始碼一律把字典檔當 gzip 解壓，
  但有些伺服器（例如設了 `gzip_static` 的 nginx）會自動解壓後才送出，再解一次就會失敗。
  已改成先檢查 gzip magic bytes（`1f 8b`）再決定要不要解壓，兩種情況都能運作。
  **若日後重新下載 kuromoji，這個修改會不見，要重新套用。**
- **所有本地資源引用都帶 `?v=DEV`**，部署時 `sync-to-nas.sh` 會統一換成時間戳。
  不這樣做的話，手機會一直拿到快取的舊 css/js，改了看不到效果——這個問題實際踩過。
