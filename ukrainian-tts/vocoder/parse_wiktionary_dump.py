#!/usr/bin/env python3
"""Stream-parse ukwiktionary pages-articles XML dump and extract candidate accented forms.

Writes JSON lines to intonation_from_dump.jsonl with objects: {"title": ..., "forms": [..]}

This is a lightweight extractor that looks for Unicode combining acute/acute-like marks and precomposed accented vowels in page text.
"""
import io
import json
import re
import sys
from xml.etree.ElementTree import iterparse

INPUT = 'ukwiktionary-pages-articles.xml'
OUTPUT = 'intonation_from_dump.jsonl'

# Unicode ranges/marks to detect (combining acute U+0301, combining grave U+0300, etc.)
ACCENT_RE = re.compile('[\u0300\u0301\u0302\u0308\u0306\u030B\u030C\u00B4\u02C8\u02CC\u02D0]')
# Precomposed accented vowels common in Ukrainian (acute variants and others)
PRECOMPOSED_ACCENT_RE = re.compile('[áÁéÉíÍóÓúÚýÝàÀèÈìÌòÒùÙâÂêÊîÎôÔûÛёЁ]')

def has_accent(text: str) -> bool:
    if not text:
        return False
    return bool(ACCENT_RE.search(text) or PRECOMPOSED_ACCENT_RE.search(text))

def extract_forms_from_text(text: str):
    # Heuristic: find wikilinks or simple token forms and check for accent marks
    forms = set()
    # [[word]] forms
    for m in re.findall(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]", text):
        if has_accent(m):
            forms.add(m)
    # Inline words (simple tokenization) including combining marks
    for token in re.findall(r"[\w\u00C0-\u017F\u0400-\u04FF\u0300-\u036F'’-]+", text):
        if has_accent(token):
            forms.add(token)
    # Template parameters like {{склади|ма́|ти}} -> capture parts separated by |
    for m in re.findall(r"\{\{[^}]+\}\}", text):
        parts = m.strip('{}').split('|')
        for p in parts:
            p = p.strip()
            if has_accent(p):
                # remove template names like 'склади' if present
                if p and not re.match(r'^[A-Za-zА-Яа-яЁёҐґІіЇїЄє]+$', p):
                    # still accept mixed content
                    pass
                forms.add(p)
    # fallback: find any short non-space fragments that contain combining/precomposed accents
    # capture up to 40 chars around an accent mark
    for m in re.findall(r"(?:(?:\S){0,40})[\u0300-\u036F\u00B4\u00B8\u02C8\u02CC\u02D0\u00C0-\u017F](?:\S){0,40}", text):
        if has_accent(m):
            forms.add(m)
    return sorted(forms)

def main():
    print('Parsing', INPUT, '->', OUTPUT, file=sys.stderr)
    count = 0
    def localname(tag: str) -> str:
        if tag is None:
            return ''
        return tag.rsplit('}', 1)[-1]

    with open(OUTPUT, 'w', encoding='utf-8') as out:
        # iterparse to stream pages
        context = iterparse(INPUT, events=('end',))
        for event, elem in context:
            if localname(elem.tag) == 'page':
                # find title and revision/text child elements without worrying about namespace
                title = ''
                text = ''
                for child in elem:
                    if localname(child.tag) == 'title':
                        title = child.text or ''
                    if localname(child.tag) == 'revision':
                        # find text inside revision
                        for rchild in child:
                            if localname(rchild.tag) == 'text':
                                text = rchild.text or ''
                if has_accent(title) or has_accent(text):
                    forms = extract_forms_from_text(text)
                    if forms:
                        obj = {'title': title, 'forms': forms}
                        out.write(json.dumps(obj, ensure_ascii=False) + '\n')
                        count += 1
                # clear to save memory
                elem.clear()
    print('Wrote', count, 'entries to', OUTPUT, file=sys.stderr)

if __name__ == '__main__':
    main()
