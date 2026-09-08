# 這個資料夾不是本專案的程式碼

內容是 [kuromoji.js](https://github.com/takuyaa/kuromoji.js) 0.1.2 及其詞典檔，
原樣收錄於此以達成完全離線運作。

- `kuromoji.js` — Apache License 2.0，作者 Takuya Asano。**本專案對它做了一處修改**，
  詳見下方。
- `dict/` — 由 mecab-ipadic-2.7.0-20070801 建置，版權屬 Nara Institute of
  Science and Technology (NAIST)。授權條款要求任何散布都必須附上版權聲明，
  完整內容見 `NOTICE.md`。
- `LICENSE-2.0.txt`、`NOTICE.md` — 原始授權文件。

## 本專案對 kuromoji.js 的修改

`BrowserDictionaryLoader.prototype.loadArrayBuffer` 原本無條件把回應當 gzip 解壓。
但有些伺服器（設了 `gzip_static` 的 nginx、部分靜態託管服務）會自動解壓後才送出，
此時再解一次就會失敗。已改為先檢查 gzip magic bytes（`1f 8b`）再決定是否解壓，
兩種情況都能運作。

**若重新下載 kuromoji，這個修改會消失，需要重新套用。**
