# 조용한 서재 첫 화면 검증

2026-11-14. 사용자는 기존 첫 화면의 차가운 폴더 그림과 양옆의 빈 공간을 지적했고, 후속 선택에서 **책장과 노트가 있는 조용한 서재 느낌**을 지정했다. 공개 소개 `/start`와 체험 소개 `/demo/intro`가 같은 화면을 공유한다.

## 변경과 읽는 순서

1. `features/onboarding/OnboardingPage.tsx`: 실제 HTML 제목과 링크 뒤에 반응형 `picture`를 배치한다. Next.js `getImageProps`로 화면 폭별 최적화 URL을 생성하고 900px 이하에서는 세로 구도를 선택한다. 기존 로그인·가입·체험 목적지는 유지한다.
2. `onboarding.module.css`: 종이색, 나무색, 차분한 초록의 그림과 맞춘 토큰, 제목 크기와 여백, 버튼 아래 스크롤 안내를 적용한다. 태블릿에서 식물이 제목과 겹쳐 제목과 설명을 위쪽 빈 벽 안으로 모았다.
3. `onboarding-motion.module.css`: 서재에서 시작해 기존 자료 모으기와 작업 공간 장면으로 이어진다. 동작 줄이기 설정에서는 정적 서재를 보여 준다. 기존 기능 설명의 상태와 조작은 유지한다.
4. `ProductScenes.tsx`: 실제 예시 자료 선택 UI의 루트를 `data-ui`로 표시한다. 새 기능이나 범용 계층, 패키지는 추가하지 않았다.

기준 커밋은 `5d1db29`다. 인증, API, 파일 쓰기, 미리보기 이동 구조와 메일 발신 설정은 변경 대상이 아니다.

## 그림 출처와 생성 요청

두 그림은 이 작업에서 내장 ImageGen으로 새로 생성한 배경이다. 외부 사진이나 영상은 사용하지 않았다. 생성 그림을 실제 사용자 자료나 실제 공간의 사진으로 설명하지 않는다. 본문과 버튼, 로고는 그림에 포함하지 않고 실제 UI로 표시한다. 장식 이미지의 alt는 빈 문자열이다.

| 저장소 자산 | 실제 크기 | PNG 원본 크기 | 로컬 WebP 응답 |
| --- | --- | --- | --- |
| `apps/web/public/onboarding/reading-room-desktop-v1.png` | 1774×887 | 2,525,261bytes | 1920px 요청:93,096bytes |
| `apps/web/public/onboarding/reading-room-mobile-v1.png` | 863×1823 | 2,218,540bytes | 640px 요청:32,052bytes |

WebP 수치는 로컬 production 서버에서 `Accept: image/webp`, quality75로 받은 응답 본문 크기다. 실제 선택 URL과 응답 형식은 화면 폭·DPR·브라우저 캐시에 따라 달라진다. 최초 로딩 속도 개선율이나 운영 LCP/INP 수치로 해석하지 않는다. 래스터 배경의 추가 전송 비용이 생긴다.

재생성에 필요한 요청 내용:

- 데스크톱: 포근한 손그림 gouache 질감의 조용한 개인 서재. 양옆의 밝은 나무 책장, 낮은 채도의 초록·크림색 책과 식물, 왼쪽의 편안한 의자와 담요. 아래 나무 탁자 위 열린 노트, 연필과 머그잔. 가운데 위쪽 벽은 실제 웹 제목과 버튼을 놓을 수 있게 비운다. 따뜻한 자연광. 와이드 구도. 글자·로고·화면 UI·검은 외곽선·복잡한 소품은 제외한다.
- 모바일: 같은 서재의 세로 동반 그림. 위쪽 약60%는 차분한 빈 벽, 아래쪽 양옆은 좁은 책장, 맨 아래 탁자와 열린 노트. 모바일 제목과 버튼이 식물이나 책에 가려지지 않게 한다. 같은 종이 질감·나무색·차분한 초록. 글자·로고·화면 UI는 제외한다.

원본 생성 결과는 이 기기의 `.codex/generated_images/01a1d7e7-f35c-7dc1-b64a-0059200b83a1/`에 있으며, 서비스는 저장소에 복사한 자산을 사용한다. 참고 API: [Next.js Image art direction](https://nextjs.org/docs/app/api-reference/components/image#art-direction). 설치 버전16.4.3의 실제 타입과 빌드를 확인했다.

## 현재 실행한 검증

- 관련 Vitest:2파일7개 통과. `pnpm typecheck`, web lint, `pnpm build` 통과. 빌드22경로 생성. `git diff --check` 통과.
- Ego 실제 Chromium:1440×900,1920×1000,768×1024,390×844. 제목2줄, 가로 넘침 없음, 그림별 URL 전환, 시작 링크 `/welcome` 유지. 최종 스크린샷4개를 직접 확인했다.
- 스크롤 시작/중간/작업 공간 펼침과 reduced-motion 정적 화면의 스크린샷을 확인했다. 서재 opacity1→0, 기존 폴더/작업 공간 전환이 이어진다.
- 체험 소개의 같은 그림과 `/demo/start?intro=done` 링크, 클릭 뒤 `/demo` 도착을 확인했다. 아래 예시 자료에서 참고 자료를 선택하면 `리서치 노트.pdf`의 내용만 표시된다. 첫 자동화 대기는 중간 redirect 경로를 기다려 실패했으며 실제 최종 경로와 구분했다.
- 디자인 소스 lint:0 FAIL,2 WARN. 기존 종이/작업 공간 틀의1px 테두리는 문서의 경계를 표시하는 역할이라 유지한다.

`inspect.mjs`의 독립 Chrome 연결은 `CDP timeout: Page.enable`로 실행되지 않았다. 통과로 기록하지 않는다. 대신 같은 스킬의 `probe/frame/layout`와 `judge/judgeLayout`을 Ego에서 직접 실행해1440/768/390에서0 FAIL을 확인했다. 이 검사는 독립 inspector의 영상 촬영·전체 장면 자동 순회 검증을 대신한 결과로 주장하지 않는다.

남은 WARN: 종이색 배경은 사용자가 선택한 분위기를 따른다. 기존 아래쪽 설명에는 여러 글자 크기와 작은 예시 캡션이 남아 있다. 기존 문서 프레임의 선과 스크롤 변형을 포함한 전체 여백 차이도 감지됐다. 실제 사진·영상 대신 요청한 서재 일러스트와 제품 예시를 사용했다. 이번 첫 화면 수정에서 아래쪽 전체 화면까지 재설계하지 않았다.

## 화면 비평

ROUND 1

Seen in one second: 책장이 양옆을 감싸고 중앙에 모아의 자료 안내가 보인다.

Idea (one sentence): 흩어진 자료를 다시 펼쳐 읽는 작업 공간을 조용한 서재와 열린 노트로 표현한다.

Live thing: 실제 예시 자료 선택과 기존 스크롤 자료 모으기·작업 공간 전환.

Layout words by section: hero=서재 전면 / 찾기=폴더 속 설명 / 자료=분할 선택 UI / 정리=과정 / 기록=분할 / 시작=문장.

Scores: design6.0 · usability6.0 · creativity7.0 · content8.0 → overall6.4

Caps applied: 태블릿 제목 겹침으로 usability6 이하. 사진4개 미만으로 design6.5 이하. 서재 자체는 일반적인 비유여서 creativity7 이하.

Top three problems (most visible first), each with the screenshot it shows in and the fix:

1. `reading-room-768.png`: 식물이 제목 끝을 침범했다. 태블릿 제목·설명을 위쪽으로 모았다.
2. 기존 사용자 스크린샷: 안내가 폴더 그림 아래와 겹쳤다. 시작 버튼 아래 같은 문구 영역으로 옮겼다.
3. 기존 사용자 스크린샷: 그림 주변의 빈 양옆이 컸다. 화면별 서재 구도로 양옆의 책장을 자연스럽게 이어 배치했다.

ROUND 2

Seen in one second: 열린 노트가 놓인 포근한 서재와 분명한 시작 버튼.

Idea (one sentence): 자료를 꺼내 읽고 생각을 이어 가는 자리를 책장과 노트로 보여 준다.

Live thing: 기존 자료 선택과 단계별 제품 설명, 실제 시작 링크.

Layout words by section: 위와 같으며 기존 설명의 구조를 유지한다.

Scores: design6.5 · usability8.0 · creativity7.0 · content8.0 → overall7.2

Caps applied: 사진4개 미만인 일러스트 중심 구성으로 design6.5 이하. 경쟁 제품에도 가능한 서재 비유이므로 creativity7 이하. 자체 화면 비평이며 사용자 만족도나 외부 평가가 아니다.

Top three problems (most visible first), each with the screenshot it shows in and the fix:

1. `reading-room-scroll-0.4.png`: 중간 전환은 기존 중앙 폴더 구도다. 이번에는 첫 진입을 고치고 기존 기능 설명 전환을 보존했다. 전환 전체 재설계는 후속 범위다.
2. `reading-room-final-390.png`: 제품의 세부 조작은 첫 화면 다음 설명에서 보인다. 첫 화면에 설정·카드를 더 쌓지 않고 명확한 자료 안내와 시작 동작을 유지했다.
3. 전체 probe의 작은 예시 캡션·여러 글자 크기 경고는 하단 기존 장면에 남는다. 전면 개편 완료로 보고하지 않는다.

화면 근거는 `.taste-skill/reading-room-final-{1440,1920,768,390}.png`, `reading-room-scroll-{0,0.4,0.85}.png`, `reading-room-reduced.png`, `reading-room-final-probe.json`에 로컬로 보관한다. `.taste-skill`은 Git 제외 경로다.

실제 개인 폴더·새 메일·유료 AI·새 계정 작업은 수행하지 않았다. 보류된 메일 도메인과 미리보기 이동 구조를 이번 검증으로 해결했다고 주장하지 않는다.
