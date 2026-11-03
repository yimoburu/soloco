#!/usr/bin/env python3
"""Bundle the canonical governance and role catalog; --check rejects drift."""
import argparse
import json
from pathlib import Path
from materialize import ROLES

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'plugins/company/assets'

def build(check=False):
    files = {'governance.md': (ROOT / 'SPEC.md').read_bytes(),
             'roles.json': (json.dumps(ROLES, indent=2, ensure_ascii=False) + '\n').encode()}
    for name, content in files.items():
        target = ASSETS / name
        if check:
            if not target.is_file() or target.read_bytes() != content:
                raise SystemExit(f'Plugin bundle is stale: {target}. Run python3 tools/build_plugin.py')
        else:
            ASSETS.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    build(parser.parse_args().check)
