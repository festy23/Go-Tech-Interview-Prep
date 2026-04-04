import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { QuestionQuerySchema } from '@quiz/shared'
import { getQuestions } from '../services/questionService.js'

export const questionsRouter = new Hono().get(
  '/',
  zValidator('query', QuestionQuerySchema),
  async (c) => {
    const { quizId, blockId, shuffle, limit, lang } = c.req.valid('query')

    const questions = await getQuestions({
      quizId,
      blockId,
      shuffle: shuffle === 'true',
      limit,
      lang,
    })

    return c.json({ data: questions, count: questions.length }, 200)
  },
)
