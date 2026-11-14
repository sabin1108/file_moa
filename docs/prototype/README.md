# 최종 프로토타입

2026-11-12: 사용하지 않는 시안 실행 경로 `/preview`와 `apps/web/src/prototypes`를 제거했다. 아래 경로·소스 설명·화면 캡처는 당시 디자인 결정 기록이며 현재 실행 안내가 아니다. 체험용 `/demo/intro`와 실제 파일 미리보기는 유지한다. 공통 표시는 [shared](../../apps/web/src/shared/README.md)에 있다.


2026-10-27 실제 기능 후속: 실제 폴더 연결은 이제 `/settings`와 `/files`에서 공유한다. 아래 26일 ‘설정에만 있다’는 기록은 당시 상태다. 시안의 폴더 연결은 계속 합성 입력이며 실제 저장소에 접근하지 않는다.

2026-10-27: 문서 상세의 파일 정보는 기본 접힘으로 변경했다. `/preview/document`와 `/preview/screens/files`의 문서 팝업에 함께 적용했다. 아래 25일 문서 캡처보다 [최신 접힘/펼침 화면과 확인 기록](../verification/document-info-preview/README.md)을 우선한다.

2026-10-26: 실제 작업 경로에서 합성 예시를 분리했다. 보관한 전체 화면은 `/preview/screens/chat`, `/preview/screens/files`, `/preview/screens/settings`, `/preview/screens/login`, `/preview/screens/welcome`에서 연다. `/preview`가 목록이며 모든 시안에 합성 데이터 안내가 있다. 실제 폴더 연결은 `/settings`에만 있다. 아래 기존 캡처는 승인된 디자인 기록이며 현재 제품 기능의 증거가 아니다. [분리 기준과 확인 방법](../specs/live-workspace.md).

2026-10-25 사용자 승인 기준. 실제 구현은 `apps/web/src/features/prototype`에 있으며, 이 폴더는 현재 화면과 재사용 계약만 보관한다. 화면의 파일·대화·작업 결과는 합성 예시다.

## 대표 화면

| 화면 | 데스크톱 | 좁은 화면 |
| --- | --- | --- |
| 대화 | [1440](final/chat-1440.png) | [390](final/chat-390.png) |
| 파일 관리 | [1440](final/files-1440.png) | [390](final/files-390.png) |
| 로그인 | [1440](final/login-1440.png) | [390](final/login-390.png) |
| 첫 가입 | [1440](final/welcome-1440.png) | [390](final/welcome-390.png) |
| 설정 | [1440](final/settings-1440.png) | [390](final/settings-390.png) |
| 전체 시안 목록 | [1440](final/preview-1440.png) | [390](final/preview-390.png) |

27개 상태 시안은 `final/preview-<scene>-1440.png`와 `-390.png`로 보관한다. 대화·파일·설정은 768/1920px도 포함한다. 총 72개 production 화면 캡처이며 [경로·크기·관찰 결과](final/observations.json)가 정확한 목록이다. 기본 화면 캡처이며 모든 상호작용 조합의 새 검증은 아니다.

## 현재 계약

- [작업 화면 UI 계약](workspace-ui-contract.md)
- [로딩·전환·작업 피드백 계약](feedback-component-contract.md)
- [디자인 기준](../../DESIGN.md), [사용자 팔레트](palette.png)
- [화면별 상태 목록](../planning/screen-inventory.md)
- [과거 자료 보관 위치](ARCHIVE.md)

기술 기능 검증은 [S0 기록](../verification/s0/README.md)에서 별도로 관리한다.

2026-10-26 추가: `/preview/folder-connection`은 폴더 표시 컴포넌트 검토용 화면이다. 위 27개 승인 시안 캡처와 별도로 [확인 순서·코드 해설·검증 결과](../specs/source-folder-connection.md#5-이번-단위를-직접-확인하기--2026-10-26)를 관리한다. 이름과 상태는 합성 입력이며 버튼은 호출 기록만 바꾼다.
