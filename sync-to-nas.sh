#!/bin/bash
# 回到家、連得上 NAS 時執行這支，把進度同步回 NAS。
# 做兩件事：推 git 歷史到 NAS 的 bare repo，並把檔案鏡像到可直接瀏覽的資料夾。
set -e
cd "$(dirname "$0")"

SHARE="/Volumes/公共空間/Share"
NAS_REPO="$SHARE/japanese-reader.git"
NAS_FILES="$SHARE/japanese-reader"
WEB_ROOT="/Volumes/web/japanese"      # Web Station 的網站位置

if [ ! -d "$NAS_REPO" ]; then
  echo "連不到 NAS（找不到 $NAS_REPO）。"
  echo "請先在 Finder 掛載 10.0.0.57 的「公共空間」共享資料夾，再執行一次。"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "有還沒 commit 的修改，請先 commit："
  git status --short
  exit 1
fi

echo "→ 推送 git 歷史到 NAS…"
git push nas main

echo "→ 鏡像檔案到 NAS 資料夾…"
rsync -a --delete --exclude '.git' --exclude '.DS_Store' ./ "$NAS_FILES/"

# 網站部署：web 共享資料夾是 DSM 預設網站的根目錄，
# 放在 web/japanese/ 就會出現在 http://<nas>/japanese/，不需要任何 Web Station 設定。
if [ -d "/Volumes/web" ]; then
  echo "→ 部署到 NAS 網站…"
  mkdir -p "$WEB_ROOT"
  rsync -a --delete \
    --exclude '.git' --exclude '.DS_Store' --exclude 'README.md' \
    --exclude 'sync-to-nas.sh' --exclude '.gitignore' --exclude '日文閱讀器_交接.md' \
    ./ "$WEB_ROOT/"
  echo "   網站已更新：http://10.0.0.57/japanese/"
else
  echo "→ 略過網站部署（web 共享資料夾未掛載）"
  echo "   要部署的話，先在 Finder 開 smb://10.0.0.57/web 再跑一次。"
fi

echo "同步完成。NAS 上已是最新版。"
