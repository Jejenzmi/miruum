import re, json, glob, os

pairs = {}  # source(id) -> {id, en}
# noise sources (image CDN params / route fragments), skip these
NOISE = {'q','auto','fit','crop','w','h','dpr','fm','max','min','format','80','60'}

def clean(s):
    return s.strip()

def add(idt, en):
    idt, en = clean(idt), clean(en)
    if not idt or not en: return
    if len(idt) < 2 or len(idt) > 160: return
    if idt.lower() in NOISE: return
    if idt.startswith('/') or en.startswith('/'): return
    if any(c in idt for c in ['$','{','}','\\n']) : return
    if any(c in en for c in ['$','{','}','\\n']): return
    if 'http' in idt.lower() or 'http' in en.lower(): return
    if re.fullmatch(r'[\d\W]+', idt): return  # purely digits/punct
    if idt not in pairs:
        pairs[idt] = {'id': idt, 'en': en}

# App: tr('id','en') and tr("id","en") — single line, allow escaped quote via non-greedy up to ', '
app_re = re.compile(r"""tr\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)""")
app_re2 = re.compile(r'''tr\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)''')
for f in glob.glob('app/lib/**/*.dart', recursive=True):
    txt = open(f, encoding='utf-8', errors='ignore').read()
    for m in app_re.finditer(txt): add(m.group(1).replace("\\'","'"), m.group(2).replace("\\'","'"))
    for m in app_re2.finditer(txt): add(m.group(1).replace('\\"','"'), m.group(2).replace('\\"','"'))

# Web: t('id','en') / t("id","en") — but only when preceded by non-identifier (avoid foo.t, .filter(t=>))
web_re = re.compile(r"""(?<![\w.])t\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)""")
web_re2 = re.compile(r'''(?<![\w.])t\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)''')
for f in glob.glob('webapp/**/*.vue', recursive=True) + glob.glob('webapp/**/*.ts', recursive=True):
    if 'node_modules' in f: continue
    txt = open(f, encoding='utf-8', errors='ignore').read()
    for m in web_re.finditer(txt): add(m.group(1).replace("\\'","'"), m.group(2).replace("\\'","'"))
    for m in web_re2.finditer(txt): add(m.group(1).replace('\\"','"'), m.group(2).replace('\\"','"'))

items = [{'source': v['id'], 'textId': v['id'], 'textEn': v['en'], 'surface': ''} for v in pairs.values()]
items.sort(key=lambda x: x['source'].lower())
json.dump(items, open('/tmp/i18n_seed.json','w'), ensure_ascii=False)
print('unique terms:', len(items))
print('--- sample ---')
for it in items[:12]: print(f"  {it['source'][:40]:42} | {it['textEn'][:40]}")
