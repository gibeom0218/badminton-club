import cors from 'cors';
import express from 'express';
import { checkDatabaseConnection } from './db';
import membersRouter from './routes/members';
import sessionsRouter from './routes/sessions';

const PORT = Number(process.env.PORT) || 3000;

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL 이 없습니다. server/.env 를 확인하세요.');
  process.exit(1);
}

async function main(): Promise<void> {
  try {
    await checkDatabaseConnection();
    console.log('✅ PostgreSQL 연결 성공');
  } catch (err) {
    console.error('❌ PostgreSQL 연결 실패. DATABASE_URL 과 서버 상태를 확인하세요.');
    console.error(err);
    process.exit(1);
  }

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/', (_req, res) => {
    res.json({
      service: 'badminton-club-server',
      endpoints: {
        members: {
          list: 'GET /api/members',
          create: 'POST /api/members',
          update: 'PUT /api/members/:id',
          remove: 'DELETE /api/members/:id',
        },
        sessions: {
          list: 'GET /api/sessions',
          create: 'POST /api/sessions',
          detail: 'GET /api/sessions/:id',
          attend: 'POST /api/sessions/:id/attendances',
          unattend: 'DELETE /api/sessions/:id/attendances/:memberId',
          matches: 'GET /api/sessions/:id/matches',
          createMatch: 'POST /api/sessions/:id/matches',
          deleteMatch: 'DELETE /api/sessions/:id/matches/:matchId',
        },
      },
    });
  });

  app.use('/api/members', membersRouter);
  app.use('/api/sessions', sessionsRouter);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API 서버 실행 중: http://localhost:${PORT}`);
    console.log(`   실물 기기 접속: http://<PC_LAN_IP>:${PORT}`);
  });
}

main();
