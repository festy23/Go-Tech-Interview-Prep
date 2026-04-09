import type { Collection } from 'mongodb'
import { ObjectId } from 'mongodb'
import { getDb } from './client.js'
import type {
  QuestionEntity,
  ProgressEntity,
  BlockEntity,
  UserEntity,
  RefreshTokenEntity,
  OAuthStateEntity,
} from '../schemas/entities.js'

export async function questionsCol(): Promise<Collection<QuestionEntity>> {
  const db = await getDb()
  return db.collection<QuestionEntity>('questions')
}

export async function blocksCol(): Promise<Collection<BlockEntity>> {
  const db = await getDb()
  return db.collection<BlockEntity>('blocks')
}

export async function progressCol(): Promise<Collection<ProgressEntity>> {
  const db = await getDb()
  return db.collection<ProgressEntity>('progress')
}

export async function usersCol(): Promise<Collection<UserEntity>> {
  const db = await getDb()
  return db.collection<UserEntity>('users')
}

export async function refreshTokensCol(): Promise<Collection<RefreshTokenEntity>> {
  const db = await getDb()
  return db.collection<RefreshTokenEntity>('refresh_tokens')
}

export async function oauthStatesCol(): Promise<Collection<OAuthStateEntity>> {
  const db = await getDb()
  return db.collection<OAuthStateEntity>('oauth_states')
}

export { ObjectId }

export async function ensureIndexes(): Promise<void> {
  const [qCol, pCol, uCol, rtCol, osCol] = await Promise.all([
    questionsCol(),
    progressCol(),
    usersCol(),
    refreshTokensCol(),
    oauthStatesCol(),
  ])

  await Promise.all([
    qCol.createIndex({ quizId: 1 }),
    qCol.createIndex({ blockId: 1 }),
    qCol.createIndex({ quizId: 1, blockId: 1 }),
    pCol.createIndex({ sessionId: 1 }),
    pCol.createIndex({ sessionId: 1, blockId: 1 }),
    pCol.createIndex({ userId: 1 }, { sparse: true }),
    uCol.createIndex({ email: 1 }, { sparse: true, unique: true }),
    uCol.createIndex(
      { 'providers.provider': 1, 'providers.providerUserId': 1 },
      { unique: true },
    ),
    rtCol.createIndex({ tokenHash: 1 }, { unique: true }),
    rtCol.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    rtCol.createIndex({ userId: 1 }),
    osCol.createIndex({ state: 1 }, { unique: true }),
    osCol.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ])

  console.log('[db] Indexes ensured')
}
