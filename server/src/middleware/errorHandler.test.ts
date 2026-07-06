import test from 'node:test'
import assert from 'node:assert/strict'
import { errorHandler } from './errorHandler'

function mockResponse() {
  let statusCode = 200
  let body: any = null
  return {
    locals: { requestId: 'req_test' },
    status(code: number) {
      statusCode = code
      return this
    },
    json(payload: any) {
      body = payload
      return this
    },
    get sentStatus() {
      return statusCode
    },
    get sentBody() {
      return body
    },
  } as any
}

test('production prisma errors do not expose raw database details', () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousConsoleError = console.error
  process.env.NODE_ENV = 'production'
  console.error = () => undefined

  try {
    const res = mockResponse()
    const err = new Error('Unique constraint failed on the fields: (`phone`)')
    err.name = 'PrismaClientKnownRequestError'

    errorHandler(err, {} as any, res, (() => undefined) as any)

    assert.equal(res.sentStatus, 400)
    assert.doesNotMatch(JSON.stringify(res.sentBody), /Unique constraint/)
  } finally {
    process.env.NODE_ENV = previousNodeEnv
    console.error = previousConsoleError
  }
})
