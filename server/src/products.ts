import { getPool, sql } from './db.js';

// SQL columns aliased to camelCase for the JSON API.
const COLUMNS = 'Id AS id, Name AS name, Price AS price, Stock AS stock, ImageUrl AS imageUrl';
const INSERTED = 'INSERTED.Id AS id, INSERTED.Name AS name, INSERTED.Price AS price, INSERTED.Stock AS stock, INSERTED.ImageUrl AS imageUrl';

export const PRICE_MAX = 99_999_999.99; // decimal(10, 2)
export const STOCK_MAX = 2_147_483_647; // int

export interface Product {
  name: string;
  price: number;
  stock: number;
  imageUrl: string | null;
}

/** A product as stored in dbo.Products. */
export interface ProductRow extends Product {
  id: number;
}

export interface ProductPage {
  total: number;
  page: number;
  pageSize: number;
  items: ProductRow[];
}

export class ValidationError extends Error {
  errors: string[];

  constructor(errors: string[]) {
    super(errors.join('; '));
    this.errors = errors;
  }
}

const text = (value: unknown): string => (value == null ? '' : String(value).trim());

// "ImageUrl", "image_url", "Image URL" and "imageurl" all mean the same field.
function readFields(input: unknown): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    fields[key.toLowerCase().replace(/[\s_-]/g, '')] = value;
  }
  return fields;
}

// "$1,299.50" → 1299.5; numbers pass through unchanged.
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  const cleaned = text(value).replace(/[^\d.-]/g, '');
  return cleaned === '' ? NaN : Number(cleaned);
}

// Turns raw input (API body, Excel row, JSON object, AI output) into a clean record + a list of problems.
export function validateProduct(input: unknown): { product: Product; errors: string[] } {
  const f = readFields(input);
  const errors: string[] = [];
  const product: Product = {
    name: text(f.name),
    price: toNumber(f.price),
    stock: toNumber(f.stock),
    imageUrl: text(f.imageurl) || null,
  };

  if (!product.name) errors.push('name is required');
  else if (product.name.length > 100) errors.push('name must be at most 100 characters');

  if (text(f.price) === '') {
    errors.push('price is required');
  } else if (!Number.isFinite(product.price) || product.price < 0 || product.price > PRICE_MAX) {
    errors.push(`price must be a number from 0 to ${PRICE_MAX}`);
  } else if (Math.round(product.price * 100) !== Number((product.price * 100).toFixed(6))) {
    errors.push('price can have at most 2 decimal places');
  }

  if (text(f.stock) === '') {
    errors.push('stock is required');
  } else if (!Number.isInteger(product.stock) || product.stock < 0 || product.stock > STOCK_MAX) {
    errors.push('stock must be a whole number, 0 or more');
  }

  if (product.imageUrl) {
    if (product.imageUrl.length > 255) errors.push('imageUrl must be at most 255 characters');
    else if (!/^https?:\/\//i.test(product.imageUrl) || !URL.canParse(product.imageUrl)) {
      errors.push('imageUrl must be a full http(s) link');
    }
  }

  return { product, errors };
}

function validOrThrow(input: unknown): Product {
  const { product, errors } = validateProduct(input);
  if (errors.length) throw new ValidationError(errors);
  return product;
}

function bindProduct(request: sql.Request, product: Product): sql.Request {
  return request
    .input('name', sql.NVarChar(100), product.name)
    .input('price', sql.Decimal(10, 2), product.price)
    .input('stock', sql.Int, product.stock)
    .input('imageUrl', sql.NVarChar(255), product.imageUrl);
}

const INSERT_SQL = `
  INSERT INTO dbo.Products (Name, Price, Stock, ImageUrl)
  OUTPUT ${INSERTED}
  VALUES (@name, @price, @stock, @imageUrl)`;

export async function listProducts({
  search = '',
  page = 1,
  pageSize = 20,
}: { search?: string; page?: number; pageSize?: number } = {}): Promise<ProductPage> {
  const pool = await getPool();
  const like = search.trim() ? `%${search.trim().replace(/[%_[]/g, '[$&]')}%` : null;
  const where = '(@search IS NULL OR Name LIKE @search)';

  const result = await pool
    .request()
    .input('search', sql.NVarChar(110), like)
    .input('offset', sql.Int, (page - 1) * pageSize)
    .input('pageSize', sql.Int, pageSize).query(`
      SELECT COUNT(*) AS total FROM dbo.Products WHERE ${where};
      SELECT ${COLUMNS} FROM dbo.Products WHERE ${where}
      ORDER BY Id DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;`);

  const [counts, items] = result.recordsets as [sql.IRecordSet<{ total: number }>, sql.IRecordSet<ProductRow>];
  return { total: counts[0].total, page, pageSize, items };
}

export async function getProduct(id: number): Promise<ProductRow | null> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query<ProductRow>(`SELECT ${COLUMNS} FROM dbo.Products WHERE Id = @id`);
  return result.recordset[0] ?? null;
}

export async function createProduct(input: unknown): Promise<ProductRow> {
  const product = validOrThrow(input);
  const pool = await getPool();
  const result = await bindProduct(pool.request(), product).query<ProductRow>(INSERT_SQL);
  return result.recordset[0];
}

export async function updateProduct(id: number, input: unknown): Promise<ProductRow | null> {
  const product = validOrThrow(input);
  const pool = await getPool();
  const result = await bindProduct(pool.request(), product).input('id', sql.Int, id).query<ProductRow>(`
    UPDATE dbo.Products SET Name = @name, Price = @price, Stock = @stock, ImageUrl = @imageUrl
    OUTPUT ${INSERTED}
    WHERE Id = @id`);
  return result.recordset[0] ?? null;
}

// The Products table has no soft-delete column, so this permanently removes the row.
export async function deleteProduct(id: number): Promise<boolean> {
  const pool = await getPool();
  const result = await pool.request().input('id', sql.Int, id).query('DELETE FROM dbo.Products WHERE Id = @id');
  return result.rowsAffected[0] > 0;
}

// Inserts already-validated products in one transaction: all rows go in, or none do.
export async function insertMany(products: Product[]): Promise<number> {
  if (!products.length) return 0;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    for (const product of products) {
      await bindProduct(new sql.Request(transaction), product).query(INSERT_SQL);
    }
    await transaction.commit();
    return products.length;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
