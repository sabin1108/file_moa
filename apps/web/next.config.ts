import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@personal-ai/domain"],
  outputFileTracingIncludes: { "/*": ["./prisma/certs/supabase-prod-ca-2021.crt"] },
  async headers() {
    return ["/verify-email", "/reset-password", "/account"].map(source => ({
      source, headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }],
    }));
  },
};
export default config;

