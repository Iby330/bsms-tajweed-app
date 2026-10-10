-- Pictures under a question's prompt reach the student.
--
-- Qāʿidah homework 2 asks students to name every letter in the boxes of the
-- book's pages, so the question carries those pages as `media.images`
-- ([{src, alt, width, height}], served from web/public/images/homework). The
-- paper RPC rebuilds `media` field by field so nothing unexpected leaks (0048);
-- this adds `images`, rebuilt the same way, alongside `clip` and
-- `option_audio`. The app's parseMedia admits only /images/homework/ paths.

do $$
declare
  def text := pg_get_functiondef('public.get_homework_for_student(uuid)'::regprocedure);
  anchor constant text := '''clip'', case when jsonb_typeof(q.media->''clip'') = ''object''';
begin
  if position('''images''' in def) > 0 then return; end if;
  if (length(def) - length(replace(def, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'get_homework_for_student media block is not the one this migration expects';
  end if;
  execute replace(def, anchor,
    '''images'', case when jsonb_typeof(q.media->''images'') = ''array'' then (
                         select jsonb_agg(jsonb_build_object(
                           ''src'', i->''src'', ''alt'', i->''alt'', ''width'', i->''width'', ''height'', i->''height''))
                           from jsonb_array_elements(q.media->''images'') i
                          where jsonb_typeof(i) = ''object'')
                       end,
                       ' || anchor);
end $$;
