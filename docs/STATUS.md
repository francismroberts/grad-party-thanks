# Status — updated 2026-09-11

## Built this session
- Repo scaffold: `.gitignore`, `.env.example`, `CNAME`, `README.md`, `scripts/package.json`.
- `scripts/ingest.js` (spec stage 2): GPS strip on a temp copy with verification, oriented dimensions, thumb/thumb@2x/full WebP, uploads, `photos` row, gallery-wide `sort_order` recompute. `--limit N`, idempotent, summary with failure reasons.
- Supabase tables, buckets and RLS were already in place before this session (stage 1 done).

## Decisions that differ from the spec
- Photo `id` is a UUID derived from the source file's SHA-256, not random. Gives idempotency with no extra column.
- 2x thumb lives at `<gallery>/thumb/<id>@2x.webp`. Spec defines the 1000px derivative but the table has no column; pages will derive it from `thumb_path`.
- Originals keep their real extension (`.jpg`, `.png`). Spec shows `.jpg` only; for the JPEG sources it is identical.
- `taken_at` falls back to file mtime when EXIF has no date, so every photo can be sorted. Summary reports how many.
- Admin key is the modern `sb_secret_` key in `.env`, not the legacy `service_role` JWT.

## Broken or unfinished
- **Node is not installed on this Mac.** `ingest.js` has never been parsed or run. Expect the first run to surface something. Install with `brew install node`, then `cd scripts && npm install`.
- Untested assumption: `exiftool-vendored@28` `write()` takes `{ writeArgs: [...] }`; older versions took a plain array.
- Archive generation (`archives/<gallery>-*.zip`) is not in the script yet. Spec puts it at stage 6.
- No HTML pages exist yet.

## Next session should start with
1. Install Node, `npm install` in `scripts/`, run `node ingest.js --gallery photobooth <folder> --limit 5`. Fix whatever breaks.
2. Check the 5 rows in Supabase and open a `full` URL in a browser. Confirm an original has no GPS but still has camera EXIF.
3. Run the full photobooth set, then start stage 3: `booth.html` with single-photo download.
