export type Gender = '남' | '여';

export interface Member {
  id: number;
  name: string;
  age: number | null;
  grade: string | null;
  gender: Gender | null;
  wins: number;
  losses: number;
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

export interface Match {
  id: number;
  session_id: number;
  team_a_player1: number;
  team_a_player2: number;
  team_b_player1: number;
  team_b_player2: number;
  score_a: number;
  score_b: number;
  note: string | null;
  created_at: string;
  team_a_player1_name: string;
  team_a_player2_name: string;
  team_b_player1_name: string;
  team_b_player2_name: string;
}

export interface MatchInput {
  team_a_player1: number;
  team_a_player2: number;
  team_b_player1: number;
  team_b_player2: number;
  score_a: number;
  score_b: number;
  note?: string | null;
}
