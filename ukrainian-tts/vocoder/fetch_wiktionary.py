#!/usr/bin/env python3
# Simple Wiktionary fetcher: queries MediaWiki API for pages and returns page HTML
import sys, os, json
from urllib import request, parse

MANIFEST = 'external_dicts_manifest.json'
ROOT = os.path.dirname(__file__)
OUT_DIR = ROOT


def fetch_page(word):
    URL = 'https://uk.wiktionary.org/w/api.php'
    params = {
        'action': 'parse',
        'page': word,
        'prop': 'text|titles',
        'format': 'json'
    }
    url = URL + '?' + parse.urlencode(params)
    with request.urlopen(url, timeout=30) as resp:
        raw = resp.read()
    try:
        data = json.loads(raw)
    except Exception:
        return None
    if 'error' in data:
        return None
    return data.get('parse', {})


def extract_accented_forms(html):
    # Minimal heuristic without BeautifulSoup: find occurrences of combining acute (\u0301)
    # or precomposed acute-marked Latin letters inside the HTML string.
    s = html
    tokens = set()
    # find words around combining acute
    import re
    for m in re.finditer(r"[\w\u0300-\u036F]{2,}", s):
        w = m.group(0)
        if '\u0301' in w or any(ch in w for ch in '́άàáéíóú'):
            tokens.add(w)
    # fallback: search for explicit sequences like 'а́' as separate chars
    # return list
    return list(tokens)


def main():
    words = []
    if len(sys.argv)>1:
        words = sys.argv[1:]
    else:
        # load overrides and use keys
        with open(os.path.join(ROOT,'intonation_overrides.json'),'r',encoding='utf-8') as f:
            o = json.load(f)
        words = [k for k in o.keys() if not k.startswith('#')]
    out = {}
    for w in words:
        try:
            p = fetch_page(w)
            if not p:
                continue
            title = p.get('title')
            html = p.get('text','')
            forms = extract_accented_forms(html)
            out[w] = {'title':title,'forms':forms}
            print(w, '->', forms)
        except Exception as e:
            print('ERR',w,e)
    # save partial results
    with open(os.path.join(OUT_DIR,'wiktionary_sample.json'),'w',encoding='utf-8') as fh:
        json.dump(out,fh,ensure_ascii=False,indent=2)
    # update manifest
    mpath = os.path.join(OUT_DIR,MANIFEST)
    try:
        with open(mpath,'r',encoding='utf-8') as fh:
            man = json.load(fh)
    except Exception:
        man = {'sources':[]}
    man['sources'].append({'type':'wiktionary_sample','file':'wiktionary_sample.json','count':len(out)})
    with open(mpath,'w',encoding='utf-8') as fh:
        json.dump(man,fh,ensure_ascii=False,indent=2)

if __name__=='__main__':
    main()
