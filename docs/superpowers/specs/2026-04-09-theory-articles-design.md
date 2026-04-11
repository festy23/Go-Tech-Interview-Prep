# Theory Articles for Quiz Blocks — Design Spec

## Context

The Go interview prep platform is quiz-only — users jump straight into questions with no way to study the material first. This creates a poor learning experience: users who score low have no on-platform path to improve. Theory articles provide study material for each quiz block, so users can read → learn → quiz → improve.

## Overview

40 bilingual (ru/en) Markdown articles stored in MongoDB, rendered on the frontend as a dedicated article page. 8 overview articles for parent blocks + 32 detailed articles for sub-blocks. Images stored in MinIO (S3-compatible). Articles are seeded from Markdown files in the repo.

## Content Structure

### Parent block articles (8)
- `blockId` matches parent: `concurrency`, `sql`, `oop`, `primitives`, `networks`, `server`, `runtime`, `sysdesign`
- 800-1200 words, overview of the topic area
- Links to child sub-block articles
- High-level concepts, roadmap of what to learn

### Sub-block articles (32)
- `blockId` matches sub-block: `concurrency-goroutines`, `sql-queries`, `oop-solid`, etc.
- 1500-2500 words each
- Sections follow the block's `topics[]` array
- Go code examples with syntax highlighting
- Common mistakes / interview pitfalls
- Self-check mini-task at the end

### Language
- All articles in Russian and English
- Stored as `content: { ru: string, en: string }` in MongoDB
- Frontend switches via existing i18n language toggle

## Architecture

```
content/                        ← Source of truth (in repo)
  articles/
    ru/
      concurrency.md
      concurrency-goroutines.md
      ...
    en/
      concurrency.md
      concurrency-goroutines.md
      ...
  images/
    goroutines/
      gmp-model.png
    channels/
      buffered-vs-unbuffered.png
    ...

scripts/seed-articles.ts       ← Reads .md files → inserts into MongoDB
scripts/seed-images.ts         ← Uploads images/* → MinIO bucket
```

### MongoDB — `articles` collection

```typescript
interface ArticleEntity {
  _id: ObjectId
  blockId: string                    // matches BlockEntity.blockId
  parentBlockId: string | null       // null for overview articles
  title: { ru: string; en: string }
  content: { ru: string; en: string } // full Markdown
  readingTimeMin: number
  createdAt: Date
  updatedAt: Date
}
```

Index: `{ blockId: 1 }` (unique).

### MinIO — S3-compatible image storage

Added to `quiz/docker-compose.yml`:
```yaml
minio:
  image: minio/minio
  ports:
    - "9000:9000"   # S3 API
    - "9001:9001"   # Web console
  environment:
    MINIO_ROOT_USER: minioadmin
    MINIO_ROOT_PASSWORD: minioadmin
  volumes:
    - minio_data:/data
  command: server /data --console-address ":9001"
  restart: unless-stopped
```

Bucket: `articles-images`, public read access.

Images referenced in Markdown via environment-configurable base URL:
```markdown
![GMP Model]({{IMAGES_BASE_URL}}/goroutines/gmp-model.png)
```

Backend replaces `{{IMAGES_BASE_URL}}` with actual MinIO URL when serving articles.

### Backend env vars (new)
```
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=articles-images
MINIO_PUBLIC_URL=http://localhost:9000/articles-images
```

## Backend API

### New routes: `routes/articles.ts`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/articles/:blockId` | None | Get article by blockId. Query: `?lang=ru` |
| GET | `/api/articles` | None | List articles. Query: `?parentBlockId=concurrency&lang=ru` |

Response for single article:
```json
{
  "data": {
    "id": "...",
    "blockId": "concurrency-goroutines",
    "parentBlockId": "concurrency",
    "title": "Горутины",
    "content": "# Горутины\n\nГорутина — это...",
    "readingTimeMin": 7
  }
}
```

Response for list:
```json
{
  "data": [
    { "blockId": "concurrency-goroutines", "title": "Горутины", "readingTimeMin": 7 },
    { "blockId": "concurrency-channels", "title": "Каналы", "readingTimeMin": 8 }
  ]
}
```

### Shared schemas: `@quiz/shared`

```typescript
const ArticleDTOSchema = z.object({
  id: z.string(),
  blockId: z.string(),
  parentBlockId: z.string().nullable(),
  title: z.string(),
  content: z.string(),
  readingTimeMin: z.number(),
})

const ArticleListItemSchema = z.object({
  blockId: z.string(),
  parentBlockId: z.string().nullable(),
  title: z.string(),
  readingTimeMin: z.number(),
})
```

## Frontend

### New screen: `Article.tsx`

Navigation: state-based (same as quiz/playground):
- `App.tsx` adds `"article"` screen with `activeArticleBlockId` state
- `openArticle(blockId)` callback passed to Home and SubQuizList

**Article page layout:**
```
┌─────────────────────────────────────────────────┐
│ ← Назад                              [lang: EN] │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────┐  ┌─────────────────────────────┐  │
│  │ TOC      │  │ # Горутины                  │  │
│  │ (sticky) │  │                              │  │
│  │          │  │ 📖 7 мин чтения             │  │
│  │ • Что    │  │                              │  │
│  │ • GMP    │  │ ## Что такое горутина        │  │
│  │ • Стек   │  │ Горутина — это лёгкий...    │  │
│  │ • Утечки │  │                              │  │
│  │          │  │ ```go                        │  │
│  │          │  │ go func() { ... }()          │  │
│  │          │  │ ```                          │  │
│  │          │  │                              │  │
│  │          │  │ ![GMP](minio-url/gmp.png)    │  │
│  │          │  │                              │  │
│  │          │  │ ## Подводные камни           │  │
│  │          │  │ ...                          │  │
│  │          │  │                              │  │
│  │          │  │ ┌─────────────────────────┐  │  │
│  │          │  │ │  Пройти квиз →          │  │  │
│  │          │  │ └─────────────────────────┘  │  │
│  └──────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**On mobile:** TOC collapses into a dropdown at the top.

### Markdown rendering

```
react-markdown
  + remark-gfm          (tables, strikethrough, task lists)
  + rehype-highlight     (Go syntax highlighting)
  + rehype-slug          (heading IDs for TOC links)
```

Dark theme styling: custom CSS for `.article-prose` matching Carbon palette.

### Entry points (buttons)

1. **SubQuizList** — "📖 Теория" button on each sub-block card
2. **Home** — "📖 Обзор" button on parent block cards
3. **Quiz results** — "📖 Подготовиться" link after low scores

### API client additions

```typescript
export async function fetchArticle(blockId: string): Promise<ArticleDTO> { ... }
export async function fetchArticleList(parentBlockId?: string): Promise<ArticleListItem[]> { ... }
```

### i18n keys

```json
{
  "article.readingTime": "{{min}} мин чтения",
  "article.back": "← Назад",
  "article.theory": "📖 Теория",
  "article.overview": "📖 Обзор",
  "article.startQuiz": "Пройти квиз →",
  "article.toc": "Содержание",
  "article.prepare": "📖 Подготовиться"
}
```

## Content Generation

40 articles generated by AI, each covering:
1. Introduction — what and why
2. Core concepts — sections following `topics[]` of the block
3. Go code examples — idiomatic, compilable
4. Common mistakes — what interviewers look for
5. Self-check — mini-exercise or question

Diagrams generated as PNG (Mermaid/draw.io) for key concepts:
- GMP model (goroutines)
- Channel operations (channels)
- B-tree structure (SQL indexes)
- Circuit breaker states (system design)
- etc.

## Seed Scripts

### `scripts/seed-articles.ts`
- Reads `content/articles/{lang}/*.md`
- Parses frontmatter (title, blockId, parentBlockId)
- Computes reading time from word count
- Upserts into `articles` collection
- Replaces `{{IMAGES_BASE_URL}}` with env var

### `scripts/seed-images.ts`
- Reads `content/images/**/*`
- Uploads to MinIO bucket `articles-images`
- Preserves directory structure as S3 key prefix

## Testing

1. Seed articles + images locally
2. Open article page → verify Markdown renders correctly
3. Verify images load from MinIO
4. Switch language → content changes
5. TOC links scroll to headings
6. "Пройти квиз" navigates to quiz
7. Mobile layout — TOC collapses
