import test from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { generateOpenApiDocument } from './generator'
import { openApiRegistry } from './registry'

test('generateOpenApiDocument returns basic OpenAPI spec', () => {
  const doc = generateOpenApiDocument()

  assert.equal(doc.openapi, '3.0.0')
  assert.equal(doc.info.title, 'VR Space Booking API')
  assert.ok(Array.isArray(doc.servers))
})

test('registry schema registration is reflected in generated doc', () => {
  openApiRegistry.register('HealthCheckResponse', z.object({ status: z.string() }))
  const doc = generateOpenApiDocument()

  assert.ok(doc.components?.schemas)
  assert.ok('HealthCheckResponse' in (doc.components!.schemas as Record<string, unknown>))
})

test('core financial routes are registered', () => {
  const doc = generateOpenApiDocument()

  assert.ok(doc.paths?.['/recharges'])
  assert.ok(doc.paths?.['/recharges/confirm'])
  assert.ok(doc.paths?.['/orders/{id}/pay'])
  assert.ok(doc.paths?.['/orders/{id}/refund'])
})
