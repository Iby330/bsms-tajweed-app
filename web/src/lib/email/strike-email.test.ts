import { describe, expect, it } from "vitest";
import {
  issuedDay, issuedHtml, issuedSubject, issuedText, removedHtml, removedSubject, removedText,
  standingLine, type StrikeMail,
} from "./strike-email";

const mail = (o: Partial<StrikeMail> = {}): StrikeMail => ({
  firstName: "Maryam",
  reason: "homework",
  issuedAt: "2026-10-19T17:30:00Z",
  count: 1,
  teacher: { fullName: "Wala Mussa", section: "sisters" },
  ...o,
});

describe("issued email", () => {
  it("counts the strike against the three in the subject", () => {
    expect(issuedSubject(mail({ count: 1 }))).toBe("You've received a strike: 1 of 3 this term");
    expect(issuedSubject(mail({ count: 3 }))).toBe("You've received a strike: 3 of 3 this term");
  });

  it("drops 'of 3' once past the limit, where it reads as an error", () => {
    expect(issuedSubject(mail({ count: 4 }))).toBe("You've received a strike: 4 this term");
  });

  it("names the teacher, the reason and the UK day", () => {
    const t = issuedText(mail());
    expect(t).toContain("Ustadha Wala has given you a strike for missed homework on 19 October.");
    expect(issuedText(mail({ teacher: null, reason: "absence" })))
      .toContain("Your teacher has given you a strike for an absence");
  });

  it("escalates the standing line with the count", () => {
    expect(standingLine(1)).toMatch(/Two more/);
    expect(standingLine(2)).toMatch(/One more/);
    expect(standingLine(3)).toMatch(/leaving the course\. Your teacher will be in touch/);
  });

  it("never carries the teacher's note: there is no field for one", () => {
    const withNote = { ...mail(), note: "Talking during recitation" } as StrikeMail;
    expect(issuedHtml(withNote)).not.toContain("Talking during recitation");
    expect(issuedText(withNote)).not.toContain("Talking during recitation");
  });

  it("escapes the student's name in the HTML", () => {
    expect(issuedHtml(mail({ firstName: "<b>x</b>" }))).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("links to the home page, where the strikes box is", () => {
    expect(issuedHtml(mail())).toContain('href="https://www.bsmstajweed.com/home"');
  });
});

describe("removed email", () => {
  it("says which strike went and what is left", () => {
    expect(removedSubject()).toBe("A strike has been removed");
    const t = removedText(mail({ count: 0, reason: "absence" }));
    expect(t).toContain("Ustadha Wala has taken back the strike for an absence from 19 October.");
    expect(t).toContain("Strikes this term: 0 of 3");
    expect(t).toContain("You have no strikes this term.");
    expect(removedHtml(mail({ count: 0 }))).toContain("Strike removed");
  });
});

describe("house style", () => {
  it("has no em dashes anywhere a student reads", () => {
    for (const n of [0, 1, 2, 3, 4]) {
      for (const s of [issuedSubject(mail({ count: n })), issuedText(mail({ count: n })), issuedHtml(mail({ count: n })),
        removedText(mail({ count: n })), removedHtml(mail({ count: n }))]) {
        expect(s).not.toContain("—");
      }
    }
  });
});

describe("issuedDay", () => {
  it("is the UK day, not the server's UTC one", () => {
    // 23:30 UTC on 1 Aug is 00:30 on 2 Aug in London (BST).
    expect(issuedDay("2026-08-01T23:30:00Z")).toBe("2 August");
  });
  it("is null for nothing usable", () => {
    expect(issuedDay(null)).toBeNull();
    expect(issuedDay("not a date")).toBeNull();
  });
});
