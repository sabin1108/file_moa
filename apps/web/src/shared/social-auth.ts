export const socialProviders = ["google", "naver", "kakao"] as const;
export type SocialProvider = typeof socialProviders[number];
export const socialLabels: Record<SocialProvider, string> = { google: "Google", naver: "네이버", kakao: "카카오" };
