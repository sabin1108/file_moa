# 가입 후 표시 이름과 홈 이동 깜빡임 수정 — 2026-11-06

이메일 가입은 이메일→비밀번호·확인→인증메일→직접 로그인→표시 이름 한 칸→작업 공간 순서다. 기존 이름이 있는 계정과 소셜 공급자 이름은 보존한다. 기존 Stepper와 입력/로딩 컴포넌트를 재사용하고 가입 단계 URL·이메일 초안·Tab/IME·뒤로가기·비밀번호 비보관을 유지한다. 이전 name 단계/초안도 이메일로 정규화한다.

이름 없는 상태는 기존 String 컬럼의 빈 문자열로 표현하며 새 테이블/컬럼/마이그레이션은 없다. 이름 저장은 검증된 현재 세션·정식 Origin·1~40자 검증·분당10회 제한을 거쳐 SDK가 본인에게만 적용한다. 요청의 userId/emailVerified/image 등 추가 필드는 거부한다. 이름을 이메일에서 유추하지 않고 원래 workspace/로컬 owner는 변경하지 않는다. 저장 실패 시 입력도 유지한다.

## 검은 화면 원인과 수정

기존 문서 CSS는 body=#06141b/color-scheme=dark였고, AuthShell/로딩 면이 렌더된 뒤에만 밝아졌다. 실제 RootLayout·CSS에서 화면을 비운 재현에서 그 검은 바탕을 확인했다. 현재는 초기 HTML의 html 배경/스킴과 CSS의 html/body를#e4e8e6/light로 맞춰 스타일시트 전에도 밝은 바탕을 보장한다. [전후 canvas](canvas/results.json)는 화면이 교체되는 빈 간극 재현이며 모든 실제 리다이렉트 프레임 녹화는 아니다.

사용자가 지목한 비로그인 홈 링크는 보호된 /를 거쳐/login으로 돌아가던 왕복을 없애 로그인에 직접 연결했다. / 직접 접근은 기존 서버 가드가 계속 차단한다. 유효한 화면의 배경 세션 재검증과 공통 로딩은 유지했으며 전역 root loading 경계를 추가하지 않았다.

## 검증

- 실패 회귀7개를 먼저 확인한 뒤 구현했다. 최종 단위698개/74파일 통과.
- 타입·린트·production build·서버 경계21개·기능 구조 검사 통과.
- 일회용 PostgreSQL 상위25개/실제SDK·SQL 통합50개 통과. 빈 이름 가입·메일 인증·HttpOnly 로그인·인증 후 이름 저장·타인 변경/위조 세션/외부 Origin/추가 필드 거부를 검증했다.
- 최종 브라우저168개 통과. production build=qju5BuUWLefjgmPJtvZO2. 합성 메일/격리Chromium/검증TLS의 일회용DB를 사용했다. 가입·복원·초점/IME·실패 입력 보존·원래 폴더/계정 연결·배경 확인을 포함한다.
- 390/768/1440/1920px의 인증8경로에서32개 초기 canvas 검사와 실제 차단 로딩의 밝은 배경을 확인했다. 브라우저 오류0, 설정 앱 검사9개 FAIL0. 스크린샷과 [원자료](browser/checks.json), [초기 canvas 샘플](browser/canvas-checks.json), [36개 성능 표본](performance.md)을 남겼다.

초기 브라우저 실행에서는 새 DOM/초점 effect 완료 전에 검사하던 타이밍 실패가 있었고, 실제 완료 상태를 기다리도록 검사기를 수정했다. 최종 결과와 실패 실행을 구분한다. 실제 외부 공급자 로그인/사용자 기기의 GPU·확장 프로그램·물리 IME/OS 권한은 이번에 검증하지 않았다. 실제 운영 계정·메일·개인 폴더는 변경하지 않았다.

읽기: 최신 DESIGN/인증 접근 명세 → signup-flow/useSignupFlow/SignupScreen → auth-forms/auth-handler/profileAction/account/가드 → RootLayout/globals/AuthShell → 이 검증 기록. 새 의존성·일회용 표시 컴포넌트를 추가하지 않았다.
