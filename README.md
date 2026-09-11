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
│   └── supabase-config.js    Project URL, publishable key, bucket names. Safe to commit.
├── docs/
│   └── thank-you-site-spec.md
├── scripts/                  Local-only ingest pipeline. Not deployed.
│   ├── package.json
│   └── ingest.js             Resize, strip GPS, upload, build archives           (stage 2)
├── .env.example              Variables the pipeline needs, no values
└── .env                      Real values. Gitignored. Never commit.
```

Page files and `scripts/ingest.js` do not exist yet; they land in the
stages noted above.

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
and not iCloud placeholders. The spec has the exact check.

## Browser-side libraries

The pages load these from a CDN, so they are not in `package.json`:

- `@supabase/supabase-js` for reading `photos` and building download URLs
- `tus-js-client` for resumable uploads on `upload.html`
- `JSZip` for the select-multiple download (capped at 40 photos)

## Deploy

Push to `main`. GitHub Pages serves the repo root. DNS for
`thanks.francismroberts.com` is the last stage in the spec.
