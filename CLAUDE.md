# CLAUDE.md

Claude Code 진입점.

**작업 규칙은 [AGENTS.md](AGENTS.md)에 있다. 먼저 읽을 것.**

이 파일은 규칙을 복제하지 않는다. 같은 규칙이 두 곳에 있으면 한쪽이 먼저 낡는다.
규칙을 고칠 일이 생기면 AGENTS.md를 고친다.

## Claude Code 전용 메모

- 세션을 시작하면 `git status`와 `git log --oneline -5`로 현재 위치를 먼저 확인한다
  (AGENTS.md 3절).
- 세 서비스가 한 저장소에 있다. 명령은 해당 디렉터리에서 돌린다 — `backend/`, `frontend/`, `ai-server/`.
- `./gradlew check`는 DB 없이 돌지만 `./gradlew dbTest`는 실제 MariaDB가 필요하다.
- 긴 작업을 여러 세션에 걸쳐 할 때만 `tasks/TASK-###.md`를 만든다.

## 아직 없는 것

Notion 06-2가 적은 Hook·Skill은 구현하지 않았다.

- SessionStart 훅(브랜치·TASK·변경 상태 안내)
- `project-resume` / `save` 스킬
- 보류 결정: PostToolUse 파일 검사, Stop 기록 강제, gc 주간 자동 실행

따라서 **자동 저장이나 종료 시 기록이 보장된다고 가정하지 않는다.** 남겨야 할 것은 직접 커밋한다.
