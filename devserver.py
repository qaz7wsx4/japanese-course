#!/usr/bin/env python3
"""本機開發用伺服器。跟 python3 -m http.server 一樣，但一律送 no-store，
避免改了 css/js 卻因為瀏覽器快取而看到舊版本（正式部署有版本號機制，不需要這個）。

用法：./devserver.py [埠號]     預設 8000，固定服務這個腳本所在的資料夾。
"""
import functools, http.server, os, socketserver, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ROOT = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

socketserver.TCPServer.allow_reuse_address = True
handler = functools.partial(Handler, directory=ROOT)
with socketserver.TCPServer(('', PORT), handler) as httpd:
    print(f'開發伺服器 http://localhost:{PORT}  （服務 {ROOT}）')
    httpd.serve_forever()
