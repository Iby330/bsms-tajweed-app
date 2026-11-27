#!/usr/bin/env python3
"""
Put a Sahaba Stories carousel on its lesson page.

The carousel is made elsewhere (the sahaba-carousel skill) and delivered as
1080x1440 MP4s, one per slide, 5-13 MB each: right for Instagram, far too
heavy for a page. This script makes the web copies and tells the app about
them:

  1. each slide -> web/public/carousels/sahabah-NN/SS.mp4 (720x960 H.264,
     AAC 96k, faststart) and SS.jpg (a poster from late in the slide, when
     the text is all on screen)
  2. the lesson's entry in web/src/lib/lessons/carousels.json, keyed by the
     lesson's YouTube id, which is what the lesson pages look the carousel
     up by (lib/lessons/carousels.ts)

Nothing touches the database. The change goes live when the files and the
JSON are committed and pushed to main, and it shows only on a lesson whose
youtube_id is the id given here: if that lesson row does not exist yet (a new
lecture), the carousel shows nowhere until a migration adds it, the way
web/supabase/migrations/0149_sahabah_stories_4.sql did for Lecture 4. The
script cannot see the database, so it only checks the migrations folder for
the id and says so when it is missing.

Usage:
    python3 execution/publish_carousel.py --lecture 4 --youtube gVuTxhca40s \
        --src "~/Downloads/Sahaba Stories - Lecture 4/Painted/With sound effects"

Re-running for the same lecture replaces its slides (a re-render, a slide
added or removed). Use the "With sound effects" set: the page plays slides
muted until the student turns the sound on.

Needs ffmpeg and ffprobe: .tooling/ffmpeg/ (see LEARNINGS.md) or on PATH.
In a git worktree, where the git-ignored .tooling/ is absent, the main
checkout's .tooling/ffmpeg/ is used.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "web" / "public" / "carousels"
MANIFEST = ROOT / "web" / "src" / "lib" / "lessons" / "carousels.json"
MIGRATIONS = ROOT / "web" / "supabase" / "migrations"

WIDTH, HEIGHT = 720, 960
CRF = "27"
# Where in the slide the poster is taken. Text is on within a second or two
# and held to the end, so late in the slide is the slide as it is read.
POSTER_AT = 0.7


def tooling_dirs() -> list[Path]:
    dirs = [ROOT / ".tooling" / "ffmpeg"]
    # .tooling/ is git-ignored, so a git worktree does not have it: there
    # .git is a file pointing into the main checkout, which does.
    dotgit = ROOT / ".git"
    if dotgit.is_file():
        linked = re.match(r"gitdir:\s*(.+?)/\.git/worktrees/", dotgit.read_text())
        if linked:
            dirs.append(Path(linked.group(1)) / ".tooling" / "ffmpeg")
    return dirs


def tool(name: str) -> str:
    for folder in tooling_dirs():
        if (folder / name).exists():
            return str(folder / name)
    found = shutil.which(name)
    if not found:
        sys.exit(f"{name} not found: put it in .tooling/ffmpeg/ (see LEARNINGS.md) or on PATH")
    return found


def run(cmd: list[str]) -> str:
    done = subprocess.run(cmd, capture_output=True, text=True)
    if done.returncode != 0:
        sys.exit(f"failed: {' '.join(cmd[:3])} ...\n{done.stderr.strip()[-800:]}")
    return done.stdout


def probe(ffprobe: str, path: Path) -> tuple[int, int, float]:
    out = run([
        ffprobe, "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height:format=duration", "-of", "json", str(path),
    ])
    data = json.loads(out)
    stream = data["streams"][0]
    return int(stream["width"]), int(stream["height"]), float(data["format"]["duration"])


def lesson_migration(youtube_id: str) -> Path | None:
    """The migration that mentions this YouTube id, if the repo has one.

    Reads files only. A lesson can exist without one, and a migration in the
    repo may not have been applied yet, so this is a prompt to check, not proof.
    """
    if not MIGRATIONS.is_dir():
        return None
    for path in sorted(MIGRATIONS.glob("*.sql")):
        if youtube_id in path.read_text(errors="ignore"):
            return path
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--lecture", type=int, required=True, help="lecture number, e.g. 4")
    ap.add_argument("--youtube", required=True, help="the lesson's YouTube id, e.g. gVuTxhca40s")
    ap.add_argument("--src", required=True, help="folder of NN-name.mp4 slides")
    args = ap.parse_args()

    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", args.youtube):
        sys.exit(f"'{args.youtube}' is not a YouTube id (11 characters, no URL)")
    src = Path(args.src).expanduser()
    slides = sorted(p for p in src.glob("*.mp4") if re.match(r"\d+", p.name))
    if not slides:
        sys.exit(f"no NN-name.mp4 slides in {src}")
    numbers = [int(re.match(r"\d+", p.name).group()) for p in slides]
    if numbers != list(range(1, len(slides) + 1)):
        sys.exit(f"slides are not numbered 1..{len(slides)} with no gaps or repeats: {numbers}")

    ffmpeg, ffprobe = tool("ffmpeg"), tool("ffprobe")
    slug = f"sahabah-{args.lecture:02d}"
    out_dir = PUBLIC / slug
    # Built beside the live folder and swapped in at the end, so a failure
    # half way leaves the published set as it was.
    tmp_dir = PUBLIC / f".{slug}.tmp"
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir)
    tmp_dir.mkdir(parents=True)

    entries = []
    total = 0
    for n, path in zip(numbers, slides):
        width, height, seconds = probe(ffprobe, path)
        if width * 4 != height * 3:
            sys.exit(f"{path.name} is {width}x{height}, not 3:4")
        video, poster = tmp_dir / f"{n:02d}.mp4", tmp_dir / f"{n:02d}.jpg"
        run([
            ffmpeg, "-v", "error", "-y", "-i", str(path),
            "-vf", f"scale={WIDTH}:{HEIGHT}:flags=lanczos",
            "-c:v", "libx264", "-preset", "slow", "-crf", CRF,
            "-pix_fmt", "yuv420p", "-profile:v", "high",
            "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(video),
        ])
        run([
            ffmpeg, "-v", "error", "-y", "-ss", f"{seconds * POSTER_AT:.2f}", "-i", str(path),
            "-frames:v", "1", "-vf", f"scale={WIDTH}:{HEIGHT}:flags=lanczos", "-q:v", "4", str(poster),
        ])
        if not video.stat().st_size or not poster.stat().st_size:
            sys.exit(f"{path.name}: ffmpeg wrote an empty file")
        total += video.stat().st_size + poster.stat().st_size
        entries.append({
            "video": f"/carousels/{slug}/{video.name}",
            "poster": f"/carousels/{slug}/{poster.name}",
            "seconds": round(seconds),
        })
        print(f"  {path.name} -> {video.name}  {video.stat().st_size / 1e6:.1f} MB")

    if out_dir.exists():
        shutil.rmtree(out_dir)
    tmp_dir.rename(out_dir)

    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    # One carousel per lecture: a lecture whose video was re-uploaded under a
    # new id must not leave its old entry behind.
    manifest = {k: v for k, v in manifest.items() if v.get("lecture") != args.lecture}
    manifest[args.youtube] = {"lecture": args.lecture, "slides": entries}
    manifest = dict(sorted(manifest.items(), key=lambda kv: kv[1]["lecture"]))
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")

    print(f"Lecture {args.lecture}: {len(entries)} slides, {total / 1e6:.1f} MB, in {out_dir.relative_to(ROOT)}")
    print(f"Listed in {MANIFEST.relative_to(ROOT)} under {args.youtube}. Commit both, then push main to release.")
    lesson = lesson_migration(args.youtube)
    if lesson:
        print(f"Lesson: {lesson.relative_to(ROOT)} mentions {args.youtube}. Make sure it has been applied: "
              "the carousel shows only on a lesson with that youtube_id.")
    else:
        print(f"WARNING: no migration in {MIGRATIONS.relative_to(ROOT)} mentions {args.youtube}. The carousel shows "
              "only on a lesson whose youtube_id is that id. If the lesson row does not exist yet, add it with a "
              "migration (see 0149_sahabah_stories_4.sql), or the carousel shows nowhere.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
