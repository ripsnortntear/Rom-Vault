import mysql, { Pool, PoolOptions } from "mysql2/promise";

declare global {
  // eslint-disable-next-line no-var
  var __romVaultDbPool: Pool | undefined;
}

function createPool(): Pool {
  const options: PoolOptions = {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "rom_vault",
    waitForConnections: true,
    connectionLimit: 15,
    maxIdle: 10,
    idleTimeout: 60000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    charset: "utf8mb4",
  };

  return mysql.createPool(options);
}

export const db: Pool = global.__romVaultDbPool || createPool();

if (process.env.NODE_ENV !== "production") {
  global.__romVaultDbPool = db;
}

/**
 * Execute a parameterized SQL query returning rows.
 */
export async function query<T>(sql: string, params: any[] = []): Promise<T[]> {
  const [rows] = await db.query(sql, params);
  return rows as T[];
}

/**
 * Execute an INSERT/UPDATE/DELETE query returning execution metadata.
 */
export async function execute(sql: string, params: any[] = []): Promise<any> {
  const [result] = await db.execute(sql, params);
  return result;
}
