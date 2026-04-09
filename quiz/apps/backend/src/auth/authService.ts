import { usersCol, progressCol, ObjectId } from '../db/collections.js'
import type { OAuthProviderName, UserEntity } from '../schemas/entities.js'
import type { OAuthUserInfo } from './providers/types.js'
import type { UserDTO } from '@quiz/shared'

export async function findOrCreateUser(
  info: OAuthUserInfo,
  provider: OAuthProviderName,
): Promise<UserEntity> {
  const col = await usersCol()
  const now = new Date()

  // First, try to find by provider + providerUserId (exact match)
  const byProvider = await col.findOne({
    'providers.provider': provider,
    'providers.providerUserId': info.providerUserId,
  })
  if (byProvider) {
    // Update profile info on login
    await col.updateOne(
      { _id: byProvider._id },
      {
        $set: {
          name: info.name,
          avatarUrl: info.avatarUrl,
          updatedAt: now,
        },
      },
    )
    return { ...byProvider, name: info.name, avatarUrl: info.avatarUrl, updatedAt: now }
  }

  // Second, try to link by email (if email is not null)
  if (info.email) {
    const linked = await col.findOneAndUpdate(
      { email: info.email },
      {
        $push: {
          providers: {
            provider,
            providerUserId: info.providerUserId,
            linkedAt: now,
          },
        },
        $set: { updatedAt: now },
      },
      { returnDocument: 'after' },
    )
    if (linked) return linked
  }

  // Create new user
  const newUser: Omit<UserEntity, '_id'> = {
    email: info.email,
    name: info.name,
    avatarUrl: info.avatarUrl,
    providers: [
      {
        provider,
        providerUserId: info.providerUserId,
        linkedAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  }

  const result = await col.insertOne(newUser as UserEntity)
  return { _id: result.insertedId, ...newUser }
}

export async function getUserById(userId: string): Promise<UserEntity | null> {
  const col = await usersCol()
  return col.findOne({ _id: new ObjectId(userId) })
}

export function toUserDTO(user: UserEntity): UserDTO {
  return {
    id: user._id.toHexString(),
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    providers: user.providers.map((p) => p.provider),
  }
}

export async function migrateProgress(
  userId: string,
  sessionId: string,
): Promise<number> {
  const col = await progressCol()
  const result = await col.updateMany(
    { sessionId, userId: { $exists: false } },
    { $set: { userId: new ObjectId(userId) } },
  )
  return result.modifiedCount
}
