import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OptionList, QuestionPrompt } from "./question-prompt";

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

  it("puts the typeset slot in place of the pictures", () => {
    const el = html(
      <QuestionPrompt prompt="Q" images={["bank/a.png"]} imageUrls={{ "bank/a.png": "u" }} quranSlot={<b>ayah</b>} variant="screen" />,
    );
    expect(el.querySelectorAll("img")).toHaveLength(0);
    expect(el.querySelector("b")?.textContent).toBe("ayah");
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
});
