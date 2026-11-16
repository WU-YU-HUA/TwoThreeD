#!/bin/zsh
cd -- "${0:A:h}"
if command -v python3 >/dev/null 2>&1; then
  python3 scripts/serve.py
elif [[ -x /opt/homebrew/bin/python3 ]]; then
  /opt/homebrew/bin/python3 scripts/serve.py
else
  print '需要 Python 3 才能啟動本機靜態伺服器。'
  read -r '?按 Enter 關閉。'
fi
