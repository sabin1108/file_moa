# 작업 화면 UI 계약

적용: 정적 상태 시안과 설정. 실제 제품 기능 구현 시에도 표시/상태/외부 접근의 책임을 유지한다. 승인된 채팅·메인 폴더 보드에는 이 토큰을 일괄 덮어쓰지 않는다.

## 크기와 간격
| 대상 | 기준 | 소유 파일 |
| --- | --- | --- |
| 간격 | 4, 8, 12, 16, 24, 32px | components/workspace-ui.module.css |
| 작업 면 | 720 / 880 / 960px, 내용에 따라 높이 결정 | SceneSurface / workspace-ui |
| 제목 / 섹션 / 본문 | 22 / 16 / 14px | workspace-ui |
| 메타 / 작은 설명 | 13 / 12px, 실제 파일 상태는 14px | scene-layout |
| 장문 원문 | 16px, 행간 1.85 | scene-layout |
| 버튼·입력 | 데스크톱 최소 40px, 모바일 최소 44px | workspace-ui / controls / demo |
| 두 줄 문서 행 | 최소 64px, 긴 내용은 확장 | FileSelection / scene-layout |
| 패널 / 조작 모서리 | 8 / 6px | workspace-ui |
| 기본 패딩 | 작업 면 24px, 내부 묶음 16px, 모바일 면 16px | workspace-ui / scene-layout |

## 책임과 입력
- `SceneSurface`: scene/documentName/navigate/dismiss와 선택 headingId. header/body/footer만 조합. headingId가 있으면 dialog용 h2, 없으면 페이지 h1.
- `ScenePreview`: 독립 경로의 화면 전환과 공통 앱 탐색.
- `PrototypeDialog`: portal·showModal·Escape·바깥 클릭·Tab/Shift+Tab 순환·닫기 후 초점 복귀·재진입 초기화.
- `FileSelection`: 읽기 전용 `files: { name, topic, size }[]`와 선택 `status(index)`. fixture/외부 접근 없음.
- `FolderRoute`: `from/to: { root, name }`, `copy`. 경로 표시만 담당.
- `SettingRow`: 제목/설명/입력 children의 정렬. 값과 저장 여부는 설정 화면이 소유.
- `DemoButton/ActionLink`: 기존 공통 action 스타일, 새 화면에서는 CSS 변수로 조작 크기 변경. 변수 없는 기존 화면은 기존 기본값 유지.

실제 기능 연결 시 domain 결과를 이 입력 구조로 매핑하고, 비동기 상태/권한/파일 접근은 별도 소유자가 처리한다. 이 문서는 현재 시안에 실제 API가 구현됐다는 의미가 아니다.

## 재사용 경계

경고 표시: `RiskNotice`는 label/title/설명과 attention/danger 의미를 받는다. `ImpactComparison`은 affected/preserved의 제목과 항목을 받는다. 둘 다 외부 접근이나 상태 전이를 수행하지 않는다. 경고 색은 workspace-ui의 warning/danger 토큰으로 관리하며 아이콘·범위 문구가 색을 보완한다.

같은 조작과 같은 데이터 표현을 재사용한다. 문서 읽기, 충돌 판단, 계정 삭제를 단일 만능 화면으로 합치지 않는다. 샘플 전환 코드와 실제 작업 실행 코드를 동일시하지 않는다.
