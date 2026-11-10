import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, signToken, type AuthedRequest, type UserRole } from '../auth';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const username =
      typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password =
      typeof req.body?.password === 'string' ? req.body.password : '';

    if (!username || !password) {
      res.status(400).json({ error: '아이디와 비밀번호를 입력하세요.' });
      return;
    }

    const result = await pool.query<{
      id: number;
      username: string;
      password_hash: string;
      role: UserRole;
    }>(
      `SELECT id, username, password_hash, role
       FROM public.users
       WHERE username = $1`,
      [username],
    );

    if (result.rowCount === 0) {
      res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
      return;
    }

    const row = result.rows[0];
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) {
      res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
      return;
    }

    const user = {
      id: row.id,
      username: row.username,
      role: row.role,
    };

    res.json({
      token: signToken(user),
      user,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '로그인에 실패했습니다.' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthedRequest;
    const result = await pool.query(
      `SELECT id, username, role, created_at
       FROM public.users
       WHERE id = $1`,
      [authReq.user.id],
    );

    if (result.rowCount === 0) {
      res.status(401).json({ error: '사용자를 찾을 수 없습니다.' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '사용자 정보 조회에 실패했습니다.' });
  }
});

export default router;
