<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Brand system

**Read `docs/brand-system.md` before changing anything a user sees** — colour,
typography, Arabic text, or a new screen or component. It is short, and it
carries the constraints that are not guessable from the code:

- Three colours only: navy `#00004D`, lavender `#E5E5FF`, sage `#B2C58C`. Sage
  and lavender can never meet as text and ground (1.51:1), and a sage fill
  keeps navy type in **both** modes — the accent never flips.
- The brand face is Helvetica Neue, shipped as a system stack, not a webfont.
  Do not delete the Archivo import: `--font-mono` still needs it for ā, ū, ṣ, ṭ.
- Qur'anic text is set in Uthmanic Hafs and nothing else. `.ar-quran`,
  `.ar-tap` and `.ar-ui` are three different jobs and are not interchangeable.

Tokens live in `src/app/globals.css` in the two `[data-brand="navy"]` blocks.
The CSS is the source of truth; the doc explains it.
<!-- END:nextjs-agent-rules -->
