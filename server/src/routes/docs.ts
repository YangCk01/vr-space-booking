import { Router, Request, Response } from 'express'
import { generateOpenApiDocument } from '../openapi/generator'

const router = Router()

router.get('/openapi.json', (_req: Request, res: Response) => {
  res.json(generateOpenApiDocument())
})

router.get('/docs', (_req: Request, res: Response) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>VR Space Booking API Docs</title>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
      </head>
      <body>
        <div id="swagger-ui"></div>
        <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
        <script>
          SwaggerUIBundle({
            url: '/api/openapi.json',
            dom_id: '#swagger-ui',
            presets: [SwaggerUIBundle.presets.apis],
          });
        </script>
      </body>
    </html>
  `)
})

export default router
