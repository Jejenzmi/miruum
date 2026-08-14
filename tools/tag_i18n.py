import re, json, glob

sources = [it['source'] for it in json.load(open('/tmp/i18n_seed.json'))]

def blob(globs):
    out=[]
    for g in globs:
        for f in glob.glob(g, recursive=True):
            if 'node_modules' in f: continue
            try: out.append(open(f,encoding='utf-8',errors='ignore').read())
            except: pass
    return "\n".join(out)

SURF = [
    ("Aplikasi",    blob(['app/lib/**/*.dart'])),
    ("Web Publik",  blob(['webapp/**/*.vue','webapp/**/*.ts','webapp/**/*.js'])),
    ("Back Office", blob(['web/views/admin/**/*.ejs'])),
    ("Extranet",    blob(['web/views/extranet/**/*.ejs'])),
    ("PMS",         blob(['web/views/pms/**/*.ejs'])),
    ("Corporate",   blob(['web/views/corporate/**/*.ejs'])),
    ("Portal",      blob(['web/views/partials/**/*.ejs'])),
]

def present(p, text):
    try:
        return re.search(r'(?<!\w)' + re.escape(p) + r'(?!\w)', text) is not None
    except re.error:
        return p in text

tags=[]
counts={}
for s in sources:
    found=[label for (label,text) in SURF if present(s, text)]
    # collapse: if only in partials, keep "Portal"; else drop "Portal" (already implied)
    if len(found)>1 and "Portal" in found: found=[x for x in found if x!="Portal"]
    if not found: found=["Aplikasi"]  # safety (came from app/web extraction)
    label=", ".join(found)
    tags.append({"source": s, "surface": label})
    counts[label]=counts.get(label,0)+1

json.dump(tags, open('/tmp/i18n_tags.json','w'), ensure_ascii=False)
print("tagged:", len(tags))
print("top surface combos:")
for k,v in sorted(counts.items(), key=lambda x:-x[1])[:12]:
    print(f"  {v:4}  {k}")
