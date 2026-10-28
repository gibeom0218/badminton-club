# 배드민턴 동호회 관리 앱

배드민턴 동호회의 **회원 관리**와 **출석 체크**를 위한 풀스택 MVP입니다.

React Native(Expo) 앱에서 회원·출석을 다루고, Node.js Express API가 로컬 PostgreSQL에 데이터를 저장합니다.  
앱은 DB에 직접 붙지 않고 REST API만 사용합니다.

---

## 주요 기능

### 회원
- 회원 목록 조회 / 이름 검색
- 회원 등록·수정·삭제
- 이름, 성별(남/여), 나이, 급수 관리

### 출석
- 모임(세션) 생성 (날짜, 제목, 장소)
- 모임별 출석 체크 (회원 검색 + 토글)
- 출석 인원 수 표시

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| Frontend | React Native, Expo (SDK 52), Expo Router, TypeScript, TanStack Query |
| Backend | Node.js, Express, TypeScript, `pg`, cors, dotenv |
| Database | PostgreSQL (ORM 없이 SQL 직접 작성) |

---

## 프로젝트 구조

```
badminton-club/
├── mobile/                 # Expo 앱
│   └── app/(tabs)/         # 회원 / 출석 탭
├── server/                 # Express API
│   └── src/
│       ├── index.ts        # 서버 진입점
│       ├── db.ts           # PostgreSQL Pool
│       └── routes/
│           ├── members.ts  # 회원 API
│           └── sessions.ts # 모임·출석 API
├── package.json
└── README.md
```

---

## 사전 준비

1. **Node.js** 20+
2. **PostgreSQL** (`localhost:5432`, DB: `badminton_db`)
3. DBeaver 등 DB 클라이언트 (테이블 생성용)
4. (선택) 휴대폰 **Expo Go** — SDK 52

### DB 테이블 (예시)

앱이 기대하는 주요 테이블:

- `members` — 회원 (`name`, `gender`, `age`, `grade` 등)
- `sessions` — 모임 (`session_date`, `title`, `place` …)
- `attendances` — 출석 (`session_id`, `member_id`, UNIQUE 제약)

테이블은 DBeaver에서 직접 생성·관리합니다.

---

## 실행 방법

### 1. 의존성 설치

```bash
npm run install:all
```

### 2. 서버 환경변수

```bash
cd server
cp .env.example .env   # Windows: copy .env.example .env
```

`server/.env` 예시:

```env
DATABASE_URL=postgresql://postgres:비밀번호@localhost:5432/badminton_db
PORT=3000
```

> `server/.env` / `mobile/.env` 는 Git에 올리지 마세요. (`.gitignore`에 포함됨)

### 3. API 서버 실행

```bash
npm run dev:server
```

확인:

```bash
curl http://localhost:3000/api/members
curl http://localhost:3000/api/sessions
```

### 4. 모바일 앱 실행

```bash
cd mobile
cp .env.example .env
```

실물 폰이면 PC LAN IP 사용:

```env
EXPO_PUBLIC_API_URL=http://192.168.x.x:3000
```

```bash
npm run dev:mobile
```

Expo Go로 QR 코드를 스캔하세요. PC와 폰은 같은 Wi‑Fi여야 합니다.

---

## API 요약

### 회원
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/members` | 목록 |
| POST | `/api/members` | 등록 |
| PUT | `/api/members/:id` | 수정 |
| DELETE | `/api/members/:id` | 삭제 |

### 모임·출석
| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/sessions` | 모임 목록 |
| POST | `/api/sessions` | 모임 생성 |
| GET | `/api/sessions/:id` | 모임 상세(+출석 회원) |
| POST | `/api/sessions/:id/attendances` | 출석 체크 |
| DELETE | `/api/sessions/:id/attendances/:memberId` | 출석 해제 |

---

## 학습 포인트

- Express 라우터 분리 (`routes/members.ts`, `routes/sessions.ts`)
- `pg` Pool + 매개변수화된 SQL (`$1`, `$2` …)
- 테이블 관계: `members` ↔ `attendances` ↔ `sessions`
- React Native에서 TanStack Query로 API 캐싱·갱신

---

## 라이선스

개인 학습 / 동호회 MVP 용도로 자유롭게 사용하세요.
