#!/usr/bin/env python3
"""Serve only web/, bound to loopback. No upload or conversion backend."""
import argparse
import errno
import functools
import http.server
from pathlib import Path
import webbrowser

ROOT = Path(__file__).resolve().parents[1] / "web"

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".mjs": "text/javascript", ".wasm": "application/wasm"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404)
        return None

def main():
    parser = argparse.ArgumentParser(description="twothreeD 本機圖面工作室")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    handler = functools.partial(Handler, directory=str(ROOT))
    for port in range(args.port, args.port + 10):
        try:
            server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
            break
        except OSError as error:
            if error.errno == errno.EADDRINUSE:
                continue
            raise SystemExit(f"無法啟動本機伺服器：{error}") from error
    else:
        raise SystemExit("本機連接埠無法使用，請以 --port 指定其他連接埠。")
    url = f"http://127.0.0.1:{port}/"
    print(f"\ntwothreeD 圖面工作室\nLocal: {url}\n保留此視窗即可使用；按 Ctrl+C 停止。\n", flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n圖面工作室已停止。")
    finally:
        server.server_close()

if __name__ == "__main__":
    main()
