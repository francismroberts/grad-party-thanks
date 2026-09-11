// Local preview server. Serves the repo root and resolves /booth to
// booth.html the way GitHub Pages does. No dependencies.
//
//   node scripts/serve.mjs          → http://127.0.0.1:8765
//
// (The system Python's http.server can't read ~/Documents on this Mac,
// which is why this exists.)
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.PORT) || 8765
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
}).listen(PORT, '127.0.0.1', () => console.log(`serving ${ROOT} at http://127.0.0.1:${PORT}`))
