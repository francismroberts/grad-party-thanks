// ============================================================
// upload.js — guest upload form, shared by index.html and upload.html
//
// Mounts into <div id="uploader"> and renders the whole form. Uploads
// go to the private, insert-only `submissions` bucket with resumable
// TUS uploads (tus-js-client, vendored as window.tus), 6 MB chunks,
// against the direct storage hostname. A 950 MB speech video on a
// flaky connection picks up where it left off instead of starting over.
//
//   - one file at a time, per-file progress with a real percentage
//   - running total: "Uploading 2 of 5 · 340 MB of 1.2 GB"
//   - 2 GB per-file guard and image/video-only check before anything starts
//   - an `uploads` row per successful file (plain fetch to PostgREST;
//     RLS allows anon insert and nothing else)
//   - beforeunload warning while anything is in flight
//   - per-file Retry that resumes that file only
// ============================================================

import { SUPABASE_URL, SUPABASE_KEY, RESUMABLE_ENDPOINT, SUBMISSIONS_BUCKET } from './supabase-config.js'

const MAX_BYTES = 2 * 1024 ** 3          // bucket limit, mirrored client-side
const CHUNK = 6 * 1024 * 1024            // Supabase requires exactly 6 MB
const VIDEO_EXT = /\.(mp4|mov|m4v|avi|mkv|webm|3gp|hevc)$/i
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|tiff?|bmp|avif|dng)$/i

const root = document.getElementById('uploader')

function fmtBytes(b) {
  if (b >= 1000 * 1024 ** 2) return `${(b / 1024 ** 3).toFixed(1)} GB`
  if (b >= 1024 ** 2) return `${Math.round(b / 1024 ** 2)} MB`
  return `${Math.max(1, Math.round(b / 1024))} KB`
}

function isMedia(file) {
  if (file.type.startsWith('image/') || file.type.startsWith('video/')) return true
  // some browsers leave type empty for .mov/.heic etc.
  return !file.type && (VIDEO_EXT.test(file.name) || IMAGE_EXT.test(file.name))
}

// The same file on the same device gets the same object name across
// retries and reloads, so a resumed upload keeps writing the object it
// started, and the row we insert points at the right path.
const fingerprint = (file) => `upl:${file.name}:${file.size}:${file.lastModified}`
function objectNameFor(file) {
  const key = fingerprint(file)
  try {
    const known = localStorage.getItem(key)
    if (known) return known
  } catch { /* storage unavailable */ }
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-120)
  const name = `${crypto.randomUUID()}-${safe}`
  try { localStorage.setItem(key, name) } catch { /* ignore */ }
  return name
}
function forgetObjectName(file) {
  try { localStorage.removeItem(fingerprint(file)) } catch { /* ignore */ }
}

// ---------- markup ----------
root.innerHTML = `
<form class="upl" id="upl" novalidate>
  <p class="label">Uploads</p>
  <h2 class="upl-h">If you got a good video of the speech, upload it here for me.</h2>
  <p class="prose">Photos too — anything from the day you'd want me to have. Big files are fine: if your connection drops, it picks up where it left off.</p>

  <div class="field">
    <label for="upl-name">Your name <span class="opt">optional</span></label>
    <input id="upl-name" name="name" type="text" autocomplete="name" maxlength="120">
  </div>
  <div class="field">
    <label for="upl-note">A note <span class="opt">optional</span></label>
    <textarea id="upl-note" name="note" rows="2" maxlength="1000"></textarea>
  </div>
  <div class="field">
    <span class="flabel" id="upl-files-label">Files</span>
    <label class="picker" for="upl-files"><span class="picker-text" id="upl-picker-text">Choose photos or video</span></label>
    <input id="upl-files" name="files" type="file" accept="image/*,video/*" multiple class="vh" aria-labelledby="upl-files-label">
    <p class="hint">Images and video, up to 2 GB each.</p>
  </div>

  <ul class="ufiles" id="upl-list" aria-live="polite"></ul>
  <p class="utotal" id="upl-total" hidden></p>
  <button class="btn" id="upl-go" type="submit" disabled>Upload</button>

  <div class="udone" id="upl-done" hidden role="status">
    <p class="label">They're in.</p>
    <h3 class="udone-h" id="upl-done-h">Thank you.</h3>
    <p class="prose" id="upl-done-p"></p>
  </div>
</form>`

const form = root.querySelector('#upl')
const nameEl = root.querySelector('#upl-name')
const noteEl = root.querySelector('#upl-note')
const filesEl = root.querySelector('#upl-files')
const pickerText = root.querySelector('#upl-picker-text')
const listEl = root.querySelector('#upl-list')
const totalEl = root.querySelector('#upl-total')
const goEl = root.querySelector('#upl-go')
const doneEl = root.querySelector('#upl-done')
const doneH = root.querySelector('#upl-done-h')
const doneP = root.querySelector('#upl-done-p')

// ---------- state ----------
// items: { file, el, status: 'ready'|'invalid'|'uploading'|'done'|'error', sent, path, reason }
let items = []
let running = false

function renderItem(item) {
  const li = document.createElement('li')
  li.className = 'ufile'
  li.dataset.status = item.status

  const head = document.createElement('div')
  head.className = 'ufile-head'
  const name = document.createElement('span')
  name.className = 'ufile-name'
  name.textContent = item.file.name
  const size = document.createElement('span')
  size.className = 'ufile-size'
  size.textContent = fmtBytes(item.file.size)
  head.append(name, size)

  const track = document.createElement('div')
  track.className = 'utrack'
  track.setAttribute('role', 'progressbar')
  track.setAttribute('aria-valuemin', '0')
  track.setAttribute('aria-valuemax', '100')
  track.setAttribute('aria-valuenow', '0')
  const fill = document.createElement('i')
  track.appendChild(fill)

  const foot = document.createElement('div')
  foot.className = 'ufile-foot'
  const status = document.createElement('span')
  status.className = 'ufile-status'
  const action = document.createElement('button')
  action.type = 'button'
  action.className = 'tbtn ufile-action'
  foot.append(status, action)

  li.append(head, track, foot)
  item.el = { li, fill, track, status, action }
  updateItem(item)

  action.addEventListener('click', () => {
    if (item.status === 'error') retry(item)
    else if (item.status === 'ready' || item.status === 'invalid') remove(item)
  })
  return li
}

function updateItem(item, pct = null) {
  const { li, fill, track, status, action } = item.el
  li.dataset.status = item.status
  if (pct !== null) {
    fill.style.width = `${pct.toFixed(1)}%`
    track.setAttribute('aria-valuenow', String(Math.round(pct)))
  }
  switch (item.status) {
    case 'ready':
      status.textContent = 'Ready'
      action.textContent = 'Remove'
      action.hidden = running
      break
    case 'invalid':
      status.textContent = item.reason
      action.textContent = 'Remove'
      action.hidden = false
      break
    case 'uploading':
      status.textContent = `Uploading… ${Math.round(pct ?? 0)}% · ${fmtBytes(item.sent)} of ${fmtBytes(item.file.size)}`
      action.hidden = true
      break
    case 'done':
      status.textContent = 'Done'
      action.hidden = true
      fill.style.width = '100%'
      track.setAttribute('aria-valuenow', '100')
      break
    case 'error':
      status.textContent = `Didn't make it: ${item.reason}`
      action.textContent = 'Retry'
      action.hidden = false
      break
  }
}

function remove(item) {
  if (running) return
  items = items.filter((x) => x !== item)
  item.el.li.remove()
  updateTotals()
}

function updateTotals() {
  const valid = items.filter((i) => i.status !== 'invalid')
  const bytes = valid.reduce((a, i) => a + i.file.size, 0)
  const done = valid.filter((i) => i.status === 'done')
  const sent = valid.reduce((a, i) => a + (i.status === 'done' ? i.file.size : i.sent || 0), 0)
  const pending = valid.filter((i) => i.status === 'ready' || i.status === 'error')

  pickerText.textContent = valid.length
    ? `${valid.length} file${valid.length === 1 ? '' : 's'} chosen · choose different`
    : 'Choose photos or video'

  if (running) {
    const current = items.find((i) => i.status === 'uploading')
    const n = valid.indexOf(current) + 1
    totalEl.hidden = false
    totalEl.textContent = current
      ? `Uploading ${n} of ${valid.length} · ${fmtBytes(sent)} of ${fmtBytes(bytes)}`
      : `Finishing… ${fmtBytes(sent)} of ${fmtBytes(bytes)}`
  } else if (valid.length) {
    totalEl.hidden = false
    totalEl.textContent = done.length
      ? `${done.length} of ${valid.length} uploaded · ${fmtBytes(bytes)} total`
      : `${valid.length} file${valid.length === 1 ? '' : 's'} · ${fmtBytes(bytes)}`
  } else {
    totalEl.hidden = true
  }

  goEl.disabled = running || pending.length === 0
  goEl.textContent = running ? 'Uploading…' : pending.some((i) => i.status === 'error') && done.length ? 'Retry the rest' : 'Upload'
}

// ---------- choosing files ----------
filesEl.addEventListener('change', () => {
  if (running) return
  doneEl.hidden = true
  for (const file of filesEl.files) {
    if (items.some((i) => i.file.name === file.name && i.file.size === file.size && i.file.lastModified === file.lastModified)) continue
    const item = { file, status: 'ready', sent: 0 }
    if (!isMedia(file)) {
      item.status = 'invalid'
      item.reason = 'Not a photo or video — skipped'
    } else if (file.size > MAX_BYTES) {
      item.status = 'invalid'
      item.reason = `Over 2 GB (${fmtBytes(file.size)}) — skipped`
    } else if (file.size === 0) {
      item.status = 'invalid'
      item.reason = 'Empty file — skipped'
    }
    items.push(item)
    listEl.appendChild(renderItem(item))
  }
  filesEl.value = '' // so choosing the same file again fires change
  updateTotals()
})

// ---------- uploading ----------
function uploadOne(item) {
  return new Promise((resolve) => {
    const file = item.file
    const objectName = objectNameFor(file)
    item.path = `${SUBMISSIONS_BUCKET}/${objectName}`
    item.status = 'uploading'
    item.sent = 0
    updateItem(item, 0)

    const upload = new window.tus.Upload(file, {
      endpoint: RESUMABLE_ENDPOINT,
      retryDelays: [0, 2000, 5000, 10000, 20000, 30000],
      headers: {
        authorization: `Bearer ${SUPABASE_KEY}`,
        apikey: SUPABASE_KEY,
        'x-upsert': 'false',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: CHUNK,
      metadata: {
        bucketName: SUBMISSIONS_BUCKET,
        objectName,
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600',
      },
      onProgress(sent, total) {
        item.sent = sent
        updateItem(item, (100 * sent) / total)
        updateTotals()
      },
      onError(err) {
        const detail = err?.originalResponse?.getBody?.() || err?.message || String(err)
        item.status = 'error'
        item.reason = detail.length > 140 ? `${detail.slice(0, 140)}…` : detail
        updateItem(item)
        updateTotals()
        resolve(false)
      },
      async onSuccess() {
        item.status = 'done'
        item.sent = file.size
        forgetObjectName(file)
        updateItem(item, 100)
        await recordUpload(item)
        updateTotals()
        resolve(true)
      },
    })

    // Resume a previous attempt of this exact file if tus knows one
    // (retry after an error, or a reload mid-upload).
    upload.findPreviousUploads().then((prev) => {
      if (prev.length) upload.resumeFromPreviousUpload(prev[0])
      upload.start()
    }).catch(() => upload.start())
  })
}

async function recordUpload(item) {
  const body = {
    uploader_name: nameEl.value.trim() || null,
    note: noteEl.value.trim() || null,
    file_path: item.path,
    mime_type: item.file.type || null,
    size_bytes: item.file.size,
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/uploads`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(body),
      })
      if (res.ok) return true
      console.warn('uploads row insert failed', res.status, await res.text())
    } catch (err) {
      console.warn('uploads row insert failed', err)
    }
  }
  // The file itself is safe in the bucket; the row is for review.
  return false
}

async function retry(item) {
  if (running) return
  await runQueue([item])
}

async function runQueue(queue) {
  running = true
  doneEl.hidden = true
  items.forEach((i) => updateItem(i))
  updateTotals()
  try {
    for (const item of queue) {
      await uploadOne(item)
    }
  } finally {
    running = false
    items.forEach((i) => updateItem(i))
    updateTotals()
    finish()
  }
}

function finish() {
  const valid = items.filter((i) => i.status !== 'invalid')
  const done = valid.filter((i) => i.status === 'done')
  const failed = valid.filter((i) => i.status === 'error')
  if (!done.length) return
  doneEl.hidden = false
  if (failed.length) {
    doneH.textContent = `${done.length} of ${valid.length} made it.`
    const which = failed.length === 1 ? "one that didn't" : "ones that didn't"
    doneP.textContent = `Hit Retry on the ${which} whenever you're ready — it starts from where it stopped.`
  } else {
    const videos = done.filter((i) => i.file.type.startsWith('video/') || VIDEO_EXT.test(i.file.name)).length
    doneH.textContent = done.length === 1 ? 'Got it. Thank you.' : `Got all ${done.length}. Thank you.`
    doneP.textContent = videos
      ? 'I\'ll watch it tonight. Seriously — thank you.'
      : 'I\'ll go through everything this week and add the good ones to the galleries.'
  }
  doneEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

form.addEventListener('submit', (e) => {
  e.preventDefault()
  if (running) return
  const queue = items.filter((i) => i.status === 'ready' || i.status === 'error')
  if (!queue.length) return
  runQueue(queue)
})

// A 950 MB upload dies if someone taps through to a gallery mid-transfer.
window.addEventListener('beforeunload', (e) => {
  if (!running) return
  e.preventDefault()
  e.returnValue = ''
})
