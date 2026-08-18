# Google Tasks MCP 서버

`README.md` 의 실습 요구사항을 구현한 MCP 서버입니다. **TypeScript + Node** 로 만들었고 **stdio** 로 동작합니다.

## 도구 4개

| 도구 | 필수 입력 | 선택 입력 | 하는 일 |
|---|---|---|---|
| `create_tasklist` | `title` | — | 새 할일 목록 생성 |
| `list_tasklists` | — | — | 내 할일 목록 전체 조회 (페이지네이션 내부 처리) |
| `add_task` | `tasklist_id`, `title` | `notes`, `due`, `parent_task_id` | 할일 추가. `parent_task_id` 를 주면 하위 할일로 생성 |
| `list_tasks` | `tasklist_id` | `due_min`, `due_max`, `show_completed`, `show_hidden`, `max_results`, `page_token` | 목록 안 할일 조회 + 필터 |

이름은 모두 25자 이내라 클라이언트가 `mcp__google-tasks__` 접두어를 붙여도 64자 제한에 걸리지 않습니다.

## 토큰 설정 — 소스에 넣지 않습니다

토큰은 **저장소 바깥 파일**에서 읽습니다. 저장소 안에 없으므로 실수로 커밋될 수 없습니다.

```bash
# 1) https://developers.google.com/oauthplayground 에서 Access token 복사
#    (Google Tasks API v1 → https://www.googleapis.com/auth/tasks 스코프)
# 2) 홈 디렉터리 파일에 붙여넣기
pbpaste > ~/.google-tasks-token
chmod 600 ~/.google-tasks-token
```

- 기본 경로: `~/.google-tasks-token`
- 경로 변경: `GOOGLE_TASKS_TOKEN_FILE` 환경변수
- 대안: `GOOGLE_TASKS_ACCESS_TOKEN` 환경변수 (이쪽이 우선)

**토큰 파일은 매 요청마다 다시 읽습니다.** OAuth Playground 토큰은 1시간이면 만료되는데, 파일만 새 토큰으로 덮어쓰면 서버나 에이전트를 재시작하지 않아도 바로 반영됩니다.

저장소 쪽에서도 `.gitignore` 로 `*.token`, `.google-tasks-token`, `.env` 를 막아 두었습니다.

## 빌드와 등록

```bash
npm install
npm run build

# 전역 등록 (어느 폴더에서 열어도 보임)
claude mcp add --scope user google-tasks -- node "$PWD/dist/index.js"
```

등록 후 **새 세션**에서 `/mcp` 로 확인하세요.

## 검증

```bash
node scripts/inspect-tools.mjs        # 도구 4개의 이름·스키마·주석 확인
node scripts/verify-request-shape.mjs # 요청 형태 검증 (토큰 불필요, 11개 체크)
node scripts/live-check.mjs           # 실제 계정 읽기 확인 (읽기 전용)
node scripts/live-e2e.mjs             # 전체 흐름 확인 ⚠️ 실제 데이터를 만듭니다
```

`live-e2e.mjs` 는 목록 생성 → 할일 추가 → **하위 할일 추가** → 조회 → 날짜 필터까지 MCP 프로토콜을 통해 전부 확인하고, 하위 할일의 `parent` 가 실제로 붙었는지 단언합니다.

## API 문서를 읽고 잡은 함정 네 가지

이 서버가 실제로 신경 쓴 부분입니다. 넷 다 **틀려도 200 이 떨어지고 결과만 조용히 달라지는** 종류입니다.

### 1. `parent` 는 본문이 아니라 쿼리 파라미터

[Task 리소스](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks) 에서 `parent` 는 **`Output only`** 입니다. 본문에 넣으면 무시되고, 그런데도 `200` 과 함께 **최상위 할일**이 만들어집니다. 하위 할일을 만들려면 [tasks.insert](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/insert) 의 **쿼리 파라미터** `parent` 를 써야 합니다.

```
POST /lists/{tasklist}/tasks?parent={부모_할일_id}
본문: { "title": ..., "notes": ..., "due": ... }   ← parent 없음
```

`scripts/verify-request-shape.mjs` 가 이걸 회귀 테스트로 고정해 둡니다.

### 2. `due` 는 시각이 버려지고 날짜만 남는다

문서 원문: *"Only date information is recorded; the time portion of the timestamp is discarded."*

그래서 `due` 로 `YYYY-MM-DD` 를 받고 **UTC 자정**으로 맞춰 보냅니다. 로컬 타임존(KST 등)으로 보내면 날짜가 하루 밀릴 수 있기 때문입니다. 이 API 로는 할일에 **시각을 지정할 수 없습니다** — 도구 설명에도 명시해서 에이전트가 시각을 약속하지 않게 했습니다.

### 3. `showCompleted` 만으로는 완료된 할일이 안 보인다

[tasks.list](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/list) 주석: *"showHidden must also be True to show tasks completed in first party clients."*

구글 할일 앱에서 완료 처리한 할일은 `hidden` 으로도 표시됩니다. 그래서 `show_completed: true` 를 주면 `show_hidden` 을 명시하지 않는 한 **자동으로 같이 켭니다.** 안 그러면 "완료한 것도 보여줘" 가 빈 결과를 냅니다.

### 4. `dueMax` 는 문서에 없는 동작을 한다 — 실제 계정으로 확인

문서는 `dueMin`/`dueMax` 를 그냥 "상한/하한 (RFC 3339)" 이라고만 합니다. 그대로 믿고 `due_max` 를 그 날의 끝(`23:59:59.999Z`)으로 보냈더니 **그 날짜의 할일이 하나도 안 잡혔습니다.** 실제 계정에 여러 값을 넣어 경계를 재봤습니다.

할일의 `due` 가 `2026-08-19T00:00:00.000Z` 일 때:

| 보낸 값 | 결과 |
|---|---|
| `dueMax=2026-08-19T00:00:00.001Z` | ❌ 안 잡힘 |
| `dueMax=2026-08-19T12:00:00.000Z` | ❌ 안 잡힘 |
| `dueMax=2026-08-19T23:59:59.999Z` | ❌ 안 잡힘 |
| `dueMax=2026-08-20T00:00:00.000Z` | ✅ 잡힘 |
| `dueMin=2026-08-19T12:00:00.000Z` | ✅ 잡힘 |

정리하면 **두 경계 모두 시각을 버리고 날짜로만 비교**하는데, `dueMin` 은 이상(inclusive)이고 **`dueMax` 는 미만(exclusive)** 입니다.

그래서 `due_max` 는 내부적으로 **하루를 더해서** 보냅니다. 덕분에 `due_min` 과 `due_max` 에 같은 날짜를 넣으면 도구 설명이 약속한 대로 그 하루가 정확히 잡힙니다. 월·연 경계(`2026-08-31` → `2026-09-01`, `2026-12-31` → `2027-01-01`)도 테스트로 고정해 뒀습니다.

이건 문서만 읽어서는 알 수 없고, **오류 없이 200 에 빈 배열이 오기 때문에** 실제로 호출해 보기 전엔 드러나지 않습니다.

## 구조

```
src/
├── index.ts               서버 초기화 + stdio 연결
├── auth.ts                토큰 해석 (환경변수 → 파일)
├── constants.ts
├── types.ts               Google Tasks 리소스 타입 (Output only 표시 포함)
├── services/
│   ├── client.ts          인증된 HTTP 클라이언트 + 상태코드별 오류 메시지
│   ├── tasksApi.ts        엔드포인트 4개 래퍼
│   ├── dates.ts           due 날짜 정규화
│   └── format.ts          마크다운/JSON 변환, 문자수 제한
└── tools/
    ├── tasklists.ts       create_tasklist, list_tasklists
    ├── tasks.ts           add_task, list_tasks
    └── result.ts
```

응답은 사람이 읽는 **마크다운 텍스트**와 기계가 읽는 **`structuredContent` JSON** 을 항상 함께 돌려줍니다. 모든 도구에 `outputSchema` 가 있어 클라이언트가 구조를 미리 알 수 있습니다.

## 오류 메시지

에이전트가 다음에 뭘 할지 알 수 있게 씁니다.

- **401** — 토큰 만료. 새 토큰 발급처와 **써 넣을 파일 경로**를 그대로 알려줍니다.
- **404** — `list_tasklists` 를 먼저 부르라고 안내합니다.
- **400** — 날짜 형식, 또는 다른 목록의 `parent_task_id` 를 의심하라고 알려줍니다.
- **403** — `tasks` 스코프 누락 가능성을 짚어줍니다.

## 정리

```bash
claude mcp remove google-tasks -s user
rm ~/.google-tasks-token
```

토큰 자체는 <https://myaccount.google.com/permissions> 에서 "Google OAuth2 Playground" 접근 권한을 삭제해야 완전히 폐기됩니다.
