#!/usr/bin/env node
/**
 * 把 book-to-skills 生成的书稿同步成本地静态资源。
 *
 * 源目录默认 E:/personal/book-to-skills，可用环境变量覆盖：
 *   BOOK_SOURCE=/path/to/book-to-skills npm run sync
 *
 * 输出：
 *   public/library/books/<slug>/...   原文（章节、速查表、术语表、模式库）
 *   public/library/index.json         书架索引（书籍、章节、主题）
 *   public/library/search.json        全文检索索引
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = process.env.BOOK_SOURCE || 'E:/personal/book-to-skills'
const OUT = path.join(ROOT, 'public', 'library')

const AUX_FILES = [
  { kind: 'cheatsheet', label: '速查', title: '速查表', file: 'cheatsheet.md' },
  { kind: 'glossary', label: '术语', title: '术语表', file: 'glossary.md' },
  { kind: 'patterns', label: '模式', title: '模式库', file: 'patterns.md' },
]

/** 书架展示顺序 */
const ORDER = [
  'congming-touzizhe',
  'zhishujijin-zhinan',
  'xiaodao-jingjixue',
  'xiaogou-qianqian',
  'qiongchali-baodian',
  'fan-cuiruo',
  'yanchi-manzu',
  'shaoyouren-zoulu',
]

/** 手工元信息：无法从书稿稳定推断的展示字段 */
const META = {
  'congming-touzizhe': {
    category: '投资经典',
    tagline: '安全边际与市场先生',
    theme: { from: '#1c2b3a', to: '#0d161f', accent: '#d8a64a', glyph: '智' },
  },
  'zhishujijin-zhinan': {
    category: '指数定投',
    tagline: '用估值定投指数基金',
    theme: { from: '#145244', to: '#082b24', accent: '#f2c14e', glyph: '指' },
  },
  'xiaodao-jingjixue': {
    category: '经济寓言',
    tagline: '鱼、美元与经济周期',
    theme: { from: '#123c4e', to: '#071f29', accent: '#f4c453', glyph: '岛' },
  },
  'xiaogou-qianqian': {
    category: '财商启蒙',
    tagline: '鹅与金蛋的理财童话',
    theme: { from: '#b85c38', to: '#7a3520', accent: '#ffdf9e', glyph: '钱' },
  },
  'qiongchali-baodian': {
    category: '思维模型',
    tagline: '多元思维与误判心理学',
    theme: { from: '#4c2029', to: '#241014', accent: '#e2b77a', glyph: '芒' },
  },
  'fan-cuiruo': {
    category: '决策哲学',
    tagline: '从波动与混乱中受益',
    theme: { from: '#3b2f2a', to: '#171310', accent: '#e76f51', glyph: '反' },
  },
  'yanchi-manzu': {
    category: '目标管理',
    tagline: '乐观构思，悲观计划，乐观执行',
    theme: { from: '#2a3452', to: '#131a2e', accent: '#c7d36b', glyph: '迟' },
  },
  'shaoyouren-zoulu': {
    category: '心理成长',
    tagline: '心智成熟的漫长旅程',
    theme: { from: '#1f3b34', to: '#0f211d', accent: '#d8c3a5', glyph: '路' },
  },
}

const FALLBACK_THEMES = [
  { from: '#2b3a42', to: '#101a1f', accent: '#e0b062', glyph: '书' },
  { from: '#43302b', to: '#1b1210', accent: '#e58e67', glyph: '读' },
  { from: '#2f3b2a', to: '#131b10', accent: '#c8d18a', glyph: '阅' },
  { from: '#332c46', to: '#15111f', accent: '#bfa6e0', glyph: '卷' },
]

async function main() {
  let dirents
  try {
    dirents = await fs.readdir(SOURCE, { withFileTypes: true })
  } catch (err) {
    // GitHub Actions 等环境没有本地书稿目录时，沿用随仓库提交的生成结果
    const hasSnapshot = await fs
      .access(path.join(OUT, 'index.json'))
      .then(() => true)
      .catch(() => false)
    if (hasSnapshot) {
      console.warn(`书稿目录不可用（${SOURCE}），沿用已有的 public/library 快照。`)
      return
    }
    console.error(`无法读取书稿目录：${SOURCE}`)
    console.error('请确认目录存在，或用 BOOK_SOURCE 指定路径。')
    process.exitCode = 1
    return
  }

  const books = []
  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue
    const hasSkill = await fs
      .access(path.join(SOURCE, dirent.name, 'SKILL.md'))
      .then(() => true)
      .catch(() => false)
    if (!hasSkill) {
      console.warn(`跳过 ${dirent.name}：缺少 SKILL.md`)
      continue
    }
    const book = await readBook(dirent.name).catch((err) => {
      console.warn(`跳过 ${dirent.name}：${err.message}`)
      return null
    })
    if (book) books.push(book)
  }

  if (!books.length) {
    console.error(`在 ${SOURCE} 下没有找到可用的书目（需要 SKILL.md + chapters/*.md）。`)
    process.exitCode = 1
    return
  }

  books.sort((a, b) => orderOf(a.slug) - orderOf(b.slug))

  // 复制静态资源
  await fs.rm(OUT, { recursive: true, force: true })
  await fs.mkdir(path.join(OUT, 'books'), { recursive: true })
  for (const book of books) {
    await fs.cp(path.join(SOURCE, book.slug), path.join(OUT, 'books', book.slug), {
      recursive: true,
    })
  }

  // 全文检索条目
  const search = []
  for (const book of books) {
    search.push({
      book: book.slug,
      bookTitle: book.title,
      kind: 'overview',
      target: null,
      title: '书籍概览',
      text: [book.description, plainText(book.intro), plainText(book.scope)].filter(Boolean).join(' '),
    })
    for (const chapter of book.chapters) {
      const raw = await fs.readFile(path.join(SOURCE, book.slug, chapter.file), 'utf8')
      search.push({
        book: book.slug,
        bookTitle: book.title,
        kind: 'chapter',
        target: chapter.id,
        title: chapter.title,
        text: plainText(stripTitle(raw)),
      })
    }
    for (const aux of book.aux) {
      const raw = await fs.readFile(path.join(SOURCE, book.slug, aux.file), 'utf8')
      search.push({
        book: book.slug,
        bookTitle: book.title,
        kind: aux.kind,
        target: null,
        title: aux.title,
        text: plainText(stripTitle(raw)),
      })
    }
  }

  const index = {
    generatedAt: new Date().toISOString(),
    source: SOURCE,
    books,
  }

  await fs.writeFile(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2))
  await fs.writeFile(path.join(OUT, 'search.json'), JSON.stringify(search))

  const chapterCount = books.reduce((n, b) => n + b.chapters.length, 0)
  console.log(`已同步 ${books.length} 本书 / ${chapterCount} 个章节 → public/library`)
  for (const book of books) {
    console.log(`  · ${book.title}（${book.chapters.length} 章，约 ${book.minutes} 分钟）`)
  }
}

function orderOf(slug) {
  const i = ORDER.indexOf(slug)
  return i === -1 ? ORDER.length : i
}

async function readBook(slug) {
  const dir = path.join(SOURCE, slug)
  const skill = await fs.readFile(path.join(dir, 'SKILL.md'), 'utf8')
  const chapterFiles = (await fs.readdir(path.join(dir, 'chapters'))).filter((f) =>
    f.endsWith('.md'),
  )
  if (!chapterFiles.length) throw new Error('chapters 目录为空')

  const meta = META[slug] || fallbackMeta(slug)
  const front = parseFrontmatter(skill)
  const title = firstHeading(skill) || slug
  const description = front.description || ''
  const author = parseAuthor(skill)
  const sections = splitSections(skill)
  const intro = sections
    .filter((s) => s.title.startsWith('核心框架'))
    .map((s) => cleanBody(s.body))
    .filter(Boolean)
    .join('\n\n')
  const scope = cleanBody(
    sections.filter((s) => s.title.includes('范围与限制')).flatMap((s) => s.body),
  )
  const topics = parseTopics(sections)

  // 优先按 SKILL.md 的章节索引表排序与命名
  const tableRows = parseChapterTable(skill)
  const ordered = []
  const seen = new Set()
  for (const row of tableRows) {
    if (!chapterFiles.includes(row.file) || seen.has(row.file)) continue
    seen.add(row.file)
    ordered.push({ ...row, file: row.file })
  }
  for (const file of [...chapterFiles].sort()) {
    if (seen.has(file)) continue
    const raw = await fs.readFile(path.join(dir, 'chapters', file), 'utf8')
    ordered.push({
      file,
      label: path.basename(file, '.md'),
      title: firstHeading(raw) || path.basename(file, '.md'),
      subtitle: '',
    })
  }

  const chapters = []
  for (let i = 0; i < ordered.length; i += 1) {
    const item = ordered[i]
    const raw = await fs.readFile(path.join(dir, 'chapters', item.file), 'utf8')
    const text = plainText(stripTitle(raw))
    const chars = text.replace(/\s/g, '').length
    chapters.push({
      id: path.basename(item.file, '.md'),
      label: item.label || String(i + 1).padStart(2, '0'),
      title: item.title || firstHeading(raw) || item.file,
      subtitle: item.subtitle || '',
      file: `chapters/${item.file}`,
      chars,
      minutes: Math.max(1, Math.round(chars / 400)),
    })
  }

  const aux = []
  for (const item of AUX_FILES) {
    try {
      await fs.access(path.join(dir, item.file))
      const raw = await fs.readFile(path.join(dir, item.file), 'utf8')
      const chars = plainText(stripTitle(raw)).replace(/\s/g, '').length
      aux.push({ ...item, chars, minutes: Math.max(1, Math.round(chars / 400)) })
    } catch {
      // 该辅助文件不存在
    }
  }

  const resolvedTopics = topics.map((topic) => ({
    ...topic,
    chapters: resolveRefs(topic.refs, chapters),
  }))

  return {
    slug,
    title,
    author,
    description,
    category: meta.category,
    tagline: meta.tagline,
    theme: meta.theme,
    intro,
    scope,
    chapterCount: chapters.length,
    minutes: chapters.reduce((n, c) => n + c.minutes, 0),
    chapters,
    topics: resolvedTopics,
    aux,
  }
}

function fallbackMeta(slug) {
  let hash = 0
  for (const ch of slug) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const theme = FALLBACK_THEMES[hash % FALLBACK_THEMES.length]
  return { category: '阅读笔记', tagline: 'book-to-skills 精读', theme }
}

function parseFrontmatter(md) {
  const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const data = {}
  if (!match) return data
  for (const line of match[1].split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i < 0) continue
    const key = line.slice(0, i).trim()
    let value = line.slice(i + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    data[key] = value
  }
  return data
}

function firstHeading(md) {
  const match = md.match(/^#\s+(.+?)\s*$/m)
  return match ? match[1].replace(/^《|》$/g, '').trim() : ''
}

function parseAuthor(md) {
  const line = md.split(/\r?\n/).find((l) => /^\*\*作者\*\*[：:]/.test(l))
  if (!line) return ''
  return line
    .replace(/^\*\*作者\*\*[：:]\s*/, '')
    .split('|')[0]
    .replace(/\*\*/g, '')
    .trim()
}

function splitSections(md) {
  const sections = [{ title: '', body: [] }]
  for (const line of md.replace(/\r\n/g, '\n').split('\n')) {
    const match = line.match(/^##\s+(.+?)\s*$/)
    if (match) sections.push({ title: match[1], body: [] })
    else sections[sections.length - 1].body.push(line)
  }
  return sections
}

function cleanBody(lines) {
  return lines
    .join('\n')
    .replace(/^-{3,}\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function parseTopics(sections) {
  const body = sections
    .filter((s) => s.title.includes('主题索引'))
    .flatMap((s) => s.body)
    .join('\n')
  const topics = []
  for (const line of body.split('\n')) {
    const match = line.match(/^\s*[-*]\s*\*\*(.+?)\*\*\s*[→>\-–]+\s*(.+?)\s*$/)
    if (!match) continue
    const refs = match[2]
      .split(/[,，、]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (refs.length) topics.push({ name: match[1].trim(), refs })
  }
  return topics
}

function parseChapterTable(md) {
  const rows = []
  for (const line of md.split(/\r?\n/)) {
    const match = line.match(/^\|\s*\[([^\]]+)\]\((chapters\/[^)]+?\.md)\)\s*\|(.*)\|\s*$/)
    if (!match) continue
    const cells = match[3].split('|').map((s) => s.trim())
    rows.push({
      file: match[2].replace(/^chapters\//, ''),
      label: match[1].trim(),
      title: cells[0] || '',
      subtitle: cells[1] || '',
    })
  }
  return rows
}

/** 将「ch16」「卷1」「钱钱1-3~4」这类主题引用解析为章节 id */
function resolveRefs(refs, chapters) {
  const ids = []
  const add = (id) => {
    if (!ids.includes(id)) ids.push(id)
  }
  for (const ref of refs) {
    const token = ref.trim()
    if (!token) continue
    const before = ids.length
    const exact = chapters.find((c) => c.label === token)
    if (exact) {
      add(exact.id)
      continue
    }
    // 文件名前缀匹配（如主题写「v1」，索引表标签是「卷1」）
    const byId = chapters.filter((c) => c.id === token || c.id.startsWith(`${token}-`))
    if (byId.length) {
      byId.forEach((c) => add(c.id))
      continue
    }
    const want = parseRange(token)
    if (want) {
      for (const chapter of chapters) {
        const have = parseRange(chapter.label)
        if (!have || stemKey(have.stem) !== stemKey(want.stem)) continue
        if (want.start === null) {
          add(chapter.id)
          continue
        }
        if (have.start === null) continue
        const haveEnd = have.end ?? have.start
        const wantEnd = want.end ?? want.start
        if (want.start <= haveEnd && wantEnd >= have.start) add(chapter.id)
      }
    }
    // 兜底：前缀匹配（如「钱钱2」→「钱钱2-1~7」）
    if (ids.length === before) {
      for (const chapter of chapters) {
        if (chapter.label.startsWith(token)) add(chapter.id)
      }
    }
  }
  return ids
}

function parseRange(label) {
  const match = label.match(/^([^\-–~]+?)(?:-(\d+)(?:~(\d+))?)?$/)
  if (!match) return null
  return {
    stem: match[1],
    start: match[2] === undefined ? null : Number(match[2]),
    end: match[3] === undefined ? (match[2] === undefined ? null : Number(match[2])) : Number(match[3]),
  }
}

/** 「ch3」与「ch03」视为同一序列 */
function stemKey(stem) {
  const match = stem.match(/^(.*?)(\d+)$/)
  if (!match) return stem
  return `${match[1]}#${Number(match[2])}`
}

function stripTitle(md) {
  return md.replace(/^\uFEFF?#[^\n]*\n+/, '')
}

// 检索索引里把英文小节标题换成中文，片段读起来更顺
const SECTION_LABELS = [
  [/\bFrameworks Introduced\b/gi, '核心框架'],
  [/\bCore Idea\b/gi, '核心观点'],
  [/\bKey Concepts\b/gi, '关键概念'],
  [/\bMental Models\b/gi, '心智模型'],
  [/\bAnti[- ]Patterns\b/gi, '反模式'],
  [/\bWorked Example\b/gi, '案例拆解'],
  [/\bKey Takeaways\b/gi, '关键要点'],
  [/\bConnects To\b/gi, '关联'],
]

function plainText(md) {
  let text = md
    .replace(/^---[\s\S]*?---\s*/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*_~`>#|]/g, ' ')
    .replace(/^\s*[-+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
  for (const [pattern, zh] of SECTION_LABELS) text = text.replace(pattern, zh)
  return text.replace(/\s+/g, ' ').trim()
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
