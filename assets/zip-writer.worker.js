// ============================================================
// zip-writer.worker.js — streams a zip to disk, not memory.
//
// The page pipes zip chunks here; this worker writes them into a file in
// the origin-private file system through a sync access handle, which is
// backed by disk. Nothing accumulates in JS memory, which matters on iOS
// Safari where a large in-memory Blob kills the tab with no exception.
// When the stream closes, the page gets a File for the finished zip and
// hands it to a download link.
//
// Messages in:  { type: 'open', name } | { type: 'chunk', chunk } |
//               { type: 'close' } | { type: 'abort' }
// Messages out: { type: 'ready' } | { type: 'written', pos } |
//               { type: 'closed' } | { type: 'aborted' } | { type: 'error', message }
// ============================================================

let root = null
let name = null
let access = null
let pos = 0

async function cleanupOld(keep) {
  // Temp zips from earlier sessions that never got removed.
  try {
    for await (const [entry] of root.entries()) {
      if (entry.startsWith('zip-') && entry !== keep) await root.removeEntry(entry).catch(() => {})
    }
  } catch {
    // entries() unsupported: nothing to clean
  }
}

self.onmessage = async (e) => {
  const m = e.data
  try {
    if (m.type === 'open') {
      root = await navigator.storage.getDirectory()
      name = m.name
      await cleanupOld(name)
      const handle = await root.getFileHandle(name, { create: true })
      access = await handle.createSyncAccessHandle()
      access.truncate(0)
      pos = 0
      self.postMessage({ type: 'ready' })
    } else if (m.type === 'chunk') {
      const n = access.write(m.chunk, { at: pos })
      pos += n
      self.postMessage({ type: 'written', pos })
    } else if (m.type === 'close') {
      access.flush()
      access.close()
      access = null
      self.postMessage({ type: 'closed', pos })
    } else if (m.type === 'abort') {
      try { access?.close() } catch { /* already closed */ }
      access = null
      if (root && name) await root.removeEntry(name).catch(() => {})
      self.postMessage({ type: 'aborted' })
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err && err.message || err) })
  }
}
