export type Gender = '남' | '여';

export interface Member {
  id: number;
  name: string;
  age: number | null;
  grade: string | null;
  gender: Gender | null;
  created_at: string;
}

export interface MemberInput {
  name: string;
  age?: number | null;
  grade?: string | null;
  gender?: Gender | null;
}

export interface Session {
  id: number;
  session_date: string;
  title: string;
  place: string | null;
  note: string | null;
  created_at: string;
  attend_count: number;
  attended_member_ids?: number[];
}

export interface SessionInput {
  session_date: string;
  title?: string | null;
  place?: string | null;
  note?: string | null;
}
