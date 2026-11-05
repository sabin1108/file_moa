# 스킬 구성
프로젝트 로컬 .agents/skills에 설치되어 이 저장소 작업에 사용한다. 기존 전역 스킬은 수정하지 않는다.

| 스킬 | 사용 시점 |
| --- | --- |
| design-taste-frontend | UI 시각 설계·리뷰. 앱은 references/app-screens.md 경로 사용 |
| personal-ai-ui | 채팅 상태 보존, 접근성, 한국어 IME, 웹 성능 |
| personal-ai-files | 로컬 파일 접근·선택 전송·변경 감지·색인 경계 |
| personal-ai-api | 세션·사용자 격리·스트림·작업·비용·삭제 |

기존 design, code-review, skill-creator, skill-installer 등은 중복 설치하지 않고 해당 작업에 재사용한다.
taste upstream: https://github.com/Leonxlnx/taste-skill (사용자 입력 loonxlnx는 주소 확인 후 수정).
설치 명령: npx --yes skills add Leonxlnx/taste-skill --skill design-taste-frontend --agent codex --yes.
skills-lock.json은 설치 출처와 content hash 기록이다. 제3자 스킬의 권고가 제품 요구사항/접근성/데이터 경계를 덮어쓰지 않는다.
설치 도구의 자동 위험 표시는 Safe / Socket 1 alert / Snyk Med Risk였으며 상세 원인은 여기서 확인되지 않았다.
이번 설정에서 upstream 스크립트 실행은 하지 않았다. 디자인 작업 시 실행 대상 스크립트와 네트워크/브라우저 동작을 읽고 사용한다.


## 추가 디자인 스타일
2026-10-23 사용자 'AI 티' 피드백에 따라 minimalist-ui를 선택 설치했다.
출처: https://github.com/Leonxlnx/taste-skill-classics, 경로 .agents/skills/minimalist-ui/SKILL.md.
설치: npx --yes skills add Leonxlnx/taste-skill-classics --skill minimalist-ui --agent codex --yes.
문서/편집 도구에 가까운 위계·작은 모서리·평면 구조에 사용. 이 클래식 스킬의 선택 호출 설정은 유지한다.
기존 taste의 앱 화면 검사로 검증하며 두 스킬의 모든 지시를 무조건 혼합하지 않는다. 팔레트와 상호작용 범위는 사용자 요구 우선.
다른 공식 선택지 high-end-visual-design(부드러운 여백·모션), industrial-brutalist-ui(강한 그리드·기계적 표현)는 이번에 설치하지 않았다.
