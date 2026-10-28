import dotenv from 'dotenv';
import path from 'path';
import { Pool } from 'pg';

// Pool 생성 전에 .env 를 먼저 로드해야 비밀번호가 undefined 가 되지 않습니다.
dotenv.config({ path: path.resolve(__dirname, '../.env') });

/**
 * PostgreSQL 연결 풀
 * - DATABASE_URL 은 server/.env 에 있습니다.
 * - 앱(모바일)은 DB에 직접 붙지 않고, 이 서버만 DB에 연결합니다.
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('PostgreSQL 풀 오류:', err);
});

/** 서버 시작 시 DB 연결 확인 */
export async function checkDatabaseConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1 AS ok');
  } finally {
    client.release();
  }
}
