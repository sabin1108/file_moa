# 설정 표시 데이터 재사용

## 문제와 범위

설정 page는 로그인 수단과 계정 연결 DB 조회를 모두 기다린 뒤 모든 탭을 반환했다. 사용자는 로그인 직후 준비 시간을 지불하더라도 설정을 열 때 같은 표시 자료를 다시 기다리지 않는 흐름을 요청했다.

이번 기능은 원본 인증 캐시를 교체하는 작업이 아니다. 토큰 없는 설정 표시 DTO를 Next Data Cache에 사용자별로 보관하고, 인증된 작업 공간의 초기 진입에서 준비한다. 앞선 인증 refactor 계획의 실패·미완료 상태와 독립된, 사용자가 범위를 확정한 기능 추가다. 이전 Architect 검토나 실패한 Critic를 구현 승인으로 사용하지 않는다.

## 계약

- SC-001: 요청마다 세션을 확인한 뒤 서버에서 확정한 사용자만 조회한다. 클라이언트 userId를 권한으로 받지 않는다.
- SC-002: cache 결과는 기존 AccountLoginSettings와 WorkspaceConnection만 포함한다. 비밀번호, 세션, 쿠키, 토큰, IP, 원본 SDK 객체를 저장하지 않는다. cache key는 사용자 ID와 로그인 세션 ID의 SHA-256 구분값으로 만든다. 원본 세션 ID·이메일·토큰을 key/tag에 넣지 않는다. 새 로그인은 이전 연결 자료를 재사용하지 않는다.
- SC-003: 작업 공간 layout에서 동일 reader를 한 번 준비하고 설정 page에서 재사용한다. 초기 준비 실패가 채팅·폴더 진입을 막지 않는다. 설정 조회 자체의 실패는 성공 자료로 바꾸지 않는다.
- SC-004: 사용자별 tag와 연결 자료 tag를 사용한다. 로그인/로그아웃/로그인 수단 변경은 사용자 tag, 프로필·계정 연결·기본 공간 변경·연결 해제는 연결 tag를 즉시 만료한다. 연결 tag는 현재 개인 앱 규모에서 관계의 양쪽 사용자 무효화를 놓치지 않는 보수적인 범위다.
- SC-005: 60초 재검증을 보조 수단으로 둔다. 이는 stale-while-revalidate이며 정확한 최대 신선도 보장이 아니다. 실패한 캐시 갱신은 인증 성공·변경 commit을 뒤집지 않으며 민감 내용 없이 진단한다. 실행 권한은 표시 캐시와 무관하게 fresh 검사한다. 연결 관련 SQL은 양쪽의 세션을 폐기하며, fresh 인증과 로그인별 key가 이전 연결 자료의 재노출을 막는다.
- SC-006: 브라우저 폴더 핸들·IndexedDB·localStorage·채팅 초안은 기존 소유권과 수명을 유지한다. 전역 Cache Components와 route의 Activity/Suspense 정책을 바꾸지 않는다.

## 기술 선택

현재 Next 16.4.3은 Cache Components를 사용하지 않는다. 이 모델에서 DB 같은 non-fetch 결과의 요청 간 재사용을 지원하는 Next의 unstable_cache를 사용한다. 새 메모리 캐시나 외부 서비스를 만들지 않는다. 현재 React cache는 렌더 안 중복 방지용으로 유지하고, 표시 데이터의 요청 간 재사용을 대신한다고 설명하지 않는다.

use cache가 장기 방향이지만 전역 Cache Components 전환의 UI 수명 변경은 이번 DTO 기능의 범위보다 크다. 후속 전역 도입 시 표시 DTO와 tag 경계를 유지하며 옮길 수 있다.

근거: https://nextjs.org/docs/app/api-reference/functions/unstable_cache , https://nextjs.org/docs/app/api-reference/functions/revalidateTag

## 검증과 설명

인증 거부 시 DB/cache 접근 0, 준비 후 다른 요청에서 표시 DB 호출 재사용, 사용자 간 분리, DTO 민감 필드 없음, 변경별 tag 무효화, 준비 실패/DB 오류, 기존 AI fresh 검사 회귀를 확인한다. Next 실제 Data Cache API 검증과 mock 기반 경계 검사를 구분한다. DB 호출 감소를 실제 사용자의 지연·비용 절감 수치로 바꾸어 보고하지 않는다.
