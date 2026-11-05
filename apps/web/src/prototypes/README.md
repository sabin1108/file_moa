# 시안과 합성 예시

`/preview` 아래에서 보여주는 합성 데이터와 미구현 동작의 시안이다. auth/files/settings/demo와 prototype-data/library-data를 이 영역에 둔다.

`feedback`의 TaskProgress/StartupState/LoadingRegion/FileIssueList/AnswerStatus는 현재 시안에서만 사용한다. 향후 실제 소비자가 생기면 입력 계약과 책임을 검토해 공통으로 이동한다. 지금 제품 기능이 완료됐다는 뜻은 아니다.

공통 표시와 스타일은 shared를 직접 import한다. 실제 컴포넌트를 시연할 때는 features를 사용할 수 있으나 실제 기능이 이 폴더를 역으로 가져오지는 않는다. PreviewButton은 비활성 시안 버튼이고 실제 작업 버튼으로 사용하지 않는다.
