import { z } from 'zod'
import { OpenApiGeneratorV3, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { openApiRegistry } from './registry'
import { registerCoreRoutes } from './coreRoutes'

extendZodWithOpenApi(z)

export function generateOpenApiDocument() {
  registerCoreRoutes()
  const generator = new OpenApiGeneratorV3(openApiRegistry.definitions)
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'VR Space Booking API',
      version: '1.0.0',
      description: 'VR 大空间预约系统 API 文档',
    },
    servers: [
      { url: '/api', description: '当前版本' },
      { url: '/api/v1', description: 'v1 版本' },
    ],
  })
}
