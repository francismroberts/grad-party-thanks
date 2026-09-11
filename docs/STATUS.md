# Status — updated 2026-09-11

## Built this session
- Repo scaffold: `.gitignore`, `.env.example`, `CNAME`, `README.md`, `scripts/package.json`.
- `scripts/ingest.js` (spec stage 2), run and verified on 11 photobooth files: GPS strip on a temp copy with verification, oriented dimensions, thumb/thumb@2x/full WebP, uploads, `photos` row, gallery-wide `sort_order` recompute. `--limit N`, idempotent, resumes interrupted runs, summary with failure reasons.
- Supabase tables, buckets and RLS were already in place before this session (stage 1 done).

## Decisions that differ from the spec
- Photo `id` is a UUID derived from the source file's SHA-256, not random. Gives idempotency with no extra column.
- 2x thumb lives at `<gallery>/thumb/<id>@2x.webp`. Spec defines the 1000px derivative but the table has no column; pages derive it from `thumb_path`.
- Originals keep their real extension (`.jpg`, `.png`). For the JPEG sources this matches the spec exactly.
- Capture time falls back EXIF → `YYYYMMDD_HHMMSS` in the filename → file mtime. The photobooth export has no EXIF at all, and mtime was just the copy time, so the filename fallback is what actually orders that gallery.
- Already-ingested rows get `taken_at` re-checked on every run and corrected if the source changed. Keeps sort order converging without manual fixes.
- Admin key is the modern `sb_secret_` key in `.env`, not the legacy `service_role` JWT.

## Broken or unfinished
- **Node 26 gotcha.** Homebrew installed Node 26.8.2, where an unclosed FileHandle is a hard `ERR_INVALID_STATE` at GC. Fixed by reading each working file into one Buffer and passing that to sharp and exifr. `engines` is pinned `>=20 <27`.
- Untested on photographer files: they are the ones expected to carry GPS and camera EXIF. Photobooth files have neither, so "strip GPS, keep camera tags" is proven only on the GPS side.
- Archive generation (`archives/<gallery>-*.zip`) is not in the script yet. Spec puts it at stage 6.
- No HTML pages exist yet.

## Next session should start with
1. Finish photobooth: `cd scripts && node ingest.js --gallery photobooth /Users/francis/Documents/Graduation/photobooth` (59 files left).
2. Test photographer on 5: same command with `--gallery photographer` and `--limit 5`. Then download one original from the bucket and run exiftool on it: no `GPS*` tags, but Make/Model/ExposureTime present.
3. Stage 3: `booth.html` with single-photo download.
