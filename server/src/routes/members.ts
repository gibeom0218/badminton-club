import { Router } from 'express';
import { pool } from '../db';

const router = Router();

/** age / grade / gender 입력값 파싱 (빈 값은 null) */
function parseAge(value: unknown): number | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 150) return 'invalid';
  return n;
}

function parseGrade(value: unknown): string | null | 'invalid' {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return 'invalid';
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 50) return 'invalid';
  return trimmed;
}

function parseGender(value: unknown): '남' | '여' | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null;
  if (value === '남' || value === '여') return value;
  return 'invalid';
}

// GET /api/members — 회원 목록 (공통 즐겨찾기 우선)
router.get('/', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         m.id,
         m.name,
         m.age,
         m.grade,
         m.gender,
         m.wins,
         m.losses,
         m.created_at,
         (f.id IS NOT NULL) AS is_favorite
       FROM public.members m
       LEFT JOIN public.favorites f
         ON f.member_id = m.id AND f.user_id IS NULL
       ORDER BY (f.id IS NOT NULL) DESC, m.name ASC`,
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '회원 목록 조회에 실패했습니다.' });
  }
});

// POST /api/members — 회원 등록
router.post('/', async (req, res) => {
  try {
    const name =
      typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const age = parseAge(req.body?.age);
    const grade = parseGrade(req.body?.grade);
    const gender = parseGender(req.body?.gender);

    if (!name) {
      res.status(400).json({ error: '이름을 입력하세요.' });
      return;
    }
    if (name.length > 50) {
      res.status(400).json({ error: '이름은 50자 이하여야 합니다.' });
      return;
    }
    if (age === 'invalid') {
      res.status(400).json({ error: '나이는 0~150 사이 정수여야 합니다.' });
      return;
    }
    if (grade === 'invalid') {
      res.status(400).json({ error: '급수가 올바르지 않습니다.' });
      return;
    }
    if (gender === 'invalid') {
      res.status(400).json({ error: '성별은 남 또는 여만 가능합니다.' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO public.members (name, age, grade, gender)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, age, grade, gender, wins, losses, created_at`,
      [name, age, grade, gender],
    );
    res.status(201).json({ ...result.rows[0], is_favorite: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '회원 등록에 실패했습니다.' });
  }
});

// PUT /api/members/:id — 회원 수정
router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: '유효한 회원 id가 필요합니다.' });
      return;
    }

    const name =
      typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const age = parseAge(req.body?.age);
    const grade = parseGrade(req.body?.grade);
    const gender = parseGender(req.body?.gender);

    if (!name) {
      res.status(400).json({ error: '이름을 입력하세요.' });
      return;
    }
    if (name.length > 50) {
      res.status(400).json({ error: '이름은 50자 이하여야 합니다.' });
      return;
    }
    if (age === 'invalid') {
      res.status(400).json({ error: '나이는 0~150 사이 정수여야 합니다.' });
      return;
    }
    if (grade === 'invalid') {
      res.status(400).json({ error: '급수가 올바르지 않습니다.' });
      return;
    }
    if (gender === 'invalid') {
      res.status(400).json({ error: '성별은 남 또는 여만 가능합니다.' });
      return;
    }

    const result = await pool.query(
      `UPDATE public.members
       SET name = $1,
           age = $2,
           grade = $3,
           gender = $4
       WHERE id = $5
       RETURNING id, name, age, grade, gender, wins, losses, created_at`,
      [name, age, grade, gender, id],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
      return;
    }

    const fav = await pool.query(
      `SELECT 1 FROM public.favorites
       WHERE member_id = $1 AND user_id IS NULL`,
      [id],
    );
    res.json({
      ...result.rows[0],
      is_favorite: (fav.rowCount ?? 0) > 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '회원 수정에 실패했습니다.' });
  }
});

// POST /api/members/:id/favorite — 공통 즐겨찾기 추가 (user_id NULL)
router.post('/:id/favorite', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: '유효한 회원 id가 필요합니다.' });
      return;
    }

    const memberCheck = await pool.query(
      `SELECT id FROM public.members WHERE id = $1`,
      [id],
    );
    if (memberCheck.rowCount === 0) {
      res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
      return;
    }

    const existing = await pool.query(
      `SELECT id FROM public.favorites
       WHERE member_id = $1 AND user_id IS NULL`,
      [id],
    );

    if ((existing.rowCount ?? 0) === 0) {
      await pool.query(
        `INSERT INTO public.favorites (user_id, member_id)
         VALUES (NULL, $1)`,
        [id],
      );
      res.status(201).json({ member_id: id, is_favorite: true });
      return;
    }

    res.status(200).json({ member_id: id, is_favorite: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '즐겨찾기 추가에 실패했습니다.' });
  }
});

// DELETE /api/members/:id/favorite — 공통 즐겨찾기 해제
router.delete('/:id/favorite', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: '유효한 회원 id가 필요합니다.' });
      return;
    }

    await pool.query(
      `DELETE FROM public.favorites
       WHERE member_id = $1 AND user_id IS NULL`,
      [id],
    );

    res.json({ member_id: id, is_favorite: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '즐겨찾기 해제에 실패했습니다.' });
  }
});

// GET /api/members/:id/attendances — 회원 출석 이력 (잔디용)
router.get('/:id/attendances', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: '유효한 회원 id가 필요합니다.' });
      return;
    }

    const memberCheck = await pool.query(
      `SELECT id FROM public.members WHERE id = $1`,
      [id],
    );
    if (memberCheck.rowCount === 0) {
      res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
      return;
    }

    const result = await pool.query(
      `SELECT
         a.session_id,
         s.session_date,
         s.title
       FROM public.attendances a
       JOIN public.sessions s ON s.id = a.session_id
       WHERE a.member_id = $1
       ORDER BY s.session_date DESC, a.session_id DESC`,
      [id],
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '출석 이력 조회에 실패했습니다.' });
  }
});

// DELETE /api/members/:id — 회원 삭제
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: '유효한 회원 id가 필요합니다.' });
      return;
    }

    const result = await pool.query(
      `DELETE FROM public.members
       WHERE id = $1
       RETURNING id`,
      [id],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
      return;
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '회원 삭제에 실패했습니다.' });
  }
});

export default router;
