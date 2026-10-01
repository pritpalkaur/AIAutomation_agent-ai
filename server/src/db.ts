import sql from 'mssql';
import { config } from './config.js';

let poolPromise: Promise<sql.ConnectionPool> | undefined;

export function getPool(): Promise<sql.ConnectionPool> {
  poolPromise ??= new sql.ConnectionPool(config.db).connect().catch((err) => {
    poolPromise = undefined; // allow a retry on the next call
    throw err;
  });
  return poolPromise;
}

export { sql };
