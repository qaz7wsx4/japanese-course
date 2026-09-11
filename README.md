# 日文自學 App

**線上版：https://qaz7wsx4.github.io/japanese-course/**

從五十音之後接手、帶你走到 N5 的自學課程。課程內容烤在 App 裡，**完全離線運作**——
不需要網路、不需要 API 金鑰、不需要註冊。

- **課程**（`index.html`）：一課一課學，每課 單字 → 文法 → 練習。練習達 70 分才解鎖下一課。
- **自由閱讀**（`reader.html`）：貼上任何日文，自動斷詞、標假名（ふりがな）、詞性上色。

介面與講解全為繁體中文。

## 跑起來

不需要安裝任何東西（macOS 內建 python3 就夠）：

    ./devserver.py

瀏覽器開 http://localhost:8000

用手機看的話，確認手機和電腦在同一個 Wi-Fi，然後查電腦 IP：

    ipconfig getifaddr en0

手機開 `http://<那個IP>:8000`。

> `devserver.py` 跟 `python3 -m http.server` 一樣，但會送 `no-store`。
> 少了這個，改完 css/js 會因為瀏覽器快取而看不到效果。

## 課程內容怎麼加

`curriculum/lessons.json` 是唯一的內容來源。加一課就是加一個物件：

- `vocab` — 單字。`kana` 必填；沒有漢字寫法就把 `kanji` 填 `null`
- `grammar` — 文法點，每個含 `pattern` / `summary` / `detail` / `examples`

**練習題會自己長出來，不需要手寫題庫。** 單字題由 `vocab` 組合；助詞填空與排列組句
則是把 `examples` 丟給 kuromoji 斷詞後自動生成，所以同一課每次練到的題目都不一樣。

> **加完新內容一定要檢查標音。** kuromoji 用的是 IPA 字典，有些詞給的讀音跟教學慣用的
> 不同（日本人 → にっぽんじん），甚至會讀錯（何時 → いつ）。這類詞要加進
> `src/tokenizer.js` 的 `READING_OVERRIDES`，否則 App 會安靜地教錯讀音——這種錯不會
> 報錯，只會讓人背錯。

## 程式結構

    index.html          課程 App
    reader.html         自由閱讀
    style.css
    src/
      course.js         課程主流程與畫面
      curriculum.js     課程資料載入
      practice.js       練習題產生器
      progress.js       進度與解鎖（localStorage）
      tokenizer.js      kuromoji 載入、斷詞、詞塊合併、讀音覆寫
      furigana.js       讀音對齊演算法
      pos.js            詞性分類
      render.js         tokens → DOM
      reader.js         自由閱讀頁的流程
    curriculum/
      lessons.json      課程內容
    vendor/kuromoji/    kuromoji + 詞典（17 MB，離線用）
    devserver.py        本機開發伺服器
    sync-to-nas.sh      同步到自家 NAS（選用）

學習進度存在瀏覽器的 localStorage，不會離開你的裝置，也不會進版控。

## 部署

純靜態網站，丟到任何靜態託管都能跑。路徑全部是相對路徑，放在子目錄底下也沒問題。

**GitHub Pages**（主要）：推到 `main` 就會自動部署，1～2 分鐘後上線。

    git push github main

GitHub 對靜態檔設 `max-age=600`，所以更新後最多 10 分鐘內所有裝置都會拿到新版。
實測 GitHub Pages 會原樣送出 `.dat.gz`（`Content-Type: application/gzip`，無 `Content-Encoding`），
kuromoji 自行解壓，字典正常載入。

**自家 NAS**（選用）：`cp nas.conf.example nas.conf`，填入你的路徑後跑 `./sync-to-nas.sh`。
它會推 git 歷史到 NAS 的 bare repo、鏡像檔案、並部署到網站目錄。

> 部署時所有本地資源引用的 `?v=DEV` 會被換成時間戳，用來蓋掉瀏覽器快取。
> 沒有這一步，手機會一直拿到舊的 css/js。

## 幾個實作上的決定

- **詞典放在本地而非 CDN**：kuromoji 內部用 `path.join` 組字典網址，會把 `https://`
  壓成 `https:/` 而載入失敗。放本地一併解決離線需求。
- **`.tok` 用 `display: inline` 而非 `inline-block`**：後者會把 ruby 的高度算進盒子，
  底線被推離文字、助詞底色變成一整塊高矩形。
- **動詞併回其後的助動詞**：kuromoji 把「行きました」切成 行き＋まし＋た，對初學者
  太破碎，而且要學的單位本來就是整個「行きました」。
- **`ruby-align: center`**：讀音比詞面寬時（勉強／べんきょう），瀏覽器預設會把漢字
  攤開，看起來像詞被拆開了。

## 授權與出處

`vendor/kuromoji/` 底下不是本專案的程式碼：

- [kuromoji.js](https://github.com/takuyaa/kuromoji.js) 0.1.2 — Apache License 2.0，
  作者 Takuya Asano。本專案對它做了一處修改，詳見 `vendor/kuromoji/README.md`。
- 詞典由 mecab-ipadic-2.7.0-20070801 建置 — 版權屬 Nara Institute of Science and
  Technology (NAIST)。**其授權條款要求任何散布都必須附上版權聲明**，完整內容見
  `vendor/kuromoji/NOTICE.md`。

課程內容與其餘程式碼為本專案作者所有。
