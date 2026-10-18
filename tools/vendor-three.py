"""Vendor a pinned official Three.js release as a classic browser script for file://."""
from pathlib import Path
from urllib.request import urlopen
from io import BytesIO
import base64
import hashlib
import tarfile

VERSION = '0.180.0'
INTEGRITY = 'o+qycAMZrh+TsE01GqWUxUIKR1AL0S8pq7zDkYOQw8GqfX8b8VoCKYUoHbhiX5j+7hr8XsuHDVU6+gkQJQKg9w=='
URL = f'https://registry.npmjs.org/three/-/three-{VERSION}.tgz'
ROOT = Path(__file__).resolve().parents[1]

with urlopen(URL, timeout=60) as response:
    archive = response.read()
assert base64.b64encode(hashlib.sha512(archive).digest()).decode() == INTEGRITY
with tarfile.open(fileobj=BytesIO(archive), mode='r:gz') as package:
    source = package.extractfile('package/build/three.cjs').read().decode('utf-8')
    license_text = package.extractfile('package/LICENSE').read().decode('utf-8')
assert 'require(' not in source, 'This release needs a different browser bundling strategy.'
vendor = ROOT / 'vendor'
vendor.mkdir(exist_ok=True)
wrapped = f'/* Three.js {VERSION}; official CommonJS build wrapped for offline classic-script use. */\nwindow.THREE = (function () {{\nconst exports = {{}};\n{source}\nreturn exports;\n}})();\n'
(vendor / 'three-r180.js').write_text(wrapped, encoding='utf-8')
(vendor / 'THREE-LICENSE.txt').write_text(license_text, encoding='utf-8')
(vendor / 'README.md').write_text(f'''# Three.js local dependency

- Version: {VERSION} (r180), MIT license; see THREE-LICENSE.txt.
- Official source: {URL}
- SHA-512 of the npm archive (base64): {INTEGRITY}
- The official build/three.cjs is unchanged inside a small window.THREE wrapper.
- No CDN, imports, package installation or build step is needed to browse the site.
- Reproduce with python tools/vendor-three.py; only this maintenance command uses the network.
- Upstream documentation: https://threejs.org/docs/
''', encoding='utf-8')
print(f'Three.js {VERSION}: verified and vendored ({len(wrapped.encode())} bytes).')
