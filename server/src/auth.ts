import dotenv from 'dotenv';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

export type UserRole = 'admin' | 'user';

export type AuthUser = {
  id: number;
  username: string;
  role: UserRole;
};

export type AuthedRequest = Request & { user: AuthUser };

function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'dev-badminton-club-secret';
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    getJwtSecret(),
    { expiresIn: '7d' },
  );
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: '로그인이 필요합니다.' });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: '로그인이 필요합니다.' });
    return;
  }

  try {
    const payload = jwt.verify(token, getJwtSecret()) as AuthUser;
    if (!payload?.id || !payload.username || !payload.role) {
      res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
      return;
    }
    (req as AuthedRequest).user = {
      id: payload.id,
      username: payload.username,
      role: payload.role,
    };
    next();
  } catch {
    res.status(401).json({ error: '로그인이 만료되었거나 유효하지 않습니다.' });
  }
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const user = (req as AuthedRequest).user;
  if (!user) {
    res.status(401).json({ error: '로그인이 필요합니다.' });
    return;
  }
  if (user.role !== 'admin') {
    res.status(403).json({ error: '관리자만 할 수 있는 작업입니다.' });
    return;
  }
  next();
}
