"""Fetch the explicitly curated public assets; never search or change selections.

Run from any directory with Python 3. Existing files must match their saved hash.
Kenney files come from the official archive: see MODEL_SOURCES.md for recovery.
"""
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlparse
import concurrent.futures
import hashlib
import json
import struct

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'web/config/model-assets.json'
MAX_BYTES = 25 * 1024 * 1024


def inspect_glb(data):
    if len(data) < 20 or len(data) > MAX_BYTES:
        raise ValueError('Invalid GLB length')
    magic, version, length = struct.unpack_from('<4sII', data)
    if magic != b'glTF' or version != 2 or length != len(data):
        raise ValueError('Invalid GLB 2 header')
    size, kind = struct.unpack_from('<II', data, 12)
    if kind != 0x4E4F534A or 20 + size > length:
        raise ValueError('Missing GLB JSON chunk')
    obj = json.loads(data[20:20 + size])
    if obj.get('asset', {}).get('version') != '2.0' or not obj.get('meshes'):
        raise ValueError('No glTF 2 meshes')
    if any('uri' in x for x in obj.get('buffers', []) + obj.get('images', [])):
        raise ValueError('Models must embed buffers and images, without external requests')
    return obj


def fetch_asset(asset):
    relative = Path(asset['local_uri'])
    target = (ROOT / 'web' / relative).resolve()
    if not target.is_relative_to((ROOT / 'web/assets/models').resolve()):
        raise ValueError('Model path leaves model library')
    if target.exists():
        data = target.read_bytes()
    else:
        if asset.get('source_kind') == 'generated':
            raise ValueError('Rebuild this original model with: node scripts/generate-model-assets.mjs')
        url = asset['download_url']
        if not url:
            raise ValueError('Recover this model from its official archive: ' + asset['id'])
        parsed = urlparse(url)
        if parsed.scheme != 'https' or parsed.hostname != 'cdn.3dassets.dev':
            raise ValueError('Unapproved asset download host')
        request = Request(url, headers={'User-Agent': 'twothreeD model-library acquisition'})
        with urlopen(request, timeout=40) as response:
            data = response.read(MAX_BYTES + 1)
    gltf = inspect_glb(data)
    digest = hashlib.sha256(data).hexdigest()
    if asset['sha256'] and asset['sha256'] != digest:
        raise ValueError('SHA-256 mismatch: ' + asset['id'])
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        temporary = target.with_suffix('.glb.part')
        temporary.write_bytes(data)
        temporary.replace(target)
    return {**asset, 'bytes': len(data), 'sha256': digest, 'status': 'generated' if asset.get('source_kind') == 'generated' else 'downloaded',
            'gltf_extensions_required': gltf.get('extensionsRequired', []),
            'gltf_extensions_used': gltf.get('extensionsUsed', []),
            'embedded_image_count': len(gltf.get('images', [])),
            'mesh_count': len(gltf['meshes'])}


def main():
    catalog = json.loads(MANIFEST.read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        catalog['assets'] = list(pool.map(fetch_asset, catalog['assets']))
    MANIFEST.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    print('Verified/downloaded', len(catalog['assets']), 'GLB assets;',
          sum(a['bytes'] for a in catalog['assets']), 'bytes')


if __name__ == '__main__':
    main()
