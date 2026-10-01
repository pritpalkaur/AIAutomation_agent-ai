import express, { type NextFunction, type Request, type Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { extractProductsFromText } from './aiExtractor.js';
import { config, gmailConfigured } from './config.js';
import { processInbox } from './emailWorker.js';
import { openApiSpec } from './openapi.js';
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct,
  validateProduct,
  ValidationError,
} from './products.js';

export const app = express();
app.use(express.json());

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function parseId(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'id must be a positive whole number');
  return id;
}

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : fallback;
};

// Swagger UI: interactive API docs at http://localhost:4000/api/docs
app.get('/api/openapi.json', (req, res) => res.json(openApiSpec));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/products', async (req, res) => {
  res.json(
    await listProducts({
      search: String(req.query.search ?? ''),
      page: clamp(req.query.page, 1, 100000, 1),
      pageSize: clamp(req.query.pageSize, 1, 200, 20),
    }),
  );
});

app.get('/api/products/:id', async (req, res) => {
  const product = await getProduct(parseId(req));
  if (!product) throw new HttpError(404, 'Product not found');
  res.json(product);
});

app.post('/api/products', async (req, res) => {
  res.status(201).json(await createProduct(req.body ?? {}));
});

app.put('/api/products/:id', async (req, res) => {
  const product = await updateProduct(parseId(req), req.body ?? {});
  if (!product) throw new HttpError(404, 'Product not found');
  res.json(product);
});

app.delete('/api/products/:id', async (req, res) => {
  if (!(await deleteProduct(parseId(req)))) throw new HttpError(404, 'Product not found');
  res.status(204).end();
});

// AI preview: extracts products from pasted text and validates them, but does not save anything.
// The web app shows the result so a person can review it before saving.
app.post('/api/ai/extract', async (req, res) => {
  if (!config.ai.enabled) throw new HttpError(503, 'AI extraction is off: set ANTHROPIC_API_KEY in server/.env');
  const text = String(req.body?.text ?? '');
  if (!text.trim()) throw new HttpError(400, 'text is required');

  const { products, model, usage } = await extractProductsFromText(text);
  res.json({
    model,
    usage,
    products: products.map((row) => ({ ...row, errors: validateProduct(row).errors })),
  });
});

app.get('/api/ai/status', (req, res) => {
  res.json({ enabled: config.ai.enabled, model: config.ai.enabled ? config.ai.model : null });
});

// Lets the web app trigger an email check right away instead of waiting for the next poll.
app.post('/api/email/fetch', async (req, res) => {
  if (!gmailConfigured) throw new HttpError(503, 'Gmail is not configured: set GMAIL_USER and GMAIL_APP_PASSWORD in server/.env');
  res.json(await processInbox());
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof ValidationError) {
    res.status(400).json({ errors: err.errors });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});
