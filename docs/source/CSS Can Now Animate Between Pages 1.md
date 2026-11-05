---
tags:
  - 개발/CSS
  - 웹디자인/애니메이션
  - 영상노트
source: https://www.youtube.com/watch?v=XH1G58QqPIM
channel: Coding2GO
reviewed-date: 2026-06-05
---


> [!summary] 요약
> 자바스크립트나 복잡한 프레임워크(SPA) 없이, 순수 CSS의 **View Transitions API**만으로 별도의 HTML 페이지 간에 부드러운 화면 전환 효과를 구현하는 방법을 다룬 영상입니다.

---

## 📌 주요 내용 및 타임스탬프

### 1. 기본 페이지 전환 설정 (Crossfade) `[00:00:12]`
* `@view-transition` 규칙에 `navigation: auto;`를 적용하면 페이지 이동 시 기본 페이드 효과가 발동함.
* **조건:** 두 페이지가 같은 도메인에 있어야 하며, 동일한 CSS 파일을 공유해야 함.

### 2. 커스텀 애니메이션 (슬라이드 효과) `[00:00:46]`
* 세 가지 주요 가상 요소(Pseudo-element)를 활용해 Keyframe 애니메이션을 매핑할 수 있음:
	* `::view-transition-group(root)`: 전환 효과 전체를 감싸는 래퍼 (지속 시간, 타이밍 설정).
	* `::view-transition-old(root)`: 화면에서 사라지는 이전 페이지 snapshot.
	* `::view-transition-new(root)`: 화면에 나타나는 새 페이지 snapshot.

### 3. 특정 요소만 애니메이션 제외/지정 `[00:02:44]`
* 페이지 전체(`root`)가 아닌 특정 레이아웃(예: 네비게이션 바)을 고정하고 본문만 바꾸고 싶을 때 사용.
* 대상 요소에 `view-transition-name: page-content;`와 같이 고유 이름을 부여하여 개별 제어 가능.

### 4. 공유 이미지 전환 (Shared Image Transitions) `[00:03:37]`
* 이전 페이지의 썸네일과 다음 페이지의 메인 헤더 이미지처럼 공통된 요소에 동일한 `view-transition-name`을 주면, 크기와 위치가 자동으로 계산되면서 스르륵 확대/축소되는 고급 효과가 연출됨.

---

> [!warning] ⚠️ 실무 적용 시 고려해야 할 3가지 `[00:04:42]`
> 1. **이름의 고유성:** `view-transition-name`은 한 화면 내에서 중복되면 안 됨 (여러 카드가 있다면 각각 다른 이름을 동적으로 매핑해야 함).
> 2. **웹 접근성:** 애니메이션을 기피하는 사용자를 위해 반드시 `@media (prefers-reduced-motion: no-preference)` 쿼리 안에서 전환 효과를 정의할 것.
> 3. **브라우저 호환성:** 크롬, 엣지, 사파리는 지원하지만 파이어폭스는 미지원. 따라서 지원되지 않아도 페이지가 정상 작동하는 **점진적 향상(Progressive Enhancement)** 방식으로 접근해야 함.