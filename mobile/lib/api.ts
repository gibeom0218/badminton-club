import type {
  Match,
  MatchInput,
  Member,
  MemberInput,
  Session,
  SessionInput,
} from '@/types/api';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${API_URL}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers ?? {}),
      },
      ...options,
    });
  } catch {
    throw new Error(
      `서버에 연결할 수 없습니다.\nEXPO_PUBLIC_API_URL=${API_URL}\nPC와 휴대폰이 같은 Wi‑Fi인지, 서버가 실행 중인지 확인하세요.`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: string }).error)
        : `요청 실패 (${response.status})`;
    throw new Error(message);
  }

  return data as T;
}

export const api = {
  getMembers: () => request<Member[]>('/api/members'),

  createMember: (payload: MemberInput) =>
    request<Member>('/api/members', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateMember: (id: number, payload: MemberInput) =>
    request<Member>(`/api/members/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteMember: (id: number) =>
    request<void>(`/api/members/${id}`, { method: 'DELETE' }),

  getSessions: () => request<Session[]>('/api/sessions'),

  getSession: (id: number) => request<Session>(`/api/sessions/${id}`),

  createSession: (payload: SessionInput) =>
    request<Session>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  addAttendance: (sessionId: number, memberId: number) =>
    request(`/api/sessions/${sessionId}/attendances`, {
      method: 'POST',
      body: JSON.stringify({ member_id: memberId }),
    }),

  removeAttendance: (sessionId: number, memberId: number) =>
    request<void>(
      `/api/sessions/${sessionId}/attendances/${memberId}`,
      { method: 'DELETE' },
    ),

  getMatches: (sessionId: number) =>
    request<Match[]>(`/api/sessions/${sessionId}/matches`),

  createMatch: (sessionId: number, payload: MatchInput) =>
    request<Match>(`/api/sessions/${sessionId}/matches`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteMatch: (sessionId: number, matchId: number) =>
    request<void>(`/api/sessions/${sessionId}/matches/${matchId}`, {
      method: 'DELETE',
    }),
};

export function getApiBaseUrl(): string {
  return API_URL;
}
