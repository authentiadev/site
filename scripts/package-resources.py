#!/usr/bin/env python3
"""Package selected resource folders; paid products must live outside the website."""
import argparse
import csv
import io
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def bundle(resource, private_root):
    slug = resource['slug']
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug):
        raise ValueError('Invalid resource slug')
    if resource['kind'] == 'Free':
        if resource['download'] != f'../downloads/free/{slug}.zip':
            raise ValueError('Unexpected public download path')
        directory = ROOT / 'downloads/free' / slug
    elif resource['kind'] == 'Paid':
        if resource.get('download') or not private_root:
            raise ValueError('Paid packs require a private root and no public download')
        if private_root.is_relative_to(ROOT):
            raise ValueError('Full paid products must remain outside the website repository')
        directory = private_root / slug
    else:
        raise ValueError('Unknown resource kind')
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError(f'Not a regular resource directory: {directory}')
    files = sorted(path for path in directory.iterdir() if path.name != '.DS_Store')
    required = {f'{slug}-guide.html', f'{slug}-README.txt', f'{slug}-prompts.txt', f'{slug}-worksheets.xlsx'}
    if not required.issubset({path.name for path in files}):
        raise ValueError(f'Incomplete resource: {slug}')
    for path in files:
        if path.is_symlink() or not path.is_file() or not path.name.startswith(slug+'-') or path.suffix not in {'.html', '.csv', '.txt', '.xlsx'}:
            raise ValueError(f'Unexpected bundle member: {path}')
        if path.suffix == '.csv':
            rows = list(csv.reader(io.StringIO(path.read_text(encoding='utf-8-sig'))))
            if len(rows) < 2 or not rows[0] or len(set(rows[0])) != len(rows[0]) or any(len(row) != len(rows[0]) for row in rows):
                raise ValueError(f'Malformed CSV: {path}')
            if any(re.match(r'^[=+@]|^-(?!\d)', value.lstrip()) for row in rows for value in row):
                raise ValueError(f'Executable spreadsheet-like CSV cell: {path}')
            if path.name.endswith('-template.csv'):
                example = directory / path.name.replace('-template.csv', '-fictional-example.csv')
                if example not in files:
                    raise ValueError(f'Missing worked example for {path.name}')
    archive = directory.with_suffix('.zip')
    # Fixed timestamps and sorted members make rebuilding unchanged resources reproducible.
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as package:
        for path in files:
            info = zipfile.ZipInfo(slug+'/'+path.name, (2026, 10, 29, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            package.writestr(info, path.read_bytes())
    with zipfile.ZipFile(archive) as package:
        if package.testzip() is not None or len(package.namelist()) != len(files):
            raise ValueError(f'Archive verification failed: {archive}')
    print(f'Packaged {resource["kind"].lower()} {slug}: {len(files)} files, {archive.stat().st_size:,} bytes')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--resource', action='append', required=True, help='Resource slug; repeat for multiple packs')
    parser.add_argument('--private-root', type=Path)
    args = parser.parse_args()
    catalogue = {resource['slug']: resource for resource in json.loads((ROOT/'content/resources.json').read_text())}
    if len(set(args.resource)) != len(args.resource) or any(slug not in catalogue for slug in args.resource):
        parser.error('Unknown or repeated resource slug')
    private_root = args.private_root.resolve() if args.private_root else None
    for slug in args.resource:
        bundle(catalogue[slug], private_root)


if __name__ == '__main__':
    main()
