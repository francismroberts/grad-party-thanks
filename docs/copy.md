# Site copy

Every user-facing string, by page, in the order a visitor meets it.
Each entry: the text, the file it lives in, and where/when it shows.
Strings in `assets/gallery.js` appear on both gallery pages; strings in
`assets/upload.js` appear on the landing page and `/upload`.

Notation: `{n}` is a number filled in at runtime, `{size}` a formatted
size like "67 MB" or "1.0 GB", `{name}` a file name. `…` is the literal
ellipsis character. "aria" means screen-reader-only text.

---

## index.html — landing

| Text | File | Where / when |
|---|---|---|
| Thank You — Francis Grad Party | index.html | Browser tab title |
| Thank you for coming. The photos are here, and if you got video of the speech, I need it. | index.html | Meta description and link-preview description (iMessage, WhatsApp) |
| Thank You — Francis Grad Party | index.html | Link-preview title (`og:title`) |
| Thank you | index.html | Small tracked label above the headline |
| You came. That was the whole point. | index.html | Headline (h1) |
| I graduated, I threw a party about it, and you showed up. I'm still not over it. | index.html | Lead line under the headline, serif |
| The photos are below — the booth strips and everything the photographer caught, in order. Take whatever you're in. Take whatever you like. They're yours. | index.html | Body paragraph |
| If you got video of the speech, scroll down — I need it ↓ | index.html | Tracked uppercase link, anchors to the upload form |
| The photographer's | index.html | Caption band over the photographer card's cover photo |
| Photos | index.html | Small label under the photographer card, left |
| {n} photos | index.html (rendered by its inline script) | Italic count under the photographer card, right; live from the database, e.g. "294 photos" |
| The booth strips | index.html | Caption band over the booth card's cover photo |
| Photo booth | index.html | Small label under the booth card, left |
| {n} photos | index.html (inline script) | Italic count under the booth card, e.g. "70 photos" |
| *(upload form — see the Upload form section below; it appears here in full)* | assets/upload.js | Between the cards and the closing note |
| Made with the same care as the invitation. Thank you again, for all of it. | index.html | Italic closing line at the very bottom |

---

## booth.html — photo booth gallery

| Text | File | Where / when |
|---|---|---|
| Photo Booth — Thank You — Francis Grad Party | booth.html | Browser tab title and link-preview title |
| Every photo the booth caught at the party. Grab yours. | booth.html | Meta and link-preview description |
| ← Thank you | booth.html | Tracked link at the top, back to the landing page |
| Photo booth | booth.html | Small tracked label above the headline |
| Everything the booth caught. | booth.html | Headline (h1) |
| In order, start to finish. If you were in it, it's yours. | booth.html | Lead line |
| On your phone? Long-press any photo to save it straight to your camera roll. Grabbing a lot? The zip works better on a computer. | booth.html | Italic tip above the gallery |
| {n} photos | assets/gallery.js | Gallery header, left; live count, e.g. "70 photos" |
| Select | booth.html | Gallery header button; enters select mode |
| Done | assets/gallery.js | Same button while select mode is on |
| Download all · {size} | booth.html + assets/gallery.js | Gallery header primary button; size read from the archive, e.g. "Download all · 35 MB". Shows "…" for the size until known; whole block hidden if no archive |
| Full resolution, straight from the booth. Best on a computer. | booth.html | Italic note under the Download all button |
| Photo booth gallery | booth.html | aria: name of the grid |
| Loading… | booth.html / assets/gallery.js | Status line under the grid while the first 40 load |
| Loading more… | assets/gallery.js | Same line while a later block of 40 loads |
| Couldn’t load the photos. Refresh to try again. | assets/gallery.js | Same line if a block fails to load |
| No photos here yet. | assets/gallery.js | Same line if the gallery has zero rows (empty state) |
| Photo {n} of {total} — photo booth strip | assets/gallery.js | Alt text on every tile and on the lightbox image; what a screen reader says for each photo |
| ← Back to the thank-you note | booth.html | Tracked link under the gallery |

### Lightbox (booth) — opens when a tile is tapped

| Text | File | Where / when |
|---|---|---|
| Photo viewer | booth.html | aria: name of the lightbox dialog |
| {n} / {total} | assets/gallery.js | Counter top-left, e.g. "12 / 70" |
| Close ✕ | booth.html | Top-right button |
| ‹ / › | booth.html | Previous / next arrows (aria: "Previous photo", "Next photo") |
| Download | booth.html | Bottom button; downloads the original JPG |

### Select mode (booth) — after tapping Select

| Text | File | Where / when |
|---|---|---|
| Selection | booth.html | aria: name of the floating bar |
| 0 selected | booth.html | Bar, left, before anything is picked |
| {n} selected · {size} | assets/gallery.js | Bar, left, live; e.g. "18 selected · 67 MB". Ends with "…" while sizes are still being fetched |
| Select all shown | booth.html | Bar button; selects every loaded tile |
| Clear | booth.html | Bar button |
| Cancel | booth.html | Bar button, only while a zip is being built |
| Download | booth.html | Bar primary button; disabled at 0 selected or over the cap |
| That's a lot — {size}. Grab the whole gallery instead, or pick fewer. | assets/gallery.js | Note under the bar when the selection passes 2 GB; "Grab the whole gallery instead" is a link to the Download all archive |
| That's a lot — {size}. Pick fewer photos. | assets/gallery.js | Same, when no archive is available to link to |
| Preparing… | assets/gallery.js | Bar counter for a moment after tapping Download, while sizes are confirmed |
| Zipping… {size} of {size} | assets/gallery.js | Bar counter with a progress bar while the zip streams, e.g. "Zipping… 34 MB of 150 MB" |
| Zipping… {size} | assets/gallery.js | Same, if the total isn't known |
| Done · {size} | assets/gallery.js | Bar counter for ~2 s after the zip is saved |
| This browser can't stream a zip that big ({size}). Pick fewer photos, or use a computer. | assets/gallery.js | Note under the bar on browsers that can only buffer in memory, when the selection is over 150 MB |
| Couldn't build the zip: {error}. Try again, or grab fewer photos. | assets/gallery.js | Note under the bar if the zip fails mid-way; `{error}` is the technical message, e.g. "HTTP 404 fetching francis-grad-party-booth-012.jpg" |

### Floating pill (booth)

| Text | File | Where / when |
|---|---|---|
| ↑ | booth.html | Pill, bottom centre, appears once scrolled into the photos (aria: "Back to top") |

---

## photos.html — photographer gallery

| Text | File | Where / when |
|---|---|---|
| Photos — Thank You — Francis Grad Party | photos.html | Browser tab title and link-preview title |
| Every photo the photographer took at the party. Grab yours. | photos.html | Meta and link-preview description |
| ← Thank you | photos.html | Tracked link at the top |
| Photos | photos.html | Small tracked label above the headline |
| Everything the camera caught. | photos.html | Headline (h1) |
| In order, from the first arrivals to the end of the night. If you're in one, it's yours. | photos.html | Lead line |
| On your phone? Long-press any photo to save it straight to your camera roll. Grabbing a lot? The zip works better on a computer. | photos.html | Italic tip above the gallery |
| {n} photos | assets/gallery.js | Gallery header, left; live count, "294 photos" |
| Select / Done | photos.html + assets/gallery.js | Gallery header button, as on booth |
| Download all · {size} | photos.html + assets/gallery.js | Gallery header primary button, "Download all · 1.0 GB" |
| Full resolution, straight from the camera. Best on a computer. | photos.html | Italic note under the Download all button |
| Photographer gallery | photos.html | aria: name of the gallery |

### Chapter headings (photos) — one section each, in this order

| Text | File | Where / when |
|---|---|---|
| Before Everyone Arrived | photos.html (chapters JSON) | Section heading, tracked uppercase; also in the pill and the chapter sheet |
| First Hellos | photos.html | Same |
| The Party Gets Going | photos.html | Same |
| Party and Portraits | photos.html | Same |
| Dinner Is Served | photos.html | Same |
| Toasts, Gifts & After Dark | photos.html | Same |
| The Speech and Mac and Cheese | photos.html | Same |
| {n} photos | assets/gallery.js | Italic count on the right of every chapter heading and in the sheet, e.g. "102 photos" |
| Loading… / Loading more… / Couldn’t load the photos. Refresh to try again. / No photos here yet. | photos.html / assets/gallery.js | Status line under the gallery, as on booth |
| Photo {n} of {total} — {chapter name} | assets/gallery.js | Alt text on every tile and the lightbox image, e.g. "Photo 43 of 294 — Party and Portraits" |
| ← Back to the thank-you note | photos.html | Tracked link under the gallery |

### Lightbox (photos)

Identical to the booth lightbox: Photo viewer · {n} / {total} · Close ✕ · ‹ › · Download. Files: photos.html + assets/gallery.js.

### Select mode (photos)

Identical strings to booth select mode, from photos.html + assets/gallery.js. The over-cap link goes to the photographer originals archive.

### Floating pill + chapter sheet (photos)

| Text | File | Where / when |
|---|---|---|
| Chapters | photos.html | Pill left zone before the first chapter is detected (replaced immediately on load) |
| {chapter name} | assets/gallery.js | Pill left zone, live: names the chapter currently in view; truncates with an ellipsis when long |
| ︿ | photos.html | Chevron in the pill left zone (decorative) |
| ↑ | photos.html | Pill right zone (aria: "Back to top") |
| Chapters | photos.html | aria: name of the sheet dialog, and the small label at the top of the sheet |
| Close ✕ | photos.html | Sheet top-right button |
| {chapter name} · {n} photos | assets/gallery.js | One row per chapter in the sheet; the current chapter is highlighted in lavender |

---

## upload.html — standalone upload page

| Text | File | Where / when |
|---|---|---|
| Upload — Thank You — Francis Grad Party | upload.html | Browser tab title |
| Got video of the speech? — Francis Grad Party | upload.html | Link-preview title (`og:title`), what people see when the link is texted |
| If you got a good video of the speech, upload it here for me. | upload.html | Meta and link-preview description |
| ← Thank you | upload.html | Tracked link at the top |
| Upload | upload.html | Small tracked label above the headline |
| Send me what you caught. | upload.html | Headline (h1) |
| Especially the speech. Whatever you've got, this is the place. | upload.html | Lead line |
| *(upload form — see below)* | assets/upload.js | The form itself |
| ← Back to the thank-you note | upload.html | Tracked link at the bottom |

---

## Upload form (assets/upload.js) — on index.html and upload.html

In the order a person meets it.

| Text | File | Where / when |
|---|---|---|
| Uploads | assets/upload.js | Small tracked label at the top of the form card |
| If you got a good video of the speech, upload it here for me. | assets/upload.js | Form heading (h2) |
| Photos too — anything from the day you'd want me to have. Big files are fine: if your connection drops, it picks up where it left off. | assets/upload.js | Paragraph under the heading |
| Your name | assets/upload.js | Field label |
| optional | assets/upload.js | Small tag after "Your name" and "A note" |
| A note | assets/upload.js | Field label (textarea) |
| Files | assets/upload.js | Field label above the picker |
| Choose photos or video | assets/upload.js | The dashed picker button, before any file is chosen |
| {n} file(s) chosen · choose different | assets/upload.js | The picker button after choosing, e.g. "2 files chosen · choose different" |
| Images and video, up to 2 GB each. | assets/upload.js | Italic hint under the picker |
| {name} / {size} | assets/upload.js | Each chosen file: name left, size right, e.g. "IMG_4021.MOV / 950 MB" |
| Ready | assets/upload.js | Per-file status before upload starts |
| Remove | assets/upload.js | Per-file action before upload starts, and on rejected files |
| Not a photo or video — skipped | assets/upload.js | Per-file status, red, for a file that isn't an image or video (never uploaded) |
| Over 2 GB ({size}) — skipped | assets/upload.js | Per-file status, red, for a file over the limit |
| Empty file — skipped | assets/upload.js | Per-file status, red, for a zero-byte file |
| {n} file(s) · {size} | assets/upload.js | Total line under the list before uploading, e.g. "3 files · 1.2 GB" |
| Upload | assets/upload.js | Submit button; disabled until there's something valid to send |
| Uploading… {n}% · {size} of {size} | assets/upload.js | Per-file status with a progress bar while that file uploads, e.g. "Uploading… 42% · 400 MB of 950 MB" |
| Uploading {n} of {total} · {size} of {size} | assets/upload.js | Total line while uploading, e.g. "Uploading 2 of 5 · 340 MB of 1.2 GB" |
| Finishing… {size} of {size} | assets/upload.js | Total line for a moment between the last byte and the record being saved |
| Uploading… | assets/upload.js | Submit button label while uploading (disabled) |
| Done | assets/upload.js | Per-file status after a successful upload |
| Didn't make it: {error} | assets/upload.js | Per-file status, red, when a file fails after retries; `{error}` is the server or network message, trimmed to 140 characters |
| Retry | assets/upload.js | Per-file action on a failed file; resumes that file from where it stopped |
| {n} of {total} uploaded · {size} total | assets/upload.js | Total line after a run, e.g. "4 of 5 uploaded · 1.2 GB total" |
| Retry the rest | assets/upload.js | Submit button label when some files failed and some succeeded |
| *(browser dialog)* | assets/upload.js | If they try to leave mid-upload, the browser shows its own "Leave site? Changes you made may not be saved." — not editable |

### Confirmation (appears under the form when at least one file made it)

| Text | File | Where / when |
|---|---|---|
| They're in. | assets/upload.js | Small tracked label, the "You're in." echo |
| Got it. Thank you. | assets/upload.js | Confirmation heading when exactly one file uploaded |
| Got all {n}. Thank you. | assets/upload.js | Confirmation heading when several uploaded, e.g. "Got all 4. Thank you." |
| I'll watch it tonight. Seriously — thank you. | assets/upload.js | Confirmation line when at least one upload was a video |
| I'll go through everything this week and add the good ones to the galleries. | assets/upload.js | Confirmation line when the uploads were photos only |
| {n} of {total} made it. | assets/upload.js | Confirmation heading when some files failed, e.g. "3 of 5 made it." |
| Hit Retry on the one that didn't whenever you're ready — it starts from where it stopped. | assets/upload.js | Confirmation line when exactly one file failed |
| Hit Retry on the ones that didn't whenever you're ready — it starts from where it stopped. | assets/upload.js | Same, when more than one failed |

---

## Download filenames (what lands in a guest's Downloads folder)

| Text | File | Where / when |
|---|---|---|
| francis-grad-party-booth-001.jpg | assets/gallery.js | Single-photo download from the booth lightbox; number is the photo's position |
| francis-grad-party-photos-043.jpg | assets/gallery.js | Same, photographer gallery |
| francis-grad-party-booth-3-photos.zip / francis-grad-party-photos-12-photos.zip | assets/gallery.js | Select-mode zip; "1-photo" when it's one |
| francis-grad-party-booth-all.zip / francis-grad-party-photos-all.zip | assets/gallery.js | Download all archive |
| francis-grad-party-booth-001.jpg … | scripts/ingest.js | Filenames inside the archives (same scheme) |
