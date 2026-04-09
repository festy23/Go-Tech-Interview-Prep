import { z } from 'zod'

export const UserDTOSchema = z.object({
  id: z.string(),
  email: z.string().email().nullable(),
  name: z.string(),
  avatarUrl: z.string().url().nullable(),
  providers: z.array(z.enum(['google', 'yandex', 'github'])),
})
export type UserDTO = z.infer<typeof UserDTOSchema>

export const MigrateProgressInputSchema = z.object({
  sessionId: z.string().uuid(),
})
export type MigrateProgressInput = z.infer<typeof MigrateProgressInputSchema>
