import Link from "next/link";
import { CLOSES_LABEL, feeLabel, VENUE } from "@/lib/applications/form";
import TajweedHeroPlayer from "@/components/landing/tajweed/TajweedHeroPlayer";
import { FULL_VERSE } from "@/lib/tajweed/maidah95";
import { TIMELINE } from "@/lib/tajweed/timeline";
import HifdhProjection from "@/components/landing/HifdhProjection";
import Reveal from "@/components/landing/Reveal";
import CountUp from "@/components/landing/CountUp";
import TestimonialRail, { type Testimonial } from "@/components/landing/TestimonialRail";
import SectionRail, { type RailItem } from "@/components/landing/SectionRail";

/* In `?shot=1` the hero is posed rather than played: headless Chrome produces
   almost no animation frames, so an unposed capture is always the empty first
   frame. Just after the first landing: the ball on يَـٰٓأَيُّهَا with its madd
   lit red — the most representative single frame of the piece. Derived from
   the timeline so it survives any change to the beats or the frame rate. */
const SHOT_FRAME = TIMELINE.sections[0].beats[0].land + 4;

/**
 * The landing page. Rendered at `/` — the first thing anyone sees on the
 * domain — and also at `/preview/landing`, which keeps the `?shot` lens for
 * screenshots while the design is being worked on.
 *
 * It replaced the splash that used to live at `/`. Note what changed with it:
 * the proxy no longer forwards a signed-in visitor from `/` to `/home`, so
 * students and teachers now land here too rather than on their dashboard. The
 * way back into the app is the Sign in link in the nav.
 *
 * ── The type system ────────────────────────────────────────────────────────
 * Helvetica Neue for everything a student reads, Fraunces Light for the things
 * that sell. That pairing is the whole visual argument: a light display serif
 * against a grotesque, with the house device of a roman clause and an italic
 * one inside the same headline.
 *
 * It is confined to marketing. `--font-heading` still points at the sans, so no
 * screen inside the product moves. A visitor here owes the programme nothing
 * and has to be held; a student who is already in does not.
 *
 * ── Colour ─────────────────────────────────────────────────────────────────
 * One continuous navy ground the whole way down with the تجويد wordmark laid
 * in behind it, lavender as ink, and every box a sheet of lavender paper
 * sitting ON that ground rather than a darker panel sunk into it.
 *
 * That inversion has a consequence worth stating: inside a card the colours
 * are the LIGHT-mode ones. Muted text, hairlines and sage all have to be
 * repainted there — the dark-ground values simply vanish on lavender, and
 * sage in particular has to drop to sage-700 to be legible at all.
 *
 * Values are written out rather than read from the theme tokens on purpose:
 * this is one fixed composition and must not follow a visitor's scheme into
 * one nobody designed.
 *
 * Sage is kept for what the eye must be sent to: the "Apply to join" buttons,
 * the deadline and a due date. Nothing decorative gets it.
 *
 * ── Type, and where it parts from the brand system ─────────────────────────
 * docs/brand-system.md settles Helvetica Neue as the brand face everywhere.
 * The serif here is a deliberate exception, asked for and confined to these
 * marketing pages. If that is ever reversed, this file is the only place that
 * has to change.
 */

const NAV = [
  { href: "#course", label: "What you learn" },
  { href: "#week", label: "How it runs" },
  { href: "#questions", label: "Questions" },
];

const WEEK = [
  {
    n: "01",
    title: "Tajweed lesson",
    body: `In person at ${VENUE}, with a teacher who hears you read. Attendance is recorded at every session.`,
  },
  {
    n: "02",
    title: "Memorisation lesson",
    body: "Your portion recited back to a teacher who hears it, and the revision that follows written down rather than left to memory.",
  },
  {
    n: "03",
    title: "Homework",
    body: "Set weekly and done in your own time, on interactive worksheets designed to help you learn the rule and make it stick.",
  },
  {
    n: "04",
    title: "Marked and reviewed in the next session",
    body: "You get a mark and feedback written for you, so you know both where you stand and exactly what to do about it.",
  },
];

/**
 * ⚠️ TWO OF THESE ARE UNVERIFIED and are the most persuasive lines on the page.
 * "Classes are set by level" and the beginners' class starting from the letters
 * are mine, not the programme's. Confirm both with a teacher or cut them: a
 * page that overpromises on the entry level produces applicants who leave in
 * week three, which is the exact failure the rest of this page argues against.
 */
const QUESTIONS = [
  {
    q: "I have never read Arabic before.",
    a: "Then you are who this is for. Classes are set by level and the beginners' class starts from the letters themselves. Nobody is put in front of a verse they cannot read.",
  },
  {
    q: "I do not have the time.",
    a: "Two evenings a week, and every date for the whole year is published before you apply, so you can put it against your timetable rather than find out in March.",
  },
  {
    q: `Is ${feeLabel()} really the whole cost?`,
    a: "Yes, for the full year. One payment, not a termly or monthly charge. The one thing to bring yourself is your own copy of the Qur'an. The only time anyone pays again is to rejoin after being removed for three strikes in a term.",
  },
  {
    q: "I have started something like this before and stopped.",
    a: "So have most people here. Attendance is taken every session and homework is marked, so a slip is noticed in week two rather than week eight, and an absence without a valid reason earns a strike, which keeps everyone turning up.",
  },
  {
    /* The strike rule, stated as the programme runs it (and as the
       application's terms put it): an unexcused absence is a strike, three in
       a term ends your place, and the count resets each term. Never soften
       this to "it is fine" anywhere on the page. */
    q: "What if I miss a class?",
    a: "Things come up during a degree, and an absence with a valid reason is understood, as long as you let your teacher know in advance. Without one, a missed class earns a strike. Three strikes in a term and you lose your place on the course. Strikes reset at the start of each term.",
  },
  {
    q: "Is it for brothers or sisters?",
    a: "Both, taught separately and on different evenings, each with their own teachers.",
  },
];

/**
 * Student testimonials.
 *
 * Every `line` is the student's own words, lifted from the captions burned
 * into their video — never a paraphrase. A quote that the video does not
 * actually contain is the one thing a visitor can check and catch.
 *
 * The files in /public/testimonials are 4:5 crops of the 9:16 originals,
 * which live in the git-ignored testimonials-incoming/ at the repo root (this
 * repo is public; raw footage never goes in it). Wala's is the exception: a
 * graphic with text top to bottom, so it is fitted into 4:5 on its own pink
 * (#EDD5D8) instead of cropped. Posters matter more than
 * usual: the video is NOT autoplayed, so the poster is what sells the click.
 *
 * `detail` is as of filming, September 2025 — a year count goes stale.
 */
const TESTIMONIALS: readonly Testimonial[] = [
  {
    name: "Nadir",
    detail: "Brothers · three years in",
    line: "Two years ago, I didn't even know the alphabet.",
    src: "/testimonials/nadir.mp4",
    poster: "/testimonials/nadir.jpg",
  },
  {
    name: "Sajeda",
    detail: "Sisters · one year in",
    line: "It meant I had a reason to regularly read the Qur'an.",
    src: "/testimonials/sajeda.mp4",
    poster: "/testimonials/sajeda.jpg",
  },
  {
    name: "Shayir",
    detail: "Brothers · graduate, now working",
    line: "Is it the best use of my time? I can 100% say wholeheartedly, it was.",
    src: "/testimonials/shayir.mp4",
    poster: "/testimonials/shayir.jpg",
  },
  {
    name: "Wala",
    detail: "Sisters · one year in",
    line: "Small and consistent steps do go a long way.",
    src: "/testimonials/wala.mp4",
    poster: "/testimonials/wala.jpg",
  },
  {
    name: "Zaid",
    detail: "Brothers",
    line: "You just need to show up. Everything is put together.",
    src: "/testimonials/zaid.mp4",
    poster: "/testimonials/zaid.jpg",
  },
  {
    name: "Abir",
    detail: "Brothers · four years in",
    line: "It's kept me grounded, it's given me routine and structure.",
    src: "/testimonials/abir.mp4",
    poster: "/testimonials/abir.jpg",
  },
];

/**
 * Us against the thing people actually do instead.
 *
 * The competitor is never another course — it is YouTube, an app, and "I'll
 * get round to it". That is the free default, and a page that does not name it
 * leaves the visitor to make the comparison themselves, badly, later.
 *
 * Every row is a cross on your own and a tick here, so each one has to be
 * something the free route genuinely cannot give you. That is why cost is not
 * a row: free is cheaper, and a cross against it would be the one row a reader
 * knows is false. The price is argued further down, where it can be.
 */
/* Seven rows is what fits one laptop screen under the heading; an eighth
   pushes the table below the fold at 1440×900. */
const COMPARISON: readonly string[] = [
  "Someone hears you recite",
  "Your mistakes corrected",
  "A proven, structured syllabus",
  "Accountability",
  "A teacher you can ask directly",
  "A strict schedule for progress",
  "A supportive community",
];

/* Tick and cross for the comparison. Drawn, not typed: ✓ and ✗ differ in
   weight and size from font to font, and these have to sit as a pair. */
const TICK = (
  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="currentColor" />
    <path d="M7 12.4l3.2 3.2L17 8.8" fill="none" stroke="#00004D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CROSS = (
  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
    <circle cx="12" cy="12" r="10.3" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/* The side progress rail, in page order. Every id here is on a section below;
   a missing one just drops its dot. */
const RAIL: readonly RailItem[] = [
  { id: "top", label: "Top" },
  { id: "why", label: "Why a teacher" },
  { id: "course", label: "What you learn" },
  { id: "hifdh", label: "Your hifdh" },
  { id: "proof", label: "Not the first" },
  { id: "students", label: "Students" },
  { id: "how", label: "How it works" },
  { id: "week", label: "A week" },
  { id: "app", label: "The app" },
  { id: "covers", label: `What ${feeLabel()} covers` },
  { id: "questions", label: "Questions" },
  { id: "apply", label: "Apply" },
];

const INCLUDED = [
  "Two taught evenings a week",
  "Weekly homework, marked",
  "Weekly reflections",
  "In-person teaching",
  "Hifdh tracking and revision dates",
  "A teacher you can ask directly",
  "Termly events",
  "An end-of-year ceremony, with awards",
  "A room full of Muslims your own age",
  "Company that keeps you on it",
  "Lessons to watch back",
];

/**
 * `?shot=1` shrinks the hero from a full viewport to a fixed band, and poses
 * the animation on one frame (SHOT_FRAME) instead of playing it.
 *
 * It exists because a headless screenshot captures the viewport, not the page,
 * and ignores a `#fragment` — so with a 100dvh hero every capture came back as
 * a navy rectangle whatever height it was given. It is a lens for looking at
 * the page while it is being designed, on a preview route, and it disappears
 * with the route.
 */
export default function LandingPage({ shot = false }: { shot?: boolean }) {
  return (
    <main className={shot ? "lp lp-shot" : "lp"}>
      <style>{CSS}</style>

      {/* Decorative only — the wordmark is already read out in the nav and the
          footer, so this one is hidden from assistive tech rather than said a
          third time. */}
      <div className="lp-markbg" aria-hidden="true" />

      <SectionRail items={RAIL} />

      <header className="lp-nav">
        {/* The real wordmark, as a mask filled with the ink colour — the same
            technique the app uses for the rail mark, so it recolours with the
            palette instead of carrying a background of its own. */}
        <Link href="/" className="lp-logo" aria-label="BSMS Tajweed, home" />
        <nav className="lp-navlinks">
          {NAV.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
          <Link href="/login">Sign in</Link>
          <Link href="/apply" className="lp-btn lp-btn-light lp-btn-apply">
            Apply to join
          </Link>
        </nav>
      </header>

      {/* Screen one is the verse and the headline, nothing else. The four
          figures that used to share it now open onto the programme below. */}
      <div id="top" className="lp-screen lp-screen-top">
        {/* The ayah, walked rule by rule. The animation is aria-hidden and
            silent, so the verse is also given here as real text: a screen
            reader gets the words at once instead of a 41-second animation it
            cannot see. */}
        <div className="lp-hero">
          <TajweedHeroPlayer fit="fill" frame={shot ? SHOT_FRAME : undefined} />
          <p className="lp-sr" lang="ar" dir="rtl">
            {FULL_VERSE}
          </p>
        </div>

        {/* DRAFT COPY — written to the page's voice so the layout can be judged
            with real words in it. Replace with the programme's own line. */}
        <div className="lp-intro">
          <h1>
            Recite the Qur&apos;an <em>the way it was revealed.</em>
          </h1>
          <p>
            Weekly tajweed and hifdh classes for every level, from your first rule
            to a complete recitation.
          </p>
          <div className="lp-intro-actions">
            <Link href="/apply" className="lp-btn lp-btn-light lp-btn-apply">
              Apply to join
            </Link>
            <a href="#course" className="lp-intro-link">
              What you learn
            </a>
          </div>
        </div>

      </div>

      {/* ── The journey ──────────────────────────────────────────────────────
          The page is one argument, told in this order, and each section hands
          the reader to the next:
            1. hero       — this is for me
            2. problem    — "that is exactly me" (this section)
            3. outcome    — what you leave with, and the two-juz chart
            4. proof      — 100+ students, then their own faces, then a nudge
                            to apply for the reader who is already sold
            5. how        — what it asks of you, a week, the app
            6. offer      — what the fee covers
            7. objections — the questions
            8. the ask
          Moving a section breaks the hand-offs in its first paragraph; re-read
          the neighbours before reordering.

          The problem comes first because nobody wants a solution to a problem
          they have not been reminded they have. The free route is the real
          competitor, so it is named, not hinted at. */}
      <section id="why" className="lp-band">
        <div className="lp-head">
          <span className="lp-label">Why a teacher</span>
          <h2>
            Learn in the way <em>of the scholars.</em>
          </h2>
          <p>
            On your own, you never really know whether you are saying it right.
            A teacher does: they hear every letter, correct it before it sets
            in, and notice when you slip. That is how the Qur&apos;an has always
            been passed on, from teacher to student.
          </p>
        </div>

        <Reveal>
        <table className="lp-cmp">
          <thead>
            <tr>
              <th scope="col">
                <span className="lp-sr">Compared</span>
              </th>
              <th scope="col">On your own</th>
              <th scope="col">BSMS Tajweed</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map((row) => (
              <tr key={row}>
                <th scope="row">{row}</th>
                <td className="lp-cmp-alone">
                  {CROSS}
                  <span className="lp-sr">No</span>
                </td>
                <td className="lp-cmp-here">
                  {TICK}
                  <span className="lp-sr">Yes</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </Reveal>
      </section>

      {/* The answer to the problem above, as outcomes: what you leave with.
          The chart that follows makes the hifdh half concrete. */}
      <section id="course" className="lp-band">
        <div className="lp-head">
          <span className="lp-label">What you learn</span>
          <h2>
            Two things, <em>taught in person.</em>
          </h2>
          <p>
            Tajweed, so each letter comes out the way it was revealed. Hifdh, so
            more of the Qur&apos;an stays with you. Both with a teacher in the
            room, every week of the year.
          </p>
        </div>

        <div className="lp-two">
          <article className="lp-card">
            <h3>Tajweed rules</h3>
            <p className="lp-muted">
              Perfecting your Qur&apos;an recitation with the rules derived from
              its revelation.
            </p>
          </article>

          <article className="lp-card">
            <h3>Hifdh</h3>
            <p className="lp-muted">
              Start or continue your hifdh, in a structured and supportive
              format.
            </p>
          </article>
        </div>

      </section>

      {/* Two juz, and how they add up. */}
      <section id="hifdh" className="lp-band lp-band-marquee">
        <HifdhProjection />
      </section>

      {/* The "you would not be the first" beat — what an awards row does on a
          commercial page, done with the only currency that means anything to a
          student: how many people like them already did it, and for how long.

          Two figures, not four. The practical stat row further down carries
          four, and repeating that shape would read as filler; this one is
          fewer, larger and making a single point. */}
      <section id="proof" className="lp-band">
        <div className="lp-head lp-head-mid">
          <span className="lp-label">Not the first</span>
          <h2>
            Over a hundred students <em>have already done this.</em>
          </h2>
          <p>
            A system that has built real students for six years and counting.
            Every one of them stood where you are now, weighing it up. The year
            passes either way; the ones who took the leap have something to
            show for it.
          </p>
        </div>

        <Reveal>
          <div className="lp-figures">
            <div>
              <strong>
                <CountUp value={100} suffix="+" />
              </strong>
              <span>Students taught</span>
            </div>
            <div>
              <strong>
                <CountUp value={6} suffix=" years" />
              </strong>
              <span>Running, without a gap</span>
            </div>
          </div>
        </Reveal>
      </section>

      <section id="students" className="lp-band">
        <div className="lp-head lp-head-mid">
          <span className="lp-label">From the people doing it</span>
          <h2>
            Ask someone who was <em>where you are now.</em>
          </h2>
        </div>

        {/* The first ask since the hero, for the reader the proof has already
            convinced. Everything after this is for the reader still deciding;
            neither should have to scroll past the other to act. It rides in
            the arrows' row so it lands on the same screen as the faces. */}
        <Reveal>
        <TestimonialRail
          items={TESTIMONIALS}
          aside={
            <div className="lp-midcta">
              <Link href="/apply" className="lp-btn lp-btn-light lp-btn-apply">
                Apply to join
              </Link>
              <p className="lp-muted">
                {feeLabel()} for the year · Sign-ups close {CLOSES_LABEL}
              </p>
            </div>
          }
        />
        </Reveal>
      </section>

      {/* The start of "how", right after the proof: they did it, and this is
          what it asked of them. Three boxes, deliberately not a feature list —
          each answers a question a visitor is actually asking (what do I do,
          what am I turning up to, and what stops me drifting). The week and
          the app below zoom in on boxes two and three. */}
      <section id="how" className="lp-band">
        <div className="lp-head">
          <span className="lp-label">How it works</span>
          <h2>
            Here is <em>what it asks of you.</em>
          </h2>
        </div>

        <Reveal>
        <div className="lp-three">
          <article className="lp-card">
            <span className="lp-step">01</span>
            <h3>Apply</h3>
            <p className="lp-muted">
              One form and your university email. {feeLabel()} once, covering the
              whole year, with payment details following by email.
            </p>
          </article>
          <article className="lp-card">
            <span className="lp-step">02</span>
            <h3>Turn up</h3>
            <p className="lp-muted">
              Two evenings a week at {VENUE}: one for tajweed, one for
              memorisation, each with a teacher who hears you read.
            </p>
          </article>
          <article className="lp-card">
            <span className="lp-step">03</span>
            <h3>Stay consistent</h3>
            <p className="lp-muted">
              Homework set weekly and marked, attendance taken every session, and
              your progress recorded rather than remembered.
            </p>
          </article>
        </div>
        </Reveal>
        {/* The four figures that answer the first practical questions, with
            the commitment they describe. */}
        <section className="lp-stats" aria-label="At a glance">
        <div>
          <strong>{feeLabel()}</strong>
          <span>Once, for the whole year</span>
        </div>
        <div>
          <strong>Two evenings</strong>
          <span>Every week, tajweed and hifdh</span>
        </div>
        <div>
          <strong>Three terms</strong>
          <span>October to May, with breaks</span>
        </div>
        <div>
          <strong>No experience</strong>
          <span>Classes are set by level</span>
        </div>
        </section>
      </section>

      <section id="week" className="lp-band">
        <div className="lp-head-row">
          <div className="lp-head">
            <span className="lp-label">How a week works</span>
            <h2>
              Someone notices <em>before you drift.</em>
            </h2>
            <p>
              The same shape of week for six years, because it works. Two
              lessons, homework in between, and a register, so if you miss one,
              somebody asks where you were.
            </p>
          </div>
          <p className="lp-note">Two lessons every week</p>
        </div>

        <ol className="lp-steps">
          {WEEK.map((s) => (
            <li key={s.n}>
              <span className="lp-num">{s.n}</span>
              <h3>{s.title}</h3>
              <p className="lp-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="app" className="lp-band lp-split">
        <div className="lp-head">
          <span className="lp-label">The app</span>
          <h2>
            Your whole year, <em>in one place.</em>
          </h2>
          <p>
            Do your homework, see your feedback, watch a lesson back, track
            what you have memorised and revise alongside the rest of your
            class. It tells you what is due and nudges you when it is.
          </p>
          <p>
            Everything else means a video in one place, a form in another and a
            spreadsheet you were never sent. One login, and your teacher is
            looking at the same screen you are.
          </p>
        </div>

        {/* A drawing of the app, not a screenshot: one panel standing in for
            the week — what is due, what came back, and where you are. */}
        <div className="lp-card lp-demo" aria-hidden="true">
          <div className="lp-demo-top">
            <h3>This week</h3>
            <span className="lp-label">Term 1 · Week 7</span>
          </div>

          <div className="lp-rows">
            <div>
              <span className="lp-label">Homework</span>
              <strong>Ikhfaa · 12 questions</strong>
              <em className="lp-due">Due Friday</em>
            </div>
            <div>
              <span className="lp-label">Feedback</span>
              <strong>Ghunnah · 84%</strong>
              <em>A note from your teacher</em>
            </div>
            <div>
              <span className="lp-label">Memorised</span>
              <strong>Juz &apos;Amma</strong>
              <em>14 of 23 pages</em>
            </div>
          </div>

          <div className="lp-bar">
            <div style={{ width: "61%" }} />
          </div>
        </div>
      </section>

      {/* The price sits HERE, and the position is the argument.
          It lands after the problem, the proof and the how — so what a visitor
          weighs it against is "free, and almost nobody finishes" and a room of
          people who did, rather than nothing at all. */}
      <section id="covers" className="lp-band">
        <div className="lp-included">
          <div className="lp-head lp-head-dark">
            <span className="lp-label">What {feeLabel()} covers</span>
            <h2>
              All of it. <em>One fee, for the whole year.</em>
            </h2>
          </div>
          <ul>
            {INCLUDED.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      </section>

      <section id="questions" className="lp-band">
        <div className="lp-head lp-head-mid">
          <span className="lp-label">Before you apply</span>
          <h2>
            The things people ask <em>before they sign up.</em>
          </h2>
        </div>
        {/* Native <details>, not a scripted accordion: it opens without
            JavaScript, it is keyboard-operable and announced correctly for
            free, and the browser's own find-in-page can open a closed one. */}
        <div className="lp-qs">
          {QUESTIONS.map((q) => (
            <details key={q.q}>
              <summary>
                <h3>{q.q}</h3>
                <span className="lp-plus" aria-hidden="true" />
              </summary>
              <p className="lp-muted">{q.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* The last screen holds the ask and the footer together: nobody wants a
          viewport of footer, and the footer is where a visitor who scrolled
          past the CTA lands. */}
      <div className="lp-screen lp-screen-end">
      <section id="apply" className="lp-band lp-apply">
        <div className="lp-head">
          <h2>
            {feeLabel()} once, <em>for the whole year.</em>
          </h2>
          <p>
            Apply with your university email. Payment details follow by email,
            and your place is held while that is arranged.
          </p>
          <p className="lp-deadline">
            Sign-ups close <mark>{CLOSES_LABEL}</mark>
          </p>
        </div>
        <div className="lp-cta">
          <Link href="/apply" className="lp-btn lp-btn-dark lp-btn-apply">
            Apply to join
          </Link>
          <Link href="/login" className="lp-btn lp-btn-outline">
            Sign in
          </Link>
          <p className="lp-muted lp-fine">
            Already on the course? Sign in, or speak to your teacher if you need
            a login.
          </p>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-foot-top">
          <div className="lp-foot-brand">
            <span className="lp-logo lp-logo-lg" role="img" aria-label="BSMS Tajweed" />
            <p>
              Tajweed and Qur&apos;an memorisation for the Brighton Sussex
              Muslim Students programme.
            </p>
          </div>
          <div className="lp-foot-cols">
            <div>
              <span className="lp-label">The course</span>
              <a href="#course">What you learn</a>
              <a href="#week">How a week works</a>
              <a href="#questions">Questions</a>
            </div>
            <div>
              <span className="lp-label">Students</span>
              <Link href="/apply">Apply to join</Link>
              <Link href="/login">Sign in</Link>
            </div>
            <div>
              <span className="lp-label">Where</span>
              <p>{VENUE}</p>
              <p>Brighton</p>
            </div>
          </div>
        </div>
        <div className="lp-foot-base">
          <span>bsmstajweed.com</span>
          <span>Brighton Sussex Muslim Students</span>
        </div>
      </footer>
      </div>
    </main>
  );
}

/* The page runs dark, so every role flips: navy is the ground, lavender is the
   ink, and the panel sits a step DEEPER than the ground rather than lighter.
   These are the brand's dark-mode tokens, written out for the same reason as
   before — one fixed composition that must not follow a visitor's scheme. */
const NAVY = "#00004D"; /* ground */
const LAVENDER = "#E5E5FF"; /* ink */
const RULE = "#1E397A"; /* navy-700, every hairline */
const MUTED = "#AAAABF"; /* lavender-300, 8.3:1 on navy */
const SAGE = "#B2C58C"; /* reads as text on navy at 10.17:1 */
const PAPER_RULE = "#C8C8DC"; /* hairlines on a light panel */
const PAPER_MUTED = "#58586D"; /* muted text on a light panel, 5.6:1 */
const PAPER_SAGE = "#404D1F"; /* sage-700 — sage only reads on lavender this dark, 7.39:1 */

const CSS = `
.lp {
  --display: var(--font-fraunces), Georgia, "Times New Roman", serif;
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  interpolate-size: allow-keywords;
  position: relative;
  isolation: isolate;
  background: ${NAVY};
  color: ${LAVENDER};
  font-family: "Helvetica Neue", Helvetica, Arial, "Liberation Sans", sans-serif;
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}
.lp :is(h1, h2, h3) { margin: 0; font-weight: 300; font-family: var(--display); letter-spacing: -0.02em; }
.lp p { margin: 0; }
.lp em { font-style: italic; }

/* ── One screen, one thought ──────────────────────────────────────────────
   Every section fills the viewport, so when the page settles you are looking
   at exactly one of them and nothing else.

   There is NO scroll snapping. It was proximity snapping with
   scroll-snap-stop: always on every section, and readers found it too
   magnetic: every flick was caught and parked at the next section, however
   hard they swiped. The sections still fill a screen each, so the page keeps
   its one-idea-per-screen rhythm; the side progress rail (SectionRail) does
   the "where am I" job snapping used to imply. */
html {
  scroll-behavior: smooth;
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }

.lp-screen, .lp-band {
  min-height: 100dvh;
}
.lp-screen { display: flex; flex-direction: column; }

/* ── The progress rail (SectionRail) ──────────────────────────────────── */
/* The nav itself is the touch target: padded into a capsule far wider than
   the dots, so a thumb anywhere on it reaches the nearest one. touch-action
   none hands the drag to the rail instead of scrolling the page, which is
   what makes press-and-slide scrubbing possible. */
.lp-srail {
  position: fixed;
  right: max(6px, env(safe-area-inset-right, 0px));
  top: 50%;
  transform: translateY(-50%);
  z-index: 5;
  padding: 12px 8px;
  border-radius: 999px;
  opacity: 0;
  pointer-events: none;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  cursor: pointer;
  transition: opacity 300ms ease, background 200ms ease, box-shadow 200ms ease;
}
.lp-srail[data-on] { opacity: 1; pointer-events: auto; }
/* Held: the capsule appears behind the dots, as the home-screen dots do. */
.lp-srail[data-scrub] {
  background: rgb(10 10 94 / 0.78);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  box-shadow: 0 0 0 1px ${RULE};
}
.lp-srail[data-scrub] .lp-srail-dot::before { transform: scale(1.25); }
.lp-srail[data-scrub] a[aria-current] .lp-srail-dot::before { transform: scale(1.8); }
.lp-srail ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; position: relative; }
/* The track, and the sage fill over it. Both run through the dots' centres:
   each dot box is 11px wide and right-aligned, so its centre is 5px in. */
.lp-srail ol::before, .lp-srail ol::after {
  content: "";
  position: absolute;
  right: 5px;
  top: 6px;
  width: 1px;
}
.lp-srail ol::before { bottom: 6px; background: ${RULE}; }
.lp-srail ol::after { height: calc((100% - 12px) * var(--p, 0)); background: ${SAGE}; transition: height 400ms ease; }
.lp-srail a { position: relative; display: flex; align-items: center; justify-content: flex-end; height: 12px; text-decoration: none; }
.lp-srail-dot { position: relative; z-index: 1; width: 11px; height: 11px; display: grid; place-items: center; }
.lp-srail-dot::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${NAVY};
  border: 1px solid ${MUTED};
  transition: transform 200ms ease, background 200ms ease, border-color 200ms ease;
}
.lp-srail a[data-done] .lp-srail-dot::before { background: ${SAGE}; border-color: ${SAGE}; }
.lp-srail a[aria-current] .lp-srail-dot::before { background: ${SAGE}; border-color: ${SAGE}; transform: scale(1.45); box-shadow: 0 0 0 3px rgb(178 197 140 / 0.25); }
.lp-srail-label {
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
  color: ${LAVENDER};
  background: ${NAVY};
  border: 1px solid ${RULE};
  border-radius: 999px;
  padding: 4px 10px;
  /* Floats left of the rail rather than widening it. */
  position: absolute;
  right: calc(100% + 18px);
  opacity: 0;
  transform: translateX(6px);
  transition: opacity 180ms ease, transform 180ms ease;
  pointer-events: none;
}
.lp-srail a:hover .lp-srail-label, .lp-srail a:focus-visible .lp-srail-label { opacity: 1; transform: none; }
/* While scrubbing, the section under the finger names itself, on a phone
   too: it is how you know where you will land before letting go. Hover
   labels are held back meanwhile so only that one shows. */
.lp-srail[data-scrub] a:hover .lp-srail-label { opacity: 0; }
.lp-srail[data-scrub] a[aria-current] .lp-srail-label { display: block; opacity: 1; transform: none; }
.lp-srail a:focus-visible { outline: none; }
.lp-srail a:focus-visible .lp-srail-dot::before { box-shadow: 0 0 0 2px ${LAVENDER}; }
/* On a phone: smaller and tighter, tucked into the gutter. Labels show only
   while scrubbing (there is no hover). */
@media (max-width: 720px) {
  .lp-srail { right: max(0px, env(safe-area-inset-right, 0px)); padding: 12px 6px; }
  .lp-srail ol { gap: 9px; }
  .lp-srail a { height: 9px; }
  .lp-srail-dot { width: 9px; height: 9px; }
  .lp-srail ol::before, .lp-srail ol::after { right: 4px; }
  .lp-srail-dot::before { width: 5px; height: 5px; }
  .lp-srail-label { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .lp-srail, .lp-srail ol::after, .lp-srail-dot::before, .lp-srail-label { transition: none; }
}


/* Every band shares one column and one rhythm. Function's pacing is most of
   why it reads unhurried, and it is entirely palette-independent. */
.lp-band {
  width: 100%;
  max-width: 1280px;
  margin-inline: auto;
  padding: clamp(56px, 8vw, 96px) 20px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: clamp(28px, 4vw, 44px);
}

.lp-head { display: flex; flex-direction: column; gap: 18px; max-width: 800px; }
.lp-head h2 { font-size: clamp(2rem, 4.4vw, 3.25rem); line-height: 1.04; }
.lp-head > p { font-size: clamp(1.125rem, 1.7vw, 1.4375rem); line-height: 1.6; color: ${MUTED}; max-width: 42em; }
.lp-head-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 40px; flex-wrap: wrap; }

.lp-label {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: ${MUTED};
}
.lp-muted { color: ${MUTED}; }

/* ── Nav ──────────────────────────────────────────────────────────────── */
/* --safe-top/--safe-bottom: the iPhone clock and home bar. The page runs
   edge to edge under them (viewportFit "cover" in app/layout.tsx), so the
   nav and the footer step clear while the navy ground carries on beneath. */
.lp-nav {
  position: absolute;
  inset: 0 0 auto;
  z-index: 2;
  height: calc(92px + var(--safe-top));
  padding-top: var(--safe-top);
  padding-inline: clamp(20px, 4vw, 80px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: ${LAVENDER};
}
/* The wordmark is a mask filled with the current ink colour, not a picture.
   A PNG of the logo carries its own background and has to be swapped per
   scheme; a mask takes whatever colour it is given, which is how the app's
   rail mark and footer watermark already work. */
.lp-logo {
  display: block;
  flex-shrink: 0;
  width: 62px;
  height: 35px;
  background-color: ${LAVENDER};
  -webkit-mask: url("/brand/logo-mask.png") left center / contain no-repeat;
  mask: url("/brand/logo-mask.png") left center / contain no-repeat;
}
.lp-logo-lg { width: 106px; height: 59px; }
.lp-navlinks { display: flex; align-items: center; gap: clamp(14px, 2vw, 32px); font-size: 0.875rem; }
/* :not(.lp-btn) matters. A bare \`.lp-navlinks a\` is specificity 0,1,1 and beats
   \`.lp-btn-light\` at 0,1,0, so \`color: inherit\` won and painted the button's
   label lavender on a lavender fill — an invisible CTA. */
.lp-navlinks a:not(.lp-btn) { text-decoration: none; color: inherit; }
@media (max-width: 720px) { .lp-navlinks a:not(.lp-btn) { display: none; } }

.lp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9375rem;
  font-weight: 700;
  padding: 14px 26px;
  border-radius: 999px;
  border: 2px solid transparent;
  text-decoration: none;
  min-height: 44px;
}
.lp-btn-light { background: ${LAVENDER}; color: ${NAVY}; padding: 11px 24px; font-size: 0.875rem; }

/* ── The wordmark, laid in behind everything ──────────────────────────── */
/* A regular lattice: one mark, one size, one angle, stepped across and down,
   with alternate rows offset by half a step. That brick bond is what keeps a
   grid this dense from reading as columns while staying perfectly symmetrical
   — the same thing a tiled pattern has done since long before CSS.

   The marks are deliberately larger than the step, so adjacent ones interlock
   rather than sit apart. Spaced marks left visible empty banding between rows,
   because the mark's bounding box carries room its ink does not fill — the
   answer was to overlap the boxes, not to widen the gaps.

   The tile is 1026x1520 and seamless, so background-size has to carry BOTH
   numbers: a square value here stretches the mark and the seam reopens.

   Fixed rather than scrolled, so it behaves like the material the page is
   printed on rather than an image sitting at the top of it. Kept at 5%: the
   brand caps its lattice at 7%, but that is a hairline and this is a filled
   shape, so it sits lower to stay felt rather than seen. */
.lp-markbg {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image: url("/brand/tajweed-tile.png");
  background-repeat: repeat;
  background-size: 1026px 1520px;
  opacity: 0.05;
}
@media (max-width: 860px) {
  .lp-markbg { background-size: 616px 912px; }
}

/* ── Hero ──────────────────────────────────────────────────────────────
   The animation takes whatever height the intro and the stat row leave. It
   positions itself absolutely inside this box and reads the box's shape, so
   the box only has to exist and be sized; it has no content of its own. */
.lp-hero {
  position: relative;
  flex: 1 1 0;
  min-height: 320px;
  /* The nav is absolutely positioned over the top of the page. Starting the
     hero under it rather than behind it keeps the ball's arc clear of the
     links — the arc is the one thing in the piece that rises. */
  margin-top: calc(92px + var(--safe-top));
}
/* On a phone the verse wraps to as many as three lines and the key stacks
   two-up, so the hero needs a fixed, tall share of the screen rather than
   whatever is left over. Sized so the verse, the key, the headline AND its
   button all land on the first screen of a typical handset; on a short one
   the screen simply runs past the fold, which proximity snapping allows. */
@media (max-width: 767px) {
  /* iOS Safari floats its address bar OVER the bottom of the page rather than
     shrinking the viewport, so anything laid out to end at the fold sits under
     it — which is exactly where "Apply to join" was. So on a phone:
       · screen one is the SMALLEST viewport (svh), which does not jump as the
         bar shows and hides;
       · the intro reserves the bar's zone at the bottom (plus the home
         indicator inset where the browser reports one);
       · the hero flexes into whatever is left, capped at the size it had, so
         a tall phone keeps the full verse and a short one gives up a little
         height rather than letting the button slide under the bar. */
  .lp-screen-top { min-height: 100svh; }
  .lp-hero { flex: 1 1 0; height: auto; min-height: 300px; max-height: 122vw; }
  /* Scoped under .lp-screen-top on purpose: the base .lp-intro rule is
     declared further down this stylesheet, and at equal specificity it won —
     silently discarding this padding on every phone. */
  .lp-screen-top .lp-intro { padding: 8px 20px calc(104px + env(safe-area-inset-bottom, 0px)); }
}
/* A short phone (the SE and its like) cannot hold the verse, the key, a
   two-line headline, a three-line subline AND clear the bar. The subline is
   the one thing that is said again lower down, so it is what gives way. */
@media (max-width: 767px) and (max-height: 700px) {
  .lp-screen-top .lp-intro > p { display: none; }
}
.lp-shot .lp-hero { flex: 0 0 560px; }
.lp-shot, .lp-shot .lp-screen, .lp-shot .lp-band { min-height: 0; }

.lp-intro {
  width: 100%;
  max-width: 1280px;
  margin-inline: auto;
  /* With the stat row gone this is the last thing on screen one. The space
     above separates it from the animation's key; the space below keeps it off
     the fold, so the headline sits in the lower third with air on both sides
     instead of being pressed against the bottom edge. */
  padding: clamp(28px, 5vh, 56px) 20px clamp(56px, 11vh, 128px);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
}
.lp-intro h1 { font-size: clamp(1.9rem, 3.4vw, 2.9rem); line-height: 1.05; }
.lp-intro > p { color: ${MUTED}; font-size: clamp(1rem, 1.3vw, 1.125rem); line-height: 1.55; max-width: 38em; }
.lp-intro-actions { display: flex; align-items: center; gap: 22px; margin-top: 6px; flex-wrap: wrap; justify-content: center; }
.lp-intro-link { color: ${LAVENDER}; font-size: 0.875rem; text-decoration: underline; text-underline-offset: 4px; text-decoration-color: ${RULE}; }
.lp-intro-link:hover { text-decoration-color: ${LAVENDER}; }

.lp-sr {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
.lp-btn-dark { background: ${LAVENDER}; color: ${NAVY}; }
.lp-btn-outline { border-color: ${LAVENDER}; color: ${LAVENDER}; }
/* Every "Apply to join" button is sage — the one action the page exists to
   get, in the one colour the eye is sent to. Navy label, per the brand rule
   that a sage fill always carries navy type (10.17:1). Declared after the
   light/dark variants so it wins on colour while they keep their sizing. The
   footer's text link is deliberately left alone: it is navigation, not the ask. */
.lp-btn-apply { background: ${SAGE}; color: ${NAVY}; }
.lp-btn-apply:hover { background: #C7D7AA; } /* sage-200, one step lighter */

/* ── Stat row ─────────────────────────────────────────────────────────── */
.lp-stats {
  width: 100%;
  max-width: 1280px;
  margin-inline: auto;
  padding: clamp(36px, 5vw, 60px) 20px;
  border-bottom: 1px solid ${RULE};
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
}
.lp-stats > div { display: flex; flex-direction: column; gap: 8px; padding-inline: clamp(16px, 3vw, 44px); }
.lp-stats > div + div { border-left: 1px solid ${RULE}; }
.lp-stats > div:first-child { padding-left: 0; }
.lp-stats > div:last-child { padding-right: 0; }
.lp-stats strong { font-family: var(--display); font-weight: 400; font-size: clamp(1.25rem, 2.4vw, 2.125rem); letter-spacing: -0.02em; }
.lp-stats span { font-size: clamp(1rem, 1.3vw, 1.125rem); color: ${MUTED}; line-height: 1.5; }
/* Inside the programme band: the band already supplies the column and its
   gutters, so the row drops its own, and a hairline ABOVE it separates the
   figures from the cards rather than one below closing off the screen. */
.lp-band .lp-stats {
  max-width: none;
  padding: clamp(28px, 4vw, 44px) 0 0;
  border-bottom: 0;
  border-top: 1px solid ${RULE};
}
@media (max-width: 860px) {
  .lp-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px 0; }
  .lp-stats > div:nth-child(odd) { padding-left: 0; border-left: 0; }
}

/* ── Cards ────────────────────────────────────────────────────────────── */
/* ── The comparison ───────────────────────────────────────────────────── */
/* A real <table> with real row headers, not a grid of divs. Three columns of
   related values IS tabular data, and a screen reader announcing "Someone
   hears you recite — on your own, no — BSMS Tajweed, yes" is the whole
   argument; a div grid of icons reads it as a row of unlabelled pictures. */
.lp-cmp { width: 100%; border-collapse: collapse; text-align: left; }
.lp-cmp thead th {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: ${MUTED};
  padding: 0 0 16px;
  border-bottom: 1px solid ${RULE};
}
.lp-cmp thead th:not(:first-child) { text-align: center; }
.lp-cmp tbody th {
  font-weight: 400;
  font-size: clamp(1.0625rem, 1.5vw, 1.25rem);
  color: ${LAVENDER};
}
/* Two narrow icon columns, the same on every width: a tick and a cross fit a
   phone, so the table never has to be restacked into prose. */
.lp-cmp :is(td, thead th:not(:first-child)) { width: clamp(88px, 18%, 180px); }
.lp-cmp td { text-align: center; line-height: 0; }
.lp-cmp td svg { display: inline-block; }
.lp-cmp :is(td, tbody th) { padding: 18px 0; border-bottom: 1px solid ${RULE}; vertical-align: middle; }
.lp-cmp tbody th { padding-right: 16px; }
.lp-cmp-alone { color: ${MUTED}; }
/* The winning column carries the accent, once, on the whole column — this is
   the one place on the page where sage is doing comparison rather than
   decoration. */
.lp-cmp-here { color: ${SAGE}; }
@media (max-width: 720px) {
  .lp-cmp thead th { font-size: 0.6875rem; letter-spacing: 0.12em; }
  .lp-cmp td svg { width: 24px; height: 24px; }
}

/* ── Scroll reveal ────────────────────────────────────────────────────── */
/* The hidden state is applied by JS after mount, never in the markup, so a
   reader without JS sees the page rather than a blank screen. */
.rv { transition: opacity 620ms ease, transform 620ms cubic-bezier(.22,.61,.36,1); }
.rv-hidden { opacity: 0; transform: translateY(18px); }
@media (prefers-reduced-motion: reduce) {
  /* One place decides. The component applies the class freely; this makes it
     mean nothing, so there is no second code path to keep in step. */
  .rv { transition: none; }
  .rv-hidden { opacity: 1; transform: none; }
}

/* Two figures, centred, at display size — the point is the number, so nothing
   else in the band competes with it. */
.lp-figures {
  display: flex;
  justify-content: center;
  gap: clamp(40px, 9vw, 120px);
  flex-wrap: wrap;
  text-align: center;
}
.lp-figures > div { display: flex; flex-direction: column; gap: 8px; }
.lp-figures strong {
  font-family: var(--display);
  font-weight: 300;
  font-size: clamp(3rem, 8vw, 5.5rem);
  line-height: 1;
  letter-spacing: -0.02em;
}
.lp-figures span { font-size: clamp(1.125rem, 1.7vw, 1.5rem); color: ${MUTED}; }

.lp-three { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
@media (max-width: 900px) { .lp-three { grid-template-columns: minmax(0, 1fr); } }

/* The number sits above the title rather than beside it, so all three cards
   start their prose on the same line whatever the title's length. */
.lp-step {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: ${PAPER_MUTED};
}

/* The marquee bleeds to both screen edges, so this band drops the column's
   side padding and keeps only its vertical rhythm. */
.lp-band-marquee { padding-inline: 0; max-width: none; align-items: center; }

/* ── Testimonial videos ───────────────────────────────────────────────── */
.lp-vid { margin: 0; display: flex; flex-direction: column; gap: 16px; }
.lp-vid-player, .lp-vid-slot {
  width: 100%;
  aspect-ratio: 4 / 5;
  border-radius: 24px;
  background: #0A0A5E;
  border: 1px solid ${RULE};
  display: block;
  object-fit: cover;
}
/* The rail. It runs to the band's edge (cancelling the band's 20px gutter) so
   a card slides out of view rather than being clipped mid-page, and the
   scroll-padding puts the gutter back for wherever a card snaps to. Each width
   leaves part of the next card showing — that sliver is the only "swipe me"
   the rail has, so no breakpoint may land on a whole number of cards. */
.lp-rail {
  display: flex;
  gap: 20px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  scroll-padding-inline: 20px;
  margin-inline: -20px;
  padding: 4px 20px;
  scrollbar-width: none;
}
.lp-rail::-webkit-scrollbar { display: none; }
.lp-rail:focus-visible { outline: 2px solid ${LAVENDER}; outline-offset: 4px; border-radius: 8px; }
.lp-rail > .lp-vid { flex: 0 0 78%; scroll-snap-align: start; }
@media (min-width: 640px) { .lp-rail > .lp-vid { flex-basis: calc((100% - 40px) / 2.35); } }
/* Capped by height as well as width: a 4:5 card is taller than it is wide, and
   uncapped on a laptop it pushed the arrows below the fold. 34svh wide is
   42.5svh tall — the section, caption and arrows then fit one screen. */
@media (min-width: 1000px) { .lp-rail > .lp-vid { flex-basis: min(calc((100% - 60px) / 3.3), 34svh); } }
.lp-rail-nav { display: flex; align-items: center; justify-content: space-between; gap: 16px 24px; margin-top: 20px; flex-wrap: wrap; }
.lp-rail-arrows { display: flex; gap: 12px; margin-left: auto; }
/* On a phone the arrows sit centred straight under the videos, where the
   thumb already is, and the Apply ask goes beneath them. */
@media (max-width: 720px) {
  .lp-rail-nav { flex-direction: column-reverse; align-items: center; gap: 20px; }
  .lp-rail-arrows { margin-left: 0; }
  .lp-midcta { flex-direction: column; text-align: center; }
}
.lp-rail-btn {
  width: 48px;
  height: 48px;
  border-radius: 999px;
  border: 1px solid ${LAVENDER};
  background: transparent;
  color: ${LAVENDER};
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}
.lp-rail-btn:hover:not(:disabled) { background: ${LAVENDER}; color: ${NAVY}; }
.lp-rail-btn:disabled { opacity: 0.3; cursor: default; }
.lp-vid figcaption { display: flex; flex-direction: column; gap: 6px; }
.lp-vid figcaption strong {
  font-family: var(--display);
  font-weight: 300;
  font-size: clamp(1.125rem, 1.7vw, 1.375rem);
  line-height: 1.25;
  letter-spacing: -0.02em;
}
.lp-vid figcaption span { font-size: 1rem; }

.lp-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
@media (max-width: 860px) { .lp-two { grid-template-columns: minmax(0, 1fr); } }

/* Every box is lavender. Cards lift OFF the navy rather than sinking into it,
   which means each one carries its own light world: anything inside that was
   painted for the dark ground has to be repainted here, or it disappears. The
   overrides below are that repaint, not decoration. */
.lp-card {
  background: ${LAVENDER};
  color: ${NAVY};
  border: 1px solid ${PAPER_RULE};
  border-radius: 24px;
  padding: clamp(28px, 4vw, 48px);
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.lp-card h3 { font-size: clamp(1.5rem, 2.4vw, 2rem); line-height: 1.1; }
.lp-card p { font-size: clamp(1.0625rem, 1.5vw, 1.25rem); line-height: 1.6; }
.lp-card hr { width: 100%; height: 1px; border: 0; background: ${PAPER_RULE}; margin: 6px 0; }
.lp-card .lp-label, .lp-card .lp-muted { color: ${PAPER_MUTED}; }

/* ── The sticky note ──────────────────────────────────────────────────── */
.lp-note {
  flex-shrink: 0;
  width: 176px;
  background: #BECE99;
  color: ${NAVY};
  font-family: var(--font-note);
  font-weight: 700;
  font-size: 1.3125rem;
  line-height: 1.2;
  padding: 26px 18px;
  text-align: center;
  transform: rotate(-3deg);
}

/* ── Numbered steps ───────────────────────────────────────────────────── */
.lp-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.lp-steps li {
  display: grid;
  grid-template-columns: 80px 320px 1fr;
  gap: 36px;
  align-items: baseline;
  padding: 32px 0;
  border-top: 1px solid ${RULE};
}
.lp-steps li:last-child { border-bottom: 1px solid ${RULE}; }
.lp-steps h3 { font-size: clamp(1.25rem, 1.9vw, 1.625rem); }
.lp-steps p { font-size: clamp(1.0625rem, 1.4vw, 1.1875rem); line-height: 1.6; }
.lp-num { font-family: var(--font-mono); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.2em; color: ${MUTED}; }
@media (max-width: 860px) {
  .lp-steps li { grid-template-columns: minmax(0, 1fr); gap: 8px; padding: 24px 0; }
}

/* ── Progress demo ────────────────────────────────────────────────────── */
.lp-split { display: grid; grid-template-columns: 480px 1fr; gap: clamp(32px, 5vw, 80px); align-items: center; }
@media (max-width: 1000px) { .lp-split { grid-template-columns: minmax(0, 1fr); } }
.lp-demo { gap: 26px; }
.lp-demo-top { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
.lp-demo-top h3 { font-size: 1.625rem; }
.lp-bar { height: 8px; border-radius: 999px; background: ${PAPER_RULE}; overflow: hidden; }
.lp-bar > div { height: 100%; background: ${NAVY}; border-radius: 999px; }
.lp-rows { display: flex; flex-direction: column; gap: 10px; }
.lp-rows > div {
  border: 1px solid ${PAPER_RULE};
  border-radius: 16px;
  padding: 16px 20px;
  display: grid;
  grid-template-columns: 112px 1fr auto;
  gap: 18px;
  align-items: center;
}
.lp-rows strong { font-size: 1rem; font-weight: 700; }
.lp-rows em { font-style: normal; font-size: 0.8125rem; color: ${PAPER_MUTED}; text-align: right; }
.lp-rows .lp-due { color: ${PAPER_SAGE}; font-weight: 700; }
@media (max-width: 620px) {
  .lp-rows > div { grid-template-columns: minmax(0, 1fr); gap: 5px; }
  .lp-rows em { text-align: left; }
}

/* ── What it covers ───────────────────────────────────────────────────── */
/* The one light panel on a dark page. It carries the money answer, and after
   several screens of navy a sheet of paper is the loudest thing available
   without spending the accent on it. */
.lp-included {
  background: ${LAVENDER};
  color: ${NAVY};
  border-radius: 24px;
  padding: clamp(32px, 5vw, 64px);
  display: flex;
  flex-direction: column;
  gap: 40px;
}
.lp-head-dark > .lp-label { color: ${PAPER_MUTED}; }
.lp-included ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 40px; }
.lp-included li { padding: 22px 0; border-top: 1px solid ${PAPER_RULE}; font-size: clamp(1.0625rem, 1.4vw, 1.25rem); }
@media (max-width: 860px) { .lp-included ul { grid-template-columns: minmax(0, 1fr); } }

/* ── Questions ────────────────────────────────────────────────────────── */
.lp-head-mid { align-items: center; text-align: center; margin-inline: auto; }

.lp-qs { display: flex; flex-direction: column; max-width: 860px; width: 100%; margin-inline: auto; }

/* The open/close is animated through ::details-content, which is the only way
   to transition a native <details> without scripting it. Browsers that do not
   support it simply snap open, which is the behaviour we had anyway — so this
   is an enhancement, never a dependency. \`interpolate-size\` on .lp is what
   lets \`auto\` be an animatable height. */
.lp-qs details::details-content {
  block-size: 0;
  overflow: clip;
  transition: block-size 320ms ease, content-visibility 320ms allow-discrete;
}
.lp-qs details[open]::details-content { block-size: auto; }
@media (prefers-reduced-motion: reduce) {
  .lp-qs details::details-content { transition: none; }
  .lp-plus::after { transition: none; }
}
.lp-qs details { border-top: 1px solid ${RULE}; }
.lp-qs details:last-child { border-bottom: 1px solid ${RULE}; }
.lp-qs summary {
  list-style: none;
  cursor: pointer;
  padding: 26px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  min-height: 44px;
}
.lp-qs summary::-webkit-details-marker { display: none; }
.lp-qs summary:focus-visible { outline: 2px solid ${SAGE}; outline-offset: 4px; }
.lp-qs h3 { font-size: clamp(1.0625rem, 1.5vw, 1.375rem); line-height: 1.25; }
.lp-qs p { font-size: clamp(1.0625rem, 1.4vw, 1.1875rem); line-height: 1.6; padding-bottom: 28px; max-width: 62ch; }

/* A plus that becomes a minus: one bar fixed, one rotating. Cheaper than two
   icons and it cannot fall out of step with the open state. */
.lp-plus { position: relative; flex-shrink: 0; width: 18px; height: 18px; }
.lp-plus::before, .lp-plus::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1.5px;
  background: ${MUTED};
  transform: translateY(-50%);
}
.lp-plus::after { transform: translateY(-50%) rotate(90deg); transition: transform 200ms ease; }
.lp-qs details[open] .lp-plus::after { transform: translateY(-50%) rotate(0deg); }

/* ── Apply ────────────────────────────────────────────────────────────── */
.lp-apply {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: clamp(32px, 5vw, 80px);
  align-items: start;
  /* Sized to its content, NOT to the viewport. Every other band fills a
     screen, but this one is only a heading and two buttons: stretched to
     100dvh it left ~620px of empty navy between the buttons and the footer.
     The ask sits directly on the footer instead, and the page ends there. */
  min-height: 0;
  flex: none;
  padding-bottom: clamp(48px, 6vw, 72px);
}
/* The last screen likewise stops being a full viewport: its content is
   shorter than one, and padding it out only moved the gap below the footer.
   The browser clamps the final snap to the end of the page, so nothing is
   lost by letting it be short. */
.lp-screen-end { min-height: 0; }
@media (max-width: 860px) { .lp-apply { grid-template-columns: minmax(0, 1fr); } }
.lp-apply .lp-head h2 { font-size: clamp(2.25rem, 5vw, 3.625rem); }
.lp-deadline { font-size: clamp(1rem, 1.4vw, 1.125rem); }
.lp-deadline mark { background: ${SAGE}; color: ${NAVY}; padding: 0.04em 0.22em; font-weight: 700; }
.lp-cta { display: flex; flex-direction: column; gap: 12px; }
.lp-midcta { display: flex; align-items: center; gap: 12px 20px; flex-wrap: wrap; }
.lp-midcta p { font-size: 0.9375rem; }
.lp-fine { font-size: 0.875rem; line-height: 1.5; text-align: center; margin-top: 10px; }

/* ── Footer ───────────────────────────────────────────────────────────── */
/* The footer keeps the page's own ground and is separated by a rule rather
   than a change of colour — there is no darker navy left to go to. */
.lp-foot {
  border-top: 1px solid ${RULE};
  padding: clamp(40px, 5vw, 56px) 20px calc(44px + var(--safe-bottom));
}
.lp-foot-top, .lp-foot-base { width: 100%; max-width: 1280px; margin-inline: auto; }
.lp-foot-top { display: flex; justify-content: space-between; gap: 48px; flex-wrap: wrap; }
.lp-foot-brand { display: flex; flex-direction: column; gap: 14px; max-width: 320px; }
.lp-foot-brand p { font-size: 0.9375rem; line-height: 1.6; color: ${MUTED}; }
.lp-foot-cols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: clamp(24px, 4vw, 60px); }
.lp-foot-cols > div { display: flex; flex-direction: column; gap: 12px; }
.lp-foot-cols .lp-label { color: ${MUTED}; }
.lp-foot-cols a { font-size: 0.9375rem; text-decoration: none; color: inherit; }
.lp-foot-cols p { font-size: 0.9375rem; color: ${MUTED}; line-height: 1.5; }
.lp-foot-base {
  margin-top: 40px;
  border-top: 1px solid ${RULE};
  padding-top: 26px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.lp-foot-base span:first-child { font-size: 0.875rem; font-weight: 700; }
.lp-foot-base span:last-child { font-size: 0.8125rem; color: ${MUTED}; }
`;
