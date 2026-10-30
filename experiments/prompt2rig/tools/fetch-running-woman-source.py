"""Fetch the reviewed CC0 data only; no third-party code is executed."""
import hashlib
import json
from pathlib import Path
import sys
import urllib.parse
import urllib.request

if len(sys.argv) != 2:
    raise SystemExit('Usage: python tools/fetch-running-woman-source.py /path/to/runner-source')
destination = Path(sys.argv[1]).resolve()
manifest = json.loads((Path(__file__).resolve().parent.parent / 'public/lab/characters/running-woman/manifest.json').read_text())
source = manifest['source']
base = ('https://raw.githubusercontent.com/kirbycope/godot-3d-player-controller-v2/'
        'a928cfa67684352b75a65c510d8751d1f3f2489c/assets/universal_base_characters/')
for relative, expected in source['hashes'].items():
    output = destination / relative
    if output.exists() and hashlib.sha256(output.read_bytes()).hexdigest() == expected:
        print('Verified', relative)
        continue
    with urllib.request.urlopen(base + urllib.parse.quote(relative, safe='/'), timeout=30) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != expected:
        raise SystemExit('Source hash differs: ' + relative)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(data)
    print('Downloaded and verified', relative)
