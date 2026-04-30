import { Pool, PoolClient } from 'pg';
import { createClient } from 'redis';
import { logger } from '../utils/logger';

// ── PostgreSQL Pool ───────────────────────────────────────────
let pool: Pool;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    pool.on('error', (err) => {
      logger.error('Unexpected PostgreSQL error', { error: err.message });
    });
  }
  return pool;
}

export async function query<T = any>(
  sql: string,
  params?: any[],
  schema?: string
): Promise<T[]> {
  const client = await getPool().connect();
  try {
    if (schema) {
      await client.query(`SET search_path TO ${schema}, engine, public`);
    }
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export async function queryOne<T = any>(
  sql: string,
  params?: any[],
  schema?: string
): Promise<T | null> {
  const rows = await query<T>(sql, params, schema);
  return rows[0] || null;
}

export async function withTransaction<T>(
  fn: (client: PoolClient, schema?: string) => Promise<T>,
  schema?: string
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    if (schema) {
      await client.query(`SET search_path TO ${schema}, engine, public`);
    }
    const result = await fn(client, schema);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Redis Client ──────────────────────────────────────────────
let redisClient: ReturnType<typeof createClient>;

export async function getRedis() {
  if (!redisClient) {
    redisClient = createClient({
      url: process.env.REDIS_URL,
      socket: { reconnectStrategy: (retries) => Math.min(retries * 100, 3000) },
    });
    redisClient.on('error', (err) => logger.error('Redis error', { error: err.message }));
    await redisClient.connect();
  }
  return redisClient;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = await getRedis();
  const val = await redis.get(key);
  return val ? (JSON.parse(val) as T) : null;
}

export async function cacheSet(key: string, value: any, ttlSeconds = 3600): Promise<void> {
  const redis = await getRedis();
  await redis.setEx(key, ttlSeconds, JSON.stringify(value));
}

export async function cacheDel(key: string): Promise<void> {
  const redis = await getRedis();
  await redis.del(key);
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  const redis = await getRedis();
  const keys = await redis.keys(pattern);
  if (keys.length > 0) await redis.del(keys);
}
