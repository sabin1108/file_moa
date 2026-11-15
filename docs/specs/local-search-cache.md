# 로컬 검색 캐시 갱신 — 2026-11-15

검색 개선 2단계. 기존 `moa-local-text-index-v1`의 `documents`와 `stats`를 사용한다. 새 DB나 서버 전송을 만들지 않는다. 이름/경로/본문 검색과 순위는 [검색 명세](document-find.md)를 유지한다.

- CACHE-001: 파일을 읽기 전·후 현재 권한과 세대를 확인한다. 캐시가 있어도 원본 바이트를 읽고 SHA-256을 계산한다. size/mtime만으로 본문을 재사용하지 않는다.
- CACHE-002: owner/workspace/connection/path와 parser version으로 저장·조회한다. 새로 계산한 hash, 형식, 추출 설정과 유효한 metadata가 일치할 때만 decode/PDF/OCR 추출을 생략한다. OCR 동의 설정 변경은 PDF/이미지 캐시를 무효화한다. 이전 metadata 없는 항목은 재추출한다.
- CACHE-003: 같은 항목에 관측한 size/mtime, 형식, OCR 설정, PDF/OCR 페이지 수와 완전 여부를 보관한다. 부분 추출을 전체 추출로 올리지 않는다. 이는 성공적으로 읽은 본문의 제한된 catalog이며 미지원 형식까지 포괄하는 전체 폴더 catalog는 후속이다.
- CACHE-004: 재사용한 본문에서도 현재 질문의 발췌·발췌 hash·검색 조건을 새로 계산한다. 캐시를 현재 질문의 답변이나 전송 동의로 취급하지 않는다. 수정된 파일의 같은 size/mtime도 hash가 다르면 다시 추출한다.
- CACHE-005: 캐시는 재생성 가능한 파생 자료다. 기존 500개/본문 UTF-16 추정50MiB 한도를 유지하고 초과 쓰기는 원자적으로 거부한다. 자동 eviction은 하지 않는다. 전체 범위 탐색이 실패·한도·취소 없이 끝난 경우에만 누락 본문을 제거한다. 부분 탐색/권한 상실/설정 변경으로 원본이나 AI 기록을 지우지 않는다.
- CACHE-006: IndexedDB 쓰기는 같은 documents/stats readwrite transaction에서 처리해 다중 탭 한도를 직렬화한다. scope 밖 항목을 지우지 않는다. versionchange는 연결을 닫고, blocked로 거부된 open이 나중에 성공하면 그 연결도 닫는다. DB 사용 실패 시 원본 읽기를 계속한다.
- 저장 행과 통계는 형태·유한한 정수·식별자를 검증한다. 손상 항목은 재사용하지 않고, 잘못된 통계를 이용한 쓰기는 중단한다. 전체 탐색 완료 뒤 파생 항목 정리에서 손상 행을 제거하고 통계를 재생성한다. 같은 origin의 코드가 본문과 hash를 함께 바꾸는 공격을 인증하는 저장소는 아니며, 별도 본문 checksum은 이번에 추가하지 않는다.
- CACHE-007: 측정은 합성 자료의 bytes/read/hash/decode/PDF 추출/IDB read·write를 나누어 기록한다. cold/warm cache와 Worker 시작을 구별한다. 캐시가 디스크 읽기를 제거하거나 자연어 검색 품질을 높였다고 주장하지 않는다.

실행 순서: 기존 소스의 기준선 측정 → 실패 테스트 → 본문 캐시·metadata 최소 보강 → 관련 회귀/실제 Worker·IndexedDB → 타입·린트·경계·빌드. 별도 reviewer가 실제 변경의 안전 경계를 검토한다. 라이브러리/모델/원격 해석/서버 DB/시각 디자인 변경은 포함하지 않는다.
