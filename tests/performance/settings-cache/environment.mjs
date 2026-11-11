export function measurementEnvironment(source) {
  const allowed = [
    "PATH", "Path", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA",
    "DATABASE_URL", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET",
    "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET", "KAKAO_CLIENT_ID", "KAKAO_CLIENT_SECRET",
  ];

  return {
    ...Object.fromEntries(allowed.filter(name => source[name] !== undefined).map(name => [name, source[name]])),
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    RESEND_API_KEY: "disabled-for-settings-measurement",
    EMAIL_FROM: "Moa <measurement@example.invalid>",
  };
}
