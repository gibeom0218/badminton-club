import { Router } from 'express';
import { requireAdmin } from '../auth';
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
router.post('/', requireAdmin, async (req, res) => {
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
router.post('/:id/attendances', requireAdmin, async (req, res) => {
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
router.delete('/:id/attendances/:memberId', requireAdmin, async (req, res) => {
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

const EA_PER_TUBE = 12;

function parseNonNegInt(value: unknown): number | 'invalid' {
  if (value === undefined || value === null || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < 0) return 'invalid';
  return n;
}

function toPieces(tube: number, ea: number): number {
  return tube * EA_PER_TUBE + ea;
}

function fromPieces(total: number): { tube: number; ea: number } {
  return {
    tube: Math.floor(total / EA_PER_TUBE),
    ea: total % EA_PER_TUBE,
  };
}

type ShuttlecockRow = {
  id: number;
  session_id: number;
  previous_tube: number;
  previous_ea: number;
  incoming_tube: number;
  incoming_ea: number;
  sold_tube: number;
  sold_ea: number;
  current_tube: number;
  current_ea: number;
  sales_details: string | null;
  duty_names: string | null;
  created_at: string;
  updated_at: string;
};

const SHUTTLECOCK_SELECT = `
  id, session_id,
  previous_tube, previous_ea,
  incoming_tube, incoming_ea,
  sold_tube, sold_ea,
  current_tube, current_ea,
  sales_details, duty_names,
  created_at, updated_at
`;

async function getPreviousStockDefaults(sessionId: number): Promise<{
  previous_tube: number;
  previous_ea: number;
}> {
  const result = await pool.query<{ current_tube: number; current_ea: number }>(
    `SELECT ss.current_tube, ss.current_ea
     FROM public.session_shuttlecock ss
     JOIN public.sessions s ON s.id = ss.session_id
     JOIN public.sessions cur ON cur.id = $1
     WHERE s.session_date < cur.session_date
        OR (s.session_date = cur.session_date AND s.id < cur.id)
     ORDER BY s.session_date DESC, s.id DESC
     LIMIT 1`,
    [sessionId],
  );

  if ((result.rowCount ?? 0) === 0) {
    return { previous_tube: 0, previous_ea: 0 };
  }

  return {
    previous_tube: result.rows[0].current_tube,
    previous_ea: result.rows[0].current_ea,
  };
}

// GET /api/sessions/:id/shuttlecock — 셔틀콕 재고 (없으면 전일재고 이어받기 draft)
router.get('/:id/shuttlecock', async (req, res) => {
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

    const existing = await pool.query<ShuttlecockRow>(
      `SELECT ${SHUTTLECOCK_SELECT}
       FROM public.session_shuttlecock
       WHERE session_id = $1`,
      [sessionId],
    );

    if ((existing.rowCount ?? 0) > 0) {
      res.json({ ...existing.rows[0], is_new: false });
      return;
    }

    const prev = await getPreviousStockDefaults(sessionId);
    const current = fromPieces(toPieces(prev.previous_tube, prev.previous_ea));

    res.json({
      id: null,
      session_id: sessionId,
      previous_tube: prev.previous_tube,
      previous_ea: prev.previous_ea,
      incoming_tube: 0,
      incoming_ea: 0,
      sold_tube: 0,
      sold_ea: 0,
      current_tube: current.tube,
      current_ea: current.ea,
      sales_details: '',
      duty_names: '',
      created_at: null,
      updated_at: null,
      is_new: true,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '셔틀콕 재고 조회에 실패했습니다.' });
  }
});

// PUT /api/sessions/:id/shuttlecock — 셔틀콕 재고 upsert
router.put('/:id/shuttlecock', requireAdmin, async (req, res) => {
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

    const previousTube = parseNonNegInt(req.body?.previous_tube);
    const previousEa = parseNonNegInt(req.body?.previous_ea);
    const incomingTube = parseNonNegInt(req.body?.incoming_tube);
    const incomingEa = parseNonNegInt(req.body?.incoming_ea);
    const soldTube = parseNonNegInt(req.body?.sold_tube);
    const soldEa = parseNonNegInt(req.body?.sold_ea);
    const salesDetailsRaw =
      typeof req.body?.sales_details === 'string'
        ? req.body.sales_details.trim()
        : '';
    const dutyNamesRaw =
      typeof req.body?.duty_names === 'string' ? req.body.duty_names.trim() : '';
    const dutyNameParts = dutyNamesRaw
      .split(/[,，、/]/)
      .map((s: string) => s.trim())
      .filter(Boolean)
      .slice(0, 2);
    const dutyNamesNormalized = dutyNameParts.join(', ');

    if (
      previousTube === 'invalid' ||
      previousEa === 'invalid' ||
      incomingTube === 'invalid' ||
      incomingEa === 'invalid' ||
      soldTube === 'invalid' ||
      soldEa === 'invalid'
    ) {
      res.status(400).json({ error: '통/개 수량은 0 이상 정수여야 합니다.' });
      return;
    }
    if (salesDetailsRaw.length > 2000) {
      res.status(400).json({ error: '판매내역은 2000자 이하여야 합니다.' });
      return;
    }
    if (dutyNamesNormalized.length > 200) {
      res.status(400).json({ error: '당번은 200자 이하여야 합니다.' });
      return;
    }

    const prevPieces = toPieces(previousTube, previousEa);
    const inPieces = toPieces(incomingTube, incomingEa);
    const soldPieces = toPieces(soldTube, soldEa);
    const currentPieces = prevPieces + inPieces - soldPieces;

    if (currentPieces < 0) {
      res.status(400).json({
        error: '당일재고가 음수가 됩니다. 판매/수입/전일재고를 확인하세요.',
      });
      return;
    }

    // 입력 통·개도 12개 기준으로 정규화해 저장
    const prevNorm = fromPieces(prevPieces);
    const inNorm = fromPieces(inPieces);
    const soldNorm = fromPieces(soldPieces);
    const currentNorm = fromPieces(currentPieces);
    const salesDetails = salesDetailsRaw || null;
    const dutyNames = dutyNamesNormalized || null;

    const result = await pool.query<ShuttlecockRow>(
      `INSERT INTO public.session_shuttlecock (
         session_id,
         previous_tube, previous_ea,
         incoming_tube, incoming_ea,
         sold_tube, sold_ea,
         current_tube, current_ea,
         sales_details, duty_names
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (session_id) DO UPDATE SET
         previous_tube = EXCLUDED.previous_tube,
         previous_ea = EXCLUDED.previous_ea,
         incoming_tube = EXCLUDED.incoming_tube,
         incoming_ea = EXCLUDED.incoming_ea,
         sold_tube = EXCLUDED.sold_tube,
         sold_ea = EXCLUDED.sold_ea,
         current_tube = EXCLUDED.current_tube,
         current_ea = EXCLUDED.current_ea,
         sales_details = EXCLUDED.sales_details,
         duty_names = EXCLUDED.duty_names,
         updated_at = NOW()
       RETURNING ${SHUTTLECOCK_SELECT}`,
      [
        sessionId,
        prevNorm.tube,
        prevNorm.ea,
        inNorm.tube,
        inNorm.ea,
        soldNorm.tube,
        soldNorm.ea,
        currentNorm.tube,
        currentNorm.ea,
        salesDetails,
        dutyNames,
      ],
    );

    res.json({ ...result.rows[0], is_new: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '셔틀콕 재고 저장에 실패했습니다.' });
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
router.post('/:id/matches', requireAdmin, async (req, res) => {
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

    await applyMatchStats(
      client,
      {
        team_a_player1: teamA1,
        team_a_player2: teamA2,
        team_b_player1: teamB1,
        team_b_player2: teamB2,
        score_a: scoreA,
        score_b: scoreB,
      },
      1,
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

type MatchPlayers = {
  team_a_player1: number;
  team_a_player2: number;
  team_b_player1: number;
  team_b_player2: number;
  score_a: number;
  score_b: number;
};

async function applyMatchStats(
  client: { query: typeof pool.query },
  match: MatchPlayers,
  direction: 1 | -1,
): Promise<void> {
  const winnerIds =
    match.score_a > match.score_b
      ? [match.team_a_player1, match.team_a_player2]
      : [match.team_b_player1, match.team_b_player2];
  const loserIds =
    match.score_a > match.score_b
      ? [match.team_b_player1, match.team_b_player2]
      : [match.team_a_player1, match.team_a_player2];

  if (direction === 1) {
    await client.query(
      `UPDATE public.members SET wins = wins + 1 WHERE id = ANY($1::int[])`,
      [winnerIds],
    );
    await client.query(
      `UPDATE public.members SET losses = losses + 1 WHERE id = ANY($1::int[])`,
      [loserIds],
    );
    return;
  }

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
}

// PUT /api/sessions/:id/matches/:matchId — 경기 수정 (+ 승패 재반영)
router.put('/:id/matches/:matchId', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const sessionId = Number(req.params.id);
    const matchId = Number(req.params.matchId);
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
    if (!Number.isInteger(matchId) || matchId <= 0) {
      res.status(400).json({ error: '유효한 경기 id가 필요합니다.' });
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

    const oldMatch = matchResult.rows[0] as MatchPlayers;

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

    await applyMatchStats(client, oldMatch, -1);

    await client.query(
      `UPDATE public.matches
       SET team_a_player1 = $1,
           team_a_player2 = $2,
           team_b_player1 = $3,
           team_b_player2 = $4,
           score_a = $5,
           score_b = $6,
           note = $7
       WHERE id = $8 AND session_id = $9`,
      [
        teamA1,
        teamA2,
        teamB1,
        teamB2,
        scoreA,
        scoreB,
        note,
        matchId,
        sessionId,
      ],
    );

    await applyMatchStats(
      client,
      {
        team_a_player1: teamA1,
        team_a_player2: teamA2,
        team_b_player1: teamB1,
        team_b_player2: teamB2,
        score_a: scoreA,
        score_b: scoreB,
      },
      1,
    );

    const detail = await client.query(
      `SELECT ${MATCH_SELECT}
       ${MATCH_JOINS}
       WHERE m.id = $1`,
      [matchId],
    );

    await client.query('COMMIT');
    res.json(detail.rows[0]);
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error(err);
    res.status(500).json({ error: '경기 수정에 실패했습니다.' });
  } finally {
    client.release();
  }
});

// DELETE /api/sessions/:id/matches/:matchId — 경기 삭제 (+ 승패 되돌리기)
router.delete('/:id/matches/:matchId', requireAdmin, async (req, res) => {
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

    const match = matchResult.rows[0] as MatchPlayers;
    await applyMatchStats(client, match, -1);
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
