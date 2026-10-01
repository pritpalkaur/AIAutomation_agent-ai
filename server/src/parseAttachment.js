import path from 'node:path';
import ExcelJS from 'exceljs';

export const SUPPORTED_EXTENSIONS = ['.xlsx', '.json'];

// Returns an array of plain objects whose keys match the PainRecords column names.
export async function parseAttachment(filename, buffer) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.xlsx') return parseExcel(buffer);
  if (ext === '.json') return parseJson(buffer);
  throw new Error(`Unsupported attachment type: ${filename}`);
}

// "Patient Name", "patient-name" and "patient_name" all map to patient_name.
const normalizeKey = (key) => String(key).trim().toLowerCase().replace(/[\s-]+/g, '_');

function normalizeRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeKey(key), value]));
}

function parseJson(buffer) {
  const data = JSON.parse(buffer.toString('utf8').replace(/^﻿/, ''));
  // Accept [ {...}, {...} ], { "records": [ ... ] } or a single { ... } object.
  const rows = Array.isArray(data) ? data : Array.isArray(data?.records) ? data.records : [data];
  return rows.filter((row) => row && typeof row === 'object').map(normalizeRow);
}

// ExcelJS wraps formulas, rich text and hyperlinks in objects; unwrap them to plain values.
function cellValue(value) {
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
async function parseExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headers = [];
  sheet.getRow(1).eachCell((cell, col) => {
    headers[col] = normalizeKey(cellValue(cell.value) ?? '');
  });

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record = {};
    row.eachCell((cell, col) => {
      if (headers[col]) record[headers[col]] = cellValue(cell.value);
    });
    if (Object.keys(record).length) rows.push(record);
  });
  return rows;
}
