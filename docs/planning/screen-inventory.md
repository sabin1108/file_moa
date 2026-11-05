# 현재 화면과 기능 연결 상태

2026-10-25. 사용자가 현재 시안 전체를 기능 개발 기준으로 승인했다. 아래는 표시·예시 전환의 존재를 뜻하며 실제 기능 완료를 뜻하지 않는다. [최종 캡처](../prototype/README.md)와 실제 scene-data.ts가 화면 목록의 기준이다.

## 주요 페이지

| 경로 | 현재 시안 | 실제 연결 시 필요한 일 |
| --- | --- | --- |
| `/` | 대화·최근 기록·입력창 | 실제 전송/스트림/중지/기록, IME, 단절·재시도 |
| `/files` | 폴더 보드·선택 예시·정리 계획·최근 작업 | 폴더 접근/탐색/검색/다중 선택, 원본 보호, 실제 목적지 탐색 |
| `/login` | Google/Naver/Kakao 진입 | 제공자 인증, 실패/취소/계정 연결, 세션 |
| `/welcome` | 첫 가입 안내 | 확정 동의·프로필·복귀 경로 |
| `/settings` | 기본/연결/데이터 탭 | 실제 계정/AI 폴더 연결/저장 설정/사용량/삭제 |
| `/preview` | 아래 27개 상태 모음 | 개발용 예시 목록 |

## 27개 상태 시안

| 그룹 | scene ID |
| --- | --- |
| 접속·작업 피드백 | startup, content-loading, answer-progress, action-feedback, session-recovery, file-issues |
| 폴더 연결 | connect, connected, permission |
| 문서·자료 | document, transfer, indexing |
| 파일 정리 | destination, conflict, move-progress, move-result, move-skipped, move-partial, copy-result |
| 검색·빈 상태·오류 | search, empty, error, login-error |
| 계정·데이터 | export, export-ready, delete-confirm, deleted |

각 경로는 `/preview/<scene ID>`이며 파일 화면의 관련 버튼은 공통 dialog에서도 같은 표시 계층을 사용한다. 샘플 목적지·선택 파일·수동 상태 전환과 실제 동작을 구분한다.

## 구현하면서 보완할 상태

실제 네이티브 권한·계정 전환·로그인 진행, AI 폴더 저장/불완전 게시 복구, PDF 파싱 오류/미지원, 원본 이동 취소·부분 실패·복구, 색인 재시도, 내보내기 실패는 실제 기능 명세에 맞춰 연결한다. 관련 시안이 존재해도 해당 실패 처리 구현을 대신하지 않는다.

원본 읽기와 외부 전송 동의, AI 기록 저장과 원본 쓰기를 구분한다. 초기 읽기 기능에서 실제 원본 쓰기 작업을 노출하지 않는다. 같은 이메일만으로 소셜 계정을 자동 병합하지 않는다.

작업 맥락을 떠나야 하면 페이지, 현재 대상/선택을 바꾸면 dialog, 원문/상세/진행은 보조 패널로 한다. 같은 왼쪽 장식 패널을 모든 화면에 복제하지 않는다. 작은 회색 문구·배지·설명을 과도하게 늘리지 않는다.

[로컬 저장 계약](../specs/local-ai-storage.md), [복구 계약](../specs/local-record-recovery.md), [구현 순서](../roadmap.md)를 함께 따른다. 원형 메뉴·성장·고급 시각화는 후속이다.
