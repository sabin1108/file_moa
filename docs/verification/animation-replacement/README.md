# 제공 로딩·인증 애니메이션 교체 — 2026-11-09

요구206. 사용자 원본은 `C:/Users/sabin/Desktop/animation`의 `loding/FolderVortexLoading.*`, `로그인 애니메이션_최종본/PaperSignupStepper.*`다. 원본 파일·압축 파일은 수정하지 않았다. [범위와 교체 계획](../../planning/animation-replacement.md).

## 바뀐 동작

- 종이10장의 회오리/흡수/흔들림과 폴더 동작을 `MoaLoader`의 실제 구현으로 교체했다. 기본 주기는3600ms, 고리는9초/14초다. 기존 로고 SVG의 선 애니메이션과 관련 import/CSS/keyframe은 제거했다.
- `PageLoading`·`StatusNotice`·인증/소셜 대기·내비게이션·기존 소비 중인 시안이 같은 로더를 사용한다. 전체 페이지는256px, 작은 대기는96px, 안내 안 장식은64px 기본 크기로 원본 좌표계를 축소한다. 기존 `PageLoading` API와 status/live/busy 문구, 이동 알림의 비차단 우측 하단 위치를 유지한다. portal에는 사이트 읽기 면 색 문맥도 적용했다.
- 인증의 이전 단계 표시를 공통 `PaperStepper`로 대체했다. 원본의 종이 접기/폴더 넣기3000ms, 뒤로 꺼내 펴기1100ms, sheet 등장·뚜껑·도착 타이밍을 사용한다. 실제 단계가 바뀔 때만 재생하고 입력은 기다리지 않는다.
- 사이트의 text/muted/surface/active/border/success 토큰에 색을 연결했다. 모아 로고·서체·인증 바탕·버튼과 입력 크기는 유지한다. 실제 입력창을 축소하거나 이메일/비밀번호를 장식 종이에 복제하지 않으며 종이에는 단계 이름만 표시한다.
- 기존 가입 필드의 별도 펼침 애니메이션은 제거했다. 인증은 새 공통 표시를 쓰고, 실제 소비 중인 파일·복구용 `WorkflowStepper`/`WorkflowTransition`은 유지한다. 이전 표시를 숨긴 채 인증 화면에 함께 렌더링하지 않는다.

타이머/미디어 구독/ResizeObserver는 이탈 때 해제한다. 비행마다 고유 ID를 검사해 빠른 왕복에서도 늦은 종료가 새 비행을 지우지 않는다. reduced motion을 도중에 켜도 비행/타이머를 지우고 실제 단계는 즉시 표시한다. 로딩은 정적인 종이/폴더를 표시하고 막대도 멈춘다. 백분율·가짜 완료·최소 대기 시간을 추가하지 않았다.

## 읽을 파일

1. `components/ui/feedback/MoaLoader.tsx`, `moa-loader.module.css`: 원본 회오리의 단일 구현, 부모가 접근 가능한 상태 문구를 소유한다.
2. `PageLoading.tsx`, `page-loading.module.css`, `LoadingOverlay.tsx`, `status-notice.module.css`: 기존 호출과 표시 책임 유지, 새 크기/막대/portal 색 문맥, 구형 로더 CSS 제거.
3. `components/ui/PaperStepper.tsx`, `use-paper-stepper-motion.ts`, `paper-stepper.module.css`: 단계 표시와 장식 종이/접기, 모션 수명 분리. 입력/URL/서버 상태는 소유하지 않는다.
4. `features/auth/components/AuthScreen.tsx`, `SignupScreen.tsx`, `auth-shell.module.css`: 인증 소비처 대체와 구형 펼침 제거. 기존 `useSignupFlow`/실제 form/Server Action/IME/초점/초안 보안은 유지한다.

## 확인 결과

- 147파일 **1296개 테스트**·타입·린트(경고0)·최종 production 빌드 `QtvGPEbLNkupxaVlguVdw` 통과. 서버 경계26/구조25+6+3 통과.
- 새 SSR 검사3개: 로딩의 장식 종이10장·상태 한 번 알림·가짜 백분율 없음, 단계 이름/aria-current와 폼·입력·URL 소유권 분리, 빈/잘못된 단계 처리. 추가 전 실패와 구현 후 통과를 확인했다.
- [브라우저30개](browser/checks.json): 실제 제품 UI/가입 hook/로더·격리 Chromium·합성 action/라우팅. 유효/잘못된 이메일·IME·즉시 다음 입력·전진/복귀/빠른 왕복·URL뒤로/앞으로/새로고침·비밀번호 미복제·타이머 이탈·모션 감소·390/768/1440/1920px·pending 종료·portal 확인. 실제 계정/API/메일/모델 요청 없음.
- 포함한 회오리6개와 종이/꺼내기 키프레임을 사용자 원본과 공백 정규화 후 **정확 비교**했다. 원본의 미사용 reverse 옵션/데모 가입 완료/별도 라우터·입력 검증기는 복제하지 않았다. 이 비교 스크립트는 사용자 원본이 있는 로컬에서 실행하며 기본 단위 검사/CI에는 연결하지 않았다.
- [앱 검사](browser/taste.json) FAIL0. 390/768/1440/1920 화면과 접힘 중간 프레임을 직접 확인했다. 기존 승인 팔레트·레이아웃을 유지하는 교체라 새 taste 추첨/사이트 개편은 하지 않았다. 장식 그림의 겹침/종이 줄용 선형 gradient/그림자는 제공 파일의 물체 표현이다.
- [실제 production 설정/이동26개](production/settings-loading-checks.json): 실제 Next Link의 로컬 RSC 응답을 보류해 이전 화면 유지·96px 새 로더·우측 하단 알림·비차단·완료 뒤 제거 확인. 화면/조작 설정12개 표본도 기록. 합성 demo이며 실제 로그인이나 계정 변경은 아니다.
- 기존 자료 찾기 브라우저55개도 통과했다. 공통 `StatusNotice`의 로더 변경으로 검색 패널/네 너비가 깨지지 않는지 확인했다.
- 독립 읽기 검토에서 수명/ARIA/보호된 입력/현재 소비처 교체에 차단점 없음. 제거된 DOM을 찾던 인증 검사와 오래된 문서·주석도 현재 표시 계약으로 갱신했다. 최종 재검토 CLEAR.
- [실제 Next·임시 PostgreSQL 인증169개](auth-browser/checks.json): strict TLS·별도 production 빌드 복사·합성 계정·로컬 메일 캡처로 가입→확인→첫 로그인/이름→작업 공간, 중복/잘못된 입력, 토큰/비밀번호 미보관, 로그아웃/재설정/기존 두 계정 연결·원래 폴더 보존까지 통과했다. DB계약25+런타임60도 통과. 해당 빌드는 `hm3T_vcz95qFMvz7l_Jje`이며 이후 변경은 장식 종이 글자의 작은 화면 가독성 CSS 보완이다. 최종 CSS는 새 브라우저30·타입/린트/전체/빌드·production 이동 검사를 다시 확인했다.

검사 도구의 문제도 수정했다. 제거된 `revealedField`나 예전 상단 알림 위치를 찾지 않고 현재 표시를 검사한다. production 복사에서 개발용 `.next/dev`를 제외해 Windows symlink 오류를 피하며, 설정 검사는 스트리밍 준비가 끝난 **보이는 패널**과 h1을 기다려 실제 크기를 검사한다. 처음 실패를 제품 overflow나 인증 실패로 확정하지 않았다. 이전 실패 캡처는 최종 성공과 구분해 이름을 바꿔 보존한다.

## 성능과 실제 환경 한계

[6개 경로·각3회와 자산](performance/routes-assets.json): 로컬 production Chromium1440px, 보호 경로는 게스트 로그인 리다이렉트, demo는 실제 샘플 화면. 경로/history9검사 통과. JS/CSS49파일 **3,598,694 bytes**, 직전1~5 빌드3,568,324 대비 **+30,370 bytes**다. 전체 빌드 자산 총량이며 최초 페이지 다운로드 증가·인증된 화면 속도·사이트 전체 성능 점수로 해석하지 않는다. 새 의존성 패키지 추가 없이 제공 CSS 모션과 재사용 클라이언트 표시가 추가된 비용이다.

[인증된 합성 계정36개 표본](auth-browser/performance-authenticated.json)은 별도다. 빌드 `hm3T_vcz95qFMvz7l_Jje`, Windows·격리 Chromium·로컬 임시 DB/TLS·빈 OPFS·캐시 끔·CPU/네트워크 제한 없음,2폭/각경로3회/350ms관측. 요청한 경로와 작업 공간이 표시됐고 차단용 세션 안내가 남지 않았다. 관측 CLS 최대0.04273이며 0으로 보고하지 않는다. 동일 조건 변경 전 표본이 없어 개선율을 산출하지 않았고 운영 DB/실제 자료/현장 INP/전체 사이트 p75/장기 GPU·메모리 증거는 아니다.

로딩의 표현을 교체한 것이며 서버·DB·모델 대기 시간이 줄었다고 주장하지 않는다. 실제 외부 OAuth/운영 이메일/실사용 IME·GPU·현장 INP/장기 메모리는 이번 검증이 아니다. 이동·입력은 애니메이션이 끝날 때까지 강제 대기하지 않는다.

## 추가 마감 결과

임시 DB 인증 전체 검사는 종료 코드0과169개 통과를 확인했다. QA3035는 종료했고 dev3034를 owned exec session98906으로 복구했다. URL `http://127.0.0.1:3034`. 로컬 로그인 안정성 결과는 [dev-login.json](dev-login.json)을 따른다. dev 실행 중 typecheck/build/Prisma generate를 병행하지 않는다. 개발 로그 원문에는 OAuth 정보가 있을 수 있어 출력하지 않는다.

개인 원본/계정/운영 DB/사용량·메일 발송·유료 모델·새 패키지·commit/push/deploy는 이번 작업에서 변경하거나 실행하지 않았다. 공유 파일 작업 Stepper는 실제 사용 중인 코드이므로 유지했으며 인증에 이전 로더·펼침 모션·단계 표시를 중복 렌더링하지 않는다.
