// Local preview server. Serves the repo root and resolves /booth to
// booth.html the way GitHub Pages does. No dependencies.
//
//   node scripts/serve.mjs          → http://127.0.0.1:8765 and, for a
//                                     phone on the same Wi-Fi, the LAN
//                                     URL it prints
//   HOST=127.0.0.1 node scripts/serve.mjs   → this Mac only
//
// Note: a plain http:// LAN address is not a secure context, so on the
// phone the zip download can't use the origin-private file system and
// falls back to the buffered path. Test streaming zips on the deployed
// HTTPS site; everything else tests fine over LAN.
//
// (The system Python's http.server can't read ~/Documents on this Mac,
// which is why this exists.)
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT) || 8765
const HOST = process.env.HOST || '0.0.0.0'

// First non-internal IPv4 address, preferring Wi-Fi (en0) on a Mac.
function lanAddress() {
  const ifaces = networkInterfaces()
  const names = Object.keys(ifaces).sort((a, b) => (a === 'en0' ? -1 : b === 'en0' ? 1 : a.localeCompare(b)))
  for (const name of names) {
    for (const i of ifaces[name] || []) {
      if (i.family === 'IPv4' && !i.internal) return i.address
    }
  }
  return null
}
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (path.endsWith('/')) path += 'index.html'
  let file = normalize(join(ROOT, path))
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return }
  try {
    let s = await stat(file).catch(() => null)
    if (!s && !extname(file)) { file += '.html'; s = await stat(file).catch(() => null) }
    if (!s || !s.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(await readFile(file))
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' }).end(String(err))
  }
}).listen(PORT, HOST, () => {
  console.log(`serving ${ROOT}`)
  console.log(`  this Mac : http://127.0.0.1:${PORT}/booth`)
  if (HOST === '0.0.0.0') {
    const ip = lanAddress()
    if (ip) {
      console.log(`  iPhone   : http://${ip}:${PORT}/booth   (same Wi-Fi; also /photos)`)
      console.log(`             plain http = not a secure context: zip download uses the buffered fallback here`)
    } else {
      console.log('  iPhone   : no LAN IPv4 address found (Wi-Fi off?)')
    }
  }
})
