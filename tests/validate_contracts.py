"""Run the same compiled JSON Schema validators used by the browser.

Usage: python3 tests/validate_contracts.py [path-to-node]
No additional Python dependencies are required.
"""
from pathlib import Path
import shutil
import subprocess
import sys

node = sys.argv[1] if len(sys.argv) > 1 else shutil.which("node")
if not node:
    raise SystemExit("請提供 Node 執行檔路徑。")
root = Path(__file__).resolve().parents[1]
subprocess.run([node, str(root / "tests/check-contracts.mjs")], cwd=root, check=True)
