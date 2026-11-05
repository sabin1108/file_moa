# S0 로컬 기록 형식 v1

2026-10-25. [승인된 보관 범위](local-ai-storage.md)의 기술 검증용 세부 명세. 제품 연결 전이며 사용자별 암호화·완전한 이력 삭제·백업 병합은 이번 검증 밖이다.

## 저장 단위

하나의 기록 아래 `revisionId.md`에 UTF-8 본문, `revisionId.json`에 메타데이터를 쓴다. 각 수정은 새 revision ID를 사용한다. 본문 쓰기와 close가 끝난 뒤 JSON을 마지막에 게시한다. JSON이 없는 본문은 미완료 파일로 취급한다. 이전 버전은 덮어쓰지 않는다.

메타데이터: `schemaVersion: 1`, `recordId`, `revisionId`, `parentRevisionId`(최초 null), `kind`(conversation/memory/artifact/operation), `scope`({type: global/project/task, 프로젝트·작업이면 id}), `state`, `createdAt`(UTC ISO), `contentFile`(revisionId.md), `contentSha256`(본문 UTF-8 SHA-256).

ID는 소문자 영숫자로 시작하는 최대 64자 영숫자·하이픈이며 Windows 예약 이름은 거부한다. 상대 경로·절대 경로·슬래시를 받지 않는다. 알려지지 않은 필드와 형식 버전은 거부한다. 비밀키 등 임의 필드를 기록에 실어 보내지 않는다. 본문에 사용자가 입력한 비밀정보까지 자동 탐지하는 계약은 아니다.

기억은 proposed/approved/inactive 상태와 global/project 범위만 허용한다. 현재 프로젝트에 적용되는 승인 기억만 사용한다. 나머지 기록은 draft/final 상태다. 일회성 지시는 대화/작업 안에 남으며 지속 기억으로 자동 저장하지 않는다.

## 일관성과 한계

- 저장 전 현재 끝 버전과 호출자가 읽은 버전을 비교한다. 버전 그래프가 갈라지거나, 부모가 없거나, 본문 hash가 다르면 충돌/손상으로 멈춘다.
- 같은 origin의 참여 탭은 Web Locks로 직렬화하고 파일 스트림은 exclusive 모드를 요청한다. 두 방법 모두 다른 프로그램·다른 origin에 대한 전역 트랜잭션 보장은 아니다.
- 불변 버전으로 이전 내용을 보존하고 읽을 때 hash/부모 관계를 검증한다. 외부 변경과 검사 사이의 경쟁을 완전히 없앴다고 주장하지 않는다.
- S0는 기록당 최대 100개 게시 버전, 본문당 2MiB, 메타데이터당 16KiB로 제한한다. 측정용 상한이며 최종 보존 정책이 아니다.
- 임시 대화는 저장소 함수를 호출하지 않는다. 이 정책의 제품 UI 연결과 계정 격리는 후속 통합 검증이다.
- 영구 폴더 선택·권한 철회는 네이티브 picker로 별도 확인한다. OPFS 테스트를 실제 사용자 폴더 권한 검증으로 보고하지 않는다.
- JSON close 중 실패로 불완전 메타데이터가 남으면 저장소 읽기를 중단하고 이전 버전을 보존한다. 자동 복구·미완료 파일 정리는 미구현이다. [1차 검증 결과](../verification/s0/README.md)의 한계를 따른다.

## 첫 검증

순수 규칙: 정상 메타데이터, 형식 버전, 경로 탈출, 잘못된 hash/날짜, 추가 필드, 승인 기억·프로젝트 격리.
실제 Chromium API: 본문/메타데이터 저장·재읽기, 수정 버전 보존, 오래된 버전 거부, 미완료 본문 무시, 본문 변조 감지, 두 저장 경쟁, exclusive 스트림, IndexedDB handle 복원.
장애 주입: 본문·메타데이터 쓰기 실패가 성공으로 표시되지 않으며 이전 게시 버전이 유지되는지 확인한다.

참고: [File System Access](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access), [쓰기 표준](https://fs.spec.whatwg.org/#api-filesystemfilehandle-createwritable), [권한 복원](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api).
