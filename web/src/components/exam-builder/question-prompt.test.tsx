import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OptionList, QuestionPrompt, type RenderQuran } from "./question-prompt";
import { QuranSnippet } from "./quran-snippet";

const html = (el: React.ReactElement) => {
  const div = document.createElement("div");
  div.innerHTML = renderToStaticMarkup(el);
  return div;
};

describe("QuestionPrompt", () => {
  it("shows each picture, and a placeholder for a missing one on screen only", () => {
    const props = { prompt: "Which rule applies here?", images: ["bank/a.png", "bank/b.png"], imageUrls: { "bank/a.png": "https://x/a" } };
    const screen = html(<QuestionPrompt {...props} variant="screen" />);
    const imgs = screen.querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute("alt")).toBe("Arabic text for this question");
    expect(imgs[0].getAttribute("loading")).toBe("lazy");
    expect(screen.textContent).toContain("Picture missing");

    const print = html(<QuestionPrompt {...props} variant="print" />);
    expect(print.querySelectorAll("img")).toHaveLength(1);
    expect(print.querySelector("img")!.hasAttribute("loading")).toBe(false);
    expect(print.textContent).not.toContain("Picture missing");
  });

  const typeset: RenderQuran = (ref) => <b>typeset {ref.surah}:{ref.from_ayah}</b>;
  /** The words did not load: the renderer hands back the fallback it was given. */
  const failed: RenderQuran = (_ref, fallback) => fallback;

  it("typesets the ref in place of the pictures when one is set", () => {
    const el = html(
      <QuestionPrompt prompt="Q" images={["bank/a.png"]} imageUrls={{ "bank/a.png": "u" }}
        quran={{ surah: 31, from_ayah: 19, to_ayah: 19 }} renderQuran={typeset} variant="screen" />,
    );
    expect(el.querySelectorAll("img")).toHaveLength(0);
    expect(el.querySelector("b")?.textContent).toBe("typeset 31:19");
  });

  it("keeps the picture as the fallback, and shows it when there is no ref", () => {
    const props = { prompt: "Q", images: ["bank/a.png"], imageUrls: { "bank/a.png": "u" }, variant: "screen" as const };
    const fell = html(<QuestionPrompt {...props} quran={{ surah: 31, from_ayah: 19, to_ayah: 19 }} renderQuran={failed} />);
    expect(fell.querySelectorAll("img")).toHaveLength(1);
    const noRef = html(<QuestionPrompt {...props} quran={null} renderQuran={typeset} />);
    expect(noRef.querySelectorAll("img")).toHaveLength(1);
    expect(noRef.querySelector("b")).toBeNull();
  });

  it("never labels part of an ayah, even with nothing else to show", () => {
    const part = { surah: 2, from_ayah: 27, to_ayah: 27, from_word: 5, to_word: 6 };
    expect(html(<QuestionPrompt prompt="Q" images={[]} imageUrls={{}} quran={part} variant="print" />).textContent).not.toMatch(/Surah/);
    expect(html(<QuestionPrompt prompt="Q" images={[]} imageUrls={{}} quran={part} renderQuran={failed} variant="print" />).textContent).not.toMatch(/Surah/);
  });

  it("names the ayah range when there is nothing else to show", () => {
    const el = html(<QuestionPrompt prompt="Q" images={[]} imageUrls={{}} quran={{ surah: 103, from_ayah: 1, to_ayah: 3 }} variant="print" />);
    expect(el.textContent).toContain("Surah 103, ayat 1–3");
  });
});

describe("OptionList", () => {
  const options = [
    { text: "Ikhfaa", image: null, correct: false },
    { text: "Idghaam", image: null, correct: true },
  ];

  it("ticks and emboldens the correct option only on the mark scheme", () => {
    const paper = html(<OptionList options={options} imageUrls={{}} showCorrect={false} variant="print" />);
    expect(paper.textContent).not.toContain("✓");
    expect(paper.querySelectorAll(".font-bold")).toHaveLength(0);

    const scheme = html(<OptionList options={options} imageUrls={{}} showCorrect variant="print" />);
    const bold = scheme.querySelectorAll("li.font-bold");
    expect(bold).toHaveLength(1);
    expect(bold[0].textContent).toContain("Idghaam");
    expect(bold[0].textContent).toContain("✓");
    expect(scheme.querySelectorAll("input")).toHaveLength(0);
  });

  const ref = { surah: 2, from_ayah: 27, to_ayah: 27, from_word: 5, to_word: 6 };
  const pictured = [
    { text: "", image: "bank/a.png", correct: false, quran: ref },
    { text: "", image: "bank/b.png", correct: true },
  ];
  const urls = { "bank/a.png": "https://x/a", "bank/b.png": "https://x/b" };

  it("typesets an option's ref in place of its picture, and keeps a picture with no ref", () => {
    const el = html(
      <OptionList options={pictured} imageUrls={urls} showCorrect={false} variant="print"
        renderQuran={(r, _f, where) => <b data-where={where}>{r.surah}:{r.from_ayah}</b>} />,
    );
    const items = el.querySelectorAll("li");
    expect(items[0].querySelector("img")).toBeNull();
    expect(items[0].querySelector("b")?.getAttribute("data-where")).toBe("option");
    expect(items[1].querySelector("img")?.getAttribute("src")).toBe("https://x/b");
  });

  it("gives a plain option the weight of the Arabic ones beside it, and leaves an all-text list alone", () => {
    const mixed = html(
      <OptionList options={[...pictured, { text: "None of the above", image: null, correct: false }]} imageUrls={urls}
        showCorrect={false} variant="print" renderQuran={(_r, f) => f} />,
    );
    const plain = mixed.querySelectorAll(".exam-q-option-plain");
    expect(plain).toHaveLength(1);
    expect(plain[0].textContent).toBe("None of the above");
    const text = html(<OptionList options={options} imageUrls={{}} showCorrect={false} variant="print" />);
    expect(text.querySelector(".exam-q-option-plain")).toBeNull();
  });

  it("falls back to the option's picture when the words are not there", () => {
    const el = html(<OptionList options={pictured} imageUrls={urls} showCorrect={false} variant="print" renderQuran={(_r, f) => f} />);
    expect(el.querySelectorAll("img")).toHaveLength(2);
  });
});

describe("QuranSnippet on part of an ayah", () => {
  const word = (ayah: number, position: number, isEnd = false) => ({
    surah: 54, ayah, position, text: isEnd ? "٣" : `w${position}`, glyph: `g${position}`, isEnd, page: 529, line: 3,
  });

  it("names no surah or ayah, and has no rosette unless the range reaches it", () => {
    for (const size of ["option", "passage"] as const) {
      const part = html(<QuranSnippet words={[word(3, 5), word(3, 6)]} variant="print" size={size} />);
      const root = part.querySelector("[aria-label]")!;
      expect(root.getAttribute("aria-label")).toMatch(/^Qur'an words/);
      expect(root.getAttribute("aria-label")).not.toMatch(/Surah/);
      expect(part.textContent).not.toContain("g7");
      expect(part.textContent).not.toContain("﴿");
    }
    const toEnd = html(<QuranSnippet words={[word(3, 6), word(3, 7, true)]} variant="print" size="option" />);
    expect(toEnd.textContent).toContain("g7");
    expect(toEnd.querySelector("[aria-label]")!.getAttribute("aria-label")).toMatch(/^Qur'an words/);

    const whole = html(<QuranSnippet words={[word(3, 1), word(3, 2, true)]} variant="print" />);
    expect(whole.querySelector("[aria-label]")!.getAttribute("aria-label")).toBe("Surah 54, ayah 3");
  });

  it("sets an option at the option text's size, not scaled to the box", () => {
    const el = html(<QuranSnippet words={[word(3, 5), word(3, 6)]} variant="print" size="option" />);
    const root = el.querySelector(".quran-snippet--option") as HTMLElement;
    expect(root.style.fontSize).toBe("17pt");
    expect(root.style.display).toBe("inline-block");
  });
});

describe("a bare Arabic term in an English prompt", () => {
  it("is set in the UI's Arabic face, while a vowelled ayah stays Qur'an", () => {
    const term = html(<QuestionPrompt prompt="What does هاء التنبيه mean?" images={[]} imageUrls={{}} variant="print" />);
    expect(term.querySelector("[lang=ar]")!.className).toContain("ar-ui");
    expect(term.querySelector(".ar-quran")).toBeNull();
    const ayah = html(<QuestionPrompt prompt="Which rule is in رَحْمَة here?" images={[]} imageUrls={{}} variant="print" />);
    expect(ayah.querySelector("[lang=ar]")!.className).toContain("ar-quran");
  });
});
