import { classVerse } from "@/lib/classes/verse";

/**
 * The passage a class is named after, under the masthead's own class line.
 *
 * It belongs inside `<header class="masthead">` rather than after it: the
 * class line directly above is what it is a gloss on, it stays in the left
 * text column clear of the backdrop's subject, and being inside the header it
 * inherits the masthead's bottom padding, so the gap to the first section is
 * the one every other screen has.
 *
 * Renders nothing for a class named after a place.
 */
export function ClassVerse({ className }: { className: string | null | undefined }) {
  const v = classVerse(className);
  if (!v) return null;

  return (
    <figure className="classverse">
      <span className="ar" lang="ar" dir="rtl">
        <Marked text={v.ar} word={v.arWord} />
      </span>
      <figcaption className="en">
        <Marked text={v.en} word={v.enWord} />
      </figcaption>
      <span className="src label">{v.source}</span>
    </figure>
  );
}

/**
 * The class's own word, picked out of the line.
 *
 * Split on the exact token rather than a regex: the Arabic carries combining
 * marks that a pattern would be easy to break on, and a word that fails to
 * match should cost the reader a highlight, not a mangled ayah.
 */
function Marked({ text, word }: { text: string; word: string }) {
  const i = text.indexOf(word);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span className="w">{word}</span>
      {text.slice(i + word.length)}
    </>
  );
}
