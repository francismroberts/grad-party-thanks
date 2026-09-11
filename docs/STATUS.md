# Status — updated 2026-09-11 05:10 PT

## Built this session
- Repo scaffold, `CLAUDE.md`, `scripts/ingest.js` (stage 2), `scripts/serve.mjs` (local preview; system Python can't read ~/Documents).
- **Photobooth cropped to a single strip.** Source files are 1200×1800 print sheets: the same 2×6 strip twice on kraft paper. Measured: halves identical in content (diffs are sub-pixel resampling only), no white margin anywhere, strip frame is kraft and part of the design, banner wider than the photos. Crop = exact left half, 600×1800, configured in `CROP` in `ingest.js`; the original in storage is the cropped strip too. All 70 regenerated via new `--regenerate` flag, 0 failures, 280 objects, no orphans. Source sheets on disk untouched.
- **Both galleries fully ingested, 0 failures.** Photobooth 70 rows (all 600×1800). Photographer 294 rows (178 landscape, 116 portrait, mostly 5760×3840 / 3840×5760, 16 odd crops). 364 rows total, no NULLs, `sort_order` contiguous and chronological, every original verified GPS-free with camera EXIF kept.
- **Stage 3: `booth.html`** with `assets/site.css` (RSVP tokens verbatim) and `assets/gallery.js` (shared loader + lightbox). Tested at 390/768/1440/1920: 2/3/5 columns, no overflow, 40-then-scroll paging, lightbox with keys/swipe/Esc/close, focus return, `?download=` links confirmed to return `Content-Disposition: attachment`.
- **Chapters on `photos.html`:** seven sections by `taken_at` (UTC, to the second), defined as JSON in the page; headings + counts derived from one small capture-time fetch and rendered before any photo. Verified 35/33/102/30/26/49/19 = 294. Spec updated to match everything built so far.
- **Jump links + on-demand loading.** Understated row of chapter names above the gallery (horizontal scroll on phones). Loading is now by block of 40 at any index: a jump loads its own chapter's blocks first and scrolls there; other sections fill in when scrolled into view. Growth above the viewport is compensated by hand (`overflow-anchor:none`), so a jump to the speech then a scroll up doesn't drift. `#chapter-N` deep links work on load. Booth keeps the sentinel path, verified 40 then 70.
- **Stage 4: `photos.html`** with justified rows (`class="grid justified"`), in the shared module. Packs rows to a target height (180 mobile / 260 desktop), scales each to fill the width exactly, tiles absolutely positioned. Verified at 1440: 294 photos, 66 rows, every row edge exactly on the container width, no overlaps, row heights 228–302. Re-lays out on resize.

## Decisions that differ from the spec
- Photo `id` is a UUID from the source file's SHA-256, for idempotency. 2x thumb at `<gallery>/thumb/<id>@2x.webp`, derived from `thumb_path`. Originals keep real extension.
- Live `photos` table has `original_path` (not in spec SQL); the script writes it. Capture time falls back EXIF → filename `YYYYMMDD_HHMMSS` → mtime. Existing rows self-heal on re-run; `--limit 0` runs only that pass; `--regenerate` rebuilds and re-uploads everything for existing rows.
- Admin key is the modern `sb_secret_` key. Node 26 needs Buffers, not paths, into sharp/exifr; `engines` pinned `>=20 <27`.
- Gallery pages use plain `fetch` to PostgREST, not supabase-js: one table read, no bundle. Download filenames carry the gallery slug (`francis-grad-party-booth-001.jpg`) so the two galleries never collide.
- Lightbox has one **Download** button serving the original JPG, not the spec's web-size + "Original" pair. WebP is a delivery format; guests want a JPG that opens anywhere. Lives in shared `gallery.js`, so `photos.html` inherits it.
- Photographer set is 294 files / 1.0 GB, not ~300 / 1.1 GB. Use measured archive sizes in the UI.

## Broken or unfinished
- Referenced but not in repo: `favicon.ico`, `favicon-32.png`, `favicon-16.png`, `apple-touch-icon.png` (copy from RSVP site) and `og-image.jpg` (JPEG < 200 KB). Stage 9.
- Both gallery headers have an empty `.actions` slot for Select (stage 5) and Download all (stage 6). Archives don't exist yet.

## Next session should start with
1. Stage 5: Select mode + JSZip in `gallery.js`, 40-photo cap. Selection must work in both layouts; in justified mode the checkbox overlays the absolutely positioned tile. Note `photos` is now a sparse array (blocks load out of order); "select all on this page" should mean loaded tiles.
2. Stage 6: archive generation in `ingest.js` + "Download all" with measured sizes.
