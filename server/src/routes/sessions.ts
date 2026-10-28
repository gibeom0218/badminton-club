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

function parsePositiveInt(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function parseScore(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 99) return null;
  return n;
}

const MATCH_SELECT = `
  m.id,
  m.session_id,
  m.team_a_player1,
  m.team_a_player2,
  m.team_b_player1,
  m.team_b_player2,
  m.score_a,
  m.score_b,
  m.note,
  m.created_at,
  a1.name AS team_a_player1_name,
  a2.name AS team_a_player2_name,
  b1.name AS team_b_player1_name,
  b2.name AS team_b_player2_name
`;

const MATCH_JOINS = `
  FROM public.matches m
  JOIN public.members a1 ON a1.id = m.team_a_player1
  JOIN public.members a2 ON a2.id = m.team_a_player2
  JOIN public.members b1 ON b1.id = m.team_b_player1
  JOIN public.members b2 ON b2.id = m.team_b_player2
`;

// GET /api/sessions/:id/matches — 모임 경기 목록
router.get('/:id/matches', async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      res.status(400).json({ error: '유효한 모임 id가 필요합니다.' });
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

    const result = await pool.query(
      `SELECT ${MATCH_SELECT}
       ${MATCH_JOINS}
       WHERE m.session_id = $1
       ORDER BY m.id DESC`,
      [sessionId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '경기 목록 조회에 실패했습니다.' });
  }
});

// POST /api/sessions/:id/matches — 경기 등록 (+ 승패 반영)
router.post('/:id/matches', async (req, res) => {
  const client = await pool.connect();
  try {
    const sessionId = Number(req.params.id);
    const teamA1 = parsePositiveInt(req.body?.team_a_player1);
    const teamA2 = parsePositiveInt(req.body?.team_a_player2);
    const teamB1 = parsePositiveInt(req.body?.team_b_player1);
    const teamB2 = parsePositiveInt(req.body?.team_b_player2);
    const scoreA = parseScore(req.body?.score_a);
    const scoreB = parseScore(req.body?.score_b);
    const note = parseOptionalText(req.body?.note, 500);

    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      res.status(400).json({ error: '유효한 모임 id가 필요합니다.' });
      return;
    }
    if (teamA1 == null || teamA2 == null || teamB1 == null || teamB2 == null) {
      res.status(400).json({ error: '선수 4명을 모두 선택하세요.' });
      return;
    }
    if (scoreA == null || scoreB == null) {
      res.status(400).json({ error: '점수는 0~99 사이 정수여야 합니다.' });
      return;
    }
    if (scoreA === scoreB) {
      res.status(400).json({ error: '동점은 등록할 수 없습니다.' });
      return;
    }
    if (note === 'invalid') {
      res.status(400).json({ error: '메모가 올바르지 않습니다.' });
      return;
    }

    const playerIds = [teamA1, teamA2, teamB1, teamB2];
    if (new Set(playerIds).size !== 4) {
      res.status(400).json({ error: '같은 회원을 중복 선택할 수 없습니다.' });
      return;
    }

    await client.query('BEGIN');

    const sessionCheck = await client.query(
      `SELECT id FROM public.sessions WHERE id = $1`,
      [sessionId],
    );
    if (sessionCheck.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: '모임을 찾을 수 없습니다.' });
      return;
    }

    const memberCheck = await client.query(
      `SELECT id FROM public.members WHERE id = ANY($1::int[])`,
      [playerIds],
    );
    if (memberCheck.rowCount !== 4) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: '존재하지 않는 회원이 포함되어 있습니다.' });
      return;
    }

    const attendCheck = await client.query(
      `SELECT member_id FROM public.attendances
       WHERE session_id = $1 AND member_id = ANY($2::int[])`,
      [sessionId, playerIds],
    );
    if (attendCheck.rowCount !== 4) {
      await client.query('ROLLBACK');
      res.status(400).json({
        error: '출석한 회원만 경기에 등록할 수 있습니다.',
      });
      return;
    }

    const insertResult = await client.query(
      `INSERT INTO public.matches (
         session_id,
         team_a_player1, team_a_player2,
         team_b_player1, team_b_player2,
         score_a, score_b, note
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [sessionId, teamA1, teamA2, teamB1, teamB2, scoreA, scoreB, note],
    );

    const winnerIds = scoreA > scoreB ? [teamA1, teamA2] : [teamB1, teamB2];
    const loserIds = scoreA > scoreB ? [teamB1, teamB2] : [teamA1, teamA2];

    await client.query(
      `UPDATE public.members SET wins = wins + 1 WHERE id = ANY($1::int[])`,
      [winnerIds],
    );
    await client.query(
      `UPDATE public.members SET losses = losses + 1 WHERE id = ANY($1::int[])`,
      [loserIds],
    );

    const matchId = insertResult.rows[0].id as number;
    const detail = await client.query(
      `SELECT ${MATCH_SELECT}
       ${MATCH_JOINS}
       WHERE m.id = $1`,
      [matchId],
    );

    await client.query('COMMIT');
    res.status(201).json(detail.rows[0]);
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error(err);
    res.status(500).json({ error: '경기 등록에 실패했습니다.' });
  } finally {
    client.release();
  }
});

// DELETE /api/sessions/:id/matches/:matchId — 경기 삭제 (+ 승패 되돌리기)
router.delete('/:id/matches/:matchId', async (req, res) => {
  const client = await pool.connect();
  try {
    const sessionId = Number(req.params.id);
    const matchId = Number(req.params.matchId);

    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      res.status(400).json({ error: '유효한 모임 id가 필요합니다.' });
      return;
    }
    if (!Number.isInteger(matchId) || matchId <= 0) {
      res.status(400).json({ error: '유효한 경기 id가 필요합니다.' });
      return;
    }

    await client.query('BEGIN');

    const matchResult = await client.query(
      `SELECT id, session_id,
              team_a_player1, team_a_player2,
              team_b_player1, team_b_player2,
              score_a, score_b
       FROM public.matches
       WHERE id = $1 AND session_id = $2
       FOR UPDATE`,
      [matchId, sessionId],
    );

    if (matchResult.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: '경기를 찾을 수 없습니다.' });
      return;
    }

    const match = matchResult.rows[0] as {
      team_a_player1: number;
      team_a_player2: number;
      team_b_player1: number;
      team_b_player2: number;
      score_a: number;
      score_b: number;
    };

    const winnerIds =
      match.score_a > match.score_b
        ? [match.team_a_player1, match.team_a_player2]
        : [match.team_b_player1, match.team_b_player2];
    const loserIds =
      match.score_a > match.score_b
        ? [match.team_b_player1, match.team_b_player2]
        : [match.team_a_player1, match.team_a_player2];

    await client.query(
      `UPDATE public.members
       SET wins = GREATEST(wins - 1, 0)
       WHERE id = ANY($1::int[])`,
      [winnerIds],
    );
    await client.query(
      `UPDATE public.members
       SET losses = GREATEST(losses - 1, 0)
       WHERE id = ANY($1::int[])`,
      [loserIds],
    );

    await client.query(`DELETE FROM public.matches WHERE id = $1`, [matchId]);
    await client.query('COMMIT');
    res.status(204).send();
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error(err);
    res.status(500).json({ error: '경기 삭제에 실패했습니다.' });
  } finally {
    client.release();
  }
});

export default router;
