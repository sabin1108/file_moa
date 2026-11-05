# 구현 전 실패 — 2026-10-29

`pnpm test -- apps/web/tests/local-folders/store/destination-picker.test.ts`에서8개 사례 모두 실패했다. 실제 기존 plan/listing controller를 준비한 뒤 `plan.browseDestination is not a function`을 확인했다. 아직 없는 기능 때문에 실패했으며 최종 구현 이후 기존 계획9개와 신규8개가 함께 통과했다.
