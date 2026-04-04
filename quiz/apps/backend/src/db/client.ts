import { MongoClient, type Db } from 'mongodb'
import { env } from '../env.js'

let client: MongoClient | null = null
let db: Db | null = null
let connectPromise: Promise<Db> | null = null

export function getDb(): Promise<Db> {
  if (db) return Promise.resolve(db)
  if (connectPromise) return connectPromise

  connectPromise = (async () => {
    client = new MongoClient(env.MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      retryWrites: true,
      retryReads: true,
    })

    await client.connect()
    db = client.db(env.MONGODB_DB_NAME)
    console.log(`[db] Connected to MongoDB: ${env.MONGODB_DB_NAME}`)
    return db
  })()

  return connectPromise
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close()
    client = null
    db = null
    connectPromise = null
    console.log('[db] MongoDB connection closed')
  }
}
