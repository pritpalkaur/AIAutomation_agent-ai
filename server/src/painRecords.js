import { getPool, sql } from './db.js';

const COLUMNS = `id, patient_name, country, pain_level, pain_location,
  occurred_at, notes, created_at, updated_at`;

export const PAIN_LEVEL_MIN = 0;
export const PAIN_LEVEL_MAX = 10;

export class ValidationError extends Error {
  constructor(errors) {
    super(errors.join('; '));
    this.errors = errors;
  }
}

const text = (value) => (value == null ? '' : String(value).trim());

// Turns raw input (API body, Excel row, JSON object) into a clean record + a list of problems.
export function validateRecord(input) {
  const errors = [];
  const record = {
    patient_name: text(input.patient_name),
    country: text(input.country),
    pain_level: Number(input.pain_level),
    pain_location: text(input.pain_location),
    occurred_at: input.occurred_at instanceof Date ? input.occurred_at : new Date(input.occurred_at),
    notes: text(input.notes) || null,
  };

  const checkText = (field, max) => {
    if (!record[field]) errors.push(`${field} is required`);
    else if (record[field].length > max) errors.push(`${field} must be at most ${max} characters`);
  };
  checkText('patient_name', 200);
  checkText('country', 100);
  checkText('pain_location', 200);

  if (
    text(input.pain_level) === '' ||
    !Number.isInteger(record.pain_level) ||
    record.pain_level < PAIN_LEVEL_MIN ||
    record.pain_level > PAIN_LEVEL_MAX
  ) {
    errors.push(`pain_level must be a whole number from ${PAIN_LEVEL_MIN} to ${PAIN_LEVEL_MAX}`);
  }

  if (text(input.occurred_at) === '' || Number.isNaN(record.occurred_at.getTime())) {
    errors.push('occurred_at must be a valid date');
  }

  if (record.notes && record.notes.length > 2000) errors.push('notes must be at most 2000 characters');

  return { record, errors };
}

function validOrThrow(input) {
  const { record, errors } = validateRecord(input);
  if (errors.length) throw new ValidationError(errors);
  return record;
}

function bindRecord(request, record) {
  return request
    .input('patient_name', sql.NVarChar(200), record.patient_name)
    .input('country', sql.NVarChar(100), record.country)
    .input('pain_level', sql.TinyInt, record.pain_level)
    .input('pain_location', sql.NVarChar(200), record.pain_location)
    .input('occurred_at', sql.DateTime2(3), record.occurred_at)
    .input('notes', sql.NVarChar(2000), record.notes);
}

const INSERT_SQL = `
  INSERT INTO dbo.PainRecords
    (patient_name, country, pain_level, pain_location, occurred_at, notes, created_at, is_deleted)
  OUTPUT ${COLUMNS.replace(/(\w+)/g, 'INSERTED.$1')}
  VALUES
    (@patient_name, @country, @pain_level, @pain_location, @occurred_at, @notes, SYSUTCDATETIME(), 0)`;

export async function listRecords({ search = '', page = 1, pageSize = 20 } = {}) {
  const pool = await getPool();
  const like = search.trim() ? `%${search.trim().replace(/[%_[]/g, '[$&]')}%` : null;
  const where = `is_deleted = 0 AND (@search IS NULL
    OR patient_name LIKE @search OR country LIKE @search OR pain_location LIKE @search)`;

  const result = await pool
    .request()
    .input('search', sql.NVarChar(210), like)
    .input('offset', sql.Int, (page - 1) * pageSize)
    .input('pageSize', sql.Int, pageSize).query(`
      SELECT COUNT(*) AS total FROM dbo.PainRecords WHERE ${where};
      SELECT ${COLUMNS} FROM dbo.PainRecords WHERE ${where}
      ORDER BY occurred_at DESC, id DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;`);

  return { total: result.recordsets[0][0].total, page, pageSize, items: result.recordsets[1] };
}

export async function getRecord(id) {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .query(`SELECT ${COLUMNS} FROM dbo.PainRecords WHERE id = @id AND is_deleted = 0`);
  return result.recordset[0] ?? null;
}

export async function createRecord(input) {
  const record = validOrThrow(input);
  const pool = await getPool();
  const result = await bindRecord(pool.request(), record).query(INSERT_SQL);
  return result.recordset[0];
}

export async function updateRecord(id, input) {
  const record = validOrThrow(input);
  const pool = await getPool();
  const result = await bindRecord(pool.request(), record).input('id', sql.Int, id).query(`
    UPDATE dbo.PainRecords SET
      patient_name = @patient_name, country = @country, pain_level = @pain_level,
      pain_location = @pain_location, occurred_at = @occurred_at, notes = @notes,
      updated_at = SYSUTCDATETIME()
    OUTPUT ${COLUMNS.replace(/(\w+)/g, 'INSERTED.$1')}
    WHERE id = @id AND is_deleted = 0`);
  return result.recordset[0] ?? null;
}

// Soft delete: the row stays in the table with is_deleted = 1.
export async function deleteRecord(id) {
  const pool = await getPool();
  const result = await pool.request().input('id', sql.Int, id).query(`
    UPDATE dbo.PainRecords SET is_deleted = 1, updated_at = SYSUTCDATETIME()
    WHERE id = @id AND is_deleted = 0`);
  return result.rowsAffected[0] > 0;
}

// Inserts already-validated records in one transaction: all rows go in, or none do.
export async function insertMany(records) {
  if (!records.length) return 0;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    for (const record of records) {
      await bindRecord(new sql.Request(transaction), record).query(INSERT_SQL);
    }
    await transaction.commit();
    return records.length;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}
