"""Apply teachers' notes from the review page to the finished bundle (all-papers.json).

The drafts build_bundle.py read are gone, so later edits land on the bundle itself,
each asserting the text it replaces, and are appended to review-log.json.
Run: python3 apply_teacher_notes.py   (idempotent: an edit already applied is skipped)
"""
import json, re, unicodedata
N = lambda t: unicodedata.normalize('NFC', t)
B = json.load(open('all-papers.json')); LOG = json.load(open('review-log.json'))
P = {p['number']: p for p in B['papers']}
def Q(num, n): return next(q for q in P[num]['questions'] if q['n'] == n)
def note(num, n, what):
    if not any(a['paper'] == num and a['n'] == n and a['what'] == what for a in LOG['applied']):
        LOG['applied'].append({'paper': num, 'n': n, 'kind': 'teacher', 'what': what})

# Daniyal, 9 October
q = Q(3, 5)
if 'Idhaar Halqi' not in q['prompt']:
    assert q['prompt'].startswith('How many times does idhaar occur in this verse?'), q['prompt']
    q['prompt'] = q['prompt'].replace('How many times does idhaar occur', 'How many times does Idhaar Halqi occur', 1)
note(3, 5, 'Daniyal: name Idhaar Halqi in the question. The key (1: مِّنْ خَوْفٍ) is the one Idhaar Halqi.')

IKH = re.compile(r'\bIkhfaa\b(?! Haqiqi)')
for q in P[6]['questions']:
    changed = False
    new = IKH.sub('Ikhfaa Haqiqi', q['prompt']); changed |= new != q['prompt']; q['prompt'] = new
    for o in q.get('options') or []:
        new = IKH.sub('Ikhfaa Haqiqi', o['text']); changed |= new != o['text']; o['text'] = new
    if changed or any(a['paper'] == 6 and a['n'] == q['n'] and a['what'].startswith('Daniyal: say Ikhfaa') for a in LOG['applied']):
        note(6, q['n'], 'Daniyal: say Ikhfaa Haqiqi in every question.')

q = Q(7, 9)
for o in q['options']:
    o['text'] = {'Ikhfaa': 'Ikhfaa Haqiqi', 'Idhaar': 'Idhaar Halqi'}.get(o['text'], o['text'])
assert {'Ikhfaa Haqiqi', 'Idhaar Halqi'} <= {o['text'] for o in q['options']}
note(7, 9, 'Daniyal: the options say Idhaar Halqi and Ikhfaa Haqiqi.')

q = Q(17, 6)
if q['rubric'][0]['desc'] == 'When stopping at a word with Mad Ul Mutasil':
    q['rubric'][0]['desc'] = 'When stopping on a word that has Mad Ul Mutasil at the end'
note(17, 6, 'Daniyal: the mark scheme says when stopping on a word that has Madd Muttaṣil at the end.')
LOG['open'] = [o for o in LOG['open'] if not (o['paper'] == 17 and o['n'] == 6)]

json.dump(B, open('all-papers.json', 'w'), ensure_ascii=False, indent=1)
json.dump(LOG, open('review-log.json', 'w'), ensure_ascii=False, indent=1)
print('ok')
