"""Build a rule-hunt key for one surah (Qāʿidah homework, Masjid Al-Aqsa).

    python3 -I build_key.py <dir> <out.json>

<dir> holds the tajweed_tap_question --json output for qalqalah, ghunnah,
ikhfa, iqlab, idghaam_ghunnah and ikhfa_shafawi, plus qpc.json (quran.com
verses with word_fields=text_qpc_hafs) and words.json (quran_words rows:
code_v1, page_number, line_number, is_end).

The owner's decisions (see the ashshams-rule-hunt memory), applied here so a
regenerated key never undoes them:
  - Rules: ghunnah, lam_shamsi, lam_qamari, hams, qalqalah, tanwin only.
  - Ghunnah is asked for only on a nūn or mīm with a shaddah; ikhfāʼ, iqlāb and
    idghām letters are accepted, never asked for (not a voweled م or an alif,
    which the source keys by mistake).
  - Lām: the ٱ, the ل or the letter after it finds it, once. A single written
    lām with a shaddah (ٱلَّيۡل, ٱلَّذِينَ) is not counted, and nor is the Name of Allah.
  - Hams: only ت and ة are asked for; the other hams letters are accepted.
  - Tanwīn: every tanwīn is one thing to find.
Output: letters in the QPC Hafs text (the King Fahd font's own), checked
letter for letter against the source, and the page's glyphs and lines.
"""
import json, os, sys, unicodedata as u

D, OUT = sys.argv[1], sys.argv[2]
base = json.load(open(os.path.join(D, 'qalqalah.json')))
ayahs = [[[l['t'] for l in w['letters']] for w in a['words']] for a in base['ayahs']]

def keyed(rule):
    d = json.load(open(os.path.join(D, rule + '.json')))
    return [f"{ai}-{wi}-{li}" for ai, a in enumerate(d['ayahs']) for wi, w in enumerate(a['words'])
            for li, l in enumerate(w['letters']) if l['key']]

def letter(i):
    a, w, l = map(int, i.split('-')); return ayahs[a][w][l]

inst = []
for k in keyed('ghunnah'): inst.append({'r': 'ghunnah', 'l': [k]})
for k in keyed('qalqalah'): inst.append({'r': 'qalqalah', 'l': [k]})
HAMS = set('فحثهشخصسكتة'); TANWIN = set('ًࣰٌࣱٍࣲ')
hams = []
for ai, a in enumerate(ayahs):
    for wi, w in enumerate(a):
        for li, t in enumerate(w):
            id_ = f"{ai}-{wi}-{li}"
            if t[0] in HAMS: hams.append(id_)
            if TANWIN & set(t): inst.append({'r': 'tanwin', 'l': [id_]})
            if t == 'ٱ' and li + 1 < len(w) and w[li + 1][0] == 'ل':
                lam = w[li + 1]
                if li + 2 < len(w) and w[li + 2][0] == 'ل' and 'ْ' not in lam: continue   # the Name of Allah
                ids = [id_, f"{ai}-{wi}-{li+1}", f"{ai}-{wi}-{li+2}"]
                if 'ْ' in lam: inst.append({'r': 'lam_qamari', 'l': ids})
                elif 'ّ' in lam: continue            # one written lām with a shaddah: not counted
                else: inst.append({'r': 'lam_shamsi', 'l': ids})
taa = [i for i in hams if letter(i)[0] in 'تة']
for i in taa: inst.append({'r': 'hams', 'l': [i]})
acc = set()
for r in ['ikhfa', 'iqlab', 'idghaam_ghunnah', 'ikhfa_shafawi']:
    acc.update(keyed(r))
acc = sorted(i for i in acc if not (letter(i)[0] == 'ا' or (letter(i)[0] == 'م' and not TANWIN & set(letter(i)) and 'ّ' not in letter(i) and 'ْ' not in letter(i))))

# QPC Hafs letters, the same letters as the source
q = json.load(open(os.path.join(D, 'qpc.json')))
mark = lambda c: u.category(c) in ('Mn', 'Me') or c in 'ـۥۦ'
def clusters(w):
    """Letters with their marks. A tatweel is dropped (a stretch, كـَلَّا) unless it
    is the seat of a hamza (ٱلۡأَفۡـِٔدَةِ), where it is a letter of its own."""
    out = []
    for i, c in enumerate(w):
        if c == 'ـ':
            j = i + 1
            while j < len(w) and mark(w[j]) and w[j] != 'ـ': j += 1
            if any(x in 'ٕٔ' for x in w[i + 1:j]): out.append(c)
            continue
        if mark(c) and out: out[-1] += c
        else: out.append(c)
    return out
# The two texts spell the same letter two ways in places: ى in one, ي in the other (فِيٓ).
bare = lambda s: ''.join(c for c in s if not mark(c) and not c.isspace()).replace('\u0649', '\u064a')
qpc = []
for v, ay in zip(q['verses'], ayahs):
    ws = [w['text_qpc_hafs'] for w in v['words'] if w['char_type_name'] == 'word']
    assert len(ws) == len(ay), v['verse_key']
    row = []
    for w, letters in zip(ws, ay):
        cl = clusters(w)
        # A pause mark (كَلَّا ۖ) is its own "letter" in the source but rides on
        # the alif in QPC: give it back its own slot so the two stay in step.
        for k, t in enumerate(letters):
            if k > 0 and len(cl) < len(letters) and t.strip() and all(u.category(c) in ('Mn', 'Me') for c in t.strip()):
                marks = t.strip()
                cl[k - 1] = cl[k - 1].replace(marks, '')
                cl.insert(k, marks)
        assert len(cl) == len(letters) and all(bare(a) == bare(b) for a, b in zip(cl, letters)), (w, letters)
        row.append(cl)
    qpc.append(row)

# the printed page
items, wi = [], {}
for r in json.load(open(os.path.join(D, 'words.json'))):
    a = r['ayah_number'] - 1
    if r['is_end']:
        items.append({'t': 'end', 'a': a, 'g': r['code_v1'], 'ln': r['line_number']})
    else:
        w = wi.get(a, 0); wi[a] = w + 1
        items.append({'t': 'w', 'a': a, 'w': w, 'g': r['code_v1'], 'ln': r['line_number'], 'l': qpc[a][w]})
pages = sorted({r['page_number'] for r in json.load(open(os.path.join(D, 'words.json')))})

from collections import Counter
print(Counter(i['r'] for i in inst), 'total', len(inst), 'accepted ghunnah', len(acc), 'pages', pages, file=sys.stderr)
json.dump({'ayahs': ayahs, 'qpc': qpc, 'items': items, 'pages': pages, 'inst': inst,
           'accept': {'ghunnah': acc, 'hams': sorted(set(hams) - set(taa))}},
          open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
