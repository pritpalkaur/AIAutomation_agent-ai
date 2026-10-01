import path from 'node:path';
import ExcelJS from 'exceljs';

/** One parsed row, keyed by the normalized column header. */
export type RawRow = Record<string, unknown>;

export const SUPPORTED_EXTENSIONS = ['.xlsx', '.json'];

// Returns an array of plain objects, one per row, keyed by the (normalized) column headers.
export async function parseAttachment(filename: string, buffer: Buffer): Promise<RawRow[]> {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.xlsx') return parseExcel(buffer);
  if (ext === '.json') return parseJson(buffer);
  throw new Error(`Unsupported attachment type: ${filename}`);
}

// "Image URL", "image-url" and "image_url" all map to image_url.
const normalizeKey = (key: unknown): string => String(key).trim().toLowerCase().replace(/[\s-]+/g, '_');

function normalizeRow(row: object): RawRow {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeKey(key), value]));
}

function parseJson(buffer: Buffer): RawRow[] {
  const data: unknown = JSON.parse(buffer.toString('utf8').replace(/^﻿/, ''));
  // Accept [ {...}, {...} ], { "records": [ ... ] } or a single { ... } object.
  const records = (data as { records?: unknown } | null)?.records;
  const rows: unknown[] = Array.isArray(data) ? data : Array.isArray(records) ? records : [data];
  return rows.filter((row): row is object => Boolean(row) && typeof row === 'object').map(normalizeRow);
}

// ExcelJS wraps formulas, rich text and hyperlinks in objects; unwrap them to plain values.
function cellValue(value: ExcelJS.CellValue): unknown {
  if (value == null || value instanceof Date) return value ?? null;
  if (typeof value === 'object') {
    if ('result' in value) return cellValue(value.result);
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    if ('text' in value) return value.text;
    if ('error' in value) return null;
  }
  return value;
}

// First sheet, first row is the header row.
async function parseExcel(buffer: Buffer): Promise<RawRow[]> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS declares its own Buffer type that doesn't match Node's; the runtime value is the same.
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell, col) => {
    headers[col] = normalizeKey(cellValue(cell.value) ?? '');
  });

  const rows: RawRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: RawRow = {};
    row.eachCell((cell, col) => {
      if (headers[col]) record[headers[col]] = cellValue(cell.value);
    });
    if (Object.keys(record).length) rows.push(record);
  });
  return rows;
}
