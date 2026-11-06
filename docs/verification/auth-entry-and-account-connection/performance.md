# 인증된 경로의 변경 전후 lab 기록

- 이전 build: 0wDIHKitQN9wDk_MQnrU3; 이번 build: NvAgUAOffvcL3IlDS_ySI. 각각 6경로×2폭×3회=36표본이다.
- 조건: Windows isolated Chromium; production build; disposable local SQL with verified TLS; authenticated synthetic account and empty OPFS folder; HTTP cache disabled; 350ms post-load observation; no CPU/network throttling; three samples per route and width; lab LCP/CLS, no field INP or real-disk claim. 각 표본 350ms 관측. 새 그룹을 연결하기 전의 동일한 합성 이메일 사용자다.
- 아래 LCP/전송량은 세 표본 중앙값, CLS는 최대값이다. 다른 실행 시각·시스템 부하를 통제하지 않았으며 표본3개로 p95나 인과적 개선율을 주장하지 않는다. 전송량은 그 경로 관측 자원 합계다.

| 폭px | 경로 | 이전 LCP ms | 이번 LCP ms | 이번 전송 KiB | CLS 최대 |
| --- | --- | ---: | ---: | ---: | ---: |
| 390 | `/` | 52 | 60 | 245 | 0.0000 |
| 390 | `/files` | 60 | 52 | 284 | 0.0082 |
| 390 | `/settings?tab=account` | 48 | 56 | 269 | 0.0000 |
| 390 | `/settings?tab=folders` | 52 | 60 | 269 | 0.0350 |
| 390 | `/settings?tab=editor` | 52 | 56 | 269 | 0.0000 |
| 390 | `/account` | 44 | 48 | 211 | 0.0000 |
| 1440 | `/` | 48 | 52 | 245 | 0.0000 |
| 1440 | `/files` | 56 | 64 | 284 | 0.0016 |
| 1440 | `/settings?tab=account` | 56 | 52 | 269 | 0.0000 |
| 1440 | `/settings?tab=folders` | 52 | 56 | 269 | 0.0192 |
| 1440 | `/settings?tab=editor` | 56 | 56 | 269 | 0.0000 |
| 1440 | `/account` | 40 | 48 | 211 | 0.0000 |

새 로딩은 대기를 설명하며 임의 시간을 추가하지 않는다. 실제 응답 보류 중 조용한 재검증/차단 로딩과 밑줄의 중간 프레임은 기능 검사로 별도 확인했다. 실제 Vercel 사용자 INP·연결 그룹에서의 부하·OS 폴더 지연·메일 수신 속도는 이 측정으로 대표하지 않는다. 원자료: [이번](browser/performance-authenticated.json), [이전](../auth-social-settings/browser/performance-authenticated.json).

추가 관측: 전역 app/loading.tsx를 둔 중간 버전에서 메인 LCP 중앙값은390px 340ms/1440px 340ms였다. 전역 경계를 제거하고 NavigationProgress가 실제 Link pending에만 공유 로딩을 표시하도록 한 최종 버전은 각각60ms/52ms다. 원래 화면을 유지하고 응답이 준비된 뒤 즉시 전환하며 로딩 표시를 위한 지연을 추가하지 않는다. 이는 같은 lab 구성의 서로 다른 실행 관측이며 단독 인과 효과나 field 개선율로 일반화하지 않는다. [중간 버전 원자료](browser/performance-with-root-boundary.json).
