import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MixedText } from "@/components/app/mixed-text";
import { OptionList, QuestionPrompt } from "@/components/exam-builder/question-prompt";
import { QuranSnippet } from "@/components/exam-builder/quran-snippet";
import { namedTitle } from "@/lib/exam-builder/labels";
import { formatMarks, marksLabel, numberItems, paperTotal, sectionTotal } from "@/lib/exam-builder/numbering";
import { loadPaper, type PaperItemWithImages } from "@/lib/exam-builder/queries";
import { loadQuranSnippets } from "@/lib/exam-builder/quran";
import { snippetKey, type SnippetWord } from "@/lib/exam-builder/quran-lines";
import type { Paper, Section } from "@/lib/exam-builder/types";
import { PrintToolbar } from "./print-toolbar";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ paperId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const isScheme = (sp: { [key: string]: string | string[] | undefined }) => sp.scheme === "1";

/**
 * "End Of Term 2 Exam - Advanced — EOT2 25/26 — Mark scheme": the browser
 * offers the document title as the PDF's file name. The paper's name is here
 * (when it has one) and never on the printed page. `absolute` keeps the app's
 * " · BSMS Tajweed" suffix off it.
 */
function documentTitle(paper: Paper, scheme: boolean): string {
  const tag = [paper.code.trim(), paper.season.trim()].filter(Boolean).join(" ");
  return [namedTitle(paper), tag, scheme ? "Mark scheme" : ""].filter(Boolean).join(" — ");
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ paperId }, sp] = await Promise.all([params, searchParams]);
  const loaded = await loadPaper(paperId);
  if (!loaded) return { title: "Exam paper" };
  return { title: { absolute: documentTitle(loaded.paper, isScheme(sp)) } };
}

/** "Section C - Practical Component - 9 marks" already says its total; don't print it twice. */
const ENDS_WITH_MARKS = /\d+(?:\.\d+)?\s*marks?\s*\)?\s*$/i;

function sectionHeading(section: Section, total: number): string {
  const title = section.title.trim();
  return ENDS_WITH_MARKS.test(title) ? title : `${title} (${formatMarks(total)} marks)`;
}

/**
 * The paper as it prints, or (`?scheme=1`) its mark scheme.
 *
 * Without `scheme=1` nothing below reads an option's `correct` flag or an
 * item's `answer`: the paper view's HTML carries no answers at all, rather
 * than rendering them and hiding them.
 */
export default async function ExamPrintPage({ params, searchParams }: Props) {
  const [{ paperId }, sp] = await Promise.all([params, searchParams]);
  const loaded = await loadPaper(paperId);
  if (!loaded) notFound();
  const scheme = isScheme(sp);
  const { paper, sections, items } = loaded;
  const numbers = numberItems(sections, items);
  const notes = paper.notes.map((n) => n.trim()).filter(Boolean);
  // An ayah typeset from the mushaf data stands in for a picture only when the
  // item has none: where there are pictures, the pictures win (for now).
  const typeset = await loadQuranSnippets(items.filter(wantsTypeset).map((i) => i.prompt_quran));

  return (
    <>
      <PrintToolbar paperId={paper.id} scheme={scheme} />
      <main className="ep-desk">
        <article className="ep-sheet" aria-label={scheme ? "Mark scheme" : "Exam paper"}>
          <header className="ep-head">
            <p className="ep-brand">BSMS Tajweed</p>
            <h1 className="ep-title">
              {paper.title.trim() || "Exam paper"}
              {scheme ? " — MARK SCHEME" : null}
            </h1>
            {paper.date_label.trim() ? <p className="ep-date">{paper.date_label}</p> : null}
            <div className="ep-meta">
              <p>Max Marks: {formatMarks(paperTotal(sections, items))}</p>
              {paper.duration_label.trim() ? <p>Duration: {paper.duration_label}</p> : null}
            </div>
            {notes.length > 0 ? (
              <div className="ep-notes">
                <p>Note:</p>
                <ol>
                  {notes.map((n, i) => (
                    <li key={i}>
                      <MixedText text={n} />
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            <hr className="ep-rule" />
          </header>

          {sections.map((section) => (
            <section key={section.id} className="ep-section">
              <h2 className="ep-section-title">{sectionHeading(section, sectionTotal(section, items))}</h2>
              {section.kind === "practical" ? (
                <PracticalTable section={section} />
              ) : (
                items
                  .filter((i) => i.section_id === section.id)
                  .map((item) => (
                    <Question
                      key={item.id}
                      item={item}
                      number={numbers[item.id]}
                      scheme={scheme}
                      quranWords={wantsTypeset(item) ? typeset[snippetKey(item.prompt_quran!)] : undefined}
                    />
                  ))
              )}
            </section>
          ))}
        </article>
      </main>
    </>
  );
}

/** An item to typeset: it names an ayah and carries no picture of it. */
const wantsTypeset = (item: PaperItemWithImages) =>
  !!item.prompt_quran && item.prompt_images.filter(Boolean).length === 0;

function Question({
  item,
  number,
  scheme,
  quranWords,
}: {
  item: PaperItemWithImages;
  number: number | undefined;
  scheme: boolean;
  /** The ayah's words, when it is typeset; without them the prompt keeps its "(Surah N, ayah M)". */
  quranWords?: SnippetWord[];
}) {
  const options = item.kind === "mcq" ? (item.options ?? []) : [];
  const pictureOptions = options.length > 0 && options.every((o) => o.image && !o.text.trim());
  const answer = scheme ? (item.answer ?? "").trim() : "";
  const needsAnswer = scheme && (item.kind === "mcq" ? !options.some((o) => o.correct) : !answer);

  return (
    <div className="ep-q">
      <div className="ep-q-head">
        <span className="ep-q-num">{number ?? ""}.</span>
        <QuestionPrompt
          prompt={item.prompt}
          images={item.prompt_images}
          imageUrls={item.imageUrls}
          quran={item.prompt_quran}
          quranSlot={quranWords?.length ? <QuranSnippet words={quranWords} variant="print" /> : undefined}
          variant="print"
        />
        <span className="ep-q-marks">{marksLabel(item.marks)}</span>
      </div>

      {options.length > 0 ? (
        <div className={pictureOptions ? "ep-options ep-options--pictures" : "ep-options"}>
          <OptionList options={options} imageUrls={item.imageUrls} showCorrect={scheme} variant="print" />
        </div>
      ) : null}

      {scheme ? (
        <>
          {answer ? (
            <div className="ep-answer">
              <p className="ep-answer-label">Answer</p>
              <MixedText text={answer} variant="quran" className="ep-answer-text" />
            </div>
          ) : null}
          {needsAnswer ? (
            <p className="ep-answer ep-answer--missing">
              {item.kind === "mcq" ? "Answer needed: no option is marked correct." : "Answer needed"}
            </p>
          ) : null}
        </>
      ) : item.kind === "short" && item.answer_lines > 0 ? (
        <div className="ep-lines" aria-hidden="true">
          {Array.from({ length: item.answer_lines }, (_, i) => (
            <div key={i} className="ep-line" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PracticalTable({ section }: { section: Section }) {
  const p = section.practical ?? { rows: 3, marks: 0, columns: [] };
  const columns = p.columns.length > 0 ? p.columns : [""];
  return (
    <div className="ep-practical">
      <p className="ep-practical-marks">
        (<span className="ep-blank" />/ {formatMarks(p.marks)} Marks)
      </p>
      <table className="ep-table">
        <thead>
          <tr>
            <th aria-label="Question" />
            {columns.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: Math.max(0, p.rows) }, (_, r) => (
            <tr key={r}>
              <th scope="row">Question {r + 1}</th>
              {columns.map((_, c) => (
                <td key={c} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
