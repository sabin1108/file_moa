# 공통 컴포넌트

layout은 여러 실제 경로의 공통 프레임(WorkspaceShell), ui는 실제 재사용하는 표시(ActionLink, Icon, SettingRow, StatusLabel, feedback)다. 업무 상태·파일 접근·합성 자료는 여기 두지 않는다.

기능 전용 연결 dialog/파일 행은 features/local-folders/components에 둔다. 사용처가 하나인 화면을 모양만 보고 공통 modal 프레임워크로 만들지 않는다. 같은 공통 컴포넌트를 시안에서도 사용할 수 있지만 공통 컴포넌트가 prototypes를 역으로 import하지 않는다.

공통 토큰/작업면 CSS는 ../styles, 단일 표시 전용 CSS는 해당 컴포넌트 가까이에 있다. [전체 구조](../README.md).
