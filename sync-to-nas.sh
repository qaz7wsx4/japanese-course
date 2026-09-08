#!/bin/bash
# 回到家、連得上 NAS 時執行這支，把進度同步回 NAS。
# 做兩件事：推 git 歷史到 NAS 的 bare repo，並把檔案鏡像到可直接瀏覽的資料夾。
set -e
cd "$(dirname "$0")"

# NAS 的實際路徑放在 nas.conf（不進版控）。第一次用請複製 nas.conf.example。
if [ ! -f nas.conf ]; then
  echo "找不到 nas.conf。請先執行：cp nas.conf.example nas.conf，再填入你的 NAS 路徑。"
  exit 1
fi
. ./nas.conf

NAS_REPO="$NAS_SHARE/japanese-reader.git"
NAS_FILES="$NAS_SHARE/japanese-reader"
WEB_ROOT="$NAS_WEB_ROOT"

if [ ! -d "$NAS_REPO" ]; then
  echo "連不到 NAS（找不到 $NAS_REPO）。"
  echo "請先在 Finder 掛載 NAS 的共享資料夾，再執行一次。"
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
if [ -d "$(dirname "$WEB_ROOT")" ]; then
  echo "→ 部署到 NAS 網站…"
  mkdir -p "$WEB_ROOT"
  rsync -a --delete \
    --exclude '.git' --exclude '.DS_Store' --exclude 'README.md' \
    --exclude 'sync-to-nas.sh' --exclude '.gitignore' --exclude '日文閱讀器_交接.md' \
    ./ "$WEB_ROOT/"
  # 蓋掉瀏覽器快取：把所有本地資源加上這次部署的版本號。
  # 不做的話，手機會一直拿到舊的 css/js，改了看不到效果。
  VER=$(date +%Y%m%d%H%M%S)
  python3 - "$WEB_ROOT" "$VER" <<'PYEOF'
import os, sys
root, ver = sys.argv[1], sys.argv[2]
n = 0
for dirpath, _, names in os.walk(root):
    if 'vendor' in dirpath:
        continue
    for name in names:
        if not name.endswith(('.html', '.js')):
            continue
        f = os.path.join(dirpath, name)
        s = open(f, encoding='utf-8').read()
        if '?v=DEV' in s:
            open(f, 'w', encoding='utf-8').write(s.replace('?v=DEV', '?v=' + ver))
            n += 1
print(f'   已為 {n} 個檔案標記版本 {ver}')
PYEOF
  echo "   網站已更新：$NAS_SITE_URL"
else
  echo "→ 略過網站部署（web 共享資料夾未掛載）"
  echo "   要部署的話，先在 Finder 掛載 NAS 的 web 共享資料夾再跑一次。"
fi

echo "同步完成。NAS 上已是最新版。"
