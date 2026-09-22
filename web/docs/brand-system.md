# BSMS Tajweed — brand system

The single reference for colour, typography and the devices that make the
programme recognisable. Every value here was either sampled from a published
Instagram post or measured for contrast; none of it is taste dressed up as a
rule.

Rendered version, with live specimens:
<https://claude.ai/artifact/EA1kPdFGq6fctkcHBo6Qqg>

The tokens below are **already in `src/app/globals.css`**. This file explains
them; the CSS enforces them. If the two ever disagree, the CSS is right and
this file is stale — fix it.

---

## 1. Colour

Three colours. One dominates, one supports, one accents, roughly 60 / 30 / 10.
Which plays which role swaps between light and dark — that swap *is* the
system, not an exception to it.

| Role | Name | Hex | Light mode | Dark mode |
| --- | --- | --- | --- | --- |
| Primary | Navy | `#00004D` | ink | ground |
| Secondary | Lavender | `#E5E5FF` | ground | ink |
| Tertiary | Sage | `#BECE99` | accent | accent |

There is no fourth colour. An early draft of this document listed a sand
`#DBD6CA`; that was a sampling error — anti-aliased blend pixels from a narrow
crop of the "NEW SERIES" strip, whose letterforms are actually near-white.

### Ramps

Built in Oklab, so the steps are perceptually even rather than bunching up in
the dark end the way an HSL ramp does. Each brand colour is a real step in its
own ramp, not a near-match beside one.

```
navy      50 #daf7ff  100 #b9daff  200 #9abdff  300 #7da1ec  400 #6186d3
          500 #476bba 600 #325299  700 #1e397a  800 #0c225b  900 #00004d ←
          950 #000020

lavender  50 #f5f5ff  100 #e5e5ff ←  200 #c8c8dc  300 #aaaabf  400 #8e8ea4
          500 #727289 600 #58586d  700 #403f52  800 #282838  900 #13131f
          950 #030309

sage      50 #f0fdd7  100 #dbeac0  200 #c7d7aa  250 #bece99 ←  300 #b2c58c
          400 #94a573
          500 #768752 600 #5a6a36  700 #404d1f  800 #273207  900 #111a00
          950 #020500
```

### Two laws that cannot be broken

Both fall out of contrast maths, so they hold on every surface.

**1. Sage and lavender never touch as text and ground — 1.51:1.**
They sit at almost the same brightness, so sage type on lavender (or lavender
type on sage) is illegible at any size. Put navy between them, or give the sage
shape a shadow, a texture or a navy edge. The sticky notes in the posts work
for exactly that reason: the tape and the drop shadow do the separating that
colour cannot.

**2. A sage fill keeps navy type in both modes — 11.27:1.**
No single colour can carry navy text in one mode and lavender text in the
other: navy text needs the fill bright (luminance ≥ 0.199), lavender text needs
it dark (≤ 0.139), and those windows do not overlap at any hue. So the accent
does not flip. A sage chip is a light island on a dark page, the way a road
sign does not change colour at night. One value, 10.17:1 everywhere.

### Which step to reach for

| Job | Token | Ratio |
| --- | --- | --- |
| Sage as text, light mode | sage-700 `#404D1F` | 7.39:1 |
| Sage as text, dark mode | sage `#BECE99` | 11.27:1 |
| Muted text, light mode | lavender-600 `#58586D` | 5.60:1 |
| Muted text, dark mode | lavender-300 `#AAAABF` | 8.32:1 |
| Hairline border, light | lavender-200 `#C8C8DC` | 1.33:1 |
| Hairline border, dark | navy-700 `#1E397A` | 1.74:1 |

The two border rows are meant to be low. A hairline at 4.5:1 stops being a
hairline and becomes a frame around everything. Only text and interactive
elements need to clear 4.5:1.

### The sage measured off the posts

`#BECE99` is sampled from the published posts themselves (they measure
`#BECC99` once Instagram has compressed them) and is what the landing page's
sticky notes always used. The ramp's `#B2C58C` was the value in the tokens
until September 2026: half a step darker and greyer, enough that a chip in
the app never quite matched a highlight in a post. Navy on it is 11.27:1,
better than the value it replaced.

### The lavender ground is lavender-100

`#E5E5FF`, the ramp's own step and within a hair of the posts' ground
(`#E1E1F5`). The app's light mode ran on `#EDEDFC` until September 2026,
which belonged to no ramp and read colder than the advertising. Hairlines
went the same way: `#C8C8DC`, not `#D8D8F0`.

### Semantic colour is not brand colour

Green for a pass mark and red for an overdue homework are information. They
live in the product only and never appear on social. Keep them out of the
accent's hue.

---

## 2. Typography

### Helvetica Neue is the brand face, everywhere

Social, print and product. Regular 400 and Bold 700 are the only weights in
use. The house headline treatment is two weights across a line break: regular
above, bold below.

```css
--font-sans: "Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif;
```

It is not a webfont and does not need to be. On the iPhones and Macs most of
the cohort carry, this resolves to the real face with nothing to download;
everywhere else Arial substitutes at near-identical metrics, so line breaks
hold. The app previously ran Archivo; it moved to this stack in September 2026.

> **Do not delete the Archivo import from `layout.tsx`.** It is no longer the
> body face, but `--font-mono` still names it as a fallback because Geist Mono
> carries no Latin Extended — no ā, ū, ṣ or ṭ — and the uppercase labels are
> full of them (`FĀṬIR 35:33`, `ṢIFĀT`, `MUDŪD`). Dropping it puts those glyphs
> in whatever the browser finds, mid-label.

### Fraunces — the display face, and only that

The landing page's headlines, where it is paired against Helvetica for
everything else. Weight 300, tracking -0.02em, `opsz` on the variable axis so
a 58px headline and a 22px card title are not the same drawing scaled.

```css
--font-display: var(--font-fraunces), Georgia, "Times New Roman", serif;
```

**It is not the app's heading face.** Page titles were set in it for a few
hours on 2026-09-22 and put straight back: at a title's size the serif reads
as a different product rather than the same one, and the posts set their own
headlines in Helvetica two-weight regardless. Helvetica carries the interface;
the serif is character, added one phrase at a time where it earns its place,
never as the rule.

### Times New Roman MT Condensed — the note face

Sticky notes and nothing else. A condensed serif against a grotesque is what
makes a note read as a pinned object rather than more page.

```css
--font-note: "Times New Roman MT Condensed", "Times New Roman", Times, serif;
```

Monotype licence, so it lives in the design files, not on the web. The fallback
is plain Times New Roman — same family, just not condensed, and on every
machine already. If a note ever needs to be genuinely condensed on a web page,
set it as an image or SVG rather than reaching for a look-alike.

### Scale

| Role | Size | Weight | Notes |
| --- | --- | --- | --- |
| Display | `clamp(2.75rem, 7vw, 4.25rem)` | 700 | `-0.021em`, line-height 0.98 |
| H2 | 2rem | 700 | line-height 1.08 |
| H3 | 1.1875rem | 700 | |
| Body | 1rem | 400 | line-height 1.6 |
| Small | 0.875rem | 400 | line-height 1.55 |
| Label | 0.75rem | 700 | `0.2em` tracking, uppercase |

---

## 3. Arabic — three faces, three jobs, never swapped

This is the part with real consequences: the wrong face puts a mark in the
wrong place over a word of the Qur'an.

| Role | Face | Class | Where |
| --- | --- | --- | --- |
| Qur'anic text | KFGQPC Uthmanic Hafs | `.ar-quran` | Every ayah — questions, options, reader. Self-hosted woff2. |
| Tap-the-word passage | Uthmanic Hafs, larger | `.ar-tap` | `clamp(1.5rem, 3.4vw, 2rem)` — tap targets need the size. |
| Everything else | IBM Plex Sans Arabic | `.ar-ui` | Module titles, student answers. |

A question container carries `.qn`, which lifts `.ar-quran` inside it to
`1.7em` — an ayah being scanned for a rule needs more size than one being
listed. `.ar-tap` is deliberately outside that rule and keeps its own size.

### Why Amiri is not allowed near a verse

Amiri Quran has no glyph for U+06ED, the small low meem that rides with a
tanwīn, and a browser answers a missing glyph by borrowing from another face —
which draws the mark loose and in the wrong place. Every verse in the question
bank is Madani text, so every homework showed it. Uthmanic Hafs has the glyph.

Related: a tatweel (U+0640) in front of a dagger alif (U+0670) sets the alif
adrift one letter to the left. Migration `0032` stripped the pair from the
question bank; do not reintroduce it when adding verses.

### The wordmark

تجويد is set in **Habeba**. Not a webfont — it ships as an **SVG** wherever it
appears on screen, never as live text. That is the better answer regardless: a
logo should be vector, not something that depends on a font loading.

---

## 4. Devices

Four recurring moves. Together they identify the account at thumbnail size,
before a word is read.

- **The highlighter** — sage behind the words that carry the promise. One per
  post, never two. Always navy type on it.
- **The lattice** — a geometric ground under everything, kept under 7% opacity
  so it is felt rather than seen.
- **The sticky note** — sage paper, washi tape, 3–5° rotation, set in Times New
  Roman MT Condensed. For facts you want held up, not read past.
- **The footer lockup** — wordmark over the domain, centred, on every slide.
  Page number bottom-right on carousels.

---

## 5. Instagram

No colour in the palette holds an edge against both Instagram themes: lavender
on white is 1.24:1, navy on black is 1.11:1. Sage manages 1.87:1 on white,
which is weak.

**The fix is alternation, not a better colour.** Rotate the ground post to post
so no two neighbours share one. In the light feed the navy and sage cells cut
the outline; in the dark feed the lavender and sage cells do. Every cell is
edged by its neighbours rather than by the app behind it.

For a post that will be seen alone, put both a light and a dark region in the
composition, so one of them supplies the edge in either theme. Sage is the
swing colour — the only ground that never fully disappears.

---

## 6. Do and don't

**Do**

- Keep sage to roughly a tenth of any layout.
- Set the highlighter on the words carrying the promise, not a whole line.
- Let navy separate sage from lavender, every time they meet.
- Use the two-weight headline: regular above, bold below.
- Put the wordmark and domain on every slide.

**Don't**

- Set sage type on lavender, or lavender type on sage, at any size.
- Flip the sage chip's text to lavender in dark mode. It stays navy.
- Put a semantic colour — the pass green, the overdue red — on social.
- Set Qur'anic text in anything but Uthmanic Hafs.
- Use pure white or pure black anywhere.
- Let the lattice climb above 7%.

---

## 7. Where the tokens live

`src/app/globals.css`, in the two navy brand blocks:

- `:root[data-brand="navy"]` — light
- `:root[data-brand="navy"].dark` — dark

Both carry `--tertiary`, `--tertiary-surface`, `--tertiary-foreground` and
`--tertiary-muted`. `--tertiary-surface` and `--tertiary-foreground` are
identical in both blocks, and that is deliberate — see law 2 above.

Two cascade traps in that file, both already documented in place:

- `.ar-quran` is **unlayered**, and an unlayered declaration outranks every
  layered one however specific. A `font-size` for it written inside
  `@layer components` is dead on arrival. Several such rules exist.
- The brand blocks are selected by specificity, not order. `:root[data-brand="navy"].dark`
  (0,3,0) beats `:root[data-brand="navy"]` (0,2,0) beats the cream default.
