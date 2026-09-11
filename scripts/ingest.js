#!/usr/bin/env node
// ============================================================
// ingest.js — local photo pipeline for thanks.francismroberts.com
//
//   node ingest.js --gallery photobooth /path/to/photobooth [--limit 5]
//
// For each image in the source folder:
//   1. Copy to a temp dir and strip GPS tags with exiftool. Camera,
//      lens and exposure EXIF are kept. Source files are never modified.
//   2. Verify no GPS tags remain. If any do, the file is failed and
//      nothing is uploaded.
//   3. Read oriented dimensions and capture time.
//   4. Generate thumb (500px q78), thumb@2x (1000px q72) and
//      full (2000px q82) as WebP. Derivatives carry no metadata.
//   5. Upload derivatives + the GPS-stripped original to the gallery
//      bucket, skipping any object already present.
//   6. Insert a photos row (skipped if the row already exists).
// After the loop, sort_order is recomputed for the whole gallery from
// taken_at so newly added photos slot into place.
//
// Idempotency: the photo id is a UUID derived from the SHA-256 of the
// source file, so the same file always maps to the same id and paths.
// A file whose photos row exists is skipped outright. A file with some
// objects uploaded but no row (an interrupted run) is finished, not
// redone.
//
// Storage layout written (bucket: gallery):
//   <gallery>/thumb/<id>.webp        500px  → photos.thumb_path
//   <gallery>/thumb/<id>@2x.webp    1000px  (srcset 2x; derived from thumb_path)
//   <gallery>/full/<id>.webp        2000px  → photos.full_path
//   <gallery>/original/<id>.<ext>   untouched except GPS
//
// Archive generation (archives/<gallery>-web.zip etc.) is a later
// stage and is not done here.
// ============================================================

import { createHash } from 'node:crypto'
import { readdir, readFile, stat, mkdtemp, copyFile, rm } from 'node:fs/promises'
import { createReadStream, createWriteStream, openAsBlob } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import archiver from 'archiver'
import dotenv from 'dotenv'
import exifr from 'exifr'
import sharp from 'sharp'
import { exiftool } from 'exiftool-vendored'
import { createClient } from '@supabase/supabase-js'

import {
  SUPABASE_URL as CONFIG_URL,
  GALLERY_BUCKET,
  GALLERIES,
} from '../assets/supabase-config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env') })

// ---------- derivative specs ----------
const DERIVATIVES = [
  { key: 'thumb', edge: 500, quality: 78, suffix: '' },
  { key: 'thumb@2x', edge: 1000, quality: 72, suffix: '@2x' },
  { key: 'full', edge: 2000, quality: 82, suffix: '' },
]

// ---------- per-gallery crop ----------
// The photobooth export is a 4×6 print sheet at 300 dpi (1200×1800): the
// same 2×6 strip twice, side by side, on kraft-tan paper. Measured on
// 2026-09-11: the two halves carry identical content (differences are
// sub-pixel resampling only), the strip's kraft frame is part of its
// design, and the banner is wider than the photos — so the crop is the
// exact left half, nothing trimmed inside it. The crop is applied after
// the GPS strip and before everything else, so the original, the
// derivatives and the stored width/height all describe the cropped image.
// `expect` guards against cropping a file that isn't that sheet.
const CROP = {
  photobooth: { expect: { width: 1200, height: 1800 }, left: 0, top: 0, width: 600, height: 1800 },
}

// ---------- archives ----------
// One "web" zip (the full WebP derivatives) and one "originals" zip per
// gallery, with friendly sequential filenames inside, uploaded to
// archives/<gallery>-<kind>.zip. Built from what is in storage, not from
// the source folder, so the zip matches the site byte for byte (GPS
// stripped, photobooth cropped). Streamed: storage → archiver → temp
// file → file-backed Blob → storage. Nothing is held in memory.
const SLUG = { photobooth: 'booth', photographer: 'photos' }
const ARCHIVE_KINDS = {
  web: { column: 'full_path', suffix: 'web' },
  originals: { column: 'original_path', suffix: 'originals' },
}

const INPUT_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'])
const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
}

// ---------- CLI ----------
function usage(exitCode = 0) {
  const out = exitCode ? console.error : console.log
  out(`Usage: node ingest.js --gallery <${GALLERIES.join('|')}> <source-folder> [--limit N] [--regenerate]
       node ingest.js --gallery <${GALLERIES.join('|')}> --archives

  --gallery      Which gallery the photos belong to (photos.gallery)
  --archives     Only (re)build and upload the gallery's two archives
                 (web + originals) from what is in storage. No source
                 folder needed. A full ingest run that adds or regenerates
                 photos rebuilds the archives itself; --limit runs don't.
  --limit N      Stop after N files that need work. Already-ingested
                 files are skipped without counting toward the limit,
                 so re-running with --limit 5 does the next five.
                 --limit 0 ingests nothing and only repairs existing rows.
  --regenerate   Re-process files that are already ingested: rebuild and
                 re-upload every derivative and the original, then
                 update the row's width/height. Use after changing the
                 pipeline (crop, sizes, quality). Counts toward --limit.
  --help         Show this message
`)
  process.exit(exitCode)
}

let args
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      gallery: { type: 'string' },
      limit: { type: 'string' },
      regenerate: { type: 'boolean' },
      archives: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  })
} catch (err) {
  console.error(err.message)
  usage(1)
}

if (args.values.help) usage(0)

const gallery = args.values.gallery
const sourceDir = args.positionals[0]
const limit = args.values.limit === undefined ? Infinity : Number(args.values.limit)
const regenerate = Boolean(args.values.regenerate)
const archivesOnly = Boolean(args.values.archives)

if (!gallery || !GALLERIES.includes(gallery)) {
  console.error(`--gallery must be one of: ${GALLERIES.join(', ')}`)
  usage(1)
}
if (!sourceDir && !archivesOnly) {
  console.error('Missing source folder.')
  usage(1)
}
if (args.values.limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
  console.error('--limit must be a non-negative integer.')
  usage(1)
}

// ---------- Supabase admin client ----------
const SUPABASE_URL = process.env.SUPABASE_URL || CONFIG_URL
const SECRET_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SECRET_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is not set. Put it in .env at the repo root.')
  process.exit(1)
}
if (SECRET_KEY.startsWith('sb_publishable_')) {
  console.error('SUPABASE_SERVICE_ROLE_KEY looks like a publishable key. The pipeline needs the sb_secret_ key.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const bucket = supabase.storage.from(GALLERY_BUCKET)

// ---------- helpers ----------
async function sha256File(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

// Deterministic UUID from a SHA-256 hex digest. Takes the first 128
// bits and sets the version (5) and variant nibbles so it is a valid
// RFC 4122 UUID for the uuid column.
function uuidFromHash(hex) {
  const h = hex.slice(0, 32).split('')
  h[12] = '5'
  h[16] = '89ab'[parseInt(h[16], 16) & 3]
  const s = h.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`
}

function normalizeExt(ext) {
  ext = ext.toLowerCase()
  if (ext === '.jpeg') return '.jpg'
  if (ext === '.tiff') return '.tif'
  return ext
}

async function listSourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  const skippedTypes = []
  for (const e of entries) {
    if (!e.isFile() || e.name.startsWith('.')) continue
    if (e.name.endsWith('.icloud')) {
      throw new Error(
        `${e.name} is an iCloud placeholder. Download the folder in Finder (select all → Download Now) and re-run.`,
      )
    }
    const ext = extname(e.name).toLowerCase()
    if (INPUT_EXT.has(ext)) files.push(join(dir, e.name))
    else skippedTypes.push(e.name)
  }
  files.sort((a, b) => basename(a).localeCompare(basename(b), undefined, { numeric: true }))
  return { files, skippedTypes }
}

// All object names under a prefix, paginated. Returns a Set of names.
async function listObjects(prefix) {
  const names = new Set()
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await bucket.list(prefix, { limit: pageSize, offset })
    if (error) throw new Error(`listing ${prefix}: ${error.message}`)
    for (const o of data) if (o.id) names.add(o.name) // folders have no id
    if (data.length < pageSize) break
  }
  return names
}

// Map of id → { taken_at, original_path } for rows already in the gallery.
async function existingRows() {
  const rows = new Map()
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('photos')
      .select('id, taken_at, original_path')
      .eq('gallery', gallery)
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`reading photos rows: ${error.message}`)
    for (const r of data) rows.set(r.id, { taken_at: r.taken_at, original_path: r.original_path })
    if (data.length < pageSize) break
  }
  return rows
}

// Strip every GPS tag in place. Camera/lens/exposure tags are untouched.
// Covers the EXIF GPS IFD and any GPS* tag in other groups (XMP etc).
async function stripGps(path) {
  try {
    await exiftool.write(path, {}, { writeArgs: ['-gps:all=', '-GPS*=', '-overwrite_original'] })
  } catch (err) {
    // Files with no GPS to begin with make exiftool report nothing to do.
    if (!/nothing to do|0 image files updated/i.test(String(err.message))) throw err
  }
  const tags = await exiftool.read(path)
  const leftover = Object.keys(tags).filter((k) => /^GPS/i.test(k))
  if (leftover.length) {
    throw new Error(`GPS tags still present after strip: ${leftover.join(', ')}`)
  }
}

// Every per-photo read below takes a Buffer, not a path. On Node 26+
// an unclosed FileHandle is a hard ERR_INVALID_STATE at GC time, and
// path-based readers were tripping it. Reading the working file once
// into memory sidesteps that and also means one read per photo.
// Capture time, best source first:
//   1. EXIF DateTimeOriginal / CreateDate
//   2. A YYYYMMDD_HHMMSS[_mmm] timestamp in the filename (the photobooth
//      export has no EXIF but names files this way)
//   3. File mtime — last resort, often just the copy time
async function readCaptureTime(buf, sourcePath) {
  try {
    const exif = await exifr.parse(buf, { pick: ['DateTimeOriginal', 'CreateDate'] })
    const d = exif?.DateTimeOriginal || exif?.CreateDate
    if (d instanceof Date && !Number.isNaN(d.getTime())) return { takenAt: d, source: 'exif' }
  } catch {
    // no EXIF block (PNGs, screenshots) — fall through
  }
  const m = basename(sourcePath).match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})(?:_(\d{3}))?/)
  if (m) {
    const [, y, mo, d, h, mi, s, ms] = m
    const dt = new Date(+y, +mo - 1, +d, +h, +mi, +s, ms ? +ms : 0)
    if (!Number.isNaN(dt.getTime())) return { takenAt: dt, source: 'filename' }
  }
  const st = await stat(sourcePath)
  return { takenAt: st.mtime, source: 'mtime' }
}

// Width/height after EXIF orientation is applied, which is what the
// browser will display and what the tile needs to reserve.
async function orientedDimensions(buf) {
  const m = await sharp(buf).metadata()
  const swap = m.orientation >= 5 && m.orientation <= 8
  return swap ? { width: m.height, height: m.width } : { width: m.width, height: m.height }
}

// Apply the gallery's crop (if any) to the GPS-stripped buffer. Returns
// a re-encoded JPEG at high quality with the (GPS-free) metadata kept.
// Refuses files whose stored dimensions don't match the expected sheet,
// so an odd file never gets silently mangled.
async function applyCrop(buf, crop) {
  const m = await sharp(buf).metadata()
  if (m.width !== crop.expect.width || m.height !== crop.expect.height) {
    throw new Error(`expected a ${crop.expect.width}×${crop.expect.height} sheet to crop, got ${m.width}×${m.height}`)
  }
  return sharp(buf)
    .extract({ left: crop.left, top: crop.top, width: crop.width, height: crop.height })
    .withMetadata()
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toBuffer()
}

async function makeDerivative(buf, edge, quality) {
  // .rotate() with no args bakes EXIF orientation into the pixels.
  // sharp drops all metadata by default (no withMetadata), so the
  // output carries no EXIF at all.
  return sharp(buf)
    .rotate()
    .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toBuffer()
}

async function upload(objectPath, body, contentType) {
  const { error } = await bucket.upload(objectPath, body, { contentType, upsert: true })
  if (error) throw new Error(`upload ${objectPath}: ${error.message}`)
}

function short(id) {
  return id.slice(0, 8)
}

const publicUrl = (path) => `${SUPABASE_URL}/storage/v1/object/public/${GALLERY_BUCKET}/${path}`
const fmtMB = (b) => (b >= 1000 * 1024 ** 2 ? `${(b / 1024 ** 3).toFixed(2)} GB` : `${(b / 1024 ** 2).toFixed(1)} MB`)

// ---------- archives ----------
async function allRows() {
  const out = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('photos')
      .select('id, full_path, original_path, sort_order, taken_at')
      .eq('gallery', gallery)
      .order('sort_order', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`reading photos for archive: ${error.message}`)
    out.push(...data)
    if (data.length < pageSize) break
  }
  return out
}

async function buildArchive(kind, rows, workDir) {
  const spec = ARCHIVE_KINDS[kind]
  const objectPath = `archives/${gallery}-${spec.suffix}.zip`
  const tmp = join(workDir, `${gallery}-${spec.suffix}.zip`)
  const slug = SLUG[gallery] || gallery

  const entries = rows
    .filter((r) => r[spec.column])
    .map((r) => ({
      path: r[spec.column],
      name: `francis-grad-party-${slug}-${String(r.sort_order + 1).padStart(3, '0')}${extname(r[spec.column]).toLowerCase()}`,
      date: r.taken_at ? new Date(r.taken_at) : new Date(),
    }))
  if (!entries.length) {
    console.log(`  ${kind}: no rows have ${spec.column}, skipping`)
    return null
  }

  process.stdout.write(`  ${kind}: zipping ${entries.length} files… `)
  const out = createWriteStream(tmp)
  // store, not deflate: JPEG and WebP don't compress, and it's much faster
  const archive = archiver('zip', { store: true })
  let archiveError = null
  archive.on('error', (err) => { archiveError = err })
  archive.on('warning', (err) => { if (err.code !== 'ENOENT') archiveError = err })
  archive.pipe(out)

  // One entry at a time: fetch, stream the body straight into the zip,
  // wait for archiver to report the entry written, then the next.
  let n = 0
  for (const e of entries) {
    if (archiveError) throw archiveError
    const res = await fetch(publicUrl(e.path))
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${e.path}`)
    await new Promise((resolveEntry, rejectEntry) => {
      const onErr = (err) => rejectEntry(err)
      archive.once('error', onErr)
      archive.once('entry', () => { archive.off('error', onErr); resolveEntry() })
      archive.append(Readable.fromWeb(res.body), { name: e.name, date: e.date })
    })
    n++
    if (n % 50 === 0) process.stdout.write(`${n}… `)
  }
  await archive.finalize()
  await finished(out)
  if (archiveError) throw archiveError
  const size = (await stat(tmp)).size
  console.log(`${n} files, ${fmtMB(size)}`)

  process.stdout.write(`  ${kind}: uploading to ${objectPath}… `)
  // openAsBlob: a Blob backed by the file on disk, streamed by fetch.
  // The 1 GB originals zip never sits in memory.
  const blob = await openAsBlob(tmp, { type: 'application/zip' })
  const { error } = await bucket.upload(objectPath, blob, { contentType: 'application/zip', upsert: true })
  if (error) throw new Error(`upload ${objectPath}: ${error.message}`)

  // Verify what the site will see.
  const head = await fetch(publicUrl(objectPath), { method: 'HEAD' })
  const served = Number(head.headers.get('content-length'))
  if (!head.ok || served !== size) {
    throw new Error(`verify ${objectPath}: HTTP ${head.status}, served ${served} bytes, expected ${size}`)
  }
  console.log(`ok, serves ${fmtMB(served)}`)
  await rm(tmp, { force: true })
  return { kind, objectPath, size, files: n }
}

async function buildArchives() {
  console.log('\nArchives')
  const { data: info } = await supabase.storage.getBucket(GALLERY_BUCKET)
  if (info?.file_size_limit) console.log(`  bucket file size limit: ${fmtMB(info.file_size_limit)}`)

  const rows = await allRows()
  console.log(`  ${rows.length} photos in ${gallery}`)
  const workDir = await mkdtemp(join(tmpdir(), 'grad-archive-'))
  const results = []
  try {
    for (const kind of Object.keys(ARCHIVE_KINDS)) {
      results.push(await buildArchive(kind, rows, workDir))
    }
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
  return results.filter(Boolean)
}

// ---------- main ----------
async function main() {
  if (archivesOnly) {
    console.log(`gallery : ${gallery}`)
    console.log(`bucket  : ${GALLERY_BUCKET} @ ${SUPABASE_URL}`)
    console.log('mode    : ARCHIVES ONLY')
    const results = await buildArchives()
    console.log()
    console.log('Summary')
    for (const r of results) console.log(`  ${r.objectPath.padEnd(40)} ${r.files} files  ${fmtMB(r.size)}`)
    return
  }

  const src = resolve(sourceDir)
  const srcStat = await stat(src).catch(() => null)
  if (!srcStat?.isDirectory()) {
    console.error(`Source folder not found: ${src}`)
    process.exit(1)
  }

  console.log(`gallery : ${gallery}`)
  console.log(`source  : ${src}`)
  console.log(`bucket  : ${GALLERY_BUCKET} @ ${SUPABASE_URL}`)
  if (limit !== Infinity) console.log(`limit   : ${limit}`)
  if (CROP[gallery]) {
    const c = CROP[gallery]
    console.log(`crop    : ${c.width}×${c.height} at (${c.left},${c.top}) from ${c.expect.width}×${c.expect.height} sheets`)
  }
  if (regenerate) console.log('mode    : REGENERATE — existing photos are rebuilt and re-uploaded')
  console.log()

  const { files, skippedTypes } = await listSourceFiles(src)
  if (skippedTypes.length) {
    console.log(`ignoring ${skippedTypes.length} non-image file(s): ${skippedTypes.slice(0, 5).join(', ')}${skippedTypes.length > 5 ? ', …' : ''}`)
  }
  if (!files.length) {
    console.log('No image files found. Nothing to do.')
    return
  }
  console.log(`found ${files.length} image file(s)`)

  process.stdout.write('hashing source files… ')
  const hashed = []
  for (const f of files) hashed.push({ file: f, id: uuidFromHash(await sha256File(f)) })
  console.log('done')

  process.stdout.write('checking what already exists… ')
  const [rows, thumbs, fulls, originals] = await Promise.all([
    existingRows(),
    listObjects(`${gallery}/thumb`),
    listObjects(`${gallery}/full`),
    listObjects(`${gallery}/original`),
  ])
  console.log(`${rows.size} row(s), ${thumbs.size + fulls.size + originals.size} object(s)`)
  console.log()

  const workDir = await mkdtemp(join(tmpdir(), 'grad-ingest-'))
  const summary = { processed: 0, regenerated: 0, skipped: 0, skippedDone: 0, skippedLimit: 0, failed: 0, mtimeFallback: 0, datesFixed: 0, pathsFixed: 0 }
  const failures = []
  let attempted = 0
  let datesChanged = false

  try {
    for (let i = 0; i < hashed.length; i++) {
      const { file, id } = hashed[i]
      const name = basename(file)
      const tag = `[${String(i + 1).padStart(String(hashed.length).length)}/${hashed.length}] ${name} → ${short(id)}`

      const ext = normalizeExt(extname(file))
      const thumbPath = `${gallery}/thumb/${id}.webp`
      const thumb2xPath = `${gallery}/thumb/${id}@2x.webp`
      const fullPath = `${gallery}/full/${id}.webp`
      const originalPath = `${gallery}/original/${id}${ext}`

      const existing = rows.has(id)

      if (existing && !regenerate) {
        // Already ingested. Cheap self-heal so re-runs converge:
        //  - taken_at: recompute and update if an earlier run stored a
        //    worse value, so sort_order comes right.
        //  - original_path: fill in if NULL (rows written before the
        //    column was set). The original is uploaded before the row is
        //    inserted, so the object is known to exist at this path.
        const notes = []
        const patch = {}
        const stored = rows.get(id)
        try {
          const { takenAt, source } = await readCaptureTime(await readFile(file), file)
          if (!stored.taken_at || Date.parse(stored.taken_at) !== takenAt.getTime()) {
            patch.taken_at = takenAt.toISOString()
            notes.push(`taken_at updated from ${source}`)
          }
          if (!stored.original_path) {
            patch.original_path = originalPath
            notes.push('original_path filled')
          }
          if (Object.keys(patch).length) {
            const { error } = await supabase.from('photos').update(patch).eq('id', id)
            if (error) throw new Error(error.message)
            if (patch.taken_at) {
              summary.datesFixed++
              datesChanged = true
            }
            if (patch.original_path) summary.pathsFixed++
          }
        } catch (err) {
          notes.push(`repair failed: ${err.message}`)
        }
        const note = notes.length ? `, ${notes.join(', ')}` : ''
        console.log(`${tag}  skipped (already ingested${note})`)
        summary.skipped++
        summary.skippedDone++
        continue
      }
      if (attempted >= limit) {
        console.log(`${tag}  skipped (past --limit)`)
        summary.skipped++
        summary.skippedLimit++
        continue
      }
      attempted++

      const work = join(workDir, `${id}${ext}`)

      try {
        // 1–2. GPS strip on a copy, then verify
        await copyFile(file, work)
        await stripGps(work)

        // Single read of the stripped file; everything below uses it.
        // Capture time comes from the untouched-but-stripped file, since
        // a crop re-encode is not where dates live.
        const strippedRaw = await readFile(work)
        const { takenAt, source } = await readCaptureTime(strippedRaw, file)
        if (source === 'mtime') summary.mtimeFallback++

        // 2b. gallery crop, if configured — original and derivatives
        //     both come from the cropped image.
        const stripped = CROP[gallery] ? await applyCrop(strippedRaw, CROP[gallery]) : strippedRaw

        // 3. dimensions (post-crop, post-orientation)
        const { width, height } = await orientedDimensions(stripped)

        // 4–5. derivatives and uploads. Normally objects already present
        //     are skipped; --regenerate rebuilds and overwrites all of them.
        const uploaded = []
        const plan = [
          { object: thumbPath, present: !regenerate && thumbs.has(`${id}.webp`), spec: DERIVATIVES[0] },
          { object: thumb2xPath, present: !regenerate && thumbs.has(`${id}@2x.webp`), spec: DERIVATIVES[1] },
          { object: fullPath, present: !regenerate && fulls.has(`${id}.webp`), spec: DERIVATIVES[2] },
        ]
        for (const p of plan) {
          if (p.present) continue
          const buf = await makeDerivative(stripped, p.spec.edge, p.spec.quality)
          await upload(p.object, buf, 'image/webp')
          uploaded.push(`${p.spec.key} ${(buf.length / 1024).toFixed(0)}K`)
        }
        if (regenerate || !originals.has(`${id}${ext}`)) {
          await upload(originalPath, stripped, MIME_BY_EXT[ext] || 'application/octet-stream')
          uploaded.push(`original ${(stripped.length / 1024 / 1024).toFixed(1)}M`)
        }

        // 6. row — sort_order is fixed up for the whole gallery below
        const rowData = {
          gallery,
          thumb_path: thumbPath,
          full_path: fullPath,
          original_path: originalPath,
          width,
          height,
          taken_at: takenAt.toISOString(),
        }
        if (existing) {
          const { error } = await supabase.from('photos').update(rowData).eq('id', id)
          if (error) throw new Error(`update photos row: ${error.message}`)
          summary.regenerated++
        } else {
          const { error } = await supabase.from('photos').insert({ id, ...rowData, sort_order: 0 })
          if (error) throw new Error(`insert photos row: ${error.message}`)
          summary.processed++
        }

        const detail = uploaded.length ? uploaded.join(', ') : 'objects already present, row added'
        const when = source === 'exif' ? '' : ` [no EXIF date, used ${source}]`
        console.log(`${tag}  ${existing ? 'regenerated' : 'ok'}  ${width}×${height}  ${detail}${when}`)
      } catch (err) {
        summary.failed++
        failures.push({ name, reason: err.message })
        console.log(`${tag}  FAILED  ${err.message}`)
      } finally {
        await rm(work, { force: true })
      }
    }

    // Recompute sort_order across the whole gallery by capture time.
    if (summary.processed > 0 || summary.regenerated > 0 || datesChanged) {
      process.stdout.write('\nrecomputing sort_order… ')
      const changed = await resortGallery()
      console.log(`${changed} row(s) updated`)
    }

    // Archives regenerate whenever photos are added or rebuilt. Test
    // runs (--limit) skip this; use --archives afterwards if needed.
    if ((summary.processed > 0 || summary.regenerated > 0) && limit === Infinity && summary.failed === 0) {
      const results = await buildArchives()
      for (const r of results) console.log(`  ${r.objectPath.padEnd(40)} ${r.files} files  ${fmtMB(r.size)}`)
    } else if (summary.processed > 0 || summary.regenerated > 0) {
      console.log('\nArchives not rebuilt (test run or failures). Run with --archives when ready.')
    }
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }

  console.log()
  console.log('Summary')
  console.log(`  processed : ${summary.processed}`)
  if (regenerate) console.log(`  regenerated : ${summary.regenerated}`)
  console.log(`  skipped   : ${summary.skipped}  (already ingested ${summary.skippedDone}, past --limit ${summary.skippedLimit})`)
  console.log(`  failed    : ${summary.failed}`)
  if (summary.mtimeFallback) {
    console.log(`  note      : ${summary.mtimeFallback} file(s) had no EXIF date or filename timestamp; taken_at uses file mtime`)
  }
  if (summary.datesFixed) {
    console.log(`  note      : ${summary.datesFixed} existing row(s) had taken_at corrected`)
  }
  if (summary.pathsFixed) {
    console.log(`  note      : ${summary.pathsFixed} existing row(s) had original_path filled`)
  }
  if (failures.length) {
    console.log()
    console.log('Failures')
    for (const f of failures) console.log(`  ${f.name}: ${f.reason}`)
    process.exitCode = 1
  }
}

async function resortGallery() {
  const all = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('photos')
      .select('id, taken_at, sort_order')
      .eq('gallery', gallery)
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`reading photos for sort: ${error.message}`)
    all.push(...data)
    if (data.length < pageSize) break
  }

  all.sort((a, b) => {
    const ta = a.taken_at ? Date.parse(a.taken_at) : Infinity
    const tb = b.taken_at ? Date.parse(b.taken_at) : Infinity
    if (ta !== tb) return ta - tb
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  let changed = 0
  for (let i = 0; i < all.length; i++) {
    if (all[i].sort_order === i) continue
    const { error } = await supabase.from('photos').update({ sort_order: i }).eq('id', all[i].id)
    if (error) throw new Error(`updating sort_order for ${all[i].id}: ${error.message}`)
    changed++
  }
  return changed
}

main()
  .catch((err) => {
    console.error(`\nfatal: ${err.message}`)
    process.exitCode = 1
  })
  .finally(() => exiftool.end())
