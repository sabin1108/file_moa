# 보관함 목록·상세와 권한 안내 검증 — 2026-11-04

파일 화면/연결 설정의 `복구 보관함 보기`로 실제 보관 기록을 읽는다. 파일명·원래 상대 위치·보관 시각·용량·기록 상태를 표시하고 선택한 사본만 다시 검사한다. 목록의 성공 JSON은 현재 정상 판정이 아니다. 실제 payload size/hash와 양쪽 백업 기록이 맞을 때만 정상이다. 복원/삭제/보존 기간 설정은 후속이다. [명세](../../specs/recovery-archive.md).

## 실행 근거

- 최종 `pnpm check`:481테스트/47파일·타입/lint 경고0·서버/구조 경계·43페이지 build. 기존458에서 service18/controller4/session1의23개를 추가했다. API 부재 RED→구현 GREEN을 서비스/session/controller에서 확인했다.
- 최종 production localhost3025의 [보관함/권한 안내37](ui-verified/checks.json), [연결23](connection-verified/checks.json), [덮어쓰기38](overwrite-verified/checks.json), [복사26](copy-verified/checks.json), [계획37](plan-verified/checks.json), 합계161검사 통과. 실제 OPFS/Worker/stream/재읽기, 합성 picker/권한·CDP 입력이며 개인 파일을 사용하지 않았다.
- 기록 목록에서 payload 읽기0, 상세에서 현재 hash 검사, 손상 뒤 이전 정상 표시 제거, 보관본 정상·목적지 기록 부재의 확인 필요, 상세 취소의 늦은 결과 폐기,10회 열기/Tab/Escape·초점 복귀를 확인했다. 설정의 중첩 dialog Escape는 연결 설정을 유지한다. 추가 권한 요청/쓰기/삭제0과 source/target 불변을 별도로 검사했다.
- [권한 안내390](ui-verified/permission-guide-390.png)/[1440](ui-verified/permission-guide-1440.png), [보관함390](ui-verified/archive-390.png)/[768](ui-verified/archive-768.png)/[1440](ui-verified/archive-1440.png)/[1920](ui-verified/archive-1920.png), [손상 상태](ui-verified/archive-damaged.png). 초기 캡처의 transition 진행 중 반투명 이미지는 test에서 animation.finished를 기다리도록 고쳤다. 제품에 지연을 추가하지 않았다.
- 사이트 전체36표본/자산 비용/목록·상세1회 시간은 [성능](performance.md)을 따른다. 초기 측정의 권한 안내 삽입으로 생긴 CLS를 발견해 처음부터 렌더링하도록 수정하고 새 빌드를 재측정했다.

| 경계 | 실행한 사례 |
| --- | --- |
| 목록 | payload 읽기0, 한글·빈 파일 metadata, 앱 overwrite 폴더/임의 파일 제외, 없음·부분 목록 표시 |
| 외부 JSON | 잘못된 JSON·다른 owner·1MiB 초과 → 신뢰하지 않는 항목, payload 읽기0;100작업/8MiB 읽기 한도 → 일부 목록 |
| 상세 | 누락·크기/해시 불일치·동일 size/mtime의 다른 bytes, 빈 payload, 양쪽 기록 부재/불완전·준비 기록 변경 |
| 경쟁/취소 | 작업 폴더 교체·마지막 hash 중 기록 손상·owner 변경·임의 id/경로 → 정상 금지; 닫기/새로고침/취소 뒤 늦은 결과 폐기 |
| 부작용 | queryPermission(read)만 사용, 권한 요청/폴더·파일 생성/쓰기/삭제0; 원본/현재 목적지 본문은 검사 대상이 아님 |

데이터는 직접 만든 합성 FS/OPFS core다. 임의 생성/holdout/외부 벤치마크가 아니며 파일 수와 테스트 수를 구별한다. Vitest는 실제 서비스/스키마/SHA-256를 fixture FS로 실행하고 브라우저는 OPFS/Worker까지 검증한다. 네이티브 Windows picker/권한창·개인 디스크·외부 프로그램 경쟁·물리IME/실물 모바일·field INP/대규모 peak memory는 미검증이다.

## 화면과 구조

기존 중립색·버튼·간격·dialog·평면 행·StatusNotice를 재사용했다. 읽는 순서는 권한 안내→폴더 연결, 보관함 이름→목록→metadata→확인 행동→현재 결과다.4폭에서 긴 이름과 경로의 줄바꿈, 상태/용량·시각 구분, 모바일의 확인/취소 행동을 직접 확인했다. 안내를 위해 추가 승인 팝업을 만들지 않았고 기존 picker/쓰기 요청은 사용자 클릭에서 바로 시작한다. 승인된 채팅 화면을 바꾸거나 새 의존성을 추가하지 않았다.

`RecoveryArchiveDialog/View`(표시·초점)→`RecoveryArchiveController`(읽기/취소 수명)→session(내부 snapshot/id·source/recovery/owner 세대)→`recovery-archive`(목록·payload/기록 검사)→`recovery-archive-records`(제한된 strict UTF-8/JSON·identity·재읽기). lib에는 DTO와 한도를 둔다. 기존 Zod 백업 스키마를 재사용해 검증 규칙을 복제하지 않았다. 핸들/본문/미검증 raw JSON은 UI로 반환하지 않는다.

목록 한도는 보관함 루트500항목/백업 작업100/표시500개, JSON 파일당1MiB·읽기8MiB, payload16MiB다. 초과는 일부임을 표시한다. 정상 판정은 검사 시점의 관측이며 계속 감시/원자적 snapshot/복원 승인으로 쓰지 않는다. 손상 기록을 자동 수정하거나 파일을 삭제하지 않는다. 복구 항목은 payload가 있는 백업 단위이며 overwrite 작업 JSON을 복구 파일로 중복 표시하지 않는다.

## 실제 허용창과 앱 안내

브라우저가 실제 picker/permission prompt를 표시하고 쓰기 권한은 사용자 제스처에서 요청한다. 앱의 HTML/CSS로 그 브라우저 창을 대체하지 않는다. 사이트 안의 `FolderPermissionGuide`만 디자인했다. [Chrome 공식 security/permissions](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access#security_and_permissions). 네이티브 창의 실제 appearance/승인은 이번 합성 권한 테스트의 근거가 아니다.

요구사항은 외부 원장47~48, 짧은 오류 기록은 `E:/memory/chatbotfolder/Requirements/오류_정리.md`, 상세 원인/근거/한계는 memory/HANDOFF 최신 절에 둔다. commit/PR/배포는 하지 않았다.
