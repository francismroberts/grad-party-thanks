# Status — updated 2026-09-11 03:55 PT

## Built this session
- Repo scaffold, `CLAUDE.md`, `scripts/ingest.js` (stage 2), `scripts/serve.mjs` (local preview; system Python can't read ~/Documents).
- **Photobooth cropped to a single strip.** Source files are 1200×1800 print sheets: the same 2×6 strip twice on kraft paper. Measured: halves identical in content (diffs are sub-pixel resampling only), no white margin anywhere, strip frame is kraft and part of the design, banner wider than the photos. Crop = exact left half, 600×1800, configured in `CROP` in `ingest.js`; the original in storage is the cropped strip too. All 70 regenerated via new `--regenerate` flag, 0 failures, 280 objects, no orphans. Source sheets on disk untouched.
- **Both galleries fully ingested, 0 failures.** Photobooth 70 rows (all 600×1800). Photographer 294 rows (178 landscape, 116 portrait, mostly 5760×3840 / 3840×5760, 16 odd crops). 364 rows total, no NULLs, `sort_order` contiguous and chronological, every original verified GPS-free with camera EXIF kept.
- **Stage 3: `booth.html`** with `assets/site.css` (RSVP tokens verbatim) and `assets/gallery.js` (shared loader + lightbox). Tested at 390/768/1440/1920: 2/3/5 columns, no overflow, 40-then-scroll paging, lightbox with keys/swipe/Esc/close, focus return, `?download=` links confirmed to return `Content-Disposition: attachment`.

## Decisions that differ from the spec
- Photo `id` is a UUID from the source file's SHA-256, for idempotency. 2x thumb at `<gallery>/thumb/<id>@2x.webp`, derived from `thumb_path`. Originals keep real extension.
- Live `photos` table has `original_path` (not in spec SQL); the script writes it. Capture time falls back EXIF → filename `YYYYMMDD_HHMMSS` → mtime. Existing rows self-heal on re-run; `--limit 0` runs only that pass; `--regenerate` rebuilds and re-uploads everything for existing rows.
- Admin key is the modern `sb_secret_` key. Node 26 needs Buffers, not paths, into sharp/exifr; `engines` pinned `>=20 <27`.
- Gallery pages use plain `fetch` to PostgREST, not supabase-js: one table read, no bundle. Download filenames carry the gallery slug (`francis-grad-party-booth-001.jpg`) so the two galleries never collide.
- Photographer set is 294 files / 1.0 GB, not ~300 / 1.1 GB. Use measured archive sizes in the UI.

## Broken or unfinished
- Referenced but not in repo: `favicon.ico`, `favicon-32.png`, `favicon-16.png`, `apple-touch-icon.png` (copy from RSVP site) and `og-image.jpg` (JPEG < 200 KB). Stage 9.
- `booth.html` header has an empty `.actions` slot for Select (stage 5) and Download all (stage 6). Archives don't exist yet.

## Next session should start with
1. Stage 4: `photos.html`. Copy `booth.html`, change `data-gallery="photographer"`, copy, and OG tags. `gallery.js` already handles mixed aspect ratios and 294 rows. Test scroll paging past 40/80/…/280.
2. Stage 5: Select mode + JSZip in `gallery.js`, 40-photo cap.
