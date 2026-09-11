# Thank-You Site — Build Spec

Sequel to the RSVP site at `party.francismroberts.com`. Same visual
language, new purpose: thank guests, show the photos, collect what
they captured.

**Domain:** `thanks.francismroberts.com`
**Access:** unlisted + `noindex`. No passcode.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Site shell | GitHub Pages (existing repo pattern) | Custom domain already works there |
| All media | Supabase Storage (Pro) | 370 photos + guest video, CDN-backed, no repo bloat |
| Metadata | Supabase Postgres | Gallery manifests + upload records |

**No new Supabase project needed.** Add these tables and buckets to an
existing project — they're namespaced and won't collide. A separate
project is tidier but adds a compute instance to the bill.

Do **not** embed images as base64 and do **not** commit photos to the
repo. The repo holds only HTML/CSS/JS.

---

## Design continuity — what carries over

Copy these tokens **verbatim** from the RSVP site's `index.html`:

```css
--cream:#F6EFF2;    --card:#FBF7F9;     --ink:#1F1860;
--ink-soft:#4A3F86; --lavender:#6F65AA;
--line:#D8D1E4;     --line-soft:#EAE4F0;
--band:rgba(40,32,38,.8);  --band-text:#F8F1F4;

--serif:'Source Serif 4', Georgia, serif;
--sans:'Inter', system-ui, sans-serif;
```

**Inherit exactly:**

- **Type roles.** Serif for voice (headings, captions, body prose).
  Inter for workhorse text — uppercase tracked labels at 10–13px with
  `letter-spacing:.2em`, buttons, form labels, metadata.
- **The framed-photo treatment.** White mat (11px padding), 1px
  `--line` border, `box-shadow:0 22px 58px -34px rgba(31,24,96,.45)`.
- **The caption band.** Charcoal `--band` overlay, centered italic
  serif — reuse on gallery cover cards.
- **Card pattern.** The details card's double-rule frame (outer 1px
  `--line`, 9px padding, inner 1px `--line-soft`) — reuse for the
  gallery entry cards on the landing page.
- **Buttons.** Full-width, `--ink` background, `--cream` text, 12px
  uppercase Inter at `.18em` tracking, `--lavender` on hover.
- **Text column width.** 440px max, centered. Every prose section on
  every page keeps this.
- **Section rhythm.** `clamp(48px,8vw,72px)` between sections.

**What deliberately diverges:**

- **Galleries break the 440px column.** They scale up to 1600px in a
  multi-column grid. Prose sections above and below them stay at 440px,
  so the page reads as the same site with one wide element — not a
  different design.
- **Lighter frames in-grid.** At 300-thumbnail density a full white mat
  on every tile is visual noise and wastes space. In the grid: 1px
  `--line` border only. The full mat returns in the lightbox.

---

## Responsive behavior

Mobile-first. Assume most traffic is a phone.

### Grid columns

| Width | Context | Columns | Gutter |
|---|---|---|---|
| < 480px | small phone | 2 | 8px |
| 480–767px | phone | 2 | 10px |
| 768–1023px | tablet portrait | 3 | 12px |
| 1024–1439px | tablet landscape / laptop | 4 | 14px |
| ≥ 1440px | desktop | 5 | 16px |

Wrap the grid in `max-width:1600px; margin:0 auto;`.

### Prose and forms at every width

- Text sections: `max-width:440px`, centered
- Upload form: `max-width:440px`, centered
- Landing gallery cards: stacked on mobile, side by side ≥768px

### Type scale

```css
--h1:    clamp(28px, 6vw, 40px);
--h2:    clamp(22px, 4.5vw, 30px);
--body:  clamp(16px, 3.6vw, 18px);
--label: 12px;   /* fixed — tracked uppercase reads badly when scaled */
```

### Touch and input

- Minimum 44×44px tap targets on every control
- No hover-only affordances
- Lightbox: swipe left/right on touch, arrow keys on desktop, and an
  always-visible close button
- `-webkit-text-size-adjust:100%`
- Respect `prefers-reduced-motion`

### Images

- `loading="lazy"` on every thumbnail
- `srcset` at 1x/2x
- Always set `width`/`height` from the DB so tiles reserve space

### Test at these widths

`375` · `390` · `768` · `1024` · `1440` · `1920`

---

## Downloads

Guests can download everything. Three tiers, because one mechanism
can't serve all three cases well.

### The cross-origin gotcha — read this first

Images are served from Supabase, a different origin than the site. The
HTML `download` attribute is **ignored cross-origin**, so a normal
download link would just open the photo in a new tab.

Supabase's `?download` query parameter is the fix — it sets
`Content-Disposition: attachment`, and accepts a custom filename:

```
https://[project].supabase.co/storage/v1/object/public/gallery/photographer/full/abc.webp?download=francis-grad-party-142.jpg
```

Or via the SDK:

```js
const { data } = supabase.storage
  .from('gallery')
  .getPublicUrl(path, { download: 'francis-grad-party-142.jpg' })
```

Always pass a friendly filename. A folder full of `a3f9c2e1.webp` is
useless to a guest.

### Tier 1 — single photo

Download button in the lightbox. Uses `?download=` with a readable
name. This is the common case on a phone.

### Tier 2 — select multiple

A **Select** toggle in the gallery header turns on selection mode:

- Each tile gets a checkbox; tapping a tile selects rather than opens
- Sticky action bar shows `N selected` plus **Download** and **Clear**
- **Select all on this page** selects the loaded batch
- Download fetches each selected `full` image, zips client-side with
  JSZip, and saves one file

**Cap selection at 40 photos.** Zipping happens in browser memory —
40 × ~300 KB is ~12 MB and safe, but a few hundred will crash a phone
tab. Past the cap, disable Download and surface: *"That's a lot —
grab the whole gallery instead"* linking to Tier 3.

Show progress while zipping; it's not instant and silence reads as
broken.

### Tier 3 — download everything

**Do not zip in the browser.** Generate archives once during ingest and
store them as plain files. Two tiers, because originals are heavy:

```
gallery/archives/photobooth-web.zip             (~55 MB)
gallery/archives/photobooth-originals.zip       (~55 MB)
gallery/archives/photographer-web.zip      (~90 MB)
gallery/archives/photographer-originals.zip (~1.1 GB)
```

**Default button = web-sized.** Label it plainly:

```
Download all · 90 MB
Download originals · 1.1 GB          (secondary, smaller, below)
```

The default must not be the 1.1 GB file. Most guests want photos for
their phone and Instagram; a handful want print quality. Make the
common case one tap and the heavy case deliberate.

Add a line under the originals link:

> Full resolution, straight from the camera. Best on a computer.

Archives regenerate whenever photos are added.

### Originals

Store the untouched files alongside the derivatives:

```
photobooth/original/<id>.jpg
photographer/original/<id>.jpg
```

- Lightbox gets a second download option: **Original** alongside the
  web-size download
- Serve with `?download=` and a friendly filename, same as everything else
- **Strip GPS only** — not all EXIF. Location data points at the house;
  camera, lens, and exposure data is harmless and worth keeping on a
  file someone may want to print or edit.

### Bandwidth note

Pro includes 250 GB egress per month. The 1.1 GB originals archive is
the only thing here big enough to matter — roughly 220 downloads would
reach the cap. Unlikely, but it's the reason the default button is the
90 MB version. Watch the usage page the first week.

### Mobile reality check

Be honest in the UI about how this works on a phone:

- A ZIP on iOS lands in **Files**, not the camera roll. The guest has
  to unzip it there and save photos manually.
- For a handful of photos on iPhone, the smoothest path is **long-press
  the image → Add to Photos**. No download needed.

So add a one-line tip above the gallery:

> On your phone? Long-press any photo to save it straight to your
> camera roll. Grabbing a lot? The zip works better on a computer.

That single line prevents most of the confusion.

---

## Pages

```
/              index.html      Thank-you note + two gallery entries + upload CTA
/booth         booth.html      Photo booth gallery (~70)
/photos        photos.html     Photographer gallery (~300)
/upload        upload.html     Guest upload form
```

Two **separate** galleries, not tabs. Landing page: short thank-you
note in the RSVP site's voice, then two gallery cards (cover photo +
name + count) in the double-rule frame, then the upload CTA.

---

## Database

```sql
create table photos (
  id          uuid primary key default gen_random_uuid(),
  gallery     text not null check (gallery in ('photobooth','photographer')),
  thumb_path  text not null,
  full_path   text not null,
  width       int  not null,
  height      int  not null,
  taken_at    timestamptz,
  sort_order  int  not null default 0
);

create index photos_gallery_idx on photos (gallery, sort_order);

create table uploads (
  id            uuid primary key default gen_random_uuid(),
  uploader_name text,
  note          text,
  file_path     text not null,
  mime_type     text,
  size_bytes    bigint,
  created_at    timestamptz not null default now(),
  approved      boolean not null default false
);
```

---

## Storage buckets

**`gallery`** — public read
```
photobooth/thumb/<id>.webp
photobooth/full/<id>.webp
photobooth/original/<id>.jpg
photographer/thumb/<id>.webp
photographer/full/<id>.webp
photographer/original/<id>.jpg
archives/photobooth-web.zip
archives/photobooth-originals.zip
archives/photographer-web.zip
archives/photographer-originals.zip
```

**`submissions`** — private, insert-only for anonymous users
```
<uuid>-<original-filename>
```

Guests can add files but cannot list or read the bucket. Review in the
Supabase dashboard, then flip `approved` on anything worth showing.

---

## RLS policies

```sql
alter table photos  enable row level security;
alter table uploads enable row level security;

create policy "photos are public"
  on photos for select using (true);

create policy "anyone can submit"
  on uploads for insert with check (true);
```

Storage: `gallery` bucket public read; `submissions` bucket policy
allows `insert` for role `anon` and nothing else.

**Note:** the anon key ships in the client JavaScript. That is normal
and safe *only* because RLS is doing the work. Do not skip the policies.

---

## Build pipeline (run locally, once per photo drop)

**Source photos live at:**

```
/Users/francis/Documents/Graduation/photobooth/      (~70 files,  55 MB)
/Users/francis/Documents/Graduation/photographer/    (~300 files, 1.1 GB)
```

**Before running:** confirm these are real local files, not iCloud
placeholders. If Desktop & Documents syncing is on, macOS may have
offloaded them — they appear in Finder but aren't on disk, and the
script will read empty stubs. Check with:

```bash
find /Users/francis/Documents/Graduation -name "*.icloud" | head
du -sh /Users/francis/Documents/Graduation/*
```

If `.icloud` files show up, or the sizes are far below 55 MB / 1.1 GB,
select all in Finder → right-click → **Download Now** first.

`scripts/ingest.js`:

1. Take `--gallery photobooth|photographer` and a source folder
2. For each image:
   - **Strip GPS** (photographer files may carry coordinates of the house).
     Keep camera/exposure EXIF — it's harmless and useful on originals.
   - Read original dimensions
   - `thumb`: longest edge 500px, WebP q78
   - `thumb@2x`: longest edge 1000px, WebP q72
   - `full`: longest edge 2000px, WebP q82
   - Upload to the `gallery` bucket
   - Insert a `photos` row with real width/height
3. Sort by capture time; write `sort_order`
4. Upload the **original** file untouched (GPS stripped) to
   `<gallery>/original/<id>.jpg`
5. **Build both archives** for that gallery and upload to
   `archives/<gallery>-web.zip` and `archives/<gallery>-originals.zip`,
   using friendly sequential filenames inside
   (`francis-grad-party-001.jpg` …)
6. Idempotent — re-running skips files already present

Expect ~30–60 KB per thumbnail, ~200–350 KB per full image. Totals:
derivatives ~150 MB, originals ~1.16 GB, archives ~1.3 GB —
about **2.6 GB**, trivial against a 100 GB quota.

---

## Gallery behavior

- Load **40 at a time**, fetch more on scroll. Never render 300 at once.
- Tap opens a lightbox with the `full` image, nav, and download button
- Lightbox image capped at `90vw` / `85vh`
- Gallery header: photo count, **Select** toggle, **Download all · N MB**,
  and a smaller **Download originals · N GB** beneath it

---

## Upload page

Fields: name (optional), note (optional), files
(`accept="image/*,video/*"`, multiple).

Behavior:

- **Use resumable (TUS) uploads, not `supabase-js` standard upload.**
  Supabase recommends resumable for anything over 6 MB, and the known
  speech video is 950 MB. A standard upload of that size will fail on a
  flaky connection with nothing to resume from. Use `tus-js-client` or
  Uppy against:

  ```
  https://<project-ref>.storage.supabase.co/storage/v1/upload/resumable
  ```

  Note the **direct storage hostname** (`.storage.supabase.co`, not
  `.supabase.co`) — the docs call this out specifically for large-file
  performance. Chunk size must be exactly 6 MB.

- Resumable gives real progress events, so the progress bar is accurate
- Bucket ceiling is 2 GB per file; guard client-side at the same
- Reject non-image/video before upload starts
- Insert an `uploads` row per file on success
- Confirmation in the voice of the RSVP site's "You're in."

**Check the project-level ceiling too.** Storage → Settings has a global
upload size limit that caps every bucket regardless of the bucket's own
setting. If it's lower than 2 GB, the bucket limit won't matter.

Lead with the specific ask:

> If you got video of the speech, this is the one I'm really after.

---

## Metadata

- `<title>` — `Thank You — Francis Grad Party`
- OG + Twitter tags, absolute URLs; `og:image` as **JPEG under 200 KB**
  (the RSVP site's 765 KB PNG broke Apple's preview fetcher)
- Reuse the existing favicon and apple-touch-icon files
- `<meta name="robots" content="noindex">`
- `<meta name="theme-color" content="#F6EFF2">`

---

## Privacy

370 photos of identifiable guests, no passcode.

- `noindex` keeps it out of search results
- URL shared directly with attendees only
- GPS stripping in the pipeline is **not optional**

---

## Build order

1. Supabase: tables, buckets, RLS policies
2. `scripts/ingest.js`, tested on 5 photos before the full 370
3. Booth gallery + single-photo download (smaller set — prove the pattern)
4. Photographer gallery (adds pagination pressure)
5. Selection mode + client-side zip
6. Archive generation in the pipeline + "Download all"
7. Upload page
8. Landing page tying it together
9. Metadata, `noindex`, DNS for `thanks.francismroberts.com`
