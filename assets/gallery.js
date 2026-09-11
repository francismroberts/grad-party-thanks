// ============================================================
// gallery.js — shared by booth.html and photos.html
//
// Reads `photos` rows for the gallery named in <body data-gallery>,
// renders tiles in blocks of 40 as they are needed, and drives the
// lightbox. The lightbox shows the `full` WebP and its single Download
// button serves the original JPG with a friendly filename. Talks to
// PostgREST with plain fetch: this page only reads one table and builds
// URLs, so the supabase-js bundle isn't worth its weight here.
//
// Two page shapes:
//   <div id="grid" class="grid [justified]">          one run of tiles;
//       blocks load in order as a sentinel below the grid comes into view
//   <div id="gallery" class="chapters [justified]">   sections, one per
//       chapter, driven by <script type="application/json" id="chapters">
//       [{ title }, { title, from: ISO }, …]. Each chapter starts at or
//       after its `from` (millisecond precision) and runs to the next
//       chapter's `from`. Counts are derived from the data. Blocks load
//       for whichever sections are on screen or just below, so a jump
//       link fills its own chapter first and the rest fills in on scroll.
//       An optional <nav id="jumps"> gets one link per chapter.
//
// Row shape (see docs/thank-you-site-spec.md + docs/STATUS.md):
//   id, thumb_path, full_path, original_path, width, height, sort_order
// The 2x thumb is derived: thumb_path with ".webp" → "@2x.webp".
// ============================================================

import { SUPABASE_URL, SUPABASE_KEY, GALLERY_BUCKET } from './supabase-config.js'

const BLOCK = 40
const SLUG = { photobooth: 'booth', photographer: 'photos' }
const LOOKAHEAD = 900 // px below the viewport that counts as "about to be seen"

// Justified-row layout. Rows are packed to hit a target height, then
// each row is scaled so its tiles fill the width exactly. Rows with
// portraits come out taller; nothing is cropped.
const ROW_TARGET = { mobile: 180, desktop: 260 }   // px; mobile < 768
const LAST_ROW_MAX_STRETCH = 1.35                    // a short final row keeps the target height past this

const body = document.body
const gallery = body.dataset.gallery
const slug = SLUG[gallery] || gallery
const publicBase = `${SUPABASE_URL}/storage/v1/object/public/${GALLERY_BUCKET}/`

// host: the element tiles live under. Either a single #grid, or a
// #gallery container that gets one <section class="chapter"> per chapter.
const singleGrid = document.getElementById('grid')
const chapterRoot = document.getElementById('gallery')
const host = chapterRoot || singleGrid
const justified = host.classList.contains('justified')
const chaptersJson = document.getElementById('chapters')
const chapters = chapterRoot && chaptersJson ? JSON.parse(chaptersJson.textContent) : null
const jumpsNav = document.getElementById('jumps')

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

// ---------- state ----------
const photos = []           // sparse: photos[index] = row, once its block has loaded
let total = null            // row count for this gallery
const grids = []            // grid elements in page order (one per chapter, or just #grid)
const sections = []         // chapter <section> elements (chapter pages only)
const ranges = []           // per chapter: { start, end } photo index range, or null if empty
let chapterByIndex = []     // photo index → chapter number; empty when no chapters
const loadedBlocks = new Set()
const inflight = new Map()  // block → promise
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

const headers = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
})

function setStatus(text) {
  if (text === null) {
    status.hidden = true
  } else {
    status.hidden = false
    status.textContent = text
  }
}
function updateCount() {
  if (total !== null && countEl) countEl.textContent = `${total} photo${total === 1 ? '' : 's'}`
}

// ---------- chapters ----------
// One small fetch of every capture time in the gallery (a few KB) so
// all section headings and counts can render before any photo loads,
// and so each arriving tile knows which section it belongs to.
async function loadChapters() {
  if (!chapters) {
    grids.push(singleGrid)
    return
  }
  const q = new URLSearchParams({ select: 'taken_at', gallery: `eq.${gallery}`, order: 'sort_order.asc' })
  const res = await fetch(`${SUPABASE_URL}/rest/v1/photos?${q}`, { headers: { ...headers(), Range: '0-9999' } })
  if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`)
  const times = (await res.json()).map((r) => Date.parse(r.taken_at))
  total = times.length
  updateCount()

  // A photo belongs to the last chapter whose start is <= its taken_at.
  const starts = chapters.map((c) => (c.from ? Date.parse(c.from) : -Infinity))
  const counts = chapters.map(() => 0)
  chapterByIndex = times.map((t) => {
    let k = 0
    for (let j = 1; j < starts.length; j++) if (t >= starts[j]) k = j
    counts[k]++
    return k
  })
  chapters.forEach((_, k) => {
    const first = chapterByIndex.indexOf(k)
    ranges[k] = first < 0 ? null : { start: first, end: chapterByIndex.lastIndexOf(k) }
  })

  const frag = document.createDocumentFragment()
  chapters.forEach((c, k) => {
    const sec = document.createElement('section')
    sec.className = 'chapter'
    sec.id = `chapter-${k + 1}`
    sec.dataset.chapter = k + 1

    const head = document.createElement('header')
    head.className = 'chead'
    const title = document.createElement('h2')
    title.className = 'ctitle'
    title.textContent = c.title
    title.tabIndex = -1
    const count = document.createElement('p')
    count.className = 'ccount'
    count.textContent = `${counts[k]} photo${counts[k] === 1 ? '' : 's'}`
    head.append(title, count)

    const g = document.createElement('div')
    g.className = justified ? 'grid justified' : 'grid'
    g.setAttribute('aria-label', c.title)
    g.dataset.count = counts[k]

    sec.append(head, g)
    frag.appendChild(sec)
    grids.push(g)
    sections.push(sec)
  })
  chapterRoot.appendChild(frag)

  if (jumpsNav) {
    chapters.forEach((c, k) => {
      const a = document.createElement('a')
      a.href = `#chapter-${k + 1}`
      a.textContent = c.title
      a.addEventListener('click', (e) => {
        e.preventDefault()
        jumpTo(k)
      })
      jumpsNav.appendChild(a)
    })
  }
}

function gridFor(index) {
  if (!chapters || !chapterByIndex.length) return grids[0]
  const k = chapterByIndex[index] ?? chapters.length - 1
  return grids[k]
}

const blockOf = (index) => Math.floor(index / BLOCK)
function blocksIn(range) {
  if (!range) return []
  const out = []
  for (let b = blockOf(range.start); b <= blockOf(range.end); b++) out.push(b)
  return out
}
const blockPending = (b) => loadedBlocks.has(b) || inflight.has(b)

// ---------- loading ----------
// Load one block of 40 rows and place its tiles. Idempotent; concurrent
// calls for the same block share one request.
function loadBlock(b) {
  if (loadedBlocks.has(b)) return Promise.resolve()
  if (inflight.has(b)) return inflight.get(b)
  if (total !== null && b * BLOCK >= total) return Promise.resolve()

  const p = (async () => {
    const from = b * BLOCK
    const to = from + BLOCK - 1
    const q = new URLSearchParams({
      select: 'id,thumb_path,full_path,original_path,width,height,sort_order',
      gallery: `eq.${gallery}`,
      order: 'sort_order.asc',
    })
    const res = await fetch(`${SUPABASE_URL}/rest/v1/photos?${q}`, {
      headers: { ...headers(), Range: `${from}-${to}`, Prefer: 'count=exact' },
    })
    if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`)
    const rows = await res.json()
    const m = (res.headers.get('content-range') || '').match(/\/(\d+)$/)
    if (m) {
      total = Number(m[1])
      updateCount()
    }
    rows.forEach((row, i) => { photos[from + i] = row })
    placeTiles(rows, from)
    loadedBlocks.add(b)
  })()

  inflight.set(b, p)
  setStatus(photos.length ? 'Loading more…' : 'Loading…')
  p.catch((err) => {
    console.error(err)
    setStatus('Couldn’t load the photos. Refresh to try again.')
  }).finally(() => {
    inflight.delete(b)
    if (!inflight.size && !status.textContent.startsWith('Couldn’t')) setStatus(null)
    if (total === 0) setStatus('No photos here yet.')
  })
  return p
}

// ---------- tiles ----------
function makeTile(p, index) {
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
  return b
}

// Insert tiles in index order (blocks can arrive out of order), then
// re-lay-out each grid that changed. If a grid starts above the viewport,
// its growth is compensated so what the person is looking at stays put.
function placeTiles(rows, startIndex) {
  const touched = new Map() // grid → { before: rect }
  rows.forEach((p, i) => {
    const index = startIndex + i
    const g = gridFor(index)
    if (!touched.has(g)) touched.set(g, g.getBoundingClientRect())
    const tile = makeTile(p, index)
    let after = null
    for (const child of g.children) {
      if (Number(child.dataset.index) > index) { after = child; break }
    }
    g.insertBefore(tile, after)
  })
  for (const [g, before] of touched) {
    if (justified) layoutJustified(g)
    if (before.top < 0) {
      const delta = g.getBoundingClientRect().height - before.height
      if (delta) window.scrollBy(0, delta)
    }
  }
}

// ---------- justified rows ----------
// Same gutters as the CSS grid breakpoints.
function gutter(vw) {
  return vw < 480 ? 8 : vw < 768 ? 10 : vw < 1024 ? 12 : vw < 1440 ? 14 : 16
}

function layoutJustified(grid) {
  const W = grid.clientWidth
  const tiles = grid.children
  if (!W) return
  if (!tiles.length) {
    grid.style.height = '0px'
    return
  }
  const vw = window.innerWidth
  const target = vw < 768 ? ROW_TARGET.mobile : ROW_TARGET.desktop
  const gap = gutter(vw)

  let y = 0
  let row = []       // [{ el, ar }]
  let rowAr = 0      // sum of aspect ratios in the row

  const widthAt = (h, n, ar) => ar * h + gap * (n - 1)

  const flush = (isLast) => {
    const n = row.length
    let h = (W - gap * (n - 1)) / rowAr
    if (isLast && h > target * LAST_ROW_MAX_STRETCH) h = target
    let x = 0
    row.forEach(({ el, ar }, i) => {
      // last tile takes the remainder so the row edge lands exactly on W
      const w = i === n - 1 && !isLast ? W - x : ar * h
      el.style.left = `${x.toFixed(2)}px`
      el.style.top = `${y.toFixed(2)}px`
      el.style.width = `${w.toFixed(2)}px`
      el.style.height = `${h.toFixed(2)}px`
      x += w + gap
    })
    y += h + gap
    row = []
    rowAr = 0
  }

  for (let i = 0; i < tiles.length; i++) {
    const p = photos[Number(tiles[i].dataset.index)]
    const ar = p.width / p.height
    const withoutW = widthAt(target, row.length, rowAr)
    const withW = widthAt(target, row.length + 1, rowAr + ar)
    // If adding this photo overshoots the width, decide which is closer
    // to the target: the row without it, or the row with it.
    if (row.length && withW > W && W - withoutW < withW - W) {
      flush(false)
    }
    row.push({ el: tiles[i], ar })
    rowAr += ar
    if (widthAt(target, row.length, rowAr) >= W) flush(false)
  }
  if (row.length) flush(true)

  grid.style.height = `${Math.max(0, y - gap).toFixed(2)}px`
}

if (justified) {
  let raf = 0
  window.addEventListener('resize', () => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => grids.forEach(layoutJustified))
  })
}

// ---------- what to load next ----------
// Single-grid pages: a sentinel under the grid loads the next block in
// order — the classic 40-then-scroll. One block at a time: while one is
// in flight, wait; when it lands, look again in case the sentinel is
// still within reach (short galleries, tall screens).
function pumpSentinel() {
  if (chapters || inflight.size) return
  const near = sentinel.getBoundingClientRect().top < window.innerHeight + LOOKAHEAD
  if (!near) return
  let b = 0
  while (loadedBlocks.has(b)) b++
  if (total !== null && b * BLOCK >= total) {
    sentinelObserver.disconnect()
    return
  }
  loadBlock(b).finally(pumpSentinel)
}
const sentinelObserver = new IntersectionObserver(
  (entries) => {
    if (entries.some((en) => en.isIntersecting)) pumpSentinel()
  },
  { rootMargin: `${LOOKAHEAD}px 0px` },
)

// Chapter pages: look at the sections on screen (or within LOOKAHEAD
// below) in document order and load the first missing block among them.
// Repeat until that area is filled. Sections entirely above the
// viewport wait until they are scrolled back into view, so a jump to a
// late chapter doesn't drag everything above it in.
let filling = false
function fillVisible() {
  if (!chapters || filling) return
  const limit = window.innerHeight + LOOKAHEAD
  for (let k = 0; k < sections.length; k++) {
    const r = sections[k].getBoundingClientRect()
    if (r.bottom < 0) continue
    if (r.top > limit) break
    const b = blocksIn(ranges[k]).find((x) => !blockPending(x))
    if (b === undefined) continue
    filling = true
    loadBlock(b).finally(() => {
      filling = false
      fillVisible()
    })
    return
  }
}
if (chapters) {
  let raf = 0
  const schedule = () => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(fillVisible)
  }
  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule)
}

// ---------- jump links ----------
async function jumpTo(k) {
  const sec = sections[k]
  if (!sec) return
  history.replaceState(null, '', `#${sec.id}`)
  // Load this chapter's own blocks first, in parallel, then go.
  await Promise.all(blocksIn(ranges[k]).map(loadBlock))
  sec.scrollIntoView({ block: 'start' })
  window.scrollBy(0, -12)
  sec.querySelector('.ctitle').focus({ preventScroll: true })
  fillVisible()
}

function jumpFromHash() {
  const m = location.hash.match(/^#chapter-(\d+)$/)
  if (!m) return false
  const k = Number(m[1]) - 1
  if (!sections[k]) return false
  jumpTo(k)
  return true
}

// ---------- clicks ----------
host.addEventListener('click', (e) => {
  const tile = e.target.closest('.tile')
  if (!tile) return
  openedFrom = tile
  open(Number(tile.dataset.index))
})

// ---------- lightbox ----------
function open(i) {
  show(i)
  if (!lb.open) lb.showModal()
}

async function show(i) {
  if (i < 0) return
  if (total !== null && i >= total) return
  if (!photos[i]) {
    await loadBlock(blockOf(i))
    if (!photos[i]) return
  }
  current = i
  const p = photos[i]

  lbImg.src = url(p.full_path)
  lbImg.width = p.width
  lbImg.height = p.height
  lbImg.alt = `Photo ${p.sort_order + 1}`

  lbCounter.textContent = `${p.sort_order + 1} / ${total ?? '…'}`

  // One download button, and it serves the original JPG: guests saving
  // a photo want a file that opens anywhere, not the WebP web derivative.
  // The full WebP is only what the lightbox displays.
  const dlPath = p.original_path || p.full_path
  lbDl.href = downloadUrl(dlPath, friendlyName(p, extOf(dlPath)))

  lbPrev.disabled = i === 0
  lbNext.disabled = total !== null && i >= total - 1

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
setStatus('Loading…')
loadChapters()
  .catch((err) => {
    // Chapter headings are a nicety; the photos must still load. Fall
    // back to a single unlabelled section.
    console.error(err)
    if (chapters && !grids.length) {
      const g = document.createElement('div')
      g.className = justified ? 'grid justified' : 'grid'
      chapterRoot.appendChild(g)
      grids.push(g)
      chapterByIndex = []
    }
  })
  .then(() => {
    if (chapters && sections.length) {
      if (!jumpFromHash()) fillVisible()
    } else {
      loadBlock(0).finally(() => sentinelObserver.observe(sentinel))
    }
  })
