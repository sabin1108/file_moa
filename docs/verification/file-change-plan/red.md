# 구현 전 실패 증거

2026-10-29 `pnpm test -- apps/web/tests/local-folders/lib/file-change-plan.test.ts` exit 1.
`Cannot find module '../../../src/features/local-folders/lib/file-change-plan'`.
제품 모듈 부재로 suite 수집 실패(11개 작성 시나리오의 assertion 실행 전). 개별 assertion 11개 실패라고 해석하지 않는다.

같은 날 `pnpm test -- apps/web/tests/local-folders/store/source-plan-controller.test.ts`도 exit 1.
`Cannot find module '../../../src/features/local-folders/store/source-plan-controller'`.
9개 작성 시나리오는 controller 구현 전 수집 단계에서 실패했다.
