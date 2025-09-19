#!/usr/bin/env python3
"""Merge extracted accent forms from dump into the existing overrides JSON.

Produces intonation_overrides_expanded.json and updates external_dicts_manifest.json with counts.
"""
import json
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent
SRC = BASE / 'intonation_from_dump.jsonl'
DEST = BASE / 'intonation_overrides_expanded.json'
MANIFEST = BASE / 'external_dicts_manifest.json'
LOCAL = BASE / 'intonation_overrides.json'

def normalize_token(tok: str) -> str:
    # strip wiki link brackets and templates
    tok = re.sub(r"\[\[|\]\]", '', tok)
    tok = re.sub(r"\{\{[^}]+\}\}", '', tok)
    tok = tok.strip()
    # collapse multiple spaces
    tok = re.sub(r"\s+", ' ', tok)
    return tok

def main():
    local = {}
    if LOCAL.exists():
        local = json.loads(LOCAL.read_text(encoding='utf-8'))
    extracted = {}
    if SRC.exists():
        for line in SRC.read_text(encoding='utf-8').splitlines():
            obj = json.loads(line)
            for f in obj.get('forms', []):
                t = normalize_token(f)
                # heuristics: accept tokens that contain accented chars or combining marks
                if any(ch in t for ch in "́̀ˈ́`´"):  # rough set
                    # strip surrounding punctuation
                    t = t.strip("'\".,:;()[]{} –—–")
                    # If token contains pipe '|' keep only rightmost part
                    if '|' in t:
                        t = t.split('|')[-1]
                    extracted[t] = t
    # Merge: prefer local overrides if present
    merged = dict(local)
    added = 0
    for k,v in extracted.items():
        # if k already in merged (exact match) skip
        if k in merged:
            continue
        merged[k] = v
        added += 1

    DEST.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding='utf-8')
    # update manifest
    manifest = {'sources': []}
    if MANIFEST.exists():
        try:
            manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
        except Exception:
            manifest = {'sources': []}
    manifest['sources'].append({'name': 'ukwiktionary_dump', 'entries_from_dump': len(extracted), 'added': added})
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Merged', len(merged), 'entries (added', added, 'from dump)')

if __name__ == '__main__':
    main()
