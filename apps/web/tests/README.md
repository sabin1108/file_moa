# 웹 기능 단위 테스트

제품 구현과 별도 보관한다. local-folders/services는 연결/읽기 경계, local-folders/store는 상태·취소·선택 수명을 검증한다. 실제 구현은 ../src/features/local-folders이며 테스트가 그 코드를 import한다.

저장소 루트에서 pnpm test를 실행한다. 전체 검증/브라우저 검사는 [루트 tests 안내](../../../tests/README.md)를 따른다. 제품 src에는 *.test.* 또는 테스트 도구 import를 추가하지 않는다.
