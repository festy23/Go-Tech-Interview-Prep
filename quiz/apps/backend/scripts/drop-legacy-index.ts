import 'dotenv/config'
import { MongoClient } from 'mongodb'
import { env } from '../src/env.js'

async function main() {
  const client = new MongoClient(env.MONGODB_URI)
  await client.connect()
  const db = client.db(env.MONGODB_DB_NAME)
  await db.collection('questions').dropIndex('legacyId_1_quizId_1')
  console.log('Index legacyId_1_quizId_1 dropped')
  await client.close()
}

main().catch(console.error)
