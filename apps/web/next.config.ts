import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@personal-ai/domain"],
  outputFileTracingIncludes: { "/*": ["./prisma/certs/supabase-prod-ca-2021.crt"] },
  async headers() {
    return ["/login", "/welcome", "/social-signup", "/forgot-password", "/verify-email", "/reset-password", "/delete-account", "/account", "/", "/files", "/settings", "/preview/:path*"].map(source => ({
      source, headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }],
    }));
  },
};
export default config;

