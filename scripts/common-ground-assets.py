#!/usr/bin/env python3
"""Verify or reproduce the curated Common Ground Assetrizz PNG copies."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
PROVENANCE = ROOT / 'assets/common-ground/provenance.json'
PUBLIC = ROOT / 'public/assetrizz'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def dimensions(data):
    if len(data) < 24 or data[:8] != b'\x89PNG\r\n\x1a\n' or data[12:16] != b'IHDR':
        raise ValueError('invalid PNG header')
    return list(struct.unpack('>II', data[16:24]))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['check', 'import'])
    parser.add_argument('--library', type=Path, help='upstream checkout root; otherwise fetch pinned GitHub revision')
    args = parser.parse_args()
    config = json.loads(PROVENANCE.read_text())

    def upstream(path):
        if args.library:
            return (args.library / path).read_bytes()
        url = f"https://raw.githubusercontent.com/mojomast/assetrizz/{config['revision']}/{path}"
        with urllib.request.urlopen(url, timeout=60) as response:
            return response.read()

    if args.command == 'import':
        manifest = upstream('assets/manifest.jsonl')
        if sha(manifest) != config['manifestSha256']:
            raise ValueError('upstream manifest SHA-256 mismatch')
        records = {entry['path']: entry for entry in map(json.loads, manifest.splitlines())}
        # Validate all inputs before writing anything.
        copies = []
        for asset in config['assets']:
            record = records[asset['sourcePath']]
            for field, expected in [('sha256', asset['sourceSha256']), ('width', asset['dimensions'][0]),
                                    ('height', asset['dimensions'][1]), ('license', config['license']),
                                    ('pivot', asset['pivot']), ('tileable', 0)]:
                if record[field] != expected:
                    raise ValueError(f"manifest mismatch: {asset['sourcePath']} {field}")
            data = upstream(asset['sourcePath'])
            if sha(data) != asset['sourceSha256'] or dimensions(data) != asset['dimensions']:
                raise ValueError(f"source mismatch: {asset['sourcePath']}")
            if sha(data) != asset['outputSha256']:
                raise ValueError(f"output hash mismatch: {asset['output']}")
            copies.append((PUBLIC / asset['output'], data))
        for target, data in copies:
            target.write_bytes(data)

    for asset in config['assets']:
        data = (PUBLIC / asset['output']).read_bytes()
        if sha(data) != asset['outputSha256'] or dimensions(data) != asset['dimensions']:
            raise ValueError(f"output mismatch: {asset['output']}")
        if asset['outputSha256'] != asset['sourceSha256']:
            raise ValueError(f"unexpected derivative: {asset['output']}")
    print(f"Verified {len(config['assets'])} Common Ground PNGs ({args.command}).")


if __name__ == '__main__':
    main()
