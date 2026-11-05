# 구현 전 실패 — 2026-10-29

`pnpm test -- apps/web/tests/local-folders/store/source-search.test.ts` exit1.
`Cannot find module '../../../src/features/local-folders/lib/file-name-search'`.
11개 core 사례를 작성한 뒤 순수 필터/상태 구현 전에 실행했다. 모듈 부재로 suite 수집 실패이며 assertion11개를 실행해 실패했다는 뜻은 아니다.
