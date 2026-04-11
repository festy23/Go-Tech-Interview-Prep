/**
 * Seed articles from Markdown files into MongoDB.
 * Reads content/articles/{lang}/*.md with YAML frontmatter.
 *
 * Run:
 *   cd quiz/apps/backend
 *   pnpm exec tsx --tsconfig tsconfig.seed.json scripts/seed-articles.ts
 *
 * Production:
 *   DOTENV_CONFIG_PATH=../../.env.local pnpm exec tsx --tsconfig tsconfig.seed.json scripts/seed-articles.ts
 */
import 'dotenv/config'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { MongoClient } from 'mongodb'
import { env } from '../src/env.js'

// ── Types ────────────────────────────────────────────────────────────────────

interface Frontmatter {
  title: string
  blockId: string
  parentBlockId: string | null
}

interface ArticleData {
  blockId: string
  parentBlockId: string | null
  title: { ru: string; en: string }
  content: { ru: string; en: string }
  readingTimeMin: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseFrontmatter(raw: string): { meta: Frontmatter; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) throw new Error('No frontmatter found')

  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':')
    if (key && rest.length) {
      meta[key.trim()] = rest.join(':').trim()
    }
  }

  return {
    meta: {
      title: meta['title'] ?? '',
      blockId: meta['blockId'] ?? '',
      parentBlockId: meta['parentBlockId'] === 'null' || !meta['parentBlockId']
        ? null
        : meta['parentBlockId'],
    },
    content: match[2].trim(),
  }
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

function readingTime(text: string): number {
  return Math.max(1, Math.round(wordCount(text) / 200))
}

// ── Main ─────────────────────────────────────────────────────────────────────

const CONTENT_DIR = join(import.meta.dirname!, '..', '..', '..', '..', 'content', 'articles')

async function main() {
  const ruDir = join(CONTENT_DIR, 'ru')
  const enDir = join(CONTENT_DIR, 'en')

  if (!existsSync(ruDir)) {
    console.error(`[seed-articles] Directory not found: ${ruDir}`)
    process.exit(1)
  }

  // Collect all .md files from ru/ (source of truth for article list)
  const ruFiles = readdirSync(ruDir).filter((f) => f.endsWith('.md'))
  console.log(`[seed-articles] Found ${ruFiles.length} articles in ru/`)

  const articles: ArticleData[] = []

  for (const file of ruFiles) {
    const ruRaw = readFileSync(join(ruDir, file), 'utf-8')
    const ru = parseFrontmatter(ruRaw)

    // Try to find matching English file
    const enPath = join(enDir, file)
    let enTitle = ru.meta.title
    let enContent = ''
    if (existsSync(enPath)) {
      const enRaw = readFileSync(enPath, 'utf-8')
      const en = parseFrontmatter(enRaw)
      enTitle = en.meta.title
      enContent = en.content
    } else {
      console.warn(`[seed-articles] No English version for ${file}, using empty`)
    }

    articles.push({
      blockId: ru.meta.blockId,
      parentBlockId: ru.meta.parentBlockId,
      title: { ru: ru.meta.title, en: enTitle },
      content: { ru: ru.content, en: enContent },
      readingTimeMin: readingTime(ru.content),
    })
  }

  // Connect to MongoDB
  const client = new MongoClient(env.MONGODB_URI)
  await client.connect()
  const db = client.db(env.MONGODB_DB_NAME)
  const col = db.collection('articles')

  // Ensure index
  await col.createIndex({ blockId: 1 }, { unique: true })

  // Upsert articles
  let inserted = 0
  let updated = 0

  for (const article of articles) {
    const result = await col.updateOne(
      { blockId: article.blockId },
      {
        $set: {
          ...article,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true },
    )
    if (result.upsertedCount) inserted++
    else if (result.modifiedCount) updated++
  }

  console.log(`[seed-articles] Done: ${inserted} inserted, ${updated} updated, ${articles.length} total`)

  await client.close()
}

main().catch((err) => {
  console.error('[seed-articles] Error:', err)
  process.exit(1)
})
