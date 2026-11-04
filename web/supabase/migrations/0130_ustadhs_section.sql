-- A fourth section: the teachers' own class, walled off from the programme.
-- ADD VALUE can't share a batch with anything that uses the value (see 0020).
alter type section_t add value if not exists 'ustadhs';
