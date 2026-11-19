# Exam Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. One Opus subagent per task; the orchestrator reviews each before the next starts. Tasks use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A teacher-side "Exam Builder" section where teachers browse a shared bank of past exam questions by topic, assemble a paper from them, and print the paper and its mark scheme in last year's format.

**Architecture:** Five new Postgres tables (`exam_bank_topics`, `exam_bank_questions`, `exam_papers`, `exam_paper_sections`, `exam_paper_items`) behind row level security; a question placed on a paper is a full copy, so the bank is never changed by paper edits. Server actions under `web/src/lib/exam-builder/` do every write. The builder is one client workspace (bank left, paper middle, actions top right). Printing is a bare route outside the teacher shell styled with `@media print`, so "PDF" is the browser's own Save as PDF. Word export is a route handler using the `docx` package.

**Tech stack:** Next.js 16.2 (read `web/node_modules/next/dist/docs/` first — it differs from older Next), React 19, Supabase (Postgres + Storage), Tailwind v4 with the navy brand tokens, vitest. Python 3 stdlib for the one-off import tooling in `execution/`.

**Source of the requirements:** `brainstorms/2026-11-19-exam-builder.md` in the main checkout (git-ignored; the decisions are restated below).

---

## Decisions this plan implements

1. One section called **Exam Builder**, on the teacher side, open to every teacher. Students see none of it.
2. The bank is browsed in two levels — a video series you open, then the rules inside it — plus four standalone subjects (Ummul Kitab, A'daab, Seerah, Matn). Filter by marks and by "not used before".
3. A bank question is a **pair**: question + answer (mark scheme) + marks. It lists every place it was found and which exams it was used in, as short labels (`EOT2 25/26`).
4. **No homework questions** in the bank. **No repeats**: where a question is in both an exam and a bank document, the exam's version is kept.
5. Teachers can **add** to the bank; they cannot edit or delete bank questions. Only an admin (`profiles.is_admin`) corrects the bank, on a review page that lists doubtful imports first.
6. A question on a paper is a **copy**: wording, options, marks and answer can be changed there without touching the bank.
7. A new paper starts with last year's three sections — A multiple choice, B short answer, C practical hifdh table — but sections can be renamed, added, removed and reordered, and a question is never forced into a section.
8. Every paper has a **mark scheme**. Exports: PDF (print), Word, Google Doc — built in that order.
9. **Mark as final** stamps each bank question on the paper as used, labelled `<code> <season>`, e.g. `EOT1 26/27`.
10. One teacher owns a paper; no co-editing yet.
11. Arabic in a question is a picture from the source document, or — when the picture is missing or poor — the ayah typeset from the app's own `quran_words` glyph data.
12. Paper format copies `EOT2 exam 25/26`: centred "BSMS Tajweed" / title / italic month-year; right-aligned "Max Marks" and "Duration"; a numbered "Note:"; a rule; section headings with totals; bold question text with marks right-aligned as `(1 mark)`; tick boxes for options; serif face, A4, black and white.

## Names (the word "exam" is already taken)

`exam_scores`, `terms.exam_max`, `web/src/lib/exams/actions.ts` and `components/app/exam-input.tsx` are the END-OF-TERM MARK feature. Do not touch them. Everything new uses:

| Thing | Name |
| --- | --- |
| Route | `/teacher/exam-builder` |
| Print route (outside the teacher shell) | `/exam-print/[paperId]` |
| Lib | `web/src/lib/exam-builder/` |
| Components | `web/src/components/exam-builder/` |
| Tables | `exam_bank_topics`, `exam_bank_questions`, `exam_papers`, `exam_paper_sections`, `exam_paper_items` |
| Storage bucket | `exam-questions` (private) |
| SQL functions | `is_admin()`, `owns_exam_paper(uuid)`, `exam_paper_set_final(uuid, boolean)` |

## File map

```
web/supabase/migrations/0152_exam_builder.sql          schema, RLS, bucket (WRITTEN — the contract)
web/src/lib/exam-builder/
  types.ts            BankQuestion, PaperItem, Paper, Section, Topic, McqOption, QuranRef
  topics.ts           topic tree helpers (group children under parents, ordering)        + topics.test.ts
  numbering.ts        question numbers, section totals, max marks, marks label           + numbering.test.ts
  filters.ts          bank filtering: topic, marks, unused, kind, search text            + filters.test.ts
  labels.ts           used-in label ("EOT1 26/27"), default sections, default notes      + labels.test.ts
  queries.ts          "server-only" loaders: bank (with signed image URLs), papers, one paper
  actions.ts          "use server": every mutation                                        + actions.test.ts
  images.ts           "server-only": batch signed URLs for exam-questions paths
web/src/components/exam-builder/
  paper-list.tsx          my papers + new paper
  workspace.tsx           the three-area builder (client state owner)
  bank-panel.tsx          topic tree, filters, question cards with Add
  bank-question-card.tsx  one bank question: prompt, picture, options, marks, used-in chips
  paper-canvas.tsx        the paper as it will print, editable in place
  paper-header-form.tsx   title, date, duration, code, season, notes
  section-block.tsx       section title, reorder/remove, its items or the practical table
  item-editor.tsx         edit a copied question: prompt, options, correct, marks, answer, lines
  new-question-form.tsx   write a new question (+ picture upload, + "keep out of the bank")
  export-menu.tsx         Paper / Mark scheme → Print (PDF), Word; Mark as final
  question-prompt.tsx     renders prompt text + pictures or typeset Qur'an (shared by screen and print)
  quran-snippet.tsx       an ayah range typeset from quran_words with the QCF page fonts
  review-table.tsx        admin review of imported questions
web/src/app/teacher/exam-builder/
  page.tsx                paper list
  [paperId]/page.tsx      the workspace
  bank/page.tsx           the bank on its own (browse + add a question)
  review/page.tsx         admin-only review page
web/src/app/exam-print/[paperId]/
  layout.tsx              bare white layout, no app shell
  page.tsx                ?scheme=1 for the mark scheme; print styles; Print button
  print.css               A4 page rules
web/src/app/api/exam-builder/[paperId]/docx/route.ts    Word export (Task 8)
web/src/lib/nav.ts, web/src/components/app/nav-icons.ts  "Exam Builder" nav entry
execution/exam_doc_to_text.py        source docs → annotated text + images
execution/exam_bank_merge.py         per-group question JSON → one de-duplicated bank JSON
execution/exam_bank_import.ts        bank JSON + pictures → Supabase (idempotent on import_key)
```

## Conventions every task follows

- Read `web/AGENTS.md`, `web/docs/brand-system.md` and the relevant guide in `web/node_modules/next/dist/docs/` before writing code.
- Pages export `const dynamic = "force-dynamic"`. Mutations are server actions returning `{ ok: true, … } | { ok: false, error: string }` (pattern: `web/src/lib/deposits/actions.ts`), guarded by `requireTeacher()` from `web/src/lib/teacher/guards.ts`. A `"use server"` file exports ONLY async functions.
- SQL uses `public.acting_id()`, never `auth.uid()` (a test enforces it; storage policies are the exception).
- Colours come from the `[data-brand="navy"]` tokens. Middle strength: section bands `color-mix(in oklab, var(--brand) 28%, var(--card))` with bold navy text, status chips at `/15` tints. Check light AND dark.
- No toasts exist; errors show inline as `<p className="text-xs text-danger" role="alert">`. No drag library: reorder with up/down buttons. Use `<details>` for collapsibles, `Dialog` from `components/ui/dialog.tsx` for modals (it becomes a bottom sheet on phones).
- Qur'anic text: `.ar-quran` (Uthmanic Hafs) or QCF page fonts via `quran_words.code_v1`; UI Arabic: `.ar-ui`. Pass `text_uthmani` through `seatDaggerAlif()`.
- Tests: vitest, files beside the code, no jest-dom (`afterEach(cleanup)`, plain DOM asserts). Run `npx vitest run src/lib/exam-builder` and `npx tsc --noEmit` from `web/`; under memory pressure add `--maxWorkers=1`.
- This Mac has 8 GB: one dev server, one headless Chrome, no parallel builds. Do NOT run `npm run build` while `next dev` is up.
- Commit after each task with only the files you touched (`git add <paths>`, never `-A`). Never push. Never switch branch. Work only in the worktree `/Users/ibrahimramadan/BSMS Tajweed app/.claude/worktrees/exam-builder`.
- The database is the LIVE one (there is no local copy). Only the import and the app's own actions write to it, only to the `exam_*` tables and the `exam-questions` bucket.

---

## Task 1: Schema live, types, pure logic, navigation, empty pages

**Files:** migration 0152 (exists); create `lib/exam-builder/{types,topics,numbering,filters,labels}.ts` + tests; modify `lib/nav.ts`, `components/app/nav-icons.ts`, `lib/database.types.ts`; create the four `app/teacher/exam-builder/**/page.tsx` as minimal pages.

- [ ] Confirm `0152` is still free: `git ls-tree --name-only origin/main web/supabase/migrations/ | tail -3`.
- [ ] Apply the migration from the MAIN checkout (it holds the root `.env`): `cd "/Users/ibrahimramadan/BSMS Tajweed app" && npx tsx execution/apply_migration.ts --probe "select 1"` then `npx tsx execution/apply_migration.ts "<worktree>/web/supabase/migrations/0152_exam_builder.sql"`. Verify with `--probe "select count(*) from exam_bank_topics"` (expect 36) and `--probe "select id from storage.buckets where id='exam-questions'"`.
- [ ] Regenerate `web/src/lib/database.types.ts` via the Management API (see LEARNINGS.md, "types/typescript") and confirm the five tables appear.
- [ ] `types.ts`: `McqOption {text: string; image: string | null; correct: boolean}`, `QuranRef {surah: number; from_ayah: number; to_ayah: number; from_word?: number; to_word?: number}`, `SourceRef {label: string; kind: "exam" | "bank" | "mark_scheme" | "form"; number?: string}`, `Topic`, `TopicGroup`, `BankQuestion` (row + `imageUrls: Record<path, signedUrl>`), `Paper`, `Section`, `PaperItem`, `Result<T>`.
- [ ] `topics.ts` `groupTopics(rows) → TopicGroup[]` (parents in `position` order, children nested; a parent with no children is its own leaf), `topicPath(id, rows) → "Sifaat › Ra"`. Tests: ordering, standalone subjects, unknown id.
- [ ] `numbering.ts` `numberItems(sections, items)` → per-item running number restarting at 1 in each section (as last year), `sectionTotal`, `paperTotal` (question sections + practical `marks`), `marksLabel(1) → "(1 mark)"`, `marksLabel(2) → "(2 marks)"`, `marksLabel(1.5) → "(1.5 marks)"`. Tests for each.
- [ ] `filters.ts` `filterBank(questions, {topicIds, marks, unusedOnly, kind, text})` — `topicIds` matches a leaf or any child of a parent; `text` is a case-insensitive match on prompt/answer after NFC normalisation. Tests.
- [ ] `labels.ts` `usedLabel(code, season) → "EOT1 26/27"`, `DEFAULT_SECTIONS` (A "Section A - Multiple Choice Questions", B "Section B - Short Answer Questions", C "Section C - Practical Component" kind practical `{rows:3, marks:9, columns:["Verse","Surah","Order - before/after"]}`), `DEFAULT_NOTES` (last year's three note lines), `suggestSection(kind, sections)` → the first section whose title mentions "multiple choice" for mcq / "short answer" for short, else the first question section. Tests.
- [ ] Nav: add `{ href: "/teacher/exam-builder", label: "Exam Builder", icon: "file-text" }` after Homework in `teacherNav`, add `"file-text"` to `IconName` and map it to Lucide `FileText` in `nav-icons.ts`. Do not pin it to the phone tab bar. `npx vitest run src/lib/nav.test.ts` passes.
- [ ] Four pages rendering the masthead and "Coming together…" so the routes resolve; `review/page.tsx` calls `notFound()` unless `currentProfile()?.is_admin`.
- [ ] `npx tsc --noEmit` clean; `npx vitest run src/lib/exam-builder src/lib/nav.test.ts src/lib/supabase/acting-id-migrations.test.ts` green. Commit: `feat(exam-builder): schema, bank and paper types, navigation`.

## Task 2: Extract the questions from the source documents (data, no app code)

Five extraction passes, one per source group, each producing `scratchpad/exam_questions/<group>.json` in the schema below. Inputs are the annotated text + pictures made by `execution/exam_doc_to_text.py`.

Groups: **G1** EOT2 25/26 exam + its mark scheme + Term 2 sifaat question bank · **G2** EOT1 25/26 mark scheme + Term 1 EOT question bank · **G3** EOY 25/26 exam (Matn Included) + its mark scheme + "EOY 25/26 exam / Salsabeel" + Term 3 tajweed question bank · **G4** Season 3: EOY exam, sisters' EOY exam, EOT 2 Sifaat draft, EOT 1 Exam Updated, sisters' EOT question bank, forms (EoT Test, Ghunna question bank), Ummul Kitab Q bank · **G5** Seerah Series Q Bank.

```json
{ "group": "G1",
  "questions": [{
    "key": "G1-001",
    "kind": "mcq | short",
    "prompt": "question wording, Arabic kept exactly",
    "prompt_images": ["<slug>/images/image3.png"],
    "options": [{"text": "…", "image": null, "correct": true}],
    "select_many": false,
    "marks": 1,
    "answer": "mark scheme text with its (1) breakdown, or null",
    "topic": "sifaat.ra",
    "quran_ref": {"surah": 31, "from_ayah": 19, "to_ayah": 19},
    "sources": [{"label": "EOT2 25/26", "kind": "exam", "number": "A2"},
                {"label": "Term 2 question bank 25/26", "kind": "bank"}],
    "used_in": ["EOT2 25/26"],
    "status": "clean | check",
    "note": "why it needs a look, or null"
  }] }
```

Rules: exam version wins over bank version; a question only in a bank has `used_in: []` unless the bank marks it "used" (then `status: "check"`, note says which exam is unknown); the correct MCQ option comes from the mark scheme's formatting; `status: "check"` whenever the answer, the picture pairing, the marks or the topic had to be guessed; never invent an answer.

- [ ] Run the five passes (at most three at a time), then `execution/exam_bank_merge.py` to de-duplicate ACROSS groups (normalised prompt + same pictures → one question, sources and used_in unioned, exam version kept) and write `scratchpad/exam_questions/bank.json` plus a short stats report.

## Task 3: Import the bank

**Files:** create `execution/exam_bank_import.ts`.

- [ ] Uploads each referenced picture to `exam-questions/bank/<sha1>.<ext>` (service role, skip if present), then upserts `exam_bank_questions` on `import_key` (= the merged question key). `--dry-run` prints counts per topic and per status without writing. Rerunning changes nothing.
- [ ] Run it; verify with probes: total rows, rows per parent topic, rows with `review_status='check'`, rows with pictures, 0 rows with `topic_id` not in `exam_bank_topics`. Commit the scripts (never the JSON or pictures).

## Task 4: The builder workspace

**Files:** `lib/exam-builder/{queries,images,actions}.ts` + `actions.test.ts`; components `paper-list, workspace, bank-panel, bank-question-card, paper-canvas, paper-header-form, section-block, item-editor, question-prompt, export-menu`; pages `exam-builder/page.tsx`, `[paperId]/page.tsx`, `bank/page.tsx`.

Actions (all `requireTeacher()`, all return `Result`): `createPaper()` (inserts the paper with `DEFAULT_NOTES` and the three `DEFAULT_SECTIONS`, returns its id), `updatePaper(id, patch)`, `deletePaper(id)`, `addSection`, `updateSection`, `removeSection`, `moveSection(id, dir)`, `addItemFromBank(paperId, sectionId, bankQuestionId)` (copies every content column; `marks` defaults to 1 when the bank has none), `updateItem(id, patch)`, `removeItem(id)`, `moveItem(id, dir)`, `moveItemToSection(id, sectionId)`, `setPaperFinal(id, final)` (calls the `exam_paper_set_final` RPC). Positions are rewritten as 1..n after every move.

- [ ] `queries.ts`: `loadBank()` (all non-archived questions + topics, one query, pictures signed in one `createSignedUrls` batch, 1-hour expiry, paged past PostgREST's 1000-row cap), `loadMyPapers()`, `loadPaper(id)` (paper, sections, items in order; `notFound()` when RLS returns nothing).
- [ ] Workspace layout, desktop (≥ lg): bank panel left (about 380px, its own scroll), paper canvas centre, header bar across the top with the paper title and the export menu at the right. Phone: the paper fills the screen and a "Question bank" button opens the bank as a bottom sheet (`Dialog`).
- [ ] Bank panel: topic tree as `<details>` (series → rules) with counts; filters for marks (chips for the mark values present), "Not used before", type (multiple choice / short answer), and a search box; question cards showing prompt, picture, options (correct one marked), marks, used-in chips, a "needs checking" chip when `review_status='check'`, an "Add" button (with a section picker defaulting to `suggestSection`) that becomes "Added" when the paper already holds a copy.
- [ ] Paper canvas: renders close to the printed paper (white sheet, serif) with the header, notes, sections and numbered questions; each question has edit, move up/down, move to section and remove controls; section headings show totals and are renamable; the practical section shows its table with rows and marks editable. Totals and numbers update immediately (optimistic state, then the action).
- [ ] Item editor (Dialog): prompt, options with a correct toggle, select-many, marks, answer / mark scheme, answer lines.
- [ ] Verify in a real browser on localhost: create a paper, add six questions across two topics, edit one, move one between sections, remove one, reload — state persists. Light and dark. 390px wide. Commit.

## Task 5: Print the paper and the mark scheme

**Files:** `app/exam-print/[paperId]/{layout,page}.tsx`, `print.css`, reuse `question-prompt.tsx`.

- [ ] Bare layout (no AppShell), always light, serif (`"Times New Roman", Times, serif`), `@page { size: A4; margin: 18mm 16mm }`, `break-inside: avoid` on each question, pictures capped so an ayah line fits the measure, tick boxes as bordered squares, writing space as ruled lines (`answer_lines`), the practical table as last year's.
- [ ] `?scheme=1`: title gains "MARK SCHEME"; the correct option is ticked and bold; the answer text sits under each question in a bordered box; a question with no answer shows "Answer needed". Without it, no answers leak.
- [ ] A screen-only toolbar: "Print / Save as PDF" (`window.print()`), "Paper | Mark scheme" switch, "Back to the builder". Hidden in print.
- [ ] Verify: Chrome `Page.printToPDF` of both views for a real paper; open the PDFs' first pages as images and compare against last year's layout. Commit.

## Task 6: New questions, review page, final

- [ ] `new-question-form.tsx` + `addBankQuestion(input)` action: topic, type, prompt, optional picture (uploaded from the browser to `exam-questions/new/<profile id>/<uuid>.<ext>`), options, marks, answer; saved to the bank with `created_by` and source `{label: "<teacher name>, Nov 2026", kind: "bank"}`, then added to the paper. A "Keep out of the bank" tick skips the bank row and only creates the paper item.
- [ ] `review/page.tsx` + `review-table.tsx` (admin only): every imported question beside its sources, `check` first; actions `approveBankQuestion`, `updateBankQuestion`, `archiveBankQuestion` (admin guarded in the action AND by RLS). Counts at the top.
- [ ] Export menu: "Mark as final" with a confirm that names the label it will stamp; a final paper shows a "Final" chip and "Reopen".
- [ ] Verify in the browser as an admin and as a non-admin teacher (the review page 404s for the latter). Commit.

## Task 7: Typeset Qur'an instead of a picture

- [ ] `quran-snippet.tsx` (server): fetch the range from `quran_words`, group by page and line, render each line in its QCF page font (`code_v1`, `@font-face` per page, as `mushaf-reader.tsx` does), fall back to `.ar-quran` text. Used by `question-prompt.tsx` whenever `prompt_quran` is set and there is no usable picture; in the item editor a teacher can switch a question to "Typeset ayah" by entering surah and ayah range.
- [ ] Verify on screen and in print (fonts load before `window.print()`). Commit.

## Task 8: Word export

- [ ] `npm install docx` in `web/`. `api/exam-builder/[paperId]/docx/route.ts` (GET, teacher + ownership checked through RLS): builds the same paper or mark scheme (`?scheme=1`) as a `.docx` — header, notes, sections, numbered questions with marks on a right tab stop, options with ☐, pictures embedded (fetched server-side from storage), ruled answer lines, the practical table. Export menu gains "Download Word".
- [ ] Verify by opening the file with `textutil -convert txt` and checking question count and marks. Commit.

## Task 9: Google Doc export (only if time allows)

- [ ] Upload the Task 8 `.docx` to the Drive `Exams` folder with conversion to a Google Doc, using a server-side Google refresh token from env, and return the link. Needs new env vars on Netlify before it can work live — record that in the hand-over.

## Task 10: Alternative layouts artifact

- [ ] One Opus subagent: research how comparable tools lay out a library + document + export actions (desktop and phone), then produce 3 alternative layouts for the Exam Builder as one self-contained HTML page in the app's navy palette with real question data, published as an artifact for the owner to show teachers.

## Final check

- [ ] `npx tsc --noEmit`, `npm run lint`, `npx vitest run` (whole suite), then with the dev server stopped `npm run build`.
- [ ] Dev server left running on a free port for the owner; hand-over lists the URL, what works, what does not, and every commit on `feat/exam-builder`. Nothing pushed.
