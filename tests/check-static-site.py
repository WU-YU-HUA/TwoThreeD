"""Check deployable files and relative resources under a GitHub project prefix."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse, unquote
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1] / 'web'
BASE = 'https://example.github.io/TwoThreeD/'
PREFIX = '/TwoThreeD/'

def resource(ref, parent):
    if not ref or ref.startswith(('#', 'data:', 'blob:', 'https:', 'http:', 'mailto:')):
        return
    assert not ref.startswith('/'), f'Root-relative URL breaks project hosting: {parent}: {ref}'
    resolved = urlparse(urljoin(urljoin(BASE, parent), ref))
    assert resolved.path.startswith(PREFIX), f'Resource escapes site: {parent}: {ref}'
    target = ROOT / unquote(resolved.path[len(PREFIX):])
    if target.is_dir():
        target /= 'index.html'
    assert target.is_file(), f'Missing resource: {parent}: {ref}'

class Links(HTMLParser):
    def __init__(self, parent):
        super().__init__()
        self.parent = parent

    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if key in ('src', 'href'):
                resource(value, self.parent)

files = [p for p in ROOT.rglob('*') if p.is_file()]
assert (ROOT / 'index.html').is_file() and (ROOT / 'model-library.html').is_file()
for path in ROOT.rglob('*'):
    assert not path.is_symlink(), f'Pages artifact must not contain symlinks: {path}'
for path in files:
    relative = path.relative_to(ROOT).as_posix()
    assert path.suffix.lower() not in ('.pdf', '.dae', '.zip', '.pyc'), f'Non-site artifact: {relative}'
    assert not any(p in ('.git', '.local', 'outputs', '__pycache__') for p in path.relative_to(ROOT).parts)
    assert path.stat().st_size < 100 * 1024 * 1024, f'Oversized static file: {relative}'
    if path.suffix == '.html':
        Links(relative).feed(path.read_text())
    if path.suffix == '.js' and 'vendor' not in path.parts:
        text = path.read_text()
        for ref in re.findall(r"(?:from\s*|import\s*\(\s*)['\"]([^'\"]+)['\"]", text):
            resource(ref, relative)

catalog = json.loads((ROOT / 'config/model-assets.json').read_text())
for asset in catalog['assets']:
    resource(asset['local_uri'], 'index.html')
    data = (ROOT / asset['local_uri']).read_bytes()
    assert len(data) == asset['bytes'] and hashlib.sha256(data).hexdigest() == asset['sha256'], asset['id']
for relative in ('js/contracts/validators.generated.js', 'vendor/pdfjs/build/pdf.mjs',
                 'vendor/pdfjs/build/pdf.worker.mjs', 'vendor/three/three.module.js',
                 'vendor/three/three.core.js', 'vendor/three/OrbitControls.js',
                 'config/object-catalog.json', 'config/model-appearance.json'):
    resource(relative, 'index.html')
for folder in ('vendor/pdfjs/cmaps', 'vendor/pdfjs/standard_fonts', 'vendor/pdfjs/wasm'):
    assert any((ROOT / folder).iterdir()), folder
print(f'PASS: {len(files)} static files, {len(catalog["assets"])} verified GLBs, HTML/module resources resolve under /TwoThreeD/; PDF workers/fonts/WASM included.')
