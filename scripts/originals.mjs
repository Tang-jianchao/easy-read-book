/**
 * 本地原文书库。
 *
 * 只在 `npm run dev` / `npm start` 时通过中间件提供：
 *   GET /api/originals                 原文清单
 *   GET /originals/<bookId>/<fileId>   原始文件（支持 Range）
 *
 * 原文始终从 ebook 目录按需流式读取，不复制到 public/，也不会进入 Git。
 * GitHub Pages 上没有这个接口，前端会自动隐藏原文入口。
 *
 * 目录可用 EBOOK_ROOT 覆盖，默认 E:/personal/ebook。
 */
import { createReadStream } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EBOOK_ROOT = process.env.EBOOK_ROOT || 'E:/personal/ebook'
const CONVERTED_DIR = path.join(EBOOK_ROOT, '已转换skill')
const ARCHIVED_DIR = path.join(CONVERTED_DIR, '_未转换-直接归档')
const LIBRARY_INDEX = path.join(ROOT, 'public', 'library', 'index.json')
const REGISTRY = path.join(EBOOK_ROOT, '.book-library.json')

const SUPPORTED_EXTS = new Set(['.pdf', '.epub', '.mobi', '.azw3', '.txt', '.md', '.docx', '.djvu'])
const PREVIEW_EXTS = new Set(['.pdf', '.epub'])
const MIME = {
  '.pdf': 'application/pdf',
  '.epub': 'application/epub+zip',
  '.mobi': 'application/octet-stream',
  '.azw3': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.djvu': 'image/vnd.djvu',
}

const NOTES_META = {
  'heitian-e': { title: '黑天鹅：如何应对不可预知的未来', author: '纳西姆·尼古拉斯·塔勒布' },
  'beitaoyan-yongqi': { title: '被讨厌的勇气', author: '岸见一郎 / 古贺史健' },
}

// 尚未生成精读的原文，手工给出干净的展示标题
const EXTRA_META = [
  { match: /^人体简史/, title: '人体简史', author: '比尔·布莱森' },
  { match: /^健身营养全书/, title: '健身营养全书', author: '克里斯蒂安·冯·勒费尔霍尔茨' },
  { match: /^运动解剖学图谱/, title: '运动解剖学图谱（第3版）', author: '顾德明 / 缪进昌' },
  { match: /^中国居民膳食指南/, title: '中国居民膳食指南（2022）', author: '中国营养学会' },
  { match: /^思考[,，]\s*快与慢/, title: '思考，快与慢', author: '丹尼尔·卡尼曼' },
  { match: /^知行[：:]/, title: '知行：技术人的管理之路', author: '刘建国' },
  { match: /^美国儿科学会育儿百科/, title: '美国儿科学会育儿百科', author: '斯蒂文·谢尔弗' },
  { match: /^运动改造大脑/, title: '运动改造大脑', author: '约翰·瑞迪 / 埃里克·哈格曼' },
  { match: /^这本书能让你睡得好/, title: '这本书能让你睡得好', author: '肖恩·史蒂文森' },
]

const CACHE_TTL = 10_000
let cache = { at: 0, manifest: null }

export async function handleOriginalsRequest(req, res) {
  const url = new URL(req.url || '/', 'http://localhost')

  if (url.pathname === '/api/originals' || url.pathname === '/api/originals/') {
    const manifest = await getManifest()
    sendJson(res, 200, { enabled: manifest.books.length > 0, books: manifest.books })
    return true
  }

  if (url.pathname.startsWith('/originals/')) {
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    if (parts.length !== 3) {
      sendJson(res, 404, { message: '原文不存在' })
      return true
    }
    const manifest = await getManifest()
    const file = manifest.fileMap.get(`${parts[1]}/${parts[2]}`)
    if (!file) {
      sendJson(res, 404, { message: '原文不存在' })
      return true
    }
    await sendFile(req, res, file)
    return true
  }

  return false
}

async function getManifest() {
  if (cache.manifest && Date.now() - cache.at < CACHE_TTL) return cache.manifest
  cache = { at: Date.now(), manifest: await buildManifest() }
  return cache.manifest
}

async function buildManifest() {
  const library = await readJson(LIBRARY_INDEX).catch(() => null)
  const registry = await readJson(REGISTRY).catch(() => null)
  const shelfBooks = new Map()
  const shelfOrder = new Map()
  if (library?.books) {
    library.books.forEach((book, index) => {
      shelfBooks.set(book.slug, book)
      shelfOrder.set(book.slug, index)
    })
  }

  const mapped = new Map()
  for (const entry of registry?.entries || []) {
    if (!entry?.archived_to || !entry?.slug) continue
    mapped.set(normPath(entry.archived_to), entry)
  }

  const groups = new Map()
  const fileMap = new Map()

  const addFile = async (filePath, source) => {
    const stat = await fs.stat(filePath).catch(() => null)
    if (!stat?.isFile()) return
    const ext = path.extname(filePath).toLowerCase()
    if (!SUPPORTED_EXTS.has(ext)) return

    const reg = mapped.get(normPath(filePath))
    const shelf = reg ? shelfBooks.get(reg.slug) : null
    const base = path.basename(filePath)
    const extra = EXTRA_META.find((item) => item.match.test(base))
    const notes = reg ? NOTES_META[reg.slug] : null

    let bookId
    let title
    let author
    let shelfSlug = null
    let origin
    if (reg) {
      bookId = reg.slug
      shelfSlug = shelf ? reg.slug : null
      title = shelf?.title || notes?.title || cleanName(base)
      author = shelf?.author || notes?.author || ''
      origin = reg.route === 'notes' ? 'notes' : shelf ? 'skill' : 'converted'
    } else {
      bookId = `orig-${sha1(base).slice(0, 10)}`
      title = extra?.title || cleanName(base)
      author = extra?.author || ''
      origin = source === 'archived' ? 'archived' : 'unconverted'
    }

    const fileId = sha1(filePath).slice(0, 12)
    const format = ext.slice(1)
    const downloadName = `${safeFileName(title)}${ext}`
    const file = {
      id: fileId,
      format,
      label: format.toUpperCase(),
      size: stat.size,
      canPreview: PREVIEW_EXTS.has(ext),
      downloadName,
      url: `./originals/${encodeURIComponent(bookId)}/${fileId}`,
    }

    let group = groups.get(bookId)
    if (!group) {
      group = {
        id: bookId,
        shelfSlug,
        title,
        author,
        source: origin,
        sourceLabel: sourceLabel(origin),
        files: [],
        order:
          origin === 'skill'
            ? shelfOrder.get(bookId) ?? 100
            : origin === 'notes'
              ? 100
              : 200,
      }
      groups.set(bookId, group)
    }
    group.files.push(file)
    fileMap.set(`${bookId}/${fileId}`, { path: filePath, format, downloadName })
  }

  await scanDir(CONVERTED_DIR, 'converted', addFile, true)
  await scanDir(ARCHIVED_DIR, 'archived', addFile, false)
  await scanDir(EBOOK_ROOT, 'unconverted', addFile, false)

  const books = [...groups.values()]
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order
      return a.title.localeCompare(b.title, 'zh-CN')
    })
    .map(({ order, ...book }) => ({
      ...book,
      files: book.files.sort((a, b) => formatRank(a.format) - formatRank(b.format)),
    }))

  return { books, fileMap }
}

async function scanDir(dir, source, addFile, topLevelOnly) {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (topLevelOnly && entry.name.startsWith('_未转换')) continue
    await addFile(path.join(dir, entry.name), source)
  }
}

async function sendFile(req, res, file) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' })
    res.end()
    return
  }

  const stat = await fs.stat(file.path).catch(() => null)
  if (!stat?.isFile()) {
    sendJson(res, 404, { message: '原文不存在' })
    return
  }

  const total = stat.size
  const range = parseRange(req.headers.range, total)
  if (range === null) {
    res.writeHead(416, { 'content-range': `bytes */${total}` })
    res.end()
    return
  }

  const { start, end } = range
  const inline = file.format === 'pdf' || file.format === 'epub'
  const encoded = encodeURIComponent(file.downloadName)
  const headers = {
    'content-type': MIME[path.extname(file.path).toLowerCase()] || 'application/octet-stream',
    'content-length': end - start + 1,
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=0, must-revalidate',
    'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="book.${file.format}"; filename*=UTF-8''${encoded}`,
    'x-content-type-options': 'nosniff',
  }
  if (range.partial) headers['content-range'] = `bytes ${start}-${end}/${total}`
  res.writeHead(range.partial ? 206 : 200, headers)
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  const stream = createReadStream(file.path, { start, end })
  stream.on('error', () => res.destroy())
  stream.pipe(res)
}

function parseRange(header, total) {
  if (!header) return { start: 0, end: total - 1, partial: false }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, rawStart, rawEnd] = match
  if (!rawStart && !rawEnd) return null
  let start
  let end
  if (!rawStart) {
    const suffix = Number(rawEnd)
    if (!suffix) return null
    start = Math.max(0, total - suffix)
    end = total - 1
  } else {
    start = Number(rawStart)
    end = rawEnd ? Number(rawEnd) : total - 1
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) return null
  return { start, end: Math.min(end, total - 1), partial: true }
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function formatRank(format) {
  return { pdf: 0, epub: 1, mobi: 2, azw3: 3 }[format] ?? 9
}

function sourceLabel(source) {
  if (source === 'skill') return '已精读'
  if (source === 'notes' || source === 'converted') return '已转换'
  return '待整理'
}

function cleanName(fileName) {
  return fileName
    .replace(/\.(pdf|epub|mobi|azw3|txt|md|docx|djvu)$/i, '')
    .replace(/\s*\(z-library[^)]*\)/gi, '')
    .replace(/\s*\(1lib[^)]*\)/gi, '')
    .replace(/\s*=\s*.*$/, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function safeFileName(title) {
  return title.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'book'
}

function normPath(value) {
  return path.resolve(value).toLowerCase()
}

function sha1(value) {
  return crypto.createHash('sha1').update(value).digest('hex')
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'))
}
