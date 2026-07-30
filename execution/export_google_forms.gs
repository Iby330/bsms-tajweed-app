/**
 * export_google_forms.gs — BSMS Tajweed
 *
 * Dumps every Google Form in a Drive folder to a single JSON file:
 * question text, ALL options in order, which options are correct,
 * point values, and any attached images.
 *
 * WHY THIS EXISTS
 * The linked response spreadsheet only ever receives *responses* — a Form's
 * question definitions never flow into it. So options and the answer key
 * cannot be recovered from any spreadsheet export. They must come from the
 * Forms themselves. Per the decision recorded in the project brainstorm, the
 * Google Form is the source of truth; the HW Master Guide doc is secondary
 * and known to contain errors.
 *
 * THIS IS APPS SCRIPT — it runs at script.google.com inside the BSMS Google
 * account, NOT locally with node/python. See the SETUP block below.
 *
 * ── SETUP ──────────────────────────────────────────────────────────────────
 *  Run `listForms` FIRST to see what it finds, then `exportAllForms`.
 *
 *  By default FOLDER_ID is empty, which means "search my whole Drive for
 *  Google Forms" — no need to gather them into a folder. Narrow the results
 *  with NAME_FILTER if the search picks up unrelated forms.
 *
 *  If you'd rather point it at one folder, copy the ID from the folder URL:
 *      drive.google.com/drive/folders/<THIS_PART_IS_THE_ID>
 *  and set FOLDER_ID to it.
 *
 *  Approve the permission prompt on the first run (Drive + Forms access; the
 *  script only reads Forms and writes its own output).
 *
 *  Output lands in a new Drive folder named by OUTPUT_FOLDER_NAME:
 *      - forms_export.json   <- the file to send back
 *      - images/             <- any images used in questions
 *
 * Runtime is roughly 1-3 seconds per form. If you ever exceed the 6-minute
 * Apps Script limit, set START_AT to resume from a later form index.
 * ───────────────────────────────────────────────────────────────────────────
 */

// ── CONFIG ───────────────────────────────────────────────────────────────────
const FOLDER_ID          = '1JVQwEFxxNIRgv2bBFNp70iAySKqdHaLT';  // BSMS homework Forms folder
const SEARCH_SUBFOLDERS  = true;   // also descend into subfolders of FOLDER_ID
const NAME_FILTER        = '';     // '' = every form; e.g. 'HW' = only names containing "HW"
const OUTPUT_FOLDER_NAME = 'BSMS Forms Export';
const EXPORT_IMAGES      = true;   // false = skip image files, keep JSON metadata
const START_AT           = 0;      // resume index if you ever hit the time limit
// ─────────────────────────────────────────────────────────────────────────────


/** Find every Google Form, either in FOLDER_ID (optionally recursing) or across the whole Drive. */
function findFormFiles_() {
  const files = [];
  const seen = {};

  function collect(source) {
    const it = source.getFilesByType(MimeType.GOOGLE_FORMS);
    while (it.hasNext()) {
      const f = it.next();
      if (seen[f.getId()]) continue;                    // same form linked in two places
      seen[f.getId()] = true;
      if (!NAME_FILTER || f.getName().toLowerCase().indexOf(NAME_FILTER.toLowerCase()) !== -1) {
        files.push(f);
      }
    }
  }

  if (FOLDER_ID) {
    const root = DriveApp.getFolderById(FOLDER_ID);
    collect(root);
    if (SEARCH_SUBFOLDERS) {
      const stack = [root];
      while (stack.length) {
        const sub = stack.pop().getFolders();
        while (sub.hasNext()) { const child = sub.next(); collect(child); stack.push(child); }
      }
    }
  } else {
    collect(DriveApp);
  }
  // Stable, human order: HW 1, HW 2, ... HW 10, ... HW 21
  files.sort(function (a, b) {
    const d = naturalKey_(a.getName()) - naturalKey_(b.getName());
    return d !== 0 ? d : (a.getName() < b.getName() ? -1 : 1);
  });
  return files;
}


/** Run this FIRST — lists what will be exported, without exporting anything. */
function listForms() {
  const files = findFormFiles_();
  Logger.log('Scope: ' + (FOLDER_ID ? 'folder ' + FOLDER_ID : 'ENTIRE DRIVE') +
             (NAME_FILTER ? ' | name contains "' + NAME_FILTER + '"' : ''));
  Logger.log('Found ' + files.length + ' form(s):');
  files.forEach(function (f, i) { Logger.log('  ' + (i + 1) + '. ' + f.getName()); });
  if (!files.length) Logger.log('Nothing found — check NAME_FILTER, or that the Forms are in this account.');
  return files.length;
}


function exportAllForms() {
  const outFolder = getOrCreateFolder_(OUTPUT_FOLDER_NAME);
  const imgFolder = EXPORT_IMAGES ? getOrCreateChildFolder_(outFolder, 'images') : null;

  const files = findFormFiles_();
  Logger.log('Found ' + files.length + ' form(s) — ' +
             (FOLDER_ID ? 'folder ' + FOLDER_ID : 'entire Drive'));

  const forms = [];
  const problems = [];

  for (let i = START_AT; i < files.length; i++) {
    const file = files[i];
    try {
      forms.push(exportOneForm_(file, imgFolder));
      Logger.log('  [' + (i + 1) + '/' + files.length + '] OK   ' + file.getName());
    } catch (err) {
      problems.push({ file: file.getName(), id: file.getId(), error: String(err) });
      Logger.log('  [' + (i + 1) + '/' + files.length + '] FAIL ' + file.getName() + ' — ' + err);
    }
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    source: FOLDER_ID ? ('folder:' + FOLDER_ID) : 'entire-drive',
    nameFilter: NAME_FILTER || null,
    formCount: forms.length,
    problems: problems,
    forms: forms
  };

  const json = JSON.stringify(payload, null, 2);
  removeExisting_(outFolder, 'forms_export.json');
  outFolder.createFile('forms_export.json', json, MimeType.PLAIN_TEXT);

  Logger.log('');
  Logger.log('DONE — ' + forms.length + ' forms, ' + countQuestions_(forms) + ' questions.');
  if (problems.length) Logger.log('WARNING: ' + problems.length + ' form(s) failed — see "problems" in the JSON.');
  Logger.log('Output folder: ' + outFolder.getUrl());
}


function exportOneForm_(file, imgFolder) {
  const form = FormApp.openById(file.getId());

  const out = {
    file: file.getName(),
    formId: file.getId(),
    title: form.getTitle(),
    description: form.getDescription(),
    isQuiz: form.isQuiz(),
    collectsEmail: form.collectsEmail(),
    totalPoints: 0,
    items: []
  };

  const items = form.getItems();
  for (let i = 0; i < items.length; i++) {
    const rec = exportItem_(items[i], i, file, imgFolder);
    if (rec) {
      out.items.push(rec);
      if (typeof rec.points === 'number') out.totalPoints += rec.points;
    }
  }
  return out;
}


function exportItem_(item, index, file, imgFolder) {
  const type = String(item.getType());

  const rec = {
    index: index,
    id: item.getId(),
    type: type,
    title: item.getTitle(),
    helpText: item.getHelpText()
  };

  switch (item.getType()) {

    case FormApp.ItemType.MULTIPLE_CHOICE:
      fillChoices_(rec, item.asMultipleChoiceItem());
      break;

    case FormApp.ItemType.CHECKBOX:
      fillChoices_(rec, item.asCheckboxItem());
      break;

    case FormApp.ItemType.LIST:
      fillChoices_(rec, item.asListItem());
      break;

    // Free-text answers. Apps Script exposes the points but NOT the model
    // answer for text questions — take those from the HW Master Guide, which
    // is reliable for model answers even though its totals are not.
    case FormApp.ItemType.TEXT:
      rec.points = safePoints_(item.asTextItem());
      rec.answerKeyAvailable = false;
      break;

    case FormApp.ItemType.PARAGRAPH_TEXT:
      rec.points = safePoints_(item.asParagraphTextItem());
      rec.answerKeyAvailable = false;
      break;

    case FormApp.ItemType.SCALE: {
      const s = item.asScaleItem();
      rec.points = safePoints_(s);
      rec.bounds = { lower: s.getLowerBound(), upper: s.getUpperBound() };
      rec.labels = { lower: s.getLeftLabel(), upper: s.getRightLabel() };
      break;
    }

    case FormApp.ItemType.GRID: {
      const g = item.asGridItem();
      rec.points = safePoints_(g);
      rec.rows = g.getRows();
      rec.columns = g.getColumns();
      break;
    }

    case FormApp.ItemType.CHECKBOX_GRID: {
      const cg = item.asCheckboxGridItem();
      rec.rows = cg.getRows();
      rec.columns = cg.getColumns();
      break;
    }

    // Images are standalone items in Forms, not attached to a question.
    // Their position in `index` order is what associates them with the
    // question they illustrate — usually the item immediately after.
    case FormApp.ItemType.IMAGE: {
      const img = item.asImageItem();
      rec.alignment = String(img.getAlignment());
      rec.width = img.getWidth();
      if (imgFolder) {
        try {
          const blob = img.getImage();
          const name = sanitise_(file.getName()) + '__item' + index + '__' +
                       sanitise_(item.getTitle() || 'image') + '.png';
          removeExisting_(imgFolder, name);
          rec.imageFile = imgFolder.createFile(blob.setName(name)).getName();
        } catch (e) {
          rec.imageError = String(e);
        }
      }
      break;
    }

    case FormApp.ItemType.SECTION_HEADER:
    case FormApp.ItemType.PAGE_BREAK:
      break;

    default:
      rec.note = 'unhandled item type — raw title captured only';
  }

  return rec;
}


/** Pull every option in order plus the answer key. This is the whole point of the script. */
function fillChoices_(rec, typedItem) {
  rec.points = safePoints_(typedItem);
  rec.required = typedItem.isRequired();

  const choices = typedItem.getChoices();
  rec.options = choices.map(function (c, i) {
    let correct = null;
    try { correct = c.isCorrectAnswer(); } catch (e) { correct = null; } // non-quiz forms
    return { position: i, label: 'Option ' + String.fromCharCode(65 + i), value: c.getValue(), correct: correct };
  });

  rec.correctOptions = rec.options.filter(function (o) { return o.correct === true; })
                                  .map(function (o) { return o.label; });
  rec.answerKeyAvailable = rec.options.some(function (o) { return o.correct !== null; });

  try { if (typedItem.hasOtherOption && typedItem.hasOtherOption()) rec.hasOtherOption = true; } catch (e) {}
}


function safePoints_(typedItem) {
  try { return typedItem.getPoints(); } catch (e) { return null; }
}


// ── helpers ──────────────────────────────────────────────────────────────────

function getOrCreateFolder_(name) {
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

function getOrCreateChildFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function removeExisting_(folder, name) {
  const it = folder.getFilesByName(name);
  while (it.hasNext()) it.next().setTrashed(true);
}

/** Sorts "HW 2" before "HW 10" instead of lexicographically. */
function naturalKey_(name) {
  const m = String(name).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 9999;
}

function sanitise_(s) {
  return String(s).replace(/[^\w\d]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
}

function countQuestions_(forms) {
  return forms.reduce(function (n, f) {
    return n + f.items.filter(function (i) { return typeof i.points === 'number' || i.options; }).length;
  }, 0);
}


/** Optional: run this first to confirm the folder is the right one before a full export. */
function listFormsInFolder() {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const it = folder.getFilesByType(MimeType.GOOGLE_FORMS);
  let n = 0;
  Logger.log('Forms in "' + folder.getName() + '":');
  while (it.hasNext()) { n++; Logger.log('  ' + n + '. ' + it.next().getName()); }
  Logger.log('Total: ' + n);
}
