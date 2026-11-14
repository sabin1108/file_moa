# 웹 기능 단위 테스트

제품 구현과 분리하며 기능별 하위 책임은 src와 같은 이름으로 찾는다. local-folders의 connection/browsing/documents/content/operations/recovery/organization 등은 해당 기능의 화면·상태·규칙·파일 접근을 검증한다. auth와 server도 form/session 및 auth/chat/ai/demo/organization/settings 등 실제 책임별로 분류한다.

여러 기능의 연결 자체를 검증하는 사례는 integration에, 공통 표시와 규칙은 ui/shared에 둔다. 모든 테스트를 integration으로 모으지 않는다. browser-fixtures는 합성 환경이며 제품에서 import하지 않는다.

저장소 루트에서 pnpm test를 실행한다. 실제 DB·메일·유료 AI의 opt-in checks는 기본 단위 테스트와 구분한다. [전체 검증 안내](../../../tests/README.md), [제품 읽기 순서](../src/README.md)를 따른다.
