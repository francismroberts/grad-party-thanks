# grad-party-thanks

Source for **thanks.francismroberts.com** — the thank-you and photo site
that follows the RSVP site at `party.francismroberts.com`. Guests see
the photos, download what they want, and upload what they captured.

Full build spec: [docs/thank-you-site-spec.md](docs/thank-you-site-spec.md).
Read it before building anything. The site is being built in stages in
the order listed at the end of the spec.

## How it's hosted

| Piece | Where |
|---|---|
| HTML / CSS / JS | This repo, served by GitHub Pages (`CNAME` sets the domain) |
| Photos, video, zip archives | Supabase Storage, `gallery` bucket (public read) |
| Guest uploads | Supabase Storage, `submissions` bucket (private, insert-only) |
| Photo and upload metadata | Supabase Postgres (`photos`, `uploads` tables) |

The repo holds **no media**. Photos are never committed and never
embedded as base64.

## Layout

```
.
├── CNAME                     GitHub Pages custom domain
├── index.html                Landing: thank-you note, gallery cards, upload CTA   (stage 8)
├── booth.html                Photo booth gallery, ~70 photos                      (stage 3)
├── photos.html               Photographer gallery, ~300 photos                    (stage 4)
├── upload.html               Guest upload form, resumable (TUS) uploads           (stage 7)
├── assets/
│   ├── supabase-config.js    Project URL, publishable key, bucket names. Safe to commit.
│   ├── site.css              Shared tokens and components, copied from the RSVP site
│   ├── zip-writer.worker.js  Streams a zip into the origin-private file system (disk, not RAM)
│   ├── vendor/client-zip.js  client-zip 2.5.0 (MIT), vendored so nothing loads from a CDN
│   └── gallery.js            Gallery loader + lightbox, shared by booth.html and photos.html.
│                             Two layouts: CSS grid (booth, uniform strips) and justified
│                             rows (photos, mixed aspect ratios; class="grid justified").
│                             Optional chapters (JSON block in the page) with a floating
│                             chapter pill; booth gets the back-to-top-only pill.
├── docs/
│   ├── thank-you-site-spec.md
│   └── STATUS.md             Session handoff. Read this first.
├── scripts/                  Local-only tooling. Not deployed.
│   ├── package.json
│   ├── ingest.js             Resize, strip GPS, upload, insert rows               (stage 2)
│   └── serve.mjs             Static preview server for local testing
├── .env.example              Variables the pipeline needs, no values
└── .env                      Real values. Gitignored. Never commit.
```

Pages not listed above do not exist yet; they land in the stages noted.

## Previewing locally

Pages use ES modules, so they need an HTTP server, not `file://`:

```bash
node scripts/serve.mjs
```

Then open `http://127.0.0.1:8765/booth` or `/photos`. Like GitHub
Pages, it resolves `/booth` to `booth.html`.

It listens on all interfaces and prints a LAN URL to open on a phone on
the same Wi-Fi. Plain `http://` over LAN is not a secure context, so on
the phone the zip download can't use the on-disk streaming path and
falls back to the buffered one; test streaming zips on the deployed
HTTPS site. Set `HOST=127.0.0.1` to keep it to this Mac. The gallery pages read live data from
Supabase, so what you see locally is what's deployed.

Static assets the pages reference but the repo does not hold yet:
`favicon.ico`, `favicon-32.png`, `favicon-16.png`, `apple-touch-icon.png`
(copy from the RSVP site) and `og-image.jpg` (a JPEG under 200 KB).

## Secrets

Two keys, two very different rules:

- **Publishable key** lives in `assets/supabase-config.js` and ships to
  the browser. That is fine. Row Level Security is what protects the
  data, so the RLS policies in the spec are not optional.
- **Service role key** bypasses RLS entirely. It lives only in `.env`,
  is read only by `scripts/ingest.js`, and must never appear in any
  file that gets committed or served.

`.gitignore` excludes `.env` and `.env.*` but keeps `.env.example`.
Check before your first commit:

```bash
git check-ignore -v .env
```

## Ingest pipeline (`scripts/`)

Runs on your Mac, once per photo drop. Reads from
`/Users/francis/Documents/Graduation/{photobooth,photographer}/`.

Dependencies and what each is for:

| Package | Role |
|---|---|
| `sharp` | Resize to thumb (500px), thumb@2x (1000px), full (2000px); WebP encode |
| `exifr` | Fast read of capture time and dimensions for `sort_order` and the `photos` row |
| `exiftool-vendored` | Strip GPS tags from originals in place, without re-encoding, keeping camera and exposure EXIF |
| `archiver` | Stream the web and originals zips to disk (the originals set is ~1.1 GB, too big to zip in memory) |
| `@supabase/supabase-js` | Upload to Storage and insert `photos` rows using the service role key |
| `dotenv` | Load `.env` |

Setup:

```bash
cd scripts && npm install
```

Before running the pipeline, confirm the source photos are real files
and not iCloud placeholders. The spec has the exact check. The script
also refuses to run if it finds a `.icloud` stub in the folder.

Test on a few files first, then run the rest:

```bash
cd scripts && node ingest.js --gallery photobooth /Users/francis/Documents/Graduation/photobooth --limit 5
```

```bash
cd scripts && node ingest.js --gallery photobooth /Users/francis/Documents/Graduation/photobooth
```

Re-running is safe. Each photo's id is derived from a hash of the
source file, so files already in the `photos` table are skipped and
`--limit` only counts files that still need work. Source photos are
never modified; GPS is stripped from a temp copy and verified gone
before anything uploads.

After changing the pipeline (crop, sizes, quality), rebuild what is
already uploaded with `--regenerate`. It re-uploads every derivative and
the original and updates each row's width/height, keeping ids and paths:

```bash
cd scripts && node ingest.js --gallery photobooth /Users/francis/Documents/Graduation/photobooth --regenerate
```

**Photobooth crop.** The booth exports 1200×1800 print sheets with the
same 2×6 strip twice side by side on kraft paper. The script crops
photobooth files to the exact left half (600×1800) before doing anything
else, so the original, the derivatives and the stored dimensions all
describe a single strip. The crop is configured per gallery in `CROP` at
the top of `ingest.js` and refuses any file that is not 1200×1800.
Storage keeps only the cropped version; the source sheets on disk are
untouched.

Objects written per photo, in the `gallery` bucket:

| Path | Size | Notes |
|---|---|---|
| `<gallery>/thumb/<id>.webp` | 500px | `photos.thumb_path` |
| `<gallery>/thumb/<id>@2x.webp` | 1000px | srcset 2x, derived from `thumb_path` |
| `<gallery>/full/<id>.webp` | 2000px | `photos.full_path` |
| `<gallery>/original/<id>.jpg` | as shot | GPS stripped, all other EXIF kept |

Archive generation is a later stage and is not part of the script yet.

## Browser-side libraries

The gallery pages talk to Supabase with plain `fetch`: they read one
table and build public URLs, which does not justify the supabase-js
bundle on a phone. The select-multiple download uses `client-zip`,
vendored in `assets/vendor/`, streaming the zip to disk (see the spec's
Tier 2 for the three save paths and why StreamSaver was rejected).
Pages that need more will load it from a CDN, so nothing here is in
`package.json`:

- `tus-js-client` for resumable uploads on `upload.html`
- `@supabase/supabase-js` on `upload.html` for the `uploads` row insert

Two local-only query flags help test the download without a save dialog
(they do nothing off localhost): `?zipvia=opfs|blob|picker` forces a
save path, `?selftest-zip=N` selects the first N loaded photos and
starts the download on load.

## Deploy

Push to `main`. GitHub Pages serves the repo root. DNS for
`thanks.francismroberts.com` is the last stage in the spec.
