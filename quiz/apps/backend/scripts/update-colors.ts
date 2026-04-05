import 'dotenv/config'
import { MongoClient } from 'mongodb'
import { env } from '../src/env.js'

const COLORS: Record<string, string> = {
  primitives: '#7BA8F1',
  oop: '#B088ED',
  sql: '#F0B16D',
  concurrency: '#DD7E80',
  networks: '#C38D5E',
  server: '#7BA8F1',
  sysdesign: '#B088ED',
}

async function main() {
  const client = new MongoClient(env.MONGODB_URI)
  await client.connect()
  const db = client.db(env.MONGODB_DB_NAME)
  const col = db.collection('blocks')

  for (const [blockId, color] of Object.entries(COLORS)) {
    await col.updateOne({ blockId }, { $set: { color } })
    console.log(`${blockId} -> ${color}`)
  }

  console.log('Done')
  await client.close()
}

main().catch(console.error)
