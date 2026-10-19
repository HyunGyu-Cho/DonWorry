# 0002. Frontend TypeScript를 5.9로 고정

- **상태:** 채택
- **날짜:** 2026-10-20
- **관련:** Notion 02-2, 06-1, 06-3

## 배경

`npm create vite@latest -- --template react-ts`가 만든 기본값은 TypeScript 7(Go로 다시 쓴
`tsgo`)과 린터로 oxlint였다.

Notion 06-1은 린터를 ESLint로, 검사 항목을 "코드 품질·React Hooks"로 명시한다.
06-3의 필수 CI도 ESLint를 이름으로 적는다. 그래서 ESLint + `typescript-eslint`를 설치했으나
`npm install`이 거부했다 — `typescript-eslint@8`의 peer 범위가 `typescript >=4.8.4 <6.1.0`이다.

TypeScript 7은 2026-10 기준 린터 생태계가 아직 따라오지 않았다.

## 결정

TypeScript를 `~5.9.0`으로 고정하고 ESLint 9 + `typescript-eslint` 8 + Prettier 3을 쓴다.
`typecheck` 스크립트는 `tsc -b`다.

## 고려한 대안

| 대안 | 버린 이유 |
| --- | --- |
| TypeScript 7 + oxlint | 06-1·06-3이 ESLint를 이름으로 요구한다. 바꾸려면 두 문서를 함께 고쳐야 하는데, 시연이 3일 뒤라 문서 변경보다 도구를 맞추는 쪽이 싸다 |
| TypeScript 7 + ESLint (typescript-eslint 없이) | 타입을 아는 규칙이 빠져 `any` 제한 같은 06-1 항목을 강제할 수 없다 |
| `--legacy-peer-deps`로 강제 설치 | peer 범위를 무시한 조합이라 린터가 엉뚱한 곳에서 깨질 수 있다. 팀 6명이 쓰는 저장소에서 감당할 위험이 아니다 |

## 영향

- **API:** 없음.
- **DB:** 없음.
- **화면:** 없음. 작성한 코드는 두 버전에서 모두 유효하다.
- **테스트:** CI `frontend` 잡이 `lint` / `typecheck` / `format:check` / `build`를 돌린다.
- **문서:** README 기술 스택 표에 이유를 적었다.

## 되돌릴 조건

`typescript-eslint`가 TypeScript 7을 지원하면 TypeScript를 올리고 이 ADR을 대체한다.
그때까지는 oxlint로 바꾸는 선택도 가능하지만, 그러려면 06-1·06-3을 함께 고쳐야 한다.

## 검증

`npm run lint` / `typecheck` / `format:check` / `build` 모두 통과.
GitHub Actions `frontend` 잡 통과.
