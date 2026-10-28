import { Router } from 'express';
import { pool } from '../db';

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseSessionDate(value: unknown): string | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !DATE_RE.test(value.trim())) return 'invalid';
  return value.trim();
}

function parseOptionalText(
  value: unknown,
  maxLen: number,
): string | null | 'invalid' {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return 'invalid';
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLen) return 'invalid';
  return trimmed;
}

// GET /api/sessions — 모임 목록 (+ 출석 인원 수)
router.get('/', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         s.id,
         s.session_date,
         s.title,
         s.place,
         s.note,
         s.created_at,
         COUNT(a.id)::int AS attend_count
       FROM public.sessions s
       LEFT JOIN public.attendances a ON a.session_id = s.id
       GROUP BY s.id
       ORDER BY s.session_date DESC, s.id DESC`,
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '모임 목록 조회에 실패했습니다.' });
  }
});

// POST /api/sessions — 모임 생성
router.post('/', async (req, res) => {
  try {
    const sessionDate = parseSessionDate(req.body?.session_date);
    const title = parseOptionalText(req.body?.title, 100);
    const place = parseOptionalText(req.body?.place, 100);
    const note = parseOptionalText(req.body?.note, 1000);

    if (sessionDate === null) {
      res.status(400).json({ error: '모임 날짜(session_date)는 필수입니다.' });
      return;
    }
    if (sessionDate === 'invalid') {
      res.status(400).json({ error: '날짜 형식은 YYYY-MM-DD 여야 합니다.' });
      return;
    }
    if (title === 'invalid') {
      res.status(400).json({ error: '제목이 올바르지 않습니다.' });
      return;
    }
    if (place === 'invalid') {
      res.status(400).json({ error: '장소가 올바르지 않습니다.' });
      return;
    }
    if (note === 'invalid') {
      res.status(400).json({ error: '메모가 올바르지 않습니다.' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO public.sessions (session_date, title, place, note)
       VALUES ($1, COALESCE($2, '정기 모임'), $3, $4)
       RETURNING id, session_date, title, place, note, created_at`,
      [sessionDate, title, place, note],
    );

    res.status(201).json({
      ...result.rows[0],
      attend_count: 0,
      attended_member_ids: [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '모임 생성에 실패했습니다.' });
  }
});

// GET /api/sessions/:id — 모임 상세 (+ 출석 회원 id 목록)
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: '유효한 모임 id가 필요합니다.' });
      return;
    }

    const sessionResult = await pool.query(
      `SELECT id, session_date, title, place, note, created_at
       FROM public.sessions
       WHERE id = $1`,
      [id],
    );

    if (sessionResult.rowCount === 0) {
      res.status(404).json({ error: '모임을 찾을 수 없습니다.' });
      return;
    }

    const attendanceResult = await pool.query<{ member_id: number }>(
      `SELECT member_id
       FROM public.attendances
       WHERE session_id = $1
       ORDER BY member_id ASC`,
      [id],
    );

    const attendedMemberIds = attendanceResult.rows.map((r) => r.member_id);

    res.json({
      ...sessionResult.rows[0],
      attend_count: attendedMemberIds.length,
      attended_member_ids: attendedMemberIds,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '모임 조회에 실패했습니다.' });
  }
});

// POST /api/sessions/:id/attendances — 출석 체크
router.post('/:id/attendances', async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const memberId = Number(req.body?.member_id);

    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      res.status(400).json({ error: '유효한 모임 id가 필요합니다.' });
      return;
    }
    if (!Number.isInteger(memberId) || memberId <= 0) {
      res.status(400).json({ error: '유효한 회원 id가 필요합니다.' });
      return;
    }

    const sessionCheck = await pool.query(
      `SELECT id FROM public.sessions WHERE id = $1`,
      [sessionId],
    );
    if (sessionCheck.rowCount === 0) {
      res.status(404).json({ error: '모임을 찾을 수 없습니다.' });
      return;
    }

    const memberCheck = await pool.query(
      `SELECT id FROM public.members WHERE id = $1`,
      [memberId],
    );
    if (memberCheck.rowCount === 0) {
      res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO public.attendances (session_id, member_id)
       VALUES ($1, $2)
       ON CONFLICT (session_id, member_id) DO NOTHING
       RETURNING id, session_id, member_id, created_at`,
      [sessionId, memberId],
    );

    // 이미 출석한 경우에도 성공으로 처리
    if (result.rowCount === 0) {
      res.status(200).json({
        session_id: sessionId,
        member_id: memberId,
        already_attended: true,
      });
      return;
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '출석 등록에 실패했습니다.' });
  }
});

// DELETE /api/sessions/:id/attendances/:memberId — 출석 해제
router.delete('/:id/attendances/:memberId', async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const memberId = Number(req.params.memberId);

    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      res.status(400).json({ error: '유효한 모임 id가 필요합니다.' });
      return;
    }
    if (!Number.isInteger(memberId) || memberId <= 0) {
      res.status(400).json({ error: '유효한 회원 id가 필요합니다.' });
      return;
    }

    const result = await pool.query(
      `DELETE FROM public.attendances
       WHERE session_id = $1 AND member_id = $2
       RETURNING id`,
      [sessionId, memberId],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: '출석 기록을 찾을 수 없습니다.' });
      return;
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '출석 해제에 실패했습니다.' });
  }
});

export default router;
