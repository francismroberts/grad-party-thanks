# Status — updated 2026-09-11 03:21 PT

## Built this session
- Repo scaffold: `.gitignore`, `.env.example`, `CNAME`, `README.md`, `scripts/package.json`.
- `scripts/ingest.js` (spec stage 2): GPS strip on a temp copy with verification, oriented dimensions, thumb/thumb@2x/full WebP, uploads, `photos` row, gallery-wide `sort_order` recompute. `--limit N`, idempotent, resumes interrupted runs, summary with failure reasons.
- **Photobooth gallery fully ingested: 70 rows, 280 objects, 0 failures.** Verified: no NULLs, `sort_order` 0–69 contiguous and ascending by capture time, all 1200×1800.
- **Photographer tested on 5 of 294 files, 0 failures.** Verified on a downloaded original: no `GPS*` tags, Make/Model/Lens/Exposure/DateTimeOriginal kept. `full` derivative has no metadata at all. Portrait file came through as 3840×5760 → 1333×2000. `taken_at` from EXIF. Mixed dimensions (5760×3840, 3840×5760, 5221×3481), so the grid must use per-row width/height.
- Supabase tables, buckets and RLS were already in place before this session (stage 1 done).

## Decisions that differ from the spec
- Photo `id` is a UUID derived from the source file's SHA-256, not random. Gives idempotency with no extra column.
- 2x thumb lives at `<gallery>/thumb/<id>@2x.webp`. Spec defines the 1000px derivative but the table has no column; pages derive it from `thumb_path`.
- Originals keep their real extension (`.jpg`, `.png`). For the JPEG sources this matches the spec exactly.
- Capture time falls back EXIF → `YYYYMMDD_HHMMSS` in the filename → file mtime. The photobooth export has no EXIF at all, and mtime was just the copy time, so the filename fallback is what actually orders that gallery.
- The live `photos` table has an `original_path` column the spec's SQL doesn't list. The script writes it (`<gallery>/original/<id><ext>`). Verified non-NULL on all 11 rows and each path serves an object.
- Already-ingested rows are self-healed on every run: `taken_at` corrected if the source changed, `original_path` filled if NULL. `--limit 0` runs only that repair pass. No separate repair flag.
- Admin key is the modern `sb_secret_` key in `.env`, not the legacy `service_role` JWT.

## Broken or unfinished
- **Node 26 gotcha.** Homebrew installed Node 26.8.2, where an unclosed FileHandle is a hard `ERR_INVALID_STATE` at GC. Fixed by reading each working file into one Buffer and passing that to sharp and exifr. `engines` is pinned `>=20 <27`.
- None of the 294 photographer source files carries GPS (scanned with exiftool). The strip is a no-op on this set; the read-back check still guards every file.
- Photographer set is 294 files / 1.0 GB, not the spec's ~300 / 1.1 GB. Archive sizes in the UI should come from real numbers, not the spec.
- Archive generation (`archives/<gallery>-*.zip`) is not in the script yet. Spec puts it at stage 6.
- No HTML pages exist yet.

## Next session should start with
1. Run the rest of photographer (289 files, ~1 GB upload): `cd scripts && node ingest.js --gallery photographer /Users/francis/Documents/Graduation/photographer`.
2. Stage 3: `booth.html` with single-photo download. Photobooth data is complete, so this can start any time.
