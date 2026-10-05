"""Build the full 2026/27 bundle (37 papers) from the drafts + the final content review.

Sources: the teacher's version (new/teacher.json) for Ghunna 1-5 and Mudud 1-6;
our drafts (new/<course>.json) for the rest. The review findings
(review_notes/*.json) are applied below as explicit, asserted edits: every
edit checks the text it replaces, so a draft that moved under it fails loudly.

Out: final/all-papers.json in execution/homework_sql.ts's bundle format, plus
final/open-items.json (suggestions left for the teachers, live differences).
"""
import json, copy, os, re, unicodedata

N = lambda t: unicodedata.normalize('NFC', t) if isinstance(t, str) else t
TZ = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tanzil_by_ayah.json')))


def W(ref, i, j=None):
    """Word(s) i..j (1-based) of an ayah, from the Tanzil Uthmani text — never typed."""
    words = [w for w in TZ[ref].split() if re.search(r'[\u0621-\u064A\u0671]', w)]
    if ref.split(':')[1] == '1' and ref != '1:1' and words[:4] == TZ['1:1'].split()[:4]:
        words = words[4:]  # Tanzil prefixes the basmalah to each surah's first ayah
    return ' '.join(words[i - 1:(j or i)])

SP = os.path.dirname(os.path.abspath(__file__))
T = {(h['series'], h['ordinal']): h for h in json.load(open(f'{SP}/new/teacher.json'))['homeworks']}
O = {}
for s in ('ghunna', 'mudood', 'sifaat', 'umm', 'mabadi'):
    for h in json.load(open(f'{SP}/new/{s}.json'))['homeworks']:
        O[(s, h['ordinal'])] = h

# course -> (number of ordinal k, series, course key)
PLAN = {
    'ghunna': (lambda k: k, 'tajweed', 'ghunna', range(1, 9)),
    'sifaat': (lambda k: 8 + k, 'tajweed', 'sifaat_old', range(1, 8)),
    'mudood': (lambda k: 15 + k, 'tajweed', 'mudood', range(1, 7)),
    'mabadi': (lambda k: 100 + k, 'tfp', 'mabadi', range(1, 8)),
    'umm': (lambda k: 200 + k, 'umm_al_kitab', 'ummul_kitab', range(1, 10)),
}
LIVE = {1, 2, 9, 201}

papers = {}
for course, (num, series, ckey, ords) in PLAN.items():
    for k in ords:
        src = T.get((course, k)) if course in ('ghunna', 'mudood') and (course, k) in T else O[(course, k)]
        ours = O[(course, k)]
        papers[(course, k)] = {
            'number': num(k), 'series': series, 'course': ckey, 'ordinal': k, 'term1_week': k,
            'title': ours['title'], 'source': 'teacher' if src is not ours else 'ours',
            'questions': copy.deepcopy(src['questions']),
        }

applied, notes = [], []


def Q(course, k, n):
    for q in papers[(course, k)]['questions']:
        if q['n'] == n:
            return q
    raise KeyError((course, k, n))


def setf(course, k, n, field, old, new, why, kind='fix'):
    q = Q(course, k, n)
    cur = q.get(field)
    assert N(cur) == N(old) or cur == old, f'{course}{k} Q{n}.{field}: expected {old!r}, found {cur!r}'
    q[field] = new
    applied.append({'paper': papers[(course, k)]['number'], 'course': course, 'ordinal': k, 'n': n, 'kind': kind, 'what': why})


def opt(course, k, n, i, old, new, why, kind='fix'):
    q = Q(course, k, n)
    assert N(q['options'][i]['text']) == N(old), f'{course}{k} Q{n} opt{i}: {q["options"][i]["text"]!r}'
    q['options'][i]['text'] = new
    applied.append({'paper': papers[(course, k)]['number'], 'course': course, 'ordinal': k, 'n': n, 'kind': kind, 'what': why})


# ── Ghunna ───────────────────────────────────────────────────────────────
setf('ghunna', 1, 2, 'prompt', 'What is the the technical term of the word “Tajweed”?',
     'What is the technical definition of the word “Tajweed”?', 'Typo "the the"; asks for the technical definition, which is what the rubric marks.')
setf('ghunna', 1, 7, 'prompt', 'Which of the following examples is not deemed as a major mistake?',
     'Which of the following are NOT major mistakes? Select all that apply.', 'Two answers are right, so the prompt says to select all.')
setf('ghunna', 1, 8, 'prompt', 'True or False: Are minor mistakes in recitation deemed Haram?',
     'True or False: Minor mistakes in recitation are deemed haram.', 'True/false needs a statement, not a question. Key (False) unchanged.')
opt('ghunna', 2, 4, 2, 'اُمَّمٌ', [w for w in W('6:38', 1, 40).split() if w.startswith('ثُمَّ') or N(w).startswith(N('ثُمَّ'))][0],
    'اُمَّمٌ is not a word in the Qur\'an (the word is أُمَمٌ, no shaddah, no ghunna) and was keyed correct. Replaced with ثُمَّ (6:38).', 'error')
# 89:28 مَّرْضِيَّةً: meem with shaddah, so ghunna, as the video teaches; the markup files it under idghaam.
q = Q('ghunna', 2, 8)
hit = [w for a in q['tap']['ayahs'] if a['ref'] == '89:28' for w in a['words'] if N(w['t']).startswith(N('مَّرْضِيَّة'))]
assert len(hit) == 1 and hit[0]['key'] is False
hit[0]['key'] = True
q['tap']['instances'] = q['tap'].get('instances', 10) + 1
applied.append({'paper': 2, 'course': 'ghunna', 'ordinal': 2, 'n': 8, 'kind': 'error',
                'what': 'Key missed مَّرْضِيَّةً (89:28): a meem with shaddah, so ghunna. Its shaddah comes from idghaam, but a teacher confirmed it should count. Now in the key (11 to find).'})
setf('ghunna', 2, 5, 'format', 'select_all', 'mcq', 'Only one recitation (B) is right and the prompt says "select the one": now single-answer.')
setf('ghunna', 3, 5, 'format', 'count', 'mcq', 'A "how many" with the verse typed into the prompt: now a plain multiple choice (same prompt, same options).')
setf('ghunna', 3, 7, 'prompt', 'Select the verse which contains an example of idhaar halqy.',
     'Select the verses which contain an example of Idhaar Halqy. Select all that apply.', 'Two verses are right.')
opt('ghunna', 3, 4, 2, 'اَنذَرَ', Q('ghunna', 2, 4)['options'][3]['text'], 'Missing hamza: أَنذَرَ.')
setf('ghunna', 5, 1, 'format', 'select_all', 'mcq', 'Only one meaning (To flip) is right: now single-answer.')
opt('ghunna', 5, 4, 2, 'نَاصِيَةٍ كَٰذِبَةٍ خَاطِئَةٍۢ', 'نَاصِيَةٍ كَٰذِبَةٍ خَاطِئَةٍۢ ١٦', 'Ayah number added, as on the other options.')
setf('ghunna', 5, 6, 'prompt',
     "Find 3 instances of Iqlab in the last juz (Juz' Amma) and record it. Send the recording to your class WhatsApp group.",
     "Find 3 instances of Iqlaab in the last juz (Juz' Amma) and record yourself reciting them. Send the recording to your class WhatsApp group.",
     'Spelling (Iqlaab) and "them" for the three instances.')
# Ghunna 7 Q3 (ours): وَجَنَّٰتٍ also carries a held ghunna; 88:4 is a clean tanween-before-ح idhaar. Key (Idhaar) unchanged.
q = Q('ghunna', 7, 3)
assert q['clip']['surah'] == 78 and [o['text'] for o in q['options'] if o['correct']] == ['Idhaar']
q['clip'] = {'surah': 88, 'ayah': 4, 'positions': [2, 3], 'text': W('88:4', 2, 3), 'start_ms': 25560, 'end_ms': 29018,
             'audio_url': 'https://audio-cdn.tarteel.ai/quran/surah/husary/murattal/mp3/088.mp3',
             'reciter': 'Mahmoud Khalil Al-Husary (murattal), QUL resource 316'}
q['prompt'] = 'Listen to this recitation of Al-Ghāshiyah 88:4. Which rule of noon sakin and tanween did you hear?'
applied.append({'paper': 7, 'course': 'ghunna', 'ordinal': 7, 'n': 3, 'kind': 'suggest',
                'what': 'Clip moved from 78:16 (وَجَنَّٰتٍ has its own held ghunna, which could mislead) to 88:4 نَارًا حَامِيَةً, a clean Idhaar.'})

# ── Mudud (teacher's version) ────────────────────────────────────────────
setf('mudood', 3, 10, 'prompt',
     'Read through Surah Najm and highlight the examples of Madd Munfasil if you did not stop. (Ensure you select the cause and result of Madd Ul Munfasil to get the mark.)',
     'Read through Surah Najm, stopping at the end of every ayah, and highlight the examples of Madd Munfasil. (Ensure you select the cause and result of Madd Ul Munfasil to get the mark.)',
     'The key counts only Madd Munfasil inside an ayah; "if you did not stop" would make 13 more across ayah ends right.', 'error')
setf('mudood', 5, 4, 'rubric', [{'desc': '(no model answer given in the doc or last year)', 'marks': 3}],
     [{'desc': 'First correct example IN ARABIC of Madd Lazim (a letter of madd followed by an original sukoon or shaddah, in a word or in an opening letter), e.g. ' + ', '.join([W('1:7', 9), W('69:1', 1), [w for w in W('10:51', 1, 20).split() if 'لْـ' in w][0], W('2:1', 1)]), 'marks': 1},
      {'desc': 'Second correct, different example of Madd Lazim', 'marks': 1},
      {'desc': 'Third correct, different example of Madd Lazim', 'marks': 1}],
     'The rubric was a placeholder, so nothing could be marked. Now one mark per correct example.', 'error')
setf('mudood', 6, 6, 'prompt', 'Describe how to read this ayah.\nذَٰلِكَ ٱلْكِتَـٰبُ لَا رَيْبَ ۛ فِيهِ ۛ هُدًى لِّلْمُتَّقِينَ',
     'Record yourself here reciting this ayah, showing how you deal with the two sets of three dots (ۛ).\nذَٰلِكَ ٱلْكِتَـٰبُ لَا رَيْبَ ۛ فِيهِ ۛ هُدًى لِّلْمُتَّقِينَ',
     'The teacher asked for a recording; the prompt said "Describe". A recording in the app carries no marks, so this paper is out of 16, not 18.', 'error')
Q('mudood', 6, 6)['points'] = 0
Q('mudood', 6, 6).pop('tap', None)
q = Q('mudood', 6, 5)
full = {'Permissible to continue but stopping is …': 'Permissible to continue but stopping is preferred',
        'Impermissible to stop and continue fro…': 'Impermissible to stop and continue from it',
        'Permissible to stop but continuing is pr…': 'Permissible to stop but continuing is preferred'}
for p in q['pairs']:
    p['right'] = full.get(p['right'], p['right'])
assert not any('…' in p['right'] for p in q['pairs'])
applied.append({'paper': 21, 'course': 'mudood', 'ordinal': 6, 'n': 5, 'kind': 'fix', 'what': 'Three answers were cut off ("…") from a cropped screenshot; full wording from last year\'s form.'})
opt('mudood', 2, 3, 0, 'قسر', 'قصر', 'Spelling: Qaṣr is قصر (the teacher\'s own note asked for this).')
opt('mudood', 4, 3, 0, 'قسر', 'قصر', 'Spelling: Qaṣr is قصر. This one is a correct answer students tick.')
opt('mudood', 5, 5, 0, 'قسر', 'قصر', 'Spelling: Qaṣr is قصر.')
setf('mudood', 5, 10, 'prompt', 'Select the correct answer.', 'Match each example to its type of Madd Lazim.', 'Prompt left over from the grid.')

# ── Sifaat (ours) ────────────────────────────────────────────────────────
setf('sifaat', 1, 2, 'prompt', 'What is meant by الإستعلاء literally?', 'What is meant by الاستعلاء literally?',
     'Spelling: الاستعلاء starts with a hamzatul wasl.')
q = Q('sifaat', 5, 1)
assert q['pairs'][1]['left'] == 'Istiʿlāʾ (الإستعلاء)'
q['pairs'][1]['left'] = 'Istiʿlāʾ (الاستعلاء)'
applied.append({'paper': 13, 'course': 'sifaat', 'ordinal': 5, 'n': 1, 'kind': 'fix', 'what': 'Spelling: الاستعلاء.'})
opt('sifaat', 3, 8, 3, 'Continuing at وَاسْتَغْفِـرْه', 'Continuing at ' + [w for w in W('110:3', 1, 20).split() if 'غْفِرْه' in w][0], 'Word as in the mushaf (110:3).')
for n, i, old, new in [(5, 0, 'When there is a letter of qalala which is sakin and is in the middle of a word',
                        'When a Qalqala letter has its own (original) sukoon and you are not stopping on it, e.g. in the middle of a word'),
                       (5, 1, 'When there is a letter of qalala which is sakin and is in the end of an word where you are stopping',
                        'When there is a Qalqala letter which is sakin at the end of a word where you are stopping'),
                       (6, 0, 'When there is a letter of qalala which is sakin and is in the middle of a word',
                        'When a Qalqala letter has its own (original) sukoon and you are not stopping on it, e.g. in the middle of a word'),
                       (6, 1, 'When there is a letter of qalala which is sakin and is in the end of an word where you are stopping',
                        'When there is a Qalqala letter which is sakin at the end of a word where you are stopping')]:
    opt('sifaat', 4, n, i, old, new, 'Typos (qalala, "an word"); the subtle level also covers an original sukoon at a word end you read through (يَلِدْ in Q4).')
setf('sifaat', 4, 8, 'prompt', 'Which of these have the higher level of Qalqala?',
     'Stopping at the end of each ayah, which of these have the higher level of Qalqala? Select all that apply.',
     'The higher level only exists when you stop; the key assumes stopping at each ayah end.', 'suggest')
ALPHA = 'ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي ء'.split()
for n in (2,):
    q = Q('sifaat', 4, n)
    assert sorted(o['text'] for o in q['options']) == sorted(ALPHA)
    q['options'].sort(key=lambda o: ALPHA.index(o['text']))
applied.append({'paper': 12, 'course': 'sifaat', 'ordinal': 4, 'n': 2, 'kind': 'suggest', 'what': 'Letters put in alphabetical order so they are quicker to scan. Key unchanged.'})
setf('sifaat', 7, 2, 'prompt', 'When does it occur?', 'In the rule taught in this lesson, where do the two sukoons meet?',
     'Two sukoons also meet inside one word (madd lāzim); the prompt now says it means this lesson\'s rule.', 'suggest')
setf('sifaat', 2, 5, 'prompt', 'Which of these examples do NOT contain a ل that is recited heavily?',
     'Which of these examples have NO heavy ل in them? Select all that apply.', 'Easier to read than a "do NOT" select-all.', 'suggest')
q = Q('sifaat', 3, 5)
assert q['rubric'][2]['desc'] == 'When stopping, a sakin ي before it makes it light'
q['rubric'][2]['desc'] = 'When stopping and the letter before is sakin: a sakin ي makes it light; for any other sakin letter, look one letter further back (e.g. وَٱلْفَجْرِ heavy)'
applied.append({'paper': 11, 'course': 'sifaat', 'ordinal': 3, 'n': 5, 'kind': 'suggest', 'what': 'Rubric covers looking one letter further back past a sakin letter, the case Q9 tests.'})

# ── Umm al-Kitab (ours) ──────────────────────────────────────────────────
q = Q('umm', 9, 8)
old = 'Final task: listen to this recitation of the whole of Surah Al-Fātiḥah, then record yourself here reciting it slowly and carefully, with everything from this series in mind. Then listen back to the recording you made in week 1 (Ghunna 1) and compare the two: notice how far you\'ve come.'
setf('umm', 9, 8, 'prompt', old,
     'Final task: listen to this recitation of the whole of Surah Al-Fātiḥah, then record yourself here reciting it slowly and carefully, with everything from this series in mind.',
     'Pointed students at a week-1 recording that no paper asks for; the compare step is dropped.', 'error')
q = Q('umm', 9, 7)
assert q['clip']['start_ms'] == 42240
q['clip']['start_ms'] = 40920
applied.append({'paper': 209, 'course': 'umm', 'ordinal': 9, 'n': 7, 'kind': 'fix', 'what': 'Clip started 0.7 s late, cutting off the ض and part of the six-count madd.'})
opt('umm', 9, 5, 0, 'The heavy ض after it is allowed to influence it, but the lām must stay light',
    'People let the heavy ض after it make the lām heavy, but the lām must stay light', '"Allowed to" read as "permitted to", the opposite of the point.')
setf('umm', 9, 2, 'prompt', 'Tap every heavy letter in this verse. Leave out the ر: it is heavy in one word and light in another, so it is not counted here.',
     'Tap every one of the always-heavy letters in this verse. Leave out the ر (it is heavy in one word and light in another) and the alif, which only follows the letter before it.',
     'The آ after ض is pronounced heavy but is not keyed; the prompt now says to leave it out.', 'suggest')
opt('umm', 9, 6, 0, 'Using the tongue to fill the mouth, so the sound stretches along it',
    'The sound stretches along the side of the tongue, from the back towards the front', 'Standard definition of istiṭālah ("filling the mouth" describes heaviness).', 'suggest')
setf('umm', 4, 6, 'prompt', 'Why must the ع in ٱلْعَـٰلَمِينَ come clearly from the throat? What goes wrong if it doesn\'t?',
     'Why must the ع in ٱلْعَـٰلَمِينَ come clearly from the middle of the throat? What goes wrong if it doesn\'t?',
     'The hamzah is a throat letter too; "middle of the throat" is the ع.', 'suggest')
setf('umm', 1, 7, 'prompt', '"Whoever does not recite Al-Fātiḥah in his prayer, his prayer is…"',
     'According to the hadith in the video, whoever does not recite Al-Fātiḥah in his prayer, his prayer is…',
     'Ties the key to the hadith (two distractors are close to a real fiqh position).', 'suggest')

# ── Mabadi (ours) ────────────────────────────────────────────────────────
q = Q('mabadi', 1, 2)
assert q['rubric'][0]['desc'].startswith('To make the essentials')
q['rubric'][0]['desc'] = 'To collect and organise the information of a science in a digestible, easy-to-understand form so students can learn and retain (memorise) it'
applied.append({'paper': 101, 'course': 'mabadi', 'ordinal': 1, 'n': 2, 'kind': 'fix', 'what': 'Rubric now follows the video (collect and organise a science so it is easy to learn and retain).'})
q = Q('mabadi', 1, 3)
assert q['pairs'][3]['left'].startswith('شَرْح')
q['pairs'] = [{'left': 'مَتْن (matn)', 'right': 'To strengthen and solidify (the knowledge)'},
              {'left': 'نَظْم (nazm)', 'right': 'To organise and collect (the information)'},
              {'left': 'نَاظِم (naazim)', 'right': 'The one who authors a nazm (the collector / organiser)'},
              {'left': 'مُتُون (mutoon)', 'right': 'The plural of matn'}]
q['points'] = 2
applied.append({'paper': 101, 'course': 'mabadi', 'ordinal': 1, 'n': 3, 'kind': 'fix',
                'what': 'Meanings now as the video teaches them (matn: to strengthen; nazm: to organise). Dropped sharh/shaarih, which the series never mentions. 4 pairs, 2 marks.'})
q = Q('mabadi', 2, 5)
assert q['rubric'][0]['desc'].startswith('Tajweed')
q['rubric'] = [{'desc': "It is not a Tajweed text: it is a general text whose ten principles apply to any science (in this course they are applied to Tajweed). Accept 'any science' / 'general'.", 'marks': 1}]
applied.append({'paper': 102, 'course': 'mabadi', 'ordinal': 2, 'n': 5, 'kind': 'error', 'what': 'Key said "Tajweed"; the video says the Ten Principles is a general text for any science.'})
q = Q('mabadi', 2, 2)
q['rubric'] = [{'desc': "Names definition / defining limits (al-hadd), structured contents / subject matter (al-mawdoo') and fruits (ath-thamarah)", 'marks': 1},
               {'desc': "Names relationship to other sciences (an-nisbah), virtues (al-fadl) and original founder (al-waadi')", 'marks': 1},
               {'desc': "Names the name (al-ism), sources (al-istimdaad), status according to the Lawgiver / ruling (hukm ash-shaari') and issues (al-masaa'il)", 'marks': 1}]
applied.append({'paper': 102, 'course': 'mabadi', 'ordinal': 2, 'n': 2, 'kind': 'suggest', 'what': "Rubric accepts the course's English names for the principles too."})
setf('mabadi', 3, 5, 'prompt', 'What are the structured contents (subject matter) of the science of Tajweed?',
     'What are the structured contents (the parts) of the science of Tajweed?', 'Rubric and prompt now follow the video\'s four contents.', 'error')
Q('mabadi', 3, 5)['rubric'] = [
    {'desc': 'Names the articulation points (makhaarij) and the characteristics of the letters (sifaat)', 'marks': 1},
    {'desc': "Names the Tajweed rules (e.g. ikhfaa, idghaam, iqlaab) and stopping/starting (waqf and ibtidaa') with its emphasis", 'marks': 1}]
opt('mabadi', 3, 4, 2, "Heavy or light pronunciation (tafkheem/tarqeeq) that depends on the vowel, e.g. of raa'",
    'The vowel on the letter (fathah, dammah, kasrah or sukoon), which changes from word to word', "The video's own example of a due.", 'suggest')
setf('mabadi', 3, 2, 'prompt', 'What is the technical definition of Tajweed?', 'What is the practical (technical) definition of Tajweed?',
     "The video calls it the 'practical' definition.", 'suggest')
q = Q('mabadi', 5, 3)
assert q['rubric'][1]['desc'].startswith('It is a clear mistake')
q['rubric'][1]['desc'] = "So the understanding/tafseer of the ayah is affected (e.g. qalb 'heart' becomes kalb 'dog'); also accept: it is a clear mistake (lahn jaliyy) and sinful"
applied.append({'paper': 105, 'course': 'mabadi', 'ordinal': 5, 'n': 3, 'kind': 'fix', 'what': "Second mark now follows this lesson (tafseer affected, qalb/kalb)."})
q = Q('mabadi', 5, 5)
assert q['items'][3] == "Imam 'Aasim"
q['items'] = ['Allah SWT', 'Jibreel (AS)', 'The Prophet (ﷺ)', 'The Companions', "The Companions' students", 'Your teacher']
applied.append({'paper': 105, 'course': 'mabadi', 'ordinal': 5, 'n': 5, 'kind': 'suggest', 'what': "Links now the ones episode 6 teaches (Companions, their students), not 'Aasim and Hafs, which the series never covers."})
opt('mabadi', 6, 6, 2, 'Students can get a fancy certificate to show they can teach Qur\'an',
    'It gives students a certificate to hang on the wall, whatever their level of recitation', "Only 'fancy' made the old wording wrong.", 'suggest')
q = Q('mabadi', 7, 2)
q['rubric'][0]['desc'] = "Reciting the letters with Tajweed and knowing where to stop (the definition from 'Ali RA); also accept: reciting slowly and in a measured way with Tajweed"
applied.append({'paper': 107, 'course': 'mabadi', 'ordinal': 7, 'n': 2, 'kind': 'suggest', 'what': "Rubric leads with the course's own definition of tarteel ('Ali RA)."})
for i, new in enumerate(["Noon saakinah or tanween before baa' is changed into a meem with ghunnah (Iqlaab)",
                         'Noon saakinah or tanween before a throat letter is pronounced clearly (Idhaar Halqi)',
                         'Madd Laazim is lengthened 6 counts']):
    Q('mabadi', 7, 5)['options'][i]['text'] = new
applied.append({'paper': 107, 'course': 'mabadi', 'ordinal': 7, 'n': 5, 'kind': 'suggest', 'what': 'Correct options are now specific rulings, as the video defines masaa\'il.'})
q = Q('mabadi', 7, 6)
assert q['items'][1] == "Subject matter (al-mawdoo')"
q['items'] = ['Definition (al-hadd)', "Structured contents (al-mawdoo')", 'Fruits (ath-thamarah)', "Original founder (al-waadi')",
              "Ruling of the Lawgiver (hukm ash-shaari')", "Issues (al-masaa'il)"]
applied.append({'paper': 107, 'course': 'mabadi', 'ordinal': 7, 'n': 6, 'kind': 'suggest', 'what': 'Items named as the course teaches them.'})

# ── left for the teachers ─────────────────────────────────────────────────
open_items = [
    {'paper': 2, 'n': 7, 'who': 'teacher', 'what': 'Double negative (the answer is False). Could become a positive claim with True as the answer; it is live, so only if past answers can stand.'},
    {'paper': 18, 'n': 10, 'who': 'teacher', 'what': 'This tap covers the whole of Surah An-Najm (422 words, three mushaf pages). Fine in the app, but long.'},
    {'paper': 20, 'n': 10, 'who': 'teacher', 'what': 'طسٓمٓ has both kinds of Harfi madd (sīn heavy, mīm light). Consider labelling "the lām of الٓر" and "the sīn of طسٓمٓ".'},
    {'paper': 21, 'n': 3, 'who': 'teacher', 'what': 'The prompt asks only about stopping in the wrong place, but the rubric accepts letter and harakah examples too. One of them should change.'},
    {'paper': 17, 'n': 6, 'who': 'teacher', 'what': 'Model answer could say ṭūl applies only when the hamzah is the last letter of the word you stop on.'},
    {'paper': 16, 'n': 3, 'who': 'teacher', 'what': 'Rubric lists only نُوحِيهَا; widen it to any word with all three letters of madd.'},
    {'paper': 21, 'n': 6, 'who': 'teacher', 'what': 'Was worth 2 marks; a recording carries no marks in the app, so the paper is now out of 16. If the marks matter, add a 2-mark written "Describe how to read this ayah" before it.'},
    {'paper': 102, 'n': 6, 'who': 'teacher', 'what': 'Recording of the Ten Principles lines: the Arabic lines are not shown. Add them from the teacher\'s slide (not typed from memory), or drop the task.'},
    {'paper': 106, 'n': 3, 'who': 'teacher', 'what': 'The captions drop the founder\'s name. Lead the rubric with the name(s) the video gives.'},
    {'paper': 101, 'n': 3, 'who': 'teacher', 'what': 'The author of a matn (māṭin?) was left out because the captions garble the word. Add it back as a fifth pair if confirmed.'},
]

out = []
for (course, k), p in sorted(papers.items(), key=lambda x: x[1]['number']):
    for q in p['questions']:
        q['prompt'] = q['prompt'].replace('the the ', 'the ')
    p['live'] = p['number'] in LIVE
    out.append(p)
os.makedirs(f'{SP}/final', exist_ok=True)
json.dump({'papers': out}, open(f'{SP}/final/all-papers.json', 'w'), ensure_ascii=False, indent=1)
json.dump({'applied': applied, 'open': open_items}, open(f'{SP}/final/review-log.json', 'w'), ensure_ascii=False, indent=1)
from collections import Counter
print(len(out), 'papers', sum(len(p['questions']) for p in out), 'questions;', len(applied), 'edits', dict(Counter(a['kind'] for a in applied)))
print('formats', dict(Counter(q['format'] for p in out for q in p['questions'])))
