// OpenAPI 3 description of the REST API. Swagger UI shows it at /api/docs, where every endpoint
// can be tried from the browser. Keep it in step with the routes in app.ts.

const productInput = {
  type: 'object',
  required: ['name', 'price', 'stock'],
  properties: {
    name: { type: 'string', maxLength: 100, example: 'Wireless Mouse - Black' },
    price: { type: 'number', minimum: 0, maximum: 99999999.99, example: 24.99, description: 'At most 2 decimals' },
    stock: { type: 'integer', minimum: 0, example: 120 },
    imageUrl: {
      type: 'string',
      nullable: true,
      maxLength: 255,
      example: 'https://example.com/images/mouse-black.jpg',
      description: 'Full http(s) link, or null',
    },
  },
};

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

const json = (ref: string) => ({ 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } });

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'integer', minimum: 1 },
  example: 1,
};

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Product Import API',
    version: '1.0.0',
    description:
      'Products in SQL Server (dbo.Products), Gmail import and AI extraction with Claude. ' +
      'Use **Try it out** on any endpoint to call the running server.',
  },
  servers: [{ url: '/', description: 'This server' }],
  // The API has no login; it is meant to run locally next to the web app.
  security: [],
  tags: [
    { name: 'Products', description: 'Create, read, update and delete products' },
    { name: 'AI', description: 'Extract products from free-form text with Claude' },
    { name: 'Email', description: 'Gmail import' },
    { name: 'System', description: 'Health check' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['System'],
        operationId: 'getHealth',
        summary: 'Check that the API is running',
        responses: {
          200: {
            description: 'The API is up',
            content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean', example: true } } } } },
          },
        },
      },
    },
    '/api/products': {
      get: {
        tags: ['Products'],
        operationId: 'listProducts',
        summary: 'List products (search and paging)',
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Part of the product name' },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 20 } },
        ],
        responses: { 200: { description: 'One page of products, newest first', content: json('ProductPage') } },
      },
      post: {
        tags: ['Products'],
        operationId: 'createProduct',
        summary: 'Create a product',
        requestBody: { required: true, content: json('ProductInput') },
        responses: {
          201: { description: 'Created', content: json('Product') },
          400: { description: 'Validation failed', content: json('ValidationErrors') },
        },
      },
    },
    '/api/products/{id}': {
      get: {
        tags: ['Products'],
        operationId: 'getProduct',
        summary: 'Get one product',
        parameters: [idParam],
        responses: {
          200: { description: 'The product', content: json('Product') },
          400: errorResponse('id is not a positive whole number'),
          404: errorResponse('Product not found'),
        },
      },
      put: {
        tags: ['Products'],
        operationId: 'updateProduct',
        summary: 'Update a product (all fields)',
        parameters: [idParam],
        requestBody: { required: true, content: json('ProductInput') },
        responses: {
          200: { description: 'The updated product', content: json('Product') },
          400: { description: 'Validation failed or bad id', content: json('ValidationErrors') },
          404: errorResponse('Product not found'),
        },
      },
      delete: {
        tags: ['Products'],
        operationId: 'deleteProduct',
        summary: 'Delete a product permanently',
        parameters: [idParam],
        responses: {
          204: { description: 'Deleted' },
          400: errorResponse('id is not a positive whole number'),
          404: errorResponse('Product not found'),
        },
      },
    },
    '/api/ai/status': {
      get: {
        tags: ['AI'],
        operationId: 'getAiStatus',
        summary: 'Is AI extraction switched on?',
        responses: { 200: { description: 'AI status', content: json('AiStatus') } },
      },
    },
    '/api/ai/extract': {
      post: {
        tags: ['AI'],
        operationId: 'extractProducts',
        summary: 'Extract products from text with Claude (preview, saves nothing)',
        description:
          'Sends the text to Claude, which returns structured products. Each product is validated; ' +
          'rows with an empty `errors` list can be saved with POST /api/products. **Uses the Anthropic API (costs tokens).**',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['text'],
                properties: {
                  text: {
                    type: 'string',
                    example:
                      'Hi, Wireless Mouse (Black) is now $24.99, 120 units in stock. ' +
                      'The USB-C hub costs 39.50 per unit, only 8 left. Laptop Stand: 54.00, out of stock.',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Products found by the AI', content: json('AiExtractResult') },
          400: errorResponse('text is missing'),
          503: errorResponse('AI is off (no ANTHROPIC_API_KEY)'),
        },
      },
    },
    '/api/email/fetch': {
      post: {
        tags: ['Email'],
        operationId: 'checkEmail',
        summary: 'Check Gmail now and import new emails',
        description: 'Runs the same import as the scheduled check. **Writes to the database and labels emails in Gmail.**',
        responses: {
          200: { description: 'Import summary, or skipped if a check is already running', content: json('InboxResult') },
          503: errorResponse('Gmail is not configured'),
        },
      },
    },
  },
  components: {
    schemas: {
      ProductInput: productInput,
      Product: {
        allOf: [
          { type: 'object', required: ['id'], properties: { id: { type: 'integer', example: 1 } } },
          productInput,
        ],
      },
      ProductPage: {
        type: 'object',
        properties: {
          total: { type: 'integer', example: 42 },
          page: { type: 'integer', example: 1 },
          pageSize: { type: 'integer', example: 20 },
          items: { type: 'array', items: { $ref: '#/components/schemas/Product' } },
        },
      },
      AiStatus: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          model: { type: 'string', nullable: true, example: 'claude-opus-5-5' },
        },
      },
      AiExtractResult: {
        type: 'object',
        properties: {
          model: { type: 'string', example: 'claude-opus-5-5' },
          usage: {
            type: 'object',
            properties: { input_tokens: { type: 'integer' }, output_tokens: { type: 'integer' } },
          },
          products: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                price: { type: 'number', nullable: true },
                stock: { type: 'integer', nullable: true },
                imageUrl: { type: 'string', nullable: true },
                errors: { type: 'array', items: { type: 'string' }, description: 'Empty when the product can be saved' },
              },
            },
          },
        },
      },
      InboxResult: {
        type: 'object',
        properties: {
          emails: { type: 'integer' },
          attachments: { type: 'integer' },
          aiEmails: { type: 'integer' },
          inserted: { type: 'integer' },
          rejectedRows: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                subject: { type: 'string' },
                file: { type: 'string' },
                row: { type: 'integer' },
                errors: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          failedEmails: {
            type: 'array',
            items: { type: 'object', properties: { uid: { type: 'integer' }, error: { type: 'string' } } },
          },
          skipped: { type: 'boolean', description: 'Only present when a check was already running' },
          reason: { type: 'string' },
        },
      },
      Error: {
        type: 'object',
        properties: { error: { type: 'string', example: 'Product not found' } },
      },
      ValidationErrors: {
        type: 'object',
        properties: {
          errors: { type: 'array', items: { type: 'string' }, example: ['price is required'] },
        },
      },
    },
  },
};
