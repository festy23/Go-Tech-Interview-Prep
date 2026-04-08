/**
 * Balance option lengths so the correct answer is NOT always the longest.
 *
 * Strategy: for each question where correct option is the longest,
 * pad a random wrong option to be >= correct option length by appending
 * a plausible-sounding suffix from a pool of technical phrases.
 */
import 'dotenv/config'
import { MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI!
if (!uri) throw new Error('MONGODB_URI not set')

const SUFFIXES_RU = [
  ' — это рекомендуемый подход в продакшене',
  ' и обеспечивает потокобезопасность',
  ' при условии правильной конфигурации',
  ' за счёт внутренней оптимизации компилятора',
  ' с использованием встроенных механизмов Go',
  ' что соответствует спецификации языка',
  ' для обеспечения обратной совместимости',
  ' и автоматически управляется рантаймом',
  ' благодаря встроенной поддержке в стандартной библиотеке',
  ' начиная с определённой версии Go',
  ' в соответствии с моделью памяти Go',
  ' для предотвращения гонок данных',
  ' при работе с конкурентными операциями',
  ' что является идиоматичным подходом в Go',
  ' при соблюдении контракта интерфейса',
]

const SUFFIXES_EN = [
  ' — this is the recommended production approach',
  ' and ensures thread safety',
  ' when properly configured',
  ' due to internal compiler optimizations',
  ' using built-in Go mechanisms',
  ' as per the language specification',
  ' to ensure backward compatibility',
  ' and is automatically managed by the runtime',
  ' thanks to built-in standard library support',
  ' starting from a specific Go version',
  ' according to the Go memory model',
  ' to prevent data races',
  ' when working with concurrent operations',
  ' which is the idiomatic Go approach',
  ' while respecting the interface contract',
]

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

async function main() {
  const client = new MongoClient(uri)
  await client.connect()
  const db = client.db()
  const col = db.collection('questions')

  const questions = await col.find({ type: 'mcq' }).toArray()
  console.log(`[balance] Total MCQ questions: ${questions.length}`)

  let fixed = 0
  let skipped = 0

  for (const q of questions) {
    const optionsRu: string[] = q.options?.ru ?? []
    const optionsEn: string[] = q.options?.en ?? []
    const correct: number = q.correct

    if (optionsRu.length !== 4 || optionsEn.length !== 4) {
      skipped++
      continue
    }

    const ruLengths = optionsRu.map((o: string) => o.length)
    const enLengths = optionsEn.map((o: string) => o.length)

    const ruLongest = ruLengths.indexOf(Math.max(...ruLengths))
    const enLongest = enLengths.indexOf(Math.max(...enLengths))

    // Only fix if correct is longest in at least one language
    if (ruLongest !== correct && enLongest !== correct) {
      skipped++
      continue
    }

    // Pick a random wrong option to pad
    const wrongIndices = [0, 1, 2, 3].filter((i) => i !== correct)
    const targetIdx = pickRandom(wrongIndices)

    const newOptionsRu = [...optionsRu]
    const newOptionsEn = [...optionsEn]

    // Only pad if correct is longest in that language
    if (ruLongest === correct) {
      const correctLen = optionsRu[correct]!.length
      const targetLen = optionsRu[targetIdx]!.length
      if (targetLen < correctLen) {
        const suffix = pickRandom(SUFFIXES_RU)
        newOptionsRu[targetIdx] = optionsRu[targetIdx] + suffix
      }
    }

    if (enLongest === correct) {
      const correctLen = optionsEn[correct]!.length
      const targetLen = optionsEn[targetIdx]!.length
      if (targetLen < correctLen) {
        const suffix = pickRandom(SUFFIXES_EN)
        newOptionsEn[targetIdx] = optionsEn[targetIdx] + suffix
      }
    }

    await col.updateOne(
      { _id: q._id },
      { $set: { 'options.ru': newOptionsRu, 'options.en': newOptionsEn } },
    )
    fixed++
  }

  console.log(`[balance] Fixed: ${fixed}, Skipped: ${skipped}`)

  // Verify
  const after = await col.find({ type: 'mcq' }).toArray()
  let longestCorrect = 0
  for (const q of after) {
    const opts: string[] = q.options?.ru ?? []
    const lengths = opts.map((o: string) => o.length)
    if (lengths.indexOf(Math.max(...lengths)) === q.correct) {
      longestCorrect++
    }
  }
  console.log(`[balance] After: ${longestCorrect}/${after.length} (${Math.round(100 * longestCorrect / after.length)}%) correct = longest`)

  await client.close()
}

main().catch((err) => { console.error(err); process.exit(1) })
