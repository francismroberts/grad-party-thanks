// ============================================================
// gallery.js — shared by booth.html and photos.html
//
// Reads `photos` rows for the gallery named in <body data-gallery>,
// renders tiles 40 at a time as the user scrolls, and drives the
// lightbox. The lightbox shows the `full` WebP and its single Download
// button serves the original JPG with a friendly filename. Talks to PostgREST with plain fetch: this page only reads
// one table and builds URLs, so the supabase-js bundle isn't worth
// its weight here.
//
// Row shape (see docs/thank-you-site-spec.md + docs/STATUS.md):
//   id, thumb_path, full_path, original_path, width, height, sort_order
// The 2x thumb is derived: thumb_path with ".webp" → "@2x.webp".
// ============================================================

import { SUPABASE_URL, SUPABASE_KEY, GALLERY_BUCKET } from './supabase-config.js'

const PAGE = 40
const SLUG = { photobooth: 'booth', photographer: 'photos' }

const body = document.body
const gallery = body.dataset.gallery
const slug = SLUG[gallery] || gallery
const publicBase = `${SUPABASE_URL}/storage/v1/object/public/${GALLERY_BUCKET}/`

const grid = document.getElementById('grid')
const status = document.getElementById('gstatus')
const sentinel = document.getElementById('sentinel')
const countEl = document.getElementById('count')

const lb = document.getElementById('lb')
const lbImg = document.getElementById('lb-img')
const lbCounter = document.getElementById('lb-counter')
const lbPrev = document.getElementById('lb-prev')
const lbNext = document.getElementById('lb-next')
const lbDl = document.getElementById('lb-dl')
const lbClose = document.getElementById('lb-close')

const photos = []
let total = null
let loading = false
let done = false
let current = -1
let openedFrom = null

// ---------- urls & names ----------
const url = (path) => publicBase + path
const thumb2x = (path) => path.replace(/\.webp$/, '@2x.webp')

function friendlyName(photo, ext) {
  const n = String(photo.sort_order + 1).padStart(3, '0')
  return `francis-grad-party-${slug}-${n}.${ext}`
}
function extOf(path) {
  const m = path.match(/\.([a-z0-9]+)$/i)
  return m ? m[1].toLowerCase() : 'jpg'
}
// Supabase's ?download= sets Content-Disposition: attachment, which is
// the only thing that makes a cross-origin download actually download.
function downloadUrl(path, name) {
  return `${url(path)}?download=${encodeURIComponent(name)}`
}

// ---------- data ----------
async function fetchPage() {
  if (loading || done) return
  loading = true
  status.hidden = false
  status.textContent = photos.length ? 'Loading more…' : 'Loading…'
  try {
    const from = photos.length
    const to = from + PAGE - 1
    const q = new URLSearchParams({
      select: 'id,thumb_path,full_path,original_path,width,height,sort_order',
      gallery: `eq.${gallery}`,
      order: 'sort_order.asc',
    })
    const res = await fetch(`${SUPABASE_URL}/rest/v1/photos?${q}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Range: `${from}-${to}`,
        Prefer: 'count=exact',
      },
    })
    if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`)
    const rows = await res.json()
    const range = res.headers.get('content-range') // "0-39/70"
    const m = range && range.match(/\/(\d+)$/)
    if (m) total = Number(m[1])

    const startIndex = photos.length
    photos.push(...rows)
    renderTiles(rows, startIndex)

    if (total !== null && countEl) {
      countEl.textContent = `${total} photo${total === 1 ? '' : 's'}`
    }
    if (rows.length < PAGE || (total !== null && photos.length >= total)) done = true
    status.hidden = true
    if (photos.length === 0) {
      status.hidden = false
      status.textContent = 'No photos here yet.'
    }
  } catch (err) {
    status.hidden = false
    status.textContent = 'Couldn’t load the photos. Refresh to try again.'
    console.error(err)
  } finally {
    loading = false
    if (done) observer.disconnect()
  }
}

// ---------- tiles ----------
function renderTiles(rows, startIndex) {
  const frag = document.createDocumentFragment()
  rows.forEach((p, i) => {
    const index = startIndex + i
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'tile'
    b.dataset.index = index
    b.setAttribute('aria-label', `Open photo ${p.sort_order + 1}`)

    const img = document.createElement('img')
    img.src = url(p.thumb_path)
    img.srcset = `${url(p.thumb_path)} 1x, ${url(thumb2x(p.thumb_path))} 2x`
    img.width = p.width
    img.height = p.height
    img.loading = 'lazy'
    img.decoding = 'async'
    img.alt = ''
    b.appendChild(img)
    frag.appendChild(b)
  })
  grid.appendChild(frag)
}

grid.addEventListener('click', (e) => {
  const tile = e.target.closest('.tile')
  if (!tile) return
  openedFrom = tile
  open(Number(tile.dataset.index))
})

const observer = new IntersectionObserver(
  (entries) => {
    if (entries.some((en) => en.isIntersecting)) fetchPage()
  },
  { rootMargin: '900px 0px' },
)

// ---------- lightbox ----------
function open(i) {
  show(i)
  if (!lb.open) lb.showModal()
}

async function show(i) {
  if (i < 0) return
  if (i >= photos.length) {
    if (done) return
    await fetchPage()
    if (i >= photos.length) return
  }
  current = i
  const p = photos[i]

  lbImg.src = url(p.full_path)
  lbImg.width = p.width
  lbImg.height = p.height
  lbImg.alt = `Photo ${p.sort_order + 1}`

  const totalLabel = total ?? photos.length
  lbCounter.textContent = `${p.sort_order + 1} / ${totalLabel}`

  // One download button, and it serves the original JPG: guests saving
  // a photo want a file that opens anywhere, not the WebP web derivative.
  // The full WebP is only what the lightbox displays.
  const dlPath = p.original_path || p.full_path
  lbDl.href = downloadUrl(dlPath, friendlyName(p, extOf(dlPath)))

  lbPrev.disabled = i === 0
  lbNext.disabled = done && i >= photos.length - 1

  // warm the neighbours so paging feels instant
  for (const j of [i - 1, i + 1]) {
    if (photos[j]) new Image().src = url(photos[j].full_path)
  }
}

lbPrev.addEventListener('click', () => show(current - 1))
lbNext.addEventListener('click', () => show(current + 1))
lbClose.addEventListener('click', () => lb.close())

lb.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') { e.preventDefault(); show(current - 1) }
  else if (e.key === 'ArrowRight') { e.preventDefault(); show(current + 1) }
})

// swipe
let touchX = null
let touchY = null
lb.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1) return
  touchX = e.touches[0].clientX
  touchY = e.touches[0].clientY
}, { passive: true })
lb.addEventListener('touchend', (e) => {
  if (touchX === null) return
  const dx = e.changedTouches[0].clientX - touchX
  const dy = e.changedTouches[0].clientY - touchY
  touchX = touchY = null
  if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    if (dx < 0) show(current + 1)
    else show(current - 1)
  }
}, { passive: true })

// tap on the dark area (not the photo or controls) closes
lb.addEventListener('click', (e) => {
  if (e.target === lb || e.target.classList.contains('stage')) lb.close()
})

lb.addEventListener('close', () => {
  lbImg.removeAttribute('src')
  if (openedFrom && document.contains(openedFrom)) openedFrom.focus({ preventScroll: true })
  openedFrom = null
})

// ---------- go ----------
observer.observe(sentinel)
fetchPage()
