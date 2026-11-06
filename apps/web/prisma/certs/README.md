# Supabase 공개 CA

`supabase-prod-ca-2021.crt`는 개인 키나 접속 비밀값이 아닌 공개 신뢰 인증서다.

- 출처: https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
- 위 경로는 Supabase Studio의 [공식 다운로드 템플릿](https://github.com/supabase/supabase/blob/d421451672fc8b51ca31b86539a258f0f5172043/apps/studio/hooks/custom-content/custom-content.json#L63)에서 확인했다.
- SHA-256 지문: `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`
- 유효기간 종료: 2031-04-26 10:56:53 UTC. 확인일: 2026-11-05.

공식 HTTPS 경로에서 한 번 받아 검토한 파일을 사용한다. 연결 때마다 원격 인증서를 받아 신뢰하거나 인증서 검증을 끄는 방식을 사용하지 않는다. Supabase가 CA를 교체하면 Dashboard/공식 문서를 확인하고 갱신한다.

CLI의 Prisma migration은 `sslmode=require`, `sslaccept=strict`, 이 CA의 `sslcert` 경로를 사용한다. libpq 검증은 `sslmode=verify-full`과 `sslrootcert`를 사용한다. 앱의 Prisma PostgreSQL driver adapter를 연결할 때도 CA 로드·호스트 검증을 설정하고 Vercel 배포에 인증서가 포함되는지 검증해야 한다.

클라이언트→pooler TLS 검증과 pooler→DB의 `pg_stat_ssl` 상태는 서로 다른 구간이다. Supabase의 [SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement) 설정은 별도로 확인한다. 이번 작업에서는 그 설정을 임의 변경하거나 DB를 재시작하지 않는다.
