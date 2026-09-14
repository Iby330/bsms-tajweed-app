-- ═══ Drop the "Which class are you in?" question from every homework ═══
--
-- A Google Forms artefact: a form had no idea who was filling it in, so every
-- paper opened by asking. The app knows — `profiles.class_id` is the class,
-- set by the teacher and used to scope every teacher screen — so the question
-- asks a student to restate, unreliably, something already on record.
--
-- Carries no marks anywhere (all seven are `points = 0`), so no total, term
-- average or released mark moves. The answers deleted with it hold a class
-- name typed into a form and nothing else: verified zero non-zero marks and
-- zero teacher comments across all 138 rows before writing this.
--
-- `answers.question_id` is a plain reference with no cascade, so the answers
-- go first or the delete is refused.
--
-- Matched on the exact prompt rather than an id list: the importer generates
-- these ids, so a re-import would mint new ones while the wording stays put.
-- The importer's META_TITLES skip list is widened in the same change, so a
-- re-import no longer re-creates them — this migration cleans up what the
-- narrower pattern already let through.
--
-- Idempotent: re-running matches nothing once the questions are gone.

delete from answers
where question_id in (
  select id from questions where btrim(prompt) = 'Which class are you in?'
);

delete from voice_notes
where question_id in (
  select id from questions where btrim(prompt) = 'Which class are you in?'
);

delete from questions
where btrim(prompt) = 'Which class are you in?'
returning id, homework_id, position;
